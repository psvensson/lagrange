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

const DONE_WHEN_SAMPLE_REJECTED =
  'doneWhen evidence is not an accepted measured sample';
const FRONTIER_INTEGRITY_UNRESOLVED =
  'frontier evidence is done but integrity violations remain unresolved';
const CHANGE_IDENTITY_UNSEALABLE =
  'changeRef artifact is missing a sealable content identity';
const INTEGRITY_SCOPE_REGRESSION = 'regression';
const INTEGRITY_SCOPE_THEORY_GATE = 'theory-gate';

import {
  EVENT_QUEST_DECLARED,
  EVENT_ATTEMPT,
  ATTEMPT_CLASSIFICATION_RECEIPT_ONLY,
  EVENT_NON_MEASUREMENT,
  EVENT_SOLVED,
  EVENT_PARK,
  EVENT_QUEST,
  EVENT_VIOLATION,
  EVENT_FINDING,
  EVENT_GATE_DECISION,
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
  OUTCOME_SUPERVISOR_BUDGET,
  SUPERVISOR_MAX_RESTARTS,
  DISPOSITION_PARK_RESUMABLE,
  DISPOSITION_ADVISORY,
  EVENT_THEORY_SYSTEM_DECLARED,
  EVENT_REFLECTION,
  EVENT_EVIDENCE_INGESTED,
} from './constants.js';
import {
  INTEGRITY_EVENT_SCHEMA_VERSION,
  INTEGRITY_RESOLUTION_NEW_QUEST,
  INTEGRITY_SCOPE_ATTEMPT,
  INTEGRITY_SCOPE_GOALPOSTS,
  acceptedReplacementViolationIds,
  integrityResolutionPolicyFor,
  integrityViolationId,
  terminalIntegrityAllowsClosure,
  terminalIntegrityProblems,
  terminalSampleIsAccepted,
} from './integrity.js';
import {appendEvent, readLog, projectState, rebuildState, invariantHighWater} from './store.js';
import {frontierHasValidSample} from './sample-validity.js';
import {autoCommitQuest} from './handoff.js';
import {
  LEGACY_VERIFICATION_CONTRACT_VERSION,
  resolveWorkspaceBaseCommit,
} from './verification.js';
import {assertQuestReadyToSeal} from './quest-lint.js';
import {writeReportForQuest} from './report.js';
import {evaluate} from './probe.js';
import {
  triggerOnQuestClosure, questScopes, altitudeInvariantDigest,
} from './invariant-liveness.js';
import {pickFrontier} from './scheduler.js';
import {
  validateAttempt,
  validateGoalpostsImmutable,
  baselineAbsentSample,
  METRIC_DIRECTION_LOWER_IS_BETTER,
} from './honesty.js';
import {questAmendments} from './amend.js';
import {
  appendTheoryResultForAttempt,
  resolveAttemptTheoryRef,
  stepTheoryGateProblems,
} from './theory.js';
import {diagnosticMovementFor, detectOscillation} from './current-blocker.js';
import {detectUnrecordedEvidence} from './evidence.js';
import {
  changeArtifactIdentity,
  changeArtifactIdentityIsSealed,
  inspectChangeArtifact,
} from './change-artifact.js';
import {analyzeScopePressure} from './scope-pressure.js';
import {scopeTerminalStatus, coupledLocalFixBlocked} from './convergence-guards.js';
import {analyzeQuestHealth} from './health.js';
import {appendReflection} from './store.js';
import {
  reflectionDue,
  reflectionPrompt,
  rejectionStreakDue,
  altitudeReflectionDue,
  altitudeReflectionPrompt,
} from './reflection.js';
import {
  CONTINUATION_BLOCKED_REJECTION_ESCALATION,
  CONTINUATION_BLOCKED_STATIC_QUALITY,
  CONTINUATION_BLOCKED_THEORY,
  continuationIsAllowed,
  unrecordedEvidenceContinuation,
} from './continuation.js';
import {staticQualityProblems} from './static-gate.js';
import {
  resolveGateDecision,
  theoryGateContinuation,
  theoryGateProblemAuthorizationKey,
  decisionContinues,
  candidateRejectionFingerprintsSinceApproval,
} from './gate.js';
import {
  REJECTION_ESCALATION_GUIDANCE,
  REJECTION_ESCALATION_LIMIT,
} from './constants.js';
import {
  metricKindFromProbeSpec,
  probeSpecFromIdentity,
  stableProbeKey,
} from './probe-spec.js';
import {typedNextAction} from './next-action.js';

const LOCAL_STR_OWNED_001 = 'Repair the measurement harness, then resume the Quest.';
const LOCAL_STR_OWNED_002 = 'Execute the reported judgment action, then resume the Quest.';
const LOCAL_STR_OWNED_003 = 'judgment';
const LOCAL_STR_OWNED_004 = 'Add durable evidence or revise the approach before resuming the Quest.';
const LOCAL_STR_OWNED_005 = 'no-progress';
const LOCAL_STR_OWNED_006 = 'Review the supervisor budget stop and choose the next evidence-bearing move.';

function defaultFileExists(p) {
  return Boolean(p) && fs.existsSync(p);
}

function defaultChangeRefResolves(root, quest) {
  return (ref) => inspectChangeArtifact(root, quest, ref).valid;
}

function sealGoal(quest) {
  const sealed = {
    doneWhen: quest.doneWhen,
    frontierMetrics: quest.frontiers.map((f) => f.metric),
  };
  if (quest.authoringContractVersion !== undefined) {
    Object.assign(sealed, {
      authoringContractVersion: quest.authoringContractVersion,
      statement: quest.statement,
      // The optional short title feeds the terminal commit subject, so it is
      // sealed with the statement — an unsealed subject would be post-hoc
      // editable narrative on an immutable result.
      title: quest.title || null,
      class: quest.class,
      constraints: quest.constraints || [],
      // The sealed verification bar: rejection categories are enforced
      // against the declaration event, so the bar must be captured here or
      // it silently no-ops for every declared quest.
      verificationTemplates: quest.verificationTemplates || [],
      frontierIds: quest.frontiers.map((frontier) => frontier.id),
    });
  }
  return sealed;
}

function ensureDeclared(root, quest) {
  const log = readLog(root, quest.id);
  const declared = log.find((e) => e.type === EVENT_QUEST_DECLARED);
  if (declared) return declared;
  assertQuestReadyToSeal(quest);
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
    const log = readLog(root, quest.id);
    if (!terminalSampleIsAccepted(questDone) ||
      !terminalIntegrityAllowsClosure(root, quest, log)) {
      const integrityProblems = terminalIntegrityProblems(root, quest, log)
        .map((item) => item.message);
      if (!terminalSampleIsAccepted(questDone)) {
        integrityProblems.push(DONE_WHEN_SAMPLE_REJECTED);
      }
      return {
        terminal: OUTCOME_BLOCKED,
        evidence: questDone.evidence,
        problems: integrityProblems,
      };
    }
    return {
      terminal: OUTCOME_SOLVED,
      evidence: questDone.evidence,
      evidenceIdentity: questDone.evidenceIdentity || null,
      evidenceFingerprint: questDone.evidenceFingerprint || null,
    };
  }
  const activeLog = readLog(root, quest.id);
  const state = projectState(quest, activeLog);
  const pick = pickFrontier(quest, state, ctx.scoreFn);
  if (!pick) {
    const integrityProblems = terminalIntegrityProblems(root, quest, activeLog)
      .map((item) => item.message);
    if (integrityProblems.length > 0) {
      return {
        terminal: OUTCOME_BLOCKED,
        evidence: null,
        problems: integrityProblems,
      };
    }
    return {terminal: OUTCOME_EXHAUSTED, evidence: null};
  }

  const before = evaluate(pick.def.metric, ctx.probeCtx);
  if (before.done) {
    if (!terminalSampleIsAccepted(before) ||
      !terminalIntegrityAllowsClosure(root, quest, readLog(root, quest.id))) {
      return {
        terminal: OUTCOME_BLOCKED,
        evidence: before.evidence,
        frontier: pick.def.id,
        problems: [FRONTIER_INTEGRITY_UNRESOLVED],
      };
    }
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
        scope: INTEGRITY_SCOPE_THEORY_GATE,
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
  // Same escalation admission as the supervised paths (attempt.js, step.js):
  // after REJECTION_ESCALATION_LIMIT distinct rejected candidates with no
  // intervening approval, the loop stops iterating and reports the reframe
  // move instead of burning executor cycles under an unsealed bar.
  const rejectedFingerprints =
    candidateRejectionFingerprintsSinceApproval(log, pick.def.id);
  if (rejectedFingerprints.size >= REJECTION_ESCALATION_LIMIT) {
    const escalationProblem =
      `candidate rejection escalation: ${rejectedFingerprints.size} distinct ` +
      `rejected candidates on ${pick.def.id} with no intervening approval; ` +
      REJECTION_ESCALATION_GUIDANCE;
    const decision = resolveGateDecision(root, quest, {
      status: CONTINUATION_BLOCKED_REJECTION_ESCALATION,
      code: CONTINUATION_BLOCKED_REJECTION_ESCALATION,
      problems: [escalationProblem],
    }, {log, frontier: pick.def.id, rungIndex});
    if (!decisionContinues(decision)) {
      return {
        terminal: decision.outcome,
        evidence: null,
        frontier: pick.def.id,
        problems: [escalationProblem],
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
  const workspaceBaseCommit = resolveWorkspaceBaseCommit(root);
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
  // Machine-checkable quality findings never earn a verifier round: the same
  // changed-path static gate the supervised paths (attempt.js, step.js) run
  // before sealing. The supervised paths see the diff before the harness; here
  // the executor produces it, so the gate runs post-harness, pre-seal — the
  // attempt is not recorded, the reroute decision is, and the working tree
  // keeps the bytes for the fix-and-rerun cycle.
  const inspectChangeRef = ctx.honestyCtx && ctx.honestyCtx.inspectChangeRef;
  if (result && result.changeRef && inspectChangeRef) {
    const changeInspection = inspectChangeRef(result.changeRef);
    const staticProblems = changeInspection && changeInspection.valid ?
      staticQualityProblems(root, changeInspection.changedPaths) : [];
    if (staticProblems.length > 0) {
      const decision = resolveGateDecision(root, quest, {
        status: CONTINUATION_BLOCKED_STATIC_QUALITY,
        code: CONTINUATION_BLOCKED_STATIC_QUALITY,
        problems: staticProblems,
      }, {log, frontier: pick.def.id, rungIndex});
      if (!decisionContinues(decision)) {
        return {
          terminal: decision.outcome,
          evidence: null,
          frontier: pick.def.id,
          problems: staticProblems,
          disposition: decision.disposition,
          nextCommand: decision.nextCommand,
        };
      }
    }
  }
  finalizeAttempt(root, quest, ctx, pick, before, {
    ...result,
    workspaceBaseCommit,
  });
  return {terminal: null};
}

// A recorded advisory is the durable authorization to bypass that classified gate for
// the current cycle. Finalization re-checks the theory gate after the harness runs, whose
// wording can differ from the begin-phase wording; without replaying the advisory by its
// narrow problem-family key, the same softened gate would become a hard integrity violation
// and the rung could never advance. Explicit overrides remain problem-specific. The last
// accepted attempt or non-measurement closes the cycle, so older advisories cannot leak.
function currentCycleAdvisoryAuthorization(log, frontierId, rungIndex) {
  let lastCycleBoundaryIndex = -1;
  for (let index = 0; index < log.length; index += 1) {
    const event = log[index];
    if ((event.type === EVENT_ATTEMPT || event.type === EVENT_NON_MEASUREMENT) &&
      event.frontier === frontierId) {
      lastCycleBoundaryIndex = index;
    }
  }
  const problemKeys = new Set();
  const overrideProblems = new Set();
  for (let index = lastCycleBoundaryIndex + 1; index < log.length; index += 1) {
    const event = log[index];
    if (event.type !== EVENT_GATE_DECISION || event.frontier !== frontierId ||
      event.rungIndex !== rungIndex || event.disposition !== DISPOSITION_ADVISORY) {
      continue;
    }
    if (event.override) {
      for (const problem of event.problems || []) overrideProblems.add(problem);
    } else {
      for (const problem of event.problems || []) {
        problemKeys.add(theoryGateProblemAuthorizationKey(problem));
      }
    }
  }
  return {problemKeys, overrideProblems};
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
  // An absent baseline is not a non-measuring run: absolving it here keeps a clean
  // first attempt out of both the integrity-violation path and the cannot-measure
  // retry budget. Every other before/after combination keeps its prior semantics.
  const baselineAbsent = baselineAbsentSample(before, after);
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
    invalidSample: baselineAbsent ?
      false :
      Boolean(before.invalidSample) || Boolean(after.invalidSample),
    baselineAbsent,
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
    // Descriptive cost of producing this attempt (dossier bytes, agent duration).
    // Namespaced so the never-gate rule stays greppable, and null for every executor
    // that does not measure — absent telemetry is never a violation, which is what
    // keeps the whole historical corpus and the dry/manual paths valid.
    telemetry: result.telemetry || null,
  };
  const honestyViolations = validateAttempt(event, ctx.honestyCtx);
  event.changeRefIdentity = changeArtifactIdentity(
    root,
    quest.id,
    event.changeRef,
  );
  event.verificationContractVersion = quest.verificationContractVersion ||
    LEGACY_VERIFICATION_CONTRACT_VERSION;
  event.workspaceBaseCommit = result.workspaceBaseCommit || null;
  if (!event.invalidSample &&
    !changeArtifactIdentityIsSealed(event.changeRefIdentity)) {
    honestyViolations.push(
      CHANGE_IDENTITY_UNSEALABLE,
    );
  }
  const advisory = currentCycleAdvisoryAuthorization(
    log,
    pick.def.id,
    rungIndex,
  );
  const gateViolations = stepTheoryGateProblems({
    log,
    state,
    frontierId: pick.def.id,
    rungIndex,
    theoryRef: event.theoryRef,
    modelRef: event.modelRef,
    modelNotApplicable: event.modelNotApplicable,
  }).filter((problem) => {
    const problemKey = theoryGateProblemAuthorizationKey(problem);
    return !advisory.problemKeys.has(problemKey) &&
      !advisory.overrideProblems.has(problem);
  });
  const violations = [...honestyViolations, ...gateViolations];
  if (honestyViolations.length > 0) {
    const declared = [...log].reverse()
      .find((item) => item.type === EVENT_QUEST_DECLARED);
    appendEvent(root, quest.id, {
      type: EVENT_VIOLATION,
      eventSchemaVersion: INTEGRITY_EVENT_SCHEMA_VERSION,
      scope: INTEGRITY_SCOPE_ATTEMPT,
      frontier: pick.def.id,
      violationId: integrityViolationId({
        quest,
        generation: declared?.ts || quest.links?.draftedAtCommit ||
          quest.links?.sealedAtCommit,
        frontier: pick.def.id,
        scope: INTEGRITY_SCOPE_ATTEMPT,
        violations: honestyViolations,
        attempt: event,
      }),
      resolutionPolicy: integrityResolutionPolicyFor({
        frontier: pick.def.id,
        replacementProbeKey: event.probeKey,
        failedEvidenceFingerprint: event.evidenceFingerprint || null,
      }),
      replacementProbeKey: event.probeKey,
      failedEvidenceFingerprint: event.evidenceFingerprint || null,
      violations: honestyViolations,
      attempt: event,
    });
  }
  if (gateViolations.length > 0) {
    appendEvent(root, quest.id, {
      type: EVENT_VIOLATION,
      scope: INTEGRITY_SCOPE_THEORY_GATE,
      frontier: pick.def.id,
      violations: gateViolations,
      attempt: event,
    });
  }
  if (violations.length > 0) {
    appendTheoryResultForAttempt(root, quest, event, false, violations);
    return {
      event,
      after,
      violations,
      progressed: false,
      accepted: false,
      nonMeasuring: false,
      oscillation: {oscillating: false},
      regressed: [],
      nodeExit: null,
    };
  }
  if (event.invalidSample) {
    const nonMeasurement = recordNonMeasurement(root, quest, pick, event);
    appendTheoryResultForAttempt(root, quest, nonMeasurement, false, []);
    return {
      event: nonMeasurement,
      after,
      violations: [],
      progressed: false,
      accepted: false,
      nonMeasuring: true,
      oscillation: {oscillating: false},
      regressed: [],
      nodeExit: null,
    };
  }
  event.integrityAccepted = true;
  event.eventSchemaVersion = INTEGRITY_EVENT_SCHEMA_VERSION;
  const replacesViolationIds = acceptedReplacementViolationIds(log, event);
  if (replacesViolationIds.length > 0) {
    event.replacesViolationIds = replacesViolationIds;
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
    const regressionViolations = regressed
      .map((label) => `previously satisfied invariant regressed: ${label}`);
    const declared = [...log].reverse()
      .find((item) => item.type === EVENT_QUEST_DECLARED);
    appendEvent(root, quest.id, {
      type: EVENT_VIOLATION,
      eventSchemaVersion: INTEGRITY_EVENT_SCHEMA_VERSION,
      scope: INTEGRITY_SCOPE_REGRESSION,
      frontier: pick.def.id,
      violationId: integrityViolationId({
        quest,
        generation: declared?.ts || quest.links?.draftedAtCommit ||
          quest.links?.sealedAtCommit,
        frontier: pick.def.id,
        scope: INTEGRITY_SCOPE_REGRESSION,
        violations: regressionViolations,
        attempt: event,
      }),
      resolutionPolicy: integrityResolutionPolicyFor({
        frontier: pick.def.id,
        replacementProbeKey: event.probeKey,
        failedEvidenceFingerprint: event.evidenceFingerprint || null,
      }),
      replacementProbeKey: event.probeKey,
      failedEvidenceFingerprint: event.evidenceFingerprint || null,
      violations: regressionViolations,
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
  const decisionViolations = regressed
    .map((label) => `previously satisfied invariant regressed: ${label}`);
  const progressed = decideAndRecord(
    root, quest, pick, event, after, decisionViolations, forceStall);
  appendTheoryResultForAttempt(
    root, quest, event, progressed, decisionViolations);
  return {
    event,
    after,
    violations: decisionViolations,
    progressed,
    accepted: true,
    nonMeasuring: false,
    oscillation,
    regressed,
    nodeExit,
  };
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
    if (e.frontier !== frontierId) continue;
    if (e.type === EVENT_NON_MEASUREMENT ||
      (e.type === EVENT_ATTEMPT && e.invalidSample === true)) {
      count += 1;
    } else if (e.type === EVENT_ATTEMPT) {
      break;
    }
  }
  return count;
}

function recordNonMeasurement(root, quest, pick, attempt) {
  const log = readLog(root, quest.id);
  const retryOrdinal = trailingNonMeasuringRun(log, attempt.frontier) + 1;
  const event = appendEvent(root, quest.id, {
    ...attempt,
    type: EVENT_NON_MEASUREMENT,
    eventSchemaVersion: INTEGRITY_EVENT_SCHEMA_VERSION,
    retryOrdinal,
  });
  if (retryOrdinal >= CANNOT_MEASURE_RETRY_BUDGET) {
    appendEvent(root, quest.id, {
      type: EVENT_PARK,
      frontier: pick.def.id,
      kind: PARK_KIND_CANNOT_MEASURE,
      reason: PARK_REASON_CANNOT_MEASURE,
      finalMetric: attempt.metricAfter,
    });
  } else {
    appendEvent(root, quest.id, {
      type: EVENT_FINDING,
      frontier: pick.def.id,
      claim: `non-measuring sample (${retryOrdinal}/${CANNOT_MEASURE_RETRY_BUDGET}): ` +
        'harness produced no trustworthy metric; holding the rung for retry rather than ' +
        'climbing toward an unearned exhausted park',
    });
  }
  return event;
}

function nonEmptyFingerprint(value) {
  return typeof value === 'string' && value.length > 0;
}

function isReceiptOnlyAttempt(event, after, violations, forceStall) {
  return !forceStall &&
    violations.length === 0 &&
    event.invalidSample !== true &&
    Number.isFinite(event.metricBefore) &&
    Number.isFinite(after.metric) &&
    after.metric === event.metricBefore &&
    nonEmptyFingerprint(event.beforeEvidenceFingerprint) &&
    nonEmptyFingerprint(event.evidenceFingerprint) &&
    event.beforeEvidenceFingerprint === event.evidenceFingerprint;
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
  const receiptOnly = !progressed &&
    isReceiptOnlyAttempt(event, after, violations, forceStall);
  const investigative = !progressed && !receiptOnly &&
    !forceStall && violations.length === 0 &&
    !event.invalidSample &&
    (event.discrimination === DISCRIMINATION_CONFIRMED ||
      event.discrimination === DISCRIMINATION_REFUTED) &&
    Boolean(event.theoryRef) &&
    !creditedTheories.has(event.theoryRef) &&
    creditedTheories.size < INVESTIGATION_BUDGET;
  const nextRung = (progressed || investigative || receiptOnly) ? event.rungIndex :
    Math.min(event.rungIndex + 1, PARK_RUNG_INDEX);
  if (receiptOnly) {
    event.attemptClassification = ATTEMPT_CLASSIFICATION_RECEIPT_ONLY;
  }
  appendEvent(root, quest.id, {
    ...event,
    rungIndex: nextRung,
    investigative: investigative || undefined,
  });
  if (terminalSampleIsAccepted(after) && violations.length === 0 &&
    !forceStall && terminalIntegrityAllowsClosure(
    root,
    quest,
    readLog(root, quest.id),
  )) {
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
  };
}

// Seal the goalposts on first declaration and reject any later goalpost drift. Shared
// so manual steps are held to the same immutability guarantee as the loop.
export function ensureSealedGoal(root, quest) {
  const declared = ensureDeclared(root, quest);
  const goalpostViolations = validateGoalpostsImmutable(
    quest, declared, questAmendments(readLog(root, quest.id)));
  if (goalpostViolations.length > 0) {
    appendEvent(root, quest.id, {
      type: EVENT_VIOLATION,
      eventSchemaVersion: INTEGRITY_EVENT_SCHEMA_VERSION,
      scope: INTEGRITY_SCOPE_GOALPOSTS,
      violationId: integrityViolationId({
        quest,
        generation: declared?.ts || quest.links?.draftedAtCommit ||
          quest.links?.sealedAtCommit,
        scope: INTEGRITY_SCOPE_GOALPOSTS,
        violations: goalpostViolations,
      }),
      resolutionPolicy: INTEGRITY_RESOLUTION_NEW_QUEST,
      violations: goalpostViolations,
    });
    throw new Error(`goalpost violation: ${goalpostViolations.join('; ')}. ` +
      'If this is a narrow, evidence-backed correction (wrong sealed class, ' +
      'doneWhen validation-command wording, verifier-demanded statement ' +
      'strengthening), record it: node scripts/solve.js amend --id ' +
      `${quest.id} --kind <kind> --evidence <ref>; otherwise park and author ` +
      'a successor quest.');
  }
  return declared;
}

export function recordQuestSolvedIfDone(root, quest, ctx, options = {}) {
  const questDone = evaluate(quest.doneWhen, ctx.probeCtx);
  if (!terminalSampleIsAccepted(questDone) || options.accepted !== true ||
    !terminalIntegrityAllowsClosure(root, quest, readLog(root, quest.id))) {
    return {done: false, evidence: questDone.evidence};
  }
  const alreadySolved = projectState(
    quest,
    readLog(root, quest.id),
  ).questStatus === STATUS_SOLVED;
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
  let prompt = kind === 'altitude' ?
    altitudeReflectionPrompt(quest, health, trigger) :
    reflectionPrompt(quest, health, trigger);
  if (kind === 'altitude') {
    // Surface standing-invariant drift into the framing step-back (default-off:
    // returns '' when the flag is off or all invariants are HELD).
    const digest = altitudeInvariantDigest(root);
    if (digest) prompt += ` ${digest}`;
  }
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
        chain: (executionHealth.signals || []).some(
          (signal) => signal.type === 'quest-chain-depth'),
      });
      if (altitudeTrigger &&
        maybeRunReflection(root, quest, ctx, executionHealth, altitudeTrigger, 'altitude')) {
        continue;
      }
      const reflectLog = readLog(root, quest.id);
      const reflectTrigger = reflectionDue(reflectLog, {
        scope: (executionHealth.signals || []).some(
          (signal) => signal.type === 'scope-pressure-terminal'),
        rejectionStreak: rejectionStreakDue(reflectLog,
          executionHealth.frontier ? candidateRejectionFingerprintsSinceApproval(
            reflectLog, executionHealth.frontier).size : 0),
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
              scope: INTEGRITY_SCOPE_THEORY_GATE,
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
// KNOWLEDGE — a fresh MEASURED attempt, a measuring ingested-evidence sample, a finding,
// a reflection, a system-theory declaration, a park, or a solve. It deliberately EXCLUDES
// receipt-only attempts, gate-decision and violation records (a hard block appends those
// every cycle), AND the per-frontier theory bookkeeping (option-declared / selected /
// theory-result) plus frontier reopens: those are churn a stuck Solver emits on every
// cycle, so counting them let pure whack-a-mole — "select theory N+1, re-run, repeat" —
// masquerade as progress at a MAX_CYCLES boundary. Knowledge (findings/reflections) and
// real state changes (fresh measured attempts, parks, solves) still count, so a productive
// session is never starved; a receipt-only or theory-churn-only session correctly stalls.
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
    } else if (event.type === EVENT_ATTEMPT &&
      event.invalidSample !== true &&
      event.attemptClassification !== ATTEMPT_CLASSIFICATION_RECEIPT_ONLY) {
      count += 1;
    } else if (event.type === EVENT_EVIDENCE_INGESTED &&
      event.invalidSample !== true && event.metric !== null) {
      count += 1;
    }
  }
  return count;
}

function resultNextAction(result, fallback, options = {}) {
  return typedNextAction(result.nextCommand || fallback, options);
}

// Keep-alive owns exactly one automatic continuation: a MAX_CYCLES boundary that
// appended durable progress. Theory, blocked, measurement, and other judgment stops
// return after one runner call with their command/action intact for the external driver.
// A MAX_CYCLES result without progress also returns immediately, preventing blind
// restarts from turning one unchanged stop into repeated gate noise.
export function runSupervised(root, quest, options = {}) {
  const maxRestarts = Number.isInteger(options.maxRestarts) ?
    options.maxRestarts : SUPERVISOR_MAX_RESTARTS;
  const onRestart = typeof options.onRestart === 'function' ? options.onRestart : null;
  // The runner is injectable so the supervisor's decision policy can be unit-tested in
  // isolation; production always uses the real runLoop.
  const runner = typeof options.runner === 'function' ? options.runner : runLoop;

  let restarts = 0;
  let lastProgress = durableProgressCount(readLog(root, quest.id));
  let result = runner(root, quest, options);

  for (;;) {
    if (result.outcome === STATUS_SOLVED || result.outcome === STATUS_EXHAUSTED) {
      return {
        ...result,
        nextAction: resultNextAction(result, result.outcome, {terminal: true}),
        supervisor: {restarts, stop: result.outcome},
      };
    }
    // A measurement gate means the apparatus, not the system, is broken. Re-running the same
    // loop cannot produce a measurement, so step back and surface the harness repair.
    if (result.disposition === DISPOSITION_PARK_RESUMABLE) {
      return {
        ...result,
        outcome: OUTCOME_SUPERVISOR_PAUSED_MEASUREMENT,
        nextAction: resultNextAction(
          result,
          LOCAL_STR_OWNED_001,
        ),
        supervisor: {restarts, stop: 'measurement', innerOutcome: result.outcome},
      };
    }
    if (result.outcome !== OUTCOME_MAX_CYCLES) {
      return {
        ...result,
        nextAction: resultNextAction(
          result,
          LOCAL_STR_OWNED_002,
        ),
        supervisor: {restarts, stop: LOCAL_STR_OWNED_003, innerOutcome: result.outcome},
      };
    }
    const progress = durableProgressCount(readLog(root, quest.id));
    if (progress <= lastProgress) {
      return {
        ...result,
        nextAction: resultNextAction(
          result,
          LOCAL_STR_OWNED_004,
        ),
        supervisor: {restarts, stop: LOCAL_STR_OWNED_005, innerOutcome: result.outcome},
      };
    }
    if (restarts >= maxRestarts) {
      return {
        ...result,
        outcome: OUTCOME_SUPERVISOR_BUDGET,
        nextAction: resultNextAction(
          result,
          LOCAL_STR_OWNED_006,
        ),
        supervisor: {restarts, stop: 'budget', innerOutcome: result.outcome},
      };
    }
    lastProgress = progress;
    restarts += 1;
    if (onRestart) onRestart({restarts, innerOutcome: result.outcome, progress});
    result = runner(root, quest, options);
  }
}
