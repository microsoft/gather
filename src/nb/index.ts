import $ = require('jquery');
import Jupyter = require('base/js/namespace');
import { Cell, CodeCell, notification_area, Notebook } from 'base/js/namespace';

import { NotebookCell, copyCodeCell } from './NotebookCell';
import { ExecutionLogSlicer } from '../slicing/ExecutionSlicer';
import { MarkerManager, ICell, CellEditorResolver } from '../packages/cell';

import { ILocation } from '../parsers/python/python_parser';
import { GatherModel } from '../packages/gather/model';
import { GatherController } from '../packages/gather/controller';

import '../../style/nb-vars.css';
import '../../style/index.css';

/**
 * Widget for gather notifications.
 */
// var notificationWidget: Jupyter.NotificationWidget;

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
                this._lastExecutionCount = undefined;
            } else {
                this._cellWithUndefinedCount = cell;
            }
            this.executionSlicer.logExecution(cell);
        });
    }
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

    /**
     * Get a cell from the notebook with the specified properties.
     */
    getCellWidget(cellId: string, executionCount?: number): Cell {
        let matchingCells = this._notebook.get_cells()
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

    resolve(cell: ICell): CodeMirror.Editor {
        let cellWidget = this.getCellWidget(cell.id, cell.executionCount);
        if (cellWidget) {
            return cellWidget.code_mirror;
        }
        return null;
    }

    private _notebook: Notebook;
}

/**
 * Highlights definitions in executed cells.
 */
class DefHighlighter {

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
 * Gather code to the clipboard.
 */
function gatherToClipboard(options: IGatherOptions) {

    /*
    let cellWidget: Cell;
    let cell: ICell;
    if (options.cellId) {
        cellWidget = getCellWidget(options.cellId);
    } else {
        cellWidget = Jupyter.notebook.get_selected_cell();
    }
    if (cellWidget && cellWidget.cell_type == 'code') {
        cell = new NotebookCell(cellWidget as CodeCell);
    }
    if (!cell) return;

    let seedLocations = undefined;
    if (options.location && options.location.first_line != undefined) {
        seedLocations = new LocationSet(options.location);
    }

    const SHOULD_SLICE_CELLS = true;
    let slice = executionLogger.executionSlicer.sliceLatestExecution(cell, seedLocations);
    let cells = slice.cellSlices
    .map((cellSlice) => {
        let slicedCell = cellSlice.cell;
        if (SHOULD_SLICE_CELLS) {
            slicedCell = slicedCell.copy();
            slicedCell.text = cellSlice.textSliceLines;
        }
        return slicedCell;
    });
    
    // Copy cells to clipboard
    Jupyter.notebook.clipboard = [];
    cells.forEach((c) => {
        if (c instanceof NotebookCell) {
            Jupyter.notebook.clipboard.push(c.model.toJSON());
        }
    });
    Jupyter.notebook.enable_paste();

    if (notificationWidget) {
        notificationWidget.set_message("Copied cells. To paste, type 'v' or right-click.", 5000);
    }
    */
}

/**
 * Options for gathering to clipboard.
 */
interface IGatherOptions {
    /**
     * ID of a cell at which to start gathering.
     */
    cellId?: string;

    /**
     * Location in code for which dependencies should be gathered.
     */
    location?: ILocation;
}

function gatherToNotebook() {
    const activeCell = Jupyter.notebook.get_selected_cell();
    if (activeCell.cell_type === 'code') {
        let cell = new NotebookCell(activeCell as CodeCell);
        let slice = executionLogger.executionSlicer.sliceLatestExecution(cell);
        let cells = slice.cellSlices.map((cellSlice) => cellSlice.cell);
        console.log(cells);

        // Create a new notebook
        const w = window.open('', '_blank');
        Jupyter.contents.new_untitled('', { type: 'notebook' })
            .then((data: { [ path: string ]: string }) => {
                const url: any = Jupyter.notebook.base_url +
                    "/notebooks/" + encodeURIComponent(data.path) +
                    "/kernel_name=python3";
                w.location.href = url;
            });
    }
}

export function load_ipython_extension() {
    console.log('extension started');

    // Object containing global UI state.
    let gatherModel = new GatherModel();

    // Plugin initializations.
    executionLogger = new ExecutionLogger();
    let markerManager = new MarkerManager(gatherModel,
        new NotebookCellEditorResolver(Jupyter.notebook));
    new DefHighlighter(gatherModel, markerManager);

    // Controller for global UI state.
    new GatherController(gatherModel, executionLogger.executionSlicer);

    // Set up toolbar with gather actions.
    let gatherAction = {
        icon: 'fa-level-up',
        help: 'Gather code to clipboard',
        help_index: 'gather-code',
        handler: () => {
            console.log("Gathering up the code");
        }
    };
    let gatherActionName = 'gather-code';
    let prefix = 'gather_extension';
    let gatherFullActionName = Jupyter.actions.register(gatherAction, gatherActionName, prefix);

    let clearAction = {
        icon: 'fa-remove',
        help: 'Clear gather selections',
        help_index: 'clear-selections',
        handler: () => { 
            console.log("Clearing selection");
        }
    }
    let clearActionName = 'clear-selections';
    let clearFullActionName = Jupyter.actions.register(clearAction, clearActionName, prefix);

    Jupyter.toolbar.add_buttons_group([{
        label: 'Gather',
        action: gatherFullActionName
    }, {
        label: 'Clear',
        action: clearFullActionName
    }]);

    // Add UI elements
    const menu = $('#menus ul.navbar-nav');
    const gather = $('<li class="dropdown"></li>').appendTo(menu);
    $('<a href="#" class="dropdown-toggle" data-toggle="dropdown">Gather</a>').appendTo(gather);
    const list = $('<ul id="gather_menu" class="dropdown-menu"></ul>').appendTo(gather);
    $('<li id="gather-to-notebook" title="Gather to notebook"><a href="#">Gather to notebook</a></li>').click(gatherToNotebook).appendTo(list);
    $('<li id="gather-to-script" title="Gather to script"><a href="#">Gather to script</a></li>').appendTo(list);
    $('<li id="gather-to-clipboard title="Gather to clipboard"><a href="#">Gather to clipboard</a></li>')
        .click(() => gatherToClipboard({})).appendTo(list);
    // notificationWidget = notification_area.new_notification_widget("gather");
    notification_area.new_notification_widget("gather");
}
