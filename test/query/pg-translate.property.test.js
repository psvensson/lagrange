/**
 * Property-based tests for PG translation functions.
 *
 * Feature: pg-sql-compat-layer
 * PBT Library: fast-check
 * Runner: node:test
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  translateBooleanLiteral,
  translatePositionalParam,
  translateIlike,
  translateOnConflict,
  reorderParams,
} from '../../src/query/pg/pg-translate.js';
import {EXPR_TYPE} from '../../src/query/sql-parser.js';
import {PG_EXPR_TYPE} from '../../src/query/pg/pg-compat-constants.js';

/**
 * Feature: pg-sql-compat-layer
 * Property 3: Positional Parameter Round-Trip
 * **Validates: Requirements 2.1, 2.2**
 *
 * For any N sequential params in any order, reordering
 * produces correct mapping: reorderedParams[i] equals
 * params[mapping[i]-1].
 */
describe('Property 3: Positional Parameter Round-Trip', () => {
  it('reordering produces correct mapping for any shuffled params', () => {
    // Generate N in [1..10], then a shuffled array of 1..N
    const shuffledIndices = fc.integer({min: 1, max: 10}).chain((n) => {
      const indices = Array.from({length: n}, (_, i) => i + 1);
      return fc.shuffledSubarray(indices, {minLength: n, maxLength: n})
        .map((shuffled) => ({n, shuffled}));
    });

    fc.assert(
      fc.property(shuffledIndices, ({n, shuffled}) => {
        // Build params array: ['v1', 'v2', ..., 'vN']
        const params = Array.from({length: n}, (_, i) => `v${i + 1}`);

        // Simulate translatePositionalParam for each shuffled index
        const tracker = [];
        for (const idx of shuffled) {
          translatePositionalParam({value: idx}, tracker);
        }

        // Reorder params using the tracker
        const reordered = reorderParams(params, tracker);

        // Verify: reordered[i] should equal params[shuffled[i] - 1]
        for (let i = 0; i < n; i++) {
          assert.equal(
            reordered[i],
            params[shuffled[i] - 1],
            `Position ${i}: expected v${shuffled[i]}`
          );
        }

        // Verify tracker matches the shuffled order
        assert.deepStrictEqual(tracker, shuffled);
      }),
      {numRuns: 10}
    );
  });
});


/**
 * Feature: pg-sql-compat-layer
 * Property 4: Boolean Literal Normalization
 * **Validates: Requirements 5.1, 5.2**
 *
 * For any expression with TRUE/FALSE, translation produces
 * {type: LITERAL, value: 1} for true and {type: LITERAL, value: 0}
 * for false.
 */
describe('Property 4: Boolean Literal Normalization', () => {
  it('translates any boolean to the correct integer literal', () => {
    fc.assert(
      fc.property(fc.boolean(), (boolVal) => {
        const result = translateBooleanLiteral({value: boolVal});
        assert.equal(result.type, EXPR_TYPE.LITERAL);
        assert.equal(result.value, boolVal ? 1 : 0);
      }),
      {numRuns: 10}
    );
  });
});

/**
 * Feature: pg-sql-compat-layer
 * Property 10: ON CONFLICT Translation
 * **Validates: Requirements 4.1, 4.2**
 *
 * For any INSERT with ON CONFLICT variants, correct flags are set:
 * 'nothing' → orIgnore=true, 'update'/'replace' → orReplace=true.
 */
describe('Property 10: ON CONFLICT Translation', () => {
  it('sets correct flags for any ON CONFLICT action', () => {
    const actionArb = fc.constantFrom('nothing', 'update', 'replace');

    fc.assert(
      fc.property(actionArb, (action) => {
        const insertAst = {orIgnore: false, orReplace: false};
        const onConflict = {
          keyword: 'on',
          action: {keyword: 'do', expr: {type: action, value: action}},
        };
        translateOnConflict(insertAst, onConflict);

        if (action === 'nothing') {
          assert.equal(insertAst.orIgnore, true);
          assert.equal(insertAst.orReplace, false);
        } else {
          assert.equal(insertAst.orReplace, true);
          assert.equal(insertAst.orIgnore, false);
        }
      }),
      {numRuns: 10}
    );
  });
});

/**
 * Feature: pg-sql-compat-layer
 * Property 11: ILIKE Translation
 * **Validates: Requirements 14.1, 14.2**
 *
 * For any ILIKE expression with random column names and patterns,
 * both operands are wrapped in LOWER() function_call nodes and
 * the result type is LIKE.
 */
describe('Property 11: ILIKE Translation', () => {
  it('wraps both operands in LOWER for any ILIKE expression', () => {
    const columnArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/);
    const patternArb = fc.string({minLength: 1, maxLength: 30});
    const negatedArb = fc.boolean();

    fc.assert(
      fc.property(
        columnArb, patternArb, negatedArb,
        (column, pattern, negated) => {
          const operator = negated ? 'NOT ILIKE' : 'ILIKE';
          const leftNode = {
            type: EXPR_TYPE.COLUMN_REF,
            table: null,
            column,
          };
          const rightNode = {
            type: EXPR_TYPE.LITERAL,
            value: pattern,
          };
          const expr = {operator, left: leftNode, right: rightNode};
          const identity = (e) => e;

          const result = translateIlike(expr, identity);

          // Result type is LIKE
          assert.equal(result.type, EXPR_TYPE.LIKE);

          // Negated flag matches input
          assert.equal(result.negated, negated);

          // Left operand wrapped in LOWER
          assert.equal(
            result.expression.type, PG_EXPR_TYPE.FUNCTION_CALL
          );
          assert.equal(result.expression.name, 'lower');
          assert.deepStrictEqual(result.expression.args, [leftNode]);

          // Right operand wrapped in LOWER
          assert.equal(
            result.pattern.type, PG_EXPR_TYPE.FUNCTION_CALL
          );
          assert.equal(result.pattern.name, 'lower');
          assert.deepStrictEqual(result.pattern.args, [rightNode]);
        }
      ),
      {numRuns: 10}
    );
  });
});
