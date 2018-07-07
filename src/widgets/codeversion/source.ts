import { ISlicedCellModel } from './sliced_cell';

/**
 * The definition of a model object for a source code revision.
 */
export interface ISourceModel {
    /**
     * A string with the slice of code relevant to a result.
     */
    readonly codeSlice: string;
}

/**
 * An implementation of the source code model.
 */
export class SourceModel implements ISourceModel {
    /**
     * Construct a source model.
     */
    constructor(options: SourceModel.IOptions) {
        this._codeSlice = options.codeSlice;
        this._cells = options.cells;
    }

    /**
     * Get the text for the code slice used in the computation.
     */
    get codeSlice(): string {
        return this._codeSlice;
    }

    /**
     * Get the cells for this revision of the source code.
     */
    get cells(): ReadonlyArray<ISlicedCellModel> {
        return this._cells;
    }

    private _codeSlice: string;
    private _cells: ReadonlyArray<ISlicedCellModel>;
}

/**
 * The namespace for `SourceModel` statics.
 */
export namespace SourceModel {
    /**
     * The options used to initialize a `SourceModel`.
     */
    export interface IOptions {
        /**
         * Code slice including all lines that were used to compute a result.
         */
        codeSlice?: string;

        /**
         * The cells in the notebook at the time of this revision.
         */
        cells: ReadonlyArray<ISlicedCellModel>;
    }
}