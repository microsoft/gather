import { Widget, PanelLayout } from "@phosphor/widgets";

/**
 * The name of the class for the gather widget.
 */
const GATHER_WIDGET_CLASS = 'jp-GatherWidget';

/**
 * The name of the class for buttons on the gather widget.
 */
const BUTTON_CLASS = 'jp-GatherWidget-button';

/**
 * The name of the class for the gather button.
 */
const GATHER_BUTTON_CLASS = 'jp-GatherWidget-gatherbutton';

/**
 * The name of the class for the history button.
 */
const HISTORY_BUTTON_CLASS = 'jp-GatherWidget-historybutton';

/**
 * A widget for showing the gathering tools.
 */
export class GatherWidget extends Widget {
    /**
     * Construct a gather widget.
     */
    constructor(options: GatherWidget.IOptions) {
        super();
        this.addClass(GATHER_WIDGET_CLASS);
        let layout = (this.layout = new PanelLayout());
        this._gatherButton = new Widget({ node: document.createElement("div") });
        this._gatherButton.addClass(BUTTON_CLASS);
        this._gatherButton.addClass(GATHER_BUTTON_CLASS);
        this._gatherButton.node.onclick = options.gatherCallback;
        layout.addWidget(this._gatherButton);
        this._historyButton = new Widget({ node: document.createElement("div") });
        this._historyButton.addClass(BUTTON_CLASS);
        this._historyButton.addClass(HISTORY_BUTTON_CLASS);
        this._historyButton.node.onclick = options.historyCallback;
        layout.addWidget(this._historyButton);
    }

    /**
     * Set the element above which this widget should be anchored.
     */
    setAnchor(element: Element) {
        let oldAnchor = this._anchor;
        this._anchor = element;
        if (this._anchor != oldAnchor) {
            if (oldAnchor != null) {
                oldAnchor.removeChild(this.node);
            }
            if (this._anchor != null) {
                this._anchor.appendChild(this.node);
            }
        }
    }

    /**
     * Dispose of the resources held by the widget.
     */
    dispose() {
        // Do nothing if already disposed.
        if (this.isDisposed) {
            return;
        }
        this._gatherButton.dispose();
        this._historyButton.dispose();
        this._gatherButton = null;
        this._historyButton = null;
        this._anchor = null;
        super.dispose();
    }

    private _anchor: Element;
    private _gatherButton: Widget;
    private _historyButton: Widget;
}

/**
 * Namespace for the GatherWidget class.
 */
export namespace GatherWidget {

    export interface IOptions {
        /**
         * Callback for gathering code to the clipboard.
         */
        gatherCallback: () => void;

        /**
         * Callback for showing revision history for slices.
         */
        historyCallback: () => void;
    }
}