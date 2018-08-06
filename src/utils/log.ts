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

/**
 * Utility for calling Jupyter server using AJAX.
 */
let _ajaxCaller: AjaxCaller = undefined;

/**
 * Initialize logger with Ajax method. The reason we can't just use the default jQuery AJAX
 * logger is that notebook requires requests with XSRF tokens. The right Ajax caller is the one
 * that's built into Jupyter notebook or lab that passes these tokens.
 */
export function initLogger(ajaxCaller: AjaxCaller) {
    _ajaxCaller = ajaxCaller;
}

let _statePollers: IStatePoller[] = [];

/**
 * Interface for a class that polls the state to get logging information at each log action.
 */
export interface IStatePoller {
    /**
     * Gets called on every log statement; returns JSON that should be logged.
     */
    poll(): any;
}

/**
 * Register a state poller to add information to the log on each log call.
 */
export function registerPollers(...pollers: IStatePoller[]) {
    _statePollers.push(...pollers);
}

/**
 * Log pretty much any data. Fail silently if the request can't be completed (i.e. if the plugin
 * for logging is down). Must initialize logger with `initLogger` before calling this method.
 */
export function log(eventName: string, data?: any) {
    
    data = data || {};
    
    if (_ajaxCaller == undefined) {
        console.error("Logger not initialized, skipping logging");
        return;
    }
    
    // Prepare log data.
    let postData: any = {
        timestamp: new Date().toISOString(),
        event: eventName,
        data: data
    };

    // Poll for additional data from each state poller.
    for (let poller of _statePollers) {
        let pollData = poller.poll();
        for (let k in pollData) {
            if (pollData.hasOwnProperty(k)) {
                postData[k] = pollData[k];
            }
        }
    }

    // Submit data to logger endpoint.
    _ajaxCaller.ajax("/log", {
        // If there is any sensitive data to be logged, it should first be cleaned through a
        // `toJSON` method defined on a class, or manually before passing it into this method.
        // Earlier, we used the replacer argument to JSON.stringify, but it takes too much time
        // to apply replacers to every value in the resulting JSON.
        data: JSON.stringify(postData),
        method: "POST",
        error: (_: any, textStatus: string, errorThrown: string) => {
            console.error("Failed to log", textStatus, errorThrown);
        }
    });
}