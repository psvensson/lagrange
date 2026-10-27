// Direct anchors next to the differential oracle (coverage-model-amendment-1,
// "anchors against vacuity"). The oracle compares a pending run with a
// processed-first run, so a defect both runs share is invisible to it; each
// leg here states its expectation from raft-rs or the owner's own contract
// instead of from the other run:
//
//   - CA1: a delivered envelope whose step the core refuses never answers
//     the command queued behind it; the command runs on the post-drain state;
//   - D7 / CA5: the role, term and leader events a turn announces end where
//     the core is, with listeners that read status while being told (as
//     production's leadership listeners do), and without;
//   - B1 / F9b: once a turn has awaited a send, it enters the core again only
//     after the store admits persistence; with a user transaction opened
//     during the await, nothing enters the core until it ends;
//   - per-index timing: under production's per-replica election timing a
//     transfer the core cannot complete holds proposals for exactly the
//     leader's own election tick;
//   - F6: a transfer is decided and stepped in one turn: by the time the
//     port answers an accepted request, its MsgTransferLeader is stepped;
//   - R13: the per-sender record of refused inbound steps is bounded: past
//     INBOUND_STEP_REFUSAL_OBSERVATION_LIMIT senders, the sender refused
//     longest ago is evicted first, and a sender refused again is renewed;
//   - CA9: a leader demoted to learner by the canonical request keeps
//     leading; its transfer's dropped proposal is the transfer's.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  INBOUND_STEP_REFUSAL_OBSERVATION_LIMIT,
  PERSISTENCE_ADMISSION_WAIT,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {
  OracleRun,
  SEND_MODE,
  STEP,
  TIMING_MODE,
  bindingEnumerations,
  craft,
} from './transfer-leadership-drain-oracle-harness.js';
import {namedSuccessor} from './transfer-leadership-driver.js';

const {CORE_OK} = RAFT_OPERATION_OUTCOME;
const A = 'anchor-a';
const B = 'anchor-b';
const C = 'anchor-c';
const REPLICAS = Object.freeze([A, B, C]);
const ENUMERATIONS = bindingEnumerations();

async function formed(partitionId, axes = {}) {
  const run = new OracleRun({partitionId, replicaIds: REPLICAS, axes});
  await run.form();
  return run;
}

// The pending local-only types, one per cell, and a command queued behind.
for (const name of ENUMERATIONS.local) {
  test(`CA1: a pending ${name}, which the core refuses to step, never ` +
    'answers the proposal queued behind it', async () => {
    const run = await formed(`anchor-ca1-${name}`);
    try {
      craft(run, {to: A, from: B, msgType: ENUMERATIONS.types.get(name)});
      assert.equal(run.driver.stepUndrained(A), 1);
      const command = {behind: name};
      const answer = await run.act(() => run.driver.port(A).propose(command));
      assert.equal(answer.outcome, CORE_OK, JSON.stringify(answer));
      await run.deliver();
      assert.equal(run.driver.applied(A, command), true,
        'the proposal ran and committed');
    } finally {
      run.dispose();
    }
  });
}

// P3's shape at the requester: a higher-term vote request, then the new
// leader's append. The core ends following B.
for (const reentry of [true, false]) {
  test('D7/CA5: the events announced while a vote request and the new ' +
    'leader\'s append are processed end where the core is (listener ' +
    `re-entry ${reentry ? 'on' : 'off'})`, async () => {
    const run = await formed(`anchor-d7-${reentry}`, {reentry});
    try {
      // B's transfer election: the one a leader in its check-quorum lease
      // does not ignore; its vote request to A stays pending.
      await run.act(() =>
        run.driver.port(A).transferLeadership(namedSuccessor(B)));
      await run.deliverOnly([B]);
      await run.deliverOnly([C]);
      await run.deliverOnly([B]);
      assert.ok(run.driver.stepUndrained(A) >= 2,
        'precondition: the vote request and the append are pending');
      await run.act(() =>
        run.driver.port(A).transferLeadership(namedSuccessor(C)));
      assert.deepEqual(run.projectionMismatches(), [],
        'the subscriber projection equals the core after the turn');
      assert.equal(run.driver.status(A).leaderId, B,
        'precondition: the core follows B');
    } finally {
      run.dispose();
    }
  });
}

// Senders no configuration holds: every one of their responses is refused.
const UNKNOWN_SENDER_BASE = 9000000000000000000n;

function unknownSender(index) {
  return String(UNKNOWN_SENDER_BASE + BigInt(index));
}

async function refuseFrom(run, senders) {
  const heartbeatResponse = ENUMERATIONS.types.get('MsgHeartbeatResponse');
  for (const sender of senders) {
    craft(run, {to: A, from: B, fromRaftId: sender,
      msgType: heartbeatResponse});
  }
  run.driver.stepUndrained(A);
  await run.act(() => run.driver.port(A).readStatus());
}

test('R13: the record of refused inbound steps holds at most its bound of ' +
  'senders and evicts the one refused longest ago', async () => {
  const run = await formed('anchor-refusal-bound');
  try {
    const limit = INBOUND_STEP_REFUSAL_OBSERVATION_LIMIT;
    const senders = Array.from({length: limit + 1}, (_, index) =>
      unknownSender(index));
    await refuseFrom(run, senders.slice(0, limit));
    await refuseFrom(run, [senders[0]]);
    await refuseFrom(run, [senders[limit]]);
    const recorded = run.driver.status(A).inboundStepRefusals
      .map((refusal) => refusal.from);
    assert.equal(recorded.length, limit, 'the record is at its bound');
    assert.equal(recorded.includes(senders[1]), false,
      'the sender refused longest ago was evicted');
    assert.equal(recorded.includes(senders[0]), true,
      'a sender refused again was renewed');
    assert.equal(recorded.includes(senders[limit]), true,
      'the newest sender is recorded');
  } finally {
    run.dispose();
  }
});

test('B1/F9b: a turn that awaited a send enters the core again only once ' +
  'the store admits persistence', async () => {
  const run = await formed('anchor-admission-recheck');
  try {
    await run.act(() => run.driver.port(A).propose({acknowledged: 'held'}));
    await run.deliverOnly([B, C]);
    run.asyncSends = true;
    run.holdSends = true;
    run.driver.stepUndrained(A);
    let settledAnswer = null;
    const answer = Promise.resolve(run.driver.port(A).propose({x: 1}))
      .then((value) => {
        settledAnswer = value;
        return value;
      });
    await run.settle();
    assert.ok(run.held.length > 0, 'precondition: the turn awaits a send');
    const database = run.driver.cluster.replica(A).db;
    database.exec('BEGIN');
    const mark = run.coreOperations().length;
    run.releaseHeld();
    await run.settle();
    assert.deepEqual(run.coreOperations().slice(mark), [],
      'nothing enters the core while the user transaction is open');
    assert.equal(settledAnswer, null, 'the command waits');
    database.exec('ROLLBACK');
    run.driver.clock.advance(PERSISTENCE_ADMISSION_WAIT.POLL_INTERVAL_MS);
    await run.settle();
    assert.equal((await answer).outcome, CORE_OK);
    assert.ok(run.coreOperations().length > mark,
      'the turn resumed once admitted');
  } finally {
    run.dispose();
  }
});

test('F6: an accepted transfer is stepped in the turn that answers it',
  async () => {
    const run = await formed('anchor-one-turn', {reentry: false});
    try {
      const mark = run.coreOperations().length;
      const answer = run.driver.port(A).transferLeadership(namedSuccessor(C));
      const byAnswer = run.coreOperations().slice(mark);
      assert.equal((await answer).reason,
        RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED);
      assert.ok(byAnswer.includes(STEP),
        `the MsgTransferLeader was stepped before the answer (${byAnswer})`);
    } finally {
      run.dispose();
    }
  });

test('per-index timing: a transfer the core cannot complete holds ' +
  'proposals for exactly the leader\'s own election tick', async () => {
  const run = await formed('anchor-per-index-window',
    {timing: TIMING_MODE.PER_INDEX, send: SEND_MODE.SYNC});
  try {
    const {driver} = run;
    const own = driver.electionTickOf(A);
    assert.notEqual(own, driver.electionTickOf(B),
      'precondition: the replicas\' timings differ');
    driver.isolate(C);
    await run.propose(A, {lag: C});
    assert.equal((await run.act(() =>
      driver.port(A).transferLeadership(namedSuccessor(C)))).reason,
    RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED);
    let rounds = 0;
    let answer = await run.propose(A, {round: rounds});
    while (answer.outcome !== CORE_OK && rounds <= 2 * own) {
      assert.equal(answer.reason,
        RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_IN_PROGRESS);
      await run.round();
      rounds += 1;
      answer = await run.propose(A, {round: rounds});
    }
    assert.equal(rounds, own,
      'the window is the leader\'s own election tick, in ticks');
  } finally {
    run.dispose();
  }
});

// Reachable through the canonical request (ADD_LEARNER naming the sitting
// leader): raft-rs keeps a demoted leader leading, and it drops proposals
// only on "no progress for self" or a transfer, so this drop is the
// transfer's (raft.rs step_leader MsgPropose).
test('CA9: a leader demoted to learner answers its transfer\'s dropped ' +
  'proposal as the transfer\'s retryable window', async () => {
  const run = await formed('anchor-ca9');
  try {
    const {driver} = run;
    assert.equal((await run.act(() => driver.port(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: A,
    }))).outcome, CORE_OK);
    await run.deliver();
    await run.round();
    const status = driver.status(A);
    assert.equal(run.leads(A), true, 'precondition: A still leads');
    assert.ok(status.confState.learners.includes(status.peerId),
      'precondition: A is a learner of its own configuration');
    assert.equal((await run.act(() =>
      driver.port(A).transferLeadership(namedSuccessor(C)))).reason,
    RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED);
    const dropped = await run.act(() =>
      driver.port(A).propose({during: 'transfer'}));
    assert.equal(dropped.reason,
      RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_IN_PROGRESS,
      JSON.stringify(dropped));
    assert.equal(dropped.retryable, true);
  } finally {
    run.dispose();
  }
});
