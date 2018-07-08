import { CodeEditor } from '@jupyterlab/codeeditor';
import { IModelDB } from '@jupyterlab/observables';
import { CharacterRange } from '../codeversion';
import { CodeDiffModel } from '../history';

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
        this._sourceCode = options.sourceCode;
        this._diff = options.diff;
        this._cellInSlice = options.cellInSlice;
        this._sliceRanges = options.sliceRanges;

        let text = this._sourceCode;
        this.value.text = text as string;
    }

    /**
     * Get the cell ID.
     */
    get cellId(): string {
        return this._cellId;
    }

    /**
     * Get the execution count for the cell.
     */
    get executionCount(): number {
        return this._executionCount;
    }

    /**
     * Get the source code for the cell.
     */
    get sourceCode(): string {
        return this._sourceCode;
    }

    /**
     * Get the difference between the cell contents in this version of the cell, and the contents
     * from the most recent version.
     */
    get diff(): CodeDiffModel {
        return this._diff;
    }

    /**
     * Get whether this cell is included in the slice.
     */
    get cellInSlice(): boolean {
        return this._cellInSlice;
    }

    /**
     * Get the ranges of the cell's code that are in the slice.
     */
    get sliceRanges(): Array<CharacterRange> {
        return this._sliceRanges;
    }

    private _cellId: string;
    private _executionCount: number;
    private _sourceCode: string;
    private _diff:CodeDiffModel;
    private _cellInSlice: boolean;
    private _sliceRanges: Array<CharacterRange>;
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
        cellId: string;

        /**
         * The execution count for the cell.
         */
        executionCount: number;

        /**
         * The source code for the cell.
         */
        sourceCode: string;

        /**
         * A text diff between the cell's contents in this version and the contents in the most
         * recent version of the cell.
         */
        diff: CodeDiffModel;

        /**
         * Whether the cell is included in a source slice.
         */
        cellInSlice: boolean;

        /**
         * The part of the cell's code are in the slice.
         */
        sliceRanges: Array<CharacterRange>;

        /**
         * An IModelDB in which to store cell data.
         */
        modelDB?: IModelDB;
    }
}