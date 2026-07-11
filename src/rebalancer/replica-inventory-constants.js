export const REPLICA_INVENTORY_EFFECTIVE_VIEW = Object.freeze({
  SETTLED_VOTER_TARGET: 'settled_voter_target',
  DEFICIT_FILL: 'deficit_fill',
  PEAK_CREATION: 'peak_creation',
});

export const REPLICA_INVENTORY_OBSERVATION_STATE = Object.freeze({
  PRESENT: 'present',
  EMPTY: 'empty',
  DEFERRED: 'deferred',
  BOUNDED_USABLE: 'bounded_usable',
  OWNER_ADJUDICATED_EMPTY: 'owner_adjudicated_empty',
  UNAVAILABLE: 'unavailable',
});

export const REPLICA_INVENTORY_ANOMALY_CODE = Object.freeze({
  REPLICA_IDENTITY_UNAVAILABLE: 'replica_identity_unavailable',
  DUPLICATE_REPLICA_IDENTITY_CONFLICT:
    'duplicate_replica_identity_conflict',
  DUPLICATE_OPERATION_IDENTITY_CONFLICT:
    'duplicate_operation_identity_conflict',
  REPLACE_SOURCE_IDENTITY_UNAVAILABLE:
    'replace_source_identity_unavailable',
});

export const REPLICA_INVENTORY_CONSISTENCY = Object.freeze({
  SOURCE_CHANGED_DURING_CAPTURE: 'source_changed_during_capture',
  SOURCE_UNAVAILABLE: 'source_unavailable',
  OBSERVATION_SKEW_EXCEEDED: 'observation_skew_exceeded',
  REVISION_UNAVAILABLE: 'revision_unavailable',
  BOUNDED_OBSERVATION_SKEW: 'bounded_observation_skew',
});

export const REPLICA_INVENTORY_PROVENANCE = Object.freeze({
  ATOMICITY_NOT_CLAIMED: 'not_claimed',
  CLASSIFICATION_AVAILABLE: 'available',
  CLASSIFICATION_UNAVAILABLE: 'unavailable',
  UNKNOWN_ENTITY: 'unknown',
});
