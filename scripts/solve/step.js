// Manual vertical — the two-phase `step` flow for human/agent-in-the-loop work.
//
// Unlike the autonomous loop (whose executors never block), manual work happens
// out-of-band: a person makes a change and re-runs the harness between two CLI calls.
// So a manual attempt is bracketed across two invocations:
//
//   begin   measure the metric NOW, pick the frontier, print the rung dossier, and
//           persist a pending baseline.
//   commit  measure the metric again (after the operator's change + harness rerun),
//           then record the attempt through the SAME honesty + ladder decision path
//           the autonomous loop uses (loop.finalizeAttempt).
//
// This keeps "before" honestly pinned to the pre-work state while reusing all of the
// loop's guarantees (evidence-bound metrics, sealed goalposts, keep/climb/park).

import fs from 'node:fs';
import path from 'node:path';

import {SOLVE_DATA_DIR, STATE_SUBDIR, LADDER, EVENT_ATTEMPT}
  from './constants.js';
import {readLog, projectState, assertSafeQuestId} from './store.js';
import {evaluate} from './probe.js';
import {pickFrontier} from './scheduler.js';
import {rungPrompt} from './ladder.js';
import {
  makeRunContext,
  ensureSealedGoal,
  finalizeAttempt,
  recordQuestSolvedIfDone,
} from './loop.js';

export function pendingFilePath(root, questId) {
  return path.join(root, SOLVE_DATA_DIR, STATE_SUBDIR,
    `${assertSafeQuestId(questId)}.pending.json`);
}

function metricName(frontierDef) {
  return frontierDef.metric?.args?.metric || frontierDef.metric?.probe || 'metric';
}

function metricHistory(root, questId, frontierId) {
  return readLog(root, questId)
    .filter((e) => e.type === EVENT_ATTEMPT && e.frontier === frontierId)
    .map((e) => e.metricAfter);
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

// Phase 1: pick the frontier and emit the dossier; pin the pre-work baseline.
export function stepBegin(root, quest, options = {}) {
  const ctx = makeRunContext(options);
  ensureSealedGoal(root, quest);
  if (loadPending(root, quest.id)) {
    if (options.force) {
      clearPending(root, quest.id);
    } else {
      throw new Error(
        'a step is already pending; run `solve step --commit` or `--abort` first');
    }
  }
  const questDone = evaluate(quest.doneWhen, ctx.probeCtx);
  if (questDone.done) {
    return {terminal: 'solved', evidence: questDone.evidence};
  }
  const state = projectState(quest, readLog(root, quest.id));
  const pick = pickFrontier(quest, state, ctx.scoreFn);
  if (!pick) return {terminal: 'exhausted'};
  const before = evaluate(pick.def.metric, ctx.probeCtx);
  const rungIndex = pick.state.rungIndex;
  const dossier = rungPrompt({
    quest,
    frontierDef: pick.def,
    metricName: metricName(pick.def),
    rungIndex,
    metricHistory: [...metricHistory(root, quest.id, pick.def.id), before.metric],
    findings: pick.state.findings,
  });
  const pending = {
    frontier: pick.def.id,
    rungIndex,
    before: {metric: before.metric, evidence: before.evidence, done: before.done},
  };
  const pendingFile = savePending(root, quest.id, pending);
  return {terminal: null, frontier: pick.def.id, rung: LADDER[rungIndex], rungIndex,
    before, dossier, pendingFile};
}

// Phase 2: re-measure and record the attempt via the shared honesty/ladder path.
export function stepCommit(root, quest, options = {}) {
  const pending = loadPending(root, quest.id);
  if (!pending) throw new Error('no pending step; run `solve step` first');
  if (!options.changeRef) {
    throw new Error('commit requires --changeRef diff:<path>');
  }
  const ctx = makeRunContext(options);
  const state = projectState(quest, readLog(root, quest.id));
  const def = quest.frontiers.find((f) => f.id === pending.frontier);
  const fState = state.frontiers.find((f) => f.id === pending.frontier);
  if (!def || !fState) throw new Error(`pending frontier ${pending.frontier} not found`);
  // The persisted rung is authoritative for this attempt.
  fState.rungIndex = pending.rungIndex;
  const pick = {def, state: fState};
  const result = {changeRef: options.changeRef, summary: options.summary || null};
  const outcome = finalizeAttempt(root, quest, ctx, pick, pending.before, result);
  const questOutcome = recordQuestSolvedIfDone(root, quest, ctx);
  clearPending(root, quest.id);
  return {
    frontier: pending.frontier,
    before: pending.before.metric,
    after: outcome.after.metric,
    done: questOutcome.done,
    progressed: outcome.progressed,
    violations: outcome.violations,
  };
}

export function stepAbort(root, questId) {
  const had = Boolean(loadPending(root, questId));
  clearPending(root, questId);
  return had;
}

export function stepPending(root, questId) {
  return loadPending(root, questId);
}
