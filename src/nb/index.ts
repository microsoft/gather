import Jupyter = require('base/js/namespace');
import * as utils from "base/js/utils";
import { Cell, CodeCell, notification_area, OutputArea, Notebook } from 'base/js/namespace';
import { Widget } from '@phosphor/widgets';

import { NotebookCell, copyCodeCell } from './NotebookCell';
import { ExecutionLogSlicer, SlicedExecution } from '../slicing/ExecutionSlicer';
import { MarkerManager, ICell, CellEditorResolver, CellOutputResolver } from '../packages/cell';

import { GatherModel } from '../packages/gather/model';
import { GatherController } from '../packages/gather/controller';

import { GatherToClipboardButton, ClearButton, GatherToNotebookButton, MergeButton, GatherHistoryButton } from './buttons';
import { ICellClipboard, IClipboardListener } from '../packages/gather/clipboard';
import { INotebookOpener } from '../packages/gather/opener';
import * as log from '../utils/log';
import { RevisionBrowser } from './RevisionBrowser';

import 'codemirror/mode/python/python';
import '../../style/nb-vars.css';
import '../../style/index.css';
import { IReplacer } from '../utils/replacers';


/**
 * Widget for gather notifications.
 */
var notificationWidget: Jupyter.NotificationWidget;

/**
 * Logs cell executions.
 */
var executionHistory: ExecutionHistory;

function getCellOutputLogData(outputArea: OutputArea) {
    // TODO: consider checking for HTML tables.
    let outputData = [];
    if (outputArea && outputArea.outputs && outputArea.outputs.length > 0) {
        for (let output of outputArea.outputs) {
            let type = output.output_type;
            let mimeTags: string[] = [];
            let data = output.data;
            if (data && Object.keys(data)) {
                mimeTags = Object.keys(data);
            }
            outputData.push({ type, mimeTags });
        }
    }
}

/**
 * Replaces Jupyter notebook cell widgets with cleaned-up JSON.
 */
class NbCellReplacer implements IReplacer {
    replace(_: string, value: any): any {
        if (value instanceof CodeCell) {
            return {
                type: "code",
                id: value.cell_id,
                executionCount: value.input_prompt_number,
                lineCount: value.code_mirror.getValue().split("\n").length,
                gathered: value.metadata && value.metadata.gathered,
                output: getCellOutputLogData(value.output_area)
            }
        } else if (value instanceof Cell) {
            return {
                type: "other",
                id: value.cell_id,
                executionCount: null,
                lineCount: value.code_mirror.getValue().split("\n").length,
                gathered: value.metadata && value.metadata.gathered
            }
        }
        return value;
    }
}

/**
 * Replaces our notebook cell wrappers with cleaned-up JSON.
 */
class NotebookCellReplacer implements IReplacer {
    replace(_: string, value: any): any {
        if (value instanceof NotebookCell) {
            let outputData = getCellOutputLogData(value.output);
            return {
                id: value.id,
                executionCount: value.executionCount,
                lineCount: value.text.split("\n").length,
                output: outputData,
                hasError: value.hasError,
                gathered: value.gathered
            }
        }
        return value;
    }
}

/**
 * Collects log information about the notebook for each log call.
 */
class NbStatePoller implements log.IStatePoller {
    /**
     * Construct a new poller for notebook state.
     */
    constructor(notebook: Notebook) {
        this._notebook = notebook;
    }

    /**
     * Collect state information about the notebook.
     */
    poll(): any {
        return {
            gathered: this._notebook.metadata && this._notebook.metadata.gathered,
            numCells: this._notebook.get_cells().length,
            codeCellIds: this._notebook.get_cells()
                .filter((c) => c.cell_type == "code")
                .map((c) => [c.cell_id, (c as CodeCell).input_prompt_number]),
            numLines: this._notebook.get_cells()
                .filter((c) => c.cell_type == "code")
                .reduce((lineCount, c) => { return lineCount + c.code_mirror.getValue().split("\n").length }, 0)
        }
    }

    private _notebook: Notebook;
}

/**
 * Saves each cell execution to a history.
 */
class ExecutionHistory {
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
                this.executionSlicer.logExecution(this._cellWithUndefinedCount);
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
                this.executionSlicer.logExecution(cell);
                this._lastExecutionCount = undefined;
            } else {
                this._cellWithUndefinedCount = cell;
            }
        });
    }
}

/**
 * Logs edit and execution events in the notebook.
 */
class NotebookEventLogger {
    /**
     * Construct a new event logger for the notebook.
     */
    constructor(notebook: Notebook) {
        notebook.events.on('create.Cell', (_: Jupyter.Event, data: { cell: Cell, index: number }) => {
            log.log("Created cell", { cell: data.cell, index: data.index });
        })
        notebook.events.on('change.Cell', (_: Jupyter.Event, data: { cell: Cell, change: CodeMirror.EditorChange }) => {
            let change = data.change;
            log.log("Changed contents of cell", {
                cell: data.cell,
                newCharacters: change.text.reduce((len, line) => { return len + line.length }, 0),
                removedCharacters: change.text.reduce((len, line) => { return len + line.length }, 0)
            });
        });
        notebook.events.on('select.Cell', (_: Jupyter.Event, data: { cell: Cell, extendSelection: boolean }) => {
            log.log("Cell selected", { cell: data.cell, extendSelection: data.extendSelection });
        });
        notebook.events.on('delete.Cell', (_: Jupyter.Event, data: { cell: Cell, index: number }) => {
            log.log("Deleted cell", { cell: data.cell, index: data.index });
        });
        // To my knowledge, the cell that this saves will have the most recent version of the output.
        notebook.events.on('finished_execute.CodeCell', (_: Jupyter.Event, data: { cell: CodeCell }) => {
            log.log("Executed cell", { cell: data.cell });
        });
        notebook.events.on('kernel_restarting.Kernel', () => {
            log.log("Restarting kernel");
        });
        notebook.events.on('checkpoint_created.Notebook', () => {
            log.log("Created checkpoint");
        });
        notebook.events.on('checkpoint_failed.Notebook', () => {
            log.log("Failed to create checkpoint");
        });
        // XXX: Triggered by both restoring a checkpoint and deleting it. Weird.
        notebook.events.on('notebook_restoring.Notebook', () => {
            log.log("Attempting to restore checkpoint");
        });
        notebook.events.on('checkpoint_restore_failed.Notebook', () => {
            log.log("Failed to restore checkpoint");
        });
        notebook.events.on('checkpoint_restored.Notebook', () => {
            log.log("Succeeded at restoring checkpoint");
        });
        notebook.events.on('checkpoint_delete_failed.Notebook', () => {
            log.log("Failed to delete checkpoint");
        });
        notebook.events.on('checkpoint_deleted.Notebook', () => {
            log.log("Succeeeded at deleting checkpoint");
        })
    }
}

/**
 * Get a cell from the notebook with the specified properties.
 */
function getCellWidget(notebook: Notebook, cellId: string, executionCount?: number): Cell {
    let matchingCells = notebook.get_cells()
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

    resolve(cell: ICell): CodeMirror.Editor {
        let cellWidget = getCellWidget(this._notebook, cell.id, cell.executionCount);
        if (cellWidget) {
            return cellWidget.code_mirror;
        }
        return null;
    }

    private _notebook: Notebook;
}

/**
 * Finds HTML elements for cell outputs in a notebook.
 */
class NotebookCellOutputResolver implements CellOutputResolver {
    /**
     * Construct a new cell editor resolver.
     */
    constructor(notebook: Notebook) {
        this._notebook = notebook;
    }

    resolve(cell: ICell): HTMLElement[] {
        let cellWidget = getCellWidget(this._notebook, cell.id, cell.executionCount);
        let outputElements = [];
        if (cellWidget) {
            let cellElement = cellWidget.element[0];
            var outputNodes = cellElement.querySelectorAll(".output_subarea");
            for (var i = 0; i < outputNodes.length; i++) {
                if (outputNodes[i] instanceof HTMLElement) {
                    outputElements.push(outputNodes[i] as HTMLElement);
                }
            }
        }
        return outputElements;
    }

    private _notebook: Notebook;
}

/**
 * Highlights gatherable entities.
 */
class ResultsHighlighter {

    private _markerManager: MarkerManager;

    constructor(gatherModel: GatherModel, markerManager: MarkerManager) {
        this._markerManager = markerManager;
        Jupyter.notebook.events.on('finished_execute.CodeCell', (_: Jupyter.Event, data: { cell: CodeCell }) => {
            let cell = data.cell;
            let nbCell = new NotebookCell(cell);
            gatherModel.lastExecutedCell = nbCell;
        });

        document.body.addEventListener("mouseup", (event: MouseEvent) => {
            this._markerManager.handleClick(event);
        });
    }
}

/**
 * Convert program slice to list of cell JSONs
 */
function sliceToCellJson(slice: SlicedExecution, annotatePaste?: boolean): CellJson[] {
    const SHOULD_SLICE_CELLS = true;
    const SHOULD_OMIT_NONTERMINAL_OUTPUT = true;
    annotatePaste = annotatePaste || false;
    return slice.cellSlices
    .map((cellSlice, i) => {
        let slicedCell = cellSlice.cell;
        if (SHOULD_SLICE_CELLS) {
            slicedCell = slicedCell.copy();
            slicedCell.text = cellSlice.textSliceLines;
        }
        if (slicedCell instanceof NotebookCell) {
            let cellJson = slicedCell.model.toJSON();
            // This new cell hasn't been executed yet. So don't mark it as having been executed.
            cellJson.execution_count = null;
            // Add a flag to distinguish gathered cells from other cells.
            cellJson.metadata.gathered = true;
            // Add a flag so we can tell if this cell was just pasted, so we can merge it.
            if (annotatePaste) {
                cellJson.metadata.justPasted = true;
            }
            // If this isn't the last cell, don't include its output.
            if (SHOULD_OMIT_NONTERMINAL_OUTPUT && i != slice.cellSlices.length - 1) {
                cellJson.outputs = [];
            }
            return cellJson;
        }
    }).filter((c) => c != undefined);
}

/**
 * Gather code to the clipboard.
 */
class Clipboard implements ICellClipboard {

    addListener(listener: IClipboardListener) {
        this._listeners.push(listener);
    }

    copy(slice: SlicedExecution) {
        if (slice) {
            Jupyter.notebook.clipboard = [];
            let cellsJson = sliceToCellJson(slice, true);
            cellsJson.forEach((c) => {
                Jupyter.notebook.clipboard.push(c);
            });
            Jupyter.notebook.enable_paste();
            this._listeners.forEach((listener) => listener.onCopy(slice, this));
        }
    }

    private _listeners: IClipboardListener[] = [];
}

/**
 * Opens new notebooks containing program slices.
 */
class NotebookOpener implements INotebookOpener {

    // Pass in the current notebook. This class will open new notebooks.
    constructor(thisNotebook: Notebook) {
        this._notebook = thisNotebook;
    }

    private _openSlice(notebookJson: NotebookJson, gatherIndex: number) {
        
        // Get the directory of the current notebook.
        let currentDir = document.body.attributes
            .getNamedItem('data-notebook-path').value.split('/').slice(0, -1).join("/");
        currentDir = currentDir ? currentDir + "/" : "";

        // Create path to file
        let fileName = "GatheredCode" + gatherIndex + ".ipynb";
        let notebookPath = currentDir + fileName;

        this._notebook.contents.get(notebookPath, { type: 'notebook' }).then((_) => {
            // If there's already a file at this location, try the next gather index.
            this._openSlice(notebookJson, gatherIndex + 1);
        }, (_) => {
            // Open up a new notebook at an available location.
            let model = { type: "notebook", content: notebookJson };
            this._notebook.contents.save(notebookPath, model).then(() => {
                // XXX: This seems to open up a file in different places on different machines???
                window.open(fileName + "?kernel_name=python3", '_blank');
            });
        });
    }

    openNotebookForSlice(slice: SlicedExecution) {

        // Make boilerplate, empty notebook JSON.
        let notebookJson = this._notebook.toJSON();
        notebookJson.cells = [];
        notebookJson.metadata.gathered = true;

        // Replace the notebook model's cells with the copied cells.
        if (slice) {
            let cellsJson = sliceToCellJson(slice, false);
            for (let i = 0; i < cellsJson.length; i++) {
                let cellJson = cellsJson[i];
                notebookJson.cells.push(cellJson);
            }

            // Save the gathered code to a new notebook, and then open it.
            this._openSlice(notebookJson, 1);
        }
    }

    private _notebook: Notebook;
}

/**
 * Prefix for all gather actions.
 */
const GATHER_PREFIX = 'gather_extension';

export function load_ipython_extension() {
    console.log('extension started');

    /**
     * Initialize logging.
     */
    log.initLogger({ ajax: utils.ajax });
    log.registerReplacers(
        new NbCellReplacer(),
        new NotebookCellReplacer()
    );
    log.registerPollers(new NbStatePoller(Jupyter.notebook));
    new NotebookEventLogger(Jupyter.notebook);

    // Object containing global UI state.
    let gatherModel = new GatherModel();

    // Plugin initializations.
    executionHistory = new ExecutionHistory();
    let markerManager = new MarkerManager(gatherModel,
        new NotebookCellEditorResolver(Jupyter.notebook),
        new NotebookCellOutputResolver(Jupyter.notebook));
    new ResultsHighlighter(gatherModel, markerManager);

    // Initialize clipboard for copying cells.
    let clipboard = new Clipboard();
    clipboard.addListener({
        onCopy: () => {    
            if (notificationWidget) {
                notificationWidget.set_message("Copied cells. To paste, type 'v' or right-click.", 5000);
            }
        }
    });

    // Initialize utility for opening new notebooks.
    let opener = new NotebookOpener(Jupyter.notebook);

    // Controller for global UI state.
    new GatherController(gatherModel, executionHistory.executionSlicer, clipboard, opener);

    // Set up toolbar with gather actions.
    let gatherToClipboardButton = new GatherToClipboardButton(gatherModel);
    let gatherToNotebookButton = new GatherToNotebookButton(gatherModel);
    let gatherHistoryButton = new GatherHistoryButton(gatherModel);
    let clearButton = new ClearButton(gatherModel);

    // Create buttons for gathering.
    let gatherToClipboardFullActionName = Jupyter.actions.register(
        gatherToClipboardButton.action, gatherToClipboardButton.actionName, GATHER_PREFIX);
    let gatherToNotebookFullActionName = Jupyter.actions.register(
        gatherToNotebookButton.action, gatherToNotebookButton.actionName, GATHER_PREFIX);
    let gatherHistoryFullActionName = Jupyter.actions.register(
        gatherHistoryButton.action, gatherHistoryButton.actionName, GATHER_PREFIX);
    let clearFullActionName = Jupyter.actions.register(
        clearButton.action, clearButton.actionName, GATHER_PREFIX);
    let buttonsGroup = Jupyter.toolbar.add_buttons_group([
        { label: gatherToClipboardButton.label, action: gatherToClipboardFullActionName },
        { label: gatherToNotebookButton.label, action: gatherToNotebookFullActionName },
        { label: gatherHistoryButton.label, action: gatherHistoryFullActionName },
        { label: clearButton.label, action: clearFullActionName }
    ]);
    
    // Add a label to the gathering part of the toolbar.
    let gatherLabel = document.createElement("div");
    gatherLabel.textContent = "Gather to:";
    gatherLabel.classList.add("jp-Toolbar-gatherlabel");
    buttonsGroup[0].insertBefore(gatherLabel, buttonsGroup.children()[0]);

    // Finish initializing the buttons.
    gatherToClipboardButton.node = new Widget({ node: buttonsGroup.children()[1] });
    gatherToNotebookButton.node = new Widget({ node: buttonsGroup.children()[2] });
    gatherHistoryButton.node = new Widget({ node: buttonsGroup.children()[3] });
    clearButton.node = new Widget({ node: buttonsGroup.children()[4] });
    
    let mergeButton = new MergeButton(Jupyter.actions, Jupyter.notebook);
    let mergeFullActionName = Jupyter.actions.register(
        mergeButton.action, mergeButton.actionName, GATHER_PREFIX);
    let mergeButtonGroup = Jupyter.toolbar.add_buttons_group(
        [{ label: mergeButton.label, action: mergeFullActionName }]);
    mergeButton.node = new Widget({ node: mergeButtonGroup.children()[0] });

    // Add widget for viewing history
    let revisionBrowser = new RevisionBrowser(gatherModel);
    document.body.appendChild(revisionBrowser.node);

    // When pasting gathered cells, select those cells. This is hacky: we add a flag to the
    // gathered cells (justPasted) so we can find them right after the paste, as there is no
    // listener for pasting gathered cells in the notebook API.
    Jupyter.notebook.events.on('select.Cell', (_: Jupyter.Event, data: { cell: Cell }) => {
        
        let cell = data.cell;
        if (cell.metadata.justPasted) {

            // Select all of the gathered cells.
            let gatheredCellIndexes = cell.notebook.get_cells()
            .map((c, i): [Cell, number] => [c, i])
            .filter(([c, i]) => c.metadata.justPasted)
            .map(([c, i]) => i);
            let firstGatheredIndex = Math.min(...gatheredCellIndexes);
            let lastGatheredIndex = Math.max(...gatheredCellIndexes);
            Jupyter.notebook.select(firstGatheredIndex, true);
            Jupyter.notebook.select(lastGatheredIndex, false);

            // We won't use the `gathered` flag on these cells anymore, so remove them from the cells.
            cell.notebook.get_cells()
            .forEach((c) => {
                if (c.metadata.justPasted) {
                    delete c.metadata.justPasted;
                }
            });
        }
    });    
    
    notificationWidget = notification_area.new_notification_widget("gather");
}
