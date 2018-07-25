declare var require: any
import { HistoryModel } from './model';
import { RevisionModel } from '../revision/model';
import { CodeVersionModel } from '../codeversion/model';
import { CharacterRange } from '../codeversion/characterrange';
import { CodeDiffModel } from '../codeversion/codediff';
import { SlicedCellModel } from '../slicedcell/model';
import { SlicedExecution } from '../../slicing/ExecutionSlicer';
import { ICell, IOutputterCell, instanceOfIOutputterCell } from '../cell/model';
let diff_match_patch = require('./diff-match-patch').diff_match_patch;

/**
 * Object instance for text diffing library.
 */
let diffMatchPatch = new diff_match_patch();

/**
 * Convert diff returned by diff_match_patch algorithm to code diff model.
 */
export function diffMatchPatchDiffToCodeDiff(diffMatchPatchDiff: Array<[number, string]>) {

    let text1: string = "";
    let text2: string = "";
    let updatedRanges: Array<CharacterRange> = new Array<CharacterRange>();
    let sameRanges: Array<CharacterRange> = new Array<CharacterRange>();

    // Iterate through the list of diff chunks to:
    // 1. Rebuild versions 1 and 2 of the string.
    // 2. Mark which positions in version 1 are the same and different from version 2.
    diffMatchPatchDiff.forEach(function (tuple: [number, string]) {

        let action: number = tuple[0];
        let substring: string = tuple[1];

        if (action == 1) {  // in version 1, not in version 2
            let rangeStart: number = text1.length;
            text1 += substring;
            let rangeEnd: number = text1.length - 1;
            updatedRanges.push(new CharacterRange(rangeStart, rangeEnd));
        } else if (action == -1) {  // in version 2, not in version 1
            text2 += substring;
        } else if (action == 0) {  // in both versions
            let rangeStart: number = text1.length;
            text1 += substring;
            text2 += substring;
            let rangeEnd: number = text1.length - 1;
            sameRanges.push(new CharacterRange(rangeStart, rangeEnd));
        }
    });

    return new CodeDiffModel({ text: text1, otherText: text2, updatedRanges, sameRanges });
}

/**
 * Build a history model of how a cell was computed across notebook snapshots.
 */
export function buildHistoryModel<TOutputModel>(
    selectedCellId: string,
    executionVersions: SlicedExecution[]
): HistoryModel<TOutputModel> {

    // All cells in past revisions will be compared to those in the current revision. For the most
    // recent version, save a mapping from cells' IDs to their content, so we can look them up to
    // make comparisons between versions of cells.
    let lastestVersion = executionVersions[executionVersions.length - 1];
    let latestCellVersions: { [cellId: string]: ICell } = {};
    lastestVersion.cellSlices.forEach((cellSlice) => {
        latestCellVersions[cellSlice.cell.id] = cellSlice.cell;
    });

    // Compute diffs between each of the previous revisions and the current revision.
    let revisions = new Array<RevisionModel<TOutputModel>>();
    executionVersions.forEach(function (executionVersion, versionIndex) {

        // Then difference the code in each cell.
        // Use the two-step diffing process of `diff_main` and `diff_cleanupSemantic` as the
        // second method will clean up the diffs to be more readable.
        let slicedCellModels: Array<SlicedCellModel> = new Array<SlicedCellModel>();
        executionVersion.cellSlices.forEach(function (cellSlice) {

            let cell = cellSlice.cell;
            let sliceLocations = cellSlice.slice.items.sort((a, b) => (a.first_line - b.first_line));

            let recentCellVersion = latestCellVersions[cell.id];
            let latestText: string = "";
            if (recentCellVersion) {
                latestText = recentCellVersion.text;
            }

            let thisVersionText: string = cell.text;
            let diff: Array<[number, string]> = diffMatchPatch.diff_main(latestText, thisVersionText);
            diffMatchPatch.diff_cleanupSemantic(diff);
            let cellDiff: CodeDiffModel = diffMatchPatchDiffToCodeDiff(diff);

            let sliceRanges = [];
            let cellLines = thisVersionText.split('\n')
            let lineFirstCharIndex = 0;
            
            // TODO: mark up character ranges, not entire lines, as being in the slice or not.
            let sliceLines: number[] = [];
            sliceLocations.forEach((loc) => {
                for (let lineNumber = loc.first_line - 1; lineNumber <= loc.last_line - 1; lineNumber++) {
                    if (sliceLines.indexOf(lineNumber) != -1) {
                        sliceLines.push(lineNumber);
                    }
                }
            });

            for (let lineNumber = 0; lineNumber < cellLines.length; lineNumber++) {
                let lineLength = cellLines[lineNumber].length + 1;
                if (sliceLines.indexOf(lineNumber) != -1) {
                    sliceRanges.push(new CharacterRange(lineFirstCharIndex, lineFirstCharIndex + lineLength));
                }
                lineFirstCharIndex += lineLength;
            }

            let slicedCell: SlicedCellModel = new SlicedCellModel({
                cellId: cell.id,
                executionCount: cell.executionCount,
                sourceCode: thisVersionText,
                diff: cellDiff,
                cellInSlice: (sliceLines.length > 0),
                sliceRanges: sliceRanges
            });
            slicedCellModels.push(slicedCell);
        })

        let results: TOutputModel[] = null;
        let selectedCell: ICell = null;
        executionVersion.cellSlices.map(cs => cs.cell).forEach(function (cellModel) {
            if (cellModel.id == selectedCellId) {
                selectedCell = cellModel;
            }
        });
        if (selectedCell && instanceOfIOutputterCell(selectedCell)) {
            let selectedOutputterCell = selectedCell as IOutputterCell<TOutputModel>;
            if (selectedCell.outputs &&
                selectedCell.outputs.length > 0) {
                results = selectedOutputterCell.outputs;
            }
        }

        let isLatestVersion = (versionIndex == executionVersions.length - 1);
        let codeVersionModel: CodeVersionModel = new CodeVersionModel({
            cells: slicedCellModels,
            isLatest: isLatestVersion
        });
        let revisionModel = new RevisionModel<TOutputModel>({
            versionIndex: versionIndex + 1,  // Version index should start at 1
            source: codeVersionModel,
            results: results,
            isLatest: isLatestVersion,
            timeCreated: executionVersion.executionTime
        });
        revisions.push(revisionModel);
    });

    return new HistoryModel({ revisions: revisions });
}