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
  liveReplicas,
  peerIdIn,
  plantDisagreeingRows,
  prefixFilter,
  roleOf,
  settle,
  termAndVote,
} from './evidence-o1-model.js';
import {durableLog} from './committed-membership-oracles.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {PARTICIPATION_GATE} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_RS_GROUP_TUNING} from
  '../../../src/raft/raft-rs-group-constants.js';
import {RealTimeSource} from '../../../src/time/time-source.js';

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
