import { DataflowAnalyzer, ExecutionLogSlicer } from "@msrvida/python-program-analysis";
import { GatherController, GatherModel } from "../model";
import { LogCell } from "../model/cell";
import { MockDocumentManager, MockNotebookTracker } from "./jupyter-mocks";

export function initGather() {
  const dataflowAnalyzer = new DataflowAnalyzer();
  const logSlicer = new ExecutionLogSlicer<LogCell>(dataflowAnalyzer);
  const model = new GatherModel(logSlicer);
  const controller = new GatherController(
    model,
    new MockDocumentManager(),
    new MockNotebookTracker()
  );
  return {
    model,
    logSlicer,
    controller
  };
}
