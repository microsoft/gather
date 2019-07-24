import { ICell } from './cell';
import { LocationSet } from '../analysis/slice/slice';

/**
 * A slice of a cell.
 */
export class CellSlice {
  /**
   * Construct an instance of a cell slice.
   */
  constructor(cell: ICell, slice: LocationSet, executionTime?: Date) {
    this.cell = cell;
    this._slice = slice;
    this.executionTime = executionTime;
  }

  /**
   * Get the text in the slice of a cell.
   */
  get textSlice(): string {
    return this.getTextSlice(false);
  }

  /**
   * Get the text of all lines in a slice (no deletions from lines).
   */
  get textSliceLines(): string {
    return this.getTextSlice(true);
  }

  private getTextSlice(fullLines: boolean): string {
    let sliceLocations = this.slice.items;
    let textLines = this.cell.text.split('\n');
    return sliceLocations
      .sort((l1, l2) => l1.first_line - l2.first_line)
      .map(loc => {
        // grab the desired subset of lines (they are one-indexed)
        const lines = textLines.slice(loc.first_line - 1, loc.last_line + (loc.last_column > 0 ? 0 : -1));
        if (!fullLines) {
          // if we don't want full lines, then adjust the first and last lines based on columns
          if (loc.last_line === loc.first_line) {
            lines[0] = lines[0].slice(loc.first_column, loc.last_column);
          } else {
            lines[0] = lines[0].slice(loc.first_column);
            const last = lines.length - 1;
            lines[last] = lines[last].slice(0, loc.last_column);
          }
        }
        return lines.join('\n');
      })
      .filter(text => text != '')
      .join('\n');
  }

  /**
   * Get the slice.
   */
  get slice(): LocationSet {
    return this._slice;
  }

  /**
   * Set the slice.
   */
  set slice(slice: LocationSet) {
    this._slice = slice;
  }

  readonly cell: ICell;
  readonly executionTime: Date;
  private _slice: LocationSet;
}
