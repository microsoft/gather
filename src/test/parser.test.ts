// import * as python3 from '../parsers/python/python3';
import { parse } from '../parsers/python/python_parser';
import { expect } from 'chai';

describe('python parser', () => {

    // The next two tests were because the lexer was confused about how to handle dots. It
    // couldn't read a dot followed by digits as a floating point number.
    it('can parse floats that have no digits before the dot', () => {
        parse('a = .2\n');
    });

    it('can also parse calls on objects', () => {
        parse('obj.prop\n');
    });

    it('parses a dictionary with a `comp_for`', () => {
        let node = parse('{k: v for (k, v) in d.items()}\n').code;
        expect(node.entries.length).to.equal(1);
        expect(node.comp_for).not.to.be.undefined;
    });

    it('can parse line continuations', () => {
        parse([
            'a = b\\',
            '.func(1, 2)\\',
            '.func(3, 4)',
            ''
        ].join('\n'));
    })

});