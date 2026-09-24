// The CDC group propagation service's terminal boundary, witnessed as the
// owner's properties:
//
// - P-Q (quiescence). Once a CDC lifecycle owner has reached its terminal
//   state, no CDC-owned retry or publication work may remain pending, be
//   newly scheduled, or execute.
// - P-L (process liveness), kept distinct from P-Q. Terminal shutdown leaves
//   no referenced CDC-owned handle capable of keeping the process alive.
//
// The terminal boundary is stop()'s first statement, `state = STOPPED`. stop()
// is synchronous and the service has no STOPPING state (CREATED,
// INITIALIZED, RUNNING, STOPPED), so stop requested and terminal coincide.
// The owner's one delayed-work primitive is armPropagationTimer, and the sleep
// built on it, both in cdc-group-propagation-lifecycle-methods.js.
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
// The proof has four owner-scoped legs. None of them counts global Node
// handles.
// - Census (structural). The only site in the owner's files that can create
//   delayed work is the primitive: no other setTimeout, setInterval or
//   setImmediate reference, no node:timers or timers/promises import, and no
//   timer refresh.
// - Semantic. After stop the primitive refuses (it answers null and arms
//   nothing), the held sleep resolves at once, and a caller arriving after
//   stop gets the typed stopped answer at once.
// - State. After stop the owner's bookkeeping is empty (batch timers and
//   entries, background timers and waves, held sleeps), and every waiter has
//   settled with the typed stopped answer. The owner work ledger
//   (test/helpers/owner-work-ledger.js) holds no pending owner timer or
//   immediate: P-Q's "remain pending". It holds none that is referenced: P-L.
//   The ledger attributes a timer to the owner by its creating stack, or by
//   the owner resource that triggered it, so the owner's own continuations
//   count.
// - Execution. No owner callback runs after stop: the ledger records none,
//   and nothing is created after stop from any stack (P-Q's "newly
//   scheduled"). Then time is moved past every delay by running every
//   pending owner callback, and no router delivery and no source proposal
//   follow.
// The end-to-end corroboration is test/bootstrap/
// seed-teardown-pending-cdc-delivery.test.js.
//
// Each lane is fully in memory: the router and the source message group are
// held fakes, driven by held promises. A timer the service must fire before
// stop (a batch flush, a background wave) is fired with node:test mock
// timers. The mock is restored before stop, so the ledger sees every real
// timer. No wall clock is waited on.
//
// Residual limit: owner work still waiting, at assert time, on a promise the
// lane holds is not observed. None is pending on the fix.

import assert from 'node:assert/strict';
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
  censusDelayedWorkSites,
  createOwnerWorkLedger,
} from '../helpers/owner-work-ledger.js';
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
const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OWNER_FILES = Object.freeze([
  'src/topology/cdc-group-propagation-service.js',
  'src/topology/cdc-group-propagation-delivery-methods.js',
  'src/topology/cdc-group-propagation-lifecycle-methods.js',
  'src/topology/cdc-group-propagation-routing.js',
]);
const OWNER_FILE = /[\\/]src[\\/]topology[\\/]cdc-group-propagation[\w-]*\.js$/u;
const TEST_FILE = fileURLToPath(import.meta.url);

async function turns(count) {
  for (let turn = count; turn > 0; turn -= 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function compose(mode, options = {}) {
  setupConfig(mode);
  const lane = {stopped: false, routerCalls: [], applies: [], heldApply: null};
  // Open before the service exists, so every timer it arms is attributed.
  lane.ledger = createOwnerWorkLedger({ownerFile: OWNER_FILE, testFile: TEST_FILE});
  lane.ledger.open();
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
  // The terminal boundary is stop()'s first statement: whatever stop() itself
  // arms is after it.
  lane.stop = () => {
    lane.stopped = true;
    lane.ledger.markTerminal();
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

// State leg, bookkeeping half: nothing the owner holds for later.
function assertOwnerBookkeepingEmpty(service) {
  assert.deepEqual({
    immediateBatchTimers: service.immediateBatchTimers.size,
    immediateBatchEntries: service.immediateBatchEntriesByKey.size,
    backgroundRetryTimers: service.backgroundRetryTimers.size,
    backgroundRetryWaves: service.backgroundRetryEntriesByKey.size,
    heldSleeps: service.retrySleepReleases.size,
  }, {
    immediateBatchTimers: 0, immediateBatchEntries: 0,
    backgroundRetryTimers: 0, backgroundRetryWaves: 0, heldSleeps: 0,
  }, 'the owner holds no batch, wave, timer or sleep after stop');
}

// The four legs for one lane, once the lane has settled.
async function assertQuiescentAfterStop(lane) {
  const {ledger} = lane;
  const report = ledger.report();
  // Execution leg, first half: nothing ran or was created after stop.
  assert.deepEqual(report.executedAfterTerminal, [],
    'no owner timer or immediate callback runs after stop');
  assert.deepEqual(report.createdAfterTerminal, [],
    'no timer or immediate is created after stop, from any stack, ' +
    'referenced or unref\'d (P-Q: newly scheduled)');
  // State leg.
  assert.deepEqual(report.pending, [],
    'no owner timer or immediate is still pending after stop (P-Q)');
  assert.deepEqual(report.referenced, [],
    'no referenced owner handle is left to keep the process alive (P-L)');
  assertOwnerBookkeepingEmpty(lane.service);
  // Execution leg, second half: move time past every delay by running any
  // owner callback still pending, then require that none did owner work.
  ledger.runPending();
  await turns(TURNS);
  assert.deepEqual(lane.routerCalls.filter((call) => call.afterStop), [],
    'no router delivery is started after stop, however far time moves');
  assert.deepEqual(lane.applies.filter((apply) => apply.afterStop), [],
    'no proposal is made on the source message group after stop, however ' +
    'far time moves');
}

for (const spec of LANES) {
  test(`${spec.name}: the owner is quiescent after stop`, async () => {
    if (spec.mockTimers) {
      mock.timers.enable({apis: ['setTimeout']});
    }
    const lane = compose(spec.mode ?? LATENCY_PROPAGATION_MODE.SAFE,
      spec.options);
    try {
      await spec.drive(lane);
      await turns(TURNS);
      await assertQuiescentAfterStop(lane);
      if (!spec.answeredBeforeStop) {
        assertStoppedAnswer(lane);
      }
    } finally {
      lane.ledger.close();
      lane.service.stop();
      mock.timers.reset();
      for (const call of lane.routerCalls) {
        call.answer(REFUSED);
      }
      teardownConfig();
    }
  });
}

// Semantic leg: after stop the primitive refuses and arms nothing, and the
// sleep built on it resolves at once.
test('semantic: after stop the delayed-work primitive refuses, arms ' +
  'nothing, and its sleep resolves at once', async () => {
  const lane = compose(LATENCY_PROPAGATION_MODE.SAFE);
  try {
    lane.stop();
    let ran = false;
    assert.equal(lane.service.armPropagationTimer(() => {
      ran = true;
    }, 1), null, 'the primitive answers refused (null) once stopped');
    let slept = false;
    lane.service.sleep(3600000).then(() => {
      slept = true;
    });
    await turns(TURNS);
    assert.equal(slept, true, 'the sleep resolves at once, holding nothing');
    assert.equal(ran, false, 'the refused callback never runs');
    await assertQuiescentAfterStop(lane);
  } finally {
    lane.ledger.close();
    teardownConfig();
  }
});

// Census leg: the only delayed-work site in the owner is its primitive.
test('census: the owner creates delayed work only through its primitive', () => {
  const census = censusDelayedWorkSites(REPOSITORY_ROOT, OWNER_FILES);
  assert.deepEqual(census.timerSites, [
    'src/topology/cdc-group-propagation-lifecycle-methods.js:' +
      'armPropagationTimer:setTimeout',
  ], 'no setTimeout, setInterval or setImmediate reference outside ' +
    'armPropagationTimer');
  assert.deepEqual(census.forbiddenImports, [],
    'no node:timers or timers/promises import in the owner');
  assert.deepEqual(census.refreshCalls, [],
    'no timer is re-armed with refresh()');
});
