import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  AddressManager,
  ENTITY_TYPE,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_TYPE,
  ReplicaStatus,
  SERVICE_TYPE,
  TABLES,
} = PARTITION_SERVICE_SHARED;

function resolveLiveRaftLeaderAddressForPeer(partitionService, peerId) {
  const leaderAddress = partitionService.raft?.leader;
  if (
    typeof peerId !== 'string' ||
    peerId.length === 0 ||
    typeof leaderAddress !== 'string' ||
    leaderAddress.length === 0
  ) {
    return null;
  }
  const observedLeaderId = partitionService.normalizeLeaderReplicaId(
    partitionService.leaderId,
  );
  if (observedLeaderId && observedLeaderId !== peerId) {
    return null;
  }
  const addressManager = AddressManager.getInstance();
  const validation = addressManager.validate(leaderAddress);
  if (!validation.valid) {
    return null;
  }
  try {
    const parsed = addressManager.parse(leaderAddress);
    if (
      parsed.serviceType !== ENTITY_TYPE.PARTITION ||
      parsed.serviceId !== peerId
    ) {
      return null;
    }
  } catch (_error) {
    return null;
  }
  partitionService.logger.debug(
    PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_FROM_LIVE_RAFT_LEADER,
    {
      peerId,
      address: leaderAddress,
      partitionId: partitionService.partitionId,
    },
  );
  return leaderAddress;
}

function resolvePeerAddressFromService(addressManager, serviceRow, replicaId) {
  if (
    typeof serviceRow.address === 'string' &&
    serviceRow.address.length > 0
  ) {
    return serviceRow.address;
  }
  if (
    typeof serviceRow.node_id === 'string' &&
    serviceRow.node_id.length > 0
  ) {
    return addressManager.format(
      serviceRow.node_id,
      ENTITY_TYPE.PARTITION,
      replicaId,
    );
  }
  return null;
}

function shouldSkipPeerServiceRow(partitionService, serviceRow, replicaId) {
  if (!replicaId || replicaId === partitionService.replicaId) {
    return true;
  }
  const status = serviceRow.status || ReplicaStatus.ACTIVE;
  return (
    status === ReplicaStatus.FAILED ||
    status === ReplicaStatus.REMOVING ||
    status === ReplicaStatus.REMOVED
  );
}

function addressMatchesReplica(addressManager, address, replicaId) {
  if (typeof address !== 'string' || address.length === 0) {
    return false;
  }
  try {
    const parsed = addressManager.parse(address);
    return (
      parsed.serviceType === ENTITY_TYPE.PARTITION &&
      parsed.serviceId === replicaId
    );
  } catch (_error) {
    return false;
  }
}

function findStaleAddressesForReplica(
  addressManager,
  currentNodes,
  replicaId,
  expectedAddress,
) {
  return currentNodes
    .map((node) => node?.address)
    .filter((address) => {
      return (
        address !== expectedAddress &&
        addressMatchesReplica(addressManager, address, replicaId)
      );
    });
}

function removeExactReplicaId(replicaIds, replicaId) {
  if (!Array.isArray(replicaIds)) {
    return false;
  }
  let removed = false;
  for (let index = replicaIds.length - 1; index >= 0; index -= 1) {
    if (replicaIds[index] === replicaId) {
      replicaIds.splice(index, 1);
      removed = true;
    }
  }
  return removed;
}

function isExplicitPeerRetirement(operation, serviceRow) {
  return (
    operation === PARTITION_SERVICE_LITERAL.DELETE ||
    serviceRow?.status === ReplicaStatus.REMOVED
  );
}

function resolveServiceReplicaId(serviceRow) {
  return serviceRow?.service_id || serviceRow?.replica_id || null;
}

function retireMatchingRaftAddresses(
  partitionService,
  addressManager,
  replicaId,
  serviceAddress,
) {
  if (!addressMatchesReplica(addressManager, serviceAddress, replicaId)) {
    return null;
  }
  const raftNodes = Array.isArray(partitionService.raft.nodes) ?
    [...partitionService.raft.nodes] :
    [];
  const retiredAddresses = new Set(
    raftNodes
      .map((node) => node?.address)
      .filter((address) => address === serviceAddress),
  );
  if (typeof partitionService.raft.leave === PARTITION_SERVICE_TYPE.FUNCTION) {
    for (const address of retiredAddresses) {
      partitionService.raft.leave(address);
    }
  }
  return retiredAddresses;
}

function removeMatchingPeerAddresses(
  peerAddresses,
  serviceAddress,
) {
  if (!Array.isArray(peerAddresses)) {
    return;
  }
  for (let index = peerAddresses.length - 1; index >= 0; index -= 1) {
    if (peerAddresses[index] === serviceAddress) {
      peerAddresses.splice(index, 1);
    }
  }
}

function retireRaftPeerFromAuthoritativeServiceChange(
  partitionService,
  operation,
  serviceRow,
) {
  const replicaId = resolveServiceReplicaId(serviceRow);
  if (
    !isExplicitPeerRetirement(operation, serviceRow) ||
    !partitionService.raft ||
    !replicaId ||
    replicaId === partitionService.replicaId
  ) {
    return false;
  }

  const addressManager = AddressManager.getInstance();
  const serviceAddress = resolvePeerAddressFromService(
    addressManager,
    serviceRow,
    replicaId,
  );
  const retiredAddresses = retireMatchingRaftAddresses(
    partitionService,
    addressManager,
    replicaId,
    serviceAddress,
  );
  if (!retiredAddresses) {
    return false;
  }
  removeExactReplicaId(partitionService.replicaIds, replicaId);
  removeMatchingPeerAddresses(
    partitionService.peerAddresses,
    serviceAddress,
  );
  partitionService.logger.debug(
    PARTITION_SERVICE_LOG_MSG.PEER_RETIRED_FROM_AUTHORITATIVE_SERVICE_CHANGE,
    {
      operation,
      partitionId: partitionService.partitionId,
      replicaId,
      retiredAddresses: [...retiredAddresses],
    },
  );
  return true;
}

function reconcileRaftPeersFromCacheForService(partitionService) {
  if (
    !partitionService.raft ||
    !partitionService.systemTableCache ||
    typeof partitionService.systemTableCache.filter !==
      PARTITION_SERVICE_TYPE.FUNCTION
  ) {
    return;
  }
  const services = partitionService.systemTableCache.filter(
    TABLES.SERVICES,
    (serviceRow) => {
      return (
        serviceRow.partition_id === partitionService.partitionId &&
        serviceRow.service_type === SERVICE_TYPE.PARTITION
      );
    },
  );
  if (services.length === 0) {
    return;
  }
  const addressManager = AddressManager.getInstance();
  const expectedAddressesByReplicaId = /* @__PURE__ */ new Map();
  for (const serviceRow of services) {
    const replicaId = serviceRow.service_id || serviceRow.replica_id;
    if (shouldSkipPeerServiceRow(partitionService, serviceRow, replicaId)) {
      continue;
    }
    const peerAddress = resolvePeerAddressFromService(
      addressManager,
      serviceRow,
      replicaId,
    );
    if (!peerAddress) {
      continue;
    }
    expectedAddressesByReplicaId.set(replicaId, peerAddress);
    if (!partitionService.replicaIds.includes(replicaId)) {
      partitionService.replicaIds.push(replicaId);
    }
  }
  const currentNodes = Array.isArray(partitionService.raft.nodes) ?
    [...partitionService.raft.nodes] :
    [];
  const currentAddresses = new Set(
    currentNodes
      .map((node) => node?.address)
      .filter(
        (address) => typeof address === 'string' && address.length > 0,
      ),
  );
  for (const [
    replicaId,
    expectedAddress,
  ] of expectedAddressesByReplicaId.entries()) {
    const staleAddresses = findStaleAddressesForReplica(
      addressManager,
      currentNodes,
      replicaId,
      expectedAddress,
    );
    if (typeof partitionService.raft.leave === PARTITION_SERVICE_TYPE.FUNCTION) {
      for (const staleAddress of staleAddresses) {
        partitionService.raft.leave(staleAddress);
        currentAddresses.delete(staleAddress);
      }
    }
    if (!currentAddresses.has(expectedAddress)) {
      partitionService.raftProvider.joinPeer(
        partitionService.raft,
        expectedAddress,
      );
      currentAddresses.add(expectedAddress);
    }
  }
}

export {
  reconcileRaftPeersFromCacheForService,
  retireRaftPeerFromAuthoritativeServiceChange,
  resolveLiveRaftLeaderAddressForPeer,
};
