import * as utils from "base/js/utils";

/**
 * Log pretty much any data. Fail silently if the request can't be completed (i.e. if the plugin
 * for logging is down).
 */
export function log(eventName: string, data: any) {
    let postData = {
        timestamp: new Date().toISOString(),
        event: eventName,
        data: data
    };
    utils.ajax("/log", {
        data: JSON.stringify(postData),
        method: "POST",
        error: (_: any, textStatus: string, errorThrown: string) => {
            console.error("Failed to log", textStatus, errorThrown);
        }
    });
}