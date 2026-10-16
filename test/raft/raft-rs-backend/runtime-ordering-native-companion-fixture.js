// Test-only ordering companion. Original F1/W07 fixtures and production stay
// unchanged. OracleRun supplies native formation and its complete observations;
// its status-driven decide/runCell interval is deliberately not reused here.
import assert from 'node:assert/strict';

import {RAFT_RS_MESSAGE_TYPE} from '../../../src/raft/raft-rs-ingress-constants.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {setActualCoreEntryObserver, setCoreFaultInjector,
  setNativeInboundStageObserver} from '../../../src/raft/raft-rs-runtime-owner.js';
import {OracleRun, bindingEnumerations} from
  './transfer-leadership-drain-oracle-harness.js';
import {allCells} from './transfer-leadership-drain-oracle-cells.js';
import {hash, observe} from './runtime-captured-inbound-companion-fixture.js';

const PASSIVE_TURNS = 256;
const ORDER = Object.freeze({
  LATE: 'accepted-during-held-send',
  AFTER: 'independent-operation-before-vote',
  BEFORE: 'vote-accepted-before-selected-operation',
});
const PHASE = Object.freeze({
  SETUP: 'setup', MEASURED: 'measured', POST: 'post-observation', CLEANUP: 'cleanup',
});

const orderingCells = allCells(bindingEnumerations())
  .filter((cell) => cell.family === 'mid-turn');

function copied(value) {
  // Native message fields, terms and positions keep their JSON representation.
  // Propose's Uint8Array additionally has an explicit hex capture below.
  // Neither retained representation feeds a production request.
  return JSON.parse(JSON.stringify(value));
}

function record(f, kind, value = {}) {
  try {
    const observation = typeof value === 'function' ? value() : value;
    f.events.push({order: f.events.length, phase: f.phase, kind, ...copied(observation)});
  } catch (error) {
    // Observation failure cannot replace the transport/native outcome.
    f.observationErrors.push({kind, message: error.message});
  }
}

function retainCompletion(f, label, returned) {
  const receipt = {label, settled: false, rejected: false, value: null};
  f.completions.push(receipt);
  Promise.resolve(returned).then((value) => {
    receipt.settled = true;
    receipt.value = value;
    record(f, 'promise-observed-fulfilled', {label, value});
  }, (error) => {
    receipt.settled = true;
    receipt.rejected = true;
    receipt.value = {name: error.name, message: error.message};
    record(f, 'promise-observed-rejected', {label, error: receipt.value});
  });
  return receipt;
}

function observeNative(f) {
  let entry = null;
  const cluster = f.run.driver.cluster;
  setActualCoreEntryObserver((event) => {
    // Preserve the existing fixture's own log; this observer adds no entry.
    cluster.coreEntries.push(event);
    entry = event;
    record(f, 'native-entry', event);
  });
  setCoreFaultInjector((groupId, operation, args) => {
    if (groupId !== cluster.partitionId) return;
    // This existing fault seam is observation-only here: no throw, return
    // substitution or mutation. Native Ready calls have group identity only.
    record(f, 'native-call', () => ({...entry, operation, args,
      proposalHex: operation === 'propose' ?
        Buffer.from(args[0]).toString('hex') : null}));
  });
  setNativeInboundStageObserver((event) => {
    if (event.groupId === cluster.partitionId) record(f, 'inbound-stage', event);
  });
  cluster.applyFor = (replicaId, command, {index, term, effects}) => {
    record(f, 'application-enter', {replicaId, command, index, term});
    effects.afterCommit.push(() =>
      record(f, 'application-after-commit', {replicaId, command, index, term}));
  };
  const original = f.run.send;
  f.run.send = function(...args) {
    const [from, address, packet] = args;
    record(f, 'native-send', () => ({from, address, packet, packetHash: hash(packet),
      held: this.holdSends}));
    const returned = Reflect.apply(original, this, args);
    retainCompletion(f, `send-${f.completions.length}`, returned);
    return returned;
  };
}

function clearObservers() {
  setActualCoreEntryObserver(null);
  setCoreFaultInjector(null);
  setNativeInboundStageObserver(null);
}

function inboxes(run) {
  return Object.fromEntries([...run.driver.cluster.replicas]
    .map(([id, replica]) => [id, copied(replica.inbox)]));
}

function applicationCommands(run) {
  return Object.fromEntries([...run.driver.cluster.replicas]
    .map(([id, replica]) => [id, copied(replica.appliedCommands)]));
}

function exactDurable(run) {
  // Supplement, never replace, OracleRun's original vectors. Its independent
  // SQLite reader converts INTEGER vote IDs to Number and can round them.
  // The production store reader preserves exact decimal strings and performs
  // only SELECTs; it never enters or drains a runtime operation.
  return [...run.driver.cluster.replicas].map(([replicaId, replica]) => ({
    replicaId,
    record: RaftRsDurableStore.readDurableRecordIn(replica.db,
      run.driver.cluster.partitionId),
  }));
}

function passiveState(f) {
  return {
    clockNow: f.run.driver.clock.now(),
    projections: Object.fromEntries(f.run.projections),
    streams: Object.fromEntries(f.run.streams),
    durable: f.run.durable(),
    exactDurable: exactDurable(f.run),
    inboxes: inboxes(f.run),
    applicationCommands: applicationCommands(f.run),
  };
}

async function prepare(f, cell) {
  await f.run.form();
  // Retain the real sends that produce P, as well as its later acceptance.
  observeNative(f);
  await cell.build(f.run);
  // The original producer reads status while constructing its crafted vote.
  // Do this ONLY in setup, while the AppendResponses are in the transport
  // fixture, not accepted into runtime inbound. Every branch saves these
  // identical bytes and never calls the producer inside its measured interval.
  cell.midTurn(f.run);
  const inbox = f.run.driver.cluster.replica(cell.requester).inbox;
  const vote = inbox.pop();
  assert.equal(vote?.message.msgType, RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE,
    'setup: original mid-turn cell produced its transfer-election vote');
  f.vote = vote;
  f.prefix = inbox.splice(0);
  assert.ok(f.prefix.length > 0, 'setup: real AppendResponses exist');
  assert.ok(f.prefix.every((packet) =>
    packet.message.msgType === RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE));
  f.initial = copied({observation: f.run.observe(), ...passiveState(f)});
  f.run.resetStreams();
  f.run.requester = cell.requester;
  f.run.recording = [];
  f.run.asyncSends = true;
}

function deliver(f, label, packet) {
  const packetHash = hash(packet);
  record(f, 'delivery-call', {label, packet, packetHash});
  const result = f.run.driver.port(f.cell.requester).step(packet);
  record(f, 'delivery-answer', {label, result, packetHash,
    unchanged: hash(packet) === packetHash});
  f.deliveries.push({label, result, packetHash});
}

function requestSelected(f) {
  record(f, 'selected-operation-call', {decision: f.cell.decision});
  const returned = f.cell.request(f.run.driver);
  record(f, 'selected-operation-returned', {
    thenable: typeof returned?.then === 'function'});
  f.selected = retainCompletion(f, 'selected-operation', returned);
}

async function unwind() {
  // Fixed passive microtask allowance, not a retry or a progress driver.
  // No status, clock, tick, delivery or native operation is called here.
  for (let turn = 0; turn < PASSIVE_TURNS; turn += 1) await Promise.resolve();
}

async function measure(f) {
  f.phase = PHASE.MEASURED;
  record(f, 'interval-start', {clockNow: f.run.driver.clock.now(),
    captureObservation: 'source-mapped-between-admission-and-first-prefix-step'});
  f.prefix.forEach((packet, index) => deliver(f, `prefix-${index}`, packet));
  if (f.order === ORDER.BEFORE) deliver(f, 'vote', f.vote);
  f.run.holdSends = true;
  requestSelected(f);
  await observe(() => f.run.held.length > 0, 'selected native Ready send is held');
  record(f, 'held-send-cut', {heldSends: f.run.held.length});
  if (f.order === ORDER.LATE) deliver(f, 'vote', f.vote);
  record(f, 'release-held-sends');
  f.run.releaseHeld();
  await observe(() => f.selected.settled, 'selected operation Promise observer ran');
  f.afterSelectedObserver = copied(passiveState(f));
  record(f, 'selected-observer-snapshot', {state: f.afterSelectedObserver});
  if (f.order === ORDER.AFTER) deliver(f, 'vote', f.vote);
  // Exactly one declared dispatch of existing owned timers, at zero elapsed
  // virtual time in every branch. It is not a Raft tick or observer rescue.
  record(f, 'owned-clock-dispatch', {before: f.run.driver.clock.now(), advanceMs: 0});
  f.run.driver.clock.advance(0);
  await unwind();
  record(f, 'interval-end', {clockNow: f.run.driver.clock.now()});
  f.measured = copied({answer: f.selected.value,
    rejected: f.selected.rejected, state: passiveState(f),
    outbound: f.run.recording, completions: f.completions,
    eventCount: f.events.length});
}

async function collectOriginalVectors(f) {
  // These existing OracleRun operations deliberately DRIVE post-observation
  // convergence and restart. Their output cannot prove measured service.
  f.phase = PHASE.POST;
  record(f, 'post-observation-start');
  const run = f.run;
  const afterTurn = run.projectionMismatches();
  await run.deliver();
  for (let round = 0; round < run.exactRounds(); round += 1) await run.round();
  const exact = run.observe();
  const streams = copied(Object.fromEntries(run.streams));
  const durable = run.durable();
  const durableExact = exactDurable(run);
  const atExact = run.projectionMismatches();
  // The original mid-turn cells do not select a timeout-driven settled axis.
  assert.equal(f.cell.settle, false, 'original mid-turn settled axis remains absent');
  const recovered = run.recover(f.cell.requester);
  const recoveredExact = {
    before: durableExact.find(({replicaId}) => replicaId === f.cell.requester),
    after: exactDurable(run).find(({replicaId}) => replicaId === f.cell.requester),
  };
  return {answer: f.selected.value, outbound: f.measured.outbound,
    afterTurn, exact, streams, durable, durableExact, atExact, settled: null,
    recovered, recoveredExact};
}

function evidence(f) {
  return {
    cell: f.cell.id, order: f.order,
    fixtureChoices: {reentry: false, send: 'async', plannedVirtualElapsedMs: 0,
      plannedOwnedClockDispatches: 1, vote: 'original-cell-crafted-transfer-election',
      persistence: 'original-OracleRun-synchronous-OFF-not-power-loss-proof',
      nativeCompletion: 'existing-seams-record-native-entry-not-native-return',
      responseCompletion: 'actual-selected-invocation-Promise-observer',
      acceptanceDifference: f.order === ORDER.AFTER ?
        'vote-withheld-until-selected-Promise-observed' : f.order},
    initial: f.initial, prefix: f.prefix, vote: f.vote,
    deliveries: f.deliveries, afterSelectedObserver: f.afterSelectedObserver,
    measured: f.measured, returned: f.returned,
    events: f.events, observationErrors: f.observationErrors,
    failure: f.failure ? {name: f.failure.name, message: f.failure.message} : null,
  };
}

async function cleanup(t, f) {
  f.phase = PHASE.CLEANUP;
  f.run.releaseHeld();
  let failure = null;
  try {
    await observe(() => f.completions.every((receipt) => receipt.settled),
      'cleanup: owned operation and send Promises settled');
    await unwind();
  } catch (error) {
    failure = error;
  }
  clearObservers();
  if (failure === null) {
    try {
      f.run.dispose();
    } catch (error) {
      failure = error;
    }
  }
  t.diagnostic(JSON.stringify({orderingCompanionCleanup: f.cell.id,
    order: f.order, settled: failure === null,
    retainedDirectory: failure ? f.run.driver.cluster.directory : null,
    failure: failure?.message ?? null}));
  if (failure && !f.failure) throw failure;
}

async function runOrdering(t, cell, order) {
  const f = {cell, order, phase: PHASE.SETUP, events: [], observationErrors: [],
    completions: [], deliveries: [], selected: null, measured: null,
    initial: null, prefix: null, vote: null, afterSelectedObserver: null,
    returned: null, failure: null,
    run: new OracleRun({partitionId: cell.id, replicaIds: cell.replicaIds,
      axes: {...cell.axes, reentry: false}})};
  try {
    await prepare(f, cell);
    await measure(f);
    f.returned = await collectOriginalVectors(f);
    return copied(evidence(f));
  } catch (error) {
    f.failure = error;
    throw error;
  } finally {
    // Preserve every complete/partial vector BEFORE the caller's semantic
    // assertions and before cleanup can alter native state or remove files.
    t.diagnostic(JSON.stringify({orderingCompanion: evidence(f)}));
    await cleanup(t, f);
  }
}

export {ORDER, PHASE, orderingCells, runOrdering};
