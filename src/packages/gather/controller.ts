import { IGatherObserver, GatherModel, GatherModelEvent, GatherEventData, GatherState } from ".";
import { ExecutionLogSlicer } from "../../slicing/ExecutionSlicer";
import { DefSelection, OutputSelection } from "./selections";
import { LocationSet } from "../../slicing/Slice";
import { ICellClipboard } from "./clipboard";

/**
 * Controller for updating the gather model.
 */
export class GatherController implements IGatherObserver {
    /**
     * Constructor for gather controller.
     */
    constructor(model: GatherModel, executionSlicer: ExecutionLogSlicer, clipboard: ICellClipboard) {
        model.addObserver(this);
        this._executionSlicer = executionSlicer;
        this._cellClipboard = clipboard;
    }

    /**
     * Handle change to the gather model.
     */
    onModelChange(eventType: GatherModelEvent, eventData: GatherEventData, model: GatherModel) {
        
        // If a gather action was requested, do the gather.
        if (eventType == GatherModelEvent.STATE_CHANGED) {
            let newState = eventData as GatherState;
            if (newState == GatherState.GATHER) {
                let slices = model.selectedSlices.map((s) => s.slice);
                let mergedSlice = slices[0].merge(...slices.slice(1));
                this._cellClipboard.copy(mergedSlice);
                model.deselectAllDefs();
                model.requestStateChange(GatherState.SELECTING);
            }
        }

        // If def is selected, select its slice too.
        if (eventType == GatherModelEvent.DEF_SELECTED) {
            let defSelection = eventData as DefSelection;
            let sliceSeeds = new LocationSet(defSelection.editorDef.def.location);
            let slice = this._executionSlicer.sliceLatestExecution(defSelection.cell, sliceSeeds);
            let sliceSelection = { userSelection: defSelection, slice: slice }
            model.selectSlice(sliceSelection);
        }

        // If a def is deselected, deselect its slice too.
        if (eventType == GatherModelEvent.DEF_DESELECTED) {
            let defSelection = eventData as DefSelection;
            for (let sliceSelection of model.selectedSlices) {
                if (sliceSelection.userSelection == defSelection) {
                    model.deselectSlice(sliceSelection);
                }
            }
        }

        // If output is selected, select the code that produced it too.
        if (eventType == GatherModelEvent.OUTPUT_SELECTED) {
            let outputSelection = eventData as OutputSelection;
            let cell = outputSelection.cell;
            let fullCellBounds = {
                first_line: 1,
                first_column: 0,
                last_line: cell.text.split("\n").length,
                last_column: cell.text.split("\n").pop().length
            }
            let sliceSeeds = new LocationSet(fullCellBounds);
            let slice = this._executionSlicer.sliceLatestExecution(cell, sliceSeeds);
            let sliceSelection = { userSelection: outputSelection, slice: slice }
            model.selectSlice(sliceSelection);
        }

        // If an output is deselected, deselect its slice too.
        if (eventType == GatherModelEvent.OUTPUT_DESELECTED) {
            let outputSelection = eventData as OutputSelection;
            for (let sliceSelection of model.selectedSlices) {
                if (sliceSelection.userSelection == outputSelection) {
                    model.deselectSlice(sliceSelection);
                }
            }
        }
    }

    private _executionSlicer: ExecutionLogSlicer;
    private _cellClipboard: ICellClipboard;
}