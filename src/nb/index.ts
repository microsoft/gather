import $ = require('jquery');
import Jupyter = require('base/js/namespace');
import { CodeCell, notification_area } from 'base/js/namespace';
import { ExecutionLogSlicer } from '../slicing/ExecutionSlicer';
import { NotebookCell, copyCodeCell } from './NotebookCell';
import '../../style/index.css';


/**
 * Class to be added to widgets in the notebook implementation.
 */
// const NOTEBOOK_CLASS = "nb";

class ExecutionLogger {
    readonly executionSlicer = new ExecutionLogSlicer();

    constructor() {
        /**
         * Other relevant events:
         * - execute.CodeCell (start of execution)
         */
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

const executionLogger = new ExecutionLogger();
var notificationWidget: Jupyter.NotificationWidget;

function gatherToClipboard() {

    const activeCell = Jupyter.notebook.get_selected_cell();
    if (activeCell.cell_type != 'code') return;

    const SHOULD_SLICE_CELLS = true;
    let cell = new NotebookCell(activeCell as CodeCell);
    let slice = executionLogger.executionSlicer.sliceLatestExecution(cell);
    let cells = slice.cellSlices
    .map(([c, lines]) => {
        let slicedCell = c;
        if (SHOULD_SLICE_CELLS) {
            slicedCell = c.copy();
            slicedCell.text =
                slicedCell.text.split("\n")
                    .filter((_, i) => lines.contains(i))
                    .join("\n");
        }
        return slicedCell;
    });
    
    // Copy cells to clipboard
    Jupyter.notebook.clipboard = [];
    cells.forEach((c) => {
        if (c instanceof NotebookCell) {
            console.log("Copying", c.model.toJSON());
            Jupyter.notebook.clipboard.push(c.model.toJSON());
        }
    });
    Jupyter.notebook.enable_paste();

    // If lines were selected from the cell, only gather on those lines. Otherwise, gather whole cell.
    // let relevantLineNumbers = new NumberSet();
    // let cellLength = cell.text.split("\n").length;
    // for (let i = 0; i < cellLength; i++) relevantLineNumbers.add(i);

    if (notificationWidget) {
        notificationWidget.set_message("Copied cells. To paste, type 'v' or right-click.", 5000);
    }
}

function gatherToNotebook() {
    const activeCell = Jupyter.notebook.get_selected_cell();
    if (activeCell.cell_type === 'code') {
        let cell = new NotebookCell(activeCell as CodeCell);
        let slice = executionLogger.executionSlicer.sliceLatestExecution(cell);
        let cells = slice.cellSlices.map(([cell, _]) => cell);
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

    // Add UI elements
    const menu = $('#menus ul.navbar-nav');
    const gather = $('<li class="dropdown"></li>').appendTo(menu);
    $('<a href="#" class="dropdown-toggle" data-toggle="dropdown">Gather</a>').appendTo(gather);
    const list = $('<ul id="gather_menu" class="dropdown-menu"></ul>').appendTo(gather);
    $('<li id="gather-to-notebook" title="Gather to notebook"><a href="#">Gather to notebook</a></li>').click(gatherToNotebook).appendTo(list);
    $('<li id="gather-to-script" title="Gather to script"><a href="#">Gather to script</a></li>').appendTo(list);
    $('<li id="gather-to-clipboard title="Gather to clipboard"><a href="#">Gather to clipboard</a></li>').click(gatherToClipboard).appendTo(list);
    notificationWidget = notification_area.new_notification_widget("gather");
}
