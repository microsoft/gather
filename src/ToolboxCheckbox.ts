import {
    Widget
} from '@phosphor/widgets';

import {
    Notebook
} from '@jupyterlab/notebook';



const TOOLBAR_CHECKBOX_CLASS = 'jp-Notebook-toolbarCheckbox';


export
    class ToolbarCheckbox extends Widget {
    constructor(widget: Notebook) {
        super({ node: createToolbarCheckbox() });
        this.addClass(TOOLBAR_CHECKBOX_CLASS);
    }
}


function createToolbarCheckbox(): HTMLElement {
    let div = document.createElement('div');

    const checkboxId = 'jp-live-code';
    let select = document.createElement('input');
    select.setAttribute('type', 'checkbox');
    select.setAttribute('id', checkboxId);
    select.className = TOOLBAR_CHECKBOX_CLASS;
    div.appendChild(select);

    let label = document.createElement('label');
    label.setAttribute('for', checkboxId);
    label.innerText = 'Live code';
    div.appendChild(label);

    return div;
}
