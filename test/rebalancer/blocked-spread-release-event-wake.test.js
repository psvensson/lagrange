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
// Live-run shape (ec-q6-20260810T092844Z): nodes-p1 was one of the six
// background entities parked with delayMs 72-80s on the seed.
const PARKED_BACKGROUND_ENTITY_ID = 'nodes-p1';
const STABILIZING_BACKGROUND_ENTITY_ID = 'logs-p1';
const PRIORITY_RESOLVER_ENTITY_ID = 'replica_operations-p1';
const REQUIRED_DISTINCT_NODE_COUNT = 3;
const BLOCKED_READY_REPLICA_COUNT = 3;
const BLOCKED_READY_DISTINCT_NODE_COUNT = 1;
const BLOCKED_SPREAD_GAP = 2;
const MAX_JITTER_DRAW = 0.9;
const NO_JITTER_DRAW = 0;
const BLOCKED_TO_CLEAR_DELAY_MS = 1_000;
const RELEASE_STATE_STABILIZING = 'stabilizing';
const ONE_TIMER_SCHEDULED = 1;
const NO_WAKES = 0;
const ONE_WAKE = 1;
const REARM_DELAY_MS = 10;
const REARM_CLEAR_DELAY_MS = 5;

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

function buildPrioritySpreadBlocker() {
  return {
    requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
    blockedPartitions: [{
      partitionId: PRIORITY_RESOLVER_ENTITY_ID,
      readyReplicaCount: BLOCKED_READY_REPLICA_COUNT,
      readyDistinctNodeCount: BLOCKED_READY_DISTINCT_NODE_COUNT,
      spreadGap: BLOCKED_SPREAD_GAP,
    }],
  };
}

test('blocked-spread-wakes-on-release: a parked background entity is ' +
  'enqueued at stable release instead of waiting out its flat timer',
async (t) => {
  initializeTestEnvironment();

  let nowMs = 100_000;
  const nowFn = () => nowMs;
  const readinessOwner = {};
  const parked = createFenceTestRebalancer({
    entityId: PARKED_BACKGROUND_ENTITY_ID,
    readinessOwner,
    nowFn,
  });
  const priorityResolver = createFenceTestRebalancer({
    entityId: PRIORITY_RESOLVER_ENTITY_ID,
    readinessOwner,
    nowFn,
  });
  let sharedBlocker = buildPrioritySpreadBlocker();
  parked.getControlPlanePrioritySpreadBlocker = () => sharedBlocker;
  priorityResolver.getControlPlanePrioritySpreadBlocker =
    () => sharedBlocker;
  parked.randomSource = {random: () => MAX_JITTER_DRAW};
  const wakeReasons = [];
  parked.enqueueRebalanceCheck = (reason) => {
    wakeReasons.push(reason);
    return true;
  };
  const scheduledFallbackDelays = [];
  parked.scheduleNextCheck = (delayMs) => {
    scheduledFallbackDelays.push(delayMs);
  };

  try {
    const stableWindowMs =
      parked.getBackgroundPrioritySpreadStableWindowMs();
    const handoffJitterMs =
      parked.getBackgroundPrioritySpreadObservationHandoffMs();
    const expectedFallbackDelayMs =
      stableWindowMs + Math.floor(MAX_JITTER_DRAW * handoffJitterMs);

    const blockedDecision =
      parked.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blockedDecision?.gate,
      REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      'the background entity parks on the priority-spread gate',
    );
    t.equal(
      blockedDecision?.scheduleDelayMs,
      expectedFallbackDelayMs,
      'the blocked branch still schedules the flat release delay',
    );
    parked.applyRebalancePlanningGateDecision(blockedDecision);
    t.same(
      scheduledFallbackDelays,
      [expectedFallbackDelayMs],
      'the fallback timer is armed even though the wake is registered',
    );

    t.equal(
      priorityResolver.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'the shared fence never defers the priority partition while blocked',
    );

    sharedBlocker = null;
    nowMs += BLOCKED_TO_CLEAR_DELAY_MS;
    t.equal(
      priorityResolver.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'the priority evaluation observing the clear stays undeferred',
    );
    t.equal(
      wakeReasons.length,
      NO_WAKES,
      'observing the clear must not wake anyone before the window matures',
    );

    nowMs += stableWindowMs - 1;
    t.equal(
      priorityResolver.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'the resolver stays undeferred one tick before maturity',
    );
    t.equal(
      wakeReasons.length,
      NO_WAKES,
      'the full stability window elapses before any wake fires',
    );

    nowMs += 1;
    t.equal(
      priorityResolver.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'the resolver stays undeferred at maturity',
    );
    t.same(
      wakeReasons,
      [RECONCILE_REASON.PRIORITY_SPREAD_RELEASE_WAKE],
      'stable release wakes the parked entity through the typed ' +
        'reconcile ingress',
    );

    const elapsedSinceParkMs = BLOCKED_TO_CLEAR_DELAY_MS + stableWindowMs;
    t.ok(
      elapsedSinceParkMs < expectedFallbackDelayMs,
      'the wake preempts the parked fallback timer',
    );

    t.equal(
      parked.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'the woken entity plans immediately on its re-evaluation',
    );
  } finally {
    parked.shutdown();
    priorityResolver.shutdown();
  }
});

test('stability-window-and-fallback-preserved: release still requires ' +
  'the full stable window and every fallback timer stays scheduled',
async (t) => {
  initializeTestEnvironment();

  let nowMs = 200_000;
  const nowFn = () => nowMs;
  const readinessOwner = {};
  const parked = createFenceTestRebalancer({
    entityId: PARKED_BACKGROUND_ENTITY_ID,
    readinessOwner,
    nowFn,
  });
  const stabilizer = createFenceTestRebalancer({
    entityId: STABILIZING_BACKGROUND_ENTITY_ID,
    readinessOwner,
    nowFn,
  });
  let sharedBlocker = buildPrioritySpreadBlocker();
  parked.getControlPlanePrioritySpreadBlocker = () => sharedBlocker;
  stabilizer.getControlPlanePrioritySpreadBlocker = () => sharedBlocker;
  parked.randomSource = {random: () => NO_JITTER_DRAW};
  stabilizer.randomSource = {random: () => NO_JITTER_DRAW};
  const parkedWakeReasons = [];
  parked.enqueueRebalanceCheck = (reason) => {
    parkedWakeReasons.push(reason);
    return true;
  };
  const stabilizerWakeReasons = [];
  stabilizer.enqueueRebalanceCheck = (reason) => {
    stabilizerWakeReasons.push(reason);
    return true;
  };
  const parkedFallbackDelays = [];
  parked.scheduleNextCheck = (delayMs) => {
    parkedFallbackDelays.push(delayMs);
  };

  try {
    const stableWindowMs =
      parked.getBackgroundPrioritySpreadStableWindowMs();

    const blockedDecision =
      parked.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blockedDecision?.scheduleDelayMs,
      stableWindowMs,
      'the blocked-branch fallback delay law is unchanged by the wake',
    );
    parked.applyRebalancePlanningGateDecision(blockedDecision);
    t.equal(
      parkedFallbackDelays.length,
      ONE_TIMER_SCHEDULED,
      'wake registration never replaces the scheduled fallback timer',
    );

    sharedBlocker = null;
    nowMs += BLOCKED_TO_CLEAR_DELAY_MS;
    const stabilizingDecision =
      stabilizer.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      stabilizingDecision?.blocker?.state,
      RELEASE_STATE_STABILIZING,
      'the first clear sample still enters the stabilizing hold',
    );
    t.equal(
      stabilizingDecision?.blocker?.requiredStableMs,
      stableWindowMs,
      'the stabilizing hold still requires the full stable window',
    );
    t.equal(
      stabilizingDecision?.scheduleDelayMs,
      stableWindowMs,
      'the stabilizing branch still schedules its exact-deadline fallback',
    );
    t.equal(
      parkedWakeReasons.length,
      NO_WAKES,
      'no wake fires while the window is still maturing',
    );

    nowMs += stableWindowMs - 1;
    const lastHeldDecision =
      stabilizer.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      lastHeldDecision?.blocker?.stableRemainingMs,
      1,
      'the fence stays closed through the last stabilizing tick',
    );
    t.equal(
      parkedWakeReasons.length,
      NO_WAKES,
      'the wake never fires early — the window is not shortened',
    );

    nowMs += 1;
    t.equal(
      stabilizer.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'an ordinary sharer resolving maturity releases the fence',
    );
    t.same(
      parkedWakeReasons,
      [RECONCILE_REASON.PRIORITY_SPREAD_RELEASE_WAKE],
      'the parked entity is woken exactly once at stable release',
    );
    t.same(
      stabilizerWakeReasons,
      [RECONCILE_REASON.PRIORITY_SPREAD_RELEASE_WAKE],
      'every registered sharer is woken at stable release',
    );

    sharedBlocker = buildPrioritySpreadBlocker();
    nowMs += REARM_DELAY_MS;
    const rearmedDecision =
      parked.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      rearmedDecision?.gate,
      REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      'a fresh blocked observation re-arms the shared fence',
    );

    sharedBlocker = null;
    nowMs += REARM_CLEAR_DELAY_MS;
    const secondCycleDecision =
      stabilizer.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      secondCycleDecision?.blocker?.requiredStableMs,
      stableWindowMs,
      'a re-armed fence demands a full fresh stability window',
    );
    t.equal(
      secondCycleDecision?.blocker?.stableElapsedMs,
      0,
      'the released cycle leaves no residual stability credit',
    );
    t.equal(
      parkedWakeReasons.length,
      ONE_WAKE,
      'no second wake fires before the re-armed window matures',
    );
  } finally {
    parked.shutdown();
    stabilizer.shutdown();
  }
});
