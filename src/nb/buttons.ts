import { GatherModel, IGatherObserver, GatherModelEvent, GatherEventData, GatherState } from "../packages/gather";
import { Widget } from "@phosphor/widgets";
import { Action, Actions, Notebook } from "base/js/namespace";
import { log } from "../utils/log";
import { nbCellToJson } from "./NotebookCell";


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
 * Button for merging selected cells.
 */
export class MergeButton implements Button {
    /**
     * Properties of the merge action.
     */
    readonly CLASS_NAME = "jp-Toolbar-mergebutton";
    readonly label = "Merge";
    readonly actionName = "merge-cells";
    readonly action = {
        icon: 'fa-compress',
        help: 'Merge selected cells',
        help_index: 'merge-cells',
        handler: () => {
            let selectedCells = this._notebook.get_selected_cells();
            log("Button: Merging cells", {
                selectedCells: selectedCells.map((c) => nbCellToJson(c))
            });
            this._actions.call("jupyter-notebook:merge-cells");
        }
    };

    /**
     * Construct a merge button.
     */
    constructor(actions: Actions, notebook: Notebook) {
        this._actions = actions;
        this._notebook = notebook;
        setInterval(this.updateState.bind(this), 100);
    }

    updateState() {
        // Only enable this button if there is more than one selected...
        let selectedCells = this._notebook.get_selected_cells();
        this.disabled = (selectedCells.length <= 1);
    }

    set disabled(disabled: boolean) {
        this._disabled = disabled;
        if (this._node) {
            (this._node.node as HTMLButtonElement).disabled = this._disabled;
        }
    }

    /**
     * Set the node for this button. For now, has to be done after initialization, given how
     * Jupyter notebook initializes toolbars.
     */
    set node(node: Widget) {
        if (this._node != node) {
            this._node = node;
            this._node.addClass(this.CLASS_NAME);
            this.disabled = true;
        }
    }

    private _actions: Actions;
    private _disabled: boolean;
    private _notebook: Notebook;
    private _node: Widget;
}

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
    // readonly label = "Cells";
    readonly label = "Clipboard";
    readonly actionName = "gather-to-clipboard";
    readonly action = {
        icon: 'fa-clipboard',
        help: 'Gather code to clipboard',
        help_index: 'gather-to-clipboard',
        handler: () => { this.onClick() }
    }

    /**
     * Handle click action.
     */
    onClick() {
        if (this._gatherModel.selectedSlices.length >= 1) {
            log("Button: Clicked gather to clipboard with selections", {
                selectedDefs: this._gatherModel.selectedDefs,
                selectedOutputs: this._gatherModel.selectedOutputs });
            this._gatherModel.addChosenSlices(...this._gatherModel.selectedSlices.map((sel) => sel.slice));
            this._gatherModel.requestStateChange(GatherState.GATHER_TO_CLIPBOARD);
        } else {
            log("Button: Clicked gather to clipboard without selections");
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
            log("Button: Clicked gather to notebook with selections", {
                selectedDefs: this._gatherModel.selectedDefs,
                selectedOutputs: this._gatherModel.selectedOutputs });
            this._gatherModel.addChosenSlices(...this._gatherModel.selectedSlices.map((sel) => sel.slice));
            this._gatherModel.requestStateChange(GatherState.GATHER_TO_NOTEBOOK);
        } else {
            log("Button: Clicked gather to clipboard without selections");
            window.alert("To gather, you must first select some definitions or results from the notebook.");
        }
    }
}

/**
 * A button to gather and display versions of code.
 */
export class GatherHistoryButton extends GatherButton {
    /**
     * Properties for initializing the gather button.
     */
    readonly CLASS_NAME = "jp-Toolbar-gatherhistorybutton";
    readonly label = "Revisions";
    readonly actionName = "gather-history";
    readonly action = {
        icon: 'fa-history',
        help: 'Gather versions of this code',
        help_index: 'gather-history',
        handler: () => { this.onClick() }
    }

    /**
     * Handle click action.
     */
    onClick() {
        if (this._gatherModel.selectedSlices.length == 1) {
            log("Button: Clicked gather to history with a selection", {
                selectedDefs: this._gatherModel.selectedDefs,
                selectedOutputs: this._gatherModel.selectedOutputs });
            this._gatherModel.requestStateChange(GatherState.GATHER_HISTORY);
        } else if (this._gatherModel.selectedSlices.length == 0) {
            log("Button: Clicked gather to history without any selections");
            window.alert("To gather, you must first select some definitions or results from the notebook.");
        } else if (this._gatherModel.selectedSlices.length > 1) {
            log("Button: Clicked gather to history with too many selections");
            window.alert("To gather history, you can only select one variable or result.");
        }
    }

    /**
     * Listen for changes on the gather model.
     */
    onModelChange(event: GatherModelEvent, eventData: GatherEventData, model: GatherModel) {
        if (event == GatherModelEvent.SLICE_SELECTED || event == GatherModelEvent.SLICE_DESELECTED) {
            if (model.selectedSlices.length == 1) {
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
        log("Button: Clicked to clear selections", {
            selectedDefs: this._gatherModel.selectedDefs,
            selectedOutputs: this._gatherModel.selectedOutputs });
        this._gatherModel.requestStateChange(GatherState.RESET);
    }
}