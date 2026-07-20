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
  PARK_PROVENANCE_OPERATOR,
  STATUS_EXHAUSTED,
  STATUS_OPEN,
  STATUS_PARKED,
} from './constants.js';
import {appendEvent, loadQuest, readLog, projectState, rebuildState} from './store.js';
import {REFLECTION_KIND_ALTITUDE} from './reflection.js';
import {pendingFilePath} from './step.js';
import {writeReport} from './report.js';
import {buildEvidenceIdentity} from './evidence-identity.js';

export {PARK_PROVENANCE_OPERATOR};

const PARK_ERROR_PENDING_STEP =
  'a pending supervised step exists; commit or abort it first ' +
  '(solve step --commit | --abort)';
const PARK_ERROR_ALTITUDE_REFLECTION_REQUIRED =
  'no altitude reflection recorded on this quest; record the ' +
  'frame-questioning decision first (solve reflect --altitude --note ...)';
const PARK_ERROR_QUEST_ID_REQUIRED = 'park: --id <questId> is required';
const PARK_ERROR_REASON_REQUIRED =
  'park: --reason <text> is required to justify the park';
const PARK_ERROR_FRONTIER_REQUIRED =
  'park: --frontier <id> is required (no single open frontier to default to)';
const PARK_ERROR_EVIDENCE_REQUIRED =
  'park: --evidence must name a non-empty evidence path';
const PARK_ERROR_EVIDENCE_MISSING = 'park evidence file not found';
const PARK_OUTPUT_NEWLINE = '\n';
const ABSENT_PARK_EXPLANATION = null;

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

function parkTerminalEvidence(root, quest, evidence) {
  if (evidence === undefined || evidence === null) {
    return {evidence: null};
  }
  if (typeof evidence !== 'string' || evidence.trim().length === 0) {
    throw new Error(PARK_ERROR_EVIDENCE_REQUIRED);
  }
  const evidenceIdentity = buildEvidenceIdentity(root, evidence, {
    probe: quest.doneWhen?.probe || null,
    args: quest.doneWhen?.args || null,
  });
  if (evidenceIdentity.exists !== true) {
    throw new Error(`${PARK_ERROR_EVIDENCE_MISSING}: ${evidence}`);
  }
  return {
    evidence,
    evidenceIdentity,
    evidenceFingerprint: evidenceIdentity.fingerprint,
  };
}

export function assessPark(root, quest, frontierId) {
  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  const frontierState = state.frontiers.find((f) => f.id === frontierId);
  let explanation = ABSENT_PARK_EXPLANATION;
  if (!frontierState) {
    explanation = `frontier ${frontierId} not found`;
  } else if (frontierState.status !== STATUS_OPEN) {
    explanation =
      `frontier ${frontierId} is ${frontierState.status}, not open`;
  } else if (fs.existsSync(pendingFilePath(root, quest.id))) {
    explanation = PARK_ERROR_PENDING_STEP;
  }
  const reflection = latestAltitudeReflection(log);
  if (!explanation && !reflection) {
    explanation = PARK_ERROR_ALTITUDE_REFLECTION_REQUIRED;
  }
  if (explanation) {
    return {
      ok: false,
      reason: explanation,
    };
  }
  return {
    ok: true,
    frontierId,
    reflection,
    reason: ABSENT_PARK_EXPLANATION,
  };
}

// Completion path: every frontier is already parked exhausted (typically by
// the autonomous ladder, whose per-frontier park does not append the
// quest-level terminal) but the quest still projects OPEN. The operator park
// then has no open frontier to act on, yet the honest terminal is exactly the
// quest-level EXHAUSTED event — appended under the same altitude-reflection
// sanction and falsifiable reason as a frontier park.
function completeExhaustedTerminal(root, quest, state, args) {
  const log = readLog(root, quest.id);
  const reflection = latestAltitudeReflection(log);
  if (!reflection) {
    throw new Error(`park refused: ${PARK_ERROR_ALTITUDE_REFLECTION_REQUIRED}`);
  }
  const terminalEvidence = parkTerminalEvidence(root, quest, args.evidence);
  appendEvent(root, quest.id, {
    type: EVENT_QUEST,
    status: STATUS_EXHAUSTED,
    ...terminalEvidence,
    provenance: PARK_PROVENANCE_OPERATOR,
    reason: args.reason,
    sanctionedBy: {
      type: EVENT_REFLECTION,
      kind: REFLECTION_KIND_ALTITUDE,
      ts: reflection.ts || null,
    },
  });
  rebuildState(root, quest);
  writeReport(root, quest.id);
  return {
    questId: quest.id,
    frontierId: null,
    event: {sanctionedBy: {ts: reflection.ts || null}, reason: args.reason},
    questExhausted: true,
  };
}

export function parkFrontier(root, args = {}) {
  const id = args.id || args._?.[0];
  if (!id) throw new Error(PARK_ERROR_QUEST_ID_REQUIRED);
  if (typeof args.reason !== 'string' || args.reason.trim().length === 0) {
    throw new Error(PARK_ERROR_REASON_REQUIRED);
  }
  const quest = loadQuest(root, id);
  const state = projectState(quest, readLog(root, id));
  const frontierId = args.frontier || defaultOpenFrontier(state);
  if (!frontierId) {
    if (state.questStatus === STATUS_OPEN &&
        state.frontiers.length > 0 &&
        allFrontiersParkedExhausted(state)) {
      return completeExhaustedTerminal(root, quest, state, args);
    }
    throw new Error(PARK_ERROR_FRONTIER_REQUIRED);
  }
  const assessment = assessPark(root, quest, frontierId);
  if (!assessment.ok) {
    throw new Error(`park refused: ${assessment.reason}`);
  }
  const terminalEvidence = parkTerminalEvidence(root, quest, args.evidence);
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
      ...terminalEvidence,
      provenance: PARK_PROVENANCE_OPERATOR,
    });
  }
  rebuildState(root, quest);
  writeReport(root, id);
  return {questId: id, frontierId, event, questExhausted};
}

export function runParkCommand(root, args) {
  const result = parkFrontier(root, args);
  const headline = result.frontierId ?
    `parked ${result.frontierId} on ${result.questId} ` +
    `(kind: ${PARK_KIND_EXHAUSTED}, provenance: ${PARK_PROVENANCE_OPERATOR})` :
    `completed quest-level terminal on ${result.questId} ` +
    '(every frontier already parked exhausted)';
  return [
    headline,
    `sanctioned by altitude reflection at ${result.event.sanctionedBy.ts}`,
    result.questExhausted ?
      `quest ${result.questId} is now EXHAUSTED (every frontier parked exhausted)` :
      `quest ${result.questId} remains open (other frontiers still active)`,
    `reason: ${result.event.reason}`,
  ].join(PARK_OUTPUT_NEWLINE) + PARK_OUTPUT_NEWLINE;
}
