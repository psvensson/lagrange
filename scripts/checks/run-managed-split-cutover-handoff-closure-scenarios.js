#!/usr/bin/env node
/**
 * Derive the managed split cutover handoff Quest scenario from an exact-source
 * GCP fixed/reverted A/B manifest. Fixed runs must be live PASSes with a
 * complete, strictly ordered handoff lifecycle in full node logs. Reverted
 * runs may pass or fail fail-honestly, but they must be measuring live runs on
 * one different, manifest-bound source fingerprint.
 */

import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {computeSourceFingerprint} from
  '../../src/diagnostics/source-fingerprint.js';
import {MANAGED_SPLIT_LOG_MSG} from
  '../../src/partition/partition-constants.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayForEach = Function.call.bind(Array.prototype.forEach);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayIsArray = Array.isArray;
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySort = Function.call.bind(Array.prototype.sort);
const bufferToString = Function.call.bind(Buffer.prototype.toString);
const booleanConstructor = Boolean;
const dateNow = Date.now;
const dateParse = Date.parse;
const DateConstructor = Date;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const numberIsFinite = Number.isFinite;
const setHas = Function.call.bind(Set.prototype.has);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSplit = Function.call.bind(String.prototype.split);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCENARIO = 'managed-split-cutover-handoff-closure';
const SOURCE_SCENARIO = 'movielens-lagrange-service-affinity-live';
const REPORT_DIR = 'test-output/reports';
const MANIFEST_FLAG = '--manifest';
const MANIFEST_SCHEMA_VERSION = 1;
const REQUIRED_FIXED_RUNS = 3;
const REQUIRED_REVERTED_RUNS = 2;
const HASH_ALGORITHM = 'sha256';
const HEX_ENCODING = 'hex';
const UTF8_ENCODING = 'utf8';
const GZIP_EXTENSION = '.gz';
const REPORT_EXTENSION = '.report.json';
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const LIVE_FIDELITY = 'live-gcp-fixed-reverted-ab';
const PRODUCER = 'managed-split-cutover-handoff-closure-derivation';
const QUERY_ERROR_MESSAGE = 'Partition service not found';
const QUERY_FAILURE_LOG_MESSAGE = 'Query execution failed';
const RATINGS_INSERT_PREFIX = 'INSERT INTO ratings';
const READINESS_GAP_REASON = 'planning_snapshot_refresh_pending';
const LINE_SEPARATOR = '\n';
const SOURCE_FINGERPRINT_MATCH_FIELD = 'srcFingerprintMatches';
const DISSOLUTION_TIME_INDEX = 3;

const HANDOFF_LOG_MESSAGES = objectFreeze(new Set([
  MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSING,
  MANAGED_SPLIT_LOG_MSG.HANDOFF_QUERY_PLANE_READY,
  MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSED,
  MANAGED_SPLIT_LOG_MSG.DISSOLUTION_DISPATCHED,
]));

function sha256(bytes) {
  return createHash(HASH_ALGORITHM).update(bytes).digest(HEX_ENCODING);
}

function resolveWorkspacePath(relativePath) {
  return path.resolve(ROOT, relativePath);
}

function readJson(relativePath) {
  return jsonParse(fs.readFileSync(
    resolveWorkspacePath(relativePath),
    UTF8_ENCODING,
  ));
}

function parseLogLine(line) {
  try {
    const parsed = jsonParse(line);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function readLogEvents(relativeLogDir) {
  const absoluteLogDir = resolveWorkspacePath(relativeLogDir);
  const names = arraySort(fs.readdirSync(absoluteLogDir));
  const events = [];
  arrayForEach(names, (name) => {
    const absolutePath = path.join(absoluteLogDir, name);
    if (!fs.statSync(absolutePath).isFile()) return;
    const bytes = fs.readFileSync(absolutePath);
    const text = stringEndsWith(name, GZIP_EXTENSION) ?
      bufferToString(gunzipSync(bytes), UTF8_ENCODING) :
      bufferToString(bytes, UTF8_ENCODING);
    arrayForEach(stringSplit(text, LINE_SEPARATOR), (line) => {
      const event = parseLogLine(line);
      if (event) events[events.length] = event;
    });
  });
  return events;
}

function readLiveOutcome(relativeReportPath) {
  const report = readJson(relativeReportPath);
  const entry = readFirstScenarioEntry(report);
  const current = entry.current || {};
  const detail = entry.detail || {};
  const verdict = current.verdict;
  return {
    timestamp: report.timestamp || '',
    reportSha256: sha256(fs.readFileSync(
      resolveWorkspacePath(relativeReportPath),
    )),
    scenarioMatches: report.scenario === SOURCE_SCENARIO &&
      entry.scenario === SOURCE_SCENARIO,
    measured: verdict === VERDICT_PASS || verdict === VERDICT_FAIL,
    passed: entry.passed === true && verdict === VERDICT_PASS,
    verdict,
    error: detail.error || null,
  };
}

function readFirstScenarioEntry(report) {
  const scenarios = report?.standardSummary?.scenarios;
  return arrayIsArray(scenarios) ? scenarios[0] || {} : {};
}

function readBootProvenance(events) {
  return arrayMap(arrayFilter(events, (event) =>
    objectHasOwn(event, SOURCE_FINGERPRINT_MATCH_FIELD)),
  (event) => ({
    bootedSrcFingerprint: event.bootedSrcFingerprint,
    expectedSrcFingerprint: event.expectedSrcFingerprint,
    srcFingerprintMatches: event.srcFingerprintMatches,
  }));
}

function buildOrderedHandoffEvidence(events) {
  const lifecycle = arrayFilter(events, (event) =>
    setHas(HANDOFF_LOG_MESSAGES, event.msg));
  const closures = arrayFilter(lifecycle, (event) =>
    event.msg === MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSED);
  return arrayMap(closures, (closed) =>
    buildHandoffEvidenceRow(lifecycle, closed));
}

function eventMatchesGeneration(event, closed, message) {
  return event.msg === message &&
    event.workflowId === closed.workflowId &&
    event.generation === closed.generation;
}

function findGenerationEvent(lifecycle, closed, message) {
  return arrayFind(lifecycle, (event) =>
    eventMatchesGeneration(event, closed, message)) || {};
}

function eventTime(event) {
  return event.time || '';
}

function eventArrayLength(value) {
  return arrayIsArray(value) ? value.length : 0;
}

function handoffTimesAreOrdered(times) {
  return arrayEvery(times, numberIsFinite) &&
    times[0] <= times[1] && times[1] <= times[2] &&
    times[2] <= times[DISSOLUTION_TIME_INDEX];
}

function buildHandoffEvidenceRow(lifecycle, closed) {
  const closing = findGenerationEvent(
    lifecycle,
    closed,
    MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSING,
  );
  const queryReady = findGenerationEvent(
    lifecycle,
    closed,
    MANAGED_SPLIT_LOG_MSG.HANDOFF_QUERY_PLANE_READY,
  );
  const dissolution = arrayFind(lifecycle, (event) =>
    event.msg === MANAGED_SPLIT_LOG_MSG.DISSOLUTION_DISPATCHED &&
    event.workflowId === closed.workflowId) || {};
  const times = arrayMap(
    [closing, queryReady, closed, dissolution],
    (event) => dateParse(eventTime(event)),
  );
  return {
    workflowId: closed.workflowId,
    generation: closed.generation,
    sourcePartitionId: closed.sourcePartitionId,
    targetPartitionIds: arrayIsArray(closed.targetPartitionIds) ?
      closed.targetPartitionIds : [],
    requiredNodeCount: eventArrayLength(closing.requiredNodeIds),
    acknowledgedNodeCount: eventArrayLength(queryReady.acknowledgedNodeIds),
    closingAt: eventTime(closing),
    queryPlaneReadyAt: eventTime(queryReady),
    handoffClosedAt: eventTime(closed),
    dissolutionAt: eventTime(dissolution),
    ordered: handoffTimesAreOrdered(times),
  };
}

function countTerminalRoutingFailures(events, firstClosureAt) {
  const boundary = dateParse(firstClosureAt || '');
  const afterBoundary = (event) => dateParse(event?.time || '') >= boundary;
  const sourceFailures = arrayFilter(events, (event) =>
    afterBoundary(event) &&
    event.msg === QUERY_FAILURE_LOG_MESSAGE &&
    event.error === QUERY_ERROR_MESSAGE &&
    stringIncludes(event.sql || '', RATINGS_INSERT_PREFIX));
  const childReadinessFailures = arrayFilter(events, (event) =>
    afterBoundary(event) &&
    event.msg === QUERY_FAILURE_LOG_MESSAGE &&
    (event.reasonCode === READINESS_GAP_REASON ||
      stringIncludes(event.error || '', READINESS_GAP_REASON)));
  return {
    sourcePartitionServiceNotFound: sourceFailures.length,
    childPlanningSnapshotRefreshPending: childReadinessFailures.length,
  };
}

function analyzeRun(entry, expectedFingerprint, requireFixedProof) {
  const outcome = readLiveOutcome(entry.report);
  const events = readLogEvents(entry.logDir);
  const bootProvenance = readBootProvenance(events);
  const bootMatches = bootProvenance.length > 0 &&
    arrayEvery(bootProvenance, (boot) =>
      boot.srcFingerprintMatches === true &&
      boot.bootedSrcFingerprint === expectedFingerprint &&
      boot.expectedSrcFingerprint === expectedFingerprint);
  const handoffs = requireFixedProof ? buildOrderedHandoffEvidence(events) : [];
  const orderedHandoffs = arrayFilter(handoffs, (handoff) =>
    handoff.ordered && handoff.requiredNodeCount >= 2 &&
    handoff.requiredNodeCount === handoff.acknowledgedNodeCount);
  const firstClosureAt = orderedHandoffs[0]?.handoffClosedAt || '';
  const terminalFailures = countTerminalRoutingFailures(events, firstClosureAt);
  const fixedProofPassed = !requireFixedProof || (
    outcome.passed && orderedHandoffs.length > 0 &&
    terminalFailures.sourcePartitionServiceNotFound === 0 &&
    terminalFailures.childPlanningSnapshotRefreshPending === 0
  );
  return {
    report: entry.report,
    logDir: entry.logDir,
    reportTimestamp: outcome.timestamp,
    reportSha256: outcome.reportSha256,
    verdict: outcome.verdict,
    error: outcome.error,
    scenarioMatches: outcome.scenarioMatches,
    measured: outcome.measured,
    bootNodeCount: bootProvenance.length,
    bootMatches,
    orderedHandoffs,
    terminalFailures,
    passed: outcome.scenarioMatches && outcome.measured && bootMatches &&
      fixedProofPassed,
  };
}

function abManifestIsValid(options) {
  const {
    manifest,
    fixedEntries,
    revertedEntries,
    fixedCandidateFingerprint,
    revertedCandidateFingerprint,
    currentFingerprint,
    revertArtifactSha256,
  } = options;
  return arrayEvery([
    manifest.schemaVersion === MANIFEST_SCHEMA_VERSION,
    manifest.scenario === SCENARIO,
    fixedEntries.length >= REQUIRED_FIXED_RUNS,
    revertedEntries.length >= REQUIRED_REVERTED_RUNS,
    fixedCandidateFingerprint === currentFingerprint,
    typeof revertedCandidateFingerprint === 'string',
    revertedCandidateFingerprint.length > 0,
    revertedCandidateFingerprint !== fixedCandidateFingerprint,
    revertArtifactSha256 === manifest.revertArtifactSha256,
  ], booleanConstructor);
}

function buildScenarioReport(fixedRun, context, timestamp) {
  const passed = context.globalPassed && fixedRun.passed;
  return {
    timestamp,
    scenario: SCENARIO,
    producer: PRODUCER,
    fidelity: LIVE_FIDELITY,
    summary: {total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1},
    optimizationSummary: {totalPriorityItems: passed ? 0 : 1},
    standardSummary: {scenarios: [{
      scenario: SCENARIO,
      passed,
      current: {passed, verdict: passed ? VERDICT_PASS : VERDICT_FAIL},
      detail: {
        fixedRun,
        fixedCandidateFingerprint: context.fixedCandidateFingerprint,
        revertedCandidateFingerprint: context.revertedCandidateFingerprint,
        revertedRuns: context.revertedRuns,
        revertArtifact: context.revertArtifact,
        revertArtifactSha256: context.revertArtifactSha256,
        manifest: context.manifestPath,
        manifestSha256: context.manifestSha256,
      },
    }]},
  };
}

async function deriveScenarioReports(manifestPath) {
  const manifestBytes = fs.readFileSync(resolveWorkspacePath(manifestPath));
  const manifest = jsonParse(bufferToString(manifestBytes, UTF8_ENCODING));
  const currentFingerprint = await computeSourceFingerprint(
    path.join(ROOT, 'src'),
  );
  const fixedEntries = arrayIsArray(manifest.fixed) ? manifest.fixed : [];
  const revertedEntries = arrayIsArray(manifest.reverted) ?
    manifest.reverted : [];
  const fixedCandidateFingerprint = manifest.fixedCandidateFingerprint;
  const revertedCandidateFingerprint = manifest.revertedCandidateFingerprint;
  const revertArtifactBytes = fs.readFileSync(resolveWorkspacePath(
    manifest.revertArtifact,
  ));
  const manifestValid = abManifestIsValid({
    manifest,
    fixedEntries,
    revertedEntries,
    fixedCandidateFingerprint,
    revertedCandidateFingerprint,
    currentFingerprint,
    revertArtifactSha256: sha256(revertArtifactBytes),
  });
  const fixedRuns = arrayMap(fixedEntries, (entry) =>
    analyzeRun(entry, fixedCandidateFingerprint, true));
  const revertedRuns = arrayMap(revertedEntries, (entry) =>
    analyzeRun(entry, revertedCandidateFingerprint, false));
  const globalPassed = manifestValid &&
    arrayEvery(fixedRuns, (run) => run.passed) &&
    arrayEvery(revertedRuns, (run) => run.passed);
  const context = {
    globalPassed,
    fixedCandidateFingerprint,
    revertedCandidateFingerprint,
    revertedRuns,
    revertArtifact: manifest.revertArtifact,
    revertArtifactSha256: manifest.revertArtifactSha256,
    manifestPath,
    manifestSha256: sha256(manifestBytes),
  };
  fs.mkdirSync(resolveWorkspacePath(REPORT_DIR), {recursive: true});
  const written = [];
  arrayForEach(fixedRuns, (fixedRun, index) => {
    const timestamp = fixedRun.reportTimestamp ||
      dateToISOString(new DateConstructor(dateNow() + index));
    const report = buildScenarioReport(fixedRun, context, timestamp);
    const fileStamp = stringReplace(timestamp, /[:.]/g, '-');
    const relativePath = path.join(
      REPORT_DIR,
      `${SCENARIO}-${fileStamp}${REPORT_EXTENSION}`,
    );
    fs.writeFileSync(
      resolveWorkspacePath(relativePath),
      `${jsonStringify(report, null, 2)}\n`,
    );
    written[written.length] = relativePath;
  });
  return {passed: globalPassed, fixedRuns, revertedRuns, written};
}

function resolveManifestPath(argv) {
  const flagIndex = arrayIndexOf(argv, MANIFEST_FLAG);
  return flagIndex >= 0 ? argv[flagIndex + 1] : '';
}

async function main(argv = arraySlice(process.argv, 2)) {
  const manifestPath = resolveManifestPath(argv);
  if (!manifestPath) throw new Error(`required ${MANIFEST_FLAG} <path>`);
  const result = await deriveScenarioReports(manifestPath);
  arrayForEach(result.written, (reportPath) =>
    process.stdout.write(`report: ${reportPath}\n`));
  process.stdout.write(`${SCENARIO}: ${result.passed ?
    VERDICT_PASS : VERDICT_FAIL}\n`);
  process.exitCode = result.passed ? 0 : 1;
}

const IS_MAIN = path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

export {
  analyzeRun,
  buildOrderedHandoffEvidence,
  countTerminalRoutingFailures,
  deriveScenarioReports,
};
