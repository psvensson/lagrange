/**
 * Unit tests for PG function registry.
 * Tests each specific mapping and error conditions.
 * Requirements: 7.3, 8.1, 8.2, 8.3
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  translateFunctionCall,
} from '../../src/query/pg/pg-function-registry.js';
import {EXPR_TYPE} from '../../src/query/sql-parser.js';
import {
  PG_EXPR_TYPE,
  PG_EXTRACT_FORMAT,
  PG_DATE_TRUNC_FORMAT,
  PG_TRANSLATE_ERROR,
} from '../../src/query/pg/pg-compat-constants.js';

/** Identity converter — returns the node as-is. */
const identity = (e) => e;

/** Simple column ref node. */
function makeColRef(name) {
  return {type: EXPR_TYPE.COLUMN_REF, table: null, column: name};
}

/** Simple literal node. */
function makeLiteral(value) {
  return {type: EXPR_TYPE.LITERAL, value};
}

describe('pg-function-registry unit tests', () => {
  describe('CONCAT translation', () => {
    it('CONCAT(a, b) produces binary expression with ||', () => {
      const args = [makeColRef('a'), makeColRef('b')];
      const result = translateFunctionCall('concat', args, identity);

      assert.equal(result.type, EXPR_TYPE.BINARY);
      assert.equal(result.operator, '||');
      assert.deepStrictEqual(result.left, makeColRef('a'));
      assert.deepStrictEqual(result.right, makeColRef('b'));
    });

    it('CONCAT(a, b, c) produces chained binary ((a || b) || c)', () => {
      const args = [makeColRef('a'), makeColRef('b'), makeColRef('c')];
      const result = translateFunctionCall('concat', args, identity);

      assert.equal(result.type, EXPR_TYPE.BINARY);
      assert.equal(result.operator, '||');
      assert.deepStrictEqual(result.right, makeColRef('c'));

      const inner = result.left;
      assert.equal(inner.type, EXPR_TYPE.BINARY);
      assert.equal(inner.operator, '||');
      assert.deepStrictEqual(inner.left, makeColRef('a'));
      assert.deepStrictEqual(inner.right, makeColRef('b'));
    });
  });

  describe('SUBSTRING translation', () => {
    it('SUBSTRING(str, start, len) produces substr function_call', () => {
      const args = [makeColRef('str'), makeLiteral(1), makeLiteral(3)];
      const result = translateFunctionCall(
        'substring', args, identity,
      );

      assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
      assert.equal(result.name, 'substr');
      assert.equal(result.args.length, 3);
      assert.deepStrictEqual(result.args[0], makeColRef('str'));
      assert.deepStrictEqual(result.args[1], makeLiteral(1));
      assert.deepStrictEqual(result.args[2], makeLiteral(3));
    });
  });

  describe('NOW / CURRENT_TIMESTAMP translation', () => {
    it('NOW() produces datetime(\'now\')', () => {
      const result = translateFunctionCall('now', [], identity);

      assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
      assert.equal(result.name, 'datetime');
      assert.equal(result.args.length, 1);
      assert.equal(result.args[0].type, EXPR_TYPE.LITERAL);
      assert.equal(result.args[0].value, 'now');
    });

    it('CURRENT_TIMESTAMP produces datetime(\'now\')', () => {
      const result = translateFunctionCall(
        'current_timestamp', [], identity,
      );

      assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
      assert.equal(result.name, 'datetime');
      assert.equal(result.args.length, 1);
      assert.equal(result.args[0].value, 'now');
    });
  });

  describe('CURRENT_DATE translation', () => {
    it('CURRENT_DATE produces date(\'now\')', () => {
      const result = translateFunctionCall(
        'current_date', [], identity,
      );

      assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
      assert.equal(result.name, 'date');
      assert.equal(result.args.length, 1);
      assert.equal(result.args[0].value, 'now');
    });
  });

  describe('CURRENT_TIME translation', () => {
    it('CURRENT_TIME produces time(\'now\')', () => {
      const result = translateFunctionCall(
        'current_time', [], identity,
      );

      assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
      assert.equal(result.name, 'time');
      assert.equal(result.args.length, 1);
      assert.equal(result.args[0].value, 'now');
    });
  });

  describe('EXTRACT translation', () => {
    for (const [field, format] of Object.entries(PG_EXTRACT_FORMAT)) {
      it(`EXTRACT(${field} FROM col) produces CAST(strftime('${format}', col) AS INTEGER)`, () => {
        const args = [makeLiteral(field), makeColRef('created_at')];
        const result = translateFunctionCall(
          'extract', args, identity,
        );

        assert.equal(result.type, PG_EXPR_TYPE.CAST);
        assert.equal(result.affinity, 'INTEGER');

        const inner = result.expression;
        assert.equal(inner.type, PG_EXPR_TYPE.FUNCTION_CALL);
        assert.equal(inner.name, 'strftime');
        assert.equal(inner.args[0].value, format);
        assert.deepStrictEqual(
          inner.args[1], makeColRef('created_at'),
        );
      });
    }

    it('throws on unsupported EXTRACT field', () => {
      const args = [makeLiteral('quarter'), makeColRef('col')];
      assert.throws(
        () => translateFunctionCall('extract', args, identity),
        (err) => {
          assert.ok(err.message.startsWith(
            PG_TRANSLATE_ERROR.UNSUPPORTED_EXTRACT_FIELD,
          ));
          assert.ok(err.message.includes('quarter'));
          return true;
        },
      );
    });
  });

  describe('DATE_TRUNC translation', () => {
    for (const [precision, format] of Object.entries(PG_DATE_TRUNC_FORMAT)) {
      it(`DATE_TRUNC('${precision}', col) produces strftime('${format}', col)`, () => {
        const args = [makeLiteral(precision), makeColRef('ts')];
        const result = translateFunctionCall(
          'date_trunc', args, identity,
        );

        assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
        assert.equal(result.name, 'strftime');
        assert.equal(result.args[0].value, format);
        assert.deepStrictEqual(result.args[1], makeColRef('ts'));
      });
    }

    it('throws on unsupported DATE_TRUNC precision', () => {
      const args = [makeLiteral('week'), makeColRef('col')];
      assert.throws(
        () => translateFunctionCall('date_trunc', args, identity),
        (err) => {
          assert.ok(err.message.startsWith(
            PG_TRANSLATE_ERROR.UNSUPPORTED_DATE_TRUNC_FIELD,
          ));
          assert.ok(err.message.includes('week'));
          return true;
        },
      );
    });
  });

  describe('Pass-through functions', () => {
    const passThroughFns = [
      'length', 'lower', 'upper', 'trim',
      'coalesce', 'nullif', 'substr',
    ];

    for (const fn of passThroughFns) {
      it(`${fn} preserves function name`, () => {
        const args = [makeColRef('x')];
        const result = translateFunctionCall(fn, args, identity);

        assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
        assert.equal(result.name, fn);
        assert.equal(result.args.length, 1);
        assert.deepStrictEqual(result.args[0], makeColRef('x'));
      });
    }
  });

  describe('Unknown function pass-through', () => {
    it('unknown function passes through with original name', () => {
      const args = [makeColRef('x'), makeLiteral(42)];
      const result = translateFunctionCall(
        'my_custom_fn', args, identity,
      );

      assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
      assert.equal(result.name, 'my_custom_fn');
      assert.equal(result.args.length, 2);
    });
  });

  describe('Case insensitivity', () => {
    it('CONCAT in uppercase works', () => {
      const args = [makeColRef('a'), makeColRef('b')];
      const result = translateFunctionCall('CONCAT', args, identity);
      assert.equal(result.type, EXPR_TYPE.BINARY);
      assert.equal(result.operator, '||');
    });

    it('Concat in mixed case works', () => {
      const args = [makeColRef('a'), makeColRef('b')];
      const result = translateFunctionCall('Concat', args, identity);
      assert.equal(result.type, EXPR_TYPE.BINARY);
      assert.equal(result.operator, '||');
    });

    it('concat in lowercase works', () => {
      const args = [makeColRef('a'), makeColRef('b')];
      const result = translateFunctionCall('concat', args, identity);
      assert.equal(result.type, EXPR_TYPE.BINARY);
      assert.equal(result.operator, '||');
    });

    it('NOW in uppercase works', () => {
      const result = translateFunctionCall('NOW', [], identity);
      assert.equal(result.type, PG_EXPR_TYPE.FUNCTION_CALL);
      assert.equal(result.name, 'datetime');
    });
  });
});
