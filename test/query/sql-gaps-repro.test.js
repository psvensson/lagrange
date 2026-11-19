
import {test} from '../../src/test-helpers/tap.js';
import {
  buildSelectFanoutPlan,
} from '../../src/query/distributed/distributed-select-fanout-plan.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';

test('SQL Gaps Reproduction', async (t) => {
  t.test('should refuse native SQLite CONCAT in HAVING', async (t) => {
    const ast = {
      columns: [{expression: {type: 'aggregate', function: 'SUM', argument: {type: 'column_ref', column: 'a'}}}],
      having: {
        type: 'function_call',
        name: 'concat',
        args: [
          {type: 'aggregate', function: 'SUM', argument: {type: 'column_ref', column: 'a'}},
          {type: 'literal', value: ''}
        ]
      }
    };
    t.throws(() => {
      buildSelectFanoutPlan(ast, [], 2);
    }, {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE});
  });

  t.test('should correctly handle HAVING alias with collation', async (t) => {
    const ast = {
      columns: [
        {expression: {type: 'column_ref', column: 'name'}, alias: 'k'},
        {expression: {type: 'aggregate', function: 'COUNT', argument: {type: 'star'}}, alias: 'n'}
      ],
      groupBy: [{type: 'column_ref', column: 'id'}],
      having: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'k'},
        right: {type: 'literal', value: 'a'}
      }
    };
    
    // As per user analysis, currently admitted but gives wrong results in JS.
    // We expect it to be refused until alias resolution is fixed.
    t.throws(() => {
      buildSelectFanoutPlan(ast, [], 2, {
        resolveTableSchema: (name) => ({
          columns: [{name: 'name', collation: 'NOCASE'}]
        })
      });
    }, {code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE}, 'Should be refused');
  });
});
