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
import {
  SERVICE_STATUS,
  TYPEOF,
} from '../../../../src/constants/index.js';
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
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_QUERY_TIMEOUT_MS = 3000;
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
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_EMPTY_NODE_IDS = Object.freeze([]);
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS = 1777976842823;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_CAPTURED_AT_MS = 1777976843125;
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX =
  'snapshot lane unavailable for ';
const SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE = 'snapshot';
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
const ACTIVE_GATE_STRONG_ADMISSION_TEST_NAME =
  'Unit: _waitForAllActive rejects CL-004 witness without strong admission';
const ACTIVE_GATE_STRONG_ADMIN_PROOF_TEST_NAME =
  'Unit: _waitForAllActive rejects CL-006 witness without strong admin proof';
const ACTIVE_GATE_TEST_SEED_NODE_ID = 'seed-1';
const ACTIVE_GATE_TEST_JOINER_ONE_NODE_ID = 'joiner-1';
const ACTIVE_GATE_TEST_JOINER_TWO_NODE_ID = 'joiner-2';
const ACTIVE_GATE_TEST_ACTIVE_STATE = SERVICE_STATUS.ACTIVE;
const ACTIVE_GATE_STRONG_ADMISSION_CLUSTER_SIZE = 2;
const ACTIVE_GATE_STRONG_ADMIN_PROOF_CLUSTER_SIZE = 3;
const ACTIVE_GATE_STRONG_ADMISSION_CONVERGENCE_MS = 200;
const ACTIVE_GATE_STRONG_ADMISSION_MAX_ATTEMPTS = 2;
const ACTIVE_GATE_STRONG_ADMISSION_COVERAGE_COUNT = 0;
const ACTIVE_GATE_STRONG_ADMIN_PROOF_COVERAGE_COUNT = 2;
const ACTIVE_GATE_STRONG_ADMISSION_QUERY_TIMEOUT_MS = 3000;
const ACTIVE_GATE_STRONG_ADMISSION_SELECTED_ERROR =
  'Admin API query timed out for node ' +
  ACTIVE_GATE_TEST_SEED_NODE_ID +
  ' on lane snapshot after ' +
  ACTIVE_GATE_STRONG_ADMISSION_QUERY_TIMEOUT_MS +
  'ms';
const ACTIVE_GATE_TIMEOUT_MESSAGE =
  'Not all nodes reached ACTIVE state within';
const ACTIVE_GATE_STRONG_ADMISSION_TIMEOUT_ASSERTION =
  'startup snapshot timeout should timeout until active admission is strong';
const ACTIVE_GATE_STRONG_ADMIN_PROOF_TIMEOUT_ASSERTION =
  'startup publication lag witness should timeout when strong admission is absent';
const ACTIVE_GATE_TIMEOUT_DIAGNOSTICS_ASSERTION =
  'startup timeout should carry final timeout diagnostics';
const ACTIVE_GATE_SNAPSHOT_TIMEOUT_CLASS_CODE = 'snapshot_timeout';
const ACTIVE_GATE_NO_PROGRESS_TERMINAL_CLASS_CODE = 'no_progress_terminal';
const ACTIVE_GATE_TERMINAL_RECOVERABILITY = 'terminal';
const ACTIVE_GATE_NONE_CAUSE = 'none';
const ACTIVE_GATE_STARTUP_MODE = 'startup';
const ACTIVE_GATE_STRONG_ADMISSION_LOGS_ASSERTION =
  'startup snapshot-timeout path should collect failure logs';
const ACTIVE_GATE_STRONG_ADMIN_PROOF_PUBLISHED_NODE_IDS = Object.freeze([
  ACTIVE_GATE_TEST_SEED_NODE_ID,
  ACTIVE_GATE_TEST_JOINER_ONE_NODE_ID,
]);
const ACTIVE_GATE_STRONG_ADMIN_PROOF_MISSING_NODE_IDS = Object.freeze([
  ACTIVE_GATE_TEST_JOINER_TWO_NODE_ID,
]);
const ACTIVE_GATE_STRONG_ADMIN_PROOF_LOGS_ASSERTION =
  'startup publication-lag timeout should collect failure logs';
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
test(ACTIVE_GATE_STRONG_ADMISSION_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: ACTIVE_GATE_STRONG_ADMISSION_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
      timeouts: {
        convergence: ACTIVE_GATE_STRONG_ADMISSION_CONVERGENCE_MS,
        activeWaitNoProgressMaxAttempts:
          ACTIVE_GATE_STRONG_ADMISSION_MAX_ATTEMPTS,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: ACTIVE_GATE_TEST_SEED_NODE_ID,
          active: true,
          state: ACTIVE_GATE_TEST_ACTIVE_STATE,
          reasons: [],
        }, {
          nodeId: ACTIVE_GATE_TEST_JOINER_ONE_NODE_ID,
          active: true,
          state: ACTIVE_GATE_TEST_ACTIVE_STATE,
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: ACTIVE_GATE_STRONG_ADMISSION_CLUSTER_SIZE,
          bestCoverageNodeCount: ACTIVE_GATE_STRONG_ADMISSION_COVERAGE_COUNT,
          selectedNodeId: ACTIVE_GATE_TEST_SEED_NODE_ID,
          selectedAdminReady: true,
          selectedReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
          selectedError: ACTIVE_GATE_STRONG_ADMISSION_SELECTED_ERROR,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    let timeoutError = null;
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        timeoutError = error;
        return typeof error?.message === TYPEOF.STRING &&
          error.message.includes(ACTIVE_GATE_TIMEOUT_MESSAGE);
      },
      ACTIVE_GATE_STRONG_ADMISSION_TIMEOUT_ASSERTION,
    );
    assert.ok(
      timeoutError?.diagnostics?.noProgress,
      ACTIVE_GATE_TIMEOUT_DIAGNOSTICS_ASSERTION,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      ACTIVE_GATE_SNAPSHOT_TIMEOUT_CLASS_CODE,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.recoverability,
      ACTIVE_GATE_TERMINAL_RECOVERABILITY,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.mode,
      ACTIVE_GATE_STARTUP_MODE,
    );
    assert.equal(
      collectedFailureLogs,
      true,
      ACTIVE_GATE_STRONG_ADMISSION_LOGS_ASSERTION,
    );
  });

test(ACTIVE_GATE_REACHABILITY_DELAY_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: ACTIVE_GATE_REACHABILITY_DELAY_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
      timeouts: {convergence: ACTIVE_GATE_REACHABILITY_DELAY_CONVERGENCE_MS},
    });

    const buildNodeDiagnostics = () =>
      ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.map((nodeId, index) => ({
        nodeId,
        active: index < ACTIVE_GATE_REACHABILITY_DELAY_ACTIVE_COUNT,
        state: index < ACTIVE_GATE_REACHABILITY_DELAY_ACTIVE_COUNT ?
          ACTIVE_GATE_REACHABILITY_DELAY_STATE_ACTIVE :
          ACTIVE_GATE_REACHABILITY_DELAY_STATE_INACTIVE,
        reasons: [],
      }));
    const buildProbeResult = (snapshotCoverage) => ({
      allActive: false,
      nodeDiagnostics: buildNodeDiagnostics(),
      snapshotCoverage,
      publicationConvergenceGate: {
        ready: true,
        reasons: [],
        publicationStatus: ACTIVE_GATE_REACHABILITY_DELAY_PUBLICATION_STATUS,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: Array.isArray(
          snapshotCoverage?.selectedMissingPublishedNodeIds,
        ) ?
          snapshotCoverage.selectedMissingPublishedNodeIds :
          [],
        recoveryProtocolState:
          ACTIVE_GATE_REACHABILITY_DELAY_RECOVERY_PROTOCOL_STATE,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitionCount:
            ACTIVE_GATE_REACHABILITY_DELAY_BLOCKED_PARTITION_COUNT,
          totalSpreadGap: ACTIVE_GATE_REACHABILITY_DELAY_TOTAL_SPREAD_GAP,
        },
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [],
        failingInvariantReasonCodes: [],
        passed: true,
      },
    });
    const selectedProgressResult = buildProbeResult({
      completeCoverage: false,
      expectedNodeCount: ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.length,
      bestCoverageNodeCount:
        ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
      selectedNodeId:
        ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS[
          ACTIVE_GATE_REACHABILITY_DELAY_ZERO
        ],
      selectedAdminReady: false,
      selectedReachableBy: null,
      selectedReachabilityError: ACTIVE_GATE_REACHABILITY_DELAY_ERROR,
      selectedPublicationConvergence: {
        publicationEpoch: ACTIVE_GATE_REACHABILITY_DELAY_INACTIVE_COUNT,
        publicationStatus: ACTIVE_GATE_REACHABILITY_DELAY_PUBLICATION_STATUS,
        publishedActiveNodeIds: ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.slice(
          ACTIVE_GATE_REACHABILITY_DELAY_ZERO,
          ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
        ),
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitionCount:
            ACTIVE_GATE_REACHABILITY_DELAY_BLOCKED_PARTITION_COUNT,
          totalSpreadGap: ACTIVE_GATE_REACHABILITY_DELAY_TOTAL_SPREAD_GAP,
        },
      },
      selectedPublishedActiveNodeIds:
        ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.slice(
          ACTIVE_GATE_REACHABILITY_DELAY_ZERO,
          ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
        ),
      selectedMissingPublishedNodeIds:
        ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.slice(
          ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
        ),
      selectedError: null,
    });
    const regressedProgressResult = buildProbeResult({
      completeCoverage: false,
      expectedNodeCount: ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.length,
      bestCoverageNodeCount: ACTIVE_GATE_REACHABILITY_DELAY_ZERO,
      selectedNodeId:
        ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS[
          ACTIVE_GATE_REACHABILITY_DELAY_ONE
        ],
      selectedAdminReady: false,
      selectedReachableBy: null,
      selectedReachabilityError: null,
      selectedPublicationConvergence: null,
      selectedPublishedActiveNodeIds: [],
      selectedMissingPublishedNodeIds:
        ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.slice(
          ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
        ),
      selectedError: null,
    });
    const probeResults = [
      selectedProgressResult,
      regressedProgressResult,
      regressedProgressResult,
    ];
    let probeIndex = ACTIVE_GATE_REACHABILITY_DELAY_ZERO;
    cluster._probeClusterActiveState = async () => {
      const result = probeResults[
        Math.min(
          probeIndex,
          probeResults.length - ACTIVE_GATE_REACHABILITY_DELAY_ONE,
        )
      ];
      probeIndex += ACTIVE_GATE_REACHABILITY_DELAY_ONE;
      return result;
    };
    cluster._recordClusterStage = () => {};
    cluster._collectFailureLogs = async () => {};
    const originalDateNow = Date.now;
    let fakeNowMs = ACTIVE_GATE_REACHABILITY_DELAY_ZERO;
    Date.now = () => fakeNowMs;
    cluster._sleep = async () => {
      fakeNowMs += ACTIVE_GATE_REACHABILITY_DELAY_SLEEP_MS;
    };

    let timeoutError = null;
    try {
      await assert.rejects(
        async () => {
          await cluster._waitForAllActive();
        },
        (error) => {
          timeoutError = error;
          return typeof error?.message ===
            ACTIVE_GATE_REACHABILITY_DELAY_STRING_TYPE &&
            error.message.includes(
              ACTIVE_GATE_REACHABILITY_DELAY_TIMEOUT_MESSAGE,
            );
        },
        ACTIVE_GATE_REACHABILITY_DELAY_ASSERTION,
      );
    } finally {
      Date.now = originalDateNow;
    }

    assert.equal(
      timeoutError?.diagnostics?.activeGate?.progress?.snapshotCoverageNodeCount,
      ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
    );
    assert.equal(
      timeoutError?.diagnostics?.activeGate?.progress?.inactiveNodeCount,
      ACTIVE_GATE_REACHABILITY_DELAY_INACTIVE_COUNT,
    );
    assert.equal(
      timeoutError?.diagnostics?.activeGate?.readinessDelay?.cause,
      ACTIVE_GATE_REACHABILITY_DELAY_CAUSE,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      ACTIVE_GATE_REACHABILITY_DELAY_CAUSE,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.error,
      ACTIVE_GATE_REACHABILITY_DELAY_ERROR,
    );
  });

test(ACTIVE_GATE_STRONG_ADMIN_PROOF_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: ACTIVE_GATE_STRONG_ADMIN_PROOF_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
      timeouts: {
        convergence: ACTIVE_GATE_STRONG_ADMISSION_CONVERGENCE_MS,
        activeWaitNoProgressMaxAttempts:
          ACTIVE_GATE_STRONG_ADMISSION_MAX_ATTEMPTS,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    cluster._recordClusterStage = () => {};

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: ACTIVE_GATE_TEST_SEED_NODE_ID,
          active: true,
          state: ACTIVE_GATE_TEST_ACTIVE_STATE,
          reasons: [],
        }, {
          nodeId: ACTIVE_GATE_TEST_JOINER_ONE_NODE_ID,
          active: true,
          state: ACTIVE_GATE_TEST_ACTIVE_STATE,
          reasons: [],
        }, {
          nodeId: ACTIVE_GATE_TEST_JOINER_TWO_NODE_ID,
          active: true,
          state: ACTIVE_GATE_TEST_ACTIVE_STATE,
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: ACTIVE_GATE_STRONG_ADMIN_PROOF_CLUSTER_SIZE,
          bestCoverageNodeCount:
            ACTIVE_GATE_STRONG_ADMIN_PROOF_COVERAGE_COUNT,
          selectedNodeId: ACTIVE_GATE_TEST_SEED_NODE_ID,
          selectedAdminReady: true,
          selectedReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
          selectedPublicationConvergence: {
            publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
            publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
            publishedActiveNodeIds:
              ACTIVE_GATE_STRONG_ADMIN_PROOF_PUBLISHED_NODE_IDS,
            pendingAckNodeIds: [],
            priorityPartitionSummary: null,
          },
          selectedPublishedActiveNodeIds:
            ACTIVE_GATE_STRONG_ADMIN_PROOF_PUBLISHED_NODE_IDS,
          selectedMissingPublishedNodeIds:
            ACTIVE_GATE_STRONG_ADMIN_PROOF_MISSING_NODE_IDS,
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: null,
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    let timeoutError = null;
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        timeoutError = error;
        return typeof error?.message === TYPEOF.STRING &&
          error.message.includes(ACTIVE_GATE_TIMEOUT_MESSAGE);
      },
      ACTIVE_GATE_STRONG_ADMIN_PROOF_TIMEOUT_ASSERTION,
    );
    assert.ok(
      timeoutError?.diagnostics?.noProgress,
      ACTIVE_GATE_TIMEOUT_DIAGNOSTICS_ASSERTION,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      ACTIVE_GATE_NO_PROGRESS_TERMINAL_CLASS_CODE,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.cause,
      ACTIVE_GATE_NONE_CAUSE,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.mode,
      ACTIVE_GATE_STARTUP_MODE,
    );
    assert.equal(
      collectedFailureLogs,
      true,
      ACTIVE_GATE_STRONG_ADMIN_PROOF_LOGS_ASSERTION,
    );
  });
