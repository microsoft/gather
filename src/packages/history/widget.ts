import { RenderMimeRegistry } from '@jupyterlab/rendermime';
import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { IHistoryModel } from './model';
import { Revision } from '../revision';
import { CodeEditor } from '@jupyterlab/codeeditor';

/**
 * The class name added to history viewer widgets
 */
const HISTORY_VIEWER_CLASS = 'jp-HistoryViewer';

const HISTORY_VIEWER_ICON_CLASS = 'jp-HistoryViewerIcon';

/**
 * A widget for showing the history of a result and how it was produced.
 */
export class HistoryViewer extends Widget {

    /**
     * Construct a new history viewer.
     */
    constructor(options: HistoryViewer.IOptions) {
        super();

        this.addClass(HISTORY_VIEWER_CLASS);
        this.id = 'livecells-revision-browser';
        this.title.label = 'Revision Browser';
        this.title.icon = HISTORY_VIEWER_ICON_CLASS;
        this.title.closable = true;

        this._model = options.model;
        let rendermime = (this.rendermime = options.rendermime);
        let editorFactory = (this.editorFactory = options.editorFactory);

        // Add revisions from most recent to oldest.
        let layout = (this.layout = new PanelLayout());
        for (let i = this._model.revisions.length - 1; i >= 0; i--) {
            let revisionModel = this._model.revisions[i];
            layout.addWidget(new Revision({
                model: revisionModel,
                rendermime: rendermime,
                editorFactory: editorFactory
            }));
        }
    }

    /**
     * Get the model used by the history viewer.
     */
    get model(): IHistoryModel {
        return this._model;
    }

    /**
     * The rendermime instance used by the widget.
     */
    readonly rendermime: RenderMimeRegistry;

    /**
     * The editor factory instance used by the widget.
     */
    readonly editorFactory: CodeEditor.Factory;

    /**
     * Dispose of the resources used by the widget.
     */
    dispose() {
        if (this.isDisposed) {
            return;
        }
        this._model = null;
        super.dispose();
    }

    private _model: IHistoryModel = null;

}

/**
 * The namespace for the `HistoryViewer` class statics.
 */
export namespace HistoryViewer {
    /**
     * An options object for initializing a history viewer widget.
     */
    export interface IOptions {
        /**
         * The model used by the history viewer.
         */
        model: IHistoryModel;

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