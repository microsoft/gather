import { IOutputterCell } from "../packages/cell";
// import { ICodeCellModel, CodeCellModel } from "@jupyterlab/cells";
import { CodeCell, Output } from 'base/js/namespace'; // also import: "Output"

/**
 * Create a new cell with the same ID and content.
 */
/*
export function copyICodeCellModel(cell: ICodeCellModel): ICodeCellModel {
    // For notebook implementation, replace the LabCell types with NotebookCell types.
    return new CodeCellModel({ id: cell.id, cell: cell.toJSON() });
}
*/

/**
 * Implementation of SliceableCell for Jupyter Lab. Wrapper around the ICodeCellModel.
 */
export class NotebookCell implements IOutputterCell<Output> {

    constructor(model: CodeCell) {
        this._model = model;
    }
    
    get model(): CodeCell {
        return this._model;
    }

    get id(): string {
        return this._model.cell_id;
    }

    get text(): string {
        return this._model.code_mirror.getValue();
    }

    set text(text: string) {
        // TODO: implement
        // this._model.code_mirror.val = text;
    }

    get executionCount(): number {
        return this._model.input_prompt_number;
    }

    set executionCount(count: number) {
        this._model.input_prompt_number = count;
    }

    get isCode(): boolean {
        return this._model.cell_type == "code";
    }

    get hasError(): boolean {
        // TODO: implement.
        // return this.outputs.some(o => o.type === 'error');
        return false;
    }

    get outputs(): Output[] {
        if (this._model.output_area) {
            return this._model.output_area.outputs;
        } else {
            return undefined;
        }
    }

    copy(): NotebookCell {
        // TODO: do a better job of this copy. At the list, code mirror shouldn't be shared.
        return new NotebookCell({
            cell_id: this._model.cell_id,
            cell_type: this._model.cell_type,
            input_prompt_number: this._model.input_prompt_number,
            code_mirror: this._model.code_mirror,
            output_area: this._model.output_area,
            notebook: this._model.notebook
        });
    }

    type: "outputter";
    private _model: CodeCell;
}