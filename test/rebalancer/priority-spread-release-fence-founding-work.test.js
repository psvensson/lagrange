/**
 * Founding work holds the release fence; released background moves never
 * rearm it.
 *
 * The sealed pin of quest formation-background-release-quiescence-anchor-live
 * (2026-07-18): the schema-admission quiet proof of
 * movielens-lagrange-service-affinity-live failed because the background
 * REPLACE wave started 11.5 s after the ORDINARY schema ADDs drained
 * (priority metric 1). The 2026-11-11 narrowing of the fence to priority
 * control-plane transitions alone let that wave start again the moment a
 * founding ADD drained: no ordinary work held or rearmed the dwell.
 *
 * The rule kept here: an operation that FOUNDS a partition (its durable steps
 * record the held bootstrap dispatch or the GENESIS stamp) holds the dwell
 * while in flight and rearms it when it drains, wherever it ran; a planner
 * move (the work a fence releases, on this node or another) never does. A
 * durability repair stays exempt from the dwell; a priority blocker
 * pre-empts everything.
 *
 * Every test drives the rebalancer's own clock (nowFn); none sleeps.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE,
} from '../../src/rebalancer/background-priority-spread-release-tracker.js';
import {
  REBALANCE_PLANNING_GATE,
} from '../../src/rebalancer/rebalancer-planning-gate-constants.js';
import {
  armFenceThenClearSpread,
  blockerOf,
  buildOperationRow,
  buildSourceRemovalReplace,
  completeReplace,
  createFenceWorld,
  logContextOf,
} from './priority-spread-release-fence-world.js';

const PARKED_ENTITY_ID = 'service_bindings-p1';
const SCHEMA_TABLE_PARTITION_IDS = Object.freeze([
  'tbl-movies-p1', 'tbl-ratings-p1', 'tbl-users-p1',
]);
const FOUNDING_ADD_RUN_MS = 9_000;
const SCHEMA_TO_WAVE_GAP_MS = 11_481; // the July report's drain-to-wave gap

function foundingAdd(partitionId, index, atMs, {stamped}) {
  const row = buildOperationRow({
    operationId: `schema-job-1:${partitionId}:node-${index}`,
    type: 'ADD',
    partitionId,
    status: 'creating',
    workflowStep: 'CREATING',
    atMs,
  });
  row.steps_history = JSON.stringify([stamped ?
    {bootstrapMembership: {kind: 'genesis', founders: ['r1', 'r2', 'r3'],
      founderNodeIds: {r1: 'node-1', r2: 'node-2', r3: 'node-3'}}} :
    {bootstrapTopologyDispatchDeferred: true}]);
  return row;
}

function completeAdd(operation, atMs) {
  operation.status = 'active';
  operation.workflow_step = 'ACTIVE';
  operation.updated_at = atMs;
  operation.completed_at = atMs;
}

test('July: schema founding ADDs hold the dwell; the background wave waits ' +
  'one full window after their drain', async (t) => {
  const world = createFenceWorld();
  const parked = world.createRebalancer(PARKED_ENTITY_ID);
  try {
    const stableWindowMs = parked.getBackgroundPrioritySpreadStableWindowMs();
    armFenceThenClearSpread(world, parked);
    const adds = SCHEMA_TABLE_PARTITION_IDS.map((partitionId, index) =>
      foundingAdd(partitionId, index + 1, world.nowMs, {stamped: index > 0}));
    world.replicaOperations.push(...adds);

    // The founding ADDs run longer than any window would have.
    world.nowMs += stableWindowMs + FOUNDING_ADD_RUN_MS;
    const during = parked.resolvePrioritySpreadPlanningGateDecision();
    t.equal(blockerOf(during).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
      'in-flight founding ADDs hold the fence');
    t.equal(logContextOf(during).fenceBlockingOperationCount,
      SCHEMA_TABLE_PARTITION_IDS.length,
      'each founding ADD is named as fence-blocking');

    // They drain between two evaluations.
    for (const add of adds) completeAdd(add, world.nowMs);
    const drainedAtMs = world.nowMs;
    world.nowMs += 1;
    // The drained projection is not CLEAR by itself: the owner census
    // answers at this instant, before the first held observation.
    await world.answerOwnerCensus(parked);
    const afterDrain = parked.resolvePrioritySpreadPlanningGateDecision();
    t.equal(blockerOf(afterDrain).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the dwell starts after the drain');
    t.equal(blockerOf(afterDrain).stableElapsedMs, 0,
      'from zero at the first held observation after the drain');

    world.nowMs = drainedAtMs + SCHEMA_TO_WAVE_GAP_MS;
    t.equal(
      parked.resolvePrioritySpreadPlanningGateDecision()?.gate,
      REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      'the background wave does not start 11.5 s after the drain',
    );
    // A mid-window evaluation refreshes the census (older than half the
    // window), as the rebalancer's cadence would; it does not release.
    world.nowMs = drainedAtMs + 1 + Math.floor(stableWindowMs / 2) + 1;
    t.equal(blockerOf(await world.answerOwnerCensus(parked)).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the dwell still runs at mid-window');
    world.nowMs = drainedAtMs + 1 + stableWindowMs;
    t.equal(parked.resolvePrioritySpreadPlanningGateDecision(), null,
      'it starts one full window after the drain');
  } finally {
    world.shutdown();
  }
});

test('a founding ADD that starts and drains between two evaluations ' +
  'rearms the dwell by its identity', async (t) => {
  const world = createFenceWorld();
  const parked = world.createRebalancer(PARKED_ENTITY_ID);
  try {
    const stableWindowMs = parked.getBackgroundPrioritySpreadStableWindowMs();
    armFenceThenClearSpread(world, parked);
    await world.answerOwnerCensus(parked);
    t.equal(blockerOf(parked.resolvePrioritySpreadPlanningGateDecision()).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the dwell runs before the drain');
    world.nowMs += stableWindowMs - 10;
    // Stamped far in the past by a remote clock: no timestamp is read.
    const add = foundingAdd('tbl-fast-p1', 1, world.nowMs - 3_600_000,
      {stamped: true});
    completeAdd(add, world.nowMs - 3_600_000);
    world.replicaOperations.push(add);
    const seen = parked.resolvePrioritySpreadPlanningGateDecision();
    t.equal(blockerOf(seen).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the condition is observed held at the drain');
    t.equal(blockerOf(seen).stableElapsedMs, 0,
      'the unseen drain rearms the dwell at the observing instant');
    t.same(logContextOf(seen).newlyDrainedFenceHoldingOperationIds,
      [add.operation_id], 'and names the drained operation');
    // The census refresh that evaluation requested answers.
    await world.settleOwnerCensus();
    world.nowMs += 20;
    const later = parked.resolvePrioritySpreadPlanningGateDecision();
    t.ok(later, 'the old window no longer releases');
    t.equal(blockerOf(later).stableElapsedMs, 20,
      'the dwell runs from the drain\'s observation');
  } finally {
    world.shutdown();
  }
});

test('livelock: released background moves, in flight or drained, never ' +
  'rearm the dwell', async (t) => {
  const world = createFenceWorld();
  const parked = world.createRebalancer(PARKED_ENTITY_ID);
  try {
    const stableWindowMs = parked.getBackgroundPrioritySpreadStableWindowMs();
    armFenceThenClearSpread(world, parked);
    const firstHeldAtMs = world.nowMs;
    await world.answerOwnerCensus(parked);
    t.equal(blockerOf(parked.resolvePrioritySpreadPlanningGateDecision()).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the dwell starts at the first held observation');
    // Moves another node's fence released, created while this one dwells.
    for (let index = 0; index < 3; index++) {
      world.nowMs += stableWindowMs / 4;
      const move = buildSourceRemovalReplace(`replace-bg-${index}`,
        'nodes-p1', world.nowMs);
      move.status = 'creating';
      move.workflow_step = 'CREATING';
      world.replicaOperations.push(move);
      t.equal(blockerOf(parked.resolvePrioritySpreadPlanningGateDecision())
        .stableElapsedMs, world.nowMs - firstHeldAtMs,
      `released move ${index} in flight does not rearm`);
      // Any census refresh that evaluation requested answers.
      await world.settleOwnerCensus();
      completeReplace(move, world.nowMs);
    }
    world.nowMs = firstHeldAtMs + stableWindowMs;
    t.equal(parked.resolvePrioritySpreadPlanningGateDecision(), null,
      'the fence opens one window after it first held');
  } finally {
    world.shutdown();
  }
});

test('a durability repair is exempt while a founding ADD holds the dwell; ' +
  'a priority blocker pre-empts both', async (t) => {
  const world = createFenceWorld();
  const parked = world.createRebalancer(PARKED_ENTITY_ID);
  const repairing = world.createRebalancer('tbl-repair-p1');
  try {
    world.services.push({service_id: 'tbl-repair-p1-r1',
      service_type: 'partition', partition_id: 'tbl-repair-p1',
      node_id: 'node-1', status: 'active'});
    world.partitionRows['tbl-repair-p1'] =
      {partition_id: 'tbl-repair-p1', replica_count: 3};
    armFenceThenClearSpread(world, parked);
    world.replicaOperations.push(
      foundingAdd('tbl-new-p1', 1, world.nowMs, {stamped: false}));
    t.equal(blockerOf(parked.resolvePrioritySpreadPlanningGateDecision())
      .state, BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
    'background spread waits on the founding ADD');
    t.equal(repairing.resolvePrioritySpreadPlanningGateDecision(), null,
      'the under-replicated partition repairs regardless');

    world.prioritySpreadBlocker = {
      requiredDistinctNodeCount: 3,
      blockedPartitions: [{partitionId: 'schema_operations-p1',
        spreadGap: 1}],
    };
    const preempted = parked.resolvePrioritySpreadPlanningGateDecision();
    t.equal(preempted?.gate,
      REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      'a priority spread blocker holds ordinary work');
    t.equal(blockerOf(preempted).blockedPartitions[0].partitionId,
      'schema_operations-p1', 'on the priority blocker itself');
  } finally {
    world.shutdown();
  }
});

test('a priority drain stamped earlier than one already seen still rearms ' +
  'the dwell', async (t) => {
  const world = createFenceWorld();
  const parked = world.createRebalancer(PARKED_ENTITY_ID);
  try {
    armFenceThenClearSpread(world, parked);
    const first = buildSourceRemovalReplace('replace-schema-first',
      'schema_operations-p1', world.nowMs);
    completeReplace(first, world.nowMs);
    world.replicaOperations.push(first);
    await world.answerOwnerCensus(parked);
    parked.resolvePrioritySpreadPlanningGateDecision();
    world.nowMs += 20_000;
    t.ok(blockerOf(parked.resolvePrioritySpreadPlanningGateDecision())
      .stableElapsedMs > 0, 'the dwell runs');
    // A fast transition whose remote clock stamped it before the first.
    const fast = buildSourceRemovalReplace('replace-schema-fast',
      'schema_operations-p1', world.nowMs - 60_000);
    completeReplace(fast, world.nowMs - 60_000);
    world.replicaOperations.push(fast);
    t.equal(blockerOf(parked.resolvePrioritySpreadPlanningGateDecision())
      .stableElapsedMs, 0, 'the earlier-stamped drain is not invisible');
  } finally {
    world.shutdown();
  }
});
