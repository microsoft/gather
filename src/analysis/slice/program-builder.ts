import { ICell } from '../../model/cell';
import * as ast from '../parse/python/python-parser';
import { DataflowAnalyzer, Ref } from './data-flow';
import { MagicsRewriter } from './rewrite-magics';
import { NumberSet } from './set';

/**
 * Maps to find out what line numbers over a program correspond to what cells.
 */
export type CellToLineMap = { [cellExecutionEventId: string]: NumberSet };
export type LineToCellMap = { [line: number]: ICell };

/**
 * A program built from cells.
 */
export class Program {
  /**
   * Construct a program.
   */
  constructor(
    text: string,
    tree: ast.IModule,
    cellToLineMap: CellToLineMap,
    lineToCellMap: LineToCellMap
  ) {
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
export class CellProgram {
  /**
   * Construct a cell program
   */
  constructor(
    cell: ICell,
    statements: ast.ISyntaxNode[],
    defs: Ref[],
    uses: Ref[],
    hasError: boolean
  ) {
    this.cell = cell;
    this.statements = statements;
    this.defs = defs;
    this.uses = uses;
    this.hasError = hasError;
  }

  readonly cell: ICell;
  readonly statements: ast.ISyntaxNode[];
  readonly defs: Ref[];
  readonly uses: Ref[];
  readonly hasError: boolean;
}

function isComment(code: string) {
  const multiLine = code.split('\n');
  for (let line of multiLine) {
      // Once we find a line that isn't a comment, return false
      if (!line.startsWith('#')) {
          return false;
      }
  }
  return true;
}

/**
 * Builds programs from a list of executed cells.
 */
export class ProgramBuilder {
  /**
   * Construct a program builder.
   */
  constructor(dataflowAnalyzer?: DataflowAnalyzer) {
    this._dataflowAnalyzer = dataflowAnalyzer;
    this._cellPrograms = [];
  }

  /**
   * Add cells to the program builder.
   */
  add(...cells: ICell[]) {
    for (let cell of cells) {
      // Proactively try to parse and find defs and uses in each block.
      // If there is a failure, discard that cell.
      let statements: ast.ISyntaxNode[] = [];
      let defs: Ref[] = undefined;
      let uses: Ref[] = undefined;
      let hasError = cell.hasError;
      try {
        const code = `${this._magicsRewriter.rewrite(cell.text)}\n`;
        // If the rewritten code is just a comment, do not attempt parse
        // The resultant tree will be an empty string and tree.code === undefined
        if (isComment(code)) { break; }

        // Parse the cell's code.
        let tree = ast.parse(code);
        statements = tree.code;
        // Annotate each node with cell ID info, for dataflow caching.
        for (let node of ast.walk(tree)) {
          // Sanity check that this is actually a node.
          if (node.hasOwnProperty('type')) {
            node.cellExecutionEventId = cell.executionEventId;
          }
        }
        // By querying for defs and uses right when a cell is added to the log, we
        // can cache these results, making dataflow analysis faster.
        if (this._dataflowAnalyzer) {
          defs = [];
          uses = [];
          for (let stmt of tree.code) {
            let defsUses = this._dataflowAnalyzer.getDefsUses(stmt);
            defs.push(...defsUses.defs.items);
            uses.push(...defsUses.uses.items);
          }
        } else {
          defs = [];
          uses = [];
        }
      } catch (e) {
        console.log(
          "Couldn't analyze block",
          cell.text,
          ', error encountered, ',
          e,
          ', not adding to programs.'
        );
        hasError = true;
      }
      this._cellPrograms.push(
        new CellProgram(cell, statements, defs, uses, hasError)
      );
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
   * the order they were added to the log. It will omit cells that raised errors (syntax or
   * runtime, except for the last cell).
   */
  buildTo(cellExecutionEventId: string): Program {
    let addingPrograms = false;
    let lastExecutionCountSeen;
    let cellPrograms = new Array<CellProgram>();

    for (let i = this._cellPrograms.length - 1; i >= 0; i--) {
      let cellProgram = this._cellPrograms[i];
      let cell = cellProgram.cell;
      if (!addingPrograms && cell.executionEventId === cellExecutionEventId) {
        addingPrograms = true;
        lastExecutionCountSeen = cell.executionCount;
        cellPrograms.unshift(cellProgram);
        continue;
      }
      if (addingPrograms) {
        if (cell.executionCount >= lastExecutionCountSeen) {
          break;
        }
        if (!cellProgram.hasError) {
          cellPrograms.unshift(cellProgram);
        }
        lastExecutionCountSeen = cell.executionCount;
      }
    }

    let code = '';
    let currentLine = 1;
    let lineToCellMap: LineToCellMap = {};
    let cellToLineMap: CellToLineMap = {};

    // Synthetic parse tree built from the cell parse trees.
    let tree: ast.IModule = {
      code: [],
      type: ast.MODULE,
      location: undefined,
    };

    cellPrograms.forEach(cp => {
      let cell = cp.cell;
      let cellCode = cell.text;
      let statements = [];

      // Build a mapping from the cells to their lines.
      let cellLength = cellCode.split('\n').length;
      let cellLines = [];
      for (let l = 0; l < cellLength; l++) {
        cellLines.push(currentLine + l);
      }
      cellLines.forEach(l => {
        lineToCellMap[l] = cell;
        if (!cellToLineMap[cell.executionEventId])
          cellToLineMap[cell.executionEventId] = new NumberSet();
        cellToLineMap[cell.executionEventId].add(l);
      });

      // Accumulate the code text.
      let cellText = this._magicsRewriter.rewrite(cell.text);
      code += cellText + '\n';
      currentLine += cellLength;

      // Accumulate the code statements.
      // This includes resetting the locations of all of the nodes in the tree,
      // relative to the cells that come before this one.
      // This can be sped up by saving this computation.
      let cellStart = Math.min(...cellLines);
      for (let statement of cp.statements) {
        let statementCopy = JSON.parse(JSON.stringify(statement));
        for (let node of ast.walk(statementCopy)) {
          if (node.location) {
            node.location.first_line += cellStart - 1;
            node.location.last_line += cellStart - 1;
          }
          if (node.type == ast.FOR) {
            node.decl_location.first_line += cellStart - 1;
            node.decl_location.last_line += cellStart - 1;
          }
        }
        statements.push(statementCopy);
      }
      tree.code.push(...statements);
    });

    return new Program(code, tree, cellToLineMap, lineToCellMap);
  }

  getCellProgram(cell: ICell): CellProgram {
    let matchingPrograms = this._cellPrograms.filter(
      cp => cp.cell.executionEventId == cell.executionEventId
    );
    if (matchingPrograms.length >= 1) return matchingPrograms.pop();
    return null;
  }

  public _cellPrograms: CellProgram[];
  private _dataflowAnalyzer: DataflowAnalyzer;
  private _magicsRewriter: MagicsRewriter = new MagicsRewriter();
}
