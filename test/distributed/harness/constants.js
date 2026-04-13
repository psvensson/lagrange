/**
 * Constants for the distributed testing framework.
 * All scalars are defined here — no magic literals in framework code.
 */

import {
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_DEFAULT,
  ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT,
  ADMIN_SERVICE_DISCOVERY,
  CONSISTENCY_MISMATCH_KIND,
} from '../../../src/admin/admin-constants.js';
import {META_SERVICE_ID} from '../../../src/constants/wasm-meta.js';
import {ENTRYPOINT_DEFAULT} from '../../../src/constants/entrypoint.js';
import {WASM_SERVICE_PROTOCOL} from '../../../src/wasm-service/wasm-service-constants.js';

// --- Port Constants ---
const REST_PORT = ENTRYPOINT_DEFAULT.REST_API_PORT;
const ADMIN_API_PORT = ADMIN_DEFAULT.WEBSOCKET_PORT;
const WS_TRANSPORT_PORT = REST_PORT + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;

const PORTS = Object.freeze({
  REST: REST_PORT,
  ADMIN_API: ADMIN_API_PORT,
  WS_TRANSPORT: WS_TRANSPORT_PORT,
});

// --- Timeout Constants (milliseconds) ---
const NODE_STARTUP_TIMEOUT_MS = 30000;
const CONVERGENCE_TIMEOUT_MS = 30000;
const QUIET_WINDOW_MS = 5000;
const SCENARIO_DEFAULT_TIMEOUT_MS = 120000;
const CONSISTENCY_CONVERGENCE_TIMEOUT_MS = 15000;
const CONSISTENCY_CONVERGENCE_POST_SPLIT_TIMEOUT_MS = 60000;
const CONSISTENCY_CONVERGENCE_POLL_INTERVAL_MS = 250;
const CONSISTENCY_CONVERGENCE_FORCE_REPAIR_AFTER_MS = 10000;
const ACTIVE_WAIT_FORCE_REPAIR_AFTER_MS = 10000;

const TIMEOUTS = Object.freeze({
  NODE_STARTUP: NODE_STARTUP_TIMEOUT_MS,
  CONVERGENCE: CONVERGENCE_TIMEOUT_MS,
  QUIET_WINDOW: QUIET_WINDOW_MS,
  SCENARIO_DEFAULT: SCENARIO_DEFAULT_TIMEOUT_MS,
  CONSISTENCY_CONVERGENCE: CONSISTENCY_CONVERGENCE_TIMEOUT_MS,
  CONSISTENCY_CONVERGENCE_POST_SPLIT:
    CONSISTENCY_CONVERGENCE_POST_SPLIT_TIMEOUT_MS,
  CONSISTENCY_CONVERGENCE_POLL_INTERVAL:
    CONSISTENCY_CONVERGENCE_POLL_INTERVAL_MS,
  CONSISTENCY_CONVERGENCE_FORCE_REPAIR_AFTER:
    CONSISTENCY_CONVERGENCE_FORCE_REPAIR_AFTER_MS,
  ACTIVE_WAIT_FORCE_REPAIR_AFTER:
    ACTIVE_WAIT_FORCE_REPAIR_AFTER_MS,
});

// --- Docker Label Constants ---
const LABEL_PREFIX = 'ddb-test';
const LABEL_CLUSTER = `${LABEL_PREFIX}.cluster`;
const LABEL_NODE_ID = `${LABEL_PREFIX}.node-id`;
const LABEL_ROLE = `${LABEL_PREFIX}.role`;
const LABEL_SCENARIO = `${LABEL_PREFIX}.scenario`;

const LABELS = Object.freeze({
  PREFIX: LABEL_PREFIX,
  CLUSTER: LABEL_CLUSTER,
  NODE_ID: LABEL_NODE_ID,
  ROLE: LABEL_ROLE,
  SCENARIO: LABEL_SCENARIO,
});

// --- Convergence Defaults ---
const TARGET_VOTER_COUNT = 3;
const SETTLE_TIMEOUT_MS = 30000;
const MAX_SUSTAINED_OVER_TARGET_MS = 120000;
const SAMPLE_INTERVAL_MS = 250;

const CONVERGENCE_DEFAULTS = Object.freeze({
  targetVoterCount: TARGET_VOTER_COUNT,
  settleTimeoutMs: SETTLE_TIMEOUT_MS,
  quietWindowMs: QUIET_WINDOW_MS,
  maxSustainedOverTargetMs: MAX_SUSTAINED_OVER_TARGET_MS,
  sampleIntervalMs: SAMPLE_INTERVAL_MS,
});

// --- Load Generation Defaults ---
const DEFAULT_OPS_PER_SEC = 100;
const DEFAULT_LOAD_DURATION = '30s';

const LOAD_DEFAULTS = Object.freeze({
  defaultOpsPerSec: DEFAULT_OPS_PER_SEC,
  defaultDuration: DEFAULT_LOAD_DURATION,
});

// --- Scenario Timing Defaults ---
const SCENARIO_STABILIZATION_DELAY_MS = 1000;
const SCENARIO_SHORT_SOAK_MS = 1000;
const SCENARIO_POLL_INTERVAL_MS = 250;
const SCENARIO_INTER_ACTION_DELAY_MS = 250;

const SCENARIO_TIMING_DEFAULTS = Object.freeze({
  stabilizationDelayMs: SCENARIO_STABILIZATION_DELAY_MS,
  shortSoakMs: SCENARIO_SHORT_SOAK_MS,
  pollIntervalMs: SCENARIO_POLL_INTERVAL_MS,
  interActionDelayMs: SCENARIO_INTER_ACTION_DELAY_MS,
});

// --- Resource Limit Defaults ---
const DEFAULT_MEMORY_LIMIT = '512m';
const DEFAULT_CPU_LIMIT = '1.0';

const RESOURCE_DEFAULTS = Object.freeze({
  memory: DEFAULT_MEMORY_LIMIT,
  cpus: DEFAULT_CPU_LIMIT,
});

// --- Docker Image Defaults ---
const DEFAULT_IMAGE_TAG = 'distributed-db:test';
const DEFAULT_DOCKERFILE = 'Dockerfile';
const DEFAULT_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const DOCKER_REMOTE_PORT = 2376;

const DOCKER_DEFAULTS = Object.freeze({
  imageTag: DEFAULT_IMAGE_TAG,
  dockerfile: DEFAULT_DOCKERFILE,
  socketPath: DEFAULT_DOCKER_SOCKET_PATH,
  remotePort: DOCKER_REMOTE_PORT,
});

// --- Log Analyzer Defaults ---
const ELECTION_STORM_MULTIPLIER = 4;
const STUCK_REBALANCE_TIMEOUT_MS = 60000;
const CDC_DELAY_THRESHOLD_MS = 5000;
const REPEATED_ERROR_THRESHOLD = 3;

const ANALYZER_DEFAULTS = Object.freeze({
  electionStormMultiplier: ELECTION_STORM_MULTIPLIER,
  stuckRebalanceTimeoutMs: STUCK_REBALANCE_TIMEOUT_MS,
  cdcDelayThresholdMs: CDC_DELAY_THRESHOLD_MS,
  repeatedErrorThreshold: REPEATED_ERROR_THRESHOLD,
});

// --- Container Environment Variable Names ---
const ENV_NODE_ID = 'NODE_ID';
const ENV_NODE_ADDRESS = 'NODE_ADDRESS';
const ENV_SEED_NODE_ADDRESS = 'SEED_NODE_ADDRESS';
const ENV_DATA_DIR = 'DATA_DIR';

const CONTAINER_ENV_KEYS = Object.freeze({
  NODE_ID: ENV_NODE_ID,
  NODE_ADDRESS: ENV_NODE_ADDRESS,
  SEED_NODE_ADDRESS: ENV_SEED_NODE_ADDRESS,
  DATA_DIR: ENV_DATA_DIR,
});

const PARTITION_ENV_KEYS = Object.freeze({
  SPLIT_THRESHOLD_BYTES: 'PARTITION_SPLIT_THRESHOLD_BYTES',
  SPLIT_THRESHOLD_QPM: 'PARTITION_SPLIT_THRESHOLD_QPM',
  MERGE_THRESHOLD_BYTES: 'PARTITION_MERGE_THRESHOLD_BYTES',
  MERGE_THRESHOLD_QPM: 'PARTITION_MERGE_THRESHOLD_QPM',
  EVALUATION_INTERVAL_MS: 'PARTITION_EVALUATION_INTERVAL_MS',
});

// --- Network Constants ---
const NETWORK_NAME_PREFIX = 'ddb-test-net';
const ISOLATION_NETWORK_PREFIX = 'ddb-test-iso';

const NETWORK = Object.freeze({
  NAME_PREFIX: NETWORK_NAME_PREFIX,
  ISOLATION_PREFIX: ISOLATION_NETWORK_PREFIX,
});

// --- Node Roles ---
const ROLE_SEED = 'seed';
const ROLE_JOINER = 'joiner';

const NODE_ROLES = Object.freeze({
  SEED: ROLE_SEED,
  JOINER: ROLE_JOINER,
});

// --- Default Cluster Size ---
const DEFAULT_CLUSTER_SIZE = 5;

// --- Output Defaults ---
const DEFAULT_OUTPUT_DIR = 'test-output';
const TIMELINE_FILENAME = '_timeline.log';
const ANALYSIS_FILENAME = '_analysis.json';
const CONTAINER_LOG_TAIL_LINES = 50;
const PLAYBACK_EVENTS_FILENAME = 'events.ndjson';
const PLAYBACK_SAMPLES_FILENAME = 'samples.ndjson';
const PLAYBACK_SNAPSHOTS_FILENAME = 'snapshots.ndjson';
const PLAYBACK_MANIFEST_FILENAME = 'playback-manifest.json';
const PLAYBACK_VIEWER_FILENAME = 'playback-viewer.html';
const DEBUG_TRACE_EVENTS_FILENAME = 'debug-trace.ndjson';
const DEBUG_TRACE_MANIFEST_FILENAME = 'debug-trace-manifest.json';

const OUTPUT = Object.freeze({
  DEFAULT_DIR: DEFAULT_OUTPUT_DIR,
  TIMELINE_FILENAME: TIMELINE_FILENAME,
  ANALYSIS_FILENAME: ANALYSIS_FILENAME,
  CONTAINER_LOG_TAIL_LINES,
  PLAYBACK_EVENTS_FILENAME,
  PLAYBACK_SAMPLES_FILENAME,
  PLAYBACK_SNAPSHOTS_FILENAME,
  PLAYBACK_MANIFEST_FILENAME,
  PLAYBACK_VIEWER_FILENAME,
  DEBUG_TRACE_EVENTS_FILENAME,
  DEBUG_TRACE_MANIFEST_FILENAME,
});

// --- Debug Trace Harness Defaults ---
const DEBUG_TRACE_DEFAULT_SERVICE_NAME = 'svc-debug';
const DEBUG_TRACE_DEFAULT_TENANT_ID = 'system';
const DEBUG_TRACE_DEFAULT_PRINCIPAL = 'distributed-harness';
const DEBUG_TRACE_DEFAULT_ROLES =
  'debug_admin,debug_write,debug_read,debug_attach';
const DEBUG_TRACE_CONNECT_TIMEOUT_MS = 2000;
const DEBUG_TRACE_REQUEST_TIMEOUT_MS = 5000;

const DEBUG_TRACE_DEFAULTS = Object.freeze({
  enabled: false,
  required: false,
  serviceName: DEBUG_TRACE_DEFAULT_SERVICE_NAME,
  lineagePrefix: null,
  requiredLineagePrefix: null,
  levels: null,
  tenantId: DEBUG_TRACE_DEFAULT_TENANT_ID,
  principal: DEBUG_TRACE_DEFAULT_PRINCIPAL,
  roles: DEBUG_TRACE_DEFAULT_ROLES,
  connectTimeoutMs: DEBUG_TRACE_CONNECT_TIMEOUT_MS,
  requestTimeoutMs: DEBUG_TRACE_REQUEST_TIMEOUT_MS,
});

// --- Memory Leak Guard Defaults ---
const LEAK_ENABLED_DEFAULT = true;
const LEAK_FAIL_ON_DETECTION_DEFAULT = true;
const LEAK_REQUIRE_SAMPLES_DEFAULT = false;
const LEAK_MIN_SAMPLES_PER_NODE = 8;
const LEAK_WARMUP_FRACTION = 0.2;
const LEAK_MIN_WARMUP_MS = 30000;
const LEAK_MIN_ANALYSIS_WINDOW_MS = 60000;
const LEAK_MAX_POSITIVE_SLOPE_BYTES_PER_MIN = 1048576; // 1 MiB/min
const LEAK_MIN_GROWTH_BYTES = 16777216; // 16 MiB
const LEAK_MIN_POSITIVE_DELTA_RATIO = 0.65;
const LEAK_CAPTURE_HEAP_ARTIFACTS_DEFAULT = false;
const LEAK_HEAP_SNAPSHOT_NEAR_LIMIT_COUNT = 2;

const LEAK_DEFAULTS = Object.freeze({
  enabled: LEAK_ENABLED_DEFAULT,
  failOnDetection: LEAK_FAIL_ON_DETECTION_DEFAULT,
  requireSamples: LEAK_REQUIRE_SAMPLES_DEFAULT,
  minSamplesPerNode: LEAK_MIN_SAMPLES_PER_NODE,
  warmupFraction: LEAK_WARMUP_FRACTION,
  minWarmupMs: LEAK_MIN_WARMUP_MS,
  minAnalysisWindowMs: LEAK_MIN_ANALYSIS_WINDOW_MS,
  maxPositiveSlopeBytesPerMin: LEAK_MAX_POSITIVE_SLOPE_BYTES_PER_MIN,
  minGrowthBytes: LEAK_MIN_GROWTH_BYTES,
  minPositiveDeltaRatio: LEAK_MIN_POSITIVE_DELTA_RATIO,
  captureHeapArtifacts: LEAK_CAPTURE_HEAP_ARTIFACTS_DEFAULT,
  heapSnapshotNearLimitCount: LEAK_HEAP_SNAPSHOT_NEAR_LIMIT_COUNT,
});

// --- Benchmark Defaults ---
const BENCHMARK_BASELINE_IMAGE = 'postgres:16';
const BENCHMARK_USER = 'benchmark';
const BENCHMARK_PASSWORD = 'benchmark';
const BENCHMARK_DATABASE = 'benchmark';
const BENCHMARK_PORT = 5432;
const BENCHMARK_DURATION_SECONDS = 30;
const BENCHMARK_CLIENTS = 8;
const BENCHMARK_JOBS = 4;
const BENCHMARK_LOAD_OPS_PER_SEC = 120;
const BENCHMARK_LOAD_DURATION = '30s';
const BENCHMARK_LOAD_MAX_IN_FLIGHT = 128;
const BENCHMARK_READY_TIMEOUT_MS = 30000;
const BENCHMARK_READY_POLL_INTERVAL_MS = 250;
const BENCHMARK_QUIESCENT_STABLE_WINDOW_MS = 2000;
const BENCHMARK_LOAD_QUERY_TIMEOUT_MS = 4000;
const BENCHMARK_CONSISTENCY_ASSERT_MAX_ATTEMPTS = 3;
const BENCHMARK_CONSISTENCY_ASSERT_RETRY_DELAY_MS = 2000;
const BENCHMARK_TABLE_NAME = 'benchmark_events';
const BENCHMARK_REPLICATION_FACTOR = 3;
const BENCHMARK_SYNC_REPLICA_ACKS = 1;
const BENCHMARK_CACHE_BASELINE_METRICS = true;
const BENCHMARK_REFRESH_BASELINE_METRICS = false;
const BENCHMARK_BASELINE_CACHE_TTL_MS = 0;
const BENCHMARK_REGRESSION_GATE_ENABLED = false;
const BENCHMARK_REGRESSION_MAX_THROUGHPUT_REGRESSION_RATIO = 0.1;
const BENCHMARK_REGRESSION_MIN_THROUGHPUT_RATIO_SUT_TO_BASELINE = null;
const BENCHMARK_REGRESSION_BASELINE_PROVIDER = 'liferaft';
const BENCHMARK_REGRESSION_FAIL_IF_BASELINE_MISSING = false;
const BENCHMARK_REGRESSION_APPROVED_MITIGATION_ID = null;
const BENCHMARK_REGRESSION_PARITY_MISMATCH_POLICY = 'warn';

const BENCHMARK_DEFAULTS = Object.freeze({
  baselineImage: BENCHMARK_BASELINE_IMAGE,
  user: BENCHMARK_USER,
  password: BENCHMARK_PASSWORD,
  database: BENCHMARK_DATABASE,
  port: BENCHMARK_PORT,
  durationSeconds: BENCHMARK_DURATION_SECONDS,
  clients: BENCHMARK_CLIENTS,
  jobs: BENCHMARK_JOBS,
  loadOpsPerSec: BENCHMARK_LOAD_OPS_PER_SEC,
  loadDuration: BENCHMARK_LOAD_DURATION,
  loadMaxInFlight: BENCHMARK_LOAD_MAX_IN_FLIGHT,
  readyTimeoutMs: BENCHMARK_READY_TIMEOUT_MS,
  readyPollIntervalMs: BENCHMARK_READY_POLL_INTERVAL_MS,
  quiescentStableWindowMs: BENCHMARK_QUIESCENT_STABLE_WINDOW_MS,
  loadQueryTimeoutMs: BENCHMARK_LOAD_QUERY_TIMEOUT_MS,
  consistencyAssertMaxAttempts: BENCHMARK_CONSISTENCY_ASSERT_MAX_ATTEMPTS,
  consistencyAssertRetryDelayMs: BENCHMARK_CONSISTENCY_ASSERT_RETRY_DELAY_MS,
  tableName: BENCHMARK_TABLE_NAME,
  replicationFactor: BENCHMARK_REPLICATION_FACTOR,
  syncReplicaAcks: BENCHMARK_SYNC_REPLICA_ACKS,
  cacheBaselineMetrics: BENCHMARK_CACHE_BASELINE_METRICS,
  refreshBaselineMetrics: BENCHMARK_REFRESH_BASELINE_METRICS,
  baselineCacheTtlMs: BENCHMARK_BASELINE_CACHE_TTL_MS,
});

const BENCHMARK_GATE_DEFAULTS = Object.freeze({
  enabled: BENCHMARK_REGRESSION_GATE_ENABLED,
  maxThroughputRegressionRatio:
    BENCHMARK_REGRESSION_MAX_THROUGHPUT_REGRESSION_RATIO,
  minimumThroughputRatioSutToBaseline:
    BENCHMARK_REGRESSION_MIN_THROUGHPUT_RATIO_SUT_TO_BASELINE,
  baselineProvider: BENCHMARK_REGRESSION_BASELINE_PROVIDER,
  failIfBaselineMissing: BENCHMARK_REGRESSION_FAIL_IF_BASELINE_MISSING,
  approvedMitigationId: BENCHMARK_REGRESSION_APPROVED_MITIGATION_ID,
  parityMismatchPolicy: BENCHMARK_REGRESSION_PARITY_MISMATCH_POLICY,
});

// --- Node Client Channel Policies ---
const NODE_CLIENT_CHANNEL_LOAD = 'load';
const NODE_CLIENT_CHANNEL_CONTROL = 'control';
const NODE_CLIENT_CHANNEL_PROBE = 'probe';
const NODE_CLIENT_CHANNEL_SNAPSHOT = 'snapshot';

const NODE_CLIENT_CHANNEL = Object.freeze({
  LOAD: NODE_CLIENT_CHANNEL_LOAD,
  CONTROL: NODE_CLIENT_CHANNEL_CONTROL,
  PROBE: NODE_CLIENT_CHANNEL_PROBE,
  SNAPSHOT: NODE_CLIENT_CHANNEL_SNAPSHOT,
});

const NODE_CLIENT_ERROR_CODE_TIMEOUT = 'timeout';
const NODE_CLIENT_ERROR_CODE_OPERATION = 'operation_error';
const NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN = 'circuit_open';
const NODE_CLIENT_ERROR_CODE_BUDGET_EXHAUSTED = 'budget_exhausted';

const NODE_CLIENT_ERROR_CODES = Object.freeze({
  TIMEOUT: NODE_CLIENT_ERROR_CODE_TIMEOUT,
  OPERATION: NODE_CLIENT_ERROR_CODE_OPERATION,
  CIRCUIT_OPEN: NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN,
  BUDGET_EXHAUSTED: NODE_CLIENT_ERROR_CODE_BUDGET_EXHAUSTED,
});

const NODE_CLIENT_TIMEOUT_CLASS_TIMEOUT = 'timeout';
const NODE_CLIENT_TIMEOUT_CLASS_NON_TIMEOUT = 'non_timeout';
const NODE_CLIENT_TIMEOUT_CLASS_NONE = 'none';

const NODE_CLIENT_TIMEOUT_CLASS = Object.freeze({
  TIMEOUT: NODE_CLIENT_TIMEOUT_CLASS_TIMEOUT,
  NON_TIMEOUT: NODE_CLIENT_TIMEOUT_CLASS_NON_TIMEOUT,
  NONE: NODE_CLIENT_TIMEOUT_CLASS_NONE,
});

const NODE_CLIENT_CONTROL_QUERY_TIMEOUT_MS = 15000;
const NODE_CLIENT_PROBE_TIMEOUT_MS = 1000;
const NODE_CLIENT_SNAPSHOT_TIMEOUT_MS = 15000;
const NODE_CLIENT_LOAD_MAX_IN_FLIGHT_PER_NODE = 2;
const NODE_CLIENT_CONTROL_MAX_IN_FLIGHT_PER_NODE = 4;
const NODE_CLIENT_PROBE_MAX_IN_FLIGHT_PER_NODE = 2;
const NODE_CLIENT_SNAPSHOT_MAX_IN_FLIGHT_PER_NODE = 2;
const NODE_CLIENT_LOAD_RETRY_BUDGET = 0;
const NODE_CLIENT_CONTROL_RETRY_BUDGET = 1;
const NODE_CLIENT_PROBE_RETRY_BUDGET = 0;
const NODE_CLIENT_SNAPSHOT_RETRY_BUDGET = 1;
const NODE_CLIENT_LOAD_BREAKER_THRESHOLD = 3;
const NODE_CLIENT_CONTROL_BREAKER_THRESHOLD = 3;
const NODE_CLIENT_PROBE_BREAKER_THRESHOLD = 1;
const NODE_CLIENT_SNAPSHOT_BREAKER_THRESHOLD = 2;
const NODE_CLIENT_BREAKER_COOLDOWN_MS = 1500;
const NODE_CLIENT_CONTROL_SNAPSHOT_SCHEMA_VERSION =
  ADMIN_CONTROL_SNAPSHOT.SCHEMA_VERSION;
const NODE_CLIENT_CONTROL_SNAPSHOT_SQL = ADMIN_CONTROL_SNAPSHOT.QUERY_SQL;
const NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL =
  ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR;
const NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION =
  ADMIN_SERVICE_DISCOVERY.SCHEMA_VERSION;
const NODE_CLIENT_SERVICE_DISCOVERY_SQL = ADMIN_SERVICE_DISCOVERY.QUERY_SQL;
const NODE_CLIENT_PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SCHEMA_VERSION =
  ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.SCHEMA_VERSION;
const NODE_CLIENT_PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL =
  ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.QUERY_SQL;
const NODE_CLIENT_SERVICE_ID_ADMIN_META = META_SERVICE_ID.ADMIN_META;
const NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE = META_SERVICE_ID.POSTGRES_WIRE;
const NODE_CLIENT_SERVICE_PROTOCOL_WEBSOCKET = WASM_SERVICE_PROTOCOL.WEBSOCKET;
const NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL =
  WASM_SERVICE_PROTOCOL.POSTGRESQL;

const NODE_CLIENT_DEFAULT_CHANNEL_POLICIES = Object.freeze({
  [NODE_CLIENT_CHANNEL_LOAD]: Object.freeze({
    timeoutMs: BENCHMARK_LOAD_QUERY_TIMEOUT_MS,
    maxInFlightPerNode: NODE_CLIENT_LOAD_MAX_IN_FLIGHT_PER_NODE,
    retryBudget: NODE_CLIENT_LOAD_RETRY_BUDGET,
    circuitBreakerThreshold: NODE_CLIENT_LOAD_BREAKER_THRESHOLD,
    cooldownMs: NODE_CLIENT_BREAKER_COOLDOWN_MS,
  }),
  [NODE_CLIENT_CHANNEL_CONTROL]: Object.freeze({
    timeoutMs: NODE_CLIENT_CONTROL_QUERY_TIMEOUT_MS,
    maxInFlightPerNode: NODE_CLIENT_CONTROL_MAX_IN_FLIGHT_PER_NODE,
    retryBudget: NODE_CLIENT_CONTROL_RETRY_BUDGET,
    circuitBreakerThreshold: NODE_CLIENT_CONTROL_BREAKER_THRESHOLD,
    cooldownMs: NODE_CLIENT_BREAKER_COOLDOWN_MS,
  }),
  [NODE_CLIENT_CHANNEL_PROBE]: Object.freeze({
    timeoutMs: NODE_CLIENT_PROBE_TIMEOUT_MS,
    maxInFlightPerNode: NODE_CLIENT_PROBE_MAX_IN_FLIGHT_PER_NODE,
    retryBudget: NODE_CLIENT_PROBE_RETRY_BUDGET,
    circuitBreakerThreshold: NODE_CLIENT_PROBE_BREAKER_THRESHOLD,
    cooldownMs: NODE_CLIENT_BREAKER_COOLDOWN_MS,
  }),
  [NODE_CLIENT_CHANNEL_SNAPSHOT]: Object.freeze({
    timeoutMs: NODE_CLIENT_SNAPSHOT_TIMEOUT_MS,
    maxInFlightPerNode: NODE_CLIENT_SNAPSHOT_MAX_IN_FLIGHT_PER_NODE,
    retryBudget: NODE_CLIENT_SNAPSHOT_RETRY_BUDGET,
    circuitBreakerThreshold: NODE_CLIENT_SNAPSHOT_BREAKER_THRESHOLD,
    cooldownMs: NODE_CLIENT_BREAKER_COOLDOWN_MS,
  }),
});

const NODE_CLIENT_BENCHMARK_LOAD_TIMEOUT_KEY = 'loadQueryTimeoutMs';
const NODE_CLIENT_BENCHMARK_CONTROL_TIMEOUT_KEY = 'controlQueryTimeoutMs';
const NODE_CLIENT_BENCHMARK_LOAD_IN_FLIGHT_KEY = 'loadNodeMaxInFlight';
const NODE_CLIENT_BENCHMARK_BREAKER_THRESHOLD_KEY = 'nodeFailureThreshold';
const NODE_CLIENT_BENCHMARK_BREAKER_COOLDOWN_KEY = 'nodeFailureCooldownMs';
const NODE_CLIENT_CHANNEL_POLICY_KEYS = Object.freeze({
  timeoutMs: 'timeoutMs',
  maxInFlightPerNode: 'maxInFlightPerNode',
  retryBudget: 'retryBudget',
  circuitBreakerThreshold: 'circuitBreakerThreshold',
  cooldownMs: 'cooldownMs',
});
const NODE_CLIENT_CONTEXT_KEY_TOLERATE_TRANSIENT_ERRORS =
  'tolerateTransientErrors';
const NODE_CLIENT_CONTEXT_KEY_RETRY_BUDGET = 'retryBudget';
const NODE_CLIENT_CONTEXT_KEY_FORCE_AUTHORITATIVE_REPAIR =
  'forceAuthoritativeRepair';
const NODE_CLIENT_CONTEXT_KEYS = Object.freeze({
  TOLERATE_TRANSIENT_ERRORS: NODE_CLIENT_CONTEXT_KEY_TOLERATE_TRANSIENT_ERRORS,
  RETRY_BUDGET: NODE_CLIENT_CONTEXT_KEY_RETRY_BUDGET,
  FORCE_AUTHORITATIVE_REPAIR:
    NODE_CLIENT_CONTEXT_KEY_FORCE_AUTHORITATIVE_REPAIR,
});

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function cloneNodeClientPolicies(sourcePolicies) {
  const cloned = {};
  const channels = Object.values(NODE_CLIENT_CHANNEL);
  for (const channel of channels) {
    cloned[channel] = {
      ...sourcePolicies[channel],
    };
  }
  return cloned;
}

function applyNodeClientPolicyOverrides(targetPolicies, overridePolicies) {
  if (!overridePolicies || typeof overridePolicies !== 'object') {
    return;
  }
  const channels = Object.values(NODE_CLIENT_CHANNEL);
  for (const channel of channels) {
    const channelOverride = overridePolicies[channel];
    if (!channelOverride || typeof channelOverride !== 'object') {
      continue;
    }
    const policy = targetPolicies[channel];
    if (isPositiveInteger(channelOverride.timeoutMs)) {
      policy[NODE_CLIENT_CHANNEL_POLICY_KEYS.timeoutMs] =
        channelOverride.timeoutMs;
    }
    if (isPositiveInteger(channelOverride.maxInFlightPerNode)) {
      policy[NODE_CLIENT_CHANNEL_POLICY_KEYS.maxInFlightPerNode] =
        channelOverride.maxInFlightPerNode;
    }
    if (isNonNegativeInteger(channelOverride.retryBudget)) {
      policy[NODE_CLIENT_CHANNEL_POLICY_KEYS.retryBudget] =
        channelOverride.retryBudget;
    }
    if (isPositiveInteger(channelOverride.circuitBreakerThreshold)) {
      policy[NODE_CLIENT_CHANNEL_POLICY_KEYS.circuitBreakerThreshold] =
        channelOverride.circuitBreakerThreshold;
    }
    if (isPositiveInteger(channelOverride.cooldownMs)) {
      policy[NODE_CLIENT_CHANNEL_POLICY_KEYS.cooldownMs] =
        channelOverride.cooldownMs;
    }
  }
}

function applyNodeClientBenchmarkOverrides(targetPolicies, benchmarkConfig) {
  if (!benchmarkConfig || typeof benchmarkConfig !== 'object') {
    return;
  }

  const loadTimeoutMs = benchmarkConfig[NODE_CLIENT_BENCHMARK_LOAD_TIMEOUT_KEY];
  if (isPositiveInteger(loadTimeoutMs)) {
    targetPolicies[NODE_CLIENT_CHANNEL_LOAD].timeoutMs = loadTimeoutMs;
  }

  const controlTimeoutMs =
    benchmarkConfig[NODE_CLIENT_BENCHMARK_CONTROL_TIMEOUT_KEY];
  if (isPositiveInteger(controlTimeoutMs)) {
    targetPolicies[NODE_CLIENT_CHANNEL_CONTROL].timeoutMs = controlTimeoutMs;
    targetPolicies[NODE_CLIENT_CHANNEL_SNAPSHOT].timeoutMs = controlTimeoutMs;
  }

  const loadInFlight = benchmarkConfig[NODE_CLIENT_BENCHMARK_LOAD_IN_FLIGHT_KEY];
  if (isPositiveInteger(loadInFlight)) {
    targetPolicies[NODE_CLIENT_CHANNEL_LOAD].maxInFlightPerNode = loadInFlight;
  }

  const breakerThreshold =
    benchmarkConfig[NODE_CLIENT_BENCHMARK_BREAKER_THRESHOLD_KEY];
  if (isPositiveInteger(breakerThreshold)) {
    targetPolicies[NODE_CLIENT_CHANNEL_LOAD].circuitBreakerThreshold =
      breakerThreshold;
  }

  const breakerCooldownMs =
    benchmarkConfig[NODE_CLIENT_BENCHMARK_BREAKER_COOLDOWN_KEY];
  if (isPositiveInteger(breakerCooldownMs)) {
    targetPolicies[NODE_CLIENT_CHANNEL_LOAD].cooldownMs = breakerCooldownMs;
  }
}

function resolveNodeClientChannelPolicies(options = {}) {
  const resolved = cloneNodeClientPolicies(NODE_CLIENT_DEFAULT_CHANNEL_POLICIES);
  applyNodeClientPolicyOverrides(resolved, options.channelPolicies);
  applyNodeClientBenchmarkOverrides(resolved, options.benchmarkConfig);

  return Object.freeze({
    [NODE_CLIENT_CHANNEL_LOAD]: Object.freeze({
      ...resolved[NODE_CLIENT_CHANNEL_LOAD],
    }),
    [NODE_CLIENT_CHANNEL_CONTROL]: Object.freeze({
      ...resolved[NODE_CLIENT_CHANNEL_CONTROL],
    }),
    [NODE_CLIENT_CHANNEL_PROBE]: Object.freeze({
      ...resolved[NODE_CLIENT_CHANNEL_PROBE],
    }),
    [NODE_CLIENT_CHANNEL_SNAPSHOT]: Object.freeze({
      ...resolved[NODE_CLIENT_CHANNEL_SNAPSHOT],
    }),
  });
}

// --- Phase Orchestrator Defaults ---
const PHASE_PRE_FLIGHT = 'preflight';
const PHASE_CONVERGE = 'converge';
const PHASE_PRE_LOAD_GATE = 'pre_load_gate';
const PHASE_LOAD = 'load';
const PHASE_POST_LOAD_DRAIN = 'post_load_drain';
const PHASE_VERIFY = 'verify';
const PHASE_TEARDOWN = 'teardown';

const SCENARIO_PHASE = Object.freeze({
  PRE_FLIGHT: PHASE_PRE_FLIGHT,
  CONVERGE: PHASE_CONVERGE,
  PRE_LOAD_GATE: PHASE_PRE_LOAD_GATE,
  LOAD: PHASE_LOAD,
  POST_LOAD_DRAIN: PHASE_POST_LOAD_DRAIN,
  VERIFY: PHASE_VERIFY,
  TEARDOWN: PHASE_TEARDOWN,
});

const SCENARIO_PHASE_SEQUENCE = Object.freeze([
  PHASE_PRE_FLIGHT,
  PHASE_CONVERGE,
  PHASE_PRE_LOAD_GATE,
  PHASE_LOAD,
  PHASE_POST_LOAD_DRAIN,
  PHASE_VERIFY,
  PHASE_TEARDOWN,
]);

const PHASE_STATUS_OK = 'ok';
const PHASE_STATUS_WARN = 'warn';
const PHASE_STATUS_FAIL = 'fail';
const PHASE_STATUS_SKIPPED = 'skipped';

const PHASE_STATUS = Object.freeze({
  OK: PHASE_STATUS_OK,
  WARN: PHASE_STATUS_WARN,
  FAIL: PHASE_STATUS_FAIL,
  SKIPPED: PHASE_STATUS_SKIPPED,
});

const PHASE_EVENT_TYPE_START = 'phase.start';
const PHASE_EVENT_TYPE_END = 'phase.end';
const PHASE_EVENT_TYPE_PROGRESS = 'phase.progress';
const PHASE_EVENT_TYPE_LAST_MEANINGFUL_CHANGE =
  'phase.last_meaningful_change';
const PHASE_EVENT_TYPE_NO_PROGRESS_WARNING = 'phase.no_progress_warning';
const PHASE_EVENT_TYPE_FAILED_NO_PROGRESS = 'phase.failed_no_progress';

const PHASE_EVENT_TYPE = Object.freeze({
  START: PHASE_EVENT_TYPE_START,
  END: PHASE_EVENT_TYPE_END,
  PROGRESS: PHASE_EVENT_TYPE_PROGRESS,
  LAST_MEANINGFUL_CHANGE: PHASE_EVENT_TYPE_LAST_MEANINGFUL_CHANGE,
  NO_PROGRESS_WARNING: PHASE_EVENT_TYPE_NO_PROGRESS_WARNING,
  FAILED_NO_PROGRESS: PHASE_EVENT_TYPE_FAILED_NO_PROGRESS,
});

// --- Gate Engine Result Modes ---
const GATE_RESULT_MODE_ALL_READY = 'all_ready';
const GATE_RESULT_MODE_FAILED = 'failed';

const GATE_RESULT_MODE = Object.freeze({
  ALL_READY: GATE_RESULT_MODE_ALL_READY,
  FAILED: GATE_RESULT_MODE_FAILED,
});

// --- Consistency Evaluator Verdicts ---
const CONSISTENCY_VERDICT_CONSISTENT = 'consistent';
const CONSISTENCY_VERDICT_INCONSISTENT = 'inconsistent';
const CONSISTENCY_VERDICT_INSUFFICIENT_EVIDENCE = 'insufficient_evidence';

const CONSISTENCY_VERDICT = Object.freeze({
  CONSISTENT: CONSISTENCY_VERDICT_CONSISTENT,
  INCONSISTENT: CONSISTENCY_VERDICT_INCONSISTENT,
  INSUFFICIENT_EVIDENCE: CONSISTENCY_VERDICT_INSUFFICIENT_EVIDENCE,
});

// --- Assertion Policy Defaults ---
const ASSERTION_STATUS = Object.freeze({
  PASSED: 'passed',
  PASSED_WITH_WARNINGS: 'passed_with_warnings',
  FAILED: 'failed',
});

const VERIFICATION_CONFIDENCE = Object.freeze({
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
});

const ASSERTION_POLICY = Object.freeze({
  HARD: 'hard',
  SOFT: 'soft',
});

// --- Raft Provider Harness Defaults ---
const RAFT_PROVIDER_ENV_KEY = 'RAFT_PROVIDER';
const RAFT_PROVIDER_DEFAULT = 'liferaft';

const RAFT_PROVIDER_DEFAULTS = Object.freeze({
  envKey: RAFT_PROVIDER_ENV_KEY,
  provider: RAFT_PROVIDER_DEFAULT,
});

// --- Playback Defaults ---
const PLAYBACK_TOPOLOGY_POLL_INTERVAL_MS = 1000;
const PLAYBACK_RESOURCE_POLL_INTERVAL_MS = 1000;

const PLAYBACK = Object.freeze({
  topologyPollIntervalMs: PLAYBACK_TOPOLOGY_POLL_INTERVAL_MS,
  resourcePollIntervalMs: PLAYBACK_RESOURCE_POLL_INTERVAL_MS,
});

// --- Deterministic Debug Mode Defaults ---
const DETERMINISTIC_DEBUG_ENABLED = false;
const DETERMINISTIC_DEBUG_SEED = 1337;
const DETERMINISTIC_DEBUG_CONVERGENCE_SAMPLE_INTERVAL_MS =
  CONVERGENCE_DEFAULTS.sampleIntervalMs;
const DETERMINISTIC_DEBUG_PREFLIGHT_SAMPLE_INTERVAL_MS =
  BENCHMARK_DEFAULTS.readyPollIntervalMs;

const DETERMINISTIC_DEBUG_DEFAULTS = Object.freeze({
  enabled: DETERMINISTIC_DEBUG_ENABLED,
  seed: DETERMINISTIC_DEBUG_SEED,
  convergenceSampleIntervalMs:
    DETERMINISTIC_DEBUG_CONVERGENCE_SAMPLE_INTERVAL_MS,
  preflightSampleIntervalMs:
    DETERMINISTIC_DEBUG_PREFLIGHT_SAMPLE_INTERVAL_MS,
});

// --- Playback Event Types ---
const PLAYBACK_EVENT_TYPE = Object.freeze({
  CLUSTER_START: 'cluster.start',
  CLUSTER_STAGE: 'cluster.stage',
  CLUSTER_READY: 'cluster.ready',
  CLUSTER_STOP: 'cluster.stop',
  NODE_CREATED: 'node.created',
  NODE_STARTED: 'node.started',
  NODE_RESTART_BOUNDARY: 'node.restart.boundary',
  NODE_STOPPED: 'node.stopped',
  NODE_REMOVED: 'node.removed',
  NODE_STATUS_CHANGED: 'node.status.changed',
  CHAOS_ACTION_STARTED: 'chaos.action.started',
  CHAOS_ACTION_COMPLETED: 'chaos.action.completed',
  CHAOS_FAULT_INJECTED: 'chaos.fault.injected',
  CHAOS_FAULT_RECOVERED: 'chaos.fault.recovered',
  CHAOS_FAULT_FAILED: 'chaos.fault.failed',
  LOAD_STARTED: 'load.started',
  LOAD_PROGRESS: 'load.progress',
  LOAD_COMPLETED: 'load.completed',
  PARTITION_CREATED: 'partition.created',
  PARTITION_REMOVED: 'partition.removed',
  PARTITION_SPLIT: 'partition.split',
  PARTITION_MERGE: 'partition.merge',
  REPLICA_CREATED: 'replica.created',
  REPLICA_REMOVED: 'replica.removed',
  REPLICA_MOVED: 'replica.moved',
  WARNING: 'capture.warning',
});

// --- Log Subscription Capabilities ---
const LOG_SUBSCRIPTION_CAPABILITY = Object.freeze({
  STREAM_EVENTS: 'streamEvents',
  LIVE_SELECT_QUERY: 'liveSelectQuery',
});

// --- CLI Runner Constants ---
const DEFAULT_CONFIG_PATH = 'test/distributed/config/local.json';
const DEFAULT_REPORT_OUTPUT = 'test-output/report.json';
const ARG_CONFIG = '--config';
const ARG_SCENARIO = '--scenario';
const ARG_OUTPUT = '--output';
const ARG_VERBOSE = '--verbose';
const ARG_FAST_LOCAL = '--fast-local';
const ARG_NO_FAST_LOCAL = '--no-fast-local';
const ARG_DETERMINISTIC_DEBUG = '--deterministic-debug';
const ARG_NO_DETERMINISTIC_DEBUG = '--no-deterministic-debug';

const CLI = Object.freeze({
  DEFAULT_CONFIG: DEFAULT_CONFIG_PATH,
  DEFAULT_OUTPUT: DEFAULT_REPORT_OUTPUT,
  ARG_CONFIG,
  ARG_SCENARIO,
  ARG_OUTPUT,
  ARG_VERBOSE,
  ARG_FAST_LOCAL,
  ARG_NO_FAST_LOCAL,
  ARG_DETERMINISTIC_DEBUG,
  ARG_NO_DETERMINISTIC_DEBUG,
});

// --- Exit Codes ---
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

const EXIT_CODES = Object.freeze({
  SUCCESS: EXIT_SUCCESS,
  FAILURE: EXIT_FAILURE,
});

export {
  PORTS,
  TIMEOUTS,
  LABELS,
  CONVERGENCE_DEFAULTS,
  LOAD_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
  RESOURCE_DEFAULTS,
  DOCKER_DEFAULTS,
  ANALYZER_DEFAULTS,
  CONTAINER_ENV_KEYS,
  PARTITION_ENV_KEYS,
  NETWORK,
  NODE_ROLES,
  DEFAULT_CLUSTER_SIZE,
  OUTPUT,
  CONTAINER_LOG_TAIL_LINES,
  DEBUG_TRACE_DEFAULTS,
  LEAK_DEFAULTS,
  BENCHMARK_DEFAULTS,
  BENCHMARK_GATE_DEFAULTS,
  NODE_CLIENT_CHANNEL,
  NODE_CLIENT_DEFAULT_CHANNEL_POLICIES,
  NODE_CLIENT_CONTEXT_KEYS,
  NODE_CLIENT_ERROR_CODES,
  NODE_CLIENT_TIMEOUT_CLASS,
  NODE_CLIENT_CONTROL_SNAPSHOT_SCHEMA_VERSION,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
  NODE_CLIENT_PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SCHEMA_VERSION,
  NODE_CLIENT_PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_ADMIN_META,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_WEBSOCKET,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  resolveNodeClientChannelPolicies,
  SCENARIO_PHASE,
  SCENARIO_PHASE_SEQUENCE,
  PHASE_STATUS,
  PHASE_EVENT_TYPE,
  GATE_RESULT_MODE,
  CONSISTENCY_VERDICT,
  CONSISTENCY_MISMATCH_KIND,
  ASSERTION_STATUS,
  VERIFICATION_CONFIDENCE,
  ASSERTION_POLICY,
  RAFT_PROVIDER_DEFAULTS,
  PLAYBACK,
  PLAYBACK_EVENT_TYPE,
  DETERMINISTIC_DEBUG_DEFAULTS,
  LOG_SUBSCRIPTION_CAPABILITY,
  CLI,
  EXIT_CODES,
};
