import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { IHistoryModel } from './model';
import { Revision } from '../revision';

/**
 * The class name added to history viewer widgets
 */
const HISTORY_VIEWER_CLASS = 'jp-HistoryViewer';

const HISTORY_VIEWER_ICON_CLASS = 'jp-HistoryViewerIcon';

/**
 * A widget for showing the history of a result and how it was produced.
 */
export class HistoryViewer<TOutputModel> extends Widget {

    /**
     * Construct a new history viewer.
     */
    constructor(options: HistoryViewer.IOptions<TOutputModel>) {
        super();

        this.addClass(HISTORY_VIEWER_CLASS);
        this.id = 'livecells-revision-browser';
        this.title.label = 'Revision Browser';
        this.title.icon = HISTORY_VIEWER_ICON_CLASS;
        this.title.closable = true;

        this._model = options.model;
        // let rendermime = (this.rendermime = options.rendermime);

        // Add revisions from most recent to oldest.
        let layout = (this.layout = new PanelLayout());
        for (let i = 0; i < this._model.revisions.length; i++) {
            let revisionModel = this._model.revisions[i];
            layout.addWidget(new Revision({
                model: revisionModel,
                // rendermime: rendermime,
            }));
        }
    }

    /**
     * Get the model used by the history viewer.
     */
    get model(): IHistoryModel<TOutputModel> {
        return this._model;
    }

    /**
     * The rendermime instance used by the widget.
     */
    // readonly rendermime: RenderMimeRegistry;

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

    private _model: IHistoryModel<TOutputModel> = null;

}

/**
 * The namespace for the `HistoryViewer` class statics.
 */
export namespace HistoryViewer {
    /**
     * An options object for initializing a history viewer widget.
     */
    export interface IOptions<TOutputModel> {
        /**
         * The model used by the history viewer.
         */
        model: IHistoryModel<TOutputModel>;

        /**
         * The mime renderer for this widget.
         */
        // rendermime: RenderMimeRegistry;
    }
}