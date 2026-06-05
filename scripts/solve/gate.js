// Graded gate-decision layer.
//
// Every place that used to either crash the run (throw on a continuation block) or stop
// it silently (return terminal: 'theory-required' with no next step) now routes through
// here. A blocked continuation is mapped to one of the graded dispositions
// (advisory/reroute/explore/park-resumable/terminal — see constants.js) and turned into a
// NON-terminal, actionable stop carrying a concrete next command. Two real terminals
// (SOLVED / honest EXHAUSTED) are deliberately NOT produced here: a recoverable gate must
// never close a quest.
//
// `explore` is bounded. A theory gate keeps the quest in `explore` while the frontier
// still has EXPLORE_BUDGET; once that budget is spent (no metric movement and no fresh
// theory artifact in between) the same gate parks the single frontier as RESUMABLE so the
// loop converges instead of re-stopping forever — but the quest itself stays open.

import {
  EVENT_ATTEMPT,
  EVENT_GATE_DECISION,
  EXPLORE_BUDGET,
  OUTCOME_THEORY_REQUIRED,
  OUTCOME_BLOCKED,
  DISPOSITION_EXPLORE,
  DISPOSITION_PARK_RESUMABLE,
  DISPOSITION_TERMINAL,
} from './constants.js';
import {appendEvent} from './store.js';
import {
  CONTINUATION_ALLOWED,
  CONTINUATION_BLOCKED_THEORY,
  CONTINUATION_BLOCKED_SCOPE,
  CONTINUATION_BLOCKED_REGRESSION,
  continuationIsAllowed,
  continuationErrorMessage,
  continuationDisposition,
} from './continuation.js';

// Index of the last attempt on `frontierId` whose metric strictly improved. Explore
// budget is counted only since the last real progress, so a frontier that keeps making
// honest progress is never starved of explore room.
function lastProgressIndex(log, frontierId) {
  let index = -1;
  for (let i = 0; i < log.length; i += 1) {
    const event = log[i];
    if (event.type === EVENT_ATTEMPT && event.frontier === frontierId &&
      event.progressed === true) {
      index = i;
    }
  }
  return index;
}

// How many bounded free-explore stops remain for this frontier before it must park as
// resumable. Counts recorded explore gate-decisions since the last progress.
export function exploreBudgetRemaining(log, frontierId) {
  const since = lastProgressIndex(log, frontierId);
  let spent = 0;
  for (let i = since + 1; i < log.length; i += 1) {
    const event = log[i];
    if (event.type === EVENT_GATE_DECISION && event.frontier === frontierId &&
      event.disposition === DISPOSITION_EXPLORE) {
      spent += 1;
    }
  }
  return EXPLORE_BUDGET - spent;
}

// Map a blocked continuation to a recorded, actionable gate decision. Returns null when
// the continuation is allowed (no gate). The returned object is the single source of
// truth callers convert into a run/step result.
export function resolveGateDecision(root, quest, continuation, context = {}) {
  if (continuationIsAllowed(continuation)) return null;
  const {log = [], frontier = null, rungIndex = null} = context;
  const decided = continuationDisposition(continuation, {
    questId: quest.id,
    frontier,
  });

  let {disposition, nextCommand} = decided;
  const {code, problems} = decided;

  // An unmapped/terminal-mapped block is a genuine precondition error: preserve the old
  // hard failure rather than inventing a soft path for something we do not understand.
  if (disposition === DISPOSITION_TERMINAL) {
    throw new Error(continuationErrorMessage(continuation));
  }

  // Bounded explore: once the frontier has spent its explore budget without progress,
  // downgrade to park-resumable so the loop stops re-opening the same explore rung.
  if (disposition === DISPOSITION_EXPLORE &&
    exploreBudgetRemaining(log, frontier) <= 0) {
    disposition = DISPOSITION_PARK_RESUMABLE;
    nextCommand = `node scripts/solve.js reopen --id ${quest.id}` +
      (frontier ? ` --frontier ${frontier}` : '') +
      ' --reason "fresh evidence or a new falsifiable theory for the parked frontier"';
  }

  const outcome = disposition === DISPOSITION_EXPLORE ?
    OUTCOME_THEORY_REQUIRED :
    OUTCOME_BLOCKED;

  appendEvent(root, quest.id, {
    type: EVENT_GATE_DECISION,
    frontier,
    rungIndex,
    disposition,
    code,
    outcome,
    problems,
    nextCommand,
  });

  return {disposition, code, outcome, problems, nextCommand, frontier, rungIndex};
}

// Shape a gate decision into the supervised-step result object (step.js / theoryGateResult
// callers). theory/explore keeps the historical `terminal: 'theory-required'` label for
// back-compat; every other recoverable gate uses `terminal: 'blocked'`.
export function gateDecisionToStepResult(decision) {
  return {
    terminal: decision.outcome === OUTCOME_THEORY_REQUIRED ?
      'theory-required' :
      'blocked',
    disposition: decision.disposition,
    frontier: decision.frontier,
    rungIndex: decision.rungIndex,
    problems: decision.problems,
    nextCommand: decision.nextCommand,
  };
}

// Classify a raw `stepTheoryGateProblems` string into a continuation code so the same
// graded routing applies whether the block arrived as a health-continuation or as a raw
// theory-gate problem list. Scope and regression problems reroute; everything else (a
// missing/stale/needed theory, model evidence, coupled oscillation) is an explore gate.
function classifyTheoryProblem(problem) {
  if (/scope pressure terminal/i.test(problem)) {
    return CONTINUATION_BLOCKED_SCOPE;
  }
  if (/restore previously-green|restore previously green/i.test(problem)) {
    return CONTINUATION_BLOCKED_REGRESSION;
  }
  return CONTINUATION_BLOCKED_THEORY;
}

export function theoryGateContinuation(problems) {
  if (!problems || problems.length === 0) {
    return {status: CONTINUATION_ALLOWED, code: null, problems: []};
  }
  const codes = problems.map(classifyTheoryProblem);
  const precedence = [
    CONTINUATION_BLOCKED_REGRESSION,
    CONTINUATION_BLOCKED_SCOPE,
    CONTINUATION_BLOCKED_THEORY,
  ];
  const code = precedence.find((c) => codes.includes(c)) ||
    CONTINUATION_BLOCKED_THEORY;
  return {status: code, code, problems};
}
