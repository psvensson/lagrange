import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {
  RAFT_MEMBERSHIP_TRANSITION_REASON,
  RAFT_MEMBERSHIP_TRANSITION_STAGE,
  RAFT_OPERATION,
} from
  '../../../src/raft/raft-operation-port-constants.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const GROUP = 'membership-generation-group';
const FOUNDERS = Object.freeze(['generation-a', 'generation-b',
  'generation-c']);
const EMPTY = Object.freeze({voters: [], learners: [], votersOutgoing: [],
  learnersNext: [], autoLeave: false});
const CONTRADICTORY = Object.freeze({...EMPTY, voters: ['1']});

function oldRecordSchema(db) {
  db.exec(`
    CREATE TABLE _raft_rs_log (group_id TEXT NOT NULL, log_index INTEGER NOT
      NULL, term INTEGER NOT NULL, entry_type INTEGER NOT NULL, data TEXT,
      PRIMARY KEY (group_id, log_index));
    CREATE TABLE _raft_rs_hard_state (group_id TEXT PRIMARY KEY,
      term INTEGER NOT NULL, vote INTEGER NOT NULL,
      commit_index INTEGER NOT NULL);
    CREATE TABLE _raft_rs_applied_state (group_id TEXT PRIMARY KEY,
      applied_index INTEGER NOT NULL, voters TEXT NOT NULL,
      learners TEXT NOT NULL, voters_outgoing TEXT NOT NULL,
      learners_next TEXT NOT NULL, auto_leave INTEGER NOT NULL,
      bootstrap_index INTEGER, admission_index INTEGER);
    CREATE TABLE _raft_rs_snapshot (group_id TEXT PRIMARY KEY,
      snapshot_index INTEGER NOT NULL, snapshot_term INTEGER NOT NULL,
      data TEXT, voters TEXT NOT NULL, learners TEXT NOT NULL,
      voters_outgoing TEXT NOT NULL, learners_next TEXT NOT NULL,
      auto_leave INTEGER NOT NULL)
  `);
}

test('existing records gain a neutral generation and ordinary applies ' +
  'preserve the last configuration-only generation', () => {
  const db = new Database(':memory:');
  try {
    oldRecordSchema(db);
    db.prepare(`
      INSERT INTO _raft_rs_snapshot
        (group_id, snapshot_index, snapshot_term, data, voters, learners,
         voters_outgoing, learners_next, auto_leave)
      VALUES (?, 1, 1, NULL, '[]', '[]', '[]', '[]', 0)
    `).run(GROUP);
    const store = new RaftRsDurableStore(db);
    assert.equal(store.readDurableRecord(GROUP).snapshot.metadata
      .membershipGenerationIndex, null,
    'an upgraded legacy snapshot remains explicitly unbound');
    store.putAppliedState(GROUP, '1', EMPTY);
    assert.equal(store.readDurableRecord(GROUP).membershipGenerationIndex, '0');
    store.putAppliedState(GROUP, '5', EMPTY, undefined, '4');
    store.putAppliedState(GROUP, '6', EMPTY);
    assert.equal(store.readDurableRecord(GROUP).membershipGenerationIndex, '4');
    store.putSnapshot(GROUP, {metadata: {index: '6', term: '1',
      confState: EMPTY}});
    assert.equal(store.readDurableRecord(GROUP).snapshot.metadata
      .membershipGenerationIndex, null,
    'native snapshot metadata cannot invent a sender generation');
    store.putSnapshot(GROUP, {metadata: {index: '6', term: '1',
      confState: EMPTY, membershipGenerationIndex: '4'}});
    const snapshotBeforeRefusals = store.readDurableRecord(GROUP).snapshot;
    for (const membershipGenerationIndex of ['-1', 'not-an-index', '3', '7',
      String(Number.MAX_SAFE_INTEGER + 1)]) {
      assert.throws(() => store.putSnapshot(GROUP, {metadata: {
        index: '6', term: '1', confState: EMPTY,
        membershipGenerationIndex,
      }}));
      assert.deepEqual(store.readDurableRecord(GROUP).snapshot,
        snapshotBeforeRefusals,
        'a refused descriptor leaves the prior durable snapshot unchanged');
    }
    assert.throws(() => store.putSnapshot(GROUP, {metadata: {
      index: '6', term: '1', confState: CONTRADICTORY,
      membershipGenerationIndex: '4',
    }}), /contradicts/u);
    assert.deepEqual(store.readDurableRecord(GROUP).snapshot,
      snapshotBeforeRefusals);
  } finally {
    db.close();
  }
});

test('an unbound durable snapshot never pairs its ConfState with a receiver ' +
  'generation or admits a managed transition', (t) => {
  const cluster = new PartitionNodeCluster({partitionId: `${GROUP}-unknown`,
    replicaIds: [FOUNDERS[0]]});
  t.after(() => cluster.dispose());
  cluster.tickers = [FOUNDERS[0]];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null));
  const leader = cluster.leaderReplicaId();
  cluster.propose(leader, 'advance-before-unbound-snapshot');
  assert.ok(cluster.settle(() => cluster.node(leader).readStatus()
    .appliedIndex > 0));
  const before = cluster.node(leader).readStatus();
  new RaftRsDurableStore(cluster.replica(leader).db).putSnapshot(
    cluster.partitionId, {metadata: {
      index: String(before.appliedIndex), term: String(before.term),
      confState: before.confState,
    }});
  cluster.replica(leader).db.prepare(
    'DELETE FROM _raft_rs_log WHERE group_id = ? AND log_index <= ?',
  ).run(cluster.partitionId, before.appliedIndex);
  cluster.restart(leader);
  cluster.tickers = [leader];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() === leader));
  const restored = cluster.node(leader).readStatus();
  assert.equal(restored.membershipGenerationIndex, null);
  const membership = cluster.node(leader)[
    RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP]({
    purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS,
  });
  assert.equal(membership.reason,
    COMMITTED_MEMBERSHIP_REFUSAL.CONFIGURATION_GENERATION_UNAVAILABLE);
  const transition = cluster.node(leader)[
    RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION]({
    operationId: 'unknown-snapshot-operation',
    transitionIdentity: 'unknown-snapshot-transition',
    permitSequence: 1,
    stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
    replicaIdentity: leader,
    peerAddress: cluster.addressOf(leader),
    replicaLifecycleIncarnation: restored.lifecycleIncarnation,
    runtimeGeneration: restored.runtimeGeneration,
    leaderTerm: restored.term,
    leaderConfigurationStamp: {
      configurationKey: restored.configurationKey,
      membershipGenerationIndex: before.membershipGenerationIndex,
    },
  });
  assert.equal(transition.reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.CONFIGURATION_GENERATION_UNAVAILABLE);
});

test('generation, ConfState and snapshot boundaries survive rollback and a ' +
  'physical SQLite reopen', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'membership-gen-'));
  const file = path.join(directory, 'replica.sqlite');
  let db = new Database(file);
  try {
    let store = new RaftRsDurableStore(db);
    store.putAppliedState(GROUP, '5', EMPTY, undefined, '4');
    assert.throws(() => store.transaction(() => {
      store.putAppliedState(GROUP, '8', EMPTY, undefined, '8');
      throw new Error('roll back applied generation');
    }), /roll back/u);
    assert.equal(store.readDurableRecord(GROUP).membershipGenerationIndex, '4');
    store.putSnapshot(GROUP, {metadata: {index: '9', term: '2',
      confState: EMPTY, membershipGenerationIndex: '7'}});
    db.close();
    db = new Database(file);
    store = new RaftRsDurableStore(db);
    const restored = store.readDurableRecord(GROUP);
    assert.equal(restored.membershipGenerationIndex, '4');
    assert.equal(restored.snapshot.metadata.membershipGenerationIndex, '7');
    assert.equal(restored.snapshot.metadata.index, '9');
  } finally {
    if (db.open) {
      db.close();
    }
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('real applied ConfChanges advance the generation while ordinary traffic ' +
  'does not, including an effective no-op and restart', () => {
  const cluster = new PartitionNodeCluster({partitionId: GROUP,
    replicaIds: FOUNDERS});
  try {
    cluster.tickers = [FOUNDERS[0]];
    assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null));
    const leader = cluster.leaderReplicaId();
    const read = () => cluster.node(leader)[
      RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP]({purpose: 'witness'});
    const before = read();
    assert.equal(before.membershipGenerationIndex, 0);
    cluster.propose(leader, 'ordinary-before-membership');
    assert.ok(cluster.settle(() => read().appliedIndex > before.appliedIndex));
    assert.equal(read().membershipGenerationIndex, 0);

    const target = '88776655';
    const add = {transition: 0, changes: [{
      changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE, nodeId: target,
    }]};
    cluster.node(leader).proposeConfChange(add);
    assert.ok(cluster.settle(() => read().learners.includes(target)));
    const first = read().membershipGenerationIndex;
    assert.ok(first > 0);
    cluster.node(leader).proposeConfChange(add);
    assert.ok(cluster.settle(() =>
      read().membershipGenerationIndex > first));
    const noOp = read().membershipGenerationIndex;
    cluster.propose(leader, 'ordinary-after-membership');
    assert.ok(cluster.settle(() => read().appliedIndex > noOp));
    assert.equal(read().membershipGenerationIndex, noOp);
    cluster.restart(leader);
    const restored = cluster.node(leader).readStatus();
    assert.equal(restored.membershipGenerationIndex, noOp);
  } finally {
    cluster.dispose();
  }
});
