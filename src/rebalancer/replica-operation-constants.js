/**
 * Replica operation message schema constants.
 */

import {FIELD, MESSAGE_TYPE} from '../constants/index.js';

const ReplicaOperationMessageType = Object.freeze({
  CREATE_REPLICA: MESSAGE_TYPE.CREATE_REPLICA,
  REMOVE_REPLICA: MESSAGE_TYPE.REMOVE_REPLICA,
  STEP_DOWN_REPLICA: MESSAGE_TYPE.STEP_DOWN_REPLICA,
  // The REPLACE owner's reads and proposals through the witness (target)
  // replica's handler (quest replace-source-removal-owner, amendment-1
  // step 3): its committed configuration and leadership, and a REMOVE_PEER
  // of the source through its port.
  READ_REPLICA_MEMBERSHIP: MESSAGE_TYPE.READ_REPLICA_MEMBERSHIP,
  RETIRE_REPLICA_PEER: MESSAGE_TYPE.RETIRE_REPLICA_PEER,
  // The creation owner's read of a partition's committed configuration,
  // answered by the node hosting its leader (owner decision O1, committed-
  // read amendment 1, section 3.1).
  READ_COMMITTED_MEMBERSHIP: MESSAGE_TYPE.READ_COMMITTED_MEMBERSHIP,
});

const ReplicaOperationReason = Object.freeze({
  REPLACE_SOURCE_LEADER_HANDOFF: 'replace_source_leader_handoff',
  REPLACE_TARGET_LEADER_ELECTION: 'replace_target_leader_election',
  REPLACE_SOURCE_REMOVAL: 'replace_source_removal',
});

// What delivering a request to the REPLACE witness replica produced: the
// handler's answer, no witness identity to address, or a transport failure
// (whose reason is the error's own message).
const ReplaceWitnessDeliveryOutcome = Object.freeze({
  DELIVERED: 'witness_delivered',
  IDENTITY_UNAVAILABLE: 'witness_identity_unavailable',
  DELIVERY_FAILED: 'witness_delivery_failed',
});

const ReplicaOperationField = Object.freeze({
  TYPE: FIELD.TYPE,
  MEMBERSHIP_PUBLICATION_EPOCH: 'membershipPublicationEpoch',
  OPERATION_ID: FIELD.OPERATION_ID,
  OPERATION_TYPE: FIELD.OPERATION_TYPE,
  PARTITION_ID: FIELD.PARTITION_ID,
  REPLICA_ID: FIELD.REPLICA_ID,
  REPLICA_STATUS: 'replicaStatus',
  REPLICA_IDS: FIELD.REPLICA_IDS,
  PEER_ADDRESSES: FIELD.PEER_ADDRESSES,
  BOOTSTRAP_TABLE_METADATA: FIELD.BOOTSTRAP_TABLE_METADATA,
  BOOTSTRAP_PARTITION_METADATA: FIELD.BOOTSTRAP_PARTITION_METADATA,
  BOOTSTRAP_MEMBERSHIP: FIELD.BOOTSTRAP_MEMBERSHIP,
  SOURCE_NODE_ID: FIELD.SOURCE_NODE_ID,
  ENTITY_TYPE: FIELD.ENTITY_TYPE,
  ENTITY_ID: FIELD.ENTITY_ID,
  REASON: FIELD.REASON,
  SOURCE_REPLICA_ID: 'sourceReplicaId',
  // A REPLACE handoff attempt's sequence, echoed by the handler so a late
  // answer of an earlier attempt is dropped.
  ATTEMPT_SEQ: 'attemptSeq',
  MEMBERSHIP: 'membership',
  PROPOSAL: 'proposal',
});

const ReplicaOperationResponseStatus = Object.freeze({
  INITIATED: 'initiated',
  ALREADY_EXISTS: 'already_exists',
  IN_PROGRESS: 'in_progress',
  NOT_FOUND: 'not_found',
  COMPLETED: 'completed',
  ERROR: 'error',
});

export {
  ReplicaOperationMessageType,
  ReplicaOperationReason,
  ReplaceWitnessDeliveryOutcome,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
};
