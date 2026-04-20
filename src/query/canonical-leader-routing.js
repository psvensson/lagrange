import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  TYPEOF,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';

const CANONICAL_LEADER_ROUTING_GAP_STATE = Object.freeze({
  NONE: 'none',
  OWNER_MISSING: 'owner_missing',
  SERVICE_MISSING: 'service_missing',
});

const CANONICAL_LEADER_IDENTITY_STATE = Object.freeze({
  OWNER_CONFIRMED: 'owner_confirmed',
  RETAINED_RUNTIME: 'retained_runtime',
  SERVICE_ROLE_DERIVED: 'service_role_derived',
  AMBIGUOUS_SERVICE_ROLE: 'ambiguous_service_role',
  MISSING: 'missing',
});

const CANONICAL_LEADER_IDENTITY_SOURCE = Object.freeze({
  OWNER_ROW: 'owner_row',
  RETAINED_RUNTIME: 'retained_runtime',
  SERVICE_ROLE: 'service_role',
  NONE: 'none',
});

const CANONICAL_PARTITION_LEADER_OBSERVATION_STATE = Object.freeze({
  AVAILABLE: 'available',
  DEFERRED: 'deferred',
  MISSING: 'missing',
});

const CANONICAL_PARTITION_LEADER_OBSERVATION_REASON = Object.freeze({
  OWNER_ROW_CONFIRMED: 'owner_row_confirmed',
  RETAINED_RUNTIME_OWNER: 'retained_runtime_owner',
  OWNER_ROW_MISSING: 'owner_row_missing',
  OWNER_ROW_STALE: 'owner_row_stale',
});

const CANONICAL_LEADER_REFERENCE_STATE = Object.freeze({
  AVAILABLE: 'available',
  MISSING: 'missing',
});

function normalizeCanonicalLeaderNodeIdValue(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    null;
}

function normalizeCanonicalLeaderServiceStatus(service = null) {
  const status = service?.[COLUMN.STATUS] ?? service?.status ?? null;
  if (typeof status !== TYPEOF.STRING || status.length === NUM.ZERO) {
    return null;
  }
  return status.toLowerCase();
}

function readCanonicalLeaderPartitionNodeId(partition = null) {
  return normalizeCanonicalLeaderNodeIdValue(
    partition?.[COLUMN.LEADER_NODE_ID] ??
      partition?.leader_node_id ??
      partition?.leaderNodeId ??
      null,
  );
}

function readCanonicalLeaderServiceNodeId(service = null) {
  return normalizeCanonicalLeaderNodeIdValue(
    service?.[COLUMN.NODE_ID] ??
      service?.node_id ??
      service?.nodeId ??
      null,
  );
}

function readCanonicalLeaderServiceRole(service = null) {
  const role = service?.[COLUMN.RAFT_ROLE] ?? service?.raft_role ??
    service?.raftRole ?? null;
  return typeof role === TYPEOF.STRING && role.length > NUM.ZERO ?
    role.toLowerCase() :
    null;
}

function isCanonicalLeaderRoleWitness(service = null) {
  const normalizedStatus = normalizeCanonicalLeaderServiceStatus(service);
  if (normalizedStatus !== null &&
      normalizedStatus !== String(SERVICE_STATUS.ACTIVE).toLowerCase()) {
    return false;
  }
  return readCanonicalLeaderServiceRole(service) ===
    String(RAFT_ROLE.LEADER).toLowerCase() &&
    readCanonicalLeaderServiceNodeId(service) !== null;
}
function buildCanonicalLeaderReference(leaderNodeId) {
  const normalizedLeaderNodeId =
    normalizeCanonicalLeaderNodeIdValue(leaderNodeId);
  return normalizedLeaderNodeId !== null ?
    Object.freeze({
      state: CANONICAL_LEADER_REFERENCE_STATE.AVAILABLE,
      nodeId: normalizedLeaderNodeId,
    }) :
    Object.freeze({
      state: CANONICAL_LEADER_REFERENCE_STATE.MISSING,
    });
}

function buildCanonicalLeaderIdentitySnapshot(
  state,
  source,
  leaderNodeId,
  leaderWitnessNodeCount = NUM.ZERO,
) {
  const normalizedLeaderNodeId =
    normalizeCanonicalLeaderNodeIdValue(leaderNodeId);
  return Object.freeze({
    state,
    source,
    leaderReference: buildCanonicalLeaderReference(normalizedLeaderNodeId),
    ...(normalizedLeaderNodeId !== null ? {
      leaderNodeId: normalizedLeaderNodeId,
    } : {}),
    leaderWitnessNodeCount,
  });
}

function resolveCanonicalLeaderIdentitySnapshot(options = {}) {
  const ownerLeaderNodeId = normalizeCanonicalLeaderNodeIdValue(
    options.ownerLeaderNodeId ??
      readCanonicalLeaderPartitionNodeId(options.partition),
  );
  if (ownerLeaderNodeId !== null) {
    return buildCanonicalLeaderIdentitySnapshot(
      CANONICAL_LEADER_IDENTITY_STATE.OWNER_CONFIRMED,
      CANONICAL_LEADER_IDENTITY_SOURCE.OWNER_ROW,
      ownerLeaderNodeId,
      NUM.ZERO,
    );
  }
  const retainedLeaderNodeId = normalizeCanonicalLeaderNodeIdValue(
    options.retainedLeaderNodeId,
  );
  if (retainedLeaderNodeId !== null) {
    return buildCanonicalLeaderIdentitySnapshot(
      CANONICAL_LEADER_IDENTITY_STATE.RETAINED_RUNTIME,
      CANONICAL_LEADER_IDENTITY_SOURCE.RETAINED_RUNTIME,
      retainedLeaderNodeId,
      NUM.ZERO,
    );
  }

  const partitionPresent = options.partitionPresent === true ||
    (options.partition && typeof options.partition === TYPEOF.OBJECT);
  if (!partitionPresent) {
    return buildCanonicalLeaderIdentitySnapshot(
      CANONICAL_LEADER_IDENTITY_STATE.MISSING,
      CANONICAL_LEADER_IDENTITY_SOURCE.NONE,
      null,
      NUM.ZERO,
    );
  }

  const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : [];
  const leaderWitnessNodeIds = [...new Set(
    serviceRows
      .filter((service) => isCanonicalLeaderRoleWitness(service))
      .map((service) => readCanonicalLeaderServiceNodeId(service))
      .filter((nodeId) => nodeId !== null),
  )];

  if (leaderWitnessNodeIds.length === NUM.ONE) {
    return buildCanonicalLeaderIdentitySnapshot(
      CANONICAL_LEADER_IDENTITY_STATE.SERVICE_ROLE_DERIVED,
      CANONICAL_LEADER_IDENTITY_SOURCE.SERVICE_ROLE,
      leaderWitnessNodeIds[NUM.ZERO],
      leaderWitnessNodeIds.length,
    );
  }

  if (leaderWitnessNodeIds.length > NUM.ONE) {
    return buildCanonicalLeaderIdentitySnapshot(
      CANONICAL_LEADER_IDENTITY_STATE.AMBIGUOUS_SERVICE_ROLE,
      CANONICAL_LEADER_IDENTITY_SOURCE.SERVICE_ROLE,
      null,
      leaderWitnessNodeIds.length,
    );
  }

  return buildCanonicalLeaderIdentitySnapshot(
    CANONICAL_LEADER_IDENTITY_STATE.MISSING,
    CANONICAL_LEADER_IDENTITY_SOURCE.NONE,
    null,
    NUM.ZERO,
  );
}

function countCanonicalLeaderActiveServices(
  serviceRows = [],
  leaderNodeId = null,
) {
  const normalizedLeaderNodeId =
    normalizeCanonicalLeaderNodeIdValue(leaderNodeId);
  if (normalizedLeaderNodeId === null) {
    return NUM.ZERO;
  }
  return serviceRows.filter((service) => {
    return readCanonicalLeaderServiceNodeId(service) === normalizedLeaderNodeId &&
      normalizeCanonicalLeaderServiceStatus(service) ===
        String(SERVICE_STATUS.ACTIVE).toLowerCase();
  }).length;
}

function buildCanonicalPartitionLeaderObservation(
  state,
  reasonCode,
  leaderNodeId = null,
  leaderWitnessNodeCount = NUM.ZERO,
) {
  const normalizedLeaderNodeId =
    normalizeCanonicalLeaderNodeIdValue(leaderNodeId);
  return Object.freeze({
    state,
    reasonCode,
    leaderWitnessNodeCount,
    ...(normalizedLeaderNodeId !== null ? {
      observedLeaderNodeId: normalizedLeaderNodeId,
      leaderNodeId: normalizedLeaderNodeId,
    } : {}),
  });
}

function resolveCanonicalPartitionLeaderObservation(options = {}) {
  const identitySnapshot =
    options.identitySnapshot &&
      typeof options.identitySnapshot === TYPEOF.OBJECT ?
      options.identitySnapshot :
      resolveCanonicalLeaderIdentitySnapshot(options);
  const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : [];
  const partitionPresent = options.partitionPresent === true ||
    (
      options.partition &&
      typeof options.partition === TYPEOF.OBJECT
    );
  const activeLeaderServiceCount = countCanonicalLeaderActiveServices(
    serviceRows,
    identitySnapshot.leaderNodeId,
  );

  if (
    identitySnapshot.state === CANONICAL_LEADER_IDENTITY_STATE.OWNER_CONFIRMED
  ) {
    return activeLeaderServiceCount > NUM.ZERO ?
      buildCanonicalPartitionLeaderObservation(
        CANONICAL_PARTITION_LEADER_OBSERVATION_STATE.AVAILABLE,
        CANONICAL_PARTITION_LEADER_OBSERVATION_REASON.OWNER_ROW_CONFIRMED,
        identitySnapshot.leaderNodeId,
        identitySnapshot.leaderWitnessNodeCount,
      ) :
      buildCanonicalPartitionLeaderObservation(
        CANONICAL_PARTITION_LEADER_OBSERVATION_STATE.DEFERRED,
        CANONICAL_PARTITION_LEADER_OBSERVATION_REASON.OWNER_ROW_STALE,
        identitySnapshot.leaderNodeId,
        identitySnapshot.leaderWitnessNodeCount,
      );
  }

  if (
    identitySnapshot.state ===
      CANONICAL_LEADER_IDENTITY_STATE.RETAINED_RUNTIME
  ) {
    return activeLeaderServiceCount > NUM.ZERO ?
      buildCanonicalPartitionLeaderObservation(
        CANONICAL_PARTITION_LEADER_OBSERVATION_STATE.AVAILABLE,
        CANONICAL_PARTITION_LEADER_OBSERVATION_REASON
          .RETAINED_RUNTIME_OWNER,
        identitySnapshot.leaderNodeId,
        identitySnapshot.leaderWitnessNodeCount,
      ) :
      buildCanonicalPartitionLeaderObservation(
        CANONICAL_PARTITION_LEADER_OBSERVATION_STATE.DEFERRED,
        CANONICAL_PARTITION_LEADER_OBSERVATION_REASON.OWNER_ROW_STALE,
        identitySnapshot.leaderNodeId,
        identitySnapshot.leaderWitnessNodeCount,
      );
  }

  return buildCanonicalPartitionLeaderObservation(
    partitionPresent ?
      CANONICAL_PARTITION_LEADER_OBSERVATION_STATE.DEFERRED :
      CANONICAL_PARTITION_LEADER_OBSERVATION_STATE.MISSING,
    CANONICAL_PARTITION_LEADER_OBSERVATION_REASON.OWNER_ROW_MISSING,
    null,
    identitySnapshot.leaderWitnessNodeCount,
  );
}

function normalizeCanonicalLeaderNodeId(routingSnapshot = null) {
  return normalizeCanonicalLeaderNodeIdValue(
    routingSnapshot?.canonicalLeaderNodeId,
  );
}

function resolveCanonicalLeaderRoutingGapState(routingSnapshot = null) {
  const canonicalLeaderNodeId =
    normalizeCanonicalLeaderNodeId(routingSnapshot);
  const canonicalLeaderServiceCount = Number(
    routingSnapshot?.canonicalLeaderServiceCount,
  );
  const serviceRowCount = Number(routingSnapshot?.serviceRowCount);
  const activeAddressedServiceCount = Number(
    routingSnapshot?.activeAddressedServiceCount,
  );

  if (canonicalLeaderNodeId === null) {
    return serviceRowCount > NUM.ZERO ||
      activeAddressedServiceCount > NUM.ZERO ?
      CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING :
      CANONICAL_LEADER_ROUTING_GAP_STATE.NONE;
  }

  if (canonicalLeaderServiceCount === NUM.ZERO &&
      (
        activeAddressedServiceCount > NUM.ZERO ||
        serviceRowCount === NUM.ZERO
      )) {
    return CANONICAL_LEADER_ROUTING_GAP_STATE.SERVICE_MISSING;
  }

  return CANONICAL_LEADER_ROUTING_GAP_STATE.NONE;
}

function hasCanonicalLeaderServiceGap(routingSnapshot = null) {
  return resolveCanonicalLeaderRoutingGapState(routingSnapshot) ===
    CANONICAL_LEADER_ROUTING_GAP_STATE.SERVICE_MISSING;
}

function hasCanonicalLeaderOwnerGap(routingSnapshot = null) {
  return resolveCanonicalLeaderRoutingGapState(routingSnapshot) ===
    CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING;
}

function hasCanonicalLeaderRoutingGap(routingSnapshot = null) {
  return resolveCanonicalLeaderRoutingGapState(routingSnapshot) !==
    CANONICAL_LEADER_ROUTING_GAP_STATE.NONE;
}

export {
  buildCanonicalLeaderIdentitySnapshot,
  CANONICAL_PARTITION_LEADER_OBSERVATION_REASON,
  CANONICAL_PARTITION_LEADER_OBSERVATION_STATE,
  CANONICAL_LEADER_IDENTITY_SOURCE,
  CANONICAL_LEADER_IDENTITY_STATE,
  CANONICAL_LEADER_ROUTING_GAP_STATE,
  hasCanonicalLeaderOwnerGap,
  hasCanonicalLeaderRoutingGap,
  hasCanonicalLeaderServiceGap,
  resolveCanonicalPartitionLeaderObservation,
  resolveCanonicalLeaderIdentitySnapshot,
  resolveCanonicalLeaderRoutingGapState,
};
