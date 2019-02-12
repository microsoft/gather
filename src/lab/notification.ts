import { DocumentRegistry } from "@jupyterlab/docregistry";
import { NotebookPanel, INotebookModel } from "@jupyterlab/notebook";
import { IDisposable, DisposableDelegate } from "@phosphor/disposable";
import { NotificationWidget } from "../packages/notification";

export class NotifactionExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {
    private notificationWidget: NotificationWidget;

    createNew(panel: NotebookPanel, _: DocumentRegistry.IContext<INotebookModel>): IDisposable {
        this.notificationWidget = new NotificationWidget();
        panel.toolbar.insertItem(9, 'notifications', this.notificationWidget);
        return new DisposableDelegate(() => {
            this.notificationWidget.dispose();
        })
    };

    showMessage(message: string) {
        this.notificationWidget.showMessage(message);
    }
}