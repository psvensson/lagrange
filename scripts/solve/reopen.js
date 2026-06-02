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

import path from 'node:path';

import {
  EVENT_ATTEMPT,
  EVENT_FRONTIER_REOPENED,
  STATUS_PARKED,
} from './constants.js';
import {appendEvent, loadQuest, readLog, projectState, rebuildState} from './store.js';
import {reportSampleIsNonMeasuring} from './probes/scenario-harness.js';
import {writeReport} from './report.js';

function harnessArgs(frontierDef) {
  const metric = frontierDef && frontierDef.metric;
  if (!metric || metric.probe !== 'scenario-harness') return null;
  return metric.args || {};
}

// Decide, from sealed evidence only, whether one attempt on the frontier was a
// non-measuring sample. A post-fix attempt carries invalidSample directly; a pre-fix
// attempt is re-classified by reading its evidence report through the shared harness
// classifier so historical parks are judged by today's honest definition.
function attemptIsInvalid(root, attempt, args) {
  if (attempt.invalidSample === true) return true;
  if (!args || !attempt.evidence) return false;
  return reportSampleIsNonMeasuring(path.join(root, attempt.evidence), args);
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
  const args = harnessArgs(frontierDef);
  const attempts = log.filter((e) =>
    e.type === EVENT_ATTEMPT && e.frontier === frontierId);
  const invalidAttempts = attempts.filter((a) => attemptIsInvalid(root, a, args));
  return {
    ok: invalidAttempts.length > 0,
    frontierId,
    attempts: attempts.length,
    invalidSampleCount: invalidAttempts.length,
    contributingEvidence: invalidAttempts.map((a) => a.evidence).filter(Boolean),
    reason: invalidAttempts.length > 0 ?
      null :
      `frontier ${frontierId} parked on honestly-measured attempts ` +
      '(no non-measuring samples); reopen refused to protect the exhaustion verdict',
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
