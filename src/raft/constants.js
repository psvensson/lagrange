import {ADDRESS} from '../constants/index.js';
import {OUTBOUND_DELIVERY_PRIORITY} from '../constants/transport.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  isCriticalTransportControlPlanePartition,
  isPriorityControlPlanePartition,
} from
  '../bootstrap/system-partition-classification.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;

const RAFT_PACKET_TYPE = Object.freeze({
  VOTE: 'vote',
  VOTED: 'voted',
  APPEND: 'append',
  APPEND_ACK: 'append ack',
  APPEND_FAIL: 'append fail',
  EXEC: 'exec',
  APPENDED: 'appended',
  ERROR: 'error',
});

const RAFT_PACKET_TYPES = new Set(Object.values(RAFT_PACKET_TYPE));

const RAFT_MESSAGE_TYPE = Object.freeze({
  REQUEST_VOTE: 'RAFT_REQUEST_VOTE',
  REQUEST_VOTE_RESPONSE: 'RAFT_REQUEST_VOTE_RESPONSE',
  APPEND_ENTRIES: 'RAFT_APPEND_ENTRIES',
  APPEND_ENTRIES_RESPONSE: 'RAFT_APPEND_ENTRIES_RESPONSE',
});

// Use a null-prototype object so lookups like map['valueOf'] don't resolve to
// Object.prototype and accidentally match "unknown" packet types.
const RAFT_PACKET_MESSAGE_TYPE = Object.freeze(Object.assign(Object.create(null), {
  [RAFT_PACKET_TYPE.VOTE]: RAFT_MESSAGE_TYPE.REQUEST_VOTE,
  [RAFT_PACKET_TYPE.VOTED]: RAFT_MESSAGE_TYPE.REQUEST_VOTE_RESPONSE,
  [RAFT_PACKET_TYPE.APPEND]: RAFT_MESSAGE_TYPE.APPEND_ENTRIES,
  [RAFT_PACKET_TYPE.APPENDED]: RAFT_MESSAGE_TYPE.APPEND_ENTRIES_RESPONSE,
}));

const RAFT_ROLE = Object.freeze({
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
  LEARNER: 'learner', // Non-voting member during catch-up phase
});

const RAFT_EVENT = Object.freeze({
  LEADER: RAFT_ROLE.LEADER,
  FOLLOWER: RAFT_ROLE.FOLLOWER,
  CANDIDATE: RAFT_ROLE.CANDIDATE,
  LEADER_CHANGE: 'leader change',
  COMMIT: 'commit',
  TERM_CHANGE: 'term change',
});

const RAFT_ERROR_NAME = Object.freeze({
  NOT_FOUND: 'NotFoundError',
});

const RAFT_TRANSPORT_ERROR_MSG = Object.freeze({
  MESSAGE_ROUTER_REQUIRED: 'messageRouter is required',
  ENTITY_TYPE_REQUIRED: 'entityType is required',
  NODE_ID_REQUIRED: 'nodeId is required',
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

const RAFT_TRANSPORT_LOG_MSG = Object.freeze({
  WRITE: '[RaftTransportAdapter] write:',
  WRITE_ERROR: '[RaftTransportAdapter] write error:',
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
  HEARTBEAT_APPEND: 'raft:append:heartbeat',
});

const RAFT_TRANSPORT_REPLACE_PENDING_KEY_PREFIX = Object.freeze({
  HEARTBEAT_APPEND: 'raft:append:heartbeat',
});

const RAFT_TRANSPORT_DELIVERY_SOURCE_SEPARATOR = ':';
const RAFT_TRANSPORT_DELIVERY_SOURCE_UNKNOWN = 'unknown';

const RAFT_TRANSPORT_BACKGROUND_APPEND_PARTITION_IDS = new Set([
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS],
]);

const REPLICA_SERVICE_SUFFIX_PATTERN = /-r\d+$/;

function extractServiceIdFromUnifiedAddress(address) {
  if (typeof address !== LOCAL_STR_STRING || address.length === LOCAL_NUM_ZERO) {
    return null;
  }
  const separatorIndex = address.lastIndexOf(ADDRESS.SEPARATOR);
  if (separatorIndex <= LOCAL_NUM_ZERO || separatorIndex === address.length - LOCAL_NUM_ONE) {
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
  const explicitTargetPartitionId = resolveExplicitTargetPartitionId(packet);
  if (explicitTargetPartitionId) {
    return isCriticalTransportControlPlanePartition({
      partitionId: explicitTargetPartitionId,
    }) ?
      explicitTargetPartitionId :
      null;
  }
  const senderPartitionId = extractPartitionIdFromUnifiedAddress(packet?.address);
  if (!senderPartitionId) {
    return null;
  }
  return isCriticalTransportControlPlanePartition({partitionId: senderPartitionId}) ?
    senderPartitionId :
    null;
}

function resolvePriorityControlPlaneReadinessPartitionId(packet = null) {
  const explicitTargetPartitionId = resolveExplicitTargetPartitionId(packet);
  if (explicitTargetPartitionId) {
    return isPriorityControlPlanePartition({
      partitionId: explicitTargetPartitionId,
    }) ?
      explicitTargetPartitionId :
      null;
  }
  const senderPartitionId = extractPartitionIdFromUnifiedAddress(packet?.address);
  if (!senderPartitionId) {
    return null;
  }
  return isPriorityControlPlanePartition({partitionId: senderPartitionId}) ?
    senderPartitionId :
    null;
}

function resolveNormalizedTargetReplicaStatus(packet = null) {
  const targetReplicaStatus = packet?.targetReplicaStatus;
  if (typeof targetReplicaStatus !== LOCAL_STR_STRING) {
    return null;
  }
  const normalizedTargetReplicaStatus = targetReplicaStatus.trim().toLowerCase();
  return normalizedTargetReplicaStatus.length > LOCAL_NUM_ZERO ?
    normalizedTargetReplicaStatus :
    null;
}

function resolveNormalizedTargetAddress(packet = null) {
  for (const address of [packet?.targetAddress, packet?.destination]) {
    if (typeof address !== LOCAL_STR_STRING) {
      continue;
    }
    const normalizedAddress = address.trim();
    if (normalizedAddress.length > LOCAL_NUM_ZERO) {
      return normalizedAddress;
    }
  }
  return null;
}

function isRaftHeartbeatAppendPacket(packet = null) {
  const packetType = typeof packet?.type === 'string' ?
    packet.type.toLowerCase() :
    null;
  if (packetType !== RAFT_PACKET_TYPE.APPEND) {
    return false;
  }
  return !Array.isArray(packet?.data) || packet.data.length === LOCAL_NUM_ZERO;
}

function buildHeartbeatAppendReplacePendingKey(packet = null) {
  const targetAddress = resolveNormalizedTargetAddress(packet);
  if (!targetAddress) {
    return RAFT_TRANSPORT_REPLACE_PENDING_KEY_PREFIX.HEARTBEAT_APPEND;
  }
  return `${RAFT_TRANSPORT_REPLACE_PENDING_KEY_PREFIX.HEARTBEAT_APPEND}:${targetAddress}`;
}

function buildHeartbeatAppendDeliveryOptions(baseOptions, packet = null) {
  return Object.freeze({
    ...baseOptions,
    deliverySource: RAFT_TRANSPORT_DELIVERY_SOURCE.HEARTBEAT_APPEND,
    replacePendingKey: buildHeartbeatAppendReplacePendingKey(packet),
  });
}

function buildAppendEntriesDeliverySource(packet = null) {
  const targetAddress = resolveNormalizedTargetAddress(packet);
  const partitionId = resolveExplicitTargetPartitionId(packet) ||
    resolvePriorityControlPlanePartitionId(packet);
  const sourceTarget =
    targetAddress ||
    partitionId ||
    RAFT_TRANSPORT_DELIVERY_SOURCE_UNKNOWN;
  return [
    RAFT_TRANSPORT_DELIVERY_SOURCE.APPEND_ENTRIES,
    sourceTarget,
  ].join(RAFT_TRANSPORT_DELIVERY_SOURCE_SEPARATOR);
}

function buildAppendEntriesDeliveryOptions(baseOptions, packet = null) {
  return Object.freeze({
    ...baseOptions,
    deliverySource: buildAppendEntriesDeliverySource(packet),
  });
}

function isBackgroundControlPlaneAppendPartition(packet = null) {
  const partitionId = resolveExplicitTargetPartitionId(packet) ||
    resolvePriorityControlPlanePartitionId(packet);
  return partitionId !== null &&
    RAFT_TRANSPORT_BACKGROUND_APPEND_PARTITION_IDS.has(partitionId);
}

function shouldUseBackgroundDeliveryForCriticalControlPlaneAppend(packet = null) {
  const packetType = typeof packet?.type === 'string' ?
    packet.type.toLowerCase() :
    null;
  if (packetType !== RAFT_PACKET_TYPE.APPEND) {
    return false;
  }
  if (!Array.isArray(packet?.data) || packet.data.length === LOCAL_NUM_ZERO) {
    return false;
  }
  return resolveNormalizedTargetReplicaStatus(packet) === ReplicaStatus.SYNCING ||
    isBackgroundControlPlaneAppendPartition(packet);
}

function isPriorityControlPlaneReadinessControlPacket(
  packet = null,
  packetType = null,
) {
  if (!resolvePriorityControlPlaneReadinessPartitionId(packet)) {
    return false;
  }
  if (packetType === RAFT_PACKET_TYPE.APPEND_FAIL) {
    return false;
  }
  if (
    packetType === RAFT_PACKET_TYPE.APPEND &&
    Array.isArray(packet?.data) &&
    packet.data.length > LOCAL_NUM_ZERO
  ) {
    return false;
  }
  return packetType === RAFT_PACKET_TYPE.VOTE ||
    packetType === RAFT_PACKET_TYPE.VOTED ||
    packetType === RAFT_PACKET_TYPE.APPEND ||
    packetType === RAFT_PACKET_TYPE.APPENDED;
}

function isMessageGroupTargetAddress(packet = null) {
  const targetAddress = resolveNormalizedTargetAddress(packet);
  return (
    typeof targetAddress === LOCAL_STR_STRING &&
    targetAddress.includes(RAFT_MESSAGE_GROUP_ADDRESS_TOKEN)
  );
}

// Break-point (a): the query message-group ingress readiness gate (routingReady)
// only flips once the group's Raft consensus converges (leader elected, member
// reachable). Those consensus CONTROL messages otherwise ride the CRITICAL lane
// and are starved by the priority-recovery dispatch storm that saturates the
// shared outbound queue. Routing the message-group control plane (votes,
// vote/append responses, heartbeats — everything except bulk data-bearing
// append replication) onto the protected READINESS lane reserves headroom so
// the group can converge and ingress readiness can flip even under critical
// saturation, without letting bulk replication consume the small reserve.
function resolveMessageGroupReadinessDeliveryOptions(packet, packetType) {
  const hasAppendEntries = packetType === RAFT_PACKET_TYPE.APPEND &&
    Array.isArray(packet?.data) &&
    packet.data.length > LOCAL_NUM_ZERO;
  if (hasAppendEntries) {
    return null;
  }
  if (isRaftHeartbeatAppendPacket(packet)) {
    return buildHeartbeatAppendDeliveryOptions(
      RAFT_TRANSPORT_READINESS_DELIVERY_OPTIONS,
      packet,
    );
  }
  return RAFT_TRANSPORT_READINESS_DELIVERY_OPTIONS;
}

function resolveRaftTransportDeliveryOptions(packet = null) {
  const packetType = typeof packet?.type === 'string' ?
    packet.type.toLowerCase() :
    null;
  if (isMessageGroupTargetAddress(packet)) {
    const messageGroupReadinessOptions =
      resolveMessageGroupReadinessDeliveryOptions(packet, packetType);
    if (messageGroupReadinessOptions) {
      return messageGroupReadinessOptions;
    }
  }
  const isHeartbeatAppendPacket = isRaftHeartbeatAppendPacket(packet);
  const explicitTargetPartitionId = resolveExplicitTargetPartitionId(packet);
  // Priority control-plane consensus packets unblock readiness and must be able
  // to use the same protected queue reserve as message-group control traffic.
  if (isPriorityControlPlaneReadinessControlPacket(packet, packetType)) {
    if (isHeartbeatAppendPacket) {
      return buildHeartbeatAppendDeliveryOptions(
        RAFT_TRANSPORT_READINESS_DELIVERY_OPTIONS,
        packet,
      );
    }
    return RAFT_TRANSPORT_READINESS_DELIVERY_OPTIONS;
  }
  if (resolvePriorityControlPlanePartitionId(packet)) {
    if (shouldUseBackgroundDeliveryForCriticalControlPlaneAppend(packet)) {
      return buildAppendEntriesDeliveryOptions(
        RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
        packet,
      );
    }
    if (isHeartbeatAppendPacket) {
      return buildHeartbeatAppendDeliveryOptions(
        RAFT_TRANSPORT_DELIVERY_OPTIONS,
        packet,
      );
    }
    return RAFT_TRANSPORT_DELIVERY_OPTIONS;
  }
  const hasAppendEntries = packetType === RAFT_PACKET_TYPE.APPEND &&
    Array.isArray(packet?.data) &&
    packet.data.length > 0;
  if (isHeartbeatAppendPacket) {
    return buildHeartbeatAppendDeliveryOptions(
      RAFT_TRANSPORT_DELIVERY_OPTIONS,
      packet,
    );
  }
  if (explicitTargetPartitionId) {
    return hasAppendEntries || packetType === RAFT_PACKET_TYPE.APPEND_FAIL ?
      RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS :
      RAFT_TRANSPORT_DELIVERY_OPTIONS;
  }
  if (hasAppendEntries || packetType === RAFT_PACKET_TYPE.APPEND_FAIL) {
    return RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS;
  }
  return RAFT_TRANSPORT_DELIVERY_OPTIONS;
}

export {
  RAFT_ELECTION_TIMING,
  RAFT_PACKET_MESSAGE_TYPE,
  RAFT_PACKET_TYPE,
  RAFT_PACKET_TYPES,
  RAFT_MESSAGE_TYPE,
  RAFT_EVENT,
  RAFT_ROLE,
  RAFT_ERROR_NAME,
  RAFT_TRANSPORT_ERROR_MSG,
  RAFT_TRANSPORT_DELIVERY_OPTIONS,
  RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
  resolveRaftTransportDeliveryOptions,
  RAFT_TRANSPORT_LOG_MSG,
};
