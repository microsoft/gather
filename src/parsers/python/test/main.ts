import * as fs from 'fs';
import * as python3 from '../python3'
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

    const ast = python3.parse(text);
    if (printAst) {
        console.log(JSON.stringify(ast, null, 2));
    }

    const cfg = new ControlFlowGraph(ast);
    if (printCfg) {
        cfg.print();
    }

    const dfa = dataflowAnalysis(cfg);
    if (printDf) {
        dfa.items.forEach(({ fromNode, toNode }) => {
            console.log(fromNode.location.first_line, '->', toNode.location.first_line);
        });
    }
}
