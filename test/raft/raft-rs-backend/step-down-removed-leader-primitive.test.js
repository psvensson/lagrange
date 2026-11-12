// The fifth fork fix of the raft-rs binding (2026-11-11), on the binding
// itself (the raw core, no host): step_down_removed_leader.
//
// raft-rs keeps a leader that applied its own removal leading
// (raft.rs post_conf_change: "TODO(tbg): step down (for sanity)") with no
// Progress for itself, and the two places that advance its commit index
// unwrap that Progress: maybe_commit (raft.rs:943, an acknowledgement
// commits an entry it still held uncommitted) and on_persist_entries
// (raft.rs:1055). On wasm32 that unwrap aborts the module.
//
//   - the function is inert for a follower and for a legitimate leader: a
//     tagged refusal naming the state, and term, role, vote and commit as
//     they were;
//   - for a leader its applied configuration removed it is raft-rs's own
//     become_follower at the current term: same term and vote, no leader
//     known, a Ready that carries the soft state and no hard-state change,
//     and the function refuses again afterwards;
//   - between take_ready and advance_append with messages queued it refuses
//     by name (raft-rs's advance_append refuses new messages from a node
//     that does not lead) and steps down once that Ready is advanced;
//   - the second unwrap: a Ready that carries entries to persist together
//     with the leader's own committed removal, handled in the host's order
//     (apply, then advance_append), aborts nothing once the step-down is
//     entered at the apply.
// The host that enters it: removed-leader-binding-step-down.test.js.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_RS_CORE_PRIMITIVES} from
  '../../../src/raft/raft-rs-core-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {loadRaftRsCore} from './raw-raft-rs-test-core.js';

const STEP_DOWN = 'step_down_removed_leader';
const REFUSAL_KIND = 'raft-rs-refusal';
const LEADER_STATE = 2;
const FOLLOWER_STATE = 0;
const NO_LEADER = '0';
const TUNING = Object.freeze({electionTick: 10, heartbeatTick: 1,
  preVote: true, checkQuorum: true});

function rawNode(core, id, voters) {
  return core.create_node({id, peers: voters, ...TUNING});
}

// One Ready cycle of a raw node in the production host's order; answers the
// messages it sent and the conf changes it applied.
function rawCycle(core, handle) {
  const ready = core.take_ready(handle);
  core.persist_ready(handle);
  const light = core.advance_append(handle);
  if (light.commitIndex !== undefined) {
    core.persist_commit_index(handle, light.commitIndex);
  }
  const applied = [];
  for (const entry of [...ready.committedEntries, ...light.committedEntries]) {
    if (entry.entryType !== 0) {
      const change = core.decode_conf_change_entry(entry.entryType, entry.data);
      core.set_conf_state(handle, core.apply_conf_change(handle, change));
      applied.push(change);
    }
  }
  core.advance_apply(handle);
  return {ready, applied, messages: [...ready.messages,
    ...ready.persistedMessages, ...light.messages]};
}

function rawDrain(core, handle) {
  const out = {messages: [], applied: [], readies: []};
  while (core.has_ready(handle)) {
    const cycle = rawCycle(core, handle);
    out.messages.push(...cycle.messages);
    out.applied.push(...cycle.applied);
    out.readies.push(cycle.ready);
  }
  return out;
}

// Deliver between two raw nodes until both are quiet.
function rawSettle(core, handles) {
  let pending = Object.values(handles).flatMap((handle) =>
    rawDrain(core, handle).messages);
  for (let burst = 0; pending.length > 0; burst += 1) {
    assert.ok(burst < 100, 'raw delivery settles');
    const next = [];
    for (const message of pending) {
      core.step(handles[message.to], message);
      next.push(...rawDrain(core, handles[message.to]).messages);
    }
    pending = next;
  }
}

function facts(core, handle) {
  const {raftState, term, vote, commit, lead, promotable} = core.status(handle);
  return {raftState, term, vote, commit, lead, promotable};
}

function refusalOf(call) {
  try {
    return {answered: call()};
  } catch (thrown) {
    return {refusal: thrown};
  }
}

test('the binding exports step_down_removed_leader and the facade carries ' +
  'it: a missing export is a load-time error', () => {
  assert.ok(RAFT_RS_CORE_PRIMITIVES.includes(STEP_DOWN));
  assert.equal(typeof loadRaftRsCore()[STEP_DOWN], 'function');
});

test('step_down_removed_leader is inert for a follower and for a ' +
  'legitimate leader: a tagged refusal naming the state, nothing changed',
() => {
  const core = loadRaftRsCore();
  const handles = {1: rawNode(core, '1', ['1', '2']),
    2: rawNode(core, '2', ['1', '2'])};
  try {
    const followerBefore = facts(core, handles[1]);
    assert.deepEqual(refusalOf(() => core[STEP_DOWN](handles[1])), {
      refusal: {kind: REFUSAL_KIND,
        message: 'step_down_removed_leader: not leader'}});
    assert.deepEqual(facts(core, handles[1]), followerBefore);
    assert.equal(core.has_ready(handles[1]), false,
      'a refused follower holds no Ready');
    core.campaign(handles[1]);
    rawSettle(core, handles);
    const leaderBefore = facts(core, handles[1]);
    assert.equal(leaderBefore.raftState, LEADER_STATE, 'setup: 1 leads');
    assert.deepEqual(refusalOf(() => core[STEP_DOWN](handles[1])), {
      refusal: {kind: REFUSAL_KIND,
        message: 'step_down_removed_leader: still promotable'}});
    assert.deepEqual(facts(core, handles[1]), leaderBefore,
      'term, role, vote, commit and leader unchanged');
    assert.equal(core.has_ready(handles[1]), false,
      'a refused leader holds no Ready');
    // The follower of that leader is refused too, and keeps its leader.
    const peerBefore = facts(core, handles[2]);
    assert.equal(refusalOf(() => core[STEP_DOWN](handles[2])).refusal.message,
      'step_down_removed_leader: not leader');
    assert.deepEqual(facts(core, handles[2]), peerBefore);
    // The leader still takes a write after both refusals.
    core.propose(handles[1], new Uint8Array([1]));
    rawSettle(core, handles);
    assert.equal(BigInt(facts(core, handles[1]).commit),
      BigInt(leaderBefore.commit) + 1n, 'the legitimate leader commits');
    assert.equal(refusalOf(() => core[STEP_DOWN](4242)).refusal.message,
      'invalid handle');
  } finally {
    Object.values(handles).forEach((handle) => core.free(handle));
  }
});

test('step_down_removed_leader makes a leader its applied configuration ' +
  'removed a follower at its own term, leaves a Ready the ordinary drain ' +
  'takes, and refuses afterwards', () => {
  const core = loadRaftRsCore();
  const handles = {1: rawNode(core, '1', ['1', '2']),
    2: rawNode(core, '2', ['1', '2'])};
  try {
    core.campaign(handles[1]);
    rawSettle(core, handles);
    // raft-rs itself takes a leader's own removal (the host's admission is
    // what refuses it); committed and applied, the leader is removed.
    core.propose_conf_change_v2(handles[1], {transition: 0, changes: [
      {changeType: RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE, nodeId: '1'}]});
    rawSettle(core, handles);
    const removed = facts(core, handles[1]);
    assert.deepEqual({raftState: removed.raftState,
      promotable: removed.promotable,
      voters: core.conf_state(handles[1]).voters}, {raftState: LEADER_STATE,
      promotable: false, voters: ['2']},
    'setup: raft-rs keeps the removed leader leading');
    assert.equal(refusalOf(() => core.propose(handles[1],
      new Uint8Array([1]))).refusal.kind, REFUSAL_KIND,
    'setup: and it drops every proposal');
    assert.deepEqual(core[STEP_DOWN](handles[1]),
      {steppedDown: true, term: removed.term});
    assert.deepEqual(facts(core, handles[1]), {...removed,
      raftState: FOLLOWER_STATE, lead: NO_LEADER},
    'a follower at the same term and vote, same commit, no leader known');
    const drained = rawDrain(core, handles[1]);
    assert.deepEqual(drained.readies.map((ready) => ({
      softState: ready.softState, hardState: ready.hardState,
      entries: ready.entries.length})), [{
      softState: {lead: NO_LEADER, raftState: FOLLOWER_STATE},
      hardState: undefined, entries: 0}],
    'one Ready: the soft state, no hard-state change, nothing to persist');
    assert.equal(refusalOf(() => core[STEP_DOWN](handles[1])).refusal.message,
      'step_down_removed_leader: not leader');
    // Ticks never make it campaign again (it is not promotable), and the
    // voter that remains elects itself by its own timeout.
    for (let tick = 0; tick < 3 * TUNING.electionTick; tick += 1) {
      core.tick(handles[1]);
      core.tick(handles[2]);
      rawSettle(core, handles);
    }
    assert.equal(facts(core, handles[1]).raftState, FOLLOWER_STATE);
    assert.equal(facts(core, handles[2]).raftState, LEADER_STATE,
      'the remaining voter leads');
  } finally {
    Object.values(handles).forEach((handle) => core.free(handle));
  }
});

const REMOVE_ONE = Object.freeze({transition: 0, changes: [
  {changeType: RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE, nodeId: '1'}]});

// Leader 1 of {1, 2} whose own RemoveNode(1) is committed but not yet taken
// in a Ready: proposed and persisted, acknowledged by 2, nothing drained
// since. `proposeBeforeReady` adds an entry of its own before that Ready.
function leaderAboutToApplyItsRemoval(core, handles) {
  core.campaign(handles[1]);
  rawSettle(core, handles);
  core.propose_conf_change_v2(handles[1], REMOVE_ONE);
  const [append] = rawDrain(core, handles[1]).messages;
  core.step(handles[2], append);
  const [acknowledgement] = rawDrain(core, handles[2]).messages;
  core.step(handles[1], acknowledgement);
}

// The host's order for the Ready's own committed entries: persisted, applied,
// and only then advance_append (raft-rs-runtime-owner.js finishReady).
function applyOwnRemovalBeforeAdvance(core, handle) {
  const ready = core.take_ready(handle);
  core.persist_ready(handle);
  const [removal] = ready.committedEntries.filter((entry) =>
    entry.entryType !== 0);
  core.set_conf_state(handle, core.apply_conf_change(handle,
    core.decode_conf_change_entry(removal.entryType, removal.data)));
  return ready;
}

test('between take_ready and advance_append with messages queued the ' +
  'step-down is refused by name and nothing changes; once that Ready is ' +
  'advanced it steps down', () => {
  const core = loadRaftRsCore();
  const handles = {1: rawNode(core, '1', ['1', '2']),
    2: rawNode(core, '2', ['1', '2'])};
  try {
    leaderAboutToApplyItsRemoval(core, handles);
    const ready = core.take_ready(handles[1]);
    core.persist_ready(handles[1]);
    // An entry proposed while that Ready is outstanding queues its appends
    // in the core (the leader is still a voter here).
    core.propose(handles[1], new Uint8Array([7]));
    const [removal] = ready.committedEntries.filter((entry) =>
      entry.entryType !== 0);
    core.set_conf_state(handles[1], core.apply_conf_change(handles[1],
      core.decode_conf_change_entry(removal.entryType, removal.data)));
    const removed = facts(core, handles[1]);
    assert.deepEqual({raftState: removed.raftState,
      promotable: removed.promotable}, {raftState: LEADER_STATE,
      promotable: false}, 'setup: a removed leader, its Ready outstanding');
    assert.deepEqual(refusalOf(() => core[STEP_DOWN](handles[1])), {
      refusal: {kind: REFUSAL_KIND, message:
        'step_down_removed_leader: ready outstanding with queued messages'}});
    assert.deepEqual(facts(core, handles[1]), removed, 'nothing changed');
    // The Ready is advanced as a leader's (its queued messages leave in the
    // LightReady); then the step-down is taken.
    const light = core.advance_append(handles[1]);
    assert.ok(light.messages.length > 0, 'the queued messages left');
    core.advance_apply(handles[1]);
    assert.deepEqual(core[STEP_DOWN](handles[1]),
      {steppedDown: true, term: removed.term});
    rawDrain(core, handles[1]);
    assert.equal(facts(core, handles[1]).raftState, FOLLOWER_STATE);
  } finally {
    Object.values(handles).forEach((handle) => core.free(handle));
  }
});

test('a Ready that carries entries to persist together with the leader\'s ' +
  'own committed removal: stepped down at the apply, its advance_append ' +
  'aborts nothing (raft.rs on_persist_entries)', () => {
  const core = loadRaftRsCore();
  const handles = {1: rawNode(core, '1', ['1', '2']),
    2: rawNode(core, '2', ['1', '2'])};
  try {
    leaderAboutToApplyItsRemoval(core, handles);
    // Proposed before the Ready is taken: the one Ready then holds this
    // entry to persist and the committed RemoveNode(1).
    core.propose(handles[1], new Uint8Array([7]));
    const ready = applyOwnRemovalBeforeAdvance(core, handles[1]);
    assert.ok(ready.entries.length > 0 && ready.committedEntries.length > 0,
      'setup: one Ready with entries to persist and the committed removal');
    const removed = facts(core, handles[1]);
    assert.deepEqual(core[STEP_DOWN](handles[1]),
      {steppedDown: true, term: removed.term},
      'no message is queued (the Ready took them): the step-down is taken');
    // As a leader this advance would reach on_persist_entries' unwrap of the
    // Progress the removed leader no longer has.
    const light = core.advance_append(handles[1]);
    assert.deepEqual(light.messages, []);
    core.advance_apply(handles[1]);
    rawDrain(core, handles[1]);
    assert.deepEqual(facts(core, handles[1]), {...removed,
      raftState: FOLLOWER_STATE, lead: NO_LEADER});
    // The module is alive: the other node still answers.
    assert.equal(facts(core, handles[2]).raftState, FOLLOWER_STATE);
  } finally {
    Object.values(handles).forEach((handle) => core.free(handle));
  }
});
