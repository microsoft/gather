import { LocationSet } from "../../slicing/Slice";

/**
 * Generic interface for accessing cell data.
 */
export interface ICell {
    is_cell: boolean;
    id: string;
    /**
     * TODO(andrewhead): make sure that when a cell is copied, it doesn't have the same
     * persistent ID.
     */
    persistentId: string;
    executionCount: number;
    hasError: boolean;
    isCode: boolean;
    text: string;
    gathered: boolean;
    copy: () => ICell; // deep copy if holding a model.
    /**
     * Produce JSON that can be read to make a new Jupyter notebook cell.
     * TODO(andrewhead): return JSON with cell JSON static type.
     */
    toJupyterJSON: () => any;
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
    abstract copy(): AbstractCell;

    /**
     * Output descriptive (unsensitive) data about this cell. No code!
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

    toJupyterJSON(): any {
        return {
            id: this.id,
            execution_count: this.executionCount,
            source: this.text,
            cell_type: "code",
            metadata: {
                gathered: this.gathered,
                persistent_id: this.persistentId,
            }
        }
    }
}

export class SimpleCell extends AbstractCell {

    constructor(id: string, persistentId: string, executionCount: number,
            hasError: boolean, isCode: boolean, text: string) {
        super();
        this.is_cell = true;
        this.id = id;
        this.persistentId = persistentId;
        this.executionCount = executionCount;
        this.hasError = hasError;
        this.isCode = isCode;
        this.text = text;
        this.gathered = false;
    }

    copy(): SimpleCell {
        return new SimpleCell(this.id, this.persistentId, this.executionCount, this.hasError, this.isCode, this.text);
    }

    public readonly is_cell: boolean;
    public readonly id: string;
    public readonly persistentId: string;
    public readonly executionCount: number;
    public readonly hasError: boolean;
    public readonly isCode: boolean;
    public readonly text: string;
    public readonly gathered: boolean;
}

export function instanceOfICell(object: any): object is ICell {
    return object && (typeof object == "object") && "is_cell" in object;
}

/**
 * Cell interface with output data.
 */
export interface IOutputterCell<TOutputModel> extends ICell {
    is_outputter_cell: boolean;
    output: TOutputModel;
}

/**
 * Type checker for IOutputterCell.
 */
export function instanceOfIOutputterCell<TOutputModel>(object: any): object is IOutputterCell<TOutputModel> {
    return object && (typeof object == "object") && "is_outputter_cell" in object;
}

/**
 * Abstract class for a cell with output data.
 */
export abstract class AbstractOutputterCell<TOutputModel>
    extends AbstractCell implements IOutputterCell<TOutputModel> {

    readonly is_outputter_cell: boolean = true;
    abstract output: TOutputModel;
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