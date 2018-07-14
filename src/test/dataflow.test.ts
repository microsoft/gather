import { dataflowAnalysis, getDefsUses } from "../DataflowAnalysis";
import * as python3 from '../parsers/python/python3';
import { ControlFlowGraph } from '../ControlFlowGraph';
import { expect } from "chai";
import { StringSet } from "../Set";


// High-level tests on dataflow as a sanity check.
describe('dataflow detects dependencies', () => {

    function analyze(...codeLines: string[]): [number, number][] {
        let code = codeLines.concat("").join("\n");  // add newlines to end of every line.
        let deps = dataflowAnalysis(new ControlFlowGraph(python3.parse(code)));
        return deps.items.map(function(dep): [number, number] { 
            return [dep.toNode.location.first_line, dep.fromNode.location.first_line]
        });
    }

    it('between variable name defs and uses', () => {
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
        
        /* TODO(andrewhead): we should filter dynamically to only mutable types */
        it('for function arguments', () => {
            let defs = getDefsUsesInStatement("func(a)").defs;
            expect(defs).to.include("a");
        });

        it('for object a function is called on', () => {
            let defs = getDefsUsesInStatement("obj.func()").defs;
            expect(defs).to.include("obj");
        });

        it('for function arguments nested in tuples and lists', () => {
            let defs = getDefsUsesInStatement("func((a,), [b,])").defs;
            expect(defs).to.include("a");
            expect(defs).to.include("b");
        });

    });

    describe('doesn\'t detect definitions', () => {

        it('for names used outside a function call', () => {
            let defs = getDefsUsesInStatement("a + func()").defs;
            expect(defs).to.deep.equal([]);
        });

    });

});