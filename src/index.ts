import { IDisposable, DisposableDelegate } from '@phosphor/disposable';
import { JupyterLab, JupyterLabPlugin } from '@jupyterlab/application';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { NotebookPanel, INotebookModel, Notebook, INotebookTracker, NotebookModel } from '@jupyterlab/notebook';
import { IObservableList } from '@jupyterlab/observables';
import { ICellModel, CodeCell, ICodeCellModel } from '@jupyterlab/cells';
import { IClientSession, ICommandPalette } from '@jupyterlab/apputils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { FileEditor } from '@jupyterlab/fileeditor';
import { nbformat } from '@jupyterlab/coreutils';
import { toArray } from '@phosphor/algorithm';
import { RenderMimeRegistry, standardRendererFactories as initialFactories } from '@jupyterlab/rendermime';

import * as python3 from './parsers/python/python3';
import { ILocation } from './parsers/python/python_parser';
import { ControlFlowGraph } from './ControlFlowGraph';
import { dataflowAnalysis } from './DataflowAnalysis';
import { NumberSet, range } from './Set';
import { ToolbarCheckbox } from './ToolboxCheckbox';
import { getDifferences } from './EditDistance';
import { HistoryModel, HistoryViewer, NotebookSnapshot, CellSnapshot, buildHistoryModel } from './packages/history';

import '../style/index.css';

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
    private cellByLine: ICodeCellModel[] = [];
    private lineRangeForCell: { [id: string]: [number, number] } = {};

    constructor(changedCell: ICellModel, private cells: ICellModel[]) {
        this.code = '';
        let lineNumber = 1;
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i] as ICodeCellModel;
            if (cell.type !== 'code') continue;
            const cellText = cell.value.text;
            this.code += cellText + '\n';
            const lineCount = cellText.split('\n').length;
            this.lineRangeForCell[cell.id] = [lineNumber, lineNumber + lineCount];
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
        let relevantLineNumbers = new NumberSet();
        const [startLine, endLine] = this.changedCellLineNumbers;
        for (let line = startLine; line <= endLine; line++) {
            relevantLineNumbers.add(line);
        }

        let lastSize: number;
        do {
            lastSize = relevantLineNumbers.size;
            for (let flow of dfa.items) {
                const fromLines = lineRange(flow.fromNode.location);
                const toLines = lineRange(flow.toNode.location);
                const startLines = forwardDirection ? fromLines : toLines;
                const endLines = forwardDirection ? toLines : fromLines;
                if (!relevantLineNumbers.intersect(startLines).empty) {
                    relevantLineNumbers = relevantLineNumbers.union(endLines);
                }
            }
        } while (relevantLineNumbers.size > lastSize);

        return relevantLineNumbers;
    }

    public getDataflowCells(direction: DataflowDirection): ICodeCellModel[] {
        const relevantLineNumbers = this.followDataflow(direction);
        const changedCells: ICodeCellModel[] = [];
        for (let line of relevantLineNumbers.items.sort((line1, line2) => line1 - line2)) {
            if (this.cellByLine[line] !== changedCells[changedCells.length - 1]) {
                changedCells.push(this.cellByLine[line]);
            }
        }
        return changedCells;
    }


    public getDataflowText(direction: DataflowDirection): string {
        const relevantLineNumbers = this.followDataflow(direction);
        let text = '';
        let lineNumber = 0;
        for (let i = 0; i < this.cells.length; i++) {
            const cell = this.cells[i];
            const cellLines = cell.value.text.split('\n');
            for (let line = 0; line < cellLines.length; line++) {
                if (relevantLineNumbers.contains(line + lineNumber + 1)) {
                    text += cellLines[line] + '\n';
                }
            }
            lineNumber += cellLines.length;
        }
        return text;
    }
}



class CellLiveness {

    private currentlyExecutingCells = false;

    constructor(
        private checkbox: ToolbarCheckbox,
        panel: NotebookPanel
    ) {
        panel.notebook.model.cells.changed.connect(
            (cells, value) =>
                this.onCellsChanged(panel.notebook, panel.session, cells, value),
            this);
    }

    public dispose() { }

    private findStaleCells(changedCell: ICellModel, cells: ICellModel[]): ICellModel[] {
        const program = new CellProgram(changedCell, cells);
        return program.getDataflowCells(DataflowDirection.Forward);
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

                        const tasks = this.findStaleCells(changedCell, toArray(allCells))
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
    private liveness: CellLiveness;

    createNew(panel: NotebookPanel, context: DocumentRegistry.IContext<INotebookModel>): IDisposable {
        const checkbox = new ToolbarCheckbox(panel.notebook);
        panel.toolbar.insertItem(9, 'liveCode', checkbox);
        this.liveness = new CellLiveness(checkbox, panel);

        return new DisposableDelegate(() => {
            this.liveness.dispose();
            checkbox.dispose();
        });
    }
}

class ExecutionLoggerExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {
    private executionHistoryPerCell: { [cellId: string]: NotebookSnapshot[] } = {};

    createNew(panel: NotebookPanel, context: DocumentRegistry.IContext<INotebookModel>): IDisposable {
        panel.notebook.model.cells.changed.connect(
            (cells, value) =>
                this.onCellsChanged(panel.notebook, panel.session, cells, value),
            this);

        return new DisposableDelegate(() => {
        });
    }

    private copyNotebook(notebookModel: INotebookModel): NotebookSnapshot {
        const cells: CellSnapshot[] = [];
        const nbmodel = new NotebookModel();
        nbmodel.fromJSON(notebookModel.toJSON() as nbformat.INotebookContent);
        for (let i = 0; i < notebookModel.cells.length; i++) {
            const cell = notebookModel.cells.get(i) as ICodeCellModel;
            if (cell) {
                const clone = nbmodel.cells.get(i) as ICodeCellModel;
                cells.push(new CellSnapshot(cell.id, clone));
            }
        }
        const copy: NotebookSnapshot = new NotebookSnapshot(cells, new Date());
        console.log(copy);
        return copy;
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
                    const cellid = codeCell.model.id;
                    let history = this.executionHistoryPerCell[cellid];
                    if (!history) {
                        history = this.executionHistoryPerCell[cellid] = [];
                    };
                    history.push(this.copyNotebook(notebook.model));
                }
            });
        }
    }

    public snapshots(cell: ICellModel) {
        return this.executionHistoryPerCell[cell.id];
    }

    public versions(cell: ICellModel) {
        let notebookVersions = this.executionHistoryPerCell[cell.id];
        let slices = notebookVersions.map(notebookVersion =>
            new CellProgram(
                notebookVersion.cells.find(c => c.id === cell.id).cellModel,
                notebookVersion.cells.map(c => c.cellModel))
                .getDataflowCells(DataflowDirection.Backward));
        console.log('slices', slices);
        const foils = slices.slice(1).concat([slices[0]]);

        function sameCodeCells(cm1: ICodeCellModel, cm2: ICodeCellModel) {
            if (cm1.value.text !== cm2.value.text) return false;
            if (cm1.outputs.length !== cm2.outputs.length) return false;
            for (let i = 0; i < cm1.outputs.length; i++) {
                const out1 = cm1.outputs.get(i);
                const out2 = cm2.outputs.get(i);
                if (out1.type !== out2.type) return false;
                if (JSON.stringify(out1.data) !== JSON.stringify(out2.data)) return false;
            }
            return true;
        }

        const diffed = slices.map((slice, i) =>
            getDifferences(slice, foils[i], sameCodeCells)
                .filter(d => d.kind !== 'same')
                .map(d => d.source)
                .filter(s => s));
        console.log('diffs', diffed);
    }
}


function activateExtension(app: JupyterLab, palette: ICommandPalette, notebooks: INotebookTracker, docManager: IDocumentManager) {
    console.log('livecells start');
    // Disable live programming feature for now
    // app.docRegistry.addWidgetExtension('Notebook', new LiveCheckboxExtension());
    const executionLogger = new ExecutionLoggerExtension();
    app.docRegistry.addWidgetExtension('Notebook', executionLogger);

    function addCommand(command: string, label: string, execute: () => void) {
        app.commands.addCommand(command, { label, execute });
        palette.addItem({ command, category: 'Clean Up' });
    }

    addCommand('livecells:gatherToNotebook', 'Gather this result into a new notebook', () => {
        const panel = notebooks.currentWidget;
        if (panel && panel.notebook && panel.notebook.activeCell.model.type === 'code') {
            const activeCell = panel.notebook.activeCell;
            const program = new CellProgram(activeCell.model, toArray(panel.notebook.model.cells));
            const sliceCells = program.getDataflowCells(DataflowDirection.Backward);

            docManager.newUntitled({ ext: 'ipynb' }).then(model => {
                const widget = docManager.open(model.path, undefined, panel.session.kernel.model) as NotebookPanel;
                const newModel = widget.notebook.model;
                setTimeout(() => {
                    newModel.cells.remove(0); // remote the default blank cell                        
                    newModel.cells.pushAll(sliceCells);
                }, 100);
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

    addCommand('livecells:gatherToScript', 'Gather this result into a new script', () => {
        const panel = notebooks.currentWidget;
        if (panel && panel.notebook && panel.notebook.activeCell.model.type === 'code') {
            const activeCell = panel.notebook.activeCell;
            const program = new CellProgram(activeCell.model, toArray(panel.notebook.model.cells));
            const text = program.getDataflowText(DataflowDirection.Backward);

            docManager.newUntitled({ ext: 'py' }).then(model => {
                const editor = docManager.open(model.path, undefined, panel.session.kernel.model) as FileEditor;
                setTimeout(() => {
                    editor.model.value.text = text;
                }, 100);
            });
        }
    });

    addCommand('livecells:gatherFromHistory', 'Compare previous versions of this result', () => {

        const panel = notebooks.currentWidget;
        if (panel && panel.notebook && panel.notebook.activeCell.model.type === 'code') {
            // console.log("Gathering from history");
            const activeCell = panel.notebook.activeCell;
            let snapshots: NotebookSnapshot[] = executionLogger.snapshots(activeCell.model);
            let historyModel: HistoryModel = buildHistoryModel(activeCell.model.id, snapshots);

            let widget: HistoryViewer = new HistoryViewer({
                model: historyModel,
                rendermime: new RenderMimeRegistry({ initialFactories }),
                editorFactory: notebooks.activeCell.contentFactory.editorFactory
            });
    
            if (!widget.isAttached) {
                app.shell.addToMainArea(widget);
            }
            app.shell.activateById(widget.id);
        }
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
