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
import {parseClosureLedger, closureLedgerPaths, concernArea}
  from '../closure-ledger-state.js';
import {buildPortfolio, loadAllQuests} from './portfolio.js';

const EPICS_DIR = 'solve/epics';
const SPECS_DIR = 'solve/specs';
// Planning-tier scaffolding that is not itself an epic / spec.
const EPIC_SKIP = new Set(['README.md', '_template.md']);
const SPEC_SKIP = new Set(['archived']);
const EPIC_STAGE_FRAMING = 'framing';
const EPIC_STAGE_LINKED_SPEC = 'linked-spec';
const EPIC_STAGE_LINKED_DRAFT = 'linked-draft';
const EPIC_STAGE_LINKED_OPEN = 'linked-open';
const EPIC_STAGE_LINKED_TERMINAL = 'linked-terminal';

// This local board lives alongside the Quest data and is ignored by Git because
// recording an attempt changes the state it projects. Regenerate it on demand.
export function overviewFilePath(root) {
  return path.join(root, SOLVE_DATA_DIR, 'OVERVIEW.generated.md');
}

function normLink(value) {
  return !value || value === 'null' ? null : value;
}

// Parse one epic markdown file. Front-matter (id/roadmapRow/graduatesTo) is
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
    file: `${EPICS_DIR}/${path.basename(file)}`,
    title,
    contractVersion: Number(front.epicContractVersion) || null,
    legacyStatus: front.status || null,
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
      stage: row.stage,
      outcome: row.outcome,
      draft: Boolean(row.draft),
      open: Boolean(row.open),
      attempts: row.attempts,
      reopens: row.reopens,
      autoReopens: row.autoReopens || 0,
      planDoc: typeof links.planDoc === 'string' ? links.planDoc : null,
      specRef: typeof links.specRef === 'string' ? links.specRef : null,
      roadmapRow: links.roadmapRow || null,
      closesCL: Array.isArray(links.closesCL) ? links.closesCL : [],
    };
  });
}

function linkBase(value) {
  return typeof value === 'string' ? value.split('#')[0] : null;
}

function linkTargetsSpec(value, specName) {
  const base = linkBase(value);
  if (!base || !specName) return false;
  const specRoot = `${SPECS_DIR}/${specName}`;
  return base === specName || base === specRoot || base.startsWith(`${specRoot}/`);
}

function questLinksEpic(quest, epic) {
  const links = [quest.planDoc, quest.specRef];
  if (links.some((value) => linkBase(value) === epic.file)) return true;
  if (!epic.graduatesTo) return false;
  return quest.id === epic.graduatesTo ||
    links.some((value) => linkTargetsSpec(value, epic.graduatesTo));
}

function epicWorkStage(epic, linkedQuests, linkedSpecs) {
  if (linkedQuests.some((quest) => quest.open)) return EPIC_STAGE_LINKED_OPEN;
  if (linkedQuests.some((quest) => quest.draft)) return EPIC_STAGE_LINKED_DRAFT;
  if (linkedQuests.length > 0) return EPIC_STAGE_LINKED_TERMINAL;
  if (linkedSpecs.length > 0) return EPIC_STAGE_LINKED_SPEC;
  return EPIC_STAGE_FRAMING;
}

function projectEpics(epics, quests, specNames) {
  const knownSpecs = new Set(specNames);
  return epics.map((epic) => {
    const linkedQuests = quests.filter((quest) => questLinksEpic(quest, epic));
    const linkedSpecs = epic.graduatesTo && knownSpecs.has(epic.graduatesTo) ?
      [epic.graduatesTo] : [];
    return {
      ...epic,
      stage: epicWorkStage(epic, linkedQuests, linkedSpecs),
      linkedQuests,
      linkedSpecs,
    };
  });
}

export function buildOverview(root) {
  const ledger = closureLedgerPaths(root);
  const portfolio = buildPortfolio(root);
  const quests = linkedQuests(root, portfolio);
  const specNames = listSpecs(root);
  const epics = projectEpics(loadEpics(root), quests, specNames);
  const specs = specNames.map((name) => {
    // Accept the bare spec name or its exact directory boundary; never let a
    // similarly prefixed spec (`foo` / `foobar`) leak into this projection.
    const matched = quests.filter((quest) => linkTargetsSpec(quest.specRef, name));
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
    // Root-scoped for the same reason as the frontier board: the bare call resolves
    // against this file's location, not the root being projected.
    records: parseClosureLedger(ledger.dir, ledger.indexPath),
  };
}

// Coerce a cell to a single-line, table-safe string. Long ledger concerns can
// carry newlines or `|`, which would otherwise break the markdown table.
function cell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
  return text || '—';
}

// Render compact Markdown. Padding every row to the widest cell made a single
// long Quest id rewrite the entire generated board, turning a small projection
// change into a very large durability artifact.
function table(header, rows) {
  if (rows.length === 0) return ['_(none)_', ''];
  const body = rows.map((cells) => header.map((_, i) => cell(cells[i])));
  const row = (cells) => `| ${cells.join(' | ')} |`;
  const separator = `| ${header.map(() => '---').join(' | ')} |`;
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
  const drafts = quests.filter((q) => q.draft);
  const open = quests.filter((q) => q.open);
  const terminal = quests.filter((q) => !q.draft && !q.open);
  const active = records.filter((r) => r.active);
  const specsWithOpen = specs.filter((s) => s.open > 0).length;
  const lines = [
    '# Work overview — top-down',
    '',
    'Planning routes are selected, not mandatory: a bounded request may go directly',
    'to a Quest; unresolved cross-Quest framing may use an epic; a broad approved',
    'contract may use a spec. The **Quest log is the only execution state**, and a',
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
    '_Optional decision memos for unresolved cross-Quest framing. Stage is derived from explicit links, never from prose status._',
    '',
    ...table(['id', 'stage', 'roadmapRow', 'graduatesTo', 'linked'],
      epics.map((e) => [e.id, e.stage, e.roadmapRow || '—', e.graduatesTo || '—',
        e.linkedQuests.length || '—'])),

    `## 3 · Specs — ${specs.length} (${specsWithOpen} with open quests)`,
    '_Detailed planning (solve/specs/): design + requirements + tasks. Implemented by quests, not a closure surface._',
    '',
    ...table(['spec', 'quests (open/total)', 'quest ids'],
      specs.map((s) => [s.name, `${s.open}/${s.total}`, s.quests.map((q) => q.id).join(', ') || '—'])),

    `## 4 · Quests — ${drafts.length} draft / ${open.length} open / ` +
      `${terminal.length} terminal`,
    '_The only measured layer (solve/quests/). Sealed goal; attempts and findings live in the append-only log._',
    '',
    '### Draft',
    '',
    ...table(['id', 'class', 'spec'],
      drafts.map((q) => [q.id, q.class, q.specRef || '—'])),
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

// Persist the ignored local projection without wall-clock time. No-op writes are
// byte-stable; workflow events legitimately change it. Returns the written path.
export function writeOverview(root, markdown) {
  const file = overviewFilePath(root);
  const md = typeof markdown === 'string' ? markdown : runOverviewCommand(root);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, md);
  return file;
}
