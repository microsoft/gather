import { DataflowAnalyzer, ExecutionLogSlicer } from "@msrvida/python-program-analysis";
import { GatherController, GatherModel } from "../model";
import { LogCell } from "../model/cell";
import { MockDocumentManager, MockNotebookTracker } from "./jupyter-mocks";

/**
 * This is an appropriate test suite to add simple tests to make sure that slicing is working as
 * expected on the data structures of 'nbgather'. It should not be a comprehensive test suite:
 * instead, a comprehensive test suite should be in the
 * {@link https://github.com/Microsoft/python-program-analysis} repository this project depends on.
 */

describe("GatherController", () => {
  it("slices cells when definitions are selected", () => {
    const dataflowAnalyzer = new DataflowAnalyzer();
    const executionLogSlicer = new ExecutionLogSlicer<LogCell>(dataflowAnalyzer);
    const gatherModel = new GatherModel(executionLogSlicer);
    new GatherController(gatherModel, new MockDocumentManager(), new MockNotebookTracker());

    const cell1 = new LogCell({
      text: "x = 1\n" + "y = 2",
      executionCount: 1
    });
    const cell2 = new LogCell({
      text: "z = y",
      executionCount: 2
    });
    executionLogSlicer.logExecution(cell1);
    executionLogSlicer.logExecution(cell2);

    const cell2Program = executionLogSlicer.getCellProgram(cell2.executionEventId);
    expect(cell2Program.defs.length).toBe(1);

    const zDef = cell2Program.defs[0];
    gatherModel.selectDef({
      cell: cell2,
      editorDef: { cell: cell2, def: zDef, editor: null },
      toJSON: () => {}
    });

    expect(gatherModel.selectedSlices.length).toBe(1);
    const slice = gatherModel.selectedSlices[0];
    slice.slice.cellSlices.some(cs => cs.textSlice === "z = y");
    slice.slice.cellSlices.some(cs => cs.textSlice === "x = 1");
  });
});
