import { IOutputterCell } from "../packages/cell";
import { ICodeCellModel, CodeCellModel } from "@jupyterlab/cells";
import { IOutputModel } from "@jupyterlab/rendermime";

/**
 * Create a new cell with the same ID and content.
 */
export function copyICodeCellModel(cell: ICodeCellModel): ICodeCellModel {
    return new CodeCellModel({ id: cell.id, cell: cell.toJSON() });
}

/**
 * Implementation of SliceableCell for Jupyter Lab. Wrapper around the ICodeCellModel.
 */
export class LabCell implements IOutputterCell<IOutputModel> {

    constructor(model: ICodeCellModel) {
        this._model = model;
    }
    
    get model(): ICodeCellModel {
        return this._model;
    }

    get id(): string {
        return this._model.id;
    }

    get text(): string {
        return this._model.value.text;
    }

    set text(text: string) {
        this._model.value.text = text;
    }

    get executionCount(): number {
        return this._model.executionCount;
    }

    set executionCount(count: number) {
        this._model.executionCount = count;
    }

    get isCode(): boolean {
        return this._model.type == "code";
    }

    get hasError(): boolean {
        return this.outputs.some(o => o.type === 'error');
    }

    get outputs(): IOutputModel[] {
        let outputs = [];
        if (this._model.outputs) {
            for (let i = 0; i < this._model.outputs.length; i++) {
                outputs.push(this._model.outputs.get(i));
            }
            return outputs;
        }
    }

    copy(): LabCell {
        let clonedModel = copyICodeCellModel(this._model);
        return new LabCell(clonedModel);
    }

    is_outputter_cell: boolean = true;
    private _model: ICodeCellModel;
}