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

/**
 * A new replica's bootstrap membership: every replica the given service rows
 * name, then the joining target, each with its address. It carries the
 * members the caller observed and nothing else - no member is left out to
 * anticipate a removal (owner decision D1): a removal reaches the new
 * replica from its group (on rs-raft, as the committed RemoveNode in the log
 * it replays), never from its bootstrap.
 * @param {Object} [options] - {serviceType, serviceRows, targetReplicaId,
 *   targetNodeId, targetAddress}.
 * @return {{replicaIds: string[], peerAddresses: string[]}|null} The
 *   membership, or null for a service type that has none.
 */
function buildReplicatedServiceBootstrapTopology(options = {}) {
  const serviceType = normalizeServiceType(options.serviceType);
  const entityType = resolveEntityTypeForServiceType(serviceType);
  if (entityType === null) {
    return null;
  }

  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  const replicaIds = [];
  const peerAddresses = [];
  const seenReplicaIds = new Set();
  const seenPeerAddresses = new Set();

  const appendReplicaTopology = (replicaId, nodeId, address) => {
    const normalizedReplicaId = normalizeString(replicaId);
    const normalizedNodeId = normalizeString(nodeId);
    if (normalizedReplicaId.length === 0) {
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
