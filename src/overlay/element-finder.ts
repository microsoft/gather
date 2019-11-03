import { Cell, isCodeCellModel } from "@jupyterlab/cells";
import { CodeMirrorEditor } from "@jupyterlab/codemirror";
import { NotebookPanel } from "@jupyterlab/notebook";
import * as py from "@msrvida/python-program-analysis";
import CodeMirror from "codemirror";
import { LabCell } from "../model/cell";

/**
 * Finds the HTML elements in a notebook corresponding to a cell. Useful for looking up HTML
 * elements when all you have is a copy of a notebook cell and not the actual cell.
 */
export class NotebookElementFinder {
  constructor(notebook: NotebookPanel) {
    this._notebook = notebook;
  }

  /**
   * Look up cells in the notebook using the ID of the execution event that executed it last.
   * This is the only way to make sure we get the right cell if a cell has been executed
   * with the same exeuction count twice in two separate notebook sessions.
   */
  getCellWidget(cell: py.Cell): Cell | null {
    for (let cellWidget of this._notebook.content.widgets) {
      if (isCodeCellModel(cellWidget.model)) {
        let labCell = new LabCell(cellWidget.model);
        if (labCell.executionEventId == cell.executionEventId) {
          return cellWidget;
        }
      }
    }
    return null;
  }

  /**
   * Get the element for the code editor for a cell.
   */
  getEditor(cell: py.Cell): CodeMirror.Editor | null {
    let widget = this.getCellWidget(cell);
    return this._getEditor(widget);
  }

  _getEditor(cell: Cell): CodeMirror.Editor | null {
    if (cell && cell.editor instanceof CodeMirrorEditor) {
      return cell.editor.editor;
    }
    return null;
  }

  /**
   * Finds HTML elements for cell outputs in a notebook.
   */
  getOutputs(cell: py.Cell): HTMLElement[] {
    let cellWidget = this.getCellWidget(cell);
    let outputElements: HTMLElement[] = [];
    if (cellWidget == null) {
      return outputElements;
    }
    let cellElement = cellWidget.node;
    var outputNodes = cellElement.querySelectorAll(".jp-OutputArea-output");
    for (var i = 0; i < outputNodes.length; i++) {
      if (outputNodes[i] instanceof HTMLElement) {
        outputElements.push(outputNodes[i] as HTMLElement);
      }
    }
    return outputElements;
  }

  private _notebook: NotebookPanel;
}
