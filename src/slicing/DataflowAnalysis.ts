import * as ast from '../parsers/python/python_parser';
import { Block, ControlFlowGraph } from './ControlFlowAnalysis';
import { Set, StringSet } from './Set';
import { SlicerConfig } from './SlicerConfig';


export interface IDataflow {
    fromNode: ast.ISyntaxNode;
    toNode: ast.ISyntaxNode;
}

export enum ReferenceType {
    DEFINITION = "DEFINITION",
    GLOBAL_CONFIG = "GLOBAL_CONFIG",
    INITIALIZATION = "INITIALIZATION",
    UPDATE = "UPDATE",
    USE = "USE",
};

export enum SymbolType {
    VARIABLE,
    CLASS,
    FUNCTION,
    IMPORT,
    MUTATION,
    MAGIC
};

export interface Ref {
    type: SymbolType;
    level: ReferenceType;
    name: string;
    location: ast.ILocation;
    statement: ast.ISyntaxNode;
};

export class RefSet extends Set<Ref> {
    constructor(...items: Ref[]) {
        super(r => r.name + r.level + r.location.toString(), ...items);
    }
};

function locString(loc: ast.ILocation): string {
    return loc.first_line + ':' + loc.first_column + '-' + loc.last_line + ':' + loc.last_column;
}

export function sameLocation(loc1: ast.ILocation, loc2: ast.ILocation): boolean {
    return loc1.first_column === loc2.first_column &&
        loc1.first_line === loc2.first_line &&
        loc1.last_column === loc2.last_column &&
        loc1.last_line === loc2.last_line;
}


function getNameSetId([name, node]: [string, ast.ISyntaxNode]) {
    if (!node.location) console.log('***', node);
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
            .map((e: ast.IName): [string, ast.ISyntaxNode] => [e.id, e]));
    }
}

interface IDefUseInfo { defs: RefSet, uses: RefSet };

interface SymbolTable {
    // ⚠️ We should be doing full-blown symbol resolution, but meh 🙄
    moduleNames: StringSet;
}

const DEFAULT_SLICER_CONFIG = new SlicerConfig();


/**
 * Tree walk listener for collecting manual def annotations.
 */
class DefAnnotationListener implements ast.IWalkListener {

    constructor(statement: ast.ISyntaxNode) {
        this._statement = statement;
    }

    onEnterNode(node: ast.ISyntaxNode, type: string) {

        if (type == ast.LITERAL) {
            let literal = node as ast.ILiteral;

            // If this is a string, try to parse a def annotation from it
            if (typeof (literal.value) == 'string' || literal.value instanceof String) {
                let string = literal.value;
                let jsonMatch = string.match(/"defs: (.*)"/);
                if (jsonMatch && jsonMatch.length >= 2) {
                    let jsonString = jsonMatch[1];
                    let jsonStringUnescaped = jsonString.replace(/\\"/g, "\"");
                    try {
                        let defSpecs = JSON.parse(jsonStringUnescaped);
                        for (let defSpec of defSpecs) {
                            this.defs.add({
                                type: SymbolType.MAGIC,
                                level: ReferenceType.DEFINITION,
                                name: defSpec.name,
                                location: {
                                    first_line: defSpec.pos[0][0] + node.location.first_line,
                                    first_column: defSpec.pos[0][1],
                                    last_line: defSpec.pos[1][0] + node.location.first_line,
                                    last_column: defSpec.pos[1][1]
                                },
                                statement: this._statement
                            });
                        }
                    } catch (e) { }
                }
            }
        }
    }

    private _statement: ast.ISyntaxNode;
    readonly defs: RefSet = new RefSet();
}


/**
 * Tree walk listener for collecting names used in function call.
 */
class CallNamesListener implements ast.IWalkListener {

    constructor(slicerConfig: SlicerConfig, statement: ast.ISyntaxNode) {
        this._slicerConfig = slicerConfig;
        this._statement = statement;
    }

    // TODO: Include the level of each name...
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
                .filter(config => config.pattern.functionName == name)
                .filter(config => {
                    if (!config.pattern.instanceNames) return true;
                    if (callNode.func.type == ast.DOT &&
                        callNode.func.value.type == ast.NAME) {
                        let instanceName = (callNode.func.value as ast.IName).id
                        return config.pattern.instanceNames.indexOf(instanceName) != -1;
                    }
                    return false;
                })
                .forEach(config => {
                    if (config.instanceEffect && callNode.func.type == ast.DOT) {
                        if (config.pattern.instanceNames) {

                        }
                        this._parentsOfRelevantNames.push({
                            node: callNode.func.value,
                            effect: config.instanceEffect
                        });
                    }
                    if (config.positionalArgumentEffects) {
                        for (let posArg in config.positionalArgumentEffects) {
                            if (config.positionalArgumentEffects.hasOwnProperty(posArg)) {
                                this._parentsOfRelevantNames.push({
                                    node: callNode.args[posArg].actual,
                                    effect: config.positionalArgumentEffects[posArg]
                                });
                            }
                        }
                    }
                    if (config.keywordArgumentEffects) {
                        for (let kwArg in config.keywordArgumentEffects) {
                            if (config.keywordArgumentEffects.hasOwnProperty(kwArg)) {
                                for (let arg of callNode.args) {
                                    if (arg.keyword && (arg.keyword as ast.IName).id == kwArg) {
                                        this._parentsOfRelevantNames.push({
                                            node: arg.actual,
                                            effect: config.keywordArgumentEffects[kwArg]
                                        });
                                    }
                                }
                            }
                        }
                    }
                });
        }
        if (type == ast.NAME) {
            let foundName = false;
            for (let ancestor of ancestors) {
                for (let nameParent of this._parentsOfRelevantNames) {
                    if (nameParent.node == ancestor) {
                        this.defs.add({
                            type: SymbolType.MUTATION,
                            level: nameParent.effect,
                            name: (node as ast.IName).id,
                            location: node.location,
                            statement: this._statement
                        });
                        foundName = true;
                    }
                    if (foundName) break;
                }
                if (foundName) break;
            }
        }
    }

    private _slicerConfig: SlicerConfig;
    private _statement: ast.ISyntaxNode;
    private _parentsOfRelevantNames: { node: ast.ISyntaxNode, effect: ReferenceType }[] = [];
    readonly defs: RefSet = new RefSet();
}


/**
 * Tree walk listener for collecting definitions in the target of an assignment.
 */
class TargetsDefListener implements ast.IWalkListener {

    constructor(statement: ast.ISyntaxNode) {
        this._statement = statement;
    }

    // TODO: Include the level of each name...
    onEnterNode(node: ast.ISyntaxNode, type: string, ancestors: ast.ISyntaxNode[]) {
        if (type == ast.NAME) {
            let level = ReferenceType.DEFINITION;
            if (ancestors.some(a => a.type == ast.DOT)) {
                level = ReferenceType.UPDATE;
            } else if (ancestors.some(a => a.type == ast.INDEX)) {
                level = ReferenceType.UPDATE;
            }
            this.defs.add({
                type: SymbolType.VARIABLE,
                level: level,
                location: node.location,
                name: (node as ast.IName).id,
                statement: this._statement
            });
        }
    }

    private _statement: ast.ISyntaxNode;
    readonly defs: RefSet = new RefSet();
}


export function getDefs(
    statement: ast.ISyntaxNode, symbolTable: SymbolTable, slicerConfig?: SlicerConfig): RefSet {

    let defs = new RefSet();
    if (!statement) return defs;

    slicerConfig = slicerConfig || DEFAULT_SLICER_CONFIG;

    // ️⚠️ The following is heuristic and unsound, but works for many scripts:
    // Unless noted in the `slicerConfig`, assume that no instances or arguments are changed
    // by a function call.
    let callNamesListener = new CallNamesListener(slicerConfig, statement);
    ast.walk(statement, callNamesListener);
    defs.add(...callNamesListener.defs.items);

    let defAnnotationsListener = new DefAnnotationListener(statement);
    ast.walk(statement, defAnnotationsListener);
    defs = defs.union(defAnnotationsListener.defs);

    switch (statement.type) {
        case ast.IMPORT: {
            const modnames = statement.names.map(i => i.name || i.path);
            symbolTable.moduleNames.add(...modnames);
            defs.add(...statement.names.map(nameNode => {
                return {
                    type: SymbolType.IMPORT,
                    level: ReferenceType.DEFINITION,
                    name: nameNode.name || nameNode.path,
                    location: nameNode.location,
                    statement: statement
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
                defs.add(...statement.imports.map(i => {
                    return {
                        type: SymbolType.IMPORT,
                        level: ReferenceType.DEFINITION,
                        name: i.name || i.path,
                        location: i.location,
                        statement: statement
                    }
                }));
            }
            break;
        }
        case ast.ASSIGN: {
            let targetsDefListener = new TargetsDefListener(statement);
            if (statement.targets) {
                for (let target of statement.targets) {
                    ast.walk(target, targetsDefListener);
                }
            }
            defs = defs.union(targetsDefListener.defs);
            break;
        }
        case ast.DEF: {
            defs.add({
                type: SymbolType.FUNCTION,
                level: ReferenceType.DEFINITION,
                name: statement.name,
                location: statement.location,
                statement: statement
            });
            break;
        }
        case ast.CLASS: {
            defs.add({
                type: SymbolType.CLASS,
                level: ReferenceType.DEFINITION,
                name: statement.name,
                location: statement.location,
                statement: statement
            })
        }
    }
    return defs;
}

export function getUses(statement: ast.ISyntaxNode, _: SymbolTable, slicerConfig?: SlicerConfig): RefSet {

    let uses = new RefSet();

    switch (statement.type) {
        // TODO: should we collect when importing with FROM from something else that was already imported...
        case ast.ASSIGN: {
            // XXX: Is this supposed to union with funcArgs?
            const targetNames = gatherNames(statement.targets);
            const targets = new RefSet(...targetNames.items.map(([name, node]) => {
                return {
                    type: SymbolType.VARIABLE,
                    level: ReferenceType.USE,
                    name: name,
                    location: node.location,
                    statement: statement
                };
            }));
            const sourceNames = gatherNames(statement.sources);
            const sources = new RefSet(...sourceNames.items.map(([name, node]) => {
                return {
                    type: SymbolType.VARIABLE,
                    level: ReferenceType.USE,
                    name: name,
                    location: node.location,
                    statement: statement
                };
            }));
            uses = uses.union(sources).union(statement.op ? targets : new RefSet());
            break;
        }
        case ast.DEF:
            let defCfg = new ControlFlowGraph(statement);
            let argNames = new StringSet(...statement.params.map(p => {
                if (p && p instanceof Array && p.length > 0 && p[0].name) {
                    return p[0].name;
                }
            }).filter(n => n != undefined));
            let undefinedRefs = dataflowAnalysis(defCfg, slicerConfig, argNames).undefinedRefs;
            uses = undefinedRefs.filter(r => r.level == ReferenceType.USE);
            break;
        case ast.CLASS:
            break;
        default: {
            const usedNames = gatherNames(statement);
            uses = new RefSet(...usedNames.items.map(([name, node]) => {
                return {
                    type: SymbolType.VARIABLE,
                    level: ReferenceType.USE,
                    name: name,
                    location: node.location,
                    statement: statement
                };
            }));
            break;
        }
    }

    return uses;
}

export function getDefsUses(
    statement: ast.ISyntaxNode, symbolTable: SymbolTable, slicerConfig?: SlicerConfig): IDefUseInfo {
    let defSet = getDefs(statement, symbolTable, slicerConfig);
    let useSet = getUses(statement, symbolTable, slicerConfig);
    return {
        defs: defSet,
        uses: useSet
    };
}

function getDataflowId(df: IDataflow) {
    if (!df.fromNode.location) console.log('*** FROM', df.fromNode, df.fromNode.location);
    if (!df.toNode.location) console.log('*** TO', df.toNode, df.toNode.location);
    return locString(df.fromNode.location) + '->' + locString(df.toNode.location);
}

function createFlowsFrom(fromSet: RefSet, toSet: RefSet, fromStatement: ast.ISyntaxNode):
    [Set<IDataflow>, Set<Ref>] {
    let refsDefined = new RefSet();
    let newFlows = new Set<IDataflow>(getDataflowId);
    for (let from of fromSet.items) {
        for (let to of toSet.items) {
            if (to.name == from.name) {
                refsDefined.add(from);
                newFlows.add({ fromNode: to.statement, toNode: fromStatement });
            }
        }
    }
    return [newFlows, refsDefined];
}


let DEPENDENCY_RULES = [
    // "from" depends on all reference types in "to"
    {
        from: ReferenceType.USE,
        to: [ReferenceType.DEFINITION, ReferenceType.GLOBAL_CONFIG, ReferenceType.INITIALIZATION, ReferenceType.UPDATE]
    },
    {
        from: ReferenceType.UPDATE,
        to: [ReferenceType.DEFINITION, ReferenceType.GLOBAL_CONFIG, ReferenceType.INITIALIZATION, ReferenceType.UPDATE]
    },
    {
        from: ReferenceType.INITIALIZATION,
        to: [ReferenceType.DEFINITION, ReferenceType.GLOBAL_CONFIG]
    },
    {
        from: ReferenceType.GLOBAL_CONFIG,
        to: [ReferenceType.DEFINITION, ReferenceType.GLOBAL_CONFIG]
    }
];


let TYPES_WITH_DEPENDENCIES = DEPENDENCY_RULES.map(r => r.from);

let KILL_RULES = [
    // Which types of references "kill" which other types of references?
    // In general, the rule of thumb here is, if x depends on y, x kills y, because anything that
    // depends on x will now depend on y transitively.
    // If x overwrites y, x also kills y.
    // The one case where a variable doesn't kill a previous variable is the global configuration, because
    // it neither depends on initializations or updates, nor clobbers them.
    {
        level: ReferenceType.UPDATE,
        kills: [ReferenceType.UPDATE, ReferenceType.INITIALIZATION, ReferenceType.GLOBAL_CONFIG, ReferenceType.DEFINITION]
    },
    {
        level: ReferenceType.INITIALIZATION,
        kills: [ReferenceType.UPDATE, ReferenceType.INITIALIZATION, ReferenceType.GLOBAL_CONFIG, ReferenceType.DEFINITION]
    },
    {
        level: ReferenceType.GLOBAL_CONFIG,
        kills: [ReferenceType.GLOBAL_CONFIG, ReferenceType.DEFINITION]
    },
    {
        level: ReferenceType.DEFINITION,
        kills: [ReferenceType.UPDATE, ReferenceType.INITIALIZATION, ReferenceType.GLOBAL_CONFIG, ReferenceType.DEFINITION]
    }
];


function updateDefsForLevel(defsForLevel: RefSet, level: string, newRefs: { [level: string]: RefSet },
    dependencyRules: { from: ReferenceType, to: ReferenceType[] }[]) {
    let genSet = new RefSet();
    let levelDependencies = dependencyRules.filter(r => r.from == level).pop();
    for (let level of Object.keys(ReferenceType)) {
        newRefs[level].items.forEach(ref => {
            if (levelDependencies && levelDependencies.to.indexOf(ref.level) != -1) {
                genSet.add(ref);
            }
        });
    }
    const killSet = defsForLevel.filter(def => {
        let found = false;
        genSet.items.forEach(gen => {
            if (gen.name == def.name) {
                let killRules = KILL_RULES.filter(r => r.level == gen.level).pop();
                if (killRules && killRules.kills.indexOf(def.level) != -1) {
                    found = true;
                }
            }
        });
        return found;
    });
    return defsForLevel.minus(killSet).union(genSet);
}


export type DataflowAnalysisResult = {
    flows: Set<IDataflow>,
    undefinedRefs: RefSet
};


export function dataflowAnalysis(cfg: ControlFlowGraph,
    slicerConfig?: SlicerConfig, namesDefined?: StringSet): DataflowAnalysisResult {

    slicerConfig = slicerConfig || DEFAULT_SLICER_CONFIG;
    let symbolTable: SymbolTable = { moduleNames: new StringSet() };
    const workQueue: Block[] = cfg.blocks.reverse();
    let undefinedRefs = new RefSet();

    let defsForLevelByBlock: { [level: string]: { [blockId: number]: RefSet } } = {}
    for (let level of Object.keys(ReferenceType)) {
        defsForLevelByBlock[level] = {};
        for (let block of workQueue) {
            defsForLevelByBlock[level][block.id] = new RefSet();
        }
    }

    let dataflows = new Set<IDataflow>(getDataflowId);

    while (workQueue.length) {
        const block = workQueue.pop();

        let oldDefsForLevel: { [level: string]: RefSet } = {};
        let defsForLevel: { [level: string]: RefSet } = {};
        for (let level of Object.keys(ReferenceType)) {
            oldDefsForLevel[level] = defsForLevelByBlock[level][block.id];
            // incoming definitions are come from predecessor blocks
            defsForLevel[level] = oldDefsForLevel[level].union(...cfg.getPredecessors(block)
                .map(block => defsForLevelByBlock[level][block.id])
                .filter(s => s != undefined));
        }

        // TODO: fix up dataflow computation within this block: check for definitions in
        // defsWithinBlock first; if found, don't look to defs that come from the predecessor.
        for (let statement of block.statements) {

            // Note that defs includes updates, initializations, global configs, etc., that need to be separated out.
            let { defs: definedHere, uses: usedHere } = getDefsUses(statement, symbolTable, slicerConfig);

            // Sort definitions and uses into references.
            let statementRefs: { [level: string]: RefSet } = {};
            for (let level of Object.keys(ReferenceType)) {
                statementRefs[level] = new RefSet();
            }
            for (let def of definedHere.items) {
                statementRefs[def.level].add(def);
                if (TYPES_WITH_DEPENDENCIES.indexOf(def.level) != -1) {
                    undefinedRefs.add(def);
                }
            }
            // Only add uses that aren't actually defs.
            for (let use of usedHere.items) {
                if (!definedHere.items.some(def => def.name == use.name && sameLocation(def.location, use.location))) {
                    statementRefs[ReferenceType.USE].add(use);
                    undefinedRefs.add(use);
                }
            }

            // Get all new dataflow dependencies.
            let newFlows = new Set<IDataflow>(getDataflowId);
            for (let level of Object.keys(ReferenceType)) {
                // For everything that's defined coming into this block, if it's used in this block, save connection.
                let result = createFlowsFrom(statementRefs[level], defsForLevel[level], statement);
                let flowsCreated = result[0].items;
                let defined = result[1];
                newFlows.add(...flowsCreated);
                for (let ref of defined.items) {
                    undefinedRefs.remove(ref);
                }
            }
            dataflows = dataflows.union(newFlows);

            for (let level of Object.keys(ReferenceType)) {
                // 🙄 it doesn't really make sense to update the "use" set for a block but whatever
                defsForLevel[level] = updateDefsForLevel(defsForLevel[level], level, statementRefs, DEPENDENCY_RULES);
            }
        }

        // Check to see if definitions have changed. If so, redo the successor blocks.
        for (let level of Object.keys(ReferenceType)) {
            if (!oldDefsForLevel[level].equals(defsForLevel[level])) {
                defsForLevelByBlock[level][block.id] = defsForLevel[level];
                for (let succ of cfg.getSuccessors(block)) {
                    if (workQueue.indexOf(succ) < 0) {
                        workQueue.push(succ);
                    }
                }
            }
        }
    }

    // Check to see if any of the undefined names were defined coming into the graph. If so,
    // don't report them as being undefined.
    if (namesDefined) {
        for (let ref of undefinedRefs.items) {
            if (namesDefined.items.some(n => n == ref.name)) {
                undefinedRefs.remove(ref);
            }
        }
    }

    return {
        flows: dataflows,
        undefinedRefs: undefinedRefs
    };
}
