import { nbformat } from "@jupyterlab/coreutils";
import { RenderMimeRegistry, standardRendererFactories } from "@jupyterlab/rendermime";
import { PanelLayout, Widget } from "@phosphor/widgets";
import { GatherModel, GatherState } from "../model/model";
import { log } from "../util/log";
import { DisplayData } from "../widgets/displaydata";
import { buildHistoryModel, HistoryViewer } from "../widgets/history";
import { IOutputRenderer } from "../widgets/revision";

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
class OutputRenderer implements IOutputRenderer {
    /**
     * Render HTML element for this output.
     */
    render(output: nbformat.IOutput): HTMLElement {
        let widget = new DisplayData({
            model: output,
            rendermime: new RenderMimeRegistry({ initialFactories: standardRendererFactories })
        });
        widget.addClass(REVISION_OUTPUT_CLASS);
        return widget.node;
    }
}

/**
 * Window that lets the user browse revisions of code.
 */
export class RevisionBrowser extends Widget {
    /**
     * Construct a new revision browser.
     */
    constructor(gatherModel: GatherModel) {
        super();
        this.id = "revision-browser";
        this.title.label = "Revision browser";
        this.title.icon = "jp-HistoryIcon";
        this.title.closable = true;
        this.addClass(REVISION_BROWSER_CLASS);

        this._gatherModel = gatherModel;
        this._outputRenderer = new OutputRenderer();
        this.layout = new PanelLayout();

        this.attachSliceWidgets(gatherModel);
    }

    attachSliceWidgets(model: GatherModel) {
        let defSelections = model.selectedDefs;
        let outputSelections = model.selectedOutputs;
        let slices;
        let cellPersistentId;
        if (defSelections.length > 0) {
            slices = model.getSelectedDefSlices(defSelections[0]);
            cellPersistentId = defSelections[0].cell.persistentId;
        } else if (outputSelections.length > 0) {
            slices = model.getSelectedOutputSlices(outputSelections[0]);
            cellPersistentId = outputSelections[0].cell.persistentId;
        }
        log("Bringing up the revision browser for selection", {
            cellPersistendId: cellPersistentId, slices,
            selectedDefs: model.selectedDefs,
            selectedOutputs: model.selectedOutputs
        });
        if (slices && cellPersistentId) {
            // Only show output if the selection was output.
            let includeOutput = model.selectedOutputs.length >= 1;
            let historyModel = buildHistoryModel(
                model, cellPersistentId, slices, includeOutput);
            let historyViewer = new HistoryViewer({
                model: historyModel,
                outputRenderer: this._outputRenderer
            });
            (this.layout as PanelLayout).addWidget(historyViewer);
        }
    }

    /**
     * Dismiss this widget.
     */
    dismiss() {
        log("Dismissing revision browser");
        this._gatherModel.requestStateChange(GatherState.SELECTING);
    }

    private _gatherModel: GatherModel;
    private _outputRenderer: OutputRenderer;
}