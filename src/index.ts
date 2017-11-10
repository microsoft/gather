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

    panel.notebook.model.stateChanged.connect(this.onCellsChanged, this);

    return new DisposableDelegate(() => {
      checkbox.dispose();
    });
  }

  private onCellsChanged(sender: INotebookModel, value: any) {
  }
}


function activate(app: JupyterLab) {
  app.docRegistry.addWidgetExtension('Notebook', new ButtonExtension());
};


export default plugin;
