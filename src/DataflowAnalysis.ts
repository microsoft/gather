import * as ast from './parsers/python/python_parser';
import { Block, ControlFlowGraph } from './ControlFlowGraph';
import { Set, StringSet } from './Set';
import { ILocation } from './parsers/python/python_parser';



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

export function getDefsUses(statement: ast.ISyntaxNode, symbolTable: SymbolTable): IDefUseInfo {
    // ️⚠️ The following is heuristic and unsound, but works for many scripts.
    const funcArgs = new StringSet(...[].concat(
        ...ast.walk(statement)
            .filter(node => node.type === ast.CALL)
            .map((call: ast.ICall) =>
                (call.func.type === ast.DOT ? [call.func.value] : []).concat(call.args.map(a=>a.actual)))
            .reduce((prev, val) => prev.concat(val), []) // flatten the list of lists to a list
            .filter(node => node.type === ast.NAME && !symbolTable.moduleNames.contains(node.id))
            .map(node => (node as ast.IName).id)));

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