import { AbstractOutputterCell } from "../packages/cell";
import { CodeCell, OutputArea, notebook, Cell } from 'base/js/namespace';

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
export class NotebookCell extends AbstractOutputterCell<OutputArea> {

    constructor(model: CodeCell) {
        super();
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

    get gathered(): boolean {
        if (this._model.metadata && this._model.metadata.gathered) {
            return this._model.metadata.gathered;
        }
        return false;
    }

    copy(): NotebookCell {
        return new NotebookCell(copyCodeCell(this._model));
    }

    toJSON(): any {
        let baseJson = super.toJSON();
        baseJson.output = getCellOutputLogData(this.output);
    }

    is_cell: boolean = true;
    is_outputter_cell: boolean = true;
    private _model: CodeCell;
}

/**
 * Get the JSON for a Jupyter notebook internal representation of an output area.
 */
function getCellOutputLogData(outputArea: OutputArea) {
    // TODO: consider checking for HTML tables.
    let outputData = [];
    if (outputArea && outputArea.outputs && outputArea.outputs.length > 0) {
        for (let output of outputArea.outputs) {
            let type = output.output_type;
            let mimeTags: string[] = [];
            let data = output.data;
            if (data && Object.keys(data)) {
                mimeTags = Object.keys(data);
            }
            outputData.push({ type, mimeTags });
        }
    }
}

/**
 * Convert from Jupyter notebook's internal cell representation to an unsensitized summary
 * of the cell's contents.
 */
export function nbCellToJson(cell: Cell): any {
    if (cell instanceof CodeCell) {
        return {
            type: "code",
            id: cell.cell_id,
            executionCount: cell.input_prompt_number,
            lineCount: cell.code_mirror.getValue().split("\n").length,
            gathered: cell.metadata && cell.metadata.gathered,
            output: getCellOutputLogData(cell.output_area)
        }
    } else if (cell instanceof Cell) {
        return {
            type: "other",
            id: cell.cell_id,
            executionCount: null,
            lineCount: cell.code_mirror.getValue().split("\n").length,
            gathered: cell.metadata && cell.metadata.gathered
        }
    }
}