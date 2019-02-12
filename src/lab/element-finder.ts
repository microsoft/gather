import { NotebookPanel } from "@jupyterlab/notebook";
import { Cell, CodeCell, isCodeCellModel } from "@jupyterlab/cells";
import { ICell } from "../packages/cell";
import CodeMirror from "codemirror";
import { CodeMirrorEditor } from "@jupyterlab/codemirror";
import { LabCell } from "./LabCell";

/**
 * Finds the HTML elements in a notebook corresponding to a cell. Useful for looking up HTML
 * elements when all you have is a copy of a notebook cell and not the actual cell.
 */
export class NotebookElementFinder {

    constructor(notebook: NotebookPanel) {
        this._notebook = notebook;
    }

    getCellWithPersistentId(persistentId: string): Cell | null {
        for (let cell of this._notebook.content.widgets) {
            if (isCodeCellModel(cell.model)) {
                let labCell = new LabCell(cell.model);
                if (labCell.persistentId == persistentId) {
                    return cell;
                }
            }
        }
        return null;
    }

    /**
     * Get a cell from the notebook.
     * (Don't call this right after a cell execution event, as it takes a while for the
     * execution count to update in an executed cell).
     */
    getCell(persistentId: string, executionCount?: number): Cell | null {
        let cell = this.getCellWithPersistentId(persistentId);
        if (cell != null && (cell as CodeCell).model.executionCount == executionCount) {
            return cell;
        }
        return null;
    }

    /**
     * Get the element for the code editor for a cell.
     */
    getEditor(cell: ICell): CodeMirror.Editor | null {
        let widget = this.getCellWithPersistentId(cell.persistentId);
        return this._getEditor(widget);
    }

    getEditorWithExecutionCount(cell: ICell): CodeMirror.Editor | null {
        let widget = this.getCell(cell.persistentId, cell.executionCount);
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
    getOutputs(cell: ICell): HTMLElement[] {
        let cellWidget = this.getCell(cell.persistentId, cell.executionCount);
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
