// Mandatory step-back reflection turn.
//
// A long-running loop that only ever takes the "next move the rung suggests" can grind a
// dead approach for dozens of attempts. The reflection turn periodically FORCES the agent to
// stop, read the whole history, and write a free-form reframing — a pure think turn during
// which no gate fires. It never blocks, never closes a quest, and produces only an
// append-only EVENT_REFLECTION note, so it is safe to run unconditionally where supported.
//
// There are two reflection KINDS, softest to hardest:
//
//   micro     The within-frame step-back. Re-reads the situation INSIDE the sealed Quest:
//             is the selected theory still best, is this approach converging, what cheaper
//             hypothesis to try next. Triggers:
//               cadence   REFLECTION_INTERVAL attempts since the last reflection.
//               scope     scope pressure has crossed its terminal bound — consolidate.
//
//   altitude  The framing step-back. Looks UP and OUT at the FRAME itself: is this Quest at
//             the right altitude, are the formal models / harness pulling their weight, is
//             the code arranged to be reasoned about, should this Quest continue or honestly
//             EXHAUST and pivot to a higher-altitude Quest/epic. Triggers:
//               oscillation       coupled invariant families are bouncing — the canonical
//                                 "the frame, not the next fix, is wrong" signal.
//               altitude-cadence  ALTITUDE_REFLECTION_INTERVAL attempts since the last
//                                 altitude reflection (a coarse, rarer beat).
//               on-demand         `solve.js reflect --altitude` (operator/agent invoked).
//
// The loop checks altitude FIRST (oscillation outranks a micro reframe), then micro. An
// altitude reflection's output must be captured durably (finding / epic / system theory) —
// see reflectionPrompt vs altitudeReflectionPrompt. A reflection (recorded note) resets the
// relevant cadence, and the per-attempt guard below means a trigger fires at most once per
// attempt, so the turn is always bounded.

import {
  EVENT_ATTEMPT,
  EVENT_FINDING,
  EVENT_REFLECTION,
  REFLECTION_INTERVAL,
  ALTITUDE_REFLECTION_INTERVAL,
  REJECTION_REFLECTION_STREAK,
} from './constants.js';

const VERIFIER_REJECTION_KIND = 'verifier-rejection';
const TRIGGER_REJECTION_STREAK = 'rejection-streak';

// Reflection kinds, recorded on each EVENT_REFLECTION so the altitude cadence can count
// attempts since the last *altitude* reflection independently of micro reflections.
export const REFLECTION_KIND_MICRO = 'micro';
export const REFLECTION_KIND_ALTITUDE = 'altitude';

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

// Index of the most recent ALTITUDE reflection in the log, or -1 if none.
export function lastAltitudeReflectionIndex(log) {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i].type === EVENT_REFLECTION && log[i].kind === REFLECTION_KIND_ALTITUDE) {
      return i;
    }
  }
  return -1;
}

// Number of recorded attempts since the last altitude reflection (or since the start).
export function attemptsSinceAltitudeReflection(log) {
  const since = lastAltitudeReflectionIndex(log);
  let count = 0;
  for (let i = since + 1; i < log.length; i += 1) {
    if (log[i].type === EVENT_ATTEMPT) count += 1;
  }
  return count;
}

// True when a rejection streak should force a micro reflection: the frontier has
// accumulated `distinctRejections` distinct rejected candidates (the caller derives that
// from candidateRejectionFingerprintsSinceApproval) AND at least one verifier-rejection
// finding was recorded after the last reflection. The second condition is the re-fire
// guard: the streak persists until an approval clears it, so without it a standing streak
// would tax every subsequent attempt with a reflection turn instead of firing once per
// new rejection.
export function rejectionStreakDue(log, distinctRejections) {
  if (REJECTION_REFLECTION_STREAK <= 0) return false;
  if (!(distinctRejections >= REJECTION_REFLECTION_STREAK)) return false;
  const since = lastReflectionIndex(log);
  for (let i = since + 1; i < log.length; i += 1) {
    if (log[i].type === EVENT_FINDING &&
      log[i].kind === VERIFIER_REJECTION_KIND) {
      return true;
    }
  }
  return false;
}

// Decide whether a MICRO step-back reflection is due. `triggers.scope` and
// `triggers.rejectionStreak` force one immediately; otherwise the cadence
// (REFLECTION_INTERVAL attempts since the last reflection of any kind) applies.
// Oscillation is handled by altitudeReflectionDue, which the loop checks first. Returns
// the trigger label that fired, or null when not due.
export function reflectionDue(log, triggers = {}) {
  if (reflectionRecordedThisCycle(log)) return null;
  if (triggers.scope) return 'scope-pressure';
  if (triggers.rejectionStreak) return TRIGGER_REJECTION_STREAK;
  if (REFLECTION_INTERVAL > 0 && attemptsSinceReflection(log) >= REFLECTION_INTERVAL) {
    return 'cadence';
  }
  return null;
}

// Decide whether an ALTITUDE (framing) reflection is due. `triggers.oscillating` forces one
// immediately (a bouncing coupling means the frame is suspect); otherwise the coarse
// ALTITUDE_REFLECTION_INTERVAL cadence (attempts since the last altitude reflection)
// applies. Returns the trigger label that fired, or null when not due.
export function altitudeReflectionDue(log, triggers = {}) {
  if (reflectionRecordedThisCycle(log)) return null;
  if (triggers.oscillating) return 'oscillation';
  // rr-H: a parent-linked chain of quests stuck on one live-gate artifact class is the
  // cross-quest whack-a-mole signature — like oscillation, it questions the frame itself.
  if (triggers.chain) return 'chain-depth';
  if (ALTITUDE_REFLECTION_INTERVAL > 0 &&
    attemptsSinceAltitudeReflection(log) >= ALTITUDE_REFLECTION_INTERVAL) {
    return 'altitude-cadence';
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
      trigger === TRIGGER_REJECTION_STREAK ?
        'independent verification has rejected ' +
        `${REJECTION_REFLECTION_STREAK}+ distinct candidates since the last ` +
        'approval — repeated rejections are usually fidelity, bar, or framing ' +
        'defects, and another broad patch round is usually the wrong next move' :
        `${REFLECTION_INTERVAL} attempts have passed without a step-back`;
  return `Step back and reflect on quest ${quest.id} (${frontier}): ${reason}. ` +
    'Read the whole attempt/finding/theory history and write a short, falsifiable ' +
    'reframing: is the selected theory still the best explanation of the evidence, is ' +
    'this approach actually converging, and what cheaper hypothesis should be abandoned ' +
    'or tried next? Two framing tripwires: (a) has live/measured evidence contradicted ' +
    'the sealed statement more than once — if so the FRAME is suspect, consider ' +
    'EXHAUST-and-reauthor instead of the next patch; (b) does the current hypothesis ' +
    'need increasingly exotic preconditions to survive — each rescue clause is evidence ' +
    'against the framing, not a refinement of it. No gate fires during this turn — it ' +
    'is pure reasoning, recorded as a reflection note.';
}

// The instruction handed to a reflection-capable executor for an ALTITUDE (framing)
// reflection. Unlike reflectionPrompt, it deliberately pulls the agent OUT of the frame: it
// questions the Quest's altitude, the modeling/harness strategy, and the code arrangement,
// and it demands the insight be captured durably (it must not evaporate in chat) and names
// EXHAUST-and-pivot as a legitimate outcome.
export function altitudeReflectionPrompt(quest, health, trigger) {
  const frontier = health?.frontier || 'the open frontier';
  const reason = trigger === 'oscillation' ?
    'invariant families are oscillating — single-frontier patches are bouncing a coupling, ' +
    'the canonical signal that the FRAME, not the next fix, is what must change' :
    trigger === 'chain-depth' ?
      'this quest sits on a parent-linked chain of quests all gated on the SAME live ' +
      'scenario, each solved only for the next residual to spawn — the cross-quest ' +
      'whack-a-mole signature; ask whether the declared stopping rule or a ' +
      'higher-altitude structural quest (see the owning epic) should take over' :
      `${ALTITUDE_REFLECTION_INTERVAL} attempts have passed without an altitude step-back`;
  return `Altitude (framing) reflection on quest ${quest.id} (${frontier}): ${reason}. ` +
    'Look UP and OUT, not at the next local move. Ask: (1) Is this Quest at the right ' +
    'ALTITUDE, or is the real lever an owner boundary / cutover this Quest cannot touch? ' +
    '(2) Are the formal models and the deterministic harness pulling their weight, or is ' +
    'one facet being re-modeled per blocker? (3) Is the code ARRANGED so this can be ' +
    'reasoned about, or is truth diffuse across many sources/files? (4) Given the answers, ' +
    'should this Quest continue, or honestly EXHAUST and pivot to a higher-altitude ' +
    'Quest/epic? You MUST land the answer durably — record a finding (with rulesOut), author ' +
    'or update a solve/epics/ entry, or record a system theory; an altitude insight must not ' +
    'evaporate in chat. No gate fires during this turn — it is pure reasoning.';
}
