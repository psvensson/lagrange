import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  proposePeerRetirement,
  takeAdmissionsInFlight,
  takeDeferredRetirements,
} from './partition-service-raft-membership-administration.js';
import {RAFT_EVENT, RAFT_MEMBERSHIP_OPERATION} from
  '../raft/raft-operation-port-constants.js';
import {GROUP_RETIREMENT_REASON} from './group-retirement-evidence.js';
import {redriveAcceptedAdmissionRequests} from
  './partition-replica-admission.js';

// Services rows are discovery (A8): a retiring row may trigger a REMOVE of
// the configured peer it names, but no row ever admits a peer. Admission is
// the request owner's (partition-replica-admission.js), answered from the
// committed replica operation (committed-read amendment-1 A2/Q1 superseded
// 2026-11-02).

const {
  AddressManager,
  ENTITY_TYPE,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_TYPE,
  ReplicaStatus,
} = PARTITION_SERVICE_SHARED;

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

// The configured peer a retiring row names, matched on the address the
// peer's COMMITTED node gives it (the port's status address): a row naming
// another address is no evidence about this member. The removal names the
// replica identity, the one REMOVE_PEER shape the port takes.
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
  if (retiredAddresses.size > 0 &&
      typeof partitionService.raft?.proposeConfChange ===
      PARTITION_SERVICE_TYPE.FUNCTION) {
    proposePeerRetirement(partitionService, {
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity: replicaId,
    });
  }
  return retiredAddresses;
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

  // The row is evidence about the configured peer only where it names the
  // address the peer's committed node gives it (the port's status address);
  // the removal names the replica identity.
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

/**
 * Re-drive, whenever a configuration change settles (CONF_CHANGE_APPLIED)
 * or this replica gains leadership (LEADER): the deferred retirements, and
 * the admission requests this leader accepted from targets and has not seen
 * settle (the admission owner's in-flight set is handed over first, so a
 * settled proposal is evaluated again from its committed operation). Rows
 * re-drive nothing.
 * @param {Object} partitionService - The partition service (current port).
 */
function redriveAdmissionsOnMembershipChange(partitionService) {
  const redrive = () => {
    takeAdmissionsInFlight(partitionService);
    const retirements = takeDeferredRetirements(partitionService);
    queueMicrotask(() => {
      for (const change of retirements) {
        proposePeerRetirement(partitionService, change);
      }
      redriveAcceptedAdmissionRequests(partitionService);
    });
  };
  partitionService.raft.subscribe(RAFT_EVENT.CONF_CHANGE_APPLIED, redrive);
  partitionService.raft.subscribe(RAFT_EVENT.LEADER, redrive);
}

export {
  redriveAdmissionsOnMembershipChange,
  retireRaftPeerFromAuthoritativeServiceChange,
};
