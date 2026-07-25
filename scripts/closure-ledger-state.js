#!/usr/bin/env node
// closure-ledger-state — parse the per-record closure ledger into a machine
// surface. Post-WS8.1 every record carries a `### STATE` header (status, concern,
// firstViolatedInvariant, lastGate) and the STATE status is the source of truth;
// the index Status Summary table is the cross-check. The parser still tolerates
// the older inline `- Status:` / `## GATE VERDICT — <STATUS>` forms as a fallback.
//
// Records live under
// solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-###.md
//
// Usage:
//   node scripts/closure-ledger-state.js              # board table to stdout
//   node scripts/closure-ledger-state.js --json
//   node scripts/closure-ledger-state.js --write          # write the sibling board
//   node scripts/closure-ledger-state.js --check          # sibling-freshness guard
//   node scripts/closure-ledger-state.js --migrate-state  # WS8.1 one-shot seeding
//   node scripts/closure-ledger-state.js --check-state     # CI guard: STATE + 0 drift
//
// --write emits a GENERATED SIBLING (closure-ledger.generated.md), never the
// authored index. --check-state (wired into CI via `npm run audit:closure-ledger`)
// fails if any record lacks a STATE block or its STATE status drifts from the index.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const LEDGER_BASE_RELATIVE =
  'solve/specs/membership-lifecycle-placement-hard-cutover';
const LEDGER_DIR_NAME = 'closure-ledger';
const LEDGER_INDEX_NAME = 'closure-ledger.md';
const LEDGER_BASE = path.join(ROOT, LEDGER_BASE_RELATIVE);
const LEDGER_DIR = path.join(LEDGER_BASE, LEDGER_DIR_NAME);
const INDEX_PATH = path.join(LEDGER_BASE, LEDGER_INDEX_NAME);
const GENERATED_PATH = path.join(LEDGER_BASE, 'closure-ledger.generated.md');
const EXIT_OK = 0;
const EXIT_DRIFT = 2;

// Settled records need no attention; everything else is the active frontier.
const SETTLED_STATUSES = new Set(['guarded', 'fix-landed', 'closed', 'parked']);
const GATE_TS_RE = /stat-gate-(\d{8}T\d{6}Z)/g;

// Tense/phrasing synonyms seen across the heterogeneous records collapse to the
// closure-grammar taxonomy. "fix landed" → fix-landed; "opened"/"reopened" → open.
const STATUS_SYNONYMS = {
  opened: 'open', reopened: 'open', fixed: 'fix-landed', fix: 'fix-landed',
};

export function normalizeStatus(raw) {
  if (!raw) return 'unknown';
  const token = raw.trim().toLowerCase().replace(/[`*]/g, '')
    .split(/[\s—(,]/)[0].replace(/_/g, '-').replace(/[.:]+$/, '');
  return STATUS_SYNONYMS[token] || token || 'unknown';
}

// Pick the EARLIEST-appearing status signal in the file: the WS3 `### STATE`
// block and the gate-first `## GATE VERDICT — <STATUS>` header both sit at the
// top and are authoritative, whereas an inline `- Status:` may be a stale
// worklog line buried lower (a gate-verdict header supersedes it). Position, not
// a fixed source precedence, resolves the conflict — except a STATE block always
// wins outright since it is the canonical current-truth surface.
export function extractStatus(text) {
  const state = text.match(/-\s*\*\*status\*\*:\s*(.+)/i);
  if (state) return {status: normalizeStatus(state[1]), source: 'state-block'};
  const candidates = [];
  const inline = text.match(/^-\s*Status:\s*(.+)/im);
  if (inline) candidates.push({pos: inline.index, raw: inline[1], source: 'inline'});
  const verdict = text.match(/^##\s*GATE VERDICT.*—\s*([A-Za-z_-]+)/im);
  if (verdict) {
    candidates.push({pos: verdict.index, raw: verdict[1], source: 'gate-verdict'});
  }
  if (candidates.length === 0) return {status: 'unknown', source: 'none'};
  const earliest = candidates.sort((a, b) => a.pos - b.pos)[0];
  return {status: normalizeStatus(earliest.raw), source: earliest.source};
}

function extractTitle(text, id) {
  const heading = text.match(new RegExp(`^#+\\s*${id}\\s+(.+)`, 'm'));
  return heading ? heading[1].trim() : id;
}

function extractLastGate(text) {
  const labeled = text.match(/-\s*\*\*lastGate\*\*:\s*(.+)/i);
  if (labeled) {
    const ts = labeled[1].match(/\d{8}T\d{6}Z/);
    return ts ? ts[0] : labeled[1].trim().split(/[\s—]/)[0];
  }
  const all = [...text.matchAll(GATE_TS_RE)].map((m) => m[1]);
  return all.length > 0 ? all.sort().at(-1) : null;
}

// Read a `- **field**: value` line from a STATE block (the bold label may carry a
// parenthetical qualifier, e.g. `**firstViolatedInvariant (umbrella)**`).
function extractStateField(text, field) {
  const re = new RegExp(`-\\s*\\*\\*${field}[^*]*\\*\\*:\\s*(.+)`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function parseRecords(dir = LEDGER_DIR) {
  if (!fs.existsSync(dir)) return new Map();
  const records = new Map();
  for (const name of fs.readdirSync(dir).filter((n) => /^CL-\d+\.md$/.test(n))) {
    const id = name.replace(/\.md$/, '');
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    const {status, source} = extractStatus(text);
    const concern = extractStateField(text, 'concern');
    records.set(id, {
      recordStatus: status,
      statusSource: source,
      title: extractTitle(text, id),
      concern: concern || '',
      lastGate: extractLastGate(text),
      file: path.relative(ROOT, path.join(dir, name)),
    });
  }
  return records;
}

// The index Status Summary table carries one row per record: status, concern,
// and the first violated invariant. It is the seed for WS8.1 normalization and
// the cross-check the drift guard enforces a record's STATE against.
function parseIndex(indexPath = INDEX_PATH) {
  const index = new Map();
  if (!fs.existsSync(indexPath)) return index;
  const text = fs.readFileSync(indexPath, 'utf8');
  // Columns: | [id](path) | status | concern | invariant |. The status cell may
  // carry a qualifier ("open (not-reproduced-at-N=4)"), so consume the rest of
  // the cell after the status word (normalizeStatus takes the leading token);
  // without the trailing `[^|]*` a qualified cell silently drops the whole row.
  const rowRe =
    /\|\s*\[(CL-\d+)\][^|]*\|\s*([a-z-]+)[^|]*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/g;
  for (const m of text.matchAll(rowRe)) {
    index.set(m[1], {
      indexStatus: normalizeStatus(m[2]),
      concern: m[3].trim(),
      invariant: m[4].trim(),
    });
  }
  return index;
}

// Bucket a record by the leading token of its `concern` field — the subsystem the
// record belongs to (e.g. "harness-oracle (primary) + node-resource-safety" →
// "harness-oracle"). Lets the frontier surfaces group the active ledger by area
// instead of presenting one flat list, so "where is the work" reads at a glance.
export function concernArea(concern) {
  const head = String(concern || '').split(/[\s(/+]/u)[0].trim();
  return head || 'unclassified';
}

// Post-WS8.1: the RECORD's `### STATE` block is the status source of truth; the
// index is the cross-check. `drift` flags any record whose STATE status disagrees
// with the index, and `normalized` is false for any record still lacking a STATE
// block — both are zero once `--migrate-state` has run, and the drift guard keeps
// them zero.
// Ledger paths for an arbitrary repo root.
//
// The module defaults resolve against THIS FILE's location, which silently means "the
// real repository" no matter what root a caller is operating on. That is right for the
// repo-wide tools, and wrong for anything that takes a root: a projection built over a
// temporary root would splice the real repo's CL records into a fixture. Callers that
// carry a root should derive their paths here instead of relying on the defaults.
export function closureLedgerPaths(root) {
  const base = path.join(root, LEDGER_BASE_RELATIVE);
  return {
    dir: path.join(base, LEDGER_DIR_NAME),
    indexPath: path.join(base, LEDGER_INDEX_NAME),
  };
}

export function parseClosureLedger(dir = LEDGER_DIR, indexPath = INDEX_PATH) {
  const records = parseRecords(dir);
  const index = parseIndex(indexPath);
  const ids = [...new Set([...records.keys(), ...index.keys()])].sort();
  return ids.map((id) => {
    const rec = records.get(id) || {recordStatus: 'unknown', statusSource: 'missing'};
    const idx = index.get(id) || {indexStatus: 'unknown', concern: '', invariant: ''};
    const status = rec.recordStatus !== 'unknown' ? rec.recordStatus : idx.indexStatus;
    return {
      id,
      status,
      recordStatus: rec.recordStatus,
      indexStatus: idx.indexStatus,
      statusSource: rec.statusSource,
      normalized: rec.statusSource === 'state-block',
      drift: rec.recordStatus !== 'unknown' &&
        idx.indexStatus !== 'unknown' && rec.recordStatus !== idx.indexStatus,
      concern: rec.concern || idx.concern || '',
      title: rec.title || id,
      lastGate: rec.lastGate || null,
      active: !SETTLED_STATUSES.has(status),
      file: rec.file || null,
    };
  });
}

// WS8.1 one-shot migration: prepend a `### STATE` header (seeded from the index
// row + the record's last gate) to every record that lacks one. Idempotent — a
// record that already has a STATE block is left untouched.
export function migrateState(dir = LEDGER_DIR, indexPath = INDEX_PATH) {
  const index = parseIndex(indexPath);
  const result = {migrated: [], skipped: [], noIndexRow: []};
  for (const name of fs.readdirSync(dir).filter((n) => /^CL-\d+\.md$/.test(n))) {
    const id = name.replace(/\.md$/, '');
    const file = path.join(dir, name);
    const text = fs.readFileSync(file, 'utf8');
    if (/^### STATE/m.test(text)) {
      result.skipped.push(id);
      continue;
    }
    const idx = index.get(id);
    if (!idx) {
      result.noIndexRow.push(id);
      continue;
    }
    const lastGate = extractLastGate(text) || '—';
    const block = [
      '',
      '### STATE (current truth — read only this header to act; history below)',
      '',
      `- **status**: \`${idx.indexStatus}\``,
      `- **concern**: ${idx.concern}`,
      `- **firstViolatedInvariant**: ${idx.invariant}`,
      `- **lastGate**: ${lastGate}`,
      '',
    ].join('\n');
    const lines = text.split('\n');
    const headingIdx = lines.findIndex((l) => /^#+\s+CL-\d+/.test(l));
    const at = headingIdx === -1 ? 0 : headingIdx + 1;
    lines.splice(at, 0, block);
    fs.writeFileSync(file, lines.join('\n'));
    result.migrated.push(id);
  }
  return result;
}

function tally(records) {
  const counts = {};
  for (const r of records) counts[r.status] = (counts[r.status] || 0) + 1;
  return counts;
}

function cell(value) {
  return String(value || '—').replace(/\|/g, '\\|');
}

export function renderGenerated(records) {
  const active = records.filter((r) => r.active);
  const drifted = records.filter((r) => r.drift);
  const lines = [
    '# Closure ledger — generated board (do not edit)',
    '',
    'Projection by `node scripts/closure-ledger-state.js --write`. Status + concern',
    'come from the authored `closure-ledger.md` index (the current rollup);',
    '`lastGate` and the drift flag come from each `closure-ledger/CL-*.md` record.',
    'The DRIFT list is the WS8.1 worklist: records whose own top `- Status:` line',
    'lags the index and need a normalized `### STATE` block.',
    '',
    `Records: ${records.length} · active frontier: ${active.length} · drifted: ` +
      `${drifted.length}`,
    '',
    '## Active frontier (needs attention)',
    '',
    '| Id | Status | Last gate | Concern |',
    '| --- | --- | --- | --- |',
    ...active.map((r) =>
      `| ${r.id} | ${r.status} | ${cell(r.lastGate)} | ${cell(r.concern)} |`),
    '',
    '## Status drift — record STATE vs index',
    '',
    drifted.length === 0 ? '_(none — every record STATE agrees with the index)_' :
      ['| Id | Record STATE | Index |',
        '| --- | --- | --- |',
        ...drifted.map((r) =>
          `| ${r.id} | ${r.recordStatus} | ${r.indexStatus} |`)].join('\n'),
    '',
    '## Status tally (all records)',
    '',
    ...Object.entries(tally(records)).sort()
      .map(([status, count]) => `- ${status}: ${count}`),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--migrate-state')) {
    const r = migrateState();
    process.stdout.write(
      `migrated ${r.migrated.length} (${r.migrated.join(', ') || 'none'}); ` +
      `skipped ${r.skipped.length} (already had STATE); ` +
      `${r.noIndexRow.length} had no index row` +
      `${r.noIndexRow.length ? ` (${r.noIndexRow.join(', ')})` : ''}.\n`);
    return EXIT_OK;
  }

  const records = parseClosureLedger();

  // WS8.1 guard: every record must carry a STATE block, and its STATE status must
  // agree with the index. Wired into CI so the stale-top-line drift cannot recur.
  if (argv.includes('--check-state')) {
    const unnormalized = records.filter((r) => !r.normalized);
    const drifted = records.filter((r) => r.drift);
    if (unnormalized.length > 0 || drifted.length > 0) {
      if (unnormalized.length > 0) {
        process.stderr.write(
          `records missing a ### STATE block: ${unnormalized.map((r) => r.id).join(', ')}\n` +
          'run `node scripts/closure-ledger-state.js --migrate-state`.\n');
      }
      for (const r of drifted) {
        process.stderr.write(
          `${r.id}: STATE status '${r.recordStatus}' disagrees with index ` +
          `'${r.indexStatus}' — reconcile the record's STATE block and the index row.\n`);
      }
      return EXIT_DRIFT;
    }
    process.stdout.write(
      `closure ledger STATE check: ${records.length} records normalized, 0 drift.\n`);
    return EXIT_OK;
  }

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    return EXIT_OK;
  }
  if (argv.includes('--write')) {
    fs.writeFileSync(GENERATED_PATH, renderGenerated(records));
    process.stdout.write(
      `wrote ${path.relative(ROOT, GENERATED_PATH)} (${records.length} records)\n`);
    return EXIT_OK;
  }
  if (argv.includes('--check')) {
    const expected = renderGenerated(records);
    const actual = fs.existsSync(GENERATED_PATH) ?
      fs.readFileSync(GENERATED_PATH, 'utf8') : '';
    if (expected !== actual) {
      process.stderr.write(
        'closure-ledger.generated.md is stale — run ' +
        '`node scripts/closure-ledger-state.js --write`.\n');
      return EXIT_DRIFT;
    }
    process.stdout.write('closure-ledger.generated.md is up to date.\n');
    return EXIT_OK;
  }

  process.stdout.write(renderGenerated(records));
  return EXIT_OK;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
