/**
 * Cluster abstraction for the distributed testing framework.
 * Provides unified cluster lifecycle management over Docker containers.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4
 */

import {v4 as uuidv4, v5 as uuidv5} from 'uuid';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {promises as fs} from 'node:fs';
import {dirname, resolve as resolvePath} from 'node:path';
import {DockerProvider} from './docker-provider.js';
import {ChaosPrimitives} from './chaos.js';
import {LoadGenerator} from './load-generator.js';
import {
  buildBenchmarkCriticalControlPlaneStabilitySnapshot,
  BENCHMARK_LOAD_ADMISSION_REASON_DISCOVERY_PRESSURED,
  BENCHMARK_LOAD_ADMISSION_REASON_LOAD_LANE_DENIED,
  BENCHMARK_LOAD_ADMISSION_REASON_PUBLICATION_EPOCH_MISMATCH,
  BENCHMARK_LOAD_ADMISSION_REASON_RECOVERY_GATE_CLOSED,
  buildBenchmarkLoadAdmissionEvaluation,
  buildBenchmarkLoadAdmissionSnapshot,
} from './benchmark-partition-convergence.js';
import {buildServiceDiscoverySql} from './node-client.js';
import {ENTRYPOINT_ENV} from '../../../src/constants/entrypoint.js';
import {TABLES} from '../../../src/constants/index.js';
import {INVARIANT_SEVERITY} from '../../../src/invariants/invariant-catalog.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {isRetryableControlPlaneError} from '../../../src/control-plane/control-plane-error-classification.js';
import {buildPublicationRecoveryGateSnapshot} from '../../../src/control-plane/publication-recovery-gate.js';
import {
  waitForConvergence,
  assertConsistency,
  waitForConsistencyConvergence,
  assertDataIntegrity,
} from './assertions.js';
import {summarizeInvariantBreaches} from './invariant-breaches.js';
import {LogCollector} from './log-collector.js';
import {LogAnalyzer} from './log-analyzer.js';
import {PlaybackRecorder as OriginalPlaybackRecorder} from './playback-recorder.js';
class PlaybackRecorder extends OriginalPlaybackRecorder {
  async start(options = {}) {
    const cluster = options.cluster;
    if (cluster && cluster._config) {
      const benchmarkControlTimeoutMs = cluster._config?.benchmark?.controlQueryTimeoutMs;
      if (Number.isInteger(benchmarkControlTimeoutMs) && benchmarkControlTimeoutMs > 0) {
        CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS = benchmarkControlTimeoutMs;
        FETCH_TIMEOUT_MS = Math.max(15000, benchmarkControlTimeoutMs);
        CLUSTER_ACTIVE_NODE_PROBE_TIMEOUT_MS = Math.max(15000, benchmarkControlTimeoutMs);
        CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS = Math.max(5000, Math.floor(benchmarkControlTimeoutMs / 3));
      } else {
        CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS = 30000;
        FETCH_TIMEOUT_MS = 30000;
        CLUSTER_ACTIVE_NODE_PROBE_TIMEOUT_MS = 30000;
        CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS = 10000;
      }
    }
    return super.start(options);
  }
}
import {TraceArtifactRecorder} from './trace-artifact-recorder.js';
import {
  buildActiveGateWaitPolicy,
  classifyActiveGateClosureWitness,
} from './active-gate-closure-classification.js';
import {
  STARTUP_ADMISSION_STATE,
  classifyActiveGateReadinessDelay,
  canProjectStartupActiveFromTransientAdmin,
  isTimeoutShapedProbeError,
} from './startup-readiness-evidence.js';
import {shouldPreserveTopologyDeferredAdmission} from '../scenarios/postgres-baseline-node-admission.js';
import {
  BENCHMARK_DEFAULTS,
  PORTS,
  TIMEOUTS,
  LABELS,
  CONTAINER_ENV_KEYS,
  PARTITION_ENV_KEYS,
  NETWORK,
  NODE_ROLES,
  PLAYBACK_EVENT_TYPE,
  LOG_SUBSCRIPTION_CAPABILITY,
  RAFT_PROVIDER_DEFAULTS,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_ADMIN_META,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  CONTAINER_LOG_TAIL_LINES,
} from './constants.js';

const BOOTSTRAP_POLL_INTERVAL_MS = 500;
const ACTIVE_POLL_INTERVAL_MS = 1000;
const RESTART_POLL_INTERVAL_MS = 500;
const LOAD_READINESS_STABLE_WINDOW_MS = 5000;
const LOAD_READINESS_STABILITY_TIMEOUT_MS = 30000;
const BOOTSTRAP_PROGRESS_TIMEOUT_MAX_MULTIPLIER = 3;
const ACTIVE_WAIT_MIN_CLUSTER_SIZE = 1;
const ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_PER_EXTRA_NODE = 25;
const ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_DENOMINATOR = 100;
const ACTIVE_WAIT_TIMEOUT_MAX_MULTIPLIER = 3;
const ACTIVE_STATE = 'ACTIVE';
const INACTIVE_STATE = 'inactive';
const UNKNOWN_STATE = 'unknown';
const UNKNOWN_PHASE = 'unknown';
const UNKNOWN_REASON = 'unknown';
const DATA_DIR_PATH = '/data';
const ZERO = 0;
const ONE = 1;
const MIN_TIMEOUT_MS = 1;
const CONTROL_SNAPSHOT_LATE_PROBE_TIMEOUT_FLOOR_MS = 100;
const CONTROL_SNAPSHOT_LATE_REACHABILITY_TIMEOUT_FLOOR_MS = 5000;
const HTTP_OK_LOWER = 200;
const HTTP_OK_UPPER = 299;
let FETCH_TIMEOUT_MS = 15000;
let CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS = 15000;
let CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS = 5000;
let CLUSTER_ACTIVE_NODE_PROBE_TIMEOUT_MS = 15000;
const BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS = 10000;
const BOOTSTRAP_READY_STABLE_WINDOW_MS = 2000;
const ADMIN_QUERY_TIMEOUT_MS = 30000;
const LOG_COLLECTION_TIMEOUT_MS = 1000;
const BOOTSTRAP_HEALTH_PATH = '/health';
const BOOTSTRAP_JOIN_READY_PATH = '/bootstrap/ready';
const BOOTSTRAP_TRAFFIC_READY_PATH = '/readyz';
const ADMIN_HEALTH_PATH = '/health';
const ADMIN_STREAM_PATH = '/api/admin/stream';
const HTTP_METHOD_GET = 'GET';
const HTTP_HEADER_CONTENT_TYPE = 'Content-Type';
const HTTP_HEADER_CONTENT_LENGTH = 'Content-Length';
const HTTP_CONTENT_TYPE_JSON = 'application/json';
const HTTP_ERROR_STATUS = -1;
const JOINING_HTTP_TIMEOUT_ENV_KEY = ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS;
const JOINING_LEADERSHIP_WAIT_TIMEOUT_ENV_KEY =
  ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS;
const JOINING_HTTP_TIMEOUT_DEFAULT_MS = 30000;
const JOINING_LEADERSHIP_WAIT_TIMEOUT_DEFAULT_MS = 120000;
const WS_HOST_ENV_KEY = 'TRANSPORT_WS_HOST';
const WS_BIND_ALL_HOST = '0.0.0.0';
const RAFT_PROVIDER_ENV_KEY = RAFT_PROVIDER_DEFAULTS.envKey;
const NODE_OPTIONS_ENV_KEY = 'NODE_OPTIONS';
const NODE_OPTION_HEAP_PROF = '--heap-prof';
const NODE_OPTION_HEAP_SNAPSHOT_NEAR_LIMIT_PREFIX =
  '--heapsnapshot-near-heap-limit=';
const HEAP_SNAPSHOT_NEAR_LIMIT_MIN_COUNT = 1;
const HEAP_SNAPSHOT_NEAR_LIMIT_DEFAULT_COUNT = 2;
const CONTROL_SNAPSHOT_OBSERVATION_FIELD = 'snapshotObservation';
const CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD = 'state';
const CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD = 'contractState';
const CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED = 'failed';
const CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FAILED = 'failed';
const QUERY_MESSAGE_TYPE = 'query';
const PARTITION_CALLBACK_MESSAGE_TYPE = 'partition_callback';
const QUERY_RESULT_MESSAGE_TYPE = 'query_result';
const CDC_EVENT_MESSAGE_TYPE = 'cdc_event';
const LIVE_QUERY_EVENT_MESSAGE_TYPE = 'live_query_event';
const LIVE_QUERY_INITIAL_MESSAGE_TYPE = 'live_query_initial';
const LOGS_TABLE_NAME = 'logs';
const QUIESCENCE_REASON_IN_FLIGHT_PREFIX = 'replica_operations_in_flight=';
const QUIESCENCE_REASON_LEADERSHIP_PREFIX = 'leadership_unstable=';
const QUIESCENCE_REASON_SNAPSHOT_ERROR_PREFIX = 'snapshot_query_error=';
const QUIESCENCE_REASON_CRITICAL_SYSTEM_SPREAD_PREFIX =
  'critical_system_spread_gap=';
const REACHABILITY_PROBE_SQL = 'SELECT node_id FROM nodes LIMIT 1';
const REACHABILITY_SOURCE_BOOTSTRAP_HEALTH = 'bootstrap_health';
const REACHABILITY_SOURCE_ADMIN_HEALTH = 'admin_health';
const REACHABILITY_SOURCE_ADMIN_WS = 'admin_ws';
const REACHABILITY_SOURCE_SQL_PROBE = 'sql_probe';
const REACHABILITY_STATUS_HTTP = 'http_status_';
const REACHABILITY_ERROR_UNKNOWN = 'unknown reachability error';
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ADMIN_SOCKET_LANE_LOAD = 'load';
const BENCHMARK_ADMISSION_PROBE_SQL_PREFIX = 'SELECT 1 FROM ';
const BENCHMARK_ADMISSION_PROBE_SQL_SUFFIX = ' LIMIT 1';
const ACTIVE_PROBE_REASON_ADMIN_NOT_READY = 'admin_not_ready';
const ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX = 'admin_probe_error=';
const ACTIVE_PROBE_REASON_PUBLICATION_CONVERGENCE_MISSING =
  'publication_convergence_missing';
const ACTIVE_PROBE_REASON_PUBLICATION_NOT_PUBLISHED_PREFIX =
  'publication_not_published=';
const ACTIVE_PROBE_REASON_PUBLICATION_PENDING_ACK_PREFIX =
  'publication_pending_ack=';
const ACTIVE_PROBE_REASON_PUBLICATION_MISSING_ACTIVE_NODE_PREFIX =
  'publication_missing_active_node=';
const ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING =
  'priority_control_plane_spread_pending';
const ACTIVE_PROBE_REASON_PRIORITY_RECOVERY_PENDING =
  'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING';
const STARTUP_ADMISSION_STATE_STRONG_ACTIVE =
  STARTUP_ADMISSION_STATE.STRONG_ACTIVE;
const STARTUP_ADMISSION_STATE_DEGRADED =
  STARTUP_ADMISSION_STATE.DEGRADED_BUT_PROCEEDING;
const STARTUP_ADMISSION_STATE_BLOCKED = STARTUP_ADMISSION_STATE.BLOCKED;
const ACTIVE_PROBE_REASON_CONTROL_PLANE_DEPENDENCY_UNAVAILABLE =
  'CONTROL_PLANE_DEPENDENCY_UNAVAILABLE';
const ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS = 'status';
const ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY = 'status_query';
const ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK = 'status_query_fallback';
const ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS = 'bootstrap_readiness';
const ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS = 'traffic_readiness';
const ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION =
  'startup_admin_projection';
const ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_SNAPSHOT_PROJECTION =
  'startup_snapshot_projection';
const ACTIVE_PROBE_ACTIVITY_SOURCE_LOAD_PUBLICATION_GATE_PROJECTION =
  'load_publication_gate_projection';
const ACTIVE_PROBE_REASON_LOAD_PUBLICATION_GATE_READY =
  'load_publication_gate_ready';
const ACTIVE_PROBE_REASON_STARTUP_SNAPSHOT_READY =
  'startup_snapshot_ready';
const ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX =
  'readiness_probe_timeout_fallback=';
const ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_BOOTSTRAP_JOIN_DURING_RECOVERY =
  'priority_recovery_bootstrap_ready_allows_join_during_priority_recovery';
const ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_TRAFFIC_GATE_DURING_PRIORITY_RECOVERY =
  'priority_recovery_readyz_closed_during_priority_recovery';
const ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE =
  'priority_recovery_cluster_active_requires_publication_convergence_and_priority_spread';
const ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_BOOTSTRAP_JOIN_DURING_RECOVERY =
  'priority_recovery_bootstrap_join_not_admitted_during_recovery';
const ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_TRAFFIC_GATE_DURING_RECOVERY =
  'priority_recovery_readyz_not_closed_during_priority_recovery';
const ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE =
  'priority_recovery_cluster_marked_active_without_convergence';
const ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER = 'cluster';
const ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM =
  'distributed_harness_cluster_active_gate';
const ACTIVE_WAIT_NO_PROGRESS_CLASS_CODE = 'no_progress_terminal';
const ACTIVE_WAIT_NO_PROGRESS_REASON_CODE = 'stalled_no_progress';
const ACTIVE_WAIT_INVARIANT_BREACH_REASON_CODE =
  'priority_recovery_invariant_breach';
const ACTIVE_WAIT_INACTIVE_SUMMARY_ERROR_PREFIX = 'error:';
const ACTIVE_WAIT_INACTIVE_SUMMARY_STATE_PREFIX = 'state:';
const ACTIVE_WAIT_BLOCKER_INACTIVE_NODES_PREFIX = 'inactive_nodes=';
const ACTIVE_WAIT_BLOCKER_SNAPSHOT_COVERAGE_PREFIX = 'snapshot_coverage=';
const ACTIVE_WAIT_BLOCKER_SNAPSHOT_ERROR = 'snapshot_error';
const ACTIVE_WAIT_BLOCKER_PUBLICATION_GATE_PREFIX = 'publication_gate=';
const ACTIVE_WAIT_BLOCKER_PRIORITY_RECOVERY_PROGRESS_CLASS_PREFIX =
  'priority_recovery_progress_class=';
const ACTIVE_WAIT_BLOCKER_READY = 'ready';
const ACTIVE_WAIT_BLOCKER_NONE = 'none';
const ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
const ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHING = 'PUBLISHING';
const ACTIVE_WAIT_PUBLICATION_STATUS_PREPARED = 'PREPARED';
const ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX =
  'active_wait_no_progress_coordinator_cycles=';
const ACTIVE_WAIT_STALLED_MESSAGE_PREFIX =
  'Cluster ACTIVE wait stalled with no meaningful progress ';
const ACTIVE_WAIT_INVARIANT_BREACH_MESSAGE_PREFIX =
  'Cluster ACTIVE wait invariant breach ';
const STATUS_ACTIVE_LOWER = ACTIVE_STATE.toLowerCase();
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CONNECTING = 0;
const PLAYBACK_SCOPE_CLUSTER = 'cluster';
const PLAYBACK_SCOPE_NODE = 'node';
const PLAYBACK_SCOPE_CHAOS = 'chaos';
const PLAYBACK_SCOPE_LOAD = 'load';
const PLAYBACK_ENTITY_CLUSTER = 'cluster';
const LOAD_RUN_ENTITY = 'load-run';
const LOAD_PROGRESS_INTERVAL_MS = 1000;
const CONTROL_SNAPSHOT_NODES_FIELD = 'nodes';
const CONTROL_SNAPSHOT_REVISION_FIELD = 'snapshotRevision';
const CONTROL_SNAPSHOT_REVISION_STATE_FIELD = 'snapshotRevisionState';
const CONTROL_SNAPSHOT_EXPECTED_MINIMUM_REVISION_FIELD =
  'snapshotExpectedMinimumRevision';
const CONTROL_SNAPSHOT_REVISION_GAP_FIELD = 'snapshotRevisionGap';
const CONTROL_SNAPSHOT_RESUME_TOKEN_FIELD = 'snapshotResumeToken';
const CONTROL_SNAPSHOT_READINESS_DIMENSION_CLUSTER_MEMBER_HEALTHY =
  'clusterMemberHealthy';
const SERVICE_DISCOVERY_SERVICES_FIELD = 'services';
const SERVICE_DISCOVERY_SERVICE_PROTOCOL_FIELD = 'protocol';
const SERVICE_DISCOVERY_SERVICE_IDS_FIELD = 'serviceIds';
const SERVICE_DISCOVERY_REPLICAS_FIELD = 'replicas';
const SERVICE_DISCOVERY_REPLICA_NODE_ID_FIELD = 'nodeId';
const SERVICE_DISCOVERY_REPLICA_SERVICE_ID_FIELD = 'serviceId';
const SERVICE_DISCOVERY_REPLICA_READINESS_FIELD = 'readiness';
const SERVICE_DISCOVERY_REPLICA_BENCHMARK_ADMISSION_FIELD =
  'benchmarkAdmission';
const SERVICE_DISCOVERY_READINESS_BENCHMARK_READY_FIELD = 'benchmarkReady';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_STATE_FIELD = 'state';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_STATE_READY = 'ready';
const SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD = 'routingReady';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_SCHEMA_READY_FIELD = 'schemaReady';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_TOPOLOGY_READY_FIELD =
  'topologyReady';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_REASONS_FIELD = 'reasons';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_FIELD =
  'localReplicaRole';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_DEGRADATION_STATE_FIELD =
  'degradationState';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_DEGRADED_BY_OPERATION_IDS_FIELD =
  'degradedByOperationIds';
const BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_UNKNOWN = 'unknown';
const BENCHMARK_ADMISSION_DEGRADATION_STATE_HEALTHY = 'healthy';
const BENCHMARK_ADMISSION_REASON_LEADERSHIP_UNSTABLE = 'leadership_unstable';
const LOAD_LANE_SOFT_ADMISSION_REASON_CODES = new Set([
  'schema_partition_unavailable',
  'leadership_unstable',
]);
const LOAD_LANE_VOTER_READY_REPLICA_ROLES = new Set(['leader', 'follower']);
const CLUSTER_STAGE_SETUP_NETWORK_CREATING = 'setup.network.creating';
const CLUSTER_STAGE_SETUP_NETWORK_CREATED = 'setup.network.created';
const CLUSTER_STAGE_SETUP_SEED_STARTING = 'setup.seed.starting';
const CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING =
  'setup.seed.bootstrap.waiting';
const CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_READY = 'setup.seed.bootstrap.ready';
const CLUSTER_STAGE_SETUP_JOINER_STARTING = 'setup.joiner.starting';
const CLUSTER_STAGE_SETUP_JOINER_STARTED = 'setup.joiner.started';
const CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE =
  'setup.cluster.waiting-active';
const CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE = 'setup.cluster.active';
const CLUSTER_STAGE_LOAD_READINESS_WAITING = 'scenario.load-readiness.waiting';
const CLUSTER_STAGE_LOAD_READINESS_STABLE = 'scenario.load-readiness.stable';
const STARTUP_GATE_STATE_SEED_LIVE = 'seed_live';
const STARTUP_GATE_STATE_SEED_JOIN_READY = 'seed_join_ready';
const STARTUP_GATE_STATE_CLUSTER_ACTIVE = 'cluster_active';
const STARTUP_GATE_STATE = Object.freeze({
  SEED_LIVE: STARTUP_GATE_STATE_SEED_LIVE,
  SEED_JOIN_READY: STARTUP_GATE_STATE_SEED_JOIN_READY,
  CLUSTER_ACTIVE: STARTUP_GATE_STATE_CLUSTER_ACTIVE,
});
const CLUSTER_READINESS_MODE_STARTUP = 'startup';
const CLUSTER_READINESS_MODE_LOAD = 'load';
const STARTUP_GATE_WAITING_EVENT_INTERVAL = 20;
const ACTIVE_WAIT_BLOCKER_HISTORY_MAX_ENTRIES = 12;
const ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS = Object.freeze({
  ELIGIBLE_NO_OPERATION: PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
  OPERATION_NO_TRANSITIONS:
    PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
  LEARNER_NEVER_PROMOTABLE:
    PRIORITY_RECOVERY_BLOCKER_REASON.LEARNER_NEVER_PROMOTABLE,
  RECOVERY_ELIGIBLE_EXCLUDED:
    PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
});
const READINESS_PHASE_RANK = Object.freeze({
  INIT: 0,
  CONTROL_READY: 1,
  JOIN_READY: 2,
  TRAFFIC_READY: 3,
  DEGRADED: 1,
});
const STARTUP_RECOVERY_STAGE_RANK_CONTROL_PLANE_RECOVERY_READY = 2;
const CONTROL_PLANE_QUIESCENCE_CRITICAL_TABLES = Object.freeze([
  TABLES.REPLICA_OPERATIONS,
  TABLES.SQL_TRANSACTIONS,
  TABLES.SQL_TRANSACTION_PARTICIPANTS,
  TABLES.SQL_WRITE_OPERATIONS,
]);
const CHAOS_FAULT_STATUS_INJECTED = 'injected';
const CHAOS_FAULT_STATUS_RECOVERED = 'recovered';
const CHAOS_RECOVERY_ACTIONS = new Set([
  'unpauseNode',
  'restartNode',
  'healPartition',
  'clearNetworkSlowdown',
  'releaseDiskPressure',
]);
const CLUSTER_STAGE_SETUP_LOG_SUB_STARTING = 'setup.logs.subscription.starting';
const CLUSTER_STAGE_SETUP_LOG_SUB_READY = 'setup.logs.subscription.ready';
const CLUSTER_STAGE_SETUP_LOG_SUB_FAILED = 'setup.logs.subscription.failed';
const CLUSTER_STAGE_TEARDOWN_STARTING = 'teardown.starting';
const CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVING = 'teardown.network.removing';
const CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVED = 'teardown.network.removed';
const CLUSTER_STAGE_TEARDOWN_CAPTURE_FINALIZING = 'teardown.capture.finalizing';
const CLUSTER_STAGE_TEARDOWN_COMPLETE = 'teardown.complete';
const CLUSTER_CONFIG_DOCKER_OPERATION_SINK = 'dockerOperationSink';
const PROCESS_EVENT_EXIT = 'exit';
const PROCESS_EVENT_SIGINT = 'SIGINT';
const PROCESS_EVENT_SIGTERM = 'SIGTERM';
const PROCESS_EVENT_UNCAUGHT_EXCEPTION = 'uncaughtException';
const PROCESS_SIGNAL_EVENTS = Object.freeze([
  PROCESS_EVENT_SIGINT,
  PROCESS_EVENT_SIGTERM,
]);
const PROCESS_CLEANUP_REGISTRY = new Map();

/**
 * Classify one chaos action as fault injection or recovery.
 * @param {string} action
 * @return {string}
 */
function resolveChaosFaultStatus(action) {
  if (CHAOS_RECOVERY_ACTIONS.has(action)) {
    return CHAOS_FAULT_STATUS_RECOVERED;
  }
  return CHAOS_FAULT_STATUS_INJECTED;
}

function inspectLocalBenchmarkAdmissionFromDiscovery(
  discoverySnapshot,
  localNodeId,
) {
  const buildEmptyInspection = () => ({
    localReplicaSeen: false,
    localAdmissionReady: false,
    loadLaneProbeEligible: false,
    readyNodeId: '',
    routingReady: false,
    schemaReady: false,
    topologyReady: false,
    localReplicaRole: BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_UNKNOWN,
    localReplicaVoterReady: false,
    leadershipStable: false,
    degradationState: BENCHMARK_ADMISSION_DEGRADATION_STATE_HEALTHY,
    degradedByOperationIds: [],
    discoveryReasonDetails: [],
    discoveryReasonCodes: [],
  });
  const normalizedLocalNodeId = String(localNodeId || '');
  if (normalizedLocalNodeId.length === ZERO) {
    return buildEmptyInspection();
  }
  const rows = Array.isArray(discoverySnapshot?.rows) ?
    discoverySnapshot.rows :
    [];
  const firstRow =
    rows.length > ZERO && rows[ZERO] && typeof rows[ZERO] === 'object' ?
      rows[ZERO] :
      null;
  if (!firstRow) {
    return buildEmptyInspection();
  }

  const services = Array.isArray(firstRow[SERVICE_DISCOVERY_SERVICES_FIELD]) ?
    firstRow[SERVICE_DISCOVERY_SERVICES_FIELD] :
    [];
  for (const service of services) {
    if (!service || typeof service !== 'object') {
      continue;
    }
    const protocol = String(
      service[SERVICE_DISCOVERY_SERVICE_PROTOCOL_FIELD] || '',
    );
    if (protocol !== NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL) {
      continue;
    }
    const serviceIds = Array.isArray(
      service[SERVICE_DISCOVERY_SERVICE_IDS_FIELD],
    ) ?
      service[SERVICE_DISCOVERY_SERVICE_IDS_FIELD] :
      [];
    if (!serviceIds.includes(NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE)) {
      continue;
    }
    const replicas = Array.isArray(service[SERVICE_DISCOVERY_REPLICAS_FIELD]) ?
      service[SERVICE_DISCOVERY_REPLICAS_FIELD] :
      [];
    for (const replica of replicas) {
      if (!replica || typeof replica !== 'object') {
        continue;
      }
      const nodeId = String(
        replica[SERVICE_DISCOVERY_REPLICA_NODE_ID_FIELD] || '',
      );
      if (nodeId !== normalizedLocalNodeId) {
        continue;
      }
      const benchmarkAdmission =
        replica[SERVICE_DISCOVERY_REPLICA_BENCHMARK_ADMISSION_FIELD];
      if (benchmarkAdmission && typeof benchmarkAdmission === 'object') {
        const routingReady =
          benchmarkAdmission[
            SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD
          ] === true;
        const schemaReady =
          benchmarkAdmission[
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_SCHEMA_READY_FIELD
          ] === true;
        const topologyReady =
          benchmarkAdmission[
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_TOPOLOGY_READY_FIELD
          ] === true;
        const localReplicaRole = String(
          benchmarkAdmission[
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_FIELD
          ] || '',
        ).toLowerCase();
        const localReplicaVoterReady =
          LOAD_LANE_VOTER_READY_REPLICA_ROLES.has(localReplicaRole);
        const discoveryReasonDetails = normalizeDiscoveryReasons(
          benchmarkAdmission[
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_REASONS_FIELD
          ],
        );
        const admissionState = String(
          benchmarkAdmission[
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_STATE_FIELD
          ] || '',
        ).toLowerCase();
        const degradationState =
          String(
            benchmarkAdmission[
              SERVICE_DISCOVERY_BENCHMARK_ADMISSION_DEGRADATION_STATE_FIELD
            ] || BENCHMARK_ADMISSION_DEGRADATION_STATE_HEALTHY,
          ).trim() || BENCHMARK_ADMISSION_DEGRADATION_STATE_HEALTHY;
        const degradedByOperationIds = Array.isArray(
          benchmarkAdmission[
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_DEGRADED_BY_OPERATION_IDS_FIELD
          ],
        ) ?
          [
            ...new Set(
              benchmarkAdmission[
                SERVICE_DISCOVERY_BENCHMARK_ADMISSION_DEGRADED_BY_OPERATION_IDS_FIELD
              ].map((operationId) => String(operationId || '').trim()).filter(
                (operationId) => operationId.length > ZERO,
              ),
            ),
          ] :
          [];
        const reasonCodes = normalizeDiscoveryReasonCodes(
          discoveryReasonDetails,
        );
        const leadershipStable = !reasonCodes.includes(
          BENCHMARK_ADMISSION_REASON_LEADERSHIP_UNSTABLE,
        );
        if (
          admissionState === SERVICE_DISCOVERY_BENCHMARK_ADMISSION_STATE_READY
        ) {
          return {
            localReplicaSeen: true,
            localAdmissionReady: true,
            loadLaneProbeEligible: true,
            readyNodeId: normalizedLocalNodeId,
            routingReady,
            schemaReady,
            topologyReady,
            localReplicaRole:
              localReplicaRole.length > ZERO ?
                localReplicaRole :
                BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_UNKNOWN,
            localReplicaVoterReady,
            leadershipStable,
            degradationState,
            degradedByOperationIds,
            discoveryReasonDetails,
            discoveryReasonCodes: reasonCodes,
          };
        }
        const topologyDeferredCandidateReasons =
          localReplicaVoterReady || localReplicaRole.length === ZERO ?
            reasonCodes :
            [...reasonCodes, 'local_replica_not_voter_ready'];
        const topologyDeferredEligible =
          reasonCodes.every((code) =>
            LOAD_LANE_SOFT_ADMISSION_REASON_CODES.has(code),
          ) &&
          shouldPreserveTopologyDeferredAdmission({
            requiresConfirmation: true,
            evaluation: {
              ready: false,
              hasAdmission: true,
              reasons: topologyDeferredCandidateReasons,
              admissionState: {
                routingReady,
                schemaReady,
                topologyReady,
              },
            },
          });
        if (!topologyDeferredEligible) {
          return {
            localReplicaSeen: true,
            localAdmissionReady: false,
            loadLaneProbeEligible: false,
            readyNodeId: '',
            routingReady,
            schemaReady,
            topologyReady,
            localReplicaRole:
              localReplicaRole.length > ZERO ?
                localReplicaRole :
                BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_UNKNOWN,
            localReplicaVoterReady,
            leadershipStable,
            degradationState,
            degradedByOperationIds,
            discoveryReasonDetails,
            discoveryReasonCodes: reasonCodes,
          };
        }
        return {
          localReplicaSeen: true,
          localAdmissionReady: false,
          loadLaneProbeEligible: true,
          readyNodeId: '',
          routingReady,
          schemaReady,
          topologyReady,
          localReplicaRole:
            localReplicaRole.length > ZERO ?
              localReplicaRole :
              BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_UNKNOWN,
          localReplicaVoterReady,
          leadershipStable,
          degradationState,
          degradedByOperationIds,
          discoveryReasonDetails,
          discoveryReasonCodes: topologyDeferredCandidateReasons,
        };
      }
      const readiness = replica[SERVICE_DISCOVERY_REPLICA_READINESS_FIELD];
      const localAdmissionReady =
        readiness &&
        typeof readiness === 'object' &&
        readiness[SERVICE_DISCOVERY_READINESS_BENCHMARK_READY_FIELD] === true;
      return {
        localReplicaSeen: true,
        localAdmissionReady,
        loadLaneProbeEligible: localAdmissionReady,
        readyNodeId: localAdmissionReady ? normalizedLocalNodeId : '',
        routingReady: localAdmissionReady,
        schemaReady: localAdmissionReady,
        topologyReady: localAdmissionReady,
        localReplicaRole: BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_UNKNOWN,
        localReplicaVoterReady: false,
        leadershipStable: localAdmissionReady,
        degradationState: BENCHMARK_ADMISSION_DEGRADATION_STATE_HEALTHY,
        degradedByOperationIds: [],
        discoveryReasonDetails: [],
        discoveryReasonCodes: [],
      };
    }
  }

  return buildEmptyInspection();
}

function resolveLocalBenchmarkReadyNodeIdFromDiscovery(
  discoverySnapshot,
  localNodeId,
) {
  const inspection = inspectLocalBenchmarkAdmissionFromDiscovery(
    discoverySnapshot,
    localNodeId,
  );
  return inspection.localAdmissionReady === true ?
    inspection.readyNodeId :
    null;
}

function normalizeDiscoveryReasons(reasons) {
  const normalizedReasons = [];
  const seenReasons = new Set();
  for (const reason of Array.isArray(reasons) ? reasons : []) {
    const code = String(reason?.code || '').trim();
    if (code.length <= ZERO) {
      continue;
    }
    const detail =
      typeof reason?.detail === 'string' ? reason.detail.trim() : '';
    const dedupeKey = code + ':' + detail;
    if (seenReasons.has(dedupeKey)) {
      continue;
    }
    seenReasons.add(dedupeKey);
    normalizedReasons.push({
      code,
      detail,
    });
  }
  return normalizedReasons;
}

function normalizeDiscoveryReasonCodes(reasons) {
  return normalizeDiscoveryReasons(reasons).map((reason) => reason.code);
}

function normalizeBenchmarkAdmissionReasonCodes(reasonCodes) {
  return Array.isArray(reasonCodes) ?
    [
      ...new Set(
        reasonCodes
          .map((reasonCode) => {
            const normalizedReasonCode = String(reasonCode || '').trim();
            if (normalizedReasonCode.length <= ZERO) {
              return '';
            }
            const detailBoundary = normalizedReasonCode.indexOf(
              BENCHMARK_ADMISSION_REASON_DETAIL_SEPARATOR,
            );
            if (detailBoundary <= ZERO) {
              return normalizedReasonCode;
            }
            return normalizedReasonCode.slice(ZERO, detailBoundary).trim();
          })
          .filter((reasonCode) => reasonCode.length > ZERO),
      ),
    ] :
    [];
}

function collectBenchmarkAdmissionReasonCodes(...reasonCodeGroups) {
  const combinedReasonCodes = [];
  for (const reasonCodeGroup of reasonCodeGroups) {
    if (Array.isArray(reasonCodeGroup)) {
      combinedReasonCodes.push(...reasonCodeGroup);
      continue;
    }
    if (typeof reasonCodeGroup === 'string' && reasonCodeGroup.length > ZERO) {
      combinedReasonCodes.push(reasonCodeGroup);
    }
  }
  return normalizeBenchmarkAdmissionReasonCodes(combinedReasonCodes);
}

function normalizeBenchmarkAdmissionRetryAfterMs(value) {
  const retryAfterMs = Number(value);
  if (!Number.isFinite(retryAfterMs) || retryAfterMs <= ZERO) {
    return ZERO;
  }
  return Math.floor(retryAfterMs);
}

function extractBenchmarkAdmissionReasonCodesFromError(error) {
  const explicitReasonCodes = normalizeBenchmarkAdmissionReasonCodes(
    Array.isArray(error?.reasonCodes) ?
      error.reasonCodes :
      typeof error?.reasonCode === 'string' ?
        [error.reasonCode] :
        [],
  );
  if (explicitReasonCodes.length > ZERO) {
    return explicitReasonCodes;
  }
  const message = String(error?.message || error || '');
  const reasonMatch = message.match(BENCHMARK_ADMISSION_REASONS_PATTERN);
  if (!reasonMatch || typeof reasonMatch[1] !== 'string') {
    return [];
  }
  return normalizeBenchmarkAdmissionReasonCodes(
    reasonMatch[1].split(BENCHMARK_ADMISSION_REASON_SEPARATOR),
  );
}

function buildBenchmarkAdmissionProbeSql(tableName) {
  const normalizedTableName =
    typeof tableName === 'string' ? tableName.trim() : '';
  if (!IDENTIFIER_PATTERN.test(normalizedTableName)) {
    return null;
  }
  return (
    BENCHMARK_ADMISSION_PROBE_SQL_PREFIX +
    normalizedTableName +
    BENCHMARK_ADMISSION_PROBE_SQL_SUFFIX
  );
}

function isRetryableBenchmarkAdmissionError(error) {
  if (isRetryableControlPlaneError(error)) {
    return true;
  }
  const message = String(error?.message || error || '');
  if (BENCHMARK_ADMISSION_RETRYABLE_ERROR_PATTERN.test(message)) {
    return true;
  }
  return String(error?.code || '').toUpperCase() === 'ETIMEDOUT';
}

async function verifyBenchmarkLoadLaneAdmission(node, probeSql, timeoutMs) {
  if (!probeSql || typeof node?.queryWithTimeout !== 'function') {
    return {
      admissionReady: true,
      reasonCodes: [],
      retryAfterMs: ZERO,
    };
  }
  try {
    await node.queryWithTimeout(probeSql, [], {
      lane: ADMIN_SOCKET_LANE_LOAD,
      timeoutMs,
    });
    return {
      admissionReady: true,
      reasonCodes: [],
      retryAfterMs: ZERO,
    };
  } catch (error) {
    const reasonCodes = extractBenchmarkAdmissionReasonCodesFromError(error);
    return {
      admissionReady: false,
      reasonCodes:
        reasonCodes.length > ZERO ?
          reasonCodes :
          [BENCHMARK_LOAD_ADMISSION_REASON_LOAD_LANE_DENIED],
      retryAfterMs: normalizeBenchmarkAdmissionRetryAfterMs(
        error?.retryAfterMs,
      ),
    };
  }
}
const DOCKER_HOST_CONFIG_BINDS_KEY = 'Binds';
const CONTAINER_RUNNING_STATUS = 'running';
const REUSE_NETWORK_NAME_SUFFIX = 'reuse-local';
const REUSE_NODE_ID_PREFIX = 'reuse-node-';
const REUSE_NODE_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const REUSE_CONTAINER_NAME_PREFIX = 'ddb-test-reuse';
const REUSE_ENTRYPOINT = Object.freeze(['sh', '-lc']);
const REUSE_CONTROL_DIRNAME = 'reuse-control';
const REUSE_CONTROL_MOUNT_PATH = '/harness-control';
const REUSE_RESET_FLAG_FILENAME = 'reset-data-on-start';
const REUSE_START_COMMAND =
  'if [ -f ' +
  REUSE_CONTROL_MOUNT_PATH +
  '/' +
  REUSE_RESET_FLAG_FILENAME +
  ' ]; then rm -rf /data/* && rm -f ' +
  REUSE_CONTROL_MOUNT_PATH +
  '/' +
  REUSE_RESET_FLAG_FILENAME +
  '; fi; exec node --max-old-space-size=1536 /app/src/index.js';
const REUSE_START_COMMAND_ARGS = Object.freeze([REUSE_START_COMMAND]);
const REUSE_LEASE_DIRNAME = '.tmp';
const REUSE_LEASE_FILE_PREFIX = 'distributed-harness-reuse';
const REUSE_LEASE_POLL_INTERVAL_MS = 250;
const REUSE_LEASE_MIN_TIMEOUT_MS = 5000;
const REUSE_CLUSTER_LEASE_ERROR_CODE = Object.freeze({
  TIMEOUT: 'REUSE_CLUSTER_LEASE_TIMEOUT',
  ALREADY_HELD: 'REUSE_CLUSTER_LEASE_ALREADY_HELD',
});
const CONTAINER_STOP_ALREADY_STOPPED_PATTERN = 'already stopped';
const CONTAINER_STOP_NOT_RUNNING_PATTERN = 'is not running';
const CONTAINER_STOP_NOT_FOUND_PATTERN = 'no such container';
const ADMIN_SOCKET_LANE_DEFAULT = 'default';
const ADMIN_SOCKET_LANE_PROBE = 'probe';
const ADMIN_SOCKET_LANE_SNAPSHOT = 'snapshot';
const ADMIN_QUERY_TRACE_MAX_ENTRIES = 64;
const ADMIN_QUERY_TRACE_SQL_PREVIEW_MAX_LENGTH = 160;
const ADMIN_QUERY_TRACE_SQL_FINGERPRINT_LENGTH = 16;
const ADMIN_QUERY_TRACE_NORMALIZE_PATTERN = /\s+/g;
const ADMIN_QUERY_TRACE_UNKNOWN = 'unknown';
const ADMIN_QUERY_TRACE_OUTCOME_PENDING = 'pending';
const ADMIN_QUERY_TRACE_OUTCOME_OK = 'ok';
const ADMIN_QUERY_TRACE_OUTCOME_ERROR = 'error';
const ADMIN_QUERY_TRACE_OUTCOME_TIMEOUT = 'timeout';
const BENCHMARK_ADMISSION_RETRYABLE_ERROR_PATTERN =
  /timeout|timed out|deadline exceeded|etimedout/i;
const BENCHMARK_ADMISSION_REASONS_PATTERN = /reasons=([^)]+)/i;
const BENCHMARK_ADMISSION_REASON_SEPARATOR = ',';
const BENCHMARK_ADMISSION_REASON_DETAIL_SEPARATOR = '=';
const ADMIN_QUERY_TRACE_ERROR_UNKNOWN = 'unknown admin query error';
const ERROR_MESSAGE_TIMEOUT_FRAGMENT = 'timed out';

/**
 * Simple HTTP request with timeout using node:http.
 * Returns the status code, or -1 on error/timeout.
 */
function httpRequest(options = {}) {
  const url = String(options.url || '');
  const timeoutMs = Number(options.timeoutMs) || 0;
  const method =
    typeof options.method === 'string' ? options.method : HTTP_METHOD_GET;
  const includeBody = options.includeBody === true;
  const hasBody = options.body !== undefined && options.body !== null;
  const payload = hasBody ? JSON.stringify(options.body) : null;
  const headers = hasBody ?
    {
      [HTTP_HEADER_CONTENT_TYPE]: HTTP_CONTENT_TYPE_JSON,
      [HTTP_HEADER_CONTENT_LENGTH]: Buffer.byteLength(payload),
    } :
    undefined;

  return new Promise((resolve) => {
    const resolveError = () => {
      if (includeBody) {
        resolve({
          status: HTTP_ERROR_STATUS,
          body: null,
        });
        return;
      }
      resolve(HTTP_ERROR_STATUS);
    };
    const onResponse = (res) => {
      if (!includeBody) {
        res.resume();
        resolve(res.statusCode);
        return;
      }

      if (
        typeof res.setEncoding !== 'function' ||
        typeof res.on !== 'function'
      ) {
        if (typeof res.resume === 'function') {
          res.resume();
        }
        resolve({
          status: res.statusCode,
          body: null,
        });
        return;
      }

      let rawBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        rawBody += chunk;
      });
      res.on('end', () => {
        let parsedBody = null;
        if (rawBody.length > 0) {
          try {
            parsedBody = JSON.parse(rawBody);
          } catch (_parseError) {
            parsedBody = null;
          }
        }
        resolve({
          status: res.statusCode,
          body: parsedBody,
        });
      });
    };
    const requestOptions = {
      timeout: timeoutMs,
      headers,
    };
    const useGetRequest = method === HTTP_METHOD_GET && !hasBody;
    const req = useGetRequest ?
      http.get(url, requestOptions, onResponse) :
      http.request(
        url,
        {
          ...requestOptions,
          method,
        },
        onResponse,
      );
    req.on('error', resolveError);
    req.on('timeout', () => {
      req.destroy();
      resolveError();
    });
    if (payload !== null) {
      req.write(payload);
    }
    if (!useGetRequest) {
      req.end();
    }
  });
}

/**
 * Simple HTTP GET with timeout using node:http.
 * Returns the status code, or -1 on error/timeout.
 */
function httpGet(url, timeoutMs) {
  return httpRequest({
    url,
    timeoutMs,
    method: HTTP_METHOD_GET,
  });
}

/**
 * Resolve a timeout override while enforcing a positive integer value.
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
function resolvePositiveTimeoutMs(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_TIMEOUT_MS) {
    return fallback;
  }
  return Math.floor(parsed);
}

/**
 * Reserve a fair share of one remaining deadline for sequential probes so late
 * nodes do not inherit a nearly exhausted per-node timeout budget.
 * @param {number} deadline
 * @param {number} remainingProbeCount
 * @param {number} maxTimeoutMs
 * @returns {number}
 */
function resolveSequentialProbeTimeoutMs(
  deadline,
  remainingProbeCount,
  maxTimeoutMs,
) {
  const normalizedRemainingProbeCount =
    Number.isInteger(remainingProbeCount) && remainingProbeCount > ZERO ?
      remainingProbeCount :
      ONE;
  const remainingBudgetMs = Math.max(
    MIN_TIMEOUT_MS,
    Math.floor(Number(deadline) - Date.now()),
  );
  const fairShareTimeoutMs = Math.max(
    MIN_TIMEOUT_MS,
    Math.floor(remainingBudgetMs / normalizedRemainingProbeCount),
  );
  return Math.min(
    Math.max(MIN_TIMEOUT_MS, Math.floor(maxTimeoutMs || MIN_TIMEOUT_MS)),
    fairShareTimeoutMs,
  );
}

export const CLUSTER_SEGMENT_1 = {
  uuidv4,
  uuidv5,
  createHash,
  fs,
  dirname,
  resolvePath,
  DockerProvider,
  ChaosPrimitives,
  LoadGenerator,
  LogCollector,
  LogAnalyzer,
  PlaybackRecorder,
  TraceArtifactRecorder,
  buildBenchmarkCriticalControlPlaneStabilitySnapshot,
  BENCHMARK_LOAD_ADMISSION_REASON_DISCOVERY_PRESSURED,
  BENCHMARK_LOAD_ADMISSION_REASON_PUBLICATION_EPOCH_MISMATCH,
  BENCHMARK_LOAD_ADMISSION_REASON_RECOVERY_GATE_CLOSED,
  buildBenchmarkLoadAdmissionEvaluation,
  buildBenchmarkLoadAdmissionSnapshot,
  buildServiceDiscoverySql,
  buildPublicationRecoveryGateSnapshot,
  buildActiveGateWaitPolicy,
  waitForConvergence,
  assertConsistency,
  waitForConsistencyConvergence,
  assertDataIntegrity,
  summarizeInvariantBreaches,
  STARTUP_ADMISSION_STATE,
  INVARIANT_SEVERITY,
  classifyActiveGateClosureWitness,
  classifyActiveGateReadinessDelay,
  canProjectStartupActiveFromTransientAdmin,
  isTimeoutShapedProbeError,
  BENCHMARK_DEFAULTS,
  PORTS,
  TIMEOUTS,
  LABELS,
  CONTAINER_ENV_KEYS,
  PARTITION_ENV_KEYS,
  NETWORK,
  NODE_ROLES,
  PLAYBACK_EVENT_TYPE,
  LOG_SUBSCRIPTION_CAPABILITY,
  RAFT_PROVIDER_DEFAULTS,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_ADMIN_META,
  CONTAINER_LOG_TAIL_LINES,
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
  BOOTSTRAP_POLL_INTERVAL_MS,
  ACTIVE_POLL_INTERVAL_MS,
  RESTART_POLL_INTERVAL_MS,
  LOAD_READINESS_STABLE_WINDOW_MS,
  LOAD_READINESS_STABILITY_TIMEOUT_MS,
  BOOTSTRAP_PROGRESS_TIMEOUT_MAX_MULTIPLIER,
  ACTIVE_WAIT_MIN_CLUSTER_SIZE,
  ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_PER_EXTRA_NODE,
  ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_DENOMINATOR,
  ACTIVE_WAIT_TIMEOUT_MAX_MULTIPLIER,
  ACTIVE_STATE,
  INACTIVE_STATE,
  UNKNOWN_STATE,
  UNKNOWN_PHASE,
  UNKNOWN_REASON,
  DATA_DIR_PATH,
  ZERO,
  ONE,
  MIN_TIMEOUT_MS,
  CONTROL_SNAPSHOT_LATE_PROBE_TIMEOUT_FLOOR_MS,
  CONTROL_SNAPSHOT_LATE_REACHABILITY_TIMEOUT_FLOOR_MS,
  HTTP_OK_LOWER,
  HTTP_OK_UPPER,
  FETCH_TIMEOUT_MS,
  CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
  CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS,
  CLUSTER_ACTIVE_NODE_PROBE_TIMEOUT_MS,
  BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS,
  BOOTSTRAP_READY_STABLE_WINDOW_MS,
  ADMIN_QUERY_TIMEOUT_MS,
  LOG_COLLECTION_TIMEOUT_MS,
  BOOTSTRAP_HEALTH_PATH,
  BOOTSTRAP_JOIN_READY_PATH,
  BOOTSTRAP_TRAFFIC_READY_PATH,
  ADMIN_HEALTH_PATH,
  ADMIN_STREAM_PATH,
  HTTP_METHOD_GET,
  HTTP_HEADER_CONTENT_TYPE,
  HTTP_HEADER_CONTENT_LENGTH,
  HTTP_CONTENT_TYPE_JSON,
  HTTP_ERROR_STATUS,
  JOINING_HTTP_TIMEOUT_ENV_KEY,
  JOINING_LEADERSHIP_WAIT_TIMEOUT_ENV_KEY,
  JOINING_HTTP_TIMEOUT_DEFAULT_MS,
  JOINING_LEADERSHIP_WAIT_TIMEOUT_DEFAULT_MS,
  WS_HOST_ENV_KEY,
  WS_BIND_ALL_HOST,
  RAFT_PROVIDER_ENV_KEY,
  NODE_OPTIONS_ENV_KEY,
  NODE_OPTION_HEAP_PROF,
  NODE_OPTION_HEAP_SNAPSHOT_NEAR_LIMIT_PREFIX,
  HEAP_SNAPSHOT_NEAR_LIMIT_MIN_COUNT,
  HEAP_SNAPSHOT_NEAR_LIMIT_DEFAULT_COUNT,
  CONTROL_SNAPSHOT_OBSERVATION_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED,
  CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FAILED,
  QUERY_MESSAGE_TYPE,
  PARTITION_CALLBACK_MESSAGE_TYPE,
  QUERY_RESULT_MESSAGE_TYPE,
  CDC_EVENT_MESSAGE_TYPE,
  LIVE_QUERY_EVENT_MESSAGE_TYPE,
  LIVE_QUERY_INITIAL_MESSAGE_TYPE,
  LOGS_TABLE_NAME,
  QUIESCENCE_REASON_IN_FLIGHT_PREFIX,
  QUIESCENCE_REASON_LEADERSHIP_PREFIX,
  QUIESCENCE_REASON_SNAPSHOT_ERROR_PREFIX,
  QUIESCENCE_REASON_CRITICAL_SYSTEM_SPREAD_PREFIX,
  REACHABILITY_PROBE_SQL,
  REACHABILITY_SOURCE_BOOTSTRAP_HEALTH,
  REACHABILITY_SOURCE_ADMIN_HEALTH,
  REACHABILITY_SOURCE_ADMIN_WS,
  REACHABILITY_SOURCE_SQL_PROBE,
  REACHABILITY_STATUS_HTTP,
  REACHABILITY_ERROR_UNKNOWN,
  IDENTIFIER_PATTERN,
  ADMIN_SOCKET_LANE_LOAD,
  BENCHMARK_ADMISSION_PROBE_SQL_PREFIX,
  BENCHMARK_ADMISSION_PROBE_SQL_SUFFIX,
  ACTIVE_PROBE_REASON_ADMIN_NOT_READY,
  ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX,
  ACTIVE_PROBE_REASON_PUBLICATION_CONVERGENCE_MISSING,
  ACTIVE_PROBE_REASON_PUBLICATION_NOT_PUBLISHED_PREFIX,
  ACTIVE_PROBE_REASON_PUBLICATION_PENDING_ACK_PREFIX,
  ACTIVE_PROBE_REASON_PUBLICATION_MISSING_ACTIVE_NODE_PREFIX,
  ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING,
  ACTIVE_PROBE_REASON_PRIORITY_RECOVERY_PENDING,
  STARTUP_ADMISSION_STATE_STRONG_ACTIVE,
  STARTUP_ADMISSION_STATE_DEGRADED,
  STARTUP_ADMISSION_STATE_BLOCKED,
  ACTIVE_PROBE_REASON_CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK,
  ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
  ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_SNAPSHOT_PROJECTION,
  ACTIVE_PROBE_ACTIVITY_SOURCE_LOAD_PUBLICATION_GATE_PROJECTION,
  ACTIVE_PROBE_REASON_LOAD_PUBLICATION_GATE_READY,
  ACTIVE_PROBE_REASON_STARTUP_SNAPSHOT_READY,
  ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_BOOTSTRAP_JOIN_DURING_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_TRAFFIC_GATE_DURING_PRIORITY_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_BOOTSTRAP_JOIN_DURING_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_TRAFFIC_GATE_DURING_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
  ACTIVE_WAIT_NO_PROGRESS_CLASS_CODE,
  ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
  ACTIVE_WAIT_INVARIANT_BREACH_REASON_CODE,
  ACTIVE_WAIT_INACTIVE_SUMMARY_ERROR_PREFIX,
  ACTIVE_WAIT_INACTIVE_SUMMARY_STATE_PREFIX,
  ACTIVE_WAIT_BLOCKER_INACTIVE_NODES_PREFIX,
  ACTIVE_WAIT_BLOCKER_SNAPSHOT_COVERAGE_PREFIX,
  ACTIVE_WAIT_BLOCKER_SNAPSHOT_ERROR,
  ACTIVE_WAIT_BLOCKER_PUBLICATION_GATE_PREFIX,
  ACTIVE_WAIT_BLOCKER_PRIORITY_RECOVERY_PROGRESS_CLASS_PREFIX,
  ACTIVE_WAIT_BLOCKER_READY,
  ACTIVE_WAIT_BLOCKER_NONE,
  ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED,
  ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING,
  ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHING,
  ACTIVE_WAIT_PUBLICATION_STATUS_PREPARED,
  ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX,
  ACTIVE_WAIT_STALLED_MESSAGE_PREFIX,
  ACTIVE_WAIT_INVARIANT_BREACH_MESSAGE_PREFIX,
  STATUS_ACTIVE_LOWER,
  WS_READY_STATE_OPEN,
  WS_READY_STATE_CONNECTING,
  PLAYBACK_SCOPE_CLUSTER,
  PLAYBACK_SCOPE_NODE,
  PLAYBACK_SCOPE_CHAOS,
  PLAYBACK_SCOPE_LOAD,
  PLAYBACK_ENTITY_CLUSTER,
  LOAD_RUN_ENTITY,
  LOAD_PROGRESS_INTERVAL_MS,
  CONTROL_SNAPSHOT_NODES_FIELD,
  CONTROL_SNAPSHOT_REVISION_FIELD,
  CONTROL_SNAPSHOT_REVISION_STATE_FIELD,
  CONTROL_SNAPSHOT_EXPECTED_MINIMUM_REVISION_FIELD,
  CONTROL_SNAPSHOT_REVISION_GAP_FIELD,
  CONTROL_SNAPSHOT_RESUME_TOKEN_FIELD,
  CONTROL_SNAPSHOT_READINESS_DIMENSION_CLUSTER_MEMBER_HEALTHY,
  SERVICE_DISCOVERY_SERVICES_FIELD,
  SERVICE_DISCOVERY_SERVICE_PROTOCOL_FIELD,
  SERVICE_DISCOVERY_SERVICE_IDS_FIELD,
  SERVICE_DISCOVERY_REPLICAS_FIELD,
  SERVICE_DISCOVERY_REPLICA_NODE_ID_FIELD,
  SERVICE_DISCOVERY_REPLICA_SERVICE_ID_FIELD,
  SERVICE_DISCOVERY_REPLICA_READINESS_FIELD,
  SERVICE_DISCOVERY_REPLICA_BENCHMARK_ADMISSION_FIELD,
  SERVICE_DISCOVERY_READINESS_BENCHMARK_READY_FIELD,
  SERVICE_DISCOVERY_BENCHMARK_ADMISSION_STATE_FIELD,
  SERVICE_DISCOVERY_BENCHMARK_ADMISSION_STATE_READY,
  SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD,
  SERVICE_DISCOVERY_BENCHMARK_ADMISSION_SCHEMA_READY_FIELD,
  SERVICE_DISCOVERY_BENCHMARK_ADMISSION_TOPOLOGY_READY_FIELD,
  SERVICE_DISCOVERY_BENCHMARK_ADMISSION_REASONS_FIELD,
  SERVICE_DISCOVERY_BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_FIELD,
  SERVICE_DISCOVERY_BENCHMARK_ADMISSION_DEGRADATION_STATE_FIELD,
  SERVICE_DISCOVERY_BENCHMARK_ADMISSION_DEGRADED_BY_OPERATION_IDS_FIELD,
  BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_UNKNOWN,
  BENCHMARK_ADMISSION_DEGRADATION_STATE_HEALTHY,
  BENCHMARK_ADMISSION_REASON_LEADERSHIP_UNSTABLE,
  LOAD_LANE_SOFT_ADMISSION_REASON_CODES,
  LOAD_LANE_VOTER_READY_REPLICA_ROLES,
  CLUSTER_STAGE_SETUP_NETWORK_CREATING,
  CLUSTER_STAGE_SETUP_NETWORK_CREATED,
  CLUSTER_STAGE_SETUP_SEED_STARTING,
  CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING,
  CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_READY,
  CLUSTER_STAGE_SETUP_JOINER_STARTING,
  CLUSTER_STAGE_SETUP_JOINER_STARTED,
  CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
  CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE,
  CLUSTER_STAGE_LOAD_READINESS_WAITING,
  CLUSTER_STAGE_LOAD_READINESS_STABLE,
  STARTUP_GATE_STATE_SEED_LIVE,
  STARTUP_GATE_STATE_SEED_JOIN_READY,
  STARTUP_GATE_STATE_CLUSTER_ACTIVE,
  STARTUP_GATE_STATE,
  CLUSTER_READINESS_MODE_STARTUP,
  CLUSTER_READINESS_MODE_LOAD,
  STARTUP_GATE_WAITING_EVENT_INTERVAL,
  ACTIVE_WAIT_BLOCKER_HISTORY_MAX_ENTRIES,
  ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS,
  READINESS_PHASE_RANK,
  STARTUP_RECOVERY_STAGE_RANK_CONTROL_PLANE_RECOVERY_READY,
  CONTROL_PLANE_QUIESCENCE_CRITICAL_TABLES,
  CHAOS_FAULT_STATUS_INJECTED,
  CHAOS_FAULT_STATUS_RECOVERED,
  CHAOS_RECOVERY_ACTIONS,
  CLUSTER_STAGE_SETUP_LOG_SUB_STARTING,
  CLUSTER_STAGE_SETUP_LOG_SUB_READY,
  CLUSTER_STAGE_SETUP_LOG_SUB_FAILED,
  CLUSTER_STAGE_TEARDOWN_STARTING,
  CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVING,
  CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVED,
  CLUSTER_STAGE_TEARDOWN_CAPTURE_FINALIZING,
  CLUSTER_STAGE_TEARDOWN_COMPLETE,
  CLUSTER_CONFIG_DOCKER_OPERATION_SINK,
  PROCESS_EVENT_EXIT,
  PROCESS_EVENT_SIGINT,
  PROCESS_EVENT_SIGTERM,
  PROCESS_EVENT_UNCAUGHT_EXCEPTION,
  PROCESS_SIGNAL_EVENTS,
  PROCESS_CLEANUP_REGISTRY,
  resolveChaosFaultStatus,
  inspectLocalBenchmarkAdmissionFromDiscovery,
  resolveLocalBenchmarkReadyNodeIdFromDiscovery,
  normalizeDiscoveryReasons,
  normalizeDiscoveryReasonCodes,
  normalizeBenchmarkAdmissionReasonCodes,
  collectBenchmarkAdmissionReasonCodes,
  normalizeBenchmarkAdmissionRetryAfterMs,
  extractBenchmarkAdmissionReasonCodesFromError,
  buildBenchmarkAdmissionProbeSql,
  isRetryableBenchmarkAdmissionError,
  verifyBenchmarkLoadLaneAdmission,
  DOCKER_HOST_CONFIG_BINDS_KEY,
  CONTAINER_RUNNING_STATUS,
  REUSE_NETWORK_NAME_SUFFIX,
  REUSE_NODE_ID_PREFIX,
  REUSE_NODE_ID_NAMESPACE,
  REUSE_CONTAINER_NAME_PREFIX,
  REUSE_ENTRYPOINT,
  REUSE_CONTROL_DIRNAME,
  REUSE_CONTROL_MOUNT_PATH,
  REUSE_RESET_FLAG_FILENAME,
  REUSE_START_COMMAND,
  REUSE_START_COMMAND_ARGS,
  REUSE_LEASE_DIRNAME,
  REUSE_LEASE_FILE_PREFIX,
  REUSE_LEASE_POLL_INTERVAL_MS,
  REUSE_LEASE_MIN_TIMEOUT_MS,
  REUSE_CLUSTER_LEASE_ERROR_CODE,
  CONTAINER_STOP_ALREADY_STOPPED_PATTERN,
  CONTAINER_STOP_NOT_RUNNING_PATTERN,
  CONTAINER_STOP_NOT_FOUND_PATTERN,
  ADMIN_SOCKET_LANE_DEFAULT,
  ADMIN_SOCKET_LANE_PROBE,
  ADMIN_SOCKET_LANE_SNAPSHOT,
  ADMIN_QUERY_TRACE_MAX_ENTRIES,
  ADMIN_QUERY_TRACE_SQL_PREVIEW_MAX_LENGTH,
  ADMIN_QUERY_TRACE_SQL_FINGERPRINT_LENGTH,
  ADMIN_QUERY_TRACE_NORMALIZE_PATTERN,
  ADMIN_QUERY_TRACE_UNKNOWN,
  ADMIN_QUERY_TRACE_OUTCOME_PENDING,
  ADMIN_QUERY_TRACE_OUTCOME_OK,
  ADMIN_QUERY_TRACE_OUTCOME_ERROR,
  ADMIN_QUERY_TRACE_OUTCOME_TIMEOUT,
  BENCHMARK_ADMISSION_RETRYABLE_ERROR_PATTERN,
  BENCHMARK_ADMISSION_REASONS_PATTERN,
  BENCHMARK_ADMISSION_REASON_SEPARATOR,
  BENCHMARK_ADMISSION_REASON_DETAIL_SEPARATOR,
  ADMIN_QUERY_TRACE_ERROR_UNKNOWN,
  ERROR_MESSAGE_TIMEOUT_FRAGMENT,
  httpRequest,
  httpGet,
  resolvePositiveTimeoutMs,
  resolveSequentialProbeTimeoutMs,
};
