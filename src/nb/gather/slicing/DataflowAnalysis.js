var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
define(["require", "exports", "../parsers/python/python_parser", "./Set", "./SlicerConfig"], function (require, exports, ast, Set_1, SlicerConfig_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var DefType;
    (function (DefType) {
        DefType[DefType["ASSIGN"] = 0] = "ASSIGN";
        DefType[DefType["IMPORT"] = 1] = "IMPORT";
        DefType[DefType["MUTATION"] = 2] = "MUTATION";
    })(DefType = exports.DefType || (exports.DefType = {}));
    ;
    var DefSet = /** @class */ (function (_super) {
        __extends(DefSet, _super);
        function DefSet() {
            var items = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                items[_i] = arguments[_i];
            }
            return _super.apply(this, [function (d) { return d.name + d.location.toString(); }].concat(items)) || this;
        }
        return DefSet;
    }(Set_1.Set));
    exports.DefSet = DefSet;
    ;
    function locString(loc) {
        return loc.first_line + ':' + loc.first_column + '-' + loc.last_line + ':' + loc.last_column;
    }
    function getNameSetId(_a) {
        var name = _a[0], node = _a[1];
        if (!node.location)
            console.error('***', node);
        return name + '@' + locString(node.location);
    }
    var NameSet = /** @class */ (function (_super) {
        __extends(NameSet, _super);
        function NameSet() {
            var items = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                items[_i] = arguments[_i];
            }
            return _super.apply(this, [getNameSetId].concat(items)) || this;
        }
        return NameSet;
    }(Set_1.Set));
    function gatherNames(node) {
        if (Array.isArray(node)) {
            return (_a = new NameSet()).union.apply(_a, node.map(gatherNames));
        }
        else {
            return new (NameSet.bind.apply(NameSet, [void 0].concat(ast.walk(node)
                .filter(function (e) { return e.type == ast.NAME; })
                .map(function (e) { return [e.id, e]; }))))();
        }
        var _a;
    }
    ;
    /**
     * Tree walk listener for collecting names used in function call.
     */
    var CallNamesListener = /** @class */ (function () {
        function CallNamesListener(slicerConfig) {
            this._parentsOfRelevantNames = [];
            this.names = new NameSet();
            this._slicerConfig = slicerConfig;
        }
        CallNamesListener.prototype.onEnterNode = function (node, type, ancestors) {
            var _this = this;
            if (type == ast.CALL) {
                var callNode_1 = node;
                var name_1;
                if (callNode_1.func.type == ast.DOT) {
                    name_1 = callNode_1.func.name.toString();
                }
                else {
                    name_1 = callNode_1.func.id;
                }
                this._slicerConfig.functionConfigs
                    .filter(function (config) { return config.functionName == name_1; })
                    .forEach(function (config) {
                    if (config.mutatesInstance && callNode_1.func.type == ast.DOT) {
                        _this._parentsOfRelevantNames.push(callNode_1.func.value);
                    }
                    config.positionalArgumentsMutated.forEach(function (position) {
                        _this._parentsOfRelevantNames.push(callNode_1.args[position].actual);
                    });
                    config.keywordArgumentsMutated.forEach(function (keyword) {
                        callNode_1.args.forEach(function (arg) {
                            if (arg.keyword && arg.keyword.id == keyword) {
                                _this._parentsOfRelevantNames.push(arg.actual);
                            }
                        });
                    });
                });
            }
            if (type == ast.NAME) {
                for (var _i = 0, ancestors_1 = ancestors; _i < ancestors_1.length; _i++) {
                    var ancestor = ancestors_1[_i];
                    if (this._parentsOfRelevantNames.indexOf(ancestor) != -1) {
                        this.names.add([node.id, node]);
                        break;
                    }
                }
            }
        };
        return CallNamesListener;
    }());
    function getDefs(statement, symbolTable, slicerConfig) {
        slicerConfig = slicerConfig || new SlicerConfig_1.SlicerConfig();
        var defs = new DefSet();
        // ️⚠️ The following is heuristic and unsound, but works for many scripts:
        // Unless noted in the `slicerConfig`, assume that no instances or arguments are changed
        // by a function call.
        var callNamesListener = new CallNamesListener(slicerConfig);
        ast.walk(statement, callNamesListener);
        defs.add.apply(defs, callNamesListener.names.items.map(function (_a) {
            var name = _a[0], node = _a[1];
            return {
                type: DefType.MUTATION,
                name: name,
                location: node.location
            };
        }));
        switch (statement.type) {
            case ast.IMPORT: {
                var modnames = statement.names.map(function (i) { return i.name || i.path; });
                (_a = symbolTable.moduleNames).add.apply(_a, modnames);
                defs.add.apply(defs, statement.names.map(function (nameNode) {
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
                var modnames = [];
                if (statement.imports.constructor === Array) {
                    modnames = statement.imports.map(function (i) { return i.name || i.path; });
                    (_b = symbolTable.moduleNames).add.apply(_b, modnames);
                    defs.add.apply(defs, statement.imports.map(function (i) {
                        return {
                            type: DefType.IMPORT,
                            name: i.name || i.path,
                            location: i.location
                        };
                    }));
                }
                break;
            }
            case ast.ASSIGN: {
                var targetNames = gatherNames(statement.targets);
                defs.add.apply(defs, targetNames.items.map(function (_a) {
                    var name = _a[0], node = _a[1];
                    return {
                        type: DefType.ASSIGN,
                        name: name,
                        location: node.location
                    };
                }));
                break;
            }
        }
        return defs;
        var _a, _b;
    }
    exports.getDefs = getDefs;
    function getUses(statement, symbolTable) {
        var uses = new NameSet();
        switch (statement.type) {
            // TODO: should we collect when importing with FROM from something else that was already imported...
            case ast.ASSIGN: {
                // XXX: Is this supposed to union with funcArgs?
                var targetNames = gatherNames(statement.targets);
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
    exports.getUses = getUses;
    function getDefsUses(statement, symbolTable, slicerConfig) {
        var defSet = getDefs(statement, symbolTable, slicerConfig);
        var useSet = getUses(statement, symbolTable);
        return {
            defs: new (Set_1.StringSet.bind.apply(Set_1.StringSet, [void 0].concat(defSet.items.map(function (def) { return def.name; }))))(),
            uses: new (Set_1.StringSet.bind.apply(Set_1.StringSet, [void 0].concat(useSet.items.map(function (use) { return use[0]; }))))()
        };
    }
    exports.getDefsUses = getDefsUses;
    function getDataflowId(df) {
        if (!df.fromNode.location)
            console.error('*** FROM', df.fromNode, df.fromNode.location);
        if (!df.toNode.location)
            console.error('*** TO', df.toNode, df.toNode.location);
        return locString(df.fromNode.location) + '->' + locString(df.toNode.location);
    }
    function dataflowAnalysis(cfg) {
        var workQueue = cfg.blocks.reverse();
        var definitionsForBlock = new Map(workQueue.map(function (block) {
            return ([block.id, new Set_1.Set(getNameSetId)]);
        }));
        var dataflows = new Set_1.Set(getDataflowId);
        var symbolTable = { moduleNames: new Set_1.StringSet() };
        while (workQueue.length) {
            var block = workQueue.pop();
            // incoming definitions are those from every predecessor block
            var oldDefs = definitionsForBlock.get(block.id);
            var defs = oldDefs.union.apply(oldDefs, cfg.getPredecessors(block)
                .map(function (block) { return definitionsForBlock.get(block.id); }));
            var loopUses = new (Set_1.StringSet.bind.apply(Set_1.StringSet, [void 0].concat([].concat(block.loopVariables.map(function (s) { return getUses(s, symbolTable).items.map(function (u) { return u[0]; }); })))))();
            var _loop_1 = function (statement) {
                var _a = getDefsUses(statement, symbolTable), definedHere = _a.defs, usedHere = _a.uses;
                usedHere = usedHere.union(loopUses);
                // TODO: fix up dataflow computation within this block: check for definitions in
                // defsWithinBlock first; if found, don't look to defs that come from the predecessor.
                // For everything that's defined coming into this block, if it's used in this block, save connection.
                var newFlows = defs.filter(function (_a) {
                    var name = _a[0], _ = _a[1];
                    return usedHere.contains(name);
                })
                    .map(getDataflowId, function (_a) {
                    var _ = _a[0], defstmt = _a[1];
                    return ({ fromNode: defstmt, toNode: statement });
                });
                dataflows = dataflows.union(newFlows);
                var genSet = definedHere.map(getNameSetId, function (name) { return [name, statement]; });
                var killSet = defs.filter(function (_a) {
                    var name = _a[0], _ = _a[1];
                    return definedHere.contains(name);
                });
                defs = defs.minus(killSet).union(genSet);
            };
            for (var _i = 0, _a = block.statements; _i < _a.length; _i++) {
                var statement = _a[_i];
                _loop_1(statement);
            }
            if (!defs.equals(oldDefs)) {
                // Definitions have changed, so redo the successor blocks. 
                definitionsForBlock.set(block.id, defs);
                for (var _b = 0, _c = cfg.getSuccessors(block); _b < _c.length; _b++) {
                    var succ = _c[_b];
                    if (workQueue.indexOf(succ) < 0) {
                        workQueue.push(succ);
                    }
                }
            }
        }
        return dataflows;
    }
    exports.dataflowAnalysis = dataflowAnalysis;
});
