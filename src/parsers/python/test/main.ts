import * as python3 from '../python3'
import * as fs from 'fs';
import { ControlFlowGraph } from '../../../ControlFlowGraph';
import { dataflowAnalysis } from '../../../DataflowAnalysis';

for (let i = 2; i < process.argv.length; i++) {
    const path = process.argv[i];
    const text = fs.readFileSync(path).toString().replace(/\r\n/g, '\n');
    const ast = python3.parse(text);
    // console.log(JSON.stringify(ast, null, 2));
    const cfg = new ControlFlowGraph(ast);
    cfg.print();
    const dfa = dataflowAnalysis(cfg);
    for (let d of dfa) {
        console.log(d);
    }
}