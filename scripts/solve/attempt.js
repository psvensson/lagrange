import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

import {loadQuest, projectState, readLog} from './store.js';
import {evaluate} from './probe.js';
import {ensureSealedGoal, makeRunContext, finalizeAttempt} from './loop.js';
import {ingestEvidence} from './evidence.js';
import {stepTheoryGateProblems} from './theory.js';
import {inspectChangeArtifact} from './change-artifact.js';
import {
  analyzeScopePressure,
  analyzeScopePressureCandidate,
} from './scope-pressure.js';
import {scopeTerminalStatus} from './convergence-guards.js';
import {analyzeQuestHealth} from './health.js';
import {
  CONTINUATION_BLOCKED_REJECTION_ESCALATION,
  CONTINUATION_BLOCKED_SCOPE,
  CONTINUATION_BLOCKED_STATIC_QUALITY,
  continuationIsAllowed,
} from './continuation.js';
import {
  resolveGateDecision,
  gateDecisionToStepResult,
  theoryGateContinuation,
  decisionContinues,
  candidateRejectionFingerprintsSinceApproval,
} from './gate.js';
import {staticQualityProblems} from './static-gate.js';
import {
  REJECTION_ESCALATION_GUIDANCE,
  REJECTION_ESCALATION_LIMIT,
} from './constants.js';
import {
  resolveWorkspaceBaseCommit,
} from './verification.js';
import {canonicalSourceArtifactProblem} from './canonical-source-artifact.js';

const SCOPE_PRESSURE_BLOCKED_PREFIX =
  'scope-pressure precommit blocked: split into bounded Quest declarations ';

export function runAttemptCommand(root, args) {
  const questId = args.id;
  if (!questId) throw new Error('attempt: --id <questId> is required');
  const frontierId = args.frontier;
  if (!frontierId) throw new Error('attempt: --frontier <frontierId> is required');
  const name = args.name;
  const changeRef = args.changeRef;
  if (!changeRef) throw new Error('attempt: --changeRef diff:<path> is required');
  const summary = args.summary || '';

  const harnessCommand = args._;
  if (!harnessCommand || harnessCommand.length === 0) {
    throw new Error('attempt: harness command is required after "--"');
  }

  const quest = loadQuest(root, questId);
  ensureSealedGoal(root, quest);
  const log = readLog(root, questId);
  const state = projectState(quest, log);
  const def = quest.frontiers.find((f) => f.id === frontierId);
  const fState = state.frontiers.find((f) => f.id === frontierId);
  if (!def || !fState) throw new Error(`frontier ${frontierId} not found`);

  // Check theory gate problems before we run the harness
  const readinessProblems = stepTheoryGateProblems({
    log,
    state,
    frontierId,
    rungIndex: fState.rungIndex,
    theoryRef: args.theoryRef || null,
    modelRef: args.modelRef || null,
    modelNotApplicable: args.modelNotApplicable || null,
    scopeTerminal: scopeTerminalStatus(
      analyzeScopePressure(root, quest, log)).terminal,
    phase: 'begin',
  });
  if (readinessProblems.length > 0) {
    const decision = resolveGateDecision(
      root,
      quest,
      theoryGateContinuation(readinessProblems),
      {log, frontier: frontierId, rungIndex: fState.rungIndex},
    );
    // Soft-first: an advisory downgrade proceeds to run the harness this attempt.
    if (!decisionContinues(decision)) {
      return {...gateDecisionToStepResult(decision), blocked: true};
    }
  }
  // Rejection escalation: after REJECTION_ESCALATION_LIMIT distinct rejected
  // candidates on this frontier with no intervening approval, iterating under
  // the same unsealed bar is the measured losing move — reframe instead.
  // Overridable (recorded reason), and decompose-rejection or a successor
  // quest both remain available, so this can never deadlock a discharge.
  const rejectedFingerprints =
    candidateRejectionFingerprintsSinceApproval(log, frontierId);
  if (rejectedFingerprints.size >= REJECTION_ESCALATION_LIMIT) {
    const escalationProblem =
      `candidate rejection escalation: ${rejectedFingerprints.size} distinct ` +
      `rejected candidates on ${frontierId} with no intervening approval; ` +
      REJECTION_ESCALATION_GUIDANCE;
    const decision = resolveGateDecision(root, quest, {
      status: CONTINUATION_BLOCKED_REJECTION_ESCALATION,
      code: CONTINUATION_BLOCKED_REJECTION_ESCALATION,
      problems: [escalationProblem],
    }, {
      log,
      frontier: frontierId,
      rungIndex: fState.rungIndex,
    });
    if (!decisionContinues(decision)) {
      return {...gateDecisionToStepResult(decision), blocked: true};
    }
  }
  const health = analyzeQuestHealth(root, quest, {
    state,
    continuationOptions: {
      requireModelEvidence: !args.modelRef && !args.modelNotApplicable,
    },
  });
  // Exact scope is measurable only after the command produces its artifact.
  // Do not duplicate that admission against historical aggregate pressure.
  if (!continuationIsAllowed(health.continuation) &&
    health.continuation.code !== CONTINUATION_BLOCKED_SCOPE) {
    const decision = resolveGateDecision(root, quest, health.continuation, {
      log,
      frontier: frontierId,
      rungIndex: fState.rungIndex,
    });
    if (!decisionContinues(decision)) {
      return {...gateDecisionToStepResult(decision), blocked: true};
    }
  }

  const ctx = makeRunContext({
    changeRef,
    summary,
    theoryRef: args.theoryRef || null,
    expectedMovement: args.expectedMovement || null,
    negativeResultMeans: args.negativeResultMeans || null,
    modelRef: args.modelRef || null,
    modelNotApplicable: args.modelNotApplicable || null,
  });
  ctx.probeCtx = {...ctx.probeCtx, root};
  ctx.honestyCtx.changeRefResolves =
    ctx.honestyCtx.changeRefResolves ||
    ((ref) => inspectChangeArtifact(root, quest, ref).valid);
  ctx.honestyCtx.inspectChangeRef =
    ctx.honestyCtx.inspectChangeRef ||
    ((ref) => inspectChangeArtifact(root, quest, ref));
  const changeInspection = ctx.honestyCtx.inspectChangeRef(changeRef);
  if (!changeInspection.valid) {
    throw new Error(
      `invalid changeRef: ${changeInspection.problems.join('; ')}`,
    );
  }
  const workspaceBaseCommit = resolveWorkspaceBaseCommit(root);
  const canonicalProblem = canonicalSourceArtifactProblem(
    root,
    workspaceBaseCommit,
    changeInspection,
  );
  if (canonicalProblem) throw new Error(canonicalProblem);
  // Machine-checkable quality findings never earn a verifier round: run the
  // changed-path lint and literal-guideline checkers before this attempt
  // seals its artifact.
  const staticProblems = staticQualityProblems(
    root, changeInspection.changedPaths);
  if (staticProblems.length > 0) {
    const decision = resolveGateDecision(root, quest, {
      status: CONTINUATION_BLOCKED_STATIC_QUALITY,
      code: CONTINUATION_BLOCKED_STATIC_QUALITY,
      problems: staticProblems,
    }, {
      log,
      frontier: frontierId,
      rungIndex: fState.rungIndex,
    });
    if (!decisionContinues(decision)) {
      return {...gateDecisionToStepResult(decision), blocked: true};
    }
  }
  const scopeAdmission = scopeTerminalStatus(analyzeScopePressureCandidate(
    root,
    quest,
    log,
    changeInspection,
    {workspaceBaseCommit},
  ));
  if (scopeAdmission.terminal) {
    const scopeProblem = SCOPE_PRESSURE_BLOCKED_PREFIX +
      `(files=${scopeAdmission.fileCount}, owners=${scopeAdmission.ownerCount}, ` +
      `bytes=${scopeAdmission.changeBytes})`;
    const decision = resolveGateDecision(root, quest, {
      status: CONTINUATION_BLOCKED_SCOPE,
      code: CONTINUATION_BLOCKED_SCOPE,
      problems: [scopeProblem],
    }, {
      log,
      frontier: frontierId,
      rungIndex: fState.rungIndex,
    });
    if (!decisionContinues(decision)) throw new Error(scopeProblem);
  }

  // 1. Measure before
  const before = evaluate(def.metric, ctx.probeCtx);

  // 2. Run harness command
  console.log(`Running harness command: ${harnessCommand.join(' ')}`);
  const harnessStartedAtMs = Date.now();
  const spawnResult = spawnSync(harnessCommand[0], harnessCommand.slice(1), {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (spawnResult.error) {
    throw new Error(`Failed to start harness command: ${spawnResult.error.message}`);
  }

  // 3. Locate new report file by evaluating metric after execution
  const after = evaluate(def.metric, ctx.probeCtx);
  const evidencePath = after.evidence;
  if (!evidencePath || !fs.existsSync(evidencePath)) {
    throw new Error('No evidence report found after running harness command');
  }

  // 4. Record normal attempt
  const pick = {def, state: fState};
  const attemptResult = {
    changeRef,
    summary: summary || name || 'attempt wrapper execution',
    theoryRef: args.theoryRef || null,
    expectedMovement: args.expectedMovement || null,
    negativeResultMeans: args.negativeResultMeans || null,
    modelRef: args.modelRef || null,
    modelNotApplicable: args.modelNotApplicable || null,
    workspaceBaseCommit,
    telemetry: {
      recordedVia: 'attempt',
      agentDurationMs: Math.max(0, Date.now() - harnessStartedAtMs),
      durationBasis: 'harness-command',
      changeBytes: Buffer.byteLength(String(changeInspection.content || ''), 'utf8'),
      changedPathCount: (changeInspection.changedPaths || []).length,
    },
  };
  const outcome = finalizeAttempt(root, quest, ctx, pick, before, attemptResult);

  // 5. Ingest evidence automatically
  console.log(`Automatically ingesting evidence report: ${evidencePath}`);
  ingestEvidence(root, {
    questId,
    frontierId,
    evidencePath,
  });

  return {
    before: before.metric,
    after: outcome.after.metric,
    done: outcome.after.done,
    progressed: outcome.progressed,
    violations: outcome.violations,
  };
}
