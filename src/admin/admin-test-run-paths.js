/**
 * Path and URL utilities for admin test run service.
 * Owns output directory layout, playback path construction,
 * and web URL generation for test run artifacts.
 */

import {
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import {URLSearchParams} from 'node:url';
import {
  ADMIN_CONTENT_TYPE,
  ADMIN_ROUTE,
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_RUN_PATH,
} from './admin-constants.js';

const PATH_SEPARATOR_WEB = '/';
const EMPTY_STRING = '';
const LEADING_SLASH_REGEX = /^\/+/;
const RUN_PLAYBACK_OUTPUT_DIRNAME = '.playback';
const PLAYBACK_MANIFEST_QUERY_KEY = 'manifest';
const PLAYBACK_RUN_START_QUERY_KEY = 'runStartMs';
const OUTPUT_ROUTE_PREFIX =
  ADMIN_ROUTE.OUTPUT_FILES.substring(
    0,
    ADMIN_ROUTE.OUTPUT_FILES.length - 1,
  );

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
 * Build per-run playback output root.
 * @param {string|null} runId
 * @return {string}
 */
function buildRunPlaybackOutputDir(runId) {
  const trimmedRunId = typeof runId === 'string' ?
    runId.trim() : EMPTY_STRING;
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
 */
function buildScenarioOutputDir(scenarioName, runId = null) {
  if (!scenarioName || typeof scenarioName !== 'string') {
    return null;
  }
  return join(
    buildRunPlaybackOutputDir(runId),
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
 */
function buildScenarioPlaybackPaths(scenarioName, runId = null) {
  const scenarioOutputDir = buildScenarioOutputDir(
    scenarioName, runId,
  );
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
 */
function buildLivePlaybackViewerUrl(payload, options = {}) {
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
 * Build playback viewer URL for a manifest path.
 * @param {string} manifestPath
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {string|null}
 */
function buildPlaybackViewerUrl(
  manifestPath, outputDir, workspaceRoot,
) {
  const manifestUrl = toOutputWebPath(
    manifestPath, outputDir, workspaceRoot,
  );
  if (!manifestUrl) {
    return null;
  }
  const encodedManifest = encodeURIComponent(manifestUrl);
  return `${ADMIN_ROUTE.PLAYBACK_VIEWER}?` +
    `${PLAYBACK_MANIFEST_QUERY_KEY}=${encodedManifest}`;
}

/**
 * Normalize a workspace-relative path ensuring it is under output dir.
 * @param {string|null} maybePath
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {string|null}
 */
function normalizeWorkspaceRelativePath(
  maybePath, outputDir, workspaceRoot,
) {
  if (!maybePath || typeof maybePath !== 'string') {
    return null;
  }
  const absolutePath = resolve(workspaceRoot, maybePath);
  if (!isPathInside(outputDir, absolutePath)) {
    return null;
  }
  return normalizeWebPath(
    relative(workspaceRoot, absolutePath),
  );
}

/**
 * Convert output-relative path to HTTP URL path.
 * @param {string|null} outputRelativePath
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {string|null}
 */
function toOutputWebPath(
  outputRelativePath, outputDir, workspaceRoot,
) {
  if (!outputRelativePath ||
    typeof outputRelativePath !== 'string') {
    return null;
  }
  const absolutePath = resolve(workspaceRoot, outputRelativePath);
  if (!isPathInside(outputDir, absolutePath)) {
    return null;
  }
  const relativeOutputPath = normalizeWebPath(
    relative(outputDir, absolutePath),
  );
  return `${OUTPUT_ROUTE_PREFIX}${relativeOutputPath}`;
}

/**
 * Resolve a relative path inside test-output.
 * @param {string} wildcardPath
 * @param {string} outputDir
 * @return {string|null}
 */
function resolveOutputAssetPath(wildcardPath, outputDir) {
  const safeRelative = decodeURIComponent(
    String(wildcardPath || EMPTY_STRING)
      .replace(LEADING_SLASH_REGEX, EMPTY_STRING),
  );
  const absolutePath = resolve(outputDir, safeRelative);
  if (!isPathInside(outputDir, absolutePath)) {
    return null;
  }
  return absolutePath;
}

/**
 * Guess HTTP content type by filename extension.
 * @param {string} filePath
 * @return {string}
 */
function getContentType(filePath) {
  const extension = extname(filePath).toLowerCase();
  return FILE_EXTENSION_CONTENT_TYPE[extension] ||
    ADMIN_CONTENT_TYPE.TEXT;
}

/**
 * Build archived timeline path candidates for a run.
 * @param {Object} runRecord
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {Array<string>}
 */
function buildArchivedTimelineCandidates(
  runRecord, outputDir, workspaceRoot,
) {
  const paths = [];
  const seen = new Set();
  const addPath = (pathValue) => {
    if (!pathValue || seen.has(pathValue)) {
      return;
    }
    seen.add(pathValue);
    paths.push(pathValue);
  };

  const normalizedManifestPath = normalizeWorkspaceRelativePath(
    runRecord?.playbackManifestPath || null,
    outputDir,
    workspaceRoot,
  );
  if (normalizedManifestPath) {
    const manifestDir = dirname(normalizedManifestPath);
    addPath(resolve(
      workspaceRoot,
      manifestDir,
      ADMIN_TEST_DEFAULT.TIMELINE_FILENAME,
    ));
  }

  const runScopedScenarioDir = buildScenarioOutputDir(
    runRecord?.scenario || null,
    runRecord?.runId || null,
  );
  if (runScopedScenarioDir) {
    addPath(resolve(
      workspaceRoot,
      runScopedScenarioDir,
      ADMIN_TEST_DEFAULT.TIMELINE_FILENAME,
    ));
  }

  if (runRecord?.scenario) {
    addPath(resolve(
      outputDir,
      runRecord.scenario,
      ADMIN_TEST_DEFAULT.TIMELINE_FILENAME,
    ));
  }

  return paths;
}

export {
  buildArchivedTimelineCandidates,
  buildLivePlaybackViewerUrl,
  buildPlaybackViewerUrl,
  buildRunPlaybackOutputDir,
  buildScenarioOutputDir,
  buildScenarioPlaybackPaths,
  getContentType,
  isPathInside,
  normalizeWebPath,
  normalizeWorkspaceRelativePath,
  resolveOutputAssetPath,
  toOutputWebPath,
};
