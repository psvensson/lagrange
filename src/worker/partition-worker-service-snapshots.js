import {LEADERSHIP_MESSAGE_TYPE} from './worker-constants.js';

function buildLeadershipStatusSnapshot({
  raftGroup,
  leaderActivated,
  replicaId,
}) {
  return {
    type: LEADERSHIP_MESSAGE_TYPE.LEADERSHIP_STATUS,
    isLeader: raftGroup ? raftGroup.isLeaderReplica() : false,
    leaderActivated,
    term: raftGroup ? raftGroup.getCurrentTerm() : 0,
    leaderId: raftGroup ? raftGroup.getLeaderId() : null,
    replicaId,
  };
}

function buildPartitionWorkerStats({
  baseStats,
  partitionId,
  tableId,
  role,
  isLeader,
  leaderActivated,
  leaderId,
  term,
  replicaCount,
  cdcSubscriberCount,
}) {
  return {
    ...baseStats,
    partitionId,
    tableId,
    role,
    isLeader,
    leaderActivated,
    leaderId,
    term,
    replicaCount,
    cdcSubscriberCount,
  };
}

export {buildLeadershipStatusSnapshot, buildPartitionWorkerStats};
