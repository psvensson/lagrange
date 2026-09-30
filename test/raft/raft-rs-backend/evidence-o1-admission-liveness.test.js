// M3 (committed-read amendment 1, section 5): authoritative admission opens
// the gate, and a legitimate join is never permanently locked out.
//
// A target caught up past j whose own AddNode it holds but has not learned
// is committed (a commit-knowledge lag: the core's own campaign guard sees
// nothing pending) has its ticks suppressed - no timer, every tick refused
// typed - between j and a_self; the drain that applies its AddNode emits
// GATE_OPENED with the oracle's (j, a_self), re-arms the scheduling it was
// refused in that same emission (I3: within one drain, < 1 s), and once
// leadership is transferred to it every member hears from it within
// HEARTBEAT_TICK ticks (60 ms at the production tick).
//
// Oracles: a_self and j from the leader's durable log and applied index
// (O-a); the target's durable term and vote (O-d); the members' durable
// terms (M5); the timers the port asked its substrate for; the packets the
// transport carried.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  LEADER_ROLE,
  UNBOUNDED,
  WIRE,
  admissionIndexOf,
  commitVoterChange,
  createModelCluster,
  durableOf,
  electionStorm,
  formHistory,
  identityOf,
  joinFromStamp,
  leaderOf,
  liveReplicas,
  oracleStamp,
  peerIdIn,
  plantDisagreeingRows,
  prefixFilter,
  roleOf,
  settle,
  termAndVote,
} from './evidence-o1-model.js';
import {durableLog} from './committed-membership-oracles.js';
import {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {PARTICIPATION_GATE} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_RS_GROUP_TUNING} from
  '../../../src/raft/raft-rs-group-constants.js';
import {RealTimeSource} from '../../../src/time/time-source.js';
import {
  REPLICA_CONSENSUS_EXIT_REASON,
  awaitReplicaConsensusExit,
} from '../../../src/node/replica-removal-consensus-exit.js';
import {readPartitionReplicaMembership} from
  '../../../src/partition/partition-service-raft-membership-administration.js';
import {PARTITION_REPLICA_MEMBERSHIP_STATE} from
  '../../../src/partition/partition-replica-membership-constants.js';
import {genesisStamp} from
  '../../../src/raft/raft-committed-membership-stamp.js';
import {RAFT_PARTITION_NODE_REQUEST} from
  '../../../src/raft/raft-provider-contract-constants.js';

const PARTITION_ID = 'evidence-o1-m3';
const HISTORY_KEY = 'H3';
const TARGET = identityOf(HISTORY_KEY, 't');
const REARM_BOUND_MS = 1000;
const HEARD = new Set([WIRE.messageType.MsgHeartbeat,
  WIRE.messageType.MsgAppend]);

test('M3: ticks are suppressed between j and a_self under a commit lag, ' +
  'GATE_OPENED carries the oracle (j, a_self) and re-arms the scheduling in ' +
  'the same drain, and the admitted leader heartbeats within HEARTBEAT_TICK',
() => {
  const founders = ['a', 'b', 'c'].map((letter) =>
    identityOf(HISTORY_KEY, letter));
  const filter = {value: null};
  const cap = {value: UNBOUNDED};
  const intervals = [];
  const sent = [];
  const recording = new RealTimeSource();
  const cluster = createModelCluster({
    partitionId: PARTITION_ID, founders, target: TARGET, filter,
    substrateFor: (replicaId) => replicaId !== TARGET ? {} : {
      timeSource: Object.assign(Object.create(recording), {
        setInterval: (fn, ms) => {
          intervals.push({at: Date.now(), ms});
          return recording.setInterval(fn, ms);
        },
      }),
    },
    observe: (from, address, packet) => sent.push({from, address,
      msgType: packet?.message?.msgType}),
  });
  try {
    const {leader, stamp, genesis} = formHistory(cluster, HISTORY_KEY);
    const j = stamp.appliedIndex;
    plantDisagreeingRows(cluster, TARGET, Object.values(stamp.identities)[0]);
    filter.value = prefixFilter(cap, {entries: false});
    joinFromStamp(cluster, TARGET, stamp);
    const opened = [];
    let intervalsAtEvent = null;
    cluster.node(TARGET).subscribe(PARTICIPATION_GATE.GATE_OPENED,
      (event) => {
        intervalsAtEvent = intervals.length;
        opened.push({event, at: Date.now()});
      });
    const asked = cluster.node(TARGET).startScheduling();
    assert.equal(asked.reason, PARTICIPATION_GATE.GATE_CLOSED,
      'scheduling asked for below the gate is refused typed');
    assert.equal(intervals.length, 0, 'no timer was armed');

    // Hold the target's commit knowledge at the leader's last index before
    // the AddNode is proposed: it will hold its AddNode without learning it
    // committed.
    cap.value = durableLog(cluster.replica(leader).dbFile, PARTITION_ID)
      .at(-1).index;
    commitVoterChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, TARGET);
    const targetPeerId = peerIdIn(cluster, TARGET, TARGET);
    const aSelf = admissionIndexOf(cluster, leader, targetPeerId, j);
    assert.ok(aSelf > j, 'setup: a_self > j');
    cap.value = aSelf - 1;
    assert.ok(settle(cluster, () => {
      const status = cluster.node(TARGET).readStatus();
      return durableOf(cluster, TARGET).applied.appliedIndex === aSelf - 1 &&
        Number(status.commitIndex) === aSelf - 1 &&
        durableLog(cluster.replica(TARGET).dbFile, PARTITION_ID).at(-1)
          ?.index >= aSelf;
    }, [leader]), 'setup: the target holds its AddNode, applied and ' +
      'commit one below it');
    assert.ok(aSelf - 1 >= j, 'setup: the target is at or past j');

    const before = termAndVote(durableOf(cluster, TARGET).hard);
    const members = liveReplicas(cluster).filter((id) => id !== TARGET);
    const membersBefore = members.map((id) => durableOf(cluster, id).hard.term);
    const samples = electionStorm(cluster, TARGET, members, () => {
      assert.notEqual(roleOf(cluster, TARGET), LEADER_ROLE,
        'the caught-up unadmitted target never leads');
      assert.equal(cluster.node(TARGET).tick().reason,
        PARTICIPATION_GATE.GATE_CLOSED, 'every tick is refused typed');
    });
    assert.deepEqual(termAndVote(durableOf(cluster, TARGET).hard), before,
      'O-d: term and vote unchanged between j and a_self');
    assert.deepEqual(members.map((id) => durableOf(cluster, id).hard.term),
      membersBefore, 'M5: the members\' terms are constant');
    for (const {hard} of samples) {
      for (const {vote} of Object.values(hard)) {
        assert.notEqual(vote, targetPeerId, 'no member voted for it');
      }
    }
    assert.equal(opened.length, 0, 'the gate is still closed');
    assert.equal(intervals.length, 0, 'no timer while closed');

    cap.value = UNBOUNDED;
    assert.ok(settle(cluster, () => opened.length > 0, [leader]),
      'the gate opens once the target applies its AddNode');
    const [{event, at}] = opened;
    assert.equal(event.admissionIndex, aSelf, 'a_self from the durable log');
    assert.equal(event.bootstrapIndex, j, 'j from the leader applied index');
    assert.ok(event.appliedIndex >= aSelf);
    assert.equal(intervalsAtEvent, 1,
      'the refused scheduling was re-armed before GATE_OPENED reached its ' +
        'listeners (the same drain)');
    assert.equal(intervals.length, 1, 'armed exactly once');
    assert.ok(intervals[0].at - at <= REARM_BOUND_MS,
      'I3: re-armed within one drain (< 1 s)');
    assert.equal(durableOf(cluster, TARGET).applied.admissionIndex, aSelf,
      'a_self is durable');
    assert.equal(opened.length, 1, 'GATE_OPENED once');

    // A transferred leadership: every member hears from the new leader
    // within HEARTBEAT_TICK of its ticks.
    const transfer = cluster.node(leader).transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: TARGET});
    assert.equal(transfer.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `the transfer is stepped (${JSON.stringify(transfer)})`);
    assert.ok(settle(cluster, () => roleOf(cluster, TARGET) === LEADER_ROLE,
      [leader]), 'the admitted target leads');
    sent.length = 0;
    let ticks = 0;
    const heard = () => members.every((member) => sent.some((packet) =>
      packet.from === TARGET && packet.address === cluster.addressOf(member) &&
      HEARD.has(packet.msgType)));
    while (!heard() && ticks < RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK) {
      cluster.node(TARGET).tick();
      cluster.deliverAll();
      ticks += 1;
    }
    assert.ok(heard(), 'every member heard the new leader within ' +
      `HEARTBEAT_TICK = ${RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK} ticks`);
    assert.ok(genesis.length === 3);
  } finally {
    cluster.dispose();
  }
});

// Round 3 (verification O1 round 2, F-2): F2's consensus exit on the gate.
// The removed replica's own read counts an absence only at or past its
// participation gate (`consensusExitOf` holds while gateOpen !== true); the
// exit is woken by GATE_OPENED and MEMBERSHIP_CHANGED. Below the gate a
// REMOVING target keeps stepping and acking (receiving is never gated), so
// a RemoveNode that needs its ack commits once it holds it; its gate opens
// on a_self and the applied removal ends the wait.

const EXIT_BACKSTOP_MS = 30000;
const SHORT_BACKSTOP_MS = 300;

function serviceOf(cluster, replicaId) {
  return {raft: cluster.node(replicaId), replicaId, partitionId: PARTITION_ID,
    replicaIds: [], raftTimingConfig: null};
}

// Drive the cluster one round per macrotask so the exit's asynchronous
// read (a microtask, then the port) interleaves with delivery.
async function driveUntil(cluster, tickers, predicate, rounds = 600) {
  for (let round = 0; round < rounds; round += 1) {
    if (predicate()) {
      return true;
    }
    settle(cluster, () => false, tickers, 1);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return predicate();
}

test('F-2 (REMOVING target below its gate): removed before it applied its ' +
  'own admission, it keeps stepping and acking; its RemoveNode commits on ' +
  'its ack while its exit still waits; GATE_OPENED then MEMBERSHIP_CHANGED ' +
  'end the wait REMOVAL_APPLIED', async () => {
  const founders = ['ex-a', 'ex-b', 'ex-c'];
  const target = 'ex-t';
  const cluster = createModelCluster({partitionId: PARTITION_ID, founders,
    target, filter: {value: null}});
  try {
    assert.ok(settle(cluster, () => leaderOf(cluster) === 'ex-a' &&
      durableOf(cluster, 'ex-a').applied.appliedIndex > 0, ['ex-a']),
    'setup: a leads');
    const leader = 'ex-a';
    const genesis = founders.map((id) => peerIdIn(cluster, leader, id));
    const stamp = oracleStamp(cluster, leader, genesis);
    joinFromStamp(cluster, target, stamp);
    // With c isolated the removal of t needs t's own ack: voters {a,b,c,t},
    // quorum three of a, b, t.
    cluster.isolate('ex-c');
    commitVoterChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, target);
    const targetPeerId = peerIdIn(cluster, target, target);
    const aSelf = admissionIndexOf(cluster, leader, targetPeerId,
      stamp.appliedIndex);
    // The removal is proposed the moment the leader applied the admission:
    // the target has applied nothing of it yet (below its gate).
    assert.ok(durableOf(cluster, target).applied.appliedIndex < aSelf,
      'setup: the target is below its gate when its removal is proposed');
    const events = [];
    cluster.node(target).subscribe(RAFT_EVENT.GATE_OPENED, () =>
      events.push(RAFT_EVENT.GATE_OPENED));
    cluster.node(target).subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, () =>
      events.push(RAFT_EVENT.MEMBERSHIP_CHANGED));
    let exit = null;
    const waiting = awaitReplicaConsensusExit(serviceOf(cluster, target),
      {replicaId: target, backstopMs: EXIT_BACKSTOP_MS}).then((reason) => {
      exit = reason;
      events.push('exit');
      return reason;
    });
    assert.equal(cluster.node(leader).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: target})
      .outcome, RAFT_OPERATION_OUTCOME.CORE_OK, 'setup: RemoveNode(t)');
    await new Promise((resolve) => setImmediate(resolve));
    const below = await readPartitionReplicaMembership(
      serviceOf(cluster, target), target);
    assert.equal(below.gateOpen, false, 'the target is below its gate');
    assert.equal(below.state, PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER,
      'below the gate its own view still names it (its bootstrap)');
    assert.equal(exit, null, 'the exit waits');

    assert.ok(await driveUntil(cluster, [leader], () =>
      !durableOf(cluster, leader).applied.voters.includes(targetPeerId)),
    'the removal commits at the leader on the target\'s ack');
    assert.ok(await driveUntil(cluster, [leader], () => exit !== null),
      'the exit ends once the target applied its admission and its removal');
    assert.equal(exit.reason, REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED);
    assert.deepEqual(events, [RAFT_EVENT.GATE_OPENED,
      RAFT_EVENT.MEMBERSHIP_CHANGED, 'exit'],
    'GATE_OPENED, then the applied removal, then the exit');
    assert.equal(durableOf(cluster, target).applied.voters
      .includes(targetPeerId), false, 'the target applied its own removal');
    assert.equal(durableOf(cluster, target).applied.admissionIndex, aSelf,
      'it passed its gate on the way (a_self durable)');
    await waiting;
  } finally {
    cluster.dispose();
  }
});

test('F-2 (the gate clause): a replica whose applied view omits it below ' +
  'its gate - a GENESIS whose founders omit self - holds its exit to the ' +
  'backstop; an absence below the gate proves nothing', async () => {
  const founders = ['gx-a', 'gx-b', 'gx-c'];
  const outsider = 'gx-o';
  const cluster = createModelCluster({partitionId: PARTITION_ID, founders,
    target: outsider, filter: {value: null}});
  try {
    assert.ok(settle(cluster, () => leaderOf(cluster) !== null, ['gx-a']),
      'setup: a leader');
    cluster.addReplica(outsider, [...founders, outsider],
      {[RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_MEMBERSHIP]:
        genesisStamp(founders)});
    const status = cluster.node(outsider).readStatus();
    assert.equal(status.gateOpen, false, 'setup: never admitted, closed');
    const own = await readPartitionReplicaMembership(
      serviceOf(cluster, outsider), outsider);
    assert.equal(own.state, PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT,
      'setup: its applied view omits it');
    assert.equal(own.gateOpen, false);
    // The exit's backstop timer is unreferenced: keep the loop alive.
    const keepAlive = setInterval(() => undefined, SHORT_BACKSTOP_MS);
    let exit;
    try {
      exit = await awaitReplicaConsensusExit(serviceOf(cluster, outsider),
        {replicaId: outsider, backstopMs: SHORT_BACKSTOP_MS});
    } finally {
      clearInterval(keepAlive);
    }
    assert.equal(exit.reason, REPLICA_CONSENSUS_EXIT_REASON.BACKSTOP,
      'the absence below the gate is never the exit; the backstop is');
  } finally {
    cluster.dispose();
  }
});
