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
    constructor(text: string, tree: ast.IModule, cellToLineMap: CellToLineMap, lineToCellMap: LineToCellMap) {
        this.text = text;
        this.tree = tree;
        this.cellToLineMap = cellToLineMap;
        this.lineToCellMap = lineToCellMap;
    }

    readonly text: string;
    readonly tree: ast.IModule;
    readonly cellToLineMap: CellToLineMap;
    readonly lineToCellMap: LineToCellMap;
}

/**
 * Program fragment for a cell. Used to cache parsing results.
 */
class CellProgram {
    /**
     * Construct a cell program
     */
    constructor(cell: ICell, statements: ast.ISyntaxNode[]) {
        this.cell = cell;
        this.statements = statements;
    }

    readonly cell: ICell;
    readonly statements: ast.ISyntaxNode[];
}

/**
 * Builds programs from a list of executed cells.
 */
export class ProgramBuilder {

    /**
     * Construct a program builder.
     */
    constructor() {
        this._cellPrograms = [];
    }

    /**
     * Add cells to the program builder.
     */
    add(...cells: ICell[]) {
        for (let cell of cells) {
            // Proactively try to parse each block with our parser. If it can't parse,
            // then discard it:
            let tree: ast.IModule = undefined;;
            try {
                tree = ast.parse(this._magicsRewriter.rewrite(cell.text) + "\n");
            } catch(e) {
                console.log("Couldn't parse block", cell.text, ", not adding to programs.");
            }
            if (tree) {
                this._cellPrograms.push(new CellProgram(cell, tree.code));
            }
        }
    }

    /**
     * Reset (removing all cells).
     */
    reset() {
        this._cellPrograms = [];
    }

    /**
     * Build a program from the list of cells. Program will include the cells' contents in
     * execution order. It will omit cells that raised errors (syntax or runtime).
     */
    buildTo(cellId: string, executionCount?: number): Program {

        let cellVersions = this._cellPrograms
            .filter(cp => cp.cell.id == cellId)
            .map(cp => cp.cell);
        let lastCell: ICell;
        if (executionCount) {
            lastCell = cellVersions.filter(cell => cell.executionCount == executionCount)[0];
        } else {
            lastCell = cellVersions.sort(
                (cell1, cell2) => cell1.executionCount - cell2.executionCount
            ).pop();
        }

        let sortedCellPrograms = this._cellPrograms
            .filter(cp => cp.cell.executionCount != null && cp.cell.executionCount <= lastCell.executionCount)
            .filter(cp => !cp.cell.hasError || cp.cell.id == cellId)  // can have error only if it's the last cell
            .sort((cp1, cp2) => cp1.cell.executionCount - cp2.cell.executionCount);

        let code = "";
        let currentLine = 1;
        let lineToCellMap: LineToCellMap = {};
        let cellToLineMap: CellToLineMap = {};

        // Synthetic parse tree built from the cell parse trees.
        let tree: ast.IModule = {
            code: [],
            type: ast.MODULE,
            location: undefined
        };

        sortedCellPrograms.forEach(cp => {

            let cell = cp.cell;
            let cellCode = cell.text;

            // Build a mapping from the cells to their lines.
            let cellLength = cellCode.split("\n").length;
            let cellLines = [];
            for (let l = 0; l < cellLength; l++) { cellLines.push(currentLine + l); }
            cellLines.forEach(l => {
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
            tree.code.push(...cp.statements);
        });

        return new Program(code, tree, cellToLineMap, lineToCellMap);
    }

    build(): Program {
        let lastCell = this._cellPrograms
            .filter(cp => cp.cell.executionCount != null)
            .sort((cp1, cp2) => cp1.cell.executionCount - cp2.cell.executionCount).pop();
        return this.buildTo(lastCell.cell.id);
    }

    private _cellPrograms: CellProgram[];
    private _magicsRewriter: MagicsRewriter = new MagicsRewriter();
}