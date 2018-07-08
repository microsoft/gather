import { CodeEditor } from '@jupyterlab/codeeditor';
import { IModelDB } from '@jupyterlab/observables';

/**
 * The definition of a model object for a sliced cell.
 */
export interface ISlicedCellModel extends CodeEditor.IModel {}

/**
 * An implementation for the sliced cell model.
 */
export class SlicedCellModel extends CodeEditor.Model implements ISlicedCellModel {
    /**
     * Construct a sliced cell model.
     */
    constructor(options: SlicedCellModel.IOptions) {
        super({ modelDB: options.modelDB });

        this._cellId = options.cellId;
        this._executionCount = options.executionCount;
        this._cellInSlice = options.cellInSlice;
        this._sourceOriginal = options.sourceOriginal;
        this._slicedSource = options.slicedSource;

        let text = this._sourceOriginal;
        this.value.text = text as string;
    }

    /**
     * Get the cell ID.
     */
    get cellId(): number {
        return this._cellId;
    }

    /**
     * Get the execution count for the cell.
     */
    get executionCount(): number {
        return this._executionCount;
    }

    /**
     * Get whether this cell is included in the slice.
     */
    get cellInSlice(): boolean {
        return this._cellInSlice;
    }

    /**
     * Get the original source code for the cell.
     */
    get sourceOriginal(): string {
        return this._sourceOriginal;
    }

    /**
     * Get the part of the cell's code that is included in the slice.
     */
    get slicedSource(): string {
        return this._slicedSource;
    }

    private _cellId: number;
    private _executionCount: number;
    private _cellInSlice: boolean;
    private _sourceOriginal: string;
    private _slicedSource: string;
}

/**
 * The namespace for `SlicedCellModel` statics.
 */
export namespace SlicedCellModel {
    /**
     * The options used to initialize a `SlicedCellModel`.
     */
    export interface IOptions {
        /**
         * A unique ID for a cell.
         */
        cellId: number;

        /**
         * The execution count for the cell.
         */
        executionCount: number;

        /**
         * Whether the cell is included in a source slice.
         */
        cellInSlice: boolean;

        /**
         * The original source code for the cell.
         */
        sourceOriginal: string;

        /**
         * The part of the cell's code that's included in a slice.
         */
        slicedSource: string;

        /**
         * An IModelDB in which to store cell data.
         */
        modelDB?: IModelDB;
    }
}