import { ISlicedCellModel } from '../slicedcell';

/**
 * The definition of a model object for a source code revision.
 */
export interface ICodeVersionModel {
    /**
     * A string with the slice of code relevant to a result.
     */
    readonly codeSlice: string;

    /**
     * A list of cells for this version of the code, with slice info.
     */
    readonly cells: ReadonlyArray<ISlicedCellModel>;
}

/**
 * An implementation of the source code model.
 */
export class CodeVersionModel implements ICodeVersionModel {
    /**
     * Construct a source model.
     */
    constructor(options: CodeVersionModel.IOptions) {
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
 * The namespace for `CodeVersionModel` statics.
 */
export namespace CodeVersionModel {
    /**
     * The options used to initialize a `CodeVersionModel`.
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