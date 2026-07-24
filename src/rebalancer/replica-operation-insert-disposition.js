const REPLICA_OPERATION_INSERT_DISPOSITION = Object.freeze({
  INSERTED: 'inserted',
  EXISTING: 'existing',
  TARGET_CLAIM_CONFLICT: 'target_claim_conflict',
  UNKNOWN: 'unknown',
});

export {REPLICA_OPERATION_INSERT_DISPOSITION};
