import { CodeCellModel, ICellModel, ICodeCellModel } from "@jupyterlab/cells";
import { NotebookPanel } from "@jupyterlab/notebook";
import { IObservableList } from "@jupyterlab/observables";
import { GatherModel } from "../model";
import { LabCell } from "../model/cell";

/**
 * Listens to cell executions and edits.
 */
export class CellChangeListener {

    private _gatherModel: GatherModel;

    constructor(gatherModel: GatherModel, notebookPanel: NotebookPanel) {
        this._gatherModel = gatherModel;
        this.registerCurrentCells(notebookPanel);
        notebookPanel.content.model.cells.changed.connect((_, change) => this.registerAddedCells(change), this);
    }

    private registerCurrentCells(notebookPanel: NotebookPanel) {
        for (let i = 0; i < notebookPanel.content.model.cells.length; i++) {
            this.registerCell(notebookPanel.content.model.cells.get(i));
        }
    }

    private registerCell(cell: ICellModel) {
        if (cell.type !== 'code') { return; }
        /**
         * A cell will be considered edited whenever any of its contents changed, including
         * execution count, metadata, outputs, text, etc.
         */
        cell.stateChanged.connect((changedCell, cellStateChange) => {
            if (cellStateChange.name === "executionCount" && cellStateChange.newValue !== undefined && cellStateChange.newValue !== null) {
                let labCell = new LabCell(changedCell as ICodeCellModel);
                labCell.lastExecutedText = labCell.text;
                this._gatherModel.lastExecutedCell = labCell;
            }
        });
        cell.contentChanged.connect((changedCell, _) => {
            if (changedCell instanceof CodeCellModel) {
                this._gatherModel.lastEditedCell = new LabCell(changedCell);
            }
        });
    }

    public registerAddedCells(cellListChange: IObservableList.IChangedArgs<ICellModel>): void {
        if (cellListChange.type === 'add' || cellListChange.type === 'remove') {
            const cellModel = cellListChange.newValues[0] as ICellModel;
            if (cellListChange.type === 'add') {
                this.registerCell(cellModel);            
            } else if (cellListChange.type === 'remove') {
                if (cellModel instanceof CodeCellModel) {
                    this._gatherModel.lastDeletedCell = new LabCell(cellModel);
                }
            }
        }
    }
}