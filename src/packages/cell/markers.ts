/**
 * Helpers for marking up CodeMirror editors.
 */
import { ISyntaxNode, ILocation } from "../../parsers/python/python_parser";
import { SymbolType, Ref } from "../../slicing/DataflowAnalysis";
import { GatherModel, IGatherObserver, GatherEventData, GatherModelEvent, EditorDef, DefSelection, OutputSelection } from "../gather";
import { ICell } from "./model";
import { SlicedExecution } from "../../slicing/ExecutionSlicer";
import { log } from "../../utils/log";
import { LineHandle } from "../../../node_modules/@types/codemirror";
import { CellProgram } from "../../slicing/ProgramBuilder";

/**
 * Class for a highlighted, clickable output.
 */
const OUTPUT_HIGHLIGHTED_CLASS = "jp-OutputArea-highlighted";

/**
 * Class for a selected output.
 */
const OUTPUT_SELECTED_CLASS = "jp-OutputArea-selected";

/**
 * Class for variable definition text.
 */
const DEFINITION_CLASS = "jp-InputArea-editor-nametext";

/**
 * Class for selected variable definition text.
 */
const DEFINITION_SELECTED_CLASS = "jp-InputArea-editor-nametext-selected";

/**
 * Class for a line holding a variable definition.
 */
const DEFINITION_LINE_SELECTED_CLASS = "jp-InputArea-editor-nameline-selected";

/**
 * Class for a data dependency.
 */
const DEPENDENCY_CLASS = "jp-InputArea-editor-dependencyline";

/**
 * Resolves cells to active editors in the notebook.
 * Necessary because most of the cell data passed around the notebook are clones with editors
 * that aren't actually active on the page.
 */
export interface ICellEditorResolver {
    /**
     * Get the active CodeMirror editor for this cell.
     */
    resolve(cell: ICell): CodeMirror.Editor;

    /**
     * Additionally filter to make sure the execution count matches.
     * (Don't call this right after a cell execution event, as it takes a while for the
     * execution count to update in an executed cell).
     */
    resolveWithExecutionCount(cell: ICell): CodeMirror.Editor;
}

/**
 * Resolves cells to their program information (parse tree, definitions, etc.)
 * This makes sure we don't have to do any parsing / dataflow analysis within
 * this display module.
 */
export interface ICellProgramResolver {
    resolve(cell: ICell): CellProgram;
}

/**
 * Resolves cells to the HTML elements for their outputs.
 */
export interface ICellOutputResolver {
    /**
     * Get the divs containing output for this cell.
     * Currently, we recommend implementations don't pay attention to the execution
     * count, but just get the outputs for a cell with an ID.
     */
    resolve(cell: ICell): HTMLElement[];
}

/**
 * Adds and manages text markers.
 */
export class MarkerManager implements IGatherObserver {
    /**
     * Construct a new marker manager.
     */
    constructor(model: GatherModel, cellProgramResolver: ICellProgramResolver,
            cellEditorResolver: ICellEditorResolver,
            cellOutputResolver: ICellOutputResolver) {
        this._model = model;
        this._model.addObserver(this);
        this._cellProgramResolver = cellProgramResolver;
        this._cellEditorResolver = cellEditorResolver;
        this._cellOutputResolver = cellOutputResolver;
    }

    private _model: GatherModel;
    private _cellProgramResolver: ICellProgramResolver;
    private _cellEditorResolver: ICellEditorResolver;
    private _cellOutputResolver: ICellOutputResolver;
    private _defMarkers: DefMarker[] = [];
    private _defLineHandles: DefLineHandle[] = [];
    private _outputMarkers: OutputMarker[] = [];
    private _dependencyLineMarkers: DependencyLineMarker[] = [];

    /**
     * Click-handler---pass on click event to markers.
     */
    handleClick(event: MouseEvent) {
        this._defMarkers.forEach(marker => {
            marker.handleClick(event);
        });
    }

    /**
     * Listen for changes to the gather model.
     */
    onModelChange(eventType: GatherModelEvent, eventData: GatherEventData, model: GatherModel) {

        // When a cell is executed, search for definitions and output.
        if (eventType == GatherModelEvent.CELL_EXECUTED) {
            let cell = eventData as ICell;
            this.clearSelectablesForCell(cell);
            let editor = this._cellEditorResolver.resolve(cell);
            if (editor) {
                this.highlightDefs(editor, cell);
            }
            let outputElements = this._cellOutputResolver.resolve(cell);
            this.highlightOutputs(cell, outputElements);
        }

        // When a cell is deleted or edited, delete all of its def markers.
        if (eventType == GatherModelEvent.CELL_DELETED || eventType == GatherModelEvent.CELL_EDITED) {
            let cell = eventData as ICell;
            this.clearSelectablesForCell(cell);
        }

        // When definitions are found, highlight them.
        if (eventType == GatherModelEvent.EDITOR_DEF_FOUND) {
            let editorDef = eventData as EditorDef;
            this.highlightDef(editorDef);
        }

        // When definitions are removed from the model, deselect and remove their markers.
        if (eventType == GatherModelEvent.EDITOR_DEF_REMOVED) {
            let editorDef = eventData as EditorDef;
            for (let i = this._defMarkers.length - 1; i >= 0; i--) {
                let defMarker = this._defMarkers[i];
                if (defMarker.def == editorDef.def) {
                    let defsToDeselect = this._model.selectedDefs.filter(d => d.editorDef == editorDef);
                    for (let defToDeselect of defsToDeselect) {
                        this._model.deselectDef(defToDeselect);
                    }
                    defMarker.marker.clear();
                    this._defMarkers.splice(i, 1);
                }
            }
        }

        // Whenever a definition is selected, add a marker to its line.
        if (eventType == GatherModelEvent.DEF_SELECTED) {
            let defSelection = eventData as DefSelection;
            let editor = defSelection.editorDef.editor;
            let def = defSelection.editorDef.def;
            let lineHandle = editor.addLineClass(
                def.location.first_line - 1, "background", DEFINITION_LINE_SELECTED_CLASS
            );
            this._defLineHandles.push({ def: def, lineHandle: lineHandle });
        }

        // Whenever a definition is deselected from outside, unhighlight it.
        if (eventType == GatherModelEvent.DEF_DESELECTED) {
            let defSelection = eventData as DefSelection;
            this._defMarkers.filter(marker => {
                return defSelection.editorDef.def.location == marker.location &&
                    defSelection.cell.id == marker.cell.id;
            }).forEach(marker => marker.deselect());

            let editorDef = defSelection.editorDef;
            for (let i = this._defLineHandles.length - 1; i >= 0; i--) {
                let defLineHandle = this._defLineHandles[i];
                if (defLineHandle.def == editorDef.def) {
                    editorDef.editor.removeLineClass(
                        defLineHandle.lineHandle, "background", DEFINITION_LINE_SELECTED_CLASS);
                }
            }
        }

        // Whenever an output is deselected from outside, unhighlight it.
        if (eventType == GatherModelEvent.OUTPUT_DESELECTED) {
            let outputSelection = eventData as OutputSelection;
            this._outputMarkers.filter(marker => {
                return marker.outputIndex == outputSelection.outputIndex &&
                    marker.cell.id == outputSelection.cell.id;
            }).forEach(marker => marker.deselect());
        }

        // When the chosen slices change, update which lines are highlighted in the document.
        if (eventType == GatherModelEvent.SLICE_SELECTED || eventType == GatherModelEvent.SLICE_DESELECTED) {
            this._clearDependencyLineMarkers();
            model.selectedSlices.forEach(sliceSelection => {
                this.highlightDependencies(sliceSelection.slice);
            });
        }
    }

    highlightDef(editorDef: EditorDef) {

        let editor = editorDef.editor;
        let def = editorDef.def;
        let doc = editor.getDoc();

        // Add marker for the definition symbol.
        let marker = doc.markText(
            { line: def.location.first_line - 1, ch: def.location.first_column },
            { line: def.location.last_line - 1, ch: def.location.last_column },
            { className: DEFINITION_CLASS }
        );
        let defSelection = new DefSelection({ editorDef: editorDef, cell: editorDef.cell });
        let clickHandler = (_: ICell, __: ILocation, selected: boolean) => {
            if (selected) {
                this._model.selectDef(defSelection);
            } else {
                this._model.deselectDef(defSelection);
            }
        };
        this._defMarkers.push(new DefMarker(
            marker, editor, def, def.location, def.statement, editorDef.cell, clickHandler));
    }

    /**
     * Clear all def markers that belong to this editor.
     */
    clearSelectablesForCell(cell: ICell) {
        this._model.removeEditorDefsForCell(cell.id);
        this._model.deselectOutputsForCell(cell.id);
    }

    /**
     * Highlight all of the definitions in an editor.
     */
    highlightDefs(editor: CodeMirror.Editor, cell: ICell) {
        let cellProgram = this._cellProgramResolver.resolve(cell);
        if (!cellProgram.hasError) {
            for (let ref of cellProgram.defs) {
                if (ref.type == SymbolType.VARIABLE) {
                    this._model.addEditorDef({ def: ref, editor: editor, cell: cell });
                }
            }
        }
        log("Highlighted definitions", { numActive: this._defMarkers.length });
    }

    /**
     * Highlight a list of output elements.
     */
    highlightOutputs(cell: ICell, outputElements: HTMLElement[]) {
        for (let i = 0; i < outputElements.length; i++) {
            let outputElement = outputElements[i];
            let outputSelection = { outputIndex: i, cell };
            let outputMarker = new OutputMarker(outputElement, i, cell, selected => {
                if (selected) {
                    this._model.selectOutput(outputSelection);
                } else {
                    this._model.deselectOutput(outputSelection);
                }
            });
            this._outputMarkers.push(outputMarker);
        }
        log("Highlighted outputs", { numActive: this._outputMarkers.length });
    }

    /**
     * Highlight dependencies in a cell at a set of locations. 
     */
    highlightDependencies(slice: SlicedExecution) {
        let defLines: number[] = [];
        slice.cellSlices.forEach(cellSlice => {
            let cell = cellSlice.cell;
            let sliceLocations = cellSlice.slice;
            let editor = this._cellEditorResolver.resolveWithExecutionCount(cell);

            if (editor) {
                let numLines = 0;
                // Batch the highlight operations for each cell to spend less time updating cell height.
                editor.operation(() => {
                    sliceLocations.items.forEach(loc => {
                        for (let lineNumber = loc.first_line - 1; lineNumber <= loc.last_line -1; lineNumber++) {
                            numLines += 1;
                            let lineHandle = editor.addLineClass(lineNumber, "background", DEPENDENCY_CLASS);
                            this._dependencyLineMarkers.push({ editor: editor, lineHandle: lineHandle });
                        }
                    });
                    defLines.push(numLines);
                });
            }
        });
        log("Added lines for defs (may be overlapping)", { defLines });
    }

    private _clearDependencyLineMarkers() {
        log("Cleared all dependency line markers");
        this._dependencyLineMarkers.forEach(marker => {
            marker.editor.removeLineClass(marker.lineHandle, "background", DEPENDENCY_CLASS);
        })
        this._dependencyLineMarkers = [];
    }
}

type DependencyLineMarker = {
    editor: CodeMirror.Editor,
    lineHandle: CodeMirror.LineHandle
}

/**
 * Marker for an output.
 */
class OutputMarker {

    constructor(outputElement: HTMLElement, outputIndex: number, cell: ICell,
            onToggle: (selected: boolean) => void) {
        this._element = outputElement;
        this._element.classList.add(OUTPUT_HIGHLIGHTED_CLASS);
        this.outputIndex = outputIndex;
        this.cell = cell;
        this._onToggle = onToggle;

        this._element.onclick = (_: MouseEvent) => {
            if (this._onToggle) {
                this.toggleSelected();
                this._onToggle(this._selected);
            }
            log("Clicked on output area", { outputIndex, cell, toggledOn: this._selected });
        }
    }

    toggleSelected() {
        if (this._selected) this.deselect();
        else if (!this._selected) this.select();
    }

    select() {
        this._selected = true;
        this._element.classList.add(OUTPUT_SELECTED_CLASS);
    }

    deselect() {
        this._selected = false;
        this._element.classList.remove(OUTPUT_SELECTED_CLASS);
    }
    
    readonly outputIndex: number;
    readonly cell: ICell;
    private _element: HTMLElement;
    private _onToggle: (selected: boolean) => void;
    private _selected: boolean = false;
}

/**
 * Line handle for a definition line.
 */
type DefLineHandle = {
    def: Ref;
    lineHandle: LineHandle;
}

/**
 * Marker for a variable definition.
 */
class DefMarker {

    constructor(marker: CodeMirror.TextMarker, editor: CodeMirror.Editor, def: Ref, location: ILocation,
            statement: ISyntaxNode, cell: ICell,
            clickHandler: (cell: ICell, selection: ILocation, selected: boolean) => void) {
        this.marker = marker;
        this.def = def;
        this.editor = editor;
        this.location = location;
        this.statement = statement;
        this.cell = cell;
        this.clickHandler = clickHandler;
    }

    handleClick(event: MouseEvent) {
        console.log("In handleClick");
        let editor = this.editor;
        if (editor.getWrapperElement().contains(event.target as Node)) {
            // In Chrome, if you click in the top of an editor's text area, it will trigger this
            // event, and is considered as a click at the start of the box. This filter for
            // span elements filters out those spurious clicks.
            if ((event.target as HTMLElement).tagName != "SPAN") return;
            let clickPosition: CodeMirror.Position = editor.coordsChar(
                { left: event.clientX, top: event.clientY });
            let editorMarkers = editor.getDoc().findMarksAt(clickPosition);
            if (editorMarkers.indexOf(this.marker) != -1) {
                if (this.clickHandler) {
                    this.toggleSelected();
                    log("Clicked on definition", { toggledOn: this._selected, cell: this.cell });
                    this.clickHandler(this.cell, this.location, this._selected);
                }
                event.preventDefault();
            }
        }
    }

    toggleSelected() {
        if (this._selected) this.deselect();
        else if (!this._selected) this.select();
    }

    select() {
        this._selected = true;
        let markerPos = this.marker.find();
        this._selectionMarker = this.editor.getDoc().markText(
            markerPos.from, markerPos.to, { className: DEFINITION_SELECTED_CLASS });
    }

    deselect() {
        this._selected = false;
        if (this._selectionMarker) {
            this._selectionMarker.clear();
            this._selectionMarker = undefined;
        }
    }
    
    private _selected: boolean = false;
    private _selectionMarker: CodeMirror.TextMarker = undefined;
    readonly marker: CodeMirror.TextMarker;
    readonly editor: CodeMirror.Editor;
    readonly def: Ref;
    readonly location: ILocation;
    readonly statement: ISyntaxNode;
    readonly cell: ICell;
    readonly clickHandler: (cell: ICell, selection: ILocation, selected: boolean) => void;
};