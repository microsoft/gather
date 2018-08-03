import { NumberSet } from "./Set";
import * as ast from "../parsers/python/python_parser";
import { MagicsRewriter } from "./MagicsRewriter";
import { ICell } from "../packages/cell/model";

/**
 * Maps to find out what line numbers over a program correspond to what cells.
 */
export type CellToLineMap = { [cellId: string]: { [executionCount: number]: NumberSet } };
export type LineToCellMap = { [line: number]: ICell };

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
    add(...cells: ICell[]) {
        for (let cell of cells) {
            // Proactively try to parse each block with our parser. If it can't parse,
            // then discard it:
            let parseSucceeded: boolean = false;
            try {
                ast.parse(this._magicsRewriter.rewrite(cell.text) + "\n");
                parseSucceeded = true;
            } catch(e) {
                console.log("Couldn't parse block", cell.text, ", not adding to programs.");
            }
            if (parseSucceeded) {
                this._cells.push(cell);
            }
        }
    }

    /**
     * Build a program from the list of cells. Program will include the cells' contents in
     * execution order. It will omit cells that raised errors (syntax or runtime).
     */
    buildTo(cellId: string, executionCount?: number): Program {

        let cellVersions = this._cells.filter((cell) => cell.id == cellId);
        let lastCell: ICell;
        if (executionCount) {
            lastCell = cellVersions.filter((cell) => cell.executionCount == executionCount)[0];
        } else {
            lastCell = cellVersions.sort(
                (cell1, cell2) => cell1.executionCount - cell2.executionCount
            ).pop();
        }

        let sortedCells = this._cells
            .filter(cell => cell.executionCount != null && cell.executionCount <= lastCell.executionCount)
            .filter(cell => !cell.hasError || cell.id == cellId)  // can have error only if it's the last cell
            .sort((cell1, cell2) => cell1.executionCount - cell2.executionCount);

        let code = "";
        let currentLine = 1;
        let lineToCellMap: LineToCellMap = {};
        let cellToLineMap: CellToLineMap = {};

        sortedCells.forEach((cell) => {

            let cellCode = cell.text;

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
            let cellText = this._magicsRewriter.rewrite(cell.text);
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

    private _cells: ICell[];
    private _magicsRewriter: MagicsRewriter = new MagicsRewriter();
}