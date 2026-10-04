// One containment boundary at the port (quest
// raft-rs-single-path-partition-cutover, F-ah (b) after verification round
// 5): a throw the runtime owner did not type - here the caller's own event
// listener throwing inside the group's leader announcement - becomes that
// group's typed host failure (phase unexpected-throw, the error's message as
// its reason, recovery required), recorded by the runtime owner. The port
// never rethrows into its caller or into its own scheduled ticks; the group
// is held and reconstructed at most once per retry window, and it leads
// again once the listener stops throwing.
//
// The port is the production rs-raft port, built from a request shaped as
// PartitionService shapes it, on its own database; the retry window is the
// tuning owner's; an escaping exception is counted where the process
// reports one.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {createRaftRsOperationPort} from '../../../src/raft/raft-rs-operation-port.js';
import * as runtimeConstants from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {recoveryRetryWindowMsOf} from
  '../../../src/raft/raft-rs-runtime-tuning.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';

import {answerOf, countEscapes} from './process-escape-counter.js';
import {loadRaftRsCore, restoreRaftRsGroup} from './raw-raft-rs-test-core.js';
import {genesisStamp} from
  '../../../src/raft/raft-committed-membership-stamp.js';

const TEST_TIMEOUT_MS = 20000;
const IN_MEMORY = ':memory:';
// A lone group on a short clock: it campaigns on its own ticks.
const TIMING = Object.freeze({
  heartbeatMs: 30,
  electionMinMs: 150,
  electionMaxMs: 300,
  tickIntervalMs: 10,
});
// The verifier's span: two seconds of the port's own scheduled ticks.
const SCHEDULED_SPAN_MS = 2000;
const WINDOW_MARGIN_MS = 50;
const LISTENER_FAILURE = 'the leader listener refused the announcement';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A lone replica's port, from the request PartitionService hands its
// backend (the contract owner's field names).
function lonePort(groupId, {deferElection, db = new Database(IN_MEMORY)}) {
  const replicaId = `${groupId}-r1`;
  const port = createRaftRsOperationPort({
    [RAFT_OPERATION_PORT_REQUEST.GROUP_ID]: groupId,
    [RAFT_OPERATION_PORT_REQUEST.PEER_ID]: replicaId,
    [RAFT_OPERATION_PORT_REQUEST.PEER_ADDRESS]: `containment://${replicaId}`,
    [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS]: [replicaId],
    [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]:
      genesisStamp([replicaId]),
    [RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE]: db,
    [RAFT_OPERATION_PORT_REQUEST.TIMING]: TIMING,
    [RAFT_OPERATION_PORT_REQUEST.SUBSTRATE]: {},
    [RAFT_OPERATION_PORT_REQUEST.DEFER_ELECTION]: deferElection,
    [RAFT_OPERATION_PORT_REQUEST.SEND_TO_PEER]: () => undefined,
    [RAFT_OPERATION_PORT_REQUEST.RESOLVE_PEER_ADDRESS]: (peer) =>
      `containment://${peer}`,
    [RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY]: () => undefined,
    [RAFT_OPERATION_PORT_REQUEST.SNAPSHOT_CATCHUP_NEEDED]: () => undefined,
  });
  return {
    port,
    db,
    replicaId,
    dispose: () => {
      port.close();
      db.close();
    },
  };
}

function throwingLeaderListener(port) {
  return port.subscribe(RAFT_EVENT.LEADER, () => {
    throw new Error(LISTENER_FAILURE);
  });
}

// Asserts one outcome is the group's typed host failure for the contained
// throw.
function assertContained(answer, label) {
  const phase = runtimeConstants.RUNTIME_PHASE.UNEXPECTED_THROW;
  assert.equal(answer.threw, null,
    `${label}: the port answers, never throws (${answer.threw})`);
  const outcome = answer.value;
  assert.equal(outcome?.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE,
    `${label}: a typed host failure (${JSON.stringify(outcome)})`);
  assert.equal(outcome.recoveryRequired, true,
    `${label}: the group is held for recovery`);
  assert.ok(typeof phase === 'string' && outcome.phase === phase,
    `${label}: it names the unexpected-throw phase (${outcome.phase})`);
  assert.ok(String(outcome.failure?.reason ?? outcome.reason)
    .includes(LISTENER_FAILURE), `${label}: its reason is the thrown ` +
    'error\'s message');
  return outcome;
}

test('F-ah (b): a throw inside the port\'s own scheduled ticks is the ' +
  'group\'s typed host failure - nothing escapes the timer, one ' +
  'reconstruction per window', {timeout: TEST_TIMEOUT_MS}, async () => {
  const escapes = countEscapes();
  const {port, dispose} = lonePort('containment-scheduled',
    {deferElection: false});
  try {
    const unsubscribe = throwingLeaderListener(port);
    const startedAt = Date.now();
    await sleep(SCHEDULED_SPAN_MS);
    assert.deepEqual(escapes.escaped, [],
      'no exception or rejection escaped the port\'s scheduled ticks');
    const held = assertContained(answerOf(() => port.readStatus()),
      'after the span');
    const spanMs = Date.now() - startedAt;
    const bound = Math.ceil(spanMs / recoveryRetryWindowMsOf(TIMING)) + 1;
    assert.ok(Number.isInteger(held.attempts) && held.attempts >= 1 &&
      held.attempts <= bound, 'the held group was reconstructed at most ' +
      `once per window (${held.attempts} over ${spanMs} ms, bound ${bound})`);
    unsubscribe();
    await sleep(recoveryRetryWindowMsOf(TIMING) + WINDOW_MARGIN_MS);
    assert.equal(port.readStatus().role, RAFT_ROLE.LEADER,
      'once the listener stops throwing the group leads again');
    assert.deepEqual(escapes.escaped, [], 'nothing escaped');
  } finally {
    dispose();
    escapes.stop();
  }
});

test('F-ah (b): a throw inside a port operation the caller asked for is ' +
  'answered as the group\'s typed host failure, never rethrown',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const escapes = countEscapes();
  const {port, dispose} = lonePort('containment-called',
    {deferElection: true});
  try {
    const unsubscribe = throwingLeaderListener(port);
    assertContained(answerOf(() => port.campaign()), 'the campaign');
    const held = assertContained(answerOf(() => port.readStatus()),
      'the status after it');
    assert.equal(held.role, null, 'the held group has no role');
    unsubscribe();
    await sleep(recoveryRetryWindowMsOf(TIMING) + WINDOW_MARGIN_MS);
    const campaigned = await port.campaign();
    assert.equal(campaigned.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `after its window the group campaigns again (${
        JSON.stringify(campaigned)})`);
    assert.equal(port.readStatus().role, RAFT_ROLE.LEADER, 'and leads');
    assert.deepEqual(escapes.escaped, [], 'nothing escaped');
  } finally {
    dispose();
    escapes.stop();
  }
});

// Formation-3 on d3cb83d15 (managed split, source dissolution): the sole
// voter of a dissolving partition proposed its own RemoveNode (its own
// retiring row, peer-cache reconciliation). raft-rs takes that proposal and
// commits it, then refuses to apply it ("removed all voters"); the runtime
// owner lost the refusal's typed answer (resolveCommittedEntryConfState
// returned the bare outcome where applyEntries reads {ok, result}), so the
// Ready's continuation read `.outcome` of undefined and the port contained a
// TypeError: the group held as an unexpected throw, and - the entry being
// committed and durable - held again on every reconstruction.

test('a sole voter\'s own RemoveNode is refused typed at the leader\'s ' +
  'port: nothing is proposed and the group keeps leading and committing',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const escapes = countEscapes();
  const {port, replicaId, dispose} = lonePort('last-voter-admission',
    {deferElection: true});
  try {
    assert.equal((await port.campaign()).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK, 'setup: the lone replica leads');
    const before = port.readStatus();
    const answer = await port.proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: replicaId,
    });
    assert.deepEqual({...answer}, {
      outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      reason: RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LAST_VOTER,
      phase: runtimeConstants.RUNTIME_PHASE.ADMISSION,
      retryable: false,
      recoveryRequired: false,
    }, `the removal is refused terminal and typed (${JSON.stringify(answer)})`);
    const after = port.readStatus();
    assert.equal(after.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `the group is not held (${JSON.stringify(after)})`);
    assert.equal(after.role, RAFT_ROLE.LEADER, 'it still leads');
    assert.equal(after.commitIndex, before.commitIndex,
      'nothing was handed to the core');
    assert.deepEqual([...after.confState.voters], [...before.confState.voters],
      'its configuration is unchanged');
    const proposed = await port.propose({kind: 'after-refusal'});
    assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `a later write commits (${JSON.stringify(proposed)})`);
    assert.ok(port.readStatus().commitIndex > before.commitIndex,
      'and advances the commit index');
    assert.deepEqual(escapes.escaped, [], 'nothing escaped');
  } finally {
    dispose();
    escapes.stop();
  }
});

// The committed self-removal a group already holds (a record an earlier
// build wrote): proposed and committed straight through the core, below the
// port's admission, and left unapplied in the port's own durable record.
function commitSelfRemovalBelowThePort(db, groupId, replicaId) {
  const store = new RaftRsDurableStore(db);
  const peerId = new RaftRsPeerIdentityRegistry(db).raftPeerIdOf(replicaId);
  const core = loadRaftRsCore();
  const handle = restoreRaftRsGroup({core, store, groupId, peerId});
  const drainUnapplied = () => {
    while (core.has_ready(handle)) {
      store.persistReady(groupId, core.take_ready(handle));
      core.persist_ready(handle);
      const light = core.advance_append(handle);
      if (light.commitIndex !== undefined) {
        store.putCommitIndex(groupId, light.commitIndex);
      }
      core.advance_apply(handle);
    }
  };
  try {
    core.campaign(handle);
    drainUnapplied();
    core.propose_conf_change_v2(handle, {transition: 0, changes: [{
      changeType: RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE, nodeId: peerId}]});
    drainUnapplied();
    return store.readDurableProgress(groupId);
  } finally {
    core.free(handle);
  }
}

test('a committed configuration change the core refuses to apply holds ' +
  'its group as a typed application failure, never an unexpected throw',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const escapes = countEscapes();
  const groupId = 'last-voter-committed';
  const first = lonePort(groupId, {deferElection: true});
  assert.equal((await first.port.campaign()).outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK, 'setup: the lone replica leads');
  first.port.close();
  const progress = commitSelfRemovalBelowThePort(first.db, groupId,
    first.replicaId);
  assert.ok(BigInt(progress.commitIndex) > BigInt(progress.appliedIndex),
    `setup: the removal is committed and unapplied (${
      JSON.stringify(progress)})`);
  const {port, dispose} = lonePort(groupId,
    {deferElection: true, db: first.db});
  try {
    const answers = [answerOf(() => port.tick())];
    await sleep(recoveryRetryWindowMsOf(TIMING) + WINDOW_MARGIN_MS);
    answers.push(answerOf(() => port.tick()));
    for (const [index, answer] of answers.entries()) {
      assert.equal(answer.threw, null, `turn ${index} answers, never throws`);
      const held = await answer.value;
      assert.equal(held.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE,
        `turn ${index}: a typed host failure (${JSON.stringify(held)})`);
      assert.equal(held.recoveryRequired, true,
        `turn ${index}: the group is held`);
      // The failing turn answers the failure itself; a held group's later
      // turn answers its recovery record, which carries the failure.
      const failure = held.failure ?? held;
      assert.equal(failure.phase, runtimeConstants.RUNTIME_PHASE.APPLICATION,
        `turn ${index}: the committed entry's application failed (${
          JSON.stringify(failure)})`);
      assert.match(String(failure.reason), /removed all voters/,
        `turn ${index}: the core's own refusal is its reason`);
      assert.equal(failure.detail?.coreOperation, 'apply_conf_change',
        `turn ${index}: naming the core call that refused`);
    }
    assert.deepEqual(escapes.escaped, [], 'nothing escaped');
  } finally {
    dispose();
    escapes.stop();
  }
});
