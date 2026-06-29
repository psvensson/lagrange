import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  inferPriorityRecoveryTableNameFromPartitionId,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  OperationType,
  isTerminalStep as isTerminalReplicaOperationStep,
  isValidWorkflowStep as isValidReplicaOperationStep,
} from '../rebalancer/replica-status.js';
import {
  normalizeReplicaOperationRecord,
  resolveStepTimeoutMs,
} from '../rebalancer/replica-operation-liveness.js';
import {
  memoizedParseStepsHistoryString,
} from '../rebalancer/steps-history-parse-memo.js';
import {
  LOCAL_STR_EMPTY,
  PRIORITY_RECOVERY_RAFT_ROLE_LEARNER,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_COMPLETED_AT,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT,
  PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_OPERATION_TIMELINE_BY_ID,
  PRIORITY_RECOVERY_SERVICE_FIELD_ADDRESS,
  PRIORITY_RECOVERY_SERVICE_FIELD_CREATEDAT,
  PRIORITY_RECOVERY_SERVICE_FIELD_CREATED_AT,
  PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID,
  PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID,
  PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE,
  PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE_CAMEL,
  PRIORITY_RECOVERY_SERVICE_FIELD_REPLICA_ID,
  PRIORITY_RECOVERY_SERVICE_FIELD_SERVICE_TYPE,
  PRIORITY_RECOVERY_SERVICE_FIELD_STATEENTEREDAT,
  PRIORITY_RECOVERY_SERVICE_FIELD_STATE_ENTERED_AT,
  PRIORITY_RECOVERY_SERVICE_FIELD_STATUS,
  PRIORITY_RECOVERY_SERVICE_FIELD_UPDATEDAT,
  PRIORITY_RECOVERY_SERVICE_FIELD_UPDATED_AT,
  PRIORITY_RECOVERY_SERVICE_TYPE_PARTITION,
  PRIORITY_RECOVERY_SNAPSHOT_LITERAL,
  PRIORITY_RECOVERY_STATUS_ACTIVE,
  PRIORITY_RECOVERY_STATUS_SYNCING,
  PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_STATUSES,
  PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_UNAVAILABLE_AT_MS,
  PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
  PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET,
  STATUS_ACTIVE,
} from './priority-recovery-snapshot-contract.js';
import {readFirstIntegerField, readFirstStringField} from './priority-recovery-snapshot-ingress.js';
import {buildPriorityRecoveryTargetServiceRowIndex, selectPriorityRecoveryTargetServiceRowsFromIndex} from './priority-recovery-target-service-row-index.js';
import {buildPriorityRecoveryReplicaOperationContext, buildPriorityRecoveryReplicaOperationSourceRows, normalizePriorityRecoveryReplicaOperationContextBuildOptions} from './priority-recovery-snapshot-workflow.js';

function buildPriorityRecoveryReplicaOperationContexts(
  replicaOperationRows = [],
  replicaOperationsSummary = null,
  serviceRows = [],
  options = {},
) {
  const normalizedOptions =
    normalizePriorityRecoveryReplicaOperationContextBuildOptions(options);
  const operationTimelineById =
    replicaOperationsSummary?.[
      PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_OPERATION_TIMELINE_BY_ID
    ] &&
    typeof replicaOperationsSummary[
      PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_OPERATION_TIMELINE_BY_ID
    ] === TYPEOF.OBJECT ?
      replicaOperationsSummary[
        PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_OPERATION_TIMELINE_BY_ID
      ] :
      {};
  const byOperationId = {};
  const byPartitionId = {};
  const targetServiceRowIndex = buildPriorityRecoveryTargetServiceRowIndex(serviceRows);
  const contextBuildOptions = {
    ...normalizedOptions,
    targetServiceRowIndex,
  };
  for (const replicaOperationRow of buildPriorityRecoveryReplicaOperationSourceRows(
    replicaOperationRows,
    replicaOperationsSummary,
  )) {
    const builtContext = buildPriorityRecoveryReplicaOperationContext(
      replicaOperationRow,
      operationTimelineById,
      serviceRows,
      contextBuildOptions,
    );
    if (!builtContext) {
      continue;
    }
    const {operationId, partitionId, context} = builtContext;
    byOperationId[operationId] = context;
    if (!byPartitionId[partitionId]) {
      byPartitionId[partitionId] = [];
    }
    byPartitionId[partitionId].push(context);
  }
  for (const partitionId of Object.keys(byPartitionId)) {
    byPartitionId[partitionId].sort((left, right) =>
      String(left.operationId).localeCompare(String(right.operationId)),
    );
  }
  return {byOperationId, byPartitionId};
}

function parsePriorityRecoveryStepsHistory(stepsHistoryRaw) {
  if (Array.isArray(stepsHistoryRaw)) {
    return stepsHistoryRaw;
  }
  if (
    typeof stepsHistoryRaw !== TYPEOF.STRING ||
    stepsHistoryRaw.length === NUM.ZERO
  ) {
    return [];
  }
  return memoizedParseStepsHistoryString(stepsHistoryRaw);
}

function doesPriorityRecoveryServiceRowMatchOperationTarget(
  operationContext,
  serviceRow,
) {
  if (!operationContext || !serviceRow || typeof serviceRow !== TYPEOF.OBJECT) {
    return false;
  }
  const targetNodeId = String(operationContext?.targetNodeId || '').trim();
  const partitionId = String(operationContext?.partitionId || '').trim();
  if (targetNodeId.length === NUM.ZERO || partitionId.length === NUM.ZERO) {
    return false;
  }
  const serviceType = String(
    readFirstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_SERVICE_TYPE,
      'serviceType',
    ) || PRIORITY_RECOVERY_SERVICE_TYPE_PARTITION,
  ).toLowerCase();
  if (serviceType !== PRIORITY_RECOVERY_SERVICE_TYPE_PARTITION) {
    return false;
  }
  const serviceNodeId = readFirstStringField(
    serviceRow,
    PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID,
    'nodeId',
  );
  if (serviceNodeId !== targetNodeId) {
    return false;
  }
  const servicePartitionId = readFirstStringField(
    serviceRow,
    PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID,
    'partitionId',
  );
  if (servicePartitionId && servicePartitionId !== partitionId) {
    return false;
  }
  const operationReplicaId = String(operationContext?.replicaId || '').trim();
  if (operationReplicaId.length === NUM.ZERO) {
    return true;
  }
  const serviceReplicaId = readFirstStringField(
    serviceRow,
    PRIORITY_RECOVERY_SERVICE_FIELD_REPLICA_ID,
    PRIORITY_RECOVERY_SNAPSHOT_LITERAL.REPLICAID,
    PRIORITY_RECOVERY_SNAPSHOT_LITERAL.SERVICE_ID,
    PRIORITY_RECOVERY_SNAPSHOT_LITERAL.SERVICEID,
  );
  if (!serviceReplicaId) {
    return true;
  }
  return serviceReplicaId === operationReplicaId;
}

function resolvePriorityRecoveryTargetServiceRowStatus(serviceRow) {
  return String(
    readFirstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_STATUS,
      PRIORITY_RECOVERY_SNAPSHOT_LITERAL.STATUS,
    ) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
  ).toLowerCase();
}

function resolvePriorityRecoveryTargetServiceRowVisibilityState(serviceRow) {
  const status = resolvePriorityRecoveryTargetServiceRowStatus(serviceRow);
  const raftRole = String(
    readFirstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE,
      PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE_CAMEL,
    ) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
  ).toLowerCase();
  const hasNonLearnerRole =
    raftRole.length > NUM.ZERO &&
    raftRole !== PRIORITY_RECOVERY_RAFT_ROLE_LEARNER;
  if (status === PRIORITY_RECOVERY_STATUS_ACTIVE) {
    return hasNonLearnerRole === true ?
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL :
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_NON_OPERATIONAL;
  }
  const address = readFirstStringField(
    serviceRow,
    PRIORITY_RECOVERY_SERVICE_FIELD_ADDRESS,
  );
  if (
    status === PRIORITY_RECOVERY_STATUS_SYNCING &&
    hasNonLearnerRole === true &&
    address
  ) {
    return PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL;
  }
  return PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.NON_ACTIVE;
}

function resolvePriorityRecoveryTargetServiceRowTerminalState(serviceRow) {
  return PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET.has(
    resolvePriorityRecoveryTargetServiceRowStatus(serviceRow),
  ) ?
    PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL :
    PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.NON_TERMINAL;
}

function isPriorityRecoveryTargetServiceRowProgressing(
  serviceRow,
  visibilityState,
) {
  return visibilityState ===
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL ||
    visibilityState ===
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_NON_OPERATIONAL ||
    PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_STATUSES.has(
      resolvePriorityRecoveryTargetServiceRowStatus(serviceRow),
    );
}

function resolvePriorityRecoveryTargetServiceRowProgressTimestampMs(serviceRow) {
  const progressTimestampCandidates = [
    readFirstIntegerField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_STATE_ENTERED_AT,
      PRIORITY_RECOVERY_SERVICE_FIELD_STATEENTEREDAT,
    ),
    readFirstIntegerField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_UPDATED_AT,
      PRIORITY_RECOVERY_SERVICE_FIELD_UPDATEDAT,
    ),
    readFirstIntegerField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_CREATED_AT,
      PRIORITY_RECOVERY_SERVICE_FIELD_CREATEDAT,
    ),
  ].filter((timestampMs) =>
    Number.isFinite(timestampMs) && timestampMs > NUM.ZERO,
  );
  return progressTimestampCandidates.length > NUM.ZERO ?
    Math.max(...progressTimestampCandidates) :
    PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_UNAVAILABLE_AT_MS;
}

function buildPriorityRecoveryTargetServiceEvidenceState() {
  return {
    hasMatchingTargetServiceRow: false,
    hasOperationalMatchingTargetServiceRow: false,
    hasActiveMatchingTargetServiceRow: false,
    hasTerminalMatchingTargetServiceRow: false,
    targetServiceProgressAtMs:
      PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_UNAVAILABLE_AT_MS,
  };
}

function resolvePriorityRecoveryTargetServiceCandidateRows(
  options,
  operationContext,
  serviceRows,
) {
  return options.targetServiceRowIndex instanceof Map ?
    selectPriorityRecoveryTargetServiceRowsFromIndex(
      operationContext,
      options.targetServiceRowIndex,
    ) :
    serviceRows;
}

function recordPriorityRecoveryTargetServiceEvidenceRow(evidenceState, serviceRow) {
  evidenceState.hasMatchingTargetServiceRow = true;
  if (
    resolvePriorityRecoveryTargetServiceRowTerminalState(serviceRow) ===
    PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL
  ) {
    evidenceState.hasTerminalMatchingTargetServiceRow = true;
  }
  const targetServiceRowVisibilityState =
    resolvePriorityRecoveryTargetServiceRowVisibilityState(serviceRow);
  const rowProgressAtMs =
    isPriorityRecoveryTargetServiceRowProgressing(
      serviceRow,
      targetServiceRowVisibilityState,
    ) ?
      resolvePriorityRecoveryTargetServiceRowProgressTimestampMs(serviceRow) :
      PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_UNAVAILABLE_AT_MS;
  if (Number.isFinite(rowProgressAtMs) && rowProgressAtMs > NUM.ZERO) {
    evidenceState.targetServiceProgressAtMs = Math.max(
      evidenceState.targetServiceProgressAtMs,
      rowProgressAtMs,
    );
  }
  if (
    targetServiceRowVisibilityState ===
    PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL
  ) {
    evidenceState.hasOperationalMatchingTargetServiceRow = true;
    return;
  }
  if (
    targetServiceRowVisibilityState ===
    PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_NON_OPERATIONAL
  ) {
    evidenceState.hasActiveMatchingTargetServiceRow = true;
  }
}

function resolvePriorityRecoveryTargetServiceEvidenceVisibilityState(
  evidenceState,
) {
  return [
    {
      matches: evidenceState.hasOperationalMatchingTargetServiceRow === true,
      state: PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
    },
    {
      matches: evidenceState.hasActiveMatchingTargetServiceRow === true,
      state: PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_NON_OPERATIONAL,
    },
    {
      matches: evidenceState.hasMatchingTargetServiceRow === true,
      state: PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.NON_ACTIVE,
    },
    {
      matches: true,
      state: PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ABSENT,
    },
  ].find((entry) => entry.matches === true).state;
}

function resolvePriorityRecoveryTargetServiceEvidenceTerminalState(
  evidenceState,
) {
  if (evidenceState.hasMatchingTargetServiceRow !== true) {
    return PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.UNKNOWN;
  }
  return evidenceState.hasTerminalMatchingTargetServiceRow === true ?
    PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL :
    PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.NON_TERMINAL;
}

function buildPriorityRecoveryTargetServiceEvidence(options = {}) {
  const operationContext =
    options.operationContext &&
    typeof options.operationContext === TYPEOF.OBJECT ?
      options.operationContext :
      null;
  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  const candidateServiceRows = resolvePriorityRecoveryTargetServiceCandidateRows(
    options,
    operationContext,
    serviceRows,
  );
  const evidenceState = buildPriorityRecoveryTargetServiceEvidenceState();
  for (const serviceRow of candidateServiceRows) {
    if (
      !doesPriorityRecoveryServiceRowMatchOperationTarget(
        operationContext,
        serviceRow,
      )
    ) {
      continue;
    }
    recordPriorityRecoveryTargetServiceEvidenceRow(evidenceState, serviceRow);
  }
  return Object.freeze({
    visibilityState: resolvePriorityRecoveryTargetServiceEvidenceVisibilityState(
      evidenceState,
    ),
    terminalState: resolvePriorityRecoveryTargetServiceEvidenceTerminalState(
      evidenceState,
    ),
    ...(evidenceState.targetServiceProgressAtMs >
      PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_UNAVAILABLE_AT_MS ?
      {progressAtMs: evidenceState.targetServiceProgressAtMs} :
      {}),
  });
}

function _resolvePriorityRecoveryTargetVisibilityState(options = {}) {
  return buildPriorityRecoveryTargetServiceEvidence(options).visibilityState;
}

// Time the operation has spent in its current workflow step, anchored on the
// latest steps_history entry (when the current step was entered). This is the
// stall signal the spread classifier consults, computed identically here for both
// the per-partition decision-snapshot builder and the full-cluster closure builder
// so the two views never disagree. It is robust to a stepTimeoutMs of 0 (no
// per-step deadline) because it never reads stepTimeoutMs, and it anchors on the
// steps_history entry timestamp rather than updatedAt: a wedged op whose dispatch-
// retry loop re-persists updatedAt would never age past a per-step timeout, but its
// step-entered timestamp does not move. Missing timing => null (not stalled).
function resolvePriorityRecoveryStepAge(stepsHistory, nowMs) {
  const latestEntry =
    Array.isArray(stepsHistory) && stepsHistory.length > NUM.ZERO ?
      stepsHistory[stepsHistory.length - NUM.ONE] :
      null;
  const enteredAtMs = normalizePriorityRecoveryInteger(
    latestEntry?.timestamp ?? latestEntry?.timestampMs,
  );
  const currentStepEnteredAtMs = Number.isFinite(enteredAtMs) ?
    enteredAtMs :
    null;
  const stepAgeMs =
    Number.isFinite(nowMs) && Number.isFinite(currentStepEnteredAtMs) ?
      Math.max(NUM.ZERO, nowMs - currentStepEnteredAtMs) :
      null;
  return {currentStepEnteredAtMs, stepAgeMs};
}

function buildPriorityRecoveryOperationContextFromRecord(record, options = {}) {
  if (!record || typeof record !== TYPEOF.OBJECT) {
    return null;
  }
  const nowMs = normalizePriorityRecoveryInteger(options.nowMs);
  const stepTimeoutMsByWorkflowStep =
    options.stepTimeoutMsByWorkflowStep &&
    typeof options.stepTimeoutMsByWorkflowStep === TYPEOF.OBJECT ?
      options.stepTimeoutMsByWorkflowStep :
      null;
  const normalizedRecord = normalizeReplicaOperationRecord(record, {
    ...(Number.isFinite(nowMs) ? {nowMs} : {}),
  });
  const operationId = String(
    normalizedRecord.operationId ||
      readFirstStringField(
        record,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
        'operationId',
      ) ||
      '',
  ).trim();
  if (operationId.length === NUM.ZERO) {
    return null;
  }
  const partitionId = String(
    normalizedRecord.partitionId ||
      normalizedRecord.partitionGroupId ||
      normalizedRecord.entityId ||
      '',
  ).trim();
  if (partitionId.length === NUM.ZERO) {
    return null;
  }
  const stepsHistory = parsePriorityRecoveryStepsHistory(
    record.stepsHistory ?? record.steps_history,
  );
  const timelineSteps = normalizePriorityRecoveryStringList(
    stepsHistory.map((entry) =>
      String(entry?.step || entry?.workflowStep || '').trim(),
    ),
  );
  const latestTimelineEntry =
    stepsHistory.length > NUM.ZERO ?
      stepsHistory[stepsHistory.length - NUM.ONE] :
      null;
  const {currentStepEnteredAtMs, stepAgeMs} =
    resolvePriorityRecoveryStepAge(stepsHistory, nowMs);
  return {
    operationId,
    partitionId,
    tableName: inferPriorityRecoveryTableNameFromPartitionId(partitionId),
    type: String(normalizedRecord.type || LOCAL_STR_EMPTY).toUpperCase(),
    status: String(normalizedRecord.status || LOCAL_STR_EMPTY).toLowerCase(),
    workflowStep: String(normalizedRecord.workflowStep || LOCAL_STR_EMPTY).toUpperCase(),
    sourceNodeId: normalizedRecord.sourceNodeId || null,
    targetNodeId: normalizedRecord.targetNodeId || null,
    replicaId: normalizedRecord.replicaId || null,
    createdAtMs: normalizePriorityRecoveryInteger(
      normalizedRecord.createdAt ??
        record[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT] ??
        record.createdAt,
    ),
    updatedAtMs: normalizePriorityRecoveryInteger(
      normalizedRecord.updatedAt ??
        record[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT] ??
        record.updatedAt,
    ),
    completedAtMs: normalizePriorityRecoveryInteger(
      normalizedRecord.completedAt ??
        record[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_COMPLETED_AT] ??
        record.completedAt,
    ),
    ageMs: normalizePriorityRecoveryInteger(normalizedRecord.ageMs),
    stepTimeoutMs: normalizePriorityRecoveryInteger(
      resolveStepTimeoutMs(normalizedRecord.workflowStep, {
        stepTimeoutMsByWorkflowStep,
      }),
    ),
    timelineLength: stepsHistory.length,
    timelineStepCount: timelineSteps.length,
    latestTimelineStep:
      String(
        latestTimelineEntry?.step ||
          latestTimelineEntry?.workflowStep ||
          PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
      ).toUpperCase() || null,
    latestTimelineStatus:
      String(
        latestTimelineEntry?.status ||
          latestTimelineEntry?.state ||
          PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
      ).toLowerCase() || null,
    latestTimelineInFlight: latestTimelineEntry?.inFlight === true,
    currentStepEnteredAtMs,
    stepAgeMs,
  };
}

const PRIORITY_RECOVERY_OPERATION_STEP_TERMINAL_STATE = Object.freeze({
  UNKNOWN: 'operation_step_terminal_unknown',
});

// Reconcile the two recorded truths about a drain op's progress. A drain op's
// record-level `workflowStep` column can lag behind its already-terminal timeline
// (write-through lag, CL-016/CL-035 family): the row still reads `STOPPING` while the
// operation timeline has reached `REMOVED/removed`. The classifier below consults the
// record step first, so a stale non-terminal `false` short-circuits and the finished op
// is wrongly counted active → `hasActiveOperationContexts` stays true → the partition is
// pinned in `spread_satisfied_in_flight` and operation_drain never closes. The
// reconciliation honors a terminal timeline step over a stale non-terminal record step,
// scoped to removal-completing REMOVE/REPLACE ops (ADD never retires here; REPLACE still
// requires its target ACTIVE_OPERATIONAL so a still-building replacement is never dropped,
// and an in-flight timeline entry blocks promotion).

function resolvePriorityRecoveryOperationStepTerminalState(
  operationType,
  workflowStep,
) {
  const normalizedOperationType = String(operationType || '').toUpperCase();
  const normalizedWorkflowStep = String(workflowStep || '').toUpperCase();
  if (
    normalizedOperationType.length === NUM.ZERO ||
    normalizedWorkflowStep.length === NUM.ZERO ||
    !isValidReplicaOperationStep(
      normalizedOperationType,
      normalizedWorkflowStep,
    )
  ) {
    return PRIORITY_RECOVERY_OPERATION_STEP_TERMINAL_STATE.UNKNOWN;
  }
  return isTerminalReplicaOperationStep(
    normalizedOperationType,
    normalizedWorkflowStep,
  );
}

// The single seam where the record `workflowStep` and the timeline `latestTimelineStep`
// disagree (the CL-016/CL-035 write-through lag) is reconciled: honor a terminal timeline
// step over a stale non-terminal record step, scoped so a still-building replacement is
// never dropped (ADD never retires here; REPLACE requires its target ACTIVE_OPERATIONAL).
// Reconciled in exactly one place so the over-removal fix has a single edit point instead
// of an inline clause in the precedence cascade.
function shouldRetireOnTerminalTimelineDespiteStaleStep(
  operationContext,
  operationType,
  workflowStepTerminalState,
  latestTimelineStepTerminalState,
) {
  return (
    workflowStepTerminalState === false &&
    latestTimelineStepTerminalState === true &&
    operationContext.latestTimelineInFlight !== true &&
    operationType !== OperationType.ADD &&
    (operationType !== OperationType.REPLACE ||
      operationContext.targetVisibilityState ===
        PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL)
  );
}

function isPriorityRecoveryOperationContextTerminal(operationContext) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return false;
  }
  const operationType = String(operationContext.type || '').toUpperCase();
  const workflowStepTerminalState =
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      operationContext.workflowStep,
    );
  if (workflowStepTerminalState === true) {
    return true;
  }
  const latestTimelineStepTerminalState =
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      operationContext.latestTimelineStep,
    );
  if (
    shouldRetireOnTerminalTimelineDespiteStaleStep(
      operationContext,
      operationType,
      workflowStepTerminalState,
      latestTimelineStepTerminalState,
    )
  ) {
    return true;
  }
  if (typeof workflowStepTerminalState === TYPEOF.BOOLEAN) {
    return workflowStepTerminalState;
  }
  if (typeof latestTimelineStepTerminalState === TYPEOF.BOOLEAN) {
    return latestTimelineStepTerminalState;
  }
  if (operationContext.latestTimelineInFlight === true) {
    return false;
  }
  const status = String(operationContext.status || '').toLowerCase();
  if (status.length === NUM.ZERO) {
    return false;
  }
  if (status === STATUS_ACTIVE) {
    return operationType !== OperationType.REPLACE;
  }
  return PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET.has(status);
}

function isPriorityRecoveryCompletedAddOperationContext(operationContext) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return false;
  }
  const operationType = String(operationContext.type || '').toUpperCase();
  if (operationType !== OperationType.ADD) {
    return false;
  }
  const workflowStep = String(
    operationContext.workflowStep || '',
  ).toUpperCase();
  if (
    workflowStep === PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE &&
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      workflowStep,
    ) === true
  ) {
    return true;
  }
  const latestTimelineStep = String(
    operationContext.latestTimelineStep || '',
  ).toUpperCase();
  return (
    latestTimelineStep === PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE &&
    operationContext.latestTimelineInFlight !== true &&
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      latestTimelineStep,
    ) === true
  );
}

function isPriorityRecoveryCompletedReplaceOperationContext(operationContext) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return false;
  }
  const operationType = String(operationContext.type || '').toUpperCase();
  if (operationType !== OperationType.REPLACE) {
    return false;
  }
  if (
    operationContext.targetVisibilityState !==
    PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL
  ) {
    return false;
  }
  if (isPriorityRecoveryOperationContextTerminal(operationContext)) {
    return true;
  }
  const workflowStep = String(
    operationContext.workflowStep || '',
  ).toUpperCase();
  if (
    workflowStep.length > NUM.ZERO &&
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      workflowStep,
    ) === true
  ) {
    return true;
  }
  const latestTimelineStep = String(
    operationContext.latestTimelineStep || '',
  ).toUpperCase();
  return (
    latestTimelineStep.length > NUM.ZERO &&
    operationContext.latestTimelineInFlight !== true &&
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      latestTimelineStep,
    ) === true
  );
}

function isPriorityRecoveryCompletedPlacementOperationContext(
  operationContext,
) {
  return (
    isPriorityRecoveryCompletedAddOperationContext(operationContext) ||
    isPriorityRecoveryCompletedReplaceOperationContext(operationContext)
  );
}

export {
  _resolvePriorityRecoveryTargetVisibilityState,
  buildPriorityRecoveryOperationContextFromRecord,
  resolvePriorityRecoveryStepAge,
  buildPriorityRecoveryReplicaOperationContexts,
  buildPriorityRecoveryTargetServiceEvidence,
  doesPriorityRecoveryServiceRowMatchOperationTarget,
  isPriorityRecoveryCompletedAddOperationContext,
  isPriorityRecoveryCompletedPlacementOperationContext,
  isPriorityRecoveryCompletedReplaceOperationContext,
  isPriorityRecoveryOperationContextTerminal,
  isPriorityRecoveryTargetServiceRowProgressing,
  parsePriorityRecoveryStepsHistory,
  resolvePriorityRecoveryOperationStepTerminalState,
  resolvePriorityRecoveryTargetServiceRowProgressTimestampMs,
  resolvePriorityRecoveryTargetServiceRowStatus,
  resolvePriorityRecoveryTargetServiceRowVisibilityState,
};
