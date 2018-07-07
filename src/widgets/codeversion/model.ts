import { CodeEditor } from '@jupyterlab/codeeditor';
import { IModelDB } from '@jupyterlab/observables';
import { ISourceModel } from './source';
import { nbformat } from '@jupyterlab/coreutils';

/**
 * The definition of a model object for a code version.
 */
export interface ICodeVersionModel extends CodeEditor.IModel {
    /**
     * A unique index for this code version---lower indexes were are for earlier versions.
     */
    readonly versionIndex: number;

    /**
     * The source code for this revision.
     */
    readonly source: ISourceModel;

    /**
     * The result of the computation.
     */
    readonly result: nbformat.IDisplayData;
}

/**
 * An implementation of the code version model.
 */
export class CodeVersionModel extends CodeEditor.Model implements ICodeVersionModel {
    /**
     * Construct a code version model.
     */
    constructor(options: CodeVersionModel.IOptions) {
        super({ modelDB: options.modelDB });
        
        this.versionIndex = options.versionIndex;

        let text = options.source.codeSlice;
        this.value.text = text as string;

        this._source = options.source;
        this._result = options.result;
    }

    readonly versionIndex: number; 

    /**
     * Get the source code for this revision.
     */
    get source(): ISourceModel {
        return this._source;
    }

    /**
     * Get the result of this computation.
     */
    get result(): nbformat.IDisplayData {
        return this._result;
    }

    private _source: ISourceModel;
    private _result: nbformat.IDisplayData;
}

/**
 * The namespace for `CodeVersionModel` statics.
 */
export namespace CodeVersionModel {
    /**
     * The options used to initialize a `CodeVerionModel`.
     */
    export interface IOptions {
        /**
         * A slice of the source code for this revision.
         */
        source?: ISourceModel;

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

        /**
         * An IModelDB in which to store cell data.
         */
        modelDB?: IModelDB;
    }
}