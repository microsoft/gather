import * as ast from './parsers/python/python_parser';
import { Block, ControlFlowGraph } from './ControlFlowGraph';


export interface IDataflow {
    fromNode: ast.ISyntaxNode;
    toNode: ast.ISyntaxNode;
}


function union<T>(...sets: Set<T>[]): Set<T> {
    const result = new Set<T>();
    for (let set of sets) {
        for (let item of set) {
            result.add(item);
        }
    }
    return result;
}

function diff<T>(set1: Set<T>, set2: Set<T>): Set<T> {
    const result = new Set<T>(set1);
    for (let item of set2) {
        result.delete(item);
    }
    return result;
}

function getNames(node: ast.ISyntaxNode | ast.ISyntaxNode[]): Set<string> {
    if (Array.isArray(node)) {
        return union(...node.map(getNames));
    } else {
        return new Set(ast.walk(node)
            .filter(e => e.type == ast.NAME)
            .map((e: ast.IName) => e.id));
    }
}

function getDefsUses(statement: ast.ISyntaxNode): [Set<string>, Set<string>] {
    if (statement.type === ast.ASSIGN) {
        return [getNames(statement.targets), getNames(statement.sources)];
    }
    return [new Set(), getNames(statement)];
}

export function dataflowAnalysis(cfg: ControlFlowGraph): Set<IDataflow> {
    const workQueue: Block[] = cfg.blocks;
    const definitions = new Map<number, Set<[string, ast.ISyntaxNode]>>(
        workQueue.map<[number, Set<[string, ast.ISyntaxNode]>]>(b => ([b.id, new Set()]))); 
    let dataflows = new Set<IDataflow>();
    while (workQueue.length) {
        const block = workQueue.pop();
        let defs = union(...cfg.getPredecessors(block).map(block => definitions.get(block.id)));
        for (let statement of block.statements) {
            const [defNames, useNames] = getDefsUses(statement);
            const newFlows = [...defs].filter(([name, defstmt]) => useNames.has(name))
                .map(([_, defstmt]) => ({ fromNode: defstmt, toNode: statement }));
            dataflows = union(dataflows, new Set(newFlows));
            const genSet = new Set([...defNames].map<[string, ast.ISyntaxNode]>(name => [name, statement]));
            const killSet = new Set([...defs].filter(([name,_]) => defNames.has(name)));
            defs = union(defs, diff(genSet, killSet));
            if (defs.size > definitions.get(block.id).size) {
                definitions.set(block.id, defs);
                for (let succ of cfg.getSuccessors(block)) {
                    if (workQueue.indexOf(succ) < 0) {
                        workQueue.push(succ);
                    }
                }
            }
        }
    }
    return dataflows;
}