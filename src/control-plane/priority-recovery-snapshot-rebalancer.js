import {
  inferPriorityRecoveryTableNameFromPartitionId,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
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
  PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_COMPLETED_AT,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT,
  PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_OPERATION_TIMELINE_BY_ID,
  PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_ROWS,
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
} from './priority-recovery-snapshot-contract.js';
import {readFirstIntegerField, readFirstStringField} from './priority-recovery-snapshot-ingress.js';
import {buildPriorityRecoveryTargetServiceRowIndex, selectPriorityRecoveryTargetServiceRowsFromIndex} from './priority-recovery-target-service-row-index.js';
export {
  isPriorityRecoveryCompletedAddOperationContext,
  isPriorityRecoveryCompletedPlacementOperationContext,
  isPriorityRecoveryCompletedReplaceOperationContext,
  isPriorityRecoveryOperationContextTerminal,
  resolvePriorityRecoveryOperationStepTerminalState,
} from './priority-recovery-operation-context-state.js';

function normalizePriorityRecoveryReplicaOperationContextBuildOptions(
  options = {},
) {
  return {
    nowMs: normalizePriorityRecoveryInteger(options.nowMs),
    stepTimeoutMsByWorkflowStep:
      options.stepTimeoutMsByWorkflowStep &&
      typeof options.stepTimeoutMsByWorkflowStep === 'object' ?
        options.stepTimeoutMsByWorkflowStep :
        null,
  };
}

function resolvePriorityRecoveryOperationTimeline(
  operationTimelineById,
  operationId,
) {
  return Array.isArray(operationTimelineById[operationId]) ?
    operationTimelineById[operationId] :
    [];
}

function buildPriorityRecoveryReplicaOperationContext(
  replicaOperationRow,
  operationTimelineById,
  serviceRows,
  options = {},
) {
  const normalizedReplicaOperation = normalizeReplicaOperationRecord(
    replicaOperationRow,
    {
      ...(Number.isFinite(options.nowMs) ? {nowMs: options.nowMs} : {}),
    },
  );
  const operationId = String(
    normalizedReplicaOperation.operationId ||
      readFirstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
        'operationId',
      ) ||
      '',
  ).trim();
  if (operationId.length === 0) {
    return null;
  }
  const entityType = String(
    normalizedReplicaOperation.entityType ||
      PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION,
  ).toLowerCase();
  if (
    entityType !== PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION
  ) {
    return null;
  }
  const partitionId = String(
    normalizedReplicaOperation.partitionId ||
      normalizedReplicaOperation.partitionGroupId ||
      normalizedReplicaOperation.entityId ||
      '',
  ).trim();
  if (partitionId.length === 0) {
    return null;
  }
  const timeline = resolvePriorityRecoveryOperationTimeline(
    operationTimelineById,
    operationId,
  );
  const timelineSteps = normalizePriorityRecoveryStringList(
    timeline.map((entry) => String(entry?.step || '').trim()),
  );
  const latestTimelineEntry =
    timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const {currentStepEnteredAtMs, stepAgeMs} = resolvePriorityRecoveryStepAge(
    parsePriorityRecoveryStepsHistory(
      replicaOperationRow.stepsHistory ?? replicaOperationRow.steps_history,
    ),
    options.nowMs,
  );
  const targetServiceEvidence = buildPriorityRecoveryTargetServiceEvidence({
    operationContext: normalizedReplicaOperation,
    serviceRows,
    targetServiceRowIndex: options.targetServiceRowIndex,
  });
  const context = {
    operationId,
    partitionId,
    tableName: inferPriorityRecoveryTableNameFromPartitionId(partitionId),
    type: String(normalizedReplicaOperation.type || '').toUpperCase(),
    status: String(normalizedReplicaOperation.status || '').toLowerCase(),
    workflowStep: String(
      normalizedReplicaOperation.workflowStep || '',
    ).toUpperCase(),
    sourceNodeId: normalizedReplicaOperation.sourceNodeId || null,
    targetNodeId: normalizedReplicaOperation.targetNodeId || null,
    replicaId: normalizedReplicaOperation.replicaId || null,
    createdAtMs: normalizePriorityRecoveryInteger(
      normalizedReplicaOperation.createdAt ??
        replicaOperationRow[
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT
        ] ??
        replicaOperationRow.createdAt,
    ),
    updatedAtMs: normalizePriorityRecoveryInteger(
      normalizedReplicaOperation.updatedAt ??
        replicaOperationRow[
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT
        ] ??
        replicaOperationRow.updatedAt,
    ),
    completedAtMs: normalizePriorityRecoveryInteger(
      normalizedReplicaOperation.completedAt ??
        replicaOperationRow[
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_COMPLETED_AT
        ] ??
        replicaOperationRow.completedAt,
    ),
    ageMs: normalizePriorityRecoveryInteger(normalizedReplicaOperation.ageMs),
    stepTimeoutMs: normalizePriorityRecoveryInteger(
      resolveStepTimeoutMs(normalizedReplicaOperation.workflowStep, {
        stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
      }),
    ),
    timelineLength: timeline.length,
    timelineStepCount: timelineSteps.length,
    latestTimelineStep:
      String(latestTimelineEntry?.step || '').toUpperCase() || null,
    latestTimelineStatus:
      String(latestTimelineEntry?.status || '').toLowerCase() || null,
    latestTimelineInFlight: latestTimelineEntry?.inFlight === true,
    currentStepEnteredAtMs,
    stepAgeMs,
    targetVisibilityState: targetServiceEvidence.visibilityState,
    targetServiceTerminalState: targetServiceEvidence.terminalState,
    ...(Number.isFinite(targetServiceEvidence.progressAtMs) ?
      {targetServiceProgressAtMs: targetServiceEvidence.progressAtMs} :
      {}),
  };
  return {operationId, partitionId, context};
}

function resolvePriorityRecoveryReplicaOperationSummaryRows(
  replicaOperationsSummary = null,
) {
  const summaryRows =
    replicaOperationsSummary?.[
      PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_ROWS
    ];
  return Array.isArray(summaryRows) ? summaryRows : [];
}

function buildPriorityRecoveryReplicaOperationSourceRows(
  replicaOperationRows = [],
  replicaOperationsSummary = null,
) {
  const sourceRows = [];
  const sourceRowIndexByOperationId = {};
  const appendSourceRow = (sourceRow) => {
    if (!sourceRow || typeof sourceRow !== 'object') {
      return;
    }
    const operationId = String(
      readFirstStringField(
        sourceRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
        'operationId',
      ) || '',
    ).trim();
    if (operationId.length === 0) {
      sourceRows.push(sourceRow);
      return;
    }
    if (
      !Object.prototype.hasOwnProperty.call(
        sourceRowIndexByOperationId,
        operationId,
      )
    ) {
      sourceRowIndexByOperationId[operationId] = sourceRows.length;
      sourceRows.push(sourceRow);
      return;
    }
    sourceRows[sourceRowIndexByOperationId[operationId]] = sourceRow;
  };
  for (const replicaOperationRow of Array.isArray(replicaOperationRows) ?
    replicaOperationRows :
    []) {
    appendSourceRow(replicaOperationRow);
  }
  for (const summaryRow of resolvePriorityRecoveryReplicaOperationSummaryRows(
    replicaOperationsSummary,
  )) {
    appendSourceRow(summaryRow);
  }
  return sourceRows;
}

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
    ] === 'object' ?
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
    typeof stepsHistoryRaw !== 'string' ||
    stepsHistoryRaw.length === 0
  ) {
    return [];
  }
  return memoizedParseStepsHistoryString(stepsHistoryRaw);
}

function doesPriorityRecoveryServiceRowMatchOperationTarget(
  operationContext,
  serviceRow,
) {
  if (!operationContext || !serviceRow || typeof serviceRow !== 'object') {
    return false;
  }
  const targetNodeId = String(operationContext?.targetNodeId || '').trim();
  const partitionId = String(operationContext?.partitionId || '').trim();
  if (targetNodeId.length === 0 || partitionId.length === 0) {
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
  if (operationReplicaId.length === 0) {
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
    raftRole.length > 0 &&
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
    Number.isFinite(timestampMs) && timestampMs > 0,
  );
  return progressTimestampCandidates.length > 0 ?
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
  if (Number.isFinite(rowProgressAtMs) && rowProgressAtMs > 0) {
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
    typeof options.operationContext === 'object' ?
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
    Array.isArray(stepsHistory) && stepsHistory.length > 0 ?
      stepsHistory[stepsHistory.length - 1] :
      null;
  const enteredAtMs = normalizePriorityRecoveryInteger(
    latestEntry?.timestamp ?? latestEntry?.timestampMs,
  );
  const currentStepEnteredAtMs = Number.isFinite(enteredAtMs) ?
    enteredAtMs :
    null;
  const stepAgeMs =
    Number.isFinite(nowMs) && Number.isFinite(currentStepEnteredAtMs) ?
      Math.max(0, nowMs - currentStepEnteredAtMs) :
      null;
  return {currentStepEnteredAtMs, stepAgeMs};
}

function buildPriorityRecoveryOperationContextFromRecord(record, options = {}) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const nowMs = normalizePriorityRecoveryInteger(options.nowMs);
  const stepTimeoutMsByWorkflowStep =
    options.stepTimeoutMsByWorkflowStep &&
    typeof options.stepTimeoutMsByWorkflowStep === 'object' ?
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
  if (operationId.length === 0) {
    return null;
  }
  const partitionId = String(
    normalizedRecord.partitionId ||
      normalizedRecord.partitionGroupId ||
      normalizedRecord.entityId ||
      '',
  ).trim();
  if (partitionId.length === 0) {
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
    stepsHistory.length > 0 ?
      stepsHistory[stepsHistory.length - 1] :
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

export {
  _resolvePriorityRecoveryTargetVisibilityState,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryReplicaOperationContext,
  buildPriorityRecoveryReplicaOperationContexts,
  buildPriorityRecoveryReplicaOperationSourceRows,
  buildPriorityRecoveryTargetServiceEvidence,
  doesPriorityRecoveryServiceRowMatchOperationTarget,
  isPriorityRecoveryTargetServiceRowProgressing,
  normalizePriorityRecoveryReplicaOperationContextBuildOptions,
  parsePriorityRecoveryStepsHistory,
  resolvePriorityRecoveryOperationTimeline,
  resolvePriorityRecoveryReplicaOperationSummaryRows,
  resolvePriorityRecoveryStepAge,
  resolvePriorityRecoveryTargetServiceRowProgressTimestampMs,
  resolvePriorityRecoveryTargetServiceRowStatus,
  resolvePriorityRecoveryTargetServiceRowVisibilityState,
};
