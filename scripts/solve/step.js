// Manual supervised step flow.
//
// `step --id <quest>` pins the before metric from live evidence and writes a
// pending attempt. `step --id <quest> --changeRef diff:<patch>` commits that pending
// attempt after the operator has changed code and refreshed evidence. Command-running
// attempts should use `solve attempt`, which measures before/after around the command
// in one process.

import {
  makeRunContext,
  ensureSealedGoal,
  finalizeAttempt,
  recordQuestSolvedIfDone,
} from './loop.js';
import {
  boundVerifierRejectionEvents,
  introducedScopePaths,
  projectState,
  readLog,
  scopeSignatureHasAuthorization,
} from './store.js';
import {evaluate} from './probe.js';
import {pickFrontier} from './scheduler.js';
import {resolveAttemptTheoryRef, stepTheoryGateProblems} from './theory.js';
import {engagementWitnessAdvisory} from './engagement-witness.js';
import {detectUnrecordedEvidence} from './evidence-detection.js';
import {ingestEvidence} from './evidence.js';
import {
  REJECTION_ESCALATION_GUIDANCE,
  REJECTION_ESCALATION_LIMIT,
  STATUS_SOLVED,
} from './constants.js';
import {
  inspectChangeArtifact,
  inspectCommitChangeRefAdmission,
  requiresSourceVerification,
} from './change-artifact.js';
import {
  cleanupWrittenChangeArtifact,
} from './content-addressed-change-artifact.js';
import {suggestVerificationTemplates} from './verification-template-suggest.js';
import {analyzeQuestHealth} from './health.js';
import {analyzeScopePressureCandidate} from './scope-pressure.js';
import {scopeTerminalStatus} from './convergence-guards.js';
import {
  resolveGateDecision,
  gateDecisionToStepResult,
  theoryGateContinuation,
  decisionContinues,
  candidateRejectionFingerprintsSinceApproval,
  createRunAuthorizations,
} from './gate.js';
import {staticQualityProblems} from './static-gate.js';
import {
  CONTINUATION_BLOCKED_REJECTION_ESCALATION,
  CONTINUATION_BLOCKED_SCOPE,
  CONTINUATION_BLOCKED_STATIC_QUALITY,
  unrecordedEvidenceContinuation,
} from './continuation.js';
import {
  activeSourceEpoch,
  resolveWorkspaceBaseCommit,
  sourceEpochDriftProblem,
  sourceEpochCommittedDriftPaths,
} from './verification.js';
import {canonicalSourceArtifactProblem} from './canonical-source-artifact.js';
import {createAutoDiffChangeRef} from './auto-diff.js';
import {
  clearPending,
  loadPending,
  pendingStepBaseCommit,
  resolveStepBaseCommit,
  savePending,
} from './pending-step.js';

const STATIC_PROBLEM_SEPARATOR = '\n';
const SCOPE_PRESSURE_BLOCKED_PREFIX =
  'scope-pressure precommit blocked: split into bounded Quest declarations ';

function assertSourceEpochIntact(root, quest, log, extraPaths = []) {
  const epoch = activeSourceEpoch(root, quest, log);
  const drift = sourceEpochCommittedDriftPaths(root, epoch, extraPaths);
  if (drift.length > 0) {
    throw new Error(sourceEpochDriftProblem(drift));
  }
}

function configureContext(root, quest, options = {}) {
  const ctx = makeRunContext(options);
  ctx.probeCtx = {...ctx.probeCtx, root};
  ctx.honestyCtx.changeRefResolves =
    ctx.honestyCtx.changeRefResolves ||
    ((ref) => inspectChangeArtifact(root, quest, ref).valid);
  ctx.honestyCtx.inspectChangeRef =
    ctx.honestyCtx.inspectChangeRef ||
    ((ref) => inspectChangeArtifact(root, quest, ref));
  return ctx;
}

function theoryGateResult(root, quest, log, problems, pick, runAuthorizations = null) {
  const continuation = theoryGateContinuation(problems);
  const decision = resolveGateDecision(root, quest, continuation, {
    log,
    frontier: pick.def.id,
    rungIndex: pick.state.rungIndex,
    runAuthorizations,
  });
  return decisionContinues(decision) ? null : gateDecisionToStepResult(decision);
}

export function stepPending(root, questId) {
  return loadPending(root, questId);
}

export function stepAbort(root, questId) {
  const hadPending = Boolean(loadPending(root, questId));
  clearPending(root, questId);
  return hadPending;
}

// Auto-ingest fresh frontier evidence. The detector already resolves the
// exact report path, so blocking the step only to have the operator retype
// the printed ingest command was a pure round-trip (10 occurrences in the
// 2026-07-25..27 window, each re-hit in an identical pair seconds apart).
// Ingesting here is not a silent record: it appends the same evidence and
// theory-result events the printed command did, and a done:false doneWhen
// ingest still reopens a solved quest. The gate remains the fallback when the
// ingest itself refuses (unreadable report, identity mismatch) and when the
// bound exhausts with detection still firing (e.g. the report is being
// rewritten under us) — the step must never proceed past evidence it could
// not record. Bounded by the quest's own frontier-spec count.
function autoIngestFrontierEvidence(root, quest, log, state) {
  const maxAutoIngests = quest.frontiers.length;
  for (let round = 0; round <= maxAutoIngests; round += 1) {
    const unrecorded = detectUnrecordedEvidence(root, quest.id, {
      requiresMeasuredHistory: true,
      kind: 'frontier',
    });
    if (!unrecorded) break;
    if (round === maxAutoIngests) {
      return {log, state, decision: resolveGateDecision(
        root,
        quest,
        unrecordedEvidenceContinuation(unrecorded),
        {log, frontier: unrecorded.frontier},
      )};
    }
    try {
      ingestEvidence(root, {
        questId: quest.id,
        frontierId: unrecorded.frontier,
        evidencePath: unrecorded.evidence,
        probeScope: unrecorded.probeScope,
      });
      process.stdout.write(
        `auto-ingested fresh evidence: ${unrecorded.evidence} ` +
        `[${unrecorded.frontier}]\n`);
      log = readLog(root, quest.id);
      state = projectState(quest, log);
    } catch (err) {
      process.stderr.write(
        `auto-ingest refused for ${unrecorded.evidence}: ${err.message}\n`);
      return {log, state, decision: resolveGateDecision(
        root,
        quest,
        unrecordedEvidenceContinuation(unrecorded),
        {log, frontier: unrecorded.frontier},
      )};
    }
  }
  return {log, state, decision: null};
}

function stepBegin(root, quest, options = {}) {
  const ctx = configureContext(root, quest, options);
  ensureSealedGoal(root, quest);
  if (loadPending(root, quest.id)) {
    if (options.force) {
      clearPending(root, quest.id);
    } else {
      throw new Error(
        'a step is already pending; commit it, abort it, or pass --force',
      );
    }
  }

  let log = readLog(root, quest.id);
  let state = projectState(quest, log);
  if (state.questStatus === STATUS_SOLVED) {
    return {terminal: 'solved', evidence: state.questEvidence};
  }

  const ingested = autoIngestFrontierEvidence(root, quest, log, state);
  if (ingested.decision) return gateDecisionToStepResult(ingested.decision);
  ({log, state} = ingested);
  if (state.questStatus === STATUS_SOLVED) {
    return {terminal: 'solved', evidence: state.questEvidence};
  }

  // Recovered-reopen re-close: a stale done=false doneWhen ingestion holds the
  // quest open even after fresh green runs satisfy the sealed doneWhen (the
  // projection only re-closes on a quest-type event, never on done=true
  // evidence). The change-gated commit path cannot re-close when the work is
  // already done and the tree is clean (auto-diff is empty), so evaluate the
  // live doneWhen here and close through the same accepted-integrity gate the
  // commit path uses. No-op unless the quest is genuinely done.
  //
  // A bound verifier rejection is a different reopen: it demands a corrective
  // attempt (the verifier ruled the recorded candidate insufficient), so the
  // begin-step must proceed to pin that attempt rather than re-close. Only a
  // stale done=false EVIDENCE reopen with already-green live doneWhen re-closes.
  if (boundVerifierRejectionEvents(log).size === 0) {
    const recovered = recordQuestSolvedIfDone(root, quest, ctx, {accepted: true});
    if (recovered.done) {
      state = projectState(quest, readLog(root, quest.id));
      return {terminal: STATUS_SOLVED, evidence: state.questEvidence};
    }
  }

  const pick = pickFrontier(quest, state, ctx.scoreFn);
  if (!pick) return {terminal: 'exhausted'};

  const health = analyzeQuestHealth(root, quest, {state});
  // Scope admission belongs to commit, where the exact candidate exists. A
  // historical scope signal at begin time would duplicate that gate and consume
  // an override before it can authorize the candidate it was recorded for.
  const gateDecision = health.continuation.code === CONTINUATION_BLOCKED_SCOPE ?
    null : resolveGateDecision(root, quest, health.continuation, {
      log,
      frontier: pick.def.id,
      rungIndex: pick.state.rungIndex,
    });
  if (gateDecision && !decisionContinues(gateDecision)) {
    return gateDecisionToStepResult(gateDecision);
  }

  const before = evaluate(pick.def.metric, ctx.probeCtx);
  assertSourceEpochIntact(root, quest, log);
  const headCommit = resolveWorkspaceBaseCommit(root);
  const pending = {
    frontier: pick.def.id,
    rungIndex: pick.state.rungIndex,
    beganAt: new Date().toISOString(),
    headCommit,
    sourceBaseCommit: resolveStepBaseCommit(root, quest, log, pick.def.id),
    // The persisted before-sample must carry invalidSample. Dropping it made
    // stepCommit reconstruct `metricBefore: null` with `invalidSample: false`,
    // which is exactly the state checkMetricEvidence rejects — so an honest first
    // attempt against a scenario with no prior run manufactured its own
    // attempt-integrity violation and forced a re-measure of unchanged work.
    before: {
      metric: before.metric,
      done: before.done,
      evidence: before.evidence,
      evidenceIdentity: before.evidenceIdentity || null,
      evidenceFingerprint: before.evidenceFingerprint || null,
      invalidSample: Boolean(before.invalidSample),
    },
  };
  return {
    terminal: null,
    frontier: pick.def.id,
    rungIndex: pick.state.rungIndex,
    before,
    pendingFile: savePending(root, quest.id, pending),
  };
}

function stepCommit(root, quest, options = {}) {
  const pending = loadPending(root, quest.id);
  if (!pending) {
    throw new Error(
      'no pending step; use `solve attempt -- ...` for atomic command execution ' +
      'or run `solve step --id <quest>` before manual work',
    );
  }
  const autoDiffWrite = options.changeRef ?
    null :
    createAutoDiffChangeRef(root, quest, pendingStepBaseCommit(pending) || 'HEAD');
  const autoDiffRef = autoDiffWrite?.changeRef || null;
  const changeRef = options.changeRef || autoDiffRef;
  // A rejected commit (invalid changeRef, missing frontier, or a theory-gate
  // stop) records no attempt, so a generated auto-diff artifact must not
  // survive it: an orphan attempt-<n>.diff would accumulate and skip numbers.
  let attemptRecorded = false;
  try {
    const result = commitPendingAttempt(root, quest, pending, changeRef, options);
    attemptRecorded = !result.terminal;
    return result;
  } finally {
    const recordedAfterCommitFailure = autoDiffRef && readLog(root, quest.id)
      .some((event) => event.type === 'attempt' &&
        event.changeRef === autoDiffRef);
    if (autoDiffRef && !attemptRecorded && !recordedAfterCommitFailure) {
      cleanupWrittenChangeArtifact(autoDiffWrite);
    }
  }
}

// Descriptive attempt cost for the operator-driven step path. `agentDurationMs`
// keeps the executor path's key so meta-friction's wasted column reads both;
// here it measures begin-to-commit wall time, which `durationBasis` makes
// explicit. Telemetry never gates and never enters integrityViolationId.
function stepTelemetry(pending, changeInspection) {
  const beganAtMs = pending.beganAt ? Date.parse(pending.beganAt) : NaN;
  return {
    recordedVia: 'step',
    agentDurationMs: Number.isFinite(beganAtMs) ?
      Math.max(0, Date.now() - beganAtMs) : null,
    durationBasis: 'step-begin-to-commit',
    changeBytes: Buffer.byteLength(String(changeInspection.content || ''), 'utf8'),
    changedPathCount: (changeInspection.changedPaths || []).length,
  };
}

function assertScopeAdmission(
  root,
  quest,
  log,
  pending,
  changeInspection,
  sourceBaseCommit,
  runAuthorizations = null,
) {
  const scopePressure = analyzeScopePressureCandidate(
    root, quest, log, changeInspection, {
      workspaceBaseCommit: sourceBaseCommit || null,
      introducedPaths: introducedScopePaths(
        log,
        pending.frontier,
        CONTINUATION_BLOCKED_SCOPE,
        (changeInspection.changedPaths || []).filter((filePath) =>
          requiresSourceVerification(filePath)),
      ),
    });
  const scopeAdmission = scopeTerminalStatus(scopePressure);
  if (!scopeAdmission.terminal) return;
  const scopeProblem = SCOPE_PRESSURE_BLOCKED_PREFIX +
    `(files=${scopeAdmission.fileCount}, owners=${scopeAdmission.ownerCount}, ` +
    `bytes=${scopeAdmission.changeBytes})`;
  const admittedScopePaths = scopePressure.admission?.changedPaths ||
    scopePressure.changedPaths;
  if (scopeSignatureHasAuthorization(
    log,
    pending.frontier,
    CONTINUATION_BLOCKED_SCOPE,
    admittedScopePaths,
  )) {
    return;
  }
  savePending(root, quest.id, {
    ...pending,
    scopeCandidate: admittedScopePaths,
    scopeSplitPlan: scopePressure.splitPlan || [],
  });
  const decision = resolveGateDecision(root, quest, {
    status: CONTINUATION_BLOCKED_SCOPE,
    code: CONTINUATION_BLOCKED_SCOPE,
    problems: [scopeProblem],
  }, {
    log,
    frontier: pending.frontier,
    rungIndex: pending.rungIndex,
    scopeSignature: admittedScopePaths,
    runAuthorizations,
  });
  if (!decisionContinues(decision)) {
    const error = new Error(scopeProblem);
    error.scopePaths = scopePressure.introducedPaths;
    error.scopeSplitPlan = scopePressure.splitPlan || [];
    throw error;
  }
}

function commitPendingAttempt(root, quest, pending, changeRef, options = {}) {
  const ctx = configureContext(root, quest, options);
  ensureSealedGoal(root, quest);
  // One recorded override authorizes this whole supervised commit (C4): every
  // admission gate below shares this map.
  const runAuthorizations = createRunAuthorizations();
  const changeInspection = ctx.honestyCtx.inspectChangeRef(changeRef);
  if (!changeInspection.valid) {
    throw new Error(
      `invalid changeRef: ${changeInspection.problems.join('; ')}`,
    );
  }

  const log = readLog(root, quest.id);
  assertSourceEpochIntact(
    root,
    quest,
    log,
    changeInspection.changedPaths.filter(requiresSourceVerification),
  );

  const sourceBaseCommit = pendingStepBaseCommit(pending);

  const canonicalProblem = canonicalSourceArtifactProblem(
    root,
    sourceBaseCommit,
    changeInspection,
  );
  if (canonicalProblem) throw new Error(canonicalProblem);

  const admission = inspectCommitChangeRefAdmission(
    root, changeRef, changeInspection, {questId: quest.id});
  if (!admission.ok) throw new Error(admission.problem);

  assertScopeAdmission(
    root, quest, log, pending, changeInspection, sourceBaseCommit,
    runAuthorizations);
  // Same admission pair as the attempt wrapper (see attempt.js): repeated
  // failed rejection rounds gate toward reframing, and machine-checkable
  // lint/guideline findings never earn a verifier round. Both are
  // recorded-reason overridable.
  const rejectedFingerprints =
    candidateRejectionFingerprintsSinceApproval(log, pending.frontier);
  if (rejectedFingerprints.size >= REJECTION_ESCALATION_LIMIT) {
    const escalationProblem =
      `candidate rejection escalation: ${rejectedFingerprints.size} distinct ` +
      `rejected candidates on ${pending.frontier} with no intervening approval; ` +
      REJECTION_ESCALATION_GUIDANCE;
    const decision = resolveGateDecision(root, quest, {
      status: CONTINUATION_BLOCKED_REJECTION_ESCALATION,
      code: CONTINUATION_BLOCKED_REJECTION_ESCALATION,
      problems: [escalationProblem],
    }, {
      log,
      frontier: pending.frontier,
      rungIndex: pending.rungIndex,
      runAuthorizations,
    });
    if (!decisionContinues(decision)) throw new Error(escalationProblem);
  }
  const staticProblems = staticQualityProblems(
    root, changeInspection.changedPaths);
  if (staticProblems.length > 0) {
    const decision = resolveGateDecision(root, quest, {
      status: CONTINUATION_BLOCKED_STATIC_QUALITY,
      code: CONTINUATION_BLOCKED_STATIC_QUALITY,
      problems: staticProblems,
    }, {
      log,
      frontier: pending.frontier,
      rungIndex: pending.rungIndex,
      runAuthorizations,
    });
    if (!decisionContinues(decision)) {
      throw new Error(staticProblems.join(STATIC_PROBLEM_SEPARATOR));
    }
  }
  const state = projectState(quest, log);
  const def = quest.frontiers.find((frontier) => frontier.id === pending.frontier);
  const frontierState = state.frontiers.find((frontier) =>
    frontier.id === pending.frontier);
  if (!def || !frontierState) {
    throw new Error(`pending frontier ${pending.frontier} not found`);
  }
  frontierState.rungIndex = pending.rungIndex;
  const pick = {def, state: frontierState};
  const readinessProblems = stepTheoryGateProblems({
    log,
    state,
    frontierId: def.id,
    rungIndex: pending.rungIndex,
    theoryRef: options.theoryRef,
    modelRef: options.modelRef,
    modelNotApplicable: options.modelNotApplicable,
    phase: 'commit',
  });
  const gateResult = theoryGateResult(
    root, quest, log, readinessProblems, pick, runAuthorizations);
  if (gateResult) return gateResult;

  // Advisory only (never blocks): a source-changing commit under an effective
  // theory should carry a precondition/engagement witness finding, per the
  // steering rule this projects. Computed against the pre-commit log so the
  // witness window ends at this attempt.
  const engagementWitness = engagementWitnessAdvisory({
    log,
    frontierId: def.id,
    changedPaths: changeInspection.changedPaths || [],
    theoryRef: resolveAttemptTheoryRef(state, def.id, options.theoryRef),
  });

  const outcome = finalizeAttempt(root, quest, ctx, pick, pending.before, {
    changeRef,
    summary: options.summary || null,
    theoryRef: options.theoryRef || null,
    expectedMovement: options.expectedMovement || null,
    negativeResultMeans: options.negativeResultMeans || null,
    modelRef: options.modelRef || null,
    modelNotApplicable: options.modelNotApplicable || null,
    discrimination: options.discrimination || null,
    workspaceBaseCommit: sourceBaseCommit || null,
    telemetry: stepTelemetry(pending, changeInspection),
  });
  const questOutcome = recordQuestSolvedIfDone(root, quest, ctx, {
    accepted: outcome.accepted === true,
  });
  clearPending(root, quest.id);
  // Attempt recording never commits. The verifier first approves the exact
  // fingerprint, then the operator invokes `solve checkpoint`; terminal handoff
  // remains a separate full-audit action.
  const commit = {committed: false, skipped: outcome.nonMeasuring ?
    'non-measuring-sample' : (outcome.accepted === true ?
      'explicit-checkpoint-required' : 'attempt-violations')};
  return {
    frontier: def.id,
    before: pending.before.metric,
    after: outcome.after.metric,
    done: questOutcome.done,
    progressed: outcome.progressed,
    violations: outcome.violations,
    changeRef,
    verificationTemplates: suggestChangeVerificationTemplates(
      root, changeInspection),
    engagementWitness,
    commit,
  };
}

// Surface the matching adversarial-verification template(s) alongside the
// subagent-verification requirement this commit path enforces (see the
// source-change-subagent-verification constraint + audit's commit gate).
// Advisory only — a suggestion failure must never fail the recorded attempt.
function suggestChangeVerificationTemplates(root, changeInspection) {
  try {
    return suggestVerificationTemplates(root, changeInspection.content || '');
  } catch {
    return [];
  }
}

export function runStep(root, quest, options = {}) {
  if (!options.changeRef && !options.autoDiff) {
    return stepBegin(root, quest, options);
  }
  return stepCommit(root, quest, options);
}
