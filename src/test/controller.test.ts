import { DefSelection } from "../model";
import { LogCell } from "../model/cell";
import { initGatherController, initGatherModelForTests, stdout } from "./util";

/**
 * This is an appropriate test suite to add simple tests to make sure that slicing is working as
 * expected on the data structures of 'nbgather'. It should not be a comprehensive test suite:
 * instead, a comprehensive test suite should be in the
 * {@link https://github.com/Microsoft/python-program-analysis} repository this project depends on.
 */

describe("GatherController", () => {
  it("slices cells when definitions are selected", () => {
    const { logSlicer, model } = initGatherModelForTests();
    initGatherController(model);

    const cell1 = new LogCell({
      text: "x = 1\n" + "y = 2",
      executionCount: 1
    });
    const cell2 = new LogCell({
      text: "z = y",
      executionCount: 2
    });
    logSlicer.logExecution(cell1);
    logSlicer.logExecution(cell2);

    const cell2Program = logSlicer.getCellProgram(cell2.executionEventId);
    expect(cell2Program.defs.length).toBe(1);

    const defOfZ = cell2Program.defs[0];
    model.selectDef(
      new DefSelection({
        cell: cell2,
        editorDef: { cell: cell2, def: defOfZ, editor: null }
      })
    );

    expect(model.selectedSlices.length).toBe(1);
    const { slice } = model.selectedSlices[0];
    const sliceTexts = slice.cellSlices.map(cs => cs.textSlice);
    expect(sliceTexts).toContain("z = y");
    expect(sliceTexts).toContain("y = 2");
  });

  it("slices cells when outputs are selected", () => {
    const { logSlicer, model } = initGatherModelForTests();
    initGatherController(model);

    const cell1 = new LogCell({
      text: "x = 1\n" + "y = 2",
      executionCount: 1
    });
    const cell2 = new LogCell({
      text: "print(y)",
      executionCount: 2,
      outputs: [stdout("2\n")]
    });
    logSlicer.logExecution(cell1);
    logSlicer.logExecution(cell2);

    model.selectOutput({ cell: cell2, outputIndex: 0 });
    expect(model.selectedSlices.length).toBe(1);
    const { slice } = model.selectedSlices[0];
    const sliceTexts = slice.cellSlices.map(cs => cs.textSlice);
    expect(sliceTexts).toContain("print(y)");
    expect(sliceTexts).toContain("y = 2");
  });
});
