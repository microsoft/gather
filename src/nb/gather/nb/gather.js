define(["require", "exports", "base/js/namespace", "jquery", "../slicing/ControlFlowAnalysis", "../slicing/DataflowAnalysis", "../parsers/python/python3"], function (require, exports, Jupyter, $, ControlFlowAnalysis_1, DataflowAnalysis_1, python3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function show_stats() {
        // Get counts of each cell type
        var cells = Jupyter.notebook.get_cells();
        var hist = {};
        for (var i = 0; i < cells.length; i++) {
            var ct = cells[i].cell_type;
            if (hist[ct] === undefined) {
                hist[ct] = 1;
            }
            else {
                hist[ct] += 1;
            }
        }
    }
    function small_test(code) {
        var ast = python3.parse(code);
        var cfg = new ControlFlowAnalysis_1.ControlFlowGraph(ast);
        var dfa = DataflowAnalysis_1.dataflowAnalysis(cfg);
        console.log('dfa', dfa);
    }
    exports.small_test = small_test;
    function load_ipython_extension() {
        console.log('extension started');
        var menu = $('#menus ul.navbar-nav');
        var gather = $('<li class="dropdown"></li>').appendTo(menu);
        $('<a href="#" class="dropdown-toggle" data-toggle="dropdown">Gather</a>').appendTo(gather);
        var list = $('<ul id="gather_menu" class="dropdown-menu"></ul>').appendTo(gather);
        $('<li id="gather-to-notebook" title="Gather to notebook"><a href="#">Gather to notebook</a></li>').click(show_stats).appendTo(list);
        $('<li id="gather-to-script" title="Gather to script"><a href="#">Gather to script</a></li>').appendTo(list);
    }
    exports.load_ipython_extension = load_ipython_extension;
});
