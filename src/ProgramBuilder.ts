import { ICodeCellModel } from "@jupyterlab/cells";

/**
 * Builds programs from a list of executed cells.
 */
export class ProgramBuilder {

    /**
     * Construct a program builder.
     */
    constructor() {
        this._cells = [];
    }

    /**
     * Add cells to the program builder.
     */
    add(...cells: ICodeCellModel[]) {
        this._cells.push(...cells);
    }

    /**
     * Build a program from the list of cells. Program will include the cells' contents in
     * execution order. It will omit cells that raised errors (syntax or runtime).
     */
    buildTo(cellId: string): string {
        let lastCell = this._cells
        .filter((cell) => cell.id == cellId)
        .sort((cell1, cell2) => cell1.executionCount - cell2.executionCount).pop();

        return this._cells
        .filter((cell) => cell.executionCount != null && cell.executionCount <= lastCell.executionCount)
        .filter((cell) => {
            // Don't include any cells that have caused an error.
            if (cell.outputs) {
                for (let outputIndex = 0; outputIndex < cell.outputs.length; outputIndex++) {
                    let output = cell.outputs.get(outputIndex);
                    if (output.type == "error") return false;
                }
            }
            return true;
        })
        .sort((cell1, cell2) => cell1.executionCount - cell2.executionCount)
        .map((cell) => cell.value.text)
        .join("\n");
    }

    build(): string {
        let lastCell = this._cells
        .filter((cell) => cell.executionCount != null)
        .sort((cell1, cell2) => cell1.executionCount - cell2.executionCount).pop();
        return this.buildTo(lastCell.id);
    }

    private _cells: ICodeCellModel[];
}