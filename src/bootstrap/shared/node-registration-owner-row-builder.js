import os from 'os';
import {
  COLUMN,
  NODE_STATE,
  NUM,
  SERVICE_TYPE,
  STATE,
} from '../../constants/index.js';
import {
  AUTHORITATIVE_ROW_READ_STATE,
} from '../rejoin-hints-constants.js';
import {
  ENDPOINT_INCARNATION_OUTCOME,
  isEndpointIncarnationOutcomeCompleted,
} from '../../control-plane/owners/endpoint-incarnation-authority.js';
import {
  normalizeKnownNodeBootIncarnation,
} from '../../control-plane/control-plane-error-classification.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {ReplicaStatus} from '../../rebalancer/replica-status.js';
import {
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE_MESSAGE,
  AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS,
  NODE_STORAGE_LOST_TRIGGER_REASON,
  STORAGE_INCARNATION_FIELD,
  STORAGE_INCARNATION_METADATA_KEY,
  normalizeString,
} from './node-registration-owner-constants.js';

const BOOT_INCARNATION_REQUIRED =
  'Node registration requires a positive boot incarnation';

const NON_REUSABLE_NODE_STATUSES = Object.freeze([
  NODE_STATE.FAILED,
  NODE_STATE.SHUTTING_DOWN,
  NODE_STATE.STOPPED,
]);

function readObservedBootIncarnation(nodeRow) {
  const observed = nodeRow?.[COLUMN.BOOT_INCARNATION];
  return observed === undefined ? null : observed;
}

function buildAuthoritativeRowSourceUnavailableError(tableName) {
  const error = new Error(AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE_MESSAGE);
  error.deferRetry = true;
  error.retryAfterMs = AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS;
  error.authoritativeRowReadState = AUTHORITATIVE_ROW_READ_STATE.UNAVAILABLE;
  error.tableName = tableName;
  return error;
}

function buildReentryNormalizedNodeRow(
  nodeRow,
  now,
  bootIncarnation,
  storageIncarnation = null,
) {
  const persistedStatus = normalizeString(nodeRow?.[COLUMN.STATUS]);
  const reusableStatus =
    NON_REUSABLE_NODE_STATUSES.includes(persistedStatus) ?
      null :
      persistedStatus;
  const resolvedStorageIncarnation =
    normalizeKnownNodeBootIncarnation(storageIncarnation) ||
    readObservedStorageIncarnation(nodeRow) ||
    normalizeKnownNodeBootIncarnation(bootIncarnation);
  return {
    ...nodeRow,
    [COLUMN.STATUS]: reusableStatus || NODE_STATE.JOINING,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: now,
    [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
    ...(resolvedStorageIncarnation > 0 ?
      {[STORAGE_INCARNATION_FIELD]: resolvedStorageIncarnation} :
      {}),
  };
}

function resolveHighestObservedNodeIncarnation(nodeOutcome, endpointOutcome) {
  let highestEndpointIncarnation = 0;
  for (const endpointRow of [
    ...(Array.isArray(endpointOutcome?.rows) ? endpointOutcome.rows : []),
    ...(endpointOutcome?.row ? [endpointOutcome.row] : []),
  ]) {
    highestEndpointIncarnation = Math.max(
      highestEndpointIncarnation,
      normalizeKnownNodeBootIncarnation(
        readObservedBootIncarnation(endpointRow),
      ),
      readObservedStorageIncarnation(null, endpointRow),
    );
  }
  const observedNodeBootIncarnation = normalizeKnownNodeBootIncarnation(
    readObservedBootIncarnation(nodeOutcome?.row),
  );
  const observedStorageIncarnation = readObservedStorageIncarnation(
    nodeOutcome?.row,
    endpointOutcome?.row,
  );
  return Math.max(
    observedNodeBootIncarnation,
    highestEndpointIncarnation,
    observedStorageIncarnation,
  );
}

function filterAuthoritativePartitionServiceRowsForNode(outcome, nodeId) {
  const rowsById = new Map();
  if (outcome?.state === AUTHORITATIVE_ROW_READ_STATE.READABLE) {
    for (const row of Array.isArray(outcome.rows) ? outcome.rows : []) {
      const serviceId = normalizeString(row?.[COLUMN.SERVICE_ID]);
      if (
        serviceId.length > 0 &&
        normalizeString(row?.[COLUMN.NODE_ID]) === nodeId &&
        normalizeString(row?.[COLUMN.SERVICE_TYPE]).toLowerCase() ===
          String(SERVICE_TYPE.PARTITION).toLowerCase() &&
        !rowsById.has(serviceId)
      ) {
        rowsById.set(serviceId, row);
      }
    }
  }
  return [...rowsById.values()];
}

function buildLostStorageMutationFailureError(failedRow, classification) {
  const error = new Error(
    `Failed to mark lost-storage replica ${
      failedRow?.[COLUMN.SERVICE_ID] || ''
    } as FAILED: ${classification?.outcome || 'mutation_not_applied'}`,
  );
  error.deferRetry = true;
  error.retryAfterMs = AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS;
  return error;
}

function withOriginHlcStamp(row, originHlc) {
  return typeof originHlc === 'string' && originHlc.length > 0 ?
    {...row, [COLUMN.UPDATED_AT_HLC]: originHlc} :
    row;
}

function normalizeEndpointOutcomeResult(endpointOutcome) {
  const completed =
    isEndpointIncarnationOutcomeCompleted(endpointOutcome.outcome) &&
    endpointOutcome.outcome !== ENDPOINT_INCARNATION_OUTCOME.ALREADY_ABSENT;
  if (!completed && endpointOutcome.error) throw endpointOutcome.error;
  const originHlc =
    endpointOutcome.result?.originHlc ||
    endpointOutcome.result?.partitionResult?.originHlc ||
    null;
  return {
    success: completed,
    outcome: endpointOutcome.outcome,
    originHlc:
      typeof originHlc === 'string' && originHlc.length > 0 ? originHlc : null,
    error: completed ? null : endpointOutcome.outcome,
  };
}

function resolveServiceUpdateExpectedIdentity(nodeId, rowData, options = {}) {
  if (
    options.expectedIdentity &&
    typeof options.expectedIdentity === 'object'
  ) {
    return options.expectedIdentity;
  }
  const rowNodeId = normalizeString(rowData?.[COLUMN.NODE_ID]);
  const rowServiceType = normalizeString(rowData?.[COLUMN.SERVICE_TYPE]);
  return {
    [COLUMN.NODE_ID]: rowNodeId.length > 0 ? rowNodeId : nodeId,
    ...(rowServiceType.length > 0 ?
      {[COLUMN.SERVICE_TYPE]: rowServiceType} :
      {}),
  };
}

function parseEndpointMetadataObject(metadataValue) {
  let candidate = metadataValue;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch (_error) {
      candidate = null;
    }
  }
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return {...candidate};
  }
  return {};
}

function readObservedStorageIncarnation(nodeRow, endpointRow = null) {
  const metadata = parseEndpointMetadataObject(
    endpointRow?.[COLUMN.METADATA],
  );
  const endpointStorageIncarnation = normalizeKnownNodeBootIncarnation(
    metadata?.[STORAGE_INCARNATION_METADATA_KEY],
  );
  if (endpointStorageIncarnation > 0) {
    return endpointStorageIncarnation;
  }
  const nodeStorageIncarnation = normalizeKnownNodeBootIncarnation(
    nodeRow?.[STORAGE_INCARNATION_FIELD],
  );
  if (nodeStorageIncarnation > 0) {
    return nodeStorageIncarnation;
  }
  const observedNodeBootIncarnation = normalizeKnownNodeBootIncarnation(
    nodeRow?.[COLUMN.BOOT_INCARNATION],
  );
  if (observedNodeBootIncarnation > 0) {
    return observedNodeBootIncarnation;
  }
  return normalizeKnownNodeBootIncarnation(
    endpointRow?.[COLUMN.BOOT_INCARNATION],
  );
}

function stampEndpointStorageIncarnationMetadata(row, storageIncarnation) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  const normalizedStorageIncarnation =
    normalizeKnownNodeBootIncarnation(storageIncarnation);
  if (normalizedStorageIncarnation <= 0) {
    return row;
  }
  const metadata = parseEndpointMetadataObject(row[COLUMN.METADATA]);
  return {
    ...row,
    [COLUMN.METADATA]: JSON.stringify({
      ...metadata,
      [STORAGE_INCARNATION_METADATA_KEY]: normalizedStorageIncarnation,
    }),
  };
}

function advanceTimestampPastObserved(now, observedValue) {
  const numericObserved = Number(observedValue);
  if (Number.isFinite(numericObserved) && numericObserved >= now) {
    return Math.floor(numericObserved) + 1;
  }
  return now;
}

function buildFailedLostStoragePartitionRow(row, now) {
  const previousStatus = row?.[COLUMN.STATUS];
  const transitionAt = advanceTimestampPastObserved(
    advanceTimestampPastObserved(now, row?.[COLUMN.STATE_ENTERED_AT]),
    row?.[COLUMN.UPDATED_AT],
  );
  return {
    ...row,
    [COLUMN.PREVIOUS_STATE]:
      typeof previousStatus === 'string' ? previousStatus : null,
    [COLUMN.STATUS]: ReplicaStatus.FAILED,
    [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER,
    [COLUMN.TRIGGER_REASON]: NODE_STORAGE_LOST_TRIGGER_REASON,
    [COLUMN.STATE_ENTERED_AT]: transitionAt,
    [COLUMN.UPDATED_AT]: transitionAt,
  };
}

function buildNodeRegistrationRow({
  nodeId,
  nodeAddress,
  nodeCapabilities,
  bootIncarnation,
  storageIncarnation,
  now,
}) {
  if (!Number.isSafeInteger(bootIncarnation) || bootIncarnation <= 0) {
    throw new Error(BOOT_INCARNATION_REQUIRED);
  }
  const resolvedStorageIncarnation =
    Number.isSafeInteger(storageIncarnation) && storageIncarnation > 0 ?
      storageIncarnation :
      bootIncarnation;
  const cpus = os.cpus();
  const totalMemoryBytes = os.totalmem();
  const totalMemoryMb = Math.floor(
    totalMemoryBytes / (NUM.THOUSAND * NUM.THOUSAND),
  );

  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.NODE_ADDRESS]: nodeAddress,
    [COLUMN.CPU_CORES]: cpus.length,
    [COLUMN.MEMORY_MB]: totalMemoryMb,
    [COLUMN.DISK_GB]: NUM.HUNDRED,
    [COLUMN.CPU_USAGE_PERCENT]: 0,
    [COLUMN.MEMORY_USAGE_PERCENT]: 0,
    [COLUMN.DISK_USAGE_PERCENT]: 0,
    [COLUMN.STATUS]: NODE_STATE.JOINING,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.CAPABILITIES]: JSON.stringify(nodeCapabilities || []),
    [COLUMN.LAST_HEARTBEAT]: now,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
    [STORAGE_INCARNATION_FIELD]: resolvedStorageIncarnation,
    [COLUMN.CREATED_AT]: now,
  };
}

export {
  NON_REUSABLE_NODE_STATUSES,
  buildAuthoritativeRowSourceUnavailableError,
  buildFailedLostStoragePartitionRow,
  buildLostStorageMutationFailureError,
  buildNodeRegistrationRow,
  buildReentryNormalizedNodeRow,
  filterAuthoritativePartitionServiceRowsForNode,
  normalizeEndpointOutcomeResult,
  parseEndpointMetadataObject,
  readObservedBootIncarnation,
  readObservedStorageIncarnation,
  resolveHighestObservedNodeIncarnation,
  resolveServiceUpdateExpectedIdentity,
  stampEndpointStorageIncarnationMetadata,
  withOriginHlcStamp,
};
