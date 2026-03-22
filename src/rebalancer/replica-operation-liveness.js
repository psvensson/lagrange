import {NUM, TIME_MS, WORKFLOW_STEP} from '../constants/index.js';
import {
  OperationType,
  isTerminalStep as isTerminalReplicaOperationStep,
} from './replica-status.js';
import {REBALANCER_DEFAULT} from './rebalancer-constants.js';

const UNKNOWN_STATUS = 'unknown';
const UNKNOWN_PARTITION_GROUP_ID = 'unknown';
const UNKNOWN_WORKFLOW_STEP = 'UNKNOWN';
const REPLICA_OPERATION_STATUS_FAILED = 'failed';
const REPLICA_OPERATION_STATUS_ACTIVE = 'active';
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
  'active',
  'removed',
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

  return {
    operationId: String(firstStringField(
      row,
      'operation_id',
      'operationId',
    ) || ''),
    type,
    status,
    workflowStep,
    partitionGroupId: String(firstStringField(
      row,
      'partition_id',
      'partitionId',
      'entity_id',
      'entityId',
    ) || UNKNOWN_PARTITION_GROUP_ID),
    entityType: String(firstStringField(
      row,
      'entity_type',
      'entityType',
    ) || SERVICE_TYPE_PARTITION).toLowerCase(),
    entityId: String(firstStringField(
      row,
      'entity_id',
      'entityId',
      'partition_id',
      'partitionId',
    ) || UNKNOWN_PARTITION_GROUP_ID),
    sourceNodeId: String(firstStringField(
      row,
      'source_node_id',
      'sourceNodeId',
    ) || ''),
    replicaId: String(firstStringField(
      row,
      'replica_id',
      'replicaId',
      'service_id',
      'serviceId',
    ) || ''),
    targetNodeId: String(firstStringField(
      row,
      'target_node_id',
      'targetNodeId',
    ) || ''),
    createdAt,
    updatedAt,
    completedAt,
    hasCompletedAt,
    stepsHistory,
    ageMs: resolveAgeMs({updatedAt, createdAt}, nowMs),
  };
}

function isReplicaOperationTerminalSuccess(record) {
  if (!record?.type || !record?.status) {
    return false;
  }
  if (record.status === REPLICA_OPERATION_STATUS_FAILED ||
      record.workflowStep === WORKFLOW_STEP_FAILED) {
    return false;
  }
  if (record.workflowStep &&
      isTerminalReplicaOperationStep(record.type, record.workflowStep)) {
    return true;
  }
  if (!record.hasCompletedAt) {
    return false;
  }
  if (record.type === OperationType.ADD) {
    return record.status === 'active';
  }
  return record.status === 'removed';
}

function hasObservedActiveTargetReplica(record, options = {}) {
  if (record?.type !== OperationType.ADD) {
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
  for (const serviceRow of serviceRows) {
    const serviceType = String(firstStringField(
      serviceRow,
      'service_type',
      'serviceType',
      'type',
    ) || '').toLowerCase();
    if (serviceType && serviceType !== entityType) {
      continue;
    }
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
      if (entityType === SERVICE_TYPE_PARTITION) {
        if (String(firstStringField(
          serviceRow,
          'partition_id',
          'partitionId',
          'id',
        ) || '') === entityId) {
          return true;
        }
        continue;
      }
      if (entityType === SERVICE_TYPE_MESSAGE_GROUP) {
        if (String(firstStringField(
          serviceRow,
          'group_id',
          'groupId',
          'id',
        ) || '') === entityId) {
          return true;
        }
        continue;
      }
      return true;
    }
  }

  return false;
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

function isReplicaOperationInFlight(record, options = {}) {
  if (!record || typeof record !== 'object') {
    return false;
  }
  const normalizedStatus = String(record.status || '').toLowerCase();
  if (REPLICA_OPERATION_IN_FLIGHT_EXCLUDED_STATUSES.has(normalizedStatus)) {
    return false;
  }
  if (isReplicaOperationTerminalSuccess(record)) {
    return false;
  }
  return !hasObservedActiveTargetReplica(record, options);
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
  const partitionGroupInFlight = {};
  const operationTimelineById = {};
  const inFlightOperationIds = [];
  let inFlightCount = NUM.ZERO;
  let staleInFlightCount = NUM.ZERO;
  let oldestInFlightAgeMs = null;

  for (const row of rows) {
    const record = normalizeReplicaOperationRecord(row, {nowMs});
    if (scopedPartitionIds &&
        !scopedPartitionIds.has(record.partitionGroupId)) {
      continue;
    }
    const statusKey = record.status || UNKNOWN_STATUS;
    statusHistogram[statusKey] = (statusHistogram[statusKey] || NUM.ZERO) + NUM.ONE;

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
    partitionGroupInFlight,
    stepHistogram,
    oldestInFlightAgeMs,
    staleInFlightCount,
    inFlightOperationIds,
    operationTimelineById,
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
