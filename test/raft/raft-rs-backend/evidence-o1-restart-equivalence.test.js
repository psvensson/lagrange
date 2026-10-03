// M4 (committed-read amendment 1, section 5): restart / rejoin equivalence.
// Whatever the restart point and class, a replica with a valid durable
// record converges to the membership and role the oracles derive from the
// group's durable log - the same state the uninterrupted replica reaches -
// and stays gated (no campaign, no leadership) until its applied index
// reaches max(j, a_self); a replica without a record is refused typed; a
// record written before the gate existed is refused typed; a runtime
// reconstruction at the transient sole-voter index of an H1 history never
// leads.
//
// Ranges over RESTART_POINT {before the index-0 transaction, applied < j,
// j <= applied < a_self, open} x RESTART_CLASS {continue, process restart
// (the durable-record bootstrap of a rejoin), coordinator re-init (the
// COMMITTED stamp dispatched again), runtime reconstruction (the shared core
// trapped, every group rebuilt from its record)}. History H6b (|D| = 2).
// Oracles: O-a (j from the leader's durable applied index; a_self and the
// configuration at every index from the fold of the leader's durable log
// over the TEST'S genesis), O-b, O-d.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {
  HISTORY,
  LEADER_ROLE,
  UNBOUNDED,
  admissionIndexOf,
  assertCrossMemberAgreement,
  commitVoterChange,
  committedAt,
  createModelCluster,
  durableOf,
  electionStorm,
  formHistory,
  identityOf,
  joinFromStamp,
  leaderOf,
  liveReplicas,
  peerIdIn,
  plantDisagreeingRows,
  prefixFilter,
  recordGateOpenings,
  restartWith,
  roleOf,
  settle,
  termAndVote,
  trapSharedCore,
} from './evidence-o1-model.js';
import {durableLog} from './committed-membership-oracles.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {durableRecordBootstrap} from
  '../../../src/raft/raft-committed-membership-stamp.js';
import {
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {
  RAFT_RS_PARTICIPATION_GATE_COLUMNS,
  RAFT_RS_SQL,
  RAFT_RS_TABLE,
} from '../../../src/raft/raft-rs-durable-store-constants.js';

const PARTITION_ID = 'evidence-o1-m4';
const HISTORY_KEY = 'H6b';
const TARGET = identityOf(HISTORY_KEY, 't');

const RESTART_POINT = Object.freeze({
  BEFORE_RECORD: 'before-index-0-transaction',
  BELOW_J: 'applied-below-j',
  BETWEEN_J_AND_A: 'j-at-or-below-applied-below-a-self',
  OPEN: 'open',
});
const RESTART_CLASS = Object.freeze({
  CONTINUE: 'continue',
  PROCESS_RESTART: 'process-restart',
  COORDINATOR_REINIT: 'coordinator-re-init',
  RUNTIME_RECONSTRUCTION: 'runtime-reconstruction',
});
// A replica with no record has no process to restart and no runtime to
// reconstruct: those two cells do not exist.
const CELLS = Object.values(RESTART_POINT).flatMap((point) =>
  Object.values(RESTART_CLASS).map((restartClass) => ({point, restartClass})))
  .filter(({point, restartClass}) => point !== RESTART_POINT.BEFORE_RECORD ||
    restartClass === RESTART_CLASS.PROCESS_RESTART ||
    restartClass === RESTART_CLASS.COORDINATOR_REINIT);

function foundCluster(filter) {
  const founders = HISTORY[HISTORY_KEY].genesis.map((letter) =>
    identityOf(HISTORY_KEY, letter));
  return createModelCluster({partitionId: PARTITION_ID, founders,
    target: TARGET, filter});
}

// The history, the target admitted by the group while it has replayed
// nothing, and the oracle's (j, a_self).
function admittedTarget(cluster, cap) {
  const history = formHistory(cluster, HISTORY_KEY);
  const {leader, stamp, genesis} = history;
  const j = stamp.appliedIndex;
  plantDisagreeingRows(cluster, TARGET, Object.values(stamp.identities)[0]);
  cap.value = 0;
  joinFromStamp(cluster, TARGET, stamp);
  commitVoterChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, TARGET);
  const targetPeerId = peerIdIn(cluster, TARGET, TARGET);
  const aSelf = admissionIndexOf(cluster, leader, targetPeerId, j);
  assert.ok(aSelf > j, 'setup: a_self > j in the leader durable log');
  return {leader, stamp, genesis, j, aSelf, targetPeerId,
    belowJ: history.changeIndices.find((index) => index < j)};
}

function replayTo(cluster, cap, leader, index) {
  cap.value = index;
  assert.ok(settle(cluster, () =>
    durableOf(cluster, TARGET).applied.appliedIndex === index, [leader]),
  `setup: the target replays to ${index}`);
}

function assertGatedAfterRestart(cluster, leader, members, targetPeerId) {
  assert.equal(cluster.node(TARGET).readStatus().gateOpen, false,
    'the restored gate is closed');
  const before = termAndVote(durableOf(cluster, TARGET).hard);
  const samples = electionStorm(cluster, TARGET, members, () => {
    assert.notEqual(roleOf(cluster, TARGET), LEADER_ROLE,
      'the restored target never leads below its gate');
  });
  const after = durableOf(cluster, TARGET).hard;
  assert.ok(Number(after?.term ?? 0) <=
    Number(durableOf(cluster, leader).hard.term),
  'O-d: the term never exceeds the group term');
  assert.notEqual(after?.vote, targetPeerId, 'O-d: no self-vote');
  assert.equal(after?.vote ?? null, before.vote,
    'O-d: the vote is unchanged');
  for (const {hard} of samples) {
    for (const {vote} of Object.values(hard)) {
      assert.notEqual(vote, targetPeerId, 'no member voted for the target');
    }
  }
}

function assertConverged(cluster, cap, {leader, genesis, j, aSelf,
  targetPeerId}, target = TARGET) {
  cap.value = UNBOUNDED;
  const caughtUp = () => {
    const applied = durableOf(cluster, target).applied;
    return applied.appliedIndex >= aSelf && applied.appliedIndex ===
      durableOf(cluster, leaderOf(cluster) ?? leader).applied.appliedIndex &&
      cluster.node(target).readStatus().gateOpen === true;
  };
  assert.ok(settle(cluster, caughtUp, liveReplicas(cluster)),
    'the target converges on the leader durable index with its gate open');
  const durable = durableOf(cluster, target).applied;
  assert.equal(durable.bootstrapIndex, j, 'bootstrap index = j (durable)');
  assert.equal(durable.admissionIndex, aSelf,
    'admission index = a_self from the leader durable log');
  const committed = committedAt(cluster, leaderOf(cluster) ?? leader,
    genesis, durable.appliedIndex);
  assert.ok(committed.voters.includes(targetPeerId),
    'O-a: the committed configuration at that index holds the target');
  assert.deepEqual(durable.voters, committed.voters,
    'O-a: the target durable configuration is the fold at its index');
  assertCrossMemberAgreement(cluster);
}

function applyRestartClass(cluster, restartClass, stamp) {
  if (restartClass === RESTART_CLASS.CONTINUE) {
    return {replica: cluster.replica(TARGET)};
  }
  if (restartClass === RESTART_CLASS.RUNTIME_RECONSTRUCTION) {
    const trapped = trapSharedCore(cluster, TARGET);
    assert.equal(trapped.outcome, RAFT_OPERATION_OUTCOME.CORE_FATAL,
      `setup: the shared core trapped (${JSON.stringify(trapped)})`);
    for (const replicaId of liveReplicas(cluster)) {
      cluster.node(replicaId).readStatus();
    }
    return {replica: cluster.replica(TARGET)};
  }
  const bootstrap = restartClass === RESTART_CLASS.PROCESS_RESTART ?
    durableRecordBootstrap() : stamp;
  return restartWith(cluster, TARGET,
    {[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: bootstrap});
}

function logShape(cluster, replicaId) {
  return durableLog(cluster.replica(replicaId).dbFile, PARTITION_ID)
    .map((entry) => [entry.index, entry.term, entry.entryType]);
}

for (const {point, restartClass} of CELLS) {
  test(`M4 ${point} x ${restartClass}: the restarted replica converges on ` +
    'the oracle membership and role, gated until a_self', () => {
    const filter = {value: null};
    const cap = {value: UNBOUNDED};
    const cluster = foundCluster(filter);
    try {
      filter.value = prefixFilter(cap);
      if (point === RESTART_POINT.BEFORE_RECORD) {
        // No index-0 transaction ever ran for the target: its file holds no
        // record. A process restart (rejoin) is refused typed; a
        // coordinator re-init is the create itself.
        const history = formHistory(cluster, HISTORY_KEY);
        const {leader, stamp, genesis} = history;
        cap.value = 0;
        if (restartClass === RESTART_CLASS.PROCESS_RESTART) {
          assert.throws(() => cluster.addReplica(TARGET,
            [...Object.values(stamp.identities), TARGET],
            {[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]:
              durableRecordBootstrap()}), (error) => {
            assert.equal(error.consensus?.outcome,
              RAFT_OPERATION_OUTCOME.CORE_REFUSED);
            assert.equal(error.consensus?.reason,
              RUNTIME_REASON.DURABLE_RECORD_MISSING,
              'typed DURABLE_RECORD_MISSING');
            assert.equal(error.consensus?.phase,
              RUNTIME_PHASE.DURABLE_RECORD_READ);
            assert.equal(error.consensus?.retryable, false,
              'non-retryable: distinct from an unreadable record');
            return true;
          }, 'a rejoin without a record opens no group');
          assert.equal(durableOf(cluster, TARGET).applied, null,
            'nothing was written from the hints or the rows');
          return;
        }
        joinFromStamp(cluster, TARGET, stamp);
        commitVoterChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
          TARGET);
        const targetPeerId = peerIdIn(cluster, TARGET, TARGET);
        const j = stamp.appliedIndex;
        const aSelf = admissionIndexOf(cluster, leader, targetPeerId, j);
        assertGatedAfterRestart(cluster, leader, liveReplicas(cluster)
          .filter((id) => id !== TARGET), targetPeerId);
        assertConverged(cluster, cap, {leader, genesis, j, aSelf,
          targetPeerId});
        return;
      }
      const setup = admittedTarget(cluster, cap);
      const {leader, stamp, j, aSelf, targetPeerId} = setup;
      const members = liveReplicas(cluster).filter((id) => id !== TARGET);
      const restartIndex = {
        [RESTART_POINT.BELOW_J]: setup.belowJ,
        [RESTART_POINT.BETWEEN_J_AND_A]: aSelf - 1,
        [RESTART_POINT.OPEN]: UNBOUNDED,
      }[point];
      if (restartIndex === UNBOUNDED) {
        assertConverged(cluster, cap, setup);
      } else {
        assert.ok(restartIndex !== undefined && restartIndex < aSelf,
          `setup: a restart index below a_self (${restartIndex})`);
        replayTo(cluster, cap, leader, restartIndex);
      }
      const shapeBefore = logShape(cluster, TARGET);
      const restarted = applyRestartClass(cluster, restartClass, stamp);
      assert.equal(restarted.refused, undefined,
        `the restart is not refused (${restarted.refused?.message})`);
      const opened = recordGateOpenings(cluster, TARGET);
      assert.deepEqual(logShape(cluster, TARGET).slice(0, shapeBefore.length),
        shapeBefore, 'the durable log the replica held is intact (one ' +
          'group, no second bootstrap)');
      if (point === RESTART_POINT.OPEN) {
        assert.equal(cluster.node(TARGET).readStatus().gateOpen, true,
          'a record at or past a_self restores open');
        assertConverged(cluster, cap, setup);
        return;
      }
      assertGatedAfterRestart(cluster, leader, members, targetPeerId);
      assertConverged(cluster, cap, setup);
      assert.deepEqual(opened.map((event) =>
        [event.bootstrapIndex, event.admissionIndex]), [[j, aSelf]],
      'GATE_OPENED once after the restart, at the oracle (j, a_self)');
    } finally {
      cluster.dispose();
    }
  });
}

// The applied-state table as it was created before the participation gate
// existed: the production DDL without the gate's own columns.
function preGateAppliedStateDdl() {
  return RAFT_RS_SQL.CREATE_APPLIED_STATE_TABLE.split('\n').filter((line) =>
    !RAFT_RS_PARTICIPATION_GATE_COLUMNS.some((column) =>
      line.trim().startsWith(column))).join('\n')
    .replace('IF NOT EXISTS', '')
    .replace(/,\s*\)/u, ')');
}

test('M4 (pre-gate record): a record whose schema predates the gate is ' +
  'refused typed and non-retryable, distinct from missing and unreadable',
() => {
  const filter = {value: null};
  const cap = {value: UNBOUNDED};
  const cluster = foundCluster(filter);
  try {
    filter.value = prefixFilter(cap);
    const setup = admittedTarget(cluster, cap);
    assertConverged(cluster, cap, setup);
    const replica = cluster.replica(TARGET);
    replica.node.close();
    replica.db.close();
    const db = new Database(replica.dbFile);
    const preGate = preGateAppliedStateDdl();
    assert.ok(RAFT_RS_PARTICIPATION_GATE_COLUMNS.every((column) =>
      !preGate.includes(column)) && preGate.includes('applied_index'),
    'setup: the pre-gate DDL is the production DDL minus the gate columns');
    db.exec(`ALTER TABLE ${RAFT_RS_TABLE.APPLIED_STATE} RENAME TO gated`);
    db.exec(preGate);
    db.exec(`INSERT INTO ${RAFT_RS_TABLE.APPLIED_STATE} SELECT group_id, ` +
      'applied_index, voters, learners, voters_outgoing, learners_next, ' +
      'auto_leave FROM gated');
    db.exec('DROP TABLE gated');
    db.close();
    const hints = replica.request[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS];
    assert.throws(() => cluster.buildReplica(TARGET, hints,
      {[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]:
        durableRecordBootstrap()}), (error) => {
      assert.equal(error.consensus?.reason,
        RUNTIME_REASON.DURABLE_RECORD_INCOMPATIBLE, 'typed INCOMPATIBLE');
      assert.equal(error.consensus?.outcome,
        RAFT_OPERATION_OUTCOME.CORE_REFUSED);
      assert.equal(error.consensus?.phase, RUNTIME_PHASE.DURABLE_RECORD_READ);
      assert.equal(error.consensus?.retryable, false, 'reseed, not retry');
      assert.notEqual(error.consensus?.reason,
        RUNTIME_REASON.DURABLE_RECORD_MISSING);
      return true;
    });
  } finally {
    cluster.dispose();
  }
});

test('M4 (H1 + self): a runtime reconstruction at the transient sole-voter ' +
  'index never leads; the bootstrap index survives the reconstruction',
() => {
  const key = 'H1';
  const target = identityOf(key, 't');
  const founders = HISTORY[key].genesis.map((letter) => identityOf(key, letter));
  const filter = {value: null};
  const cap = {value: UNBOUNDED};
  const cluster = createModelCluster({partitionId: PARTITION_ID, founders,
    target, filter});
  try {
    const {leader, stamp, genesis, changeIndices} = formHistory(cluster, key);
    const j = stamp.appliedIndex;
    filter.value = prefixFilter(cap);
    cap.value = 0;
    joinFromStamp(cluster, target, stamp);
    commitVoterChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, target);
    const targetPeerId = peerIdIn(cluster, target, target);
    const aSelf = admissionIndexOf(cluster, leader, targetPeerId, j);
    // The transient index: the removal of b, where the target's replayed
    // view over {b, t} is {t} alone.
    const transient = changeIndices.find((index) =>
      committedAt(cluster, leader, [...stamp.voters, targetPeerId], index)
        .voters.length === 1);
    assert.ok(transient !== undefined && transient < j,
      'setup: the history has a transient sole-voter index below j');
    cap.value = transient;
    assert.ok(settle(cluster, () =>
      durableOf(cluster, target).applied.appliedIndex === transient,
    [leader]), 'setup: the target replays to the transient index');
    assert.deepEqual(durableOf(cluster, target).applied.voters,
      [targetPeerId], 'setup: the target view is the sole-voter one');
    const before = termAndVote(durableOf(cluster, target).hard);
    const trapped = trapSharedCore(cluster, target);
    assert.equal(trapped.outcome, RAFT_OPERATION_OUTCOME.CORE_FATAL,
      'setup: the shared core trapped');
    cluster.node(leader).readStatus();
    cluster.isolate(target);
    electionStorm(cluster, target, [], () => {
      assert.notEqual(roleOf(cluster, target), LEADER_ROLE,
        'the reconstructed sole-voter view never leads');
    });
    const after = durableOf(cluster, target);
    assert.equal(after.hard?.term ?? null, before.term,
      'O-d: no campaign at the transient index');
    assert.equal(after.applied.bootstrapIndex, j,
      'the durable bootstrap index survived');
    assert.equal(after.applied.admissionIndex, null);
    assert.equal(cluster.node(target).readStatus().gateOpen, false);
    cluster.heal(target);
    assertConverged(cluster, cap, {leader, genesis, j, aSelf, targetPeerId},
      target);
  } finally {
    cluster.dispose();
  }
});
