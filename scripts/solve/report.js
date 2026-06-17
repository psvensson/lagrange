// Report projection — the read-only "what happened" surface for Quest closure.
// It is a pure projection of the append-only log + quest: it asserts nothing
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
  PARK_KIND_CANNOT_MEASURE,
} from './constants.js';
import {loadQuest, readLog, projectState, assertSafeQuestId} from './store.js';
import {questClass, closureKind} from './closure-kind.js';
import {
  buildCurrentBlocker,
  renderCurrentBlocker,
} from './current-blocker.js';
import {analyzeScopePressure, renderScopePressure} from './scope-pressure.js';
import {analyzeQuestHealth} from './health.js';

export function reportFilePath(root, questId) {
  return path.join(root, SOLVE_DATA_DIR, REPORT_SUBDIR,
    `${assertSafeQuestId(questId)}.md`);
}

function frontierLine(f) {
  const metric = f.current === null ? '?' : f.current;
  const base = f.baseline === null ? '?' : f.baseline;
  const reason = f.reason ? ` — ${f.reason}` : '';
  const kind = f.status === STATUS_PARKED && f.parkKind ? ` {${f.parkKind}}` : '';
  const reopened = f.reopenCount ? `, reopened ${f.reopenCount}` : '';
  return `- **${f.id}** [${f.status}${kind}] rung ${f.rungIndex}, ` +
    `attempts ${f.attempts}${reopened}, metric ${base} -> ${metric}${reason}`;
}

// Render the optional `links` block. Returns [] when the quest declares no links
// (so legacy reports without a Links section are byte-for-byte unchanged).
function linkLines(quest) {
  const links = quest.links || {};
  const rows = [];
  if (links.roadmapRow) rows.push(`- roadmap row: ${links.roadmapRow}`);
  if (links.specRef) rows.push(`- spec: ${links.specRef}`);
  if (Array.isArray(links.closesCL) && links.closesCL.length > 0) {
    rows.push(`- closes: ${links.closesCL.join(', ')}`);
  }
  if (links.parentQuest) rows.push(`- parent quest: ${links.parentQuest}`);
  if (links.planDoc) rows.push(`- plan: ${links.planDoc}`);
  if (rows.length === 0) return [];
  return ['## Links', ...rows, ''];
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
    `| ${moved} | ${e.blockerMovement || ''} | ${e.theoryRef || ''} ` +
    `| ${e.changeRef || ''} |`;
}

function outcomeBanner(state, log, quest) {
  const questEvent = [...log].reverse().find((e) => e.type === EVENT_QUEST);
  if (!questEvent) return 'IN PROGRESS (no terminal recorded)';
  if (questEvent.status === STATUS_SOLVED) {
    return `SOLVED (${closureKind(quest, log)}) — evidence: ${questEvent.evidence || '(none)'}`;
  }
  if (questEvent.status === STATUS_EXHAUSTED) {
    const parked = state.frontiers.filter((f) => f.status === STATUS_PARKED);
    const cannotMeasure = parked.filter(
      (f) => f.parkKind === PARK_KIND_CANNOT_MEASURE).length;
    const suffix = cannotMeasure > 0 ?
      ` (${cannotMeasure} cannot-measure: fix the harness, then reopen)` : '';
    return `EXHAUSTED — ${parked.length} frontier(s) parked; ` +
      `human decision needed${suffix}`;
  }
  return `TERMINAL: ${questEvent.status}`;
}

function theoryLine(theory) {
  const frontier = theory.frontier ? `, frontier ${theory.frontier}` : '';
  const layer = theory.layer ? `, layer ${theory.layer}` : '';
  const archive = theory.archive ? ', archive' : '';
  const owner = theory.owner ? `, owner ${theory.owner}` : '';
  const boundary = theory.boundary ? `, boundary ${theory.boundary}` : '';
  const modelGate = theory.modelGuidance ?
    `, modelGate ${theory.modelGuidance.command}` :
    '';
  return `- **${theory.id}** [${theory.status}] ${theory.scope}${frontier}` +
    `${layer}, mechanism ${theory.mechanism || 'unknown'}${owner}${boundary}` +
    `${modelGate}${archive}`;
}

function selectedTheoryLines(state) {
  const rows = Object.entries(state.theories?.selectedByFrontier || {});
  if (rows.length === 0) return ['_(none selected)_'];
  return rows.map(([frontier, theory]) => `- **${frontier}**: ${theory}`);
}

function theoryResultLines(state) {
  const theories = [
    ...(state.theories?.system || []),
    ...(state.theories?.frontier || []),
  ];
  const rows = [];
  for (const theory of theories) {
    for (const result of theory.results || []) {
      const details = [
        result.scenarioOutcome ? `scenario=${result.scenarioOutcome}` : null,
        result.theoryOutcome ? `theory=${result.theoryOutcome}` : null,
        result.blockerMovement ? `movement=${result.blockerMovement}` : null,
      ].filter(Boolean);
      rows.push(
        `- **${theory.id}**: ${result.result} ` +
        `${details.length > 0 ? `(${details.join(', ')}) ` : ''}` +
        `${result.evidence ? `[${result.evidence}]` : ''}`,
      );
    }
  }
  return rows.length > 0 ? rows : ['_(none recorded)_'];
}

export function buildReport(quest, log, state, root = process.cwd()) {
  const attempts = log.filter((e) => e.type === EVENT_ATTEMPT);
  const attemptRows = attempts.map(attemptLine);
  const findings = findingLines(state);
  const currentBlocker = buildCurrentBlocker({quest, log, state});
  const scopePressure = analyzeScopePressure(root, quest, log);
  const health = analyzeQuestHealth(root, quest, {state});
  const theories = [
    ...(state.theories?.system || []),
    ...(state.theories?.frontier || []),
  ];
  return [
    `# Solve report: ${quest.id}`,
    '',
    `**Goal:** ${quest.statement}`,
    '',
    `**Class:** ${questClass(quest)} · **Closure:** ${closureKind(quest, log)}`,
    '',
    `**Outcome:** ${outcomeBanner(state, log, quest)}`,
    '',
    `**Attempts:** ${attempts.length}`,
    '',
    ...linkLines(quest),
    ...renderCurrentBlocker(currentBlocker),
    '',
    '## Continuation',
    `- Status: ${health.continuation?.status || 'allowed'}`,
    `- Next action: ${health.nextAction}`,
    ...(health.continuation?.problems?.length > 0 ?
      health.continuation.problems.map((item) => `- Blocker: ${item}`) :
      ['- Blocker: none']),
    '',
    ...renderScopePressure(scopePressure),
    '',
    '## Frontiers',
    ...state.frontiers.map(frontierLine),
    '',
    '## Findings',
    ...(findings.length > 0 ? findings : ['_(none recorded)_']),
    '',
    '## Theories',
    ...(theories.length > 0 ? theories.map(theoryLine) : ['_(none recorded)_']),
    '',
    '## Selected Theories',
    ...selectedTheoryLines(state),
    '',
    '## Theory Results',
    ...theoryResultLines(state),
    '',
    '## Attempt log',
    '| ts | frontier | rung | metric | result | blocker movement | theory | change |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...attemptRows,
    '',
  ].join('\n');
}

export function writeReportForQuest(root, quest) {
  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  const md = buildReport(quest, log, state, root);
  const file = reportFilePath(root, quest.id);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, md);
  const latestLogTime = log.length > 0 ?
    new Date(log[log.length - 1].ts).getTime() :
    NaN;
  if (Number.isFinite(latestLogTime)) {
    const reportTime = new Date(latestLogTime + 2);
    fs.utimesSync(file, reportTime, reportTime);
  }
  return {file, md};
}

export function writeReport(root, questId) {
  return writeReportForQuest(root, loadQuest(root, questId));
}
