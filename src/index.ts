import {
  IDisposable, DisposableDelegate
} from '@phosphor/disposable';

import {
  JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
  DocumentRegistry
} from '@jupyterlab/docregistry';

import {
  NotebookPanel, INotebookModel
} from '@jupyterlab/notebook';

import {
  ToolbarCheckbox
} from './ToolboxCheckbox';

import {
  IObservableUndoableList
} from '@jupyterlab/coreutils';

import {
  ICellModel
} from '@jupyterlab/cells';


const plugin: JupyterLabPlugin<void> = {
  activate,
  id: 'live-code-cells:liveCodePlugin',
  autoStart: true
};


export
  class ButtonExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {

  createNew(panel: NotebookPanel, context: DocumentRegistry.IContext<INotebookModel>): IDisposable {
    let checkbox = new ToolbarCheckbox(panel.notebook);
    panel.toolbar.addItem('liveCode', checkbox);

    panel.notebook.model.cells.changed.connect(this.onCellsChanged, this);

    return new DisposableDelegate(() => {
      checkbox.dispose();
    });
  }

  private onCellsChanged(cells: IObservableUndoableList<ICellModel>, value: any): void {
    if (value.type == 'add') {
      const cell = value.newValues[0] as ICellModel;
      cell.stateChanged.connect((cell, value) => {
        if (value.name == "executionCount" && value.newValue) {
          let content = '';
          for (let i = 0; i < cells.length; i++) {
            content += '###\n' + cells.get(i).value.text + '\n';
          }
          console.log(content);

          // TODO invoke analysis and run extra cells
        }
      });
      // Use the following if we want to be 'keystroke' live
      // cell.contentChanged.connect(this.onCellContentChanged, this);
    }
  }
}


function activate(app: JupyterLab) {
  app.docRegistry.addWidgetExtension('Notebook', new ButtonExtension());
};


export default plugin;
