/**
 * Control-Plane Invariant Engine — evaluates a canonical set of
 * control-plane correctness invariants against a state snapshot.
 *
 * Each invariant check returns a typed result:
 *   {invariantId, severity, passed, reason, context}
 *
 * Severity is tagged as 'hard' or 'soft':
 *   - hard: must fail deterministic test gates
 *   - soft: diagnostic warning, does not gate
 *
 * Requirements: 7.1 (Requirement 7)
 */

import {
  createInvariantRecord,
  INVARIANT_ID,
} from '../invariants/invariant-catalog.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  INVARIANT_BUNDLE_FIELD,
  INVARIANT_ENGINE_SUBSYSTEM,
  INVARIANT_GATE_ERROR_MESSAGE,
  INVARIANT_OUTCOME_SEVERITY,
  INVARIANT_REASON,
} from './invariant-constants.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_TWO = 2;
const LOCAL_STR_WORKFLOWID = 'workflowId';
const LOCAL_STR_STATUS = 'status';
const LOCAL_STR_PARTICIPANTS = 'participants';
const LOCAL_STR_SOURCECHECKPOINT = 'sourceCheckpoint';
const LOCAL_STR_1W88E = 'serve_without_repair';
const LOCAL_STR_WRONG_DIMENSION = 'wrong_dimension';
const LOCAL_STR_OUTCOME_MISMATCH = 'outcome_mismatch';
const LOCAL_STR_TERMINAL_SUCCESS = 'terminal_success';
const LOCAL_STR_TERMINAL_FAILURE = 'terminal_failure';
const LOCAL_STR_DISPATCH_OBSERVED = 'dispatch_observed';
const LOCAL_STR_FAILURE_PRESENT = 'failure_present';
const LOCAL_OPERATION_PROGRESS_DEFAULT_STEP_BOUND = 8;

/**
 * Build a frozen invariant result object.
 *
 * @param {Object} options
 * @param {string} options.invariantId - One of INVARIANT_ID.
 * @param {string} options.severity - INVARIANT_OUTCOME_SEVERITY.
 * @param {boolean} options.passed - Whether the invariant holds.
 * @param {string} options.reason - INVARIANT_REASON code.
 * @param {Object} [options.context] - Additional diagnostic context.
 * @return {Object} Frozen invariant result.
 */
function buildInvariantResult(options) {
  return Object.freeze({
    invariantId: options.invariantId,
    severity: options.severity,
    passed: options.passed,
    reason: options.reason,
    context: options.context ?
      Object.freeze({...options.context}) :
      null,
  });
}

const REPLICA_OPERATION_CANONICAL_OWNER = 'RebalanceCoordinator';
const REPLICA_OPERATION_OWNER_FIELDS = new Set([
  'status',
  'workflow_step',
  'completed_at',
  'error_message',
  'steps_history',
  'replica_id',
]);
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
const INVARIANT_ENTITY_ID_CONTEXT_FIELDS = Object.freeze([
  'operationId',
  'workflowId',
  'transitionId',
  'entityId',
  'nodeId',
  'consumer',
]);
const OPERATION_PROGRESS_TERMINAL_STATES = Object.freeze(new Set([
  LOCAL_STR_TERMINAL_SUCCESS,
  LOCAL_STR_TERMINAL_FAILURE,
]));

/**
 * Determine whether a value is a non-empty plain object.
 * @param {*} value
 * @return {boolean}
 */
function isRecord(value) {
  return value !== null &&
    typeof value === LOCAL_STR_OBJECT &&
    !Array.isArray(value);
}

/**
 * Convert a value into a finite timestamp when possible.
 * @param {*} value
 * @return {number|null}
 */
function toFiniteTimestamp(value) {
  if (Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === LOCAL_STR_STRING && value.length > LOCAL_NUM_ZERO) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Resolve a stable entity id from invariant context when possible.
 * @param {Object} result - Invariant result.
 * @return {string|null}
 */
function resolveInvariantEntityId(result) {
  const context = isRecord(result?.context) ? result.context : null;
  if (!context) {
    return null;
  }
  for (const field of INVARIANT_ENTITY_ID_CONTEXT_FIELDS) {
    if (typeof context[field] === LOCAL_STR_STRING && context[field].length > LOCAL_NUM_ZERO) {
      return context[field];
    }
  }
  return null;
}

/**
 * Check leader uniqueness across owner rows.
 *
 * Each partition or message group must have at most one canonical
 * leader. The state snapshot provides `leaderRows`: an array of
 * objects with at least `{entityId, nodeId}`.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.leaderRows - Owner rows with leader
 *   claims. Each must have `entityId` and `nodeId`.
 * @return {Object} Frozen invariant result.
 */
function checkLeaderUniqueness(state) {
  const rows = Array.isArray(state?.leaderRows) ?
    state.leaderRows :
    [];

  const leadersByEntity = new Map();
  for (const row of rows) {
    const entityId = row?.entityId;
    const nodeId = row?.nodeId;
    if (typeof entityId !== LOCAL_STR_STRING || entityId.length === LOCAL_NUM_ZERO) {
      continue;
    }
    if (typeof nodeId !== LOCAL_STR_STRING || nodeId.length === LOCAL_NUM_ZERO) {
      continue;
    }
    if (!leadersByEntity.has(entityId)) {
      leadersByEntity.set(entityId, []);
    }
    leadersByEntity.get(entityId).push(nodeId);
  }

  const duplicates = [];
  for (const [entityId, nodes] of leadersByEntity) {
    if (nodes.length > LOCAL_NUM_ONE) {
      duplicates.push({entityId, nodes: Object.freeze([...nodes])});
    }
  }

  if (duplicates.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.LEADER_UNIQUENESS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.DUPLICATE_LEADER_DETECTED,
      context: {duplicates: Object.freeze(duplicates)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.LEADER_UNIQUENESS,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.LEADER_UNIQUE,
  });
}

/**
 * Check workflow step monotonicity.
 *
 * Workflow transitions must not move backward unless through an
 * explicit terminal recovery step. The state snapshot provides
 * `workflows`: an array of workflow objects, each with a
 * `transitionHistory` array of `{previousStep, nextStep}` and
 * an optional `terminalRecoverySteps` set of allowed backward
 * target steps.
 *
 * Step ordering uses numeric comparison when both steps are
 * finite numbers, and lexicographic comparison otherwise.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.workflows - Workflow records.
 * @return {Object} Frozen invariant result.
 */
function checkMonotonicSteps(state) {
  const workflows = Array.isArray(state?.workflows) ?
    state.workflows :
    [];

  const violations = [];
  for (const workflow of workflows) {
    const history = Array.isArray(workflow?.transitionHistory) ?
      workflow.transitionHistory :
      [];
    const recoverySteps = workflow?.terminalRecoverySteps instanceof Set ?
      workflow.terminalRecoverySteps :
      new Set();
    const workflowId = workflow?.workflowId || null;

    for (const entry of history) {
      const prev = entry?.previousStep;
      const next = entry?.nextStep;
      if (prev == null || next == null) {
        continue;
      }
      if (recoverySteps.has(next)) {
        continue;
      }
      if (isBackwardStep(prev, next)) {
        violations.push(Object.freeze({
          workflowId,
          previousStep: prev,
          nextStep: next,
        }));
      }
    }
  }

  if (violations.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.MONOTONIC_STEPS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.BACKWARD_STEP_DETECTED,
      context: {violations: Object.freeze(violations)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.MONOTONIC_STEPS,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.STEPS_MONOTONIC,
  });
}

/**
 * Determine whether a step transition is backward.
 * Uses numeric comparison when both values are finite numbers,
 * lexicographic comparison otherwise.
 *
 * @param {*} prev - Previous step value.
 * @param {*} next - Next step value.
 * @return {boolean} True when next < prev.
 */
function isBackwardStep(prev, next) {
  if (Number.isFinite(prev) && Number.isFinite(next)) {
    return next < prev;
  }
  return String(next) < String(prev);
}

/**
 * Check claim exclusivity by operation id and owner key.
 *
 * Each (operationId, ownerKey) pair must have at most one active
 * claim. The state snapshot provides `claims`: an array of
 * `{operationId, ownerKey}` objects.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.claims - Active claim records.
 * @return {Object} Frozen invariant result.
 */
function checkClaimExclusivity(state) {
  const claims = Array.isArray(state?.claims) ?
    state.claims :
    [];

  const seen = new Map();
  const duplicates = [];

  for (const claim of claims) {
    const opId = claim?.operationId;
    const ownerKey = claim?.ownerKey;
    if (typeof opId !== LOCAL_STR_STRING || opId.length === LOCAL_NUM_ZERO) {
      continue;
    }
    if (typeof ownerKey !== LOCAL_STR_STRING || ownerKey.length === LOCAL_NUM_ZERO) {
      continue;
    }
    const compositeKey = `${opId}:${ownerKey}`;
    const count = (seen.get(compositeKey) || 0) + 1;
    seen.set(compositeKey, count);
    if (count === LOCAL_NUM_TWO) {
      duplicates.push(Object.freeze({operationId: opId, ownerKey}));
    }
  }

  if (duplicates.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.CLAIM_EXCLUSIVITY,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.DUPLICATE_CLAIM_DETECTED,
      context: {duplicates: Object.freeze(duplicates)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.CLAIM_EXCLUSIVITY,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.CLAIMS_EXCLUSIVE,
  });
}

/**
 * Check for orphan in-flight operations without owner keys.
 *
 * Every in-flight operation must have a corresponding owner key
 * in the reconcile queue. The state snapshot provides:
 *   - `inFlightOperations`: array of `{operationId, ownerKey?}`
 *   - `registeredOwnerKeys`: Set of owner keys with active
 *     reconcile registrations.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.inFlightOperations - In-flight ops.
 * @param {Set<string>} state.registeredOwnerKeys - Active keys.
 * @return {Object} Frozen invariant result.
 */
function checkOrphanInFlight(state) {
  const operations = Array.isArray(state?.inFlightOperations) ?
    state.inFlightOperations :
    [];
  const registered = state?.registeredOwnerKeys instanceof Set ?
    state.registeredOwnerKeys :
    new Set();

  const orphans = [];
  for (const op of operations) {
    const opId = op?.operationId;
    const ownerKey = op?.ownerKey;
    if (typeof opId !== LOCAL_STR_STRING || opId.length === LOCAL_NUM_ZERO) {
      continue;
    }
    const hasOwner = typeof ownerKey === 'string' &&
      ownerKey.length > 0 &&
      registered.has(ownerKey);
    if (!hasOwner) {
      orphans.push(Object.freeze({
        operationId: opId,
        ownerKey: ownerKey || null,
      }));
    }
  }

  if (orphans.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.ORPHAN_IN_FLIGHT,
      severity: INVARIANT_OUTCOME_SEVERITY.SOFT,
      passed: false,
      reason: INVARIANT_REASON.ORPHAN_DETECTED,
      context: {orphans: Object.freeze(orphans)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.ORPHAN_IN_FLIGHT,
    severity: INVARIANT_OUTCOME_SEVERITY.SOFT,
    passed: true,
    reason: INVARIANT_REASON.NO_ORPHANS,
  });
}

/**
 * Check that owner-managed replica_operations fields have one writer only.
 *
 * The state snapshot provides `replicaOperationWrites`: an array of
 * `{operationId, writer, fields}` entries describing writes against
 * owner-managed workflow fields.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.replicaOperationWrites - Workflow writes.
 * @return {Object} Frozen invariant result.
 */
function checkReplicaOperationSingleWriter(state) {
  const writes = Array.isArray(state?.replicaOperationWrites) ?
    state.replicaOperationWrites :
    [];
  const writesByOperation = new Map();

  for (const write of writes) {
    const operationId = write?.operationId;
    const writer = write?.writer;
    const fields = Array.isArray(write?.fields) ? write.fields : [];
    if (typeof operationId !== LOCAL_STR_STRING || operationId.length === LOCAL_NUM_ZERO) {
      continue;
    }
    if (typeof writer !== LOCAL_STR_STRING || writer.length === LOCAL_NUM_ZERO) {
      continue;
    }
    const ownerFields = fields.filter((field) =>
      REPLICA_OPERATION_OWNER_FIELDS.has(field),
    );
    if (ownerFields.length === LOCAL_NUM_ZERO) {
      continue;
    }
    if (!writesByOperation.has(operationId)) {
      writesByOperation.set(operationId, {
        writers: new Set(),
        ownerFields: new Set(),
      });
    }
    const entry = writesByOperation.get(operationId);
    entry.writers.add(writer);
    for (const field of ownerFields) {
      entry.ownerFields.add(field);
    }
  }

  const violations = [];
  for (const [operationId, entry] of writesByOperation.entries()) {
    const writers = [...entry.writers].sort();
    if (writers.length === LOCAL_NUM_ONE &&
        writers[LOCAL_NUM_ZERO] === REPLICA_OPERATION_CANONICAL_OWNER) {
      continue;
    }
    violations.push(Object.freeze({
      operationId,
      canonicalOwner: REPLICA_OPERATION_CANONICAL_OWNER,
      writers: Object.freeze(writers),
      ownerFields: Object.freeze([...entry.ownerFields].sort()),
    }));
  }

  if (violations.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId:
        INVARIANT_ID.CONTROL_PLANE_REPLICA_OPERATIONS_SINGLE_WRITER,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.REPLICA_OPERATION_MULTI_WRITER_DETECTED,
      context: {violations: Object.freeze(violations)},
    });
  }

  return buildInvariantResult({
    invariantId:
      INVARIANT_ID.CONTROL_PLANE_REPLICA_OPERATIONS_SINGLE_WRITER,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.REPLICA_OPERATION_SINGLE_WRITER,
  });
}

/**
 * Check that executor-owned phase boundaries advance only after acknowledgement.
 *
 * The state snapshot provides `phaseAdvances`: an array of
 * `{workflowId, participantKey, acknowledged, acknowledgedAt, advancedAt}`.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.phaseAdvances - Phase transition evidence.
 * @return {Object} Frozen invariant result.
 */
function checkAckBeforeAdvance(state) {
  const phaseAdvances = Array.isArray(state?.phaseAdvances) ?
    state.phaseAdvances :
    [];
  const violations = [];

  for (const entry of phaseAdvances) {
    const advancedAt = toFiniteTimestamp(entry?.advancedAt);
    if (!Number.isFinite(advancedAt)) {
      continue;
    }
    const acknowledged = entry?.acknowledged === true;
    const acknowledgedAt = toFiniteTimestamp(entry?.acknowledgedAt);
    if (acknowledged && Number.isFinite(acknowledgedAt) &&
        acknowledgedAt <= advancedAt) {
      continue;
    }
    violations.push(Object.freeze({
      workflowId: entry?.workflowId || null,
      participantKey: entry?.participantKey || null,
      acknowledged,
      acknowledgedAt: acknowledgedAt ?? null,
      advancedAt,
    }));
  }

  if (violations.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.CONTROL_PLANE_ACK_BEFORE_ADVANCE,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.PHASE_ADVANCED_WITHOUT_ACK,
      context: {violations: Object.freeze(violations)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.CONTROL_PLANE_ACK_BEFORE_ADVANCE,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.ACK_BEFORE_ADVANCE_ENFORCED,
  });
}

/**
 * Check that resumable split workflows persist complete recovery state.
 *
 * The state snapshot provides `splitResumes`: an array of
 * `{workflowId?, metadata?, status, participants?, sourceCheckpoint?,
 *   requiresResume, requiresSourceCheckpoint?}`.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.splitResumes - Resumable split workflows.
 * @return {Object} Frozen invariant result.
 */
function checkSplitResumeCompleteness(state) {
  const splitResumes = Array.isArray(state?.splitResumes) ?
    state.splitResumes :
    [];
  const violations = [];

  for (const entry of splitResumes) {
    if (entry?.requiresResume !== true) {
      continue;
    }
    const metadata = isRecord(entry?.metadata) ? entry.metadata : {};
    const workflowId = typeof entry?.workflowId === 'string' &&
      entry.workflowId.length > 0 ?
      entry.workflowId :
      metadata.workflowId;
    const participants = isRecord(entry?.participants) ?
      entry.participants :
      (isRecord(metadata.participants) ? metadata.participants : null);
    const sourceCheckpoint = isRecord(entry?.sourceCheckpoint) ?
      entry.sourceCheckpoint :
      (isRecord(metadata.sourceCheckpoint) ? metadata.sourceCheckpoint : null);
    const missingFields = [];

    if (typeof workflowId !== LOCAL_STR_STRING || workflowId.length === LOCAL_NUM_ZERO) {
      missingFields.push(LOCAL_STR_WORKFLOWID);
    }
    if (typeof entry?.status !== LOCAL_STR_STRING || entry.status.length === LOCAL_NUM_ZERO) {
      missingFields.push(LOCAL_STR_STATUS);
    }
    if (!participants || Object.keys(participants).length === LOCAL_NUM_ZERO) {
      missingFields.push(LOCAL_STR_PARTICIPANTS);
    }
    if (entry?.requiresSourceCheckpoint === true && !sourceCheckpoint) {
      missingFields.push(LOCAL_STR_SOURCECHECKPOINT);
    }

    if (missingFields.length > LOCAL_NUM_ZERO) {
      violations.push(Object.freeze({
        workflowId: typeof workflowId === LOCAL_STR_STRING ? workflowId : null,
        status: typeof entry?.status === LOCAL_STR_STRING ? entry.status : null,
        missingFields: Object.freeze(missingFields),
      }));
    }
  }

  if (violations.length > LOCAL_NUM_ZERO) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.CONTROL_PLANE_SPLIT_RESUME_COMPLETENESS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.SPLIT_RESUME_INCOMPLETE,
      context: {violations: Object.freeze(violations)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.CONTROL_PLANE_SPLIT_RESUME_COMPLETENESS,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.SPLIT_RESUME_COMPLETE,
  });
}

/**
 * Check that readiness consumers use the canonical readiness dimension.
 *
 * The state snapshot provides `readinessDecisions`: an array of
 * `{consumer, nodeId?, decisionDimension, repairEligible, serveEligible,
 *   consumerOutcome?}` entries.
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
 * The state snapshot provides `atomicTransitions`: an array of
 * `{transitionId, ownerComponent?, requiresTransactionCoordinator,
 *   hasTransactionCoordinator}` entries.
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
 * Evaluate the full canonical invariant set against a state
 * snapshot.
 *
 * @param {Object} state - Combined state snapshot containing
 *   fields consumed by each individual invariant check.
 * @return {Array<Object>} Array of frozen invariant results.
 */
function evaluateInvariants(state) {
  const snapshot = state && typeof state === 'object' ? state : {};
  return Object.freeze([
    checkLeaderUniqueness(snapshot),
    checkMonotonicSteps(snapshot),
    checkClaimExclusivity(snapshot),
    checkOrphanInFlight(snapshot),
    checkReplicaOperationSingleWriter(snapshot),
    checkAckBeforeAdvance(snapshot),
    checkSplitResumeCompleteness(snapshot),
    checkReadinessDimensionCorrectness(snapshot),
    checkTransactionAvailability(snapshot),
    checkOperationProgressBoundedSteps(snapshot),
    checkPublicationVisibleOrRetained(snapshot),
    checkSnapshotCoverageMonotonic(snapshot),
  ]);
}

/**
 * Convert control-plane invariant results into invariant-catalog records
 * suitable for diagnostics bundles and harness artifacts.
 *
 * @param {Array<Object>} invariantResults - Results from evaluateInvariants().
 * @return {Array<Object>} Frozen array of invariant records.
 */
function buildInvariantArtifactRecords(invariantResults) {
  const results = Array.isArray(invariantResults) ?
    invariantResults :
    [];

  const records = results.map((result) => {
    const context = isRecord(result?.context) ?
      {...result.context} :
      {};
    return createInvariantRecord({
      invariantId: result?.invariantId,
      passed: result?.passed !== false,
      entityId: resolveInvariantEntityId(result),
      owningSubsystem: INVARIANT_ENGINE_SUBSYSTEM,
      reasonCode: result?.reason,
      observed: context,
      details: {
        ...context,
        controlPlaneSeverity: result?.severity || null,
      },
    });
  });

  return Object.freeze(records);
}

/**
 * Build a diagnostics bundle from invariant evaluation results.
 *
 * The bundle includes a summary of pass/fail counts separated by
 * severity, and a breaches array with full context including owner
 * key and operation id when available.
 *
 * Requirements: 7.2 (Requirement 7, 9)
 *
 * @param {Array<Object>} invariantResults - Results from
 *   evaluateInvariants().
 * @return {Object} Frozen diagnostics bundle.
 */
function buildInvariantDiagnosticsBundle(invariantResults) {
  const results = Array.isArray(invariantResults) ?
    invariantResults :
    [];
  const artifactRecords = buildInvariantArtifactRecords(results);

  let passed = LOCAL_NUM_ZERO;
  let failed = LOCAL_NUM_ZERO;
  let hardFailures = LOCAL_NUM_ZERO;
  let softFailures = LOCAL_NUM_ZERO;
  const breaches = [];

  for (const result of results) {
    if (result?.passed) {
      passed++;
    } else {
      failed++;
      if (result?.severity === INVARIANT_OUTCOME_SEVERITY.HARD) {
        hardFailures++;
      } else {
        softFailures++;
      }
      breaches.push(Object.freeze({
        invariantId: result?.invariantId || null,
        severity: result?.severity || null,
        reason: result?.reason || null,
        ownerKey: result?.context?.ownerKey || null,
        operationId: result?.context?.operationId || null,
        context: result?.context ?
          Object.freeze({...result.context}) :
          null,
      }));
    }
  }

  return Object.freeze({
    [INVARIANT_BUNDLE_FIELD.SUMMARY]: Object.freeze({
      [INVARIANT_BUNDLE_FIELD.TOTAL]: results.length,
      [INVARIANT_BUNDLE_FIELD.PASSED]: passed,
      [INVARIANT_BUNDLE_FIELD.FAILED]: failed,
      [INVARIANT_BUNDLE_FIELD.HARD_FAILURES]: hardFailures,
      [INVARIANT_BUNDLE_FIELD.SOFT_FAILURES]: softFailures,
    }),
    [INVARIANT_BUNDLE_FIELD.BREACHES]: Object.freeze(breaches),
    [INVARIANT_BUNDLE_FIELD.ARTIFACT_RECORDS]: artifactRecords,
    [INVARIANT_BUNDLE_FIELD.TIMESTAMP]: Date.now(),
  });
}

/**
 * Assert that no hard invariant has failed. Throws a typed error
 * with the diagnostics bundle attached when any hard invariant
 * breaches.
 *
 * Soft-only failures do not trigger the gate.
 *
 * Requirements: 7.3 (Requirement 7)
 *
 * @param {Array<Object>} invariantResults - Results from
 *   evaluateInvariants().
 * @throws {Error} When any result has severity 'hard' and
 *   passed === false. The error includes a `diagnosticsBundle`
 *   property.
 */
function assertInvariantGate(invariantResults) {
  const results = Array.isArray(invariantResults) ?
    invariantResults :
    [];

  const hasHardFailure = results.some(
    (r) => r?.severity === INVARIANT_OUTCOME_SEVERITY.HARD &&
      r?.passed === false,
  );

  if (!hasHardFailure) {
    return;
  }

  const bundle = buildInvariantDiagnosticsBundle(results);
  const error = new Error(INVARIANT_GATE_ERROR_MESSAGE);
  error.diagnosticsBundle = bundle;
  throw error;
}

export {
  assertInvariantGate,
  buildInvariantArtifactRecords,
  buildInvariantDiagnosticsBundle,
  buildInvariantResult,
  checkAckBeforeAdvance,
  checkClaimExclusivity,
  checkLeaderUniqueness,
  checkMonotonicSteps,
  checkOrphanInFlight,
  checkOperationProgressBoundedSteps,
  checkPublicationVisibleOrRetained,
  checkReadinessDimensionCorrectness,
  checkReplicaOperationSingleWriter,
  checkSnapshotCoverageMonotonic,
  checkSplitResumeCompleteness,
  checkTransactionAvailability,
  evaluateInvariants,
  isBackwardStep,
};
