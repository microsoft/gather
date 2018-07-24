import { dataflowAnalysis, getDefs, Def, DefType, DefSet, getUses, IDataflow } from "../slicing/DataflowAnalysis";
import * as python3 from '../parsers/python/python3';
import { ControlFlowGraph } from '../slicing/ControlFlowAnalysis';
import { expect } from "chai";
import { Set, StringSet } from "../slicing/Set";
import { SlicerConfig, FunctionConfig } from "../slicing/SlicerConfig";
import { ISyntaxNode } from "../parsers/python/python_parser";


// High-level tests on dataflow as a sanity check.
describe('detects dataflow dependencies', () => {

    function analyze(...codeLines: string[]): Set<IDataflow> {
        let code = codeLines.concat("").join("\n");  // add newlines to end of every line.
        return dataflowAnalysis(new ControlFlowGraph(python3.parse(code)));
    }

    function analyzeLineDeps(...codeLines: string[]): [number, number][] {
        return analyze(...codeLines).items.map(function(dep): [number, number] { 
            return [dep.toNode.location.first_line, dep.fromNode.location.first_line]
        });
    }

    it('from variable uses to names', () => {
        let deps = analyzeLineDeps(
            "a = 1",
            "b = a"
        );
        expect(deps).to.deep.include([2, 1]);
    });

    it('only links from a use to its most recent def', () => {
        let deps = analyzeLineDeps(
            "a = 2",
            "a.prop = 3",
            "a = 4",
            "b = a"
        );
        expect(deps).to.deep.equal([[4, 3]]);
    });

    it('links between statements, not symbol locations', () => {
        let deps = analyze(
            "a = 1",
            "b = a"
        );
        expect(deps.items[0].fromNode.location).to.deep.equal(
            { first_line: 1, first_column: 0, last_line: 1, last_column: 5 });
        expect(deps.items[0].toNode.location).to.deep.equal(
            { first_line: 2, first_column: 0, last_line: 2, last_column: 5 });
    });

    it('links to a multi-line dependency', () => {
        let deps = analyze(
            "a = func(",
            "    1)",
            "b = a"
        );
        expect(deps.items[0].fromNode.location).to.deep.equal(
            { first_line: 1, first_column: 0, last_line: 2, last_column: 6 });
    });

    it('detects a dependency to a full for-loop declaration', () => {
        let deps = analyze(
            "for i in range(a, b):",
            "    print(i)"
        );
        expect(deps.items[0].fromNode.location).to.deep.equal(
            { first_line: 1, first_column: 0, last_line: 1, last_column: 21 });
    });

    it('doesn\'t detect a dependency in for-loop by default', () => {
        let deps = analyze(
            "for i in range(a, b):",
            "    print(c)"
        );
        expect(deps.items).does.deep.equal([]);
    });

    it('links from a class use to its def', () => {
        let deps = analyzeLineDeps(
            "class C(object):",
            "    pass",
            "",
            "c = C()"
        );
        expect(deps).to.deep.equal([[4, 1]]);
    });

    it('links from a function use to its def', () => {
        let deps = analyzeLineDeps(
            "def func():",
            "    pass",
            "",
            "func()"
        );
        expect(deps).to.deep.equal([[4, 1]]);
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

    it('not from a join to a for-loop', () => {
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


describe('getDefs', () => {

    function getDefsFromStatements(...codeLines: string[]): Def[] {
        let code = codeLines.concat("").join("\n");
        let module = python3.parse(code);
        return new DefSet().union(...module.code.map((stmt: ISyntaxNode) => {
            return getDefs(stmt, { moduleNames: new StringSet() });
        })).items;
    }

    function getDefsFromStatement(code: string, slicerConfig?: SlicerConfig): Def[] {
        code = code + "\n";  // programs need to end with newline
        let module = python3.parse(code);
        return getDefs(module.code, { moduleNames: new StringSet() }, slicerConfig).items;
    }

    function getDefNamesFromStatement(code: string, slicerConfig?: SlicerConfig) {
        return getDefsFromStatement(code, slicerConfig)
        .map((def) => def.name);
    }

    describe('detects definitions', () => {
        
        it('for assignments', () => {
            let defs = getDefsFromStatement("a = 1");
            expect(defs[0]).to.include({ type: DefType.ASSIGN, name: "a" });
        })

        it('for imports', () => {
            let defs = getDefsFromStatement("import lib");
            expect(defs[0]).to.include({ type: DefType.IMPORT, name: "lib" });
        });

        it('for from-imports', () => {
            let defs = getDefsFromStatement("from mod import func");
            expect(defs[0]).to.include({ type: DefType.IMPORT, name: "func" });    
        })

        it('for function declarations', () => {
            let defs = getDefsFromStatement([
                "def func():",
                "    return 0"
            ].join("\n"));
            expect(defs[0]).to.deep.include({
                type: DefType.FUNCTION,
                name: "func",
                location: { first_line: 1, first_column: 0, last_line: 3, last_column: -1}
            });
        });

        it('for class declarations', () => {
            let defs = getDefsFromStatement([
                "class C(object):",
                "    def __init__(self):",
                "        pass"
            ].join("\n"));
            expect(defs[0]).to.deep.include({
                type: DefType.CLASS,
                name: "C",
                location: { first_line: 1, first_column: 0, last_line: 4, last_column: -1 }
            });
        });

        describe('from annotations', () => {

            it('from our def annotations', () => {
                let defs = getDefsFromStatement(
                    '"""defs: [{ "name": "a", "pos": [[0, 0], [0, 11]] }]"""%some_magic'
                );
                expect(defs[0]).to.deep.include({
                    type: DefType.MAGIC,
                    name: "a",
                    location: { first_line: 1, first_column: 0, last_line: 1, last_column: 11 }
                });
            });

            it('computing the def location relative to the line it appears on', () => {
                let defs = getDefsFromStatements([
                    'print(a)',
                    '"""defs: [{ "name": "a", "pos": [[0, 0], [0, 11]] }]"""%some_magic'
                ].join("\n"));
                expect(defs[0]).to.deep.include({
                    location: { first_line: 2, first_column: 0, last_line: 2, last_column: 11 }
                });
            });
        });

        describe('when given a slice config', () => {

            it('for instances that functions mutate', () => {
                let defs = getDefsFromStatement("obj.func()", new SlicerConfig([
                    new FunctionConfig({ functionName: "func", mutatesInstance: true })
                ]));
                expect(defs[0]).to.include({ type: DefType.MUTATION, name: "obj" });
            });

            it('for positional arguments that functions mutate', () => {
                let defs = getDefNamesFromStatement("func(a)", new SlicerConfig([
                    new FunctionConfig({ functionName: "func", positionalArgumentsMutated: [0] })
                ]));
                expect(defs).to.include("a");
            });

            it('for keyword variables that functions mutate', () => {
                let defs = getDefNamesFromStatement("func(a=var)", new SlicerConfig([
                    new FunctionConfig({ functionName: "func", keywordArgumentsMutated: ["a"] })
                ]));
                expect(defs).to.include("var");
            });

        });
        
        describe('ignoring by default', () => {

            it('function arguments', () => {
                let defs = getDefNamesFromStatement("func(a)");
                expect(defs).to.deep.equal([]);
            });
    
            it('the object a function is called on', () => {
                let defs = getDefNamesFromStatement("obj.func()");
                expect(defs).to.deep.equal([]);
            });

        });

    });

    describe('doesn\'t detect definitions', () => {

        it('for names used outside a function call', () => {
            let defs = getDefNamesFromStatement("a + func()");
            expect(defs).to.deep.equal([]);
        });
    });
});

describe('getUses', () => {

    function getUseNames(...codeLines: string[]) {
        let code = codeLines.concat("").join("\n");
        let module = python3.parse(code);
        return getUses(module.code, { moduleNames: new StringSet() }).items
        .map((use) => use[0]);
    }

    describe('detects uses', () => {
        
        it('of functions', () => {
            let defs = getUseNames("func()");
            expect(defs).to.include("func");
        });

    });
});