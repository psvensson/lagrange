/**
 * A spent wait is a failure, and is visible (function query executor): a
 * function query whose engine result does not arrive within its timeout
 * (FUNCTION_DEFAULT.QUERY_TIMEOUT_MS or options.timeout) logs exactly one
 * wait_bound_spent ERROR — replacing the generic failure line for that
 * error, not doubling it — and a query that answers inside the bound logs
 * none. Post-expiry behaviour is unchanged: executeQuery rejects with the
 * same "Query timeout after <n>ms" error.
 *
 * Fake timers (node:test mock.timers) spend the bound.
 */

import {mock} from 'node:test';
import {test} from '../../src/test-helpers/tap.js';
import {FunctionQueryExecutor} from '../../src/function/function-query-executor.js';

const TIMEOUT_MS = 750;
const START_MS = 2_000_000;

function buildExecutor(engine) {
  const lines = [];
  const record = (level) => (message, context) => {
    lines.push({level, message, context});
  };
  const executor = new FunctionQueryExecutor({sqlQueryEngine: engine});
  executor.logger = {
    error: record('error'),
    warn: record('warn'),
    info: record('info'),
    debug: record('debug'),
  };
  return {executor, errors: () => lines.filter((l) => l.level === 'error')};
}

test('a spent function-query timeout logs one wait_bound_spent ERROR and ' +
  'still rejects with the same timeout error', async (t) => {
  mock.timers.enable({apis: ['setTimeout', 'Date'], now: START_MS});
  t.teardown(() => mock.timers.reset());
  const {executor, errors} = buildExecutor({
    executeQuery: () => new Promise(() => {}),
  });
  const outcome = executor.executeQuery('SELECT * FROM t WHERE id = ?', [7], {
    timeout: TIMEOUT_MS,
  }).then(() => null, (error) => error);
  mock.timers.tick(TIMEOUT_MS);
  const error = await outcome;
  t.ok(error, 'the query rejected at its timeout');
  t.equal(error.message, `Query timeout after ${TIMEOUT_MS}ms`,
    'with the same timeout error');
  t.equal(errors().length, 1, 'exactly one ERROR (no doubled failure line)');
  const context = errors()[0].context;
  t.equal(context.event, 'wait_bound_spent');
  t.equal(context.wait, 'FUNCTION_DEFAULT.QUERY_TIMEOUT_MS');
  t.equal(context.boundMs, TIMEOUT_MS);
  t.equal(context.elapsedMs, TIMEOUT_MS);
  t.same(context.lastObserved, {
    engineResultPending: true,
    paramCount: 1,
    statementKind: 'SELECT',
    sqlChars: 'SELECT * FROM t WHERE id = ?'.length,
  }, 'the statement by kind and size, never its text');
});

test('a function query answered inside its bound logs no wait_bound_spent',
  async (t) => {
    mock.timers.enable({apis: ['setTimeout', 'Date'], now: START_MS});
    t.teardown(() => mock.timers.reset());
    const {executor, errors} = buildExecutor({
      executeQuery: async () => ({results: [{id: 7}], affectedRows: 0}),
    });
    const result = await executor.executeQuery('SELECT 1', [], {
      timeout: TIMEOUT_MS,
    });
    t.same(result.rows, [{id: 7}]);
    mock.timers.tick(TIMEOUT_MS);
    t.equal(errors().length, 0, 'no ERROR on normal completion');
  });
