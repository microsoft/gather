declare var require: any
import { CharacterRange } from "../codeversion";
import { ILocation } from "../../parsers/python/python_parser";
let diff_match_patch = require('./diff-match-patch').diff_match_patch;


/**
 * Object instance for text diffing library.
 */
let diffMatchPatch = new diff_match_patch();

export type Diff = {
    text: string;
    beforeLines: number[];
    afterLines: number[];
    changeLocations: ILocation[];
}

type DiffLine = {
    text: string;
    version: "before"|"after"|"both";
    changeRanges: CharacterRange[];
}

/**
 * Difference two versions of text. This outputs:
 * - a buffer of line-by-line text of a pairwise diff
 * - line numbers of the versions of the line from before, and from after
 * - character ranges of all locations where the text has changed
 */
export function textdiff(before: string, after: string): Diff {

    // Diff the two versions of the text.
    let diff: Array<[number, string]> = diffMatchPatch.diff_main(before, after);
    diffMatchPatch.diff_cleanupSemantic(diff);

    // Plaintext for the diff representation.
    let beforeHasText = before.length > 0;
    let afterHasText = after.length > 0;
    let beforeLine = "";
    let afterLine = "";
    let diffLines: DiffLine[] = [];
    let beforeLineChanges: CharacterRange[] = [];
    let afterLineChanges: CharacterRange[] = [];

    function addLines(beforeLine: string, afterLine: string, beforeLineChanges?: CharacterRange[],
            afterLineChanges?: CharacterRange[]) {
        beforeLineChanges = beforeLineChanges || [];
        afterLineChanges = afterLineChanges || [];
        if (beforeLine == afterLine) {
            diffLines.push({ text: beforeLine, version: "both", changeRanges: [] });
        } else {
            if (beforeLine != null) {
                diffLines.push({ text: beforeLine, version: "before", changeRanges: beforeLineChanges.concat() });
                beforeLineChanges = [];
            }
            if (afterLine != null) {
                diffLines.push({ text: afterLine, version: "after", changeRanges: afterLineChanges.concat() });
                afterLineChanges = [];
            }
        }
    }

    // Sort diff segments so that "before" segments always appear before "after" segments.
    // This is so we can make sure to enqueue "before" version of lines before "after" ones.
    diff.sort((segment1, segment2) => {
        if (segment1[0] == 0 || segment2[0] == 0) return 0;
        else return segment1[0] == -1 ? -1 : 1;
    })

    // Iterate through the list of diff chunks to:
    for (let segment of diff) {

        let action: number = segment[0];
        let substring: string = segment[1];
        let substringLines = substring.split('\n');

        for (let l = 0; l < substringLines.length; l++) {
            let substringLine = substringLines[l];
            let isLastLine = (l == substringLines.length - 1);
            let isInitialNewline = (l == 0 && substringLine == "");
            if (action == 0) {  // same in both versions
                beforeLine += substringLine;
                afterLine += substringLine;
                if (!isLastLine) {
                    addLines(beforeLine, afterLine, beforeLineChanges, afterLineChanges);
                    beforeLine = "";
                    afterLine = "";
                }
            } else if (action == -1) {  // in before, not after
                if (isInitialNewline) substringLine = "⏎";
                beforeLineChanges.push({ start: beforeLine.length, end: beforeLine.length + substringLine.length });
                beforeLine += substringLine;
                if (!isLastLine) {
                    addLines(beforeLine, null, beforeLineChanges);
                    beforeLine = "";
                }
            } else if (action == 1) {  // in after, not before
                if (isInitialNewline) substringLine = "⏎";
                afterLineChanges.push({ start: afterLine.length, end: afterLine.length + substringLine.length });
                afterLine += substringLine;
                if (!isLastLine) {
                    addLines(null, afterLine, null, afterLineChanges);
                    afterLine = "";
                }
            }
        }
    }

    // Add any residual before and after lines to the text.
    beforeLine = beforeHasText ? beforeLine : undefined;
    afterLine = afterHasText ? afterLine : undefined;
    addLines(beforeLine, afterLine, beforeLineChanges, afterLineChanges);

    let beforeLineNumbers: number[] = [];
    let afterLineNumbers: number[] = [];
    let changeLocations: ILocation[] = [];

    // All "before" diff lines should go before "after" diff lines.
    diffLines.sort((diffLine1, diffLine2) => {
        if (diffLine1.version == "both" || diffLine2.version == "both") return 0;
        else if (diffLine1.version == diffLine2.version) return 0;
        else return diffLine1.version == "before" ? -1: 1;
    });

    let diffTextLines = [];
    for (let i = 0; i < diffLines.length; i++) {
        let diffLine = diffLines[i];
        let lineNumber = i + 1;
        diffTextLines.push(diffLine.text);
        if (diffLine.version == "before") beforeLineNumbers.push(lineNumber);
        if (diffLine.version == "after") afterLineNumbers.push(lineNumber);
        for (let range of diffLine.changeRanges) {
            changeLocations.push({
                first_line: lineNumber,
                first_column: range.start,
                last_line: lineNumber,
                last_column: range.end
            });
        }
    }

    return {
        text: diffTextLines.join("\n"),
        beforeLines: beforeLineNumbers,
        afterLines: afterLineNumbers,
        changeLocations: changeLocations
    };
}