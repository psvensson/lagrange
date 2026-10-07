// Round 3 of the leadership-transfer evidence (quest f1-step-down-port): the
// class witness for "decide after the drain". The property is stated in full
// at the top of transfer-leadership-property.test.js.
//
// The port makes two decisions from the core's facts: whether and where a
// transfer is stepped (transferLeadership), and whether a proposal the core
// dropped was dropped by a running transfer (propose, proposeConfChange). A
// replica's runtime processes the messages delivered to it at the start of
// the next queued turn, and those messages can change every input of both
// decisions: the configuration (an acknowledgement commits a removal), the
// role, term and leader (a vote request of a higher term demotes a leader),
// and the progress most-caught-up ranks. So the class property is:
//
//   in a turn that begins with delivered-but-unprocessed messages, every
//   decision is taken on the core as those messages left it.
//
// Each case below pairs two legs:
//
//   - STRUCTURAL, by order within the turn, read from the actual-core-entry
//     observer (not by count): the turn's first core entry is the first
//     delivered message's step, so nothing is read before the drain; and the
//     reads the decision is taken on come after the last delivered step,
//     directly before the transfer's own step, or directly after the refused
//     proposal the classification judges;
//   - SEMANTIC: the answer is the one the core's post-drain state requires.
//
// Real rs-raft ports through the provider seam; delivered messages are handed
// to step() and left unprocessed on the never-advanced virtual clock
// (TransferLeadershipDriver.stepUndrained). Expected values are raft-rs 0.7's:
// a follower that knows no leader drops MsgTransferLeader; step_leader drops a
// proposal when the leader is not in its progress map or while a transfer
// runs.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  IN_PROGRESS_REASON,
  TRANSFER_REASON,
  TransferLeadershipDriver,
  assertAccepted,
  assertRefused,
  assertTransferInProgress,
  mostCaughtUp,
  namedSuccessor,
} from './transfer-leadership-driver.js';

const {CORE_OK, CORE_REFUSED} = RAFT_OPERATION_OUTCOME;
const A = 'order-replica-a';
const B = 'order-replica-b';
const C = 'order-replica-c';
const D = 'order-replica-d';
const REPLICAS = Object.freeze([A, B, C]);
// The core entries the order is read from (the binding's own operations).
const CORE = Object.freeze({
  STEP: 'step',
  STATUS: 'status',
  CONF_STATE: 'conf_state',
  PROPOSE: 'propose',
  PROPOSE_CONF_CHANGE: 'propose_conf_change_v2',
});
const READS = new Set([CORE.STATUS, CORE.CONF_STATE]);
// What the decision's reads must sit next to.
const EFFECT = Object.freeze({
  TRANSFER_STEP: 'transfer-step',
  REFUSED_PROPOSAL: 'refused-proposal',
  NONE: 'none',
});

function formedGroup(partitionId) {
  const driver = new TransferLeadershipDriver({
    partitionId, replicaIds: REPLICAS});
  driver.form();
  return driver;
}

// The core entries of one queued turn, in order, and its answer.
async function turn(driver, work) {
  const before = driver.coreOperations().length;
  const answer = await work();
  return {answer, entries: driver.coreOperations().slice(before)};
}

function lastIndexBefore(entries, operation, end) {
  return entries.lastIndexOf(operation, end - 1);
}

/**
 * The structural leg: in a turn that began with `delivered` unprocessed
 * messages, nothing is read before the first of them is stepped, and the
 * decision's reads follow the last of them.
 * @param {Array<string>} entries - The turn's core entries, in order.
 * @param {number} delivered - Messages delivered before the turn.
 * @param {Object} decision - {effect, operation}: what the reads decide.
 */
function assertDecidedAfterDrain(entries, delivered, {effect, operation}) {
  const trace = entries.join(',');
  assert.equal(entries[0], CORE.STEP,
    `nothing is read before the delivered messages are stepped (${trace})`);
  const steps = entries.flatMap((entry, index) =>
    (entry === CORE.STEP ? [index] : []));
  assert.ok(steps.length >= delivered,
    `every delivered message was stepped in the turn (${trace})`);
  const lastDelivered = steps[delivered - 1];
  if (effect === EFFECT.TRANSFER_STEP) {
    const effectAt = steps[delivered];
    assert.notEqual(effectAt, undefined, `the transfer was stepped (${trace})`);
    const statusAt = lastIndexBefore(entries, CORE.STATUS, effectAt);
    const confAt = lastIndexBefore(entries, CORE.CONF_STATE, effectAt);
    assert.ok(Math.min(statusAt, confAt) > lastDelivered,
      `the transfer was decided on reads after the drain (${trace})`);
    assert.ok(entries.slice(Math.min(statusAt, confAt), effectAt)
      .every((entry) => READS.has(entry)),
    `nothing but the decision's reads lies before the step (${trace})`);
    return;
  }
  if (effect === EFFECT.REFUSED_PROPOSAL) {
    const effectAt = entries.lastIndexOf(operation);
    assert.ok(effectAt > lastDelivered,
      `the proposal was made after the drain (${trace})`);
    const after = entries.slice(effectAt + 1);
    assert.ok(after.includes(CORE.STATUS) && after.includes(CORE.CONF_STATE),
      `the drop was classified on reads after the refusal (${trace})`);
    return;
  }
  const statusAt = entries.lastIndexOf(CORE.STATUS);
  const confAt = entries.lastIndexOf(CORE.CONF_STATE);
  assert.ok(Math.min(statusAt, confAt) > lastDelivered,
    `the refusal was decided on reads after the drain (${trace})`);
}

// Acknowledgements of a write, delivered to the leader and not processed.
function pendingAcknowledgements(driver) {
  driver.port(A).propose({acknowledged: 'pending'});
  driver.deliverOnly([B, C]);
  const delivered = driver.stepUndrained(A);
  assert.ok(delivered > 0, 'precondition: acknowledgements are pending');
  return delivered;
}

// A transfer to a cut-off C runs on A, and B's heartbeat responses are
// delivered to A and not processed.
async function pendingInTransferWindow(driver) {
  driver.isolate(C);
  driver.propose(A, {lag: 'transferee'});
  assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(C)),
    TRANSFER_REASON.REQUESTED);
  let delivered = 0;
  for (let tick = 0; delivered === 0 && tick < driver.electionTick();
    tick += 1) {
    driver.port(A).tick();
    driver.deliverOnly([B]);
    delivered = driver.stepUndrained(A);
  }
  assert.ok(delivered > 0, 'precondition: responses are pending');
  return delivered;
}

test('drain order: a named transfer is decided and stepped after the ' +
  'delivered messages', async () => {
  const driver = formedGroup('order-named');
  try {
    const delivered = pendingAcknowledgements(driver);
    const {answer, entries} = await turn(driver, () =>
      driver.port(A).transferLeadership(namedSuccessor(C)));
    assertAccepted(answer, TRANSFER_REASON.REQUESTED);
    assertDecidedAfterDrain(entries, delivered,
      {effect: EFFECT.TRANSFER_STEP});
  } finally {
    driver.dispose();
  }
});

test('drain order: most-caught-up ranks the progress the delivered ' +
  'messages left', async () => {
  const driver = formedGroup('order-most-caught-up');
  try {
    const delivered = pendingAcknowledgements(driver);
    const {answer, entries} = await turn(driver, () =>
      driver.port(A).transferLeadership(mostCaughtUp()));
    assertAccepted(answer, TRANSFER_REASON.REQUESTED);
    assertDecidedAfterDrain(entries, delivered,
      {effect: EFFECT.TRANSFER_STEP});
  } finally {
    driver.dispose();
  }
});

test('drain order: a refused transfer is refused on the state after the ' +
  'delivered messages', async () => {
  const driver = formedGroup('order-refused');
  try {
    driver.reserveEverywhere(D);
    const delivered = pendingAcknowledgements(driver);
    const {answer, entries} = await turn(driver, () =>
      driver.port(A).transferLeadership(namedSuccessor(D)));
    assertRefused(answer, TRANSFER_REASON.TARGET_NOT_VOTER);
    assertDecidedAfterDrain(entries, delivered, {effect: EFFECT.NONE});
  } finally {
    driver.dispose();
  }
});

// Semantic leg for the role, term and leader input: B's vote request of a
// higher term demotes A in the request's own turn, and A then knows no
// leader, so raft-rs would drop the MsgTransferLeader. The request is B's
// transfer election (CAMPAIGN_TRANSFER): under check_quorum the only
// higher-term vote request a leader in its lease steps.
test('drain order: a higher-term message pending at the request demotes the ' +
  'leader first, and the request is refused, never accepted', async () => {
  const driver = formedGroup('order-higher-term');
  try {
    const termBefore = driver.status(A).term;
    // Read before the hand-over: a status read drains delivered messages.
    assert.equal(driver.leads(A), true, 'precondition: A leads');
    await driver.port(A).transferLeadership(namedSuccessor(B));
    driver.deliverOnly([B]);
    const delivered = driver.stepUndrained(A);
    assert.ok(delivered > 0, 'precondition: the vote request is pending');
    const {answer, entries} = await turn(driver, () =>
      driver.port(A).transferLeadership(namedSuccessor(C)));
    assert.notEqual(answer.outcome, CORE_OK, JSON.stringify(answer));
    assertRefused(answer, TRANSFER_REASON.NO_KNOWN_LEADER);
    assert.equal(answer.retryable, true);
    assert.equal(driver.leads(A), false, 'A no longer leads');
    assert.ok(driver.status(A).term > termBefore,
      'the higher term was processed');
    assertDecidedAfterDrain(entries, delivered, {effect: EFFECT.NONE});
  } finally {
    driver.dispose();
  }
});

test('drain order: a proposal dropped in a transfer window is classified ' +
  'after the delivered messages', async () => {
  const driver = formedGroup('order-window-propose');
  try {
    const delivered = await pendingInTransferWindow(driver);
    const {answer, entries} = await turn(driver, () =>
      driver.port(A).propose({during: 'window'}));
    assertTransferInProgress(answer);
    assertDecidedAfterDrain(entries, delivered,
      {effect: EFFECT.REFUSED_PROPOSAL, operation: CORE.PROPOSE});
  } finally {
    driver.dispose();
  }
});

test('drain order: a configuration change dropped in a transfer window is ' +
  'classified after the delivered messages', async () => {
  const driver = formedGroup('order-window-conf-change');
  try {
    driver.reserveEverywhere(D);
    const delivered = await pendingInTransferWindow(driver);
    const {answer, entries} = await turn(driver, () =>
      driver.port(A).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: D}));
    assertTransferInProgress(answer);
    assertDecidedAfterDrain(entries, delivered,
      {effect: EFFECT.REFUSED_PROPOSAL, operation: CORE.PROPOSE_CONF_CHANGE});
  } finally {
    driver.dispose();
  }
});

// Semantic leg for the drop classification's configuration input: the
// acknowledgements commit the leader's own removal in the proposal's turn,
// and the core then drops the proposal for that cause, not for a transfer.
test('drain order: acknowledgements pending at a proposal commit the ' +
  'leader\'s own removal first, and the drop stays non-retryable', async () => {
  const driver = formedGroup('order-self-removal');
  try {
    const selfId = driver.raftIdAt(A, A);
    assert.equal(driver.port(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: A,
    }).outcome, CORE_OK);
    // Read before the hand-over: a status read drains delivered messages.
    assert.equal(driver.status(A).confState.voters.includes(selfId), true,
      'precondition: the removal is not yet committed at A');
    driver.deliverOnly([B, C]);
    const delivered = driver.stepUndrained(A);
    assert.ok(delivered > 0, 'precondition: acknowledgements are pending');
    const {answer, entries} = await turn(driver, () =>
      driver.port(A).propose({after: 'self-removal'}));
    assert.equal(answer.outcome, CORE_REFUSED, JSON.stringify(answer));
    assert.notEqual(answer.reason, IN_PROGRESS_REASON,
      'no transfer runs: the drop is the removal\'s');
    assert.equal(answer.retryable, false);
    assert.equal(driver.status(A).confState.voters.includes(selfId), false,
      'the pending acknowledgements committed the removal in that turn');
    assertDecidedAfterDrain(entries, delivered,
      {effect: EFFECT.REFUSED_PROPOSAL, operation: CORE.PROPOSE});
  } finally {
    driver.dispose();
  }
});
