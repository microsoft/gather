import { IDisposable, DisposableDelegate } from '@phosphor/disposable';
import { JupyterLab, JupyterLabPlugin } from '@jupyterlab/application';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { NotebookPanel, INotebookModel, Notebook, INotebookTracker } from '@jupyterlab/notebook';
import { IObservableList } from '@jupyterlab/observables';
import { ICellModel, CodeCell } from '@jupyterlab/cells';
import { IClientSession, ICommandPalette } from '@jupyterlab/apputils';
import { IDocumentManager } from '@jupyterlab/docmanager';

import * as python3 from './parsers/python/python3';
import { ILocation } from './parsers/python/python_parser';
import { ControlFlowGraph } from './ControlFlowGraph';
import { dataflowAnalysis } from './DataflowAnalysis';
import { NumberSet, range } from './Set';
import { ToolbarCheckbox } from './ToolboxCheckbox';


const extension: JupyterLabPlugin<void> = {
    activate: activateExtension,
    id: 'live-code-cells:liveCodePlugin',
    requires: [ICommandPalette, INotebookTracker, IDocumentManager],
    autoStart: true
};


function showStaleness(cell: CodeCell, stale: boolean) {
    cell.inputArea.editorWidget.node.style.backgroundColor = stale ? 'pink' : null;
}

enum DataflowDirection { Forward, Backward };



class CellProgram {
    private code: string;
    private changedCellLineNumbers: [number, number];
    private cellByLine: ICellModel[] = [];

    constructor(changedCell: ICellModel, cells: IObservableList<ICellModel>) {
        this.code = '';
        let lineNumber = 1;
        for (let i = 0; i < cells.length; i++) {
            const cell = cells.get(i);
            const cellText = cell.value.text;
            this.code += cellText + '\n';
            const lineCount = cellText.split('\n').length;
            for (let lc = 0; lc < lineCount; lc++) {
                this.cellByLine[lc + lineNumber] = cell;
            }
            if (cell.id === changedCell.id) {
                this.changedCellLineNumbers = [lineNumber, lineNumber + lineCount - 1];
            }
            lineNumber += lineCount;
        }
    }

    private followDataflow(direction: DataflowDirection): NumberSet {
        const ast = python3.parse(this.code);
        const cfg = new ControlFlowGraph(ast);
        const dfa = dataflowAnalysis(cfg);

        const forwardDirection = direction === DataflowDirection.Forward;
        let changedLineNumbers = new NumberSet();
        const [startLine, endLine] = this.changedCellLineNumbers;
        for (let line = startLine; line <= endLine; line++) {
            changedLineNumbers.add(line);
        }

        let lastSize: number;
        do {
            lastSize = changedLineNumbers.size;
            for (let flow of dfa.items) {
                const fromLines = lineRange(flow.fromNode.location);
                const toLines = lineRange(flow.toNode.location);
                const startLines = forwardDirection ? fromLines : toLines;
                const endLines = forwardDirection ? toLines : fromLines;
                if (!changedLineNumbers.intersect(startLines).empty) {
                    changedLineNumbers = changedLineNumbers.union(endLines);
                }
            }
        } while (changedLineNumbers.size > lastSize);

        return changedLineNumbers;
    }

    public forwardDataflow(): ICellModel[] {
        const changedLineNumbers = this.followDataflow(DataflowDirection.Forward);
        const changedCells: ICellModel[] = [];
        for (let line of changedLineNumbers.items.sort((line1, line2) => line1 - line2)) {
            if (this.cellByLine[line] !== changedCells[changedCells.length - 1]) {
                changedCells.push(this.cellByLine[line]);
            }
        }
        return changedCells;
    }

    public backwardDataflow(): ICellModel[] {
        const changedLineNumbers = this.followDataflow(DataflowDirection.Backward);
        const changedCells: ICellModel[] = [];
        for (let line of changedLineNumbers.items.sort((line1, line2) => line1 - line2)) {
            if (this.cellByLine[line] !== changedCells[changedCells.length - 1]) {
                changedCells.push(this.cellByLine[line]);
            }
        }
        return changedCells;
    }
}



class CellLiveness {

    private currentlyExecutingCells = false;

    constructor(
        private checkbox: ToolbarCheckbox
    ) {
    }

    private findStaleCells(changedCell: ICellModel, cells: IObservableList<ICellModel>): ICellModel[] {
        const program = new CellProgram(changedCell, cells);
        return program.forwardDataflow();
    }

    public onCellsChanged(
        notebook: Notebook,
        session: IClientSession,
        allCells: IObservableList<ICellModel>,
        cellListChange: IObservableList.IChangedArgs<ICellModel>
    ): void {
        if (cellListChange.type === 'add') {
            const cell = cellListChange.newValues[0] as ICellModel;
            // When a cell is added, register for its state changes.
            cell.stateChanged.connect((changedCell, cellStateChange) => {
                // If cell has been executed
                if (cellStateChange.name === 'executionCount' && cellStateChange.newValue) {
                    const codeCell = notebook.widgets.find(c => c.model.id === cell.id) as CodeCell;
                    showStaleness(codeCell, false);

                    // If this cell executing is due to the user
                    if (!this.currentlyExecutingCells) {
                        // Depending on the checkbox, we either execute the dependent cells
                        // or show that they are stale.
                        const handleStaleness: (cell: CodeCell) => Promise<any> = this.checkbox.checked ?
                            cellWidget => CodeCell.execute(cellWidget, session) :
                            cellWidget => {
                                showStaleness(cellWidget, true);
                                return Promise.resolve(0);
                            }

                        const tasks = this.findStaleCells(changedCell, allCells)
                            .filter(cell => cell.id !== changedCell.id)
                            .map(cell => <CodeCell>notebook.widgets.find(c => c.model.id == cell.id))
                            .filter(cellWidget => cellWidget)
                            .map(cellWidget => () => handleStaleness(cellWidget));

                        this.currentlyExecutingCells = true;
                        doTasksInOrder(tasks).then(() => {
                            this.currentlyExecutingCells = false;
                        });
                    }
                }
            }, this);
        }
    }

}


export class LiveCheckboxExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {

    createNew(panel: NotebookPanel, context: DocumentRegistry.IContext<INotebookModel>): IDisposable {
        const checkbox = new ToolbarCheckbox(panel.notebook);
        panel.toolbar.insertItem(9, 'liveCode', checkbox);
        const liveness = new CellLiveness(checkbox);

        panel.notebook.model.cells.changed.connect(
            (cells, value) =>
                liveness.onCellsChanged(panel.notebook, panel.session, cells, value),
            liveness);

        return new DisposableDelegate(() => {
            checkbox.dispose();
        });
    }
}



function activateExtension(app: JupyterLab, palette: ICommandPalette, notebooks: INotebookTracker, docManager: IDocumentManager) {
    console.log('livecells start');
    app.docRegistry.addWidgetExtension('Notebook', new LiveCheckboxExtension());

    function addCommand(command: string, label: string, execute: () => void) {
        app.commands.addCommand(command, {
            label: 'Create notebook for this result',
            execute
        });
        palette.addItem({ command, category: 'Clean Up' });
    }

    addCommand('livecells:createNotebook', 'Create notebook for this result', () => {
        const panel = notebooks.currentWidget;
        if (panel && panel.notebook && panel.notebook.activeCell.model.type === 'code') {
            const activeCell = panel.notebook.activeCell;
            const program = new CellProgram(activeCell.model, panel.notebook.model.cells);
            const sliceCells = program.backwardDataflow();

            docManager.newUntitled({ ext: 'ipynb' }).then(model => {
                const widget = docManager.open(model.path, undefined, panel.session.kernel.model) as NotebookPanel;
                const newModel = widget.notebook.model;
                const factory = widget.notebook.model.contentFactory;
                sliceCells.forEach(cell => {
                   const newCell = factory.createCodeCell(cell);
                   newModel.cells.push(newCell); 
                });
                newModel.cells.remove(0); // remote the default blank cell
                app.shell.activateById(widget.id);
            });

            // const selection = editor.getSelection();
            // const { start, end } = selection;
            // let selected = start.column !== end.column || start.line !== end.line;
            // if (selected) {
            //     const startOffset = editor.getOffsetAt(selection.start);
            //     const endOffset = editor.getOffsetAt(selection.end);
            //     const text = editor.model.value.text.substring(startOffset, endOffset);
            //     console.log(text);
            // }
        }
    });
    addCommand('livecells:createScript', 'Create script for this result', () => {
        console.log('create script');
    });
}


function doTasksInOrder<T>(work: (() => Promise<T>)[]) {
    return work.reduce((responseList, currentTask) => {
        return responseList.then(previousResults =>
            currentTask().then(currentResult =>
                [...previousResults, currentResult]
            )
        );
    }, Promise.resolve([]))
}

function lineRange(loc: ILocation): NumberSet {
    return range(loc.first_line, loc.last_line + (loc.last_column ? 1 : 0));
}


export default extension;
