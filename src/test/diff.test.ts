import { expect } from "chai";
import { textdiff } from "../packages/history/diff";

describe('textdiff', () => {

    it('returns the original text if before and after are the same', () => {
        const before = "hello world";
        const after = "hello world";
        let diff = textdiff(before, after);
        expect(diff.text).to.equal(before);
        expect(diff.beforeLines).to.deep.equal([]);
        expect(diff.afterLines).to.deep.equal([]);
        expect(diff.changeLocations).to.deep.equal([]);
    });

    it('repeats lines where there\'s a difference', () => {
        const before = "hello world";
        const after = "hello moon";
        let diff = textdiff(before, after);
        expect(diff.text).to.equal([
            "hello world",
            "hello moon"
        ].join("\n"));
        expect(diff.beforeLines).to.deep.equal([1]);
        expect(diff.afterLines).to.deep.equal([2]);
        expect(diff.changeLocations).to.deep.include({
            first_line: 1,
            first_column: 6,
            last_line: 1,
            last_column: 11
        });
        expect(diff.changeLocations).to.deep.include({
            first_line: 2,
            first_column: 6,
            last_line: 2,
            last_column: 10
        });
    });
})