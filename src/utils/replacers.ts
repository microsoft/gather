import { instanceOfDefSelection } from "../packages/gather";
import { instanceOfICell } from "../packages/cell";


/**
 * Interface for replacing objects with other objects when serializing objects for logs.
 */
export interface IReplacer {
    /**
     * Replace the object at this key and value with a new object.
     * If this shouldn't replace the value, it needs to return the value.
     */
    replace(key: string, value: any): any;
}

/**
 * Replaces cell objects with unsensitive cell information.
 */
export class CellReplacer implements IReplacer {
    /**
     * Check if a value is a cell---if so, replace it with a simplified, personal information-
     * free representation of that cell.
     */
    replace(_: string, value: any): any {
        if (instanceOfICell(value)) {
            return {
                id: value.id,
                executionCount: value.executionCount,
                lineCount: value.text.split("\n").length,
                isCode: value.isCode,
                hasError: value.hasError,
            }
        }
        return value;
    }
}

/**
 * Replaces def selections with bare information.
 */
export class DefSelectionReplacer implements IReplacer {
    replace(_: string, value: any) {
        if (instanceOfDefSelection(value)) {
            return {
                defType: value.editorDef.def.type,
                defLevel: value.editorDef.def.level,
                cell: value.cell
            }
        }
        return value;
    }
}