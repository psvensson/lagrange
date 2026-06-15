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
  EVENT_GUARD_OVERRIDE,
  EXPLORE_BUDGET,
  GUARD_QUORUM,
  OUTCOME_THEORY_REQUIRED,
  OUTCOME_BLOCKED,
  OUTCOME_CONTINUE,
  DISPOSITION_ADVISORY,
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
  continuationOverridable,
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

// Stall-forcing theory problems that must never be softened: LG-D coupled-invariant
// oscillation / system-theory-after-stall and LG-F coupled-invariant reconcile. These
// gates exist to pin a specific corrective move (record a system theory, perform an atomic
// cross-owner reconcile), so deferring them as advisory would reopen the very oscillation
// holes LG-D/LG-F close. The model-contract evidence nudge is deliberately NOT excluded
// (P5b): it is soft-eligible so the model rung gets the same bounded ramp to PRODUCE model
// evidence instead of stopping on first sight — the hard requirement is still enforced at
// commit time by the audit (auditModelEvidence: real model/architecture changes need a
// modelRef or a later model-evidence finding). Matched on the recorded problem text.
const SOFT_FIRST_EXCLUDED_PROBLEM =
  /coupled[- ]invariant|system theory required/i;

// Soft-first eligibility (P5). Only the INFERENTIAL "produce a theory artifact" family of
// theory gates is eligible for a soft-first advisory ramp: a plain frontier/selected-stale/
// metric-zero/model-evidence theory block. The stall-forcing problems above are
// excluded, as are every non-theory code (regression/scope/measurement/data-integrity),
// which keep their immediate disposition. GUARD_QUORUM=0 disables soft-first entirely.
function softFirstEligible(continuation) {
  if (GUARD_QUORUM <= 0) return false;
  if (continuation.code !== CONTINUATION_BLOCKED_THEORY) return false;
  const problems = continuation.problems || [];
  if (problems.length === 0) return false;
  return !problems.some((problem) => SOFT_FIRST_EXCLUDED_PROBLEM.test(problem));
}

// Advisory gate-decisions already recorded for `code` on this frontier since the last
// metric progress. Mirrors exploreBudgetRemaining's "count since lastProgressIndex"
// pattern so an honest improvement resets the soft-first ramp.
function softAdvisoriesSpent(log, frontierId, code) {
  const since = lastProgressIndex(log, frontierId);
  let spent = 0;
  for (let i = since + 1; i < log.length; i += 1) {
    const event = log[i];
    if (event.type === EVENT_GATE_DECISION && event.frontier === frontierId &&
      event.disposition === DISPOSITION_ADVISORY && event.code === code &&
      !event.override) {
      spent += 1;
    }
  }
  return spent;
}

// An unconsumed recorded-reason override for `code` on this frontier, or null. An override
// (EVENT_GUARD_OVERRIDE) authorizes exactly ONE subsequent bypass of the named guard: the
// bypass records an ADVISORY gate decision tagged `override`, which is counted here as a
// consumption. Both counters reset on honest progress (lastProgressIndex), mirroring the
// explore/soft-first budgets, so an override can never permanently disable a guard. When a
// recorded override pins a specific `problem` substring it only matches a block whose
// problems include it; an untargeted override matches any block of the same code.
function activeOverride(log, frontierId, code, problems = []) {
  const since = lastProgressIndex(log, frontierId);
  const overrides = [];
  let consumed = 0;
  for (let i = since + 1; i < log.length; i += 1) {
    const event = log[i];
    if (event.frontier !== frontierId) continue;
    if (event.type === EVENT_GUARD_OVERRIDE && event.code === code) {
      if (!event.problem ||
        problems.some((problem) => String(problem).includes(event.problem))) {
        overrides.push(event);
      }
    } else if (event.type === EVENT_GATE_DECISION && event.code === code &&
      event.override) {
      consumed += 1;
    }
  }
  if (overrides.length > consumed) {
    return {reason: overrides[overrides.length - 1].reason};
  }
  return null;
}

// True when soft-first would let the run DEFER a block (continue without stopping) while it
// is still under quorum. Non-recording predicate: callers that only need to know whether the
// run may keep going (without producing a gate-decision event) use this.
export function softFirstWouldDefer(log, continuation, frontierId) {
  if (!softFirstEligible(continuation)) return false;
  return softAdvisoriesSpent(log, frontierId, continuation.code) < GUARD_QUORUM;
}

// True when a soft-first ADVISORY for `code` on this frontier has already been recorded in
// the CURRENT cycle, i.e. after the frontier's most recent attempt. Within one autonomous
// cycle both the pre-attempt health gate and the readiness gate can see the same missing-
// theory condition; the first to fire records the single advisory and the second observes
// this and does not double-count. A new attempt closes the cycle and resets the window.
function softAdvisoryRecordedThisCycle(log, frontierId, code) {
  let lastAttempt = -1;
  for (let i = 0; i < log.length; i += 1) {
    const event = log[i];
    if (event.type === EVENT_ATTEMPT && event.frontier === frontierId) {
      lastAttempt = i;
    }
  }
  for (let i = lastAttempt + 1; i < log.length; i += 1) {
    const event = log[i];
    if (event.type === EVENT_GATE_DECISION && event.frontier === frontierId &&
      event.disposition === DISPOSITION_ADVISORY && event.code === code &&
      !event.override) {
      return true;
    }
  }
  return false;
}

// True when a gate decision permits the caller to keep working without stopping: either no
// gate fired (null) or the gate was softened to an ADVISORY (soft-first) annotation. Every
// caller that turns a decision into a stop must first check this so an advisory continues.
export function decisionContinues(decision) {
  return !decision || decision.disposition === DISPOSITION_ADVISORY;
}

// Map a blocked continuation to a recorded, actionable gate decision. Returns null when
// the continuation is allowed (no gate). The returned object is the single source of
// truth callers convert into a run/step result.
export function resolveGateDecision(root, quest, continuation, context = {}) {
  if (continuationIsAllowed(continuation)) return null;
  const {log = [], frontier = null, rungIndex = null, softFirst = false} = context;
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

  // Recorded-reason override escape hatch. BEFORE any soft guard is turned into a stop,
  // honour an unconsumed operator/agent override for an OVERRIDABLE (heuristic) guard:
  // record the bypass as an ADVISORY gate decision tagged with the override reason and let
  // the caller continue. This is the judgement escape hatch the rule-author could not
  // anticipate — it is single-use (consumed by this very record), reset by honest progress,
  // and refused for the honesty/integrity invariants (continuationOverridable returns false
  // for regression/unrecorded-evidence/metric-projection/measurement/terminal), so it can
  // bend a process heuristic but never sign off on a dishonest move. The override is honoured
  // in BOTH the autonomous and supervised paths — it is an explicit, recorded decision, not a
  // soft-first delay — so it does not depend on context.softFirst.
  if (continuationOverridable(continuation)) {
    const override = activeOverride(log, frontier, code, problems);
    if (override) {
      appendEvent(root, quest.id, {
        type: EVENT_GATE_DECISION,
        frontier,
        rungIndex,
        disposition: DISPOSITION_ADVISORY,
        code,
        outcome: OUTCOME_CONTINUE,
        override: override.reason,
        problems,
        nextCommand: null,
      });
      return {
        disposition: DISPOSITION_ADVISORY,
        code,
        outcome: OUTCOME_CONTINUE,
        override: override.reason,
        problems,
        nextCommand: null,
        frontier,
        rungIndex,
      };
    }
  }

  // Soft-first / quorum (P5). An inferential theory gate is not hard-escalated on its
  // first corroborating occurrence(s) when the CALLER opted in (context.softFirst) — the
  // autonomous run loop does, so a missing theory does not stop the run on sight; a
  // supervised single `step`/`attempt` does NOT, so it still reports the gate to its
  // operator. While fewer than GUARD_QUORUM advisories have been recorded for this code
  // since the last progress, let the loop continue (run the harness / make a real attempt)
  // and record one ADVISORY gate decision per CYCLE. Both the pre-attempt health gate and
  // the readiness gate can observe the same condition in one cycle; the first to fire
  // records the advisory and the second reuses it (softAdvisoryRecordedThisCycle) so a
  // single missing-theory condition is never double-counted toward the quorum. Once the
  // quorum is reached the call falls through to the real disposition below. The stall-
  // forcing theory problems are excluded (see softFirstEligible), so LG-D/LG-F still pin
  // their corrective move immediately, and an honest improvement resets the ramp (the
  // quorum counter keys off lastProgress).
  if (softFirst && softFirstEligible(continuation) &&
    softAdvisoriesSpent(log, frontier, code) < GUARD_QUORUM) {
    if (!softAdvisoryRecordedThisCycle(log, frontier, code)) {
      appendEvent(root, quest.id, {
        type: EVENT_GATE_DECISION,
        frontier,
        rungIndex,
        disposition: DISPOSITION_ADVISORY,
        code,
        outcome: OUTCOME_CONTINUE,
        problems,
        nextCommand: null,
      });
    }
    return {
      disposition: DISPOSITION_ADVISORY,
      code,
      outcome: OUTCOME_CONTINUE,
      problems,
      nextCommand: null,
      frontier,
      rungIndex,
    };
  }

  // Bounded explore: once the frontier has spent its explore budget without progress,
  // downgrade to park-resumable so the loop stops re-opening the same explore rung.
  if (disposition === DISPOSITION_EXPLORE &&
    exploreBudgetRemaining(log, frontier) <= 0) {
    disposition = DISPOSITION_PARK_RESUMABLE;
    nextCommand = `node tooling/solve.js reopen --id ${quest.id}` +
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
