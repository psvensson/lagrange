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
  for (const replicaOperationRow of buildPriorityRecoveryReplicaOperationSourceRows(
    replicaOperationRows,
    replicaOperationsSummary,
  )) {
    const builtContext = buildPriorityRecoveryReplicaOperationContext(
      replicaOperationRow,
      operationTimelineById,
      serviceRows,
      normalizedOptions,
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

function buildPriorityRecoveryTargetServiceEvidence(options = {}) {
  const operationContext =
    options.operationContext &&
    typeof options.operationContext === TYPEOF.OBJECT ?
      options.operationContext :
      null;
  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  let hasMatchingTargetServiceRow = false;
  let hasOperationalMatchingTargetServiceRow = false;
  let hasActiveMatchingTargetServiceRow = false;
  let hasTerminalMatchingTargetServiceRow = false;
  let targetServiceProgressAtMs =
    PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_UNAVAILABLE_AT_MS;
  for (const serviceRow of serviceRows) {
    if (
      !doesPriorityRecoveryServiceRowMatchOperationTarget(
        operationContext,
        serviceRow,
      )
    ) {
      continue;
    }
    hasMatchingTargetServiceRow = true;
    if (
      resolvePriorityRecoveryTargetServiceRowTerminalState(serviceRow) ===
      PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL
    ) {
      hasTerminalMatchingTargetServiceRow = true;
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
      targetServiceProgressAtMs = Math.max(
        targetServiceProgressAtMs,
        rowProgressAtMs,
      );
    }
    if (
      targetServiceRowVisibilityState ===
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL
    ) {
      hasOperationalMatchingTargetServiceRow = true;
      continue;
    }
    if (
      targetServiceRowVisibilityState ===
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_NON_OPERATIONAL
    ) {
      hasActiveMatchingTargetServiceRow = true;
    }
  }
  const visibilityState = [
    {
      matches: hasOperationalMatchingTargetServiceRow === true,
      state: PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
    },
    {
      matches: hasActiveMatchingTargetServiceRow === true,
      state: PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_NON_OPERATIONAL,
    },
    {
      matches: hasMatchingTargetServiceRow === true,
      state: PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.NON_ACTIVE,
    },
    {
      matches: true,
      state: PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ABSENT,
    },
  ].find((entry) => entry.matches === true).state;
  return Object.freeze({
    visibilityState,
    terminalState: hasMatchingTargetServiceRow === true ?
      hasTerminalMatchingTargetServiceRow === true ?
        PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL :
        PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.NON_TERMINAL :
      PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.UNKNOWN,
    ...(targetServiceProgressAtMs >
      PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_UNAVAILABLE_AT_MS ?
      {progressAtMs: targetServiceProgressAtMs} :
      {}),
  });
}

function _resolvePriorityRecoveryTargetVisibilityState(options = {}) {
  return buildPriorityRecoveryTargetServiceEvidence(options).visibilityState;
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
  };
}

// Op-retire-on-timeline-REMOVED lever (default-off). A drain op's record-level
// `workflowStep` column can lag behind its already-terminal timeline (write-through
// lag, CL-016/CL-035 family): the row still reads `STOPPING` while the operation
// timeline has reached `REMOVED/removed`. The classifier below consults the record
// step first, so a stale non-terminal `false` short-circuits and the finished op is
// wrongly counted active → `hasActiveOperationContexts` stays true → the partition
// is pinned in `spread_satisfied_in_flight` and operation_drain never closes. When
// enabled, a terminal timeline step is honored over a stale non-terminal record
// step (scoped to removal-completing REMOVE/REPLACE ops; REPLACE still requires its
// target to be ACTIVE_OPERATIONAL so a still-building replacement is never dropped).
const PRIORITY_RECOVERY_OP_RETIRE_ON_TIMELINE_REMOVED_FLAG =
  'LAGRANGE_PR_OP_RETIRE_ON_TIMELINE_REMOVED';
function isPriorityRecoveryOpRetireOnTimelineRemovedEnabled() {
  return (
    process.env[PRIORITY_RECOVERY_OP_RETIRE_ON_TIMELINE_REMOVED_FLAG] === 'true'
  );
}

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
    return null;
  }
  return isTerminalReplicaOperationStep(
    normalizedOperationType,
    normalizedWorkflowStep,
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
    isPriorityRecoveryOpRetireOnTimelineRemovedEnabled() &&
    workflowStepTerminalState === false &&
    latestTimelineStepTerminalState === true &&
    operationContext.latestTimelineInFlight !== true &&
    operationType !== OperationType.ADD &&
    (operationType !== OperationType.REPLACE ||
      operationContext.targetVisibilityState ===
        PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL)
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
