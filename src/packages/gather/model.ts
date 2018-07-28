import { DefSelection, SliceSelection, EditorDef, OutputSelection } from "./selections";
import { ICell } from "../cell";

/**
 * Available states for the gathering application.
 */
export enum GatherState {
    SELECTING,
    GATHER_TO_CLIPBOARD,
    GATHER_TO_NOTEBOOK
};

/**
 * Properties on the gather model.
 */
export enum GatherModelEvent {
    STATE_CHANGED,
    CELL_EXECUTED,
    EDITOR_DEF_FOUND,
    DEF_SELECTED,
    DEF_DESELECTED,
    OUTPUT_SELECTED,
    OUTPUT_DESELECTED,
    SLICE_SELECTED,
    SLICE_DESELECTED
};

/**
 * Types of data that can be passed with model events.
 */
export type GatherEventData =
    GatherState |
    ICell |
    EditorDef |
    DefSelection |
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
     * Add editor def to the list of editor definitions discoverd.
     */
    addEditorDef(def: EditorDef) {
        this._editorDefs.push(def);
        this.notifyObservers(GatherModelEvent.EDITOR_DEF_FOUND, def);
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
     * Add a def to the list of selected def.
     */
    selectDef(def: DefSelection) {
        this._selectedDefs.push(def);
        this.notifyObservers(GatherModelEvent.DEF_SELECTED, def);
    }

    /**
     * Remove a def from the list of selected defs.
     */
    deselectDef(def: DefSelection) {
        for (let i = 0; i < this._selectedDefs.length; i++) {
            if (this._selectedDefs[i] == def) {
                this._selectedDefs.splice(i, 1);
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
     * Add an output to the list of selected outputs.
     */
    selectOutput(output: OutputSelection) {
        this._selectedOutputs.push(output);
        this.notifyObservers(GatherModelEvent.OUTPUT_SELECTED, output);
    }

    /**
     * Remove an output from the list of selected outputs.
     */
    deselectOutput(output: OutputSelection) {
        for (let i = 0; i < this._selectedOutputs.length; i++) {
            if (this._selectedOutputs[i] == output) {
                this._selectedOutputs.splice(i, 1);
                this.notifyObservers(GatherModelEvent.OUTPUT_DESELECTED, output);
                return;
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
     * Get a list of currently selected slices (readonly).
     */
    get selectedSlices(): ReadonlyArray<SliceSelection> {
        return this._sliceSelections;
    }

    private _state: GatherState = GatherState.SELECTING;
    private _observers: IGatherObserver[] = [];
    private _lastExecutedCell: ICell;
    private _editorDefs: EditorDef[] = [];
    private _selectedDefs: DefSelection[] = [];
    private _selectedOutputs: OutputSelection[] = [];
    private _sliceSelections: SliceSelection[] = [];
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