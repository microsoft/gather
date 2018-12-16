import { SlicedExecution } from "../../slicing/ExecutionSlicer";

/**
 * An interface for opening new notebooks.
 */
export interface INotebookOpener {
    /**
     * Open a new notebook containing the slice.
     */
    openNotebookForSlice: (slice: SlicedExecution) => void;
}

/**
 * An interface for opening new scripts.
 */
export interface IScriptOpener {
    /**
     * Open a new script containing the slice.
     */
    openScriptForSlice: (slice: SlicedExecution) => void;
}