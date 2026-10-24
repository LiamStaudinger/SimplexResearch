import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fraction, simplex } from './simplex.js';

// Turn a result's Fractions into strings like "5/2" so they're easy to compare
function show(result) {
    if (result.status !== 'optimal') return result;
    return { status: result.status, p: result.p.toString(), values: result.values.map(String) };
}

test('Fraction arithmetic is exact and kept in lowest terms', () => {
    const a = new Fraction(1, 3);
    const b = new Fraction(1, 6);
    assert.equal(a.add(b).toString(), '1/2');
    assert.equal(a.sub(b).toString(), '1/6');
    assert.equal(a.mul(b).toString(), '1/18');
    assert.equal(a.div(b).toString(), '2');
    assert.equal(new Fraction(4, -6).toString(), '-2/3');
    assert.equal(Fraction.from(0.1).add(Fraction.from(0.2)).toString(), '3/10');
    assert.ok(new Fraction(-1, 2).lt(new Fraction(1, 3)));
});

test('maximize 30x + 40y', () => {
    // 2x + y <= 10, x + y <= 7, x + 2y <= 12  ->  x = 2, y = 5, p = 260
    assert.deepEqual(show(simplex([30, 40], [[2, 1, 10], [1, 1, 7], [1, 2, 12]])),
        { status: 'optimal', p: '260', values: ['2', '5'] });
});

test('example from book', () => {
    // CLRS: maximize 3x1 + x2 + 2x3  ->  x1 = 8, x2 = 4, x3 = 0, p = 28
    assert.deepEqual(show(simplex([3, 1, 2], [[1, 1, 3, 30], [2, 2, 5, 24], [4, 1, 2, 36]])),
        { status: 'optimal', p: '28', values: ['8', '4', '0'] });
});

test('infeasible: x <= 1 and x >= 3', () => {
    assert.deepEqual(simplex([1], [[1, 1], [-1, -3]]), { status: 'infeasible' });
});

test('origin not feasible, but the problem is', () => {
    // x + y <= 4, x + 3y >= 6  ->  x = 0, y = 4, p = 12
    assert.deepEqual(show(simplex([2, 3], [[1, 1, 4], [-1, -3, -6]])),
        { status: 'optimal', p: '12', values: ['0', '4'] });
});

test('unbounded: maximize x with only x - y <= 1', () => {
    assert.deepEqual(simplex([1, 0], [[1, -1, 1]]), { status: 'unbounded' });
});

test('fractional answer is kept exact', () => {
    // maximize x, 2x <= 5  ->  x = 5/2
    assert.deepEqual(show(simplex([1], [[2, 5]])), { status: 'optimal', p: '5/2', values: ['5/2'] });
});

test('identical columns: only one of y and z gets the row', () => {
    // maximize x + 4y + 4z, 4x + 5y + 5z <= 10  ->  p = 8 at (0, 2, 0)
    assert.deepEqual(show(simplex([1, 4, 4], [[4, 5, 5, 10]])),
        { status: 'optimal', p: '8', values: ['0', '2', '0'] });
});

test('equality written as two constraints: x <= 2 and x >= 2', () => {
    // x0 ends up basic at value 0 and has to be pivoted out
    assert.deepEqual(show(simplex([1], [[1, 2], [-1, -2]])), { status: 'optimal', p: '2', values: ['2'] });
});
