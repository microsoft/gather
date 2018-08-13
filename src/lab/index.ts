import { toArray } from '@phosphor/algorithm';
import { CommandRegistry } from '@phosphor/commands';
import { IDisposable, DisposableDelegate } from '@phosphor/disposable';

import { JupyterLab, JupyterLabPlugin } from '@jupyterlab/application';
import { IClientSession, ICommandPalette } from '@jupyterlab/apputils';
import { Clipboard } from '@jupyterlab/apputils';
import { ICellModel, CodeCell, ICodeCellModel } from '@jupyterlab/cells';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { FileEditor } from '@jupyterlab/fileeditor';
import { NotebookPanel, INotebookModel, Notebook, INotebookTracker } from '@jupyterlab/notebook';
import { IObservableList } from '@jupyterlab/observables';
import { IOutputModel } from '@jupyterlab/rendermime';

import { ToolbarCheckbox } from './ToolboxCheckbox';
import { HistoryViewer, buildHistoryModel } from '../packages/history';
import { CellProgram, DataflowDirection, LocationSet } from '../slicing/Slice';

import { JSONObject } from '@phosphor/coreutils';
import { LabCell, copyICodeCellModel } from './LabCell';
import { GatherWidget } from '../packages/contextmenu/widget';
import { ExecutionLogSlicer } from '../slicing/ExecutionSlicer';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { NotificationWidget } from '../packages/notification/widget';

import '../../style/lab-vars.css';
import '../../style/index.css';
import { GatherModel } from '../packages/gather';

/**
 * Try to only write Jupyter Lab-specific implementation code in this file.
 * If there is any program analysis / text processing, widgets that could be shared with Jupyter
 * notebook, try to put those in another shared file.
 */

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

/**
 * Extension for tracking sequences of cells executed in a notebook.
 */
class ExecutionLoggerExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {

    // private _markerManager: MarkerManager = new MarkerManager();
    // private _commands: CommandRegistry;
    private _executionSlicer: ExecutionLogSlicer = new ExecutionLogSlicer();

    constructor(commands: CommandRegistry) {
        // this._commands = commands;
    }

    get executionSlicer(): ExecutionLogSlicer {
        return this._executionSlicer;
    }

    createNew(panel: NotebookPanel, context: DocumentRegistry.IContext<INotebookModel>): IDisposable {
        panel.notebook.model.cells.changed.connect(
            (cells, value) =>
                this.onCellsChanged(panel.notebook, panel.session, cells, value),
            this);

        /*
        // Listen for all clicks on definition markers to trigger gathering.
        // XXX: For some reason (tested in both Chrome and Edge), "click" events get dropped
        // sometimes when you're clicking on a cell. Mouseup doesn't. Eventually should find
        // the solution to supporting clicks.
        panel.notebook.node.addEventListener("mouseup", (event: MouseEvent) => {
            this._markerManager.handleClick(event);
        });
        */

        return new DisposableDelegate(() => {});
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
            const codeCellModel = cellModel as ICodeCellModel;
            // When a cell is added, register for its state changes.
            cellModel.stateChanged.connect((changedCell, cellStateChange) => {

                // If cell has been executed
                if (cellStateChange.name === 'executionCount' && cellStateChange.newValue) {

                    // Clone the cell to take a snapshot of the text..
                    // executionCount may need to be cloned manually, as it won't be set yet
                    // (that's the event that's happening in this handler).
                    let cellClone = copyICodeCellModel(codeCellModel);
                    cellClone.executionCount = cellStateChange.newValue;
                    this._executionSlicer.logExecution(new LabCell(cellClone));

                    // Get the editor instance for the cell.
                    // Legacy code, needs to be updated to new GatherModel
                    /*
                    let cell = notebook.widgets.filter(c => c.model.id == cellModel.id).pop();
                    let editor = (cell.editor as CodeMirrorEditor).editor;
                    this._markerManager.highlightDefs(editor, cell.model.id, 
                        (cellId: string, location: ILocation) => {
                            this._commands.execute("livecells:gatherToClipboard", {
                                cellId: cellId,
                                location: {
                                    first_line: location.first_line,
                                    first_column: location.first_column,
                                    last_line: location.last_line,
                                    last_column: location.last_column
                                }
                            });
                        });
                    */
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

function activateExtension(app: JupyterLab, palette: ICommandPalette, notebooks: INotebookTracker, docManager: IDocumentManager) {

    console.log('livecells start');

    // Disable live programming feature for now
    // app.docRegistry.addWidgetExtension('Notebook', new LiveCheckboxExtension());

    const executionLogger = new ExecutionLoggerExtension(app.commands);
    app.docRegistry.addWidgetExtension('Notebook', executionLogger);
    const notificationExtension = new NotifactionExtension();
    app.docRegistry.addWidgetExtension('Notebook', notificationExtension);

    let gatherWidget = new GatherWidget({
        gatherCallback: () => { app.commands.execute("livecells:gatherToClipboard"); },
        historyCallback: () => { app.commands.execute("livecells:gatherFromHistory"); }
    });

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

    function addCommand(command: string, label: string, execute: (options?: JSONObject) => void) {
        app.commands.addCommand(command, { label, execute });
        palette.addItem({ command, category: 'Clean Up' });
    }

    addCommand('livecells:gatherToClipboard', 'Gather this result to the clipboard', (options: JSONObject) => {

        const panel = notebooks.currentWidget;
        const SHOULD_SLICE_CELLS = true;

        // Choose cell from options or the active cell.
        let chosenCell;
        if (options.cellId) {
            let cells = notebooks.currentWidget.notebook.widgets.filter(cell => cell.model.id == options.cellId);
            if (cells.length > 0) {
                chosenCell = cells.pop();
            }
        }
        if (!chosenCell && panel && panel.notebook && panel.notebook.activeCell && panel.notebook.activeCell.model.type === 'code') {
            chosenCell = panel.notebook.activeCell;
        }

        if (!chosenCell || !(chosenCell.model.type == 'code')) return;

        // If lines were selected from the cell, only gather on those lines. Otherwise, gather whole cell.
        let seedLocations = undefined;
        if (options.location) {
            let oloc = options.location as JSONObject;
            if (oloc.first_line != undefined && oloc.first_column != undefined && oloc.last_line != undefined && oloc.last_column != undefined) {
                seedLocations = new LocationSet({
                    first_line: oloc.first_line as number,
                    first_column: oloc.first_column as number,
                    last_line: oloc.last_line as number,
                    last_column: oloc.last_column as number
                });
            }
        }

        let slicer = executionLogger.executionSlicer;
        let cellModel = chosenCell.model as ICodeCellModel;
        let slicedExecutions = slicer.sliceAllExecutions(new LabCell(cellModel), seedLocations);
        let latestSlicedExecution = slicedExecutions.pop();
        let cells = latestSlicedExecution.cellSlices
            .map(cellSlice => {
                let slicedCell = cellSlice.cell;
                if (SHOULD_SLICE_CELLS) {
                    slicedCell = slicedCell.copy();
                    slicedCell.text = cellSlice.textSliceLines;
                }
                return slicedCell;
            });

        copyCellsToClipboard(cells.map(c => {
            if (c instanceof LabCell) return c.model;
        }));
        notificationExtension.showMessage("Copied cells to clipboard. Right-click or type 'V' to paste.");

    });

    addCommand('livecells:gatherToNotebook', 'Gather this result into a new notebook', () => {
        const panel = notebooks.currentWidget;
        if (panel && panel.notebook && panel.notebook.activeCell.model.type === 'code') {
            const activeCell = panel.notebook.activeCell;
            let slicer = executionLogger.executionSlicer;
            let cellModel = activeCell.model as ICodeCellModel;
            let slice = slicer.sliceLatestExecution(new LabCell(cellModel));
            let cells = slice.cellSlices.map(cellSlice => cellSlice.cell);

            docManager.newUntitled({ ext: 'ipynb' }).then(model => {
                const widget = docManager.open(model.path, undefined, panel.session.kernel.model) as NotebookPanel;
                const newModel = widget.notebook.model;
                setTimeout(() => {
                    newModel.cells.remove(0); // remove the default blank cell                        
                    newModel.cells.pushAll(cells.map(c => {
                        if (c instanceof LabCell) return c.model;
                    }));
                }, 100);
            });
        }
    });

    addCommand('livecells:gatherToScript', 'Gather this result into a new script', () => {
        const panel = notebooks.currentWidget;
        if (panel && panel.notebook && panel.notebook.activeCell.model.type === 'code') {
            const activeCell = panel.notebook.activeCell;
            let slicer = executionLogger.executionSlicer;
            let cellModel = activeCell.model as ICodeCellModel;
            let slice = slicer.sliceLatestExecution(new LabCell(cellModel));
            let cells = slice.cellSlices.map(cellSlice => cellSlice.cell);
            let scriptText = cells
                .map(cell => cell.text)
                .reduce((buffer, cellText) => { return buffer + cellText + "\n" }, "");

            // TODO: Add back in slice based on fine-grained selection within the cell:
            const selection = getSelectedLines(activeCell.editor);
            console.log(selection);

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
}

/**
 * Plugin for live programming in a notebook (automatically recompute cells based on data dependencies).
 */
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
 * Helper class for keeping track of live programming.
 */
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

    private findStaleCells(changedCell: LabCell, cells: LabCell[]): LabCell[] {
        const program = new CellProgram<LabCell>(changedCell, cells);
        return program.getDataflowCells(DataflowDirection.Forward).map(r => r[0]);
    }

    private showStaleness(cell: CodeCell, stale: boolean) {
        cell.inputArea.editorWidget.node.style.backgroundColor = stale ? 'pink' : null;
    }

    public onCellsChanged(
        notebook: Notebook,
        session: IClientSession,
        allCells: IObservableList<ICellModel>,
        cellListChange: IObservableList.IChangedArgs<ICellModel>
    ): void {

        // When a cell is added, register for its state changes.
        if (cellListChange.type === 'add') {

            const cell = cellListChange.newValues[0] as ICellModel;
            cell.stateChanged.connect((changedCell, cellStateChange) => {

                // If cell has been executed
                if (cellStateChange.name === 'executionCount' && cellStateChange.newValue) {

                    const codeCell = notebook.widgets.find(c => c.model.id === cell.id) as CodeCell;
                    this.showStaleness(codeCell, false);

                    // If this cell executing is due to the user
                    if (!this.currentlyExecutingCells) {
                        // Depending on the checkbox, we either execute the dependent cells
                        // or show that they are stale.
                        const handleStaleness: (cell: CodeCell) => Promise<any> = this.checkbox.checked ?
                            cellWidget => CodeCell.execute(cellWidget, session) :
                            cellWidget => {
                                this.showStaleness(cellWidget, true);
                                return Promise.resolve(0);
                            }

                        if (changedCell.type == "code") {
                            let changedLabCell = new LabCell(changedCell as ICodeCellModel);
                            let allLabCells = toArray(allCells).filter(c => c.type == "code")
                                .map(c => new LabCell(c as ICodeCellModel));
                            const tasks = this.findStaleCells(changedLabCell, allLabCells)
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
                }
            }, this);
        }
    }
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

const extension: JupyterLabPlugin<void> = {
    activate: activateExtension,
    id: 'live-code-cells:liveCodePlugin',
    requires: [ICommandPalette, INotebookTracker, IDocumentManager],
    autoStart: true
};

export default extension;
