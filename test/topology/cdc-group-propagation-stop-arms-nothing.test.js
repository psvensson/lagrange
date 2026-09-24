// Once the CDC group propagation service stops, nothing it owns arms again:
// no retry delay, no batch window, no background retry wave, and no router
// delivery to a target it has not reached yet.
//
// Round-4 R4-1: a background retry wave whose router attempt was in flight at
// stop() re-armed its retry timer after stop. Round-4 C: a multi-target
// delivery kept delivering to the remaining targets after stop. The class is
// closed in the owner: every timer the service arms goes through one
// primitive (armPropagationTimer), which refuses once the service is stopped
// (isPropagationStopped), and each attempt's post-attempt path and each
// per-target step checks the same guard. The census below fails when a timer
// is armed outside that primitive.
//
// Order is controlled by holding and resolving the router's answer; the
// background wave's retry delay is driven by node:test's mock timers, never
// by waiting on a wall clock.

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mock, test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {COLUMN, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {LATENCY_PROPAGATION_MODE} from
  '../../src/topology/latency-topology-constants.js';
import * as CDC_GROUP_PROPAGATION_CONSTANTS from
  '../../src/topology/cdc-group-propagation-constants.js';
import {CDCGroupPropagationService} from
  '../../src/topology/cdc-group-propagation-service.js';
import {
  createGroupRow,
  createMessageGroupServiceRow,
  createTopologyCache,
  setupConfig,
  teardownConfig,
} from './cdc-group-propagation-service-harness.js';

const TURNS = 30;
const QUIET_LOGGER = Object.freeze({info() {}, warn() {}, debug() {}, error() {}});
const TARGETS = Object.freeze([
  Object.freeze({groupId: 'mg-node-b', coordinatorNodeId: 'node-b',
    address: 'node-b/message-group/mg-node-b'}),
  Object.freeze({groupId: 'mg-node-c', coordinatorNodeId: 'node-c',
    address: 'node-c/message-group/mg-node-c'}),
]);
const STOPPED_ERROR =
  CDC_GROUP_PROPAGATION_CONSTANTS.CDC_GROUP_PROPAGATION_DELIVERY_ERROR
    ?.PROPAGATION_STOPPED;
const REFUSED = Object.freeze({acknowledged: false, error: 'refused'});

// A router that holds every delivery until the test answers it.
function createHeldRouter(service) {
  const router = {
    calls: [],
    deliver(address) {
      return new Promise((resolve) => {
        router.calls.push({address, afterStop: service.state === 'stopped',
          answer: resolve});
      });
    },
  };
  return router;
}

function startService(options = {}) {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: createTopologyCache({
      nodes: [{[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: 'g-1'}],
      groups: [createGroupRow('g-1', 'node-a'), createGroupRow('g-2', 'node-b'),
        createGroupRow('g-3', 'node-c')],
      services: TARGETS.map((target) => createMessageGroupServiceRow(
        target.groupId, target.coordinatorNodeId, target.address,
        RAFT_ROLE.LEADER, target.groupId)),
    }),
    latencyTreeService: {getRoutingOrder: () => ['g-1', 'g-2', 'g-3']},
    nowFn: () => 1000,
    ...options,
  });
  service.messageRouter = createHeldRouter(service);
  service.logger = QUIET_LOGGER;
  service.initialize();
  service.start();
  return service;
}

async function turns(count) {
  for (let turn = count; turn > 0; turn -= 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function untilRouterCalls(service, count) {
  for (let turn = 0; turn < TURNS && service.messageRouter.calls.length < count;
    turn += 1) {
    await turns(1);
  }
  assert.equal(service.messageRouter.calls.length, count,
    `router delivery ${count} is in flight`);
}

function deliver(service, targets) {
  const box = {answer: null};
  service.deliverToTargetsWithRetry({
    tableName: TABLES.STORAGE_RESERVATIONS,
    operation: 'UPDATE',
    data: {reservation_id: 'res-1', status: 'released'},
    sourceGroupId: 'mg-node-a',
    targets: targets.map((target) => ({...target})),
    allowBatching: false,
  }).then((answer) => {
    box.answer = answer;
  });
  return box;
}

function assertArmsNothing(service) {
  assert.equal(service.backgroundRetryTimers.size, 0,
    'no background retry timer is armed after stop');
  assert.equal(service.backgroundRetryEntriesByKey.size, 0,
    'no background retry wave is held after stop');
  assert.equal(service.immediateBatchTimers.size, 0,
    'no batch timer is armed after stop');
  assert.equal(service.retrySleepReleases?.size ?? 0, 0,
    'no retry delay is held after stop');
}

test('a background retry wave in flight at stop re-arms nothing', async () => {
  mock.timers.enable({apis: ['setTimeout']});
  const service = startService({deliveryRetryMaxAttempts: 1});
  try {
    // The synchronous attempt is refused: the delivery goes to the
    // background retry owner, which arms its wave.
    const box = deliver(service, [TARGETS[0]]);
    await untilRouterCalls(service, 1);
    service.messageRouter.calls[0].answer(REFUSED);
    await turns(TURNS);
    assert.ok(Array.isArray(box.answer), 'the synchronous delivery answered');
    assert.equal(service.backgroundRetryTimers.size, 1,
      'the background retry wave is armed');

    // The wave's timer fires; its router attempt is in flight when the
    // service stops, and the router then refuses it.
    mock.timers.tick(service.deliveryRetryMaxDelayMs);
    await untilRouterCalls(service, 2);
    service.stop();
    service.messageRouter.calls[1].answer(REFUSED);
    await turns(TURNS);

    assertArmsNothing(service);
    mock.timers.tick(3600000);
    await turns(TURNS);
    assert.equal(service.messageRouter.calls.length, 2,
      'no router delivery is made after stop, however far the clock moves');
  } finally {
    service.stop();
    mock.timers.reset();
    teardownConfig();
  }
});

test('stop during the first of two targets: no router delivery after stop, ' +
  'the second target is answered stopped', async () => {
  const service = startService();
  try {
    const box = deliver(service, TARGETS);
    await untilRouterCalls(service, 1);
    service.stop();
    service.messageRouter.calls[0].answer(REFUSED);
    await turns(TURNS);

    assert.equal(service.messageRouter.calls.filter((call) =>
      call.afterStop).length, 0, 'no router delivery is started after stop');
    assert.ok(Array.isArray(box.answer), 'the delivery settles at once');
    assert.deepEqual(box.answer.map((failure) =>
      `${failure.targetGroupId}:${failure.error}`),
    TARGETS.map((target) => `${target.groupId}:${STOPPED_ERROR}`),
    'both targets are answered with the typed stopped outcome');
    assertArmsNothing(service);
  } finally {
    service.stop();
    teardownConfig();
  }
});

test('the timer primitive refuses to arm once the service is stopped', () => {
  const service = startService();
  try {
    service.stop();
    assert.equal(typeof service.armPropagationTimer, 'function',
      'the service owns one timer primitive');
    assert.equal(service.armPropagationTimer(() => {}, 1), null,
      'a stopped service arms no timer');
  } finally {
    teardownConfig();
  }
});

// The census: every timer this owner arms goes through its one primitive.
// A new setTimeout / setInterval / setImmediate anywhere else in the owner's
// files fails here, so it cannot arm after stop unguarded.
const OWNER_FILES = Object.freeze([
  'src/topology/cdc-group-propagation-service.js',
  'src/topology/cdc-group-propagation-delivery-methods.js',
  'src/topology/cdc-group-propagation-routing.js',
]);
const TIMER_CALL = /\b(setTimeout|setInterval|setImmediate)\(/gu;

test('census: the owner arms timers only through armPropagationTimer', () => {
  const armSites = [];
  for (const file of OWNER_FILES) {
    const source = readFileSync(
      fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8');
    for (const match of source.matchAll(TIMER_CALL)) {
      const before = source.slice(0, match.index);
      const enclosing = [...before.matchAll(/^ {2}(?:async )?(\w+)\(/gmu)]
        .at(-1)?.[1] ?? null;
      armSites.push(`${file}:${enclosing}:${match[1]}`);
    }
  }
  assert.deepEqual(armSites, [
    'src/topology/cdc-group-propagation-service.js:armPropagationTimer:setTimeout',
  ], 'every timer is armed through the primitive that refuses after stop');
});
