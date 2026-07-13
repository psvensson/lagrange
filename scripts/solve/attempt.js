import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

import {loadQuest, projectState, readLog} from './store.js';
import {evaluate} from './probe.js';
import {ensureSealedGoal, makeRunContext, finalizeAttempt} from './loop.js';
import {ingestEvidence} from './evidence.js';
import {stepTheoryGateProblems} from './theory.js';
import {inspectChangeArtifact} from './change-artifact.js';
import {analyzeScopePressure} from './scope-pressure.js';
import {scopeTerminalStatus} from './convergence-guards.js';
import {analyzeQuestHealth} from './health.js';
import {continuationIsAllowed} from './continuation.js';
import {
  resolveGateDecision,
  gateDecisionToStepResult,
  theoryGateContinuation,
  decisionContinues,
} from './gate.js';
import {resolveWorkspaceBaseCommit} from './verification.js';

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
  const health = analyzeQuestHealth(root, quest, {
    state,
    continuationOptions: {
      requireModelEvidence: !args.modelRef && !args.modelNotApplicable,
    },
  });
  if (!continuationIsAllowed(health.continuation)) {
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

  // 1. Measure before
  const before = evaluate(def.metric, ctx.probeCtx);
  const workspaceBaseCommit = resolveWorkspaceBaseCommit(root);

  // 2. Run harness command
  console.log(`Running harness command: ${harnessCommand.join(' ')}`);
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
