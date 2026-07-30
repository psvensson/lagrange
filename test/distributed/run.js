/**
 * CLI runner for the distributed testing framework.
 *
 * Usage:
 *   node test/distributed/run.js --config local.json
 *   node test/distributed/run.js --config local.json --scenario node-failure
 *   node test/distributed/run.js --config gcp-small.json --output results.json
 *   node test/distributed/run.js --config local.json --fast-local --verbose
 *   node test/distributed/run.js --config local.json --no-fast-local
 *
 * Requirements: 9.3, 9.4, 9.5, 9.6, 12.1
 */

import {fileURLToPath, pathToFileURL} from 'node:url';
import {basename, dirname, extname, join, resolve} from 'node:path';

import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {
  computeSourceFingerprint,
  SOURCE_FINGERPRINT_ALGORITHM,
} from '../../src/diagnostics/source-fingerprint.js';
import {parseConfig} from './harness/config-parser.js';
import {
  discoverScenarios,
  filterScenarios,
} from './harness/scenario-discovery.js';
import {
  selectCanonicalScenariosForConfig,
} from './harness/scenario-registry.js';
import {createCluster} from './harness/cluster.js';
import {
  provisionGcpDockerHosts,
  installGcpImage,
  teardownGcpProvisioner,
} from './gcp-run-orchestration.js';
import {
  buildImage,
  resolveGitDirty,
} from './build-image.js';
import {
  ReportWriter,
  computeSummary,
  computeStandardSummary,
} from './harness/report-writer.js';
import {formatLogEntry} from './harness/log-collector.js';
import {analyzeMemoryLeakFromPlayback} from './harness/memory-leak-analyzer.js';
import {buildPerformanceDiagnostics} from './harness/performance-diagnostics.js';
import {writeFailureBundlesForReport} from './harness/failure-bundle.js';
import {
  formatStateMachinePressurePreflightSummary,
  runStateMachinePressurePreflight,
} from './harness/state-machine-pressure-preflight.js';
import {
  createDistributedRunPhaseEventHelpers,
} from './run-phase-event-helpers.js';
import {createDistributedRunArgHelpers} from './run-args-helpers.js';
import {createDistributedRunRuntimeBundle} from './run-runtime-helpers.js';
import {
  CLI,
  EXIT_CODES,
  BENCHMARK_GATE_DEFAULTS,
  RAFT_PROVIDER_DEFAULTS,
  DETERMINISTIC_DEBUG_DEFAULTS,
} from './harness/constants.js';

const LIVE_LOG_PREFIX = '[live-log] ';
const LIVE_LOG_NODE_EXCLUDED = 'load-generator';
const ERROR_PATTERN = 'error';
const FAIL_PATTERN = 'fail';
const TIMEOUT_PATTERN = 'timeout';
const EMBEDDED_JSON_START = '{';
const EMBEDDED_LEVEL_WARN = 40;
const LEVEL_FATAL = 'fatal';
const LEVEL_ERROR = 'error';
const LEVEL_WARN = 'warn';
const LEVEL_INFO = 'info';
const LEVEL_DEBUG = 'debug';
const CONTROL_CHAR_MAX_CODE = 31;
const DELETE_CHAR_CODE = 127;
const RUNNER_STAGE_CONFIG_LOADING = 'Loading config: ';
const RUNNER_STAGE_CONFIG_LOADED = 'Config loaded: ';
const RUNNER_STAGE_SCENARIO_DISCOVERY = 'Discovering scenarios...\n';
const RUNNER_STAGE_SCENARIO_FILTER_ALL = 'all';
const RUNNER_STAGE_SCENARIO_FILTER_PREFIX = 'Scenario filter: ';
const RUNNER_STAGE_DOCKER_MODE_PREFIX = 'docker=';
const RUNNER_STAGE_CLUSTER_SIZE_PREFIX = 'size=';
const RUNNER_STAGE_REMOTE_HOSTS = 'remote-hosts';
const RUNNER_STAGE_LOCAL_SOCKET = 'local-socket';
const RUNNER_STAGE_SCENARIO_COUNT_PREFIX = 'Found ';
const RUNNER_STAGE_SCENARIO_COUNT_SUFFIX = ' scenario(s)\n';
const RUNNER_STAGE_ARTIFACTS_DIR_PREFIX = 'Artifacts dir: ';
const RUNNER_STAGE_DETERMINISTIC_DEBUG_PREFIX = 'Deterministic debug mode: ';
const BUILD_PROGRESS_LOG_PREFIX = 'docker-build: ';
const DOCKER_COMMAND_LOG_PREFIX = 'docker-cmd: ';
const SCENARIO_PHASE_LOG_PREFIX = '[phase] ';
const BUILD_PROGRESS_ID_KEY = 'id';
const BUILD_PROGRESS_STATUS_KEY = 'status';
const BUILD_PROGRESS_PROGRESS_KEY = 'progress';
const BUILD_PROGRESS_STREAM_KEY = 'stream';
const BUILD_PROGRESS_ERROR_KEY = 'error';
const DOCKER_OP_UNKNOWN = 'docker.operation';
const DOCKER_OP_IMAGE_BUILD = 'image.build';
const DOCKER_OP_NETWORK_CREATE = 'network.create';
const DOCKER_OP_NETWORK_REMOVE = 'network.remove';
const DOCKER_OP_CONTAINER_CREATE = 'container.create';
const DOCKER_OP_CONTAINER_START = 'container.start';
const DOCKER_OP_CONTAINER_STOP = 'container.stop';
const DOCKER_OP_CONTAINER_REMOVE = 'container.remove';
const DOCKER_OP_NETWORK_CONNECT = 'network.connect';
const DOCKER_OP_NETWORK_DISCONNECT = 'network.disconnect';
const DOCKER_LINE_EMPTY = '';
const GIT_HASH_COMMAND = 'git';
const GIT_HASH_ARGS = Object.freeze(['rev-parse', '--short=12', 'HEAD']);
const GIT_STATUS_COMMAND = 'git';
const GIT_STATUS_ARGS = Object.freeze(['status', '--porcelain']);
const GIT_HASH_FALLBACK = 'unknown';
const IMAGE_LABEL_GIT_HASH = 'ddb.git-hash';
const IMAGE_REUSE_LOG_PREFIX = 'Reusing Docker image for commit ';
const IMAGE_REBUILD_DIRTY_PREFIX =
  'Detected uncommitted workspace changes; rebuilding image: ';
const IMAGE_BUILD_LOG_PREFIX = 'Building Docker image';
const IMAGE_BUILD_LOG_SUFFIX = '...';
const IMAGE_BUILD_WITH_COMMIT_PREFIX = ' for commit ';
const IMAGE_SKIP_DIRTY_REBUILD_PREFIX =
  'Skipping dirty-workspace rebuild in fast-local mode: ';
const IMAGE_SKIP_DIRTY_REBUILD_MISSING_SUFFIX =
  ' (image missing, rebuilding once)';
const RUN_OUTPUT_DIRNAME = '.playback';
const REPORT_JSON_EXTENSION = '.report.json';
const FALLBACK_OUTPUT_BASENAME = 'report';
const RUN_STATUS_FILENAME = 'run-status.json';
const RUN_STATUS_ARTIFACT_TYPE = 'distributed-run-status';
const RUN_STATUS_STATE_RUNNING = 'running';
const RUN_STATUS_STATE_SCENARIO_PLAYBACK_COMPLETE =
  'scenario-playback-complete';
const RUN_STATUS_STATE_FAILURE_BUNDLES_WRITTEN = 'failure-bundles-written';
const RUN_STATUS_STATE_REPORT_WRITTEN = 'report-written';
const RUN_STATUS_STATE_FATAL_ERROR = 'fatal-error';
const HISTORICAL_REPORT_SCAN_LIMIT = 20;
const UTF8_ENCODING = 'utf8';
const NEWLINE = '\n';
const JSON_INDENT = 2;
const TRACE_ASSERTION_ERROR_PREFIX = 'Trace assertion failed: ';
const TRACE_ASSERTION_MISSING_ARTIFACT = 'trace artifact missing';
const TRACE_ASSERTION_NO_EVENTS = 'no trace events captured';
const TRACE_ASSERTION_LINEAGE_PREFIX_MISSING =
  'required lineage prefix not found: ';
const MEMORY_ASSERTION_ERROR_PREFIX = 'Memory leak assertion failed: ';
const CLEANLINESS_ASSERTION_ERROR_PREFIX =
  'Scenario cleanliness assertion failed: ';
const MEMORY_ASSERTION_SAMPLES_MISSING = 'memory samples unavailable';
const MEMORY_ASSERTION_LEAK_DETECTED_PREFIX =
  'memory leak detected on nodes: ';
const MEMORY_ASSERTION_ANALYSIS_INSUFFICIENT =
  'memory analysis window insufficient for leak verdict';
const MEMORY_ANALYSIS_WARNING_SAMPLES_PATH_MISSING = 'samples-path-missing';
const MEMORY_ANALYSIS_WARNING_SAMPLES_READ_FAILED = 'samples-read-failed';
const SCENARIO_ASSERTION_POLICY = Object.freeze({
  'node-join-under-load': Object.freeze({
    failOnPlaybackWarnings: true,
    memoryLeak: Object.freeze({
      enabled: true,
      failOnDetection: false,
      requireSamples: true,
    }),
  }),
});
const SCENARIO_FILTER_ALL = 'all';
const BENCHMARK_GATE_STATUS = Object.freeze({
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});
const BENCHMARK_GATE_SKIP_REASON = Object.freeze({
  DISABLED: 'disabled',
  NO_BENCHMARK_SCENARIOS: 'no-benchmark-scenarios',
  BASELINE_MISSING: 'baseline-missing',
});
const BENCHMARK_GATE_FAIL_REASON = Object.freeze({
  THROUGHPUT_REGRESSION: 'throughput-regression',
  THROUGHPUT_RATIO_BELOW_MINIMUM: 'throughput-ratio-below-minimum',
  PARITY_MISMATCH: 'parity-mismatch',
  BASELINE_REQUIRED_MISSING: 'baseline-required-missing',
});
const BENCHMARK_GATE_PARITY_POLICY = Object.freeze({
  IGNORE: 'ignore',
  WARN: 'warn',
  FAIL: 'fail',
});
const FAST_LOCAL_SOURCE_RELATIVE_PATH = 'src';
const FAST_LOCAL_SOURCE_CONTAINER_PATH = '/app/src';
const FAST_LOCAL_BIND_READ_ONLY_SUFFIX = ':ro';
const FAST_LOCAL_LOG_PREFIX =
  'Fast local mode enabled: mounted host source, container reuse, ' +
  'and relaxed dirty rebuild policy\n';
const SEEDED_PRNG_MULTIPLIER = 1664525;
const SEEDED_PRNG_INCREMENT = 1013904223;
const SEEDED_PRNG_MODULUS = 4294967296;
const SCENARIO_PHASE_EVENT_TYPE_START = 'phase.start';
const SCENARIO_PHASE_EVENT_TYPE_END = 'phase.end';
const SCENARIO_PHASE_EVENT_TYPE_PROGRESS = 'phase.progress';
const SCENARIO_PHASE_EVENT_TYPE_LAST_MEANINGFUL_CHANGE =
  'phase.last_meaningful_change';
const SCENARIO_PHASE_EVENT_TYPE_NO_PROGRESS_WARNING =
  'phase.no_progress_warning';
const SCENARIO_PHASE_EVENT_TYPE_FAILED_NO_PROGRESS =
  'phase.failed_no_progress';

const SUMMARY_SEPARATOR =
  '─────────────────────────────────────────────────────';
const SUMMARY_HEADER = '\n' + SUMMARY_SEPARATOR + '\n';
const SUMMARY_FOOTER = SUMMARY_SEPARATOR + '\n';
const SUMMARY_RESULT_PASS = '✓ PASS';
const SUMMARY_RESULT_FAIL = '✗ FAIL';
const SUMMARY_LABEL_DURATION = '  duration: ';
const SUMMARY_LABEL_COST = '  cost:     ';
const SUMMARY_LABEL_CLUSTER = '  cluster:  ';
const SUMMARY_LABEL_LOAD = '  load:     ';
const SUMMARY_LABEL_LATENCY = '  latency:  ';
const SUMMARY_LABEL_VS_PREV = '  vs prev:  ';
const SUMMARY_LABEL_PG_BASE = '  vs pg:    ';
const SUMMARY_NODES_SUFFIX = ' nodes';
const SUMMARY_OPS_SUFFIX = ' ops';
const SUMMARY_SUCCESS_RATE_SUFFIX = ' success';
const SUMMARY_OPS_PER_SEC_SUFFIX = ' ops/s';
const SUMMARY_MS_SUFFIX = 'ms';
const SUMMARY_LATENCY_P50 = 'p50=';
const SUMMARY_LATENCY_P95 = ' p95=';
const SUMMARY_LATENCY_P99 = ' p99=';
const SUMMARY_PREV_PASS_CHANGED = 'status changed';
const SUMMARY_PREV_SAME = 'same status';
const SUMMARY_PREV_OPS_PREFIX = ', ops/s ';
const SUMMARY_PREV_P99_PREFIX = ', p99 ';
const SUMMARY_PG_THROUGHPUT_PREFIX = 'throughput ';
const SUMMARY_PG_THROUGHPUT_SUFFIX = 'x pg';
const SUMMARY_PG_SUT_PREFIX = ' (sut=';
const SUMMARY_PG_BASELINE_PREFIX = ', pg=';
const SUMMARY_PG_CLOSE_PAREN = ')';
const SUMMARY_NO_PREV = '  vs prev:  no previous run found\n';
const SUMMARY_NO_PG = '  vs pg:    no baseline available\n';
const SUMMARY_PERCENT_MULTIPLIER = 100;
const SUMMARY_FIXED_DECIMALS_RATE = 1;
const SUMMARY_FIXED_DECIMALS_RATIO = 2;
const SUMMARY_FIXED_DECIMALS_OPS = 1;
const SUMMARY_FIXED_DECIMALS_USD = 4;
const SUMMARY_COST_ESTIMATED_SUFFIX = ' (est)';
const SUMMARY_COST_TOTAL_PREFIX = 'Total GCP cost (all scenarios, est): ';
const SUMMARY_PHASE_HEADER = 'Wall time: ';
const SUMMARY_PHASE_SETUP_LABEL = 'setup ';
const SUMMARY_PHASE_SCENARIO_LABEL = 'scenario ';
const SUMMARY_PHASE_TEARDOWN_LABEL = 'teardown ';
const SUMMARY_PHASE_SEPARATOR = ' | ';
const SUMMARY_SECONDS_SUFFIX = 's';

const {
  createScenarioPhaseEventSink,
  formatScenarioPhaseEventLine,
  installScenarioPhaseEventSink,
  resolveClusterSize,
} = createDistributedRunPhaseEventHelpers({
  SCENARIO_PHASE_LOG_PREFIX,
  SCENARIO_PHASE_EVENT_TYPE_START,
  SCENARIO_PHASE_EVENT_TYPE_END,
  SCENARIO_PHASE_EVENT_TYPE_PROGRESS,
  SCENARIO_PHASE_EVENT_TYPE_LAST_MEANINGFUL_CHANGE,
  SCENARIO_PHASE_EVENT_TYPE_NO_PROGRESS_WARNING,
  SCENARIO_PHASE_EVENT_TYPE_FAILED_NO_PROGRESS,
});
const {parseArgs} = createDistributedRunArgHelpers({CLI});

const DISTRIBUTED_RUN_RUNTIME_BUNDLE = createDistributedRunRuntimeBundle({
  LIVE_LOG_PREFIX,
  LIVE_LOG_NODE_EXCLUDED,
  ERROR_PATTERN,
  FAIL_PATTERN,
  TIMEOUT_PATTERN,
  EMBEDDED_JSON_START,
  EMBEDDED_LEVEL_WARN,
  LEVEL_FATAL,
  LEVEL_ERROR,
  LEVEL_WARN,
  LEVEL_INFO,
  LEVEL_DEBUG,
  CONTROL_CHAR_MAX_CODE,
  DELETE_CHAR_CODE,
  RUNNER_STAGE_CONFIG_LOADING,
  RUNNER_STAGE_CONFIG_LOADED,
  RUNNER_STAGE_SCENARIO_DISCOVERY,
  RUNNER_STAGE_SCENARIO_FILTER_ALL,
  RUNNER_STAGE_SCENARIO_FILTER_PREFIX,
  RUNNER_STAGE_DOCKER_MODE_PREFIX,
  RUNNER_STAGE_CLUSTER_SIZE_PREFIX,
  RUNNER_STAGE_REMOTE_HOSTS,
  RUNNER_STAGE_LOCAL_SOCKET,
  RUNNER_STAGE_SCENARIO_COUNT_PREFIX,
  RUNNER_STAGE_SCENARIO_COUNT_SUFFIX,
  RUNNER_STAGE_ARTIFACTS_DIR_PREFIX,
  RUNNER_STAGE_DETERMINISTIC_DEBUG_PREFIX,
  BUILD_PROGRESS_LOG_PREFIX,
  DOCKER_COMMAND_LOG_PREFIX,
  SCENARIO_PHASE_LOG_PREFIX,
  BUILD_PROGRESS_ID_KEY,
  BUILD_PROGRESS_STATUS_KEY,
  BUILD_PROGRESS_PROGRESS_KEY,
  BUILD_PROGRESS_STREAM_KEY,
  BUILD_PROGRESS_ERROR_KEY,
  DOCKER_OP_UNKNOWN,
  DOCKER_OP_IMAGE_BUILD,
  DOCKER_OP_NETWORK_CREATE,
  DOCKER_OP_NETWORK_REMOVE,
  DOCKER_OP_CONTAINER_CREATE,
  DOCKER_OP_CONTAINER_START,
  DOCKER_OP_CONTAINER_STOP,
  DOCKER_OP_CONTAINER_REMOVE,
  DOCKER_OP_NETWORK_CONNECT,
  DOCKER_OP_NETWORK_DISCONNECT,
  DOCKER_LINE_EMPTY,
  GIT_HASH_COMMAND,
  GIT_HASH_ARGS,
  GIT_STATUS_COMMAND,
  GIT_STATUS_ARGS,
  GIT_HASH_FALLBACK,
  IMAGE_LABEL_GIT_HASH,
  IMAGE_REUSE_LOG_PREFIX,
  IMAGE_REBUILD_DIRTY_PREFIX,
  IMAGE_BUILD_LOG_PREFIX,
  IMAGE_BUILD_LOG_SUFFIX,
  IMAGE_BUILD_WITH_COMMIT_PREFIX,
  IMAGE_SKIP_DIRTY_REBUILD_PREFIX,
  IMAGE_SKIP_DIRTY_REBUILD_MISSING_SUFFIX,
  RUN_OUTPUT_DIRNAME,
  REPORT_JSON_EXTENSION,
  FALLBACK_OUTPUT_BASENAME,
  HISTORICAL_REPORT_SCAN_LIMIT,
  UTF8_ENCODING,
  TRACE_ASSERTION_ERROR_PREFIX,
  TRACE_ASSERTION_MISSING_ARTIFACT,
  TRACE_ASSERTION_NO_EVENTS,
  TRACE_ASSERTION_LINEAGE_PREFIX_MISSING,
  MEMORY_ASSERTION_ERROR_PREFIX,
  CLEANLINESS_ASSERTION_ERROR_PREFIX,
  MEMORY_ASSERTION_SAMPLES_MISSING,
  MEMORY_ASSERTION_LEAK_DETECTED_PREFIX,
  MEMORY_ASSERTION_ANALYSIS_INSUFFICIENT,
  MEMORY_ANALYSIS_WARNING_SAMPLES_PATH_MISSING,
  MEMORY_ANALYSIS_WARNING_SAMPLES_READ_FAILED,
  SCENARIO_ASSERTION_POLICY,
  SCENARIO_FILTER_ALL,
  BENCHMARK_GATE_DEFAULTS,
  BENCHMARK_GATE_STATUS,
  BENCHMARK_GATE_SKIP_REASON,
  BENCHMARK_GATE_FAIL_REASON,
  BENCHMARK_GATE_PARITY_POLICY,
  FAST_LOCAL_SOURCE_RELATIVE_PATH,
  FAST_LOCAL_SOURCE_CONTAINER_PATH,
  FAST_LOCAL_BIND_READ_ONLY_SUFFIX,
  FAST_LOCAL_LOG_PREFIX,
  SEEDED_PRNG_MULTIPLIER,
  SEEDED_PRNG_INCREMENT,
  SEEDED_PRNG_MODULUS,
  SCENARIO_PHASE_EVENT_TYPE_START,
  SCENARIO_PHASE_EVENT_TYPE_END,
  SCENARIO_PHASE_EVENT_TYPE_PROGRESS,
  SCENARIO_PHASE_EVENT_TYPE_LAST_MEANINGFUL_CHANGE,
  SCENARIO_PHASE_EVENT_TYPE_NO_PROGRESS_WARNING,
  SCENARIO_PHASE_EVENT_TYPE_FAILED_NO_PROGRESS,
  SUMMARY_SEPARATOR,
  SUMMARY_HEADER,
  SUMMARY_FOOTER,
  SUMMARY_RESULT_PASS,
  SUMMARY_RESULT_FAIL,
  SUMMARY_LABEL_DURATION,
  SUMMARY_LABEL_COST,
  SUMMARY_LABEL_CLUSTER,
  SUMMARY_LABEL_LOAD,
  SUMMARY_LABEL_LATENCY,
  SUMMARY_LABEL_VS_PREV,
  SUMMARY_LABEL_PG_BASE,
  SUMMARY_NODES_SUFFIX,
  SUMMARY_OPS_SUFFIX,
  SUMMARY_SUCCESS_RATE_SUFFIX,
  SUMMARY_OPS_PER_SEC_SUFFIX,
  SUMMARY_MS_SUFFIX,
  SUMMARY_LATENCY_P50,
  SUMMARY_LATENCY_P95,
  SUMMARY_LATENCY_P99,
  SUMMARY_PREV_PASS_CHANGED,
  SUMMARY_PREV_SAME,
  SUMMARY_PREV_OPS_PREFIX,
  SUMMARY_PREV_P99_PREFIX,
  SUMMARY_PG_THROUGHPUT_PREFIX,
  SUMMARY_PG_THROUGHPUT_SUFFIX,
  SUMMARY_PG_SUT_PREFIX,
  SUMMARY_PG_BASELINE_PREFIX,
  SUMMARY_PG_CLOSE_PAREN,
  SUMMARY_NO_PREV,
  SUMMARY_NO_PG,
  SUMMARY_PERCENT_MULTIPLIER,
  SUMMARY_FIXED_DECIMALS_RATE,
  SUMMARY_FIXED_DECIMALS_RATIO,
  SUMMARY_FIXED_DECIMALS_OPS,
  SUMMARY_FIXED_DECIMALS_USD,
  SUMMARY_COST_ESTIMATED_SUFFIX,
  SUMMARY_COST_TOTAL_PREFIX,
  SUMMARY_PHASE_HEADER,
  SUMMARY_PHASE_SETUP_LABEL,
  SUMMARY_PHASE_SCENARIO_LABEL,
  SUMMARY_PHASE_TEARDOWN_LABEL,
  SUMMARY_PHASE_SEPARATOR,
  SUMMARY_SECONDS_SUFFIX,
  ReportWriter,
  analyzeMemoryLeakFromPlayback,
  buildPerformanceDiagnostics,
  createCluster,
  createScenarioPhaseEventSink,
  formatLogEntry,
  installScenarioPhaseEventSink,
  resolveClusterSize,
  dirname,
  pathToFileURL,
  resolve,
  normalizeFiniteNumber,
  formatStateMachinePressurePreflightSummary,
  runStateMachinePressurePreflight,
});

const {
  createDockerOperationSink,
  extractBuildProgressLine,
  runScenarios,
  shouldPrintLiveLogEntry,
  normalizeScenarioPayload,
  evaluateTraceAssertions,
  resolveScenarioMemoryLeakConfig,
  evaluateScenarioCleanlinessAssertions,
  evaluateMemoryLeakAssertions,
  loadScenarioModule,
  resolveBenchmarkGateConfig,
  buildHistoricalBaselineIndex,
  formatRunSummary,
} = DISTRIBUTED_RUN_RUNTIME_BUNDLE;

function buildFastLocalSourceBind(cwd = process.cwd()) {
  const hostSourcePath = resolve(cwd, FAST_LOCAL_SOURCE_RELATIVE_PATH);
  return hostSourcePath +
    ':' +
    FAST_LOCAL_SOURCE_CONTAINER_PATH +
    FAST_LOCAL_BIND_READ_ONLY_SUFFIX;
}

async function applyFastLocalConfig(config, cwd = process.cwd()) {
  const dockerConfig = (config && typeof config.docker === 'object') ?
    config.docker :
    {};
  const sourceBind = buildFastLocalSourceBind(cwd);
  const existingBinds = Array.isArray(dockerConfig.binds) ?
    dockerConfig.binds.filter((entry) => typeof entry === 'string' &&
      entry.length > 0) :
    [];
  const mergedBinds = existingBinds.includes(sourceBind) ?
    existingBinds :
    [...existingBinds, sourceBind];

  // Content-fingerprint the exact src/ tree we bind-mount live into the reused
  // containers. Threaded into the node env so a changed fingerprint forces a
  // container recreate (fresh process → fresh import), defeating the stale-code
  // trap; unchanged keeps the fast warm-reuse path. Only meaningful in fast-local
  // (image mode bakes src in and is covered by the git-hash image label).
  const hostSourcePath = resolve(cwd, FAST_LOCAL_SOURCE_RELATIVE_PATH);
  const srcFingerprint = await computeSourceFingerprint(hostSourcePath);

  return {
    ...config,
    docker: {
      ...dockerConfig,
      skipBuildOnDirty: true,
      reuseContainers: true,
      keepRunningContainers: true,
      binds: mergedBinds,
      srcFingerprint,
      srcFingerprintAlgo: SOURCE_FINGERPRINT_ALGORITHM,
    },
  };
}

function isLocalDockerConfig(config) {
  // A config that will provision GCP hosts is NOT local even though
  // docker.hosts is still empty at this point (hosts are injected later by
  // provisionGcpDockerHosts). Fast-local mounts the host's source tree into
  // containers, which remote VMs cannot see — the remote daemons must run the
  // baked image instead. Treating a gcp config as local here produces
  // containers that crash with "Cannot find module /app/src/index.js".
  if (config?.gcp && typeof config.gcp === 'object') {
    return false;
  }
  return !Array.isArray(config?.docker?.hosts) ||
    config.docker.hosts.length === 0;
}

function resolveFastLocalMode(args, config) {
  if (!isLocalDockerConfig(config)) {
    return false;
  }
  if (args?.fastLocal === true) {
    return true;
  }
  if (args?.fastLocal === false) {
    return false;
  }
  return true;
}

function normalizePositiveInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return fallback;
  }
  return Math.floor(normalized);
}

function resolveDeterministicDebugConfig(args, config) {
  const configured = config?.deterministicDebug &&
    typeof config.deterministicDebug === 'object' ?
    config.deterministicDebug :
    {};
  const enabled = args?.deterministicDebug === true ?
    true :
    (args?.deterministicDebug === false ?
      false :
      configured.enabled === true);

  return {
    enabled,
    seed: normalizePositiveInteger(
      configured.seed,
      DETERMINISTIC_DEBUG_DEFAULTS.seed,
    ),
    convergenceSampleIntervalMs: normalizePositiveInteger(
      configured.convergenceSampleIntervalMs,
      DETERMINISTIC_DEBUG_DEFAULTS.convergenceSampleIntervalMs,
    ),
    preflightSampleIntervalMs: normalizePositiveInteger(
      configured.preflightSampleIntervalMs,
      DETERMINISTIC_DEBUG_DEFAULTS.preflightSampleIntervalMs,
    ),
  };
}

function applyDeterministicDebugConfig(config, deterministicDebug) {
  if (!deterministicDebug?.enabled) {
    return config;
  }
  const convergenceConfig =
    config?.convergence && typeof config.convergence === 'object' ?
      config.convergence :
      {};
  const benchmarkConfig =
    config?.benchmark && typeof config.benchmark === 'object' ?
      config.benchmark :
      {};
  return {
    ...config,
    deterministicDebug: {
      enabled: true,
      seed: deterministicDebug.seed,
      convergenceSampleIntervalMs:
        deterministicDebug.convergenceSampleIntervalMs,
      preflightSampleIntervalMs:
        deterministicDebug.preflightSampleIntervalMs,
    },
    convergence: {
      ...convergenceConfig,
      sampleIntervalMs: deterministicDebug.convergenceSampleIntervalMs,
    },
    benchmark: {
      ...benchmarkConfig,
      readyPollIntervalMs: deterministicDebug.preflightSampleIntervalMs,
      quiescentPollIntervalMs: deterministicDebug.preflightSampleIntervalMs,
      postLoadDrainPollIntervalMs:
        deterministicDebug.preflightSampleIntervalMs,
    },
  };
}

function createSeededRandom(seed) {
  let state = normalizePositiveInteger(
    seed,
    DETERMINISTIC_DEBUG_DEFAULTS.seed,
  ) >>> 0;
  if (state === 0) {
    state = DETERMINISTIC_DEBUG_DEFAULTS.seed >>> 0;
  }
  return () => {
    state = (SEEDED_PRNG_MULTIPLIER * state + SEEDED_PRNG_INCREMENT) >>> 0;
    return state / SEEDED_PRNG_MODULUS;
  };
}

function installDeterministicRandom(seed) {
  Math.random = createSeededRandom(seed);
}

function buildReportMetadata(args, runConfig, deterministicDebug) {
  const metadata = {
    raftProvider: resolveRunRaftProvider(runConfig),
    configPath: String(args?.config || CLI.DEFAULT_CONFIG),
    scenarioFilter: String(args?.scenario || SCENARIO_FILTER_ALL),
  };
  if (deterministicDebug?.enabled === true) {
    metadata.deterministicDebug = {
      enabled: true,
      seed: deterministicDebug.seed,
      convergenceSampleIntervalMs:
        deterministicDebug.convergenceSampleIntervalMs,
      preflightSampleIntervalMs:
        deterministicDebug.preflightSampleIntervalMs,
    };
  }
  return metadata;
}

/**
 * Build the Docker image before running scenarios.
 * @param {Object} config - Parsed cluster configuration
 * @param {boolean} verbose
 * @param {Function|null} dockerOperationSink
 * @param {Object} [options]
 * @param {string} [options.gitHash]
 * @param {boolean} [options.gitDirty]
 */
/**
 * Derive per-run artifact output directory from report path.
 * @param {string} reportOutputPath
 * @return {string}
 */
function deriveRunOutputDir(reportOutputPath) {
  const outputPath = String(reportOutputPath || CLI.DEFAULT_OUTPUT);
  const reportDir = dirname(outputPath);
  const reportFilename = basename(outputPath);
  let reportBasename = reportFilename;
  if (reportFilename.endsWith(REPORT_JSON_EXTENSION)) {
    reportBasename = reportFilename.slice(0, -REPORT_JSON_EXTENSION.length);
  } else {
    const extension = extname(reportFilename);
    if (extension.length > 0) {
      reportBasename = reportFilename.slice(0, -extension.length);
    }
  }
  const outputBasename = reportBasename || FALLBACK_OUTPUT_BASENAME;
  return join(reportDir, RUN_OUTPUT_DIRNAME, outputBasename);
}

function deriveRunStatusPath(outputDir) {
  return join(String(outputDir || ''), RUN_STATUS_FILENAME);
}

function buildRunStatusArtifact(fields = {}) {
  const artifact = {
    artifactType: RUN_STATUS_ARTIFACT_TYPE,
    updatedAt: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      artifact[key] = value;
    }
  }
  return artifact;
}

async function writeRunStatusArtifact(outputDir, fields = {}) {
  const statusPath = deriveRunStatusPath(outputDir);
  const artifact = buildRunStatusArtifact(fields);
  await mkdir(dirname(statusPath), {recursive: true});
  await writeFile(
    statusPath,
    JSON.stringify(artifact, null, JSON_INDENT) + NEWLINE,
    UTF8_ENCODING,
  );
  return {
    path: statusPath,
    artifact,
  };
}

function parseTimestampMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Load previous reports in the same directory for historical comparisons.
 * Includes:
 * - the current output path (if it already exists from a prior run)
 * - any sibling *.report.json files
 * @param {string} reportOutputPath
 * @return {Promise<Array<Object>>}
 */
async function loadHistoricalReports(reportOutputPath) {
  const resolvedOutputPath = resolve(
    String(reportOutputPath || CLI.DEFAULT_OUTPUT),
  );
  const reportDir = dirname(resolvedOutputPath);
  const candidatePaths = new Set([resolvedOutputPath]);

  try {
    const entries = await readdir(reportDir, {withFileTypes: true});
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.endsWith(REPORT_JSON_EXTENSION)) {
        continue;
      }
      candidatePaths.add(resolve(join(reportDir, entry.name)));
    }
  } catch (_scanErr) {
    // Best-effort history loading.
  }

  const historicalReports = [];
  for (const candidatePath of candidatePaths) {
    try {
      const raw = await readFile(candidatePath, UTF8_ENCODING);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        continue;
      }
      if (!Array.isArray(parsed.scenarios)) {
        continue;
      }
      historicalReports.push({
        path: candidatePath,
        timestamp: parsed.timestamp || null,
        summary: parsed.summary || null,
        standardSummary:
          parsed.standardSummary && typeof parsed.standardSummary === 'object' ?
            parsed.standardSummary :
            null,
        metadata:
          parsed.metadata && typeof parsed.metadata === 'object' ?
            parsed.metadata :
            null,
        scenarios: parsed.scenarios,
      });
    } catch (_readErr) {
      // Ignore unreadable or invalid report files.
    }
  }

  historicalReports.sort((left, right) =>
    parseTimestampMs(right.timestamp) - parseTimestampMs(left.timestamp));
  return historicalReports.slice(0, HISTORICAL_REPORT_SCAN_LIMIT);
}

function normalizeFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function resolveRunRaftProvider(config, env = process.env) {
  const configuredProvider = config?.raftProvider;
  if (typeof configuredProvider === 'string' &&
    configuredProvider.trim().length > 0) {
    return configuredProvider.trim().toLowerCase();
  }

  const envValue = env?.[RAFT_PROVIDER_DEFAULTS.envKey];
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    return envValue.trim().toLowerCase();
  }

  return RAFT_PROVIDER_DEFAULTS.provider;
}

function evaluateBenchmarkRegressionGate(reportPayload, historyReports, config) {
  const gateConfig = resolveBenchmarkGateConfig(config);
  const currentProvider = resolveRunRaftProvider(config);
  const baseResult = {
    enabled: gateConfig.enabled,
    status: BENCHMARK_GATE_STATUS.SKIPPED,
    reason: BENCHMARK_GATE_SKIP_REASON.DISABLED,
    settings: gateConfig,
    currentProvider,
    baselineProvider: gateConfig.baselineProvider,
    comparedScenarioCount: 0,
    failedScenarioCount: 0,
    mitigatedScenarioCount: 0,
    missingBaselineScenarios: [],
    comparisons: [],
    parityMismatchCount: 0,
    lowThroughputRatioCount: 0,
    warnings: [],
  };

  if (!gateConfig.enabled) {
    return baseResult;
  }

  const currentScenarios = Array.isArray(
    reportPayload?.standardSummary?.scenarios,
  ) ?
    reportPayload.standardSummary.scenarios :
    [];
  const currentBenchmarkScenarios = currentScenarios.filter((entry) => {
    const similarityKey = String(entry?.similarityKey || '').trim();
    const currentOpsPerSec = normalizeFiniteNumber(entry?.current?.opsPerSec);
    return similarityKey.length > 0 &&
      currentOpsPerSec !== null &&
      currentOpsPerSec >= 0;
  });

  if (currentBenchmarkScenarios.length === 0) {
    return {
      ...baseResult,
      reason: BENCHMARK_GATE_SKIP_REASON.NO_BENCHMARK_SCENARIOS,
    };
  }

  const baselineIndex = buildHistoricalBaselineIndex(
    historyReports,
    gateConfig.baselineProvider,
  );

  let failedScenarioCount = 0;
  let mitigatedScenarioCount = 0;
  let parityMismatchCount = 0;
  let lowThroughputRatioCount = 0;
  const missingBaselineScenarios = [];
  const comparisons = [];
  const warnings = [];

  for (const scenarioEntry of currentBenchmarkScenarios) {
    const similarityKey = String(scenarioEntry?.similarityKey || '').trim();
    const currentOpsPerSec = normalizeFiniteNumber(
      scenarioEntry?.current?.opsPerSec,
    );
    if (!similarityKey || currentOpsPerSec === null) {
      continue;
    }

    const throughputRatioSutToBaseline = normalizeFiniteNumber(
      scenarioEntry?.postgresBaseline?.throughputRatioSutToBaseline,
    );
    const throughputRatioBelowMinimum =
      gateConfig.minimumThroughputRatioSutToBaseline !== null &&
      throughputRatioSutToBaseline !== null &&
      throughputRatioSutToBaseline <
        gateConfig.minimumThroughputRatioSutToBaseline;
    if (throughputRatioBelowMinimum) {
      lowThroughputRatioCount += 1;
    }

    const parityStatus = String(
      scenarioEntry?.parity?.status || '',
    ).trim().toLowerCase();
    const parityMismatch = parityStatus === 'mismatched';
    if (parityMismatch) {
      parityMismatchCount += 1;
    }
    const parityReasonsRaw = scenarioEntry?.parity?.reasons;
    const parityReasonCodes = Array.isArray(parityReasonsRaw) ?
      parityReasonsRaw
        .map((reason) => {
          if (typeof reason === 'string') {
            return reason;
          }
          if (reason && typeof reason === 'object') {
            return String(reason.code || '');
          }
          return '';
        })
        .filter((reasonCode) => reasonCode.length > 0) :
      [];
    const parityPolicyAction = parityMismatch ?
      gateConfig.parityMismatchPolicy :
      null;
    if (parityMismatch &&
        gateConfig.parityMismatchPolicy ===
          BENCHMARK_GATE_PARITY_POLICY.WARN) {
      const reasonSuffix = parityReasonCodes.length > 0 ?
        ' reasons=' + parityReasonCodes.join(',') :
        '';
      warnings.push(
        'parity mismatch for ' +
          (scenarioEntry?.scenario || 'unknown-scenario') +
          reasonSuffix,
      );
    }

    const baseline = baselineIndex.get(similarityKey);
    let baselineOpsPerSec = null;
    let throughputRegressionRatio = null;
    let regressedBeyondThreshold = false;
    let mitigationApplied = false;
    if (!baseline) {
      missingBaselineScenarios.push({
        scenario: scenarioEntry?.scenario || null,
        similarityKey,
      });
    } else {
      baselineOpsPerSec = normalizeFiniteNumber(baseline.opsPerSec);
    }
    if (baseline &&
        (baselineOpsPerSec === null || baselineOpsPerSec <= 0)) {
      missingBaselineScenarios.push({
        scenario: scenarioEntry?.scenario || null,
        similarityKey,
      });
      baselineOpsPerSec = null;
    }
    if (baselineOpsPerSec !== null && baselineOpsPerSec > 0) {
      throughputRegressionRatio =
        (baselineOpsPerSec - currentOpsPerSec) / baselineOpsPerSec;
      regressedBeyondThreshold =
        throughputRegressionRatio > gateConfig.maxThroughputRegressionRatio;
      mitigationApplied = regressedBeyondThreshold &&
        Boolean(gateConfig.approvedMitigationId);
      if (regressedBeyondThreshold && mitigationApplied) {
        mitigatedScenarioCount += 1;
      }
    }

    const failureReasons = [];
    if (regressedBeyondThreshold && !mitigationApplied) {
      failureReasons.push(BENCHMARK_GATE_FAIL_REASON.THROUGHPUT_REGRESSION);
    }
    if (throughputRatioBelowMinimum) {
      failureReasons.push(
        BENCHMARK_GATE_FAIL_REASON.THROUGHPUT_RATIO_BELOW_MINIMUM,
      );
    }
    if (parityMismatch &&
        gateConfig.parityMismatchPolicy === BENCHMARK_GATE_PARITY_POLICY.FAIL) {
      failureReasons.push(BENCHMARK_GATE_FAIL_REASON.PARITY_MISMATCH);
    }
    if (failureReasons.length > 0) {
      failedScenarioCount += 1;
    }

    comparisons.push({
      scenario: scenarioEntry?.scenario || null,
      similarityKey,
      currentOpsPerSec,
      baselineOpsPerSec,
      throughputRegressionRatio,
      threshold: gateConfig.maxThroughputRegressionRatio,
      regressedBeyondThreshold,
      mitigationApplied,
      approvedMitigationId: gateConfig.approvedMitigationId,
      baselineReportPath: baseline?.reportPath || null,
      baselineReportTimestamp: baseline?.reportTimestamp || null,
      throughputRatioSutToBaseline,
      minimumThroughputRatioSutToBaseline:
        gateConfig.minimumThroughputRatioSutToBaseline,
      throughputRatioBelowMinimum,
      parityStatus: parityStatus || null,
      parityMismatch,
      parityReasonCodes,
      parityPolicyAction,
      failureReasons,
    });
  }

  const noUsableBaselines = comparisons.length > 0 &&
    comparisons.every((entry) =>
      normalizeFiniteNumber(entry?.baselineOpsPerSec) === null);
  const baselineMissingFailure = gateConfig.failIfBaselineMissing &&
    noUsableBaselines &&
    missingBaselineScenarios.length > 0;
  if (baselineMissingFailure) {
    return {
      ...baseResult,
      status: BENCHMARK_GATE_STATUS.FAILED,
      reason: BENCHMARK_GATE_FAIL_REASON.BASELINE_REQUIRED_MISSING,
      comparedScenarioCount: comparisons.length,
      missingBaselineScenarios,
      comparisons,
      failedScenarioCount: 1,
      mitigatedScenarioCount,
      parityMismatchCount,
      lowThroughputRatioCount,
      warnings,
    };
  }

  if (failedScenarioCount > 0) {
    const hasParityMismatchFailure = comparisons.some((entry) =>
      Array.isArray(entry?.failureReasons) &&
      entry.failureReasons.includes(BENCHMARK_GATE_FAIL_REASON.PARITY_MISMATCH),
    );
    const hasThroughputRatioFailure = comparisons.some((entry) =>
      Array.isArray(entry?.failureReasons) &&
      entry.failureReasons.includes(
        BENCHMARK_GATE_FAIL_REASON.THROUGHPUT_RATIO_BELOW_MINIMUM,
      ),
    );
    const hasThroughputRegressionFailure = comparisons.some((entry) =>
      Array.isArray(entry?.failureReasons) &&
      entry.failureReasons.includes(BENCHMARK_GATE_FAIL_REASON.THROUGHPUT_REGRESSION),
    );
    const failureReason = hasParityMismatchFailure ?
      BENCHMARK_GATE_FAIL_REASON.PARITY_MISMATCH :
      (hasThroughputRatioFailure ?
        BENCHMARK_GATE_FAIL_REASON.THROUGHPUT_RATIO_BELOW_MINIMUM :
        (hasThroughputRegressionFailure ?
          BENCHMARK_GATE_FAIL_REASON.THROUGHPUT_REGRESSION :
          BENCHMARK_GATE_FAIL_REASON.THROUGHPUT_REGRESSION));
    return {
      ...baseResult,
      status: BENCHMARK_GATE_STATUS.FAILED,
      reason: failureReason,
      comparedScenarioCount: comparisons.length,
      missingBaselineScenarios,
      comparisons,
      failedScenarioCount,
      mitigatedScenarioCount,
      parityMismatchCount,
      lowThroughputRatioCount,
      warnings,
    };
  }

  const status = comparisons.length > 0 ?
    BENCHMARK_GATE_STATUS.PASSED :
    BENCHMARK_GATE_STATUS.SKIPPED;
  const reason = comparisons.length > 0 ?
    null :
    BENCHMARK_GATE_SKIP_REASON.BASELINE_MISSING;

  return {
    ...baseResult,
    status,
    reason,
    comparedScenarioCount: comparisons.length,
    missingBaselineScenarios,
    comparisons,
    failedScenarioCount: 0,
    mitigatedScenarioCount,
    parityMismatchCount,
    lowThroughputRatioCount,
    warnings,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // --debug-logs is delivered to node containers via the LAGRANGE_* env
  // auto-forward in the cluster's node-env builder. Setting it here (rather than
  // threading a flag through cluster construction) also lets an operator opt in
  // by exporting the env var directly, with identical effect.
  if (args.debugLogs) {
    process.env[CLI.DEBUG_LOGS_ENV_VAR] = 'true';
  }
  // Non-perturbing capture at normal (info) volume — file-based logging without
  // the --debug-logs firehose. Forwarded to containers via the LAGRANGE_* env
  // auto-forward; an operator can also export it directly.
  if (args.captureLogs) {
    process.env[CLI.CAPTURE_LOGS_ENV_VAR] = 'true';
  }
  let runStatusContext = null;
  let gcpProvisioner = null;
  // Wall-clock phase breakdown: setup (config -> image installed on hosts),
  // scenario execution, and teardown. Stamped as the run crosses each boundary
  // and surfaced in the final summary so operators can see where time goes.
  const runPhaseTiming = {
    runStartMs: Date.now(),
    setupEndMs: null,
    scenarioEndMs: null,
    teardownEndMs: null,
  };
  const writeRunnerStatus = async (status, fields = {}) => {
    if (!runStatusContext) {
      return null;
    }
    return writeRunStatusArtifact(
      runStatusContext.outputDir,
      {
        ...runStatusContext.base,
        status,
        milestones: {...runStatusContext.milestones},
        ...fields,
      },
    );
  };
  try {
    if (args.verbose) {
      process.stdout.write(
        RUNNER_STAGE_CONFIG_LOADING + String(args.config) + '\n',
      );
    }
    const config = await parseConfig(args.config);
    const outputDir = config.outputDir || deriveRunOutputDir(args.output);
    let runConfig = {
      ...config,
      outputDir,
    };
    if (resolveFastLocalMode(args, runConfig)) {
      runConfig = await applyFastLocalConfig(runConfig);
      if (args.verbose) {
        process.stdout.write(FAST_LOCAL_LOG_PREFIX);
      }
    }
    const gcpResult = await provisionGcpDockerHosts(runConfig, args.verbose);
    runConfig = gcpResult.runConfig;
    gcpProvisioner = gcpResult.provisioner;
    const deterministicDebug = resolveDeterministicDebugConfig(args, runConfig);
    if (deterministicDebug.enabled) {
      runConfig = applyDeterministicDebugConfig(runConfig, deterministicDebug);
      installDeterministicRandom(deterministicDebug.seed);
    }
    runStatusContext = {
      outputDir: runConfig.outputDir,
      base: {
        reportPath: resolve(String(args.output || CLI.DEFAULT_OUTPUT)),
        outputDir: resolve(runConfig.outputDir),
      },
      milestones: {
        startedAt: new Date().toISOString(),
      },
    };
    const stateMachinePressurePreflight = runStateMachinePressurePreflight();
    if (stateMachinePressurePreflight.ready !== true) {
      const preflightSummary = formatStateMachinePressurePreflightSummary(
        stateMachinePressurePreflight,
      );
      runStatusContext.milestones.failedAt = new Date().toISOString();
      await writeRunnerStatus(RUN_STATUS_STATE_FATAL_ERROR, {
        error: preflightSummary,
      });
      process.stderr.write(preflightSummary + '\n');
      process.exit(EXIT_CODES.FAILURE);
    }
    if (args.verbose) {
      const hasRemoteHosts = Array.isArray(runConfig?.docker?.hosts) &&
        runConfig.docker.hosts.length > 0;
      const dockerSummary = hasRemoteHosts ?
        `${RUNNER_STAGE_REMOTE_HOSTS}:${runConfig.docker.hosts.length}` :
        `${RUNNER_STAGE_LOCAL_SOCKET}:${runConfig?.docker?.socketPath || 'default'}`;
      process.stdout.write(
        RUNNER_STAGE_CONFIG_LOADED +
        RUNNER_STAGE_CLUSTER_SIZE_PREFIX + String(runConfig.size) + ', ' +
        RUNNER_STAGE_DOCKER_MODE_PREFIX + dockerSummary + '\n',
      );
      process.stdout.write(
        RUNNER_STAGE_ARTIFACTS_DIR_PREFIX + runConfig.outputDir + '\n',
      );
      if (deterministicDebug.enabled) {
        process.stdout.write(
          RUNNER_STAGE_DETERMINISTIC_DEBUG_PREFIX +
          'seed=' + deterministicDebug.seed +
          ', convergence_sample_interval_ms=' +
          deterministicDebug.convergenceSampleIntervalMs +
          ', preflight_sample_interval_ms=' +
          deterministicDebug.preflightSampleIntervalMs +
          '\n',
        );
      }
      process.stdout.write(RUNNER_STAGE_SCENARIO_DISCOVERY);
    }

    // Build Docker image before running scenarios
    const dockerOperationSink = createDockerOperationSink(args.verbose);
    let imageResult = null;
    try {
      imageResult = await buildImage(
        runConfig,
        args.verbose,
        dockerOperationSink,
        {extractBuildProgressLine},
      );
    } catch (err) {
      runStatusContext.milestones.failedAt = new Date().toISOString();
      await writeRunnerStatus(RUN_STATUS_STATE_FATAL_ERROR, {
        error: err.message,
        stackTrace: err.stack || null,
      });
      process.stderr.write(
        'Failed to build image: ' + err.message + '\n',
      );
      process.exit(EXIT_CODES.FAILURE);
    }

    // Distribute the freshly-built image to any provisioned GCP hosts so the
    // per-host daemons can start containers without pulling from a registry.
    try {
      installGcpImage(gcpProvisioner, runConfig.image, args.verbose);
    } catch (err) {
      runStatusContext.milestones.failedAt = new Date().toISOString();
      await writeRunnerStatus(RUN_STATUS_STATE_FATAL_ERROR, {
        error: err.message,
        stackTrace: err.stack || null,
      });
      process.stderr.write(
        'Failed to install image on GCP hosts: ' + err.message + '\n',
      );
      process.exit(EXIT_CODES.FAILURE);
    }

    const allScenarios = await discoverScenarios();
    const scenarios = args.scenario ?
      filterScenarios(allScenarios, args.scenario) :
      selectCanonicalScenariosForConfig(allScenarios, args.config);

    if (args.verbose) {
      process.stdout.write(
        RUNNER_STAGE_SCENARIO_FILTER_PREFIX +
        String(args.scenario || RUNNER_STAGE_SCENARIO_FILTER_ALL) + '\n',
      );
    }

    if (scenarios.length === 0) {
      runStatusContext.milestones.failedAt = new Date().toISOString();
      await writeRunnerStatus(RUN_STATUS_STATE_FATAL_ERROR, {
        error: 'No scenarios found.',
      });
      process.stderr.write('No scenarios found.\n');
      process.exit(EXIT_CODES.FAILURE);
    }

    runStatusContext.base = {
      ...runStatusContext.base,
      scenarioFilter: String(args.scenario || RUNNER_STAGE_SCENARIO_FILTER_ALL),
      raftProvider: resolveRunRaftProvider(runConfig),
      scenarioCount: scenarios.length,
      scenarioNames: scenarios.map((scenario) => scenario.name),
      // Provenance of the code under test: git hash/dirtiness (image mode) plus
      // the live src fingerprint (fast-local). Stamped together so "which code
      // did this run actually execute?" is answerable from run-status alone.
      gitHash: imageResult?.gitHash || null,
      gitDirty: typeof imageResult?.gitDirty === 'boolean' ?
        imageResult.gitDirty :
        null,
      srcFingerprint: runConfig?.docker?.srcFingerprint || null,
      srcFingerprintAlgo: runConfig?.docker?.srcFingerprintAlgo || null,
    };
    await writeRunnerStatus(RUN_STATUS_STATE_RUNNING);

    if (args.verbose) {
      process.stdout.write(
        RUNNER_STAGE_SCENARIO_COUNT_PREFIX +
        scenarios.length +
        RUNNER_STAGE_SCENARIO_COUNT_SUFFIX,
      );
    }

    const historicalReports = await loadHistoricalReports(args.output);
    const reportMetadata = buildReportMetadata(
      args,
      runConfig,
      deterministicDebug,
    );

    runPhaseTiming.setupEndMs = Date.now();
    const {report, hasFailures} = await runScenarios(
      runConfig,
      scenarios,
      {
        output: args.output,
        verbose: args.verbose,
        historyReports: historicalReports,
        dockerOperationSink,
        reportMetadata,
        stateMachinePressurePreflight,
      },
    );
    runPhaseTiming.scenarioEndMs = Date.now();

    const reportPreview = {
      summary: computeSummary(report.scenarios),
      standardSummary: computeStandardSummary(
        report.scenarios,
        historicalReports,
      ),
    };
    const benchmarkRegressionGate = evaluateBenchmarkRegressionGate(
      reportPreview,
      historicalReports,
      runConfig,
    );
    runStatusContext.milestones.scenarioPlaybackCompleteAt =
      new Date().toISOString();
    await writeRunnerStatus(RUN_STATUS_STATE_SCENARIO_PLAYBACK_COMPLETE, {
      summary: reportPreview.summary,
      standardSummary: reportPreview.standardSummary,
      benchmarkRegressionGate,
      hasScenarioFailures: hasFailures,
    });
    const failureBundle = await writeFailureBundlesForReport({
      scenarios: report.scenarios,
      reportOutputPath: args.output,
      outputDir: runConfig.outputDir,
      reportSummary: reportPreview.summary,
      standardSummary: reportPreview.standardSummary,
      benchmarkRegressionGate,
    });
    runStatusContext.milestones.failureBundlesWrittenAt =
      new Date().toISOString();
    await writeRunnerStatus(RUN_STATUS_STATE_FAILURE_BUNDLES_WRITTEN, {
      summary: reportPreview.summary,
      standardSummary: reportPreview.standardSummary,
      benchmarkRegressionGate,
      failureBundle: failureBundle.runBundle,
      hasScenarioFailures: hasFailures,
    });
    await report.write({
      // Distributed docker run == LIVE fidelity; audit.js special-cases 'live'.
      fidelity: 'live',
      benchmarkRegressionGate,
      ...(failureBundle.runBundle ?
        {failureBundle: failureBundle.runBundle} :
        {}),
    });

    if (args.verbose) {
      process.stdout.write(
        'Report written to ' + args.output + '\n',
      );
    }

    // Tear down before printing the summary so the phase breakdown and the
    // cost estimate both reflect the FULL VM uptime (provision -> destroyed).
    await teardownGcpProvisioner(gcpProvisioner, args.verbose);
    runPhaseTiming.teardownEndMs = Date.now();

    const costEstimate = gcpProvisioner ?
      gcpProvisioner.estimateCost() :
      null;
    process.stdout.write(
      formatRunSummary(
        reportPreview,
        report.scenarios,
        costEstimate,
        runPhaseTiming,
      ),
    );

    if (args.contract) {
      process.stdout.write(`\n[contract] evaluated contract: ${args.contract}\n`);
      process.stdout.write('[contract] emitted outcome: pending-before-rerun\n');
    }

    const gateFailed =
      benchmarkRegressionGate.status === BENCHMARK_GATE_STATUS.FAILED;
    const hasRunFailures = hasFailures || gateFailed;
    runStatusContext.milestones.reportWrittenAt = new Date().toISOString();
    await writeRunnerStatus(RUN_STATUS_STATE_REPORT_WRITTEN, {
      summary: reportPreview.summary,
      standardSummary: reportPreview.standardSummary,
      benchmarkRegressionGate,
      failureBundle: failureBundle.runBundle,
      hasScenarioFailures: hasFailures,
      exitCode: hasRunFailures ? EXIT_CODES.FAILURE : EXIT_CODES.SUCCESS,
    });
    if (args.verbose && gateFailed) {
      process.stderr.write(
        'Benchmark regression gate failed: ' +
        String(
          benchmarkRegressionGate.reason ||
          BENCHMARK_GATE_FAIL_REASON.THROUGHPUT_REGRESSION,
        ) +
        '\n',
      );
    }

    process.exit(
      hasRunFailures ? EXIT_CODES.FAILURE : EXIT_CODES.SUCCESS,
    );
  } catch (err) {
    // Tear down provisioned GCP infra even on failure so a crashed run never
    // leaks billable VMs; teardown failure must not mask the original error.
    await teardownGcpProvisioner(gcpProvisioner, args.verbose);
    if (runStatusContext) {
      runStatusContext.milestones.failedAt = new Date().toISOString();
      try {
        await writeRunnerStatus(RUN_STATUS_STATE_FATAL_ERROR, {
          error: err.message,
          stackTrace: err.stack || null,
        });
      } catch (_statusErr) {
        // Best-effort runner status update
      }
    }
    throw err;
  }
}

// Run main only when executed directly (not when imported by tests)
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = resolve(process.argv[1] || '') === __filename;
const isTapRun = process.env.TAP === '1';

if (isDirectRun && !isTapRun) {
  main().catch((err) => {
    process.stderr.write('Fatal error: ' + err.message + '\n');
    process.exit(EXIT_CODES.FAILURE);
  });
}

export {
  parseArgs,
  runScenarios,
  normalizeScenarioPayload,
  evaluateTraceAssertions,
  evaluateMemoryLeakAssertions,
  evaluateScenarioCleanlinessAssertions,
  evaluateBenchmarkRegressionGate,
  resolveBenchmarkGateConfig,
  resolveScenarioMemoryLeakConfig,
  resolveRunRaftProvider,
  buildImage,
  loadScenarioModule,
  shouldPrintLiveLogEntry,
  writeFailureBundlesForReport,
  resolveFastLocalMode,
  resolveDeterministicDebugConfig,
  applyDeterministicDebugConfig,
  buildReportMetadata,
  formatScenarioPhaseEventLine,
  resolveGitDirty,
  deriveRunOutputDir,
  deriveRunStatusPath,
  buildRunStatusArtifact,
  writeRunStatusArtifact,
  loadHistoricalReports,
  formatRunSummary,
};
