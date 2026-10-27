// Separate W07 companion: capture location and already-owned remainder wake.
// The original runtime-captured-inbound-service-native.test.js stays frozen.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../../src/raft/raft-rs-ingress-constants.js';
import {RAFT_RS_SQL} from '../../../src/raft/raft-rs-durable-store-constants.js';
import {PERSISTENCE_ADMISSION_WAIT, RUNTIME_PHASE} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {A, B, C, SETUP_ROUNDS, assertNativeDelivery, deliverHeartbeat,
  finish, fixture, hash, heartbeatSteps, installObservers, observe, own,
  processSetupInbox, proposalEntries, replies} from
  './runtime-captured-inbound-companion-fixture.js';

const {CORE_OK, HOST_FAILURE} = RAFT_OPERATION_OUTCOME;
const CAPTURED_COPIES = 2;

async function runCase(t, name, body, applyFor = null) {
  const f = fixture(name, applyFor);
  try {
    await body(f);
  } catch (error) {
    f.failure = error;
    throw error;
  } finally {
    await finish(t, f);
  }
}

async function queueBehindHeldForward(f, selected) {
  const predecessor = {w07Companion: 'already-forwarding'};
  const first = own(f, f.cluster.node(B).propose(predecessor));
  await observe(() => f.gates.length === 1, 'real predecessor forwarding held');
  assert.equal(proposalEntries(f, predecessor).length, 1);
  const queued = own(f, f.cluster.node(B).propose(selected));
  f.events.push({kind: 'selected-enqueued', selected});
  assert.equal(proposalEntries(f, selected).length, 0);
  return {first, queued};
}

function beginForwardHold(f, holdFirstReply = false) {
  installObservers(f);
  f.control.capture = true;
  f.control.hold = (packet) => (f.gates.length === 0 &&
    packet.message.msgType === RAFT_RS_MESSAGE_TYPE.PROPOSE) ||
    (holdFirstReply && f.gates.length === 1 &&
      packet.message.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE);
}

async function queuedCapture(f) {
  const selected = {w07Companion: 'capture-after-queued-turn-is-admitted'};
  beginForwardHold(f);
  const {first, queued} = await queueBehindHeldForward(f, selected);
  for (let ordinal = 1; ordinal <= CAPTURED_COPIES; ordinal += 1) {
    deliverHeartbeat(f, ordinal);
  }
  // The existing wake queues behind selected. Even an incorrect early capture
  // can preserve the inputs there, then fail the direct ordering assertion.
  f.clocks.get(B).advance(0);
  f.gates[0].resolve();
  assert.equal((await first).outcome, CORE_OK);
  assert.equal((await queued).outcome, CORE_OK);
  assertNativeDelivery(f, CAPTURED_COPIES);
  const [entry] = proposalEntries(f, selected);
  assert.equal(proposalEntries(f, selected).length, 1);
  assert.ok(heartbeatSteps(f).every((step) => step.sequence < entry.sequence),
    'all input accepted after enqueue and before admitted capture precedes selected propose');
  assert.ok(replies(f).every((reply) => f.events.indexOf(reply) < f.events.indexOf(entry)),
    'the captured prefix completes its actual native Ready replies first');
}

async function consumedWakeRemainder(f) {
  const selected = {w07Companion: 'remainder-owned-by-consumed-wake'};
  beginForwardHold(f, true);
  const {first, queued} = await queueBehindHeldForward(f, selected);
  deliverHeartbeat(f, 1);
  f.gates[0].resolve();
  assert.equal((await first).outcome, CORE_OK);
  await observe(() => f.gates.length === 2, 'selected waits in first heartbeat Ready');
  assert.equal(heartbeatSteps(f).length, 1);
  assert.equal(proposalEntries(f, selected).length, 0);
  deliverHeartbeat(f, 2);
  f.clocks.get(B).advance(0);
  assert.equal(f.events.filter((event) => event.kind === 'inbound-stage' &&
    event.stage === 'callback').length, 1, 'the existing inbound wake fired');
  assert.equal(f.events.filter((event) => event.kind === 'inbound-stage' &&
    event.stage === 'turn-request').length, 1, 'wake transferred service to the group queue');
  assert.equal(heartbeatSteps(f).length, 1, 'the wake cannot nest inside held Ready');
  f.events.push({kind: 'last-external-progress-event', event: 'release-first-ready-send'});
  f.gates[1].resolve();
  // No further clock, input, status, tick, settle or transport flush is allowed.
  assert.equal((await queued).outcome, CORE_OK);
  await observe(() => replies(f).length === CAPTURED_COPIES,
    'already-queued wake services remainder without a new external event');
  assertNativeDelivery(f, CAPTURED_COPIES);
  assert.equal(proposalEntries(f, selected).length, 1);
  const [entry] = proposalEntries(f, selected);
  const [captured, remainder] = heartbeatSteps(f);
  assert.ok(captured.sequence < entry.sequence);
  assert.ok(entry.sequence < remainder.sequence,
    'late input waits for the already-owned remainder turn after selected propose');
}

function durableProgress(f) {
  const replica = f.cluster.replica(B);
  return {
    applied: replica.db.prepare(RAFT_RS_SQL.SELECT_APPLIED_STATE)
      .get(f.cluster.partitionId).applied_index,
    committed: replica.db.prepare(RAFT_RS_SQL.SELECT_HARD_STATE)
      .get(f.cluster.partitionId).commit_index,
  };
}

function appliedMarkerCount(f, marker) {
  return f.cluster.replica(B).appliedCommands.filter((command) =>
    hash(command) === hash(marker)).length;
}

function prepareFailedApplication(f, marker) {
  assert.equal(f.cluster.node(A).propose(marker).outcome, CORE_OK);
  for (let round = 0; round < SETUP_ROUNDS; round += 1) {
    processSetupInbox(f.cluster, A);
    processSetupInbox(f.cluster, C);
    if (f.cluster.replica(A).appliedCommands.some((command) =>
      hash(command) === hash(marker))) break;
  }
  assert.ok(f.cluster.replica(A).appliedCommands.some((command) =>
    hash(command) === hash(marker)), 'setup: native A+C quorum committed marker');
  // One envelope per operation: the fault leaves no accepted tail to obscure
  // the later capture cut. Undelivered transport remains in the fixture inbox.
  for (let round = 0; round < SETUP_ROUNDS; round += 1) {
    const envelope = f.cluster.replica(B).inbox.shift();
    assert.ok(envelope, 'setup: real committed marker delivery is available');
    assert.equal(f.cluster.node(B).step(envelope).outcome, CORE_OK);
    const result = f.cluster.node(B).tick();
    if (result.outcome !== HOST_FAILURE) continue;
    assert.equal(result.phase, 'application');
    f.events.push({kind: 'setup-application-failure', result, progress: durableProgress(f)});
    assert.ok(BigInt(durableProgress(f).committed) > BigInt(durableProgress(f).applied));
    assert.equal(appliedMarkerCount(f, marker), 0);
    return;
  }
  assert.fail('setup: intended application failure did not engage');
}

function holdReconstructionPersistence(f) {
  const db = f.cluster.replica(B).db;
  const state = {restoring: false, held: false};
  installObservers(f, (operation, args) => {
    if (operation === 'create_node' && args[0].id === f.peer) state.restoring = true;
    if (!state.restoring || state.held || operation !== 'persist_ready') return;
    // Explicit host fault, not passive instrumentation: the real store already
    // persisted this Ready, then an actual host transaction owns the connection.
    db.exec('BEGIN');
    state.held = true;
    f.events.push({kind: 'host-transaction-opened-during-reconstruction'});
  });
  f.releaseHostWait = () => {
    if (db.inTransaction) db.exec('ROLLBACK');
    if (state.held) f.clocks.get(B).advance(PERSISTENCE_ADMISSION_WAIT.POLL_INTERVAL_MS);
  };
  return state;
}

async function reconstructedCapture(f, marker) {
  prepareFailedApplication(f, marker);
  const waiting = holdReconstructionPersistence(f);
  f.control.capture = true;
  const selected = {w07Companion: 'capture-after-ensure-execution-completes'};
  const queued = own(f, f.cluster.node(B).propose(selected));
  await observe(() => waiting.held, 'native reconstruction reached real persistence wait');
  assert.equal(f.cluster.replica(B).db.inTransaction, true);
  assert.equal(proposalEntries(f, selected).length, 0);
  assert.equal(appliedMarkerCount(f, marker), 0);
  f.events.push({kind: 'ensure-execution-still-awaiting-persistence'});
  deliverHeartbeat(f, 1);
  f.releaseHostWait();
  f.releaseHostWait = null;
  const result = await queued;
  const progress = durableProgress(f);
  const markerCount = appliedMarkerCount(f, marker);
  f.events.push({kind: 'selected-reconstruction-result', result, progress, markerCount});
  assert.equal(markerCount, 1, 'real committed marker replays once');
  assert.equal(progress.applied, progress.committed);
  assert.equal(result.outcome, CORE_OK);
  assertNativeDelivery(f, 1);
  assert.equal(proposalEntries(f, selected).length, 1);
  const [entry] = proposalEntries(f, selected);
  assert.ok(heartbeatSteps(f)[0].sequence < entry.sequence,
    'input accepted during ensureExecution belongs to the admitted capture');
  assert.ok(f.events.indexOf(replies(f)[0]) < f.events.indexOf(entry));
  assert.equal(f.events.filter((event) => event.kind === 'native-send' &&
    event.message.msgType === RAFT_RS_MESSAGE_TYPE.PROPOSE).length, 1,
  'the selected command really forwards after reconstructed leader contact');
}

async function guardedRemainder(f) {
  let previousOperation = null;
  let trapped = false;
  installObservers(f, (operation) => {
    const preceding = previousOperation;
    previousOperation = operation;
    if (trapped || operation !== 'status' || preceding !== 'has_ready' ||
        heartbeatSteps(f).length !== 1 || replies(f).length !== 1) return;
    // Explicit native trap at the final announcement after h1's Ready, before
    // the next destructive inbound removal. The observer itself stays passive.
    trapped = true;
    f.events.push({kind: 'host-injected-final-announcement-trap'});
    throw new globalThis.WebAssembly.RuntimeError('intentional final Ready announcement trap');
  });
  f.control.capture = true;
  deliverHeartbeat(f, 1);
  deliverHeartbeat(f, 2);
  const selected = {w07Companion: 'must-not-enter-failed-generation'};
  const initial = await own(f, f.cluster.node(B).propose(selected));
  assert.equal(trapped, true, 'actual final announcement trap engaged');
  assert.equal(initial.outcome, HOST_FAILURE);
  assert.equal(initial.phase, RUNTIME_PHASE.GENERATION_CHANGED);
  assert.equal(heartbeatSteps(f).length, 1);
  assert.equal(replies(f).length, 1);
  assert.equal(f.events.filter((event) => event.kind === 'inbound-stage' &&
    event.stage === 'accepted').length, CAPTURED_COPIES);
  assert.equal(proposalEntries(f, selected).length, 0);
  const firstGeneration = heartbeatSteps(f)[0].runtimeGeneration;
  f.events.push({kind: 'recovery-phase-cut', initial,
    driver: 'one explicit canonical B tick; this is preservation, not autonomous service'});
  const recovered = await own(f, f.cluster.node(B).tick());
  assert.equal(recovered.outcome, CORE_OK);
  assert.equal(heartbeatSteps(f).length, CAPTURED_COPIES,
    'generation failure is checked before removal, preserving the second accepted envelope');
  assert.equal(replies(f).length, CAPTURED_COPIES);
  assert.ok(heartbeatSteps(f).every((step) => step.hash === hash(f.heartbeat.message)));
  assert.ok(heartbeatSteps(f)[1].runtimeGeneration > firstGeneration);
  assert.equal(proposalEntries(f, selected).length, 0,
    'recovery never retries the previously refused selected command');
}

test('runtime owner captures all preaccepted input when the queued turn is admitted',
  (t) => runCase(t, 'w07-companion-queued-capture', queuedCapture));

test('runtime owner preserves remainder service after the owned wake already fired',
  (t) => runCase(t, 'w07-companion-consumed-wake', consumedWakeRemainder));

test('runtime owner guards the generation before removing the next captured envelope',
  (t) => runCase(t, 'w07-companion-pre-dequeue-guard', guardedRemainder));

test('runtime owner captures input after native ensureExecution reconstruction waits',
  (t) => {
    const marker = {w07Companion: 'actual-committed-recovery-marker'};
    let failOnce = true;
    return runCase(t, 'w07-companion-reconstruction-capture',
      (f) => reconstructedCapture(f, marker), (id, command) => {
        if (id !== B || !failOnce || hash(command) !== hash(marker)) return;
        failOnce = false;
        throw new Error('intentional one-shot committed application host fault');
      });
  });
