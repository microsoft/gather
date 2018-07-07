import { CodeEditor, CodeEditorWrapper } from '@jupyterlab/codeeditor';
import { CodeMirrorEditorFactory, CodeMirrorEditor } from '@jupyterlab/codemirror';
import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { ISlicedCellModel } from './model';
// import 'codemirror/mode/python/python';

/**
 * The class name added to sliced cell widgets.
 */
const SLICED_CELL_CLASS = 'jp-SlicedCell';

/**
 * The class name added to the editor area of a sliced cell.
 */
const SLICED_CELL_EDITOR_CLASS = 'jp-SlicedCell-editor';

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

        let editorOptions = { model, factory: this.editorFactory };
        let editor = (this._editor = new CodeEditorWrapper(editorOptions));
        editor.addClass(SLICED_CELL_EDITOR_CLASS);

        let layout = (this.layout = new PanelLayout());
        layout.addWidget(editor);

        // XXX: Syntax highlighting only appears to work if we wait before applying it.
        setTimeout(function() {
            (editor.editor as CodeMirrorEditor).setOption('mode', 'ipython');
        }, 1000);
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
        let editorServices = new CodeMirrorEditorFactory({
            // TODO(andrewhead): remove this theme hard-coding; get from original cells.
            mode: "python",
            theme: "jupyter",
            // readOnly: true
        });
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