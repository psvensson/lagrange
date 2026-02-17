/**
 * Constants for the distributed testing framework.
 * All scalars are defined here — no magic literals in framework code.
 */

// --- Port Constants ---
const REST_PORT = 8080;
const ADMIN_API_PORT = 8081;
const WS_TRANSPORT_PORT = 9080;

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

const TIMEOUTS = Object.freeze({
  NODE_STARTUP: NODE_STARTUP_TIMEOUT_MS,
  CONVERGENCE: CONVERGENCE_TIMEOUT_MS,
  QUIET_WINDOW: QUIET_WINDOW_MS,
  SCENARIO_DEFAULT: SCENARIO_DEFAULT_TIMEOUT_MS,
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
const MAX_SUSTAINED_OVER_TARGET_MS = 2000;
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
const BENCHMARK_READY_TIMEOUT_MS = 30000;
const BENCHMARK_READY_POLL_INTERVAL_MS = 500;
const BENCHMARK_TABLE_NAME = 'benchmark_events';

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
  readyTimeoutMs: BENCHMARK_READY_TIMEOUT_MS,
  readyPollIntervalMs: BENCHMARK_READY_POLL_INTERVAL_MS,
  tableName: BENCHMARK_TABLE_NAME,
});

// --- Playback Defaults ---
const PLAYBACK_TOPOLOGY_POLL_INTERVAL_MS = 1000;
const PLAYBACK_RESOURCE_POLL_INTERVAL_MS = 1000;

const PLAYBACK = Object.freeze({
  topologyPollIntervalMs: PLAYBACK_TOPOLOGY_POLL_INTERVAL_MS,
  resourcePollIntervalMs: PLAYBACK_RESOURCE_POLL_INTERVAL_MS,
});

// --- Playback Event Types ---
const PLAYBACK_EVENT_TYPE = Object.freeze({
  CLUSTER_START: 'cluster.start',
  CLUSTER_STAGE: 'cluster.stage',
  CLUSTER_READY: 'cluster.ready',
  CLUSTER_STOP: 'cluster.stop',
  NODE_CREATED: 'node.created',
  NODE_STARTED: 'node.started',
  NODE_STOPPED: 'node.stopped',
  NODE_REMOVED: 'node.removed',
  NODE_STATUS_CHANGED: 'node.status.changed',
  CHAOS_ACTION_STARTED: 'chaos.action.started',
  CHAOS_ACTION_COMPLETED: 'chaos.action.completed',
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

// --- CLI Runner Constants ---
const DEFAULT_CONFIG_PATH = 'test/distributed/config/local.json';
const DEFAULT_REPORT_OUTPUT = 'test-output/report.json';
const ARG_CONFIG = '--config';
const ARG_SCENARIO = '--scenario';
const ARG_OUTPUT = '--output';
const ARG_VERBOSE = '--verbose';

const CLI = Object.freeze({
  DEFAULT_CONFIG: DEFAULT_CONFIG_PATH,
  DEFAULT_OUTPUT: DEFAULT_REPORT_OUTPUT,
  ARG_CONFIG,
  ARG_SCENARIO,
  ARG_OUTPUT,
  ARG_VERBOSE,
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
  RESOURCE_DEFAULTS,
  DOCKER_DEFAULTS,
  ANALYZER_DEFAULTS,
  CONTAINER_ENV_KEYS,
  NETWORK,
  NODE_ROLES,
  DEFAULT_CLUSTER_SIZE,
  OUTPUT,
  DEBUG_TRACE_DEFAULTS,
  LEAK_DEFAULTS,
  BENCHMARK_DEFAULTS,
  PLAYBACK,
  PLAYBACK_EVENT_TYPE,
  CLI,
  EXIT_CODES,
};
