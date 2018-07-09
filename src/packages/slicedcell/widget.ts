import { CodeEditor, CodeEditorWrapper } from '@jupyterlab/codeeditor';
import { CodeMirrorEditorFactory, CodeMirrorEditor } from '@jupyterlab/codemirror';
import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { ISlicedCellModel } from './model';
import { CharacterRange } from '../codeversion';

/**
 * The class name added to sliced cell widgets.
 */
const SLICED_CELL_CLASS = 'jp-SlicedCell';

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

        this.contentFactory = options.contentFactory || SlicedCell.defaultContentFactory;
        this.editorFactory = options.editorFactory || this.contentFactory.editorFactory;

        let editorOptions = { model, factory: this.editorFactory, config: { readOnly: true }};
        let editor = (this._editor = new CodeEditorWrapper(editorOptions));
        editor.addClass(SLICED_CELL_EDITOR_CLASS);

        let layout = (this.layout = new PanelLayout());
        layout.addWidget(editor);

        let codeMirrorEditor: CodeMirror.Editor = (editor.editor as CodeMirrorEditor).editor;
        let codeMirrorDoc: CodeMirror.Doc = (editor.editor as CodeMirrorEditor).doc;

        // XXX: Syntax highlighting only appears to work if we wait before applying it.
        // Though some other operations (e.g., marking text) without a delay.
        setTimeout(function() {
            codeMirrorEditor.setOption('mode', 'ipython');
        }, 1000);

        let linesToShow: Array<number> = new Array<number>();
        this.model.diff.updatedRanges.forEach(function(range: CharacterRange) {

            // Build a list of lines that should be showing in the cell.
            let startPosition: CodeMirror.Position = codeMirrorDoc.posFromIndex(range.start);
            let endPosition: CodeMirror.Position = codeMirrorDoc.posFromIndex(range.end + 1);
            for (let i = startPosition.line - CONTEXT_SIZE; i < endPosition.line + CONTEXT_SIZE; i++) {
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
        
        // Hide the lines that should be hidden.
        hiddenLineRanges.forEach(function(lineRange: [number, number]) {
            let replacement = document.createElement('span');
            replacement.textContent = "...";
            replacement.classList.add(SLICED_CELL_BLURRED_TEXT_CLASS);
            codeMirrorDoc.markText(
                { line: lineRange[0], ch: 0 },
                { line: lineRange[1], ch: 0 },
                { collapsed: true, replacedWith: replacement }
            )
        });

        // If there is no new code in this cell, hide it.
        if (linesToShow.length == 0) {
            this.hide();
        }
    }

    /**
     * The model used by the widget.
     */
    readonly model: ISlicedCellModel;

    /**
     * The content factory used by the widget.
     */
    readonly contentFactory: SlicedCell.IContentFactory;

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

    private _editor: CodeEditorWrapper = null;
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
         * The content factory used by the widget to create children.
         */
        contentFactory?: IContentFactory;

        /**
         * Factory for creating editor cells.
         */
        editorFactory: CodeEditor.Factory;
    }

    /**
     * A content factory for the widget.
     * 
     * The content factory is used to create children in a way that can be customized.
     */
    export interface IContentFactory {
        /**
         * The editor factory we need to include in `CodeEditorWrapper.IOptions`
         */
        readonly editorFactory: CodeEditor.Factory;
    }

    /** 
     * Default implementation of `IContentFactory`.
     */
    export class ContentFactory implements IContentFactory {
        /**
         * Constructs a `ContentFactory`
         */
        constructor(options: ContentFactory.IOptions) {
            this._editorFactory = options.editorFactory || defaultEditorFactory;
        }

        /**
         * Return the `CodeEditor.Factory` being used.
         */
        get editorFactory(): CodeEditor.Factory {
            return this._editorFactory;
        }

        private _editorFactory: CodeEditor.Factory = null;
    }

    /**
     * A namespace for the code version content factory.
     */
    export namespace ContentFactory {
        /**
         * Options for the content factory.
         */
        export interface IOptions {
            /**
             * The editor factory used by the content factory.
             */
            editorFactory?: CodeEditor.Factory;
        }
    }

    /**
     * A function to create the default CodeMirror editor factory.
     */
    function _createDefaultEditorFactory(): CodeEditor.Factory {
        let editorServices = new CodeMirrorEditorFactory({});
        return editorServices.newInlineEditor;
    }

    /**
     * The default editor factory singleton based on CodeMirror.
     */
    export const defaultEditorFactory: CodeEditor.Factory = _createDefaultEditorFactory();

    /**
     * The default `ContentFactory` instance.
     */
    export const defaultContentFactory = new ContentFactory({});

}