define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MODULE = 'module';
    exports.IMPORT = 'import';
    exports.FROM = 'from';
    exports.DECORATOR = 'decorator';
    exports.DECORATE = 'decorate';
    exports.DEF = 'def';
    exports.ASSIGN = 'assign';
    exports.ASSERT = 'assert';
    exports.RETURN = 'return';
    exports.YIELD = 'yield';
    exports.RAISE = 'raise';
    exports.BREAK = 'break';
    exports.CONTINUE = 'continue';
    exports.GLOBAL = 'global';
    exports.NONLOCAL = 'nonlocal';
    exports.IF = 'if';
    exports.WHILE = 'while';
    exports.ELSE = 'else';
    exports.FOR = 'for';
    exports.TRY = 'try';
    exports.WITH = 'with';
    exports.CALL = 'call';
    exports.ARG = 'arg';
    exports.INDEX = 'index';
    exports.SLICE = 'slice';
    exports.DOT = 'dot';
    exports.IFEXPR = 'ifexpr';
    exports.LAMBDA = 'lambda';
    exports.UNOP = 'unop';
    exports.BINOP = 'binop';
    exports.STARRED = 'starred';
    exports.TUPLE = 'tuple';
    exports.LIST = 'list';
    exports.SET = 'set';
    exports.DICT = 'dict';
    exports.NAME = 'name';
    exports.LITERAL = 'literal';
    exports.CLASS = 'class';
    function flatten(arrayArrays) {
        return [].concat.apply([], arrayArrays);
    }
    ;
    /**
     * Preorder tree traversal with optional listener.
     */
    function walk(node, walkListener) {
        return walkRecursive(node, [], walkListener);
    }
    exports.walk = walk;
    /**
     * Recursive implementation of pre-order tree walk.
     */
    function walkRecursive(node, ancestors, walkListener) {
        ancestors.push(node);
        if (walkListener && walkListener.onEnterNode) {
            walkListener.onEnterNode(node, node.type, ancestors);
        }
        var children = [];
        switch (node.type) {
            case exports.MODULE:
            case exports.DEF:
            case exports.CLASS:
                children = node.code;
                break;
            case exports.IF:
                children = [node.cond].concat(node.code)
                    .concat(node.elif ? flatten(node.elif.map(function (e) { return [e.cond].concat(e.code); })) : [])
                    .concat(node.else ? [node.else] : []);
                break;
            case exports.ELSE:
                children = node.code;
                break;
            case exports.WHILE:
                children = [node.cond].concat(node.code);
                break;
            case exports.WITH:
                children = flatten(node.items.map(function (r) { return [r.with, r.as]; })).concat(node.code);
                break;
            case exports.FOR:
                children = node.iter.concat(node.target).concat(node.code);
                break;
            case exports.TRY:
                children = node.code
                    .concat(flatten(node.excepts.map(function (e) { return [e.cond].concat(e.code); })))
                    .concat(node.else || [])
                    .concat(node.finally || []);
                break;
            case exports.DECORATE:
                children = [node.def];
                break;
            case exports.LAMBDA:
                children = [node.code];
                break;
            case exports.CALL:
                children = [node.func].concat(node.args.map(function (a) { return a.actual; }));
                break;
            case exports.IFEXPR:
                children = [node.test, node.then, node.else];
                break;
            case exports.UNOP:
                children = [node.operand];
                break;
            case exports.BINOP:
                children = [node.left, node.right];
                break;
            case exports.STARRED:
                children = [node.value];
                break;
            case exports.SET:
            case exports.LIST:
                children = node.items;
                break;
            case exports.TUPLE:
                children = node.items;
                break;
            case exports.DICT:
                children = flatten(node.pairs.map(function (p) { return [p.k, p.v]; }));
                break;
            case exports.ASSIGN:
                children = node.sources.concat(node.targets);
                break;
            case exports.ASSERT:
                children = [node.cond].concat([node.err] || []);
                break;
            case exports.DOT:
                children = [node.value, node.name];
                break;
            case exports.INDEX:
                children = [node.value].concat(node.args);
                break;
            case exports.SLICE:
                children = (node.start ? [node.start] : [])
                    .concat(node.stop ? [node.stop] : [])
                    .concat(node.step ? [node.step] : []);
                break;
        }
        var nodes = [node];
        var subtreeNodes = flatten(children.map(function (node) { return walkRecursive(node, ancestors, walkListener); }));
        nodes = nodes.concat(subtreeNodes);
        if (walkListener && walkListener.onExitNode) {
            walkListener.onExitNode(node, node.type, ancestors);
        }
        ancestors.pop();
        return nodes;
    }
});
