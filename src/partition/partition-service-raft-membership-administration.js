import {raftRsMembershipAdministration} from
  '../raft/raft-rs-membership-administration.js';

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

export {reservePartitionRaftPeerIdentity};
