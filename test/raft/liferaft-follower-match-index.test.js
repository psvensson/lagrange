/**
 * Leader-observed follower replication progress (quest
 * learner-promotion-progress-proof).
 *
 * Every follower acks each durably saved entry (base liferaft 'append ack'
 * and the fork's batch tail ack). The fork RETAINS that signal per follower
 * address as the leader-side match index — the replication-progress truth
 * the learner-promotion proof consumes — and clears it on every raft state
 * change so a stale leader's observations die with its tenure.
 *
 * Red-on-revert: without the retention (recordFollowerMatchIndex in
 * liferaft.js), readFollowerMatchIndex stays UNAVAILABLE forever and every
 * assertion below fails.
 */

import {test} from '../../src/test-helpers/tap.js';
import LifeRaft, {
  FOLLOWER_MATCH_INDEX_STATE,
  readFollowerMatchIndex,
} from '../../src/raft/liferaft.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';

const LEADER_ADDRESS = 'node-1/partition/p1-r1';
const FOLLOWER_ADDRESS = 'node-2/partition/p1-r2';
const OTHER_FOLLOWER_ADDRESS = 'node-3/partition/p1-r3';
const TERM = 1;
const ACK_INDEX_FOUR = 4;
const ACK_INDEX_SEVEN = 7;
const ACK_INDEX_TWO = 2;

function createRaft() {
  const raft = new LifeRaft(LEADER_ADDRESS, {Log: InMemoryLogAdapter});
  // Acks only count for the CURRENT term; pin a known term so the test's
  // ack packets (TERM) match the tenure under observation.
  raft.term = TERM;
  return raft;
}

function emitAppendAck(raft, followerAddress, index) {
  raft.emit('data', {
    type: RAFT_PACKET_TYPE.APPEND_ACK,
    term: TERM,
    address: followerAddress,
    data: {term: TERM, index},
  }, () => {});
}

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('follower match index is unavailable before any ack', async (t) => {
  const raft = createRaft();
  try {
    const observation = readFollowerMatchIndex(raft, FOLLOWER_ADDRESS);
    t.equal(
      observation.state,
      FOLLOWER_MATCH_INDEX_STATE.UNAVAILABLE,
      'no ack observed yet - progress must read unavailable (fail-closed)',
    );
    t.equal(observation.matchIndex, 0, 'unavailable progress reads as 0');
  } finally {
    raft.end();
  }
});

test('append acks record the highest acked index per follower', async (t) => {
  const raft = createRaft();
  try {
    emitAppendAck(raft, FOLLOWER_ADDRESS, ACK_INDEX_FOUR);
    await settle();
    let observation = readFollowerMatchIndex(raft, FOLLOWER_ADDRESS);
    t.equal(
      observation.state,
      FOLLOWER_MATCH_INDEX_STATE.AVAILABLE,
      'an observed ack makes progress available',
    );
    t.equal(observation.matchIndex, ACK_INDEX_FOUR, 'match index = acked index');

    emitAppendAck(raft, FOLLOWER_ADDRESS, ACK_INDEX_SEVEN);
    await settle();
    observation = readFollowerMatchIndex(raft, FOLLOWER_ADDRESS);
    t.equal(observation.matchIndex, ACK_INDEX_SEVEN, 'match index advances');

    // A late-arriving lower ack must never regress the observed progress.
    emitAppendAck(raft, FOLLOWER_ADDRESS, ACK_INDEX_TWO);
    await settle();
    observation = readFollowerMatchIndex(raft, FOLLOWER_ADDRESS);
    t.equal(
      observation.matchIndex,
      ACK_INDEX_SEVEN,
      'stale lower ack does not regress the match index',
    );

    const other = readFollowerMatchIndex(raft, OTHER_FOLLOWER_ADDRESS);
    t.equal(
      other.state,
      FOLLOWER_MATCH_INDEX_STATE.UNAVAILABLE,
      'progress is tracked per follower address',
    );
  } finally {
    raft.end();
  }
});

test('state change clears all observed progress (tenure-scoped)', async (t) => {
  const raft = createRaft();
  try {
    emitAppendAck(raft, FOLLOWER_ADDRESS, ACK_INDEX_SEVEN);
    await settle();
    t.equal(
      readFollowerMatchIndex(raft, FOLLOWER_ADDRESS).state,
      FOLLOWER_MATCH_INDEX_STATE.AVAILABLE,
      'progress recorded before the state change',
    );

    raft.change({state: LifeRaft.CANDIDATE});

    const observation = readFollowerMatchIndex(raft, FOLLOWER_ADDRESS);
    t.equal(
      observation.state,
      FOLLOWER_MATCH_INDEX_STATE.UNAVAILABLE,
      'a raft state change invalidates every observation - a stale ' +
        'leader can never serve progress from a dead tenure',
    );
  } finally {
    raft.end();
  }
});

test('an ack from a different term is never recorded', async (t) => {
  const raft = createRaft();
  try {
    raft.emit('data', {
      type: RAFT_PACKET_TYPE.APPEND_ACK,
      term: TERM + 1,
      address: FOLLOWER_ADDRESS,
      data: {term: TERM + 1, index: ACK_INDEX_FOUR},
    }, () => {});
    raft.emit('data', {
      type: RAFT_PACKET_TYPE.APPEND_ACK,
      term: TERM - 1,
      address: FOLLOWER_ADDRESS,
      data: {term: TERM - 1, index: ACK_INDEX_FOUR},
    }, () => {});
    await settle();
    t.equal(
      readFollowerMatchIndex(raft, FOLLOWER_ADDRESS).state,
      FOLLOWER_MATCH_INDEX_STATE.UNAVAILABLE,
      'a delayed cross-term ack is not progress evidence for this tenure',
    );
  } finally {
    raft.end();
  }
});

test('malformed acks are ignored', async (t) => {
  const raft = createRaft();
  try {
    emitAppendAck(raft, FOLLOWER_ADDRESS, Number.NaN);
    raft.emit('data', {
      type: RAFT_PACKET_TYPE.APPEND_ACK,
      term: TERM,
      address: FOLLOWER_ADDRESS,
      data: {},
    }, () => {});
    await settle();
    t.equal(
      readFollowerMatchIndex(raft, FOLLOWER_ADDRESS).state,
      FOLLOWER_MATCH_INDEX_STATE.UNAVAILABLE,
      'acks without a finite index never create progress evidence',
    );
  } finally {
    raft.end();
  }
});
