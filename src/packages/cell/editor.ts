/**
 * Helpers for marking up CodeMirror editors.
 */
import { ISyntaxNode, ILocation } from "../../parsers/python/python_parser";
import { parse } from '../../parsers/python/python3';
import { getDefs, DefType } from "../../slicing/DataflowAnalysis";
import { StringSet } from "../../slicing/Set";
import { SlicerConfig } from "../../slicing/SlicerConfig";
import { MagicsRewriter } from "../../slicing/MagicsRewriter";
import { GatherModel, IGatherObserver, GatherEventData, GatherModelEvent, EditorDef } from "../gather";
import { ICell } from "./model";
import { SlicedExecution } from "../../slicing/ExecutionSlicer";

/**
 * Class for variable definition text.
 */
const DEFINITION_CLASS = "jp-InputArea-editor-nametext";

/**
 * Class for a data dependency.
 */
const DEPENDENCY_CLASS = "jp-InputArea-editor-dependencyline";

/**
 * Resolves cells to active editors in the notebook.
 * Necessary because most of the cell data passed around the notebook are clones with editors
 * that aren't actually active on the page.
 */
export interface CellEditorResolver {
    /**
     * Get the active CodeMirror editor for this cell.
     */
    resolve(cell: ICell): CodeMirror.Editor;
}

/**
 * Adds and manages text markers.
 */
export class MarkerManager implements IGatherObserver {
    /**
     * Construct a new marker manager.
     */
    constructor(model: GatherModel, cellEditorResolver: CellEditorResolver) {
        this._model = model;
        this._model.addObserver(this);
        this._cellEditorResolver = cellEditorResolver;
    }

    private _model: GatherModel;
    private _cellEditorResolver: CellEditorResolver;
    private _defMarkers: DefMarker[] = [];
    private _dependencyLineMarkers: DependencyLineMarker[] = [];

    /**
     * Click-handler---pass on click event to markers.
     */
    handleClick(event: MouseEvent) {
        this._defMarkers.forEach((marker) => {
            marker.handleClick(event);
        });
    }

    /**
     * Listen for changes to the gather model.
     */
    onModelChange(eventType: GatherModelEvent, eventData: GatherEventData, model: GatherModel) {
        // When a cell is executed, search for definitions.
        if (eventType == GatherModelEvent.CELL_EXECUTED) {
            let cell = eventData as ICell;
            let editor = this._cellEditorResolver.resolve(cell);
            if (editor) {
                this.findDefs(editor, cell);
            }
        }
        // When definitions are found, highlight them.
        if (eventType == GatherModelEvent.EDITOR_DEF_FOUND) {
            let editorDef = eventData as EditorDef;
            this.highlightDef(editorDef);
        }
        // When the chosen slices change, update which lines are highlighted in the document.
        if (eventType == GatherModelEvent.SLICE_SELECTED || eventType == GatherModelEvent.SLICE_DESELECTED) {
            this._clearDependencyLineMarkers();
            model.selectedSlices.forEach((sliceSelection) => {
                this.highlightDependencies(sliceSelection.slice);
            });
        }
    }

    highlightDef(editorDef: EditorDef) {
        let editor = editorDef.editor;
        let def = editorDef.def;
        let doc = editor.getDoc();
        let defMarker = doc.markText(
            { line: def.location.first_line - 1, ch: def.location.first_column },
            { line: def.location.last_line - 1, ch: def.location.last_column },
            { className: DEFINITION_CLASS }
        );
        let defSelection = { editorDef: editorDef, cell: editorDef.cell };
        let clickHandler = (_: ICell, __: ILocation, selected: boolean) => {
            if (selected) {
                this._model.selectDef(defSelection);
            } else {
                this._model.deselectDef(defSelection);
            }
        };
        this._defMarkers.push(new DefMarker(
            defMarker, editor, def.location, def.statement, editorDef.cell, clickHandler));
    }

    /**
     * Highlight all of the definitions in an editor.
     */
    findDefs(editor: CodeMirror.Editor, cell: ICell) {

        // Clear all the old definition markers for this cell.
        this._defMarkers = this._defMarkers.filter((dm) => dm.editor != editor);

        // Clean up the code of magics.
        let code = editor.getValue();
        let rewriter = new MagicsRewriter();
        let cleanedCode = rewriter.rewrite(code);

        // Parse the code, get the statements.
        const ast = parse(cleanedCode + "\n");
        let statements = [];
        if (ast && ast.code && ast.code.length) {
            statements = ast.code;
        } else {
            statements = [ast.code];
        }

        // Add marker for all of the definitions in the code.
        statements.forEach((statement: ISyntaxNode) => {
            getDefs(statement, { moduleNames: new StringSet() }, new SlicerConfig())
            .items.filter((d) => [DefType.ASSIGN, DefType.MUTATION].indexOf(d.type) != -1)
            .forEach((def) => {
                this._model.addEditorDef({ def: def, editor: editor, cell: cell });
            });
        });
    }

    /**
     * Highlight dependencies in a cell at a set of locations. 
     */
    highlightDependencies(slice: SlicedExecution) {
        slice.cellSlices.forEach((cellSlice) => {
            let cell = cellSlice.cell;
            let sliceLocations = cellSlice.slice;
            let editor = this._cellEditorResolver.resolve(cell);
            if (editor) {
                sliceLocations.items.forEach((loc) => {
                    for (let lineNumber = loc.first_line - 1; lineNumber <= loc.last_line -1; lineNumber++) {
                        let lineHandle = editor.addLineClass(lineNumber, "background", DEPENDENCY_CLASS);
                        this._dependencyLineMarkers.push({ editor: editor, lineHandle: lineHandle });
                    }
                });
            }
        });
    }

    private _clearDependencyLineMarkers() {
        this._dependencyLineMarkers.forEach((marker) => {
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
 * Marker for a variable definition.
 */
export class DefMarker {

    constructor(marker: CodeMirror.TextMarker, editor: CodeMirror.Editor, location: ILocation,
            statement: ISyntaxNode, cell: ICell,
            clickHandler: (cell: ICell, selection: ILocation, selected: boolean) => void) {
        this.marker = marker;
        this.editor = editor;
        this.location = location;
        this.statement = statement;
        this.cell = cell;
        this.clickHandler = clickHandler;
    }

    handleClick(event: MouseEvent) {
        let editor = this.editor;
        if (editor.getWrapperElement().contains(event.target as Node)) {
            let clickPosition: CodeMirror.Position = editor.coordsChar(
                { left: event.clientX, top: event.clientY });
            let editorMarkers = editor.getDoc().findMarksAt(clickPosition);
            if (editorMarkers.indexOf(this.marker) != -1) {
                if (this.clickHandler) {
                    this.selected = !this.selected;
                    this.clickHandler(this.cell, this.location, this.selected);
                }
                event.preventDefault();
            }
        }
    }
    
    selected: boolean = false;
    readonly marker: CodeMirror.TextMarker;
    readonly editor: CodeMirror.Editor;
    readonly location: ILocation;
    readonly statement: ISyntaxNode;
    readonly cell: ICell;
    readonly clickHandler: (cell: ICell, selection: ILocation, selected: boolean) => void;
};