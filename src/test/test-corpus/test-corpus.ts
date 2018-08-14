import { parse } from '../../parsers/python/python_parser';
import { ControlFlowGraph } from '../../slicing/ControlFlowAnalysis';
import { dataflowAnalysis } from '../../slicing/DataflowAnalysis';
import * as fs from 'fs';
import * as path from 'path';

if (process.argv.length <= 2) {
    console.log(`usage: ${__filename} path/to/directory`);
    process.exit(-1);
}

let failCount = 0;

function testInDir(rootDir: string) {
    function isPyFile(filename: string) { return /.py$/.test(filename); }
    const items = fs.readdirSync(rootDir);
    for (let item of items.slice(0, 500)) {
        const itemPath = path.join(rootDir, item);
        const stats = fs.statSync(itemPath);
        if (stats.isFile() && isPyFile(item)) {
            const text = fs.readFileSync(itemPath).toString().replace(/\r\n/g, '\n')
                + '\n'; // ⚠️ the parser freaks without a final newline 
            console.log(itemPath);
            try {
                const ast = parse(text);
                if (!ast) {
                    // empty file
                    continue;
                }
                const cfg = new ControlFlowGraph(ast);
                if (!cfg || !cfg.blocks) {
                    console.log('CFG FAIL');
                    continue;
                }
                const dfa = dataflowAnalysis(cfg);
                if (!dfa) {
                    console.log('DFA FAIL');
                    continue;
                }
            } catch (e) {
                const py2ErrorPatterns = [
                    /except .*,.*:/,
                    /print /,
                    /exec /,
                    /[0-9]+L/,
                    /Expecting 'NAME', got 'False'/,
                    /Expecting ':', 'as', got ','/,
                    /[r.]aise [^,]+,/,
                    /[^0-9A-Za-z_]0[0-9]+/,
                    /ur["']/,
                    /0x[0-9A-Fa-f]L/,
                    /<>/,
                ];
                if (!py2ErrorPatterns.some(pat => pat.test(e.message))) {
                    console.log('FAIL', e);
                    failCount++;
                }
            }
        } else if (stats.isDirectory()) {
            testInDir(itemPath);
        }
    }
}

testInDir(process.argv[2]);
console.log('TOTAL FAILURES', failCount);
