/*
This is an attempt to get minimal coverage of Jupyter Notebook's internal API 
for writing our extension. We welcome contributions to flesh this out more!
*/

declare namespace Jupyter {

    interface Notebook {
        base_url: string;
        get_cells(): Cell[];
        get_selected_cell(): Cell;
        events: Events;
        contents: Contents;
    }

    interface Dialog {
        modal(spec: { title: string, body: any, buttons: any }): void;
    }

    interface CommandShortcuts {
        add_shortcut(shortcut: string, callback: () => void): void;
    }

    interface KeyboardManager {
        command_shortcuts: CommandShortcuts;
    }

    interface Event {
        namespace: string;
        type: string;
    }

    interface CodeMirror {
        getValue(): string;
    }

    interface Cell {
        cell_id: string;
        cell_type: 'code' | 'markdown';
        notebook: Notebook;
        code_mirror: CodeMirror;
    }

    interface Output {
        output_type: string;
    }

    interface OutputArea {
        outputs: Output[];
    }

    interface CodeCell extends Cell {
        cell_type: 'code';
        input_prompt_number: number;
        output_area: OutputArea;
    }

    interface Events {
        on(name: string, callback: (evt: any, data: any) => void): void;
    }

    interface Contents {
        new_untitled(path: string, options: { ext?: string, type?: string }): Promise<{ path: string }>;
    }

    interface JupyterStatic {
        contents: Contents;
        notebook: Notebook;
        dialog: Dialog;
        keyboard_manager: KeyboardManager;
    }

}

declare const Jupyter: Jupyter.JupyterStatic;

declare module "base/js/namespace" {
    export = Jupyter;
}
