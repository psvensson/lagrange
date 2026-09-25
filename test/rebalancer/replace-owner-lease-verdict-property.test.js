/**
 * REPLACE owner-lease verdict: class properties L1/L2 (quest
 * replace-source-removal-owner, narrowed scope 2026-09-25; record
 * quest-records/replace-source-removal-owner/evidence-lease-verdict.md).
 *
 * L1: while a REPLACE's owner holds a live owner lease, no remote actor
 *     treats that owner as unavailable: no remote drain release
 *     (OWNER_UNAVAILABLE_RELEASED -> REMOVED), no remote stale-FAIL settle,
 *     and the re-entry wake does not skip the owner.
 * L2: with an expired or absent lease the verdict is exactly the
 *     routing-heuristic verdict, so the un-wedge path for a genuinely
 *     unavailable owner keeps working.
 *
 * Relational form (per caller, per phase, per observer):
 *   owner's live lease  => outcome(cell) == outcome(no lease, heuristic ready)
 *   otherwise           => outcome(cell) == outcome(no lease, same heuristic)
 * Anchors keep the relation from passing vacuously: with no lease the
 * unready heuristic still releases / stale-FAILs / skips, and the ready one
 * does not. Outcomes are read through the real drain sweep (checkTimeouts),
 * the real release and stale decisions, and the real re-entry resolver.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
} from '../../src/control-plane/priority-recovery-snapshot-contract.js';
import {
  OPERATION_DRAIN_OWNER_AVAILABILITY,
  resolveOperationDrainOwnerAvailability,
} from '../../src/rebalancer/operation-owner-availability-policy.js';
import {
  OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION,
  resolveOperationWorkflowOwnerTargetProgressReentryAction,
} from '../../src/rebalancer/operation-workflow-owner-priority-recovery-reentry.js';
import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED,
} from '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';
import {
  REPLICA_OPERATION_OWNER_LEASE_STATE,
  REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
  resolveOperationOwnerLeaseState,
} from '../../src/rebalancer/replica-operation-owner-lease.js';
import {
  buildPriorityDrainConvergedPlanningSnapshot,
  createTestCoordinator,
} from './rebalance-coordinator-stopping-reconcile-fixtures.js';
import {
  LEASE_CELL,
  LEASE_CELL_EXPECTED_STATE,
  LEASE_CELL_UPDATED_AT_MS,
  LEASE_VERDICT_NODE,
  LEASE_VERDICT_NOW_MS,
  LEASE_VERDICT_OPERATION_ID,
  LEASE_VERDICT_PARTITION_ID,
  REPLACE_PHASES,
  buildLeaseVerdictReplaceRow,
  createLeaseVerdictRemoteCoordinator,
  resolveContractOwnerAvailability,
  stampLeaseCell,
} from './replace-owner-lease-verdict-harness.js';

const {STOPPING_REPLICA_OBSERVATION_STATE} =
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED;

const HEURISTIC_VALUES = Object.freeze([true, false]);
// Remote observers: the seed (a third node, the recorded F1 case) and the
// REPLACE's own source node. Neither owns a priority REPLACE (the target does).
const REMOTE_OBSERVERS = Object.freeze([
  LEASE_VERDICT_NODE.SEED,
  LEASE_VERDICT_NODE.SOURCE,
]);
const LEASE_CELLS = Object.freeze(Object.values(LEASE_CELL));

function outcomeKey(outcome) {
  return JSON.stringify(outcome);
}

function describeCell(cell) {
  return [
    cell.step,
    cell.observerNodeId,
    cell.leaseCell,
    cell.ownerRoutingReady ? 'heuristic_ready' : 'heuristic_unready',
    cell.sourceObservation?.state || 'source_present',
  ].join('/');
}

function contractForCell(cell) {
  const row = buildLeaseVerdictReplaceRow(cell);
  return resolveContractOwnerAvailability({
    ownerNodeId: LEASE_VERDICT_NODE.OWNER,
    nodeId: cell.observerNodeId,
    operation: {ownerLeaseExpiresAt: row.lease_expires_at},
    nowMs: LEASE_VERDICT_NOW_MS,
    ready: cell.ownerRoutingReady,
  });
}

// ---------------------------------------------------------------------------
// 1. Verdict property over the full input universe.
// ---------------------------------------------------------------------------

const RECORDED_OWNERS = Object.freeze([
  LEASE_VERDICT_NODE.OWNER,
  LEASE_VERDICT_NODE.SEED,
  null,
]);
// Lease holder attribution: none (production rows), the recorded owner, a
// third node, and the observing node itself.
const LEASE_HOLDERS = Object.freeze([
  null,
  LEASE_VERDICT_NODE.OWNER,
  LEASE_VERDICT_NODE.OTHER,
  LEASE_VERDICT_NODE.SEED,
]);
const OPERATION_SHAPES = Object.freeze(['decoded', 'raw_row']);

function buildVerdictOperation(leaseCell, holderNodeId, shape) {
  // The expiry follows the lease record's stamping rule; attribution of the
  // holder is a separate field the lease record reads (ownerNodeId).
  const row = stampLeaseCell({}, leaseCell, LEASE_VERDICT_NODE.OWNER);
  if (shape === 'raw_row') {
    return {
      updated_at: row.updated_at,
      lease_expires_at: row.lease_expires_at,
      owner_node_id: holderNodeId,
    };
  }
  return {
    updatedAt: row.updated_at,
    ownerLeaseExpiresAt: row.lease_expires_at,
    ownerNodeId: holderNodeId,
  };
}

function enumerateVerdictCells() {
  const cells = [];
  for (const recordedOwner of RECORDED_OWNERS) {
    for (const leaseCell of LEASE_CELLS) {
      const holders = leaseCell === LEASE_CELL.UNFENCED ?
        [null] :
        LEASE_HOLDERS;
      for (const holder of holders) {
        for (const shape of OPERATION_SHAPES) {
          for (const ready of HEURISTIC_VALUES) {
            cells.push({recordedOwner, leaseCell, holder, shape, ready});
          }
        }
      }
    }
  }
  return cells;
}

function resolveVerdictUnderTest(cell, operation) {
  return resolveOperationDrainOwnerAvailability({
    ownerNodeId: cell.recordedOwner,
    nodeId: LEASE_VERDICT_NODE.SEED,
    operation,
    nowMs: LEASE_VERDICT_NOW_MS,
    isOwnerRoutingReady: () => cell.ready,
  });
}

test('lease verdict: every (owner, lease, holder, heuristic) cell matches ' +
  'the contract; a non-owner lease is today\'s heuristic verdict', (t) => {
  const cells = enumerateVerdictCells();
  const mismatches = [];
  const leaseStatesCovered = new Set();
  const verdictStatesCovered = new Set();
  for (const cell of cells) {
    const operation =
      buildVerdictOperation(cell.leaseCell, cell.holder, cell.shape);
    const lease =
      resolveOperationOwnerLeaseState(operation, LEASE_VERDICT_NOW_MS);
    leaseStatesCovered.add(lease.state);
    if (lease.state !== LEASE_CELL_EXPECTED_STATE.get(cell.leaseCell)) {
      mismatches.push({cell, reason: 'cell_not_in_its_lease_state', lease});
      continue;
    }
    const expected = resolveContractOwnerAvailability({
      ownerNodeId: cell.recordedOwner,
      nodeId: LEASE_VERDICT_NODE.SEED,
      operation,
      nowMs: LEASE_VERDICT_NOW_MS,
      ready: cell.ready,
    });
    verdictStatesCovered.add(expected.state);
    const actual = resolveVerdictUnderTest(cell, operation);
    if (
      actual.unavailable !== expected.unavailable ||
      actual.state !== expected.state
    ) {
      mismatches.push({
        cell,
        expected: {state: expected.state, unavailable: expected.unavailable},
        actual: {state: actual.state, unavailable: actual.unavailable},
      });
    }
    const remoteOwner = cell.recordedOwner === LEASE_VERDICT_NODE.OWNER;
    if (remoteOwner && expected.ownersLiveLease !== true) {
      // L2 differential: exactly the verdict with no lease at all.
      const heuristicOnly = resolveVerdictUnderTest(cell, {});
      if (
        actual.unavailable !== heuristicOnly.unavailable ||
        actual.unavailable !== (cell.ready !== true)
      ) {
        mismatches.push({cell, reason: 'l2_not_heuristic_verdict'});
      }
    }
  }
  t.same(mismatches, [], 'no verdict cell departs from the contract');
  t.equal(
    cells.length,
    RECORDED_OWNERS.length * HEURISTIC_VALUES.length *
      OPERATION_SHAPES.length *
      (1 + (LEASE_CELLS.length - 1) * LEASE_HOLDERS.length),
    'the universe is the full cross product',
  );
  t.same(
    [...leaseStatesCovered].sort(),
    Object.values(REPLICA_OPERATION_OWNER_LEASE_STATE).sort(),
    'the cells span every lease state the lease record defines',
  );
  t.same(
    [...verdictStatesCovered].sort(),
    Object.values(OPERATION_DRAIN_OWNER_AVAILABILITY).sort(),
    'every verdict state the contract names is classified by the oracle',
  );
  t.end();
});

test('lease verdict anchors: a live owner lease is available even with an ' +
  'unready heuristic; an expired one with an unready heuristic is not', (t) => {
  const liveOwnerLease = buildVerdictOperation(
    LEASE_CELL.LIVE_AT_EDGE,
    null,
    'decoded',
  );
  const expiredLease = buildVerdictOperation(
    LEASE_CELL.EXPIRED_AT_BOUNDARY,
    null,
    'decoded',
  );
  const unready = {recordedOwner: LEASE_VERDICT_NODE.OWNER, ready: false};
  t.equal(
    resolveVerdictUnderTest(unready, liveOwnerLease).unavailable,
    false,
    'L1 anchor: live owner lease (expiry = now + 1) fences the heuristic',
  );
  t.equal(
    resolveVerdictUnderTest(unready, expiredLease).unavailable,
    true,
    'L2 anchor: expiry == now is expired; the unready heuristic stands',
  );
  t.end();
});

// ---------------------------------------------------------------------------
// 2. Caller properties through the real drain sweep and re-entry resolver.
// ---------------------------------------------------------------------------

async function readPersistedOutcome(coordinator, deliveries) {
  const operation = await coordinator.getOperation(LEASE_VERDICT_OPERATION_ID);
  return {
    workflowStep: operation?.workflowStep || null,
    status: operation?.status || null,
    errorMessage: operation?.errorMessage || null,
    terminal: coordinator.repository.isOperationTerminal(operation),
    deliveries: [...deliveries],
  };
}

async function runDrainSweepCell(cell) {
  const {coordinator, deliveries} = createLeaseVerdictRemoteCoordinator(cell);
  try {
    await coordinator.workflowOwner.checkTimeouts();
    return await readPersistedOutcome(coordinator, deliveries);
  } finally {
    await coordinator.shutdown();
  }
}

async function runReentryCell(cell) {
  const {coordinator} = createLeaseVerdictRemoteCoordinator(cell);
  const owner = coordinator.workflowOwner;
  const wakes = [];
  // Effect sink only: the wake message itself is not under test here.
  owner.wakeCoordinatorCreatedRemoteOwner = async (operation) => {
    wakes.push(operation?.operationId || null);
    return true;
  };
  try {
    const operation = await coordinator.getOperation(LEASE_VERDICT_OPERATION_ID);
    const builtSnapshot =
      await owner.buildPriorityRecoveryDecisionSnapshotForOperations(
        LEASE_VERDICT_PARTITION_ID,
        [operation],
        buildPriorityDrainConvergedPlanningSnapshot(LEASE_VERDICT_PARTITION_ID),
      );
    const builderWoke = wakes.length > 0;
    wakes.length = 0;
    // SYNCING is admitted only with the target observed ACTIVE; the harness
    // snapshot carries no target service rows, so that observation is set
    // from the snapshot contract's own enumeration.
    const snapshot = cell.step === WORKFLOW_STEP.SYNCING ? {
      ...builtSnapshot,
      coordinator: {
        ...builtSnapshot.coordinator,
        operation: {
          ...builtSnapshot.coordinator?.operation,
          targetVisibilityState:
            PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
        },
      },
    } : builtSnapshot;
    const action = resolveOperationWorkflowOwnerTargetProgressReentryAction(
      owner,
      snapshot,
      operation,
    );
    owner.schedulePriorityRecoveryTargetProgressReentry(snapshot, [operation]);
    return {
      action,
      woken: wakes.length > 0,
      builderWoke: cell.step === WORKFLOW_STEP.SYNCING ? null : builderWoke,
    };
  } finally {
    await coordinator.shutdown();
  }
}

async function collectCallerOutcomes(baseCells, runCell) {
  const outcomes = new Map();
  for (const base of baseCells) {
    for (const leaseCell of LEASE_CELLS) {
      for (const ownerRoutingReady of HEURISTIC_VALUES) {
        const cell = {...base, leaseCell, ownerRoutingReady};
        outcomes.set(describeCell(cell), {cell, outcome: await runCell(cell)});
      }
    }
  }
  return outcomes;
}

function referenceOutcome(outcomes, cell, ownerRoutingReady) {
  return outcomes.get(describeCell({
    ...cell,
    leaseCell: LEASE_CELL.UNFENCED,
    ownerRoutingReady,
  })).outcome;
}

/**
 * Check L1/L2 relations plus the anchors over one caller's outcome grid.
 * @param {Map} outcomes
 * @param {Object} anchors - {isUnwedged(outcome), isOwnerAlive(outcome)}
 * @return {Array} violations
 */
function checkCallerRelations(outcomes, anchors) {
  const violations = [];
  for (const [label, {cell, outcome}] of outcomes) {
    const contract = contractForCell(cell);
    const expectedLike = contract.ownersLiveLease ?
      referenceOutcome(outcomes, cell, true) :
      referenceOutcome(outcomes, cell, cell.ownerRoutingReady);
    if (outcomeKey(outcome) !== outcomeKey(expectedLike)) {
      violations.push({
        cell: label,
        property: contract.ownersLiveLease ? 'L1' : 'L2',
        outcome,
        expectedLike,
      });
    }
    if (contract.ownersLiveLease && anchors.isUnwedged(outcome)) {
      violations.push({cell: label, property: 'L1_direct', outcome});
    }
    if (cell.leaseCell !== LEASE_CELL.UNFENCED) {
      continue;
    }
    if (!cell.ownerRoutingReady && !anchors.isUnwedged(outcome)) {
      violations.push({cell: label, property: 'anchor_unwedge', outcome});
    }
    if (cell.ownerRoutingReady && !anchors.isOwnerAlive(outcome)) {
      violations.push({cell: label, property: 'anchor_alive', outcome});
    }
  }
  return violations;
}

function buildPhaseObserverCells(extra = () => [{}]) {
  const cells = [];
  for (const step of REPLACE_PHASES) {
    for (const observerNodeId of REMOTE_OBSERVERS) {
      for (const additions of extra(step)) {
        cells.push({step, observerNodeId, ...additions});
      }
    }
  }
  return cells;
}

test('release caller: a live owner lease never releases a REPLACE with its ' +
  'source present; an expired or absent one releases exactly as today',
async (t) => {
  const outcomes = await collectCallerOutcomes(
    buildPhaseObserverCells(),
    runDrainSweepCell,
  );
  const violations = checkCallerRelations(outcomes, {
    isUnwedged: (outcome) => outcome.workflowStep === WORKFLOW_STEP.REMOVED,
    isOwnerAlive: (outcome) => outcome.terminal === false,
  });
  t.same(violations, [], 'release relations and anchors hold');
  t.equal(
    outcomes.size,
    REPLACE_PHASES.length * REMOTE_OBSERVERS.length * LEASE_CELLS.length *
      HEURISTIC_VALUES.length,
    'every release cell ran',
  );
});

// Stale-FAIL needs a stale step. Its budget comes from the owner's own step
// timeout authority; the lease stays anchored to updatedAt, which a
// non-step re-persist (the dispatch retry loop) keeps recent.
async function readStepBudgets() {
  const coordinator = createTestCoordinator({nodeId: LEASE_VERDICT_NODE.SEED});
  try {
    return new Map(REPLACE_PHASES.map((step) => [
      step,
      Number(coordinator.workflowOwner.getTimeoutForStep(step, {
        partitionId: LEASE_VERDICT_PARTITION_ID,
        workflowStep: step,
      })),
    ]));
  } finally {
    await coordinator.shutdown();
  }
}

// Source observations that leave no retirement evidence (the stale route):
// unavailable at every phase, absent where absence is not retirement.
// STOPPING + absent is retirement evidence; it is kept as a control whose
// outcome must not depend on the verdict at all.
const STALE_SOURCE_OBSERVATIONS = Object.freeze([
  Object.freeze({state: STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE}),
  Object.freeze({state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT}),
]);

test('stale-FAIL caller: a live owner lease never stale-FAILs a REPLACE; ' +
  'an expired or absent one settles exactly as today', async (t) => {
  const budgets = await readStepBudgets();
  const timingViolations = [];
  for (const [step, budgetMs] of budgets) {
    // Timing arithmetic: every lease cell must be reachable at a stale step,
    // i.e. updatedAt >= step entry. Holds iff budget >= lease TTL.
    if (!(budgetMs >= REPLICA_OPERATION_OWNER_LEASE_TTL_MS)) {
      timingViolations.push({step, budgetMs});
    }
  }
  t.same(timingViolations, [], 'every step budget >= the lease TTL');
  const controlCells = [];
  const staleCells = buildPhaseObserverCells((step) =>
    STALE_SOURCE_OBSERVATIONS.map((sourceObservation) => ({
      sourceObservation,
      stepEnteredAtMs: LEASE_VERDICT_NOW_MS - budgets.get(step) - 1,
    }))).filter((cell) => {
    const retirementEvidence = cell.step === WORKFLOW_STEP.STOPPING &&
      cell.sourceObservation.state === STOPPING_REPLICA_OBSERVATION_STATE.ABSENT;
    if (retirementEvidence) {
      controlCells.push(cell);
    }
    return !retirementEvidence;
  });
  const outcomes = await collectCallerOutcomes(staleCells, runDrainSweepCell);
  const violations = checkCallerRelations(outcomes, {
    isUnwedged: (outcome) => outcome.workflowStep === WORKFLOW_STEP.FAILED,
    isOwnerAlive: (outcome) => outcome.terminal === false,
  });
  t.same(violations, [], 'stale-FAIL relations and anchors hold');
  for (const [, {cell}] of outcomes) {
    const updatedAt = LEASE_CELL_UPDATED_AT_MS.get(cell.leaseCell);
    if (updatedAt < cell.stepEnteredAtMs) {
      timingViolations.push({cell: describeCell(cell), updatedAt});
    }
  }
  t.same(timingViolations, [], 'every stale cell is physically consistent');
  const controlOutcomes =
    await collectCallerOutcomes(controlCells, runDrainSweepCell);
  const controlKeys = new Set(
    [...controlOutcomes.values()].map(({outcome}) =>
      outcomeKey({...outcome, deliveries: []})),
  );
  t.equal(
    controlKeys.size,
    1,
    'STOPPING with retirement evidence settles the same for every verdict',
  );
});

test('re-entry caller: a live owner lease is never skipped as no longer ' +
  'repair-eligible; an expired or absent one routes exactly as today',
async (t) => {
  const outcomes = await collectCallerOutcomes(
    buildPhaseObserverCells(),
    runReentryCell,
  );
  const violations = checkCallerRelations(outcomes, {
    isUnwedged: (outcome) =>
      outcome.action ===
        OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION.SKIP &&
      outcome.woken === false,
    isOwnerAlive: (outcome) =>
      outcome.action ===
        OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION
          .WAKE_REMOTE_OWNER &&
      outcome.woken === true,
  });
  t.same(violations, [], 're-entry relations and anchors hold');
});
