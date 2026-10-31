from fractions import Fraction


def slackForm(toMax, constraints):
    # Use exact fractions instead of floats so pivoting doesn't build up rounding errors
    toMax = [Fraction(c) for c in toMax]
    constraints = [[Fraction(c) for c in row] for row in constraints]
    numSlack = len(constraints)

    # p = 30x + 40y  ->  -30x - 40y + p = 0
    # Negate the coefficients, slack variables get 0, p gets 1, and the rhs is 0
    slackToMax = [-c for c in toMax] + [0] * numSlack + [1] + [0]

    # Each constraint row is [coeffs..., rhs]. Insert one slack variable per row
    # between the coefficients and the rhs: 1 for this row's own slack, 0 for the rest.
    # p doesn't appear in the constraints, so its column is 0.
    slackConstraints = []
    for i, row in enumerate(constraints):
        coeffs, rhs = row[:-1], row[-1]
        slack = [1 if j == i else 0 for j in range(numSlack)]
        slackConstraints.append(coeffs + slack + [0] + [rhs])

    return slackToMax, slackConstraints

def find_pivot_col(slackToMax):
    min_val = slackToMax[0]
    min_index = 0
    for i in range(len(slackToMax)):
        if slackToMax[i] < min_val:
            min_val = slackToMax[i]
            min_index = i

    return min_index

def find_pivot_val(pivot_col, slackConstraints):
    # Ratio test: for each constraint, rhs / element in the pivot column.
    # Skip rows where the element is <= 0 (zero would divide by zero, and a
    # negative element means that constraint never limits the pivot variable).
    min_ratio = None
    pivot_row = None
    for i, constraint in enumerate(slackConstraints):
        element = constraint[pivot_col]
        if element > 0:
            ratio = constraint[-1] / element
            if min_ratio is None or ratio < min_ratio:
                min_ratio = ratio
                pivot_row = i

    # pivot_row is None if no row limits the variable, i.e. the problem is unbounded
    if pivot_row is None:
        return None, None
    return pivot_row, slackConstraints[pivot_row][pivot_col]


def pivot(slackToMax, slackConstraints, pivot_row, pivot_col, pivot_value):
    # Step 1: divide the pivot row by the pivot value so the pivot becomes 1
    slackConstraints[pivot_row] = [x / pivot_value for x in slackConstraints[pivot_row]]
    new_pivot_row = slackConstraints[pivot_row]

    # Step 2: for every other constraint row, subtract (its pivot column entry) * pivot row
    # so that the rest of the pivot column becomes 0
    for i, row in enumerate(slackConstraints):
        if i != pivot_row:
            factor = row[pivot_col]
            slackConstraints[i] = [x - factor * p for x, p in zip(row, new_pivot_row)]

    # Same thing for the objective row
    factor = slackToMax[pivot_col]
    slackToMax = [x - factor * p for x, p in zip(slackToMax, new_pivot_row)]

    return slackToMax, slackConstraints


def read_solution(slackToMax, slackConstraints, numVars):
    # A variable is basic if its column is all 0s except a single 1 in one constraint row
    # (and 0 in the objective row). Its value is then that row's rhs. Non-basic variables are 0.
    # Two columns can be identical, but each row has only one basic variable, so a row's rhs
    # goes to the first column that claims it and the rest are 0.
    values = []
    usedRows = set()
    for col in range(numVars):
        column = [row[col] for row in slackConstraints]
        if slackToMax[col] == 0 and column.count(1) == 1 and column.count(0) == len(column) - 1 \
                and column.index(1) not in usedRows:
            usedRows.add(column.index(1))
            values.append(slackConstraints[column.index(1)][-1])
        else:
            values.append(0)
    return values


def initialize_simplex(slackToMax, slackConstraints):
    # CLRS INITIALIZE-SIMPLEX: find a feasible starting point, or show there isn't one.
    # Add an extra variable x0 (column just before p) with -1 in every constraint,
    # and solve the auxiliary problem: maximize -x0  ->  x0 + p = 0
    slackConstraints = [row[:-2] + [Fraction(-1)] + row[-2:] for row in slackConstraints]
    x0 = len(slackConstraints[0]) - 3
    auxToMax = [0] * x0 + [1, 1, 0]

    # One pivot on x0 in the row with the most negative rhs makes every rhs >= 0
    pivot_row = min(range(len(slackConstraints)), key=lambda i: slackConstraints[i][-1])
    auxToMax, slackConstraints = pivot(auxToMax, slackConstraints, pivot_row, x0, slackConstraints[pivot_row][x0])

    # Now the starting point is feasible, so pivot as normal.
    # -x0 <= 0, so the auxiliary problem can't be unbounded.
    while min(auxToMax[:-1]) < 0:
        pivot_col = find_pivot_col(auxToMax[:-1])
        pivot_row, pivot_value = find_pivot_val(pivot_col, slackConstraints)
        auxToMax, slackConstraints = pivot(auxToMax, slackConstraints, pivot_row, pivot_col, pivot_value)

    # If the best -x0 is still negative, x0 can never be 0, so the original problem is infeasible
    if auxToMax[-1] < 0:
        return None

    # If x0 is still basic (at value 0), pivot it out on any other nonzero entry in its row.
    # The row's rhs is 0, so this pivot doesn't change any values.
    column = [row[x0] for row in slackConstraints]
    if auxToMax[x0] == 0 and column.count(1) == 1 and column.count(0) == len(column) - 1:
        r = column.index(1)
        if slackConstraints[r][-1] == 0:
            col = next(j for j in range(x0) if slackConstraints[r][j] != 0)
            auxToMax, slackConstraints = pivot(auxToMax, slackConstraints, r, col, slackConstraints[r][col])

    # Drop the x0 column and put the original objective back. Basic variables must be 0
    # in the objective row, so for each one subtract (its objective entry) * (its row).
    slackConstraints = [row[:x0] + row[x0 + 1:] for row in slackConstraints]
    for col in range(x0):
        column = [row[col] for row in slackConstraints]
        if slackToMax[col] != 0 and column.count(1) == 1 and column.count(0) == len(column) - 1:
            r = column.index(1)
            slackToMax = [x - slackToMax[col] * v for x, v in zip(slackToMax, slackConstraints[r])]

    return slackToMax, slackConstraints


def simplex(toMax, constraints):
    slackToMax, slackConstraints = slackForm(toMax, constraints)

    # If any rhs is negative, the starting point (every variable 0) isn't feasible
    if any(row[-1] < 0 for row in slackConstraints):
        result = initialize_simplex(slackToMax, slackConstraints)
        if result is None:
            print("Infeasible: no point satisfies all the constraints")
            return None
        slackToMax, slackConstraints = result

    # Keep pivoting while there's a negative value in the objective row.
    # [:-1] skips the rhs column, since that's the value of p, not a variable.
    while min(slackToMax[:-1]) < 0:
        pivot_col = find_pivot_col(slackToMax[:-1])
        pivot_row, pivot_value = find_pivot_val(pivot_col, slackConstraints)
        if pivot_row is None:
            print("Unbounded: p can be increased forever")
            return None

        slackToMax, slackConstraints = pivot(slackToMax, slackConstraints, pivot_row, pivot_col, pivot_value)

    values = read_solution(slackToMax, slackConstraints, len(toMax))
    p = slackToMax[-1]
    print("p =", p, "at", "[" + ", ".join(str(v) for v in values) + "]")
    return p, values



if __name__ == '__main__':

    '''
    maximize p = 30x + 40y

    with constraints:
        2x + y <= 10
        x + y <= 7
        x + 2y <= 12
        x >= 0, y >= 0
    
    result should be x = 2, y = 5, p = 260
    '''
    simplex([30, 40], [[2, 1, 10], [1, 1, 7], [1, 2, 12]])

    '''
    Example from book:
        maximize 3x_1 + x_2 + 2x_3
        subject to
            x_1 + x_2 + 3x_3 <= 30
            2x_1 + 2x_2 + 5x_3 <= 24
            4x_1 + x_2 + 2x_3 <= 36
            x_1, x_2, x_3 >= 0

    result should be x_1 = 8, x_2 = 4, x_ 3, = 0, p = 28
    '''
    simplex([3, 1, 2], [[1, 1, 3, 30],
                    [2, 2, 5, 24],
                    [4, 1, 2, 36]])


    '''
    Infeasible: maximize x
        x <= 1
        x >= 3   ->   -x <= -3
    no x satisfies both, so this should print Infeasible
    '''
    simplex([1], [[1, 1], [-1, -3]])

    '''
    Needs initialize_simplex: maximize p = 2x + 3y
        x + y <= 4
        x + 3y >= 6   ->   -x - 3y <= -6
        x >= 0, y >= 0
    the origin isn't feasible here, but the problem is.
    result should be x = 0, y = 4, p = 12
    '''
    simplex([2, 3], [[1, 1, 4], [-1, -3, -6]])
