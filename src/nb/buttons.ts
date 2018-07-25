import { GatherModel, IGatherObserver, GatherModelEvent, GatherEventData, GatherState } from "../packages/gather";
import { Widget } from "@phosphor/widgets";
import { Action } from "base/js/namespace";

/**
 * Class for the gather button.
 */
const GATHER_BUTTON_CLASS = "jp-Toolbar-gatherbutton";

/**
 * Class for the clear  button.
 */
const CLEAR_BUTTON_CLASS = "jp-Toolbar-clearbutton";


/**
 * Button to add to the Jupyter notebook toolbar.
 */
interface Button {
    label?: string;
    actionName: string;
    action: Action;
}

/**
 * Class for highlighted buttons.
 */
const HIGHLIGHTED_BUTTON_CLASS = "jp-Toolbar-button-glow";

/**
 * A button to gather code to the clipboard.
 */
export class GatherButton implements Button, IGatherObserver {

    /**
     * Construct a gather button.
     */
    constructor(gatherModel: GatherModel) {
        this._gatherModel = gatherModel;
        this._gatherModel.addObserver(this);
    }

    /**
     * Properties for initializing the gather button.
     */
    readonly label: string = "Gather";
    readonly actionName: string = "gather-code";
    readonly action: Action = {
        icon: 'fa-level-up',
        help: 'Gather code to clipboard',
        help_index: 'gather-code',
        handler: () => { this.onClick() }
    }

    /**
     * Handle click action.
     */
    onClick() {
        this._gatherModel.requestStateChange(GatherState.GATHER);
    }

    /**
     * Set the node for this button. For now, has to be done after initialization, given how
     * Jupyter notebook initializes toolbars.
     */
    set node(node: Widget) {
        if (this._node != node) {
            this._node = node;
            this._node.addClass(GATHER_BUTTON_CLASS);
        }
    }

    /**
     * Listen for changes on the gather model.
     */
    onModelChange(event: GatherModelEvent, eventData: GatherEventData, model: GatherModel) {
        if (event == GatherModelEvent.SLICE_SELECTED || event == GatherModelEvent.SLICE_DESELECTED) {
            if (model.selectedSlices.length > 0) {
                if (this._node) {
                    this._node.addClass(HIGHLIGHTED_BUTTON_CLASS);
                }
            } else {
                if (this._node) {
                    this._node.removeClass(HIGHLIGHTED_BUTTON_CLASS);
                }
            }
        }
    }

    private _gatherModel: GatherModel;
    private _node: Widget;
}

/**
 * A button to clear the gathering selections.
 */
export class ClearButton implements Button {
    /**
     * Construct a gather button.
     */
    constructor(gatherModel: GatherModel) {
        this._gatherModel = gatherModel;
        this._gatherModel.addObserver(this);
    }

    /**
     * Properties for initializing the clear button.
     */
    readonly label: string = "Clear";
    readonly actionName: string = "clear-selections";
    readonly action: Action = {
        icon: 'fa-remove',
        help: 'Clear gather selections',
        help_index: 'clear-selections',
        handler: () => { this.onClick(); }
    }
    
    /**
     * Handle click event
     */
    onClick() {
        this._gatherModel.deselectAllDefs();
    }

    /**
     * Set the node for this button. For now, has to be done after initialization, given how
     * Jupyter notebook initializes toolbars.
     */
    set node(node: Widget) {
        if (this._node != node) {
            this._node = node;
            this._node.addClass(CLEAR_BUTTON_CLASS);
        }
    }

    /**
     * Listen for changes on the gather model.
     */
    onModelChange(event: GatherModelEvent, eventData: GatherEventData, model: GatherModel) {
        if (event == GatherModelEvent.SLICE_SELECTED || event == GatherModelEvent.SLICE_DESELECTED) {
            if (model.selectedSlices.length > 0) {
                if (this._node) {
                    this._node.addClass(HIGHLIGHTED_BUTTON_CLASS);
                }
            } else {
                if (this._node) {
                    this._node.removeClass(HIGHLIGHTED_BUTTON_CLASS);
                }
            }
        }
    }

    private _gatherModel: GatherModel;
    private _node: Widget;
}