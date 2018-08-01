import { IGatherObserver, GatherModel, GatherModelEvent, GatherEventData, GatherState } from ".";
import { ExecutionLogSlicer } from "../../slicing/ExecutionSlicer";
import { DefSelection, OutputSelection } from "./selections";
import { LocationSet } from "../../slicing/Slice";
import { ICellClipboard } from "./clipboard";
import { INotebookOpener } from "./opener";

/**
 * Controller for updating the gather model.
 */
export class GatherController implements IGatherObserver {
    /**
     * Constructor for gather controller.
     */
    constructor(model: GatherModel, executionSlicer: ExecutionLogSlicer, clipboard: ICellClipboard,
        opener: INotebookOpener) {
        model.addObserver(this);
        this._executionSlicer = executionSlicer;
        this._cellClipboard = clipboard;
        this._notebookOpener = opener;
    }

    /**
     * Handle change to the gather model.
     */
    onModelChange(eventType: GatherModelEvent, eventData: GatherEventData, model: GatherModel) {
        
        // If a gather action was requested, do the gather.
        if (eventType == GatherModelEvent.STATE_CHANGED) {
            let newState = eventData as GatherState;
            if (newState == GatherState.GATHER_TO_CLIPBOARD || newState == GatherState.GATHER_TO_NOTEBOOK) {
                let slices = model.selectedSlices.map((s) => s.slice);
                let mergedSlice = slices[0].merge(...slices.slice(1));
                if (newState == GatherState.GATHER_TO_CLIPBOARD) {
                    this._cellClipboard.copy(mergedSlice);
                    model.requestStateChange(GatherState.RESET);
                } else if (newState == GatherState.GATHER_TO_NOTEBOOK) {
                    this._notebookOpener.openNotebookForSlice(mergedSlice);
                    model.requestStateChange(GatherState.SELECTING);
                }
            } else if (newState == GatherState.GATHER_HISTORY) {
                // TODO: compute a new historical slice.
            } else if (newState == GatherState.RESET) {
                // When a reset is selected, clear selections and transition to selection mode.
                model.deselectAllDefs();
                model.deselectAllOutputs();
                model.requestStateChange(GatherState.SELECTING);
            }
        }

        // If def is selected, select its slice too.
        if (eventType == GatherModelEvent.DEF_SELECTED) {
            let defSelection = eventData as DefSelection;
            let sliceSeeds = new LocationSet(defSelection.editorDef.def.location);
            let slices = this._executionSlicer.sliceAllExecutions(defSelection.cell, sliceSeeds);
            let sliceSelection = { userSelection: defSelection, slice: slices[slices.length - 1] };
            model.selectSlice(sliceSelection);
            model.addSelectedDefSlices(defSelection, ...slices);
        }

        // If a def is deselected, deselect its slice too.
        if (eventType == GatherModelEvent.DEF_DESELECTED) {
            let defSelection = eventData as DefSelection;
            for (let sliceSelection of model.selectedSlices) {
                if (sliceSelection.userSelection == defSelection) {
                    model.deselectSlice(sliceSelection);
                }
            }
            model.removeSelectedDefSlices(defSelection);
        }

        // If output is selected, select the code that produced it too.
        if (eventType == GatherModelEvent.OUTPUT_SELECTED) {
            let outputSelection = eventData as OutputSelection;
            let cell = outputSelection.cell;
            let slices = this._executionSlicer.sliceAllExecutions(cell);
            let sliceSelection = { userSelection: outputSelection, slice: slices[slices.length - 1] }
            model.selectSlice(sliceSelection);
            model.addSelectedOutputSlices(outputSelection, ...slices);
        }

        // If an output is deselected, deselect its slice too.
        if (eventType == GatherModelEvent.OUTPUT_DESELECTED) {
            let outputSelection = eventData as OutputSelection;
            for (let sliceSelection of model.selectedSlices) {
                if (sliceSelection.userSelection == outputSelection) {
                    model.deselectSlice(sliceSelection);
                }
            }
            model.removeSelectedOutputSlices(outputSelection);
        }
    }

    private _executionSlicer: ExecutionLogSlicer;
    private _cellClipboard: ICellClipboard;
    private _notebookOpener: INotebookOpener;
}