/**
 * Configuration with hints on how to slice.
 * Includes defaults of methods that will probably modify their variables.
 */
export class SlicerConfig {

    /**
     * Construct a slicer configuration.
     */
    constructor(functionConfigs?: FunctionConfig[]) {
        this._functionConfigs = functionConfigs || this._defaultFunctionConfigs;
    }

    get functionConfigs(): FunctionConfig[] {
        return this._functionConfigs;
    }

    private _functionConfigs: FunctionConfig[];
    
    private _defaultFunctionConfigs = [
        new FunctionConfig({ functionName: "load", mutatesInstance: true }),
        new FunctionConfig({
            functionName: "rectangle",
            positionalArgumentsMutated: [0],
            keywordArgumentsMutated: ["img"],
        }),
    ];
}

export class FunctionConfig {

    constructor(options: FunctionConfig.IOptions) {
        this.functionName = options.functionName;
        this.mutatesInstance = options.mutatesInstance || false;
        this.positionalArgumentsMutated = options.positionalArgumentsMutated || [];
        this.keywordArgumentsMutated = options.keywordArgumentsMutated || [];
    }
    
    readonly functionName: string;
    readonly mutatesInstance: boolean;
    readonly positionalArgumentsMutated: number[];
    readonly keywordArgumentsMutated: string[];
}

/**
 * Namespace for the function config class.
 */
export namespace FunctionConfig {
    /**
     * Options for initializing a function config.
     * If an argument can be mutated by the function, this config should list both its position
     * and its name, so it can be identified by keyword or position.
     */
    export interface IOptions {
        /**
         * The name of the function.
         */
        functionName: string;

        /**
         * Whether the function can change the instance it is called on.
         */
        mutatesInstance?: boolean;

        /**
         * Positions of positional arguments this method can mutate.
         */
        positionalArgumentsMutated?: number[];

        /**
         * Names of keyword arguments this method can mutate.
         */
        keywordArgumentsMutated?: string[];
    }
}