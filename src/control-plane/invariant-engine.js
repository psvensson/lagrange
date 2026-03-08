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

/**
 * Determine whether a value is a non-empty plain object.
 * @param {*} value
 * @return {boolean}
 */
function isRecord(value) {
  return value !== null &&
    typeof value === 'object' &&
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
  if (typeof value === 'string' && value.length > 0) {
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
    if (typeof context[field] === 'string' && context[field].length > 0) {
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
    if (typeof entityId !== 'string' || entityId.length === 0) {
      continue;
    }
    if (typeof nodeId !== 'string' || nodeId.length === 0) {
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
    if (typeof opId !== 'string' || opId.length === 0) {
      continue;
    }
    if (typeof ownerKey !== 'string' || ownerKey.length === 0) {
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
    if (typeof opId !== 'string' || opId.length === 0) {
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
    if (typeof operationId !== 'string' || operationId.length === 0) {
      continue;
    }
    if (typeof writer !== 'string' || writer.length === 0) {
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

    if (typeof workflowId !== 'string' || workflowId.length === 0) {
      missingFields.push('workflowId');
    }
    if (typeof entry?.status !== 'string' || entry.status.length === 0) {
      missingFields.push('status');
    }
    if (!participants || Object.keys(participants).length === 0) {
      missingFields.push('participants');
    }
    if (entry?.requiresSourceCheckpoint === true && !sourceCheckpoint) {
      missingFields.push('sourceCheckpoint');
    }

    if (missingFields.length > 0) {
      violations.push(Object.freeze({
        workflowId: typeof workflowId === 'string' ? workflowId : null,
        status: typeof entry?.status === 'string' ? entry.status : null,
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
        violationType: 'serve_without_repair',
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
        violationType: 'wrong_dimension',
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
          violationType: 'outcome_mismatch',
        }));
      }
    }
  }

  if (violations.length > 0) {
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

  if (violations.length > 0) {
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

  let passed = 0;
  let failed = 0;
  let hardFailures = 0;
  let softFailures = 0;
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
  checkReadinessDimensionCorrectness,
  checkReplicaOperationSingleWriter,
  checkSplitResumeCompleteness,
  checkTransactionAvailability,
  evaluateInvariants,
  isBackwardStep,
};
