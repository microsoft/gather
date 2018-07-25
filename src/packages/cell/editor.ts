/**
 * Helpers for marking up CodeMirror editors.
 */
import { ISyntaxNode, ILocation } from "../../parsers/python/python_parser";
import { parse } from '../../parsers/python/python3';
import { DefType, getDefs } from "../../slicing/DataflowAnalysis";
import { StringSet } from "../../slicing/Set";
import { SlicerConfig } from "../../slicing/SlicerConfig";
import { MagicsRewriter } from "../../slicing/MagicsRewriter";

export class MarkerManager {

    private _defMarkers: DefMarker[] = [];

    handleClick(event: MouseEvent) {
        this._defMarkers.forEach((marker) => {
            marker.handleClick(event);
        });
    }

    /**
     * Highlight all of the definitions in an editor.
     */
    highlightDefs(editor: CodeMirror.Editor, cellId: string,
        clickHandler: (cellId: string, selection: ILocation) => void) {

        let doc = editor.getDoc();

        // Remove all the old definition markers for this cell.
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
            let defs = getDefs(statement, { moduleNames: new StringSet() }, new SlicerConfig());
            defs.items.filter((d) => [DefType.ASSIGN, DefType.MUTATION].indexOf(d.type) != -1)
                .forEach((d) => {
                    let defMarker = doc.markText(
                        { line: d.location.first_line - 1, ch: d.location.first_column },
                        { line: d.location.last_line - 1, ch: d.location.last_column },
                        { className: "jp-InputArea-editor-nametext" }
                    );
                    this._defMarkers.push(new DefMarker(
                        defMarker, editor, d.location, statement, cellId, clickHandler
                    ));
                });
        });
    }
}


/**
 * Marker for a variable definition.
 */
export class DefMarker {

    constructor(marker: CodeMirror.TextMarker, editor: CodeMirror.Editor, location: ILocation,
            statement: ISyntaxNode, cellId: string,
            clickHandler: (cellId: string, selection: ILocation) => void) {
        this.marker = marker;
        this.editor = editor;
        this.location = location;
        this.statement = statement;
        this.cellId = cellId;
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
                    this.clickHandler(this.cellId, this.location);
                }
                event.preventDefault();
            }
        }
    }
    
    readonly marker: CodeMirror.TextMarker;
    readonly editor: CodeMirror.Editor;
    readonly location: ILocation;
    readonly statement: ISyntaxNode;
    readonly cellId: string;
    readonly clickHandler: (cellId: string, selection: ILocation) => void;
};