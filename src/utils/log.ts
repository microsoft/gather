/**
 * Interface for calling Ajax. 
 */
export interface AjaxCaller {
    ajax: (
        url: string,
        settings: {
            data: string,
            method: string,
            error: (_: any, textStatus: string, errorThrown: string) => void
        }) => void;
}

let _ajaxCaller: AjaxCaller = undefined;

/**
 * Initialize logger with Ajax method. The reason we can't just use the default jQuery AJAX
 * logger is that notebook requires requests with XSRF tokens. The right Ajax caller is the one
 * that's built into Jupyter notebook or lab that passes these tokens.
 */
export function initLogger(ajaxCaller: AjaxCaller) {
    _ajaxCaller = ajaxCaller;
}

/**
 * Log pretty much any data. Fail silently if the request can't be completed (i.e. if the plugin
 * for logging is down). Must initialize logger with `initLogger` before calling this method.
 */
export function log(eventName: string, data: any) {
    if (_ajaxCaller == undefined) {
        console.error("Logger not initialized, skipping logging");
        return;
    }
    let postData = {
        timestamp: new Date().toISOString(),
        event: eventName,
        data: data
    };
    _ajaxCaller.ajax("/log", {
        data: JSON.stringify(postData),
        method: "POST",
        error: (_: any, textStatus: string, errorThrown: string) => {
            console.error("Failed to log", textStatus, errorThrown);
        }
    });
}