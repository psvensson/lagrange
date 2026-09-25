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
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {decodeCommittedProposal} from
  '../../src/raft/raft-rs-proposal-codec.js';
import {setActualCoreEntryObserver} from
  '../../src/raft/raft-rs-runtime-owner.js';

const PARTITION_ID = 'transfer-committed-write';
const TEMP_PREFIX = 'partition-write-transfer-committed-';
const TABLE = 'transfer_committed_rows';
const ROW_ID = 'row-in-window';
const ENTRY_ID = 'write-in-transfer-window';
const PROPOSE_OPERATION = 'propose';
const PAYLOAD_ENCODING = 'base64';
const TEST_TIMEOUT_MS = 60000;
const FORMATION_BUDGET_MS = 10000;
const RAFT_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
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
function durableEntryAt(dbFile, logIndex) {
  const independent = new Database(dbFile, {readonly: true});
  try {
    const entry = independent.prepare(
      'SELECT data FROM _raft_rs_log WHERE group_id = ? AND log_index = ?')
      .get(PARTITION_ID, logIndex);
    const hard = independent.prepare(
      'SELECT commit_index FROM _raft_rs_hard_state WHERE group_id = ?')
      .get(PARTITION_ID);
    return {
      command: entry?.data ? decodeCommittedProposal(
        Buffer.from(entry.data, PAYLOAD_ENCODING)) : null,
      commitIndex: Number(hard?.commit_index ?? 0),
    };
  } finally {
    independent.close();
  }
}

test('a write the leader serves during a leadership transfer is committed: ' +
  'its row is stored and the log position it names holds it',
{timeout: TEST_TIMEOUT_MS}, async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: MEMBERS[0][1]}, raft: RAFT_TIMING});
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
  } finally {
    setActualCoreEntryObserver(null);
    network.deliver = transportDeliver;
    await group.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
