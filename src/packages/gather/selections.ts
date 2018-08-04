import { Ref } from "../../slicing/DataflowAnalysis";
import { ICell } from "../cell";
import { SlicedExecution } from "../../slicing/ExecutionSlicer";

/**
 * A user's selection.
 */
export type UserSelection =
    DefSelection |
    OutputSelection
    ;

/**
 * A def selected in a cell.
 */
export type DefSelection = {
    editorDef: EditorDef,
    cell: ICell
}
export function instanceOfDefSelection(object: any): object is DefSelection {
    return object && typeof(object) == "object" && "editorDef" in object && "cell" in object;
}

/**
 * A slice selected for a def.
 */
export type SliceSelection = {
    userSelection: UserSelection,
    slice: SlicedExecution
}

/**
 * A def located in an editor.
 */
export type EditorDef = {
    editor: CodeMirror.Editor,
    cell: ICell,
    def: Ref
}

/**
 * An ouput selected for a cell.
 */
export type OutputSelection = {
    outputIndex: number,
    cell: ICell
}
export function instanceOfOutputSelection(object: any): object is OutputSelection {
    return object && typeof(object) == "object" && "outputIndex" in object && "cell" in object;
}