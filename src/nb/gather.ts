import Jupyter = require('base/js/namespace');
// import events = require('base/js/events');
import $ = require('jquery');
import { ControlFlowGraph } from "../slicing/ControlFlowAnalysis";
import { dataflowAnalysis } from '../slicing/DataflowAnalysis';
import * as python3 from '../parsers/python/python3';

function show_stats() {
    // Get counts of each cell type
    var cells = Jupyter.notebook.get_cells();
    var hist: { [ct: string]: number } = {};
    for (var i = 0; i < cells.length; i++) {
        var ct = cells[i].cell_type;
        if (hist[ct] === undefined) {
            hist[ct] = 1;
        } else {
            hist[ct] += 1;
        }
    }
}

export function small_test(code: string) {
    const ast = python3.parse(code);
    const cfg = new ControlFlowGraph(ast);
    const dfa = dataflowAnalysis(cfg);
    console.log('dfa', dfa);
}

export function load_ipython_extension() {
    console.log('extension started');

    const menu = $('#menus ul.navbar-nav');
    const gather = $('<li class="dropdown"></li>').appendTo(menu);
    $('<a href="#" class="dropdown-toggle" data-toggle="dropdown">Gather</a>').appendTo(gather);
    const list = $('<ul id="gather_menu" class="dropdown-menu"></ul>').appendTo(gather);
    $('<li id="gather-to-notebook" title="Gather to notebook"><a href="#">Gather to notebook</a></li>').click(show_stats).appendTo(list);
    $('<li id="gather-to-script" title="Gather to script"><a href="#">Gather to script</a></li>').appendTo(list);
}
