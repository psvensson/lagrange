/**
 * Real-SQL guard for stable parallel-reduce slot ownership.
 *
 * The unit-level wiring suite exercises exact reduction and evidence
 * projection. This test drives the production lease SQL through SQLite
 * so conditional claim/release visibility and expiry takeover are not
 * inferred from a regex mock.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {
  SqlQueryLoopRuntimeModule,
} from '../../src/runtime/sql-query-loop-runtime-module.js';
import {
  parseResultSnapshotWitness,
} from '../../src/runtime/sql-query-loop-parallel-reduce.js';
import {
  HEALTH_STATUS,
  PREPARE_STATUS,
  START_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {
  assessAffinityDemoCompletion,
} from '../../examples/service-data-affinity/affinity-demo-evidence.js';

const WAIT_TIMEOUT_MS = 1500;
const WAIT_POLL_MS = 5;
const LOOP_INTERVAL_MS = 120;
const LEASE_MS = 500;

async function waitFor(predicate) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
  }
}

function createLeaseDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE reduce_slots (
      slot_id INTEGER PRIMARY KEY,
      replica_id TEXT NOT NULL,
      lease_expires_at INTEGER NOT NULL,
      partial_json TEXT NOT NULL,
      computed_at INTEGER NOT NULL
    );
    INSERT INTO reduce_slots VALUES (1, '', 0, '[]', 0);
    INSERT INTO reduce_slots VALUES (2, '', 0, '[]', 0);
    CREATE TABLE final_topn (
      result_id TEXT PRIMARY KEY,
      result_json TEXT NOT NULL,
      computed_at INTEGER NOT NULL,
      source_snapshot_json TEXT NOT NULL
    );
    INSERT INTO final_topn VALUES ('global', '[]', 0, '{}');
  `);
  return db;
}

function sqliteExecutor(db, shardRowsBySql) {
  const execute = async (sql, params = []) => {
    if (shardRowsBySql.has(sql)) {
      return {success: true, results: shardRowsBySql.get(sql)};
    }
    try {
      const statement = db.prepare(sql);
      if (statement.reader) {
        return {success: true, results: statement.all(...params)};
      }
      const result = statement.run(...params);
      return {success: true, changes: result.changes};
    } catch (error) {
      return {success: false, error: error.message};
    }
  };
  execute.executeInternal = execute;
  return execute;
}

function slotOwners(db) {
  return db.prepare(
    'SELECT slot_id, replica_id, lease_expires_at FROM reduce_slots ' +
      'ORDER BY slot_id',
  ).all();
}

async function prepareAndStart(module, serviceId, config, executor) {
  const prepared = await module.prepare({
    serviceId,
    runtime_config: JSON.stringify(config),
  });
  if (prepared.status !== PREPARE_STATUS.READY) {
    throw new Error(prepared.error);
  }
  const started = await module.start({serviceId, queryExecutor: executor});
  if (started.status !== START_STATUS.RUNNING) {
    throw new Error(started.error);
  }
}

test('parallel reduce lease SQL: concurrent generations claim unique slots ' +
  'and expiry permits add-before-remove takeover', async (t) => {
  const db = createLeaseDatabase();
  const shardOneSql = 'SELECT movie_id, rating FROM ratings WHERE movie_id < 2';
  const shardTwoSql = 'SELECT movie_id, rating FROM ratings WHERE movie_id >= 2';
  const config = {
    sql: 'SELECT movie_id, rating FROM ratings',
    intervalMs: LOOP_INTERVAL_MS,
    reduce: {
      groupBy: 'movie_id',
      aggregate: 'avg',
      valueColumn: 'rating',
      limit: 1,
    },
    resultTable: 'final_topn',
    parallelReduce: {
      shardSqlBySlot: {1: shardOneSql, 2: shardTwoSql},
      coordinationTable: 'reduce_slots',
      leaseMs: LEASE_MS,
      coordinatorSlot: 1,
      resultId: 'global',
      resultSnapshotColumn: 'source_snapshot_json',
    },
  };
  const executor = sqliteExecutor(db, new Map([
    [shardOneSql, [{movie_id: 1, rating: 5}]],
    [shardTwoSql, [{movie_id: 2, rating: 4}]],
  ]));
  const firstId = 'svc-affinity-r3';
  const secondId = 'svc-affinity-r4';
  const first = new SqlQueryLoopRuntimeModule();
  const second = new SqlQueryLoopRuntimeModule();
  let replacement = null;
  let replacementId = null;
  t.teardown(async () => {
    await first.stop({serviceId: firstId});
    await second.stop({serviceId: secondId});
    if (replacement) {
      await replacement.stop({serviceId: replacementId});
    }
    if (db.open) {
      db.close();
    }
  });

  await Promise.all([
    prepareAndStart(first, firstId, config, executor),
    prepareAndStart(second, secondId, config, executor),
  ]);
  await waitFor(() => {
    const owners = slotOwners(db).map((row) => row.replica_id);
    return new Set(owners).size === 2 && owners.every(Boolean);
  });
  t.same(slotOwners(db).map((row) => row.replica_id), [firstId, secondId],
    'conditional claims observed through SQLite assign unique stable slots');
  await waitFor(() => JSON.parse(db.prepare(
    'SELECT result_json FROM final_topn WHERE result_id = \'global\'',
  ).get().result_json).length === 1);
  t.same(JSON.parse(db.prepare(
    'SELECT result_json FROM final_topn WHERE result_id = \'global\'',
  ).get().result_json), [{groupKey: 1, aggValue: 5}],
  'the coordinator publishes the exact bounded snapshot through real SQL');
  const publishedResult = db.prepare(
    'SELECT result_json, computed_at, source_snapshot_json ' +
    'FROM final_topn WHERE result_id = \'global\'',
  ).get();
  const sourceSnapshot = JSON.parse(publishedResult.source_snapshot_json);
  const sourceSlots = Array.isArray(sourceSnapshot.slots) ?
    sourceSnapshot.slots :
    [];
  t.equal(sourceSnapshot.schemaVersion, 1,
    'the result row atomically identifies its partial-snapshot contract');
  t.same(sourceSlots.map((slot) => slot.slotId), [1, 2],
    'the witness covers every configured stable slot');
  t.same(sourceSlots.map((slot) => slot.replicaId), [firstId, secondId],
    'the witness binds the result to the replica generations it merged');
  t.same(sourceSlots.map((slot) => slot.candidateCount), [1, 1],
    'the witness retains the bounded candidate count per partial');
  t.ok(sourceSlots.every((slot) =>
    Number(slot.computedAt) > 0 &&
    Number(slot.computedAt) <= Number(publishedResult.computed_at)),
  'the result is chronologically downstream of every witnessed partial');

  const laterPartialAt = Number(publishedResult.computed_at) + 1;
  db.prepare(
    'UPDATE reduce_slots SET computed_at = ?, lease_expires_at = ? ' +
    'WHERE slot_id = 2',
  ).run(laterPartialAt, Date.now() + LEASE_MS);
  const currentSlots = db.prepare(
    'SELECT slot_id, replica_id, lease_expires_at, partial_json, ' +
    'computed_at FROM reduce_slots ORDER BY slot_id',
  ).all();
  const resultRows = JSON.parse(publishedResult.result_json);
  const serviceTopN = resultRows.map((row, index) => ({
    rank: index + 1,
    group_key: row.groupKey,
    agg_value: row.aggValue,
    computed_at: publishedResult.computed_at,
    source_snapshot_json: publishedResult.source_snapshot_json,
  }));
  const assessment = assessAffinityDemoCompletion({
    expectedReplicaCount: 2,
    placements: [
      {replicaId: firstId, nodeId: 'node-a'},
      {replicaId: secondId, nodeId: 'node-b'},
    ],
    weightedLocality: {
      placementScore: 2,
      bestScore: 2,
      localityRatio: 1,
    },
    referenceTopN: serviceTopN,
    serviceTopN,
    reduceSlots: currentSlots,
    expectedMergeCandidateCount: 2,
    phaseStartedAt: Math.min(
      Number(publishedResult.computed_at),
      ...sourceSlots.map((slot) => Number(slot.computedAt)),
    ) - 1,
    parallelReduceConfig: config.parallelReduce,
    partialLimit: 1,
  });
  t.equal(assessment.resultFresh, true,
    'a later periodic partial cannot retroactively stale a sealed result');
  t.equal(assessment.complete, true,
    'the exact result remains acceptable through its owned snapshot witness');

  t.same(parseResultSnapshotWitness(
    '{invalid', config.parallelReduce, 1,
  ), {state: 'invalid'},
  'an invalid result witness uses an explicit state variant');
  t.same(parseResultSnapshotWitness(
    undefined, config.parallelReduce, 1,
  ), {state: 'unavailable'},
  'an unavailable result witness uses an explicit state variant');

  replacementId = 'svc-affinity-r5';
  replacement = new SqlQueryLoopRuntimeModule();
  db.prepare(
    'UPDATE reduce_slots SET lease_expires_at = 0 WHERE slot_id = 1',
  ).run();
  await prepareAndStart(replacement, replacementId, config, executor);
  await waitFor(() => slotOwners(db)[0].replica_id === replacementId);
  t.equal((await first.health({serviceId: firstId})).status,
    HEALTH_STATUS.HEALTHY,
    'the predecessor is still running when the expired lease is taken');

  await first.stop({serviceId: firstId});
  const slotAfterStaleRelease = slotOwners(db)[0];
  t.equal(slotAfterStaleRelease.replica_id, replacementId,
    'owner-guarded stale release cannot erase the replacement lease');
  t.ok(slotAfterStaleRelease.lease_expires_at > Date.now(),
    'the replacement lease remains live after the predecessor stops');

  await replacement.stop({serviceId: replacementId});
  await second.stop({serviceId: secondId});
  db.close();
  t.end();
});
