import { GatherModel, IGatherObserver, GatherModelEvent, GatherEventData, GatherState } from "../packages/gather";
import { Widget, PanelLayout } from "@phosphor/widgets";
import { log } from "../utils/log";
import { ToolbarButton, ToolbarButtonComponent } from "@jupyterlab/apputils";
import { NotebookPanel } from "@jupyterlab/notebook";
import { CodeGatheringExtension } from ".";

/**
 * Class for highlighted buttons.
 */
const HIGHLIGHTED_BUTTON_CLASS = "jp-Toolbar-button-glow";

/**
 * Call this to add buttons to the toolbar for gathering functionality, after the default buttons
 * for Jupyter Lab have already been added.
 */
export function initToolbar(notebook: NotebookPanel, gatherModel: GatherModel,
    codeGatheringExtension: CodeGatheringExtension): Widget[] {

    function _getIndexAfterSpacer(notebook: NotebookPanel) {
        let index = 1;
        let toolNames = notebook.toolbar.names();
        let nextName = toolNames.next();
        while (nextName != undefined && nextName != "spacer") {
            index += 1;
            nextName = toolNames.next();
        }
        return index;
    }

    function _addGatherLabel(notebook: NotebookPanel, insertIndex: number) {
        let gatherLabelWidget = new Widget();
        let labelLayout = gatherLabelWidget.layout = new PanelLayout();
        let gatherLabel = new Widget({ node: document.createElement("span") });
        gatherLabel.addClass('jp-GatherLabel');
        gatherLabel.node.textContent = "Gather to";
        labelLayout.addWidget(gatherLabel);
        notebook.toolbar.insertItem(insertIndex, "gatherLabel", gatherLabelWidget);
        return gatherLabelWidget;
    }

    function _addSpacer(notebook: NotebookPanel, insertIndex: number) {
        let gatherSpacer = new Widget();
        gatherSpacer.addClass("jp-GatherSpacer");
        notebook.toolbar.insertItem(insertIndex, "gatherSpacer", gatherSpacer);
        return gatherSpacer;
    }

    let widgets = [];
    let insertIndex = _getIndexAfterSpacer(notebook);
    let label = _addGatherLabel(notebook, insertIndex);
    widgets.push(label);
    insertIndex += 1;

    let buttons = [
        new GatherToClipboardButton(gatherModel, codeGatheringExtension.gatherToClipboard.bind(codeGatheringExtension)),
        new GatherToNotebookButton(gatherModel, codeGatheringExtension.gatherToNotebook.bind(codeGatheringExtension)),
        new ClearButton(gatherModel)
    ];
    for (let button of buttons) {
        notebook.toolbar.insertItem(insertIndex, button.getName(), button);
        widgets.push(button);
        insertIndex += 1;
    }

    let spacer = _addSpacer(notebook, insertIndex)
    widgets.push(spacer);
    return widgets;
}

/**
 * Class for buttons that highlight on model change.
 */
export abstract class GatherButton extends ToolbarButton implements IGatherObserver {

    readonly BASE_CLASS_NAME = "jp-Toolbar-gatherbutton";
    readonly DISABLED_CLASS_NAME = "jp-Toolbar-gatherbutton-inactive";

    /**
     * Construct a gather button.
     */
    constructor(name: string, gatherModel: GatherModel, props?: ToolbarButtonComponent.IProps) {
        super(props);
        this._name = name;
        this._gatherModel = gatherModel;
        this._gatherModel.addObserver(this);
        this.addClass(this.BASE_CLASS_NAME);
        this._updateDisabled();
    }

    protected _updateDisabled() {
        if (this._gatherModel.selectedSlices.length > 0) {
            this.removeClass(this.DISABLED_CLASS_NAME);
            this.addClass(HIGHLIGHTED_BUTTON_CLASS);
        } else {
            this.addClass(this.DISABLED_CLASS_NAME);
            this.removeClass(HIGHLIGHTED_BUTTON_CLASS);
        }
    }

    /**
     * Listen for changes on the gather model.
     */
    onModelChange(event: GatherModelEvent, _: GatherEventData, __: GatherModel) {
        if (event == GatherModelEvent.SLICE_SELECTED || event == GatherModelEvent.SLICE_DESELECTED) {
            this._updateDisabled();
        }
    }

    getName() {
        return this._name;
    }
    
    protected _gatherModel: GatherModel;
    protected _widget: Widget;
    protected _name: string;
}

/**
 * A button to gather code to the clipboard.
 */
export class GatherToClipboardButton extends GatherButton {

    constructor(gatherModel: GatherModel, callback: () => void) {
        super("gatherToClipboard", gatherModel, {
            className: "jp-Toolbar-gathertoclipboardbutton", 
            iconClassName: "jp-CopyIcon jp-Icon jp-Icon-16",
            tooltip: "Gather code to clipboard",
            label: "Clipboard",
            onClick: () => { this.onClick() }
        });
        this._callback = callback;
    }

    onClick() {
        if (this._gatherModel.selectedSlices.length >= 1) {
            log("Button: Clicked gather to clipboard");
            this._callback();
        } else {
            log("Button: Clicked gather to clipboard without selections");
            window.alert("Before you gather, click on one of the blue variable names, or one of the outputs with a blue border.");
        }
    }

    private _callback: () => void;
}

/**
 * A button to gather code to a new notebook.
 */
export class GatherToNotebookButton extends GatherButton {

    constructor(gatherModel: GatherModel, callback: () => void) {
        super("gatherToNotebook", gatherModel, {
            className: "jp-Toolbar-gathertonotebookbutton", 
            iconClassName: "jp-BookIcon jp-Icon jp-Icon-16",
            tooltip: "Gather code to new notebook",
            label: "Notebook",
            onClick: () => { this.onClick() }
        });
        this._callback = callback;
    }

    onClick() {
        if (this._gatherModel.selectedSlices.length >= 1) {
            log("Button: Clicked gather to notebook");
            this._callback();
        } else {
            log("Button: Clicked gather to clipboard without selections");
            window.alert("Before you gather, click on one of the blue variable names, or one of the outputs with a blue border.");
        }
    }

    private _callback: () => void;
}

/**
 * A button to clear the gathering selections.
 */
export class ClearButton extends GatherButton {

    constructor(gatherModel: GatherModel) {
        super("clearGatheringSelections", gatherModel, {
            className: "jp-Toolbar-clearbutton", 
            iconClassName: "jp-CloseIcon jp-Icon jp-Icon-16",
            tooltip: "Clear selections",
            label: "Clear",
            onClick: () => { this.onClick() }
        });
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