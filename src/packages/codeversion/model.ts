import { ISlicedCellModel } from '../slicedcell';
import { CodeDiffModel } from './codediff';

/**
 * The definition of a model object for a source code revision.
 */
export interface ICodeVersionModel {
    /**
     * All the source code from a snapshot of the notebook.
     */
    readonly sourceCode: string;

    /**
     * A slice of the source code from a snapshot of a notebook execution.
     */
    readonly codeSlice: string;

    /**
     * A difference between this version of the slice, and the most recent version of the slice.
     */
    readonly sliceDiff: CodeDiffModel;

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
        this._sourceCode = options.sourceCode;
        this._codeSlice = options.codeSlice;
        this._sliceDiff = options.sliceDiff;
        this._cells = options.cells;
    }

    /**
     * Get the source code for this notebook snapshot.
     */
    get sourceCode(): string {
        return this._sourceCode;
    }

    /**
     * Get the text for the code slice used in the computation.
     */
    get codeSlice(): string {
        return this._codeSlice;
    }

    /**
     * Get a difference between this slice and the most recent slice.
     */
    get sliceDiff(): CodeDiffModel {
        return this._sliceDiff;
    }

    /**
     * Get the cells for this revision of the source code.
     */
    get cells(): ReadonlyArray<ISlicedCellModel> {
        return this._cells;
    }

    private _sourceCode: string;
    private _codeSlice: string;
    private _sliceDiff: CodeDiffModel;
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
         * All the source code from a snapshot of the notebook.
         */
        sourceCode: string;
        
        /**
         * Code slice including all lines that were used to compute a result.
         */
        codeSlice?: string;

        /**
         * A difference between this version of the slice, and the most recent version of the slice.
         */
        sliceDiff: CodeDiffModel;

        /**
         * The cells in the notebook at the time of this revision.
         */
        cells: ReadonlyArray<ISlicedCellModel>;
    }
}