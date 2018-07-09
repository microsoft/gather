import { CharacterRange } from './characterrange';

/**
 * Class for a difference between code versions.
 */
export interface ICodeDiffModel {
    /**
     * Version 1 of the text.
     */
    readonly text: string;

    /**
     * Version 2 of the text.
     */
    readonly otherText: string;

    /**
     * Character ranges that are new / updated in version 1 of the text.
     */
    readonly updatedRanges: ReadonlyArray<CharacterRange>;

    /**
     * Characer ranges of text in version 1 that is also in version 2.
     */
    readonly sameRanges: ReadonlyArray<CharacterRange>;
}

/**
 * An implementation of the code diff model.
 */
export class CodeDiffModel {
    /**
     * Construct a code diff model.
     */
    constructor(options: CodeDiffModel.IOptions) {
        this._text = options.text;
        this._otherText = options.otherText;
        this._updatedRanges = options.updatedRanges;
        this._sameRanges = options.sameRanges;
    }

    /**
     * Get version 1 of the text.
     */
    get text(): string {
        return this._text;
    }

    /**
     * Get version 2 of the text.
     */
    get otherText(): string {
        return this._otherText;
    }

    /**
     * Get list of character ranges that are new / updated in version 1.
     */
    get updatedRanges(): ReadonlyArray<CharacterRange> {
        return this._updatedRanges;
    }

    /**
     * Get list of character ranges of text in version 1 that's also in version 2.
     */
    get sameRanges(): ReadonlyArray<CharacterRange> {
        return this._sameRanges;
    }

    private _text: string;
    private _otherText: string;
    private _updatedRanges: Array<CharacterRange>;
    private _sameRanges: Array<CharacterRange>;
}

/**
 * The namespace for `CodeDiff` statics.
 */
export namespace CodeDiffModel {

    /**
     * The options used to initialize a code diff model.
     */
    export interface IOptions {
        /**
         * Version 1 of the text.
         */
        text: string;

        /**
         * Version 2 of the text.
         */
        otherText: string;

        /**
         * Character ranges that are new / updated in version 1 of the text.
         */
        updatedRanges: Array<CharacterRange>;

        /**
         * Characer ranges of text in version 1 that is also in version 2.
         */
        sameRanges: Array<CharacterRange>;
    }
}