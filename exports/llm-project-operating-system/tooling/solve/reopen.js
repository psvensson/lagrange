// reopen — return a parked frontier to active work when its exhaustion verdict was
// driven by non-measuring (invalid) samples and therefore cannot be trusted.
//
// This is the honest counterpart to Concern 1 (metric validity). A frontier parks when
// the ladder climbs to the park rung "without metric movement". If the attempts that
// drove that climb were incomplete/blocked harness runs (which the pre-fix probe read
// as a false metric 0), the "no movement" conclusion is not real evidence — it is an
// artifact of invalid samples. Reopen lets the Solver re-enter such a frontier with
// fresh, honestly-measured attempts WITHOUT moving the goalposts: the sealed doneWhen
// and frontier metrics are unchanged, the park event stays in the append-only log, and
// parkedCount is preserved so the scheduler still de-prioritizes a chronic parker.
//
// Reopen is refused when no contributing attempt was a non-measuring sample: an honest
// park (the frontier was genuinely measured and did not move) must not be reopened.

import {
  EVENT_ATTEMPT,
  EVENT_FRONTIER_REOPENED,
  STATUS_PARKED,
  PARK_KIND_CANNOT_MEASURE,
} from './constants.js';
import {appendEvent, loadQuest, readLog, projectState, rebuildState} from './store.js';
import {attemptIsNonMeasuring} from './sample-validity.js';
import {inspectChangeArtifact} from './change-artifact.js';
import {writeReport} from './report.js';

// Has anything changed since the most recent reopen of this frontier that could make it
// measurable again? "Change" means a fresh attempt landed after the reopen carrying a
// resolved changeRef (a real source/test edit) OR a newly trustworthy (measuring)
// sample. With nothing changed, reopening a cannot-measure park again would only restart
// the same never-measuring loop, so the bound refuses and points at the harness instead.
function changedSinceLastReopen(root, quest, log, frontierId, frontierDef) {
  let lastReopenIndex = -1;
  log.forEach((e, i) => {
    if (e.type === EVENT_FRONTIER_REOPENED && e.frontier === frontierId) {
      lastReopenIndex = i;
    }
  });
  if (lastReopenIndex === -1) return true;
  const after = log
    .slice(lastReopenIndex + 1)
    .filter((e) => e.type === EVENT_ATTEMPT && e.frontier === frontierId);
  return after.some((a) => {
    const resolvedChange = Boolean(a.changeRef) &&
      inspectChangeArtifact(root, quest, a.changeRef).valid;
    return resolvedChange || !attemptIsNonMeasuring(root, a, frontierDef);
  });
}

export function assessReopen(root, quest, frontierId) {
  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  const frontierState = state.frontiers.find((f) => f.id === frontierId);
  const frontierDef = quest.frontiers.find((f) => f.id === frontierId);
  if (!frontierDef || !frontierState) {
    return {ok: false, reason: `frontier ${frontierId} not found`};
  }
  if (frontierState.status !== STATUS_PARKED) {
    return {
      ok: false,
      reason: `frontier ${frontierId} is ${frontierState.status}, not parked`,
    };
  }
  const attempts = log.filter((e) =>
    e.type === EVENT_ATTEMPT && e.frontier === frontierId);
  const invalidAttempts = attempts.filter(
    (a) => attemptIsNonMeasuring(root, a, frontierDef));
  // Honest-park refusal: with zero non-measuring samples the frontier was genuinely
  // measured at every rung and simply did not move, so the exhaustion verdict stands.
  // A park that counted even one non-measuring sample left at least one rung untested,
  // so its exhaustion is not fully trustworthy and a reopen is warranted — regardless
  // of how many other rungs were honestly measured (a mixed park is not an honest park).
  if (invalidAttempts.length === 0) {
    return {
      ok: false,
      frontierId,
      attempts: attempts.length,
      invalidSampleCount: 0,
      reason:
        `frontier ${frontierId} parked on honestly-measured attempts ` +
        '(no non-measuring samples); reopen refused to protect the exhaustion verdict',
    };
  }
  // Oscillation bound: a frontier already reopened at least once, with nothing changed
  // since that reopen, must not be reopened again — re-running an unchanged harness can
  // only reproduce the same non-measuring loop. This guards both park kinds; for a
  // cannot-measure park it specifically points the operator at fixing the harness.
  if (
    frontierState.reopenCount > 0 &&
    !changedSinceLastReopen(root, quest, log, frontierId, frontierDef)
  ) {
    const harnessHint = frontierState.parkKind === PARK_KIND_CANNOT_MEASURE ?
      'fix the measurement harness before reopening again' :
      'change the source or attempt evidence before reopening again';
    return {
      ok: false,
      frontierId,
      attempts: attempts.length,
      invalidSampleCount: invalidAttempts.length,
      reason:
        `frontier ${frontierId} was already reopened ${frontierState.reopenCount} ` +
        `time(s) with nothing changed since; ${harnessHint}`,
    };
  }
  return {
    ok: true,
    frontierId,
    attempts: attempts.length,
    invalidSampleCount: invalidAttempts.length,
    contributingEvidence: invalidAttempts.map((a) => a.evidence).filter(Boolean),
    reason: null,
  };
}

function defaultParkedFrontier(quest, state) {
  const parked = state.frontiers.filter((f) => f.status === STATUS_PARKED);
  if (parked.length === 1) return parked[0].id;
  return null;
}

export function reopenFrontier(root, args = {}) {
  const id = args.id || args._?.[0];
  if (!id) throw new Error('reopen: --id <questId> is required');
  if (typeof args.reason !== 'string' || args.reason.trim().length === 0) {
    throw new Error('reopen: --reason <text> is required to justify the reopen');
  }
  const quest = loadQuest(root, id);
  const state = projectState(quest, readLog(root, id));
  const frontierId = args.frontier || defaultParkedFrontier(quest, state);
  if (!frontierId) {
    throw new Error(
      'reopen: --frontier <id> is required (no single parked frontier to default to)',
    );
  }
  const assessment = assessReopen(root, quest, frontierId);
  if (!assessment.ok) {
    throw new Error(`reopen refused: ${assessment.reason}`);
  }
  const event = appendEvent(root, id, {
    type: EVENT_FRONTIER_REOPENED,
    frontier: frontierId,
    reason: args.reason,
    invalidSampleCount: assessment.invalidSampleCount,
    contributingEvidence: assessment.contributingEvidence,
  });
  rebuildState(root, quest);
  writeReport(root, id);
  return {questId: id, frontierId, event, assessment};
}

export function runReopenCommand(root, args) {
  const result = reopenFrontier(root, args);
  return [
    `reopened ${result.frontierId} on ${result.questId}`,
    `justified by ${result.assessment.invalidSampleCount} non-measuring ` +
    `sample(s) of ${result.assessment.attempts} attempt(s)`,
    `reason: ${result.event.reason}`,
  ].join('\n') + '\n';
}
