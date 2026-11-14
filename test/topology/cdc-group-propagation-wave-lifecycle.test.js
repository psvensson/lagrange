// Witnesses of quest cdc-propagation-node-slot-removal for overlapping waves at
// the topology owner (CDCGroupPropagationService.propagateCDCEvent), after the
// model amendment of 2026-11-14:
//
// - R-1: the in-flight set. Stop, initialize, start and a restart retire every
//   wave in flight and every wave asleep in a foreground retry; nothing is
//   armed or delivered after stop; a retired wave writes no statistics and
//   emits no PROPAGATED event; the set returns to zero on every path, a throw
//   before plan capture included.
// - C-1 as corrected by CR-1: a wave's aggregate answer. Typed backpressure
//   (the smallest hint of the leaves' latest refusals) only when every leaf
//   the wave leaves uncovered was, in every foreground attempt of the wave,
//   refused by typed backpressure before any effect at that leaf; a leaf
//   attempted with any other outcome keeps the answer unknown for the rest of
//   the wave. These rows run at the production number of foreground attempts.
// - R-2 as corrected by CR-3: a publication-mode write of the mode already
//   current records no transition and still publishes the writer's reason
//   (the base's behaviour); the reason is last-writer-wins.
// - R-3: the foreground-retry-spent report of many waves failing together,
//   the logs table among them, persists nothing and is throttled.
//
// Lanes are invocations on one virtual clock; the router is the transport
// seam, answering with envelopes built by the transport and CDC outcome
// owners. Evidence ceiling: the source owner's view, never a native commit.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {CDC_OPERATION, COLUMN, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {CDC_COMPLETION, unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
import {WAIT_BOUND_SPENT_EVENT} from '../../src/logging/wait-bound-spent.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE, ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE} from '../../src/transport/transport-error-codes.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {CDC_GROUP_PROPAGATION_EVENT, CDC_GROUP_PROPAGATION_REASON, CDC_GROUP_PROPAGATION_RETRY,
  CDC_GROUP_PROPAGATION_STRATEGY, CDC_GROUP_PUBLICATION_MODE} from
  '../../src/topology/cdc-group-propagation-constants.js';
import {createOwnerWorkLedger} from '../helpers/owner-work-ledger.js';
import {
  beginDurableCdcInvocation,
  committedTargetAnswer,
  composeWaveTopology,
  createDurableCdcEvent,
  createDurableSourceMessageGroupService,
  createGroupRow,
  createMessageGroupServiceRow,
  createTopologyCache,
} from './cdc-group-propagation-service-harness.js';

const TURNS = 60;
const OWNER_FILE = /[\\/]src[\\/]topology[\\/]cdc-group-propagation[\w-]*\.js$/u;
const TEST_FILE = fileURLToPath(import.meta.url);
const RETRY_DELAY_MS = 50;
const PRESSURE = Object.freeze({backpressured: true, saturatedNodeCount: 1,
  totalPending: 48, maxPendingUtilization: 0.75});

async function turns(count = TURNS) {
  for (let turn = count; turn > 0; turn -= 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function until(predicate) {
  for (let turn = 0; turn < TURNS && !predicate(); turn += 1) await turns(1);
  return predicate();
}

function laneEvent(tableName, key) {
  return createDurableCdcEvent({tableName, sourcePartition: `${tableName}-p1`, eventKey: key,
    data: {[COLUMN.NODE_ID]: key}});
}

// The recipient's answers, built by their owners.
const ANSWER = Object.freeze({
  committed: (call) => committedTargetAnswer(call.payload),
  unknown: () => buildDeliveryEnvelope({acknowledged: true}, unknownCdcAcceptance()),
  backpressure: (hintMs) => () => buildDeliveryEnvelope({acknowledged: true},
    {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE), retryAfterMs: hintMs}),
  outbound: (hintMs) => () => buildDeliveryEnvelope({
    errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE, retryAfterMs: hintMs}),
  closed: () => buildDeliveryEnvelope({errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE}),
  timeout: () => buildDeliveryEnvelope({errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE}),
  thrown: () => {
    throw new Error('socket closed');
  },
});

function openLedger(t) {
  const ledger = createOwnerWorkLedger({ownerFile: OWNER_FILE, testFile: TEST_FILE});
  ledger.open();
  t.after(() => ledger.close());
  return ledger;
}

// What the owner has done so far: deliveries, source applies, statistics and
// PROPAGATED events.
function effectsOf(f) {
  return {calls: f.router.calls.length, applies: f.source.batches.length,
    stats: {...f.service.stats}, propagated: f.propagated.length};
}

// N waves held at their recipient and one asleep in its foreground retry,
// admitted after `prepare` (the service's state when they are presented).
async function wavesInFlightAndAsleep(t, ledger, prepare = () => {}) {
  const f = composeWaveTopology(t, {
    answer: (call) => call.tableName === TABLES.NODES ? ANSWER.unknown() : null,
    options: {deliveryRetryDelayMs: RETRY_DELAY_MS, deliveryRetryMaxDelayMs: RETRY_DELAY_MS}});
  f.propagated = [];
  f.service.on(CDC_GROUP_PROPAGATION_EVENT.PROPAGATED, (result) => f.propagated.push(result));
  prepare(f.service);
  const lanes = [TABLES.SERVICES, TABLES.PARTITIONS, TABLES.NODES].map((tableName) =>
    f.present([laneEvent(tableName, `${tableName}-1`)]));
  assert.equal(await until(() => f.router.calls.filter((call) => call.held).length === 2 &&
    f.service.retrySleepReleases.size === 1), true,
  'precondition: two waves at their recipient, one asleep in its foreground retry');
  assert.equal(f.service.inFlightDurableWaves.size, lanes.length);
  return {f, lanes, ledger, before: effectsOf(f)};
}

async function assertEveryWaveRetired(f, lanes, before) {
  for (const call of f.router.calls.filter((entry) => entry.held)) {
    call.answer(committedTargetAnswer(call.payload));
  }
  await Promise.all(lanes.map((lane) => lane.box.promise));
  await turns();
  for (const lane of lanes) {
    const answer = lane.box.value ?? lane.box.error;
    assert.notEqual(answer?.success, true, `${lane.keys}: never a success once retired`);
    assert.equal(answer?.deferRetry, true, `${lane.keys}: the source owner keeps the debt`);
    assert.throws(() => lane.request.deliveryContext.assertCurrent(),
      `${lane.keys}: its invocation is retired`);
  }
  assert.equal(f.service.inFlightDurableWaves.size, 0, 'the in-flight set is back to zero');
  assert.equal(f.service.retrySleepReleases.size, 0, 'no retry delay is held');
  assert.deepEqual(effectsOf(f), before, 'a retired wave delivers and applies nothing, ' +
    'writes no statistics and emits no PROPAGATED event');
}

test('stop retires every wave in flight and every wave asleep in a foreground retry, and ' +
  'arms nothing', async (t) => {
  const {f, lanes, ledger, before} = await wavesInFlightAndAsleep(t, openLedger(t));
  ledger.markTerminal();
  f.service.stop();
  await assertEveryWaveRetired(f, lanes, before);
  const report = ledger.report();
  assert.deepEqual(report.createdAfterTerminal, [], 'nothing is armed after stop');
  assert.deepEqual(report.executedAfterTerminal, [], 'no owner callback runs after stop');
  assert.deepEqual(report.pending, [], 'no owner timer is pending after stop');
});

test('initialize retires every wave in flight and every wave asleep in a foreground retry',
  async (t) => {
    const {f, lanes, before} = await wavesInFlightAndAsleep(t, null);
    f.service.initialize();
    await assertEveryWaveRetired(f, lanes, before);
  });

test('start retires every wave admitted while the service was initialized and not yet ' +
  'started: the previous lifetime\'s waves', async (t) => {
  const {f, lanes, before} = await wavesInFlightAndAsleep(t, null,
    (service) => service.initialize());
  f.service.start();
  for (const lane of lanes) {
    assert.throws(() => lane.request.deliveryContext.assertCurrent(),
      `${lane.keys}: start retired its invocation at once`);
  }
  await assertEveryWaveRetired(f, lanes, before);
});

test('a restart retires the old lifetime\'s waves: they produce no further effect, and a ' +
  'lane presenting after the restart is delivered', async (t) => {
  const {f, lanes, before} = await wavesInFlightAndAsleep(t, null);
  f.service.stop();
  f.service.start();
  await assertEveryWaveRetired(f, lanes, before);
  const fresh = f.present([laneEvent(TABLES.REPLICA_OPERATIONS, 'after-restart')]);
  await until(() => f.router.calls.some((call) => call.held));
  for (const call of f.router.calls.filter((entry) => entry.held)) {
    call.answer(committedTargetAnswer(call.payload));
  }
  await fresh.box.promise;
  assert.equal(fresh.box.value?.success, true, 'the new lifetime delivers');
  await turns();
  assert.equal(f.service.inFlightDurableWaves.size, 0);
});

test('the in-flight set holds each wave from admission to its cleanup and returns to zero ' +
  'after success, an uncovered leaf, a throwing leaf and a throw before plan capture',
async (t) => {
  const f = composeWaveTopology(t, {answer: (call) => {
    if (call.tableName === TABLES.PARTITIONS) return ANSWER.unknown();
    if (call.tableName === TABLES.NODES) throw new Error('socket closed');
    return call.tableName === TABLES.SERVICES ? null : ANSWER.committed(call);
  }});
  const lanes = [TABLES.SERVICES, TABLES.PARTITIONS, TABLES.NODES,
    TABLES.REPLICA_OPERATIONS].map((tableName) =>
    f.present([laneEvent(tableName, `${tableName}-1`)]));
  await Promise.all(lanes.slice(1).map((lane) => lane.box.promise));
  await turns();
  assert.equal(f.service.inFlightDurableWaves.size, 1, 'only the held services wave remains');
  assert.deepEqual(lanes.slice(1).map((lane) => lane.box.value?.success ?? 'threw'),
    [false, false, true]);
  const held = f.router.calls.find((call) => call.held);
  held.answer(committedTargetAnswer(held.payload));
  await lanes[0].box.promise;
  await turns();
  assert.equal(lanes[0].box.value?.success, true);
  assert.equal(f.service.inFlightDurableWaves.size, 0, 'the in-flight set is back to zero');
  // A vector the envelope owner cannot capture: the wave throws before its plan.
  const leafCalls = f.source.batches.length + f.router.calls.length;
  const uncapturable = f.present([createDurableCdcEvent({eventKey: 'uncapturable',
    data: {[COLUMN.NODE_ID]: 'n-1', nested: {tripwire: Symbol('uncapturable')}}})]);
  await uncapturable.box.promise;
  await turns();
  assert.ok(uncapturable.box.error, 'precondition: capture threw');
  assert.equal(f.source.batches.length + f.router.calls.length, leafCalls,
    'precondition: it threw before any leaf');
  assert.equal(f.service.inFlightDurableWaves.size, 0,
    'a wave that threw before plan capture left the in-flight set');
});

// C-1: the wave's aggregate answer, one row per uncovered-leaf combination.
const AGGREGATE_ROWS = Object.freeze([
  {name: 'two recipients at capacity: backpressure with the smallest hint',
    answers: {'g-2': ANSWER.backpressure(40), 'g-3': ANSWER.backpressure(30)},
    expect: {error: CDC_COMPLETION.BACKPRESSURE, retryAfterMs: 30}},
  {name: 'a recipient at capacity and a router outbound rejection: backpressure',
    answers: {'g-2': ANSWER.backpressure(30), 'g-3': ANSWER.outbound(25)},
    expect: {error: CDC_COMPLETION.BACKPRESSURE, retryAfterMs: 25}},
  {name: 'a recipient at capacity and an unknown answer: unknown',
    answers: {'g-2': ANSWER.backpressure(30), 'g-3': ANSWER.unknown},
    expect: {error: CDC_COMPLETION.UNKNOWN, retryAfterMs: undefined}},
  {name: 'a recipient at capacity and a closed connection: unknown',
    answers: {'g-2': ANSWER.backpressure(30), 'g-3': ANSWER.closed},
    expect: {error: CDC_COMPLETION.UNKNOWN, retryAfterMs: undefined}},
  {name: 'a recipient at capacity and a throwing delivery: unknown',
    answers: {'g-2': ANSWER.backpressure(30), 'g-3': () => {
      throw new Error('socket closed');
    }},
    expect: {error: CDC_COMPLETION.UNKNOWN, retryAfterMs: undefined}},
  {name: 'the source group at capacity, every target committed: backpressure',
    source: {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE), retryAfterMs: 100},
    answers: {'g-2': ANSWER.committed, 'g-3': ANSWER.committed},
    expect: {error: CDC_COMPLETION.BACKPRESSURE, retryAfterMs: 100}},
]);

for (const row of AGGREGATE_ROWS) {
  test(`aggregate answer: ${row.name}`, async (t) => {
    const f = composeWaveTopology(t, {targets: ['g-2', 'g-3'],
      answer: (call) => row.answers[call.targetGroupId](call),
      applyCDCBatch: row.source ? () => row.source : null});
    const lane = f.present([laneEvent(TABLES.SERVICES, 'svc-1')]);
    await lane.box.promise;
    const answer = lane.box.value;
    assert.equal(answer?.success, false);
    assert.deepEqual({error: answer.error, retryAfterMs: answer.retryAfterMs}, row.expect);
    assert.equal(answer.deferRetry, true, 'the source owner keeps the debt');
  });
}

// CR-1: a leaf's standing is monotone across the wave's foreground attempts.
// `attempts` are the leaf's answers in order (the last one repeats): a leaf
// that was sent and failed may have had an effect, so typed backpressure
// before or after it in the same wave never makes the wave backpressure.
const ATTEMPTS = CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS;
const SOURCE_BACKPRESSURE = Object.freeze({
  ...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE), retryAfterMs: 100});
const UNKNOWN = Object.freeze({error: CDC_COMPLETION.UNKNOWN, retryAfterMs: undefined});
const STANDING_ROWS = Object.freeze([
  {name: 'an unknown answer, then typed backpressure (the vector still in flight)',
    attempts: [ANSWER.unknown, ANSWER.backpressure(100)], expect: UNKNOWN},
  {name: 'a closed connection, then typed backpressure',
    attempts: [ANSWER.closed, ANSWER.backpressure(100)], expect: UNKNOWN},
  {name: 'a message timeout, then typed backpressure',
    attempts: [ANSWER.timeout, ANSWER.backpressure(100)], expect: UNKNOWN},
  {name: 'a throwing delivery, then a router outbound rejection',
    attempts: [ANSWER.thrown, ANSWER.outbound(100)], expect: UNKNOWN},
  {name: 'typed backpressure, then a closed connection',
    attempts: [ANSWER.backpressure(100), ANSWER.closed], expect: UNKNOWN},
  {name: 'typed backpressure in every attempt: backpressure with the latest hint',
    attempts: [ANSWER.backpressure(20), ANSWER.backpressure(90), ANSWER.outbound(60)],
    expect: {error: CDC_COMPLETION.BACKPRESSURE, retryAfterMs: 60}},
]);

for (const row of STANDING_ROWS) {
  test(`leaf standing across ${ATTEMPTS} foreground attempts, target leaf: ${row.name}`,
    async (t) => {
      const f = composeWaveTopology(t, {answer: (call) =>
        row.attempts[Math.min(f.router.calls.length, row.attempts.length) - 1](call)});
      const lane = f.present([laneEvent(TABLES.SERVICES, 'svc-1')]);
      await lane.box.promise;
      assert.equal(f.router.calls.length, ATTEMPTS,
        'precondition: the wave made every foreground attempt at the target leaf');
      assert.deepEqual({error: lane.box.value?.error,
        retryAfterMs: lane.box.value?.retryAfterMs}, row.expect);
    });
}

for (const [name, first, expect] of [
  ['an unknown answer (a commit slower than its deadline), then typed backpressure',
    unknownCdcAcceptance(), UNKNOWN],
  ['typed backpressure in every attempt: backpressure', SOURCE_BACKPRESSURE,
    {error: CDC_COMPLETION.BACKPRESSURE, retryAfterMs: 100}]]) {
  test(`leaf standing across ${ATTEMPTS} foreground attempts, source leaf: ${name}`,
    async (t) => {
      const f = composeWaveTopology(t, {answer: ANSWER.committed,
        applyCDCBatch: () => f.source.batches.length === 1 ? first : SOURCE_BACKPRESSURE});
      const lane = f.present([laneEvent(TABLES.SERVICES, 'svc-1')]);
      await lane.box.promise;
      assert.equal(f.source.batches.length, ATTEMPTS,
        'precondition: the source leaf was attempted in every foreground attempt');
      assert.deepEqual({error: lane.box.value?.error,
        retryAfterMs: lane.box.value?.retryAfterMs}, expect);
    });
}

test('aggregate answer: a pressure-governor defer of every target after the source ' +
  'committed is backpressure', async (t) => {
  const f = composeWaveTopology(t, {targets: ['g-2', 'g-3'], answer: ANSWER.committed});
  f.router.getOutboundPressureSummary = () => ({...PRESSURE});
  const lane = f.present([createDurableCdcEvent({tableName: TABLES.MESSAGE_GROUPS,
    operation: CDC_OPERATION.UPSERT, data: {[COLUMN.GROUP_ID]: 'mg-pressure'}})]);
  await lane.box.promise;
  assert.equal(f.router.calls.length, 0, 'no target was sent under local pressure');
  assert.equal(f.source.batches.length, 1, 'the source leaf committed first');
  assert.equal(lane.box.value?.error, CDC_COMPLETION.BACKPRESSURE);
});

// R-2: overlapping waves whose plans imply the mode already current.
test('overlapping waves whose plans imply the current publication mode record no ' +
  'transition', async (t) => {
  const f = composeWaveTopology(t, {mode: LATENCY_PROPAGATION_MODE.GROUPED});
  const before = f.service.getPublicationModeDiagnostics();
  const lanes = [TABLES.SERVICES, TABLES.PARTITIONS, TABLES.NODES].map((tableName) =>
    f.present([laneEvent(tableName, `${tableName}-1`)]));
  assert.equal(await until(() => f.router.calls.length === lanes.length), true,
    'every wave is in flight together');
  for (const call of f.router.calls) call.answer(committedTargetAnswer(call.payload));
  await Promise.all(lanes.map((lane) => lane.box.promise));
  assert.deepEqual(lanes.map((lane) => lane.box.value?.strategy),
    lanes.map(() => CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR),
    'precondition: every wave planned grouped');
  assert.deepEqual(f.service.getPublicationModeDiagnostics(), before,
    'mode, reason, entry time and transition history are unchanged');
});

// R-2, several source groups: a wave of a source group whose latency group is
// not the node's is refused before any publication write (the only case the
// code lets two sources of one node plan differently; see the quest log).
test('a source group of another latency group is refused before it writes the ' +
  'publication mode, while a wave of the node\'s own source group is in flight', async (t) => {
  const f = composeWaveTopology(t, {mode: LATENCY_PROPAGATION_MODE.GROUPED});
  const before = f.service.getPublicationModeDiagnostics();
  const own = f.present([laneEvent(TABLES.SERVICES, 'svc-1')]);
  await until(() => f.router.calls.length === 1);
  const other = await f.service.propagateCDCEvent({events: [laneEvent(TABLES.NODES, 'n-1')],
    sourceMessageGroupService: createDurableSourceMessageGroupService('g-2'),
    deliveryContext: beginDurableCdcInvocation(f.clock)});
  assert.equal(other.fallbackReason, CDC_GROUP_PROPAGATION_REASON.SOURCE_GROUP_MISMATCH);
  await turns();
  assert.equal(f.service.inFlightDurableWaves.size, 1, 'the refused wave left the set');
  for (const call of f.router.calls.filter((entry) => entry.held)) {
    call.answer(committedTargetAnswer(call.payload));
  }
  await own.box.promise;
  assert.deepEqual(f.service.getPublicationModeDiagnostics(), before);
});

// CR-3: the reason at an unchanged mode. A grouped node whose plan falls back
// first because it has no latency group and then, once it has one, because a
// coordinator has no address: both plans are conservative fan-out. Readiness
// decides on the reason (recovery eligibility, the planning decision guard).
test('at an unchanged publication mode the published reason is the latest admitted plan\'s: ' +
  'no transition is recorded, and a wave admitted under the earlier reason does not write it ' +
  'back when it completes', async (t) => {
  const node = {[COLUMN.NODE_ID]: 'node-a'};
  const groups = [];
  const held = Promise.withResolvers();
  const f = composeWaveTopology(t, {mode: LATENCY_PROPAGATION_MODE.GROUPED,
    applyCDCBatch: () => f.source.batches.length === 1 ? held.promise : unknownCdcAcceptance(),
    options: {
      systemTableCache: {
        get: (table, key) => table === TABLES.NODES && key === 'node-a' ? {...node} : null,
        getAll: (table) => table === TABLES.LATENCY_GROUPS ? groups.map((row) => ({...row})) : [],
        filter: () => [],
      },
      latencyTreeService: {getRoutingOrder: () => groups.map((row) => row[COLUMN.GROUP_ID])},
    }});
  const published = () => {
    const {currentMode, reasonCode, recentTransitions} = f.service.getPublicationModeDiagnostics();
    return {currentMode, reasonCode, transitions: recentTransitions.length};
  };
  const earlier = f.present([laneEvent(TABLES.SERVICES, 'svc-1')]);
  await until(() => f.source.batches.length === 1);
  assert.deepEqual(published(), {currentMode: CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
    reasonCode: CDC_GROUP_PROPAGATION_REASON.MISSING_LOCAL_GROUP, transitions: 1},
  'precondition: the first plan falls back for the missing latency group');
  node[COLUMN.LATENCY_GROUP_ID] = 'g-1';
  groups.push(createGroupRow('g-1', 'node-a'), createGroupRow('g-2', 'node-g-2'));
  const later = f.present([laneEvent(TABLES.NODES, 'node-1')]);
  await later.box.promise;
  const afterLater = {currentMode: CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
    reasonCode: CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS, transitions: 1};
  assert.equal(later.box.value?.fallbackReason, afterLater.reasonCode,
    'precondition: the second plan falls back for the coordinator address');
  assert.deepEqual(published(), afterLater,
    'the equal-mode write records no transition and publishes the current plan\'s reason');
  held.resolve(unknownCdcAcceptance());
  await earlier.box.promise;
  assert.deepEqual(published(), afterLater, 'the earlier wave\'s completion writes nothing');
});

// CR-3, the alternation found: two source groups of one node (a second
// message group whose service lives on the node) plan over different target
// sets, so their plans can give different reasons for one mode. Each admission
// publishes its own plan's reason (last writer wins), so overlapping waves of
// the two sources alternate the reason once per admission, with no transition.
// One source group cannot: every wave's write is of a plan captured in the
// same synchronous span (the test above).
test('waves of two source groups of one node whose plans give different reasons for one ' +
  'mode alternate the published reason once per admission and record no transition',
async (t) => {
  const f = composeWaveTopology(t, {mode: LATENCY_PROPAGATION_MODE.GROUPED, options: {
    systemTableCache: createTopologyCache({
      nodes: [{[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: 'g-1'}],
      groups: [createGroupRow('g-1', 'node-a'), createGroupRow('g-3', null)],
      services: [createMessageGroupServiceRow('s2-r1', 'node-a', '', RAFT_ROLE.LEADER, 's2')]}),
    latencyTreeService: {getRoutingOrder: () => ['g-1', 'g-3']}}});
  const second = createDurableSourceMessageGroupService('s2');
  const present = (source, key) => f.service.propagateCDCEvent({
    events: [laneEvent(TABLES.SERVICES, key)], sourceMessageGroupService: source,
    deliveryContext: beginDurableCdcInvocation(f.clock)});
  const reasons = [];
  for (const [source, key] of [[f.source, 'a'], [second, 'b'], [f.source, 'c'], [second, 'd']]) {
    const wave = present(source, key);
    reasons.push(f.service.getPublicationModeDiagnostics().reasonCode);
    await wave;
  }
  const {currentMode, recentTransitions} = f.service.getPublicationModeDiagnostics();
  assert.deepEqual(reasons, [CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS,
    CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_NODE,
    CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS,
    CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_NODE],
  'each admission publishes the reason of its own source group\'s plan');
  assert.equal(currentMode, CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT);
  assert.equal(recentTransitions.length, 1, 'one transition into the mode, none between reasons');
});

// R-3: many waves exhaust their foreground retries together, logs-table
// waves among them.
test('waves of the logs table and others exhausting their retries together persist no ' +
  'log row and emit one throttled console line', async (t) => {
  const persisted = [];
  const consoleLines = [];
  const logger = {
    info: (...args) => persisted.push(['info', ...args]),
    debug: (...args) => persisted.push(['debug', ...args]),
    warn: (...args) => persisted.push(['warn', ...args]),
    error: (...args) => persisted.push(['error', ...args]),
    logConsoleOnly: (level, message, context) => consoleLines.push({level, message, context}),
  };
  const f = composeWaveTopology(t, {logger, answer: ANSWER.unknown});
  const lanes = [TABLES.LOGS, TABLES.LOGS, TABLES.SERVICES, TABLES.NODES, TABLES.LOGS]
    .map((tableName, index) => f.present([createDurableCdcEvent({tableName,
      sourcePartition: `${tableName}-p${index}`, eventKey: `${tableName}-${index}`,
      data: {[COLUMN.NODE_ID]: `${index}`}})]));
  await Promise.all(lanes.map((lane) => lane.box.promise));
  assert.deepEqual(lanes.map((lane) => lane.box.value?.success), lanes.map(() => false));
  assert.deepEqual(persisted.filter(([level]) => level === 'error' || level === 'warn'), [],
    'no failure report reaches a persisted log sink');
  const spent = consoleLines.filter((line) => line.context?.event === WAIT_BOUND_SPENT_EVENT);
  assert.equal(spent.length, 1, 'one console line for the five spent waves (throttled)');
});
