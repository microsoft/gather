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
        config: Config;
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
        events: Events;
        keyboard_manager: KeyboardManager;
    }

    interface Output {
        output_type: string;
    }

    interface OutputArea {
        outputs: Output[];
    }

    interface CodeCell extends Cell {
        cell_id: string;
        cell_type: 'code';
        input_prompt_number: number;
        output_area: OutputArea;
        kernel: Kernel;
        notebook: Notebook;
        tooltip: Tooltip;
        fromJSON: (data: JSON) => void;
        toJSON: () => JSON;
    }
    interface CodeCellConstructor {
        new(kernel: Kernel, options: CodeCellOptions): CodeCell;
    }
    var CodeCell: CodeCellConstructor;

    interface Kernel {}

    interface Tooltip {}

    interface Config {}

    interface CodeCellOptions {
        events: Events,
        config: Config,
        keyboard_manager: KeyboardManager,
        notebook: Notebook,
        tooltip: Tooltip
    }

    interface Events {
        on(name: string, callback: (evt: any, data: any) => void): void;
    }

    interface Contents {
        new_untitled(path: string, options: { ext?: string, type?: string }): Promise<{ path: string }>;
    }

    interface ShellReplyContent {
        execution_count: number;
        status: string;
    }

    interface NotificationWidget {
        set_message: (message: string, timeMs?: number) => void;
    }

    interface NotificationArea {
        new_notification_widget: (name: string) => NotificationWidget;
    }

    var contents: Contents;
    var notebook: Notebook;
    var dialog: Dialog;
    var keyboard_manager: KeyboardManager;
    var notification_area: NotificationArea;
}

// declare const Jupyter: Jupyter.JupyterStatic;

declare module "base/js/namespace" {
    export = Jupyter;
}
