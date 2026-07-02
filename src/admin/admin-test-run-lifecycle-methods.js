/**
 * Live-run lifecycle methods for AdminTestRunService.
 */

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_LOG_STREAM,
  ADMIN_TEST_RUN_PATH,
  ADMIN_TEST_RUN_STATUS,
  ADMIN_TEST_STREAM_EVENT,
} from './admin-constants.js';
import {
  inferProgressFromLog,
  RUN_PROGRESS_PERCENT,
  RUN_PROGRESS_PHASE,
} from './admin-test-run-progress.js';
import {buildAdminTestRunServiceHelpers} from './admin-test-run-service-helpers.js';

const LOCAL_STR_VERBOSE = '--verbose';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_DATA = 'data';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_CLOSE = 'close';
const LOCAL_STR_STOP_REQUESTED = 'Stop requested';
const LOCAL_NUM_NINETY = 90;
const LOCAL_NUM_ONE_HUNDRED = 100;
const LOCAL_STR_NUMBER = 'number';

const FILE_ENCODING = 'utf8';
const PROCESS_EXIT_SUCCESS = 0;
const CLEAN_LINE_BREAK_REGEX = /\r?\n/;
const TRIM_CRLF_REGEX = /\r$/;
const RUN_ID_SANITIZE_REGEX = /[^a-zA-Z0-9._-]/g;
const RUN_TIMESTAMP_CHAR_REGEX = /[-:.]/g;
const RUN_TIMESTAMP_REPLACEMENT = '';
const METADATA_SCHEMA_VERSION = 1;
const GIT_HASH_COMMAND = 'git';
const GIT_HASH_ARGS = Object.freeze(['rev-parse', '--short', 'HEAD']);
const GIT_HASH_FALLBACK = ADMIN_TEST_DEFAULT.GIT_HASH_UNKNOWN;
const EMPTY_STRING = '';
const DEFAULT_STDIO = 'pipe';
const SIGNAL_STOP = ADMIN_TEST_DEFAULT.SIGNAL_TERM;
const RUN_CONFIG_MODE = Object.freeze({LOCAL: 'local', REMOTE: 'remote'});
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

const {
  buildRunFinalizationOutcome,
  buildRunFinalizationSnapshot,
  buildRunId,
  resolveRunFinalizationState,
} = buildAdminTestRunServiceHelpers({
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_RUN_STATUS,
  CONFIG_PRECHECK_STATE,
  FILE_ENCODING,
  GIT_HASH_FALLBACK,
  PROCESS_EXIT_SUCCESS,
  RUN_CONFIG_MODE,
  RUN_FINALIZATION_STATE,
  RUN_ID_SANITIZE_REGEX,
  RUN_PROGRESS_PHASE,
  RUN_TIMESTAMP_CHAR_REGEX,
  RUN_TIMESTAMP_REPLACEMENT,
  readFile,
});

const adminTestRunLifecycleMethods = Object.freeze({
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
      args.push(LOCAL_STR_VERBOSE);
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

    if (child.stdout && typeof child.stdout.on === LOCAL_STR_FUNCTION) {
      child.stdout.on(LOCAL_STR_DATA, (chunk) => {
        this.captureRunOutput(run, ADMIN_TEST_LOG_STREAM.STDOUT, chunk);
      });
    }

    if (child.stderr && typeof child.stderr.on === LOCAL_STR_FUNCTION) {
      child.stderr.on(LOCAL_STR_DATA, (chunk) => {
        this.captureRunOutput(run, ADMIN_TEST_LOG_STREAM.STDERR, chunk);
      });
    }

    child.on(LOCAL_STR_ERROR, (error) => {
      this.appendRunLog(
        run,
        ADMIN_TEST_LOG_STREAM.SYSTEM,
        error.message,
      );
    });

    child.on(LOCAL_STR_CLOSE, (code, signal) => {
      void this.finalizeRun(run, code, signal);
    });

    return this.serializeRun(run);
  },

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
      message: LOCAL_STR_STOP_REQUESTED,
      percent: Math.max(LOCAL_NUM_NINETY, Number(run.progress?.percent || 0)),
    });
    this.publishStatus(run);
    await this.persistRunMetadata(run);

    run.childProcess.kill(SIGNAL_STOP);
    return this.serializeRun(run);
  },

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
  },

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
  },

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
      percent: Math.max(
        0,
        Math.min(LOCAL_NUM_ONE_HUNDRED, Number(input?.percent || 0)),
      ),
      updatedAt: new Date(this.now()).toISOString(),
    };
  },

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
  },

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
  },

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
  },

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
  },

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

    run.exitCode = typeof code === LOCAL_STR_NUMBER ? code : null;
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
  },

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
  },

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
  },

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
  },
});

export {adminTestRunLifecycleMethods};
