/**
 * The definition of a model object for an execution result / display data.
 */
export interface IResultModel {
    /**
     * The displayed data's MIME type (e.g., image/png)
     */
    readonly mimeType: string;

    /**
     * The raw data.
     */
    readonly data: string;
}

/**
 * An implementation of the result model.
 */
export class ResultModel implements IResultModel {
    /**
     * Construct a result model.
     */
    constructor(options: ResultModel.IOptions) {
        this._mimeType = options.mimeType;
        this._data = options.data;
    }

    /**
     * Get the MIME type for the result.
     */
    get mimeType(): string {
        return this._mimeType;
    }

    /**
     * Get the result's data.
     */
    get data(): string {
        return this._data;
    }

    private _mimeType: string;
    private _data: string;
}

/**
 * The namespace for `ResultModel` statics.
 */
export namespace ResultModel {
    /**
     * The options used to initialize a `ResultModel`.
     */
    export interface IOptions {
        /**
         * The displayed data's MIME type (e.g., image/png)
         */
        mimeType: string;

        /**
         * The raw data.
         */
        data: string;
    }
}