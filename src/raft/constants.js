import {ADDRESS} from '../constants/index.js';
import {RAFT_EVENT} from './raft-operation-port-constants.js';
import {OUTBOUND_DELIVERY_PRIORITY} from '../constants/transport.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  classifySystemPartition,
  isCriticalTransportControlPlanePartition,
} from
  '../bootstrap/system-partition-classification.js';
import {RAFT_RS_MESSAGE_TYPE} from './raft-rs-ingress-constants.js';

const LOCAL_STR_STRING = 'string';

const RAFT_ROLE = Object.freeze({
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
  LEARNER: 'learner', // Non-voting member during catch-up phase
});

// VOTER_RAFT_ROLES moved to ./replica-voter-readiness.js — the single owner
// of every voter-readiness membership row (quorum-voter, load-routable,
// repair-only, catchup-learner). Import it from there.

const RAFT_ERROR_NAME = Object.freeze({
  NOT_FOUND: 'NotFoundError',
});

const RAFT_ERROR_CODE = Object.freeze({
  COMMITTED_ENTRY_CONFLICT: 'RAFT_COMMITTED_ENTRY_CONFLICT',
});

const RAFT_ELECTION_TIMING = Object.freeze({
  HEARTBEAT_DEFAULT_MS: 150,
  ELECTION_MIN_DEFAULT_MS: 1000,
  ELECTION_MAX_DEFAULT_MS: 3000,
  // Jitter added per replica index to stagger election timeouts.
  // Must be >= (ELECTION_MAX - ELECTION_MIN) so that replica N's max
  // timeout is always less than replica N+1's min timeout.
  // This guarantees lower-indexed replicas always fire first,
  // preventing re-elections and leadership instability.
  JITTER_PER_REPLICA_MS: 2500,
});

const RAFT_TRANSPORT_DELIVERY_OPTIONS = Object.freeze({
  deliveryPriority: OUTBOUND_DELIVERY_PRIORITY.CRITICAL,
});

const RAFT_TRANSPORT_READINESS_DELIVERY_OPTIONS = Object.freeze({
  deliveryPriority: OUTBOUND_DELIVERY_PRIORITY.READINESS,
});

const RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS = Object.freeze({
  deliveryPriority: OUTBOUND_DELIVERY_PRIORITY.BACKGROUND,
});

const RAFT_MESSAGE_GROUP_ADDRESS_TOKEN = '/message-group/';

const RAFT_TRANSPORT_DELIVERY_SOURCE = Object.freeze({
  APPEND_ENTRIES: 'raft:append:entries',
  HEARTBEAT: 'raft:heartbeat',
});

const RAFT_TRANSPORT_REPLACE_PENDING_KEY_PREFIX = Object.freeze({
  HEARTBEAT: 'raft:heartbeat',
});

const RAFT_TRANSPORT_DELIVERY_SOURCE_SEPARATOR = ':';
const RAFT_TRANSPORT_DELIVERY_SOURCE_UNKNOWN = 'unknown';

const RAFT_TRANSPORT_BACKGROUND_APPEND_PARTITION_IDS = new Set([
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS],
]);

const REPLICA_SERVICE_SUFFIX_PATTERN = /-r\d+$/;

function extractServiceIdFromUnifiedAddress(address) {
  if (typeof address !== LOCAL_STR_STRING || address.length === 0) {
    return null;
  }
  const separatorIndex = address.lastIndexOf(ADDRESS.SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === address.length - 1) {
    return null;
  }
  return address.slice(separatorIndex + ADDRESS.SEPARATOR.length);
}

function extractPartitionIdFromUnifiedAddress(address) {
  const serviceId = extractServiceIdFromUnifiedAddress(address);
  if (!serviceId) {
    return null;
  }
  const partitionId = serviceId.replace(REPLICA_SERVICE_SUFFIX_PATTERN, '');
  if (!partitionId || partitionId === serviceId) {
    return null;
  }
  return partitionId;
}

function resolveExplicitTargetPartitionId(packet = null) {
  for (const address of [packet?.targetAddress, packet?.destination]) {
    const partitionId = extractPartitionIdFromUnifiedAddress(address);
    if (partitionId) {
      return partitionId;
    }
  }
  return null;
}

function resolvePriorityControlPlanePartitionId(packet = null) {
  const partitionId = resolveExplicitTargetPartitionId(packet);
  return partitionId &&
    isCriticalTransportControlPlanePartition({partitionId}) ?
    partitionId :
    null;
}

function resolvePriorityControlPlaneReadinessPartitionId(packet = null) {
  const partitionId = resolveExplicitTargetPartitionId(packet);
  return partitionId &&
    classifySystemPartition({partitionId}).priorityControlPlane ?
    partitionId :
    null;
}

function resolveNormalizedTargetAddress(packet = null) {
  for (const address of [packet?.targetAddress, packet?.destination]) {
    if (typeof address !== LOCAL_STR_STRING) {
      continue;
    }
    const normalizedAddress = address.trim();
    if (normalizedAddress.length > 0) {
      return normalizedAddress;
    }
  }
  return null;
}

function raftRsMessageTypeOf(envelope = null) {
  const msgType = envelope?.message?.msgType;
  return Number.isInteger(msgType) ? msgType : null;
}

function raftRsEntriesOf(envelope = null) {
  return Array.isArray(envelope?.message?.entries) ?
    envelope.message.entries :
    [];
}

function isRaftHeartbeatEnvelope(envelope = null) {
  return raftRsMessageTypeOf(envelope) === RAFT_RS_MESSAGE_TYPE.HEARTBEAT;
}

function isRaftBulkReplicationEnvelope(envelope = null) {
  const msgType = raftRsMessageTypeOf(envelope);
  return msgType === RAFT_RS_MESSAGE_TYPE.SNAPSHOT ||
    (msgType === RAFT_RS_MESSAGE_TYPE.APPEND &&
      raftRsEntriesOf(envelope).length > 0);
}

function buildHeartbeatReplacePendingKey(envelope = null) {
  const targetAddress = resolveNormalizedTargetAddress(envelope);
  if (!targetAddress) {
    return RAFT_TRANSPORT_REPLACE_PENDING_KEY_PREFIX.HEARTBEAT;
  }
  return `${RAFT_TRANSPORT_REPLACE_PENDING_KEY_PREFIX.HEARTBEAT}:${targetAddress}`;
}

function buildHeartbeatDeliveryOptions(baseOptions, envelope = null) {
  return Object.freeze({
    ...baseOptions,
    deliverySource: RAFT_TRANSPORT_DELIVERY_SOURCE.HEARTBEAT,
    replacePendingKey: buildHeartbeatReplacePendingKey(envelope),
  });
}

function buildAppendEntriesDeliverySource(envelope = null) {
  const targetAddress = resolveNormalizedTargetAddress(envelope);
  const partitionId = resolveExplicitTargetPartitionId(envelope) ||
    resolvePriorityControlPlanePartitionId(envelope);
  const sourceTarget =
    targetAddress ||
    partitionId ||
    RAFT_TRANSPORT_DELIVERY_SOURCE_UNKNOWN;
  return [
    RAFT_TRANSPORT_DELIVERY_SOURCE.APPEND_ENTRIES,
    sourceTarget,
  ].join(RAFT_TRANSPORT_DELIVERY_SOURCE_SEPARATOR);
}

function buildAppendEntriesDeliveryOptions(baseOptions, envelope = null) {
  return Object.freeze({
    ...baseOptions,
    deliverySource: buildAppendEntriesDeliverySource(envelope),
  });
}

function isBackgroundControlPlaneAppendPartition(envelope = null) {
  const partitionId = resolveExplicitTargetPartitionId(envelope) ||
    resolvePriorityControlPlanePartitionId(envelope);
  return partitionId !== null &&
    RAFT_TRANSPORT_BACKGROUND_APPEND_PARTITION_IDS.has(partitionId);
}

function shouldUseBackgroundDeliveryForCriticalControlPlaneAppend(
  envelope = null,
) {
  return raftRsMessageTypeOf(envelope) === RAFT_RS_MESSAGE_TYPE.APPEND &&
    raftRsEntriesOf(envelope).length > 0 &&
    isBackgroundControlPlaneAppendPartition(envelope);
}

function isPriorityControlPlaneReadinessControlEnvelope(envelope = null) {
  return resolvePriorityControlPlaneReadinessPartitionId(envelope) !== null &&
    raftRsMessageTypeOf(envelope) !== null &&
    !isRaftBulkReplicationEnvelope(envelope);
}

function isMessageGroupTargetAddress(envelope = null) {
  const targetAddress = resolveNormalizedTargetAddress(envelope);
  return (
    typeof targetAddress === LOCAL_STR_STRING &&
    targetAddress.includes(RAFT_MESSAGE_GROUP_ADDRESS_TOKEN)
  );
}

// Message-group and priority-control-plane consensus control traffic unblocks
// readiness and therefore uses the protected READINESS lane. Bulk replication
// never consumes that reserve.
function resolveMessageGroupReadinessDeliveryOptions(envelope) {
  if (isRaftBulkReplicationEnvelope(envelope)) {
    return null;
  }
  if (isRaftHeartbeatEnvelope(envelope)) {
    return buildHeartbeatDeliveryOptions(
      RAFT_TRANSPORT_READINESS_DELIVERY_OPTIONS,
      envelope,
    );
  }
  return RAFT_TRANSPORT_READINESS_DELIVERY_OPTIONS;
}

function resolveRaftTransportDeliveryOptions(envelope = null) {
  if (isMessageGroupTargetAddress(envelope)) {
    const readiness = resolveMessageGroupReadinessDeliveryOptions(envelope);
    if (readiness) {
      return readiness;
    }
  }

  const heartbeat = isRaftHeartbeatEnvelope(envelope);
  const bulkReplication = isRaftBulkReplicationEnvelope(envelope);
  const messageType = raftRsMessageTypeOf(envelope);
  const explicitTargetPartitionId =
    resolveExplicitTargetPartitionId(envelope);

  if (isPriorityControlPlaneReadinessControlEnvelope(envelope)) {
    return heartbeat ?
      buildHeartbeatDeliveryOptions(
        RAFT_TRANSPORT_READINESS_DELIVERY_OPTIONS,
        envelope,
      ) :
      RAFT_TRANSPORT_READINESS_DELIVERY_OPTIONS;
  }

  if (resolvePriorityControlPlanePartitionId(envelope)) {
    if (shouldUseBackgroundDeliveryForCriticalControlPlaneAppend(envelope) ||
        messageType === RAFT_RS_MESSAGE_TYPE.SNAPSHOT) {
      return messageType === RAFT_RS_MESSAGE_TYPE.APPEND ?
        buildAppendEntriesDeliveryOptions(
          RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
          envelope,
        ) :
        RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS;
    }
    if (heartbeat) {
      return buildHeartbeatDeliveryOptions(
        RAFT_TRANSPORT_DELIVERY_OPTIONS,
        envelope,
      );
    }
    return RAFT_TRANSPORT_DELIVERY_OPTIONS;
  }

  if (heartbeat) {
    return buildHeartbeatDeliveryOptions(
      RAFT_TRANSPORT_DELIVERY_OPTIONS,
      envelope,
    );
  }

  if (explicitTargetPartitionId && bulkReplication) {
    return messageType === RAFT_RS_MESSAGE_TYPE.APPEND ?
      buildAppendEntriesDeliveryOptions(
        RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
        envelope,
      ) :
      RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS;
  }

  if (bulkReplication) {
    return messageType === RAFT_RS_MESSAGE_TYPE.APPEND ?
      buildAppendEntriesDeliveryOptions(
        RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
        envelope,
      ) :
      RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS;
  }

  return RAFT_TRANSPORT_DELIVERY_OPTIONS;
}

export {
  RAFT_ELECTION_TIMING,
  RAFT_EVENT,
  RAFT_ROLE,
  RAFT_ERROR_NAME,
  RAFT_ERROR_CODE,
  RAFT_TRANSPORT_DELIVERY_OPTIONS,
  RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
  resolveRaftTransportDeliveryOptions,
};
