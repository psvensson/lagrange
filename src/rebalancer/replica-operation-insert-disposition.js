const REPLICA_OPERATION_INSERT_DISPOSITION = Object.freeze({
  INSERTED: 'inserted',
  EXISTING: 'existing',
  MEMBERSHIP_LANE_CONFLICT: 'membership_lane_conflict',
  TARGET_CLAIM_CONFLICT: 'target_claim_conflict',
  UNKNOWN: 'unknown',
});

export {REPLICA_OPERATION_INSERT_DISPOSITION};
