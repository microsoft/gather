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
  IObservableUndoableList, IObservableList
} from '@jupyterlab/coreutils';

import {
  ICellModel, CodeCell
} from '@jupyterlab/cells';

import {
  IClientSession
} from '@jupyterlab/apputils';


import * as python3 from './parsers/python/python3';
import { ILocation } from './parsers/python/python_parser';
import { ControlFlowGraph } from './ControlFlowGraph';
import { dataflowAnalysis } from './DataflowAnalysis';
import { NumberSet, range } from './Set';


const plugin: JupyterLabPlugin<void> = {
  activate,
  id: 'live-code-cells:liveCodePlugin',
  autoStart: true
};


function showStaleness(cell: CodeCell, stale: boolean) {
  cell.inputArea.editorWidget.node.style.backgroundColor = stale ? 'pink' : null;
}


class CellLiveness {

  private executingCells = false;

  constructor(private checkbox: ToolbarCheckbox) {
  }

  private findLinesToExecute(program: string, [startLine, endLine]: [number, number]): NumberSet {
    const ast = python3.parse(program);
    const cfg = new ControlFlowGraph(ast);
    const dfa = dataflowAnalysis(cfg); // 
    console.log(dfa);

    let changedLineNumbers = new NumberSet();
    for (let line = startLine; line <= endLine; line++) {
      changedLineNumbers.add(line);
    }
    let lastSize: number;
    do {
      function lineRange(loc: ILocation): NumberSet {
        return range(loc.first_line, loc.last_line + (loc.last_column ? 1 : 0));
      }
      lastSize = changedLineNumbers.size;
      for (let flow of dfa.items) {
        const fromLines = lineRange(flow.fromNode.location);
        const toLines = lineRange(flow.toNode.location);
        if (!changedLineNumbers.intersect(fromLines).empty) {
          changedLineNumbers = changedLineNumbers.union(toLines);
        }
      }
    } while (changedLineNumbers.size > lastSize);
    return changedLineNumbers;
  }


  private findStaleCells(changedCell: ICellModel, cells: IObservableList<ICellModel>): ICellModel[] {
    let program = '';
    let lineNumber = 1;
    let changedCellLineNumbers: [number, number];
    const cellByLine: ICellModel[] = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells.get(i);
      const cellText = cell.value.text;
      program += cellText + '\n';
      const lineCount = cellText.split('\n').length;
      for (let lc = 0; lc < lineCount; lc++) {
        cellByLine[lc + lineNumber] = cell;
      }
      if (cell.id === changedCell.id) {
        changedCellLineNumbers = [lineNumber, lineNumber + lineCount - 1];
      }
      lineNumber += lineCount;
    }

    const changedLineNumbers = this.findLinesToExecute(program, changedCellLineNumbers);
    const changedCells: ICellModel[] = [];
    for (let line of changedLineNumbers.items.sort((line1, line2) => line1 - line2)) {
      if (cellByLine[line] != changedCells[changedCells.length - 1]) {
        changedCells.push(cellByLine[line]);
      }
    }
    return changedCells;
  }


  public onCellsChanged(notebook: Notebook, session: IClientSession, allCells: IObservableUndoableList<ICellModel>, value: any): void {
    if (value.type == 'add') {
      const cell = value.newValues[0] as ICellModel;
      cell.stateChanged.connect((changedCell, value) => {
        // If cell has been executed
        if (value.name == "executionCount" && value.newValue) {
          const cellWidget = <CodeCell>notebook.widgets.find(c => c.model.id == cell.id);
          showStaleness(cellWidget, false);

          // If this cell executing is due to the user
          if (!this.executingCells) {
            // Depending on the checkbox, we either execute the dependent cells
            // or show that they are stale.
            const handleStaleness: (cell: CodeCell) => Promise<any> = this.checkbox.checked ?
              cellWidget => CodeCell.execute(cellWidget, session) :
              cellWidget => {
                showStaleness(cellWidget, true);
                return Promise.resolve(0);
              }

            const tasks = this.findStaleCells(changedCell, allCells)
              .filter(cell => cell.id !== changedCell.id)
              .map(cell => <CodeCell>notebook.widgets.find(c => c.model.id == cell.id))
              .filter(cellWidget => cellWidget)
              .map(cellWidget => () => handleStaleness(cellWidget));

            this.executingCells = true;
            doTasksInOrder(tasks).then(() => {
              this.executingCells = false;
            });
          }
        }
      }, this);
    }
  }

}


export
  class ButtonExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {

  createNew(panel: NotebookPanel, context: DocumentRegistry.IContext<INotebookModel>): IDisposable {
    const checkbox = new ToolbarCheckbox(panel.notebook);
    panel.toolbar.insertItem(9, 'liveCode', checkbox);
    const liveness = new CellLiveness(checkbox);

    panel.notebook.model.cells.changed.connect(
      (cells, value) =>
        liveness.onCellsChanged(panel.notebook, panel.session, cells, value),
      liveness);

    return new DisposableDelegate(() => {
      checkbox.dispose();
    });
  }

}


function activate(app: JupyterLab) {
  app.docRegistry.addWidgetExtension('Notebook', new ButtonExtension());
};


function doTasksInOrder<T>(work: (() => Promise<T>)[]) {
  return work.reduce((responseList, currentTask) => {
    return responseList.then(previousResults =>
      currentTask().then(currentResult =>
        [...previousResults, currentResult]
      )
    );
  }, Promise.resolve([]))
}

export default plugin;
