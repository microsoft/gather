import { nbformat } from "@jupyterlab/coreutils";
import { UUID } from "@phosphor/coreutils";
import { CodeCellModel, ICodeCellModel } from "@jupyterlab/cells";
import { IOutputModel } from "@jupyterlab/rendermime";

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

    /**
     * Whether this cell's text has been changed since its last execution. Undefined behavior when
     * a cell has never been executed.
     */
    readonly dirty: boolean;

    /**
     * The cell's current text.
     */
    text: string;

    executionCount: number;
    outputs: nbformat.IOutput[];

    /**
     * Whether analysis or execution of this cell has yielded an error.
     */
    hasError: boolean;

    /**
     * Flag used for type checking.
     */
    readonly is_cell: boolean;

    /**
     * Create a deep copy of the cell.
     */
    deepCopy: () => ICell;

    /**
     * Create a new cell from this cell. The new cell will have null execution counts, and a new
     * ID and persistent ID.
     */
    copyToNewCell: () => ICell;

    /**
     * Serialize this ICell to JSON that can be stored in a notebook file, or which can be used to
     * create a new Jupyter cell.
     */
    serialize: () => nbformat.ICodeCell;
}

export function instanceOfICell(object: any): object is ICell {
    return object && (typeof object == "object") && "is_cell" in object;
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
    abstract deepCopy(): AbstractCell;

    /**
     * The cell's text when it was executed, i.e., when the execution count was last changed.
     * This will be undefined if the cell has never been executed.
     */
    abstract lastExecutedText: string;

    get dirty(): boolean {
        return this.text !== this.lastExecutedText;
    }

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

    copyToNewCell(): ICell {
        let clonedOutputs = this.outputs.map((output) => {
            let clone = JSON.parse(JSON.stringify(output)) as nbformat.IOutput;
            if (nbformat.isExecuteResult(clone)) {
                clone.execution_count = undefined;
            }
            return clone;
        });
        return new LogCell({
            text: this.text,
            hasError: this.hasError,
            outputs: clonedOutputs
        });
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

/**
 * Static cell data. Provides an interfaces to cell data loaded from a log.
 */
export class LogCell extends AbstractCell {

    constructor(cellData: {
        id?: string, persistentId?: string, executionCount?: number, hasError?: boolean,
        text?: string, outputs?: nbformat.IOutput[]
    }) {
        super();
        this.is_cell = true;
        this.id = cellData.id || UUID.uuid4();
        this.persistentId = cellData.persistentId || UUID.uuid4();
        this.executionCount = cellData.executionCount || undefined;
        this.hasError = cellData.hasError || false;
        this.text = cellData.text || "";
        this.lastExecutedText = this.text;
        this.outputs = cellData.outputs || [];
        this.gathered = false;
    }

    deepCopy(): AbstractCell {
        return new LogCell(this);
    }

    readonly is_cell: boolean;
    readonly id: string;
    readonly persistentId: string;
    readonly executionCount: number;
    readonly hasError: boolean;
    readonly isCode: boolean;
    readonly text: string;
    readonly lastExecutedText: string;
    readonly outputs: nbformat.IOutput[];
    readonly gathered: boolean;
}

/**
 * Wrapper around a code cell model created by Jupyter Lab. Provides a consistent interface to
 * lab data to other cells that have been loaded from a log.
 */
export class LabCell extends AbstractCell {

    constructor(model: ICodeCellModel) {
        super();
        this._model = model;
    }
    
    get model(): ICodeCellModel {
        return this._model;
    }

    get id(): string {
        return this._model.id;
    }

    get persistentId(): string {
        if (!this._model.metadata.has("persistent_id")) {
            this._model.metadata.set("persistent_id", UUID.uuid4());
        }
        return this._model.metadata.get("persistent_id") as string;
    }

    get text(): string {
        return this._model.value.text;
    }

    set text(text: string) {
        this._model.value.text = text;
    }

    get lastExecutedText(): string {
        return this._model.metadata.get('last_executed_text') as string;
    }

    set lastExecutedText(text: string) {
        this._model.metadata.set('last_executed_text', text);
    }

    get executionCount(): number {
        return this._model.executionCount;
    }

    set executionCount(count: number) {
        this._model.executionCount = count;
    }

    get isCode(): boolean {
        return this._model.type == "code";
    }

    get hasError(): boolean {
        return this.output.some(o => o.type === 'error');
    }

    get output(): IOutputModel[] {
        let outputs = [];
        if (this._model.outputs) {
            for (let i = 0; i < this._model.outputs.length; i++) {
                outputs.push(this._model.outputs.get(i));
            }
            return outputs;
        }
    }

    get outputs(): nbformat.IOutput[] {
        return this.output.map((output) => output.toJSON());
    }

    get gathered(): boolean {
        return this._model.metadata.get("gathered") as boolean;
    }

    deepCopy(): LabCell {
        return new LabCell(new CodeCellModel({ id: this.id, cell: this.model.toJSON() }));
    }

    serialize(): any {
        return this._model.toJSON();
    }

    is_cell: boolean = true;
    is_outputter_cell: boolean = true;
    private _model: ICodeCellModel;

}