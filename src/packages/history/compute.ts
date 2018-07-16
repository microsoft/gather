import { ICodeCellModel } from '@jupyterlab/cells';
import { HistoryModel } from './model';
import { RevisionModel } from '../revision';
import { CharacterRange, CodeDiffModel, CodeVersionModel } from '../codeversion';
import { SlicedCellModel } from '../slicedcell';
import { NumberSet } from '../../Set';
import { IOutputAreaModel } from '@jupyterlab/outputarea';
let diff_match_patch = require('./diff-match-patch').diff_match_patch;

/**
 * A record of when a cell was executed.
 */
export class CellExecution {
    constructor(
        public cellId: string,
        public executionCount: number,
        public executionTime: Date
    ) { }
}

/**
 * A slice over a version of executed code.
 */
export class SlicedExecution {
    constructor(
        public executionTime: Date,
        public cellSlices: Array<[ICodeCellModel, NumberSet]>
    ) { }
}

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
    diffMatchPatchDiff.forEach(function(tuple: [number,string]) {

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
export function buildHistoryModel(
    selectedCellId: string,
    executionVersions: SlicedExecution[]
): HistoryModel {
    
    // All cells in past revisions will be compared to those in the current revision. For the most
    // recent version, save a mapping from cells' IDs to their content, so we can look them up to
    // make comparisons between versions of cells.
    let lastestVersion = executionVersions[executionVersions.length - 1];
    let latestCellVersions: { [ cellId: string ]: ICodeCellModel } = {};
    lastestVersion.cellSlices.forEach(([cellModel, _]) => {
        latestCellVersions[cellModel.id] = cellModel;
    });

    // Compute diffs between each of the previous revisions and the current revision.
    let revisions = new Array<RevisionModel>();
    executionVersions.forEach(function(executionVersion, versionIndex) {

        // Then difference the code in each cell.
        // Use the two-step diffing process of `diff_main` and `diff_cleanupSemantic` as the
        // second method will clean up the diffs to be more readable.
        let slicedCellModels:Array<SlicedCellModel> = new Array<SlicedCellModel>();
        executionVersion.cellSlices.forEach(function(cellSlice) {
            
            let cellModel = cellSlice[0];
            let sliceLines = cellSlice[1].items.sort((a, b) => (a - b));

            let recentCellVersion = latestCellVersions[cellModel.id];
            let latestText: string = "";
            if (recentCellVersion) {
                latestText = recentCellVersion.value.text;
            }

            let thisVersionText: string = cellModel.value.text;
            let diff: Array<[number, string]> = diffMatchPatch.diff_main(latestText, thisVersionText);
            diffMatchPatch.diff_cleanupSemantic(diff);
            let cellDiffModel: CodeDiffModel = diffMatchPatchDiffToCodeDiff(diff);
            
            let sliceRanges = [];
            let cellLines = thisVersionText.split('\n')
            let lineFirstCharIndex = 0;
            for (let lineNumber = 0; lineNumber < cellLines.length; lineNumber++) {
                let lineLength = cellLines[lineNumber].length + 1;
                if (sliceLines.indexOf(lineNumber) != -1) {
                    sliceRanges.push(new CharacterRange(lineFirstCharIndex, lineFirstCharIndex + lineLength));
                }
                lineFirstCharIndex += lineLength;
            }

            let slicedCellModel: SlicedCellModel  = new SlicedCellModel({
                cellId: cellModel.id,
                executionCount: cellModel.executionCount,
                sourceCode: thisVersionText,
                diff: cellDiffModel,
                cellInSlice: (sliceLines.length > 0),
                sliceRanges: sliceRanges
            });
            slicedCellModels.push(slicedCellModel);
        })

        let results: IOutputAreaModel = null;
        let selectedCellModel:ICodeCellModel = null;
        executionVersion.cellSlices.map(cs => cs[0]).forEach(function(cellModel) {
            if (cellModel.id == selectedCellId) {
                selectedCellModel = cellModel;
            }
        });
        if (selectedCellModel) {
            if (selectedCellModel.outputs &&
                selectedCellModel.outputs.length > 0) {
                results = selectedCellModel.outputs;
            }
        }

        let isLatestVersion =  (versionIndex == executionVersions.length - 1);
        let codeVersionModel:CodeVersionModel = new CodeVersionModel({
            cells: slicedCellModels,
            isLatest: isLatestVersion
        });
        let revisionModel:RevisionModel = new RevisionModel({
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