import { ObservableJSON } from "@jupyterlab/observables";
import { EXECUTION_HISTORY_METADATA_KEY, loadHistory } from "../persistence/load";
import { MockNotebook } from "./jupyter-mocks";
import { initGatherModelForTests, stdout } from "./util";

const TEST_NOTEBOOK = new MockNotebook();
TEST_NOTEBOOK.metadata = new ObservableJSON({
  values: {
    [EXECUTION_HISTORY_METADATA_KEY]: [
      {
        cell: {
          executionCount: 1,
          executionEventId: "execution-event-id-1",
          hasError: false,
          id: "id-1",
          outputs: [],
          persistentId: "persistent-id-1",
          text: "x = 1"
        },
        executionTime: "2019-01-01T09:00:00.000Z"
      },
      {
        cell: {
          executionCount: 2,
          executionEventId: "execution-event-id-2",
          hasError: false,
          id: "id-2",
          outputs: [stdout("1\n")],
          persistentId: "persistent-id-2",
          text: "print(x)"
        },
        executionTime: "2019-01-01T09:01:00.000Z"
      }
    ]
  }
});

describe("loadHistory", () => {
  it("loads cells", () => {
    const { model } = initGatherModelForTests();
    loadHistory(TEST_NOTEBOOK, model);

    const log = model.executionLog.executionLog;
    expect(log.length).toBe(2);
    expect(log[0]).toMatchObject({
      cell: {
        id: "id-1",
        persistentId: "persistent-id-1",
        executionEventId: "execution-event-id-1",
        text: "x = 1",
        executionCount: 1,
        outputs: []
      },
      executionTime: new Date("2019-01-01T09:00:00.000Z")
    });
    expect(log[1]).toMatchObject({
      cell: {
        id: "id-2",
        persistentId: "persistent-id-2",
        executionEventId: "execution-event-id-2",
        text: "print(x)",
        executionCount: 2,
        outputs: [stdout("1\n")]
      },
      executionTime: new Date("2019-01-01T09:01:00.000Z")
    });
  });

  it("parses cell contents", () => {
    const { model } = initGatherModelForTests();
    loadHistory(TEST_NOTEBOOK, model);

    const logCell = model.executionLog.executionLog[0].cell;
    const cellProgram = model.getCellProgram(logCell);
    expect(cellProgram.statements.length).toBe(1);
    expect(cellProgram.defs.length).toBe(1);
    expect(cellProgram.defs[0].name).toBe("x");
  });

  /**
   * Make sure the log is initialized so that it can be immediately and correctly sliced.
   */
  it("makes slices correctly", () => {
    const { model } = initGatherModelForTests();
    loadHistory(TEST_NOTEBOOK, model);

    const slices = model.executionLog.sliceAllExecutions("persistent-id-2");
    expect(slices.length).toBe(1);

    const cellSlices = slices[0].cellSlices;
    expect(cellSlices.length).toBe(2);
    expect(cellSlices[0].textSlice).toBe("x = 1");
    expect(cellSlices[1].textSlice).toBe("print(x)");
  });
});
