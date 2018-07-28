import { GatherModel, IGatherObserver, GatherModelEvent, GatherEventData, GatherState } from "../packages/gather";
import { Widget } from "@phosphor/widgets";
import { Action } from "base/js/namespace";


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
 * Class for buttons that highlight on model change.
 */
abstract class GatherButton implements Button, IGatherObserver {

    readonly BASE_CLASS_NAME = "jp-Toolbar-gatherbutton";
    abstract readonly CLASS_NAME: string;
    abstract readonly label?: string;
    abstract readonly actionName: string;
    abstract readonly action: Action;

    /**
     * Construct a gather button.
     */
    constructor(gatherModel: GatherModel) {
        this._gatherModel = gatherModel;
        this._gatherModel.addObserver(this);
    }

    /**
     * Set the node for this button. For now, has to be done after initialization, given how
     * Jupyter notebook initializes toolbars.
     */
    set node(node: Widget) {
        if (this._node != node) {
            this._node = node;
            this._node.addClass(this.BASE_CLASS_NAME);
            this._node.addClass(this.CLASS_NAME);
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
    
    protected _gatherModel: GatherModel;
    protected _node: Widget;
}

/**
 * A button to gather code to the clipboard.
 */
export class GatherToClipboardButton extends GatherButton {
    /**
     * Properties for initializing the gather button.
     */
    readonly CLASS_NAME = "jp-Toolbar-gathertoclipboardbutton";
    readonly label = "Cells";
    readonly actionName = "gather-to-clipboard";
    readonly action = {
        icon: 'fa-clone',
        help: 'Gather code to clipboard',
        help_index: 'gather-to-clipboard',
        handler: () => { this.onClick() }
    }

    /**
     * Handle click action.
     */
    onClick() {
        if (this._gatherModel.selectedSlices.length >= 1) {
            this._gatherModel.requestStateChange(GatherState.GATHER_TO_CLIPBOARD);
        } else {
            window.alert("To gather, you must first select some definitions or results from the notebook.");
        }
    }
}

/**
 * A button to gather code to the clipboard.
 */
export class GatherToNotebookButton extends GatherButton {
    /**
     * Properties for initializing the gather button.
     */
    readonly CLASS_NAME = "jp-Toolbar-gathertonotebookbutton";
    readonly label = "Notebook";
    readonly actionName = "gather-to-notebook";
    readonly action = {
        icon: 'fa-book',
        help: 'Gather code to new notebook',
        help_index: 'gather-to-notebook',
        handler: () => { this.onClick() }
    }

    /**
     * Handle click action.
     */
    onClick() {
        if (this._gatherModel.selectedSlices.length >= 1) {
            this._gatherModel.requestStateChange(GatherState.GATHER_TO_NOTEBOOK);
        } else {
            window.alert("To gather, you must first select some definitions or results from the notebook.");
        }
    }
}

/**
 * A button to clear the gathering selections.
 */
export class ClearButton extends GatherButton {
    /**
     * Properties for initializing the clear button.
     */
    readonly CLASS_NAME = "jp-Toolbar-clearbutton";
    readonly label = "Clear";
    readonly actionName = "clear-selections";
    readonly action = {
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
        this._gatherModel.deselectAllOutputs();
    }
}