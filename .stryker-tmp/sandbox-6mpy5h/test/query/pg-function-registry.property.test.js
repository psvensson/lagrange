/**
 * Property-based tests for PG function registry.
 *
 * Feature: pg-sql-compat-layer
 * PBT Library: fast-check
 * Runner: node:test
 */
// @ts-nocheck

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  translateFunctionCall,
  PG_FUNCTION_MAP,
} from '../../src/query/pg/pg-function-registry.js';
import {EXPR_TYPE} from '../../src/query/sql-parser.js';
import {
  PG_EXPR_TYPE,
  PG_EXTRACT_FORMAT,
  PG_DATE_TRUNC_FORMAT,
} from '../../src/query/pg/pg-compat-constants.js';

/** Identity converter — returns the node as-is. */
const identity = (e) => e;

/** Simple column ref node for use as a generic argument. */
function makeColRef(name) {
  return {type: EXPR_TYPE.COLUMN_REF, table: null, column: name};
}

/** Simple literal node. */
function makeLiteral(value) {
  return {type: EXPR_TYPE.LITERAL, value};
}

/**
 * Registered function names that accept normal args (not extract/date_trunc
 * which need special arg shapes).
 */
const NORMAL_REGISTERED_FNS = [
  ...PG_FUNCTION_MAP.keys(),
].filter((k) => k !== 'extract' && k !== 'date_trunc');

/**
 * Pass-through function names — same name in SQLite.
 */
const PASSTHROUGH_FNS = [
  'length', 'lower', 'upper', 'trim', 'coalesce', 'nullif', 'substr',
];


/**
 * Feature: pg-sql-compat-layer
 * Property 6: Function Registry Translation
 * **Validates: Requirements 7.2**
 *
 * For any registered function, translation produces correct
 * SQLite expression: pass-through fns keep name, concat produces
 * binary ||, substring produces substr, now/current_timestamp
 * produce datetime, current_date produces date, current_time
 * produces time.
 */
describe('Property 6: Function Registry Translation', () => {
  it('produces correct AST node type for any registered function', () => {
    const fnNameArb = fc.constantFrom(...NORMAL_REGISTERED_FNS);
    const argCountArb = fc.integer({min: 1, max: 4});

    fc.assert(
      fc.property(fnNameArb, argCountArb, (fnName, argCount) => {
        const args = Array.from(
          {length: argCount}, (_, i) => makeColRef(`c${i}`)
        );
        const result = translateFunctionCall(fnName, args, identity);

        // Result must have a type field (valid AST node)
        assert.ok(result.type, 'result must have a type field');

        if (PASSTHROUGH_FNS.includes(fnName)) {
          // Pass-through: function_call with same name
          assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
          assert.equal(result.name, fnName);
        } else if (fnName === 'concat') {
          // Concat with 1 arg: reduce returns the single element as-is
          // Concat with 2+ args: binary node chain with || operator
          if (argCount === 1) {
            assert.equal(result.type, EXPR_TYPE.COLUMN_REF);
          } else {
            assert.equal(result.type, EXPR_TYPE.BINARY);
            assert.equal(result.operator, '||');
          }
        } else if (fnName === 'substring') {
          // Substring: function_call with name 'substr'
          assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
          assert.equal(result.name, 'substr');
        } else if (fnName === 'now' || fnName === 'current_timestamp') {
          // Now: function_call with name 'datetime'
          assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
          assert.equal(result.name, 'datetime');
        } else if (fnName === 'current_date') {
          // Current date: function_call with name 'date'
          assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
          assert.equal(result.name, 'date');
        } else if (fnName === 'current_time') {
          // Current time: function_call with name 'time'
          assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
          assert.equal(result.name, 'time');
        }
      }),
      {numRuns: 10}
    );
  });
});


/**
 * Feature: pg-sql-compat-layer
 * Property 7: Unknown Function Pass-Through
 * **Validates: Requirements 7.4**
 *
 * For any unregistered function name, pass-through preserves
 * the original (non-lowercased) name in a function_call node.
 */
describe('Property 7: Unknown Function Pass-Through', () => {
  it('preserves original name for any unregistered function', () => {
    const registeredNames = new Set(PG_FUNCTION_MAP.keys());

    // Generate names guaranteed not to be in the registry
    const unknownFnArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,15}$/)
      .filter((name) => !registeredNames.has(name));

    fc.assert(
      fc.property(unknownFnArb, (fnName) => {
        const args = [makeColRef('x')];
        // Pass the name with original casing (mixed case)
        const mixedName = fnName.charAt(0).toUpperCase() + fnName.slice(1);
        const result = translateFunctionCall(
          mixedName, args, identity
        );

        // Must be a function_call node
        assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
        // Original (non-lowercased) name preserved
        assert.equal(result.name, mixedName);
        // Args are converted
        assert.equal(result.args.length, 1);
      }),
      {numRuns: 10}
    );
  });
});


/**
 * Feature: pg-sql-compat-layer
 * Property 8: EXTRACT Translation
 * **Validates: Requirements 8.2**
 *
 * For any supported EXTRACT field, the result is a CAST node
 * wrapping a strftime function_call, and the strftime format
 * matches PG_EXTRACT_FORMAT[field].
 */
describe('Property 8: EXTRACT Translation', () => {
  it('produces CAST(strftime(format, expr) AS INTEGER) for any field', () => {
    const fieldArb = fc.constantFrom(...Object.keys(PG_EXTRACT_FORMAT));
    const colArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/);

    fc.assert(
      fc.property(fieldArb, colArb, (field, colName) => {
        const fieldNode = makeLiteral(field);
        const exprNode = makeColRef(colName);
        const args = [fieldNode, exprNode];

        const result = translateFunctionCall(
          'extract', args, identity
        );

        // Result is a CAST node
        assert.equal(result.type, PG_EXPR_TYPE.CAST);
        assert.equal(result.affinity, 'INTEGER');

        // Inner expression is a strftime function_call
        const inner = result.expression;
        assert.equal(inner.type, PG_EXPR_TYPE.FUNCTION_CALL);
        assert.equal(inner.name, 'strftime');

        // First arg is the format literal matching PG_EXTRACT_FORMAT
        assert.equal(inner.args[0].type, EXPR_TYPE.LITERAL);
        assert.equal(inner.args[0].value, PG_EXTRACT_FORMAT[field]);

        // Second arg is the converted expression
        assert.equal(inner.args[1].type, EXPR_TYPE.COLUMN_REF);
        assert.equal(inner.args[1].column, colName);
      }),
      {numRuns: 10}
    );
  });
});


/**
 * Feature: pg-sql-compat-layer
 * Property 9: DATE_TRUNC Translation
 * **Validates: Requirements 8.3**
 *
 * For any supported DATE_TRUNC precision, the result is a
 * strftime function_call node, and the format matches
 * PG_DATE_TRUNC_FORMAT[precision].
 */
describe('Property 9: DATE_TRUNC Translation', () => {
  it('produces strftime(format, expr) for any precision', () => {
    const precisionArb = fc.constantFrom(
      ...Object.keys(PG_DATE_TRUNC_FORMAT)
    );
    const colArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/);

    fc.assert(
      fc.property(precisionArb, colArb, (precision, colName) => {
        const precisionNode = makeLiteral(precision);
        const exprNode = makeColRef(colName);
        const args = [precisionNode, exprNode];

        const result = translateFunctionCall(
          'date_trunc', args, identity
        );

        // Result is a function_call for strftime
        assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
        assert.equal(result.name, 'strftime');

        // First arg is the format literal matching PG_DATE_TRUNC_FORMAT
        assert.equal(result.args[0].type, EXPR_TYPE.LITERAL);
        assert.equal(
          result.args[0].value, PG_DATE_TRUNC_FORMAT[precision]
        );

        // Second arg is the converted expression
        assert.equal(result.args[1].type, EXPR_TYPE.COLUMN_REF);
        assert.equal(result.args[1].column, colName);
      }),
      {numRuns: 10}
    );
  });
});
