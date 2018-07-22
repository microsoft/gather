import { NumberSet, range } from "./Set";
import { ControlFlowGraph } from "./ControlFlowAnalysis";
import { dataflowAnalysis } from "./DataflowAnalysis";
import { ILocation } from "../parsers/python/python_parser";
import * as python3 from '../parsers/python/python3';
import { ICell } from "../packages/cell";

export enum DataflowDirection { Forward, Backward };

function lineRange(loc: ILocation): NumberSet {
    return range(loc.first_line, loc.last_line + (loc.last_column ? 1 : 0));
}

export function slice(code: string, relevantLineNumbers: NumberSet) {
    const ast = python3.parse(code);
    const cfg = new ControlFlowGraph(ast);
    const dfa = dataflowAnalysis(cfg);
    dfa.add(...cfg.getControlDependencies());

    const forwardDirection = false;

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
        const ast = python3.parse(this.code);
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