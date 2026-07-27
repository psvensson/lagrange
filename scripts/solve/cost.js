// Attempt-cost rollup — what each quest in the window actually cost to run.
//
// meta-friction ranks WHAT fired; this answers WHERE the attempts, rejection
// rounds, and measured wall-clock went, per quest, so a retrospective reads a
// table instead of hand-mining ndjson. Everything here is already in the event
// logs; nothing is measured anew. Telemetry is partial by design (the corpus
// predates it, and only executor/step/attempt paths record it), so measured
// coverage is always shown next to any duration sum — a blank and a zero mean
// opposite things.

import {
  EVENT_ATTEMPT,
  EVENT_FINDING,
  EVENT_SOLVED,
  EVENT_VIOLATION,
} from './constants.js';
import {readFrictionWindow} from './meta-friction.js';
import {loadQuest} from './store.js';

const DEFAULT_WINDOW_DAYS = 7;
const TOP_ROWS = 15;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const UNMEASURED_CELL = '—';
const NEWLINE = '\n';
const VERIFIER_REJECTION_FINDING_KIND = 'verifier-rejection';
const TABLE_HEADER =
  '| quest | attempts | rejections | violations | measured | duration | span | chain |';
const TABLE_RULE = '| --- | --- | --- | --- | --- | --- | --- | --- |';
// Respin-suffix heuristic ONLY — links.parentQuest is authoritative when set.
// Matches the successor-naming conventions observed in the log corpus; a miss
// renders "—", never a wrong chain.
const RESPIN_SUFFIX_PATTERN =
  /-(v\d+|final|verifier-fix|validation-fix|clean-replay)$/u;

function chainBase(questId) {
  let base = questId;
  while (RESPIN_SUFFIX_PATTERN.test(base)) {
    base = base.replace(RESPIN_SUFFIX_PATTERN, '');
  }
  return base;
}

function questRow() {
  return {
    attempts: 0,
    rejections: 0,
    violations: 0,
    measuredAttempts: 0,
    durationMs: 0,
    firstTs: Number.POSITIVE_INFINITY,
    lastTs: Number.NEGATIVE_INFINITY,
    solved: false,
  };
}

export function tallyCostEntries(entries) {
  const byQuest = new Map();
  for (const {questId, event} of entries) {
    const row = byQuest.get(questId) || questRow();
    byQuest.set(questId, row);
    const ts = Date.parse(event?.ts || '');
    if (Number.isFinite(ts)) {
      row.firstTs = Math.min(row.firstTs, ts);
      row.lastTs = Math.max(row.lastTs, ts);
    }
    if (event.type === EVENT_ATTEMPT) {
      row.attempts += 1;
      const duration = event.telemetry?.agentDurationMs;
      if (Number.isFinite(duration)) {
        row.measuredAttempts += 1;
        row.durationMs += duration;
      }
    }
    if (event.type === EVENT_FINDING &&
      event.kind === VERIFIER_REJECTION_FINDING_KIND) {
      row.rejections += 1;
    }
    if (event.type === EVENT_VIOLATION) row.violations += 1;
    if (event.type === EVENT_SOLVED) row.solved = true;
  }
  return byQuest;
}

// Chain label: authoritative parent link first, then the suffix heuristic —
// and the heuristic only claims a chain when another window quest shares the
// base, so a lone "-final" name cannot invent one.
function chainLabel(root, questId, windowQuestIds) {
  let quest = null;
  try {
    quest = loadQuest(root, questId);
  } catch {
    quest = null;
  }
  const parent = quest?.links?.parentQuest;
  if (typeof parent === 'string' && parent) return parent;
  const base = chainBase(questId);
  if (base === questId) return null;
  const hasSibling = [...windowQuestIds].some((id) =>
    id !== questId && chainBase(id) === base);
  return hasSibling ? `${base} (heuristic)` : null;
}

function formatDuration(row) {
  if (!row.measuredAttempts) return UNMEASURED_CELL;
  const seconds = Math.round(row.durationMs / MS_PER_SECOND);
  return seconds >= SECONDS_PER_MINUTE ?
    `${Math.round(seconds / SECONDS_PER_MINUTE)}m` : `${seconds}s`;
}

function formatSpan(row) {
  if (!Number.isFinite(row.firstTs) || !Number.isFinite(row.lastTs) ||
    row.lastTs <= row.firstTs) return UNMEASURED_CELL;
  const minutes = Math.round(
    (row.lastTs - row.firstTs) / MS_PER_SECOND / SECONDS_PER_MINUTE);
  return `${minutes}m`;
}

function measuredColumn(row) {
  if (row.attempts === 0) return UNMEASURED_CELL;
  return `${row.measuredAttempts}/${row.attempts}`;
}

export function buildCostReport(root, {days = DEFAULT_WINDOW_DAYS, now} = {}) {
  const entries = readFrictionWindow(root, {days, now: now ?? Date.now()});
  const byQuest = tallyCostEntries(entries);
  const windowQuestIds = new Set(byQuest.keys());
  const rows = [...byQuest.entries()]
    .map(([questId, row]) => ({
      questId,
      ...row,
      chain: chainLabel(root, questId, windowQuestIds),
    }))
    .sort((a, b) => b.attempts - a.attempts ||
      b.rejections - a.rejections || a.questId.localeCompare(b.questId));
  return {days, rows};
}

export function renderCostReport(report) {
  const {days, rows} = report;
  const active = rows.filter((row) =>
    row.attempts > 0 || row.rejections > 0 || row.violations > 0);
  const lines = [
    `# Attempt cost — last ${days} day(s), ` +
      `${active.length} quest(s) with recorded work`,
    '',
  ];
  if (active.length === 0) {
    lines.push('No attempts, rejections, or violations in the window.', '');
    return lines.join(NEWLINE);
  }
  lines.push(TABLE_HEADER, TABLE_RULE);
  for (const row of active.slice(0, TOP_ROWS)) {
    lines.push(`| ${row.questId} | ${row.attempts} | ${row.rejections} | ` +
      `${row.violations} | ${measuredColumn(row)} | ${formatDuration(row)} | ` +
      `${formatSpan(row)} | ${row.chain || UNMEASURED_CELL} |`);
  }
  lines.push('');
  if (active.length > TOP_ROWS) {
    lines.push(`> ${active.length - TOP_ROWS} further quest(s) not shown ` +
      `(showing the top ${TOP_ROWS} by attempts).`, '');
  }
  const totals = active.reduce((sum, row) => ({
    attempts: sum.attempts + row.attempts,
    rejections: sum.rejections + row.rejections,
    measured: sum.measured + row.measuredAttempts,
  }), {attempts: 0, rejections: 0, measured: 0});
  lines.push(`> Totals: ${totals.attempts} attempt(s), ` +
    `${totals.rejections} verifier rejection round(s); telemetry measured on ` +
    `${totals.measured}/${totals.attempts} attempt(s).`, '');
  const chains = active.filter((row) => row.chain);
  if (chains.length > 0) {
    lines.push(`> ${chains.length} quest(s) are respin-chain members — ` +
      'duplicated declaration/verification ceremony; see the chain column.', '');
  }
  return lines.join(NEWLINE);
}

export function runCostCommand(root, args = {}) {
  const days = Number(args.days) > 0 ? Number(args.days) : DEFAULT_WINDOW_DAYS;
  return renderCostReport(buildCostReport(root, {days}));
}
