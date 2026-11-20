/**
 * Deterministic proof for the blocked-spread-evaluation-event-wake quest.
 *
 * Receipt `blocked-spread-wakes-on-release`: a background entity parked on
 * the blocked branch of resolvePrioritySpreadPlanningGateDecision (flat
 * [stableWindow, stableWindow+jitter) timer) is woken through the owner
 * reconcile-queue ingress the moment the shared release tracker declares
 * its stable release, instead of sleeping out the timer. The priority
 * partition — whose evaluations are already event-driven — advances the
 * shared fence and resolves the release.
 *
 * Receipt `stability-window-and-fallback-preserved`: the wake never
 * shortens the recorded oscillation cure — release still requires the full
 * continuous-clear stability window, a fresh blocked observation re-arms a
 * full window with no residual credit, and the fallback timers (the flat
 * blocked-branch delay and the stabilizing-branch exact-deadline delay)
 * are still scheduled regardless of wake registration.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  REBALANCE_PLANNING_GATE,
} from '../../src/rebalancer/rebalancer-planning-gate-constants.js';
import {
  RECONCILE_REASON,
} from '../../src/workflow/reconcile-queue-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const TEST_NODE_ID = 'node-1';
const TEST_LOG_LEVEL = 'error';
const PARKED_BACKGROUND_ENTITY_ID = 'nodes-p1';
const PRIORITY_RESOLVER_ENTITY_ID = 'replica_operations-p1';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_NODE_ID},
      logging: {level: TEST_LOG_LEVEL},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: TEST_LOG_LEVEL});
  }
}

function createEmptySystemTableCache() {
  return {
    get: () => undefined,
    filter: () => [],
    getAll: () => [],
  };
}

function createFenceTestRebalancer({entityId, readinessOwner, nowFn}) {
  return new UnifiedRebalancer({
    entityId,
    entityType: EntityType.PARTITION,
    nodeId: TEST_NODE_ID,
    systemTableCache: createEmptySystemTableCache(),
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      getConnectedNodes: () => [],
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: readinessOwner,
    nowFn,
  });
}

// Witness (m') (owner decision 2026-10-04): a non-priority system rebalancer
// deferred on local mutation readiness (published convergence pending) used
// to back off up to 2x the periodic interval with no wake on readiness
// change, so a deferral outlived spread completion by a timer. The wake now
// rides the system-table cache seam: the first publication/operation change
// that leaves no local mutation-readiness blocker resets the interval and
// enqueues one check through the owner reconcile queue.
function createListenableSystemTableCache() {
  const listeners = new Set();
  return {
    get: () => undefined,
    filter: () => [],
    getAll: () => [],
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
    emit(tableName) {
      for (const listener of [...listeners]) {
        listener(tableName, 'update', {});
      }
    },
    listenerCount: () => listeners.size,
  };
}

test('(m\') a local-mutation-readiness deferral is ended by the readiness ' +
  'change event, not the backed-off timer', async (t) => {
  initializeTestEnvironment();
  const cache = createListenableSystemTableCache();
  const rebalancer = createFenceTestRebalancer({
    entityId: PARKED_BACKGROUND_ENTITY_ID,
    readinessOwner: {},
    nowFn: () => 1_000,
  });
  rebalancer.systemTableCache = cache;
  rebalancer.isLeader = true;
  let blocker = {
    failedDimensions: ['published_convergence_pending'],
    reasonCodes: [],
  };
  rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => blocker;
  const wakeReasons = [];
  rebalancer.enqueueRebalanceCheck = (reason) => {
    wakeReasons.push(reason);
    return true;
  };
  try {
    const decision = rebalancer.resolveLocalMutationPlanningGateDecision();
    t.equal(decision?.gate, REBALANCE_PLANNING_GATE.LOCAL_MUTATION_READINESS,
      'the system partition defers on local mutation readiness');
    t.ok(rebalancer.currentInterval > rebalancer.periodicCheckIntervalMs,
      'the deferral backs the interval off');
    t.equal(cache.listenerCount(), 1, 'the readiness wake is armed');

    cache.emit('control_plane_publications');
    await Promise.resolve();
    t.same(wakeReasons, [], 'still blocked: no wake');

    cache.emit('nodes');
    blocker = null;
    await Promise.resolve();
    t.same(wakeReasons, [],
      'a table that cannot end the deferral never evaluates readiness');

    cache.emit('control_plane_publications');
    cache.emit('replica_operations');
    await Promise.resolve();
    t.same(wakeReasons, [RECONCILE_REASON.LOCAL_MUTATION_READINESS_WAKE],
      'the readiness change enqueues exactly one check');
    t.equal(rebalancer.currentInterval, rebalancer.periodicCheckIntervalMs,
      'the backed-off interval is reset');
    t.equal(cache.listenerCount(), 0, 'the wake disarms once fired');
  } finally {
    rebalancer.shutdown();
  }
});

test('(l2) local mutation readiness wake also fires on readiness planning snapshot refresh completion', async (t) => {
  initializeTestEnvironment();
  const planningListeners = new Set();
  const readinessOwner = {
    subscribeReadinessPlanningSnapshots(listener) {
      planningListeners.add(listener);
      return () => planningListeners.delete(listener);
    },
  };
  const rebalancer = createFenceTestRebalancer({
    entityId: PARKED_BACKGROUND_ENTITY_ID,
    readinessOwner,
    nowFn: () => 1_000,
  });
  rebalancer.isLeader = true;
  let blocker = {
    failedDimensions: ['controlPlaneWritable', 'metadataPublicationHealthy'],
    reasonCodes: ['planning_snapshot_refresh_pending'],
  };
  rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => blocker;
  const wakeReasons = [];
  rebalancer.enqueueRebalanceCheck = (reason) => {
    wakeReasons.push(reason);
    return true;
  };
  try {
    const decision = rebalancer.resolveLocalMutationPlanningGateDecision();
    t.equal(decision?.gate, REBALANCE_PLANNING_GATE.LOCAL_MUTATION_READINESS);
    t.equal(planningListeners.size, 1, 'planning snapshot listener is armed');
    blocker = null;
    for (const listener of [...planningListeners]) {
      listener({nodeId: rebalancer.nodeId});
    }
    await Promise.resolve();
    t.same(wakeReasons, [RECONCILE_REASON.LOCAL_MUTATION_READINESS_WAKE]);
    t.equal(planningListeners.size, 0, 'planning snapshot listener disarms once fired');
  } finally {
    rebalancer.shutdown();
  }
});

test('(m) a priority partition\'s terminal ADD enqueues the next check by ' +
  'event', async (t) => {
  initializeTestEnvironment();
  const listeners = new Map();
  const coordinator = {
    on(eventName, listener) {
      listeners.set(eventName, listener);
    },
    off(eventName) {
      listeners.delete(eventName);
    },
    getMoveSafetyError: () => null,
  };
  const rebalancer = createFenceTestRebalancer({
    entityId: PRIORITY_RESOLVER_ENTITY_ID,
    readinessOwner: {},
    nowFn: () => 1_000,
  });
  rebalancer.isLeader = true;
  const wakeReasons = [];
  rebalancer.enqueueRebalanceCheck = (reason) => {
    wakeReasons.push(reason);
    return true;
  };
  try {
    rebalancer.bindCoordinatorProgressListeners(coordinator);
    listeners.get('operationCompleted')({
      operation: {
        operationId: 'op-r5',
        type: 'ADD',
        partitionId: PRIORITY_RESOLVER_ENTITY_ID,
        workflowStep: 'COMPLETED',
      },
    });
    t.same(wakeReasons, [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
      'the terminal event enqueues the check immediately, well inside the ' +
        'priority retry delay');
  } finally {
    rebalancer.unbindCoordinatorProgressListeners();
    rebalancer.shutdown();
  }
});
