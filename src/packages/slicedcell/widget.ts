import { PanelLayout } from '@phosphor/widgets';
import { Widget } from '@phosphor/widgets';
import { ISlicedCellModel } from './model';
import { CharacterRange } from '../codeversion';
import CodeMirror = require('codemirror');


/**
 * The class name added to sliced cell widgets.
 */
const SLICED_CELL_CLASS = 'jp-SlicedCell';

/**
 * The class name added to diffed sliced cell widgets.
 */
const DIFFED_SLICED_CELL_CLASS = 'jp-DiffedSlicedCell';

/**
 * The class name added to the editor area of a sliced cell.
 */
const SLICED_CELL_EDITOR_CLASS = 'jp-SlicedCell-editor';

/**
 * The class name added to editor text that was updated.
 */
const SLICED_CELL_UPDATED_TEXT_CLASS = 'jp-SlicedCell-editor-updatedtext';

/**
 * The class name added to editor text that hasn't been updated.
 */
// const SLICED_CELL_UNCHANGED_TEXT_CLASS = 'jp-SlicedCell-editor-unchangedtext';

/**
 * The class name to add to editor text that is out of the slice.
 */
// const SLICED_CELL_OUTOFSLICE_TEXT_CLASS = 'jp-SlicedCell-editor-outofslicetext';

/**
 * The class name added to editor text for hiding lines.
 */
// const SLICED_CELL_HIDE_TEXT_CLASS = 'jp-SlicedCell-editor-hidetext';

/**
 * The class name to add to editor text for revealed lines.
 */
// const SLICED_CELL_REVEAL_TEXT_CLASS = 'jp-SlicedEditor-editor-revealtext';

/**
 * Number of lines of context to show before and after updated code.
 */
const CONTEXT_SIZE = 1;

/**
 * The class name given to cell area widgets.
 */
const CELL_AREA_CLASS = 'jp-CellArea';

/**
 * The class name added to the prompt area of cell.
 */
// const INPUT_AREA_PROMPT_CLASS = 'jp-InputArea-prompt';

/**
 * A widget for showing a cell with a code slice.
 */
export class SlicedCell extends Widget {
    /**
     * Construct a new sliced cell.
     */
    constructor(options: SlicedCell.IOptions) {
        super();
        this.addClass(SLICED_CELL_CLASS);

        this.model = options.model;

        let codeMirrorElement = document.createElement("div");
        let codeMirror = CodeMirror(codeMirrorElement, {
            value: this.model.sourceCode,
            mode: "python",
            readOnly: true
        });
        let codeMirrorWidget = new Widget({ node: codeMirror.getWrapperElement() });
        this._editor = codeMirror;
        this._codeMirrorWidget = codeMirrorWidget;
        codeMirrorWidget.addClass(SLICED_CELL_EDITOR_CLASS);

        let layout = (this.layout = new PanelLayout());
        layout.addWidget(codeMirrorWidget);
        this.initializeEditor();

        // Add a class to all text that doesn't belong in the slice.
        /* 
        let codeMirrorDoc = editor.getDoc();
        let rangeStart = 0;
        this.model.sliceRanges.forEach(function(sliceRange: CharacterRange) {
            if (sliceRange.start > rangeStart) {
                codeMirrorDoc.markText(
                    codeMirrorDoc.posFromIndex(rangeStart),
                    codeMirrorDoc.posFromIndex(sliceRange.start),
                    { className: SLICED_CELL_OUTOFSLICE_TEXT_CLASS }
                );
            }
            rangeStart = sliceRange.end;
        });
        codeMirrorDoc.markText(
            codeMirrorDoc.posFromIndex(rangeStart),
            { line: codeMirrorDoc.lastLine() + 1, ch: 0 },
            { className: SLICED_CELL_OUTOFSLICE_TEXT_CLASS }
        );
        */
    }

    initializeEditor() {
        // XXX: If I don't call this method with a delay, the text doesn't appear.
        let codeMirrorEditor: CodeMirror.Editor = this._editor;
        // let codeMirrorWidget = this._codeMirrorWidget
        setTimeout(function() {
            // codeMirrorEditor.setOption('mode', 'ipython');
            // codeMirrorEditor.setOption('mode', 'python');
            // codeMirrorWidget.show();
            codeMirrorEditor.refresh();
        }, 1);
    }

    /**
     * The model used by the widget.
     */
    readonly model: ISlicedCellModel;

    /**
     * Dispose of the resources held by the widget.
     */
    dispose() {
        // Do nothing if already disposed.
        if (this.isDisposed) {
            return;
        }
        this._editor = null;
        super.dispose();
    }

    protected _editor: CodeMirror.Editor = null;
    protected _codeMirrorWidget: Widget;
}

/**
 * A widget for showing a cell with a code slice, diff'd to another cell.
 */
export class DiffedSlicedCell extends SlicedCell {
    /**
     * Construct a new diffed sliced cell.
     */
    constructor(options: SlicedCell.IOptions) {

        super(options);
        this.addClass(DIFFED_SLICED_CELL_CLASS);

        let codeMirrorDoc: CodeMirror.Doc = this._editor.getDoc();

        let linesToShow: Array<number> = new Array<number>();
        this.model.diff.updatedRanges.forEach(function(range: CharacterRange) {

            // Build a list of lines that should be showing in the cell.
            let startPosition: CodeMirror.Position = codeMirrorDoc.posFromIndex(range.start);
            let endPosition: CodeMirror.Position = codeMirrorDoc.posFromIndex(range.end + 1);
            for (let i = startPosition.line - CONTEXT_SIZE; i <= endPosition.line + CONTEXT_SIZE; i++) {
                if (i < codeMirrorDoc.firstLine() || i > codeMirrorDoc.lastLine()) continue;
                if (linesToShow.indexOf(i) == -1) {
                    linesToShow.push(i);
                }
            }

            // Highlight all cell text that was updated in the diff.
            codeMirrorDoc.markText(startPosition, endPosition,
                { className: SLICED_CELL_UPDATED_TEXT_CLASS });
        });
        linesToShow.sort(function(a, b) { return a - b; });

        // Add a class to all text that wasn't changed.
        /*
        this.model.diff.sameRanges.forEach(function(range: CharacterRange) {
            codeMirrorDoc.markText(
                codeMirrorDoc.posFromIndex(range.start),
                codeMirrorDoc.posFromIndex(range.end + 1),
                { className: SLICED_CELL_UNCHANGED_TEXT_CLASS }
            );
        });

        // Make a list of what lines to hide.
        let hiddenLineRanges: Array<[number, number]> = new Array<[number, number]>();
        let hiddenRangeStart: number = -1;
        for (let i = codeMirrorDoc.firstLine(); i <= codeMirrorDoc.lastLine(); i++) {
            if (linesToShow.indexOf(i) == -1 && hiddenRangeStart == -1) {
                hiddenRangeStart = i;
            } else if (linesToShow.indexOf(i) != -1 && hiddenRangeStart != -1) {
                hiddenLineRanges.push([hiddenRangeStart, i]);
                hiddenRangeStart = -1;
            }
        }
        if (hiddenRangeStart != -1) {
            hiddenLineRanges.push([hiddenRangeStart, codeMirrorDoc.lastLine() + 1]);
        }
        
        let revealMarkers: Array<CodeMirror.TextMarker> = new Array<CodeMirror.TextMarker>();
        let editor: CodeMirror.Editor = this._editor;

        // Hide all of the hidden lines.
        let hideRange = function(from: CodeMirror.Position, to: CodeMirror.Position) {
            let replacement: HTMLElement = document.createElement('span');
            replacement.classList.add(SLICED_CELL_HIDE_TEXT_CLASS);
            replacement.textContent = "... click to show hidden lines ...";
            let hideMarker: CodeMirror.TextMarker = codeMirrorDoc.markText(from, to, { replacedWith: replacement });
            // When someone clicks on a hidden line, reveal it.
            replacement.onclick = function(event: MouseEvent) {
                hideMarker.clear();
                // If we don't refresh the editor, some of the hidden code might not get shown.
                editor.refresh();
                // Add a marker to the revealed code, so we can hide it again.
                let revealMarker: CodeMirror.TextMarker = codeMirrorDoc.markText(
                    from, to, { className: SLICED_CELL_REVEAL_TEXT_CLASS });
                revealMarkers.push(revealMarker);
                // This prevents the event by getting handled by the editor, which might detect
                // this as a click on the `revealMarker` and hide the text again.
                event.stopPropagation();
            }
        };
        hiddenLineRanges.forEach(function(lineRange: [number, number]) {
            // If the line ends with "\n", don't hide the last character; keep it for prettiness.
            let endIndex = codeMirrorDoc.indexFromPos({ line: lineRange[1], ch: 0 });
            if (codeMirrorDoc.getValue()[endIndex - 1] == '\n') {
                endIndex -= 1;
            }
            hideRange({ line: lineRange[0], ch: 0 }, codeMirrorDoc.posFromIndex(endIndex));
        });

        // Whenever someone clicks on hidden lines that were revealed, hide them again.
        editor.getWrapperElement().onclick = function(event: MouseEvent) {
            let clickPosition: CodeMirror.Position = editor.coordsChar({ left: event.clientX, top: event.clientY });
            for (let marker of editor.getDoc().findMarksAt(clickPosition)) {
                let markerIndex = revealMarkers.indexOf(marker);
                if (markerIndex != -1) {
                    let range = marker.find();
                    marker.clear();
                    revealMarkers.splice(markerIndex, 1);
                    hideRange(range.from, range.to);
                }
            }
        }
        */

        // TODO(andrewhead): set this as a configuration parameter.
        // If there is no new code in this cell, hide it.
        if (linesToShow.length == 0) {
            // this.hide();
        }
    }
}

/**
 * A namespace for `SlicedCell` statics.
 */
export namespace SlicedCell {
    /**
     * The options used to create a `SlicedCell`.
     */
    export interface IOptions {
        /**
         * The model used by the widget.
         */
        model: ISlicedCellModel;
    }
}

/**
 * A cell area widget, which hosts a prompt and a cell editor widget.
 */
export class CellArea extends Widget {
    /**
     * Construct a cell area widget.
     */
    constructor(options: CellArea.IOptions) {
        super()
        this.addClass(CELL_AREA_CLASS);

        // let model = (this.model = options.model);
        // let prompt = (this._prompt = new InputPrompt());

        // prompt.executionCount = model.executionCount ? model.executionCount.toString() : "";
        // prompt.addClass(INPUT_AREA_PROMPT_CLASS);

        let layout = (this.layout = new PanelLayout());
        // layout.addWidget(prompt);

        let cellOptions: SlicedCell.IOptions = {
            model: options.model
        };
        if (options.showDiff) {
            layout.addWidget(new SlicedCell(cellOptions));
        } else {
            layout.addWidget(new DiffedSlicedCell(cellOptions));
        }
    }

    /**
     * The model used by the widget.
     */
    readonly model: ISlicedCellModel;

    // private _prompt: InputPrompt;
}

/**
 * A namespace for `CellArea` statics.
 */
export namespace CellArea {
    /**
     * The options used to create a `CellArea`.
     */
    export interface IOptions {
        /**
         * The model used by the widget.
         */
        model: ISlicedCellModel;

        /**
         * Whether to show a differenced version of the cell.
         */
        showDiff: boolean;
    }
}