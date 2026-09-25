// W3, the attack matrix of the leadership-transfer property (quest
// f1-step-down-port; design-f1-step-down-port-2026-09-25.md section 6 and its
// lead decisions). The property is stated in full at the top of
// transfer-leadership-property.test.js:
//
//   an accepted transfer moves leadership to the named (or most caught-up)
//   voter within one election timeout, and the old leader never regains it
//   while the new leader keeps reaching it; a request that cannot succeed is
//   a typed refusal that changes nothing; an aborted transfer leaves the
//   leader in place and fit to take writes after that one election timeout.
//
// Each leg attacks one way an implementation could miss it, on real rs-raft
// ports built through the provider seam, with time moved only by explicit
// ticks (TransferLeadershipDriver). Expected values are raft-rs 0.7's own
// semantics as the design cites them; nothing is read from the implementation
// under test beyond its answers and the core's reports through readStatus.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import Database from 'better-sqlite3';

import {LiferaftProvider} from '../../../src/raft/liferaft-provider.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_PARTITION_NODE_REQUEST} from
  '../../../src/raft/raft-provider-contract-constants.js';
import {RAFT_RS_TRANSPORT_PROTOCOL} from
  '../../../src/raft/raft-rs-ingress-constants.js';
import {RUNTIME_REASON} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {
  TRANSFER_REASON,
  TransferLeadershipDriver,
  UNSUPPORTED_BACKEND_REASON,
  assertAccepted,
  assertLeadershipHeld,
  assertRefused,
  assertTransferInProgress,
  mostCaughtUp,
  namedSuccessor,
} from './transfer-leadership-driver.js';

const {CORE_OK, HOST_FAILURE} = RAFT_OPERATION_OUTCOME;
const A = 'matrix-replica-a';
const B = 'matrix-replica-b';
const C = 'matrix-replica-c';
// Identities that never get a replica of their own.
const D = 'matrix-replica-d';
const NEVER_RESERVED = 'matrix-replica-never-reserved';
const REPLICAS = Object.freeze([A, B, C]);
// A crash's survivors elect by their own randomized timeouts, which are
// between one and two election timeouts; split votes may repeat.
const SURVIVOR_ELECTION_TIMEOUTS = 10;
const STEP_OPERATION = 'step';
const BEGIN = 'BEGIN';
const ROLLBACK = 'ROLLBACK';
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
// The binding's own message-type table, read from its source rather than
// written here (design section 5).
const BINDING_SOURCE = 'vendor/raft-rs-wasm/src/lib.rs';
const TRANSFER_LEADER = 'MsgTransferLeader';
const TIMEOUT_NOW = 'MsgTimeoutNow';

function bindingMessageType(name) {
  const match = new RegExp(`(\\d+)\\s*=>\\s*${name}\\b`, 'u').exec(
    fs.readFileSync(path.join(ROOT, BINDING_SOURCE), 'utf8'));
  assert.notEqual(match, null, `the binding maps ${name}`);
  return Number(match[1]);
}

// The message types a replica's transport inbox holds right now.
function heldMessageTypes(driver, replicaId) {
  return driver.cluster.replica(replicaId).inbox
    .map((envelope) => envelope.message.msgType);
}

function formedGroup(partitionId, replicaIds = REPLICAS) {
  const driver = new TransferLeadershipDriver({partitionId, replicaIds});
  driver.form();
  return driver;
}

function terms(driver, replicaIds) {
  return replicaIds.map((replicaId) => driver.status(replicaId).term);
}

// An immediate write on the leader commits: no drop window was opened.
function assertWritable(driver, leader, tag) {
  const command = {writable: tag};
  const answer = driver.propose(leader, command);
  assert.equal(answer.outcome, CORE_OK, JSON.stringify(answer));
  assert.equal(driver.applied(leader, command), true, 'the write committed');
}

// A typed refusal that changed nothing: no core step, no term moved, the same
// leader, and (when there is one) a write the leader takes at once.
async function refusedWithoutEffect(driver,
  {asker, request, reason, leader}) {
  const replicaIds = [...driver.cluster.replicas.keys()];
  const termsBefore = terms(driver, replicaIds);
  const operationsBefore = driver.coreOperations().length;
  const answer = await driver.port(asker).transferLeadership(request);
  assertRefused(answer, reason);
  assert.deepEqual(driver.coreOperations().slice(operationsBefore)
    .filter((operation) => operation === STEP_OPERATION), [],
  'a refused request steps nothing into the core');
  driver.deliver();
  driver.round();
  assert.deepEqual(terms(driver, replicaIds), termsBefore, 'no term moved');
  if (leader !== null) {
    assert.equal(driver.leads(leader), true, 'the leader stays');
    assertWritable(driver, leader, reason);
  }
  return answer;
}

function within(driver, predicate, message, timeouts = 1) {
  const rounds = driver.roundsUntil(predicate,
    timeouts * driver.electionTick());
  assert.notEqual(rounds, null, message);
  return rounds;
}

// Rounds until the leader takes a write again; every attempt before that is
// the named retryable in-progress answer.
function roundsUntilWritable(driver, leader, bound) {
  for (let round = 1; round <= bound; round += 1) {
    driver.round();
    const command = {retry: round};
    const answer = driver.propose(leader, command);
    if (answer.outcome === CORE_OK) {
      assert.equal(driver.applied(leader, command), true);
      return round;
    }
    assertTransferInProgress(answer);
  }
  return null;
}

test('W3 a non-leader with a known leader forwards, and the target leads', async () => {
  const driver = formedGroup('w3-forward-known-leader');
  try {
    const termBefore = driver.status(A).term;
    assertAccepted(await driver.port(B).transferLeadership(namedSuccessor(C)),
      TRANSFER_REASON.FORWARDED);
    driver.deliver();
    within(driver, () => driver.leads(C),
      'the named target leads within one election timeout');
    assert.equal(driver.status(C).term, termBefore + 1);
    assert.equal(driver.status(A).leaderId, C);
    assertLeadershipHeld(driver, {from: A, to: C});
  } finally {
    driver.dispose();
  }
});

test('W3 a non-leader that knows no leader refuses, retryable, and nothing ' +
  'moves', async () => {
  const driver = new TransferLeadershipDriver({
    partitionId: 'w3-no-known-leader', replicaIds: REPLICAS});
  try {
    const answer = await refusedWithoutEffect(driver, {
      asker: B, request: namedSuccessor(C),
      reason: TRANSFER_REASON.NO_KNOWN_LEADER, leader: null});
    assert.equal(answer.retryable, true, 'no-known-leader is retryable');
    assert.equal(REPLICAS.some((replicaId) => driver.leads(replicaId)), false,
      'no replica leads');
  } finally {
    driver.dispose();
  }
});

test('W3 a learner target is refused as not a voter and nothing is stepped',
  async () => {
    const driver = formedGroup('w3-learner-target');
    try {
      const learnerId = driver.reserveEverywhere(D);
      assert.equal(driver.port(A).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: D,
      }).outcome, CORE_OK);
      within(driver, () =>
        driver.status(A).confState.learners.includes(learnerId),
      'the learner is committed and applied');
      await refusedWithoutEffect(driver, {asker: A, request: namedSuccessor(D),
        reason: TRANSFER_REASON.TARGET_NOT_VOTER, leader: A});
    } finally {
      driver.dispose();
    }
  });

test('W3 a reserved identity outside the configuration is refused as not a ' +
  'voter', async () => {
  const driver = formedGroup('w3-non-member-target');
  try {
    driver.reserveEverywhere(D);
    await refusedWithoutEffect(driver, {asker: A, request: namedSuccessor(D),
      reason: TRANSFER_REASON.TARGET_NOT_VOTER, leader: A});
  } finally {
    driver.dispose();
  }
});

test('W3 an unreserved target is refused as unreserved and stays unreserved',
  async () => {
    const driver = formedGroup('w3-unreserved-target');
    try {
      await refusedWithoutEffect(driver, {asker: A,
        request: namedSuccessor(NEVER_RESERVED),
        reason: TRANSFER_REASON.TARGET_UNRESERVED, leader: A});
      assert.equal(driver.raftIdAt(A, NEVER_RESERVED), null,
        'the refusal reserved nothing');
    } finally {
      driver.dispose();
    }
  });

test('W3 a target already leading answers already-leader and moves no term',
  async () => {
    const driver = formedGroup('w3-already-leader');
    try {
      const termBefore = driver.status(A).term;
      assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(A)),
        TRANSFER_REASON.ALREADY_LEADER);
      driver.deliver();
      driver.round();
      assert.equal(driver.status(A).term, termBefore);
      assert.equal(driver.leads(A), true);
      assertWritable(driver, A, 'already-leader');
    } finally {
      driver.dispose();
    }
  });

test('W3 a solo group has no eligible successor, and naming itself is ' +
  'already-leader', async () => {
  const driver = formedGroup('w3-solo-group', [A]);
  try {
    await refusedWithoutEffect(driver, {asker: A, request: mostCaughtUp(),
      reason: TRANSFER_REASON.NO_ELIGIBLE_SUCCESSOR, leader: A});
    const termBefore = driver.status(A).term;
    assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(A)),
      TRANSFER_REASON.ALREADY_LEADER);
    assert.equal(driver.status(A).term, termBefore);
    assertWritable(driver, A, 'solo');
  } finally {
    driver.dispose();
  }
});

test('W3 the leader crashing before MsgTimeoutNow leaves: survivors elect, ' +
  'the old leader returns a follower and does not regain', async () => {
  const driver = formedGroup('w3-leader-crash-before-timeout-now');
  try {
    driver.isolate(A);
    assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(C)),
      TRANSFER_REASON.REQUESTED);
    assert.deepEqual(heldMessageTypes(driver, C), [],
      'precondition: MsgTimeoutNow never left the leader');
    driver.crash(A);
    within(driver, () => driver.leads(B) || driver.leads(C),
      'the survivors elect a leader', SURVIVOR_ELECTION_TIMEOUTS);
    const survivor = driver.leads(B) ? B : C;
    driver.recover(A);
    within(driver, () => driver.status(A).leaderId === survivor,
      'the old leader follows the survivors\' leader');
    assertLeadershipHeld(driver, {from: A, to: survivor});
  } finally {
    driver.dispose();
  }
});

test('W3 the leader crashing after MsgTimeoutNow left: the target still leads',
  async () => {
    const driver = formedGroup('w3-leader-crash-after-timeout-now');
    try {
      const termBefore = driver.status(A).term;
      assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(C)),
        TRANSFER_REASON.REQUESTED);
      assert.ok(heldMessageTypes(driver, C).includes(
        bindingMessageType(TIMEOUT_NOW)),
      'precondition: MsgTimeoutNow left the leader for the target');
      driver.crash(A);
      driver.deliver();
      assert.equal(within(driver, () => driver.leads(C),
        'the target leads within one election timeout'), 0,
      'the target campaigns on MsgTimeoutNow, before any timeout');
      assert.equal(driver.status(C).term, termBefore + 1);
      driver.recover(A);
      within(driver, () => driver.status(A).leaderId === C,
        'the old leader returns as the target\'s follower');
      assertLeadershipHeld(driver, {from: A, to: C});
    } finally {
      driver.dispose();
    }
  });

test('W3 the target crashing mid-transfer: writes and configuration changes ' +
  'answer the retryable in-progress outcome, and succeed within one ' +
  'election timeout with the leader in place', async () => {
  const driver = formedGroup('w3-target-crash');
  try {
    driver.reserveEverywhere(D);
    driver.crash(C);
    driver.lagBehind(A, C);
    const termBefore = driver.status(A).term;
    assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(C)),
      TRANSFER_REASON.REQUESTED);
    assertTransferInProgress(driver.propose(A, {during: 'transfer'}));
    assertTransferInProgress(driver.port(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: D}));
    const rounds = roundsUntilWritable(driver, A, driver.electionTick());
    assert.notEqual(rounds, null,
      'the leader takes writes again within one election timeout');
    assert.equal(driver.leads(A), true, 'the leader stays');
    assert.equal(driver.status(A).term, termBefore, 'no election happened');
  } finally {
    driver.dispose();
  }
});

// A follower forwards MsgTransferLeader to its leader over the transport
// (raft-rs step_follower), so the leader's write path meets the same window
// when the request never passed through its own port.
test('W3 a transfer forwarded over the transport opens the same retryable ' +
  'window on the leader\'s write path', async () => {
  const driver = formedGroup('w3-forwarded-window');
  try {
    driver.crash(C);
    driver.lagBehind(A, C);
    const leader = driver.status(A);
    const accepted = driver.port(A).step({
      protocol: RAFT_RS_TRANSPORT_PROTOCOL,
      groupId: driver.cluster.partitionId,
      from: driver.raftIdAt(A, C),
      to: leader.peerId,
      message: {msgType: bindingMessageType(TRANSFER_LEADER),
        from: driver.raftIdAt(A, C), to: leader.peerId,
        term: String(leader.term), logTerm: '0', index: '0', commit: '0'},
    });
    assert.equal(accepted.outcome, CORE_OK, JSON.stringify(accepted));
    driver.deliver();
    driver.status(A);
    assertTransferInProgress(driver.propose(A, {during: 'forwarded'}));
    assert.notEqual(roundsUntilWritable(driver, A, driver.electionTick()),
      null, 'writable again within one election timeout');
    assert.equal(driver.leads(A), true);
  } finally {
    driver.dispose();
  }
});

test('W3 a transfer with a configuration change pending converges and ' +
  'commits the change', async () => {
  const driver = formedGroup('w3-pending-conf-change');
  try {
    const learnerId = driver.reserveEverywhere(D);
    driver.isolate(B);
    driver.isolate(C);
    assert.equal(driver.port(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: D,
    }).outcome, CORE_OK);
    driver.deliver();
    driver.heal(C);
    assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(C)),
      TRANSFER_REASON.REQUESTED);
    driver.deliver();
    within(driver, () => driver.leads(C),
      'the target leads within one election timeout');
    within(driver, () =>
      driver.status(C).confState.learners.includes(learnerId),
    'the new leader commits the pending change');
    assert.equal(driver.leads(A), false);
  } finally {
    driver.dispose();
  }
});

test('W3 a committed removal of the transferee aborts the transfer: the ' +
  'leader stays and writes before the election timeout', async () => {
  const driver = formedGroup('w3-transferee-removed');
  try {
    const removedId = driver.raftIdAt(A, C);
    driver.isolate(B);
    driver.isolate(C);
    assert.equal(driver.port(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: C,
    }).outcome, CORE_OK);
    const termBefore = driver.status(A).term;
    assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(C)),
      TRANSFER_REASON.REQUESTED);
    assertTransferInProgress(driver.propose(A, {before: 'removal'}));
    driver.heal(B);
    const rounds = within(driver, () =>
      !driver.status(A).confState.voters.includes(removedId),
    'the removal commits');
    assert.ok(rounds < driver.electionTick(),
      'the removal committed before the transfer could time out');
    assertWritable(driver, A, 'after-removal');
    assert.equal(driver.leads(A), true);
    assert.equal(driver.status(A).term, termBefore);
  } finally {
    driver.dispose();
  }
});

test('W3 a repeated request is idempotent: one term change, and a repeat ' +
  'after completion moves nothing', async () => {
  const driver = formedGroup('w3-repeated-request');
  try {
    driver.lagBehind(A, C);
    const termBefore = driver.status(A).term;
    for (let repeat = 0; repeat < 2; repeat += 1) {
      assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(C)),
        TRANSFER_REASON.REQUESTED);
    }
    driver.heal(C);
    within(driver, () => driver.leads(C),
      'the target leads within one election timeout');
    assert.equal(driver.status(C).term, termBefore + 1, 'one term change');
    const again = await driver.port(A).transferLeadership(namedSuccessor(C));
    assert.equal(again.outcome, CORE_OK, JSON.stringify(again));
    assert.ok([TRANSFER_REASON.ALREADY_LEADER, TRANSFER_REASON.FORWARDED]
      .includes(again.reason), JSON.stringify(again));
    driver.deliver();
    assertLeadershipHeld(driver, {from: A, to: C});
    assert.equal(driver.status(C).term, termBefore + 1, 'still one change');
  } finally {
    driver.dispose();
  }
});

test('W3 a retarget while a transfer is in progress hands leadership to the ' +
  'second target', async () => {
  const driver = formedGroup('w3-retarget');
  try {
    driver.lagBehind(A, C);
    const termBefore = driver.status(A).term;
    assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(C)),
      TRANSFER_REASON.REQUESTED);
    assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(B)),
      TRANSFER_REASON.REQUESTED);
    driver.deliver();
    within(driver, () => driver.leads(B),
      'the second target leads within one election timeout');
    assert.equal(driver.status(B).term, termBefore + 1);
    driver.heal(C);
    within(driver, () => driver.status(C).leaderId === B,
      'the first target follows the second');
    assertLeadershipHeld(driver, {from: A, to: B});
    assert.equal(driver.leads(C), false);
  } finally {
    driver.dispose();
  }
});

test('W3 a closed port refuses as closed without entering the core', async () => {
  const driver = formedGroup('w3-closed-port');
  try {
    const port = driver.port(A);
    port.close();
    const entriesBefore = driver.cluster.coreEntryCount();
    for (const request of [namedSuccessor(C), mostCaughtUp()]) {
      assertRefused(await port.transferLeadership(request), RUNTIME_REASON.CLOSED);
    }
    assert.equal(driver.cluster.coreEntryCount(), entriesBefore,
      'nothing entered the core');
    assert.equal(driver.cluster.replica(C).inbox.length, 0, 'nothing was sent');
  } finally {
    driver.dispose();
  }
});

test('W3 an open user transaction defers the request, retryable, without ' +
  'entering the core, and nothing moves', async () => {
  const driver = formedGroup('w3-user-transaction-open');
  try {
    const {db} = driver.cluster.replica(A);
    const termBefore = driver.status(A).term;
    db.exec(BEGIN);
    const entriesBefore = driver.cluster.coreEntryCount();
    const answer = await driver.port(A).transferLeadership(namedSuccessor(C));
    assert.equal(driver.cluster.coreEntryCount(), entriesBefore,
      'nothing entered the core');
    db.exec(ROLLBACK);
    assert.equal(answer.outcome, HOST_FAILURE, JSON.stringify(answer));
    assert.equal(answer.reason, RUNTIME_REASON.USER_TRANSACTION_OPEN);
    assert.equal(answer.retryable, true);
    driver.deliver();
    driver.round();
    assert.equal(driver.leads(A), true, 'the leader stays');
    assert.equal(driver.leads(C), false);
    assert.equal(driver.status(C).term, termBefore, 'no term moved');
    assertWritable(driver, A, 'after-transaction');
  } finally {
    driver.dispose();
  }
});

// The retired backend's own node, built through its provider seam.
function liferaftRequest(database) {
  return {
    [RAFT_PARTITION_NODE_REQUEST.GROUP_ID]: 'w3-liferaft',
    [RAFT_PARTITION_NODE_REQUEST.PEER_ID]: A,
    [RAFT_PARTITION_NODE_REQUEST.PEER_ADDRESS]: A,
    [RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS]: [A],
    [RAFT_PARTITION_NODE_REQUEST.DURABLE_LOG]: {end: () => undefined},
    [RAFT_PARTITION_NODE_REQUEST.DURABLE_STORAGE]: database,
    [RAFT_PARTITION_NODE_REQUEST.TIMING]: {heartbeatMs: 60000,
      electionMinMs: 60000, electionMaxMs: 120000},
    [RAFT_PARTITION_NODE_REQUEST.SUBSTRATE]: {},
    [RAFT_PARTITION_NODE_REQUEST.DEFER_ELECTION]: true,
    [RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER]: async () => undefined,
    [RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS]: (peer) => peer,
    [RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY]: () => undefined,
    [RAFT_PARTITION_NODE_REQUEST.SNAPSHOT_CATCHUP_NEEDED]: () => undefined,
    [RAFT_PARTITION_NODE_REQUEST.APPLY_TRANSACTION_ROLLED_BACK]: () =>
      undefined,
  };
}

test('W3 the Liferaft partition port refuses a transfer with its typed ' +
  'unsupported-backend answer, never a no-op', async () => {
  const database = new Database(':memory:');
  const port = new LiferaftProvider().createPartitionPort(
    liferaftRequest(database));
  try {
    for (const request of [namedSuccessor(A), mostCaughtUp()]) {
      assertRefused(await port.transferLeadership(request),
        UNSUPPORTED_BACKEND_REASON);
    }
  } finally {
    port.close();
    database.close();
  }
});
