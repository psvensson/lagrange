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
test('Unit: _probeControlSnapshotCoverage surfaces stringified publication diagnostics from the selected snapshot',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getReachabilityDiagnostics() {
        return {
          reachable: true,
          adminReady: true,
          reachableBy: 'admin_health',
          lastError: null,
        };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: [],
            capturedAtMs: 123,
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publication_epoch: '18',
                status: 'OPEN',
                published_active_node_ids: JSON.stringify(['node-a', 'node-b']),
                pending_ack_node_ids: JSON.stringify(['node-b']),
                acknowledged_node_ids: JSON.stringify(['node-a']),
                priority_recovery_reason_codes: JSON.stringify([
                  'publication_epoch_pending',
                  'priority_partitions_not_spread',
                ]),
                participation_by_node_id: JSON.stringify({
                  'node-a': {
                    state: 'published_active',
                    publishedActive: true,
                    recoveryActive: true,
                  },
                  'node-b': {
                    state: 'recovery_pending_publish',
                    recoveryActive: true,
                    recoverySource: 'recovery_eligible_projection',
                  },
                  'node-c': {
                    state: 'recovery_pending_publish',
                    recoveryActive: true,
                    recoverySource: 'recovery_eligible_projection',
                  },
                }),
                participation_state_counts: JSON.stringify({
                  published_active: 1,
                  recovery_pending_publish: 2,
                }),
                membership_lifecycle_summary: JSON.stringify({
                  lifecycleState: 'publish_pending',
                  epochBoundary: 'publication_pending',
                  publishedActiveNodeIds: ['node-a', 'node-b'],
                  projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
                  locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
                  suspectedOrTransitioningNodeIds: ['node-c'],
                  recoveryProtocolState: 'publication_pending',
                  projection_diagnostics: {
                    readinessDecisionMode:
                      'cluster_member_or_recovery_eligible',
                    readinessDecisionDimensions: [
                      'clusterMemberHealthy',
                      'controlPlaneRecoveryEligible',
                      'controlPlaneWritable',
                    ],
                    recoveryEligibleProjectionEnabled: true,
                    recoveryEligibleIncludedNodeIds: ['node-b'],
                    readinessExcludedNodeIds: ['node-c'],
                    clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
                  },
                }),
              },
              publishedMembershipObservation: {
                publicationEpoch: 17,
                status: 'PUBLISHED',
                publishedActiveNodeIds: ['node-a'],
                acknowledgedNodeIds: ['node-a'],
              },
              readinessByNodeId: {
                'node-a': {
                  dimensions: {
                    clusterMemberHealthy: true,
                  },
                },
                'node-b': {
                  dimensions: {
                    clusterMemberHealthy: false,
                  },
                },
              },
            },
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 5000,
      ['node-a', 'node-b'],
      {forceRepair: true},
    );

    assert.strictEqual(coverage.completeCoverage, false);
    const selectedPublicationConvergence =
      coverage.selectedPublicationConvergence;
    assert.deepStrictEqual(
      {
        publicationEpoch: selectedPublicationConvergence.publicationEpoch,
        publicationStatus: selectedPublicationConvergence.publicationStatus,
        publishedActiveNodeIds:
          selectedPublicationConvergence.publishedActiveNodeIds,
        pendingAckNodeIds: selectedPublicationConvergence.pendingAckNodeIds,
        acknowledgedNodeIds:
          selectedPublicationConvergence.acknowledgedNodeIds,
        recoveryActiveNodeIds:
          selectedPublicationConvergence.recoveryActiveNodeIds,
        recoveryActiveNodeSource:
          selectedPublicationConvergence.recoveryActiveNodeSource,
        missingPublishedRecoveryActiveNodeIds:
          selectedPublicationConvergence.missingPublishedRecoveryActiveNodeIds,
        recoveryProtocolState:
          selectedPublicationConvergence.recoveryProtocolState,
        priorityRecoveryReasonCodes:
          selectedPublicationConvergence.priorityRecoveryReasonCodes,
        participationByNodeId:
          selectedPublicationConvergence.participationByNodeId,
        participationStateCounts:
          selectedPublicationConvergence.participationStateCounts,
        priorityPartitionSummary:
          selectedPublicationConvergence.priorityPartitionSummary,
        membershipLifecycleSummary:
          selectedPublicationConvergence.membershipLifecycleSummary,
        projectionDiagnostics:
          selectedPublicationConvergence.projectionDiagnostics,
      },
      {
        publicationEpoch: 18,
        publicationStatus: 'OPEN',
        publishedActiveNodeIds: ['node-a', 'node-b'],
        pendingAckNodeIds: ['node-b'],
        acknowledgedNodeIds: ['node-a'],
        recoveryActiveNodeIds: ['node-a', 'node-b', 'node-c'],
        recoveryActiveNodeSource: 'locally_eligible_projection',
        missingPublishedRecoveryActiveNodeIds: ['node-c'],
        recoveryProtocolState: 'publication_pending',
        priorityRecoveryReasonCodes: [
          'publication_epoch_pending',
          'priority_partitions_not_spread',
        ],
        participationByNodeId: {
          'node-a': {
            state: 'published_active',
            durable: false,
            publishedActive: true,
            recoveryActive: true,
            projectedServing: false,
            locallyEligible: false,
            suspectedOrTransitioning: false,
            recoverySource: null,
            reasons: [],
          },
          'node-b': {
            state: 'recovery_pending_publish',
            durable: false,
            publishedActive: false,
            recoveryActive: true,
            projectedServing: false,
            locallyEligible: false,
            suspectedOrTransitioning: false,
            recoverySource: 'recovery_eligible_projection',
            reasons: [],
          },
          'node-c': {
            state: 'recovery_pending_publish',
            durable: false,
            publishedActive: false,
            recoveryActive: true,
            projectedServing: false,
            locallyEligible: false,
            suspectedOrTransitioning: false,
            recoverySource: 'recovery_eligible_projection',
            reasons: [],
          },
        },
        participationStateCounts: {
          published_active: 1,
          recovery_pending_publish: 2,
        },
        priorityPartitionSummary: null,
        membershipLifecycleSummary: {
          lifecycleState: 'publish_pending',
          epochBoundary: 'publication_pending',
          publishedActiveNodeIds: ['node-a', 'node-b'],
          projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
          locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
          suspectedOrTransitioningNodeIds: ['node-c'],
          recoveryActiveNodeIds: ['node-a', 'node-b', 'node-c'],
          recoveryActiveNodeSource: 'locally_eligible_projection',
          missingPublishedRecoveryActiveNodeIds: ['node-c'],
          recoveryProtocolState: 'publication_pending',
          recoveryProtocolReasonCodes: [
            'priority_partitions_not_spread',
            'publication_epoch_pending',
          ],
          participationByNodeId: {
            'node-a': {
              state: 'published_active',
              durable: false,
              publishedActive: true,
              recoveryActive: true,
              projectedServing: false,
              locallyEligible: false,
              suspectedOrTransitioning: false,
              recoverySource: null,
              reasons: [],
            },
            'node-b': {
              state: 'recovery_pending_publish',
              durable: false,
              publishedActive: false,
              recoveryActive: true,
              projectedServing: false,
              locallyEligible: false,
              suspectedOrTransitioning: false,
              recoverySource: 'recovery_eligible_projection',
              reasons: [],
            },
            'node-c': {
              state: 'recovery_pending_publish',
              durable: false,
              publishedActive: false,
              recoveryActive: true,
              projectedServing: false,
              locallyEligible: false,
              suspectedOrTransitioning: false,
              recoverySource: 'recovery_eligible_projection',
              reasons: [],
            },
          },
          participationStateCounts: {
            published_active: 1,
            recovery_pending_publish: 2,
          },
          projectionDiagnostics: {
            readinessDecisionMode: 'cluster_member_or_recovery_eligible',
            readinessDecisionDimensions: [
              'clusterMemberHealthy',
              'controlPlaneRecoveryEligible',
              'controlPlaneWritable',
            ],
            recoveryEligibleProjectionEnabled: true,
            recoveryEligibleIncludedNodeIds: ['node-b'],
            readinessExcludedNodeIds: ['node-c'],
            clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
          },
        },
        projectionDiagnostics: {
          readinessDecisionMode: 'cluster_member_or_recovery_eligible',
          readinessDecisionDimensions: [
            'clusterMemberHealthy',
            'controlPlaneRecoveryEligible',
            'controlPlaneWritable',
          ],
          recoveryEligibleProjectionEnabled: true,
          recoveryEligibleIncludedNodeIds: ['node-b'],
          readinessExcludedNodeIds: ['node-c'],
          clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
        },
      },
      'coverage probe should retain current publication convergence details for failing snapshots',
    );
    assert.deepStrictEqual(
      coverage.selectedPublishedMembershipObservation,
      {
        publicationEpoch: 17,
        publicationStatus: 'PUBLISHED',
        publishedActiveNodeIds: ['node-a'],
        pendingAckNodeIds: [],
        acknowledgedNodeIds: ['node-a'],
        recoveryActiveNodeIds: ['node-a'],
        recoveryActiveNodeSource: 'published_membership',
        missingPublishedRecoveryActiveNodeIds: [],
        priorityPartitionSummary: null,
        membershipLifecycleSummary: null,
        projectionDiagnostics: null,
      },
      'coverage probe should surface the last published membership separately from newer open publications',
    );
    assert.deepStrictEqual(
      {
        publicationEpoch:
          coverage.selectedPriorityRecoveryObservation?.publicationEpoch,
        publicationStatus:
          coverage.selectedPriorityRecoveryObservation?.publicationStatus,
        recoveryProtocolState:
          coverage.selectedPriorityRecoveryObservation?.recoveryProtocolState,
        priorityRecoveryReasonCodes:
          coverage.selectedPriorityRecoveryObservation
            ?.priorityRecoveryReasonCodes,
        pendingAckCount:
          coverage.selectedPriorityRecoveryObservation?.pendingAckCount,
        priorityRecoveryBlockedPartitionCount:
          coverage.selectedPriorityRecoveryObservation
            ?.priorityRecoveryBlockedPartitionCount,
      },
      {
        publicationEpoch: 18,
        publicationStatus: 'OPEN',
        recoveryProtocolState: 'publication_pending',
        priorityRecoveryReasonCodes: [
          'publication_epoch_pending',
          'priority_partitions_not_spread',
        ],
        pendingAckCount: 1,
        priorityRecoveryBlockedPartitionCount: 0,
      },
      'coverage probe should preserve the canonical priority-recovery observation for the selected snapshot',
    );
    assert.deepStrictEqual(
      coverage.selectedHealthyReadinessNodeIds,
      ['node-a'],
      'coverage probe should report readiness-healthy nodes from the selected snapshot diagnostics',
    );
    assert.strictEqual(
      coverage.selectedAdminReady,
      true,
      'coverage probe should preserve admin-readiness for the selected snapshot node',
    );
    assert.deepStrictEqual(
      coverage.selectedMissingPublishedNodeIds,
      [],
      'coverage probe should preserve the selected snapshot publication disagreement set',
    );
    assert.deepStrictEqual(
      coverage.probeWitnesses,
      [{
        nodeId: 'node-a',
        snapshotQuerySucceeded: true,
        adminReady: true,
        reachable: true,
        reachableBy: 'admin_health',
        reachabilityError: null,
        error: null,
        observedNodeCount: 0,
        missingExpectedNodeCount: 2,
        capturedAtMs: 123,
        snapshotRevision: null,
        snapshotRevisionState: null,
        snapshotRevisionGap: null,
        snapshotObservationMode: null,
        snapshotObservationState: null,
        snapshotObservationContractState: null,
        snapshotObservationRefreshState: null,
        snapshotObservationNextAction: null,
        snapshotObservationReasonCodes: [],
        snapshotObservationRetryAfterMs: null,
        snapshotRepairDeferred: false,
        snapshotTimeoutEncountered: false,
        activeGateOwnerCohort: null,
        publicationEpoch: 18,
        publicationStatus: 'OPEN',
        publishedActiveNodeIds: ['node-a', 'node-b'],
        pendingAckNodeIds: ['node-b'],
        missingPublishedNodeIds: [],
      }],
      'coverage probe should emit compact per-attempt witness data for closure-ledger updates',
    );
  });

test('Unit: _probeControlSnapshotCoverage captures per-node publication ' +
  'disagreement for 3-node active-gate characterization', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const createNode = (
    nodeId,
    role,
    observedNodes,
    capturedAtMs,
    publishedActiveNodeIds,
    pendingWrites,
    bufferedEvents,
  ) => ({
    id: nodeId,
    role,
    async getStatus() {
      return {rows: [{status: 'active'}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: true,
        adminReady: true,
        reachableBy: 'admin_health',
        lastError: null,
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: observedNodes,
          capturedAtMs,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 22,
              publicationStatus: 'PUBLISHED',
              publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: ['node-a'],
            },
            logsTable: {
              pendingWrites,
              pendingWriteGrowthCount: 0,
              retainedBacklogGrowthCount: 0,
              sharedPressureBackpressured: false,
            },
            cdcReplay: {
              bufferedEvents,
              replayBufferGrowthCount: 0,
              replayRetryDepth: 1,
              partitionCount: 1,
              replayInFlightPartitionCount: 0,
              byPartitionId: {},
            },
          },
        }],
      };
    },
    async getLogs(_options) {
      return '';
    },
  });

  cluster._nodes.set('node-a', createNode(
    'node-a',
    NODE_ROLES.SEED,
    ['node-a', 'node-b'],
    100,
    ['node-a', 'node-b'],
    4,
    9,
  ));
  cluster._nodes.set('node-b', createNode(
    'node-b',
    NODE_ROLES.JOINER,
    ['node-a', 'node-b'],
    200,
    ['node-a', 'node-c'],
    7,
    13,
  ));
  cluster._nodes.set('node-c', createNode(
    'node-c',
    NODE_ROLES.JOINER,
    ['node-a'],
    300,
    ['node-a'],
    1,
    5,
  ));

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + 5000,
    ['node-a', 'node-b', 'node-c'],
  );

  assert.strictEqual(coverage.completeCoverage, false);
  assert.strictEqual(
    coverage.selectedNodeId,
    'node-b',
    'probe should select the best 3-node snapshot candidate for gate diagnostics',
  );
  assert.deepStrictEqual(
    coverage.selectedMissingPublishedNodeIds,
    ['node-b'],
    'selected snapshot should preserve the publication disagreement set',
  );
  assert.deepStrictEqual(
    coverage.publicationDisagreementByNodeId,
    {
      'node-a': ['node-c'],
      'node-b': ['node-b'],
      'node-c': ['node-b', 'node-c'],
    },
    'coverage probe should expose per-node publication disagreement witnesses',
  );
  assert.strictEqual(
    coverage.selectedControlPlaneOwnerQueueDepth?.pendingWrites,
    7,
    'selected snapshot should carry owner queue-depth witness at the active gate',
  );
  assert.strictEqual(
    coverage.selectedCdcReplayLag?.bufferedEvents,
    13,
    'selected snapshot should carry CDC lag witness at the active gate',
  );
});

test('Unit: _probeControlSnapshotCoverage prefers the strongest publication ' +
  'witness when coverage ties', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const createNode = (
    nodeId,
    role,
    capturedAtMs,
    publishedActiveNodeIds,
  ) => ({
    id: nodeId,
    role,
    async getStatus() {
      return {rows: [{status: 'active'}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: true,
        adminReady: true,
        reachableBy: 'admin_health',
        lastError: null,
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: ['node-a', 'node-b'],
          capturedAtMs,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 22,
              publicationStatus: 'PUBLISHED',
              publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: ['node-a'],
            },
            logsTable: {
              pendingWrites: 0,
              pendingWriteGrowthCount: 0,
              retainedBacklogGrowthCount: 0,
              sharedPressureBackpressured: false,
            },
            cdcReplay: {
              bufferedEvents: 0,
              replayBufferGrowthCount: 0,
              replayRetryDepth: 0,
              partitionCount: 1,
              replayInFlightPartitionCount: 0,
              byPartitionId: {},
            },
          },
        }],
      };
    },
    async getLogs() {
      return '';
    },
  });

  cluster._nodes.set('node-a', createNode(
    'node-a',
    NODE_ROLES.SEED,
    100,
    ['node-a', 'node-b'],
  ));
  cluster._nodes.set('node-b', createNode(
    'node-b',
    NODE_ROLES.JOINER,
    200,
    ['node-a'],
  ));
  cluster._nodes.set('node-c', createNode(
    'node-c',
    NODE_ROLES.JOINER,
    300,
    ['node-a'],
  ));

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + 5000,
    ['node-a', 'node-b', 'node-c'],
  );

  assert.strictEqual(
    coverage.selectedNodeId,
    'node-a',
    'probe should prefer the witness with fewer missing published nodes over a newer stale witness',
  );
  assert.deepStrictEqual(
    coverage.selectedPublishedActiveNodeIds,
    ['node-a', 'node-b'],
  );
  assert.deepStrictEqual(
    coverage.selectedMissingPublishedNodeIds,
    ['node-c'],
  );
});
