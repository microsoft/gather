import * as python3 from '../parsers/python/python3';

describe('python parser', () => {

    // The next two tests were because the lexer was confused about how to handle dots. It
    // couldn't read a dot followed by digits as a floating point number.
    it('can parse floats that have no digits before the dot', () => {
        python3.parse('a = .2\n');
    });

    it('can also parse calls on objects', () => {
        python3.parse('obj.prop\n');
    });

});