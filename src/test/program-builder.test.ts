import { expect } from "chai";
import { ProgramBuilder } from "../ProgramBuilder";
import { SimpleCodeCellModel, SimpleOutputAreaModel, SimpleOutputModel } from "./util";


describe('program builder', () => {

    function createCell(id: string, executionCount: number, ...codeLines: string[]) {
        let code = codeLines.join("\n");
        return new SimpleCodeCellModel(id, executionCount, code);
    }

    console.log(SimpleCodeCellModel);

    let programBuilder: ProgramBuilder;
    beforeEach(() => {
        programBuilder = new ProgramBuilder();
        console.log(programBuilder);
    });

    it('appends cell contents in execution order', () => {
        programBuilder.add(createCell("id1", 2, "print(1)"));
        programBuilder.add(createCell("id2", 1, "print(2)"));
        let program = programBuilder.build();
        expect(program).to.equal(["print(2)", "print(1)"].join("\n"))
    });

    it('stops after the specified cell\'s ID', () => {
        programBuilder.add(createCell("id1", 2, "print(1)"));
        programBuilder.add(createCell("id2", 1, "print(2)"));
        let program = programBuilder.buildTo("id2");
        expect(program).to.equal("print(2)");
    });

    it('builds to the most recent version of the cell', () => {
        programBuilder.add(createCell("id1", 1, "print(1)"));
        programBuilder.add(createCell("id2", 2, "print(2)"));
        programBuilder.add(createCell("id1", 3, "print(3)"));  // cell id1 run twice
        let program = programBuilder.buildTo("id1");
        expect(program).to.equal(["print(1)", "print(2)", "print(3)"].join("\n"));
    });

    it('filters history for earlier cell executions', () => {

    });

    /* We might want the program builder to include code that was executed before a runtime
     * error, though this will probably require us to rewrite the code. */
    it('skips cells with errors', () => {
        programBuilder.add(createCell("id1", 1, "print(1)"));
        let badCell = createCell("idE", 2, "print(bad_name)");
        badCell.outputs = new SimpleOutputAreaModel(new SimpleOutputModel("error", null));
        programBuilder.add(badCell);
        programBuilder.add(createCell("id3", 3, "print(3)"));
        let program = programBuilder.buildTo("id3");
        expect(program).to.equal(["print(1)", "print(3)"].join("\n"));
    });

});