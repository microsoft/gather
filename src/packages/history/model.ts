import { IRevisionModel } from "../revision";

/**
 * The definition of a model object for a code history.
 */
export interface IHistoryModel<TOutputModel> {
    readonly revisions: ReadonlyArray<IRevisionModel<TOutputModel>>;
}

/**
 * An implementation of the history model.
 */
export class HistoryModel<TOutputModel> implements IHistoryModel<TOutputModel> {
    /**
     * Construct a history model
     */
    constructor(options: HistoryModel.IOptions<TOutputModel>) {
        this._revisions = options.revisions;
    }

    /**
     * Get the versions from the history.
     */
    get revisions(): ReadonlyArray<IRevisionModel<TOutputModel>> {
        return this._revisions;
    }

    private _revisions: Array<IRevisionModel<TOutputModel>> = null;
}

/**
 * The namespace for `HistoryModel` statics.
 */
export namespace HistoryModel {
    /**
     * The options used to initialize a `HistoryModel`.
     */
    export interface IOptions<TOutputModel> {
        /**
         * Versions of the code.
         */
        revisions?: Array<IRevisionModel<TOutputModel>>;
    }
}