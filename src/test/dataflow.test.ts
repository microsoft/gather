import { dataflowAnalysis, getDefsUses } from "../DataflowAnalysis";
import * as python3 from '../parsers/python/python3';
import { ControlFlowGraph } from '../ControlFlowGraph';
import { expect } from "chai";
import { StringSet } from "../Set";


// High-level tests on dataflow as a sanity check.
describe('dataflow', () => {

    function analyze(...codeLines: string[]): [number, number][] {
        let code = codeLines.concat("").join("\n");  // add newlines to end of every line.
        let deps = dataflowAnalysis(new ControlFlowGraph(python3.parse(code)));
        return deps.items.map(function(dep): [number, number] { 
            return [dep.toNode.location.first_line, dep.fromNode.location.first_line]
        });
    }

    it('detects forward links', () => {
        let deps = analyze(
            "a = 1",
            "b = a"
        );
        expect(deps).to.deep.include([2, 1]);
    });

});

describe('getDefsUses', () => {

    function getDefsUsesInStatement(code: string) {
        code = code + "\n";  // programs need to end with newline
        let module = python3.parse(code);
        let defsUses = getDefsUses(module.code, { moduleNames: new StringSet() });
        return { defs: defsUses.defs.items, uses: defsUses.uses.items };
    }

    describe('detects definitions', () => {
        
        it('for assignments', () => {
            let defs = getDefsUsesInStatement("a = 1").defs;
            expect(defs).to.include("a");
        })

    });

});