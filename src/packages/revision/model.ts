import { ICodeVersionModel } from '../codeversion/model';

/**
 * The definition of a model object for a code version.
 */
export interface IRevisionModel<TOutputModel> {
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
    readonly results: TOutputModel[];

    /**
     * Whether this revision is the latest revision.
     */
    readonly isLatest: boolean;

    /**
     * The time this version was created.
     */
    readonly timeCreated: Date;
}

/**
 * An implementation of the code version model.
 */
export class RevisionModel<TOutputModel> implements IRevisionModel<TOutputModel> {
    /**
     * Construct a code version model.
     */
    constructor(options: RevisionModel.IOptions<TOutputModel>) {
        this.versionIndex = options.versionIndex;
        this._source = options.source;
        this._results = options.results;
        this.isLatest = options.isLatest;
        this._timeCreated = options.timeCreated;
    }

    readonly versionIndex: number; 
    readonly isLatest: boolean;

    /**
     * Get the source code for this revision.
     */
    get source(): ICodeVersionModel {
        return this._source;
    }

    /**
     * Get the result of this computation.
     */
    get results(): TOutputModel[] {
        return this._results;
    }

    /**
     * Get the time this revision was created.
     */
    get timeCreated(): Date {
        return this._timeCreated;
    }

    private _source: ICodeVersionModel;
    private _results: TOutputModel[];
    private _timeCreated: Date;
}

/**
 * The namespace for `RevisionModel` statics.
 */
export namespace RevisionModel {
    /**
     * The options used to initialize a `CodeVerionModel`.
     */
    export interface IOptions<TOutputModel> {
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
        results?: TOutputModel[];

        /**
         * Whether this revision is the latest revision.
         */
        isLatest?: boolean;

        /**
         * The time this version was created.
         */
        timeCreated?: Date;
    }
}