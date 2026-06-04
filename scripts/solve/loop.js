// The loop driver — the entire control flow, with two real terminals and bounded
// non-terminal stops:
//   SOLVED          quest.doneWhen is true             -> stop, present result
//   EXHAUSTED       no open frontier remains           -> stop, present result
//   MAX_CYCLES      safety bound for CI/skeleton runs   -> stop, not terminal
//   THEORY_REQUIRED a rung gate is missing theory input -> stop, not terminal
//
// Progress (metric strictly decreased) keeps the current rung; a stall climbs the
// finite strategy ladder; reaching the park rung parks the frontier and the scheduler
// redirects. No step ever waits on a human.

import fs from 'node:fs';

import {
  EVENT_QUEST_DECLARED,
  EVENT_ATTEMPT,
  EVENT_SOLVED,
  EVENT_PARK,
  EVENT_QUEST,
  EVENT_VIOLATION,
  STATUS_SOLVED,
  STATUS_EXHAUSTED,
  LADDER,
  PARK_RUNG_INDEX,
  DISCRIMINATION_CONFIRMED,
  DISCRIMINATION_REFUTED,
  DISCRIMINATIONS,
  INVESTIGATION_BUDGET,
  PARK_KIND_EXHAUSTED,
  PARK_KIND_CANNOT_MEASURE,
  PARK_REASON_EXHAUSTED,
  PARK_REASON_CANNOT_MEASURE,
  OUTCOME_SOLVED,
  OUTCOME_EXHAUSTED,
  OUTCOME_MAX_CYCLES,
  OUTCOME_THEORY_REQUIRED,
} from './constants.js';
import {appendEvent, readLog, projectState, rebuildState, invariantHighWater} from './store.js';
import {frontierHasValidSample} from './sample-validity.js';
import {autoCommitQuest} from './handoff.js';
import {writeReportForQuest} from './report.js';
import {evaluate} from './probe.js';
import {pickFrontier} from './scheduler.js';
import {
  validateAttempt,
  validateGoalpostsImmutable,
  METRIC_DIRECTION_LOWER_IS_BETTER,
} from './honesty.js';
import {
  appendTheoryResultForAttempt,
  resolveAttemptTheoryRef,
  stepTheoryGateProblems,
} from './theory.js';
import {diagnosticMovementFor, detectOscillation} from './current-blocker.js';
import {detectUnrecordedEvidence} from './evidence.js';
import {inspectChangeArtifact} from './change-artifact.js';
import {analyzeScopePressure} from './scope-pressure.js';
import {scopeTerminalStatus} from './convergence-guards.js';

function defaultFileExists(p) {
  return Boolean(p) && fs.existsSync(p);
}

function defaultChangeRefResolves(root, quest) {
  return (ref) => inspectChangeArtifact(root, quest, ref).valid;
}

function sealGoal(quest) {
  return {
    doneWhen: quest.doneWhen,
    frontierMetrics: quest.frontiers.map((f) => f.metric),
  };
}

function ensureDeclared(root, quest) {
  const log = readLog(root, quest.id);
  const declared = log.find((e) => e.type === EVENT_QUEST_DECLARED);
  if (declared) return declared;
  return appendEvent(root, quest.id, {
    type: EVENT_QUEST_DECLARED,
    sealed: sealGoal(quest),
  });
}

const NON_TERMINAL_STOPS = Object.freeze([
  OUTCOME_MAX_CYCLES,
  OUTCOME_THEORY_REQUIRED,
]);

function finish(root, quest, outcome, evidence, evidenceIdentity = null,
  evidenceFingerprint = null) {
  if (!NON_TERMINAL_STOPS.includes(outcome)) {
    appendEvent(root, quest.id, {
      type: EVENT_QUEST,
      status: outcome,
      evidence,
      evidenceIdentity,
      evidenceFingerprint,
    });
  }
  const state = rebuildState(root, quest);
  return {outcome, evidence, state};
}

function runOneCycle(root, quest, ctx) {
  const questDone = evaluate(quest.doneWhen, ctx.probeCtx);
  if (questDone.done) {
    return {
      terminal: OUTCOME_SOLVED,
      evidence: questDone.evidence,
      evidenceIdentity: questDone.evidenceIdentity || null,
      evidenceFingerprint: questDone.evidenceFingerprint || null,
    };
  }
  const state = projectState(quest, readLog(root, quest.id));
  const pick = pickFrontier(quest, state, ctx.scoreFn);
  if (!pick) return {terminal: OUTCOME_EXHAUSTED, evidence: null};

  const before = evaluate(pick.def.metric, ctx.probeCtx);
  if (before.done) {
    appendEvent(root, quest.id, {
      type: EVENT_SOLVED,
      frontier: pick.def.id,
      evidence: before.evidence,
      evidenceIdentity: before.evidenceIdentity || null,
      evidenceFingerprint: before.evidenceFingerprint || null,
    });
    return {terminal: null};
  }
  return applyAttempt(root, quest, ctx, pick, before);
}

function applyAttempt(root, quest, ctx, pick, before) {
  const rungIndex = pick.state.rungIndex;
  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  const scopeTerminal = scopeTerminalStatus(
    analyzeScopePressure(root, quest, log)).terminal;
  const readinessProblems = stepTheoryGateProblems({
    log,
    state,
    frontierId: pick.def.id,
    rungIndex,
    scopeTerminal,
    phase: 'begin',
  });
  if (readinessProblems.length > 0) {
    appendEvent(root, quest.id, {
      type: EVENT_VIOLATION,
      scope: 'theory-gate',
      frontier: pick.def.id,
      rung: LADDER[rungIndex],
      rungIndex,
      violations: readinessProblems,
    });
    return {
      terminal: OUTCOME_THEORY_REQUIRED,
      evidence: null,
      frontier: pick.def.id,
      problems: readinessProblems,
    };
  }
  const priorAttempts = log.filter((e) =>
    e.type === EVENT_ATTEMPT && e.frontier === pick.def.id);
  const metricHistory = priorAttempts
    .map((e) => e.metricAfter)
    .filter((metric) => Number.isFinite(metric));
  if (Number.isFinite(before.metric)) metricHistory.push(before.metric);
  const evidencePaths = priorAttempts
    .map((e) => e.evidence)
    .filter(Boolean);
  if (before.evidence) evidencePaths.push(before.evidence);
  const result = ctx.executor.run({
    quest,
    frontierDef: pick.def,
    frontierState: pick.state,
    theories: state.theories,
    rung: LADDER[rungIndex],
    rungIndex,
    metricHistory,
    evidencePaths,
  });
  const outcome = finalizeAttempt(root, quest, ctx, pick, before, result);
  maybeCommitAttempt(root, quest, ctx, pick, outcome);
  return {terminal: null};
}

// Record one attempt's outcome: re-measure the metric, build + honesty-check the
// attempt event, persist it, and run the keep/climb/park decision. Shared by the
// autonomous loop and the manual `step` flow so both obey identical honesty rules.
export function finalizeAttempt(root, quest, ctx, pick, before, result) {
  const rungIndex = pick.state.rungIndex;
  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  const theoryRef = resolveAttemptTheoryRef(
    state,
    pick.def.id,
    result.theoryRef || ctx.theoryRef,
  );
  const after = evaluate(pick.def.metric, ctx.probeCtx);
  const diagnosticMovement = diagnosticMovementFor(log, pick.def.id);
  const satisfiedInvariants = Array.isArray(after.satisfiedInvariants) ?
    after.satisfiedInvariants : [];
  const event = {
    type: EVENT_ATTEMPT,
    frontier: pick.def.id,
    rung: LADDER[rungIndex],
    rungIndex,
    prevRungIndex: rungIndex,
    hypothesis: result.summary || null,
    changeRef: result.changeRef || null,
    metricBefore: before.metric,
    metricAfter: after.metric,
    metricDirection: METRIC_DIRECTION_LOWER_IS_BETTER,
    invalidSample: Boolean(before.invalidSample) || Boolean(after.invalidSample),
    done: after.done === true,
    evidence: after.evidence,
    evidenceIdentity: after.evidenceIdentity || null,
    evidenceFingerprint: after.evidenceFingerprint || null,
    theoryRef,
    expectedMovement: result.expectedMovement || ctx.expectedMovement || null,
    negativeResultMeans:
      result.negativeResultMeans || ctx.negativeResultMeans || null,
    modelRef: result.modelRef || ctx.modelRef || null,
    modelNotApplicable:
      result.modelNotApplicable || ctx.modelNotApplicable || null,
    blockerBefore: diagnosticMovement.previous,
    blockerAfter: diagnosticMovement.current,
    blockerMovement: diagnosticMovement.movement,
    diagnosticMovement: diagnosticMovement.summary,
    satisfiedInvariants: satisfiedInvariants.length > 0 ? satisfiedInvariants : null,
    discrimination: normalizeDiscrimination(result.discrimination || ctx.discrimination || null),
  };
  const violations = [
    ...validateAttempt(event, ctx.honestyCtx),
    ...stepTheoryGateProblems({
      log,
      state,
      frontierId: pick.def.id,
      rungIndex,
      theoryRef: event.theoryRef,
      modelRef: event.modelRef,
      modelNotApplicable: event.modelNotApplicable,
    }),
  ];
  if (violations.length > 0) {
    appendEvent(root, quest.id, {
      type: EVENT_VIOLATION, frontier: pick.def.id, violations, attempt: event,
    });
  }
  // R2/R3 convergence gates: a measured attempt that returns to a previously-left
  // blocker (oscillation) or drops a previously-satisfied invariant (regression)
  // must not count as progress, even if the single-run metric ticked down.
  const measured = !event.invalidSample;
  const oscillation = detectOscillation(log, pick.def.id);
  const highWater = invariantHighWater(log, pick.def.id);
  const regressed = measured ?
    highWater.filter((label) => !satisfiedInvariants.includes(label)) : [];
  if (regressed.length > 0) {
    appendEvent(root, quest.id, {
      type: EVENT_VIOLATION,
      scope: 'regression',
      frontier: pick.def.id,
      regressed,
      attempt: event,
    });
  }
  const forceStall = (measured && oscillation.oscillating) || regressed.length > 0;
  const progressed = decideAndRecord(
    root, quest, pick, event, after, violations, forceStall);
  appendTheoryResultForAttempt(root, quest, event, progressed, violations);
  return {event, after, violations, progressed, oscillation, regressed};
}

function normalizeDiscrimination(value) {
  return DISCRIMINATIONS.includes(value) ? value : null;
}

// Count prior investigative credits already spent on this frontier. Each credited
// attempt persisted `investigative: true` on its recorded attempt event, so the budget
// counter reads the log directly rather than re-deriving the decision.
function investigativeCreditsSpent(log, frontierId) {
  const credited = new Set();
  for (const e of log) {
    if (e.type === EVENT_ATTEMPT && e.frontier === frontierId &&
      e.investigative === true && e.theoryRef) {
      credited.add(e.theoryRef);
    }
  }
  return credited;
}

function decideAndRecord(root, quest, pick, event, after, violations,
  forceStall = false) {
  const progressed = !forceStall && violations.length === 0 &&
    after.metric !== null && event.metricBefore !== null &&
    after.metric < event.metricBefore;
  // Falsification-as-progress: an honest, evidence-backed attempt that confirms or
  // refutes its bound theory is real investigative progress even when the product
  // metric does not move. Such an attempt HOLDS the rung (like metric progress) instead
  // of climbing toward park — but only for a distinct, not-yet-credited theory and only
  // while the per-frontier investigation budget remains. This keeps termination intact:
  // the budget is finite and each credit consumes (falsifies/supports) a distinct
  // theory, so once hypotheses or budget run out, non-progress climbs to park as usual.
  const log = readLog(root, quest.id);
  const creditedTheories = investigativeCreditsSpent(log, event.frontier);
  const investigative = !progressed && !forceStall && violations.length === 0 &&
    !event.invalidSample &&
    (event.discrimination === DISCRIMINATION_CONFIRMED ||
      event.discrimination === DISCRIMINATION_REFUTED) &&
    Boolean(event.theoryRef) &&
    !creditedTheories.has(event.theoryRef) &&
    creditedTheories.size < INVESTIGATION_BUDGET;
  // A rung is escalated on a stall or on untrusted (violating) data. It is kept on
  // honest metric progress, and held (not climbed) on a credited discrimination.
  const nextRung = (progressed || investigative) ? event.rungIndex :
    Math.min(event.rungIndex + 1, PARK_RUNG_INDEX);
  appendEvent(root, quest.id, {
    ...event,
    rungIndex: nextRung,
    investigative: investigative || undefined,
  });
  if (after.done) {
    appendEvent(root, quest.id, {
      type: EVENT_SOLVED,
      frontier: pick.def.id,
      evidence: after.evidence,
      evidenceIdentity: after.evidenceIdentity || null,
      evidenceFingerprint: after.evidenceFingerprint || null,
    });
  } else if (!progressed && nextRung >= PARK_RUNG_INDEX) {
    const kind = classifyParkKind(root, quest, pick.def);
    appendEvent(root, quest.id, {
      type: EVENT_PARK,
      frontier: pick.def.id,
      kind,
      reason: kind === PARK_KIND_CANNOT_MEASURE ?
        PARK_REASON_CANNOT_MEASURE : PARK_REASON_EXHAUSTED,
      finalMetric: after.metric,
    });
  }
  return progressed;
}

// A park is only honest exhaustion when the frontier was actually measured at least
// once. If every attempt on the frontier was a non-measuring sample, "no metric
// movement" reflects a broken measurement harness, not solution-space exhaustion, so
// the park is classified CANNOT_MEASURE — a distinct terminal that points the operator
// at fixing the harness instead of abandoning the work.
function classifyParkKind(root, quest, frontierDef) {
  const attempts = readLog(root, quest.id)
    .filter((e) => e.type === EVENT_ATTEMPT && e.frontier === frontierDef.id);
  return frontierHasValidSample(root, attempts, frontierDef) ?
    PARK_KIND_EXHAUSTED : PARK_KIND_CANNOT_MEASURE;
}

// Build the shared run context (honesty hooks + probe context). Used by both the
// autonomous loop and the manual `step` flow so injected fs/VCS resolvers match.
export function makeRunContext(options = {}) {
  return {
    executor: options.executor,
    scoreFn: options.scoreFn,
    probeCtx: options.probeCtx || {},
    honestyCtx: {
      fileExists: options.fileExists || defaultFileExists,
      changeRefResolves: options.changeRefResolves || null,
      inspectChangeRef: options.inspectChangeRef || null,
    },
    theoryRef: options.theoryRef || null,
    discrimination: options.discrimination || null,
    expectedMovement: options.expectedMovement || null,
    negativeResultMeans: options.negativeResultMeans || null,
    modelRef: options.modelRef || null,
    modelNotApplicable: options.modelNotApplicable || null,
    autoCommit: options.autoCommit !== false,
    push: options.push,
    commitEvery: Number.isInteger(options.commitEvery) && options.commitEvery > 0 ?
      options.commitEvery : 1,
    pushEvery: Number.isInteger(options.pushEvery) && options.pushEvery > 0 ?
      options.pushEvery : 1,
  };
}

// R1: persist each measured attempt as its own scope-clean commit (and, on the push
// throttle, push it) so the autonomous loop produces regular feedback and per-patch
// rollback points instead of stacking dozens of attempts in one dirty tree. A no-op
// outside a git work tree, on non-measuring samples, and when the change artifact does
// not resolve, so throwaway tmpdir tests and skipped attempts never create commits.
function maybeCommitAttempt(root, quest, ctx, pick, outcome) {
  if (!ctx.autoCommit) return;
  const event = outcome?.event;
  if (!event || event.invalidSample || !event.changeRef) return;
  const resolves = ctx.honestyCtx.inspectChangeRef ?
    Boolean(ctx.honestyCtx.inspectChangeRef(event.changeRef)?.valid) : true;
  if (!resolves) return;
  const measuredCount = readLog(root, quest.id).filter((e) =>
    e.type === EVENT_ATTEMPT &&
    e.frontier === pick.def.id &&
    e.invalidSample !== true).length;
  if (measuredCount % ctx.commitEvery !== 0) return;
  const push = ctx.push !== false && measuredCount % ctx.pushEvery === 0;
  writeReportForQuest(root, quest);
  return autoCommitQuest(root, quest.id, {push});
}

// Seal the goalposts on first declaration and reject any later goalpost drift. Shared
// so manual steps are held to the same immutability guarantee as the loop.
export function ensureSealedGoal(root, quest) {
  const declared = ensureDeclared(root, quest);
  const goalpostViolations = validateGoalpostsImmutable(quest, declared);
  if (goalpostViolations.length > 0) {
    appendEvent(root, quest.id, {
      type: EVENT_VIOLATION, scope: 'goalposts', violations: goalpostViolations,
    });
    throw new Error(`goalpost violation: ${goalpostViolations.join('; ')}`);
  }
  return declared;
}

export function recordQuestSolvedIfDone(root, quest, ctx) {
  const questDone = evaluate(quest.doneWhen, ctx.probeCtx);
  if (!questDone.done) return {done: false, evidence: questDone.evidence};
  const alreadySolved = [...readLog(root, quest.id)].reverse()
    .some((e) => e.type === EVENT_QUEST && e.status === STATUS_SOLVED);
  if (!alreadySolved) {
    appendEvent(root, quest.id, {
      type: EVENT_QUEST,
      status: STATUS_SOLVED,
      evidence: questDone.evidence,
      evidenceIdentity: questDone.evidenceIdentity || null,
      evidenceFingerprint: questDone.evidenceFingerprint || null,
    });
  }
  rebuildState(root, quest);
  return {done: true, evidence: questDone.evidence};
}

export function runLoop(root, quest, options = {}) {
  const ctx = makeRunContext(options);
  ctx.probeCtx = {...ctx.probeCtx, root};
  ctx.honestyCtx.changeRefResolves =
    ctx.honestyCtx.changeRefResolves || defaultChangeRefResolves(root, quest);
  ctx.honestyCtx.inspectChangeRef =
    ctx.honestyCtx.inspectChangeRef ||
    ((ref) => inspectChangeArtifact(root, quest, ref));
  ensureSealedGoal(root, quest);

  const unrecorded = detectUnrecordedEvidence(root, quest.id, {
    requiresMeasuredHistory: true,
  });
  if (unrecorded) {
    throw new Error(
      'UNRECORDED_EVIDENCE: latest probe evidence is newer than Quest memory. ' +
      'Ingest it first:\n' +
      `  node scripts/solve.js ingest-evidence --id ${quest.id} ` +
      `--frontier ${unrecorded.frontier} --evidence ${unrecorded.evidence}`,
    );
  }

  const maxCycles = Number.isInteger(options.maxCycles) ? options.maxCycles : 1000;
  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const {
      terminal,
      evidence,
      evidenceIdentity,
      evidenceFingerprint,
      problems,
      frontier,
    } = runOneCycle(root, quest, ctx);
    if (terminal === OUTCOME_SOLVED) {
      const result = finish(
        root,
        quest,
        STATUS_SOLVED,
        evidence,
        evidenceIdentity,
        evidenceFingerprint,
      );
      writeReportForQuest(root, quest);
      result.commit = autoCommitQuest(root, quest.id, {push: options.push});
      return result;
    }
    if (terminal === OUTCOME_EXHAUSTED) {
      const result = finish(root, quest, STATUS_EXHAUSTED, evidence);
      writeReportForQuest(root, quest);
      result.commit = autoCommitQuest(root, quest.id, {push: options.push});
      return result;
    }
    if (terminal === OUTCOME_THEORY_REQUIRED) {
      return {
        ...finish(root, quest, OUTCOME_THEORY_REQUIRED, evidence),
        frontier,
        problems,
      };
    }
  }
  return finish(root, quest, OUTCOME_MAX_CYCLES, null);
}
