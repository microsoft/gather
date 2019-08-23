import {AbstractCell} from '@msrvida/python-program-analysis';
import { ICodeCellModel, CodeCellModel } from '@jupyterlab/cells';
import { UUID } from '@phosphor/coreutils';
import { IOutputModel } from '@jupyterlab/rendermime';
import { nbformat } from '@jupyterlab/coreutils';


/**
 * Wrapper around a code cell model created by Jupyter Lab. Provides a consistent interface to
 * lab data to other cells that have been loaded from a log.
 */
export class LabCell extends AbstractCell {
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
      if (!this._model.metadata.has('persistent_id')) {
        this._model.metadata.set('persistent_id', UUID.uuid4());
      }
      return this._model.metadata.get('persistent_id') as string;
    }
  
    get executionEventId(): string {
      return this._model.metadata.get('execution_event_id') as string;
    }
  
    set executionEventId(id: string) {
      this._model.metadata.set('execution_event_id', id);
    }
  
    get text(): string {
      return this._model.value.text;
    }
  
    set text(text: string) {
      this._model.value.text = text;
    }
  
    get lastExecutedText(): string {
      return this._model.metadata.get('last_executed_text') as string;
    }
  
    set lastExecutedText(text: string) {
      this._model.metadata.set('last_executed_text', text);
    }
  
    get executionCount(): number {
      return this._model.executionCount;
    }
  
    set executionCount(count: number) {
      this._model.executionCount = count;
    }
  
    get isCode(): boolean {
      return this._model.type == 'code';
    }
  
    get hasError(): boolean {
      return this.output.some(o => o.type === 'error');
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
      return this._model.metadata.get('gathered') as boolean;
    }
  
    deepCopy(): LabCell {
      return new LabCell(
        new CodeCellModel({ id: this.id, cell: this.model.toJSON() })
      );
    }
  
    serialize(): any {
      return this._model.toJSON();
    }
  
    is_cell: boolean = true;
    is_outputter_cell: boolean = true;
    private _model: ICodeCellModel;
  }
  