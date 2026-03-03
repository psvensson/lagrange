/**
 * Unit tests for PG translation functions.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2, 5.1, 5.2,
 *               6.1, 6.2, 14.1, 14.2
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  translateBooleanLiteral,
  translatePositionalParam,
  translateTypeCast,
  translateIlike,
  translateOnConflict,
  reorderParams,
  validateParamMapping,
} from '../../src/query/pg/pg-translate.js';
import {EXPR_TYPE} from '../../src/query/sql-parser.js';
import {PG_EXPR_TYPE} from '../../src/query/pg/pg-compat-constants.js';

describe('translateBooleanLiteral', () => {
  it('translates TRUE to integer 1', () => {
    const result = translateBooleanLiteral({value: true});
    assert.deepStrictEqual(result, {type: EXPR_TYPE.LITERAL, value: 1});
  });

  it('translates FALSE to integer 0', () => {
    const result = translateBooleanLiteral({value: false});
    assert.deepStrictEqual(result, {type: EXPR_TYPE.LITERAL, value: 0});
  });
});

describe('translatePositionalParam', () => {
  it('returns a parameter node', () => {
    const tracker = [];
    const result = translatePositionalParam({value: 1}, tracker);
    assert.deepStrictEqual(result, {type: EXPR_TYPE.PARAMETER});
  });

  it('records 1-based index in tracker', () => {
    const tracker = [];
    translatePositionalParam({value: 3}, tracker);
    assert.deepStrictEqual(tracker, [3]);
  });

  it('accumulates multiple indices in tracker', () => {
    const tracker = [];
    translatePositionalParam({value: 2}, tracker);
    translatePositionalParam({value: 1}, tracker);
    translatePositionalParam({value: 3}, tracker);
    assert.deepStrictEqual(tracker, [2, 1, 3]);
  });
});

describe('translateTypeCast', () => {
  it('produces a cast node with resolved affinity from target.dataType', () => {
    const expr = {
      expr: {type: 'column_ref', column: 'age'},
      target: {dataType: 'integer'},
    };
    const convertExprFn = (e) => ({type: EXPR_TYPE.COLUMN_REF, table: null, column: e.column});
    const result = translateTypeCast(expr, convertExprFn);
    assert.deepStrictEqual(result, {
      type: PG_EXPR_TYPE.CAST,
      expression: {type: EXPR_TYPE.COLUMN_REF, table: null, column: 'age'},
      affinity: 'INTEGER',
    });
  });

  it('resolves PG type to SQLite affinity via resolveAffinity', () => {
    const expr = {
      expr: {type: 'column_ref', column: 'name'},
      target: {dataType: 'varchar'},
    };
    const convertExprFn = (e) => ({type: EXPR_TYPE.COLUMN_REF, table: null, column: e.column});
    const result = translateTypeCast(expr, convertExprFn);
    assert.equal(result.affinity, 'TEXT');
  });

  it('falls back to as field when target.dataType is absent', () => {
    const expr = {
      expr: {type: 'number', value: 42},
      as: 'real',
    };
    const convertExprFn = () => ({type: EXPR_TYPE.LITERAL, value: 42});
    const result = translateTypeCast(expr, convertExprFn);
    assert.equal(result.affinity, 'REAL');
  });

  it('passes unknown types through uppercased', () => {
    const expr = {
      expr: {type: 'column_ref', column: 'data'},
      target: {dataType: 'jsonb'},
    };
    const convertExprFn = (e) => ({type: EXPR_TYPE.COLUMN_REF, table: null, column: e.column});
    const result = translateTypeCast(expr, convertExprFn);
    assert.equal(result.affinity, 'JSONB');
  });

  it('calls convertExprFn on the inner expression', () => {
    let called = false;
    const expr = {
      expr: {type: 'number', value: 10},
      target: {dataType: 'text'},
    };
    const convertExprFn = (e) => {
      called = true;
      return {type: EXPR_TYPE.LITERAL, value: e.value};
    };
    translateTypeCast(expr, convertExprFn);
    assert.ok(called);
  });
});

describe('translateIlike', () => {
  const identity = (e) => e;

  it('wraps both operands in LOWER for ILIKE', () => {
    const expr = {
      operator: 'ILIKE',
      left: {type: EXPR_TYPE.COLUMN_REF, table: null, column: 'name'},
      right: {type: EXPR_TYPE.LITERAL, value: '%test%'},
    };
    const result = translateIlike(expr, identity);
    assert.equal(result.type, EXPR_TYPE.LIKE);
    assert.equal(result.negated, false);
    assert.equal(result.expression.type, PG_EXPR_TYPE.FUNCTION_CALL);
    assert.equal(result.expression.name, 'lower');
    assert.deepStrictEqual(result.expression.args, [expr.left]);
    assert.equal(result.pattern.type, PG_EXPR_TYPE.FUNCTION_CALL);
    assert.equal(result.pattern.name, 'lower');
    assert.deepStrictEqual(result.pattern.args, [expr.right]);
  });

  it('sets negated=true for NOT ILIKE', () => {
    const expr = {
      operator: 'NOT ILIKE',
      left: {type: EXPR_TYPE.COLUMN_REF, table: null, column: 'name'},
      right: {type: EXPR_TYPE.LITERAL, value: '%test%'},
    };
    const result = translateIlike(expr, identity);
    assert.equal(result.negated, true);
  });

  it('calls convertExprFn on both operands', () => {
    const calls = [];
    const expr = {
      operator: 'ILIKE',
      left: {id: 'left'},
      right: {id: 'right'},
    };
    const convertExprFn = (e) => {
      calls.push(e.id);
      return e;
    };
    translateIlike(expr, convertExprFn);
    assert.deepStrictEqual(calls, ['left', 'right']);
  });
});

describe('translateOnConflict', () => {
  it('sets orIgnore=true for DO NOTHING', () => {
    const insertAst = {orIgnore: false, orReplace: false};
    translateOnConflict(insertAst, {
      action: {expr: {value: 'nothing'}},
    });
    assert.equal(insertAst.orIgnore, true);
    assert.equal(insertAst.orReplace, false);
  });

  it('sets orReplace=true for DO UPDATE', () => {
    const insertAst = {orIgnore: false, orReplace: false};
    translateOnConflict(insertAst, {
      action: {expr: {value: 'update'}},
    });
    assert.equal(insertAst.orReplace, true);
    assert.equal(insertAst.orIgnore, false);
  });

  it('sets orReplace=true for replace keyword', () => {
    const insertAst = {orIgnore: false, orReplace: false};
    translateOnConflict(insertAst, {
      action: {expr: {value: 'replace'}},
    });
    assert.equal(insertAst.orReplace, true);
  });

  it('does nothing when onConflict is null', () => {
    const insertAst = {orIgnore: false, orReplace: false};
    translateOnConflict(insertAst, null);
    assert.equal(insertAst.orIgnore, false);
    assert.equal(insertAst.orReplace, false);
  });

  it('handles uppercase keyword via type field', () => {
    const insertAst = {orIgnore: false, orReplace: false};
    translateOnConflict(insertAst, {
      action: {expr: {type: 'NOTHING'}},
    });
    assert.equal(insertAst.orIgnore, true);
  });
});

describe('reorderParams', () => {
  it('reorders params based on 1-based mapping', () => {
    const params = ['a', 'b', 'c'];
    const mapping = [2, 1, 3];
    const result = reorderParams(params, mapping);
    assert.deepStrictEqual(result, ['b', 'a', 'c']);
  });

  it('handles sequential mapping (no reorder needed)', () => {
    const params = ['x', 'y', 'z'];
    const mapping = [1, 2, 3];
    const result = reorderParams(params, mapping);
    assert.deepStrictEqual(result, ['x', 'y', 'z']);
  });

  it('handles repeated parameter references', () => {
    const params = ['a', 'b'];
    const mapping = [1, 2, 1];
    const result = reorderParams(params, mapping);
    assert.deepStrictEqual(result, ['a', 'b', 'a']);
  });

  it('returns empty array for empty mapping', () => {
    const result = reorderParams(['a'], []);
    assert.deepStrictEqual(result, []);
  });

  it('handles single parameter', () => {
    const params = ['only'];
    const mapping = [1];
    const result = reorderParams(params, mapping);
    assert.deepStrictEqual(result, ['only']);
  });
});

describe('validateParamMapping', () => {
  it('passes for valid sequential mapping', () => {
    assert.doesNotThrow(() => validateParamMapping([1, 2, 3], 3));
  });

  it('passes for valid mapping in any order', () => {
    assert.doesNotThrow(() => validateParamMapping([3, 1, 2], 3));
  });

  it('passes for empty mapping', () => {
    assert.doesNotThrow(() => validateParamMapping([], 0));
  });

  it('passes for repeated indices with all present', () => {
    assert.doesNotThrow(() => validateParamMapping([1, 2, 1], 2));
  });

  it('throws for out-of-bounds index', () => {
    assert.throws(
      () => validateParamMapping([1, 5], 3),
      (err) => err.message.includes('5'),
    );
  });

  it('throws for gap in indices', () => {
    assert.throws(
      () => validateParamMapping([1, 3], 3),
      (err) => err.message.includes('2'),
    );
  });

  it('throws for gap at index 1', () => {
    assert.throws(
      () => validateParamMapping([2, 3], 3),
      (err) => err.message.includes('1'),
    );
  });

  it('checks out-of-bounds before gaps', () => {
    assert.throws(
      () => validateParamMapping([4], 2),
      (err) => err.message.includes('4'),
    );
  });
});
