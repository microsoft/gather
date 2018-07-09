import { getDifferences } from "../EditDistance";
import { expect } from "chai";


describe('diff tests', () => {

    function same<T>(x: T) { return { kind: 'same', source: x, target: x }; }
    function same2<T>(x: T, y: T) { return { kind: 'same', source: x, target: y }; }
    function sub<T>(x: T, y: T) { return { kind: 'substitution', source: x, target: y }; }
    function ins<T>(x: T) { return { kind: 'insertion', target: x }; }
    function del<T>(x: T) { return { kind: 'deletion', source: x }; }

    describe('string diff tests', () => {

        function seq(s: string): string[] { return s.split(''); }

        it('should handle no difference', () => {
            const result = getDifferences(seq("hello"), seq("hello"));
            expect(result).to.deep.equal([same('h'), same('e'), same('l'), same('l'), same('o')]);
        });
        it('should handle end difference', () => {
            const result = getDifferences(seq("coal"), seq("coat"));
            expect(result).to.deep.equal([same('c'), same('o'), same('a'), sub('l', 't')]);
        });
        it('should handle empty difference', () => {
            const result = getDifferences([], []);
            expect(result).to.be.an('array').that.is.empty;
        });
        it('should handle deletion', () => {
            const result = getDifferences(seq("x"), []);
            expect(result).to.deep.equal([del('x')]);
        });
        it('should handle insertion', () => {
            const result = getDifferences([], seq("x"));
            expect(result).to.deep.equal([ins('x')]);
        });
        it('should handle initial insertion', () => {
            const result = getDifferences(seq("bc"), seq("abc"));
            expect(result).to.deep.equal([ins('a'), same('b'), same('c')]);
        });
        it('should handle internal insertion and deletion', () => {
            const result = getDifferences(seq("qxyz"), seq("qabxy"));
            expect(result).to.deep.equal([same('q'), ins('a'), ins('b'), same('x'), same('y'), del('z')]);
        });
        it('should handle head/tail insertion and deletion', () => {
            const result = getDifferences(seq("xyz"), seq("abxy"));
            expect(result).to.deep.equal([ins('a'), ins('b'), same('x'), same('y'), del('z')]);
        });
    })

    describe('number diff tests', () => {

        it('should handle initial deletions', () => {
            const result = getDifferences([0, 0, 1, 2, 3], [1, 2, 3]);
            expect(result).to.deep.equal([del(0), del(0), same(1), same(2), same(3)]);
        });
        it('should handle user-defined same function', () => {
            const result = getDifferences([0, 0, 1, 2, 3], [3, 6, 2], (i, j) => i % 2 === j % 2);
            expect(result).to.deep.equal([del(0), del(0), same2(1, 3), same2(2, 6), sub(3, 2)]);
        });

    });
});
