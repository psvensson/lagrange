/**
 * Scenario: postgres-baseline-comparison
 *
 * Runs shared harness load against both the system under test and a baseline
 * Postgres cluster on the same Docker network, then reports comparative
 * throughput and latency metrics.
 */

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {
  arch as osArch,
  cpus as osCpus,
  hostname as osHostname,
  platform as osPlatform,
} from 'node:os';
import {dirname, join} from 'node:path';
import {
  ASSERTION_POLICY,
  BENCHMARK_DEFAULTS,
  CONSISTENCY_MISMATCH_KIND,
  CONSISTENCY_VERDICT,
  GATE_RESULT_MODE,
  NODE_CLIENT_CHANNEL,
  NODE_CLIENT_DEFAULT_CHANNEL_POLICIES,
  NODE_CLIENT_CONTEXT_KEYS,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  PHASE_STATUS,
  SCENARIO_PHASE,
} from '../harness/constants.js';
import {LoadGenerator} from '../harness/load-generator.js';
import {
  evaluateAssertionPolicy,
  collectLoadMetricHardFailures,
} from '../harness/assertion-policy.js';
import {ConsistencyEvaluatorV2} from '../harness/consistency-evaluator.js';
import {assertConsistencyFromSnapshots} from '../harness/assertions.js';
import {NodeClient} from '../harness/node-client.js';
import {PhaseOrchestrator} from '../harness/phase-orchestrator.js';
import {
  execShell,
  shellQuote,
  waitForPostgresReady,
} from '../harness/pgbench-runner.js';
import {GateEngine} from '../harness/gate-engine.js';
import {
  normalizeTableName,
  resolveInternalSignalThresholds,
  resolveOverloadPolicy,
  resolvePostgresBaselineBenchmarkConfig,
  resolveWritePressureThresholds,
} from '../harness/postgres-baseline-config.js';
import {
  buildRootCauseBundle,
  collectFailureControlSnapshots,
  collectPreflightCriticalPathSnapshots,
} from '../harness/root-cause-bundle.js';
import {evaluateRootCauseInvariants} from '../harness/root-cause-invariants.js';
import {summarizeInvariantBreaches} from '../harness/invariant-breaches.js';
import {INVARIANT_ID} from '../../../src/invariants/invariant-catalog.js';
import {QUERY_DEFAULTS} from '../../../src/query/query-constants.js';
import {
  DISCOVERY_READINESS_REASON_ADMIN_NOT_QUERYABLE,
  DISCOVERY_READINESS_REASON_ROUTING_NOT_READY,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_LAG,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN,
  compareSchemaVersions,
  extractAppliedSchemaVersionFromReadiness,
  normalizeRequiredSchemaVersion,
  evaluateCanonicalVersionedReadiness,
  buildCanonicalReadinessFromDiscoveryError,
} from './postgres-baseline-strict-gate.js';
import {
  extractNodeProbeReasonsByNodeId,
  formatNodeProbeReasons,
  buildVersionLagSummary,
  buildStrictPreloadNodeReasonSummary,
} from './postgres-baseline-diagnostics.js';
import {
  createQuietModeState,
  enterQuietMode,
  markQuietModePhase,
  exitQuietMode,
  buildQuietModeDetails,
} from './postgres-baseline-quiet-mode.js';
import {
  hasLoadLaneConfirmableLocalReadinessBlock,
  normalizeSutLoadNodeAdmissionEvidence,
  adjudicateSutLoadNodeAdmission,
  buildSutLoadNodeAdmissionDecisionTrace,
  shouldPreserveTopologyDeferredAdmission,
  shouldConfirmLocalReadinessViaLoadLane,
} from './postgres-baseline-node-admission.js';
import {rowsFromQueryResult} from './postgres-baseline-comparison-query-helpers.js';

const ZERO = 0;
const ONE = 1;
const POSTGRES_ENV_USER_KEY = 'POSTGRES_USER';
const POSTGRES_ENV_PASSWORD_KEY = 'POSTGRES_PASSWORD';
const POSTGRES_ENV_DB_KEY = 'POSTGRES_DB';
const POSTGRES_ENV_AUTH_METHOD_KEY = 'POSTGRES_HOST_AUTH_METHOD';
const POSTGRES_ENV_AUTH_METHOD_VALUE = 'scram-sha-256';
const BENCHMARK_CONTAINER_NAME_PREFIX = 'ddb-benchmark-postgres-';
const BENCHMARK_PRIMARY_SUFFIX = '-primary';
const BENCHMARK_REPLICA_SUFFIX_PREFIX = '-replica-';
const LOCALHOST = '127.0.0.1';
const SHELL_COMMAND = 'sh';
const SHELL_LOGIN_ARG = '-lc';
const STRICT_INVARIANT_GATE_IDS = new Set([
  INVARIANT_ID.CONTROL_PLANE_PARTITION_LEADER_DISCOVERABLE,
  INVARIANT_ID.CDC_RETRY_BUDGET_HEALTHY,
  INVARIANT_ID.CACHE_FRESHNESS_WITHIN_WATERMARK,
]);
const STRICT_INVARIANT_RETRY_REASON_CODES = new Set([
  'leadership_unknown_control_plane_partition',
]);
const STRICT_INVARIANT_RETRY_LEADERSHIP_ERROR_CODES = new Set([
  'leader_service_missing',
  'partition_missing',
]);
const STRICT_INVARIANT_RETRY_MAX_WINDOW_MS = 30000;
const STRICT_INVARIANT_RETRY_MIN_POLL_INTERVAL_MS = 250;
const SYNC_STANDBY_TEMPLATE_PREFIX = 'ANY ';
const SYNC_STANDBY_TEMPLATE_SUFFIX = ' (*)';
const PSQL_ON_ERROR_STOP = '-v ON_ERROR_STOP=1';
const PSQL_TUPLES_ONLY = '-tA';
const REPLICATION_STATE_STREAMING = 'streaming';
const REPLICATION_HBA_IPV4 = 'host replication all 0.0.0.0/0 scram-sha-256';
const REPLICATION_HBA_IPV6 = 'host replication all ::/0 scram-sha-256';
const DEFAULT_REPLICATION_PORT = 5432;
const BOOTSTRAP_DB_NAME = 'replication';
const POSTGRES_ENTRYPOINT_COMMAND = 'docker-entrypoint.sh postgres';
const POSTGRES_BINARY_PATH_EXPORT =
  'export PATH="$PATH:/usr/lib/postgresql/$PG_MAJOR/bin"';
const SYNCHRONOUS_COMMIT_ON = 'on';
const BASELINE_CACHE_SCHEMA_VERSION = 3;
const BASELINE_CACHE_DIRNAME = 'postgres-baseline-cache';
const BASELINE_CACHE_FILE_EXTENSION = '.json';
const BASELINE_CACHE_HASH_ALGORITHM = 'sha256';
const BASELINE_CACHE_HIT_REASON = 'cache-hit';
const BASELINE_CACHE_DISABLED_REASON = 'cache-disabled';
const BASELINE_CACHE_REFRESH_REASON = 'cache-refresh-requested';
const BASELINE_CACHE_MISS_REASON = 'cache-miss';
const BASELINE_CACHE_STALE_REASON = 'cache-stale';
const BASELINE_CACHE_INVALID_REASON = 'cache-invalid';
const BASELINE_CACHE_STORE_REASON = 'cache-stored';
const BENCHMARK_WORKLOAD_PROFILE = 'benchmark_events_mixed';
const BENCHMARK_WORKLOAD_OPERATIONS = Object.freeze(['INSERT', 'SELECT']);
const SUT_TABLE_PROBE_SQL_PREFIX = 'SELECT count(*) FROM ';
const SUT_TABLE_PROBE_SQL_SUFFIX = ' WHERE 1 = 0';
const QUIESCENCE_NODE_ERROR_SEPARATOR = '; ';
const QUIESCENCE_NODE_ERROR_PREFIX = 'nodeProbeFailures=';
const QUIESCENCE_IN_FLIGHT_ERROR_PREFIX = 'inFlightQueryError=';
const QUIESCENCE_IN_FLIGHT_COUNT_PREFIX = 'inFlightReplicaOperations=';
const QUIESCENCE_READY_NODE_COUNT_PREFIX = 'readyLoadNodes=';
const QUIESCENCE_STALL_PREFIX = 'progressStall=';
const PHASE_PROGRESS_ARTIFACT_KEY = 'phaseProgress';
const QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX =
  'in_flight_replica_operations:';
const QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX = 'in_flight_query_error:';
const QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX = 'node_probe_error:';
const QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX = 'leadership_unstable:';
const QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX = 'stalled_no_progress:';
const NO_PROGRESS_REASON_CODE = 'stalled_no_progress';
const QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX =
  'control_snapshot_query_error:';
const QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE =
  QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX + 'no_snapshot_candidates';
const ROUTING_DISCOVERY_QUERY_ERROR_PREFIX = 'service_discovery_query_error:';
const ROUTING_DISCOVERY_NO_SNAPSHOT_CANDIDATE =
  ROUTING_DISCOVERY_QUERY_ERROR_PREFIX + 'no_snapshot_candidates';
const QUIESCENCE_SNAPSHOT_ERROR_SEPARATOR = '|';
const QUIESCENCE_SNAPSHOT_ERROR_ASSIGN = '=';
const QUIESCENCE_SNAPSHOT_ERROR_MORE_SUFFIX = '_more';
const QUIESCENCE_SNAPSHOT_ERROR_MAX_ENTRIES = 3;
const POST_LOAD_DRAIN_STATUS_OK = 'ok';
const POST_LOAD_DRAIN_STATUS_FAILED = 'failed';
const POST_LOAD_DRAIN_MODE_FAILED = 'failed';
const STRICT_PRELOAD_READINESS_REASON_FAILED =
  'strict_preload_readiness_failed';
const STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX = 'node_reasons=';
const REQUIRED_SCHEMA_VERSION_UNAVAILABLE_REASON =
  'required_schema_version_unavailable';
const BENCHMARK_METADATA_FLOW_SCHEMA_VERSION = 1;
const BENCHMARK_METADATA_STAGE_CREATE_COMMITTED = 'create_committed';
const BENCHMARK_METADATA_STAGE_CREATE_ERROR = 'create_error';
const BENCHMARK_METADATA_STAGE_READINESS_POLL = 'readiness_poll';
const BENCHMARK_METADATA_STAGE_DISCOVERY_ERROR = 'discovery_error';
const BENCHMARK_METADATA_QUERY_TABLES = 'tables';
const BENCHMARK_METADATA_QUERY_PARTITIONS = 'partitions';
const BENCHMARK_METADATA_QUERY_SERVICES = 'services';
const BENCHMARK_METADATA_QUERY_ERROR_FIELD = 'queryErrors';
const BENCHMARK_METADATA_SERVICES_EMPTY_RESULT = 'not_requested';
const BENCHMARK_METADATA_SQL_FALSE_PREDICATE = '1 = 0';
const BENCHMARK_METADATA_SQL_OR = ' OR ';
const BENCHMARK_METADATA_SQL_IN_SEPARATOR = ', ';
const BENCHMARK_METADATA_SQL_WHERE = ' WHERE ';
const BENCHMARK_METADATA_TABLE_LOOKUP_PREFIX = 'SELECT * FROM tables';
const BENCHMARK_METADATA_PARTITION_LOOKUP_PREFIX = 'SELECT * FROM partitions';
const BENCHMARK_METADATA_SERVICE_LOOKUP_PREFIX =
  'SELECT * FROM services WHERE partition_id IN (';
const BENCHMARK_METADATA_SERVICE_LOOKUP_SUFFIX = ')';
const BENCHMARK_METADATA_TABLE_NAME_FIELD = 'table_name';
const BENCHMARK_METADATA_TABLE_ID_FIELD = 'table_id';
const BENCHMARK_METADATA_PARTITION_ID_FIELD = 'partition_id';
const BENCHMARK_METADATA_NODE_ID_FIELD = 'node_id';
const BENCHMARK_METADATA_STATUS_FIELD = 'status';
const BENCHMARK_METADATA_SERVICE_TYPE_FIELD = 'service_type';
const BENCHMARK_METADATA_RAFT_ROLE_FIELD = 'raft_role';
const BENCHMARK_METADATA_SERVICE_TYPE_PARTITION = 'partition';
const BENCHMARK_METADATA_STATUS_ACTIVE = 'active';
const BENCHMARK_METADATA_RAFT_ROLE_LEADER = 'leader';
const REQUIRED_SCHEMA_VERSION_FIELD_CANDIDATES = Object.freeze([
  'required_schema_version',
  'requiredSchemaVersion',
  'schema_version',
  'schemaVersion',
  'updated_at_hlc',
  'updatedAtHlc',
  'updated_at',
  'updatedAt',
  'created_at',
  'createdAt',
]);
const QUIESCENCE_DEFAULT_STABLE_WINDOW_MS =
  BENCHMARK_DEFAULTS.quiescentStableWindowMs;
const BASELINE_LOAD_NODE_PREFIX = 'postgres-baseline-load-node-';
const BENCHMARK_EVENT_TABLE_FALLBACK = 'benchmark_events';
const LOAD_PARITY_STATUS_MATCHED = 'matched';
const LOAD_PARITY_STATUS_MISMATCHED = 'mismatched';
const LOAD_PARITY_REASON_LOAD_FANOUT_MISMATCH = 'load_fanout_mismatch';
const LOAD_PARITY_REASON_PER_NODE_BUDGET_MISMATCH = 'per_node_budget_mismatch';
const LOAD_PARITY_REASON_TABLE_NAME_MISMATCH = 'table_name_mismatch';
const STRICT_PARITY_REASON_MISMATCH = 'strict_parity_mismatch';
const ADMISSION_CONFLICT_LOAD_NODE_MAX_IN_FLIGHT =
  'load_node_max_in_flight_conflict';
const DIAGNOSTICS_COVERAGE_STATUS_AVAILABLE = 'available';
const DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE = 'unavailable';
const DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED = 'not_reported';
const DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE = 'raftPropose';
const DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER = 'transportDeliver';
const DIAGNOSTICS_SAMPLE_KEY_SQLITE = 'sqlite';
const LOAD_METRIC_UNDISPATCHED_REASON_CAPACITY = 'capacity';
const LOAD_METRIC_UNDISPATCHED_REASON_DURATION_TIMEOUT = 'durationTimeout';
const LOAD_METRIC_UNDISPATCHED_REASON_CANCELLED = 'cancelled';
const LOAD_METRIC_REJECTED_REASON_QUEUE_FULL = 'queueFull';
const BENCHMARK_PRELOAD_MAX_REPLICA_OPS_IN_FLIGHT_DEFAULT = 0;
const PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD = 5;
const PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_MIN_SETTLE_TIMEOUT_MS = 90000;
const PREFLIGHT_CONVERGENCE_FORCE_REPAIR_AFTER_MS = 0;
const PREFLIGHT_CONVERGENCE_ALLOWED_VOTER_SKEW = 1;
const PRELOAD_QUIESCENCE_LARGE_CLUSTER_MAX_REPLICA_OPS_IN_FLIGHT = 5;
const PRELOAD_QUIESCENCE_LARGE_CLUSTER_STABLE_WINDOW_MS = 0;
const BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT = 2;
const BENCHMARK_LOAD_REBALANCE_MONITOR_POLL_INTERVAL_MS_DEFAULT = 250;
const BENCHMARK_CRITICAL_REBALANCING_SUSTAINED_SAMPLES_DEFAULT = 3;
const LOAD_PROGRESS_HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_FRESHNESS_SCHEMA_VERSION = 1;
const HEARTBEAT_FRESHNESS_STATUS_OK = 'ok';
const HEARTBEAT_FRESHNESS_STATUS_FAILED = 'failed';
const HEARTBEAT_FRESHNESS_STATUS_UNAVAILABLE = 'unavailable';
const HEARTBEAT_FRESHNESS_MAX_STALL_MS_DEFAULT = 15000;
const HEARTBEAT_FRESHNESS_LARGE_CLUSTER_MAX_STALL_MS = 25000;
const HEARTBEAT_FRESHNESS_MIN_SAMPLES_DEFAULT = 2;
const HEARTBEAT_FRESHNESS_INVARIANT_FAILED_REASON =
  'heartbeat_freshness_invariant_failed';
const REBALANCING_PRESSURE_SCHEMA_VERSION = 1;
const REBALANCING_CRITICAL_STATE_SCHEMA_VERSION = 1;
const LOAD_ROUTING_ADMISSION_SCHEMA_VERSION = 1;
const LOAD_ROUTING_ADMISSION_MAX_PROBE_ERRORS = 16;
const LOAD_ROUTING_ADMISSION_MAX_TRANSITIONS = 64;
const LOAD_ROUTING_ADMISSION_ERROR_CODE = 'routing_not_ready';
const LOAD_ROUTING_ADMISSION_ERROR_MESSAGE_PREFIX = 'routing admission blocked';
const LOAD_ROUTING_ADMISSION_REASON_PROBE_ERROR_PREFIX = 'routing_probe_error:';
const LOAD_ROUTING_ADMISSION_REASON_SEPARATOR = '|';
const LOAD_ROUTING_ADMISSION_SOURCE_DISCOVERY = 'service_discovery';
const LOAD_ROUTING_ADMISSION_SOURCE_PROBE_ERROR = 'probe_error';
const LOAD_ROUTING_ADMISSION_SOURCE_PROBE_ERROR_GRACE = 'probe_error_grace';
const REBALANCING_WINDOW_PINNING_VIOLATION_REASON =
  'rebalancing_window_pinning_violation';
const REBALANCING_PINNING_REASON_IN_FLIGHT_REPLICA_OPS =
  'in_flight_replica_ops';
const REBALANCING_PINNING_REASON_LEADERSHIP_CHURN = 'leadership_churn';
const CDC_TELEMETRY_SCHEMA_VERSION = 1;
const CDC_TELEMETRY_SCHEMA_MISSING_REASON = 'cdc_telemetry_schema_missing';
const CDC_TELEMETRY_MODE_STEADY = 'steady';
const CDC_TELEMETRY_MODE_CATCHUP = 'catchup';
const CDC_TELEMETRY_NODE_FIELD_SUBSCRIBER_COUNT = 'subscriberCount';
const CDC_TELEMETRY_NODE_FIELD_BUFFERED_EVENTS = 'bufferedEvents';
const CDC_TELEMETRY_NODE_FIELD_CATCHUP_LAG_EVENTS = 'catchupLagEvents';
const CDC_TELEMETRY_NODE_FIELD_CATCHUP_THROUGHPUT_EVENTS_PER_SEC =
  'catchupThroughputEventsPerSec';
const CDC_TELEMETRY_NODE_FIELD_MODE = 'mode';
const CDC_TELEMETRY_NODE_FIELD_AUTHORITATIVE_FALLBACK = 'authoritativeFallback';
const CDC_TELEMETRY_FALLBACK_PHASE_BOOTSTRAP = 'bootstrap';
const CDC_TELEMETRY_FALLBACK_PHASE_RECOVERY = 'recovery';
const CDC_TELEMETRY_FALLBACK_PHASE_STEADY_STATE = 'steady_state';
const AUTHORITATIVE_FALLBACK_POLICY_SCHEMA_VERSION = 1;
const AUTHORITATIVE_FALLBACK_THRESHOLD_EXCEEDED_REASON =
  'authoritative_fallback_threshold_exceeded';
const CDC_TELEMETRY_REQUIRED_FIELDS = Object.freeze([
  CDC_TELEMETRY_NODE_FIELD_SUBSCRIBER_COUNT,
  CDC_TELEMETRY_NODE_FIELD_BUFFERED_EVENTS,
  CDC_TELEMETRY_NODE_FIELD_CATCHUP_LAG_EVENTS,
]);
const INTERNAL_SIGNAL_CLASS_OPERATION_FAILED = 'operation_failed';
const INTERNAL_SIGNAL_CLASS_CDC_SAFE_FALLBACK = 'cdc_safe_fallback';
const INTERNAL_SIGNAL_CLASS_CDC_BUFFERED_WITHOUT_SUBSCRIBER =
  'cdc_buffered_without_subscriber';
const INTERNAL_SIGNAL_CLASS_CRITICAL_REBALANCING_STATE =
  'critical_rebalancing_state';
const INTERNAL_SIGNAL_CLASSES = Object.freeze([
  INTERNAL_SIGNAL_CLASS_OPERATION_FAILED,
  INTERNAL_SIGNAL_CLASS_CDC_SAFE_FALLBACK,
  INTERNAL_SIGNAL_CLASS_CDC_BUFFERED_WITHOUT_SUBSCRIBER,
  INTERNAL_SIGNAL_CLASS_CRITICAL_REBALANCING_STATE,
]);
const INTERNAL_SIGNAL_SEVERITY_ERRORS_BY_CLASS = Object.freeze({
  [INTERNAL_SIGNAL_CLASS_OPERATION_FAILED]: true,
});
const INTERNAL_SIGNAL_THRESHOLD_BREACH_REASON =
  'internal_signal_threshold_breach';
const INTERNAL_SIGNAL_PATTERN_OPERATION_FAILED = /operation failed/i;
const INTERNAL_SIGNAL_PATTERN_CDC_SAFE_FALLBACK =
  /falling back to safe cdc propagation mode/i;
const INTERNAL_SIGNAL_PATTERN_CDC_BUFFERED_WITHOUT_SUBSCRIBER =
  /cdc event buffered while no subscribers registered/i;
const INTERNAL_SIGNAL_PATTERN_CRITICAL_REBALANCING_STATE =
  /critical rebalancing state detected/i;
const BENCHMARK_DDL_BIGINT_TYPE = 'BIGINT';
const BENCHMARK_DDL_TEXT_TYPE = 'TEXT';
const BENCHMARK_DDL_NOT_NULL = 'NOT NULL';
const BENCHMARK_DDL_PRIMARY_KEY = 'PRIMARY KEY';
const BENCHMARK_POOL_IDLE_TIMEOUT_MS = 30000;
const BENCHMARK_POOL_CONNECTION_TIMEOUT_MS = 10000;
const PHASE_REASON_SUMMARY_MAX_ENTRIES = 5;
const STARTUP_DECISION_SCHEMA_VERSION = 1;
const FAILURE_ARTIFACT_SCHEMA_VERSION = 1;
const SATURATION_SCHEMA_VERSION = 1;
const BASELINE_STATUS_SKIPPED = 'skipped';
const BASELINE_SKIP_REASON_SUT_HARD_LOAD_FAILURE = 'sut_hard_load_failure';
const READINESS_TIMELINE_EVENT_POLL_SNAPSHOT = 'poll_snapshot';
const READINESS_TIMELINE_EVENT_REASON_TRANSITION = 'reason_transition';
const SATURATION_PATTERN_CDC_FORWARD_TIMEOUT =
  /cdc forward.*timeout|message timeout/i;
const SATURATION_PATTERN_SYSTEM_TABLE_QUERY_TIMEOUT =
  /system table.*query timeout|query timeout/i;
const QUIET_MODE_REASON_STRICT_BENCHMARK_MODE = 'strict_benchmark_mode';
const QUIET_MODE_REASON_RUN_FINALIZE = 'run_finalize';
const QUIET_MODE_ACTIVE_PHASES = Object.freeze([
  SCENARIO_PHASE.PRE_FLIGHT,
  SCENARIO_PHASE.PRE_LOAD_GATE,
  SCENARIO_PHASE.LOAD,
]);
const PHASE_CLASS_STARTUP = 'startup';
const PHASE_CLASS_DISCOVERY = 'discovery';
const PHASE_CLASS_TOPOLOGY = 'topology';
const PHASE_CLASS_LOAD = 'load';
const PHASE_CLASS_VERIFY = 'verify';
const PHASE_CLASS_TEARDOWN = 'teardown';
const PHASE_CLASS_UNKNOWN = 'unknown';
const REASON_CLASS_STARTUP = 'startup';
const REASON_CLASS_DISCOVERY = 'discovery';
const REASON_CLASS_TOPOLOGY = 'topology';
const REASON_CLASS_LOAD = 'load';
const REASON_CLASS_VERIFY = 'verify';
const REASON_CLASS_UNKNOWN = 'unknown';
const STRICT_PRELOAD_NODE_REASON_ENTRY_SEPARATOR = ';';
const STRICT_PRELOAD_NODE_REASON_VALUE_SEPARATOR = ':';
const DISCOVERY_FIELD_SERVICES = 'services';
const DISCOVERY_SERVICE_FIELD_PROTOCOL = 'protocol';
const DISCOVERY_SERVICE_FIELD_SERVICE_IDS = 'serviceIds';
const DISCOVERY_SERVICE_FIELD_REPLICAS = 'replicas';
const DISCOVERY_REPLICA_FIELD_NODE_ID = 'nodeId';
const DISCOVERY_REPLICA_FIELD_READINESS = 'readiness';
const DISCOVERY_REPLICA_FIELD_BENCHMARK_ADMISSION = 'benchmarkAdmission';
const DISCOVERY_READINESS_FIELD_WORKLOAD_READY = 'workloadReady';
const DISCOVERY_READINESS_FIELD_BENCHMARK_READY = 'benchmarkReady';
const DISCOVERY_READINESS_FIELD_ROUTING_READY = 'routingReady';
const DISCOVERY_READINESS_FIELD_SCHEMA_READY = 'schemaReady';
const DISCOVERY_READINESS_FIELD_TOPOLOGY_READY = 'topologyReady';
const DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT = 'replicaOpsInFlight';
const DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE = 'leadershipStable';
const DISCOVERY_READINESS_FIELD_TABLE_NAME = 'tableName';
const DISCOVERY_READINESS_FIELD_REASONS = 'reasons';
const DISCOVERY_READINESS_REASON_FIELD_CODE = 'code';
const DISCOVERY_READINESS_REASON_FIELD_DETAIL = 'detail';
const DISCOVERY_BENCHMARK_ADMISSION_FIELD_STATE = 'state';
const DISCOVERY_BENCHMARK_ADMISSION_FIELD_REASONS = 'reasons';
const DISCOVERY_BENCHMARK_ADMISSION_FIELD_TABLE_NAME = 'tableName';
const DISCOVERY_BENCHMARK_ADMISSION_FIELD_ROUTING_READY = 'routingReady';
const DISCOVERY_BENCHMARK_ADMISSION_FIELD_SCHEMA_READY = 'schemaReady';
const DISCOVERY_BENCHMARK_ADMISSION_FIELD_TOPOLOGY_READY = 'topologyReady';
const DISCOVERY_BENCHMARK_ADMISSION_FIELD_LOCAL_REPLICA_ROLE =
  'localReplicaRole';
const DISCOVERY_BENCHMARK_ADMISSION_FIELD_DEGRADED_OPERATION_IDS =
  'degradedByOperationIds';
const DISCOVERY_BENCHMARK_ADMISSION_STATE_READY = 'ready';
const DISCOVERY_BENCHMARK_ADMISSION_STATE_BLOCKED = 'blocked';
const DISCOVERY_ADMISSION_SOURCE = Object.freeze({
  RUNTIME: 'benchmark_admission',
  LEGACY: 'legacy_readiness',
  MISSING: 'missing',
});
const DISCOVERY_READINESS_REASON_BENCHMARK_NOT_READY = 'benchmark_not_ready';
const DISCOVERY_READINESS_REASON_READINESS_MISSING = 'readiness_missing';
const DISCOVERY_READINESS_REASON_WORKLOAD_NOT_READY = 'workload_not_ready';
const DISCOVERY_READINESS_REASON_SCHEMA_NOT_READY = 'schema_not_ready';
const DISCOVERY_READINESS_REASON_STATE_CONTRADICTION =
  'readiness_state_contradiction';
const DISCOVERY_READINESS_REASON_NOT_SELECTED_BY_DISCOVERY =
  'not_selected_by_discovery';
const STRICT_DOMINANT_REASON_PRECEDENCE = Object.freeze([
  DISCOVERY_READINESS_REASON_ADMIN_NOT_QUERYABLE,
  DISCOVERY_READINESS_REASON_ROUTING_NOT_READY,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_LAG,
  'topology_not_ready',
  DISCOVERY_READINESS_REASON_READINESS_MISSING,
]);
const DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID =
  'probeReadinessByNodeId';
const DISCOVERY_DIAGNOSTIC_PREFIX_PROBES = 'probes=';
const DISCOVERY_PROBE_REASON_ADMIN_NOT_READY = 'admin_not_ready';
const DISCOVERY_PROBE_REASON_LOAD_PROBE_FAILED = 'load_probe_failed';
const DISCOVERY_NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN = 'circuit_open';
const DISCOVERY_PROBE_REASON_REACHABLE_BY_PREFIX = 'reachable_by=';
const DISCOVERY_PROBE_REASON_LAST_ERROR_PREFIX = 'last_error=';
const DISCOVERY_PROBE_REASON_PROBE_ERROR_PREFIX = 'probe_error=';
const DISCOVERY_PROBE_REASON_SELF_DISCOVERY_PREFIX = 'self_discovery=';
const DISCOVERY_SOURCE_STATUS_DISCOVERED = 'discovered';
const DISCOVERY_SOURCE_STATUS_EMPTY = 'empty';
const DISCOVERY_SOURCE_STATUS_ERROR = 'error';
const DISCOVERY_SOURCE_SCOPE_TABLE_NAME_AND_ID = 'table_name_and_id';
const DISCOVERY_SOURCE_SCOPE_TABLE_NAME_ONLY = 'table_name_only';
const DISCOVERY_SOURCE_SCOPE_UNSCOPED = 'unscoped';
const DISCOVERY_UNKNOWN_NODE_ID = 'unknown';
const ADMIN_QUERY_TRACE_CAPTURE_MAX_NODES = 8;
const ADMIN_QUERY_TRACE_CAPTURE_MAX_PER_NODE = 16;
const DISCOVERY_ERROR_MESSAGE_MAX_CHARS = 160;
const DISCOVERY_ERROR_CAUSE_CHAIN_MAX_DEPTH = 4;
const DISCOVERY_ERROR_CHAIN_SEPARATOR = ' <- ';
const DISCOVERY_ERROR_NODE_CLIENT_CONTEXT_PREFIX = 'nodeClient(';
const DISCOVERY_ERROR_NODE_CLIENT_CONTEXT_SUFFIX = ')';
const DISCOVERY_GATE_STATUS_PASSED = 'passed';
const DISCOVERY_GATE_STATUS_FAILED = 'failed';
const DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES =
  'insufficient_reachable_nodes';
const DISCOVERY_SELECTION_POSTGRES_WIRE = 'postgres-wire';
const DISCOVERY_STALLED_ATTEMPT_THRESHOLD = 5;
const DEFAULT_PROBE_TIMEOUT_MS =
  Number.isInteger(
    NODE_CLIENT_DEFAULT_CHANNEL_POLICIES?.[NODE_CLIENT_CHANNEL.PROBE]
      ?.timeoutMs,
  ) &&
  NODE_CLIENT_DEFAULT_CHANNEL_POLICIES[NODE_CLIENT_CHANNEL.PROBE].timeoutMs >
    ZERO ?
    NODE_CLIENT_DEFAULT_CHANNEL_POLICIES[NODE_CLIENT_CHANNEL.PROBE].timeoutMs :
    1000;
const DISCOVERY_DIAGNOSTICS_FIELD_EXCLUDED_READINESS_BY_NODE_ID =
  'excludedReadinessByNodeId';
const DISCOVERY_DIAGNOSTICS_FIELD_EXCLUSION_REASON_COUNTS_BY_NODE =
  'exclusionReasonCountsByNode';
const DISCOVERY_DIAGNOSTICS_FIELD_NODE_ADMISSION_TRACE_BY_NODE_ID =
  'nodeAdmissionTraceByNodeId';
const DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUDED_NODES = 'excludedNodes=';
const DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUSION_COUNTS = 'excludedReasonCounts=';
const DISCOVERY_DIAGNOSTIC_PREFIX_ADMISSION_STATES = 'admissionStates=';
const DISCOVERY_DIAGNOSTIC_REASON_COUNT_SEPARATOR = '|';
const DISCOVERY_DIAGNOSTIC_NODE_REASON_SEPARATOR = ';';
const LOAD_BREAKER_OWNER_NODE_CLIENT = 'node-client';
const NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME = 'tableName';
const NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID = 'tableId';
const SYSTEM_TABLE_READ_PATH_MODE_CANONICAL = 'canonical_fallback';
const QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX = 'discovery_not_ready:';
const QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_PREFIX = 'discovery_reasons=';
const QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_SEPARATOR = '&';
const OVERLOAD_POLICY_VIOLATION_REASON = 'overload_policy_violation';
const WRITE_PRESSURE_SCHEMA_VERSION = 1;
const WRITE_PRESSURE_THRESHOLD_EXCEEDED_REASON =
  'write_pressure_threshold_exceeded';
const NODE_CLIENT_TRANSIENT_CONTEXT = Object.freeze({
  [NODE_CLIENT_CONTEXT_KEYS.TOLERATE_TRANSIENT_ERRORS]: true,
});
const NODE_CLIENT_MUTATING_CONTEXT = Object.freeze({
  ...NODE_CLIENT_TRANSIENT_CONTEXT,
  [NODE_CLIENT_CONTEXT_KEYS.RETRY_BUDGET]: ZERO,
});
const FAILURE_NODE_ID_PATTERN = /\bnode=([a-z0-9._:-]+)\b/gi;
const ROOT_CAUSE_SNAPSHOT_KIND_PREFLIGHT_CRITICAL_PATH =
  'preflight_critical_path';
const ROOT_CAUSE_SNAPSHOT_KIND_CONTROL_SNAPSHOT = 'control_snapshot';
const SNAPSHOT_WARNING_PREFIX = 'snapshot_error:';
const SNAPSHOT_REFRESH_WARNING_PREFIX = 'snapshot_refresh_error:';
const SNAPSHOT_REFRESH_WARNING_UNRESOLVED =
  'snapshot_refresh_unresolved_mismatch';
const SNAPSHOT_REFRESH_WARNING_SKIPPED =
  'snapshot_refresh_mismatch_without_targets';
const BENCHMARK_TABLE_CREATE_TIMEOUT_HEADROOM_MS = 5000;
const BENCHMARK_TABLE_CREATE_CONTROL_TIMEOUT_MS =
  QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS +
  BENCHMARK_TABLE_CREATE_TIMEOUT_HEADROOM_MS;
const BENCHMARK_TABLE_CREATE_LARGE_CLUSTER_RETRY_TIMEOUT_MS = 180000;
const BENCHMARK_TABLE_CREATE_OUTCOME_SUCCEEDED = 'succeeded';
const BENCHMARK_TABLE_CREATE_OUTCOME_FAILED = 'failed';

function buildBenchmarkTableCreateNodeClientContext(benchmarkConfig = {}) {
  const configuredControlTimeoutMs =
    Number.isInteger(benchmarkConfig?.controlQueryTimeoutMs) &&
    benchmarkConfig.controlQueryTimeoutMs > ZERO ?
      benchmarkConfig.controlQueryTimeoutMs :
      ZERO;
  return {
    ...NODE_CLIENT_MUTATING_CONTEXT,
    timeoutMs: Math.max(
      configuredControlTimeoutMs,
      BENCHMARK_TABLE_CREATE_CONTROL_TIMEOUT_MS,
    ),
    innerTimeoutMs: QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_SCENARIO_TIMING = Object.freeze({
  now: () => Date.now(),
  sleep,
});

function resolveScenarioTiming(configuredTiming) {
  return {
    now:
      typeof configuredTiming?.now === 'function' ?
        configuredTiming.now :
        DEFAULT_SCENARIO_TIMING.now,
    sleep:
      typeof configuredTiming?.sleep === 'function' ?
        configuredTiming.sleep :
        DEFAULT_SCENARIO_TIMING.sleep,
  };
}

function parseDurationToMs(duration) {
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    return Math.max(ZERO, Math.floor(duration));
  }
  const value = String(duration || '')
    .trim()
    .toLowerCase();
  if (value.endsWith('ms')) {
    return Math.max(ZERO, Math.floor(Number.parseInt(value.slice(0, -2), 10)));
  }
  if (value.endsWith('s')) {
    return Math.max(
      ZERO,
      Math.floor(Number.parseInt(value.slice(0, -1), 10) * 1000),
    );
  }
  if (value.endsWith('m')) {
    return Math.max(
      ZERO,
      Math.floor(Number.parseInt(value.slice(0, -1), 10) * 60 * 1000),
    );
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(ZERO, parsed) : ZERO;
}

function normalizeTableId(tableId, fallback = '') {
  const candidate = String(tableId || fallback).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(candidate)) {
    return fallback;
  }
  return candidate;
}

function buildBenchmarkTableDdl(tableName) {
  return (
    `CREATE TABLE IF NOT EXISTS ${tableName} (` +
    `event_id ${BENCHMARK_DDL_TEXT_TYPE} ` +
    `${BENCHMARK_DDL_NOT_NULL} ${BENCHMARK_DDL_PRIMARY_KEY}, ` +
    `payload ${BENCHMARK_DDL_BIGINT_TYPE} ` +
    `${BENCHMARK_DDL_NOT_NULL}, ` +
    `created_at ${BENCHMARK_DDL_BIGINT_TYPE} ${BENCHMARK_DDL_NOT_NULL}` +
    ')'
  );
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, '\'\'');
}

function buildBenchmarkPartitionLookupSql(tableName) {
  return (
    'SELECT partition_id FROM partitions WHERE table_name = \'' +
    escapeSqlLiteral(tableName) +
    '\''
  );
}

function buildBenchmarkTableLookupSql(tableName) {
  return (
    'SELECT * FROM tables WHERE table_name = \'' +
    escapeSqlLiteral(tableName) +
    '\''
  );
}

function buildBenchmarkPartitionLookupByTableIdSql(tableId) {
  return (
    'SELECT partition_id FROM partitions WHERE table_id = \'' +
    escapeSqlLiteral(tableId) +
    '\''
  );
}

function buildBenchmarkPartitionRepairSql(tableName, tableId) {
  return (
    'UPDATE partitions SET table_name = \'' +
    escapeSqlLiteral(tableName) +
    '\' WHERE table_id = \'' +
    escapeSqlLiteral(tableId) +
    '\''
  );
}

function buildBenchmarkTablePolicySql(tableId, benchmarkTablePolicies = {}) {
  return (
    'UPDATE tables SET table_policies = \'' +
    escapeSqlLiteral(JSON.stringify(benchmarkTablePolicies)) +
    '\' WHERE table_id = \'' +
    escapeSqlLiteral(tableId) +
    '\''
  );
}

function buildSutTableProbeSql(tableName) {
  return SUT_TABLE_PROBE_SQL_PREFIX + tableName + SUT_TABLE_PROBE_SQL_SUFFIX;
}

function firstStringField(rows, ...keys) {
  for (const row of rows) {
    for (const key of keys) {
      const value = row?.[key];
      if (typeof value === 'string' && value.length > ZERO) {
        return value;
      }
    }
  }
  return null;
}

function extractRequiredSchemaVersionFromRows(rows) {
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    for (const fieldName of REQUIRED_SCHEMA_VERSION_FIELD_CANDIDATES) {
      const normalizedVersion = normalizeRequiredSchemaVersion(row[fieldName]);
      if (normalizedVersion) {
        return {
          value: normalizedVersion,
          sourceField: fieldName,
        };
      }
    }
  }
  return {
    value: null,
    sourceField: null,
  };
}

function selectNewestSchemaVersion(currentVersion, candidateVersion) {
  const normalizedCurrent = normalizeRequiredSchemaVersion(currentVersion);
  const normalizedCandidate = normalizeRequiredSchemaVersion(candidateVersion);
  if (!normalizedCurrent) {
    return normalizedCandidate;
  }
  if (!normalizedCandidate) {
    return normalizedCurrent;
  }
  return compareSchemaVersions(normalizedCandidate, normalizedCurrent) > ZERO ?
    normalizedCandidate :
    normalizedCurrent;
}

function extractNewestSchemaVersionFromRows(rows) {
  let newestVersion = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    for (const fieldName of REQUIRED_SCHEMA_VERSION_FIELD_CANDIDATES) {
      newestVersion = selectNewestSchemaVersion(newestVersion, row[fieldName]);
    }
  }
  return newestVersion;
}

function extractUniqueSortedStringValues(rows, ...keys) {
  const values = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'string' && value.length > ZERO) {
        values.add(value);
      }
    }
  }
  return [...values].sort();
}

function buildBenchmarkMetadataWhereClause(tableName, tableId) {
  const predicates = [];
  if (typeof tableName === 'string' && tableName.length > ZERO) {
    predicates.push(
      BENCHMARK_METADATA_TABLE_NAME_FIELD +
        ' = \'' +
        escapeSqlLiteral(tableName) +
        '\'',
    );
  }
  if (typeof tableId === 'string' && tableId.length > ZERO) {
    predicates.push(
      BENCHMARK_METADATA_TABLE_ID_FIELD +
        ' = \'' +
        escapeSqlLiteral(tableId) +
        '\'',
    );
  }
  return predicates.length > ZERO ?
    predicates.join(BENCHMARK_METADATA_SQL_OR) :
    BENCHMARK_METADATA_SQL_FALSE_PREDICATE;
}

function buildBenchmarkMetadataTableRowsSql(tableName, tableId) {
  return (
    BENCHMARK_METADATA_TABLE_LOOKUP_PREFIX +
    BENCHMARK_METADATA_SQL_WHERE +
    buildBenchmarkMetadataWhereClause(tableName, tableId)
  );
}

function buildBenchmarkMetadataPartitionRowsSql(tableName, tableId) {
  return (
    BENCHMARK_METADATA_PARTITION_LOOKUP_PREFIX +
    BENCHMARK_METADATA_SQL_WHERE +
    buildBenchmarkMetadataWhereClause(tableName, tableId)
  );
}

function buildBenchmarkMetadataServiceRowsSql(partitionIds) {
  if (!Array.isArray(partitionIds) || partitionIds.length === ZERO) {
    return null;
  }
  return (
    BENCHMARK_METADATA_SERVICE_LOOKUP_PREFIX +
    partitionIds
      .map((partitionId) => '\'' + escapeSqlLiteral(partitionId) + '\'')
      .join(BENCHMARK_METADATA_SQL_IN_SEPARATOR) +
    BENCHMARK_METADATA_SERVICE_LOOKUP_SUFFIX
  );
}

async function queryBenchmarkMetadataRows(nodeClient, node, sql) {
  if (typeof sql !== 'string' || sql.length === ZERO) {
    return {
      rows: [],
      error: null,
    };
  }
  try {
    const result = await nodeClient.queryControl(
      node,
      sql,
      [],
      NODE_CLIENT_TRANSIENT_CONTEXT,
    );
    return {
      rows: rowsFromQueryResult(result),
      error: null,
    };
  } catch (error) {
    return {
      rows: [],
      error: String(error?.message || error),
    };
  }
}

function summarizeBenchmarkMetadataTableRows(rows) {
  return {
    rowCount: rows.length,
    tableIds: extractUniqueSortedStringValues(
      rows,
      BENCHMARK_METADATA_TABLE_ID_FIELD,
      'tableId',
      'id',
    ),
    schemaVersion: extractNewestSchemaVersionFromRows(rows),
  };
}

function summarizeBenchmarkMetadataPartitionRows(rows) {
  return {
    rowCount: rows.length,
    tableIds: extractUniqueSortedStringValues(
      rows,
      BENCHMARK_METADATA_TABLE_ID_FIELD,
      'tableId',
    ),
    partitionIds: extractUniqueSortedStringValues(
      rows,
      BENCHMARK_METADATA_PARTITION_ID_FIELD,
      'partitionId',
      'id',
    ),
    schemaVersion: extractNewestSchemaVersionFromRows(rows),
  };
}

function summarizeBenchmarkMetadataServiceRows(rows, expectedPartitionIds) {
  const partitionIds = new Set();
  const activePartitionIds = new Set();
  const leaderPartitionIds = new Set();
  const activeNodeIds = new Set();
  const leaderNodeIds = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const partitionId = firstStringField(
      [row],
      BENCHMARK_METADATA_PARTITION_ID_FIELD,
      'partitionId',
      'id',
    );
    if (!partitionId) {
      continue;
    }
    partitionIds.add(partitionId);
    const serviceType = String(
      firstStringField(
        [row],
        BENCHMARK_METADATA_SERVICE_TYPE_FIELD,
        'serviceType',
        'type',
      ) || '',
    ).toLowerCase();
    if (serviceType !== BENCHMARK_METADATA_SERVICE_TYPE_PARTITION) {
      continue;
    }
    const status = String(
      firstStringField([row], BENCHMARK_METADATA_STATUS_FIELD, 'status') || '',
    ).toLowerCase();
    const nodeId = firstStringField(
      [row],
      BENCHMARK_METADATA_NODE_ID_FIELD,
      'nodeId',
    );
    if (status === BENCHMARK_METADATA_STATUS_ACTIVE) {
      activePartitionIds.add(partitionId);
      if (nodeId) {
        activeNodeIds.add(nodeId);
      }
    }
    const raftRole = String(
      firstStringField([row], BENCHMARK_METADATA_RAFT_ROLE_FIELD, 'raftRole') ||
        '',
    ).toLowerCase();
    if (
      status === BENCHMARK_METADATA_STATUS_ACTIVE &&
      raftRole === BENCHMARK_METADATA_RAFT_ROLE_LEADER
    ) {
      leaderPartitionIds.add(partitionId);
      if (nodeId) {
        leaderNodeIds.add(nodeId);
      }
    }
  }
  const normalizedExpectedPartitionIds = Array.isArray(expectedPartitionIds) ?
    [...expectedPartitionIds] :
    [];
  return {
    rowCount: rows.length,
    partitionIds: [...partitionIds].sort(),
    activePartitionIds: [...activePartitionIds].sort(),
    leaderPartitionIds: [...leaderPartitionIds].sort(),
    activeNodeIds: [...activeNodeIds].sort(),
    leaderNodeIds: [...leaderNodeIds].sort(),
    missingActivePartitionIds: normalizedExpectedPartitionIds.filter(
      (partitionId) => !activePartitionIds.has(partitionId),
    ),
    missingLeaderPartitionIds: normalizedExpectedPartitionIds.filter(
      (partitionId) => !leaderPartitionIds.has(partitionId),
    ),
  };
}

function cloneDiscoveryReadinessState(source) {
  if (!source || typeof source !== 'object') {
    return null;
  }
  return {
    workloadReady: source.workloadReady === true,
    benchmarkReady: source.benchmarkReady === true,
    routingReady: source.routingReady === true,
    schemaReady: source.schemaReady === true,
    topologyReady: source.topologyReady === true,
    replicaOpsInFlight: Number.isInteger(source.replicaOpsInFlight) ?
      source.replicaOpsInFlight :
      null,
    leadershipStable: source.leadershipStable === true,
    tableName:
      typeof source.tableName === 'string' && source.tableName.length > ZERO ?
        source.tableName :
        null,
    discoveryReasons: Array.isArray(source.discoveryReasons) ?
      [...source.discoveryReasons] :
      [],
  };
}

async function collectBenchmarkMetadataSnapshot({
  nodeClient,
  node,
  tableName,
  tableId,
  requiredSchemaVersion,
  stage,
  readinessState,
  probeError,
}) {
  const tableLookup = await queryBenchmarkMetadataRows(
    nodeClient,
    node,
    buildBenchmarkMetadataTableRowsSql(tableName, tableId),
  );
  const partitionLookup = await queryBenchmarkMetadataRows(
    nodeClient,
    node,
    buildBenchmarkMetadataPartitionRowsSql(tableName, tableId),
  );
  const partitionSummary = summarizeBenchmarkMetadataPartitionRows(
    partitionLookup.rows,
  );
  const servicesSql = buildBenchmarkMetadataServiceRowsSql(
    partitionSummary.partitionIds,
  );
  const serviceLookup = servicesSql ?
    await queryBenchmarkMetadataRows(nodeClient, node, servicesSql) :
    {
      rows: [],
      error: BENCHMARK_METADATA_SERVICES_EMPTY_RESULT,
    };
  const tableSummary = summarizeBenchmarkMetadataTableRows(tableLookup.rows);
  const observedSchemaVersion = selectNewestSchemaVersion(
    tableSummary.schemaVersion,
    partitionSummary.schemaVersion,
  );
  return {
    stage: String(stage || BENCHMARK_METADATA_STAGE_READINESS_POLL),
    nodeId: String(node?.id || ''),
    capturedAt: Date.now(),
    tableName,
    tableId:
      tableId ||
      tableSummary.tableIds[ZERO] ||
      partitionSummary.tableIds[ZERO] ||
      null,
    requiredSchemaVersion: normalizeRequiredSchemaVersion(
      requiredSchemaVersion,
    ),
    observedSchemaVersion,
    readinessState: cloneDiscoveryReadinessState(readinessState),
    probeError:
      typeof probeError === 'string' && probeError.length > ZERO ?
        probeError :
        null,
    [BENCHMARK_METADATA_QUERY_ERROR_FIELD]: {
      [BENCHMARK_METADATA_QUERY_TABLES]: tableLookup.error,
      [BENCHMARK_METADATA_QUERY_PARTITIONS]: partitionLookup.error,
      [BENCHMARK_METADATA_QUERY_SERVICES]:
        serviceLookup.error === BENCHMARK_METADATA_SERVICES_EMPTY_RESULT ?
          null :
          serviceLookup.error,
    },
    tables: tableSummary,
    partitions: partitionSummary,
    services: summarizeBenchmarkMetadataServiceRows(
      serviceLookup.rows,
      partitionSummary.partitionIds,
    ),
  };
}

export const POSTGRES_BASELINE_COMPARISON_CONSTANTS_AND_IMPORTS_BUNDLE = {
  assert,
  createHash,
  mkdir,
  readFile,
  writeFile,
  Pool,
  osArch,
  osCpus,
  osHostname,
  osPlatform,
  dirname,
  join,
  ASSERTION_POLICY,
  BENCHMARK_DEFAULTS,
  CONSISTENCY_MISMATCH_KIND,
  CONSISTENCY_VERDICT,
  GATE_RESULT_MODE,
  NODE_CLIENT_CHANNEL,
  NODE_CLIENT_DEFAULT_CHANNEL_POLICIES,
  NODE_CLIENT_CONTEXT_KEYS,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  PHASE_STATUS,
  SCENARIO_PHASE,
  LoadGenerator,
  evaluateAssertionPolicy,
  collectLoadMetricHardFailures,
  ConsistencyEvaluatorV2,
  assertConsistencyFromSnapshots,
  NodeClient,
  PhaseOrchestrator,
  execShell,
  shellQuote,
  waitForPostgresReady,
  GateEngine,
  normalizeTableName,
  resolveInternalSignalThresholds,
  resolveOverloadPolicy,
  resolvePostgresBaselineBenchmarkConfig,
  resolveWritePressureThresholds,
  buildRootCauseBundle,
  collectFailureControlSnapshots,
  collectPreflightCriticalPathSnapshots,
  evaluateRootCauseInvariants,
  summarizeInvariantBreaches,
  DISCOVERY_READINESS_REASON_ADMIN_NOT_QUERYABLE,
  DISCOVERY_READINESS_REASON_ROUTING_NOT_READY,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN,
  extractAppliedSchemaVersionFromReadiness,
  normalizeRequiredSchemaVersion,
  evaluateCanonicalVersionedReadiness,
  buildCanonicalReadinessFromDiscoveryError,
  extractNodeProbeReasonsByNodeId,
  formatNodeProbeReasons,
  buildVersionLagSummary,
  buildStrictPreloadNodeReasonSummary,
  createQuietModeState,
  enterQuietMode,
  markQuietModePhase,
  exitQuietMode,
  buildQuietModeDetails,
  hasLoadLaneConfirmableLocalReadinessBlock,
  normalizeSutLoadNodeAdmissionEvidence,
  adjudicateSutLoadNodeAdmission,
  buildSutLoadNodeAdmissionDecisionTrace,
  shouldPreserveTopologyDeferredAdmission,
  shouldConfirmLocalReadinessViaLoadLane,
  ZERO,
  ONE,
  POSTGRES_ENV_USER_KEY,
  POSTGRES_ENV_PASSWORD_KEY,
  POSTGRES_ENV_DB_KEY,
  POSTGRES_ENV_AUTH_METHOD_KEY,
  POSTGRES_ENV_AUTH_METHOD_VALUE,
  BENCHMARK_CONTAINER_NAME_PREFIX,
  BENCHMARK_PRIMARY_SUFFIX,
  BENCHMARK_REPLICA_SUFFIX_PREFIX,
  LOCALHOST,
  SHELL_COMMAND,
  SHELL_LOGIN_ARG,
  STRICT_INVARIANT_GATE_IDS,
  STRICT_INVARIANT_RETRY_REASON_CODES,
  STRICT_INVARIANT_RETRY_LEADERSHIP_ERROR_CODES,
  STRICT_INVARIANT_RETRY_MAX_WINDOW_MS,
  STRICT_INVARIANT_RETRY_MIN_POLL_INTERVAL_MS,
  SYNC_STANDBY_TEMPLATE_PREFIX,
  SYNC_STANDBY_TEMPLATE_SUFFIX,
  PSQL_ON_ERROR_STOP,
  PSQL_TUPLES_ONLY,
  REPLICATION_STATE_STREAMING,
  REPLICATION_HBA_IPV4,
  REPLICATION_HBA_IPV6,
  DEFAULT_REPLICATION_PORT,
  BOOTSTRAP_DB_NAME,
  POSTGRES_ENTRYPOINT_COMMAND,
  POSTGRES_BINARY_PATH_EXPORT,
  SYNCHRONOUS_COMMIT_ON,
  BASELINE_CACHE_SCHEMA_VERSION,
  BASELINE_CACHE_DIRNAME,
  BASELINE_CACHE_FILE_EXTENSION,
  BASELINE_CACHE_HASH_ALGORITHM,
  BASELINE_CACHE_HIT_REASON,
  BASELINE_CACHE_DISABLED_REASON,
  BASELINE_CACHE_REFRESH_REASON,
  BASELINE_CACHE_MISS_REASON,
  BASELINE_CACHE_STALE_REASON,
  BASELINE_CACHE_INVALID_REASON,
  BASELINE_CACHE_STORE_REASON,
  BENCHMARK_WORKLOAD_PROFILE,
  BENCHMARK_WORKLOAD_OPERATIONS,
  SUT_TABLE_PROBE_SQL_PREFIX,
  SUT_TABLE_PROBE_SQL_SUFFIX,
  QUIESCENCE_NODE_ERROR_SEPARATOR,
  QUIESCENCE_NODE_ERROR_PREFIX,
  QUIESCENCE_IN_FLIGHT_ERROR_PREFIX,
  QUIESCENCE_IN_FLIGHT_COUNT_PREFIX,
  QUIESCENCE_READY_NODE_COUNT_PREFIX,
  QUIESCENCE_STALL_PREFIX,
  PHASE_PROGRESS_ARTIFACT_KEY,
  QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX,
  QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX,
  QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX,
  QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX,
  QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX,
  NO_PROGRESS_REASON_CODE,
  QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX,
  QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE,
  ROUTING_DISCOVERY_QUERY_ERROR_PREFIX,
  ROUTING_DISCOVERY_NO_SNAPSHOT_CANDIDATE,
  QUIESCENCE_SNAPSHOT_ERROR_SEPARATOR,
  QUIESCENCE_SNAPSHOT_ERROR_ASSIGN,
  QUIESCENCE_SNAPSHOT_ERROR_MORE_SUFFIX,
  QUIESCENCE_SNAPSHOT_ERROR_MAX_ENTRIES,
  POST_LOAD_DRAIN_STATUS_OK,
  POST_LOAD_DRAIN_STATUS_FAILED,
  POST_LOAD_DRAIN_MODE_FAILED,
  STRICT_PRELOAD_READINESS_REASON_FAILED,
  STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX,
  REQUIRED_SCHEMA_VERSION_UNAVAILABLE_REASON,
  BENCHMARK_METADATA_FLOW_SCHEMA_VERSION,
  BENCHMARK_METADATA_STAGE_CREATE_COMMITTED,
  BENCHMARK_METADATA_STAGE_CREATE_ERROR,
  BENCHMARK_METADATA_STAGE_READINESS_POLL,
  BENCHMARK_METADATA_STAGE_DISCOVERY_ERROR,
  BENCHMARK_METADATA_QUERY_TABLES,
  BENCHMARK_METADATA_QUERY_PARTITIONS,
  BENCHMARK_METADATA_QUERY_SERVICES,
  BENCHMARK_METADATA_QUERY_ERROR_FIELD,
  BENCHMARK_METADATA_SERVICES_EMPTY_RESULT,
  BENCHMARK_METADATA_SQL_FALSE_PREDICATE,
  BENCHMARK_METADATA_SQL_OR,
  BENCHMARK_METADATA_SQL_IN_SEPARATOR,
  BENCHMARK_METADATA_SQL_WHERE,
  BENCHMARK_METADATA_TABLE_LOOKUP_PREFIX,
  BENCHMARK_METADATA_PARTITION_LOOKUP_PREFIX,
  BENCHMARK_METADATA_SERVICE_LOOKUP_PREFIX,
  BENCHMARK_METADATA_SERVICE_LOOKUP_SUFFIX,
  BENCHMARK_METADATA_TABLE_NAME_FIELD,
  BENCHMARK_METADATA_TABLE_ID_FIELD,
  BENCHMARK_METADATA_PARTITION_ID_FIELD,
  BENCHMARK_METADATA_NODE_ID_FIELD,
  BENCHMARK_METADATA_STATUS_FIELD,
  BENCHMARK_METADATA_SERVICE_TYPE_FIELD,
  BENCHMARK_METADATA_RAFT_ROLE_FIELD,
  BENCHMARK_METADATA_SERVICE_TYPE_PARTITION,
  BENCHMARK_METADATA_STATUS_ACTIVE,
  BENCHMARK_METADATA_RAFT_ROLE_LEADER,
  REQUIRED_SCHEMA_VERSION_FIELD_CANDIDATES,
  QUIESCENCE_DEFAULT_STABLE_WINDOW_MS,
  BASELINE_LOAD_NODE_PREFIX,
  BENCHMARK_EVENT_TABLE_FALLBACK,
  LOAD_PARITY_STATUS_MATCHED,
  LOAD_PARITY_STATUS_MISMATCHED,
  LOAD_PARITY_REASON_LOAD_FANOUT_MISMATCH,
  LOAD_PARITY_REASON_PER_NODE_BUDGET_MISMATCH,
  LOAD_PARITY_REASON_TABLE_NAME_MISMATCH,
  STRICT_PARITY_REASON_MISMATCH,
  ADMISSION_CONFLICT_LOAD_NODE_MAX_IN_FLIGHT,
  DIAGNOSTICS_COVERAGE_STATUS_AVAILABLE,
  DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE,
  DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED,
  DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE,
  DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER,
  DIAGNOSTICS_SAMPLE_KEY_SQLITE,
  LOAD_METRIC_UNDISPATCHED_REASON_CAPACITY,
  LOAD_METRIC_UNDISPATCHED_REASON_DURATION_TIMEOUT,
  LOAD_METRIC_UNDISPATCHED_REASON_CANCELLED,
  LOAD_METRIC_REJECTED_REASON_QUEUE_FULL,
  BENCHMARK_PRELOAD_MAX_REPLICA_OPS_IN_FLIGHT_DEFAULT,
  PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD,
  PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_MIN_SETTLE_TIMEOUT_MS,
  PREFLIGHT_CONVERGENCE_FORCE_REPAIR_AFTER_MS,
  PREFLIGHT_CONVERGENCE_ALLOWED_VOTER_SKEW,
  PRELOAD_QUIESCENCE_LARGE_CLUSTER_MAX_REPLICA_OPS_IN_FLIGHT,
  PRELOAD_QUIESCENCE_LARGE_CLUSTER_STABLE_WINDOW_MS,
  BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT,
  BENCHMARK_LOAD_REBALANCE_MONITOR_POLL_INTERVAL_MS_DEFAULT,
  BENCHMARK_CRITICAL_REBALANCING_SUSTAINED_SAMPLES_DEFAULT,
  LOAD_PROGRESS_HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_FRESHNESS_SCHEMA_VERSION,
  HEARTBEAT_FRESHNESS_STATUS_OK,
  HEARTBEAT_FRESHNESS_STATUS_FAILED,
  HEARTBEAT_FRESHNESS_STATUS_UNAVAILABLE,
  HEARTBEAT_FRESHNESS_MAX_STALL_MS_DEFAULT,
  HEARTBEAT_FRESHNESS_LARGE_CLUSTER_MAX_STALL_MS,
  HEARTBEAT_FRESHNESS_MIN_SAMPLES_DEFAULT,
  HEARTBEAT_FRESHNESS_INVARIANT_FAILED_REASON,
  REBALANCING_PRESSURE_SCHEMA_VERSION,
  REBALANCING_CRITICAL_STATE_SCHEMA_VERSION,
  LOAD_ROUTING_ADMISSION_SCHEMA_VERSION,
  LOAD_ROUTING_ADMISSION_MAX_PROBE_ERRORS,
  LOAD_ROUTING_ADMISSION_MAX_TRANSITIONS,
  LOAD_ROUTING_ADMISSION_ERROR_CODE,
  LOAD_ROUTING_ADMISSION_ERROR_MESSAGE_PREFIX,
  LOAD_ROUTING_ADMISSION_REASON_PROBE_ERROR_PREFIX,
  LOAD_ROUTING_ADMISSION_REASON_SEPARATOR,
  LOAD_ROUTING_ADMISSION_SOURCE_DISCOVERY,
  LOAD_ROUTING_ADMISSION_SOURCE_PROBE_ERROR,
  LOAD_ROUTING_ADMISSION_SOURCE_PROBE_ERROR_GRACE,
  REBALANCING_WINDOW_PINNING_VIOLATION_REASON,
  REBALANCING_PINNING_REASON_IN_FLIGHT_REPLICA_OPS,
  REBALANCING_PINNING_REASON_LEADERSHIP_CHURN,
  CDC_TELEMETRY_SCHEMA_VERSION,
  CDC_TELEMETRY_SCHEMA_MISSING_REASON,
  CDC_TELEMETRY_MODE_STEADY,
  CDC_TELEMETRY_MODE_CATCHUP,
  CDC_TELEMETRY_NODE_FIELD_SUBSCRIBER_COUNT,
  CDC_TELEMETRY_NODE_FIELD_BUFFERED_EVENTS,
  CDC_TELEMETRY_NODE_FIELD_CATCHUP_LAG_EVENTS,
  CDC_TELEMETRY_NODE_FIELD_CATCHUP_THROUGHPUT_EVENTS_PER_SEC,
  CDC_TELEMETRY_NODE_FIELD_MODE,
  CDC_TELEMETRY_NODE_FIELD_AUTHORITATIVE_FALLBACK,
  CDC_TELEMETRY_FALLBACK_PHASE_BOOTSTRAP,
  CDC_TELEMETRY_FALLBACK_PHASE_RECOVERY,
  CDC_TELEMETRY_FALLBACK_PHASE_STEADY_STATE,
  AUTHORITATIVE_FALLBACK_POLICY_SCHEMA_VERSION,
  AUTHORITATIVE_FALLBACK_THRESHOLD_EXCEEDED_REASON,
  CDC_TELEMETRY_REQUIRED_FIELDS,
  INTERNAL_SIGNAL_CLASS_OPERATION_FAILED,
  INTERNAL_SIGNAL_CLASS_CDC_SAFE_FALLBACK,
  INTERNAL_SIGNAL_CLASS_CDC_BUFFERED_WITHOUT_SUBSCRIBER,
  INTERNAL_SIGNAL_CLASS_CRITICAL_REBALANCING_STATE,
  INTERNAL_SIGNAL_CLASSES,
  INTERNAL_SIGNAL_SEVERITY_ERRORS_BY_CLASS,
  INTERNAL_SIGNAL_THRESHOLD_BREACH_REASON,
  INTERNAL_SIGNAL_PATTERN_OPERATION_FAILED,
  INTERNAL_SIGNAL_PATTERN_CDC_SAFE_FALLBACK,
  INTERNAL_SIGNAL_PATTERN_CDC_BUFFERED_WITHOUT_SUBSCRIBER,
  INTERNAL_SIGNAL_PATTERN_CRITICAL_REBALANCING_STATE,
  BENCHMARK_DDL_BIGINT_TYPE,
  BENCHMARK_DDL_TEXT_TYPE,
  BENCHMARK_DDL_NOT_NULL,
  BENCHMARK_DDL_PRIMARY_KEY,
  BENCHMARK_POOL_IDLE_TIMEOUT_MS,
  BENCHMARK_POOL_CONNECTION_TIMEOUT_MS,
  PHASE_REASON_SUMMARY_MAX_ENTRIES,
  STARTUP_DECISION_SCHEMA_VERSION,
  FAILURE_ARTIFACT_SCHEMA_VERSION,
  SATURATION_SCHEMA_VERSION,
  BASELINE_STATUS_SKIPPED,
  BASELINE_SKIP_REASON_SUT_HARD_LOAD_FAILURE,
  READINESS_TIMELINE_EVENT_POLL_SNAPSHOT,
  READINESS_TIMELINE_EVENT_REASON_TRANSITION,
  SATURATION_PATTERN_CDC_FORWARD_TIMEOUT,
  SATURATION_PATTERN_SYSTEM_TABLE_QUERY_TIMEOUT,
  QUIET_MODE_REASON_STRICT_BENCHMARK_MODE,
  QUIET_MODE_REASON_RUN_FINALIZE,
  QUIET_MODE_ACTIVE_PHASES,
  PHASE_CLASS_STARTUP,
  PHASE_CLASS_DISCOVERY,
  PHASE_CLASS_TOPOLOGY,
  PHASE_CLASS_LOAD,
  PHASE_CLASS_VERIFY,
  PHASE_CLASS_TEARDOWN,
  PHASE_CLASS_UNKNOWN,
  REASON_CLASS_STARTUP,
  REASON_CLASS_DISCOVERY,
  REASON_CLASS_TOPOLOGY,
  REASON_CLASS_LOAD,
  REASON_CLASS_VERIFY,
  REASON_CLASS_UNKNOWN,
  STRICT_PRELOAD_NODE_REASON_ENTRY_SEPARATOR,
  STRICT_PRELOAD_NODE_REASON_VALUE_SEPARATOR,
  DISCOVERY_FIELD_SERVICES,
  DISCOVERY_SERVICE_FIELD_PROTOCOL,
  DISCOVERY_SERVICE_FIELD_SERVICE_IDS,
  DISCOVERY_SERVICE_FIELD_REPLICAS,
  DISCOVERY_REPLICA_FIELD_NODE_ID,
  DISCOVERY_REPLICA_FIELD_READINESS,
  DISCOVERY_REPLICA_FIELD_BENCHMARK_ADMISSION,
  DISCOVERY_READINESS_FIELD_WORKLOAD_READY,
  DISCOVERY_READINESS_FIELD_BENCHMARK_READY,
  DISCOVERY_READINESS_FIELD_ROUTING_READY,
  DISCOVERY_READINESS_FIELD_SCHEMA_READY,
  DISCOVERY_READINESS_FIELD_TOPOLOGY_READY,
  DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT,
  DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE,
  DISCOVERY_READINESS_FIELD_TABLE_NAME,
  DISCOVERY_READINESS_FIELD_REASONS,
  DISCOVERY_READINESS_REASON_FIELD_CODE,
  DISCOVERY_READINESS_REASON_FIELD_DETAIL,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_STATE,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_REASONS,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_TABLE_NAME,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_ROUTING_READY,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_SCHEMA_READY,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_TOPOLOGY_READY,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_LOCAL_REPLICA_ROLE,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_DEGRADED_OPERATION_IDS,
  DISCOVERY_BENCHMARK_ADMISSION_STATE_READY,
  DISCOVERY_BENCHMARK_ADMISSION_STATE_BLOCKED,
  DISCOVERY_ADMISSION_SOURCE,
  DISCOVERY_READINESS_REASON_BENCHMARK_NOT_READY,
  DISCOVERY_READINESS_REASON_READINESS_MISSING,
  DISCOVERY_READINESS_REASON_WORKLOAD_NOT_READY,
  DISCOVERY_READINESS_REASON_SCHEMA_NOT_READY,
  DISCOVERY_READINESS_REASON_STATE_CONTRADICTION,
  DISCOVERY_READINESS_REASON_NOT_SELECTED_BY_DISCOVERY,
  STRICT_DOMINANT_REASON_PRECEDENCE,
  DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID,
  DISCOVERY_DIAGNOSTIC_PREFIX_PROBES,
  DISCOVERY_PROBE_REASON_ADMIN_NOT_READY,
  DISCOVERY_PROBE_REASON_LOAD_PROBE_FAILED,
  DISCOVERY_NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN,
  DISCOVERY_PROBE_REASON_REACHABLE_BY_PREFIX,
  DISCOVERY_PROBE_REASON_LAST_ERROR_PREFIX,
  DISCOVERY_PROBE_REASON_PROBE_ERROR_PREFIX,
  DISCOVERY_PROBE_REASON_SELF_DISCOVERY_PREFIX,
  DISCOVERY_SOURCE_STATUS_DISCOVERED,
  DISCOVERY_SOURCE_STATUS_EMPTY,
  DISCOVERY_SOURCE_STATUS_ERROR,
  DISCOVERY_SOURCE_SCOPE_TABLE_NAME_AND_ID,
  DISCOVERY_SOURCE_SCOPE_TABLE_NAME_ONLY,
  DISCOVERY_SOURCE_SCOPE_UNSCOPED,
  DISCOVERY_UNKNOWN_NODE_ID,
  ADMIN_QUERY_TRACE_CAPTURE_MAX_NODES,
  ADMIN_QUERY_TRACE_CAPTURE_MAX_PER_NODE,
  DISCOVERY_ERROR_MESSAGE_MAX_CHARS,
  DISCOVERY_ERROR_CAUSE_CHAIN_MAX_DEPTH,
  DISCOVERY_ERROR_CHAIN_SEPARATOR,
  DISCOVERY_ERROR_NODE_CLIENT_CONTEXT_PREFIX,
  DISCOVERY_ERROR_NODE_CLIENT_CONTEXT_SUFFIX,
  DISCOVERY_GATE_STATUS_PASSED,
  DISCOVERY_GATE_STATUS_FAILED,
  DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES,
  DISCOVERY_SELECTION_POSTGRES_WIRE,
  DISCOVERY_STALLED_ATTEMPT_THRESHOLD,
  DEFAULT_PROBE_TIMEOUT_MS,
  DISCOVERY_DIAGNOSTICS_FIELD_EXCLUDED_READINESS_BY_NODE_ID,
  DISCOVERY_DIAGNOSTICS_FIELD_EXCLUSION_REASON_COUNTS_BY_NODE,
  DISCOVERY_DIAGNOSTICS_FIELD_NODE_ADMISSION_TRACE_BY_NODE_ID,
  DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUDED_NODES,
  DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUSION_COUNTS,
  DISCOVERY_DIAGNOSTIC_PREFIX_ADMISSION_STATES,
  DISCOVERY_DIAGNOSTIC_REASON_COUNT_SEPARATOR,
  DISCOVERY_DIAGNOSTIC_NODE_REASON_SEPARATOR,
  LOAD_BREAKER_OWNER_NODE_CLIENT,
  NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME,
  NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID,
  SYSTEM_TABLE_READ_PATH_MODE_CANONICAL,
  QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX,
  QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_PREFIX,
  QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_SEPARATOR,
  OVERLOAD_POLICY_VIOLATION_REASON,
  WRITE_PRESSURE_SCHEMA_VERSION,
  WRITE_PRESSURE_THRESHOLD_EXCEEDED_REASON,
  NODE_CLIENT_TRANSIENT_CONTEXT,
  NODE_CLIENT_MUTATING_CONTEXT,
  FAILURE_NODE_ID_PATTERN,
  ROOT_CAUSE_SNAPSHOT_KIND_PREFLIGHT_CRITICAL_PATH,
  ROOT_CAUSE_SNAPSHOT_KIND_CONTROL_SNAPSHOT,
  SNAPSHOT_WARNING_PREFIX,
  SNAPSHOT_REFRESH_WARNING_PREFIX,
  SNAPSHOT_REFRESH_WARNING_UNRESOLVED,
  SNAPSHOT_REFRESH_WARNING_SKIPPED,
  BENCHMARK_TABLE_CREATE_TIMEOUT_HEADROOM_MS,
  BENCHMARK_TABLE_CREATE_CONTROL_TIMEOUT_MS,
  BENCHMARK_TABLE_CREATE_LARGE_CLUSTER_RETRY_TIMEOUT_MS,
  BENCHMARK_TABLE_CREATE_OUTCOME_SUCCEEDED,
  BENCHMARK_TABLE_CREATE_OUTCOME_FAILED,
  buildBenchmarkTableCreateNodeClientContext,
  sleep,
  DEFAULT_SCENARIO_TIMING,
  resolveScenarioTiming,
  parseDurationToMs,
  normalizeTableId,
  buildBenchmarkTableDdl,
  escapeSqlLiteral,
  buildBenchmarkPartitionLookupSql,
  buildBenchmarkTableLookupSql,
  buildBenchmarkPartitionLookupByTableIdSql,
  buildBenchmarkPartitionRepairSql,
  buildBenchmarkTablePolicySql,
  buildSutTableProbeSql,
  firstStringField,
  extractRequiredSchemaVersionFromRows,
  selectNewestSchemaVersion,
  extractNewestSchemaVersionFromRows,
  extractUniqueSortedStringValues,
  buildBenchmarkMetadataWhereClause,
  buildBenchmarkMetadataTableRowsSql,
  buildBenchmarkMetadataPartitionRowsSql,
  buildBenchmarkMetadataServiceRowsSql,
  rowsFromQueryResult,
  queryBenchmarkMetadataRows,
  summarizeBenchmarkMetadataTableRows,
  summarizeBenchmarkMetadataPartitionRows,
  summarizeBenchmarkMetadataServiceRows,
  cloneDiscoveryReadinessState,
  collectBenchmarkMetadataSnapshot,
};
