import $ = require('jquery');
import Jupyter = require('base/js/namespace');
import { Cell, CodeCell, notification_area } from 'base/js/namespace';

import { NotebookCell, copyCodeCell } from './NotebookCell';
import { ExecutionLogSlicer } from '../slicing/ExecutionSlicer';
import { MarkerManager, ICell } from '../packages/cell';

import '../../style/nb-vars.css';
import '../../style/index.css';
import { ILocation } from '../parsers/python/python_parser';
import { LocationSet } from '../slicing/Slice';


/**
 * Widget for gather notifications.
 */
var notificationWidget: Jupyter.NotificationWidget;

/**
 * Logs cell executions.
 */
var executionLogger: ExecutionLogger;
var markerManager: MarkerManager;

class ExecutionLogger {
    readonly executionSlicer = new ExecutionLogSlicer();

    constructor() {
        let lastExecutionCount: number;
        Jupyter.notebook.events.on('shell_reply.Kernel', (
            _: Jupyter.Event, data: { reply: { content: Jupyter.ShellReplyContent }}) => {
            lastExecutionCount = data.reply.content.execution_count;
        });
        Jupyter.notebook.events.on('finished_execute.CodeCell', (_: Jupyter.Event, data: { cell: CodeCell }) => {
            let cellClone = copyCodeCell(data.cell);
            cellClone.input_prompt_number = lastExecutionCount;
            const cell = new NotebookCell(cellClone);
            this.executionSlicer.logExecution(cell);
        });
    }
}

/**
 * Highlights definitions in executed cells.
 */
class DefHighlighter {

    private _markerManager: MarkerManager;

    constructor(markerManager: MarkerManager) {
        this._markerManager = markerManager;
        Jupyter.notebook.events.on('finished_execute.CodeCell', (_: Jupyter.Event, data: { cell: CodeCell }) => {
            let cell = data.cell;
            let editor = cell.code_mirror;
            let nbCell = new NotebookCell(cell);
            if (!nbCell.hasError) {
                this._markerManager.highlightDefs(editor, cell.cell_id, 
                    (cellId: string, location: ILocation) => {
                        // gatherToClipboard({ cellId: cellId, location: location });
                        highlightDependencies(cellId, location);
                    });
            }
        });

        document.body.addEventListener("mouseup", (event: MouseEvent) => {
            this._markerManager.handleClick(event);
        });
    }
}

/**
 * Get a cell from the notebook with the specified properties.
 */
function getCellWidget(cellId: string, executionCount?: number) {
    let matchingCells = Jupyter.notebook.get_cells()
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
 * Highlight the dependencies for a selection.
 */
function highlightDependencies(cellId: string, selection: ILocation) {
    let cellWidget = getCellWidget(cellId);
    if (!cellWidget) return;
    let cell = new NotebookCell(cellWidget as CodeCell);
    let seedLocations = new LocationSet(selection);
    let slice = executionLogger.executionSlicer.sliceLatestExecution(cell, seedLocations);
    slice.cellSlices.forEach((cellSlice) => {
        let cell = cellSlice.cell;
        let otherCell = getCellWidget(cell.id, cell.executionCount);
        if (otherCell && otherCell instanceof CodeCell) {
            markerManager.highlightDependencies(otherCell.code_mirror, cellSlice.slice);
        }
    });
}

/**
 * Gather code to the clipboard.
 */
function gatherToClipboard(options: IGatherOptions) {

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

    /**
     * Plugin initializations.
     */
    executionLogger = new ExecutionLogger();
    markerManager = new MarkerManager();
    new DefHighlighter(markerManager);

    // Add UI elements
    const menu = $('#menus ul.navbar-nav');
    const gather = $('<li class="dropdown"></li>').appendTo(menu);
    $('<a href="#" class="dropdown-toggle" data-toggle="dropdown">Gather</a>').appendTo(gather);
    const list = $('<ul id="gather_menu" class="dropdown-menu"></ul>').appendTo(gather);
    $('<li id="gather-to-notebook" title="Gather to notebook"><a href="#">Gather to notebook</a></li>').click(gatherToNotebook).appendTo(list);
    $('<li id="gather-to-script" title="Gather to script"><a href="#">Gather to script</a></li>').appendTo(list);
    $('<li id="gather-to-clipboard title="Gather to clipboard"><a href="#">Gather to clipboard</a></li>')
        .click(() => gatherToClipboard({})).appendTo(list);
    notificationWidget = notification_area.new_notification_widget("gather");
}
