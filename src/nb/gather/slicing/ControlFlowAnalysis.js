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
define(["require", "exports", "../parsers/python/python_parser", "./Set"], function (require, exports, ast, Set_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Block = /** @class */ (function () {
        function Block(id, hint, statements, loopVariables) {
            if (loopVariables === void 0) { loopVariables = []; }
            this.id = id;
            this.hint = hint;
            this.statements = statements;
            this.loopVariables = loopVariables;
        }
        Block.prototype.toString = function () {
            return 'BLOCK ' + this.id + ' (' + this.hint + ')\n' +
                this.statements.map(function (s) { return '    line ' + s.location.first_line; }).join('\n');
        };
        return Block;
    }());
    exports.Block = Block;
    var BlockSet = /** @class */ (function (_super) {
        __extends(BlockSet, _super);
        function BlockSet() {
            var items = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                items[_i] = arguments[_i];
            }
            return _super.apply(this, [function (b) { return b.id.toString(); }].concat(items)) || this;
        }
        return BlockSet;
    }(Set_1.Set));
    var Context = /** @class */ (function () {
        function Context(loopHead, loopExit, exceptionBlock) {
            this.loopHead = loopHead;
            this.loopExit = loopExit;
            this.exceptionBlock = exceptionBlock;
        }
        Context.prototype.forLoop = function (loopHead, loopExit) {
            return new Context(loopHead, loopExit, this.exceptionBlock);
        };
        Context.prototype.forExcepts = function (exceptionBlock) {
            return new Context(this.loopHead, this.loopExit, exceptionBlock);
        };
        return Context;
    }());
    var ControlFlowGraph = /** @class */ (function () {
        function ControlFlowGraph(module) {
            this._blocks = [];
            this.globalId = 0;
            this.successors = new Set_1.Set(function (_a) {
                var b1 = _a[0], b2 = _a[1];
                return b1.id + ',' + b2.id;
            });
            this.loopVariables = [];
            this.postdominators = new PostdominatorSet();
            var statements = module.code;
            if (!(statements instanceof Array))
                statements = [statements];
            _a = this.makeCFG('entry', statements, new Context(null, null, this.makeBlock('exceptional exit'))), this.entry = _a[0], this.exit = _a[1];
            var _a;
        }
        ControlFlowGraph.prototype.makeBlock = function (hint, statements) {
            if (statements === void 0) { statements = []; }
            var b = new Block(this.globalId++, hint, statements);
            if (this.loopVariables.length) {
                b.loopVariables = this.loopVariables[this.loopVariables.length - 1];
            }
            this._blocks.push(b);
            return b;
        };
        Object.defineProperty(ControlFlowGraph.prototype, "blocks", {
            get: function () {
                var visited = [];
                var toVisit = new BlockSet(this.entry);
                var _loop_1 = function () {
                    var block = toVisit.take();
                    visited.push(block);
                    this_1.successors.items.forEach(function (_a) {
                        var pred = _a[0], succ = _a[1];
                        if (pred === block && visited.indexOf(succ) < 0) {
                            toVisit.add(succ);
                        }
                    });
                };
                var this_1 = this;
                while (!toVisit.empty) {
                    _loop_1();
                }
                return visited;
            },
            enumerable: true,
            configurable: true
        });
        ControlFlowGraph.prototype.getSuccessors = function (block) {
            return this.successors.items
                .filter(function (_a) {
                var p = _a[0], _ = _a[1];
                return p == block;
            })
                .map(function (_a) {
                var _ = _a[0], s = _a[1];
                return s;
            });
        };
        ControlFlowGraph.prototype.getPredecessors = function (block) {
            return this.successors.items
                .filter(function (_a) {
                var _ = _a[0], s = _a[1];
                return s == block;
            })
                .map(function (_a) {
                var p = _a[0], _ = _a[1];
                return p;
            });
        };
        ControlFlowGraph.prototype.print = function () {
            var _this = this;
            console.log('CFG', 'ENTRY:', this.entry.id, 'EXIT:', this.exit.id);
            this.blocks.forEach(function (block) {
                console.log(block.toString());
                if (block === _this.exit) {
                    console.log('    EXIT');
                }
                else {
                    console.log('    SUCC', _this.getSuccessors(block).map(function (b) { return b.id.toString(); }).join(','));
                }
            });
        };
        ControlFlowGraph.prototype.link = function () {
            var blocks = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                blocks[_i] = arguments[_i];
            }
            for (var i = 1; i < blocks.length; i++)
                this.successors.add([blocks[i - 1], blocks[i]]);
        };
        ControlFlowGraph.prototype.handleIf = function (statement, last, context) {
            var _this = this;
            var ifCondBlock = this.makeBlock('if cond', [statement.cond]);
            var _a = this.makeCFG('if body', statement.code, context), bodyEntry = _a[0], bodyExit = _a[1];
            this.link(last, ifCondBlock);
            this.link(ifCondBlock, bodyEntry);
            var joinBlock = this.makeBlock('conditional join');
            this.link(bodyExit, joinBlock);
            var lastCondBlock = ifCondBlock;
            if (statement.elif) {
                statement.elif.forEach(function (elif) {
                    var elifCondBlock = _this.makeBlock('elif cond', [elif.cond]);
                    _this.link(lastCondBlock, elifCondBlock);
                    var _a = _this.makeCFG('elif body', elif.code, context), elifEntry = _a[0], elifExit = _a[1];
                    _this.link(elifCondBlock, elifEntry);
                    _this.link(elifExit, joinBlock);
                    lastCondBlock = elifCondBlock;
                });
            }
            if (statement.else) {
                var elseStmt = statement.else;
                if (elseStmt.code && elseStmt.code.length) {
                    // XXX: 'Else' isn't *really* a condition, though we're treating it like it is
                    // so we can mark a dependence between the body of the else and its header.
                    var elseCondBlock = this.makeBlock('else cond', [elseStmt]);
                    this.link(lastCondBlock, elseCondBlock);
                    var _b = this.makeCFG('else body', elseStmt.code, context), elseEntry = _b[0], elseExit = _b[1];
                    this.link(elseCondBlock, elseEntry);
                    this.link(elseExit, joinBlock);
                    lastCondBlock = elseCondBlock;
                }
            }
            this.link(lastCondBlock, joinBlock);
            return joinBlock;
        };
        ControlFlowGraph.prototype.handleWhile = function (statement, last, context) {
            var loopHeadBlock = this.makeBlock('while loop head', [statement.cond]);
            this.link(last, loopHeadBlock);
            var afterLoop = this.makeBlock('while loop join');
            this.loopVariables.push([statement.cond]);
            var _a = this.makeCFG('while body', statement.code, context.forLoop(loopHeadBlock, afterLoop)), bodyEntry = _a[0], bodyExit = _a[1];
            this.loopVariables.pop();
            this.link(loopHeadBlock, bodyEntry);
            this.link(bodyExit, loopHeadBlock); // back edge
            this.link(loopHeadBlock, afterLoop);
            return afterLoop;
        };
        ControlFlowGraph.prototype.handleFor = function (statement, last, context) {
            var loopHeadBlock = this.makeBlock('for loop head', 
            // synthesize a statement to simulate using the iterator
            [{ type: ast.ASSIGN, op: undefined, sources: statement.iter, targets: statement.target, location: statement.iter[0].location }]);
            this.link(last, loopHeadBlock);
            var afterLoop = this.makeBlock('for loop join');
            this.loopVariables.push(statement.target);
            var _a = this.makeCFG('for body', statement.code, context.forLoop(loopHeadBlock, afterLoop)), bodyEntry = _a[0], bodyExit = _a[1];
            this.loopVariables.pop();
            this.link(loopHeadBlock, bodyEntry);
            this.link(bodyExit, loopHeadBlock); // back edge
            this.link(loopHeadBlock, afterLoop);
            return afterLoop;
        };
        ControlFlowGraph.prototype.handleWith = function (statement, last, context) {
            var assignments = statement.items.map(function (_a) {
                var w = _a.with, a = _a.as;
                return ({ type: ast.ASSIGN, targets: [a], sources: [w], location: w.location });
            });
            var resourceBlock = this.makeBlock('with', assignments);
            this.link(last, resourceBlock);
            var _a = this.makeCFG('with body', statement.code, context), bodyEntry = _a[0], bodyExit = _a[1];
            this.link(resourceBlock, bodyEntry);
            return bodyExit;
        };
        ControlFlowGraph.prototype.handleTry = function (statement, last, context) {
            var _this = this;
            var afterTry = this.makeBlock('try join');
            var exnContext = context;
            var handlerExits = [];
            if (statement.excepts) {
                var handlerHead_1 = this.makeBlock('handlers');
                var handlerCfgs = statement.excepts.map(function (handler) { return _this.makeCFG('handler body', handler.code, context); });
                handlerCfgs.forEach(function (_a) {
                    var exceptEntry = _a[0], _ = _a[1];
                    return _this.link(handlerHead_1, exceptEntry);
                });
                exnContext = context.forExcepts(handlerHead_1);
                handlerExits = handlerCfgs.map(function (_a) {
                    var _ = _a[0], exceptExit = _a[1];
                    return exceptExit;
                });
            }
            var _a = this.makeCFG('try body', statement.code, exnContext), bodyEntry = _a[0], bodyExit = _a[1];
            this.link(last, bodyEntry);
            var normalExit = bodyExit;
            if (statement.else) {
                var _b = this.makeCFG('try else body', statement.else, context), elseEntry = _b[0], elseExit = _b[1];
                this.link(normalExit, elseEntry);
                normalExit = elseExit;
            }
            if (statement.finally) {
                var _c = this.makeCFG('finally body', statement.finally, context), finallyEntry_1 = _c[0], finallyExit = _c[1];
                this.link(normalExit, finallyEntry_1);
                this.link(finallyExit, afterTry);
                handlerExits.forEach(function (handlerExit) { return _this.link(handlerExit, finallyEntry_1); });
            }
            else {
                handlerExits.forEach(function (handlerExit) { return _this.link(handlerExit, afterTry); });
                this.link(normalExit, afterTry);
            }
            return afterTry;
        };
        ControlFlowGraph.prototype.makeCFG = function (hint, statements, context) {
            var _this = this;
            var entry = this.makeBlock(hint);
            var last = entry;
            statements.forEach(function (statement) {
                switch (statement.type) {
                    case ast.DEF:
                        break;
                    case ast.IF:
                        last = _this.handleIf(statement, last, context);
                        break;
                    case ast.WHILE:
                        last = _this.handleWhile(statement, last, context);
                        break;
                    case ast.FOR:
                        last = _this.handleFor(statement, last, context);
                        break;
                    case ast.WITH:
                        last = _this.handleWith(statement, last, context);
                        break;
                    case ast.TRY:
                        last = _this.handleTry(statement, last, context);
                        break;
                    case ast.RAISE:
                        _this.link(last, context.exceptionBlock);
                        return;
                    case ast.BREAK:
                        _this.link(last, context.loopExit);
                        return;
                    case ast.CONTINUE:
                        _this.link(last, context.loopHead);
                        return;
                    default:
                        last.statements.push(statement);
                        break;
                }
            });
            return [entry, last];
        };
        /**
         * Based on the algorithm in "Engineering a Compiler", 2nd ed., Cooper and Torczon:
         * - p479: computing dominance
         * - p498-500: dominator trees and frontiers
         * - p544: postdominance and reverse dominance frontier
         */
        ControlFlowGraph.prototype.getControlDependencies = function () {
            var dependencies = [];
            var blocks = this.blocks;
            this.postdominators = this.findPostdominators(blocks);
            this.immediatePostdominators = this.getImmediatePostdominators(this.postdominators.items);
            this.reverseDominanceFrontiers = this.buildReverseDominanceFrontiers(blocks);
            // Mine the dependencies.
            for (var _i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
                var block = blocks_1[_i];
                if (this.reverseDominanceFrontiers.hasOwnProperty(block.id)) {
                    var frontier = this.reverseDominanceFrontiers[block.id];
                    for (var _a = 0, _b = frontier.items; _a < _b.length; _a++) {
                        var frontierBlock = _b[_a];
                        for (var _c = 0, _d = frontierBlock.statements; _c < _d.length; _c++) {
                            var controlStmt = _d[_c];
                            for (var _e = 0, _f = block.statements; _e < _f.length; _e++) {
                                var stmt = _f[_e];
                                dependencies.push({ fromNode: controlStmt, toNode: stmt });
                            }
                        }
                    }
                }
            }
            return dependencies;
        };
        ControlFlowGraph.prototype.postdominatorExists = function (block, postdominator) {
            return this.postdominators.filter(function (p) { return (p.block == block && p.postdominator == postdominator); }).size > 0;
        };
        ControlFlowGraph.prototype.getImmediatePostdominator = function (block) {
            var immediatePostdominators = this.immediatePostdominators.items.filter(function (p) { return p.block == block; });
            return immediatePostdominators[0];
        };
        ControlFlowGraph.prototype.findPostdominators = function (blocks) {
            var _this = this;
            // Initially, every block has every other block as a postdominator, except for the last block.
            var postdominators = {};
            for (var _i = 0, blocks_2 = blocks; _i < blocks_2.length; _i++) {
                var block = blocks_2[_i];
                postdominators[block.id] = new PostdominatorSet();
                for (var _a = 0, blocks_3 = blocks; _a < blocks_3.length; _a++) {
                    var otherBlock = blocks_3[_a];
                    var distance = (block.id == otherBlock.id) ? 0 : Infinity;
                    postdominators[block.id].add(new Postdominator(distance, block, otherBlock));
                }
            }
            var lastBlock = blocks.filter(function (b) { return _this.getSuccessors(b).length == 0; })[0];
            postdominators[lastBlock.id] = new PostdominatorSet(new Postdominator(0, lastBlock, lastBlock));
            var changed = true;
            while (changed == true) {
                changed = false;
                var _loop_2 = function (block) {
                    if (block == lastBlock)
                        return "continue";
                    var oldPostdominators = postdominators[block.id];
                    var successors = this_2.getSuccessors(block);
                    // Merge postdominators that appear in all of a block's successors.
                    var newPostdominators = new (PostdominatorSet.bind.apply(PostdominatorSet, [void 0].concat([].concat.apply([], successors.map(function (s) { return postdominators[s.id].items; })).reduce(function (pCounts, p) {
                        var countIndex = pCounts.findIndex(function (record) {
                            return record.p.postdominator == p.postdominator;
                        });
                        var countRecord;
                        if (countIndex == -1) {
                            countRecord = {
                                p: new Postdominator(p.distance + 1, block, p.postdominator),
                                count: 0
                            };
                            pCounts.push(countRecord);
                        }
                        else {
                            countRecord = pCounts[countIndex];
                            pCounts[countIndex].p.distance = Math.min(pCounts[countIndex].p.distance, p.distance + 1);
                        }
                        countRecord.count++;
                        return pCounts;
                    }, [])
                        .filter(function (p) {
                        return p.count == successors.length;
                    })
                        .map(function (p) {
                        return p.p;
                    }))))();
                    // A block always postdominates itself.
                    newPostdominators.add(new Postdominator(0, block, block));
                    if (!oldPostdominators.equals(newPostdominators)) {
                        postdominators[block.id] = newPostdominators;
                        changed = true;
                    }
                };
                var this_2 = this;
                for (var _b = 0, blocks_4 = blocks; _b < blocks_4.length; _b++) {
                    var block = blocks_4[_b];
                    _loop_2(block);
                }
            }
            var result = new PostdominatorSet();
            for (var blockId in postdominators) {
                if (postdominators.hasOwnProperty(blockId)) {
                    result = result.union(postdominators[blockId]);
                }
            }
            return result;
        };
        ControlFlowGraph.prototype.getImmediatePostdominators = function (postdominators) {
            var postdominatorsByBlock = postdominators
                .filter(function (p) { return p.block != p.postdominator; })
                .reduce(function (dict, postdominator) {
                if (!dict.hasOwnProperty(postdominator.block.id)) {
                    dict[postdominator.block.id] = [];
                }
                dict[postdominator.block.id].push(postdominator);
                return dict;
            }, {});
            var immediatePostdominators = [];
            for (var blockId in postdominatorsByBlock) {
                if (postdominatorsByBlock.hasOwnProperty(blockId)) {
                    immediatePostdominators.push(postdominatorsByBlock[blockId].sort(function (a, b) { return a.distance - b.distance; })[0]);
                }
            }
            return new (PostdominatorSet.bind.apply(PostdominatorSet, [void 0].concat(immediatePostdominators)))();
        };
        ControlFlowGraph.prototype.buildReverseDominanceFrontiers = function (blocks) {
            var frontiers = {};
            var _loop_3 = function (block) {
                var successors = this_3.getSuccessors(block);
                if (successors.length > 1) {
                    var workQueue_1 = successors;
                    var scheduled_1 = [];
                    var blockImmediatePostdominator = this_3.getImmediatePostdominator(block);
                    while (workQueue_1.length > 0) {
                        var item = workQueue_1.pop();
                        // A branch's successor might be a join point. These aren't dependencies.
                        if (this_3.postdominatorExists(block, item))
                            continue;
                        if (!frontiers.hasOwnProperty(item.id)) {
                            frontiers[item.id] = new BlockSet();
                        }
                        var frontier = frontiers[item.id];
                        frontier.add(block);
                        var immediatePostdominator = this_3.getImmediatePostdominator(item);
                        if (immediatePostdominator.postdominator != blockImmediatePostdominator.postdominator) {
                            this_3.getSuccessors(item).forEach(function (b) {
                                if (scheduled_1.indexOf(b) == -1) {
                                    scheduled_1.push(b);
                                    workQueue_1.push(b);
                                }
                            });
                        }
                    }
                }
            };
            var this_3 = this;
            for (var _i = 0, blocks_5 = blocks; _i < blocks_5.length; _i++) {
                var block = blocks_5[_i];
                _loop_3(block);
            }
            return frontiers;
        };
        return ControlFlowGraph;
    }());
    exports.ControlFlowGraph = ControlFlowGraph;
    /**
     * A block and another block that postdominates it. Distance is the length of the longest path
     * from the block to its postdominator.
     */
    var Postdominator = /** @class */ (function () {
        function Postdominator(distance, block, postdominator) {
            this.distance = distance;
            this.block = block;
            this.postdominator = postdominator;
        }
        return Postdominator;
    }());
    /**
     * A set of postdominators
     */
    var PostdominatorSet = /** @class */ (function (_super) {
        __extends(PostdominatorSet, _super);
        function PostdominatorSet() {
            var items = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                items[_i] = arguments[_i];
            }
            return _super.apply(this, [function (p) { return p.block.id + ',' + p.postdominator.id; }].concat(items)) || this;
        }
        return PostdominatorSet;
    }(Set_1.Set));
});
