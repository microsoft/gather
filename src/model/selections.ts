import { Cell, Ref, SlicedExecution } from "@msrvida/python-program-analysis";

/**
 * A user's selection.
 */
export type UserSelection = DefSelection | OutputSelection;

/**
 * A def selected in a cell.
 * Defined as a class so we can add a toJSON method for logging.
 */
export class DefSelection {
  readonly editorDef: EditorDef;
  readonly cell: Cell;

  constructor(options: { editorDef: EditorDef; cell: Cell }) {
    this.editorDef = options.editorDef;
    this.cell = options.cell;
  }

  toJSON(): any {
    return {
      defType: this.editorDef.def.type,
      defLevel: this.editorDef.def.level,
      cell: this.cell
    };
  }
}

/**
 * A slice selected for a def.
 */
export interface SliceSelection {
  userSelection: UserSelection;
  slice: SlicedExecution;
}

/**
 * A def located in an editor.
 */
export interface EditorDef {
  editor: CodeMirror.Editor;
  cell: Cell;
  def: Ref;
}

/**
 * An output for a cell.
 */
export interface CellOutput {
  outputIndex: number;
  element: HTMLElement;
  cell: Cell;
}

/**
 * An ouput selected for a cell.
 */
export interface OutputSelection {
  outputIndex: number;
  cell: Cell;
}

export function instanceOfOutputSelection(object: any): object is OutputSelection {
  return object && typeof object == "object" && "outputIndex" in object && "cell" in object;
}
