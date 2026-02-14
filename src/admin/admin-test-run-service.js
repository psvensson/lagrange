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
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import {URL, URLSearchParams} from 'node:url';
import {
  ADMIN_CONTENT_TYPE,
  ADMIN_ROUTE,
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_LOG_STREAM,
  ADMIN_TEST_RUN_PATH,
  ADMIN_TEST_RUN_STATUS,
  ADMIN_TEST_STREAM_EVENT,
} from './admin-constants.js';

const FILE_ENCODING = 'utf8';
const REPORT_TIMESTAMP_FALLBACK_MS = 0;
const PROCESS_EXIT_SUCCESS = 0;
const METADATA_FILE_EXTENSION = '.json';
const PATH_SEPARATOR_WEB = '/';
const CLEAN_LINE_BREAK_REGEX = /\r?\n/;
const TRIM_CRLF_REGEX = /\r$/;
const LEADING_SLASH_REGEX = /^\/+/;
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
const OUTPUT_ROUTE_PREFIX =
  ADMIN_ROUTE.OUTPUT_FILES.substring(
    REPORT_TIMESTAMP_FALLBACK_MS,
    ADMIN_ROUTE.OUTPUT_FILES.length - 1,
  );
const PLAYBACK_MANIFEST_QUERY_KEY = 'manifest';
const PLAYBACK_RUN_START_QUERY_KEY = 'runStartMs';
const DEFAULT_STDIO = 'pipe';
const SIGNAL_STOP = ADMIN_TEST_DEFAULT.SIGNAL_TERM;
const FILE_READ_BYTES_PER_CHUNK = 65536;
const BUFFER_ENCODING = 'utf8';
const RUN_PROGRESS_PHASE = Object.freeze({
  STARTING: 'starting',
  BUILDING_IMAGE: 'building-image',
  SCENARIO_RUNNING: 'scenario-running',
  STOPPING: 'stopping',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped',
});
const RUN_PROGRESS_PATTERN = Object.freeze({
  CONFIG_LOADING: /^Loading config:/i,
  CONFIG_LOADED: /^Config loaded:/i,
  SCENARIO_DISCOVERY: /^Discovering scenarios/i,
  SCENARIO_FOUND: /^Found \d+ scenario\(s\)/i,
  BUILD_START: /^Building Docker image/i,
  BUILD_DONE: /^Image built:/i,
  SCENARIO_START: /^Running scenario:\s*(.+)$/i,
  SCENARIO_PASSED: /^Scenario passed:/i,
  SCENARIO_FAILED: /^Scenario failed:/i,
});
const RUN_CONFIG_MODE = Object.freeze({
  LOCAL: 'local',
  REMOTE: 'remote',
});
const RUN_PROGRESS_PERCENT = Object.freeze({
  CONFIG_LOADING: 2,
  CONFIG_LOADED: 4,
  PRECHECK_COMPLETE: 6,
  SCENARIO_DISCOVERY: 25,
  SCENARIO_FOUND: 30,
});
const CONFIG_PRECHECK_ERROR_PREFIX =
  `${ADMIN_TEST_ERROR_MSG.CONFIG_PREFLIGHT_FAILED}: `;
const DOCKER_HOST_PROTOCOL_SEPARATOR = '://';
const DOCKER_HOST_PATH_SEPARATOR = '/';
const DOCKER_HOST_PORT_SEPARATOR = ':';
const DOCKER_HOST_IPV6_PREFIX = '[';
const DOCKER_HOST_IPV6_SUFFIX = ']';
const RUN_PLAYBACK_OUTPUT_DIRNAME = '.playback';

const FILE_EXTENSION_CONTENT_TYPE = Object.freeze({
  '.html': ADMIN_CONTENT_TYPE.HTML,
  '.json': ADMIN_CONTENT_TYPE.JSON,
  '.ndjson': ADMIN_CONTENT_TYPE.NDJSON,
  '.js': ADMIN_CONTENT_TYPE.JAVASCRIPT,
  '.css': ADMIN_CONTENT_TYPE.CSS,
  '.log': ADMIN_CONTENT_TYPE.TEXT,
  '.txt': ADMIN_CONTENT_TYPE.TEXT,
});

/**
 * Normalize a path to web slash separators.
 * @param {string} value
 * @return {string}
 */
function normalizeWebPath(value) {
  return String(value).split(sep).join(PATH_SEPARATOR_WEB);
}

/**
 * Returns true if targetPath is inside basePath.
 * @param {string} basePath
 * @param {string} targetPath
 * @return {boolean}
 */
function isPathInside(basePath, targetPath) {
  if (targetPath === basePath) {
    return true;
  }
  return targetPath.startsWith(`${basePath}${sep}`);
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
 * Returns true for active/in-flight run states.
 * @param {string} status
 * @return {boolean}
 */
function isRunStatusActive(status) {
  return status === ADMIN_TEST_RUN_STATUS.RUNNING ||
    status === ADMIN_TEST_RUN_STATUS.STOPPING ||
    status === ADMIN_TEST_RUN_STATUS.PENDING;
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
      return {
        mode: RUN_CONFIG_MODE.LOCAL,
        socketPath: String(docker.socketPath || EMPTY_STRING).trim() || null,
        hosts: [],
      };
    }

    for (const host of hosts) {
      const hostname = this.parseDockerHostname(host);
      if (!hostname) {
        throw new Error(
          `${CONFIG_PRECHECK_ERROR_PREFIX}` +
          `invalid docker host "${host}" in config "${configName}"`,
        );
      }
      try {
        await this.resolveHost(hostname);
      } catch (error) {
        throw new Error(
          `${CONFIG_PRECHECK_ERROR_PREFIX}` +
          `docker host "${host}" from config "${configName}"` +
          ` is not resolvable: ${error.message}`,
        );
      }
    }

    return {
      mode: RUN_CONFIG_MODE.REMOTE,
      socketPath: null,
      hosts,
    };
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
    const safeRelative = decodeURIComponent(
      String(wildcardPath || EMPTY_STRING)
        .replace(LEADING_SLASH_REGEX, EMPTY_STRING),
    );
    const absolutePath = resolve(this.outputDir, safeRelative);
    if (!isPathInside(this.outputDir, absolutePath)) {
      return null;
    }
    return absolutePath;
  }

  /**
   * Guess HTTP content type by filename extension.
   * @param {string} filePath
   * @return {string}
   */
  getContentType(filePath) {
    const extension = extname(filePath).toLowerCase();
    return FILE_EXTENSION_CONTENT_TYPE[extension] || ADMIN_CONTENT_TYPE.TEXT;
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
    const paths = [];
    const seen = new Set();
    const addPath = (pathValue) => {
      if (!pathValue || seen.has(pathValue)) {
        return;
      }
      seen.add(pathValue);
      paths.push(pathValue);
    };

    const normalizedManifestPath = this.normalizeWorkspaceRelativePath(
      runRecord?.playbackManifestPath || null,
    );
    if (normalizedManifestPath) {
      const manifestDir = dirname(normalizedManifestPath);
      addPath(resolve(
        this.workspaceRoot,
        manifestDir,
        ADMIN_TEST_DEFAULT.TIMELINE_FILENAME,
      ));
    }

    const runScopedScenarioDir = this.buildScenarioOutputDir(
      runRecord?.scenario || null,
      runRecord?.runId || null,
    );
    if (runScopedScenarioDir) {
      addPath(resolve(
        this.workspaceRoot,
        runScopedScenarioDir,
        ADMIN_TEST_DEFAULT.TIMELINE_FILENAME,
      ));
    }

    if (runRecord?.scenario) {
      addPath(resolve(
        this.outputDir,
        runRecord.scenario,
        ADMIN_TEST_DEFAULT.TIMELINE_FILENAME,
      ));
    }

    return paths;
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
    const scenarios = Array.isArray(report.scenarios) ?
      report.scenarios : [];
    const firstScenario = scenarios.length > 0 ? scenarios[0] : null;
    const scenarioName = firstScenario?.scenario || null;
    const startedAt = firstScenario?.startedAt ||
      report.timestamp ||
      (reportStats ? reportStats.mtime.toISOString() : null);
    const endedAt = report.timestamp ||
      (reportStats ? reportStats.mtime.toISOString() : null);
    const failed = Number(report.summary?.failed || REPORT_TIMESTAMP_FALLBACK_MS);
    const status = failed > REPORT_TIMESTAMP_FALLBACK_MS ?
      ADMIN_TEST_RUN_STATUS.FAILED :
      ADMIN_TEST_RUN_STATUS.PASSED;

    const outputReportPath = join(
      ADMIN_TEST_RUN_PATH.OUTPUT_DIR,
      `${runId}${ADMIN_TEST_DEFAULT.REPORT_EXTENSION}`,
    );

    const manifestPathFromReport = this.resolvePlaybackManifestPath(firstScenario);
    const reportPlaybackPaths = this.buildScenarioPlaybackPaths(scenarioName, runId);
    const normalizedManifestPath =
      this.normalizeWorkspaceRelativePath(manifestPathFromReport) ||
      reportPlaybackPaths?.manifestPath ||
      null;
    const playbackEventsPath = reportPlaybackPaths?.eventsPath || null;
    const playbackSamplesPath = reportPlaybackPaths?.samplesPath || null;
    const playbackSnapshotsPath = reportPlaybackPaths?.snapshotsPath || null;
    const playbackEventsUrl = this.toOutputWebPath(playbackEventsPath);
    const playbackSamplesUrl = this.toOutputWebPath(playbackSamplesPath);
    const playbackSnapshotsUrl = this.toOutputWebPath(playbackSnapshotsPath);
    const livePlaybackViewerUrl = this.buildLivePlaybackViewerUrl(
      {
        eventsUrl: playbackEventsUrl,
        samplesUrl: playbackSamplesUrl,
        snapshotsUrl: playbackSnapshotsUrl,
      },
      {
        follow: false,
        autoplay: false,
        runId,
        runStartMs: Date.parse(startedAt || EMPTY_STRING) || null,
      },
    );
    const progressMessage = status === ADMIN_TEST_RUN_STATUS.PASSED ?
      'Run completed successfully' :
      'Run failed';

    return {
      runId,
      scenario: scenarioName,
      config: null,
      startedAt,
      endedAt,
      status,
      gitHash: null,
      outputReportPath,
      outputReportUrl: this.toOutputWebPath(outputReportPath),
      playbackManifestPath: normalizedManifestPath,
      playbackManifestUrl: normalizedManifestPath ?
        this.toOutputWebPath(normalizedManifestPath) : null,
      playbackEventsPath,
      playbackSamplesPath,
      playbackSnapshotsPath,
      playbackEventsUrl,
      playbackSamplesUrl,
      playbackSnapshotsUrl,
      playbackViewerUrl: normalizedManifestPath ?
        this.buildPlaybackViewerUrl(normalizedManifestPath) : null,
      livePlaybackViewerUrl,
      progress: {
        phase: status === ADMIN_TEST_RUN_STATUS.PASSED ?
          RUN_PROGRESS_PHASE.COMPLETED :
          RUN_PROGRESS_PHASE.FAILED,
        message: progressMessage,
        percent: 100,
        updatedAt: endedAt || startedAt || new Date(this.now()).toISOString(),
      },
      summary: report.summary || null,
    };
  }

  /**
   * Resolve playback manifest path from report scenario payload.
   * Supports both legacy and current playback shapes.
   * @param {Object|null} scenario
   * @return {string|null}
   * @private
   */
  resolvePlaybackManifestPath(scenario) {
    const playback = scenario?.playback;
    if (!playback || typeof playback !== 'object') {
      return null;
    }

    const candidates = [
      playback.manifestPath,
      playback.files?.manifest,
      playback.files?.manifestPath,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Merge two run records, preferring defined values from right.
   * @param {Object} left
   * @param {Object} right
   * @return {Object}
   * @private
   */
  mergeRunRecord(left, right) {
    const merged = {...left};
    for (const [key, value] of Object.entries(right || {})) {
      if (value !== undefined && value !== null && value !== EMPTY_STRING) {
        merged[key] = value;
      } else if (!(key in merged)) {
        merged[key] = value;
      }
    }

    const scenarioPlaybackPaths = this.buildScenarioPlaybackPaths(
      merged.scenario,
      merged.runId || null,
    );
    if (!merged.playbackManifestPath && scenarioPlaybackPaths?.manifestPath) {
      merged.playbackManifestPath = scenarioPlaybackPaths.manifestPath;
    }
    if (!merged.playbackEventsPath && scenarioPlaybackPaths?.eventsPath) {
      merged.playbackEventsPath = scenarioPlaybackPaths.eventsPath;
    }
    if (!merged.playbackSamplesPath && scenarioPlaybackPaths?.samplesPath) {
      merged.playbackSamplesPath = scenarioPlaybackPaths.samplesPath;
    }
    if (!merged.playbackSnapshotsPath && scenarioPlaybackPaths?.snapshotsPath) {
      merged.playbackSnapshotsPath = scenarioPlaybackPaths.snapshotsPath;
    }

    if (!merged.playbackManifestUrl) {
      merged.playbackManifestUrl = this.toOutputWebPath(merged.playbackManifestPath);
    }
    if (!merged.playbackEventsUrl) {
      merged.playbackEventsUrl = this.toOutputWebPath(merged.playbackEventsPath);
    }
    if (!merged.playbackSamplesUrl) {
      merged.playbackSamplesUrl = this.toOutputWebPath(merged.playbackSamplesPath);
    }
    if (!merged.playbackSnapshotsUrl) {
      merged.playbackSnapshotsUrl = this.toOutputWebPath(merged.playbackSnapshotsPath);
    }

    if (!merged.playbackViewerUrl && merged.playbackManifestPath) {
      merged.playbackViewerUrl = this.buildPlaybackViewerUrl(
        merged.playbackManifestPath,
      );
    }
    if (!merged.livePlaybackViewerUrl) {
      merged.livePlaybackViewerUrl = this.buildLivePlaybackViewerUrl(
        {
          eventsUrl: merged.playbackEventsUrl,
          samplesUrl: merged.playbackSamplesUrl,
          snapshotsUrl: merged.playbackSnapshotsUrl,
        },
        {
          follow: false,
          autoplay: false,
          runId: merged.runId,
          runStartMs: Date.parse(merged.startedAt || EMPTY_STRING) || null,
        },
      );
    }

    if (!merged.progress && merged.status) {
      const isDone = !isRunStatusActive(merged.status);
      merged.progress = this.buildProgressPayload({
        phase: isDone ? RUN_PROGRESS_PHASE.COMPLETED : RUN_PROGRESS_PHASE.SCENARIO_RUNNING,
        message: `Run status: ${merged.status}`,
        percent: isDone ? 100 : 50,
      });
    }
    return merged;
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
    const text = String(line || EMPTY_STRING).trim();
    if (!text) {
      return;
    }

    if (RUN_PROGRESS_PATTERN.CONFIG_LOADING.test(text)) {
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.STARTING,
        message: text,
        percent: Math.max(
          RUN_PROGRESS_PERCENT.CONFIG_LOADING,
          Number(run.progress?.percent || 0),
        ),
      });
      return;
    }

    if (RUN_PROGRESS_PATTERN.CONFIG_LOADED.test(text)) {
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.STARTING,
        message: text,
        percent: Math.max(
          RUN_PROGRESS_PERCENT.CONFIG_LOADED,
          Number(run.progress?.percent || 0),
        ),
      });
      return;
    }

    if (RUN_PROGRESS_PATTERN.SCENARIO_DISCOVERY.test(text)) {
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.STARTING,
        message: text,
        percent: Math.max(
          RUN_PROGRESS_PERCENT.SCENARIO_DISCOVERY,
          Number(run.progress?.percent || 0),
        ),
      });
      return;
    }

    if (RUN_PROGRESS_PATTERN.SCENARIO_FOUND.test(text)) {
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.STARTING,
        message: text,
        percent: Math.max(
          RUN_PROGRESS_PERCENT.SCENARIO_FOUND,
          Number(run.progress?.percent || 0),
        ),
      });
      return;
    }

    if (RUN_PROGRESS_PATTERN.BUILD_START.test(text)) {
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.BUILDING_IMAGE,
        message: 'Building Docker image',
        percent: Math.max(5, Number(run.progress?.percent || 0)),
      });
      return;
    }

    if (RUN_PROGRESS_PATTERN.BUILD_DONE.test(text)) {
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.BUILDING_IMAGE,
        message: text,
        percent: Math.max(20, Number(run.progress?.percent || 0)),
      });
      return;
    }

    const scenarioStartMatch = text.match(RUN_PROGRESS_PATTERN.SCENARIO_START);
    if (scenarioStartMatch) {
      const scenarioLabel = scenarioStartMatch[1] || run.scenario || 'scenario';
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.SCENARIO_RUNNING,
        message: `Running ${scenarioLabel}`,
        percent: Math.max(35, Number(run.progress?.percent || 0)),
      });
      return;
    }

    if (RUN_PROGRESS_PATTERN.SCENARIO_PASSED.test(text)) {
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.SCENARIO_RUNNING,
        message: text,
        percent: Math.max(95, Number(run.progress?.percent || 0)),
      });
      return;
    }

    if (RUN_PROGRESS_PATTERN.SCENARIO_FAILED.test(text)) {
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.FAILED,
        message: text,
        percent: Math.max(95, Number(run.progress?.percent || 0)),
      });
      return;
    }

    if (stream === ADMIN_TEST_LOG_STREAM.STDERR &&
      Number(run.progress?.percent || 0) < 90) {
      this.updateRunProgress(run, {
        phase: run.progress?.phase || RUN_PROGRESS_PHASE.SCENARIO_RUNNING,
        message: text,
        percent: Math.max(40, Number(run.progress?.percent || 0)),
      });
    }
  }

  /**
   * Build per-run playback output root.
   * @param {string|null} runId
   * @return {string}
   * @private
   */
  buildRunPlaybackOutputDir(runId) {
    const trimmedRunId = typeof runId === 'string' ? runId.trim() : EMPTY_STRING;
    if (!trimmedRunId) {
      return ADMIN_TEST_RUN_PATH.OUTPUT_DIR;
    }
    return join(
      ADMIN_TEST_RUN_PATH.OUTPUT_DIR,
      RUN_PLAYBACK_OUTPUT_DIRNAME,
      trimmedRunId,
    );
  }

  /**
   * Build scenario output directory.
   * @param {string|null} scenarioName
   * @param {string|null} runId
   * @return {string|null}
   * @private
   */
  buildScenarioOutputDir(scenarioName, runId = null) {
    if (!scenarioName || typeof scenarioName !== 'string') {
      return null;
    }
    return join(
      this.buildRunPlaybackOutputDir(runId),
      scenarioName,
    );
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
    const scenarioOutputDir = this.buildScenarioOutputDir(scenarioName, runId);
    if (!scenarioOutputDir) {
      return null;
    }
    return {
      eventsPath: join(
        scenarioOutputDir,
        ADMIN_TEST_DEFAULT.PLAYBACK_EVENTS_FILENAME,
      ),
      samplesPath: join(
        scenarioOutputDir,
        ADMIN_TEST_DEFAULT.PLAYBACK_SAMPLES_FILENAME,
      ),
      snapshotsPath: join(
        scenarioOutputDir,
        ADMIN_TEST_DEFAULT.PLAYBACK_SNAPSHOTS_FILENAME,
      ),
      manifestPath: join(
        scenarioOutputDir,
        ADMIN_TEST_DEFAULT.PLAYBACK_MANIFEST_FILENAME,
      ),
    };
  }

  /**
   * Build playback viewer URL for live follow mode.
   * @param {Object} payload
   * @param {string|null} payload.eventsUrl
   * @param {string|null} payload.samplesUrl
   * @param {string|null} payload.snapshotsUrl
   * @param {Object} [options]
   * @param {boolean} [options.follow]
   * @param {boolean} [options.autoplay]
   * @param {string} [options.runId]
   * @param {number} [options.runStartMs]
   * @return {string|null}
   * @private
   */
  buildLivePlaybackViewerUrl(payload, options = {}) {
    const params = new URLSearchParams();
    if (payload?.eventsUrl) {
      params.set('events', payload.eventsUrl);
    }
    if (payload?.samplesUrl) {
      params.set('samples', payload.samplesUrl);
    }
    if (payload?.snapshotsUrl) {
      params.set('snapshots', payload.snapshotsUrl);
    }
    if (options.follow) {
      params.set('follow', '1');
    }
    if (options.autoplay) {
      params.set('autoplay', '1');
    }
    if (options.runId) {
      params.set('runId', options.runId);
    }
    if (Number.isFinite(Number(options.runStartMs)) &&
      Number(options.runStartMs) > 0) {
      params.set(
        PLAYBACK_RUN_START_QUERY_KEY,
        String(Math.floor(Number(options.runStartMs))),
      );
    }

    const query = params.toString();
    if (!query) {
      return null;
    }
    return `${ADMIN_ROUTE.PLAYBACK_VIEWER}?${query}`;
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

    if (run.status === ADMIN_TEST_RUN_STATUS.STOPPING) {
      run.status = ADMIN_TEST_RUN_STATUS.STOPPED;
    } else if (run.exitCode === PROCESS_EXIT_SUCCESS) {
      run.status = ADMIN_TEST_RUN_STATUS.PASSED;
    } else {
      run.status = ADMIN_TEST_RUN_STATUS.FAILED;
    }

    if (run.status === ADMIN_TEST_RUN_STATUS.PASSED) {
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.COMPLETED,
        message: 'Run completed successfully',
        percent: 100,
      });
    } else if (run.status === ADMIN_TEST_RUN_STATUS.STOPPED) {
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.STOPPED,
        message: 'Run stopped',
        percent: 100,
      });
    } else {
      this.updateRunProgress(run, {
        phase: RUN_PROGRESS_PHASE.FAILED,
        message: 'Run failed',
        percent: 100,
      });
    }

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
    const payload = {
      runId: run.runId,
      scenario: run.scenario || null,
      config: run.config || null,
      gitHash: run.gitHash || null,
      startedAt: run.startedAt || null,
      endedAt: run.endedAt || null,
      status: run.status || null,
      outputReportPath: run.outputReportPath || null,
      outputReportUrl: run.outputReportUrl ||
        this.toOutputWebPath(run.outputReportPath),
      playbackManifestPath: run.playbackManifestPath || null,
      playbackManifestUrl: run.playbackManifestUrl || null,
      playbackViewerUrl: run.playbackViewerUrl || null,
      playbackEventsPath: run.playbackEventsPath || null,
      playbackSamplesPath: run.playbackSamplesPath || null,
      playbackSnapshotsPath: run.playbackSnapshotsPath || null,
      playbackEventsUrl: run.playbackEventsUrl || null,
      playbackSamplesUrl: run.playbackSamplesUrl || null,
      playbackSnapshotsUrl: run.playbackSnapshotsUrl || null,
      livePlaybackViewerUrl: run.livePlaybackViewerUrl || null,
      exitCode: run.exitCode ?? null,
      signal: run.signal || null,
      pid: run.pid || null,
      progress: run.progress || null,
      summary: run.summary || null,
    };
    if (options.includeLogs) {
      payload.logs = Array.isArray(run.logBuffer) ? [...run.logBuffer] : [];
    }
    return payload;
  }

  /**
   * Normalize a workspace-relative path and ensure it is under output dir.
   * @param {string|null} maybePath
   * @return {string|null}
   * @private
   */
  normalizeWorkspaceRelativePath(maybePath) {
    if (!maybePath || typeof maybePath !== 'string') {
      return null;
    }
    const absolutePath = resolve(this.workspaceRoot, maybePath);
    if (!isPathInside(this.outputDir, absolutePath)) {
      return null;
    }
    return normalizeWebPath(
      relative(this.workspaceRoot, absolutePath),
    );
  }

  /**
   * Build playback viewer URL for a manifest path.
   * @param {string} manifestPath
   * @return {string}
   * @private
   */
  buildPlaybackViewerUrl(manifestPath) {
    const manifestUrl = this.toOutputWebPath(manifestPath);
    if (!manifestUrl) {
      return null;
    }
    const encodedManifest = encodeURIComponent(manifestUrl);
    return `${ADMIN_ROUTE.PLAYBACK_VIEWER}?` +
      `${PLAYBACK_MANIFEST_QUERY_KEY}=${encodedManifest}`;
  }

  /**
   * Convert output-relative path to HTTP URL path.
   * @param {string|null} outputRelativePath
   * @return {string|null}
   * @private
   */
  toOutputWebPath(outputRelativePath) {
    if (!outputRelativePath || typeof outputRelativePath !== 'string') {
      return null;
    }

    const absolutePath = resolve(this.workspaceRoot, outputRelativePath);
    if (!isPathInside(this.outputDir, absolutePath)) {
      return null;
    }
    const relativeOutputPath = normalizeWebPath(
      relative(this.outputDir, absolutePath),
    );
    return `${OUTPUT_ROUTE_PREFIX}${relativeOutputPath}`;
  }
}

export {AdminTestRunService};
