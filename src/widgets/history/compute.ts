import {
  Cell,
  CellSlice,
  SlicedExecution
} from "@andrewhead/python-program-analysis";
import * as nbformat from '@jupyterlab/nbformat';
import { GatherModel } from "../../model";
import { NbGatherCell } from "../../model/cell";
import { CodeVersionModel } from "../codeversion/model";
import { RevisionModel } from "../revision/model";
import { SlicedCellModel } from "../slicedcell/model";
import { computeTextDiff } from "./diff";
import { HistoryModel } from "./model";

/**
 * Build a history model of how a cell was computed across notebook snapshots.
 */
export function buildHistoryModel(
  gatherModel: GatherModel,
  selectedCellPersistentId: string,
  executionVersions: SlicedExecution[],
  includeOutput?: boolean
): HistoryModel {
  // All cells in past revisions will be compared to those in the current revision. For the most
  // recent version, save a mapping from cells' IDs to their content, so we can look them up to
  // make comparisons between versions of cells.
  let lastestVersion = executionVersions[executionVersions.length - 1];
  let latestCellVersions: { [cellPersistentId: string]: CellSlice } = {};
  lastestVersion.cellSlices.forEach(cellSlice => {
    latestCellVersions[cellSlice.cell.persistentId] = cellSlice;
  });

  // Compute diffs between each of the previous revisions and the current revision.
  let revisions = new Array<RevisionModel>();
  executionVersions.forEach(function(executionVersion, versionIndex) {
    // Then difference the code in each cell.
    // Use the two-step diffing process of `diff_main` and `diff_cleanupSemantic` as the
    // second method will clean up the diffs to be more readable.
    let slicedCellModels: Array<SlicedCellModel> = new Array<SlicedCellModel>();
    executionVersion.cellSlices.forEach(function(cellSlice) {
      let cell = cellSlice.cell;
      let recentCellVersion = latestCellVersions[cell.persistentId];
      let latestText: string = "";
      if (recentCellVersion) {
        latestText = recentCellVersion.textSliceLines;
      }

      let thisVersionText: string = cellSlice.textSliceLines;
      let diff = computeTextDiff(latestText, thisVersionText);

      let slicedCell: SlicedCellModel = new SlicedCellModel({
        executionEventId: cell.executionEventId,
        executionCount: cell.executionCount,
        sourceCode: diff.text,
        diff: diff
      });
      slicedCellModels.push(slicedCell);
    });

    let output: nbformat.IOutput[] = null;
    if (includeOutput) {
      let selectedCell: Cell = null;
      executionVersion.cellSlices
        .map(cs => cs.cell)
        .forEach(function(cellModel) {
          if (cellModel.persistentId == selectedCellPersistentId) {
            selectedCell = cellModel;
          }
        });
      if (
        selectedCell &&
        selectedCell instanceof NbGatherCell &&
        selectedCell.outputs
      ) {
        output = selectedCell.outputs;
      }
    }

    let isLatestVersion = versionIndex == executionVersions.length - 1;
    let codeVersionModel: CodeVersionModel = new CodeVersionModel({
      cells: slicedCellModels,
      isLatest: isLatestVersion
    });
    let revisionModel = new RevisionModel({
      versionIndex: versionIndex + 1, // Version index should start at 1
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
