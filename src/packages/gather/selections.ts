import { Def } from "../../slicing/DataflowAnalysis";
import { ICell } from "../cell";
import { SlicedExecution } from "../../slicing/ExecutionSlicer";

/**
 * A def selected in a cell.
 */
export type DefSelection = {
    editorDef: EditorDef,
    cell: ICell
}

/**
 * A slice selected for a def.
 */
export type SliceSelection = {
    defSelection: DefSelection,
    slice: SlicedExecution
}

/**
 * A def located in an editor.
 */
export type EditorDef = {
    editor: CodeMirror.Editor,
    cell: ICell,
    def: Def
}