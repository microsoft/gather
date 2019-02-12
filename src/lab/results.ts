import { MarkerManager } from "../packages/cell";
import { GatherModel } from "../packages/gather";
import { NotebookPanel, Notebook } from "@jupyterlab/notebook";
import { IClientSession } from "@jupyterlab/apputils";
import { IObservableList } from "@jupyterlab/observables";
import { ICellModel, CodeCellModel } from "@jupyterlab/cells";
import { LabCell } from "./LabCell";

/**
 * Highlights gatherable entities.
 */
export class ResultsHighlighter {

    private _markerManager: MarkerManager;
    private _gatherModel: GatherModel;

    constructor(gatherModel: GatherModel, panel: NotebookPanel, markerManager: MarkerManager) {
        this._markerManager = markerManager;
        this._gatherModel = gatherModel;

        panel.content.model.cells.changed.connect(
            (cells, value) =>
                this.onCellsChanged(panel.content, panel.session, cells, value),
            this);

        document.body.addEventListener("mouseup", (event: MouseEvent) => {
            this._markerManager.handleClick(event);
        });
    }

    public onCellsChanged(
        notebook: Notebook,
        _: IClientSession,
        __: IObservableList<ICellModel>,
        cellListChange: IObservableList.IChangedArgs<ICellModel>
    ): void {
        if (cellListChange.type === 'add') {
            const cellModel = cellListChange.newValues[0] as ICellModel;
            if (cellModel.type !== 'code') { return; }

            // When a cell is added, register for its state changes.
            cellModel.contentChanged.connect((changedCell, args) => {
                // TODO(andrewhead): check that this change is due to a user's text edit in the cell.
                if (changedCell instanceof CodeCellModel) {
                    this._gatherModel.lastEditedCell = new LabCell(changedCell);
                }
            });
        }
        if (cellListChange.type === 'remove') {
            const cellModel = cellListChange.newValues[0] as ICellModel;
            if (cellModel instanceof CodeCellModel) {
                this._gatherModel.lastDeletedCell = new LabCell(cellModel);
            }
        }
    }
}