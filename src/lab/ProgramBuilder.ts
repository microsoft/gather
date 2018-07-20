import { NumberSet } from "../slicing/Set";
import { MagicsRewriter } from "../slicing/MagicsRewriter";

/**
 * Maps to find out what line numbers over a program correspond to what cells.
 */
export type CellToLineMap = { [cellId: string]: { [executionCount: number]: NumberSet } };
export type LineToCellMap<TCellModel, TOutputModel> = { [line: number]: SliceableCell<TCellModel, TOutputModel> };

/**
 * A program built from cells.
 */
export class Program<TCellModel, TOutputModel> {

    /**
     * Construct a program.
     */
    constructor(code: string, cellToLineMap: CellToLineMap, lineToCellMap: LineToCellMap<TCellModel, TOutputModel>) {
        this.code = code;
        this.cellToLineMap = cellToLineMap;
        this.lineToCellMap = lineToCellMap;
    }

    readonly code: string;
    readonly cellToLineMap: CellToLineMap;
    readonly lineToCellMap: LineToCellMap<TCellModel, TOutputModel>;
}

export interface SliceableCell<TCellModel, TOutputModel> {
    id: string;
    executionCount: number;
    hasError: boolean;
    text: string;
    model: TCellModel;
    outputs: TOutputModel[];
}

/**
 * Builds programs from a list of executed cells.
 */
export class ProgramBuilder<TCellModel, TOutputModel> {

    /**
     * Construct a program builder.
     */
    constructor() {
        this._cells = [];
    }

    /**
     * Add cells to the program builder.
     */
    add(...cells: SliceableCell<TCellModel, TOutputModel>[]) {
        this._cells.push(...cells);
    }

    /**
     * Build a program from the list of cells. Program will include the cells' contents in
     * execution order. It will omit cells that raised errors (syntax or runtime).
     */
    buildTo(cellId: string, executionCount?: number): Program<TCellModel, TOutputModel> {

        let cellVersions = this._cells.filter((cell) => cell.id == cellId);
        let lastCell: SliceableCell<TCellModel, TOutputModel>;
        if (executionCount) {
            lastCell = cellVersions.filter((cell) => cell.executionCount == executionCount)[0];
        } else {
            lastCell = cellVersions.sort(
                (cell1, cell2) => cell1.executionCount - cell2.executionCount
            ).pop();
        }

        let sortedCells = this._cells
            .filter(cell => cell.executionCount != null && cell.executionCount <= lastCell.executionCount)
            .filter(cell => !cell.hasError)
            .sort((cell1, cell2) => cell1.executionCount - cell2.executionCount);

        let code = "";
        let currentLine = 1;
        let lineToCellMap: LineToCellMap<TCellModel, TOutputModel> = {};
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

    build(): Program<TCellModel, TOutputModel> {
        let lastCell = this._cells
            .filter((cell) => cell.executionCount != null)
            .sort((cell1, cell2) => cell1.executionCount - cell2.executionCount).pop();
        return this.buildTo(lastCell.id);
    }

    private _cells: SliceableCell<TCellModel, TOutputModel>[];
    private _magicsRewriter: MagicsRewriter = new MagicsRewriter();
}