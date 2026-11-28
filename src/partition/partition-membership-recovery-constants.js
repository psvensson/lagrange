// Constants and schema definitions for group-bound permanent member loss
// recovery intents, generation bindings, and excluded-source fences.

const PARTITION_MEMBERSHIP_RECOVERY_TYPE = 'PARTITION_MEMBERSHIP_RECOVERY';
const PARTITION_MEMBERSHIP_RECOVERY_FENCE_NOTICE_TYPE =
  'PARTITION_MEMBERSHIP_RECOVERY_FENCE_NOTICE';
const PARTITION_MEMBERSHIP_RECOVERY_RESULT_FIELD = 'membershipRecoveryResult';

const PARTITION_MEMBERSHIP_RECOVERY_OUTCOME = Object.freeze({
  COMMITTED: 'committed',
  REPLAYED: 'replayed',
  REFUSED: 'refused',
});

const PARTITION_MEMBERSHIP_RECOVERY_STAGE = Object.freeze({
  'INTENT_COMMITTED': 'intent_committed',
  'LEARNER_ADMITTED': 'learner_admitted',
  'TARGET_PROMOTED': 'target_promoted',
  'SOURCE_RETIRED': 'source_retired',
});

const PARTITION_MEMBERSHIP_RECOVERY_ERROR = Object.freeze({
  'ORIGIN': 'membership_recovery_origin_refused',
  'BYTES': 'membership_recovery_bytes_invalid',
  'BINDING_ABSENT': 'membership_recovery_binding_absent',
  'BINDING_INVALID': 'membership_recovery_binding_invalid',
  'PARTITION_MISMATCH': 'membership_recovery_partition_mismatch',
  'CONFIGURATION_IN_TRANSITION': 'membership_recovery_configuration_in_transition',
  'CONFIGURATION_STALE': 'membership_recovery_configuration_stale',
  'SOURCE_NOT_VOTER': 'membership_recovery_source_not_voter',
  'SOURCE_GENERATION_MISMATCH': 'membership_recovery_source_generation_mismatch',
  'TARGET_INVALID': 'membership_recovery_target_invalid',
  'TARGET_CATCHUP_INCOMPLETE': 'membership_recovery_target_catchup_incomplete',
  'INTENT_CONFLICT': 'membership_recovery_intent_conflict',
  'RETIRED_MEMBER_FENCED': 'membership_recovery_retired_member_fenced',
});

const PARTITION_MEMBERSHIP_RECOVERY_DEFAULT = Object.freeze({
  FENCE_DECISION_ID: 'retired-fence',
  EMPTY_STRING: '',
  BOOT_INCARNATION: 1,
  CREATED_AT: 1,
  GENERATION_INDEX: 0,
  DELIVERY_PRIORITY_CRITICAL: 'critical',
  LOCAL_CORRELATION_ID: 'local-recovery',
  MATERIALIZE_FAILED_MSG: 'Failed to materialize recovery learner',
  DECISION_DIGEST_SLICE_LEN: 32,
  DECISION_ID_SLICE_LEN: 16,
  MIN_MATERIALIZE_BUDGET_MS: 1000,
  MIN_OBSERVE_BUDGET_MS: 500,
  POLL_INTERVAL_MS: 25,
});

const PARTITION_MEMBERSHIP_RECOVERY_SQL = Object.freeze({
  CREATE_RECOVERY_TABLE: `
    CREATE TABLE IF NOT EXISTS _partition_membership_recovery (
      decision_id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL UNIQUE,
      partition_id TEXT NOT NULL,
      configuration_key TEXT NOT NULL,
      membership_generation_index INTEGER NOT NULL,
      source_peer_id TEXT NOT NULL,
      source_replica_id TEXT NOT NULL,
      source_replica_created_at INTEGER NOT NULL,
      source_node_id TEXT NOT NULL,
      source_node_boot_incarnation INTEGER NOT NULL,
      target_peer_id TEXT NOT NULL,
      target_replica_id TEXT NOT NULL,
      target_replica_created_at INTEGER NOT NULL,
      target_node_id TEXT NOT NULL,
      target_node_boot_incarnation INTEGER NOT NULL,
      intent_log_index INTEGER NOT NULL,
      intent_term INTEGER NOT NULL
    )
  `,
  CREATE_BINDINGS_TABLE: `
    CREATE TABLE IF NOT EXISTS _partition_membership_bindings (
      replica_id TEXT PRIMARY KEY,
      peer_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      node_boot_incarnation INTEGER NOT NULL,
      replica_created_at INTEGER NOT NULL
    )
  `,
  CREATE_LOCAL_FENCE_TABLE: `
    CREATE TABLE IF NOT EXISTS _partition_membership_local_fence (
      replica_id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL,
      partition_id TEXT NOT NULL,
      source_peer_id TEXT NOT NULL,
      source_node_id TEXT NOT NULL,
      source_node_boot_incarnation INTEGER NOT NULL,
      source_replica_created_at INTEGER NOT NULL,
      configuration_key TEXT NOT NULL,
      membership_generation_index INTEGER NOT NULL
    )
  `,
  SELECT_BY_DECISION_ID:
    'SELECT * FROM _partition_membership_recovery WHERE decision_id = ?',
  SELECT_BY_ENTRY_ID:
    'SELECT * FROM _partition_membership_recovery WHERE entry_id = ?',
  SELECT_BY_SOURCE_REPLICA_ID:
    'SELECT * FROM _partition_membership_recovery WHERE source_replica_id = ? ' +
    'ORDER BY intent_log_index DESC LIMIT 1',
  SELECT_BY_SOURCE_PEER_ID:
    'SELECT * FROM _partition_membership_recovery WHERE source_peer_id = ? ' +
    'ORDER BY intent_log_index DESC LIMIT 1',
  SELECT_ALL_RECOVERIES:
    'SELECT * FROM _partition_membership_recovery ORDER BY intent_log_index ASC',
  INSERT_RECOVERY: `
    INSERT INTO _partition_membership_recovery (
      decision_id,
      entry_id,
      partition_id,
      configuration_key,
      membership_generation_index,
      source_peer_id,
      source_replica_id,
      source_replica_created_at,
      source_node_id,
      source_node_boot_incarnation,
      target_peer_id,
      target_replica_id,
      target_replica_created_at,
      target_node_id,
      target_node_boot_incarnation,
      intent_log_index,
      intent_term
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  UPSERT_BINDING: `
    INSERT INTO _partition_membership_bindings (
      replica_id,
      peer_id,
      node_id,
      node_boot_incarnation,
      replica_created_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(replica_id) DO UPDATE SET
      peer_id = excluded.peer_id,
      node_id = excluded.node_id,
      node_boot_incarnation = excluded.node_boot_incarnation,
      replica_created_at = excluded.replica_created_at
  `,
  SELECT_BINDING:
    'SELECT * FROM _partition_membership_bindings WHERE replica_id = ?',
  UPSERT_LOCAL_FENCE: `
    INSERT INTO _partition_membership_local_fence (
      replica_id,
      decision_id,
      partition_id,
      source_peer_id,
      source_node_id,
      source_node_boot_incarnation,
      source_replica_created_at,
      configuration_key,
      membership_generation_index
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(replica_id) DO UPDATE SET
      decision_id = excluded.decision_id,
      partition_id = excluded.partition_id,
      source_peer_id = excluded.source_peer_id,
      source_node_id = excluded.source_node_id,
      source_node_boot_incarnation = excluded.source_node_boot_incarnation,
      source_replica_created_at = excluded.source_replica_created_at,
      configuration_key = excluded.configuration_key,
      membership_generation_index = excluded.membership_generation_index
  `,
  SELECT_LOCAL_FENCE:
    'SELECT * FROM _partition_membership_local_fence WHERE replica_id = ?',
  SELECT_ANY_LOCAL_FENCE:
    'SELECT replica_id FROM _partition_membership_local_fence LIMIT 1',
});

export {
  PARTITION_MEMBERSHIP_RECOVERY_DEFAULT,
  PARTITION_MEMBERSHIP_RECOVERY_ERROR,
  PARTITION_MEMBERSHIP_RECOVERY_FENCE_NOTICE_TYPE,
  PARTITION_MEMBERSHIP_RECOVERY_OUTCOME,
  PARTITION_MEMBERSHIP_RECOVERY_RESULT_FIELD,
  PARTITION_MEMBERSHIP_RECOVERY_SQL,
  PARTITION_MEMBERSHIP_RECOVERY_STAGE,
  PARTITION_MEMBERSHIP_RECOVERY_TYPE,
};
