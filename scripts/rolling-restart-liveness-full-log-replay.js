import fs from 'node:fs';
import path from 'node:path';
import {constants as zlibConstants, gunzipSync} from 'node:zlib';

const ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';
const EMPTY_TEXT = '';
const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const FIRST_INDEX = 0;
const LOG_GZIP_SUFFIX = '.log.gz';
const REPORT_JSON_SUFFIX = '.report.json';
const PLAYBACK_DIRNAME = '.playback';
const FULL_LOGS_DIRNAME = '.full-logs';
const SCENARIO_ROLLING_RESTART = 'rolling-restart';

const PROPERTY_FAILURE_BUNDLE = 'failureBundle';
const PROPERTY_REPORT = 'report';
const PROPERTY_SCENARIOS = 'scenarios';
const PROPERTY_JSON_PATH = 'jsonPath';
const PROPERTY_PUBLICATION_CONVERGENCE = 'publicationConvergence';
const PROPERTY_ACTIVE_GATE = 'activeGate';
const PROPERTY_PROGRESS = 'progress';
const PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE =
  'rollingRestartLivenessEvidence';

const FULL_LOG_REPLAY_STATE_COMPLETE = 'complete';
const FULL_LOG_REPLAY_STATE_MISSING = 'missing';
const FULL_LOG_REPLAY_STATE_UNRESOLVED = 'unresolved';
const EVIDENCE_COMPLETENESS_SPARSE = 'sparse';

const TRACE_MSG_CONVERGENCE_DECISION = 'convergence decision trace';
const DECISION_DRIVE = 'drive';
const DECISION_SKIP = 'skip';
const REASON_OWNER_RECONCILE_PENDING = 'owner_reconcile_pending';
const REASON_RECONCILE_IN_FLIGHT = 'reconcile-in-flight';
const OUTCOME_RECONCILE_COMMITTED = 'reconcile-committed';
const OUTCOME_RECONCILE_TIMED_OUT = 'reconcile-timed-out';
const ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION =
  'reconcile_owner_membership_publication';
const ACTION_EVENT_OWNER_RECONCILE_ENQUEUED = 'owner_reconcile_enqueued';
const ACTION_EVENT_RECONCILE_COMPLETED = 'reconcile_completed';
const ACTION_EVENT_RECONCILE_IN_FLIGHT = 'reconcile_in_flight';
const ACTION_STATE_EXECUTED = 'executed';
const ACTION_STATE_IN_FLIGHT = 'in_flight';
const SAMPLE_FIELD_MISSING_PUBLISHED_COUNT = 'missingPublishedCount';
const SAMPLE_FIELD_PUBLICATION_EPOCH = 'publicationEpoch';
const SAMPLE_FIELD_PENDING_RECONCILE_COUNT = 'pendingReconcileCount';

function enrichArtifactWithFullLogEvidenceSync(sourceArtifactPath, artifact) {
  const resolution = resolveFullLogDirectory(sourceArtifactPath, artifact);
  if (resolution.state !== FULL_LOG_REPLAY_STATE_COMPLETE) {
    if (hasExistingLivenessEvidence(artifact)) {
      return artifact;
    }
    return attachFullLogEvidence(artifact, {
      completeness: EVIDENCE_COMPLETENESS_SPARSE,
      samples: [],
      fullLogReplay: {
        state: resolution.state,
        evidencePath: resolution.evidencePath,
        filesScanned: NUM_ZERO,
        linesScanned: NUM_ZERO,
        decisionTraceCount: NUM_ZERO,
        matchedSampleCount: NUM_ZERO,
      },
    });
  }

  const replay = replayFullLogsSync(
    resolution.evidencePath,
    selectCurrentPublicationState(artifact),
  );
  return attachFullLogEvidence(artifact, {
    completeness: FULL_LOG_REPLAY_STATE_COMPLETE,
    samples: replay.samples,
    fullLogReplay: {
      state: FULL_LOG_REPLAY_STATE_COMPLETE,
      evidencePath: resolution.evidencePath,
      filesScanned: replay.filesScanned,
      linesScanned: replay.linesScanned,
      decisionTraceCount: replay.decisionTraceCount,
      matchedSampleCount: replay.samples.length,
      parseErrorCount: replay.parseErrorCount,
      currentStateFiltered: replay.currentStateFiltered,
      latestSampleTimestamp: replay.latestSampleTimestamp,
      outcomeCounts: replay.outcomeCounts,
    },
  });
}

function attachFullLogEvidence(artifact, fullLogEvidence) {
  const existingEvidence = firstRecord(
    artifact[PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE],
  );
  return {
    ...artifact,
    [PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE]: {
      ...existingEvidence,
      ...fullLogEvidence,
    },
  };
}

function resolveFullLogDirectory(sourceArtifactPath, artifact) {
  const report = firstRecord(artifact[PROPERTY_REPORT], artifact);
  const scenario = selectScenario(report);
  const scenarioName = textValue(
    scenario.scenario,
    scenario.name,
    scenario.playback?.scenarioName,
    SCENARIO_ROLLING_RESTART,
  );
  const failureBundlePath = resolveLinkedPath(
    sourceArtifactPath,
    scenario[PROPERTY_FAILURE_BUNDLE]?.[PROPERTY_JSON_PATH],
  );
  const linkedCandidate = failureBundlePath ?
    path.join(
      path.dirname(path.dirname(failureBundlePath)),
      FULL_LOGS_DIRNAME,
      scenarioName,
    ) :
    EMPTY_TEXT;
  const reportCandidate = resolveReportSiblingFullLogPath(
    sourceArtifactPath,
    scenarioName,
  );
  const candidates = [linkedCandidate, reportCandidate].filter(Boolean);
  for (const candidate of candidates) {
    if (hasLogGzipFiles(candidate)) {
      return {
        state: FULL_LOG_REPLAY_STATE_COMPLETE,
        evidencePath: candidate,
      };
    }
  }
  return {
    state: candidates.length > NUM_ZERO ?
      FULL_LOG_REPLAY_STATE_MISSING :
      FULL_LOG_REPLAY_STATE_UNRESOLVED,
    evidencePath: candidates[FIRST_INDEX] || EMPTY_TEXT,
  };
}

function resolveReportSiblingFullLogPath(sourceArtifactPath, scenarioName) {
  const base = path.basename(sourceArtifactPath);
  if (!base.endsWith(REPORT_JSON_SUFFIX)) {
    return EMPTY_TEXT;
  }
  return path.join(
    path.dirname(sourceArtifactPath),
    PLAYBACK_DIRNAME,
    base.slice(NUM_ZERO, -REPORT_JSON_SUFFIX.length),
    FULL_LOGS_DIRNAME,
    scenarioName,
  );
}

function resolveLinkedPath(sourceArtifactPath, linkedPath) {
  const candidate = String(linkedPath || EMPTY_TEXT).trim();
  if (!candidate) {
    return EMPTY_TEXT;
  }
  if (path.isAbsolute(candidate) || fs.existsSync(candidate)) {
    return candidate;
  }
  return path.resolve(path.dirname(sourceArtifactPath), candidate);
}

function hasLogGzipFiles(directoryPath) {
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    return false;
  }
  return fs.readdirSync(directoryPath).some(
    (entry) => entry.endsWith(LOG_GZIP_SUFFIX),
  );
}

function replayFullLogsSync(fullLogDirectory, currentState) {
  const files = fs.readdirSync(fullLogDirectory)
    .filter((entry) => entry.endsWith(LOG_GZIP_SUFFIX))
    .sort();
  const samples = [];
  let linesScanned = NUM_ZERO;
  let parseErrorCount = NUM_ZERO;
  let decisionTraceCount = NUM_ZERO;
  const outcomeCounts = {};

  for (const file of files) {
    const filePath = path.join(fullLogDirectory, file);
    const lines = decompressLines(fs.readFileSync(filePath));
    for (let index = NUM_ZERO; index < lines.length; index += NUM_ONE) {
      const line = lines[index];
      if (!line) {
        continue;
      }
      linesScanned += NUM_ONE;
      if (!line.includes(TRACE_MSG_CONVERGENCE_DECISION)) {
        continue;
      }
      const parsed = parseJsonLine(line);
      if (!isRecord(parsed)) {
        parseErrorCount += NUM_ONE;
        continue;
      }
      if (parsed.msg !== TRACE_MSG_CONVERGENCE_DECISION) {
        continue;
      }
      decisionTraceCount += NUM_ONE;
      incrementOutcomeCount(outcomeCounts, parsed.outcome);
      const sample = buildTraceSample({
        parsed,
        filePath,
        lineNumber: index + NUM_ONE,
      });
      if (isRecord(sample)) {
        samples.push(sample);
      }
    }
  }

  const selectedSamples = selectCurrentWindowSamples(samples, currentState);
  return {
    filesScanned: files.length,
    linesScanned,
    parseErrorCount,
    decisionTraceCount,
    samples: selectedSamples,
    currentStateFiltered: selectedSamples.length !== samples.length,
    latestSampleTimestamp: textValue(
      selectedSamples[selectedSamples.length - NUM_ONE]?.timestamp,
    ),
    outcomeCounts,
  };
}

function decompressLines(buffer) {
  return gunzipSync(buffer, {finishFlush: zlibConstants.Z_SYNC_FLUSH})
    .toString(ENCODING_UTF8)
    .split(NEWLINE);
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return EMPTY_TEXT;
  }
}

function buildTraceSample({parsed, filePath, lineNumber}) {
  const event = selectTraceEvent(parsed);
  const actionState = selectTraceActionState(parsed);
  if (!event && !actionState && !hasPublicationState(parsed)) {
    return EMPTY_TEXT;
  }
  const sample = {
    timestamp: textValue(parsed.time),
    event,
    actionState,
    decision: textValue(parsed.decision),
    reason: textValue(parsed.reason, parsed.contractReason),
    outcome: textValue(parsed.outcome),
    evidencePath: `${filePath}:${lineNumber}`,
  };
  assignFiniteNumber(
    sample,
    SAMPLE_FIELD_MISSING_PUBLISHED_COUNT,
    parsed.missingPublishedCount,
  );
  assignFiniteNumber(sample, SAMPLE_FIELD_PUBLICATION_EPOCH, parsed.publicationEpoch);
  assignFiniteNumber(
    sample,
    SAMPLE_FIELD_PENDING_RECONCILE_COUNT,
    parsed.pendingReconcileCount,
  );
  return sample;
}

function selectTraceEvent(parsed) {
  if (
    parsed.decision === DECISION_DRIVE &&
    parsed.outcome === OUTCOME_RECONCILE_COMMITTED
  ) {
    return ACTION_EVENT_RECONCILE_COMPLETED;
  }
  if (
    parsed.decision === DECISION_DRIVE &&
    (
      parsed.contractNextAction === ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
      parsed.contractReason === REASON_OWNER_RECONCILE_PENDING ||
      parsed.outcome === OUTCOME_RECONCILE_TIMED_OUT
    )
  ) {
    return ACTION_EVENT_OWNER_RECONCILE_ENQUEUED;
  }
  if (
    parsed.decision === DECISION_SKIP &&
    parsed.reason === REASON_RECONCILE_IN_FLIGHT
  ) {
    return ACTION_EVENT_RECONCILE_IN_FLIGHT;
  }
  return EMPTY_TEXT;
}

function selectTraceActionState(parsed) {
  if (parsed.decision === DECISION_DRIVE) {
    return ACTION_STATE_EXECUTED;
  }
  if (
    parsed.decision === DECISION_SKIP &&
    parsed.reason === REASON_RECONCILE_IN_FLIGHT
  ) {
    return ACTION_STATE_IN_FLIGHT;
  }
  return EMPTY_TEXT;
}

function selectCurrentWindowSamples(samples, currentState) {
  if (
    !Number.isFinite(currentState.publicationEpoch) ||
    !Number.isFinite(currentState.missingPublishedCount)
  ) {
    return samples;
  }
  const matchingSamples = samples.filter(
    (sample) =>
      sample.publicationEpoch === currentState.publicationEpoch &&
      sample.missingPublishedCount === currentState.missingPublishedCount,
  );
  return matchingSamples.length > NUM_ZERO ? matchingSamples : samples;
}

function selectCurrentPublicationState(artifact) {
  const report = firstRecord(artifact[PROPERTY_REPORT], artifact);
  const scenario = selectScenario(report);
  const publication = firstRecord(
    scenario[PROPERTY_PUBLICATION_CONVERGENCE],
    artifact[PROPERTY_PUBLICATION_CONVERGENCE],
    artifact[PROPERTY_FAILURE_BUNDLE]?.[PROPERTY_PUBLICATION_CONVERGENCE],
  );
  const activeGate = firstRecord(publication[PROPERTY_ACTIVE_GATE]);
  const progress = firstRecord(
    activeGate[PROPERTY_PROGRESS],
    publication.activeGateProgress,
    publication[PROPERTY_PROGRESS],
  );
  return {
    publicationEpoch: normalizeNumber(progress.publicationEpoch),
    missingPublishedCount: normalizeNumber(
      progress.missingPublishedCount ??
      progress.activeGateOwnerCohortMissingPublishedCount,
    ),
  };
}

function hasExistingLivenessEvidence(artifact) {
  const report = firstRecord(artifact[PROPERTY_REPORT], artifact);
  const scenario = selectScenario(report);
  const publication = firstRecord(
    scenario[PROPERTY_PUBLICATION_CONVERGENCE],
    artifact[PROPERTY_PUBLICATION_CONVERGENCE],
    artifact[PROPERTY_FAILURE_BUNDLE]?.[PROPERTY_PUBLICATION_CONVERGENCE],
  );
  const activeGate = firstRecord(publication[PROPERTY_ACTIVE_GATE]);
  const evidence = firstRecord(
    artifact[PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE],
    scenario[PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE],
    publication[PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE],
    activeGate[PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE],
  );
  return evidence.complete === true ||
    evidence.completeness === FULL_LOG_REPLAY_STATE_COMPLETE ||
    Array.isArray(evidence.samples);
}

function selectScenario(report) {
  const scenarios = Array.isArray(report[PROPERTY_SCENARIOS]) ?
    report[PROPERTY_SCENARIOS] :
    [];
  return firstRecord(scenarios[FIRST_INDEX]);
}

function incrementOutcomeCount(outcomeCounts, outcome) {
  const key = textValue(outcome);
  if (!key) {
    return;
  }
  outcomeCounts[key] = (outcomeCounts[key] || NUM_ZERO) + NUM_ONE;
}

function hasPublicationState(parsed) {
  return Number.isFinite(normalizeNumber(parsed.publicationEpoch)) ||
    Number.isFinite(normalizeNumber(parsed.missingPublishedCount));
}

function assignFiniteNumber(target, key, value) {
  const number = normalizeNumber(value);
  if (Number.isFinite(number)) {
    target[key] = number;
  }
}

function normalizeNumber(value) {
  if (value === EMPTY_TEXT) {
    return Number.NaN;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function firstRecord(...values) {
  return values.find(isRecord) || {};
}

function isRecord(value) {
  return Boolean(value) &&
    typeof value === TYPEOF_OBJECT &&
    !Array.isArray(value);
}

function textValue(...values) {
  for (const value of values) {
    if (typeof value === TYPEOF_STRING && value.length > NUM_ZERO) {
      return value;
    }
  }
  return EMPTY_TEXT;
}

export {
  FULL_LOG_REPLAY_STATE_COMPLETE,
  FULL_LOG_REPLAY_STATE_MISSING,
  enrichArtifactWithFullLogEvidenceSync,
  replayFullLogsSync,
};
