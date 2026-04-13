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
import {
  isRetryableControlPlaneError,
} from '../../../src/control-plane/control-plane-error-classification.js';
import {
  waitForConvergence,
  assertConsistency,
  waitForConsistencyConvergence,
  assertDataIntegrity,
} from './assertions.js';
import {summarizeInvariantBreaches} from './invariant-breaches.js';
import {LogCollector} from './log-collector.js';
import {LogAnalyzer} from './log-analyzer.js';
import {PlaybackRecorder} from './playback-recorder.js';
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
const CONTROL_SNAPSHOT_LATE_REACHABILITY_TIMEOUT_FLOOR_MS = 100;
const HTTP_OK_LOWER = 200;
const HTTP_OK_UPPER = 299;
const FETCH_TIMEOUT_MS = 1000;
const CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS = 3000;
const CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS = 500;
const CLUSTER_ACTIVE_NODE_PROBE_TIMEOUT_MS = 3000;
const BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS = 10000;
const BOOTSTRAP_READY_STABLE_WINDOW_MS = 2000;
const ADMIN_QUERY_TIMEOUT_MS = 15000;
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
const ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK =
  'status_query_fallback';
const ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS = 'bootstrap_readiness';
const ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS = 'traffic_readiness';
const ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION =
  'startup_admin_projection';
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
const SERVICE_DISCOVERY_READINESS_BENCHMARK_READY_FIELD =
  'benchmarkReady';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_STATE_FIELD = 'state';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_STATE_READY = 'ready';
const SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD = 'routingReady';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_REASONS_FIELD = 'reasons';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_FIELD =
  'localReplicaRole';
const SERVICE_DISCOVERY_BENCHMARK_ADMISSION_DEGRADED_BY_OPERATION_IDS_FIELD =
  'degradedByOperationIds';
const LOAD_LANE_SOFT_ADMISSION_REASON_CODES = new Set([
  'schema_partition_unavailable',
  'leadership_unstable',
]);
const LOAD_LANE_VOTER_READY_REPLICA_ROLES = new Set([
  'leader',
  'follower',
]);
const CLUSTER_STAGE_SETUP_NETWORK_CREATING = 'setup.network.creating';
const CLUSTER_STAGE_SETUP_NETWORK_CREATED = 'setup.network.created';
const CLUSTER_STAGE_SETUP_SEED_STARTING = 'setup.seed.starting';
const CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING =
  'setup.seed.bootstrap.waiting';
const CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_READY =
  'setup.seed.bootstrap.ready';
const CLUSTER_STAGE_SETUP_JOINER_STARTING = 'setup.joiner.starting';
const CLUSTER_STAGE_SETUP_JOINER_STARTED = 'setup.joiner.started';
const CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE =
  'setup.cluster.waiting-active';
const CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE = 'setup.cluster.active';
const CLUSTER_STAGE_LOAD_READINESS_WAITING =
  'scenario.load-readiness.waiting';
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
const CLUSTER_STAGE_TEARDOWN_CAPTURE_FINALIZING =
  'teardown.capture.finalizing';
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
let processCleanupHandlersRegistered = false;

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
  const normalizedLocalNodeId = String(localNodeId || '');
  if (normalizedLocalNodeId.length === ZERO) {
    return {
      localReplicaSeen: false,
      readyNodeId: null,
    };
  }
  const rows = Array.isArray(discoverySnapshot?.rows) ?
    discoverySnapshot.rows :
    [];
  const firstRow = rows.length > ZERO &&
    rows[ZERO] &&
    typeof rows[ZERO] === 'object' ?
    rows[ZERO] :
    null;
  if (!firstRow) {
    return {
      localReplicaSeen: false,
      readyNodeId: null,
    };
  }

  const services = Array.isArray(firstRow[SERVICE_DISCOVERY_SERVICES_FIELD]) ?
    firstRow[SERVICE_DISCOVERY_SERVICES_FIELD] :
    [];
  for (const service of services) {
    if (!service || typeof service !== 'object') {
      continue;
    }
    const protocol =
      String(service[SERVICE_DISCOVERY_SERVICE_PROTOCOL_FIELD] || '');
    if (protocol !== NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL) {
      continue;
    }
    const serviceIds = Array.isArray(service[SERVICE_DISCOVERY_SERVICE_IDS_FIELD]) ?
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
      if (benchmarkAdmission &&
          typeof benchmarkAdmission === 'object') {
        const routingReady = benchmarkAdmission[
          SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD
        ] === true;
        const localReplicaRole = String(
          benchmarkAdmission[
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_FIELD
          ] || '',
        ).toLowerCase();
        const localReplicaVoterReady =
          LOAD_LANE_VOTER_READY_REPLICA_ROLES.has(localReplicaRole);
        const admissionState = String(
          benchmarkAdmission[
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_STATE_FIELD
          ] || '',
        ).toLowerCase();
        if (admissionState ===
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_STATE_READY) {
          return {
            localReplicaSeen: true,
            readyNodeId: normalizedLocalNodeId,
          };
        }

        const reasonCodes = normalizeDiscoveryReasonCodes(
          benchmarkAdmission[
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_REASONS_FIELD
          ],
        );
        const topologyDeferredCandidateReasons = localReplicaVoterReady ||
          localReplicaRole.length === ZERO ?
          reasonCodes :
          [
            ...reasonCodes,
            'local_replica_not_voter_ready',
          ];
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
                schemaReady:
                  benchmarkAdmission.schemaReady === true,
                topologyReady:
                  benchmarkAdmission.topologyReady === true,
              },
            },
          });
        if (!topologyDeferredEligible) {
          return {
            localReplicaSeen: true,
            readyNodeId: null,
          };
        }
        const degradedByOperationIds = Array.isArray(
          benchmarkAdmission[
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_DEGRADED_BY_OPERATION_IDS_FIELD
          ],
        ) ?
          benchmarkAdmission[
            SERVICE_DISCOVERY_BENCHMARK_ADMISSION_DEGRADED_BY_OPERATION_IDS_FIELD
          ] :
          [];

        return {
          localReplicaSeen: true,
          readyNodeId: routingReady &&
            degradedByOperationIds.length === ZERO ?
            normalizedLocalNodeId :
            null,
        };
      }
      const readiness =
        replica[SERVICE_DISCOVERY_REPLICA_READINESS_FIELD];
      return {
        localReplicaSeen: true,
        readyNodeId: readiness &&
          typeof readiness === 'object' &&
          readiness[
            SERVICE_DISCOVERY_READINESS_BENCHMARK_READY_FIELD
          ] === true ?
          normalizedLocalNodeId :
          null,
      };
    }
  }

  return {
    localReplicaSeen: false,
    readyNodeId: null,
  };
}

function resolveLocalBenchmarkReadyNodeIdFromDiscovery(
  discoverySnapshot,
  localNodeId,
) {
  return inspectLocalBenchmarkAdmissionFromDiscovery(
    discoverySnapshot,
    localNodeId,
  ).readyNodeId;
}

function normalizeDiscoveryReasonCodes(reasons) {
  return Array.isArray(reasons) ?
    [...new Set(reasons
      .map((reason) => String(reason?.code || '').trim())
      .filter((code) => code.length > ZERO))] :
    [];
}

function buildBenchmarkAdmissionProbeSql(tableName) {
  const normalizedTableName = typeof tableName === 'string' ?
    tableName.trim() :
    '';
  if (!IDENTIFIER_PATTERN.test(normalizedTableName)) {
    return null;
  }
  return BENCHMARK_ADMISSION_PROBE_SQL_PREFIX +
    normalizedTableName +
    BENCHMARK_ADMISSION_PROBE_SQL_SUFFIX;
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
    return true;
  }
  try {
    await node.queryWithTimeout(probeSql, [], {
      lane: ADMIN_SOCKET_LANE_LOAD,
      timeoutMs,
    });
    return true;
  } catch (_error) {
    return false;
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
  'if [ -f ' + REUSE_CONTROL_MOUNT_PATH + '/' + REUSE_RESET_FLAG_FILENAME +
  ' ]; then rm -rf /data/* && rm -f ' +
  REUSE_CONTROL_MOUNT_PATH + '/' + REUSE_RESET_FLAG_FILENAME +
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
const ADMIN_QUERY_TRACE_ERROR_UNKNOWN = 'unknown admin query error';
const ERROR_MESSAGE_TIMEOUT_FRAGMENT = 'timed out';

/**
 * Simple HTTP request with timeout using node:http.
 * Returns the status code, or -1 on error/timeout.
 */
function httpRequest(options = {}) {
  const url = String(options.url || '');
  const timeoutMs = Number(options.timeoutMs) || 0;
  const method = typeof options.method === 'string' ?
    options.method :
    HTTP_METHOD_GET;
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

      if (typeof res.setEncoding !== 'function' ||
          typeof res.on !== 'function') {
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
      http.request(url, {
        ...requestOptions,
        method,
      }, onResponse);
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
  const normalizedRemainingProbeCount = Number.isInteger(remainingProbeCount) &&
    remainingProbeCount > ZERO ?
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

/**
 * Preserve a small but meaningful timeout floor for deadline-driven
 * observation probes so the last ACTIVE-wait attempt does not collapse into a
 * synthetic 1ms timeout classification.
 * @param {number} deadline
 * @param {number} maxTimeoutMs
 * @param {number} minimumTimeoutMs
 * @returns {number}
 */
function resolveMeaningfulProbeTimeoutMs(
  deadline,
  maxTimeoutMs,
  minimumTimeoutMs = MIN_TIMEOUT_MS,
) {
  const boundedMinimumTimeoutMs = resolvePositiveTimeoutMs(
    minimumTimeoutMs,
    MIN_TIMEOUT_MS,
  );
  const remainingBudgetMs = Math.max(
    boundedMinimumTimeoutMs,
    Math.floor(Number(deadline) - Date.now()),
  );
  return Math.min(
    Math.max(
      boundedMinimumTimeoutMs,
      Math.floor(maxTimeoutMs || boundedMinimumTimeoutMs),
    ),
    remainingBudgetMs,
  );
}

/**
 * Resolve/reject with timeout protection for potentially hanging operations.
 * @param {Promise<*>} promise
 * @param {number} timeoutMs
 * @param {string} timeoutMessage
 * @returns {Promise<*>}
 */
function withTimeout(promise, timeoutMs, timeoutMessage) {
  const boundedTimeoutMs = Math.max(MIN_TIMEOUT_MS, Number(timeoutMs) || 0);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(timeoutMessage));
    }, boundedTimeoutMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    Promise.resolve(promise)
      .then((result) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Format count-map entries as "key:value" pairs for diagnostic errors.
 * @param {Map<string|number, number>} counts
 * @returns {string}
 */
function formatCountSummary(counts) {
  return Array.from(counts.entries())
    .map(([key, count]) => String(key) + ':' + String(count))
    .join(', ');
}

/**
 * Format node diagnostics into compact "node=state" entries.
 * @param {Array<Object>} nodeDiagnostics
 * @returns {string}
 */
function formatNodeDiagnostics(nodeDiagnostics = []) {
  return nodeDiagnostics
    .map((diagnostic) => {
      const nodeId = String(diagnostic.nodeId || 'unknown-node');
      if (diagnostic.active === true) {
        return nodeId + '=active';
      }
      if (typeof diagnostic.error === 'string' &&
          diagnostic.error.length > 0) {
        return nodeId + '=error:' + diagnostic.error;
      }
      const stateValue = typeof diagnostic.state === 'string' &&
        diagnostic.state.length > 0 ?
        diagnostic.state :
        UNKNOWN_STATE;
      return nodeId + '=' + stateValue;
    })
    .join(', ');
}

/**
 * Format control snapshot coverage summary.
 * @param {Object|null} snapshotCoverage
 * @returns {string}
 */
function formatSnapshotCoverage(snapshotCoverage) {
  if (!snapshotCoverage || typeof snapshotCoverage !== 'object') {
    return 'none';
  }
  const expectedNodeCount = Number(snapshotCoverage.expectedNodeCount) || 0;
  const bestCoverageNodeCount = Number(snapshotCoverage.bestCoverageNodeCount) || 0;
  const selectedNodeId = typeof snapshotCoverage.selectedNodeId === 'string' &&
    snapshotCoverage.selectedNodeId.length > ZERO ?
    snapshotCoverage.selectedNodeId :
    null;
  const selectedCapturedAtMs = Number.isFinite(
    snapshotCoverage.selectedCapturedAtMs,
  ) ?
    Math.floor(snapshotCoverage.selectedCapturedAtMs) :
    null;
  const selectedAdminReady = snapshotCoverage.selectedAdminReady === true ?
    true :
    (snapshotCoverage.selectedAdminReady === false ? false : null);
  const selectedReachableBy =
    typeof snapshotCoverage.selectedReachableBy === 'string' &&
      snapshotCoverage.selectedReachableBy.length > ZERO ?
      snapshotCoverage.selectedReachableBy :
      null;
  const selectedReachabilityError =
    typeof snapshotCoverage.selectedReachabilityError === 'string' &&
      snapshotCoverage.selectedReachabilityError.length > ZERO ?
      snapshotCoverage.selectedReachabilityError :
      null;
  const selectedSnapshotTimeoutMs = Number.isFinite(
    snapshotCoverage.selectedSnapshotTimeoutMs,
  ) ?
    Math.max(MIN_TIMEOUT_MS, Math.floor(snapshotCoverage.selectedSnapshotTimeoutMs)) :
    null;
  const selectedReachabilityTimeoutMs = Number.isFinite(
    snapshotCoverage.selectedReachabilityTimeoutMs,
  ) ?
    Math.max(
      MIN_TIMEOUT_MS,
      Math.floor(snapshotCoverage.selectedReachabilityTimeoutMs),
    ) :
    null;
  const selectedPublicationConvergence =
    snapshotCoverage.selectedPublicationConvergence &&
      typeof snapshotCoverage.selectedPublicationConvergence === 'object' ?
      snapshotCoverage.selectedPublicationConvergence :
      null;
  const publicationEpoch = Number.isFinite(
    selectedPublicationConvergence?.publicationEpoch,
  ) ?
    Math.floor(selectedPublicationConvergence.publicationEpoch) :
    null;
  const publicationStatus = typeof selectedPublicationConvergence
    ?.publicationStatus === 'string' ?
    selectedPublicationConvergence.publicationStatus.toUpperCase() :
    null;
  const pendingAckCount = Array.isArray(
    selectedPublicationConvergence?.pendingAckNodeIds,
  ) ?
    selectedPublicationConvergence.pendingAckNodeIds.length :
    ZERO;
  const missingPublishedCount = Array.isArray(
    snapshotCoverage?.selectedMissingPublishedNodeIds,
  ) ?
    snapshotCoverage.selectedMissingPublishedNodeIds.length :
    ZERO;
  const prioritySpreadSatisfied =
    selectedPublicationConvergence?.priorityPartitionSummary &&
      typeof selectedPublicationConvergence.priorityPartitionSummary ===
        'object' ?
      selectedPublicationConvergence.priorityPartitionSummary.satisfied :
      null;
  const priorityRecoveryProgressClassCount = summarizePriorityRecoveryProgressClasses(
    snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots || null,
  ).unresolvedClassCount;
  return String(bestCoverageNodeCount) +
    '/' +
    String(expectedNodeCount) +
    (selectedNodeId ?
      '@' + selectedNodeId :
      '') +
    (selectedCapturedAtMs !== null ?
      '#ts=' + String(selectedCapturedAtMs) :
      '') +
    (selectedAdminReady !== null ?
      '#adminReady=' + String(selectedAdminReady) :
      '') +
    (selectedReachableBy ?
      '#via=' + selectedReachableBy :
      '') +
    (selectedReachabilityError ?
      '#adminError=' + selectedReachabilityError :
      '') +
    (selectedSnapshotTimeoutMs !== null &&
      selectedSnapshotTimeoutMs < CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS ?
      '#probeMs=' + String(selectedSnapshotTimeoutMs) :
      '') +
    (selectedReachabilityTimeoutMs !== null &&
      selectedReachabilityTimeoutMs < CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS ?
      '#reachabilityProbeMs=' + String(selectedReachabilityTimeoutMs) :
      '') +
    (publicationEpoch !== null ?
      '#epoch=' + String(publicationEpoch) :
      '') +
    (publicationStatus ?
      '#pub=' + publicationStatus :
      '') +
    (pendingAckCount > ZERO ?
      '#pendingAck=' + String(pendingAckCount) :
      '') +
    (missingPublishedCount > ZERO ?
      '#missingPublished=' + String(missingPublishedCount) :
      '') +
    (prioritySpreadSatisfied === false ?
      '#prioritySpread=pending' :
      (prioritySpreadSatisfied === true ?
        '#prioritySpread=ready' :
        '')) +
    (Number.isInteger(priorityRecoveryProgressClassCount) &&
      priorityRecoveryProgressClassCount > ZERO ?
      '#priorityRecovery=' + String(priorityRecoveryProgressClassCount) :
      '');
}

/**
 * Evaluate whether load-mode startup can trust published membership convergence.
 * @param {Object|null} snapshotCoverage
 * @param {string[]} expectedNodeIds
 * @returns {Object}
 */
function evaluateLoadPublishedConvergence(snapshotCoverage, expectedNodeIds = []) {
  const expectedPublishedNodeIds = normalizeDistinctStringArray(expectedNodeIds);
  const publicationConvergence =
    snapshotCoverage?.selectedPublicationConvergence &&
      typeof snapshotCoverage.selectedPublicationConvergence === 'object' ?
      snapshotCoverage.selectedPublicationConvergence :
      null;
  const publicationStatus = typeof publicationConvergence?.publicationStatus ===
    'string' ?
    publicationConvergence.publicationStatus.toUpperCase() :
    null;
  const publishedActiveNodeIds = normalizeDistinctStringArray(
    publicationConvergence?.publishedActiveNodeIds,
  );
  const recoveryActiveNodeIds = normalizeDistinctStringArray(
    publicationConvergence?.recoveryActiveNodeIds ??
      publicationConvergence?.membershipLifecycleSummary?.recoveryActiveNodeIds ??
      publicationConvergence?.membershipLifecycleSummary?.locallyEligibleNodeIds ??
      publicationConvergence?.membershipLifecycleSummary?.projectedServingNodeIds ??
      publicationConvergence?.publishedActiveNodeIds,
  );
  const pendingAckNodeIds = normalizeDistinctStringArray(
    publicationConvergence?.pendingAckNodeIds,
  );
  const recoveryProtocolState =
    typeof publicationConvergence?.recoveryProtocolState === 'string' &&
      publicationConvergence.recoveryProtocolState.length > ZERO ?
      publicationConvergence.recoveryProtocolState :
      null;
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    publicationConvergence?.priorityRecoveryReasonCodes,
  );
  const priorityPartitionSummary =
    publicationConvergence?.priorityPartitionSummary &&
      typeof publicationConvergence.priorityPartitionSummary === 'object' ?
      publicationConvergence.priorityPartitionSummary :
      null;
  const reasons = [];

  if (!publicationConvergence) {
    reasons.push(ACTIVE_PROBE_REASON_PUBLICATION_CONVERGENCE_MISSING);
  }
  if (publicationStatus !== 'PUBLISHED') {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_NOT_PUBLISHED_PREFIX +
      String(publicationStatus || 'unknown'),
    );
  }
  if (pendingAckNodeIds.length > ZERO) {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_PENDING_ACK_PREFIX +
      String(pendingAckNodeIds.length),
    );
  }
  const missingPublishedNodeIds = expectedPublishedNodeIds.filter((nodeId) => {
    return !publishedActiveNodeIds.includes(nodeId);
  });
  const missingRecoveryActiveNodeIds = expectedPublishedNodeIds.filter(
    (nodeId) => !recoveryActiveNodeIds.includes(nodeId),
  );
  for (const nodeId of missingRecoveryActiveNodeIds) {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_MISSING_ACTIVE_NODE_PREFIX +
      nodeId,
    );
  }
  if (priorityPartitionSummary?.satisfied === false ||
      recoveryProtocolState === 'priority_spread_pending' ||
      priorityRecoveryReasonCodes.includes('priority_partitions_not_spread')) {
    reasons.push(ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING);
  }

  return {
    ready: reasons.length === ZERO,
    reasons: Object.freeze(reasons),
    publicationStatus,
    recoveryProtocolState,
    priorityRecoveryReasonCodes,
    recoveryActiveNodeIds,
    recoveryActiveNodeSource:
      typeof publicationConvergence?.recoveryActiveNodeSource === 'string' &&
        publicationConvergence.recoveryActiveNodeSource.length > ZERO ?
        publicationConvergence.recoveryActiveNodeSource :
        null,
    pendingAckNodeIds,
    missingPublishedNodeIds,
    missingRecoveryActiveNodeIds,
    priorityPartitionSummary,
  };
}

function evaluatePriorityRecoveryCrossServiceInvariants(options = {}) {
  const readinessMode = options.readinessMode === CLUSTER_READINESS_MODE_LOAD ?
    CLUSTER_READINESS_MODE_LOAD :
    CLUSTER_READINESS_MODE_STARTUP;
  const publicationConvergenceGate =
    options.publicationConvergenceGate &&
      typeof options.publicationConvergenceGate === 'object' ?
      options.publicationConvergenceGate :
      {ready: true, reasons: []};
  const gateReasons = normalizeDistinctStringArray(
    publicationConvergenceGate.reasons,
  );
  const nodeDiagnostics = Array.isArray(options.nodeDiagnostics) ?
    options.nodeDiagnostics :
    [];
  const prioritySpreadPending = gateReasons.includes(
    ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING,
  );
  const bootstrapAdmittedNodeIds = nodeDiagnostics
    .filter((diagnostic) =>
      diagnostic?.active === true &&
      diagnostic?.activitySource ===
        ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const trafficBlockedNodeIds = nodeDiagnostics
    .filter((diagnostic) =>
      diagnostic?.activitySource ===
        ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS &&
      diagnostic?.active === false,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const trafficPriorityRecoveryBlockedNodeIds = nodeDiagnostics
    .filter((diagnostic) => {
      if (diagnostic?.activitySource !==
            ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS ||
          diagnostic?.active !== false) {
        return false;
      }
      const reasons = normalizeDistinctStringArray(diagnostic?.reasons);
      return reasons.includes(ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING) ||
        reasons.includes(ACTIVE_PROBE_REASON_PRIORITY_RECOVERY_PENDING) ||
        reasons.includes(
          ACTIVE_PROBE_REASON_CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
        );
    })
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const trafficAdmittedNodeIds = nodeDiagnostics
    .filter((diagnostic) =>
      diagnostic?.activitySource ===
        ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS &&
      diagnostic?.active === true,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const nonTrafficAdmittedNodeIds = nodeDiagnostics
    .filter((diagnostic) =>
      diagnostic?.active === true &&
      diagnostic?.activitySource !==
        ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const admittedNodeIds = normalizeDistinctStringArray([
    ...trafficAdmittedNodeIds,
    ...nonTrafficAdmittedNodeIds,
  ]);
  const readinessTimeoutFallbackAdmittedNodeIds = nodeDiagnostics
    .filter((diagnostic) => {
      if (diagnostic?.active !== true ||
          diagnostic?.activitySource !==
            ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK) {
        return false;
      }
      const reasons = normalizeDistinctStringArray(diagnostic?.reasons);
      return reasons.some((reason) => reason.startsWith(
        ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX,
      ));
    })
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const deferredAdmittedNodeIds =
    readinessMode === CLUSTER_READINESS_MODE_LOAD &&
      prioritySpreadPending ?
      readinessTimeoutFallbackAdmittedNodeIds :
      [];
  const deferredAdmittedNodeIdSet = new Set(deferredAdmittedNodeIds);
  const effectiveAdmittedNodeIds = admittedNodeIds.filter((nodeId) => {
    return !deferredAdmittedNodeIdSet.has(nodeId);
  });
  const expectedBlockedNodeCount = nodeDiagnostics.length;
  const observedBlockedNodeCount = Math.max(
    ZERO,
    expectedBlockedNodeCount - effectiveAdmittedNodeIds.length,
  );
  const invariants = [];

  const bootstrapJoinDuringRecoveryPassed =
    readinessMode === CLUSTER_READINESS_MODE_STARTUP ?
      (!prioritySpreadPending || bootstrapAdmittedNodeIds.length > ZERO) :
      true;
  invariants.push({
    id: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_BOOTSTRAP_JOIN_DURING_RECOVERY,
    invariantId:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_BOOTSTRAP_JOIN_DURING_RECOVERY,
    reasonCode:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_BOOTSTRAP_JOIN_DURING_RECOVERY,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
    owningSubsystem:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
    passed: bootstrapJoinDuringRecoveryPassed,
    details: {
      mode: readinessMode,
      prioritySpreadPending,
      bootstrapAdmittedNodeIds,
    },
  });

  const trafficGateDuringRecoveryPassed =
    readinessMode === CLUSTER_READINESS_MODE_LOAD ?
      (!prioritySpreadPending ||
        (expectedBlockedNodeCount > ZERO &&
          effectiveAdmittedNodeIds.length === ZERO)) :
      true;
  invariants.push({
    id: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_TRAFFIC_GATE_DURING_PRIORITY_RECOVERY,
    invariantId:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_TRAFFIC_GATE_DURING_PRIORITY_RECOVERY,
    reasonCode:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_TRAFFIC_GATE_DURING_RECOVERY,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
    owningSubsystem:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
    passed: trafficGateDuringRecoveryPassed,
    details: {
      mode: readinessMode,
      prioritySpreadPending,
      expectedBlockedNodeCount,
      observedBlockedNodeCount,
      trafficBlockedNodeIds,
      trafficPriorityRecoveryBlockedNodeIds,
      trafficAdmittedNodeIds,
      nonTrafficAdmittedNodeIds,
      observedAdmittedNodeIds: admittedNodeIds,
      deferredAdmittedNodeIds,
      violatingNodeIds: effectiveAdmittedNodeIds,
    },
  });

  const clusterActiveRequiresConvergencePassed =
    options.allActive === true ?
      publicationConvergenceGate.ready === true :
      true;
  invariants.push({
    id: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
    invariantId:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
    reasonCode:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
    owningSubsystem:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
    passed: clusterActiveRequiresConvergencePassed,
    details: {
      mode: readinessMode,
      allActive: options.allActive === true,
      publicationConvergenceReady: publicationConvergenceGate.ready === true,
      publicationConvergenceReasons: gateReasons,
    },
  });

  const failingInvariantIds = invariants
    .filter((invariant) => invariant.passed !== true)
    .map((invariant) => invariant.id);
  const failingInvariantReasonCodes = invariants
    .filter((invariant) => invariant.passed !== true)
    .map((invariant) => invariant.reasonCode)
    .filter((reasonCode) => typeof reasonCode === 'string' &&
      reasonCode.length > ZERO);
  return {
    invariants: Object.freeze(invariants.map((invariant) =>
      Object.freeze({
        ...invariant,
        details: Object.freeze({...invariant.details}),
      }))),
    failingInvariantIds: Object.freeze(failingInvariantIds),
    failingInvariantReasonCodes:
      Object.freeze(failingInvariantReasonCodes),
    passed: failingInvariantIds.length === ZERO,
  };
}

function formatPublicationConvergenceGate(publicationConvergenceGate) {
  if (!publicationConvergenceGate ||
      typeof publicationConvergenceGate !== 'object') {
    return 'none';
  }
  if (publicationConvergenceGate.ready === true) {
    return 'ready';
  }
  const reasons = Array.isArray(publicationConvergenceGate.reasons) ?
    publicationConvergenceGate.reasons :
    [];
  if (reasons.length > ZERO) {
    return reasons.join(',');
  }
  return 'blocked';
}

function normalizeActiveWaitPublicationStatus(status) {
  if (typeof status !== 'string') {
    return null;
  }
  const normalized = status.trim().toUpperCase();
  return normalized.length > ZERO ? normalized : null;
}

function resolveActiveWaitPublicationStatusRank(status) {
  const normalizedStatus = normalizeActiveWaitPublicationStatus(status);
  if (normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED) {
    return 3;
  }
  if (normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING) {
    return 2;
  }
  if (normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHING ||
      normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PREPARED) {
    return 1;
  }
  return ZERO;
}

function buildActiveWaitProgressSnapshot(
  probeResult = {},
  expectedNodeCount = ZERO,
  options = {},
) {
  const readinessMode =
    options?.readinessMode === CLUSTER_READINESS_MODE_LOAD ?
      CLUSTER_READINESS_MODE_LOAD :
      CLUSTER_READINESS_MODE_STARTUP;
  const nodeDiagnostics = Array.isArray(probeResult?.nodeDiagnostics) ?
    probeResult.nodeDiagnostics :
    [];
  const activeNodeCount = nodeDiagnostics.filter(
    (diagnostic) => diagnostic?.active === true,
  ).length;
  const inactiveNodeCount = Math.max(ZERO, nodeDiagnostics.length - activeNodeCount);

  const snapshotCoverage =
    probeResult?.snapshotCoverage && typeof probeResult.snapshotCoverage === 'object' ?
      probeResult.snapshotCoverage :
      null;
  const normalizedExpectedNodeCount = Number.isInteger(snapshotCoverage?.expectedNodeCount) &&
    snapshotCoverage.expectedNodeCount > ZERO ?
    snapshotCoverage.expectedNodeCount :
    Math.max(ZERO, expectedNodeCount);
  const snapshotCoverageNodeCount =
    Number.isInteger(snapshotCoverage?.bestCoverageNodeCount) &&
      snapshotCoverage.bestCoverageNodeCount > ZERO ?
      snapshotCoverage.bestCoverageNodeCount :
      ZERO;
  const snapshotCoverageComplete = snapshotCoverage?.completeCoverage === true;

  const publicationConvergence = snapshotCoverage?.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === 'object' ?
    snapshotCoverage.selectedPublicationConvergence :
    null;
  const publicationConvergenceGate =
    probeResult?.publicationConvergenceGate &&
      typeof probeResult.publicationConvergenceGate === 'object' ?
      probeResult.publicationConvergenceGate :
      null;
  const publicationStatus = normalizeActiveWaitPublicationStatus(
    publicationConvergenceGate?.publicationStatus ||
      publicationConvergence?.publicationStatus,
  );
  const recoveryProtocolState =
    typeof publicationConvergenceGate?.recoveryProtocolState === 'string' &&
      publicationConvergenceGate.recoveryProtocolState.length > ZERO ?
      publicationConvergenceGate.recoveryProtocolState :
      (typeof publicationConvergence?.recoveryProtocolState === 'string' &&
        publicationConvergence.recoveryProtocolState.length > ZERO ?
        publicationConvergence.recoveryProtocolState :
        null);
  const publicationEpoch =
    Number.isFinite(publicationConvergence?.publicationEpoch) ?
      Math.floor(publicationConvergence.publicationEpoch) :
      null;
  const selectedSnapshotNodeId =
    typeof snapshotCoverage?.selectedNodeId === 'string' &&
      snapshotCoverage.selectedNodeId.length > ZERO ?
      snapshotCoverage.selectedNodeId :
      null;
  const selectedSnapshotAdminReady =
    snapshotCoverage?.selectedAdminReady === true ?
      true :
      (snapshotCoverage?.selectedAdminReady === false ? false : null);
  const selectedSnapshotReachableBy =
    typeof snapshotCoverage?.selectedReachableBy === 'string' &&
      snapshotCoverage.selectedReachableBy.length > ZERO ?
      snapshotCoverage.selectedReachableBy :
      null;
  const selectedSnapshotError =
    typeof snapshotCoverage?.selectedError === 'string' &&
      snapshotCoverage.selectedError.length > ZERO ?
      snapshotCoverage.selectedError :
      null;
  const selectedSnapshotReachabilityError =
    typeof snapshotCoverage?.selectedReachabilityError === 'string' &&
      snapshotCoverage.selectedReachabilityError.length > ZERO ?
      snapshotCoverage.selectedReachabilityError :
      null;
  const selectedControlPlaneOwnerQueueDepth =
    snapshotCoverage?.selectedControlPlaneOwnerQueueDepth &&
      typeof snapshotCoverage.selectedControlPlaneOwnerQueueDepth ===
        'object' ?
      snapshotCoverage.selectedControlPlaneOwnerQueueDepth :
      null;
  const selectedCdcReplayLag =
    snapshotCoverage?.selectedCdcReplayLag &&
      typeof snapshotCoverage.selectedCdcReplayLag === 'object' ?
      snapshotCoverage.selectedCdcReplayLag :
      null;
  const perNodePublicationDisagreementSet =
    snapshotCoverage?.publicationDisagreementByNodeId &&
      typeof snapshotCoverage.publicationDisagreementByNodeId === 'object' ?
      Object.fromEntries(
        Object.entries(snapshotCoverage.publicationDisagreementByNodeId)
          .map(([nodeId, missingNodeIds]) => {
            const normalizedNodeId = String(nodeId || '').trim();
            return [
              normalizedNodeId,
              normalizeDistinctStringArray(missingNodeIds),
            ];
          })
          .filter(([nodeId]) => nodeId.length > ZERO),
      ) :
      {};
  const selectedPublishedActiveNodeIds = normalizeDistinctStringArray(
    snapshotCoverage?.selectedPublishedActiveNodeIds ||
      publicationConvergence?.publishedActiveNodeIds,
  );
  const pendingAckNodeIds = normalizeDistinctStringArray(
    snapshotCoverage?.selectedPendingAckNodeIds ||
      publicationConvergenceGate?.pendingAckNodeIds ||
      publicationConvergence?.pendingAckNodeIds,
  );
  const missingPublishedNodeIds = normalizeDistinctStringArray([
    ...(Array.isArray(snapshotCoverage?.selectedMissingPublishedNodeIds) ?
      snapshotCoverage.selectedMissingPublishedNodeIds :
      []),
    ...(Array.isArray(publicationConvergenceGate?.missingPublishedNodeIds) ?
      publicationConvergenceGate.missingPublishedNodeIds :
      []),
  ]);
  const gateReasons = normalizeDistinctStringArray(
    publicationConvergenceGate?.reasons,
  ).sort();
  const priorityPartitionSummary =
    publicationConvergenceGate?.priorityPartitionSummary &&
      typeof publicationConvergenceGate.priorityPartitionSummary === 'object' ?
      publicationConvergenceGate.priorityPartitionSummary :
      (publicationConvergence?.priorityPartitionSummary &&
      typeof publicationConvergence.priorityPartitionSummary === 'object' ?
        publicationConvergence.priorityPartitionSummary :
        null);
  const prioritySpreadSatisfied =
    priorityPartitionSummary?.satisfied === true ?
      true :
      (priorityPartitionSummary?.satisfied === false ? false : null);
  const prioritySpreadGap = Number.isInteger(priorityPartitionSummary?.totalSpreadGap) &&
    priorityPartitionSummary.totalSpreadGap >= ZERO ?
    priorityPartitionSummary.totalSpreadGap :
    null;
  const priorityBlockedPartitionCount =
    Number.isInteger(priorityPartitionSummary?.blockedPartitionCount) &&
      priorityPartitionSummary.blockedPartitionCount >= ZERO ?
      priorityPartitionSummary.blockedPartitionCount :
      null;
  const priorityRecoveryDecisionSnapshots =
    snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots &&
      typeof snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots === 'object' ?
      snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots :
      null;
  const priorityRecoveryProgressClasses = summarizePriorityRecoveryProgressClasses(
    priorityRecoveryDecisionSnapshots,
  );
  const priorityRecoveryUnresolvedClassCount =
    priorityRecoveryProgressClasses.unresolvedClassCount;
  const priorityRecoveryUnresolvedSemanticStateCount =
    priorityRecoveryProgressClasses.unresolvedSemanticStateCount;
  const priorityRecoveryBlockedPartitionCount =
    priorityRecoveryProgressClasses.blockedPartitionCount;

  const blockers = [];
  if (inactiveNodeCount > ZERO) {
    blockers.push(
      ACTIVE_WAIT_BLOCKER_INACTIVE_NODES_PREFIX + String(inactiveNodeCount),
    );
  }
  if (!snapshotCoverageComplete) {
    blockers.push(
      ACTIVE_WAIT_BLOCKER_SNAPSHOT_COVERAGE_PREFIX +
      String(snapshotCoverageNodeCount) +
      '/' +
      String(normalizedExpectedNodeCount),
    );
  }
  if (typeof snapshotCoverage?.selectedError === 'string' &&
      snapshotCoverage.selectedError.length > ZERO) {
    blockers.push(ACTIVE_WAIT_BLOCKER_SNAPSHOT_ERROR);
  }
  for (const reason of gateReasons) {
    blockers.push(ACTIVE_WAIT_BLOCKER_PUBLICATION_GATE_PREFIX + reason);
  }
  for (const progressClass of priorityRecoveryProgressClasses.unresolvedClassIds) {
    blockers.push(
      ACTIVE_WAIT_BLOCKER_PRIORITY_RECOVERY_PROGRESS_CLASS_PREFIX +
      progressClass,
    );
  }
  if (blockers.length === ZERO && probeResult?.allActive === true) {
    blockers.push(ACTIVE_WAIT_BLOCKER_READY);
  }

  const closureWitness = classifyActiveGateClosureWitness({
    progressSnapshot: {
      expectedNodeCount: normalizedExpectedNodeCount,
      activeNodeCount,
      inactiveNodeCount,
      snapshotCoverageNodeCount,
      snapshotCoverageComplete,
      publicationStatus,
      recoveryProtocolState,
      pendingAckCount: pendingAckNodeIds.length,
      missingPublishedCount: missingPublishedNodeIds.length,
      gateReasons,
      prioritySpreadSatisfied,
      selectedSnapshotAdminReady,
      selectedSnapshotReachableBy,
      selectedSnapshotError,
      selectedSnapshotReachabilityError,
    },
    publicationConvergence,
    publicationConvergenceGate,
    readinessMode,
  });

  return {
    expectedNodeCount: normalizedExpectedNodeCount,
    activeNodeCount,
    inactiveNodeCount,
    snapshotCoverageNodeCount,
    snapshotCoverageComplete,
    publicationStatus,
    publicationStatusRank:
      resolveActiveWaitPublicationStatusRank(publicationStatus),
    publicationEpoch,
    recoveryProtocolState,
    selectedSnapshotNodeId,
    selectedSnapshotAdminReady,
    selectedSnapshotReachableBy,
    selectedSnapshotError,
    selectedSnapshotReachabilityError,
    selectedControlPlaneOwnerQueueDepth,
    selectedCdcReplayLag,
    perNodePublicationDisagreementSet,
    selectedPublishedActiveNodeIds,
    selectedPublishedActiveCount: selectedPublishedActiveNodeIds.length,
    selectedMissingPublishedNodeIds: missingPublishedNodeIds,
    pendingAckCount: pendingAckNodeIds.length,
    missingPublishedCount: missingPublishedNodeIds.length,
    gateReasonCount: gateReasons.length,
    gateReasons,
    prioritySpreadSatisfied,
    prioritySpreadGap,
    priorityBlockedPartitionCount,
    priorityRecoveryProgressClasses,
    priorityRecoveryUnresolvedClassCount,
    priorityRecoveryUnresolvedSemanticStateCount,
    priorityRecoveryBlockedPartitionCount,
    closureRecordId: closureWitness?.closureRecordId || null,
    closureWitnessClass: closureWitness?.closureWitnessClass || null,
    readinessDelay: classifyActiveGateReadinessDelay({
      readinessMode,
      selectedSnapshotError,
      selectedSnapshotReachabilityError,
    }),
    blockers,
    blockerSignature: blockers.join('|'),
  };
}

function normalizePriorityRecoverySemanticStateId(semanticState) {
  const normalizedSemanticState = String(semanticState || '').trim();
  if (normalizedSemanticState.length === ZERO) {
    return null;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(
    normalizedSemanticState,
  ) ?
    normalizedSemanticState :
    null;
}

function inferPriorityRecoverySemanticState(snapshot, blockerReasons = []) {
  for (const blockerReason of PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE) {
    if (!blockerReasons.includes(blockerReason)) {
      continue;
    }
    return PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] ||
      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
  }
  if (snapshot?.planner?.ready === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED;
  }
  if (snapshot?.spreadCompletion?.satisfied === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
  }
  if (Number(snapshot?.coordinator?.operationCount) > ZERO ||
      (typeof snapshot?.operationId === 'string' &&
      snapshot.operationId.length > ZERO)) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
}

function summarizePriorityRecoveryProgressClasses(priorityRecoveryDecisionSnapshots = null) {
  const snapshots = Array.isArray(priorityRecoveryDecisionSnapshots?.snapshots) ?
    priorityRecoveryDecisionSnapshots.snapshots :
    [];
  const partitionIdsByClass = {
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.ELIGIBLE_NO_OPERATION]: new Set(),
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.OPERATION_NO_TRANSITIONS]: new Set(),
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.LEARNER_NEVER_PROMOTABLE]: new Set(),
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.RECOVERY_ELIGIBLE_EXCLUDED]: new Set(),
  };
  const partitionIdsBySemanticState = {};
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== 'object') {
      continue;
    }
    const partitionId = String(snapshot.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    const blockerReasons = normalizeDistinctStringArray(snapshot.blockerReasons);
    for (const blockerReason of blockerReasons) {
      if (!Object.hasOwn(partitionIdsByClass, blockerReason)) {
        continue;
      }
      partitionIdsByClass[blockerReason].add(partitionId);
    }
    const semanticState =
      normalizePriorityRecoverySemanticStateId(snapshot.semanticState) ||
      inferPriorityRecoverySemanticState(snapshot, blockerReasons);
    if (partitionIdsBySemanticState[semanticState] instanceof Set) {
      partitionIdsBySemanticState[semanticState].add(partitionId);
    }
  }

  const normalizedPartitionIdsByClass = {};
  for (const [progressClass, partitionIds] of Object.entries(
    partitionIdsByClass,
  )) {
    normalizedPartitionIdsByClass[progressClass] = [...partitionIds].sort();
  }
  const unresolvedClassIds = Object.entries(normalizedPartitionIdsByClass)
    .filter(([, partitionIds]) => partitionIds.length > ZERO)
    .map(([progressClass]) => progressClass)
    .sort();
  const blockedPartitionIds = normalizeDistinctStringArray(
    unresolvedClassIds.flatMap((progressClass) =>
      normalizedPartitionIdsByClass[progressClass] || [],
    ),
  );
  const normalizedPartitionIdsBySemanticState = {};
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    normalizedPartitionIdsBySemanticState[semanticState] = [...partitionIds].sort();
  }
  const unresolvedSemanticStateIds =
    PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS
      .filter((semanticState) =>
        normalizedPartitionIdsBySemanticState[semanticState].length > ZERO,
      );
  const semanticBlockedPartitionIds = normalizeDistinctStringArray(
    unresolvedSemanticStateIds.flatMap((semanticState) =>
      normalizedPartitionIdsBySemanticState[semanticState] || [],
    ),
  );
  const effectiveBlockedPartitionIds =
    semanticBlockedPartitionIds.length > ZERO ?
      semanticBlockedPartitionIds :
      blockedPartitionIds;

  return {
    partitionIdsByClass: normalizedPartitionIdsByClass,
    unresolvedClassIds,
    unresolvedClassCount: unresolvedClassIds.length,
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
    unresolvedSemanticStateIds,
    unresolvedSemanticStateCount: unresolvedSemanticStateIds.length,
    blockedPartitionIds: effectiveBlockedPartitionIds,
    blockedPartitionCount: effectiveBlockedPartitionIds.length,
  };
}

function scoreActiveWaitProgress(progressSnapshot) {
  if (!progressSnapshot || typeof progressSnapshot !== 'object') {
    return Number.NEGATIVE_INFINITY;
  }
  const expectedNodeCount = Number.isInteger(progressSnapshot.expectedNodeCount) &&
    progressSnapshot.expectedNodeCount > ZERO ?
    progressSnapshot.expectedNodeCount :
    ZERO;
  const pendingAckResolved = Math.max(
    ZERO,
    expectedNodeCount - Math.max(ZERO, progressSnapshot.pendingAckCount || ZERO),
  );
  const missingPublishedResolved = Math.max(
    ZERO,
    expectedNodeCount - Math.max(ZERO, progressSnapshot.missingPublishedCount || ZERO),
  );
  const gateReasonCount = Math.max(ZERO, progressSnapshot.gateReasonCount || ZERO);
  const prioritySpreadRank =
    progressSnapshot.prioritySpreadSatisfied === true ?
      2 :
      (progressSnapshot.prioritySpreadSatisfied === false ? ZERO : ONE);
  const prioritySpreadGapScore = Number.isInteger(progressSnapshot.prioritySpreadGap) &&
    progressSnapshot.prioritySpreadGap >= ZERO ?
    Math.max(ZERO, 100 - Math.min(100, progressSnapshot.prioritySpreadGap)) :
    50;
  const unresolvedSemanticStateCount =
    Number(progressSnapshot.priorityRecoveryUnresolvedSemanticStateCount);
  const unresolvedPriorityRecoveryCount = Number.isFinite(
    unresolvedSemanticStateCount,
  ) ?
    unresolvedSemanticStateCount :
    (Number(progressSnapshot.priorityRecoveryUnresolvedClassCount) || ZERO);
  const priorityRecoveryProgressBonus = Math.max(
    ZERO,
    8 - Math.min(8, unresolvedPriorityRecoveryCount),
  );
  const priorityRecoveryBlockedPartitionBonus = Math.max(
    ZERO,
    8 - Math.min(8, Number(progressSnapshot.priorityRecoveryBlockedPartitionCount) || ZERO),
  );

  return (
    (Math.max(ZERO, progressSnapshot.activeNodeCount || ZERO) * 1_000_000) +
    (Math.max(ZERO, progressSnapshot.snapshotCoverageNodeCount || ZERO) * 10_000) +
    (progressSnapshot.snapshotCoverageComplete === true ? 1_000 : ZERO) +
    (Math.max(ZERO, progressSnapshot.publicationStatusRank || ZERO) * 100) +
    (pendingAckResolved * 10) +
    (missingPublishedResolved * 5) +
    (prioritySpreadRank * 3) +
    Math.max(ZERO, 3 - Math.min(3, gateReasonCount)) +
    priorityRecoveryProgressBonus +
    priorityRecoveryBlockedPartitionBonus +
    Math.floor(prioritySpreadGapScore / 50)
  );
}

function formatActiveWaitProgressSnapshot(progressSnapshot) {
  if (!progressSnapshot || typeof progressSnapshot !== 'object') {
    return 'none';
  }
  const gateReasons = Array.isArray(progressSnapshot.gateReasons) ?
    progressSnapshot.gateReasons :
    [];
  const priorityRecoveryProgressClasses = Array.isArray(
    progressSnapshot?.priorityRecoveryProgressClasses?.unresolvedClassIds,
  ) ? progressSnapshot.priorityRecoveryProgressClasses.unresolvedClassIds : [];
  const priorityRecoverySemanticStates = Array.isArray(
    progressSnapshot?.priorityRecoveryProgressClasses?.unresolvedSemanticStateIds,
  ) ? progressSnapshot.priorityRecoveryProgressClasses.unresolvedSemanticStateIds : [];
  const selectedMissingPublishedNodeIds = Array.isArray(
    progressSnapshot?.selectedMissingPublishedNodeIds,
  ) ?
    progressSnapshot.selectedMissingPublishedNodeIds :
    [];
  const ownerQueuePendingWrites = Number.isFinite(
    progressSnapshot?.selectedControlPlaneOwnerQueueDepth?.pendingWrites,
  ) ?
    Math.max(
      ZERO,
      Math.floor(progressSnapshot.selectedControlPlaneOwnerQueueDepth.pendingWrites),
    ) :
    null;
  const cdcBufferedEvents = Number.isFinite(
    progressSnapshot?.selectedCdcReplayLag?.bufferedEvents,
  ) ?
    Math.max(
      ZERO,
      Math.floor(progressSnapshot.selectedCdcReplayLag.bufferedEvents),
    ) :
    null;
  const perNodePublicationDisagreementSet =
    progressSnapshot?.perNodePublicationDisagreementSet &&
      typeof progressSnapshot.perNodePublicationDisagreementSet === 'object' ?
      progressSnapshot.perNodePublicationDisagreementSet :
      {};
  const disagreementNodeCount = Object.values(
    perNodePublicationDisagreementSet,
  ).filter((missingNodeIds) => {
    return Array.isArray(missingNodeIds) &&
      missingNodeIds.length > ZERO;
  }).length;
  return (
    'active=' +
    String(progressSnapshot.activeNodeCount ?? ZERO) +
    '/' +
    String(progressSnapshot.expectedNodeCount ?? ZERO) +
    ',coverage=' +
    String(progressSnapshot.snapshotCoverageNodeCount ?? ZERO) +
    '/' +
    String(progressSnapshot.expectedNodeCount ?? ZERO) +
    (progressSnapshot.snapshotCoverageComplete === true ? '#complete' : '') +
    ',publication=' +
    String(progressSnapshot.publicationStatus || 'unknown') +
    ',snapshotNode=' +
    String(progressSnapshot.selectedSnapshotNodeId || 'none') +
    (progressSnapshot.selectedSnapshotAdminReady === true ?
      '#adminReady=true' :
      (progressSnapshot.selectedSnapshotAdminReady === false ?
        '#adminReady=false' :
        '')) +
    (progressSnapshot.selectedSnapshotReachableBy ?
      '#via=' + progressSnapshot.selectedSnapshotReachableBy :
      '') +
    (progressSnapshot.selectedSnapshotError ?
      '#snapshotError' :
      '') +
    (progressSnapshot.selectedSnapshotReachabilityError ?
      '#adminError' :
      '') +
    ',epoch=' +
    String(progressSnapshot.publicationEpoch ?? 'unknown') +
    ',publishedActive=' +
    String(progressSnapshot.selectedPublishedActiveCount ?? ZERO) +
    '/' +
    String(progressSnapshot.expectedNodeCount ?? ZERO) +
    ',pendingAck=' +
    String(progressSnapshot.pendingAckCount ?? ZERO) +
    ',missingPublished=' +
    String(progressSnapshot.missingPublishedCount ?? ZERO) +
    ',missingPublishedIds=' +
    (selectedMissingPublishedNodeIds.length > ZERO ?
      selectedMissingPublishedNodeIds.join('|') :
      'none') +
    ',ownerQueue=' +
    String(ownerQueuePendingWrites ?? 'unknown') +
    ',cdcLag=' +
    String(cdcBufferedEvents ?? 'unknown') +
    ',disagreementNodes=' +
    String(disagreementNodeCount) +
    ',prioritySpread=' +
    (progressSnapshot.prioritySpreadSatisfied === true ?
      'ready' :
      (progressSnapshot.prioritySpreadSatisfied === false ? 'pending' : 'unknown')) +
    (Number.isInteger(progressSnapshot.prioritySpreadGap) ?
      '#gap=' + String(progressSnapshot.prioritySpreadGap) :
      '') +
    ',priorityRecovery=' +
    (priorityRecoveryProgressClasses.length > ZERO ?
      priorityRecoveryProgressClasses.join('|') :
      'none') +
    ',priorityRecoveryState=' +
    (priorityRecoverySemanticStates.length > ZERO ?
      priorityRecoverySemanticStates.join('|') :
      'none') +
    ',closure=' +
    String(progressSnapshot.closureRecordId || 'none') +
    (progressSnapshot.closureWitnessClass ?
      '#' + progressSnapshot.closureWitnessClass :
      '') +
    ',gateReasons=' +
    (gateReasons.length > ZERO ? gateReasons.join('|') : 'none')
  );
}

function upsertActiveWaitBlockerHistory(
  blockerHistoryBySignature,
  progressSnapshot,
  attempt,
  elapsedMs,
) {
  if (!(blockerHistoryBySignature instanceof Map)) {
    return;
  }
  const blockers = Array.isArray(progressSnapshot?.blockers) &&
    progressSnapshot.blockers.length > ZERO ?
    progressSnapshot.blockers :
    [ACTIVE_WAIT_BLOCKER_NONE];
  const signature = blockers.join('|');
  let entry = blockerHistoryBySignature.get(signature) || null;
  if (!entry) {
    if (blockerHistoryBySignature.size >= ACTIVE_WAIT_BLOCKER_HISTORY_MAX_ENTRIES) {
      let evictionKey = null;
      let evictionEntry = null;
      for (const [candidateKey, candidateEntry] of blockerHistoryBySignature.entries()) {
        if (!evictionEntry) {
          evictionKey = candidateKey;
          evictionEntry = candidateEntry;
          continue;
        }
        if (candidateEntry.count < evictionEntry.count ||
            (candidateEntry.count === evictionEntry.count &&
            candidateEntry.lastAttempt < evictionEntry.lastAttempt)) {
          evictionKey = candidateKey;
          evictionEntry = candidateEntry;
        }
      }
      if (evictionKey) {
        blockerHistoryBySignature.delete(evictionKey);
      }
    }
    entry = {
      signature,
      blockers: [...blockers],
      count: ZERO,
      firstAttempt: attempt,
      firstElapsedMs: elapsedMs,
      lastAttempt: attempt,
      lastElapsedMs: elapsedMs,
    };
    blockerHistoryBySignature.set(signature, entry);
  }
  entry.count += ONE;
  entry.lastAttempt = attempt;
  entry.lastElapsedMs = elapsedMs;
}

function summarizeActiveWaitBlockerHistory(blockerHistoryBySignature) {
  if (!(blockerHistoryBySignature instanceof Map) ||
      blockerHistoryBySignature.size === ZERO) {
    return [];
  }
  return Array.from(blockerHistoryBySignature.values())
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return right.lastAttempt - left.lastAttempt;
    })
    .slice(ZERO, ACTIVE_WAIT_BLOCKER_HISTORY_MAX_ENTRIES)
    .map((entry) => ({
      blockers: entry.blockers,
      signature: entry.signature,
      count: entry.count,
      firstAttempt: entry.firstAttempt,
      firstElapsedMs: entry.firstElapsedMs,
      lastAttempt: entry.lastAttempt,
      lastElapsedMs: entry.lastElapsedMs,
    }));
}

function normalizeReplicaOperationPartitionGroupInFlight(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const normalized = {};
  for (const [groupId, count] of Object.entries(value)) {
    const parsedCount = Number(count);
    if (!Number.isInteger(parsedCount) || parsedCount < ZERO) {
      continue;
    }
    normalized[String(groupId)] = parsedCount;
  }
  return normalized;
}

function buildReplicaOperationTimelineSignature(operationTimelineById = {}) {
  if (!operationTimelineById ||
      typeof operationTimelineById !== 'object' ||
      Array.isArray(operationTimelineById)) {
    return null;
  }
  const signatures = [];
  for (const operationId of Object.keys(operationTimelineById).sort()) {
    const timeline = Array.isArray(operationTimelineById[operationId]) ?
      operationTimelineById[operationId] :
      [];
    const lastEntry = timeline.length > ZERO ?
      timeline[timeline.length - 1] :
      null;
    signatures.push(
      String(operationId) +
      '=' +
      String(timeline.length) +
      ':' +
      String(lastEntry?.eventType || '') +
      ':' +
      String(lastEntry?.step || '') +
      ':' +
      String(lastEntry?.status || '') +
      ':' +
      (lastEntry?.inFlight === true ? '1' : '0'),
    );
  }
  if (signatures.length === ZERO) {
    return null;
  }
  return signatures.join('|');
}

function isBetterControlSnapshotCandidate(candidate, selected) {
  if (!selected) {
    return true;
  }
  const candidateCapturedAtMs = Number.isFinite(candidate?.capturedAtMs) ?
    candidate.capturedAtMs :
    null;
  const selectedCapturedAtMs = Number.isFinite(selected?.capturedAtMs) ?
    selected.capturedAtMs :
    null;
  if (candidateCapturedAtMs !== null && selectedCapturedAtMs !== null &&
      candidateCapturedAtMs !== selectedCapturedAtMs) {
    return candidateCapturedAtMs > selectedCapturedAtMs;
  }
  if (candidateCapturedAtMs !== null && selectedCapturedAtMs === null) {
    return true;
  }
  if (candidateCapturedAtMs === null && selectedCapturedAtMs !== null) {
    return false;
  }
  if (candidate?.inFlightCount !== selected?.inFlightCount) {
    return Number(candidate?.inFlightCount) < Number(selected?.inFlightCount);
  }
  return String(candidate?.nodeId || '').localeCompare(
    String(selected?.nodeId || ''),
  ) < ZERO;
}

function normalizeDistinctStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > ZERO))]
    .sort((left, right) => left.localeCompare(right));
}

function parseJsonArrayField(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObjectField(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ?
      parsed :
      null;
  } catch {
    return null;
  }
}

function parseFiniteNumberField(value) {
  if (Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value !== 'string' || value.trim().length === ZERO) {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.floor(numericValue) : null;
}

function extractCriticalSystemDiscoverySummary(discoverySnapshot) {
  const rows = Array.isArray(discoverySnapshot?.rows) ?
    discoverySnapshot.rows :
    [];
  const firstRow = rows.length > ZERO &&
    rows[ZERO] &&
    typeof rows[ZERO] === 'object' ?
    rows[ZERO] :
    null;
  if (!firstRow) {
    return {
      capturedAtMs: null,
      readyNodeIds: [],
      readyDistinctNodeCount: ZERO,
      readyReplicaCount: ZERO,
      totalReplicaCount: ZERO,
    };
  }
  const services = Array.isArray(firstRow[SERVICE_DISCOVERY_SERVICES_FIELD]) ?
    firstRow[SERVICE_DISCOVERY_SERVICES_FIELD] :
    [];
  const readyNodeIds = [];
  let readyReplicaCount = ZERO;
  let totalReplicaCount = ZERO;

  for (const service of services) {
    if (!service || typeof service !== 'object') {
      continue;
    }
    const replicas = Array.isArray(service[SERVICE_DISCOVERY_REPLICAS_FIELD]) ?
      service[SERVICE_DISCOVERY_REPLICAS_FIELD] :
      [];
    for (const replica of replicas) {
      if (!replica || typeof replica !== 'object') {
        continue;
      }
      totalReplicaCount += ONE;
      const nodeId = String(
        replica[SERVICE_DISCOVERY_REPLICA_NODE_ID_FIELD] || '',
      ).trim();
      if (nodeId.length === ZERO) {
        continue;
      }
      const readiness = replica[SERVICE_DISCOVERY_REPLICA_READINESS_FIELD];
      if (!readiness || typeof readiness !== 'object' ||
          readiness[SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD] !== true) {
        continue;
      }
      readyReplicaCount += ONE;
      readyNodeIds.push(nodeId);
    }
  }

  const distinctReadyNodeIds = normalizeDistinctStringArray(readyNodeIds);
  return {
    capturedAtMs: Number.isFinite(firstRow?.capturedAt) ?
      Math.floor(firstRow.capturedAt) :
      null,
    readyNodeIds: distinctReadyNodeIds,
    readyDistinctNodeCount: distinctReadyNodeIds.length,
    readyReplicaCount,
    totalReplicaCount,
  };
}

function isBetterCriticalSystemDiscoveryCandidate(candidate, selected) {
  if (!selected) {
    return true;
  }
  if (candidate.readyDistinctNodeCount !== selected.readyDistinctNodeCount) {
    return candidate.readyDistinctNodeCount > selected.readyDistinctNodeCount;
  }
  if (candidate.readyReplicaCount !== selected.readyReplicaCount) {
    return candidate.readyReplicaCount > selected.readyReplicaCount;
  }
  const candidateCapturedAtMs = Number.isFinite(candidate?.selectedCapturedAtMs) ?
    candidate.selectedCapturedAtMs :
    null;
  const selectedCapturedAtMs = Number.isFinite(selected?.selectedCapturedAtMs) ?
    selected.selectedCapturedAtMs :
    null;
  if (candidateCapturedAtMs !== null && selectedCapturedAtMs !== null &&
      candidateCapturedAtMs !== selectedCapturedAtMs) {
    return candidateCapturedAtMs > selectedCapturedAtMs;
  }
  if (candidateCapturedAtMs !== null && selectedCapturedAtMs === null) {
    return true;
  }
  if (candidateCapturedAtMs === null && selectedCapturedAtMs !== null) {
    return false;
  }
  if (candidate.totalReplicaCount !== selected.totalReplicaCount) {
    return candidate.totalReplicaCount > selected.totalReplicaCount;
  }
  return String(candidate?.selectedNodeId || '').localeCompare(
    String(selected?.selectedNodeId || ''),
  ) < ZERO;
}

function formatCriticalSystemDistributionSummary(summary) {
  if (!summary || typeof summary !== 'object' || summary.enabled !== true) {
    return 'disabled';
  }
  const tables = Array.isArray(summary.tables) ?
    summary.tables :
    [];
  if (tables.length === ZERO) {
    return 'none';
  }
  return tables.map((table) => {
    const tableName = String(table?.tableName || 'unknown_table');
    const readyDistinctNodeCount = Number.isInteger(
      table?.readyDistinctNodeCount,
    ) ?
      table.readyDistinctNodeCount :
      ZERO;
    const requiredDistinctNodeCount = Number.isInteger(
      table?.requiredDistinctNodeCount,
    ) ?
      table.requiredDistinctNodeCount :
      ZERO;
    const readyNodeIds = normalizeDistinctStringArray(table?.readyNodeIds);
    const selectedNodeId = String(table?.selectedNodeId || '').trim();
    const error = String(table?.error || '').trim();
    return tableName +
      ':' +
      String(readyDistinctNodeCount) +
      '/' +
      String(requiredDistinctNodeCount) +
      (readyNodeIds.length > ZERO ?
        '@' + readyNodeIds.join('|') :
        '') +
      (selectedNodeId.length > ZERO ?
        '#src=' + selectedNodeId :
        '') +
      (error.length > ZERO ?
        '#err=' + error :
        '');
  }).join(', ');
}

/**
 * Poll a probe until success or timeout.
 * @param {Object} options
 * @param {function(): Promise<Object>} options.probe
 * @param {function(Object): boolean} options.isSuccess
 * @param {number} options.deadline
 * @param {number} options.intervalMs
 * @param {function(number): Promise<void>} options.sleep
 * @param {function(Object): Promise<void>|void} [options.onAttempt]
 * @returns {Promise<Object>}
 */
async function pollUntilCondition(options = {}) {
  const deadline = Number(options.deadline) || Date.now();
  const intervalMs = Math.max(0, Number(options.intervalMs) || 0);
  const probe = options.probe;
  const isSuccess = options.isSuccess;
  const sleep = typeof options.sleep === 'function' ?
    options.sleep :
    async () => {};
  const onAttempt = typeof options.onAttempt === 'function' ?
    options.onAttempt :
    null;

  const startedAt = Date.now();
  let attempts = 0;
  let lastResult = null;

  while (Date.now() < deadline) {
    attempts += 1;
    lastResult = await probe();
    const elapsedMs = Date.now() - startedAt;
    const attemptResult = {
      attempts,
      elapsedMs,
      lastResult,
      remainingMs: Math.max(0, deadline - Date.now()),
    };

    if (isSuccess(lastResult)) {
      return {
        success: true,
        ...attemptResult,
      };
    }

    if (onAttempt) {
      await onAttempt(attemptResult);
    }
    await sleep(intervalMs);
  }

  return {
    success: false,
    attempts,
    elapsedMs: Date.now() - startedAt,
    lastResult,
    remainingMs: 0,
  };
}

/**
 * Best-effort WebSocket close that suppresses transient close-time errors.
 * @param {Object|null} socket
 */
function closeWebSocketSafely(socket) {
  if (!socket || typeof socket.close !== 'function') {
    return;
  }
  try {
    socket.once('error', () => {});
  } catch (_onceErr) {
    // Ignore
  }
  try {
    socket.close();
  } catch (_closeErr) {
    // Ignore
  }
}

/**
 * Build a reusable probe object for reachability diagnostics.
 * @param {Object} options
 * @param {boolean} [options.attempted]
 * @param {boolean} [options.ok]
 * @param {number|null} [options.statusCode]
 * @param {string|null} [options.error]
 * @param {string|null} [options.url]
 * @param {string|null} [options.endpoint]
 * @param {string|null} [options.query]
 * @returns {Object}
 */
function createProbeResult(options = {}) {
  return {
    attempted: options.attempted === true,
    ok: options.ok === true,
    statusCode: Number.isInteger(options.statusCode) ?
      options.statusCode :
      null,
    error: typeof options.error === 'string' ?
      options.error :
      null,
    url: typeof options.url === 'string' ? options.url : null,
    endpoint: typeof options.endpoint === 'string' ?
      options.endpoint :
      null,
    query: typeof options.query === 'string' ? options.query : null,
  };
}

/**
 * Convert a caught error value into a stable diagnostic string.
 * @param {*} error
 * @returns {string}
 */
function normalizeProbeError(error) {
  if (error && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return REACHABILITY_ERROR_UNKNOWN;
}

/**
 * Read one environment value from docker inspect payload.
 * @param {Object} inspect
 * @param {string} key
 * @returns {string|null}
 */
function readContainerInspectEnvValue(inspect, key) {
  const envList = Array.isArray(inspect?.Config?.Env) ?
    inspect.Config.Env :
    [];
  const prefix = String(key || '') + '=';
  for (const entry of envList) {
    if (typeof entry === 'string' && entry.startsWith(prefix)) {
      return entry.slice(prefix.length);
    }
  }
  return null;
}

/**
 * Determine whether one Docker network endpoint exposes the hostname alias
 * used by the harness in node_address rows.
 * @param {Object|null} endpointSettings
 * @param {string} expectedAlias
 * @returns {boolean}
 */
function hasDockerNetworkAlias(endpointSettings, expectedAlias) {
  if (!endpointSettings || typeof endpointSettings !== 'object') {
    return false;
  }
  if (typeof expectedAlias !== 'string' || expectedAlias.length === ZERO) {
    return true;
  }
  const aliases = Array.isArray(endpointSettings.Aliases) ?
    endpointSettings.Aliases :
    [];
  return aliases.includes(expectedAlias);
}

/**
 * Determine whether one reusable-container stop error can be ignored.
 * @param {*} error
 * @returns {boolean}
 */
function isIgnorableContainerStopError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes(CONTAINER_STOP_NOT_RUNNING_PATTERN) ||
    message.includes(CONTAINER_STOP_NOT_FOUND_PATTERN);
}

/**
 * Build a health probe result from an HTTP status code.
 * @param {string} url
 * @param {number} statusCode
 * @returns {Object}
 */
function buildHealthProbeResult(url, statusCode) {
  const ok = statusCode >= HTTP_OK_LOWER && statusCode <= HTTP_OK_UPPER;
  return createProbeResult({
    attempted: true,
    ok,
    statusCode,
    url,
    error: ok ? null : REACHABILITY_STATUS_HTTP + String(statusCode),
  });
}

function resolveReadinessPhaseRank(phase) {
  const normalizedPhase = typeof phase === 'string' ?
    phase.toUpperCase() :
    '';
  return READINESS_PHASE_RANK[normalizedPhase] || ZERO;
}

function normalizeReadinessProbeResult(probeResponse) {
  const normalized = {
    status: HTTP_ERROR_STATUS,
    phase: null,
    phaseRank: ZERO,
    state: null,
    reasons: [],
    retryAfterMs: null,
    stableWindowMs: null,
    stableElapsedMs: ZERO,
    stableSinceMs: null,
    readinessEpoch: null,
    timestamp: null,
    controlPlaneRecoveryReady: null,
    metadataPublicationReady: null,
    backgroundWorkReady: null,
    recoveryBlocked: null,
    recoveryStage: null,
    recoveryStageRank: null,
    publishedControlPlaneEpoch: null,
  };

  if (typeof probeResponse === 'number') {
    normalized.status = probeResponse;
    return normalized;
  }

  if (!probeResponse || typeof probeResponse !== 'object') {
    return normalized;
  }

  normalized.status = Number.isFinite(probeResponse.status) ?
    Math.floor(probeResponse.status) :
    HTTP_ERROR_STATUS;

  const body = probeResponse.body;
  if (!body || typeof body !== 'object') {
    return normalized;
  }

  normalized.phase = typeof body.phase === 'string' ? body.phase : null;
  normalized.phaseRank = Number.isFinite(body.phaseRank) ?
    Math.max(ZERO, Math.floor(body.phaseRank)) :
    resolveReadinessPhaseRank(normalized.phase);
  normalized.state = typeof body.state === 'string' ? body.state : null;
  normalized.reasons = Array.isArray(body.reasons) ?
    body.reasons.map((reason) => String(reason)) :
    [];
  normalized.retryAfterMs = Number.isFinite(body.retryAfterMs) ?
    Math.floor(body.retryAfterMs) :
    null;
  normalized.stableWindowMs = Number.isFinite(body.stableWindowMs) ?
    Math.max(ZERO, Math.floor(body.stableWindowMs)) :
    null;
  normalized.stableElapsedMs = Number.isFinite(body.stableElapsedMs) ?
    Math.max(ZERO, Math.floor(body.stableElapsedMs)) :
    ZERO;
  normalized.stableSinceMs = Number.isFinite(body.stableSinceMs) ?
    Math.floor(body.stableSinceMs) :
    null;
  normalized.readinessEpoch = Number.isFinite(body.readinessEpoch) ?
    Math.max(ZERO, Math.floor(body.readinessEpoch)) :
    (Number.isFinite(body.transitionCount) ?
      Math.max(ZERO, Math.floor(body.transitionCount)) :
      null);
  normalized.timestamp = Number.isFinite(body.timestamp) ?
    Math.floor(body.timestamp) :
    null;
  normalized.controlPlaneRecoveryReady =
    typeof body.controlPlaneRecoveryReady === 'boolean' ?
      body.controlPlaneRecoveryReady :
      null;
  normalized.metadataPublicationReady =
    typeof body.metadataPublicationReady === 'boolean' ?
      body.metadataPublicationReady :
      null;
  normalized.backgroundWorkReady =
    typeof body.backgroundWorkReady === 'boolean' ?
      body.backgroundWorkReady :
      null;
  normalized.recoveryBlocked =
    typeof body.recoveryBlocked === 'boolean' ?
      body.recoveryBlocked :
      null;
  normalized.recoveryStage = typeof body.recoveryStage === 'string' ?
    body.recoveryStage :
    null;
  normalized.recoveryStageRank = Number.isFinite(body.recoveryStageRank) ?
    Math.max(ZERO, Math.floor(body.recoveryStageRank)) :
    null;
  normalized.publishedControlPlaneEpoch =
    Number.isFinite(body.publishedControlPlaneEpoch) ?
      Math.max(ZERO, Math.floor(body.publishedControlPlaneEpoch)) :
      null;
  return normalized;
}

function buildBootstrapProgressSnapshot(probeResult) {
  const success = probeResult?.status >= HTTP_OK_LOWER &&
    probeResult?.status <= HTTP_OK_UPPER;
  const reasons = Array.isArray(probeResult?.reasons) ?
    probeResult.reasons :
    [];
  return {
    success,
    status: Number.isFinite(probeResult?.status) ?
      Math.floor(probeResult.status) :
      HTTP_ERROR_STATUS,
    statusRank: success ?
      2 :
      (Number.isFinite(probeResult?.status) &&
      probeResult.status > HTTP_ERROR_STATUS ? 1 : ZERO),
    phase: typeof probeResult?.phase === 'string' ?
      probeResult.phase :
      UNKNOWN_PHASE,
    phaseRank: Number.isFinite(probeResult?.phaseRank) ?
      Math.max(ZERO, Math.floor(probeResult.phaseRank)) :
      resolveReadinessPhaseRank(probeResult?.phase),
    reasons,
    reasonCount: reasons.length,
    stableElapsedMs: Number.isFinite(probeResult?.stableElapsedMs) ?
      Math.max(ZERO, Math.floor(probeResult.stableElapsedMs)) :
      ZERO,
    stableWindowMs: Number.isFinite(probeResult?.stableWindowMs) ?
      Math.max(ZERO, Math.floor(probeResult.stableWindowMs)) :
      null,
    readinessEpoch: Number.isFinite(probeResult?.readinessEpoch) ?
      Math.max(ZERO, Math.floor(probeResult.readinessEpoch)) :
      null,
  };
}

function compareBootstrapProgress(left, right) {
  if (!left) {
    return ZERO;
  }
  if (!right) {
    return 1;
  }
  if (left.success !== right.success) {
    return left.success ? 1 : -1;
  }
  if (left.phaseRank !== right.phaseRank) {
    return left.phaseRank > right.phaseRank ? 1 : -1;
  }
  if (left.statusRank !== right.statusRank) {
    return left.statusRank > right.statusRank ? 1 : -1;
  }
  if (left.reasonCount !== right.reasonCount) {
    return left.reasonCount < right.reasonCount ? 1 : -1;
  }
  if (left.stableElapsedMs !== right.stableElapsedMs) {
    return left.stableElapsedMs > right.stableElapsedMs ? 1 : -1;
  }
  return ZERO;
}

function summarizeBootstrapProgress(progress) {
  if (!progress || typeof progress !== 'object') {
    return {
      phase: UNKNOWN_PHASE,
      status: HTTP_ERROR_STATUS,
      reasons: UNKNOWN_REASON,
    };
  }
  const reasons = Array.isArray(progress.reasons) && progress.reasons.length > ZERO ?
    progress.reasons.join(',') :
    'none';
  return {
    phase: typeof progress.phase === 'string' ? progress.phase : UNKNOWN_PHASE,
    status: Number.isFinite(progress.status) ?
      Math.floor(progress.status) :
      HTTP_ERROR_STATUS,
    reasons,
  };
}

function resolveBootstrapProbeSleepMs(probeResult, defaultIntervalMs) {
  const retryAfterMs = Number.isFinite(probeResult?.retryAfterMs) ?
    Math.max(ZERO, Math.floor(probeResult.retryAfterMs)) :
    null;
  if (retryAfterMs === null || retryAfterMs <= ZERO) {
    return defaultIntervalMs;
  }
  return Math.max(defaultIntervalMs, retryAfterMs);
}

function isControlPlaneRecoveryReadyProbe(readiness) {
  if (!readiness || typeof readiness !== 'object') {
    return false;
  }
  if (readiness.controlPlaneRecoveryReady === true) {
    return true;
  }
  if (Number.isFinite(readiness.recoveryStageRank)) {
    return readiness.recoveryStageRank >=
      STARTUP_RECOVERY_STAGE_RANK_CONTROL_PLANE_RECOVERY_READY;
  }
  const success = Number.isFinite(readiness.status) &&
    readiness.status >= HTTP_OK_LOWER &&
    readiness.status <= HTTP_OK_UPPER;
  return success &&
    resolveReadinessPhaseRank(readiness.phase) >=
      READINESS_PHASE_RANK.CONTROL_READY;
}

/**
 * Normalize SQL/callback statements for compact query tracing.
 * @param {string} statement
 * @returns {string}
 */
function normalizeAdminStatement(statement) {
  return String(statement || '')
    .replace(ADMIN_QUERY_TRACE_NORMALIZE_PATTERN, ' ')
    .trim();
}

/**
 * Build a short SQL preview for admin query tracing.
 * @param {string} statement
 * @returns {string|null}
 */
function buildAdminStatementPreview(statement) {
  const normalized = normalizeAdminStatement(statement);
  if (normalized.length === ZERO) {
    return null;
  }
  return normalized.length > ADMIN_QUERY_TRACE_SQL_PREVIEW_MAX_LENGTH ?
    normalized.slice(ZERO, ADMIN_QUERY_TRACE_SQL_PREVIEW_MAX_LENGTH) :
    normalized;
}

/**
 * Build a stable SQL fingerprint for cross-report correlation.
 * @param {string} statement
 * @returns {string|null}
 */
function buildAdminStatementFingerprint(statement) {
  const normalized = normalizeAdminStatement(statement).toLowerCase();
  if (normalized.length === ZERO) {
    return null;
  }
  return createHash('sha1')
    .update(normalized)
    .digest('hex')
    .slice(ZERO, ADMIN_QUERY_TRACE_SQL_FINGERPRINT_LENGTH);
}

/**
 * Resolve the request statement field for trace diagnostics.
 * @param {Object} requestPayload
 * @returns {string}
 */
function resolveAdminRequestStatement(requestPayload) {
  if (!requestPayload || typeof requestPayload !== 'object') {
    return '';
  }
  if (typeof requestPayload.sql === 'string') {
    return requestPayload.sql;
  }
  if (typeof requestPayload.statement === 'string') {
    return requestPayload.statement;
  }
  return '';
}

/**
 * Convert an error-like value into a stable message.
 * @param {*} error
 * @returns {string}
 */
function normalizeAdminQueryError(error) {
  if (error && typeof error.message === 'string' && error.message.length > ZERO) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > ZERO) {
    return error;
  }
  return ADMIN_QUERY_TRACE_ERROR_UNKNOWN;
}

/**
 * Determine whether a query failure message is timeout-shaped.
 * @param {string} message
 * @returns {boolean}
 */
function isTimeoutErrorMessage(message) {
  return String(message || '')
    .toLowerCase()
    .includes(ERROR_MESSAGE_TIMEOUT_FRAGMENT);
}

/**
 * Lightweight handle for interacting with a single cluster node.
 */
class NodeHandle {
  constructor(
    id,
    containerId,
    ip,
    role,
    dockerProvider,
    adminApiPort = PORTS.ADMIN_API,
    options = {},
  ) {
    this.id = id;
    this.containerId = containerId;
    this.ip = ip;
    this.role = role;
    this._dockerProvider = dockerProvider;
    this._adminApiPort = adminApiPort;
    this._adminSocketByLane = new Map();
    this._adminSocketReadyByLane = new Map();
    this._pendingAdminSocketByLane = new Map();
    this._pendingQueriesByLane = new Map();
    this._adminQueryTrace = [];
    this._logStreamListeners = new Set();
    this._lastReachabilityDiagnostics = null;
    this._defaultAdminQueryTimeoutMs = resolvePositiveTimeoutMs(
      options.adminQueryTimeoutMs,
      ADMIN_QUERY_TIMEOUT_MS,
    );
  }

  _resolveAdminQueryTimeoutMs(timeoutMs) {
    return resolvePositiveTimeoutMs(
      timeoutMs,
      this._defaultAdminQueryTimeoutMs,
    );
  }

  /**
   * Query the Admin API via WebSocket.
   * Connects to ws://{ip}:8081/api/admin/stream, sends SQL,
   * returns results.
   */
  async query(sql, params = []) {
    return this.queryWithTimeout(sql, params, {
      timeoutMs: this._defaultAdminQueryTimeoutMs,
    });
  }

  /**
   * Query the Admin API via WebSocket with request timeout override.
   * @param {string} sql
   * @param {Array<*>} [params]
   * @param {Object} [options]
   * @param {number} [options.timeoutMs]
   * @returns {Promise<Object>}
   */
  async queryWithTimeout(sql, params = [], options = {}) {
    const lane = this._resolveAdminLane(options);
    const timeoutMs = this._resolveAdminQueryTimeoutMs(options.timeoutMs);
    return this._sendAdminRequest(
      {
        type: QUERY_MESSAGE_TYPE,
        sql,
        params: Array.isArray(params) ? params : [],
        timeoutMs,
      },
      'query',
      {
        ...options,
        timeoutMs,
        lane,
      },
    );
  }

  /**
   * Execute a partition callback via Admin API WebSocket.
   * @param {Object} payload
   * @param {string} payload.statement - SELECT statement.
   * @param {Array<*>} [payload.parameters] - Bind parameters.
   * @param {string} payload.callbackModuleRef - Module reference.
   * @param {string} payload.callbackExport - Callback export.
   * @param {string} payload.runtimeKind - Runtime kind.
   * @returns {Promise<Object>} Callback execution result payload.
   */
  async partitionCallback(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error(
        'Partition callback payload must be an object for node ' +
        this.id,
      );
    }
    return this._sendAdminRequest(
      {
        type: PARTITION_CALLBACK_MESSAGE_TYPE,
        statement: payload.statement,
        parameters: Array.isArray(payload.parameters) ?
          payload.parameters :
          [],
        callbackModuleRef: payload.callbackModuleRef,
        callbackExport: payload.callbackExport,
        runtimeKind: payload.runtimeKind,
      },
      'partition callback',
    );
  }

  _resolveAdminLane(options = {}) {
    const lane = typeof options?.lane === 'string' ?
      options.lane.trim() :
      '';
    return lane.length > 0 ? lane : ADMIN_SOCKET_LANE_DEFAULT;
  }

  _getPendingQueries(lane) {
    if (!this._pendingQueriesByLane.has(lane)) {
      this._pendingQueriesByLane.set(lane, new Map());
    }
    return this._pendingQueriesByLane.get(lane);
  }

  /**
   * Return recent admin query trace entries for diagnostics.
   * @returns {Array<Object>}
   */
  getAdminQueryTraceSnapshot() {
    return this._adminQueryTrace.map((entry) => ({
      nodeId: entry.nodeId,
      queryId: entry.queryId,
      lane: entry.lane,
      requestType: entry.requestType,
      operation: entry.operation,
      statementPreview: entry.statementPreview,
      statementFingerprint: entry.statementFingerprint,
      timeoutMs: entry.timeoutMs,
      startedAtMs: entry.startedAtMs,
      socketReadyAtMs: entry.socketReadyAtMs,
      sentAtMs: entry.sentAtMs,
      resolvedAtMs: entry.resolvedAtMs,
      timeoutAtMs: entry.timeoutAtMs,
      erroredAtMs: entry.erroredAtMs,
      durationMs: entry.durationMs,
      rowCount: entry.rowCount,
      outcome: entry.outcome,
      error: entry.error,
    }));
  }

  /**
   * Send one request over the shared admin socket and await query_result.
   * @param {Object} requestPayload
   * @param {string} operationLabel
   * @returns {Promise<Object>}
   * @private
   */
  async _sendAdminRequest(requestPayload, operationLabel, options = {}) {
    const requestTimeoutMs = this._resolveAdminQueryTimeoutMs(options.timeoutMs);
    const lane = this._resolveAdminLane(options);
    const queryId = this._nextQueryId();
    const timeoutMessage =
      'Admin API ' + operationLabel + ' timed out for node ' +
      this.id + ' on lane ' + lane + ' after ' + requestTimeoutMs + 'ms';
    const traceEntry = this._createAdminQueryTraceEntry({
      queryId,
      lane,
      requestPayload,
      operationLabel,
      timeoutMs: requestTimeoutMs,
    });
    let ws = null;
    try {
      ws = await withTimeout(
        this._getAdminSocket(lane),
        requestTimeoutMs,
        timeoutMessage,
      );
      traceEntry.socketReadyAtMs = Date.now();
    } catch (error) {
      const errorMessage = normalizeAdminQueryError(error);
      const outcome = isTimeoutErrorMessage(errorMessage) ?
        ADMIN_QUERY_TRACE_OUTCOME_TIMEOUT :
        ADMIN_QUERY_TRACE_OUTCOME_ERROR;
      this._finalizeAdminQueryTrace(traceEntry, outcome, {
        error: errorMessage,
      });
      throw error;
    }
    const pendingQueries = this._getPendingQueries(lane);

    return new Promise((resolve, reject) => {
      const rejectWithOutcome = (
        error,
        outcome = ADMIN_QUERY_TRACE_OUTCOME_ERROR,
      ) => {
        const normalizedError = error instanceof Error ?
          error :
          new Error(normalizeAdminQueryError(error));
        this._finalizeAdminQueryTrace(traceEntry, outcome, {
          error: normalizeAdminQueryError(normalizedError),
        });
        reject(normalizedError);
      };
      const resolveWithTrace = (result) => {
        const rowCount = Array.isArray(result?.rows) ? result.rows.length : null;
        this._finalizeAdminQueryTrace(traceEntry, ADMIN_QUERY_TRACE_OUTCOME_OK, {
          rowCount,
        });
        resolve(result);
      };

      const timeout = setTimeout(() => {
        pendingQueries.delete(queryId);
        rejectWithOutcome(
          new Error(timeoutMessage),
          ADMIN_QUERY_TRACE_OUTCOME_TIMEOUT,
        );
      }, requestTimeoutMs);

      pendingQueries.set(queryId, {
        resolve: resolveWithTrace,
        reject: (error) => rejectWithOutcome(error),
        timeout,
        operationLabel,
      });

      try {
        ws.send(JSON.stringify({
          ...requestPayload,
          queryId,
        }));
        traceEntry.sentAtMs = Date.now();
      } catch (err) {
        pendingQueries.delete(queryId);
        clearTimeout(timeout);
        this._resetAdminSocket(lane);
        try {
          ws.close();
        } catch (_closeErr) {
          // Best-effort cleanup
        }
        rejectWithOutcome(new Error(
          'Admin API ' + operationLabel + ' failed for node ' +
          this.id + ' on lane ' + lane + ': ' + err.message,
        ));
      }
    });
  }

  /**
   * Build stable request IDs for admin socket requests.
   * @returns {string}
   * @private
   */
  _nextQueryId() {
    return 'q-' + Date.now() + '-' +
      Math.random().toString(36).slice(2);
  }

  _createAdminQueryTraceEntry(options = {}) {
    const requestPayload = options.requestPayload;
    const statement = resolveAdminRequestStatement(requestPayload);
    const requestType = typeof requestPayload?.type === 'string' &&
      requestPayload.type.length > ZERO ?
      requestPayload.type :
      ADMIN_QUERY_TRACE_UNKNOWN;
    return {
      nodeId: this.id,
      queryId: options.queryId,
      lane: options.lane,
      requestType,
      operation: typeof options.operationLabel === 'string' &&
        options.operationLabel.length > ZERO ?
        options.operationLabel :
        ADMIN_QUERY_TRACE_UNKNOWN,
      statementPreview: buildAdminStatementPreview(statement),
      statementFingerprint: buildAdminStatementFingerprint(statement),
      timeoutMs: Number.isFinite(options.timeoutMs) ?
        Math.floor(options.timeoutMs) :
        null,
      startedAtMs: Date.now(),
      socketReadyAtMs: null,
      sentAtMs: null,
      resolvedAtMs: null,
      timeoutAtMs: null,
      erroredAtMs: null,
      durationMs: null,
      rowCount: null,
      outcome: ADMIN_QUERY_TRACE_OUTCOME_PENDING,
      error: null,
      finalized: false,
    };
  }

  _finalizeAdminQueryTrace(traceEntry, outcome, details = {}) {
    if (!traceEntry || traceEntry.finalized === true) {
      return;
    }
    const finalizedAtMs = Date.now();
    traceEntry.finalized = true;
    traceEntry.outcome = outcome;
    traceEntry.durationMs = finalizedAtMs - traceEntry.startedAtMs;
    traceEntry.error = typeof details.error === 'string' &&
      details.error.length > ZERO ?
      details.error :
      null;
    if (Number.isInteger(details.rowCount) && details.rowCount >= ZERO) {
      traceEntry.rowCount = details.rowCount;
    }
    if (outcome === ADMIN_QUERY_TRACE_OUTCOME_OK) {
      traceEntry.resolvedAtMs = finalizedAtMs;
    } else if (outcome === ADMIN_QUERY_TRACE_OUTCOME_TIMEOUT) {
      traceEntry.timeoutAtMs = finalizedAtMs;
    } else if (outcome === ADMIN_QUERY_TRACE_OUTCOME_ERROR) {
      traceEntry.erroredAtMs = finalizedAtMs;
    }
    this._recordAdminQueryTrace(traceEntry);
  }

  _recordAdminQueryTrace(traceEntry) {
    this._adminQueryTrace.push(traceEntry);
    const overflowCount =
      this._adminQueryTrace.length - ADMIN_QUERY_TRACE_MAX_ENTRIES;
    if (overflowCount > ZERO) {
      this._adminQueryTrace.splice(ZERO, overflowCount);
    }
  }

  /**
   * Close the long-lived Admin API WebSocket connection.
   */
  closeQueryConnection() {
    this._rejectPendingQueries(
      'Admin API query connection closed for node ' +
      this.id,
    );
    this._logStreamListeners.clear();
    for (const socket of this._adminSocketByLane.values()) {
      try {
        socket.close();
      } catch (_err) {
        // Best-effort cleanup
      }
    }
    for (const pendingSocket of this._pendingAdminSocketByLane.values()) {
      if (pendingSocket &&
        pendingSocket.readyState === WS_READY_STATE_CONNECTING) {
        closeWebSocketSafely(pendingSocket);
      }
    }
    this._resetAdminSocket();
  }

  /**
   * Subscribe to streamed logs delivered on the Admin API socket.
   * Listener receives log rows from cdc_event/live_query frames.
   * Returns an unsubscribe callback.
   * @param {Function} listener
   * @returns {Promise<Function>}
   */
  async subscribeLogStream(listener) {
    if (typeof listener !== 'function') {
      throw new Error(
        'Log stream listener must be a function for node ' +
        this.id,
      );
    }
    this._logStreamListeners.add(listener);
    try {
      await this._getAdminSocket();
    } catch (err) {
      this._logStreamListeners.delete(listener);
      throw err;
    }
    return () => {
      this._logStreamListeners.delete(listener);
    };
  }

  /**
   * Advertise harness log-subscription capabilities for this node.
   * LIVE SELECT is disabled to avoid parser-noise on unsupported syntax;
   * streaming events come from the admin socket.
   * @returns {{streamEvents: boolean, liveSelectQuery: boolean}}
   */
  getLogSubscriptionCapabilities() {
    return {
      [LOG_SUBSCRIPTION_CAPABILITY.STREAM_EVENTS]: true,
      [LOG_SUBSCRIPTION_CAPABILITY.LIVE_SELECT_QUERY]: false,
    };
  }

  async _getAdminSocket(lane = ADMIN_SOCKET_LANE_DEFAULT) {
    const existingSocket = this._adminSocketByLane.get(lane);
    if (existingSocket &&
        existingSocket.readyState === WS_READY_STATE_OPEN) {
      return existingSocket;
    }
    const pendingReadyPromise = this._adminSocketReadyByLane.get(lane);
    if (pendingReadyPromise) {
      return pendingReadyPromise;
    }

    const {default: WebSocket} = await import('ws');
    const laneQuery = encodeURIComponent(
      String(lane || ADMIN_SOCKET_LANE_DEFAULT),
    );
    const url =
      'ws://' + this.ip + ':' + this._adminApiPort +
      ADMIN_STREAM_PATH +
      '?lane=' + laneQuery;

    const readyPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this._pendingAdminSocketByLane.set(lane, ws);
      let settled = false;
      const connectTimeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        ws.off('open', onOpen);
        ws.off('error', onOpenError);
        closeWebSocketSafely(ws);
        this._resetAdminSocket(lane);
        reject(new Error(
          'Admin API query failed for node ' +
          this.id + ' on lane ' + lane + ': connection timed out',
        ));
      }, ADMIN_QUERY_TIMEOUT_MS);
      if (typeof connectTimeout.unref === 'function') {
        connectTimeout.unref();
      }

      const onOpen = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(connectTimeout);
        ws.off('error', onOpenError);
        this._pendingAdminSocketByLane.delete(lane);
        this._bindAdminSocketHandlers(ws, lane);
        this._adminSocketByLane.set(lane, ws);
        resolve(ws);
      };

      const onOpenError = (err) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(connectTimeout);
        ws.off('open', onOpen);
        this._pendingAdminSocketByLane.delete(lane);
        this._resetAdminSocket(lane);
        reject(new Error(
          'Admin API query failed for node ' +
          this.id + ' on lane ' + lane + ': ' + err.message,
        ));
      };

      ws.once('open', onOpen);
      ws.once('error', onOpenError);
    });
    this._adminSocketReadyByLane.set(lane, readyPromise);

    try {
      return await readyPromise;
    } catch (err) {
      this._resetAdminSocket(lane);
      throw err;
    }
  }

  _bindAdminSocketHandlers(ws, lane) {
    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        this._handleAdminSocketMessage(parsed, lane);
      } catch (_err) {
        // Ignore malformed frames and continue.
      }
    });

    ws.on('error', (err) => {
      this._rejectPendingQueries(
        'Admin API query failed for node ' +
        this.id + ' on lane ' + lane + ': ' + err.message,
        lane,
      );
      this._resetAdminSocket(lane);
    });

    ws.on('close', () => {
      this._rejectPendingQueries(
        'Admin API query connection closed before response ' +
        'for node ' + this.id + ' on lane ' + lane,
        lane,
      );
      this._resetAdminSocket(lane);
    });
  }

  _handleAdminSocketMessage(parsed, lane) {
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    if (parsed.type === QUERY_RESULT_MESSAGE_TYPE) {
      this._resolvePendingQuery(parsed, lane);
      return;
    }
    this._handleStreamedLogMessage(parsed);
  }

  _resolvePendingQuery(parsed, lane) {
    const queryId = parsed.queryId;
    if (!queryId) {
      return;
    }

    const pendingQueries = this._getPendingQueries(lane);
    const pending = pendingQueries.get(queryId);
    if (!pending) {
      return;
    }
    pendingQueries.delete(queryId);
    clearTimeout(pending.timeout);

    if (parsed.error) {
      const error = new Error(
        'Admin API ' + (pending.operationLabel || 'request') +
        ' failed for node ' +
        this.id + ' on lane ' + lane + ': ' + parsed.error,
      );
      if (typeof parsed.errorCode === 'string' &&
          parsed.errorCode.length > ZERO) {
        error.code = parsed.errorCode.toLowerCase();
      }
      if (typeof parsed.hint === 'string' &&
          parsed.hint.length > ZERO) {
        error.hint = parsed.hint;
      }
      if (parsed.deferRetry === true) {
        error.deferRetry = true;
      }
      if (Number.isFinite(parsed.retryAfterMs)) {
        error.retryAfterMs = Math.max(
          ZERO,
          Math.floor(parsed.retryAfterMs),
        );
      }
      pending.reject(error);
      return;
    }

    pending.resolve({
      rows: Array.isArray(parsed.results) ?
        parsed.results :
        [],
      count: parsed.count,
      partitions: parsed.partitions,
      tableName: parsed.tableName,
      operation: parsed.operation,
      affectedRows: parsed.affectedRows,
      hostResult: parsed.hostResult,
      callbackModuleRef: parsed.callbackModuleRef,
      callbackExport: parsed.callbackExport,
      warning: parsed.warning,
    });
  }

  _handleStreamedLogMessage(parsed) {
    if (this._logStreamListeners.size === 0) {
      return;
    }

    if (parsed.type === CDC_EVENT_MESSAGE_TYPE) {
      if (parsed.table !== LOGS_TABLE_NAME || !parsed.record) {
        return;
      }
      this._emitLogStreamEntry(parsed.record);
      return;
    }

    if (parsed.type === LIVE_QUERY_INITIAL_MESSAGE_TYPE) {
      const rows = Array.isArray(parsed.data) ? parsed.data : [];
      for (const row of rows) {
        this._emitLogStreamEntry(row);
      }
      return;
    }

    if (parsed.type !== LIVE_QUERY_EVENT_MESSAGE_TYPE) {
      return;
    }

    const payload = parsed.record || parsed.row ||
      parsed.data || parsed.new || parsed.old || null;

    if (Array.isArray(payload)) {
      for (const row of payload) {
        this._emitLogStreamEntry(row);
      }
      return;
    }

    this._emitLogStreamEntry(payload);
  }

  _emitLogStreamEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    for (const listener of this._logStreamListeners) {
      try {
        listener(entry);
      } catch (_err) {
        // Best-effort log streaming callback isolation.
      }
    }
  }

  _rejectPendingQueries(message, lane = null) {
    if (lane !== null) {
      const pendingQueries = this._pendingQueriesByLane.get(lane);
      if (!pendingQueries) {
        return;
      }
      for (const pending of pendingQueries.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(message));
      }
      pendingQueries.clear();
      return;
    }
    for (const pendingQueries of this._pendingQueriesByLane.values()) {
      for (const pending of pendingQueries.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(message));
      }
      pendingQueries.clear();
    }
  }

  _resetAdminSocket(lane = null) {
    if (lane !== null) {
      this._adminSocketByLane.delete(lane);
      this._adminSocketReadyByLane.delete(lane);
      this._pendingAdminSocketByLane.delete(lane);
      return;
    }
    this._adminSocketByLane.clear();
    this._adminSocketReadyByLane.clear();
    this._pendingAdminSocketByLane.clear();
    this._pendingQueriesByLane.clear();
  }

  /** Get node status from Admin API. */
  async getStatus(options = {}) {
    const lane = typeof options?.lane === 'string' ?
      options.lane :
      ADMIN_SOCKET_LANE_PROBE;
    const timeoutMs = this._resolveAdminQueryTimeoutMs(options?.timeoutMs);
    const discoverySnapshot = await this.queryWithTimeout(
      NODE_CLIENT_SERVICE_DISCOVERY_SQL,
      [],
      {
        lane,
        timeoutMs,
      },
    );
    const routingReady = this._resolveAdminRoutingReadiness(
      discoverySnapshot,
    );
    return {
      rows: [{
        status: routingReady ? STATUS_ACTIVE_LOWER : INACTIVE_STATE,
      }],
    };
  }

  /** Get local control snapshot from Admin API cache projection. */
  async getControlSnapshot(options = {}) {
    const lane = typeof options?.lane === 'string' ?
      options.lane :
      ADMIN_SOCKET_LANE_SNAPSHOT;
    const timeoutMs = this._resolveAdminQueryTimeoutMs(options?.timeoutMs);
    const sql = options?.forceRepair === true ?
      NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL :
      NODE_CLIENT_CONTROL_SNAPSHOT_SQL;
    return this.queryWithTimeout(
      sql,
      [],
      {
        lane,
        timeoutMs,
      },
    );
  }

  /** Get structured control-plane diagnostics directly from the snapshot lane. */
  async getControlPlaneLedgerSnapshot(options = {}) {
    const result = await this.getControlSnapshot(options);
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const firstRow = rows.length > 0 &&
      rows[0] &&
      typeof rows[0] === 'object' ?
      rows[0] :
      null;
    const controlPlaneDiagnostics =
      firstRow?.controlPlaneDiagnostics &&
        typeof firstRow.controlPlaneDiagnostics === 'object' ?
        JSON.parse(JSON.stringify(firstRow.controlPlaneDiagnostics)) :
        null;
    return {
      nodeId: this.id,
      capturedAt:
        typeof firstRow?.capturedAt === 'string' ? firstRow.capturedAt : null,
      capturedAtMs:
        Number.isFinite(firstRow?.capturedAtMs) ? firstRow.capturedAtMs :
          (Number.isFinite(firstRow?.capturedAt) ? firstRow.capturedAt : null),
      controlPlaneDiagnostics,
    };
  }

  /**
   * Probe lightweight bootstrap readiness.
   * @param {Object} [options]
   * @param {number} [options.timeoutMs]
   * @returns {Promise<Object>}
   */
  async probeBootstrapReadiness(options = {}) {
    const timeoutMs = resolvePositiveTimeoutMs(
      options?.timeoutMs,
      BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS,
    );
    const bootstrapJoinReadyUrl =
      'http://' + this.ip + ':' + PORTS.REST + BOOTSTRAP_JOIN_READY_PATH;
    const probeResponse = await httpRequest({
      url: bootstrapJoinReadyUrl,
      timeoutMs,
      method: HTTP_METHOD_GET,
      includeBody: true,
    });
    return normalizeReadinessProbeResult(probeResponse);
  }

  /**
   * Probe full traffic readiness.
   * @param {Object} [options]
   * @param {number} [options.timeoutMs]
   * @returns {Promise<Object>}
   */
  async probeTrafficReadiness(options = {}) {
    const timeoutMs = resolvePositiveTimeoutMs(
      options?.timeoutMs,
      BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS,
    );
    const trafficReadyUrl =
      'http://' + this.ip + ':' + PORTS.REST + BOOTSTRAP_TRAFFIC_READY_PATH;
    const probeResponse = await httpRequest({
      url: trafficReadyUrl,
      timeoutMs,
      method: HTTP_METHOD_GET,
      includeBody: true,
    });
    return normalizeReadinessProbeResult(probeResponse);
  }

  _resolveAdminRoutingReadiness(discoverySnapshot) {
    const rows = Array.isArray(discoverySnapshot?.rows) ?
      discoverySnapshot.rows :
      [];
    const firstRow = rows.length > 0 &&
      rows[0] &&
      typeof rows[0] === 'object' ?
      rows[0] :
      null;
    if (!firstRow) {
      return false;
    }
    const services = Array.isArray(firstRow[SERVICE_DISCOVERY_SERVICES_FIELD]) ?
      firstRow[SERVICE_DISCOVERY_SERVICES_FIELD] :
      [];
    for (const service of services) {
      if (!service || typeof service !== 'object') {
        continue;
      }
      const serviceIds = Array.isArray(service[SERVICE_DISCOVERY_SERVICE_IDS_FIELD]) ?
        service[SERVICE_DISCOVERY_SERVICE_IDS_FIELD] :
        [];
      if (!serviceIds.includes(NODE_CLIENT_SERVICE_ID_ADMIN_META)) {
        continue;
      }
      const replicas = Array.isArray(service[SERVICE_DISCOVERY_REPLICAS_FIELD]) ?
        service[SERVICE_DISCOVERY_REPLICAS_FIELD] :
        [];
      for (const replica of replicas) {
        if (!replica || typeof replica !== 'object') {
          continue;
        }
        const replicaNodeId =
          String(replica[SERVICE_DISCOVERY_REPLICA_NODE_ID_FIELD] || '');
        const replicaServiceId =
          String(replica[SERVICE_DISCOVERY_REPLICA_SERVICE_ID_FIELD] || '');
        if (replicaNodeId !== this.id ||
            replicaServiceId !== NODE_CLIENT_SERVICE_ID_ADMIN_META) {
          continue;
        }
        const readiness = replica[SERVICE_DISCOVERY_REPLICA_READINESS_FIELD];
        if (!readiness || typeof readiness !== 'object') {
          return false;
        }
        return readiness[SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD] === true;
      }
    }
    return false;
  }

  /** Get container logs. */
  async getLogs(options = {}) {
    return this._dockerProvider.getContainerLogs(
      this.containerId,
      options,
    );
  }

  /**
   * Probe node reachability with detailed diagnostics.
   * @returns {Promise<Object>}
   */
  async getReachabilityDiagnostics(options = {}) {
    const probeTimeoutMs = resolvePositiveTimeoutMs(
      options.timeoutMs,
      FETCH_TIMEOUT_MS,
    );
    const deadlineMs = Date.now() + probeTimeoutMs;
    const remainingProbeBudgetMs = () => {
      return Math.max(
        MIN_TIMEOUT_MS,
        deadlineMs - Date.now(),
      );
    };
    const bootstrapUrl =
      'http://' + this.ip + ':' + PORTS.REST + BOOTSTRAP_HEALTH_PATH;
    const adminUrl =
      'http://' + this.ip + ':' + this._adminApiPort + ADMIN_HEALTH_PATH;
    const adminEndpoint =
      'ws://' + this.ip + ':' + this._adminApiPort + ADMIN_STREAM_PATH;

    const diagnostics = {
      nodeId: this.id,
      timestamp: Date.now(),
      probeTimeoutMs,
      reachable: false,
      reachableBy: null,
      adminReady: false,
      controlPlaneRecoveryReady: false,
      publishedControlPlaneEpoch: null,
      recoveryStage: null,
      recoveryStageRank: null,
      bootstrapHealth: createProbeResult({
        url: bootstrapUrl,
      }),
      bootstrapReadiness: null,
      adminHealth: createProbeResult({
        url: adminUrl,
      }),
      adminWs: createProbeResult({
        endpoint: adminEndpoint,
      }),
      sqlProbe: createProbeResult({
        query: REACHABILITY_PROBE_SQL,
      }),
      lastError: null,
    };

    const bootstrapStatus = await httpGet(
      bootstrapUrl,
      remainingProbeBudgetMs(),
    );
    diagnostics.bootstrapHealth = buildHealthProbeResult(
      bootstrapUrl,
      bootstrapStatus,
    );
    if (diagnostics.bootstrapHealth.ok) {
      diagnostics.reachable = true;
      diagnostics.reachableBy = REACHABILITY_SOURCE_BOOTSTRAP_HEALTH;
      diagnostics.lastError = null;
    } else {
      diagnostics.lastError = diagnostics.bootstrapHealth.error;
    }

    try {
      const bootstrapReadiness = await this.probeBootstrapReadiness({
        timeoutMs: remainingProbeBudgetMs(),
      });
      diagnostics.bootstrapReadiness = bootstrapReadiness;
      diagnostics.controlPlaneRecoveryReady =
        isControlPlaneRecoveryReadyProbe(bootstrapReadiness);
      diagnostics.publishedControlPlaneEpoch =
        Number.isFinite(bootstrapReadiness?.publishedControlPlaneEpoch) ?
          Math.max(
            ZERO,
            Math.floor(bootstrapReadiness.publishedControlPlaneEpoch),
          ) :
          null;
      diagnostics.recoveryStage =
        typeof bootstrapReadiness?.recoveryStage === 'string' ?
          bootstrapReadiness.recoveryStage :
          null;
      diagnostics.recoveryStageRank =
        Number.isFinite(bootstrapReadiness?.recoveryStageRank) ?
          Math.max(ZERO, Math.floor(bootstrapReadiness.recoveryStageRank)) :
          null;
    } catch (_error) {
      diagnostics.bootstrapReadiness = null;
    }

    const adminStatus = await httpGet(
      adminUrl,
      remainingProbeBudgetMs(),
    );
    diagnostics.adminHealth = buildHealthProbeResult(
      adminUrl,
      adminStatus,
    );
    if (diagnostics.adminHealth.ok) {
      diagnostics.reachable = true;
      diagnostics.reachableBy = REACHABILITY_SOURCE_ADMIN_HEALTH;
      diagnostics.adminReady = true;
      diagnostics.lastError = null;
      this._lastReachabilityDiagnostics = diagnostics;
      return diagnostics;
    }
    diagnostics.lastError = diagnostics.adminHealth.error;

    try {
      await withTimeout(
        this._getAdminSocket(),
        remainingProbeBudgetMs(),
        'Admin WebSocket probe timed out for node ' + this.id,
      );
      diagnostics.adminWs = createProbeResult({
        attempted: true,
        ok: true,
        endpoint: adminEndpoint,
      });
      diagnostics.reachable = true;
      diagnostics.reachableBy = REACHABILITY_SOURCE_ADMIN_WS;
      diagnostics.adminReady = true;
      diagnostics.lastError = null;
      this._lastReachabilityDiagnostics = diagnostics;
      return diagnostics;
    } catch (err) {
      diagnostics.adminWs = createProbeResult({
        attempted: true,
        ok: false,
        endpoint: adminEndpoint,
        error: normalizeProbeError(err),
      });
      diagnostics.lastError = diagnostics.adminWs.error;
    }

    try {
      await this.queryWithTimeout(
        REACHABILITY_PROBE_SQL,
        [],
        {
          timeoutMs: remainingProbeBudgetMs(),
          lane: ADMIN_SOCKET_LANE_PROBE,
        },
      );
      diagnostics.sqlProbe = createProbeResult({
        attempted: true,
        ok: true,
        query: REACHABILITY_PROBE_SQL,
      });
      diagnostics.reachable = true;
      diagnostics.reachableBy = REACHABILITY_SOURCE_SQL_PROBE;
      diagnostics.adminReady = true;
      diagnostics.lastError = null;
      this._lastReachabilityDiagnostics = diagnostics;
      return diagnostics;
    } catch (err) {
      diagnostics.sqlProbe = createProbeResult({
        attempted: true,
        ok: false,
        query: REACHABILITY_PROBE_SQL,
        error: normalizeProbeError(err),
      });
      diagnostics.lastError = diagnostics.sqlProbe.error;
    }

    this._lastReachabilityDiagnostics = diagnostics;
    return diagnostics;
  }

  /** Check if node is reachable via HTTP GET to REST port. */
  async isReachable() {
    const diagnostics = await this.getReachabilityDiagnostics();
    return diagnostics.reachable === true;
  }

  /**
   * Return the latest computed reachability diagnostics.
   * @returns {Object|null}
   */
  getLastReachabilityDiagnostics() {
    return this._lastReachabilityDiagnostics;
  }
}

/**
 * Distribute node indices across Docker hosts in round-robin
 * fashion, respecting the nodesPerHost limit.
 */
function distributeNodes(size, providers, nodesPerHost) {
  const hostCount = providers.length;
  const perHostCount = new Array(hostCount).fill(0);
  const assignment = [];

  let hostIdx = 0;
  for (let i = 0; i < size; i++) {
    let assigned = false;
    for (let attempt = 0; attempt < hostCount; attempt++) {
      const candidate = (hostIdx + attempt) % hostCount;
      if (perHostCount[candidate] < nodesPerHost) {
        assignment.push(candidate);
        perHostCount[candidate]++;
        hostIdx = (candidate + 1) % hostCount;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      break;
    }
  }

  return assignment;
}

/**
 * Unified startup readiness gate.
 * Drives startup readiness through deterministic states:
 * seed_live -> seed_join_ready -> cluster_active.
 */
class StartupGate {
  /**
   * @param {Cluster} cluster
   * @param {NodeHandle} seedNode
   * @param {string} seedNodeId
   */
  constructor(cluster, seedNode, seedNodeId) {
    this._cluster = cluster;
    this._seedNode = seedNode;
    this._seedNodeId = seedNodeId;
    this._state = STARTUP_GATE_STATE.SEED_LIVE;
  }

  getState() {
    return this._state;
  }

  /**
   * Wait until seed bootstrap endpoint is join-ready.
   * @returns {Promise<void>}
   */
  async waitForSeedJoinReady() {
    this._cluster._recordClusterStage(
      CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING,
      {
        nodeId: this._seedNodeId,
        startupGateState: this._state,
      },
    );
    await this._cluster._waitForBootstrapApi(this._seedNode);
    this._state = STARTUP_GATE_STATE.SEED_JOIN_READY;
    this._cluster._recordClusterStage(
      CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_READY,
      {
        nodeId: this._seedNodeId,
        startupGateState: this._state,
      },
    );
  }

  /**
   * Wait until all cluster nodes are ACTIVE.
   * @param {number} expectedNodeCount
   * @returns {Promise<void>}
   */
  async waitForClusterActive(expectedNodeCount) {
    if (this._state !== STARTUP_GATE_STATE.SEED_JOIN_READY) {
      throw new Error(
        'Startup gate state violation: expected ' +
        STARTUP_GATE_STATE.SEED_JOIN_READY +
        ' before cluster-active wait, got ' + this._state,
      );
    }

    this._cluster._recordClusterStage(
      CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
      {
        expectedNodeCount,
        startupGateState: this._state,
      },
    );
    await this._cluster._waitForAllActive({
      mode: CLUSTER_READINESS_MODE_STARTUP,
    });
    this._state = STARTUP_GATE_STATE.CLUSTER_ACTIVE;
    this._cluster._recordClusterStage(
      CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE,
      {
        nodeCount: this._cluster._nodes.size,
        startupGateState: this._state,
      },
    );
  }
}

/**
 * Unified cluster abstraction.
 * Scenarios interact exclusively with this interface.
 */
class Cluster {
  constructor(config, providers, hostAssignment) {
    this._config = config;
    this._providers = providers;
    this._hostAssignment = hostAssignment;
    this._clusterId = uuidv4();
    this._scenarioName = config.scenarioName || 'unknown-scenario';
    this._networkId = null;
    this._networkName = null;
    this._nodes = new Map();
    this._started = false;
    this._chaos = null;
    this._logCollector = new LogCollector(
      config.outputDir,
    );
    this._logAnalyzer = new LogAnalyzer(
      config.outputDir,
    );
    this._playbackRecorder = new PlaybackRecorder({
      outputDir: config.outputDir,
    });
    this._playbackManifest = null;
    this._playbackStartWarning = null;
    this._traceRecorder = null;
    this._traceManifest = null;
    this._traceStartWarning = null;
    this._cleanupUnregister = null;
    this._reuseLeaseRelease = null;
    this._reuseLeasePath = null;
    this._reuseContainersEnabledOverride = null;
    this._reuseLeaseFallbackWarning = null;
    this._httpGet = httpGet;
    this._httpRequest = httpRequest;
    this._activeLoadRuns = new Set();
  }

  _isContainerReuseEnabled() {
    if (typeof this._reuseContainersEnabledOverride === 'boolean') {
      return this._reuseContainersEnabledOverride;
    }
    const dockerConfig =
      this._config && typeof this._config.docker === 'object' ?
        this._config.docker :
        {};
    const hasRemoteHosts = Array.isArray(dockerConfig.hosts) &&
      dockerConfig.hosts.length > 0;
    return !hasRemoteHosts && dockerConfig.reuseContainers === true;
  }

  _buildReusableNetworkName() {
    return NETWORK.NAME_PREFIX +
      '-' +
      REUSE_NETWORK_NAME_SUFFIX +
      '-' +
      String(this._config.size);
  }

  _resolveReusableLeasePath() {
    return resolvePath(
      process.cwd(),
      REUSE_LEASE_DIRNAME,
      REUSE_LEASE_FILE_PREFIX +
        '-' +
        String(this._config.size) +
        '.lock',
    );
  }

  _resolveReusableLeaseTimeoutMs() {
    const startupTimeout = this._config.timeouts?.nodeStartup ||
      TIMEOUTS.NODE_STARTUP;
    return Math.max(
      REUSE_LEASE_MIN_TIMEOUT_MS,
      startupTimeout,
    );
  }

  async _acquireReusableClusterLease() {
    if (!this._isContainerReuseEnabled() ||
        typeof this._reuseLeaseRelease === 'function') {
      return;
    }

    const lease = await acquireReusableClusterLease({
      lockPath: this._resolveReusableLeasePath(),
      metadata: {
        pid: process.pid,
        clusterId: this._clusterId,
        scenarioName: this._scenarioName,
        clusterSize: this._config.size,
        networkName: this._buildReusableNetworkName(),
        cwd: process.cwd(),
        acquiredAtMs: Date.now(),
      },
      timeoutMs: this._resolveReusableLeaseTimeoutMs(),
      pollIntervalMs: REUSE_LEASE_POLL_INTERVAL_MS,
      sleep: (ms) => this._sleep(ms),
    });
    this._reuseLeaseRelease = lease.release;
    this._reuseLeasePath = lease.lockPath;
  }

  async _prepareReusableClusterLeaseForStart() {
    if (!this._isContainerReuseEnabled()) {
      return;
    }
    try {
      await this._acquireReusableClusterLease();
      this._reuseLeaseFallbackWarning = null;
    } catch (error) {
      if (!isReusableClusterLeaseTimeoutError(error)) {
        throw error;
      }
      this._reuseContainersEnabledOverride = false;
      this._reuseLeaseFallbackWarning =
        error?.message || 'Reusable cluster lease timeout';
    }
  }

  async _releaseReusableClusterLease() {
    if (typeof this._reuseLeaseRelease !== 'function') {
      this._reuseLeasePath = null;
      return;
    }

    const release = this._reuseLeaseRelease;
    this._reuseLeaseRelease = null;
    this._reuseLeasePath = null;
    await release();
  }

  _buildNodeId(nodeIndex) {
    if (this._isContainerReuseEnabled()) {
      return uuidv5(
        REUSE_NODE_ID_PREFIX + String(nodeIndex + 1),
        REUSE_NODE_ID_NAMESPACE,
      );
    }
    return uuidv4();
  }

  _buildContainerName(nodeId, nodeIndex) {
    if (this._isContainerReuseEnabled()) {
      return REUSE_CONTAINER_NAME_PREFIX +
        '-' +
        String(this._config.size) +
        '-' +
        String(nodeIndex + 1);
    }
    return 'ddb-test-' + this._clusterId.slice(0, 8) + '-' + nodeId;
  }

  _buildNodeEnv(nodeId, containerName, seedIp) {
    const env = {};
    const partitionConfig =
      this._config?.partition && typeof this._config.partition === 'object' ?
        this._config.partition :
        null;
    env[CONTAINER_ENV_KEYS.NODE_ID] = nodeId;
    env[CONTAINER_ENV_KEYS.DATA_DIR] = DATA_DIR_PATH;
    env[CONTAINER_ENV_KEYS.NODE_ADDRESS] =
      containerName + ':' + PORTS.REST;
    env[WS_HOST_ENV_KEY] = WS_BIND_ALL_HOST;
    env[RAFT_PROVIDER_ENV_KEY] =
      String(this._config.raftProvider || RAFT_PROVIDER_DEFAULTS.provider);
    if (this._config?.memoryLeak?.captureHeapArtifacts === true) {
      const nearLimitCount = Number.isInteger(
        this._config?.memoryLeak?.heapSnapshotNearLimitCount,
      ) &&
      this._config.memoryLeak.heapSnapshotNearLimitCount >=
        HEAP_SNAPSHOT_NEAR_LIMIT_MIN_COUNT ?
        this._config.memoryLeak.heapSnapshotNearLimitCount :
        HEAP_SNAPSHOT_NEAR_LIMIT_DEFAULT_COUNT;
      const existingNodeOptions = String(env[NODE_OPTIONS_ENV_KEY] || '').trim();
      const leakNodeOptions = [
        NODE_OPTION_HEAP_PROF,
        NODE_OPTION_HEAP_SNAPSHOT_NEAR_LIMIT_PREFIX + nearLimitCount,
      ].join(' ');
      env[NODE_OPTIONS_ENV_KEY] = existingNodeOptions ?
        existingNodeOptions + ' ' + leakNodeOptions :
        leakNodeOptions;
    }

    if (seedIp) {
      env[CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS] =
        seedIp + ':' + PORTS.REST;
      env[JOINING_HTTP_TIMEOUT_ENV_KEY] = String(
        resolvePositiveTimeoutMs(
          this._config?.timeouts?.joiningHttpTimeoutMs,
          JOINING_HTTP_TIMEOUT_DEFAULT_MS,
        ),
      );
      env[JOINING_LEADERSHIP_WAIT_TIMEOUT_ENV_KEY] = String(
        resolvePositiveTimeoutMs(
          this._config?.timeouts?.joiningLeadershipWaitTimeoutMs,
          JOINING_LEADERSHIP_WAIT_TIMEOUT_DEFAULT_MS,
        ),
      );
    }

    if (Number.isInteger(partitionConfig?.splitThresholdBytes) &&
        partitionConfig.splitThresholdBytes > ZERO) {
      env[PARTITION_ENV_KEYS.SPLIT_THRESHOLD_BYTES] =
        String(partitionConfig.splitThresholdBytes);
    }
    if (Number.isInteger(partitionConfig?.splitThresholdQpm) &&
        partitionConfig.splitThresholdQpm > ZERO) {
      env[PARTITION_ENV_KEYS.SPLIT_THRESHOLD_QPM] =
        String(partitionConfig.splitThresholdQpm);
    }
    if (Number.isInteger(partitionConfig?.mergeThresholdBytes) &&
        partitionConfig.mergeThresholdBytes > ZERO) {
      env[PARTITION_ENV_KEYS.MERGE_THRESHOLD_BYTES] =
        String(partitionConfig.mergeThresholdBytes);
    }
    if (Number.isInteger(partitionConfig?.mergeThresholdQpm) &&
        partitionConfig.mergeThresholdQpm > ZERO) {
      env[PARTITION_ENV_KEYS.MERGE_THRESHOLD_QPM] =
        String(partitionConfig.mergeThresholdQpm);
    }
    if (Number.isInteger(partitionConfig?.evaluationIntervalMs) &&
        partitionConfig.evaluationIntervalMs > ZERO) {
      env[PARTITION_ENV_KEYS.EVALUATION_INTERVAL_MS] =
        String(partitionConfig.evaluationIntervalMs);
    }
    return env;
  }

  _shouldRecreateReusableContainer(inspect, expectedEnv = {}) {
    if (!inspect || typeof inspect !== 'object') {
      return true;
    }
    for (const [key, value] of Object.entries(expectedEnv)) {
      const currentValue = readContainerInspectEnvValue(inspect, key);
      if (String(currentValue || '') !== String(value)) {
        return true;
      }
    }

    const entrypoint = Array.isArray(inspect?.Config?.Entrypoint) ?
      inspect.Config.Entrypoint :
      [];
    if (entrypoint.length !== REUSE_ENTRYPOINT.length ||
        entrypoint[0] !== REUSE_ENTRYPOINT[0] ||
        entrypoint[1] !== REUSE_ENTRYPOINT[1]) {
      return true;
    }

    const cmd = Array.isArray(inspect?.Config?.Cmd) ?
      inspect.Config.Cmd :
      [];
    if (cmd.length !== REUSE_START_COMMAND_ARGS.length ||
        cmd[0] !== REUSE_START_COMMAND_ARGS[0]) {
      return true;
    }

    return false;
  }

  _getReusableControlDir(containerName) {
    return resolvePath(
      REUSE_LEASE_DIRNAME,
      REUSE_CONTROL_DIRNAME,
      containerName,
    );
  }

  _getReusableControlBind(containerName) {
    return this._getReusableControlDir(containerName) +
      ':' +
      REUSE_CONTROL_MOUNT_PATH;
  }

  async _markReusableContainerForDataReset(containerName) {
    const controlDir = this._getReusableControlDir(containerName);
    await fs.mkdir(controlDir, {recursive: true});
    await fs.writeFile(
      resolvePath(controlDir, REUSE_RESET_FLAG_FILENAME),
      '',
      'utf8',
    );
  }

  async _quiesceReusableContainers() {
    if (!this._isContainerReuseEnabled()) {
      return;
    }
    const provider = this._providers[this._hostAssignment[0]];
    const reusableContainerNames = [];
    const reusableContainerNameSet = new Set();
    const addContainerName = (containerName) => {
      if (typeof containerName !== 'string' || containerName.length === 0) {
        return;
      }
      if (reusableContainerNameSet.has(containerName)) {
        return;
      }
      reusableContainerNameSet.add(containerName);
      reusableContainerNames.push(containerName);
    };

    for (let index = 0; index < this._config.size; index++) {
      const nodeId = this._buildNodeId(index);
      addContainerName(this._buildContainerName(nodeId, index));
    }

    if (typeof provider.listContainers === 'function') {
      const reusePrefix =
        REUSE_CONTAINER_NAME_PREFIX + '-' + String(this._config.size) + '-';
      let containers = [];
      try {
        containers = await provider.listContainers();
      } catch (_listErr) {
        containers = [];
      }
      for (const container of containers) {
        const names = Array.isArray(container?.Names) ?
          container.Names :
          [];
        for (const rawName of names) {
          const normalizedName = typeof rawName === 'string' ?
            rawName.replace(/^\/+/, '') :
            '';
          if (!normalizedName.startsWith(reusePrefix)) {
            continue;
          }
          addContainerName(normalizedName);
        }
      }
    }

    for (const containerName of reusableContainerNames) {
      let inspect = null;
      try {
        inspect = await provider.inspectContainerIfExists(containerName);
      } catch (_inspectErr) {
        inspect = null;
      }
      if (!inspect) {
        continue;
      }
      const containerId = inspect.Id || inspect.id || containerName;
      const status = String(inspect?.State?.Status || '').toLowerCase();
      if (status !== CONTAINER_RUNNING_STATUS) {
        continue;
      }
      try {
        await provider.stopContainer(containerId);
      } catch (error) {
        if (!isIgnorableContainerStopError(error)) {
          throw error;
        }
      }
    }
  }

  /**
   * Start the cluster: create network, start seed, wait for
   * bootstrap API, start joiners sequentially, wait for ACTIVE.
   */
  async start() {
    if (!this._cleanupUnregister) {
      this._cleanupUnregister = registerClusterCleanup(
        this._providers[this._hostAssignment[0]],
        this._clusterId,
      );
    }
    await this._prepareReusableClusterLeaseForStart();

    try {
      await this._playbackRecorder.start({
        scenarioName: this._scenarioName,
        cluster: this,
        skipInitialCapture: true,
      });
      this._playbackStartWarning = null;
    } catch (_err) {
      // Playback capture is best-effort.
      this._playbackStartWarning = 'Failed to initialize playback capture';
    }

    const provider = this._providers[this._hostAssignment[0]];
    const reuseContainers = this._isContainerReuseEnabled();
    this._networkName = reuseContainers ?
      this._buildReusableNetworkName() :
      NETWORK.NAME_PREFIX + '-' + this._clusterId.slice(0, 8);
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_NETWORK_CREATING,
      {
        networkName: this._networkName,
      },
    );
    const networkLabels = {
      [LABELS.CLUSTER]: this._clusterId,
    };
    const net = reuseContainers ?
      await provider.ensureNetwork(
        this._networkName,
        networkLabels,
      ) :
      await provider.createNetwork(
        this._networkName,
        networkLabels,
      );
    this._networkId = net.id;
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_NETWORK_CREATED,
      {
        networkName: this._networkName,
        networkId: this._networkId,
      },
    );
    if (reuseContainers) {
      await this._quiesceReusableContainers();
    }

    const seedId = this._buildNodeId(0);
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_SEED_STARTING,
      {
        nodeId: seedId,
      },
    );
    const seedNode = await this._startNode(
      seedId,
      NODE_ROLES.SEED,
      null,
      0,
    );
    this._nodes.set(seedId, seedNode);
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.NODE_CREATED,
      PLAYBACK_SCOPE_NODE,
      seedId,
      {
        role: NODE_ROLES.SEED,
        ip: seedNode.ip,
        containerId: seedNode.containerId,
      },
    );
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.NODE_STARTED,
      PLAYBACK_SCOPE_NODE,
      seedId,
      {
        role: NODE_ROLES.SEED,
      },
    );

    const startupGate = new StartupGate(
      this,
      seedNode,
      seedId,
    );
    await startupGate.waitForSeedJoinReady();

    for (let i = 1; i < this._config.size; i++) {
      const joinerId = this._buildNodeId(i);
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_JOINER_STARTING,
        {
          nodeId: joinerId,
          ordinal: i,
        },
      );
      const joinerNode = await this._startNode(
        joinerId,
        NODE_ROLES.JOINER,
        seedNode.ip,
        i,
      );
      this._nodes.set(joinerId, joinerNode);
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.NODE_CREATED,
        PLAYBACK_SCOPE_NODE,
        joinerId,
        {
          role: NODE_ROLES.JOINER,
          ip: joinerNode.ip,
          containerId: joinerNode.containerId,
        },
      );
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.NODE_STARTED,
        PLAYBACK_SCOPE_NODE,
        joinerId,
        {
          role: NODE_ROLES.JOINER,
          seedIp: seedNode.ip,
        },
      );
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_JOINER_STARTED,
        {
          nodeId: joinerId,
          ordinal: i,
        },
      );
    }

    await startupGate.waitForClusterActive(this._config.size);
    this._started = true;
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CLUSTER_READY,
      PLAYBACK_SCOPE_CLUSTER,
      PLAYBACK_ENTITY_CLUSTER,
      {
        nodeCount: this._nodes.size,
      },
    );

    if (this._config.debugTrace &&
      this._config.debugTrace.enabled === true) {
      try {
        this._traceRecorder = new TraceArtifactRecorder({
          outputDir: this._config.outputDir,
        });
        await this._traceRecorder.start({
          scenarioName: this._scenarioName,
          node: seedNode,
          debugTrace: this._config.debugTrace,
        });
        this._traceManifest = null;
        this._traceStartWarning = null;
      } catch (error) {
        this._traceStartWarning =
          'Failed to initialize trace capture: ' +
          error.message;
      }
    }

    // Initialize chaos primitives now that nodes and network exist
    const primaryProvider =
      this._providers[this._hostAssignment[0]];
    this._chaos = new ChaosPrimitives(
      primaryProvider,
      this._nodes,
      this._networkId,
    );

    // Start live log subscription on the seed node
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_LOG_SUB_STARTING,
      {
        nodeId: seedId,
      },
    );
    try {
      await this._logCollector.startLiveSubscription(seedNode);
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_LOG_SUB_READY,
        {
          nodeId: seedId,
        },
      );
    } catch (_err) {
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_LOG_SUB_FAILED,
        {
          nodeId: seedId,
        },
      );
      // Log collection is best-effort; cluster still usable
    }
  }

  /** Stop and remove all containers, networks, volumes. */
  async stop() {
    const errors = [];
    const reuseContainers = this._isContainerReuseEnabled();
    try {
      if (typeof this._playbackRecorder.beginShutdown === 'function') {
        await this._playbackRecorder.beginShutdown({
          awaitInFlightCaptures: true,
        });
      } else {
        this._playbackRecorder.suspendPolling();
      }
      this._recordClusterStage(
        CLUSTER_STAGE_TEARDOWN_STARTING,
        {
          nodeCount: this._nodes.size,
        },
      );
      await this._cancelActiveLoadRuns();

      // Collect final log snapshot and run analysis before teardown
      try {
        const seedNode = this._nodes.values().next().value;
        if (seedNode) {
          await this._logCollector.collectFinalSnapshot(seedNode);
        }
      } catch (_err) {
        // Best-effort log collection
      }

      try {
        await this._logCollector.stopSubscription();
      } catch (_err) {
        // Best-effort cleanup
      }

      if (this._traceRecorder) {
        try {
          this._traceManifest = await this._traceRecorder.stop();
        } catch (err) {
          this._traceManifest = {
            warning: 'Failed to finalize trace artifacts: ' + err.message,
          };
        }
      }

      for (const [nodeId, node] of this._nodes) {
        try {
          node.closeQueryConnection();
        } catch (_err) {
          // Best-effort stop
        }
        await this._stopNodeContainerForTeardown(nodeId, node, errors);
        if (!reuseContainers) {
          try {
            await node._dockerProvider.removeContainer(
              node.containerId,
            );
            this._recordPlaybackEvent(
              PLAYBACK_EVENT_TYPE.NODE_REMOVED,
              PLAYBACK_SCOPE_NODE,
              nodeId,
              {
                containerId: node.containerId,
              },
            );
          } catch (err) {
            errors.push(
              'Failed to remove container for ' +
              nodeId + ': ' + err.message,
            );
          }
        }
      }

      if (this._networkId && !reuseContainers) {
        try {
          const provider =
            this._providers[this._hostAssignment[0]];
          this._recordClusterStage(
            CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVING,
            {
              networkId: this._networkId,
              networkName: this._networkName,
            },
          );
          await provider.removeNetwork(this._networkId);
          this._recordClusterStage(
            CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVED,
            {
              networkId: this._networkId,
              networkName: this._networkName,
            },
          );
        } catch (err) {
          errors.push(
            'Failed to remove network: ' + err.message,
          );
        }
        this._networkId = null;
      } else if (this._networkId && reuseContainers) {
        this._networkId = null;
      }

      try {
        this._recordClusterStage(
          CLUSTER_STAGE_TEARDOWN_COMPLETE,
          {
            nodeCount: this._nodes.size,
          },
        );
        this._recordClusterStage(
          CLUSTER_STAGE_TEARDOWN_CAPTURE_FINALIZING,
          {},
        );
        this._playbackManifest = await this._playbackRecorder.stop({
          clusterId: this._clusterId,
          nodeCount: this._nodes.size,
        }, {
          skipFinalCapture: true,
        });
        if (this._traceManifest && this._playbackManifest) {
          this._playbackManifest.trace = this._traceManifest;
        }
        if (this._playbackStartWarning && this._playbackManifest) {
          this._playbackManifest.warning = this._playbackStartWarning;
        } else if (this._playbackStartWarning &&
                   !this._playbackManifest) {
          this._playbackManifest = {
            warning: this._playbackStartWarning,
          };
        }
        if (this._traceStartWarning && this._playbackManifest) {
          this._playbackManifest.traceWarning = this._traceStartWarning;
        }
      } catch (err) {
        errors.push(
          'Failed to finalize playback artifacts: ' + err.message,
        );
      }

      this._nodes.clear();

      this._started = false;
      this._unregisterCleanup();
    } finally {
      try {
        await this._releaseReusableClusterLease();
      } catch (error) {
        errors.push(
          'Failed to release reusable cluster lease: ' +
          String(error?.message || error),
        );
      }
      if (errors.length > 0) {
        process.stderr.write(
          'Cluster stop warnings:\n' +
          errors.join('\n') + '\n',
        );
      }
    }
  }

  async _stopNodeContainerForTeardown(nodeId, node, errors) {
    const provider = node?._dockerProvider;
    const containerId = node?.containerId;
    if (!provider || typeof containerId !== 'string' ||
        containerId.length === ZERO) {
      return;
    }

    let stopped = false;
    try {
      await provider.stopContainer(containerId);
      stopped = true;
    } catch (error) {
      if (isIgnorableContainerStopError(error)) {
        stopped = true;
      } else if (typeof provider.killContainer === 'function') {
        try {
          await provider.killContainer(containerId);
          stopped = true;
        } catch (killError) {
          const stopMessage = String(error?.message || error);
          const killMessage = String(killError?.message || killError);
          errors.push(
            'Failed to stop container for ' + nodeId +
            ': ' + stopMessage +
            '; kill fallback failed: ' + killMessage,
          );
        }
      } else {
        errors.push(
          'Failed to stop container for ' + nodeId +
          ': ' + String(error?.message || error),
        );
      }
    }

    if (!stopped) {
      return;
    }

    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.NODE_STOPPED,
      PLAYBACK_SCOPE_NODE,
      nodeId,
      {
        containerId,
      },
    );
  }

  async _cancelActiveLoadRuns() {
    if (this._activeLoadRuns.size === 0) {
      return;
    }

    const activeRuns = Array.from(this._activeLoadRuns.values());
    this._activeLoadRuns.clear();

    for (const run of activeRuns) {
      if (typeof run?.cancel !== 'function') {
        continue;
      }
      try {
        run.cancel();
      } catch (_err) {
        // Best-effort cancellation
      }
    }

    await Promise.all(activeRuns.map(async (run) => {
      if (typeof run?.waitComplete !== 'function') {
        return;
      }
      try {
        await run.waitComplete();
      } catch (_err) {
        // Best-effort completion wait
      }
    }));
  }

  _unregisterCleanup() {
    if (typeof this._cleanupUnregister === 'function') {
      this._cleanupUnregister();
      this._cleanupUnregister = null;
    }
  }

  /** Get a node handle by ID. */
  getNode(id) {
    const node = this._nodes.get(id);
    if (!node) {
      throw new Error('Node "' + id + '" not found in cluster');
    }
    return node;
  }

  /** Get all node handles. */
  getNodes() {
    return Array.from(this._nodes.values());
  }

  /** Add one joiner node to an already running cluster. */
  async addNode(options = {}) {
    if (!this._started) {
      throw new Error('Cluster must be started before adding nodes');
    }
    const seedNode = Array.from(this._nodes.values())
      .find((node) => node.role === NODE_ROLES.SEED) ||
      this._nodes.values().next().value;
    if (!seedNode) {
      throw new Error('Cannot add node: seed node is unavailable');
    }

    const nodeIndex = this._nodes.size;
    const joinerId = this._buildNodeId(nodeIndex);
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_JOINER_STARTING,
      {
        nodeId: joinerId,
        ordinal: nodeIndex,
      },
    );
    const joinerNode = await this._startNode(
      joinerId,
      NODE_ROLES.JOINER,
      seedNode.ip,
      nodeIndex,
    );
    this._nodes.set(joinerId, joinerNode);
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.NODE_CREATED,
      PLAYBACK_SCOPE_NODE,
      joinerId,
      {
        role: NODE_ROLES.JOINER,
        ip: joinerNode.ip,
        containerId: joinerNode.containerId,
      },
    );
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.NODE_STARTED,
      PLAYBACK_SCOPE_NODE,
      joinerId,
      {
        role: NODE_ROLES.JOINER,
        seedIp: seedNode.ip,
      },
    );
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_JOINER_STARTED,
      {
        nodeId: joinerId,
        ordinal: nodeIndex,
      },
    );
    if (options.waitForActive !== false) {
      await this._waitForAllActive();
    }
    return joinerNode;
  }

  /** Pick a random non-seed node ID. */
  randomNonSeed() {
    const joiners = Array.from(this._nodes.values())
      .filter((n) => n.role === NODE_ROLES.JOINER);
    if (joiners.length === 0) {
      throw new Error('No non-seed nodes in cluster');
    }
    const idx = Math.floor(Math.random() * joiners.length);
    return joiners[idx].id;
  }

  // --- Delegated component methods ---

  async waitForConvergence(options) {
    const nodes = Array.from(this._nodes.values());
    return waitForConvergence(nodes, {
      ignoreStaleInFlightReplicaOperations: true,
      ...(options || {}),
    });
  }

  async waitForAllActive(options = {}) {
    return this._waitForAllActive(options);
  }

  async assertConsistency() {
    const nodes = Array.from(this._nodes.values());
    return assertConsistency(nodes);
  }

  async waitForConsistencyConvergence(options) {
    const nodes = Array.from(this._nodes.values());
    return waitForConsistencyConvergence(nodes, options);
  }

  async assertDataIntegrity(table, expectedRows) {
    const nodes = Array.from(this._nodes.values());
    return assertDataIntegrity(nodes, table, expectedRows);
  }

  async killNode(id) {
    return this._runChaosAction('killNode', id, null, () =>
      this._chaos.killNode(id),
    );
  }

  async stopNode(id) {
    return this._runChaosAction('stopNode', id, null, () =>
      this._chaos.stopNode(id),
    );
  }

  async pauseNode(id) {
    return this._runChaosAction('pauseNode', id, null, () =>
      this._chaos.pauseNode(id),
    );
  }

  async unpauseNode(id) {
    return this._runChaosAction('unpauseNode', id, null, () =>
      this._chaos.unpauseNode(id),
    );
  }

  async restartNode(id, options = {}) {
    return this._runChaosAction('restartNode', id, options, () =>
      this._restartNodeWithObservation(id, options),
    );
  }

  async _restartNodeWithObservation(id, options = {}) {
    const node = this._nodes.get(id) || null;
    if (typeof node?.closeQueryConnection === 'function') {
      node.closeQueryConnection();
    }
    await this._recordRestartBoundarySnapshot(id, 'before_stop');
    await this._chaos.stopNode(id);
    await this._waitForRestartShutdownBoundary(id);
    await this._chaos.startNode(id);
    if (typeof node?.closeQueryConnection === 'function') {
      node.closeQueryConnection();
    }
    await this._waitForNodeAdminReadiness(id, options);
    await this._recordRestartBoundarySnapshot(id, 'after_ready');
  }

  _resolveRestartShutdownObservationTimeoutMs() {
    const startupTimeout = this._config.timeouts?.nodeStartup ||
      TIMEOUTS.NODE_STARTUP;
    return Math.max(startupTimeout, ACTIVE_POLL_INTERVAL_MS * 2);
  }

  _resolveRestartAdminReadinessTimeoutMs() {
    return this._config.timeouts?.nodeStartup ||
      TIMEOUTS.NODE_STARTUP;
  }

  _formatRestartShutdownBoundary(observation) {
    if (!observation) {
      return 'none';
    }
    const activeNodeIds = Array.isArray(observation.peerActiveNodeIds) &&
      observation.peerActiveNodeIds.length > ZERO ?
      observation.peerActiveNodeIds.join('|') :
      'none';
    return (
      'containerState=' + String(observation.containerState || 'unknown') +
      ', containerRunning=' + String(observation.containerRunning ?? 'unknown') +
      ', reachable=' + String(observation.reachable ?? 'unknown') +
      ', adminReady=' + String(observation.adminReady ?? 'unknown') +
      ', reachableBy=' + String(observation.reachableBy || 'none') +
      ', peerObserved=' + String(observation.peerObserved ?? 'unknown') +
      ', peerObserver=' + String(observation.peerObserverNodeId || 'none') +
      ', peerCapturedAtMs=' + String(observation.peerCapturedAtMs ?? 'none') +
      ', peerActiveNodeIds=' + activeNodeIds +
      ', peerServeEligible=' + String(observation.peerServeEligible ?? 'unknown') +
      ', peerRepairEligible=' + String(observation.peerRepairEligible ?? 'unknown') +
      ', error=' + String(observation.error || 'none') +
      ', peerError=' + String(observation.peerError || 'none')
    );
  }

  _formatRestartShutdownObservation(observation) {
    if (!observation) {
      return 'none';
    }
    const activeNodeIds = Array.isArray(observation.activeNodeIds) &&
      observation.activeNodeIds.length > ZERO ?
      observation.activeNodeIds.join('|') :
      'none';
    return (
      'observer=' + String(observation.observerNodeId || 'none') +
      ', capturedAtMs=' + String(observation.capturedAtMs ?? 'none') +
      ', activeNodeIds=' + activeNodeIds +
      ', serveEligible=' + String(observation.serveEligible ?? 'unknown') +
      ', repairEligible=' + String(observation.repairEligible ?? 'unknown') +
      ', reachable=' + String(observation.reachable ?? 'unknown') +
      ', reachableBy=' + String(observation.reachableBy || 'none') +
      ', error=' + String(observation.error || 'none')
    );
  }

  _isNewerRestartShutdownObservation(candidate, current) {
    if (!candidate) {
      return false;
    }
    if (!current) {
      return true;
    }
    const candidateCapturedAtMs = Number.isFinite(candidate.capturedAtMs) ?
      candidate.capturedAtMs :
      -1;
    const currentCapturedAtMs = Number.isFinite(current.capturedAtMs) ?
      current.capturedAtMs :
      -1;
    if (candidateCapturedAtMs !== currentCapturedAtMs) {
      return candidateCapturedAtMs > currentCapturedAtMs;
    }
    if (candidate.error && !current.error) {
      return false;
    }
    if (!candidate.error && current.error) {
      return true;
    }
    return false;
  }

  async _probeRestartShutdownBoundary(targetNodeId, deadline) {
    const targetNode = this._nodes.get(targetNodeId) || null;
    if (!targetNode) {
      return {
        observed: false,
        containerState: null,
        containerRunning: null,
        reachable: null,
        adminReady: null,
        reachableBy: null,
        peerObserved: null,
        peerObserverNodeId: null,
        peerCapturedAtMs: null,
        peerActiveNodeIds: [],
        peerServeEligible: null,
        peerRepairEligible: null,
        error: 'Node "' + targetNodeId + '" not found in cluster',
        peerError: null,
      };
    }

    let containerState = null;
    let containerRunning = null;
    let error = null;

    if (this._dockerProvider &&
        typeof this._dockerProvider.inspectContainer === 'function' &&
        typeof targetNode.containerId === 'string' &&
        targetNode.containerId.length > ZERO) {
      try {
        const inspect = await this._dockerProvider.inspectContainer(
          targetNode.containerId,
        );
        containerState = typeof inspect?.State?.Status === 'string' &&
          inspect.State.Status.length > ZERO ?
          inspect.State.Status :
          UNKNOWN_STATE;
        containerRunning = containerState === CONTAINER_RUNNING_STATUS;
      } catch (inspectError) {
        error = normalizeProbeError(inspectError);
        containerState = 'inspect_error';
      }
    }

    let diagnostics = null;
    try {
      diagnostics = await targetNode.getReachabilityDiagnostics({
        timeoutMs: Math.max(MIN_TIMEOUT_MS, deadline - Date.now()),
      });
    } catch (probeError) {
      if (!error) {
        error = normalizeProbeError(probeError);
      }
    }

    const reachable = diagnostics?.reachable === true;
    const adminReady = diagnostics?.adminReady === true;
    const observed = (containerRunning === false || containerRunning === null) &&
      reachable !== true &&
      adminReady !== true &&
      !error;

    return {
      observed,
      containerState,
      containerRunning,
      reachable,
      adminReady,
      reachableBy: diagnostics?.reachableBy || null,
      peerObserved: null,
      peerObserverNodeId: null,
      peerCapturedAtMs: null,
      peerActiveNodeIds: [],
      peerServeEligible: null,
      peerRepairEligible: null,
      error: error || diagnostics?.lastError || null,
      peerError: null,
    };
  }

  async _probeRestartShutdownObservation(targetNodeId, deadline) {
    const peerNodes = [...this._nodes.values()].filter((node) =>
      node?.id !== targetNodeId,
    );
    let bestObservation = null;
    let lastError = null;

    for (const peerNode of peerNodes) {
      const remainingMs = Math.max(MIN_TIMEOUT_MS, deadline - Date.now());
      const timeoutMs = Math.min(CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS, remainingMs);
      try {
        const snapshotResult = await peerNode.getControlSnapshot({
          timeoutMs,
          lane: ADMIN_SOCKET_LANE_SNAPSHOT,
        });
        const snapshotPayload =
          this._extractControlSnapshotPayload(snapshotResult) || {};
        const snapshotSummary =
          this._extractControlSnapshotSummary(snapshotResult);
        const readinessByNodeId =
          snapshotPayload?.controlPlaneDiagnostics?.readinessByNodeId &&
          typeof snapshotPayload.controlPlaneDiagnostics.readinessByNodeId ===
            'object' ?
            snapshotPayload.controlPlaneDiagnostics.readinessByNodeId :
            {};
        const readiness = readinessByNodeId[targetNodeId] || null;
        const activeNodeIds = Array.isArray(snapshotSummary.nodes) ?
          snapshotSummary.nodes :
          [];
        const observed = !activeNodeIds.includes(targetNodeId) ||
          (readiness && readiness.serveEligible !== true);
        const observation = {
          observed,
          observerNodeId: peerNode.id,
          capturedAtMs: snapshotSummary.capturedAtMs,
          activeNodeIds,
          serveEligible: readiness?.serveEligible ?? null,
          repairEligible: readiness?.repairEligible ?? null,
          error: null,
        };
        if (observation.observed) {
          return observation;
        }
        if (this._isNewerRestartShutdownObservation(
          observation,
          bestObservation,
        )) {
          bestObservation = observation;
        }
      } catch (error) {
        lastError = normalizeProbeError(error);
      }
    }

    const targetNode = this._nodes.get(targetNodeId) || null;
    if (peerNodes.length === ZERO && targetNode &&
        typeof targetNode.getReachabilityDiagnostics === 'function') {
      try {
        const diagnostics = await targetNode.getReachabilityDiagnostics({
          timeoutMs: Math.max(MIN_TIMEOUT_MS, deadline - Date.now()),
        });
        return {
          observed: diagnostics?.reachable !== true,
          observerNodeId: targetNodeId,
          capturedAtMs: null,
          activeNodeIds: [],
          serveEligible: null,
          repairEligible: null,
          reachable: diagnostics?.reachable === true,
          reachableBy: diagnostics?.reachableBy || null,
          error: diagnostics?.lastError || null,
        };
      } catch (error) {
        lastError = normalizeProbeError(error);
      }
    }

    return bestObservation || {
      observed: false,
      observerNodeId: null,
      capturedAtMs: null,
      activeNodeIds: [],
      serveEligible: null,
      repairEligible: null,
      reachable: null,
      reachableBy: null,
      error: lastError || 'restart_shutdown_not_observed',
    };
  }

  async _waitForRestartShutdownBoundary(targetNodeId) {
    const timeoutMs = this._resolveRestartShutdownObservationTimeoutMs();
    const deadline = Date.now() + timeoutMs;
    const pollResult = await pollUntilCondition({
      deadline,
      intervalMs: RESTART_POLL_INTERVAL_MS,
      sleep: (ms) => this._sleep(ms),
      probe: () => this._probeRestartShutdownBoundary(
        targetNodeId,
        deadline,
      ),
      isSuccess: (result) => result?.observed === true,
    });

    if (pollResult.success) {
      return;
    }

    let peerObservation = null;
    try {
      peerObservation = await this._probeRestartShutdownObservation(
        targetNodeId,
        Date.now() + CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
      );
    } catch (peerObservationError) {
      peerObservation = {
        observed: false,
        observerNodeId: null,
        capturedAtMs: null,
        activeNodeIds: [],
        serveEligible: null,
        repairEligible: null,
        error: normalizeProbeError(peerObservationError),
      };
    }

    const lastResult = {
      ...(pollResult.lastResult || {}),
      peerObserved: peerObservation?.observed === true,
      peerObserverNodeId: peerObservation?.observerNodeId || null,
      peerCapturedAtMs: peerObservation?.capturedAtMs ?? null,
      peerActiveNodeIds: Array.isArray(peerObservation?.activeNodeIds) ?
        peerObservation.activeNodeIds :
        [],
      peerServeEligible: peerObservation?.serveEligible ?? null,
      peerRepairEligible: peerObservation?.repairEligible ?? null,
      peerError: peerObservation?.error || null,
    };

    await this._collectFailureLogs();
    throw new Error(
      'Restart shutdown boundary was not observed within ' +
      timeoutMs +
      'ms for node ' +
      targetNodeId +
      ' (' +
      this._formatRestartShutdownBoundary(lastResult) +
      ')',
    );
  }

  async _waitForNodeAdminReadiness(targetNodeId, options = {}) {
    const node = this._nodes.get(targetNodeId);
    if (!node) {
      throw new Error('Node "' + targetNodeId + '" not found in cluster');
    }
    const timeoutOverrideMs = Number(options?.readinessTimeoutMs);
    const timeoutMs = Number.isFinite(timeoutOverrideMs) &&
      timeoutOverrideMs > ZERO ?
      Math.max(MIN_TIMEOUT_MS, Math.floor(timeoutOverrideMs)) :
      this._resolveRestartAdminReadinessTimeoutMs();
    const expectedPublicationEpoch = Number.isInteger(
      options?.expectedPublicationEpoch,
    ) && options.expectedPublicationEpoch > ZERO ?
      options.expectedPublicationEpoch :
      null;
    const deadline = Date.now() + timeoutMs;
    const pollResult = await pollUntilCondition({
      deadline,
      intervalMs: RESTART_POLL_INTERVAL_MS,
      sleep: (ms) => this._sleep(ms),
      probe: async () => {
        try {
          const diagnostics = await node.getReachabilityDiagnostics({
            timeoutMs: Math.max(MIN_TIMEOUT_MS, deadline - Date.now()),
          });
          return {
            ...diagnostics,
            ready:
              (
                diagnostics?.adminReady === true ||
                diagnostics?.controlPlaneRecoveryReady === true
              ) && (
                expectedPublicationEpoch === null ||
                Number(diagnostics?.publishedControlPlaneEpoch) ===
                  expectedPublicationEpoch
              ),
          };
        } catch (error) {
          return {
            nodeId: targetNodeId,
            ready: false,
            adminReady: false,
            controlPlaneRecoveryReady: false,
            recoveryStage: null,
            recoveryStageRank: null,
            reachable: false,
            reachableBy: null,
            lastError: normalizeProbeError(error),
          };
        }
      },
      isSuccess: (result) => result?.ready === true,
    });

    if (pollResult.success) {
      return;
    }

    await this._collectFailureLogs();
    const lastResult = pollResult.lastResult || {};
    throw new Error(
      'Restarted node did not become recovery-ready within ' +
      timeoutMs +
      'ms for node ' +
      targetNodeId +
      ' (reachable=' +
      String(lastResult.reachable === true) +
      ', ready=' +
      String(lastResult.ready === true) +
      ', adminReady=' +
      String(lastResult.adminReady === true) +
      ', controlPlaneRecoveryReady=' +
      String(lastResult.controlPlaneRecoveryReady === true) +
      ', publishedControlPlaneEpoch=' +
      String(lastResult.publishedControlPlaneEpoch ?? 'unknown') +
      ', expectedPublicationEpoch=' +
      String(expectedPublicationEpoch ?? 'none') +
      ', recoveryStage=' +
      String(lastResult.recoveryStage || 'unknown') +
      ', reachableBy=' +
      String(lastResult.reachableBy || 'none') +
      ', lastError=' +
      String(lastResult.lastError || 'none') +
      ')',
    );
  }

  async partitionNetwork(groupA, groupB) {
    return this._runChaosAction(
      'partitionNetwork',
      'network',
      {groupA, groupB},
      () => this._chaos.partitionNetwork(groupA, groupB),
    );
  }

  async healPartition() {
    return this._runChaosAction('healPartition', 'network', null, () =>
      this._chaos.healPartition(),
    );
  }

  async slowNetwork(nodeId, options) {
    return this._runChaosAction('slowNetwork', nodeId, options, () =>
      this._chaos.slowNetwork(nodeId, options),
    );
  }

  async clearNetworkSlowdown(nodeId) {
    return this._runChaosAction(
      'clearNetworkSlowdown',
      nodeId,
      null,
      () => this._chaos.clearNetworkSlowdown(nodeId),
    );
  }

  async corruptDisk(nodeId, path) {
    return this._runChaosAction(
      'corruptDisk',
      nodeId,
      {path},
      () => this._chaos.corruptDisk(nodeId, path),
    );
  }

  async fillDisk(nodeId, options = {}) {
    return this._runChaosAction(
      'fillDisk',
      nodeId,
      options,
      () => this._chaos.fillDisk(nodeId, options),
    );
  }

  async releaseDiskPressure(nodeId, options = {}) {
    return this._runChaosAction(
      'releaseDiskPressure',
      nodeId,
      options,
      () => this._chaos.releaseDiskPressure(nodeId, options),
    );
  }

  async resolveBenchmarkReadyLoadNodes(options = {}) {
    const nodes = Array.from(this._nodes.values());
    if (nodes.length === ZERO) {
      return [];
    }
    const timeoutMs = resolvePositiveTimeoutMs(
      options?.timeoutMs,
      ADMIN_QUERY_TIMEOUT_MS,
    );
    const discoverySql = buildServiceDiscoverySql({
      tableName: options?.tableName,
      tableId: options?.tableId,
    });
    const loadAdmissionProbeSql = buildBenchmarkAdmissionProbeSql(
      options?.tableName,
    );
    const requiredPublicationEpoch = Number.isInteger(
      options?.requiredPublicationEpoch,
    ) && options.requiredPublicationEpoch > ZERO ?
      options.requiredPublicationEpoch :
      null;
    const allowRoutedNodeLoadLaneFallback =
      this._config?.benchmark?.strictDiscovery === false;
    const readyNodes = [];

    for (const node of nodes) {
      if (!node || typeof node !== 'object') {
        continue;
      }
      try {
        let discoverySnapshot = null;
        let discoveryError = null;
        try {
          discoverySnapshot =
            typeof node.queryWithTimeout === 'function' ?
              await node.queryWithTimeout(
                discoverySql,
                [],
                {
                  lane: ADMIN_SOCKET_LANE_SNAPSHOT,
                  timeoutMs,
                },
              ) :
              await node.query(discoverySql, []);
          } catch (error) {
            discoveryError = error;
          }
        const localDiscoveryAdmission = discoverySnapshot ?
          inspectLocalBenchmarkAdmissionFromDiscovery(
            discoverySnapshot,
            node.id,
          ) :
          {
            localReplicaSeen: false,
            readyNodeId: null,
          };
        const readyNodeId = localDiscoveryAdmission.readyNodeId;
        let diagnostics = null;
        if (typeof node.getReachabilityDiagnostics === 'function') {
          try {
            diagnostics = await node.getReachabilityDiagnostics({
              timeoutMs,
            });
          } catch (_error) {
            diagnostics = null;
          }
        }
        if (!diagnostics ||
            diagnostics.adminReady === true ||
            diagnostics.controlPlaneRecoveryReady === true) {
          const localDiscoveryReady = readyNodeId === String(node.id || '');
          const softDiscoveryFallback =
            !localDiscoveryReady &&
            discoverySnapshot === null &&
            isRetryableBenchmarkAdmissionError(discoveryError);
          const routedNodeLoadLaneFallback =
            !localDiscoveryReady &&
            !softDiscoveryFallback &&
            allowRoutedNodeLoadLaneFallback &&
            discoverySnapshot !== null &&
            localDiscoveryAdmission.localReplicaSeen !== true;
          if (!localDiscoveryReady &&
              !softDiscoveryFallback &&
              !routedNodeLoadLaneFallback) {
            continue;
          }
          if (requiredPublicationEpoch !== null) {
            const publishedControlPlaneEpoch = Number(
              diagnostics?.publishedControlPlaneEpoch,
            );
            if (publishedControlPlaneEpoch !== requiredPublicationEpoch) {
              continue;
            }
          }
          // Under retryable discovery pressure, the direct load-lane probe is
          // the authoritative admission check.
          const loadLaneAdmitted = await verifyBenchmarkLoadLaneAdmission(
            node,
            loadAdmissionProbeSql,
            timeoutMs,
          );
          if (!loadLaneAdmitted) {
            continue;
          }
          readyNodes.push(node);
        }
      } catch (_error) {
        continue;
      }
    }

    return readyNodes;
  }

  async waitForBenchmarkReadyLoadNodes(options = {}) {
    const minNodeCount = Number.isInteger(options?.minNodeCount) &&
      options.minNodeCount > ZERO ?
      options.minNodeCount :
      ONE;
    const stableWindowMs = resolvePositiveTimeoutMs(
      options?.stableWindowMs,
      LOAD_READINESS_STABLE_WINDOW_MS,
    );
    const timeoutMs = resolvePositiveTimeoutMs(
      options?.timeoutMs,
      LOAD_READINESS_STABILITY_TIMEOUT_MS,
    );
    const pollIntervalMs = resolvePositiveTimeoutMs(
      options?.pollIntervalMs,
      ACTIVE_POLL_INTERVAL_MS,
    );
    const tableName = typeof options?.tableName === 'string' ?
      options.tableName.trim() :
      '';
    const deadlineAtMs = Date.now() + timeoutMs;
    let readySinceMs = null;
    let lastReadyNodes = [];
    const sleep = typeof this._sleep === 'function' ?
      (ms) => this._sleep(ms) :
      (ms) => new Promise((resolve) => {
        setTimeout(resolve, ms);
      });

    while (true) {
      const readyNodes = await this.resolveBenchmarkReadyLoadNodes({
        tableName,
        tableId: options?.tableId,
        timeoutMs: options?.queryTimeoutMs,
      });
      lastReadyNodes = readyNodes;

      if (readyNodes.length >= minNodeCount) {
        const nowMs = Date.now();
        if (stableWindowMs <= ZERO) {
          return readyNodes;
        }
        if (readySinceMs === null) {
          readySinceMs = nowMs;
        }
        if (nowMs - readySinceMs >= stableWindowMs) {
          return readyNodes;
        }
      } else {
        readySinceMs = null;
      }

      const nowMs = Date.now();
      if (nowMs > deadlineAtMs && readySinceMs === null) {
        break;
      }

      await sleep(pollIntervalMs);
    }

    throw new Error(
      'Timed out after ' + timeoutMs +
      'ms waiting for at least ' + minNodeCount +
      ' benchmark-ready load nodes' +
      (tableName.length > ZERO ? ' for table ' + tableName : '') +
      '; lastReadyNodeCount=' + lastReadyNodes.length,
    );
  }

  async waitForControlPlaneQuiescence(options = {}) {
    const stableWindowMs =
      this._resolveControlPlaneQuiescenceStableWindowMs(options);
    const timeoutMs = this._resolveControlPlaneQuiescenceTimeoutMs(options);
    const noProgressTimeoutMs =
      this._resolveControlPlaneQuiescenceNoProgressTimeoutMs(options);
    const maxInFlightCount =
      this._resolveControlPlaneQuiescenceMaxInFlightCount(options);
    const deadline = Date.now() + timeoutMs;
    const instabilitySummaryCounts = new Map();
    let lastLeaderSignature = null;
    let lastLeaderChangeAtMs = Date.now();
    let stableWindowStartedAtMs = null;
    let lastProgressAtMs = Date.now();
    let lowestInFlightCount = Number.POSITIVE_INFINITY;
    let maxLeaderQuietElapsedMs = ZERO;
    let lowestCriticalSystemSpreadGap = Number.POSITIVE_INFINITY;
    let highestCriticalSystemReadyTableCount = ZERO;
    let lastOperationTimelineSignature = null;

    let pollResult;
    try {
      pollResult = await pollUntilCondition({
        deadline,
        intervalMs: ACTIVE_POLL_INTERVAL_MS,
        sleep: (ms) => this._sleep(ms),
        probe: async () => {
          const snapshotProbe = await this._probeControlPlaneQuiescenceSnapshot(
            deadline,
          );
          const nowMs = Date.now();
          if (snapshotProbe.error) {
            stableWindowStartedAtMs = null;
            return {
              ...snapshotProbe,
              ready: false,
              reasons: [
                QUIESCENCE_REASON_SNAPSHOT_ERROR_PREFIX +
                snapshotProbe.error,
              ],
              stableElapsedMs: ZERO,
              leaderQuietElapsedMs: ZERO,
            };
          }

          if (lastLeaderSignature === null ||
              lastLeaderSignature !== snapshotProbe.leaderSignature) {
            lastLeaderSignature = snapshotProbe.leaderSignature;
            lastLeaderChangeAtMs = nowMs;
          }

          const leaderQuietElapsedMs = nowMs - lastLeaderChangeAtMs;
          const leadershipStable = snapshotProbe.leaderCount > ZERO &&
            leaderQuietElapsedMs >= stableWindowMs;
          const criticalSystemTopology =
            await this._probeCriticalSystemTopology(deadline, options);
          const reasons = [];

          if (snapshotProbe.inFlightCount > maxInFlightCount) {
            reasons.push(
              QUIESCENCE_REASON_IN_FLIGHT_PREFIX +
              String(snapshotProbe.inFlightCount),
            );
          }
          if (!leadershipStable) {
            reasons.push(
              QUIESCENCE_REASON_LEADERSHIP_PREFIX +
              String(leaderQuietElapsedMs),
            );
          }
          if (criticalSystemTopology.enabled === true &&
              criticalSystemTopology.ready !== true) {
            reasons.push(
              QUIESCENCE_REASON_CRITICAL_SYSTEM_SPREAD_PREFIX +
              String(criticalSystemTopology.totalSpreadGap),
            );
          }

          const ready = reasons.length === ZERO;
          if (ready) {
            if (stableWindowStartedAtMs === null) {
              stableWindowStartedAtMs = nowMs;
            }
          } else {
            stableWindowStartedAtMs = null;
          }

          let progressObserved = false;
          if (snapshotProbe.inFlightCount < lowestInFlightCount) {
            lowestInFlightCount = snapshotProbe.inFlightCount;
            progressObserved = true;
          }
          if (snapshotProbe.operationTimelineSignature !== null &&
              snapshotProbe.operationTimelineSignature !==
                lastOperationTimelineSignature) {
            lastOperationTimelineSignature =
              snapshotProbe.operationTimelineSignature;
            progressObserved = true;
          }
          if (snapshotProbe.inFlightCount <= maxInFlightCount &&
              leaderQuietElapsedMs > maxLeaderQuietElapsedMs) {
            maxLeaderQuietElapsedMs = leaderQuietElapsedMs;
            progressObserved = true;
          }
          if (criticalSystemTopology.enabled === true) {
            if (criticalSystemTopology.totalSpreadGap <
                lowestCriticalSystemSpreadGap) {
              lowestCriticalSystemSpreadGap =
                criticalSystemTopology.totalSpreadGap;
              progressObserved = true;
            }
            if (criticalSystemTopology.readyTableCount >
                highestCriticalSystemReadyTableCount) {
              highestCriticalSystemReadyTableCount =
                criticalSystemTopology.readyTableCount;
              progressObserved = true;
            }
          }
          if (progressObserved) {
            lastProgressAtMs = nowMs;
          }

          if (Number.isInteger(noProgressTimeoutMs) &&
              noProgressTimeoutMs > ZERO &&
              nowMs - lastProgressAtMs >= noProgressTimeoutMs) {
            const stalledError = new Error(
              'Control plane quiescence stalled for ' +
              String(nowMs - lastProgressAtMs) +
              'ms (inFlightCount=' +
              String(snapshotProbe.inFlightCount) +
              ', leaderQuietElapsedMs=' +
              String(leaderQuietElapsedMs) +
              ', nodeId=' +
              String(snapshotProbe.nodeId || 'unknown') +
              ')',
            );
            stalledError.quiescence = {
              nodeId: snapshotProbe.nodeId || null,
              inFlightCount: snapshotProbe.inFlightCount,
              reasons,
              stableElapsedMs: stableWindowStartedAtMs === null ?
                ZERO :
                nowMs - stableWindowStartedAtMs,
              leaderQuietElapsedMs,
              criticalSystemDistribution:
                criticalSystemTopology.enabled === true ?
                  formatCriticalSystemDistributionSummary(
                    criticalSystemTopology,
                  ) :
                  null,
            };
            throw stalledError;
          }

          return {
            ...snapshotProbe,
            criticalSystemTopology,
            ready,
            reasons,
            stableElapsedMs: stableWindowStartedAtMs === null ?
              ZERO :
              nowMs - stableWindowStartedAtMs,
            leaderQuietElapsedMs,
          };
        },
        isSuccess: (result) => result.ready === true &&
          result.stableElapsedMs >= stableWindowMs,
        onAttempt: ({lastResult}) => {
          for (const reason of lastResult?.reasons || []) {
            instabilitySummaryCounts.set(
              reason,
              (instabilitySummaryCounts.get(reason) || ZERO) + 1,
            );
          }
        },
      });
    } catch (error) {
      await this._collectFailureLogs();
      throw error;
    }

    if (pollResult.success) {
      return {
        attempts: pollResult.attempts,
        elapsedMs: pollResult.elapsedMs,
        stableElapsedMs: pollResult.lastResult?.stableElapsedMs ?? ZERO,
        inFlightCount: pollResult.lastResult?.inFlightCount ?? null,
        leaderQuietElapsedMs: pollResult.lastResult?.leaderQuietElapsedMs ??
          ZERO,
        selectedNodeId: pollResult.lastResult?.nodeId || null,
        selectedCapturedAtMs:
          pollResult.lastResult?.capturedAtMs ?? null,
        partitionGroupInFlight:
          pollResult.lastResult?.partitionGroupInFlight || {},
        criticalSystemTopology:
          pollResult.lastResult?.criticalSystemTopology || null,
      };
    }

    await this._collectFailureLogs();
    const instabilitySummary = formatCountSummary(instabilitySummaryCounts);
    throw new Error(
      'Control plane did not quiesce within ' +
      timeoutMs +
      'ms (attempts=' +
      pollResult.attempts +
      ', elapsedMs=' +
      pollResult.elapsedMs +
      ', stableWindowMs=' +
      stableWindowMs +
      ', stableElapsedMs=' +
      (pollResult.lastResult?.stableElapsedMs ?? ZERO) +
      ', inFlightCount=' +
      String(pollResult.lastResult?.inFlightCount ?? 'unknown') +
      ', leaderQuietElapsedMs=' +
      String(pollResult.lastResult?.leaderQuietElapsedMs ?? ZERO) +
      ', selectedNodeId=' +
      String(pollResult.lastResult?.nodeId || 'unknown') +
      ', criticalSystemDistribution=' +
      formatCriticalSystemDistributionSummary(
        pollResult.lastResult?.criticalSystemTopology || null,
      ) +
      ', instabilitySummary=' +
      (instabilitySummary || 'none') +
      ')',
    );
  }

  startLoad(options) {
    const requestedOptions =
      options && typeof options === 'object' ?
        options :
        {};
    const explicitNodes = Array.isArray(requestedOptions.nodes) ?
      requestedOptions.nodes :
      null;
    const nodes = explicitNodes !== null ?
      explicitNodes.filter((node) =>
        node && typeof node === 'object') :
      Array.from(this._nodes.values());
    const benchmarkConfig =
      this._config?.benchmark && typeof this._config.benchmark === 'object' ?
        this._config.benchmark :
        null;
    const resolvedOptions = {
      ...requestedOptions,
    };
    if (resolvedOptions.admissionAwareScheduling === undefined) {
      resolvedOptions.admissionAwareScheduling = true;
    }
    if (benchmarkConfig) {
      if (resolvedOptions.maxInFlight === undefined &&
          Number.isInteger(benchmarkConfig.loadMaxInFlight) &&
          benchmarkConfig.loadMaxInFlight > ZERO) {
        resolvedOptions.maxInFlight = benchmarkConfig.loadMaxInFlight;
      }
      if (resolvedOptions.queryTimeoutMs === undefined &&
          Number.isInteger(benchmarkConfig.loadQueryTimeoutMs) &&
          benchmarkConfig.loadQueryTimeoutMs > ZERO) {
        resolvedOptions.queryTimeoutMs = benchmarkConfig.loadQueryTimeoutMs;
      }
      if (resolvedOptions.nodeMaxInFlight === undefined &&
          Number.isInteger(benchmarkConfig.loadNodeMaxInFlight) &&
          benchmarkConfig.loadNodeMaxInFlight > ZERO) {
        resolvedOptions.nodeMaxInFlight =
          benchmarkConfig.loadNodeMaxInFlight;
      }
      if (resolvedOptions.nodeFailureThreshold === undefined &&
          Number.isInteger(benchmarkConfig.nodeFailureThreshold) &&
          benchmarkConfig.nodeFailureThreshold > ZERO) {
        resolvedOptions.nodeFailureThreshold =
          benchmarkConfig.nodeFailureThreshold;
      }
      if (resolvedOptions.nodeFailureCooldownMs === undefined &&
          Number.isInteger(benchmarkConfig.nodeFailureCooldownMs) &&
          benchmarkConfig.nodeFailureCooldownMs > ZERO) {
        resolvedOptions.nodeFailureCooldownMs =
          benchmarkConfig.nodeFailureCooldownMs;
      }
    }
    const generator = new LoadGenerator(nodes, resolvedOptions);
    const run = generator.start();
    this._activeLoadRuns.add(run);
    let stopped = false;
    let cancelled = false;
    let progressTimer = null;
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.LOAD_STARTED,
      PLAYBACK_SCOPE_LOAD,
      LOAD_RUN_ENTITY,
      {
        options: resolvedOptions,
      },
    );

    const clearProgressTimer = () => {
      if (progressTimer !== null) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    };

    const recordProgress = () => {
      if (stopped || typeof run.getMetrics !== 'function') {
        return;
      }
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.LOAD_PROGRESS,
        PLAYBACK_SCOPE_LOAD,
        LOAD_RUN_ENTITY,
        {
          metrics: run.getMetrics(),
          cancelled,
        },
      );
    };

    const finalize = (details) => {
      if (stopped) {
        return;
      }
      stopped = true;
      this._activeLoadRuns.delete(run);
      clearProgressTimer();
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.LOAD_COMPLETED,
        PLAYBACK_SCOPE_LOAD,
        LOAD_RUN_ENTITY,
        details,
      );
    };

    recordProgress();
    progressTimer = setInterval(
      recordProgress,
      LOAD_PROGRESS_INTERVAL_MS,
    );

    const waitComplete = run.waitComplete.bind(run);
    const completionPromise = waitComplete()
      .then((metrics) => {
        finalize({
          metrics,
          cancelled,
        });
        return metrics;
      })
      .catch((error) => {
        finalize({
          cancelled,
          error: error?.message || 'load-run-failed',
        });
        throw error;
      });

    run.waitComplete = async () => completionPromise;

    if (typeof run.cancel === 'function') {
      const cancel = run.cancel.bind(run);
      run.cancel = () => {
        cancelled = true;
        clearProgressTimer();
        return cancel();
      };
    }

    completionPromise.catch(() => {
      // Prevent unhandled rejection when waitComplete is not awaited.
    });

    return run;
  }

  /**
   * Get the LogCollector instance for direct access.
   * @returns {LogCollector}
   */
  getLogCollector() {
    return this._logCollector;
  }

  /**
   * Get the LogAnalyzer instance for direct access.
   * @returns {LogAnalyzer}
   */
  getLogAnalyzer() {
    return this._logAnalyzer;
  }

  /**
   * Set scenario context for capture artifacts.
   * @param {string} scenarioName
   */
  setScenarioName(scenarioName) {
    if (typeof scenarioName !== 'string' ||
        scenarioName.length === 0) {
      return;
    }
    this._scenarioName = scenarioName;
  }

  /**
   * Get finalized playback manifest generated on stop().
   * @returns {Object|null}
   */
  getPlaybackManifest() {
    return this._playbackManifest;
  }

  /**
   * Get finalized trace manifest generated on stop().
   * @returns {Object|null}
   */
  getTraceManifest() {
    if (this._traceManifest) {
      return this._traceManifest;
    }
    if (this._traceStartWarning) {
      return {warning: this._traceStartWarning};
    }
    return null;
  }

  // --- Internal helpers ---

  _recordPlaybackEvent(type, scope, entityId, details) {
    try {
      this._playbackRecorder.recordEvent({
        type,
        scope,
        entityId,
        details,
      });
    } catch (_err) {
      // Best-effort playback recording
    }
  }

  _recordClusterStage(stage, details = {}) {
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CLUSTER_STAGE,
      PLAYBACK_SCOPE_CLUSTER,
      PLAYBACK_ENTITY_CLUSTER,
      {
        stage,
        ...details,
      },
    );
  }

  _summarizeRestartBoundaryLedgerSnapshot(snapshot, nodeId) {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    const controlPlaneDiagnostics =
      snapshot.controlPlaneDiagnostics &&
        typeof snapshot.controlPlaneDiagnostics === 'object' ?
        snapshot.controlPlaneDiagnostics :
        null;
    const localReadiness =
      controlPlaneDiagnostics?.readinessByNodeId &&
        typeof controlPlaneDiagnostics.readinessByNodeId === 'object' ?
        controlPlaneDiagnostics.readinessByNodeId[nodeId] || null :
        null;
    return {
      nodeId,
      capturedAt: typeof snapshot.capturedAt === 'string' ? snapshot.capturedAt : null,
      capturedAtMs: Number.isFinite(snapshot.capturedAtMs) ? snapshot.capturedAtMs : null,
      publicationConvergence:
        controlPlaneDiagnostics?.publicationConvergence || null,
      startupRecovery: controlPlaneDiagnostics?.startupRecovery || null,
      publicationMode: controlPlaneDiagnostics?.publicationMode || null,
      heartbeatPublication: controlPlaneDiagnostics?.heartbeatPublication || null,
      localReadiness: localReadiness ? {
        nodeId: localReadiness.nodeId || nodeId,
        dimensions:
          localReadiness.dimensions &&
            typeof localReadiness.dimensions === 'object' ?
            localReadiness.dimensions :
            null,
        reasonCodes: Array.isArray(localReadiness.reasonCodes) ?
          localReadiness.reasonCodes :
          (Array.isArray(localReadiness.reasons) ?
            localReadiness.reasons
              .map((reason) => String(reason?.code || '').trim())
              .filter((reason) => reason.length > ZERO) :
            []),
      } : null,
    };
  }

  async _recordRestartBoundarySnapshot(nodeId, phase) {
    const node = this._nodes.get(nodeId) || null;
    if (typeof node?.getControlPlaneLedgerSnapshot !== 'function') {
      return;
    }
    try {
      const snapshot = await node.getControlPlaneLedgerSnapshot({
        timeoutMs: CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
      });
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.NODE_RESTART_BOUNDARY,
        PLAYBACK_SCOPE_NODE,
        nodeId,
        {
          phase,
          snapshot: this._summarizeRestartBoundaryLedgerSnapshot(
            snapshot,
            nodeId,
          ),
        },
      );
    } catch (error) {
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.NODE_RESTART_BOUNDARY,
        PLAYBACK_SCOPE_NODE,
        nodeId,
        {
          phase,
          error: error?.message || 'restart-boundary-snapshot-failed',
        },
      );
    }
  }

  _recordPeriodicStartupWaitingStage(stage, attemptResult, details = {}) {
    const attempts = Number(attemptResult?.attempts) || 0;
    if (attempts % STARTUP_GATE_WAITING_EVENT_INTERVAL !== 0) {
      return;
    }
    this._recordClusterStage(
      stage,
      {
        attempts,
        elapsedMs: Number(attemptResult?.elapsedMs) || 0,
        ...details,
      },
    );
  }

  async _runChaosAction(action, entityId, details, operation) {
    const normalizedDetails = details || {};
    const faultStatus = resolveChaosFaultStatus(action);
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CHAOS_ACTION_STARTED,
      PLAYBACK_SCOPE_CHAOS,
      entityId,
      {
        action,
        details: normalizedDetails,
      },
    );
    try {
      const result = await operation();
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.CHAOS_ACTION_COMPLETED,
        PLAYBACK_SCOPE_CHAOS,
        entityId,
        {
          action,
          details: normalizedDetails,
        },
      );
      this._recordPlaybackEvent(
        faultStatus === CHAOS_FAULT_STATUS_RECOVERED ?
          PLAYBACK_EVENT_TYPE.CHAOS_FAULT_RECOVERED :
          PLAYBACK_EVENT_TYPE.CHAOS_FAULT_INJECTED,
        PLAYBACK_SCOPE_CHAOS,
        entityId,
        {
          action,
          status: faultStatus,
          details: normalizedDetails,
        },
      );
      return result;
    } catch (error) {
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.CHAOS_FAULT_FAILED,
        PLAYBACK_SCOPE_CHAOS,
        entityId,
        {
          action,
          status: faultStatus,
          details: normalizedDetails,
          error: error?.message || null,
        },
      );
      throw error;
    }
  }

  _resolveProviderIndexForNodeIndex(nodeIndex) {
    const configuredProviderIndex = this._hostAssignment[nodeIndex];
    if (Number.isInteger(configuredProviderIndex) &&
        configuredProviderIndex >= 0 &&
        configuredProviderIndex < this._providers.length) {
      return configuredProviderIndex;
    }

    if (this._providers.length <= 0) {
      throw new Error('No Docker providers configured for cluster');
    }

    const fallbackProviderIndex = nodeIndex % this._providers.length;
    this._hostAssignment[nodeIndex] = fallbackProviderIndex;
    return fallbackProviderIndex;
  }

  async _startNode(nodeId, role, seedIp, nodeIndex) {
    const providerIdx = this._resolveProviderIndexForNodeIndex(nodeIndex);
    const provider = this._providers[providerIdx];
    const reuseContainers = this._isContainerReuseEnabled();
    const containerName = this._buildContainerName(nodeId, nodeIndex);

    const env = this._buildNodeEnv(nodeId, containerName, seedIp);
    if (reuseContainers) {
      await this._markReusableContainerForDataReset(containerName);
    }

    const labels = {
      [LABELS.CLUSTER]: this._clusterId,
      [LABELS.NODE_ID]: nodeId,
      [LABELS.ROLE]: role,
    };
    const dockerBinds = Array.isArray(this._config?.docker?.binds) ?
      this._config.docker.binds.filter((entry) =>
        typeof entry === 'string' && entry.length > 0) :
      [];
    if (reuseContainers) {
      dockerBinds.push(this._getReusableControlBind(containerName));
    }
    const hostConfigExtras = dockerBinds.length > 0 ?
      {[DOCKER_HOST_CONFIG_BINDS_KEY]: dockerBinds} :
      null;
    const startTimeout = this._config.timeouts?.nodeStartup ||
      TIMEOUTS.NODE_STARTUP;

    if (reuseContainers) {
      let existing = null;
      try {
        existing = await provider.inspectContainerIfExists(containerName);
      } catch (_inspectErr) {
        existing = null;
      }
      if (existing &&
          this._shouldRecreateReusableContainer(
            existing,
            env,
          )) {
        const existingContainerId = existing.Id || existing.id || containerName;
        try {
          await provider.removeContainer(existingContainerId);
          existing = null;
        } catch (err) {
          await this._collectFailureLogs();
          throw new Error(
            'Node "' + nodeId + '" (' + role +
            ') failed to reset reusable container: ' + err.message,
          );
        }
      }

      if (existing) {
        const containerId = existing.Id || existing.id || containerName;
        try {
          const status = String(existing?.State?.Status || '').toLowerCase();
          if (status === CONTAINER_RUNNING_STATUS) {
            try {
              await provider.stopContainer(containerId);
            } catch (error) {
              if (!isIgnorableContainerStopError(error)) {
                throw error;
              }
            }
          }
          await provider.startContainer(containerId, startTimeout);

          let refreshed = await provider.inspectContainer(containerId);
          const networks = refreshed?.NetworkSettings?.Networks;
          const runNetworkEndpoint = networks?.[this._networkName] || null;
          const connectedToRunNetwork = Boolean(runNetworkEndpoint);
          const hasRunNetworkAlias = hasDockerNetworkAlias(
            runNetworkEndpoint,
            containerName,
          );
          if (this._networkId &&
              (!connectedToRunNetwork || !hasRunNetworkAlias)) {
            if (connectedToRunNetwork && !hasRunNetworkAlias) {
              await provider.disconnectFromNetwork(
                this._networkId,
                containerId,
              );
            }
            await provider.connectToNetwork(
              this._networkId,
              containerId,
              [containerName],
            );
            refreshed = await provider.inspectContainer(containerId);
          }

          const ip = refreshed?.NetworkSettings?.Networks?.[
            this._networkName
          ]?.IPAddress || '';
          return new NodeHandle(
            nodeId,
            containerId,
            ip,
            role,
            provider,
            undefined,
            {
              adminQueryTimeoutMs:
                this._resolveNodeHandleAdminQueryTimeoutMs(),
            },
          );
        } catch (err) {
          await this._collectFailureLogs();
          throw new Error(
            'Node "' + nodeId + '" (' + role +
            ') failed to reuse container: ' + err.message,
          );
        }
      }
    }

    let result;
    try {
      result = await provider.createContainer({
        name: containerName,
        image: this._config.image,
        network: this._networkName,
        env,
        labels,
        resourceLimits: this._config.resourceLimits || {},
        startTimeout,
        hostConfigExtras,
        ...(reuseContainers ?
          {
            entrypoint: REUSE_ENTRYPOINT,
            command: REUSE_START_COMMAND_ARGS,
          } :
          {}),
      });
    } catch (err) {
      await this._collectFailureLogs();
      throw new Error(
        'Node "' + nodeId + '" (' + role +
        ') failed to start: ' + err.message,
      );
    }

    return new NodeHandle(
      nodeId,
      result.containerId,
      result.ip,
      role,
      provider,
      undefined,
      {
        adminQueryTimeoutMs:
          this._resolveNodeHandleAdminQueryTimeoutMs(),
      },
    );
  }

  async _waitForBootstrapApi(seedNode) {
    const startupTimeout = this._config.timeouts?.nodeStartup ||
      TIMEOUTS.NODE_STARTUP;
    const configuredStableWindowMs = Math.max(
      ZERO,
      this._config.timeouts?.bootstrapReadyStableWindowMs ??
        BOOTSTRAP_READY_STABLE_WINDOW_MS,
    );
    const hardTimeoutMs = startupTimeout *
      BOOTSTRAP_PROGRESS_TIMEOUT_MAX_MULTIPLIER;
    const startedAt = Date.now();
    const hardDeadline = startedAt + hardTimeoutMs;
    const bootstrapJoinReadyUrl =
      'http://' + seedNode.ip + ':' + PORTS.REST + BOOTSTRAP_JOIN_READY_PATH;
    const statusCounts = new Map();
    const phaseCounts = new Map();
    const reasonCounts = new Map();
    let attempts = ZERO;
    let lastResult = null;
    let bestProgress = null;
    let lastProgressAt = startedAt;
    let timeoutReason = 'hard_deadline';

    while (Date.now() <= hardDeadline) {
      attempts += 1;
      const probeResponse = await this._httpRequest({
        url: bootstrapJoinReadyUrl,
        timeoutMs: BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS,
        method: HTTP_METHOD_GET,
        includeBody: true,
      });
      const normalizedProbe =
        this._normalizeBootstrapReadinessProbeResult(probeResponse);
      const status = normalizedProbe.status;
      statusCounts.set(
        status,
        (statusCounts.get(status) || ZERO) + 1,
      );
      if (normalizedProbe.phase) {
        phaseCounts.set(
          normalizedProbe.phase,
          (phaseCounts.get(normalizedProbe.phase) || ZERO) + 1,
        );
      }
      for (const reason of normalizedProbe.reasons) {
        reasonCounts.set(
          reason,
          (reasonCounts.get(reason) || ZERO) + 1,
        );
      }

      const success = status >= HTTP_OK_LOWER &&
        status <= HTTP_OK_UPPER;
      lastResult = {
        ...normalizedProbe,
        success,
      };

      const progress = buildBootstrapProgressSnapshot(lastResult);
      if (compareBootstrapProgress(progress, bestProgress) > ZERO) {
        bestProgress = progress;
        lastProgressAt = Date.now();
      }

      if (success) {
        return;
      }

      const elapsedMs = Date.now() - startedAt;
      this._recordPeriodicStartupWaitingStage(
        CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING,
        {
          attempts,
          elapsedMs,
        },
        {
          nodeId: seedNode.id,
          lastStatus: lastResult?.status ?? null,
          lastPhase: lastResult?.phase ?? null,
          lastPhaseRank: lastResult?.phaseRank ?? ZERO,
          lastState: lastResult?.state ?? null,
          lastReasons: lastResult?.reasons || [],
          stableWindowMs: lastResult?.stableWindowMs ??
            configuredStableWindowMs,
          stableElapsedMs: lastResult?.stableElapsedMs ?? ZERO,
          readinessEpoch: lastResult?.readinessEpoch ?? null,
          noProgressTimeoutMs: startupTimeout,
          hardTimeoutMs,
        },
      );

      const now = Date.now();
      if ((now - lastProgressAt) >= startupTimeout) {
        timeoutReason = 'no_progress';
        break;
      }

      const sleepBudgetMs = Math.max(
        ZERO,
        Math.min(
          hardDeadline,
          lastProgressAt + startupTimeout,
        ) - now,
      );
      if (sleepBudgetMs <= ZERO) {
        timeoutReason = 'no_progress';
        break;
      }

      const desiredSleepMs = resolveBootstrapProbeSleepMs(
        lastResult,
        BOOTSTRAP_POLL_INTERVAL_MS,
      );
      await this._sleep(Math.min(desiredSleepMs, sleepBudgetMs));
    }

    await this._collectFailureLogs();
    const statusSummary = formatCountSummary(statusCounts);
    const phaseSummary = formatCountSummary(phaseCounts);
    const reasonSummary = formatCountSummary(reasonCounts);
    const lastStatus = lastResult?.status ?? null;
    const lastPhase = lastResult?.phase || UNKNOWN_PHASE;
    const lastState = lastResult?.state || UNKNOWN_STATE;
    const lastReasons = Array.isArray(lastResult?.reasons) &&
      lastResult.reasons.length > ZERO ?
      lastResult.reasons.join(',') :
      'none';
    const bestProgressSummary = summarizeBootstrapProgress(bestProgress);
    const elapsedMs = Date.now() - startedAt;
    const lastProgressElapsedMs = Math.max(
      ZERO,
      Date.now() - lastProgressAt,
    );
    throw new Error(
      'Seed node bootstrap API did not become join-ready ' +
      'within ' + elapsedMs + 'ms' +
      ' (attempts=' + attempts +
      ', timeoutReason=' + timeoutReason +
      ', noProgressTimeoutMs=' + startupTimeout +
      ', hardTimeoutMs=' + hardTimeoutMs +
      ', lastStatus=' + String(lastStatus) +
      ', lastPhase=' + lastPhase +
      ', lastState=' + lastState +
      ', lastReasons=' + lastReasons +
      ', bestStatus=' + String(bestProgressSummary.status) +
      ', bestPhase=' + bestProgressSummary.phase +
      ', bestReasons=' + bestProgressSummary.reasons +
      ', stableWindowMs=' +
        (lastResult?.stableWindowMs ?? configuredStableWindowMs) +
      ', stableElapsedMs=' + (lastResult?.stableElapsedMs ?? ZERO) +
      ', readinessEpoch=' + String(lastResult?.readinessEpoch ?? 'none') +
      ', lastProgressElapsedMs=' + lastProgressElapsedMs +
      ', elapsedMs=' + elapsedMs +
      ', statusCounts=' + (statusSummary || 'none') +
      ', phaseCounts=' + (phaseSummary || 'none') +
      ', reasonCounts=' + (reasonSummary || 'none') +
      ')',
    );
  }

  _normalizeBootstrapReadinessProbeResult(probeResponse) {
    return normalizeReadinessProbeResult(probeResponse);
  }

  async _probeClusterActiveState(deadline, options = {}) {
    const readinessMode = options.mode === CLUSTER_READINESS_MODE_LOAD ?
      CLUSTER_READINESS_MODE_LOAD :
      CLUSTER_READINESS_MODE_STARTUP;
    const nodes = [...this._nodes.values()];
    const nodeDiagnostics = await Promise.all(nodes.map(async (node) => {
      const remainingMs = Math.max(MIN_TIMEOUT_MS, deadline - Date.now());
      const probeTimeoutMs = Math.min(
        ADMIN_QUERY_TIMEOUT_MS,
        CLUSTER_ACTIVE_NODE_PROBE_TIMEOUT_MS,
        remainingMs,
      );
      let attemptedReadinessProbe = false;
      const buildStatusProbeResult = async (statusReason = null,
        activitySource = ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY) => {
        const status = await withTimeout(
          node.getStatus({
            timeoutMs: probeTimeoutMs,
            lane: ADMIN_SOCKET_LANE_PROBE,
          }),
          probeTimeoutMs,
          'Node status probe timed out for ' + node.id,
        );
        const active = this._isNodeActive(status);
        const state = active ?
          ACTIVE_STATE.toLowerCase() :
          (this._extractNodeState(status) || INACTIVE_STATE);
        return {
          nodeId: node.id,
          active,
          state,
          phase: null,
          reasons: statusReason ? [statusReason] : [],
          activitySource,
          admissionState: status.active === true ?
            STARTUP_ADMISSION_STATE_STRONG_ACTIVE :
            STARTUP_ADMISSION_STATE_BLOCKED,
          error: null,
        };
      };
      try {
        let active = false;
        let state = INACTIVE_STATE;
        let phase = null;
        let reasons = [];
        let activitySource = ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS;
        let admissionState = STARTUP_ADMISSION_STATE_BLOCKED;
        let admissionReason = null;

        const readinessProbeOrder = readinessMode ===
          CLUSTER_READINESS_MODE_LOAD ?
          [
            [ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
              'probeTrafficReadiness'],
            [ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
              'probeBootstrapReadiness'],
          ] :
          [
            [ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
              'probeBootstrapReadiness'],
            [ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
              'probeTrafficReadiness'],
          ];
        let readiness = null;
        for (const [probeSource, probeMethod] of readinessProbeOrder) {
          if (typeof node?.[probeMethod] !== 'function') {
            continue;
          }
          attemptedReadinessProbe = true;
          readiness = await withTimeout(
            node[probeMethod]({
              timeoutMs: probeTimeoutMs,
            }),
            probeTimeoutMs,
            'Node readiness probe timed out for ' + node.id,
          );
          active = readiness.status >= HTTP_OK_LOWER &&
            readiness.status <= HTTP_OK_UPPER;
          admissionState = active === true ?
            STARTUP_ADMISSION_STATE_STRONG_ACTIVE :
            STARTUP_ADMISSION_STATE_BLOCKED;
          admissionReason = active === true ?
            ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY :
            ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK;
          phase = typeof readiness.phase === 'string' ?
            readiness.phase :
            null;
          reasons = Array.isArray(readiness.reasons) ?
            readiness.reasons :
            [];
          if (active) {
            state = ACTIVE_STATE.toLowerCase();
          } else if (typeof readiness.state === 'string' &&
              readiness.state.length > 0) {
            state = readiness.state.toLowerCase();
          } else if (phase && phase.length > 0) {
            state = phase.toLowerCase();
          }
          activitySource = probeSource;
          break;
        }
        if (readiness) {
          if (typeof node.getReachabilityDiagnostics === 'function') {
            try {
              const adminDiagnostics = await withTimeout(
                node.getReachabilityDiagnostics({
                  timeoutMs: probeTimeoutMs,
                }),
                probeTimeoutMs,
                'Node admin readiness probe timed out for ' + node.id,
              );
              if (readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
                  canProjectStartupActiveFromTransientAdmin(
                    readiness,
                    adminDiagnostics,
                  )) {
                admissionState = STARTUP_ADMISSION_STATE_DEGRADED;
                admissionReason =
                  ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION;
                activitySource =
                  ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION;
                reasons = [...reasons];
              } else if (adminDiagnostics?.adminReady !== true) {
                active = false;
                state = INACTIVE_STATE;
                admissionState = STARTUP_ADMISSION_STATE_BLOCKED;
                const adminLastError =
                  typeof adminDiagnostics?.lastError === 'string' &&
                    adminDiagnostics.lastError.length > 0 ?
                    adminDiagnostics.lastError :
                    ACTIVE_PROBE_REASON_ADMIN_NOT_READY;
                admissionReason =
                  ACTIVE_PROBE_REASON_ADMIN_NOT_READY + '=' +
                  adminLastError;
                reasons = [
                  ...reasons,
                  ACTIVE_PROBE_REASON_ADMIN_NOT_READY +
                    '=' +
                    adminLastError,
                ];
              }
            } catch (adminProbeError) {
              active = false;
              state = INACTIVE_STATE;
              reasons = [
                ...reasons,
                ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX +
                  normalizeProbeError(adminProbeError),
              ];
            }
          }
        } else {
          const statusResult = await buildStatusProbeResult();
            active = statusResult.active;
            state = statusResult.state;
            phase = statusResult.phase;
            reasons = statusResult.reasons;
            activitySource = statusResult.activitySource;
            admissionState = statusResult.active === true ?
              STARTUP_ADMISSION_STATE_STRONG_ACTIVE :
              STARTUP_ADMISSION_STATE_BLOCKED;
            admissionReason = statusResult.active === true ?
              ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY :
              ACTIVE_PROBE_REASON_ADMIN_NOT_READY;
          }

        return {
          nodeId: node.id,
          active,
          state,
          phase,
          reasons,
          activitySource,
          admissionState,
          admissionReason,
          error: null,
        };
      } catch (error) {
        if (attemptedReadinessProbe === true &&
            typeof node.getStatus === 'function' &&
            isTimeoutShapedProbeError(error)) {
          try {
            const fallbackResult = await buildStatusProbeResult(
              ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX +
                normalizeProbeError(error),
              ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK,
            );
            return {
              ...fallbackResult,
              admissionReason:
                ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX +
                String(normalizeProbeError(error)),
            };
          } catch (_fallbackError) {
            // Fall through to explicit error classification below.
          }
        }
        return {
          nodeId: node.id,
          active: false,
          state: INACTIVE_STATE,
          phase: null,
          reasons: [],
          activitySource: ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS,
          admissionState: STARTUP_ADMISSION_STATE_BLOCKED,
          admissionReason:
            ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX +
            String(normalizeProbeError(error)),
          error: normalizeProbeError(error),
        };
      }
    }));
    const activeByStatus = nodeDiagnostics.every(
      (diagnostic) => diagnostic.active === true,
    );
    const snapshotCoverage = await this._probeControlSnapshotCoverage(
      deadline,
      nodes.map((node) => node.id),
      {
        forceRepair: options.forceRepair === true,
        readinessMode,
      },
    );
    const publicationConvergenceGate = readinessMode ===
      CLUSTER_READINESS_MODE_LOAD ?
      evaluateLoadPublishedConvergence(
        snapshotCoverage,
        nodes.map((node) => node.id),
      ) :
      {
        ready: true,
        reasons: Object.freeze([]),
      };

    const loadModeConvergedPartialCoverage =
      readinessMode === CLUSTER_READINESS_MODE_LOAD &&
      activeByStatus === true &&
      publicationConvergenceGate.ready === true &&
      snapshotCoverage.completeCoverage !== true &&
      Number.isInteger(snapshotCoverage.bestCoverageNodeCount) &&
      snapshotCoverage.bestCoverageNodeCount > ZERO &&
      !(typeof snapshotCoverage.selectedError === 'string' &&
        snapshotCoverage.selectedError.length > ZERO);

    const allActive = activeByStatus &&
      (snapshotCoverage.completeCoverage === true ||
      loadModeConvergedPartialCoverage) &&
      publicationConvergenceGate.ready === true;
    const priorityRecoveryInvariants = evaluatePriorityRecoveryCrossServiceInvariants({
      readinessMode,
      nodeDiagnostics,
      publicationConvergenceGate,
      allActive,
    });

    return {
      allActive,
      nodeDiagnostics,
      snapshotCoverage,
      publicationConvergenceGate,
      priorityRecoveryInvariants,
    };
  }

  _extractControlSnapshotNodes(snapshotResult) {
    return this._extractControlSnapshotSummary(snapshotResult).nodes;
  }

  _extractControlSnapshotPayload(snapshotResult) {
    const rows = Array.isArray(snapshotResult?.rows) ?
      snapshotResult.rows :
      [];
    if (rows.length === ZERO || !rows[ZERO] ||
        typeof rows[ZERO] !== 'object') {
      return null;
    }
    return rows[ZERO];
  }

  _extractControlSnapshotSummary(snapshotResult) {
    const rows = Array.isArray(snapshotResult?.rows) ?
      snapshotResult.rows :
      [];
    if (rows.length === 0) {
      return {
        nodes: [],
        capturedAtMs: null,
      };
    }
    const row = rows[0];
    const controlPlaneDiagnostics =
      row?.controlPlaneDiagnostics &&
        typeof row.controlPlaneDiagnostics === 'object' ?
        row.controlPlaneDiagnostics :
        null;
    const activeNodeViews =
      controlPlaneDiagnostics?.activeNodeViews &&
        typeof controlPlaneDiagnostics.activeNodeViews === 'object' ?
        controlPlaneDiagnostics.activeNodeViews :
        null;
    const nodes = normalizeDistinctStringArray([
      ...parseJsonArrayField(
        row?.[CONTROL_SNAPSHOT_NODES_FIELD],
      ),
      ...parseJsonArrayField(
        row?.publishedNodes ?? row?.published_nodes,
      ),
      ...parseJsonArrayField(
        row?.projectedNodes ?? row?.projected_nodes,
      ),
      ...parseJsonArrayField(
        row?.suspectedOrTransitioningNodes ??
          row?.suspected_or_transitioning_nodes,
      ),
      ...parseJsonArrayField(
        activeNodeViews?.authoritativeNodeIds,
      ),
      ...parseJsonArrayField(
        activeNodeViews?.effectiveNodeIds,
      ),
      ...parseJsonArrayField(
        activeNodeViews?.projectedNodeIds,
      ),
      ...parseJsonArrayField(
        activeNodeViews?.publishedNodeIds,
      ),
    ]);
    const capturedAtMs = parseFiniteNumberField(row?.capturedAtMs) ??
      parseFiniteNumberField(row?.capturedAt);
    return {
      nodes,
      capturedAtMs,
    };
  }

  _summarizeControlSnapshotPublication(publication) {
    if (!publication || typeof publication !== 'object') {
      return null;
    }
    const publishedActiveNodeIds = parseJsonArrayField(
      publication.publishedActiveNodeIds ??
      publication.published_active_node_ids,
    );
    const pendingAckNodeIds = parseJsonArrayField(
      publication.pendingAckNodeIds ??
      publication.pending_ack_node_ids,
    );
    const acknowledgedNodeIds = parseJsonArrayField(
      publication.acknowledgedNodeIds ??
      publication.acknowledged_node_ids,
    );
    const membershipLifecycleSummaryRaw =
      publication.membershipLifecycleSummary &&
        typeof publication.membershipLifecycleSummary === 'object' ?
        publication.membershipLifecycleSummary :
        (publication.membership_lifecycle_summary &&
          typeof publication.membership_lifecycle_summary === 'object' ?
          publication.membership_lifecycle_summary :
          null);
    const projectionDiagnosticsRaw =
      publication.projectionDiagnostics &&
        typeof publication.projectionDiagnostics === 'object' ?
        publication.projectionDiagnostics :
        (membershipLifecycleSummaryRaw?.projectionDiagnostics &&
          typeof membershipLifecycleSummaryRaw.projectionDiagnostics ===
            'object' ?
          membershipLifecycleSummaryRaw.projectionDiagnostics :
          null);
    const participationByNodeIdRaw = parseJsonObjectField(
      publication.participationByNodeId ??
      publication.participation_by_node_id ??
      membershipLifecycleSummaryRaw?.participationByNodeId ??
      membershipLifecycleSummaryRaw?.participation_by_node_id,
    );
    const participationByNodeId = participationByNodeIdRaw ?
      Object.keys(participationByNodeIdRaw)
        .sort((left, right) => left.localeCompare(right))
        .reduce((accumulator, nodeId) => {
          const normalizedNodeId = String(nodeId || '').trim();
          if (normalizedNodeId.length === ZERO) {
            return accumulator;
          }
          const participation = participationByNodeIdRaw[nodeId];
          accumulator[normalizedNodeId] = {
            state:
              typeof participation?.state === 'string' &&
                participation.state.length > ZERO ?
                participation.state :
                null,
            durable: participation?.durable === true,
            publishedActive: participation?.publishedActive === true,
            recoveryActive: participation?.recoveryActive === true,
            projectedServing: participation?.projectedServing === true,
            locallyEligible: participation?.locallyEligible === true,
            suspectedOrTransitioning:
              participation?.suspectedOrTransitioning === true,
            recoverySource:
              typeof participation?.recoverySource === 'string' &&
                participation.recoverySource.length > ZERO ?
                participation.recoverySource :
                null,
            reasons: normalizeDistinctStringArray(
              parseJsonArrayField(participation?.reasons),
            ),
          };
          return accumulator;
        }, {}) :
      null;
    const participationStateCountsRaw = parseJsonObjectField(
      publication.participationStateCounts ??
      publication.participation_state_counts ??
      membershipLifecycleSummaryRaw?.participationStateCounts ??
      membershipLifecycleSummaryRaw?.participation_state_counts,
    );
    const participationStateCounts = participationStateCountsRaw ?
      Object.keys(participationStateCountsRaw)
        .sort((left, right) => left.localeCompare(right))
        .reduce((accumulator, state) => {
          const normalizedState = String(state || '').trim();
          const count = parseFiniteNumberField(
            participationStateCountsRaw[state],
          );
          if (normalizedState.length === ZERO || count === null) {
            return accumulator;
          }
          accumulator[normalizedState] = count;
          return accumulator;
        }, {}) :
      null;
    const priorityPartitionSummaryRaw =
      publication.priorityPartitionSummary &&
        typeof publication.priorityPartitionSummary === 'object' ?
        publication.priorityPartitionSummary :
        (publication.priority_partition_summary &&
          typeof publication.priority_partition_summary === 'object' ?
          publication.priority_partition_summary :
          null);
    const blockedPartitions = parseJsonArrayField(
      priorityPartitionSummaryRaw?.blockedPartitions ??
      priorityPartitionSummaryRaw?.blocked_partitions,
    );
    const missingPartitionIds = parseJsonArrayField(
      priorityPartitionSummaryRaw?.missingPartitionIds ??
      priorityPartitionSummaryRaw?.missing_partition_ids,
    );
    const totalSpreadGap = blockedPartitions.reduce((sum, partition) => {
      const spreadGap = Number.isFinite(partition?.spreadGap) ?
        Math.max(ZERO, Math.floor(partition.spreadGap)) :
        ZERO;
      return sum + spreadGap;
    }, ZERO);
    const largestSpreadGap = blockedPartitions.reduce((largestGap, partition) => {
      const spreadGap = Number.isFinite(partition?.spreadGap) ?
        Math.max(ZERO, Math.floor(partition.spreadGap)) :
        ZERO;
      return Math.max(largestGap, spreadGap);
    }, ZERO);
    const priorityPartitionSummary = priorityPartitionSummaryRaw ? {
      satisfied:
        priorityPartitionSummaryRaw.satisfied === true ?
          true :
          (priorityPartitionSummaryRaw.satisfied === false ? false : null),
      requiredDistinctNodeCount:
        Number.isFinite(priorityPartitionSummaryRaw.requiredDistinctNodeCount) ?
          Math.max(
            ZERO,
            Math.floor(priorityPartitionSummaryRaw.requiredDistinctNodeCount),
          ) :
          (Number.isFinite(
            priorityPartitionSummaryRaw.required_distinct_node_count,
          ) ?
            Math.max(
              ZERO,
              Math.floor(
                priorityPartitionSummaryRaw.required_distinct_node_count,
              ),
            ) :
            null),
      readyEligibleNodeCount:
        Number.isFinite(priorityPartitionSummaryRaw.readyEligibleNodeCount) ?
          Math.max(ZERO,
            Math.floor(priorityPartitionSummaryRaw.readyEligibleNodeCount)) :
          (Number.isFinite(priorityPartitionSummaryRaw.ready_eligible_node_count) ?
            Math.max(
              ZERO,
              Math.floor(priorityPartitionSummaryRaw.ready_eligible_node_count),
            ) :
            null),
      totalPriorityPartitionCount:
        Number.isFinite(priorityPartitionSummaryRaw.totalPriorityPartitionCount) ?
          Math.max(
            ZERO,
            Math.floor(priorityPartitionSummaryRaw.totalPriorityPartitionCount),
          ) :
          (Number.isFinite(
            priorityPartitionSummaryRaw.total_priority_partition_count,
          ) ?
            Math.max(
              ZERO,
              Math.floor(
                priorityPartitionSummaryRaw.total_priority_partition_count,
              ),
            ) :
            null),
      missingPartitionIds: missingPartitionIds
        .map((partitionId) => String(partitionId || ''))
        .filter((partitionId) => partitionId.length > ZERO),
      blockedPartitionCount: blockedPartitions.length,
      largestSpreadGap,
      totalSpreadGap,
    } : null;
    const projectionDiagnostics = projectionDiagnosticsRaw ? {
      readinessDecisionMode:
        typeof projectionDiagnosticsRaw.readinessDecisionMode === 'string' &&
          projectionDiagnosticsRaw.readinessDecisionMode.length > ZERO ?
          projectionDiagnosticsRaw.readinessDecisionMode :
          null,
      readinessDecisionDimensions: parseJsonArrayField(
        projectionDiagnosticsRaw.readinessDecisionDimensions,
      )
        .map((dimension) => String(dimension || ''))
        .filter((dimension) => dimension.length > ZERO),
      recoveryEligibleProjectionEnabled:
        projectionDiagnosticsRaw.recoveryEligibleProjectionEnabled === true,
      recoveryEligibleIncludedNodeIds: parseJsonArrayField(
        projectionDiagnosticsRaw.recoveryEligibleIncludedNodeIds,
      )
        .map((nodeId) => String(nodeId || ''))
        .filter((nodeId) => nodeId.length > ZERO),
      readinessExcludedNodeIds: parseJsonArrayField(
        projectionDiagnosticsRaw.readinessExcludedNodeIds,
      )
        .map((nodeId) => String(nodeId || ''))
        .filter((nodeId) => nodeId.length > ZERO),
      clusterMemberUnhealthyExcludedNodeIds: parseJsonArrayField(
        projectionDiagnosticsRaw.clusterMemberUnhealthyExcludedNodeIds,
      )
        .map((nodeId) => String(nodeId || ''))
        .filter((nodeId) => nodeId.length > ZERO),
    } : null;
    const publishedActiveNodeIdsNormalized = publishedActiveNodeIds
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const recoveryActiveNodeIdsFromParticipation = participationByNodeId ?
      Object.entries(participationByNodeId)
        .filter(([, participation]) => participation?.recoveryActive === true)
        .map(([nodeId]) => nodeId) :
      [];
    const recoveryActiveNodeIdsFromPublication = parseJsonArrayField(
      publication.recoveryActiveNodeIds ??
      publication.recovery_active_node_ids,
    )
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const recoveryActiveNodeIdsFromLifecycle = parseJsonArrayField(
      membershipLifecycleSummaryRaw?.recoveryActiveNodeIds ??
      membershipLifecycleSummaryRaw?.recovery_active_node_ids,
    )
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const recoveryActiveNodeIds = normalizeDistinctStringArray(
      recoveryActiveNodeIdsFromParticipation.length > ZERO ?
        recoveryActiveNodeIdsFromParticipation :
        recoveryActiveNodeIdsFromPublication.length > ZERO ?
        recoveryActiveNodeIdsFromPublication :
        recoveryActiveNodeIdsFromLifecycle.length > ZERO ?
          recoveryActiveNodeIdsFromLifecycle :
          parseJsonArrayField(
            membershipLifecycleSummaryRaw?.locallyEligibleNodeIds,
          )
            .map((nodeId) => String(nodeId || ''))
            .filter((nodeId) => nodeId.length > ZERO)
            .length > ZERO ?
            parseJsonArrayField(
              membershipLifecycleSummaryRaw?.locallyEligibleNodeIds,
            )
              .map((nodeId) => String(nodeId || ''))
              .filter((nodeId) => nodeId.length > ZERO) :
            publishedActiveNodeIdsNormalized,
    );
    const recoveryActiveNodeSourceRaw =
      (typeof publication.recoveryActiveNodeSource === 'string' &&
        publication.recoveryActiveNodeSource.length > ZERO) ?
        publication.recoveryActiveNodeSource :
        ((typeof membershipLifecycleSummaryRaw?.recoveryActiveNodeSource ===
          'string' &&
          membershipLifecycleSummaryRaw.recoveryActiveNodeSource.length > ZERO) ?
          membershipLifecycleSummaryRaw.recoveryActiveNodeSource :
          null);
    const recoveryActiveNodeSource =
      recoveryActiveNodeSourceRaw ||
      (recoveryActiveNodeIds.length > ZERO ?
        (publishedActiveNodeIdsNormalized.length > ZERO &&
        recoveryActiveNodeIds.every((nodeId) =>
          publishedActiveNodeIdsNormalized.includes(nodeId),
        ) ?
          'published_membership' :
          'locally_eligible_projection') :
        null);
    const missingPublishedRecoveryActiveNodeIdsRaw = parseJsonArrayField(
      publication.missingPublishedRecoveryActiveNodeIds ??
      publication.missing_published_recovery_active_node_ids ??
      membershipLifecycleSummaryRaw?.missingPublishedRecoveryActiveNodeIds ??
      membershipLifecycleSummaryRaw?.missing_published_recovery_active_node_ids,
    )
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const missingPublishedRecoveryActiveNodeIds = normalizeDistinctStringArray(
      missingPublishedRecoveryActiveNodeIdsRaw.length > ZERO ?
        missingPublishedRecoveryActiveNodeIdsRaw :
        recoveryActiveNodeIds.filter((nodeId) =>
          !publishedActiveNodeIdsNormalized.includes(nodeId),
        ),
    );
    const recoveryProtocolState =
      typeof publication.recoveryProtocolState === 'string' &&
        publication.recoveryProtocolState.length > ZERO ?
        publication.recoveryProtocolState :
        (typeof membershipLifecycleSummaryRaw?.recoveryProtocolState ===
          'string' &&
          membershipLifecycleSummaryRaw.recoveryProtocolState.length > ZERO ?
          membershipLifecycleSummaryRaw.recoveryProtocolState :
          null);
    const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
      parseJsonArrayField(
        publication.priorityRecoveryReasonCodes ??
        publication.priority_recovery_reason_codes ??
        membershipLifecycleSummaryRaw?.recoveryProtocolReasonCodes ??
        membershipLifecycleSummaryRaw?.recovery_protocol_reason_codes,
      ),
    );
    const membershipLifecycleSummary = membershipLifecycleSummaryRaw ? {
      lifecycleState:
        typeof membershipLifecycleSummaryRaw.lifecycleState === 'string' &&
          membershipLifecycleSummaryRaw.lifecycleState.length > ZERO ?
          membershipLifecycleSummaryRaw.lifecycleState :
          null,
      epochBoundary:
        typeof membershipLifecycleSummaryRaw.epochBoundary === 'string' &&
          membershipLifecycleSummaryRaw.epochBoundary.length > ZERO ?
          membershipLifecycleSummaryRaw.epochBoundary :
          null,
      publishedActiveNodeIds: parseJsonArrayField(
        membershipLifecycleSummaryRaw.publishedActiveNodeIds,
      )
        .map((nodeId) => String(nodeId || ''))
        .filter((nodeId) => nodeId.length > ZERO),
      projectedServingNodeIds: parseJsonArrayField(
        membershipLifecycleSummaryRaw.projectedServingNodeIds,
      )
        .map((nodeId) => String(nodeId || ''))
        .filter((nodeId) => nodeId.length > ZERO),
      locallyEligibleNodeIds: parseJsonArrayField(
        membershipLifecycleSummaryRaw.locallyEligibleNodeIds,
      )
        .map((nodeId) => String(nodeId || ''))
        .filter((nodeId) => nodeId.length > ZERO),
      suspectedOrTransitioningNodeIds: parseJsonArrayField(
        membershipLifecycleSummaryRaw.suspectedOrTransitioningNodeIds,
      )
        .map((nodeId) => String(nodeId || ''))
        .filter((nodeId) => nodeId.length > ZERO),
      recoveryActiveNodeIds,
      recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds,
      projectionDiagnostics,
      ...(participationByNodeId &&
      Object.keys(participationByNodeId).length > ZERO ? {
        participationByNodeId,
      } : {}),
      ...(participationStateCounts &&
      Object.keys(participationStateCounts).length > ZERO ? {
        participationStateCounts,
      } : {}),
      ...(typeof recoveryProtocolState === 'string' &&
      recoveryProtocolState.length > ZERO ? {
        recoveryProtocolState,
      } : {}),
      ...(priorityRecoveryReasonCodes.length > ZERO ? {
        recoveryProtocolReasonCodes: priorityRecoveryReasonCodes,
      } : {}),
    } : null;
    return {
      publicationEpoch:
        parseFiniteNumberField(
          publication.publicationEpoch ??
          publication.publication_epoch,
        ) ??
        null,
      publicationStatus:
        typeof publication.publicationStatus === 'string' &&
          publication.publicationStatus.length > ZERO ?
          publication.publicationStatus :
          (typeof publication.status === 'string' &&
            publication.status.length > ZERO ?
            publication.status :
            null),
      publishedActiveNodeIds: publishedActiveNodeIds
        .map((nodeId) => String(nodeId))
        .filter((nodeId) => nodeId.length > ZERO),
      pendingAckNodeIds: pendingAckNodeIds
        .map((nodeId) => String(nodeId))
        .filter((nodeId) => nodeId.length > ZERO),
      acknowledgedNodeIds: acknowledgedNodeIds
        .map((nodeId) => String(nodeId))
        .filter((nodeId) => nodeId.length > ZERO),
      recoveryActiveNodeIds,
      recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds,
      priorityPartitionSummary,
      membershipLifecycleSummary,
      projectionDiagnostics,
      ...(participationByNodeId &&
      Object.keys(participationByNodeId).length > ZERO ? {
        participationByNodeId,
      } : {}),
      ...(participationStateCounts &&
      Object.keys(participationStateCounts).length > ZERO ? {
        participationStateCounts,
      } : {}),
      ...(typeof recoveryProtocolState === 'string' &&
      recoveryProtocolState.length > ZERO ? {
        recoveryProtocolState,
      } : {}),
      ...(priorityRecoveryReasonCodes.length > ZERO ? {
        priorityRecoveryReasonCodes,
      } : {}),
    };
  }

  _extractControlSnapshotCoverageDiagnostics(snapshotResult) {
    const snapshotPayload =
      this._extractControlSnapshotPayload(snapshotResult) || {};
    const controlPlaneDiagnostics =
      snapshotPayload?.controlPlaneDiagnostics &&
        typeof snapshotPayload.controlPlaneDiagnostics === 'object' ?
        snapshotPayload.controlPlaneDiagnostics :
        null;
    const readinessByNodeId =
      controlPlaneDiagnostics?.readinessByNodeId &&
        typeof controlPlaneDiagnostics.readinessByNodeId === 'object' ?
        controlPlaneDiagnostics.readinessByNodeId :
        {};
    const priorityRecoveryDecisionSnapshots =
      controlPlaneDiagnostics?.priorityRecoveryDecisionSnapshots &&
        typeof controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots === 'object' ?
        JSON.parse(JSON.stringify(controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots)) :
        null;
    const logsTable =
      controlPlaneDiagnostics?.logsTable &&
        typeof controlPlaneDiagnostics.logsTable === 'object' ?
        controlPlaneDiagnostics.logsTable :
        null;
    const cdcReplay =
      controlPlaneDiagnostics?.cdcReplay &&
        typeof controlPlaneDiagnostics.cdcReplay === 'object' ?
        controlPlaneDiagnostics.cdcReplay :
        null;
    const controlPlaneOwnerQueueDepth = logsTable ? {
      pendingWrites:
        Number.isFinite(logsTable.pendingWrites) ?
          Math.max(ZERO, Math.floor(logsTable.pendingWrites)) :
          ZERO,
      pendingWriteGrowthCount:
        Number.isFinite(logsTable.pendingWriteGrowthCount) ?
          Math.max(ZERO, Math.floor(logsTable.pendingWriteGrowthCount)) :
          ZERO,
      retainedBacklogGrowthCount:
        Number.isFinite(logsTable.retainedBacklogGrowthCount) ?
          Math.max(ZERO, Math.floor(logsTable.retainedBacklogGrowthCount)) :
          ZERO,
      sharedPressureBackpressured:
        logsTable.sharedPressureBackpressured === true,
    } : null;
    const cdcReplayLag = cdcReplay ? {
      bufferedEvents:
        Number.isFinite(cdcReplay.bufferedEvents) ?
          Math.max(ZERO, Math.floor(cdcReplay.bufferedEvents)) :
          ZERO,
      replayBufferGrowthCount:
        Number.isFinite(cdcReplay.replayBufferGrowthCount) ?
          Math.max(ZERO, Math.floor(cdcReplay.replayBufferGrowthCount)) :
          ZERO,
      replayRetryDepth:
        Number.isFinite(cdcReplay.replayRetryDepth) ?
          Math.max(ZERO, Math.floor(cdcReplay.replayRetryDepth)) :
          ZERO,
      replayInFlightPartitionCount:
        Number.isFinite(cdcReplay.replayInFlightPartitionCount) ?
          Math.max(ZERO, Math.floor(cdcReplay.replayInFlightPartitionCount)) :
          ZERO,
      partitionCount:
        Number.isFinite(cdcReplay.partitionCount) ?
          Math.max(ZERO, Math.floor(cdcReplay.partitionCount)) :
          ZERO,
    } : null;
    const healthyReadinessNodeIds = Object.entries(readinessByNodeId)
      .filter(([, readiness]) => {
        const dimensions =
          readiness?.dimensions &&
            typeof readiness.dimensions === 'object' ?
            readiness.dimensions :
            null;
        return dimensions?.[
          CONTROL_SNAPSHOT_READINESS_DIMENSION_CLUSTER_MEMBER_HEALTHY
        ] === true;
      })
      .map(([nodeId]) => String(nodeId))
      .filter((nodeId) => nodeId.length > ZERO)
      .sort();
    return {
      controlPlaneDiagnosticsAvailable: Boolean(controlPlaneDiagnostics),
      publicationConvergence: this._summarizeControlSnapshotPublication(
        controlPlaneDiagnostics?.publicationConvergence || null,
      ),
      publishedMembershipObservation: this._summarizeControlSnapshotPublication(
        controlPlaneDiagnostics?.publishedMembershipObservation || null,
      ),
      priorityRecoveryDecisionSnapshots,
      controlPlaneOwnerQueueDepth,
      cdcReplayLag,
      healthyReadinessNodeIds,
    };
  }

  async _probeControlSnapshotCoverage(
    deadline,
    expectedNodeIds = [],
    options = {},
  ) {
    const readinessMode = options.readinessMode === CLUSTER_READINESS_MODE_LOAD ?
      CLUSTER_READINESS_MODE_LOAD :
      CLUSTER_READINESS_MODE_STARTUP;
    const startupProbeTimeoutScale = readinessMode ===
      CLUSTER_READINESS_MODE_STARTUP ?
      2 :
      1;
    const expectedNodeSet = new Set(
      expectedNodeIds.map((nodeId) => String(nodeId)),
    );
    const nodes = [...this._nodes.values()];
    nodes.sort((left, right) => {
      const leftRank = left.role === NODE_ROLES.SEED ? 0 : 1;
      const rightRank = right.role === NODE_ROLES.SEED ? 0 : 1;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return String(left.id).localeCompare(String(right.id));
    });

    const resolveSnapshotProbeTimeoutMs = (maxTimeoutMs) => {
      const effectiveMaxTimeoutMs = maxTimeoutMs * startupProbeTimeoutScale;
      return resolveMeaningfulProbeTimeoutMs(
        deadline,
        effectiveMaxTimeoutMs,
        CONTROL_SNAPSHOT_LATE_PROBE_TIMEOUT_FLOOR_MS,
      );
    };
    const resolveReachabilityProbeTimeoutMs = (maxTimeoutMs) => {
      const effectiveMaxTimeoutMs = maxTimeoutMs * startupProbeTimeoutScale;
      return resolveMeaningfulProbeTimeoutMs(
        deadline,
        effectiveMaxTimeoutMs,
        CONTROL_SNAPSHOT_LATE_REACHABILITY_TIMEOUT_FLOOR_MS,
      );
    };
    const probeNodeSnapshotCoverage = async (
      node,
      snapshotTimeoutMs,
      reachabilityTimeoutMs,
    ) => {
      let reachabilityDiagnostics = null;
      let reachabilityError = null;
      const probeReachabilityDiagnostics = async () => {
        if (typeof node.getReachabilityDiagnostics !== 'function') {
          return;
        }
        try {
          reachabilityDiagnostics = await withTimeout(
            node.getReachabilityDiagnostics({
              timeoutMs: reachabilityTimeoutMs,
            }),
            reachabilityTimeoutMs,
            'Control snapshot reachability probe timed out for ' + node.id,
          );
        } catch (error) {
          reachabilityError = normalizeProbeError(error);
        }
      };
      try {
        let snapshotResult = null;
        try {
          snapshotResult = await node.getControlSnapshot({
            timeoutMs: snapshotTimeoutMs,
            lane: ADMIN_SOCKET_LANE_SNAPSHOT,
            forceRepair: options.forceRepair === true,
          });
        } catch (snapshotLaneError) {
          try {
            snapshotResult = await node.getControlSnapshot({
              timeoutMs: snapshotTimeoutMs,
              lane: ADMIN_SOCKET_LANE_DEFAULT,
              forceRepair: options.forceRepair === true,
            });
          } catch (fallbackLaneError) {
            throw new Error(
              normalizeProbeError(snapshotLaneError) +
              '; fallback lane ' + ADMIN_SOCKET_LANE_DEFAULT +
              ' failed: ' + normalizeProbeError(fallbackLaneError),
            );
          }
        }
        await probeReachabilityDiagnostics();
        const snapshotSummary =
          this._extractControlSnapshotSummary(snapshotResult);
        const snapshotDiagnostics =
          this._extractControlSnapshotCoverageDiagnostics(snapshotResult);
        const publicationConvergence =
          snapshotDiagnostics.publicationConvergence || null;
        const publishedActiveNodeIds = normalizeDistinctStringArray(
          publicationConvergence?.publishedActiveNodeIds,
        );
        const pendingAckNodeIds = normalizeDistinctStringArray(
          publicationConvergence?.pendingAckNodeIds,
        );
        const missingPublishedNodeIds = [...expectedNodeSet]
          .filter((expectedNodeId) => {
            return !publishedActiveNodeIds.includes(expectedNodeId);
          })
          .sort();
        const observedNodeIds = snapshotSummary.nodes;
        const observedNodeSet = new Set(observedNodeIds);
        let missingExpectedNodeCount = 0;
        for (const expectedNodeId of expectedNodeSet) {
          if (!observedNodeSet.has(expectedNodeId)) {
            missingExpectedNodeCount += 1;
          }
        }
        return {
          nodeId: node.id,
          error: null,
          snapshotTimeoutMs,
          reachabilityTimeoutMs,
          adminReady: reachabilityDiagnostics?.adminReady === true,
          reachable: reachabilityDiagnostics?.reachable === true,
          reachableBy:
            typeof reachabilityDiagnostics?.reachableBy === 'string' &&
              reachabilityDiagnostics.reachableBy.length > ZERO ?
              reachabilityDiagnostics.reachableBy :
              null,
          reachabilityError:
            typeof reachabilityDiagnostics?.lastError === 'string' &&
              reachabilityDiagnostics.lastError.length > ZERO ?
              reachabilityDiagnostics.lastError :
              reachabilityError,
          observedNodeCount: observedNodeSet.size,
          missingExpectedNodeCount,
          capturedAtMs: snapshotSummary.capturedAtMs,
          observedNodeIds,
          controlPlaneDiagnosticsAvailable:
            snapshotDiagnostics.controlPlaneDiagnosticsAvailable,
          publicationConvergence,
          publishedMembershipObservation:
            snapshotDiagnostics.publishedMembershipObservation,
          priorityRecoveryDecisionSnapshots:
            snapshotDiagnostics.priorityRecoveryDecisionSnapshots,
          controlPlaneOwnerQueueDepth:
            snapshotDiagnostics.controlPlaneOwnerQueueDepth,
          cdcReplayLag:
            snapshotDiagnostics.cdcReplayLag,
          healthyReadinessNodeIds:
            snapshotDiagnostics.healthyReadinessNodeIds,
          publishedActiveNodeIds,
          pendingAckNodeIds,
          missingPublishedNodeIds,
        };
      } catch (error) {
        await probeReachabilityDiagnostics();
        return {
          nodeId: node.id,
          error: normalizeProbeError(error),
          snapshotTimeoutMs,
          reachabilityTimeoutMs,
          adminReady: reachabilityDiagnostics?.adminReady === true,
          reachable: reachabilityDiagnostics?.reachable === true,
          reachableBy:
            typeof reachabilityDiagnostics?.reachableBy === 'string' &&
              reachabilityDiagnostics.reachableBy.length > ZERO ?
              reachabilityDiagnostics.reachableBy :
              null,
          reachabilityError:
            typeof reachabilityDiagnostics?.lastError === 'string' &&
              reachabilityDiagnostics.lastError.length > ZERO ?
              reachabilityDiagnostics.lastError :
              reachabilityError,
          observedNodeCount: 0,
          missingExpectedNodeCount: expectedNodeSet.size,
          capturedAtMs: null,
          observedNodeIds: [],
          controlPlaneDiagnosticsAvailable: false,
          publicationConvergence: null,
          publishedMembershipObservation: null,
          priorityRecoveryDecisionSnapshots: null,
          controlPlaneOwnerQueueDepth: null,
          cdcReplayLag: null,
          healthyReadinessNodeIds: [],
          publishedActiveNodeIds: [],
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
        };
      }
    };
    const snapshotProbeResults = [];
    if (nodes.length > ZERO) {
      const firstSnapshotTimeoutMs = resolveSnapshotProbeTimeoutMs(
        CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
      );
      const firstReachabilityTimeoutMs = resolveReachabilityProbeTimeoutMs(
        CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS,
      );
      const firstResult = await probeNodeSnapshotCoverage(
        nodes[0],
        firstSnapshotTimeoutMs,
        firstReachabilityTimeoutMs,
      );
      snapshotProbeResults.push(firstResult);
      if (firstResult.missingExpectedNodeCount !== ZERO && nodes.length > ONE) {
        const remainingSnapshotTimeoutMs = resolveSnapshotProbeTimeoutMs(
          CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
        );
        const remainingReachabilityTimeoutMs =
          resolveReachabilityProbeTimeoutMs(
          CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS,
          );
        const remainingResults = await Promise.all(
          nodes.slice(1).map((node) => {
            return probeNodeSnapshotCoverage(
              node,
              remainingSnapshotTimeoutMs,
              remainingReachabilityTimeoutMs,
            );
          }),
        );
        snapshotProbeResults.push(...remainingResults);
      }
    }
    const bestCoverageNodeCount = snapshotProbeResults.reduce(
      (maxCoverage, result) => Math.max(maxCoverage, result.observedNodeCount),
      0,
    );
    const completeCoverage = snapshotProbeResults.some(
      (result) => result.missingExpectedNodeCount === 0,
    );
    let selectedResult = null;
    for (const result of snapshotProbeResults) {
      if (!selectedResult) {
        selectedResult = result;
        continue;
      }
      if (result.missingExpectedNodeCount !==
          selectedResult.missingExpectedNodeCount) {
        if (result.missingExpectedNodeCount <
            selectedResult.missingExpectedNodeCount) {
          selectedResult = result;
        }
        continue;
      }
      if (result.observedNodeCount !== selectedResult.observedNodeCount) {
        if (result.observedNodeCount > selectedResult.observedNodeCount) {
          selectedResult = result;
        }
        continue;
      }
      if (result.controlPlaneDiagnosticsAvailable !==
          selectedResult.controlPlaneDiagnosticsAvailable) {
        if (result.controlPlaneDiagnosticsAvailable === true) {
          selectedResult = result;
        }
        continue;
      }
      if (result.adminReady !== selectedResult.adminReady) {
        if (result.adminReady === true) {
          selectedResult = result;
        }
        continue;
      }
      if (result.reachable !== selectedResult.reachable) {
        if (result.reachable === true) {
          selectedResult = result;
        }
        continue;
      }
      const resultHealthyReadinessCount =
        Array.isArray(result.healthyReadinessNodeIds) ?
          result.healthyReadinessNodeIds.length :
          ZERO;
      const selectedHealthyReadinessCount =
        Array.isArray(selectedResult.healthyReadinessNodeIds) ?
          selectedResult.healthyReadinessNodeIds.length :
          ZERO;
      if (resultHealthyReadinessCount !== selectedHealthyReadinessCount) {
        if (resultHealthyReadinessCount > selectedHealthyReadinessCount) {
          selectedResult = result;
        }
        continue;
      }
      const resultMissingPublishedCount =
        Array.isArray(result.missingPublishedNodeIds) ?
          result.missingPublishedNodeIds.length :
          expectedNodeSet.size;
      const selectedMissingPublishedCount =
        Array.isArray(selectedResult.missingPublishedNodeIds) ?
          selectedResult.missingPublishedNodeIds.length :
          expectedNodeSet.size;
      if (resultMissingPublishedCount !== selectedMissingPublishedCount) {
        if (resultMissingPublishedCount < selectedMissingPublishedCount) {
          selectedResult = result;
        }
        continue;
      }
      const resultPendingAckCount = Array.isArray(result.pendingAckNodeIds) ?
        result.pendingAckNodeIds.length :
        expectedNodeSet.size;
      const selectedPendingAckCount =
        Array.isArray(selectedResult.pendingAckNodeIds) ?
          selectedResult.pendingAckNodeIds.length :
          expectedNodeSet.size;
      if (resultPendingAckCount !== selectedPendingAckCount) {
        if (resultPendingAckCount < selectedPendingAckCount) {
          selectedResult = result;
        }
        continue;
      }
      const resultPublishedActiveCount =
        Array.isArray(result.publishedActiveNodeIds) ?
          result.publishedActiveNodeIds.length :
          ZERO;
      const selectedPublishedActiveCount =
        Array.isArray(selectedResult.publishedActiveNodeIds) ?
          selectedResult.publishedActiveNodeIds.length :
          ZERO;
      if (resultPublishedActiveCount !== selectedPublishedActiveCount) {
        if (resultPublishedActiveCount > selectedPublishedActiveCount) {
          selectedResult = result;
        }
        continue;
      }
      if (Number.isFinite(result.capturedAtMs) &&
          (!Number.isFinite(selectedResult.capturedAtMs) ||
          result.capturedAtMs > selectedResult.capturedAtMs)) {
        selectedResult = result;
      }
    }
    const publicationDisagreementByNodeId = {};
    for (const result of snapshotProbeResults) {
      publicationDisagreementByNodeId[result.nodeId] =
        Array.isArray(result.missingPublishedNodeIds) ?
          [...result.missingPublishedNodeIds] :
          [];
    }
    return {
      completeCoverage,
      expectedNodeCount: expectedNodeSet.size,
      bestCoverageNodeCount,
      forceRepair: options.forceRepair === true,
      selectedNodeId: selectedResult?.nodeId || null,
      selectedSnapshotNodeId: selectedResult?.nodeId || null,
      selectedAdminReady: selectedResult?.adminReady === true,
      selectedSnapshotAdminReady: selectedResult?.adminReady === true,
      selectedReachable: selectedResult?.reachable === true,
      selectedReachableBy: selectedResult?.reachableBy || null,
      selectedSnapshotReachableBy: selectedResult?.reachableBy || null,
      selectedReachabilityError: selectedResult?.reachabilityError || null,
      selectedSnapshotReachabilityError:
        selectedResult?.reachabilityError || null,
      selectedSnapshotTimeoutMs: Number.isFinite(selectedResult?.snapshotTimeoutMs) ?
        Math.max(MIN_TIMEOUT_MS, Math.floor(selectedResult.snapshotTimeoutMs)) :
        null,
      selectedReachabilityTimeoutMs:
        Number.isFinite(selectedResult?.reachabilityTimeoutMs) ?
          Math.max(MIN_TIMEOUT_MS,
            Math.floor(selectedResult.reachabilityTimeoutMs)) :
          null,
      selectedCapturedAtMs: Number.isFinite(selectedResult?.capturedAtMs) ?
        selectedResult.capturedAtMs :
        null,
      selectedObservedNodeIds: Array.isArray(selectedResult?.observedNodeIds) ?
        [...selectedResult.observedNodeIds] :
        [],
      selectedPublishedActiveNodeIds:
        Array.isArray(selectedResult?.publishedActiveNodeIds) ?
          [...selectedResult.publishedActiveNodeIds] :
          [],
      selectedPendingAckNodeIds:
        Array.isArray(selectedResult?.pendingAckNodeIds) ?
          [...selectedResult.pendingAckNodeIds] :
          [],
      selectedMissingPublishedNodeIds:
        Array.isArray(selectedResult?.missingPublishedNodeIds) ?
          [...selectedResult.missingPublishedNodeIds] :
          [],
      selectedControlPlaneDiagnosticsAvailable:
        selectedResult?.controlPlaneDiagnosticsAvailable === true,
      selectedPublicationConvergence:
        selectedResult?.publicationConvergence || null,
      selectedPublishedMembershipObservation:
        selectedResult?.publishedMembershipObservation || null,
      selectedPriorityRecoveryDecisionSnapshots:
        selectedResult?.priorityRecoveryDecisionSnapshots || null,
      selectedControlPlaneOwnerQueueDepth:
        selectedResult?.controlPlaneOwnerQueueDepth || null,
      selectedCdcReplayLag:
        selectedResult?.cdcReplayLag || null,
      publicationDisagreementByNodeId,
      selectedHealthyReadinessNodeIds:
        Array.isArray(selectedResult?.healthyReadinessNodeIds) ?
          [...selectedResult.healthyReadinessNodeIds] :
          [],
      probeWitnesses: snapshotProbeResults.map((result) => {
        return {
          nodeId: result.nodeId,
          snapshotQuerySucceeded: result.error === null,
          adminReady: result.adminReady === true,
          reachable: result.reachable === true,
          reachableBy: result.reachableBy || null,
          reachabilityError: result.reachabilityError || null,
          error: result.error || null,
          observedNodeCount: result.observedNodeCount,
          missingExpectedNodeCount: result.missingExpectedNodeCount,
          capturedAtMs: Number.isFinite(result.capturedAtMs) ?
            result.capturedAtMs :
            null,
          publicationEpoch: Number.isFinite(
            result?.publicationConvergence?.publicationEpoch,
          ) ?
            Math.floor(result.publicationConvergence.publicationEpoch) :
            null,
          publicationStatus:
            typeof result?.publicationConvergence?.publicationStatus ===
              'string' &&
              result.publicationConvergence.publicationStatus.length > ZERO ?
              result.publicationConvergence.publicationStatus :
              null,
          publishedActiveNodeIds:
            Array.isArray(result.publishedActiveNodeIds) ?
              [...result.publishedActiveNodeIds] :
              [],
          pendingAckNodeIds:
            Array.isArray(result.pendingAckNodeIds) ?
              [...result.pendingAckNodeIds] :
              [],
          missingPublishedNodeIds:
            Array.isArray(result.missingPublishedNodeIds) ?
              [...result.missingPublishedNodeIds] :
              [],
        };
      }),
      selectedError: selectedResult?.error || null,
    };
  }

  async _probeControlPlaneQuiescenceSnapshot(deadline) {
    const nodes = [...this._nodes.values()];
    nodes.sort((left, right) => {
      const leftRank = left.role === NODE_ROLES.SEED ? 0 : 1;
      const rightRank = right.role === NODE_ROLES.SEED ? 0 : 1;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return String(left.id).localeCompare(String(right.id));
    });

    let selectedSnapshot = null;
    let lastError = null;
    for (const [index, node] of nodes.entries()) {
      const snapshotTimeoutMs = resolveSequentialProbeTimeoutMs(
        deadline,
        nodes.length - index,
        CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
      );
      try {
        const snapshotResult = await node.getControlSnapshot({
          timeoutMs: snapshotTimeoutMs,
          lane: ADMIN_SOCKET_LANE_SNAPSHOT,
        });
        const payload = this._extractControlSnapshotPayload(snapshotResult);
        if (!payload) {
          throw new Error('control snapshot missing rows');
        }
        const replicaOperations = payload.replicaOperations &&
          typeof payload.replicaOperations === 'object' ?
          payload.replicaOperations :
          {};
        const leaders = payload.leaders &&
          typeof payload.leaders === 'object' ?
          payload.leaders :
          {};
        const leaderEntries = Object.entries(leaders)
          .sort((left, right) => left[0].localeCompare(right[0]));
        const candidateSnapshot = {
          nodeId: node.id,
          capturedAtMs: Number.isFinite(payload.capturedAt) ?
            Math.floor(payload.capturedAt) :
            null,
          inFlightCount:
            Number.isInteger(replicaOperations.inFlightCount) &&
              replicaOperations.inFlightCount >= ZERO ?
              replicaOperations.inFlightCount :
              ZERO,
          partitionGroupInFlight:
            normalizeReplicaOperationPartitionGroupInFlight(
              replicaOperations.partitionGroupInFlight,
            ),
          leaderSignature: JSON.stringify(leaderEntries),
          leaderCount: leaderEntries.length,
          operationTimelineSignature:
            buildReplicaOperationTimelineSignature(
              replicaOperations.operationTimelineById,
            ),
          error: null,
        };
        if (isBetterControlSnapshotCandidate(
          candidateSnapshot,
          selectedSnapshot,
        )) {
          selectedSnapshot = candidateSnapshot;
        }
      } catch (error) {
        lastError = normalizeProbeError(error);
      }
    }

    if (selectedSnapshot) {
      return selectedSnapshot;
    }
    return {
      nodeId: null,
      capturedAtMs: null,
      inFlightCount: null,
      partitionGroupInFlight: {},
      leaderSignature: null,
      leaderCount: ZERO,
      operationTimelineSignature: null,
      error: lastError || 'no_control_snapshot_candidates',
    };
  }

  async _probeCriticalSystemTopology(deadline, options = {}) {
    const enabled =
      this._resolveControlPlaneQuiescenceRequireCriticalSystemSpread(options);
    if (!enabled) {
      return {
        enabled: false,
        ready: true,
        readyTableCount: ZERO,
        totalSpreadGap: ZERO,
        tables: [],
      };
    }

    const tableNames =
      this._resolveControlPlaneQuiescenceCriticalSystemTableNames(options);
    const requiredDistinctNodeCount =
      this._resolveControlPlaneQuiescenceCriticalSystemRequiredDistinctNodeCount(
        options,
      );
    const tables = [];
    for (const tableName of tableNames) {
      tables.push(
        await this._probeCriticalSystemTableDistribution(
          deadline,
          tableName,
          requiredDistinctNodeCount,
        ),
      );
    }
    const readyTableCount = tables.filter((table) => table.ready === true).length;
    const totalSpreadGap = tables.reduce((sum, table) => {
      const spreadGap = Number.isInteger(table?.spreadGap) ?
        table.spreadGap :
        requiredDistinctNodeCount;
      return sum + spreadGap;
    }, ZERO);
    return {
      enabled: true,
      ready: readyTableCount === tables.length,
      readyTableCount,
      requiredDistinctNodeCount,
      totalSpreadGap,
      tables,
    };
  }

  async _probeCriticalSystemTableDistribution(
    deadline,
    tableName,
    requiredDistinctNodeCount,
  ) {
    const nodes = [...this._nodes.values()];
    nodes.sort((left, right) => {
      const leftRank = left.role === NODE_ROLES.SEED ? 0 : 1;
      const rightRank = right.role === NODE_ROLES.SEED ? 0 : 1;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return String(left.id).localeCompare(String(right.id));
    });

    const discoverySql = buildServiceDiscoverySql({tableName});
    let selectedSummary = null;
    let lastError = null;
    for (const [index, node] of nodes.entries()) {
      const timeoutMs = resolveSequentialProbeTimeoutMs(
        deadline,
        nodes.length - index,
        CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
      );
      try {
        const discoverySnapshot =
          typeof node.queryWithTimeout === 'function' ?
            await node.queryWithTimeout(
              discoverySql,
              [],
              {
                lane: ADMIN_SOCKET_LANE_SNAPSHOT,
                timeoutMs,
              },
            ) :
            await node.query(discoverySql, []);
        const discoverySummary =
          extractCriticalSystemDiscoverySummary(discoverySnapshot);
        const candidateSummary = {
          tableName,
          selectedNodeId: node.id,
          selectedCapturedAtMs: discoverySummary.capturedAtMs,
          readyNodeIds: discoverySummary.readyNodeIds,
          readyDistinctNodeCount: discoverySummary.readyDistinctNodeCount,
          readyReplicaCount: discoverySummary.readyReplicaCount,
          totalReplicaCount: discoverySummary.totalReplicaCount,
          requiredDistinctNodeCount,
          spreadGap: Math.max(
            ZERO,
            requiredDistinctNodeCount - discoverySummary.readyDistinctNodeCount,
          ),
          ready:
            discoverySummary.readyDistinctNodeCount >=
            requiredDistinctNodeCount,
          error: null,
        };
        if (isBetterCriticalSystemDiscoveryCandidate(
          candidateSummary,
          selectedSummary,
        )) {
          selectedSummary = candidateSummary;
        }
      } catch (error) {
        lastError = normalizeProbeError(error);
      }
    }

    if (selectedSummary) {
      return selectedSummary;
    }
    return {
      tableName,
      selectedNodeId: null,
      selectedCapturedAtMs: null,
      readyNodeIds: [],
      readyDistinctNodeCount: ZERO,
      readyReplicaCount: ZERO,
      totalReplicaCount: ZERO,
      requiredDistinctNodeCount,
      spreadGap: requiredDistinctNodeCount,
      ready: false,
      error: lastError || 'no_service_discovery_candidates',
    };
  }

  _resolveActiveWaitTimeoutMs() {
    const baseTimeout = this._config.timeouts?.convergence ||
      TIMEOUTS.CONVERGENCE;
    const configuredClusterSize = Number.isInteger(this._config?.size) ?
      this._config.size :
      0;
    const expectedNodeCount = Math.max(
      ACTIVE_WAIT_MIN_CLUSTER_SIZE,
      configuredClusterSize,
      this._nodes.size,
    );
    const extraNodeCount = Math.max(
      0,
      expectedNodeCount - ACTIVE_WAIT_MIN_CLUSTER_SIZE,
    );
    if (extraNodeCount === 0) {
      return baseTimeout;
    }
    const scaledTimeout = baseTimeout + Math.floor(
      (baseTimeout * extraNodeCount *
        ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_PER_EXTRA_NODE) /
      ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_DENOMINATOR,
    );
    const maxScaledTimeout = baseTimeout * ACTIVE_WAIT_TIMEOUT_MAX_MULTIPLIER;
    return Math.min(scaledTimeout, maxScaledTimeout);
  }

  _resolveNodeHandleAdminQueryTimeoutMs() {
    const benchmarkControlTimeoutMs =
      this._config?.benchmark?.controlQueryTimeoutMs;
    if (Number.isInteger(benchmarkControlTimeoutMs) &&
        benchmarkControlTimeoutMs > ZERO) {
      return benchmarkControlTimeoutMs;
    }
    return ADMIN_QUERY_TIMEOUT_MS;
  }

  _resolveActiveWaitNoProgressMaxAttempts(options = {}, timeoutMs = null) {
    if (Number.isInteger(options.noProgressMaxAttempts)) {
      return options.noProgressMaxAttempts > ZERO ?
        options.noProgressMaxAttempts :
        null;
    }
    if (Number.isInteger(this._config?.timeouts?.activeWaitNoProgressMaxAttempts)) {
      return this._config.timeouts.activeWaitNoProgressMaxAttempts > ZERO ?
        this._config.timeouts.activeWaitNoProgressMaxAttempts :
        null;
    }
    const resolvedTimeoutMs = Number.isInteger(timeoutMs) && timeoutMs > ZERO ?
      timeoutMs :
      this._resolveActiveWaitTimeoutMs();
    const estimatedAttempts = Math.max(
      ONE,
      Math.floor(resolvedTimeoutMs / ACTIVE_POLL_INTERVAL_MS),
    );
    if (estimatedAttempts < STARTUP_GATE_WAITING_EVENT_INTERVAL) {
      return null;
    }
    return Math.max(
      STARTUP_GATE_WAITING_EVENT_INTERVAL,
      Math.floor(estimatedAttempts / 2),
    );
  }

  _resolveLoadReadinessStableWindowMs(options = {}) {
    if (Number.isFinite(options.stableWindowMs)) {
      return Math.max(ZERO, Math.floor(options.stableWindowMs));
    }
    if (Number.isFinite(this._config?.timeouts?.loadReadinessStableWindowMs)) {
      return Math.max(
        ZERO,
        Math.floor(this._config.timeouts.loadReadinessStableWindowMs),
      );
    }
    return LOAD_READINESS_STABLE_WINDOW_MS;
  }

  _resolveLoadReadinessStabilityTimeoutMs(options = {}) {
    if (Number.isFinite(options.timeoutMs)) {
      return Math.max(MIN_TIMEOUT_MS, Math.floor(options.timeoutMs));
    }
    if (Number.isFinite(this._config?.timeouts?.loadReadinessStabilityTimeoutMs)) {
      return Math.max(
        MIN_TIMEOUT_MS,
        Math.floor(this._config.timeouts.loadReadinessStabilityTimeoutMs),
      );
    }
    return LOAD_READINESS_STABILITY_TIMEOUT_MS;
  }

  _resolveControlPlaneQuiescenceStableWindowMs(options = {}) {
    if (Number.isFinite(options.stableWindowMs) &&
        options.stableWindowMs >= ZERO) {
      return Math.floor(options.stableWindowMs);
    }
    if (Number.isFinite(this._config?.benchmark?.quiescentStableWindowMs) &&
        this._config.benchmark.quiescentStableWindowMs >= ZERO) {
      return Math.floor(this._config.benchmark.quiescentStableWindowMs);
    }
    return BENCHMARK_DEFAULTS.quiescentStableWindowMs;
  }

  _resolveControlPlaneQuiescenceTimeoutMs(options = {}) {
    if (Number.isFinite(options.timeoutMs) && options.timeoutMs > ZERO) {
      return Math.max(MIN_TIMEOUT_MS, Math.floor(options.timeoutMs));
    }
    if (Number.isFinite(this._config?.benchmark?.quiescentTimeoutMs) &&
        this._config.benchmark.quiescentTimeoutMs > ZERO) {
      return Math.max(
        MIN_TIMEOUT_MS,
        Math.floor(this._config.benchmark.quiescentTimeoutMs),
      );
    }
    if (Number.isFinite(this._config?.benchmark?.readyTimeoutMs) &&
        this._config.benchmark.readyTimeoutMs > ZERO) {
      return Math.max(
        MIN_TIMEOUT_MS,
        Math.floor(this._config.benchmark.readyTimeoutMs),
      );
    }
    return BENCHMARK_DEFAULTS.readyTimeoutMs;
  }

  _resolveControlPlaneQuiescenceNoProgressTimeoutMs(options = {}) {
    if (Number.isInteger(options.noProgressTimeoutMs) &&
        options.noProgressTimeoutMs > ZERO) {
      return options.noProgressTimeoutMs;
    }
    if (Number.isInteger(this._config?.benchmark?.quiescentNoProgressTimeoutMs) &&
        this._config.benchmark.quiescentNoProgressTimeoutMs > ZERO) {
      return this._config.benchmark.quiescentNoProgressTimeoutMs;
    }
    return null;
  }

  _resolveControlPlaneQuiescenceMaxInFlightCount(options = {}) {
    if (Number.isInteger(options.maxInFlightCount) &&
        options.maxInFlightCount >= ZERO) {
      return options.maxInFlightCount;
    }
    if (Number.isInteger(this._config?.benchmark?.preloadMaxReplicaOpsInFlight) &&
        this._config.benchmark.preloadMaxReplicaOpsInFlight >= ZERO) {
      return this._config.benchmark.preloadMaxReplicaOpsInFlight;
    }
    return ZERO;
  }

  _resolveControlPlaneQuiescenceRequireCriticalSystemSpread(options = {}) {
    if (typeof options.requireCriticalSystemSpread === 'boolean') {
      return options.requireCriticalSystemSpread;
    }
    return this._config?.benchmark?.strictPreloadReadiness === true;
  }

  _resolveControlPlaneQuiescenceCriticalSystemTableNames(options = {}) {
    if (Array.isArray(options.criticalSystemTableNames)) {
      const tableNames = normalizeDistinctStringArray(
        options.criticalSystemTableNames,
      );
      if (tableNames.length > ZERO) {
        return tableNames;
      }
    }
    return [...CONTROL_PLANE_QUIESCENCE_CRITICAL_TABLES];
  }

  _resolveControlPlaneQuiescenceCriticalSystemRequiredDistinctNodeCount(
    options = {},
  ) {
    if (Number.isInteger(options.criticalSystemRequiredDistinctNodeCount) &&
        options.criticalSystemRequiredDistinctNodeCount > ZERO) {
      return options.criticalSystemRequiredDistinctNodeCount;
    }
    const configuredReplicaCount = Number.isInteger(
      this._config?.benchmark?.replicationFactor,
    ) && this._config.benchmark.replicationFactor > ZERO ?
      this._config.benchmark.replicationFactor :
      3;
    const clusterNodeCount = Math.max(ONE, this._nodes.size || ONE);
    return Math.max(ONE, Math.min(configuredReplicaCount, clusterNodeCount));
  }

  async _waitForAllActive(options = {}) {
    const readinessMode = options.mode === CLUSTER_READINESS_MODE_LOAD ?
      CLUSTER_READINESS_MODE_LOAD :
      CLUSTER_READINESS_MODE_STARTUP;
    const timeoutOverrideMs = Number(options.timeoutMs);
    const timeout = Number.isFinite(timeoutOverrideMs) &&
      timeoutOverrideMs >= MIN_TIMEOUT_MS ?
      Math.floor(timeoutOverrideMs) :
      this._resolveActiveWaitTimeoutMs();
    const deadline = Date.now() + timeout;
    const forceRepairAfterMs = Number.isFinite(
      this._config?.timeouts?.activeWaitForceRepairAfter,
    ) ?
      Math.max(ZERO, this._config.timeouts.activeWaitForceRepairAfter) :
      TIMEOUTS.ACTIVE_WAIT_FORCE_REPAIR_AFTER;
    const noProgressMaxAttempts = readinessMode === CLUSTER_READINESS_MODE_LOAD ?
      this._resolveActiveWaitNoProgressMaxAttempts(options, timeout) :
      null;
    const forceRepairThreshold = Date.now() + forceRepairAfterMs;
    let forcedRepairIssued = false;
    const inactiveSummaryCounts = new Map();
    const blockerHistoryBySignature = new Map();
    let bestProgressSnapshot = null;
    let bestProgressScore = Number.NEGATIVE_INFINITY;
    let lastMeaningfulProgressAttempt = ZERO;
    let lastMeaningfulProgressElapsedMs = ZERO;
    let lastMeaningfulProgressSnapshot = null;
    let lastObservedProgressSnapshot = null;
    let lastObservedAttempt = ZERO;
    let lastObservedElapsedMs = ZERO;

    const summarizeAdmissionState = (nodeDiagnostics = []) => {
      const summary = {
        [STARTUP_ADMISSION_STATE_STRONG_ACTIVE]: ZERO,
        [STARTUP_ADMISSION_STATE_DEGRADED]: ZERO,
        [STARTUP_ADMISSION_STATE_BLOCKED]: ZERO,
      };
      for (const diagnostic of nodeDiagnostics) {
        const state = typeof diagnostic?.admissionState === 'string' &&
          Object.prototype.hasOwnProperty.call(summary, diagnostic.admissionState) ?
          diagnostic.admissionState :
          'unknown';
        summary[state] = (summary[state] || ZERO) + 1;
      }
      for (const [state, count] of Object.entries(summary)) {
        if (count === ZERO) {
          delete summary[state];
        }
      }
      return summary;
    };

    const resolveActiveGateWaitPolicy = (result) => {
      const progressSnapshot = buildActiveWaitProgressSnapshot(
        result,
        this._nodes.size,
        {readinessMode},
      );
      return buildActiveGateWaitPolicy({
        readinessMode,
        closureRecordId: progressSnapshot?.closureRecordId || null,
      });
    };

    const buildNoProgressDetails = (attempts, elapsedMs, stalled, progressSnapshot) => {
      const noProgressBudgetEnabled =
        Number.isInteger(noProgressMaxAttempts) &&
        noProgressMaxAttempts > ZERO;
      const coordinatorCyclesSinceProgress = Math.max(
        ZERO,
        attempts - (lastMeaningfulProgressAttempt || ZERO),
      );
      return {
        enabled: noProgressBudgetEnabled,
        mode: readinessMode,
        maxAttempts: noProgressBudgetEnabled ? noProgressMaxAttempts : null,
        maxCoordinatorCycles:
          noProgressBudgetEnabled ? noProgressMaxAttempts : null,
        attemptsSinceProgress: coordinatorCyclesSinceProgress,
        coordinatorCyclesSinceProgress,
        stalled: stalled === true,
        lastMeaningfulProgressAttempt:
          lastMeaningfulProgressAttempt || null,
        lastMeaningfulProgressElapsedMs:
          lastMeaningfulProgressElapsedMs || null,
        lastMeaningfulProgress:
          lastMeaningfulProgressSnapshot || null,
        currentProgress: progressSnapshot || null,
        closureRecordId: progressSnapshot?.closureRecordId || null,
        closureWitnessClass: progressSnapshot?.closureWitnessClass || null,
        readinessDelay: progressSnapshot?.readinessDelay || null,
      };
    };
    const buildActiveWaitReadinessFailure = ({
      mode = null,
      noProgress = null,
      attemptsSinceProgress = null,
      maxAttempts = null,
    } = {}) => {
      if (!noProgress || typeof noProgress !== 'object') {
        return null;
      }
      const readinessDelay = typeof noProgress.readinessDelay === 'object' &&
        noProgress.readinessDelay !== null ?
        noProgress.readinessDelay :
        null;
      const timedOut = readinessDelay &&
        readinessDelay.timedOut === true;
      const classCode = timedOut &&
        typeof readinessDelay?.cause === 'string' &&
        readinessDelay.cause.length > ZERO ?
        readinessDelay.cause :
        (
          noProgress?.reasonCode === ACTIVE_WAIT_NO_PROGRESS_REASON_CODE ||
          noProgress?.stalled === true ?
            ACTIVE_WAIT_NO_PROGRESS_CLASS_CODE :
            null
        );
      return {
        mode: typeof mode === 'string' && mode.length > ZERO ? mode : null,
        classCode,
        recoverability:
          typeof readinessDelay?.recoverability === 'string' &&
          readinessDelay.recoverability.length > ZERO ?
            readinessDelay.recoverability :
            null,
        progressSignal: {
          attemptsSinceProgress: Number.isInteger(attemptsSinceProgress) ?
            Math.max(ZERO, attemptsSinceProgress) :
            null,
          maxAttempts: Number.isInteger(maxAttempts) && maxAttempts > ZERO ?
            Math.max(ZERO, maxAttempts) :
            null,
          stalled: noProgress?.stalled === true,
        },
        terminalReason:
          typeof noProgress?.reasonCode === 'string' &&
          noProgress.reasonCode.length > ZERO ?
            noProgress.reasonCode :
            null,
        source:
          typeof readinessDelay?.source === 'string' &&
          readinessDelay.source.length > ZERO ?
            readinessDelay.source :
            null,
        cause:
          typeof readinessDelay?.cause === 'string' &&
          readinessDelay.cause.length > ZERO ?
            readinessDelay.cause :
            null,
        error:
          typeof readinessDelay?.error === 'string' &&
          readinessDelay.error.length > ZERO ?
            readinessDelay.error :
            null,
      };
    };

    const buildWaitingDetails = (attempts, elapsedMs, lastResult) => {
      const progressSnapshot = buildActiveWaitProgressSnapshot(
        lastResult,
        this._nodes.size,
        {readinessMode},
      );
      const invariantBreaches = summarizeInvariantBreaches(
        lastResult?.priorityRecoveryInvariants?.invariants,
      );
      const progressScore = scoreActiveWaitProgress(progressSnapshot);
      const meaningfulProgressObserved = progressScore > bestProgressScore;
      if (meaningfulProgressObserved) {
        bestProgressScore = progressScore;
        bestProgressSnapshot = progressSnapshot;
        lastMeaningfulProgressAttempt = attempts;
        lastMeaningfulProgressElapsedMs = elapsedMs;
        lastMeaningfulProgressSnapshot = progressSnapshot;
      }

      upsertActiveWaitBlockerHistory(
        blockerHistoryBySignature,
        progressSnapshot,
        attempts,
        elapsedMs,
      );
      lastObservedProgressSnapshot = progressSnapshot;
      lastObservedAttempt = attempts;
      lastObservedElapsedMs = elapsedMs;

      const attemptsSinceProgress = Math.max(
        ZERO,
        attempts - (lastMeaningfulProgressAttempt || ZERO),
      );
      const blockerHistory = summarizeActiveWaitBlockerHistory(
        blockerHistoryBySignature,
      );
      const waitingDetails = {
        nodeDiagnostics: lastResult?.nodeDiagnostics || [],
        snapshotCoverage: lastResult?.snapshotCoverage || null,
        publicationConvergenceGate: lastResult?.publicationConvergenceGate || null,
        priorityRecoveryInvariants: lastResult?.priorityRecoveryInvariants || null,
        invariantBreaches,
        activeGateProgress: progressSnapshot,
        activeGateBestProgress: bestProgressSnapshot || null,
        activeGateNoProgress: buildNoProgressDetails(
          attempts,
          elapsedMs,
          false,
          progressSnapshot,
        ),
        activeGateAdmissionState: summarizeAdmissionState(
          lastResult?.nodeDiagnostics || [],
        ),
        activeGateBlockerHistory: blockerHistory,
      };

      return {
        waitingDetails,
        invariantBreaches,
        progressSnapshot,
        attemptsSinceProgress,
        blockerHistory,
      };
    };

    let pollResult;
    try {
      pollResult = await pollUntilCondition({
        deadline,
        intervalMs: ACTIVE_POLL_INTERVAL_MS,
        sleep: (ms) => this._sleep(ms),
        probe: () => {
          const forceRepair =
            forcedRepairIssued === false &&
            Date.now() >= forceRepairThreshold;
          if (forceRepair) {
            forcedRepairIssued = true;
          }
          return this._probeClusterActiveState(deadline, {
            mode: readinessMode,
            forceRepair,
          });
        },
        isSuccess: (result) => {
          return result?.allActive === true ||
            (
              result?.priorityRecoveryInvariants?.passed === true &&
              resolveActiveGateWaitPolicy(result).allowSoftSuccess === true
            );
        },
        onAttempt: ({attempts, elapsedMs, lastResult}) => {
          for (const diagnostic of lastResult.nodeDiagnostics || []) {
            if (diagnostic.active === true) {
              continue;
            }
            const summaryKey = diagnostic.error ?
              ACTIVE_WAIT_INACTIVE_SUMMARY_ERROR_PREFIX + diagnostic.error :
              ACTIVE_WAIT_INACTIVE_SUMMARY_STATE_PREFIX +
                (diagnostic.state || UNKNOWN_STATE);
            inactiveSummaryCounts.set(
              summaryKey,
              (inactiveSummaryCounts.get(summaryKey) || ZERO) + 1,
            );
          }

          const waitingProgress = buildWaitingDetails(
            attempts,
            elapsedMs,
            lastResult,
          );

          this._recordPeriodicStartupWaitingStage(
            CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
            {
              attempts,
              elapsedMs,
            },
            waitingProgress.waitingDetails,
          );

          if (waitingProgress.invariantBreaches.hardCount > ZERO) {
            const hardReasonCodes = waitingProgress.invariantBreaches.hardBreaches
              .map((entry) => String(entry?.reasonCode || '').trim())
              .filter((reasonCode) => reasonCode.length > ZERO);
            const hardInvariantIds = waitingProgress.invariantBreaches.hardBreaches
              .map((entry) => String(entry?.invariantId || '').trim())
              .filter((invariantId) => invariantId.length > ZERO);
            const invariantFailureDetails = {
              reasonCode: ACTIVE_WAIT_INVARIANT_BREACH_REASON_CODE,
              mode: readinessMode,
              attempts,
              elapsedMs,
              hardReasonCodes,
              hardInvariantIds,
              invariantBreaches: waitingProgress.invariantBreaches,
            };
            this._recordClusterStage(
              CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
              {
                attempts,
                elapsedMs,
                ...waitingProgress.waitingDetails,
                invariantFailure: invariantFailureDetails,
              },
            );
            const invariantError = new Error(
              ACTIVE_WAIT_INVARIANT_BREACH_MESSAGE_PREFIX +
              '(mode=' +
              readinessMode +
              ', reasonCodes=' +
              (hardReasonCodes.length > ZERO ?
                hardReasonCodes.join('|') :
                UNKNOWN_REASON) +
              ', invariantIds=' +
              (hardInvariantIds.length > ZERO ?
                hardInvariantIds.join('|') :
                UNKNOWN_REASON) +
              ')',
            );
            const invariantProgressSnapshot = buildNoProgressDetails(
              attempts,
              elapsedMs,
              false,
              waitingProgress.progressSnapshot,
            );
            invariantError.diagnostics = {
              reasonCode: ACTIVE_WAIT_INVARIANT_BREACH_REASON_CODE,
              invariantBreaches: waitingProgress.invariantBreaches,
              priorityRecoveryInvariants:
                lastResult?.priorityRecoveryInvariants || null,
              noProgress: invariantProgressSnapshot ?
                {
                  ...invariantProgressSnapshot,
                  readinessFailure: buildActiveWaitReadinessFailure({
                    mode: readinessMode,
                    noProgress: invariantProgressSnapshot,
                    attemptsSinceProgress: waitingProgress.attemptsSinceProgress,
                    maxAttempts: noProgressMaxAttempts,
                  }),
                } :
                null,
            };
            invariantError.invariantBreaches = waitingProgress.invariantBreaches;
            throw invariantError;
          }

          if (Number.isInteger(noProgressMaxAttempts) &&
              noProgressMaxAttempts > ZERO &&
              waitingProgress.attemptsSinceProgress >= noProgressMaxAttempts) {
            const stalledCoordinatorCycles =
              waitingProgress.attemptsSinceProgress;
            const stalledProgress = buildNoProgressDetails(
              attempts,
              elapsedMs,
              true,
              waitingProgress.progressSnapshot,
            );
            const stalledNoProgress = {
              ...stalledProgress,
              readinessFailure: buildActiveWaitReadinessFailure({
                mode: readinessMode,
                noProgress: stalledProgress,
                attemptsSinceProgress: stalledCoordinatorCycles,
                maxAttempts: noProgressMaxAttempts,
              }),
              reasonCode: ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
              stalledReason:
                ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX +
                String(stalledCoordinatorCycles),
              failedNoProgress: {
                phase: CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
                details: {
                  mode: readinessMode,
                  budgetCoordinatorCycles: noProgressMaxAttempts,
                  budgetAttempts: noProgressMaxAttempts,
                  attempts,
                  elapsedMs,
                  attemptsSinceProgress: stalledCoordinatorCycles,
                  coordinatorCyclesSinceProgress:
                    stalledCoordinatorCycles,
                },
              },
              lastMeaningfulChange:
                lastMeaningfulProgressSnapshot &&
                  typeof lastMeaningfulProgressSnapshot === 'object' ?
                  {
                    attempt: lastMeaningfulProgressAttempt,
                    elapsedMs: lastMeaningfulProgressElapsedMs,
                    message: formatActiveWaitProgressSnapshot(
                      lastMeaningfulProgressSnapshot,
                    ),
                  } :
                  null,
              lastProgressEvent: waitingProgress.progressSnapshot &&
                typeof waitingProgress.progressSnapshot === 'object' ?
                {
                  attempt: attempts,
                  elapsedMs,
                  message: formatActiveWaitProgressSnapshot(
                    waitingProgress.progressSnapshot,
                  ),
                } :
                null,
              activeGateBlockerHistory: waitingProgress.blockerHistory,
            };
            this._recordClusterStage(
              CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
              {
                attempts,
                elapsedMs,
                ...waitingProgress.waitingDetails,
                activeGateNoProgress: stalledNoProgress,
              },
            );
            const stalledError = new Error(
              ACTIVE_WAIT_STALLED_MESSAGE_PREFIX +
              'for ' +
              String(stalledCoordinatorCycles) +
              ' attempts (mode=' +
              readinessMode +
              ', progress=' +
              formatActiveWaitProgressSnapshot(waitingProgress.progressSnapshot) +
              ')',
            );
            stalledError.diagnostics = {
              noProgress: stalledNoProgress,
              invariantBreaches: waitingProgress.invariantBreaches,
              priorityRecoveryInvariants: lastResult?.priorityRecoveryInvariants || null,
            };
            throw stalledError;
          }
        },
      });
    } catch (error) {
      try {
        await this._collectFailureLogs();
      } catch (_collectFailureLogsError) {
        // Best effort log collection only.
      }
      throw error;
    }

    if (pollResult.success) {
      return;
    }

    await this._collectFailureLogs();
    const nodeDiagnosticsSummary = formatNodeDiagnostics(
      pollResult.lastResult?.nodeDiagnostics || [],
    );
    const inactiveSummary = formatCountSummary(inactiveSummaryCounts);
    const snapshotCoverageSummary = formatSnapshotCoverage(
      pollResult.lastResult?.snapshotCoverage || null,
    );
    const publicationConvergenceSummary = formatPublicationConvergenceGate(
      pollResult.lastResult?.publicationConvergenceGate || null,
    );
    const priorityRecoveryFailingInvariantIds = normalizeDistinctStringArray(
      pollResult.lastResult?.priorityRecoveryInvariants?.failingInvariantIds,
    );
    const priorityRecoveryInvariantBreaches = summarizeInvariantBreaches(
      pollResult.lastResult?.priorityRecoveryInvariants?.invariants,
    );
    const finalProgressSnapshot = lastObservedProgressSnapshot ||
      buildActiveWaitProgressSnapshot(
        pollResult.lastResult || {},
        this._nodes.size,
        {readinessMode},
      );
    const finalAttemptsSinceProgress = Math.max(
      ZERO,
      pollResult.attempts - (lastMeaningfulProgressAttempt || ZERO),
    );
    const finalNoProgress = buildNoProgressDetails(
      pollResult.attempts,
      pollResult.elapsedMs,
      false,
      finalProgressSnapshot,
    );
    const finalNoProgressWithReasonCode = finalNoProgress ? {
      ...finalNoProgress,
      reasonCode: ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
    } : null;
    const finalReadinessFailure = finalNoProgressWithReasonCode ?
      buildActiveWaitReadinessFailure({
      mode: readinessMode,
      noProgress: finalNoProgressWithReasonCode,
      attemptsSinceProgress: finalAttemptsSinceProgress,
      maxAttempts: noProgressMaxAttempts,
    }) :
      null;
    if (finalNoProgress && !Array.isArray(finalNoProgress.activeGateBlockerHistory)) {
      finalNoProgress.activeGateBlockerHistory = summarizeActiveWaitBlockerHistory(
        blockerHistoryBySignature,
      );
    }
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
      {
        attempts: pollResult.attempts,
        elapsedMs: pollResult.elapsedMs,
        nodeDiagnostics: pollResult.lastResult?.nodeDiagnostics || [],
        snapshotCoverage: pollResult.lastResult?.snapshotCoverage || null,
        publicationConvergenceGate:
          pollResult.lastResult?.publicationConvergenceGate || null,
        priorityRecoveryInvariants: pollResult.lastResult?.priorityRecoveryInvariants || null,
        invariantBreaches: priorityRecoveryInvariantBreaches,
        activeGateProgress: finalProgressSnapshot,
        activeGateBestProgress: bestProgressSnapshot || null,
        activeGateAdmissionState: summarizeAdmissionState(
          pollResult.lastResult?.nodeDiagnostics || [],
        ),
        activeGateNoProgress: finalNoProgress,
        activeGateBlockerHistory: summarizeActiveWaitBlockerHistory(
          blockerHistoryBySignature,
        ),
      },
    );
    const timeoutError = new Error(
      'Not all nodes reached ' + ACTIVE_STATE +
      ' state within ' + timeout + 'ms' +
      ' (attempts=' + pollResult.attempts +
      ', elapsedMs=' + pollResult.elapsedMs +
      ', nodeDiagnostics=' + (nodeDiagnosticsSummary || 'none') +
      ', snapshotCoverage=' + snapshotCoverageSummary +
      ', publicationConvergence=' + publicationConvergenceSummary +
      ', priorityRecoveryInvariants=' +
      (priorityRecoveryFailingInvariantIds.length > ZERO ?
        priorityRecoveryFailingInvariantIds.join('|') :
        'passed') +
      ', progress=' + formatActiveWaitProgressSnapshot(finalProgressSnapshot) +
      (
        Number.isInteger(noProgressMaxAttempts) &&
        noProgressMaxAttempts > ZERO ?
          ', attemptsSinceProgress=' +
          String(finalAttemptsSinceProgress) +
          '/' +
          String(noProgressMaxAttempts) :
          ''
      ) +
      ', inactiveSummary=' + (inactiveSummary || 'none') +
      ')',
    );
    timeoutError.diagnostics = {
      noProgress: finalNoProgressWithReasonCode ? {
        ...finalNoProgressWithReasonCode,
        readinessFailure: finalReadinessFailure,
        stalledReason:
          ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX +
            String(finalAttemptsSinceProgress),
        failedNoProgress: {
          phase: CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
          details: {
            mode: readinessMode,
            budgetCoordinatorCycles: noProgressMaxAttempts,
            budgetAttempts: noProgressMaxAttempts,
            attempts: pollResult.attempts,
            elapsedMs: pollResult.elapsedMs,
            attemptsSinceProgress: finalAttemptsSinceProgress,
            coordinatorCyclesSinceProgress: finalAttemptsSinceProgress,
            timedOut: true,
          },
        },
        lastMeaningfulChange:
          lastMeaningfulProgressSnapshot &&
            typeof lastMeaningfulProgressSnapshot === 'object' ?
            {
              attempt: lastMeaningfulProgressAttempt,
              elapsedMs: lastMeaningfulProgressElapsedMs,
              message: formatActiveWaitProgressSnapshot(
                lastMeaningfulProgressSnapshot,
              ),
            } :
            null,
        lastProgressEvent:
          lastObservedProgressSnapshot &&
            typeof lastObservedProgressSnapshot === 'object' ?
            {
              attempt: lastObservedAttempt,
              elapsedMs: lastObservedElapsedMs,
              message: formatActiveWaitProgressSnapshot(
                lastObservedProgressSnapshot,
              ),
            } :
            null,
        priorityRecoveryInvariants:
          pollResult.lastResult?.priorityRecoveryInvariants || null,
      } : null,
      invariantBreaches: priorityRecoveryInvariantBreaches,
      priorityRecoveryInvariants:
        pollResult.lastResult?.priorityRecoveryInvariants || null,
    };
    throw timeoutError;
  }

  async waitForLoadReadinessStability(options = {}) {
    const stableWindowMs = this._resolveLoadReadinessStableWindowMs(options);
    if (stableWindowMs <= ZERO) {
      return;
    }
    const timeoutMs = this._resolveLoadReadinessStabilityTimeoutMs(options);
    const deadline = Date.now() + timeoutMs;
    let stableWindowStartedAtMs = null;
    const instabilitySummaryCounts = new Map();
    this._recordClusterStage(
      CLUSTER_STAGE_LOAD_READINESS_WAITING,
      {
        stableWindowMs,
        timeoutMs,
      },
    );
    const pollResult = await pollUntilCondition({
      deadline,
      intervalMs: ACTIVE_POLL_INTERVAL_MS,
      sleep: (ms) => this._sleep(ms),
      probe: async () => {
        const activeProbe = await this._probeClusterActiveState(deadline, {
          mode: CLUSTER_READINESS_MODE_LOAD,
        });
        const now = Date.now();
        if (activeProbe.allActive === true) {
          if (stableWindowStartedAtMs === null) {
            stableWindowStartedAtMs = now;
          }
        } else {
          stableWindowStartedAtMs = null;
        }
        const stableElapsedMs = stableWindowStartedAtMs === null ?
          ZERO :
          now - stableWindowStartedAtMs;
        return {
          ...activeProbe,
          stableElapsedMs,
          stable: activeProbe.allActive === true &&
            stableElapsedMs >= stableWindowMs,
        };
      },
      isSuccess: (result) => result.stable === true,
      onAttempt: ({attempts, elapsedMs, lastResult}) => {
        for (const diagnostic of lastResult.nodeDiagnostics || []) {
          if (diagnostic.active === true) {
            continue;
          }
          const summaryKey = diagnostic.error ?
            'error:' + diagnostic.error :
            'state:' + (diagnostic.state || UNKNOWN_STATE);
          instabilitySummaryCounts.set(
            summaryKey,
            (instabilitySummaryCounts.get(summaryKey) || ZERO) + 1,
          );
        }
        this._recordPeriodicStartupWaitingStage(
          CLUSTER_STAGE_LOAD_READINESS_WAITING,
          {
            attempts,
            elapsedMs,
          },
          {
            stableWindowMs,
            stableElapsedMs: lastResult?.stableElapsedMs ?? ZERO,
            nodeDiagnostics: lastResult.nodeDiagnostics || [],
            snapshotCoverage: lastResult.snapshotCoverage || null,
          },
        );
      },
    });

    if (pollResult.success) {
      this._recordClusterStage(
        CLUSTER_STAGE_LOAD_READINESS_STABLE,
        {
          stableWindowMs,
          timeoutMs,
          attempts: pollResult.attempts,
          elapsedMs: pollResult.elapsedMs,
          snapshotCoverage: pollResult.lastResult?.snapshotCoverage || null,
          publicationConvergenceGate:
            pollResult.lastResult?.publicationConvergenceGate || null,
        },
      );
      return;
    }

    await this._collectFailureLogs();
    const nodeDiagnosticsSummary = formatNodeDiagnostics(
      pollResult.lastResult?.nodeDiagnostics || [],
    );
    const instabilitySummary = formatCountSummary(instabilitySummaryCounts);
    const snapshotCoverageSummary = formatSnapshotCoverage(
      pollResult.lastResult?.snapshotCoverage || null,
    );
    const publicationConvergenceSummary = formatPublicationConvergenceGate(
      pollResult.lastResult?.publicationConvergenceGate || null,
    );
    throw new Error(
      'Cluster load readiness did not stabilize within ' +
      timeoutMs +
      'ms (attempts=' +
      pollResult.attempts +
      ', elapsedMs=' +
      pollResult.elapsedMs +
      ', stableWindowMs=' +
      stableWindowMs +
      ', stableElapsedMs=' +
      (pollResult.lastResult?.stableElapsedMs ?? ZERO) +
      ', nodeDiagnostics=' +
      (nodeDiagnosticsSummary || 'none') +
      ', snapshotCoverage=' +
      snapshotCoverageSummary +
      ', publicationConvergence=' +
      publicationConvergenceSummary +
      ', instabilitySummary=' +
      (instabilitySummary || 'none') +
      ')',
    );
  }

  _extractNodeState(status) {
    if (!status) {
      return null;
    }
    if (Array.isArray(status.rows) && status.rows.length > 0) {
      const row = status.rows[0];
      if (typeof row.status === 'string' && row.status.length > 0) {
        return row.status.toLowerCase();
      }
      if (typeof row.state === 'string' && row.state.length > 0) {
        return row.state.toLowerCase();
      }
    }
    if (typeof status.status === 'string' && status.status.length > 0) {
      return status.status.toLowerCase();
    }
    if (typeof status.state === 'string' && status.state.length > 0) {
      return status.state.toLowerCase();
    }
    return null;
  }

  _isNodeActive(status) {
    if (!status) return false;
    if (status.rows && status.rows.length > 0) {
      return this._isActiveValue(status.rows[0].status) ||
        this._isActiveValue(status.rows[0].state);
    }
    if (this._isActiveValue(status.status)) return true;
    if (this._isActiveValue(status.state)) return true;
    return false;
  }

  _isActiveValue(value) {
    if (typeof value !== 'string') {
      return false;
    }
    return value.toLowerCase() === STATUS_ACTIVE_LOWER;
  }

  async _collectFailureLogs() {
    for (const node of this._nodes.values()) {
      try {
        const logs = await withTimeout(
          node.getLogs({tail: CONTAINER_LOG_TAIL_LINES}),
          LOG_COLLECTION_TIMEOUT_MS,
          'Timed out collecting logs for node ' + node.id,
        );
        process.stderr.write(
          '--- Logs from ' + node.id +
          ' (' + node.role + ') ---\n' + logs + '\n',
        );
      } catch (_err) {
        // Best-effort log collection
      }
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Best-effort cleanup of Docker resources on unexpected exit.
 * Lists containers by cluster label and removes them.
 * Req 2.6
 */
async function bestEffortCleanup(provider, clusterId) {
  try {
    const containers = await provider.listContainers({
      [LABELS.CLUSTER]: clusterId,
    });
    for (const container of containers) {
      try {
        await provider.removeContainer(container.Id);
      } catch (_err) {
        // Best-effort
      }
    }
  } catch (_err) {
    // Best-effort
  }
}

function isProcessAlive(pid) {
  const normalizedPid = Number(pid);
  if (!Number.isInteger(normalizedPid) || normalizedPid <= ZERO) {
    return false;
  }
  try {
    process.kill(normalizedPid, ZERO);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function isReusableClusterLeaseTimeoutError(error) {
  return error?.code === REUSE_CLUSTER_LEASE_ERROR_CODE.TIMEOUT;
}

async function readReusableClusterLease(lockPath) {
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ?
      parsed :
      null;
  } catch (_error) {
    return null;
  }
}

async function tryRemoveReusableClusterLease(lockPath) {
  try {
    await fs.unlink(lockPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function acquireReusableClusterLease(options = {}) {
  const lockPath = String(options.lockPath || '');
  if (lockPath.length === ZERO) {
    throw new Error('Reusable cluster lease path is required');
  }
  const timeoutMs = Math.max(
    REUSE_LEASE_MIN_TIMEOUT_MS,
    Math.floor(Number(options.timeoutMs) || REUSE_LEASE_MIN_TIMEOUT_MS),
  );
  const pollIntervalMs = Math.max(
    MIN_TIMEOUT_MS,
    Math.floor(Number(options.pollIntervalMs) || REUSE_LEASE_POLL_INTERVAL_MS),
  );
  const sleep = typeof options.sleep === 'function' ?
    options.sleep :
    (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const metadata = options.metadata && typeof options.metadata === 'object' ?
    options.metadata :
    {};
  const deadlineAtMs = Date.now() + timeoutMs;
  await fs.mkdir(dirname(lockPath), {recursive: true});

  while (true) {
    let handle = null;
    try {
      handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(
        JSON.stringify(
          {
            ...metadata,
            pid: Number.isInteger(metadata.pid) ? metadata.pid : process.pid,
          },
          null,
          2,
        ),
        'utf8',
      );
      let released = false;
      return {
        lockPath,
        release: async () => {
          if (released) {
            return;
          }
          released = true;
          try {
            await handle.close();
          } catch (_error) {
            // Best-effort close
          }
          await tryRemoveReusableClusterLease(lockPath);
        },
      };
    } catch (error) {
      if (handle) {
        try {
          await handle.close();
        } catch (_closeError) {
          // Best-effort close
        }
      }
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      const existingLease = await readReusableClusterLease(lockPath);
      const holderPid = Number(existingLease?.pid) || null;
      if (!isProcessAlive(holderPid)) {
        await tryRemoveReusableClusterLease(lockPath);
        continue;
      }

      const holderScenario = typeof existingLease?.scenarioName === 'string' &&
        existingLease.scenarioName.length > ZERO ?
        existingLease.scenarioName :
        'unknown';
      if (holderPid === process.pid) {
        const reentryError = new Error(
          'Reusable cluster lease already held in this process ' +
          '(path=' + lockPath +
          ', holderPid=' + holderPid +
          ', holderScenario=' + holderScenario +
          ')',
        );
        reentryError.code = REUSE_CLUSTER_LEASE_ERROR_CODE.ALREADY_HELD;
        throw reentryError;
      }

      if (Date.now() >= deadlineAtMs) {
        const timeoutError = new Error(
          'Timed out waiting for reusable cluster lease ' +
          '(path=' + lockPath +
          ', timeoutMs=' + timeoutMs +
          ', holderPid=' + String(holderPid) +
          ', holderScenario=' + holderScenario +
          ')',
        );
        timeoutError.code = REUSE_CLUSTER_LEASE_ERROR_CODE.TIMEOUT;
        throw timeoutError;
      }
      await sleep(pollIntervalMs);
    }
  }
}

/**
 * Register one cluster for process-level best-effort cleanup.
 * @param {DockerProvider} provider
 * @param {string} clusterId
 * @return {Function}
 */
function registerClusterCleanup(provider, clusterId) {
  registerProcessCleanupHandlers();
  PROCESS_CLEANUP_REGISTRY.set(clusterId, {
    provider,
    clusterId,
  });
  return () => {
    PROCESS_CLEANUP_REGISTRY.delete(clusterId);
  };
}

/**
 * Install process cleanup handlers once per process.
 */
function registerProcessCleanupHandlers() {
  if (processCleanupHandlersRegistered) {
    return;
  }
  processCleanupHandlersRegistered = true;

  process.on(PROCESS_EVENT_EXIT, handleExitCleanup);
  for (const signal of PROCESS_SIGNAL_EVENTS) {
    process.on(signal, handleSignalCleanup);
  }
  process.on(PROCESS_EVENT_UNCAUGHT_EXCEPTION, handleExceptionCleanup);
}

/**
 * Snapshot and clear current cleanup registrations.
 * @return {Array<Object>}
 */
function drainCleanupRegistry() {
  const entries = Array.from(PROCESS_CLEANUP_REGISTRY.values());
  PROCESS_CLEANUP_REGISTRY.clear();
  return entries;
}

/**
 * Trigger best-effort cleanup for all registered clusters.
 * @param {Array<Object>} entries
 * @return {Promise<void>}
 */
async function cleanupEntries(entries) {
  await Promise.all(
    entries.map((entry) =>
      bestEffortCleanup(entry.provider, entry.clusterId),
    ),
  );
}

/**
 * Handle process exit event.
 */
function handleExitCleanup() {
  const entries = drainCleanupRegistry();
  for (const entry of entries) {
    bestEffortCleanup(entry.provider, entry.clusterId).catch(() => {});
  }
}

/**
 * Handle SIGINT/SIGTERM and preserve default process termination.
 * @param {string} signal
 */
function handleSignalCleanup(signal) {
  const entries = drainCleanupRegistry();
  cleanupEntries(entries)
    .catch(() => {})
    .finally(() => {
      process.removeListener(signal, handleSignalCleanup);
      process.kill(process.pid, signal);
    });
}

/**
 * Handle uncaught exceptions without swallowing the original failure.
 * @param {Error} error
 */
function handleExceptionCleanup(error) {
  const entries = drainCleanupRegistry();
  cleanupEntries(entries)
    .catch(() => {})
    .finally(() => {
      process.removeListener(
        PROCESS_EVENT_UNCAUGHT_EXCEPTION,
        handleExceptionCleanup,
      );
      process.nextTick(() => {
        throw error;
      });
    });
}

/**
 * Create a cluster.
 * Req 2.1, 2.2, 2.3
 *
 * @param {Object} config - Parsed cluster configuration
 * @returns {Cluster}
 */
function createCluster(config) {
  let providers;
  let hostAssignment;
  const dockerOperationSink =
    typeof config?.[CLUSTER_CONFIG_DOCKER_OPERATION_SINK] === 'function' ?
      config[CLUSTER_CONFIG_DOCKER_OPERATION_SINK] :
      null;

  if (config.docker.hosts && config.docker.hosts.length > 0) {
    providers = config.docker.hosts.map(
      (host) => new DockerProvider({
        host,
        operationSink: dockerOperationSink,
      }),
    );
    const nodesPerHost = config.nodesPerHost || config.size;
    hostAssignment = distributeNodes(
      config.size,
      providers,
      nodesPerHost,
    );
  } else {
    providers = [new DockerProvider({
      socketPath: config.docker.socketPath,
      operationSink: dockerOperationSink,
    })];
    hostAssignment = new Array(config.size).fill(0);
  }

  const cluster = new Cluster(config, providers, hostAssignment);

  registerProcessCleanupHandlers();

  return cluster;
}

export {createCluster, Cluster, NodeHandle, distributeNodes};
