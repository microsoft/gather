import { expect } from "chai";
import { ProgramBuilder } from "../slicing/ProgramBuilder";
import { ICell } from '../packages/cell';


describe('program builder', () => {

    function createCell(id: string, executionCount: number, ...codeLines: string[]): ICell {
        let text = codeLines.join("\n");
        return { is_cell: true, id, executionCount, text: text, hasError: false, isCode: true,
            gathered: false, copy: () => null };
    }

    let programBuilder: ProgramBuilder;
    beforeEach(() => {
        programBuilder = new ProgramBuilder();
    });

    it('appends cell contents in execution order', () => {
        programBuilder.add(
            createCell("id1", 2, "print(1)"),
            createCell("id2", 1, "print(2)")
        )
        let code = programBuilder.build().code;
        expect(code).to.equal(["print(2)", "print(1)", ""].join("\n"))
    });

    it('builds a map from lines to cells', () => {
        let cell1 = createCell("id1", 1, "print(1)");
        let cell2 = createCell("id2", 2, "print(2)");
        programBuilder.add(cell1, cell2);
        let lineToCellMap = programBuilder.buildTo("id2").lineToCellMap;
        expect(lineToCellMap[1]).to.equal(cell1);
        expect(lineToCellMap[2]).to.equal(cell2);
    });

    it('builds a map from cells to lines', () => {
        let cell1 = createCell("id1", 1, "print(1)");
        let cell2 = createCell("id2", 2, "print(2)");
        programBuilder.add(cell1, cell2);
        let cellToLineMap = programBuilder.buildTo("id2").cellToLineMap;
        expect(cellToLineMap["id1"][1].items).to.deep.equal([1]);
        expect(cellToLineMap["id2"][2].items).to.deep.equal([2]);
    });

    it('stops after the specified cell\'s ID', () => {
        programBuilder.add(
            createCell("id1", 2, "print(1)"),
            createCell("id2", 1, "print(2)")
        );
        let code = programBuilder.buildTo("id2").code;
        expect(code).to.equal("print(2)\n");
    });

    it('builds to the most recent version of the cell', () => {
        programBuilder.add(
            createCell("id1", 1, "print(1)"),
            createCell("id2", 2, "print(2)"),
            createCell("id1", 3, "print(3)")  // cell id1 run twice
        );
        let code = programBuilder.buildTo("id1").code;
        expect(code).to.equal(["print(1)", "print(2)", "print(3)", ""].join("\n"));
    });

    it('builds to a requested version of a cell', () => {
        programBuilder.add(
            createCell("id1", 1, "print(1)"),
            createCell("id2", 2, "print(2)"),
            createCell("id1", 3, "print(3)")  // cell id1 run twice
        );
        let code = programBuilder.buildTo("id1", 1).code;
        expect(code).to.equal("print(1)\n");
    });

    /* We might want the program builder to include code that was executed before a runtime
     * error, though this will probably require us to rewrite the code. */
    it('skips cells with errors', () => {
        let badCell = createCell("idE", 2, "print(bad_name)");
        badCell.hasError = true;
        programBuilder.add(
            createCell("id1", 1, "print(1)"),
            badCell,
            createCell("id3", 3, "print(3)")
        );
        let code = programBuilder.buildTo("id3").code;
        expect(code).to.equal(["print(1)", "print(3)", ""].join("\n"));
    });

    /* Sometimes, a cell might not throw an error, but our parser might choke. This shouldn't
     * crash the entire program---just skip it if it can't parse. */
    it('skips cells that fail to parse', () => {
        let badCell = createCell("idE", 2, "causes_syntax_error(");
        programBuilder.add(
            createCell("id1", 1, "print(1)"),
            badCell,
            createCell("id3", 3, "print(3)")
        );
        let code = programBuilder.buildTo("id3").code;
        expect(code).to.equal(["print(1)", "print(3)", ""].join("\n"));
    });
});