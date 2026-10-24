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
// - A delivery waiting at stop never settled (the seed teardown hang).
// - A retry delay was armed after stop (round 3).
// - Deliveries continued to the remaining targets after stop (round 4, C).
// - A propagate call after stop still proposed on the source message group
//   (round 5, N1).
// The service has one propagation path, the durable wave: its only held work
// is the retry delay (sleep) and the in-flight wave (activeDurablePropagation).
// Deleted with the volatile branch: the batch-window and background-retry
// lanes (their maps and timers no longer exist).
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
// - State. After stop the owner's bookkeeping is empty (no held sleep, no
//   wave in flight), and every caller has settled without a success: the
//   source owner keeps the debt. The owner work ledger
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
// Each lane is fully in memory: the router and the source message group's
// batch apply are held fakes, driven by held promises, and the source
// invocation runs on a virtual clock. No wall clock is waited on.
//
// Residual limit: owner work still waiting, at assert time, on a promise the
// lane holds is not observed. None is pending on the fix.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {COLUMN} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {buildCommittedCdcOutcome, unknownCdcAcceptance} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {LATENCY_PROPAGATION_MODE} from
  '../../src/topology/latency-topology-constants.js';
import {CDC_GROUP_PROPAGATION_DELIVERY_ERROR} from
  '../../src/topology/cdc-group-propagation-constants.js';
import {CDCGroupPropagationService} from
  '../../src/topology/cdc-group-propagation-service.js';
import {LatencyTopologySetup} from
  '../../src/bootstrap/shared/latency-topology-setup.js';
import {
  censusDelayedWorkSites,
  createOwnerWorkLedger,
} from '../helpers/owner-work-ledger.js';
import {
  createDurablePropagationRequest,
  createDurableSourceMessageGroupService,
  createGroupRow,
  createMessageGroupServiceRow,
  createTopologyCache,
  setupConfig,
  teardownConfig,
} from './cdc-group-propagation-service-harness.js';

const TURNS = 60;
const QUIET_LOGGER = Object.freeze({info() {}, warn() {}, debug() {}, error() {},
  logConsoleOnly() {}});
const REFUSED = Object.freeze(unknownCdcAcceptance());
const TARGETS = Object.freeze(['b', 'c'].map((node) => Object.freeze({
  groupId: `mg-node-${node}`,
  coordinatorNodeId: `node-${node}`,
  address: `node-${node}/message-group/mg-node-${node}`,
})));
const GROUP_IDS = Object.freeze(['mg-node-a', ...TARGETS.map((target) => target.groupId)]);
const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OWNER_FILES = Object.freeze([
  'src/topology/cdc-group-propagation-service.js',
  'src/topology/cdc-group-propagation-delivery-methods.js',
  'src/topology/cdc-group-propagation-durable-delivery.js',
  'src/topology/cdc-group-propagation-durable-plan.js',
  'src/topology/cdc-group-propagation-foreground-retry.js',
  'src/topology/cdc-group-propagation-lifecycle-methods.js',
  'src/topology/cdc-group-propagation-retry-wait-report.js',
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
      // One id per group: the latency group is its message group.
      nodes: [{[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: 'mg-node-a'}],
      groups: GROUP_IDS.map((groupId, index) =>
        createGroupRow(groupId, `node-${'abc'[index]}`)),
      services: [
        {groupId: 'mg-node-a', coordinatorNodeId: 'node-a',
          address: 'node-a/message-group/mg-node-a'},
        ...(options.targets ?? [TARGETS[0]]),
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
    latencyTreeService: {getRoutingOrder: () => GROUP_IDS},
    nowFn: () => 1000,
    ...options.service,
  });
  service.logger = QUIET_LOGGER;
  service.initialize();
  service.start();
  lane.service = service;
  lane.source = createDurableSourceMessageGroupService('mg-node-a', {
    applyCDCBatch: (events) => {
      lane.applies.push({afterStop: lane.stopped});
      // A held apply is released after stop with the source's committed
      // receipt: the wave must still reach no target.
      return lane.holdApply ? new Promise((release) => {
        lane.heldApply = () => release(buildCommittedCdcOutcome(events, 'mg-node-a',
          {index: 1, term: 1}));
      }) : REFUSED;
    },
  });
  // The terminal boundary is stop()'s first statement: whatever stop() itself
  // arms is after it.
  lane.stop = () => {
    lane.stopped = true;
    lane.ledger.markTerminal();
    service.stop();
  };
  return lane;
}

function propagate(lane) {
  lane.box = {settled: false};
  lane.service.propagateCDCEvent(createDurablePropagationRequest(lane.source)).then(
    (value) => Object.assign(lane.box, {settled: true, value}),
    (error) => Object.assign(lane.box, {settled: true, error}));
}

async function untilRouterCalls(lane, count) {
  for (let turn = 0; turn < TURNS && lane.routerCalls.length < count;
    turn += 1) {
    await turns(1);
  }
  assert.equal(lane.routerCalls.length, count,
    `router delivery ${count} is in flight before stop`);
}

function answerLastCall(lane, answer = REFUSED) {
  lane.routerCalls.at(-1).answer(answer);
}

// The wave sleeps between attempts once its first target answer is refused.
async function untilRetryDelay(lane) {
  await untilRouterCalls(lane, 1);
  answerLastCall(lane);
  for (let turn = 0; turn < TURNS && lane.service.retrySleepReleases.size === 0;
    turn += 1) {
    await turns(1);
  }
  assert.equal(lane.service.retrySleepReleases.size, 1, 'the wave holds its retry delay');
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
  {name: 'propagate (grouped mode), stop during the target delivery',
    mode: LATENCY_PROPAGATION_MODE.GROUPED, async drive(lane) {
      propagate(lane);
      await untilRouterCalls(lane, 1);
      lane.stop();
      answerLastCall(lane);
    }},
  {name: 'propagate (safe mode, one attempt), stop while the attempt is in flight',
    options: {service: {deliveryRetryMaxAttempts: 1}}, async drive(lane) {
      propagate(lane);
      await untilRouterCalls(lane, 1);
      lane.stop();
      answerLastCall(lane);
    }},
  {name: 'propagate (safe mode), stop during the retry delay', async drive(lane) {
    propagate(lane);
    await untilRetryDelay(lane);
    lane.stop();
  }},
  // The seed cleanup's own teardown step (seed-cleanup-handler.js), which
  // runs before the replica handler shuts down.
  {name: 'the latency topology teardown during the retry delay', async drive(lane) {
    propagate(lane);
    await untilRetryDelay(lane);
    lane.stopped = true;
    lane.ledger.markTerminal();
    await LatencyTopologySetup.stop({cdcGroupPropagationService: lane.service});
  }},
  {name: 'two targets, stop while the first is in flight',
    options: {targets: TARGETS}, async drive(lane) {
      propagate(lane);
      await untilRouterCalls(lane, 1);
      lane.stop();
      answerLastCall(lane);
    }},
];

// Every caller settles once the service stops, and never with a success:
// the answer (or the retired invocation's refusal) defers to the source owner.
function assertStoppedAnswer(lane) {
  assert.equal(lane.box?.settled, true, 'the awaiting caller settles once the service stops');
  const answer = lane.box.value ?? lane.box.error;
  assert.notEqual(answer?.success, true, 'never a success after stop');
  assert.equal(answer?.deferRetry, true, 'the source owner keeps the debt');
  if (lane.box.value && lane.applies.length === 0) {
    assert.equal(lane.box.value.reason,
      CDC_GROUP_PROPAGATION_DELIVERY_ERROR.PROPAGATION_STOPPED,
      'a call after stop gets the typed stopped answer at once');
  }
}

// State leg, bookkeeping half: nothing the owner holds for later.
function assertOwnerBookkeepingEmpty(service) {
  assert.deepEqual({
    heldSleeps: service.retrySleepReleases.size,
    waveInFlight: service.activeDurablePropagation !== null,
  }, {heldSleeps: 0, waveInFlight: false},
  'the owner holds no wave and no sleep after stop');
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
    const lane = compose(spec.mode ?? LATENCY_PROPAGATION_MODE.SAFE,
      spec.options);
    try {
      await spec.drive(lane);
      await turns(TURNS);
      await assertQuiescentAfterStop(lane);
      assertStoppedAnswer(lane);
    } finally {
      lane.ledger.close();
      lane.service.stop();
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
