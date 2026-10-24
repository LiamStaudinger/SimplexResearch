// Exact fractions using BigInt, so pivoting doesn't build up rounding errors.
class Fraction {
    constructor(num, den = 1n) {
        num = BigInt(num);
        den = BigInt(den);
        if (den === 0n) throw new RangeError('Fraction with denominator 0');
        // Keep the sign on the numerator and always store in lowest terms,
        // so two equal fractions always have the same num and den
        if (den < 0n) {
            num = -num;
            den = -den;
        }
        const g = gcd(num < 0n ? -num : num, den);
        this.num = num / g;
        this.den = den / g;
    }

    // Turn a number, BigInt or Fraction into a Fraction.
    // Decimals are read from their written form, so 0.1 becomes exactly 1/10.
    static from(x) {
        if (x instanceof Fraction) return x;
        if (typeof x === 'bigint' || Number.isInteger(x)) return new Fraction(x);
        if (typeof x !== 'number' || !Number.isFinite(x)) throw new TypeError(`Can't make a Fraction from ${x}`);

        const [mantissa, exp = '0'] = String(x).split('e');
        const [whole, decimals = ''] = mantissa.split('.');
        const f = new Fraction(BigInt(whole + decimals), 10n ** BigInt(decimals.length));
        const e = Number(exp);
        return e >= 0 ? f.mul(new Fraction(10n ** BigInt(e))) : f.div(new Fraction(10n ** BigInt(-e)));
    }

    add(o) { return new Fraction(this.num * o.den + o.num * this.den, this.den * o.den); }
    sub(o) { return new Fraction(this.num * o.den - o.num * this.den, this.den * o.den); }
    mul(o) { return new Fraction(this.num * o.num, this.den * o.den); }
    div(o) { return new Fraction(this.num * o.den, this.den * o.num); }
    neg() { return new Fraction(-this.num, this.den); }

    // -1 if this < o, 0 if equal, 1 if this > o (denominators are always positive)
    compare(o) {
        const diff = this.num * o.den - o.num * this.den;
        return diff < 0n ? -1 : diff > 0n ? 1 : 0;
    }
    eq(o) { return this.compare(o) === 0; }
    lt(o) { return this.compare(o) < 0; }
    gt(o) { return this.compare(o) > 0; }

    toNumber() { return Number(this.num) / Number(this.den); }
    toString() { return this.den === 1n ? `${this.num}` : `${this.num}/${this.den}`; }
}

function gcd(a, b) {
    while (b !== 0n) [a, b] = [b, a % b];
    return a === 0n ? 1n : a;
}

const ZERO = new Fraction(0);
const ONE = new Fraction(1);


function slackForm(toMax, constraints) {
    toMax = toMax.map(Fraction.from);
    constraints = constraints.map(row => row.map(Fraction.from));
    const numSlack = constraints.length;

    // p = 30x + 40y  ->  -30x - 40y + p = 0
    // Negate the coefficients, slack variables get 0, p gets 1, and the rhs is 0
    const slackToMax = [...toMax.map(c => c.neg()), ...Array(numSlack).fill(ZERO), ONE, ZERO];

    // Each constraint row is [coeffs..., rhs]. Insert one slack variable per row
    // between the coefficients and the rhs: 1 for this row's own slack, 0 for the rest.
    // p doesn't appear in the constraints, so its column is 0.
    const slackConstraints = constraints.map((row, i) => {
        const coeffs = row.slice(0, -1);
        const rhs = row[row.length - 1];
        const slack = Array.from({ length: numSlack }, (_, j) => (j === i ? ONE : ZERO));
        return [...coeffs, ...slack, ZERO, rhs];
    });

    return [slackToMax, slackConstraints];
}

function findPivotCol(slackToMax) {
    let minVal = slackToMax[0];
    let minIndex = 0;
    for (let i = 0; i < slackToMax.length; i++) {
        if (slackToMax[i].lt(minVal)) {
            minVal = slackToMax[i];
            minIndex = i;
        }
    }
    return minIndex;
}

function findPivotVal(pivotCol, slackConstraints) {
    // Ratio test: for each constraint, rhs / element in the pivot column.
    // Skip rows where the element is <= 0 (zero would divide by zero, and a
    // negative element means that constraint never limits the pivot variable).
    let minRatio = null;
    let pivotRow = null;
    slackConstraints.forEach((constraint, i) => {
        const element = constraint[pivotCol];
        if (element.gt(ZERO)) {
            const ratio = constraint[constraint.length - 1].div(element);
            if (minRatio === null || ratio.lt(minRatio)) {
                minRatio = ratio;
                pivotRow = i;
            }
        }
    });

    // pivotRow is null if no row limits the variable, i.e. the problem is unbounded
    if (pivotRow === null) return [null, null];
    return [pivotRow, slackConstraints[pivotRow][pivotCol]];
}

function pivot(slackToMax, slackConstraints, pivotRow, pivotCol, pivotValue) {
    // Step 1: divide the pivot row by the pivot value so the pivot becomes 1
    slackConstraints[pivotRow] = slackConstraints[pivotRow].map(x => x.div(pivotValue));
    const newPivotRow = slackConstraints[pivotRow];

    // Step 2: for every other constraint row, subtract (its pivot column entry) * pivot row
    // so that the rest of the pivot column becomes 0
    slackConstraints.forEach((row, i) => {
        if (i !== pivotRow) {
            const factor = row[pivotCol];
            slackConstraints[i] = row.map((x, j) => x.sub(factor.mul(newPivotRow[j])));
        }
    });

    // Same thing for the objective row
    const factor = slackToMax[pivotCol];
    slackToMax = slackToMax.map((x, j) => x.sub(factor.mul(newPivotRow[j])));

    return [slackToMax, slackConstraints];
}

// Index of the single 1 if the column is all 0s except that 1, otherwise -1
function unitRow(column) {
    const ones = column.filter(x => x.eq(ONE)).length;
    const zeros = column.filter(x => x.eq(ZERO)).length;
    return ones === 1 && zeros === column.length - 1 ? column.findIndex(x => x.eq(ONE)) : -1;
}

function readSolution(slackToMax, slackConstraints, numVars) {
    // A variable is basic if its column is all 0s except a single 1 in one constraint row
    // (and 0 in the objective row). Its value is then that row's rhs. Non-basic variables are 0.
    // Two columns can be identical, but each row has only one basic variable, so a row's rhs
    // goes to the first column that claims it and the rest are 0.
    const values = [];
    const usedRows = new Set();
    for (let col = 0; col < numVars; col++) {
        const r = unitRow(slackConstraints.map(row => row[col]));
        if (slackToMax[col].eq(ZERO) && r !== -1 && !usedRows.has(r)) {
            usedRows.add(r);
            values.push(slackConstraints[r][slackConstraints[r].length - 1]);
        } else {
            values.push(ZERO);
        }
    }
    return values;
}

function initializeSimplex(slackToMax, slackConstraints) {
    // CLRS INITIALIZE-SIMPLEX: find a feasible starting point, or show there isn't one.
    // Add an extra variable x0 (column just before p) with -1 in every constraint,
    // and solve the auxiliary problem: maximize -x0  ->  x0 + p = 0
    slackConstraints = slackConstraints.map(row => [...row.slice(0, -2), ONE.neg(), ...row.slice(-2)]);
    const x0 = slackConstraints[0].length - 3;
    let auxToMax = [...Array(x0).fill(ZERO), ONE, ONE, ZERO];

    // One pivot on x0 in the row with the most negative rhs makes every rhs >= 0
    const rhs = row => row[row.length - 1];
    let pivotRow = 0;
    slackConstraints.forEach((row, i) => {
        if (rhs(row).lt(rhs(slackConstraints[pivotRow]))) pivotRow = i;
    });
    [auxToMax, slackConstraints] = pivot(auxToMax, slackConstraints, pivotRow, x0, slackConstraints[pivotRow][x0]);

    // Now the starting point is feasible, so pivot as normal.
    // -x0 <= 0, so the auxiliary problem can't be unbounded.
    while (auxToMax.slice(0, -1).some(x => x.lt(ZERO))) {
        const pivotCol = findPivotCol(auxToMax.slice(0, -1));
        const [row, pivotValue] = findPivotVal(pivotCol, slackConstraints);
        [auxToMax, slackConstraints] = pivot(auxToMax, slackConstraints, row, pivotCol, pivotValue);
    }

    // If the best -x0 is still negative, x0 can never be 0, so the original problem is infeasible
    if (rhs(auxToMax).lt(ZERO)) return null;

    // If x0 is still basic (at value 0), pivot it out on any other nonzero entry in its row.
    // The row's rhs is 0, so this pivot doesn't change any values.
    const r = unitRow(slackConstraints.map(row => row[x0]));
    if (auxToMax[x0].eq(ZERO) && r !== -1 && rhs(slackConstraints[r]).eq(ZERO)) {
        const col = slackConstraints[r].findIndex((x, j) => j < x0 && !x.eq(ZERO));
        [auxToMax, slackConstraints] = pivot(auxToMax, slackConstraints, r, col, slackConstraints[r][col]);
    }

    // Drop the x0 column and put the original objective back. Basic variables must be 0
    // in the objective row, so for each one subtract (its objective entry) * (its row).
    slackConstraints = slackConstraints.map(row => [...row.slice(0, x0), ...row.slice(x0 + 1)]);
    for (let col = 0; col < x0; col++) {
        const r = unitRow(slackConstraints.map(row => row[col]));
        if (!slackToMax[col].eq(ZERO) && r !== -1) {
            const factor = slackToMax[col];
            slackToMax = slackToMax.map((x, j) => x.sub(factor.mul(slackConstraints[r][j])));
        }
    }

    return [slackToMax, slackConstraints];
}

// Maximize toMax . x subject to each row of constraints: [coeffs..., rhs] meaning coeffs . x <= rhs,
// and x >= 0. Write a >= constraint by negating the whole row.
// Returns { status: 'optimal', p, values } with Fractions, or { status: 'infeasible' } / { status: 'unbounded' }.
function simplex(toMax, constraints) {
    let [slackToMax, slackConstraints] = slackForm(toMax, constraints);

    // If any rhs is negative, the starting point (every variable 0) isn't feasible
    if (slackConstraints.some(row => row[row.length - 1].lt(ZERO))) {
        const result = initializeSimplex(slackToMax, slackConstraints);
        if (result === null) return { status: 'infeasible' };
        [slackToMax, slackConstraints] = result;
    }

    // Keep pivoting while there's a negative value in the objective row.
    // slice(0, -1) skips the rhs column, since that's the value of p, not a variable.
    while (slackToMax.slice(0, -1).some(x => x.lt(ZERO))) {
        const pivotCol = findPivotCol(slackToMax.slice(0, -1));
        const [pivotRow, pivotValue] = findPivotVal(pivotCol, slackConstraints);
        if (pivotRow === null) return { status: 'unbounded' };

        [slackToMax, slackConstraints] = pivot(slackToMax, slackConstraints, pivotRow, pivotCol, pivotValue);
    }

    const values = readSolution(slackToMax, slackConstraints, toMax.length);
    const p = slackToMax[slackToMax.length - 1];
    return { status: 'optimal', p, values };
}

export { Fraction, simplex };
