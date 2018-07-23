import $ = require('jquery');
import Jupyter = require('base/js/namespace');
import { CodeCell } from 'base/js/namespace';
import { ControlFlowGraph } from "../slicing/ControlFlowAnalysis";
import { dataflowAnalysis } from '../slicing/DataflowAnalysis';
import * as python3 from '../parsers/python/python3';
import { ExecutionLogSlicer } from '../slicing/ExecutionSlicer';
import { NotebookCell, copyCodeCell } from './NotebookCell';


export function small_test(code: string) {
    const ast = python3.parse(code);
    const cfg = new ControlFlowGraph(ast);
    const dfa = dataflowAnalysis(cfg);
    console.log('dfa', dfa);
}

class ExecutionLogger {
    readonly executionSlicer = new ExecutionLogSlicer();

    constructor() {
        /**
         * Potentially relevant devents:
         * - execute.CodeCell (start of execution)
         * - finished_execute.CodeCell (end of execution, before input prompt is updated)
         * - shell_reply.Kernel (end of execution, in kernel)
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
}
