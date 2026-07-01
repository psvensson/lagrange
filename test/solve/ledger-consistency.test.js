import t from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {checkLedgerConsistency} from '../../scripts/solve/ledger-consistency.js';

// Deterministic guard for the Solver ledger-consistency check. Builds throwaway
// fixture ledgers and asserts each structured rule fires on a planted defect and is
// silent on the consistent baseline (red-on-revert: remove the defect => the finding
// disappears; each rule is proven non-vacuous by its clean counterpart).

function mkFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-fixture-'));
  for (const d of ['solve/epics', 'solve/quests', 'solve/oracle', 'solve/state']) {
    fs.mkdirSync(path.join(root, d), {recursive: true});
  }
  return root;
}
function writeEpic(root, name, front) {
  const fm = Object.entries(front).map(([k, v]) => `${k}: ${v}`).join('\n');
  fs.writeFileSync(path.join(root, 'solve/epics', name),
    `---\n${fm}\n---\n\n# Epic: ${name}\n\nbody\n`);
}
function writeJson(root, dir, id, obj) {
  fs.writeFileSync(path.join(root, dir, `${id}.json`), JSON.stringify(obj));
}
const errText = (r) => r.errors.join('\n');
const warnText = (r) => r.warnings.join('\n');

t.test('consistent ledger has zero errors (baseline non-vacuity)', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeEpic(root, 'good.md', {id: 'good', status: 'resolved'});
  writeEpic(root, 'good2.md', {id: 'good2', status: 'resolved-with-bespoke-suffix'});
  // solved quest whose oracle-probe target EXISTS
  writeJson(root, 'solve/quests', 'q1',
    {id: 'q1', doneWhen: {probe: 'oracle', args: {file: 'solve/oracle/q1.json'}}});
  writeJson(root, 'solve/state', 'q1', {questId: 'q1', questStatus: 'solved'});
  writeJson(root, 'solve/oracle', 'q1', {done: true});
  // scenario-harness quest (no oracle expected) recorded solved — legitimately clean
  writeJson(root, 'solve/quests', 'q2',
    {id: 'q2', doneWhen: {probe: 'scenario-harness', args: {consecutive: 3}}});
  writeJson(root, 'solve/state', 'q2', {questId: 'q2', questStatus: 'solved'});

  const r = checkLedgerConsistency(root);
  t.equal(r.errors.length, 0, `no errors: ${errText(r)}`);
  t.equal(r.warnings.length, 0, `no warnings: ${warnText(r)}`);
  t.end();
});

t.test('E1: epic without frontmatter status is an ERROR (red-on-revert)', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  // no `status` key
  writeEpic(root, 'bad.md', {id: 'bad', roadmapRow: 'null'});
  const withDefect = checkLedgerConsistency(root);
  t.match(errText(withDefect), /epic bad\.md: missing frontmatter .*status.*\(E1\)/,
    'E1 fires on a status-less epic');

  // revert the defect: add a status -> finding disappears
  writeEpic(root, 'bad.md', {id: 'bad', status: 'active'});
  t.equal(checkLedgerConsistency(root).errors.length, 0, 'E1 clears once status is set');
  t.end();
});

t.test('E1: README/_template are skipped (no false positive)', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(path.join(root, 'solve/epics/README.md'), '# no frontmatter here\n');
  fs.writeFileSync(path.join(root, 'solve/epics/_template.md'), '# template\n');
  t.equal(checkLedgerConsistency(root).errors.length, 0,
    'skip-set files do not trip E1');
  t.end();
});

t.test('E2: unknown status base is a WARNING, not an error', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeEpic(root, 'weird.md', {id: 'weird', status: 'frobnicating'});
  const r = checkLedgerConsistency(root);
  t.equal(r.errors.length, 0, 'unknown status does not gate');
  t.match(warnText(r), /status "frobnicating" not in known vocabulary.*\(E2\)/,
    'E2 warns on an off-vocabulary status');
  t.end();
});

t.test('Q1: solved quest with a missing oracle-probe target is an ERROR', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeJson(root, 'solve/quests', 'orphan',
    {id: 'orphan', doneWhen: {probe: 'oracle', args: {file: 'solve/oracle/orphan.json'}}});
  writeJson(root, 'solve/state', 'orphan', {questId: 'orphan', questStatus: 'solved'});
  // NB: no solve/oracle/orphan.json written
  const withDefect = checkLedgerConsistency(root);
  t.match(errText(withDefect),
    /quest orphan: questStatus=solved but its oracle-probe target .* is missing \(Q1\)/,
    'Q1 fires when a solved quest lacks its oracle-probe target');

  // revert: create the target -> finding disappears
  writeJson(root, 'solve/oracle', 'orphan', {done: true});
  t.equal(checkLedgerConsistency(root).errors.length, 0, 'Q1 clears once the target exists');
  t.end();
});

t.test('Q2: oracle done=true without terminal state is a WARNING', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeJson(root, 'solve/quests', 'q',
    {id: 'q', doneWhen: {probe: 'oracle', args: {file: 'solve/oracle/q.json'}}});
  writeJson(root, 'solve/oracle', 'q', {done: true});
  // no state file at all
  const r = checkLedgerConsistency(root);
  t.equal(r.errors.length, 0, 'Q2 does not gate');
  t.match(warnText(r), /oracle done=true but state questStatus=MISSING.*\(Q2\)/,
    'Q2 warns on oracle-done-without-recorded-terminal');
  t.end();
});

t.test('Q3: not-solved quest with a missing oracle-probe target is a WARNING', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeJson(root, 'solve/quests', 'openq',
    {id: 'openq', doneWhen: {probe: 'oracle', args: {file: 'solve/oracle/openq.json'}}});
  // state open, no oracle file
  writeJson(root, 'solve/state', 'openq', {questId: 'openq', questStatus: 'open'});
  const r = checkLedgerConsistency(root);
  t.equal(r.errors.length, 0, 'Q3 does not gate (fresh quests legitimately lack oracles)');
  t.match(warnText(r), /oracle-probe target .* missing .*cannot evaluate closure.*\(Q3\)/,
    'Q3 warns on a latent unclosable quest');
  t.end();
});

t.test('the live repo ledger has zero ERRORS (guards against regressions)', (t) => {
  // Runs the check against the real tree; ERRORS must stay at zero. WARNINGS are
  // allowed (they track known, accepted residue) so this does not couple to their count.
  const repoRoot = path.resolve(new URL('../../', import.meta.url).pathname);
  const r = checkLedgerConsistency(repoRoot);
  t.equal(r.errors.length, 0, `repo ledger clean of errors: ${errText(r)}`);
  t.end();
});
