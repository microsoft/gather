import * as python3 from './python3'
import * as fs from 'fs';

for (let i = 2; i < process.argv.length; i++) {
    const path = process.argv[i];
    const text = fs.readFileSync(path).toString().replace(/\r\n/g, '\n');
    const ast = python3.parse(text);
    console.log(JSON.stringify(ast));
}