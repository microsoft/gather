import { ICell } from "../packages/cell";
import { NumberSet } from "./Set";
import { ProgramBuilder } from "./ProgramBuilder";
import { slice } from "./Slice";

/**
 * A record of when a cell was executed.
 */
export class CellExecution {
    constructor(
        public cellId: string,
        public executionCount: number,
        public executionTime: Date,
        public hasError: boolean
    ) { }
}

/**
 * A slice over a version of executed code.
 */
export class SlicedExecution {
    constructor(
        public executionTime: Date,
        public cellSlices: Array<[ICell, NumberSet]>
    ) { }
}

/**
 * Makes slice on a log of executed cells.
 */
export class ExecutionLogSlicer {

    private executionLog = new Array<CellExecution>();
    private programBuilder = new ProgramBuilder();

    /**
     * Add a cell execution to the log.
     */
    public logExecution(cell: ICell) {
        this.programBuilder.add(cell);
        this.executionLog.push(new CellExecution(cell.id, cell.executionCount, new Date(), cell.hasError));
    }

    /**
     * Get slice for the latest execution of a cell.
     */
    public sliceLatestExecution(cell: ICell, relevantLineNumbers?: NumberSet): SlicedExecution {
        // XXX: This computes more than it has to, performing a slice on each execution of a cell
        // instead of just its latest computation. Optimize later if necessary.
        return this.sliceAllExecutions(cell, relevantLineNumbers).pop();
    }

    /**
     * Get slices of the necessary code for all executions of a cell.
     * Relevant line numbers are relative to the cell's start line (starting at first line = 0).
     */
    public sliceAllExecutions(cell: ICell, relevantLineNumbers?: NumberSet): SlicedExecution[] {

        return this.executionLog
            .filter((execution) => execution.cellId == cell.id)
            .filter((execution) => !execution.hasError)
            .map((execution) => {

                // Slice the program leading up to that cell.)
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
                let cellOrder = new Array<ICell>();
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

                let cellSlices = cellOrder.map((sliceCell): [ICell, NumberSet] => {
                    return [sliceCell, relativeSliceLines[sliceCell.id][sliceCell.executionCount]];
                });
                return new SlicedExecution(execution.executionTime, cellSlices);
            });
    }
}