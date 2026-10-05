import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_MEMBERSHIP_RESERVATION_OUTCOME,
} from '../raft/raft-operation-port-constants.js';
import {
  admitPartitionRaftPeer,
  reservePartitionRaftPeerIdentity,
  proposePeerRetirement,
  takeAdmissionsInFlight,
  takeDeferredRetirements,
} from './partition-service-raft-membership-administration.js';
import {RAFT_EVENT} from '../raft/raft-operation-port-constants.js';
import {GROUP_RETIREMENT_REASON} from './group-retirement-evidence.js';

// The admission outcomes that leave a peer outside the configuration.
const UNADMITTED_PEER_OUTCOMES = Object.freeze(new Set([
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME.DEFERRED,
]));

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
  const leaderAddress = partitionService.raft?.readStatus?.().leaderAddress;
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

// A retiring row is an explicit retirement: its replica marked itself
// REMOVING and keeps participating until its RemoveNode commits (owner
// ruling F2), so the group proposes the removal while the row still
// addresses the replica; the row's delete and REMOVED follow retirement.
const EXPLICIT_PEER_RETIREMENT_STATUSES = Object.freeze(new Set([
  ReplicaStatus.REMOVING,
  ReplicaStatus.REMOVED,
]));

// A replica of a group retired as a unit (a verified group-retirement
// REMOVE marks its REMOVING row so; owner decision 2026-10-04, amending F2)
// leaves with its whole group: nobody proposes a conf change for it, so no
// member is removed down to a last voter.
function isExplicitPeerRetirement(operation, serviceRow) {
  if (serviceRow?.trigger_reason === GROUP_RETIREMENT_REASON) {
    return false;
  }
  return (
    operation === PARTITION_SERVICE_LITERAL.DELETE ||
    EXPLICIT_PEER_RETIREMENT_STATUSES.has(serviceRow?.status)
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
  const raftNodes = partitionService.raft?.readStatus?.().peers || [];
  const retiredAddresses = new Set(
    raftNodes
      .map((node) => node?.address)
      .filter((address) => address === serviceAddress),
  );
  if (typeof partitionService.raft?.proposeConfChange ===
      PARTITION_SERVICE_TYPE.FUNCTION) {
    for (const address of retiredAddresses) {
      proposePeerRetirement(partitionService, {
        type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
        peerAddress: address,
        replicaIdentity: replicaId,
      });
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
    !replicaId
  ) {
    return false;
  }
  // Its own retiring row: the replica proposes its own RemoveNode through
  // its own port (round 2 F-1). Conf changes are taken only at the leader's
  // port, so a leader source removes itself here - nobody else can - and a
  // follower's copy is refused NOT_LEADER and made again should it lead.
  if (replicaId === partitionService.replicaId) {
    proposePeerRetirement(partitionService, {
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity: replicaId,
    });
    return true;
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

function reconcileExpectedRaftPeer({
  partitionService,
  addressManager,
  currentNodes,
  currentAddresses,
  replicaId,
  expectedAddress,
}) {
  const staleAddresses = findStaleAddressesForReplica(
    addressManager,
    currentNodes,
    replicaId,
    expectedAddress,
  );
  if (typeof partitionService.raft?.proposeConfChange ===
      PARTITION_SERVICE_TYPE.FUNCTION) {
    for (const staleAddress of staleAddresses) {
      proposePeerRetirement(partitionService, {
        type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
        peerAddress: staleAddress,
      });
      currentAddresses.delete(staleAddress);
    }
  }
  if (currentAddresses.has(expectedAddress)) {
    return;
  }
  const reservation = reservePartitionRaftPeerIdentity(
    partitionService, replicaId);
  if (reservation.outcome !==
      RAFT_MEMBERSHIP_RESERVATION_OUTCOME.RESERVED &&
      reservation.outcome !==
      RAFT_MEMBERSHIP_RESERVATION_OUTCOME.NOT_MANAGED) {
    return;
  }
  const admission = admitPartitionRaftPeer(partitionService, {
    replicaIdentity: replicaId,
    peerAddress: expectedAddress,
  });
  // A refused or deferred admission left the peer outside the
  // configuration: this pass does not count its address as current.
  if (!UNADMITTED_PEER_OUTCOMES.has(admission.outcome)) {
    currentAddresses.add(expectedAddress);
  }
}

// The address each services row expects for a peer replica (all of them, or
// only those named), each named replica kept in the partition's hint list.
function expectedPeerAddressesOf(partitionService, services, addressManager,
  onlyReplicaIds) {
  const expected = new Map();
  for (const serviceRow of services) {
    const replicaId = serviceRow.service_id || serviceRow.replica_id;
    if (shouldSkipPeerServiceRow(partitionService, serviceRow, replicaId) ||
        (onlyReplicaIds !== null && !onlyReplicaIds.has(replicaId))) {
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
    expected.set(replicaId, peerAddress);
    if (!partitionService.replicaIds.includes(replicaId)) {
      partitionService.replicaIds.push(replicaId);
    }
  }
  return expected;
}

function reconcileRaftPeersFromCacheForService(partitionService,
  options = {}) {
  const onlyReplicaIds = options.onlyReplicaIds ?? null;
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
  const expectedAddressesByReplicaId = expectedPeerAddressesOf(
    partitionService, services, addressManager, onlyReplicaIds);
  const currentNodes = partitionService.raft?.readStatus?.().peers || [];
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
    reconcileExpectedRaftPeer({
      partitionService,
      addressManager,
      currentNodes,
      currentAddresses,
      replicaId,
      expectedAddress,
    });
  }
}

/**
 * Re-drive the admissions this replica proposed or deferred (committed-read
 * amendment 1, section 3.5; verification V2) whenever a configuration change
 * settles - a conf-change entry applied, effective or not, or the core's
 * pending index reached (CONF_CHANGE_APPLIED) - and whenever it gains
 * leadership (a latch of an earlier term never outlives it). Each is
 * re-evaluated once from its services row, and nothing else is: a voter the
 * group removed (its row retiring or gone) is not re-admitted by this
 * wake-up.
 * @param {Object} partitionService - The partition service (current port).
 */
function redriveAdmissionsOnMembershipChange(partitionService) {
  const redrive = () => {
    const taken = takeAdmissionsInFlight(partitionService);
    const retirements = takeDeferredRetirements(partitionService);
    if (taken.size > 0 || retirements.length > 0) {
      queueMicrotask(() => {
        for (const change of retirements) {
          proposePeerRetirement(partitionService, change);
        }
        if (taken.size > 0) {
          reconcileRaftPeersFromCacheForService(
            partitionService, {onlyReplicaIds: taken});
        }
      });
    }
  };
  partitionService.raft.subscribe(RAFT_EVENT.CONF_CHANGE_APPLIED, redrive);
  partitionService.raft.subscribe(RAFT_EVENT.LEADER, redrive);
}

export {
  reconcileRaftPeersFromCacheForService,
  redriveAdmissionsOnMembershipChange,
  retireRaftPeerFromAuthoritativeServiceChange,
  resolveLiveRaftLeaderAddressForPeer,
};
