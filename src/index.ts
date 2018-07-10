import { IDisposable, DisposableDelegate } from '@phosphor/disposable';
import { Widget, PanelLayout } from '@phosphor/widgets';
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
import { HistoryModel, HistoryViewer, NotebookSnapshot, CellSnapshot, buildHistoryModel, SlicedNotebookSnapshot } from './packages/history';

import '../style/index.css';
import { CommandRegistry } from '../node_modules/@phosphor/commands';

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

    public getDataflowCells(direction: DataflowDirection): Array<[ICodeCellModel, NumberSet]> {
        const relevantLineNumbers = this.followDataflow(direction);
        const cellsById: { [id: string]: ICodeCellModel } = {};
        const cellExecutionInfo: { [id: string]: NumberSet } = {};
        for (let line of relevantLineNumbers.items.sort((line1, line2) => line1 - line2)) {
            let cellModel = this.cellByLine[line];
            let lineNumbers;
            if (!cellExecutionInfo.hasOwnProperty(cellModel.id)) {
                lineNumbers = new NumberSet();
                cellsById[cellModel.id] = cellModel;
                cellExecutionInfo[cellModel.id] = lineNumbers;
            }
            lineNumbers = cellExecutionInfo[cellModel.id];
            lineNumbers.add(line - this.lineRangeForCell[cellModel.id][0]);
        }
        let result = new Array<[ICodeCellModel, NumberSet]>();
        for (let cellId in cellExecutionInfo) {
            result.push([cellsById[cellId], cellExecutionInfo[cellId]]);
        }
        return result;
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
        return program.getDataflowCells(DataflowDirection.Forward).map(r => r[0]);
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
        const snapshotToLiveIdMap: { [id: string]: string } = {};
        const nbmodel = new NotebookModel();
        // When loading back from JSON, the cell IDs get changed. Make a mapping from new cell
        // IDs to old ones so we can align the changes elsewhere in the code.
        nbmodel.fromJSON(notebookModel.toJSON() as nbformat.INotebookContent);
        for (let i = 0; i < notebookModel.cells.length; i++) {
            const cell = notebookModel.cells.get(i) as ICodeCellModel;
            if (cell) {
                const clone = nbmodel.cells.get(i) as ICodeCellModel;
                snapshotToLiveIdMap[clone.id] = cell.id;
                cells.push(new CellSnapshot(cell.id, clone));
            }
        }
        const copy: NotebookSnapshot = new NotebookSnapshot(cells, snapshotToLiveIdMap, new Date());
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
        let notebookVersions = this.executionHistoryPerCell[cell.id];
        return notebookVersions.map(notebookVersion => 
            new SlicedNotebookSnapshot(
                notebookVersion,
                new CellProgram(
                    notebookVersion.cells.find(c => c.id === cell.id).cellModel,
                    notebookVersion.cells.map(c => c.cellModel))
                    .getDataflowCells(DataflowDirection.Backward)
            ));
    }

    public versions(cell: ICellModel) {
        let notebookVersions = this.executionHistoryPerCell[cell.id];
        let slices = notebookVersions.map(notebookVersion =>
            new CellProgram(
                notebookVersion.cells.find(c => c.id === cell.id).cellModel,
                notebookVersion.cells.map(c => c.cellModel))
                .getDataflowCells(DataflowDirection.Backward).map(r => r[0]));
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

/**
 * The name of the class for the gather widget.
 */
const GATHER_WIDGET_CLASS = 'jp-GatherWidget';

/**
 * The name of the class for buttons on the gather widget.
 */
const BUTTON_CLASS = 'jp-GatherWidget-button';

/**
 * The name of the class for the gather button.
 */
const GATHER_BUTTON_CLASS = 'jp-GatherWidget-gatherbutton';

/**
 * The name of the class for the history button.
 */
const HISTORY_BUTTON_CLASS = 'jp-GatherWidget-historybutton';

/**
 * A widget for showing the gathering tools.
 */
class GatherWidget extends Widget {
    /**
     * Construct a gather widget.
     */
    constructor(commands: CommandRegistry) {
        super();
        this._commands = commands;
        this.addClass(GATHER_WIDGET_CLASS);
        let layout = (this.layout = new PanelLayout());
        this._gatherButton = new Widget({ node: document.createElement("div") });
        this._gatherButton.addClass(BUTTON_CLASS);
        this._gatherButton.addClass(GATHER_BUTTON_CLASS);
        this._gatherButton.node.onclick = function() {
            commands.execute("livecells:gatherToNotebook");
        }
        layout.addWidget(this._gatherButton);
        this._historyButton = new Widget({ node: document.createElement("div") });
        this._historyButton.addClass(BUTTON_CLASS);
        this._historyButton.addClass(HISTORY_BUTTON_CLASS);
        this._historyButton.node.onclick = function() {
            commands.execute("livecells:gatherFromHistory");
        }
        layout.addWidget(this._historyButton);
    }

    /**
     * Set the element above which this widget should be anchored.
     */
    setAnchor(element: Element) {
        let oldAnchor = this._anchor;
        this._anchor = element;
        if (this._anchor != oldAnchor) {
            if (oldAnchor != null) {
                oldAnchor.removeChild(this.node);
            }
            if (this._anchor != null) {
                this._anchor.appendChild(this.node);
            }
        }
    }

    /**
     * Dispose of the resources held by the widget.
     */
    dispose() {
        // Do nothing if already disposed.
        if (this.isDisposed) {
            return;
        }
        this._gatherButton.dispose();
        this._historyButton.dispose();
        this._gatherButton = null;
        this._historyButton = null;
        this._anchor = null;
        super.dispose();
    }

    private _commands: CommandRegistry;
    private _anchor: Element;
    private _gatherButton: Widget;
    private _historyButton: Widget;
}

function activateExtension(app: JupyterLab, palette: ICommandPalette, notebooks: INotebookTracker, docManager: IDocumentManager) {
    console.log('livecells start');
    // Disable live programming feature for now
    // app.docRegistry.addWidgetExtension('Notebook', new LiveCheckboxExtension());
    const executionLogger = new ExecutionLoggerExtension();
    app.docRegistry.addWidgetExtension('Notebook', executionLogger);
    let gatherWidget = new GatherWidget(app.commands);

    // Listen for hovers over output areas so we can show the tool.
    document.body.onmousemove = function(event: MouseEvent) {
        let target:HTMLElement = event.target as HTMLElement;
        let hoveringOverOutput = false;
        while (target != null) {
            if (target.classList && target.classList.contains("jp-Cell-outputWrapper")) {
                console.log("Hovering over output");
                let anchor = target.querySelector(".jp-OutputPrompt");
                gatherWidget.setAnchor(anchor);
                hoveringOverOutput = true;
                break;
            }
            target = target.parentElement;
        }
        if (!hoveringOverOutput) gatherWidget.setAnchor(null);
    }

    function addCommand(command: string, label: string, execute: () => void) {
        app.commands.addCommand(command, { label, execute });
        palette.addItem({ command, category: 'Clean Up' });
    }

    addCommand('livecells:gatherToNotebook', 'Gather this result into a new notebook', () => {
        const panel = notebooks.currentWidget;
        if (panel && panel.notebook && panel.notebook.activeCell.model.type === 'code') {
            const activeCell = panel.notebook.activeCell;
            const program = new CellProgram(activeCell.model, toArray(panel.notebook.model.cells));
            const sliceCells = program.getDataflowCells(DataflowDirection.Backward).map(r => r[0]);

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
            const activeCell = panel.notebook.activeCell;
            let snapshots: SlicedNotebookSnapshot[] = executionLogger.snapshots(activeCell.model);
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
