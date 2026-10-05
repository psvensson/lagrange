// The consumers of a partition write's answer ask its one owner (quest
// raft-rs-single-path-partition-cutover, B7 / F-am and the F-aj reach after
// verification round 6).
//
// The control plane's retry classification treats a write that did not fail
// for good - one released at its commit deadline, proposed (its outcome is
// not known) or not - as retryable, so the SQL engine never records it as a
// failed write-operation row. A router that sends a write again without its
// entryId never does so for an unknown outcome: the query executor, which
// holds only the answer's text, answers its client the unknown outcome once
// instead of re-proposing the statement under a fresh id (which applied it
// twice); a router that holds the code re-proposes it only under the write's
// own entryId, where the retry is idempotent.
//
// The answers are production's: the write kernel's builders, a partition
// whose proposal is accepted and never committed released at its own
// pending-commit deadline on its own (virtual) clock, and a real admitted
// three-replica group on the loopback transport whose leader loses its
// leadership while a statement it proposed is committed by its successor
// (the verifier's r5-g2-dup shape, with the executor in the loop). Every
// expectation is the owners' (the classifier, the kernel, the partition's
// defaults) or read from the replicas' own databases.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from
  '../partition/partition-admitted-group-fixture.js';
import {createControllablePartitionService} from
  '../partition/partition-service-test-support.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {ERRORS} from '../../src/constants/errors.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import * as partitionWriteKernel from
  '../../src/partition/partition-write-kernel.js';
import {PARTITION_SETTLED_REPLAY} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {PROPOSAL_QUEUE_PROPOSAL_STATE} from
  '../../src/partition/proposal-queue-constants.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_RS_SQL} from '../../src/raft/raft-rs-durable-store-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const TEMP_PREFIX = 'partition-write-answer-consumers-';
const TEST_TIMEOUT_MS = 30000;
const GROUP_BUDGET_MS = 10000;
const VIRTUAL_START_MS = 1000000;
const EXECUTOR_BUDGET_MS = 8000;
const EXECUTOR_RETRY_DELAY_MS = 5;
const SETTLE_MS = 300;
const TABLE_NAME = 'answer_rows';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const APPEND_SQL = `UPDATE ${TABLE_NAME} SET value = value || '+' ` +
  'WHERE id = ?';
const APPEND_ROW_SQL = `UPDATE ${TABLE_NAME} SET value = value || '+' ` +
  'WHERE id = \'row-0\'';
// A test clock of the configuration's own (the verifier's group timing).
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});

function quietEnvironment(raft = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'answer-consumer-node'}, raft});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tableOptions() {
  return {
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  };
}

// A system cache holding one partition, its leader and its services.
function systemCacheOf({partitionId, leaderNodeId, services}) {
  return {
    tables: [{table_name: TABLE_NAME, primaryKey: 'id'}],
    partitions: [{
      partition_id: partitionId,
      table_name: TABLE_NAME,
      leader_node_id: leaderNodeId,
      partition_key_start: null,
      partition_key_end: null,
    }],
    services,
    get(type, key) {
      if (type === 'tables') {
        return this.tables.find((table) => table.table_name === key);
      }
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === 'partitions') {
        return this.partitions;
      }
      if (type === 'tables') {
        return this.tables;
      }
      if (type === 'services') {
        return this.services;
      }
      return [];
    },
  };
}

function serviceRow({replicaId, nodeId, address, role}) {
  return {
    service_id: replicaId,
    service_type: 'partition',
    partition_id: replicaId.replace(/-r\d+$/u, ''),
    node_id: nodeId,
    raft_role: role,
    address,
    status: 'active',
  };
}

test('B7 / F-am: the SQL engine never records a partition write released ' +
  'at its commit deadline as a failed write-operation row',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const partitionId = 'fam-deadline';
  const replicaId = `${partitionId}-r1`;
  const nodeId = 'answer-consumer-node';
  const address = `${nodeId}/partition/${replicaId}`;
  const clock = new VirtualTimeSource({startMs: VIRTUAL_START_MS});
  const partition = createControllablePartitionService({
    ...tableOptions(), partitionId, replicaId, replicaIds: [replicaId],
    nodeId, dbPath: path.join(directory, 'partition.sqlite'),
    timeSource: clock,
  });
  try {
    await partition.initialize();
    // The partition answers the routed write when its own clock passes its
    // pending-commit deadline (its proposal is accepted, never committed).
    const engine = new SQLQueryEngine({
      systemCache: systemCacheOf({partitionId, leaderNodeId: nodeId,
        services: [serviceRow({replicaId, nodeId, address,
          role: 'leader'})]}),
      messageRouter: {
        async deliver(_address, message) {
          const answer = partition.handleRemoteQuery(message);
          await new Promise((resolve) => setImmediate(resolve));
          clock.advance(PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS);
          return answer;
        },
      },
      cdcIntegrationService: {
        async upsertSystemTableRow() {
          return {success: true};
        },
      },
    });
    const recorded = [];
    engine.persistDistributedWriteOperationRow = async (record) => {
      recorded.push(record);
      return {success: true};
    };
    const tracked = [];
    const fire = engine.fireNonTransactionalWriteResult.bind(engine);
    engine.fireNonTransactionalWriteResult = (writePlan, type, result) => {
      tracked.push({writePlan, type, result});
      return fire(writePlan, type, result);
    };
    const routed = await engine.executeQuery(INSERT_SQL, ['row-a', 'a']);
    assert.equal(routed.success, false, 'setup: the routed write was ' +
      `released at its deadline (${JSON.stringify(routed.error)})`);
    assert.equal(tracked.length, 1, 'setup: the engine tracked its result');
    assert.deepEqual(recorded, [], 'the routed release is not recorded as ' +
      'a failed write');

    // The deadline's two answers, as the write kernel builds them, reaching
    // the engine's tracking as the answer and as an Error of its text.
    const {PARTITION_WRITE_RELEASE_CAUSE: CAUSE,
      buildReleasedPendingWriteAnswer} = partitionWriteKernel;
    const deadline = {cause: CAUSE?.COMMIT_DEADLINE_EXCEEDED,
      deadlineMs: PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS};
    const {writePlan, type} = tracked[0];
    for (const proposal of [PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED,
      PROPOSAL_QUEUE_PROPOSAL_STATE.QUEUED]) {
      const answer = buildReleasedPendingWriteAnswer({entryId: 'fam-entry',
        proposal, logIndex: null}, partitionId, deadline);
      engine.fireNonTransactionalWriteResult(writePlan, type, answer);
      await engine.recordWriteExecutionFailure({writePlan,
        statementType: type, tableName: TABLE_NAME,
        error: new Error(answer.error)});
      assert.deepEqual(recorded, [], `a ${proposal} write released at its ` +
        `deadline (${answer.failureCode}) is not recorded as a failed ` +
        'write, as the answer or as an Error of its text');
    }
  } finally {
    await partition.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});

// The r5-g2-dup shape. r1 leads and proposes A; its appends reach r2 only
// and no follower's answer reaches r1, so A is on r1's and r2's logs,
// uncommitted. r2 comes to lead (it holds A, so r3 votes for it) and commits
// A. When traffic heals r1 sees the higher term and stops leading, which
// releases A: its outcome is not known to r1.
async function withPartitionedLeader(body) {
  quietEnvironment(GROUP_TIMING);
  const partitionId = 'faj-dup';
  const members = [
    [`${partitionId}-r1`, 'node-1'],
    [`${partitionId}-r2`, 'node-2'],
    [`${partitionId}-r3`, 'node-3'],
  ];
  const group = await formAdmittedGroup({
    partitionId, members, tempPrefix: TEMP_PREFIX,
    serviceOptions: tableOptions(), budgetMs: GROUP_BUDGET_MS,
  });
  const [r1] = group.services;
  const network = r1.transport;
  const deliver = network.deliver;
  const blocked = new Set();
  network.deliver = (address, envelope, ...rest) => {
    const packet = envelope?.payload ?? envelope;
    return blocked.has(`${packet?.from}>${packet?.to}`) ?
      Promise.resolve({acknowledged: true}) :
      deliver.call(network, address, envelope, ...rest);
  };
  try {
    await body({...group, members, partitionId, blocked});
  } finally {
    network.deliver = deliver;
    await group.dispose();
    resetEnvironment();
  }
}

function rowValue(dbPath, id) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(
      `SELECT value FROM ${TABLE_NAME} WHERE id = ?`).get(id)?.value ?? null;
  } finally {
    independent.close();
  }
}

function logLength(dbPath, groupId) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(RAFT_RS_SQL.SELECT_LOG_ENTRIES).all(groupId)
      .length;
  } finally {
    independent.close();
  }
}

test('F-aj: the query executor answers an unknown outcome to its client ' +
  'once and never sends the statement again without its entryId; a ' +
  'router holding the code re-proposes it only under its entryId, ' +
  'idempotently', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withPartitionedLeader(async ({services, members, partitionId,
    dbFileOf, addressOf, waitFor, blocked}) => {
    const [r1, r2] = services;
    const insert = (service, id, value, entryId) => service.applyWrite({
      type: PARTITION_SERVICE_OPERATION.INSERT, sql: INSERT_SQL,
      params: [id, value], entryId});
    const append = (service, id, entryId) => service.applyWrite({
      type: PARTITION_SERVICE_OPERATION.UPDATE, sql: APPEND_SQL,
      params: [id], entryId});
    const values = (id) => members.map((member) =>
      rowValue(dbFileOf(member), id));
    assert.equal((await insert(r1, 'row-0', 'v', 'faj-0')).success, true,
      'setup: the group serves a write');
    assert.equal((await insert(r1, 'row-1', 'v', 'faj-1')).success, true,
      'setup: and another');
    assert.equal(await waitFor(() => values('row-1').every((value) =>
      value === 'v')), true, 'setup: every replica applied them');
    const [p1, p2, p3] = services.map((service) =>
      String(service.raft.readStatus().peerId));
    for (const pair of [`${p1}>${p3}`, `${p2}>${p1}`, `${p3}>${p1}`]) {
      blocked.add(pair);
    }

    const sent = [];
    const executor = new QueryExecutor({
      systemCache: systemCacheOf({partitionId, leaderNodeId: members[0][1],
        services: members.map((member, index) => serviceRow({
          replicaId: member[0], nodeId: member[1],
          address: addressOf(member),
          role: index === 0 ? 'leader' : 'follower'}))}),
      messageRouter: {
        async deliver(address, message) {
          sent.push(address);
          return services[members.findIndex((member) =>
            addressOf(member) === address)].handleRemoteQuery(message);
        },
      },
    });
    executor.leaderRetryDelayMs = EXECUTOR_RETRY_DELAY_MS;
    const startedAtMs = Date.now();
    const clientWrite = executor.executeOnPartition(partitionId,
      APPEND_ROW_SQL, [], false, false, false, {
        timeoutMs: EXECUTOR_BUDGET_MS,
        timeoutBudget: {configuredBudgetMs: EXECUTOR_BUDGET_MS, startedAtMs,
          deadlineMs: startedAtMs + EXECUTOR_BUDGET_MS},
      });
    // B: a write a router holds, with its entryId, in the same state.
    const heldWrite = append(r1, 'row-1', 'faj-B');
    assert.equal(await waitFor(() => logLength(dbFileOf(members[1]),
      partitionId) === logLength(dbFileOf(members[0]), partitionId) &&
      logLength(dbFileOf(members[1]), partitionId) >
      logLength(dbFileOf(members[2]), partitionId) + 1), true,
    'setup: both proposals reached r2 and not r3');
    await r2.raft.campaign();
    assert.equal(await waitFor(() => r2.raft.readStatus().role ===
      RAFT_ROLE.LEADER), true, 'setup: r2 leads');
    assert.equal(await waitFor(() => values('row-0')[1] === 'v+' &&
      values('row-0')[2] === 'v+' && values('row-1')[1] === 'v+'), true,
    'setup: r2 committed both proposals once');
    blocked.clear();

    const answered = await clientWrite;
    const held = await heldWrite;
    assert.equal(await waitFor(() => new Set(values('row-0')).size === 1),
      true, `setup: the replicas converged on A (${values('row-0')})`);
    await sleep(SETTLE_MS);
    assert.deepEqual(values('row-0'), ['v+', 'v+', 'v+'],
      'A applied once on every replica: the executor did not send it again');
    assert.deepEqual(sent, [addressOf(members[0])],
      'the executor sent the statement once');
    assert.equal(answered.success, false, 'its client is not told it ' +
      'succeeded');
    assert.ok(String(answered.error).includes(ERRORS.WRITE_OUTCOME_UNKNOWN),
      `its client is told the outcome is unknown (${answered.error})`);

    const {PARTITION_WRITE_LEADERSHIP_REFUSAL: REFUSAL,
      isReroutableWriteFailureCode} = partitionWriteKernel;
    assert.equal(held.failureCode, REFUSAL.OUTCOME_UNKNOWN,
      `setup: B was released with an unknown outcome (${JSON.stringify(held)})`);
    assert.equal(isReroutableWriteFailureCode(held.failureCode), false,
      'a router without B\'s entryId does not route it again');
    assert.equal(isReroutableWriteFailureCode(held.failureCode,
      {carriesEntryId: true}), true, 'one carrying it does');
    const leader = services.find((service) =>
      service.raft.readStatus().role === RAFT_ROLE.LEADER);
    const rerouted = await append(leader, 'row-1', held.entryId);
    assert.equal(rerouted.success, true, 'the re-proposal under B\'s entryId ' +
      `is answered (${JSON.stringify(rerouted)})`);
    assert.equal(rerouted.settledReplay,
      PARTITION_SETTLED_REPLAY.OUTCOME_RETAINED,
      'from B\'s durable outcome row');
    assert.equal(rerouted.changes, 1, 'with the row B updated');
    assert.equal(await waitFor(() => values('row-1').every((value) =>
      value === 'v+')), true, 'B applied once on every replica ' +
      `(${values('row-1')})`);
  });
});
