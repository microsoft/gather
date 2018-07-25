import { ICell, CellSlice } from "../packages/cell";
import { ProgramBuilder } from "./ProgramBuilder";
import { LocationSet, slice } from "./Slice";

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
        public cellSlices: CellSlice[]
    ) { }

    merge(...slicedExecutions: SlicedExecution[]): SlicedExecution {
        let cellSlices: { [ cellId: string ]: { [ executionCount: number ]: CellSlice }} = {};
        let mergedCellSlices = [];
        for (let slicedExecution of slicedExecutions.concat(this)) {
            for (let cellSlice of slicedExecution.cellSlices) {
                let cell = cellSlice.cell;
                if (!cellSlices.hasOwnProperty(cell.id)) cellSlices[cell.id] = {};
                if (!cellSlices[cell.id].hasOwnProperty(cell.executionCount)) {
                    let newCellSlice = new CellSlice(cell.copy(), new LocationSet());
                    cellSlices[cell.id][cell.executionCount] = newCellSlice;
                    mergedCellSlices.push(newCellSlice);
                }
                let mergedCellSlice = cellSlices[cell.id][cell.executionCount];
                mergedCellSlice.slice = mergedCellSlice.slice.union(cellSlice.slice);
            }
        }
        return new SlicedExecution(
            new Date(),  // Date doesn't mean anything for the merged slice.
            mergedCellSlices.sort((a, b) => a.cell.executionCount - b.cell.executionCount)
        );
    }
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
    public sliceLatestExecution(cell: ICell, seedLocations?: LocationSet): SlicedExecution {
        // XXX: This computes more than it has to, performing a slice on each execution of a cell
        // instead of just its latest computation. Optimize later if necessary.
        return this.sliceAllExecutions(cell, seedLocations).pop();
    }

    /**
     * Get slices of the necessary code for all executions of a cell.
     * Relevant line numbers are relative to the cell's start line (starting at first line = 0).
     */
    public sliceAllExecutions(cell: ICell, seedLocations?: LocationSet): SlicedExecution[] {

        return this.executionLog
            .filter((execution) => execution.cellId == cell.id)
            .filter((execution) => !execution.hasError)
            .map((execution) => {

                // Build the program up to that cell.
                let program = this.programBuilder.buildTo(execution.cellId, execution.executionCount);

                // If seed locations weren't specified, slice the whole cell.
                // XXX: Whole cell specified by an unreasonably large character range.
                if (!seedLocations) {
                    seedLocations = new LocationSet({
                        first_line: 0, first_column: 0, last_line: 10000, last_column: 10000
                    });
                }
                // If seed locations were specified, set them relative to the last cell's position in program.
                else {
                    let lastCellLines = program.cellToLineMap[execution.cellId][execution.executionCount];
                    let lastCellStart = Math.min(...lastCellLines.items);
                    seedLocations = new LocationSet(
                        ...seedLocations.items.map((loc) => {
                            return {
                                first_line: lastCellStart + loc.first_line - 1,
                                first_column: loc.first_column,
                                last_line: lastCellStart + loc.last_line - 1,
                                last_column: loc.last_column
                            };
                        })
                    );
                }
                let sliceLocations = slice(program.code, seedLocations).items
                .sort((loc1, loc2) => loc1.first_line - loc2.first_line);

                // Get the relative offsets of slice lines in each cell.
                let cellSliceLocations: { [cellId: string]: { [executionCount: number]: LocationSet } } = {};
                let cellOrder = new Array<ICell>();
                sliceLocations.forEach((location) => {
                    let sliceCell = program.lineToCellMap[location.first_line];
                    let sliceCellLines = program.cellToLineMap[sliceCell.id][sliceCell.executionCount];
                    let sliceCellStart = Math.min(...sliceCellLines.items);
                    if (cellOrder.indexOf(sliceCell) == -1) {
                        cellOrder.push(sliceCell);
                    }
                    let adjustedLocation = {
                        first_line: location.first_line - sliceCellStart + 1,
                        first_column: location.first_column,
                        last_line: location.last_line - sliceCellStart + 1,
                        last_column: location.last_column
                    };
                    if (!cellSliceLocations[sliceCell.id]) cellSliceLocations[sliceCell.id] = {};
                    if (!cellSliceLocations[sliceCell.id][sliceCell.executionCount]) {
                        cellSliceLocations[sliceCell.id][sliceCell.executionCount] = new LocationSet();
                    }
                    cellSliceLocations[sliceCell.id][sliceCell.executionCount].add(adjustedLocation);
                });

                let cellSlices = cellOrder.map((sliceCell): CellSlice => {
                    return new CellSlice(sliceCell,
                        cellSliceLocations[sliceCell.id][sliceCell.executionCount]);
                });
                return new SlicedExecution(execution.executionTime, cellSlices);
            });
    }
}