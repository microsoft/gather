import { LocationSet } from "../../slicing/Slice";

/**
 * Generic interface for accessing cell data.
 */
export interface ICell {
    id: string;
    executionCount: number;
    hasError: boolean;
    isCode: boolean;
    text: string;
    copy: () => ICell // deep copy if holding a model.
}

/**
 * Type checker for IOutputterCell.
 */
export function instanceOfIOutputterCell<TOutputModel>(object: any): object is IOutputterCell<TOutputModel> {
    return object.type && object.outputs == "outputter";
}

/**
 * Cell interface with data.
 */
export interface IOutputterCell<TOutputModel> extends ICell {
    type: "outputter";
    outputs: TOutputModel[];
}

/**
 * A slice of a cell.
 */
export class CellSlice {

    /**
     * Construct an instance of a cell slice.
     */
    constructor(cell: ICell, slice: LocationSet) {
        this.cell = cell;
        this.slice = slice;
    }

    /**
     * Get the text in the slice of a cell.
     */
    get textSlice(): string {
        return this.getTextSlice(false);
    }

    /**
     * Get the text of all lines in a slice (no deletions from lines).
     */
    get textSliceLines(): string {
        return this.getTextSlice(true);
    }

    private getTextSlice(fullLines: boolean): string {
        let sliceLocations = this.slice.items;
        let textLines = this.cell.text.split("\n");
        return sliceLocations.sort((l1, l2) => l1.first_line - l2.first_line)
        .map((loc) => {
            return textLines.map((line, index0) => {
                let index = index0 + 1;
                let left, right;
                if (index == loc.first_line) {
                    left = loc.first_column;
                }
                if (index == loc.last_line) {
                    right = loc.last_column;
                }
                if (index > loc.first_line) {
                    left = 0;
                }
                if (index < loc.last_line) {
                    right = line.length;
                }
                if (left != undefined && right != undefined) {
                    if (fullLines) {
                        return line.slice(0, line.length);
                    } else {
                        return line.slice(left, right);
                    }
                }
                return "";
            }).filter((text) => text != "").join("\n");
        }).filter((text) => text != "").join("\n");
    }

    readonly cell: ICell;
    readonly slice: LocationSet;
}