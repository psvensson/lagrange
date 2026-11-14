// Reproducers of quest cdc-propagation-node-slot-removal, written to the
// behaviour after the repair, at the topology owner's entry point
// (CDCGroupPropagationService.propagateCDCEvent): the service admits every
// durable wave a source lane presents; no wave is refused, delayed or ordered
// because another lane's wave is in flight; stop retires every wave in flight
// and arms nothing; and the service retains nothing per presenting lane once
// its waves are done.
//
// A lane is one source delivery owner's invocation (each request below has its
// own); every lane of the node shares one virtual clock and no wall clock is
// waited on. The router is the transport seam: its deliveries wait until the
// test answers them with the CDC outcome owner's committed receipt, so a
// target leaf that "never settles" is one the test never answers. Evidence
// ceiling: the source owner's view with controlled recipient answers, never a
// native recipient commit.
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {COLUMN, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {CDC_COMPLETION} from '../../src/cdc/cdc-delivery-outcome.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {createOwnerWorkLedger} from '../helpers/owner-work-ledger.js';
import {
  beginDurableCdcInvocation,
  committedTargetAnswer,
  createDurableCdcEvent,
  createDurableSourceMessageGroupService,
  createDurableVectorPropagationRequest,
  createGroupRow,
  createHeldMessageRouter,
  createMessageGroupServiceRow,
  createTopologyCache,
  setupConfig,
  teardownConfig,
} from './cdc-group-propagation-service-harness.js';

const SOURCE_GROUP = 'g-1';
const TARGET_GROUP = 'g-2';
const GROUPS = Object.freeze([SOURCE_GROUP, TARGET_GROUP]);
const TURNS = 60;
const QUIET_LOGGER = Object.freeze({info() {}, warn() {}, debug() {}, error() {},
  logConsoleOnly() {}});
const OWNER_FILE = /[\\/]src[\\/]topology[\\/]cdc-group-propagation[\w-]*\.js$/u;
const TEST_FILE = fileURLToPath(import.meta.url);
const HOLD = null;

afterEach(teardownConfig);

async function turns(count = TURNS) {
  for (let turn = count; turn > 0; turn -= 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function settledBox(promise) {
  const box = {settled: false, value: undefined, error: undefined};
  box.promise = promise.then((value) => Object.assign(box, {settled: true, value}),
    (error) => Object.assign(box, {settled: true, error}));
  return box;
}

// One running topology owner in safe mode (one source group, one target group)
// over a held router. `answer(call)` is the router's policy per delivery: a
// committed receipt now, or HOLD. Every lane shares `clock`.
function compose(t, {answer = () => HOLD, ledger = null} = {}) {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  const clock = new VirtualTimeSource({startMs: 1000});
  const router = createHeldMessageRouter((call) => {
    const policy = answer(call);
    return policy === HOLD ? null : committedTargetAnswer(call.payload);
  });
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: createTopologyCache({
      nodes: [{[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: SOURCE_GROUP}],
      groups: GROUPS.map((groupId, index) =>
        createGroupRow(groupId, index === 0 ? 'node-a' : `node-${groupId}`)),
      services: [createMessageGroupServiceRow(`${TARGET_GROUP}-r1`, `node-${TARGET_GROUP}`,
        `node-${TARGET_GROUP}/message-group/${TARGET_GROUP}-r1`, RAFT_ROLE.LEADER,
        TARGET_GROUP)],
    }),
    messageRouter: router,
    latencyTreeService: {getRoutingOrder: () => GROUPS},
    nowFn: () => clock.now(),
    deliveryRetryMaxAttempts: 1,
  });
  service.logger = QUIET_LOGGER;
  service.initialize();
  service.start();
  const source = createDurableSourceMessageGroupService(SOURCE_GROUP);
  const f = {clock, router, service, source, lanes: []};
  // One lane presents one vector: its own invocation, the node's source group.
  f.present = (events) => {
    const request = createDurableVectorPropagationRequest(source, events,
      beginDurableCdcInvocation(clock));
    const lane = {events, request, keys: events.map((event) => event.eventKey),
      box: settledBox(service.propagateCDCEvent(request))};
    f.lanes.push(lane);
    return lane;
  };
  f.callsOf = (lane) => router.calls.filter((call) =>
    call.eventKeys.join() === lane.keys.join());
  t.after(async () => {
    ledger?.close();
    service.stop();
    for (const call of router.calls.filter((entry) => entry.held)) {
      call.answer(committedTargetAnswer(call.payload));
    }
    await turns();
  });
  return f;
}

function laneEvent(tableName, sourcePartition, key, sourceLogIndex = 1) {
  return createDurableCdcEvent({tableName, sourcePartition, eventKey: key,
    sourceLogIndex, data: {[COLUMN.NODE_ID]: key}});
}

// The answers the propagation service gave by refusing: typed backpressure
// handed to a lane while its vector reached no recipient.
function refusedLanes(f) {
  return f.lanes.filter((lane) => lane.box.settled &&
    lane.box.value?.error === CDC_COMPLETION.BACKPRESSURE)
    .map((lane) => lane.keys.join());
}

async function untilHeldCalls(f, count) {
  for (let turn = 0; turn < TURNS &&
    f.router.calls.filter((call) => call.held).length < count; turn += 1) {
    await turns(1);
  }
  return f.router.calls.filter((call) => call.held).length;
}

// (1) Isolation across tables.
test('propagateCDCEvent admits and delivers another table\'s vector while one table\'s ' +
  'wave awaits a target leaf that never settles, at zero virtual time', async (t) => {
  const f = compose(t, {answer: (call) =>
    call.tableName === TABLES.SERVICES ? HOLD : 'committed'});
  const start = f.clock.now();
  const held = f.present([laneEvent(TABLES.SERVICES, 'services-p1', 'svc-1')]);
  assert.equal(await untilHeldCalls(f, 1), 1, 'precondition: the services wave awaits its target');
  const other = f.present([laneEvent(TABLES.PARTITIONS, 'partitions-p1', 'part-1'),
    laneEvent(TABLES.PARTITIONS, 'partitions-p1', 'part-2', 2)]);
  await other.box.promise;
  assert.deepEqual(refusedLanes(f), [],
    'no lane is refused because another lane\'s wave is in flight');
  assert.equal(other.box.value?.success, true,
    'the partitions vector is answered with its committed coverage');
  assert.deepEqual(f.callsOf(other).map((call) => [call.targetGroupId, call.eventKeys]),
    [[TARGET_GROUP, ['part-1', 'part-2']]], 'the partitions vector reached its recipient once');
  assert.deepEqual(f.source.batches.map((batch) => batch.map((event) => event.eventKey)),
    [['svc-1'], ['part-1', 'part-2']], 'the source group applied both vectors');
  assert.equal(held.box.settled, false, 'the services wave is still in flight');
  assert.equal(f.clock.now(), start, 'no virtual time elapsed');
});

// (2) Isolation across partitions of one table.
test('propagateCDCEvent admits and delivers a vector of one partition while another ' +
  'partition of the same table awaits a target leaf that never settles', async (t) => {
  const f = compose(t, {answer: (call) =>
    call.sourcePartition === 'nodes-p1' ? HOLD : 'committed'});
  const start = f.clock.now();
  const held = f.present([laneEvent(TABLES.NODES, 'nodes-p1', 'p1-1')]);
  assert.equal(await untilHeldCalls(f, 1), 1, 'precondition: partition p1\'s wave awaits');
  const other = f.present([laneEvent(TABLES.NODES, 'nodes-p2', 'p2-1')]);
  await other.box.promise;
  assert.deepEqual(refusedLanes(f), [],
    'no partition is refused because another partition\'s wave is in flight');
  assert.equal(other.box.value?.success, true);
  assert.deepEqual(f.callsOf(other).map((call) => [call.sourcePartition, call.eventKeys]),
    [['nodes-p2', ['p2-1']]], 'partition p2\'s vector reached its recipient once');
  assert.equal(held.box.settled, false, 'partition p1\'s wave is still in flight');
  assert.equal(f.clock.now(), start, 'no virtual time elapsed');
});

const MANY_LANES = Object.freeze([TABLES.SERVICES, TABLES.PARTITIONS, TABLES.NODES,
  TABLES.REPLICA_OPERATIONS].flatMap((tableName) => [1, 2].map((partition) =>
  Object.freeze({tableName, sourcePartition: `${tableName}-p${partition}`}))));

// (3) Many lanes in one turn.
test(`${MANY_LANES.length} lanes presenting in the same turn are all admitted, none ` +
  'receives backpressure from the propagation service, and every wave is in flight ' +
  'together', async (t) => {
  const f = compose(t);
  const lanes = MANY_LANES.map(({tableName, sourcePartition}) =>
    f.present([laneEvent(tableName, sourcePartition, `${sourcePartition}-1`)]));
  const inFlight = await untilHeldCalls(f, lanes.length);
  assert.deepEqual(refusedLanes(f), [],
    'no lane receives backpressure from the propagation service');
  assert.equal(inFlight, lanes.length, 'every lane\'s wave is at its recipient together');
  assert.deepEqual(lanes.map((lane) => f.callsOf(lane).length), lanes.map(() => 1),
    'each lane\'s vector was delivered exactly once');
  assert.equal(f.source.batches.length, lanes.length, 'the source applied every vector');
  for (const call of f.router.calls) call.answer(committedTargetAnswer(call.payload));
  await Promise.all(lanes.map((lane) => lane.box.promise));
  assert.deepEqual(lanes.map((lane) => lane.box.value?.success), lanes.map(() => true),
    'every wave is answered with its committed coverage');
});

// (5) Stop with several waves in flight.
test('stop with several waves in flight retires every one: each caller settles without a ' +
  'success, each invocation is retired, and nothing is delivered, applied or armed after ' +
  'stop', async (t) => {
  const ledger = createOwnerWorkLedger({ownerFile: OWNER_FILE, testFile: TEST_FILE});
  ledger.open();
  const f = compose(t, {ledger});
  const lanes = [TABLES.SERVICES, TABLES.PARTITIONS, TABLES.NODES].map((tableName) =>
    f.present([laneEvent(tableName, `${tableName}-p1`, `${tableName}-1`)]));
  assert.equal(await untilHeldCalls(f, lanes.length), lanes.length,
    'precondition: every lane\'s wave is in flight at its recipient');
  const appliedBeforeStop = f.source.batches.length;
  const callsBeforeStop = f.router.calls.length;
  ledger.markTerminal();
  f.service.stop();
  for (const call of f.router.calls) call.answer(committedTargetAnswer(call.payload));
  await Promise.all(lanes.map((lane) => lane.box.promise));
  for (const lane of lanes) {
    const answer = lane.box.value ?? lane.box.error;
    assert.notEqual(answer?.success, true, `${lane.keys}: never a success after stop`);
    assert.equal(answer?.deferRetry, true, `${lane.keys}: the source owner keeps the debt`);
    assert.throws(() => lane.request.deliveryContext.assertCurrent(),
      `${lane.keys}: its invocation is retired by stop`);
  }
  const report = ledger.report();
  assert.deepEqual(report.createdAfterTerminal, [], 'nothing is armed after stop');
  assert.deepEqual(report.executedAfterTerminal, [], 'no owner callback runs after stop');
  assert.deepEqual(report.pending, [], 'no owner timer is pending after stop');
  assert.equal(f.service.retrySleepReleases.size, 0, 'no retry delay is held');
  // Move time past every delay by running any owner callback still pending.
  ledger.runPending();
  await turns();
  assert.equal(f.router.calls.length, callsBeforeStop, 'no delivery is started after stop');
  assert.equal(f.source.batches.length, appliedBeforeStop, 'nothing is applied after stop');
});

// The size of every collection the service holds directly.
function retainedCollections(service) {
  return Object.fromEntries(Object.entries(service)
    .filter(([, value]) => value instanceof Map || value instanceof Set || Array.isArray(value))
    .map(([field, value]) => [field, Array.isArray(value) ? value.length : value.size]));
}

// (6, service half) Nothing in the service grows with the presenting lanes.
test('once every wave is done the service retains nothing for the lanes that presented ' +
  'while another wave was in flight', async (t) => {
  const f = compose(t, {answer: (call) =>
    call.tableName === TABLES.SERVICES ? HOLD : 'committed'});
  const idle = retainedCollections(f.service);
  const held = f.present([laneEvent(TABLES.SERVICES, 'services-p1', 'svc-1')]);
  assert.equal(await untilHeldCalls(f, 1), 1, 'precondition: one wave is in flight');
  const presenting = [TABLES.PARTITIONS, TABLES.NODES, TABLES.REPLICA_OPERATIONS,
    TABLES.SERVICE_ENDPOINTS, TABLES.STORAGE_RESERVATIONS].map((tableName) =>
    f.present([laneEvent(tableName, `${tableName}-p1`, `${tableName}-1`)]));
  await Promise.all(presenting.map((lane) => lane.box.promise));
  f.router.calls.find((call) => call.held).answer(
    committedTargetAnswer(f.router.calls.find((call) => call.held).payload));
  await held.box.promise;
  await turns();
  assert.equal(held.box.value?.success, true, 'the held wave completed');
  assert.deepEqual(retainedCollections(f.service), idle,
    'the service holds no queue, timestamp, lifecycle or credit for any lane');
});
