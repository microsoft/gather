import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { IRevisionModel } from './model';
import { CodeVersion } from '../codeversion';
import { GatherState } from '../gather';
import { log } from '../../utils/log';
import { getRelativeTime } from '../../utils/date';


// HTML element classes for rendered revisions
const REVISION_CLASS                = 'jp-Revision';
const REVISION_NOTEBOOK_CLASS       = 'jp-Revision-notebook';
const REVISION_HEADER_CLASS         = 'jp-Revision-header';
const REVISION_BUTTONS_CLASS        = 'jp-Revision-buttons';
const REVISION_BUTTON_LABEL_CLASS   = 'jp-Revision-button-label';
const REVISION_BUTTON_CLASS         = 'jp-Revision-button';
const REVISION_CELLS_CLASS          = 'jp-Revision-cells';


export interface IOutputRenderer<TOutputModel> {
    render(outputModel: TOutputModel): HTMLElement;
}


export namespace Revision {
    export interface IOptions<TOutputModel> {
        model: IRevisionModel<TOutputModel>;
        outputRenderer: IOutputRenderer<TOutputModel>;
        now: Date; // the current time, which should be the same for all revisions
    }
}


export class Revision<TOutputModel> extends Widget {

    readonly model: IRevisionModel<TOutputModel>;

    constructor(options: Revision.IOptions<TOutputModel>) {
        super();
        this.addClass(REVISION_CLASS);
        let model = (this.model = options.model);
        let outputRenderer = options.outputRenderer;

        let layout = (this.layout = new PanelLayout());

        let notebookWidget = new Widget({ node: document.createElement("div") });
        notebookWidget.addClass(REVISION_NOTEBOOK_CLASS);
        let nbLayout = (notebookWidget.layout = new PanelLayout());
        layout.addWidget(notebookWidget);

        // Add header
        let header: HTMLElement = document.createElement("h1");
        header.textContent = this.model.isLatest ? "Current version" :
            getRelativeTime(options.now, this.model.timeCreated);
        let headerWidget: Widget = new Widget({ node: header });
        headerWidget.addClass(REVISION_HEADER_CLASS);
        nbLayout.addWidget(headerWidget);

        // Add buttons for gathering
        let buttons = new Widget({ node: document.createElement("div") });
        buttons.addClass(REVISION_BUTTONS_CLASS);
        const panelLayout = buttons.layout = new PanelLayout();
        panelLayout.addWidget(this.createButton("Open in notebook", GatherState.GATHER_TO_NOTEBOOK));
        panelLayout.addWidget(this.createButton("Copy to clipboard", GatherState.GATHER_TO_CLIPBOARD));
        nbLayout.addWidget(buttons);

        // Add the revision's code
        let cellsWidget = new Widget({ node: document.createElement("div") });
        cellsWidget.addClass(REVISION_CELLS_CLASS);
        let cellsLayout = (cellsWidget.layout = new PanelLayout());
        nbLayout.addWidget(cellsWidget);

        cellsLayout.addWidget(new CodeVersion({
            model: model.source,
        }));

        if (model.output) {
            let outputElement = outputRenderer.render(model.output);
            if (outputElement) {
                cellsLayout.addWidget(new Widget({
                    node: outputElement
                }));
            }
        }

        // Scroll to the bottom. Create as an observer as the cells will be initialized dynamically.
        if (MutationObserver) {
            let observer = new MutationObserver((mutations) => {
                for (let mutation of mutations) {
                    let target = mutation.target as HTMLElement;
                    if (target.classList && target.classList.contains("CodeMirror-measure")) {
                        cellsWidget.node.scrollTop = cellsWidget.node.scrollHeight;
                    }
                    break;
                }
            });
            observer.observe(cellsWidget.node, {
                attributes: false,
                childList: true,
                subtree: true
            });
        }
    }

    private createButton(label: string, gatherState: GatherState) {
        let button = new Widget({ node: document.createElement("button") });
        button.addClass(REVISION_BUTTON_CLASS);
        let notebookLabel = document.createElement("i");
        notebookLabel.classList.add("fa-book", "fa");
        let notebookText = document.createElement("span");
        notebookText.classList.add(REVISION_BUTTON_LABEL_CLASS);
        notebookText.textContent = label;
        notebookLabel.appendChild(notebookText);
        button.node.appendChild(notebookLabel);
        button.node.onclick = () => {
            log("Revision browser: " + label, {
                slice: this.model.slice,
                versionIndex: this.model.versionIndex,
                isLatest: this.model.isLatest
            });
            let gatherModel = this.model.gatherModel;
            gatherModel.addChosenSlices(this.model.slice);
            gatherModel.requestStateChange(gatherState);
        };
        return button;
    }
}
