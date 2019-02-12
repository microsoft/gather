import { INotebookTracker, INotebookModel } from "@jupyterlab/notebook";
import { GatherModel } from "../packages/gather";
import { UUID } from "@phosphor/coreutils";
import { log } from "util";

export function getGatherModelForActiveNotebook(notebooks: INotebookTracker,
    gatherModelRegistry: GatherModelRegistry): GatherModel | null {
    let activeNotebook = notebooks.currentWidget;
    if (activeNotebook == null) return null;
    return gatherModelRegistry.getGatherModel(activeNotebook.model);
}

/**
 * Registry of all gather models created for all open notebooks.
 */
export class GatherModelRegistry {

    /**
     * Returns null is notebook ID is in an unexpected format.
     */
    _getNotebookId(notebookModel: INotebookModel): string | null {
        const METADATA_NOTEBOOK_ID_KEY = "uuid";
        if (!notebookModel.metadata.has(METADATA_NOTEBOOK_ID_KEY)) {
            notebookModel.metadata.set(METADATA_NOTEBOOK_ID_KEY, UUID.uuid4());
        }
        let id = notebookModel.metadata.get(METADATA_NOTEBOOK_ID_KEY);
        if (!(typeof id == 'string')) {
            log("Unexpected notebook ID format " + id);
            return null;
        }
        return id;
    };

    /**
     * Returns false if storage of gather model failed.
     */
    addGatherModel(notebookModel : INotebookModel, gatherModel : GatherModel): boolean {
        let notebookId = this._getNotebookId(notebookModel);
        if (notebookId == null) return false;
        this._gatherModels[notebookId] = gatherModel;
        return true;
    }

    /**
     * Returns null if no gather model found for this notebook.
     */
    getGatherModel(notebookModel: INotebookModel) : GatherModel | null {
        let notebookId = this._getNotebookId(notebookModel);
        if (notebookId == null) return null;
        if (this._gatherModels.hasOwnProperty(notebookId)) {
            return this._gatherModels[notebookId];
        }
        return null;
    }

    private _gatherModels: { [ notebookId: string ] : GatherModel } = {};
}
