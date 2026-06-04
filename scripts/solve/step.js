// Manual supervised step flow.
//
// `step --id <quest>` pins the before metric from live evidence and writes a
// pending attempt. `step --id <quest> --changeRef diff:<patch>` commits that pending
// attempt after the operator has changed code and refreshed evidence. Command-running
// attempts should use `solve attempt`, which measures before/after around the command
// in one process.

import fs from 'node:fs';
import path from 'node:path';

import {
  makeRunContext,
  ensureSealedGoal,
  finalizeAttempt,
  recordQuestSolvedIfDone,
} from './loop.js';
import {readLog, projectState, assertSafeQuestId} from './store.js';
import {evaluate} from './probe.js';
import {pickFrontier} from './scheduler.js';
import {stepTheoryGateProblems} from './theory.js';
import {detectUnrecordedEvidence} from './evidence.js';
import {
  SOLVE_DATA_DIR,
  STATE_SUBDIR,
  STATUS_SOLVED,
} from './constants.js';
import {inspectChangeArtifact} from './change-artifact.js';
import {autoCommitQuest} from './handoff.js';
import {writeReport} from './report.js';
import {analyzeQuestHealth} from './health.js';
import {
  CONTINUATION_BLOCKED_THEORY,
  continuationErrorMessage,
  continuationIsAllowed,
} from './continuation.js';

export function pendingFilePath(root, questId) {
  return path.join(
    root,
    SOLVE_DATA_DIR,
    STATE_SUBDIR,
    `${assertSafeQuestId(questId)}.pending.json`,
  );
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

function loadPending(root, questId) {
  const file = pendingFilePath(root, questId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function savePending(root, questId, pending) {
  const file = pendingFilePath(root, questId);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(pending, null, 2)}\n`);
  return file;
}

function clearPending(root, questId) {
  const file = pendingFilePath(root, questId);
  if (fs.existsSync(file)) fs.rmSync(file);
}

function theoryGateResult(problems, pick) {
  if (problems.length === 0) return null;
  if (problems.some((item) =>
    item.includes('theory required') ||
    item.includes('frontier theory required') ||
    item.includes('system theory required') ||
    item.includes('fresh frontier theory') ||
    item.includes('fresh theory selection required') ||
    item.includes('theory result required') ||
    item.includes('theory result update required'))) {
    return {
      terminal: 'theory-required',
      frontier: pick.def.id,
      rungIndex: pick.state.rungIndex,
      problems,
    };
  }
  throw new Error(`theory gate failed: ${problems.join('; ')}`);
}

export function stepPending(root, questId) {
  return loadPending(root, questId);
}

export function stepAbort(root, questId) {
  const hadPending = Boolean(loadPending(root, questId));
  clearPending(root, questId);
  return hadPending;
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

  const state = projectState(quest, readLog(root, quest.id));
  if (state.questStatus === STATUS_SOLVED) {
    return {terminal: 'solved', evidence: state.questEvidence};
  }

  const unrecorded = detectUnrecordedEvidence(root, quest.id, {
    requiresMeasuredHistory: true,
    kind: 'frontier',
  });
  if (unrecorded) {
    throw new Error(
      'UNRECORDED_EVIDENCE: latest probe evidence is newer than Quest memory. ' +
      `Ingest it first:\n  ${unrecorded.command}`,
    );
  }

  const pick = pickFrontier(quest, state, ctx.scoreFn);
  if (!pick) return {terminal: 'exhausted'};

  const health = analyzeQuestHealth(root, quest, {state});
  if (!continuationIsAllowed(health.continuation)) {
    if (health.continuation.status === CONTINUATION_BLOCKED_THEORY) {
      return {
        terminal: 'theory-required',
        frontier: pick.def.id,
        rungIndex: pick.state.rungIndex,
        problems: health.continuation.problems,
      };
    }
    throw new Error(continuationErrorMessage(health.continuation));
  }

  const before = evaluate(pick.def.metric, ctx.probeCtx);
  const pending = {
    frontier: pick.def.id,
    rungIndex: pick.state.rungIndex,
    before: {
      metric: before.metric,
      done: before.done,
      evidence: before.evidence,
      evidenceIdentity: before.evidenceIdentity || null,
      evidenceFingerprint: before.evidenceFingerprint || null,
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
  const ctx = configureContext(root, quest, options);
  ensureSealedGoal(root, quest);
  const changeInspection = ctx.honestyCtx.inspectChangeRef(options.changeRef);
  if (!changeInspection.valid) {
    throw new Error(
      `invalid changeRef: ${changeInspection.problems.join('; ')}`,
    );
  }

  const log = readLog(root, quest.id);
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
  const gateResult = theoryGateResult(readinessProblems, pick);
  if (gateResult) return gateResult;

  const outcome = finalizeAttempt(root, quest, ctx, pick, pending.before, {
    changeRef: options.changeRef,
    summary: options.summary || null,
    theoryRef: options.theoryRef || null,
    expectedMovement: options.expectedMovement || null,
    negativeResultMeans: options.negativeResultMeans || null,
    modelRef: options.modelRef || null,
    modelNotApplicable: options.modelNotApplicable || null,
    discrimination: options.discrimination || null,
  });
  const questOutcome = recordQuestSolvedIfDone(root, quest, ctx);
  clearPending(root, quest.id);
  writeReport(root, quest.id);
  // Persist the Quest's own scope-clean work as it progresses (R1). Auto-commit is a
  // no-op outside a git work tree and refuses on a failing audit, so it is safe to call
  // unconditionally; it can be suppressed per-invocation with options.push === false.
  const commit = outcome.violations.length > 0 ?
    {committed: false, skipped: 'attempt-violations'} :
    autoCommitQuest(root, quest.id, {push: options.push});
  return {
    frontier: def.id,
    before: pending.before.metric,
    after: outcome.after.metric,
    done: questOutcome.done,
    progressed: outcome.progressed,
    violations: outcome.violations,
    commit,
  };
}

export function runStep(root, quest, options = {}) {
  if (!options.changeRef) {
    return stepBegin(root, quest, options);
  }
  return stepCommit(root, quest, options);
}
