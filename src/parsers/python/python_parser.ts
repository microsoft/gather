export type ISyntaxNode =
    | IModule
    | IImport
    | IFrom
    | IDecorator
    | IDecorate
    | IDef
    | IAssignment
    | IReturn
    | IYield
    | IRaise
    | IContinue
    | IBreak
    | IGlobal
    | INonlocal
    | IIf
    | IWhile
    | IFor
    | ITry
    | IWith
    | IIfExpr
    | ILambda
    | IUnaryOperator
    | IBinaryOperator
    | IStarred
    | ITuple
    | IList
    | ISet
    | IDict
    | IName
    | ILiteral
    | IClass
    ;

export const MODULE = 'module';

export interface IModule {
    type: typeof MODULE;
    code: ISyntaxNode[];
}

export const IMPORT = 'import';

export interface IImport {
    type: typeof IMPORT;
    names: { path: string }[];
}

export const FROM = 'from';

export interface IFrom {
    type: typeof FROM;
    imports: { path: string; name: string }[];
}

export const DECORATOR = 'decorator';

export interface IDecorator {
    type: typeof DECORATOR;
    decorator: string;
    args: ISyntaxNode[];
}

export const DECORATE = 'decorate';

export interface IDecorate {
    type: typeof DECORATE;
    decorators: IDecorator[];
    def: ISyntaxNode;
}

export const DEF = 'def';

export interface IDef {
    type: typeof DEF;
    name: string;
    params: IParam[];
    code: ISyntaxNode[];
}

export interface IParam {
    name: string;
    anno: ISyntaxNode;
}

export const ASSIGN = 'assign';

export interface IAssignment {
    type: typeof ASSIGN;
    targets: ISyntaxNode[];
    sources: ISyntaxNode[];
}

export const RETURN = 'return';

export interface IReturn {
    type: typeof RETURN;
    value: ISyntaxNode;
}

export const YIELD = 'yield';

export interface IYield {
    type: typeof YIELD;
    value: ISyntaxNode;
}

export const RAISE = 'raise';

export interface IRaise {
    type: typeof RAISE;
    err: ISyntaxNode;
}

export const BREAK = 'break';

export interface IBreak {
    type: typeof BREAK;
}

export const CONTINUE = 'continue';

export interface IContinue {
    type: typeof CONTINUE;
}

export const GLOBAL = 'global';

export interface IGlobal {
    type: typeof GLOBAL;
    names: string[];
}

export const NONLOCAL = 'nonlocal';

export interface INonlocal {
    type: typeof NONLOCAL;
    names: string[];
}

export const IF = 'if';

export interface IIf {
    type: typeof IF;
    cond: ISyntaxNode;
    code: ISyntaxNode[];
    elif: { cond: ISyntaxNode, code: ISyntaxNode[] }[];
    else: ISyntaxNode[];
}

export const WHILE = 'while';

export interface IWhile {
    type: typeof WHILE;
    cond: ISyntaxNode;
    code: ISyntaxNode[];
    else: ISyntaxNode[];
}

export const FOR = 'for';

export interface IFor {
    type: typeof FOR;
    target: ISyntaxNode;
    iter: ISyntaxNode;
    code: ISyntaxNode[];
}

export const TRY = 'try';

export interface ITry {
    type: typeof TRY;
    code: ISyntaxNode[];
    excepts: { cond: ISyntaxNode; name: string; code: ISyntaxNode[] }[];
    else: ISyntaxNode[];
    finally: ISyntaxNode[];
}

export const WITH = 'with';

export interface IWith {
    type: typeof WITH;
    items: { with: ISyntaxNode; as: ISyntaxNode }[];
    code: ISyntaxNode[];
}

export const IFEXPR = 'ifexpr';

export interface IIfExpr {
    type: typeof IFEXPR;
    test: ISyntaxNode;
    then: ISyntaxNode;
    else: ISyntaxNode;
}

export const LAMBDA = 'lambda';

export interface ILambda {
    type: typeof LAMBDA;
    args: IParam[];
    code: ISyntaxNode;
}

export const UNOP = 'unop';

export interface IUnaryOperator {
    type: typeof UNOP;
    op: string;
    operand: ISyntaxNode;
}

export const BINOP = 'binop';

export interface IBinaryOperator {
    type: typeof BINOP;
    op: string;
    left: ISyntaxNode;
    right: ISyntaxNode;
}

export const STARRED = 'starred';

export interface IStarred {
    type: typeof STARRED;
    value: ISyntaxNode;
}

export const TUPLE = 'tuple';

export interface ITuple {
    type: typeof TUPLE;
    value: ISyntaxNode[];
}

export const LIST = 'list';

export interface IList {
    type: typeof LIST;
    items: ISyntaxNode[]
}

export const SET = 'set';

export interface ISet {
    type: typeof SET;
    items: ISyntaxNode[]
}

export const DICT = 'dict';

export interface IDict {
    type: typeof DICT;
    pairs: { k: ISyntaxNode; v: ISyntaxNode }[];
}

export const NAME = 'name';

export interface IName {
    type: typeof NAME;
    id: string;
}

export const LITERAL = 'literal';

export interface ILiteral {
    type: typeof LITERAL;
    value: any;
}

export const CLASS = 'class';

export interface IClass {
    type: typeof CLASS;
    name: string;
    extends: ISyntaxNode[];
    code: ISyntaxNode[];
}


function flatten<T>(arrayArrays: T[][]): T[] {
    return [].concat(...arrayArrays);
}

export function walk(node: ISyntaxNode): ISyntaxNode[] {
    let children: ISyntaxNode[] = [];
    switch (node.type) {
        case MODULE:
        case DEF:
        case CLASS:
            children = node.code;
            break;
        case IF:
            children = [node.cond].concat(node.code)
                .concat(node.elif ? flatten(node.elif.map(e => [e.cond].concat(e.code))) : [])
                .concat(node.else || []);
            break;
        case WHILE:
            children = [node.cond].concat(node.code);
            break;
        case WITH:
            children = flatten(node.items.map(r => [r.with, r.as])).concat(node.code);
            break;
        case FOR:
            children = [node.iter, node.target].concat(node.code);
            break;
        case TRY:
            children = node.code
                .concat(flatten(node.excepts.map(e => [e.cond].concat(e.code))))
                .concat(node.else || [])
                .concat(node.finally || [])
            break;
        case DECORATE: children = [node.def]; break;
        case LAMBDA: children = [node.code]; break;
        case IFEXPR: children = [node.test, node.then, node.else]; break;
        case UNOP: children = [node.operand]; break;
        case BINOP: children = [node.left, node.right]; break;
        case STARRED: children = [node.value]; break;
        case SET:
        case LIST: children = node.items; break;
        case TUPLE: children = node.value; break;
        case DICT: children = flatten(node.pairs.map(p => [p.k, p.v])); break;
    }
    return [node].concat(flatten(children.map(node => walk(node))));
}