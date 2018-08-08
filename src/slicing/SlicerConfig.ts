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
        if (functionConfigs) {
            this._functionConfigs = functionConfigs;
        } else {
            this._functionConfigs = this._defaultFunctionConfigs;
            // Matplotlib
            for (let funcName of MATPLOTLIB_PLOTTING_METHODS) {
                this._defaultFunctionConfigs.push(new FunctionConfig({
                    pattern: { functionName: funcName, instanceNames: [ "plt" ] },
                    instanceEffect: ReferenceType.INITIALIZATION
                }));
            }
            for (let funcName of MATPLOTLIB_UPDATE_METHODS) {
                this._defaultFunctionConfigs.push(new FunctionConfig({
                    pattern: { functionName: funcName, instanceNames: [ "plt" ] },
                    instanceEffect: ReferenceType.UPDATE
                }));
            }
            for (let funcName of AXES_INIT_METHODS) {
                this._defaultFunctionConfigs.push(new FunctionConfig({
                    pattern: { functionName: funcName, instanceNames: [ "ax" ] },
                    instanceEffect: ReferenceType.INITIALIZATION
                }));
            }
            for (let funcName of AXES_UPDATE_METHODS) {
                this._defaultFunctionConfigs.push(new FunctionConfig({
                    pattern: { functionName: funcName, instanceNames: [ "ax" ] },
                    instanceEffect: ReferenceType.UPDATE
                }));
            }
            for (let funcName of FIGURE_UPDATE_METHODS) {
                this._defaultFunctionConfigs.push(new FunctionConfig({
                    pattern: { functionName: funcName, instanceNames: [ "fig", "f" ] },
                    instanceEffect: ReferenceType.UPDATE
                }));
            }
        }
        this._functionConfigs = functionConfigs || this._defaultFunctionConfigs;
    }

    get functionConfigs(): FunctionConfig[] {
        return this._functionConfigs;
    }

    private _functionConfigs: FunctionConfig[];
    
    private _defaultFunctionConfigs = [
        // OpenCV
        // new FunctionConfig({
        //     pattern: { functionName: "load" },
        //     instanceEffect: ReferenceType.UPDATE
        // }),
        new FunctionConfig({
            pattern: { functionName: "rectangle", instanceNames: [ "cv2" ] },
            positionalArgumentEffects: {
                0: ReferenceType.UPDATE
            },
            keywordArgumentEffects: {
                "img": ReferenceType.UPDATE
            },
        }),
        // Pandas
        new FunctionConfig({
            pattern: { functionName: "set_option", instanceNames: [ "pd" ] },
            instanceEffect: ReferenceType.GLOBAL_CONFIG
        }),
        // Scikit-learn, though really anything machine learning-y.
        new FunctionConfig({
            pattern: { functionName: "fit" },
            instanceEffect: ReferenceType.UPDATE
        }),
        new FunctionConfig({
            pattern: { functionName: "partial_fit" },
            instanceEffect: ReferenceType.UPDATE
        }),
        new FunctionConfig({
            pattern: { functionName: "fit_transform" },
            instanceEffect: ReferenceType.UPDATE
        }),
        new FunctionConfig({
            pattern: { functionName: "set_params" },
            instanceEffect: ReferenceType.UPDATE
        }),
        // Numpy functions. Definitely incomplete.
        new FunctionConfig({
            pattern: { functionName: "sort" },
            instanceEffect: ReferenceType.UPDATE
        }),
        new FunctionConfig({
            pattern: { functionName: "shuffle", instanceNames: [ "np" ] },
            positionalArgumentEffects: [
                ReferenceType.UPDATE
            ]
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

    /**
     * Expected names of instance variables this function will be called on.
     */
    instanceNames?: string[];
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

let MATPLOTLIB_PLOTTING_METHODS = [
    "acorr",
    "angle_spectrum",
    "bar",
    "barbs",
    "barh",
    "boxplot",
    "broken_barh",
    "cohere",
    "contour",
    "contourf",
    "csd",
    "errorbar",
    "eventplot",
    "figure",
    "hexbin",
    "hist",
    "hist2d",
    "imshow",
    "loglog",
    "magnitude_spectrum",
    "matshow",
    "pcolor",
    "pcolormesh",
    "phase_spectrum",
    "pie",
    "plot",
    "plot_date",
    "plotfile",
    "polar",
    "psd",
    "quiver",
    "scatter",
    "semilogx",
    "semilogy",
    "specgram",
    "spy",
    "stackplot",
    "stem",
    "step",
    "streamplot",
    "subplot",  // this one's tricky---multiple levels of dependence between subplot, plot commands
    "subplots",
    "tricontour",
    "tricontourf",
    "tripcolor",
    "triplot",
    "violinplot",
    "xcorr",
];
let MATPLOTLIB_UPDATE_METHODS = [
    "annotate",
    "arrow",
    "autoscale",
    "autumn",
    "axes",
    "axhline",
    "axhspan",
    "axvline",
    "axvspan",
    "bone",
    "box",
    "cla",
    "clabel",
    "clf",
    "clim",
    "close",
    "colorbar",
    "connect",
    "cool",
    "copper",
    "delaxes",
    "disconnect",
    "draw",
    "figimage",
    "figlegend",
    "figtext",
    "fill",
    "fill_between",
    "fill_betweenx",
    "flag",
    "gca",
    "gray",
    "grid",
    "hlines",
    "hold",
    "hot",
    "hsv",
    "inferno",
    "install_repl_displayhook",
    "ioff",
    "ion",
    "jet",
    "legend",
    "locator_params",
    "magma",
    "margins",
    "minorticks_off",
    "minorticks_on",
    "nipy_spectral",
    "over",
    "pause",
    "pink",
    "plasma",
    "prism",
    "quiverkey",
    "rc",
    "rcdefaults",
    "rgrids",
    "sca",
    "set_cmap",
    "setp",
    "spring",
    "subplots_adjust",
    "summer",
    "suptitle",
    "switch_backend",
    "table",
    "text",
    "thetagrids",
    "tick_params",
    "ticklabel_format",
    "tight_layout",
    "title",
    "twinx",
    "twiny",
    "viridis",
    "vlines",
    "winter",
    "xlabel",
    "xlim",
    "xcale",
    "xticks",
    "ylabel",
    "ylim",
    "yscale",
    "yticks"
];
let AXES_INIT_METHODS = MATPLOTLIB_PLOTTING_METHODS;
let AXES_UPDATE_METHODS = [
    "annotate",
    "text",
    "table",
    "arrow",
    "cla",
    "clear",
    "axi",
    "set_axis_off",
    "set_axis_on",
    "set_frame_on",
    "set_axisbelow",
    "grid",
    "set_facecolor",
    "set_fc",
    "set_axis_bgcolor",
    "set_prop_cycle",
    "set_color_cycle",
    "invert_xaxis",
    "invert_yaxis",
    "set_xlim",
    "set_ylim",
    "update_datalim",
    "update_datalim_bounds",
    "update_datalim_numerix",
    "set_ybound",
    "set_xbound",
    "set_xlabel",
    "set_ylabel",
    "set_title",
    "set_xscale",
    "set_yscale",
    "use_sticky_edges",
    "set_xmargin",
    "set_ymargin",
    "autoscale",
    "autoscale_view",
    "set_autoscale_on",
    "set_autoscalex_on",
    "set_autoscaley_on",
    "apply_aspect",
    "set_aspect",
    "set_adjustable",
    "xaxis_date",
    "yaxis_date",
    "minorticks_off",
    "minorticks_on",
    "set_xticklabels",
    "set_xticks",
    "set_yticklabels",
    "set_yticks",
    "ticklabel_format",
    "tick_params",
    "locator_params",
    "add_artist",
    "add_collection",
    "add_container",
    "add_image",
    "add_line",
    "add_patch",
    "add_table",
    "twinx",
    "twiny",
    "set_anchor",
    "set_axes_locator",
    "reset_position",
    "set_position",
    "add_callback",
    "remove_callback",
    // Skipping interactive setters
    "draw",
    "draw_artist",
    "redraw_in_frame",
    "set_rasterization_zorder",
    "set",
    "update",
    "update_from",
    "set_alpha",
    "set_animated",
    "set_clip_box",
    "set_clip_on",
    "set_clip_path",
    "set_gid",
    "set_url",
    "set_label",
    "set_visible",
    "set_zorder",
    "set_rasterized",
    "set_sketch_params",
    "set_agg_filter",
    "set_snap",
    "set_transform",
    "set_path_effects",
    "set_axes",
    "set_figure",
    "remove",
];
let FIGURE_UPDATE_METHODS = [
    "add_axes",
    "add_axobserver",
    "add_subplot",
    "autofmt_xdate",
    "clear",
    "clf",
    "colorbar",
    "delaxes",
    "draw",
    "draw_artist",
    "figimage",
    "gca",
    "hold",
    "legend",
    "sca",
    "set_canvas",
    "set_dpi",
    "set_edgecolor",
    "set_facecolor",
    "set_figheight",
    "set_figwidth",
    "set_frameon",
    "set_size_inches",
    "set_tight_layout",
    "subplots_adjust",
    "suptitle",
    "text",
    "tight_layout"
];