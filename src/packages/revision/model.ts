import { nbformat } from '@jupyterlab/coreutils';
import { ICodeVersionModel } from '../codeversion';

/**
 * The definition of a model object for a code version.
 */
export interface IRevisionModel {
    /**
     * A unique index for this code version---lower indexes were are for earlier versions.
     */
    readonly versionIndex: number;

    /**
     * The source code for this revision.
     */
    readonly source: ICodeVersionModel;

    /**
     * The result of the computation.
     */
    readonly result: nbformat.IDisplayData;
}

/**
 * An implementation of the code version model.
 */
export class RevisionModel implements IRevisionModel {
    /**
     * Construct a code version model.
     */
    constructor(options: RevisionModel.IOptions) {
        this.versionIndex = options.versionIndex;
        this._source = options.source;
        this._result = options.result;
    }

    readonly versionIndex: number; 

    /**
     * Get the source code for this revision.
     */
    get source(): ICodeVersionModel {
        return this._source;
    }

    /**
     * Get the result of this computation.
     */
    get result(): nbformat.IDisplayData {
        return this._result;
    }

    private _source: ICodeVersionModel;
    private _result: nbformat.IDisplayData;
}

/**
 * The namespace for `RevisionModel` statics.
 */
export namespace RevisionModel {
    /**
     * The options used to initialize a `CodeVerionModel`.
     */
    export interface IOptions {
        /**
         * A slice of the source code for this revision.
         */
        source?: ICodeVersionModel;

        /**
         * A unique index for this version---lower indexes were made earlier.
         */
        versionIndex?: number;

        /**
         * The display data for the result at this version.
         */
        result?: nbformat.IDisplayData;

        /**
         * The time this version was created. POSIX format.
         */
        timeCreated?: string;
    }
}