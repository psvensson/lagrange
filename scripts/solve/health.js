import {
  EVENT_ATTEMPT,
  RUNG_MODEL,
  RUNG_WIDEN_SCOPE,
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_SUPPORTED,
  THEORY_RESULT_SUPERSEDED,
} from './constants.js';
import {evaluate} from './probe.js';
import {pickFrontier} from './scheduler.js';
import {projectState, readLog} from './store.js';
import {detectUnrecordedEvidence} from './evidence.js';
import {modelGuidanceForQuest} from './model-guidance.js';

const NUM_TWO = 2;
const NUM_THREE = 3;
const NUM_FOUR = 4;
const SELECTABLE_THEORY_STATUSES = Object.freeze([
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_SUPPORTED,
]);

function attemptEvents(log, frontierId = '') {
  return log.filter((event) =>
    event.type === EVENT_ATTEMPT && (!frontierId || event.frontier === frontierId));
}

function attemptProgressed(event) {
  return event.metricBefore !== null &&
    event.metricAfter !== null &&
    event.metricAfter < event.metricBefore;
}

function noProgressAttempts(log, frontierId) {
  return attemptEvents(log, frontierId).filter((event) => !attemptProgressed(event));
}

function activeSystemTheories(state) {
  return state.theories.system.filter((theory) =>
    theory.archive !== true &&
    theory.status !== THEORY_RESULT_SUPERSEDED &&
    SELECTABLE_THEORY_STATUSES.includes(theory.status));
}

function selectedTheory(state, frontierId) {
  const id = state.theories.selectedByFrontier[frontierId];
  return id ? state.theories.byId[id] || null : null;
}

function lastAttemptTheories(log, state, frontierId) {
  return attemptEvents(log, frontierId)
    .map((event) => state.theories.byId[event.theoryRef])
    .filter(Boolean);
}

function sameMechanismSignal(theories) {
  const recent = theories.slice(-NUM_THREE);
  if (recent.length < NUM_THREE) return null;
  const mechanism = recent[0].mechanism;
  if (!mechanism) return null;
  if (recent.every((theory) => theory.mechanism === mechanism)) {
    return {
      type: 'same-mechanism-repeat',
      mechanism,
      severity: 'medium',
    };
  }
  return null;
}

function layerPingPongSignal(theories) {
  const recent = theories.slice(-NUM_FOUR).map((theory) => theory.layer);
  if (recent.length < NUM_FOUR || recent.some((layer) => !layer)) return null;
  const unique = [...new Set(recent)];
  if (unique.length === NUM_TWO &&
    recent[0] === recent[2] &&
    recent[1] === recent[3]) {
    return {
      type: 'layer-ping-pong',
      mechanism: unique.join('+'),
      severity: 'high',
    };
  }
  return null;
}

function liveProbeDivergence(state, liveProbe) {
  const currentMetrics = state.frontiers
    .map((frontier) => frontier.current)
    .filter((metric) => typeof metric === 'number');
  if (typeof liveProbe.metric !== 'number' || currentMetrics.length === 0) {
    return null;
  }
  const latest = currentMetrics[currentMetrics.length - 1];
  if (latest !== liveProbe.metric) {
    return {
      type: 'live-probe-diverges-from-projection',
      projectedMetric: latest,
      liveMetric: liveProbe.metric,
      severity: 'high',
    };
  }
  return null;
}

function frontierNeeds(quest, state, log, frontier) {
  const rung = frontier.rungIndex;
  const selected = selectedTheory(state, frontier.id);
  const selectedUsable = selected &&
    selected.archive !== true &&
    SELECTABLE_THEORY_STATUSES.includes(selected.status);
  const noProgress = noProgressAttempts(log, frontier.id);

  const evidenceEvents = log.filter((e) => e.type === 'evidence-ingested');
  const sameDominantReasonRepeat = evidenceEvents.length >= 2 &&
    evidenceEvents[evidenceEvents.length - 1].dominantReason &&
    evidenceEvents[evidenceEvents.length - 1].dominantReason === evidenceEvents[evidenceEvents.length - 2].dominantReason;
  const sameOwnerBoundaryRepeat = evidenceEvents.length >= 2 &&
    evidenceEvents[evidenceEvents.length - 1].owner &&
    evidenceEvents[evidenceEvents.length - 1].owner === evidenceEvents[evidenceEvents.length - 2].owner &&
    evidenceEvents[evidenceEvents.length - 1].boundary === evidenceEvents[evidenceEvents.length - 2].boundary;

  const latestEvidence = [...log].reverse().find((e) => e.type === 'evidence-ingested');
  const namesLiveness = latestEvidence && (latestEvidence.owner || latestEvidence.boundary || latestEvidence.waitMode);
  const selectedIsObservationGap = selected && (selected.mechanism === 'observation_gap' || selected.layer === 'observation');
  const localTheoryTooNarrow = namesLiveness && selectedIsObservationGap;

  const systemTheoryRequired =
    (rung === 2 || noProgress.length >= NUM_TWO || sameDominantReasonRepeat || sameOwnerBoundaryRepeat || localTheoryTooNarrow) &&
    activeSystemTheories(state).length === 0;

  const modelGuidance = modelGuidanceForQuest(quest, log);

  return {
    frontierTheoryRequired: rung >= 1 && !selectedUsable,
    systemTheoryRequired,
    modelEvidenceRequired: rung === 2,
    modelEvidenceRecommended: Boolean(modelGuidance),
    modelGuidance,
    selectedTheory: selected ? selected.id : null,
    noProgressCount: noProgress.length,
  };
}

function nextActionFor(frontier, needs) {
  if (!frontier) return 'No open frontier remains; inspect solve report.';
  if (needs.systemTheoryRequired) {
    const suffix = needs.modelGuidance ?
      ` using ${needs.modelGuidance.command} as model discriminator` :
      '';
    return `record system theory before the next ${frontier.id} attempt${suffix}`;
  }
  if (needs.frontierTheoryRequired) {
    const suffix = needs.modelGuidance ?
      ` with ${needs.modelGuidance.command} as discriminator` :
      '';
    return `record and select frontier theory for ${frontier.id}${suffix}`;
  }
  if (needs.modelEvidenceRequired) {
    return `continue ${frontier.id} with modelRef or modelNotApplicable evidence`;
  }
  return `continue supervised step for ${frontier.id}`;
}

export function analyzeQuestHealth(root, quest, options = {}) {
  const log = readLog(root, quest.id);
  const state = options.state || projectState(quest, log);
  const pick = pickFrontier(quest, state, options.scoreFn);
  const liveProbe = options.liveProbe || evaluate(quest.doneWhen, {root});
  const frontier = pick?.state || null;
  const needs = frontier ? frontierNeeds(quest, state, log, frontier) : {};
  const theories = frontier ? lastAttemptTheories(log, state, frontier.id) : [];
  const signals = [
    sameMechanismSignal(theories),
    layerPingPongSignal(theories),
    liveProbeDivergence(state, liveProbe),
  ].filter(Boolean);

  const unrecorded = detectUnrecordedEvidence(root, quest.id);
  if (unrecorded) {
    signals.push({
      type: 'fresh-evidence-unrecorded',
      severity: 'high',
    });
  }

  const evidenceEvents = log.filter((e) => e.type === 'evidence-ingested');
  const sameDominantReasonRepeat = evidenceEvents.length >= 2 &&
    evidenceEvents[evidenceEvents.length - 1].dominantReason &&
    evidenceEvents[evidenceEvents.length - 1].dominantReason === evidenceEvents[evidenceEvents.length - 2].dominantReason;
  if (sameDominantReasonRepeat) {
    signals.push({
      type: 'same-dominant-reason-repeat',
      severity: 'high',
    });
  }

  const sameOwnerBoundaryRepeat = evidenceEvents.length >= 2 &&
    evidenceEvents[evidenceEvents.length - 1].owner &&
    evidenceEvents[evidenceEvents.length - 1].owner === evidenceEvents[evidenceEvents.length - 2].owner &&
    evidenceEvents[evidenceEvents.length - 1].boundary === evidenceEvents[evidenceEvents.length - 2].boundary;
  if (sameOwnerBoundaryRepeat) {
    signals.push({
      type: 'same-owner-boundary-repeat',
      severity: 'high',
    });
  }

  const latestMetricEvent = [...log].reverse().find((e) =>
    (e.type === 'attempt' && typeof e.metricAfter === 'number') ||
    (e.type === 'evidence-ingested' && typeof e.metric === 'number')
  );
  if (latestMetricEvent) {
    const metricVal = latestMetricEvent.type === 'attempt' ? latestMetricEvent.metricAfter : latestMetricEvent.metric;
    const isDone = latestMetricEvent.done;
    if (metricVal === 0 && !isDone) {
      signals.push({
        type: 'metric-zero-but-done-false',
        severity: 'high',
      });
    }
  }

  if (frontier) {
    const selectedId = state.theories.selectedByFrontier[frontier.id];
    const selected = selectedId ? state.theories.byId[selectedId] : null;
    const latestEvidence = [...log].reverse().find((e) => e.type === 'evidence-ingested');
    const namesLiveness = latestEvidence && (latestEvidence.owner || latestEvidence.boundary || latestEvidence.waitMode);
    const selectedIsObservationGap = selected && (selected.mechanism === 'observation_gap' || selected.layer === 'observation');
    if (namesLiveness && selectedIsObservationGap) {
      signals.push({
        type: 'local-theory-too-narrow',
        severity: 'high',
      });
    }
  }

  if (frontier && needs.systemTheoryRequired) {
    signals.push({
      type: 'system-theory-required',
      mechanism: frontier.id,
      severity: 'high',
    });
  }
  if (frontier && needs.frontierTheoryRequired) {
    signals.push({
      type: 'frontier-theory-required',
      mechanism: frontier.id,
      severity: 'medium',
    });
  }
  if (frontier && needs.modelGuidance) {
    signals.push({
      type: needs.modelEvidenceRequired ?
        'model-contract-evidence-required' :
        'model-contract-guidance-available',
      mechanism: needs.modelGuidance.command,
      severity: needs.modelEvidenceRequired ? 'high' : 'medium',
    });
  }
  const rungName = frontier ? (quest.frontiers.find((item) =>
    item.id === frontier.id)?.rung || null) : null;
  return {
    questId: quest.id,
    frontier: frontier ? frontier.id : null,
    rungIndex: frontier ? frontier.rungIndex : null,
    rungName: rungName || (
      frontier?.rungIndex >= 2 ? RUNG_MODEL :
        frontier?.rungIndex >= 1 ? RUNG_WIDEN_SCOPE : 'local-fix'
    ),
    needs,
    modelGuidance: needs.modelGuidance || null,
    signals,
    nextAction: nextActionFor(frontier, needs),
  };
}

export function renderHealth(health) {
  const lines = ['# Quest Health', ''];
  lines.push(`- quest: ${health.questId}`);
  lines.push(`- frontier: ${health.frontier || 'none'}`);
  lines.push(`- rungIndex: ${health.rungIndex ?? 'none'}`);
  lines.push(`- nextAction: ${health.nextAction}`);
  lines.push('', '## Signals');
  if (health.signals.length === 0) {
    lines.push('- none');
  } else {
    for (const signal of health.signals) {
      lines.push(`- ${signal.type}: severity=${signal.severity}`);
    }
  }
  if (health.modelGuidance) {
    lines.push('', '## Model Guidance');
    lines.push(`- command: ${health.modelGuidance.command}`);
    lines.push(`- modelRef: ${health.modelGuidance.modelRef}`);
    lines.push(`- reportPattern: ${health.modelGuidance.reportPattern}`);
    lines.push(`- reasons: ${health.modelGuidance.reasons.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}
