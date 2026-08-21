import {NUM, TIME_MS, WORKFLOW_STEP} from '../constants/index.js';
import {resolveOperationCurrentStepEntry} from './operation-step-age.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {
  OperationType,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  buildReplicaOperationSemanticWitnesses,
  isReplaceRemoveDispatchPhase,
  isTerminalStep as isTerminalReplicaOperationStep,
  resolveReplicaOperationSemanticPhase,
} from './replica-status.js';
import {REBALANCER_DEFAULT} from './rebalancer-constants.js';
import {
  hasObservedCompletedReplicaOperation,
} from './replica-operation-observed-completion.js';
import {
  memoizedParseStepsHistoryString,
} from './steps-history-parse-memo.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_SYNCING = 'syncing';
const LOCAL_STR_CREATING = 'creating';
const LOCAL_STR_OPERATION_ID = 'operation_id';
const LOCAL_STR_OPERATIONID = 'operationId';
const LOCAL_STR_ENTITY_TYPE = 'entity_type';
const LOCAL_STR_ENTITYTYPE = 'entityType';
const LOCAL_STR_ENTITY_ID = 'entity_id';
const LOCAL_STR_ENTITYID = 'entityId';
const LOCAL_STR_SOURCE_NODE_ID = 'source_node_id';
const LOCAL_STR_SOURCENODEID = 'sourceNodeId';
const LOCAL_STR_SOURCE_REPLICA_ID = 'source_replica_id';
const LOCAL_STR_SOURCEREPLICAID = 'sourceReplicaId';
const LOCAL_STR_TARGET_NODE_ID = 'target_node_id';
const LOCAL_STR_TARGETNODEID = 'targetNodeId';
const LOCAL_STR_STEP = 'step';
const LOCAL_STR_TIMESTAMP = 'timestamp';
const LOCAL_STR_TIMESTAMPMS = 'timestampMs';

const UNKNOWN_STATUS = 'unknown';
const UNKNOWN_ENTITY_TYPE = 'unknown';
const UNKNOWN_PARTITION_GROUP_ID = 'unknown';
const UNKNOWN_WORKFLOW_STEP = 'UNKNOWN';
const REPLICA_OPERATION_STATUS_FAILED = 'failed';
const REPLICA_OPERATION_STATUS_ACTIVE = 'active';
const REPLICA_OPERATION_STATUS_REMOVED = 'removed';
const WORKFLOW_STEP_FAILED = 'FAILED';
const OPERATION_TIMELINE_EVENT_STEP = 'step';
const OPERATION_TIMELINE_EVENT_STATE = 'state';
const DEFAULT_TIMELINE_ENTRIES_PER_OPERATION = 16;
const HOURS_PER_DAY = NUM.THREE * NUM.EIGHT;
const MINUTES_PER_HOUR = NUM.THIRTY * 2;
const BOOTSTRAP_MOVE_ASSIGNMENT_OPERATION_TYPE = 'MOVE_ASSIGNMENT';
const STALE_TIMEOUT_CLASSIFICATION_LOOKBACK_MS =
  TIME_MS.MINUTE *
  HOURS_PER_DAY *
  MINUTES_PER_HOUR;
const PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS = TIME_MS.MINUTE;

const REPLICA_OPERATION_IN_FLIGHT_EXCLUDED_STATUSES = new Set([
  REPLICA_OPERATION_STATUS_REMOVED,
  REPLICA_OPERATION_STATUS_FAILED,
]);

const DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP = Object.freeze({
  [WORKFLOW_STEP.PENDING]:
    REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS,
  [WORKFLOW_STEP.SENDING]:
    REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS,
  [WORKFLOW_STEP.CREATING]:
    REBALANCER_DEFAULT.COORDINATOR.CREATING_TIMEOUT_MS,
  [WORKFLOW_STEP.SYNCING]:
    REBALANCER_DEFAULT.COORDINATOR.SYNCING_TIMEOUT_MS,
  [WORKFLOW_STEP.STOPPING]:
    REBALANCER_DEFAULT.COORDINATOR.REMOVING_TIMEOUT_MS,
});

function firstStringField(record, ...keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === LOCAL_STR_STRING && value.length > 0) {
      return value;
    }
  }
  return null;
}

function normalizeEpochMillis(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.floor(value);
}

function parseStepsHistory(stepsHistoryRaw) {
  if (!stepsHistoryRaw) {
    return [];
  }
  if (Array.isArray(stepsHistoryRaw)) {
    return stepsHistoryRaw;
  }
  if (typeof stepsHistoryRaw !== LOCAL_STR_STRING) {
    return [];
  }
  return memoizedParseStepsHistoryString(stepsHistoryRaw);
}

function inferPartitionIdFromReplicaId(replicaId) {
  const normalizedReplicaId = String(replicaId || '').trim();
  if (normalizedReplicaId.length === 0) {
    return null;
  }
  const match = normalizedReplicaId.match(/^(.*)-r\d+$/);
  if (!match || typeof match[1] !== LOCAL_STR_STRING) {
    return null;
  }
  const partitionId = match[1].trim();
  return partitionId.length > 0 ? partitionId : null;
}

function inferNodeIdFromPeerAddress(address) {
  const normalizedAddress = String(address || '').trim();
  if (normalizedAddress.length === 0) {
    return null;
  }
  const slashIndex = normalizedAddress.indexOf('/');
  if (slashIndex === 0) {
    return null;
  }
  if (slashIndex > 0) {
    return normalizedAddress.slice(0, slashIndex);
  }
  return normalizedAddress;
}

function inferTargetNodeIdFromStepsHistory(stepsHistory, replicaId) {
  const normalizedReplicaId = String(replicaId || '').trim();
  const normalizedStepsHistory = Array.isArray(stepsHistory) ?
    stepsHistory :
    [];
  for (let index = normalizedStepsHistory.length - 1;
    index >= 0;
    index -= 1) {
    const entry = normalizedStepsHistory[index];
    if (!entry || typeof entry !== LOCAL_STR_OBJECT) {
      continue;
    }
    const replicaIds = Array.isArray(entry.replicaIds) ?
      entry.replicaIds :
      [];
    const peerAddresses = Array.isArray(entry.peerAddresses) ?
      entry.peerAddresses :
      [];
    if (normalizedReplicaId.length > 0 &&
        replicaIds.length > 0 &&
        replicaIds.length === peerAddresses.length) {
      const replicaIndex = replicaIds.findIndex((candidateReplicaId) =>
        String(candidateReplicaId || '').trim() === normalizedReplicaId,
      );
      if (replicaIndex >= 0) {
        const peerNodeId = inferNodeIdFromPeerAddress(
          peerAddresses[replicaIndex],
        );
        if (peerNodeId) {
          return peerNodeId;
        }
      }
    }
    const readinessNodeId = firstStringField(
      entry?.readinessSnapshot,
      'nodeId',
      'node_id',
    );
    if (readinessNodeId) {
      return readinessNodeId;
    }
  }
  return null;
}

function inferOperationTypeFromStepsHistory(
  stepsHistory,
  replicaId,
  workflowStep,
  status,
) {
  const normalizedReplicaId = String(replicaId || '').trim();
  const normalizedWorkflowStep = String(workflowStep || '').toUpperCase();
  const normalizedStatus = String(status || '').toLowerCase();
  const normalizedStepsHistory = Array.isArray(stepsHistory) ?
    stepsHistory :
    [];
  const timelineSteps = new Set(
    normalizedStepsHistory.map((entry) =>
      String(entry?.step || '').toUpperCase(),
    ).filter((step) => step.length > 0),
  );
  let sourceReplicaId = null;
  for (const entry of normalizedStepsHistory) {
    const candidateSourceReplicaId = firstStringField(
      entry,
      'sourceReplicaId',
      'source_replica_id',
    );
    if (!candidateSourceReplicaId) {
      continue;
    }
    sourceReplicaId = candidateSourceReplicaId;
    break;
  }
  if (timelineSteps.has(WORKFLOW_STEP.STOPPING) ||
      normalizedWorkflowStep === WORKFLOW_STEP.STOPPING ||
      normalizedWorkflowStep === WORKFLOW_STEP_FAILED &&
        timelineSteps.has(WORKFLOW_STEP.STOPPING)) {
    return OperationType.REMOVE;
  }
  if (sourceReplicaId &&
      normalizedReplicaId.length > 0 &&
      sourceReplicaId !== normalizedReplicaId) {
    return OperationType.REPLACE;
  }
  if (timelineSteps.has(WORKFLOW_STEP.CREATING) ||
      timelineSteps.has(WORKFLOW_STEP.SYNCING) ||
      normalizedWorkflowStep === WORKFLOW_STEP.CREATING ||
      normalizedWorkflowStep === WORKFLOW_STEP.SYNCING ||
      normalizedStatus === LOCAL_STR_SYNCING ||
      normalizedStatus === LOCAL_STR_CREATING) {
    return sourceReplicaId ? OperationType.REPLACE : OperationType.ADD;
  }
  return null;
}

function inferSourceReplicaIdFromStepsHistory(stepsHistory) {
  const normalizedStepsHistory = Array.isArray(stepsHistory) ?
    stepsHistory :
    [];
  for (const entry of normalizedStepsHistory) {
    const sourceReplicaId = firstStringField(
      entry,
      'sourceReplicaId',
      'source_replica_id',
    );
    if (sourceReplicaId) {
      return sourceReplicaId;
    }
  }
  return null;
}

function resolveStepEnteredAtMs(record) {
  const stepEntry = resolveOperationCurrentStepEntry(record);
  if (!stepEntry) {
    return null;
  }
  return normalizeEpochMillis(stepEntry.timestamp);
}

function resolveAgeMs(record, nowMs) {
  // Prefer time-in-current-step over updatedAt: a wedged op whose dispatch retry
  // loop re-persists updatedAt every ~1s would otherwise read as perpetually
  // young, so staleness consumers (isReplicaOperationStale -> topology-settling
  // gate, follow-up planning) could never classify it stale (CL-044).
  const stepEnteredAtMs = resolveStepEnteredAtMs(record);
  const referenceAtMs = Number.isFinite(stepEnteredAtMs) ?
    stepEnteredAtMs :
    normalizeEpochMillis(record?.updatedAt ?? record?.createdAt);
  if (!Number.isFinite(referenceAtMs) || !Number.isFinite(nowMs)) {
    return null;
  }
  return Math.max(0, Math.floor(nowMs - referenceAtMs));
}

function normalizeReplicaOperationRecord(row, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const type = String(firstStringField(
    row,
    'type',
    'operation_type',
    'operationType',
  ) || '').toUpperCase();
  const status = String(firstStringField(
    row,
    'status',
  ) || '').toLowerCase();
  const workflowStep = String(firstStringField(
    row,
    'workflow_step',
    'workflowStep',
  ) || '').toUpperCase();
  const createdAt = normalizeEpochMillis(
    row?.created_at ?? row?.createdAt,
  );
  const updatedAt = normalizeEpochMillis(
    row?.updated_at ?? row?.updatedAt,
  );
  const completedAt = normalizeEpochMillis(
    row?.completed_at ?? row?.completedAt,
  );
  const hasCompletedAt = completedAt !== null;
  const stepsHistory = parseStepsHistory(
    row?.steps_history ?? row?.stepsHistory,
  );
  const replicaId = String(firstStringField(
    row,
    'replica_id',
    'replicaId',
    'service_id',
    'serviceId',
  ) || '');
  const inferredPartitionGroupId =
    inferPartitionIdFromReplicaId(replicaId);
  const partitionGroupId = String(firstStringField(
    row,
    'partition_group_id',
    'partitionGroupId',
    'partition_id',
    'partitionId',
    'entity_id',
    'entityId',
  ) || inferredPartitionGroupId || UNKNOWN_PARTITION_GROUP_ID);
  const inferredType = inferOperationTypeFromStepsHistory(
    stepsHistory,
    replicaId,
    workflowStep,
    status,
  );
  const inferredTargetNodeId = inferTargetNodeIdFromStepsHistory(
    stepsHistory,
    replicaId,
  );
  const inferredSourceReplicaId =
    inferSourceReplicaIdFromStepsHistory(stepsHistory);
  const semanticPhase = resolveReplicaOperationSemanticPhase(
    type || inferredType || '',
    workflowStep,
    status,
  );
  const witnesses = buildReplicaOperationSemanticWitnesses(
    type || inferredType || '',
    workflowStep,
    status,
  );

  return {
    operationId: String(firstStringField(
      row,
      LOCAL_STR_OPERATION_ID,
      LOCAL_STR_OPERATIONID,
    ) || ''),
    type: type || inferredType || '',
    status,
    workflowStep,
    partitionGroupId,
    partitionId: partitionGroupId,
    entityType: String(firstStringField(
      row,
      LOCAL_STR_ENTITY_TYPE,
      LOCAL_STR_ENTITYTYPE,
    ) || UNKNOWN_ENTITY_TYPE).toLowerCase(),
    entityId: String(firstStringField(
      row,
      LOCAL_STR_ENTITY_ID,
      LOCAL_STR_ENTITYID,
    ) || UNKNOWN_PARTITION_GROUP_ID),
    sourceNodeId: String(firstStringField(
      row,
      LOCAL_STR_SOURCE_NODE_ID,
      LOCAL_STR_SOURCENODEID,
    ) || ''),
    sourceReplicaId: String(firstStringField(
      row,
      LOCAL_STR_SOURCE_REPLICA_ID,
      LOCAL_STR_SOURCEREPLICAID,
    ) || inferredSourceReplicaId || ''),
    replicaId,
    targetNodeId: String(firstStringField(
      row,
      LOCAL_STR_TARGET_NODE_ID,
      LOCAL_STR_TARGETNODEID,
    ) || inferredTargetNodeId || ''),
    createdAt,
    updatedAt,
    completedAt,
    hasCompletedAt,
    stepsHistory,
    ageMs: resolveAgeMs(
      {updatedAt, createdAt, stepsHistory, workflowStep},
      nowMs,
    ),
    semanticPhase,
    witnesses,
  };
}

function isReplicaOperationTerminalSuccess(record) {
  if (!record?.type || !record?.status) {
    return false;
  }
  if (record.witnesses?.failureWitness === true ||
      record.status === REPLICA_OPERATION_STATUS_FAILED ||
      record.workflowStep === WORKFLOW_STEP_FAILED) {
    return false;
  }
  if (record.witnesses?.settlementWitness === true) {
    return true;
  }
  if (record.workflowStep &&
      isTerminalReplicaOperationStep(record.type, record.workflowStep)) {
    return true;
  }
  if (!record.hasCompletedAt) {
    return false;
  }
  if (record.type === OperationType.ADD) {
    return record.status === REPLICA_OPERATION_STATUS_ACTIVE;
  }
  if (record.type === BOOTSTRAP_MOVE_ASSIGNMENT_OPERATION_TYPE) {
    return record.status === REPLICA_OPERATION_STATUS_ACTIVE;
  }
  return record.status === REPLICA_OPERATION_STATUS_REMOVED;
}

function isReplicaOperationExplicitlyExcludedFromInFlight(record) {
  const normalizedStatus = String(record?.status || '').toLowerCase();
  if (REPLICA_OPERATION_IN_FLIGHT_EXCLUDED_STATUSES.has(normalizedStatus)) {
    return true;
  }
  if (record?.semanticPhase === REPLICA_OPERATION_SEMANTIC_PHASE.FAILED ||
      record?.semanticPhase === REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED) {
    return true;
  }
  if (normalizedStatus !== REPLICA_OPERATION_STATUS_ACTIVE) {
    return false;
  }
  if (record?.type === BOOTSTRAP_MOVE_ASSIGNMENT_OPERATION_TYPE) {
    return false;
  }
  return !isReplaceRemoveDispatchPhase(record);
}

function resolveRecordOwnerNodeId(record) {
  const sourceNodeId = String(record?.sourceNodeId || record?.source_node_id || '');
  const targetNodeId = String(record?.targetNodeId || record?.target_node_id || '');
  const type = record?.type;
  const step = record?.workflowStep || record?.workflow_step;
  const status = record?.status;
  const partitionId = String(record?.partitionId || record?.partitionGroupId || record?.partition_id || '');

  const semanticPhase = record?.semanticPhase ||
    resolveReplicaOperationSemanticPhase(
      type || null,
      step || null,
      status || null,
    );

  const isUnsettledReplace = type === OperationType.REPLACE &&
    targetNodeId.length > 0 &&
    semanticPhase !== REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED &&
    semanticPhase !== REPLICA_OPERATION_SEMANTIC_PHASE.FAILED;

  const isPriorityOrSystem = partitionId.startsWith('replica_operations-') ||
    partitionId.startsWith('sql_transactions-') ||
    partitionId.startsWith('sql_transaction_participants-') ||
    partitionId.startsWith('sql_write_operations-') ||
    partitionId.startsWith('control_plane_publications-') ||
    partitionId.startsWith('nodes-') ||
    partitionId.startsWith('services-');

  if (isUnsettledReplace && isPriorityOrSystem) {
    return targetNodeId;
  }
  if (sourceNodeId.length > 0) {
    return sourceNodeId;
  }
  if (targetNodeId.length > 0) {
    return targetNodeId;
  }
  return null;
}

function getOwnerNodeStartMs(ownerNodeId, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ?
    Math.floor(options.nowMs) :
    Date.now();

  // Try to find the start time from options.serviceRows
  if (ownerNodeId && Array.isArray(options.serviceRows)) {
    let maxStartMs = 0;
    for (const service of options.serviceRows) {
      const sNodeId = service?.nodeId || service?.node_id;
      if (sNodeId === ownerNodeId) {
        const startMs = normalizeEpochMillis(service?.startedAt || service?.started_at);
        if (Number.isFinite(startMs) && startMs > maxStartMs) {
          maxStartMs = startMs;
        }
      }
    }
    if (maxStartMs > 0) {
      return maxStartMs;
    }
  }

  // Fall back to local process start time
  const uptimeSec = typeof process !== 'undefined' && typeof process.uptime === 'function' ?
    process.uptime() :
    0;
  return nowMs - Math.floor(uptimeSec * TIME_MS.SECOND);
}

function isReplicaOperationInFlight(record, options = {}) {
  if (!record || typeof record !== LOCAL_STR_OBJECT) {
    return false;
  }
  if (isReplicaOperationExplicitlyExcludedFromInFlight(record)) {
    return false;
  }
  if (isReplicaOperationTerminalSuccess(record)) {
    return false;
  }
  if (options.ignorePreRestart === true) {
    const updatedAtMs = normalizeEpochMillis(record?.updatedAt);
    const ownerNodeId = resolveRecordOwnerNodeId(record);
    const ownerNodeStartMs = getOwnerNodeStartMs(ownerNodeId, options);
    if (Number.isFinite(updatedAtMs) && updatedAtMs < ownerNodeStartMs) {
      return false;
    }
  }
  return !hasObservedCompletedReplicaOperation(record, options);
}

function resolveStepTimeoutMs(workflowStep, options = {}) {
  if (!workflowStep) {
    return null;
  }
  const timeoutByStep = options.stepTimeoutMsByWorkflowStep &&
    typeof options.stepTimeoutMsByWorkflowStep === 'object' ?
    options.stepTimeoutMsByWorkflowStep :
    DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP;
  const timeoutMs = Number(timeoutByStep[workflowStep]);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return null;
  }
  const normalizedTimeoutMs = Math.floor(timeoutMs);
  const partitionId = String(options.partitionId || '').trim();
  // Census run2 rank3: the quiescence oracle (which passes
  // capSyncingStaleTimeoutForAllPartitions) must cap the SYNCING stale-classification
  // timeout for EVERY partition, not just priority control-plane ones. The binding
  // phantom-SYNCING ops are on NON-priority partitions (latency_groups, storage_reservations)
  // whose generic SYNCING timeout (300s) EQUALS the quiescence wait budget, so a wedged
  // op (replica creation already complete, SYNCING->ACTIVE advance orphaned by leadership
  // churn) is counted effectiveInFlight for the whole window and the 15s quiet window never
  // closes. The cap is scoped to the ORACLE call site ONLY — the coordinator's own
  // staleness/reaper calls do not pass the flag, so its real retry budget is unchanged.
  if (
    workflowStep === WORKFLOW_STEP.SYNCING &&
    (classifySystemPartition({partitionId}).priorityControlPlane ||
      options.capSyncingStaleTimeoutForAllPartitions === true)
  ) {
    return Math.min(
      normalizedTimeoutMs,
      PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS,
    );
  }
  return normalizedTimeoutMs;
}

function isReplicaOperationStale(record, options = {}) {
  if (!isReplicaOperationInFlight(record, options)) {
    return false;
  }
  const nowMs = Number.isFinite(options.nowMs) ?
    Math.floor(options.nowMs) :
    Date.now();
  const updatedAtMs = normalizeEpochMillis(record?.updatedAt);
  if (options.ignorePreRestart === true) {
    const ownerNodeId = resolveRecordOwnerNodeId(record);
    const ownerNodeStartMs = getOwnerNodeStartMs(ownerNodeId, options);
    if (Number.isFinite(updatedAtMs) && updatedAtMs < ownerNodeStartMs) {
      return false;
    }
  }
  const staleTimeoutLookbackMs = Number.isFinite(
    options.staleTimeoutLookbackMs,
  ) && options.staleTimeoutLookbackMs > 0 ?
    Math.floor(options.staleTimeoutLookbackMs) :
    STALE_TIMEOUT_CLASSIFICATION_LOOKBACK_MS;
  if (Number.isFinite(updatedAtMs) &&
      nowMs - updatedAtMs > staleTimeoutLookbackMs) {
    return false;
  }
  const timeoutMs = resolveStepTimeoutMs(record.workflowStep, {
    ...options,
    partitionId: record.partitionId,
  });
  if (!Number.isFinite(timeoutMs)) {
    return false;
  }
  const ageMs = Number(record.ageMs);
  if (!Number.isFinite(ageMs)) {
    return false;
  }
  return ageMs >= timeoutMs;
}

function normalizeTimelineEventEntry(event, operationId, nowMs) {
  if (!event || typeof event !== LOCAL_STR_OBJECT) {
    return null;
  }
  const step = String(event.step || '').toUpperCase();
  const timestampMs = normalizeEpochMillis(
    event.timestamp ?? event.timestampMs,
  );
  if (!step || !Number.isFinite(timestampMs)) {
    return null;
  }
  const metadata = {};
  for (const [key, value] of Object.entries(event)) {
    if (key === LOCAL_STR_STEP || key === LOCAL_STR_TIMESTAMP || key === LOCAL_STR_TIMESTAMPMS) {
      continue;
    }
    metadata[key] = value;
  }
  return {
    eventType: OPERATION_TIMELINE_EVENT_STEP,
    operationId,
    step,
    timestampMs,
    ageMs: Number.isFinite(nowMs) ?
      Math.max(0, Math.floor(nowMs - timestampMs)) :
      null,
    ...(Object.keys(metadata).length > 0 ?
      {metadata} :
      {}),
  };
}

function buildReplicaOperationTimeline(record, options = {}) {
  if (!record?.operationId) {
    return [];
  }
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const maxEntries = Number.isInteger(options.maxEntriesPerOperation) &&
    options.maxEntriesPerOperation > 0 ?
    options.maxEntriesPerOperation :
    DEFAULT_TIMELINE_ENTRIES_PER_OPERATION;
  const timeline = [];

  for (const entry of record.stepsHistory || []) {
    const normalizedEntry = normalizeTimelineEventEntry(
      entry,
      record.operationId,
      nowMs,
    );
    if (normalizedEntry) {
      timeline.push(normalizedEntry);
    }
  }

  if (options.includeCurrentState !== false &&
      record.workflowStep &&
      Number.isFinite(record.updatedAt)) {
    timeline.push({
      eventType: OPERATION_TIMELINE_EVENT_STATE,
      operationId: record.operationId,
      step: record.workflowStep,
      timestampMs: record.updatedAt,
      ageMs: Number.isFinite(record.ageMs) ? record.ageMs : null,
      status: record.status || UNKNOWN_STATUS,
      inFlight: isReplicaOperationInFlight(record, options),
      staleTimeout: isReplicaOperationStale(record, options),
      timeoutMs: resolveStepTimeoutMs(record.workflowStep, {
        ...options,
        partitionId: record.partitionId,
      }),
    });
  }

  timeline.sort((left, right) => {
    const leftTs = Number(left?.timestampMs || 0);
    const rightTs = Number(right?.timestampMs || 0);
    return leftTs - rightTs;
  });
  if (timeline.length <= maxEntries) {
    return timeline;
  }
  return timeline.slice(timeline.length - maxEntries);
}

function summarizeReplicaOperationLiveness(rows = [], options = {}) {
  const scopedPartitionIds = options.partitionIds instanceof Set &&
    options.partitionIds.size > 0 ?
    options.partitionIds :
    null;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const includeTimeline = options.includeTimeline !== false;
  const statusHistogram = {};
  const stepHistogram = {};
  const semanticPhaseHistogram = {};
  const partitionGroupInFlight = {};
  const operationTimelineById = {};
  const inFlightOperationIds = [];
  const visibleRows = [];
  let inFlightCount = 0;
  let staleInFlightCount = 0;
  let oldestInFlightAgeMs = null;

  for (const row of rows) {
    const record = normalizeReplicaOperationRecord(row, {nowMs});
    if (scopedPartitionIds &&
        !scopedPartitionIds.has(record.partitionGroupId)) {
      continue;
    }
    visibleRows.push(record);
    const statusKey = record.status || UNKNOWN_STATUS;
    statusHistogram[statusKey] = (statusHistogram[statusKey] || 0) + 1;
    const semanticPhaseKey =
      record.semanticPhase || REPLICA_OPERATION_SEMANTIC_PHASE.UNKNOWN;
    semanticPhaseHistogram[semanticPhaseKey] =
      (semanticPhaseHistogram[semanticPhaseKey] || 0) + 1;

    if (includeTimeline && record.operationId) {
      operationTimelineById[record.operationId] =
        buildReplicaOperationTimeline(record, {
          ...options,
          nowMs,
          includeCurrentState: true,
        });
    }

    if (!isReplicaOperationInFlight(record, options)) {
      continue;
    }

    inFlightCount += 1;
    inFlightOperationIds.push(record.operationId);
    partitionGroupInFlight[record.partitionGroupId] =
      (partitionGroupInFlight[record.partitionGroupId] || 0) + 1;
    const stepKey = record.workflowStep || UNKNOWN_WORKFLOW_STEP;
    stepHistogram[stepKey] = (stepHistogram[stepKey] || 0) + 1;

    if (Number.isFinite(record.ageMs)) {
      oldestInFlightAgeMs = oldestInFlightAgeMs === null ?
        record.ageMs :
        Math.max(oldestInFlightAgeMs, record.ageMs);
    }

    if (isReplicaOperationStale(record, options)) {
      staleInFlightCount += 1;
    }
  }

  return {
    inFlightCount,
    statusHistogram,
    semanticPhaseHistogram,
    partitionGroupInFlight,
    stepHistogram,
    oldestInFlightAgeMs,
    staleInFlightCount,
    inFlightOperationIds,
    operationTimelineById,
    rows: visibleRows,
  };
}

export {
  DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP,
  REPLICA_OPERATION_IN_FLIGHT_EXCLUDED_STATUSES,
  buildReplicaOperationTimeline,
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  isReplicaOperationTerminalSuccess,
  normalizeReplicaOperationRecord,
  resolveStepTimeoutMs,
  summarizeReplicaOperationLiveness,
};
