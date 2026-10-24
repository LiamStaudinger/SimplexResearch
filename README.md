# Simplex

There are two versions of the same algorithm:

- `simplex.js`: the main version. It has its own BigInt-based `Fraction` class and returns
  a result object.
- `simplex.py`: the original Python version. It uses `fractions.Fraction` and prints its
  results.

## Problem format

The solver maximizes `toMax · x` subject to `constraints`, with every variable `x ≥ 0`.

- `toMax` is the list of objective coefficients.
- Each constraint is a row `[coeffs..., rhs]` and means `coeffs · x ≤ rhs`.
- To write a `≥` constraint, negate the whole row. For example, `x + 3y ≥ 6` becomes `[-1, -3, -6]`.
- To write an equality, use two rows: one for `≤` and one for `≥`.

For example, to maximize `p = 30x + 40y` subject to:

```
2x +  y ≤ 10
 x +  y ≤ 7
 x + 2y ≤ 12
```

```js
import { simplex } from './simplex.js';

const result = simplex([30, 40], [[2, 1, 10], [1, 1, 7], [1, 2, 12]]);
// { status: 'optimal', p: Fraction(260), values: [Fraction(2), Fraction(5)] }

result.p.toString();            // '260'
result.values.map(String);      // ['2', '5']
```

## Results (JS)

`simplex` returns one of these:

| Result | Meaning |
| --- | --- |
| `{ status: 'optimal', p, values }` | `p` is the best objective value and `values` holds the variable values, all as `Fraction`s |
| `{ status: 'infeasible' }` | No point satisfies all the constraints |
| `{ status: 'unbounded' }` | `p` can be increased forever |

Answers stay exact. For example, maximizing `x` with `2x ≤ 5` gives `p = 5/2`.
Use `.toString()` to get `'5/2'` or `.toNumber()` to get `2.5`.

## Running

The JS version needs a Node release with built-in `node:test` (Node 18 or newer).

```sh
npm test            # runs simplex.test.js
python3 simplex.py  # runs the Python examples and prints the results
```

The tests cover these cases: Fraction arithmetic, the basic example above, the CLRS book
example, an infeasible problem, a problem where the origin isn't feasible but the problem
is, an unbounded problem, a fractional answer, identical columns, and an equality constraint.

## Limitations
- Only maximization is supported right now. Though, to minimize `c · x`, we could just maximize `-c · x` and negate the
  resulting `p`.
