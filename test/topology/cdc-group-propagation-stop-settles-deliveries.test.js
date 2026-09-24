// Stopping the CDC group propagation service settles every delivery it holds.
//
// Witnessed on the rs-raft cutover (fresh-join-via-non-seed-node, a teardown
// hang): the seed cleanup stops the latency topology, and with it this
// service, before it shuts down its replica handler. A partition's CDC
// delivery (the seed's hydration propagation subscriber, through
// propagateSafe) was waiting in an immediate batch; stop() cleared the batch
// timer and entry without answering the batch's waiters, so the delivery
// never settled. PartitionService.shutdown awaits its pending CDC deliveries,
// so ReplicaHandler.shutdown, and the seed teardown, never completed.
//
// The service owns its stopped answer: stop() answers every waiter of every
// pending batch, and every retry delay it holds, with the typed stopped
// outcome (the targets were not delivered to, and no background retry will
// follow); a delivery that arrives after stop answers the same at once, with
// no new batch and no timer. Order is controlled by calling stop() between
// the service's own steps; settlement is observed by turns, never by a clock.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {COLUMN, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {LATENCY_PROPAGATION_MODE} from
  '../../src/topology/latency-topology-constants.js';
import * as CDC_GROUP_PROPAGATION_CONSTANTS from
  '../../src/topology/cdc-group-propagation-constants.js';
import {CDCGroupPropagationService} from
  '../../src/topology/cdc-group-propagation-service.js';
import {LatencyTopologySetup} from
  '../../src/bootstrap/shared/latency-topology-setup.js';
import {
  createGroupRow,
  createMessageGroupServiceRow,
  createMessageRouter,
  createTopologyCache,
  setupConfig,
  teardownConfig,
} from './cdc-group-propagation-service-harness.js';

const SETTLE_TURNS = 20;
// Longer than the whole test: the batch window stays open until stop().
const HELD_BATCH_WINDOW_MS = 3600000;
const QUIET_LOGGER = Object.freeze({info() {}, warn() {}, debug() {}, error() {}});
const TARGET = Object.freeze({
  groupId: 'mg-node-b',
  coordinatorNodeId: 'node-b',
  address: 'node-b/message-group/mg-node-b',
});
const STOPPED_ERROR =
  CDC_GROUP_PROPAGATION_CONSTANTS.CDC_GROUP_PROPAGATION_DELIVERY_ERROR
    ?.PROPAGATION_STOPPED ?? 'a typed stopped outcome';

function startService({
  routerResults = [{acknowledged: true}],
  immediateBatchDelayMs = undefined,
} = {}) {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: createTopologyCache({
      nodes: [{[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: 'g-1'}],
      groups: [createGroupRow('g-1', 'node-a'), createGroupRow('g-2', 'node-b')],
      services: [createMessageGroupServiceRow(
        TARGET.groupId, TARGET.coordinatorNodeId, TARGET.address,
        RAFT_ROLE.LEADER)],
    }),
    messageRouter: createMessageRouter(routerResults),
    latencyTreeService: {getRoutingOrder: () => ['g-1', 'g-2']},
    nowFn: () => 1000,
    immediateBatchDelayMs,
  });
  service.logger = QUIET_LOGGER;
  service.initialize();
  service.start();
  return service;
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

async function yieldTurns(turns) {
  for (let turn = turns; turn > 0; turn -= 1) {
    await nextTurn();
  }
}

// A delivery answer is a list of per-target failures; the service never
// rejects, so a rejection fails the test where it is awaited.
function track(operation) {
  const box = {outcome: null};
  box.done = operation.then((value) => Object.assign(box, {outcome: {value}}));
  return box;
}

// The conservative fan-out's delivery of one storage_reservations update
// (the hung seed's third pending delivery) to one target group.
function deliverReservationUpdate(service) {
  return track(service.deliverToTargetsWithRetry({
    tableName: TABLES.STORAGE_RESERVATIONS,
    operation: 'UPDATE',
    data: {reservation_id: 'res-1', status: 'released'},
    sourceGroupId: 'mg-node-a',
    targets: [{...TARGET}],
  }));
}

function assertStoppedOutcome(box) {
  assert.notEqual(box.outcome, null,
    'the delivery settles once the service stops, without any clock moving');
  assert.ok(Array.isArray(box.outcome.value),
    'it settles with the service\'s delivery answer, never an exception');
  assert.deepEqual(box.outcome.value.map((failure) => failure.targetGroupId),
    [TARGET.groupId], 'the target is reported as not delivered to');
  assert.ok(box.outcome.value.every((failure) =>
    failure.error === STOPPED_ERROR),
  'the answer is the typed stopped outcome, never a success or a pending retry');
}

function assertHoldsNothing(service) {
  assert.equal(service.immediateBatchTimers.size, 0,
    'no batch timer is armed after stop');
  assert.equal(service.immediateBatchEntriesByKey.size, 0,
    'no batch entry is held after stop');
  assert.equal(service.backgroundRetryTimers.size, 0,
    'no background retry is armed after stop');
}

test('stop() inside a batch window settles the waiting delivery with the ' +
  'typed stopped outcome', async () => {
  const service = startService({immediateBatchDelayMs: HELD_BATCH_WINDOW_MS});
  try {
    const box = deliverReservationUpdate(service);
    await yieldTurns(1);
    assert.equal(service.immediateBatchEntriesByKey.size, 1,
      'the delivery waits in an immediate batch');
    assert.equal(box.outcome, null, 'the delivery is pending');

    service.stop();
    await yieldTurns(SETTLE_TURNS);

    assertStoppedOutcome(box);
    assertHoldsNothing(service);
  } finally {
    service.stop();
    teardownConfig();
  }
});

test('the latency topology teardown (LatencyTopologySetup.stop) inside a ' +
  'batch window settles the waiting delivery', async () => {
  const service = startService({immediateBatchDelayMs: HELD_BATCH_WINDOW_MS});
  try {
    const box = deliverReservationUpdate(service);
    await yieldTurns(1);
    assert.equal(box.outcome, null, 'the delivery waits in the batch window');

    // The seed cleanup's own teardown step, as it runs before the replica
    // handler shuts down (seed-cleanup-handler.js).
    await LatencyTopologySetup.stop({cdcGroupPropagationService: service});
    await yieldTurns(SETTLE_TURNS);

    assertStoppedOutcome(box);
    assertHoldsNothing(service);
  } finally {
    service.stop();
    teardownConfig();
  }
});

test('a delivery that arrives after stop answers at once: no batch, no ' +
  'timer', async () => {
  const service = startService();
  try {
    service.stop();
    const box = deliverReservationUpdate(service);
    await yieldTurns(SETTLE_TURNS);

    assertStoppedOutcome(box);
    assertHoldsNothing(service);
  } finally {
    service.stop();
    teardownConfig();
  }
});

test('stop() during a delivery\'s retry delay ends the delay at once with ' +
  'the typed stopped outcome', async () => {
  // The target refuses every delivery, so the synchronous retry loop sleeps.
  const service = startService({
    routerResults: [{acknowledged: false, error: 'refused'}],
  });
  try {
    const box = track(service.deliverToTargetsWithRetry({
      tableName: TABLES.STORAGE_RESERVATIONS,
      operation: 'UPDATE',
      data: {reservation_id: 'res-1', status: 'released'},
      sourceGroupId: 'mg-node-a',
      targets: [{...TARGET}],
      allowBatching: false,
    }));
    for (let turn = 0; turn < SETTLE_TURNS &&
      service.messageRouter.calls.length === 0; turn += 1) {
      await yieldTurns(1);
    }
    await yieldTurns(SETTLE_TURNS);
    assert.equal(service.messageRouter.calls.length, 1,
      'the first attempt was refused and the loop holds its retry delay');
    assert.equal(box.outcome, null, 'the delivery is pending in that delay');

    service.stop();
    await yieldTurns(SETTLE_TURNS);

    assertStoppedOutcome(box);
    assert.equal(service.messageRouter.calls.length, 1,
      'no delivery attempt is made after stop');
    assertHoldsNothing(service);
  } finally {
    service.stop();
    teardownConfig();
  }
});
