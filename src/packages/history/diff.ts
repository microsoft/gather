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
    let text = "";
    let beforeLine = "";
    let afterLine = "";
    let beforeLines: number[] = [];
    let afterLines: number[] = []
    let beforeLineChanges: CharacterRange[] = [];
    let afterLineChanges: CharacterRange[] = [];
    let changeLocations: ILocation[] = [];

    function addLines(beforeLine: string, afterLine: string, beforeLineChanges?: CharacterRange[],
            afterLineChanges?: CharacterRange[]) {
        if (beforeLine == afterLine) {
            text += beforeLine + "\n";
        } else {
            if (beforeLine != null) {
                let lineIndex = text.split('\n').length;
                beforeLines.push(lineIndex);
                if (beforeLineChanges) {
                    for (let range of beforeLineChanges) {
                        addChange(changeLocations, lineIndex, range.start, lineIndex, range.end);
                    }
                }
                text += beforeLine + "\n";
            }
            if (afterLine != null) {
                let lineIndex = text.split('\n').length;
                afterLines.push(lineIndex);
                if (afterLineChanges) {
                    for (let range of afterLineChanges) {
                        addChange(changeLocations, lineIndex, range.start, lineIndex, range.end);
                    }
                }
                text += afterLine + "\n";
            }
        }
    }

    function addChange(changeList: ILocation[], first_line: number, first_column: number,
        last_line: number, last_column: number) {
        changeList.push({
            first_line: first_line,
            first_column: first_column,
            last_line: last_line,
            last_column: last_column
        })
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

        for (let substringLine of substringLines) {
            let isLastLine = (substringLine == substringLines[substringLines.length - 1]);
            if (action == 0) {  // same in both versions
                beforeLine += substring;
                afterLine += substring;
                if (!isLastLine) {
                    addLines(beforeLine, afterLine);
                    beforeLine = "";
                    afterLine = "";
                }
            } else if (action == -1) {  // in before, not after
                beforeLineChanges.push({ start: beforeLine.length, end: beforeLine.length + substring.length });
                beforeLine += substring;
                if (!isLastLine) {
                    addLines(beforeLine, null, beforeLineChanges);
                    beforeLine = "";
                }
            } else if (action == 1) {  // in after, not before
                afterLineChanges.push({ start: afterLine.length, end: afterLine.length + substring.length });
                afterLine += substring;
                if (!isLastLine) {
                    addLines(null, afterLine, null, afterLineChanges);
                    afterLine = "";
                }
            }
        }
    }

    // Add any residual before and after lines to the text.
    addLines(beforeLine, afterLine, beforeLineChanges, afterLineChanges);
    
    // Remove the last newline
    let textLines = text.split('\n');
    text = textLines.slice(0, textLines.length - 1).join('\n');

    return {
        text: text,
        beforeLines: beforeLines,
        afterLines: afterLines,
        changeLocations: changeLocations
    };
}