import $ = require('jquery');
import Jupyter = require('base/js/namespace');
import { ControlFlowGraph } from "../slicing/ControlFlowAnalysis";
import { dataflowAnalysis } from '../slicing/DataflowAnalysis';
import * as python3 from '../parsers/python/python3';
import { CodeCell, Output } from 'base/js/namespace';
import { ProgramBuilder, SliceableCell } from '../lab/ProgramBuilder';
import { NumberSet, range } from '../slicing/Set';
import { ILocation } from '../parsers/python/python_parser';
import { SlicedExecution } from '../packages/history/compute';


export function small_test(code: string) {
    const ast = python3.parse(code);
    const cfg = new ControlFlowGraph(ast);
    const dfa = dataflowAnalysis(cfg);
    console.log('dfa', dfa);
}


/**
 * A record of when a cell was executed.
 */
export class CellExecution {
    constructor(
        public cellId: string,
        public executionCount: number,
        public executionTime: Date
    ) { }
}

function lineRange(loc: ILocation): NumberSet {
    return range(loc.first_line, loc.last_line + (loc.last_column ? 1 : 0));
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


class ExecutionLogger {
    private executionLog = new Array<CellExecution>();
    private programBuilder = new ProgramBuilder<CodeCell, Jupyter.Output>();

    constructor() {
        Jupyter.notebook.events.on('execute.CodeCell', (evt: Jupyter.Event, data: { cell: CodeCell }) => {
            const cell = data.cell;
            this.programBuilder.add({
                id: cell.cell_id,
                executionCount: cell.input_prompt_number,
                text: cell.code_mirror.getValue(),
                hasError: false, // 💩 FIXME
                model: cell,
                outputs: cell.output_area.outputs
            });
            this.executionLog.push(new CellExecution(
                cell.cell_id, cell.input_prompt_number, new Date()));
        });
    }

    /**
     * Get slice for the latest execution of a cell.
     */
    public sliceForLatestExecution(cell: CodeCell) {
        // XXX: This computes more than it has to, performing a slice on each execution of a cell
        // instead of just its latest computation. Optimize later if necessary.
        return this.slicedExecutions(cell).pop();
    }

    /**
     * Get slices of the necessary code for all executions of a cell.
     * Relevant line numbers are relative to the cell's start line (starting at first line = 0).
     */
    public slicedExecutions(cell: CodeCell, relevantLineNumbers?: NumberSet) {

        return this.executionLog
            .filter((execution) => execution.cellId == cell.cell_id)
            .map((execution) => {

                // Slice the program leading up to that cell.
                let program = this.programBuilder.buildTo(execution.cellId, execution.executionCount);
                let sliceStartLines = new NumberSet();
                let cellLines = program.cellToLineMap[execution.cellId][execution.executionCount];
                let cellFirstLine = Math.min(...cellLines.items);
                if (relevantLineNumbers) {
                    sliceStartLines.add(...relevantLineNumbers.items.map((l) => l + cellFirstLine));
                } else {
                    sliceStartLines = sliceStartLines.union(cellLines);
                }
                let sliceLines = slice(program.code, sliceStartLines);

                // Get the relative offsets of slice lines in each cell.
                let relativeSliceLines: { [cellId: string]: { [executionCount: number]: NumberSet } } = {};
                let cellOrder = new Array<SliceableCell<CodeCell, Output>>();
                sliceLines.items.forEach(lineNumber => {
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

                let cellSlices = cellOrder.map((sliceCell): [SliceableCell<CodeCell, Output>, NumberSet] => {
                    return [sliceCell, relativeSliceLines[sliceCell.id][sliceCell.executionCount]];
                });
                return new SlicedExecution(execution.executionTime, cellSlices);
            })
    }
}

const executionLogger = new ExecutionLogger();

function gatherToNotebook() {
    const activeCell = Jupyter.notebook.get_selected_cell();
    if (activeCell.cell_type === 'code') {
        let slice = executionLogger.sliceForLatestExecution(activeCell as CodeCell);
        let cells = slice.cellSlices.map(([cell, _]) => cell);
        console.log(cells);

        // Create a new notebook
        const w = window.open('', '_blank');
        Jupyter.contents.new_untitled('', { type: 'notebook' })
            .then(data => {
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
