import { ExecutionLogSlicer } from "../slicing/ExecutionSlicer";
import { INotebookModel } from "@jupyterlab/notebook";
import { EXECUTION_HISTORY_METADATA_KEY } from "./load";
import { JSONObject, JSONArray } from "@phosphor/coreutils";

interface CellExecutionJson extends JSONObject {
    executionTime: string;
    cell: CellJson;
}

interface CellJson extends JSONObject {
    id: string;
    persistentId: string;
    executionCount: number;
    hasError: boolean;
    isCode: boolean;
    text: string;
    gathered: boolean;
}

/**
 * This method is complementary with the loadHistory method. Make sure that any chances to the
 * format of stored history is reflected in changes to that method.
 */
export function storeHistory(notebookModel: INotebookModel, executionLog: ExecutionLogSlicer) {

    let cellExecutionsJson: JSONArray = [];

    for (let cellExecution of executionLog.cellExecutions) {
        
        let cell = cellExecution.cell;
        let cellJson = new Object(null) as CellJson;
        cellJson.id = cell.id;
        cellJson.persistentId = cell.persistentId;
        cellJson.executionCount = cell.executionCount;
        cellJson.hasError = cell.hasError;
        cellJson.text = cell.text;

        let cellExecutionJson = new Object(null) as CellExecutionJson;
        cellExecutionJson.cell = cellJson;
        cellExecutionJson.executionTime = cellExecution.executionTime.toISOString();
        
        cellExecutionsJson.push(cellExecutionJson);
    }

    notebookModel.metadata.set(EXECUTION_HISTORY_METADATA_KEY, cellExecutionsJson);
}