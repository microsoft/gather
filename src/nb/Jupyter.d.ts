declare namespace Jupyter {

    interface Cell {
        cell_type: string;
    }

    interface Notebook {
        get_cells(): Cell[];
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

    interface JupyterStatic {
        notebook: Notebook;
        dialog: Dialog;
        keyboard_manager: KeyboardManager;
    }

}

declare const Jupyter: Jupyter.JupyterStatic;

declare module "base/js/namespace" {
    export = Jupyter;
}
