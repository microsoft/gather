import * as fs from 'fs';
import * as ast from '../python_parser';
import { ControlFlowGraph } from '../../../slicing/ControlFlowAnalysis';
import { dataflowAnalysis } from '../../../slicing/DataflowAnalysis';

let printCfg = false;
let printAst = false;
let printDf = false;

for (let i = 2; i < process.argv.length; i++) {
    
    if (process.argv[i].startsWith('-')) {
        switch (process.argv[i].toLowerCase()) {
            case '-a': printAst = true; break;
            case '-c': printCfg = true; break;
            case '-d': printDf = true; break;
        }
        continue;
    }

    const path = process.argv[i];
    const text = fs.readFileSync(path).toString().replace(/\r\n/g, '\n');

    const tree = ast.parse(text);
    if (printAst) {
        console.log(JSON.stringify(tree, null, 2));
    }

    const cfg = new ControlFlowGraph(tree);
    if (printCfg) {
        cfg.print();
    }

    const dfa = dataflowAnalysis(cfg);
    if (printDf) {
        dfa.flows.items.forEach(({ fromNode, toNode }) => {
            console.log(fromNode.location.first_line, '->', toNode.location.first_line);
        });
    }
}
