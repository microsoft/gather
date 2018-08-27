import { DefSelection, SliceSelection, EditorDef, OutputSelection, CellOutput } from "./selections";
import { ICell } from "../cell";
import { log } from "../../utils/log";
import { SlicedExecution } from "../../slicing/ExecutionSlicer";

/**
 * Available states for the gathering application.
 */
export enum GatherState {
    RESET,
    SELECTING,
    GATHER_TO_CLIPBOARD,
    GATHER_TO_NOTEBOOK,
    GATHER_HISTORY
};

/**
 * Properties on the gather model.
 */
export enum GatherModelEvent {
    STATE_CHANGED,
    CELL_EXECUTED,
    CELL_DELETED,
    CELL_EDITED,
    EDITOR_DEF_FOUND,
    EDITOR_DEF_REMOVED,
    DEF_SELECTED,
    DEF_DESELECTED,
    OUTPUT_FOUND,
    OUTPUT_REMOVED,
    OUTPUT_SELECTED,
    OUTPUT_DESELECTED,
    SLICE_SELECTED,
    SLICE_DESELECTED,
};

/**
 * Types of data that can be passed with model events.
 */
export type GatherEventData =
    GatherState |
    ICell |
    EditorDef |
    DefSelection |
    CellOutput |
    OutputSelection |
    SliceSelection
    ;

/**
 * Model for the state of a "gather" application.
 */
export class GatherModel {
    /**
     * Add an observer to listen to changes to the model.
     */
    addObserver(observer: IGatherObserver) {
        this._observers.push(observer);
    }

    /**
     * Notify observers that the model has changed.
     */
    notifyObservers(property: GatherModelEvent, eventData?: GatherEventData) {
        for (let observer of this._observers) {
            observer.onModelChange(property, eventData, this);
        }
    }

    /**
     * Get the state of the model.
     */
    get state(): GatherState {
        return this._state;
    }

    /**
     * Set the state of the gather model.
     */
    requestStateChange(state: GatherState) {
        if (this._state != state) {
            this._state = state;
            log("Model state change", { newState: state });
            this.notifyObservers(GatherModelEvent.STATE_CHANGED, state);
        }
    }

    /**
     * Get the last cell that was executed.
     */
    get lastExecutedCell(): ICell {
        return this._lastExecutedCell;
    }

    /**
     * Set the last executed cell.
     */
    set lastExecutedCell(cell: ICell) {
        this._lastExecutedCell = cell;
        this.notifyObservers(GatherModelEvent.CELL_EXECUTED, cell);
    }

    /**
     * Get the last cell that was deleted.
     */
    get lastDeletedCell(): ICell {
        return this._lastDeletedCell;
    }

    /**
     * Set the last deleted cell.
     */
    set lastDeletedCell(cell: ICell) {
        this._lastDeletedCell = cell;
        this.notifyObservers(GatherModelEvent.CELL_DELETED, cell);
    }

    /**
     * Get the last cell that was edited.
     */
    get lastEditedCell(): ICell {
        return this._lastEditedCell;
    }

    /**
     * Set the last edited cell.
     */
    set lastEditedCell(cell: ICell) {
        this._lastEditedCell = cell;
        this.notifyObservers(GatherModelEvent.CELL_EDITED, cell);
    }

    /**
     * Add editor def to the list of editor definitions discoverd.
     */
    addEditorDef(def: EditorDef) {
        this._editorDefs.push(def);
        this.notifyObservers(GatherModelEvent.EDITOR_DEF_FOUND, def);
    }

    /**
     * Remove the editor def from the list of editor definitions.
     */
    removeEditorDefsForCell(cellId: string) {
        for (let i = this._editorDefs.length - 1; i >= 0; i--) {
            let editorDef = this._editorDefs[i];
            if (editorDef.cell.id == cellId) {
                this._editorDefs.splice(i, 1);
                this.notifyObservers(GatherModelEvent.EDITOR_DEF_REMOVED, editorDef);
            }
        }
    }

    /**
     * Get the list of detected definitions in editors.
     */
    get editorDefs(): ReadonlyArray<EditorDef> {
        return this._editorDefs;
    }

    /**
     * Clear all editor defs.
     */
    clearEditorDefs() {
        for (let i = this._editorDefs.length - 1; i >= 0; i--) {
            let editorDef = this._editorDefs[i];
            this._editorDefs.splice(i, 1);
            this.notifyObservers(GatherModelEvent.EDITOR_DEF_REMOVED, editorDef);
        }
    }

    /**
     * Add output to the list of outputs discovered.
     */
    addOutput(output: CellOutput) {
        this._outputs.push(output);
        this.notifyObservers(GatherModelEvent.OUTPUT_FOUND, output);
    }

    /**
     * Get the list of detected outputs.
     */
    get outputs(): ReadonlyArray<CellOutput> {
        return this._outputs;
    }

    /**
     * Clear all outputs.
     */
    clearOutputs() {
        for (let i = this._outputs.length - 1; i >= 0; i--) {
            let output = this._outputs[i];
            this._outputs.splice(i, 1);
            this.notifyObservers(GatherModelEvent.OUTPUT_REMOVED, output);
        }
    }

    /**
     * Add a slice to the list of selected slices.
     */
    selectSlice(slice: SliceSelection) {
        this._sliceSelections.push(slice);
        this.notifyObservers(GatherModelEvent.SLICE_SELECTED, slice);
    }

    /**
     * Remove a slice from the list of selected slices.
     */
    deselectSlice(slice: SliceSelection) {
        for (let i = 0; i < this._sliceSelections.length; i++) {
            if (this._sliceSelections[i] == slice) {
                this._sliceSelections.splice(i, 1);
                this.notifyObservers(GatherModelEvent.SLICE_DESELECTED, slice);
                return;
            }
        }
    }

    /**
     * Get the list of currently-selected defs.
     */
    get selectedDefs(): ReadonlyArray<DefSelection> {
        return this._selectedDefs;
    }

    /**
     * Add a def to the list of selected def.
     */
    selectDef(def: DefSelection) {
        this._selectedDefs.push(def);
        log("Definition selected", { numSelected: this._selectedDefs.length });
        this.notifyObservers(GatherModelEvent.DEF_SELECTED, def);
    }

    /**
     * Remove a def from the list of selected defs.
     */
    deselectDef(def: DefSelection) {
        for (let i = 0; i < this._selectedDefs.length; i++) {
            if (this._selectedDefs[i] == def) {
                this._selectedDefs.splice(i, 1);
                log("Definition deselected", { numSelected: this._selectedDefs.length });
                this.notifyObservers(GatherModelEvent.DEF_DESELECTED, def);
                return;
            }
        }
    }

    /**
     * Deselect all defs.
     */
    deselectAllDefs() {
        for (let i = this._selectedDefs.length - 1; i >= 0; i--) {
            let def = this._selectedDefs.splice(i, 1)[0];
            this.notifyObservers(GatherModelEvent.DEF_DESELECTED, def);
        }
    }

    /**
     * Whether this def is currently selected.
     */
    isDefSelected(def: DefSelection) {
        for (let i = 0; i < this._selectedDefs.length; i++) {
            if (this._selectedDefs[i] == def) {
                return true;
            }
        }
        return false;
    }

    /**
     * Store all execution slices for a def selection
     */
    addSelectedDefSlices(defSelection: DefSelection, ...slices: SlicedExecution[]) {
        this._selectedDefSlices.push([defSelection, slices]);
    }

    /**
     * Get the first-added list of slices for this selected def.
     */
    getSelectedDefSlices(defSelection: DefSelection): SlicedExecution[] {
        for (let selectedDefSlices of this._selectedDefSlices) {
            if (selectedDefSlices[0] == defSelection) {
                return selectedDefSlices[1];
            }
        }
        return null;
    }

    /**
     * Remove all slices for a def selection from the model.
     */
    removeSelectedDefSlices(defSelection: DefSelection) {
        for (let i = this._selectedDefSlices.length - 1; i >= 0; i--) {
            if (this._selectedDefSlices[i][0] == defSelection) {
                this._selectedDefSlices.splice(i, 1);
            }
        }
    }

    /**
     * Get the list of currently-selected outputs.
     */
    get selectedOutputs(): ReadonlyArray<OutputSelection> {
        return this._selectedOutputs;
    }

    /**
     * Add an output to the list of selected outputs.
     */
    selectOutput(output: OutputSelection) {
        this._selectedOutputs.push(output);
        log("Output selected", { numSelected: this._selectedOutputs.length });
        this.notifyObservers(GatherModelEvent.OUTPUT_SELECTED, output);
    }

    /**
     * Remove an output from the list of selected outputs.
     */
    deselectOutput(output: OutputSelection) {
        for (let i = 0; i < this._selectedOutputs.length; i++) {
            if (this._selectedOutputs[i] == output) {
                this._selectedOutputs.splice(i, 1);
                log("Output deselected", { numSelected: this._selectedOutputs.length });
                this.notifyObservers(GatherModelEvent.OUTPUT_DESELECTED, output);
                return;
            }
        }
    }

    /**
     * Deselect all outputs.
     */
    deselectOutputsForCell(cellId: string) {
        for (let i = this._selectedOutputs.length - 1; i >= 0; i--) {
            let output = this._selectedOutputs[i];
            if (output.cell.id == cellId) {
                this._selectedOutputs.splice(i, 1);
                this.notifyObservers(GatherModelEvent.OUTPUT_DESELECTED, output);
            }
        }
    }

    /**
     * Deselect all outputs.
     */
    deselectAllOutputs() {
        for (let i = this._selectedOutputs.length - 1; i >= 0; i--) {
            let output = this._selectedOutputs.splice(i, 1)[0];
            this.notifyObservers(GatherModelEvent.OUTPUT_DESELECTED, output);
        }
    }

    /**
     * Deselect all defs and outputs.
     */
    deselectAll() {
        this.deselectAllDefs();
        this.deselectAllOutputs();
    }

    /**
     * Store all execution slices for an output selection
     */
    addSelectedOutputSlices(outputSelection: OutputSelection, ...slices: SlicedExecution[]) {
        this._selectedOutputSlices.push([outputSelection, slices]);
    }

    /**
     * Get the first-added list of slices for this selected output.
     */
    getSelectedOutputSlices(outputSelection: OutputSelection): SlicedExecution[] {
        for (let selectedOutputSlices of this._selectedOutputSlices) {
            if (selectedOutputSlices[0] == outputSelection) {
                return selectedOutputSlices[1];
            }
        }
        return null;
    }

    /**
     * Remove all slices for an output selection from the model.
     */
    removeSelectedOutputSlices(outputSelection: OutputSelection) {
        for (let i = this._selectedOutputSlices.length - 1; i >= 0; i--) {
            if (this._selectedOutputSlices[i][0] == outputSelection) {
                this._selectedOutputSlices.splice(i, 1);
            }
        }
    }

    /**
     * Get a list of currently highlighted slices (readonly).
     */
    get selectedSlices(): ReadonlyArray<SliceSelection> {
        return this._sliceSelections;
    }

    /**
     * Add slices that have been chosen for gathering.
     */
    addChosenSlices(...slices: SlicedExecution[]) {
        this._chosenSlices.push(...slices);
    }

    /**
     * Remove all slices that were chosen for gathering.
     */
    resetChosenSlices() {
        this._chosenSlices = [];
    }
    
    /**
     * Get a list of slices chosen for gathering.
     */
    get chosenSlices(): ReadonlyArray<SlicedExecution> {
        return this._chosenSlices;
    }

    private _state: GatherState = GatherState.SELECTING;
    private _observers: IGatherObserver[] = [];
    private _lastExecutedCell: ICell;
    private _lastDeletedCell: ICell;
    private _lastEditedCell: ICell;
    private _editorDefs: EditorDef[] = [];
    private _selectedDefs: DefSelection[] = [];
    private _outputs: CellOutput[] = [];
    private _selectedOutputs: OutputSelection[] = [];
    private _sliceSelections: SliceSelection[] = [];
    private _selectedDefSlices: [DefSelection, SlicedExecution[]][] = [];
    private _selectedOutputSlices: [OutputSelection, SlicedExecution[]][] = [];
    private _chosenSlices: SlicedExecution[] = [];
}

/**
 * Observer of changes to the gather model.
 */
export interface IGatherObserver {
    /**
     * Callback that gets triggered whenever the model changes.
     */
    onModelChange: (property: GatherModelEvent, eventData: GatherEventData, model?: GatherModel) => void;
}