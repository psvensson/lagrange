/**
 * Report extraction and run record merging for admin test runs.
 * Owns report JSON parsing, run record serialization, and
 * record merging logic.
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
import { join } from 'node:path';
import { ADMIN_TEST_DEFAULT, ADMIN_TEST_RUN_PATH, ADMIN_TEST_RUN_STATUS } from './admin-constants.js';
import { buildLivePlaybackViewerUrl, buildPlaybackViewerUrl, buildScenarioPlaybackPaths, normalizeWorkspaceRelativePath, toOutputWebPath } from './admin-test-run-paths.js';
import { RUN_PROGRESS_PHASE } from './admin-test-run-progress.js';
const EMPTY_STRING = stryMutAct_9fa48("7469") ? "Stryker was here!" : (stryCov_9fa48("7469"), '');
const REPORT_TIMESTAMP_FALLBACK_MS = 0;
const FULL_PERCENT = 100;
const HALF_PERCENT = 50;

/**
 * Returns true for active/in-flight run states.
 * @param {string} status
 * @return {boolean}
 */
function isRunStatusActive(status) {
  if (stryMutAct_9fa48("7470")) {
    {}
  } else {
    stryCov_9fa48("7470");
    return stryMutAct_9fa48("7473") ? (status === ADMIN_TEST_RUN_STATUS.RUNNING || status === ADMIN_TEST_RUN_STATUS.STOPPING) && status === ADMIN_TEST_RUN_STATUS.PENDING : stryMutAct_9fa48("7472") ? false : stryMutAct_9fa48("7471") ? true : (stryCov_9fa48("7471", "7472", "7473"), (stryMutAct_9fa48("7475") ? status === ADMIN_TEST_RUN_STATUS.RUNNING && status === ADMIN_TEST_RUN_STATUS.STOPPING : stryMutAct_9fa48("7474") ? false : (stryCov_9fa48("7474", "7475"), (stryMutAct_9fa48("7477") ? status !== ADMIN_TEST_RUN_STATUS.RUNNING : stryMutAct_9fa48("7476") ? false : (stryCov_9fa48("7476", "7477"), status === ADMIN_TEST_RUN_STATUS.RUNNING)) || (stryMutAct_9fa48("7479") ? status !== ADMIN_TEST_RUN_STATUS.STOPPING : stryMutAct_9fa48("7478") ? false : (stryCov_9fa48("7478", "7479"), status === ADMIN_TEST_RUN_STATUS.STOPPING)))) || (stryMutAct_9fa48("7481") ? status !== ADMIN_TEST_RUN_STATUS.PENDING : stryMutAct_9fa48("7480") ? false : (stryCov_9fa48("7480", "7481"), status === ADMIN_TEST_RUN_STATUS.PENDING)));
  }
}

/**
 * Resolve playback manifest path from report scenario payload.
 * @param {Object|null} scenario
 * @return {string|null}
 */
function resolvePlaybackManifestPath(scenario) {
  if (stryMutAct_9fa48("7482")) {
    {}
  } else {
    stryCov_9fa48("7482");
    const playback = stryMutAct_9fa48("7483") ? scenario.playback : (stryCov_9fa48("7483"), scenario?.playback);
    if (stryMutAct_9fa48("7486") ? !playback && typeof playback !== 'object' : stryMutAct_9fa48("7485") ? false : stryMutAct_9fa48("7484") ? true : (stryCov_9fa48("7484", "7485", "7486"), (stryMutAct_9fa48("7487") ? playback : (stryCov_9fa48("7487"), !playback)) || (stryMutAct_9fa48("7489") ? typeof playback === 'object' : stryMutAct_9fa48("7488") ? false : (stryCov_9fa48("7488", "7489"), typeof playback !== (stryMutAct_9fa48("7490") ? "" : (stryCov_9fa48("7490"), 'object')))))) {
      if (stryMutAct_9fa48("7491")) {
        {}
      } else {
        stryCov_9fa48("7491");
        return null;
      }
    }
    const candidates = stryMutAct_9fa48("7492") ? [] : (stryCov_9fa48("7492"), [playback.manifestPath, stryMutAct_9fa48("7493") ? playback.files.manifest : (stryCov_9fa48("7493"), playback.files?.manifest), stryMutAct_9fa48("7494") ? playback.files.manifestPath : (stryCov_9fa48("7494"), playback.files?.manifestPath)]);
    for (const candidate of candidates) {
      if (stryMutAct_9fa48("7495")) {
        {}
      } else {
        stryCov_9fa48("7495");
        if (stryMutAct_9fa48("7498") ? typeof candidate === 'string' || candidate.trim() : stryMutAct_9fa48("7497") ? false : stryMutAct_9fa48("7496") ? true : (stryCov_9fa48("7496", "7497", "7498"), (stryMutAct_9fa48("7500") ? typeof candidate !== 'string' : stryMutAct_9fa48("7499") ? true : (stryCov_9fa48("7499", "7500"), typeof candidate === (stryMutAct_9fa48("7501") ? "" : (stryCov_9fa48("7501"), 'string')))) && (stryMutAct_9fa48("7502") ? candidate : (stryCov_9fa48("7502"), candidate.trim())))) {
          if (stryMutAct_9fa48("7503")) {
            {}
          } else {
            stryCov_9fa48("7503");
            return candidate;
          }
        }
      }
    }
    return null;
  }
}

/**
 * Extract examples summary payload from report scenarios.
 * @param {Array<Object>} scenarios
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {{summary: Object|null, artifactPath: string|null}}
 */
function extractExamplesPayload(scenarios, outputDir, workspaceRoot) {
  if (stryMutAct_9fa48("7504")) {
    {}
  } else {
    stryCov_9fa48("7504");
    const fallback = stryMutAct_9fa48("7505") ? {} : (stryCov_9fa48("7505"), {
      summary: null,
      artifactPath: null
    });
    if (stryMutAct_9fa48("7508") ? !Array.isArray(scenarios) && scenarios.length === 0 : stryMutAct_9fa48("7507") ? false : stryMutAct_9fa48("7506") ? true : (stryCov_9fa48("7506", "7507", "7508"), (stryMutAct_9fa48("7509") ? Array.isArray(scenarios) : (stryCov_9fa48("7509"), !Array.isArray(scenarios))) || (stryMutAct_9fa48("7511") ? scenarios.length !== 0 : stryMutAct_9fa48("7510") ? false : (stryCov_9fa48("7510", "7511"), scenarios.length === 0)))) {
      if (stryMutAct_9fa48("7512")) {
        {}
      } else {
        stryCov_9fa48("7512");
        return fallback;
      }
    }
    let summary = null;
    let artifactPath = null;
    for (const scenario of scenarios) {
      if (stryMutAct_9fa48("7513")) {
        {}
      } else {
        stryCov_9fa48("7513");
        if (stryMutAct_9fa48("7516") ? !summary && scenario?.exampleResults || typeof scenario.exampleResults === 'object' : stryMutAct_9fa48("7515") ? false : stryMutAct_9fa48("7514") ? true : (stryCov_9fa48("7514", "7515", "7516"), (stryMutAct_9fa48("7518") ? !summary || scenario?.exampleResults : stryMutAct_9fa48("7517") ? true : (stryCov_9fa48("7517", "7518"), (stryMutAct_9fa48("7519") ? summary : (stryCov_9fa48("7519"), !summary)) && (stryMutAct_9fa48("7520") ? scenario.exampleResults : (stryCov_9fa48("7520"), scenario?.exampleResults)))) && (stryMutAct_9fa48("7522") ? typeof scenario.exampleResults !== 'object' : stryMutAct_9fa48("7521") ? true : (stryCov_9fa48("7521", "7522"), typeof scenario.exampleResults === (stryMutAct_9fa48("7523") ? "" : (stryCov_9fa48("7523"), 'object')))))) {
          if (stryMutAct_9fa48("7524")) {
            {}
          } else {
            stryCov_9fa48("7524");
            summary = scenario.exampleResults;
          }
        }
        const details = stryMutAct_9fa48("7525") ? scenario.details : (stryCov_9fa48("7525"), scenario?.details);
        if (stryMutAct_9fa48("7528") ? !summary && details?.exampleResults || typeof details.exampleResults === 'object' : stryMutAct_9fa48("7527") ? false : stryMutAct_9fa48("7526") ? true : (stryCov_9fa48("7526", "7527", "7528"), (stryMutAct_9fa48("7530") ? !summary || details?.exampleResults : stryMutAct_9fa48("7529") ? true : (stryCov_9fa48("7529", "7530"), (stryMutAct_9fa48("7531") ? summary : (stryCov_9fa48("7531"), !summary)) && (stryMutAct_9fa48("7532") ? details.exampleResults : (stryCov_9fa48("7532"), details?.exampleResults)))) && (stryMutAct_9fa48("7534") ? typeof details.exampleResults !== 'object' : stryMutAct_9fa48("7533") ? true : (stryCov_9fa48("7533", "7534"), typeof details.exampleResults === (stryMutAct_9fa48("7535") ? "" : (stryCov_9fa48("7535"), 'object')))))) {
          if (stryMutAct_9fa48("7536")) {
            {}
          } else {
            stryCov_9fa48("7536");
            summary = details.exampleResults;
          }
        }
        if (stryMutAct_9fa48("7539") ? !artifactPath || typeof details?.artifactPath === 'string' : stryMutAct_9fa48("7538") ? false : stryMutAct_9fa48("7537") ? true : (stryCov_9fa48("7537", "7538", "7539"), (stryMutAct_9fa48("7540") ? artifactPath : (stryCov_9fa48("7540"), !artifactPath)) && (stryMutAct_9fa48("7542") ? typeof details?.artifactPath !== 'string' : stryMutAct_9fa48("7541") ? true : (stryCov_9fa48("7541", "7542"), typeof (stryMutAct_9fa48("7543") ? details.artifactPath : (stryCov_9fa48("7543"), details?.artifactPath)) === (stryMutAct_9fa48("7544") ? "" : (stryCov_9fa48("7544"), 'string')))))) {
          if (stryMutAct_9fa48("7545")) {
            {}
          } else {
            stryCov_9fa48("7545");
            artifactPath = details.artifactPath;
          }
        }
      }
    }
    return stryMutAct_9fa48("7546") ? {} : (stryCov_9fa48("7546"), {
      summary: stryMutAct_9fa48("7549") ? summary && null : stryMutAct_9fa48("7548") ? false : stryMutAct_9fa48("7547") ? true : (stryCov_9fa48("7547", "7548", "7549"), summary || null),
      artifactPath: normalizeWorkspaceRelativePath(artifactPath, outputDir, workspaceRoot)
    });
  }
}

/**
 * Build playback URL fields for a run record.
 * @param {Object} record - Partial run record with path fields.
 * @param {string} outputDir
 * @param {string} workspaceRoot
 * @return {Object} URL fields to merge into the record.
 */
function buildPlaybackUrls(record, outputDir, workspaceRoot) {
  if (stryMutAct_9fa48("7550")) {
    {}
  } else {
    stryCov_9fa48("7550");
    const eventsUrl = toOutputWebPath(record.playbackEventsPath, outputDir, workspaceRoot);
    const samplesUrl = toOutputWebPath(record.playbackSamplesPath, outputDir, workspaceRoot);
    const snapshotsUrl = toOutputWebPath(record.playbackSnapshotsPath, outputDir, workspaceRoot);
    const manifestUrl = record.playbackManifestPath ? toOutputWebPath(record.playbackManifestPath, outputDir, workspaceRoot) : null;
    const viewerUrl = record.playbackManifestPath ? buildPlaybackViewerUrl(record.playbackManifestPath, outputDir, workspaceRoot) : null;
    const liveViewerUrl = buildLivePlaybackViewerUrl(stryMutAct_9fa48("7551") ? {} : (stryCov_9fa48("7551"), {
      eventsUrl,
      samplesUrl,
      snapshotsUrl
    }), stryMutAct_9fa48("7552") ? {} : (stryCov_9fa48("7552"), {
      follow: stryMutAct_9fa48("7553") ? true : (stryCov_9fa48("7553"), false),
      autoplay: stryMutAct_9fa48("7554") ? true : (stryCov_9fa48("7554"), false),
      runId: record.runId,
      runStartMs: stryMutAct_9fa48("7557") ? Date.parse(record.startedAt || EMPTY_STRING) && null : stryMutAct_9fa48("7556") ? false : stryMutAct_9fa48("7555") ? true : (stryCov_9fa48("7555", "7556", "7557"), Date.parse(stryMutAct_9fa48("7560") ? record.startedAt && EMPTY_STRING : stryMutAct_9fa48("7559") ? false : stryMutAct_9fa48("7558") ? true : (stryCov_9fa48("7558", "7559", "7560"), record.startedAt || EMPTY_STRING)) || null)
    }));
    return stryMutAct_9fa48("7561") ? {} : (stryCov_9fa48("7561"), {
      playbackEventsUrl: eventsUrl,
      playbackSamplesUrl: samplesUrl,
      playbackSnapshotsUrl: snapshotsUrl,
      playbackManifestUrl: manifestUrl,
      playbackViewerUrl: viewerUrl,
      livePlaybackViewerUrl: liveViewerUrl
    });
  }
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
function extractReportSummary(report, runId, reportStats, outputDir, workspaceRoot, nowFn) {
  if (stryMutAct_9fa48("7562")) {
    {}
  } else {
    stryCov_9fa48("7562");
    const scenarios = Array.isArray(report.scenarios) ? report.scenarios : stryMutAct_9fa48("7563") ? ["Stryker was here"] : (stryCov_9fa48("7563"), []);
    const firstScenario = (stryMutAct_9fa48("7567") ? scenarios.length <= 0 : stryMutAct_9fa48("7566") ? scenarios.length >= 0 : stryMutAct_9fa48("7565") ? false : stryMutAct_9fa48("7564") ? true : (stryCov_9fa48("7564", "7565", "7566", "7567"), scenarios.length > 0)) ? scenarios[0] : null;
    const scenarioName = stryMutAct_9fa48("7570") ? firstScenario?.scenario && null : stryMutAct_9fa48("7569") ? false : stryMutAct_9fa48("7568") ? true : (stryCov_9fa48("7568", "7569", "7570"), (stryMutAct_9fa48("7571") ? firstScenario.scenario : (stryCov_9fa48("7571"), firstScenario?.scenario)) || null);
    const startedAt = stryMutAct_9fa48("7574") ? (firstScenario?.startedAt || report.timestamp) && (reportStats ? reportStats.mtime.toISOString() : null) : stryMutAct_9fa48("7573") ? false : stryMutAct_9fa48("7572") ? true : (stryCov_9fa48("7572", "7573", "7574"), (stryMutAct_9fa48("7576") ? firstScenario?.startedAt && report.timestamp : stryMutAct_9fa48("7575") ? false : (stryCov_9fa48("7575", "7576"), (stryMutAct_9fa48("7577") ? firstScenario.startedAt : (stryCov_9fa48("7577"), firstScenario?.startedAt)) || report.timestamp)) || (reportStats ? reportStats.mtime.toISOString() : null));
    const endedAt = stryMutAct_9fa48("7580") ? report.timestamp && (reportStats ? reportStats.mtime.toISOString() : null) : stryMutAct_9fa48("7579") ? false : stryMutAct_9fa48("7578") ? true : (stryCov_9fa48("7578", "7579", "7580"), report.timestamp || (reportStats ? reportStats.mtime.toISOString() : null));
    const failed = Number(stryMutAct_9fa48("7583") ? report.summary?.failed && REPORT_TIMESTAMP_FALLBACK_MS : stryMutAct_9fa48("7582") ? false : stryMutAct_9fa48("7581") ? true : (stryCov_9fa48("7581", "7582", "7583"), (stryMutAct_9fa48("7584") ? report.summary.failed : (stryCov_9fa48("7584"), report.summary?.failed)) || REPORT_TIMESTAMP_FALLBACK_MS));
    const status = (stryMutAct_9fa48("7588") ? failed <= REPORT_TIMESTAMP_FALLBACK_MS : stryMutAct_9fa48("7587") ? failed >= REPORT_TIMESTAMP_FALLBACK_MS : stryMutAct_9fa48("7586") ? false : stryMutAct_9fa48("7585") ? true : (stryCov_9fa48("7585", "7586", "7587", "7588"), failed > REPORT_TIMESTAMP_FALLBACK_MS)) ? ADMIN_TEST_RUN_STATUS.FAILED : ADMIN_TEST_RUN_STATUS.PASSED;
    const outputReportPath = join(ADMIN_TEST_RUN_PATH.OUTPUT_DIR, stryMutAct_9fa48("7589") ? `` : (stryCov_9fa48("7589"), `${runId}${ADMIN_TEST_DEFAULT.REPORT_EXTENSION}`));
    const manifestFromReport = resolvePlaybackManifestPath(firstScenario);
    const playbackPaths = buildScenarioPlaybackPaths(scenarioName, runId);
    const normalizedManifest = stryMutAct_9fa48("7592") ? (normalizeWorkspaceRelativePath(manifestFromReport, outputDir, workspaceRoot) || playbackPaths?.manifestPath) && null : stryMutAct_9fa48("7591") ? false : stryMutAct_9fa48("7590") ? true : (stryCov_9fa48("7590", "7591", "7592"), (stryMutAct_9fa48("7594") ? normalizeWorkspaceRelativePath(manifestFromReport, outputDir, workspaceRoot) && playbackPaths?.manifestPath : stryMutAct_9fa48("7593") ? false : (stryCov_9fa48("7593", "7594"), normalizeWorkspaceRelativePath(manifestFromReport, outputDir, workspaceRoot) || (stryMutAct_9fa48("7595") ? playbackPaths.manifestPath : (stryCov_9fa48("7595"), playbackPaths?.manifestPath)))) || null);
    const record = stryMutAct_9fa48("7596") ? {} : (stryCov_9fa48("7596"), {
      runId,
      scenario: scenarioName,
      startedAt,
      endedAt,
      playbackManifestPath: normalizedManifest,
      playbackEventsPath: stryMutAct_9fa48("7599") ? playbackPaths?.eventsPath && null : stryMutAct_9fa48("7598") ? false : stryMutAct_9fa48("7597") ? true : (stryCov_9fa48("7597", "7598", "7599"), (stryMutAct_9fa48("7600") ? playbackPaths.eventsPath : (stryCov_9fa48("7600"), playbackPaths?.eventsPath)) || null),
      playbackSamplesPath: stryMutAct_9fa48("7603") ? playbackPaths?.samplesPath && null : stryMutAct_9fa48("7602") ? false : stryMutAct_9fa48("7601") ? true : (stryCov_9fa48("7601", "7602", "7603"), (stryMutAct_9fa48("7604") ? playbackPaths.samplesPath : (stryCov_9fa48("7604"), playbackPaths?.samplesPath)) || null),
      playbackSnapshotsPath: stryMutAct_9fa48("7607") ? playbackPaths?.snapshotsPath && null : stryMutAct_9fa48("7606") ? false : stryMutAct_9fa48("7605") ? true : (stryCov_9fa48("7605", "7606", "7607"), (stryMutAct_9fa48("7608") ? playbackPaths.snapshotsPath : (stryCov_9fa48("7608"), playbackPaths?.snapshotsPath)) || null)
    });
    const urls = buildPlaybackUrls(record, outputDir, workspaceRoot);
    const progressMessage = (stryMutAct_9fa48("7611") ? status !== ADMIN_TEST_RUN_STATUS.PASSED : stryMutAct_9fa48("7610") ? false : stryMutAct_9fa48("7609") ? true : (stryCov_9fa48("7609", "7610", "7611"), status === ADMIN_TEST_RUN_STATUS.PASSED)) ? stryMutAct_9fa48("7612") ? "" : (stryCov_9fa48("7612"), 'Run completed successfully') : stryMutAct_9fa48("7613") ? "" : (stryCov_9fa48("7613"), 'Run failed');
    const examplesPayload = extractExamplesPayload(scenarios, outputDir, workspaceRoot);
    return stryMutAct_9fa48("7614") ? {} : (stryCov_9fa48("7614"), {
      runId,
      scenario: scenarioName,
      config: null,
      startedAt,
      endedAt,
      status,
      gitHash: null,
      outputReportPath,
      outputReportUrl: toOutputWebPath(outputReportPath, outputDir, workspaceRoot),
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
      progress: stryMutAct_9fa48("7615") ? {} : (stryCov_9fa48("7615"), {
        phase: (stryMutAct_9fa48("7618") ? status !== ADMIN_TEST_RUN_STATUS.PASSED : stryMutAct_9fa48("7617") ? false : stryMutAct_9fa48("7616") ? true : (stryCov_9fa48("7616", "7617", "7618"), status === ADMIN_TEST_RUN_STATUS.PASSED)) ? RUN_PROGRESS_PHASE.COMPLETED : RUN_PROGRESS_PHASE.FAILED,
        message: progressMessage,
        percent: FULL_PERCENT,
        updatedAt: stryMutAct_9fa48("7621") ? (endedAt || startedAt) && new Date(nowFn()).toISOString() : stryMutAct_9fa48("7620") ? false : stryMutAct_9fa48("7619") ? true : (stryCov_9fa48("7619", "7620", "7621"), (stryMutAct_9fa48("7623") ? endedAt && startedAt : stryMutAct_9fa48("7622") ? false : (stryCov_9fa48("7622", "7623"), endedAt || startedAt)) || new Date(nowFn()).toISOString())
      }),
      summary: stryMutAct_9fa48("7626") ? report.summary && null : stryMutAct_9fa48("7625") ? false : stryMutAct_9fa48("7624") ? true : (stryCov_9fa48("7624", "7625", "7626"), report.summary || null),
      examplesSummary: examplesPayload.summary,
      examplesArtifactPath: examplesPayload.artifactPath,
      examplesArtifactUrl: toOutputWebPath(examplesPayload.artifactPath, outputDir, workspaceRoot)
    });
  }
}

/**
 * Fill missing playback path fields from scenario defaults.
 * @param {Object} merged - Mutable merged record.
 */
function fillPlaybackPaths(merged) {
  if (stryMutAct_9fa48("7627")) {
    {}
  } else {
    stryCov_9fa48("7627");
    const paths = buildScenarioPlaybackPaths(merged.scenario, stryMutAct_9fa48("7630") ? merged.runId && null : stryMutAct_9fa48("7629") ? false : stryMutAct_9fa48("7628") ? true : (stryCov_9fa48("7628", "7629", "7630"), merged.runId || null));
    if (stryMutAct_9fa48("7633") ? false : stryMutAct_9fa48("7632") ? true : stryMutAct_9fa48("7631") ? paths : (stryCov_9fa48("7631", "7632", "7633"), !paths)) {
      if (stryMutAct_9fa48("7634")) {
        {}
      } else {
        stryCov_9fa48("7634");
        return;
      }
    }
    if (stryMutAct_9fa48("7637") ? false : stryMutAct_9fa48("7636") ? true : stryMutAct_9fa48("7635") ? merged.playbackManifestPath : (stryCov_9fa48("7635", "7636", "7637"), !merged.playbackManifestPath)) {
      if (stryMutAct_9fa48("7638")) {
        {}
      } else {
        stryCov_9fa48("7638");
        merged.playbackManifestPath = paths.manifestPath;
      }
    }
    if (stryMutAct_9fa48("7641") ? false : stryMutAct_9fa48("7640") ? true : stryMutAct_9fa48("7639") ? merged.playbackEventsPath : (stryCov_9fa48("7639", "7640", "7641"), !merged.playbackEventsPath)) {
      if (stryMutAct_9fa48("7642")) {
        {}
      } else {
        stryCov_9fa48("7642");
        merged.playbackEventsPath = paths.eventsPath;
      }
    }
    if (stryMutAct_9fa48("7645") ? false : stryMutAct_9fa48("7644") ? true : stryMutAct_9fa48("7643") ? merged.playbackSamplesPath : (stryCov_9fa48("7643", "7644", "7645"), !merged.playbackSamplesPath)) {
      if (stryMutAct_9fa48("7646")) {
        {}
      } else {
        stryCov_9fa48("7646");
        merged.playbackSamplesPath = paths.samplesPath;
      }
    }
    if (stryMutAct_9fa48("7649") ? false : stryMutAct_9fa48("7648") ? true : stryMutAct_9fa48("7647") ? merged.playbackSnapshotsPath : (stryCov_9fa48("7647", "7648", "7649"), !merged.playbackSnapshotsPath)) {
      if (stryMutAct_9fa48("7650")) {
        {}
      } else {
        stryCov_9fa48("7650");
        merged.playbackSnapshotsPath = paths.snapshotsPath;
      }
    }
  }
}

/**
 * Fill missing playback URL fields from path fields.
 * @param {Object} merged - Mutable merged record.
 * @param {string} outputDir
 * @param {string} workspaceRoot
 */
function fillPlaybackUrls(merged, outputDir, workspaceRoot) {
  if (stryMutAct_9fa48("7651")) {
    {}
  } else {
    stryCov_9fa48("7651");
    if (stryMutAct_9fa48("7654") ? false : stryMutAct_9fa48("7653") ? true : stryMutAct_9fa48("7652") ? merged.playbackManifestUrl : (stryCov_9fa48("7652", "7653", "7654"), !merged.playbackManifestUrl)) {
      if (stryMutAct_9fa48("7655")) {
        {}
      } else {
        stryCov_9fa48("7655");
        merged.playbackManifestUrl = toOutputWebPath(merged.playbackManifestPath, outputDir, workspaceRoot);
      }
    }
    if (stryMutAct_9fa48("7658") ? false : stryMutAct_9fa48("7657") ? true : stryMutAct_9fa48("7656") ? merged.playbackEventsUrl : (stryCov_9fa48("7656", "7657", "7658"), !merged.playbackEventsUrl)) {
      if (stryMutAct_9fa48("7659")) {
        {}
      } else {
        stryCov_9fa48("7659");
        merged.playbackEventsUrl = toOutputWebPath(merged.playbackEventsPath, outputDir, workspaceRoot);
      }
    }
    if (stryMutAct_9fa48("7662") ? false : stryMutAct_9fa48("7661") ? true : stryMutAct_9fa48("7660") ? merged.playbackSamplesUrl : (stryCov_9fa48("7660", "7661", "7662"), !merged.playbackSamplesUrl)) {
      if (stryMutAct_9fa48("7663")) {
        {}
      } else {
        stryCov_9fa48("7663");
        merged.playbackSamplesUrl = toOutputWebPath(merged.playbackSamplesPath, outputDir, workspaceRoot);
      }
    }
    if (stryMutAct_9fa48("7666") ? false : stryMutAct_9fa48("7665") ? true : stryMutAct_9fa48("7664") ? merged.playbackSnapshotsUrl : (stryCov_9fa48("7664", "7665", "7666"), !merged.playbackSnapshotsUrl)) {
      if (stryMutAct_9fa48("7667")) {
        {}
      } else {
        stryCov_9fa48("7667");
        merged.playbackSnapshotsUrl = toOutputWebPath(merged.playbackSnapshotsPath, outputDir, workspaceRoot);
      }
    }
    if (stryMutAct_9fa48("7670") ? !merged.playbackViewerUrl || merged.playbackManifestPath : stryMutAct_9fa48("7669") ? false : stryMutAct_9fa48("7668") ? true : (stryCov_9fa48("7668", "7669", "7670"), (stryMutAct_9fa48("7671") ? merged.playbackViewerUrl : (stryCov_9fa48("7671"), !merged.playbackViewerUrl)) && merged.playbackManifestPath)) {
      if (stryMutAct_9fa48("7672")) {
        {}
      } else {
        stryCov_9fa48("7672");
        merged.playbackViewerUrl = buildPlaybackViewerUrl(merged.playbackManifestPath, outputDir, workspaceRoot);
      }
    }
    if (stryMutAct_9fa48("7675") ? false : stryMutAct_9fa48("7674") ? true : stryMutAct_9fa48("7673") ? merged.livePlaybackViewerUrl : (stryCov_9fa48("7673", "7674", "7675"), !merged.livePlaybackViewerUrl)) {
      if (stryMutAct_9fa48("7676")) {
        {}
      } else {
        stryCov_9fa48("7676");
        merged.livePlaybackViewerUrl = buildLivePlaybackViewerUrl(stryMutAct_9fa48("7677") ? {} : (stryCov_9fa48("7677"), {
          eventsUrl: merged.playbackEventsUrl,
          samplesUrl: merged.playbackSamplesUrl,
          snapshotsUrl: merged.playbackSnapshotsUrl
        }), stryMutAct_9fa48("7678") ? {} : (stryCov_9fa48("7678"), {
          follow: stryMutAct_9fa48("7679") ? true : (stryCov_9fa48("7679"), false),
          autoplay: stryMutAct_9fa48("7680") ? true : (stryCov_9fa48("7680"), false),
          runId: merged.runId,
          runStartMs: stryMutAct_9fa48("7683") ? Date.parse(merged.startedAt || EMPTY_STRING) && null : stryMutAct_9fa48("7682") ? false : stryMutAct_9fa48("7681") ? true : (stryCov_9fa48("7681", "7682", "7683"), Date.parse(stryMutAct_9fa48("7686") ? merged.startedAt && EMPTY_STRING : stryMutAct_9fa48("7685") ? false : stryMutAct_9fa48("7684") ? true : (stryCov_9fa48("7684", "7685", "7686"), merged.startedAt || EMPTY_STRING)) || null)
        }));
      }
    }
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
function mergeRunRecord(left, right, outputDir, workspaceRoot, buildProgress) {
  if (stryMutAct_9fa48("7687")) {
    {}
  } else {
    stryCov_9fa48("7687");
    const merged = stryMutAct_9fa48("7688") ? {} : (stryCov_9fa48("7688"), {
      ...left
    });
    for (const [key, value] of Object.entries(stryMutAct_9fa48("7691") ? right && {} : stryMutAct_9fa48("7690") ? false : stryMutAct_9fa48("7689") ? true : (stryCov_9fa48("7689", "7690", "7691"), right || {}))) {
      if (stryMutAct_9fa48("7692")) {
        {}
      } else {
        stryCov_9fa48("7692");
        if (stryMutAct_9fa48("7695") ? value !== undefined && value !== null || value !== EMPTY_STRING : stryMutAct_9fa48("7694") ? false : stryMutAct_9fa48("7693") ? true : (stryCov_9fa48("7693", "7694", "7695"), (stryMutAct_9fa48("7697") ? value !== undefined || value !== null : stryMutAct_9fa48("7696") ? true : (stryCov_9fa48("7696", "7697"), (stryMutAct_9fa48("7699") ? value === undefined : stryMutAct_9fa48("7698") ? true : (stryCov_9fa48("7698", "7699"), value !== undefined)) && (stryMutAct_9fa48("7701") ? value === null : stryMutAct_9fa48("7700") ? true : (stryCov_9fa48("7700", "7701"), value !== null)))) && (stryMutAct_9fa48("7703") ? value === EMPTY_STRING : stryMutAct_9fa48("7702") ? true : (stryCov_9fa48("7702", "7703"), value !== EMPTY_STRING)))) {
          if (stryMutAct_9fa48("7704")) {
            {}
          } else {
            stryCov_9fa48("7704");
            merged[key] = value;
          }
        } else if (stryMutAct_9fa48("7707") ? false : stryMutAct_9fa48("7706") ? true : stryMutAct_9fa48("7705") ? key in merged : (stryCov_9fa48("7705", "7706", "7707"), !(key in merged))) {
          if (stryMutAct_9fa48("7708")) {
            {}
          } else {
            stryCov_9fa48("7708");
            merged[key] = value;
          }
        }
      }
    }
    fillPlaybackPaths(merged);
    fillPlaybackUrls(merged, outputDir, workspaceRoot);
    if (stryMutAct_9fa48("7711") ? !merged.progress || merged.status : stryMutAct_9fa48("7710") ? false : stryMutAct_9fa48("7709") ? true : (stryCov_9fa48("7709", "7710", "7711"), (stryMutAct_9fa48("7712") ? merged.progress : (stryCov_9fa48("7712"), !merged.progress)) && merged.status)) {
      if (stryMutAct_9fa48("7713")) {
        {}
      } else {
        stryCov_9fa48("7713");
        const isDone = stryMutAct_9fa48("7714") ? isRunStatusActive(merged.status) : (stryCov_9fa48("7714"), !isRunStatusActive(merged.status));
        merged.progress = buildProgress(stryMutAct_9fa48("7715") ? {} : (stryCov_9fa48("7715"), {
          phase: isDone ? RUN_PROGRESS_PHASE.COMPLETED : RUN_PROGRESS_PHASE.SCENARIO_RUNNING,
          message: stryMutAct_9fa48("7716") ? `` : (stryCov_9fa48("7716"), `Run status: ${merged.status}`),
          percent: isDone ? FULL_PERCENT : HALF_PERCENT
        }));
      }
    }
    if (stryMutAct_9fa48("7719") ? !merged.examplesArtifactUrl || merged.examplesArtifactPath : stryMutAct_9fa48("7718") ? false : stryMutAct_9fa48("7717") ? true : (stryCov_9fa48("7717", "7718", "7719"), (stryMutAct_9fa48("7720") ? merged.examplesArtifactUrl : (stryCov_9fa48("7720"), !merged.examplesArtifactUrl)) && merged.examplesArtifactPath)) {
      if (stryMutAct_9fa48("7721")) {
        {}
      } else {
        stryCov_9fa48("7721");
        merged.examplesArtifactUrl = toOutputWebPath(merged.examplesArtifactPath, outputDir, workspaceRoot);
      }
    }
    return merged;
  }
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
function serializeRun(run, options, outputDir, workspaceRoot) {
  if (stryMutAct_9fa48("7722")) {
    {}
  } else {
    stryCov_9fa48("7722");
    const payload = stryMutAct_9fa48("7723") ? {} : (stryCov_9fa48("7723"), {
      runId: run.runId,
      scenario: stryMutAct_9fa48("7726") ? run.scenario && null : stryMutAct_9fa48("7725") ? false : stryMutAct_9fa48("7724") ? true : (stryCov_9fa48("7724", "7725", "7726"), run.scenario || null),
      config: stryMutAct_9fa48("7729") ? run.config && null : stryMutAct_9fa48("7728") ? false : stryMutAct_9fa48("7727") ? true : (stryCov_9fa48("7727", "7728", "7729"), run.config || null),
      gitHash: stryMutAct_9fa48("7732") ? run.gitHash && null : stryMutAct_9fa48("7731") ? false : stryMutAct_9fa48("7730") ? true : (stryCov_9fa48("7730", "7731", "7732"), run.gitHash || null),
      startedAt: stryMutAct_9fa48("7735") ? run.startedAt && null : stryMutAct_9fa48("7734") ? false : stryMutAct_9fa48("7733") ? true : (stryCov_9fa48("7733", "7734", "7735"), run.startedAt || null),
      endedAt: stryMutAct_9fa48("7738") ? run.endedAt && null : stryMutAct_9fa48("7737") ? false : stryMutAct_9fa48("7736") ? true : (stryCov_9fa48("7736", "7737", "7738"), run.endedAt || null),
      status: stryMutAct_9fa48("7741") ? run.status && null : stryMutAct_9fa48("7740") ? false : stryMutAct_9fa48("7739") ? true : (stryCov_9fa48("7739", "7740", "7741"), run.status || null),
      outputReportPath: stryMutAct_9fa48("7744") ? run.outputReportPath && null : stryMutAct_9fa48("7743") ? false : stryMutAct_9fa48("7742") ? true : (stryCov_9fa48("7742", "7743", "7744"), run.outputReportPath || null),
      outputReportUrl: stryMutAct_9fa48("7747") ? run.outputReportUrl && toOutputWebPath(run.outputReportPath, outputDir, workspaceRoot) : stryMutAct_9fa48("7746") ? false : stryMutAct_9fa48("7745") ? true : (stryCov_9fa48("7745", "7746", "7747"), run.outputReportUrl || toOutputWebPath(run.outputReportPath, outputDir, workspaceRoot)),
      playbackManifestPath: stryMutAct_9fa48("7750") ? run.playbackManifestPath && null : stryMutAct_9fa48("7749") ? false : stryMutAct_9fa48("7748") ? true : (stryCov_9fa48("7748", "7749", "7750"), run.playbackManifestPath || null),
      playbackManifestUrl: stryMutAct_9fa48("7753") ? run.playbackManifestUrl && null : stryMutAct_9fa48("7752") ? false : stryMutAct_9fa48("7751") ? true : (stryCov_9fa48("7751", "7752", "7753"), run.playbackManifestUrl || null),
      playbackViewerUrl: stryMutAct_9fa48("7756") ? run.playbackViewerUrl && null : stryMutAct_9fa48("7755") ? false : stryMutAct_9fa48("7754") ? true : (stryCov_9fa48("7754", "7755", "7756"), run.playbackViewerUrl || null),
      playbackEventsPath: stryMutAct_9fa48("7759") ? run.playbackEventsPath && null : stryMutAct_9fa48("7758") ? false : stryMutAct_9fa48("7757") ? true : (stryCov_9fa48("7757", "7758", "7759"), run.playbackEventsPath || null),
      playbackSamplesPath: stryMutAct_9fa48("7762") ? run.playbackSamplesPath && null : stryMutAct_9fa48("7761") ? false : stryMutAct_9fa48("7760") ? true : (stryCov_9fa48("7760", "7761", "7762"), run.playbackSamplesPath || null),
      playbackSnapshotsPath: stryMutAct_9fa48("7765") ? run.playbackSnapshotsPath && null : stryMutAct_9fa48("7764") ? false : stryMutAct_9fa48("7763") ? true : (stryCov_9fa48("7763", "7764", "7765"), run.playbackSnapshotsPath || null),
      playbackEventsUrl: stryMutAct_9fa48("7768") ? run.playbackEventsUrl && null : stryMutAct_9fa48("7767") ? false : stryMutAct_9fa48("7766") ? true : (stryCov_9fa48("7766", "7767", "7768"), run.playbackEventsUrl || null),
      playbackSamplesUrl: stryMutAct_9fa48("7771") ? run.playbackSamplesUrl && null : stryMutAct_9fa48("7770") ? false : stryMutAct_9fa48("7769") ? true : (stryCov_9fa48("7769", "7770", "7771"), run.playbackSamplesUrl || null),
      playbackSnapshotsUrl: stryMutAct_9fa48("7774") ? run.playbackSnapshotsUrl && null : stryMutAct_9fa48("7773") ? false : stryMutAct_9fa48("7772") ? true : (stryCov_9fa48("7772", "7773", "7774"), run.playbackSnapshotsUrl || null),
      livePlaybackViewerUrl: stryMutAct_9fa48("7777") ? run.livePlaybackViewerUrl && null : stryMutAct_9fa48("7776") ? false : stryMutAct_9fa48("7775") ? true : (stryCov_9fa48("7775", "7776", "7777"), run.livePlaybackViewerUrl || null),
      examplesSummary: stryMutAct_9fa48("7780") ? run.examplesSummary && null : stryMutAct_9fa48("7779") ? false : stryMutAct_9fa48("7778") ? true : (stryCov_9fa48("7778", "7779", "7780"), run.examplesSummary || null),
      examplesArtifactPath: stryMutAct_9fa48("7783") ? run.examplesArtifactPath && null : stryMutAct_9fa48("7782") ? false : stryMutAct_9fa48("7781") ? true : (stryCov_9fa48("7781", "7782", "7783"), run.examplesArtifactPath || null),
      examplesArtifactUrl: stryMutAct_9fa48("7786") ? run.examplesArtifactUrl && null : stryMutAct_9fa48("7785") ? false : stryMutAct_9fa48("7784") ? true : (stryCov_9fa48("7784", "7785", "7786"), run.examplesArtifactUrl || null),
      exitCode: stryMutAct_9fa48("7787") ? run.exitCode && null : (stryCov_9fa48("7787"), run.exitCode ?? null),
      signal: stryMutAct_9fa48("7790") ? run.signal && null : stryMutAct_9fa48("7789") ? false : stryMutAct_9fa48("7788") ? true : (stryCov_9fa48("7788", "7789", "7790"), run.signal || null),
      pid: stryMutAct_9fa48("7793") ? run.pid && null : stryMutAct_9fa48("7792") ? false : stryMutAct_9fa48("7791") ? true : (stryCov_9fa48("7791", "7792", "7793"), run.pid || null),
      progress: stryMutAct_9fa48("7796") ? run.progress && null : stryMutAct_9fa48("7795") ? false : stryMutAct_9fa48("7794") ? true : (stryCov_9fa48("7794", "7795", "7796"), run.progress || null),
      summary: stryMutAct_9fa48("7799") ? run.summary && null : stryMutAct_9fa48("7798") ? false : stryMutAct_9fa48("7797") ? true : (stryCov_9fa48("7797", "7798", "7799"), run.summary || null)
    });
    if (stryMutAct_9fa48("7802") ? options.includeLogs : stryMutAct_9fa48("7801") ? false : stryMutAct_9fa48("7800") ? true : (stryCov_9fa48("7800", "7801", "7802"), options?.includeLogs)) {
      if (stryMutAct_9fa48("7803")) {
        {}
      } else {
        stryCov_9fa48("7803");
        payload.logs = Array.isArray(run.logBuffer) ? stryMutAct_9fa48("7804") ? [] : (stryCov_9fa48("7804"), [...run.logBuffer]) : stryMutAct_9fa48("7805") ? ["Stryker was here"] : (stryCov_9fa48("7805"), []);
      }
    }
    return payload;
  }
}
export { extractExamplesPayload, extractReportSummary, isRunStatusActive, mergeRunRecord, resolvePlaybackManifestPath, serializeRun };