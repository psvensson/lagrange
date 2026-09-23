import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {raftRsMembershipAdministration} from
  '../raft/raft-rs-membership-administration.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_OPERATION,
} from '../raft/raft-operation-port-constants.js';

const {PARTITION_SERVICE_LOG_MSG, RaftRole} = PARTITION_SERVICE_SHARED;

function reservePartitionRaftPeerIdentity(
  service,
  joiningReplicaIdentity,
) {
  return raftRsMembershipAdministration.reservePeerIdentity({
    groupId: service.partitionId,
    localReplicaIdentity: service.replicaId,
    joiningReplicaIdentity,
  });
}

/**
 * The partition's one path to admitting a peer into its raft configuration.
 * Only the leader proposes the admission, in the port's canonical request
 * shape; a replica that is not the leader, or a peer the committed
 * configuration already names, is a typed no-op the replica records - a
 * follower or learner that observes the same peer never forwards a redundant
 * proposal. Leadership and membership are read from the port's status (the
 * core), never from the services cache.
 * @param {Object} service - The partition service.
 * @param {Object} peer - {replicaIdentity, peerAddress}.
 * @return {Object} Frozen {replicaIdentity, outcome}, with the port's
 *   proposal outcome when the admission was proposed.
 */
function admitPartitionRaftPeer(service, {replicaIdentity, peerAddress}) {
  const status = service.raft.readStatus();
  let admission;
  if (status?.role !== RaftRole.LEADER) {
    admission = {replicaIdentity,
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.NOT_LEADER};
  } else if ((status.peers || []).some((peer) =>
    peer.replicaIdentity === replicaIdentity)) {
    admission = {replicaIdentity,
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.ALREADY_MEMBER};
  } else {
    admission = {replicaIdentity,
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
      proposal: service.raft.proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
        replicaIdentity,
        peerAddress,
      })};
  }
  service.logger.debug(PARTITION_SERVICE_LOG_MSG.RAFT_PEER_ADMISSION, {
    partitionId: service.partitionId,
    replicaId: service.replicaId,
    peerAddress,
    admission: {
      replicaIdentity: admission.replicaIdentity,
      outcome: admission.outcome,
    },
  });
  return Object.freeze(admission);
}

export {admitPartitionRaftPeer, reservePartitionRaftPeerIdentity};
