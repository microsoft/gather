import { expect } from "chai";
import { slice, LocationSet } from "../slicing/Slice";

describe('detects dataflow dependencies', () => {

    it('from variable uses to names', () => {
        let locations = slice([
            "a = 1",
            "b = a"
        ].join("\n"), new LocationSet(
            { first_line: 2, first_column: 0, last_line: 2, last_column: 1 }
        ));
        expect(locations.items).to.deep.include(
            { first_line: 1, first_column: 0, last_line: 1, last_column: 1 }
        );
    });
});