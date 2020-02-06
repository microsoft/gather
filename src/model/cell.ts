import { Cell } from "@andrewhead/python-program-analysis";
import { CodeCellModel, ICodeCellModel } from "@jupyterlab/cells";
import { nbformat } from "@jupyterlab/coreutils";
import { IOutputModel } from "@jupyterlab/rendermime";
import { UUID } from "@phosphor/coreutils";

/**
 * Abstract class for accessing the data that nbgather needs for a cell.
 */
export abstract class NbGatherCell implements Cell {
  abstract id: string;
  abstract executionCount: number;
  abstract executionEventId: string;
  abstract persistentId: string;
  abstract hasError: boolean;
  abstract text: string;
  abstract gathered: boolean;
  abstract outputs: nbformat.IOutput[];
  abstract deepCopy(): NbGatherCell;

  /**
   * The cell's text when it was executed, i.e., when the execution count was last changed.
   * This will be undefined if the cell has never been executed.
   */
  abstract lastExecutedText: string;

  get dirty(): boolean {
    return this.text !== this.lastExecutedText;
  }

  /**
   * This method is called by the logger to sanitize cell data before logging it. This method
   * should elide any sensitive data, like the cell's text.
   */
  toJSON(): any {
    return {
      id: this.id,
      executionCount: this.executionCount,
      persistentId: this.persistentId,
      lineCount: this.text.split("\n").length,
      hasError: this.hasError,
      gathered: this.gathered
    };
  }

  serialize(): nbformat.ICodeCell {
    return {
      id: this.id,
      execution_count: this.executionCount,
      source: this.text,
      cell_type: "code",
      outputs: this.outputs,
      metadata: {
        gathered: this.gathered,
        execution_event_id: this.executionEventId,
        persistent_id: this.persistentId
      }
    };
  }
}

export interface LogCellOptions {
  id?: string;
  executionCount?: number;
  persistentId?: string;
  executionEventId?: string;
  hasError?: boolean;
  text?: string;
  outputs?: nbformat.IOutput[];
}

/**
 * An interface to cell data loaded in the execution log.
 */
export class LogCell extends NbGatherCell {
  constructor(options: LogCellOptions) {
    super();
    this.id = options.id || UUID.uuid4();
    this.executionCount = options.executionCount || undefined;
    this.persistentId = options.persistentId || UUID.uuid4();
    this.executionEventId = options.executionEventId || UUID.uuid4();
    this.hasError = options.hasError || false;
    this.text = options.text || "";
    this.lastExecutedText = this.text;
    this.outputs = options.outputs || [];
    this.gathered = false;
  }

  deepCopy(): NbGatherCell {
    return new LogCell(this);
  }

  readonly id: string;
  readonly executionCount: number;
  readonly persistentId: string;
  readonly executionEventId: string;
  readonly hasError: boolean;
  readonly text: string;
  readonly lastExecutedText: string;
  readonly outputs: nbformat.IOutput[];
  readonly gathered: boolean;
}

/**
 * Wrapper around a code cell model created by Jupyter Lab, with a consistent interface for
 * accessing key data for gathering code.
 */
export class LabCell extends NbGatherCell {
  constructor(model: ICodeCellModel) {
    super();
    this._model = model;
    /*
     * Force the initialization of a persistent ID to make sure it's set before someone tries to clone the cell.
     */
    this.persistentId;
  }

  get model(): ICodeCellModel {
    return this._model;
  }

  get id(): string {
    return this._model.id;
  }

  get persistentId(): string {
    if (!this._model.metadata.has("persistent_id")) {
      this._model.metadata.set("persistent_id", UUID.uuid4());
    }
    return this._model.metadata.get("persistent_id") as string;
  }

  get executionEventId(): string {
    return this._model.metadata.get("execution_event_id") as string;
  }

  set executionEventId(id: string) {
    this._model.metadata.set("execution_event_id", id);
  }

  get text(): string {
    return this._model.value.text;
  }

  set text(text: string) {
    this._model.value.text = text;
  }

  get lastExecutedText(): string {
    return this._model.metadata.get("last_executed_text") as string;
  }

  set lastExecutedText(text: string) {
    this._model.metadata.set("last_executed_text", text);
  }

  get executionCount(): number {
    return this._model.executionCount;
  }

  set executionCount(count: number) {
    this._model.executionCount = count;
  }

  get hasError(): boolean {
    return this.output.some(o => o.type === "error");
  }

  get output(): IOutputModel[] {
    let outputs = [];
    if (this._model.outputs) {
      for (let i = 0; i < this._model.outputs.length; i++) {
        outputs.push(this._model.outputs.get(i));
      }
      return outputs;
    }
  }

  get outputs(): nbformat.IOutput[] {
    return this.output.map(output => output.toJSON());
  }

  get gathered(): boolean {
    return this._model.metadata.get("gathered") as boolean;
  }

  deepCopy(): LabCell {
    return new LabCell(
      new CodeCellModel({ id: this.id, cell: this.model.toJSON() })
    );
  }

  serialize(): any {
    return this._model.toJSON();
  }

  private _model: ICodeCellModel;
}
