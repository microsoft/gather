import { ICodeCellModel } from '@jupyterlab/cells';
import { HistoryModel } from './model';
import { RevisionModel } from '../revision';
import { CharacterRange, CodeDiffModel, CodeVersionModel } from '../codeversion';
import { SlicedCellModel } from '../slicedcell';
import { nbformat } from '../../../node_modules/@jupyterlab/coreutils';
let diff_match_patch = require('./diff-match-patch').diff_match_patch;

export class CellSnapshot {
    constructor(
        public id: string,
        public cellModel: ICodeCellModel) {
    }
}

export class NotebookSnapshot {
    constructor(
        public cells: CellSnapshot[]
    ) { }
}

/**
 * Get in-order listing of the executed source code from this notebook snapshot.
 * TODO(andrewhead): this should add cell content in the order cells were executed.
 */
export function getExecutedSource(notebookSnapshot: NotebookSnapshot) {
    let sourceCode: string = "";
    notebookSnapshot.cells.forEach(function(cellRevision) {
        sourceCode += (cellRevision.cellModel.value.text + "\n");
    });
    return sourceCode;
}

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
    notebookSnapshots: NotebookSnapshot[]
): HistoryModel {
    
    // All cells in past revisions will be compared to those in the current revision. For the most
    // recent version, save a mapping from cells' IDs to their content, so we can look them up to
    // make comparisons between versions of cells.
    let recentSnapshot: NotebookSnapshot = notebookSnapshots[notebookSnapshots.length - 1];
    let recentCellSnapshots: { [cellId: string]: CellSnapshot } = {};
    recentSnapshot.cells.forEach(function(cellRevision) {
        recentCellSnapshots[cellRevision.id] = cellRevision;
    });

    // Get all the source code that was executed in the most recent version of the notebook.
    // TODO(andrewhead): this should instead add cell content in the order they were executed.
    let recentExecutedSource: string = getExecutedSource(recentSnapshot);

    let diffMatchPatch = new diff_match_patch();

    // Compute diffs between each of the previous revisions and the current revision.
    let revisions = new Array<RevisionModel>();
    notebookSnapshots.forEach(function(notebookSnapshot: NotebookSnapshot, versionIndex: number) {

        // Difference the entire source of both versions.
        // Use the two-step diffing process of `diff_main` and `diff_cleanupSemantic` as the
        // second method will clean up the diffs to be more readable.
        let snapshotExecutedSource: string = getExecutedSource(notebookSnapshot);
        let sourceDiff: Array<[number, string]> = diffMatchPatch.diff_main(recentExecutedSource, snapshotExecutedSource);
        diffMatchPatch.diff_cleanupSemantic(sourceDiff);
        let sourceDiffModel: CodeDiffModel = diffMatchPatchDiffToCodeDiff(sourceDiff);

        // Then difference the code in each cell.
        let slicedCellModels:Array<SlicedCellModel> = new Array<SlicedCellModel>();
        notebookSnapshot.cells.forEach(function(cellSnapshot: CellSnapshot) {
            
            let recentCellSnapshot: CellSnapshot = recentCellSnapshots[cellSnapshot.id];
            let recentText: string = "";
            if (recentCellSnapshot) {
                recentText = recentCellSnapshot.cellModel.value.text;
            }

            let snapshotText: string = cellSnapshot.cellModel.value.text;
            let cellDiff: Array<[number, string]> = diffMatchPatch.diff_main(recentText, snapshotText);
            diffMatchPatch.diff_cleanupSemantic(cellDiff);
            let cellDiffModel: CodeDiffModel = diffMatchPatchDiffToCodeDiff(cellDiff);
            
            let slicedCellModel: SlicedCellModel  = new SlicedCellModel({
                cellId: cellSnapshot.id,
                executionCount: cellSnapshot.cellModel.executionCount,
                sourceCode: snapshotText,
                diff: cellDiffModel,
                // TODO(andrewhead): update with slice information.
                cellInSlice: true,
                sliceRanges: []
            });
            slicedCellModels.push(slicedCellModel);
        })

        let result: nbformat.IOutput = null;
        let selectedCellSnapshot: CellSnapshot = null
        notebookSnapshot.cells.forEach(function(cellSnapshot: CellSnapshot) {
            if (cellSnapshot.id == selectedCellId) {
                selectedCellSnapshot = cellSnapshot;
            }
        });
        if (selectedCellSnapshot) {
            if (selectedCellSnapshot.cellModel.outputs &&
                selectedCellSnapshot.cellModel.outputs.length > 0) {
                result = selectedCellSnapshot.cellModel.outputs.get(0).toJSON();
            }
        }

        let codeVersionModel:CodeVersionModel = new CodeVersionModel({
            sourceCode: snapshotExecutedSource,
            // TODO(andrewhead): update with slice information.
            codeSlice: "",
            sliceDiff: sourceDiffModel,
            cells: slicedCellModels
        });
        let revisionModel:RevisionModel = new RevisionModel({
            versionIndex: versionIndex,
            source: codeVersionModel,
            result: result
        });
        revisions.push(revisionModel);
    });

    return new HistoryModel({ revisions: revisions });
}