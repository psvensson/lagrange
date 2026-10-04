import {execFileSync} from 'node:child_process';
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
  mechanismClassProblems,
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

test('the ledger carries the four mechanism classes and the audit resolves them', (t) => {
  const audited = mechanismClassProblems();
  for (const id of ['MC-001', 'MC-002', 'MC-003', 'MC-004']) {
    t.ok(audited.classes.includes(id), `${id} is in the ledger`);
  }
  t.same(audited.problems, [], 'every class is well formed and every reference resolves');
  t.end();
});

// A class file in the ledger's record form: a STATE block whose fields the
// audit reads, and a row in the index's Mechanism Classes table.
function classFile(fields) {
  const merged = {status: '`open`', definition: 'One signal stands in for two facts.',
    detectionQuestion: 'Can the facts come apart?', commits: '', quests: '', paths: '',
    ...fields};
  return ['# MC-001 Proxy signal', '', '### STATE (current truth)', '',
    ...Object.entries(merged).filter(([, value]) => value !== null)
      .map(([field, value]) => `- **${field}**: ${value}`), ''].join('\n');
}

test('a malformed class or a reference that does not resolve fails the audit', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-class-'));
  const git = (args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com',
    ...args], {cwd: root, encoding: 'utf8'}).trim();
  git(['init', '-q']);
  fs.mkdirSync(path.join(root, 'solve/quests/real-quest'), {recursive: true});
  fs.writeFileSync(path.join(root, 'solve/quests/real-quest/quest.json'), '{}');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'seed']);
  const sha = git(['rev-parse', '--short=9', 'HEAD']);
  const ledgerDir = path.join(root, 'closure-ledger');
  fs.mkdirSync(ledgerDir);
  const indexPath = path.join(root, 'closure-ledger.md');
  const row = '| [MC-001](closure-ledger/MC-001.md) | open | proxy signal | Q? |\n';
  fs.writeFileSync(indexPath, `## Mechanism Classes\n\n${row}`);
  const audit = (fields) => {
    fs.writeFileSync(path.join(ledgerDir, 'MC-001.md'), classFile(fields));
    return mechanismClassProblems(ledgerDir, indexPath, root).problems;
  };
  const good = {commits: sha, quests: 'real-quest', paths: 'solve/quests/real-quest/quest.json'};
  t.same(audit(good), [], 'a well-formed class with resolving references passes');
  t.same(audit({...good, commits: `${sha}, 0123456789abcdef`}),
    ['MC-001: names no commit in this repository: 0123456789abcdef']);
  t.same(audit({...good, quests: 'ghost-quest'}),
    ['MC-001: names no quest with a quest.json: ghost-quest']);
  t.same(audit({...good, paths: 'src/ghost.js'}), ['MC-001: names a path that does not exist: src/ghost.js']);
  t.same(audit({...good, definition: ''}), ['MC-001: missing definition']);
  t.same(audit({...good, detectionQuestion: null}), ['MC-001: missing detectionQuestion']);
  t.same(audit({}), ['MC-001: names no instance (commits, quests or paths)']);
  t.same(audit({...good, status: '`guarded`'}), ['MC-001: STATE status disagrees with the index']);
  fs.writeFileSync(path.join(ledgerDir, 'MC-001.md'), '# MC-001 Proxy signal\n\nno state\n');
  t.same(mechanismClassProblems(ledgerDir, indexPath, root).problems,
    ['MC-001: missing a ### STATE block']);
  fs.writeFileSync(indexPath, `## Mechanism Classes\n\n${row}` +
    '| [MC-002](closure-ledger/MC-002.md) | open | removal by key | Q? |\n');
  t.same(audit(good), ['MC-002: indexed but has no closure-ledger file']);
  fs.writeFileSync(indexPath, '## Mechanism Classes\n');
  t.same(audit(good), ['MC-001: no row in the index Mechanism Classes table']);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

test('the design note and the quest guidance point at the mechanism classes', (t) => {
  const anchor = 'solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger.md' +
    '#mechanism-classes';
  for (const file of ['docs/development/verification-templates/design-note-template.md',
    'docs/steering/workflow-guidelines/solver-quests.md']) {
    const pointer = fs.readFileSync(file, 'utf8').split('\n')
      .filter((line) => line.includes('mechanism classes') && line.includes(anchor));
    t.equal(pointer.length, 1, `${file} has one line pointing at the class list`);
  }
  t.match(fs.readFileSync(
    'solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger.md', 'utf8'),
  /^## Mechanism Classes$/mu, 'the anchor exists');
  t.end();
});

test('audit:closure-ledger (--check-state) fails on a class whose reference does not resolve', (t) => {
  // The CLI resolves the ledger beside its own file, so a copy of it in a
  // scratch repository audits that repository's ledger.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-class-cli-'));
  const git = (args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com',
    ...args], {cwd: root, encoding: 'utf8'}).trim();
  git(['init', '-q']);
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync('scripts/closure-ledger-state.js', path.join(root, 'scripts/closure-ledger-state.js'));
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'seed']);
  const base = path.join(root, 'solve/specs/membership-lifecycle-placement-hard-cutover');
  fs.mkdirSync(path.join(base, 'closure-ledger'), {recursive: true});
  fs.writeFileSync(path.join(base, 'closure-ledger.md'),
    '| [MC-001](closure-ledger/MC-001.md) | open | proxy signal | Q? |\n');
  const run = (commits) => {
    fs.writeFileSync(path.join(base, 'closure-ledger/MC-001.md'), classFile({commits}));
    try {
      return {status: 0, out: execFileSync(process.execPath,
        ['scripts/closure-ledger-state.js', '--check-state'], {cwd: root, encoding: 'utf8',
          stdio: 'pipe'})};
    } catch (error) {
      return {status: error.status, out: `${error.stdout}${error.stderr}`};
    }
  };
  const good = run(git(['rev-parse', 'HEAD']));
  t.equal(good.status, 0, good.out);
  t.match(good.out, /1 mechanism classes resolve/);
  const bad = run('0123456789abcdef');
  t.equal(bad.status, 2, 'the audit exits non-zero');
  t.match(bad.out, /MC-001: names no commit in this repository: 0123456789abcdef/);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
