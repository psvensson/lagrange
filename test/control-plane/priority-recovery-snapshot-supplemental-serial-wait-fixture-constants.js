export const STALE_SOURCE_SERIAL_WAIT_TEST_NAME =
    'tracked priority recovery decision snapshots ignore stale serial-wait ' +
    'sources once a partition publishes newer terminal progress';
export const STALE_SOURCE_SERIAL_WAIT_MESSAGE =
    'serial-wait normalization should not use stale source-partition ' +
    'operation contexts once newer terminal progress exists';
export const STALE_SOURCE_SERIAL_WAIT_PROGRESS_MESSAGE =
    'when stale serial-wait source evidence is ignored, the blocked ' +
    'partition should return to explicit scheduling ownership';
export const STALE_SOURCE_SERIAL_WAIT_CREATE_OPERATION_ID =
    'op-stale-source-creating';
export const STALE_SOURCE_SERIAL_WAIT_RELEASE_OPERATION_ID =
    'op-newer-source-removed';
export const STALE_SOURCE_SERIAL_WAIT_CREATE_CAPTURED_AT_MS = 5100;
export const STALE_SOURCE_SERIAL_WAIT_CREATE_PROGRESS_AT_MS = 5000;
export const STALE_SOURCE_SERIAL_WAIT_RELEASE_CAPTURED_AT_MS = 7100;
export const STALE_SOURCE_SERIAL_WAIT_RELEASE_PROGRESS_AT_MS = 7000;
export const STALE_SOURCE_SERIAL_WAIT_TARGET_CAPTURED_AT_MS = 7200;
export const STALE_SOURCE_SERIAL_WAIT_REASON_UNSATISFIED = 'unsatisfied';
export const STALE_SOURCE_SERIAL_WAIT_WORKFLOW_SOURCE_SYSTEM_TABLE_CACHE =
    'system_table_cache';
export const STALE_SOURCE_SERIAL_WAIT_SEMANTIC_SOURCE_SNAPSHOT =
    'priority_recovery_snapshot';
export const STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_BLOCKER_REASONS =
    'blocker_reasons';
export const STALE_SOURCE_SERIAL_WAIT_PROGRESS_EVIDENCE_COMPLETION_STATE =
    'completion_state';
export const STALE_SOURCE_SERIAL_WAIT_REASON_PRIORITY_SPREAD_GAP =
    'priority_spread_gap';
export const STALE_SOURCE_SERIAL_WAIT_PARTICIPANTS_TABLE_NAME =
    'sql_transaction_participants';
export const STALE_SOURCE_SERIAL_WAIT_TERMINAL_PHASE_ID = 'terminal';
export const MIXED_SUMMARY_SERIAL_WAIT_TEST_NAME =
    'tracked priority recovery decision snapshots keep serial-wait source ' +
    'context when the latest summary row is keyed by a newer removed ' +
    'operation';
export const MIXED_SUMMARY_SERIAL_WAIT_MESSAGE =
    'serial-wait normalization should preserve the live workflow-owned ' +
    'operation when a newer removed row still shares the same partition ' +
    'summary';
export const MIXED_SUMMARY_SERIAL_WAIT_PROGRESS_MESSAGE =
    'the blocked partition should stay on workflow-progress wait when the ' +
    'only eligible target is already occupied by another partition\'s live ' +
    'priority recovery operation';
export const MIXED_SUMMARY_SERIAL_WAIT_PENDING_OPERATION_ID =
    'op-source-pending';
export const MIXED_SUMMARY_SERIAL_WAIT_REMOVED_OPERATION_ID =
    'op-source-removed';
export const MIXED_SUMMARY_SERIAL_WAIT_SOURCE_CAPTURED_AT_MS = 8300;
export const MIXED_SUMMARY_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS = 8200;
export const MIXED_SUMMARY_SERIAL_WAIT_REMOVED_COMPLETED_AT_MS = 8100;
export const MIXED_SUMMARY_SERIAL_WAIT_TARGET_CAPTURED_AT_MS = 8400;
export const MIXED_SUMMARY_SERIAL_WAIT_SOURCE_TABLE_NAME = 'sql_transactions';
export const MIXED_SUMMARY_SERIAL_WAIT_REASON_UNSATISFIED = 'unsatisfied';
export const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TEST_NAME =
    'tracked priority recovery decision snapshots ignore mixed-summary ' +
    'serial-wait sources when the sibling live operation already ' +
    'satisfies spread';
export const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_MESSAGE =
    'mixed-summary serial-wait normalization should prefer the live ' +
    'sibling operation context when the latest workflow-owned operation ' +
    'already satisfies spread on an eligible target';
export const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_PROGRESS_MESSAGE =
    'when the live sibling operation already satisfies spread, the ' +
    'blocked partition should return to explicit scheduling ownership';
export const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TARGET_CAPTURED_AT_MS =
    8500;
export const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_SOURCE_TABLE_NAME =
    'sql_transaction_participants';
export const MIXED_SUMMARY_SPREAD_SATISFIED_SERIAL_WAIT_TARGET_VISIBILITY_ABSENT =
    'absent';
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TEST_NAME =
    'tracked priority recovery decision snapshots ignore serial-wait ' +
    'sources already subordinated to a spread-satisfied sibling';
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_MESSAGE =
    'serial-wait normalization should not restore workflow-owned wait ' +
    'when a separate sibling already satisfies spread while pointing at ' +
    'the same source partition';
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PROGRESS_MESSAGE =
    'once the spread-satisfied sibling already covers the source ' +
    'partition, the blocked partition should stay on explicit scheduling ' +
    'ownership';
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_OPERATION_ID =
    'op-participants';
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_OPERATION_ID =
    'op-transactions';
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_CAPTURED_AT_MS = 8500;
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PARTICIPANTS_PROGRESS_AT_MS =
    8400;
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_TRANSACTIONS_PROGRESS_AT_MS =
    8450;
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_STEP_AGE_MS = 100;
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_PENDING_TIMEOUT_MS = 30000;
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_NUMERIC = null;
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_ABSENT_BOOLEAN = null;
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_UNSATISFIED =
    'unsatisfied';
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_ACTIVE_BLOCKS_SPREAD =
    'active_operation_still_blocks_spread';
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_REPLACE_REMOVE_DISPATCH =
    'replace_remove_dispatch_phase_on_eligible_target';
export const SPREAD_SATISFIED_SIBLING_SERIAL_WAIT_REASON_PRIORITY_PARTITION_MISSING =
    'priority_partition_missing';
export const RETAINED_CARRIER_SERIAL_WAIT_RELEASE_TEST_NAME =
    'tracked priority recovery decision snapshots release stale serial-wait ' +
    'blockers once the only source collapses to a spread-satisfied carrier';
export const RETAINED_CARRIER_SERIAL_WAIT_RELEASE_MESSAGE =
    'stale serial-wait blockers should clear once their only remaining ' +
    'source is a spread-satisfied retained carrier';
export const RETAINED_CARRIER_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE =
    'when no live serial-wait source remains, the blocked partition ' +
    'should return to explicit scheduling ownership';
export const RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_TEST_NAME =
    'tracked priority recovery decision snapshots preserve live serial-wait ' +
    'sources behind retained carriers';
export const RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_MESSAGE =
    'a blocked partition should retain workflow-owned serial-wait evidence ' +
    'when its live source operation still exists even if another converged ' +
    'carrier also points at that source';
export const RETAINED_CARRIER_SERIAL_WAIT_PRESERVE_PROGRESS_MESSAGE =
    'observation witnesses should stay on workflow-progress wait while the ' +
    'live serial-wait source remains in flight';
export const RETAINED_CARRIER_SERIAL_WAIT_SOURCE_OPERATION_ID =
    'op-retained-carrier-source-pending';
export const RETAINED_CARRIER_SERIAL_WAIT_CARRIER_OPERATION_ID =
    'op-retained-carrier-live';
export const RETAINED_CARRIER_SERIAL_WAIT_REMOVED_CARRIER_OPERATION_ID =
    'op-retained-carrier-removed';
export const RETAINED_CARRIER_SERIAL_WAIT_TARGET_CAPTURED_AT_MS = 1000;
export const RETAINED_CARRIER_SERIAL_WAIT_SOURCE_PROGRESS_AT_MS = 900;
export const RETAINED_CARRIER_SERIAL_WAIT_CARRIER_PROGRESS_AT_MS = 950;
export const RETAINED_CARRIER_SERIAL_WAIT_SOURCE_TABLE_NAME =
    'sql_transaction_participants';
export const RETAINED_CARRIER_SERIAL_WAIT_CARRIER_TABLE_NAME =
    'sql_write_operations';
