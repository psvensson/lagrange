// The durable record of a reseed hold (C2 of the identity-reuse correction;
// the verifier's R3): the hold is in force in memory at once, and its
// lifecycle row is written by the group's own later operations and
// deliveries until a write lands - never abandoned, never by a timer of its
// own - with one ERROR line on the first failure. A later retirement keeps
// the reseed reason. Real rs-raft ports on the real WASM core, the real
// lifecycle owner on a real SQLite file; the store failure is an injected
// SQLITE_BUSY on the lifecycle UPDATE only.
//
//   D1  N failed hold writes, then a write that lands: the row is
//       retired/reseed-required, the replica refused reseed-required
//       throughout, one ERROR line for the failures;
//   D2  a crash while every hold write fails: the reopened replica's row is
//       active (the window), and its legitimate leader's first heartbeat
//       holds it again, durably;
//   D3  a retirement that waited on a turn which held the replica keeps the
//       reseed-required reason (the last writer no longer wins).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {
  capturingErrors,
  formedCluster,
  lifecycleRow,
} from './identity-reuse-harness.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {RUNTIME_FAULT_REPORT} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RaftRsReplicaLifecycleOwner} from
  '../../../src/raft/raft-rs-replica-lifecycle-owner.js';

const RESEED_REQUIRED = COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED;
const FORMED_ENTRIES = 12;
const FAILED_WRITES = 3;
const ROUNDS = 40;
const LIFECYCLE_UPDATE = /UPDATE _raft_rs_replica_lifecycle/u;

// Re-open `replicaId` empty (the defect's shape) on a database whose
// lifecycle UPDATE throws SQLITE_BUSY while `failures.remaining` > 0.
function reopenEmptyWithFailingHold(cluster, replicaId, failures) {
  const replica = cluster.replica(replicaId);
  replica.node.close();
  replica.db.close();
  fs.rmSync(cluster.dbFileOf(replicaId), {force: true});
  cluster.wrapDatabase = (id, db) => {
    if (id !== replicaId) {
      return db;
    }
    const prepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      if (failures.remaining > 0 && LIFECYCLE_UPDATE.test(sql)) {
        failures.remaining -= 1;
        failures.thrown += 1;
        throw Object.assign(new Error('SQLITE_BUSY: database is locked'),
          {code: 'SQLITE_BUSY'});
      }
      return prepare(sql);
    };
    return db;
  };
  cluster.buildReplica(replicaId, cluster.replicaIds.slice(0, 3),
    replica.extraRequest);
}

function holdWriteFailures(lines) {
  return lines.filter(({context}) =>
    context.report === RUNTIME_FAULT_REPORT.RESEED_HOLD_WRITE_FAILED);
}

test('D1: failed hold writes are asked again by the group\'s own ' +
  'deliveries until one lands; one ERROR line', async () => {
  const cluster = formedCluster('d1', ['d1-a', 'd1-b', 'd1-c'],
    FORMED_ENTRIES);
  try {
    const failures = {remaining: FAILED_WRITES, thrown: 0};
    let midway = null;
    const lines = await capturingErrors(async () => {
      reopenEmptyWithFailingHold(cluster, 'd1-c', failures);
      cluster.tickers = ['d1-a'];
      cluster.settle(() => failures.thrown >= 1, {rounds: ROUNDS});
      midway = {row: lifecycleRow(cluster, 'd1-c'),
        status: cluster.node('d1-c').readStatus()};
      cluster.settle(() => failures.remaining === 0 &&
        lifecycleRow(cluster, 'd1-c')?.state === 'retired', {rounds: ROUNDS});
    });
    assert.equal(midway.row?.state, 'active',
      'setup: the first hold write did not fail');
    assert.equal(midway.status.reason, RESEED_REQUIRED,
      'the hold lapsed while its write failed');
    assert.equal(failures.thrown, FAILED_WRITES);
    assert.deepEqual(lifecycleRow(cluster, 'd1-c'),
      {state: 'retired', reason: RESEED_REQUIRED});
    const failed = holdWriteFailures(lines);
    assert.equal(failed.length, 1, JSON.stringify(failed));
    assert.equal(failed[0].context.code, 'SQLITE_BUSY');
    assert.equal(failed[0].context.groupId, cluster.partitionId);
  } finally {
    cluster.dispose();
  }
});

test('D2: a crash while the hold is not yet durable reopens the replica ' +
  'active; its leader\'s first heartbeat holds it again, durably',
async () => {
  const cluster = formedCluster('d2', ['d2-a', 'd2-b', 'd2-c'],
    FORMED_ENTRIES);
  try {
    const failures = {remaining: Number.MAX_SAFE_INTEGER, thrown: 0};
    await capturingErrors(async () => {
      reopenEmptyWithFailingHold(cluster, 'd2-c', failures);
      cluster.tickers = ['d2-a'];
      cluster.settle(() => failures.thrown >= 2, {rounds: ROUNDS});
    });
    assert.ok(failures.thrown >= 2, 'setup: the hold writes did not fail');
    assert.equal(lifecycleRow(cluster, 'd2-c')?.state, 'active');
    failures.remaining = 0;
    cluster.restart('d2-c');
    const reopened = cluster.node('d2-c').readStatus();
    assert.equal(reopened.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      'the window: the reopened replica answers as an active member');
    await capturingErrors(async () => {
      cluster.settle(() => lifecycleRow(cluster, 'd2-c')?.state ===
        'retired', {rounds: ROUNDS});
    });
    assert.deepEqual(lifecycleRow(cluster, 'd2-c'),
      {state: 'retired', reason: RESEED_REQUIRED});
    assert.equal(cluster.node('d2-c').readStatus().reason, RESEED_REQUIRED);
  } finally {
    cluster.dispose();
  }
});

test('D3: a retirement that waited on a turn which held the replica ' +
  'keeps the reseed-required reason', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reseed-retire-'));
  const db = new Database(path.join(directory, 'replica.sqlite'));
  try {
    const owner = new RaftRsReplicaLifecycleOwner({db, groupId: 'd3',
      peerId: '7', replicaIdentity: 'd3-a'});
    let finishTurn = null;
    const turn = owner.execute(() => new Promise((resolve) => {
      finishTurn = resolve;
    }));
    const retirement = owner.retire('group-retired');
    assert.equal(owner.holdForReseed().outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK, 'the in-flight turn held the replica');
    finishTurn();
    await turn;
    const retired = await retirement;
    assert.equal(retired.reason, RESEED_REQUIRED);
    const row = db.prepare('SELECT state, reason FROM ' +
      '_raft_rs_replica_lifecycle WHERE group_id = ?').get('d3');
    assert.deepEqual({...row}, {state: 'retired', reason: RESEED_REQUIRED});
  } finally {
    db.close();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
