/**
 * Report extraction and run record merging for admin test runs.
 * Owns report JSON parsing, run record serialization, and
 * record merging logic.
 */

import {join} from 'node:path';
import {
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_RUN_PATH,
  ADMIN_TEST_RUN_STATUS,
} from './admin-constants.js';
import {
  buildLivePlaybackViewerUrl,
  buildPlaybackViewerUrl,
  buildScenarioPlaybackPaths,
  normalizeWorkspaceRelativePath,
  toOutputWebPath,
} from './admin-test-run-paths.js';
import {RUN_PROGRESS_PHASE} from './admin-test-run-progress.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';

const EMPTY_STRING = '';
const REPORT_TIMESTAMP_FALLBACK_MS = 0;
const FULL_PERCENT = 100;
const HALF_PERCENT = 50;

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
 * Resolve playback manifest path from report scenario payload.
 * @param {Object|null} scenario
 * @return {string|null}
 */
function resolvePlaybackManifestPath(scenario) {
  const playback = scenario?.playback;
  if (!playback || typeof playback !== LOCAL_STR_OBJECT) {
    return null;
  }

  const candidates = [
    playback.manifestPath,
    playback.files?.manifest,
    playback.files?.manifestPath,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === LOCAL_STR_STRING && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

/**
 * Extract examples summary payload from report scenarios.
 * @param {Array<Object>} scenarios
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {{summary: Object|null, artifactPath: string|null}}
 */
function extractExamplesPayload(
  scenarios, outputDir, workspaceRoot,
) {
  const fallback = {summary: null, artifactPath: null};
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return fallback;
  }

  let summary = null;
  let artifactPath = null;
  for (const scenario of scenarios) {
    if (!summary && scenario?.exampleResults &&
      typeof scenario.exampleResults === LOCAL_STR_OBJECT) {
      summary = scenario.exampleResults;
    }
    const details = scenario?.details;
    if (!summary && details?.exampleResults &&
      typeof details.exampleResults === LOCAL_STR_OBJECT) {
      summary = details.exampleResults;
    }
    if (!artifactPath &&
      typeof details?.artifactPath === LOCAL_STR_STRING) {
      artifactPath = details.artifactPath;
    }
  }

  return {
    summary: summary || null,
    artifactPath: normalizeWorkspaceRelativePath(
      artifactPath, outputDir, workspaceRoot,
    ),
  };
}

/**
 * Build playback URL fields for a run record.
 * @param {Object} record - Partial run record with path fields.
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {Object} URL fields to merge into the record.
 */
function buildPlaybackUrls(record, outputDir, workspaceRoot) {
  const eventsUrl = toOutputWebPath(
    record.playbackEventsPath, outputDir, workspaceRoot,
  );
  const samplesUrl = toOutputWebPath(
    record.playbackSamplesPath, outputDir, workspaceRoot,
  );
  const snapshotsUrl = toOutputWebPath(
    record.playbackSnapshotsPath, outputDir, workspaceRoot,
  );
  const manifestUrl = record.playbackManifestPath ?
    toOutputWebPath(
      record.playbackManifestPath, outputDir, workspaceRoot,
    ) : null;
  const viewerUrl = record.playbackManifestPath ?
    buildPlaybackViewerUrl(
      record.playbackManifestPath, outputDir, workspaceRoot,
    ) : null;
  const liveViewerUrl = buildLivePlaybackViewerUrl(
    {eventsUrl, samplesUrl, snapshotsUrl},
    {
      follow: false,
      autoplay: false,
      runId: record.runId,
      runStartMs: Date.parse(
        record.startedAt || EMPTY_STRING,
      ) || null,
    },
  );

  return {
    playbackEventsUrl: eventsUrl,
    playbackSamplesUrl: samplesUrl,
    playbackSnapshotsUrl: snapshotsUrl,
    playbackManifestUrl: manifestUrl,
    playbackViewerUrl: viewerUrl,
    livePlaybackViewerUrl: liveViewerUrl,
  };
}

/**
 * Parse report JSON into run summary.
 * @param {Object} report
 * @param {string} runId
 * @param {Object|null} reportStats
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @param {Function} nowFn - Returns current epoch ms.
 * @return {Object}
 */
function extractReportSummary(
  report, runId, reportStats,
  outputDir, workspaceRoot, nowFn,
) {
  const scenarios = Array.isArray(report.scenarios) ?
    report.scenarios : [];
  const firstScenario = scenarios.length > 0 ?
    scenarios[0] : null;
  const scenarioName = firstScenario?.scenario || null;
  const startedAt = firstScenario?.startedAt ||
    report.timestamp ||
    (reportStats ? reportStats.mtime.toISOString() : null);
  const endedAt = report.timestamp ||
    (reportStats ? reportStats.mtime.toISOString() : null);
  const failed = Number(
    report.summary?.failed || REPORT_TIMESTAMP_FALLBACK_MS,
  );
  const status = failed > REPORT_TIMESTAMP_FALLBACK_MS ?
    ADMIN_TEST_RUN_STATUS.FAILED :
    ADMIN_TEST_RUN_STATUS.PASSED;

  const outputReportPath = join(
    ADMIN_TEST_RUN_PATH.OUTPUT_DIR,
    `${runId}${ADMIN_TEST_DEFAULT.REPORT_EXTENSION}`,
  );

  const manifestFromReport = resolvePlaybackManifestPath(
    firstScenario,
  );
  const playbackPaths = buildScenarioPlaybackPaths(
    scenarioName, runId,
  );
  const normalizedManifest =
    normalizeWorkspaceRelativePath(
      manifestFromReport, outputDir, workspaceRoot,
    ) || playbackPaths?.manifestPath || null;

  const record = {
    runId,
    scenario: scenarioName,
    startedAt,
    endedAt,
    playbackManifestPath: normalizedManifest,
    playbackEventsPath: playbackPaths?.eventsPath || null,
    playbackSamplesPath: playbackPaths?.samplesPath || null,
    playbackSnapshotsPath: playbackPaths?.snapshotsPath || null,
  };
  const urls = buildPlaybackUrls(
    record, outputDir, workspaceRoot,
  );

  const progressMessage = status === ADMIN_TEST_RUN_STATUS.PASSED ?
    'Run completed successfully' : 'Run failed';
  const examplesPayload = extractExamplesPayload(
    scenarios, outputDir, workspaceRoot,
  );

  return {
    runId,
    scenario: scenarioName,
    config: null,
    startedAt,
    endedAt,
    status,
    gitHash: null,
    outputReportPath,
    outputReportUrl: toOutputWebPath(
      outputReportPath, outputDir, workspaceRoot,
    ),
    playbackManifestPath: normalizedManifest,
    playbackManifestUrl: urls.playbackManifestUrl,
    playbackEventsPath: record.playbackEventsPath,
    playbackSamplesPath: record.playbackSamplesPath,
    playbackSnapshotsPath: record.playbackSnapshotsPath,
    playbackEventsUrl: urls.playbackEventsUrl,
    playbackSamplesUrl: urls.playbackSamplesUrl,
    playbackSnapshotsUrl: urls.playbackSnapshotsUrl,
    playbackViewerUrl: urls.playbackViewerUrl,
    livePlaybackViewerUrl: urls.livePlaybackViewerUrl,
    progress: {
      phase: status === ADMIN_TEST_RUN_STATUS.PASSED ?
        RUN_PROGRESS_PHASE.COMPLETED :
        RUN_PROGRESS_PHASE.FAILED,
      message: progressMessage,
      percent: FULL_PERCENT,
      updatedAt: endedAt || startedAt ||
        new Date(nowFn()).toISOString(),
    },
    summary: report.summary || null,
    examplesSummary: examplesPayload.summary,
    examplesArtifactPath: examplesPayload.artifactPath,
    examplesArtifactUrl: toOutputWebPath(
      examplesPayload.artifactPath, outputDir, workspaceRoot,
    ),
  };
}

/**
 * Fill missing playback path fields from scenario defaults.
 * @param {Object} merged - Mutable merged record.
 */
function fillPlaybackPaths(merged) {
  const paths = buildScenarioPlaybackPaths(
    merged.scenario, merged.runId || null,
  );
  if (!paths) {
    return;
  }
  if (!merged.playbackManifestPath) {
    merged.playbackManifestPath = paths.manifestPath;
  }
  if (!merged.playbackEventsPath) {
    merged.playbackEventsPath = paths.eventsPath;
  }
  if (!merged.playbackSamplesPath) {
    merged.playbackSamplesPath = paths.samplesPath;
  }
  if (!merged.playbackSnapshotsPath) {
    merged.playbackSnapshotsPath = paths.snapshotsPath;
  }
}

/**
 * Fill missing playback URL fields from path fields.
 * @param {Object} merged - Mutable merged record.
 * @param {string} outputDir
 * @param {string} workspaceRoot
 */
function fillPlaybackUrls(merged, outputDir, workspaceRoot) {
  if (!merged.playbackManifestUrl) {
    merged.playbackManifestUrl = toOutputWebPath(
      merged.playbackManifestPath, outputDir, workspaceRoot,
    );
  }
  if (!merged.playbackEventsUrl) {
    merged.playbackEventsUrl = toOutputWebPath(
      merged.playbackEventsPath, outputDir, workspaceRoot,
    );
  }
  if (!merged.playbackSamplesUrl) {
    merged.playbackSamplesUrl = toOutputWebPath(
      merged.playbackSamplesPath, outputDir, workspaceRoot,
    );
  }
  if (!merged.playbackSnapshotsUrl) {
    merged.playbackSnapshotsUrl = toOutputWebPath(
      merged.playbackSnapshotsPath, outputDir, workspaceRoot,
    );
  }
  if (!merged.playbackViewerUrl && merged.playbackManifestPath) {
    merged.playbackViewerUrl = buildPlaybackViewerUrl(
      merged.playbackManifestPath, outputDir, workspaceRoot,
    );
  }
  if (!merged.livePlaybackViewerUrl) {
    merged.livePlaybackViewerUrl = buildLivePlaybackViewerUrl(
      {
        eventsUrl: merged.playbackEventsUrl,
        samplesUrl: merged.playbackSamplesUrl,
        snapshotsUrl: merged.playbackSnapshotsUrl,
      },
      {
        follow: false,
        autoplay: false,
        runId: merged.runId,
        runStartMs: Date.parse(
          merged.startedAt || EMPTY_STRING,
        ) || null,
      },
    );
  }
}

/**
 * Merge two run records, preferring defined values from right.
 * @param {Object} left
 * @param {Object} right
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @param {Function} buildProgress - Builds progress payload.
 * @return {Object}
 */
function mergeRunRecord(
  left, right, outputDir, workspaceRoot, buildProgress,
) {
  const merged = {...left};
  for (const [key, value] of Object.entries(right || {})) {
    if (value !== undefined && value !== null &&
      value !== EMPTY_STRING) {
      merged[key] = value;
    } else if (!(key in merged)) {
      merged[key] = value;
    }
  }

  fillPlaybackPaths(merged);
  fillPlaybackUrls(merged, outputDir, workspaceRoot);

  if (!merged.progress && merged.status) {
    const isDone = !isRunStatusActive(merged.status);
    merged.progress = buildProgress({
      phase: isDone ?
        RUN_PROGRESS_PHASE.COMPLETED :
        RUN_PROGRESS_PHASE.SCENARIO_RUNNING,
      message: `Run status: ${merged.status}`,
      percent: isDone ? FULL_PERCENT : HALF_PERCENT,
    });
  }

  if (!merged.examplesArtifactUrl && merged.examplesArtifactPath) {
    merged.examplesArtifactUrl = toOutputWebPath(
      merged.examplesArtifactPath, outputDir, workspaceRoot,
    );
  }
  return merged;
}

/**
 * Convert internal run object into API shape.
 * @param {Object} run
 * @param {Object} [options]
 * @param {boolean} [options.includeLogs]
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {Object}
 */
function serializeRun(
  run, options, outputDir, workspaceRoot,
) {
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
      toOutputWebPath(
        run.outputReportPath, outputDir, workspaceRoot,
      ),
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
    examplesSummary: run.examplesSummary || null,
    examplesArtifactPath: run.examplesArtifactPath || null,
    examplesArtifactUrl: run.examplesArtifactUrl || null,
    exitCode: run.exitCode ?? null,
    signal: run.signal || null,
    pid: run.pid || null,
    progress: run.progress || null,
    summary: run.summary || null,
  };
  if (options?.includeLogs) {
    payload.logs = Array.isArray(run.logBuffer) ?
      [...run.logBuffer] : [];
  }
  return payload;
}

export {
  extractExamplesPayload,
  extractReportSummary,
  isRunStatusActive,
  mergeRunRecord,
  resolvePlaybackManifestPath,
  serializeRun,
};
