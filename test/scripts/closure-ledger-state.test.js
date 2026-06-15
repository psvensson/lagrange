import {test} from '../../src/test-helpers/tap.js';
import {
  normalizeStatus,
  extractStatus,
  renderGenerated,
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
    {id: 'CL-012', status: 'guarded', recordStatus: 'open', drift: true,
      concern: 'readiness', lastGate: null, active: false},
  ];
  const md = renderGenerated(records);
  t.match(md, /CL-009 \| open/, 'active record shown');
  t.match(md, /CL-012 \| guarded \| open/, 'drift row shows index vs stale record status');
  t.match(md, /active frontier: 1/);
  t.match(md, /drifted: 1/);
  t.end();
});
