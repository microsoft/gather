import { HistoryModel } from './model';
import { RevisionModel } from '../revision/model';
import { CodeVersionModel } from '../codeversion/model';
import { SlicedCellModel } from '../slicedcell/model';
import { SlicedExecution } from '../../slicing/ExecutionSlicer';
import { ICell, IOutputterCell, instanceOfIOutputterCell, CellSlice } from '../cell/model';
import { computeTextDiff } from './diff';
import { GatherModel } from '../gather';


/**
 * Build a history model of how a cell was computed across notebook snapshots.
 */
export function buildHistoryModel(
    gatherModel: GatherModel,
    selectedCellPersistentId: string,
    executionVersions: SlicedExecution[],
    includeOutput?: boolean
): HistoryModel<any> {

    // All cells in past revisions will be compared to those in the current revision. For the most
    // recent version, save a mapping from cells' IDs to their content, so we can look them up to
    // make comparisons between versions of cells.
    let lastestVersion = executionVersions[executionVersions.length - 1];
    let latestCellVersions: { [cellPersistentId: string]: CellSlice } = {};
    lastestVersion.cellSlices.forEach(cellSlice => {
        latestCellVersions[cellSlice.cell.persistentId] = cellSlice;
    });

    // Compute diffs between each of the previous revisions and the current revision.
    let revisions = new Array();
    executionVersions.forEach(function (executionVersion, versionIndex) {

        // Then difference the code in each cell.
        // Use the two-step diffing process of `diff_main` and `diff_cleanupSemantic` as the
        // second method will clean up the diffs to be more readable.
        let slicedCellModels: Array<SlicedCellModel> = new Array<SlicedCellModel>();
        executionVersion.cellSlices.forEach(function (cellSlice) {

            let cell = cellSlice.cell;
            let recentCellVersion = latestCellVersions[cell.persistentId];
            let latestText: string = "";
            if (recentCellVersion) {
                latestText = recentCellVersion.textSlice;
            }

            let thisVersionText: string = cellSlice.textSlice;
            let diff = computeTextDiff(latestText, thisVersionText);

            let slicedCell: SlicedCellModel = new SlicedCellModel({
                cellPersistentId: cell.persistentId,
                executionCount: cell.executionCount,
                sourceCode: diff.text,
                diff: diff
            });
            slicedCellModels.push(slicedCell);
        })

        let output = null;
        if (includeOutput) {
            let selectedCell: ICell = null;
            executionVersion.cellSlices.map(cs => cs.cell).forEach(function (cellModel) {
                if (cellModel.persistentId == selectedCellPersistentId) {
                    selectedCell = cellModel;
                }
            });
            if (selectedCell && instanceOfIOutputterCell(selectedCell)) {
                let selectedOutputterCell = selectedCell as IOutputterCell;
                if (selectedCell.output) {
                    output = selectedOutputterCell.output;
                }
            }
        }

        let isLatestVersion = (versionIndex == executionVersions.length - 1);
        let codeVersionModel: CodeVersionModel = new CodeVersionModel({
            cells: slicedCellModels,
            isLatest: isLatestVersion
        });
        let revisionModel = new RevisionModel({
            versionIndex: versionIndex + 1,  // Version index should start at 1
            source: codeVersionModel,
            slice: executionVersion,
            gatherModel: gatherModel,
            output: output,
            isLatest: isLatestVersion,
            timeCreated: executionVersion.executionTime
        });
        revisions.push(revisionModel);
    });

    return new HistoryModel({ revisions: revisions });
}
