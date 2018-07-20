/**
 * Generic interface for accessing cell data.
 */
export interface ICell {
    id: string;
    executionCount: number;
    hasError: boolean;
    isCode: boolean;
    text: string;
    copy: () => ICell // deep copy if holding a model.
}

/**
 * Type checker for IOutputterCell.
 */
export function instanceOfIOutputterCell<TOutputModel>(object: any): object is IOutputterCell<TOutputModel> {
    return object.type && object.outputs == "outputter";
}

/**
 * Cell interface with data.
 */
export interface IOutputterCell<TOutputModel> extends ICell {
    type: "outputter";
    outputs: TOutputModel[];
}