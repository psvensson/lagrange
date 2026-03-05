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
  NODE_CLIENT_CONTEXT_KEYS,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  PHASE_STATUS,
  SCENARIO_PHASE,
} from '../harness/constants.js';
import {LoadGenerator} from '../harness/load-generator.js';
import {evaluateAssertionPolicy} from '../harness/assertion-policy.js';
import {ConsistencyEvaluatorV2} from '../harness/consistency-evaluator.js';
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
} from './postgres-baseline-diagnostics.js';
import {
  createQuietModeState,
  enterQuietMode,
  markQuietModePhase,
  exitQuietMode,
  buildQuietModeDetails,
} from './postgres-baseline-quiet-mode.js';

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
const BENCHMARK_WORKLOAD_OPERATIONS = Object.freeze([
  'INSERT',
  'SELECT',
]);
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
const QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX =
  'in_flight_query_error:';
const QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX = 'node_probe_error:';
const QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX =
  'leadership_unstable:';
const QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX =
  'stalled_no_progress:';
const NO_PROGRESS_REASON_CODE = 'stalled_no_progress';
const QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX =
  'control_snapshot_query_error:';
const QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE =
  QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX + 'no_snapshot_candidates';
const ROUTING_DISCOVERY_QUERY_ERROR_PREFIX =
  'service_discovery_query_error:';
const ROUTING_DISCOVERY_NO_SNAPSHOT_CANDIDATE =
  ROUTING_DISCOVERY_QUERY_ERROR_PREFIX + 'no_snapshot_candidates';
const QUIESCENCE_SNAPSHOT_ERROR_SEPARATOR = '|';
const QUIESCENCE_SNAPSHOT_ERROR_ASSIGN = '=';
const QUIESCENCE_SNAPSHOT_ERROR_MORE_SUFFIX = '_more';
const QUIESCENCE_SNAPSHOT_ERROR_MAX_ENTRIES = 3;
const POST_LOAD_DRAIN_STATUS_OK = 'ok';
const POST_LOAD_DRAIN_STATUS_FAILED = 'failed';
const POST_LOAD_DRAIN_MODE_FAILED = 'failed';
const STRICT_PRELOAD_READINESS_REASON_FAILED = 'strict_preload_readiness_failed';
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
const BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT = 2;
const BENCHMARK_LOAD_REBALANCE_MONITOR_POLL_INTERVAL_MS_DEFAULT = 250;
const BENCHMARK_CRITICAL_REBALANCING_SUSTAINED_SAMPLES_DEFAULT = 3;
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
const INTERNAL_SIGNAL_THRESHOLD_BREACH_REASON = 'internal_signal_threshold_breach';
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
const DISCOVERY_PROBE_REASON_REACHABLE_BY_PREFIX = 'reachable_by=';
const DISCOVERY_PROBE_REASON_LAST_ERROR_PREFIX = 'last_error=';
const DISCOVERY_PROBE_REASON_PROBE_ERROR_PREFIX = 'probe_error=';
const DISCOVERY_PROBE_REASON_SELF_DISCOVERY_PREFIX = 'self_discovery=';
const DISCOVERY_SOURCE_STATUS_DISCOVERED = 'discovered';
const DISCOVERY_SOURCE_STATUS_EMPTY = 'empty';
const DISCOVERY_SOURCE_STATUS_ERROR = 'error';
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
const DISCOVERY_DIAGNOSTICS_FIELD_EXCLUDED_READINESS_BY_NODE_ID =
  'excludedReadinessByNodeId';
const DISCOVERY_DIAGNOSTICS_FIELD_EXCLUSION_REASON_COUNTS_BY_NODE =
  'exclusionReasonCountsByNode';
const DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUDED_NODES = 'excludedNodes=';
const DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUSION_COUNTS =
  'excludedReasonCounts=';
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
  'snapshot_refresh_unresolved_partition_set_mismatch';
const SNAPSHOT_REFRESH_WARNING_SKIPPED =
  'snapshot_refresh_partition_set_mismatch_without_targets';
const BENCHMARK_TABLE_CREATE_TIMEOUT_HEADROOM_MS = 5000;
const BENCHMARK_TABLE_CREATE_CONTROL_TIMEOUT_MS =
  QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS +
  BENCHMARK_TABLE_CREATE_TIMEOUT_HEADROOM_MS;
const BENCHMARK_TABLE_CREATE_OUTCOME_SUCCEEDED = 'succeeded';
const BENCHMARK_TABLE_CREATE_OUTCOME_FAILED = 'failed';
const BENCHMARK_TABLE_CREATE_TIMEOUT_MESSAGE_FRAGMENT = 'timeout';

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
  const value = String(duration || '').trim().toLowerCase();
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
  return `CREATE TABLE IF NOT EXISTS ${tableName} (` +
    `event_id ${BENCHMARK_DDL_TEXT_TYPE} ` +
    `${BENCHMARK_DDL_NOT_NULL} ${BENCHMARK_DDL_PRIMARY_KEY}, ` +
    `payload ${BENCHMARK_DDL_BIGINT_TYPE} ` +
    `${BENCHMARK_DDL_NOT_NULL}, ` +
    `created_at ${BENCHMARK_DDL_BIGINT_TYPE} ${BENCHMARK_DDL_NOT_NULL}` +
    ')';
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, '\'\'');
}

function buildBenchmarkPartitionLookupSql(tableName) {
  return 'SELECT partition_id FROM partitions WHERE table_name = \'' +
    escapeSqlLiteral(tableName) +
    '\'';
}

function buildBenchmarkTableLookupSql(tableName) {
  return 'SELECT * FROM tables WHERE table_name = \'' +
    escapeSqlLiteral(tableName) +
    '\'';
}

function buildBenchmarkPartitionLookupByTableIdSql(tableId) {
  return 'SELECT partition_id FROM partitions WHERE table_id = \'' +
    escapeSqlLiteral(tableId) +
    '\'';
}

function buildBenchmarkPartitionRepairSql(tableName, tableId) {
  return 'UPDATE partitions SET table_name = \'' +
    escapeSqlLiteral(tableName) +
    '\' WHERE table_id = \'' +
    escapeSqlLiteral(tableId) +
    '\'';
}

function buildBenchmarkTablePolicySql(tableId, benchmarkTablePolicies = {}) {
  return 'UPDATE tables SET table_policies = \'' +
    escapeSqlLiteral(JSON.stringify(benchmarkTablePolicies)) +
    '\' WHERE table_id = \'' +
    escapeSqlLiteral(tableId) +
    '\'';
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
      newestVersion = selectNewestSchemaVersion(
        newestVersion,
        row[fieldName],
      );
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
  return BENCHMARK_METADATA_TABLE_LOOKUP_PREFIX +
    BENCHMARK_METADATA_SQL_WHERE +
    buildBenchmarkMetadataWhereClause(tableName, tableId);
}

function buildBenchmarkMetadataPartitionRowsSql(tableName, tableId) {
  return BENCHMARK_METADATA_PARTITION_LOOKUP_PREFIX +
    BENCHMARK_METADATA_SQL_WHERE +
    buildBenchmarkMetadataWhereClause(tableName, tableId);
}

function buildBenchmarkMetadataServiceRowsSql(partitionIds) {
  if (!Array.isArray(partitionIds) || partitionIds.length === ZERO) {
    return null;
  }
  return BENCHMARK_METADATA_SERVICE_LOOKUP_PREFIX +
    partitionIds.map((partitionId) =>
      '\'' + escapeSqlLiteral(partitionId) + '\'',
    ).join(BENCHMARK_METADATA_SQL_IN_SEPARATOR) +
    BENCHMARK_METADATA_SERVICE_LOOKUP_SUFFIX;
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
    const serviceType = String(firstStringField(
      [row],
      BENCHMARK_METADATA_SERVICE_TYPE_FIELD,
      'serviceType',
      'type',
    ) || '').toLowerCase();
    if (serviceType !== BENCHMARK_METADATA_SERVICE_TYPE_PARTITION) {
      continue;
    }
    const status = String(firstStringField(
      [row],
      BENCHMARK_METADATA_STATUS_FIELD,
      'status',
    ) || '').toLowerCase();
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
    const raftRole = String(firstStringField(
      [row],
      BENCHMARK_METADATA_RAFT_ROLE_FIELD,
      'raftRole',
    ) || '').toLowerCase();
    if (status === BENCHMARK_METADATA_STATUS_ACTIVE &&
        raftRole === BENCHMARK_METADATA_RAFT_ROLE_LEADER) {
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
    replicaOpsInFlight:
      Number.isInteger(source.replicaOpsInFlight) ?
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
    requiredSchemaVersion:
      normalizeRequiredSchemaVersion(requiredSchemaVersion),
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

function buildBenchmarkMetadataFlow(state, tableName) {
  return {
    schemaVersion: BENCHMARK_METADATA_FLOW_SCHEMA_VERSION,
    tableName,
    tableId: state.requiredSchemaTableId,
    requiredSchemaVersion: state.requiredSchemaVersion,
    createCommitted: state.benchmarkMetadataFlow.createCommitted,
    createAttempt: state.benchmarkMetadataFlow.createAttempt,
    nodeSnapshots: {
      ...state.benchmarkMetadataFlow.nodeSnapshots,
    },
  };
}

function normalizePositiveIntegerOrNull(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalizedValue = Math.floor(value);
  if (normalizedValue <= ZERO) {
    return null;
  }
  return normalizedValue;
}

function isBenchmarkTableCreateTimeoutError(error) {
  if (typeof error?.timeoutClass === 'string' &&
      error.timeoutClass.toLowerCase() === 'timeout') {
    return true;
  }
  const message = String(error?.message || error || '')
    .toLowerCase();
  return message.includes(BENCHMARK_TABLE_CREATE_TIMEOUT_MESSAGE_FRAGMENT) ||
    message.includes('timed out') ||
    message.includes('deadline exceeded');
}

function createBenchmarkTableCreateAttempt(tableName, writeNodeId, context = {}) {
  const outerTimeoutMs = normalizePositiveIntegerOrNull(context.timeoutMs);
  const innerTimeoutMs = normalizePositiveIntegerOrNull(context.innerTimeoutMs);
  return {
    tableName,
    writeNodeId: String(writeNodeId || ''),
    outerTimeoutMs,
    innerTimeoutMs,
    timeoutBudgetMismatch:
      Number.isInteger(outerTimeoutMs) &&
      Number.isInteger(innerTimeoutMs) &&
      outerTimeoutMs !== innerTimeoutMs,
    outcome: null,
    isTimeout: false,
    error: null,
    errorCode: null,
    timeoutClass: null,
    timeoutClassification: null,
    startedAt: Date.now(),
    completedAt: null,
    durationMs: null,
    metadataSnapshot: null,
  };
}

function finalizeBenchmarkTableCreateAttempt(
  createAttempt,
  outcome,
  error = null,
) {
  const completedAt = Date.now();
  return {
    ...createAttempt,
    outcome,
    isTimeout: error ? isBenchmarkTableCreateTimeoutError(error) : false,
    error: error ? String(error?.message || error) : null,
    errorCode: typeof error?.code === 'string' ? error.code : null,
    timeoutClass:
      typeof error?.timeoutClass === 'string' ? error.timeoutClass : null,
    timeoutClassification:
      error?.timeoutClassification &&
        typeof error.timeoutClassification === 'object' ?
        error.timeoutClassification :
        null,
    completedAt,
    durationMs: Math.max(
      ZERO,
      completedAt - Number(createAttempt?.startedAt || completedAt),
    ),
  };
}

function attachBenchmarkTableCreateAttempt(error, createAttempt) {
  const normalizedError = error instanceof Error ?
    error :
    new Error(String(error || 'benchmark_table_create_failed'));
  normalizedError.benchmarkTableCreateAttempt = createAttempt;
  return normalizedError;
}

function resolveBenchmarkTableCreateAttempt(error) {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const createAttempt = error.benchmarkTableCreateAttempt;
  if (!createAttempt || typeof createAttempt !== 'object') {
    return null;
  }
  return createAttempt;
}

function resolveSystemTableReadPath(seedNode, candidateNodes) {
  const fallbackNodes = resolveControlSnapshotCandidates(seedNode, candidateNodes);
  return {
    mode: SYSTEM_TABLE_READ_PATH_MODE_CANONICAL,
    nodes: fallbackNodes,
  };
}

async function queryControlWithNodeFallback(
  nodeClient,
  nodes,
  sql,
  params = [],
  context = NODE_CLIENT_TRANSIENT_CONTEXT,
) {
  const candidates = Array.isArray(nodes) ?
    nodes.filter((node) => node && typeof node.id === 'string') :
    [];
  if (candidates.length === ZERO) {
    throw new Error('no_system_table_read_nodes_available');
  }

  const errors = [];
  for (const node of candidates) {
    try {
      const result = await nodeClient.queryControl(node, sql, params, context);
      return {
        result,
        nodeId: node.id,
      };
    } catch (error) {
      errors.push({
        nodeId: String(node?.id || 'unknown'),
        error: String(error?.message || error),
      });
    }
  }

  const errorSummary = errors
    .map((entry) => entry.nodeId + '=' + entry.error)
    .join('|');
  const aggregateError = new Error(
    'all_system_table_read_nodes_failed:' + errorSummary,
  );
  aggregateError.readPathErrors = errors;
  throw aggregateError;
}

function resolveCanonicalSystemTableWriteNode(nodes) {
  const candidates = Array.isArray(nodes) ?
    nodes.filter((node) => node && typeof node.id === 'string') :
    [];
  if (candidates.length === ZERO) {
    throw new Error('no_system_table_read_nodes_available');
  }
  return candidates[ZERO];
}

async function queryControlOnCanonicalSystemTableWriteNode(
  nodeClient,
  nodes,
  sql,
  params = [],
  context = NODE_CLIENT_TRANSIENT_CONTEXT,
) {
  const canonicalNode = resolveCanonicalSystemTableWriteNode(nodes);
  const result = await nodeClient.queryControl(
    canonicalNode,
    sql,
    params,
    context,
  );
  return {
    result,
    nodeId: canonicalNode.id,
  };
}

async function querySutTableMetadata(nodeClient, systemTableReadNodes, tableName) {
  const lookup = await queryControlWithNodeFallback(
    nodeClient,
    systemTableReadNodes,
    buildBenchmarkTableLookupSql(tableName),
  );
  const result = lookup.result;
  const rows = rowsFromQueryResult(result);
  const tableId = firstStringField(rows, 'table_id', 'tableId');
  const requiredSchemaVersion = extractRequiredSchemaVersionFromRows(rows);
  return {
    tableId,
    requiredSchemaVersion: requiredSchemaVersion.value,
    requiredSchemaVersionSourceField: requiredSchemaVersion.sourceField,
    metadataNodeId: lookup.nodeId,
  };
}

async function querySutTableId(nodeClient, systemTableReadNodes, tableName) {
  const tableMetadata = await querySutTableMetadata(
    nodeClient,
    systemTableReadNodes,
    tableName,
  );
  return tableMetadata.tableId;
}

function resolveScenarioOverrides(cluster) {
  const overrides = cluster?._scenarioOverrides?.postgresBaselineComparison;
  const createPostgresPool =
    typeof overrides?.createPostgresPool === 'function' ?
      overrides.createPostgresPool :
      (options) => new Pool(options);
  const createLoadGenerator =
    typeof overrides?.createLoadGenerator === 'function' ?
      overrides.createLoadGenerator :
      (nodes, options) => new LoadGenerator(nodes, options);
  const getCdcTelemetryByNode =
    typeof overrides?.getCdcTelemetryByNode === 'function' ?
      overrides.getCdcTelemetryByNode :
      null;
  return {
    createPostgresPool,
    createLoadGenerator,
    getCdcTelemetryByNode,
    timing: resolveScenarioTiming(overrides?.timing),
  };
}

function resolveNodeClientChannelPolicyOverrides(cluster) {
  const channelPolicies = cluster?._config?.nodeClient?.channelPolicies;
  if (!channelPolicies || typeof channelPolicies !== 'object') {
    return null;
  }
  return channelPolicies;
}

async function ensureSutBenchmarkTable(
  nodeClient,
  systemTableReadNodes,
  tableName,
  benchmarkConfig,
  benchmarkTablePolicies,
) {
  const createTableContext =
    buildBenchmarkTableCreateNodeClientContext(benchmarkConfig);
  const canonicalWriteNode =
    resolveCanonicalSystemTableWriteNode(systemTableReadNodes);
  let createAttempt = createBenchmarkTableCreateAttempt(
    tableName,
    canonicalWriteNode.id,
    createTableContext,
  );
  let createResult;
  try {
    await nodeClient.queryControl(
      canonicalWriteNode,
      buildBenchmarkTableDdl(tableName),
      [],
      createTableContext,
    );
    createAttempt = finalizeBenchmarkTableCreateAttempt(
      createAttempt,
      BENCHMARK_TABLE_CREATE_OUTCOME_SUCCEEDED,
      null,
    );
    createResult = {
      nodeId: canonicalWriteNode.id,
    };
  } catch (error) {
    const metadataSnapshot = await collectBenchmarkMetadataSnapshot({
      nodeClient,
      node: canonicalWriteNode,
      tableName,
      tableId: null,
      requiredSchemaVersion: null,
      stage: BENCHMARK_METADATA_STAGE_CREATE_ERROR,
      readinessState: null,
      probeError: String(error?.message || error),
    });
    createAttempt = {
      ...finalizeBenchmarkTableCreateAttempt(
        createAttempt,
        BENCHMARK_TABLE_CREATE_OUTCOME_FAILED,
        error,
      ),
      metadataSnapshot,
    };
    throw attachBenchmarkTableCreateAttempt(error, createAttempt);
  }

  try {
    const tableMetadata = await querySutTableMetadata(
      nodeClient,
      systemTableReadNodes,
      tableName,
    );
    const tableId = tableMetadata.tableId;
    if (!tableId) {
      return {
        ...tableMetadata,
        writeNodeId: createResult.nodeId,
        createAttempt,
      };
    }
    const policyResult = await queryControlOnCanonicalSystemTableWriteNode(
      nodeClient,
      systemTableReadNodes,
      buildBenchmarkTablePolicySql(tableId, benchmarkTablePolicies),
      [],
      NODE_CLIENT_MUTATING_CONTEXT,
    );
    const repairResult = await queryControlOnCanonicalSystemTableWriteNode(
      nodeClient,
      systemTableReadNodes,
      buildBenchmarkPartitionRepairSql(tableName, tableId),
      [],
      NODE_CLIENT_MUTATING_CONTEXT,
    );
    return {
      ...tableMetadata,
      writeNodeId: createResult.nodeId,
      policyNodeId: policyResult.nodeId,
      repairNodeId: repairResult.nodeId,
      createAttempt,
    };
  } catch (error) {
    throw attachBenchmarkTableCreateAttempt(error, createAttempt);
  }
}

async function ensurePostgresBenchmarkTable(pool, tableName) {
  await pool.query(buildBenchmarkTableDdl(tableName));
}

function isRetriableTableReadyError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (!message) {
    return false;
  }
  return message.includes('no partitions available for table') ||
    message.includes('table') && message.includes('not found') ||
    message.includes('connect econnrefused') ||
    message.includes('timed out');
}

function rowsFromQueryResult(result) {
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

async function waitForSutBenchmarkTableReady(
  nodeClient,
  systemTableReadNodes,
  tableName,
  options = {},
) {
  const timing = resolveScenarioTiming(options.timing);
  const timeoutMs = Number.isInteger(options.timeoutMs) ?
    options.timeoutMs :
    BENCHMARK_DEFAULTS.readyTimeoutMs;
  const pollIntervalMs = Number.isInteger(options.pollIntervalMs) ?
    options.pollIntervalMs :
    BENCHMARK_DEFAULTS.readyPollIntervalMs;
  const deadline = timing.now() + timeoutMs;
  let lastError = null;

  while (timing.now() < deadline) {
    try {
      const tableNameLookup = await queryControlWithNodeFallback(
        nodeClient,
        systemTableReadNodes,
        buildBenchmarkPartitionLookupSql(tableName),
      );
      const tableNameResult = tableNameLookup.result;
      const tableNameRows = rowsFromQueryResult(tableNameResult);
      if (tableNameRows.length > ZERO) {
        return;
      }

      const tableId = await querySutTableId(
        nodeClient,
        systemTableReadNodes,
        tableName,
      );
      if (tableId) {
        const tableIdLookup = await queryControlWithNodeFallback(
          nodeClient,
          systemTableReadNodes,
          buildBenchmarkPartitionLookupByTableIdSql(tableId),
        );
        const tableIdResult = tableIdLookup.result;
        const tableIdRows = rowsFromQueryResult(tableIdResult);
        if (tableIdRows.length > ZERO) {
          return;
        }
      }

      lastError = new Error(
        'partition metadata for table "' + tableName + '" not visible yet',
      );
    } catch (error) {
      if (!isRetriableTableReadyError(error)) {
        throw error;
      }
      lastError = error;
    }
    await timing.sleep(pollIntervalMs);
  }

  if (lastError) {
    throw new Error(
      'Benchmark table "' + tableName + '" was not ready within ' +
      timeoutMs + 'ms: ' + String(lastError.message || lastError),
    );
  }
  throw new Error(
    'Benchmark table "' + tableName + '" was not ready within ' +
    timeoutMs + 'ms',
  );
}

function buildBaselineLoadNodes(pool, nodeCount) {
  const count = Number.isInteger(nodeCount) && nodeCount > ZERO ?
    nodeCount :
    ONE;
  const nodes = [];
  for (let index = ZERO; index < count; index += ONE) {
    nodes.push({
      id: BASELINE_LOAD_NODE_PREFIX + String(index + ONE),
      query: (sql) => pool.query(sql),
    });
  }
  return nodes;
}

async function runBaselineSharedLoad({
  pool,
  createLoadGenerator,
  loadNodeCount,
  loadOpsPerSec,
  loadDuration,
  loadMaxInFlight,
  loadNodeMaxInFlight,
  maxPendingQueueDepth,
  earlyRejectOnQueueFull,
  nodeFailureThreshold,
  nodeFailureCooldownMs,
  tableName,
}) {
  const loadNodes = buildBaselineLoadNodes(pool, loadNodeCount);
  const loadGenerator = createLoadGenerator(loadNodes, {
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    maxInFlight: loadMaxInFlight,
    tableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    operations: BENCHMARK_WORKLOAD_OPERATIONS,
    ...(Number.isInteger(nodeFailureThreshold) &&
      nodeFailureThreshold > ZERO ?
      {nodeFailureThreshold} :
      {}),
    ...(Number.isInteger(nodeFailureCooldownMs) &&
      nodeFailureCooldownMs > ZERO ?
      {nodeFailureCooldownMs} :
      {}),
    ...(Number.isInteger(loadNodeMaxInFlight) &&
      loadNodeMaxInFlight > ZERO ?
      {nodeMaxInFlight: loadNodeMaxInFlight} :
      {}),
    ...(Number.isInteger(maxPendingQueueDepth) &&
      maxPendingQueueDepth >= ZERO ?
      {maxPendingQueueDepth} :
      {}),
    ...(earlyRejectOnQueueFull === true ?
      {earlyRejectOnQueueFull: true} :
      {}),
  });
  const baselineRun = loadGenerator.start();
  return baselineRun.waitComplete();
}

async function runSutSharedLoad({
  nodeClient,
  seedNode,
  loadNodes,
  createLoadGenerator,
  loadOpsPerSec,
  loadDuration,
  loadMaxInFlight,
  loadQueryTimeoutMs,
  loadNodeMaxInFlight,
  maxPendingQueueDepth,
  earlyRejectOnQueueFull,
  tableName,
  nodeFailureThreshold,
  nodeFailureCooldownMs,
  requiredSchemaVersion,
  benchmarkConfig,
  runtimeAdmissionOwnership = null,
}) {
  let rebalancingPressureMonitor = null;
  const routedLoadNodes = loadNodes.map((node) => ({
    id: node.id,
    breakerOwner: LOAD_BREAKER_OWNER_NODE_CLIENT,
    query: (sql) => {
      if (rebalancingPressureMonitor &&
          typeof rebalancingPressureMonitor.assertLoadNodeAdmitted === 'function') {
        rebalancingPressureMonitor.assertLoadNodeAdmitted(node.id);
      }
      return nodeClient.queryLoad(
        node,
        sql,
        [],
        Number.isInteger(loadQueryTimeoutMs) && loadQueryTimeoutMs > ZERO ?
          {timeoutMs: loadQueryTimeoutMs} :
          {},
      );
    },
  }));
  const loadGenerator = createLoadGenerator(routedLoadNodes, {
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    maxInFlight: loadMaxInFlight,
    tableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    operations: BENCHMARK_WORKLOAD_OPERATIONS,
    ...(Number.isInteger(nodeFailureThreshold) &&
      nodeFailureThreshold > ZERO ?
      {nodeFailureThreshold} :
      {}),
    ...(Number.isInteger(nodeFailureCooldownMs) &&
      nodeFailureCooldownMs > ZERO ?
      {nodeFailureCooldownMs} :
      {}),
    ...(Number.isInteger(loadQueryTimeoutMs) &&
      loadQueryTimeoutMs > ZERO ?
      {queryTimeoutMs: loadQueryTimeoutMs} :
      {}),
    ...(Number.isInteger(loadNodeMaxInFlight) &&
      loadNodeMaxInFlight > ZERO ?
      {nodeMaxInFlight: loadNodeMaxInFlight} :
      {}),
    ...(Number.isInteger(maxPendingQueueDepth) &&
      maxPendingQueueDepth >= ZERO ?
      {maxPendingQueueDepth} :
      {}),
    ...(earlyRejectOnQueueFull === true ?
      {earlyRejectOnQueueFull: true} :
      {}),
  });
  const loadRun = loadGenerator.start();
  rebalancingPressureMonitor = startLoadRebalancingPressureMonitor({
    nodeClient,
    seedNode,
    loadNodes,
    benchmarkConfig,
    loadRun,
    tableName,
    requiredSchemaVersion,
    admissionRuntimeOwnership: runtimeAdmissionOwnership,
  });

  let loadMetrics = null;
  let loadError = null;
  let rebalancingPressure = null;
  try {
    loadMetrics = await loadRun.waitComplete();
  } catch (error) {
    loadError = error;
  } finally {
    rebalancingPressure = rebalancingPressureMonitor ?
      await rebalancingPressureMonitor.stop() :
      buildLoadRebalancingPressureState({
        monitoredNodeIds: loadNodes.map((node) => String(node?.id || '')),
        admittedNodeIds: loadNodes.map((node) => String(node?.id || '')),
      });
  }
  const criticalRebalancingState = buildRebalancingCriticalState(
    rebalancingPressure,
    benchmarkConfig,
  );
  rebalancingPressure.criticalState = criticalRebalancingState;
  if (loadError) {
    throw loadError;
  }
  return {
    metrics: loadMetrics,
    rebalancingPressure,
    internalSignalMessages: criticalRebalancingState.messages,
  };
}

function isNodeAdminReady(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') {
    return false;
  }
  return diagnostics.adminReady === true;
}

function isLoadNodeCandidate(node) {
  return typeof node?.queryWithTimeout === 'function' &&
    typeof node?.getReachabilityDiagnostics === 'function';
}

function normalizeAdminQueryTraceTimestamp(value) {
  return Number.isFinite(value) ? Math.floor(value) : null;
}

function sanitizeAdminQueryTraceEntry(entry, fallbackNodeId) {
  const nodeId =
    typeof entry?.nodeId === 'string' && entry.nodeId.length > ZERO ?
      entry.nodeId :
      fallbackNodeId;
  return {
    nodeId,
    queryId: typeof entry?.queryId === 'string' ? entry.queryId : null,
    lane: typeof entry?.lane === 'string' ? entry.lane : null,
    requestType: typeof entry?.requestType === 'string' ?
      entry.requestType :
      null,
    operation: typeof entry?.operation === 'string' ? entry.operation : null,
    statementPreview: typeof entry?.statementPreview === 'string' ?
      entry.statementPreview :
      null,
    statementFingerprint: typeof entry?.statementFingerprint === 'string' ?
      entry.statementFingerprint :
      null,
    timeoutMs: Number.isFinite(entry?.timeoutMs) ?
      Math.floor(entry.timeoutMs) :
      null,
    startedAtMs: normalizeAdminQueryTraceTimestamp(entry?.startedAtMs),
    socketReadyAtMs: normalizeAdminQueryTraceTimestamp(entry?.socketReadyAtMs),
    sentAtMs: normalizeAdminQueryTraceTimestamp(entry?.sentAtMs),
    resolvedAtMs: normalizeAdminQueryTraceTimestamp(entry?.resolvedAtMs),
    timeoutAtMs: normalizeAdminQueryTraceTimestamp(entry?.timeoutAtMs),
    erroredAtMs: normalizeAdminQueryTraceTimestamp(entry?.erroredAtMs),
    durationMs: Number.isFinite(entry?.durationMs) ?
      Math.floor(entry.durationMs) :
      null,
    rowCount: Number.isInteger(entry?.rowCount) ? entry.rowCount : null,
    outcome: typeof entry?.outcome === 'string' ? entry.outcome : null,
    error: typeof entry?.error === 'string' ? entry.error : null,
  };
}

function collectAdminQueryTraceByNodeId(nodes) {
  const traceByNodeId = {};
  const traceNodes = Array.isArray(nodes) ?
    nodes.slice(ZERO, ADMIN_QUERY_TRACE_CAPTURE_MAX_NODES) :
    [];
  for (const node of traceNodes) {
    const nodeId = typeof node?.id === 'string' && node.id.length > ZERO ?
      node.id :
      DISCOVERY_UNKNOWN_NODE_ID;
    if (typeof node?.getAdminQueryTraceSnapshot !== 'function') {
      continue;
    }
    let traceSnapshot = [];
    try {
      traceSnapshot = node.getAdminQueryTraceSnapshot();
    } catch (_error) {
      continue;
    }
    if (!Array.isArray(traceSnapshot) || traceSnapshot.length === ZERO) {
      continue;
    }
    const recentTraceEntries =
      traceSnapshot.slice(-ADMIN_QUERY_TRACE_CAPTURE_MAX_PER_NODE);
    traceByNodeId[nodeId] = recentTraceEntries.map((entry) =>
      sanitizeAdminQueryTraceEntry(entry, nodeId),
    );
  }
  return Object.keys(traceByNodeId).length > ZERO ? traceByNodeId : null;
}

function selectFailureDiagnosticNodes({
  nodes,
  state,
  failureArtifact,
}) {
  const allNodes = Array.isArray(nodes) ? nodes : [];
  const sutLoadNodes =
    Array.isArray(state?.sutLoadNodes) && state.sutLoadNodes.length > ZERO ?
      state.sutLoadNodes :
      [];
  const candidateNodesById = new Map();
  const addCandidateNode = (node) => {
    if (!isLoadNodeCandidate(node)) {
      return;
    }
    const nodeId = typeof node?.id === 'string' ? node.id : null;
    if (!nodeId) {
      return;
    }
    const existing = candidateNodesById.get(nodeId);
    if (!existing) {
      candidateNodesById.set(nodeId, node);
      return;
    }
    if (typeof existing.getAdminQueryTraceSnapshot !== 'function' &&
        typeof node.getAdminQueryTraceSnapshot === 'function') {
      candidateNodesById.set(nodeId, node);
    }
  };
  for (const node of sutLoadNodes) {
    addCandidateNode(node);
  }
  for (const node of allNodes) {
    addCandidateNode(node);
  }
  const candidateNodes = [...candidateNodesById.values()];
  const affectedNodeIds = new Set(
    Array.isArray(failureArtifact?.affectedNodeIds) ?
      failureArtifact.affectedNodeIds :
      [],
  );
  if (affectedNodeIds.size === ZERO) {
    return candidateNodes;
  }

  const affectedCandidateNodes = candidateNodes.filter((node) =>
    affectedNodeIds.has(node.id),
  );
  if (affectedCandidateNodes.length > ZERO) {
    return affectedCandidateNodes;
  }

  return allNodes.filter((node) =>
    affectedNodeIds.has(node?.id) &&
    isLoadNodeCandidate(node),
  );
}

function uniqueSorted(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.length > ZERO))]
    .sort();
}

function summarizeDiscoveryReadinessReasons(readiness, options = {}) {
  const reasons = Array.isArray(readiness?.[DISCOVERY_READINESS_FIELD_REASONS]) ?
    readiness[DISCOVERY_READINESS_FIELD_REASONS] :
    [];
  const fallbackReason = Object.prototype.hasOwnProperty.call(
    options,
    'fallbackReason',
  ) ?
    options.fallbackReason :
    DISCOVERY_READINESS_REASON_WORKLOAD_NOT_READY;
  if (reasons.length === ZERO) {
    if (typeof fallbackReason === 'string' && fallbackReason.length > ZERO) {
      return [fallbackReason];
    }
    return [];
  }
  const summarized = [];
  for (const reason of reasons) {
    const code = typeof reason?.[DISCOVERY_READINESS_REASON_FIELD_CODE] === 'string' &&
      reason[DISCOVERY_READINESS_REASON_FIELD_CODE].length > ZERO ?
      reason[DISCOVERY_READINESS_REASON_FIELD_CODE] :
      'unknown_reason';
    const detail = typeof reason?.[DISCOVERY_READINESS_REASON_FIELD_DETAIL] === 'string' &&
      reason[DISCOVERY_READINESS_REASON_FIELD_DETAIL].length > ZERO ?
      reason[DISCOVERY_READINESS_REASON_FIELD_DETAIL] :
      null;
    summarized.push(detail ? code + '=' + detail : code);
  }
  return summarized;
}

function summarizeDiscoverySelectionExclusionReasons(readiness) {
  const summarizedReasons = summarizeDiscoveryReadinessReasons(readiness, {
    fallbackReason: null,
  });
  if (summarizedReasons.length > ZERO) {
    return summarizedReasons;
  }
  const fallbackReasons = [];
  if (readiness?.[DISCOVERY_READINESS_FIELD_ROUTING_READY] !== true) {
    fallbackReasons.push(DISCOVERY_READINESS_REASON_ROUTING_NOT_READY);
  }
  if (readiness?.[DISCOVERY_READINESS_FIELD_SCHEMA_READY] !== true) {
    fallbackReasons.push(DISCOVERY_READINESS_REASON_SCHEMA_NOT_READY);
  }
  return fallbackReasons.length > ZERO ?
    fallbackReasons :
    [DISCOVERY_READINESS_REASON_READINESS_MISSING];
}

function summarizeBenchmarkAdmissionReasons(admission, options = {}) {
  const reasons = Array.isArray(
    admission?.[DISCOVERY_BENCHMARK_ADMISSION_FIELD_REASONS],
  ) ?
    admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_REASONS] :
    [];
  const fallbackReason = Object.prototype.hasOwnProperty.call(
    options,
    'fallbackReason',
  ) ?
    options.fallbackReason :
    DISCOVERY_READINESS_REASON_BENCHMARK_NOT_READY;
  if (reasons.length === ZERO) {
    if (typeof fallbackReason === 'string' && fallbackReason.length > ZERO) {
      return [fallbackReason];
    }
    return [];
  }
  const summarized = [];
  for (const reason of reasons) {
    const code = typeof reason?.[DISCOVERY_READINESS_REASON_FIELD_CODE] === 'string' &&
      reason[DISCOVERY_READINESS_REASON_FIELD_CODE].length > ZERO ?
      reason[DISCOVERY_READINESS_REASON_FIELD_CODE] :
      'unknown_reason';
    const detail = typeof reason?.[DISCOVERY_READINESS_REASON_FIELD_DETAIL] === 'string' &&
      reason[DISCOVERY_READINESS_REASON_FIELD_DETAIL].length > ZERO ?
      reason[DISCOVERY_READINESS_REASON_FIELD_DETAIL] :
      null;
    summarized.push(detail ? code + '=' + detail : code);
  }
  return summarized;
}

function buildCanonicalBenchmarkAdmissionState(admission) {
  if (!admission || typeof admission !== 'object') {
    return null;
  }
  return {
    state:
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_STATE] ===
      DISCOVERY_BENCHMARK_ADMISSION_STATE_READY ?
        DISCOVERY_BENCHMARK_ADMISSION_STATE_READY :
        DISCOVERY_BENCHMARK_ADMISSION_STATE_BLOCKED,
    routingReady:
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_ROUTING_READY] === true,
    schemaReady:
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_SCHEMA_READY] === true,
    topologyReady:
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_TOPOLOGY_READY] === true,
    tableName:
      typeof admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_TABLE_NAME] === 'string' &&
        admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_TABLE_NAME].length > ZERO ?
        admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_TABLE_NAME] :
        null,
    localReplicaRole:
      typeof admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_LOCAL_REPLICA_ROLE] === 'string' &&
        admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_LOCAL_REPLICA_ROLE].length > ZERO ?
        admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_LOCAL_REPLICA_ROLE] :
        null,
    degradedByOperationIds: uniqueSorted(
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_DEGRADED_OPERATION_IDS],
    ),
    admissionReasons: summarizeBenchmarkAdmissionReasons(admission, {
      fallbackReason: null,
    }),
  };
}

function evaluateDiscoveryReplicaBenchmarkAdmission(admission) {
  if (!admission || typeof admission !== 'object') {
    return null;
  }
  const admissionState = buildCanonicalBenchmarkAdmissionState(admission);
  const contradictions = [];
  if (admissionState.state === DISCOVERY_BENCHMARK_ADMISSION_STATE_READY &&
      (admissionState.routingReady !== true ||
        admissionState.schemaReady !== true ||
        admissionState.topologyReady !== true ||
        admissionState.admissionReasons.length > ZERO)) {
    contradictions.push(DISCOVERY_READINESS_REASON_STATE_CONTRADICTION);
  }
  if (contradictions.length > ZERO) {
    return {
      ready: false,
      hasAdmission: true,
      reasons: uniqueSorted([
        ...contradictions,
        ...summarizeBenchmarkAdmissionReasons(admission),
      ]),
      admissionState,
    };
  }
  const ready =
    admissionState.state === DISCOVERY_BENCHMARK_ADMISSION_STATE_READY;
  const reasons = ready ?
    [] :
    summarizeBenchmarkAdmissionReasons(admission);
  return {
    ready,
    hasAdmission: true,
    reasons: reasons.length > ZERO ?
      reasons :
      [DISCOVERY_READINESS_REASON_BENCHMARK_NOT_READY],
    admissionState,
  };
}

function buildCanonicalDiscoveryReadinessState(readiness) {
  if (!readiness || typeof readiness !== 'object') {
    return null;
  }
  const replicaOpsInFlight =
    Number.isInteger(readiness[DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT]) ?
      readiness[DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT] :
      null;
  const tableName =
    typeof readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME] === 'string' &&
      readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME].length > ZERO ?
      readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME] :
      null;
  return {
    workloadReady: readiness[DISCOVERY_READINESS_FIELD_WORKLOAD_READY] === true,
    benchmarkReady: readiness[DISCOVERY_READINESS_FIELD_BENCHMARK_READY] === true,
    routingReady: readiness[DISCOVERY_READINESS_FIELD_ROUTING_READY] === true,
    schemaReady: readiness[DISCOVERY_READINESS_FIELD_SCHEMA_READY] === true,
    topologyReady: readiness[DISCOVERY_READINESS_FIELD_TOPOLOGY_READY] === true,
    replicaOpsInFlight,
    leadershipStable:
      readiness[DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE] === true,
    tableName,
    discoveryReasons: summarizeDiscoveryReadinessReasons(readiness, {
      fallbackReason: null,
    }),
  };
}

function detectDiscoveryReadinessContradictions(readinessState) {
  if (!readinessState || typeof readinessState !== 'object') {
    return [];
  }

  const contradictions = [];
  const discoveryReasons = Array.isArray(readinessState.discoveryReasons) ?
    readinessState.discoveryReasons :
    [];
  const hasTopologyBlocker = discoveryReasons.some((reason) =>
    typeof reason === 'string' &&
    (reason.startsWith('local_replica_not_voter_ready') ||
      reason.startsWith('leadership_unstable') ||
      reason.startsWith('replica_operations_in_flight')),
  );
  const hasRoutingBlocker = discoveryReasons.some((reason) =>
    typeof reason === 'string' && reason.startsWith('routing_not_ready'),
  );
  const hasSchemaBlocker = discoveryReasons.some((reason) =>
    typeof reason === 'string' &&
    (reason.startsWith('schema_table_missing') ||
      reason.startsWith('schema_partition_unavailable')),
  );

  if (readinessState.benchmarkReady === true &&
      (readinessState.routingReady !== true ||
        readinessState.schemaReady !== true ||
        readinessState.topologyReady !== true ||
        hasTopologyBlocker ||
        hasRoutingBlocker ||
        hasSchemaBlocker)) {
    contradictions.push(DISCOVERY_READINESS_REASON_STATE_CONTRADICTION);
  }

  if (readinessState.topologyReady === true &&
      ((readinessState.replicaOpsInFlight !== null &&
          readinessState.replicaOpsInFlight > ZERO) ||
        readinessState.leadershipStable !== true ||
        hasTopologyBlocker)) {
    contradictions.push(DISCOVERY_READINESS_REASON_STATE_CONTRADICTION);
  }

  return contradictions;
}

function evaluateDiscoveryReplicaReadiness(readiness, options = {}) {
  const requireCanonicalBenchmarkReadiness =
    options.requireCanonicalBenchmarkReadiness === true;
  const allowMissingReadiness = options.allowMissingReadiness === true;
  if (!readiness || typeof readiness !== 'object') {
    return {
      ready: allowMissingReadiness,
      hasReadiness: false,
      reasons: [DISCOVERY_READINESS_REASON_READINESS_MISSING],
      readinessState: null,
    };
  }

  const readinessState = buildCanonicalDiscoveryReadinessState(readiness);
  const contradictions =
    detectDiscoveryReadinessContradictions(readinessState);
  if (contradictions.length > ZERO) {
    return {
      ready: false,
      hasReadiness: true,
      reasons: uniqueSorted([
        ...contradictions,
        ...summarizeDiscoverySelectionExclusionReasons(readiness),
      ]),
      readinessState,
    };
  }
  const selectionReady =
    readinessState?.routingReady === true &&
    readinessState?.schemaReady === true &&
    readinessState?.topologyReady === true;
  const ready = requireCanonicalBenchmarkReadiness ?
    readinessState?.benchmarkReady === true :
    selectionReady;
  const reasons = ready ?
    [] :
    summarizeDiscoverySelectionExclusionReasons(readiness);

  return {
    ready,
    hasReadiness: true,
    reasons: reasons.length > ZERO ?
      reasons :
      [DISCOVERY_READINESS_REASON_BENCHMARK_NOT_READY],
    readinessState,
  };
}

function summarizeReadinessProbeReasons(options = {}) {
  const reasons = [];
  const errorMessage = typeof options.error === 'string' &&
    options.error.length > ZERO ?
    options.error :
    null;
  if (errorMessage) {
    return [
      DISCOVERY_PROBE_REASON_PROBE_ERROR_PREFIX +
        truncateDiscoveryErrorMessage(errorMessage),
    ];
  }
  const diagnostics = options.diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') {
    return [DISCOVERY_PROBE_REASON_ADMIN_NOT_READY];
  }
  if (typeof diagnostics.reachableBy === 'string' &&
      diagnostics.reachableBy.length > ZERO) {
    reasons.push(
      DISCOVERY_PROBE_REASON_REACHABLE_BY_PREFIX + diagnostics.reachableBy,
    );
  }
  if (typeof diagnostics.lastError === 'string' &&
      diagnostics.lastError.length > ZERO) {
    reasons.push(
      DISCOVERY_PROBE_REASON_LAST_ERROR_PREFIX +
        truncateDiscoveryErrorMessage(diagnostics.lastError),
    );
  }
  if (reasons.length === ZERO) {
    reasons.push(DISCOVERY_PROBE_REASON_ADMIN_NOT_READY);
  }
  return reasons;
}

async function fetchLocalServiceDiscoverySnapshot(nodeClient, node, options = {}) {
  try {
    return await nodeClient.fetchServiceDiscovery(node, options.context);
  } catch (_error) {
    return null;
  }
}

function extractLocalReplicaReadiness(snapshot, nodeId, options = {}) {
  const services = Array.isArray(snapshot?.services) ? snapshot.services : [];
  for (const service of services) {
    const replicas = Array.isArray(service?.replicas) ? service.replicas : [];
    for (const replica of replicas) {
      if (String(replica?.nodeId || '') !== String(nodeId || '')) {
        continue;
      }
      const hasReadiness =
        replica?.readiness && typeof replica.readiness === 'object';
      const admissionEvaluation = evaluateDiscoveryReplicaBenchmarkAdmission(
        replica?.[DISCOVERY_REPLICA_FIELD_BENCHMARK_ADMISSION],
      );
      recordAdmissionRuntimeOwnership(
        options.admissionRuntimeOwnership,
        'localReplicaConfirmation',
        String(nodeId || ''),
        admissionEvaluation?.hasAdmission === true ?
          DISCOVERY_ADMISSION_SOURCE.RUNTIME :
          (hasReadiness ?
            DISCOVERY_ADMISSION_SOURCE.LEGACY :
            DISCOVERY_ADMISSION_SOURCE.MISSING),
      );
      return {
        hasLocalReplica: true,
        requiresConfirmation:
          admissionEvaluation?.hasAdmission === true || hasReadiness,
        evaluation:
          admissionEvaluation ||
          evaluateDiscoveryReplicaReadiness(replica?.readiness, {
            requireCanonicalBenchmarkReadiness: true,
            allowMissingReadiness: true,
          }),
      };
    }
  }
  recordAdmissionRuntimeOwnership(
    options.admissionRuntimeOwnership,
    'localReplicaConfirmation',
    String(nodeId || ''),
    DISCOVERY_ADMISSION_SOURCE.MISSING,
  );
  return {
    hasLocalReplica: false,
    requiresConfirmation: true,
    evaluation: {
      ready: false,
      hasReadiness: false,
      reasons: ['self_discovery_missing'],
      readinessState: null,
    },
  };
}

async function probeLoadLaneReadiness(nodeClient, node, options = {}) {
  const issueLoadProbeQuery = typeof nodeClient?.queryLoadProbe === 'function' ?
    (sql, params, context) => nodeClient.queryLoadProbe(node, sql, params, context) :
    (sql, params, context) => nodeClient.queryLoad(node, sql, params, context);
  try {
    await issueLoadProbeQuery(
      'SELECT 1',
      [],
      NODE_CLIENT_TRANSIENT_CONTEXT,
    );
    const tableProbeSql = typeof options.tableProbeSql === 'string' ?
      options.tableProbeSql :
      '';
    if (tableProbeSql.length > ZERO) {
      await issueLoadProbeQuery(
        tableProbeSql,
        [],
        NODE_CLIENT_TRANSIENT_CONTEXT,
      );
    }
    return {
      ready: true,
      reasons: [],
    };
  } catch (error) {
    return {
      ready: false,
      reasons: [
        DISCOVERY_PROBE_REASON_LOAD_PROBE_FAILED + ':' +
          truncateDiscoveryErrorMessage(String(error?.message || error)),
      ],
    };
  }
}

function resolveServiceNodeIdsFromDiscovery(snapshot, serviceId, protocol, options = {}) {
  const services = Array.isArray(snapshot?.[DISCOVERY_FIELD_SERVICES]) ?
    snapshot[DISCOVERY_FIELD_SERVICES] :
    [];
  const discoveredNodeIds = [];
  const excludedReadinessByNodeId = {};
  const seenNodeIds = new Set();
  for (const service of services) {
    if (!service || typeof service !== 'object') {
      continue;
    }
    if (service[DISCOVERY_SERVICE_FIELD_PROTOCOL] !== protocol) {
      continue;
    }
    const serviceIds = Array.isArray(service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS]) ?
      service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS] :
      [];
    if (!serviceIds.includes(serviceId)) {
      continue;
    }
    const serviceReplicas = Array.isArray(service[DISCOVERY_SERVICE_FIELD_REPLICAS]) ?
      service[DISCOVERY_SERVICE_FIELD_REPLICAS] :
      [];
    for (const replica of serviceReplicas) {
      const nodeId = replica?.[DISCOVERY_REPLICA_FIELD_NODE_ID];
      if (typeof nodeId !== 'string' || nodeId.length === ZERO) {
        continue;
      }
      if (seenNodeIds.has(nodeId)) {
        continue;
      }
      seenNodeIds.add(nodeId);
      const admissionEvaluation = evaluateDiscoveryReplicaBenchmarkAdmission(
        replica?.[DISCOVERY_REPLICA_FIELD_BENCHMARK_ADMISSION],
      );
      recordAdmissionRuntimeOwnership(
        options.admissionRuntimeOwnership,
        'selection',
        nodeId,
        admissionEvaluation?.hasAdmission === true ?
          DISCOVERY_ADMISSION_SOURCE.RUNTIME :
          (replica?.[DISCOVERY_REPLICA_FIELD_READINESS] &&
            typeof replica[DISCOVERY_REPLICA_FIELD_READINESS] === 'object' ?
            DISCOVERY_ADMISSION_SOURCE.LEGACY :
            DISCOVERY_ADMISSION_SOURCE.MISSING),
      );
      const readinessEvaluation = admissionEvaluation ||
        evaluateDiscoveryReplicaReadiness(
          replica?.[DISCOVERY_REPLICA_FIELD_READINESS],
          {
            allowMissingReadiness: true,
          },
        );
      if (readinessEvaluation.ready) {
        discoveredNodeIds.push(nodeId);
        continue;
      }
      excludedReadinessByNodeId[nodeId] = readinessEvaluation.reasons;
    }
  }
  return {
    nodeIds: discoveredNodeIds,
    excludedReadinessByNodeId,
  };
}

function resolveSutLoadNodeSelectionFromDiscovery(snapshot, options = {}) {
  const postgresWireSelection = resolveServiceNodeIdsFromDiscovery(
    snapshot,
    NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
    NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
    options,
  );
  if (postgresWireSelection.nodeIds.length > ZERO) {
    return {
      nodeIds: postgresWireSelection.nodeIds,
      excludedReadinessByNodeId: postgresWireSelection.excludedReadinessByNodeId,
      selection: DISCOVERY_SELECTION_POSTGRES_WIRE,
      serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
      protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
    };
  }

  return {
    nodeIds: [],
    excludedReadinessByNodeId: {},
    selection: null,
    serviceId: null,
    protocol: null,
  };
}

function findServiceReplicaReadinessFromDiscovery(
  snapshot,
  serviceId,
  protocol,
  nodeId,
) {
  const services = Array.isArray(snapshot?.[DISCOVERY_FIELD_SERVICES]) ?
    snapshot[DISCOVERY_FIELD_SERVICES] :
    [];
  for (const service of services) {
    if (!service || typeof service !== 'object') {
      continue;
    }
    if (service[DISCOVERY_SERVICE_FIELD_PROTOCOL] !== protocol) {
      continue;
    }
    const serviceIds = Array.isArray(service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS]) ?
      service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS] :
      [];
    if (!serviceIds.includes(serviceId)) {
      continue;
    }
    const serviceReplicas = Array.isArray(service[DISCOVERY_SERVICE_FIELD_REPLICAS]) ?
      service[DISCOVERY_SERVICE_FIELD_REPLICAS] :
      [];
    for (const replica of serviceReplicas) {
      if (replica?.[DISCOVERY_REPLICA_FIELD_NODE_ID] === nodeId) {
        return replica?.[DISCOVERY_REPLICA_FIELD_READINESS] || null;
      }
    }
  }
  return null;
}

function findServiceReplicaBenchmarkAdmissionFromDiscovery(
  snapshot,
  serviceId,
  protocol,
  nodeId,
) {
  const services = Array.isArray(snapshot?.[DISCOVERY_FIELD_SERVICES]) ?
    snapshot[DISCOVERY_FIELD_SERVICES] :
    [];
  for (const service of services) {
    if (!service || typeof service !== 'object') {
      continue;
    }
    if (service[DISCOVERY_SERVICE_FIELD_PROTOCOL] !== protocol) {
      continue;
    }
    const serviceIds = Array.isArray(service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS]) ?
      service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS] :
      [];
    if (!serviceIds.includes(serviceId)) {
      continue;
    }
    const serviceReplicas = Array.isArray(service[DISCOVERY_SERVICE_FIELD_REPLICAS]) ?
      service[DISCOVERY_SERVICE_FIELD_REPLICAS] :
      [];
    for (const replica of serviceReplicas) {
      if (replica?.[DISCOVERY_REPLICA_FIELD_NODE_ID] === nodeId) {
        return replica?.[DISCOVERY_REPLICA_FIELD_BENCHMARK_ADMISSION] || null;
      }
    }
  }
  return null;
}

function resolveNodeReadinessFromServiceDiscovery(snapshot, nodeId, options = {}) {
  const enforceCanonicalRouteReadiness =
    options.enforceCanonicalRouteReadiness === true;
  const enforceCanonicalVersionedReadiness =
    options.enforceCanonicalVersionedReadiness === true;
  if (enforceCanonicalVersionedReadiness || enforceCanonicalRouteReadiness) {
    const readiness = findServiceReplicaReadinessFromDiscovery(
      snapshot,
      NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
      NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
      nodeId,
    );
    const canonicalDiscoveryReadinessState =
      buildCanonicalDiscoveryReadinessState(readiness);
    const routingReady =
      readiness?.[DISCOVERY_READINESS_FIELD_ROUTING_READY] === true;
    const topologyReady =
      readiness?.[DISCOVERY_READINESS_FIELD_TOPOLOGY_READY] === true;
    const schemaReady =
      readiness?.[DISCOVERY_READINESS_FIELD_SCHEMA_READY] === true;
    const appliedSchemaVersion = extractAppliedSchemaVersionFromReadiness(readiness);
    const canonicalReadiness = evaluateCanonicalVersionedReadiness({
      adminQueryable: options.adminQueryable !== false,
      routingReady,
      topologyReady,
      schemaReady,
      requireTopologyReady:
        enforceCanonicalVersionedReadiness ?
          options.requireTopologyReady !== false :
          options.requireTopologyReady === true,
      allowSchemaReadyFallback:
        enforceCanonicalRouteReadiness === true,
      requiredSchemaVersion: options.requiredSchemaVersion,
      appliedSchemaVersion,
    });
    return {
      ...canonicalReadiness,
      discoveryReasons:
        canonicalDiscoveryReadinessState?.discoveryReasons || [],
      readinessState: canonicalDiscoveryReadinessState,
    };
  }

  const enforceBenchmarkReadiness =
    options.enforceBenchmarkReadiness === true;
  if (enforceBenchmarkReadiness) {
    const benchmarkAdmission = findServiceReplicaBenchmarkAdmissionFromDiscovery(
      snapshot,
      NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
      NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
      nodeId,
    );
    const admissionEvaluation = evaluateDiscoveryReplicaBenchmarkAdmission(
      benchmarkAdmission,
    );
    if (admissionEvaluation) {
      recordAdmissionRuntimeOwnership(
        options.admissionRuntimeOwnership,
        'readinessGate',
        String(nodeId || ''),
        DISCOVERY_ADMISSION_SOURCE.RUNTIME,
      );
      return admissionEvaluation.ready ?
        {
          ready: true,
          reasons: [],
        } :
        {
          ready: false,
          reasons: admissionEvaluation.reasons,
        };
    }
    const readiness = findServiceReplicaReadinessFromDiscovery(
      snapshot,
      NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
      NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
      nodeId,
    );
    recordAdmissionRuntimeOwnership(
      options.admissionRuntimeOwnership,
      'readinessGate',
      String(nodeId || ''),
      readiness && typeof readiness === 'object' ?
        DISCOVERY_ADMISSION_SOURCE.LEGACY :
        DISCOVERY_ADMISSION_SOURCE.MISSING,
    );
    const readinessEvaluation = evaluateDiscoveryReplicaReadiness(readiness, {
      requireCanonicalBenchmarkReadiness: true,
    });
    if (readinessEvaluation.ready &&
        readinessEvaluation.readinessState?.topologyReady === true) {
      return {
        ready: true,
        reasons: [],
      };
    }
    return {
      ready: false,
      reasons: readinessEvaluation.reasons,
    };
  }

  const selection = resolveSutLoadNodeSelectionFromDiscovery(snapshot);
  if (selection.nodeIds.includes(nodeId)) {
    return {
      ready: true,
      reasons: [],
    };
  }
  const excludedReadinessReasons =
    selection.excludedReadinessByNodeId?.[nodeId];
  if (Array.isArray(excludedReadinessReasons) &&
      excludedReadinessReasons.length > ZERO) {
    return {
      ready: false,
      reasons: excludedReadinessReasons,
    };
  }
  return {
    ready: false,
    reasons: [DISCOVERY_READINESS_REASON_NOT_SELECTED_BY_DISCOVERY],
  };
}

function truncateDiscoveryErrorMessage(errorMessage) {
  const text = String(errorMessage || '');
  if (text.length <= DISCOVERY_ERROR_MESSAGE_MAX_CHARS) {
    return text;
  }
  return text.slice(
    ZERO,
    DISCOVERY_ERROR_MESSAGE_MAX_CHARS,
  );
}

function extractDiscoveryErrorMessageChain(error) {
  const messages = [];
  let current = error;
  let depth = ZERO;
  while (current !== null &&
      current !== undefined &&
      depth < DISCOVERY_ERROR_CAUSE_CHAIN_MAX_DEPTH) {
    const message = typeof current === 'string' ?
      current :
      typeof current?.message === 'string' ?
        current.message :
        null;
    if (typeof message === 'string' && message.length > ZERO &&
        !messages.includes(message)) {
      messages.push(message);
    }
    if (!current || typeof current !== 'object') {
      break;
    }
    current = current.cause;
    depth += ONE;
  }
  return messages;
}

function buildDiscoveryNodeClientErrorContext(error) {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const fragments = [];
  if (typeof error.operation === 'string' && error.operation.length > ZERO) {
    fragments.push('operation=' + error.operation);
  }
  if (typeof error.channel === 'string' && error.channel.length > ZERO) {
    fragments.push('channel=' + error.channel);
  }
  if (typeof error.timeoutClass === 'string' && error.timeoutClass.length > ZERO) {
    fragments.push('timeoutClass=' + error.timeoutClass);
  }
  if (typeof error.code === 'string' && error.code.length > ZERO) {
    fragments.push('code=' + error.code);
  }
  if (fragments.length === ZERO) {
    return null;
  }
  return DISCOVERY_ERROR_NODE_CLIENT_CONTEXT_PREFIX +
    fragments.join(',') +
    DISCOVERY_ERROR_NODE_CLIENT_CONTEXT_SUFFIX;
}

function summarizeDiscoverySourceError(error) {
  const messageChain = extractDiscoveryErrorMessageChain(error);
  let primaryMessage = messageChain.length > ZERO ?
    messageChain[ZERO] :
    String(error || '');
  if (primaryMessage.startsWith('NodeClient ') && messageChain.length > ONE) {
    primaryMessage = messageChain[ONE];
  }
  const context = buildDiscoveryNodeClientErrorContext(error);
  const chainSummary = messageChain.length > ONE ?
    messageChain.join(DISCOVERY_ERROR_CHAIN_SEPARATOR) :
    null;
  let summary = primaryMessage;
  if (context) {
    summary += ' (' + context + ')';
  }
  if (chainSummary &&
      chainSummary !== summary &&
      !summary.includes(chainSummary)) {
    summary += ' | chain=' + chainSummary;
  }
  return truncateDiscoveryErrorMessage(summary);
}

function buildSutLoadDiscoveryDiagnostics(options = {}) {
  const gateReason = typeof options.gateReason === 'string' &&
    options.gateReason.length > ZERO ?
    options.gateReason :
    null;
  const diagnostics = {
    attempts: Number.isInteger(options.attempts) ? options.attempts : ZERO,
    timedOut: options.timedOut === true,
    strictMinReachable: options.strictMinReachable === true,
    requiredReachableNodeCount:
      Number.isInteger(options.requiredReachableNodeCount) &&
        options.requiredReachableNodeCount > ZERO ?
        options.requiredReachableNodeCount :
        ONE,
    gateReason,
    discoveredNodeIds: Array.isArray(options.discoveredNodeIds) ?
      [...options.discoveredNodeIds] :
      [],
    candidateNodeIds: Array.isArray(options.candidateNodeIds) ?
      [...options.candidateNodeIds] :
      [],
    reachableNodeIds: Array.isArray(options.reachableNodeIds) ?
      [...options.reachableNodeIds] :
      [],
    sourceResults: Array.isArray(options.sourceResults) ?
      options.sourceResults.map((sourceResult) => ({
        ...sourceResult,
        discoveredNodeIds: Array.isArray(sourceResult?.discoveredNodeIds) ?
          [...sourceResult.discoveredNodeIds] :
          [],
        excludedReadinessByNodeId:
          sourceResult?.excludedReadinessByNodeId &&
          typeof sourceResult.excludedReadinessByNodeId === 'object' ?
            Object.fromEntries(
              Object.entries(sourceResult.excludedReadinessByNodeId)
                .map(([nodeId, reasons]) => [
                  String(nodeId),
                  Array.isArray(reasons) ? reasons.map((reason) => String(reason)) : [],
                ]),
            ) :
            {},
      })) :
      [],
    [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
      options[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID] &&
      typeof options[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID] ===
        'object' ?
        Object.fromEntries(
          Object.entries(
            options[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID],
          )
            .map(([nodeId, reasons]) => [
              String(nodeId),
              Array.isArray(reasons) ? reasons.map((reason) => String(reason)) : [],
            ]),
        ) :
        {},
    elapsedMs: Number.isFinite(options.elapsedMs) ?
      Math.max(ZERO, Math.floor(options.elapsedMs)) :
      ZERO,
  };
  const excludedReadinessByNodeId =
    aggregateDiscoveryReadinessExclusionsByNodeId(diagnostics);
  return {
    ...diagnostics,
    [DISCOVERY_DIAGNOSTICS_FIELD_EXCLUDED_READINESS_BY_NODE_ID]:
      excludedReadinessByNodeId,
    [DISCOVERY_DIAGNOSTICS_FIELD_EXCLUSION_REASON_COUNTS_BY_NODE]:
      aggregateDiscoveryReadinessExclusionReasonCountsByNodeId(
        excludedReadinessByNodeId,
      ),
  };
}

function aggregateDiscoveryReadinessExclusionsByNodeId(diagnostics) {
  const aggregated = {};
  const sourceResults = Array.isArray(diagnostics?.sourceResults) ?
    diagnostics.sourceResults :
    [];
  for (const sourceResult of sourceResults) {
    const exclusions = sourceResult?.excludedReadinessByNodeId &&
      typeof sourceResult.excludedReadinessByNodeId === 'object' ?
      sourceResult.excludedReadinessByNodeId :
      {};
    for (const [nodeId, reasons] of Object.entries(exclusions)) {
      if (!Object.prototype.hasOwnProperty.call(aggregated, nodeId)) {
        aggregated[nodeId] = [];
      }
      const reasonList = Array.isArray(reasons) ?
        reasons.map((reason) => String(reason)) :
        [];
      for (const reason of reasonList) {
        if (!aggregated[nodeId].includes(reason)) {
          aggregated[nodeId].push(reason);
        }
      }
    }
  }
  return aggregated;
}

function aggregateDiscoveryReadinessExclusionReasonCountsByNodeId(
  exclusionsByNodeId,
) {
  const reasonCounts = {};
  const entries = exclusionsByNodeId && typeof exclusionsByNodeId === 'object' ?
    Object.entries(exclusionsByNodeId) :
    [];
  for (const [_nodeId, reasons] of entries) {
    const uniqueReasons = new Set(
      Array.isArray(reasons) ?
        reasons.map((reason) => String(reason)) :
        [],
    );
    for (const reason of uniqueReasons) {
      reasonCounts[reason] = (reasonCounts[reason] || ZERO) + ONE;
    }
  }
  return reasonCounts;
}

function formatSutLoadDiscoveryDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') {
    return '';
  }
  const attempts = Number.isInteger(diagnostics.attempts) ?
    diagnostics.attempts :
    ZERO;
  const requiredReachableNodeCount =
    Number.isInteger(diagnostics.requiredReachableNodeCount) &&
    diagnostics.requiredReachableNodeCount > ZERO ?
      diagnostics.requiredReachableNodeCount :
      ONE;
  const discoveredNodeIds = Array.isArray(diagnostics.discoveredNodeIds) ?
    diagnostics.discoveredNodeIds :
    [];
  const sourceResults = Array.isArray(diagnostics.sourceResults) ?
    diagnostics.sourceResults :
    [];
  const probeReadinessByNodeId =
    diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID] &&
    typeof diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID] ===
      'object' ?
      diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID] :
      {};
  const excludedReadinessByNodeId =
    diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_EXCLUDED_READINESS_BY_NODE_ID] &&
    typeof diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_EXCLUDED_READINESS_BY_NODE_ID] ===
      'object' ?
      diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_EXCLUDED_READINESS_BY_NODE_ID] :
      aggregateDiscoveryReadinessExclusionsByNodeId(diagnostics);
  const exclusionReasonCountsByNode =
    diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_EXCLUSION_REASON_COUNTS_BY_NODE] &&
    typeof diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_EXCLUSION_REASON_COUNTS_BY_NODE] ===
      'object' ?
      diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_EXCLUSION_REASON_COUNTS_BY_NODE] :
      aggregateDiscoveryReadinessExclusionReasonCountsByNodeId(
        excludedReadinessByNodeId,
      );
  const sourceSummary = sourceResults
    .map((sourceResult) => {
      const nodeId =
        typeof sourceResult?.nodeId === 'string' &&
        sourceResult.nodeId.length > ZERO ?
          sourceResult.nodeId :
          DISCOVERY_UNKNOWN_NODE_ID;
      const status =
        typeof sourceResult?.status === 'string' &&
        sourceResult.status.length > ZERO ?
          sourceResult.status :
          DISCOVERY_SOURCE_STATUS_EMPTY;
      const excludedReadiness = sourceResult?.excludedReadinessByNodeId &&
        typeof sourceResult.excludedReadinessByNodeId === 'object' ?
        Object.entries(sourceResult.excludedReadinessByNodeId)
          .map(([nodeId, reasons]) => {
            const reasonList = Array.isArray(reasons) && reasons.length > ZERO ?
              reasons.join('|') :
              'unknown';
            return String(nodeId) + ':' + reasonList;
          })
          .join(',') :
        '';
      if (status === DISCOVERY_SOURCE_STATUS_ERROR) {
        return nodeId + ':' + status +
          '=' +
          String(sourceResult?.error || 'unknown');
      }
      const sourceNodeIds = Array.isArray(sourceResult?.discoveredNodeIds) ?
        sourceResult.discoveredNodeIds :
        [];
      if (sourceNodeIds.length > ZERO) {
        const serviceId = typeof sourceResult?.serviceId === 'string' &&
          sourceResult.serviceId.length > ZERO ?
          sourceResult.serviceId :
          'unknown-service';
        const protocol = typeof sourceResult?.protocol === 'string' &&
          sourceResult.protocol.length > ZERO ?
          sourceResult.protocol :
          'unknown-protocol';
        const baseSummary = nodeId + ':' + status + '=' +
          serviceId + '@' + protocol + ':' + sourceNodeIds.join('|');
        if (excludedReadiness.length > ZERO) {
          return baseSummary + '[excluded=' + excludedReadiness + ']';
        }
        return baseSummary;
      }
      if (excludedReadiness.length > ZERO) {
        return nodeId + ':' + status + '[excluded=' + excludedReadiness + ']';
      }
      return nodeId + ':' + status;
    })
    .join(';');
  const probeSummary = Object.entries(probeReadinessByNodeId)
    .map(([nodeId, reasons]) => {
      const reasonList = Array.isArray(reasons) && reasons.length > ZERO ?
        reasons.join('|') :
        DISCOVERY_PROBE_REASON_ADMIN_NOT_READY;
      return String(nodeId) + ':' + reasonList;
    })
    .join(';');
  const excludedNodeSummary = Object.entries(excludedReadinessByNodeId)
    .map(([nodeId, reasons]) => {
      const reasonList = Array.isArray(reasons) && reasons.length > ZERO ?
        reasons.join('|') :
        'unknown';
      return String(nodeId) + ':' + reasonList;
    })
    .join(DISCOVERY_DIAGNOSTIC_NODE_REASON_SEPARATOR);
  const excludedReasonCountSummary = Object.entries(exclusionReasonCountsByNode)
    .map(([reason, count]) => String(reason) + ':' + String(count))
    .join(DISCOVERY_DIAGNOSTIC_REASON_COUNT_SEPARATOR);
  const diagnosticsSummary = [
    'attempts=' + String(attempts),
    'timedOut=' + String(diagnostics.timedOut === true),
    'requiredReachable=' + String(requiredReachableNodeCount),
    'strictMinReachable=' + String(diagnostics.strictMinReachable === true),
    'discovered=' +
      (discoveredNodeIds.length > ZERO ? discoveredNodeIds.join('|') : 'none'),
  ];
  if (typeof diagnostics.gateReason === 'string' &&
      diagnostics.gateReason.length > ZERO) {
    diagnosticsSummary.push('gateReason=' + diagnostics.gateReason);
  }
  if (sourceSummary.length > ZERO) {
    diagnosticsSummary.push('sources=' + sourceSummary);
  }
  if (probeSummary.length > ZERO) {
    diagnosticsSummary.push(
      DISCOVERY_DIAGNOSTIC_PREFIX_PROBES + probeSummary,
    );
  }
  diagnosticsSummary.push(
    DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUSION_COUNTS +
      (excludedReasonCountSummary.length > ZERO ?
        excludedReasonCountSummary :
        'none'),
  );
  if (excludedNodeSummary.length > ZERO) {
    diagnosticsSummary.push(
      DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUDED_NODES + excludedNodeSummary,
    );
  }
  return diagnosticsSummary.join(', ');
}

function buildStrictDiscoveryGate(options = {}) {
  const strictMinReachable = options.strictMinReachable === true;
  const requiredReachableNodeCount =
    Number.isInteger(options.requiredReachableNodeCount) &&
    options.requiredReachableNodeCount > ZERO ?
      options.requiredReachableNodeCount :
      ONE;
  const reachableNodeCount = Array.isArray(options.nodes) ?
    options.nodes.length :
    ZERO;
  const discoveredNodeCount = Array.isArray(options.diagnostics?.discoveredNodeIds) ?
    options.diagnostics.discoveredNodeIds.length :
    ZERO;
  const reachedTarget = reachableNodeCount >= requiredReachableNodeCount;
  const status = !strictMinReachable || reachedTarget ?
    DISCOVERY_GATE_STATUS_PASSED :
    DISCOVERY_GATE_STATUS_FAILED;
  const reason = status === DISCOVERY_GATE_STATUS_FAILED ?
    DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES :
    null;

  return {
    strictMinReachable,
    requiredReachableNodeCount,
    reachableNodeCount,
    discoveredNodeCount,
    status,
    reason,
  };
}

function buildStrictParityGate(options = {}) {
  const strictParity = options.strictParity === true;
  const parity = options.parity && typeof options.parity === 'object' ?
    options.parity :
    null;
  const parityStatus = typeof parity?.status === 'string' &&
    parity.status.length > ZERO ?
    parity.status :
    null;
  const reasonCodes = Array.isArray(parity?.reasons) ?
    parity.reasons.map((reason) => String(reason)) :
    [];
  const mismatch = parityStatus === LOAD_PARITY_STATUS_MISMATCHED;
  const status = strictParity && mismatch ?
    DISCOVERY_GATE_STATUS_FAILED :
    DISCOVERY_GATE_STATUS_PASSED;
  const reason = strictParity && mismatch ?
    STRICT_PARITY_REASON_MISMATCH :
    null;

  return {
    strictParity,
    parityStatus,
    status,
    reason,
    reasonCodes,
  };
}

function selectStrictInvariantGateEntries(invariants) {
  return (Array.isArray(invariants) ? invariants : [])
    .filter((invariant) =>
      STRICT_INVARIANT_GATE_IDS.has(String(invariant?.invariantId || '')),
    );
}

function createEmptyInternalSignalClassCounts() {
  const counts = {};
  for (const signalClass of INTERNAL_SIGNAL_CLASSES) {
    counts[signalClass] = ZERO;
  }
  return counts;
}

function classifyInternalSignalMessage(message) {
  const text = String(message || '');
  if (INTERNAL_SIGNAL_PATTERN_OPERATION_FAILED.test(text)) {
    return INTERNAL_SIGNAL_CLASS_OPERATION_FAILED;
  }
  if (INTERNAL_SIGNAL_PATTERN_CDC_SAFE_FALLBACK.test(text)) {
    return INTERNAL_SIGNAL_CLASS_CDC_SAFE_FALLBACK;
  }
  if (INTERNAL_SIGNAL_PATTERN_CDC_BUFFERED_WITHOUT_SUBSCRIBER.test(text)) {
    return INTERNAL_SIGNAL_CLASS_CDC_BUFFERED_WITHOUT_SUBSCRIBER;
  }
  if (INTERNAL_SIGNAL_PATTERN_CRITICAL_REBALANCING_STATE.test(text)) {
    return INTERNAL_SIGNAL_CLASS_CRITICAL_REBALANCING_STATE;
  }
  return null;
}

function collectInternalSignalMessages(
  loadMetrics,
  scenarioOverrides,
  runtimeMessages,
) {
  const messages = [];
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors) ?
    loadMetrics.distinctErrors :
    [];
  for (const errorMessage of distinctErrors) {
    messages.push(String(errorMessage));
  }
  if (typeof scenarioOverrides.getInternalSignalMessages === 'function') {
    const overrideMessages = scenarioOverrides.getInternalSignalMessages();
    if (Array.isArray(overrideMessages)) {
      for (const overrideMessage of overrideMessages) {
        messages.push(String(overrideMessage));
      }
    }
  }
  if (Array.isArray(runtimeMessages)) {
    for (const runtimeMessage of runtimeMessages) {
      messages.push(String(runtimeMessage));
    }
  }
  return messages;
}

function buildInternalSignalCounts(loadMetrics, scenarioOverrides, runtimeMessages) {
  const errorsByClass = createEmptyInternalSignalClassCounts();
  const warningsByClass = createEmptyInternalSignalClassCounts();
  const messages = collectInternalSignalMessages(
    loadMetrics,
    scenarioOverrides,
    runtimeMessages,
  );

  const failedCount = Number.isInteger(loadMetrics?.failed) ?
    loadMetrics.failed :
    ZERO;
  const errorCount = Number.isInteger(loadMetrics?.errors) ?
    loadMetrics.errors :
    ZERO;
  const attemptErrorCount = Number.isInteger(loadMetrics?.attemptErrors) ?
    loadMetrics.attemptErrors :
    ZERO;
  errorsByClass[INTERNAL_SIGNAL_CLASS_OPERATION_FAILED] += Math.max(
    ZERO,
    failedCount + errorCount + attemptErrorCount,
  );

  for (const message of messages) {
    const signalClass = classifyInternalSignalMessage(message);
    if (!signalClass) {
      continue;
    }
    if (INTERNAL_SIGNAL_SEVERITY_ERRORS_BY_CLASS[signalClass] === true) {
      errorsByClass[signalClass] += ONE;
      continue;
    }
    warningsByClass[signalClass] += ONE;
  }

  return {
    errorsByClass,
    warningsByClass,
    messages,
  };
}

function evaluateInternalSignalThresholds(counts, thresholdPolicy) {
  const policy = thresholdPolicy && typeof thresholdPolicy === 'object' ?
    thresholdPolicy :
    resolveInternalSignalThresholds({});
  const breaches = [];
  for (const [signalClass, threshold] of Object.entries(policy.errorsByClass || {})) {
    const observedCount = Number(counts?.errorsByClass?.[signalClass] || ZERO);
    if (observedCount >= threshold) {
      breaches.push({
        severity: 'error',
        signalClass,
        threshold,
        observedCount,
      });
    }
  }
  for (const [signalClass, threshold] of Object.entries(policy.warningsByClass || {})) {
    const observedCount = Number(counts?.warningsByClass?.[signalClass] || ZERO);
    if (observedCount >= threshold) {
      breaches.push({
        severity: 'warning',
        signalClass,
        threshold,
        observedCount,
      });
    }
  }
  return {
    failOnThresholdBreach: policy.failOnThresholdBreach === true,
    breached: breaches.length > ZERO,
    breaches,
  };
}

function formatInternalSignalBreaches(thresholdResult) {
  const breaches = Array.isArray(thresholdResult?.breaches) ?
    thresholdResult.breaches :
    [];
  return breaches.map((breach) =>
    String(breach.signalClass) +
      '=' +
      String(breach.observedCount) +
      '>=' +
      String(breach.threshold))
    .join('|');
}

function createEmptySaturationCounters() {
  return {
    schemaVersion: SATURATION_SCHEMA_VERSION,
    cdcForwardTimeoutCount: ZERO,
    systemTableQueryTimeoutCount: ZERO,
    snapshotCollectionErrorCount: ZERO,
  };
}

function buildSaturationCounters(options = {}) {
  const counters = createEmptySaturationCounters();
  const messages = [];
  const distinctErrors = Array.isArray(options?.loadMetrics?.distinctErrors) ?
    options.loadMetrics.distinctErrors :
    [];
  for (const errorMessage of distinctErrors) {
    messages.push(String(errorMessage));
  }
  const internalSignalMessages = Array.isArray(options?.internalSignalMessages) ?
    options.internalSignalMessages :
    [];
  for (const signalMessage of internalSignalMessages) {
    messages.push(String(signalMessage));
  }

  for (const message of messages) {
    if (SATURATION_PATTERN_CDC_FORWARD_TIMEOUT.test(message)) {
      counters.cdcForwardTimeoutCount += ONE;
    }
    if (SATURATION_PATTERN_SYSTEM_TABLE_QUERY_TIMEOUT.test(message)) {
      counters.systemTableQueryTimeoutCount += ONE;
    }
  }

  const reasonHistogram = options?.reasonHistogram &&
    typeof options.reasonHistogram === 'object' ?
    options.reasonHistogram :
    {};
  for (const [reason, count] of Object.entries(reasonHistogram)) {
    const normalizedCount = Math.max(ONE, normalizeNonNegativeInteger(count));
    if (SATURATION_PATTERN_CDC_FORWARD_TIMEOUT.test(reason)) {
      counters.cdcForwardTimeoutCount += normalizedCount;
    }
    if (SATURATION_PATTERN_SYSTEM_TABLE_QUERY_TIMEOUT.test(reason)) {
      counters.systemTableQueryTimeoutCount += normalizedCount;
    }
    if (reason.includes(QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX) ||
        reason.includes('|probe_error=')) {
      counters.snapshotCollectionErrorCount += normalizedCount;
    }
  }

  return counters;
}

function normalizeNonNegativeInteger(value) {
  if (!Number.isFinite(value)) {
    return ZERO;
  }
  return Math.max(ZERO, Math.floor(Number(value)));
}

function normalizeNonNegativeNumber(value) {
  if (!Number.isFinite(value)) {
    return ZERO;
  }
  return Math.max(ZERO, Number(value));
}

function normalizeCdcTelemetryMode(value) {
  return value === CDC_TELEMETRY_MODE_CATCHUP ?
    CDC_TELEMETRY_MODE_CATCHUP :
    CDC_TELEMETRY_MODE_STEADY;
}

function normalizeAuthoritativeFallbackPhaseCounts(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    windowCount: normalizeNonNegativeInteger(source.windowCount),
    totalCount: normalizeNonNegativeInteger(source.totalCount),
  };
}

function normalizeAuthoritativeFallbackTelemetry(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    schemaVersion: normalizeNonNegativeInteger(source.schemaVersion) || ONE,
    nodeId: typeof source.nodeId === 'string' ? source.nodeId : null,
    windowMs: normalizeNonNegativeInteger(source.windowMs),
    totalCount: normalizeNonNegativeInteger(source.totalCount),
    windowCount: normalizeNonNegativeInteger(source.windowCount),
    windowRatePerMinute: normalizeNonNegativeNumber(source.windowRatePerMinute),
    phases: {
      [CDC_TELEMETRY_FALLBACK_PHASE_BOOTSTRAP]:
        normalizeAuthoritativeFallbackPhaseCounts(
          source.phases?.[CDC_TELEMETRY_FALLBACK_PHASE_BOOTSTRAP],
        ),
      [CDC_TELEMETRY_FALLBACK_PHASE_RECOVERY]:
        normalizeAuthoritativeFallbackPhaseCounts(
          source.phases?.[CDC_TELEMETRY_FALLBACK_PHASE_RECOVERY],
        ),
      [CDC_TELEMETRY_FALLBACK_PHASE_STEADY_STATE]:
        normalizeAuthoritativeFallbackPhaseCounts(
          source.phases?.[CDC_TELEMETRY_FALLBACK_PHASE_STEADY_STATE],
        ),
    },
  };
}

function normalizeCdcTelemetryNodeSample(nodeId, sample) {
  const source = sample && typeof sample === 'object' ? sample : {};
  const missingFields = [];
  const normalizedSample = {
    nodeId: String(nodeId),
    [CDC_TELEMETRY_NODE_FIELD_SUBSCRIBER_COUNT]:
      normalizeNonNegativeInteger(source[CDC_TELEMETRY_NODE_FIELD_SUBSCRIBER_COUNT]),
    [CDC_TELEMETRY_NODE_FIELD_BUFFERED_EVENTS]:
      normalizeNonNegativeInteger(source[CDC_TELEMETRY_NODE_FIELD_BUFFERED_EVENTS]),
    [CDC_TELEMETRY_NODE_FIELD_CATCHUP_LAG_EVENTS]:
      normalizeNonNegativeInteger(source[CDC_TELEMETRY_NODE_FIELD_CATCHUP_LAG_EVENTS]),
    [CDC_TELEMETRY_NODE_FIELD_CATCHUP_THROUGHPUT_EVENTS_PER_SEC]:
      normalizeNonNegativeNumber(
        source[CDC_TELEMETRY_NODE_FIELD_CATCHUP_THROUGHPUT_EVENTS_PER_SEC],
      ),
    [CDC_TELEMETRY_NODE_FIELD_MODE]:
      normalizeCdcTelemetryMode(source[CDC_TELEMETRY_NODE_FIELD_MODE]),
    [CDC_TELEMETRY_NODE_FIELD_AUTHORITATIVE_FALLBACK]:
      normalizeAuthoritativeFallbackTelemetry(
        source[CDC_TELEMETRY_NODE_FIELD_AUTHORITATIVE_FALLBACK],
      ),
  };

  for (const requiredField of CDC_TELEMETRY_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, requiredField)) {
      missingFields.push(requiredField);
    }
  }

  return {
    sample: normalizedSample,
    missingFields,
  };
}

function buildCdcTelemetrySummary(normalizedByNode) {
  const samples = Object.values(normalizedByNode);
  let totalSubscriberCount = ZERO;
  let totalBufferedEvents = ZERO;
  let maxCatchupLagEvents = ZERO;
  let totalCatchupThroughputEventsPerSec = ZERO;
  let catchupNodeCount = ZERO;
  let totalAuthoritativeFallbackCount = ZERO;
  let totalAuthoritativeFallbackWindowCount = ZERO;
  let steadyStateAuthoritativeFallbackWindowCount = ZERO;

  for (const sample of samples) {
    totalSubscriberCount += normalizeNonNegativeInteger(
      sample?.[CDC_TELEMETRY_NODE_FIELD_SUBSCRIBER_COUNT],
    );
    totalBufferedEvents += normalizeNonNegativeInteger(
      sample?.[CDC_TELEMETRY_NODE_FIELD_BUFFERED_EVENTS],
    );
    const catchupLagEvents = normalizeNonNegativeInteger(
      sample?.[CDC_TELEMETRY_NODE_FIELD_CATCHUP_LAG_EVENTS],
    );
    maxCatchupLagEvents = Math.max(maxCatchupLagEvents, catchupLagEvents);
    totalCatchupThroughputEventsPerSec += normalizeNonNegativeNumber(
      sample?.[CDC_TELEMETRY_NODE_FIELD_CATCHUP_THROUGHPUT_EVENTS_PER_SEC],
    );
    const authoritativeFallback =
      sample?.[CDC_TELEMETRY_NODE_FIELD_AUTHORITATIVE_FALLBACK];
    totalAuthoritativeFallbackCount += normalizeNonNegativeInteger(
      authoritativeFallback?.totalCount,
    );
    totalAuthoritativeFallbackWindowCount += normalizeNonNegativeInteger(
      authoritativeFallback?.windowCount,
    );
    steadyStateAuthoritativeFallbackWindowCount += normalizeNonNegativeInteger(
      authoritativeFallback?.phases?.[CDC_TELEMETRY_FALLBACK_PHASE_STEADY_STATE]?.windowCount,
    );
    if (sample?.[CDC_TELEMETRY_NODE_FIELD_MODE] === CDC_TELEMETRY_MODE_CATCHUP) {
      catchupNodeCount += ONE;
    }
  }

  const nodeCount = samples.length;
  const steadyNodeCount = Math.max(ZERO, nodeCount - catchupNodeCount);

  return {
    nodeCount,
    totalSubscriberCount,
    totalBufferedEvents,
    maxCatchupLagEvents,
    avgCatchupThroughputEventsPerSec:
      nodeCount > ZERO ?
        totalCatchupThroughputEventsPerSec / nodeCount :
        ZERO,
    catchupNodeCount,
    steadyNodeCount,
    authoritativeFallback: {
      totalCount: totalAuthoritativeFallbackCount,
      windowCount: totalAuthoritativeFallbackWindowCount,
      steadyStateWindowCount: steadyStateAuthoritativeFallbackWindowCount,
    },
  };
}

function buildCdcTelemetrySchemaResult(options = {}) {
  const normalizedByNode = options.normalizedByNode &&
    typeof options.normalizedByNode === 'object' ?
    options.normalizedByNode :
    {};
  const requiredNodeIds = Array.isArray(options.requiredNodeIds) ?
    options.requiredNodeIds.map((nodeId) => String(nodeId)) :
    [];
  const strict = options.strict === true;
  const schemaErrors = [];

  for (const nodeId of requiredNodeIds) {
    if (!Object.prototype.hasOwnProperty.call(normalizedByNode, nodeId)) {
      schemaErrors.push({
        nodeId,
        missingFields: ['nodeTelemetry'],
      });
    }
  }

  const fieldErrors = Array.isArray(options.fieldErrors) ?
    options.fieldErrors :
    [];
  for (const fieldError of fieldErrors) {
    if (!fieldError || typeof fieldError !== 'object') {
      continue;
    }
    const missingFields = Array.isArray(fieldError.missingFields) ?
      fieldError.missingFields.map((fieldName) => String(fieldName)) :
      [];
    if (missingFields.length === ZERO) {
      continue;
    }
    schemaErrors.push({
      nodeId: String(fieldError.nodeId || 'unknown'),
      missingFields,
    });
  }

  return {
    strict,
    valid: schemaErrors.length === ZERO,
    errors: schemaErrors,
  };
}

async function collectCdcTelemetryByNode(nodeClient, nodes, scenarioOverrides) {
  if (typeof scenarioOverrides?.getCdcTelemetryByNode === 'function') {
    const overrideResult = scenarioOverrides.getCdcTelemetryByNode();
    if (overrideResult && typeof overrideResult === 'object') {
      return {...overrideResult};
    }
  }

  const collectedByNode = {};
  for (const node of nodes) {
    try {
      const snapshot = await nodeClient.fetchControlSnapshot(node);
      const cdcTelemetry = snapshot?.cdcTelemetry;
      if (cdcTelemetry && typeof cdcTelemetry === 'object') {
        collectedByNode[String(node.id)] = {...cdcTelemetry};
      }
    } catch (_error) {
      continue;
    }
  }
  return collectedByNode;
}

function buildCdcTelemetryState(options = {}) {
  const rawByNode = options.rawByNode && typeof options.rawByNode === 'object' ?
    options.rawByNode :
    {};
  const normalizedByNode = {};
  const fieldErrors = [];
  for (const [nodeId, sample] of Object.entries(rawByNode)) {
    const normalized = normalizeCdcTelemetryNodeSample(nodeId, sample);
    normalizedByNode[String(nodeId)] = normalized.sample;
    if (normalized.missingFields.length > ZERO) {
      fieldErrors.push({
        nodeId: String(nodeId),
        missingFields: normalized.missingFields,
      });
    }
  }

  const schema = buildCdcTelemetrySchemaResult({
    normalizedByNode,
    requiredNodeIds: options.requiredNodeIds,
    fieldErrors,
    strict: options.strict === true,
  });

  return {
    schemaVersion: CDC_TELEMETRY_SCHEMA_VERSION,
    byNode: normalizedByNode,
    summary: buildCdcTelemetrySummary(normalizedByNode),
    schema,
  };
}

function formatCdcTelemetrySchemaErrors(cdcTelemetryState) {
  const errors = Array.isArray(cdcTelemetryState?.schema?.errors) ?
    cdcTelemetryState.schema.errors :
    [];
  return errors
    .map((error) =>
      String(error.nodeId) +
        '=' +
        (Array.isArray(error.missingFields) ?
          error.missingFields.join(',') :
          'unknown'))
    .join('|');
}

function summarizeCandidateSnapshotErrors(errors, options = {}) {
  const normalizedErrors = Array.isArray(errors) ? errors : [];
  const fallbackReason =
    typeof options.fallbackReason === 'string' &&
      options.fallbackReason.length > ZERO ?
      options.fallbackReason :
      QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE;
  if (normalizedErrors.length === ZERO) {
    return fallbackReason;
  }
  const errorPrefix =
    typeof options.errorPrefix === 'string' &&
      options.errorPrefix.length > ZERO ?
      options.errorPrefix :
      QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX;
  const limitedErrors = normalizedErrors.slice(
    ZERO,
    QUIESCENCE_SNAPSHOT_ERROR_MAX_ENTRIES,
  );
  const errorSegments = limitedErrors.map((entry) =>
    String(entry.nodeId || 'unknown') +
      QUIESCENCE_SNAPSHOT_ERROR_ASSIGN +
      String(entry.error || 'unknown'));
  const remainingCount = normalizedErrors.length - limitedErrors.length;
  if (remainingCount > ZERO) {
    errorSegments.push(
      String(remainingCount) + QUIESCENCE_SNAPSHOT_ERROR_MORE_SUFFIX,
    );
  }
  return errorPrefix +
    errorSegments.join(QUIESCENCE_SNAPSHOT_ERROR_SEPARATOR);
}

function resolveControlSnapshotCandidates(seedNode, loadNodes) {
  const nodes = [];
  if (seedNode) {
    nodes.push(seedNode);
  }
  if (Array.isArray(loadNodes)) {
    nodes.push(...loadNodes);
  }
  const seenNodeIds = new Set();
  const candidates = [];
  for (const node of nodes) {
    const nodeId = typeof node?.id === 'string' && node.id.length > ZERO ?
      node.id :
      null;
    if (!nodeId) {
      continue;
    }
    if (seenNodeIds.has(nodeId)) {
      continue;
    }
    seenNodeIds.add(nodeId);
    candidates.push(node);
  }
  return candidates;
}

function resolveRequiredReachableLoadNodeCount(options = {}, candidateCount) {
  const boundedCandidateCount = Number.isInteger(candidateCount) &&
    candidateCount > ZERO ?
    candidateCount :
    ONE;
  const strictMinReachable = options.strictMinReachable === true;
  const requestedMinimum = Number.isInteger(options.minReachableNodeCount) &&
    options.minReachableNodeCount > ZERO ?
    options.minReachableNodeCount :
    ONE;
  if (strictMinReachable) {
    return Math.max(
      ONE,
      requestedMinimum,
    );
  }
  return Math.max(
    ONE,
    Math.min(boundedCandidateCount, requestedMinimum),
  );
}

async function fetchControlSnapshotFromCandidates(
  nodeClient,
  candidates,
  context = {},
) {
  return fetchSnapshotFromCandidates(
    candidates,
    (node) => nodeClient.fetchControlSnapshot(node, context),
    {
      fallbackReason: QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE,
      errorPrefix: QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX,
    },
  );
}

async function fetchSnapshotFromCandidates(
  candidates,
  fetchSnapshot,
  options = {},
) {
  if (!Array.isArray(candidates) || candidates.length === ZERO) {
    throw new Error(
      options.fallbackReason || QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE,
    );
  }
  const errors = [];
  for (const node of candidates) {
    const nodeId = typeof node?.id === 'string' && node.id.length > ZERO ?
      node.id :
      'unknown';
    try {
      return await fetchSnapshot(node);
    } catch (error) {
      errors.push({
        nodeId,
        error: String(error?.message || error),
      });
    }
  }
  throw new Error(summarizeCandidateSnapshotErrors(errors, options));
}

async function fetchServiceDiscoveryFromCandidates(
  nodeClient,
  candidates,
  context = {},
) {
  return fetchSnapshotFromCandidates(
    candidates,
    (node) => nodeClient.fetchServiceDiscovery(node, context),
    {
      fallbackReason: ROUTING_DISCOVERY_NO_SNAPSHOT_CANDIDATE,
      errorPrefix: ROUTING_DISCOVERY_QUERY_ERROR_PREFIX,
    },
  );
}

function createVerificationSnapshotRefreshResult() {
  return {
    attempted: false,
    triggerMismatchKind: null,
    targetNodeIds: [],
    refreshedNodeIds: [],
    failedNodeIds: [],
    resolved: null,
  };
}

function buildSnapshotWarning(prefix, nodeId, error) {
  return prefix +
    String(nodeId || 'unknown') +
    '=' +
    String(error?.message || error);
}

async function collectControlSnapshotsFromNodes(
  nodeClient,
  nodes,
  options = {},
) {
  const candidates = Array.isArray(nodes) ? nodes : [];
  const context =
    options.context && typeof options.context === 'object' ?
      options.context :
      {};
  const warningPrefix =
    typeof options.warningPrefix === 'string' &&
      options.warningPrefix.length > ZERO ?
      options.warningPrefix :
      SNAPSHOT_WARNING_PREFIX;
  const snapshots = [];
  const warnings = [];
  for (const node of candidates) {
    const nodeId = typeof node?.id === 'string' && node.id.length > ZERO ?
      node.id :
      'unknown';
    try {
      snapshots.push(
        await nodeClient.fetchControlSnapshot(node, context),
      );
    } catch (error) {
      warnings.push(
        buildSnapshotWarning(warningPrefix, nodeId, error),
      );
    }
  }
  return {
    snapshots,
    warnings,
  };
}

function resolvePartitionSetMismatchEntry(mismatches) {
  const entries = Array.isArray(mismatches) ? mismatches : [];
  for (const entry of entries) {
    if (String(entry?.kind || '') ===
      CONSISTENCY_MISMATCH_KIND.PARTITION_SET) {
      return entry;
    }
  }
  return null;
}

function normalizePartitionSetSignature(partitions) {
  const values = Array.isArray(partitions) ?
    partitions :
    [];
  return JSON.stringify(
    values
      .map((value) => String(value))
      .filter((value) => value.length > ZERO)
      .sort(),
  );
}

function resolvePartitionSetRefreshNodeIds(
  partitionSetMismatch,
  verificationNodeIds,
) {
  const byNode =
    partitionSetMismatch?.byNode &&
      typeof partitionSetMismatch.byNode === 'object' ?
      partitionSetMismatch.byNode :
      {};
  const allowedNodeIds = new Set(
    (Array.isArray(verificationNodeIds) ? verificationNodeIds : [])
      .map((nodeId) => String(nodeId)),
  );
  const signatureByNodeId = new Map();
  const signatureCounts = new Map();

  for (const [rawNodeId, partitions] of Object.entries(byNode)) {
    const nodeId = String(rawNodeId);
    if (allowedNodeIds.size > ZERO && !allowedNodeIds.has(nodeId)) {
      continue;
    }
    const signature = normalizePartitionSetSignature(partitions);
    signatureByNodeId.set(nodeId, signature);
    signatureCounts.set(
      signature,
      (signatureCounts.get(signature) || ZERO) + ONE,
    );
  }

  if (signatureByNodeId.size === ZERO) {
    return [];
  }

  let majoritySignature = null;
  let majorityCount = -ONE;
  for (const [signature, count] of signatureCounts.entries()) {
    if (count > majorityCount) {
      majoritySignature = signature;
      majorityCount = count;
      continue;
    }
    if (count === majorityCount &&
        majoritySignature !== null &&
        signature < majoritySignature) {
      majoritySignature = signature;
    }
  }

  const targetNodeIds = [];
  for (const [nodeId, signature] of signatureByNodeId.entries()) {
    if (signature !== majoritySignature) {
      targetNodeIds.push(nodeId);
    }
  }
  if (targetNodeIds.length > ZERO) {
    return targetNodeIds.sort();
  }
  return [...signatureByNodeId.keys()].sort();
}

function replaceSnapshotsByNodeId(baseSnapshots, refreshedSnapshots) {
  const original = Array.isArray(baseSnapshots) ? baseSnapshots : [];
  const replacements = Array.isArray(refreshedSnapshots) ? refreshedSnapshots : [];
  const replacementByNodeId = new Map();
  for (const snapshot of replacements) {
    const nodeId = String(snapshot?.nodeId || '');
    if (!nodeId) {
      continue;
    }
    replacementByNodeId.set(nodeId, snapshot);
  }
  const mergedSnapshots = original.map((snapshot) => {
    const nodeId = String(snapshot?.nodeId || '');
    if (!nodeId || !replacementByNodeId.has(nodeId)) {
      return snapshot;
    }
    const replacement = replacementByNodeId.get(nodeId);
    replacementByNodeId.delete(nodeId);
    return replacement;
  });
  for (const replacement of replacementByNodeId.values()) {
    mergedSnapshots.push(replacement);
  }
  return mergedSnapshots;
}

async function resolveSutLoadNodes(nodeClient, nodes, seedNode, options = {}) {
  const timing = resolveScenarioTiming(options.timing);
  const candidates = Array.isArray(nodes) ?
    nodes.filter((node) => isLoadNodeCandidate(node)) :
    [];
  if (candidates.length === ZERO || !isLoadNodeCandidate(seedNode)) {
    return {
      nodes: [],
      diagnostics: buildSutLoadDiscoveryDiagnostics({
        attempts: ZERO,
      }),
    };
  }
  const requiredReachableNodeCount = resolveRequiredReachableLoadNodeCount(
    options,
    candidates.length,
  );
  const strictMinReachable = options.strictMinReachable === true;

  const candidateById = new Map();
  for (const node of candidates) {
    if (typeof node?.id === 'string' && node.id.length > ZERO) {
      candidateById.set(node.id, node);
    }
  }

  const discoverySources = [seedNode];
  for (const node of candidates) {
    if (node.id !== seedNode.id) {
      discoverySources.push(node);
    }
  }

  const timeoutMs = Number.isInteger(options.timeoutMs) &&
    options.timeoutMs > ZERO ?
    options.timeoutMs :
    BENCHMARK_DEFAULTS.readyTimeoutMs;
  const pollIntervalMs = Number.isInteger(options.pollIntervalMs) &&
    options.pollIntervalMs > ZERO ?
    options.pollIntervalMs :
    BENCHMARK_DEFAULTS.readyPollIntervalMs;
  const discoveryTableName = normalizeTableName(options.tableName, '');
  const discoveryTableId = normalizeTableId(options.tableId, '');
  const loadLaneTableProbeSql = discoveryTableName.length > ZERO ?
    buildSutTableProbeSql(discoveryTableName) :
    '';
  const discoveryContext = discoveryTableName.length > ZERO ?
    {
      ...NODE_CLIENT_TRANSIENT_CONTEXT,
      [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME]: discoveryTableName,
      ...(discoveryTableId.length > ZERO ?
        {
          [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID]: discoveryTableId,
        } :
        {}),
    } :
    NODE_CLIENT_TRANSIENT_CONTEXT;
  const startedAt = timing.now();
  const deadline = startedAt + timeoutMs;
  let attempts = ZERO;
  let lastSourceResults = [];
  let lastDiscoveredNodeIds = [];
  let lastCandidateNodeIds = [];
  let lastReachableNodeIds = [];
  let lastProbeReadinessByNodeId = {};
  let bestReachableCandidates = [];
  let bestSourceResults = [];
  let bestDiscoveredNodeIds = [];
  let bestCandidateNodeIds = [];
  let bestReachableNodeIds = [];
  let bestProbeReadinessByNodeId = {};
  let attemptsSinceBestReachableImprovement = ZERO;

  function buildDiscoveryDiagnostics(options = {}) {
    return buildSutLoadDiscoveryDiagnostics({
      ...options,
      strictMinReachable,
      requiredReachableNodeCount,
    });
  }

  while (true) {
    attempts += ONE;
    const discoveredNodeIds = [];
    const discoveredNodeIdSet = new Set();
    const sourceResults = [];
    for (const sourceNode of discoverySources) {
      const sourceNodeId = typeof sourceNode?.id === 'string' &&
        sourceNode.id.length > ZERO ?
        sourceNode.id :
        DISCOVERY_UNKNOWN_NODE_ID;
      try {
        const snapshot = await nodeClient.fetchServiceDiscovery(
          sourceNode,
          discoveryContext,
        );
        const discoverySelection =
          resolveSutLoadNodeSelectionFromDiscovery(snapshot, {
            admissionRuntimeOwnership: options.admissionRuntimeOwnership,
          });
        const snapshotNodeIds = discoverySelection.nodeIds;
        if (snapshotNodeIds.length > ZERO) {
          sourceResults.push({
            nodeId: sourceNodeId,
            status: DISCOVERY_SOURCE_STATUS_DISCOVERED,
            discoveredNodeIds: snapshotNodeIds,
            selection: discoverySelection.selection,
            serviceId: discoverySelection.serviceId,
            protocol: discoverySelection.protocol,
            excludedReadinessByNodeId:
              discoverySelection.excludedReadinessByNodeId,
          });
          for (const discoveredNodeId of snapshotNodeIds) {
            if (discoveredNodeIdSet.has(discoveredNodeId)) {
              continue;
            }
            discoveredNodeIdSet.add(discoveredNodeId);
            discoveredNodeIds.push(discoveredNodeId);
          }
          continue;
        }
        sourceResults.push({
          nodeId: sourceNodeId,
          status: DISCOVERY_SOURCE_STATUS_EMPTY,
          discoveredNodeIds: [],
          excludedReadinessByNodeId:
            discoverySelection.excludedReadinessByNodeId,
        });
      } catch (error) {
        sourceResults.push({
          nodeId: sourceNodeId,
          status: DISCOVERY_SOURCE_STATUS_ERROR,
          discoveredNodeIds: [],
          error: summarizeDiscoverySourceError(error),
        });
      }
    }
    lastSourceResults = sourceResults;
    lastDiscoveredNodeIds = discoveredNodeIds;
    if (discoveredNodeIds.length > ZERO) {
      const discoveredNodeIdSet = new Set(discoveredNodeIds);
      const discoveredCandidates = [...candidateById.values()].filter((node) =>
        discoveredNodeIdSet.has(node.id),
      );
      lastCandidateNodeIds = discoveredCandidates.map((node) => node.id);
      if (discoveredCandidates.length > ZERO) {
        const readinessProbeResults = await Promise.all(
          discoveredCandidates.map(async (node) => {
            try {
              const diagnostics = await nodeClient.probeReadiness(node);
              const localSnapshot = await fetchLocalServiceDiscoverySnapshot(
                nodeClient,
                node,
                {context: discoveryContext},
              );
              const localReadiness = extractLocalReplicaReadiness(
                localSnapshot,
                node.id,
                {
                  admissionRuntimeOwnership: options.admissionRuntimeOwnership,
                },
              );
              const loadLaneReadiness =
                localReadiness?.requiresConfirmation === true &&
                localReadiness?.evaluation?.ready === true ?
                  await probeLoadLaneReadiness(nodeClient, node, {
                    tableProbeSql: loadLaneTableProbeSql,
                  }) :
                  {ready: false, reasons: []};
              return {
                node,
                diagnostics,
                error: null,
                adminReady: isNodeAdminReady(diagnostics),
                localReadiness,
                loadLaneReadiness,
              };
            } catch (_error) {
              return {
                node,
                diagnostics: null,
                error: summarizeDiscoverySourceError(_error),
                adminReady: false,
                localReadiness: null,
                loadLaneReadiness: null,
              };
            }
          }),
        );
        const reachableCandidates = [];
        const probeReadinessByNodeId = {};
        for (const probeResult of readinessProbeResults) {
          const nodeId = String(probeResult?.node?.id || DISCOVERY_UNKNOWN_NODE_ID);
          const exclusionReasons = [];
          if (probeResult?.adminReady !== true) {
            exclusionReasons.push(...summarizeReadinessProbeReasons({
              diagnostics: probeResult?.diagnostics,
              error: probeResult?.error,
            }));
          }
          if (probeResult?.localReadiness?.requiresConfirmation === true &&
              probeResult?.localReadiness?.evaluation?.ready !== true) {
            const localReasons =
              Array.isArray(probeResult?.localReadiness?.evaluation?.reasons) &&
                probeResult.localReadiness.evaluation.reasons.length > ZERO ?
                probeResult.localReadiness.evaluation.reasons :
                ['self_discovery_missing'];
            for (const reason of localReasons) {
              exclusionReasons.push(
                DISCOVERY_PROBE_REASON_SELF_DISCOVERY_PREFIX + String(reason),
              );
            }
          }
          if (probeResult?.loadLaneReadiness?.ready !== true &&
              Array.isArray(probeResult?.loadLaneReadiness?.reasons)) {
            exclusionReasons.push(...probeResult.loadLaneReadiness.reasons);
          }
          if (exclusionReasons.length === ZERO) {
            reachableCandidates.push(probeResult.node);
            continue;
          }
          probeReadinessByNodeId[nodeId] = uniqueSorted(exclusionReasons);
        }
        lastProbeReadinessByNodeId = probeReadinessByNodeId;
        lastReachableNodeIds = reachableCandidates.map((node) => node.id);
        if (reachableCandidates.length > bestReachableCandidates.length) {
          bestReachableCandidates = [...reachableCandidates];
          bestSourceResults = sourceResults;
          bestDiscoveredNodeIds = [...discoveredNodeIds];
          bestCandidateNodeIds = [...lastCandidateNodeIds];
          bestReachableNodeIds = [...lastReachableNodeIds];
          bestProbeReadinessByNodeId = {
            ...probeReadinessByNodeId,
          };
          attemptsSinceBestReachableImprovement = ZERO;
        } else if (bestReachableCandidates.length > ZERO &&
            bestReachableCandidates.length < requiredReachableNodeCount) {
          attemptsSinceBestReachableImprovement += ONE;
        }
        if (reachableCandidates.length >= requiredReachableNodeCount) {
          return {
            nodes: reachableCandidates,
            diagnostics: buildDiscoveryDiagnostics({
              attempts,
              timedOut: false,
              discoveredNodeIds,
              candidateNodeIds: lastCandidateNodeIds,
              reachableNodeIds: lastReachableNodeIds,
              sourceResults,
              [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
                lastProbeReadinessByNodeId,
              elapsedMs: timing.now() - startedAt,
            }),
          };
        }
        if (!strictMinReachable &&
            bestReachableCandidates.length > ZERO &&
            bestReachableCandidates.length < requiredReachableNodeCount &&
            attemptsSinceBestReachableImprovement >=
              DISCOVERY_STALLED_ATTEMPT_THRESHOLD) {
          const gateReason = strictMinReachable ?
            DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES :
            null;
          return {
            nodes: strictMinReachable ? [] : bestReachableCandidates,
            diagnostics: buildDiscoveryDiagnostics({
              attempts,
              timedOut: true,
              gateReason,
              discoveredNodeIds: bestDiscoveredNodeIds,
              candidateNodeIds: bestCandidateNodeIds,
              reachableNodeIds: bestReachableNodeIds,
              sourceResults: bestSourceResults,
              [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
                bestProbeReadinessByNodeId,
              elapsedMs: timing.now() - startedAt,
            }),
          };
        }
      }
    }
    if (timing.now() >= deadline) {
      const timedOutNodes = bestReachableCandidates.length > ZERO ?
        bestReachableCandidates :
        [];
      const timedOutSourceResults = bestReachableCandidates.length > ZERO ?
        bestSourceResults :
        lastSourceResults;
      const timedOutDiscoveredNodeIds = bestReachableCandidates.length > ZERO ?
        bestDiscoveredNodeIds :
        lastDiscoveredNodeIds;
      const timedOutCandidateNodeIds = bestReachableCandidates.length > ZERO ?
        bestCandidateNodeIds :
        lastCandidateNodeIds;
      const timedOutReachableNodeIds = bestReachableCandidates.length > ZERO ?
        bestReachableNodeIds :
        lastReachableNodeIds;
      const timedOutProbeReadinessByNodeId = bestReachableCandidates.length > ZERO ?
        bestProbeReadinessByNodeId :
        lastProbeReadinessByNodeId;
      const gateReason = strictMinReachable &&
        timedOutReachableNodeIds.length < requiredReachableNodeCount ?
        DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES :
        null;
      return {
        nodes: strictMinReachable ? [] : timedOutNodes,
        diagnostics: buildDiscoveryDiagnostics({
          attempts,
          timedOut: true,
          gateReason,
          discoveredNodeIds: timedOutDiscoveredNodeIds,
          candidateNodeIds: timedOutCandidateNodeIds,
          reachableNodeIds: timedOutReachableNodeIds,
          sourceResults: timedOutSourceResults,
          [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
            timedOutProbeReadinessByNodeId,
          elapsedMs: timing.now() - startedAt,
        }),
      };
    }
    await timing.sleep(pollIntervalMs);
  }
}

async function waitForSutLoadQuiescence({
  nodeClient,
  loadNodes,
  seedNode,
  snapshotNodes,
  tableName,
  timeoutMs,
  pollIntervalMs,
  stableWindowMs,
  noProgressTimeoutMs,
  maxReplicaOpsInFlight,
  strictCanonicalReadiness,
  requiredSchemaVersion,
  requiredSchemaTableId,
  onConvergenceEvent,
  onBenchmarkMetadataSnapshot,
  runtimeAdmissionOwnership,
  timing: configuredTiming,
}) {
  const timing = resolveScenarioTiming(configuredTiming);
  const tableProbeSql = buildSutTableProbeSql(tableName);
  const requireCanonicalReadiness = strictCanonicalReadiness === true;
  const effectiveStableWindowMs = Math.max(
    ZERO,
    Number.isFinite(stableWindowMs) ?
      Math.floor(stableWindowMs) :
      QUIESCENCE_DEFAULT_STABLE_WINDOW_MS,
  );
  const effectiveNoProgressTimeoutMs =
    Number.isInteger(noProgressTimeoutMs) && noProgressTimeoutMs > ZERO ?
      noProgressTimeoutMs :
      null;
  const effectiveMaxReplicaOpsInFlight =
    Number.isInteger(maxReplicaOpsInFlight) && maxReplicaOpsInFlight >= ZERO ?
      maxReplicaOpsInFlight :
      BENCHMARK_PRELOAD_MAX_REPLICA_OPS_IN_FLIGHT_DEFAULT;
  let lastLeaderSignature = null;
  let lastLeaderChangeAtMs = timing.now();
  let lastProgressAtMs = timing.now();
  let lowestInFlightCount = Number.POSITIVE_INFINITY;
  let maxLeaderQuietElapsedMs = ZERO;
  let maxIncludedNodeCount = ZERO;
  const gateProgressState = {
    inFlightCount: null,
    leaderQuietElapsedMs: ZERO,
    partitionGroupInFlight: {},
    operationTimelineByOperationId: {},
  };
  const versionedReadinessByNodeId = {};
  const requiredNodeIds = loadNodes
    .map((node) => String(node?.id || DISCOVERY_UNKNOWN_NODE_ID));
  const readinessTimeline = [];
  const readinessReasonSignatureByNodeId = {};
  const benchmarkMetadataSignatureByNodeId = {};
  let readinessTimelineSequence = ZERO;

  async function maybeCaptureBenchmarkMetadataSnapshot(node, stage, readinessState, probeError) {
    if (typeof onBenchmarkMetadataSnapshot !== 'function') {
      return;
    }
    const nodeId = String(node?.id || DISCOVERY_UNKNOWN_NODE_ID);
    const signature = JSON.stringify({
      stage: String(stage || BENCHMARK_METADATA_STAGE_READINESS_POLL),
      ready: readinessState?.ready === true,
      requiredSchemaVersion:
        readinessState?.requiredSchemaVersion ||
        normalizeRequiredSchemaVersion(requiredSchemaVersion),
      appliedSchemaVersion: readinessState?.appliedSchemaVersion || null,
      reasons: Array.isArray(readinessState?.reasons) ?
        [...readinessState.reasons] :
        [],
      discoveryReasons: Array.isArray(readinessState?.discoveryReasons) ?
        [...readinessState.discoveryReasons] :
        [],
      probeError:
        typeof probeError === 'string' && probeError.length > ZERO ?
          probeError :
          null,
    });
    if (benchmarkMetadataSignatureByNodeId[nodeId] === signature) {
      return;
    }
    benchmarkMetadataSignatureByNodeId[nodeId] = signature;
    const snapshot = await collectBenchmarkMetadataSnapshot({
      nodeClient,
      node,
      tableName,
      tableId: requiredSchemaTableId,
      requiredSchemaVersion:
        readinessState?.requiredSchemaVersion || requiredSchemaVersion,
      stage,
      readinessState: readinessState?.readinessState,
      probeError,
    });
    onBenchmarkMetadataSnapshot(snapshot);
  }

  function recordVersionedReadiness(nodeId, readinessState) {
    versionedReadinessByNodeId[nodeId] = {
      requiredSchemaVersion:
        readinessState?.requiredSchemaVersion ||
        normalizeRequiredSchemaVersion(requiredSchemaVersion),
      appliedSchemaVersion:
        readinessState?.appliedSchemaVersion || null,
      ready: readinessState?.ready === true,
      reasons: Array.isArray(readinessState?.reasons) ?
        [...readinessState.reasons] :
        [],
      discoveryReasons: Array.isArray(readinessState?.discoveryReasons) ?
        [...readinessState.discoveryReasons] :
        [],
      readinessState:
        cloneDiscoveryReadinessState(readinessState?.readinessState),
    };
  }

  function recordReadinessObservation(nodeId, readinessState) {
    if (!requireCanonicalReadiness) {
      return;
    }
    const reasons = Array.isArray(readinessState?.reasons) ?
      [...readinessState.reasons] :
      [];
    const reasonSignature = reasons.join('|');
    const hasPreviousReasonSignature = Object.prototype.hasOwnProperty.call(
      readinessReasonSignatureByNodeId,
      nodeId,
    );
    const previousReasonSignature = hasPreviousReasonSignature ?
      readinessReasonSignatureByNodeId[nodeId] :
      null;
    const discoveryReasons = Array.isArray(readinessState?.discoveryReasons) ?
      [...readinessState.discoveryReasons] :
      [];
    const readinessStateSnapshot = cloneDiscoveryReadinessState(
      readinessState?.readinessState,
    );

    readinessTimelineSequence += ONE;
    readinessTimeline.push({
      type: READINESS_TIMELINE_EVENT_POLL_SNAPSHOT,
      sequence: readinessTimelineSequence,
      nodeId,
      ready: readinessState?.ready === true,
      reasons,
      requiredSchemaVersion:
        readinessState?.requiredSchemaVersion ||
        normalizeRequiredSchemaVersion(requiredSchemaVersion),
      observedSchemaVersion:
        readinessState?.appliedSchemaVersion || null,
      discoveryReasons,
      ...(readinessStateSnapshot ?
        {readinessState: readinessStateSnapshot} :
        {}),
      timestampMs: timing.now(),
    });

    if (!hasPreviousReasonSignature ||
        previousReasonSignature !== reasonSignature) {
      readinessTimelineSequence += ONE;
      readinessTimeline.push({
        type: READINESS_TIMELINE_EVENT_REASON_TRANSITION,
        sequence: readinessTimelineSequence,
        nodeId,
        from: previousReasonSignature,
        to: reasonSignature,
        timestampMs: timing.now(),
      });
      readinessReasonSignatureByNodeId[nodeId] = reasonSignature;
    }
  }

  function buildVersionConvergenceSnapshot() {
    const requiredVersion = normalizeRequiredSchemaVersion(requiredSchemaVersion);
    const nodes = {};
    for (const nodeId of requiredNodeIds) {
      const snapshot = versionedReadinessByNodeId[nodeId];
      nodes[nodeId] = {
        requiredSchemaVersion:
          snapshot?.requiredSchemaVersion || requiredVersion,
        observedSchemaVersion:
          snapshot?.appliedSchemaVersion || null,
        ready: snapshot?.ready === true,
        unmetReasons: Array.isArray(snapshot?.reasons) ?
          [...snapshot.reasons] :
          [DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN],
        discoveryReasons: Array.isArray(snapshot?.discoveryReasons) ?
          [...snapshot.discoveryReasons] :
          [],
        readinessState: cloneDiscoveryReadinessState(snapshot?.readinessState),
      };
    }
    return {
      requiredSchemaVersion: requiredVersion,
      nodes,
    };
  }

  const gateEngine = new GateEngine({
    now: timing.now,
    sleep: timing.sleep,
  });
  const controlSnapshotCandidates = resolveControlSnapshotCandidates(
    seedNode,
    snapshotNodes,
  );
  const gateResult = await gateEngine.waitForGate({
    nodes: loadNodes,
    timeoutMs,
    pollIntervalMs,
    stableWindowMs: effectiveStableWindowMs,
    probeNode: async (node) => {
      const nodeId = String(node?.id || DISCOVERY_UNKNOWN_NODE_ID);
      if (requireCanonicalReadiness) {
        try {
          const discoveryContext = {
            ...NODE_CLIENT_TRANSIENT_CONTEXT,
            requireReadiness: true,
            ...(typeof tableName === 'string' && tableName.length > ZERO ?
              {
                [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME]: tableName,
                ...(typeof requiredSchemaTableId === 'string' &&
                    requiredSchemaTableId.length > ZERO ?
                  {
                    [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID]:
                      requiredSchemaTableId,
                  } :
                  {}),
              } :
              {}),
          };
          const discoverySnapshot = await nodeClient.fetchServiceDiscovery(
            node,
            discoveryContext,
          );
          const discoveryReadiness = resolveNodeReadinessFromServiceDiscovery(
            discoverySnapshot,
            nodeId,
            {
              enforceCanonicalVersionedReadiness: true,
              adminQueryable: true,
              requiredSchemaVersion,
              admissionRuntimeOwnership: runtimeAdmissionOwnership,
            },
          );
          await maybeCaptureBenchmarkMetadataSnapshot(
            node,
            BENCHMARK_METADATA_STAGE_READINESS_POLL,
            discoveryReadiness,
            null,
          );
          recordVersionedReadiness(nodeId, discoveryReadiness);
          recordReadinessObservation(nodeId, discoveryReadiness);
          if (typeof onConvergenceEvent === 'function') {
            onConvergenceEvent({
              type: 'cdc_received',
              nodeId,
              tableId: requiredSchemaTableId || null,
              tableName,
              requiredSchemaVersion:
                discoveryReadiness.requiredSchemaVersion || requiredSchemaVersion,
              observedSchemaVersion:
                discoveryReadiness.appliedSchemaVersion || null,
              reasons: discoveryReadiness.reasons,
              ready: discoveryReadiness.ready,
            });
            if (discoveryReadiness.appliedSchemaVersion) {
              onConvergenceEvent({
                type: 'cache_applied_version',
                nodeId,
                tableId: requiredSchemaTableId || null,
                tableName,
                requiredSchemaVersion:
                  discoveryReadiness.requiredSchemaVersion || requiredSchemaVersion,
                observedSchemaVersion: discoveryReadiness.appliedSchemaVersion,
                reasons: discoveryReadiness.reasons,
                ready: discoveryReadiness.ready,
              });
            }
            if (discoveryReadiness.ready) {
              onConvergenceEvent({
                type: 'readiness_predicate_pass',
                nodeId,
                tableId: requiredSchemaTableId || null,
                tableName,
                requiredSchemaVersion:
                  discoveryReadiness.requiredSchemaVersion || requiredSchemaVersion,
                observedSchemaVersion:
                  discoveryReadiness.appliedSchemaVersion || null,
                reasons: [],
                ready: true,
              });
            }
          }
          if (discoveryReadiness.ready) {
            return {
              ready: true,
              reasons: [],
            };
          }
          const discoveryReasonDetails =
            Array.isArray(discoveryReadiness.discoveryReasons) &&
              discoveryReadiness.discoveryReasons.length > ZERO ?
              QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_PREFIX +
                discoveryReadiness.discoveryReasons.join(
                  QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_SEPARATOR,
                ) :
              null;
          const discoveryReasonText = discoveryReadiness.reasons.length > ZERO ?
            discoveryReadiness.reasons.join('|') :
            DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN;
          return {
            ready: false,
            reasons: [
              QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
                nodeId +
                '=' +
                QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX +
                discoveryReasonText +
                (discoveryReasonDetails ?
                  '|' + discoveryReasonDetails :
                  ''),
            ],
          };
        } catch (error) {
          const canonicalReadiness = buildCanonicalReadinessFromDiscoveryError({
            error,
            requiredSchemaVersion,
          });
          await maybeCaptureBenchmarkMetadataSnapshot(
            node,
            BENCHMARK_METADATA_STAGE_DISCOVERY_ERROR,
            canonicalReadiness,
            String(error?.message || error),
          );
          recordVersionedReadiness(nodeId, canonicalReadiness);
          recordReadinessObservation(nodeId, canonicalReadiness);
          const canonicalReasonText = canonicalReadiness.reasons.length > ZERO ?
            canonicalReadiness.reasons.join('|') :
            DISCOVERY_READINESS_REASON_ADMIN_NOT_QUERYABLE;
          return {
            ready: false,
            reasons: [
              QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
                nodeId +
                '=' +
                QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX +
                canonicalReasonText +
                '|probe_error=' +
                String(error?.message || error),
            ],
          };
        }
      }

      try {
        await nodeClient.queryControl(
          node,
          tableProbeSql,
          [],
          NODE_CLIENT_TRANSIENT_CONTEXT,
        );
        return {
          ready: true,
          reasons: [],
        };
      } catch (error) {
        const probeErrorMessage = String(error?.message || error);
        if (isRetriableTableReadyError(error)) {
          try {
            const discoverySnapshot = await nodeClient.fetchServiceDiscovery(
              node,
              {
                ...NODE_CLIENT_TRANSIENT_CONTEXT,
                tableName,
                ...(typeof requiredSchemaTableId === 'string' &&
                    requiredSchemaTableId.length > ZERO ?
                  {
                    tableId: requiredSchemaTableId,
                  } :
                  {}),
                requireReadiness: true,
              },
            );
            const discoveryReadiness = resolveNodeReadinessFromServiceDiscovery(
              discoverySnapshot,
              nodeId,
              {
                admissionRuntimeOwnership: runtimeAdmissionOwnership,
              },
            );
            if (discoveryReadiness.ready) {
              // Discovery readiness is diagnostic-only here. A node is considered
              // ready for load only after the table probe itself succeeds.
              return {
                ready: false,
                reasons: [
                  QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
                    nodeId +
                    '=' +
                    probeErrorMessage,
                ],
              };
            }
            return {
              ready: false,
              reasons: [
                QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
                  nodeId +
                  '=' +
                  QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX +
                  discoveryReadiness.reasons.join('|') +
                  '|probe_error=' +
                  probeErrorMessage,
              ],
            };
          } catch (_discoveryError) {
            // Fall through to the original probe error path.
          }
        }
        return {
          ready: false,
          reasons: [
            QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
              nodeId +
              '=' +
              probeErrorMessage,
          ],
        };
      }
    },
    evaluateGlobalCondition: async () => {
      try {
        const controlSnapshot = await fetchControlSnapshotFromCandidates(
          nodeClient,
          controlSnapshotCandidates,
          NODE_CLIENT_TRANSIENT_CONTEXT,
        );
        const replicaOperations = controlSnapshot?.replicaOperations || {};
        const inFlightCount = Number.isInteger(replicaOperations.inFlightCount) ?
          replicaOperations.inFlightCount :
          ZERO;
        const partitionGroupInFlight =
          replicaOperations.partitionGroupInFlight &&
          typeof replicaOperations.partitionGroupInFlight === 'object' ?
            Object.fromEntries(
              Object.entries(replicaOperations.partitionGroupInFlight)
                .filter((entry) => Number.isInteger(entry[1]) && entry[1] >= ZERO)
                .map(([partitionGroupId, count]) => [
                  String(partitionGroupId),
                  Number(count),
                ]),
            ) :
            {};
        const operationTimelineByOperationId =
          replicaOperations.operationTimelineById &&
            typeof replicaOperations.operationTimelineById === 'object' ?
            replicaOperations.operationTimelineById :
            {};
        const leaders = controlSnapshot?.leaders &&
          typeof controlSnapshot.leaders === 'object' ?
          controlSnapshot.leaders :
          {};
        const leaderEntries = Object.entries(leaders)
          .sort((left, right) => left[0].localeCompare(right[0]));
        const leaderSignature = JSON.stringify(leaderEntries);
        if (lastLeaderSignature !== null &&
            lastLeaderSignature !== leaderSignature) {
          lastLeaderChangeAtMs = timing.now();
        }
        if (lastLeaderSignature === null) {
          lastLeaderChangeAtMs = timing.now();
        }
        lastLeaderSignature = leaderSignature;

        const leaderCoverageReady = leaderEntries.length > ZERO;
        const leaderQuietElapsedMs = timing.now() - lastLeaderChangeAtMs;
        const leadershipStable = leaderCoverageReady &&
          leaderQuietElapsedMs >= effectiveStableWindowMs;

        const reasons = [];
        if (inFlightCount > effectiveMaxReplicaOpsInFlight) {
          reasons.push(
            QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX +
              String(inFlightCount),
          );
        }
        if (!leadershipStable) {
          reasons.push(
            QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX +
              String(leaderQuietElapsedMs),
          );
        }

        gateProgressState.inFlightCount = inFlightCount;
        gateProgressState.leaderQuietElapsedMs = leaderQuietElapsedMs;
        gateProgressState.partitionGroupInFlight = partitionGroupInFlight;
        gateProgressState.operationTimelineByOperationId =
          operationTimelineByOperationId;

        return {
          ready: reasons.length === ZERO,
          reasons,
        };
      } catch (error) {
        return {
          ready: false,
          reasons: [
            QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX +
              String(error?.message || error),
          ],
        };
      }
    },
    abortIf: ({nowMs, includedNodeIds}) => {
      if (effectiveNoProgressTimeoutMs === null) {
        return null;
      }

      let progressObserved = false;
      const inFlightCount = gateProgressState.inFlightCount;
      if (Number.isInteger(inFlightCount) &&
          inFlightCount < lowestInFlightCount) {
        lowestInFlightCount = inFlightCount;
        progressObserved = true;
      }

      const leaderQuietElapsedMs = Number.isFinite(
        gateProgressState.leaderQuietElapsedMs,
      ) ?
        gateProgressState.leaderQuietElapsedMs :
        ZERO;
      if (inFlightCount === ZERO &&
          leaderQuietElapsedMs > maxLeaderQuietElapsedMs) {
        maxLeaderQuietElapsedMs = leaderQuietElapsedMs;
        progressObserved = true;
      }

      const includedCount = Array.isArray(includedNodeIds) ?
        includedNodeIds.length :
        ZERO;
      if (includedCount > maxIncludedNodeCount) {
        maxIncludedNodeCount = includedCount;
        progressObserved = true;
      }

      if (progressObserved) {
        lastProgressAtMs = nowMs;
        return null;
      }

      const stalledMs = nowMs - lastProgressAtMs;
      if (stalledMs >= effectiveNoProgressTimeoutMs) {
        return {
          abort: true,
          reason:
            QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX +
            String(stalledMs),
        };
      }
      return null;
    },
  });

  const includedNodeIds = new Set(gateResult.includedNodeIds || []);
  const readyLoadNodes = loadNodes.filter((node) => includedNodeIds.has(node.id));
  const excludedLoadNodeIds = loadNodes
    .map((node) => node.id)
    .filter((nodeId) => !includedNodeIds.has(nodeId));

  if (gateResult.mode === GATE_RESULT_MODE.ALL_READY) {
    const versionConvergence = requireCanonicalReadiness ?
      buildVersionConvergenceSnapshot() :
      null;
    return {
      mode: gateResult.mode,
      attempts: gateResult.attempts,
      stableElapsedMs: gateResult.stableElapsedMs,
      inFlightCount: ZERO,
      readyLoadNodes,
      excludedLoadNodeIds,
      partitionGroupInFlight: {
        ...gateProgressState.partitionGroupInFlight,
      },
      replicaOperationTimelineByOperationId: {
        ...gateProgressState.operationTimelineByOperationId,
      },
      reasonHistogram: gateResult.reasonHistogram || {},
      includedNodeIds: gateResult.includedNodeIds || [],
      ...(requireCanonicalReadiness ?
        {readinessTimeline: [...readinessTimeline]} :
        {}),
      ...(versionConvergence ?
        {versionConvergence} :
        {}),
    };
  }

  const reasonKeys = Object.keys(gateResult.reasonHistogram || {});
  const nodeProbeReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX),
  );
  const inFlightQueryReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX),
  );
  const inFlightCountReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX),
  );
  const leadershipReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX),
  );
  const stallReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX),
  );

  const details = [];
  if (nodeProbeReasons.length > ZERO) {
    details.push(
      QUIESCENCE_NODE_ERROR_PREFIX +
      nodeProbeReasons.join(QUIESCENCE_NODE_ERROR_SEPARATOR),
    );
  }
  if (inFlightQueryReasons.length > ZERO) {
    details.push(
      QUIESCENCE_IN_FLIGHT_ERROR_PREFIX + inFlightQueryReasons.join(','),
    );
  }
  if (inFlightCountReasons.length > ZERO) {
    details.push(
      QUIESCENCE_IN_FLIGHT_COUNT_PREFIX + inFlightCountReasons.join(','),
    );
  }
  if (leadershipReasons.length > ZERO) {
    details.push('leadershipStability=' + leadershipReasons.join(','));
  }
  if (stallReasons.length > ZERO) {
    details.push(QUIESCENCE_STALL_PREFIX + stallReasons.join(','));
  }
  if (readyLoadNodes.length > ZERO) {
    details.push(
      QUIESCENCE_READY_NODE_COUNT_PREFIX + String(readyLoadNodes.length),
    );
  }

  const errorPrefix = gateResult.aborted === true ?
    'SUT load nodes did not reach quiescent state; gate aborted due to ' +
      'stalled progress' :
    'SUT load nodes did not reach quiescent state within ' +
      timeoutMs +
      'ms';
  const error = new Error(
    errorPrefix +
      (details.length > ZERO ?
        ' (' + details.join(', ') + ')' :
        ''),
  );
  error.gateResult = {
    ...gateResult,
    partitionGroupInFlight: {
      ...gateProgressState.partitionGroupInFlight,
    },
    replicaOperationTimelineByOperationId: {
      ...gateProgressState.operationTimelineByOperationId,
    },
    includedNodeIds: gateResult.includedNodeIds || [],
    excludedNodeIds: gateResult.excludedNodeIds || [],
    reasonHistogram: gateResult.reasonHistogram || {},
    ...(requireCanonicalReadiness ?
      {readinessTimeline: [...readinessTimeline]} :
      {}),
    ...(requireCanonicalReadiness ?
      {versionConvergence: buildVersionConvergenceSnapshot()} :
      {}),
  };
  throw error;
}

async function assertClusterConsistencyWithRetry(cluster, options = {}) {
  const timing = resolveScenarioTiming(options.timing);
  const maxAttempts = Number.isInteger(options.maxAttempts) &&
    options.maxAttempts > ZERO ?
    options.maxAttempts :
    BENCHMARK_DEFAULTS.consistencyAssertMaxAttempts;
  const retryDelayMs = Number.isInteger(options.retryDelayMs) &&
    options.retryDelayMs >= ZERO ?
    options.retryDelayMs :
    BENCHMARK_DEFAULTS.consistencyAssertRetryDelayMs;
  let lastError = null;

  for (let attempt = ONE; attempt <= maxAttempts; attempt++) {
    try {
      await cluster.assertConsistency();
      return {attempts: attempt};
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        break;
      }
      if (retryDelayMs > ZERO) {
        await timing.sleep(retryDelayMs);
      }
    }
  }

  throw new Error(
    'Cluster consistency assertion failed after ' +
    maxAttempts +
    ' attempts: ' +
    String(lastError?.message || lastError),
  );
}

function buildPsqlCommand(options = {}) {
  const host = String(options.host || LOCALHOST);
  const port = Number.isInteger(options.port) ?
    options.port :
    DEFAULT_REPLICATION_PORT;
  const user = String(options.user || 'postgres');
  const password = String(options.password || '');
  const database = String(options.database || 'postgres');
  const sql = String(options.sql || '');
  const tuplesOnly = options.tuplesOnly === true ? PSQL_TUPLES_ONLY : '';

  return [
    `PGPASSWORD='${shellQuote(password)}'`,
    'psql',
    PSQL_ON_ERROR_STOP,
    tuplesOnly,
    `-h '${shellQuote(host)}'`,
    `-p ${port}`,
    `-U '${shellQuote(user)}'`,
    `-d '${shellQuote(database)}'`,
    `-c '${shellQuote(sql)}'`,
  ].filter((part) => part.length > ZERO).join(' ');
}

function buildSynchronousStandbySetting(syncReplicaAcks) {
  return SYNC_STANDBY_TEMPLATE_PREFIX +
    String(syncReplicaAcks) +
    SYNC_STANDBY_TEMPLATE_SUFFIX;
}

function buildReplicaBootstrapCommand(primaryContainerName, replicaName, benchmarkConfig) {
  const basebackupConnectionString = [
    `host=${primaryContainerName}`,
    `port=${benchmarkConfig.port}`,
    `user=${benchmarkConfig.user}`,
    `password=${benchmarkConfig.password}`,
    `dbname=${BOOTSTRAP_DB_NAME}`,
    `application_name=${replicaName}`,
  ].join(' ');

  return [
    'set -e',
    'if [ ! -s "$PGDATA/PG_VERSION" ]; then',
    '  rm -rf "$PGDATA"/*',
    `  until pg_isready -h '${shellQuote(primaryContainerName)}' ` +
      `-p ${benchmarkConfig.port} -U '${shellQuote(benchmarkConfig.user)}'; do`,
    '    sleep 1',
    '  done',
    `  pg_basebackup --dbname='${shellQuote(basebackupConnectionString)}' ` +
      '-D "$PGDATA" -Fp -Xs -P -R',
    'fi',
    POSTGRES_BINARY_PATH_EXPORT,
    `exec ${POSTGRES_ENTRYPOINT_COMMAND}`,
  ].join('\n');
}

async function configurePrimaryReplication(provider, containerId, benchmarkConfig) {
  if (benchmarkConfig.replicationFactor <= ONE) {
    return;
  }

  const syncSetting = buildSynchronousStandbySetting(
    benchmarkConfig.syncReplicaAcks,
  );
  const commands = [
    `echo "${REPLICATION_HBA_IPV4}" >> "$PGDATA/pg_hba.conf"`,
    `echo "${REPLICATION_HBA_IPV6}" >> "$PGDATA/pg_hba.conf"`,
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: `ALTER SYSTEM SET synchronous_commit = '${SYNCHRONOUS_COMMIT_ON}'`,
    }),
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: `ALTER SYSTEM SET synchronous_standby_names = '${syncSetting}'`,
    }),
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: 'SELECT pg_reload_conf()',
    }),
  ];

  const shellCommand = commands.join(' && ');
  await execShell(
    provider,
    containerId,
    shellCommand,
    'configure postgres primary replication',
  );
}

async function waitForStreamingReplicas(provider, primaryContainerId, benchmarkConfig) {
  const requiredReplicaCount = benchmarkConfig.replicationFactor - ONE;
  if (requiredReplicaCount <= ZERO) {
    return;
  }

  const deadline = Date.now() + benchmarkConfig.readyTimeoutMs;
  while (Date.now() < deadline) {
    const queryCommand = buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql:
        'SELECT count(*) FROM pg_stat_replication ' +
        `WHERE state = '${REPLICATION_STATE_STREAMING}'`,
      tuplesOnly: true,
    });

    const output = await execShell(
      provider,
      primaryContainerId,
      queryCommand,
      'check postgres replication status',
    );
    const replicaCount = Number.parseInt(String(output).trim(), 10);
    if (Number.isInteger(replicaCount) && replicaCount >= requiredReplicaCount) {
      return;
    }
    await sleep(benchmarkConfig.readyPollIntervalMs);
  }

  throw new Error(
    'Postgres replicas did not reach streaming state within ' +
    benchmarkConfig.readyTimeoutMs + 'ms',
  );
}

function resolveBenchmarkConfig(cluster) {
  return resolvePostgresBaselineBenchmarkConfig(cluster?._config?.benchmark || {});
}

function resolvePrimaryProvider(cluster) {
  const hostAssignment = cluster?._hostAssignment;
  const providers = cluster?._providers;
  const primaryIndex = Array.isArray(hostAssignment) &&
    hostAssignment.length > ZERO ?
    hostAssignment[ZERO] :
    ZERO;

  const provider = Array.isArray(providers) ?
    providers[primaryIndex] :
    null;
  assert.ok(provider, 'Primary Docker provider is not available on cluster');
  return provider;
}

function resolveCacheBaseDir(cluster) {
  const configuredOutputDir = cluster?._config?.outputDir;
  if (typeof configuredOutputDir !== 'string' ||
      configuredOutputDir.length === ZERO) {
    return null;
  }
  const normalizedPath = configuredOutputDir.trim();
  if (normalizedPath.length === ZERO) {
    return null;
  }
  const lowerPath = normalizedPath.toLowerCase();
  if (lowerPath.endsWith('.json')) {
    return dirname(normalizedPath);
  }
  return normalizedPath;
}

function resolveMachineProfile() {
  const cpuList = osCpus() || [];
  const firstCpu = cpuList[ZERO] || {};
  return {
    platform: osPlatform(),
    arch: osArch(),
    hostname: osHostname(),
    cpuCount: cpuList.length,
    cpuModel: String(firstCpu.model || 'unknown'),
  };
}

function buildBaselineCacheIdentity(benchmarkConfig, cacheBaseDir) {
  const signature = {
    schemaVersion: BASELINE_CACHE_SCHEMA_VERSION,
    engine: 'postgres',
    machine: resolveMachineProfile(),
    benchmark: {
      baselineImage: benchmarkConfig.baselineImage,
      user: benchmarkConfig.user,
      database: benchmarkConfig.database,
      port: benchmarkConfig.port,
      loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
      loadDurationMs: parseDurationToMs(benchmarkConfig.loadDuration),
      loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
      loadNodeCount: benchmarkConfig.baselineLoadNodeCount,
      tableName: benchmarkConfig.tableName,
      workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
      operations: BENCHMARK_WORKLOAD_OPERATIONS,
      replicationFactor: benchmarkConfig.replicationFactor,
      syncReplicaAcks: benchmarkConfig.syncReplicaAcks,
    },
  };
  const digest = createHash(BASELINE_CACHE_HASH_ALGORITHM)
    .update(JSON.stringify(signature))
    .digest('hex');
  const key = `v${BASELINE_CACHE_SCHEMA_VERSION}-${digest}`;
  const path = cacheBaseDir ?
    join(cacheBaseDir, BASELINE_CACHE_DIRNAME, key + BASELINE_CACHE_FILE_EXTENSION) :
    null;
  return {key, path, signature};
}

function buildBaselineCacheMetadata(cacheIdentity, fields = {}) {
  return {
    enabled: true,
    hit: false,
    key: cacheIdentity?.key || null,
    path: cacheIdentity?.path || null,
    cachedAt: null,
    reason: null,
    ...fields,
  };
}

function isValidBaselineMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return false;
  }
  const baselineOpsPerSec = Number(
    metrics.opsPerSec ?? metrics.tps,
  );
  return Number.isFinite(baselineOpsPerSec) && baselineOpsPerSec > ZERO;
}

function isCacheEntryFresh(cachedAt, ttlMs) {
  if (!Number.isFinite(ttlMs) || ttlMs <= ZERO) {
    return true;
  }
  const cachedAtMs = Date.parse(String(cachedAt || ''));
  if (!Number.isFinite(cachedAtMs)) {
    return false;
  }
  return (Date.now() - cachedAtMs) <= ttlMs;
}

async function loadBaselineMetricsFromCache(cacheIdentity, benchmarkConfig) {
  const metadata = buildBaselineCacheMetadata(cacheIdentity, {
    enabled: benchmarkConfig.cacheBaselineMetrics === true,
  });
  if (metadata.enabled !== true) {
    metadata.reason = BASELINE_CACHE_DISABLED_REASON;
    return {metrics: null, metadata};
  }
  if (benchmarkConfig.refreshBaselineMetrics === true) {
    metadata.reason = BASELINE_CACHE_REFRESH_REASON;
    return {metrics: null, metadata};
  }
  if (!cacheIdentity?.path) {
    metadata.reason = BASELINE_CACHE_MISS_REASON;
    return {metrics: null, metadata};
  }

  try {
    const raw = await readFile(cacheIdentity.path, 'utf8');
    const parsed = JSON.parse(raw);
    const cachedAt = parsed?.cachedAt || null;
    if (!isCacheEntryFresh(cachedAt, benchmarkConfig.baselineCacheTtlMs)) {
      metadata.cachedAt = cachedAt;
      metadata.reason = BASELINE_CACHE_STALE_REASON;
      return {metrics: null, metadata};
    }
    const metrics = parsed?.metrics;
    if (!isValidBaselineMetrics(metrics)) {
      metadata.cachedAt = cachedAt;
      metadata.reason = BASELINE_CACHE_INVALID_REASON;
      return {metrics: null, metadata};
    }

    metadata.hit = true;
    metadata.cachedAt = cachedAt;
    metadata.reason = BASELINE_CACHE_HIT_REASON;
    return {metrics, metadata};
  } catch (error) {
    if (error?.code === 'ENOENT') {
      metadata.reason = BASELINE_CACHE_MISS_REASON;
      return {metrics: null, metadata};
    }
    metadata.reason = BASELINE_CACHE_INVALID_REASON;
    return {metrics: null, metadata};
  }
}

async function storeBaselineMetricsInCache(
  cacheIdentity,
  benchmarkConfig,
  baselineMetrics,
) {
  const metadata = buildBaselineCacheMetadata(cacheIdentity, {
    enabled: benchmarkConfig.cacheBaselineMetrics === true,
    hit: false,
  });
  if (metadata.enabled !== true || !cacheIdentity?.path ||
      !isValidBaselineMetrics(baselineMetrics)) {
    metadata.reason = metadata.enabled === true ?
      BASELINE_CACHE_MISS_REASON :
      BASELINE_CACHE_DISABLED_REASON;
    return metadata;
  }

  const payload = {
    schemaVersion: BASELINE_CACHE_SCHEMA_VERSION,
    key: cacheIdentity.key,
    signature: cacheIdentity.signature,
    cachedAt: new Date().toISOString(),
    metrics: baselineMetrics,
  };
  await mkdir(dirname(cacheIdentity.path), {recursive: true});
  await writeFile(cacheIdentity.path, JSON.stringify(payload, null, 2), 'utf8');
  metadata.cachedAt = payload.cachedAt;
  metadata.reason = BASELINE_CACHE_STORE_REASON;
  return metadata;
}

function buildComparison(loadMetrics, baselineMetrics) {
  const sutOpsPerSec = Number(loadMetrics?.opsPerSec || ZERO);
  const sutP99LatencyMs = Number(loadMetrics?.latency?.p99 || ZERO);
  const baselineTps = Number(
    baselineMetrics?.opsPerSec ?? baselineMetrics?.tps ?? ZERO,
  );
  const baselineLatencyAvgMs = Number(
    baselineMetrics?.latency?.avg ??
      baselineMetrics?.latencyAverageMs ??
      ZERO,
  );

  return {
    sutOpsPerSec,
    sutP99LatencyMs,
    baselineTps,
    baselineLatencyAvgMs,
    throughputRatioSutToBaseline: baselineTps > ZERO ?
      sutOpsPerSec / baselineTps :
      null,
    p99LatencyRatioSutToBaselineAvg: baselineLatencyAvgMs > ZERO ?
      sutP99LatencyMs / baselineLatencyAvgMs :
      null,
  };
}

function normalizeLoadMetricNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return ZERO;
  }
  return parsed;
}

function buildWritePressureCounters(loadMetrics) {
  const source = loadMetrics?.controlPlaneWrites &&
    typeof loadMetrics.controlPlaneWrites === 'object' ?
    loadMetrics.controlPlaneWrites :
    {};
  return {
    attempted: normalizeNonNegativeInteger(source.attempted),
    coalesced: normalizeNonNegativeInteger(source.coalesced),
    unchangedSkipped: normalizeNonNegativeInteger(source.unchangedSkipped),
    failed: normalizeNonNegativeInteger(source.failed),
    timeouts: normalizeNonNegativeInteger(source.timeouts),
  };
}

function evaluateWritePressure(loadMetrics, options = {}) {
  const strictWritePressure = options.strictWritePressure === true;
  const writePressureThresholds =
    options.writePressureThresholds &&
      typeof options.writePressureThresholds === 'object' ?
      options.writePressureThresholds :
      resolveWritePressureThresholds({});
  const counters = buildWritePressureCounters(loadMetrics);
  const violations = [];

  if (Number.isInteger(writePressureThresholds.maxAttemptedWrites) &&
      counters.attempted > writePressureThresholds.maxAttemptedWrites) {
    violations.push({
      metric: 'attempted',
      observed: counters.attempted,
      threshold: writePressureThresholds.maxAttemptedWrites,
      reason: 'attempted_writes',
    });
  }
  if (Number.isInteger(writePressureThresholds.maxFailedWrites) &&
      counters.failed > writePressureThresholds.maxFailedWrites) {
    violations.push({
      metric: 'failed',
      observed: counters.failed,
      threshold: writePressureThresholds.maxFailedWrites,
      reason: 'failed_writes',
    });
  }
  if (Number.isInteger(writePressureThresholds.maxTimedOutWrites) &&
      counters.timeouts > writePressureThresholds.maxTimedOutWrites) {
    violations.push({
      metric: 'timeouts',
      observed: counters.timeouts,
      threshold: writePressureThresholds.maxTimedOutWrites,
      reason: 'timed_out_writes',
    });
  }

  return {
    schemaVersion: WRITE_PRESSURE_SCHEMA_VERSION,
    strictWritePressure,
    thresholds: writePressureThresholds,
    counters,
    breached: violations.length > ZERO,
    status: violations.length > ZERO ?
      DISCOVERY_GATE_STATUS_FAILED :
      DISCOVERY_GATE_STATUS_PASSED,
    violations,
  };
}

function formatWritePressureViolations(writePressureResult) {
  const violations = Array.isArray(writePressureResult?.violations) ?
    writePressureResult.violations :
    [];
  return violations
    .map((violation) =>
      String(violation.metric) +
        '=' +
        String(violation.observed) +
        '>' +
      String(violation.threshold))
    .join('|');
}

function evaluateAuthoritativeFallbackPolicy(cdcTelemetry, options = {}) {
  const strictAuthoritativeFallback =
    options.strictAuthoritativeFallback === true;
  const thresholds =
    options.authoritativeFallbackThresholds &&
      typeof options.authoritativeFallbackThresholds === 'object' ?
      options.authoritativeFallbackThresholds :
      {maxSteadyStateWindowCount: null};
  const summary = cdcTelemetry?.summary?.authoritativeFallback &&
    typeof cdcTelemetry.summary.authoritativeFallback === 'object' ?
    cdcTelemetry.summary.authoritativeFallback :
    {};
  const steadyStateWindowCount = normalizeNonNegativeInteger(
    summary.steadyStateWindowCount,
  );
  const windowCount = normalizeNonNegativeInteger(summary.windowCount);
  const totalCount = normalizeNonNegativeInteger(summary.totalCount);
  const violations = [];

  if (Number.isInteger(thresholds.maxSteadyStateWindowCount) &&
      thresholds.maxSteadyStateWindowCount >= ZERO &&
      steadyStateWindowCount > thresholds.maxSteadyStateWindowCount) {
    violations.push({
      metric: 'steadyStateWindowCount',
      observed: steadyStateWindowCount,
      threshold: thresholds.maxSteadyStateWindowCount,
      reason: 'steady_state_window_count',
    });
  }

  return {
    schemaVersion: AUTHORITATIVE_FALLBACK_POLICY_SCHEMA_VERSION,
    strictAuthoritativeFallback,
    thresholds,
    observed: {
      totalCount,
      windowCount,
      steadyStateWindowCount,
    },
    breached: violations.length > ZERO,
    status: violations.length > ZERO ?
      DISCOVERY_GATE_STATUS_FAILED :
      DISCOVERY_GATE_STATUS_PASSED,
    violations,
  };
}

function formatAuthoritativeFallbackViolations(authoritativeFallbackResult) {
  const violations = Array.isArray(authoritativeFallbackResult?.violations) ?
    authoritativeFallbackResult.violations :
    [];
  return violations
    .map((violation) =>
      String(violation.metric) +
        '=' +
        String(violation.observed) +
        '>' +
        String(violation.threshold))
    .join('|');
}

function evaluateOverloadPolicy(loadMetrics, options = {}) {
  const strictOverloadPolicy = options.strictOverloadPolicy === true;
  const overloadPolicy = options.overloadPolicy &&
    typeof options.overloadPolicy === 'object' ?
    options.overloadPolicy :
    resolveOverloadPolicy({});
  const rejectedOperations = Number(loadMetrics?.rejectedOperations || ZERO);
  const queueDelayP99Ms = Number(loadMetrics?.queueDelay?.p99 || ZERO);
  const violations = [];

  if (Number.isInteger(overloadPolicy.maxRejectedOperations) &&
      overloadPolicy.maxRejectedOperations >= ZERO &&
      rejectedOperations > overloadPolicy.maxRejectedOperations) {
    violations.push({
      metric: 'rejectedOperations',
      observed: rejectedOperations,
      threshold: overloadPolicy.maxRejectedOperations,
      reason: LOAD_METRIC_REJECTED_REASON_QUEUE_FULL,
    });
  }

  if (Number.isFinite(overloadPolicy.maxQueueDelayP99Ms) &&
      overloadPolicy.maxQueueDelayP99Ms >= ZERO &&
      queueDelayP99Ms > overloadPolicy.maxQueueDelayP99Ms) {
    violations.push({
      metric: 'queueDelayP99Ms',
      observed: queueDelayP99Ms,
      threshold: overloadPolicy.maxQueueDelayP99Ms,
      reason: 'queue_delay_tail',
    });
  }

  return {
    strictOverloadPolicy,
    policy: overloadPolicy,
    rejectedOperations,
    queueDelayP99Ms,
    status: violations.length > ZERO ?
      DISCOVERY_GATE_STATUS_FAILED :
      DISCOVERY_GATE_STATUS_PASSED,
    violations,
  };
}

function formatOverloadPolicyViolations(overloadPolicyResult) {
  const violations = Array.isArray(overloadPolicyResult?.violations) ?
    overloadPolicyResult.violations :
    [];
  return violations
    .map((violation) =>
      String(violation.metric) +
        '=' +
        String(violation.observed) +
        '>' +
        String(violation.threshold))
    .join('|');
}

function normalizeLoadMetrics(loadMetrics) {
  const normalizedLoadMetrics =
    loadMetrics && typeof loadMetrics === 'object' && !Array.isArray(loadMetrics) ?
      {...loadMetrics} :
      {};
  const latency = normalizedLoadMetrics.latency &&
    typeof normalizedLoadMetrics.latency === 'object' ?
    normalizedLoadMetrics.latency :
    {};
  const queueDelay = normalizedLoadMetrics.queueDelay &&
    typeof normalizedLoadMetrics.queueDelay === 'object' ?
    normalizedLoadMetrics.queueDelay :
    {};
  const rejectedByReason = normalizedLoadMetrics.rejectedByReason &&
    typeof normalizedLoadMetrics.rejectedByReason === 'object' ?
    normalizedLoadMetrics.rejectedByReason :
    {};
  const undispatchedByReason = normalizedLoadMetrics.undispatchedByReason &&
    typeof normalizedLoadMetrics.undispatchedByReason === 'object' ?
    normalizedLoadMetrics.undispatchedByReason :
    {};

  normalizedLoadMetrics.total = normalizeLoadMetricNumber(normalizedLoadMetrics.total);
  normalizedLoadMetrics.success = normalizeLoadMetricNumber(
    normalizedLoadMetrics.success,
  );
  normalizedLoadMetrics.failed = normalizeLoadMetricNumber(normalizedLoadMetrics.failed);
  normalizedLoadMetrics.errors = normalizeLoadMetricNumber(normalizedLoadMetrics.errors);
  normalizedLoadMetrics.attemptErrors = normalizeLoadMetricNumber(
    normalizedLoadMetrics.attemptErrors,
  );
  normalizedLoadMetrics.opsPerSec = normalizeLoadMetricNumber(
    normalizedLoadMetrics.opsPerSec,
  );
  normalizedLoadMetrics.latency = {
    avg: normalizeLoadMetricNumber(latency.avg),
    p50: normalizeLoadMetricNumber(latency.p50),
    p95: normalizeLoadMetricNumber(latency.p95),
    p99: normalizeLoadMetricNumber(latency.p99),
  };
  normalizedLoadMetrics.queueDelay = {
    avg: normalizeLoadMetricNumber(queueDelay.avg),
    p50: normalizeLoadMetricNumber(queueDelay.p50),
    p95: normalizeLoadMetricNumber(queueDelay.p95),
    p99: normalizeLoadMetricNumber(queueDelay.p99),
    max: normalizeLoadMetricNumber(queueDelay.max),
  };
  normalizedLoadMetrics.rejectedOperations = normalizeLoadMetricNumber(
    normalizedLoadMetrics.rejectedOperations,
  );
  normalizedLoadMetrics.rejectedByReason = {
    [LOAD_METRIC_REJECTED_REASON_QUEUE_FULL]:
      normalizeLoadMetricNumber(
        rejectedByReason[LOAD_METRIC_REJECTED_REASON_QUEUE_FULL],
      ),
  };
  normalizedLoadMetrics.targetOperations = normalizeLoadMetricNumber(
    normalizedLoadMetrics.targetOperations,
  );
  normalizedLoadMetrics.dispatchedOperations = normalizeLoadMetricNumber(
    normalizedLoadMetrics.dispatchedOperations,
  );
  normalizedLoadMetrics.undispatchedOperations = normalizeLoadMetricNumber(
    normalizedLoadMetrics.undispatchedOperations,
  );
  normalizedLoadMetrics.undispatchedByReason = {
    [LOAD_METRIC_UNDISPATCHED_REASON_CAPACITY]:
      normalizeLoadMetricNumber(
        undispatchedByReason[LOAD_METRIC_UNDISPATCHED_REASON_CAPACITY],
      ),
    [LOAD_METRIC_UNDISPATCHED_REASON_DURATION_TIMEOUT]:
      normalizeLoadMetricNumber(
        undispatchedByReason[LOAD_METRIC_UNDISPATCHED_REASON_DURATION_TIMEOUT],
      ),
    [LOAD_METRIC_UNDISPATCHED_REASON_CANCELLED]:
      normalizeLoadMetricNumber(
        undispatchedByReason[LOAD_METRIC_UNDISPATCHED_REASON_CANCELLED],
      ),
  };
  normalizedLoadMetrics.perNode = normalizedLoadMetrics.perNode &&
    typeof normalizedLoadMetrics.perNode === 'object' &&
    !Array.isArray(normalizedLoadMetrics.perNode) ?
    normalizedLoadMetrics.perNode :
    {};
  for (const [nodeId, nodeMetrics] of Object.entries(normalizedLoadMetrics.perNode)) {
    const nodeSample = nodeMetrics && typeof nodeMetrics === 'object' ?
      nodeMetrics :
      {};
    const nodeRejectedByReason = nodeSample.rejectedByReason &&
      typeof nodeSample.rejectedByReason === 'object' ?
      nodeSample.rejectedByReason :
      {};
    normalizedLoadMetrics.perNode[nodeId] = {
      ...nodeSample,
      queuePressureSignals: normalizeLoadMetricNumber(
        nodeSample.queuePressureSignals,
      ),
      rejected: normalizeLoadMetricNumber(nodeSample.rejected),
      rejectedByReason: {
        [LOAD_METRIC_REJECTED_REASON_QUEUE_FULL]:
          normalizeLoadMetricNumber(
            nodeRejectedByReason[LOAD_METRIC_REJECTED_REASON_QUEUE_FULL],
          ),
      },
    };
  }

  return normalizedLoadMetrics;
}

function normalizeDiagnosticsSampleCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return ZERO;
  }
  return Math.max(ZERO, Math.floor(parsed));
}

function resolveDiagnosticsCoverage(convergence) {
  const sampleCounts =
    convergence?.diagnostics?.writePath?.sampleCounts &&
    typeof convergence.diagnostics.writePath.sampleCounts === 'object' ?
      convergence.diagnostics.writePath.sampleCounts :
      {};
  const writePathSamples = {
    [DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE]: normalizeDiagnosticsSampleCount(
      sampleCounts[DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE],
    ),
    [DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER]: normalizeDiagnosticsSampleCount(
      sampleCounts[DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER],
    ),
    [DIAGNOSTICS_SAMPLE_KEY_SQLITE]: normalizeDiagnosticsSampleCount(
      sampleCounts[DIAGNOSTICS_SAMPLE_KEY_SQLITE],
    ),
  };
  const sampleCount = (
    writePathSamples[DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE] +
    writePathSamples[DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER] +
    writePathSamples[DIAGNOSTICS_SAMPLE_KEY_SQLITE]
  );
  if (sampleCount > ZERO) {
    return {
      status: DIAGNOSTICS_COVERAGE_STATUS_AVAILABLE,
      reason: null,
      sampleCount,
      writePathSamples,
    };
  }
  return {
    status: DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE,
    reason: DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED,
    sampleCount: ZERO,
    writePathSamples,
  };
}

function resolveSutPerNodeBudget(benchmarkConfig, nodeClientPolicySnapshot) {
  if (Number.isInteger(benchmarkConfig.loadNodeMaxInFlight) &&
      benchmarkConfig.loadNodeMaxInFlight > ZERO) {
    return benchmarkConfig.loadNodeMaxInFlight;
  }
  const policyBudget = Number(
    nodeClientPolicySnapshot?.[NODE_CLIENT_CHANNEL.LOAD]?.maxInFlightPerNode,
  );
  if (Number.isInteger(policyBudget) && policyBudget > ZERO) {
    return policyBudget;
  }
  return null;
}

function resolveBaselinePerNodeBudget(
  benchmarkConfig,
  baselineLoadNodeCount,
  baselinePoolMaxConnections,
) {
  if (Number.isInteger(benchmarkConfig?.loadNodeMaxInFlight) &&
      benchmarkConfig.loadNodeMaxInFlight > ZERO) {
    return benchmarkConfig.loadNodeMaxInFlight;
  }
  const loadNodeCount = Number.isInteger(baselineLoadNodeCount) &&
    baselineLoadNodeCount > ZERO ?
    baselineLoadNodeCount :
    ONE;
  const poolMaxConnections = Number.isInteger(baselinePoolMaxConnections) &&
    baselinePoolMaxConnections > ZERO ?
    baselinePoolMaxConnections :
    ONE;
  return Math.max(
    ONE,
    Math.ceil(poolMaxConnections / loadNodeCount),
  );
}

function buildLoadParity({
  benchmarkConfig,
  benchmarkTableName,
  sutLoadNodes,
  baselineLoadNodeCount,
  baselinePoolMaxConnections,
  nodeClientPolicySnapshot,
}) {
  const effectiveSutLoadNodeCount = Array.isArray(sutLoadNodes) ?
    sutLoadNodes.length :
    ZERO;
  const effectiveBaselineLoadNodeCount =
    Number.isInteger(baselineLoadNodeCount) && baselineLoadNodeCount > ZERO ?
      baselineLoadNodeCount :
      ONE;
  const sutPerNodeBudget = resolveSutPerNodeBudget(
    benchmarkConfig,
    nodeClientPolicySnapshot,
  );
  const baselinePerNodeBudget = resolveBaselinePerNodeBudget(
    benchmarkConfig,
    effectiveBaselineLoadNodeCount,
    baselinePoolMaxConnections,
  );

  const configured = {
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    operations: BENCHMARK_WORKLOAD_OPERATIONS,
    durationSeconds: parseDurationToMs(benchmarkConfig.loadDuration) / 1000,
    targetOpsPerSec: benchmarkConfig.loadOpsPerSec,
    loadNodeCount: benchmarkConfig.baselineLoadNodeCount,
    loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
    loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
    tableName: benchmarkConfig.tableName,
  };
  const effective = {
    sutLoadNodeCount: effectiveSutLoadNodeCount,
    baselineLoadNodeCount: effectiveBaselineLoadNodeCount,
    sutPerNodeBudget,
    baselinePerNodeBudget,
    tableName: benchmarkTableName,
  };
  const reasons = [];
  if (effectiveSutLoadNodeCount !== effectiveBaselineLoadNodeCount) {
    reasons.push({
      code: LOAD_PARITY_REASON_LOAD_FANOUT_MISMATCH,
      expected: effectiveBaselineLoadNodeCount,
      actual: effectiveSutLoadNodeCount,
    });
  }
  if (Number.isInteger(sutPerNodeBudget) &&
      Number.isInteger(baselinePerNodeBudget) &&
      sutPerNodeBudget !== baselinePerNodeBudget) {
    reasons.push({
      code: LOAD_PARITY_REASON_PER_NODE_BUDGET_MISMATCH,
      expected: baselinePerNodeBudget,
      actual: sutPerNodeBudget,
    });
  }
  if (benchmarkConfig.tableName !== benchmarkTableName) {
    reasons.push({
      code: LOAD_PARITY_REASON_TABLE_NAME_MISMATCH,
      expected: benchmarkTableName,
      actual: benchmarkConfig.tableName,
    });
  }

  return {
    status: reasons.length === ZERO ?
      LOAD_PARITY_STATUS_MATCHED :
      LOAD_PARITY_STATUS_MISMATCHED,
    reasons,
    configured,
    effective,
  };
}

function formatLoadParityReasons(loadParity) {
  const reasons = Array.isArray(loadParity?.reasons) ?
    loadParity.reasons :
    [];
  if (reasons.length === ZERO) {
    return 'unknown';
  }
  return reasons.map((reason) =>
    String(reason?.code || 'unknown') +
    '(expected=' + String(reason?.expected) +
    ',actual=' + String(reason?.actual) + ')')
    .join(', ');
}

function buildEffectiveAdmissionPolicy({
  benchmarkConfig,
  nodeClientPolicySnapshot,
  nodeClientChannelPolicyOverrides,
}) {
  const loadPolicy = nodeClientPolicySnapshot?.[NODE_CLIENT_CHANNEL.LOAD] &&
    typeof nodeClientPolicySnapshot[NODE_CLIENT_CHANNEL.LOAD] === 'object' ?
    nodeClientPolicySnapshot[NODE_CLIENT_CHANNEL.LOAD] :
    {};
  const loadPolicyOverrides =
    nodeClientChannelPolicyOverrides?.[NODE_CLIENT_CHANNEL.LOAD] &&
    typeof nodeClientChannelPolicyOverrides[NODE_CLIENT_CHANNEL.LOAD] === 'object' ?
      nodeClientChannelPolicyOverrides[NODE_CLIENT_CHANNEL.LOAD] :
      {};
  const benchmarkLoadNodeMaxInFlight =
    Number.isInteger(benchmarkConfig.loadNodeMaxInFlight) &&
      benchmarkConfig.loadNodeMaxInFlight > ZERO ?
      benchmarkConfig.loadNodeMaxInFlight :
      null;
  const overrideLoadNodeMaxInFlight =
    Number.isInteger(loadPolicyOverrides.maxInFlightPerNode) &&
      loadPolicyOverrides.maxInFlightPerNode > ZERO ?
      loadPolicyOverrides.maxInFlightPerNode :
      null;
  const conflicts = [];
  if (Number.isInteger(benchmarkLoadNodeMaxInFlight) &&
      Number.isInteger(overrideLoadNodeMaxInFlight) &&
      benchmarkLoadNodeMaxInFlight !== overrideLoadNodeMaxInFlight) {
    conflicts.push({
      code: ADMISSION_CONFLICT_LOAD_NODE_MAX_IN_FLIGHT,
      benchmarkValue: benchmarkLoadNodeMaxInFlight,
      overrideValue: overrideLoadNodeMaxInFlight,
    });
  }
  return {
    sources: {
      benchmark: {
        loadNodeMaxInFlight: benchmarkLoadNodeMaxInFlight,
        loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
        nodeFailureThreshold: benchmarkConfig.nodeFailureThreshold,
        nodeFailureCooldownMs: benchmarkConfig.nodeFailureCooldownMs,
      },
      channelOverrides: {
        loadMaxInFlightPerNode: overrideLoadNodeMaxInFlight,
        loadTimeoutMs:
          Number.isInteger(loadPolicyOverrides.timeoutMs) &&
            loadPolicyOverrides.timeoutMs > ZERO ?
            loadPolicyOverrides.timeoutMs :
            null,
        loadCircuitBreakerThreshold:
          Number.isInteger(loadPolicyOverrides.circuitBreakerThreshold) &&
            loadPolicyOverrides.circuitBreakerThreshold > ZERO ?
            loadPolicyOverrides.circuitBreakerThreshold :
            null,
        loadCooldownMs:
          Number.isInteger(loadPolicyOverrides.cooldownMs) &&
            loadPolicyOverrides.cooldownMs > ZERO ?
            loadPolicyOverrides.cooldownMs :
            null,
      },
    },
    resolved: {
      loadMaxInFlightPerNode:
        Number.isInteger(loadPolicy.maxInFlightPerNode) &&
          loadPolicy.maxInFlightPerNode > ZERO ?
          loadPolicy.maxInFlightPerNode :
          null,
      loadTimeoutMs:
        Number.isInteger(loadPolicy.timeoutMs) &&
          loadPolicy.timeoutMs > ZERO ?
          loadPolicy.timeoutMs :
          null,
      loadCircuitBreakerThreshold:
        Number.isInteger(loadPolicy.circuitBreakerThreshold) &&
          loadPolicy.circuitBreakerThreshold > ZERO ?
          loadPolicy.circuitBreakerThreshold :
          null,
      loadCooldownMs:
        Number.isInteger(loadPolicy.cooldownMs) &&
          loadPolicy.cooldownMs > ZERO ?
          loadPolicy.cooldownMs :
          null,
      loadRetryBudget:
        Number.isInteger(loadPolicy.retryBudget) &&
          loadPolicy.retryBudget >= ZERO ?
          loadPolicy.retryBudget :
          null,
    },
    conflicts,
  };
}

function createInitialPostLoadDrain(effectiveSutLoadNodes, excludedNodeIds) {
  return {
    status: POST_LOAD_DRAIN_STATUS_OK,
    mode: GATE_RESULT_MODE.ALL_READY,
    attempts: ZERO,
    stableElapsedMs: ZERO,
    error: null,
    reasonHistogram: {},
    partitionGroupInFlight: {},
    includedNodeIds: effectiveSutLoadNodes.map((node) => node.id),
    excludedNodeIds: [...excludedNodeIds],
  };
}

function sumPartitionGroupInFlight(partitionGroupInFlight = {}) {
  let total = ZERO;
  if (!partitionGroupInFlight || typeof partitionGroupInFlight !== 'object') {
    return total;
  }
  for (const count of Object.values(partitionGroupInFlight)) {
    total += normalizeNonNegativeInteger(count);
  }
  return total;
}

function buildPreLoadRebalancingPressure(quiescenceResult, benchmarkConfig) {
  return {
    mode: quiescenceResult?.mode || 'unknown',
    attempts: normalizeNonNegativeInteger(quiescenceResult?.attempts),
    stableElapsedMs: normalizeNonNegativeInteger(quiescenceResult?.stableElapsedMs),
    maxReplicaOpsInFlightThreshold:
      normalizeNonNegativeInteger(benchmarkConfig?.preloadMaxReplicaOpsInFlight),
    inFlightReplicaOps: normalizeNonNegativeInteger(quiescenceResult?.inFlightCount),
    partitionGroupInFlight: quiescenceResult?.partitionGroupInFlight || {},
    reasonHistogram: quiescenceResult?.reasonHistogram || {},
  };
}

function buildPostLoadDrainRebalancingPressure(postLoadDrain, benchmarkConfig) {
  const partitionGroupInFlight = postLoadDrain?.partitionGroupInFlight || {};
  return {
    status: String(postLoadDrain?.status || POST_LOAD_DRAIN_STATUS_FAILED),
    mode: String(postLoadDrain?.mode || POST_LOAD_DRAIN_MODE_FAILED),
    attempts: normalizeNonNegativeInteger(postLoadDrain?.attempts),
    stableElapsedMs: normalizeNonNegativeInteger(postLoadDrain?.stableElapsedMs),
    maxReplicaOpsInFlightThreshold:
      normalizeNonNegativeInteger(benchmarkConfig?.loadRebalanceMaxReplicaOpsInFlight),
    inFlightReplicaOps: sumPartitionGroupInFlight(partitionGroupInFlight),
    partitionGroupInFlight,
    reasonHistogram: postLoadDrain?.reasonHistogram || {},
    error: postLoadDrain?.error || null,
  };
}

function buildLeaderSignatureFromSnapshot(snapshot) {
  const leaders = snapshot?.leaders && typeof snapshot.leaders === 'object' ?
    snapshot.leaders :
    {};
  return JSON.stringify(
    Object.entries(leaders)
      .map(([partitionId, nodeId]) => [String(partitionId), String(nodeId)])
      .sort((left, right) => left[0].localeCompare(right[0])),
  );
}

function normalizeRoutingAdmissionReasons(reasons) {
  const normalizedReasons = Array.isArray(reasons) ?
    reasons
      .map((reason) => String(reason || '').trim())
      .filter((reason) => reason.length > ZERO) :
    [];
  return uniqueSorted(normalizedReasons);
}

function buildLoadRoutingAdmissionState(options = {}) {
  const admittedNodeIds = uniqueSorted(
    (Array.isArray(options.admittedNodeIds) ? options.admittedNodeIds : [])
      .map((nodeId) => String(nodeId || '').trim())
      .filter((nodeId) => nodeId.length > ZERO),
  );
  const stateByNodeId = {};
  for (const nodeId of admittedNodeIds) {
    stateByNodeId[nodeId] = {
      nodeId,
      ready: true,
      reasons: [],
      source: null,
      observedAtMs: null,
    };
  }
  return {
    schemaVersion: LOAD_ROUTING_ADMISSION_SCHEMA_VERSION,
    admittedNodeIds,
    sampleCount: ZERO,
    blockedSampleCount: ZERO,
    allowedSampleCount: ZERO,
    stateByNodeId,
    transitions: [],
    probeErrors: [],
  };
}

function updateRoutingAdmissionNodeState(routingAdmission, nodeId, nextState = {}) {
  if (!routingAdmission || !routingAdmission.stateByNodeId) {
    return;
  }
  const normalizedNodeId = String(nodeId || '').trim();
  if (normalizedNodeId.length === ZERO) {
    return;
  }
  if (!routingAdmission.admittedNodeIds.includes(normalizedNodeId)) {
    routingAdmission.admittedNodeIds.push(normalizedNodeId);
    routingAdmission.admittedNodeIds = uniqueSorted(
      routingAdmission.admittedNodeIds,
    );
  }

  const previousState = routingAdmission.stateByNodeId[normalizedNodeId] || null;
  const normalizedState = {
    nodeId: normalizedNodeId,
    ready: nextState.ready === true,
    reasons: normalizeRoutingAdmissionReasons(nextState.reasons),
    source: typeof nextState.source === 'string' && nextState.source.length > ZERO ?
      nextState.source :
      null,
    observedAtMs: normalizeNonNegativeInteger(nextState.observedAtMs),
  };
  routingAdmission.stateByNodeId[normalizedNodeId] = normalizedState;

  const previousSignature = previousState ?
    JSON.stringify({
      ready: previousState.ready === true,
      reasons: normalizeRoutingAdmissionReasons(previousState.reasons),
      source:
        typeof previousState.source === 'string' && previousState.source.length > ZERO ?
          previousState.source :
          null,
    }) :
    null;
  const nextSignature = JSON.stringify({
    ready: normalizedState.ready,
    reasons: normalizedState.reasons,
    source: normalizedState.source,
  });
  if (previousSignature === nextSignature) {
    return;
  }

  routingAdmission.transitions.push({
    nodeId: normalizedNodeId,
    observedAtMs: normalizedState.observedAtMs,
    previous: previousState ? {
      ready: previousState.ready === true,
      reasons: normalizeRoutingAdmissionReasons(previousState.reasons),
      source:
        typeof previousState.source === 'string' &&
          previousState.source.length > ZERO ?
          previousState.source :
          null,
    } :
      null,
    next: {
      ready: normalizedState.ready,
      reasons: normalizedState.reasons,
      source: normalizedState.source,
    },
  });
  if (routingAdmission.transitions.length > LOAD_ROUTING_ADMISSION_MAX_TRANSITIONS) {
    routingAdmission.transitions.shift();
  }
}

function buildRoutingAdmissionContext(tableName) {
  const normalizedTableName = normalizeTableName(tableName, '');
  return normalizedTableName.length > ZERO ?
    {
      ...NODE_CLIENT_TRANSIENT_CONTEXT,
      [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME]: normalizedTableName,
    } :
    NODE_CLIENT_TRANSIENT_CONTEXT;
}

function buildRoutingAdmissionBlockedError(nodeId, reasons) {
  const normalizedNodeId = String(nodeId || DISCOVERY_UNKNOWN_NODE_ID);
  const normalizedReasons = normalizeRoutingAdmissionReasons(reasons);
  const error = new Error(
    LOAD_ROUTING_ADMISSION_ERROR_MESSAGE_PREFIX +
      ': node=' + normalizedNodeId +
      ', reasons=' +
      (normalizedReasons.length > ZERO ?
        normalizedReasons.join(LOAD_ROUTING_ADMISSION_REASON_SEPARATOR) :
        DISCOVERY_READINESS_REASON_ROUTING_NOT_READY),
  );
  error.code = LOAD_ROUTING_ADMISSION_ERROR_CODE;
  error.nodeId = normalizedNodeId;
  error.reasons = normalizedReasons;
  return error;
}

function buildLoadRebalancingPressureState(options = {}) {
  return {
    schemaVersion: REBALANCING_PRESSURE_SCHEMA_VERSION,
    monitoredNodeIds: Array.isArray(options.monitoredNodeIds) ?
      [...options.monitoredNodeIds] :
      [],
    sampleCount: ZERO,
    maxReplicaOpsInFlight: ZERO,
    totalLeaderChanges: ZERO,
    maxLeaderChangesWithinCooldown: ZERO,
    cooldownMs: normalizeNonNegativeInteger(options.cooldownMs),
    minLeaderChangeDelta:
      Number.isInteger(options.minLeaderChangeDelta) &&
        options.minLeaderChangeDelta > ZERO ?
        options.minLeaderChangeDelta :
        BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT,
    pollIntervalMs:
      Number.isInteger(options.pollIntervalMs) &&
        options.pollIntervalMs > ZERO ?
        options.pollIntervalMs :
        BENCHMARK_LOAD_REBALANCE_MONITOR_POLL_INTERVAL_MS_DEFAULT,
    maxReplicaOpsInFlightLimit:
      normalizeNonNegativeInteger(options.maxReplicaOpsInFlightLimit),
    startedAtMs: Date.now(),
    endedAtMs: null,
    snapshotErrors: [],
    samples: [],
    pinning: {
      enabled: options.pinningEnabled === true,
      bypassed: options.pinningBypassed === true,
      violated: false,
      cancelledLoad: false,
      violationReasons: [],
    },
    routingAdmission: buildLoadRoutingAdmissionState({
      admittedNodeIds: options.admittedNodeIds,
    }),
  };
}

function formatLoadRebalancingPinningReasons(reasons) {
  const normalizedReasons = Array.isArray(reasons) ?
    reasons.map((reason) => String(reason)) :
    [];
  return normalizedReasons.length > ZERO ?
    normalizedReasons.join('|') :
    'unknown';
}

function startLoadRebalancingPressureMonitor(options = {}) {
  const nodeClient = options.nodeClient;
  const loadNodes = Array.isArray(options.loadNodes) ? options.loadNodes : [];
  const benchmarkConfig = options.benchmarkConfig || {};
  const loadRun = options.loadRun || null;
  const routingAdmissionContext = buildRoutingAdmissionContext(options.tableName);
  const admittedNodeIds = uniqueSorted(
    loadNodes
      .map((node) => String(node?.id || '').trim())
      .filter((nodeId) => nodeId.length > ZERO),
  );
  const controlSnapshotCandidates = resolveControlSnapshotCandidates(
    options.seedNode || null,
    loadNodes,
  );
  const routingSnapshotCandidates = resolveControlSnapshotCandidates(
    options.seedNode || null,
    loadNodes,
  );
  const pressure = buildLoadRebalancingPressureState({
    monitoredNodeIds: controlSnapshotCandidates.map((node) => String(node.id)),
    cooldownMs: benchmarkConfig.rebalanceHysteresisCooldownMs,
    minLeaderChangeDelta: benchmarkConfig.rebalanceHysteresisMinDelta,
    pollIntervalMs: benchmarkConfig.loadRebalanceMonitorPollIntervalMs,
    maxReplicaOpsInFlightLimit: benchmarkConfig.loadRebalanceMaxReplicaOpsInFlight,
    pinningEnabled: benchmarkConfig.pinRebalancingDuringLoad === true,
    pinningBypassed: benchmarkConfig.allowLoadRebalancePinningBypass === true,
    admittedNodeIds,
  });

  let lastLeaderSignature = null;
  const leaderChangeAtMs = [];
  let stopRequested = false;
  let sleepTimerId = null;
  let sleepResolve = null;

  function waitForNextPoll() {
    return new Promise((resolve) => {
      sleepResolve = resolve;
      sleepTimerId = setTimeout(() => {
        sleepTimerId = null;
        sleepResolve = null;
        resolve();
      }, pressure.pollIntervalMs);
      if (typeof sleepTimerId.unref === 'function') {
        sleepTimerId.unref();
      }
    });
  }

  const monitorLoop = (async () => {
    while (!stopRequested) {
      const observedAtMs = Date.now();
      const sample = {
        observedAtMs,
        inFlightReplicaOps: ZERO,
        leaderChangesWithinCooldown: ZERO,
        routingAdmissionBlockedCount: ZERO,
        routingAdmissionBlockedNodeIds: [],
      };
      try {
        const snapshot = await fetchControlSnapshotFromCandidates(
          nodeClient,
          controlSnapshotCandidates,
          NODE_CLIENT_TRANSIENT_CONTEXT,
        );
        const replicaOperations = snapshot?.replicaOperations || {};
        const inFlightReplicaOps = normalizeNonNegativeInteger(
          replicaOperations?.inFlightCount,
        );
        sample.inFlightReplicaOps = inFlightReplicaOps;
        pressure.maxReplicaOpsInFlight = Math.max(
          pressure.maxReplicaOpsInFlight,
          inFlightReplicaOps,
        );

        const leaderSignature = buildLeaderSignatureFromSnapshot(snapshot);
        if (lastLeaderSignature !== null &&
            leaderSignature !== lastLeaderSignature) {
          leaderChangeAtMs.push(observedAtMs);
          pressure.totalLeaderChanges += ONE;
        }
        lastLeaderSignature = leaderSignature;

        const cooldownFloorMs = observedAtMs - pressure.cooldownMs;
        while (leaderChangeAtMs.length > ZERO &&
            leaderChangeAtMs[ZERO] < cooldownFloorMs) {
          leaderChangeAtMs.shift();
        }
        const leaderChangesWithinCooldown = leaderChangeAtMs.length;
        sample.leaderChangesWithinCooldown = leaderChangesWithinCooldown;
        pressure.maxLeaderChangesWithinCooldown = Math.max(
          pressure.maxLeaderChangesWithinCooldown,
          leaderChangesWithinCooldown,
        );

        if (pressure.pinning.enabled &&
            !pressure.pinning.bypassed &&
            !pressure.pinning.violated) {
          const violationReasons = [];
          if (inFlightReplicaOps > pressure.maxReplicaOpsInFlightLimit) {
            violationReasons.push(
              REBALANCING_PINNING_REASON_IN_FLIGHT_REPLICA_OPS +
                ':observed=' + String(inFlightReplicaOps) +
                ',limit=' + String(pressure.maxReplicaOpsInFlightLimit),
            );
          }
          if (leaderChangesWithinCooldown >= pressure.minLeaderChangeDelta) {
            violationReasons.push(
              REBALANCING_PINNING_REASON_LEADERSHIP_CHURN +
                ':observed=' + String(leaderChangesWithinCooldown) +
                ',min_delta=' + String(pressure.minLeaderChangeDelta) +
                ',cooldown_ms=' + String(pressure.cooldownMs),
            );
          }
          if (violationReasons.length > ZERO) {
            pressure.pinning.violated = true;
            for (const reason of violationReasons) {
              if (!pressure.pinning.violationReasons.includes(reason)) {
                pressure.pinning.violationReasons.push(reason);
              }
            }
            if (loadRun && typeof loadRun.cancel === 'function') {
              pressure.pinning.cancelledLoad = true;
              loadRun.cancel();
            }
          }
        }
      } catch (error) {
        pressure.snapshotErrors.push(String(error?.message || error));
        sample.error = String(error?.message || error);
      }
      let routingDiscoverySnapshot = null;
      let routingDiscoveryError = null;
      try {
        routingDiscoverySnapshot = await fetchServiceDiscoveryFromCandidates(
          nodeClient,
          routingSnapshotCandidates,
          routingAdmissionContext,
        );
      } catch (error) {
        routingDiscoveryError = error;
      }
      const routingAdmission = pressure.routingAdmission;
      let blockedCount = ZERO;
      const blockedNodeIds = [];
      const routingDiscoveryErrorMessage =
        routingDiscoveryError ?
          String(routingDiscoveryError?.message || routingDiscoveryError) :
          null;
      for (const node of loadNodes) {
        const nodeId = typeof node?.id === 'string' && node.id.length > ZERO ?
          node.id :
          DISCOVERY_UNKNOWN_NODE_ID;
        try {
          if (!routingDiscoverySnapshot) {
            throw new Error(
              routingDiscoveryErrorMessage ||
                ROUTING_DISCOVERY_NO_SNAPSHOT_CANDIDATE,
            );
          }
          const readiness = resolveNodeReadinessFromServiceDiscovery(
            routingDiscoverySnapshot,
            nodeId,
            {
              enforceCanonicalRouteReadiness: true,
              adminQueryable: true,
              requiredSchemaVersion: options.requiredSchemaVersion,
              admissionRuntimeOwnership: options.admissionRuntimeOwnership,
            },
          );
          const ready = readiness?.ready === true;
          const reasons = ready ?
            [] :
            (Array.isArray(readiness?.reasons) && readiness.reasons.length > ZERO ?
              readiness.reasons :
              [DISCOVERY_READINESS_REASON_ROUTING_NOT_READY]);
          updateRoutingAdmissionNodeState(routingAdmission, nodeId, {
            ready,
            reasons,
            source: LOAD_ROUTING_ADMISSION_SOURCE_DISCOVERY,
            observedAtMs,
          });
          if (!ready) {
            blockedCount += ONE;
            blockedNodeIds.push(nodeId);
          }
        } catch (error) {
          const reason = LOAD_ROUTING_ADMISSION_REASON_PROBE_ERROR_PREFIX +
            truncateDiscoveryErrorMessage(String(error?.message || error));
          updateRoutingAdmissionNodeState(routingAdmission, nodeId, {
            ready: false,
            reasons: [reason],
            source: LOAD_ROUTING_ADMISSION_SOURCE_PROBE_ERROR,
            observedAtMs,
          });
          routingAdmission.probeErrors.push({
            nodeId,
            observedAtMs,
            error: String(error?.message || error),
          });
          if (routingAdmission.probeErrors.length > LOAD_ROUTING_ADMISSION_MAX_PROBE_ERRORS) {
            routingAdmission.probeErrors.shift();
          }
          blockedCount += ONE;
          blockedNodeIds.push(nodeId);
        }
      }
      routingAdmission.sampleCount += ONE;
      if (blockedCount > ZERO) {
        routingAdmission.blockedSampleCount += ONE;
      } else {
        routingAdmission.allowedSampleCount += ONE;
      }
      sample.routingAdmissionBlockedCount = blockedCount;
      sample.routingAdmissionBlockedNodeIds = uniqueSorted(blockedNodeIds);

      pressure.samples.push(sample);
      pressure.sampleCount = pressure.samples.length;
      if (stopRequested) {
        break;
      }
      await waitForNextPoll();
    }
  })();

  return {
    assertLoadNodeAdmitted(nodeId) {
      const normalizedNodeId = typeof nodeId === 'string' && nodeId.length > ZERO ?
        nodeId :
        DISCOVERY_UNKNOWN_NODE_ID;
      const state = pressure.routingAdmission?.stateByNodeId?.[normalizedNodeId];
      if (!state || state.ready === true) {
        return;
      }
      throw buildRoutingAdmissionBlockedError(normalizedNodeId, state.reasons);
    },
    async stop() {
      stopRequested = true;
      if (sleepTimerId !== null) {
        clearTimeout(sleepTimerId);
        sleepTimerId = null;
      }
      if (typeof sleepResolve === 'function') {
        const resolveSleep = sleepResolve;
        sleepResolve = null;
        resolveSleep();
      }
      await monitorLoop;
      pressure.endedAtMs = Date.now();
      pressure.sampleCount = pressure.samples.length;
      return pressure;
    },
  };
}

function isCriticalRebalancingSample(sample = {}, pressure = {}) {
  const inFlightReplicaOps = normalizeNonNegativeInteger(
    sample.inFlightReplicaOps,
  );
  const leaderChangesWithinCooldown = normalizeNonNegativeInteger(
    sample.leaderChangesWithinCooldown,
  );
  const maxReplicaOpsInFlightLimit = normalizeNonNegativeInteger(
    pressure.maxReplicaOpsInFlightLimit,
  );
  const minLeaderChangeDelta =
    Number.isInteger(pressure.minLeaderChangeDelta) &&
      pressure.minLeaderChangeDelta > ZERO ?
      pressure.minLeaderChangeDelta :
      BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT;
  return inFlightReplicaOps > maxReplicaOpsInFlightLimit &&
    leaderChangesWithinCooldown >= minLeaderChangeDelta;
}

function buildCriticalRebalancingSignalMessage(criticalState) {
  return 'Critical rebalancing state detected: episodes=' +
    String(criticalState.sustainedEpisodeCount) +
    ',max_streak=' +
    String(criticalState.maxConsecutiveCriticalSamples) +
    ',threshold=' +
    String(criticalState.sustainedSampleThreshold);
}

function buildRebalancingCriticalState(rebalancingPressure, benchmarkConfig = {}) {
  const pressure = rebalancingPressure &&
    typeof rebalancingPressure === 'object' ?
    rebalancingPressure :
    {};
  const samples = Array.isArray(pressure.samples) ? pressure.samples : [];
  const sustainedSampleThreshold = Number.isInteger(
    benchmarkConfig.criticalRebalancingSustainedSamples,
  ) && benchmarkConfig.criticalRebalancingSustainedSamples > ZERO ?
    benchmarkConfig.criticalRebalancingSustainedSamples :
    BENCHMARK_CRITICAL_REBALANCING_SUSTAINED_SAMPLES_DEFAULT;

  let criticalSampleCount = ZERO;
  let maxConsecutiveCriticalSamples = ZERO;
  let consecutiveCriticalSamples = ZERO;
  let sustainedEpisodeCount = ZERO;
  for (const sample of samples) {
    if (isCriticalRebalancingSample(sample, pressure)) {
      criticalSampleCount += ONE;
      consecutiveCriticalSamples += ONE;
      maxConsecutiveCriticalSamples = Math.max(
        maxConsecutiveCriticalSamples,
        consecutiveCriticalSamples,
      );
      continue;
    }
    if (consecutiveCriticalSamples >= sustainedSampleThreshold) {
      sustainedEpisodeCount += ONE;
    }
    consecutiveCriticalSamples = ZERO;
  }
  if (consecutiveCriticalSamples >= sustainedSampleThreshold) {
    sustainedEpisodeCount += ONE;
  }
  const sustained = sustainedEpisodeCount > ZERO;
  const criticalState = {
    schemaVersion: REBALANCING_CRITICAL_STATE_SCHEMA_VERSION,
    sampleCount: samples.length,
    sustainedSampleThreshold,
    criticalSampleCount,
    maxConsecutiveCriticalSamples,
    sustainedEpisodeCount,
    sustained,
    bypassed: pressure?.pinning?.bypassed === true,
    messages: [],
  };
  if (sustained) {
    criticalState.messages.push(
      buildCriticalRebalancingSignalMessage(criticalState),
    );
  }
  return criticalState;
}

async function resolveBaselineMetrics({
  cluster,
  benchmarkConfig,
  baselineLoadNodeCountOverride,
  scenarioOverrides,
  provider,
  networkName,
  benchmarkTableName,
}) {
  const effectiveBaselineLoadNodeCount =
    Number.isInteger(baselineLoadNodeCountOverride) &&
      baselineLoadNodeCountOverride > ZERO ?
      baselineLoadNodeCountOverride :
      benchmarkConfig.baselineLoadNodeCount;
  const baselineBenchmarkConfig =
    effectiveBaselineLoadNodeCount === benchmarkConfig.baselineLoadNodeCount ?
      benchmarkConfig :
      {
        ...benchmarkConfig,
        baselineLoadNodeCount: effectiveBaselineLoadNodeCount,
      };
  const cacheBaseDir = resolveCacheBaseDir(cluster);
  const baselineCacheIdentity = buildBaselineCacheIdentity(
    baselineBenchmarkConfig,
    cacheBaseDir,
  );
  let cacheMetadata = buildBaselineCacheMetadata(
    baselineCacheIdentity,
    {enabled: baselineBenchmarkConfig.cacheBaselineMetrics === true},
  );
  const cachedBaseline = await loadBaselineMetricsFromCache(
    baselineCacheIdentity,
    baselineBenchmarkConfig,
  );
  cacheMetadata = cachedBaseline.metadata;

  const baselineContainers = [];
  let baselinePrimaryContainerId = null;
  let baselinePrimaryContainerIp = null;
  const baselineReplicaContainerIps = [];
  let baselineMetrics = cachedBaseline.metrics || null;
  let baselineLoadNodeCount = baselineBenchmarkConfig.baselineLoadNodeCount;
  let baselinePoolMaxConnections = baselineBenchmarkConfig.loadMaxInFlight;

  if (!baselineMetrics) {
    let baselinePool = null;
    try {
      const benchmarkRunId = Date.now();
      const primaryContainerName =
        BENCHMARK_CONTAINER_NAME_PREFIX + benchmarkRunId + BENCHMARK_PRIMARY_SUFFIX;
      const primaryContainer = await provider.createContainer({
        name: primaryContainerName,
        image: baselineBenchmarkConfig.baselineImage,
        network: networkName,
        env: {
          [POSTGRES_ENV_USER_KEY]: baselineBenchmarkConfig.user,
          [POSTGRES_ENV_PASSWORD_KEY]: baselineBenchmarkConfig.password,
          [POSTGRES_ENV_DB_KEY]: baselineBenchmarkConfig.database,
          [POSTGRES_ENV_AUTH_METHOD_KEY]: POSTGRES_ENV_AUTH_METHOD_VALUE,
        },
        resourceLimits: cluster?._config?.resourceLimits || {},
        startTimeout: cluster?._config?.timeouts?.nodeStartup,
      });
      baselineContainers.push(primaryContainer);
      baselinePrimaryContainerId = primaryContainer.containerId;
      baselinePrimaryContainerIp = primaryContainer.ip;

      await waitForPostgresReady(provider, baselinePrimaryContainerId, {
        host: LOCALHOST,
        port: baselineBenchmarkConfig.port,
        user: baselineBenchmarkConfig.user,
        database: baselineBenchmarkConfig.database,
        timeoutMs: baselineBenchmarkConfig.readyTimeoutMs,
        pollIntervalMs: baselineBenchmarkConfig.readyPollIntervalMs,
      });
      await configurePrimaryReplication(
        provider,
        baselinePrimaryContainerId,
        baselineBenchmarkConfig,
      );

      for (
        let replicaIndex = ONE;
        replicaIndex < baselineBenchmarkConfig.replicationFactor;
        replicaIndex += ONE
      ) {
        const replicaName =
          BENCHMARK_CONTAINER_NAME_PREFIX +
          benchmarkRunId +
          BENCHMARK_REPLICA_SUFFIX_PREFIX +
          replicaIndex;
        const replicaBootstrapCommand = buildReplicaBootstrapCommand(
          primaryContainerName,
          replicaName,
          baselineBenchmarkConfig,
        );
        const replicaContainer = await provider.createContainer({
          name: replicaName,
          image: baselineBenchmarkConfig.baselineImage,
          network: networkName,
          env: {
            [POSTGRES_ENV_USER_KEY]: baselineBenchmarkConfig.user,
            [POSTGRES_ENV_PASSWORD_KEY]: baselineBenchmarkConfig.password,
            [POSTGRES_ENV_DB_KEY]: baselineBenchmarkConfig.database,
            [POSTGRES_ENV_AUTH_METHOD_KEY]: POSTGRES_ENV_AUTH_METHOD_VALUE,
          },
          command: [SHELL_COMMAND, SHELL_LOGIN_ARG, replicaBootstrapCommand],
          resourceLimits: cluster?._config?.resourceLimits || {},
          startTimeout: cluster?._config?.timeouts?.nodeStartup,
        });
        baselineContainers.push(replicaContainer);
        baselineReplicaContainerIps.push(replicaContainer.ip);

        await waitForPostgresReady(provider, replicaContainer.containerId, {
          host: LOCALHOST,
          port: baselineBenchmarkConfig.port,
          user: baselineBenchmarkConfig.user,
          database: baselineBenchmarkConfig.database,
          timeoutMs: baselineBenchmarkConfig.readyTimeoutMs,
          pollIntervalMs: baselineBenchmarkConfig.readyPollIntervalMs,
        });
      }

      await waitForStreamingReplicas(
        provider,
        baselinePrimaryContainerId,
        baselineBenchmarkConfig,
      );
      const loadNodeCount = Math.max(ONE, baselineBenchmarkConfig.baselineLoadNodeCount);
      const poolMaxConnections = Math.max(ONE, baselineBenchmarkConfig.loadMaxInFlight);
      baselineLoadNodeCount = loadNodeCount;
      baselinePoolMaxConnections = poolMaxConnections;
      baselinePool = scenarioOverrides.createPostgresPool({
        host: baselinePrimaryContainerIp,
        port: baselineBenchmarkConfig.port,
        user: baselineBenchmarkConfig.user,
        password: baselineBenchmarkConfig.password,
        database: baselineBenchmarkConfig.database,
        max: poolMaxConnections,
        idleTimeoutMillis: BENCHMARK_POOL_IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: BENCHMARK_POOL_CONNECTION_TIMEOUT_MS,
      });

      await ensurePostgresBenchmarkTable(baselinePool, benchmarkTableName);
      baselineMetrics = await runBaselineSharedLoad({
        pool: baselinePool,
        createLoadGenerator: scenarioOverrides.createLoadGenerator,
        loadNodeCount,
        loadOpsPerSec: baselineBenchmarkConfig.loadOpsPerSec,
        loadDuration: baselineBenchmarkConfig.loadDuration,
        loadMaxInFlight: baselineBenchmarkConfig.loadMaxInFlight,
        loadNodeMaxInFlight: baselineBenchmarkConfig.loadNodeMaxInFlight,
        maxPendingQueueDepth: baselineBenchmarkConfig.maxPendingQueueDepth,
        earlyRejectOnQueueFull: baselineBenchmarkConfig.earlyRejectOnQueueFull,
        nodeFailureThreshold: baselineBenchmarkConfig.nodeFailureThreshold,
        nodeFailureCooldownMs: baselineBenchmarkConfig.nodeFailureCooldownMs,
        tableName: benchmarkTableName,
      });
      try {
        cacheMetadata = await storeBaselineMetricsInCache(
          baselineCacheIdentity,
          baselineBenchmarkConfig,
          baselineMetrics,
        );
      } catch (_cacheStoreErr) {
        cacheMetadata.reason = BASELINE_CACHE_INVALID_REASON;
      }
    } finally {
      if (baselinePool && typeof baselinePool.end === 'function') {
        try {
          await baselinePool.end();
        } catch (_poolEndErr) {
          // Best-effort cleanup.
        }
      }
      for (let index = baselineContainers.length - ONE; index >= ZERO; index--) {
        const containerId = baselineContainers[index]?.containerId;
        if (!containerId) {
          continue;
        }
        try {
          await provider.stopContainer(containerId);
        } catch (_stopErr) {
          // Best-effort cleanup.
        }
        try {
          await provider.removeContainer(containerId);
        } catch (_removeErr) {
          // Best-effort cleanup.
        }
      }
    }
  }

  return {
    baselineMetrics,
    baselineCacheMetadata: cacheMetadata,
    baselinePrimaryContainerIp,
    baselineReplicaContainerIps,
    baselineLoadNodeCount,
    baselinePoolMaxConnections,
  };
}

function mapPhaseArtifacts(phaseResults) {
  const artifacts = {};
  for (const phaseResult of phaseResults) {
    artifacts[phaseResult.phase] = phaseResult.artifacts || {};
  }
  return artifacts;
}

function mapPhaseTimeline(phaseResults) {
  return phaseResults.map((phaseResult) => ({
    phase: phaseResult.phase,
    status: phaseResult.status,
    durationMs: phaseResult.durationMs,
    startedAtMs: phaseResult.startedAtMs,
    endedAtMs: phaseResult.endedAtMs,
    warnings: phaseResult.warnings || [],
    errors: phaseResult.errors || [],
  }));
}

function buildFailedPhaseDiagnostics(phaseResult) {
  if (!phaseResult || typeof phaseResult !== 'object') {
    return null;
  }
  return {
    phase: String(phaseResult.phase || 'unknown'),
    status: String(phaseResult.status || 'unknown'),
    durationMs: Number(phaseResult.durationMs || ZERO),
    startedAtMs: Number(phaseResult.startedAtMs || ZERO),
    endedAtMs: Number(phaseResult.endedAtMs || ZERO),
    warnings: phaseResult.warnings || [],
    errors: phaseResult.errors || [],
    artifacts: phaseResult.artifacts || {},
  };
}

function emitPhaseProgress(phaseContext, message, details = null) {
  if (typeof phaseContext?.emitPhaseProgress !== 'function') {
    return;
  }
  phaseContext.emitPhaseProgress({
    message,
    ...(details && typeof details === 'object' ? {details} : {}),
  });
}

function emitPhaseMeaningfulChange(phaseContext, message, details = null) {
  if (typeof phaseContext?.emitPhaseLastMeaningfulChange !== 'function') {
    return;
  }
  phaseContext.emitPhaseLastMeaningfulChange({
    message,
    ...(details && typeof details === 'object' ? {details} : {}),
  });
}

function emitPhaseNoProgressFailure(phaseContext, message, details = null) {
  if (typeof phaseContext?.emitPhaseFailedNoProgress !== 'function') {
    return;
  }
  phaseContext.emitPhaseFailedNoProgress({
    message,
    ...(details && typeof details === 'object' ? {details} : {}),
  });
}

function buildNoProgressDiagnostics(phaseResult) {
  const phaseProgress = phaseResult?.artifacts?.[PHASE_PROGRESS_ARTIFACT_KEY];
  if (!phaseProgress || typeof phaseProgress !== 'object') {
    return null;
  }
  const failedNoProgress =
    phaseProgress.failedNoProgress &&
    typeof phaseProgress.failedNoProgress === 'object' ?
      phaseProgress.failedNoProgress :
      null;
  const reasonHistogram =
    phaseResult?.artifacts?.reasonHistogram &&
    typeof phaseResult.artifacts.reasonHistogram === 'object' ?
      phaseResult.artifacts.reasonHistogram :
      {};
  const stalledReason = Object.keys(reasonHistogram).find((reason) =>
    String(reason || '').includes(NO_PROGRESS_REASON_CODE),
  ) || null;
  if (!failedNoProgress && !stalledReason) {
    return null;
  }
  return {
    reasonCode: NO_PROGRESS_REASON_CODE,
    phase: String(phaseResult?.phase || 'unknown'),
    stalledReason,
    lastProgressEvent: phaseProgress.lastProgressEvent || null,
    lastMeaningfulChange: phaseProgress.lastMeaningfulChange || null,
    heartbeatCount: Number(phaseProgress.heartbeatCount || ZERO),
    warningCount: Number(phaseProgress.noProgressWarningCount || ZERO),
    failedNoProgress,
  };
}

function createAdmissionRuntimeOwnershipAudit() {
  return {
    selection: {byNodeId: {}},
    localReplicaConfirmation: {byNodeId: {}},
    readinessGate: {byNodeId: {}},
  };
}

function recordAdmissionRuntimeOwnership(audit, stage, nodeId, source) {
  if (!audit || typeof audit !== 'object') {
    return;
  }
  if (typeof nodeId !== 'string' || nodeId.length === ZERO) {
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(audit, stage)) {
    return;
  }
  if (!Object.values(DISCOVERY_ADMISSION_SOURCE).includes(source)) {
    return;
  }
  audit[stage].byNodeId[nodeId] = source;
}

function buildAdmissionRuntimeOwnershipStageSummary(stage = {}) {
  const byNodeId = stage?.byNodeId && typeof stage.byNodeId === 'object' ?
    stage.byNodeId :
    {};
  const counts = {
    [DISCOVERY_ADMISSION_SOURCE.RUNTIME]: ZERO,
    [DISCOVERY_ADMISSION_SOURCE.LEGACY]: ZERO,
    [DISCOVERY_ADMISSION_SOURCE.MISSING]: ZERO,
  };
  const legacyFallbackNodeIds = [];
  const missingAdmissionNodeIds = [];
  for (const [nodeId, source] of Object.entries(byNodeId)) {
    if (!Object.prototype.hasOwnProperty.call(counts, source)) {
      continue;
    }
    counts[source] += ONE;
    if (source === DISCOVERY_ADMISSION_SOURCE.LEGACY) {
      legacyFallbackNodeIds.push(nodeId);
    } else if (source === DISCOVERY_ADMISSION_SOURCE.MISSING) {
      missingAdmissionNodeIds.push(nodeId);
    }
  }
  return {
    byNodeId: {...byNodeId},
    counts,
    legacyFallbackNodeIds: legacyFallbackNodeIds.sort(),
    missingAdmissionNodeIds: missingAdmissionNodeIds.sort(),
  };
}

function buildAdmissionRuntimeOwnershipSummary(audit) {
  return {
    selection: buildAdmissionRuntimeOwnershipStageSummary(audit?.selection),
    localReplicaConfirmation: buildAdmissionRuntimeOwnershipStageSummary(
      audit?.localReplicaConfirmation,
    ),
    readinessGate: buildAdmissionRuntimeOwnershipStageSummary(
      audit?.readinessGate,
    ),
  };
}

function incrementReasonHistogram(reasonHistogram, reason, phase) {
  if (!Object.prototype.hasOwnProperty.call(reasonHistogram, reason)) {
    reasonHistogram[reason] = {
      reason,
      count: ZERO,
      phases: new Set(),
    };
  }
  reasonHistogram[reason].count += ONE;
  reasonHistogram[reason].phases.add(phase);
}

function summarizeReasons(reasonHistogram) {
  return Object.values(reasonHistogram)
    .sort((left, right) => right.count - left.count)
    .slice(ZERO, PHASE_REASON_SUMMARY_MAX_ENTRIES)
    .map((entry) => ({
      reason: entry.reason,
      count: entry.count,
      phases: [...entry.phases].sort(),
    }));
}

function resolvePhaseClass(phase) {
  switch (phase) {
  case SCENARIO_PHASE.PRE_FLIGHT:
    return PHASE_CLASS_STARTUP;
  case SCENARIO_PHASE.CONVERGE:
    return PHASE_CLASS_DISCOVERY;
  case SCENARIO_PHASE.PRE_LOAD_GATE:
  case SCENARIO_PHASE.POST_LOAD_DRAIN:
    return PHASE_CLASS_TOPOLOGY;
  case SCENARIO_PHASE.LOAD:
    return PHASE_CLASS_LOAD;
  case SCENARIO_PHASE.VERIFY:
    return PHASE_CLASS_VERIFY;
  case SCENARIO_PHASE.TEARDOWN:
    return PHASE_CLASS_TEARDOWN;
  default:
    return PHASE_CLASS_UNKNOWN;
  }
}

function classifyReason(reason) {
  const normalizedReason = String(reason || '').toLowerCase();
  if (normalizedReason.includes('bootstrap') ||
      normalizedReason.includes('startup') ||
      normalizedReason.includes('active state')) {
    return REASON_CLASS_STARTUP;
  }
  if (normalizedReason.includes('discovery') ||
      normalizedReason.includes('schema') ||
      normalizedReason.includes('readiness')) {
    return REASON_CLASS_DISCOVERY;
  }
  if (normalizedReason.includes('in_flight') ||
      normalizedReason.includes('leadership') ||
      normalizedReason.includes('topology') ||
      normalizedReason.includes('stalled_no_progress')) {
    return REASON_CLASS_TOPOLOGY;
  }
  if (normalizedReason.includes('load') ||
      normalizedReason.includes('circuit') ||
      normalizedReason.includes('budget_exhausted') ||
      normalizedReason.includes('operation') ||
      normalizedReason.includes('write_pressure')) {
    return REASON_CLASS_LOAD;
  }
  if (normalizedReason.includes('consistency') ||
      normalizedReason.includes('fallback') ||
      normalizedReason.includes('verification')) {
    return REASON_CLASS_VERIFY;
  }
  return REASON_CLASS_UNKNOWN;
}

function buildReasonClassHistogram(reasons = []) {
  const histogram = {};
  for (const reason of reasons) {
    const reasonClass = classifyReason(reason);
    histogram[reasonClass] = (histogram[reasonClass] || ZERO) + ONE;
  }
  return histogram;
}

function mergeReasonClassHistograms(target = {}, source = {}) {
  const merged = {...target};
  for (const [reasonClass, count] of Object.entries(source)) {
    merged[reasonClass] = (merged[reasonClass] || ZERO) + Number(count || ZERO);
  }
  return merged;
}

function buildStartupDecisionRecord(phaseDecisions = []) {
  let reasonClassHistogram = {};
  for (const phaseDecision of phaseDecisions) {
    reasonClassHistogram = mergeReasonClassHistograms(
      reasonClassHistogram,
      phaseDecision.reasonClassHistogram || {},
    );
  }
  return {
    schemaVersion: STARTUP_DECISION_SCHEMA_VERSION,
    phaseCount: phaseDecisions.length,
    phaseDecisions,
    reasonClassHistogram,
  };
}

function buildPhaseReasonSummary(phaseResults) {
  const warningHistogram = {};
  const errorHistogram = {};
  for (const phaseResult of phaseResults) {
    const phase = String(phaseResult.phase || 'unknown');
    for (const warning of phaseResult.warnings || []) {
      incrementReasonHistogram(warningHistogram, String(warning), phase);
    }
    for (const error of phaseResult.errors || []) {
      incrementReasonHistogram(errorHistogram, String(error), phase);
    }
  }
  return {
    dominantWarnings: summarizeReasons(warningHistogram),
    dominantErrors: summarizeReasons(errorHistogram),
  };
}

function buildVerificationArtifacts(state, options = {}) {
  const artifacts = {
    consistencyVerdict: state.consistencyVerdict,
    coverage: state.consistencyEvaluation.coverage,
    mismatches: state.consistencyEvaluation.mismatches,
    evidenceWarnings: state.consistencyEvaluation.evidenceWarnings,
    snapshotRefresh: state.verificationSnapshotRefresh,
    invariantBreaches: state.assertionPolicyResult?.invariantBreaches || null,
    internalSignalCounts: state.internalSignalCounts,
    internalSignalThresholdResult: state.internalSignalThresholdResult,
    cdcTelemetry: state.cdcTelemetry,
    authoritativeFallbackResult: state.authoritativeFallbackResult,
  };
  if (options.includeLoadMetrics === true) {
    artifacts.loadMetrics = state.loadMetrics;
  }
  if (typeof state.assertionPolicyResult?.status === 'string' &&
      state.assertionPolicyResult.status.length > ZERO) {
    artifacts.assertionStatus = state.assertionPolicyResult.status;
  }
  if (options.includeVerificationNodes === true) {
    artifacts.verificationNodeIds = state.verificationNodeIds;
    artifacts.verificationExcludedNodeIds = state.verificationExcludedNodeIds;
  }
  if (options.includeConsistencyAssertionAttempts === true) {
    artifacts.consistencyAssertionAttempts =
      Number(state.consistencyResult?.attempts || ZERO);
  }
  return artifacts;
}

function resolvePhasePolicy(phase, benchmarkConfig) {
  switch (phase) {
  case SCENARIO_PHASE.PRE_LOAD_GATE:
    return {
      timeoutMs: benchmarkConfig.quiescentTimeoutMs,
      pollIntervalMs: benchmarkConfig.quiescentPollIntervalMs,
      stableWindowMs: benchmarkConfig.quiescentStableWindowMs,
    };
  case SCENARIO_PHASE.POST_LOAD_DRAIN:
    return {
      timeoutMs: benchmarkConfig.postLoadDrainTimeoutMs,
      pollIntervalMs: benchmarkConfig.postLoadDrainPollIntervalMs,
      stableWindowMs: benchmarkConfig.postLoadDrainStableWindowMs,
      insufficientEvidencePolicy: benchmarkConfig.insufficientEvidencePolicy,
    };
  case SCENARIO_PHASE.LOAD:
    return {
      loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
      loadDuration: benchmarkConfig.loadDuration,
      loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
      loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
      loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
      pinRebalancingDuringLoad: benchmarkConfig.pinRebalancingDuringLoad === true,
      allowLoadRebalancePinningBypass:
        benchmarkConfig.allowLoadRebalancePinningBypass === true,
      rebalanceHysteresisCooldownMs:
        benchmarkConfig.rebalanceHysteresisCooldownMs,
      rebalanceHysteresisMinDelta: benchmarkConfig.rebalanceHysteresisMinDelta,
      loadRebalanceMonitorPollIntervalMs:
        benchmarkConfig.loadRebalanceMonitorPollIntervalMs,
      loadRebalanceMaxReplicaOpsInFlight:
        benchmarkConfig.loadRebalanceMaxReplicaOpsInFlight,
    };
  case SCENARIO_PHASE.VERIFY:
    return {
      consistencyAssertMaxAttempts: benchmarkConfig.consistencyAssertMaxAttempts,
      consistencyAssertRetryDelayMs:
        benchmarkConfig.consistencyAssertRetryDelayMs,
      insufficientEvidencePolicy: benchmarkConfig.insufficientEvidencePolicy,
    };
  default:
    return {};
  }
}

function collectPhaseReasons(phaseResult) {
  const reasons = [];
  for (const warning of phaseResult.warnings || []) {
    reasons.push(String(warning));
  }
  for (const error of phaseResult.errors || []) {
    reasons.push(String(error));
  }
  const reasonHistogram = phaseResult.artifacts?.reasonHistogram || {};
  for (const reason of Object.keys(reasonHistogram)) {
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  }
  return reasons;
}

function buildPhaseDecisions(phaseResults, benchmarkConfig) {
  return phaseResults.map((phaseResult) => {
    const reasons = collectPhaseReasons(phaseResult);
    return {
      phase: phaseResult.phase,
      phaseClass: resolvePhaseClass(phaseResult.phase),
      status: phaseResult.status,
      policy: resolvePhasePolicy(phaseResult.phase, benchmarkConfig),
      reasons,
      reasonClassHistogram: buildReasonClassHistogram(reasons),
      includedNodeIds: phaseResult.artifacts?.includedNodeIds || [],
      excludedNodeIds: phaseResult.artifacts?.excludedNodeIds || [],
    };
  });
}

function resolveReasonClassFromPhaseClass(phaseClass) {
  switch (phaseClass) {
  case PHASE_CLASS_STARTUP:
    return REASON_CLASS_STARTUP;
  case PHASE_CLASS_DISCOVERY:
    return REASON_CLASS_DISCOVERY;
  case PHASE_CLASS_TOPOLOGY:
    return REASON_CLASS_TOPOLOGY;
  case PHASE_CLASS_LOAD:
    return REASON_CLASS_LOAD;
  case PHASE_CLASS_VERIFY:
    return REASON_CLASS_VERIFY;
  default:
    return REASON_CLASS_UNKNOWN;
  }
}

function buildFailureReasonCounts(phaseResult) {
  const reasonCounts = {};
  const artifactReasonHistogram = phaseResult?.artifacts?.reasonHistogram;
  if (artifactReasonHistogram && typeof artifactReasonHistogram === 'object') {
    for (const [reason, count] of Object.entries(artifactReasonHistogram)) {
      const normalizedReason = String(reason || '');
      const normalizedCount = Number(count);
      if (!normalizedReason || !Number.isFinite(normalizedCount) ||
          normalizedCount <= ZERO) {
        continue;
      }
      reasonCounts[normalizedReason] = Math.max(
        ZERO,
        Math.floor(normalizedCount),
      );
    }
  }
  if (Object.keys(reasonCounts).length > ZERO) {
    return reasonCounts;
  }
  for (const reason of collectPhaseReasons(phaseResult)) {
    if (!reasonCounts[reason]) {
      reasonCounts[reason] = ZERO;
    }
    reasonCounts[reason] += ONE;
  }
  return reasonCounts;
}

function collectCanonicalStrictReasonsFromText(reasonText) {
  const normalizedReasonText = String(reasonText || '').toLowerCase();
  if (normalizedReasonText.length === ZERO) {
    return [];
  }
  const canonicalReasons = [];
  for (const reasonCode of STRICT_DOMINANT_REASON_PRECEDENCE) {
    if (normalizedReasonText.includes(reasonCode)) {
      canonicalReasons.push(reasonCode);
    }
  }
  return canonicalReasons;
}

function resolveFailureNodeReasonsByNodeId(phaseResult) {
  const artifactNodeReasons = phaseResult?.artifacts?.nodeReasonsByNodeId;
  if (artifactNodeReasons && typeof artifactNodeReasons === 'object') {
    return artifactNodeReasons;
  }
  const versionNodes = phaseResult?.artifacts?.versionConvergence?.nodes;
  if (versionNodes && typeof versionNodes === 'object') {
    const derived = {};
    for (const [nodeId, snapshot] of Object.entries(versionNodes)) {
      const unmetReasons = Array.isArray(snapshot?.unmetReasons) ?
        [...snapshot.unmetReasons] :
        [];
      if (unmetReasons.length > ZERO) {
        derived[String(nodeId)] = unmetReasons;
      }
    }
    return derived;
  }
  return {};
}

function buildCanonicalStrictReasonCounts(nodeReasonsByNodeId, fallbackReasonCounts) {
  const canonicalReasonCounts = {};
  for (const reasons of Object.values(nodeReasonsByNodeId || {})) {
    if (!Array.isArray(reasons)) {
      continue;
    }
    for (const reasonText of reasons) {
      const canonicalReasons = collectCanonicalStrictReasonsFromText(reasonText);
      for (const reasonCode of canonicalReasons) {
        canonicalReasonCounts[reasonCode] =
          (canonicalReasonCounts[reasonCode] || ZERO) + ONE;
      }
    }
  }
  if (Object.keys(canonicalReasonCounts).length > ZERO) {
    return canonicalReasonCounts;
  }

  for (const [reasonText, count] of Object.entries(fallbackReasonCounts || {})) {
    const canonicalReasons = collectCanonicalStrictReasonsFromText(reasonText);
    for (const reasonCode of canonicalReasons) {
      canonicalReasonCounts[reasonCode] =
        (canonicalReasonCounts[reasonCode] || ZERO) +
        normalizeNonNegativeInteger(count);
    }
  }
  return canonicalReasonCounts;
}

function resolveDominantStrictReason(reasonCounts) {
  const entries = Object.entries(reasonCounts || {});
  if (entries.length === ZERO) {
    return null;
  }

  let dominantReason = null;
  let dominantPrecedenceRank = Number.POSITIVE_INFINITY;
  let dominantCount = ZERO;

  for (const [reasonCode, count] of entries) {
    const precedenceIndex = STRICT_DOMINANT_REASON_PRECEDENCE.indexOf(reasonCode);
    const precedenceRank = precedenceIndex >= ZERO ?
      precedenceIndex :
      STRICT_DOMINANT_REASON_PRECEDENCE.length;
    const normalizedCount = normalizeNonNegativeInteger(count);
    if (dominantReason === null ||
        precedenceRank < dominantPrecedenceRank ||
        (precedenceRank === dominantPrecedenceRank &&
          normalizedCount > dominantCount) ||
        (precedenceRank === dominantPrecedenceRank &&
          normalizedCount === dominantCount &&
          String(reasonCode).localeCompare(String(dominantReason)) < ZERO)) {
      dominantReason = String(reasonCode);
      dominantPrecedenceRank = precedenceRank;
      dominantCount = normalizedCount;
    }
  }
  return dominantReason;
}

function parseNodeIdFromNodeProbeReason(reason) {
  const detail = String(reason || '').slice(
    QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX.length,
  );
  const separatorIndex = detail.indexOf('=');
  if (separatorIndex <= ZERO) {
    return null;
  }
  const nodeId = detail.slice(ZERO, separatorIndex);
  return nodeId.length > ZERO ? nodeId : null;
}

function extractNodeIdsFromFailureErrorMessage(errorMessage) {
  const nodeIds = [];
  const seenNodeIds = new Set();
  const text = String(errorMessage || '');
  FAILURE_NODE_ID_PATTERN.lastIndex = ZERO;
  const discoveredNodeIdMatches = text.matchAll(FAILURE_NODE_ID_PATTERN);
  for (const nodeIdMatch of discoveredNodeIdMatches) {
    const nodeId = String(nodeIdMatch?.[1] || '');
    if (!nodeId || seenNodeIds.has(nodeId)) {
      continue;
    }
    seenNodeIds.add(nodeId);
    nodeIds.push(nodeId);
  }
  if (!text.includes(STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX)) {
    return nodeIds;
  }
  const nodeReasonFragment = text.slice(
    text.indexOf(STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX) +
      STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX.length,
  );
  const entries = nodeReasonFragment.split(
    STRICT_PRELOAD_NODE_REASON_ENTRY_SEPARATOR,
  );
  for (const entry of entries) {
    const trimmedEntry = String(entry || '').trim();
    if (!trimmedEntry || trimmedEntry === 'none') {
      continue;
    }
    const separatorIndex = trimmedEntry.indexOf(
      STRICT_PRELOAD_NODE_REASON_VALUE_SEPARATOR,
    );
    const nodeId = separatorIndex >= ZERO ?
      trimmedEntry.slice(ZERO, separatorIndex) :
      trimmedEntry;
    if (nodeId.length > ZERO && !seenNodeIds.has(nodeId)) {
      seenNodeIds.add(nodeId);
      nodeIds.push(nodeId);
    }
  }
  return nodeIds;
}

function collectAffectedNodeIdsFromLoadMetrics(loadMetrics, targetSet) {
  if (!loadMetrics || typeof loadMetrics !== 'object' || !targetSet) {
    return;
  }
  const perNodeMetrics = loadMetrics?.perNode &&
    typeof loadMetrics.perNode === 'object' &&
    !Array.isArray(loadMetrics.perNode) ?
    loadMetrics.perNode :
    {};
  for (const [nodeId, nodeMetrics] of Object.entries(perNodeMetrics)) {
    const attemptErrors = Number(nodeMetrics?.attemptErrors || ZERO);
    const dispatched = Number(nodeMetrics?.dispatched || ZERO);
    const success = Number(nodeMetrics?.success || ZERO);
    const rejected = Number(nodeMetrics?.rejected || ZERO);
    if (attemptErrors > ZERO || dispatched > success || rejected > ZERO) {
      targetSet.add(nodeId);
    }
  }
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors) ?
    loadMetrics.distinctErrors :
    [];
  for (const errorText of distinctErrors) {
    for (const nodeId of extractNodeIdsFromFailureErrorMessage(errorText)) {
      targetSet.add(nodeId);
    }
  }
}

function buildFailureAffectedNodeIds(phaseResult, loadMetrics = null) {
  const affectedNodeIds = new Set();
  const artifacts = phaseResult?.artifacts || {};
  const artifactNodeIdFields = [
    'includedNodeIds',
    'excludedNodeIds',
    'verificationNodeIds',
    'verificationExcludedNodeIds',
  ];
  for (const field of artifactNodeIdFields) {
    const nodeIds = artifacts[field];
    if (!Array.isArray(nodeIds)) {
      continue;
    }
    for (const nodeId of nodeIds) {
      if (typeof nodeId === 'string' && nodeId.length > ZERO) {
        affectedNodeIds.add(nodeId);
      }
    }
  }

  const reasonHistogram = artifacts.reasonHistogram;
  if (reasonHistogram && typeof reasonHistogram === 'object') {
    for (const reason of Object.keys(reasonHistogram)) {
      if (!reason.startsWith(QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX)) {
        continue;
      }
      const nodeId = parseNodeIdFromNodeProbeReason(reason);
      if (nodeId) {
        affectedNodeIds.add(nodeId);
      }
    }
  }

  const errors = Array.isArray(phaseResult?.errors) ? phaseResult.errors : [];
  for (const errorMessage of errors) {
    for (const nodeId of extractNodeIdsFromFailureErrorMessage(errorMessage)) {
      affectedNodeIds.add(nodeId);
    }
  }
  collectAffectedNodeIdsFromLoadMetrics(loadMetrics, affectedNodeIds);
  return [...affectedNodeIds].sort();
}

function resolveFailureRootCauseClass(phaseResult, reasonCounts) {
  const reasonClassHistogram = buildReasonClassHistogram(
    Object.keys(reasonCounts || {}),
  );
  let topClass = REASON_CLASS_UNKNOWN;
  let topCount = ZERO;
  for (const [reasonClass, count] of Object.entries(reasonClassHistogram)) {
    if (count > topCount) {
      topClass = reasonClass;
      topCount = count;
    }
  }
  if (topCount > ZERO && topClass !== REASON_CLASS_UNKNOWN) {
    return topClass;
  }
  const phaseClass = resolvePhaseClass(phaseResult?.phase);
  return resolveReasonClassFromPhaseClass(phaseClass);
}

function isStrictBenchmarkMode(benchmarkConfig) {
  return benchmarkConfig?.strictDiscovery === true ||
    benchmarkConfig?.strictPreloadReadiness === true ||
    benchmarkConfig?.strictParity === true ||
    benchmarkConfig?.strictCdcTelemetrySchema === true ||
    benchmarkConfig?.strictAuthoritativeFallback === true ||
    benchmarkConfig?.strictOverloadPolicy === true ||
    benchmarkConfig?.strictWritePressure === true;
}

function resolveReplicaOperationTimelineByOperationId(phaseResult) {
  const timelineByOperationId = {};
  const appendTimeline = (candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }
    for (const [operationId, entries] of Object.entries(candidate)) {
      if (!operationId || !Array.isArray(entries)) {
        continue;
      }
      const existing = timelineByOperationId[operationId];
      if (!Array.isArray(existing) || entries.length > existing.length) {
        timelineByOperationId[operationId] = entries;
      }
    }
  };
  appendTimeline(
    phaseResult?.artifacts?.replicaOperationTimelineByOperationId,
  );
  appendTimeline(
    phaseResult?.artifacts?.gateResult?.replicaOperationTimelineByOperationId,
  );

  const preflightSnapshots =
    phaseResult?.artifacts?.preflightCriticalPathSnapshots;
  if (preflightSnapshots && typeof preflightSnapshots === 'object') {
    for (const snapshot of Object.values(preflightSnapshots)) {
      appendTimeline(
        snapshot?.controlPlaneDiagnostics?.replicaOperations
          ?.operationTimelineById,
      );
      appendTimeline(
        snapshot?.replicaOperations?.operationTimelineById,
      );
    }
  }
  return timelineByOperationId;
}

function buildUnifiedFailureArtifact(phaseResult, benchmarkConfig, options = {}) {
  const rawReasonCounts = buildFailureReasonCounts(phaseResult);
  const nodeReasonsByNodeId = resolveFailureNodeReasonsByNodeId(phaseResult);
  const canonicalStrictReasonCounts = buildCanonicalStrictReasonCounts(
    nodeReasonsByNodeId,
    rawReasonCounts,
  );
  const reasonCounts = Object.keys(canonicalStrictReasonCounts).length > ZERO ?
    canonicalStrictReasonCounts :
    rawReasonCounts;
  const dominantReason = resolveDominantStrictReason(reasonCounts);
  const failureArtifact = {
    schemaVersion: FAILURE_ARTIFACT_SCHEMA_VERSION,
    rootCauseClass: resolveFailureRootCauseClass(phaseResult, reasonCounts),
    phase: String(phaseResult?.phase || 'unknown'),
    affectedNodeIds: buildFailureAffectedNodeIds(
      phaseResult,
      options?.loadMetrics || null,
    ),
    reasonCounts,
    dominantReason,
    strictMode: isStrictBenchmarkMode(benchmarkConfig),
  };

  const versionConvergence = phaseResult?.artifacts?.versionConvergence;
  if (versionConvergence && typeof versionConvergence === 'object') {
    failureArtifact.versionConvergence = versionConvergence;
    failureArtifact.versionLagSummary =
      buildVersionLagSummary(versionConvergence);
  }

  const saturation = phaseResult?.artifacts?.saturation;
  if (saturation && typeof saturation === 'object') {
    failureArtifact.saturation = saturation;
  }

  const readinessTimeline = Array.isArray(phaseResult?.artifacts?.readinessTimeline) ?
    phaseResult.artifacts.readinessTimeline :
    (Array.isArray(phaseResult?.artifacts?.gateResult?.readinessTimeline) ?
      phaseResult.artifacts.gateResult.readinessTimeline :
      []);
  if (readinessTimeline.length > ZERO) {
    failureArtifact.readinessTimeline = readinessTimeline;
  }

  const benchmarkMetadataFlow = phaseResult?.artifacts?.benchmarkMetadataFlow;
  if (benchmarkMetadataFlow && typeof benchmarkMetadataFlow === 'object') {
    failureArtifact.benchmarkMetadataFlow = benchmarkMetadataFlow;
  }
  const replicaOperationTimelineByOperationId =
    resolveReplicaOperationTimelineByOperationId(phaseResult);
  if (Object.keys(replicaOperationTimelineByOperationId).length > ZERO) {
    failureArtifact.replicaOperationTimelineByOperationId =
      replicaOperationTimelineByOperationId;
  }

  if (Object.keys(nodeReasonsByNodeId).length > ZERO) {
    failureArtifact.nodeReasonsByNodeId = nodeReasonsByNodeId;
  }

  return failureArtifact;
}

function selectVerificationNodes(effectiveNodes, postLoadDrain) {
  const includedNodeIds = new Set(
    Array.isArray(postLoadDrain?.includedNodeIds) ?
      postLoadDrain.includedNodeIds :
      [],
  );
  if (includedNodeIds.size === ZERO) {
    return [...effectiveNodes];
  }
  return effectiveNodes.filter((node) => includedNodeIds.has(node.id));
}

async function run(cluster) {
  const nodes = cluster.getNodes();
  assert.ok(nodes.length >= ONE, 'Scenario requires at least one node');

  const benchmarkConfig = resolveBenchmarkConfig(cluster);
  const scenarioOverrides = resolveScenarioOverrides(cluster);
  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[ZERO];
  assert.equal(
    typeof seedNode?.queryWithTimeout,
    'function',
    'Seed node must provide queryWithTimeout for NodeClient control channel',
  );
  assert.equal(
    typeof seedNode?.getReachabilityDiagnostics,
    'function',
    'Seed node must provide getReachabilityDiagnostics for probe channel',
  );
  const benchmarkTableName = normalizeTableName(
    benchmarkConfig.tableName,
    BENCHMARK_EVENT_TABLE_FALLBACK,
  );
  const provider = resolvePrimaryProvider(cluster);
  const networkName = String(cluster?._networkName || '');
  assert.ok(networkName, 'Cluster network name is not available');
  const nodeClientChannelPolicyOverrides =
    resolveNodeClientChannelPolicyOverrides(cluster);

  const nodeClient = new NodeClient({
    benchmarkConfig,
    ...(nodeClientChannelPolicyOverrides ?
      {channelPolicies: nodeClientChannelPolicyOverrides} :
      {}),
  });
  const nodeClientPolicySnapshot = nodeClient.getPolicySnapshot();
  const availableSutLoadCandidates = nodes.filter((node) =>
    isLoadNodeCandidate(node),
  ).length;
  const strictBenchmarkMode = isStrictBenchmarkMode(benchmarkConfig);
  const clusterCandidateLoadNodeCount = availableSutLoadCandidates;
  const explicitRequiredSutLoadNodeCount =
    benchmarkConfig.hasExplicitRequiredSutLoadNodeCount === true &&
      Number.isInteger(benchmarkConfig.requiredSutLoadNodeCount) &&
      benchmarkConfig.requiredSutLoadNodeCount > ZERO ?
      benchmarkConfig.requiredSutLoadNodeCount :
      null;
  const strictDefaultRequiredSutLoadNodeCount = Math.max(
    ONE,
    clusterCandidateLoadNodeCount,
  );
  const requestedSutLoadNodeCount = explicitRequiredSutLoadNodeCount !== null ?
    explicitRequiredSutLoadNodeCount :
    (strictBenchmarkMode ?
      strictDefaultRequiredSutLoadNodeCount :
      (Number.isInteger(benchmarkConfig.baselineLoadNodeCount) &&
        benchmarkConfig.baselineLoadNodeCount > ZERO ?
        benchmarkConfig.baselineLoadNodeCount :
        ONE));
  const targetSutLoadNodeCount = benchmarkConfig.strictDiscovery === true ?
    Math.max(ONE, requestedSutLoadNodeCount) :
    Math.max(
      ONE,
      Math.min(availableSutLoadCandidates, requestedSutLoadNodeCount),
    );
  const effectiveSutLoadDiscoveryTimeoutMs =
    benchmarkConfig.strictDiscovery === true &&
      benchmarkConfig.strictPreloadReadiness === true &&
      Number.isInteger(benchmarkConfig.quiescentTimeoutMs) &&
      benchmarkConfig.quiescentTimeoutMs > ZERO ?
      Math.max(
        benchmarkConfig.readyTimeoutMs,
        benchmarkConfig.quiescentTimeoutMs,
      ) :
      benchmarkConfig.readyTimeoutMs;
  const baselineLoadNodeCountForRun = benchmarkConfig.strictParity === true ?
    targetSutLoadNodeCount :
    benchmarkConfig.baselineLoadNodeCount;
  const strictFanoutOptOut = strictBenchmarkMode &&
    explicitRequiredSutLoadNodeCount !== null &&
    explicitRequiredSutLoadNodeCount < strictDefaultRequiredSutLoadNodeCount;
  const strictFanoutOptOutReason = strictFanoutOptOut ?
    'requiredSutLoadNodeCount=' +
      String(explicitRequiredSutLoadNodeCount) +
      ',clusterCandidateLoadNodeCount=' +
      String(clusterCandidateLoadNodeCount) :
    null;
  const consistencyEvaluator = new ConsistencyEvaluatorV2();
  const phaseEvents = [];
  const state = {
    convergence: null,
    convergenceTimeline: [],
    convergenceTimelineSignatures: new Set(),
    requiredSchemaVersion: null,
    requiredSchemaVersionSource: null,
    requiredSchemaVersionMetadataNodeId: null,
    requiredSchemaTableId: null,
    benchmarkMetadataFlow: {
      createCommitted: null,
      createAttempt: null,
      nodeSnapshots: {},
    },
    sutLoadNodes: [],
    sutLoadDiscovery: null,
    strictDiscoveryGate: null,
    strictBenchmarkGate: {
      discovery: null,
      invariants: null,
      parity: null,
      authoritativeFallback: null,
      overload: null,
      writePressure: null,
    },
    quietMode: createQuietModeState({
      enabled: benchmarkConfig.quietModeEnabled === true,
      activePhases: QUIET_MODE_ACTIVE_PHASES,
    }),
    systemTableReadPath: {
      mode: SYSTEM_TABLE_READ_PATH_MODE_CANONICAL,
      candidateNodeIds: [],
    },
    effectiveSutLoadNodes: [],
    excludedSutLoadNodeIds: [],
    quiescenceResult: null,
    preLoadInvariantEvaluation: {
      invariants: [],
      dominantInvariant: null,
      rootCauseCode: null,
      rootCauseClass: null,
    },
    loadMetrics: null,
    baselineMetrics: null,
    baselineCacheMetadata: null,
    baselinePrimaryContainerIp: null,
    baselineReplicaContainerIps: [],
    baselineLoadNodeCount: baselineLoadNodeCountForRun,
    baselinePoolMaxConnections: benchmarkConfig.loadMaxInFlight,
    loadParity: null,
    overloadPolicyResult: {
      strictOverloadPolicy: benchmarkConfig.strictOverloadPolicy === true,
      policy: benchmarkConfig.overloadPolicy,
      rejectedOperations: ZERO,
      queueDelayP99Ms: ZERO,
      status: DISCOVERY_GATE_STATUS_PASSED,
      violations: [],
    },
    authoritativeFallbackResult: evaluateAuthoritativeFallbackPolicy(null, {
      strictAuthoritativeFallback:
        benchmarkConfig.strictAuthoritativeFallback === true,
      authoritativeFallbackThresholds:
        benchmarkConfig.authoritativeFallbackThresholds,
    }),
    writePressureResult: evaluateWritePressure(null, {
      strictWritePressure: benchmarkConfig.strictWritePressure === true,
      writePressureThresholds: benchmarkConfig.writePressureThresholds,
    }),
    saturation: createEmptySaturationCounters(),
    internalSignalCounts: {
      errorsByClass: createEmptyInternalSignalClassCounts(),
      warningsByClass: createEmptyInternalSignalClassCounts(),
      messages: [],
    },
    runtimeInternalSignalMessages: [],
    internalSignalThresholdResult: {
      failOnThresholdBreach: false,
      breached: false,
      breaches: [],
    },
    cdcTelemetry: {
      schemaVersion: CDC_TELEMETRY_SCHEMA_VERSION,
      byNode: {},
      summary: {
        nodeCount: ZERO,
        totalSubscriberCount: ZERO,
        totalBufferedEvents: ZERO,
        maxCatchupLagEvents: ZERO,
        avgCatchupThroughputEventsPerSec: ZERO,
        catchupNodeCount: ZERO,
        steadyNodeCount: ZERO,
        authoritativeFallback: {
          totalCount: ZERO,
          windowCount: ZERO,
          steadyStateWindowCount: ZERO,
        },
      },
      schema: {
        strict: benchmarkConfig.strictCdcTelemetrySchema === true,
        valid: true,
        errors: [],
      },
    },
    rebalancingPressure: {
      schemaVersion: REBALANCING_PRESSURE_SCHEMA_VERSION,
      preLoadGate: null,
      load: null,
      postLoadDrain: null,
    },
    diagnosticsCoverage: resolveDiagnosticsCoverage(null),
    effectiveAdmissionPolicy: buildEffectiveAdmissionPolicy({
      benchmarkConfig,
      nodeClientPolicySnapshot,
      nodeClientChannelPolicyOverrides,
    }),
    runtimeAdmissionOwnership: createAdmissionRuntimeOwnershipAudit(),
    postLoadDrain: createInitialPostLoadDrain([], []),
    consistencyVerdict: CONSISTENCY_VERDICT.CONSISTENT,
    consistencyResult: {attempts: ZERO},
    consistencyEvaluation: {
      coverage: {
        reachableNodes: ZERO,
        snapshotNodes: ZERO,
      },
      mismatches: [],
      evidenceWarnings: [],
    },
    verificationSnapshotRefresh:
      createVerificationSnapshotRefreshResult(),
    verificationNodeIds: [],
    verificationExcludedNodeIds: [],
    assertionPolicyResult: evaluateAssertionPolicy({
      consistencyVerdict: CONSISTENCY_VERDICT.CONSISTENT,
      invariants: [],
      loadMetrics: {
        total: ONE,
        success: ONE,
        failed: ZERO,
        errors: ZERO,
        opsPerSec: ONE,
      },
      policy: {
        insufficientEvidence: benchmarkConfig.insufficientEvidencePolicy,
      },
    }),
  };

  function recordConvergenceEvent(event) {
    if (!event || typeof event !== 'object') {
      return;
    }
    const normalizedEvent = {
      type: String(event.type || 'unknown'),
      nodeId: typeof event.nodeId === 'string' ? event.nodeId : null,
      tableId: typeof event.tableId === 'string' ? event.tableId : null,
      tableName: typeof event.tableName === 'string' ? event.tableName : null,
      requiredSchemaVersion:
        normalizeRequiredSchemaVersion(event.requiredSchemaVersion),
      observedSchemaVersion:
        normalizeRequiredSchemaVersion(event.observedSchemaVersion),
      reasons: Array.isArray(event.reasons) ?
        event.reasons.map((reason) => String(reason)) :
        [],
      ready: event.ready === true,
      timestampMs: Number.isFinite(event.timestampMs) ?
        event.timestampMs :
        Date.now(),
    };
    const signature = JSON.stringify({
      type: normalizedEvent.type,
      nodeId: normalizedEvent.nodeId,
      tableId: normalizedEvent.tableId,
      tableName: normalizedEvent.tableName,
      requiredSchemaVersion: normalizedEvent.requiredSchemaVersion,
      observedSchemaVersion: normalizedEvent.observedSchemaVersion,
      reasons: normalizedEvent.reasons,
      ready: normalizedEvent.ready,
    });
    if (state.convergenceTimelineSignatures.has(signature)) {
      return;
    }
    state.convergenceTimelineSignatures.add(signature);
    state.convergenceTimeline.push(normalizedEvent);
  }

  function recordBenchmarkMetadataSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }
    const nodeId = typeof snapshot.nodeId === 'string' ? snapshot.nodeId : null;
    if (snapshot.stage === BENCHMARK_METADATA_STAGE_CREATE_COMMITTED) {
      state.benchmarkMetadataFlow.createCommitted = snapshot;
    }
    if (!nodeId) {
      return;
    }
    state.benchmarkMetadataFlow.nodeSnapshots[nodeId] = snapshot;
  }

  async function ensureConvergenceResolved() {
    if (state.convergence) {
      return state.convergence;
    }
    state.convergence = await cluster.waitForConvergence({
      settleTimeoutMs: cluster?._config?.convergence?.settleTimeoutMs,
      quietWindowMs: cluster?._config?.convergence?.quietWindowMs,
      targetVoterCount: cluster?._config?.convergence?.targetVoterCount,
    });
    state.diagnosticsCoverage = resolveDiagnosticsCoverage(state.convergence);
    return state.convergence;
  }

  const orchestrator = new PhaseOrchestrator({
    onEvent: (event) => {
      phaseEvents.push(event);
    },
  });

  const phaseHandlers = {
    [SCENARIO_PHASE.PRE_FLIGHT]: async (phaseContext) => {
      enterQuietMode(
        state.quietMode,
        SCENARIO_PHASE.PRE_FLIGHT,
        QUIET_MODE_REASON_STRICT_BENCHMARK_MODE,
      );
      emitPhaseProgress(phaseContext, 'waiting for cluster convergence', {
        tableName: benchmarkTableName,
      });
      await ensureConvergenceResolved();
      emitPhaseMeaningfulChange(phaseContext, 'cluster convergence resolved', {
        diagnosticsCoverage: state.diagnosticsCoverage?.status || null,
      });
      const systemTableReadPath = resolveSystemTableReadPath(
        seedNode,
        nodes,
      );
      state.systemTableReadPath = {
        mode: systemTableReadPath.mode,
        candidateNodeIds: systemTableReadPath.nodes.map((node) => String(node.id)),
      };
      let tableMetadata;
      try {
        tableMetadata = await ensureSutBenchmarkTable(
          nodeClient,
          systemTableReadPath.nodes,
          benchmarkTableName,
          benchmarkConfig,
          benchmarkConfig.benchmarkTablePolicies,
        );
      } catch (error) {
        const createAttempt = resolveBenchmarkTableCreateAttempt(error);
        if (createAttempt && typeof createAttempt === 'object') {
          state.benchmarkMetadataFlow.createAttempt = createAttempt;
          if (createAttempt.metadataSnapshot &&
              typeof createAttempt.metadataSnapshot === 'object') {
            recordBenchmarkMetadataSnapshot(createAttempt.metadataSnapshot);
          }
        }
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: {
            benchmarkTableName,
            benchmarkMetadataFlow: buildBenchmarkMetadataFlow(
              state,
              benchmarkTableName,
            ),
            systemTableReadPath: state.systemTableReadPath,
          },
          errors: [String(error?.message || error)],
        };
      }
      state.benchmarkMetadataFlow.createAttempt =
        tableMetadata?.createAttempt || null;
      state.requiredSchemaVersion = tableMetadata?.requiredSchemaVersion || null;
      state.requiredSchemaVersionSource =
        tableMetadata?.requiredSchemaVersionSourceField || null;
      state.requiredSchemaVersionMetadataNodeId =
        tableMetadata?.metadataNodeId || null;
      state.requiredSchemaTableId = tableMetadata?.tableId || null;
      emitPhaseMeaningfulChange(phaseContext, 'benchmark table metadata resolved', {
        tableName: benchmarkTableName,
        tableId: state.requiredSchemaTableId,
        requiredSchemaVersion: state.requiredSchemaVersion,
      });
      if (state.requiredSchemaVersion) {
        recordConvergenceEvent({
          type: 'table_create_committed',
          nodeId: state.requiredSchemaVersionMetadataNodeId || seedNode.id,
          tableId: state.requiredSchemaTableId,
          tableName: benchmarkTableName,
          requiredSchemaVersion: state.requiredSchemaVersion,
        });
        recordConvergenceEvent({
          type: 'cdc_emitted',
          nodeId: state.requiredSchemaVersionMetadataNodeId || seedNode.id,
          tableId: state.requiredSchemaTableId,
          tableName: benchmarkTableName,
          requiredSchemaVersion: state.requiredSchemaVersion,
          observedSchemaVersion: state.requiredSchemaVersion,
        });
      }
      if (benchmarkConfig.strictPreloadReadiness === true &&
          !state.requiredSchemaVersion) {
        throw new Error(
          REQUIRED_SCHEMA_VERSION_UNAVAILABLE_REASON +
            ': table=' +
            benchmarkTableName,
        );
      }
      await waitForSutBenchmarkTableReady(
        nodeClient,
        systemTableReadPath.nodes,
        benchmarkTableName,
        {
          timeoutMs: benchmarkConfig.readyTimeoutMs,
          pollIntervalMs: benchmarkConfig.readyPollIntervalMs,
          timing: scenarioOverrides.timing,
        },
      );
      emitPhaseMeaningfulChange(phaseContext, 'benchmark table ready on system-under-test', {
        tableName: benchmarkTableName,
        requiredSchemaVersion: state.requiredSchemaVersion,
      });
      const createCommittedNode =
        systemTableReadPath.nodes.find(
          (node) =>
            node?.id ===
              (tableMetadata?.metadataNodeId || tableMetadata?.writeNodeId || null),
        ) ||
        resolveCanonicalSystemTableWriteNode(systemTableReadPath.nodes);
      const createCommittedSnapshot = await collectBenchmarkMetadataSnapshot({
        nodeClient,
        node: createCommittedNode,
        tableName: benchmarkTableName,
        tableId: state.requiredSchemaTableId,
        requiredSchemaVersion: state.requiredSchemaVersion,
        stage: BENCHMARK_METADATA_STAGE_CREATE_COMMITTED,
        readinessState: null,
        probeError: null,
      });
      recordBenchmarkMetadataSnapshot(createCommittedSnapshot);
      const sutLoadResolution = await resolveSutLoadNodes(
        nodeClient,
        nodes,
        seedNode,
        {
          timeoutMs: effectiveSutLoadDiscoveryTimeoutMs,
          pollIntervalMs: benchmarkConfig.readyPollIntervalMs,
          timing: scenarioOverrides.timing,
          tableName: benchmarkTableName,
          tableId: state.requiredSchemaTableId,
          minReachableNodeCount: targetSutLoadNodeCount,
          strictMinReachable: benchmarkConfig.strictDiscovery === true,
          admissionRuntimeOwnership: state.runtimeAdmissionOwnership,
        },
      );
      const sutLoadNodes = sutLoadResolution.nodes;
      state.sutLoadDiscovery = sutLoadResolution.diagnostics;
      state.strictDiscoveryGate = buildStrictDiscoveryGate({
        strictMinReachable: benchmarkConfig.strictDiscovery === true,
        requiredReachableNodeCount: targetSutLoadNodeCount,
        nodes: sutLoadNodes,
        diagnostics: state.sutLoadDiscovery,
      });
      state.strictBenchmarkGate.discovery = state.strictDiscoveryGate;
      const discoveryDiagnostics = formatSutLoadDiscoveryDiagnostics(
        state.sutLoadDiscovery,
      );
      emitPhaseProgress(phaseContext, 'discovered benchmark load candidates', {
        reachableNodeCount: sutLoadNodes.length,
        requiredNodeCount: targetSutLoadNodeCount,
      });
      if (benchmarkConfig.strictDiscovery === true) {
        const strictDiscoveryErrorDetail =
          DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES +
          ': required=' + String(targetSutLoadNodeCount) +
          ', reachable=' + String(sutLoadNodes.length);
        assert.ok(
          sutLoadNodes.length >= targetSutLoadNodeCount,
          'No discovered admin-ready load service nodes available for benchmark load' +
            ' (' + strictDiscoveryErrorDetail +
            (discoveryDiagnostics.length > ZERO ?
              ', ' + discoveryDiagnostics :
              '') +
            ')',
        );
      } else {
        assert.ok(
          sutLoadNodes.length > ZERO,
          'No discovered admin-ready load service nodes available for benchmark load' +
            (discoveryDiagnostics.length > ZERO ?
              ' (' + discoveryDiagnostics + ')' :
              ''),
        );
      }
      state.sutLoadNodes = sutLoadNodes;
      emitPhaseMeaningfulChange(phaseContext, 'benchmark load candidates admitted', {
        admittedNodeIds: sutLoadNodes.map((node) => node.id),
      });
      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          benchmarkTableName,
          requiredSchemaVersion: state.requiredSchemaVersion,
          requiredSchemaVersionSource: state.requiredSchemaVersionSource,
          requiredSchemaVersionMetadataNodeId:
            state.requiredSchemaVersionMetadataNodeId,
          requiredSchemaTableId: state.requiredSchemaTableId,
          benchmarkMetadataFlow: buildBenchmarkMetadataFlow(
            state,
            benchmarkTableName,
          ),
          effectiveReadyTimeoutMs: effectiveSutLoadDiscoveryTimeoutMs,
          systemTableReadPath: state.systemTableReadPath,
          sutLoadNodeIds: sutLoadNodes.map((node) => node.id),
          sutLoadDiscovery: state.sutLoadDiscovery,
          strictDiscoveryGate: state.strictDiscoveryGate,
          strictBenchmarkGate: state.strictBenchmarkGate,
          runtimeAdmissionOwnership:
            buildAdmissionRuntimeOwnershipSummary(
              state.runtimeAdmissionOwnership,
            ),
          quietMode: buildQuietModeDetails(state.quietMode, {
            defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
          }),
        },
      };
    },
    [SCENARIO_PHASE.CONVERGE]: async (phaseContext) => {
      emitPhaseProgress(phaseContext, 'confirming converged control plane');
      await ensureConvergenceResolved();
      emitPhaseMeaningfulChange(phaseContext, 'convergence confirmation complete', {
        diagnosticsCoverage: state.diagnosticsCoverage?.status || null,
      });
      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          convergence: state.convergence,
          diagnosticsCoverage: state.diagnosticsCoverage,
        },
      };
    },
    [SCENARIO_PHASE.PRE_LOAD_GATE]: async (phaseContext) => {
      markQuietModePhase(state.quietMode, SCENARIO_PHASE.PRE_LOAD_GATE);
      emitPhaseProgress(phaseContext, 'waiting for quiescent benchmark topology', {
        candidateNodeCount: state.sutLoadNodes.length,
      });
      const preLoadStableWindowMs = benchmarkConfig.strictPreloadReadiness === true ?
        benchmarkConfig.preloadRequiredStableMs :
        benchmarkConfig.quiescentStableWindowMs;
      let quiescenceResult;
      try {
        quiescenceResult = await waitForSutLoadQuiescence({
          nodeClient,
          loadNodes: state.sutLoadNodes,
          seedNode,
          snapshotNodes: state.sutLoadNodes,
          tableName: benchmarkTableName,
          timeoutMs: benchmarkConfig.quiescentTimeoutMs,
          pollIntervalMs: benchmarkConfig.quiescentPollIntervalMs,
          stableWindowMs: preLoadStableWindowMs,
          noProgressTimeoutMs: benchmarkConfig.quiescentNoProgressTimeoutMs,
          maxReplicaOpsInFlight: benchmarkConfig.preloadMaxReplicaOpsInFlight,
          strictCanonicalReadiness:
            benchmarkConfig.strictPreloadReadiness === true,
          requiredSchemaVersion: state.requiredSchemaVersion,
          requiredSchemaTableId: state.requiredSchemaTableId,
          onConvergenceEvent: recordConvergenceEvent,
          onBenchmarkMetadataSnapshot: recordBenchmarkMetadataSnapshot,
          runtimeAdmissionOwnership: state.runtimeAdmissionOwnership,
          timing: scenarioOverrides.timing,
        });
      } catch (error) {
        const gateResult = error?.gateResult || {};
        const stalledReason = Object.keys(gateResult.reasonHistogram || {}).find(
          (reason) => String(reason || '').includes(NO_PROGRESS_REASON_CODE),
        ) || null;
        if (stalledReason) {
          emitPhaseNoProgressFailure(
            phaseContext,
            'pre-load gate aborted for no progress',
            {
              reason: stalledReason,
              attempts: Number(gateResult.attempts || ZERO),
              stableElapsedMs: Number(gateResult.stableElapsedMs || ZERO),
              budgetMs: benchmarkConfig.quiescentNoProgressTimeoutMs,
            },
          );
        }
        if (benchmarkConfig.strictPreloadReadiness === true) {
          const nodeReasonsByNodeId = extractNodeProbeReasonsByNodeId(gateResult);
          const formattedNodeReasons = formatNodeProbeReasons(nodeReasonsByNodeId);
          const saturation = buildSaturationCounters({
            reasonHistogram: gateResult.reasonHistogram,
          });
          const strictPreloadError = (
            STRICT_PRELOAD_READINESS_REASON_FAILED +
              ': ' +
              String(error?.message || error) +
              ', ' +
              STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX +
              formattedNodeReasons
          );
          return {
            status: PHASE_STATUS.FAIL,
            artifacts: {
              strictPreloadReadiness: true,
              preloadRequiredStableMs: preLoadStableWindowMs,
              preloadMaxReplicaOpsInFlight:
                benchmarkConfig.preloadMaxReplicaOpsInFlight,
              quietMode: buildQuietModeDetails(state.quietMode, {
                defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
              }),
              nodeReasonsByNodeId,
              versionConvergence: gateResult.versionConvergence || null,
              readinessTimeline: gateResult.readinessTimeline || [],
              benchmarkMetadataFlow: buildBenchmarkMetadataFlow(
                state,
                benchmarkTableName,
              ),
              saturation,
              gateResult: {
                mode: gateResult.mode || POST_LOAD_DRAIN_MODE_FAILED,
                attempts: Number(gateResult.attempts || ZERO),
                stableElapsedMs: Number(gateResult.stableElapsedMs || ZERO),
                includedNodeIds: gateResult.includedNodeIds || [],
                excludedNodeIds: gateResult.excludedNodeIds || [],
                reasonHistogram: gateResult.reasonHistogram || {},
                partitionGroupInFlight: gateResult.partitionGroupInFlight || {},
                replicaOperationTimelineByOperationId:
                  gateResult.replicaOperationTimelineByOperationId || {},
                readinessTimeline: gateResult.readinessTimeline || [],
              },
            },
            errors: [strictPreloadError],
          };
        }
        throw error;
      }
      state.quiescenceResult = quiescenceResult;
      state.effectiveSutLoadNodes = quiescenceResult.readyLoadNodes;
      state.excludedSutLoadNodeIds = quiescenceResult.excludedLoadNodeIds;
      emitPhaseMeaningfulChange(phaseContext, 'pre-load topology quiescent', {
        includedNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
        excludedNodeIds: state.excludedSutLoadNodeIds,
      });
      if (strictBenchmarkMode === true) {
        const invariantSnapshotNodes =
          state.effectiveSutLoadNodes.length > ZERO ?
            state.effectiveSutLoadNodes :
            state.sutLoadNodes;
        const preLoadSnapshotsByNodeId = invariantSnapshotNodes.length > ZERO ?
          await collectPreflightCriticalPathSnapshots({
            nodeClient,
            nodes: invariantSnapshotNodes,
          }) :
          {};
        state.preLoadInvariantEvaluation = evaluateRootCauseInvariants({
          snapshotsByNodeId: preLoadSnapshotsByNodeId,
        });
        const strictInvariantBreaches = summarizeInvariantBreaches(
          selectStrictInvariantGateEntries(
            state.preLoadInvariantEvaluation.invariants,
          ),
        );
        state.strictBenchmarkGate.invariants = {
          status: strictInvariantBreaches.hardCount > ZERO ?
            PHASE_STATUS.FAIL :
            PHASE_STATUS.OK,
          totalCount: strictInvariantBreaches.totalCount,
          hardCount: strictInvariantBreaches.hardCount,
          softCount: strictInvariantBreaches.softCount,
          dominantInvariant: state.preLoadInvariantEvaluation.dominantInvariant,
          breaches: strictInvariantBreaches.failing,
        };
        if (strictInvariantBreaches.hardCount > ZERO) {
          return {
            status: PHASE_STATUS.FAIL,
            artifacts: {
              strictBenchmarkGate: state.strictBenchmarkGate,
              invariantBreaches: strictInvariantBreaches,
              quietMode: buildQuietModeDetails(state.quietMode, {
                defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
              }),
            },
            errors: strictInvariantBreaches.hardBreaches.map((breach) =>
              'hard invariant breach: ' +
                String(breach.reasonCode || breach.invariantId || 'unknown'),
            ),
          };
        }
      }
      state.postLoadDrain = createInitialPostLoadDrain(
        state.effectiveSutLoadNodes,
        state.excludedSutLoadNodeIds,
      );
      state.rebalancingPressure.preLoadGate = buildPreLoadRebalancingPressure(
        quiescenceResult,
        benchmarkConfig,
      );
      assert.ok(
        state.effectiveSutLoadNodes.length > ZERO,
        'No quiescent system-under-test load nodes available for benchmark load',
      );
      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          mode: quiescenceResult.mode,
          attempts: quiescenceResult.attempts,
          stableElapsedMs: quiescenceResult.stableElapsedMs,
          includedNodeIds: quiescenceResult.readyLoadNodes.map((node) => node.id),
          excludedNodeIds: quiescenceResult.excludedLoadNodeIds,
          partitionGroupInFlight: quiescenceResult.partitionGroupInFlight || {},
          replicaOperationTimelineByOperationId:
            quiescenceResult.replicaOperationTimelineByOperationId || {},
          reasonHistogram: quiescenceResult.reasonHistogram || {},
          versionConvergence: quiescenceResult.versionConvergence || null,
          benchmarkMetadataFlow: buildBenchmarkMetadataFlow(
            state,
            benchmarkTableName,
          ),
          strictPreloadReadiness: benchmarkConfig.strictPreloadReadiness === true,
          preloadRequiredStableMs: preLoadStableWindowMs,
          preloadMaxReplicaOpsInFlight:
            benchmarkConfig.preloadMaxReplicaOpsInFlight,
          quietMode: buildQuietModeDetails(state.quietMode, {
            defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
          }),
        },
      };
    },
    [SCENARIO_PHASE.LOAD]: async (phaseContext) => {
      markQuietModePhase(state.quietMode, SCENARIO_PHASE.LOAD);
      emitPhaseProgress(phaseContext, 'starting system-under-test load run', {
        admittedNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
        loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
      });
      const sutLoadResult = await runSutSharedLoad({
        nodeClient,
        seedNode,
        loadNodes: state.effectiveSutLoadNodes,
        createLoadGenerator: scenarioOverrides.createLoadGenerator,
        loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
        loadDuration: benchmarkConfig.loadDuration,
        loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
        loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
        maxPendingQueueDepth: benchmarkConfig.maxPendingQueueDepth,
        earlyRejectOnQueueFull: benchmarkConfig.earlyRejectOnQueueFull,
        tableName: benchmarkTableName,
        nodeFailureThreshold: benchmarkConfig.nodeFailureThreshold,
        nodeFailureCooldownMs: benchmarkConfig.nodeFailureCooldownMs,
        requiredSchemaVersion: state.requiredSchemaVersion,
        benchmarkConfig,
        runtimeAdmissionOwnership: state.runtimeAdmissionOwnership,
      });
      state.loadMetrics = normalizeLoadMetrics(sutLoadResult.metrics);
      state.rebalancingPressure.load = sutLoadResult.rebalancingPressure;
      state.runtimeInternalSignalMessages = Array.isArray(
        sutLoadResult.internalSignalMessages,
      ) ?
        [...sutLoadResult.internalSignalMessages] :
        [];
      state.saturation = buildSaturationCounters({
        loadMetrics: state.loadMetrics,
        internalSignalMessages: state.runtimeInternalSignalMessages,
      });
      emitPhaseMeaningfulChange(phaseContext, 'system-under-test load completed', {
        total: state.loadMetrics.total,
        failed: state.loadMetrics.failed,
        attemptErrors: Number(state.loadMetrics.attemptErrors || ZERO),
      });
      const loadPinning = state.rebalancingPressure?.load?.pinning || {};
      if (loadPinning.enabled === true &&
          loadPinning.bypassed !== true &&
          loadPinning.violated === true) {
        throw new Error(
          REBALANCING_WINDOW_PINNING_VIOLATION_REASON +
            ': ' +
            formatLoadRebalancingPinningReasons(loadPinning.violationReasons),
        );
      }
      state.overloadPolicyResult = evaluateOverloadPolicy(
        state.loadMetrics,
        {
          strictOverloadPolicy: benchmarkConfig.strictOverloadPolicy === true,
          overloadPolicy: benchmarkConfig.overloadPolicy,
        },
      );
      state.strictBenchmarkGate.overload = state.overloadPolicyResult;
      if (benchmarkConfig.strictOverloadPolicy === true &&
          state.overloadPolicyResult.status === DISCOVERY_GATE_STATUS_FAILED) {
        throw new Error(
          OVERLOAD_POLICY_VIOLATION_REASON +
            ': ' +
            formatOverloadPolicyViolations(state.overloadPolicyResult),
        );
      }
      state.writePressureResult = evaluateWritePressure(
        state.loadMetrics,
        {
          strictWritePressure: benchmarkConfig.strictWritePressure === true,
          writePressureThresholds: benchmarkConfig.writePressureThresholds,
        },
      );
      state.strictBenchmarkGate.writePressure = state.writePressureResult;
      if (benchmarkConfig.strictWritePressure === true &&
          state.writePressureResult.status === DISCOVERY_GATE_STATUS_FAILED) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: {
            sutLoadNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
            loadMetrics: state.loadMetrics,
            rebalancingPressure: state.rebalancingPressure.load,
            loadParity: state.loadParity,
            overloadPolicyResult: state.overloadPolicyResult,
            writePressure: state.writePressureResult,
            saturation: state.saturation,
            strictBenchmarkGate: state.strictBenchmarkGate,
          },
          errors: [
            WRITE_PRESSURE_THRESHOLD_EXCEEDED_REASON +
              ': ' +
              formatWritePressureViolations(state.writePressureResult),
          ],
        };
      }

      const baseline = await resolveBaselineMetrics({
        cluster,
        benchmarkConfig,
        baselineLoadNodeCountOverride: baselineLoadNodeCountForRun,
        scenarioOverrides,
        provider,
        networkName,
        benchmarkTableName,
      });
      state.baselineMetrics = baseline.baselineMetrics;
      state.baselineCacheMetadata = baseline.baselineCacheMetadata;
      state.baselinePrimaryContainerIp = baseline.baselinePrimaryContainerIp;
      state.baselineReplicaContainerIps = baseline.baselineReplicaContainerIps;
      state.baselineLoadNodeCount = baseline.baselineLoadNodeCount;
      state.baselinePoolMaxConnections = baseline.baselinePoolMaxConnections;
      emitPhaseMeaningfulChange(phaseContext, 'baseline load comparison ready', {
        baselineOpsPerSec: Number(state.baselineMetrics?.opsPerSec || ZERO),
      });
      state.loadParity = buildLoadParity({
        benchmarkConfig,
        benchmarkTableName,
        sutLoadNodes: state.effectiveSutLoadNodes,
        baselineLoadNodeCount: state.baselineLoadNodeCount,
        baselinePoolMaxConnections: state.baselinePoolMaxConnections,
        nodeClientPolicySnapshot,
      });
      state.strictBenchmarkGate.parity = buildStrictParityGate({
        strictParity: benchmarkConfig.strictParity === true,
        parity: state.loadParity,
      });
      const strictParityMismatch = benchmarkConfig.strictParity === true &&
        state.loadParity.status === LOAD_PARITY_STATUS_MISMATCHED;
      const shouldFailOnParityMismatch = strictParityMismatch ||
        (benchmarkConfig.failOnLoadParityMismatch &&
          state.loadParity.status === LOAD_PARITY_STATUS_MISMATCHED);
      if (shouldFailOnParityMismatch) {
        const mismatchPrefix = strictParityMismatch ?
          STRICT_PARITY_REASON_MISMATCH :
          'load_parity_mismatch';
        throw new Error(
          mismatchPrefix +
            ': ' +
            formatLoadParityReasons(state.loadParity),
        );
      }

      assert.ok(
        state.loadMetrics.total > ZERO,
        'System-under-test load run produced no operations',
      );
      assert.ok(
        Number(state.baselineMetrics?.opsPerSec || ZERO) > ZERO,
        'Postgres baseline load run produced zero throughput',
      );

      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          sutLoadNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
          loadMetrics: state.loadMetrics,
          rebalancingPressure: state.rebalancingPressure.load,
          loadParity: state.loadParity,
          overloadPolicyResult: state.overloadPolicyResult,
          writePressure: state.writePressureResult,
          saturation: state.saturation,
          strictBenchmarkGate: state.strictBenchmarkGate,
          baselineCache: state.baselineCacheMetadata,
          baselineOpsPerSec: Number(state.baselineMetrics?.opsPerSec || ZERO),
        },
      };
    },
    [SCENARIO_PHASE.POST_LOAD_DRAIN]: async (phaseContext) => {
      emitPhaseProgress(phaseContext, 'waiting for post-load drain', {
        admittedNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
      });
      try {
        const postLoadDrainResult = await waitForSutLoadQuiescence({
          nodeClient,
          loadNodes: state.effectiveSutLoadNodes,
          seedNode,
          snapshotNodes: state.effectiveSutLoadNodes,
          tableName: benchmarkTableName,
          timeoutMs: benchmarkConfig.postLoadDrainTimeoutMs,
          pollIntervalMs: benchmarkConfig.postLoadDrainPollIntervalMs,
          stableWindowMs: benchmarkConfig.postLoadDrainStableWindowMs,
          noProgressTimeoutMs:
            benchmarkConfig.postLoadDrainNoProgressTimeoutMs,
          runtimeAdmissionOwnership: state.runtimeAdmissionOwnership,
          timing: scenarioOverrides.timing,
        });
        state.postLoadDrain = {
          status: POST_LOAD_DRAIN_STATUS_OK,
          mode: postLoadDrainResult.mode,
          attempts: postLoadDrainResult.attempts,
          stableElapsedMs: postLoadDrainResult.stableElapsedMs,
          error: null,
          reasonHistogram: postLoadDrainResult.reasonHistogram || {},
          partitionGroupInFlight:
            postLoadDrainResult.partitionGroupInFlight || {},
          includedNodeIds:
            postLoadDrainResult.includedNodeIds ||
            postLoadDrainResult.readyLoadNodes.map((node) => node.id),
          excludedNodeIds: postLoadDrainResult.excludedLoadNodeIds,
        };
        state.rebalancingPressure.postLoadDrain =
          buildPostLoadDrainRebalancingPressure(
            state.postLoadDrain,
            benchmarkConfig,
          );
        emitPhaseMeaningfulChange(phaseContext, 'post-load drain complete', {
          includedNodeIds: state.postLoadDrain.includedNodeIds,
          excludedNodeIds: state.postLoadDrain.excludedNodeIds,
        });
        return {
          status: PHASE_STATUS.OK,
          artifacts: {
            ...state.postLoadDrain,
            rebalancingPressure: state.rebalancingPressure.postLoadDrain,
          },
        };
      } catch (error) {
        const gateResult = error?.gateResult || {};
        const stalledReason = Object.keys(gateResult.reasonHistogram || {}).find(
          (reason) => String(reason || '').includes(NO_PROGRESS_REASON_CODE),
        ) || null;
        if (stalledReason) {
          emitPhaseNoProgressFailure(
            phaseContext,
            'post-load drain aborted for no progress',
            {
              reason: stalledReason,
              attempts: Number(gateResult.attempts || ZERO),
              stableElapsedMs: Number(gateResult.stableElapsedMs || ZERO),
              budgetMs: benchmarkConfig.postLoadDrainNoProgressTimeoutMs,
            },
          );
        }
        state.postLoadDrain = {
          status: POST_LOAD_DRAIN_STATUS_FAILED,
          mode: gateResult.mode || POST_LOAD_DRAIN_MODE_FAILED,
          attempts: Number(gateResult.attempts || ZERO),
          stableElapsedMs: Number(gateResult.stableElapsedMs || ZERO),
          error: String(error?.message || error),
          reasonHistogram: gateResult.reasonHistogram || {},
          partitionGroupInFlight: gateResult.partitionGroupInFlight || {},
          includedNodeIds: gateResult.includedNodeIds || [],
          excludedNodeIds: gateResult.excludedNodeIds || [],
        };
        state.rebalancingPressure.postLoadDrain =
          buildPostLoadDrainRebalancingPressure(
            state.postLoadDrain,
            benchmarkConfig,
          );
        state.consistencyVerdict = CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE;
        if (benchmarkConfig.insufficientEvidencePolicy === ASSERTION_POLICY.HARD) {
          return {
            status: PHASE_STATUS.FAIL,
            artifacts: {
              ...state.postLoadDrain,
              rebalancingPressure: state.rebalancingPressure.postLoadDrain,
            },
            errors: [
              'Post-load drain gate failed and policy requires hard failure: ' +
                state.postLoadDrain.error,
            ],
          };
        }
        return {
          status: PHASE_STATUS.WARN,
          artifacts: {
            ...state.postLoadDrain,
            rebalancingPressure: state.rebalancingPressure.postLoadDrain,
          },
          warnings: [
            'Post-load drain gate failed: ' + state.postLoadDrain.error,
          ],
        };
      }
    },
    [SCENARIO_PHASE.VERIFY]: async (phaseContext) => {
      emitPhaseProgress(phaseContext, 'collecting verification snapshots', {
        verificationCandidateCount: state.effectiveSutLoadNodes.length,
      });
      const verificationNodes = selectVerificationNodes(
        state.effectiveSutLoadNodes,
        state.postLoadDrain,
      );
      state.verificationNodeIds = verificationNodes.map((node) => node.id);
      const verificationNodeSet = new Set(state.verificationNodeIds);
      state.verificationExcludedNodeIds = state.effectiveSutLoadNodes
        .map((node) => node.id)
        .filter((nodeId) => !verificationNodeSet.has(nodeId));

      const initialSnapshotCollection =
        await collectControlSnapshotsFromNodes(
          nodeClient,
          verificationNodes,
          {
            context: NODE_CLIENT_TRANSIENT_CONTEXT,
            warningPrefix: SNAPSHOT_WARNING_PREFIX,
          },
        );
      let snapshots = initialSnapshotCollection.snapshots;
      const snapshotWarnings = [
        ...initialSnapshotCollection.warnings,
      ];
      let evaluation = state.verificationNodeIds.length <= ONE ?
        {
          verdict: CONSISTENCY_VERDICT.CONSISTENT,
          hardFailure: false,
          coverage: {
            reachableNodes: state.verificationNodeIds.length,
            snapshotNodes: snapshots.length,
          },
          mismatches: [],
          evidenceWarnings: [],
        } :
        consistencyEvaluator.evaluate({
          reachableNodeIds: state.verificationNodeIds,
          snapshots,
        });
      const snapshotRefresh =
        createVerificationSnapshotRefreshResult();
      const partitionSetMismatch =
        resolvePartitionSetMismatchEntry(evaluation.mismatches);
      if (partitionSetMismatch &&
          state.verificationNodeIds.length > ONE) {
        const verificationNodeById = new Map();
        for (const node of verificationNodes) {
          const nodeId = String(node?.id || '');
          if (nodeId.length > ZERO) {
            verificationNodeById.set(nodeId, node);
          }
        }
        snapshotRefresh.attempted = true;
        snapshotRefresh.triggerMismatchKind =
          CONSISTENCY_MISMATCH_KIND.PARTITION_SET;
        snapshotRefresh.targetNodeIds =
          resolvePartitionSetRefreshNodeIds(
            partitionSetMismatch,
            state.verificationNodeIds,
          );

        const refreshNodes = snapshotRefresh.targetNodeIds
          .map((nodeId) => verificationNodeById.get(nodeId) || null)
          .filter(Boolean);
        if (refreshNodes.length > ZERO) {
          const refreshSnapshotCollection =
            await collectControlSnapshotsFromNodes(
              nodeClient,
              refreshNodes,
              {
                context: {
                  ...NODE_CLIENT_TRANSIENT_CONTEXT,
                  [NODE_CLIENT_CONTEXT_KEYS.FORCE_AUTHORITATIVE_REPAIR]: true,
                },
                warningPrefix: SNAPSHOT_REFRESH_WARNING_PREFIX,
              },
            );
          snapshotWarnings.push(...refreshSnapshotCollection.warnings);
          for (const snapshot of refreshSnapshotCollection.snapshots) {
            const nodeId = String(snapshot?.nodeId || '');
            if (nodeId.length > ZERO) {
              snapshotRefresh.refreshedNodeIds.push(nodeId);
            }
          }
          for (const warning of refreshSnapshotCollection.warnings) {
            const [nodeId] = String(warning)
              .replace(SNAPSHOT_REFRESH_WARNING_PREFIX, '')
              .split('=');
            if (nodeId) {
              snapshotRefresh.failedNodeIds.push(nodeId);
            }
          }
          if (refreshSnapshotCollection.snapshots.length > ZERO) {
            snapshots = replaceSnapshotsByNodeId(
              snapshots,
              refreshSnapshotCollection.snapshots,
            );
            evaluation = consistencyEvaluator.evaluate({
              reachableNodeIds: state.verificationNodeIds,
              snapshots,
            });
            const refreshedPartitionSetMismatch =
              resolvePartitionSetMismatchEntry(
                evaluation.mismatches,
              );
            snapshotRefresh.resolved =
              refreshedPartitionSetMismatch === null;
            if (refreshedPartitionSetMismatch) {
              snapshotWarnings.push(
                SNAPSHOT_REFRESH_WARNING_UNRESOLVED,
              );
            }
          }
        } else {
          snapshotRefresh.resolved = false;
          snapshotWarnings.push(
            SNAPSHOT_REFRESH_WARNING_SKIPPED,
          );
        }
      }
      state.verificationSnapshotRefresh = snapshotRefresh;
      const evidenceWarnings = [
        ...evaluation.evidenceWarnings,
        ...snapshotWarnings,
      ];
      let consistencyVerdict = evaluation.verdict;
      if (consistencyVerdict === CONSISTENCY_VERDICT.CONSISTENT &&
          evidenceWarnings.length > ZERO) {
        consistencyVerdict = CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE;
      }
      if (consistencyVerdict === CONSISTENCY_VERDICT.CONSISTENT &&
          state.postLoadDrain.status === POST_LOAD_DRAIN_STATUS_FAILED) {
        consistencyVerdict = CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE;
      }
      state.consistencyVerdict = consistencyVerdict;
      state.consistencyEvaluation = {
        coverage: evaluation.coverage,
        mismatches: evaluation.mismatches,
        evidenceWarnings,
      };

      state.consistencyResult = await assertClusterConsistencyWithRetry(cluster, {
        maxAttempts: benchmarkConfig.consistencyAssertMaxAttempts,
        retryDelayMs: benchmarkConfig.consistencyAssertRetryDelayMs,
        timing: scenarioOverrides.timing,
      });
      emitPhaseMeaningfulChange(phaseContext, 'verification consistency evaluated', {
        verdict: state.consistencyVerdict,
        snapshotCount: snapshots.length,
      });

      state.assertionPolicyResult = evaluateAssertionPolicy({
        consistencyVerdict: state.consistencyVerdict,
        invariants: selectStrictInvariantGateEntries(
          state.preLoadInvariantEvaluation.invariants,
        ),
        loadMetrics: state.loadMetrics,
        policy: {
          insufficientEvidence: benchmarkConfig.insufficientEvidencePolicy,
        },
      });

      state.internalSignalCounts = buildInternalSignalCounts(
        state.loadMetrics,
        scenarioOverrides,
        state.runtimeInternalSignalMessages,
      );
      state.internalSignalThresholdResult = evaluateInternalSignalThresholds(
        state.internalSignalCounts,
        benchmarkConfig.internalSignalThresholds,
      );
      const cdcTelemetryRawByNode = await collectCdcTelemetryByNode(
        nodeClient,
        verificationNodes,
        scenarioOverrides,
      );
      state.cdcTelemetry = buildCdcTelemetryState({
        rawByNode: cdcTelemetryRawByNode,
        requiredNodeIds: state.verificationNodeIds,
        strict: benchmarkConfig.strictCdcTelemetrySchema === true,
      });
      state.authoritativeFallbackResult = evaluateAuthoritativeFallbackPolicy(
        state.cdcTelemetry,
        {
          strictAuthoritativeFallback:
            benchmarkConfig.strictAuthoritativeFallback === true,
          authoritativeFallbackThresholds:
            benchmarkConfig.authoritativeFallbackThresholds,
        },
      );
      state.strictBenchmarkGate.authoritativeFallback =
        state.authoritativeFallbackResult;
      if (benchmarkConfig.strictCdcTelemetrySchema === true &&
          state.cdcTelemetry.schema.valid !== true) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: [
            CDC_TELEMETRY_SCHEMA_MISSING_REASON +
              ': ' +
              formatCdcTelemetrySchemaErrors(state.cdcTelemetry),
          ],
        };
      }
      if (benchmarkConfig.strictAuthoritativeFallback === true &&
          state.authoritativeFallbackResult.status ===
            DISCOVERY_GATE_STATUS_FAILED) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: [
            AUTHORITATIVE_FALLBACK_THRESHOLD_EXCEEDED_REASON +
              ': ' +
              formatAuthoritativeFallbackViolations(
                state.authoritativeFallbackResult,
              ),
          ],
        };
      }
      if (state.internalSignalThresholdResult.failOnThresholdBreach &&
          state.internalSignalThresholdResult.breached) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: [
            INTERNAL_SIGNAL_THRESHOLD_BREACH_REASON +
              ': ' +
              formatInternalSignalBreaches(state.internalSignalThresholdResult),
          ],
        };
      }

      if (state.assertionPolicyResult.passed !== true) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: state.assertionPolicyResult.hardFailures
            .map((failure) => String(failure?.message || failure)),
        };
      }

      const warnings = state.assertionPolicyResult.softWarnings
        .map((warning) => String(warning?.message || warning));
      return {
        status: warnings.length > ZERO ? PHASE_STATUS.WARN : PHASE_STATUS.OK,
        artifacts: buildVerificationArtifacts(state, {
          includeVerificationNodes: true,
          includeConsistencyAssertionAttempts: true,
        }),
        warnings,
      };
    },
    [SCENARIO_PHASE.TEARDOWN]: async () => ({
      status: PHASE_STATUS.OK,
      artifacts: (() => {
        exitQuietMode(
          state.quietMode,
          SCENARIO_PHASE.TEARDOWN,
          QUIET_MODE_REASON_RUN_FINALIZE,
        );
        return {
          complete: true,
          quietMode: buildQuietModeDetails(state.quietMode, {
            defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
          }),
        };
      })(),
    }),
  };

  let orchestrationResult = null;
  try {
    orchestrationResult = await orchestrator.run(phaseHandlers);
  } finally {
    exitQuietMode(
      state.quietMode,
      SCENARIO_PHASE.TEARDOWN,
      QUIET_MODE_REASON_RUN_FINALIZE,
    );
  }
  const failedPhase = orchestrationResult.phases.find((phaseResult) =>
    phaseResult.status === PHASE_STATUS.FAIL,
  );
  if (failedPhase) {
    const error = new Error(
      'postgres-baseline-comparison failed in phase ' +
        failedPhase.phase +
        ': ' +
        failedPhase.errors.join('; '),
    );
    const failureArtifact = buildUnifiedFailureArtifact(
      failedPhase,
      benchmarkConfig,
      {
        loadMetrics: state.loadMetrics,
      },
    );
    const failureDiagnosticNodes = selectFailureDiagnosticNodes({
      nodes,
      state,
      failureArtifact,
    });
    const shouldCapturePreflightSnapshots = failureArtifact.strictMode === true &&
      (failureArtifact.phase === SCENARIO_PHASE.PRE_FLIGHT ||
        failureArtifact.phase === SCENARIO_PHASE.PRE_LOAD_GATE);
    const snapshotNodes = failureDiagnosticNodes;
    const snapshotsByNodeId = snapshotNodes.length > ZERO ?
      (shouldCapturePreflightSnapshots ?
        await collectPreflightCriticalPathSnapshots({
          nodeClient,
          nodes: snapshotNodes,
          context: NODE_CLIENT_TRANSIENT_CONTEXT,
        }) :
        await collectFailureControlSnapshots({
          nodeClient,
          nodes: snapshotNodes,
          context: NODE_CLIENT_TRANSIENT_CONTEXT,
        })) :
      null;
    const snapshotKind = snapshotsByNodeId ?
      (shouldCapturePreflightSnapshots ?
        ROOT_CAUSE_SNAPSHOT_KIND_PREFLIGHT_CRITICAL_PATH :
        ROOT_CAUSE_SNAPSHOT_KIND_CONTROL_SNAPSHOT) :
      null;
    const adminQueryTraceByNodeId = failureDiagnosticNodes.length > ZERO ?
      collectAdminQueryTraceByNodeId(failureDiagnosticNodes) :
      null;
    const channelMetrics =
      typeof nodeClient?.getMetricsSnapshot === 'function' ?
        nodeClient.getMetricsSnapshot() :
        null;
    const channelStateByChannel =
      typeof nodeClient?.getChannelStateSnapshot === 'function' ?
        nodeClient.getChannelStateSnapshot() :
        null;
    const rootCauseBundle = buildRootCauseBundle({
      failureArtifact,
      snapshotsByNodeId,
      adminQueryTraceByNodeId,
      snapshotKind,
      evaluateInvariants: shouldCapturePreflightSnapshots,
      channelMetrics,
      channelStateByChannel,
    });
    const noProgressDiagnostics = buildNoProgressDiagnostics(failedPhase);
    error.diagnostics = {
      failure: failureArtifact,
      loadMetrics: state.loadMetrics,
      failedPhase: buildFailedPhaseDiagnostics(failedPhase),
      noProgress: noProgressDiagnostics,
      invariantBreaches: summarizeInvariantBreaches(rootCauseBundle?.invariants),
      channelMetrics,
      channelStateByChannel,
      rootCauseBundle,
    };
    throw error;
  }

  const comparison = buildComparison(state.loadMetrics, state.baselineMetrics);
  const phaseDecisions = buildPhaseDecisions(
    orchestrationResult.phases,
    benchmarkConfig,
  );
  const startupDecisionRecord = buildStartupDecisionRecord(phaseDecisions);
  const sutLoadDiscoveryExcludedReadinessByNodeId =
    aggregateDiscoveryReadinessExclusionsByNodeId(state.sutLoadDiscovery);

  return {
    loadMetrics: state.loadMetrics,
    details: {
      benchmark: {
        tool: 'shared-load-generator',
        workload: BENCHMARK_WORKLOAD_PROFILE,
        durationSeconds: parseDurationToMs(benchmarkConfig.loadDuration) / 1000,
        clients: benchmarkConfig.baselineLoadNodeCount,
        baselineLoadNodeCountConfigured: benchmarkConfig.baselineLoadNodeCount,
        baselineLoadNodeCountApplied: state.baselineLoadNodeCount,
        sutEligibleLoadNodeCount: state.sutLoadNodes.length,
        sutLoadNodeCount: state.effectiveSutLoadNodes.length,
        sutExcludedLoadNodeIds: state.excludedSutLoadNodeIds,
        strictMode: strictBenchmarkMode,
        strictDiscovery: benchmarkConfig.strictDiscovery === true,
        clusterCandidateLoadNodeCount,
        requestedSutLoadNodeCount,
        requiredSutLoadNodeCount: targetSutLoadNodeCount,
        explicitRequiredSutLoadNodeCount,
        strictFanoutOptOut,
        strictFanoutOptOutReason,
        strictParity: benchmarkConfig.strictParity === true,
        strictPreloadReadiness: benchmarkConfig.strictPreloadReadiness === true,
        strictCdcTelemetrySchema:
          benchmarkConfig.strictCdcTelemetrySchema === true,
        strictAuthoritativeFallback:
          benchmarkConfig.strictAuthoritativeFallback === true,
        strictOverloadPolicy:
          benchmarkConfig.strictOverloadPolicy === true,
        strictWritePressure:
          benchmarkConfig.strictWritePressure === true,
        quietMode: buildQuietModeDetails(state.quietMode, {
          defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
        }),
        authoritativeFallbackThresholds:
          benchmarkConfig.authoritativeFallbackThresholds,
        overloadPolicy: benchmarkConfig.overloadPolicy,
        writePressureThresholds: benchmarkConfig.writePressureThresholds,
        forceLocalSystemTableReadShortcut:
          benchmarkConfig.forceLocalSystemTableReadShortcut === true,
        systemTableReadPath: state.systemTableReadPath,
        requiredSchemaVersion: state.requiredSchemaVersion,
        requiredSchemaVersionSource: state.requiredSchemaVersionSource,
        requiredSchemaVersionMetadataNodeId:
          state.requiredSchemaVersionMetadataNodeId,
        requiredSchemaTableId: state.requiredSchemaTableId,
        benchmarkMetadataFlow: buildBenchmarkMetadataFlow(
          state,
          benchmarkTableName,
        ),
        convergenceTimeline: state.convergenceTimeline,
        strictDiscoveryGate: state.strictDiscoveryGate,
        strictBenchmarkGate: state.strictBenchmarkGate,
        jobs: benchmarkConfig.jobs,
        loadTargetOpsPerSec: benchmarkConfig.loadOpsPerSec,
        loadDuration: benchmarkConfig.loadDuration,
        loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
        loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
        maxPendingQueueDepth: benchmarkConfig.maxPendingQueueDepth,
        earlyRejectOnQueueFull: benchmarkConfig.earlyRejectOnQueueFull === true,
        failOnLoadParityMismatch: benchmarkConfig.failOnLoadParityMismatch,
        internalSignalThresholds: benchmarkConfig.internalSignalThresholds,
        internalSignalCounts: state.internalSignalCounts,
        internalSignalThresholdResult: state.internalSignalThresholdResult,
        cdcTelemetry: state.cdcTelemetry,
        authoritativeFallbackResult: state.authoritativeFallbackResult,
        overloadPolicyResult: state.overloadPolicyResult,
        writePressure: state.writePressureResult,
        saturation: state.saturation,
        nodeFailureThreshold: benchmarkConfig.nodeFailureThreshold || null,
        nodeFailureCooldownMs: benchmarkConfig.nodeFailureCooldownMs || null,
        quiescentTimeoutMs: benchmarkConfig.quiescentTimeoutMs,
        quiescentPollIntervalMs: benchmarkConfig.quiescentPollIntervalMs,
        quiescentStableWindowMs: benchmarkConfig.quiescentStableWindowMs,
        quiescentNoProgressTimeoutMs:
          benchmarkConfig.quiescentNoProgressTimeoutMs,
        preloadRequiredStableMs: benchmarkConfig.preloadRequiredStableMs,
        preloadMaxReplicaOpsInFlight:
          benchmarkConfig.preloadMaxReplicaOpsInFlight,
        pinRebalancingDuringLoad:
          benchmarkConfig.pinRebalancingDuringLoad === true,
        allowLoadRebalancePinningBypass:
          benchmarkConfig.allowLoadRebalancePinningBypass === true,
        rebalanceHysteresisCooldownMs:
          benchmarkConfig.rebalanceHysteresisCooldownMs,
        rebalanceHysteresisMinDelta:
          benchmarkConfig.rebalanceHysteresisMinDelta,
        loadRebalanceMonitorPollIntervalMs:
          benchmarkConfig.loadRebalanceMonitorPollIntervalMs,
        loadRebalanceMaxReplicaOpsInFlight:
          benchmarkConfig.loadRebalanceMaxReplicaOpsInFlight,
        rebalancingPressure: state.rebalancingPressure,
        consistencyAssertMaxAttempts:
          benchmarkConfig.consistencyAssertMaxAttempts,
        consistencyAssertRetryDelayMs:
          benchmarkConfig.consistencyAssertRetryDelayMs,
        consistencyAssertionAttempts: state.consistencyResult.attempts,
        sutLoadDiscovery: state.sutLoadDiscovery,
        sutLoadDiscoveryExcludedReadinessByNodeId,
        insufficientEvidencePolicy: benchmarkConfig.insufficientEvidencePolicy,
        postLoadDrainStatus: state.postLoadDrain.status,
        postLoadDrainMode: state.postLoadDrain.mode,
        postLoadDrainAttempts: state.postLoadDrain.attempts,
        postLoadDrainStableElapsedMs: state.postLoadDrain.stableElapsedMs,
        postLoadDrainNoProgressTimeoutMs:
          benchmarkConfig.postLoadDrainNoProgressTimeoutMs,
        postLoadDrainError: state.postLoadDrain.error,
        postLoadDrainReasonHistogram: state.postLoadDrain.reasonHistogram,
        postLoadDrainPartitionGroupInFlight:
          state.postLoadDrain.partitionGroupInFlight,
        postLoadDrainIncludedNodeIds: state.postLoadDrain.includedNodeIds,
        postLoadDrainExcludedNodeIds: state.postLoadDrain.excludedNodeIds,
        operations: BENCHMARK_WORKLOAD_OPERATIONS,
        tableName: benchmarkTableName,
        tablePolicies: benchmarkConfig.benchmarkTablePolicies,
      },
      parity: state.loadParity,
      strictBenchmarkGate: state.strictBenchmarkGate,
      overloadPolicyResult: state.overloadPolicyResult,
      writePressure: state.writePressureResult,
      saturation: state.saturation,
      effectiveAdmissionPolicy: state.effectiveAdmissionPolicy,
      baseline: {
        engine: 'postgres',
        image: benchmarkConfig.baselineImage,
        containerIp: state.baselinePrimaryContainerIp,
        replicaContainerIps: state.baselineReplicaContainerIps,
        replicationFactor: benchmarkConfig.replicationFactor,
        syncReplicaAcks: benchmarkConfig.syncReplicaAcks,
        loadNodeCount: state.baselineLoadNodeCount,
        poolMaxConnections: state.baselinePoolMaxConnections,
        cache: state.baselineCacheMetadata,
        metrics: state.baselineMetrics,
      },
      systemUnderTest: {
        seedNodeId: seedNode.id,
        metrics: {
          opsPerSec: state.loadMetrics.opsPerSec,
          latency: state.loadMetrics.latency,
          total: state.loadMetrics.total,
          success: state.loadMetrics.success,
          failed: state.loadMetrics.failed,
          errors: state.loadMetrics.errors,
          attemptErrors: Number(state.loadMetrics.attemptErrors || ZERO),
          loadTargetOpsPerSec: benchmarkConfig.loadOpsPerSec,
          loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        },
      },
      comparison,
      convergence: state.convergence,
      verification: {
        verdict: state.consistencyVerdict,
        confidence: state.assertionPolicyResult.verificationConfidence,
        hardFailures: state.assertionPolicyResult.hardFailures,
        softWarnings: state.assertionPolicyResult.softWarnings,
        invariantBreaches: state.assertionPolicyResult.invariantBreaches,
        coverage: state.consistencyEvaluation.coverage,
        mismatches: state.consistencyEvaluation.mismatches,
        evidenceWarnings: state.consistencyEvaluation.evidenceWarnings,
        snapshotRefresh: state.verificationSnapshotRefresh,
        verificationNodeIds: state.verificationNodeIds,
        verificationExcludedNodeIds: state.verificationExcludedNodeIds,
      },
      policy: {
        insufficientEvidence: state.assertionPolicyResult.policy.insufficientEvidence,
        assertionStatus: state.assertionPolicyResult.status,
      },
      diagnosticsCoverage: state.diagnosticsCoverage,
      runtimeAdmissionOwnership: buildAdmissionRuntimeOwnershipSummary(
        state.runtimeAdmissionOwnership,
      ),
      phaseTimeline: mapPhaseTimeline(orchestrationResult.phases),
      phaseArtifacts: mapPhaseArtifacts(orchestrationResult.phases),
      phaseReasonSummary: buildPhaseReasonSummary(orchestrationResult.phases),
      phaseDecisions,
      startupDecisionRecord,
      phaseEvents,
      channelMetrics: nodeClient.getMetricsSnapshot(),
    },
  };
}

export {run, resolveBenchmarkConfig, buildComparison};
