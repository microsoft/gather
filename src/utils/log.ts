import { IReplacer, CellReplacer, DefSelectionReplacer } from "./replacers";

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

/**
 * List of replacers to be applied to logged objects to clean up the data.
 * Add to this list with `registerReplacer`. These are applied iteratively, so you can chain replacers.
 */
let _replacers: IReplacer[] = [];

/**
 * Default JSON data replacers. These are run after client-registered replacers.
 */
let _defaultReplacers: IReplacer[] = [
    new DefSelectionReplacer(),
    new CellReplacer()
];

/**
 * Register a replacer. Useful for notebook / lab-specific loggers.
 * Unlike with the conventional JSON.stringify method, these replacers will be called on values
 * *before* their toJSON() methods have been called.
 */
export function registerReplacers(...replacers: IReplacer[]) {
    _replacers.push(...replacers);
}

/**
 * Replaces entries in a JSON object with something else.
 * This is the main place we'll make sure we aren't logging anything sensitive.
 */
function replaceEntry(key: string, value: any) {
    // We try to replace `this[key]` instead of `value` as this lets us pass in the value before
    // its `toJSON` method has been called. But if none of the replacers do anything to this
    // unprocessed value, use the processed `value` that JSON.stringify provides (i.e. that 
    // turns functions to nulls, Dates to strings, etc.) 
    let unprocessedValue = this[key];
    let newValue = unprocessedValue;
    for (let replacer of _replacers.concat(_defaultReplacers)) {
        newValue = replacer.replace(key, newValue);
    }
    // If the value hasn't been transformed by the replacers, then return the version that was
    // processed by JSON.stringify (`value`).
    if (unprocessedValue == newValue) {
        return value;
    }
    return newValue;
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
        data: JSON.stringify(postData, replaceEntry),
        method: "POST",
        error: (_: any, textStatus: string, errorThrown: string) => {
            console.error("Failed to log", textStatus, errorThrown);
        }
    });
}