import { RenderMimeRegistry } from '@jupyterlab/rendermime';
import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { IRevisionModel } from './model';
import { CodeVersion } from '../codeversion';
import { DisplayData } from '../displaydata';
import { CodeEditor } from '@jupyterlab/codeeditor';

/**
 * The class name added to code version widgets
 */
const REVISION_CLASS = 'jp-Revision';

/**
 * A widget for showing revision of an execution.
 */
export class Revision extends Widget {
    /**
     * Construct a revision.
     */
    constructor(options: Revision.IOptions) {
        super();
        this.addClass(REVISION_CLASS);
        let model = (this.model = options.model);
        let rendermime = (this.rendermime = options.rendermime);
        let editorFactory = (this.editorFactory = options.editorFactory);

        let layout = (this.layout = new PanelLayout());
        layout.addWidget(new DisplayData({
            model: model.result,
            rendermime: rendermime
        }));
        layout.addWidget(new CodeVersion({
            model: model.source,
            editorFactory: editorFactory
        }));
    }

    /**
     * The model used by the widget.
     */
    readonly model: IRevisionModel;

    /**
     * The rendermime instance used by the widget.
     */
    readonly rendermime: RenderMimeRegistry;
    
    /**
     * The editor factory instance used by the widget.
     */
    readonly editorFactory: CodeEditor.Factory;
}

/**
 * A namespace for `Revision` statics.
 */
export namespace Revision {
    /**
     * The options used to create a `Revision`.
     */
    export interface IOptions {
        /**
         * The model used by the widget.
         */
        model: IRevisionModel;

        /**
         * The mime renderer for this widget.
         */
        rendermime: RenderMimeRegistry;

        /**
         * Factory for creating editor cells.
         */
        editorFactory: CodeEditor.Factory;
    }
}