// The disruptive-server requirement on raft-rs's own pre_vote and
// check_quorum (owner ruling 2026-10-05: the host's non-member vote refusal
// is removed; no host-side lease), with every opened replica ticked - a gated
// joiner is a learner of its own configuration, which raft-rs never
// campaigns. Each schedule runs on production partition ports (guarded) and
// on raft-rs alone with the same settings (plain), real WASM core both
// (native-election-schedules.js); the guarded stack must elect wherever plain
// raft-rs elects.
//
//   P3 gated     the verifier's B1 schedule: RF3 {a,b,c}; t added while only
//                heartbeats reach it (it follows a, its gate stays closed); n
//                added, b and c removed, a lost: {n,t} elect (before: t, never
//                ticked and refusing the non-member n, locked the group out);
//   P3 stale     finding-lease.txt: {a,b,c,d,e}, cut {a,c} | {b,d,e}; the
//                majority elects L, adds n, removes a and the other two; L and
//                they are lost, the cut heals: {c,n} elect although the stale
//                a still heartbeats c (check_quorum steps a down; c's lease
//                runs out on its own ticks);
//   P4 learner   RF1 {a} with learner L cut off; n added, L promoted while cut
//                off, a lost: {n,L} elect;
//   P2           a removed ex-member and a never-member send higher-term vote
//                and pre-vote requests to a healthy leader and a follower:
//                nothing moves (raft-rs ignores them in lease), exactly as
//                plain raft-rs; their higher-term heartbeat deposes the
//                receiver in both stacks alike (the stated residual: an
//                append or heartbeat from outside the configuration is
//                stepped, because a new leader the receiver has not applied
//                sends exactly those), and the members re-elect.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  RAFT_RS_CONF_CHANGE_TYPE,
  SCHEDULE_KIND,
} from './native-election-schedules.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../../src/raft/raft-rs-ingress-constants.js';

const SETUP_ROUNDS = 300;
const CONVERGENCE_ROUNDS = 400;
const {ADD_NODE, REMOVE_NODE, ADD_LEARNER_NODE} = RAFT_RS_CONF_CHANGE_TYPE;
const KINDS = Object.keys(SCHEDULE_KIND);

function setup(schedule, holds, message) {
  assert.ok(holds, `setup (${schedule.constructor.name}): ${message}`);
}

function elect(schedule, ticking, leader) {
  setup(schedule, schedule.run(ticking, SETUP_ROUNDS,
    () => schedule.leaderOf(ticking) === leader), `${leader} does not lead`);
}

// Commit one configuration change on `leader`, ticking `ticking`, until
// `settled` reads true.
function commitChange(schedule, {leader, ticking, type, name, settled}) {
  schedule.change(leader, type, name);
  setup(schedule, schedule.run(ticking, SETUP_ROUNDS, settled),
    `change ${type} of ${name} did not settle`);
}

function holdsVoter(schedule, holder, name) {
  return schedule.voters(holder).includes(name);
}

function gatedSchedule(Kind) {
  const schedule = new Kind('ng', ['a', 'b', 'c']);
  elect(schedule, ['a'], 'a');
  schedule.join('a', 't');
  schedule.onlyHeartbeatsTo.add('t');
  commitChange(schedule, {leader: 'a', ticking: ['a'], type: ADD_NODE,
    name: 't', settled: () => holdsVoter(schedule, 'a', 't') &&
      ['b', 'c'].every((name) => holdsVoter(schedule, name, 't'))});
  // t heard a's heartbeats only: it follows a, without its admission.
  schedule.run(['a'], 3);
  schedule.lost.add('t');
  schedule.onlyHeartbeatsTo.delete('t');
  schedule.join('a', 'n');
  commitChange(schedule, {leader: 'a', ticking: ['a'], type: ADD_NODE,
    name: 'n', settled: () => holdsVoter(schedule, 'n', 'n')});
  for (const removed of ['b', 'c']) {
    commitChange(schedule, {leader: 'a', ticking: ['a'], type: REMOVE_NODE,
      name: removed, settled: () => !holdsVoter(schedule, 'a', removed) &&
        !holdsVoter(schedule, 'n', removed)});
  }
  setup(schedule, !holdsVoter(schedule, 't', 'n'),
    'the cut-off t already holds n');
  for (const lost of ['a', 'b', 'c']) {
    schedule.lost.add(lost);
  }
  schedule.lost.delete('t');
  return schedule;
}

function staleLeaderSchedule(Kind) {
  const founders = ['a', 'b', 'c', 'd', 'e'];
  const schedule = new Kind('ns', founders);
  elect(schedule, ['a'], 'a');
  const minority = new Set(['a', 'c']);
  const majority = ['b', 'd', 'e'];
  schedule.cuts.push([minority, new Set([...majority, 'n'])]);
  // The minority is stalled (its clocks do not advance), so a is still a
  // stale leader of c when the cut heals: what follows is check_quorum's.
  setup(schedule, schedule.run(majority, SETUP_ROUNDS, () =>
    schedule.leaderOf(majority) !== null), 'the majority side elects no one');
  const leader = schedule.leaderOf(majority);
  const others = majority.filter((name) => name !== leader);
  schedule.join(leader, 'n');
  const ticking = [...majority, 'n'];
  commitChange(schedule, {leader, ticking, type: ADD_NODE, name: 'n',
    settled: () => holdsVoter(schedule, 'n', 'n')});
  for (const removed of ['a', ...others]) {
    commitChange(schedule, {leader, ticking, type: REMOVE_NODE,
      name: removed, settled: () => !holdsVoter(schedule, leader, removed) &&
        !holdsVoter(schedule, 'n', removed)});
  }
  setup(schedule, schedule.leaderOf(['a', 'c']) === 'a',
    'the stale a does not lead c');
  for (const lost of [leader, ...others]) {
    schedule.lost.add(lost);
  }
  schedule.cuts.length = 0;
  return schedule;
}

function learnerSchedule(Kind) {
  const schedule = new Kind('nl', ['a']);
  elect(schedule, ['a'], 'a');
  schedule.join('a', 'l');
  commitChange(schedule, {leader: 'a', ticking: ['a', 'l'],
    type: ADD_LEARNER_NODE, name: 'l', settled: () =>
      schedule.learners('l').includes('l') &&
      schedule.leaderOf(['a', 'l']) === 'a'});
  schedule.lost.add('l');
  schedule.join('a', 'n');
  commitChange(schedule, {leader: 'a', ticking: ['a', 'n'], type: ADD_NODE,
    name: 'n', settled: () => holdsVoter(schedule, 'n', 'n')});
  commitChange(schedule, {leader: 'a', ticking: ['a', 'n'], type: ADD_NODE,
    name: 'l', settled: () => holdsVoter(schedule, 'a', 'l') &&
      holdsVoter(schedule, 'n', 'l')});
  setup(schedule, !holdsVoter(schedule, 'l', 'l'),
    'the cut-off learner already knows its promotion');
  schedule.lost.add('a');
  schedule.lost.delete('l');
  return schedule;
}

const SCHEDULES = [
  ['P3 gated: {n,t} elect after a is lost', gatedSchedule, ['n', 't']],
  ['P3 stale leader: {c,n} elect although the stale a heartbeats c',
    staleLeaderSchedule, ['c', 'n']],
  ['P4 learner: {n,l} elect after a is lost', learnerSchedule, ['n', 'l']],
];

for (const [title, build, live] of SCHEDULES) {
  test(`${title} - the guarded stack elects as plain raft-rs does`, () => {
    const outcomes = {};
    for (const kind of KINDS) {
      const schedule = build(SCHEDULE_KIND[kind]);
      try {
        const elected = schedule.run([...live, 'a'], CONVERGENCE_ROUNDS,
          () => schedule.leaderOf(live) !== null &&
            live.every((name) => holdsVoter(schedule, name, live[0]) &&
              holdsVoter(schedule, name, live[1])));
        outcomes[kind] = {elected, terms: live.map((name) =>
          schedule.term(name))};
      } finally {
        schedule.dispose();
      }
    }
    assert.equal(outcomes.plain.elected, true,
      `plain raft-rs does not elect: ${JSON.stringify(outcomes)}`);
    assert.equal(outcomes.guarded.elected, true,
      `the guarded stack stays leaderless where plain raft-rs elects: ${
        JSON.stringify(outcomes)}`);
  });
}

const HIGHER = 5;
const UNKNOWN_SENDER = '424242';

function forged(msgType, from, to, status) {
  const term = String(Number(status.term) + HIGHER);
  return {msgType, from, to, term,
    ...(msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT ? {commit: '0'} : {
      logTerm: term, index: String(Number(status.commitIndex) + 1000)})};
}

// One forged message from `sender` to `name`, stepped through the guarded
// port (envelope admission and guard included) or straight into the plain
// core; answers whether the recipient's term or role moved.
function moved(schedule, name, sender, msgType) {
  const before = schedule.status(name);
  if (schedule.constructor.name === 'GuardedSchedule') {
    const node = schedule.cluster.node(name);
    const to = before.peerId;
    node.step({groupId: schedule.prefix, from: sender, to,
      message: forged(msgType, sender, to, before)});
    node.tick();
  } else {
    const to = schedule.names.get(name);
    schedule.cluster.core.step(schedule.cluster.peer(to).handle,
      forged(msgType, sender, to, {term: before.term,
        commitIndex: before.commit}));
    schedule.cluster.runReady();
  }
  const after = schedule.status(name);
  return Number(after.term) !== Number(before.term) ||
    (after.role ?? after.raftState) !== (before.role ?? before.raftState);
}

test('P2: higher-term vote and pre-vote requests from a removed ex-member ' +
  'and a never-member move neither the leader nor a follower; their ' +
  'higher-term heartbeat deposes alike in both stacks and the members ' +
  're-elect', () => {
  const answers = {};
  for (const kind of KINDS) {
    const schedule = new SCHEDULE_KIND[kind]('np', ['a', 'b', 'c']);
    try {
      elect(schedule, ['a'], 'a');
      schedule.join('a', 'x');
      commitChange(schedule, {leader: 'a', ticking: ['a', 'x'],
        type: ADD_NODE, name: 'x', settled: () => holdsVoter(schedule, 'x',
          'x')});
      commitChange(schedule, {leader: 'a', ticking: ['a'],
        type: REMOVE_NODE, name: 'x', settled: () =>
          !holdsVoter(schedule, 'a', 'x') && !holdsVoter(schedule, 'b', 'x')});
      schedule.lost.add('x');
      const exMember = kind === 'guarded' ?
        schedule.cluster.raftPeerIdOf('x') : schedule.names.get('x');
      const row = {};
      for (const [label, sender] of [['ex-member', exMember],
        ['never-member', UNKNOWN_SENDER]]) {
        for (const msgType of [RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE,
          RAFT_RS_MESSAGE_TYPE.REQUEST_PRE_VOTE]) {
          for (const name of ['a', 'b']) {
            row[`${label}/${msgType}/${name}`] =
              moved(schedule, name, sender, msgType);
          }
        }
      }
      row.heartbeatDeposes = moved(schedule, 'a', UNKNOWN_SENDER,
        RAFT_RS_MESSAGE_TYPE.HEARTBEAT);
      row.reElected = schedule.run(['a', 'b', 'c'], CONVERGENCE_ROUNDS, () =>
        schedule.leaderOf(['a', 'b', 'c']) !== null);
      answers[kind] = row;
    } finally {
      schedule.dispose();
    }
  }
  for (const [key, value] of Object.entries(answers.guarded)) {
    if (key.includes('/')) {
      assert.equal(value, false, `guarded ${key} moved`);
    }
  }
  assert.deepEqual(answers.guarded, answers.plain,
    'the guarded stack answers a disruptive server unlike plain raft-rs');
  assert.equal(answers.guarded.reElected, true);
});
