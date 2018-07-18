import { toArray } from '@phosphor/algorithm';
import { CommandRegistry } from '@phosphor/commands';
import { IDisposable, DisposableDelegate } from '@phosphor/disposable';
import { Widget, PanelLayout } from '@phosphor/widgets';

import { JupyterLab, JupyterLabPlugin } from '@jupyterlab/application';
import { IClientSession, ICommandPalette } from '@jupyterlab/apputils';
import { Clipboard } from '@jupyterlab/apputils';
import { ICellModel, CodeCell, ICodeCellModel, CodeCellModel } from '@jupyterlab/cells';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { FileEditor } from '@jupyterlab/fileeditor';
import { NotebookPanel, INotebookModel, Notebook, INotebookTracker } from '@jupyterlab/notebook';
import { IObservableList } from '@jupyterlab/observables';
import { RenderMimeRegistry, standardRendererFactories as initialFactories } from '@jupyterlab/rendermime';

import { ControlFlowGraph } from './ControlFlowAnalysis';
import { dataflowAnalysis } from './DataflowAnalysis';
import { NumberSet, range } from './Set';
import { ToolbarCheckbox } from './ToolboxCheckbox';
import { ProgramBuilder } from './ProgramBuilder';
import * as python3 from './parsers/python/python3';
import { ILocation } from './parsers/python/python_parser';
import { HistoryModel, HistoryViewer, buildHistoryModel, SlicedExecution, CellExecution } from './packages/history';

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

/**
 * Copy cells to clipboard. Does not have to be active cells. Logic copied from
 * packages/notebooks/src/actions.tsx in Jupyter Lab project.
 */
function copyCellsToClipboard(cellModels: Array<ICellModel>) {

    const JUPYTER_CELL_MIME = 'application/vnd.jupyter.cells';

    const clipboard = Clipboard.getInstance();
    clipboard.clear();

    const data = cellModels.map(cellModel => cellModel.toJSON());
    clipboard.setData(JUPYTER_CELL_MIME, data);
}

function slice(code: string, relevantLineNumbers: NumberSet) {
    const ast = python3.parse(code);
    const cfg = new ControlFlowGraph(ast);
    const dfa = dataflowAnalysis(cfg);
    dfa.add(...cfg.getControlDependencies());

    const forwardDirection = false;

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

class CellProgram {
    private code: string;
    private changedCellLineNumbers: [number, number];
    private cellByLine: ICodeCellModel[] = [];
    private lineRangeForCell: { [id: string]: [number, number] } = {};

    constructor(changedCell: ICellModel, private cells: ICellModel[], selection?: [number, number]) {
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
                this.changedCellLineNumbers = selection ?
                    [lineNumber + selection[0], lineNumber + selection[1]] :
                    [lineNumber, lineNumber + lineCount - 1];
            }
            lineNumber += lineCount;
        }
    }

    private followDataflow(direction: DataflowDirection): NumberSet {
        const ast = python3.parse(this.code);
        const cfg = new ControlFlowGraph(ast);
        const dfa = dataflowAnalysis(cfg);
        dfa.add(...cfg.getControlDependencies());

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
            if (cell.type !== 'code') continue;
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

/**
 * Create a new cell with the same ID and content.
 */
function cloneCell(cell: ICellModel) {
    return new CodeCellModel({ id: cell.id, cell: cell.toJSON() });
}

class ExecutionLoggerExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {

    private executionLog = new Array<CellExecution>();
    private programBuilder = new ProgramBuilder();

    createNew(panel: NotebookPanel, context: DocumentRegistry.IContext<INotebookModel>): IDisposable {
        panel.notebook.model.cells.changed.connect(
            (cells, value) =>
                this.onCellsChanged(panel.notebook, panel.session, cells, value),
            this);

        return new DisposableDelegate(() => {
        });
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
                    // Clone the cell so we can track its older versions.
                    // This includes manually cloning the executionCount, as it won't be set yet
                    // (that's the even that's happening in this handler).
                    let cellClone = cloneCell(cell);
                    cellClone.executionCount = cellStateChange.newValue;
                    this.programBuilder.add(cellClone);
                    this.executionLog.push(new CellExecution(
                        cell.id, cellStateChange.newValue, new Date()));
                }
            });
        }
    }

    /**
     * Get slice for the latest execution of a cell.
     */
    public sliceForLatestExecution(cell: ICellModel) {
        // XXX: This computes more than it has to, performing a slice on each execution of a cell
        // instead of just its latest computation. Optimize later if necessary.
        return this.slicedExecutions(cell).pop();
    }

    /**
     * Get slices of the necessary code for all executions of a cell.
     */
    public slicedExecutions(cell: ICellModel) {
        
        return this.executionLog
        .filter((execution) => execution.cellId == cell.id)
        .map((execution) => {

            // Slice the program leading up to that cell.
            let program = this.programBuilder.buildTo(execution.cellId, execution.executionCount);
            let cellLines = program.cellToLineMap[execution.cellId][execution.executionCount];
            let sliceLines = slice(program.code, cellLines);

            // Get the relative offsets of slice lines in each cell.
            let relativeSliceLines: { [ cellId: string ]: { [ executionCount: number ] : NumberSet }} = {};
            let cellOrder = new Array<ICodeCellModel>();
            sliceLines.items.forEach((lineNumber) => {
                let sliceCell = program.lineToCellMap[lineNumber];
                let sliceCellLines = program.cellToLineMap[sliceCell.id][sliceCell.executionCount];
                let sliceCellStart = Math.min(...sliceCellLines.items);
                if (cellOrder.indexOf(sliceCell) == -1) {
                    cellOrder.push(sliceCell);
                }
                if (!relativeSliceLines[sliceCell.id]) relativeSliceLines[sliceCell.id] = {};
                if (!relativeSliceLines[sliceCell.id][sliceCell.executionCount]) {
                    relativeSliceLines[sliceCell.id][sliceCell.executionCount] = new NumberSet();
                }
                relativeSliceLines[sliceCell.id][sliceCell.executionCount].add(lineNumber - sliceCellStart);
            });

            let cellSlices = cellOrder.map((sliceCell): [ICodeCellModel, NumberSet] => {
                return [sliceCell, relativeSliceLines[sliceCell.id][sliceCell.executionCount]];
            });
            return new SlicedExecution(execution.executionTime, cellSlices);
        })
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
 * The name of the class for toolbar notifications.
 */
const TOOLBAR_NOTIFACTION_CLASS = 'jp-Toolbar-notification';

/**
 * Number of milliseconds to show a notification.
 */
const NOTIFICATION_MS = 5000;

/**
 * A widget for showing the gathering tools.
 */
class GatherWidget extends Widget {
    /**
     * Construct a gather widget.
     */
    constructor(commands: CommandRegistry) {
        super();
        this.addClass(GATHER_WIDGET_CLASS);
        let layout = (this.layout = new PanelLayout());
        this._gatherButton = new Widget({ node: document.createElement("div") });
        this._gatherButton.addClass(BUTTON_CLASS);
        this._gatherButton.addClass(GATHER_BUTTON_CLASS);
        this._gatherButton.node.onclick = function () {
            commands.execute("livecells:gatherToClipboard");
        }
        layout.addWidget(this._gatherButton);
        this._historyButton = new Widget({ node: document.createElement("div") });
        this._historyButton.addClass(BUTTON_CLASS);
        this._historyButton.addClass(HISTORY_BUTTON_CLASS);
        this._historyButton.node.onclick = function () {
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

    private _anchor: Element;
    private _gatherButton: Widget;
    private _historyButton: Widget;
}

export class NotifactionExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {
    private notificationWidget: Widget;

    createNew(panel: NotebookPanel, context: DocumentRegistry.IContext<INotebookModel>): IDisposable {
        this.notificationWidget = new Widget({ node: document.createElement('p') });
        this.notificationWidget.addClass(TOOLBAR_NOTIFACTION_CLASS);
        panel.toolbar.insertItem(9, 'notifications', this.notificationWidget);
        return new DisposableDelegate(() => {
            this.notificationWidget.dispose();
        })
    };

    showMessage(message: string) {
        this.notificationWidget.node.textContent = message;
        setTimeout(() => {
            this.notificationWidget.node.textContent = "";
        }, NOTIFICATION_MS);
    }
}

function activateExtension(app: JupyterLab, palette: ICommandPalette, notebooks: INotebookTracker, docManager: IDocumentManager) {
    console.log('livecells start');
    // Disable live programming feature for now
    // app.docRegistry.addWidgetExtension('Notebook', new LiveCheckboxExtension());
    const executionLogger = new ExecutionLoggerExtension();
    app.docRegistry.addWidgetExtension('Notebook', executionLogger);
    const notificationExtension = new NotifactionExtension();
    app.docRegistry.addWidgetExtension('Notebook', notificationExtension);
    let gatherWidget = new GatherWidget(app.commands);

    // Listen for hovers over output areas so we can show the tool.
    document.body.onmousemove = function (event: MouseEvent) {
        let target: HTMLElement = event.target as HTMLElement;
        let hoveringOverOutput = false;
        while (target != null) {
            if (target.classList && target.classList.contains("jp-Cell-outputWrapper")) {
                let anchor = target.querySelector(".jp-OutputPrompt");
                gatherWidget.setAnchor(anchor);
                hoveringOverOutput = true;
                break;
            }
            target = target.parentElement;
        }
        if (!hoveringOverOutput) gatherWidget.setAnchor(null);
    }

    function getSelectedLines(editor: CodeEditor.IEditor): [number, number] {
        const selection = editor.getSelection();
        const { start, end } = selection;
        if (start.column !== end.column || start.line !== end.line) {
            return [start.line, end.line];
        }
        return undefined;
    }

    function addCommand(command: string, label: string, execute: () => void) {
        app.commands.addCommand(command, { label, execute });
        palette.addItem({ command, category: 'Clean Up' });
    }

    addCommand('livecells:gatherToClipboard', 'Gather this result to the clipboard', () => {
        const panel = notebooks.currentWidget;
        const SHOULD_SLICE_CELLS = true;
        if (panel && panel.notebook && panel.notebook.activeCell.model.type === 'code') {
            const activeCell = panel.notebook.activeCell;
            let slicedExecutions: SlicedExecution[] = executionLogger.slicedExecutions(activeCell.model);
            let latestSlicedExecution = slicedExecutions.pop();
            let cells = latestSlicedExecution.cellSlices
            .map(([cell, lines]) => {
                let slicedCell = cell;
                if (SHOULD_SLICE_CELLS) {
                    slicedCell = cloneCell(cell);
                    slicedCell.value.text = 
                        slicedCell.value.text.split("\n")
                        .filter((_, i) => lines.contains(i))
                        .join("\n");
                }
                return slicedCell;
            });
            copyCellsToClipboard(cells);
            notificationExtension.showMessage("Copied cells to clipboard. Right-click or type 'V' to paste.");
        }
    });

    addCommand('livecells:gatherToNotebook', 'Gather this result into a new notebook', () => {
        const panel = notebooks.currentWidget;
        if (panel && panel.notebook && panel.notebook.activeCell.model.type === 'code') {
            const activeCell = panel.notebook.activeCell;
            let slice = executionLogger.sliceForLatestExecution(activeCell.model);
            let cells = slice.cellSlices.map(([cell, _]) => cell);

            docManager.newUntitled({ ext: 'ipynb' }).then(model => {
                const widget = docManager.open(model.path, undefined, panel.session.kernel.model) as NotebookPanel;
                const newModel = widget.notebook.model;
                setTimeout(() => {
                    newModel.cells.remove(0); // remote the default blank cell                        
                    newModel.cells.pushAll(cells);
                }, 100);
            });
        }
    });

    addCommand('livecells:gatherToScript', 'Gather this result into a new script', () => {
        const panel = notebooks.currentWidget;
        if (panel && panel.notebook && panel.notebook.activeCell.model.type === 'code') {
            const activeCell = panel.notebook.activeCell;

            let slice = executionLogger.sliceForLatestExecution(activeCell.model);
            let cells = slice.cellSlices.map(([cell, _]) => cell);
            let scriptText = cells
                .map((cell) => cell.value.text)
                .reduce((buffer, cellText) => { return buffer + cellText + "\n" }, "");

            // TODO: Add back in slice based on fine-grained selection within the cell:
            const selection = getSelectedLines(activeCell.editor);
            console.log(selection);
            // const program = new CellProgram(activeCell.model, toArray(panel.notebook.model.cells), selection);

            docManager.newUntitled({ ext: 'py' }).then(model => {
                const editor = docManager.open(model.path, undefined, panel.session.kernel.model) as FileEditor;
                setTimeout(() => {
                    editor.model.value.text = scriptText;
                }, 100);
            });
        }
    });

    addCommand('livecells:gatherFromHistory', 'Compare previous versions of this result', () => {

        const panel = notebooks.currentWidget;
        if (panel && panel.notebook && panel.notebook.activeCell.model.type === 'code') {
            const activeCell = panel.notebook.activeCell;
            let slicedExecutions: SlicedExecution[] = executionLogger.slicedExecutions(activeCell.model);
            let historyModel: HistoryModel = buildHistoryModel(activeCell.model.id, slicedExecutions);

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
