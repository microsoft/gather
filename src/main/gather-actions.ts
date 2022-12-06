import { SlicedExecution } from "@andrewhead/python-program-analysis";
import { Clipboard as JupyterClipboard } from "@jupyterlab/apputils";
import * as nbformat from '@jupyterlab/nbformat';
import { PathExt } from "@jupyterlab/coreutils";
import { IDocumentManager } from "@jupyterlab/docmanager";
import { IDocumentWidget } from "@jupyterlab/docregistry";
import { FileEditor } from "@jupyterlab/fileeditor";
import { INotebookTracker, NotebookPanel } from "@jupyterlab/notebook";
import { Kernel } from "@jupyterlab/services";
import { JSONObject } from "@lumino/coreutils";
import { Signal } from "@lumino/signaling";
import { OutputSelection } from "../model";
import { NbGatherCell } from "../model/cell";

/**
 * Listens to changes to the clipboard.
 */
export interface IClipboardListener {
  /**
   * Called when something is copied to the clipboard.
   */
  onCopy: (slice: SlicedExecution, clipboard: Clipboard) => void;
}

/**
 * Gather code to the clipboard. Base code found in
 * packages/notebooks/src/actions.tsx in Jupyter Lab project.
 */
export class Clipboard {
  static getInstance(): Clipboard {
    return this.INSTANCE;
  }

  copy(slice: SlicedExecution, outputSelections?: OutputSelection[]) {
    const JUPYTER_CELL_MIME = "application/vnd.jupyter.cells";
    if (slice) {
      let cellJson = getCellsJsonForSlice(slice, outputSelections);
      const clipboard = JupyterClipboard.getInstance();
      clipboard.clear();
      clipboard.setData(JUPYTER_CELL_MIME, cellJson);
      this.copied.emit(slice);
    }
  }

  private static INSTANCE = new Clipboard();

  /**
   * Signal emitted when a slice is copied to the clipbaord.
   */
  readonly copied = new Signal<this, SlicedExecution>(this);
}

/**
 * Get partial spec for a kernel that will allow us to launch another kernel for the same language.
 */
function _createKernelSpecForCurrentNotebook(notebooks: INotebookTracker): Partial<Kernel.IModel> {
  let spec = new Object(null) as JSONObject;
  if (notebooks.currentWidget && notebooks.currentWidget.sessionContext.session.kernel) {
    spec.name = notebooks.currentWidget.sessionContext.session.kernel.model.name;
  }
  return spec;
}

/**
 * Return undefined if a path could not be found for the current widget.
 */
function _getPathForCurrentNotebook(notebooks: INotebookTracker): string | undefined {
  let currentWidget = notebooks.currentWidget;
  if (
    currentWidget !== null &&
    currentWidget.context !== undefined &&
    currentWidget.context !== null
  ) {
    return PathExt.dirname(currentWidget.context.path);
  }
  return undefined;
}

/**
 * Opens new scripts containing program slices.
 */
export class ScriptOpener {
  constructor(documentManager: IDocumentManager, notebooks: INotebookTracker) {
    this._documentManager = documentManager;
    this._notebooks = notebooks;
  }

  openScriptForSlice(slice: SlicedExecution) {
    /*
     * By opening the new script in the same place as the original notebook, the relative
     * path of external dependences (data files, imports, etc.) should still be correct.
     */
    let notebookPath = _getPathForCurrentNotebook(this._notebooks);
    this._documentManager.newUntitled({ ext: "py", path: notebookPath }).then(model => {
      let kernelSpec = _createKernelSpecForCurrentNotebook(this._notebooks);
      let editor = this._documentManager.open(model.path, undefined, kernelSpec) as IDocumentWidget<
        FileEditor
      >;
      editor.context.ready.then(() => {
        if (slice) {
          let cellsJson = getCellsJsonForSlice(slice, []);
          let scriptText = cellsJson.map(cellJson => cellJson.source).join("\n");
          editor.content.model.value.text = scriptText;
        }
      });
    });
  }

  private _documentManager: IDocumentManager;
  private _notebooks: INotebookTracker;
}

/**
 * Opens new notebooks containing program slices.
 */
export class NotebookOpener {
  constructor(documentManager: IDocumentManager, notebooks: INotebookTracker) {
    this._documentManager = documentManager;
    this._notebooks = notebooks;
  }

  openNotebookForSlice(slice: SlicedExecution, outputSelections?: OutputSelection[]) {
    let notebookPath = _getPathForCurrentNotebook(this._notebooks);
    this._documentManager.newUntitled({ ext: "ipynb", path: notebookPath }).then(model => {
      let kernelSpec = _createKernelSpecForCurrentNotebook(this._notebooks);
      const widget = this._documentManager.open(model.path, undefined, kernelSpec) as NotebookPanel;
      widget.context.ready.then(() => {
        const notebookModel = widget.content.model;
        let notebookJson = notebookModel.toJSON() as nbformat.INotebookContent;
        notebookJson.cells = [];
        if (slice) {
          let cellsJson = getCellsJsonForSlice(slice, outputSelections);
          for (let cell of cellsJson) {
            notebookJson.cells.push(cell);
          }
        }
        notebookModel.fromJSON(notebookJson);
      });
    });
  }

  private _documentManager: IDocumentManager;
  private _notebooks: INotebookTracker;
}

/**
 * Convert program slice to list of cell JSONs.
 * Not intended to be called directly. Exported for testing purposes.
 */
export function getCellsJsonForSlice(
  slice: SlicedExecution,
  outputSelections?: OutputSelection[]
): nbformat.ICodeCell[] {
  const SHOULD_SLICE_CELLS = true;

  outputSelections = outputSelections || [];

  return slice.cellSlices
    .map(cellSlice => {
      let slicedCell = cellSlice.cell;
      if (SHOULD_SLICE_CELLS) {
        slicedCell = slicedCell.deepCopy();
        slicedCell.text = cellSlice.textSliceLines;
      }
      if (!(slicedCell instanceof NbGatherCell)) {
        return undefined;
      }
      let cellJson = slicedCell.serialize();
      // This new cell hasn't been executed yet. So don't mark it as having been executed.
      cellJson.execution_count = null;
      for (let output of cellJson.outputs) {
        if (nbformat.isExecuteResult(output)) {
          output.execution_count = null;
        }
      }
      // Add a flag to distinguish gathered cells from other cells.
      if (!cellJson.hasOwnProperty("metadata")) {
        cellJson.metadata = {};
      }
      cellJson.metadata.gathered = true;
      // Filter to just those outputs that were selected.
      let originalOutputs = cellJson.outputs;
      cellJson.outputs = [];
      if (originalOutputs) {
        for (let i = 0; i < originalOutputs.length; i++) {
          let output = originalOutputs[i];
          if (
            outputSelections.some(
              s => s.cell.executionEventId == slicedCell.executionEventId && s.outputIndex == i
            )
          ) {
            cellJson.outputs.push(output);
          }
        }
      }
      return cellJson;
    })
    .filter(c => c);
}
