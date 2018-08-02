import { Widget, PanelLayout } from "@phosphor/widgets";
import { IGatherObserver, GatherModel, GatherModelEvent, GatherEventData, GatherState } from "../packages/gather";
import { buildHistoryModel, HistoryViewer } from "../packages/history";
import { IOutputRenderer } from "../packages/revision";
import { OutputArea } from "base/js/namespace";


/**
 * Class for the revision browser widget.
 */
const REVISION_BROWSER_CLASS = "jp-Notebook-revisionbrowser";

/**
 * Class for output areas in the revision browser.
 */
const REVISION_OUTPUT_CLASS = "jp-Notebook-revisionbrowser-output";


/**
 * Renders output models for notebooks as new cells.
 */
class OutputRenderer implements IOutputRenderer<OutputArea> {
    /**
     * Render HTML element for this output.
     */
    render(output: OutputArea): HTMLElement {
        let clone = $(output.element[0].cloneNode(true));
        // Remove output prompts to make it more pretty.
        clone.find("div.prompt").remove();
        clone.find("div.run_this_cell").remove();
        clone.addClass(REVISION_OUTPUT_CLASS);
        return clone[0] as HTMLElement;
    }
}

/**
 * Window that lets the user browse revisions of code.
 */
export class RevisionBrowser extends Widget implements IGatherObserver {
    /**
     * Construct a new revision browser.
     */
    constructor(gatherModel: GatherModel) {
        super();
        this.addClass(REVISION_BROWSER_CLASS);

        gatherModel.addObserver(this);
        this._gatherModel = gatherModel;
        this._outputRenderer = new OutputRenderer();

        // Add button for exiting the revision browser.
        let exitButton = document.createElement("div");
        let icon = document.createElement("i");
        icon.classList.add("fa", "fa-window-close");
        exitButton.appendChild(icon);
        // exitButton.textContent = "X";
        exitButton.onclick = () => { this.dismiss(); };
        let exitWidget = new Widget({ node: exitButton });
        exitWidget.addClass("jp-Notebook-revisionbrowser-exit");
        let layout = (this.layout = new PanelLayout());
        layout.addWidget(exitWidget);

        // This widget starts out hidden.
        this.hide();
    }

    /**
     * Handle change to the gather model.
     */
    onModelChange(eventType: GatherModelEvent, eventData: GatherEventData, model: GatherModel) {
        if (eventType == GatherModelEvent.STATE_CHANGED) {
            let newState = eventData as GatherState;
            if (newState == GatherState.GATHER_HISTORY) {
                this.show();
                this.attachSliceWidgets(model);
            } else {
                this.hide();
                if (this._historyViewer) {
                    this.layout.removeWidget(this._historyViewer);
                    this._historyViewer = null;
                }
            }
        }
    }

    attachSliceWidgets(model: GatherModel) {
        let defSelections = model.selectedDefs;
        let outputSelections = model.selectedOutputs;
        let slices;
        let cellId;
        if (defSelections.length > 0) {
            slices = model.getSelectedDefSlices(defSelections[0]);
            cellId = defSelections[0].cell.id;
        } else if (outputSelections.length > 0) {
            slices = model.getSelectedOutputSlices(outputSelections[0]);
            cellId = outputSelections[0].cell.id;
        }
        if (slices && cellId) {
            let historyModel = buildHistoryModel<OutputArea>(
                model, cellId, slices);
            // This currently uses code borrowed from Jupyter Lab (for rendering MIME and creating
            // the default editor factory). Not ideal. Fix up soon.
            let historyViewer = new HistoryViewer<OutputArea>({
                model: historyModel,
                outputRenderer: this._outputRenderer
            });
            this._historyViewer = historyViewer;
            (this.layout as PanelLayout).addWidget(historyViewer);
        }
    }

    /**
     * Dismiss this widget.
     */
    dismiss() {
        this._gatherModel.requestStateChange(GatherState.SELECTING);
    }

    private _gatherModel: GatherModel;
    private _outputRenderer: OutputRenderer;
    private _historyViewer: HistoryViewer<OutputArea>;
}