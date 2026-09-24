// Once the CDC group propagation service stops, the service starts no further
// work: no timer or immediate is created from its code, no router delivery is
// started and no proposal is made on the source message group. Every awaiting
// caller gets the typed stopped answer.
//
// Witnessed on the rs-raft cutover:
// - A delivery waiting in a batch window never settled at stop (the seed
//   teardown hang).
// - A retry delay was armed after stop (round 3).
// - A background retry wave in flight at stop re-armed its timer (round 4, R4-1).
// - Deliveries continued to the remaining targets after stop (round 4, C).
// - A propagate call after stop still proposed on the source message group
//   (round 5, N1).
//
// The deciding check is the creations record. An async_hooks init hook
// records every Timeout and Immediate created after stop(), from any stack
// (a direct call, node:timers/promises, a promise continuation, a nextTick, a
// microtask, an interval or an immediate chain), whether referenced or
// unref'd. It excludes only the test file's own turns. The record must be
// empty once the lane has settled and pending microtasks, nextTicks and
// immediates have drained. Each lane is fully in memory: the router and the
// source message group are held fakes, so nothing else creates a timer.
//
// The second check counts live handles. The live Timeout and Immediate
// handles (process.getActiveResourcesInfo()) after the lane settles must be
// no more than just before stop(). Each record entry names the first source
// file:line on its creating stack, and the failure message shows it.
//
// Residual limit: owner work still waiting on a promise the lane holds at
// assert time is not observed, and none is pending on the fix.
//
// Every public lane is driven to one of its awaits, and stop() lands there:
// - propagate in safe and in grouped mode;
// - grouped delivery and its safe-fanout recovery;
// - the immediate batch;
// - the retry loop with its sleep;
// - the background retry wave;
// - delivery to several targets.
// Each lane also requires that no router delivery is started and no proposal
// is made on the source group after stop, and that every caller still waiting
// at stop gets the typed stopped answer.
//
// Order is controlled by held promises: the router's answer and the source
// group's apply. A timer the service must fire before stop (a batch flush, a
// background wave) is fired with node:test mock timers. The mock is restored
// before stop() and its handle count, so every recorded creation and every
// counted handle is a real one. No wall clock is waited on.

import assert from 'node:assert/strict';
import {createHook} from 'node:async_hooks';
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

const TURNS = 60;
const QUIET_LOGGER = Object.freeze({info() {}, warn() {}, debug() {}, error() {}});
const STOPPED_ERROR =
  CDC_GROUP_PROPAGATION_CONSTANTS.CDC_GROUP_PROPAGATION_DELIVERY_ERROR
    ?.PROPAGATION_STOPPED ?? 'a typed stopped outcome';
const REFUSED = Object.freeze({acknowledged: false, error: 'refused'});
// Batched by the owner (an internal-cache table) and not batched (a user table).
const BATCHED_TABLE = TABLES.STORAGE_RESERVATIONS;
const UNBATCHED_TABLE = 'orders';
const TARGETS = Object.freeze(['b', 'c'].map((node) => Object.freeze({
  groupId: `mg-node-${node}`,
  coordinatorNodeId: `node-${node}`,
  address: `node-${node}/message-group/mg-node-${node}`,
})));

const ACTIVE_HANDLE_TYPES = new Set(['Timeout', 'Immediate']);
const TEST_FILE = fileURLToPath(import.meta.url);
const SOURCE_FRAME = /\((?:file:\/\/)?(\/[^):]+\.js:\d+)/u;

function countActiveHandles() {
  return process.getActiveResourcesInfo()
    .filter((type) => ACTIVE_HANDLE_TYPES.has(type)).length;
}

// Diagnostics only: every Timeout and Immediate created after stop, named by
// the first source frame on its creating stack.
const observation = {open: false, creations: []};
createHook({
  init(asyncId, type) {
    if (!observation.open || !ACTIVE_HANDLE_TYPES.has(type)) {
      return;
    }
    const stackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 64;
    const {stack} = new Error();
    Error.stackTraceLimit = stackTraceLimit;
    // Past this hook's own frame, the first source frame that created it.
    const creatingStack = stack.split('\n').slice(2).join('\n');
    const frame = creatingStack.match(SOURCE_FRAME)?.[1] ?? 'node internals';
    // The test's own turns are not the service's work.
    if (!frame.startsWith(TEST_FILE)) {
      observation.creations.push(`${type} at ${frame}`);
    }
  },
}).enable();

async function turns(count) {
  for (let turn = count; turn > 0; turn -= 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function compose(mode, options = {}) {
  setupConfig(mode);
  const lane = {stopped: false, routerCalls: [], applies: [], heldApply: null};
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: createTopologyCache({
      nodes: [{[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: 'g-a'}],
      groups: [createGroupRow('g-a', 'node-a'), createGroupRow('g-b', 'node-b'),
        createGroupRow('g-c', 'node-c')],
      services: [
        {groupId: 'mg-node-a', coordinatorNodeId: 'node-a',
          address: 'node-a/message-group/mg-node-a'},
        ...TARGETS,
      ].map((target) => createMessageGroupServiceRow(target.groupId,
        target.coordinatorNodeId, target.address, RAFT_ROLE.LEADER,
        target.groupId)),
    }),
    messageRouter: {
      // Holds every delivery until the lane answers it.
      deliver: (address) => new Promise((answer) => {
        lane.routerCalls.push({address, afterStop: lane.stopped, answer});
      }),
    },
    latencyTreeService: {getRoutingOrder: () => ['g-a', 'g-b', 'g-c']},
    nowFn: () => 1000,
    ...options,
  });
  service.logger = QUIET_LOGGER;
  service.initialize();
  service.start();
  lane.service = service;
  lane.source = {
    groupId: 'mg-node-a',
    replicaId: 'mg-node-a-r1',
    applyCDCEvent: () => {
      lane.applies.push({afterStop: lane.stopped});
      return lane.holdApply ? new Promise((release) => {
        lane.heldApply = release;
      }) : Promise.resolve();
    },
  };
  lane.stop = () => {
    lane.stopped = true;
    lane.handlesBeforeStop = countActiveHandles();
    observation.open = true;
    observation.creations = [];
    service.stop();
  };
  return lane;
}

function track(lane, operation) {
  lane.box = {answer: null};
  operation.then((answer) => {
    lane.box.answer = answer;
  });
}

function deliver(lane, table, targets = [TARGETS[0]], extra = {}) {
  track(lane, lane.service.deliverToTargetsWithRetry({
    tableName: table, operation: 'UPDATE',
    data: {id: `${table}-1`, status: 'released'},
    sourceGroupId: 'mg-node-a', targets: targets.map((target) => ({...target})),
    ...extra,
  }));
}

function propagate(lane, table = UNBATCHED_TABLE) {
  track(lane, lane.service.propagateCDCEvent({
    tableName: table, operation: 'UPDATE', data: {id: `${table}-1`},
    sourceMessageGroupService: lane.source,
  }));
}

async function untilRouterCalls(lane, count) {
  for (let turn = 0; turn < TURNS && lane.routerCalls.length < count;
    turn += 1) {
    await turns(1);
  }
  assert.equal(lane.routerCalls.length, count,
    `router delivery ${count} is in flight before stop`);
}

// Fire a timer the owner armed before stop, then restore real timers so every
// creation after stop is observed.
async function fireOwnerTimer(lane, delayMs) {
  mock.timers.tick(delayMs);
  await turns(TURNS);
  mock.timers.reset();
}

function answerLastCall(lane, answer = REFUSED) {
  lane.routerCalls.at(-1).answer(answer);
}

const LANES = [
  {name: 'propagate (safe mode) called after stop', async drive(lane) {
    lane.stop();
    propagate(lane);
  }},
  {name: 'propagate (grouped mode) called after stop',
    mode: LATENCY_PROPAGATION_MODE.GROUPED, async drive(lane) {
      lane.stop();
      propagate(lane);
    }},
  {name: 'propagate (safe mode), stop while the source group applies',
    async drive(lane) {
      lane.holdApply = true;
      propagate(lane);
      await turns(3);
      lane.stop();
      lane.heldApply();
    }},
  {name: 'propagate (grouped mode), stop while the source group applies',
    mode: LATENCY_PROPAGATION_MODE.GROUPED, async drive(lane) {
      lane.holdApply = true;
      propagate(lane);
      await turns(3);
      lane.stop();
      lane.heldApply();
    }},
  {name: 'propagate (grouped mode), stop during the grouped delivery',
    mode: LATENCY_PROPAGATION_MODE.GROUPED, async drive(lane) {
      propagate(lane);
      await untilRouterCalls(lane, 1);
      lane.stop();
      answerLastCall(lane);
    }},
  {name: 'propagate (grouped mode), stop during the safe-fanout recovery',
    mode: LATENCY_PROPAGATION_MODE.GROUPED,
    options: {deliveryRetryMaxAttempts: 1}, async drive(lane) {
      propagate(lane);
      await untilRouterCalls(lane, 1);
      answerLastCall(lane);
      await untilRouterCalls(lane, 2);
      lane.stop();
      answerLastCall(lane);
    }},
  {name: 'immediate batch, stop inside the batch window',
    options: {immediateBatchDelayMs: 3600000}, async drive(lane) {
      deliver(lane, BATCHED_TABLE);
      await turns(3);
      lane.stop();
    }},
  {name: 'immediate batch, stop while the flush is in flight', mockTimers: true,
    options: {immediateBatchDelayMs: 50}, async drive(lane) {
      deliver(lane, BATCHED_TABLE);
      await turns(3);
      await fireOwnerTimer(lane, 50);
      await untilRouterCalls(lane, 1);
      lane.stop();
      answerLastCall(lane);
    }},
  {name: 'retry loop, stop while an attempt is in flight', async drive(lane) {
    deliver(lane, UNBATCHED_TABLE);
    await untilRouterCalls(lane, 1);
    lane.stop();
    answerLastCall(lane);
  }},
  {name: 'retry loop, stop during the retry delay', async drive(lane) {
    deliver(lane, UNBATCHED_TABLE);
    await untilRouterCalls(lane, 1);
    answerLastCall(lane);
    await turns(TURNS);
    lane.stop();
  }},
  {name: 'background retry wave armed at stop', answeredBeforeStop: true,
    options: {deliveryRetryMaxAttempts: 1}, async drive(lane) {
      deliver(lane, UNBATCHED_TABLE);
      await untilRouterCalls(lane, 1);
      answerLastCall(lane);
      await turns(TURNS);
      lane.stop();
    }},
  {name: 'background retry wave in flight at stop', answeredBeforeStop: true,
    mockTimers: true, options: {deliveryRetryMaxAttempts: 1},
    async drive(lane) {
      deliver(lane, UNBATCHED_TABLE);
      await untilRouterCalls(lane, 1);
      answerLastCall(lane);
      await turns(TURNS);
      await fireOwnerTimer(lane, lane.service.deliveryRetryMaxDelayMs);
      await untilRouterCalls(lane, 2);
      lane.stop();
      answerLastCall(lane);
    }},
  {name: 'two targets, stop while the first is in flight', async drive(lane) {
    deliver(lane, UNBATCHED_TABLE, TARGETS);
    await untilRouterCalls(lane, 1);
    lane.stop();
    answerLastCall(lane);
  }},
  {name: 'delivery called after stop', async drive(lane) {
    lane.stop();
    deliver(lane, BATCHED_TABLE);
  }},
];

function assertStoppedAnswer(lane) {
  assert.notEqual(lane.box?.answer ?? null, null,
    'the awaiting caller settles once the service stops');
  const failures = Array.isArray(lane.box.answer) ?
    lane.box.answer :
    lane.box.answer.deliveryFailures;
  assert.ok(failures.length > 0 && failures.every((failure) =>
    failure.error === STOPPED_ERROR),
  'every target is answered with the typed stopped outcome, never a ' +
  'success or a pending retry');
}

for (const spec of LANES) {
  test(`${spec.name}: the service starts nothing after stop`, async () => {
    if (spec.mockTimers) {
      mock.timers.enable({apis: ['setTimeout']});
    }
    const lane = compose(spec.mode ?? LATENCY_PROPAGATION_MODE.SAFE,
      spec.options);
    try {
      await spec.drive(lane);
      await turns(TURNS);
      const handlesAfterSettle = countActiveHandles();
      observation.open = false;

      assert.deepEqual([...observation.creations], [],
        'no timer or immediate is created after stop, from any stack, ' +
        'referenced or unref\'d (the test\'s own turns excluded)');
      assert.ok(handlesAfterSettle <= lane.handlesBeforeStop,
        'no live timer or immediate is left behind after stop ' +
        `(${lane.handlesBeforeStop} before stop, ${handlesAfterSettle} ` +
        `after): created after stop: ${observation.creations.join(', ')}`);
      assert.deepEqual(lane.routerCalls.filter((call) => call.afterStop), [],
        'no router delivery is started after stop');
      assert.deepEqual(lane.applies.filter((apply) => apply.afterStop), [],
        'no proposal is made on the source message group after stop');
      if (!spec.answeredBeforeStop) {
        assertStoppedAnswer(lane);
      }
    } finally {
      observation.open = false;
      lane.service.stop();
      mock.timers.reset();
      for (const call of lane.routerCalls) {
        call.answer(REFUSED);
      }
      teardownConfig();
    }
  });
}
