import { RenderMimeRegistry, OutputModel } from '@jupyterlab/rendermime';
import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { nbformat } from '@jupyterlab/coreutils';

/**
 * The class name added to display data widgets
 */
const REVISION_CLASS = 'jp-DisplayData';

/**
 * A widget for showing output data.
 */
export class DisplayData extends Widget {
    /**
     * Construct a new code version.
     */
    constructor(options: DisplayData.IOptions) {
        super();
        this.addClass(REVISION_CLASS);
        let model = (this.model = options.model);
        let rendermime = (this.rendermime = options.rendermime);

        let layout = (this.layout = new PanelLayout());

        // Code borrowed from OutputArea extension.
        // TODO(andrewhead): change second argument (preferSafe) based on display data field.
        let mimeType = rendermime.preferredMimeType(model.data, false);
        let output = rendermime.createRenderer(mimeType);
        output.renderModel(new OutputModel({ value: model }));
        layout.addWidget(output);
    }

    /**
     * The model used by the widget.
     */
    readonly model: nbformat.IDisplayData;

    /**
     * The rendermime instance used by the widget.
     */
    readonly rendermime: RenderMimeRegistry;
}

/**
 * A namespace for `DisplayData` statics.
 */
export namespace DisplayData {
    /**
     * The options used to create a `DisplayData`.
     */
    export interface IOptions {
        /**
         * The model used by the widget.
         */
        model: nbformat.IDisplayData;

        /**
         * The mime renderer for this widget.
         */
        rendermime: RenderMimeRegistry;
    }
}