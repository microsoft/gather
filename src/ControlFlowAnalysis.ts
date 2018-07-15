import * as ast from './parsers/python/python_parser';
import { Set } from './Set';
import { IDataflow } from './DataflowAnalysis';


export class Block {

    constructor(
        public id: number,
        private hint: string,
        public statements: ast.ISyntaxNode[],
        public loopVariables: ast.ISyntaxNode[] = []) {
    }

    public toString(): string {
        return 'BLOCK ' + this.id + ' (' + this.hint + ')\n' +
            this.statements.map(s => '    line ' + s.location.first_line).join('\n');
    }
}


class BlockSet extends Set<Block> {
    constructor(...items: Block[]) {
        super(b => b.id.toString(), ...items);
    }
}


class Context {
    constructor(
        public loopHead: Block,
        public loopExit: Block,
        public exceptionBlock: Block) {
    }
    public forLoop(loopHead: Block, loopExit: Block): Context {
        return new Context(loopHead, loopExit, this.exceptionBlock);
    }
    public forExcepts(exceptionBlock: Block): Context {
        return new Context(this.loopHead, this.loopExit, exceptionBlock);
    }
}


export class ControlFlowGraph {
    private _blocks: Block[] = [];
    private globalId = 0;
    private entry: Block;
    private exit: Block;
    private successors = new Set<[Block, Block]>(([b1, b2]) => b1.id + ',' + b2.id);
    private loopVariables: ast.ISyntaxNode[][] = [];

    constructor(module: ast.IModule) {
        let statements = module.code;
        if (!(statements instanceof Array)) statements = [statements]; 
        [this.entry, this.exit] = this.makeCFG(
            'entry', statements, new Context(null, null, this.makeBlock('exceptional exit')));
    }

    private makeBlock(hint: string, statements: ast.ISyntaxNode[] = []) {
        const b = new Block(this.globalId++, hint, statements);
        if (this.loopVariables.length) {
            b.loopVariables = this.loopVariables[this.loopVariables.length - 1];
        }
        this._blocks.push(b);
        return b;
    }

    public get blocks(): Block[] {
        const visited: Block[] = [];
        const toVisit = new BlockSet(this.entry);
        while (!toVisit.empty) {
            const block = toVisit.take();
            visited.push(block);
            this.successors.items.forEach(([pred, succ]) => {
                if (pred === block && visited.indexOf(succ) < 0) {
                    toVisit.add(succ);
                }
            });
        }
        return visited;
    }

    public getSuccessors(block: Block): Block[] {
        return this.successors.items
            .filter(([p, _]) => p == block)
            .map(([_, s]) => s);
    }

    public getPredecessors(block: Block): Block[] {
        return this.successors.items
            .filter(([_, s]) => s == block)
            .map(([p, _]) => p);
    }

    public print() {
        console.log('CFG', 'ENTRY:', this.entry.id, 'EXIT:', this.exit.id);
        this.blocks.forEach(block => {
            console.log(block.toString());
            if (block === this.exit) {
                console.log('    EXIT');
            } else {
                console.log('    SUCC',
                    this.getSuccessors(block).map(b => b.id.toString()).join(','));
            }
        });
    }

    private link(...blocks: Block[]): void {
        for (let i = 1; i < blocks.length; i++)
            this.successors.add([blocks[i - 1], blocks[i]]);
    }

    private handleIf(statement: ast.IIf, last: Block, context: Context): Block {
        const ifCondBlock = this.makeBlock('if cond', [statement.cond]);
        const [bodyEntry, bodyExit] = this.makeCFG('if body', statement.code, context);
        this.link(last, ifCondBlock, bodyEntry);
        const joinBlock = this.makeBlock('conditional join');
        this.link(bodyExit, joinBlock);
        let lastCondBlock: Block = ifCondBlock;
        if (statement.elif) {
            statement.elif.forEach(elif => {
                const elifCondBlock = this.makeBlock('elif cond', [elif.cond]);
                this.link(lastCondBlock, elifCondBlock);
                const [elifEntry, elifExit] = this.makeCFG('elif body', elif.code, context);
                this.link(elifCondBlock, elifEntry);
                this.link(elifExit, joinBlock);
                lastCondBlock = elifCondBlock;
            });
        }
        if (statement.else && statement.else.length) {
            const [elseEntry, elseExit] = this.makeCFG('else body', statement.else, context);
            this.link(lastCondBlock, elseEntry);
            this.link(elseExit, joinBlock);
        } else {
            this.link(lastCondBlock, joinBlock);
        }
        return joinBlock;
    }

    private handleWhile(statement: ast.IWhile, last: Block, context: Context): Block {
        const loopHeadBlock = this.makeBlock('while loop head', [statement.cond]);
        this.link(last, loopHeadBlock);
        const afterLoop = this.makeBlock('while loop join');
        this.loopVariables.push([statement.cond]);
        const [bodyEntry, bodyExit] = this.makeCFG('while body', statement.code, context.forLoop(loopHeadBlock, afterLoop));
        this.loopVariables.pop();
        this.link(loopHeadBlock, bodyEntry);
        this.link(bodyExit, loopHeadBlock); // back edge
        this.link(loopHeadBlock, afterLoop);
        return afterLoop;
    }

    private handleFor(statement: ast.IFor, last: Block, context: Context): Block {
        const loopHeadBlock = this.makeBlock('for loop head',
            // synthesize a statement to simulate using the iterator
            [{ type: ast.ASSIGN, op: undefined, sources: statement.iter, targets: statement.target, location: statement.iter[0].location }]);
        this.link(last, loopHeadBlock);
        const afterLoop = this.makeBlock('for loop join');
        this.loopVariables.push(statement.target);
        const [bodyEntry, bodyExit] = this.makeCFG('while body', statement.code, context.forLoop(loopHeadBlock, afterLoop));
        this.loopVariables.pop();
        this.link(loopHeadBlock, bodyEntry);
        this.link(bodyExit, loopHeadBlock); // back edge
        this.link(loopHeadBlock, afterLoop);
        return afterLoop;
    }

    private handleWith(statement: ast.IWith, last: Block, context: Context): Block {
        const assignments = statement.items.map(
            ({ with: w, as: a }) => (<ast.IAssignment>{ type: ast.ASSIGN, targets: [a], sources: [w], location: w.location }))
        const resourceBlock = this.makeBlock('with', assignments);
        this.link(last, resourceBlock);
        const [bodyEntry, bodyExit] = this.makeCFG('with body', statement.code, context);
        this.link(resourceBlock, bodyEntry);
        return bodyExit;
    }

    private handleTry(statement: ast.ITry, last: Block, context: Context): Block {
        const afterTry = this.makeBlock('try join');
        let exnContext = context;
        let handlerExits: Block[] = [];
        if (statement.excepts) {
            const handlerHead = this.makeBlock('handlers');
            const handlerCfgs = statement.excepts.map(
                handler => this.makeCFG('handler body', handler.code, context));
            handlerCfgs.forEach(([exceptEntry, _]) => this.link(handlerHead, exceptEntry));
            exnContext = context.forExcepts(handlerHead);
            handlerExits = handlerCfgs.map(([_, exceptExit]) => exceptExit);
        }
        const [bodyEntry, bodyExit] = this.makeCFG('try body', statement.code, exnContext);
        this.link(last, bodyEntry);
        let normalExit = bodyExit;
        if (statement.else) {
            const [elseEntry, elseExit] = this.makeCFG('try else body', statement.else, context);
            this.link(normalExit, elseEntry);
            normalExit = elseExit;
        }
        if (statement.finally) {
            const [finallyEntry, finallyExit] = this.makeCFG('finally body', statement.finally, context);
            this.link(normalExit, finallyEntry);
            this.link(finallyExit, afterTry);
            handlerExits.forEach(handlerExit => this.link(handlerExit, finallyEntry));
        } else {
            handlerExits.forEach(handlerExit => this.link(handlerExit, afterTry));
            this.link(normalExit, afterTry);
        }
        return afterTry;
    }

    private makeCFG(hint: string, statements: ast.ISyntaxNode[], context: Context): [Block, Block] {
        const entry = this.makeBlock(hint);
        let last = entry;
        statements.forEach(statement => {
            switch (statement.type) {
                case ast.DEF:
                    break;
                case ast.IF:
                    last = this.handleIf(statement, last, context);
                    break;
                case ast.WHILE:
                    last = this.handleWhile(statement, last, context);
                    break;
                case ast.FOR:
                    last = this.handleFor(statement, last, context);
                    break;
                case ast.WITH:
                    last = this.handleWith(statement, last, context);
                    break;
                case ast.TRY:
                    last = this.handleTry(statement, last, context);
                    break;
                case ast.RAISE:
                    this.link(last, context.exceptionBlock);
                    return;
                case ast.BREAK:
                    this.link(last, context.loopExit);
                    return;
                case ast.CONTINUE:
                    this.link(last, context.loopHead);
                    return;
                default:
                    last.statements.push(statement);
                    break;
            }
        });
        return [entry, last];
    }

    /**
     * Based on the algorithm in "Engineering a Compiler", 2nd ed., Cooper and Torczon:
     * - p479: computing dominance
     * - p498-500: dominator trees and frontiers
     * - p544: postdominance and reverse dominance frontier
     */
    public getControlDependencies(): IDataflow[] {
        
        let dependencies = [];
        let blocks = this.blocks;
        
        // Compute data structures for control flow analysis.
        this.postdominators = this.findPostdominators(blocks);
        this.immediatePostdominators = this.getImmediatePostdominators(this.postdominators.items);
        this.reverseDominanceFrontiers = this.buildReverseDominanceFrontiers(blocks);

        // Mine the dependencies.
        for (let block of blocks) {
            if (this.reverseDominanceFrontiers.hasOwnProperty(block.id)) {
                let frontier = this.reverseDominanceFrontiers[block.id];
                for (let frontierBlock of frontier.items) {
                    for (let controlStmt of frontierBlock.statements) {
                        for (let stmt of block.statements) {
                            dependencies.push({ fromNode: controlStmt, toNode: stmt });
                        }
                    }
                }
            }
        }
        return dependencies;
    }

    private postdominators = new PostdominatorSet();
    private immediatePostdominators: PostdominatorSet;
    private reverseDominanceFrontiers: { [blockId: string]: BlockSet };

    private getImmediatePostdominator(block: Block): Postdominator {
        let immediatePostdominators = this.immediatePostdominators.items.filter((p) => p.block == block);
        return immediatePostdominators[0]
    }

    private findPostdominators(blocks: Block[]) {

        // Initially, every block has itself and the end of the program (null) as a postdominator.
        let postdominators = new PostdominatorSet();
        for (let block of blocks) {
            postdominators.add(new Postdominator(0, block, block));
            postdominators.add(new Postdominator(Infinity, block, new Block(-1, "", [])));
        }

        let changed = true;
        while (changed == true) {
            let oldPostdominatorsSize = postdominators.size;
            for (let block of blocks) {
                // Merge postdominators that appear in all of a block's successors.
                let successors = this.getSuccessors(block);
                postdominators = postdominators.union(
                    new PostdominatorSet(...[].concat(
                        ...successors.map((s) => {
                            return postdominators.items
                            .filter((p) => p.block == s)
                        }))
                        .reduce((pCounts: { p: Postdominator, count: number }[], p) => {
                            let countIndex = pCounts.findIndex(record => {
                                return record.p.postdominator == p.postdominator;
                            });
                            let countRecord;
                            if (countIndex == -1) {
                                countRecord = {
                                    p: new Postdominator(p.distance + 1, block, p.postdominator),
                                    count: 0
                                };
                                pCounts.push(countRecord);
                            } else {
                                countRecord = pCounts[countIndex];
                                // Update postdominator with longest distance.
                                pCounts[countIndex].p.distance = Math.max(pCounts[countIndex].p.distance, p.distance + 1);
                            }
                            countRecord.count++;
                            return pCounts;
                        }, [])
                        .filter((p: { p: Postdominator, count: number }) => {
                            return p.count == successors.length;
                        })
                        .map((p: { p: Postdominator, count: number }) => {
                            return p.p
                        })));
            }
            changed = (postdominators.size > oldPostdominatorsSize);
        }
        return postdominators;
    }

    private getImmediatePostdominators(postdominators: Postdominator[]) {
        let postdominatorsByBlock = postdominators
            .filter((p) => p.block != p.postdominator)
            .reduce((dict: { [id: number]: Postdominator[] }, postdominator) => {
                if (!dict.hasOwnProperty(postdominator.block.id)) {
                    dict[postdominator.block.id] = [];
                }
                dict[postdominator.block.id].push(postdominator);
                return dict;
            }, {});
        let immediatePostdominators = [];
        for (let blockId in postdominatorsByBlock) {
            if (postdominatorsByBlock.hasOwnProperty(blockId)) {
                immediatePostdominators.push(
                    postdominatorsByBlock[blockId].sort(
                        (a, b) => { return a.distance - b.distance })[0]);
            }
        }
        return new PostdominatorSet(...immediatePostdominators);
    }

    private buildReverseDominanceFrontiers(blocks: Block[]) {
        let frontiers: { [blockId: string]: BlockSet } = {};
        for (let block of blocks) {
            let successors = this.getSuccessors(block);
            if (successors.length > 1) {
                let workQueue = successors;
                let blockImmediatePostdominator = this.getImmediatePostdominator(block);
                while (workQueue.length > 0) {
                    let item = workQueue.pop();
                    if (!frontiers.hasOwnProperty(item.id)) {
                        frontiers[item.id] = new BlockSet();
                    }
                    let frontier = frontiers[item.id];
                    frontier.add(block);
                    let immediatePostdominator = this.getImmediatePostdominator(item);
                    if (immediatePostdominator.postdominator != blockImmediatePostdominator.postdominator) {
                        this.getSuccessors(item).forEach((b) => { workQueue.push(b) });
                    }
                }
            }
        }
        return frontiers;
    }
}

/**
 * A block and another block that postdominates it. Distance is the length of the longest path
 * from the block to its postdominator.
 */
class Postdominator {
    constructor(distance: number, block: Block, postdominator: Block) {
        this.distance = distance;
        this.block = block;
        this.postdominator = postdominator;
    }
    distance: number;
    block: Block;
    postdominator: Block;
}

/**
 * A set of postdominators
 */
class PostdominatorSet extends Set<Postdominator> {
    constructor(...items: Postdominator[]) {
        super((p) => p.block.id + ',' + p.postdominator.id, ...items);
    }
}