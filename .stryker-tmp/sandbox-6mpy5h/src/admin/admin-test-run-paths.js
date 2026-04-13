/**
 * Path and URL utilities for admin test run service.
 * Owns output directory layout, playback path construction,
 * and web URL generation for test run artifacts.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { URLSearchParams } from 'node:url';
import { ADMIN_CONTENT_TYPE, ADMIN_ROUTE, ADMIN_TEST_DEFAULT, ADMIN_TEST_RUN_PATH } from './admin-constants.js';
const PATH_SEPARATOR_WEB = stryMutAct_9fa48("7210") ? "" : (stryCov_9fa48("7210"), '/');
const EMPTY_STRING = stryMutAct_9fa48("7211") ? "Stryker was here!" : (stryCov_9fa48("7211"), '');
const LEADING_SLASH_REGEX = stryMutAct_9fa48("7213") ? /^\// : stryMutAct_9fa48("7212") ? /\/+/ : (stryCov_9fa48("7212", "7213"), /^\/+/);
const RUN_PLAYBACK_OUTPUT_DIRNAME = stryMutAct_9fa48("7214") ? "" : (stryCov_9fa48("7214"), '.playback');
const PLAYBACK_MANIFEST_QUERY_KEY = stryMutAct_9fa48("7215") ? "" : (stryCov_9fa48("7215"), 'manifest');
const PLAYBACK_RUN_START_QUERY_KEY = stryMutAct_9fa48("7216") ? "" : (stryCov_9fa48("7216"), 'runStartMs');
const OUTPUT_ROUTE_PREFIX = stryMutAct_9fa48("7217") ? ADMIN_ROUTE.OUTPUT_FILES : (stryCov_9fa48("7217"), ADMIN_ROUTE.OUTPUT_FILES.substring(0, stryMutAct_9fa48("7218") ? ADMIN_ROUTE.OUTPUT_FILES.length + 1 : (stryCov_9fa48("7218"), ADMIN_ROUTE.OUTPUT_FILES.length - 1)));
const FILE_EXTENSION_CONTENT_TYPE = Object.freeze(stryMutAct_9fa48("7219") ? {} : (stryCov_9fa48("7219"), {
  '.html': ADMIN_CONTENT_TYPE.HTML,
  '.json': ADMIN_CONTENT_TYPE.JSON,
  '.ndjson': ADMIN_CONTENT_TYPE.NDJSON,
  '.js': ADMIN_CONTENT_TYPE.JAVASCRIPT,
  '.css': ADMIN_CONTENT_TYPE.CSS,
  '.log': ADMIN_CONTENT_TYPE.TEXT,
  '.txt': ADMIN_CONTENT_TYPE.TEXT
}));

/**
 * Normalize a path to web slash separators.
 * @param {string} value
 * @return {string}
 */
function normalizeWebPath(value) {
  if (stryMutAct_9fa48("7220")) {
    {}
  } else {
    stryCov_9fa48("7220");
    return String(value).split(sep).join(PATH_SEPARATOR_WEB);
  }
}

/**
 * Returns true if targetPath is inside basePath.
 * @param {string} basePath
 * @param {string} targetPath
 * @return {boolean}
 */
function isPathInside(basePath, targetPath) {
  if (stryMutAct_9fa48("7221")) {
    {}
  } else {
    stryCov_9fa48("7221");
    if (stryMutAct_9fa48("7224") ? targetPath !== basePath : stryMutAct_9fa48("7223") ? false : stryMutAct_9fa48("7222") ? true : (stryCov_9fa48("7222", "7223", "7224"), targetPath === basePath)) {
      if (stryMutAct_9fa48("7225")) {
        {}
      } else {
        stryCov_9fa48("7225");
        return stryMutAct_9fa48("7226") ? false : (stryCov_9fa48("7226"), true);
      }
    }
    return stryMutAct_9fa48("7227") ? targetPath.endsWith(`${basePath}${sep}`) : (stryCov_9fa48("7227"), targetPath.startsWith(stryMutAct_9fa48("7228") ? `` : (stryCov_9fa48("7228"), `${basePath}${sep}`)));
  }
}

/**
 * Build per-run playback output root.
 * @param {string|null} runId
 * @return {string}
 */
function buildRunPlaybackOutputDir(runId) {
  if (stryMutAct_9fa48("7229")) {
    {}
  } else {
    stryCov_9fa48("7229");
    const trimmedRunId = (stryMutAct_9fa48("7232") ? typeof runId !== 'string' : stryMutAct_9fa48("7231") ? false : stryMutAct_9fa48("7230") ? true : (stryCov_9fa48("7230", "7231", "7232"), typeof runId === (stryMutAct_9fa48("7233") ? "" : (stryCov_9fa48("7233"), 'string')))) ? stryMutAct_9fa48("7234") ? runId : (stryCov_9fa48("7234"), runId.trim()) : EMPTY_STRING;
    if (stryMutAct_9fa48("7237") ? false : stryMutAct_9fa48("7236") ? true : stryMutAct_9fa48("7235") ? trimmedRunId : (stryCov_9fa48("7235", "7236", "7237"), !trimmedRunId)) {
      if (stryMutAct_9fa48("7238")) {
        {}
      } else {
        stryCov_9fa48("7238");
        return ADMIN_TEST_RUN_PATH.OUTPUT_DIR;
      }
    }
    return join(ADMIN_TEST_RUN_PATH.OUTPUT_DIR, RUN_PLAYBACK_OUTPUT_DIRNAME, trimmedRunId);
  }
}

/**
 * Build scenario output directory.
 * @param {string|null} scenarioName
 * @param {string|null} runId
 * @return {string|null}
 */
function buildScenarioOutputDir(scenarioName, runId = null) {
  if (stryMutAct_9fa48("7239")) {
    {}
  } else {
    stryCov_9fa48("7239");
    if (stryMutAct_9fa48("7242") ? !scenarioName && typeof scenarioName !== 'string' : stryMutAct_9fa48("7241") ? false : stryMutAct_9fa48("7240") ? true : (stryCov_9fa48("7240", "7241", "7242"), (stryMutAct_9fa48("7243") ? scenarioName : (stryCov_9fa48("7243"), !scenarioName)) || (stryMutAct_9fa48("7245") ? typeof scenarioName === 'string' : stryMutAct_9fa48("7244") ? false : (stryCov_9fa48("7244", "7245"), typeof scenarioName !== (stryMutAct_9fa48("7246") ? "" : (stryCov_9fa48("7246"), 'string')))))) {
      if (stryMutAct_9fa48("7247")) {
        {}
      } else {
        stryCov_9fa48("7247");
        return null;
      }
    }
    return join(buildRunPlaybackOutputDir(runId), scenarioName);
  }
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
  if (stryMutAct_9fa48("7248")) {
    {}
  } else {
    stryCov_9fa48("7248");
    const scenarioOutputDir = buildScenarioOutputDir(scenarioName, runId);
    if (stryMutAct_9fa48("7251") ? false : stryMutAct_9fa48("7250") ? true : stryMutAct_9fa48("7249") ? scenarioOutputDir : (stryCov_9fa48("7249", "7250", "7251"), !scenarioOutputDir)) {
      if (stryMutAct_9fa48("7252")) {
        {}
      } else {
        stryCov_9fa48("7252");
        return null;
      }
    }
    return stryMutAct_9fa48("7253") ? {} : (stryCov_9fa48("7253"), {
      eventsPath: join(scenarioOutputDir, ADMIN_TEST_DEFAULT.PLAYBACK_EVENTS_FILENAME),
      samplesPath: join(scenarioOutputDir, ADMIN_TEST_DEFAULT.PLAYBACK_SAMPLES_FILENAME),
      snapshotsPath: join(scenarioOutputDir, ADMIN_TEST_DEFAULT.PLAYBACK_SNAPSHOTS_FILENAME),
      manifestPath: join(scenarioOutputDir, ADMIN_TEST_DEFAULT.PLAYBACK_MANIFEST_FILENAME)
    });
  }
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
  if (stryMutAct_9fa48("7254")) {
    {}
  } else {
    stryCov_9fa48("7254");
    const params = new URLSearchParams();
    if (stryMutAct_9fa48("7257") ? payload.eventsUrl : stryMutAct_9fa48("7256") ? false : stryMutAct_9fa48("7255") ? true : (stryCov_9fa48("7255", "7256", "7257"), payload?.eventsUrl)) {
      if (stryMutAct_9fa48("7258")) {
        {}
      } else {
        stryCov_9fa48("7258");
        params.set(stryMutAct_9fa48("7259") ? "" : (stryCov_9fa48("7259"), 'events'), payload.eventsUrl);
      }
    }
    if (stryMutAct_9fa48("7262") ? payload.samplesUrl : stryMutAct_9fa48("7261") ? false : stryMutAct_9fa48("7260") ? true : (stryCov_9fa48("7260", "7261", "7262"), payload?.samplesUrl)) {
      if (stryMutAct_9fa48("7263")) {
        {}
      } else {
        stryCov_9fa48("7263");
        params.set(stryMutAct_9fa48("7264") ? "" : (stryCov_9fa48("7264"), 'samples'), payload.samplesUrl);
      }
    }
    if (stryMutAct_9fa48("7267") ? payload.snapshotsUrl : stryMutAct_9fa48("7266") ? false : stryMutAct_9fa48("7265") ? true : (stryCov_9fa48("7265", "7266", "7267"), payload?.snapshotsUrl)) {
      if (stryMutAct_9fa48("7268")) {
        {}
      } else {
        stryCov_9fa48("7268");
        params.set(stryMutAct_9fa48("7269") ? "" : (stryCov_9fa48("7269"), 'snapshots'), payload.snapshotsUrl);
      }
    }
    if (stryMutAct_9fa48("7271") ? false : stryMutAct_9fa48("7270") ? true : (stryCov_9fa48("7270", "7271"), options.follow)) {
      if (stryMutAct_9fa48("7272")) {
        {}
      } else {
        stryCov_9fa48("7272");
        params.set(stryMutAct_9fa48("7273") ? "" : (stryCov_9fa48("7273"), 'follow'), stryMutAct_9fa48("7274") ? "" : (stryCov_9fa48("7274"), '1'));
      }
    }
    if (stryMutAct_9fa48("7276") ? false : stryMutAct_9fa48("7275") ? true : (stryCov_9fa48("7275", "7276"), options.autoplay)) {
      if (stryMutAct_9fa48("7277")) {
        {}
      } else {
        stryCov_9fa48("7277");
        params.set(stryMutAct_9fa48("7278") ? "" : (stryCov_9fa48("7278"), 'autoplay'), stryMutAct_9fa48("7279") ? "" : (stryCov_9fa48("7279"), '1'));
      }
    }
    if (stryMutAct_9fa48("7281") ? false : stryMutAct_9fa48("7280") ? true : (stryCov_9fa48("7280", "7281"), options.runId)) {
      if (stryMutAct_9fa48("7282")) {
        {}
      } else {
        stryCov_9fa48("7282");
        params.set(stryMutAct_9fa48("7283") ? "" : (stryCov_9fa48("7283"), 'runId'), options.runId);
      }
    }
    if (stryMutAct_9fa48("7286") ? Number.isFinite(Number(options.runStartMs)) || Number(options.runStartMs) > 0 : stryMutAct_9fa48("7285") ? false : stryMutAct_9fa48("7284") ? true : (stryCov_9fa48("7284", "7285", "7286"), Number.isFinite(Number(options.runStartMs)) && (stryMutAct_9fa48("7289") ? Number(options.runStartMs) <= 0 : stryMutAct_9fa48("7288") ? Number(options.runStartMs) >= 0 : stryMutAct_9fa48("7287") ? true : (stryCov_9fa48("7287", "7288", "7289"), Number(options.runStartMs) > 0)))) {
      if (stryMutAct_9fa48("7290")) {
        {}
      } else {
        stryCov_9fa48("7290");
        params.set(PLAYBACK_RUN_START_QUERY_KEY, String(Math.floor(Number(options.runStartMs))));
      }
    }
    const query = params.toString();
    if (stryMutAct_9fa48("7293") ? false : stryMutAct_9fa48("7292") ? true : stryMutAct_9fa48("7291") ? query : (stryCov_9fa48("7291", "7292", "7293"), !query)) {
      if (stryMutAct_9fa48("7294")) {
        {}
      } else {
        stryCov_9fa48("7294");
        return null;
      }
    }
    return stryMutAct_9fa48("7295") ? `` : (stryCov_9fa48("7295"), `${ADMIN_ROUTE.PLAYBACK_VIEWER}?${query}`);
  }
}

/**
 * Build playback viewer URL for a manifest path.
 * @param {string} manifestPath
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {string|null}
 */
function buildPlaybackViewerUrl(manifestPath, outputDir, workspaceRoot) {
  if (stryMutAct_9fa48("7296")) {
    {}
  } else {
    stryCov_9fa48("7296");
    const manifestUrl = toOutputWebPath(manifestPath, outputDir, workspaceRoot);
    if (stryMutAct_9fa48("7299") ? false : stryMutAct_9fa48("7298") ? true : stryMutAct_9fa48("7297") ? manifestUrl : (stryCov_9fa48("7297", "7298", "7299"), !manifestUrl)) {
      if (stryMutAct_9fa48("7300")) {
        {}
      } else {
        stryCov_9fa48("7300");
        return null;
      }
    }
    const encodedManifest = encodeURIComponent(manifestUrl);
    return (stryMutAct_9fa48("7301") ? `` : (stryCov_9fa48("7301"), `${ADMIN_ROUTE.PLAYBACK_VIEWER}?`)) + (stryMutAct_9fa48("7302") ? `` : (stryCov_9fa48("7302"), `${PLAYBACK_MANIFEST_QUERY_KEY}=${encodedManifest}`));
  }
}

/**
 * Normalize a workspace-relative path ensuring it is under output dir.
 * @param {string|null} maybePath
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {string|null}
 */
function normalizeWorkspaceRelativePath(maybePath, outputDir, workspaceRoot) {
  if (stryMutAct_9fa48("7303")) {
    {}
  } else {
    stryCov_9fa48("7303");
    if (stryMutAct_9fa48("7306") ? !maybePath && typeof maybePath !== 'string' : stryMutAct_9fa48("7305") ? false : stryMutAct_9fa48("7304") ? true : (stryCov_9fa48("7304", "7305", "7306"), (stryMutAct_9fa48("7307") ? maybePath : (stryCov_9fa48("7307"), !maybePath)) || (stryMutAct_9fa48("7309") ? typeof maybePath === 'string' : stryMutAct_9fa48("7308") ? false : (stryCov_9fa48("7308", "7309"), typeof maybePath !== (stryMutAct_9fa48("7310") ? "" : (stryCov_9fa48("7310"), 'string')))))) {
      if (stryMutAct_9fa48("7311")) {
        {}
      } else {
        stryCov_9fa48("7311");
        return null;
      }
    }
    const absolutePath = resolve(workspaceRoot, maybePath);
    if (stryMutAct_9fa48("7314") ? false : stryMutAct_9fa48("7313") ? true : stryMutAct_9fa48("7312") ? isPathInside(outputDir, absolutePath) : (stryCov_9fa48("7312", "7313", "7314"), !isPathInside(outputDir, absolutePath))) {
      if (stryMutAct_9fa48("7315")) {
        {}
      } else {
        stryCov_9fa48("7315");
        return null;
      }
    }
    return normalizeWebPath(relative(workspaceRoot, absolutePath));
  }
}

/**
 * Convert output-relative path to HTTP URL path.
 * @param {string|null} outputRelativePath
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {string|null}
 */
function toOutputWebPath(outputRelativePath, outputDir, workspaceRoot) {
  if (stryMutAct_9fa48("7316")) {
    {}
  } else {
    stryCov_9fa48("7316");
    if (stryMutAct_9fa48("7319") ? !outputRelativePath && typeof outputRelativePath !== 'string' : stryMutAct_9fa48("7318") ? false : stryMutAct_9fa48("7317") ? true : (stryCov_9fa48("7317", "7318", "7319"), (stryMutAct_9fa48("7320") ? outputRelativePath : (stryCov_9fa48("7320"), !outputRelativePath)) || (stryMutAct_9fa48("7322") ? typeof outputRelativePath === 'string' : stryMutAct_9fa48("7321") ? false : (stryCov_9fa48("7321", "7322"), typeof outputRelativePath !== (stryMutAct_9fa48("7323") ? "" : (stryCov_9fa48("7323"), 'string')))))) {
      if (stryMutAct_9fa48("7324")) {
        {}
      } else {
        stryCov_9fa48("7324");
        return null;
      }
    }
    const absolutePath = resolve(workspaceRoot, outputRelativePath);
    if (stryMutAct_9fa48("7327") ? false : stryMutAct_9fa48("7326") ? true : stryMutAct_9fa48("7325") ? isPathInside(outputDir, absolutePath) : (stryCov_9fa48("7325", "7326", "7327"), !isPathInside(outputDir, absolutePath))) {
      if (stryMutAct_9fa48("7328")) {
        {}
      } else {
        stryCov_9fa48("7328");
        return null;
      }
    }
    const relativeOutputPath = normalizeWebPath(relative(outputDir, absolutePath));
    return stryMutAct_9fa48("7329") ? `` : (stryCov_9fa48("7329"), `${OUTPUT_ROUTE_PREFIX}${relativeOutputPath}`);
  }
}

/**
 * Resolve a relative path inside test-output.
 * @param {string} wildcardPath
 * @param {string} outputDir
 * @return {string|null}
 */
function resolveOutputAssetPath(wildcardPath, outputDir) {
  if (stryMutAct_9fa48("7330")) {
    {}
  } else {
    stryCov_9fa48("7330");
    const safeRelative = decodeURIComponent(String(stryMutAct_9fa48("7333") ? wildcardPath && EMPTY_STRING : stryMutAct_9fa48("7332") ? false : stryMutAct_9fa48("7331") ? true : (stryCov_9fa48("7331", "7332", "7333"), wildcardPath || EMPTY_STRING)).replace(LEADING_SLASH_REGEX, EMPTY_STRING));
    const absolutePath = resolve(outputDir, safeRelative);
    if (stryMutAct_9fa48("7336") ? false : stryMutAct_9fa48("7335") ? true : stryMutAct_9fa48("7334") ? isPathInside(outputDir, absolutePath) : (stryCov_9fa48("7334", "7335", "7336"), !isPathInside(outputDir, absolutePath))) {
      if (stryMutAct_9fa48("7337")) {
        {}
      } else {
        stryCov_9fa48("7337");
        return null;
      }
    }
    return absolutePath;
  }
}

/**
 * Guess HTTP content type by filename extension.
 * @param {string} filePath
 * @return {string}
 */
function getContentType(filePath) {
  if (stryMutAct_9fa48("7338")) {
    {}
  } else {
    stryCov_9fa48("7338");
    const extension = stryMutAct_9fa48("7339") ? extname(filePath).toUpperCase() : (stryCov_9fa48("7339"), extname(filePath).toLowerCase());
    return stryMutAct_9fa48("7342") ? FILE_EXTENSION_CONTENT_TYPE[extension] && ADMIN_CONTENT_TYPE.TEXT : stryMutAct_9fa48("7341") ? false : stryMutAct_9fa48("7340") ? true : (stryCov_9fa48("7340", "7341", "7342"), FILE_EXTENSION_CONTENT_TYPE[extension] || ADMIN_CONTENT_TYPE.TEXT);
  }
}

/**
 * Build archived timeline path candidates for a run.
 * @param {Object} runRecord
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {Array<string>}
 */
function buildArchivedTimelineCandidates(runRecord, outputDir, workspaceRoot) {
  if (stryMutAct_9fa48("7343")) {
    {}
  } else {
    stryCov_9fa48("7343");
    const paths = stryMutAct_9fa48("7344") ? ["Stryker was here"] : (stryCov_9fa48("7344"), []);
    const seen = new Set();
    const addPath = pathValue => {
      if (stryMutAct_9fa48("7345")) {
        {}
      } else {
        stryCov_9fa48("7345");
        if (stryMutAct_9fa48("7348") ? !pathValue && seen.has(pathValue) : stryMutAct_9fa48("7347") ? false : stryMutAct_9fa48("7346") ? true : (stryCov_9fa48("7346", "7347", "7348"), (stryMutAct_9fa48("7349") ? pathValue : (stryCov_9fa48("7349"), !pathValue)) || seen.has(pathValue))) {
          if (stryMutAct_9fa48("7350")) {
            {}
          } else {
            stryCov_9fa48("7350");
            return;
          }
        }
        seen.add(pathValue);
        paths.push(pathValue);
      }
    };
    const normalizedManifestPath = normalizeWorkspaceRelativePath(stryMutAct_9fa48("7353") ? runRecord?.playbackManifestPath && null : stryMutAct_9fa48("7352") ? false : stryMutAct_9fa48("7351") ? true : (stryCov_9fa48("7351", "7352", "7353"), (stryMutAct_9fa48("7354") ? runRecord.playbackManifestPath : (stryCov_9fa48("7354"), runRecord?.playbackManifestPath)) || null), outputDir, workspaceRoot);
    if (stryMutAct_9fa48("7356") ? false : stryMutAct_9fa48("7355") ? true : (stryCov_9fa48("7355", "7356"), normalizedManifestPath)) {
      if (stryMutAct_9fa48("7357")) {
        {}
      } else {
        stryCov_9fa48("7357");
        const manifestDir = dirname(normalizedManifestPath);
        addPath(resolve(workspaceRoot, manifestDir, ADMIN_TEST_DEFAULT.TIMELINE_FILENAME));
      }
    }
    const runScopedScenarioDir = buildScenarioOutputDir(stryMutAct_9fa48("7360") ? runRecord?.scenario && null : stryMutAct_9fa48("7359") ? false : stryMutAct_9fa48("7358") ? true : (stryCov_9fa48("7358", "7359", "7360"), (stryMutAct_9fa48("7361") ? runRecord.scenario : (stryCov_9fa48("7361"), runRecord?.scenario)) || null), stryMutAct_9fa48("7364") ? runRecord?.runId && null : stryMutAct_9fa48("7363") ? false : stryMutAct_9fa48("7362") ? true : (stryCov_9fa48("7362", "7363", "7364"), (stryMutAct_9fa48("7365") ? runRecord.runId : (stryCov_9fa48("7365"), runRecord?.runId)) || null));
    if (stryMutAct_9fa48("7367") ? false : stryMutAct_9fa48("7366") ? true : (stryCov_9fa48("7366", "7367"), runScopedScenarioDir)) {
      if (stryMutAct_9fa48("7368")) {
        {}
      } else {
        stryCov_9fa48("7368");
        addPath(resolve(workspaceRoot, runScopedScenarioDir, ADMIN_TEST_DEFAULT.TIMELINE_FILENAME));
      }
    }
    if (stryMutAct_9fa48("7371") ? runRecord.scenario : stryMutAct_9fa48("7370") ? false : stryMutAct_9fa48("7369") ? true : (stryCov_9fa48("7369", "7370", "7371"), runRecord?.scenario)) {
      if (stryMutAct_9fa48("7372")) {
        {}
      } else {
        stryCov_9fa48("7372");
        addPath(resolve(outputDir, runRecord.scenario, ADMIN_TEST_DEFAULT.TIMELINE_FILENAME));
      }
    }
    return paths;
  }
}
export { buildArchivedTimelineCandidates, buildLivePlaybackViewerUrl, buildPlaybackViewerUrl, buildRunPlaybackOutputDir, buildScenarioOutputDir, buildScenarioPlaybackPaths, getContentType, isPathInside, normalizeWebPath, normalizeWorkspaceRelativePath, resolveOutputAssetPath, toOutputWebPath };