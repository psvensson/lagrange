// Frontier board — the one-call "where is everything right now?" surface.
//
// Boot orientation in this repo otherwise means reassembling state from four
// places: the convergence-work-handoff memory, the hand-maintained
// closure-ledger.md index, 38 per-record CL files, and the git ledger: stream.
// This command collapses the machine-readable parts into one screen: the active
// closure frontier (CL records needing attention), the status-drift worklist,
// and the open quests with their outcome. It asserts nothing the ledger and the
// append-only quest logs do not already contain.

import fs from 'node:fs';
import path from 'node:path';

import {SOLVE_DATA_DIR} from './constants.js';
import {parseClosureLedger, concernArea} from '../closure-ledger-state.js';
import {buildPortfolio, loadAllQuests} from './portfolio.js';

const ACTIVE_GATE_PREVIEW = 8;

// The generated board lives alongside the quest data. The `.generated.` infix
// mirrors closure-ledger.generated.md and signals "do not hand-edit — run
// `solve frontier --write`".
export function frontierFilePath(root) {
  return path.join(root, SOLVE_DATA_DIR, 'FRONTIER.generated.md');
}

function renderClosureFrontier(records) {
  const active = records.filter((r) => r.active);
  const drifted = records.filter((r) => r.drift);
  const lines = [
    `## Closure frontier — ${active.length} active of ${records.length} records`,
    '',
  ];
  if (active.length === 0) {
    lines.push('_(no active closure records)_', '');
  } else {
    const byArea = new Map();
    for (const r of active) {
      const area = concernArea(r.concern);
      if (!byArea.has(area)) byArea.set(area, []);
      byArea.get(area).push(r);
    }
    const areas = [...byArea.keys()].sort();
    lines.push(`Areas: ${areas.map((a) => `${a} (${byArea.get(a).length})`).join(' · ')}`, '');
    for (const area of areas) {
      lines.push(`### ${area}`, '', '| Id | Status | Last gate | Concern |',
        '| --- | --- | --- | --- |');
      for (const r of byArea.get(area).sort((a, b) => a.id.localeCompare(b.id))) {
        lines.push(
          `| ${r.id} | ${r.status} | ${r.lastGate || '—'} | ${r.concern || '—'} |`);
      }
      lines.push('');
    }
  }
  if (drifted.length > 0) {
    lines.push(
      `> ${drifted.length} record(s) drift from the index ` +
      `(${drifted.map((r) => r.id).join(', ')}) — WS8.1 normalization worklist; ` +
      'see `node scripts/closure-ledger-state.js`.', '');
  }
  return lines;
}

// An open quest is flagged stale when its last log event is more than this many
// days behind the NEWEST last-event among open quests — not behind wall-clock
// now. Anchoring on the portfolio's own newest event keeps the board a pure
// projection (repeated writes with no state change stay byte-identical) while
// still exposing quests the active work has left behind. A stale flag is a
// worklist signal: park it, reseal it narrower, or record why it stays open.
export const STALE_OPEN_QUEST_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function renderOpenQuests(portfolio, closesById) {
  const open = portfolio.rows.filter((r) => r.open);
  const lines = [`## Open quests — ${open.length}`, ''];
  if (open.length === 0) {
    lines.push('_(no open quests)_', '');
    return lines;
  }
  const newestMs = Math.max(...open.map((r) => Date.parse(r.lastEventTs || '') || 0));
  const stale = (r) => {
    const ms = Date.parse(r.lastEventTs || '');
    return Number.isFinite(ms) && newestMs - ms > STALE_OPEN_QUEST_DAYS * DAY_MS;
  };
  const staleCount = open.filter(stale).length;
  lines.push('| id | class | attempts | reopens | last event | closes |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of open) {
    const closes = (closesById.get(r.id) || []).join(', ') || '—';
    const lastEvent = r.lastEventTs ?
      `${r.lastEventTs.slice(0, 10)}${stale(r) ? ' ⚠ stale' : ''}` : '—';
    lines.push(
      `| ${r.id} | ${r.class} | ${r.attempts} | ${r.reopens} | ${lastEvent} | ${closes} |`);
  }
  lines.push('');
  if (staleCount > 0) {
    lines.push(
      `> ${staleCount} open quest(s) are ⚠ stale (last event more than ` +
      `${STALE_OPEN_QUEST_DAYS} days behind the newest open-quest event): ` +
      'each needs an explicit decision — park it, reseal it narrower, or ' +
      'record on the quest why it stays open.', '');
  }
  return lines;
}

export function buildFrontier(root) {
  const records = parseClosureLedger();
  const portfolio = buildPortfolio(root);
  // Join each quest's optional links.closesCL onto its row so the board shows
  // which closure records an open quest is on the hook for. buildPortfolio rows
  // do not carry links, so read them from the sealed quest files.
  const closesById = new Map();
  for (const quest of loadAllQuests(root)) {
    const closes = (quest.links || {}).closesCL;
    if (Array.isArray(closes) && closes.length > 0) closesById.set(quest.id, closes);
  }
  const gates = records
    .map((r) => r.lastGate)
    .filter((g) => g && /^\d{8}T/.test(g))
    .sort()
    .slice(-ACTIVE_GATE_PREVIEW);
  return {records, portfolio, closesById, latestGate: gates.at(-1) || null};
}

export function renderFrontier({records, portfolio, closesById, latestGate}) {
  return [
    '# Frontier board',
    '',
    `Latest dated gate seen in records: ${latestGate || '—'}. ` +
    'This is a projection; act on a record only after reading its file.',
    '',
    ...renderClosureFrontier(records),
    ...renderOpenQuests(portfolio, closesById || new Map()),
  ].join('\n');
}

export function runFrontierCommand(root) {
  return `${renderFrontier(buildFrontier(root))}\n`;
}

// Persist the board to solve/FRONTIER.generated.md. The content is a pure
// projection (no wall-clock time) so repeated writes with no state change produce
// a byte-identical file. Returns the written path.
export function writeFrontier(root, markdown) {
  const file = frontierFilePath(root);
  const md = typeof markdown === 'string' ? markdown : runFrontierCommand(root);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, md);
  return file;
}
