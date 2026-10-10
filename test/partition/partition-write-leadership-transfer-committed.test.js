// A write served during a leadership transfer is a committed write (quest
// f1-step-down-port, round 2 of the evidence; the property is stated at the
// top of test/raft/raft-rs-backend/transfer-leadership-property.test.js).
//
// While a transfer runs, raft-rs drops every proposal on the leader, and the
// port names that window with the retryable leadership-transfer-in-progress
// answer. The partition write path defers the write through the window. The
// escape route attacked here is a deferral answered as success: whatever the
// write path does inside the window, a write it answers `success` must be a
// write consensus committed. So the answer is checked against what the
// replicas hold, never against the answer itself:
//
//   - the write met the window: the core was asked to propose it more than
//     once (the actual-core-entry observer);
//   - the log position the answer names holds this write in the leader's
//     durable raft log, at or below the durable commit index (read on a
//     connection of the test's own);
//   - the row is in the leader's table and in the table of the follower the
//     group still reaches.
//
// Round 3 adds the other end of the window: a leader whose election timeout
// (the window's length) exceeds the write deferral budget, as production's
// default timing gives a leader at replica index 1. The write then meets the
// budget's end inside the window: it must be answered as the typed deferral
// the router retries, never as success, and nothing of it may be stored.
//
// Real PartitionServices on rs-raft, formed the way production forms a group
// (partition-admitted-group-fixture.js), on the replicas' own clocks. The
// transfer is asked for through the port's own transferLeadership, naming a
// voter cut off from the group, so it can only abort one election timeout
// later.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_VALUE,
} from '../../src/partition/partition-service-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_TABLE} from
  '../../src/raft/raft-rs-durable-store-constants.js';
import {decodeCommittedProposal} from
  '../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {computeReplicaElectionTimeouts} from
  '../../src/raft/replica-election-timeouts.js';
import {setActualCoreEntryObserver} from
  '../../src/raft/raft-rs-runtime-owner.js';
import {recoveryRetryWindowMsOf} from
  '../../src/raft/raft-rs-runtime-tuning.js';

const PARTITION_ID = 'transfer-committed-write';
const TEMP_PREFIX = 'partition-write-transfer-committed-';
const TABLE = 'transfer_committed_rows';
const ROW_ID = 'row-in-window';
const ENTRY_ID = 'write-in-transfer-window';
const PROPOSE_OPERATION = 'propose';
const PAYLOAD_ENCODING = 'base64';
const TEST_TIMEOUT_MS = 60000;
const FORMATION_BUDGET_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 20;
const RAFT_TIMING = Object.freeze({
  heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
// Production's default election timeout for a replica at index 1 of its
// group, derived by the owner that derives it for every partition replica.
const INDEX_ONE_TIMEOUTS = computeReplicaElectionTimeouts({
  replicaId: 'second', replicaIds: ['first', 'second'],
  baseElectionMinMs: PARTITION_SERVICE_VALUE.RAFT_ELECTION_MIN_DEFAULT_MS,
  baseElectionMaxMs: PARTITION_SERVICE_VALUE.RAFT_ELECTION_MAX_DEFAULT_MS,
  electionJitterPerReplicaMs:
    PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS,
});
const PRODUCTION_INDEX_ONE_TIMING = Object.freeze({
  heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  electionTimeoutMinMs: INDEX_ONE_TIMEOUTS.electionMinMs,
  electionTimeoutMaxMs: INDEX_ONE_TIMEOUTS.electionMaxMs,
});
const DEFERRED_ROW_ID = 'row-past-budget';
const DEFERRED_ENTRY_ID = 'write-past-deferral-budget';
const MEMBERS = Object.freeze([
  ['committed-r1', 'committed-node-1'],
  ['committed-r2', 'committed-node-2'],
  ['committed-r3', 'committed-node-3'],
]);

function writeRow(service, id, value) {
  return service.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`,
    params: [id, value],
    entryId: value,
  });
}

function rowOf(service, id) {
  return service.db.prepare(`SELECT value FROM ${TABLE} WHERE id = ?`).get(id);
}

// The leader's durable raft record, on a connection of the test's own: the
// command at one log position, and the commit index.
function decodeEntry(data) {
  return data ? decodeCommittedProposal(Buffer.from(data, PAYLOAD_ENCODING)) :
    null;
}

// Every entry id the normal entries of the leader's durable raft log hold.
function durableEntryIds(dbFile) {
  const independent = new Database(dbFile, {readonly: true});
  try {
    return independent.prepare(
      `SELECT data FROM ${RAFT_RS_TABLE.LOG} ` +
      'WHERE group_id = ? AND entry_type = ?')
      .all(PARTITION_ID, RAFT_RS_ENTRY_TYPE.NORMAL)
      .map((row) => decodeEntry(row.data)?.entryId);
  } finally {
    independent.close();
  }
}

function durableEntryAt(dbFile, logIndex) {
  const independent = new Database(dbFile, {readonly: true});
  try {
    const entry = independent.prepare(
      `SELECT data FROM ${RAFT_RS_TABLE.LOG} ` +
      'WHERE group_id = ? AND log_index = ?')
      .get(PARTITION_ID, logIndex);
    const hard = independent.prepare(
      `SELECT commit_index FROM ${RAFT_RS_TABLE.HARD_STATE} ` +
      'WHERE group_id = ?')
      .get(PARTITION_ID);
    return {
      command: decodeEntry(entry?.data),
      commitIndex: Number(hard?.commit_index ?? 0),
    };
  } finally {
    independent.close();
  }
}

// A formed group whose leader runs a transfer to a voter cut off from it
// (nothing is delivered to it and its clock is stopped), so the transfer can
// only abort, one election timeout after the leader accepted it. `body` gets
// the leader, the follower the group reaches, and the proposals the core was
// asked for while `body` issues its write.
async function withTransferToCutOffVoter(raftTiming, body) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: MEMBERS[0][1]}, raft: raftTiming});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const group = await formAdmittedGroup({
    partitionId: PARTITION_ID, members: MEMBERS, tempPrefix: TEMP_PREFIX,
    serviceOptions: {tableId: TABLE, tableName: TABLE, schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]}},
    budgetMs: FORMATION_BUDGET_MS});
  const [leader, reached, cutOff] = group.services;
  const network = leader.transport;
  const transportDeliver = network.deliver;
  const cutOffAddress = group.addressOf(MEMBERS[2]);
  const proposals = [];
  try {
    assert.equal((await writeRow(leader, 'row-before', 'before')).success,
      true, 'setup: the group serves a write');
    network.deliver = (address, ...rest) => (address === cutOffAddress ?
      Promise.resolve({acknowledged: true}) :
      transportDeliver.call(network, address, ...rest));
    cutOff.raft.stopScheduling();
    const termBefore = leader.raft.readStatus().term;
    const requested = await leader.raft.transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: cutOff.replicaId,
    });
    assert.equal(requested.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `setup: the transfer was accepted (${JSON.stringify(requested)})`);
    assert.equal(requested.reason,
      RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED);
    setActualCoreEntryObserver((entry) => {
      if (entry.groupId === PARTITION_ID &&
          entry.operation === PROPOSE_OPERATION) {
        proposals.push(entry);
      }
    });
    await body({group, leader, reached, termBefore, proposals});
  } finally {
    setActualCoreEntryObserver(null);
    network.deliver = transportDeliver;
    await group.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}

test('a write the leader serves during a leadership transfer is committed: ' +
  'its row is stored and the log position it names holds it',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withTransferToCutOffVoter(RAFT_TIMING, async ({group, leader,
    reached, termBefore, proposals}) => {
    const answer = await writeRow(leader, ROW_ID, ENTRY_ID);
    setActualCoreEntryObserver(null);
    assert.equal(answer.success, true,
      `the write is served after the window (${JSON.stringify(answer)})`);
    assert.equal(rowOf(leader, ROW_ID)?.value, ENTRY_ID,
      'the served row is in the leader\'s table');
    assert.ok(Number.isSafeInteger(answer.logIndex),
      'the served answer names the log position it committed at');
    const durable = durableEntryAt(group.dbFileOf(MEMBERS[0]),
      answer.logIndex);
    assert.equal(durable.command?.entryId, ENTRY_ID,
      'the named log position holds this write');
    assert.ok(durable.commitIndex >= answer.logIndex,
      'the named log position is committed');
    assert.equal(await group.waitFor(() =>
      rowOf(reached, ROW_ID)?.value === ENTRY_ID), true,
    'the follower the group reaches applied the row');
    // Checked last, so a served-without-commit answer fails on what the
    // replicas hold: without this the leg would prove nothing about the
    // window.
    assert.ok(proposals.length > 1,
      'the write met the transfer window and was proposed again ' +
      `(${proposals.length} proposal(s))`);
    const after = leader.raft.readStatus();
    assert.equal(after.role, RAFT_ROLE.LEADER, 'the leader stays in place');
    assert.equal(after.term, termBefore, 'no term moved');
  });
});

test('a write still deferred when its budget ends inside a transfer window ' +
  'is answered as the typed deferral, never success, and nothing of it is ' +
  'stored', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withTransferToCutOffVoter(PRODUCTION_INDEX_ONE_TIMING, async ({group,
    leader, termBefore, proposals}) => {
    assert.ok(recoveryRetryWindowMsOf(leader.raftTimingConfig) >
      PARTITION_SERVICE_DEFAULT.USER_TRANSACTION_WRITE_DEFER_BUDGET_MS,
    'precondition: the transfer window outlasts the write deferral budget');
    const answer = await writeRow(leader, DEFERRED_ROW_ID, DEFERRED_ENTRY_ID);
    setActualCoreEntryObserver(null);
    assert.notEqual(answer.success, true,
      `a write never committed is not served (${JSON.stringify(answer)})`);
    assert.equal(answer.deferRetry, true,
      'it is the typed deferral the router retries');
    const leaderDb = group.dbFileOf(MEMBERS[0]);
    assert.equal(rowOf(leader, DEFERRED_ROW_ID), undefined,
      'nothing of the deferred write is in the leader\'s table');
    assert.equal(durableEntryIds(leaderDb).includes(DEFERRED_ENTRY_ID), false,
      'nothing of the deferred write is in the leader\'s raft log');
    assert.ok(proposals.length > 1,
      'the write met the transfer window and was proposed again ' +
      `(${proposals.length} proposal(s))`);
    assert.equal(await group.waitFor(async () =>
      (await writeRow(leader, 'row-after', 'after-window')).success === true),
    true, 'the leader takes writes again once the transfer aborted');
    assert.equal(rowOf(leader, DEFERRED_ROW_ID), undefined,
      'the deferred write was not proposed again behind its answer');
    assert.equal(durableEntryIds(leaderDb).includes(DEFERRED_ENTRY_ID), false);
    const after = leader.raft.readStatus();
    assert.equal(after.role, RAFT_ROLE.LEADER, 'the leader stays in place');
    assert.equal(after.term, termBefore, 'no term moved');
  });
});
