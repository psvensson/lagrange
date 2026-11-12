import {RAFT_ROLE} from '../raft/constants.js';
import {CDC_INTEGRATION_SERVICE_LITERAL} from
  '../cdc/cdc-integration-service-shared-constants.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  './control-plane-system-table-gateway-constants.js';

const AUTHORITATIVE_LEADER_WITNESS_STATE = 'observed';
const AUTHORITATIVE_LEADER_WITNESS_FAILURE =
  'authoritative_owner_leader_witness_required';

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

function enforceRequiredLeaderReadAuthority(queryResult, partitionId, readAuthority) {
  if (queryResult?.success !== true ||
      readAuthority.leaderMode !== CONTROL_PLANE_READ_LEADER_MODE.REQUIRED ||
      isValidLeaderReadAuthorityWitness(queryResult.readAuthorityWitness, partitionId)) {
    return queryResult;
  }
  return {
    ...queryResult,
    success: false,
    rows: [],
    count: 0,
    rowCount: 0,
    rowSetComplete: false,
    error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED,
    authorityFailureReason: AUTHORITATIVE_LEADER_WITNESS_FAILURE,
  };
}

export {enforceRequiredLeaderReadAuthority, isValidLeaderReadAuthorityWitness};
