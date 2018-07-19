import { expect } from "chai";
import { MagicsRewriter, TimeLineMagicRewriter, MatchPosition, PylabLineMagicRewriter } from "../slicing/MagicsRewriter";

describe('MagicsRewriter', () => {

    let magicsTranslator: MagicsRewriter;
    beforeEach(() => {
        magicsTranslator = new MagicsRewriter();
    });

    function rewrite(...codeLines: string[]) {
        return magicsTranslator.rewrite(codeLines.join("\n"));
    }

    it('comments out line magics and annotates them with their position', () => {
        let rewritten = rewrite("%some_magic arg1 arg2");
        expect(rewritten).to.equal("#%some_magic arg1 arg2");
    });

    it('rewrites line magics with line continuations', () => {
        let rewritten = rewrite(
            "%some_magic arg1 \\ ",
            "    arg2"
        );
        expect(rewritten).to.equal([
            "#%some_magic arg1 \\ ",
            "#    arg2"
        ].join("\n"));
    });

    it('allows line magics to start after any number of whitespaces', () => {
        let rewritten = rewrite("   %some_magic arg1 arg2");
        expect(rewritten).to.equal("#   %some_magic arg1 arg2");
    });

    it('doesn\'t detect a % mid-line as a magic', () => {
        let rewritten = rewrite("print(a) %some_magic");
        expect(rewritten).to.equal("print(a) %some_magic");
    });

    it('by default comments out cell magics', () => {
        let rewritten = rewrite(
            "%%some_cell_magic",
            "line 1",
            "line 2"
        );
        expect(rewritten).to.equal([
            "#%%some_cell_magic",
            "#line 1",
            "#line 2"  
        ].join("\n"));
    });

    it('allows cell magics to start after any number of whitespaces', () => {
        let rewritten = rewrite("   %%some_cell_magic");
        expect(rewritten).to.equal("#   %%some_cell_magic");
    });

    it('does nothing to text that doesn\'t have magics', () => {
        let rewritten = rewrite("print(a)");
        expect(rewritten).to.equal("print(a)");
    });

    it('applies custom rewrite rules and annotations', () => {
        let magicsTranslator = new MagicsRewriter([{
            commandName: "foo",
            rewrite: (_, __, ___) => {
                return {
                    text: "# foo_found",
                    annotations: [ { key: "foo_tag", value: "bar_value" } ]
                };
            }
        }]);
        let rewritten = magicsTranslator.rewrite("%foo arg1 arg2");
        expect(rewritten).to.equal("'''foo_tag: bar_value''' # foo_found") 
    });

    let EXAMPLE_POSITION: MatchPosition = [ {line: 0, col: 0}, {line: 0, col: 10} ];

    describe("TimeLineMagicRewriter", () => {
        it('replaces %time with an equivalent-length string literal', () => {
            let rewrite = new TimeLineMagicRewriter().rewrite("%time print(a)", "", EXAMPLE_POSITION);
            expect(rewrite.text).to.equal("\"   \" print(a)");
        })
    });

    describe("MatplotlibLineMagicRewriter", () => {
        it('adds annotations for its position and defined symbols', () => {
            let rewrite = new PylabLineMagicRewriter().rewrite(
                "%pylab inline", "%pylab inline", EXAMPLE_POSITION
            );
            expect(rewrite.text).to.be.undefined;
            expect(rewrite.annotations).to.deep.equal([
                { key: "position", value: "((0,0),(0,10))" },
                { key: "defs", value: "numpy,matplotlib,pylab,mlab,pyplot,np,plt,display,figsize,getfigs" }
            ])
        });
    });
});