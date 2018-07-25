import { SlicedExecution } from "../../slicing/ExecutionSlicer";

/**
 * An interface for copyings cells to the clipboard.
 */
export interface ICellClipboard {
    /**
     * Copy cells in a slice to the clipboard
     */
    copy: (slice: SlicedExecution) => void;
}

/**
 * Listens to changes to the clipboard.
 */
export interface IClipboardListener {
    /**
     * Called when something is copied to the clipboard.
     */
    onCopy: (slice: SlicedExecution, clipboard: ICellClipboard) => void;
}