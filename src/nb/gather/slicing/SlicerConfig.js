define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    /**
     * Configuration with hints on how to slice.
     * Includes defaults of methods that will probably modify their variables.
     */
    var SlicerConfig = /** @class */ (function () {
        /**
         * Construct a slicer configuration.
         */
        function SlicerConfig(functionConfigs) {
            this._defaultFunctionConfigs = [
                new FunctionConfig({ functionName: "load", mutatesInstance: true }),
                new FunctionConfig({
                    functionName: "rectangle",
                    positionalArgumentsMutated: [0],
                    keywordArgumentsMutated: ["img"],
                }),
            ];
            this._functionConfigs = functionConfigs || this._defaultFunctionConfigs;
        }
        Object.defineProperty(SlicerConfig.prototype, "functionConfigs", {
            get: function () {
                return this._functionConfigs;
            },
            enumerable: true,
            configurable: true
        });
        return SlicerConfig;
    }());
    exports.SlicerConfig = SlicerConfig;
    var FunctionConfig = /** @class */ (function () {
        function FunctionConfig(options) {
            this.functionName = options.functionName;
            this.mutatesInstance = options.mutatesInstance || false;
            this.positionalArgumentsMutated = options.positionalArgumentsMutated || [];
            this.keywordArgumentsMutated = options.keywordArgumentsMutated || [];
        }
        return FunctionConfig;
    }());
    exports.FunctionConfig = FunctionConfig;
});
