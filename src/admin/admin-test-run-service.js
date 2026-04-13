/**
 * Admin test run service.
 * Owns distributed scenario discovery, run lifecycle control, and
 * saved-run inventory for HTTP admin ingress.
 */

import {spawn as spawnChildProcess, execFile as execFileNode} from 'node:child_process';
import {lookup as lookupDns} from 'node:dns/promises';
import {
  mkdir,
  open as openFile,
  readdir,
  readFile,
  rm as removePath,
  stat,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  extname,
  join,
  resolve,
} from 'node:path';
import {URL} from 'node:url';
import {
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_LOG_STREAM,
  ADMIN_TEST_RUN_PATH,
  ADMIN_TEST_RUN_STATUS,
  ADMIN_TEST_STREAM_EVENT,
} from './admin-constants.js';
import {
  buildArchivedTimelineCandidates,
  buildLivePlaybackViewerUrl,
  buildPlaybackViewerUrl,
  buildRunPlaybackOutputDir,
  buildScenarioOutputDir,
  buildScenarioPlaybackPaths,
  getContentType,
  isPathInside,
  normalizeWorkspaceRelativePath,
  resolveOutputAssetPath,
  toOutputWebPath,
} from './admin-test-run-paths.js';
import {
  inferProgressFromLog,
  RUN_PROGRESS_PERCENT,
  RUN_PROGRESS_PHASE,
} from './admin-test-run-progress.js';
import {
  extractReportSummary,
  isRunStatusActive,
  mergeRunRecord,
  serializeRun,
} from './admin-test-run-report.js';

const FILE_ENCODING = 'utf8';
const REPORT_TIMESTAMP_FALLBACK_MS = 0;
const PROCESS_EXIT_SUCCESS = 0;
const METADATA_FILE_EXTENSION = '.json';
const CLEAN_LINE_BREAK_REGEX = /\r?\n/;
const TRIM_CRLF_REGEX = /\r$/;
const FIRST_SPACE_REGEX = /\s+/;
const ISO_TIMESTAMP_PREFIX_REGEX = /^\d{4}-\d{2}-\d{2}T/;
const RUN_ID_SANITIZE_REGEX = /[^a-zA-Z0-9._-]/g;
const RUN_TIMESTAMP_CHAR_REGEX = /[-:.]/g;
const RUN_TIMESTAMP_REPLACEMENT = '';
const METADATA_FILENAME_PREFIX = 'run-';
const METADATA_SCHEMA_VERSION = 1;
const GIT_HASH_COMMAND = 'git';
const GIT_HASH_ARGS = Object.freeze(['rev-parse', '--short', 'HEAD']);
const GIT_HASH_FALLBACK = ADMIN_TEST_DEFAULT.GIT_HASH_UNKNOWN;
const EMPTY_STRING = '';
const DEFAULT_STDIO = 'pipe';
const SIGNAL_STOP = ADMIN_TEST_DEFAULT.SIGNAL_TERM;
const FILE_READ_BYTES_PER_CHUNK = 65536;
const BUFFER_ENCODING = 'utf8';
const RUN_CONFIG_MODE = Object.freeze({
  LOCAL: 'local',
  REMOTE: 'remote',
});
const CONFIG_PRECHECK_STATE = Object.freeze({
  INVALID_DOCKER_HOST: 'invalid_docker_host',
  LOCAL_READY: 'local_ready',
  REMOTE_HOST_RESOLVED: 'remote_host_resolved',
  REMOTE_READY: 'remote_ready',
  REMOTE_HOST_UNRESOLVABLE: 'remote_host_unresolvable',
});
const RUN_FINALIZATION_STATE = Object.freeze({
  STOPPED: 'stopped',
  PASSED: 'passed',
  FAILED: 'failed',
});
const CONFIG_PRECHECK_ERROR_PREFIX =
  `${ADMIN_TEST_ERROR_MSG.CONFIG_PREFLIGHT_FAILED}: `;
const DOCKER_HOST_PROTOCOL_SEPARATOR = '://';
const DOCKER_HOST_PATH_SEPARATOR = '/';
const DOCKER_HOST_PORT_SEPARATOR = ':';
const DOCKER_HOST_IPV6_PREFIX = '[';
const DOCKER_HOST_IPV6_SUFFIX = ']';

function buildLocalConfigPrecheck(socketPath) {
  return Object.freeze({
    state: CONFIG_PRECHECK_STATE.LOCAL_READY,
    mode: RUN_CONFIG_MODE.LOCAL,
    socketPath,
    hosts: [],
  });
}

function buildRemoteConfigPrecheck(hosts) {
  return Object.freeze({
    state: CONFIG_PRECHECK_STATE.REMOTE_READY,
    mode: RUN_CONFIG_MODE.REMOTE,
    socketPath: null,
    hosts,
  });
}

function resolveConfigPrecheckState(observations) {
  const blockingObservation = observations.find((observation) =>
    observation.state !== CONFIG_PRECHECK_STATE.REMOTE_HOST_RESOLVED);
  return blockingObservation?.state || CONFIG_PRECHECK_STATE.REMOTE_READY;
}

function buildConfigPrecheckOutcome({
  configName,
  hosts,
  observations,
  precheckState,
}) {
  const blockingObservation = observations.find((observation) =>
    observation.state === precheckState);
  switch (precheckState) {
    case CONFIG_PRECHECK_STATE.INVALID_DOCKER_HOST:
      return Object.freeze({
        state: precheckState,
        error: new Error(
          `${CONFIG_PRECHECK_ERROR_PREFIX}` +
          `invalid docker host "${blockingObservation.host}" in config "${configName}"`,
        ),
      });
    case CONFIG_PRECHECK_STATE.REMOTE_HOST_UNRESOLVABLE:
      return Object.freeze({
        state: precheckState,
        error: new Error(
          `${CONFIG_PRECHECK_ERROR_PREFIX}` +
          `docker host "${blockingObservation.host}" from config "${configName}"` +
          ` is not resolvable: ${blockingObservation.message}`,
        ),
      });
    case CONFIG_PRECHECK_STATE.REMOTE_READY:
      return Object.freeze({
        state: precheckState,
        precheck: buildRemoteConfigPrecheck(hosts),
      });
    default:
      return Object.freeze({
        state: precheckState,
        error: new Error(
          `${CONFIG_PRECHECK_ERROR_PREFIX}` +
          `unsupported config precheck state "${precheckState}" for config "${configName}"`,
        ),
      });
  }
}

function buildRunFinalizationSnapshot(run, exitCode) {
  return Object.freeze({
    priorStatus: run.status,
    exitCode,
  });
}

function resolveRunFinalizationState(snapshot) {
  if (snapshot.priorStatus === ADMIN_TEST_RUN_STATUS.STOPPING) {
    return RUN_FINALIZATION_STATE.STOPPED;
  }
  if (snapshot.exitCode === PROCESS_EXIT_SUCCESS) {
    return RUN_FINALIZATION_STATE.PASSED;
  }
  return RUN_FINALIZATION_STATE.FAILED;
}

function buildRunFinalizationOutcome(finalizationState) {
  switch (finalizationState) {
    case RUN_FINALIZATION_STATE.STOPPED:
      return Object.freeze({
        state: finalizationState,
        status: ADMIN_TEST_RUN_STATUS.STOPPED,
        progress: Object.freeze({
          phase: RUN_PROGRESS_PHASE.STOPPED,
          message: 'Run stopped',
          percent: 100,
        }),
      });
    case RUN_FINALIZATION_STATE.PASSED:
      return Object.freeze({
        state: finalizationState,
        status: ADMIN_TEST_RUN_STATUS.PASSED,
        progress: Object.freeze({
          phase: RUN_PROGRESS_PHASE.COMPLETED,
          message: 'Run completed successfully',
          percent: 100,
        }),
      });
    case RUN_FINALIZATION_STATE.FAILED:
      return Object.freeze({
        state: finalizationState,
        status: ADMIN_TEST_RUN_STATUS.FAILED,
        progress: Object.freeze({
          phase: RUN_PROGRESS_PHASE.FAILED,
          message: 'Run failed',
          percent: 100,
        }),
      });
    default:
      return Object.freeze({
        state: finalizationState,
        status: ADMIN_TEST_RUN_STATUS.FAILED,
        progress: Object.freeze({
          phase: RUN_PROGRESS_PHASE.FAILED,
          message: 'Run failed',
          percent: 100,
        }),
      });
  }
}


/**
 * Build a stable run identifier.
 * @param {string} scenario
 * @param {number} epochMs
 * @param {string} gitHash
 * @return {string}
 */
function buildRunId(scenario, epochMs, gitHash) {
  const safeScenario = String(scenario).replace(RUN_ID_SANITIZE_REGEX, '_');
  const timestamp = new Date(epochMs)
    .toISOString()
    .replace(RUN_TIMESTAMP_CHAR_REGEX, RUN_TIMESTAMP_REPLACEMENT);
  const safeGitHash = String(gitHash || GIT_HASH_FALLBACK).replace(
    RUN_ID_SANITIZE_REGEX, '_',
  );
  return `${safeScenario}-${timestamp}-${safeGitHash}`;
}

/**
 * Return JSON parse result or null for unreadable files.
 * @param {string} filePath
 * @return {Promise<Object|null>}
 */
async function tryReadJson(filePath) {
  try {
    const raw = await readFile(filePath, FILE_ENCODING);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Admin test run service.
 */
class AdminTestRunService {
  /**
   * @param {Object} [options]
   * @param {string} [options.workspaceRoot]
   * @param {Function} [options.spawnRunner]
   * @param {Function} [options.execFile]
   * @param {Function} [options.resolveHost]
   * @param {Function} [options.now]
   */
  constructor(options = {}) {
    this.workspaceRoot = resolve(options.workspaceRoot || process.cwd());
    this.spawnRunner = options.spawnRunner || spawnChildProcess;
    this.execFile = options.execFile || execFileNode;
    this.resolveHost = options.resolveHost || lookupDns;
    this.now = options.now || (() => Date.now());

    this.scenariosDir = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.SCENARIOS_DIR,
    );
    this.configDir = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.CONFIG_DIR,
    );
    this.runScript = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.RUNNER_SCRIPT,
    );
    this.outputDir = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.OUTPUT_DIR,
    );
    this.metadataDir = resolve(
      this.outputDir,
      ADMIN_TEST_RUN_PATH.METADATA_DIR,
    );
    this.dashboardPath = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.DASHBOARD_PAGE,
    );
    this.playbackViewerPath = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.PLAYBACK_VIEWER,
    );

    /** @type {Map<string, Object>} */
    this.runs = new Map();
  }

  /**
   * List available distributed scenarios.
   * @return {Promise<Array<Object>>}
   */
  async listAvailableTests() {
    const entries = await this.tryReadDirectory(this.scenariosDir);
    return entries
      .filter((entry) => entry.isFile() &&
        extname(entry.name) === ADMIN_TEST_DEFAULT.SCENARIO_EXTENSION)
      .map((entry) => ({
        id: basename(entry.name, ADMIN_TEST_DEFAULT.SCENARIO_EXTENSION),
        file: join(
          ADMIN_TEST_RUN_PATH.SCENARIOS_DIR,
          entry.name,
        ),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * List available test config files.
   * @return {Promise<Array<Object>>}
   */
  async listAvailableConfigs() {
    const entries = await this.tryReadDirectory(this.configDir);
    return entries
      .filter((entry) => entry.isFile() &&
        extname(entry.name) === ADMIN_TEST_DEFAULT.CONFIG_EXTENSION)
      .map((entry) => ({
        id: entry.name,
        file: join(
          ADMIN_TEST_RUN_PATH.CONFIG_DIR,
          entry.name,
        ),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Parse one config JSON file under distributed config directory.
   * @param {string} configName
   * @return {Promise<Object>}
   * @private
   */
  async readConfigPayload(configName) {
    const configPath = resolve(this.configDir, configName);
    let raw = EMPTY_STRING;
    try {
      raw = await readFile(configPath, FILE_ENCODING);
    } catch (error) {
      throw new Error(
        `${CONFIG_PRECHECK_ERROR_PREFIX}` +
        `unable to read config "${configName}": ${error.message}`,
      );
    }

    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      throw new Error(
        `${CONFIG_PRECHECK_ERROR_PREFIX}` +
        `config "${configName}" is not valid JSON: ${error.message}`,
      );
    }
  }

  /**
   * Parse hostname from docker host target.
   * @param {string} dockerHost
   * @return {string|null}
   * @private
   */
  parseDockerHostname(dockerHost) {
    const value = String(dockerHost || EMPTY_STRING).trim();
    if (!value) {
      return null;
    }

    if (value.includes(DOCKER_HOST_PROTOCOL_SEPARATOR)) {
      try {
        const parsed = new URL(value);
        return parsed.hostname || null;
      } catch (_error) {
        return null;
      }
    }

    const firstSegment = value.split(DOCKER_HOST_PATH_SEPARATOR, 1)[0];
    if (!firstSegment) {
      return null;
    }
    if (firstSegment.startsWith(DOCKER_HOST_IPV6_PREFIX)) {
      const suffixIndex = firstSegment.indexOf(DOCKER_HOST_IPV6_SUFFIX);
      if (suffixIndex > 1) {
        return firstSegment.slice(1, suffixIndex);
      }
      return null;
    }

    const firstSeparator = firstSegment.indexOf(DOCKER_HOST_PORT_SEPARATOR);
    const lastSeparator = firstSegment.lastIndexOf(DOCKER_HOST_PORT_SEPARATOR);
    if (firstSeparator >= 0 && firstSeparator === lastSeparator) {
      return firstSegment.slice(0, lastSeparator) || null;
    }
    return firstSegment;
  }

  /**
   * Run config precheck and resolve Docker target summary.
   * @param {string} configName
   * @return {Promise<Object>}
   * @private
   */
  async precheckConfig(configName) {
    const config = await this.readConfigPayload(configName);
    const docker = config?.docker || {};
    const hosts = Array.isArray(docker.hosts) ?
      docker.hosts
        .map((entry) => String(entry || EMPTY_STRING).trim())
        .filter((entry) => Boolean(entry)) :
      [];

    if (hosts.length === 0) {
      return buildLocalConfigPrecheck(
        String(docker.socketPath || EMPTY_STRING).trim() || null,
      );
    }

    const observations = [];
    for (const host of hosts) {
      observations.push(await this.resolveRemoteDockerHostObservation(host));
    }

    const precheckState = resolveConfigPrecheckState(observations);
    const outcome = buildConfigPrecheckOutcome({
      configName,
      hosts,
      observations,
      precheckState,
    });
    if (outcome.error) {
      throw outcome.error;
    }
    return outcome.precheck;
  }

  /**
   * Resolve one remote docker-host observation for config precheck.
   * @param {string} host
   * @return {Promise<Object>}
   * @private
   */
  async resolveRemoteDockerHostObservation(host) {
    const hostname = this.parseDockerHostname(host);
    if (!hostname) {
      return Object.freeze({
        state: CONFIG_PRECHECK_STATE.INVALID_DOCKER_HOST,
        host,
      });
    }
    try {
      await this.resolveHost(hostname);
      return Object.freeze({
        state: CONFIG_PRECHECK_STATE.REMOTE_HOST_RESOLVED,
        host,
        hostname,
      });
    } catch (error) {
      return Object.freeze({
        state: CONFIG_PRECHECK_STATE.REMOTE_HOST_UNRESOLVABLE,
        host,
        hostname,
        message: error.message,
      });
    }
  }

  /**
   * Render config precheck summary line for run logs.
   * @param {Object} precheck
   * @param {string} configName
   * @return {string}
   * @private
   */
  formatPrecheckSummary(precheck, configName) {
    if (precheck?.mode === RUN_CONFIG_MODE.REMOTE) {
      return `[preflight] config "${configName}" resolved ` +
        `${precheck.hosts.length} docker host(s): ${precheck.hosts.join(', ')}`;
    }
    const socketPath = precheck?.socketPath || 'default docker socket';
    return `[preflight] config "${configName}" using local socket "${socketPath}"`;
  }

  /**
   * List historical and active runs.
   * @return {Promise<Array<Object>>}
   */
  async listSavedRuns() {
    const runsById = new Map();
    const reportRuns = await this.listRunsFromReports();
    for (const reportRun of reportRuns) {
      runsById.set(reportRun.runId, reportRun);
    }

    const metadataRuns = await this.listRunsFromMetadata();
    for (const metadataRun of metadataRuns) {
      const existing = runsById.get(metadataRun.runId) || {};
      runsById.set(
        metadataRun.runId,
        this.mergeRunRecord(existing, metadataRun),
      );
    }

    for (const activeRun of this.runs.values()) {
      const existing = runsById.get(activeRun.runId) || {};
      runsById.set(
        activeRun.runId,
        this.mergeRunRecord(
          existing,
          this.serializeRun(activeRun),
        ),
      );
    }

    return Array.from(runsById.values())
      .sort((a, b) => {
        const aValue = Date.parse(a.startedAt || EMPTY_STRING) ||
          REPORT_TIMESTAMP_FALLBACK_MS;
        const bValue = Date.parse(b.startedAt || EMPTY_STRING) ||
          REPORT_TIMESTAMP_FALLBACK_MS;
        return bValue - aValue;
      });
  }

  /**
   * Return one run by id.
   * @param {string} runId
   * @return {Promise<Object|null>}
   */
  async getRun(runId) {
    const activeRun = this.runs.get(runId);
    if (activeRun) {
      return this.serializeRun(activeRun, {includeLogs: true});
    }

    const metadataFile = this.resolveMetadataFilePath(runId);
    const metadata = await tryReadJson(metadataFile);
    if (metadata) {
      const reportData = await this.getReportSummary(
        metadata.outputReportPath || null,
        metadata.runId,
      );
      const runRecord = this.mergeRunRecord(metadata, reportData);
      runRecord.logs = await this.loadArchivedLogs(runRecord);
      return runRecord;
    }

    const reportOnlyRun = await this.getReportOnlyRun(runId);
    if (!reportOnlyRun) {
      return null;
    }

    const runRecord = {...reportOnlyRun};
    runRecord.logs = await this.loadArchivedLogs(runRecord);
    return runRecord;
  }

  /**
   * Start a distributed test run.
   * @param {Object} payload
   * @param {string} payload.scenario
   * @param {string} [payload.config]
   * @param {boolean} [payload.verbose]
   * @return {Promise<Object>}
   */
  async startRun(payload) {
    const scenario = String(payload?.scenario || EMPTY_STRING).trim();
    if (!scenario) {
      throw new Error(ADMIN_TEST_ERROR_MSG.SCENARIO_REQUIRED);
    }

    const availableScenarios = await this.listAvailableTests();
    if (!availableScenarios.find((entry) => entry.id === scenario)) {
      throw new Error(ADMIN_TEST_ERROR_MSG.SCENARIO_NOT_FOUND);
    }

    const requestedConfig =
      String(payload?.config || ADMIN_TEST_DEFAULT.CONFIG_FILE).trim();
    const configName = requestedConfig || ADMIN_TEST_DEFAULT.CONFIG_FILE;
    const availableConfigs = await this.listAvailableConfigs();
    if (!availableConfigs.find((entry) => entry.id === configName)) {
      throw new Error(ADMIN_TEST_ERROR_MSG.CONFIG_NOT_FOUND);
    }
    const configPrecheck = await this.precheckConfig(configName);

    const gitHash = await this.resolveGitHash();
    const startedAtMs = this.now();
    const runId = buildRunId(scenario, startedAtMs, gitHash);
    const outputReportPath = join(
      ADMIN_TEST_RUN_PATH.OUTPUT_DIR,
      `${runId}${ADMIN_TEST_DEFAULT.REPORT_EXTENSION}`,
    );
    const playbackPaths = this.buildScenarioPlaybackPaths(scenario, runId);
    const playbackManifestPath = playbackPaths?.manifestPath || null;
    const playbackManifestUrl = this.toOutputWebPath(playbackManifestPath);
    const playbackEventsUrl = this.toOutputWebPath(playbackPaths?.eventsPath || null);
    const playbackSamplesUrl = this.toOutputWebPath(playbackPaths?.samplesPath || null);
    const playbackSnapshotsUrl = this.toOutputWebPath(
      playbackPaths?.snapshotsPath || null,
    );
    const livePlaybackViewerUrl = this.buildLivePlaybackViewerUrl(
      {
        eventsUrl: playbackEventsUrl,
        samplesUrl: playbackSamplesUrl,
        snapshotsUrl: playbackSnapshotsUrl,
      },
      {
        follow: true,
        autoplay: true,
        runId,
        runStartMs: startedAtMs,
      },
    );

    await mkdir(this.outputDir, {recursive: true});
    await mkdir(this.metadataDir, {recursive: true});

    const configPath = join(ADMIN_TEST_RUN_PATH.CONFIG_DIR, configName);
    const args = [
      this.runScript,
      '--config',
      configPath,
      '--scenario',
      scenario,
      '--output',
      outputReportPath,
    ];

    if (payload?.verbose !== false) {
      args.push('--verbose');
    }

    const child = this.spawnRunner(process.execPath, args, {
      cwd: this.workspaceRoot,
      stdio: [DEFAULT_STDIO, DEFAULT_STDIO, DEFAULT_STDIO],
      env: process.env,
    });

    const run = {
      runId,
      scenario,
      config: configName,
      gitHash,
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: null,
      status: ADMIN_TEST_RUN_STATUS.RUNNING,
      outputReportPath,
      outputReportUrl: this.toOutputWebPath(outputReportPath),
      playbackManifestPath,
      playbackManifestUrl,
      playbackViewerUrl: playbackManifestPath ?
        this.buildPlaybackViewerUrl(playbackManifestPath) : null,
      playbackEventsPath: playbackPaths?.eventsPath || null,
      playbackSamplesPath: playbackPaths?.samplesPath || null,
      playbackSnapshotsPath: playbackPaths?.snapshotsPath || null,
      playbackEventsUrl,
      playbackSamplesUrl,
      playbackSnapshotsUrl,
      livePlaybackViewerUrl,
      exitCode: null,
      signal: null,
      pid: child.pid || null,
      logBuffer: [],
      stdoutRemainder: EMPTY_STRING,
      stderrRemainder: EMPTY_STRING,
      progress: this.buildProgressPayload({
        phase: RUN_PROGRESS_PHASE.STARTING,
        message:
          `Run started for scenario "${scenario}" with config "${configName}"`,
        percent: RUN_PROGRESS_PERCENT.CONFIG_LOADING,
      }),
      subscribers: new Set(),
      childProcess: child,
    };

    const precheckSummary = this.formatPrecheckSummary(
      configPrecheck,
      configName,
    );
    this.appendRunLog(
      run,
      ADMIN_TEST_LOG_STREAM.SYSTEM,
      precheckSummary,
    );
    this.updateRunProgress(run, {
      phase: RUN_PROGRESS_PHASE.STARTING,
      message: precheckSummary,
      percent: RUN_PROGRESS_PERCENT.PRECHECK_COMPLETE,
    });

    this.runs.set(runId, run);
    this.publishStatus(run);
    await this.persistRunMetadata(run);

    if (child.stdout && typeof child.stdout.on === 'function') {
      child.stdout.on('data', (chunk) => {
        this.captureRunOutput(run, ADMIN_TEST_LOG_STREAM.STDOUT, chunk);
      });
    }

    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', (chunk) => {
        this.captureRunOutput(run, ADMIN_TEST_LOG_STREAM.STDERR, chunk);
      });
    }

    child.on('error', (error) => {
      this.appendRunLog(
        run,
        ADMIN_TEST_LOG_STREAM.SYSTEM,
        error.message,
      );
    });

    child.on('close', (code, signal) => {
      void this.finalizeRun(run, code, signal);
    });

    return this.serializeRun(run);
  }

  /**
   * Stop an active run by id.
   * @param {string} runId
   * @return {Promise<Object>}
   */
  async stopRun(runId) {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND);
    }
    if (!run.childProcess || run.status !== ADMIN_TEST_RUN_STATUS.RUNNING) {
      throw new Error(ADMIN_TEST_ERROR_MSG.RUN_NOT_ACTIVE);
    }

    run.status = ADMIN_TEST_RUN_STATUS.STOPPING;
    this.updateRunProgress(run, {
      phase: RUN_PROGRESS_PHASE.STOPPING,
      message: 'Stop requested',
      percent: Math.max(90, Number(run.progress?.percent || 0)),
    });
    this.publishStatus(run);
    await this.persistRunMetadata(run);

    run.childProcess.kill(SIGNAL_STOP);
    return this.serializeRun(run);
  }

  /**
   * Delete a completed historical run by id.
   * Removes report and metadata artifacts where present.
   * @param {string} runId
   * @return {Promise<Object>}
   */
  async deleteRun(runId) {
    const normalizedRunId = String(runId || EMPTY_STRING).trim();
    if (!normalizedRunId) {
      throw new Error(ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND);
    }

    const activeRun = this.runs.get(normalizedRunId);
    if (activeRun && isRunStatusActive(activeRun.status)) {
      throw new Error(ADMIN_TEST_ERROR_MSG.RUN_DELETE_ACTIVE);
    }

    const runRecord = await this.getRun(normalizedRunId);
    if (!runRecord) {
      throw new Error(ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND);
    }

    const metadataPath = this.resolveMetadataFilePath(normalizedRunId);
    const reportPath = runRecord.outputReportPath ?
      resolve(this.workspaceRoot, runRecord.outputReportPath) :
      resolve(
        this.workspaceRoot,
        join(
          ADMIN_TEST_RUN_PATH.OUTPUT_DIR,
          `${normalizedRunId}${ADMIN_TEST_DEFAULT.REPORT_EXTENSION}`,
        ),
      );
    const playbackRunDir = resolve(
      this.workspaceRoot,
      this.buildRunPlaybackOutputDir(normalizedRunId),
    );

    const removed = {
      metadata: await this.removeFileIfExists(metadataPath, this.metadataDir),
      report: await this.removeFileIfExists(reportPath, this.outputDir),
      playback: await this.removeDirectoryIfExists(playbackRunDir, this.outputDir),
    };

    this.runs.delete(normalizedRunId);

    return {
      runId: normalizedRunId,
      deleted: true,
      removed,
    };
  }

  /**
   * Subscribe to live logs and status updates for a run.
   * @param {string} runId
   * @param {Function} onEvent
   * @return {{backlog: Array<Object>, run: Object, unsubscribe: Function}|null}
   */
  subscribeToRun(runId, onEvent) {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }

    run.subscribers.add(onEvent);
    const unsubscribe = () => {
      run.subscribers.delete(onEvent);
    };

    return {
      backlog: [...run.logBuffer],
      run: this.serializeRun(run),
      unsubscribe,
    };
  }

  /**
   * Read dashboard HTML page.
   * @return {Promise<string>}
   */
  async readDashboardPage() {
    return readFile(this.dashboardPath, FILE_ENCODING);
  }

  /**
   * Read playback viewer HTML.
   * @return {Promise<string>}
   */
  async readPlaybackViewer() {
    return readFile(this.playbackViewerPath, FILE_ENCODING);
  }

  /**
   * Resolve a relative path inside test-output.
   * @param {string} wildcardPath
   * @return {string|null}
   */
  resolveOutputAssetPath(wildcardPath) {
    return resolveOutputAssetPath(wildcardPath, this.outputDir);
  }

  /**
   * Guess HTTP content type by filename extension.
   * @param {string} filePath
   * @return {string}
   */
  getContentType(filePath) {
    return getContentType(filePath);
  }

  /**
   * Read and return an output file payload.
   * @param {string} wildcardPath
   * @return {Promise<{contentType: string, body: Buffer}|null>}
   */
  async readOutputAsset(wildcardPath) {
    const filePath = this.resolveOutputAssetPath(wildcardPath);
    if (!filePath) {
      return null;
    }

    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        return null;
      }
      const body = await readFile(filePath);
      return {
        contentType: this.getContentType(filePath),
        body,
      };
    } catch {
      return null;
    }
  }

  /**
   * Load archived log lines for a completed run.
   * @param {Object} runRecord
   * @return {Promise<Array<Object>>}
   * @private
   */
  async loadArchivedLogs(runRecord) {
    const scenario = runRecord?.scenario;
    if (!scenario) {
      return [];
    }

    const timelinePaths = this.buildArchivedTimelineCandidates(runRecord);
    for (const timelinePath of timelinePaths) {
      if (!timelinePath || !isPathInside(this.outputDir, timelinePath)) {
        continue;
      }

      let fileStats = null;
      try {
        fileStats = await stat(timelinePath);
      } catch {
        fileStats = null;
      }
      if (!fileStats || !fileStats.isFile()) {
        continue;
      }

      let tailLines = [];
      try {
        tailLines = await this.readTailLines(
          timelinePath,
          ADMIN_TEST_DEFAULT.ARCHIVE_LOG_LINE_LIMIT,
        );
      } catch {
        tailLines = [];
      }
      if (tailLines.length === 0) {
        continue;
      }

      return tailLines.map((line) => this.buildArchivedLogEntry(line, runRecord));
    }

    return [];
  }

  /**
   * Read only the tail lines from a text file.
   * @param {string} filePath
   * @param {number} maxLines
   * @return {Promise<Array<string>>}
   * @private
   */
  async readTailLines(filePath, maxLines) {
    const fileHandle = await openFile(filePath, 'r');
    try {
      const stats = await fileHandle.stat();
      let position = Number(stats.size || REPORT_TIMESTAMP_FALLBACK_MS);
      let combined = EMPTY_STRING;
      let splitLines = [];

      while (position > REPORT_TIMESTAMP_FALLBACK_MS &&
        splitLines.length <= maxLines) {
        const chunkSize = Math.min(FILE_READ_BYTES_PER_CHUNK, position);
        position -= chunkSize;
        const buffer = Buffer.alloc(chunkSize);
        await fileHandle.read(buffer, REPORT_TIMESTAMP_FALLBACK_MS, chunkSize, position);
        combined = buffer.toString(BUFFER_ENCODING) + combined;
        splitLines = combined.split(CLEAN_LINE_BREAK_REGEX);
      }

      const normalized = splitLines
        .map((line) => line.trim())
        .filter((line) => Boolean(line));
      if (normalized.length <= maxLines) {
        return normalized;
      }
      return normalized.slice(normalized.length - maxLines);
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Convert one archived text line into UI log entry shape.
   * @param {string} line
   * @param {Object} runRecord
   * @return {Object}
   * @private
   */
  buildArchivedLogEntry(line, runRecord) {
    const firstToken = line.split(FIRST_SPACE_REGEX, 1)[0] || EMPTY_STRING;
    const timestamp = ISO_TIMESTAMP_PREFIX_REGEX.test(firstToken) ?
      firstToken :
      (runRecord.endedAt || runRecord.startedAt || new Date(this.now()).toISOString());

    return {
      timestamp,
      stream: ADMIN_TEST_LOG_STREAM.ARCHIVE,
      line,
    };
  }

  /**
   * Build timeline path candidates for archived run logs.
   * @param {Object} runRecord
   * @return {Array<string>}
   * @private
   */
  buildArchivedTimelineCandidates(runRecord) {
    return buildArchivedTimelineCandidates(
      runRecord, this.outputDir, this.workspaceRoot,
    );
  }

  /**
   * Collect run entries from report files.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async listRunsFromReports() {
    const entries = await this.tryReadDirectory(this.outputDir);
    const reportFiles = entries
      .filter((entry) => entry.isFile() &&
        entry.name.endsWith(ADMIN_TEST_DEFAULT.REPORT_EXTENSION))
      .map((entry) => entry.name);

    const runs = [];
    for (const reportFile of reportFiles) {
      const fullPath = resolve(this.outputDir, reportFile);
      const report = await tryReadJson(fullPath);
      if (!report || typeof report !== 'object') {
        continue;
      }

      const runId = basename(
        reportFile,
        ADMIN_TEST_DEFAULT.REPORT_EXTENSION,
      );
      const reportStat = await stat(fullPath);
      const reportSummary = this.extractReportSummary(
        report,
        runId,
        reportStat,
      );
      runs.push(reportSummary);
    }
    return runs;
  }

  /**
   * Collect run entries from metadata files.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async listRunsFromMetadata() {
    const entries = await this.tryReadDirectory(this.metadataDir);
    const files = entries
      .filter((entry) => entry.isFile() &&
        extname(entry.name) === METADATA_FILE_EXTENSION);

    const runs = [];
    for (const fileEntry of files) {
      const metadataPath = resolve(this.metadataDir, fileEntry.name);
      const metadata = await tryReadJson(metadataPath);
      if (!metadata || !metadata.runId) {
        continue;
      }
      const reportData = await this.getReportSummary(
        metadata.outputReportPath || null,
        metadata.runId,
      );
      runs.push(this.mergeRunRecord(metadata, reportData));
    }
    return runs;
  }

  /**
   * Return report-derived summary for one run.
   * @param {string|null} outputReportPath
   * @param {string} runId
   * @return {Promise<Object>}
   * @private
   */
  async getReportSummary(outputReportPath, runId) {
    if (!outputReportPath) {
      return {runId};
    }
    const reportPath = resolve(this.workspaceRoot, outputReportPath);
    const report = await tryReadJson(reportPath);
    if (!report || typeof report !== 'object') {
      return {runId};
    }
    let reportStats = null;
    try {
      reportStats = await stat(reportPath);
    } catch {
      reportStats = null;
    }
    return this.extractReportSummary(report, runId, reportStats);
  }

  /**
   * Load run details directly from report file when metadata is missing.
   * @param {string} runId
   * @return {Promise<Object|null>}
   * @private
   */
  async getReportOnlyRun(runId) {
    const outputReportPath = join(
      ADMIN_TEST_RUN_PATH.OUTPUT_DIR,
      `${runId}${ADMIN_TEST_DEFAULT.REPORT_EXTENSION}`,
    );
    const reportPath = resolve(this.workspaceRoot, outputReportPath);
    const report = await tryReadJson(reportPath);
    if (!report || typeof report !== 'object') {
      return null;
    }

    let reportStats = null;
    try {
      reportStats = await stat(reportPath);
    } catch {
      reportStats = null;
    }
    return this.extractReportSummary(report, runId, reportStats);
  }

  /**
   * Parse report JSON into run summary.
   * @param {Object} report
   * @param {string} runId
   * @param {Object|null} reportStats
   * @return {Object}
   * @private
   */
  extractReportSummary(report, runId, reportStats) {
    return extractReportSummary(
      report, runId, reportStats,
      this.outputDir, this.workspaceRoot, this.now,
    );
  }

  /**
   * Merge two run records, preferring defined values from right.
   * @param {Object} left
   * @param {Object} right
   * @return {Object}
   * @private
   */
  mergeRunRecord(left, right) {
    return mergeRunRecord(
      left, right,
      this.outputDir, this.workspaceRoot,
      (input) => this.buildProgressPayload(input),
    );
  }

  /**
   * Safely read directory entries.
   * @param {string} dirPath
   * @return {Promise<Array<import('node:fs').Dirent>>}
   * @private
   */
  async tryReadDirectory(dirPath) {
    try {
      return await readdir(dirPath, {withFileTypes: true});
    } catch {
      return [];
    }
  }

  /**
   * Remove one file only if it exists under basePath.
   * @param {string} filePath
   * @param {string} basePath
   * @return {Promise<boolean>}
   * @private
   */
  async removeFileIfExists(filePath, basePath) {
    if (!filePath || !basePath) {
      return false;
    }
    const absoluteFilePath = resolve(filePath);
    if (!isPathInside(basePath, absoluteFilePath)) {
      return false;
    }
    try {
      const fileStats = await stat(absoluteFilePath);
      if (!fileStats.isFile()) {
        return false;
      }
      await removePath(absoluteFilePath, {force: true});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove one directory recursively if it exists under basePath.
   * @param {string} directoryPath
   * @param {string} basePath
   * @return {Promise<boolean>}
   * @private
   */
  async removeDirectoryIfExists(directoryPath, basePath) {
    if (!directoryPath || !basePath) {
      return false;
    }
    const absoluteDirectoryPath = resolve(directoryPath);
    if (!isPathInside(basePath, absoluteDirectoryPath)) {
      return false;
    }
    try {
      const directoryStats = await stat(absoluteDirectoryPath);
      if (!directoryStats.isDirectory()) {
        return false;
      }
      await removePath(absoluteDirectoryPath, {
        recursive: true,
        force: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve git hash for tagging runs.
   * @return {Promise<string>}
   * @private
   */
  async resolveGitHash() {
    return new Promise((resolveHash) => {
      this.execFile(
        GIT_HASH_COMMAND,
        GIT_HASH_ARGS,
        {cwd: this.workspaceRoot},
        (error, stdout) => {
          if (error) {
            resolveHash(GIT_HASH_FALLBACK);
            return;
          }
          const hash = String(stdout || EMPTY_STRING).trim();
          resolveHash(hash || GIT_HASH_FALLBACK);
        },
      );
    });
  }

  /**
   * Build progress payload shape.
   * @param {Object} input
   * @param {string} input.phase
   * @param {string} input.message
   * @param {number} input.percent
   * @return {Object}
   * @private
   */
  buildProgressPayload(input) {
    return {
      phase: input?.phase || RUN_PROGRESS_PHASE.STARTING,
      message: input?.message || EMPTY_STRING,
      percent: Math.max(0, Math.min(100, Number(input?.percent || 0))),
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  /**
   * Update run progress and publish progress stream event on change.
   * @param {Object} run
   * @param {Object} progressUpdate
   * @return {boolean}
   * @private
   */
  updateRunProgress(run, progressUpdate) {
    const previous = run.progress || {};
    const next = this.buildProgressPayload({
      phase: progressUpdate?.phase || previous.phase,
      message: progressUpdate?.message || previous.message,
      percent: progressUpdate?.percent ?? previous.percent ?? 0,
    });

    const changed = previous.phase !== next.phase ||
      previous.message !== next.message ||
      previous.percent !== next.percent;

    run.progress = next;
    if (changed) {
      this.publishEvent(run, {
        type: ADMIN_TEST_STREAM_EVENT.PROGRESS,
        data: next,
      });
    }
    return changed;
  }

  /**
   * Infer progress updates from runner stdout/stderr lines.
   * @param {Object} run
   * @param {string} stream
   * @param {string} line
   * @private
   */
  updateRunProgressFromLog(run, stream, line) {
    const update = inferProgressFromLog(
      stream, line, run.progress, run.scenario,
    );
    if (update) {
      this.updateRunProgress(run, update);
    }
  }

  /**
   * Build per-run playback output root.
   * @param {string|null} runId
   * @return {string}
   * @private
   */
  buildRunPlaybackOutputDir(runId) {
    return buildRunPlaybackOutputDir(runId);
  }

  /**
   * Build scenario output directory.
   * @param {string|null} scenarioName
   * @param {string|null} runId
   * @return {string|null}
   * @private
   */
  buildScenarioOutputDir(scenarioName, runId = null) {
    return buildScenarioOutputDir(scenarioName, runId);
  }

  /**
   * Build standard playback file paths for a scenario.
   * @param {string|null} scenarioName
   * @param {string|null} runId
   * @return {{
   *   eventsPath: string,
   *   samplesPath: string,
   *   snapshotsPath: string,
   *   manifestPath: string,
   * }|null}
   * @private
   */
  buildScenarioPlaybackPaths(scenarioName, runId = null) {
    return buildScenarioPlaybackPaths(scenarioName, runId);
  }

  /**
   * Build playback viewer URL for live follow mode.
   * @param {Object} payload
   * @param {Object} [options]
   * @return {string|null}
   * @private
   */
  buildLivePlaybackViewerUrl(payload, options = {}) {
    return buildLivePlaybackViewerUrl(payload, options);
  }

  /**
   * Capture stdout/stderr stream data and split by line.
   * @param {Object} run
   * @param {string} stream
   * @param {Buffer|string} chunk
   * @private
   */
  captureRunOutput(run, stream, chunk) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString(FILE_ENCODING) : String(chunk);
    const remainderKey = stream === ADMIN_TEST_LOG_STREAM.STDOUT ?
      'stdoutRemainder' : 'stderrRemainder';
    const combined = `${run[remainderKey]}${text}`;
    const parts = combined.split(CLEAN_LINE_BREAK_REGEX);
    run[remainderKey] = parts.pop() || EMPTY_STRING;

    for (const rawLine of parts) {
      const line = rawLine.replace(TRIM_CRLF_REGEX, EMPTY_STRING);
      if (!line) {
        continue;
      }
      this.appendRunLog(run, stream, line);
    }
  }

  /**
   * Append one log line for a run and notify subscribers.
   * @param {Object} run
   * @param {string} stream
   * @param {string} line
   * @private
   */
  appendRunLog(run, stream, line) {
    const entry = {
      timestamp: new Date(this.now()).toISOString(),
      stream,
      line,
    };
    run.logBuffer.push(entry);
    if (run.logBuffer.length > ADMIN_TEST_DEFAULT.LOG_LINE_LIMIT) {
      run.logBuffer.shift();
    }

    this.publishEvent(run, {
      type: ADMIN_TEST_STREAM_EVENT.LOG,
      data: entry,
    });

    this.updateRunProgressFromLog(run, stream, line);
  }

  /**
   * Finalize run status and persist metadata.
   * @param {Object} run
   * @param {number|null} code
   * @param {string|null} signal
   * @return {Promise<void>}
   * @private
   */
  async finalizeRun(run, code, signal) {
    if (run.stdoutRemainder) {
      this.appendRunLog(
        run,
        ADMIN_TEST_LOG_STREAM.STDOUT,
        run.stdoutRemainder,
      );
      run.stdoutRemainder = EMPTY_STRING;
    }
    if (run.stderrRemainder) {
      this.appendRunLog(
        run,
        ADMIN_TEST_LOG_STREAM.STDERR,
        run.stderrRemainder,
      );
      run.stderrRemainder = EMPTY_STRING;
    }

    run.exitCode = typeof code === 'number' ? code : null;
    run.signal = signal || null;
    run.endedAt = new Date(this.now()).toISOString();
    run.childProcess = null;
    const finalizationSnapshot = buildRunFinalizationSnapshot(run, run.exitCode);
    const finalizationState = resolveRunFinalizationState(finalizationSnapshot);
    const finalizationOutcome = buildRunFinalizationOutcome(finalizationState);
    run.status = finalizationOutcome.status;
    this.updateRunProgress(run, finalizationOutcome.progress);

    const reportSummary = await this.getReportSummary(
      run.outputReportPath,
      run.runId,
    );
    run.playbackManifestPath = reportSummary.playbackManifestPath ||
      run.playbackManifestPath ||
      null;
    run.playbackManifestUrl = reportSummary.playbackManifestUrl ||
      run.playbackManifestUrl ||
      null;
    run.playbackViewerUrl = reportSummary.playbackViewerUrl ||
      run.playbackViewerUrl ||
      run.livePlaybackViewerUrl ||
      null;
    run.playbackEventsPath = reportSummary.playbackEventsPath ||
      run.playbackEventsPath ||
      null;
    run.playbackSamplesPath = reportSummary.playbackSamplesPath ||
      run.playbackSamplesPath ||
      null;
    run.playbackSnapshotsPath = reportSummary.playbackSnapshotsPath ||
      run.playbackSnapshotsPath ||
      null;
    run.playbackEventsUrl = reportSummary.playbackEventsUrl ||
      run.playbackEventsUrl ||
      null;
    run.playbackSamplesUrl = reportSummary.playbackSamplesUrl ||
      run.playbackSamplesUrl ||
      null;
    run.playbackSnapshotsUrl = reportSummary.playbackSnapshotsUrl ||
      run.playbackSnapshotsUrl ||
      null;
    run.summary = reportSummary.summary || run.summary || null;
    run.examplesSummary = reportSummary.examplesSummary ||
      run.examplesSummary ||
      null;
    run.examplesArtifactPath = reportSummary.examplesArtifactPath ||
      run.examplesArtifactPath ||
      null;
    run.examplesArtifactUrl = reportSummary.examplesArtifactUrl ||
      run.examplesArtifactUrl ||
      null;

    await this.persistRunMetadata(run);
    this.publishStatus(run);
  }

  /**
   * Notify subscribers with status event.
   * @param {Object} run
   * @private
   */
  publishStatus(run) {
    this.publishEvent(run, {
      type: ADMIN_TEST_STREAM_EVENT.STATUS,
      data: this.serializeRun(run),
    });
  }

  /**
   * Publish one event to run subscribers.
   * @param {Object} run
   * @param {Object} event
   * @private
   */
  publishEvent(run, event) {
    for (const subscriber of run.subscribers) {
      try {
        subscriber(event);
      } catch {
        // Ignore subscriber errors and continue.
      }
    }
  }

  /**
   * Persist run metadata under test-output metadata directory.
   * @param {Object} run
   * @return {Promise<void>}
   * @private
   */
  async persistRunMetadata(run) {
    await mkdir(this.metadataDir, {recursive: true});

    const metadata = {
      schemaVersion: METADATA_SCHEMA_VERSION,
      runId: run.runId,
      scenario: run.scenario,
      config: run.config,
      gitHash: run.gitHash,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      status: run.status,
      outputReportPath: run.outputReportPath,
      exitCode: run.exitCode,
      signal: run.signal,
      playbackManifestPath: run.playbackManifestPath,
      playbackEventsPath: run.playbackEventsPath || null,
      playbackSamplesPath: run.playbackSamplesPath || null,
      playbackSnapshotsPath: run.playbackSnapshotsPath || null,
      progress: run.progress || null,
      summary: run.summary || null,
      examplesSummary: run.examplesSummary || null,
      examplesArtifactPath: run.examplesArtifactPath || null,
    };

    const metadataPath = this.resolveMetadataFilePath(run.runId);
    await writeFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      FILE_ENCODING,
    );
  }

  /**
   * Build metadata file path for one run.
   * @param {string} runId
   * @return {string}
   * @private
   */
  resolveMetadataFilePath(runId) {
    return resolve(
      this.metadataDir,
      `${METADATA_FILENAME_PREFIX}${runId}${METADATA_FILE_EXTENSION}`,
    );
  }

  /**
   * Convert internal run object into API shape.
   * @param {Object} run
   * @param {Object} [options]
   * @param {boolean} [options.includeLogs]
   * @return {Object}
   * @private
   */
  serializeRun(run, options = {}) {
    return serializeRun(
      run, options, this.outputDir, this.workspaceRoot,
    );
  }

  /**
   * Normalize a workspace-relative path and ensure it is under output dir.
   * @param {string|null} maybePath
   * @return {string|null}
   * @private
   */
  normalizeWorkspaceRelativePath(maybePath) {
    return normalizeWorkspaceRelativePath(
      maybePath, this.outputDir, this.workspaceRoot,
    );
  }

  /**
   * Build playback viewer URL for a manifest path.
   * @param {string} manifestPath
   * @return {string}
   * @private
   */
  buildPlaybackViewerUrl(manifestPath) {
    return buildPlaybackViewerUrl(
      manifestPath, this.outputDir, this.workspaceRoot,
    );
  }

  /**
   * Convert output-relative path to HTTP URL path.
   * @param {string|null} outputRelativePath
   * @return {string|null}
   * @private
   */
  toOutputWebPath(outputRelativePath) {
    return toOutputWebPath(
      outputRelativePath, this.outputDir, this.workspaceRoot,
    );
  }
}

export {AdminTestRunService};
