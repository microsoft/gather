import { HistoryModel } from './model';
import { RevisionModel } from '../revision/model';
import { CodeVersionModel } from '../codeversion/model';
import { SlicedCellModel } from '../slicedcell/model';
import { SlicedExecution } from '../../slicing/ExecutionSlicer';
import { ICell, IOutputterCell, instanceOfIOutputterCell, CellSlice } from '../cell/model';
import { textdiff } from './diff';


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
    let latestCellVersions: { [cellId: string]: CellSlice } = {};
    lastestVersion.cellSlices.forEach((cellSlice) => {
        latestCellVersions[cellSlice.cell.id] = cellSlice;
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
            let recentCellVersion = latestCellVersions[cell.id];
            let latestText: string = "";
            if (recentCellVersion) {
                latestText = recentCellVersion.textSlice;
            }

            let thisVersionText: string = cellSlice.textSlice;
            let diff = textdiff(latestText, thisVersionText);

            let slicedCell: SlicedCellModel = new SlicedCellModel({
                cellId: cell.id,
                executionCount: cell.executionCount,
                sourceCode: diff.text,
                diff: diff
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