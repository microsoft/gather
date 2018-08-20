import { ICell, CellSlice } from "../packages/cell";
import { ProgramBuilder, CellProgram } from "./ProgramBuilder";
import { LocationSet, slice } from "./Slice";
import { DataflowAnalyzer } from "./DataflowAnalysis";

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
                    let newCellSlice = new CellSlice(cell.copy(), new LocationSet(), cellSlice.executionTime);
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

    private _executionLog = new Array<CellExecution>();
    private _programBuilder: ProgramBuilder;
    private _dataflowAnalyzer: DataflowAnalyzer;
    
    /**
     * Construct a new execution log slicer.
     */
    constructor(dataflowAnalyzer: DataflowAnalyzer) {
        this._dataflowAnalyzer = dataflowAnalyzer;
        this._programBuilder = new ProgramBuilder(dataflowAnalyzer);
    }

    /**
     * Add a cell execution to the log.
     */
    public logExecution(cell: ICell) {
        this._programBuilder.add(cell);
        this._executionLog.push(new CellExecution(cell.id, cell.executionCount, new Date(), cell.hasError));
    }

    /**
     * Reset the log, removing log records.
     */
    public reset() {
        this._executionLog = [];
        this._programBuilder.reset();
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
    public sliceAllExecutions(cell: ICell, pSeedLocations?: LocationSet): SlicedExecution[] {

        // Make a map from cells to their execution times.
        let cellExecutionTimes:  { [cellId: string]: { [executionCount: number]: Date } } = {};
        for (let execution of this._executionLog) {
            if (!cellExecutionTimes[execution.cellId]) cellExecutionTimes[execution.cellId] = {};
            cellExecutionTimes[execution.cellId][execution.executionCount] = execution.executionTime;
        }

        return this._executionLog
            .filter(execution => execution.cellId == cell.id)
            .filter(execution => execution.executionCount != undefined)
            .map(execution => {

                // Build the program up to that cell.
                let program = this._programBuilder.buildTo(execution.cellId, execution.executionCount);
                let seedLocations;
                if (pSeedLocations) {
                    seedLocations = pSeedLocations;
                // If seed locations weren't specified, slice the whole cell.
                // XXX: Whole cell specified by an unreasonably large character range.
                } else {
                    seedLocations = new LocationSet({
                        first_line: 1, first_column: 1, last_line: 10000, last_column: 10000
                    });
                }

                // Set seed locations were specified relative to the last cell's position in program.
                let lastCellLines = program.cellToLineMap[execution.cellId][execution.executionCount];
                let lastCellStart = Math.min(...lastCellLines.items);
                seedLocations = new LocationSet(
                    ...seedLocations.items.map(loc => {
                        return {
                            first_line: lastCellStart + loc.first_line - 1,
                            first_column: loc.first_column,
                            last_line: lastCellStart + loc.last_line - 1,
                            last_column: loc.last_column
                        };
                    })
                );

                // Slice the program
                let sliceLocations = slice(program.tree, seedLocations, this._dataflowAnalyzer).items
                .sort((loc1, loc2) => loc1.first_line - loc2.first_line);

                // Get the relative offsets of slice lines in each cell.
                let cellSliceLocations: { [cellId: string]: { [executionCount: number]: LocationSet } } = {};
                let cellOrder = new Array<ICell>();
                sliceLocations.forEach(location => {
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
                    let executionTime = undefined;
                    if (cellExecutionTimes[sliceCell.id] && cellExecutionTimes[sliceCell.id][sliceCell.executionCount]) {
                        executionTime = cellExecutionTimes[sliceCell.id][sliceCell.executionCount];
                    }
                    return new CellSlice(sliceCell,
                        cellSliceLocations[sliceCell.id][sliceCell.executionCount],
                        executionTime);
                });
                return new SlicedExecution(execution.executionTime, cellSlices);
            });
    }

    /**
     * Get the cell program (tree, defs, uses) for a cell.
     */
    getCellProgram(cell: ICell): CellProgram {
        return this._programBuilder.getCellProgram(cell);
    }
}