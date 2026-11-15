import os from 'os';
import {
  COLUMN,
  NODE_STATE,
  NUM,
  STATE,
} from '../../constants/index.js';
import {
  normalizeKnownNodeBootIncarnation,
} from '../../control-plane/control-plane-error-classification.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {ReplicaStatus} from '../../rebalancer/replica-status.js';
import {
  NODE_STORAGE_LOST_TRIGGER_REASON,
  STORAGE_INCARNATION_FIELD,
  STORAGE_INCARNATION_METADATA_KEY,
} from './node-registration-owner-constants.js';

const BOOT_INCARNATION_REQUIRED =
  'Node registration requires a positive boot incarnation';

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

function buildFailedLostStoragePartitionRow(row, now) {
  const previousStatus = row?.[COLUMN.STATUS];
  return {
    ...row,
    [COLUMN.PREVIOUS_STATE]:
      typeof previousStatus === 'string' ? previousStatus : null,
    [COLUMN.STATUS]: ReplicaStatus.FAILED,
    [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER,
    [COLUMN.TRIGGER_REASON]: NODE_STORAGE_LOST_TRIGGER_REASON,
    [COLUMN.STATE_ENTERED_AT]: now,
    [COLUMN.UPDATED_AT]: now,
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
  buildFailedLostStoragePartitionRow,
  buildNodeRegistrationRow,
  parseEndpointMetadataObject,
  readObservedStorageIncarnation,
  stampEndpointStorageIncarnationMetadata,
};
