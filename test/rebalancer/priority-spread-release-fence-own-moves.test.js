/**
 * The ordinary-work release fence is defined over priority control-plane
 * placement only, and it holds background SPREAD only.
 *
 * Failure this pins (local three-node formation, tree run f4): a user table
 * founded with 2 of its 3 replicas waited 170 s for its repairing ADD behind
 * "Deferring non-system rebalancing until priority control-plane placement
 * remains stable". The durable release condition was HELD the whole time;
 * the dwell restarted on every background move the fence had itself
 * released on the seed (nodes-p1 REPLACEs ~66 s apart): the planner's
 * in-flight count rearmed it while a move ran, and the move's drain
 * watermark back-dated it when it finished. A 70 s window behind moves 66 s
 * apart never completes.
 *
 * Every test drives the rebalancer's own clock (nowFn); none sleeps.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  REBALANCE_PLANNING_GATE,
} from '../../src/rebalancer/rebalancer-planning-gate-constants.js';
import {
  BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE,
} from '../../src/rebalancer/background-priority-spread-release-tracker.js';
import {
  BACKGROUND_SPREAD_FENCE_EXEMPTION,
  classifyBackgroundSpreadFenceExemption,
} from '../../src/rebalancer/background-spread-fence-exemption.js';
import {
  FENCE_PRIORITY_PARTITION_ID,
  armFenceThenClearSpread,
  blockerOf,
  buildOperationRow,
  buildSourceRemovalReplace,
  completeReplace,
  createFenceWorld,
} from './priority-spread-release-fence-world.js';

const BACKGROUND_SPREAD_PARTITION_IDS = Object.freeze([
  'nodes-p1', 'logs-p1', 'config-p1', 'code-p1', 'indices-p1',
]);
const PARKED_ENTITY_ID = 'service_bindings-p1';
const UNDER_REPLICATED_TABLE_PARTITION_ID = 'tbl-05e790f8-p1';
const CONCENTRATED_TABLE_PARTITION_ID = 'tbl-00d3d846-p1';
const DECLARED_REPLICA_COUNT = 3;
// The lab cadence: one released background move about every 66 s, each
// running ~4.5 s, against the 70 s stability window.
const BACKGROUND_MOVE_SPACING_MS = 66_000;
const BACKGROUND_MOVE_RUN_MS = 4_500;
const PRIORITY_DRAIN_GAP_MS = 2_000;

function stateServices(world, partitionId, nodeIds) {
  for (const [index, nodeId] of nodeIds.entries()) {
    world.services.push({
      service_id: `${partitionId}-r${index + 1}`,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: nodeId,
      status: 'active',
    });
  }
  world.partitionRows[partitionId] = {
    partition_id: partitionId,
    replica_count: DECLARED_REPLICA_COUNT,
  };
}

// One background spread move on a non-priority system partition, started
// and drained between two evaluations of the parked entity.
function runBackgroundMove(world, index) {
  const partitionId =
    BACKGROUND_SPREAD_PARTITION_IDS[index % BACKGROUND_SPREAD_PARTITION_IDS.length];
  const move = buildSourceRemovalReplace(
    `replace-op-background-${index}`,
    partitionId,
    world.nowMs,
  );
  move.status = 'creating';
  move.workflow_step = 'CREATING';
  world.replicaOperations.push(move);
  return move;
}

test('the fence opens and stays open across the background moves it ' +
  'released itself', async (t) => {
  const world = createFenceWorld();
  const parked = world.createRebalancer(PARKED_ENTITY_ID);
  try {
    const stableWindowMs = parked.getBackgroundPrioritySpreadStableWindowMs();
    t.ok(
      BACKGROUND_MOVE_SPACING_MS < stableWindowMs,
      'the lab move spacing is shorter than the stability window',
    );
    armFenceThenClearSpread(world, parked);
    const firstHeldAtMs = world.nowMs;
    // The empty projection's CLEAR is the owner census's: it answers at
    // this instant, before the first held observation.
    await world.answerOwnerCensus(parked);
    t.equal(
      blockerOf(parked.resolvePrioritySpreadPlanningGateDecision()).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the dwell starts at the first held observation',
    );

    // Background moves released by another process's fence run and drain
    // throughout the window; the parked entity evaluates mid-move and
    // after each drain.
    let index = 0;
    while (world.nowMs + BACKGROUND_MOVE_SPACING_MS < firstHeldAtMs + stableWindowMs) {
      world.nowMs += BACKGROUND_MOVE_SPACING_MS - BACKGROUND_MOVE_RUN_MS;
      const move = runBackgroundMove(world, index++);
      const midMove = parked.resolvePrioritySpreadPlanningGateDecision();
      t.equal(
        blockerOf(midMove).stableElapsedMs,
        world.nowMs - firstHeldAtMs,
        `background move ${index} in flight does not rearm the dwell`,
      );
      // Any census refresh that evaluation requested answers.
      await world.settleOwnerCensus();
      world.nowMs += BACKGROUND_MOVE_RUN_MS;
      completeReplace(move, world.nowMs);
      t.equal(
        blockerOf(parked.resolvePrioritySpreadPlanningGateDecision())
          .stableElapsedMs,
        world.nowMs - firstHeldAtMs,
        `background move ${index} drained does not rearm the dwell`,
      );
    }
    world.nowMs = firstHeldAtMs + stableWindowMs;
    t.equal(
      parked.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'the fence opens one window after the condition first held',
    );
    t.equal(parked.releaseLogs.length, 1, 'the release is logged once');

    for (let after = 0; after < 3; after++) {
      world.nowMs += BACKGROUND_MOVE_RUN_MS;
      const move = runBackgroundMove(world, index++);
      t.equal(
        parked.resolvePrioritySpreadPlanningGateDecision(),
        null,
        `the fence stays open while released move ${index} runs`,
      );
      world.nowMs += BACKGROUND_MOVE_RUN_MS;
      completeReplace(move, world.nowMs);
      t.equal(
        parked.resolvePrioritySpreadPlanningGateDecision(),
        null,
        `the fence stays open after released move ${index} drains`,
      );
    }
  } finally {
    world.shutdown();
  }
});

test('an under-replicated partition plans its repair while the dwell runs ' +
  'and background moves are queued; a concentrated one still waits',
async (t) => {
  const world = createFenceWorld();
  const repairing = world.createRebalancer(UNDER_REPLICATED_TABLE_PARTITION_ID);
  const concentrated = world.createRebalancer(CONCENTRATED_TABLE_PARTITION_ID);
  try {
    stateServices(world, UNDER_REPLICATED_TABLE_PARTITION_ID,
      ['node-1', 'node-2']);
    stateServices(world, CONCENTRATED_TABLE_PARTITION_ID,
      ['node-1', 'node-1', 'node-1']);
    t.equal(
      classifyBackgroundSpreadFenceExemption(repairing),
      BACKGROUND_SPREAD_FENCE_EXEMPTION.PARTITION_DURABILITY_REPAIR,
      '2 ACTIVE replicas of a declared 3 is a durability repair',
    );
    t.equal(
      classifyBackgroundSpreadFenceExemption(concentrated),
      BACKGROUND_SPREAD_FENCE_EXEMPTION.NOT_EXEMPT,
      '3 ACTIVE replicas on one node is background spread',
    );

    armFenceThenClearSpread(world, concentrated);
    runBackgroundMove(world, 0);
    await world.answerOwnerCensus(concentrated);
    t.equal(
      repairing.resolvePrioritySpreadPlanningGateDecision(),
      null,
      'the durability repair is not held by the dwell',
    );
    const held = concentrated.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      held?.gate,
      REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      'background spread still waits for the dwell',
    );
    t.equal(
      blockerOf(held).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'on the stabilizing hold',
    );

    // Once its ADD restored the count it is ordinary spread again.
    world.services.push({
      service_id: `${UNDER_REPLICATED_TABLE_PARTITION_ID}-r3`,
      service_type: 'partition',
      partition_id: UNDER_REPLICATED_TABLE_PARTITION_ID,
      node_id: 'node-3',
      status: 'active',
    });
    t.equal(
      classifyBackgroundSpreadFenceExemption(repairing),
      BACKGROUND_SPREAD_FENCE_EXEMPTION.NOT_EXEMPT,
      'a restored replica count ends the exemption',
    );
  } finally {
    world.shutdown();
  }
});

test('priority placement still pre-empts: a priority spread gap holds even ' +
  'the repair, and a priority transition holds and rearms background spread',
async (t) => {
  const world = createFenceWorld();
  const repairing = world.createRebalancer(UNDER_REPLICATED_TABLE_PARTITION_ID);
  const background = world.createRebalancer(PARKED_ENTITY_ID);
  try {
    stateServices(world, UNDER_REPLICATED_TABLE_PARTITION_ID,
      ['node-1', 'node-2']);
    const blocked = repairing.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blocked?.gate,
      REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
      'while priority partitions are not spread the repair waits too',
    );
    world.prioritySpreadBlocker = null;
    world.nowMs += PRIORITY_DRAIN_GAP_MS;

    const stableWindowMs = background.getBackgroundPrioritySpreadStableWindowMs();
    const priorityAdd = buildOperationRow({
      operationId: 'add-schema_operations-p1-r5',
      type: 'ADD',
      partitionId: FENCE_PRIORITY_PARTITION_ID,
      status: 'syncing',
      workflowStep: 'SYNCING',
      atMs: world.nowMs,
    });
    world.replicaOperations.push(priorityAdd);
    world.nowMs += stableWindowMs + 1;
    t.equal(
      blockerOf(background.resolvePrioritySpreadPlanningGateDecision()).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.CONDITION_NOT_HELD,
      'a priority transition in flight holds background spread past the ' +
        'window',
    );

    priorityAdd.status = 'active';
    priorityAdd.workflow_step = 'ACTIVE';
    priorityAdd.completed_at = world.nowMs;
    world.nowMs += PRIORITY_DRAIN_GAP_MS;
    // The drained projection is not CLEAR by itself: the owner census
    // answers at this instant, before the first held observation.
    await world.answerOwnerCensus(background);
    const afterPriorityDrain =
      background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blockerOf(afterPriorityDrain).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the condition is observed held after the completion',
    );
    t.equal(
      blockerOf(afterPriorityDrain).stableElapsedMs,
      0,
      'its completion starts a full fresh dwell',
    );

    // A second priority transition that starts and drains between two
    // evaluations is still seen, by its retained terminal row. A
    // mid-dwell evaluation first refreshes the census (older than half the
    // window), as the rebalancer's cadence would; it does not release.
    world.nowMs += stableWindowMs - PRIORITY_DRAIN_GAP_MS;
    t.equal(
      blockerOf(await world.answerOwnerCensus(background)).state,
      BACKGROUND_PRIORITY_SPREAD_RELEASE_STATE.STABILIZING,
      'the dwell still runs before the quick transition',
    );
    const quickPriorityAdd = buildOperationRow({
      operationId: 'add-schema_operations-p1-r6',
      type: 'ADD',
      partitionId: FENCE_PRIORITY_PARTITION_ID,
      status: 'active',
      workflowStep: 'ACTIVE',
      atMs: world.nowMs,
    });
    quickPriorityAdd.completed_at = world.nowMs;
    world.replicaOperations.push(quickPriorityAdd);
    world.nowMs += PRIORITY_DRAIN_GAP_MS;
    const afterQuickDrain =
      background.resolvePrioritySpreadPlanningGateDecision();
    t.equal(
      blockerOf(afterQuickDrain).stableElapsedMs,
      0,
      'a priority transition drained between evaluations rearms the dwell',
    );
    t.equal(
      blockerOf(afterQuickDrain).clearObservedAtMs,
      world.nowMs,
      'at the observing instant, not at the remote completion time',
    );
    t.same(background.releaseLogs, [], 'background spread was never released');
  } finally {
    world.shutdown();
  }
});
