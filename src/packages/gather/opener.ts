import { SlicedExecution } from "../../slicing/ExecutionSlicer";

/**
 * An interface for opening new notebooks.
 */
export class INotebookOpener {
    /**
     * Open a new notebook containing the slice.
     */
    openNotebookForSlice: (slice: SlicedExecution) => void;
}