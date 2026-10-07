// T4 witnesses (owner decision O1, committed-read amendment 1, section 3.3
// and 5): a replica opened from a COMMITTED stamp does not campaign, lead or
// raise its term until its applied index reaches max(bootstrapIndex,
// admissionIndex); the gate holds on the applied index alone, whatever the
// replica knows about commit; it opens with GATE_OPENED in the drain that
// crosses it, and the scheduling asked for while it was closed is re-armed
// in that same turn; a runtime reconstruction at a transient sole-voter
// index never leads.
//
// Real rs-raft ports (PartitionNodeCluster: one database file each, the
// transport a queue this test drives). Every stamp is built from the
// independent oracles - the fold of the leader's durable log over the TEST'S
// genesis founders, the leader's durable applied index and its durable
// identity reservations - never from the implementation's read. The gate is
// judged by O-d: the target's durable hard-state term and vote, read on a
// connection of the test's own, unchanged while it is below its gate.
//
// Histories: H6 (founders removed after genesis, |D| = 2: the target's
// replayed view silently omits committed voters), a commit-knowledge lag
// (the target holds the whole log, its own AddNode included, but has not
// learned that entry committed: the core's own campaign guard sees nothing
// pending), and H1 + self (an identity removed and re-added: the target's
// replay passes through a configuration in which it is the sole voter).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {coreTrappingAppend} from './core-trap-envelope.js';
import {
  durableAppliedState,
  durableHardState,
  durableLog,
  foldAt,
  logFold,
  reservedIdentities,
} from './committed-membership-oracles.js';
import {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_STAMP_KIND,
  PARTICIPATION_GATE,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {RealTimeSource} from '../../../src/time/time-source.js';
import {
  REPLACE_COMPLETION_VERDICT,
  decideReplaceCompletion,
} from '../../../src/rebalancer/operation-workflow-replace-owner.js';
import {readPartitionReplicaMembership} from
  '../../../src/partition/partition-service-raft-membership-administration.js';
import {PARTITION_REPLICA_MEMBERSHIP_STATE} from
  '../../../src/partition/partition-replica-membership-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../../src/rebalancer/replica-operation-constants.js';
import {OperationType} from
  '../../../src/rebalancer/replica-operation-progress.js';
import {SERVICE_TYPE} from '../../../src/constants/index.js';

const PARTITION_ID = 'o1-gate-partition';
const SETTLE_ROUNDS = 600;
const ELECTION_ROUNDS = 200;
const TARGET = 'gate-t';
const LEADER_ROLE = 'leader';
const FOREIGN_PEER_OFFSET = 1000;

// Envelopes to the target carry at most `cap.value` of the log and of the
// commit index: a transport that delivers a prefix (H6, H1) or that lets the
// target hold entries it has not learned are committed (commit lag).
function cappedDelivery(cap, {entries = true} = {}) {
  return (message) => {
    const capped = {...message};
    if (entries && Array.isArray(message.entries)) {
      capped.entries = message.entries.filter((entry) =>
        Number(entry.index) <= cap.value);
    }
    if (message.commit !== undefined) {
      capped.commit = String(Math.min(Number(message.commit), cap.value));
    }
    return capped;
  };
}

function createCluster(founders, {rewriteToTarget = null,
  substrateFor = null} = {}) {
  let cluster = null;
  cluster = new PartitionNodeCluster({
    partitionId: PARTITION_ID,
    replicaIds: founders,
    substrateFor,
    sendFor: (fromReplicaId, address, packet) => {
      if (rewriteToTarget === null ||
          address !== cluster.addressOf(TARGET) ||
          cluster.isolated.has(fromReplicaId) ||
          cluster.isolated.has(TARGET)) {
        return undefined;
      }
      cluster.replica(TARGET).inbox.push({...packet,
        message: rewriteToTarget(packet.message)});
      return null;
    },
  });
  return cluster;
}

function live(cluster) {
  return [...cluster.replicas.keys()].filter((replicaId) =>
    !cluster.isolated.has(replicaId));
}

function roleOf(cluster, replicaId) {
  return cluster.node(replicaId).readStatus().role;
}

function leaderOf(cluster) {
  return [...cluster.replicas.keys()].find((replicaId) =>
    roleOf(cluster, replicaId) === LEADER_ROLE) ?? null;
}

function settle(cluster, predicate, tickers) {
  cluster.tickers = tickers;
  return cluster.settle(predicate, {rounds: SETTLE_ROUNDS});
}

const PROPOSAL_ATTEMPTS = 20;
const RETRY_ROUNDS = 20;

function peerIdOfIdentity(cluster, holder, replicaId) {
  return new Map([...reservedIdentities(cluster.replica(holder).dbFile)]
    .map(([id, identity]) => [identity, id])).get(replicaId);
}

// A change through the canonical port on the current leader, settled until
// the leader's applied configuration shows it. A leader removed by the change
// hands its leadership over first (the core's own transfer); a proposal the
// core drops behind an unapplied change is proposed again.
function commitChange(cluster, type, replicaId, tickers) {
  const adds = type === RAFT_MEMBERSHIP_OPERATION.ADD_PEER;
  if (!adds && leaderOf(cluster) === replicaId) {
    cluster.node(replicaId).transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.MOST_CAUGHT_UP});
    assert.ok(settle(cluster, () => leaderOf(cluster) !== null &&
      leaderOf(cluster) !== replicaId, tickers),
    `setup: ${replicaId} handed leadership over before its removal`);
  }
  const shows = () => {
    const now = leaderOf(cluster);
    return now !== null && durableAppliedState(cluster.replica(now).dbFile,
      PARTITION_ID).voters.includes(
      peerIdOfIdentity(cluster, now, replicaId)) === adds;
  };
  for (let attempt = 0; attempt < PROPOSAL_ATTEMPTS && !shows();
    attempt += 1) {
    cluster.node(leaderOf(cluster)).proposeConfChange({
      type, replicaIdentity: replicaId});
    cluster.settle(shows, {rounds: RETRY_ROUNDS});
  }
  assert.ok(settle(cluster, shows, tickers),
    `setup: ${type} ${replicaId} applied`);
}

function genesisPeerIds(cluster, founders) {
  return founders.map((replicaId) => cluster.raftPeerIdOf(replicaId));
}

// The COMMITTED stamp a correct leader answers, built from the oracles.
function oracleStamp(cluster, leader, genesis) {
  const dbFile = cluster.replica(leader).dbFile;
  const applied = durableAppliedState(dbFile, PARTITION_ID);
  const voters = foldAt(logFold(dbFile, PARTITION_ID, genesis),
    applied.appliedIndex).voters;
  assert.deepEqual(voters, applied.voters,
    'setup: the leader applied configuration is the fold at its index');
  const reserved = reservedIdentities(dbFile);
  return {
    kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
    voters,
    votersOutgoing: [],
    learners: [],
    appliedIndex: applied.appliedIndex,
    commitIndex: applied.appliedIndex,
    term: 1,
    leaderId: leader,
    gateOpen: true,
    identities: Object.fromEntries(voters.map((peerId) =>
      [peerId, reserved.get(peerId)])),
  };
}

function addTarget(cluster, stamp) {
  const hints = [...Object.values(stamp.identities), TARGET];
  return cluster.addReplica(TARGET, hints,
    {[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp});
}

function targetDurable(cluster) {
  const dbFile = cluster.replica(TARGET).dbFile;
  return {applied: durableAppliedState(dbFile, PARTITION_ID),
    hard: durableHardState(dbFile, PARTITION_ID)};
}

// Tick the isolated target through many election timeouts.
function tickIsolatedTarget(cluster) {
  for (let round = 0; round < ELECTION_ROUNDS; round += 1) {
    cluster.node(TARGET).tick();
    cluster.deliverAll();
  }
}

// H6 with |D| = 2: founders a, b, c; +d, -b, +e, -a, so C_j = {c, d, e}
// and every founder removed after genesis is a committed voter the
// target's replayed view silently omits before j.
function formH6History(cluster) {
  const founders = ['h6-a', 'h6-b', 'h6-c'];
  assert.ok(settle(cluster, () => leaderOf(cluster) !== null, ['h6-a']),
    'setup: the founders elect a leader');
  const genesis = genesisPeerIds(cluster, founders);
  cluster.addReplica('h6-d', ['h6-a', 'h6-b', 'h6-c', 'h6-d']);
  commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, 'h6-d',
    live(cluster));
  commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, 'h6-b',
    live(cluster));
  const skewPoint = durableAppliedState(
    cluster.replica(leaderOf(cluster)).dbFile, PARTITION_ID).appliedIndex;
  cluster.isolate('h6-b');
  cluster.addReplica('h6-e', ['h6-a', 'h6-c', 'h6-d', 'h6-e']);
  commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, 'h6-e',
    live(cluster));
  commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, 'h6-a',
    live(cluster));
  cluster.isolate('h6-a');
  const leader = leaderOf(cluster);
  return {genesis, skewPoint, leader,
    stamp: oracleStamp(cluster, leader, genesis)};
}

function termAndVote(durable) {
  return {term: durable.hard?.term ?? null, vote: durable.hard?.vote ?? null};
}

function membersExcept(cluster, excluded) {
  return live(cluster).filter((replicaId) => replicaId !== excluded);
}

test('T4 (H6, |D|=2): a target below its gate on the silent-skew prefix ' +
  'never campaigns - O-d: its durable term and vote are unchanged', () => {
  const cap = {value: Number.POSITIVE_INFINITY};
  const cluster = createCluster(['h6-a', 'h6-b', 'h6-c'],
    {rewriteToTarget: cappedDelivery(cap)});
  try {
    const {genesis, skewPoint, leader, stamp} = formH6History(cluster);
    assert.equal(stamp.voters.length, 3, 'setup: C_j = {c, d, e}');

    cap.value = skewPoint;
    addTarget(cluster, stamp);
    commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, TARGET,
      membersExcept(cluster, TARGET));
    assert.ok(settle(cluster, () =>
      targetDurable(cluster).applied.appliedIndex === skewPoint,
    membersExcept(cluster, TARGET)),
    'setup: the target applied the prefix up to the skew point');
    const fold = logFold(cluster.replica(leader).dbFile, PARTITION_ID,
      genesis);
    assert.notDeepEqual(foldAt(fold, skewPoint).voters,
      targetDurable(cluster).applied.voters.filter((peerId) =>
        peerId !== cluster.raftPeerIdOf(TARGET)),
      'setup: the target view silently omits committed voters (H6)');

    const before = targetDurable(cluster);
    assert.ok(before.applied.appliedIndex < stamp.appliedIndex,
      'setup: the target is below its gate');
    cluster.isolate(TARGET);
    tickIsolatedTarget(cluster);
    assert.deepEqual(termAndVote(targetDurable(cluster)), termAndVote(before),
      'O-d: no term and no vote while below the gate');
    const campaign = cluster.node(TARGET).campaign();
    assert.equal(campaign.reason, PARTICIPATION_GATE.GATE_CLOSED,
      'an explicit campaign below the gate is refused typed');
    assert.deepEqual(termAndVote(targetDurable(cluster)), termAndVote(before),
      'O-d: the refused campaign raised no term');
    const write = cluster.node(TARGET).propose('below-the-gate');
    assert.equal(write.reason, PARTICIPATION_GATE.GATE_CLOSED,
      'a write below the gate is refused typed, not a generic unavailability');
    assert.notEqual(roleOf(cluster, TARGET), LEADER_ROLE);
    assert.equal(cluster.node(TARGET).readStatus().gateOpen, false);
  } finally {
    cluster.dispose();
  }
});

test('T4 (commit lag): a caught-up target between j and its own AddNode ' +
  'does not lead, and its gate opens in the drain that applies the ' +
  'AddNode; the scheduling asked for while closed ticks it from the start ' +
  '(a learner core never campaigns)', () => {
  const cap = {value: Number.POSITIVE_INFINITY};
  const intervals = [];
  const recording = new RealTimeSource();
  const substrateFor = (replicaId) => replicaId !== TARGET ? {} : {
    timeSource: Object.assign(Object.create(recording), {
      setInterval: (fn, ms) => {
        intervals.push({at: Date.now(), ms});
        return recording.setInterval(fn, ms);
      },
    }),
  };
  const founders = ['lag-a', 'lag-b', 'lag-c'];
  const cluster = createCluster(founders,
    {rewriteToTarget: cappedDelivery(cap, {entries: false}), substrateFor});
  try {
    assert.ok(settle(cluster, () => leaderOf(cluster) !== null &&
      durableAppliedState(cluster.replica(leaderOf(cluster)).dbFile,
        PARTITION_ID).appliedIndex > 0, ['lag-a']),
    'setup: the founders elect a leader that applied its first entry');
    const genesis = genesisPeerIds(cluster, founders);
    const leader = leaderOf(cluster);
    const stamp = oracleStamp(cluster, leader, genesis);
    addTarget(cluster, stamp);
    const opened = [];
    cluster.node(TARGET).subscribe(RAFT_EVENT.GATE_OPENED, (event) =>
      opened.push({event, at: Date.now(), intervalsBefore: intervals.length}));
    const asked = cluster.node(TARGET).startScheduling();

    // The target holds the whole log, its own AddNode included, but learns
    // commit only up to the entry before it: nothing is pending for the
    // core's own guard.
    const admission = durableLog(cluster.replica(leader).dbFile,
      PARTITION_ID).at(-1).index + 1;
    cap.value = admission - 1;
    commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, TARGET,
      founders);
    assert.ok(settle(cluster, () =>
      targetDurable(cluster).applied.appliedIndex === admission - 1 &&
      Number(cluster.node(TARGET).readStatus().commitIndex) ===
        admission - 1, founders),
    'setup: the target applied up to the entry before its AddNode');
    assert.ok(targetDurable(cluster).applied.appliedIndex >=
      stamp.appliedIndex, 'setup: the target is at or past j');
    const before = targetDurable(cluster);
    const membersBefore = founders.map((replicaId) =>
      durableHardState(cluster.replica(replicaId).dbFile, PARTITION_ID).term);
    for (let round = 0; round < ELECTION_ROUNDS; round += 1) {
      cluster.node(TARGET).tick();
      cluster.deliverAll();
      assert.notEqual(roleOf(cluster, TARGET), LEADER_ROLE,
        'the caught-up unadmitted target never leads');
    }
    assert.deepEqual(founders.map((replicaId) =>
      durableHardState(cluster.replica(replicaId).dbFile, PARTITION_ID).term),
    membersBefore, 'M5: the members\' terms are constant (no deposition)');
    const lagging = targetDurable(cluster);
    assert.equal(lagging.hard?.term, before.hard?.term,
      'O-d: its term is unchanged between j and its AddNode');
    assert.equal(asked.reason, 'scheduling-started',
      'scheduling asked for below the gate arms the tick timer at once');
    assert.equal(opened.length, 0, 'the gate is still closed');

    assert.equal(intervals.length, 1,
      'the tick timer runs while closed: the gated core keeps its time');
    cap.value = Number.POSITIVE_INFINITY;
    assert.ok(settle(cluster, () => opened.length > 0, founders),
      'the gate opens once the target applies its AddNode');
    const [{event, intervalsBefore}] = opened;
    assert.equal(event.admissionIndex, admission,
      'the admission index is the applied AddNode of the target');
    assert.ok(event.appliedIndex >= admission);
    assert.equal(intervalsBefore, 1,
      'the timer armed while closed is the one that keeps running');
    assert.equal(intervals.length, 1, 'armed once, never re-armed');
    assert.equal(targetDurable(cluster).applied.admissionIndex, admission,
      'the admission index is durable');
  } finally {
    cluster.dispose();
  }
});

// Traps the shared core through one port (core-trap-envelope.js), driven by
// a tick of that replica.
function trapCoreThrough(cluster, replicaId) {
  const status = cluster.node(replicaId).readStatus();
  cluster.node(replicaId).step(coreTrappingAppend({
    dbFile: cluster.replica(replicaId).dbFile,
    groupId: PARTITION_ID,
    status,
    from: String(Number(status.peerId) + FOREIGN_PEER_OFFSET),
    term: String(Number(status.term) + 1),
  }));
  const originalConsoleError = console.error;
  try {
    console.error = () => undefined;
    return cluster.node(replicaId).tick();
  } finally {
    console.error = originalConsoleError;
  }
}

// H1 + self: genesis {a}; +b, -b, +b, -a, so C_j = {b} while the target's
// replay passes through the configuration {t} - its transient sole-voter
// view, in which the committed voter b is absent. The target is left there
// (applied = the removal of b), below its gate.
function formH1TransientTarget(cluster, cap) {
  assert.ok(settle(cluster, () => leaderOf(cluster) === 'h1-a', ['h1-a']),
    'setup: the sole founder leads');
  const genesis = genesisPeerIds(cluster, ['h1-a']);
  cluster.addReplica('h1-b', ['h1-a', 'h1-b']);
  commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, 'h1-b',
    ['h1-a']);
  commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, 'h1-b',
    ['h1-a']);
  const transient = durableAppliedState(cluster.replica('h1-a').dbFile,
    PARTITION_ID).appliedIndex;
  commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, 'h1-b',
    ['h1-a']);
  commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, 'h1-a',
    ['h1-a', 'h1-b']);
  cluster.isolate('h1-a');
  assert.equal(leaderOf(cluster), 'h1-b',
    'setup: the re-added identity leads the group {b}');
  const stamp = oracleStamp(cluster, 'h1-b', genesis);
  assert.deepEqual(stamp.voters, [cluster.raftPeerIdOf('h1-b')],
    'setup: C_j = {b}');

  cap.value = transient;
  addTarget(cluster, stamp);
  commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, TARGET,
    ['h1-b']);
  assert.ok(settle(cluster, () =>
    targetDurable(cluster).applied.appliedIndex === transient, ['h1-b']),
  'setup: the target applied up to the removal of b');
  assert.deepEqual(targetDurable(cluster).applied.voters,
    stamp.voters,
    'setup: the target view at the former transient index is C_j - the ' +
      'configuration entries at or below j are folded into its bootstrap, ' +
      'so no transient sole-voter view exists');
  assert.ok(targetDurable(cluster).applied.learners.includes(
    cluster.raftPeerIdOf(TARGET)), 'setup: the target is a learner of C_j');
  return {transient, stamp};
}

test('T4 (H1 + self): a runtime reconstruction at the transient sole-voter ' +
  'index of the target never leads', () => {
  const cap = {value: Number.POSITIVE_INFINITY};
  const cluster = createCluster(['h1-a'],
    {rewriteToTarget: cappedDelivery(cap)});
  try {
    const {stamp} = formH1TransientTarget(cluster, cap);
    const before = targetDurable(cluster);

    const trapped = trapCoreThrough(cluster, 'h1-b');
    assert.equal(trapped.outcome, RAFT_OPERATION_OUTCOME.CORE_FATAL,
      `setup: the shared core trapped (${JSON.stringify(trapped)})`);
    cluster.node('h1-b').readStatus();
    cluster.isolate(TARGET);
    for (let round = 0; round < ELECTION_ROUNDS; round += 1) {
      cluster.node(TARGET).tick();
      cluster.deliverAll();
    }
    assert.notEqual(roleOf(cluster, TARGET), LEADER_ROLE,
      'the reconstructed target does not lead its transient view');
    const after = targetDurable(cluster);
    assert.equal(after.hard?.term ?? null, before.hard?.term ?? null,
      'O-d: no campaign at the transient index');
    assert.equal(after.applied.bootstrapIndex, stamp.appliedIndex,
      'the durable bootstrap index survived the reconstruction');
  } finally {
    cluster.dispose();
  }
});

test('T4 (restart between j and a): a target restarted from its durable ' +
  'record below its admission restores its gate closed and does not lead',
() => {
  const cap = {value: Number.POSITIVE_INFINITY};
  const founders = ['rst-a', 'rst-b', 'rst-c'];
  const cluster = createCluster(founders,
    {rewriteToTarget: cappedDelivery(cap, {entries: false})});
  try {
    assert.ok(settle(cluster, () => leaderOf(cluster) !== null &&
      durableAppliedState(cluster.replica(leaderOf(cluster)).dbFile,
        PARTITION_ID).appliedIndex > 0, ['rst-a']),
    'setup: the founders elect a leader that applied its first entry');
    const leader = leaderOf(cluster);
    const stamp = oracleStamp(cluster, leader,
      genesisPeerIds(cluster, founders));
    addTarget(cluster, stamp);
    const admission = durableLog(cluster.replica(leader).dbFile,
      PARTITION_ID).at(-1).index + 1;
    cap.value = admission - 1;
    commitChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, TARGET,
      founders);
    assert.ok(settle(cluster, () =>
      targetDurable(cluster).applied.appliedIndex === admission - 1,
    founders), 'setup: the target is between j and its AddNode');
    const restored = targetDurable(cluster);
    assert.equal(restored.applied.admissionIndex, null,
      'setup: no admission is durable yet');

    cluster.restart(TARGET);
    assert.equal(cluster.node(TARGET).readStatus().gateOpen, false,
      'the restored gate is closed');
    for (let round = 0; round < ELECTION_ROUNDS; round += 1) {
      cluster.node(TARGET).tick();
      cluster.deliverAll();
      assert.notEqual(roleOf(cluster, TARGET), LEADER_ROLE,
        'the restored target never leads below its admission');
    }
    assert.equal(targetDurable(cluster).hard?.term ?? null,
      restored.hard?.term ?? null, 'O-d: no term while below the gate');

    cap.value = Number.POSITIVE_INFINITY;
    assert.ok(settle(cluster, () =>
      cluster.node(TARGET).readStatus().gateOpen === true, founders),
    'the gate opens once the restored target applies its AddNode');
    assert.equal(targetDurable(cluster).applied.admissionIndex, admission);
  } finally {
    cluster.dispose();
  }
});

// B12 (committed-read amendment 1, cross-branch interlock): the REPLACE
// owner's R-1a decision reads its witness through the port's committed-
// membership read (WITNESS purpose). A witness below its participation gate
// shows the transient H1+self absence of b - a committed voter the whole
// time - with a commit index at or past C0 (here the pre-intent floor). R-1a
// must WAIT on it, never answer SOURCE_RETIRED.
// F1 (owner ruling 2026-09-26): the completion authority is the group's
// leader-answered committed configuration, reached from the target's answer
// with one redirect; the below-gate target's own view never decides. Each
// witness message is answered by the port of the replica it addresses; the
// partition's replicas route by their own node ids.
function replaceOwnerReadingThrough(cluster, sourceReplicaId) {
  const serviceOf = (replicaId) => ({raft: cluster.node(replicaId), replicaId,
    partitionId: PARTITION_ID, replicaIds: [], raftTimingConfig: null});
  return {
    repository: {
      getReplaceSourceReplicaId: () => sourceReplicaId,
      getReplaceTargetReplicaId: () => TARGET,
      getObservedReplicaStatusFromCache: () => 'active',
    },
    getCachedCriticalReplicaRows: () => [...cluster.replicas.keys()].map(
      (replicaId) => ({replica_id: replicaId, node_id: `${replicaId}-node`})),
    messageRouter: {
      deliver: async (_target, payload) => ({
        acknowledged: true,
        status: ReplicaOperationResponseStatus.COMPLETED,
        [ReplicaOperationField.MEMBERSHIP]: await readPartitionReplicaMembership(
          serviceOf(payload[ReplicaOperationField.REPLICA_ID]),
          sourceReplicaId),
      }),
    },
  };
}

test('B12: R-1a waits on a witness below its gate (whose view, folded at ' +
  'C_j, no longer transiently shows a committed voter absent), and ' +
  'retires only once the gate is open', async () => {
  const cap = {value: Number.POSITIVE_INFINITY};
  const cluster = createCluster(['h1-a'],
    {rewriteToTarget: cappedDelivery(cap)});
  try {
    formH1TransientTarget(cluster, cap);
    const owner = replaceOwnerReadingThrough(cluster, 'h1-b');
    const operation = {operationId: 'b12-replace', type: OperationType.REPLACE,
      entityType: SERVICE_TYPE.PARTITION, entityId: PARTITION_ID,
      partitionId: PARTITION_ID,
      replicaId: TARGET, targetNodeId: 'b12-target-node'};
    const targetView = await readPartitionReplicaMembership({
      raft: cluster.node(TARGET), replicaId: TARGET, partitionId: PARTITION_ID,
      replicaIds: [], raftTimingConfig: null}, 'h1-b');
    assert.equal(targetView.state, PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER,
      'setup: the below-gate witness holds C_j, so the committed voter b is ' +
        'not transiently absent');
    assert.equal(targetView.gateOpen, false,
      'setup: the witness observation carries its closed gate');
    const below = await decideReplaceCompletion(owner, operation);
    assert.notEqual(below.verdict, REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED,
      'R-1a never retires a source from a below-gate witness');
    assert.ok([REPLACE_COMPLETION_VERDICT.WITNESS_BELOW_GATE,
      REPLACE_COMPLETION_VERDICT.UNAVAILABLE,
      REPLACE_COMPLETION_VERDICT.STILL_VOTER].includes(below.verdict),
    `it waits, typed (${below.verdict}; ${below.observation.reason ?? ''})`);

    cap.value = Number.POSITIVE_INFINITY;
    assert.ok(settle(cluster, () =>
      cluster.node(TARGET).readStatus().gateOpen === true, ['h1-b']),
    'setup: the target catches up and its gate opens');
    const open = await decideReplaceCompletion(owner, operation);
    assert.equal(open.verdict, REPLACE_COMPLETION_VERDICT.STILL_VOTER,
      'the leader\'s committed configuration holds b, a committed voter');
    assert.equal(open.observation.leaderReplicaId,
      open.observation.replicaId, 'the verdict is the leader\'s own answer');
  } finally {
    cluster.dispose();
  }
});
