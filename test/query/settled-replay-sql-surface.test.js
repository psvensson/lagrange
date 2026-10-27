// What a client of the SQL surface sees when its write is replayed (owner
// ruling on the raft-rs cutover: a replay of an already committed
// write never tells its caller the write did not happen).
//
// The lab shape: the participant's answer to a routed write is lost after
// the partition applied it (here the router's delivery dies after the
// partition answered, as a connection that closes does), so the executor
// sends the same request - the same participant entryId - again. The
// partition answers the second delivery from the write's durable outcome
// row: it must answer the applied statement's own result, so the client's
// result carries the row count the statement affected, never zero rows.
//
// The engine, executor and partition are production's (a real lone rs-raft
// leader on a file database, its remote-query handler behind the router);
// only the router's delivery is the test's.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {classifyControlPlaneMutationResult} from
  '../../src/control-plane/control-plane-mutation-outcome-classifier.js';
import {resolveMutationCompletionState} from
  '../../src/control-plane/control-plane-system-table-gateway-mutation-contracts.js';
import {CONTROL_PLANE_MUTATION_OUTCOME} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {
  NODE_REGISTRATION_OUTCOME,
  writeNodeRegistrationAtIncarnation,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';
import * as outcomeConstants from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';

const {PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL} = outcomeConstants;
const REPLAY = outcomeConstants.PARTITION_SETTLED_REPLAY ?? {};
const TEMP_PREFIX = 'settled-replay-sql-surface-';
const TEST_TIMEOUT_MS = 30000;
const EXECUTOR_RETRY_DELAY_MS = 5;
const TABLE_NAME = 'surface_rows';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const UPDATE_SQL = `UPDATE ${TABLE_NAME} SET value = ? WHERE value = ?`;
const LOST_ANSWER = 'Connection to node closed before the answer arrived';
// The application owner exports its DDL, not its table name.
const OUTCOME_TABLE = PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.CREATE_TABLE
  .match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/u)[1];
const FORGET_RETAINED_RESULTS_SQL = `UPDATE ${OUTCOME_TABLE} ` +
  'SET changes = NULL, last_insert_rowid = NULL';
const NODES_ROW_ID = 'node-w4';
const BOOT_INCARNATION = 1;
const NODE_ID = 'surface-node';
// The table's active partition version: the engine fences its write with it
// and the partition validates the fence against its own tables row.
const ACTIVE_PARTITION_VERSION = 1;
const TABLES_ROW = Object.freeze({table_name: TABLE_NAME, primaryKey: 'id',
  active_partition_version: ACTIVE_PARTITION_VERSION});

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

// A system cache holding one partition, its leader and its service.
function systemCacheOf({partitionId, replicaId, address}) {
  const tables = [{...TABLES_ROW}];
  const partitions = [{partition_id: partitionId, table_name: TABLE_NAME,
    leader_node_id: NODE_ID, partition_key_start: null,
    partition_key_end: null}];
  const services = [{service_id: replicaId, service_type: 'partition',
    partition_id: partitionId, node_id: NODE_ID, raft_role: 'leader',
    address, status: 'active'}];
  const byType = {tables, partitions, services};
  return {
    get(type, key) {
      if (type === 'tables') {
        return tables.find((table) => table.table_name === key);
      }
      if (type === 'partitions') {
        return partitions.find((row) => row.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      return (byType[type] || []).filter(predicate);
    },
    getAll(type) {
      return byType[type] || [];
    },
  };
}

function rowsOf(dbPath) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(
      `SELECT id, value FROM ${TABLE_NAME} ORDER BY id`).all();
  } finally {
    independent.close();
  }
}

async function withSurface(body) {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const partitionId = 'surface-p1';
  const replicaId = `${partitionId}-r1`;
  const address = `${NODE_ID}/partition/${replicaId}`;
  const dbPath = path.join(directory, 'partition.sqlite');
  const partition = new PartitionService(withFoundingStamp({
    tableId: TABLE_NAME, tableName: TABLE_NAME, partitionId, replicaId,
    replicaIds: [replicaId], nodeId: NODE_ID, dbPath,
    systemTableCache: {
      get: (type, key) => (type === TABLES.TABLES && key === TABLE_NAME ?
        TABLES_ROW : null),
    },
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  }));
  // The router delivers to the partition's own remote-query handler; while
  // `loseNextAnswer` is set, the partition handles the delivery and its
  // answer is lost on the way back.
  // While `forgetRetainedResults` is set, the outcome rows the delivery
  // settled are left as a build that retained no result wrote them.
  const deliveries = {count: 0, loseNextAnswer: false,
    forgetRetainedResults: false};
  try {
    await partition.initialize();
    partition.startElection();
    const engine = new SQLQueryEngine({
      systemCache: systemCacheOf({partitionId, replicaId, address}),
      messageRouter: {
        async deliver(_address, message) {
          deliveries.count += 1;
          const answer = await partition.handleRemoteQuery(message);
          if (deliveries.forgetRetainedResults) {
            deliveries.forgetRetainedResults = false;
            partition.db.exec(FORGET_RETAINED_RESULTS_SQL);
          }
          if (deliveries.loseNextAnswer) {
            deliveries.loseNextAnswer = false;
            throw new Error(LOST_ANSWER);
          }
          return answer;
        },
      },
      cdcIntegrationService: {
        async upsertSystemTableRow() {
          return {success: true};
        },
      },
    });
    engine.persistDistributedWriteOperationRow = async () => ({success: true});
    engine.queryExecutor.leaderRetryDelayMs = EXECUTOR_RETRY_DELAY_MS;
    await body({engine, deliveries, dbPath});
  } finally {
    await partition.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

test('W6: an INSERT whose first answer is lost after it applied, re-sent ' +
  'with its entryId, reaches its client with the row it inserted - never ' +
  'zero rows', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface(async ({engine, deliveries, dbPath}) => {
    const setup = await engine.executeQuery(INSERT_SQL, ['row-0', 'setup']);
    assert.equal(setup.success, true, 'setup: the engine serves an INSERT ' +
      `(${JSON.stringify(setup.error ?? null)})`);
    assert.equal(setup.affectedRows, 1, 'setup: a first answer counts its row');

    deliveries.count = 0;
    deliveries.loseNextAnswer = true;
    const result = await engine.executeQuery(INSERT_SQL, ['row-1', 'v']);
    assert.ok(deliveries.count >= 2, 'setup: the executor sent the same ' +
      `request again after the lost answer (${deliveries.count} deliveries)`);
    assert.deepEqual(rowsOf(dbPath).map((row) => row.id), ['row-0', 'row-1'],
      'the INSERT applied exactly once');
    assert.equal(result.success, true, 'the client is told the INSERT ' +
      `succeeded (${JSON.stringify(result.error ?? null)})`);
    assert.equal(result.affectedRows, 1, 'with the one row it inserted, ' +
      'never zero rows');
  });
});

test('W6: an UPDATE of two rows whose first answer is lost reaches its ' +
  'client with both rows; a genuine zero-row UPDATE stays zero',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface(async ({engine, deliveries, dbPath}) => {
    for (const id of ['a', 'b']) {
      assert.equal((await engine.executeQuery(INSERT_SQL, [id, 'old']))
        .success, true, `setup ${id}`);
    }
    deliveries.count = 0;
    deliveries.loseNextAnswer = true;
    const updated = await engine.executeQuery(UPDATE_SQL, ['new', 'old']);
    assert.ok(deliveries.count >= 2, 'setup: the request was sent again');
    assert.equal(updated.success, true, 'the UPDATE is acknowledged');
    assert.equal(updated.affectedRows, 2, 'with the two rows it updated');
    assert.deepEqual(rowsOf(dbPath).map((row) => row.value), ['new', 'new'],
      'applied once');

    deliveries.loseNextAnswer = true;
    const none = await engine.executeQuery(UPDATE_SQL, ['x', 'absent']);
    assert.equal(none.success, true, 'a zero-row UPDATE is acknowledged');
    assert.equal(none.affectedRows, 0, 'a genuine zero stays zero');
  });
});

// W4: the caller-side classifiers. A control-plane write reaches its owner as
// the CDC service wraps the engine's result (`partitionResult`); every
// control-plane owner decides `applied` through the one canonical classifier
// (the registration birth among them), so the replayed write classifies as
// the write it is: applied, never OBSERVED_STATE_CHANGED with zero rows.
function controlPlaneResultOf(engineResult) {
  return {success: engineResult.success, partitionResult: engineResult};
}

async function registerThrough(write) {
  const observations = {count: 0};
  const outcome = await writeNodeRegistrationAtIncarnation({
    row: {node_id: NODES_ROW_ID},
    bootIncarnation: BOOT_INCARNATION,
    // The joiner's authoritative read is unavailable, as in the lab run.
    observe: async () => {
      observations.count += 1;
      return {available: false, row: null};
    },
    insert: write,
    advance: async () => {
      throw new Error('no advance is planned for an absent row');
    },
  });
  return {outcome, observations: observations.count};
}

test('W4: a replayed control-plane INSERT classifies as applied - by the ' +
  'canonical classifier, the gateway\'s completion state and the ' +
  'registration birth, which confirms without a read-back',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface(async ({engine, deliveries, dbPath}) => {
    assert.equal((await engine.executeQuery(INSERT_SQL, ['row-0', 'setup']))
      .success, true, 'setup');
    let replayed = null;
    deliveries.count = 0;
    const registration = await registerThrough(async () => {
      deliveries.loseNextAnswer = true;
      replayed = await engine.executeQuery(INSERT_SQL, [NODES_ROW_ID, 'v']);
      return controlPlaneResultOf(replayed);
    });
    const classified = classifyControlPlaneMutationResult(
      controlPlaneResultOf(replayed));
    assert.equal(classified.applied, true, 'the canonical classifier says ' +
      `applied (${JSON.stringify(classified)})`);
    assert.equal(classified.zeroAffectedRows, false, 'never zero rows');
    assert.equal(resolveMutationCompletionState(controlPlaneResultOf(replayed)),
      CONTROL_PLANE_MUTATION_OUTCOME.APPLIED, 'the gateway\'s completion ' +
      'state is APPLIED, not OBSERVED_STATE_CHANGED');
    assert.equal(registration.outcome.outcome,
      NODE_REGISTRATION_OUTCOME.ACCEPTED, 'the registration birth is ' +
      `accepted (${JSON.stringify(registration.outcome)})`);
    assert.equal(registration.observations, 1, 'without a read-back: the ' +
      'blind second INSERT is never reached');
    assert.ok(deliveries.count >= 2, 'setup: the INSERT was delivered again ' +
      `after its lost answer (${deliveries.count})`);
    assert.equal(rowsOf(dbPath).filter((row) => row.id === NODES_ROW_ID)
      .length, 1, 'the row was inserted once');
  });
});

test('W4/W5: a replay whose outcome row retains no result reaches the ' +
  'control plane as the named not-retained state - applied, no count - ' +
  'and the registration birth confirms it', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSurface(async ({engine, deliveries}) => {
    assert.equal((await engine.executeQuery(INSERT_SQL, ['row-0', 'setup']))
      .success, true, 'setup');
    let replayed = null;
    const registration = await registerThrough(async () => {
      deliveries.forgetRetainedResults = true;
      deliveries.loseNextAnswer = true;
      replayed = await engine.executeQuery(INSERT_SQL, [NODES_ROW_ID, 'v']);
      return controlPlaneResultOf(replayed);
    });
    assert.equal(replayed.success, true, 'the client is told it succeeded');
    assert.ok(typeof REPLAY.OUTCOME_NOT_RETAINED === 'string' &&
      replayed.settledReplay === REPLAY.OUTCOME_NOT_RETAINED,
    'the engine result names the not-retained state ' +
      `(${JSON.stringify(replayed.settledReplay)})`);
    assert.equal(Object.hasOwn(replayed, 'affectedRows'), false,
      'and carries no count: an unknown count is never zero rows');
    const classified = classifyControlPlaneMutationResult(
      controlPlaneResultOf(replayed));
    assert.equal(classified.applied, true, 'the canonical classifier says ' +
      `applied (${JSON.stringify(classified)})`);
    assert.equal(classified.zeroAffectedRows, false, 'never zero rows');
    assert.equal(resolveMutationCompletionState(controlPlaneResultOf(replayed)),
      CONTROL_PLANE_MUTATION_OUTCOME.APPLIED, 'completion state APPLIED');
    // The classifier decides on the named state, not on the absence of a
    // count: a layer that reports a zero beside it does not make it zero.
    const withReportedZero = classifyControlPlaneMutationResult(
      controlPlaneResultOf({...replayed, affectedRows: 0}));
    assert.equal(withReportedZero.applied && !withReportedZero
      .zeroAffectedRows, true, 'the named state decides, whatever count ' +
      `accompanies it (${JSON.stringify(withReportedZero)})`);
    assert.equal(registration.outcome.outcome,
      NODE_REGISTRATION_OUTCOME.ACCEPTED, 'the registration is accepted');
    assert.equal(registration.observations, 1, 'without a read-back');

    // The UPDATE/DELETE aggregation carries the state the same way.
    deliveries.forgetRetainedResults = true;
    deliveries.loseNextAnswer = true;
    const updated = await engine.executeQuery(UPDATE_SQL, ['w', 'v']);
    assert.equal(updated.success, true, 'the UPDATE is acknowledged');
    assert.equal(updated.settledReplay, REPLAY.OUTCOME_NOT_RETAINED,
      `it names the not-retained state (${JSON.stringify(updated)})`);
    assert.equal(Object.hasOwn(updated, 'affectedRows'), false,
      'and carries no count');
    assert.equal(classifyControlPlaneMutationResult(
      controlPlaneResultOf(updated)).applied, true, 'classified applied');
  });
});
