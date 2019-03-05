import { INotebookModel } from "@jupyterlab/notebook";
import { JSONArray, JSONExt, JSONObject } from "@phosphor/coreutils";
import { log } from "util";
import { CellExecution } from "../analysis/slice/log-slicer";
import { LogCell } from "../model/cell";
import { GatherModel } from "../model";

/**
 * Key for accessing execution history in Jupyter notebook metadata.
 */
export const EXECUTION_HISTORY_METADATA_KEY = "history";

/**
 * Load history for a Jupyter notebook from a notebook's metadata. This method is asynchronous
 * because it needs to continually poll the notebook's metadata when Lab first loads.
 */
export function loadHistory(notebookModel: INotebookModel, gatherModel: GatherModel) {
    if (_notebookHistoryMetadataFound(notebookModel)) {
        _tryLoadHistory(notebookModel, gatherModel);
        return;
    }
    log("No history found in notebook metadata.");
}

function _notebookHistoryMetadataFound(notebookModel: INotebookModel): boolean {
    return notebookModel.metadata.has(EXECUTION_HISTORY_METADATA_KEY);
}

/**
 * Returns null if the format of the execution log metadata is unrecognized.
 */
function _tryLoadHistory(notebookModel: INotebookModel, gatherModel: GatherModel) {

    let historyCells = notebookModel.metadata.get(EXECUTION_HISTORY_METADATA_KEY);
    if (!JSONExt.isArray(historyCells)) {
        log("Unexpected history metadata format: no array found");
        return;
    }

    let executionsArray = historyCells as JSONArray;
    for (let executionValue of executionsArray) {
        if (!JSONExt.isObject(executionValue)) {
            log("Unexpected history metadata format: cell execution is not an object");
            return;
        }
        let executionJsonObject = executionValue as JSONObject;
        let cellExecution = _loadExecutionFromJson(executionJsonObject);
        if (cellExecution == null) {
            log("Unexpected cell execution format. Loading history aborted.");
            return;
        }
        gatherModel.executionLog.addExecutionToLog(cellExecution);
    }
}

/**
 * Returns null if the format of the cell execution JSON is unrecognized.
 */
function _loadExecutionFromJson(executionJson: JSONObject): CellExecution {

    function _getString(json: JSONObject, key: string): string {
        if (!json.hasOwnProperty(key) || typeof json[key] != 'string') {
            log("Could not find key " + key + "in object " + json);
            return null;
        }
        return json[key] as string;
    }

    function _getNumber(json: JSONObject, key: string): number {
        if (!json.hasOwnProperty(key) || typeof json[key] != 'number') {
            log("Could not find key " + key + "in object " + json);
            return null;
        }
        return json[key] as number;
    }

    function _getBoolean(json: JSONObject, key: string): boolean {
        if (!json.hasOwnProperty(key) || typeof json[key] != 'boolean') {
            log("Could not find key " + key + "in object " + json);
            return null;
        }
        return json[key] as boolean;
    }

    if (!executionJson.hasOwnProperty('cell') || !JSONExt.isObject(executionJson['cell'])) {
        log("Unexpected cell data format: cell is not an object");
        return null;
    }
    let cellJson = executionJson['cell'] as JSONObject;

    let id = _getString(cellJson, 'id');
    let persistentId = _getString(cellJson, 'persistentId');
    let executionCount = _getNumber(cellJson, 'executionCount');
    let kernelId = _getString(cellJson, 'kernelId');
    let hasError = _getBoolean(cellJson, 'hasError');
    let text = _getString(cellJson, 'text');

    let executionTimeString = _getString(executionJson, "executionTime");
    let executionTime = new Date(executionTimeString);

    if (id == null || executionCount == null || hasError == null ||
        kernelId == null || text == null || executionTime == null) {
        log("Cell could not be loaded, as it's missing a critical field.");
        return null;
    }

    /**
     * TODO(andrewhead): Update with Kunal's code for serializing and deserializing outputs.
     */
    let cell = new LogCell({ id, executionCount, hasError, text, persistentId });
    return new CellExecution(cell, executionTime);
}