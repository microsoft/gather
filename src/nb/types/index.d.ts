/*
This is an attempt to get minimal coverage of Jupyter Notebook's internal API 
for writing our extension. We welcome contributions to flesh this out more!
*/
declare namespace Jupyter {

    interface Notebook {
        base_url: string;
        get_cells(): Cell[];
        get_selected_cell(): Cell;
        select: (index: number, moveanchor: boolean) => Notebook;
        events: Events;
        contents: Contents;
        config: Config;
        clipboard: Array<any>;
        enable_paste: () => void;
        paste_enabled: boolean;
        toJSON: () => NotebookJson;
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

    interface Cell {
        cell_id: string;
        cell_type: 'code' | 'markdown';
        element: JQuery;
        notebook: Notebook;
        metadata: CellMetadata;
        code_mirror: CodeMirror.Editor;
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
        cell_type: 'code';
        input_prompt_number: number;
        output_area: OutputArea;
        kernel: Kernel;
        tooltip: Tooltip;
        fromJSON: (data: CellJson) => void;
        toJSON: () => CellJson;
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
        save(path: string, model: SaveModel): Promise<any>;
    }

    interface SaveModel {
        type: string;
        content: NotebookJson; 
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

    interface Actions {
        register: (action: Action, action_name: string, prefix: string) => string;
    }

    interface Action {
        icon: string;  // font-awesome class
        help: string;
        help_index: string;
        handler: () => void;
    }

    interface ActionSpec {
        label: string;
        action: string;  // action name
    }

    interface Toolbar {
        add_buttons_group: (actions: ActionSpec[]) => JQuery;
    }

    var actions: Actions;
    var contents: Contents;
    var dialog: Dialog;
    var keyboard_manager: KeyboardManager;
    var notebook: Notebook;
    var notification_area: NotificationArea;
    var toolbar: Toolbar;
}

// This is not from base/ns/namespace. We declared it so we can type-check the output of the
// toJSON method on notebooks.
declare interface NotebookJson {
    cells: CellJson[];
}

declare interface CellMetadata {
    gathered?: boolean;
}

declare interface CellJson {
    source: string;
    outputs: JSON[];
    cell_type: string;
    execution_count: number;
    metadata: CellJsonMetadata;
}

declare interface CellJsonMetadata {
    gathered?: boolean;
}

// declare const Jupyter: Jupyter.JupyterStatic;

declare module "base/js/namespace" {
    export = Jupyter;
}
