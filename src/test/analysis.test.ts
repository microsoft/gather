import { dataflowAnalysis, getDefsUses } from "../DataflowAnalysis";
import * as python3 from '../parsers/python/python3';
import { ControlFlowGraph } from '../ControlFlowAnalysis';
import { expect } from "chai";
import { StringSet } from "../Set";
import { SlicerConfig, FunctionConfig } from "../SlicerConfig";


// High-level tests on dataflow as a sanity check.
describe('detects dataflow dependencies', () => {

    function analyze(...codeLines: string[]): [number, number][] {
        let code = codeLines.concat("").join("\n");  // add newlines to end of every line.
        let deps = dataflowAnalysis(new ControlFlowGraph(python3.parse(code)));
        return deps.items.map(function(dep): [number, number] { 
            return [dep.toNode.location.first_line, dep.fromNode.location.first_line]
        });
    }

    it('from variable uses to names', () => {
        let deps = analyze(
            "a = 1",
            "b = a"
        );
        expect(deps).to.deep.include([2, 1]);
    });

    it('only links from a use to its most recent def', () => {
        let deps = analyze(
            "a = 2",
            "a.prop = 3",
            "a = 4",
            "b = a"
        );
        expect(deps).to.deep.equal([[4, 3]]);
    });

});

describe('detects control dependencies', () => {

    function analyze(...codeLines: string[]): [number, number][] {
        let code = codeLines.concat("").join("\n");  // add newlines to end of every line.
        let deps = (new ControlFlowGraph(python3.parse(code))).getControlDependencies();
        return deps.map(function(dep): [number, number] { 
            return [dep.toNode.location.first_line, dep.fromNode.location.first_line]
        });
    }

    it('to an if-statement', () => {
        let deps = analyze(
            "if cond:",
            "    print(a)"
        );
        expect(deps).to.deep.equal([[2, 1]]);
    });

    it('for multiple statements in a block', () => {
        let deps = analyze(
            "if cond:",
            "    print(a)",
            "    print(b)"
        );
        expect(deps).to.deep.equal([[2, 1], [3, 1]]);
    });

    it('from an else to an if', () => {
        let deps = analyze(
            "if cond:",
            "    print(a)",
            "elif cond2:",
            "    print(b)",
            "else:",
            "    print(b)"
        );
        expect(deps).to.deep.include([3, 1]);
        expect(deps).to.deep.include([5, 3]);
    });

    it('not from a join to an if-condition', () => {
        let deps = analyze(
            "if cond:",
            "    print(a)",
            "print(b)"
        );
        expect(deps).to.deep.equal([[2, 1]]);
    });

    it.only('not from a join to a for-loop', () => {
        let deps = analyze(
            "for i in range(10):",
            "    print(a)",
            "print(b)"
        );
        expect(deps).to.deep.equal([[2, 1]]);
    });

    it('to a for-loop', () => {
        let deps = analyze(
            "for i in range(10):",
            "    print(a)"
        );
        expect(deps).to.deep.include([2, 1]);
    });

    it('skipping non-dependencies', () => {
        let deps = analyze(
            "a = 1",
            "b = 2"
        );
        expect(deps).to.deep.equal([]);
    });

});

describe('getDefsUses', () => {

    function getDefsUsesInStatement(code: string, slicerConfig?: SlicerConfig) {
        code = code + "\n";  // programs need to end with newline
        let module = python3.parse(code);
        let defsUses = getDefsUses(module.code, { moduleNames: new StringSet() }, slicerConfig);
        return { defs: defsUses.defs.items, uses: defsUses.uses.items };
    }

    describe('detects definitions', () => {
        
        it('for assignments', () => {
            let defs = getDefsUsesInStatement("a = 1").defs;
            expect(defs).to.include("a");
        })

        describe('when given a slice config', () => {

            it('for instances that functions mutate', () => {
                let defs = getDefsUsesInStatement("obj.func()", new SlicerConfig([
                    new FunctionConfig({ functionName: "func", mutatesInstance: true })
                ])).defs;
                expect(defs).to.include("obj");
            });

            it('for positional arguments that functions mutate', () => {
                let defs = getDefsUsesInStatement("func(a)", new SlicerConfig([
                    new FunctionConfig({ functionName: "func", positionalArgumentsMutated: [0] })
                ])).defs;
                expect(defs).to.include("a");
            });

            it('for keyword variables that functions mutate', () => {
                let defs = getDefsUsesInStatement("func(a=var)", new SlicerConfig([
                    new FunctionConfig({ functionName: "func", keywordArgumentsMutated: ["a"] })
                ])).defs;
                expect(defs).to.include("var");
            });

        });
        
        describe('ignoring by default', () => {

            it('function arguments', () => {
                let defs = getDefsUsesInStatement("func(a)").defs;
                expect(defs).to.deep.equal([]);
            });
    
            it('the object a function is called on', () => {
                let defs = getDefsUsesInStatement("obj.func()").defs;
                expect(defs).to.deep.equal([]);
            });

        });

    });

    describe('doesn\'t detect definitions', () => {

        it('for names used outside a function call', () => {
            let defs = getDefsUsesInStatement("a + func()").defs;
            expect(defs).to.deep.equal([]);
        });

    });

});