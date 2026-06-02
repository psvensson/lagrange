import fs from 'node:fs';
import path from 'node:path';

import {
  EVENT_EVIDENCE_INGESTED,
  EVENT_THEORY_RESULT,
  THEORY_RESULT_FALSIFIED,
  THEORY_RESULT_NEEDS_RERUN,
  THEORY_RESULT_SUPPORTED,
  VERDICT_BLOCK_EVIDENCE_INCOMPLETE,
  VERDICT_REASON_EXECUTION_INCOMPLETE,
} from './constants.js';
import {buildMechanismCardFromEvidence} from './mechanism-card.js';
import {
  BLOCKER_MOVEMENT_MOVED_BOUNDARY,
  BLOCKER_MOVEMENT_MOVED_OWNER,
  BLOCKER_MOVEMENT_NARROWED,
  blockerFromEvidence,
  classifyBlockerMovement,
} from './current-blocker.js';
import {evaluate} from './probe.js';
import {
  appendEvent,
  appendFinding,
  loadQuest,
  projectState,
  readLog,
} from './store.js';
import {writeReport} from './report.js';
import {
  buildEvidenceIdentity,
  evidenceIdentityMatchesEvent,
} from './evidence-identity.js';

function parseJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return null;
  }
}

export function detectUnrecordedEvidence(root, questId, options = {}) {
  try {
    const quest = loadQuest(root, questId);
    const log = readLog(root, questId);
    const measuredEvents = log.filter(
      (event) => event.type === 'attempt' ||
        event.type === EVENT_EVIDENCE_INGESTED,
    );
    if (measuredEvents.length === 0 && options.requiresMeasuredHistory) {
      return null;
    }
    for (const spec of questProbeSpecs(quest)) {
      const probe = evaluate(spec.probeSpec, {root});
      if (!probe.evidence || probe.evidenceIdentity?.exists !== true) continue;
      const alreadyIngested = measuredEvents.some((event) =>
        evidenceIdentityMatchesEvent(probe.evidenceIdentity, event),
      );
      if (alreadyIngested) continue;
      return {
        frontier: spec.frontier,
        evidence: probe.evidence,
        evidenceFingerprint: probe.evidenceFingerprint,
        command: `node scripts/solve.js ingest-evidence --id ${questId} --frontier ${spec.frontier} --evidence ${probe.evidence}`,
      };
    }
  } catch (err) {}
  return null;
}

function questProbeSpecs(quest) {
  const fallbackFrontier = quest.frontiers[0]?.id || `${quest.id}-main`;
  return [
    {frontier: fallbackFrontier, probeSpec: quest.doneWhen},
    ...quest.frontiers.map((frontier) => ({
      frontier: frontier.id,
      probeSpec: frontier.metric,
    })),
  ].filter((entry) => entry.probeSpec);
}

function frontierProbeSpec(quest, frontierId) {
  const frontier = quest.frontiers.find((item) => item.id === frontierId);
  return frontier?.metric || quest.doneWhen;
}

function scenarioEntry(data, scenario) {
  const directScenarios = Array.isArray(data?.scenarios) ? data.scenarios : [];
  const standardScenarios = Array.isArray(data?.standardSummary?.scenarios) ?
    data.standardSummary.scenarios :
    [];
  return [...directScenarios, ...standardScenarios]
    .find((s) => s?.scenario === scenario) || null;
}

function scenarioPassed(data, scenario) {
  const entry = scenarioEntry(data, scenario);
  if (typeof entry?.passed === 'boolean') return entry.passed;
  if (entry?.current && typeof entry.current.passed === 'boolean') {
    return entry.current.passed;
  }
  if (data?.done === true) return true;
  if (typeof data?.target === 'number' && typeof data?.metric === 'number') {
    return data.metric <= data.target;
  }
  return data?.summary?.failed === 0;
}

function firstFailureCandidate(data, scenario) {
  const sc = scenarioEntry(data, scenario);
  return sc?.details?.diagnostics?.failure ||
    sc?.details?.failure ||
    sc?.failureBundle?.summary ||
    sc?.failureClassification ||
    data?.failureBundle?.summary ||
    null;
}

function firstRootCause(data, scenario) {
  const sc = scenarioEntry(data, scenario);
  const failure = firstFailureCandidate(data, scenario);
  return failure?.rootCauseClass ||
    sc?.rootCauseClass ||
    sc?.failureClassification?.rootCauseClass ||
    null;
}

function firstDominantReason(data, scenario) {
  const sc = scenarioEntry(data, scenario);
  const failure = firstFailureCandidate(data, scenario);
  return failure?.dominantReason ||
    sc?.dominantReason ||
    sc?.failureClassification?.dominantReason ||
    null;
}

function firstVerdict(data, scenario) {
  const sc = scenarioEntry(data, scenario);
  return sc?.current?.verdict ||
    sc?.verdict ||
    data?.summary?.status ||
    'unknown';
}

function firstVerdictReason(data, scenario) {
  const sc = scenarioEntry(data, scenario);
  return sc?.current?.verdictReason ||
    sc?.verdictReason ||
    null;
}

function ownerWitness(failure) {
  return failure?.ownerContract?.frontierWitnesses?.find((w) => w.owner) ||
    failure?.ownerContract?.ownerWitnesses?.find((w) => w.owner) ||
    null;
}

export function ingestEvidence(root, {questId, frontierId, evidencePath}) {
  const quest = loadQuest(root, questId);
  const log = readLog(root, questId);
  const state = projectState(quest, log);
  const frontierState = state.frontiers.find((f) => f.id === frontierId);

  if (!fs.existsSync(evidencePath)) {
    throw new Error(`evidence file not found: ${evidencePath}`);
  }

  const data = parseJsonFile(evidencePath);
  if (!data) throw new Error(`evidence file is not readable JSON: ${evidencePath}`);
  const identityProbe = frontierProbeSpec(quest, frontierId);
  const evidenceIdentity = buildEvidenceIdentity(root, evidencePath, {
    probe: identityProbe?.probe || null,
    args: identityProbe?.args || null,
  });

  // Scenario matching
  const scenarioName = quest.doneWhen?.args?.scenario || questId;
  const sc = scenarioEntry(data, scenarioName);

  // Metric extraction
  const metricKind = quest.doneWhen?.args?.metric || 'priority';
  let metric = null;
  if (metricKind === 'failed') {
    metric = Number.isInteger(data?.summary?.failed) ? data.summary.failed : null;
  } else {
    const items = data?.optimizationSummary?.totalPriorityItems;
    metric = Number.isInteger(items) ? items : (Number.isInteger(data?.summary?.failed) ? data.summary.failed : (Number.isInteger(data?.metric) ? data.metric : null));
  }

  const done = scenarioPassed(data, scenarioName);
  const verdict = firstVerdict(data, scenarioName);
  const verdictReason = firstVerdictReason(data, scenarioName);
  
  const failure = firstFailureCandidate(data, scenarioName);
  const rootCauseClass = firstRootCause(data, scenarioName);
  const dominantReason = firstDominantReason(data, scenarioName);
  const priorityItems = data?.optimizationSummary?.totalPriorityItems ?? null;

  // Witnesses
  const witness = ownerWitness(failure);
  const owner = witness?.owner || null;
  const boundary = witness?.boundary || null;
  const waitMode = witness?.source?.waitModes || witness?.source?.waitMode || null;
  const nextAction = witness?.source?.nextRequiredActions || witness?.source?.nextAction || witness?.nextAction || null;
  const mechanism = witness?.source?.actuationStates || witness?.source?.actuationState || witness?.source?.mechanism || null;

  const summary = sc?.error || sc?.stackTrace || data?.summary?.error || 'Evidence ingested successfully';
  const reportTimestamp = data.timestamp || new Date().toISOString();

  const selectedTheory = state.theories.selectedByFrontier[frontierId] || null;
  const previousEvidence = [...log].reverse().find((event) =>
    event.type === EVENT_EVIDENCE_INGESTED && event.frontier === frontierId);

  const mechanismCard = buildMechanismCardFromEvidence(evidencePath);
  const classifiedMechanism = mechanismCard.failureMechanism || 'observation_gap';

  const newEvidenceEvent = {
    type: EVENT_EVIDENCE_INGESTED,
    frontier: frontierId,
    evidence: evidencePath,
    evidenceIdentity,
    evidenceFingerprint: evidenceIdentity.fingerprint,
    reportTimestamp,
    metric,
    done,
    verdict,
    verdictReason,
    rootCauseClass,
    dominantReason,
    priorityItems,
    owner,
    boundary,
    waitMode,
    nextAction,
    mechanism: classifiedMechanism,
    selectedTheory,
    summary,
  };
  const previousBlocker = blockerFromEvidence(previousEvidence);
  const currentBlocker = blockerFromEvidence(newEvidenceEvent);
  const blockerMovement = classifyBlockerMovement(previousBlocker, currentBlocker);
  const diagnosticMovement = previousBlocker ?
    `${blockerMovement}: ${[
      previousBlocker.owner,
      previousBlocker.boundary,
      previousBlocker.dominantReason,
    ].filter(Boolean).join(' / ') || 'unknown'} -> ${[
      currentBlocker.owner,
      currentBlocker.boundary,
      currentBlocker.dominantReason,
    ].filter(Boolean).join(' / ') || 'unknown'}` :
    `first blocker observed: ${[
      currentBlocker.owner,
      currentBlocker.boundary,
      currentBlocker.dominantReason,
    ].filter(Boolean).join(' / ') || 'unknown'}`;
  const ingestedEvent = appendEvent(root, questId, {
    ...newEvidenceEvent,
    blockerBefore: previousBlocker,
    blockerAfter: currentBlocker,
    blockerMovement,
    diagnosticMovement,
  });

  // Determine finding and repeat status
  const beforeMetric = frontierState?.current ?? 'unknown';
  const beforeVerdict = frontierState?.findings?.slice(-1)[0]?.claim;
  const isVerdictRepeat = beforeVerdict && beforeVerdict.includes(`verdict: ${verdict}`);
  const repeatStatus = isVerdictRepeat ? 'repeated' : 'changed';

  const claim = `Ingested evidence from ${path.basename(evidencePath)}. Metric: ${beforeMetric} -> ${metric}. Verdict: ${verdict}${verdictReason ? ` (${verdictReason})` : ''}. Root cause: ${rootCauseClass || 'none'}. Dominant reason: ${dominantReason || 'none'}. Owner: ${owner || 'none'}. Ingestion outcome: ${repeatStatus}.`;
  
  appendFinding(root, questId, {
    frontier: frontierId,
    claim,
    evidence: evidencePath,
  });

  // Evaluate theory result if a selected theory exists
  if (selectedTheory) {
    const nonMeasuring = verdict === VERDICT_BLOCK_EVIDENCE_INCOMPLETE ||
      verdictReason === VERDICT_REASON_EXECUTION_INCOMPLETE ||
      metric === null;
    let result = THEORY_RESULT_FALSIFIED;
    let theoryOutcome = THEORY_RESULT_FALSIFIED;
    const currentMetric = frontierState?.current;
    const progressed = currentMetric !== null &&
      currentMetric !== undefined &&
      metric !== null &&
      metric < currentMetric;
    const scenarioOutcome = done ?
      'done' :
      nonMeasuring ? 'invalid' :
        progressed ? 'improved' :
          'failed';
    if (nonMeasuring) {
      result = THEORY_RESULT_NEEDS_RERUN;
      theoryOutcome = THEORY_RESULT_NEEDS_RERUN;
    } else {
      if (done || progressed) {
        result = THEORY_RESULT_SUPPORTED;
        theoryOutcome = THEORY_RESULT_SUPPORTED;
      } else if ([
        BLOCKER_MOVEMENT_MOVED_OWNER,
        BLOCKER_MOVEMENT_MOVED_BOUNDARY,
        BLOCKER_MOVEMENT_NARROWED,
      ].includes(blockerMovement)) {
        result = THEORY_RESULT_SUPPORTED;
        theoryOutcome = 'partial';
      } else {
        result = THEORY_RESULT_FALSIFIED;
        theoryOutcome = THEORY_RESULT_FALSIFIED;
      }
    }

    appendEvent(root, questId, {
      type: EVENT_THEORY_RESULT,
      theory: selectedTheory,
      frontier: frontierId,
      result,
      scenarioOutcome,
      theoryOutcome,
      blockerMovement,
      diagnosticMovement,
      evidence: evidencePath,
      validation: null,
    });
  }

  // Regenerate report
  writeReport(root, questId);

  return ingestedEvent;
}
