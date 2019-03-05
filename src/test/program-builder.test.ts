import { expect } from "chai";
import { ProgramBuilder } from "../analysis/slice/program-builder";
import { ICell, LogCell } from '../model/cell';


describe('program builder', () => {

    const TEST_KERNEL_ID = "kernel-1";
    
    function createCellWithKernelId(persistentId: string, kernelId: string, executionCount: number, 
        ...codeLines: string[]): ICell {
            let text = codeLines.join("\n");
            return new LogCell({ executionCount, persistentId, kernelId, text });
    }

    function createCell(persistentId: string, executionCount: number, ...codeLines: string[]): ICell {
        return(createCellWithKernelId(persistentId, TEST_KERNEL_ID, executionCount, ...codeLines));
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
        let code = programBuilder.buildTo("id1", TEST_KERNEL_ID, 2).text;
        expect(code).to.equal(["print(2)", "print(1)", ""].join("\n"))
    });

    it('builds a map from lines to cells', () => {
        let cell1 = createCell("id1", 1, "print(1)");
        let cell2 = createCell("id2", 2, "print(2)");
        programBuilder.add(cell1, cell2);
        let lineToCellMap = programBuilder.buildTo("id2", TEST_KERNEL_ID, 2).lineToCellMap;
        expect(lineToCellMap[1]).to.equal(cell1);
        expect(lineToCellMap[2]).to.equal(cell2);
    });

    it('builds a map from cells to lines', () => {
        let cell1 = createCell("id1", 1, "print(1)");
        let cell2 = createCell("id2", 2, "print(2)");
        programBuilder.add(cell1, cell2);
        let cellToLineMap = programBuilder.buildTo("id2", TEST_KERNEL_ID, 2).cellToLineMap;
        expect(cellToLineMap["id1"][1].items).to.deep.equal([1]);
        expect(cellToLineMap["id2"][2].items).to.deep.equal([2]);
    });

    it('stops after the specified cell', () => {
        programBuilder.add(
            createCell("id1", 2, "print(1)"),
            createCell("id2", 1, "print(2)")
        );
        let code = programBuilder.buildTo("id2", TEST_KERNEL_ID, 1).text;
        expect(code).to.equal("print(2)\n");
    });

    /* We might want the program builder to include code that was executed before a runtime
     * error, though this will probably require us to rewrite the code. */
    it('skips cells with errors', () => {
        let badCell = createCell("idE", 2, "print(2)");
        badCell.hasError = true;
        programBuilder.add(
            createCell("id1", 1, "print(1)"),
            badCell,
            createCell("id3", 3, "print(3)")
        );
        let code = programBuilder.buildTo("id3", TEST_KERNEL_ID, 3).text;
        expect(code).to.equal(["print(1)", "print(3)", ""].join("\n"));
    });

    it('includes cells that end with errors', () => {
        let badCell = createCell("idE", 3, "print(bad_name)");
        badCell.hasError = true;
        programBuilder.add(
            createCell("id1", 1, "print(1)"),
            createCell("id2", 2, "print(2)"),
            badCell,
        );
        let code = programBuilder.buildTo("idE", TEST_KERNEL_ID, 3).text;
        expect(code).to.equal(["print(1)", "print(2)", "print(bad_name)", ""].join("\n"));
    });

    /* Sometimes, a cell might not throw an error, but our parser might choke. This shouldn't
     * crash the entire program---just skip it if it can't parse. */
    it('skips cells that fail to parse', () => {
        let badCell = createCell("idE", 2, "causes_syntax_error(");

        // Hide console output from parse errors.
        let oldConsoleLog = console.log;
        console.log = () => {};

        programBuilder.add(
            createCell("id1", 1, "print(1)"),
            badCell,
            createCell("id3", 3, "print(3)")
        );

        // Restore console output.
        console.log = oldConsoleLog;

        let code = programBuilder.buildTo("id3", TEST_KERNEL_ID, 3).text;
        expect(code).to.equal(["print(1)", "print(3)", ""].join("\n"));
    });

    it('skips cells that were executed with different kernels', () => {
        programBuilder.add(
            createCellWithKernelId("id1", "kernel-1", 1, "print(1)"),
            createCellWithKernelId("id2", "kernel-2", 2, "print(2)"),
            createCellWithKernelId("id3", "kernel-1", 3, "print(3)")
        );
        let code = programBuilder.buildTo("id3", "kernel-1", 3).text;
        expect(code).to.equals(["print(1)", "print(3)", ""].join("\n"));
    });

    it('constructs a tree for the program', () => {
        programBuilder.add(
            createCell("id1", 1, "print(1)"),
            createCell("id2", 2, "print(2)")
        )
        let tree = programBuilder.buildTo("id2", TEST_KERNEL_ID, 2).tree;
        expect(tree.code.length).to.equal(2);
    });

    it('adjusts the node locations', () => {
        programBuilder.add(
            createCell("id1", 1, "print(1)"),
            createCell("id2", 2, "print(2)")
        )
        let tree = programBuilder.buildTo("id2", TEST_KERNEL_ID, 2).tree;
        expect(tree.code[0].location.first_line).to.equal(1);
        expect(tree.code[1].location.first_line).to.equal(2);
    });

    it('annotates tree nodes with cell ID info', () => {
        programBuilder.add(
            createCell("id1", 2, "print(1)")
        );
        let tree = programBuilder.buildTo("id1", TEST_KERNEL_ID, 2).tree;
        expect(tree.code[0].cellPersistentId).to.equal("id1");
        expect(tree.code[0].executionCount).to.equal(2);
    });
});