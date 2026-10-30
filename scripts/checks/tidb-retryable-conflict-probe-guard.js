import assert from 'node:assert/strict';

import {
  induceTiDbRetryableConflict,
} from '../../test/distributed/reference-client/tidb-retryable-conflict-probe.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringIncludes = Function.call.bind(String.prototype.includes);

const PASS_MESSAGE = 'tidb-retryable-conflict-probe-guard: PASS';

const runProbeGuard = async () => {
  const deferred = () => {
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    return {promise, resolve: resolvePromise, reject: rejectPromise};
  };

  const buildMockHarness = (options = {}) => {
    const {
      leftFail = false,
      rightFail = true,
      queryFail = false,
      rollbackThrows = false,
      endThrows = false,
      hangExecution = false,
    } = options;

    const leftBlocked = deferred();
    const trace = [];
    const connectionConfigs = [];
    let connectionIndex = 0;

    const connection = (side) => {
      let executeCount = 0;
      return {
        async query(sql) {
          trace.push({side, op: 'query', sql});
          if (queryFail) {
            throw new Error(`query failed on ${side}`);
          }
        },
        async beginTransaction() {
          trace.push({side, op: 'begin'});
        },
        execute(sql, parameters) {
          executeCount += 1;
          trace.push({side, op: 'execute', sql, parameters});
          if (executeCount === 1) return Promise.resolve([{}]);
          if (hangExecution) return deferred().promise;

          if (side === 'left') {
            if (leftFail) {
              return Promise.reject(Object.assign(new Error('left victim'), {
                code: 'ER_LOCK_DEADLOCK',
                errno: 1213,
                sqlState: '40001',
                sqlMessage: 'Deadlock found when trying to get lock',
              }));
            }
            return leftBlocked.promise;
          }

          // side === 'right'
          if (rightFail) {
            const error = Object.assign(new Error('deadlock victim'), {
              code: 'ER_LOCK_DEADLOCK',
              errno: 1213,
              sqlState: '40001',
              sqlMessage: 'Deadlock found when trying to get lock',
            });
            leftBlocked.resolve([{}]);
            return Promise.reject(error);
          }
          leftBlocked.resolve([{}]);
          return Promise.resolve([{}]);
        },
        async rollback() {
          trace.push({side, op: 'rollback'});
          if (rollbackThrows) {
            throw new Error(`rollback error on ${side}`);
          }
        },
        async end() {
          trace.push({side, op: 'end'});
          if (endThrows) {
            throw new Error(`end error on ${side}`);
          }
        },
      };
    };

    const connections = [connection('left'), connection('right')];
    return {
      trace,
      connectionConfigs,
      createConnection: async (config) => {
        connectionConfigs.push(config);
        return connections[connectionIndex++];
      },
    };
  };

  // 1. Endpoint and databaseName validation before opening connections
  await assert.rejects(
    induceTiDbRetryableConflict({
      endpoint: {host: '', port: 4000},
      databaseName: 'conflict_guard',
    }),
    /TiDB conflict probe requires endpoint\.host/u,
  );

  await assert.rejects(
    induceTiDbRetryableConflict({
      databaseName: 'conflict_guard',
    }),
    /TiDB conflict probe requires endpoint\.host/u,
  );

  await assert.rejects(
    induceTiDbRetryableConflict({
      endpoint: {host: '127.0.0.1', port: 0},
      databaseName: 'conflict_guard',
    }),
    /TiDB conflict probe requires a valid endpoint\.port/u,
  );

  await assert.rejects(
    induceTiDbRetryableConflict({
      endpoint: {host: '127.0.0.1', port: 70000},
      databaseName: 'conflict_guard',
    }),
    /TiDB conflict probe requires a valid endpoint\.port/u,
  );

  await assert.rejects(
    induceTiDbRetryableConflict({
      endpoint: {host: '127.0.0.1', port: 'invalid'},
      databaseName: 'conflict_guard',
    }),
    /TiDB conflict probe requires a valid endpoint\.port/u,
  );

  await assert.rejects(
    induceTiDbRetryableConflict({
      endpoint: {host: '127.0.0.1', port: 4000},
      databaseName: '',
    }),
    /TiDB conflict probe requires databaseName/u,
  );

  await assert.rejects(
    induceTiDbRetryableConflict({
      endpoint: {host: '127.0.0.1', port: 4000},
      databaseName: '   ',
    }),
    /TiDB conflict probe requires databaseName/u,
  );

  // 2. Pessimistic mode setup, beginTransaction, lock cycle,
  // and single deadlock victim normalization
  {
    const fake = buildMockHarness();
    const result = await induceTiDbRetryableConflict({
      endpoint: {host: '127.0.0.1', port: 4000},
      databaseName: 'conflict_guard',
      createConnection: fake.createConnection,
      cycleArmDelayMs: 0,
      timeoutMs: 1000,
    });

    assert.equal(fake.connectionConfigs.length, 2);
    assert.equal(fake.connectionConfigs[0].host, '127.0.0.1');
    assert.equal(fake.connectionConfigs[0].port, 4000);
    assert.equal(fake.connectionConfigs[0].database, 'conflict_guard');

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
    assert.equal(result.results[0].error, null);
    assert.equal(result.results[1].side, 'right');
    assert.equal(result.results[1].succeeded, false);
    assert.deepEqual(result.results[1].error, result.victim);

    assert.equal(
      arrayFilter(
        fake.trace,
        ({op, sql}) =>
          op === 'query' &&
          stringIncludes(sql, 'tidb_txn_mode = \'pessimistic\''),
      ).length,
      2,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'begin').length,
      2,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'execute').length,
      4,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'rollback').length,
      2,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'end').length,
      2,
    );
  }

  // 3. Rejection when neither connection fails (0 victims) and cleanup
  {
    const fake = buildMockHarness({leftFail: false, rightFail: false});
    await assert.rejects(
      induceTiDbRetryableConflict({
        endpoint: {host: '127.0.0.1', port: 4000},
        databaseName: 'conflict_guard',
        createConnection: fake.createConnection,
        cycleArmDelayMs: 0,
        timeoutMs: 1000,
      }),
      /TiDB conflict probe expected exactly one deadlock victim, got 0/u,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'rollback').length,
      2,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'end').length,
      2,
    );
  }

  // 4. Rejection when both connections fail (2 victims) and cleanup
  {
    const fake = buildMockHarness({leftFail: true, rightFail: true});
    await assert.rejects(
      induceTiDbRetryableConflict({
        endpoint: {host: '127.0.0.1', port: 4000},
        databaseName: 'conflict_guard',
        createConnection: fake.createConnection,
        cycleArmDelayMs: 0,
        timeoutMs: 1000,
      }),
      /TiDB conflict probe expected exactly one deadlock victim, got 2/u,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'rollback').length,
      2,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'end').length,
      2,
    );
  }

  // 5. Timeout enforcement and cleanup verification
  {
    const fake = buildMockHarness({hangExecution: true});
    await assert.rejects(
      induceTiDbRetryableConflict({
        endpoint: {host: '127.0.0.1', port: 4000},
        databaseName: 'conflict_guard',
        createConnection: fake.createConnection,
        cycleArmDelayMs: 0,
        timeoutMs: 30,
      }),
      /TiDB conflict probe timed out after 30ms/u,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'rollback').length,
      2,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'end').length,
      2,
    );
  }

  // 6. Guaranteed rollback() and end() cleanup even when queries fail early
  {
    const fake = buildMockHarness({queryFail: true});
    await assert.rejects(
      induceTiDbRetryableConflict({
        endpoint: {host: '127.0.0.1', port: 4000},
        databaseName: 'conflict_guard',
        createConnection: fake.createConnection,
        cycleArmDelayMs: 0,
        timeoutMs: 1000,
      }),
      /query failed on left/u,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'rollback').length,
      2,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'end').length,
      2,
    );
  }

  // 7. Guaranteed rollback() and end() cleanup even when rollback throws
  {
    const fake = buildMockHarness({rollbackThrows: true});
    const result = await induceTiDbRetryableConflict({
      endpoint: {host: '127.0.0.1', port: 4000},
      databaseName: 'conflict_guard',
      createConnection: fake.createConnection,
      cycleArmDelayMs: 0,
      timeoutMs: 1000,
    });

    assert.equal(result.victim.side, 'right');
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'rollback').length,
      2,
    );
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'end').length,
      2,
    );
  }

  // 8. Guaranteed end() cleanup even when end throws
  {
    const fake = buildMockHarness({endThrows: true});
    const result = await induceTiDbRetryableConflict({
      endpoint: {host: '127.0.0.1', port: 4000},
      databaseName: 'conflict_guard',
      createConnection: fake.createConnection,
      cycleArmDelayMs: 0,
      timeoutMs: 1000,
    });

    assert.equal(result.victim.side, 'right');
    assert.equal(
      arrayFilter(fake.trace, ({op}) => op === 'end').length,
      2,
    );
  }
};

await runProbeGuard();

console.log(PASS_MESSAGE);
