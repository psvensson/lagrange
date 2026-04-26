import {NUM, TIME_MS, WORKFLOW_STEP} from '../constants/index.js';
import {
  OperationType,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  buildReplicaOperationSemanticWitnesses,
  isReplaceRemoveDispatchPhase,
  isTerminalStep as isTerminalReplicaOperationStep,
  resolveReplicaOperationSemanticPhase,
} from './replica-status.js';
import {REBALANCER_DEFAULT} from './rebalancer-constants.js';

const UNKNOWN_STATUS = 'unknown';
const UNKNOWN_PARTITION_GROUP_ID = 'unknown';
const UNKNOWN_WORKFLOW_STEP = 'UNKNOWN';
const REPLICA_OPERATION_STATUS_FAILED = 'failed';
const REPLICA_OPERATION_STATUS_ACTIVE = 'active';
const REPLICA_OPERATION_STATUS_REMOVING = 'removing';
const REPLICA_OPERATION_STATUS_REMOVED = 'removed';
const WORKFLOW_STEP_FAILED = 'FAILED';
const OPERATION_TIMELINE_EVENT_STEP = 'step';
const OPERATION_TIMELINE_EVENT_STATE = 'state';
const DEFAULT_TIMELINE_ENTRIES_PER_OPERATION = 16;
const HOURS_PER_DAY = NUM.THREE * NUM.EIGHT;
const MINUTES_PER_HOUR = NUM.THIRTY * NUM.TWO;
const SERVICE_TYPE_PARTITION = 'partition';
const SERVICE_TYPE_MESSAGE_GROUP = 'message_group';
const BOOTSTRAP_MOVE_ASSIGNMENT_OPERATION_TYPE = 'MOVE_ASSIGNMENT';
const STALE_TIMEOUT_CLASSIFICATION_LOOKBACK_MS =
  TIME_MS.MINUTE *
  HOURS_PER_DAY *
  MINUTES_PER_HOUR;

const REPLICA_OPERATION_IN_FLIGHT_EXCLUDED_STATUSES = new Set([
  REPLICA_OPERATION_STATUS_REMOVED,
  REPLICA_OPERATION_STATUS_FAILED,
]);
const REPLACE_SOURCE_RETIREMENT_BLOCKING_STATUSES = new Set([
  REPLICA_OPERATION_STATUS_ACTIVE,
  REPLICA_OPERATION_STATUS_REMOVING,
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
    if (typeof value === 'string' && value.length > NUM.ZERO) {
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
  if (typeof stepsHistoryRaw !== 'string') {
    return [];
  }
  try {
    const parsed = JSON.parse(stepsHistoryRaw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function inferPartitionIdFromReplicaId(replicaId) {
  const normalizedReplicaId = String(replicaId || '').trim();
  if (normalizedReplicaId.length === NUM.ZERO) {
    return null;
  }
  const match = normalizedReplicaId.match(/^(.*)-r\d+$/);
  if (!match || typeof match[1] !== 'string') {
    return null;
  }
  const partitionId = match[1].trim();
  return partitionId.length > NUM.ZERO ? partitionId : null;
}

function inferNodeIdFromPeerAddress(address) {
  const normalizedAddress = String(address || '').trim();
  if (normalizedAddress.length === NUM.ZERO) {
    return null;
  }
  const slashIndex = normalizedAddress.indexOf('/');
  if (slashIndex === NUM.ZERO) {
    return null;
  }
  if (slashIndex > NUM.ZERO) {
    return normalizedAddress.slice(NUM.ZERO, slashIndex);
  }
  return normalizedAddress;
}

function inferTargetNodeIdFromStepsHistory(stepsHistory, replicaId) {
  const normalizedReplicaId = String(replicaId || '').trim();
  const normalizedStepsHistory = Array.isArray(stepsHistory) ?
    stepsHistory :
    [];
  for (let index = normalizedStepsHistory.length - NUM.ONE;
    index >= NUM.ZERO;
    index -= NUM.ONE) {
    const entry = normalizedStepsHistory[index];
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const replicaIds = Array.isArray(entry.replicaIds) ?
      entry.replicaIds :
      [];
    const peerAddresses = Array.isArray(entry.peerAddresses) ?
      entry.peerAddresses :
      [];
    if (normalizedReplicaId.length > NUM.ZERO &&
        replicaIds.length > NUM.ZERO &&
        replicaIds.length === peerAddresses.length) {
      const replicaIndex = replicaIds.findIndex((candidateReplicaId) =>
        String(candidateReplicaId || '').trim() === normalizedReplicaId,
      );
      if (replicaIndex >= NUM.ZERO) {
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
    ).filter((step) => step.length > NUM.ZERO),
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
      normalizedReplicaId.length > NUM.ZERO &&
      sourceReplicaId !== normalizedReplicaId) {
    return OperationType.REPLACE;
  }
  if (timelineSteps.has(WORKFLOW_STEP.CREATING) ||
      timelineSteps.has(WORKFLOW_STEP.SYNCING) ||
      normalizedWorkflowStep === WORKFLOW_STEP.CREATING ||
      normalizedWorkflowStep === WORKFLOW_STEP.SYNCING ||
      normalizedStatus === 'syncing' ||
      normalizedStatus === 'creating') {
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

function resolveAgeMs(record, nowMs) {
  const referenceAtMs = normalizeEpochMillis(
    record?.updatedAt ?? record?.createdAt,
  );
  if (!Number.isFinite(referenceAtMs) || !Number.isFinite(nowMs)) {
    return null;
  }
  return Math.max(NUM.ZERO, Math.floor(nowMs - referenceAtMs));
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
      'operation_id',
      'operationId',
    ) || ''),
    type: type || inferredType || '',
    status,
    workflowStep,
    partitionGroupId,
    partitionId: partitionGroupId,
    entityType: String(firstStringField(
      row,
      'entity_type',
      'entityType',
    ) || SERVICE_TYPE_PARTITION).toLowerCase(),
    entityId: String(firstStringField(
      row,
      'entity_id',
      'entityId',
      'partition_group_id',
      'partitionGroupId',
      'partition_id',
      'partitionId',
    ) || inferredPartitionGroupId || UNKNOWN_PARTITION_GROUP_ID),
    sourceNodeId: String(firstStringField(
      row,
      'source_node_id',
      'sourceNodeId',
    ) || ''),
    sourceReplicaId: String(firstStringField(
      row,
      'source_replica_id',
      'sourceReplicaId',
    ) || inferredSourceReplicaId || ''),
    replicaId,
    targetNodeId: String(firstStringField(
      row,
      'target_node_id',
      'targetNodeId',
    ) || inferredTargetNodeId || ''),
    createdAt,
    updatedAt,
    completedAt,
    hasCompletedAt,
    stepsHistory,
    ageMs: resolveAgeMs({updatedAt, createdAt}, nowMs),
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

function hasObservedActiveTargetReplica(record, options = {}) {
  if (
    record?.type !== OperationType.ADD &&
    record?.type !== OperationType.REPLACE
  ) {
    return hasObservedActiveTargetServiceOwnership(record, options);
  }

  const replicaId = String(record?.replicaId || '');
  const entityType = String(
    record?.entityType || SERVICE_TYPE_PARTITION,
  ).toLowerCase();
  const entityId = String(
    record?.entityId || record?.partitionGroupId || '',
  );
  const targetNodeId = String(record?.targetNodeId || '');
  if (!replicaId || !entityId || !targetNodeId) {
    return false;
  }

  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  return serviceRows.some((serviceRow) =>
    doesObservedActiveTargetReplicaServiceRowMatch(
      serviceRow,
      entityType,
      entityId,
      targetNodeId,
      replicaId,
    ),
  );
}
function doesObservedActiveTargetReplicaServiceRowMatch(
  serviceRow,
  entityType,
  entityId,
  targetNodeId,
  replicaId,
) {
  const serviceType = String(firstStringField(
    serviceRow,
    'service_type',
    'serviceType',
    'type',
  ) || '').toLowerCase();
  if (serviceType && serviceType !== entityType) {
    return false;
  }
  if (String(firstStringField(
    serviceRow,
    'status',
  ) || '').toLowerCase() !== REPLICA_OPERATION_STATUS_ACTIVE) {
    return false;
  }
  if (String(firstStringField(
    serviceRow,
    'node_id',
    'nodeId',
  ) || '') !== targetNodeId) {
    return false;
  }
  const serviceReplicaId = firstStringField(
    serviceRow,
    'replica_id',
    'replicaId',
    'service_id',
    'serviceId',
    'id',
  );
  if (serviceReplicaId !== replicaId) {
    return false;
  }
  if (entityType === SERVICE_TYPE_PARTITION) {
    return String(firstStringField(
      serviceRow,
      'partition_id',
      'partitionId',
      'id',
    ) || '') === entityId;
  }
  if (entityType === SERVICE_TYPE_MESSAGE_GROUP) {
    return String(firstStringField(
      serviceRow,
      'group_id',
      'groupId',
      'id',
    ) || '') === entityId;
  }
  return true;
}

function doesObservedSourceReplicaServiceRowBlockRetirement(
  serviceRow,
  entityType,
  entityId,
  sourceReplicaId,
) {
  const serviceType = String(firstStringField(
    serviceRow,
    'service_type',
    'serviceType',
    'type',
  ) || '').toLowerCase();
  if (serviceType && serviceType !== entityType) {
    return false;
  }
  const status = String(firstStringField(
    serviceRow,
    'status',
  ) || '').toLowerCase();
  if (!REPLACE_SOURCE_RETIREMENT_BLOCKING_STATUSES.has(status)) {
    return false;
  }
  const serviceReplicaId = firstStringField(
    serviceRow,
    'replica_id',
    'replicaId',
    'service_id',
    'serviceId',
    'id',
  );
  if (serviceReplicaId !== sourceReplicaId) {
    return false;
  }
  if (entityType === SERVICE_TYPE_PARTITION) {
    return String(firstStringField(
      serviceRow,
      'partition_id',
      'partitionId',
      'id',
    ) || '') === entityId;
  }
  if (entityType === SERVICE_TYPE_MESSAGE_GROUP) {
    return String(firstStringField(
      serviceRow,
      'group_id',
      'groupId',
      'id',
    ) || '') === entityId;
  }
  return true;
}

function hasObservedRetiredReplaceSourceReplica(record, options = {}) {
  if (record?.type !== OperationType.REPLACE) {
    return false;
  }
  const sourceReplicaId = String(record?.sourceReplicaId || '');
  const entityType = String(
    record?.entityType || SERVICE_TYPE_PARTITION,
  ).toLowerCase();
  const entityId = String(
    record?.entityId || record?.partitionGroupId || '',
  );
  if (!sourceReplicaId || !entityId) {
    return false;
  }
  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  return !serviceRows.some((serviceRow) =>
    doesObservedSourceReplicaServiceRowBlockRetirement(
      serviceRow,
      entityType,
      entityId,
      sourceReplicaId,
    ),
  );
}

function hasObservedCompletedReplicaOperation(record, options = {}) {
  if (record?.type === OperationType.REPLACE) {
    return (
      hasObservedActiveTargetReplica(record, options) &&
      hasObservedRetiredReplaceSourceReplica(record, options)
    );
  }
  return hasObservedActiveTargetReplica(record, options);
}

function hasObservedActiveTargetServiceOwnership(record, options = {}) {
  if (record?.type !== BOOTSTRAP_MOVE_ASSIGNMENT_OPERATION_TYPE) {
    return false;
  }

  const replicaId = String(record?.replicaId || '');
  const targetNodeId = String(record?.targetNodeId || '');
  if (!replicaId || !targetNodeId) {
    return false;
  }

  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  for (const serviceRow of serviceRows) {
    if (String(firstStringField(
      serviceRow,
      'status',
    ) || '').toLowerCase() !== REPLICA_OPERATION_STATUS_ACTIVE) {
      continue;
    }
    if (String(firstStringField(
      serviceRow,
      'node_id',
      'nodeId',
    ) || '') !== targetNodeId) {
      continue;
    }
    const serviceReplicaId = firstStringField(
      serviceRow,
      'replica_id',
      'replicaId',
      'service_id',
      'serviceId',
      'id',
    );
    if (serviceReplicaId === replicaId) {
      return true;
    }
  }

  return false;
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

function isReplicaOperationInFlight(record, options = {}) {
  if (!record || typeof record !== 'object') {
    return false;
  }
  if (isReplicaOperationExplicitlyExcludedFromInFlight(record)) {
    return false;
  }
  if (isReplicaOperationTerminalSuccess(record)) {
    return false;
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
  return Number.isFinite(timeoutMs) && timeoutMs > NUM.ZERO ?
    Math.floor(timeoutMs) :
    null;
}

function isReplicaOperationStale(record, options = {}) {
  if (!isReplicaOperationInFlight(record, options)) {
    return false;
  }
  const nowMs = Number.isFinite(options.nowMs) ?
    Math.floor(options.nowMs) :
    Date.now();
  const updatedAtMs = normalizeEpochMillis(record?.updatedAt);
  const staleTimeoutLookbackMs = Number.isFinite(
    options.staleTimeoutLookbackMs,
  ) && options.staleTimeoutLookbackMs > NUM.ZERO ?
    Math.floor(options.staleTimeoutLookbackMs) :
    STALE_TIMEOUT_CLASSIFICATION_LOOKBACK_MS;
  if (Number.isFinite(updatedAtMs) &&
      nowMs - updatedAtMs > staleTimeoutLookbackMs) {
    return false;
  }
  const timeoutMs = resolveStepTimeoutMs(record.workflowStep, options);
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
  if (!event || typeof event !== 'object') {
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
    if (key === 'step' || key === 'timestamp' || key === 'timestampMs') {
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
      Math.max(NUM.ZERO, Math.floor(nowMs - timestampMs)) :
      null,
    ...(Object.keys(metadata).length > NUM.ZERO ?
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
    options.maxEntriesPerOperation > NUM.ZERO ?
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
      timeoutMs: resolveStepTimeoutMs(record.workflowStep, options),
    });
  }

  timeline.sort((left, right) => {
    const leftTs = Number(left?.timestampMs || NUM.ZERO);
    const rightTs = Number(right?.timestampMs || NUM.ZERO);
    return leftTs - rightTs;
  });
  if (timeline.length <= maxEntries) {
    return timeline;
  }
  return timeline.slice(timeline.length - maxEntries);
}

function summarizeReplicaOperationLiveness(rows = [], options = {}) {
  const scopedPartitionIds = options.partitionIds instanceof Set &&
    options.partitionIds.size > NUM.ZERO ?
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
  let inFlightCount = NUM.ZERO;
  let staleInFlightCount = NUM.ZERO;
  let oldestInFlightAgeMs = null;

  for (const row of rows) {
    const record = normalizeReplicaOperationRecord(row, {nowMs});
    if (scopedPartitionIds &&
        !scopedPartitionIds.has(record.partitionGroupId)) {
      continue;
    }
    visibleRows.push(record);
    const statusKey = record.status || UNKNOWN_STATUS;
    statusHistogram[statusKey] = (statusHistogram[statusKey] || NUM.ZERO) + NUM.ONE;
    const semanticPhaseKey =
      record.semanticPhase || REPLICA_OPERATION_SEMANTIC_PHASE.UNKNOWN;
    semanticPhaseHistogram[semanticPhaseKey] =
      (semanticPhaseHistogram[semanticPhaseKey] || NUM.ZERO) + NUM.ONE;

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

    inFlightCount += NUM.ONE;
    inFlightOperationIds.push(record.operationId);
    partitionGroupInFlight[record.partitionGroupId] =
      (partitionGroupInFlight[record.partitionGroupId] || NUM.ZERO) + NUM.ONE;
    const stepKey = record.workflowStep || UNKNOWN_WORKFLOW_STEP;
    stepHistogram[stepKey] = (stepHistogram[stepKey] || NUM.ZERO) + NUM.ONE;

    if (Number.isFinite(record.ageMs)) {
      oldestInFlightAgeMs = oldestInFlightAgeMs === null ?
        record.ageMs :
        Math.max(oldestInFlightAgeMs, record.ageMs);
    }

    if (isReplicaOperationStale(record, options)) {
      staleInFlightCount += NUM.ONE;
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
