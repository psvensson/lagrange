import assert from 'node:assert/strict';
import {
  induceTiDbRetryableConflict,
} from '../../test/distributed/reference-client/tidb-retryable-conflict-probe.js';
import {
  evaluateScenarioARetryableConflictObservation,
} from '../../test/distributed/harness/oltp-scenario-a-retryable-conflict-case.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const PASS_MESSAGE = 'tidb-retryable-conflict-probe-guard: PASS';

// A fake TiDB behind the shared probe's mysql sessions: one warehouse row;
// `mode` decides how the engine treats the second, conflicting update
// (blocking: both apply; serialization: 40001 on the loser; lost: the second
// update is silently dropped).
function createConflictEngine(mode) {
  const state = {value: 100, version: 0, configs: [], statements: [], ended: 0};
  const createConnection = async (config) => {
    state.configs.push(config);
    const session = {snapshot: null, pending: 0};
    const conflicted = () => session.snapshot !== null && state.version !== session.snapshot;
    const reset = () => {
      session.snapshot = null;
      session.pending = 0;
    };
    return {
      query: async (sql) => {
        state.statements.push(sql);
        return [[]];
      },
      beginTransaction: async () => {
        session.snapshot = state.version;
        session.pending = 0;
      },
      commit: async () => {
        state.value += session.pending;
        if (session.pending !== 0) state.version += 1;
        reset();
      },
      rollback: async () => reset(),
      end: async () => {
        state.ended += 1;
      },
      execute: async (sql, parameters) => {
        state.statements.push(sql);
        if (stringStartsWith(sql, 'SELECT')) return [[{ytd_cents: state.value}]];
        if (mode === 'serialization' && conflicted()) {
          throw Object.assign(new Error('Write conflict'), {code: 'ER_LOCK_DEADLOCK',
            errno: 9007, sqlState: '40001', sqlMessage: 'Write conflict'});
        }
        if (!(mode === 'lost' && conflicted())) session.pending += parameters[0];
        return [{affectedRows: 1}];
      },
    };
  };
  return {createConnection, state};
}

const runProbeGuard = async () => {
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

  // 2. The shared probe over the mysql wire: the same two conflicting logical
  // requests and observable contract as every arm (coordinator decision 5).
  const run = async (mode) => {
    const engine = createConflictEngine(mode);
    const probe = await induceTiDbRetryableConflict({
      endpoint: {host: '127.0.0.1', port: 4000}, databaseName: 'conflict_guard',
      createConnection: engine.createConnection, retrySleep: async () => {},
    });
    return {probe, engine};
  };

  const blocking = await run('blocking');
  assert.equal(blocking.probe.observation.mechanism, 'blocking-then-commit');
  assert.deepEqual(blocking.probe.observation.effects, {baseline: 100, final: 300, delta: 100});
  assert.equal(evaluateScenarioARetryableConflictObservation(blocking.probe.observation).passed,
    true);
  assert.equal(blocking.engine.state.configs.length, 3);
  assert.equal(blocking.engine.state.configs[0].host, '127.0.0.1');
  assert.equal(blocking.engine.state.configs[0].port, 4000);
  assert.equal(blocking.engine.state.configs[0].database, 'conflict_guard');
  assert.equal(arrayFilter(blocking.engine.state.statements,
    (sql) => sql === 'SET SESSION tidb_txn_mode = \'pessimistic\'').length, 3);
  assert.equal(blocking.engine.state.ended, 3, 'every session is closed');

  const conflict = await run('serialization');
  assert.equal(conflict.probe.observation.mechanism, 'serialization-conflict');
  assert.equal(conflict.probe.observation.victimSqlState, '40001');
  assert.equal(conflict.probe.observation.retryCommitted, true);
  assert.equal(conflict.probe.observation.effects.final, 300);
  assert.equal(conflict.probe.victim.errno, 9007);
  assert.equal(evaluateScenarioARetryableConflictObservation(conflict.probe.observation).passed,
    true);

  const lost = await run('lost');
  assert.equal(lost.probe.observation.effects.final, 200);
  assert.deepEqual(
    evaluateScenarioARetryableConflictObservation(lost.probe.observation).failures,
    ['lost_update'],
  );
};

await runProbeGuard();

console.log(PASS_MESSAGE);
