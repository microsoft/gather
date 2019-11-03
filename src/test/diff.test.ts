import { computeTextDiff } from "../widgets/history/diff";

describe("textdiff", () => {
  test("returns the original text if before and after are the same", () => {
    const before = "hello world";
    const after = "hello world";
    let diff = computeTextDiff(before, after);
    expect(diff.text).toEqual(before);
    expect(diff.beforeLines).toEqual([]);
    expect(diff.afterLines).toEqual([]);
    expect(diff.changeLocations).toEqual([]);
  });

  test("repeats lines where there's a difference", () => {
    const before = "hello world";
    const after = "hello moon";
    let diff = computeTextDiff(before, after);
    expect(diff.text).toEqual(["hello world", "hello moon"].join("\n"));
    expect(diff.beforeLines).toEqual([1]);
    expect(diff.afterLines).toEqual([2]);
    expect(diff.changeLocations).toContainEqual({
      first_line: 1,
      first_column: 6,
      last_line: 1,
      last_column: 11
    });
    expect(diff.changeLocations).toContainEqual({
      first_line: 2,
      first_column: 6,
      last_line: 2,
      last_column: 10
    });
  });

  test("does not find differences when before and after are the same and have multiple lines", () => {
    const before = "line 1\nline 2";
    const after = "line 1\nline 2";
    let diff = computeTextDiff(before, after);
    expect(diff.text).toEqual(before);
  });

  test("diffs missing newlines", () => {
    const before = "line 1\nline 2";
    const after = "line 1\nline 2\nline 3";
    let diff = computeTextDiff(before, after);
    expect(diff.text).toEqual("line 1\nline 2\nline 2⏎\nline 3");
    expect(diff.changeLocations).toContainEqual({
      first_line: 3,
      first_column: 6,
      last_line: 3,
      last_column: 7
    });
  });

  test("finds changes on multiple lines", () => {
    const before = "line a\nline b";
    const after = "line A\nline B";
    let diff = computeTextDiff(before, after);
    expect(diff.text).toEqual("line a\nline b\nline A\nline B");
    let changeLocationLines = diff.changeLocations.map(l => l.first_line);
    expect(changeLocationLines).toContain(1);
    expect(changeLocationLines).toContain(2);
    expect(changeLocationLines).toContain(3);
    expect(changeLocationLines).toContain(4);
  });

  test("doesn't include blank lines", () => {
    const before = "";
    const after = "line";
    let diff = computeTextDiff(before, after);
    expect(diff.text).toEqual("line");
  });
});
