import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { ICodeVersionModel } from './model';
import { DiffedSlicedCell, SlicedCell } from '../slicedcell';
import { CodeEditor } from '@jupyterlab/codeeditor';

/**
 * The class name added to code version widgets
 */
const CODE_VERSION_CLASS = 'jp-CodeVersion';

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
        this.model = options.model;
        let editorFactory = (this.editorFactory = options.editorFactory);

        let layout = (this.layout = new PanelLayout());
        for (let cellModel of this.model.cells) {
            let options: SlicedCell.IOptions = { model: cellModel, editorFactory };
            let cellWidget: Widget;
            if (this.model.isLatest) {
                cellWidget = new SlicedCell(options);
            } else {
                cellWidget = new DiffedSlicedCell(options);
            }
            layout.addWidget(cellWidget);
        }
    }

    /**
     * The model used by the widget.
     */
    readonly model: ICodeVersionModel;

    /**
     * The editor factory instance used by the widget.
     */
    readonly editorFactory: CodeEditor.Factory;
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
         * Factory for creating editor cells.
         */
        editorFactory: CodeEditor.Factory;
    }
}