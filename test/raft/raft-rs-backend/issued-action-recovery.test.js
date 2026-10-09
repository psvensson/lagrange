/** Native issued-action evidence, not the production recipient/CREATE route.
 * Uses the existing low-level Ready driver, native core and per-peer SQLite.
 * No test deduces non-commitment, cancellation or reissue from absent evidence.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as contexts from '../../../src/raft/raft-rs-committed-membership-context.js';
import {deriveRaftRsPeerId} from '../../../src/raft/raft-rs-peer-identity.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE as STAGE} from
  '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE as CHANGE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {DeterministicRaftRsCluster} from './deterministic-raft-rs-cluster.js';

const GROUP = 'issued-action-evidence';
const TARGET = 'issued-action-fresh-target';
const VOTERS = ['1', '2', '3'];
const ACTION = Object.freeze({operationId: 'issued-operation',
  transitionIdentity: 'issued-transition', permitSequence: 1,
  stage: STAGE.ADD_LEARNER, replicaIdentity: TARGET, peerId: deriveRaftRsPeerId(TARGET)});
const state = (c, id) => c.peer(id).store.readDurableRecord(GROUP);

function fixture(t) {
  const c = new DeterministicRaftRsCluster({voters: VOTERS, groupId: GROUP,
    storeFactory: (db) => {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = FULL');
      assert.equal(db.pragma('journal_mode', {simple: true}), 'wal',
        'every fixture open must actually use WAL');
      assert.equal(db.pragma('synchronous', {simple: true}), 2,
        'every fixture open must retain FULL synchronization');
      return new RaftRsDurableStore(db);
    }});
  t.after(() => c.dispose());
  assert.ok(c.campaign('1'));
  assert.ok(c.settle(() => VOTERS.every((id) => BigInt(state(c, id).appliedIndex) > 0n),
    {tickOnly: ['1']}), 'native founding leader must commit and apply first');
  return c;
}
function propose(c, id = '1', action = ACTION, changeType = CHANGE.ADD_LEARNER_NODE) {
  c.core.propose_conf_change_v2(c.peer(id).handle, {transition: 0,
    changes: [{changeType, nodeId: action.peerId}],
    context: contexts.encodeCommittedMembershipContext(action)});
}
function observe(c, id = '1', action = ACTION, record = state(c, id)) {
  assert.equal(typeof contexts.observeRetainedMembershipAction, 'function',
    'the context owner must distinguish exact applied action from role-only evidence');
  return contexts.observeRetainedMembershipAction({groupId: GROUP, record, action,
    decodeEntry: c.core.decode_conf_change_entry});
}
function applyLearner(c) {
  propose(c);
  assert.ok(c.settle(() => VOTERS.every((id) =>
    c.confState(id).learners.includes(ACTION.peerId)), {tickOnly: ['1']}));
}
function expectedCommitted(c, id = '1') {
  const observed = observe(c, id);
  assert.equal(observed.kind, 'committed-action');
  assert.equal(observed.groupId, GROUP);
  assert.deepEqual(observed.action, ACTION);
  assert.ok(BigInt(observed.index) <= BigInt(state(c, id).appliedIndex));
  assert.ok(BigInt(observed.index) <= BigInt(state(c, id).hardState.commit));
  assert.ok(Object.isFrozen(observed));
  assert.ok(Object.isFrozen(observed.action));
  return observed;
}

// Observe the old resources before reconstruction, not a copied expected result.
// Native numeric handles may be reused, so test invalidity BEFORE reopening.
function closedPeer(c, id) {
  const peer = c.peer(id);
  const previous = {db: peer.db, store: peer.store, file: peer.dbFile, handle: peer.handle};
  c.crash(id);
  assert.equal(previous.db.open, false, 'reconstruction must close the previous SQLite connection');
  assert.equal(peer.live, false, 'the old peer must be stopped before reconstruction');
  assert.throws(() => c.core.status(previous.handle),
    (error) => error?.kind === 'raft-rs-refusal' && error.message === 'invalid handle',
    'reconstruction must free the old native handle before reopening');
  return previous;
}
function reopenedPeer(c, id, previous) {
  c.restart(id);
  const peer = c.peer(id);
  assert.equal(peer.db === previous.db, false,
    'reconstruction must open a new SQLite connection');
  assert.equal(peer.store === previous.store, false,
    'reconstruction must create a new durable-store owner');
  assert.equal(peer.dbFile, previous.file, 'reconstruction must use the same durable file');
  assert.equal(peer.db.open, true);
  assert.equal(peer.live, true);
  assert.ok(c.core.status(peer.handle), 'the reconstructed native handle must be usable');
}

test('exact original learner evidence survives a lost reply and native reconstruction', (t) => {
  const c = fixture(t);
  applyLearner(c);
  // No proposal-return value is used to establish committed application.
  const before = expectedCommitted(c);
  const closed = VOTERS.map((id) => closedPeer(c, id));
  VOTERS.forEach((id, index) => reopenedPeer(c, id, closed[index]));
  assert.deepEqual(expectedCommitted(c), before,
    'reopening native handles and durable records must recover the same action entry');
});

test('unanswered prior-term learner can commit under a new leader without reissue', (t) => {
  const c = fixture(t);
  const route = c.route.bind(c);
  const held = [];
  c.route = (messages) => {
    for (const message of messages) {
      if (message.to === '1' && message.from === '2') held.push(message);
      else if (message.to !== '3' && message.from !== '3') route([message]);
    }
  };
  propose(c);
  for (let round = 0; round < 8; round += 1) {
    c.tick(['1']); c.runReady(); c.deliver(); c.runReady();
  }
  assert.ok(held.length > 0, 'follower replies were actually withheld');
  const original = state(c, '1').entries.at(-1);
  assert.equal(original.index, state(c, '2').entries.at(-1).index,
    'the potential successor must actually retain the unanswered entry');
  assert.ok(BigInt(original.index) > BigInt(state(c, '1').hardState.commit));
  assert.ok(BigInt(original.index) > BigInt(state(c, '2').appliedIndex));
  assert.equal(observe(c, '2').kind, 'unresolved-action',
    'retention in a log is not applied commitment');
  const before = state(c, '2');
  c.crash('1');
  c.route = route;
  // Both survivors' clocks advance: leaving one follower's leader lease
  // permanently unticked would be an apparatus error, not failed recovery.
  assert.ok(c.settle(() => c.status('2').lead === '2', {tickOnly: ['2', '3']}));
  assert.ok(BigInt(c.status('2').term) > BigInt(original.term));
  assert.ok(c.settle(() => ['2', '3'].every((id) =>
    c.confState(id).learners.includes(ACTION.peerId)), {tickOnly: ['2']}));
  const recovered = expectedCommitted(c, '2');
  assert.equal(recovered.index, original.index);
  assert.equal(recovered.term, original.term,
    'the original entry, not a manufactured successor action, committed');
  t.diagnostic(JSON.stringify({schedule: 'retained-entry-commits-on-new-leader',
    originalEntry: {index: original.index, term: original.term},
    before: {term: before.hardState.term, commit: before.hardState.commit,
      applied: before.appliedIndex},
    after: {term: c.status('2').term, commit: state(c, '2').hardState.commit,
      applied: state(c, '2').appliedIndex}, recovered}));
  const closed = closedPeer(c, '2');
  reopenedPeer(c, '2', closed);
  assert.deepEqual(expectedCommitted(c, '2'), recovered);
});

test('an isolated unanswered learner may instead be overwritten: absence stays unresolved', (t) => {
  const c = fixture(t);
  c.partition('1');
  propose(c);
  c.runReady();
  const original = state(c, '1').entries.at(-1);
  assert.ok(BigInt(original.index) > BigInt(state(c, '1').hardState.commit));
  assert.equal(observe(c).kind, 'unresolved-action');
  c.crash('1');
  assert.ok(c.settle(() => ['2', '3'].some((id) => c.status(id).lead === id),
    {tickOnly: ['2', '3']}));
  const leader = ['2', '3'].find((id) => c.status(id).lead === id);
  assert.ok(c.settle(() => BigInt(state(c, leader).appliedIndex) >= BigInt(original.index),
    {tickOnly: [leader]}));
  c.restart('1'); c.heal('1');
  assert.ok(c.settle(() => BigInt(state(c, '1').hardState.term) > BigInt(original.term) &&
    BigInt(state(c, '1').appliedIndex) >= BigInt(original.index), {tickOnly: [leader]}));
  assert.ok(!c.confState('1').learners.includes(ACTION.peerId));
  assert.notEqual(state(c, '1').entries.find((e) => e.index === original.index)?.data,
    original.data, 'the original suffix was actually replaced');
  const unresolved = observe(c);
  assert.equal(unresolved.kind, 'unresolved-action',
    'the observer grants neither cancellation nor a successor permit');
  t.diagnostic(JSON.stringify({schedule: 'minority-entry-overwritten',
    originalEntry: {index: original.index, term: original.term},
    replacementEntry: state(c, '1').entries.find((e) => e.index === original.index),
    currentTerm: state(c, '1').hardState.term, outcome: unresolved}));
});

test('all six original context dimensions must match, not just learner role', (t) => {
  const c = fixture(t);
  applyLearner(c);
  expectedCommitted(c);
  const alternatives = [{operationId: 'other-operation'},
    {transitionIdentity: 'other-transition'}, {permitSequence: 2},
    {stage: STAGE.PROMOTE},
    {replicaIdentity: 'other-target', peerId: deriveRaftRsPeerId('other-target')}];
  for (const difference of alternatives) {
    assert.equal(observe(c, '1', {...ACTION, ...difference}).kind, 'unresolved-action',
      `wrong original action must not obtain this learner's receipt: ${
        JSON.stringify(difference)}`);
  }
  assert.throws(() => observe(c, '1', {...ACTION, peerId: '1'}), /derived identity/);
});

test('malformed or unavailable durable evidence cannot become non-commitment', (t) => {
  const c = fixture(t);
  applyLearner(c);
  const good = state(c, '1');
  for (const record of [null, {...good, hardState: null},
    {...good, appliedIndex: '01'}, {...good, appliedIndex: '99999'},
    {...good, entries: good.entries.map((entry) => entry.entryType === 0 ? entry :
      {...entry, term: '0'})},
    {...good, entries: [...good.entries].reverse()},
    {...good, entries: good.entries.map((entry) => entry.entryType === 0 ? entry :
      {...entry, data: 'not-a-native-conf-change'})}]) {
    assert.equal(observe(c, '1', ACTION, record).kind, 'action-evidence-unavailable',
      'malformed durable evidence must be unavailable');
  }
  const lagging = {...good, appliedIndex: '1'};
  assert.equal(observe(c, '1', ACTION, lagging).kind, 'unresolved-action',
    'a committed but not durably applied action is not yet an applied receipt');
});

test('configuration without action history cannot authorize recovery by guess', (t) => {
  const c = fixture(t);
  applyLearner(c);
  expectedCommitted(c);
  const record = state(c, '1');
  // This is an explicitly projected pruned view, NOT a snapshot-install test.
  // It establishes the observer's refusal ceiling before retention is wired.
  assert.ok(record.confState.learners.includes(ACTION.peerId));
  assert.equal(observe(c, '1', ACTION, {...record, entries: []}).kind, 'unresolved-action',
    'role, applied index and configuration do not replace lost original context');
});

test('historical ADD evidence is not current CREATE eligibility after actual REMOVE', (t) => {
  const c = fixture(t);
  applyLearner(c);
  const receipt = expectedCommitted(c);
  const removal = {...ACTION, permitSequence: 2, stage: STAGE.REMOVE};
  propose(c, '1', removal, CHANGE.REMOVE_NODE);
  assert.ok(c.settle(() => VOTERS.every((id) =>
    !c.confState(id).learners.includes(ACTION.peerId)), {tickOnly: ['1']}));
  assert.deepEqual(expectedCommitted(c), receipt,
    'historical evidence remains historical, never a live join descriptor');
  assert.equal(observe(c, '1', removal).kind, 'committed-action');
});


test('snapshot-covered residual log bytes cannot impersonate a retained action receipt', (t) => {
  const c = fixture(t);
  applyLearner(c);
  const receipt = expectedCommitted(c);
  const record = state(c, '1');
  const covered = {...record, snapshot: {metadata: {index: receipt.index}}};
  assert.equal(observe(c, '1', ACTION, covered).kind, 'unresolved-action',
    'covered raw entries cannot establish which actions the installed image contains');
  const uncovered = {...record, snapshot: {metadata: {index: '1'}}};
  assert.deepEqual(observe(c, '1', ACTION, uncovered), receipt,
    'the actual post-cut committed entry remains readable');
});
