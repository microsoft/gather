import { CodeEditor, CodeEditorWrapper } from '@jupyterlab/codeeditor';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { ISlicedCellModel } from './model';
import { CharacterRange } from '../codeversion';

/**
 * The class name added to sliced cell widgets.
 */
const SLICED_CELL_CLASS = 'jp-SlicedCell';

/**
 * The class name added to diffed sliced cell widgets.
 */
const DIFFED_SLICED_CELL_CLASS = 'jp-DiffedSlicedCell';

/**
 * The class name added to the editor area of a sliced cell.
 */
const SLICED_CELL_EDITOR_CLASS = 'jp-SlicedCell-editor';

/**
 * The class name added to editor text that was changed.
 */
const SLICED_CELL_HIGHLIGHTED_TEXT_CLASS = 'jp-SlicedCell-editor-highlightedtext';

/**
 * The class name added to editor text that should be blurred.
 */
const SLICED_CELL_BLURRED_TEXT_CLASS = 'jp-SlicedCell-editor-blurredtext';

/**
 * The class name added to editor text for hiding lines.
 */
const SLICED_CELL_HIDE_TEXT_CLASS = 'jp-SlicedCell-editor-hidetext';

/**
 * The class name to add to editor text for revealed lines.
 */
const SLICED_CELL_REVEAL_TEXT_CLASS = 'jp-SlicedEditor-editor-revealtext';

/**
 * Number of lines of context to show before and after updated code.
 */
const CONTEXT_SIZE = 1;

/**
 * A widget for showing a cell with a code slice.
 */
export class SlicedCell extends Widget {
    /**
     * Construct a new sliced cell.
     */
    constructor(options: SlicedCell.IOptions) {
        super();
        this.addClass(SLICED_CELL_CLASS);

        let model = (this.model = options.model);

        this.editorFactory = options.editorFactory;
        let editorOptions = { model, factory: this.editorFactory, config: { readOnly: true }};
        let editor = (this._editor = new CodeEditorWrapper(editorOptions));
        editor.addClass(SLICED_CELL_EDITOR_CLASS);

        let layout = (this.layout = new PanelLayout());
        layout.addWidget(editor);
        this.highlightCode();
    }

    highlightCode() {
        // XXX: Syntax highlighting only appears to work if we wait before applying it.
        // Though some other operations (e.g., marking text) without a delay.
        let codeMirrorEditor: CodeMirror.Editor = (this._editor.editor as CodeMirrorEditor).editor;
        setTimeout(function() {
            codeMirrorEditor.setOption('mode', 'ipython');
        }, 1000);
    }

    /**
     * The model used by the widget.
     */
    readonly model: ISlicedCellModel;

    /**
     * The editor factory instance used by the widget.
     */
    readonly editorFactory: CodeEditor.Factory;

    /**
     * Get the CodeEditorWrapper used by this widget.
     */
    get editorWidget(): CodeEditorWrapper {
        return this._editor;
    }

    /**
     * Get the CodeEditor used by this widget.
     */
    get editor(): CodeEditor.IEditor {
        return this._editor.editor;
    }

    /**
     * Dispose of the resources held by the widget.
     */
    dispose() {
        // Do nothing if already disposed.
        if (this.isDisposed) {
            return;
        }
        this._editor = null;
        super.dispose();
    }

    protected _editor: CodeEditorWrapper = null;
}

/**
 * A widget for showing a cell with a code slice, diff'd to another cell.
 */
export class DiffedSlicedCell extends SlicedCell {
    /**
     * Construct a new diffed sliced cell.
     */
    constructor(options: SlicedCell.IOptions) {

        super(options);
        this.addClass(DIFFED_SLICED_CELL_CLASS);

        let codeMirrorDoc: CodeMirror.Doc = (this._editor.editor as CodeMirrorEditor).doc;

        let linesToShow: Array<number> = new Array<number>();
        this.model.diff.updatedRanges.forEach(function(range: CharacterRange) {

            // Build a list of lines that should be showing in the cell.
            let startPosition: CodeMirror.Position = codeMirrorDoc.posFromIndex(range.start);
            let endPosition: CodeMirror.Position = codeMirrorDoc.posFromIndex(range.end + 1);
            for (let i = startPosition.line - CONTEXT_SIZE; i <= endPosition.line + CONTEXT_SIZE; i++) {
                if (i < codeMirrorDoc.firstLine() || i > codeMirrorDoc.lastLine()) continue;
                if (linesToShow.indexOf(i) == -1) {
                    linesToShow.push(i);
                }
            }

            // Highlight all cell text that was updated in the diff.
            codeMirrorDoc.markText(startPosition, endPosition,
                { className: SLICED_CELL_HIGHLIGHTED_TEXT_CLASS });
        });
        linesToShow.sort(function(a, b) { return a - b; });

        // Blur all text that wasn't changed.
        this.model.diff.sameRanges.forEach(function(range: CharacterRange) {
            codeMirrorDoc.markText(
                codeMirrorDoc.posFromIndex(range.start),
                codeMirrorDoc.posFromIndex(range.end + 1),
                { className: SLICED_CELL_BLURRED_TEXT_CLASS }
            );
        });

        // Make a list of what lines to hide.
        let hiddenLineRanges: Array<[number, number]> = new Array<[number, number]>();
        let hiddenRangeStart: number = -1;
        for (let i = codeMirrorDoc.firstLine(); i <= codeMirrorDoc.lastLine(); i++) {
            if (linesToShow.indexOf(i) == -1 && hiddenRangeStart == -1) {
                hiddenRangeStart = i;
            } else if (linesToShow.indexOf(i) != -1 && hiddenRangeStart != -1) {
                hiddenLineRanges.push([hiddenRangeStart, i]);
                hiddenRangeStart = -1;
            }
        }
        if (hiddenRangeStart != -1) {
            hiddenLineRanges.push([hiddenRangeStart, codeMirrorDoc.lastLine() + 1]);
        }
        
        let revealMarkers: Array<CodeMirror.TextMarker> = new Array<CodeMirror.TextMarker>();
        let editor: CodeMirror.Editor = (this._editor.editor as CodeMirrorEditor).editor;

        // Hide all of the hidden lines.
        let hideRange = function(from: CodeMirror.Position, to: CodeMirror.Position) {
            let replacement: HTMLElement = document.createElement('span');
            replacement.classList.add(SLICED_CELL_HIDE_TEXT_CLASS);
            replacement.textContent = "... click to show hidden lines ...";
            let hideMarker: CodeMirror.TextMarker = codeMirrorDoc.markText(from, to, { replacedWith: replacement });
            // When someone clicks on a hidden line, reveal it.
            replacement.onclick = function(event: MouseEvent) {
                hideMarker.clear();
                // If we don't refresh the editor, some of the hidden code might not get shown.
                editor.refresh();
                // Add a marker to the revealed code, so we can hide it again.
                let revealMarker: CodeMirror.TextMarker = codeMirrorDoc.markText(
                    from, to, { className: SLICED_CELL_REVEAL_TEXT_CLASS });
                revealMarkers.push(revealMarker);
                // This prevents the event by getting handled by the editor, which might detect
                // this as a click on the `revealMarker` and hide the text again.
                event.stopPropagation();
            }
        };
        hiddenLineRanges.forEach(function(lineRange: [number, number]) {
            hideRange({ line: lineRange[0], ch: 0 }, { line: lineRange[1], ch: 0 });
        });

        // Whenever someone clicks on hidden lines that were revealed, hide them again.
        editor.getWrapperElement().onclick = function(event: MouseEvent) {
            let clickPosition: CodeMirror.Position = editor.coordsChar({ left: event.clientX, top: event.clientY });
            for (let marker of editor.getDoc().findMarksAt(clickPosition)) {
                let markerIndex = revealMarkers.indexOf(marker);
                if (markerIndex != -1) {
                    let range = marker.find();
                    marker.clear();
                    revealMarkers.splice(markerIndex, 1);
                    hideRange(range.from, range.to);
                }
            }
        }

        // TODO(andrewhead): set this as a configuration parameter.
        // If there is no new code in this cell, hide it.
        if (linesToShow.length == 0) {
            // this.hide();
        }
    }
}

/**
 * A namespace for `SlicedCell` statics.
 */
export namespace SlicedCell {
    /**
     * The options used to create a `SlicedCell`.
     */
    export interface IOptions {
        /**
         * The model used by the widget.
         */
        model: ISlicedCellModel;
        
        /**
         * Factory for creating editor cells.
         */
        editorFactory: CodeEditor.Factory;
    }
}