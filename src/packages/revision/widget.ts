import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { IRevisionModel } from './model';
import { CodeVersion } from '../codeversion';

/**
 * The class name added to revision widgets
 */
const REVISION_CLASS = 'jp-Revision';

/**
 * The class name added to headers for revision widgets.
 */
const REVISION_HEADER_CLASS = 'jp-Revision-header';

/**
 * A widget for showing revision of an execution.
 */
export class Revision<TOutputModel> extends Widget {
    /**
     * Construct a revision.
     */
    constructor(options: Revision.IOptions<TOutputModel>) {   
        super();
        this.addClass(REVISION_CLASS);
        let model = (this.model = options.model);
        // let rendermime = (this.rendermime = options.rendermime);
        // let editorFactory = (this.editorFactory = options.editorFactory);

        let layout = (this.layout = new PanelLayout());
        
        let header: HTMLElement = document.createElement("h1");
        let headerText: string;
        if (this.model.isLatest) {
            headerText = "Latest";
        } else {
            // headerText = "Version " + this.model.versionIndex;
            headerText = "";
        }
        if (this.model.timeCreated) {
            let dateString: string = this.model.timeCreated.toLocaleDateString(
                undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                });
            let timeString: string = this.model.timeCreated.toLocaleTimeString(
                undefined, {
                    hour: "numeric",
                    minute: "2-digit"
                });
            headerText += (" (" + dateString + " " + timeString + ")");
        }
        header.textContent = headerText;
        let headerWidget: Widget = new Widget({ node: header });
        headerWidget.addClass(REVISION_HEADER_CLASS);
        layout.addWidget(headerWidget);

        layout.addWidget(new CodeVersion({
            model: model.source,
        }));
        /*
        if (model.results instanceof OutputAreaModel) {
            layout.addWidget(new OutputArea({
                model: model.results,
                rendermime: rendermime
            }));
        }
        */
    }

    /**
     * The model used by the widget.
     */
    readonly model: IRevisionModel<TOutputModel>;

    /**
     * The rendermime instance used by the widget.
     */
    // readonly rendermime: RenderMimeRegistry;
}

/**
 * A namespace for `Revision` statics.
 */
export namespace Revision {
    /**
     * The options used to create a `Revision`.
     */
    export interface IOptions<TOutputModel> {
        /**
         * The model used by the widget.
         */
        model: IRevisionModel<TOutputModel>;

        /**
         * The mime renderer for this widget.
         */
        // rendermime: RenderMimeRegistry;
    }
}