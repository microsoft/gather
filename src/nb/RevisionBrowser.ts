import { Widget, PanelLayout } from "@phosphor/widgets";
import { IGatherObserver, GatherModel, GatherModelEvent, GatherEventData, GatherState } from "../packages/gather";
import { buildHistoryModel, HistoryViewer } from "../packages/history";


/**
 * Window that lets the user browse revisions of code.
 */
export class RevisionBrowser extends Widget implements IGatherObserver {
    /**
     * Construct a new revision browser.
     */
    constructor(gatherModel: GatherModel) {
        super();
        this.addClass("jp-Notebook-revisionbrowser");

        gatherModel.addObserver(this);
        this._gatherModel = gatherModel;

        // Add button for exiting the revision browser.
        let exitButton = document.createElement("div");
        exitButton.textContent = "X";
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
            let historyModel = buildHistoryModel<JSON>(cellId, slices);
            // This currently uses code borrowed from Jupyter Lab (for rendering MIME and creating
            // the default editor factory). Not ideal. Fix up soon.
            let historyViewer = new HistoryViewer<JSON>({
                model: historyModel
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
    private _historyViewer: HistoryViewer<JSON>;
}