/**
 * REPLACE owner-lease verdict: class properties L1/L2 (quest
 * replace-source-removal-owner, narrowed scope 2026-09-25; record
 * quest-records/replace-source-removal-owner/evidence-lease-verdict.md).
 *
 * L1: while an operation's owner holds a live owner lease, no remote actor
 *     treats that owner as unavailable: no remote drain release
 *     (OWNER_UNAVAILABLE_RELEASED -> REMOVED), no remote stale-FAIL settle,
 *     and the re-entry wake does not skip the owner.
 * L2: with an expired or absent lease the verdict is exactly the
 *     routing-heuristic verdict, so the un-wedge path for a genuinely
 *     unavailable owner keeps working.
 *
 * Relational form (per entry point, per caller, per operation type x
 * workflow step x observer x source observation):
 *   owner's live lease  => outcome(cell) == outcome(no lease, heuristic ready)
 *   otherwise           => outcome(cell) == outcome(no lease, same heuristic)
 * The (type, step) universe is the cross product of the OperationType and
 * WORKFLOW_STEP enums, filtered only by the per-type workflow authority.
 * Coverage anchors keep the relation from passing vacuously: every
 * (type, step) the drain's own admission sets name must show the verdict
 * deciding the outcome (the un-wedge with no lease and an unready owner,
 * none with a ready one). Outcomes are read through the real entry points:
 * the periodic sweep (checkTimeouts), the dispatch-pending drain
 * (reconcilePriorityRecoveryDispatchPendingDrain), and the re-entry
 * resolver and scheduler.
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
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_REPLACE_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS,
} from '../../src/rebalancer/replica-operation-step-policy.js';
import {
  OperationType,
  ReplicaStatus,
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
  LEASE_VERDICT_SOURCE_UNAVAILABLE,
  buildLeaseVerdictOperationRow,
  createLeaseVerdictRemoteCoordinator,
  enumerateOperationTypeSteps,
  resolveContractOwnerAvailability,
  stampLeaseCell,
} from './replace-owner-lease-verdict-harness.js';

const {
  OPERATION_LIFECYCLE_ACTION,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OPERATION_TYPES,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_TARGET_OBSERVED_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE,
} = OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED;

const HEURISTIC_VALUES = Object.freeze([true, false]);
const LEASE_CELLS = Object.freeze(Object.values(LEASE_CELL));
const TYPE_STEPS = enumerateOperationTypeSteps();

function outcomeKey(outcome) {
  return JSON.stringify(outcome);
}

function typeStepKey(type, step) {
  return `${type}/${step}`;
}

function describeCell(cell) {
  return [
    cell.entry,
    cell.type,
    cell.step,
    cell.observerNodeId,
    cell.sourceObservation ?? 'source_absent',
    cell.targetStatus === null ? 'target_absent' : 'target_present',
    cell.targetVisibility || 'target_as_built',
    cell.leaseCell,
    cell.ownerRoutingReady ? 'heuristic_ready' : 'heuristic_unready',
  ].join('/');
}

function contractForCell(cell) {
  const row = buildLeaseVerdictOperationRow(cell);
  return resolveContractOwnerAvailability({
    ownerNodeId: cell.recordedOwnerNodeId,
    nodeId: cell.observerNodeId,
    operation: {ownerLeaseExpiresAt: row.lease_expires_at},
    nowMs: LEASE_VERDICT_NOW_MS,
    ready: cell.ownerRoutingReady,
  });
}

// ---------------------------------------------------------------------------
// 1. Verdict property over the full input universe.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. Verdict property over the full input universe.
// ---------------------------------------------------------------------------

const RECORDED_OWNERS = Object.freeze([
  LEASE_VERDICT_NODE.TARGET,
  LEASE_VERDICT_NODE.SEED,
  null,
]);
// Lease holder attribution: none (production rows), the recorded owner, a
// third node, and the observing node itself.
const LEASE_HOLDERS = Object.freeze([
  null,
  LEASE_VERDICT_NODE.TARGET,
  LEASE_VERDICT_NODE.OTHER,
  LEASE_VERDICT_NODE.SEED,
]);
const OPERATION_SHAPES = Object.freeze(['decoded', 'raw_row']);

function buildVerdictOperation(leaseCell, holderNodeId, shape) {
  // The expiry follows the lease record's stamping rule; attribution of the
  // holder is a separate field the lease record reads (ownerNodeId).
  const row = stampLeaseCell({}, leaseCell, LEASE_VERDICT_NODE.TARGET);
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
    const remoteOwner = cell.recordedOwner === LEASE_VERDICT_NODE.TARGET;
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
  const unready = {recordedOwner: LEASE_VERDICT_NODE.TARGET, ready: false};
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

// ---------------------------------------------------------------------------
// 2. Caller properties through the real entry points.
// ---------------------------------------------------------------------------

/**
 * Per-row authorities, read from the owners that hold them: the recorded
 * owner (repository owner resolution) and the step budget (the owner's step
 * timeout authority).
 * @return {Promise<Map>}
 */
async function readRowAuthorities() {
  const coordinator = createTestCoordinator({nodeId: LEASE_VERDICT_NODE.SEED});
  try {
    const authorities = new Map();
    for (const {type, step} of TYPE_STEPS.rows) {
      const row = buildLeaseVerdictOperationRow({
        type,
        step,
        leaseCell: LEASE_CELL.UNFENCED,
      });
      authorities.set(typeStepKey(type, step), {
        recordedOwnerNodeId:
          coordinator.repository.resolveOperationOwnerNodeId(row),
        budgetMs: Number(coordinator.workflowOwner.getTimeoutForStep(step, {
          type,
          partitionId: LEASE_VERDICT_PARTITION_ID,
          workflowStep: step,
        })),
      });
    }
    return authorities;
  } finally {
    await coordinator.shutdown();
  }
}

// Remote observers: a third node (the seed, the recorded F1 case) and the
// row's other named node, whichever of source/target is not the owner.
function remoteObserversFor(recordedOwnerNodeId) {
  return [
    LEASE_VERDICT_NODE.SEED,
    recordedOwnerNodeId === LEASE_VERDICT_NODE.SOURCE ?
      LEASE_VERDICT_NODE.TARGET :
      LEASE_VERDICT_NODE.SOURCE,
  ];
}

// Present sources (the release route) and sources that leave no retirement
// evidence (the stale route), from the replica-status and observation enums.
const PRESENT_SOURCE_OBSERVATIONS = Object.freeze([
  ReplicaStatus.ACTIVE,
  ReplicaStatus.REMOVING,
]);
const NO_RETIREMENT_SOURCE_OBSERVATIONS = Object.freeze([
  LEASE_VERDICT_SOURCE_UNAVAILABLE,
  null,
]);

function crossProduct(axes) {
  return Object.entries(axes).reduce(
    (partials, [name, values]) => partials.flatMap((partial) =>
      values.map((value) => ({...partial, [name]: value}))),
    [{}],
  );
}

function buildCallerBaseCells(authorities, entry, options) {
  return TYPE_STEPS.rows.flatMap(({type, step}) => {
    const {recordedOwnerNodeId, budgetMs} =
      authorities.get(typeStepKey(type, step));
    return crossProduct({
      observerNodeId: remoteObserversFor(recordedOwnerNodeId),
      sourceObservation: options.sourceObservations,
      targetStatus: options.targetStatuses,
      targetVisibility: options.targetVisibilities || [null],
    }).map((axes) => ({
      entry,
      type,
      step,
      recordedOwnerNodeId,
      ...axes,
      stepEnteredAtMs: options.stale ?
        LEASE_VERDICT_NOW_MS - budgetMs - 1 :
        undefined,
    }));
  });
}

function summarizeDrainDecision(drainSnapshot) {
  return {
    state: drainSnapshot?.state || null,
    action: drainSnapshot?.action || null,
    ownerAction: drainSnapshot?.ownerAction || null,
  };
}

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

// Entry 1: the periodic drain sweep.
async function runDrainSweepCell(cell) {
  const {coordinator, deliveries} = createLeaseVerdictRemoteCoordinator(cell);
  const owner = coordinator.workflowOwner;
  try {
    const operation = await coordinator.getOperation(LEASE_VERDICT_OPERATION_ID);
    // The decision the sweep takes first (checkTimeouts builds the same
    // drain snapshot before it wakes, skips or enters the lifecycle).
    const decision = summarizeDrainDecision(
      await owner.buildPriorityRecoveryOperationDrainSnapshot(operation),
    );
    await owner.checkTimeouts();
    return {decision, ...await readPersistedOutcome(coordinator, deliveries)};
  } finally {
    await coordinator.shutdown();
  }
}

function buildDecisionSnapshot(owner, operation) {
  return owner.buildPriorityRecoveryDecisionSnapshotForOperations(
    LEASE_VERDICT_PARTITION_ID,
    [operation],
    buildPriorityDrainConvergedPlanningSnapshot(LEASE_VERDICT_PARTITION_ID),
  );
}

// Entry 2: the dispatch-pending drain, driven with the decision snapshot the
// production builder produces for the same operation.
async function runDispatchPendingCell(cell) {
  const {coordinator, deliveries} = createLeaseVerdictRemoteCoordinator(cell);
  const owner = coordinator.workflowOwner;
  try {
    const operation = await coordinator.getOperation(LEASE_VERDICT_OPERATION_ID);
    const decisionSnapshot = await buildDecisionSnapshot(owner, operation);
    const decision = summarizeDrainDecision(
      await owner.buildPriorityRecoveryDispatchPendingDrainSnapshot(
        operation,
        decisionSnapshot,
      ),
    );
    await owner.reconcilePriorityRecoveryDispatchPendingDrain(
      operation,
      decisionSnapshot,
    );
    return {decision, ...await readPersistedOutcome(coordinator, deliveries)};
  } finally {
    await coordinator.shutdown();
  }
}

function overlayTargetVisibility(snapshot, targetVisibility) {
  if (!targetVisibility) {
    return snapshot;
  }
  return {
    ...snapshot,
    coordinator: {
      ...snapshot?.coordinator,
      operation: {
        ...snapshot?.coordinator?.operation,
        targetVisibilityState: targetVisibility,
      },
    },
  };
}

// Entry 3: the re-entry resolver and scheduler. The wake message itself is
// observed at its sink.
async function runReentryCell(cell) {
  const {coordinator} = createLeaseVerdictRemoteCoordinator(cell);
  const owner = coordinator.workflowOwner;
  const wakes = [];
  owner.wakeCoordinatorCreatedRemoteOwner = async (operation) => {
    wakes.push(operation?.operationId || null);
    return true;
  };
  try {
    const operation = await coordinator.getOperation(LEASE_VERDICT_OPERATION_ID);
    const builtSnapshot = await buildDecisionSnapshot(owner, operation);
    const builderWoke = wakes.length > 0;
    wakes.length = 0;
    const snapshot =
      overlayTargetVisibility(builtSnapshot, cell.targetVisibility);
    const action = resolveOperationWorkflowOwnerTargetProgressReentryAction(
      owner,
      snapshot,
      operation,
    );
    owner.schedulePriorityRecoveryTargetProgressReentry(snapshot, [operation]);
    return {action, woken: wakes.length > 0, builderWoke};
  } finally {
    await coordinator.shutdown();
  }
}

async function collectCallerOutcomes(baseCells, runCell) {
  const outcomes = new Map();
  const leaseAxes = crossProduct({
    leaseCell: LEASE_CELLS,
    ownerRoutingReady: HEURISTIC_VALUES,
  });
  for (const base of baseCells) {
    for (const leaseAxis of leaseAxes) {
      const cell = {...base, ...leaseAxis};
      outcomes.set(describeCell(cell), {cell, outcome: await runCell(cell)});
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

// With no lease, an unready owner reaches the un-wedge and a ready one does
// not: the verdict decides this cell's group.
function isDecidedByVerdict(outcomes, cell, anchors) {
  return anchors.isUnwedged(referenceOutcome(outcomes, cell, false)) &&
    anchors.isOwnerAlive(referenceOutcome(outcomes, cell, true));
}

/**
 * L1/L2 relations over one caller's outcome grid. `anchors.isUnwedged` names
 * the route's remote settlement; where the verdict decides it, a live owner
 * lease must never reach it.
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
    if (
      contract.ownersLiveLease &&
      isDecidedByVerdict(outcomes, cell, anchors) &&
      anchors.isUnwedged(outcome)
    ) {
      violations.push({cell: label, property: 'L1_direct', outcome});
    }
  }
  return violations;
}

/**
 * The (type, step) pairs where the verdict decides the route: with no lease
 * an unready owner reaches the un-wedge and a ready owner does not.
 * @param {Map} outcomes
 * @param {Object} anchors - {isUnwedged(outcome), isOwnerAlive(outcome)}
 * @return {Set<string>}
 */
function collectVerdictDecided(outcomes, anchors) {
  const decided = new Set();
  for (const [, {cell}] of outcomes) {
    if (isDecidedByVerdict(outcomes, cell, anchors)) {
      decided.add(typeStepKey(cell.type, cell.step));
    }
  }
  return decided;
}

function expectedTypeSteps(types, steps) {
  const expected = [];
  for (const {type, step, terminal} of TYPE_STEPS.rows) {
    if (!terminal && types.has(type) && steps.has(step)) {
      expected.push(typeStepKey(type, step));
    }
  }
  return expected.sort();
}

// The drain's own admission sets name where each route may act.
const RELEASE_TYPE_STEPS = expectedTypeSteps(
  new Set([OperationType.REPLACE]),
  new Set([
    ...PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_REPLACE_WORKFLOW_STEPS,
    ...PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_TARGET_OBSERVED_WORKFLOW_STEPS,
  ]),
);
const STALE_TYPE_STEPS = expectedTypeSteps(
  PRIORITY_RECOVERY_OPERATION_DRAIN_OPERATION_TYPES,
  PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS,
);

// Decision anchors: the drain decision each entry takes.
const RELEASE_DECISION = Object.freeze({
  isUnwedged: (outcome) => outcome.decision.state ===
    PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.OWNER_UNAVAILABLE_RELEASED,
  isOwnerAlive: (outcome) => outcome.decision.state !==
    PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.OWNER_UNAVAILABLE_RELEASED &&
    outcome.terminal === false,
});
function isStaleRemoteSettle(outcome) {
  return outcome.decision.action ===
      OPERATION_LIFECYCLE_ACTION.FAIL_PRIORITY_RECOVERY_DRAIN_STALE &&
    outcome.decision.ownerAction ===
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.ALLOW_RECONCILE;
}
const STALE_DECISION = Object.freeze({
  isUnwedged: isStaleRemoteSettle,
  isOwnerAlive: (outcome) => !isStaleRemoteSettle(outcome) &&
    outcome.terminal === false,
});
// Effect anchors: the durable terminal the settlement writes.
const RELEASE_EFFECT = Object.freeze({
  isUnwedged: (outcome) => outcome.terminal === true &&
    outcome.workflowStep === WORKFLOW_STEP.REMOVED,
  isOwnerAlive: (outcome) => outcome.terminal === false,
});
const STALE_EFFECT = Object.freeze({
  isUnwedged: (outcome) => outcome.terminal === true &&
    outcome.workflowStep === WORKFLOW_STEP.FAILED,
  isOwnerAlive: (outcome) => outcome.terminal === false,
});

function missingCoverage(expected, verdictDecided) {
  return expected.filter((key) => !verdictDecided.has(key));
}

test('enumeration closure: the caller grids range over every operation ' +
  'type and workflow step; the drain\'s admission sets are inside them',
(t) => {
  const covered = new Set(TYPE_STEPS.rows.map(({type, step}) =>
    typeStepKey(type, step)));
  t.same(
    [...PRIORITY_RECOVERY_OPERATION_DRAIN_OPERATION_TYPES].filter((type) =>
      !Object.values(OperationType).includes(type)),
    [],
    'every drain operation type is an OperationType member',
  );
  t.same(
    [...STALE_TYPE_STEPS, ...RELEASE_TYPE_STEPS].filter((key) =>
      !covered.has(key)),
    [],
    'every admitted (type, step) is a row of the grid',
  );
  t.ok(STALE_TYPE_STEPS.length > 0 && RELEASE_TYPE_STEPS.length > 0,
    'both admission sets are non-empty');
  t.end();
});

const DRAIN_ENTRIES = Object.freeze([
  {name: 'sweep', runCell: runDrainSweepCell},
  {name: 'dispatch_pending', runCell: runDispatchPendingCell},
]);

function checkStaleTiming(authorities, outcomes) {
  const timingViolations = [];
  for (const [key, {budgetMs}] of authorities) {
    // Timing arithmetic: every lease cell is reachable on a stale step
    // (updatedAt >= step entry) iff the step budget >= the lease TTL.
    if (!(budgetMs >= REPLICA_OPERATION_OWNER_LEASE_TTL_MS)) {
      timingViolations.push({key, budgetMs});
    }
  }
  for (const [label, {cell}] of outcomes) {
    if (LEASE_CELL_UPDATED_AT_MS.get(cell.leaseCell) < cell.stepEnteredAtMs) {
      timingViolations.push({cell: label});
    }
  }
  return timingViolations;
}

const DRAIN_ROUTES = Object.freeze([
  {
    name: 'release',
    grid: {
      sourceObservations: PRESENT_SOURCE_OBSERVATIONS,
      targetStatuses: [ReplicaStatus.ACTIVE],
      stale: false,
    },
    decision: RELEASE_DECISION,
    effect: RELEASE_EFFECT,
    admitted: RELEASE_TYPE_STEPS,
  },
  {
    name: 'stale-FAIL',
    grid: {
      sourceObservations: NO_RETIREMENT_SOURCE_OBSERVATIONS,
      targetStatuses: [ReplicaStatus.ACTIVE, null],
      stale: true,
    },
    decision: STALE_DECISION,
    effect: STALE_EFFECT,
    admitted: STALE_TYPE_STEPS,
  },
]);

// The durable settlement (REMOVED / FAILED written) each route reaches,
// accumulated over both entry points; tap runs top-level tests in order.
const EFFECT_DECIDED_BY_ROUTE = new Map(
  DRAIN_ROUTES.map((route) => [route.name, new Set()]),
);

for (const entry of DRAIN_ENTRIES) {
  for (const route of DRAIN_ROUTES) {
    test(`${route.name} caller (${entry.name} entry): a live owner lease ` +
      'never settles the operation remotely; an expired or absent one ' +
      'settles exactly as today', async (t) => {
      const authorities = await readRowAuthorities();
      const outcomes = await collectCallerOutcomes(
        buildCallerBaseCells(authorities, entry.name, route.grid),
        entry.runCell,
      );
      t.same(
        checkCallerRelations(outcomes, route.decision),
        [],
        'decision and effect relations hold on every cell',
      );
      t.same(
        checkCallerRelations(outcomes, route.effect),
        [],
        'no live owner lease reaches the durable settlement',
      );
      t.same(
        missingCoverage(
          route.admitted,
          collectVerdictDecided(outcomes, route.decision),
        ),
        [],
        'the verdict decides the route at every admitted (type, step)',
      );
      const effectDecided = collectVerdictDecided(outcomes, route.effect);
      for (const key of effectDecided) {
        EFFECT_DECIDED_BY_ROUTE.get(route.name).add(key);
      }
      t.comment(`${route.name}/${entry.name} durable settlement decided by ` +
        `the verdict: ${[...effectDecided].sort().join(' ')}`);
      if (route.grid.stale) {
        t.same(
          checkStaleTiming(authorities, outcomes),
          [],
          'every step budget >= the lease TTL; every stale cell is consistent',
        );
      }
    });
  }
}

test('entry-point union: the durable settlement of each route is ' +
  'decided by the verdict at every admitted (type, step)', (t) => {
  for (const route of DRAIN_ROUTES) {
    t.same(
      missingCoverage(route.admitted, EFFECT_DECIDED_BY_ROUTE.get(route.name)),
      [],
      `${route.name}: some entry point writes the settlement, verdict-decided`,
    );
  }
  t.end();
});

test('re-entry caller: a live owner lease is never skipped as no longer ' +
  'repair-eligible; an expired or absent one routes exactly as today',
async (t) => {
  const authorities = await readRowAuthorities();
  const outcomes = await collectCallerOutcomes(
    buildCallerBaseCells(authorities, 'reentry', {
      sourceObservations: [ReplicaStatus.ACTIVE],
      targetStatuses: [ReplicaStatus.ACTIVE],
      targetVisibilities: [
        null,
        PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
      ],
      stale: false,
    }),
    runReentryCell,
  );
  const anchors = {
    isUnwedged: (outcome) =>
      outcome.action ===
        OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION.SKIP &&
      outcome.woken === false,
    isOwnerAlive: (outcome) =>
      outcome.action ===
        OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION
          .WAKE_REMOTE_OWNER &&
      outcome.woken === true,
  };
  t.same(
    checkCallerRelations(outcomes, anchors),
    [],
    're-entry relations hold on every cell',
  );
  const decided = collectVerdictDecided(outcomes, anchors);
  t.same(
    missingCoverage(RELEASE_TYPE_STEPS, decided),
    [],
    'the verdict decides the wake at every release-admitted (type, step)',
  );
  t.comment(`re-entry decided by the verdict: ${[...decided].sort().join(' ')}`);
});
