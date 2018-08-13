import { parse } from '../../parsers/python/python_parser';
import { ControlFlowGraph } from '../../slicing/ControlFlowAnalysis';
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
    for (let item of items.slice(0, 10)) {
        const itemPath = path.join(rootDir, item);
        const stats = fs.statSync(itemPath);
        if (stats.isFile() && isPyFile(item)) {
            const text = fs.readFileSync(itemPath).toString().replace(/\r\n/g, '\n')
                + '\n'; // ⚠️ the parser freaks without a final newline 
            console.log(itemPath);
            try {
                const ast = parse(text);
                const cfg = new ControlFlowGraph(ast);
                console.log(cfg.blocks.length, 'blocks');
            } catch (e) {
                const py2ErrorPatterns = [
                    /except .*,.*:/,
                    /print /,
                    /[0-9]+L/,
                ];
                if (py2ErrorPatterns.some(pat => pat.test(e.message))) {
                    console.log('PYTHON 2: skipping');
                } else {
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
