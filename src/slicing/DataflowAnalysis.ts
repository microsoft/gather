import * as ast from '../parsers/python/python_parser';
import { Block, ControlFlowGraph } from './ControlFlowAnalysis';
import { Set, StringSet } from './Set';
import { SlicerConfig } from './SlicerConfig';



export interface IDataflow {
    fromNode: ast.ISyntaxNode;
    toNode: ast.ISyntaxNode;
}

export enum DefType {
    ASSIGN,
    CLASS,
    FUNCTION,
    IMPORT,
    MUTATION,
    MAGIC
};

export type Def = {
    type: DefType;
    name: string;
    location: ast.ILocation;
};

export class DefSet extends Set<Def> {
    constructor(...items: Def[]) {
        super(d => d.name + d.location.toString(), ...items);
    }
};

function locString(loc: ast.ILocation): string {
    return loc.first_line + ':' + loc.first_column + '-' + loc.last_line + ':' + loc.last_column;
}

function getNameSetId([name, node]: [string, ast.ISyntaxNode]) {
    if (!node.location) console.error('***', node);
    return name + '@' + locString(node.location);
}

class NameSet extends Set<[string, ast.ISyntaxNode]> {
    constructor(...items: [string, ast.ISyntaxNode][]) {
        super(getNameSetId, ...items);
    }
}

function gatherNames(node: ast.ISyntaxNode | ast.ISyntaxNode[]): NameSet {
    if (Array.isArray(node)) {
        return new NameSet().union(...node.map(gatherNames));
    } else {
        return new NameSet(...ast.walk(node)
            .filter(e => e.type == ast.NAME)
            .map((e: ast.IName): [ string, ast.ISyntaxNode ] => [ e.id, e ]));
    }
}

interface IDefUseInfo { defs: StringSet, uses: StringSet };

interface SymbolTable {
    // ⚠️ We should be doing full-blown symbol resolution, but meh 🙄
    moduleNames: StringSet;
}

/**
 * Tree walk listener for collecting manual def annotations.
 */
class DefAnnotationListener implements ast.IWalkListener {
    onEnterNode(node: ast.ISyntaxNode, type: string) {
        
        if (type == ast.LITERAL) {
            let literal = node as ast.ILiteral;

            // If this is a string, try to parse a def annotation from it
            if (typeof(literal.value) == 'string' || literal.value instanceof String) {
                let string = literal.value;
                let jsonMatch = string.match(/"defs: (.*)"/);
                if (jsonMatch && jsonMatch.length >= 2) {
                    let jsonString = jsonMatch[1];
                    let jsonStringUnescaped = jsonString.replace(/\\"/g, "\"");
                    try {
                        let defSpecs = JSON.parse(jsonStringUnescaped);
                        for (let defSpec of defSpecs) {
                            this.defs.add({
                                type: DefType.MAGIC,
                                name: defSpec.name,
                                location: {
                                    first_line: defSpec.pos[0][0] + node.location.first_line,
                                    first_column: defSpec.pos[0][1],
                                    last_line: defSpec.pos[1][0] + node.location.first_line,
                                    last_column: defSpec.pos[1][1]
                                },
                            });
                        }
                    } catch(e) {}
                }
            }
        }
    }

    readonly defs: DefSet = new DefSet();
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
                    this.names.add([(node as ast.IName).id, node]);
                    break;
                }
            }
        }
    }

    private _slicerConfig: SlicerConfig;
    private _parentsOfRelevantNames: ast.ISyntaxNode[] = [];
    readonly names: NameSet = new NameSet();
}

export function getDefs(
    statement: ast.ISyntaxNode, symbolTable: SymbolTable, slicerConfig?: SlicerConfig): DefSet {

    let defs = new DefSet();
    if (!statement) return defs;

    slicerConfig = slicerConfig || new SlicerConfig();

    // ️⚠️ The following is heuristic and unsound, but works for many scripts:
    // Unless noted in the `slicerConfig`, assume that no instances or arguments are changed
    // by a function call.
    let callNamesListener = new CallNamesListener(slicerConfig);
    ast.walk(statement, callNamesListener);
    defs.add(...callNamesListener.names.items.map(([name, node]) => {
        return {
            type: DefType.MUTATION,
            name: name,
            location: node.location
        }
    }));

    let defAnnotationsListener = new DefAnnotationListener();
    ast.walk(statement, defAnnotationsListener);
    defs = defs.union(defAnnotationsListener.defs);

    switch (statement.type) {
        case ast.IMPORT: {
            const modnames = statement.names.map(i => i.name || i.path);
            symbolTable.moduleNames.add(...modnames);
            defs.add(...statement.names.map((nameNode) => {
                    return {
                        type: DefType.IMPORT,
                        name: nameNode.name || nameNode.path,
                        location: nameNode.location
                    };
                }));
            break;
        }
        case ast.FROM: {
            // ⚠️ Doesn't handle 'from <pkg> import *'
            let modnames: Array<string> = [];
            if (statement.imports.constructor === Array) {
                modnames = statement.imports.map(i => i.name || i.path);
                symbolTable.moduleNames.add(...modnames);
                defs.add(...statement.imports.map((i) => {
                    return {
                        type: DefType.IMPORT,
                        name: i.name || i.path,
                        location: i.location
                    }
                }));
            }
            break;
        }
        case ast.ASSIGN: {
            const targetNames = gatherNames(statement.targets);
            defs.add(...targetNames.items.map(([name, node]) => {
                return {
                    type: DefType.ASSIGN,
                    name: name,
                    location: node.location
                };
            }));
            break;
        }
        case ast.DEF: {
            defs.add({
                type: DefType.FUNCTION,
                name: statement.name,
                location: statement.location
            });
            break;
        }
        case ast.CLASS: {
            defs.add({
                type: DefType.CLASS,
                name: statement.name,
                location: statement.location
            })
        }
    }
    return defs;
}

export function getUses(statement: ast.ISyntaxNode, symbolTable: SymbolTable): NameSet {

    let uses = new NameSet();

    switch (statement.type) {
        // TODO: should we collect when importing with FROM from something else that was already imported...
        case ast.ASSIGN: {
            // XXX: Is this supposed to union with funcArgs?
            const targetNames = gatherNames(statement.targets);
            uses = uses.union(gatherNames(statement.sources)).union(statement.op ? targetNames : new NameSet());
            break;
        }
        default: {
            uses = uses.union(gatherNames(statement));
            break;
        }
    }

    return uses;
}

export function getDefsUses(
    statement: ast.ISyntaxNode, symbolTable: SymbolTable, slicerConfig?: SlicerConfig): IDefUseInfo {
    let defSet = getDefs(statement, symbolTable, slicerConfig);
    let useSet = getUses(statement, symbolTable);
    return {
        defs: new StringSet(...defSet.items.map((def) => def.name)),
        uses: new StringSet(...useSet.items.map((use) => use[0]))
    };
}

function getDataflowId(df: IDataflow) {
    if (!df.fromNode.location) console.error('*** FROM', df.fromNode, df.fromNode.location);
    if (!df.toNode.location) console.error('*** TO', df.toNode, df.toNode.location);
    return locString(df.fromNode.location) + '->' + locString(df.toNode.location);
}

export function dataflowAnalysis(cfg: ControlFlowGraph): Set<IDataflow> {
    const workQueue: Block[] = cfg.blocks.reverse();

    const definitionsForBlock = new Map(workQueue.map<[number, NameSet]>(block =>
        ([block.id, new Set(getNameSetId)])));

    let dataflows = new Set<IDataflow>(getDataflowId);

    let symbolTable: SymbolTable = { moduleNames: new StringSet() };

    while (workQueue.length) {
        const block = workQueue.pop();

        // incoming definitions are those from every predecessor block
        let oldDefs = definitionsForBlock.get(block.id);
        let defs = oldDefs.union(...cfg.getPredecessors(block)
            .map(block => definitionsForBlock.get(block.id)));

        const loopUses = new StringSet(...[].concat(block.loopVariables.map(s => 
                { return getUses(s, symbolTable).items.map((u) => u[0]); }
            )));

        for (let statement of block.statements) {
            let { defs: definedHere, uses: usedHere } = getDefsUses(statement, symbolTable);
            usedHere = usedHere.union(loopUses);

            // TODO: fix up dataflow computation within this block: check for definitions in
            // defsWithinBlock first; if found, don't look to defs that come from the predecessor.

            // For everything that's defined coming into this block, if it's used in this block, save connection.
            const newFlows = defs.filter(([name, _]) => usedHere.contains(name))
                .map(getDataflowId, ([_, defstmt]) => ({ fromNode: defstmt, toNode: statement }));

            dataflows = dataflows.union(newFlows);

            const genSet = definedHere.map(getNameSetId, name => [name, statement]) as Set<[string, ast.ISyntaxNode]>;
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