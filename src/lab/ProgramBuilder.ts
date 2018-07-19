import { ICodeCellModel } from "@jupyterlab/cells";
import { NumberSet } from "../slicing/Set";
import { MagicsRewriter } from "../slicing/MagicsRewriter";

/**
 * Maps to find out what line numbers over a program correspond to what cells.
 */
export type CellToLineMap = { [ cellId: string ]: { [ executionCount: number ]: NumberSet } };
export type LineToCellMap = { [ line: number ]: ICodeCellModel };

/**
 * A program built from cells.
 */
export class Program {

    /**
     * Construct a program.
     */
    constructor(code: string, cellToLineMap: CellToLineMap, lineToCellMap: LineToCellMap) {
        this.code = code;
        this.cellToLineMap = cellToLineMap;
        this.lineToCellMap = lineToCellMap;
    }

    readonly code: string;
    readonly cellToLineMap: CellToLineMap;
    readonly lineToCellMap: LineToCellMap;
}

/**
 * Builds programs from a list of executed cells.
 */
export class ProgramBuilder {

    /**
     * Construct a program builder.
     */
    constructor() {
        this._cells = [];
    }

    /**
     * Add cells to the program builder.
     */
    add(...cells: ICodeCellModel[]) {
        this._cells.push(...cells);
    }

    /**
     * Build a program from the list of cells. Program will include the cells' contents in
     * execution order. It will omit cells that raised errors (syntax or runtime).
     */
    buildTo(cellId: string, executionCount?: number): Program {

        let cellVersions = this._cells.filter((cell) => cell.id == cellId);
        let lastCell: ICodeCellModel;
        if (executionCount) {
            lastCell = cellVersions.filter((cell) => cell.executionCount == executionCount)[0];
        } else {
            lastCell = cellVersions.sort(
                (cell1, cell2) => cell1.executionCount - cell2.executionCount
            ).pop();
        }

        let sortedCells = this._cells
        .filter((cell) => cell.executionCount != null && cell.executionCount <= lastCell.executionCount)
        .filter((cell) => {
            // Don't include any cells that have caused an error.
            if (cell.outputs) {
                for (let outputIndex = 0; outputIndex < cell.outputs.length; outputIndex++) {
                    let output = cell.outputs.get(outputIndex);
                    if (output.type == "error") return false;
                }
            }
            return true;
        })
        .sort((cell1, cell2) => cell1.executionCount - cell2.executionCount);

        let code = "";
        let currentLine = 1;
        let lineToCellMap: LineToCellMap = {};
        let cellToLineMap: CellToLineMap = {};

        sortedCells.forEach((cell) => {

            let cellCode = cell.value.text;

            // Build a mapping from the cells to their lines.
            let cellLength = cellCode.split("\n").length;
            let cellLines = [];
            for (let l = 0; l < cellLength; l++) { cellLines.push(currentLine + l); }
            cellLines.forEach((l) => {
                lineToCellMap[l] = cell;
                if (!cellToLineMap[cell.id]) cellToLineMap[cell.id] = {};
                if (!cellToLineMap[cell.id][cell.executionCount]) {
                    cellToLineMap[cell.id][cell.executionCount] = new NumberSet();
                }
                cellToLineMap[cell.id][cell.executionCount].add(l);
            });

            // Accumulate the code.
            let cellText = this._magicsRewriter.rewrite(cell.value.text);
            code += (cellText + "\n");
            currentLine += cellLength;
        });
        
        return new Program(code, cellToLineMap, lineToCellMap);
    }

    build(): Program {
        let lastCell = this._cells
        .filter((cell) => cell.executionCount != null)
        .sort((cell1, cell2) => cell1.executionCount - cell2.executionCount).pop();
        return this.buildTo(lastCell.id);
    }

    private _cells: ICodeCellModel[];
    private _magicsRewriter: MagicsRewriter = new MagicsRewriter();
}