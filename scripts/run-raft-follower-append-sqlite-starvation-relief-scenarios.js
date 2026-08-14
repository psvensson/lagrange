#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {runTestFileSync} from './run-test-files.js';
import {
  computeSourceFingerprint,
} from '../src/diagnostics/source-fingerprint.js';

const SCENARIO = 'raft-follower-append-sqlite-starvation-relief';
const GUARD_FILE = 'test/raft/liferaft-catchup-batching.test.js';
const REPORT_DIRECTORY = 'test-output/reports';
const GUARD_TIMEOUT_MS = 300000;
const LIVE_PROFILE_PENDING = 'live_profile_pending';
const GUARD_TEST_FAILED = 'guard_test_failed';
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const LIVE_EVENTS_FLAG = '--live-events';
const LIVE_LOGS_FLAG = '--live-logs';
const LIVE_MANIFEST_FLAG = '--live-manifest';
const STANDARD_REPORT_FLAG = '--standard-report';
const OPERATOR_TERMINATED_FLAG = '--operator-terminated';
const CLUSTER_ACTIVE_STAGE = 'setup.cluster.active';
const NODE_CREATED_EVENT = 'node.created';
const GAP_PROFILE_MESSAGE = 'Event loop gap profile window';
const GAP_WATCHDOG_STARTED_MESSAGE = 'Event loop gap watchdog started';
const GAP_DETECTED_MESSAGE = 'Event loop gap detected';
const SYSTEM_STARTING_MESSAGE = 'Distributed Database System starting';
const COMMIT_APPLY_SYNC_SITE = 'raft_follower_commit_apply_slice';
const LIVE_ARTIFACT_IDENTITY_FAILED = 'live_artifact_identity_failed';
const MOVIELENS_LIVE_SCENARIO = 'movielens-lagrange-service-affinity-live';
const EXPECTED_NODE_COUNT = 5;
const RAFT_ELECTION_CEILING_MS = 3000;
const MAX_REPORT_AFTER_MANIFEST_MS = 300000;
const SHA256_ALGORITHM = 'sha256';
const HEX_ENCODING = 'hex';
const LINE_SEPARATOR = '\n';
const JSON_OBJECT_PREFIX = '{';
const LIVE_OWNER_PROFILE_LABEL = 'live owner profile';
const LIVE_PROFILE_PENDING_LABEL = 'live profile pending';
const OWNER_FRAME_PATTERN =
  /handleFollowerAppendBatch|commitEntries|liferaft-commit-scheduler|liferaft-follower-batch|sqlite-log-adapter-batch-api|@markwylde\/liferaft/i;
const SQLITE_OWNER_FUNCTION_PATTERN =
  /^(commit|commitBatch|saveCommand|saveCommands)$/;
const SQLITE_LOG_ADAPTER_URL_PATTERN = /src\/raft\/sqlite-log-adapter\.js$/;
const LOG_FILE_PATTERN = /\.log\.gz$/;
const LOG_FILE_SUFFIX = '.log.gz';
const MAX_EVIDENCE_ARRAY_LENGTH = 1000000;
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const TYPE_OBJECT = 'object';
const TYPE_NUMBER = 'number';
const TYPE_STRING = 'string';
const DESCRIPTOR_VALUE = 'value';
const CLUSTER_STAGE_EVENT = 'cluster.stage';
const EVIDENCE_ERROR = Object.freeze({
  ARRAY_LENGTH: 'Evidence array length is invalid',
  ARRAY_SHAPE: 'Evidence arrays must be dense own-data arrays',
  RECORD_SHAPE: 'Evidence records must contain only own data fields',
});
const EVIDENCE_FIELD = Object.freeze({
  BOOTED_SRC_FINGERPRINT: 'bootedSrcFingerprint',
  DETAILS: 'details',
  FN: 'fn',
  NODE_COUNT: 'nodeCount',
  NODE_ID: 'nodeId',
  PROFILE_ENABLED: 'profileEnabled',
  SCENARIO: 'scenario',
  SITE: 'site',
  STAGE: 'stage',
  TYPE: 'type',
  URL: 'url',
});

// Evidence is hostile input. Capture every intrinsic used at the boundary,
// then copy parsed JSON into frozen null-prototype records by own data
// descriptor. Later field reads therefore cannot invoke accessors or inherit
// polluted prototype values.
const arrayIsArray = Array.isArray;
const ArrayConstructor = Array;
const arraySliceIntrinsic = Array.prototype.slice;
const arraySortIntrinsic = Array.prototype.sort;
const dateParse = Date.parse;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectKeys = Object.keys;
const reflectApply = Reflect.apply;
const regexpTestIntrinsic = RegExp.prototype.test;
const stringEndsWithIntrinsic = String.prototype.endsWith;
const stringReplaceIntrinsic = String.prototype.replace;
const stringSplitIntrinsic = String.prototype.split;
const stringStartsWithIntrinsic = String.prototype.startsWith;
const stringTrimIntrinsic = String.prototype.trim;

function applyIntrinsic(fn, receiver, args) {
  return reflectApply(fn, receiver, args);
}

function ownDataValue(record, key) {
  if (record === null || typeof record !== TYPE_OBJECT) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(record, key);
  return descriptor && objectHasOwn(descriptor, DESCRIPTOR_VALUE) ?
    descriptor.value :
    undefined;
}

function canonicalizeJsonValue(value) {
  if (value === null || typeof value !== TYPE_OBJECT) {
    return value;
  }
  if (arrayIsArray(value)) {
    const length = ownDataValue(value, 'length');
    if (!numberIsSafeInteger(length) || length < 0 ||
      length > MAX_EVIDENCE_ARRAY_LENGTH) {
      throw new Error(EVIDENCE_ERROR.ARRAY_LENGTH);
    }
    const copy = new ArrayConstructor(length);
    for (let index = 0; index < length; index += 1) {
      const descriptor = objectGetOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !objectHasOwn(descriptor, DESCRIPTOR_VALUE)) {
        throw new Error(EVIDENCE_ERROR.ARRAY_SHAPE);
      }
      copy[index] = canonicalizeJsonValue(descriptor.value);
    }
    return objectFreeze(copy);
  }
  const copy = objectCreate(null);
  const keys = objectKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !objectHasOwn(descriptor, DESCRIPTOR_VALUE)) {
      throw new Error(EVIDENCE_ERROR.RECORD_SHAPE);
    }
    copy[key] = canonicalizeJsonValue(descriptor.value);
  }
  return objectFreeze(copy);
}

function parseEvidenceJson(text) {
  return canonicalizeJsonValue(jsonParse(text));
}

function isRecord(value) {
  return value !== null && typeof value === TYPE_OBJECT &&
    !arrayIsArray(value);
}

function ownRecord(record, key) {
  const value = ownDataValue(record, key);
  return isRecord(value) ? value : null;
}

function ownArray(record, key) {
  const value = ownDataValue(record, key);
  return arrayIsArray(value) ? value : null;
}

function ownString(record, key) {
  const value = ownDataValue(record, key);
  return typeof value === TYPE_STRING ? value : null;
}

function isSafeNonNegativeInteger(value) {
  return typeof value === TYPE_NUMBER && numberIsSafeInteger(value) &&
    value >= 0 && !objectIs(value, -0);
}

function isSafeNonNegativeNumber(value) {
  return typeof value === TYPE_NUMBER && numberIsFinite(value) &&
    value >= 0 && value <= MAX_SAFE_INTEGER &&
    !objectIs(value, -0);
}

function safeCountSum(values) {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!isSafeNonNegativeInteger(value) ||
      !numberIsSafeInteger(total + value)) {
      return {valid: false, value: 0};
    }
    total += value;
  }
  return {valid: true, value: total};
}

function sortStrings(values) {
  return applyIntrinsic(arraySortIntrinsic, values, [
    (left, right) => left < right ? -1 : (left > right ? 1 : 0),
  ]);
}

function regexpTest(pattern, value) {
  return applyIntrinsic(regexpTestIntrinsic, pattern, [value]);
}

function readOption(argv, flag) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return typeof argv[index + 1] === TYPE_STRING ? argv[index + 1] : null;
    }
  }
  return null;
}

function hasOption(argv, flag) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) return true;
  }
  return false;
}

function readJsonLines(text) {
  const lines = applyIntrinsic(stringSplitIntrinsic, text, [LINE_SEPARATOR]);
  const records = [];
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = applyIntrinsic(stringTrimIntrinsic, lines[index], []);
    if (!applyIntrinsic(
      stringStartsWithIntrinsic,
      trimmed,
      [JSON_OBJECT_PREFIX],
    )) continue;
    const parsed = parseEvidenceJson(trimmed);
    if (isRecord(parsed)) records[records.length] = parsed;
  }
  return objectFreeze(records);
}

function frameOwnerDurationMs(frame) {
  const fn = ownString(frame, 'fn') || '';
  const url = ownString(frame, 'url') || '';
  const label = `${fn} ${url}`;
  const isSQLiteOwnerFrame =
    regexpTest(SQLITE_OWNER_FUNCTION_PATTERN, fn) &&
    regexpTest(SQLITE_LOG_ADAPTER_URL_PATTERN, url);
  if (!regexpTest(OWNER_FRAME_PATTERN, label) && !isSQLiteOwnerFrame) {
    return null;
  }
  const inclusiveMs = ownDataValue(frame, 'inclusiveMs');
  const durationMs = inclusiveMs === undefined ?
    ownDataValue(frame, 'selfMs') :
    inclusiveMs;
  return isSafeNonNegativeNumber(durationMs) ? durationMs : NaN;
}

function sha256File(filePath) {
  return createHash(SHA256_ALGORITHM)
    .update(fs.readFileSync(filePath))
    .digest(HEX_ENCODING);
}

function readLiveProfileEvidence(options) {
  const {
    currentSourceFingerprint,
    eventsPath,
    logsDirectory,
    manifestPath,
    operatorTerminated,
    standardReportPath,
  } = options;
  const manifest = parseEvidenceJson(fs.readFileSync(manifestPath, 'utf8'));
  const standardReport = parseEvidenceJson(
    fs.readFileSync(standardReportPath, 'utf8'),
  );
  const events = readJsonLines(fs.readFileSync(eventsPath, 'utf8'));
  const manifestStartedAt = ownDataValue(manifest, 'startedAt');
  const manifestEndedAt = ownDataValue(manifest, 'endedAt');
  const manifestIntervalValid =
    isSafeNonNegativeInteger(manifestStartedAt) &&
    isSafeNonNegativeInteger(manifestEndedAt) &&
    manifestStartedAt <= manifestEndedAt;
  let activeEvent = null;
  const eventNodeIds = [];
  let eventTimingsValid = true;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const eventTimestamp = ownDataValue(event, 'timestamp');
    if (!isSafeNonNegativeInteger(eventTimestamp)) {
      eventTimingsValid = false;
      continue;
    }
    const details = ownRecord(event, 'details');
    if (ownString(event, EVIDENCE_FIELD.TYPE) === CLUSTER_STAGE_EVENT &&
      details &&
      ownString(details, EVIDENCE_FIELD.STAGE) === CLUSTER_ACTIVE_STAGE &&
      ownDataValue(details, EVIDENCE_FIELD.NODE_COUNT) ===
        EXPECTED_NODE_COUNT &&
      activeEvent === null) {
      activeEvent = event;
    }
    if (ownString(event, EVIDENCE_FIELD.TYPE) === NODE_CREATED_EVENT &&
      manifestIntervalValid && eventTimestamp >= manifestStartedAt &&
      eventTimestamp <= manifestEndedAt) {
      const nodeId = ownString(event, 'entityId');
      if (nodeId === null) {
        eventTimingsValid = false;
      } else {
        eventNodeIds[eventNodeIds.length] = nodeId;
      }
    }
  }
  sortStrings(eventNodeIds);
  const directoryFiles = fs.readdirSync(logsDirectory);
  const logFiles = [];
  for (let index = 0; index < directoryFiles.length; index += 1) {
    const file = directoryFiles[index];
    if (applyIntrinsic(stringEndsWithIntrinsic, file, [LOG_FILE_SUFFIX])) {
      logFiles[logFiles.length] = file;
    }
  }
  sortStrings(logFiles);
  const nodes = [];
  for (let fileIndex = 0; fileIndex < logFiles.length; fileIndex += 1) {
    const file = logFiles[fileIndex];
    const logPath = path.join(logsDirectory, file);
    const records = readJsonLines(gunzipSync(
      fs.readFileSync(logPath),
    ).toString('utf8'));
    let boot = null;
    let profileStarted = false;
    let profileWindowCount = 0;
    let profileArraysValid = true;
    let commitApplySitesValid = true;
    const commitApplyCounts = [];
    const commitApplyMaxima = [];
    const ownerFrames = [];
    let ownerFramesValid = true;
    for (let recordIndex = 0; recordIndex < records.length;
      recordIndex += 1) {
      const record = records[recordIndex];
      const message = ownString(record, 'msg');
      if (message === SYSTEM_STARTING_MESSAGE && boot === null) boot = record;
      if (message === GAP_WATCHDOG_STARTED_MESSAGE &&
        ownDataValue(record, EVIDENCE_FIELD.PROFILE_ENABLED) === true) {
        profileStarted = true;
      }
      if (message === GAP_PROFILE_MESSAGE) {
        profileWindowCount += 1;
        const topFrames = ownArray(record, 'topFrames');
        const topInclusiveFrames = ownArray(record, 'topInclusiveFrames');
        if (!topFrames || !topInclusiveFrames) {
          profileArraysValid = false;
        } else {
          const frameArrays = [topFrames, topInclusiveFrames];
          for (let arrayIndex = 0; arrayIndex < frameArrays.length;
            arrayIndex += 1) {
            const frames = frameArrays[arrayIndex];
            for (let frameIndex = 0; frameIndex < frames.length;
              frameIndex += 1) {
              const frame = frames[frameIndex];
              if (!isRecord(frame)) {
                ownerFramesValid = false;
                continue;
              }
              const durationMs = frameOwnerDurationMs(frame);
              if (durationMs === null) continue;
              if (!isSafeNonNegativeNumber(durationMs)) {
                ownerFramesValid = false;
                continue;
              }
              ownerFrames[ownerFrames.length] = {
                fn: ownString(frame, EVIDENCE_FIELD.FN),
                url: ownString(frame, EVIDENCE_FIELD.URL),
                durationMs,
              };
            }
          }
        }
      }
      if (message === GAP_DETECTED_MESSAGE) {
        const siteDeltas = ownArray(record, 'siteDeltas');
        if (!siteDeltas) {
          commitApplySitesValid = false;
          continue;
        }
        for (let siteIndex = 0; siteIndex < siteDeltas.length;
          siteIndex += 1) {
          const site = siteDeltas[siteIndex];
          if (!isRecord(site)) {
            commitApplySitesValid = false;
            continue;
          }
          if (ownString(site, EVIDENCE_FIELD.SITE) !==
            COMMIT_APPLY_SYNC_SITE) continue;
          const count = ownDataValue(site, 'count');
          const totalMs = ownDataValue(site, 'totalMs');
          const maxMs = ownDataValue(site, 'maxMs');
          if (!isSafeNonNegativeInteger(count) ||
            !isSafeNonNegativeNumber(totalMs) ||
            !isSafeNonNegativeNumber(maxMs)) {
            commitApplySitesValid = false;
            continue;
          }
          commitApplyCounts[commitApplyCounts.length] = count;
          commitApplyMaxima[commitApplyMaxima.length] = maxMs;
        }
      }
    }
    const commitCount = safeCountSum(commitApplyCounts);
    if (!commitCount.valid) commitApplySitesValid = false;
    let maxCommitApplySliceMs = 0;
    for (let index = 0; index < commitApplyMaxima.length; index += 1) {
      if (commitApplyMaxima[index] > maxCommitApplySliceMs) {
        maxCommitApplySliceMs = commitApplyMaxima[index];
      }
    }
    let maxOwnerFrameMs = 0;
    for (let index = 0; index < ownerFrames.length; index += 1) {
      if (ownerFrames[index].durationMs > maxOwnerFrameMs) {
        maxOwnerFrameMs = ownerFrames[index].durationMs;
      }
    }
    const bootTime = ownString(boot, 'time');
    const bootedAtMs = bootTime === null ? NaN : dateParse(bootTime);
    nodes[nodes.length] = {
      nodeId: applyIntrinsic(stringReplaceIntrinsic, file, [LOG_FILE_PATTERN, '']),
      artifactSha256: sha256File(logPath),
      bootedNodeId: ownString(boot, EVIDENCE_FIELD.NODE_ID),
      bootedAtMs,
      bootTimeValid: isSafeNonNegativeInteger(bootedAtMs),
      bootedSrcFingerprint: ownString(
        boot,
        EVIDENCE_FIELD.BOOTED_SRC_FINGERPRINT,
      ),
      profileStarted,
      profileWindowCount,
      ownerFramesValid: ownerFramesValid && profileArraysValid,
      commitApplySitesValid,
      commitApplyCount: commitCount.value,
      maxCommitApplySliceMs,
      ownerFrames,
      maxOwnerFrameMs,
    };
  }
  const profileCounts = [];
  const ownerCounts = [];
  const commitCounts = [];
  let maxOwnerFrameMs = 0;
  let maxCommitApplySliceMs = 0;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    profileCounts[profileCounts.length] = node.profileWindowCount;
    ownerCounts[ownerCounts.length] = node.ownerFrames.length;
    commitCounts[commitCounts.length] = node.commitApplyCount;
    if (node.maxOwnerFrameMs > maxOwnerFrameMs) {
      maxOwnerFrameMs = node.maxOwnerFrameMs;
    }
    if (node.maxCommitApplySliceMs > maxCommitApplySliceMs) {
      maxCommitApplySliceMs = node.maxCommitApplySliceMs;
    }
  }
  const profileCount = safeCountSum(profileCounts);
  const ownerCount = safeCountSum(ownerCounts);
  const commitCount = safeCountSum(commitCounts);
  const standardSummary = ownRecord(standardReport, 'standardSummary');
  const scenarios = ownArray(standardSummary, 'scenarios');
  let standardScenario = null;
  if (scenarios) {
    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = scenarios[index];
      if (isRecord(scenario) &&
        ownString(scenario, EVIDENCE_FIELD.SCENARIO) ===
          MOVIELENS_LIVE_SCENARIO) {
        standardScenario = scenario;
        break;
      }
    }
  }
  const detail = ownRecord(standardScenario, 'detail');
  const hostScheduling = ownRecord(detail, 'hostScheduling');
  const schedulingNodes = ownArray(hostScheduling, 'perNode');
  const reportTime = ownString(standardReport, 'timestamp');
  const reportTimestamp = reportTime === null ? NaN : dateParse(reportTime);
  const reportTimestampValid = isSafeNonNegativeInteger(reportTimestamp);
  const manifestFiles = ownRecord(manifest, 'files');
  const manifestEvents = ownString(manifestFiles, 'events');
  const manifestEventPath = path.resolve(
    root,
    manifestEvents || '',
  );
  let nodeSetComplete = nodes.length === EXPECTED_NODE_COUNT;
  let bootTimesInsideManifest = nodeSetComplete && manifestIntervalValid;
  let sourceFingerprintMatches = nodeSetComplete;
  const logNodeIds = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    logNodeIds[logNodeIds.length] = node.nodeId;
    nodeSetComplete = nodeSetComplete && node.nodeId === node.bootedNodeId;
    bootTimesInsideManifest = bootTimesInsideManifest && node.bootTimeValid &&
      node.bootedAtMs >= manifestStartedAt &&
      node.bootedAtMs <= manifestEndedAt;
    sourceFingerprintMatches = sourceFingerprintMatches &&
      node.bootedSrcFingerprint === currentSourceFingerprint;
  }
  sortStrings(logNodeIds);
  let nodeSetMatchesEvents = eventNodeIds.length === EXPECTED_NODE_COUNT &&
    logNodeIds.length === eventNodeIds.length;
  for (let index = 0; nodeSetMatchesEvents && index < logNodeIds.length;
    index += 1) {
    nodeSetMatchesEvents = logNodeIds[index] === eventNodeIds[index];
  }
  let completeMaterializedLogs = schedulingNodes !== null &&
    schedulingNodes.length === EXPECTED_NODE_COUNT;
  if (schedulingNodes) {
    for (let index = 0; completeMaterializedLogs &&
      index < schedulingNodes.length; index += 1) {
      const schedulingNode = schedulingNodes[index];
      const readError = ownDataValue(schedulingNode, 'readError');
      completeMaterializedLogs = isRecord(schedulingNode) &&
        (readError === undefined || readError === null);
    }
  }
  const activeTimestamp = ownDataValue(activeEvent, 'timestamp');
  const identityChecks = {
    manifestIntervalValid,
    eventTimingsValid,
    derivedCountsValid: profileCount.valid && ownerCount.valid &&
      commitCount.valid,
    activeInsideManifest: activeEvent !== null &&
      isSafeNonNegativeInteger(activeTimestamp) &&
      activeTimestamp >= manifestStartedAt &&
      activeTimestamp <= manifestEndedAt,
    eventPathMatchesManifest: manifestEvents !== null &&
      manifestEventPath === eventsPath,
    logScenarioMatchesManifest:
      path.basename(logsDirectory) === ownString(manifest, 'scenarioName'),
    naturalTermination: operatorTerminated === false,
    nodeSetComplete,
    nodeSetMatchesEvents,
    bootTimesInsideManifest,
    sourceFingerprintMatches,
    standardReportBounded: manifestIntervalValid && reportTimestampValid &&
      ownString(standardReport, 'scenario') === MOVIELENS_LIVE_SCENARIO &&
      ownString(standardReport, 'fidelity') === 'live' &&
      reportTimestamp >= manifestEndedAt &&
      reportTimestamp - manifestEndedAt <= MAX_REPORT_AFTER_MANIFEST_MS,
    completeMaterializedLogs,
  };
  let identityPassed = true;
  const identityKeys = objectKeys(identityChecks);
  for (let index = 0; index < identityKeys.length; index += 1) {
    identityPassed = identityPassed &&
      identityChecks[identityKeys[index]] === true;
  }
  let allProfilesStarted = nodes.length === EXPECTED_NODE_COUNT;
  let allNodeTimingsValid = nodes.length === EXPECTED_NODE_COUNT;
  for (let index = 0; index < nodes.length; index += 1) {
    allProfilesStarted = allProfilesStarted && nodes[index].profileStarted;
    allNodeTimingsValid = allNodeTimingsValid &&
      nodes[index].ownerFramesValid && nodes[index].commitApplySitesValid;
  }
  return {
    passed: identityPassed &&
      allProfilesStarted && allNodeTimingsValid &&
      profileCount.value > 0 && commitCount.value > 0 &&
      ownerCount.value > 0 &&
      maxCommitApplySliceMs < RAFT_ELECTION_CEILING_MS &&
      maxOwnerFrameMs < RAFT_ELECTION_CEILING_MS,
    reason: identityPassed ? null : LIVE_ARTIFACT_IDENTITY_FAILED,
    activeNodeCount: ownDataValue(
      ownRecord(activeEvent, EVIDENCE_FIELD.DETAILS),
      EVIDENCE_FIELD.NODE_COUNT,
    ) || 0,
    activeAtMs: isSafeNonNegativeInteger(activeTimestamp) ?
      activeTimestamp : null,
    expectedNodeCount: EXPECTED_NODE_COUNT,
    profileWindowCount: profileCount.value,
    ownerFrameCount: ownerCount.value,
    commitApplyCount: commitCount.value,
    maxCommitApplySliceMs,
    maxOwnerFrameMs,
    electionCeilingMs: RAFT_ELECTION_CEILING_MS,
    nodes,
    identity: {
      passed: identityPassed,
      checks: identityChecks,
      currentSourceFingerprint,
      manifestSha256: sha256File(manifestPath),
      eventsSha256: sha256File(eventsPath),
      standardReportSha256: sha256File(standardReportPath),
    },
  };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function main(argv = applyIntrinsic(
  arraySliceIntrinsic,
  process.argv,
  [2],
)) {
  const liveEventsOption = readOption(argv, LIVE_EVENTS_FLAG);
  const liveLogsOption = readOption(argv, LIVE_LOGS_FLAG);
  const liveManifestOption = readOption(argv, LIVE_MANIFEST_FLAG);
  const standardReportOption = readOption(argv, STANDARD_REPORT_FLAG);
  const hasLiveEvidence = Boolean(
    liveEventsOption && liveLogsOption && liveManifestOption &&
    standardReportOption,
  );
  const guard = runTestFileSync(GUARD_FILE, {
    print: false,
    timeoutMs: GUARD_TIMEOUT_MS,
  });
  const timestamp = new Date().toISOString();
  const guardPassed = guard.ok === true;
  const currentSourceFingerprint = hasLiveEvidence ?
    await computeSourceFingerprint(path.join(root, 'src')) :
    null;
  const liveProfile = hasLiveEvidence ? readLiveProfileEvidence({
    currentSourceFingerprint,
    eventsPath: path.resolve(root, liveEventsOption),
    logsDirectory: path.resolve(root, liveLogsOption),
    manifestPath: path.resolve(root, liveManifestOption),
    operatorTerminated: hasOption(argv, OPERATOR_TERMINATED_FLAG),
    standardReportPath: path.resolve(root, standardReportOption),
  }) : {passed: false, reason: LIVE_PROFILE_PENDING};
  const passed = guardPassed && liveProfile.passed;

  const report = {
    timestamp,
    scenario: SCENARIO,
    producer: 'raft-follower-append-sqlite-starvation-relief-proof',
    fidelity: hasLiveEvidence ? 'live-owner-boundary' : 'deterministic-guard',
    summary: {
      total: 2,
      passed: (guardPassed ? 1 : 0) + (liveProfile.passed ? 1 : 0),
      failed: (guardPassed ? 0 : 1) + (liveProfile.passed ? 0 : 1),
    },
    optimizationSummary: {
      totalPriorityItems: passed ? 0 : 1,
    },
    standardSummary: {
      scenarios: [{
        scenario: SCENARIO,
        passed,
        current: {
          passed,
          verdict: passed ? VERDICT_PASS : VERDICT_FAIL,
          verdictReason: !guardPassed ? GUARD_TEST_FAILED :
            (liveProfile.reason || (passed ? null : LIVE_PROFILE_PENDING)),
        },
        detail: {
          deterministicGuard: {
            file: GUARD_FILE,
            passed: guardPassed,
            assertions: guard.assertions,
            reasons: guard.reasons,
            elapsedMs: guard.elapsedMs,
          },
          liveProfile,
          operatorTerminated: hasOption(argv, OPERATOR_TERMINATED_FLAG),
          standardReport: standardReportOption || null,
        },
      }],
    },
  };

  const reportDir = path.join(root, REPORT_DIRECTORY);
  fs.mkdirSync(reportDir, {recursive: true});
  const stamp = applyIntrinsic(stringReplaceIntrinsic, timestamp, [/[:.]/g, '-']);
  const reportPath = path.join(reportDir, `${SCENARIO}-${stamp}.report.json`);
  fs.writeFileSync(reportPath, `${jsonStringify(report, null, 2)}\n`);

  process.stdout.write(
    `${passed ? VERDICT_PASS : VERDICT_FAIL} deterministic guard and ` +
    `${hasLiveEvidence ? LIVE_OWNER_PROFILE_LABEL :
      LIVE_PROFILE_PENDING_LABEL}\n` +
    `report: ${path.relative(root, reportPath)}\n`,
  );
  process.exitCode = passed ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

export {
  canonicalizeJsonValue,
  frameOwnerDurationMs,
  parseEvidenceJson,
  readJsonLines,
  safeCountSum,
};
