import fs from 'node:fs';
import path from 'node:path';

import {
  EVENT_ATTEMPT,
  EVENT_EVIDENCE_INGESTED,
  EVENT_QUEST,
  EVENT_SOLVED,
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
  detectOscillation,
} from './current-blocker.js';
import {evaluate} from './probe.js';
import {
  extractSatisfiedInvariants,
  distanceMetricFromReport,
} from './probes/scenario-harness.js';
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
import {
  isFrontierProbeEvent,
  metricKindFromProbeSpec,
  stableProbeKey,
} from './probe-spec.js';

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
    const measuredEvents = log.filter((event) =>
      event.type === EVENT_ATTEMPT ||
      event.type === EVENT_EVIDENCE_INGESTED ||
      event.type === EVENT_SOLVED ||
      event.type === EVENT_QUEST);
    if (measuredEvents.length === 0 && options.requiresMeasuredHistory) {
      return null;
    }
    for (const spec of questProbeSpecs(quest, options.kind || 'all')) {
      const probe = evaluate(spec.probeSpec, {root});
      if (!probe.evidence || probe.evidenceIdentity?.exists !== true) continue;
      const alreadyIngested = measuredEvents.some((event) =>
        evidenceIdentityMatchesEvent(probe.evidenceIdentity, event, {
          requireProbeSpec: true,
        }),
      );
      if (alreadyIngested) continue;
      const probeFlag = spec.scope === 'doneWhen' ? ' --probe doneWhen' : '';
      return {
        frontier: spec.frontier,
        probeScope: spec.scope,
        evidence: probe.evidence,
        evidenceFingerprint: probe.evidenceFingerprint,
        command: `node scripts/solve.js ingest-evidence --id ${questId} ` +
          `--frontier ${spec.frontier}${probeFlag} --evidence ${probe.evidence}`,
      };
    }
  } catch (err) {}
  return null;
}

function questProbeSpecs(quest, kind = 'all') {
  const fallbackFrontier = quest.frontiers[0]?.id || `${quest.id}-main`;
  const specs = [];
  if (kind !== 'frontier') {
    specs.push({
      frontier: fallbackFrontier,
      scope: 'doneWhen',
      probeSpec: quest.doneWhen,
    });
  }
  if (kind !== 'closure') {
    specs.push(...quest.frontiers.map((frontier) => ({
      frontier: frontier.id,
      scope: 'frontier',
      probeSpec: frontier.metric,
    })));
  }
  return specs.filter((entry) => entry.probeSpec);
}

function frontierProbeSpec(quest, frontierId, probeScope = 'frontier') {
  if (probeScope === 'doneWhen') return quest.doneWhen;
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
  const direct = failure?.ownerContract?.frontierWitnesses?.find((w) => w.owner) ||
    failure?.ownerContract?.ownerWitnesses?.find((w) => w.owner);
  if (direct) return direct;
  return firstOwnerLike(failure);
}

function firstOwnerLike(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return null;
  if (typeof value.owner === 'string' ||
    typeof value.currentOwner === 'string' ||
    typeof value.decidingOwner === 'string') {
    return {
      owner: value.owner || value.currentOwner || value.decidingOwner || null,
      boundary: value.boundary || value.blockingBoundary ||
        value.ownerBoundary || null,
      source: value.source || value,
      nextAction: value.nextAction || value.nextRequiredAction ||
        value.nextRequiredActions || null,
    };
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = firstOwnerLike(item, depth + 1);
        if (found) return found;
      }
    } else {
      const found = firstOwnerLike(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function ingestEvidence(root, {
  questId,
  frontierId,
  evidencePath,
  probeScope = 'frontier',
}) {
  const quest = loadQuest(root, questId);
  const log = readLog(root, questId);
  const state = projectState(quest, log);
  const frontierState = state.frontiers.find((f) => f.id === frontierId);

  if (!fs.existsSync(evidencePath)) {
    throw new Error(`evidence file not found: ${evidencePath}`);
  }

  const data = parseJsonFile(evidencePath);
  if (!data) throw new Error(`evidence file is not readable JSON: ${evidencePath}`);
  const identityProbe = frontierProbeSpec(quest, frontierId, probeScope);
  const evidenceIdentity = buildEvidenceIdentity(root, evidencePath, {
    probe: identityProbe?.probe || null,
    args: identityProbe?.args || null,
  });
  const probeKey = stableProbeKey(identityProbe);
  const frontierMetricEvidence = probeScope !== 'doneWhen' &&
    probeScope !== 'closure';
  const liveProbe = evaluate(identityProbe, {root});
  const liveProbeMatchesEvidence =
    liveProbe.evidenceFingerprint &&
    liveProbe.evidenceFingerprint === evidenceIdentity.fingerprint;

  // Scenario matching
  const scenarioName = quest.doneWhen?.args?.scenario || questId;
  const sc = scenarioEntry(data, scenarioName);

  // Metric extraction
  const metricKind = metricKindFromProbeSpec(identityProbe) ||
    quest.doneWhen?.args?.metric ||
    'priority';
  let metric = null;
  if (metricKind === 'failed') {
    metric = Number.isInteger(data?.summary?.failed) ? data.summary.failed : null;
  } else if (metricKind === 'distance') {
    metric = distanceMetricFromReport(data, scenarioName);
  } else {
    const items = data?.optimizationSummary?.totalPriorityItems;
    metric = Number.isInteger(items) ? items : (Number.isInteger(data?.summary?.failed) ? data.summary.failed : (Number.isInteger(data?.metric) ? data.metric : null));
  }

  let satisfiedInvariants = extractSatisfiedInvariants(data, scenarioName);

  let done = scenarioPassed(data, scenarioName);
  const verdict = firstVerdict(data, scenarioName);
  const verdictReason = firstVerdictReason(data, scenarioName);
  let invalidSample = verdictReason === VERDICT_REASON_EXECUTION_INCOMPLETE ||
    metric === null;
  if (liveProbeMatchesEvidence) {
    metric = liveProbe.metric;
    done = liveProbe.done;
    invalidSample = Boolean(liveProbe.invalidSample);
    satisfiedInvariants = Array.isArray(liveProbe.satisfiedInvariants) ?
      liveProbe.satisfiedInvariants :
      satisfiedInvariants;
  } else if (invalidSample) {
    metric = null;
  }
  
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
    event.type === EVENT_EVIDENCE_INGESTED &&
    event.frontier === frontierId &&
    isFrontierProbeEvent(event));

  const mechanismCard = buildMechanismCardFromEvidence(evidencePath);
  const classifiedMechanism = mechanismCard.failureMechanism || 'observation_gap';

  const newEvidenceEvent = {
    type: EVENT_EVIDENCE_INGESTED,
    frontier: frontierId,
    evidence: evidencePath,
    evidenceIdentity,
    evidenceFingerprint: evidenceIdentity.fingerprint,
    probeScope,
    probeKey,
    metricKind,
    reportTimestamp,
    metric,
    invalidSample,
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
    satisfiedInvariants,
    summary,
  };
  const previousBlocker = frontierMetricEvidence ?
    blockerFromEvidence(previousEvidence) :
    null;
  const currentBlocker = frontierMetricEvidence ?
    blockerFromEvidence(newEvidenceEvent) :
    null;
  const blockerMovement = frontierMetricEvidence ?
    classifyBlockerMovement(previousBlocker, currentBlocker) :
    null;
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
    frontierMetricEvidence ? `first blocker observed: ${[
      currentBlocker.owner,
      currentBlocker.boundary,
      currentBlocker.dominantReason,
    ].filter(Boolean).join(' / ') || 'unknown'}` :
      'closure evidence ingested';
  const ingestedEvent = appendEvent(root, questId, {
    ...newEvidenceEvent,
    blockerBefore: previousBlocker,
    blockerAfter: currentBlocker,
    blockerMovement,
    diagnosticMovement,
  });

  // Oscillation is history-wide: re-read the log (now including this event) so a
  // return to a previously-abandoned blocker is visible, not just the last hop.
  const oscillation = detectOscillation(readLog(root, questId), frontierId);

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
  if (selectedTheory && frontierMetricEvidence) {
    const nonMeasuring = invalidSample ||
      verdict === VERDICT_BLOCK_EVIDENCE_INCOMPLETE ||
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
        if (oscillation.oscillating) {
          // Returning to a previously-left blocker is whack-a-mole, not progress.
          result = THEORY_RESULT_FALSIFIED;
          theoryOutcome = 'oscillating';
        } else {
          result = THEORY_RESULT_SUPPORTED;
          theoryOutcome = 'partial';
        }
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
      oscillating: oscillation.oscillating,
      oscillationLabel: oscillation.label,
      diagnosticMovement,
      evidence: evidencePath,
      validation: null,
    });
  }

  // Regenerate report
  writeReport(root, questId);

  return ingestedEvent;
}
