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
  EVENT_FINDING,
  STATUS_SOLVED,
  STATUS_EXHAUSTED,
  LADDER,
  PARK_RUNG_INDEX,
  DISCRIMINATION_CONFIRMED,
  DISCRIMINATION_REFUTED,
  DISCRIMINATIONS,
  INVESTIGATION_BUDGET,
  CANNOT_MEASURE_RETRY_BUDGET,
  CONVERGENCE_GUARDS,
  PARK_KIND_EXHAUSTED,
  PARK_KIND_CANNOT_MEASURE,
  PARK_REASON_EXHAUSTED,
  PARK_REASON_CANNOT_MEASURE,
  OUTCOME_SOLVED,
  OUTCOME_EXHAUSTED,
  OUTCOME_MAX_CYCLES,
  OUTCOME_THEORY_REQUIRED,
  OUTCOME_BLOCKED,
  OUTCOME_SUPERVISOR_PAUSED_MEASUREMENT,
  OUTCOME_SUPERVISOR_STALLED,
  OUTCOME_SUPERVISOR_BUDGET,
  SUPERVISOR_MAX_RESTARTS,
  SUPERVISOR_STALL_WINDOW,
  DISPOSITION_PARK_RESUMABLE,
  EVENT_THEORY_SYSTEM_DECLARED,
  EVENT_REFLECTION,
  EVENT_EVIDENCE_INGESTED,
} from './constants.js';
import {appendEvent, readLog, projectState, rebuildState, invariantHighWater} from './store.js';
import {frontierHasValidSample} from './sample-validity.js';
import {autoCommitQuest} from './handoff.js';
import {writeReportForQuest} from './report.js';
import {evaluate} from './probe.js';
import {triggerOnQuestClosure, questScopes} from './invariant-liveness.js';
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
import {scopeTerminalStatus, coupledLocalFixBlocked} from './convergence-guards.js';
import {analyzeQuestHealth} from './health.js';
import {appendReflection} from './store.js';
import {
  reflectionDue,
  reflectionPrompt,
  altitudeReflectionDue,
  altitudeReflectionPrompt,
} from './reflection.js';
import {
  CONTINUATION_BLOCKED_THEORY,
  continuationIsAllowed,
  unrecordedEvidenceContinuation,
} from './continuation.js';
import {
  resolveGateDecision,
  theoryGateContinuation,
  decisionContinues,
} from './gate.js';
import {
  metricKindFromProbeSpec,
  probeSpecFromIdentity,
  stableProbeKey,
} from './probe-spec.js';

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
  OUTCOME_BLOCKED,
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
    const decision = resolveGateDecision(
      root,
      quest,
      theoryGateContinuation(readinessProblems),
      {log, frontier: pick.def.id, rungIndex, softFirst: true},
    );
    // Soft-first: an advisory downgrade keeps the cycle running — fall through and run the
    // harness this attempt instead of stopping. A hard gate records the violation and stops.
    if (!decisionContinues(decision)) {
      appendEvent(root, quest.id, {
        type: EVENT_VIOLATION,
        scope: 'theory-gate',
        frontier: pick.def.id,
        rung: LADDER[rungIndex],
        rungIndex,
        violations: readinessProblems,
      });
      return {
        terminal: decision.outcome,
        evidence: null,
        frontier: pick.def.id,
        problems: readinessProblems,
        disposition: decision.disposition,
        nextCommand: decision.nextCommand,
      };
    }
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
  const probeKey = stableProbeKey(pick.def.metric);
  const beforeProbeKey =
    stableProbeKey(probeSpecFromIdentity(before.evidenceIdentity)) ||
    probeKey;
  const afterProbeKey =
    stableProbeKey(probeSpecFromIdentity(after.evidenceIdentity)) ||
    probeKey;
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
    beforeEvidence: before.evidence || null,
    beforeEvidenceIdentity: before.evidenceIdentity || null,
    beforeEvidenceFingerprint: before.evidenceFingerprint || null,
    evidenceIdentity: after.evidenceIdentity || null,
    evidenceFingerprint: after.evidenceFingerprint || null,
    probeKey: afterProbeKey || probeKey,
    beforeProbeKey,
    afterProbeKey,
    metricKind: metricKindFromProbeSpec(pick.def.metric),
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
    nodeExit: after.nodeExit?.present ? after.nodeExit : null,
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
  // rr-F: deny progress credit to a single-owner local fix while a coupled-invariant
  // oscillation stands unreconciled. A measured patch that leaves any coupled family red
  // has not performed the required atomic cross-owner reconcile, so it force-stalls (climbs
  // toward the system-theory/model reconcile rung) instead of banking whack-a-mole credit.
  // An attempt that greens every coupled family at once — or a coupling already explained
  // by a finding — is not blocked, so the honest reconcile still earns its credit.
  const coupledBlocked = measured && CONVERGENCE_GUARDS.couplingReconcile &&
    coupledLocalFixBlocked(log, pick.def.id, satisfiedInvariants);
  // Failure-class pivot: when the measured run records an unexpected node exit (a process
  // died mid-scenario), the convergence/topology dominantReason can MASK the crash. A
  // convergence-theory attempt must not bank progress credit on such a run — the crash is
  // its own blocker to rule out first. Deny credit (force-stall toward the system-reconcile
  // rung) and record the distinct blocker so it is surfaced instead of mis-theorized.
  const nodeExit = measured && after.nodeExit?.present ? after.nodeExit : null;
  if (nodeExit) {
    appendEvent(root, quest.id, {
      type: EVENT_FINDING,
      frontier: pick.def.id,
      claim: `unexpected node exit (${nodeExit.count} node(s)` +
        `${nodeExit.nodes.length ? `: ${nodeExit.nodes.join(', ')}` : ''}) — a distinct ` +
        'crash blocker that confounds the convergence signal; rule it out before crediting ' +
        'any convergence/publication theory on this run',
      evidence: after.evidence || null,
    });
  }
  const forceStall = (measured && oscillation.oscillating) || regressed.length > 0 ||
    coupledBlocked || Boolean(nodeExit);
  const progressed = decideAndRecord(
    root, quest, pick, event, after, violations, forceStall);
  appendTheoryResultForAttempt(root, quest, event, progressed, violations);
  return {event, after, violations, progressed, oscillation, regressed, nodeExit};
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

// Count consecutive non-measuring attempts at the tail of a frontier's history — the
// run of `invalidSample === true` attempts since its last trustworthy sample. A measuring
// attempt (or any non-attempt boundary on the frontier) resets the run. The current
// attempt is not yet appended when this is read, so callers add 1 for the live sample.
function trailingNonMeasuringRun(log, frontierId) {
  let count = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.type !== EVENT_ATTEMPT || e.frontier !== frontierId) continue;
    if (e.invalidSample === true) count += 1;
    else break;
  }
  return count;
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
  // Invalid-sample hygiene: a positively-classified non-measuring sample is not a stall.
  // A sample the harness could not trust is not evidence that the rung's strategy failed,
  // so it must not climb the ladder toward an `exhausted` park it never earned. Instead it
  // HOLDS the rung and retries, emitting an advisory diagnostic that points at the harness.
  // The retry is bounded: once CANNOT_MEASURE_RETRY_BUDGET consecutive samples fail to
  // measure, the frontier parks as cannot_measure (a harness verdict), never as exhausted.
  const nonMeasuring = event.invalidSample === true;
  const nonMeasuringRun = nonMeasuring ?
    trailingNonMeasuringRun(log, event.frontier) + 1 : 0;
  const measurementExhausted = nonMeasuring &&
    nonMeasuringRun >= CANNOT_MEASURE_RETRY_BUDGET;
  const holdForRetry = nonMeasuring && !measurementExhausted;
  // A rung is escalated on a stall or on untrusted (violating) data. It is kept on
  // honest metric progress, held (not climbed) on a credited discrimination, and held on
  // ANY non-measuring sample — climbing the ladder requires a trustworthy observation, so
  // a sample the harness could not measure never advances (or parks via) the strategy
  // ladder; it parks, if at all, as cannot_measure once the retry budget is spent.
  const nextRung = (progressed || investigative || nonMeasuring) ? event.rungIndex :
    Math.min(event.rungIndex + 1, PARK_RUNG_INDEX);
  appendEvent(root, quest.id, {
    ...event,
    rungIndex: nextRung,
    investigative: investigative || undefined,
  });
  if (holdForRetry) {
    appendEvent(root, quest.id, {
      type: EVENT_FINDING,
      frontier: pick.def.id,
      claim: `non-measuring sample (${nonMeasuringRun}/${CANNOT_MEASURE_RETRY_BUDGET}): ` +
        'harness produced no trustworthy metric; holding the rung for retry rather than ' +
        'climbing toward an unearned exhausted park',
    });
  }
  if (after.done) {
    appendEvent(root, quest.id, {
      type: EVENT_SOLVED,
      frontier: pick.def.id,
      evidence: after.evidence,
      evidenceIdentity: after.evidenceIdentity || null,
      evidenceFingerprint: after.evidenceFingerprint || null,
    });
  } else if (measurementExhausted) {
    appendEvent(root, quest.id, {
      type: EVENT_PARK,
      frontier: pick.def.id,
      kind: PARK_KIND_CANNOT_MEASURE,
      reason: PARK_REASON_CANNOT_MEASURE,
      finalMetric: after.metric,
    });
  } else if (!progressed && !nonMeasuring && nextRung >= PARK_RUNG_INDEX) {
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
    commitEvery: Number.isInteger(options.commitEvery) && options.commitEvery > 0 ?
      options.commitEvery : 1,
  };
}

// Attempt the scope-clean auto-commit after a measured attempt. While the Quest is
// still running this is a CHECKPOINT commit, gated only on source-change verification
// (not on a terminal status), so a long non-terminal Quest persists each verified,
// scope-clean attempt instead of accumulating an unrecoverable dirty tree; the durable
// terminal commit at SOLVED/EXHAUSTED still happens at the loop's terminal sites. It
// never pushes. Also a no-op outside a git work tree, on non-measuring samples, and
// when the change artifact does not resolve, so throwaway tmpdir tests never commit.
function maybeCommitAttempt(root, quest, ctx, pick, outcome) {
  if (!ctx.autoCommit) return;
  const event = outcome?.event;
  if (!event || event.invalidSample || !event.changeRef) return;
  if (outcome.violations?.length > 0) return;
  const resolves = ctx.honestyCtx.inspectChangeRef ?
    Boolean(ctx.honestyCtx.inspectChangeRef(event.changeRef)?.valid) : true;
  if (!resolves) return;
  const log = readLog(root, quest.id);
  const measuredCount = log.filter((e) =>
    e.type === EVENT_ATTEMPT &&
    e.frontier === pick.def.id &&
    e.invalidSample !== true).length;
  if (measuredCount % ctx.commitEvery !== 0) return;
  // If the Quest has already terminalized this cycle, let the durable terminal commit
  // own it; otherwise persist this attempt as a squashable checkpoint.
  const terminalized = log.some((e) => e.type === EVENT_QUEST &&
    (e.status === STATUS_SOLVED || e.status === STATUS_EXHAUSTED));
  if (terminalized) return;
  writeReportForQuest(root, quest);
  return autoCommitQuest(root, quest.id, {checkpoint: true});
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
    // Standing-invariant on-quest-closure trigger (default-off, side-effect-only):
    // re-verify invariants whose scope this quest touched. Wrapped so an invariant
    // evaluation can never fail a quest closure.
    try {
      triggerOnQuestClosure(root, {scopes: questScopes(quest)});
    } catch {
      // invariant verification must never break the Solver loop
    }
  }
  rebuildState(root, quest);
  return {done: true, evidence: questDone.evidence};
}

// Run the mandatory step-back reflection turn when the executor can satisfy it. The turn is
// pure reasoning: the reflection-capable executor reads the whole history and returns a
// free-form reframing note, which is recorded as an append-only EVENT_REFLECTION (no gate
// fires, no metric is read). Returns true when a reflection was recorded so the caller skips
// this cycle's gate + attempt (the think turn stands alone). When the configured executor is
// not reflection-capable, returns false: the loop proceeds normally and the reflection is
// only surfaced as advice (health/CLI), so non-reflective drivers are never disturbed.
function maybeRunReflection(root, quest, ctx, health, trigger, kind = 'micro') {
  if (!ctx.executor || typeof ctx.executor.reflect !== 'function') return false;
  const prompt = kind === 'altitude' ?
    altitudeReflectionPrompt(quest, health, trigger) :
    reflectionPrompt(quest, health, trigger);
  let note = null;
  try {
    const out = ctx.executor.reflect({
      quest,
      health,
      trigger,
      kind,
      prompt,
    });
    note = out && typeof out.reflection === 'string' ? out.reflection :
      (out && typeof out.note === 'string' ? out.note : null);
  } catch (_error) {
    note = null;
  }
  appendReflection(root, quest.id, {
    frontier: health.frontier || null,
    trigger,
    kind,
    note,
  });
  return true;
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
    kind: 'frontier',
  });
  if (unrecorded) {
    const decision = resolveGateDecision(
      root,
      quest,
      unrecordedEvidenceContinuation(unrecorded),
      {log: readLog(root, quest.id), frontier: unrecorded.frontier},
    );
    return {
      ...finish(root, quest, decision.outcome, null),
      frontier: unrecorded.frontier,
      problems: decision.problems,
      disposition: decision.disposition,
      nextCommand: decision.nextCommand,
    };
  }

  const maxCycles = Number.isInteger(options.maxCycles) ? options.maxCycles : 1000;
  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const questDone = evaluate(quest.doneWhen, ctx.probeCtx);
    if (!questDone.done) {
      const executionHealth = analyzeQuestHealth(root, quest, {
        liveProbe: questDone,
        continuationOptions: {
          requireModelEvidence: !ctx.modelRef && !ctx.modelNotApplicable,
        },
      });
      // Mandatory step-back reflection turn. Before resolving any gate, force a reflection
      // when one is due. It is a pure think turn — NO gate fires during it — so when one is
      // recorded we skip this cycle's gate + attempt and re-enter the loop fresh. Only a
      // reflection-capable executor performs it; other drivers are unaffected
      // (maybeRunReflection returns false and the loop proceeds).
      //
      // Altitude (framing) reflection is checked FIRST: coupled-invariant oscillation, or the
      // coarse altitude cadence, pulls the agent out to question the frame itself before any
      // within-frame micro reframe. Only if no altitude reflection is due do we consider the
      // micro reflection (its 5-attempt cadence or runaway scope pressure).
      const altitudeTrigger = altitudeReflectionDue(readLog(root, quest.id), {
        oscillating: (executionHealth.signals || []).some(
          (signal) => signal.type === 'coupled-invariant-oscillation'),
      });
      if (altitudeTrigger &&
        maybeRunReflection(root, quest, ctx, executionHealth, altitudeTrigger, 'altitude')) {
        continue;
      }
      const reflectTrigger = reflectionDue(readLog(root, quest.id), {
        scope: (executionHealth.signals || []).some(
          (signal) => signal.type === 'scope-pressure-terminal'),
      });
      if (reflectTrigger &&
        maybeRunReflection(root, quest, ctx, executionHealth, reflectTrigger, 'micro')) {
        continue;
      }
      if (!continuationIsAllowed(executionHealth.continuation)) {
        // Soft-first: the pre-attempt health gate resolves the block through the graded
        // gate with softFirst enabled. A soft-eligible theory block under quorum is recorded
        // as a single ADVISORY for this cycle and the run continues (falls through to run the
        // harness). The readiness gate that immediately precedes the harness sees the same
        // condition but reuses this cycle's advisory (no double-count). Model-evidence is
        // only surfaced by this health gate (the begin-phase readiness gate does not check
        // it), so recording here — rather than deferring to the readiness gate — is what
        // gives the model rung its bounded ramp instead of an unbounded defer. Once the
        // quorum is reached the gate resolves to its real disposition and stops.
        const decision = resolveGateDecision(
          root,
          quest,
          executionHealth.continuation,
          {
            log: readLog(root, quest.id),
            frontier: executionHealth.frontier,
            rungIndex: executionHealth.rungIndex,
            softFirst: true,
          },
        );
        if (!decisionContinues(decision)) {
          if (executionHealth.continuation.status === CONTINUATION_BLOCKED_THEORY) {
            appendEvent(root, quest.id, {
              type: EVENT_VIOLATION,
              scope: 'theory-gate',
              frontier: executionHealth.frontier,
              rung: Number.isInteger(executionHealth.rungIndex) ?
                LADDER[executionHealth.rungIndex] :
                null,
              rungIndex: executionHealth.rungIndex,
              violations: executionHealth.continuation.problems,
            });
          }
          return {
            ...finish(root, quest, decision.outcome, null),
            frontier: executionHealth.frontier,
            problems: executionHealth.continuation.problems,
            disposition: decision.disposition,
            nextCommand: decision.nextCommand,
          };
        }
      }
    }
    const {
      terminal,
      evidence,
      evidenceIdentity,
      evidenceFingerprint,
      problems,
      frontier,
      disposition,
      nextCommand,
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
      result.commit = autoCommitQuest(root, quest.id);
      return result;
    }
    if (terminal === OUTCOME_EXHAUSTED) {
      const result = finish(root, quest, STATUS_EXHAUSTED, evidence);
      writeReportForQuest(root, quest);
      result.commit = autoCommitQuest(root, quest.id);
      return result;
    }
    if (terminal === OUTCOME_THEORY_REQUIRED || terminal === OUTCOME_BLOCKED) {
      return {
        ...finish(root, quest, terminal, evidence),
        frontier,
        problems,
        disposition,
        nextCommand,
      };
    }
  }
  return finish(root, quest, OUTCOME_MAX_CYCLES, null);
}

// Durable-progress cursor: the count of events that change quest state or add durable
// KNOWLEDGE — a MEASURED attempt, a measuring ingested-evidence sample, a finding, a
// reflection, a system-theory declaration, a park, or a solve. It deliberately EXCLUDES
// gate-decision and violation records (a hard block appends those every cycle), AND the
// per-frontier theory bookkeeping (option-declared / selected / theory-result) plus
// frontier reopens: those are churn a stuck Solver emits on every cycle, so counting them
// let pure whack-a-mole — "select theory N+1, re-run, repeat" — masquerade as progress and
// defeat the supervisor's stall guard. Knowledge (findings/reflections) and real state
// changes (measured attempts, parks, solves) still count, so a productive session is never
// starved; a theory-churn-only session now correctly stalls.
export function durableProgressCount(log) {
  const always = new Set([
    EVENT_FINDING,
    EVENT_THEORY_SYSTEM_DECLARED,
    EVENT_REFLECTION,
    EVENT_PARK,
    EVENT_SOLVED,
  ]);
  let count = 0;
  for (const event of log || []) {
    if (always.has(event.type)) {
      count += 1;
    } else if (event.type === EVENT_ATTEMPT && event.invalidSample !== true) {
      count += 1;
    } else if (event.type === EVENT_EVIDENCE_INGESTED &&
      event.invalidSample !== true && event.metric !== null) {
      count += 1;
    }
  }
  return count;
}

// Keep-alive supervisor. Wraps runLoop and re-invokes it across NON-terminal stops so the
// autonomous quest keeps contributing to its append-only memory instead of dying when one
// driver session ends. It is decision-aware, NOT a blind retry loop:
//   - SOLVED / EXHAUSTED            honest terminal -> stop and pass the result through.
//   - park-resumable (measurement)  a dead/disconnected harness -> stop immediately; re-running
//                                   cannot help until a human repairs the harness.
//   - MAX_CYCLES / THEORY_REQUIRED / other BLOCKED (reroute/explore) -> a recoverable stop the
//                                   executor can act on -> restart runLoop.
// Two bounds prevent a hot spin: a restart cap (SUPERVISOR_MAX_RESTARTS) and a stall guard —
// if no new durable-progress event is appended across SUPERVISOR_STALL_WINDOW consecutive
// restarts, it steps back with OUTCOME_SUPERVISOR_STALLED. The two-terminal contract is
// preserved: every supervisor-specific outcome is NON-terminal and never closes a quest.
export function runSupervised(root, quest, options = {}) {
  const maxRestarts = Number.isInteger(options.maxRestarts) ?
    options.maxRestarts : SUPERVISOR_MAX_RESTARTS;
  const stallWindow = Number.isInteger(options.stallWindow) ?
    options.stallWindow : SUPERVISOR_STALL_WINDOW;
  const onRestart = typeof options.onRestart === 'function' ? options.onRestart : null;
  // The runner is injectable so the supervisor's decision policy can be unit-tested in
  // isolation; production always uses the real runLoop.
  const runner = typeof options.runner === 'function' ? options.runner : runLoop;

  let restarts = 0;
  let staleRestarts = 0;
  let lastProgress = durableProgressCount(readLog(root, quest.id));
  let result = runner(root, quest, options);

  for (;;) {
    if (result.outcome === STATUS_SOLVED || result.outcome === STATUS_EXHAUSTED) {
      return {...result, supervisor: {restarts, stop: result.outcome}};
    }
    // A measurement gate means the apparatus, not the system, is broken. Re-running the same
    // loop cannot produce a measurement, so step back and surface the harness repair.
    if (result.disposition === DISPOSITION_PARK_RESUMABLE) {
      return {
        ...result,
        outcome: OUTCOME_SUPERVISOR_PAUSED_MEASUREMENT,
        supervisor: {restarts, stop: 'measurement', innerOutcome: result.outcome},
      };
    }
    if (restarts >= maxRestarts) {
      return {
        ...result,
        outcome: OUTCOME_SUPERVISOR_BUDGET,
        supervisor: {restarts, stop: 'budget', innerOutcome: result.outcome},
      };
    }
    const progress = durableProgressCount(readLog(root, quest.id));
    staleRestarts = progress > lastProgress ? 0 : staleRestarts + 1;
    lastProgress = progress;
    if (staleRestarts >= stallWindow) {
      return {
        ...result,
        outcome: OUTCOME_SUPERVISOR_STALLED,
        supervisor: {restarts, stop: 'stalled', innerOutcome: result.outcome},
      };
    }
    restarts += 1;
    if (onRestart) onRestart({restarts, innerOutcome: result.outcome, progress});
    result = runner(root, quest, options);
  }
}
