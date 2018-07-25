import { IGatherObserver, GatherModel, GatherModelEvent, GatherEventData } from ".";
import { ExecutionLogSlicer } from "../../slicing/ExecutionSlicer";
import { DefSelection } from "./selections";
import { LocationSet } from "../../slicing/Slice";

/**
 * Controller for updating the gather model.
 */
export class GatherController implements IGatherObserver {
    /**
     * Constructor for gather controller.
     */
    constructor(model: GatherModel, executionSlicer: ExecutionLogSlicer) {
        model.addObserver(this);
        this._executionSlicer = executionSlicer;
    }

    /**
     * Handle change to the gather model.
     */
    onModelChange(eventType: GatherModelEvent, eventData: GatherEventData, model: GatherModel) {
        
        // If def is selected, select its slice too.
        if (eventType == GatherModelEvent.DEF_SELECTED) {
            let defSelection = eventData as DefSelection;
            let sliceSeeds = new LocationSet(defSelection.editorDef.def.location);
            let slice = this._executionSlicer.sliceLatestExecution(defSelection.cell, sliceSeeds);
            let sliceSelection = { defSelection: defSelection, slice: slice }
            model.selectSlice(sliceSelection);
        }

        // If a def is deselected, deselect its slice too.
        if (eventType == GatherModelEvent.DEF_DESELECTED) {
            let defSelection = eventData as DefSelection;
            for (let sliceSelection of model.selectedSlices) {
                if (sliceSelection.defSelection == defSelection) {
                    model.deselectSlice(sliceSelection);
                }
            }
        }
    }

    private _executionSlicer: ExecutionLogSlicer;
}