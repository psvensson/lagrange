import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  forgetDeferredRetirement,
  proposePeerRetirement,
  takeAdmissionsInFlight,
  takeDeferredRetirements,
} from './partition-service-raft-membership-administration.js';
import {RAFT_EVENT, RAFT_MEMBERSHIP_OPERATION} from
  '../raft/raft-operation-port-constants.js';
import {GROUP_RETIREMENT_REASON} from './group-retirement-evidence.js';
import {isFailedCreateCleanupToken} from
  '../rebalancer/failed-create-cleanup-token.js';
import {redriveAcceptedAdmissionRequests} from
  './partition-replica-admission.js';
import {
  observeRemovalSubjectRetained,
  observeRemovalSubjectRetiring,
} from './partition-service-removal-subject-handoff.js';

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
// member is removed down to a last voter. A claimed failed-create target
// (status FAILED with an operation-bound failed-create cleanup token) has
// fenced and closed its runtime after admission input existed, so its dead
// peer is retired from the group immediately rather than wedging participant
// cutover while the terminal operation write settles.
function isClaimedFailedCreateServiceRow(serviceRow) {
  return (
    serviceRow?.status === ReplicaStatus.FAILED &&
    isFailedCreateCleanupToken(serviceRow?.cleanup_token)
  );
}

function isExplicitPeerRetirement(operation, serviceRow) {
  if (serviceRow?.trigger_reason === GROUP_RETIREMENT_REASON) {
    return false;
  }
  return (
    operation === PARTITION_SERVICE_LITERAL.DELETE ||
    EXPLICIT_PEER_RETIREMENT_STATUSES.has(serviceRow?.status) ||
    isClaimedFailedCreateServiceRow(serviceRow)
  );
}

function resolveServiceReplicaId(serviceRow) {
  return serviceRow?.service_id || serviceRow?.replica_id || null;
}

// Its own row: a retiring row makes the replica a removal subject, which
// never proposes its own RemoveNode - a leader that applies its own removal
// keeps leading in raft-rs while it refuses every proposal (B2, 2026-11-11).
// It hands any leadership it holds or gains to a surviving voter, and the
// survivor that leads removes it from the row it holds
// (partition-service-removal-subject-handoff.js). A row that serves again
// ends the subject's state; a group retired as a unit changes no leadership.
function observeOwnServiceRow(partitionService, operation, serviceRow) {
  if (isExplicitPeerRetirement(operation, serviceRow)) {
    observeRemovalSubjectRetiring(partitionService);
    return true;
  }
  if (serviceRow?.trigger_reason !== GROUP_RETIREMENT_REASON) {
    observeRemovalSubjectRetained(partitionService);
  }
  return false;
}

function retireRaftPeerFromAuthoritativeServiceChange(
  partitionService,
  operation,
  serviceRow,
) {
  const replicaId = resolveServiceReplicaId(serviceRow);
  if (!partitionService.raft || !replicaId) {
    return false;
  }
  if (replicaId === partitionService.replicaId) {
    return observeOwnServiceRow(partitionService, operation, serviceRow);
  }
  if (!isExplicitPeerRetirement(operation, serviceRow)) {
    // A peer whose row serves again is no longer being removed: a
    // retirement deferred from its earlier retiring row is dropped, never
    // re-proposed by a later settlement.
    if (serviceRow?.trigger_reason !== GROUP_RETIREMENT_REASON) {
      forgetDeferredRetirement(partitionService, replicaId);
    }
    return false;
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
 * Re-drive, whenever a configuration change settles (CONF_CHANGE_APPLIED),
 * this replica gains leadership (LEADER) or its live voter set changes
 * (VOTER_LIVENESS_CHANGED): the deferred retirements, and
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
  // A removal deferred on a live quorum (REMOVES_LIVE_QUORUM) waits for the
  // leader's live voter set to change.
  partitionService.raft.subscribe(RAFT_EVENT.VOTER_LIVENESS_CHANGED, redrive);
}

export {
  redriveAdmissionsOnMembershipChange,
  retireRaftPeerFromAuthoritativeServiceChange,
};
