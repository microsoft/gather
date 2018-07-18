import {
    Widget
} from '@phosphor/widgets';

import {
    Notebook
} from '@jupyterlab/notebook';



const TOOLBAR_CHECKBOX_CLASS = 'jp-Notebook-toolbarCheckbox';


export
    class ToolbarCheckbox extends Widget {

    private input: HTMLInputElement;

    constructor(widget: Notebook) {
        let label = document.createElement('label');
        label.innerText = 'Live code';

        let input = document.createElement('input');
        input.setAttribute('type', 'checkbox');
        input.className = TOOLBAR_CHECKBOX_CLASS;
        label.appendChild(input);

        super({ node: label });
        this.input = input;
        this.addClass(TOOLBAR_CHECKBOX_CLASS);
    }

    public get checked() {
        return this.input.checked;
    }

}


