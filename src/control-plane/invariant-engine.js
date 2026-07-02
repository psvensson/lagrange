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

import {INVARIANT_ID} from '../invariants/invariant-catalog.js';
import {
  assertInvariantGate,
  buildInvariantArtifactRecords,
  buildInvariantDiagnosticsBundle,
} from './invariant-engine-diagnostics.js';
import {
  checkOperationProgressBoundedSteps,
  checkPublicationVisibleOrRetained,
  checkReadinessDimensionCorrectness,
  checkSnapshotCoverageMonotonic,
  checkTransactionAvailability,
  checkPublicationDrainDeterministic,
} from './invariant-engine-progress-checks.js';
import {buildInvariantResult} from './invariant-engine-result.js';
import {
  INVARIANT_OUTCOME_SEVERITY,
  INVARIANT_REASON,
} from './invariant-constants.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_WORKFLOWID = 'workflowId';
const LOCAL_STR_STATUS = 'status';
const LOCAL_STR_PARTICIPANTS = 'participants';
const LOCAL_STR_SOURCECHECKPOINT = 'sourceCheckpoint';

const REPLICA_OPERATION_CANONICAL_OWNER = 'RebalanceCoordinator';
const REPLICA_OPERATION_OWNER_FIELDS = new Set([
  'status',
  'workflow_step',
  'completed_at',
  'error_message',
  'steps_history',
  'replica_id',
]);
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
  if (typeof value === LOCAL_STR_STRING && value.length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
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
    if (typeof entityId !== LOCAL_STR_STRING || entityId.length === 0) {
      continue;
    }
    if (typeof nodeId !== LOCAL_STR_STRING || nodeId.length === 0) {
      continue;
    }
    if (!leadersByEntity.has(entityId)) {
      leadersByEntity.set(entityId, []);
    }
    leadersByEntity.get(entityId).push(nodeId);
  }

  const duplicates = [];
  for (const [entityId, nodes] of leadersByEntity) {
    if (nodes.length > 1) {
      duplicates.push({entityId, nodes: Object.freeze([...nodes])});
    }
  }

  if (duplicates.length > 0) {
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

  if (violations.length > 0) {
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
    if (typeof opId !== LOCAL_STR_STRING || opId.length === 0) {
      continue;
    }
    if (typeof ownerKey !== LOCAL_STR_STRING || ownerKey.length === 0) {
      continue;
    }
    const compositeKey = `${opId}:${ownerKey}`;
    const count = (seen.get(compositeKey) || 0) + 1;
    seen.set(compositeKey, count);
    if (count === 2) {
      duplicates.push(Object.freeze({operationId: opId, ownerKey}));
    }
  }

  if (duplicates.length > 0) {
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
    if (typeof opId !== LOCAL_STR_STRING || opId.length === 0) {
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

  if (orphans.length > 0) {
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
    if (typeof operationId !== LOCAL_STR_STRING || operationId.length === 0) {
      continue;
    }
    if (typeof writer !== LOCAL_STR_STRING || writer.length === 0) {
      continue;
    }
    const ownerFields = fields.filter((field) =>
      REPLICA_OPERATION_OWNER_FIELDS.has(field),
    );
    if (ownerFields.length === 0) {
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
    if (writers.length === 1 &&
        writers[0] === REPLICA_OPERATION_CANONICAL_OWNER) {
      continue;
    }
    violations.push(Object.freeze({
      operationId,
      canonicalOwner: REPLICA_OPERATION_CANONICAL_OWNER,
      writers: Object.freeze(writers),
      ownerFields: Object.freeze([...entry.ownerFields].sort()),
    }));
  }

  if (violations.length > 0) {
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

  if (violations.length > 0) {
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

    if (typeof workflowId !== LOCAL_STR_STRING || workflowId.length === 0) {
      missingFields.push(LOCAL_STR_WORKFLOWID);
    }
    if (typeof entry?.status !== LOCAL_STR_STRING || entry.status.length === 0) {
      missingFields.push(LOCAL_STR_STATUS);
    }
    if (!participants || Object.keys(participants).length === 0) {
      missingFields.push(LOCAL_STR_PARTICIPANTS);
    }
    if (entry?.requiresSourceCheckpoint === true && !sourceCheckpoint) {
      missingFields.push(LOCAL_STR_SOURCECHECKPOINT);
    }

    if (missingFields.length > 0) {
      violations.push(Object.freeze({
        workflowId: typeof workflowId === LOCAL_STR_STRING ? workflowId : null,
        status: typeof entry?.status === LOCAL_STR_STRING ? entry.status : null,
        missingFields: Object.freeze(missingFields),
      }));
    }
  }

  if (violations.length > 0) {
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
    checkPublicationDrainDeterministic(snapshot),
  ]);
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
  checkPublicationDrainDeterministic,
  evaluateInvariants,
  isBackwardStep,
};
