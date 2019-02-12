import { ICell, CellSlice } from "../packages/cell";
import { ProgramBuilder, CellProgram } from "./ProgramBuilder";
import { LocationSet, slice } from "./Slice";
import { DataflowAnalyzer } from "./DataflowAnalysis";

/**
 * A record of when a cell was executed.
 */
export class CellExecution {
    constructor(
        public readonly cell: ICell,
        public readonly executionTime: Date
    ) { }

    /**
     * Update this method if at some point we only want to save some about a CellExecution when
     * serializing it and saving history.
     */
    toJSON(): any {
        return JSON.parse(JSON.stringify(this));
    }
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
        let cellSlices: { [ cellPersistentId: string ]: { [ executionCount: number ]: CellSlice }} = {};
        let mergedCellSlices = [];
        for (let slicedExecution of slicedExecutions.concat(this)) {
            for (let cellSlice of slicedExecution.cellSlices) {
                let cell = cellSlice.cell;
                if (!cellSlices.hasOwnProperty(cell.persistentId)) cellSlices[cell.persistentId] = {};
                if (!cellSlices[cell.persistentId].hasOwnProperty(cell.executionCount)) {
                    let newCellSlice = new CellSlice(cell.copy(), new LocationSet(), cellSlice.executionTime);
                    cellSlices[cell.persistentId][cell.executionCount] = newCellSlice;
                    mergedCellSlices.push(newCellSlice);
                }
                let mergedCellSlice = cellSlices[cell.persistentId][cell.executionCount];
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

    public _executionLog = new Array<CellExecution>();
    public _programBuilder: ProgramBuilder;
    private _dataflowAnalyzer: DataflowAnalyzer;
    
    /**
     * Construct a new execution log slicer.
     */
    constructor(dataflowAnalyzer: DataflowAnalyzer) {
        this._dataflowAnalyzer = dataflowAnalyzer;
        this._programBuilder = new ProgramBuilder(dataflowAnalyzer);
    }

    /**
     * Log that a cell has just been executed.
     */
    public logExecution(cell: ICell) {
        let cellExecution = new CellExecution(cell, new Date());
        this.addExecutionToLog(cellExecution);
    }

    /**
     * Use logExecution instead if a cell has just been run. This function is intended to be used
     * only to initialize history when a notebook is reloaded.
     */
    public addExecutionToLog(cellExecution: CellExecution) {
        this._programBuilder.add(cellExecution.cell);
        this._executionLog.push(cellExecution);
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
        let cellExecutionTimes:  { [cellPersistentId: string]: { [executionCount: number]: Date } } = {};
        for (let execution of this._executionLog) {
            if (!cellExecutionTimes[execution.cell.persistentId]) cellExecutionTimes[execution.cell.persistentId] = {};
            cellExecutionTimes[execution.cell.persistentId][execution.cell.executionCount] = execution.executionTime;
        }

        return this._executionLog
            .filter(execution => execution.cell.persistentId == cell.persistentId)
            .filter(execution => execution.cell.executionCount != undefined)
            .map(execution => {

                // Build the program up to that cell.
                let program = this._programBuilder.buildTo(execution.cell.persistentId, execution.cell.executionCount);
                if (program == null) return null;

                // Set the seed locations for the slice.
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
                let lastCellLines = program.cellToLineMap[execution.cell.persistentId][execution.cell.executionCount];
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
                    let sliceCellLines = program.cellToLineMap[sliceCell.persistentId][sliceCell.executionCount];
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
                    if (!cellSliceLocations[sliceCell.persistentId]) cellSliceLocations[sliceCell.persistentId] = {};
                    if (!cellSliceLocations[sliceCell.persistentId][sliceCell.executionCount]) {
                        cellSliceLocations[sliceCell.persistentId][sliceCell.executionCount] = new LocationSet();
                    }
                    cellSliceLocations[sliceCell.persistentId][sliceCell.executionCount].add(adjustedLocation);
                });

                let cellSlices = cellOrder.map((sliceCell): CellSlice => {
                    let executionTime = undefined;
                    if (cellExecutionTimes[sliceCell.persistentId] && cellExecutionTimes[sliceCell.persistentId][sliceCell.executionCount]) {
                        executionTime = cellExecutionTimes[sliceCell.persistentId][sliceCell.executionCount];
                    }
                    return new CellSlice(sliceCell,
                        cellSliceLocations[sliceCell.persistentId][sliceCell.executionCount],
                        executionTime);
                });
                return new SlicedExecution(execution.executionTime, cellSlices);
            })
            .filter((s) => s != null && s != undefined);
    }

    get cellExecutions(): ReadonlyArray<CellExecution> {
        return this._executionLog;
    }

    /**
     * Get the cell program (tree, defs, uses) for a cell.
     */
    getCellProgram(cell: ICell): CellProgram {
        return this._programBuilder.getCellProgram(cell);
    }
}