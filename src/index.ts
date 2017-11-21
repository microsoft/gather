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
  NotebookPanel, INotebookModel, Notebook
} from '@jupyterlab/notebook';

import {
  ToolbarCheckbox
} from './ToolboxCheckbox';

import {
  IObservableUndoableList
} from '@jupyterlab/coreutils';

import {
  ICellModel, CodeCell
} from '@jupyterlab/cells';

import {
  IClientSession
} from '@jupyterlab/apputils';

import {
  KernelMessage
} from '@jupyterlab/services';


import * as python3 from './parsers/python/python3'
import { ControlFlowGraph } from './ControlFlowGraph';
import { dataflowAnalysis } from './DataflowAnalysis';
import { NumberSet } from './Set';


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

    panel.notebook.model.cells.changed.connect((cells, value) =>
      this.onCellsChanged(panel.notebook, panel.session, cells, value), this);

    return new DisposableDelegate(() => {
      checkbox.dispose();
    });
  }


  private findChangedLines(content: string, [startLine, endLine]: [number, number]): NumberSet {
    const ast = python3.parse(content);
    const cfg = new ControlFlowGraph(ast);
    const dfa = dataflowAnalysis(cfg); // 
    console.log(dfa);

    const changedLineNumbers = new NumberSet();
    for (let line = startLine; line <= endLine; line++) {
      changedLineNumbers.add(line);
    }
    let lastSize: number;
    do {
      lastSize = changedLineNumbers.size;
      for (let flow of dfa.items) {
        const fromLoc = flow.fromNode.location;
        for (let i = fromLoc.first_line; i <= fromLoc.last_line + (fromLoc.last_column ? 0 : -1); i++) {
          if (changedLineNumbers.contains(i)) {
            const toLoc = flow.toNode.location;
            for (let j = toLoc.first_line; j <= toLoc.last_line + (toLoc.last_column ? 0 : -1); j++) {
              changedLineNumbers.add(j);
            }
            // dfa.remove(df);
            break;
          }
        }
      }
    } while (changedLineNumbers.size > lastSize);
    return changedLineNumbers;
  }


  private onCellsChanged(notebook: Notebook, session: IClientSession, cells: IObservableUndoableList<ICellModel>, value: any): void {
    if (value.type == 'add') {
      const cell = value.newValues[0] as ICellModel;
      cell.stateChanged.connect((changedCell, value) => {
        if (value.name == "executionCount" && value.newValue) { // cell has be executed
          let content = '';
          let lineNumber = 1;
          let changedCellLineNumberss: [number, number];
          const cellByLine: ICellModel[] = [];
          for (let i = 0; i < cells.length; i++) {
            const cell = cells.get(i);
            const cellText = cell.value.text;
            content += cellText + '\n';
            const lineCount = cellText.split('\n').length;
            for (let lc = 0; lc < lineCount; lc++) {
              cellByLine[lc + lineNumber] = cell;
            }
            if (cell.id === changedCell.id) {
              changedCellLineNumberss = [lineNumber, lineNumber + lineCount - 1];
            }
            lineNumber += lineCount;
          }

          const changedLineNumbers = this.findChangedLines(content, changedCellLineNumberss);
          const changedCells: ICellModel[] = [];
          for (let line of changedLineNumbers.items.sort((line1, line2) => line1 - line2)) {
            if (cellByLine[line] != changedCells[changedCells.length - 1]) {
              changedCells.push(cellByLine[line]);
            }
          }

          let work: (() => Promise<KernelMessage.IExecuteReplyMsg>)[] = []
          for (let cell of changedCells) {
            if (cell.id === changedCell.id) continue; // already executed
            console.log('exec cell', cell.value.text);
            const cellWidget = <CodeCell>notebook.widgets.find(c => c.model.id == cell.id);
            if (cellWidget)
              work.push(() => {
                console.log('RUN', cellWidget.model.value.text);
                return CodeCell.execute(cellWidget, session);
              });
          }
          work.reduce((promiseChain, currentTask) => {
            return promiseChain.then(chainResults =>
              currentTask().then(currentResult =>
                [...chainResults, currentResult]
              )
            );
          }, Promise.resolve([])).then(arrayOfResults => {
            // Do something with all results
            console.log(arrayOfResults);
          });
        }
      });
    }
  }
}


function activate(app: JupyterLab) {
  app.docRegistry.addWidgetExtension('Notebook', new ButtonExtension());
};


export default plugin;
