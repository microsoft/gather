import { CodeEditor, CodeEditorWrapper } from '@jupyterlab/codeeditor';
import { CodeMirrorEditorFactory } from '@jupyterlab/codemirror';
import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { ICodeVersionModel } from './model';

/**
 * The class name added to code version widgets
 */
const CODE_VERSION_CLASS = 'jp-CodeVersion';

/**
 * The class name added to the editor area of a code version.
 */
const CODE_VERSION_EDITOR_CLASS = 'jp-CodeVersion-editor';

/**
 * A widget for showing a version of code.
 */
export class CodeVersion extends Widget {
    /**
     * Construct a new code version.
     */
    constructor(options: CodeVersion.IOptions) {
        super();
        this.addClass(CODE_VERSION_CLASS);
        let model = (this.model = options.model);

        this.contentFactory = options.contentFactory || CodeVersion.defaultContentFactory;
        let editorOptions = { model, factory: this.contentFactory.editorFactory };
        let editor = (this._editor = new CodeEditorWrapper(editorOptions));
        editor.addClass(CODE_VERSION_EDITOR_CLASS);

        let layout = (this.layout = new PanelLayout());
        layout.addWidget(editor);
    }

    /**
     * The model used by the widget.
     */
    readonly model: ICodeVersionModel;

    /**
     * The content factory used by the widget.
     */
    readonly contentFactory: CodeVersion.IContentFactory;

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
 * A namespace for `CodeVersion` statics.
 */
export namespace CodeVersion {
    /**
     * The options used to create a `CodeVersion`.
     */
    export interface IOptions {
        /**
         * The model used by the widget.
         */
        model: ICodeVersionModel;
        
        /**
         * The content factory used by the widget to create children.
         */
        contentFactory?: IContentFactory;
    }

    /**
     * An content factory for the widget.
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
        let editorServices = new CodeMirrorEditorFactory();
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