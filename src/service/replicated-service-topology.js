import {AddressManager} from '../address/address-manager.js';
import {
  ENTITY_TYPE,
  SERVICE_TYPE,
} from '../constants/index.js';


function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
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
  explicitAddress = '',
) {
  const normalizedAddress = normalizeString(explicitAddress);
  if (normalizedAddress.length > 0) {
    return normalizedAddress;
  }

  const normalizedNodeId = normalizeString(nodeId);
  const normalizedReplicaId = normalizeString(replicaId);
  const entityType = resolveEntityTypeForServiceType(serviceType);
  if (normalizedNodeId.length === 0 ||
      normalizedReplicaId.length === 0 ||
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
      .filter((replicaId) => replicaId.length > 0),
  );
  const replicaIds = [];
  const peerAddresses = [];
  const seenReplicaIds = new Set();
  const seenPeerAddresses = new Set();

  const appendReplicaTopology = (replicaId, nodeId, address) => {
    const normalizedReplicaId = normalizeString(replicaId);
    const normalizedNodeId = normalizeString(nodeId);
    if (normalizedReplicaId.length === 0 ||
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
    if (typeof resolvedAddress === 'string' &&
        resolvedAddress.length > 0 &&
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
