import { CommandRegistry } from '@phosphor/commands';
import { JSONObject } from '@phosphor/coreutils';
import { IDisposable, DisposableDelegate } from '@phosphor/disposable';

import { JupyterLab, JupyterLabPlugin } from '@jupyterlab/application';
import { IClientSession, ICommandPalette } from '@jupyterlab/apputils';
import { Clipboard as JupyterClipboard } from '@jupyterlab/apputils';
import { ICellModel, CodeCell, Cell, CodeCellModel } from '@jupyterlab/cells';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { IDocumentManager, DocumentManager } from '@jupyterlab/docmanager';
import { DocumentRegistry, IDocumentWidget } from '@jupyterlab/docregistry';
import { FileEditor } from '@jupyterlab/fileeditor';
import { NotebookPanel, INotebookModel, Notebook, INotebookTracker } from '@jupyterlab/notebook';
import { IObservableList } from '@jupyterlab/observables';

import { LabCell, copyICodeCellModel } from './LabCell';
import { MarkerManager, ICellEditorResolver, ICellOutputResolver, ICellProgramResolver, ICell } from '../packages/cell';
import { GatherModel, OutputSelection, GatherController, GatherState } from '../packages/gather';
import { NotificationWidget } from '../packages/notification/widget';
import { DataflowAnalyzer } from '../slicing/DataflowAnalysis';
import { ExecutionLogSlicer, SlicedExecution } from '../slicing/ExecutionSlicer';
import { CellProgram } from '../slicing/ProgramBuilder';

import '../../style/lab-vars.css';
import '../../style/index.css';
import { ICellClipboard, IClipboardListener } from '../packages/gather/clipboard';
import { nbformat } from '@jupyterlab/coreutils';
import { log } from '../utils/log';
import { INotebookOpener, IScriptOpener } from '../packages/gather/opener';

//import { UUID } from '@phosphor/coreutils';

/**
 * Try to only write Jupyter Lab-specific implementation code in this file.
 * If there is any program analysis / text processing, widgets that could be shared with Jupyter
 * notebook, try to put those in another shared file.
 */

/**
 * Highlights gatherable entities.
 */
class ResultsHighlighter {

    private _markerManager: MarkerManager;
    private _gatherModel: GatherModel;

    constructor(panel: NotebookPanel, gatherModel: GatherModel, markerManager: MarkerManager) {
        this._markerManager = markerManager;
        this._gatherModel = gatherModel;

        panel.content.model.cells.changed.connect(
            (cells, value) =>
                this.onCellsChanged(panel.content, panel.session, cells, value),
            this);

        document.body.addEventListener("mouseup", (event: MouseEvent) => {
            this._markerManager.handleClick(event);
        });
    }

    public onCellsChanged(
        notebook: Notebook,
        _: IClientSession,
        __: IObservableList<ICellModel>,
        cellListChange: IObservableList.IChangedArgs<ICellModel>
    ): void {
        if (cellListChange.type === 'add') {
            const cellModel = cellListChange.newValues[0] as ICellModel;
            if (cellModel.type !== 'code') { return; }

            // When a cell is added, register for its state changes.
            cellModel.contentChanged.connect((changedCell, args) => {
                // TODO(andrewhead): check that this change is due to a user's text edit in the cell.
                if (changedCell instanceof CodeCellModel) {
                    this._gatherModel.lastEditedCell = new LabCell(changedCell);
                }
            });
        }
        if (cellListChange.type === 'remove') {
            const cellModel = cellListChange.newValues[0] as ICellModel;
            if (cellModel instanceof CodeCellModel) {
                this._gatherModel.lastDeletedCell = new LabCell(cellModel);
            }
        }
    }
}

/**
 * Extension for tracking sequences of cells executed in a notebook.
 */
class ExecutionLoggerExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {

    private _gatherModel: GatherModel;
    private _executionSlicer: ExecutionLogSlicer;
    private _markerManager: MarkerManager;

    constructor(executionSlicer: ExecutionLogSlicer, model: GatherModel, commands: CommandRegistry, markerManager: MarkerManager) {
        this._gatherModel = model;
        this._executionSlicer = executionSlicer;
        this._markerManager = markerManager;
    }

    get executionSlicer(): ExecutionLogSlicer {
        return this._executionSlicer;
    }

    createNew(panel: NotebookPanel, context: DocumentRegistry.IContext<INotebookModel>): IDisposable {
        new ResultsHighlighter(panel, this._gatherModel, this._markerManager);

        panel.content.model.cells.changed.connect(
            (cells, value) =>
                this.onCellsChanged(panel.content, panel.session, cells, value),
            this);

        // Listen for all clicks on definition markers to trigger gathering.
        // XXX: For some reason (tested in both Chrome and Edge), "click" events get dropped
        // sometimes when you're clicking on a cell. Mouseup doesn't. Eventually should find
        // the solution to supporting clicks.
        panel.content.node.addEventListener("mouseup", (event: MouseEvent) => {
            this._markerManager.handleClick(event);
        });

        return new DisposableDelegate(() => { });

        // TODO: listen for reset
    }

    public onCellsChanged(
        notebook: Notebook,
        _: IClientSession,
        __: IObservableList<ICellModel>,
        cellListChange: IObservableList.IChangedArgs<ICellModel>
    ): void {
        if (cellListChange.type === 'add') {
            const cellModel = cellListChange.newValues[0] as ICellModel;
            if (cellModel.type !== 'code') { return; }

            // When a cell is added, register for its state changes.
            cellModel.stateChanged.connect((changedCell, cellStateChange) => {
                if (changedCell instanceof CodeCellModel && cellStateChange.name === "executionCount" && cellStateChange.newValue !== undefined && cellStateChange.newValue !== null) {
                    let cellClone = copyICodeCellModel(changedCell);
                    const cell = new LabCell(cellClone);
                    this._executionSlicer.logExecution(cell);
                    this._gatherModel.lastExecutedCell = cell;

                    

                }
            });
        }
    }
}

export class NotifactionExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {
    private notificationWidget: NotificationWidget;

    createNew(panel: NotebookPanel, _: DocumentRegistry.IContext<INotebookModel>): IDisposable {
        this.notificationWidget = new NotificationWidget();
        panel.toolbar.insertItem(9, 'notifications', this.notificationWidget);
        return new DisposableDelegate(() => {
            this.notificationWidget.dispose();
        })
    };

    showMessage(message: string) {
        this.notificationWidget.showMessage(message);
    }
}

class CellFetcher {

    private _notebooks: INotebookTracker;

    /**
     * Construct a new cell fetcher.
     */
    constructor(notebooks: INotebookTracker) {
        this._notebooks = notebooks;
    }

    /**
     * Get a cell from the notebook with the ID.
     */
    getCellWidgetWithId(cellId: string): Cell {
        let matchingCell: Cell = null;
        this._notebooks.forEach((notebook: NotebookPanel) => {
            if (matchingCell == null) {
                for (let cell of notebook.content.widgets) {
                    if (cell.model.id == cellId) {
                        matchingCell = cell;
                        break;
                    }
                }
            }
        });
        return matchingCell;
    }

    /**
     * Get a cell from the notebook with the specified properties.
     */
    getCellWidget(cellId: string, executionCount?: number): Cell {
        let cell = this.getCellWidgetWithId(cellId);
        if (cell != null && (cell as CodeCell).model.executionCount == executionCount) {
            return cell;
        }
        return null;
    }
}

/**
 * Resolve the active editors for cells in Jupyter Lab.
 */
class LabCellEditorResolver implements ICellEditorResolver {
    /**
     * Construct a new cell editor resolver.
     */
    constructor(cellFetcher: CellFetcher) {
        this._cellFetcher = cellFetcher;
    }

    resolve(cell: ICell): CodeMirror.Editor {
        let cellWidget = this._cellFetcher.getCellWidgetWithId(cell.id);
        return this._getEditor(cellWidget);
    }

    resolveWithExecutionCount(cell: ICell): CodeMirror.Editor {
        let cellWidget = this._cellFetcher.getCellWidget(cell.id, cell.executionCount);
        return this._getEditor(cellWidget);
    }

    _getEditor(cellWidget: Cell) {
        if (cellWidget && cellWidget.editor instanceof CodeMirrorEditor) {
            return cellWidget.editor.editor;
        }
        return null;
    }

    private _cellFetcher: CellFetcher;
}

/**
 * Finds HTML elements for cell outputs in a notebook.
 */
class LabCellOutputResolver implements ICellOutputResolver {
    /**
     * Construct a new cell editor resolver.
     */
    constructor(cellFetcher: CellFetcher) {
        this._cellFetcher = cellFetcher;
    }

    resolve(cell: ICell): HTMLElement[] {
        let cellWidget = this._cellFetcher.getCellWidgetWithId(cell.id);
        let outputElements = [];
        if (cellWidget) {
            let cellElement = cellWidget.node;
            var outputNodes = cellElement.querySelectorAll(".jp-OutputArea-output");
            for (var i = 0; i < outputNodes.length; i++) {
                if (outputNodes[i] instanceof HTMLElement) {
                    outputElements.push(outputNodes[i] as HTMLElement);
                }
            }
        }
        return outputElements;
    }

    private _cellFetcher: CellFetcher;
}

/**
 * Maps cells to the code analysis information.
 */
class CellProgramResolver implements ICellProgramResolver {
    /**
     * Construct a new cell program resolver
     */
    constructor(executionLogSlicer: ExecutionLogSlicer) {
        this._executionLogSlicer = executionLogSlicer;
    }

    resolve(cell: ICell): CellProgram {
        return this._executionLogSlicer.getCellProgram(cell);
    }

    private _executionLogSlicer: ExecutionLogSlicer;
}

/**
 * Convert program slice to list of cell JSONs
 */
function sliceToCellJson(slice: SlicedExecution, outputSelections?: OutputSelection[]): nbformat.ICodeCell[] {

    const SHOULD_SLICE_CELLS = true;
    const OMIT_UNSELECTED_OUTPUT = true;

    outputSelections = outputSelections || [];

    return slice.cellSlices
        .map((cellSlice, i) => {
            let slicedCell = cellSlice.cell;
            if (SHOULD_SLICE_CELLS) {
                slicedCell = slicedCell.copy();
                slicedCell.text = cellSlice.textSliceLines;
            }
            if (slicedCell instanceof LabCell) {
                let cellJson = slicedCell.toJSON();
                // This new cell hasn't been executed yet. So don't mark it as having been executed.
                cellJson.execution_count = null;
                // Add a flag to distinguish gathered cells from other cells.
                cellJson.metadata.gathered = true;
                // Filter to just those outputs that were selected.
                if (OMIT_UNSELECTED_OUTPUT) {
                    let originalOutputs = cellJson.outputs;
                    cellJson.outputs = [];
                    for (let i = 0; i < originalOutputs.length; i++) {
                        let output = originalOutputs[i];
                        if (outputSelections.some(s => s.cell.id == slicedCell.id && s.outputIndex == i)) {
                            cellJson.outputs.push(output);
                        }
                    }
                }
                return cellJson;
            }
        }).filter(c => c);
}

/**
 * Opens new notebooks containing program slices.
 */
class NotebookOpener implements INotebookOpener {

    constructor(documentManager: DocumentManager, notebooks: INotebookTracker) {
        this._documentManager = documentManager;
        this._notebooks = notebooks;
    }

    openNotebookForSlice(slice: SlicedExecution) {

        // TODO give this new document a better name than "Untitled".
        this._documentManager.newUntitled({ ext: 'ipynb' }).then(model => {
            // TODO put more safety checks on this
            const widget = this._documentManager.open(model.path, undefined, this._notebooks.currentWidget.session.kernel.model) as NotebookPanel;
            setTimeout(() => {

                const notebookModel = widget.content.model;
                let notebookJson = notebookModel.toJSON() as nbformat.INotebookContent;
                notebookJson.cells = []
                if (slice) {
                    let cellsJson = sliceToCellJson(slice, []);
                    for (let cell of cellsJson) {
                        notebookJson.cells.push(cell);
                    }
                }
                notebookModel.fromJSON(notebookJson);
                // XXX can we make this work without the 100-ms delay?
            }, 100);
        });
    }

    private _documentManager: DocumentManager;
    private _notebooks: INotebookTracker;
}

/**
 * Opens new scripts containing program slices.
 */
class ScriptOpener implements IScriptOpener {

    constructor(documentManager: DocumentManager, notebooks: INotebookTracker) {
        this._documentManager = documentManager;
        this._notebooks = notebooks;
    }

    openScriptForSlice(slice: SlicedExecution) {

        // TODO give this new document a better name than "Untitled".
        this._documentManager.newUntitled({ ext: 'py' }).then(model => {
            // TODO put more safety checks on this
            const editor = this._documentManager.open(model.path, undefined, this._notebooks.currentWidget.session.kernel.model) as IDocumentWidget<FileEditor>;
            setTimeout(() => {
                if (slice) {
                    let cellsJson = sliceToCellJson(slice, []);
                    let scriptText = cellsJson.map(cellJson => cellJson.source).join("\n");
                    editor.content.model.value.text = scriptText;
                }
            }, 100);
        });
    }

    private _documentManager: DocumentManager;
    private _notebooks: INotebookTracker;
}

/**
 * Gather code to the clipboard.
 * Logic copied from packages/notebooks/src/actions.tsx in Jupyter Lab project.
 */
class Clipboard implements ICellClipboard {

    constructor(gatherModel: GatherModel) {
        this._gatherModel = gatherModel;
    }

    addListener(listener: IClipboardListener) {
        this._listeners.push(listener);
    }

    copy(slice: SlicedExecution) {
        const JUPYTER_CELL_MIME = 'application/vnd.jupyter.cells';
        if (slice) {
            let cellJson = sliceToCellJson(slice, this._gatherModel.selectedOutputs.concat());
            const clipboard = JupyterClipboard.getInstance();
            clipboard.clear();
            clipboard.setData(JUPYTER_CELL_MIME, cellJson);
        }
        this._listeners.forEach(listener => listener.onCopy(slice, this));
    }

    private _gatherModel: GatherModel;
    private _listeners: IClipboardListener[] = [];
}

function activateExtension(app: JupyterLab, palette: ICommandPalette, notebooks: INotebookTracker, docManager: IDocumentManager) {

    console.log('Activating code gathering tools');
   

    docManager.activateRequested.connect(
            (docMan, msg) => {
                notebooks.forEach((widget: NotebookPanel) => print(widget))

    });

    

    let gatherModel = new GatherModel();

    const notificationExtension = new NotifactionExtension();
    app.docRegistry.addWidgetExtension('Notebook', notificationExtension);

    let executionSlicer = new ExecutionLogSlicer(new DataflowAnalyzer());
   



   
    let historyLoaded = 0;
    let previousSaveLogLength = executionSlicer._executionLog.length
    function print(notebook: NotebookPanel){

        //deserializes execution history on load of the notebook metadata
        if (executionSlicer._executionLog.length == 0 && historyLoaded == 0) {
            var seconds = 0;
            var intervalId = setInterval(function(){
                seconds+=1
                if(seconds == 10) { 
                    console.log("history is empty")
                    clearInterval(intervalId);
                    historyLoaded = 1;
                } else {

                    if (notebook.model.metadata.get("executionHistory")) {
                        let history = notebook.model.metadata.get("executionHistory");

                        console.log("History Loading...")
                        console.log("Loading Before", executionSlicer._executionLog);
                        console.log("Notebook Stored Execution History", notebook.model.metadata.get("executionHistory"));

                        for (let x in (<any>history)){
                            let cell =(<ICell>(<any>history)[x.toString()]);
                       
                            executionSlicer.logExecution(cell)
                        }
                        //notebook.model.metadata.set("executionHistory","")
                        historyLoaded = 1;
                        previousSaveLogLength = executionSlicer._executionLog.length
                        console.log("Loading After", executionSlicer._executionLog);
                        clearInterval(intervalId);
                    } else {
                        console.log(notebook.model.metadata.get("executionHistory"));
                        console.log("still waiting!", seconds);
                    } 
                }
            }, 1000);
        }

        //Notebook listener serializes execution log to metadata on save
        notebook.context.saveState.connect((context, msg) => {

                let currentSaveLogLength = executionSlicer._programBuilder._cellPrograms.length
                if (msg == "started" &&  currentSaveLogLength != previousSaveLogLength){

                    console.log("Saving File and Updating Execution History...");
                    console.log("before", notebook.model.metadata.get("executionHistory"));
                    
                    let cellPrograms = executionSlicer._programBuilder._cellPrograms;
                    let tempCellGroup: any = [];

                    for (var i = previousSaveLogLength; i < cellPrograms.length; i++) {
                        let cell = cellPrograms[i].cell;
                        let tempCell: any = {};
                        tempCell["id"] = cell.id;
                        tempCell["is_cell"] = cell.is_cell;
                        tempCell["executionCount"] = cell.executionCount;
                        tempCell["hasError"] = cell.hasError;
                        tempCell["isCode"] = cell.isCode;
                        tempCell["text"] = cell.text;
                        tempCell["gathered"] = cell.gathered;
                        tempCellGroup.push(tempCell);
                    }

                    let history = notebook.model.metadata.get("executionHistory");
                    let tempHistory: any = {};
                    let counter = 0

                    for (let x in (<any>history)){
                        tempHistory[counter.toString()] = (<any>history)[x.toString()];
                        counter += 1;
                    }
                    for (var i = 0; i<tempCellGroup.length; i++) {
                        tempHistory[counter.toString()] = tempCellGroup[i];
                        counter+=1;
                    }

                    previousSaveLogLength = currentSaveLogLength;
                    notebook.model.metadata.set("executionHistory",tempHistory)

                    console.log("after", notebook.model.metadata.get("executionHistory"));
                }
               
        });

    }


    let notebookOpener = new NotebookOpener(docManager, notebooks);
    let scriptOpener = new ScriptOpener(docManager, notebooks);

    // Initialize clipboard for copying cells.
    let clipboard = new Clipboard(gatherModel);
    clipboard.addListener({
        onCopy: () => {
            notificationExtension.showMessage("Copied cells to clipboard.");
        }
    });

    // Controller for global UI state.
    new GatherController(gatherModel, executionSlicer, clipboard, notebookOpener, scriptOpener);

    let cellFetcher = new CellFetcher(notebooks);
    let cellProgramResolver = new CellProgramResolver(executionSlicer);
    let cellEditorResolver = new LabCellEditorResolver(cellFetcher);
    let cellOutputResolver = new LabCellOutputResolver(cellFetcher);
    let markerManager = new MarkerManager(gatherModel, cellProgramResolver, cellEditorResolver, cellOutputResolver);

    const executionLogger = new ExecutionLoggerExtension(executionSlicer, gatherModel, app.commands, markerManager);
    app.docRegistry.addWidgetExtension('Notebook', executionLogger);

   

    function addCommand(command: string, label: string, execute: (options?: JSONObject) => void) {
        app.commands.addCommand(command, { label, execute });
        palette.addItem({ command, category: 'Clean Up' });
    }

    addCommand('gather:gatherToClipboard', 'Gather this result to the clipboard', (options: JSONObject) => {
        log("Button: Clicked gather to notebook with selections", {
            selectedDefs: gatherModel.selectedDefs,
            selectedOutputs: gatherModel.selectedOutputs });
        gatherModel.addChosenSlices(...gatherModel.selectedSlices.map(sel => sel.slice));
        gatherModel.requestStateChange(GatherState.GATHER_TO_CLIPBOARD);
    });

    addCommand('gather:gatherToNotebook', 'Gather this result into a new notebook', () => {
        if (gatherModel.selectedSlices.length >= 1) {
            log("Button: Clicked gather to notebook with selections", {
                selectedDefs: gatherModel.selectedDefs,
                selectedOutputs: gatherModel.selectedOutputs });
            gatherModel.addChosenSlices(...gatherModel.selectedSlices.map(sel => sel.slice));
            gatherModel.requestStateChange(GatherState.GATHER_TO_NOTEBOOK);
        }
    });

    addCommand('gather:gatherToScript', 'Gather this result into a new script', () => {
        if (gatherModel.selectedSlices.length >= 1) {
            log("Button: Clicked gather to script with selections", {
                selectedDefs: gatherModel.selectedDefs,
                selectedOutputs: gatherModel.selectedOutputs });
            gatherModel.addChosenSlices(...gatherModel.selectedSlices.map(sel => sel.slice));
            gatherModel.requestStateChange(GatherState.GATHER_TO_SCRIPT);
        }
    });

    // TODO: re-enable this feature for Jupyter Lab.
    /*
    addCommand('gather:gatherFromHistory', 'Compare previous versions of this result', () => {

        const panel = notebooks.currentWidget;
        if (panel && panel.content && panel.content.activeCell.model.type === 'code') {
            const activeCell = panel.content.activeCell;
            let slicer = executionLogger.executionSlicer;
            let cellModel = activeCell.model as ICodeCellModel;
            let slicedExecutions = slicer.sliceAllExecutions(new LabCell(cellModel));
            // TODO: Update this with a real gather-model and real output renderer.
            let historyModel = buildHistoryModel<IOutputModel>(new GatherModel(), activeCell.model.id, slicedExecutions);

            let widget = new HistoryViewer({
                model: historyModel,
                outputRenderer: { render: () => null }
            });

            if (!widget.isAttached) {
                app.shell.addToMainArea(widget);
            }
            app.shell.activateById(widget.id);
        }
    });
    */

    console.log('Activated code gathering tools.');
}

const extension: JupyterLabPlugin<void> = {
    activate: activateExtension,
    id: 'gather:gatherPlugin',
    requires: [ICommandPalette, INotebookTracker, IDocumentManager],
    autoStart: true
};

export default extension;
