import * as ast from './parsers/python/python_parser';
import { Block, ControlFlowGraph } from './ControlFlowGraph';
import { Set, StringSet } from './Set';
import { ILocation, ISyntaxNode } from './parsers/python/python_parser';



export interface IDataflow {
    fromNode: ast.ISyntaxNode;
    toNode: ast.ISyntaxNode;
}


function getNames(node: ast.ISyntaxNode | ast.ISyntaxNode[]): StringSet {
    if (Array.isArray(node)) {
        return new StringSet().union(...node.map(getNames));
    } else {
        return new StringSet(...ast.walk(node)
            .filter(e => e.type == ast.NAME)
            .map((e: ast.IName) => e.id));
    }
}

function getDefsUses(statement: ast.ISyntaxNode): [StringSet, StringSet] {
    if (statement.type === ast.ASSIGN) {
        return [getNames(statement.targets), getNames(statement.sources)];
    }
    return [new StringSet(), getNames(statement)];
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
    if (!df.fromNode.location) console.error('*** FROM',df.fromNode, df.fromNode.location);
    if (!df.toNode.location) console.error('*** TO', df.toNode, df.toNode.location);
    return locString(df.fromNode.location) + '->' + locString(df.toNode.location);
}

export function dataflowAnalysis(cfg: ControlFlowGraph): Set<IDataflow> {
    const workQueue: Block[] = cfg.blocks;

    const definitionsForBlock = new Map(workQueue.map<[number, DefSet]>(block =>
        ([block.id, new Set(getDefSetId)])));

    let dataflows = new Set<IDataflow>(getDataflowId);

    while (workQueue.length) {
        const block = workQueue.pop();

        // incoming definitions are those from every predecessor block
        let defs = new Set(getDefSetId).union(...cfg.getPredecessors(block)
            .map(block => definitionsForBlock.get(block.id)));

        for (let statement of block.statements) {
            const [definedHere, usedHere] = getDefsUses(statement);

            const newFlows = defs.filter(([name, _]) => usedHere.contains(name))
                .map(getDataflowId, ([_, defstmt]) => ({ fromNode: defstmt, toNode: statement }));

            dataflows = dataflows.union(newFlows);

            const genSet = definedHere.map<[string, ISyntaxNode]>(getDefSetId, name => [name, statement]);
            const killSet = defs.filter(([name, _]) => definedHere.contains(name));
            defs = defs.union(genSet).minus(killSet);

            if (defs.size > definitionsForBlock.get(block.id).size) {
                // Definitions have changed, so redo the successor blocks. 
                definitionsForBlock.set(block.id, defs);
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