import { NumberSet, range } from "./Set";
import { ControlFlowGraph } from "./ControlFlowAnalysis";
import { dataflowAnalysis } from "./DataflowAnalysis";
import { ILocation, parse } from "../parsers/python/python_parser";
import { ICell } from "../packages/cell";
import { Set } from "./Set";

export enum DataflowDirection { Forward, Backward };

function lineRange(loc: ILocation): NumberSet {
    return range(loc.first_line, loc.last_line + (loc.last_column ? 1 : 0));
}

export class LocationSet extends Set<ILocation> {
    constructor(...items: ILocation[]) {
        super(l => [l.first_line, l.first_column, l.last_line, l.last_column].toString(), ...items);
    }
}

function within(inner: ILocation, outer: ILocation): boolean {
    let leftWithin = (
        (outer.first_line < inner.first_line) ||
        ((outer.first_line == inner.first_line) && (outer.first_column <= inner.first_column)));
    let rightWithin = (
        (outer.last_line > inner.last_line) ||
        ((outer.last_line == inner.last_line) && (outer.last_column >= inner.last_column)));        
    return leftWithin && rightWithin;
}

function isPositionBetween(line: number, column: number, start_line: number,
    start_column: number, end_line: number, end_column: number) {
    let afterStart = (
        line > start_line ||
        line == start_line && column >= start_column);
    let beforeEnd = (
        line < end_line ||
        line == end_line && column <= end_column);
    return afterStart && beforeEnd;
}

function intersect(l1: ILocation, l2: ILocation): boolean {
    return (
        isPositionBetween(l1.first_line, l1.first_column, l2.first_line,
            l2.first_column, l2.last_line, l2.last_column) ||
        isPositionBetween(l1.last_line, l1.last_column, l2.first_line,
            l2.first_column, l2.last_line, l2.last_column) ||
        within(l1, l2) || within(l2, l1)
    );
}

/**
 * More general slice: given locations of important syntax nodes, find locations of all relevant
 * definitions. Locations can be mapped to lines later.
 * seedLocations are symbol locations.
 */
export function slice(code: string, seedLocations: LocationSet): LocationSet {

    const ast = parse(code);
    const cfg = new ControlFlowGraph(ast);
    const dfa = dataflowAnalysis(cfg);
    dfa.add(...cfg.getControlDependencies());

    // Include at least the full statements for each seed.
    let seedStatementLocations = new LocationSet();
    seedLocations.items.forEach((seedLoc) => {
        for (let block of cfg.blocks) {
            for (let statement of block.statements) {
                if (intersect(seedLoc, statement.location)) {
                    seedStatementLocations.add(statement.location);
                }
            }
        }
    });

    let sliceLocations = new LocationSet(...seedStatementLocations.items);
    let lastSize: number;
    do {
        lastSize = sliceLocations.size;
        for (let flow of dfa.items) {
            const from = flow.fromNode.location;
            const to = flow.toNode.location;
            if (seedStatementLocations.items.some((seedStmtLoc) =>
                { return intersect(seedStmtLoc, to); })) {
                sliceLocations.add(to);
            }
            if (sliceLocations.items.some((loc) => { return within(to, loc); })) {
                sliceLocations.add(from);
            }
        }
    } while (sliceLocations.size > lastSize);

    return sliceLocations;
}

/**
 * Slice: given a set of lines in a program, return lines it depends on.
 * OUT OF DATE: use slice() instead of sliceLines().
 */
export function sliceLines(code: string, relevantLineNumbers: NumberSet) {
    const ast = parse(code);
    const cfg = new ControlFlowGraph(ast);
    const dfa = dataflowAnalysis(cfg);
    dfa.add(...cfg.getControlDependencies());

    let lastSize: number;
    do {
        lastSize = relevantLineNumbers.size;
        for (let flow of dfa.items) {
            const fromLines = lineRange(flow.fromNode.location);
            const toLines = lineRange(flow.toNode.location);
            const startLines = toLines;
            const endLines = fromLines;
            if (!relevantLineNumbers.intersect(startLines).empty) {
                relevantLineNumbers = relevantLineNumbers.union(endLines);
            }
        }
    } while (relevantLineNumbers.size > lastSize);

    return relevantLineNumbers;
}

export class CellProgram<CellType extends ICell> {
    private code: string;
    private changedCellLineNumbers: [number, number];
    private cellByLine: CellType[] = [];
    private lineRangeForCell: { [id: string]: [number, number] } = {};

    constructor(changedCell: CellType, private cells: CellType[], selection?: [number, number]) {
        this.code = '';
        let lineNumber = 1;
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            if (cell.isCode) continue;
            const cellText = cell.text;
            this.code += cellText + '\n';
            const lineCount = cellText.split('\n').length;
            this.lineRangeForCell[cell.id] = [lineNumber, lineNumber + lineCount];
            for (let lc = 0; lc < lineCount; lc++) {
                this.cellByLine[lc + lineNumber] = cell;
            }
            if (cell.id === changedCell.id) {
                this.changedCellLineNumbers = selection ?
                    [lineNumber + selection[0], lineNumber + selection[1]] :
                    [lineNumber, lineNumber + lineCount - 1];
            }
            lineNumber += lineCount;
        }
    }

    private followDataflow(direction: DataflowDirection): NumberSet {
        const ast = parse(this.code);
        const cfg = new ControlFlowGraph(ast);
        const dfa = dataflowAnalysis(cfg);
        dfa.add(...cfg.getControlDependencies());

        const forwardDirection = direction === DataflowDirection.Forward;
        let relevantLineNumbers = new NumberSet();
        const [startLine, endLine] = this.changedCellLineNumbers;
        for (let line = startLine; line <= endLine; line++) {
            relevantLineNumbers.add(line);
        }

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

    public getDataflowCells(direction: DataflowDirection): Array<[CellType, NumberSet]> {
        const relevantLineNumbers = this.followDataflow(direction);
        const cellsById: { [id: string]: CellType } = {};
        const cellExecutionInfo: { [id: string]: NumberSet } = {};
        for (let line of relevantLineNumbers.items.sort((line1, line2) => line1 - line2)) {
            let cellModel = this.cellByLine[line];
            let lineNumbers;
            if (!cellExecutionInfo.hasOwnProperty(cellModel.id)) {
                lineNumbers = new NumberSet();
                cellsById[cellModel.id] = cellModel;
                cellExecutionInfo[cellModel.id] = lineNumbers;
            }
            lineNumbers = cellExecutionInfo[cellModel.id];
            lineNumbers.add(line - this.lineRangeForCell[cellModel.id][0]);
        }
        let result = new Array<[CellType, NumberSet]>();
        for (let cellId in cellExecutionInfo) {
            result.push([cellsById[cellId], cellExecutionInfo[cellId]]);
        }
        return result;
    }

    public getDataflowText(direction: DataflowDirection): string {
        const relevantLineNumbers = this.followDataflow(direction);
        let text = '';
        let lineNumber = 0;
        for (let i = 0; i < this.cells.length; i++) {
            const cell = this.cells[i];
            if (cell.isCode) continue;
            const cellLines = cell.text.split('\n');
            for (let line = 0; line < cellLines.length; line++) {
                if (relevantLineNumbers.contains(line + lineNumber + 1)) {
                    text += cellLines[line] + '\n';
                }
            }
            lineNumber += cellLines.length;
        }
        return text;
    }
}