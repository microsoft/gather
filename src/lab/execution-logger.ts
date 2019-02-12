import { GatherModel } from "../packages/gather";
import { IObservableList } from "@jupyterlab/observables";
import { ICellModel, CodeCellModel } from "@jupyterlab/cells";
import { LabCell, copyICodeCellModel } from "./LabCell";
import { NotebookPanel } from "@jupyterlab/notebook";

export class ExecutionLogger {

    constructor(notebook: NotebookPanel, gatherModel: GatherModel) {
        this._gatherModel = gatherModel;
        let existingCells = notebook.content.model.cells;
        for (let i = 0; i < existingCells.length; i++) {
            this._listenForCellExecution(existingCells.get(i));
        }
        this._listenToFutureAddedCells(notebook);
    }

    _listenForCellExecution(cellModel: ICellModel) {
        // When a cell is added, register for its state changes.
        if (cellModel.type !== 'code') { return; }
        cellModel.stateChanged.connect((changedCell, cellStateChange) => {
            if (changedCell instanceof CodeCellModel && cellStateChange.name === "executionCount" && cellStateChange.newValue !== undefined && cellStateChange.newValue !== null) {
                let cellClone = copyICodeCellModel(changedCell);
                const cell = new LabCell(cellClone);
                this._gatherModel.executionLog.logExecution(cell);
                this._gatherModel.lastExecutedCell = cell;
            }
        });
    }

    _listenToFutureAddedCells(notebook: NotebookPanel) {
        notebook.content.model.cells.changed.connect(
            (_, change) => this._onCellsChanged(change));
    }

    _onCellsChanged(cellListChange: IObservableList.IChangedArgs<ICellModel>): void {
        if (cellListChange.type === 'add') {
            const cellModel = cellListChange.newValues[0] as ICellModel;
            this._listenForCellExecution(cellModel);
        }
    }

    private _gatherModel: GatherModel;
}