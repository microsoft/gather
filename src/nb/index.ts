import $ = require('jquery');
import Jupyter = require('base/js/namespace');
import { Cell, CodeCell, notification_area, Notebook, Action } from 'base/js/namespace';
import { Widget } from '@phosphor/widgets';

import { NotebookCell, copyCodeCell } from './NotebookCell';
import { ExecutionLogSlicer, SlicedExecution } from '../slicing/ExecutionSlicer';
import { MarkerManager, ICell, CellEditorResolver } from '../packages/cell';

import { GatherModel, GatherModelEvent, GatherEventData, IGatherObserver } from '../packages/gather/model';
import { GatherController } from '../packages/gather/controller';

import '../../style/nb-vars.css';
import '../../style/index.css';

/**
 * Widget for gather notifications.
 */
var notificationWidget: Jupyter.NotificationWidget;

/**
 * Logs cell executions.
 */
var executionLogger: ExecutionLogger;

/**
 * Logs each cell execution.
 */
class ExecutionLogger {
    readonly executionSlicer = new ExecutionLogSlicer();
    private _cellWithUndefinedCount: ICell;
    private _lastExecutionCount: number;

    constructor() {
        // We don't know the order that we will receive events for the kernel finishing execution and
        // a cell finishing execution, so this helps us pair execution count to an executed cell.
        Jupyter.notebook.events.on('shell_reply.Kernel', (
                _: Jupyter.Event, data: { reply: { content: Jupyter.ShellReplyContent }}) => {
            if (this._cellWithUndefinedCount) {
                console.log("Defining cell execution count after the fact...");
                this._cellWithUndefinedCount.executionCount = data.reply.content.execution_count;
                this._cellWithUndefinedCount = undefined;
            } else {
                this._lastExecutionCount = data.reply.content.execution_count;
            }
        });
        Jupyter.notebook.events.on('finished_execute.CodeCell', (_: Jupyter.Event, data: { cell: CodeCell }) => {
            let cellClone = copyCodeCell(data.cell);
            const cell = new NotebookCell(cellClone);
            if (this._lastExecutionCount) {
                cellClone.input_prompt_number = this._lastExecutionCount;
                this._lastExecutionCount = undefined;
            } else {
                this._cellWithUndefinedCount = cell;
            }
            this.executionSlicer.logExecution(cell);
        });
    }
}

/**
 * Resolve the active editors for cells in Jupyter notebook.
 */
class NotebookCellEditorResolver implements CellEditorResolver {

    /**
     * Construct a new cell editor resolver.
     */
    constructor(notebook: Notebook) {
        this._notebook = notebook;
    }

    /**
     * Get a cell from the notebook with the specified properties.
     */
    getCellWidget(cellId: string, executionCount?: number): Cell {
        let matchingCells = this._notebook.get_cells()
        .filter((c) => {
            if (c.cell_id != cellId) return false;
            if (executionCount != undefined) {
                if (!(c instanceof CodeCell)) return false;
                if ((c as CodeCell).input_prompt_number != executionCount) return false;
            }
            return true;
        });
        if (matchingCells.length > 0) {
            return matchingCells.pop();
        }
        return null;
    }

    resolve(cell: ICell): CodeMirror.Editor {
        let cellWidget = this.getCellWidget(cell.id, cell.executionCount);
        if (cellWidget) {
            return cellWidget.code_mirror;
        }
        return null;
    }

    private _notebook: Notebook;
}

/**
 * Highlights definitions in executed cells.
 */
class DefHighlighter {

    private _markerManager: MarkerManager;

    constructor(gatherModel: GatherModel, markerManager: MarkerManager) {
        this._markerManager = markerManager;
        Jupyter.notebook.events.on('finished_execute.CodeCell', (_: Jupyter.Event, data: { cell: CodeCell }) => {
            let cell = data.cell;
            let nbCell = new NotebookCell(cell);
            if (!nbCell.hasError) {
                gatherModel.lastExecutedCell = nbCell;
            }
        });

        document.body.addEventListener("mouseup", (event: MouseEvent) => {
            this._markerManager.handleClick(event);
        });
    }
}

/**
 * Gather code to the clipboard.
 */
function gatherToClipboard(slice?: SlicedExecution) {

    const SHOULD_SLICE_CELLS = true;

    if (slice) {
        let cells = slice.cellSlices
        .map((cellSlice) => {
            let slicedCell = cellSlice.cell;
            if (SHOULD_SLICE_CELLS) {
                slicedCell = slicedCell.copy();
                slicedCell.text = cellSlice.textSliceLines;
            }
            return slicedCell;
        });
        
        // Copy cells to clipboard
        Jupyter.notebook.clipboard = [];
        cells.forEach((c) => {
            if (c instanceof NotebookCell) {
                Jupyter.notebook.clipboard.push(c.model.toJSON());
            }
        });
        Jupyter.notebook.enable_paste();

        if (notificationWidget) {
            notificationWidget.set_message("Copied cells. To paste, type 'v' or right-click.", 5000);
        }
    }
}

function gatherToNotebook() {
    const activeCell = Jupyter.notebook.get_selected_cell();
    if (activeCell.cell_type === 'code') {
        let cell = new NotebookCell(activeCell as CodeCell);
        let slice = executionLogger.executionSlicer.sliceLatestExecution(cell);
        let cells = slice.cellSlices.map((cellSlice) => cellSlice.cell);
        console.log(cells);

        // Create a new notebook
        const w = window.open('', '_blank');
        Jupyter.contents.new_untitled('', { type: 'notebook' })
            .then((data: { [ path: string ]: string }) => {
                const url: any = Jupyter.notebook.base_url +
                    "/notebooks/" + encodeURIComponent(data.path) +
                    "/kernel_name=python3";
                w.location.href = url;
            });
    }
}

/**
 * Prefix for all gather actions.
 */
const GATHER_PREFIX = 'gather_extension';

/**
 * Button to add to the Jupyter notebook toolbar.
 */
interface Button {
    label?: string;
    actionName: string;
    action: Action;
}

/**
 * Class for highlighted buttons.
 */
const HIGHLIGHTED_BUTTON_CLASS = "jp-Toolbar-button-glow";

/**
 * A button to gather code to the clipboard.
 */
class GatherButton implements Button, IGatherObserver {

    /**
     * Properties for initializing the gather button.
     */
    readonly label: string = "Gather";
    readonly actionName: string = "gather-code";
    readonly action: Action = {
        icon: 'fa-level-up',
        help: 'Gather code to clipboard',
        help_index: 'gather-code',
        handler: () => {
            console.log("Gathering up the code");
        }
    }

    /**
     * Construct a gather button.
     */
    constructor(gatherModel: GatherModel) {
        this._gatherModel = gatherModel;
        this._gatherModel.addObserver(this);
    }

    /**
     * Set the node for this button. For now, has to be done after initialization, given how
     * Jupyter notebook initializes toolbars.
     */
    set node(node: Widget) {
        if (this._node != node) {
            this._node = node;
            this._node.node.onclick = () => {
                let slices = this._gatherModel.selectedSlices.map((s) => s.slice);
                let mergedSlice = slices[0].merge(...slices.slice(1));
                gatherToClipboard(mergedSlice);
            };
        }
    }

    /**
     * Listen for changes on the gather model.
     */
    onModelChange(event: GatherModelEvent, eventData: GatherEventData, model: GatherModel) {
        if (event == GatherModelEvent.SLICE_SELECTED || event == GatherModelEvent.SLICE_DESELECTED) {
            if (model.selectedSlices.length > 0) {
                if (this._node) {
                    this._node.addClass(HIGHLIGHTED_BUTTON_CLASS);
                }
            } else {
                if (this._node) {
                    this._node.removeClass(HIGHLIGHTED_BUTTON_CLASS);
                }
            }
        }
    }

    private _gatherModel: GatherModel;
    private _node: Widget;
}

class ClearButton implements Button {
    readonly label: string = "Clear";
    readonly actionName: string = "clear-selections";
    readonly action: Action = {
        icon: 'fa-remove',
        help: 'Clear gather selections',
        help_index: 'clear-selections',
        handler: () => { 
            console.log("Clearing selection");
        }
    }
}

export function load_ipython_extension() {
    console.log('extension started');

    // Object containing global UI state.
    let gatherModel = new GatherModel();

    // Plugin initializations.
    executionLogger = new ExecutionLogger();
    let markerManager = new MarkerManager(gatherModel,
        new NotebookCellEditorResolver(Jupyter.notebook));
    new DefHighlighter(gatherModel, markerManager);

    // Controller for global UI state.
    new GatherController(gatherModel, executionLogger.executionSlicer);

    // Set up toolbar with gather actions.
    let gatherButton = new GatherButton(gatherModel );
    let gatherFullActionName = Jupyter.actions.register(
        gatherButton.action, gatherButton.actionName, GATHER_PREFIX);
    let clearButton = new ClearButton();
    let clearFullActionName = Jupyter.actions.register(
        clearButton.action, clearButton.actionName, GATHER_PREFIX);
    let buttonsGroup = Jupyter.toolbar.add_buttons_group([
        { label: gatherButton.label, action: gatherFullActionName },
        { label: clearButton.label, action: clearFullActionName }
    ]);
    let gatherButtonNode = buttonsGroup.children()[0];
    gatherButton.node = new Widget({ node: gatherButtonNode });

    // Add UI elements
    const menu = $('#menus ul.navbar-nav');
    const gather = $('<li class="dropdown"></li>').appendTo(menu);
    $('<a href="#" class="dropdown-toggle" data-toggle="dropdown">Gather</a>').appendTo(gather);
    const list = $('<ul id="gather_menu" class="dropdown-menu"></ul>').appendTo(gather);
    $('<li id="gather-to-notebook" title="Gather to notebook"><a href="#">Gather to notebook</a></li>').click(gatherToNotebook).appendTo(list);
    $('<li id="gather-to-script" title="Gather to script"><a href="#">Gather to script</a></li>').appendTo(list);
    $('<li id="gather-to-clipboard title="Gather to clipboard"><a href="#">Gather to clipboard</a></li>')
        .click(() => gatherToClipboard()).appendTo(list);
    notificationWidget = notification_area.new_notification_widget("gather");
    notification_area.new_notification_widget("gather");
}
