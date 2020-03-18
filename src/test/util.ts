import { DataflowAnalyzer, ExecutionLogSlicer } from "@andrewhead/python-program-analysis";
import * as nbformat from '@jupyterlab/nbformat';
import { GatherController, GatherModel } from "../model";
import { LogCell } from "../model/cell";
import { MockDocumentManager, MockNotebookTracker } from "./jupyter-mocks";

export function initGatherModelForTests(createController: boolean = false) {
  const dataflowAnalyzer = new DataflowAnalyzer();
  const logSlicer = new ExecutionLogSlicer<LogCell>(dataflowAnalyzer);
  const model = new GatherModel(logSlicer);
  return { model, logSlicer };
}

export function initGatherController(model: GatherModel) {
  return new GatherController(model, new MockDocumentManager(), new MockNotebookTracker());
}

export function stdout(text: string): nbformat.IOutput {
  return {
    name: "stdout",
    output_type: "stream",
    text: "text"
  };
}
