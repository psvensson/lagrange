// park — record an operator-decision terminal for an open frontier.
//
// The altitude reflection (reflection.js) explicitly contemplates "EXHAUST and
// pivot" as its outcome: the frame itself is wrong (refuted premise) or the
// sealed symptom no longer exists on HEAD, so no honest remaining move exists
// within the seal. The autonomous loop can only reach a park by climbing the
// strategy ladder on measured attempts; before this command existed the
// operator decision lived only in reflection notes and commit messages while
// the quest stayed formally OPEN — the frontier board and portfolio kept
// resurfacing work the operator had already retired.
//
// Provenance honesty (mirrors CLOSURE_MEASURED vs CLOSURE_DECISION in
// closure-kind.js): a ladder park is a MEASURED verdict; this park is a
// recorded DECISION. The event carries `provenance: 'operator'` plus a pointer
// to the sanctioning altitude reflection so a reader can never mistake one for
// the other. The command refuses without a prior altitude reflection on the
// quest — the frame-questioning step is the sanctioned trigger for an
// exhaust-and-pivot, and its durable note is the evidence the decision cites.
//
// When the operator park leaves every frontier parked as `exhausted`, the
// quest-level EXHAUSTED terminal is appended too (the same event the loop's
// finish() writes), so `status`/`report`/`frontier` project the true terminal.

import fs from 'node:fs';

import {
  EVENT_PARK,
  EVENT_QUEST,
  EVENT_REFLECTION,
  PARK_KIND_EXHAUSTED,
  STATUS_EXHAUSTED,
  STATUS_OPEN,
  STATUS_PARKED,
} from './constants.js';
import {appendEvent, loadQuest, readLog, projectState, rebuildState} from './store.js';
import {REFLECTION_KIND_ALTITUDE} from './reflection.js';
import {pendingFilePath} from './step.js';
import {writeReport} from './report.js';

export const PARK_PROVENANCE_OPERATOR = 'operator';

// The sanctioning altitude reflection: the most recent frame-questioning note
// recorded on the quest. Its absence means the operator decision was never
// durably reasoned through the sanctioned step, so the park is refused.
function latestAltitudeReflection(log) {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const event = log[i];
    if (event.type === EVENT_REFLECTION &&
        event.kind === REFLECTION_KIND_ALTITUDE) {
      return event;
    }
  }
  return null;
}

function defaultOpenFrontier(state) {
  const open = state.frontiers.filter((f) => f.status === STATUS_OPEN);
  if (open.length === 1) return open[0].id;
  return null;
}

function allFrontiersParkedExhausted(state) {
  return state.frontiers.every(
    (f) => f.status === STATUS_PARKED && f.parkKind === PARK_KIND_EXHAUSTED);
}

export function assessPark(root, quest, frontierId) {
  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  const frontierState = state.frontiers.find((f) => f.id === frontierId);
  if (!frontierState) {
    return {ok: false, reason: `frontier ${frontierId} not found`};
  }
  if (frontierState.status !== STATUS_OPEN) {
    return {
      ok: false,
      reason: `frontier ${frontierId} is ${frontierState.status}, not open`,
    };
  }
  if (fs.existsSync(pendingFilePath(root, quest.id))) {
    return {
      ok: false,
      reason: 'a pending supervised step exists; commit or abort it first ' +
        '(solve step --commit | --abort)',
    };
  }
  const reflection = latestAltitudeReflection(log);
  if (!reflection) {
    return {
      ok: false,
      reason: 'no altitude reflection recorded on this quest; record the ' +
        'frame-questioning decision first (solve reflect --altitude --note ...)',
    };
  }
  return {ok: true, frontierId, reflection, reason: null};
}

export function parkFrontier(root, args = {}) {
  const id = args.id || args._?.[0];
  if (!id) throw new Error('park: --id <questId> is required');
  if (typeof args.reason !== 'string' || args.reason.trim().length === 0) {
    throw new Error('park: --reason <text> is required to justify the park');
  }
  const quest = loadQuest(root, id);
  const state = projectState(quest, readLog(root, id));
  const frontierId = args.frontier || defaultOpenFrontier(state);
  if (!frontierId) {
    throw new Error(
      'park: --frontier <id> is required (no single open frontier to default to)',
    );
  }
  const assessment = assessPark(root, quest, frontierId);
  if (!assessment.ok) {
    throw new Error(`park refused: ${assessment.reason}`);
  }
  const event = appendEvent(root, id, {
    type: EVENT_PARK,
    frontier: frontierId,
    kind: PARK_KIND_EXHAUSTED,
    provenance: PARK_PROVENANCE_OPERATOR,
    reason: args.reason,
    sanctionedBy: {
      type: EVENT_REFLECTION,
      kind: REFLECTION_KIND_ALTITUDE,
      ts: assessment.reflection.ts || null,
    },
  });
  const after = projectState(quest, readLog(root, id));
  const questExhausted = allFrontiersParkedExhausted(after);
  if (questExhausted) {
    appendEvent(root, id, {
      type: EVENT_QUEST,
      status: STATUS_EXHAUSTED,
      evidence: args.evidence || null,
      provenance: PARK_PROVENANCE_OPERATOR,
    });
  }
  rebuildState(root, quest);
  writeReport(root, id);
  return {questId: id, frontierId, event, questExhausted};
}

export function runParkCommand(root, args) {
  const result = parkFrontier(root, args);
  return [
    `parked ${result.frontierId} on ${result.questId} ` +
    `(kind: ${PARK_KIND_EXHAUSTED}, provenance: ${PARK_PROVENANCE_OPERATOR})`,
    `sanctioned by altitude reflection at ${result.event.sanctionedBy.ts}`,
    result.questExhausted ?
      `quest ${result.questId} is now EXHAUSTED (every frontier parked exhausted)` :
      `quest ${result.questId} remains open (other frontiers still active)`,
    `reason: ${result.event.reason}`,
  ].join('\n') + '\n';
}
