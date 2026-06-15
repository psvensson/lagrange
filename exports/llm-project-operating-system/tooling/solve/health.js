import {
  EVENT_ATTEMPT,
  RUNG_INDEX_WIDEN_SCOPE,
  RUNG_INDEX_MODEL,
  SYSTEM_THEORY_STALL_THRESHOLD,
  LOOP_GUARDS,
  STATUS_PARKED,
  PARK_KIND_CANNOT_MEASURE,
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_SUPPORTED,
  THEORY_RESULT_SUPERSEDED,
} from './constants.js';
import {rungName as ladderRungName} from './ladder.js';
import {evaluate} from './probe.js';
import {pickFrontier} from './scheduler.js';
import {projectState, readLog} from './store.js';
import {detectUnrecordedEvidence} from './evidence.js';
import {modelGuidanceForQuest} from './model-guidance.js';
import {
  buildCurrentBlocker,
  selectedTheoryStaleness,
} from './current-blocker.js';
import {analyzeScopePressure} from './scope-pressure.js';
import {
  detectCoupledOscillation,
  regressionRestoreStatus,
  scopeTerminalStatus,
  harnessNotMeasuringStatus,
} from './loop-guards.js';
import {continuationFromHealth} from './continuation.js';
import {
  eventProbeKey,
  isFrontierProbeEvent,
  stableProbeKey,
} from './probe-spec.js';

const DEFAULT_CONSECUTIVE_TARGET = 1;
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

function consecutiveTarget(doneWhen) {
  const direct = doneWhen?.consecutive;
  const nested = doneWhen?.args?.consecutive;
  if (Number.isInteger(direct)) return direct;
  if (Number.isInteger(nested)) return nested;
  return DEFAULT_CONSECUTIVE_TARGET;
}

function attemptProgressed(event) {
  return event.metricBefore !== null &&
    event.metricAfter !== null &&
    event.metricAfter < event.metricBefore;
}

function noProgressAttempts(log, frontierId) {
  return attemptEvents(log, frontierId)
    .filter((event) => !attemptProgressed(event) && event.investigative !== true);
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

function eventMetric(event) {
  if (!event) return null;
  if (event.type === EVENT_ATTEMPT) return event.metricAfter;
  if (event.type === 'evidence-ingested') return event.metric;
  return null;
}

function latestMetricEventForProbe(log, frontierId, probeSpec) {
  const probeKey = stableProbeKey(probeSpec);
  let legacyFallback = null;
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const event = log[index];
    if (event.frontier !== frontierId) continue;
    if (event.type !== EVENT_ATTEMPT && event.type !== 'evidence-ingested') continue;
    if (event.type === 'evidence-ingested' && !isFrontierProbeEvent(event)) continue;
    if (typeof eventMetric(event) !== 'number') continue;
    const recordedKey = eventProbeKey(event);
    if (probeKey && recordedKey === probeKey) return event;
    if (!recordedKey && !legacyFallback) legacyFallback = event;
  }
  return legacyFallback;
}

function liveProbeDivergence(log, frontierId, probeSpec, liveProbe) {
  if (typeof liveProbe?.metric !== 'number') {
    return null;
  }
  const latest = latestMetricEventForProbe(log, frontierId, probeSpec);
  const projectedMetric = eventMetric(latest);
  if (typeof projectedMetric !== 'number') return null;
  if (projectedMetric !== liveProbe.metric) {
    return {
      type: 'live-probe-diverges-from-projection',
      projectedMetric,
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
  const staleness = selected ?
    selectedTheoryStaleness(log, state, frontier.id) :
    {stale: false, reason: null};
  const noProgress = noProgressAttempts(log, frontier.id);

  const evidenceEvents = log.filter((e) =>
    e.type === 'evidence-ingested' && isFrontierProbeEvent(e));
  const sameDominantReasonRepeat = evidenceEvents.length >= 2 &&
    evidenceEvents[evidenceEvents.length - 1].dominantReason &&
    evidenceEvents[evidenceEvents.length - 1].dominantReason === evidenceEvents[evidenceEvents.length - 2].dominantReason;
  const sameOwnerBoundaryRepeat = evidenceEvents.length >= 2 &&
    evidenceEvents[evidenceEvents.length - 1].owner &&
    evidenceEvents[evidenceEvents.length - 1].owner === evidenceEvents[evidenceEvents.length - 2].owner &&
    evidenceEvents[evidenceEvents.length - 1].boundary === evidenceEvents[evidenceEvents.length - 2].boundary;

  const latestEvidence = [...log].reverse().find((e) =>
    e.type === 'evidence-ingested' && isFrontierProbeEvent(e));
  const namesLiveness = latestEvidence && (latestEvidence.owner || latestEvidence.boundary || latestEvidence.waitMode);
  const selectedIsObservationGap = selected && (selected.mechanism === 'observation_gap' || selected.layer === 'observation');
  const localTheoryTooNarrow = namesLiveness && selectedIsObservationGap;

  const coupledOscillation = LOOP_GUARDS.coupledOscillation &&
    detectCoupledOscillation(log, frontier.id).coupled;

  const systemTheoryRequired =
    (rung === RUNG_INDEX_MODEL ||
      noProgress.length >= SYSTEM_THEORY_STALL_THRESHOLD ||
      sameDominantReasonRepeat ||
      sameOwnerBoundaryRepeat ||
      localTheoryTooNarrow ||
      coupledOscillation) &&
    activeSystemTheories(state).length === 0;

  const modelGuidance = modelGuidanceForQuest(quest, log);

  return {
    frontierTheoryRequired: rung >= RUNG_INDEX_WIDEN_SCOPE && !selectedUsable,
    systemTheoryRequired,
    modelEvidenceRequired: rung === RUNG_INDEX_MODEL,
    modelEvidenceRecommended: Boolean(modelGuidance),
    modelGuidance,
    selectedTheory: selected ? selected.id : null,
    selectedTheoryStale: staleness.stale,
    selectedTheoryStaleReason: staleness.reason,
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
  if (needs.selectedTheoryStale) {
    return `record or select a fresh frontier theory for ${frontier.id}`;
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
  const frontierLiveProbe = pick ?
    (options.frontierLiveProbe || evaluate(pick.def.metric, {root})) :
    null;
  const frontier = pick?.state || null;
  const needs = frontier ? frontierNeeds(quest, state, log, frontier) : {};
  const theories = frontier ? lastAttemptTheories(log, state, frontier.id) : [];
  const currentBlocker = buildCurrentBlocker({quest, log, state});
  const scopePressure = analyzeScopePressure(root, quest, log);
  const signals = [
    sameMechanismSignal(theories),
    layerPingPongSignal(theories),
    frontier ?
      liveProbeDivergence(log, frontier.id, pick.def.metric, frontierLiveProbe) :
      null,
  ].filter(Boolean);

  const freshnessRequiresHistory = options.requiresMeasuredHistory !== false;
  const frontierUnrecorded = detectUnrecordedEvidence(root, quest.id, {
    kind: 'frontier',
    requiresMeasuredHistory: freshnessRequiresHistory,
  });
  const closureUnrecorded = detectUnrecordedEvidence(root, quest.id, {
    kind: 'closure',
    requiresMeasuredHistory: freshnessRequiresHistory,
  });
  if (frontierUnrecorded) {
    signals.push({
      type: 'fresh-evidence-unrecorded',
      severity: 'high',
      evidence: frontierUnrecorded.evidence,
      command: frontierUnrecorded.command,
    });
  }
  if (closureUnrecorded) {
    signals.push({
      type: 'fresh-closure-evidence-unrecorded',
      severity: 'medium',
      evidence: closureUnrecorded.evidence,
      command: closureUnrecorded.command,
    });
  }

  const evidenceEvents = log.filter((e) =>
    e.type === 'evidence-ingested' && isFrontierProbeEvent(e));
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

  if (currentBlocker?.oscillating) {
    signals.push({
      type: 'blocker-oscillation',
      mechanism: currentBlocker.oscillationLabel || frontier?.id || quest.id,
      severity: 'high',
    });
  }

  const latestMetricEvent = [...log].reverse().find((e) =>
    (e.type === 'attempt' && typeof e.metricAfter === 'number') ||
    (e.type === 'evidence-ingested' && isFrontierProbeEvent(e) &&
      typeof e.metric === 'number')
  );
  let metricZeroNotDone = false;
  if (latestMetricEvent) {
    const metricVal = latestMetricEvent.type === 'attempt' ? latestMetricEvent.metricAfter : latestMetricEvent.metric;
    const isDone = latestMetricEvent.done;
    if (metricVal === 0 && !isDone) {
      metricZeroNotDone = true;
      signals.push({
        type: 'metric-zero-but-done-false',
        severity: 'high',
      });
    }
  }

  if (frontier) {
    const selectedId = state.theories.selectedByFrontier[frontier.id];
    const selected = selectedId ? state.theories.byId[selectedId] : null;
    const latestEvidence = [...log].reverse().find((e) =>
      e.type === 'evidence-ingested' && isFrontierProbeEvent(e));
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
  if (frontier && needs.selectedTheoryStale) {
    signals.push({
      type: 'selected-theory-stale',
      mechanism: needs.selectedTheoryStaleReason || frontier.id,
      severity: 'high',
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
  const reopens = state.frontiers.reduce(
    (sum, f) => sum + (f.reopenCount || 0), 0);
  const cannotMeasureParked = state.frontiers.filter(
    (f) => f.status === STATUS_PARKED && f.parkKind === PARK_KIND_CANNOT_MEASURE);
  if (cannotMeasureParked.length > 0) {
    signals.push({
      type: 'cannot-measure',
      mechanism: cannotMeasureParked.map((f) => f.id).join(','),
      severity: 'high',
    });
  }
  for (const signal of scopePressure.signals) {
    signals.push(signal);
  }

  // LG-D: surface coupled-invariant oscillation explicitly so the operator sees WHY a
  // system theory is being demanded (it is the coupling, not generic stalling).
  if (frontier && LOOP_GUARDS.coupledOscillation) {
    const coupled = detectCoupledOscillation(log, frontier.id);
    if (coupled.coupled) {
      signals.push({
        type: 'coupled-invariant-oscillation',
        mechanism: coupled.clusters.map((cluster) => cluster.join('+')).join(' <-> '),
        severity: 'high',
      });
    }
  }

  // LG-C: a previously-green invariant is red and unexplained; the next move owes a
  // restore-or-explain before trading it for another family.
  if (frontier && LOOP_GUARDS.regressionRestoreGate) {
    const restore = regressionRestoreStatus(log, frontier.id);
    if (restore.pending) {
      signals.push({
        type: 'regression-restore-required',
        mechanism: restore.redLabels.join(', '),
        severity: 'high',
      });
    }
  }

  // LG-E: scope pressure has crossed the terminal file bound (distinct from the advisory
  // large-diff signal already emitted above).
  let scopeTerminal = null;
  if (LOOP_GUARDS.scopeTerminal) {
    scopeTerminal = scopeTerminalStatus(scopePressure);
    if (scopeTerminal.terminal) {
      signals.push({
        type: 'scope-pressure-terminal',
        mechanism: `${scopeTerminal.fileCount} changed files`,
        severity: 'high',
      });
    }
  }

  // LG-G: the harness has stopped measuring. A run of trailing non-measuring frontier
  // samples means the measurement apparatus — not the system under test — is broken, so the
  // frontier is routed to a resumable measurement park ("fix the harness") rather than
  // crediting or chasing the noise. Reuses the cannot-measure continuation routing.
  let harnessNotMeasuring = null;
  if (frontier && LOOP_GUARDS.harnessMeasurementGate) {
    harnessNotMeasuring = harnessNotMeasuringStatus(log, frontier.id);
    if (harnessNotMeasuring.notMeasuring) {
      signals.push({
        type: 'cannot-measure',
        mechanism: `${frontier.id}: ${harnessNotMeasuring.consecutive} ` +
          'consecutive non-measuring runs (harness connectivity/system failure)',
        severity: 'high',
      });
    }
  }

  const rungName = frontier ? (quest.frontiers.find((item) =>
    item.id === frontier.id)?.rung || null) : null;
  const targetConsecutive = consecutiveTarget(quest.doneWhen);
  let nextAction = !frontier && cannotMeasureParked.length > 0 ?
    `fix the measurement harness for ${cannotMeasureParked[0].id}, then reopen` :
    nextActionFor(frontier, needs);
  // R5: a single-run metric of 0 does not satisfy a streak goal. Route the next move to
  // proving the consecutive streak rather than selecting another theory for a flap.
  if (metricZeroNotDone && frontier && targetConsecutive > DEFAULT_CONSECUTIVE_TARGET &&
      !needs.systemTheoryRequired && !needs.frontierTheoryRequired &&
      !needs.selectedTheoryStale) {
    nextAction = `run the ${targetConsecutive}-run consecutive proof for ${frontier.id} ` +
      'before selecting a new theory; the single-run metric is 0 but the streak is unproven';
  }
  // LG-C/LG-E next-move routing. A pending restore-or-explain and a terminal scope bound
  // take precedence over "continue", but never over a demanded system theory (which is
  // the deeper fix when invariants are coupled).
  if (frontier && !needs.systemTheoryRequired && !needs.frontierTheoryRequired) {
    if (LOOP_GUARDS.regressionRestoreGate) {
      const restore = regressionRestoreStatus(log, frontier.id);
      if (restore.pending) {
        nextAction = `restore previously-green invariant(s) ${restore.redLabels.join(', ')} ` +
          `for ${frontier.id}, or record a finding explaining why they were abandoned`;
      }
    }
    if (scopeTerminal?.terminal) {
      nextAction = `reduce change scope for ${frontier.id} ` +
        `(${scopeTerminal.fileCount} changed files exceed the limit) before the next attempt`;
    }
  }
  // LG-G: a dead harness outranks a theory demand for the next move — you cannot form or
  // falsify a theory without measurement, so "fix the harness" wins even when a theory is
  // owed (mirrors CONTINUATION_BLOCKED_MEASUREMENT outranking BLOCKED_THEORY).
  if (frontier && harnessNotMeasuring?.notMeasuring) {
    nextAction = `fix the measurement harness for ${frontier.id} ` +
      `(${harnessNotMeasuring.consecutive} consecutive non-measuring runs); ` +
      'park is resumable and auto-reopens on a fresh measured sample';
  }
  const health = {
    questId: quest.id,
    questStatus: state.questStatus || null,
    frontier: frontier ? frontier.id : null,
    rungIndex: frontier ? frontier.rungIndex : null,
    rungName: rungName || (
      frontier ? ladderRungName(frontier.rungIndex) : null
    ),
    needs,
    modelGuidance: needs.modelGuidance || null,
    currentBlocker,
    scopePressure,
    projectionFreshness: {
      frontier: {
        fresh: !frontierUnrecorded,
        evidence: frontierUnrecorded?.evidence || null,
        command: frontierUnrecorded?.command || null,
      },
      closure: {
        fresh: !closureUnrecorded,
        evidence: closureUnrecorded?.evidence || null,
        command: closureUnrecorded?.command || null,
      },
    },
    reopens,
    cannotMeasureParked: cannotMeasureParked.map((f) => ({
      id: f.id,
      reopenCount: f.reopenCount || 0,
    })),
    signals,
    nextAction,
  };
  return {
    ...health,
    continuation: continuationFromHealth(
      health,
      options.continuationOptions || {},
    ),
  };
}

export function renderHealth(health) {
  const lines = ['# Quest Health', ''];
  lines.push(`- quest: ${health.questId}`);
  lines.push(`- frontier: ${health.frontier || 'none'}`);
  lines.push(`- rungIndex: ${health.rungIndex ?? 'none'}`);
  lines.push(`- reopens: ${health.reopens || 0}`);
  lines.push(`- continuation: ${health.continuation?.status || 'allowed'}`);
  lines.push(`- nextAction: ${health.nextAction}`);
  if (health.currentBlocker) {
    lines.push(`- currentOwner: ${health.currentBlocker.owner || 'unknown'}`);
    lines.push(`- currentBoundary: ${health.currentBlocker.boundary || 'unknown'}`);
    lines.push(`- currentReason: ${health.currentBlocker.dominantReason || 'unknown'}`);
    lines.push(`- blockerMovement: ${health.currentBlocker.movement || 'unknown'}`);
  }
  if (health.projectionFreshness) {
    lines.push('', '## Projection Freshness');
    lines.push(`- frontier: ${health.projectionFreshness.frontier.fresh ? 'fresh' : 'stale'}`);
    if (health.projectionFreshness.frontier.command) {
      lines.push(`- frontierCommand: ${health.projectionFreshness.frontier.command}`);
    }
    lines.push(`- closure: ${health.projectionFreshness.closure.fresh ? 'fresh' : 'stale'}`);
    if (health.projectionFreshness.closure.command) {
      lines.push(`- closureCommand: ${health.projectionFreshness.closure.command}`);
    }
  }
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
  if (health.scopePressure) {
    lines.push('', '## Scope Pressure');
    lines.push(`- changedFiles: ${health.scopePressure.changedPaths.length}`);
    lines.push(`- ownerAreas: ${health.scopePressure.ownerAreas.join(', ') || 'none'}`);
  }
  return `${lines.join('\n')}\n`;
}
