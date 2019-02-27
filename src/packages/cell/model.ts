import { LocationSet } from "../../slicing/Slice";
import { nbformat } from "@jupyterlab/coreutils";
import { UUID } from "@phosphor/coreutils";

/**
 * Generic interface for accessing data about a code cell.
 */
export interface ICell {

    /**
     * The ID assigned to a cell by Jupyter Lab. This ID may change each time the notebook is open,
     * due to the implementation of Jupyter Lab.
     */
    readonly id: string;

    /**
     * A persistent ID for this cell, that will stay the same even as the notebook is closed and
     * re-opened. In general, all gathering functionality should refer to cells using this ID.
     */
    readonly persistentId: string;
    
    /**
     * Whether this cell was created by gathering code.
     */
    gathered: boolean;

    executionCount: number;
    hasError: boolean;
    text: string;
    outputs: nbformat.IOutput[];

    /**
     * Flag used for type checking.
     */
    readonly is_cell: boolean;

    /**
     * Create a deep copy of the cell. Copies will have all the same properties, except for the
     * persistent ID, which should be entirely new.
     */
    copy: () => ICell;

    /**
     * Serialize this ICell to JSON that can be stored in a notebook file, or which can be used to
     * create a new Jupyter cell.
     */
    serialize: () => nbformat.ICodeCell;
}

/**
 * Abstract class for accessing cell data.
 */
export abstract class AbstractCell implements ICell {

    abstract is_cell: boolean;
    abstract id: string;
    abstract persistentId: string;
    abstract executionCount: number;
    abstract hasError: boolean;
    abstract isCode: boolean;
    abstract text: string;
    abstract gathered: boolean;
    abstract outputs: nbformat.IOutput[];
    abstract copy(): AbstractCell;

    /**
     * This method is called by the logger to sanitize cell data before logging it. This method
     * should elide any sensitive data, like the cell's text.
     */
    toJSON(): any {
        return {
            id: this.id,
            persistentId: this.persistentId,
            executionCount: this.executionCount,
            lineCount: this.text.split("\n").length,
            isCode: this.isCode,
            hasError: this.hasError,
            gathered: this.gathered,
        };
    }

    serialize(): nbformat.ICodeCell {
        return {
            id: this.id,
            execution_count: this.executionCount,
            source: this.text,
            cell_type: "code",
            outputs: this.outputs,
            metadata: {
                gathered: this.gathered,
                persistent_id: this.persistentId,
            }
        }
    }
}

export class SimpleCell extends AbstractCell {

    constructor(id: string, executionCount: number,
            hasError: boolean, text: string, outputs: nbformat.IOutput[], persistentId?: string) {
        super();
        this.is_cell = true;
        this.id = id;
        this.persistentId = persistentId ? persistentId : UUID.uuid4.toString();
        this.executionCount = executionCount;
        this.hasError = hasError;
        this.text = text;
        this.outputs = outputs;
        this.gathered = false;
    }

    copy(): SimpleCell {
        return new SimpleCell(this.id, this.executionCount, this.hasError, this.text, this.outputs);
    }

    readonly is_cell: boolean;
    readonly id: string;
    readonly persistentId: string;
    readonly executionCount: number;
    readonly hasError: boolean;
    readonly isCode: boolean;
    readonly text: string;
    readonly outputs: nbformat.IOutput[];
    readonly gathered: boolean;
}

export function instanceOfICell(object: any): object is ICell {
    return object && (typeof object == "object") && "is_cell" in object;
}

/**
 * A slice of a cell.
 */
export class CellSlice {

    /**
     * Construct an instance of a cell slice.
     */
    constructor(cell: ICell, slice: LocationSet, executionTime?: Date) {
        this.cell = cell;
        this._slice = slice;
        this.executionTime = executionTime;
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
            .map(loc => {
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
                }).filter(text => text != "").join("\n");
            }).filter(text => text != "").join("\n");
    }

    /**
     * Get the slice.
     */
    get slice(): LocationSet {
        return this._slice;
    }

    /**
     * Set the slice.
     */
    set slice(slice: LocationSet) {
        this._slice = slice;
    }

    readonly cell: ICell;
    readonly executionTime: Date;
    private _slice: LocationSet;
}