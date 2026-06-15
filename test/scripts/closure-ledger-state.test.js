import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  normalizeStatus,
  extractStatus,
  renderGenerated,
  parseClosureLedger,
  migrateState,
} from '../../scripts/closure-ledger-state.js';

test('normalizeStatus collapses tense/phrasing synonyms', (t) => {
  t.equal(normalizeStatus('`narrowed` (umbrella)'), 'narrowed');
  t.equal(normalizeStatus('OPENED (witness captured)'), 'open');
  t.equal(normalizeStatus('FIX LANDED, awaiting gate'), 'fix-landed');
  t.equal(normalizeStatus('fix_in_progress'), 'fix-in-progress');
  t.equal(normalizeStatus(''), 'unknown');
  t.end();
});

test('extractStatus prefers the STATE block when present', (t) => {
  const text = '## CL-001 X\n\n### STATE\n- **status**: `narrowed` (foo)\n';
  t.same(extractStatus(text), {status: 'narrowed', source: 'state-block'});
  t.end();
});

test('extractStatus picks the earliest signal — a top GATE VERDICT beats a buried Status', (t) => {
  // The gate-first records carry a current verdict at the top and a stale
  // `- Status:` worklog line lower down; the verdict must win.
  const text = [
    '# CL-036 Concern',
    '## GATE VERDICT (stat-gate-20260614T181442Z) — GUARDED ON MECHANISM',
    'body',
    '- Status: FIX LANDED, awaiting validation gate',
  ].join('\n');
  t.equal(extractStatus(text).status, 'guarded');
  t.equal(extractStatus(text).source, 'gate-verdict');
  t.end();
});

test('extractStatus falls back to an inline Status when there is no verdict', (t) => {
  const text = '# CL-039 Concern\n\n- Status: OPEN — NOT-REPRODUCED-AT-N=4\n';
  t.equal(extractStatus(text).status, 'open');
  t.equal(extractStatus(text).source, 'inline');
  t.end();
});

test('renderGenerated lists the active frontier and the drift worklist', (t) => {
  const records = [
    {id: 'CL-009', status: 'open', recordStatus: 'open', drift: false,
      concern: 'transport', lastGate: '20260611T052934Z', active: true},
    {id: 'CL-012', status: 'open', recordStatus: 'open', indexStatus: 'guarded',
      drift: true, concern: 'readiness', lastGate: null, active: true},
  ];
  const md = renderGenerated(records);
  t.match(md, /CL-009 \| open/, 'active record shown');
  t.match(md, /CL-012 \| open \| guarded \|/, 'drift row shows record STATE vs index');
  t.match(md, /drifted: 1/);
  t.end();
});

test('migrateState seeds a STATE block from the index and clears drift (WS8.1)', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-state-'));
  const ledgerDir = path.join(dir, 'closure-ledger');
  fs.mkdirSync(ledgerDir);
  // A record whose top inline status (open) lags the index (guarded).
  fs.writeFileSync(path.join(ledgerDir, 'CL-099.md'),
    '## CL-099 A Test Invariant\n\n- Status: open (named long ago)\n\nbody\n');
  const indexPath = path.join(dir, 'closure-ledger.md');
  fs.writeFileSync(indexPath,
    '| Id | Status | Concern | First Violated Invariant |\n| --- | --- | --- | --- |\n' +
    '| [CL-099](closure-ledger/CL-099.md) | guarded | test-concern | The invariant text. |\n');

  // Before migration: record reads stale 'open' from the inline line; the
  // record-authoritative status disagrees with the index → drift.
  const before = parseClosureLedger(ledgerDir, indexPath)[0];
  t.equal(before.recordStatus, 'open');
  t.notOk(before.normalized, 'no STATE block yet');
  t.ok(before.drift, 'record lags index before migration');

  const result = migrateState(ledgerDir, indexPath);
  t.same(result.migrated, ['CL-099']);

  const text = fs.readFileSync(path.join(ledgerDir, 'CL-099.md'), 'utf8');
  t.match(text, /### STATE/, 'STATE block prepended');
  t.match(text, /- Status: open/, 'original history preserved below');

  const after = parseClosureLedger(ledgerDir, indexPath)[0];
  t.equal(after.recordStatus, 'guarded', 'STATE status now wins');
  t.ok(after.normalized, 'record is normalized');
  t.notOk(after.drift, 'drift cleared');

  // Idempotent: a second migration skips the now-normalized record.
  t.same(migrateState(ledgerDir, indexPath).skipped, ['CL-099']);

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});
