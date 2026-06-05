// Workflow advisories: non-blocking nudges surfaced to a supervised driver (human or agent)
// in status/step/report/health output.
//
// The autonomous run loop ACTS on these conditions directly: maybeRunReflection fires the
// step-back reflection turn when one is due, and resolveGateDecision honors a recorded
// override of a soft guard. A supervised driver never goes through runLoop, so without these
// advisories the reflection turn is never taken and the override escape hatch is never
// surfaced — the features only ever helped autonomous runs. Each advisory is read-only: it
// only tells the driver that a move is available and the exact command to take it. Recording
// the move (reflect / override) stays an explicit operator action.

import {reflectionDue, reflectionPrompt} from './reflection.js';
import {
  CONTINUATION_BLOCKED_THEORY,
  CONTINUATION_BLOCKED_SCOPE,
  continuationIsAllowed,
  continuationOverridable,
} from './continuation.js';

// Derive the reflection triggers (oscillation / runaway scope) from the health signals,
// exactly as the run loop does before calling maybeRunReflection. Keeping this in one place
// means the advisory and the autonomous turn fire on identical conditions.
export function reflectionTriggersFromHealth(health) {
  const signals = (health && health.signals) || [];
  return {
    oscillating: signals.some(
      (signal) => signal.type === 'coupled-invariant-oscillation'),
    scope: signals.some(
      (signal) => signal.type === 'scope-pressure-terminal'),
  };
}

const OVERRIDE_GUARD_LABELS = Object.freeze({
  [CONTINUATION_BLOCKED_THEORY]: 'theory',
  [CONTINUATION_BLOCKED_SCOPE]: 'scope',
});

// Build the advisory list for a quest from its projected health and log. Three advisories,
// all aimed at keeping a supervised/out-of-band agent's progress IN the quest memory (the
// append-only log) so it survives a restart rather than living only in source edits:
//   evidence-unrecorded a fresh probe/harness measurement exists that the quest has not
//                       ingested; record it so the measurement becomes durable quest memory.
//   reflection-due      a step-back reflection turn is due (cadence / oscillation / scope);
//                       surfaces the same prompt the autonomous loop would hand its executor.
//   override-available  the current block is a soft, overridable guard (theory / scope), so a
//                       recorded-reason override may legitimately bypass it.
// Returns [] when none applies.
export function buildAdvisories(quest, health, log) {
  const advisories = [];
  for (const signal of (health && health.signals) || []) {
    if (signal.type !== 'fresh-evidence-unrecorded' &&
      signal.type !== 'fresh-closure-evidence-unrecorded') {
      continue;
    }
    advisories.push({
      kind: 'evidence-unrecorded',
      severity: 'advisory',
      scope: signal.type === 'fresh-closure-evidence-unrecorded' ? 'closure' : 'frontier',
      message:
        'a fresh measurement is newer than quest memory; record it so this progress ' +
        'survives a restart instead of living only in source changes',
      command: signal.command ||
        `node scripts/solve.js ingest-evidence --id ${quest.id} --evidence <fresh report>`,
    });
  }
  const trigger = reflectionDue(log || [], reflectionTriggersFromHealth(health));
  if (trigger) {
    advisories.push({
      kind: 'reflection-due',
      severity: 'advisory',
      trigger,
      message:
        `a step-back reflection is due (${trigger}); read the whole history and ` +
        'record a falsifiable reframing before the next attempt',
      prompt: reflectionPrompt(quest, health, trigger),
      command:
        `node scripts/solve.js reflect --id ${quest.id} --trigger ${trigger} ` +
        '--note "<falsifiable reframing>"',
    });
  }
  const continuation = health && health.continuation;
  if (!continuationIsAllowed(continuation) && continuationOverridable(continuation)) {
    const code = continuation.code || continuation.status;
    const guard = OVERRIDE_GUARD_LABELS[code] || code;
    const frontier = (health && health.frontier) || '<frontierId>';
    advisories.push({
      kind: 'override-available',
      severity: 'advisory',
      code,
      guard,
      message:
        `the ${guard} guard is soft and overridable; if you have a falsifiable reason ` +
        'to proceed, authorize one recorded-reason bypass',
      command:
        `node scripts/solve.js override --id ${quest.id} --frontier ${frontier} ` +
        `--guard ${guard} --reason "<falsifiable justification>"`,
    });
  }
  return advisories;
}

// Render advisories as a markdown block (used by report/health/step text output). Returns an
// empty array when there are no advisories so callers can omit the section entirely.
export function renderAdvisoryLines(advisories) {
  if (!advisories || advisories.length === 0) return [];
  const lines = ['## Advisories'];
  for (const advisory of advisories) {
    lines.push(`- ${advisory.kind}: ${advisory.message}`);
    lines.push(`  run: ${advisory.command}`);
  }
  return lines;
}
