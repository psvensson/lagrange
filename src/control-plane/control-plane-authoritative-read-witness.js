import {RAFT_ROLE} from '../raft/constants.js';

const AUTHORITATIVE_LEADER_WITNESS_STATE = 'observed';

function identifiesServingLeader(witness, partitionId) {
  return witness?.state === AUTHORITATIVE_LEADER_WITNESS_STATE &&
    witness?.partitionId === partitionId &&
    witness?.role === RAFT_ROLE.LEADER;
}

function hasServingReplicaIdentity(witness) {
  return typeof witness?.servingNodeId === 'string' &&
    witness.servingNodeId.length > 0 &&
    typeof witness?.servingReplicaId === 'string' &&
    witness.servingReplicaId.length > 0;
}

function hasLeaderObservationTime(witness) {
  return Number.isFinite(witness?.observedAtMs) && witness.observedAtMs >= 0;
}

function isValidLeaderReadAuthorityWitness(witness, partitionId) {
  return identifiesServingLeader(witness, partitionId) &&
    hasServingReplicaIdentity(witness) &&
    hasLeaderObservationTime(witness);
}

export {isValidLeaderReadAuthorityWitness};
