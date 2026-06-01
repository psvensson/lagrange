// The loop driver — the entire control flow, with exactly three terminals:
//   SOLVED     quest.doneWhen is true            -> stop, present result
//   EXHAUSTED  no open frontier remains          -> stop, present result
//   MAX_CYCLES safety bound for CI/skeleton runs  -> stop (not a real terminal)
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
  OUTCOME_SOLVED,
  OUTCOME_EXHAUSTED,
  OUTCOME_MAX_CYCLES,
} from './constants.js';
import {appendEvent, readLog, projectState, rebuildState} from './store.js';
import {evaluate} from './probe.js';
import {pickFrontier} from './scheduler.js';
import {
  validateAttempt,
  validateGoalpostsImmutable,
  METRIC_DIRECTION_LOWER_IS_BETTER,
} from './honesty.js';

function defaultFileExists(p) {
  return Boolean(p) && fs.existsSync(p);
}

function defaultChangeRefResolves(ref) {
  if (!ref) return false;
  if (ref.startsWith('diff:')) return fs.existsSync(ref.slice('diff:'.length));
  return false;
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

function finish(root, quest, outcome, evidence) {
  if (outcome !== OUTCOME_MAX_CYCLES) {
    appendEvent(root, quest.id, {type: EVENT_QUEST, status: outcome, evidence});
  }
  const state = rebuildState(root, quest);
  return {outcome, evidence, state};
}

function runOneCycle(root, quest, ctx) {
  const questDone = evaluate(quest.doneWhen, ctx.probeCtx);
  if (questDone.done) {
    return {terminal: OUTCOME_SOLVED, evidence: questDone.evidence};
  }
  const state = projectState(quest, readLog(root, quest.id));
  const pick = pickFrontier(quest, state, ctx.scoreFn);
  if (!pick) return {terminal: OUTCOME_EXHAUSTED, evidence: null};

  const before = evaluate(pick.def.metric, ctx.probeCtx);
  if (before.done) {
    appendEvent(root, quest.id, {
      type: EVENT_SOLVED, frontier: pick.def.id, evidence: before.evidence,
    });
    return {terminal: null};
  }
  applyAttempt(root, quest, ctx, pick, before);
  return {terminal: null};
}

function applyAttempt(root, quest, ctx, pick, before) {
  const rungIndex = pick.state.rungIndex;
  const log = readLog(root, quest.id);
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
    rung: LADDER[rungIndex],
    rungIndex,
    metricHistory,
    evidencePaths,
  });
  finalizeAttempt(root, quest, ctx, pick, before, result);
}

// Record one attempt's outcome: re-measure the metric, build + honesty-check the
// attempt event, persist it, and run the keep/climb/park decision. Shared by the
// autonomous loop and the manual `step` flow so both obey identical honesty rules.
export function finalizeAttempt(root, quest, ctx, pick, before, result) {
  const rungIndex = pick.state.rungIndex;
  const after = evaluate(pick.def.metric, ctx.probeCtx);
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
    evidence: after.evidence,
  };
  const violations = validateAttempt(event, ctx.honestyCtx);
  if (violations.length > 0) {
    appendEvent(root, quest.id, {
      type: EVENT_VIOLATION, frontier: pick.def.id, violations, attempt: event,
    });
  }
  const progressed = decideAndRecord(root, quest, pick, event, after, violations);
  return {event, after, violations, progressed};
}

function decideAndRecord(root, quest, pick, event, after, violations) {
  const progressed = violations.length === 0 &&
    after.metric !== null && event.metricBefore !== null &&
    after.metric < event.metricBefore;
  // A rung is escalated on a stall or on untrusted (violating) data. It is only kept
  // when honest progress is observed.
  const nextRung = progressed ? event.rungIndex :
    Math.min(event.rungIndex + 1, PARK_RUNG_INDEX);
  appendEvent(root, quest.id, {...event, rungIndex: nextRung});
  if (after.done) {
    appendEvent(root, quest.id, {
      type: EVENT_SOLVED, frontier: pick.def.id, evidence: after.evidence,
    });
  } else if (!progressed && nextRung >= PARK_RUNG_INDEX) {
    appendEvent(root, quest.id, {
      type: EVENT_PARK,
      frontier: pick.def.id,
      reason: 'ladder exhausted without metric movement',
      finalMetric: after.metric,
    });
  }
  return progressed;
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
      changeRefResolves: options.changeRefResolves || defaultChangeRefResolves,
    },
  };
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
    });
  }
  rebuildState(root, quest);
  return {done: true, evidence: questDone.evidence};
}

export function runLoop(root, quest, options = {}) {
  const ctx = makeRunContext(options);
  ensureSealedGoal(root, quest);
  const maxCycles = Number.isInteger(options.maxCycles) ? options.maxCycles : 1000;
  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const {terminal, evidence} = runOneCycle(root, quest, ctx);
    if (terminal === OUTCOME_SOLVED) {
      return finish(root, quest, STATUS_SOLVED, evidence);
    }
    if (terminal === OUTCOME_EXHAUSTED) {
      return finish(root, quest, STATUS_EXHAUSTED, evidence);
    }
  }
  return finish(root, quest, OUTCOME_MAX_CYCLES, null);
}
