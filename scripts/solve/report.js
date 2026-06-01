// Report projection — the read-only "what happened" surface that replaces sprint
// closure. It is a pure projection of the append-only log + quest: it asserts nothing
// the log does not contain, and it can be regenerated at any time. This is the only
// place a human normally needs to look to see the result of a run.

import fs from 'node:fs';
import path from 'node:path';

import {
  SOLVE_DATA_DIR,
  REPORT_SUBDIR,
  EVENT_ATTEMPT,
  EVENT_QUEST,
  STATUS_SOLVED,
  STATUS_EXHAUSTED,
  STATUS_PARKED,
} from './constants.js';
import {loadQuest, readLog, projectState, assertSafeQuestId} from './store.js';

export function reportFilePath(root, questId) {
  return path.join(root, SOLVE_DATA_DIR, REPORT_SUBDIR,
    `${assertSafeQuestId(questId)}.md`);
}

function frontierLine(f) {
  const metric = f.current === null ? '?' : f.current;
  const base = f.baseline === null ? '?' : f.baseline;
  const reason = f.reason ? ` — ${f.reason}` : '';
  return `- **${f.id}** [${f.status}] rung ${f.rungIndex}, attempts ${f.attempts}, ` +
    `metric ${base} -> ${metric}${reason}`;
}

function findingLines(state) {
  const rows = [];
  for (const f of state.frontiers) {
    for (const finding of f.findings || []) {
      const rules = finding.rulesOut ? ` (rules out: ${finding.rulesOut})` : '';
      const ev = finding.evidence ? ` [${finding.evidence}]` : '';
      rows.push(`- **${f.id}**: ${finding.claim}${rules}${ev}`);
    }
  }
  return rows;
}

function attemptLine(e) {
  const before = e.metricBefore === null ? '?' : e.metricBefore;
  const after = e.metricAfter === null ? '?' : e.metricAfter;
  const moved = e.metricAfter !== null && e.metricBefore !== null &&
    e.metricAfter < e.metricBefore ? 'progress' : 'flat';
  return `| ${e.ts || ''} | ${e.frontier} | ${e.rung} | ${before} -> ${after} ` +
    `| ${moved} | ${e.changeRef || ''} |`;
}

function outcomeBanner(state, log) {
  const questEvent = [...log].reverse().find((e) => e.type === EVENT_QUEST);
  if (!questEvent) return 'IN PROGRESS (no terminal recorded)';
  if (questEvent.status === STATUS_SOLVED) {
    return `SOLVED — evidence: ${questEvent.evidence || '(none)'}`;
  }
  if (questEvent.status === STATUS_EXHAUSTED) {
    const parked = state.frontiers.filter((f) => f.status === STATUS_PARKED);
    return `EXHAUSTED — ${parked.length} frontier(s) parked; human decision needed`;
  }
  return `TERMINAL: ${questEvent.status}`;
}

export function buildReport(quest, log, state) {
  const attempts = log.filter((e) => e.type === EVENT_ATTEMPT);
  const attemptRows = attempts.map(attemptLine);
  const findings = findingLines(state);
  return [
    `# Solve report: ${quest.id}`,
    '',
    `**Goal:** ${quest.statement}`,
    '',
    `**Outcome:** ${outcomeBanner(state, log)}`,
    '',
    `**Attempts:** ${attempts.length}`,
    '',
    '## Frontiers',
    ...state.frontiers.map(frontierLine),
    '',
    '## Findings',
    ...(findings.length > 0 ? findings : ['_(none recorded)_']),
    '',
    '## Attempt log',
    '| ts | frontier | rung | metric | result | change |',
    '| --- | --- | --- | --- | --- | --- |',
    ...attemptRows,
    '',
  ].join('\n');
}

export function writeReport(root, questId) {
  const quest = loadQuest(root, questId);
  const log = readLog(root, questId);
  const state = projectState(quest, log);
  const md = buildReport(quest, log, state);
  const file = reportFilePath(root, questId);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, md);
  return {file, md};
}
