#!/usr/bin/env node
// closure-ledger-state — parse the per-record closure ledger into a machine
// surface, tolerant of the in-flight WS3 format migration.
//
// Records live under
// .kiro/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-###.md
// in two shapes today: the WS3 `### STATE` header (CL-001) and the older inline
// `- Status:` / `## GATE VERDICT — <STATUS>` form (most records). This parser
// reads whichever is present so the frontier board works DURING the migration,
// not only after it.
//
// Usage:
//   node scripts/closure-ledger-state.js              # table to stdout
//   node scripts/closure-ledger-state.js --json
//   node scripts/closure-ledger-state.js --write      # write the sibling board
//   node scripts/closure-ledger-state.js --check      # drift guard (exit 2)
//
// --write emits a GENERATED SIBLING (closure-ledger.generated.md), never the
// human-edited index — the index keeps a `concern` column the records do not yet
// carry uniformly (that is WS8.1). --check is therefore safe to wire into CI.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const LEDGER_BASE = path.join(
  ROOT, '.kiro/specs/membership-lifecycle-placement-hard-cutover');
const LEDGER_DIR = path.join(LEDGER_BASE, 'closure-ledger');
const INDEX_PATH = path.join(LEDGER_BASE, 'closure-ledger.md');
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

function parseRecords(dir = LEDGER_DIR) {
  if (!fs.existsSync(dir)) return new Map();
  const records = new Map();
  for (const name of fs.readdirSync(dir).filter((n) => /^CL-\d+\.md$/.test(n))) {
    const id = name.replace(/\.md$/, '');
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    const {status, source} = extractStatus(text);
    records.set(id, {
      recordStatus: status,
      statusSource: source,
      title: extractTitle(text, id),
      lastGate: extractLastGate(text),
      file: path.relative(ROOT, path.join(dir, name)),
    });
  }
  return records;
}

// The hand-maintained index Status Summary table carries the CURRENT rollup
// status + concern. Today it is fresher than several records' top `- Status:`
// lines (written at open-time and never updated), so it is the authoritative
// status surface until WS8.1 normalizes a STATE block onto every record.
function parseIndex(indexPath = INDEX_PATH) {
  const index = new Map();
  if (!fs.existsSync(indexPath)) return index;
  const text = fs.readFileSync(indexPath, 'utf8');
  // The status cell may carry a qualifier ("open (not-reproduced-at-N=4)"), so
  // consume the rest of the cell after the status word; normalizeStatus takes the
  // leading token. Without the trailing `[^|]*` a qualified cell silently drops
  // the whole row (CL-039), disabling its drift detection.
  const rowRe = /\|\s*\[(CL-\d+)\][^|]*\|\s*([a-z-]+)[^|]*\|\s*([^|]*?)\s*\|/g;
  for (const m of text.matchAll(rowRe)) {
    index.set(m[1], {indexStatus: normalizeStatus(m[2]), concern: m[3].trim()});
  }
  return index;
}

// Merge the authored index (current status + concern) with the per-record parse
// (lastGate, title, and a DRIFT flag where the record's own status line lags the
// index — that set is precisely the WS8.1 normalization worklist).
export function parseClosureLedger(dir = LEDGER_DIR, indexPath = INDEX_PATH) {
  const records = parseRecords(dir);
  const index = parseIndex(indexPath);
  const ids = [...new Set([...records.keys(), ...index.keys()])].sort();
  return ids.map((id) => {
    const rec = records.get(id) || {recordStatus: 'unknown', statusSource: 'missing'};
    const idx = index.get(id) || {indexStatus: 'unknown', concern: ''};
    const status = idx.indexStatus !== 'unknown' ? idx.indexStatus : rec.recordStatus;
    return {
      id,
      status,
      recordStatus: rec.recordStatus,
      statusSource: rec.statusSource,
      drift: rec.recordStatus !== 'unknown' &&
        idx.indexStatus !== 'unknown' && rec.recordStatus !== idx.indexStatus,
      concern: idx.concern || '',
      title: rec.title || id,
      lastGate: rec.lastGate || null,
      active: !SETTLED_STATUSES.has(status),
      file: rec.file || null,
    };
  });
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
    '## Status drift — WS8.1 normalization worklist',
    '',
    drifted.length === 0 ? '_(none — records agree with the index)_' :
      ['| Id | Index status | Record status (stale) |',
        '| --- | --- | --- |',
        ...drifted.map((r) =>
          `| ${r.id} | ${r.status} | ${r.recordStatus} |`)].join('\n'),
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
  const records = parseClosureLedger();

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
