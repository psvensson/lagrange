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
// The property is observed, not the implementation: an async_hooks init hook
// records every Timeout and Immediate created while a frame of the owner's
// files is on the creating stack, whatever primitive or module created it.
// Every public lane (propagate in safe and grouped mode, grouped delivery with
// its safe-fanout recovery, the immediate batch, the retry loop with its
// sleep, the background retry wave, several targets) is driven to one of its
// awaits, and stop() lands there.
//
// Order is controlled by held promises: the router's answer and the source
// group's apply. A timer the owner must fire before stop (a batch flush, a
// background wave) is fired with node:test mock timers, which are restored
// before stop, so every creation after stop is real and observed. No wall
// clock is waited on.

import assert from 'node:assert/strict';
import {createHook} from 'node:async_hooks';
import {mock, test} from 'node:test';

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
const OWNER_FRAME = /[\\/]src[\\/]topology[\\/]cdc-group-propagation[\w-]*\.js:\d+/u;
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

// The observation: Timeout and Immediate creations from the owner's frames
// while the window is open (from stop() on).
const observation = {open: false, creations: []};
createHook({
  init(asyncId, type) {
    if (!observation.open || (type !== 'Timeout' && type !== 'Immediate')) {
      return;
    }
    const stackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 64;
    const {stack} = new Error();
    Error.stackTraceLimit = stackTraceLimit;
    const ownerFrame = stack.match(OWNER_FRAME);
    if (ownerFrame) {
      observation.creations.push(`${type} at ${ownerFrame[0]}`);
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
      const creations = [...observation.creations];
      observation.open = false;

      assert.deepEqual(creations, [],
        'no timer or immediate is created from the owner after stop');
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
