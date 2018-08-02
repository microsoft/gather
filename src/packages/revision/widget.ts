import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { IRevisionModel } from './model';
import { CodeVersion } from '../codeversion';
import { GatherState } from '../gather';

/**
 * The class name added to revision widgets
 */
const REVISION_CLASS = 'jp-Revision';

/**
 * The class name added to headers for revision widgets.
 */
const REVISION_HEADER_CLASS = 'jp-Revision-header';

/**
 * The class name added to the container for revision buttons.
 */
const REVISION_BUTTONS_CLASS = 'jp-Revision-buttons';

/**
 * The class name added to labels on buttons.
 */
const REVISION_BUTTON_LABEL_CLASS = 'jp-Revision-button-label';

/**
 * The class name added to buttons.
 */
const REVISION_BUTTON_CLASS = 'jp-Revision-button';

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
        
        // Add header
        let header: HTMLElement = document.createElement("h1");
        let headerText: string;
        if (this.model.isLatest) {
            headerText = "Latest";
        } else {
            // headerText = "Version " + this.model.versionIndex;
            headerText = "Older";
        }
        if (this.model.timeCreated) {
            let dateString: string = this.model.timeCreated.toLocaleDateString(
                undefined, {
                    day: "numeric",
                    month: "long",
                    // year: "numeric"
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

        // Add buttons for gathering
        let buttons = new Widget({ node: document.createElement("div") });
        buttons.addClass(REVISION_BUTTONS_CLASS);
        buttons.layout = new PanelLayout();

        let notebookButton = new Widget({ node: document.createElement("button") });
        notebookButton.addClass(REVISION_BUTTON_CLASS);
        let notebookLabel = document.createElement("i");
        notebookLabel.classList.add("fa-book", "fa");
        let notebookText = document.createElement("span");
        notebookText.classList.add(REVISION_BUTTON_LABEL_CLASS);
        notebookText.textContent = "Open in notebook";
        notebookLabel.appendChild(notebookText);
        notebookButton.node.appendChild(notebookLabel);
        notebookButton.node.onclick = () => {
            let gatherModel = this.model.gatherModel;
            gatherModel.addChosenSlices(this.model.slice);
            gatherModel.requestStateChange(GatherState.GATHER_TO_NOTEBOOK);
        };
        (buttons.layout as PanelLayout).addWidget(notebookButton);

        let copyButton = new Widget({ node: document.createElement("button") });
        copyButton.addClass(REVISION_BUTTON_CLASS);
        let copyLabel = document.createElement("i");
        copyLabel.classList.add("fa-clipboard", "fa");
        let copyText = document.createElement("span");
        copyText.classList.add(REVISION_BUTTON_LABEL_CLASS);
        copyText.textContent = "Copy to clipboard";
        copyLabel.appendChild(copyText);
        copyButton.node.appendChild(copyLabel);
        copyButton.node.onclick = () => {
            let gatherModel = this.model.gatherModel;
            gatherModel.addChosenSlices(this.model.slice);
            gatherModel.requestStateChange(GatherState.GATHER_TO_CLIPBOARD);
        };
        (buttons.layout as PanelLayout).addWidget(copyButton);

        layout.addWidget(buttons);

        // Add the revision's code
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