import { IOutputterCell } from "../packages/cell";
import { CodeCell, OutputArea, notebook } from 'base/js/namespace';

/**
 * Create a new cell with the same ID and content.
 */
export function copyCodeCell(cell: CodeCell): CodeCell {
    let cellClone = new CodeCell(cell.kernel, {
        config: notebook.config,
        notebook: cell.notebook,
        events: cell.events,
        keyboard_manager: cell.keyboard_manager,
        tooltip: cell.tooltip
    });
    cellClone.fromJSON(cell.toJSON());
    cellClone.cell_id = cell.cell_id;
    return cellClone;
}

/**
 * Implementation of SliceableCell for Jupyter Lab. Wrapper around the ICodeCellModel.
 */
export class NotebookCell implements IOutputterCell<OutputArea> {

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
        this._model.code_mirror.setValue(text);
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
        return this.output.outputs.some(o => o.output_type === 'error');
    }

    get editor(): CodeMirror.Editor {
        return this._model.code_mirror;
    }

    get output(): OutputArea {
        if (this._model.output_area) {
            return this._model.output_area;
        } else {
            return undefined;
        }
    }

    copy(): NotebookCell {
        return new NotebookCell(copyCodeCell(this._model));
    }

    is_outputter_cell: boolean = true;
    private _model: CodeCell;
}