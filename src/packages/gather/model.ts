import { DefSelection, SliceSelection, EditorDef } from "./selections";
import { ICell } from "../cell";

/**
 * Available states for the gathering application.
 */
export enum GatherState {
    IDLE,
    GATHERING
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
    set state(state: GatherState) {
        this._state = state;
        this.notifyObservers(GatherModelEvent.STATE_CHANGED);
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
     * Remove a slice from the list of selected slices.
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
     * Get a list of currently selected slices (readonly).
     */
    get selectedSlices(): ReadonlyArray<SliceSelection> {
        return this._sliceSelections;
    }

    private _state: GatherState = GatherState.IDLE;
    private _observers: IGatherObserver[] = [];
    private _lastExecutedCell: ICell;
    private _editorDefs: EditorDef[] = [];
    private _selectedDefs: DefSelection[] = [];
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