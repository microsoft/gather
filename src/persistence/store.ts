import { nbformat } from "@jupyterlab/coreutils";
import { INotebookModel } from "@jupyterlab/notebook";
import { ExecutionLogSlicer } from "@msrvida/python-program-analysis";
import { JSONArray, JSONObject } from "@phosphor/coreutils";
import { LogCell } from "../model/labcell";
import { EXECUTION_HISTORY_METADATA_KEY } from "./load";

interface CellExecutionJson extends JSONObject {
  executionTime: string;
  cell: CellJson;
}

interface CellJson extends JSONObject {
  id: string;
  persistentId: string;
  executionEventId: string;
  executionCount: number;
  hasError: boolean;
  isCode: boolean;
  text: string;
  gathered: boolean;
  outputs: nbformat.IOutput[];
}

/**
 * This method is complementary with the loadHistory method. Make sure that any chances to the
 * format of stored history is reflected in changes to that method.
 */
export function storeHistory(
  notebookModel: INotebookModel,
  executionLog: ExecutionLogSlicer<LogCell>
) {
  let cellExecutionsJson: JSONArray = [];

  for (let cellExecution of executionLog.cellExecutions) {
    let cell = cellExecution.cell;
    let cellJson = new Object(null) as CellJson;
    if (cell instanceof LogCell) {
      cellJson.id = cell.id;
      cellJson.persistentId = cell.persistentId;
      cellJson.executionEventId = cell.executionEventId;
      cellJson.executionCount = cell.executionCount;
      cellJson.hasError = cell.hasError;
      cellJson.text = cell.text;
      cellJson.outputs = cell.outputs;

      let cellExecutionJson = new Object(null) as CellExecutionJson;
      cellExecutionJson.cell = cellJson;
      cellExecutionJson.executionTime = cellExecution.executionTime.toISOString();

      cellExecutionsJson.push(cellExecutionJson);
    }
  }

  notebookModel.metadata.set(EXECUTION_HISTORY_METADATA_KEY, cellExecutionsJson);
}
