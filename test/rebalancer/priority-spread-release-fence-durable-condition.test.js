/**
 * The ordinary-work release fence releases on a durable condition, not on
 * elapsed time alone.
 *
 * Failure this pins (lab run): the fence counted its stability dwell from
 * the planner's in-flight view, which leaves REPLACE source-removal rows
 * out by design. A priority-partition REPLACE (schema_operations-p1) sat in
 * its ACTIVE source-removal phase while one node was not serve-eligible;
 * the fence reported `stabilizing` with zero blocking operations, the dwell
 * expired, and background work was released on an unfinished priority
 * transition.
 *
 * Every test drives the rebalancer's own clock (nowFn); none sleeps.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  REBALANCE_PLANNING_GATE,
} from '../../src/rebalancer/rebalancer-planning-gate-constants.js';
import {
  BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE,
  BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE,
  observeActiveBackgroundPrioritySpreadTransitionDrains,
  observeBackgroundPrioritySpreadBlocked,
  registerBackgroundPrioritySpreadReleaseWake,
  resolveBackgroundPrioritySpreadStableRelease,
} from '../../src/rebalancer/background-priority-spread-release-tracker.js';
import {
  RECONCILE_REASON,
} from '../../src/workflow/reconcile-queue-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  FENCE_PRIORITY_PARTITION_ID as PRIORITY_PARTITION_ID,
  FENCE_REQUIRED_NODE_IDS as REQUIRED_NODE_IDS,
  armFenceThenClearSpread,
  blockerOf,
  buildOperationRow,
  buildSourceRemovalReplace,
  completeReplace,
  createFenceWorld,
  logContextOf,
} from './priority-spread-release-fence-world.js';

const NOT_ELIGIBLE_NODE_ID = 'node-3';
const BACKGROUND_ENTITY_ID = 'nodes-p1';
const SECOND_BACKGROUND_ENTITY_ID = 'logs-p1';
const ORDINARY_PARTITION_ID = 'user_orders-p1';
const PRIORITY_REPLACE_OPERATION_ID = 'replace-schema_operations-p1-r1';
const ORDINARY_REPLACE_OPERATION_ID = 'replace-user_orders-p1-r1';
const ORDINARY_ADD_OPERATION_ID = 'add-user_orders-p1-r4';
const BLOCKED_TO_CLEAR_MS = 1_000;
const SOURCE_REMOVAL_HELD_MS = 112_000;
const RECHECK_AFTER_COMPLETION_MS = 11_000;
const ORDINARY_ADD_IN_FLIGHT_MS = 20_000;
const SERVE_NOT_ELIGIBLE_REASON = 'ready_lease_expired';
const SERVE_RECORD_STALE_REASON = 'unavailable_stale';
const TRACKER_WINDOW_MS = 70_000;
const TRACKER_BLOCKED_AT_MS = 1_000;
const TRACKER_NOT_HELD_AT_MS = 5_000;
const TRACKER_DRAIN_AT_MS = 6_000;
const TRACKER_HELD_AT_MS = 9_000;

test('(a,d) a priority REPLACE in its source-removal phase holds the fence ' +
  'past the dwell, and the dwell restarts when it completes', async (t) => {
  const world = createFenceWorld();
  const background = world.createRebalancer(BACKGROUND_ENTITY_ID);
  try {
    const stableWindowMs = background.getBackgroundPrioritySpreadStableWindowMs();
    const priorityReplace = buildSourceRemovalReplace(
      PRIORITY_REPLACE_OPERATION_ID,
      PRIORITY_PARTITION_ID,
      world.nowMs,
    );
    world.replicaOperations.push(priorityReplace);
    armFenceThenClearSpread(world, background);

    // (d) the planner's own in-flight view is unchanged: the source-removal
    // row stays out of it, so the planner still plans beside it.
    t.same(
      background.getGlobalTopologyBlockingInFlightOperations(),
      [],
      'the planner global in-flight view still excludes the source-removal row',
    );
    t.equal(
      background.isTopologyBlockingInFlightOperation(priorityReplace),
      false,
      'the planner predicate still excludes REPLACE source removal',
    );
    t.equal(
      background.isTopologySettlingInFlightOperation(
        priorityReplace,
        {nowMs: world.nowMs},
      ),
      false,
      'topology settling still does not count REPLACE source removal',
    );
    t.equal(
      background.isPrioritySpreadReleaseFenceBlockingOperation(priorityReplace),
      true,
      'the fence predicate counts the same row',
    );

    const firstHold = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      firstHold?.gate,
      REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      'the fence holds ordinary work',
    );
    t.equal(
      blockerOf(firstHold).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
      'the hold names the unfinished priority transition, not a dwell',
    );
    t.equal(
      logContextOf(firstHold).globalTopologyBlockingOperationCount,
      0,
      'the planner blocking count is zero, as in the failing run',
    );
    t.equal(
      logContextOf(firstHold).fenceBlockingOperationCount,
      1,
      'the fence reports its own blocking count',
    );
    t.same(
      logContextOf(firstHold).fenceBlockingOperations,
      [{
        operationId: PRIORITY_REPLACE_OPERATION_ID,
        partitionId: PRIORITY_PARTITION_ID,
        type: 'REPLACE',
        workflowStep: 'ACTIVE',
      }],
      'the hold line lists the blocking priority operation',
    );
    t.same(
      logContextOf(firstHold).plannerExcludedOperations,
      logContextOf(firstHold).fenceBlockingOperations,
      'the same row is listed as excluded from the planner count',
    );

    // The run: 112 s in source removal, well past the dwell.
    world.nowMs += SOURCE_REMOVAL_HELD_MS;
    t.ok(
      SOURCE_REMOVAL_HELD_MS > stableWindowMs,
      'the source removal outlasts the whole stability window',
    );
    const pastDwellHold = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blockerOf(pastDwellHold).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
      'the fence still holds after the dwell would have expired',
    );
    t.equal(
      blockerOf(pastDwellHold).stableElapsedMs,
      0,
      'no dwell accrues while the priority transition is unfinished',
    );
    t.same(background.wakeReasons, [], 'no release wake fired');
    t.same(background.releaseLogs, [], 'no release was logged');

    // STOPPING is the replay phase of the same source removal.
    priorityReplace.status = 'stopping';
    priorityReplace.workflow_step = 'STOPPING';
    t.equal(
      blockerOf(background.resolvePrioritySpreadPlanningGateDecision()).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
      'the STOPPING phase holds the fence too',
    );

    completeReplace(priorityReplace, world.nowMs);
    world.nowMs += RECHECK_AFTER_COMPLETION_MS;
    const restarted = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blockerOf(restarted).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'completion starts the dwell',
    );
    t.equal(
      blockerOf(restarted).stableElapsedMs,
      0,
      'the dwell restarts from the first observation that the condition ' +
        'holds, with no credit from before it',
    );
    t.equal(
      blockerOf(restarted).stableRemainingMs,
      stableWindowMs,
      'a full window is owed after the transition completes',
    );

    world.nowMs += stableWindowMs - 1;
    t.equal(
      blockerOf(background.resolvePrioritySpreadPlanningGateDecision()).stableRemainingMs,
      1,
      'the fence holds through the last tick of the restarted dwell',
    );
    world.nowMs += 1;
    t.equal(
      background.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'ordinary work is released after the full restarted dwell',
    );
    t.equal(background.releaseLogs.length, 1, 'the release is logged once');
  } finally {
    world.shutdown();
  }
});

test('(b) a required member node that is not serve-eligible holds the fence',
  async (t) => {
    const world = createFenceWorld();
    const background = world.createRebalancer(BACKGROUND_ENTITY_ID);
    try {
      const stableWindowMs =
        background.getBackgroundPrioritySpreadStableWindowMs();
      world.readiness.notEligibleReasonsByNodeId[NOT_ELIGIBLE_NODE_ID] =
        [SERVE_NOT_ELIGIBLE_REASON];
      armFenceThenClearSpread(world, background);

      const firstHold = background.resolvePrioritySpreadPlanningGateDecision();
      t.equal(
        blockerOf(firstHold).state,
        BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
        'a not-serve-eligible required node holds the fence',
      );
      t.same(
        world.readiness.serveCohortRequests.at(-1),
        [...REQUIRED_NODE_IDS],
        'the serve owner is asked about the required priority cohort',
      );
      t.same(
        logContextOf(firstHold).requiredNodeServeEligibility,
        {
          'node-1': {eligibility: 'eligible'},
          'node-2': {eligibility: 'eligible'},
          'node-3': {
            eligibility: 'not_eligible',
            reasons: [SERVE_NOT_ELIGIBLE_REASON],
          },
        },
        'the hold line states per-node serve eligibility as the owner ' +
          'answered it',
      );

      world.nowMs += stableWindowMs + 1;
      const pastDwellHold =
        background.resolvePrioritySpreadPlanningGateDecision();
      t.equal(
        blockerOf(pastDwellHold).state,
        BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
        'the fence still holds after the dwell would have expired',
      );
      t.same(background.releaseLogs, [], 'no release was logged');

      delete world.readiness.notEligibleReasonsByNodeId[NOT_ELIGIBLE_NODE_ID];
      const restarted = background.resolvePrioritySpreadPlanningGateDecision();
      t.equal(
        blockerOf(restarted).state,
        BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
        'the dwell starts once every required node is serve-eligible',
      );
      t.equal(blockerOf(restarted).stableElapsedMs, 0, 'with no prior credit');

      // Losing eligibility mid-dwell rearms it.
      world.nowMs += stableWindowMs - 1;
      world.readiness.notEligibleReasonsByNodeId[NOT_ELIGIBLE_NODE_ID] =
        [SERVE_NOT_ELIGIBLE_REASON];
      t.equal(
        blockerOf(background.resolvePrioritySpreadPlanningGateDecision()).state,
        BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
        'a node that stops being serve-eligible mid-dwell rearms the fence',
      );
      delete world.readiness.notEligibleReasonsByNodeId[NOT_ELIGIBLE_NODE_ID];
      world.nowMs += 1;
      t.equal(
        blockerOf(background.resolvePrioritySpreadPlanningGateDecision()).stableRemainingMs,
        stableWindowMs,
        'the rearmed fence owes a full fresh window',
      );
    } finally {
      world.shutdown();
    }
  });

test('(c) an unavailable input holds the fence as a named state, never a ' +
  'silent pass, and never restarts the dwell', async (t) => {
  const world = createFenceWorld();
  const background = world.createRebalancer(BACKGROUND_ENTITY_ID);
  try {
    const stableWindowMs = background.getBackgroundPrioritySpreadStableWindowMs();
    const blockedPriorityBlocker = world.prioritySpreadBlocker;
    armFenceThenClearSpread(world, background);
    const heldPlanningAnswer = world.readiness.planningAnswer;
    const heldServeAnswer = world.readinessOwner.answerServeCohort;
    const heldCacheFilter = background.systemTableCache.filter;

    const unavailableCases = [
      {
        name: 'the serve record is unavailable',
        expectedReason: SERVE_RECORD_STALE_REASON,
        reasonField: 'requiredNodeServeUnavailableReason',
        apply: () => {
          world.readiness.serveUnavailableReason = SERVE_RECORD_STALE_REASON;
        },
        restore: () => {
          world.readiness.serveUnavailableReason = null;
        },
      },
      {
        name: 'the serve owner gives no cohort answer',
        expectedReason: 'serve_eligibility_answer_absent',
        reasonField: 'requiredNodeServeUnavailableReason',
        apply: () => {
          world.readinessOwner.answerServeCohort = () => null;
        },
        restore: () => {
          world.readinessOwner.answerServeCohort = heldServeAnswer;
        },
      },
      {
        name: 'the readiness owner gives no planning answer',
        expectedReason: 'priority_planning_answer_absent',
        reasonField: 'requiredNodeServeUnavailableReason',
        apply: () => {
          world.readiness.planningAnswer = null;
        },
        restore: () => {
          world.readiness.planningAnswer = heldPlanningAnswer;
        },
      },
      {
        name: 'the planning answer states no required cohort',
        expectedReason: 'required_node_cohort_unstated',
        reasonField: 'requiredNodeServeUnavailableReason',
        apply: () => {
          world.readiness.planningAnswer = {};
        },
        restore: () => {
          world.readiness.planningAnswer = heldPlanningAnswer;
        },
      },
      {
        name: 'the operation projection cannot be read',
        expectedReason: 'operation_projection_unreadable',
        reasonField: 'priorityTransitionUnavailableReason',
        // Only the fence's read of the projection is made unreadable: the
        // planner's own two reads of the operation table are stubbed.
        apply: () => {
          background.systemTableCache.filter = (tableName, predicate) =>
            (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS ?
              undefined :
              heldCacheFilter(tableName, predicate));
          background.getGlobalTopologyBlockingInFlightOperations = () => [];
          background.getDrainedFenceHoldingOperationIds = () => [];
        },
        restore: () => {
          background.systemTableCache.filter = heldCacheFilter;
          delete background.getGlobalTopologyBlockingInFlightOperations;
          delete background.getDrainedFenceHoldingOperationIds;
        },
      },
    ];

    for (const unavailableCase of unavailableCases) {
      // Start from a running dwell so the hold is shown NOT to rearm it.
      const running = background.resolvePrioritySpreadPlanningGateDecision();
      t.equal(
        blockerOf(running).state,
        BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
        `${unavailableCase.name}: the dwell was running beforehand`,
      );
      const elapsedBefore = blockerOf(running).stableElapsedMs;
      unavailableCase.apply();
      world.nowMs += stableWindowMs + 1;
      const hold = background.resolvePrioritySpreadPlanningGateDecision();
      t.equal(
        blockerOf(hold).state,
        BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_UNAVAILABLE,
        `${unavailableCase.name}: the fence holds past the dwell on the ` +
          'named unavailable state',
      );
      t.equal(
        logContextOf(hold).releaseConditionState,
        BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.UNAVAILABLE,
        `${unavailableCase.name}: the condition is reported unavailable`,
      );
      t.equal(
        logContextOf(hold)[unavailableCase.reasonField],
        unavailableCase.expectedReason,
        `${unavailableCase.name}: the unavailable input is named`,
      );
      t.equal(
        blockerOf(hold).stableElapsedMs,
        elapsedBefore + stableWindowMs + 1,
        `${unavailableCase.name}: the unknown span holds the dwell ` +
          'without restarting it',
      );
      t.same(background.releaseLogs, [],
        `${unavailableCase.name}: an unknown never releases`);
      unavailableCase.restore();
      t.equal(
        background.resolvePrioritySpreadPlanningGateDecision(),
        null,
        `${unavailableCase.name}: the next held observation releases`,
      );
      t.equal(background.releaseLogs.length, 1,
        `${unavailableCase.name}: released once, on a held observation`);
      background.releaseLogs.length = 0;
      background.wakeReasons.length = 0;
      // Close the fence again for the next case.
      world.prioritySpreadBlocker = blockedPriorityBlocker;
      armFenceThenClearSpread(world, background);
    }
  } finally {
    world.shutdown();
  }
});

test('(e) release after a continuous clear still works, wakes each parked ' +
  'entity exactly once, and logs why it released', async (t) => {
  const world = createFenceWorld();
  const parked = world.createRebalancer(BACKGROUND_ENTITY_ID);
  const resolver = world.createRebalancer(SECOND_BACKGROUND_ENTITY_ID);
  try {
    const stableWindowMs = parked.getBackgroundPrioritySpreadStableWindowMs();
    // An ordinary REPLACE in source removal: left out of the planner count
    // and no concern of the fence. It must be listed at the release instant.
    world.replicaOperations.push(buildSourceRemovalReplace(
      ORDINARY_REPLACE_OPERATION_ID,
      ORDINARY_PARTITION_ID,
      world.nowMs,
    ));
    const blockedDecision = parked.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blockedDecision?.gate,
      REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      'the background entity parks while priority spread is blocked',
    );
    world.prioritySpreadBlocker = null;
    world.nowMs += BLOCKED_TO_CLEAR_MS;

    const firstClear = resolver.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blockerOf(firstClear).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the first clear observation with the condition held starts the dwell',
    );
    t.equal(
      blockerOf(firstClear).requiredStableMs,
      stableWindowMs,
      'the window length is unchanged',
    );

    world.nowMs += stableWindowMs - 1;
    t.equal(
      blockerOf(resolver.resolvePrioritySpreadPlanningGateDecision()).stableRemainingMs,
      1,
      'the fence holds through the last tick',
    );
    t.same(parked.wakeReasons, [], 'no wake before maturity');

    world.nowMs += 1;
    t.equal(
      resolver.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'a continuous clear for the whole window releases ordinary work',
    );
    t.same(
      parked.wakeReasons,
      [RECONCILE_REASON.PRIORITY_SPREAD_RELEASE_WAKE],
      'the parked entity is woken exactly once',
    );
    t.same(
      resolver.wakeReasons,
      [RECONCILE_REASON.PRIORITY_SPREAD_RELEASE_WAKE],
      'the resolving sharer is woken exactly once',
    );

    t.equal(resolver.releaseLogs.length, 1, 'one release line is logged');
    t.match(
      resolver.releaseLogs[0],
      {
        entityId: SECOND_BACKGROUND_ENTITY_ID,
        releasedAtMs: world.nowMs,
        requiredStableMs: stableWindowMs,
        releaseConditionState:
          BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.HELD,
        globalTopologyBlockingOperationCount: 0,
        plannerExcludedOperationCount: 1,
        plannerExcludedOperations: [{
          operationId: ORDINARY_REPLACE_OPERATION_ID,
          partitionId: ORDINARY_PARTITION_ID,
          type: 'REPLACE',
          workflowStep: 'ACTIVE',
        }],
        plannerExcludedOperationsWithheld: 0,
        fenceBlockingOperationCount: 0,
        fenceBlockingOperations: [],
        priorityTransitionState: 'clear',
        priorityTransitionSource: 'system_table_cache',
        requiredNodeServeState: 'eligible',
        requiredNodeIds: [...REQUIRED_NODE_IDS],
        requiredNodeServeEligibility: {
          'node-1': {eligibility: 'eligible'},
          'node-2': {eligibility: 'eligible'},
          'node-3': {eligibility: 'eligible'},
        },
      },
      'the release line lists the operations excluded from the planner ' +
        'count, the fence blocking count, and per-node serve eligibility',
    );

    t.equal(
      parked.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'the woken entity plans on its re-evaluation',
    );
    t.same(
      [parked.wakeReasons.length, resolver.wakeReasons.length],
      [1, 1],
      'no second wake fires after the release',
    );
    t.equal(
      parked.releaseLogs.length + resolver.releaseLogs.length,
      1,
      'the release is not logged again once the fence is inactive',
    );
  } finally {
    world.shutdown();
  }
});

// Supersedes the earlier pin "ordinary in-flight add-like work still rearms
// the dwell, and its drain back-dates the clock": the fence stands for
// priority control-plane placement only, so the ordinary work it releases
// can never close it again (that pin made every released background move
// restart the dwell for every other entity - a livelock by construction).
test('(f) non-priority work in flight or drained neither holds nor ' +
  'rearms the fence: no deadlock behind ordinary operations', async (t) => {
  const world = createFenceWorld();
  const background = world.createRebalancer(BACKGROUND_ENTITY_ID);
  try {
    const stableWindowMs = background.getBackgroundPrioritySpreadStableWindowMs();
    // Present for the whole test and never completed: an ordinary REPLACE in
    // source removal must not hold the fence (the planner-deadlock case).
    const ordinaryReplace = buildSourceRemovalReplace(
      ORDINARY_REPLACE_OPERATION_ID,
      ORDINARY_PARTITION_ID,
      world.nowMs,
    );
    world.replicaOperations.push(ordinaryReplace);
    t.equal(
      background.isPrioritySpreadReleaseFenceBlockingOperation(ordinaryReplace),
      false,
      'an ordinary partition transition is not a fence blocker',
    );
    armFenceThenClearSpread(world, background);

    const firstClear = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blockerOf(firstClear).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'ordinary source removal does not hold the fence',
    );
    t.equal(logContextOf(firstClear).fenceBlockingOperationCount, 0);

    world.nowMs += ORDINARY_ADD_IN_FLIGHT_MS;
    const ordinaryAdd = buildOperationRow({
      operationId: ORDINARY_ADD_OPERATION_ID,
      type: 'ADD',
      partitionId: ORDINARY_PARTITION_ID,
      status: 'syncing',
      workflowStep: 'SYNCING',
      atMs: world.nowMs,
    });
    world.replicaOperations.push(ordinaryAdd);
    const withOrdinaryAdd =
      background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blockerOf(withOrdinaryAdd).stableElapsedMs,
      ORDINARY_ADD_IN_FLIGHT_MS,
      'ordinary in-flight add-like work does not rearm the dwell',
    );
    t.equal(
      logContextOf(withOrdinaryAdd).globalTopologyBlockingOperationCount,
      1,
      'the planner view still counts it, as evidence only',
    );

    world.nowMs += ORDINARY_ADD_IN_FLIGHT_MS;
    ordinaryAdd.status = 'active';
    ordinaryAdd.workflow_step = 'ACTIVE';
    ordinaryAdd.updated_at = world.nowMs;
    ordinaryAdd.completed_at = world.nowMs;
    const afterDrain = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blockerOf(afterDrain).stableElapsedMs,
      2 * ORDINARY_ADD_IN_FLIGHT_MS,
      'its drain does not rearm the dwell either',
    );

    world.nowMs += stableWindowMs - 2 * ORDINARY_ADD_IN_FLIGHT_MS;
    t.equal(
      background.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'the fence releases one window after the first held observation, ' +
        'with ordinary work run and drained inside it',
    );
    t.match(
      background.releaseLogs[0],
      {
        plannerExcludedOperationCount: 1,
        fenceBlockingOperationCount: 0,
        newlyDrainedFenceHoldingOperationIds: [],
      },
      'the release line shows no priority drain and the still-running ' +
        'ordinary source removal',
    );
  } finally {
    world.shutdown();
  }
});

test('tracker: an observation that does not state the condition holds is ' +
  'the unavailable hold, and a drain rearms at the observing instant, never ' +
  'back-dating the dwell', async (t) => {
  const readinessOwner = {};
  let wakes = 0;
  observeBackgroundPrioritySpreadBlocked({
    readinessOwner,
    observedAt: TRACKER_BLOCKED_AT_MS,
  });
  registerBackgroundPrioritySpreadReleaseWake({
    readinessOwner,
    wakeKey: BACKGROUND_ENTITY_ID,
    onStableRelease: () => {
      wakes += 1;
    },
  });

  const unstated = resolveBackgroundPrioritySpreadStableRelease({
    readinessOwner,
    observedAt: TRACKER_BLOCKED_AT_MS + 1,
    requiredStableMs: 0,
  });
  t.equal(
    unstated?.state,
    BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_UNAVAILABLE,
    'an unstated condition never releases, even with a zero window',
  );
  t.equal(wakes, 0, 'and fires no wake');

  const notHeld = resolveBackgroundPrioritySpreadStableRelease({
    readinessOwner,
    observedAt: TRACKER_NOT_HELD_AT_MS,
    requiredStableMs: TRACKER_WINDOW_MS,
    releaseConditionState:
      BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.NOT_HELD,
  });
  t.match(
    notHeld,
    {
      state: BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
      stableElapsedMs: 0,
      stableRemainingMs: TRACKER_WINDOW_MS,
      clearObservedAtMs: null,
      lastBlockedObservedAtMs: TRACKER_NOT_HELD_AT_MS,
    },
    'a not-held observation rearms the dwell',
  );

  t.same(
    observeActiveBackgroundPrioritySpreadTransitionDrains({
      readinessOwner,
      drainedOperationIds: [],
      observedAt: TRACKER_NOT_HELD_AT_MS,
    }),
    [],
    'the first drain sample only baselines',
  );
  const firstHeld = resolveBackgroundPrioritySpreadStableRelease({
    readinessOwner,
    observedAt: TRACKER_HELD_AT_MS,
    requiredStableMs: TRACKER_WINDOW_MS,
    releaseConditionState:
      BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.HELD,
  });
  t.match(
    firstHeld,
    {
      state: BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      stableElapsedMs: 0,
      clearObservedAtMs: TRACKER_HELD_AT_MS,
    },
    'the dwell starts at the first held observation',
  );

  // A priority transition drained between two evaluations: seen first at
  // TRACKER_DRAIN_AT_MS + TRACKER_HELD_AT_MS, it rearms at that instant.
  const drainSeenAtMs = TRACKER_HELD_AT_MS + TRACKER_DRAIN_AT_MS;
  t.same(
    observeActiveBackgroundPrioritySpreadTransitionDrains({
      readinessOwner,
      drainedOperationIds: ['replace-schema_operations-p1-r9'],
      observedAt: drainSeenAtMs,
    }),
    ['replace-schema_operations-p1-r9'],
    'a drain not seen before rearms the dwell',
  );
  t.same(
    observeActiveBackgroundPrioritySpreadTransitionDrains({
      readinessOwner,
      drainedOperationIds: ['replace-schema_operations-p1-r9'],
      observedAt: drainSeenAtMs,
    }),
    [],
    'the same drain seen again does not',
  );
  t.match(
    resolveBackgroundPrioritySpreadStableRelease({
      readinessOwner,
      observedAt: drainSeenAtMs,
      requiredStableMs: TRACKER_WINDOW_MS,
      releaseConditionState:
        BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.HELD,
    }),
    {stableElapsedMs: 0, clearObservedAtMs: drainSeenAtMs},
    'the rearmed dwell runs from the observing instant',
  );

  t.equal(
    resolveBackgroundPrioritySpreadStableRelease({
      readinessOwner,
      observedAt: drainSeenAtMs + TRACKER_WINDOW_MS,
      requiredStableMs: TRACKER_WINDOW_MS,
      releaseConditionState:
        BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.HELD,
    }),
    null,
    'a full window of held observations releases',
  );
  t.equal(wakes, 1, 'and fires the wake exactly once');
});
