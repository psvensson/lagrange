import {AddressManager} from '../address/address-manager.js';
import {
  ENTITY_TYPE,
  NUM,
  SERVICE_TYPE,
  TYPEOF,
} from '../constants/index.js';

const LOCAL_STR_EMPTY = '';

function normalizeString(value) {
  return typeof value === TYPEOF.STRING ? value.trim() : LOCAL_STR_EMPTY;
}

function normalizeServiceType(serviceType) {
  return normalizeString(serviceType).toLowerCase();
}

function resolveEntityTypeForServiceType(serviceType) {
  const normalizedServiceType = normalizeServiceType(serviceType);
  if (normalizedServiceType === SERVICE_TYPE.PARTITION) {
    return ENTITY_TYPE.PARTITION;
  }
  if (normalizedServiceType === SERVICE_TYPE.MESSAGE_GROUP) {
    return ENTITY_TYPE.MESSAGE_GROUP;
  }
  return null;
}

function formatReplicatedServiceAddress(
  serviceType,
  nodeId,
  replicaId,
  explicitAddress = LOCAL_STR_EMPTY,
) {
  const normalizedAddress = normalizeString(explicitAddress);
  if (normalizedAddress.length > NUM.ZERO) {
    return normalizedAddress;
  }

  const normalizedNodeId = normalizeString(nodeId);
  const normalizedReplicaId = normalizeString(replicaId);
  const entityType = resolveEntityTypeForServiceType(serviceType);
  if (normalizedNodeId.length === NUM.ZERO ||
      normalizedReplicaId.length === NUM.ZERO ||
      entityType === null) {
    return null;
  }

  return AddressManager.getInstance().format(
    normalizedNodeId,
    entityType,
    normalizedReplicaId,
  );
}

function buildReplicatedServiceBootstrapTopology(options = {}) {
  const serviceType = normalizeServiceType(options.serviceType);
  const entityType = resolveEntityTypeForServiceType(serviceType);
  if (entityType === null) {
    return null;
  }

  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  const excludeReplicaIds = new Set(
    (Array.isArray(options.excludeReplicaIds) ? options.excludeReplicaIds : [])
      .map((replicaId) => normalizeString(replicaId))
      .filter((replicaId) => replicaId.length > NUM.ZERO),
  );
  const replicaIds = [];
  const peerAddresses = [];
  const seenReplicaIds = new Set();
  const seenPeerAddresses = new Set();

  const appendReplicaTopology = (replicaId, nodeId, address) => {
    const normalizedReplicaId = normalizeString(replicaId);
    const normalizedNodeId = normalizeString(nodeId);
    if (normalizedReplicaId.length === NUM.ZERO ||
        excludeReplicaIds.has(normalizedReplicaId)) {
      return;
    }

    if (!seenReplicaIds.has(normalizedReplicaId)) {
      seenReplicaIds.add(normalizedReplicaId);
      replicaIds.push(normalizedReplicaId);
    }

    const resolvedAddress = formatReplicatedServiceAddress(
      serviceType,
      normalizedNodeId,
      normalizedReplicaId,
      address,
    );
    if (typeof resolvedAddress === TYPEOF.STRING &&
        resolvedAddress.length > NUM.ZERO &&
        !seenPeerAddresses.has(resolvedAddress)) {
      seenPeerAddresses.add(resolvedAddress);
      peerAddresses.push(resolvedAddress);
    }
  };

  for (const row of serviceRows) {
    appendReplicaTopology(
      row?.service_id || row?.replica_id || null,
      row?.node_id || null,
      row?.address || null,
    );
  }

  appendReplicaTopology(
    options.targetReplicaId,
    options.targetNodeId,
    options.targetAddress,
  );

  return {
    replicaIds,
    peerAddresses,
  };
}

export {
  buildReplicatedServiceBootstrapTopology,
  formatReplicatedServiceAddress,
  resolveEntityTypeForServiceType,
};
