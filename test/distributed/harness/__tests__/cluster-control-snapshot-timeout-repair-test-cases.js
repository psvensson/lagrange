/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE} from
  '../../../../src/admin/admin-constants.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../../../src/control-plane/control-plane-publication-merge.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../../../src/control-plane/control-plane-snapshot-owner.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../../../src/control-plane/owner-contract-outcome.js';
import {SERVICE_STATUS} from '../../../../src/constants/index.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE = 5;
const SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS = 5000;
const SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS = 1777976837236;
const SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS = 1777976838250;
const SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH = 2;
const SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH = 3;
const SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const SNAPSHOT_REPLAY_TEST_IMAGE = 'distributed-db:test';
const SNAPSHOT_REPLAY_TEST_EMPTY_LOG = '';
const SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
const SNAPSHOT_REPLAY_TEST_ADMIN_WS_SOURCE = 'admin_ws';
const SNAPSHOT_REPLAY_TEST_CONTROL_SNAPSHOT_SOURCE = 'control_snapshot';
const SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE =
  'discovery_node_coverage_gap';
const SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS = 250;
const SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING = 'pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
const SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE = false;
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED =
  'write_deferred';
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK =
  'durable_readback_pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED = true;
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS = 1000;
const SNAPSHOT_REPLAY_TEST_AUTHORITY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage keeps admin-ready authority over ' +
  'stronger publication when 102455Z coverage ties';
const SNAPSHOT_REPLAY_TEST_DEFERRED_AUTHORITY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage exposes deferred owner observation ' +
  'for admin-ready stale 102455Z witness';
const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage replays pending handoff reconcile ' +
  'after selected timeout reduction';
const SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_PROJECTION_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage projects published active membership ' +
  'into startup snapshot coverage under publication lag';
const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_PROJECTION_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage projects the remaining pending ' +
  'owner-reconcile node into startup snapshot coverage';
const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_PROJECTION_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage projects paired pending ' +
  'owner-reconcile nodes into startup snapshot coverage';
const SNAPSHOT_REPLAY_TEST_AUTHORITY_ASSERTION =
  'same-coverage active-gate selection should keep the admin-ready authority ' +
  'witness';
const SNAPSHOT_REPLAY_TEST_NODE_ID = Object.freeze({
  SEED: '7493b0ab-a054-5fad-a91b-5e331db29304',
  BASELINE: '11601fe0-72d6-5853-8590-ec2881853e72',
  ADMIN_READY_STALE: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  STRONG_EXTRA: '8be8d30f-4499-5eed-865c-71b4d529a67a',
  STALE_EXTRA: 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
});
const SNAPSHOT_REPLAY_TEST_SEED_REACHABILITY_ERROR =
  'Control snapshot reachability probe timed out for ' +
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
const SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_RECONCILE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_PUBLICATION_LAG_PROJECTED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_OBSERVED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  ]);
const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_PROJECTED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  ]);
const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_OBSERVED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
  ]);
const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_PROJECTED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
  ]);
const SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
const SNAPSHOT_REACHABILITY_TIMEOUT_ERROR =
  'Control snapshot reachability probe timed out for ' +
  SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID;
const SNAPSHOT_REACHABILITY_TIMEOUT_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REACHABILITY_TIMEOUT_PUBLISHED_NODE_IDS =
  SNAPSHOT_REACHABILITY_TIMEOUT_OBSERVED_NODE_IDS;
const SNAPSHOT_REACHABILITY_TIMEOUT_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
const SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE;
const SNAPSHOT_REPAIR_TIMEOUT_QUERY_TIMEOUT_MS = 3349;
const SNAPSHOT_REPAIR_TIMEOUT_AUTHORITATIVE_QUERY_TIMEOUT_MS = 1500;
const SNAPSHOT_REPAIR_TIMEOUT_CAPTURED_NOW_MS = 1777976841000;
const SNAPSHOT_REPAIR_TIMEOUT_SELECTED_ERROR =
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
const SNAPSHOT_REPAIR_TIMEOUT_UNSELECTED_ERROR_PREFIX =
  'snapshot lane unavailable for ';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage prefers a query-success witness over ' +
  'selected 11601fe0 snapshot timeout when coverage ties';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage resets snapshot lane after selected ' +
  'source timeout';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_EXHAUSTED_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage records deferred retry evidence ' +
  'after selected source retry timeout';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage keeps load selected source retry on ' +
  'base timeout';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage preserves an alternative query-success ' +
  'witness when selected source times out with higher coverage';
const SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_HANDOFF_FIXTURE_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage replays selected-source websocket ' +
  'closure evidence with an alternative witness available';
const SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_FALLBACK_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage falls back to normal selected source ' +
  'after forced repair timeout';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
const SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_QUERY_TIMEOUT_MS = 3000;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS = 30000;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_INITIAL_TIMEOUT_MS = 5000;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS = 15000;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID +
  ' on lane snapshot after ' +
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_QUERY_TIMEOUT_MS +
  'ms';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_ERROR =
  'Admin API query timed out for node ' +
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID +
  ' on lane snapshot after ' +
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_QUERY_TIMEOUT_MS +
  'ms';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_PREFIX =
  'Admin API query timed out for node ';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_MIDDLE =
  ' on lane snapshot after ';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_SUFFIX = 'ms';
const SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
const SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ERROR =
  'Admin API query failed for node ' +
  SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_SELECTED_NODE_ID +
  ' on lane snapshot: WebSocket was closed before the connection was established';
const SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_OBSERVATION_REASON =
  'selected_transport_closed';
const SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
const SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ALTERNATIVE_ERROR =
  'snapshot lane unavailable for ' + SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
const SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID +
  ' on lane snapshot after ' +
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_QUERY_TIMEOUT_MS +
  'ms';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_EMPTY_NODE_IDS = Object.freeze([]);
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_HIGHER_COVERAGE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  ]);
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS = 1777976842823;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_CAPTURED_AT_MS =
  1777976842999;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_CAPTURED_AT_MS = 1777976843125;
const SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_CAPTURED_AT_MS = 1777976843340;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX =
  'snapshot lane unavailable for ';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE = 'snapshot';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_MODE = 'load';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_REASON = 'selected_timeout';
const ACTIVE_GATE_REACHABILITY_DELAY_TEST_NAME =
  'Unit: _waitForAllActive keeps terminal reachability delay from selected progress';
const ACTIVE_GATE_REACHABILITY_DELAY_CLUSTER_SIZE = 5;
const ACTIVE_GATE_REACHABILITY_DELAY_CONVERGENCE_MS = 30;
const ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS = Object.freeze([
  'seed-1',
  'joiner-1',
  'joiner-2',
  'joiner-3',
  'joiner-4',
]);
const ACTIVE_GATE_REACHABILITY_DELAY_ERROR =
  'Control snapshot reachability probe timed out for seed-1';
const ACTIVE_GATE_REACHABILITY_DELAY_CAUSE =
  'snapshot_reachability_timeout';
const ACTIVE_GATE_REACHABILITY_DELAY_PUBLICATION_STATUS = 'PUBLISHED';
const ACTIVE_GATE_REACHABILITY_DELAY_RECOVERY_PROTOCOL_STATE =
  'priority_spread_pending';
const ACTIVE_GATE_REACHABILITY_DELAY_ZERO = 0;
const ACTIVE_GATE_REACHABILITY_DELAY_ONE = 1;
const ACTIVE_GATE_REACHABILITY_DELAY_ACTIVE_COUNT = 2;
const ACTIVE_GATE_REACHABILITY_DELAY_INACTIVE_COUNT = 3;
const ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT = 3;
const ACTIVE_GATE_REACHABILITY_DELAY_BLOCKED_PARTITION_COUNT = 5;
const ACTIVE_GATE_REACHABILITY_DELAY_TOTAL_SPREAD_GAP = 10;
const ACTIVE_GATE_REACHABILITY_DELAY_SLEEP_MS = 10;
const ACTIVE_GATE_REACHABILITY_DELAY_STATE_ACTIVE = 'active';
const ACTIVE_GATE_REACHABILITY_DELAY_STATE_INACTIVE = 'inactive';
const ACTIVE_GATE_REACHABILITY_DELAY_STRING_TYPE = 'string';
const ACTIVE_GATE_REACHABILITY_DELAY_TIMEOUT_MESSAGE =
  'Not all nodes reached ACTIVE state within';
const ACTIVE_GATE_REACHABILITY_DELAY_ASSERTION =
  'startup timeout should keep the selected reachability delay evidence';
const ACTIVE_GATE_PARTIAL_RESIDUAL_TEST_NAME =
  'Unit: _probeClusterActiveState classifies contact-seed partial startup coverage';
const ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS = 5000;
const ACTIVE_GATE_PARTIAL_RESIDUAL_READY_STATUS = 200;
const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_STATUS = 503;
const ACTIVE_GATE_PARTIAL_RESIDUAL_READY_PHASE = 'JOIN_READY';
const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_PHASE = 'CONTROL_READY';
const ACTIVE_GATE_PARTIAL_RESIDUAL_ACTIVE_STATE = 'active';
const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_STATE = 'warming';
const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_REASON =
  'BOOTSTRAP_NOT_READY';
const ACTIVE_GATE_PARTIAL_RESIDUAL_PUBLICATION_EPOCH = 3;
const ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_COVERAGE = 3;
const ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_ACTIVE = 3;
const ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_INACTIVE = 2;
const ACTIVE_GATE_PARTIAL_RESIDUAL_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
const ACTIVE_GATE_PARTIAL_RESIDUAL_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const ACTIVE_GATE_PARTIAL_RESIDUAL_MISSING_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const ACTIVE_GATE_PARTIAL_RESIDUAL_PUBLISHED_ACTIVE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
const ACTIVE_GATE_PARTIAL_RESIDUAL_READY_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const ACTIVE_GATE_PARTIAL_RESIDUAL_INACTIVE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const ACTIVE_GATE_PARTIAL_RESIDUAL_SELECTED_CAPTURED_AT_MS =
  SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS;
const ACTIVE_GATE_PARTIAL_RESIDUAL_STALE_CAPTURED_AT_MS =
  SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS;
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STALE_ACK_TEST_NAME =
  'Unit: _probeClusterActiveState resolves stale selected ACK covered by ' +
  'startup owner-reconcile handoff';
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STALE_ACK_GUARDRAIL_TEST_NAME =
  'Unit: _probeClusterActiveState keeps stale selected ACK blocked without ' +
  'startup owner-reconcile handoff';
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATUS = 200;
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PHASE = 'JOIN_READY';
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATE = 'active';
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_COVERAGE_COUNT = 3;
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_OBSERVED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PUBLISHED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_MISSING_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_ACK_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_RECONCILE_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  ]);
const ACTIVE_GATE_NO_PROGRESS_BEST_SNAPSHOT_TEST_NAME =
  'Unit: _waitForAllActive keeps metric-moving snapshot when terminal probe ' +
  'regresses to selected timeout';
const ACTIVE_GATE_NO_PROGRESS_BEST_COVERAGE_TEST_NAME =
  'Unit: _waitForAllActive keeps best snapshot coverage when active count ' +
  'later regresses to selected timeout';
const ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS = 200;
const ACTIVE_GATE_NO_PROGRESS_MAX_ATTEMPTS = 2;
const ACTIVE_GATE_NO_PROGRESS_EXPECTED_NODE_COUNT = 5;
const ACTIVE_GATE_NO_PROGRESS_COVERAGE_NODE_COUNT = 2;
const ACTIVE_GATE_NO_PROGRESS_BEST_COVERAGE_NODE_COUNT = 4;
const ACTIVE_GATE_NO_PROGRESS_ZERO_COVERAGE = 0;
const ACTIVE_GATE_NO_PROGRESS_PUBLICATION_EPOCH = 1;
const ACTIVE_GATE_NO_PROGRESS_WAITING_STAGE = 'setup.cluster.waiting-active';
const ACTIVE_GATE_NO_PROGRESS_PENDING_REASON =
  'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING';
const ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE;
const ACTIVE_GATE_NO_PROGRESS_RETRY_AFTER_MS = 25300;
const ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS_PER_QUERY = 3000;
const ACTIVE_GATE_NO_PROGRESS_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID +
  ' on lane snapshot after ' +
  ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS_PER_QUERY +
  'ms';
const ACTIVE_GATE_NO_PROGRESS_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
const ACTIVE_GATE_NO_PROGRESS_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const ACTIVE_GATE_NO_PROGRESS_REASONS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE,
]);
const ACTIVE_GATE_NO_PROGRESS_TERMINAL_GATE_REASONS = Object.freeze([
  'publication_convergence_missing',
  'publication_missing_active_node=' + SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
const LOAD_READINESS_NO_PROGRESS_BEST_SNAPSHOT_TEST_NAME =
  'Unit: waitForLoadReadinessStability keeps metric-moving snapshot when ' +
  'terminal probe regresses to selected timeout';
const LOAD_READINESS_NO_PROGRESS_STABLE_WINDOW_MS = 1000;
const LOAD_READINESS_NO_PROGRESS_TIMEOUT_MS = 200;
const LOAD_READINESS_NO_PROGRESS_PHASE = 'pre_load';
const LOAD_READINESS_NO_PROGRESS_STAGE = 'scenario.load-readiness.waiting';
const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage preserves a meaningful timeout floor ' +
  'for late active-wait probes';
const SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage keeps snapshot-lane failures explicit';
const SNAPSHOT_REPLAY_TEST_FORCED_REPAIR_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage sends forced repair probes through ' +
  'authoritative snapshot repair';
const SNAPSHOT_REPLAY_TEST_ADMIN_ONLY_FAST_PATH_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage uses the admin-only reachability fast path';
const SNAPSHOT_REPLAY_TEST_SINGLE_NODE_CLUSTER_SIZE = 1;
const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_CLUSTER_SIZE = 2;
const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_DEADLINE_EXTENSION_MS = 1;
const SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX = 0;
const SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX = 1;
const SNAPSHOT_REPLAY_TEST_SINGLE_CALL_COUNT = 1;
const SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT = 2;
const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS = 100;
const SNAPSHOT_REPLAY_TEST_FAST_PATH_TIMEOUT_BUFFER_MS = 50;
const SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_CAPTURED_AT_MS = 456;
const SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_CAPTURED_AT_MS = 789;
const SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_DEADLINE_EXTENSION_MS = 1000;
const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A = 'node-a';
const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_B = 'node-b';
const SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_NODE_ID = 'node-fast-path';
const SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A,
  SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_B,
]);
const SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_ERROR =
  'snapshot lane timed out';
const SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_PATTERN =
  /snapshot lane timed out/u;
const SNAPSHOT_REPLAY_TEST_REACHABILITY_ERROR_PREFIX =
  'Control snapshot reachability probe timed out for ';
const SNAPSHOT_TIMEOUT_REPAIR_ASSERTION = Object.freeze({
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
    'startup selected-source retry should restore the startup timeout floor',
  STARTUP_RETRY_SCALED_TIMEOUT:
    'startup selected-source retry should use the startup-scaled snapshot timeout floor',
  STARTUP_RETRY_EXHAUSTED_SOURCE:
    'retry-exhausted evidence should preserve the selected admin-ready source',
  STARTUP_RETRY_EXHAUSTED_ERROR:
    'retry-exhausted evidence should preserve the retry timeout error',
  STARTUP_RETRY_EXHAUSTED_TIMEOUT:
    'retry-exhausted evidence should report the retry timeout budget',
  STARTUP_RETRY_EXHAUSTED_OBSERVATION:
    'retry-exhausted evidence should expose deferred owner retry observation',
  STARTUP_RETRY_EXHAUSTED_REASON:
    'retry-exhausted evidence should classify the selected timeout reason',
  STARTUP_RETRY_EXHAUSTED_REPAIR:
    'retry-exhausted evidence should mark selected snapshot repair deferred',
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
    'load selected-source retry should keep the base snapshot timeout',
  LOAD_LANE_RESET:
    'load selected snapshot timeout should reset only the snapshot lane',
  NORMAL_FALLBACK_AFTER_RESET:
    'normal selected-source fallback must follow the snapshot lane reset',
  FORCED_REPAIR_SOURCE:
    'forced repair timeout fallback should preserve the selected admin-ready source',
  FORCED_REPAIR_CLEAR:
    'normal selected-source fallback should clear the forced repair timeout',
  FORCED_REPAIR_COVERAGE:
    'normal selected-source fallback should recover authoritative coverage',
  FORCED_REPAIR_CALLS:
    'selected source should fall back from forced repair to normal snapshot once',
  FORCED_REPAIR_LANE_RESET:
    'forced repair timeout should reset only the selected snapshot lane',
  FORCED_REPAIR_PATH:
    'fixture should replay the forced repair snapshot probe path',
  FORCED_REPAIR_METRIC:
    'authoritative repair should move the snapshot coverage metric',
  FORCED_REPAIR_SELECTED_SOURCE:
    'fixture should keep the handoff-selected 11601fe0... source',
  FORCED_REPAIR_TIMEOUT_BUDGET:
    'fixture should preserve the late probe timeout budget',
  FORCED_REPAIR_TIMEOUT_CHAIN:
    'authoritative repair coverage should replace the selected timeout chain',
  FORCED_REPAIR_QUERY:
    'selected witness should come from the authoritative snapshot repair query',
  FORCED_REPAIR_SELECTED_ERROR:
    'selected witness should clear the report-selected timeout error',
  FORCED_REPAIR_DIRECT_SNAPSHOT:
    'forced repair probes should stay on the snapshot lane and use direct authoritative repair',
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
});

function buildSelectedSnapshotSourceTimeoutError(nodeId, timeoutMs) {
  return SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_PREFIX +
    nodeId +
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_MIDDLE +
    String(timeoutMs) +
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR_SUFFIX;
}
/**
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * *For any* cluster configuration with `docker.hosts` of length H and
 * `nodesPerHost` limit P, no single Docker host SHALL have more than P
 * containers, and the total container count SHALL equal the requested
 * cluster size (up to H * P).
 *
 * **Validates: Requirements 2.3**
 */
test(SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_TEST_NAME,
async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

  const snapshotProbeCalls = [];
  const reachabilityProbeCalls = [];
  for (const [index, nodeId] of SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_IDS.entries()) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: index === SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX ?
        NODE_ROLES.SEED :
        NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        reachabilityProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
        });
        return {
          reachable: true,
          adminReady: true,
          reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
          lastError: null,
        };
      },
      async getControlSnapshot(options = {}) {
        snapshotProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
        });
        return {
          rows: [{
            nodes: [nodeId],
            capturedAtMs:
              SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS + index,
          }],
        };
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });
  }

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_IDS,
  );

  assert.strictEqual(
    snapshotProbeCalls.length,
    SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LATE_PROBES_INSPECT_REMAINING,
  );
  assert.ok(
    snapshotProbeCalls.every((call) =>
      call.timeoutMs >= SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS),
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SNAPSHOT_TIMEOUT_FLOOR,
  );
  assert.ok(
    reachabilityProbeCalls.every((call) =>
      call.timeoutMs >= SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS),
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.REACHABILITY_TIMEOUT_FLOOR,
  );
  assert.ok(
    coverage.selectedSnapshotTimeoutMs >=
      SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_SNAPSHOT_TIMEOUT_FLOOR,
  );
  assert.ok(
    coverage.selectedReachabilityTimeoutMs >=
      SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_REACHABILITY_TIMEOUT_FLOOR,
  );
});

test(SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_SINGLE_NODE_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });

    const probeCalls = [];
    cluster._nodes.set(SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A, {
      id: SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A,
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getControlSnapshot(options) {
        probeCalls.push(options);
        if (options?.lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE) {
          throw new Error(SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_ERROR);
        }
        return {
          rows: [{
            nodes: [SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A],
            capturedAtMs:
              SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_CAPTURED_AT_MS,
          }],
        };
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
      [SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A],
    );

    assert.strictEqual(coverage.completeCoverage, false);
    assert.strictEqual(probeCalls.length, SNAPSHOT_REPLAY_TEST_SINGLE_CALL_COUNT);
    assert.strictEqual(
      probeCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX]?.lane,
      SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SNAPSHOT_LANE,
    );
    assert.match(
      coverage.selectedError,
      SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_PATTERN,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SNAPSHOT_LANE_TIMEOUT,
    );
  });

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const reachabilityProbeCalls = [];

  for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role:
        nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
          NODE_ROLES.SEED :
          NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        reachabilityProbeCalls.push({
          nodeId,
          skipBootstrapReadiness: options.skipBootstrapReadiness === true,
        });
        return {
          reachable:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID,
          adminReady:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID,
          reachableBy:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID ?
              SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
              null,
          lastError: null,
        };
      },
      async getControlSnapshot(options = {}) {
        snapshotProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
          lane: options.lane,
          forceRepair: options.forceRepair === true,
          forceAuthoritativeRepair:
            options.forceAuthoritativeRepair === true,
        });
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID) {
          throw new Error(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR);
        }
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID) {
          return {
            rows: [{
              nodes: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_EMPTY_NODE_IDS,
              capturedAtMs: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS,
            }],
          };
        }
        throw new Error(
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX + nodeId,
        );
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });
  }

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );

  assert.strictEqual(
    coverage.bestCoverageNodeCount,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_EMPTY_NODE_IDS.length,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_REPORT_SHAPE,
  );
  assert.strictEqual(
    coverage.forceRepair,
    false,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_SOURCE_BEFORE_REPAIR,
  );
  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.QUERY_SUCCESS_SELECTION,
  );
  assert.strictEqual(
    coverage.selectedError,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.QUERY_SUCCESS_TIMEOUT_CLEAR,
  );
  assert.ok(
    snapshotProbeCalls.every((call) =>
      call.lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE &&
      call.forceRepair === false &&
      call.forceAuthoritativeRepair === false,
    ),
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.NORMAL_SNAPSHOT_SOURCE_PATH,
  );
  assert.ok(
    reachabilityProbeCalls.every((call) =>
      call.skipBootstrapReadiness === true,
    ),
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.INHERITED_READINESS_EXCLUDED,
  );
});

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const resetCalls = [];
  let selectedSnapshotLaneReset = false;

  for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role:
        nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
          NODE_ROLES.SEED :
          NODE_ROLES.JOINER,
      _resetAdminSocket(lane) {
        resetCalls.push({nodeId, lane});
        if (
          nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID &&
          lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE
        ) {
          selectedSnapshotLaneReset = true;
        }
      },
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        return {
          reachable:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
          adminReady:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
          reachableBy:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID ?
              SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
              null,
          lastError: null,
          skipBootstrapReadiness: options.skipBootstrapReadiness === true,
        };
      },
      async getControlSnapshot(options = {}) {
        snapshotProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
          lane: options.lane,
          forceRepair: options.forceRepair === true,
          forceAuthoritativeRepair:
            options.forceAuthoritativeRepair === true,
        });
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID) {
          if (selectedSnapshotLaneReset !== true) {
            throw new Error(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_ERROR);
          }
          return {
            rows: [{
              nodes: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_IDS,
              capturedAtMs:
                SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_CAPTURED_AT_MS,
            }],
          };
        }
        throw new Error(
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX + nodeId,
        );
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });
  }

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );
  const selectedCalls = snapshotProbeCalls.filter((call) => {
    return call.nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID;
  });

  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_RETRY_SOURCE,
  );
  assert.strictEqual(
    coverage.selectedError,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_RETRY_RECOVERY,
  );
  assert.deepStrictEqual(
    resetCalls,
    [{
      nodeId: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
      lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
    }],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_LANE_RESET,
  );
  assert.strictEqual(
    coverage.bestCoverageNodeCount,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_IDS.length,
  );
  assert.strictEqual(
    selectedCalls.length,
    SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_COUNT,
  );
  assert.ok(
    selectedCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs <
      selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_TIMEOUT_FLOOR,
  );
  assert.strictEqual(
    selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_SCALED_TIMEOUT,
  );
  assert.ok(
    snapshotProbeCalls.every((call) =>
      call.lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE &&
      call.forceRepair === false &&
      call.forceAuthoritativeRepair === false,
    ),
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.RETRY_SNAPSHOT_LANE,
  );
});

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_EXHAUSTED_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const resetCalls = [];

  for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role:
        nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
          NODE_ROLES.SEED :
          NODE_ROLES.JOINER,
      _resetAdminSocket(lane) {
        resetCalls.push({nodeId, lane});
      },
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        return {
          reachable:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
          adminReady:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
          reachableBy:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID ?
              SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
              null,
          lastError: null,
          skipBootstrapReadiness: options.skipBootstrapReadiness === true,
        };
      },
      async getControlSnapshot(options = {}) {
        snapshotProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
          lane: options.lane,
          forceRepair: options.forceRepair === true,
          forceAuthoritativeRepair:
            options.forceAuthoritativeRepair === true,
        });
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID) {
          throw new Error(buildSelectedSnapshotSourceTimeoutError(
            nodeId,
            options.timeoutMs,
          ));
        }
        throw new Error(
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX + nodeId,
        );
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });
  }

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );
  const selectedRetryTimeoutPattern = new RegExp(
    String(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS),
    'u',
  );
  const selectedCalls = snapshotProbeCalls.filter((call) => {
    return call.nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID;
  });

  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_SOURCE,
  );
  assert.match(
    coverage.selectedError,
    selectedRetryTimeoutPattern,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_ERROR,
  );
  assert.strictEqual(
    coverage.selectedSnapshotTimeoutMs,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_TIMEOUT,
  );
  assert.strictEqual(
    selectedCalls.length,
    SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_COUNT,
  );
  assert.deepStrictEqual(
    resetCalls,
    [
      {
        nodeId: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
        lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
      },
      {
        nodeId: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
        lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
      },
    ],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_LANE_RESET,
  );
  assert.deepStrictEqual(
    {
      mode: coverage.selectedSnapshotObservationMode,
      state: coverage.selectedSnapshotObservationState,
      contractState: coverage.selectedSnapshotObservationContractState,
      refreshState: coverage.selectedSnapshotObservationRefreshState,
      nextAction: coverage.selectedSnapshotObservationNextAction,
      retryAfterMs: coverage.selectedSnapshotObservationRetryAfterMs,
    },
    {
      mode: ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
      state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
      retryAfterMs: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS,
    },
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_OBSERVATION,
  );
  assert.deepStrictEqual(
    coverage.selectedSnapshotObservationReasonCodes,
    [SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_REASON],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_REASON,
  );
  assert.strictEqual(
    coverage.selectedSnapshotRepairDeferred,
    true,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_REPAIR,
  );
});

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const resetCalls = [];
  let selectedSnapshotLaneReset = false;

  for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role:
        nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
          NODE_ROLES.SEED :
          NODE_ROLES.JOINER,
      _resetAdminSocket(lane) {
        resetCalls.push({nodeId, lane});
        if (
          nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID &&
          lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE
        ) {
          selectedSnapshotLaneReset = true;
        }
      },
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        return {
          reachable:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
          adminReady:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
          reachableBy:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID ?
              SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
              null,
          lastError: null,
          skipBootstrapReadiness: options.skipBootstrapReadiness === true,
        };
      },
      async getControlSnapshot(options = {}) {
        snapshotProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
          lane: options.lane,
          forceRepair: options.forceRepair === true,
          forceAuthoritativeRepair:
            options.forceAuthoritativeRepair === true,
        });
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID) {
          if (selectedSnapshotLaneReset !== true) {
            throw new Error(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_ERROR);
          }
          return {
            rows: [{
              nodes: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_IDS,
              capturedAtMs:
                SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_CAPTURED_AT_MS,
            }],
          };
        }
        throw new Error(
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX + nodeId,
        );
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });
  }

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
    {readinessMode: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_MODE},
  );
  const selectedCalls = snapshotProbeCalls.filter((call) => {
    return call.nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID;
  });

  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_SOURCE,
  );
  assert.strictEqual(
    coverage.selectedError,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_RECOVERY,
  );
  assert.strictEqual(
    selectedCalls.length,
    SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_COUNT,
  );
  assert.strictEqual(
    selectedCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_INITIAL_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_FIRST_TIMEOUT,
  );
  assert.strictEqual(
    selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_TIMEOUT,
  );
  assert.deepStrictEqual(
    resetCalls,
    [{
      nodeId: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
      lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
    }],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_LANE_RESET,
  );
});

test(SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_FALLBACK_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const resetCalls = [];
  let selectedSnapshotLaneReset = false;

  for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role:
        nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
          NODE_ROLES.SEED :
          NODE_ROLES.JOINER,
      _resetAdminSocket(lane) {
        resetCalls.push({nodeId, lane});
        if (
          nodeId === SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID &&
          lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE
        ) {
          selectedSnapshotLaneReset = true;
        }
      },
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        return {
          reachable:
            nodeId === SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID,
          adminReady:
            nodeId === SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID,
          reachableBy:
            nodeId === SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID ?
              SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
              null,
          lastError: null,
          skipBootstrapReadiness: options.skipBootstrapReadiness === true,
        };
      },
      async getControlSnapshot(options = {}) {
        snapshotProbeCalls.push({
          nodeId,
          lane: options.lane,
          forceRepair: options.forceRepair === true,
          forceAuthoritativeRepair:
            options.forceAuthoritativeRepair === true,
        });
        if (nodeId === SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID) {
          if (options.forceAuthoritativeRepair === true) {
            throw new Error(SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_ERROR);
          }
          assert.strictEqual(
            selectedSnapshotLaneReset,
            true,
            SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.NORMAL_FALLBACK_AFTER_RESET,
          );
          return {
            rows: [{
              nodes: SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_IDS,
              capturedAtMs:
                SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_CAPTURED_AT_MS,
            }],
          };
        }
        throw new Error(
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX + nodeId,
        );
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });
  }

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
    {forceRepair: true},
  );
  const selectedCalls = snapshotProbeCalls.filter((call) => {
    return call.nodeId === SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID;
  });

  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_SOURCE,
  );
  assert.strictEqual(
    coverage.selectedError,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_CLEAR,
  );
  assert.strictEqual(
    coverage.completeCoverage,
    true,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_COVERAGE,
  );
  assert.deepStrictEqual(
    selectedCalls,
    [
      {
        nodeId: SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID,
        lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
        forceRepair: true,
        forceAuthoritativeRepair: true,
      },
      {
        nodeId: SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID,
        lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
        forceRepair: false,
        forceAuthoritativeRepair: false,
      },
    ],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_CALLS,
  );
  assert.deepStrictEqual(
    resetCalls,
    [{
      nodeId: SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID,
      lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
    }],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_LANE_RESET,
  );
});

test(
  SNAPSHOT_REPLAY_TEST_FORCED_REPAIR_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });
    const snapshotProbeCalls = [];
    const reachabilityProbeCalls = [];
    const originalDateNow = Date.now;
    Date.now = () => SNAPSHOT_REPAIR_TIMEOUT_CAPTURED_NOW_MS;

    try {
      for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
        cluster._nodes.set(nodeId, {
          id: nodeId,
          role:
            nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID ?
              NODE_ROLES.SEED :
              NODE_ROLES.JOINER,
          async getStatus() {
            return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
          },
          async getReachabilityDiagnostics(options = {}) {
            reachabilityProbeCalls.push({
              nodeId,
              timeoutMs: options.timeoutMs,
              skipBootstrapReadiness:
                options.skipBootstrapReadiness === true,
            });
            return {
              reachable:
                nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID,
              adminReady:
                nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID,
              reachableBy:
                nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID ?
                  SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
                  null,
              lastError: null,
            };
          },
          async getControlSnapshot(options = {}) {
            snapshotProbeCalls.push({
              nodeId,
              timeoutMs: options.timeoutMs,
              lane: options.lane,
              forceRepair: options.forceRepair === true,
              forceAuthoritativeRepair:
                options.forceAuthoritativeRepair === true,
            });
            if (
              nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID &&
              options.forceAuthoritativeRepair === true
            ) {
              return {
                rows: [{
                  nodes: [...SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS],
                  capturedAtMs: SNAPSHOT_REPAIR_TIMEOUT_CAPTURED_NOW_MS,
                }],
              };
            }
            if (nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID) {
              throw new Error(SNAPSHOT_REPAIR_TIMEOUT_SELECTED_ERROR);
            }
            throw new Error(
              SNAPSHOT_REPAIR_TIMEOUT_UNSELECTED_ERROR_PREFIX + nodeId,
            );
          },
          async getLogs(_options) {
            return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
          },
        });
      }

      const coverage = await cluster._probeControlSnapshotCoverage(
        SNAPSHOT_REPAIR_TIMEOUT_CAPTURED_NOW_MS +
          SNAPSHOT_REPAIR_TIMEOUT_QUERY_TIMEOUT_MS,
        SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
        {forceRepair: true},
      );
      const selectedWitness = coverage.probeWitnesses.find((witness) => {
        return witness.nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID;
      });

      assert.strictEqual(coverage.completeCoverage, true);
      assert.strictEqual(
        coverage.forceRepair,
        true,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_PATH,
      );
      assert.strictEqual(
        coverage.bestCoverageNodeCount,
        SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS.length,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_METRIC,
      );
      assert.strictEqual(
        coverage.selectedSnapshotNodeId,
        SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_SELECTED_SOURCE,
      );
      assert.strictEqual(
        coverage.selectedSnapshotTimeoutMs,
        SNAPSHOT_REPAIR_TIMEOUT_QUERY_TIMEOUT_MS,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_TIMEOUT_BUDGET,
      );
      assert.strictEqual(
        coverage.selectedError,
        null,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_TIMEOUT_CHAIN,
      );
      assert.strictEqual(
        selectedWitness?.snapshotQuerySucceeded,
        true,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_QUERY,
      );
      assert.strictEqual(
        selectedWitness?.error,
        null,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_SELECTED_ERROR,
      );
      assert.ok(
        snapshotProbeCalls.every((call) =>
          call.lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE &&
          call.forceRepair === true &&
          call.forceAuthoritativeRepair === true &&
          call.timeoutMs === SNAPSHOT_REPAIR_TIMEOUT_QUERY_TIMEOUT_MS,
        ),
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_DIRECT_SNAPSHOT,
      );
      assert.ok(
        reachabilityProbeCalls.every((call) =>
          call.skipBootstrapReadiness === true,
        ),
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ADMIN_FAST_PATH,
      );
    } finally {
      Date.now = originalDateNow;
    }
  },
);

test(
  SNAPSHOT_REPLAY_TEST_ADMIN_ONLY_FAST_PATH_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_SINGLE_NODE_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });
    const nodeId = SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_NODE_ID;
    const reachabilityError =
      SNAPSHOT_REPLAY_TEST_REACHABILITY_ERROR_PREFIX + nodeId;
    const reachabilityProbeCalls = [];

    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        reachabilityProbeCalls.push({
          timeoutMs: options.timeoutMs,
          skipBootstrapReadiness: options.skipBootstrapReadiness === true,
        });
        if (options.skipBootstrapReadiness === true) {
          return {
            reachable: true,
            adminReady: true,
            reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
            lastError: null,
          };
        }
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              reachable: false,
              adminReady: false,
              reachableBy: null,
              lastError: reachabilityError,
            });
          }, Number(options.timeoutMs || ACTIVE_GATE_REACHABILITY_DELAY_ZERO) +
            SNAPSHOT_REPLAY_TEST_FAST_PATH_TIMEOUT_BUFFER_MS);
        });
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: [nodeId],
            capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_CAPTURED_AT_MS,
          }],
        };
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_DEADLINE_EXTENSION_MS,
      [nodeId],
    );

    assert.deepStrictEqual(
      reachabilityProbeCalls.map((call) => call.skipBootstrapReadiness),
      [true],
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ADMIN_FAST_PATH_REQUEST,
    );
    assert.strictEqual(
      coverage.selectedSnapshotAdminReady,
      true,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ADMIN_FAST_PATH_WITNESS,
    );
    assert.strictEqual(
      coverage.selectedSnapshotReachabilityError,
      null,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ADMIN_FAST_PATH_REACHABILITY,
    );
    assert.strictEqual(
      coverage.selectedSnapshotReachableBy,
      SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ADMIN_FAST_PATH_SOURCE,
    );
  },
);

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

  for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role:
        nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
          NODE_ROLES.SEED :
          NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics() {
        return {
          reachable:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID,
          adminReady:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID,
          reachableBy:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID ?
              SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
              null,
          lastError: null,
        };
      },
      async getControlSnapshot() {
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID) {
          return {
            rows: [{
              nodes: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_HIGHER_COVERAGE_NODE_IDS,
              capturedAtMs: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS,
            }],
          };
        }
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID) {
          return {
            rows: [{
              nodes:
                SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_NODE_IDS,
              capturedAtMs:
                SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_CAPTURED_AT_MS,
            }],
          };
        }
        throw new Error(
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX + nodeId,
        );
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });
  }

  let timedOut = false;
  const selectedNode = cluster._nodes.get(
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID,
  );
  const selectedOriginalGetControlSnapshot =
    selectedNode.getControlSnapshot.bind(selectedNode);
  selectedNode.getControlSnapshot = async (...args) => {
    if (timedOut !== true) {
      timedOut = true;
      throw new Error(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR);
    }
    return selectedOriginalGetControlSnapshot(...args);
  };

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );

  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ALTERNATIVE_WITNESS_SELECTION,
  );
  assert.strictEqual(
    coverage.selectedError,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ALTERNATIVE_WITNESS_TIMEOUT_CLEAR,
  );
  assert.strictEqual(
    coverage.selectedSnapshotReachableBy,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ALTERNATIVE_WITNESS_REACHABILITY,
  );
});

test(
  SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_HANDOFF_FIXTURE_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });

    for (const nodeId of SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_NODE_IDS) {
      cluster._nodes.set(nodeId, {
        id: nodeId,
        role:
          nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
            NODE_ROLES.SEED :
            NODE_ROLES.JOINER,
        async getStatus() {
          return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
        },
        async getReachabilityDiagnostics() {
          const selectedSourceNode =
            nodeId ===
              SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_SELECTED_NODE_ID;
          return {
            reachable: selectedSourceNode,
            adminReady: selectedSourceNode,
            reachableBy:
              selectedSourceNode ? SNAPSHOT_REPLAY_TEST_ADMIN_WS_SOURCE : null,
            lastError: null,
          };
        },
        async getControlSnapshot() {
          if (
            nodeId === SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_SELECTED_NODE_ID
          ) {
            throw new Error(SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ERROR);
          }
          throw new Error(
            SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ALTERNATIVE_ERROR,
          );
        },
        async getLogs(_options) {
          return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
        },
      });
    }

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
      SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_NODE_IDS,
    );

    assert.strictEqual(
      coverage.selectedSnapshotNodeId,
      SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_SELECTED_NODE_ID,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_SOURCE,
    );
    assert.strictEqual(
      coverage.selectedError,
      SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ERROR,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_ERROR,
    );
    assert.strictEqual(
      coverage.selectedSnapshotAdminReady,
      true,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_ADMIN_READY,
    );
    assert.strictEqual(
      coverage.selectedSnapshotReachableBy,
      SNAPSHOT_REPLAY_TEST_ADMIN_WS_SOURCE,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_REACHABILITY,
    );
    assert.deepStrictEqual(
      {
        mode: coverage.selectedSnapshotObservationMode,
        state: coverage.selectedSnapshotObservationState,
        contractState: coverage.selectedSnapshotObservationContractState,
        refreshState: coverage.selectedSnapshotObservationRefreshState,
        nextAction: coverage.selectedSnapshotObservationNextAction,
      },
      {
        mode: ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
        state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
        contractState: OWNER_CONTRACT_STATE.DEFERRED,
        refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
      },
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_OBSERVATION,
    );
    assert.ok(
      coverage.selectedSnapshotObservationReasonCodes.includes(
        SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_OBSERVATION_REASON,
      ),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_OBSERVATION_REASON,
    );
    assert.strictEqual(
      coverage.selectedSnapshotRepairDeferred,
      true,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_REPAIR_DEFERRED,
    );
    assert.ok(
      Object.hasOwn(coverage.publicationDisagreementByNodeId, SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_ALTERNATIVE_WITNESS,
    );
  },
);
