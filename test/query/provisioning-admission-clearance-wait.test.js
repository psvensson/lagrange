/**
 * A transient admission deferral is re-entered on the event that clears it,
 * never in a loop.
 *
 * Failure this pins (review of the founding settle path): the admission
 * owner answers readiness_planning_identity_unavailable and
 * replica_operation_route_unavailable before its first real await. The
 * settle loop re-entered such a denial at once, so it spun on microtasks
 * (about half a million re-entries in 400 ms) and starved the timers, I/O
 * and cache applies that alone can clear either condition, for the whole
 * statement budget. The creation boundary had the same loop with no budget
 * at all when the precheck kept admitting and the ledger write kept finding
 * no route before submission.
 *
 * Every case here drives the REAL admission owner methods (observe,
 * route-source capture, the re-entry error) and the real clearance wait; only
 * the readiness owner, the cache and the query executor are small fakes with
 * the production port shapes.
 */
import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/tables.js';
import {
  OPERATION_CREATION_ADMISSION_ERROR_CODE,
  OPERATION_CREATION_ADMISSION_REASON,
  applyRebalanceCoordinatorOperationCreationAdmissionMethods,
} from '../../src/rebalancer/rebalance-coordinator-operation-creation-admission.js';
import {
  PROVISIONING_TARGET_ADMISSION_STATE,
  settleProvisioningTargetAdmission,
} from '../../src/query/provisioning-target-admission-settle.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {createTimeoutBudget} from '../../src/control-plane/timeout-budget.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';

const TARGET_NODE_ID = 'node-c';
const PARTITION_ID = 'users-p1';
const CURRENT_IDENTITY = Object.freeze({
  globalPlanningGeneration: 4,
  nodePlanningGeneration: 7,
  saturated: false,
});
// Far below what a microtask spin makes in the same budget (~10^5).
const MAX_REENTRIES = 3;

// A cache with the production change channels: a deferred (next-turn)
// change notification and per-table mutation versions.
function createCache() {
  const listeners = new Set();
  const versions = new Map();
  return {
    listeners,
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
    getTableMutationVersion(tableName) {
      return versions.get(tableName) || 0;
    },
    apply(tableName) {
      versions.set(tableName, (versions.get(tableName) || 0) + 1);
      setImmediate(() => {
        for (const listener of [...listeners]) listener(tableName);
      });
    },
  };
}

function createReadinessOwner(world) {
  const subscribers = new Set();
  return {
    subscribers,
    readCurrentPlanningProjectionIdentity() {
      world.identityReads += 1;
      return world.identityCurrent ? CURRENT_IDENTITY : null;
    },
    subscribeReadinessPlanningSnapshots(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    publish(ownerKey) {
      for (const listener of [...subscribers]) listener({ownerKey});
    },
  };
}

function createWorld(options = {}) {
  const world = {
    identityCurrent: options.identityCurrent ?? true,
    routeUp: options.routeUp ?? true,
    identityReads: 0,
    admissionCalls: 0,
  };
  world.cache = createCache();
  world.readiness = createReadinessOwner(world);
  class Coordinator {
    async checkProvisioningAdmission(move) {
      world.admissionCalls += 1;
      const operationCreationAdmission =
        await this.observeOperationCreationAdmission(move);
      return Object.freeze({...operationCreationAdmission,
        operationCreationAdmission});
    }
  }
  applyRebalanceCoordinatorOperationCreationAdmissionMethods(Coordinator);
  world.coordinator = new Coordinator();
  // The gates themselves are not under test: they admit.
  world.coordinator.runOperationCreationAdmissionGates = async () =>
    ({ledgerDeferral: null, resolvedEntitySizeBytes: 0});
  world.coordinator.systemTableCache = world.cache;
  world.coordinator.controlPlaneReadinessService = world.readiness;
  world.coordinator.sqlQueryEngine = {queryExecutor: {
    resolvePartitionServiceCandidates: () => ({
      candidates: world.routeUp ? [{nodeId: 'node-a'}] : [],
      routingSnapshot: null,
    }),
  }};
  world.engine = {
    rebalanceCoordinator: world.coordinator,
    nowFn: Date.now,
    logger: null,
  };
  return world;
}

const REQUEST = Object.freeze({
  partitionId: PARTITION_ID,
  targetNodeId: TARGET_NODE_ID,
  childIntent: {operationIntentId: 'op-c', replicaIntentId: 'rep-c'},
});

// Records whether timers and immediates ran while the settle was pending.
function watchEventLoop() {
  const t0 = Date.now();
  const seen = {immediateAtMs: null, timerAtMs: null};
  setImmediate(() => {
    seen.immediateAtMs = Date.now() - t0;
  });
  setTimeout(() => {
    seen.timerAtMs = Date.now() - t0;
  }, 5);
  return seen;
}

test('identity_unavailable waits for the planning identity, yields the ' +
  'event loop, and settles UNSETTLED when the budget is spent',
async (t) => {
  const world = createWorld({identityCurrent: false});
  const seen = watchEventLoop();
  const settled = await settleProvisioningTargetAdmission(world.engine,
    REQUEST, {timeoutBudget: createTimeoutBudget({configuredBudgetMs: 150})});
  t.equal(settled.state, PROVISIONING_TARGET_ADMISSION_STATE.UNSETTLED,
    'the spent budget settles UNSETTLED');
  t.same(settled.decision.reasonCodes,
    [OPERATION_CREATION_ADMISSION_REASON.IDENTITY_UNAVAILABLE],
    'with its typed reason');
  t.ok(seen.immediateAtMs !== null && seen.timerAtMs !== null,
    'immediates and timers ran during the wait');
  t.ok(world.admissionCalls <= MAX_REENTRIES,
    `admission was asked ${world.admissionCalls} times, not in a loop`);
  t.equal(world.readiness.subscribers.size, 0,
    'the planning subscription is released');
  t.equal(world.cache.listeners.size, 0, 'the cache listener is released');
});

test('identity_unavailable re-enters on the publication for its node key ' +
  'and is admitted', async (t) => {
  const world = createWorld({identityCurrent: false});
  setTimeout(() => world.readiness.publish('node-other'), 10);
  setTimeout(() => {
    world.identityCurrent = true;
    world.readiness.publish(TARGET_NODE_ID);
  }, 30);
  const settled = await settleProvisioningTargetAdmission(world.engine,
    REQUEST, {timeoutBudget: createTimeoutBudget({configuredBudgetMs: 2000})});
  t.equal(settled.state, PROVISIONING_TARGET_ADMISSION_STATE.ADMITTED,
    'admitted once the identity is current');
  t.equal(settled.reentries, 1, 'exactly one re-entry, on the wake');
  t.equal(world.admissionCalls, 2, 'admission asked twice in all');
});

test('route_unavailable re-enters on a route-source table change only',
  async (t) => {
    const world = createWorld({routeUp: false});
    const seen = watchEventLoop();
    setTimeout(() => world.cache.apply(TABLES.LOGS), 10);
    setTimeout(() => {
      world.routeUp = true;
      world.cache.apply(TABLES.SERVICES);
    }, 40);
    const settled = await settleProvisioningTargetAdmission(world.engine,
      REQUEST,
      {timeoutBudget: createTimeoutBudget({configuredBudgetMs: 2000})});
    t.equal(settled.state, PROVISIONING_TARGET_ADMISSION_STATE.ADMITTED,
      'admitted after the services change');
    t.equal(settled.reentries, 1, 'the unrelated logs change woke nothing');
    t.ok(seen.timerAtMs !== null, 'timers ran during the wait');
  });

test('a clearance that lands before the subscription is not lost',
  async (t) => {
    const world = createWorld({identityCurrent: false});
    // The identity becomes current right after the denial is decided and
    // before the wait subscribes; no event is ever published after.
    const capture = world.coordinator.captureOperationCreationPlanningIdentity;
    world.coordinator.captureOperationCreationPlanningIdentity =
      function(nodeId) {
        const identity = capture.call(this, nodeId);
        world.identityCurrent = true;
        return identity;
      };
    const settled = await settleProvisioningTargetAdmission(world.engine,
      REQUEST,
      {timeoutBudget: createTimeoutBudget({configuredBudgetMs: 2000})});
    t.equal(settled.state, PROVISIONING_TARGET_ADMISSION_STATE.ADMITTED,
      'the re-check after subscribing sees the clearance');
    t.equal(settled.reentries, 1, 'one re-entry');
  });

test('cancellation ends the wait', async (t) => {
  const world = createWorld({identityCurrent: false});
  const cancellationToken = new CancellationToken();
  setTimeout(() => cancellationToken.cancel('statement cancelled'), 20);
  const startedAt = Date.now();
  await t.rejects(settleProvisioningTargetAdmission(world.engine, REQUEST, {
    timeoutBudget: createTimeoutBudget({configuredBudgetMs: 5000}),
    cancellationToken,
  }), /statement cancelled/, 'the cancellation propagates');
  t.ok(Date.now() - startedAt < 1000, 'well before the budget');
  t.equal(world.cache.listeners.size, 0, 'listeners released');
});

function routeReentryError(world) {
  const error = new Error('Operation creation admission changed');
  error.code = OPERATION_CREATION_ADMISSION_ERROR_CODE;
  error.reasonCodes = [OPERATION_CREATION_ADMISSION_REASON.ROUTE_UNAVAILABLE];
  error.admissionResult = {allowed: false, decisionType: 'deferred'};
  error.moveIdentity = {nodeId: TARGET_NODE_ID};
  error.routeObservation = {
    origin: 'pre_submission_delivery',
    sourceVersions: {
      [TABLES.NODES]: world.cache.getTableMutationVersion(TABLES.NODES),
      [TABLES.PARTITIONS]:
        world.cache.getTableMutationVersion(TABLES.PARTITIONS),
      [TABLES.SERVICES]: world.cache.getTableMutationVersion(TABLES.SERVICES),
    },
  };
  return error;
}

function createBoundaryEngine(world, createOperation) {
  const engine = Object.create(SQLQueryEngine.prototype);
  engine.rebalanceCoordinator = world.coordinator;
  world.coordinator.createOperation = createOperation;
  engine.logger = {debug() {}, warn() {}, error() {}};
  engine.nowFn = Date.now;
  return engine;
}

const BOUNDARY_OPTIONS = Object.freeze({
  partitionId: PARTITION_ID,
  targetNodeId: TARGET_NODE_ID,
  childIntent: {operationIntentId: 'op-c', replicaIntentId: 'rep-c'},
  supportsAdmissionPrecheck: true,
  operationCreationAdmission: null,
});

test('the creation boundary waits for a route change after a ' +
  'pre-submission route loss and settles UNSETTLED at the budget',
async (t) => {
  const world = createWorld();
  let creates = 0;
  const engine = createBoundaryEngine(world, async () => {
    creates += 1;
    throw routeReentryError(world);
  });
  const seen = watchEventLoop();
  await t.rejects(engine.createProvisioningOperationWithAdmissionReentry({
    ...BOUNDARY_OPTIONS,
    timeoutBudget: createTimeoutBudget({configuredBudgetMs: 150}),
  }), {code: QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE,
    retryable: true}, 'fails retryably as unsettled');
  t.equal(creates, 1, 'no create retried without a route change');
  t.ok(seen.immediateAtMs !== null && seen.timerAtMs !== null,
    'the event loop ran during the wait');
});

test('the creation boundary retries once the route sources change',
  async (t) => {
    const world = createWorld();
    let creates = 0;
    const engine = createBoundaryEngine(world, async (move) => {
      creates += 1;
      if (creates === 1) throw routeReentryError(world);
      return {operationId: move.operationIntentId};
    });
    setTimeout(() => world.cache.apply(TABLES.NODES), 20);
    const operation =
      await engine.createProvisioningOperationWithAdmissionReentry({
        ...BOUNDARY_OPTIONS,
        timeoutBudget: createTimeoutBudget({configuredBudgetMs: 2000}),
      });
    t.equal(operation.operationId, 'op-c', 'created after the change');
    t.equal(creates, 2, 'one retry');
  });
