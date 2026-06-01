// Append-only event store for the solver.
//
// The log (`solve/log/<questId>.ndjson`) is the source of truth: one JSON event per
// line, never rewritten. Derived state (`solve/state/<questId>.json`) is a pure fold
// over the log and can be deleted and rebuilt at any time, which keeps the solver
// crash-safe and auditable.

import fs from 'node:fs';
import path from 'node:path';

import {
  SOLVE_DATA_DIR,
  QUESTS_SUBDIR,
  LOG_SUBDIR,
  STATE_SUBDIR,
  EVENT_ATTEMPT,
  EVENT_SOLVED,
  EVENT_PARK,
  EVENT_QUEST,
  EVENT_FINDING,
  STATUS_OPEN,
  STATUS_SOLVED,
  STATUS_PARKED,
  FIRST_RUNG_INDEX,
} from './constants.js';

function ensureDir(dir) {
  fs.mkdirSync(dir, {recursive: true});
}

// A quest id becomes a filename, so it must be a single safe path segment. Reject path
// separators and traversal sequences to prevent writing/reading outside solve/.
const SAFE_GOAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertSafeQuestId(questId) {
  if (typeof questId !== 'string' || !SAFE_GOAL_ID.test(questId) ||
    questId.includes('..')) {
    throw new Error(
      `invalid quest id "${questId}": use letters, digits, '.', '_', '-' ` +
      '(no path separators or "..")');
  }
  return questId;
}

export function questFilePath(root, questId) {
  return path.join(root, SOLVE_DATA_DIR, QUESTS_SUBDIR,
    `${assertSafeQuestId(questId)}.json`);
}

export function logFilePath(root, questId) {
  return path.join(root, SOLVE_DATA_DIR, LOG_SUBDIR,
    `${assertSafeQuestId(questId)}.ndjson`);
}

export function stateFilePath(root, questId) {
  return path.join(root, SOLVE_DATA_DIR, STATE_SUBDIR,
    `${assertSafeQuestId(questId)}.json`);
}

export function loadQuest(root, questId) {
  const file = questFilePath(root, questId);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function saveQuest(root, quest) {
  const file = questFilePath(root, quest.id);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(quest, null, 2)}\n`);
  return file;
}

export function appendEvent(root, questId, event) {
  const file = logFilePath(root, questId);
  ensureDir(path.dirname(file));
  const stamped = {ts: new Date().toISOString(), ...event};
  fs.appendFileSync(file, `${JSON.stringify(stamped)}\n`);
  return stamped;
}

export function readLog(root, questId) {
  const file = logFilePath(root, questId);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function initialFrontierState(frontier) {
  return {
    id: frontier.id,
    status: STATUS_OPEN,
    rungIndex: FIRST_RUNG_INDEX,
    attempts: 0,
    parkedCount: 0,
    baseline: null,
    current: null,
    reason: null,
    findings: [],
  };
}

function applyAttempt(frontierState, event) {
  if (!frontierState) return;
  frontierState.attempts += 1;
  if (frontierState.baseline === null && event.metricBefore !== null) {
    frontierState.baseline = event.metricBefore;
  }
  if (event.metricAfter !== null && event.metricAfter !== undefined) {
    frontierState.current = event.metricAfter;
  }
  if (Number.isInteger(event.rungIndex)) {
    frontierState.rungIndex = event.rungIndex;
  }
}

function applySolved(frontier) {
  if (frontier) frontier.status = STATUS_SOLVED;
}

function applyPark(frontier, event) {
  if (!frontier) return;
  frontier.status = STATUS_PARKED;
  frontier.parkedCount += 1;
  frontier.reason = event.reason || null;
}

function applyFinding(frontier, event) {
  if (!frontier) return;
  frontier.findings.push({
    claim: event.claim || null,
    evidence: event.evidence || null,
    rulesOut: event.rulesOut || null,
    ts: event.ts || null,
  });
}

const FRONTIER_HANDLERS = {
  [EVENT_ATTEMPT]: applyAttempt,
  [EVENT_SOLVED]: applySolved,
  [EVENT_PARK]: applyPark,
  [EVENT_FINDING]: applyFinding,
};

// Fold the append-only log into the current projected state. Pure given the log.
export function projectState(quest, log) {
  const frontiers = new Map(
    quest.frontiers.map((f) => [f.id, initialFrontierState(f)]),
  );
  const questState = {status: STATUS_OPEN, evidence: null};
  for (const event of log) {
    if (event.type === EVENT_QUEST) {
      questState.status = event.status;
      questState.evidence = event.evidence || null;
      continue;
    }
    const handler = FRONTIER_HANDLERS[event.type];
    if (handler) handler(event.frontier ? frontiers.get(event.frontier) : null, event);
  }
  return {
    questId: quest.id,
    questStatus: questState.status,
    questEvidence: questState.evidence,
    frontiers: [...frontiers.values()],
  };
}

export function rebuildState(root, quest) {
  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  const file = stateFilePath(root, quest.id);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

// Append a durable finding for a frontier and return the stamped event. Append-only,
// like every other event: findings are never edited or removed, only superseded by
// later ones.
export function appendFinding(root, questId, finding) {
  return appendEvent(root, questId, {
    type: EVENT_FINDING,
    frontier: finding.frontier,
    claim: finding.claim,
    evidence: finding.evidence || null,
    rulesOut: finding.rulesOut || null,
  });
}

// Read all findings recorded for one frontier, oldest first.
export function readFindings(root, questId, frontierId) {
  return readLog(root, questId)
    .filter((e) => e.type === EVENT_FINDING && e.frontier === frontierId)
    .map((e) => ({
      claim: e.claim || null,
      evidence: e.evidence || null,
      rulesOut: e.rulesOut || null,
      ts: e.ts || null,
    }));
}
