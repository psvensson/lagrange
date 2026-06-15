// Mandatory step-back reflection turn.
//
// A long-running loop that only ever takes the "next move the rung suggests" can grind a
// dead approach for dozens of attempts. The reflection turn periodically FORCES the agent to
// stop, read the whole history, and write a free-form reframing — a pure think turn during
// which no gate fires. It never blocks, never closes a quest, and produces only an
// append-only EVENT_REFLECTION note, so it is safe to run unconditionally where supported.
//
// Triggers (any one makes a reflection due):
//   cadence       REFLECTION_INTERVAL recorded attempts have passed since the last
//                 reflection (a regular "are we still on the right track?" beat).
//   oscillation   the frontier is flapping between coupled invariant families — exactly the
//                 situation where grinding the next local fix is worst and a reframe helps.
//   scope         scope pressure has crossed its terminal bound (the blast radius is
//                 running away) — step back and consolidate rather than pile on more edits.
//
// A reflection (recorded note) resets the cadence, and the per-attempt guard below means a
// trigger fires at most once per attempt, so the turn is always bounded.

import {EVENT_ATTEMPT, EVENT_REFLECTION, REFLECTION_INTERVAL} from './constants.js';

// Index of the most recent reflection note in the log, or -1 if none has been recorded.
export function lastReflectionIndex(log) {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i].type === EVENT_REFLECTION) return i;
  }
  return -1;
}

// Number of recorded attempts since the last reflection (or since the start if none).
export function attemptsSinceReflection(log) {
  const since = lastReflectionIndex(log);
  let count = 0;
  for (let i = since + 1; i < log.length; i += 1) {
    if (log[i].type === EVENT_ATTEMPT) count += 1;
  }
  return count;
}

// True when a reflection has already been recorded after the most recent attempt — i.e. in
// the current cycle. This bounds the trigger-driven reflections (oscillation/scope) to at
// most one per attempt so a persistent condition cannot spin the loop on back-to-back
// reflections; the next attempt re-opens the window.
function reflectionRecordedThisCycle(log) {
  let lastAttempt = -1;
  for (let i = 0; i < log.length; i += 1) {
    if (log[i].type === EVENT_ATTEMPT) lastAttempt = i;
  }
  for (let i = lastAttempt + 1; i < log.length; i += 1) {
    if (log[i].type === EVENT_REFLECTION) return true;
  }
  return false;
}

// Decide whether a step-back reflection is due. `triggers.oscillating` / `triggers.scope`
// force a reflection immediately; otherwise the cadence (REFLECTION_INTERVAL attempts since
// the last reflection) applies. Returns the trigger label that fired, or null when not due.
export function reflectionDue(log, triggers = {}) {
  if (reflectionRecordedThisCycle(log)) return null;
  if (triggers.oscillating) return 'oscillation';
  if (triggers.scope) return 'scope-pressure';
  if (REFLECTION_INTERVAL > 0 && attemptsSinceReflection(log) >= REFLECTION_INTERVAL) {
    return 'cadence';
  }
  return null;
}

// The free-form instruction handed to a reflection-capable executor (and surfaced to a
// supervised driver). It deliberately imposes no rung, metric, or move — its only job is an
// honest reframe: is the current theory still the best explanation, is the approach
// converging, and is there a cheaper hypothesis to abandon to.
export function reflectionPrompt(quest, health, trigger) {
  const frontier = health?.frontier || 'the open frontier';
  const reason = trigger === 'oscillation' ?
    'invariant families are oscillating (a coupling, not a one-off)' :
    trigger === 'scope-pressure' ?
      'change scope has run away past its bound' :
      `${REFLECTION_INTERVAL} attempts have passed without a step-back`;
  return `Step back and reflect on quest ${quest.id} (${frontier}): ${reason}. ` +
    'Read the whole attempt/finding/theory history and write a short, falsifiable ' +
    'reframing: is the selected theory still the best explanation of the evidence, is ' +
    'this approach actually converging, and what cheaper hypothesis should be abandoned ' +
    'or tried next? No gate fires during this turn — it is pure reasoning, recorded as a ' +
    'reflection note.';
}
