import Jupyter = require('base/js/namespace');
import { Cell, CodeCell, notification_area, Notebook } from 'base/js/namespace';
import { Widget } from '@phosphor/widgets';

import { NotebookCell, copyCodeCell } from './NotebookCell';
import { ExecutionLogSlicer, SlicedExecution } from '../slicing/ExecutionSlicer';
import { MarkerManager, ICell, CellEditorResolver, CellOutputResolver } from '../packages/cell';

import { GatherModel } from '../packages/gather/model';
import { GatherController } from '../packages/gather/controller';

import { GatherToClipboardButton, ClearButton, GatherToNotebookButton } from './buttons';
import { ICellClipboard, IClipboardListener } from '../packages/gather/clipboard';

import '../../style/nb-vars.css';
import '../../style/index.css';
import { INotebookOpener } from '../packages/gather/opener';

/**
 * Widget for gather notifications.
 */
var notificationWidget: Jupyter.NotificationWidget;

/**
 * Logs cell executions.
 */
var executionLogger: ExecutionLogger;

/**
 * Logs each cell execution.
 */
class ExecutionLogger {
    readonly executionSlicer = new ExecutionLogSlicer();
    private _cellWithUndefinedCount: ICell;
    private _lastExecutionCount: number;

    constructor() {
        // We don't know the order that we will receive events for the kernel finishing execution and
        // a cell finishing execution, so this helps us pair execution count to an executed cell.
        Jupyter.notebook.events.on('shell_reply.Kernel', (
                _: Jupyter.Event, data: { reply: { content: Jupyter.ShellReplyContent }}) => {
            if (this._cellWithUndefinedCount) {
                console.log("Defining cell execution count after the fact...");
                this._cellWithUndefinedCount.executionCount = data.reply.content.execution_count;
                this.executionSlicer.logExecution(this._cellWithUndefinedCount);
                this._cellWithUndefinedCount = undefined;
            } else {
                this._lastExecutionCount = data.reply.content.execution_count;
            }
        });
        Jupyter.notebook.events.on('finished_execute.CodeCell', (_: Jupyter.Event, data: { cell: CodeCell }) => {
            let cellClone = copyCodeCell(data.cell);
            const cell = new NotebookCell(cellClone);
            if (this._lastExecutionCount) {
                cellClone.input_prompt_number = this._lastExecutionCount;
                this.executionSlicer.logExecution(cell);
                this._lastExecutionCount = undefined;
            } else {
                this._cellWithUndefinedCount = cell;
            }
        });
    }
}

/**
 * Get a cell from the notebook with the specified properties.
 */
function getCellWidget(notebook: Notebook, cellId: string, executionCount?: number): Cell {
    let matchingCells = notebook.get_cells()
    .filter((c) => {
        if (c.cell_id != cellId) return false;
        if (executionCount != undefined) {
            if (!(c instanceof CodeCell)) return false;
            if ((c as CodeCell).input_prompt_number != executionCount) return false;
        }
        return true;
    });
    if (matchingCells.length > 0) {
        return matchingCells.pop();
    }
    return null;
}

/**
 * Resolve the active editors for cells in Jupyter notebook.
 */
class NotebookCellEditorResolver implements CellEditorResolver {
    /**
     * Construct a new cell editor resolver.
     */
    constructor(notebook: Notebook) {
        this._notebook = notebook;
    }

    resolve(cell: ICell): CodeMirror.Editor {
        let cellWidget = getCellWidget(this._notebook, cell.id, cell.executionCount);
        if (cellWidget) {
            return cellWidget.code_mirror;
        }
        return null;
    }

    private _notebook: Notebook;
}

/**
 * Finds HTML elements for cell outputs in a notebook.
 */
class NotebookCellOutputResolver implements CellOutputResolver {
    /**
     * Construct a new cell editor resolver.
     */
    constructor(notebook: Notebook) {
        this._notebook = notebook;
    }

    resolve(cell: ICell): HTMLElement[] {
        let cellWidget = getCellWidget(this._notebook, cell.id, cell.executionCount);
        let outputElements = [];
        if (cellWidget) {
            let cellElement = cellWidget.element[0];
            var outputNodes = cellElement.querySelectorAll(".output_subarea");
            for (var i = 0; i < outputNodes.length; i++) {
                if (outputNodes[i] instanceof HTMLElement) {
                    outputElements.push(outputNodes[i] as HTMLElement);
                }
            }
        }
        return outputElements;
    }

    private _notebook: Notebook;
}

/**
 * Highlights gatherable entities.
 */
class ResultsHighlighter {

    private _markerManager: MarkerManager;

    constructor(gatherModel: GatherModel, markerManager: MarkerManager) {
        this._markerManager = markerManager;
        Jupyter.notebook.events.on('finished_execute.CodeCell', (_: Jupyter.Event, data: { cell: CodeCell }) => {
            let cell = data.cell;
            let nbCell = new NotebookCell(cell);
            if (!nbCell.hasError) {
                gatherModel.lastExecutedCell = nbCell;
            }
        });

        document.body.addEventListener("mouseup", (event: MouseEvent) => {
            this._markerManager.handleClick(event);
        });
    }
}

/**
 * Convert program slice to list of cell JSONs
 */
function sliceToCellJson(slice: SlicedExecution): CellJson[] {
    const SHOULD_SLICE_CELLS = true;
    return slice.cellSlices
    .map((cellSlice) => {
        let slicedCell = cellSlice.cell;
        if (SHOULD_SLICE_CELLS) {
            slicedCell = slicedCell.copy();
            slicedCell.text = cellSlice.textSliceLines;
        }
        if (slicedCell instanceof NotebookCell) {
            return slicedCell.model.toJSON();
        }
    }).filter((c) => c != undefined);
}

/**
 * Gather code to the clipboard.
 */
class Clipboard implements ICellClipboard {

    addListener(listener: IClipboardListener) {
        this._listeners.push(listener);
    }

    copy(slice: SlicedExecution) {
        if (slice) {
            Jupyter.notebook.clipboard = [];
            let cellsJson = sliceToCellJson(slice);
            cellsJson.forEach((c) => {
                Jupyter.notebook.clipboard.push(c);
            });
            Jupyter.notebook.enable_paste();
            this._listeners.forEach((listener) => listener.onCopy(slice, this));
        }
    }

    private _listeners: IClipboardListener[] = [];
}

/**
 * Opens new notebooks containing program slices.
 */
class NotebookOpener implements INotebookOpener {

    // Pass in the current notebook. This class will open new notebooks.
    constructor(thisNotebook: Notebook) {
        this._notebook = thisNotebook;
    }

    openNotebookForSlice(slice: SlicedExecution) {

        // Make boilerplate, empty notebook JSON.
        let notebookJson = this._notebook.toJSON();
        notebookJson.cells = [];

        // Replace the notebook model's cells with the copied cells.
        if (slice) {
            let cellsJson = sliceToCellJson(slice);
            for (let i = 0; i < cellsJson.length; i++) {
                let cellJson = cellsJson[i];
                notebookJson.cells.push(cellJson);
            }

            // Save the gathered code to a new notebook, and then open it.
            let model = { type: "notebook", content: notebookJson };
            this._notebook.contents.save("GatheredCode.ipynb", model).then(() => {
                window.open("/notebooks/GatheredCode.ipynb?kernel_name=python3", '_blank');
            });
        }
    }

    private _notebook: Notebook;
}

/**
 * Prefix for all gather actions.
 */
const GATHER_PREFIX = 'gather_extension';

export function load_ipython_extension() {
    console.log('extension started');

    // Object containing global UI state.
    let gatherModel = new GatherModel();

    // Plugin initializations.
    executionLogger = new ExecutionLogger();
    let markerManager = new MarkerManager(gatherModel,
        new NotebookCellEditorResolver(Jupyter.notebook),
        new NotebookCellOutputResolver(Jupyter.notebook));
    new ResultsHighlighter(gatherModel, markerManager);

    // Initialize clipboard for copying cells.
    let clipboard = new Clipboard();
    clipboard.addListener({
        onCopy: () => {    
            if (notificationWidget) {
                notificationWidget.set_message("Copied cells. To paste, type 'v' or right-click.", 5000);
            }
        }
    });

    // Initialize utility for opening new notebooks.
    let opener = new NotebookOpener(Jupyter.notebook);

    // Controller for global UI state.
    new GatherController(gatherModel, executionLogger.executionSlicer, clipboard, opener);

    // Set up toolbar with gather actions.
    let gatherToClipboardButton = new GatherToClipboardButton(gatherModel);
    let gatherToNotebookButton = new GatherToNotebookButton(gatherModel);
    let clearButton = new ClearButton(gatherModel);

    // Create buttons for gathering.
    let gatherToClipboardFullActionName = Jupyter.actions.register(
        gatherToClipboardButton.action, gatherToClipboardButton.actionName, GATHER_PREFIX);
    let gatherToNotebookFullActionName = Jupyter.actions.register(
        gatherToNotebookButton.action, gatherToNotebookButton.actionName, GATHER_PREFIX);
    let clearFullActionName = Jupyter.actions.register(
        clearButton.action, clearButton.actionName, GATHER_PREFIX);
    let buttonsGroup = Jupyter.toolbar.add_buttons_group([
        { label: gatherToClipboardButton.label, action: gatherToClipboardFullActionName },
        { label: gatherToNotebookButton.label, action: gatherToNotebookFullActionName },
        { label: clearButton.label, action: clearFullActionName }
    ]);
    
    // Add a label to the gathering part of the toolbar.
    let gatherLabel = document.createElement("div");
    gatherLabel.textContent = "Gather to:";
    gatherLabel.classList.add("jp-Toolbar-gatherlabel");
    buttonsGroup[0].insertBefore(gatherLabel, buttonsGroup.children()[0]);

    // Finish initializing the buttons.
    gatherToClipboardButton.node = new Widget({ node: buttonsGroup.children()[1] });
    gatherToNotebookButton.node = new Widget({ node: buttonsGroup.children()[2] })
    clearButton.node = new Widget({ node: buttonsGroup.children()[3] });

    // Add UI elements
    // const menu = $('#menus ul.navbar-nav');
    // const gather = $('<li class="dropdown"></li>').appendTo(menu);
    // $('<a href="#" class="dropdown-toggle" data-toggle="dropdown">Gather</a>').appendTo(gather);
    // const list = $('<ul id="gather_menu" class="dropdown-menu"></ul>').appendTo(gather);
    // $('<li id="gather-to-notebook" title="Gather to notebook"><a href="#">Gather to notebook</a></li>')
    //     .click(() => { gatherToNotebook(Jupyter.notebook) }).appendTo(list);
    // $('<li id="gather-to-script" title="Gather to script"><a href="#">Gather to script</a></li>').appendTo(list);
    // $('<li id="gather-to-clipboard title="Gather to clipboard"><a href="#">Gather to clipboard</a></li>')
    //     .click(() => gatherToClipboard()).appendTo(list);
    
    notificationWidget = notification_area.new_notification_widget("gather");
}
