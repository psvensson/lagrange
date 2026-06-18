// Work overview — the top-down "what's going on?" surface.
//
// `solve status` answers "where is THIS quest?"; `portfolio` answers "what is the
// class/outcome mix across quests?"; `frontier` answers "which closure records and
// open quests need attention?". None of them walk the *planning hierarchy* the way
// an operator reasons about the work: roadmap row → epic → spec → quest → attempt,
// with the closure ledger tracking cross-quest invariants alongside. This command
// renders that vertical stack from live data so a reader can orient in one screen
// instead of reassembling it from five places.
//
// Like every read surface it is a pure projection of the sealed quest files, the
// epic/spec planning docs, and the closure ledger. It asserts nothing those
// sources do not already contain, and (writing no wall-clock time) repeated writes
// with no state change produce a byte-identical board.

import fs from 'node:fs';
import path from 'node:path';

import {SOLVE_DATA_DIR} from './constants.js';
import {parseClosureLedger, concernArea} from '../closure-ledger-state.js';
import {buildPortfolio, loadAllQuests} from './portfolio.js';

const EPICS_DIR = '.kiro/epics';
const SPECS_DIR = '.kiro/specs';
// Planning-tier scaffolding that is not itself an epic / spec.
const EPIC_SKIP = new Set(['README.md', '_template.md']);
const SPEC_SKIP = new Set(['archived']);

// The generated board lives alongside the quest data; the `.generated.` infix
// mirrors FRONTIER.generated.md and signals "do not hand-edit — run
// `solve overview --write`".
export function overviewFilePath(root) {
  return path.join(root, SOLVE_DATA_DIR, 'OVERVIEW.generated.md');
}

function normLink(value) {
  return !value || value === 'null' ? null : value;
}

// Parse one epic markdown file. Front-matter (id/roadmapRow/status/graduatesTo) is
// optional — the first epics predate the template — so fall back to the `#`
// heading for a title and leave unknown fields null.
function readEpic(file) {
  const text = fs.readFileSync(file, 'utf8');
  const front = {};
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.+)$/);
      if (kv) front[kv[1]] = kv[2].trim();
    }
  }
  const heading = text.match(/^#\s+(.+)$/m);
  const base = path.basename(file, '.md');
  const title = (front.title || (heading ? heading[1] : base)).replace(/^Epic:\s*/i, '').trim();
  return {
    id: front.id || base,
    title,
    status: front.status || 'unknown',
    roadmapRow: normLink(front.roadmapRow),
    graduatesTo: normLink(front.graduatesTo),
  };
}

function loadEpics(root) {
  const dir = path.join(root, EPICS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.md') && !EPIC_SKIP.has(name))
    .sort()
    .map((name) => readEpic(path.join(dir, name)));
}

function listSpecs(root) {
  const dir = path.join(root, SPECS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && !SPEC_SKIP.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

// Decorate each portfolio row with the quest's optional `links` block so the board
// can group quests under the spec / roadmap row they cite. buildPortfolio rows do
// not carry links, so read them from the sealed quest files.
function linkedQuests(root, portfolio) {
  const rowById = new Map(portfolio.rows.map((row) => [row.id, row]));
  return loadAllQuests(root).map((quest) => {
    const links = quest.links || {};
    const row = rowById.get(quest.id) || {};
    return {
      id: quest.id,
      class: row.class,
      outcome: row.outcome,
      open: Boolean(row.open),
      attempts: row.attempts,
      reopens: row.reopens,
      autoReopens: row.autoReopens || 0,
      specRef: typeof links.specRef === 'string' ? links.specRef : null,
      roadmapRow: links.roadmapRow || null,
      closesCL: Array.isArray(links.closesCL) ? links.closesCL : [],
    };
  });
}

export function buildOverview(root) {
  const portfolio = buildPortfolio(root);
  const quests = linkedQuests(root, portfolio);
  const epics = loadEpics(root);
  const specs = listSpecs(root).map((name) => {
    // A quest cites a spec by name with optional `#task` suffix, so match by prefix
    // exactly as `solve trace --spec` does.
    const matched = quests.filter((quest) => quest.specRef && quest.specRef.startsWith(name));
    const open = matched.filter((q) => q.open).length;
    return {name, quests: matched, open, total: matched.length};
  });
  // Roadmap rows in play: any row cited by an epic or a quest.
  const rows = new Map();
  const touchRow = (id) => {
    if (!id) return null;
    if (!rows.has(id)) rows.set(id, {id, epics: [], quests: []});
    return rows.get(id);
  };
  for (const epic of epics) touchRow(epic.roadmapRow)?.epics.push(epic.id);
  for (const quest of quests) touchRow(quest.roadmapRow)?.quests.push(quest.id);
  return {
    roadmapRows: [...rows.values()].sort((a, b) => a.id.localeCompare(b.id)),
    epics,
    specs,
    quests,
    records: parseClosureLedger(),
  };
}

// Coerce a cell to a single-line, table-safe string. Long ledger concerns can
// carry newlines or `|`, which would otherwise break the markdown table.
function cell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
  return text || '—';
}

// Render a markdown table with columns padded to a uniform width so the pipes
// line up in plain-text / monospace view (the stdout and the written board are
// both read raw, not only as rendered markdown).
function table(header, rows) {
  if (rows.length === 0) return ['_(none)_', ''];
  const body = rows.map((cells) => header.map((_, i) => cell(cells[i])));
  const widths = header.map((head, i) =>
    Math.max(head.length, ...body.map((cells) => cells[i].length)));
  const row = (cells) =>
    `| ${cells.map((text, i) => text.padEnd(widths[i])).join(' | ')} |`;
  const separator = `| ${widths.map((w) => '-'.repeat(Math.max(3, w))).join(' | ')} |`;
  return [row(header), separator, ...body.map(row), ''];
}

// Render the active closure records grouped by subsystem (concern area), with a
// one-line area tally up top so the spread of open invariants reads at a glance.
function closureFrontierByArea(active) {
  if (active.length === 0) return ['_(no active closure records)_', ''];
  const byArea = new Map();
  for (const record of active) {
    const area = concernArea(record.concern);
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push(record);
  }
  const areas = [...byArea.keys()].sort();
  const tally = areas.map((area) => `${area} (${byArea.get(area).length})`).join(' · ');
  const lines = [`Areas: ${tally}`, ''];
  for (const area of areas) {
    const records = byArea.get(area).sort((a, b) => a.id.localeCompare(b.id));
    lines.push(`### ${area} — ${records.length}`, '');
    lines.push(...table(['id', 'status', 'last gate', 'concern'],
      records.map((r) => [r.id, r.status, r.lastGate || '—', r.concern || '—'])));
  }
  return lines;
}

export function renderOverview(overview) {
  const {roadmapRows, epics, specs, quests, records} = overview;
  const open = quests.filter((q) => q.open);
  const terminal = quests.filter((q) => !q.open);
  const active = records.filter((r) => r.active);
  const specsWithOpen = specs.filter((s) => s.open > 0).length;
  const lines = [
    '# Work overview — top-down',
    '',
    'Hierarchy: roadmap → epic → spec → quest → attempt, with the closure ledger',
    'tracking cross-quest invariants alongside. Roadmap / epic / spec / ledger are',
    'static documents you read; the **Quest log is the only moving part**, and a',
    'Quest closes only by the Solver terminal state (SOLVED / EXHAUSTED). This is a',
    'projection — act on a record only after reading its file.',
    '',

    `## 1 · Roadmap rows in play — ${roadmapRows.length}`,
    '_Scope authority (roadmap.md). A row is in play when an epic or quest cites it via links.roadmapRow._',
    '',
    ...(roadmapRows.length === 0 ?
      ['> No epic or quest cites a roadmap row yet (links.roadmapRow is optional and unset).', ''] :
      table(['row', 'epics', 'quests'], roadmapRows.map((r) =>
        [r.id, r.epics.join(', ') || '—', r.quests.join(', ') || '—']))),

    `## 2 · Epics — ${epics.length}`,
    '_Lightweight planning above specs (.kiro/epics/) — sharpen intent before a sealed doneWhen exists._',
    '',
    ...table(['id', 'status', 'roadmapRow', 'graduatesTo'],
      epics.map((e) => [e.id, e.status, e.roadmapRow || '—', e.graduatesTo || '—'])),

    `## 3 · Specs — ${specs.length} (${specsWithOpen} with open quests)`,
    '_Detailed planning (.kiro/specs/): design + requirements + tasks. Implemented by quests, not a closure surface._',
    '',
    ...table(['spec', 'quests (open/total)', 'quest ids'],
      specs.map((s) => [s.name, `${s.open}/${s.total}`, s.quests.map((q) => q.id).join(', ') || '—'])),

    `## 4 · Quests — ${open.length} open / ${terminal.length} terminal`,
    '_The only measured layer (solve/quests/). Sealed goal; attempts and findings live in the append-only log._',
    '',
    '### Open',
    '',
    ...table(['id', 'class', 'spec', 'attempts', 'reopens', 'osc', 'closes'],
      open.map((q) => [q.id, q.class, q.specRef || '—', q.attempts, q.reopens,
        q.autoReopens, q.closesCL.join(', ') || '—'])),
    '### Terminal',
    '',
    ...table(['id', 'class', 'outcome', 'attempts'],
      terminal.map((q) => [q.id, q.class, q.outcome, q.attempts])),

    `## 5 · Closure frontier — ${active.length} active of ${records.length}`,
    '_Cross-quest invariant tracking (closure-ledger/CL-###), grouped by subsystem. ' +
    'Quests claim these via links.closesCL._',
    '',
    ...closureFrontierByArea(active),

    '---',
    'Drill in: `npm run solve:status -- --id <q>` · `npm run trace -- --spec <s>` · ' +
    '`npm run solve:report -- --id <q>` · `npm run frontier`',
  ];
  return lines.join('\n');
}

export function runOverviewCommand(root) {
  return `${renderOverview(buildOverview(root))}\n`;
}

// Persist the board to solve/OVERVIEW.generated.md (a pure projection, no
// wall-clock time, so byte-stable across no-op writes). Returns the written path.
export function writeOverview(root, markdown) {
  const file = overviewFilePath(root);
  const md = typeof markdown === 'string' ? markdown : runOverviewCommand(root);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, md);
  return file;
}
