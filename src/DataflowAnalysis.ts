import * as ast from './parsers/python/python_parser';
import { Block, ControlFlowGraph } from './ControlFlowAnalysis';
import { Set, StringSet } from './Set';
import { ILocation } from './parsers/python/python_parser';
import { SlicerConfig } from './SlicerConfig';



export interface IDataflow {
    fromNode: ast.ISyntaxNode;
    toNode: ast.ISyntaxNode;
}


function gatherNames(node: ast.ISyntaxNode | ast.ISyntaxNode[]): StringSet {
    if (Array.isArray(node)) {
        return new StringSet().union(...node.map(gatherNames));
    } else {
        return new StringSet(...ast.walk(node)
            .filter(e => e.type == ast.NAME)
            .map((e: ast.IName) => e.id));
    }
}

interface IDefUseInfo { defs: StringSet, uses: StringSet };

interface SymbolTable {
    // ⚠️ We should be doing full-blown symbol resolution, but meh 🙄
    moduleNames: StringSet;
}

/**
 * Tree walk listener for collecting names used in function call.
 */
class CallNamesListener implements ast.IWalkListener {

    constructor(slicerConfig: SlicerConfig) {
        this._slicerConfig = slicerConfig;
    }

    onEnterNode(node: ast.ISyntaxNode, type: string, ancestors: ast.ISyntaxNode[]) {
        if (type == ast.CALL) {
            let callNode = node as ast.ICall;
            let name: string;
            if (callNode.func.type == ast.DOT) {
                name = callNode.func.name.toString();
            } else {
                name = (callNode.func as ast.IName).id;
            }
            this._slicerConfig.functionConfigs
            .filter((config) => config.functionName == name)
            .forEach((config) => {
                if (config.mutatesInstance && callNode.func.type == ast.DOT) {
                    this._parentsOfRelevantNames.push(callNode.func.value);
                }
                config.positionalArgumentsMutated.forEach((position) => {
                    this._parentsOfRelevantNames.push(callNode.args[position].actual);
                });
                config.keywordArgumentsMutated.forEach((keyword) => {
                    callNode.args.forEach((arg) => {
                        console.log("arg", arg);
                        if (arg.keyword && (arg.keyword as ast.IName).id == keyword) {
                            this._parentsOfRelevantNames.push(arg.actual);       
                        }
                    });
                });
            });
        }
        if (type == ast.NAME) {
            for (let ancestor of ancestors) {
                if (this._parentsOfRelevantNames.indexOf(ancestor) != -1) {
                    console.log("Found relevant name");
                    this.names.push((node as ast.IName).id);
                    break;
                }
            }
        }
    }

    private _slicerConfig: SlicerConfig;
    private _parentsOfRelevantNames: ast.ISyntaxNode[] = [];
    readonly names: string[] = [];
}

export function getDefsUses(
    statement: ast.ISyntaxNode, symbolTable: SymbolTable, slicerConfig?: SlicerConfig): IDefUseInfo {

    slicerConfig = slicerConfig || new SlicerConfig();

    // ️⚠️ The following is heuristic and unsound, but works for many scripts.
    // Grabs *all names* referred to within the call arguments, even those nested within
    // operations. This is because operators could be overloaded to return the same object. We
    // could filter this list later by inspecting which variables are immutable (e.g., ints,
    // floats, strings, etc.) during the code's execution.
    // XXX: we don't consider that the callable is getting def'd, but maybe we should: if you override
    // __call__ on an object, a call on an object can change that object.
    let callNamesListener = new CallNamesListener(slicerConfig);
    ast.walk(statement, callNamesListener);
    const funcArgs = new StringSet(...callNamesListener.names);
    // const funcArgs = new StringSet();

    switch (statement.type) {
        case ast.IMPORT: {
            const modnames = statement.names.map(i => i.name || i.path);
            symbolTable.moduleNames.add(...modnames);
            return {
                defs: new StringSet(...modnames),
                uses: new StringSet()
            };
        }
        case ast.FROM: {
            // ⚠️ Doesn't handle 'from <pkg> import *'
            let modnames: Array<string> = [];
            if (statement.imports.constructor === Array) {
                modnames = statement.imports.map(i => i.name || i.path);
                symbolTable.moduleNames.add(...modnames);
            }
            return {
                defs: new StringSet(...modnames),
                uses: new StringSet()
            };
        }
        case ast.ASSIGN:
            const targetNames = gatherNames(statement.targets);
            return {
                defs: targetNames,
                // in x+=1, x is both a source and target
                uses: gatherNames(statement.sources).union(funcArgs).union(statement.op ? targetNames : new StringSet())
            };
        default:
            return { defs: funcArgs, uses: gatherNames(statement) };
    }
}

function getUses(statement: ast.ISyntaxNode, symbolTable: SymbolTable): StringSet {
    return getDefsUses(statement, symbolTable).uses;
}

function locString(loc: ILocation): string {
    return loc.first_line + ':' + loc.first_column + '-' + loc.last_line + ':' + loc.last_column;
}

type DefSet = Set<[string, ast.ISyntaxNode]>;

function getDefSetId([name, node]: [string, ast.ISyntaxNode]) {
    if (!node.location) console.error('***', node);
    return name + '@' + locString(node.location);
}

function getDataflowId(df: IDataflow) {
    if (!df.fromNode.location) console.error('*** FROM', df.fromNode, df.fromNode.location);
    if (!df.toNode.location) console.error('*** TO', df.toNode, df.toNode.location);
    return locString(df.fromNode.location) + '->' + locString(df.toNode.location);
}

export function dataflowAnalysis(cfg: ControlFlowGraph): Set<IDataflow> {
    const workQueue: Block[] = cfg.blocks.reverse();

    const definitionsForBlock = new Map(workQueue.map<[number, DefSet]>(block =>
        ([block.id, new Set(getDefSetId)])));

    let dataflows = new Set<IDataflow>(getDataflowId);

    let symbolTable: SymbolTable = { moduleNames: new StringSet() };

    while (workQueue.length) {
        const block = workQueue.pop();

        // incoming definitions are those from every predecessor block
        let oldDefs = definitionsForBlock.get(block.id);
        let defs = oldDefs.union(...cfg.getPredecessors(block)
            .map(block => definitionsForBlock.get(block.id)));

        const loopUses = new StringSet().union(...block.loopVariables.map(s => getUses(s, symbolTable)));

        for (let statement of block.statements) {
            let { defs: definedHere, uses: usedHere } = getDefsUses(statement, symbolTable);
            usedHere = usedHere.union(loopUses);

            // TODO: fix up dataflow computation within this block: check for definitions in
            // defsWithinBlock first; if found, don't look to defs that come from the predecessor.

            // For everything that's defined coming into this block, if it's used in this block, save connection.
            const newFlows = defs.filter(([name, _]) => usedHere.contains(name))
                .map(getDataflowId, ([_, defstmt]) => ({ fromNode: defstmt, toNode: statement }));

            dataflows = dataflows.union(newFlows);

            const genSet = definedHere.map(getDefSetId, name => [name, statement]) as Set<[string, ast.ISyntaxNode]>;
            const killSet = defs.filter(([name, _]) => definedHere.contains(name));
            defs = defs.minus(killSet).union(genSet);
        }
        if (!defs.equals(oldDefs)) {
            // Definitions have changed, so redo the successor blocks. 
            definitionsForBlock.set(block.id, defs);
            for (let succ of cfg.getSuccessors(block)) {
                if (workQueue.indexOf(succ) < 0) {
                    workQueue.push(succ);
                }
            }
        }
    }
    return dataflows;
}