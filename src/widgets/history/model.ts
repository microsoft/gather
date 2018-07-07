import { ICodeVersionModel } from "../codeversion";

/**
 * The definition of a model object for a code history.
 */
export interface IHistoryModel {
    readonly versions: ReadonlyArray<ICodeVersionModel>;
}

/**
 * An implementation of the history model.
 */
export class HistoryModel implements IHistoryModel {
    /**
     * Construct a history model
     */
    constructor(options: HistoryModel.IOptions) {
        this._versions = options.versions;
    }

    /**
     * Get the versions from the history.
     */
    get versions(): ReadonlyArray<ICodeVersionModel> {
        return this._versions;
    }

    private _versions: Array<ICodeVersionModel> = null;
}

/**
 * The namespace for `HistoryModel` statics.
 */
export namespace HistoryModel {
    /**
     * The options used to initialize a `HistoryModel`.
     */
    export interface IOptions {
        /**
         * Versions of the code.
         */
        versions?: Array<ICodeVersionModel>;
    }
}