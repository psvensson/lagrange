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
import {execFile} from 'node:child_process';
import {readdir, readFile} from 'node:fs/promises';
import {parseConfig} from './harness/config-parser.js';
import {
  discoverScenarios,
  filterScenarios,
} from './harness/scenario-discovery.js';
import {createCluster} from './harness/cluster.js';
import {DockerProvider} from './harness/docker-provider.js';
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
const HISTORICAL_REPORT_SCAN_LIMIT = 20;
const UTF8_ENCODING = 'utf8';
const TRACE_ASSERTION_ERROR_PREFIX = 'Trace assertion failed: ';
const TRACE_ASSERTION_MISSING_ARTIFACT = 'trace artifact missing';
const TRACE_ASSERTION_NO_EVENTS = 'no trace events captured';
const TRACE_ASSERTION_LINEAGE_PREFIX_MISSING =
  'required lineage prefix not found: ';
const MEMORY_ASSERTION_ERROR_PREFIX = 'Memory leak assertion failed: ';
const MEMORY_ASSERTION_SAMPLES_MISSING = 'memory samples unavailable';
const MEMORY_ASSERTION_LEAK_DETECTED_PREFIX =
  'memory leak detected on nodes: ';
const MEMORY_ASSERTION_ANALYSIS_INSUFFICIENT =
  'memory analysis window insufficient for leak verdict';
const MEMORY_ANALYSIS_WARNING_SAMPLES_PATH_MISSING = 'samples-path-missing';
const MEMORY_ANALYSIS_WARNING_SAMPLES_READ_FAILED = 'samples-read-failed';
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

function formatScenarioPhaseEventValue(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatScenarioPhaseEventDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return '';
  }
  return Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatScenarioPhaseEventValue(value)}`)
    .join(' ');
}

function formatScenarioPhaseEventLine(scenarioName, event) {
  if (!event || typeof event !== 'object') {
    return '';
  }
  const scenario = String(scenarioName || 'scenario');
  const phase = String(event.phase || 'unknown');
  const type = String(event.type || '');
  const message = typeof event.message === 'string' ? event.message : '';
  const detailSuffix = formatScenarioPhaseEventDetails(event.details);

  switch (type) {
  case SCENARIO_PHASE_EVENT_TYPE_START:
    return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} start`;
  case SCENARIO_PHASE_EVENT_TYPE_END:
    return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} end: ` +
      `status=${String(event.status || 'unknown')} ` +
      `durationMs=${Number(event.durationMs || 0)}`;
  case SCENARIO_PHASE_EVENT_TYPE_PROGRESS:
    return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} progress: ` +
      `${message}` +
      (detailSuffix ? ` ${detailSuffix}` : '');
  case SCENARIO_PHASE_EVENT_TYPE_LAST_MEANINGFUL_CHANGE:
    return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} change: ` +
      `${message}` +
      (detailSuffix ? ` ${detailSuffix}` : '');
  case SCENARIO_PHASE_EVENT_TYPE_NO_PROGRESS_WARNING:
    return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} warning: ` +
      `${message}` +
      (detailSuffix ? ` ${detailSuffix}` : '');
  case SCENARIO_PHASE_EVENT_TYPE_FAILED_NO_PROGRESS:
    return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} stalled: ` +
      `${message}` +
      (detailSuffix ? ` ${detailSuffix}` : '');
  default:
    return '';
  }
}

function composeScenarioPhaseEventSinks(existingSink, nextSink) {
  if (typeof existingSink !== 'function') {
    return typeof nextSink === 'function' ? nextSink : null;
  }
  if (typeof nextSink !== 'function') {
    return existingSink;
  }
  return (event) => {
    try {
      existingSink(event);
    } catch (_error) {
      // Progress sinks must not affect scenario execution.
    }
    nextSink(event);
  };
}

function createScenarioPhaseEventSink(verbose, scenarioName) {
  if (!verbose) {
    return null;
  }
  return (event) => {
    const line = formatScenarioPhaseEventLine(scenarioName, event);
    if (!line) {
      return;
    }
    process.stdout.write(line + '\n');
  };
}

function installScenarioPhaseEventSink(cluster, scenarioName, sink) {
  if (!cluster || typeof sink !== 'function') {
    return;
  }
  const scenarioOverrides =
    cluster._scenarioOverrides && typeof cluster._scenarioOverrides === 'object' ?
      cluster._scenarioOverrides :
      {};
  const benchmarkOverrides =
    scenarioOverrides.postgresBaselineComparison &&
      typeof scenarioOverrides.postgresBaselineComparison === 'object' ?
      scenarioOverrides.postgresBaselineComparison :
      {};

  cluster._scenarioOverrides = {
    ...scenarioOverrides,
    postgresBaselineComparison: {
      ...benchmarkOverrides,
      phaseEventSink: composeScenarioPhaseEventSinks(
        benchmarkOverrides.phaseEventSink,
        sink,
      ),
    },
  };
}

function resolveClusterSize(config) {
  return Number.isInteger(config?.size) && config.size > 0 ?
    config.size :
    null;
}

/**
 * Parse CLI arguments from argv.
 * @param {Array<string>} argv - process.argv.slice(2)
 * @returns {{config: string, scenario: string|null,
 *   output: string, verbose: boolean, fastLocal: boolean|null,
 *   deterministicDebug: boolean|null}}
 */
function parseArgs(argv) {
  let config = CLI.DEFAULT_CONFIG;
  let scenario = null;
  let output = CLI.DEFAULT_OUTPUT;
  let verbose = false;
  let fastLocal = null;
  let deterministicDebug = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === CLI.ARG_CONFIG && i + 1 < argv.length) {
      config = argv[++i];
    } else if (arg === CLI.ARG_SCENARIO && i + 1 < argv.length) {
      scenario = argv[++i];
    } else if (arg === CLI.ARG_OUTPUT && i + 1 < argv.length) {
      output = argv[++i];
    } else if (arg === CLI.ARG_VERBOSE) {
      verbose = true;
    } else if (arg === CLI.ARG_FAST_LOCAL) {
      fastLocal = true;
    } else if (arg === CLI.ARG_NO_FAST_LOCAL) {
      fastLocal = false;
    } else if (arg === CLI.ARG_DETERMINISTIC_DEBUG) {
      deterministicDebug = true;
    } else if (arg === CLI.ARG_NO_DETERMINISTIC_DEBUG) {
      deterministicDebug = false;
    }
  }

  return {
    config,
    scenario,
    output,
    verbose,
    fastLocal,
    deterministicDebug,
  };
}

function buildFastLocalSourceBind(cwd = process.cwd()) {
  const hostSourcePath = resolve(cwd, FAST_LOCAL_SOURCE_RELATIVE_PATH);
  return hostSourcePath +
    ':' +
    FAST_LOCAL_SOURCE_CONTAINER_PATH +
    FAST_LOCAL_BIND_READ_ONLY_SUFFIX;
}

function applyFastLocalConfig(config, cwd = process.cwd()) {
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

  return {
    ...config,
    docker: {
      ...dockerConfig,
      skipBuildOnDirty: true,
      reuseContainers: true,
      keepRunningContainers: true,
      binds: mergedBinds,
    },
  };
}

function isLocalDockerConfig(config) {
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
async function buildImage(
  config,
  verbose,
  dockerOperationSink = null,
  options = {},
) {
  const provider = new DockerProvider({
    socketPath: config.docker.socketPath,
    operationSink: dockerOperationSink,
  });

  const gitHash = options.gitHash || await resolveGitHash();
  const gitDirty = typeof options.gitDirty === 'boolean' ?
    options.gitDirty :
    await resolveGitDirty();
  const skipBuildOnDirty = config?.docker?.skipBuildOnDirty === true;
  const existingHash = await provider.getImageLabel(
    config.image,
    IMAGE_LABEL_GIT_HASH,
  );

  if (gitDirty && skipBuildOnDirty) {
    const imageExists = await provider.imageExists(config.image);
    if (imageExists) {
      if (verbose) {
        process.stdout.write(
          IMAGE_SKIP_DIRTY_REBUILD_PREFIX +
          config.image +
          '\n',
        );
      }
      return {
        image: config.image,
        gitHash,
        gitDirty,
        reused: true,
      };
    }
    if (verbose) {
      process.stdout.write(
        IMAGE_SKIP_DIRTY_REBUILD_PREFIX +
        config.image +
        IMAGE_SKIP_DIRTY_REBUILD_MISSING_SUFFIX +
        '\n',
      );
    }
  }

  if (!gitDirty &&
      existingHash === gitHash &&
      gitHash !== GIT_HASH_FALLBACK) {
    if (verbose) {
      process.stdout.write(
        IMAGE_REUSE_LOG_PREFIX +
        gitHash +
        ': ' +
        config.image +
        '\n',
      );
    }
    return {
      image: config.image,
      gitHash,
      gitDirty,
      reused: true,
    };
  }

  if (verbose) {
    if (gitDirty) {
      process.stdout.write(
        IMAGE_REBUILD_DIRTY_PREFIX +
        config.image +
        '\n',
      );
    }
    const commitSuffix = gitHash && gitHash !== GIT_HASH_FALLBACK ?
      IMAGE_BUILD_WITH_COMMIT_PREFIX + gitHash :
      DOCKER_LINE_EMPTY;
    process.stdout.write(
      IMAGE_BUILD_LOG_PREFIX +
      commitSuffix +
      IMAGE_BUILD_LOG_SUFFIX +
      '\n',
    );
  }
  const progressSink = verbose ?
    (event) => {
      const line = extractBuildProgressLine(event);
      if (!line) {
        return;
      }
      process.stdout.write(BUILD_PROGRESS_LOG_PREFIX + line + '\n');
    } :
    null;
  await provider.buildImage(
    '.',
    config.image,
    config.dockerfile || 'Dockerfile',
    progressSink,
    {[IMAGE_LABEL_GIT_HASH]: gitHash},
  );
  if (verbose) {
    process.stdout.write('Image built: ' + config.image + '\n');
  }

  return {
    image: config.image,
    gitHash,
    gitDirty,
    reused: false,
  };
}

/**
 * Resolve current git short hash.
 * @param {string} cwd
 * @return {Promise<string>}
 */
async function resolveGitHash(cwd = process.cwd()) {
  return new Promise((resolveHash) => {
    execFile(
      GIT_HASH_COMMAND,
      GIT_HASH_ARGS,
      {cwd},
      (error, stdout) => {
        if (error) {
          resolveHash(GIT_HASH_FALLBACK);
          return;
        }
        const hash = String(stdout || DOCKER_LINE_EMPTY).trim();
        resolveHash(hash || GIT_HASH_FALLBACK);
      },
    );
  });
}

/**
 * Resolve whether the current git workspace has uncommitted changes.
 * @param {string} cwd
 * @return {Promise<boolean>}
 */
async function resolveGitDirty(cwd = process.cwd()) {
  return new Promise((resolveDirty) => {
    execFile(
      GIT_STATUS_COMMAND,
      GIT_STATUS_ARGS,
      {cwd},
      (error, stdout) => {
        if (error) {
          resolveDirty(false);
          return;
        }
        resolveDirty(String(stdout || DOCKER_LINE_EMPTY).trim().length > 0);
      },
    );
  });
}

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

function resolveBenchmarkGateConfig(config) {
  const configuredGate = config?.benchmarkGate &&
    typeof config.benchmarkGate === 'object' ?
    config.benchmarkGate :
    {};
  const configuredMaxRegression = normalizeFiniteNumber(
    configuredGate.maxThroughputRegressionRatio,
  );
  const configuredBaselineProvider = String(
    configuredGate.baselineProvider || '',
  ).trim().toLowerCase();
  const configuredMitigationId = String(
    configuredGate.approvedMitigationId || '',
  ).trim();
  const configuredMinimumThroughputRatio = normalizeFiniteNumber(
    configuredGate.minimumThroughputRatioSutToBaseline,
  );
  const configuredParityPolicy = String(
    configuredGate.parityMismatchPolicy || '',
  ).trim().toLowerCase();
  const defaultMinimumThroughputRatio = normalizeFiniteNumber(
    BENCHMARK_GATE_DEFAULTS.minimumThroughputRatioSutToBaseline,
  );
  const defaultParityPolicy = String(
    BENCHMARK_GATE_DEFAULTS.parityMismatchPolicy ||
      BENCHMARK_GATE_PARITY_POLICY.WARN,
  ).trim().toLowerCase();
  const parityMismatchPolicy = configuredParityPolicy ===
    BENCHMARK_GATE_PARITY_POLICY.FAIL ||
    configuredParityPolicy === BENCHMARK_GATE_PARITY_POLICY.WARN ||
    configuredParityPolicy === BENCHMARK_GATE_PARITY_POLICY.IGNORE ?
    configuredParityPolicy :
    (defaultParityPolicy === BENCHMARK_GATE_PARITY_POLICY.FAIL ||
      defaultParityPolicy === BENCHMARK_GATE_PARITY_POLICY.WARN ||
      defaultParityPolicy === BENCHMARK_GATE_PARITY_POLICY.IGNORE ?
      defaultParityPolicy :
      BENCHMARK_GATE_PARITY_POLICY.WARN);

  return {
    enabled: configuredGate.enabled === true,
    maxThroughputRegressionRatio:
      configuredMaxRegression !== null &&
      configuredMaxRegression >= 0 ?
        configuredMaxRegression :
        BENCHMARK_GATE_DEFAULTS.maxThroughputRegressionRatio,
    minimumThroughputRatioSutToBaseline:
      configuredMinimumThroughputRatio !== null &&
      configuredMinimumThroughputRatio >= 0 ?
        configuredMinimumThroughputRatio :
        (defaultMinimumThroughputRatio !== null &&
          defaultMinimumThroughputRatio >= 0 ?
          defaultMinimumThroughputRatio :
          null),
    baselineProvider: configuredBaselineProvider ||
      BENCHMARK_GATE_DEFAULTS.baselineProvider,
    failIfBaselineMissing: configuredGate.failIfBaselineMissing === true ||
      BENCHMARK_GATE_DEFAULTS.failIfBaselineMissing === true,
    approvedMitigationId: configuredMitigationId || null,
    parityMismatchPolicy,
  };
}

function buildHistoricalBaselineIndex(historyReports, baselineProvider) {
  const bySimilarityKey = new Map();

  for (const historicalReport of historyReports) {
    const reportProvider = String(
      historicalReport?.metadata?.raftProvider || '',
    ).trim().toLowerCase();
    if (reportProvider !== baselineProvider) {
      continue;
    }

    const scenarioSummaries = Array.isArray(
      historicalReport?.standardSummary?.scenarios,
    ) ?
      historicalReport.standardSummary.scenarios :
      [];

    for (const scenarioSummary of scenarioSummaries) {
      const similarityKey = String(
        scenarioSummary?.similarityKey || '',
      ).trim();
      if (!similarityKey || bySimilarityKey.has(similarityKey)) {
        continue;
      }

      const baselineOpsPerSec = normalizeFiniteNumber(
        scenarioSummary?.current?.opsPerSec,
      );
      if (baselineOpsPerSec === null || baselineOpsPerSec <= 0) {
        continue;
      }

      bySimilarityKey.set(similarityKey, {
        provider: reportProvider,
        reportPath: historicalReport?.path || null,
        reportTimestamp: historicalReport?.timestamp || null,
        scenario: scenarioSummary?.scenario || null,
        opsPerSec: baselineOpsPerSec,
      });
    }
  }

  return bySimilarityKey;
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

function dockerActionLine(action, details) {
  return `${action} ${details}`.trim();
}

function formatDockerOperationEvent(event) {
  const operation = String(event?.operation || DOCKER_OP_UNKNOWN);
  const stage = String(event?.stage || DOCKER_LINE_EMPTY);
  const statusSuffix = stage ? `[${stage}]` : DOCKER_LINE_EMPTY;
  switch (operation) {
  case DOCKER_OP_IMAGE_BUILD:
    return dockerActionLine(
      `image.build${statusSuffix}`,
      `tag=${String(event?.tag || '-')}` +
      ` dockerfile=${String(event?.dockerfile || '-')}` +
      ` context=${String(event?.contextPath || '.')}`,
    );
  case DOCKER_OP_NETWORK_CREATE:
    return dockerActionLine(
      `network.create${statusSuffix}`,
      `name=${String(event?.name || '-')}` +
      ` id=${String(event?.networkId || '-')}`,
    );
  case DOCKER_OP_NETWORK_REMOVE:
    return dockerActionLine(
      `network.remove${statusSuffix}`,
      `id=${String(event?.networkId || '-')}`,
    );
  case DOCKER_OP_CONTAINER_CREATE:
    return dockerActionLine(
      `container.create${statusSuffix}`,
      `name=${String(event?.name || '-')}` +
      ` image=${String(event?.image || '-')}` +
      ` network=${String(event?.network || '-')}` +
      ` id=${String(event?.containerId || '-')}`,
    );
  case DOCKER_OP_CONTAINER_START:
    return dockerActionLine(
      `container.start${statusSuffix}`,
      `name=${String(event?.name || '-')}` +
      ` id=${String(event?.containerId || '-')}`,
    );
  case DOCKER_OP_CONTAINER_STOP:
    return dockerActionLine(
      `container.stop${statusSuffix}`,
      `id=${String(event?.containerId || '-')}`,
    );
  case DOCKER_OP_CONTAINER_REMOVE:
    return dockerActionLine(
      `container.remove${statusSuffix}`,
      `id=${String(event?.containerId || '-')}`,
    );
  case DOCKER_OP_NETWORK_CONNECT:
    return dockerActionLine(
      `network.connect${statusSuffix}`,
      `network=${String(event?.networkId || '-')}` +
      ` container=${String(event?.containerId || '-')}`,
    );
  case DOCKER_OP_NETWORK_DISCONNECT:
    return dockerActionLine(
      `network.disconnect${statusSuffix}`,
      `network=${String(event?.networkId || '-')}` +
      ` container=${String(event?.containerId || '-')}`,
    );
  default: {
    const error = String(event?.error || DOCKER_LINE_EMPTY).trim();
    const errorSuffix = error ? ` error=${error}` : DOCKER_LINE_EMPTY;
    return `${operation}${statusSuffix}${errorSuffix}`.trim();
  }
  }
}

function createDockerOperationSink(verbose) {
  if (!verbose) {
    return null;
  }
  return (event) => {
    const line = formatDockerOperationEvent(event);
    if (!line) {
      return;
    }
    process.stdout.write(DOCKER_COMMAND_LOG_PREFIX + line + '\n');
  };
}

function extractBuildProgressLine(event) {
  if (!event || typeof event !== 'object') {
    return '';
  }
  if (event[BUILD_PROGRESS_STREAM_KEY]) {
    return String(event[BUILD_PROGRESS_STREAM_KEY]).trim();
  }
  if (event[BUILD_PROGRESS_ERROR_KEY]) {
    return String(event[BUILD_PROGRESS_ERROR_KEY]).trim();
  }
  const status = String(event[BUILD_PROGRESS_STATUS_KEY] || '').trim();
  const id = String(event[BUILD_PROGRESS_ID_KEY] || '').trim();
  const progress = String(event[BUILD_PROGRESS_PROGRESS_KEY] || '').trim();
  const parts = [id, status, progress].filter((part) => Boolean(part));
  return parts.join(' ').trim();
}

/**
 * Run discovered scenarios sequentially.
 * Each scenario runs in isolation: createCluster → run → teardown.
 * Unhandled errors are caught, marked failed, and execution continues.
 *
 * @param {Object} config - Parsed cluster configuration
 * @param {Array<{name: string, path: string}>} scenarios
 * @param {{
 *   output: string,
 *   verbose: boolean,
 *   historyReports?: Array<Object>,
 *   dockerOperationSink?: Function|null,
 *   reportMetadata?: Object|null,
 * }} options
 * @returns {Promise<{report: ReportWriter, hasFailures: boolean}>}
 */
async function runScenarios(config, scenarios, options) {
  const report = new ReportWriter(options.output, {
    historyReports: options?.historyReports,
    metadata:
      options?.reportMetadata && typeof options.reportMetadata === 'object' ?
        options.reportMetadata :
        null,
  });
  let hasFailures = false;
  const dockerOperationSink = typeof options?.dockerOperationSink === 'function' ?
    options.dockerOperationSink :
    null;

  for (const scenario of scenarios) {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    let scenarioResult = null;

    if (options.verbose) {
      process.stdout.write(
        'Running scenario: ' + scenario.name + '\n',
      );
    }

    let cluster = null;
    try {
      const clusterConfig = dockerOperationSink ?
        {...config, dockerOperationSink} :
        config;
      cluster = createCluster(clusterConfig);
      if (typeof cluster.setScenarioName === 'function') {
        cluster.setScenarioName(scenario.name);
      }
      await cluster.start();
      installScenarioPhaseEventSink(
        cluster,
        scenario.name,
        createScenarioPhaseEventSink(options.verbose, scenario.name),
      );

      if (options.verbose) {
        const collector = cluster.getLogCollector();
        collector.setEntrySink((entry) => {
          if (!shouldPrintLiveLogEntry(entry)) {
            return;
          }
          process.stderr.write(
            LIVE_LOG_PREFIX + formatLiveLogEntry(entry) + '\n',
          );
        });
      }

      const scenarioModule = await loadScenarioModule(scenario.path);
      const scenarioPayload = normalizeScenarioPayload(
        await scenarioModule.run(cluster),
      );

      // Run log analysis before teardown
      const analyzer = cluster.getLogAnalyzer();
      const collector = cluster.getLogCollector();
      let analysisSummary = null;
      let performanceDiagnostics = null;
      try {
        const seedNode = cluster.getNodes()[0];
        const logEntries = collector.getBuffer();
        performanceDiagnostics = buildPerformanceDiagnostics(logEntries);
        const queryResults =
          await analyzer.runAnalyticalQueries(seedNode);
        const analysis = analyzer.analyze(
          logEntries,
          queryResults,
          config.partitionCount || 0,
        );
        analysisSummary = analysis.summary || null;
        await analyzer.writeAnalysis(
          scenario.name, analysis,
        );
        const nodeIds = cluster.getNodes().map((n) => n.id);
        await collector.writeOutput(
          scenario.name, logEntries, nodeIds,
        );
      } catch (_analysisErr) {
        // Analysis is best-effort
      }

      const duration = Date.now() - startMs;
      scenarioResult = {
        ...(scenarioPayload || {}),
        passed: true,
        duration,
        startedAt,
        analysisSummary,
        clusterSize: resolveClusterSize(config),
        performanceDiagnostics,
      };
      if (scenarioPayload) {
        scenarioResult.details = scenarioPayload;
      }

      if (options.verbose) {
        process.stdout.write(
          'Scenario passed: ' + scenario.name +
          ' (' + duration + 'ms)\n',
        );
      }
    } catch (err) {
      const duration = Date.now() - startMs;
      hasFailures = true;
      const errorDiagnostics = err &&
        typeof err === 'object' &&
        err.diagnostics &&
        typeof err.diagnostics === 'object' ?
        err.diagnostics :
        null;
      let performanceDiagnostics = null;

      // Attempt fallback log collection on failure
      const analysisSummary = null;
      if (cluster) {
        try {
          const collector = cluster.getLogCollector();
          const provider =
            cluster._providers[cluster._hostAssignment[0]];
          const nodes = cluster.getNodes();
          await collector.collectContainerFallback(
            provider, nodes,
          );
          const nodeIds = nodes.map((n) => n.id);
          await collector.writeOutput(
            scenario.name,
            collector.getBuffer(),
            nodeIds,
          );
          performanceDiagnostics = buildPerformanceDiagnostics(
            collector.getBuffer(),
          );
        } catch (_fallbackErr) {
          // Best-effort fallback
        }
      }

      scenarioResult = {
        passed: false,
        duration,
        startedAt,
        error: err.message,
        stackTrace: err.stack || null,
        analysisSummary,
        details: errorDiagnostics ? {diagnostics: errorDiagnostics} : null,
        clusterSize: resolveClusterSize(config),
        performanceDiagnostics,
      };

      if (options.verbose) {
        process.stderr.write(
          'Scenario failed: ' + scenario.name +
          ' — ' + err.message + '\n',
        );
      }
    } finally {
      let playback = null;
      let playbackWarning = null;
      let trace = null;
      if (cluster) {
        try {
          await cluster.stop();
        } catch (_stopErr) {
          playbackWarning = 'Cluster teardown failed';
        }
        try {
          if (typeof cluster.getPlaybackManifest === 'function') {
            playback = cluster.getPlaybackManifest();
          }
        } catch (_manifestErr) {
          playbackWarning = 'Unable to read playback manifest';
        }
        try {
          if (typeof cluster.getTraceManifest === 'function') {
            trace = cluster.getTraceManifest();
          }
        } catch (_traceErr) {
          trace = {warning: 'Unable to read trace manifest'};
        }
      }

      if (!scenarioResult) {
        scenarioResult = {
          passed: false,
          duration: Date.now() - startMs,
          startedAt,
          error: 'Scenario result missing',
          stackTrace: null,
          analysisSummary: null,
          clusterSize: resolveClusterSize(config),
          performanceDiagnostics: null,
        };
      }

      if (playbackWarning) {
        scenarioResult.playback = {
          warning: playbackWarning,
        };
      } else {
        scenarioResult.playback = playback;
      }
      scenarioResult.trace = trace;

      if (scenarioResult?.details?.diagnostics?.rootCauseBundle &&
          playback && typeof playback === 'object') {
        const files = playback.files && typeof playback.files === 'object' ?
          playback.files :
          {};
        const manifestPath = typeof files.manifest === 'string' &&
          files.manifest.length > 0 ?
          files.manifest :
          null;
        const viewerPath = typeof files.viewer === 'string' &&
          files.viewer.length > 0 ?
          files.viewer :
          null;
        const manifestDir = manifestPath ? dirname(manifestPath) : null;
        const bundle = scenarioResult.details.diagnostics.rootCauseBundle;
        const existingPlayback = bundle.playback && typeof bundle.playback === 'object' ?
          bundle.playback :
          {};
        bundle.playback = {
          ...existingPlayback,
          ...(manifestDir ? {manifestDir} : {}),
          ...(manifestPath ? {manifestPath} : {}),
          ...(viewerPath ? {viewerPath} : {}),
        };
      }

      scenarioResult.memoryLeak = await analyzeMemoryLeakFromPlayback(
        scenarioResult.playback,
        config.memoryLeak || {},
      );

      const traceAssertion = evaluateTraceAssertions(
        trace,
        config.debugTrace,
      );
      if (traceAssertion) {
        scenarioResult.traceAssertion = traceAssertion;
        if (scenarioResult.passed && !traceAssertion.passed) {
          scenarioResult.passed = false;
          scenarioResult.error = `${TRACE_ASSERTION_ERROR_PREFIX}${traceAssertion.error}`;
          hasFailures = true;
        }
      }

      const memoryLeakAssertion = evaluateMemoryLeakAssertions(
        scenarioResult.memoryLeak,
        config.memoryLeak || {},
      );
      if (memoryLeakAssertion) {
        scenarioResult.memoryLeakAssertion = memoryLeakAssertion;
        if (scenarioResult.passed && !memoryLeakAssertion.passed) {
          scenarioResult.passed = false;
          scenarioResult.error = MEMORY_ASSERTION_ERROR_PREFIX +
            memoryLeakAssertion.error;
          hasFailures = true;
        }
      }
      report.addResult(scenario.name, scenarioResult);
    }
  }

  return {report, hasFailures};
}

function shouldPrintLiveLogEntry(entry) {
  const nodeId = String(entry?.node_id || '').toLowerCase();
  if (nodeId === LIVE_LOG_NODE_EXCLUDED) {
    return false;
  }

  const topLevel = normalizeSeverity(entry?.level);
  if (topLevel >= EMBEDDED_LEVEL_WARN) {
    return true;
  }

  const embedded = parseEmbeddedLogPayload(entry?.message);
  if (embedded) {
    const embeddedLevel = normalizeSeverity(embedded.level);
    if (embeddedLevel >= EMBEDDED_LEVEL_WARN) {
      return true;
    }
    const embeddedMsg = String(
      embedded.msg || embedded.message || '',
    ).toLowerCase();
    return hasProblemPattern(embeddedMsg);
  }

  const message = String(entry?.message || '').toLowerCase();
  return hasProblemPattern(message);
}

/**
 * Normalize scenario payload returned by run(cluster).
 * Non-object payloads are ignored.
 * @param {*} payload
 * @returns {Object|null}
 */
function normalizeScenarioPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return payload;
}

/**
 * Evaluate required trace assertions for a scenario run.
 * @param {Object|null} traceArtifact
 * @param {Object} debugTraceConfig
 * @return {Object|null}
 */
function evaluateTraceAssertions(traceArtifact, debugTraceConfig) {
  if (!debugTraceConfig ||
    debugTraceConfig.enabled !== true ||
    debugTraceConfig.required !== true) {
    return null;
  }

  const assertion = {
    required: true,
    passed: true,
    eventCount: Number(traceArtifact?.eventCount || 0),
    requiredLineagePrefix: debugTraceConfig.requiredLineagePrefix || null,
    matchedRequiredLineagePrefix: true,
    error: null,
  };

  if (!traceArtifact || typeof traceArtifact !== 'object') {
    assertion.passed = false;
    assertion.matchedRequiredLineagePrefix = false;
    assertion.error = TRACE_ASSERTION_MISSING_ARTIFACT;
    return assertion;
  }

  if (!Number.isInteger(assertion.eventCount) ||
    assertion.eventCount <= 0) {
    assertion.passed = false;
    assertion.matchedRequiredLineagePrefix = false;
    assertion.error = TRACE_ASSERTION_NO_EVENTS;
    return assertion;
  }

  const requiredPrefix = assertion.requiredLineagePrefix;
  if (requiredPrefix) {
    const lineageIds = Array.isArray(traceArtifact.lineageIds) ?
      traceArtifact.lineageIds :
      [];
    const matched = lineageIds.some((lineageId) =>
      String(lineageId || '').startsWith(requiredPrefix),
    );
    assertion.matchedRequiredLineagePrefix = matched;
    if (!matched) {
      assertion.passed = false;
      assertion.error =
        TRACE_ASSERTION_LINEAGE_PREFIX_MISSING + requiredPrefix;
    }
  }

  return assertion;
}

/**
 * Evaluate required memory leak assertions for a scenario run.
 * @param {Object|null} memoryLeakAnalysis
 * @param {Object} memoryLeakConfig
 * @return {Object|null}
 */
function evaluateMemoryLeakAssertions(memoryLeakAnalysis, memoryLeakConfig) {
  if (!memoryLeakConfig || memoryLeakConfig.enabled !== true) {
    return null;
  }

  const leakingNodes = Array.isArray(memoryLeakAnalysis?.leakingNodes) ?
    memoryLeakAnalysis.leakingNodes :
    [];
  const warnings = Array.isArray(memoryLeakAnalysis?.warnings) ?
    memoryLeakAnalysis.warnings.map((warning) => String(warning)) :
    [];
  const sampleCount = Number(memoryLeakAnalysis?.sampleCount || 0);
  const samplesUnavailable = sampleCount <= 0 ||
    warnings.includes(MEMORY_ANALYSIS_WARNING_SAMPLES_PATH_MISSING) ||
    warnings.includes(MEMORY_ANALYSIS_WARNING_SAMPLES_READ_FAILED);
  const assertion = {
    enabled: true,
    required: memoryLeakConfig.failOnDetection === true ||
      memoryLeakConfig.requireSamples === true,
    analyzed: memoryLeakAnalysis?.analyzed === true,
    leakDetected: memoryLeakAnalysis?.leakDetected === true,
    leakingNodeCount: Number(memoryLeakAnalysis?.leakingNodeCount || 0),
    leakingNodes,
    sampleCount,
    passed: true,
    error: null,
  };

  if (memoryLeakConfig.requireSamples === true &&
      assertion.analyzed !== true) {
    if (samplesUnavailable) {
      assertion.passed = false;
      assertion.error = MEMORY_ASSERTION_SAMPLES_MISSING;
      return assertion;
    }
    assertion.sampleCoverage = 'present';
    assertion.analysisDeferred = true;
    assertion.warning = MEMORY_ASSERTION_ANALYSIS_INSUFFICIENT;
    return assertion;
  }

  if (memoryLeakConfig.failOnDetection === true &&
      assertion.leakDetected === true) {
    assertion.passed = false;
    assertion.error = MEMORY_ASSERTION_LEAK_DETECTED_PREFIX +
      leakingNodes.join(',');
  }

  return assertion;
}

function formatLiveLogEntry(entry) {
  const embedded = parseEmbeddedLogPayload(entry?.message);
  if (embedded) {
    const timestamp = entry?.timestamp || '';
    const nodeId = entry?.node_id || '';
    const level = severityLabel(embedded.level);
    const message = sanitizeMessage(
      String(embedded.msg || embedded.message || ''),
    );
    return `${timestamp} [${nodeId}] ${level}: ${message}`;
  }

  const sanitized = {
    ...entry,
    message: sanitizeMessage(String(entry?.message || '')),
  };
  return formatLogEntry(sanitized);
}

function parseEmbeddedLogPayload(message) {
  if (typeof message !== 'string') {
    return null;
  }
  const start = message.indexOf(EMBEDDED_JSON_START);
  if (start < 0) {
    return null;
  }
  const candidate = message.slice(start);
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch (_err) {
    return null;
  }
}

function normalizeSeverity(level) {
  if (typeof level === 'number' && Number.isFinite(level)) {
    return level;
  }

  const normalized = String(level || '').toLowerCase();
  if (normalized === LEVEL_FATAL) {
    return 60;
  }
  if (normalized === LEVEL_ERROR) {
    return 50;
  }
  if (normalized === LEVEL_WARN) {
    return 40;
  }
  if (normalized === LEVEL_INFO) {
    return 30;
  }
  if (normalized === LEVEL_DEBUG) {
    return 20;
  }
  return 0;
}

function severityLabel(level) {
  if (typeof level === 'number' && Number.isFinite(level)) {
    if (level >= 60) return LEVEL_FATAL;
    if (level >= 50) return LEVEL_ERROR;
    if (level >= 40) return LEVEL_WARN;
    if (level >= 30) return LEVEL_INFO;
    return LEVEL_DEBUG;
  }
  const normalized = String(level || '').toLowerCase();
  return normalized || LEVEL_INFO;
}

function sanitizeMessage(message) {
  let sanitized = '';
  for (let i = 0; i < message.length; i++) {
    const charCode = message.charCodeAt(i);
    const isControl = charCode <= CONTROL_CHAR_MAX_CODE ||
      charCode === DELETE_CHAR_CODE;
    if (isControl) {
      continue;
    }
    sanitized += message[i];
  }
  return sanitized;
}

function hasProblemPattern(message) {
  if (!message) {
    return false;
  }
  return message.includes(ERROR_PATTERN) ||
    message.includes(FAIL_PATTERN) ||
    message.includes(TIMEOUT_PATTERN);
}

/**
 * Load a scenario module path as a file URL so both absolute and
 * workspace-relative paths resolve correctly.
 * @param {string} scenarioPath
 * @returns {Promise<Object>}
 */
async function loadScenarioModule(scenarioPath) {
  const scenarioUrl = pathToFileURL(resolve(scenarioPath)).href;
  return import(scenarioUrl);
}

/**
 * Main entry point. Parses args, loads config, discovers
 * scenarios, runs them, writes report, and exits.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

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
    runConfig = applyFastLocalConfig(runConfig);
    if (args.verbose) {
      process.stdout.write(FAST_LOCAL_LOG_PREFIX);
    }
  }
  const deterministicDebug = resolveDeterministicDebugConfig(args, runConfig);
  if (deterministicDebug.enabled) {
    runConfig = applyDeterministicDebugConfig(runConfig, deterministicDebug);
    installDeterministicRandom(deterministicDebug.seed);
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
  try {
    await buildImage(runConfig, args.verbose, dockerOperationSink);
  } catch (err) {
    process.stderr.write(
      'Failed to build image: ' + err.message + '\n',
    );
    process.exit(EXIT_CODES.FAILURE);
  }

  const allScenarios = await discoverScenarios();
  const scenarios = args.scenario ?
    filterScenarios(allScenarios, args.scenario) :
    allScenarios;

  if (args.verbose) {
    process.stdout.write(
      RUNNER_STAGE_SCENARIO_FILTER_PREFIX +
      String(args.scenario || RUNNER_STAGE_SCENARIO_FILTER_ALL) + '\n',
    );
  }

  if (scenarios.length === 0) {
    process.stderr.write('No scenarios found.\n');
    process.exit(EXIT_CODES.FAILURE);
  }

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

  const {report, hasFailures} = await runScenarios(
    runConfig,
    scenarios,
    {
      output: args.output,
      verbose: args.verbose,
      historyReports: historicalReports,
      dockerOperationSink,
      reportMetadata,
    },
  );

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
  const failureBundle = await writeFailureBundlesForReport({
    scenarios: report.scenarios,
    reportOutputPath: args.output,
    outputDir: runConfig.outputDir,
    reportSummary: reportPreview.summary,
    standardSummary: reportPreview.standardSummary,
    benchmarkRegressionGate,
  });
  await report.write({
    benchmarkRegressionGate,
    ...(failureBundle.runBundle ? {failureBundle: failureBundle.runBundle} : {}),
  });

  if (args.verbose) {
    process.stdout.write(
      'Report written to ' + args.output + '\n',
    );
  }

  const gateFailed = benchmarkRegressionGate.status === BENCHMARK_GATE_STATUS.FAILED;
  const hasRunFailures = hasFailures || gateFailed;
  if (args.verbose && gateFailed) {
    process.stderr.write(
      'Benchmark regression gate failed: ' +
      String(benchmarkRegressionGate.reason || BENCHMARK_GATE_FAIL_REASON.THROUGHPUT_REGRESSION) +
      '\n',
    );
  }

  process.exit(
    hasRunFailures ? EXIT_CODES.FAILURE : EXIT_CODES.SUCCESS,
  );
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
  evaluateBenchmarkRegressionGate,
  resolveBenchmarkGateConfig,
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
  loadHistoricalReports,
};
