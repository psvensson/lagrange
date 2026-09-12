import assert from 'node:assert/strict';

import {
  induceTiDbRetryableConflict,
} from '../../test/distributed/reference-client/tidb-retryable-conflict-probe.js';

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {promise, resolve: resolvePromise, reject: rejectPromise};
}

function buildFakeConnections() {
  const leftBlocked = deferred();
  const trace = [];
  let connectionIndex = 0;

  function connection(side) {
    let executeCount = 0;
    return {
      async query(sql) {
        trace.push({side, op: 'query', sql});
      },
      async beginTransaction() {
        trace.push({side, op: 'begin'});
      },
      execute(sql, parameters) {
        executeCount += 1;
        trace.push({side, op: 'execute', sql, parameters});
        if (executeCount === 1) return Promise.resolve([{}]);
        if (side === 'left') return leftBlocked.promise;
        const error = Object.assign(new Error('deadlock victim'), {
          code: 'ER_LOCK_DEADLOCK',
          errno: 1213,
          sqlState: '40001',
          sqlMessage: 'Deadlock found when trying to get lock',
        });
        leftBlocked.resolve([{}]);
        return Promise.reject(error);
      },
      async rollback() {
        trace.push({side, op: 'rollback'});
      },
      async end() {
        trace.push({side, op: 'end'});
      },
    };
  }

  const connections = [connection('left'), connection('right')];
  return {
    trace,
    createConnection: async () => connections[connectionIndex++],
  };
}

const fake = buildFakeConnections();
const result = await induceTiDbRetryableConflict({
  endpoint: {host: '127.0.0.1', port: 4000},
  databaseName: 'conflict_guard',
  createConnection: fake.createConnection,
  cycleArmDelayMs: 0,
  timeoutMs: 1000,
});

assert.deepEqual(result.victim, {
  side: 'right',
  code: 'ER_LOCK_DEADLOCK',
  errno: 1213,
  sqlState: '40001',
  sqlMessage: 'Deadlock found when trying to get lock',
});
assert.equal(result.results.length, 2);
assert.equal(result.results[0].side, 'left');
assert.equal(result.results[0].succeeded, true);
assert.equal(result.results[1].side, 'right');
assert.equal(result.results[1].succeeded, false);
assert.equal(
  fake.trace.filter(({op}) => op === 'execute').length,
  4,
);
assert.equal(
  fake.trace.filter(({op}) => op === 'rollback').length,
  2,
);
assert.equal(
  fake.trace.filter(({op}) => op === 'end').length,
  2,
);
assert.equal(
  fake.trace.filter(({op, sql}) =>
    op === 'query' && sql.includes('tidb_txn_mode = \'pessimistic\''),
  ).length,
  2,
);

await assert.rejects(
  induceTiDbRetryableConflict({
    endpoint: {host: '', port: 4000},
    databaseName: 'conflict_guard',
  }),
  /requires endpoint.host/u,
);

console.log('tidb-retryable-conflict-probe-guard: PASS');
