/*
 * Some @jupyterlab libraries require the 'fetch' function that is usually available when running
 * the code in the browser. This line loads a mock of the fetch function.
 */
global.fetch = require("jest-fetch-mock");
