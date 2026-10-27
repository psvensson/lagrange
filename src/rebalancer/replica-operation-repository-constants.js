const REPLICA_OPERATION_REPOSITORY_ERROR_MSG = Object.freeze({
  TERMINAL_FAILED_CREATE_CLEANUP_RECOVERY_READ_UNAVAILABLE:
    'Terminal failed-create cleanup recovery read unavailable',
});

const REPLICA_OPERATION_INSERT_SQL = `INSERT INTO replica_operations (
  operation_id, type, partition_id, replica_id, target_claim_key, source_node_id,
  target_node_id, status, workflow_step, created_at, updated_at,
  completed_at, error_message, steps_history,
  entity_type, entity_id, membership_publication_epoch,
  source_replica_id, message_group_membership_lane_key,
  message_group_membership_phase, message_group_membership_obligation_state,
  message_group_membership_identity, message_group_learner_stamp,
  message_group_voter_stamp, message_group_removal_stamp,
  message_group_source_lifecycle_claim,
  create_admission_state, create_admission_token,
  create_admission_replica_created_at, create_admission_attempt_token,
  create_admission_previous_attempt_token, create_admission_attempt_seq,
  create_admission_workflow_updated_at, create_admission_owner_incarnation
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?)`;

export {
  REPLICA_OPERATION_INSERT_SQL,
  REPLICA_OPERATION_REPOSITORY_ERROR_MSG,
};
