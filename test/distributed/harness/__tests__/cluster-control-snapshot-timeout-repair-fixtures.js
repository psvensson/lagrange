/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */

export {test} from '../../../../src/test-helpers/tap.js';
export {default as assert} from 'node:assert';
export {ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE} from
  '../../../../src/admin/admin-constants.js';
export {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../../../src/control-plane/control-plane-publication-merge.js';
export {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../../../src/control-plane/control-plane-snapshot-owner.js';
export {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../../../src/control-plane/owner-contract-outcome.js';
export {SERVICE_STATUS} from '../../../../src/constants/index.js';
export {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

export const SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE = 5;
export const SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS = 5000;
export const SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS = 1777976837236;
export const SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS = 1777976838250;
export const SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH = 2;
export const SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH = 3;
export const SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
export const SNAPSHOT_REPLAY_TEST_IMAGE = 'distributed-db:test';
export const SNAPSHOT_REPLAY_TEST_EMPTY_LOG = '';
export const SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
export const SNAPSHOT_REPLAY_TEST_ADMIN_WS_SOURCE = 'admin_ws';
export const SNAPSHOT_REPLAY_TEST_CONTROL_SNAPSHOT_SOURCE = 'control_snapshot';
export const SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE =
  'discovery_node_coverage_gap';
export const SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS = 250;
export const SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING = 'pending';
export const SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
export const SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
export const SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
export const SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE = false;
export const SNAPSHOT_REPLAY_TEST_HANDOFF_PENDING_RECOVERY_COUNT = 1;
export const SNAPSHOT_REPLAY_TEST_HANDOFF_PENDING_RECONCILE_COUNT = 0;
export const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED =
  'write_deferred';
export const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK =
  'durable_readback_pending';
export const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED = true;
export const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS = 1000;
export const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED_FALSE = false;
export const SNAPSHOT_REPLAY_TEST_OWNER_QUEUE_PENDING_WRITES = 1;
export const SNAPSHOT_REPLAY_TEST_AUTHORITY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage keeps admin-ready authority over ' +
  'stronger publication when 102455Z coverage ties';
export const SNAPSHOT_REPLAY_TEST_DEFERRED_AUTHORITY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage exposes deferred owner observation ' +
  'for admin-ready stale 102455Z witness';
export const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage replays pending handoff reconcile ' +
  'after selected timeout reduction';
export const SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_PROJECTION_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage projects published active membership ' +
  'into startup snapshot coverage under publication lag';
export const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_PROJECTION_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage projects the remaining pending ' +
  'owner-reconcile node into startup snapshot coverage';
export const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_PROJECTION_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage projects paired pending ' +
  'owner-reconcile nodes into startup snapshot coverage';
export const SNAPSHOT_REPLAY_TEST_AUTHORITY_ASSERTION =
  'same-coverage active-gate selection should keep the admin-ready authority ' +
  'witness';
export const SNAPSHOT_REPLAY_TEST_NODE_ID = Object.freeze({
  SEED: '7493b0ab-a054-5fad-a91b-5e331db29304',
  BASELINE: '11601fe0-72d6-5853-8590-ec2881853e72',
  ADMIN_READY_STALE: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  STRONG_EXTRA: '8be8d30f-4499-5eed-865c-71b4d529a67a',
  STALE_EXTRA: 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
});
export const SNAPSHOT_REPLAY_TEST_SEED_REACHABILITY_ERROR =
  'Control snapshot reachability probe timed out for ' +
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
export const SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const SNAPSHOT_REPLAY_TEST_STRONG_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
export const SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
export const SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
export const SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
export const SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
export const SNAPSHOT_REPLAY_TEST_STRONG_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
export const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_PROJECTED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_OBSERVED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  ]);
export const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
export const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_PROJECTED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  ]);
export const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_OBSERVED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
  ]);
export const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
export const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_PROJECTED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
  ]);
export const SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
export const SNAPSHOT_REACHABILITY_TIMEOUT_ERROR =
  'Control snapshot reachability probe timed out for ' +
  SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID;
export const SNAPSHOT_REACHABILITY_TIMEOUT_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const SNAPSHOT_REACHABILITY_TIMEOUT_PUBLISHED_NODE_IDS =
  SNAPSHOT_REACHABILITY_TIMEOUT_OBSERVED_NODE_IDS;
export const SNAPSHOT_REACHABILITY_TIMEOUT_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
export const SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE;
export const SNAPSHOT_REPAIR_TIMEOUT_QUERY_TIMEOUT_MS = 3349;
export const SNAPSHOT_REPAIR_TIMEOUT_AUTHORITATIVE_QUERY_TIMEOUT_MS = 1500;
export const SNAPSHOT_REPAIR_TIMEOUT_CAPTURED_NOW_MS = 1777976841000;
export const SNAPSHOT_REPAIR_TIMEOUT_SELECTED_ERROR =
  'Admin API query timed out for node ' +
  SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID +
  ' on lane snapshot after ' +
  SNAPSHOT_REPAIR_TIMEOUT_QUERY_TIMEOUT_MS +
  'ms; forced repair snapshot failed: Admin API query failed for node ' +
  SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID +
  ' on lane snapshot: Authoritative control snapshot repair failed: ' +
  'nodes:Query timeout after ' +
  SNAPSHOT_REPAIR_TIMEOUT_AUTHORITATIVE_QUERY_TIMEOUT_MS +
  'ms';
export const SNAPSHOT_REPAIR_TIMEOUT_UNSELECTED_ERROR_PREFIX =
  'snapshot lane unavailable for ';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage prefers a query-success witness over ' +
  'selected 11601fe0 snapshot timeout when coverage ties';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage resets snapshot lane after selected ' +
  'source timeout';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_EXHAUSTED_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage records deferred retry evidence ' +
  'after selected source retry timeout';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LATE_RETRY_FLOOR_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage preserves late selected-source ' +
  'retry floor after timeout';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage reserves owner-recovery budget for ' +
  'load selected source retry';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_EXHAUSTED_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage records load owner-recovery retry ' +
  'after selected source timeout';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_HANDOFF_RETURN_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage probes remaining witnesses after ' +
  'synthetic load owner-recovery handoff';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_AGGREGATED_HANDOFF_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage aggregates bounded load ' +
  'owner-recovery handoff witnesses';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_REACHABILITY_PREFILTER_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage prefilters load snapshot probes by ' +
  'admin reachability';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_REMAINING_WITNESS_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage bounds load remaining snapshot ' +
  'witness probes after selected-source timeout';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_EXPIRED_REMAINING_WITNESS_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage reserves load remaining witnesses ' +
  'after selected retry exhausts the attempt deadline';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage preserves an alternative query-success ' +
  'witness when selected source times out with higher coverage';
export const SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_HANDOFF_FIXTURE_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage replays selected-source websocket ' +
  'closure evidence with an alternative witness available';
export const SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_HANDOFF_FIXTURE_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage replays selected-source admin ' +
  'connection closure evidence with an alternative witness available';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_THEN_ADMIN_CLOSED_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage reports terminal retry admin ' +
  'transport closure while preserving wait-owner handoff';
export const SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_FALLBACK_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage keeps forced repair probes local-first ' +
  'for the selected source';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
export const SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_QUERY_TIMEOUT_MS = 3000;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_TIMEOUT_MS = 5000;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_DRIFT_MS = 1;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_MIN_MS =
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_TIMEOUT_MS -
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_DRIFT_MS;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS = 2500;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_INITIAL_TIMEOUT_MS = 5000;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_WIDE_DEADLINE_EXTENSION_MS =
  30000;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_WIDE_INITIAL_TIMEOUT_MS =
  15000;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS = 2500;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REMAINING_WITNESS_DELAY_MS = 0;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID +
  ' on lane snapshot after ' +
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_QUERY_TIMEOUT_MS +
  'ms';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_ERROR =
  'Admin API query timed out for node ' +
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID +
  ' on lane snapshot after ' +
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_QUERY_TIMEOUT_MS +
  'ms';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_PREFIX =
  'Admin API query timed out for node ';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_MIDDLE =
  ' on lane snapshot after ';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_SUFFIX = 'ms';
export const SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
export const SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ERROR =
  'Admin API query failed for node ' +
  SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_SELECTED_NODE_ID +
  ' on lane snapshot: WebSocket was closed before the connection was established';
export const SELECTED_SNAPSHOT_SOURCE_TRANSPORT_CLOSED_OBSERVATION_REASON =
  'selected_transport_closed';
export const SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
export const SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_ERROR =
  'Admin API query connection closed before response for node ' +
  SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_SELECTED_NODE_ID +
  ' on lane snapshot';
export const SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
export const SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_THEN_ADMIN_CLOSED_NODE_IDS =
  SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_NODE_IDS;
export const SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ALTERNATIVE_ERROR =
  'snapshot lane unavailable for ' + SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
export const SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_ALTERNATIVE_ERROR =
  SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ALTERNATIVE_ERROR;
export const SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID +
  ' on lane snapshot after ' +
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_QUERY_TIMEOUT_MS +
  'ms';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_EMPTY_NODE_IDS = Object.freeze([]);
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_HIGHER_COVERAGE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  ]);
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
export const SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS = 1777976842823;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_CAPTURED_AT_MS =
  1777976842999;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_CAPTURED_AT_MS = 1777976843125;
export const SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_CAPTURED_AT_MS = 1777976843340;
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX =
  'snapshot lane unavailable for ';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE = 'snapshot';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_MODE = 'load';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_REASON = 'selected_timeout';
export const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_AFTER_TOLERANCE_MS = 1;
export const ACTIVE_GATE_REACHABILITY_DELAY_TEST_NAME =
  'Unit: _waitForAllActive keeps terminal reachability delay from selected progress';
export const ACTIVE_GATE_REACHABILITY_DELAY_CLUSTER_SIZE = 5;
export const ACTIVE_GATE_REACHABILITY_DELAY_CONVERGENCE_MS = 30;
export const ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS = Object.freeze([
  'seed-1',
  'joiner-1',
  'joiner-2',
  'joiner-3',
  'joiner-4',
]);
export const ACTIVE_GATE_REACHABILITY_DELAY_ERROR =
  'Control snapshot reachability probe timed out for seed-1';
export const ACTIVE_GATE_REACHABILITY_DELAY_CAUSE =
  'snapshot_reachability_timeout';
export const ACTIVE_GATE_REACHABILITY_DELAY_PUBLICATION_STATUS = 'PUBLISHED';
export const ACTIVE_GATE_REACHABILITY_DELAY_RECOVERY_PROTOCOL_STATE =
  'priority_spread_pending';
export const ACTIVE_GATE_REACHABILITY_DELAY_ZERO = 0;
export const ACTIVE_GATE_REACHABILITY_DELAY_ONE = 1;
export const ACTIVE_GATE_REACHABILITY_DELAY_ACTIVE_COUNT = 2;
export const ACTIVE_GATE_REACHABILITY_DELAY_INACTIVE_COUNT = 3;
export const ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT = 3;
export const ACTIVE_GATE_REACHABILITY_DELAY_BLOCKED_PARTITION_COUNT = 5;
export const ACTIVE_GATE_REACHABILITY_DELAY_TOTAL_SPREAD_GAP = 10;
export const ACTIVE_GATE_REACHABILITY_DELAY_SLEEP_MS = 10;
export const ACTIVE_GATE_REACHABILITY_DELAY_STATE_ACTIVE = 'active';
export const ACTIVE_GATE_REACHABILITY_DELAY_STATE_INACTIVE = 'inactive';
export const ACTIVE_GATE_REACHABILITY_DELAY_STRING_TYPE = 'string';
export const ACTIVE_GATE_REACHABILITY_DELAY_TIMEOUT_MESSAGE =
  'Not all nodes reached ACTIVE state within';
export const ACTIVE_GATE_REACHABILITY_DELAY_ASSERTION =
  'startup timeout should keep the selected reachability delay evidence';
export const ACTIVE_GATE_PARTIAL_RESIDUAL_TEST_NAME =
  'Unit: _probeClusterActiveState classifies contact-seed partial startup coverage';
export const ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS = 5000;
export const ACTIVE_GATE_PARTIAL_RESIDUAL_READY_STATUS = 200;
export const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_STATUS = 503;
export const ACTIVE_GATE_PARTIAL_RESIDUAL_READY_PHASE = 'JOIN_READY';
export const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_PHASE = 'CONTROL_READY';
export const ACTIVE_GATE_PARTIAL_RESIDUAL_ACTIVE_STATE = 'active';
export const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_STATE = 'warming';
export const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_REASON =
  'BOOTSTRAP_NOT_READY';
export const ACTIVE_GATE_PARTIAL_RESIDUAL_PUBLICATION_EPOCH = 3;
export const ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_COVERAGE = 3;
export const ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_ACTIVE = 3;
export const ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_INACTIVE = 2;
export const ACTIVE_GATE_PARTIAL_RESIDUAL_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
export const ACTIVE_GATE_PARTIAL_RESIDUAL_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
export const ACTIVE_GATE_PARTIAL_RESIDUAL_MISSING_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const ACTIVE_GATE_PARTIAL_RESIDUAL_PUBLISHED_ACTIVE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
export const ACTIVE_GATE_PARTIAL_RESIDUAL_READY_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
export const ACTIVE_GATE_PARTIAL_RESIDUAL_INACTIVE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const ACTIVE_GATE_PARTIAL_RESIDUAL_SELECTED_CAPTURED_AT_MS =
  SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS;
export const ACTIVE_GATE_PARTIAL_RESIDUAL_STALE_CAPTURED_AT_MS =
  SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS;
export const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STALE_ACK_TEST_NAME =
  'Unit: _probeClusterActiveState resolves stale selected ACK covered by ' +
  'startup owner-reconcile handoff';
export const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STALE_ACK_GUARDRAIL_TEST_NAME =
  'Unit: _probeClusterActiveState keeps stale selected ACK blocked without ' +
  'startup owner-reconcile handoff';
export const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATUS = 200;
export const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PHASE = 'JOIN_READY';
export const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATE = 'active';
export const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_COVERAGE_COUNT = 3;
export const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_OBSERVED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
  ]);
export const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PUBLISHED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  ]);
export const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_MISSING_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  ]);
export const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_ACK_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  ]);
export const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_RECONCILE_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  ]);
export const ACTIVE_GATE_NO_PROGRESS_BEST_SNAPSHOT_TEST_NAME =
  'Unit: _waitForAllActive keeps metric-moving snapshot when terminal probe ' +
  'regresses to selected timeout';
export const ACTIVE_GATE_NO_PROGRESS_BEST_COVERAGE_TEST_NAME =
  'Unit: _waitForAllActive keeps best snapshot coverage when active count ' +
  'later regresses to selected timeout';
export const ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS = 200;
export const ACTIVE_GATE_NO_PROGRESS_MAX_ATTEMPTS = 2;
export const ACTIVE_GATE_NO_PROGRESS_EXPECTED_NODE_COUNT = 5;
export const ACTIVE_GATE_NO_PROGRESS_COVERAGE_NODE_COUNT = 2;
export const ACTIVE_GATE_NO_PROGRESS_BEST_COVERAGE_NODE_COUNT = 4;
export const ACTIVE_GATE_NO_PROGRESS_ZERO_COVERAGE = 0;
export const ACTIVE_GATE_NO_PROGRESS_PUBLICATION_EPOCH = 1;
export const ACTIVE_GATE_NO_PROGRESS_WAITING_STAGE = 'setup.cluster.waiting-active';
export const ACTIVE_GATE_NO_PROGRESS_PENDING_REASON =
  'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING';
export const ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE;
export const ACTIVE_GATE_NO_PROGRESS_RETRY_AFTER_MS = 25300;
export const ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS_PER_QUERY = 3000;
export const ACTIVE_GATE_NO_PROGRESS_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID +
  ' on lane snapshot after ' +
  ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS_PER_QUERY +
  'ms';
export const ACTIVE_GATE_NO_PROGRESS_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
export const ACTIVE_GATE_NO_PROGRESS_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
export const ACTIVE_GATE_NO_PROGRESS_REASONS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE,
]);
export const ACTIVE_GATE_NO_PROGRESS_TERMINAL_GATE_REASONS = Object.freeze([
  'publication_convergence_missing',
  'publication_missing_active_node=' + SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
export const LOAD_READINESS_NO_PROGRESS_BEST_SNAPSHOT_TEST_NAME =
  'Unit: waitForLoadReadinessStability keeps metric-moving snapshot when ' +
  'terminal probe regresses to selected timeout';
export const LOAD_READINESS_NO_PROGRESS_STABLE_WINDOW_MS = 1000;
export const LOAD_READINESS_NO_PROGRESS_TIMEOUT_MS = 200;
export const LOAD_READINESS_NO_PROGRESS_PHASE = 'pre_load';
export const LOAD_READINESS_NO_PROGRESS_STAGE = 'scenario.load-readiness.waiting';
export const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage preserves a meaningful timeout floor ' +
  'for late active-wait probes';
export const SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage keeps snapshot-lane failures explicit';
export const SNAPSHOT_REPLAY_TEST_FORCED_REPAIR_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage keeps forced repair probes on the ' +
  'local-first snapshot path';
export const SNAPSHOT_REPLAY_TEST_ADMIN_ONLY_FAST_PATH_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage uses the admin-only reachability fast path';
export const SNAPSHOT_REPLAY_TEST_SINGLE_NODE_CLUSTER_SIZE = 1;
export const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_CLUSTER_SIZE = 2;
export const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_DEADLINE_EXTENSION_MS = 1;
export const SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX = 0;
export const SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX = 1;
export const SNAPSHOT_REPLAY_TEST_SINGLE_CALL_COUNT = 1;
export const SNAPSHOT_REPLAY_TEST_NO_PROBE_CALLS = 0;
export const SNAPSHOT_REPLAY_TEST_INITIAL_PROBE_CALL_COUNT = 1;
export const SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT = 2;
export const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS = 100;
export const SNAPSHOT_REPLAY_TEST_FAST_PATH_TIMEOUT_BUFFER_MS = 50;
export const SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_CAPTURED_AT_MS = 456;
export const SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_CAPTURED_AT_MS = 789;
export const SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_DEADLINE_EXTENSION_MS = 1000;
export const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A = 'node-a';
export const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_B = 'node-b';
export const SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_NODE_ID = 'node-fast-path';
export const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A,
  SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_B,
]);
export const SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_ERROR =
  'snapshot lane timed out';
export const SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_PATTERN =
  /snapshot lane timed out/u;
export const SNAPSHOT_REPLAY_TEST_REACHABILITY_ERROR_PREFIX =
  'Control snapshot reachability probe timed out for ';
export const SNAPSHOT_TIMEOUT_REPAIR_ASSERTION = Object.freeze({
  LATE_PROBES_INSPECT_REMAINING:
    'late coverage probes should still inspect the remaining nodes when the first witness is partial',
  SNAPSHOT_TIMEOUT_FLOOR:
    'snapshot coverage probes should preserve a meaningful timeout floor instead of collapsing to 1ms near the deadline',
  REACHABILITY_TIMEOUT_FLOOR:
    'reachability probes should preserve the same meaningful timeout floor for late coverage attempts',
  SELECTED_SNAPSHOT_TIMEOUT_FLOOR:
    'coverage summary should report the preserved late snapshot timeout floor',
  SELECTED_REACHABILITY_TIMEOUT_FLOOR:
    'coverage summary should report the preserved late reachability timeout floor',
  SNAPSHOT_LANE:
    'coverage probe should stay on the snapshot lane',
  SNAPSHOT_LANE_TIMEOUT:
    'coverage summary should preserve the snapshot-lane timeout',
  SELECTED_REPORT_SHAPE:
    'fixture should preserve the selected report shape at 0/5 coverage',
  SELECTED_SOURCE_BEFORE_REPAIR:
    'fixture should decide selected-source selection before forced repair',
  QUERY_SUCCESS_SELECTION:
    'selection should choose a snapshot-query-success source over the timed-out 11601fe0 source',
  QUERY_SUCCESS_TIMEOUT_CLEAR:
    'query-success selection should remove selected_snapshot_source_timeout as the owner edge',
  NORMAL_SNAPSHOT_SOURCE_PATH:
    'fixture must stay on the normal snapshot-source selection path',
  INHERITED_READINESS_EXCLUDED:
    'fixture should keep inherited readiness support out of the owner decision',
  SELECTED_RETRY_SOURCE:
    'selected timeout retry should preserve the selected admin-ready source',
  SELECTED_RETRY_RECOVERY:
    'selected-source retry should recover after the lane reset in the same attempt',
  SELECTED_LANE_RESET:
    'selected snapshot timeout should reset only the snapshot lane',
  STARTUP_RETRY_COUNT:
    'selected-source startup retry should make one bounded retry after reset',
  STARTUP_RETRY_TIMEOUT_FLOOR:
    'startup selected-source retry should reserve active-gate retry budget',
  STARTUP_RETRY_SCALED_TIMEOUT:
    'startup selected-source retry should not consume the full startup-scaled snapshot timeout',
  STARTUP_RETRY_EXHAUSTED_SOURCE:
    'retry-exhausted evidence should preserve the selected admin-ready source',
  STARTUP_RETRY_EXHAUSTED_ERROR:
    'retry-exhausted evidence should preserve the retry timeout error',
  STARTUP_RETRY_EXHAUSTED_TIMEOUT:
    'retry-exhausted evidence should report the retry timeout budget',
  STARTUP_RETRY_LATE_TIMEOUT_FLOOR:
    'late selected-source retry should preserve the active-gate retry floor',
  STARTUP_RETRY_EXHAUSTED_OBSERVATION:
    'retry-exhausted evidence should expose deferred owner retry observation',
  STARTUP_RETRY_EXHAUSTED_REASON:
    'retry-exhausted evidence should classify the selected timeout reason',
  STARTUP_RETRY_EXHAUSTED_REPAIR:
    'retry-exhausted evidence should mark selected snapshot repair deferred',
  STARTUP_RETRY_EXHAUSTED_HANDOFF:
    'retry-exhausted evidence should synthesize the active-gate handoff contract',
  STARTUP_RETRY_EXHAUSTED_RECOVERY_PROGRESS:
    'retry-exhausted wait-owner-recovery evidence should move bounded snapshot coverage progress',
  STARTUP_RETRY_EXHAUSTED_OWNER_QUEUE:
    'retry-exhausted wait-owner-recovery evidence should expose bounded owner queue defer',
  RETRY_SNAPSHOT_LANE:
    'selected-source retry proof should stay on the normal snapshot lane',
  LOAD_RETRY_SOURCE:
    'load selected-source retry should preserve the selected admin-ready source',
  LOAD_RETRY_RECOVERY:
    'load selected-source retry should recover after the lane reset',
  LOAD_RETRY_COUNT:
    'load selected-source retry should make one bounded retry after reset',
  LOAD_RETRY_FIRST_TIMEOUT:
    'load selected-source first probe should use the base snapshot timeout',
  LOAD_RETRY_TIMEOUT:
    'load selected-source retry should reserve owner-recovery retry budget',
  LOAD_LANE_RESET:
    'load selected snapshot timeout should reset only the snapshot lane',
  LOAD_HANDOFF_RETURN_PROBE_COUNT:
    'synthetic load owner-recovery handoff should not suppress remaining snapshot probes without real diagnostics',
  LOAD_HANDOFF_RETURN_PUBLISHED:
    'load owner-recovery handoff should preserve the published active coverage witness',
  LOAD_AGGREGATED_HANDOFF_SELECTION:
    'load owner-recovery handoff should retain every bounded pending recovery witness',
  LOAD_AGGREGATED_HANDOFF_QUEUE:
    'load aggregated owner-recovery handoff should expose a bounded owner queue for every witness',
  LOAD_REACHABILITY_PREFILTER_SOURCE:
    'load reachability prefilter should try an admin-ready witness before the non-admin-ready seed',
  LOAD_REACHABILITY_PREFILTER_SEED:
    'load reachability prefilter should not spend snapshot budget on the non-admin-ready seed before admin-ready witnesses',
  LOAD_REACHABILITY_PREFILTER_REQUEST:
    'load reachability prefilter should use the admin-only reachability request',
  LOAD_REMAINING_WITNESS_CONCURRENCY:
    'load remaining snapshot witnesses should be bounded to one in-flight ' +
    'snapshot probe after selected-source timeout',
  LOAD_REMAINING_WITNESS_SELECTION:
    'load bounded remaining witness probing should still select the later ' +
    'query-success witness',
  LOAD_EXPIRED_REMAINING_WITNESS_SELECTION:
    'load selected-source retry should still probe a bounded remaining ' +
    'snapshot witness after the attempt deadline is exhausted',
  LOAD_EXPIRED_REMAINING_WITNESS_TIMEOUT:
    'load expired remaining witness probing should reserve the owner-recovery ' +
    'retry timeout instead of collapsing to the late floor',
  FORCED_REPAIR_SOURCE:
    'forced repair timeout fallback should preserve the selected admin-ready source',
  FORCED_REPAIR_CLEAR:
    'normal selected-source fallback should clear the forced repair timeout',
  FORCED_REPAIR_COVERAGE:
    'normal selected-source fallback should recover authoritative coverage',
  FORCED_REPAIR_CALLS:
    'selected source should submit forced repair intent through local-first snapshot once',
  FORCED_REPAIR_LANE_RESET:
    'local-first forced repair should not reset the selected snapshot lane',
  FORCED_REPAIR_PATH:
    'fixture should replay the local-first forced repair snapshot probe path',
  FORCED_REPAIR_METRIC:
    'local-first repair should move the snapshot coverage metric',
  FORCED_REPAIR_SELECTED_SOURCE:
    'fixture should keep the handoff-selected 11601fe0... source',
  FORCED_REPAIR_TIMEOUT_BUDGET:
    'fixture should preserve the late probe timeout budget',
  FORCED_REPAIR_TIMEOUT_CHAIN:
    'local-first repair coverage should replace the selected timeout chain',
  FORCED_REPAIR_QUERY:
    'selected witness should come from the local-first forced repair query',
  FORCED_REPAIR_SELECTED_ERROR:
    'selected witness should clear the report-selected timeout error',
  FORCED_REPAIR_DIRECT_SNAPSHOT:
    'forced repair probes should stay on the snapshot lane and defer authoritative repair to the node client',
  ADMIN_FAST_PATH:
    'fixture should preserve the admin-only reachability fast path',
  ADMIN_FAST_PATH_REQUEST:
    'selected coverage should request the admin-only fast path',
  ADMIN_FAST_PATH_WITNESS:
    'fast path should preserve the admin-backed selected witness',
  ADMIN_FAST_PATH_REACHABILITY:
    'fast path should avoid converting bootstrap-readiness latency into a selected reachability timeout',
  ADMIN_FAST_PATH_SOURCE:
    'fast path should preserve the admin-health source on the selected witness',
  ALTERNATIVE_WITNESS_SELECTION:
    'selected-source timeout should preserve the alternative query-success witness before coverage exhaustion',
  ALTERNATIVE_WITNESS_TIMEOUT_CLEAR:
    'alternative query-success witness should clear selected timeout ownership',
  ALTERNATIVE_WITNESS_REACHABILITY:
    'alternative witness selection should not inherit selected admin-health reachability metadata',
  WEBSOCKET_CLOSED_SELECTED_SOURCE:
    'websocket-closed fixture should keep the selected snapshot source',
  WEBSOCKET_CLOSED_SELECTED_ERROR:
    'websocket-closed fixture should preserve the selected snapshot error',
  WEBSOCKET_CLOSED_SELECTED_ADMIN_READY:
    'websocket-closed fixture should preserve selected admin-ready evidence',
  WEBSOCKET_CLOSED_SELECTED_REACHABILITY:
    'websocket-closed fixture should preserve selected admin_ws reachability evidence',
  WEBSOCKET_CLOSED_OBSERVATION:
    'websocket-closed fixture should emit a typed deferred snapshot observation',
  WEBSOCKET_CLOSED_OBSERVATION_REASON:
    'websocket-closed fixture should name the selected transport closure reason',
  WEBSOCKET_CLOSED_REPAIR_DEFERRED:
    'websocket-closed fixture should mark the selected snapshot repair deferred',
  WEBSOCKET_CLOSED_ALTERNATIVE_WITNESS:
    'websocket-closed fixture should keep an alternative witness entry available for handoff probes',
  WEBSOCKET_CLOSED_RETRY_TIMEOUT:
    'websocket-closed fixture should reserve active-gate retry budget',
});

export function buildSelectedSnapshotSourceTimeoutError(nodeId, timeoutMs) {
  return SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_PREFIX +
    nodeId +
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_MIDDLE +
    String(timeoutMs) +
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_SUFFIX;
}
