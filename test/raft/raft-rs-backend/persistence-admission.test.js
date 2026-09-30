// Consensus persistence never runs inside a transaction the rs-raft store did
// not open (quest raft-rs-single-path-partition-cutover, F6 layer 1,
// witnesses W3-W5 of the session-transaction isolation design).
//
// The partition hands its one SQLite connection to the rs-raft store; a user
// session holds `BEGIN` on that same connection across round trips. Anything
// the store writes while that transaction is open becomes a savepoint of the
// session, and the session's ROLLBACK erases it. These witnesses open the
// transaction themselves on the replica's own connection and read every
// expectation from production: the operation port's outcome and readStatus,
// the store owner's typed vocabulary, and the durable record read on an
// independent read-only connection to the same file.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import * as storeVocabulary from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import * as runtimeVocabulary from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {decodeCommittedProposal} from
  '../../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';

const TEMP_PREFIX = 'raft-rs-persistence-admission-';
const DB_FILE = 'store.sqlite';
const PAYLOAD_ENCODING = 'base64';
const BEGIN = 'BEGIN';
const COMMIT = 'COMMIT';
const ROLLBACK = 'ROLLBACK';
const SETTLE_ROUNDS = 400;
const SESSION_ROUNDS = 20;
const STORE_GROUP = 'admission-store-group';
// Inputs: a Ready and a configuration shaped as the core hands them.
const CONF_STATE = Object.freeze({
  voters: ['1'], learners: [], votersOutgoing: [], learnersNext: [],
  autoLeave: false,
});
const READY = Object.freeze({
  entries: [{index: '1', term: '1', entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
    data: Buffer.from('"inside-a-user-transaction"').toString(
      PAYLOAD_ENCODING)}],
  hardState: {term: '1', vote: '1', commit: '1'},
});

/**
 * One group's durable record on an independent read-only connection.
 * @param {string} dbFile - The database file.
 * @param {string} groupId - The group.
 * @return {Object} Hard state, applied index and entries as stored.
 */
function durableRecordOf(dbFile, groupId) {
  const independent = new Database(dbFile, {readonly: true});
  try {
    const present = (name) => independent.prepare(
      'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?')
      .get(name) !== undefined;
    const hard = present('_raft_rs_hard_state') ? independent.prepare(
      'SELECT term, vote, commit_index FROM _raft_rs_hard_state ' +
      'WHERE group_id = ?').get(groupId) : undefined;
    const applied = present('_raft_rs_applied_state') ? independent.prepare(
      'SELECT applied_index FROM _raft_rs_applied_state WHERE group_id = ?')
      .get(groupId) : undefined;
    const entries = present('_raft_rs_log') ? independent.prepare(
      'SELECT log_index, term, entry_type, data FROM _raft_rs_log ' +
      'WHERE group_id = ? ORDER BY log_index').all(groupId) : [];
    return {
      commitIndex: hard === undefined ? null : String(hard.commit_index),
      appliedIndex: applied === undefined ? null :
        String(applied.applied_index),
      entries: entries.map((row) => ({
        index: String(row.log_index),
        term: String(row.term),
        entryType: Number(row.entry_type),
        command: row.data === null ? null : decodeCommittedProposal(
          Buffer.from(row.data, PAYLOAD_ENCODING)),
      })),
    };
  } finally {
    independent.close();
  }
}

function payloadCommands(record) {
  return record.entries
    .filter((entry) => entry.entryType === RAFT_RS_ENTRY_TYPE.NORMAL &&
      entry.command !== null)
    .map((entry) => entry.command);
}

function refusalOf(attempt) {
  try {
    attempt();
    return 'persisted inside the open transaction';
  } catch (error) {
    return error?.code ?? `untyped: ${error?.message}`;
  }
}

function electLoneLeader(cluster, replicaId) {
  cluster.node(replicaId).campaign();
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() === replicaId),
    true, 'a lone voter elects itself');
}

function electLeader(cluster) {
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null,
    {rounds: SETTLE_ROUNDS}), true, 'the group elects a leader');
  return cluster.leaderReplicaId();
}

test('W3 the rs-raft store refuses every durable write inside a transaction ' +
  'it did not open (RaftRsDurableStore persistence admission)', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const dbFile = path.join(directory, DB_FILE);
  const db = new Database(dbFile);
  try {
    const store = new RaftRsDurableStore(db);
    const before = durableRecordOf(dbFile, STORE_GROUP);
    db.exec(BEGIN);
    const refusals = {
      persistReady: refusalOf(() => store.persistReady(STORE_GROUP, READY)),
      putCommitIndex: refusalOf(() => store.putCommitIndex(STORE_GROUP, '1')),
      putAppliedState: refusalOf(() =>
        store.putAppliedState(STORE_GROUP, '1', CONF_STATE)),
      transaction: refusalOf(() => store.transaction(() => undefined)),
    };
    db.exec(COMMIT);
    const after = durableRecordOf(dbFile, STORE_GROUP);
    // The typed code is the store owner's; a tree without one is red here.
    const typedCode =
      storeVocabulary.RAFT_RS_STORE_ERROR_CODE?.USER_TRANSACTION_OPEN;
    assert.equal(typeof typedCode === 'string' && typedCode.length > 0, true,
      'the store owner names a typed refusal for a user transaction; ' +
      `observed refusals: ${JSON.stringify(refusals)}`);
    assert.deepEqual({refusals, record: after}, {
      refusals: {
        persistReady: typedCode,
        putCommitIndex: typedCode,
        putAppliedState: typedCode,
        transaction: typedCode,
      },
      record: before,
    }, 'nothing the store writes can become part of a transaction it did ' +
      'not open');
    // Outside a user transaction the same store writes normally.
    store.persistReady(STORE_GROUP, READY);
    assert.equal(durableRecordOf(dbFile, STORE_GROUP).commitIndex,
      READY.hardState.commit, 'the store persists once the connection is free');
  } finally {
    db.close();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('W4 a lone leader defers a proposal while a user transaction holds its ' +
  'connection, stays usable, and commits it after (runtime owner admission)',
async () => {
  const cluster = new PartitionNodeCluster({
    partitionId: 'admission-lone-leader', replicaIds: ['solo']});
  try {
    electLoneLeader(cluster, 'solo');
    const replica = cluster.replica('solo');
    const baseline = await cluster.propose('solo', 'before-the-session');
    assert.equal(baseline.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    const statusBefore = cluster.node('solo').readStatus();
    const recordBefore = durableRecordOf(replica.dbFile,
      cluster.partitionId);

    replica.db.exec(BEGIN);
    const refused = await cluster.propose('solo', 'during-the-session');
    const statusDuring = cluster.node('solo').readStatus();
    replica.db.exec(ROLLBACK);
    const recordAfterSession = durableRecordOf(replica.dbFile,
      cluster.partitionId);

    const accepted = await cluster.propose('solo', 'after-the-session');
    const statusAfter = cluster.node('solo').readStatus();
    const recordAfter = durableRecordOf(replica.dbFile, cluster.partitionId);

    assert.deepEqual({
      outcome: refused.outcome,
      phase: refused.phase,
      reason: refused.reason,
      retryable: refused.retryable,
      recoveryRequired: refused.recoveryRequired,
    }, {
      outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      phase: runtimeVocabulary.RUNTIME_PHASE.READY_PERSISTENCE,
      reason: runtimeVocabulary.RUNTIME_REASON.USER_TRANSACTION_OPEN ??
        'a named user-transaction-open reason in the runtime owner',
      retryable: true,
      recoveryRequired: false,
    }, 'a proposal while a user transaction is open is a typed, retryable ' +
      `deferral: ${JSON.stringify(refused)}`);
    assert.deepEqual({
      outcome: statusDuring.outcome,
      commitIndex: statusDuring.commitIndex,
      groupHealth: statusDuring.groupHealth,
    }, {
      outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
      commitIndex: statusBefore.commitIndex,
      groupHealth: runtimeVocabulary.USABLE,
    }, 'the group stays usable and its core did not move during the session');
    assert.deepEqual(recordAfterSession, recordBefore,
      'the session rolled back nothing of consensus: the durable record is ' +
      'the pre-session record');
    assert.equal(accepted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `the proposal after the session is accepted: ${JSON.stringify(accepted)}`);
    assert.deepEqual({
      commitIndex: recordAfter.commitIndex,
      appliedIndex: recordAfter.appliedIndex,
      commands: payloadCommands(recordAfter),
    }, {
      commitIndex: String(statusAfter.commitIndex),
      appliedIndex: String(statusAfter.commitIndex),
      commands: ['before-the-session', 'after-the-session'],
    }, 'the durable record equals the core after the session');
  } finally {
    cluster.dispose();
  }
});

test('W5 a three-replica leader persists no Ready while a user transaction ' +
  'holds its connection and converges after the session ends', async () => {
  const cluster = new PartitionNodeCluster({
    partitionId: 'admission-three-replicas',
    replicaIds: ['alpha', 'beta', 'gamma']});
  try {
    const leader = electLeader(cluster);
    const followers = [...cluster.replicas.keys()]
      .filter((replicaId) => replicaId !== leader);
    const leaderReplica = cluster.replica(leader);
    // The leader appends and sends; the followers answer into the leader's
    // inbox, so the leader has consensus work waiting when the session opens.
    const proposed = await cluster.propose(leader, 'replicated-command');
    assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    for (const follower of followers) {
      const pending = cluster.replica(follower).inbox.splice(0);
      for (const envelope of pending) {
        cluster.node(follower).step(envelope);
      }
      cluster.node(follower).tick();
    }
    const statusBefore = cluster.node(leader).readStatus();

    leaderReplica.db.exec(BEGIN);
    cluster.settle(() => false, {rounds: SESSION_ROUNDS});
    const statusDuring = cluster.node(leader).readStatus();
    leaderReplica.db.exec(ROLLBACK);

    const converged = cluster.settle(() => {
      const commits = [...cluster.replicas.keys()].map((replicaId) =>
        cluster.node(replicaId).readStatus().commitIndex);
      return new Set(commits).size === 1 && commits[0] >
        statusBefore.commitIndex;
    }, {rounds: SETTLE_ROUNDS});
    const perReplica = Object.fromEntries([...cluster.replicas.keys()]
      .map((replicaId) => {
        const status = cluster.node(replicaId).readStatus();
        const record = durableRecordOf(cluster.dbFileOf(replicaId),
          cluster.partitionId);
        return [replicaId, {
          core: String(status.commitIndex),
          durableCommit: record.commitIndex,
          durableApplied: record.appliedIndex,
          lastCommand: payloadCommands(record).at(-1) ?? null,
        }];
      }));

    assert.deepEqual({
      commitIndex: statusDuring.commitIndex,
      groupHealth: statusDuring.groupHealth,
    }, {
      commitIndex: statusBefore.commitIndex,
      groupHealth: runtimeVocabulary.USABLE,
    }, 'the leader drains nothing while the user transaction is open');
    assert.equal(converged, true,
      `the group converges after the session: ${JSON.stringify(perReplica)}`);
    for (const [replicaId, observed] of Object.entries(perReplica)) {
      assert.deepEqual(observed, {
        core: observed.core,
        durableCommit: observed.core,
        durableApplied: observed.core,
        lastCommand: 'replicated-command',
      }, `${replicaId}: its durable record equals its core ` +
        `(${JSON.stringify(perReplica)})`);
    }
  } finally {
    cluster.dispose();
  }
});

test('W7 a Ready taken before a user transaction opened finishes its ' +
  'durable writes only after the session ends, without a runtime ' +
  'reconstruction (runtime owner admission across an asynchronous send)',
async () => {
  const held = [];
  let holdSends = false;
  let cluster = null;
  cluster = new PartitionNodeCluster({
    partitionId: 'admission-async-send',
    replicaIds: ['alpha', 'beta', 'gamma'],
    sendFor: (fromReplicaId, address, envelope) => holdSends ?
      new Promise((resolve) => held.push(() => {
        cluster.queue(fromReplicaId, address, envelope);
        resolve(undefined);
      })) : undefined,
  });
  try {
    const leader = electLeader(cluster);
    const followers = [...cluster.replicas.keys()]
      .filter((replicaId) => replicaId !== leader);
    const leaderReplica = cluster.replica(leader);
    const proposed = await cluster.propose(leader, 'committed-across-send');
    assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    for (const follower of followers) {
      for (const envelope of cluster.replica(follower).inbox.splice(0)) {
        cluster.node(follower).step(envelope);
      }
      cluster.node(follower).tick();
    }
    // Read before the acknowledgements are stepped in: a status read drives
    // delivered inbound, which would take the Ready here.
    const statusBefore = cluster.node(leader).readStatus();
    for (const envelope of leaderReplica.inbox.splice(0)) {
      cluster.node(leader).step(envelope);
    }

    // The leader takes the Ready that commits the entry and sends its
    // commit notification; the send is still in flight when the session
    // opens on the leader's connection.
    holdSends = true;
    let settled = null;
    const ticked = Promise.resolve(cluster.node(leader).tick())
      .then((result) => {
        settled = result;
        return result;
      });
    await new Promise((resolve) => setImmediate(resolve));
    const sendsInFlight = held.length;
    leaderReplica.db.exec(BEGIN);
    while (held.length > 0) {
      held.shift()();
      await new Promise((resolve) => setImmediate(resolve));
    }
    // Let several admission polls pass without arming a timer of this test:
    // yield through the check phase, so the ROLLBACK below also runs there
    // and no expiring timer of ours can carry the loop past it.
    const pollsElapseAt = Date.now() +
      runtimeVocabulary.PERSISTENCE_ADMISSION_WAIT.POLL_INTERVAL_MS * 5;
    while (Date.now() < pollsElapseAt) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const statusDuring = cluster.node(leader).readStatus();
    const settledDuringSession = settled;
    leaderReplica.db.exec(ROLLBACK);
    holdSends = false;
    // From here the held Ready is the only pending work: no send is in
    // flight, no timer of this test is armed and the port schedules no ticks
    // (the cluster defers election), so only the runtime's own admission wait
    // can keep the process alive until the Ready completes.
    assert.equal(held.length, 0, 'no send is still in flight');
    const finished = await ticked;

    const converged = cluster.settle(() => {
      const commits = [...cluster.replicas.keys()].map((replicaId) =>
        cluster.node(replicaId).readStatus().commitIndex);
      return new Set(commits).size === 1 &&
        commits[0] > statusBefore.commitIndex;
    }, {rounds: SETTLE_ROUNDS});
    const statusAfter = cluster.node(leader).readStatus();
    const leaderRecord = durableRecordOf(leaderReplica.dbFile,
      cluster.partitionId);

    assert.ok(sendsInFlight > 0,
      'precondition: the Ready had a send in flight when the session opened');
    assert.deepEqual({
      settledDuringSession,
      groupHealthDuring: statusDuring.groupHealth,
      finished: finished?.outcome,
      converged,
      runtimeGeneration: statusAfter.runtimeGeneration,
      durableCommit: leaderRecord.commitIndex,
      durableApplied: leaderRecord.appliedIndex,
      lastCommand: payloadCommands(leaderRecord).at(-1) ?? null,
    }, {
      settledDuringSession: null,
      groupHealthDuring: runtimeVocabulary.USABLE,
      finished: RAFT_OPERATION_OUTCOME.CORE_OK,
      converged: true,
      runtimeGeneration: statusBefore.runtimeGeneration,
      durableCommit: String(statusAfter.commitIndex),
      durableApplied: String(statusAfter.commitIndex),
      lastCommand: 'committed-across-send',
    }, 'the taken Ready waited for the session and then completed; the ' +
      `runtime was never reconstructed (finished ${JSON.stringify(finished)})`);
  } finally {
    cluster.dispose();
  }
});
