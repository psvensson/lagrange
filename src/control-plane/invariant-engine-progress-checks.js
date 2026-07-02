/**
 * Control-plane invariant checks for readiness, progress, publication,
 * and coverage records.
 */

import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {INVARIANT_ID} from '../invariants/invariant-catalog.js';
import {
  INVARIANT_OUTCOME_SEVERITY,
  INVARIANT_REASON,
} from './invariant-constants.js';
import {buildInvariantResult} from './invariant-engine-result.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_1W88E = 'serve_without_repair';
const LOCAL_STR_WRONG_DIMENSION = 'wrong_dimension';
const LOCAL_STR_OUTCOME_MISMATCH = 'outcome_mismatch';
const LOCAL_STR_TERMINAL_SUCCESS = 'terminal_success';
const LOCAL_STR_TERMINAL_FAILURE = 'terminal_failure';
const LOCAL_STR_DISPATCH_OBSERVED = 'dispatch_observed';
const LOCAL_STR_FAILURE_PRESENT = 'failure_present';
const LOCAL_OPERATION_PROGRESS_DEFAULT_STEP_BOUND = 8;

const INTERNAL_TOPOLOGY_READINESS_CONSUMERS = new Set([
  'ManagedSplitWorkflow',
  'MovePlanner',
  'RebalanceCoordinator',
  'ReplicaDispatchService',
  'StorageAdmissionService',
  'UnifiedRebalancer',
]);
const EXTERNAL_SERVE_READINESS_CONSUMERS = new Set([
  'BenchmarkAdmission',
  'ExternalRouting',
  'PgWireStartupSafetyGate',
  'RoutingService',
]);
const OPERATION_PROGRESS_TERMINAL_STATES = Object.freeze(new Set([
  LOCAL_STR_TERMINAL_SUCCESS,
  LOCAL_STR_TERMINAL_FAILURE,
]));

/**
 * Check that readiness consumers use the canonical readiness dimension.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.readinessDecisions - Readiness decisions.
 * @return {Object} Frozen invariant result.
 */
function checkReadinessDimensionCorrectness(state) {
  const decisions = Array.isArray(state?.readinessDecisions) ?
    state.readinessDecisions :
    [];
  const violations = [];

  for (const decision of decisions) {
    const consumer = typeof decision?.consumer === 'string' ?
      decision.consumer :
      null;
    const decisionDimension = typeof decision?.decisionDimension === 'string' ?
      decision.decisionDimension :
      null;
    const repairEligible = decision?.repairEligible === true;
    const serveEligible = decision?.serveEligible === true;
    const consumerOutcome =
      typeof decision?.consumerOutcome === 'boolean' ?
        decision.consumerOutcome :
        (typeof decision?.allowed === 'boolean' ? decision.allowed : null);
    const expectedDimension =
      INTERNAL_TOPOLOGY_READINESS_CONSUMERS.has(consumer) ?
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE :
        EXTERNAL_SERVE_READINESS_CONSUMERS.has(consumer) ?
          CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE :
          null;

    if (serveEligible && !repairEligible) {
      violations.push(Object.freeze({
        consumer,
        nodeId: decision?.nodeId || null,
        decisionDimension,
        expectedDimension,
        repairEligible,
        serveEligible,
        consumerOutcome,
        violationType: LOCAL_STR_1W88E,
      }));
      continue;
    }

    if (expectedDimension && decisionDimension !== expectedDimension) {
      violations.push(Object.freeze({
        consumer,
        nodeId: decision?.nodeId || null,
        decisionDimension,
        expectedDimension,
        repairEligible,
        serveEligible,
        consumerOutcome,
        violationType: LOCAL_STR_WRONG_DIMENSION,
      }));
      continue;
    }

    if (expectedDimension && consumerOutcome !== null) {
      const expectedOutcome =
        expectedDimension ===
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE ?
          repairEligible :
          serveEligible;
      if (consumerOutcome !== expectedOutcome) {
        violations.push(Object.freeze({
          consumer,
          nodeId: decision?.nodeId || null,
          decisionDimension,
          expectedDimension,
          repairEligible,
          serveEligible,
          consumerOutcome,
          violationType: LOCAL_STR_OUTCOME_MISMATCH,
        }));
      }
    }
  }

  if (violations.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId:
        INVARIANT_ID.CONTROL_PLANE_READINESS_DIMENSION_CORRECTNESS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.READINESS_DIMENSION_INCORRECT,
      context: {violations: Object.freeze(violations)},
    });
  }

  return buildInvariantResult({
    invariantId:
      INVARIANT_ID.CONTROL_PLANE_READINESS_DIMENSION_CORRECTNESS,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.READINESS_DIMENSION_CORRECT,
  });
}

/**
 * Check that atomic topology transitions only run with a transaction coordinator.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.atomicTransitions - Atomic transition evidence.
 * @return {Object} Frozen invariant result.
 */
function checkTransactionAvailability(state) {
  const atomicTransitions = Array.isArray(state?.atomicTransitions) ?
    state.atomicTransitions :
    [];
  const violations = [];

  for (const transition of atomicTransitions) {
    if (transition?.requiresTransactionCoordinator !== true) {
      continue;
    }
    if (transition?.hasTransactionCoordinator === true) {
      continue;
    }
    violations.push(Object.freeze({
      transitionId: transition?.transitionId || null,
      ownerComponent: transition?.ownerComponent || null,
    }));
  }

  if (violations.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId:
        INVARIANT_ID.CONTROL_PLANE_TRANSACTION_COORDINATOR_REQUIRED,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.TRANSACTION_COORDINATOR_MISSING,
      context: {violations: Object.freeze(violations)},
    });
  }

  return buildInvariantResult({
    invariantId:
      INVARIANT_ID.CONTROL_PLANE_TRANSACTION_COORDINATOR_REQUIRED,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.TRANSACTION_COORDINATOR_AVAILABLE,
  });
}

function resolveOperationProgressStepBound(record) {
  if (Number.isFinite(record?.maxStepBound)) {
    return Math.floor(record.maxStepBound);
  }
  if (Number.isFinite(record?.boundedStepLimit)) {
    return Math.floor(record.boundedStepLimit);
  }
  return LOCAL_OPERATION_PROGRESS_DEFAULT_STEP_BOUND;
}

function resolveOperationProgressStepCount(record) {
  if (Number.isFinite(record?.stepCount)) {
    return Math.floor(record.stepCount);
  }
  if (Number.isFinite(record?.observedStepCount)) {
    return Math.floor(record.observedStepCount);
  }
  return LOCAL_NUM_ZERO;
}

function isDispatchedOperationProgress(record) {
  return record?.dispatched === true ||
    record?.dispatchState === LOCAL_STR_DISPATCH_OBSERVED;
}

function isTerminalOperationProgress(record) {
  return record?.terminal === true ||
    OPERATION_PROGRESS_TERMINAL_STATES.has(record?.terminalState) ||
    OPERATION_PROGRESS_TERMINAL_STATES.has(record?.state);
}

/**
 * IV-OP-1: every dispatched operation reaches terminal state in bounded steps.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.operationProgressRecords - Operation progress.
 * @return {Object} Frozen invariant result.
 */
function checkOperationProgressBoundedSteps(state) {
  const records = Array.isArray(state?.operationProgressRecords) ?
    state.operationProgressRecords :
    [];
  const violations = [];

  for (const record of records) {
    if (!isDispatchedOperationProgress(record)) {
      continue;
    }
    if (isTerminalOperationProgress(record)) {
      continue;
    }
    const stepCount = resolveOperationProgressStepCount(record);
    const maxStepBound = resolveOperationProgressStepBound(record);
    if (stepCount <= maxStepBound) {
      continue;
    }
    violations.push(Object.freeze({
      operationId: record?.operationId || record?.operationKey || null,
      state: record?.state || null,
      stepCount,
      maxStepBound,
    }));
  }

  if (violations.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.OPERATION_PROGRESS_BOUNDED_STEPS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.OPERATION_PROGRESS_BOUND_EXCEEDED,
      context: {violations: Object.freeze(violations)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.OPERATION_PROGRESS_BOUNDED_STEPS,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.OPERATION_PROGRESS_BOUNDED,
  });
}

/**
 * IV-PUB-1: every accepted publication is visible or retained for retry.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.publicationProgressRecords - Publication rows.
 * @return {Object} Frozen invariant result.
 */
function checkPublicationVisibleOrRetained(state) {
  const records = Array.isArray(state?.publicationProgressRecords) ?
    state.publicationProgressRecords :
    [];
  const violations = [];

  for (const record of records) {
    if (record?.accepted !== true) {
      continue;
    }
    if (record?.visibleAtActiveGate === true ||
        record?.retainedRetry === true) {
      continue;
    }
    violations.push(Object.freeze({
      publicationId: record?.publicationId || null,
      publicationEpoch: record?.publicationEpoch || null,
      outcome: record?.outcome || null,
    }));
  }

  if (violations.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.PUBLICATION_VISIBLE_OR_RETAINED,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason:
        INVARIANT_REASON
          .ACCEPTED_PUBLICATION_WITHOUT_VISIBILITY_OR_RETRY,
      context: {violations: Object.freeze(violations)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.PUBLICATION_VISIBLE_OR_RETAINED,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.PUBLICATION_VISIBLE_OR_RETAINED,
  });
}

function resolveSnapshotCoverageCount(record) {
  if (Number.isFinite(record?.coverageNodeCount)) {
    return Math.floor(record.coverageNodeCount);
  }
  if (Number.isFinite(record?.snapshotCoverageNodeCount)) {
    return Math.floor(record.snapshotCoverageNodeCount);
  }
  return LOCAL_NUM_ZERO;
}

function resolveSnapshotCoverageOrder(record) {
  if (Number.isFinite(record?.observedAt)) {
    return Math.floor(record.observedAt);
  }
  if (Number.isFinite(record?.sequence)) {
    return Math.floor(record.sequence);
  }
  return LOCAL_NUM_ZERO;
}

function isNoFailureSnapshotCoverageSample(record) {
  return record?.failureState !== LOCAL_STR_FAILURE_PRESENT;
}

/**
 * IV-COV-1: snapshot coverage monotonically advances under no-failure.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.snapshotCoverageSamples - Coverage samples.
 * @return {Object} Frozen invariant result.
 */
function checkSnapshotCoverageMonotonic(state) {
  const samples = Array.isArray(state?.snapshotCoverageSamples) ?
    state.snapshotCoverageSamples.filter(isNoFailureSnapshotCoverageSample) :
    [];
  const orderedSamples = [...samples].sort((left, right) =>
    resolveSnapshotCoverageOrder(left) - resolveSnapshotCoverageOrder(right),
  );
  const violations = [];
  let previousCoverage = LOCAL_NUM_ZERO;

  for (const sample of orderedSamples) {
    const coverageNodeCount = resolveSnapshotCoverageCount(sample);
    if (coverageNodeCount < previousCoverage) {
      violations.push(Object.freeze({
        sampleId: sample?.sampleId || null,
        previousCoverage,
        coverageNodeCount,
      }));
    }
    previousCoverage = Math.max(previousCoverage, coverageNodeCount);
  }

  if (violations.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.SNAPSHOT_COVERAGE_MONOTONIC,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.SNAPSHOT_COVERAGE_REGRESSED,
      context: {violations: Object.freeze(violations)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.SNAPSHOT_COVERAGE_MONOTONIC,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.SNAPSHOT_COVERAGE_MONOTONIC,
  });
}

/**
 * IV-PUB-2: missingPublishedCount > 0 with a publication owner => scheduled reconcile obligation is enabled.
 *
 * @param {Object} state - State snapshot.
 * @return {Object} Frozen invariant result.
 */
function checkPublicationDrainDeterministic(state) {
  const isOwner = state?.isPublicationOwner === true;
  const missingCount = Number.isFinite(state?.missingPublishedCount) ?
    state.missingPublishedCount :
    0;
  const obligationEnabled = state?.scheduledReconcileObligationEnabled === true;

  if (isOwner && missingCount > 0 && !obligationEnabled) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.PUBLICATION_DRAIN_DETERMINISTIC,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.PUBLICATION_DRAIN_UNDETERMINISTIC,
      context: {
        missingPublishedCount: missingCount,
        isPublicationOwner: isOwner,
        scheduledReconcileObligationEnabled: obligationEnabled,
      },
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.PUBLICATION_DRAIN_DETERMINISTIC,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.PUBLICATION_DRAIN_DETERMINISTIC,
  });
}

export {
  checkOperationProgressBoundedSteps,
  checkPublicationVisibleOrRetained,
  checkReadinessDimensionCorrectness,
  checkSnapshotCoverageMonotonic,
  checkTransactionAvailability,
  checkPublicationDrainDeterministic,
};
