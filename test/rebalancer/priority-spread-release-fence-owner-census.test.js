/**
 * The release fence's CLEAR is the operation ledger owner's, not the cache
 * projection's.
 *
 * Failure this pins: the fence read its blocking operations from the
 * SystemTableCache projection, which can lag or miss a committed row; an
 * empty projection read CLEAR and the fence opened on a priority transition
 * the projection had not caught up with. An empty projection is now no
 * answer by itself: CLEAR needs the owner's cluster-wide census, answered
 * within the stability window, with no fence-blocking operation. Until it
 * answers, the observation is the named UNAVAILABLE hold, which neither
 * starts nor restarts the dwell.
 *
 * Every test enters through the production gate
 * (resolvePrioritySpreadPlanningGateDecision) and drives the rebalancer's
 * own clock (nowFn); none sleeps.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  REBALANCE_PLANNING_GATE,
} from '../../src/rebalancer/rebalancer-planning-gate-constants.js';
import {
  BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE,
  BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE,
} from '../../src/rebalancer/background-priority-spread-release-tracker.js';
import {
  RECONCILE_REASON,
} from '../../src/workflow/reconcile-queue-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  FENCE_PRIORITY_PARTITION_ID,
  armFenceThenClearSpread,
  blockerOf,
  buildSourceRemovalReplace,
  createFenceWorld,
  logContextOf,
} from './priority-spread-release-fence-world.js';

const BACKGROUND_ENTITY_ID = 'nodes-p1';
const CENSUS_ONLY_OPERATION_ID = 'replace-schema_operations-p1-r7';
const CENSUS_ANSWER_DELAY_MS = 5_000;
const CENSUS_SOURCE = 'operation_ledger_owner_census';
const CENSUS_UNANSWERED_REASON = 'operation_census_unanswered';

function censusAnsweredWakes(rebalancer) {
  return rebalancer.wakeReasons.filter((reason) =>
    reason === RECONCILE_REASON.PRIORITY_SPREAD_FENCE_CENSUS_ANSWERED);
}

test('(1) an empty projection with no owner census answer holds the fence ' +
  'as the named unavailable state and never releases', async (t) => {
  const world = createFenceWorld();
  const background = world.createRebalancer(BACKGROUND_ENTITY_ID);
  try {
    const stableWindowMs = background.getBackgroundPrioritySpreadStableWindowMs();
    world.ownerCensusAnswers = false;
    armFenceThenClearSpread(world, background);
    background.isLeader = true;

    background.resolvePrioritySpreadPlanningGateDecision();
    await world.settleOwnerCensus();
    const hold = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(hold?.gate, REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      'the fence still holds ordinary work');
    t.equal(blockerOf(hold).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_UNAVAILABLE,
      'the hold is the named unavailable state, not a running dwell');
    t.equal(logContextOf(hold).releaseConditionState,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.UNAVAILABLE,
      'the condition is reported unavailable');
    t.equal(logContextOf(hold).priorityTransitionUnavailableReason,
      CENSUS_UNANSWERED_REASON, 'named by the unanswered owner census');
    t.equal(logContextOf(hold).priorityTransitionSource, CENSUS_SOURCE,
      'the census, not the cache projection, is the source');
    t.ok(world.ownerCensusReads > 0, 'the owner census was asked');
    t.equal(blockerOf(hold).stableElapsedMs, 0, 'no dwell runs');

    const readsBeforeWindow = world.ownerCensusReads;
    world.nowMs += stableWindowMs + 1;
    const pastWindow = background.resolvePrioritySpreadPlanningGateDecision();
    await world.settleOwnerCensus();
    t.equal(blockerOf(pastWindow).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_UNAVAILABLE,
      'a full window later the fence still holds');
    t.ok(background.resolvePrioritySpreadPlanningGateDecision(),
      'and does not release ordinary work');
    t.ok(world.ownerCensusReads > readsBeforeWindow,
      'an evaluation after a failed census asks again');
    await world.settleOwnerCensus();
    t.same(background.releaseLogs, [], 'no release was logged');
    t.same(censusAnsweredWakes(background), [],
      'a failed census wakes nobody');

    // The owner answers at last: the dwell owes a full window from the
    // first held observation, with no credit for the unanswered span.
    world.ownerCensusAnswers = true;
    await world.answerOwnerCensus(background);
    const firstHeld = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(blockerOf(firstHeld).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the answered census starts the dwell');
    t.equal(blockerOf(firstHeld).stableRemainingMs, stableWindowMs,
      'a full window is owed; the unanswered span counted for nothing');
  } finally {
    world.shutdown();
  }
});

test('(2) a fence-blocking priority operation only the owner census shows ' +
  'holds the fence as not held', async (t) => {
  const world = createFenceWorld();
  const background = world.createRebalancer(BACKGROUND_ENTITY_ID);
  try {
    const stableWindowMs = background.getBackgroundPrioritySpreadStableWindowMs();
    const committedReplace = buildSourceRemovalReplace(
      CENSUS_ONLY_OPERATION_ID, FENCE_PRIORITY_PARTITION_ID, world.nowMs);
    world.ownerCensusOnlyOperations.push(committedReplace);
    t.same(
      background.systemTableCache.filter(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, () => true),
      [],
      'the cache projection does not show the committed operation',
    );
    t.equal(
      background.isPrioritySpreadReleaseFenceBlockingOperation(committedReplace),
      true,
      'the operation is fence-blocking',
    );
    armFenceThenClearSpread(world, background);

    await world.answerOwnerCensus(background);
    const hold = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(hold?.gate, REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      'the fence holds ordinary work');
    t.equal(blockerOf(hold).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
      'the census\'s in-flight operation is a definite not-held');
    t.equal(logContextOf(hold).priorityTransitionState, 'in_flight',
      'the priority transition is in flight');
    t.equal(logContextOf(hold).priorityTransitionSource, CENSUS_SOURCE,
      'as the owner census answered it');
    t.same(logContextOf(hold).fenceBlockingOperations, [{
      operationId: CENSUS_ONLY_OPERATION_ID,
      partitionId: FENCE_PRIORITY_PARTITION_ID,
      type: 'REPLACE',
      workflowStep: 'ACTIVE',
    }], 'the hold line names the operation the projection lacks');

    world.nowMs += stableWindowMs + 1;
    await world.answerOwnerCensus(background);
    const pastWindow = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(blockerOf(pastWindow).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
      'a fresh census a full window later still holds it');
    t.equal(blockerOf(pastWindow).stableElapsedMs, 0, 'no dwell accrues');
    t.same(background.releaseLogs, [], 'no release was logged');
  } finally {
    world.shutdown();
  }
});

test('(3) the answered census wakes its requester; the dwell starts at the ' +
  'first held observation after it and releases one full window later',
async (t) => {
  const world = createFenceWorld();
  const background = world.createRebalancer(BACKGROUND_ENTITY_ID);
  try {
    const stableWindowMs = background.getBackgroundPrioritySpreadStableWindowMs();
    armFenceThenClearSpread(world, background);
    background.isLeader = true;
    const clearedAtMs = world.nowMs;

    const requested = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(blockerOf(requested).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_UNAVAILABLE,
      'the first cleared evaluation is unavailable, not held');
    t.equal(logContextOf(requested).priorityTransitionUnavailableReason,
      CENSUS_UNANSWERED_REASON, 'it waits on the owner census');
    world.nowMs += CENSUS_ANSWER_DELAY_MS;
    const stillPending = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(blockerOf(stillPending).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_UNAVAILABLE,
      'it stays unavailable while the census is in flight');
    t.equal(blockerOf(stillPending).stableElapsedMs, 0,
      'and accrues no dwell');
    t.equal(world.ownerCensusReads, 1,
      'the second request joins the census in flight');
    t.same(censusAnsweredWakes(background), [], 'no wake before the answer');

    await world.settleOwnerCensus();
    t.same(censusAnsweredWakes(background),
      [RECONCILE_REASON.PRIORITY_SPREAD_FENCE_CENSUS_ANSWERED],
      'the answer wakes the requesting rebalancer once');

    const firstHeldAtMs = world.nowMs;
    const firstHeld = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(blockerOf(firstHeld).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the dwell starts at the first held observation after the answer');
    t.equal(blockerOf(firstHeld).clearObservedAtMs, firstHeldAtMs,
      'from that observation');
    t.equal(blockerOf(firstHeld).stableRemainingMs, stableWindowMs,
      'owing a full window: the unavailable span is not dwell');
    t.equal(logContextOf(firstHeld).priorityTransitionState, 'clear',
      'the census states the transitions clear');
    t.equal(logContextOf(firstHeld).priorityTransitionSource, CENSUS_SOURCE,
      'as the owner answered it');

    world.nowMs = firstHeldAtMs + stableWindowMs - 1;
    t.ok(world.nowMs > clearedAtMs + stableWindowMs,
      'a window counted from the clear would already have released');
    const lastTick = background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(blockerOf(lastTick).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the fence holds through the last tick');
    t.equal(blockerOf(lastTick).stableRemainingMs, 1, 'one tick is owed');
    t.same(background.releaseLogs, [], 'nothing released before it');
    // That evaluation found the census older than half the window and
    // refreshed it; the refresh answers before the next one.
    await world.settleOwnerCensus();

    world.nowMs += 1;
    t.equal(background.resolvePrioritySpreadPlanningGateDecision(), null,
      'ordinary work is released one full window after the first held ' +
        'observation');
    t.equal(background.releaseLogs.length, 1, 'the release is logged once');
    t.match(background.releaseLogs[0], {
      releasedAtMs: firstHeldAtMs + stableWindowMs,
      releaseConditionState:
        BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.HELD,
      priorityTransitionSource: CENSUS_SOURCE,
    }, 'on the owner census\'s CLEAR');
  } finally {
    world.shutdown();
  }
});
