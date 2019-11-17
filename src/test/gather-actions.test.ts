import { CellSlice, LocationSet, SlicedExecution } from "@andrewhead/python-program-analysis";
import { getCellsJsonForSlice } from "../main/gather-actions";
import { LogCell } from "../model/cell";
import { stdout } from "./util";

describe("getCellsJsonForSlice", () => {
  it("gets JSON for a slice", () => {
    /*
     * Note that the first line in any cell is line 1.
     */
    const cellSlice1 = new CellSlice(
      new LogCell({ text: "x = 1\n" + "y = 2" }),
      new LocationSet({ first_line: 2, first_column: 0, last_line: 2, last_column: 5 })
    );
    const cellSlice2 = new CellSlice(
      new LogCell({ text: "z = y" }),
      new LocationSet({ first_line: 1, first_column: 0, last_line: 1, last_column: 4 })
    );
    const slicedExecution = new SlicedExecution(new Date(), [cellSlice1, cellSlice2]);

    const json = getCellsJsonForSlice(slicedExecution, []);
    expect(json.length).toBe(2);

    const cellJson1 = json[0];
    expect(cellJson1).toMatchObject({
      cell_type: "code",
      execution_count: null,
      outputs: [],
      source: "y = 2"
    });
    const cellJson2 = json[1];
    expect(cellJson2).toMatchObject({
      cell_type: "code",
      execution_count: null,
      outputs: [],
      source: "z = y"
    });
  });

  it("includes outputs", () => {
    const cellSlice1 = new CellSlice(
      new LogCell({ text: "x = do_something(1)", outputs: [stdout("do_something output\n")] }),
      new LocationSet({ first_line: 1, first_column: 0, last_line: 1, last_column: 19 })
    );
    const cellSlice2 = new CellSlice(
      new LogCell({ text: "print(x)", outputs: [stdout("2\n")] }),
      new LocationSet({ first_line: 1, first_column: 0, last_line: 1, last_column: 4 })
    );
    const slicedExecution = new SlicedExecution(new Date(), [cellSlice1, cellSlice2]);

    const json = getCellsJsonForSlice(slicedExecution, [{ cell: cellSlice2.cell, outputIndex: 0 }]);
    expect(json.length).toBe(2);

    const cellJson1 = json[0];
    expect(cellJson1.outputs).toEqual([]);
    const cellJson2 = json[1];
    expect(cellJson2.outputs).toEqual([stdout("2\n")]);
  });
});
