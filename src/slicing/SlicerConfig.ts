import { ReferenceType } from "./DataflowAnalysis";

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
        // OpenCV
        new FunctionConfig({
            pattern: { functionName: "load" },
            instanceEffect: ReferenceType.UPDATE
        }),
        new FunctionConfig({
            pattern: { functionName: "rectangle" },
            positionalArgumentEffects: {
                0: ReferenceType.UPDATE
            },
            keywordArgumentEffects: {
                "img": ReferenceType.UPDATE
            },
        }),
        // Pandas
        new FunctionConfig({
            pattern: { functionName: "set_option" },
            instanceEffect: ReferenceType.GLOBAL_CONFIG
        })
    ];
}

export class FunctionConfig {

    constructor(options: FunctionConfig.IOptions) {
        this.pattern = options.pattern;
        this.instanceEffect = options.instanceEffect;
        this.positionalArgumentEffects = options.positionalArgumentEffects;
        this.keywordArgumentEffects = options.keywordArgumentEffects;
    }
    
    readonly pattern: FunctionPattern;
    readonly instanceEffect: ReferenceType;
    readonly positionalArgumentEffects: { [position: number]: ReferenceType };
    readonly keywordArgumentEffects: { [name: string]: ReferenceType };
}

export type FunctionPattern = {
    /**
     * The name of the function.
     */
    functionName: string;
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
         * Pattern describing matching functions.
         */
        pattern: FunctionPattern;

        /**
         * If defined, what this function does to the instance.
         */
        instanceEffect?: ReferenceType;

        /**
         * Positions of positional arguments this method can define.
         */
        positionalArgumentEffects?: { [position: number]: ReferenceType };

        /**
         * Names of keyword arguments this method can define.
         */
        keywordArgumentEffects?: { [name: string]: ReferenceType };
    }
}