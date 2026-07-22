import t from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {checkLedgerConsistency} from '../../scripts/solve/ledger-consistency.js';
import {
  canonicalHistoricalOracleManifestBytes,
  historicalOracleArchivePaths,
  writeHistoricalOracleArchive,
} from '../../scripts/solve/historical-oracle-archive.js';

// Deterministic guard for the Solver ledger-consistency check. Builds throwaway
// fixture ledgers and asserts each structured rule fires on a planted defect and is
// silent on the consistent baseline (red-on-revert: remove the defect => the finding
// disappears; each rule is proven non-vacuous by its clean counterpart).

function mkFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-fixture-'));
  for (const d of ['solve/epics', 'solve/quests', 'solve/oracle', 'solve/log']) {
    fs.mkdirSync(path.join(root, d), {recursive: true});
  }
  return root;
}
function writeEpic(root, name, front, body = 'body\n') {
  const fm = Object.entries(front).map(([k, v]) => `${k}: ${v}`).join('\n');
  fs.writeFileSync(path.join(root, 'solve/epics', name),
    `---\n${fm}\n---\n\n# Epic: ${name}\n\n${body}`);
}
function writeJson(root, dir, id, obj) {
  fs.mkdirSync(path.join(root, dir), {recursive: true});
  fs.writeFileSync(path.join(root, dir, `${id}.json`), JSON.stringify(obj));
}
function writeQuest(root, id, doneWhen) {
  writeJson(root, 'solve/quests', id, {
    id,
    doneWhen,
    frontiers: [{id: `${id}-main`, priority: 1, metric: doneWhen}],
  });
}
function writeLog(root, id, events) {
  fs.writeFileSync(path.join(root, 'solve/log', `${id}.ndjson`),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
}
function writeJsonFile(root, file, obj) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, JSON.stringify(obj));
}
function solvedEvidenceEvent(file, sha256) {
  return {
    type: 'quest',
    status: 'solved',
    evidence: file,
    evidenceIdentity: {sha256},
  };
}
function writeArchive(root, id, sealedPath, payload = '{"done":true}\n') {
  return writeHistoricalOracleArchive(root, [{questId: id, sealedPath, payload}]);
}
const errText = (r) => r.errors.join('\n');
const warnText = (r) => r.warnings.join('\n');

t.test('consistent ledger has zero errors (baseline non-vacuity)', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeEpic(root, 'good.md', {id: 'good', status: 'resolved'});
  writeEpic(root, 'good2.md', {id: 'good2', status: 'resolved-with-bespoke-suffix'});
  // solved quest whose oracle-probe target EXISTS
  writeQuest(root, 'q1',
    {probe: 'oracle', args: {file: 'solve/oracle/q1.json'}});
  writeLog(root, 'q1', [{type: 'quest', status: 'solved'}]);
  writeJson(root, 'solve/oracle', 'q1', {done: true});
  // scenario-harness quest (no oracle expected) recorded solved — legitimately clean
  writeQuest(root, 'q2',
    {probe: 'scenario-harness', args: {consecutive: 3}});
  writeLog(root, 'q2', [{type: 'quest', status: 'solved'}]);

  const r = checkLedgerConsistency(root);
  t.equal(r.errors.length, 0, `no errors: ${errText(r)}`);
  t.equal(r.warnings.length, 0, `no warnings: ${warnText(r)}`);
  t.end();
});

t.test('E1: versioned epic rejects manual status authority', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeEpic(root, 'bad.md', {
    id: 'bad', epicContractVersion: 2, roadmapRow: 'null', status: 'active',
  }, '## Decision log\n\n- pending\n');
  const withDefect = checkLedgerConsistency(root);
  t.match(errText(withDefect),
    /epic bad\.md: version 2 derives work stage and must not declare `status:` \(E1\)/u,
    'E1 prevents a second mutable lifecycle owner');

  writeEpic(root, 'bad.md', {
    id: 'bad', epicContractVersion: 2, roadmapRow: 'null', graduatesTo: 'null',
  }, '## Decision log\n\n- pending\n');
  t.equal(checkLedgerConsistency(root).errors.length, 0,
    'E1 clears when derived state is the only lifecycle authority');
  t.end();
});

t.test('legacy epic status remains readable during migration', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeEpic(root, 'legacy.md', {id: 'legacy', status: 'active'});
  const result = checkLedgerConsistency(root);
  t.equal(result.errors.length, 0, `legacy status is accepted: ${errText(result)}`);
  t.equal(result.warnings.length, 0, `legacy status remains recognized: ${warnText(result)}`);
  t.end();
});

t.test('E3: versioned epic is bounded to one-page planning size', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const longBody = Array.from({length: 151}, (_, index) => `line ${index}`).join('\n');
  writeEpic(root, 'long.md', {
    id: 'long', epicContractVersion: 2, roadmapRow: 'null', graduatesTo: 'null',
  }, `## Decision log\n${longBody}\n`);
  t.match(errText(checkLedgerConsistency(root)),
    /epic long\.md: version 2 exceeds the 150-line planning bound.*\(E3\)/u,
    'new epic cannot grow into a hidden spec');

  writeEpic(root, 'long.md', {id: 'long', status: 'active'}, `${longBody}\n`);
  t.equal(checkLedgerConsistency(root).errors.length, 0,
    'historical long epic is grandfathered rather than mass-rewritten');
  t.end();
});

t.test('versioned epic requires a decision log and rejects unknown contracts', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeEpic(root, 'missing-log.md', {
    id: 'missing-log', epicContractVersion: 2, graduatesTo: 'null',
  });
  t.match(errText(checkLedgerConsistency(root)),
    /epic missing-log\.md: version 2 requires `## Decision log` \(E4\)/u,
    'explicit human decisions keep one durable home');

  writeEpic(root, 'unknown.md', {
    id: 'unknown', epicContractVersion: 3, status: 'active',
  });
  t.match(errText(checkLedgerConsistency(root)),
    /epic unknown\.md: unsupported epicContractVersion 3 \(E5\)/u,
    'unknown contracts fail instead of falling back to legacy');
  t.end();
});

t.test('legacy epic still requires its historical status field', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeEpic(root, 'legacy.md', {id: 'legacy'});
  t.match(errText(checkLedgerConsistency(root)),
    /epic legacy\.md: missing legacy frontmatter `status:` \(E2\)/u,
    'legacy contract remains fail-closed during migration');
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
  writeQuest(root, 'orphan',
    {probe: 'oracle', args: {file: 'solve/oracle/orphan.json'}});
  writeLog(root, 'orphan', [{type: 'quest', status: 'solved'}]);
  // NB: no solve/oracle/orphan.json written
  const withDefect = checkLedgerConsistency(root);
  t.match(errText(withDefect),
    /quest orphan: questStatus=solved but its oracle-probe target .* is missing; .* \(Q1\)/,
    'Q1 fires when a solved quest lacks its oracle-probe target');

  // revert: create the target -> finding disappears
  writeJson(root, 'solve/oracle', 'orphan', {done: true});
  t.equal(checkLedgerConsistency(root).errors.length, 0, 'Q1 clears once the target exists');
  t.end();
});

t.test('Q1: clean clone accepts exact content-addressed historical evidence', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const id = 'archived';
  const sealedPath = 'test-output/reports/archived.verdict.json';
  writeQuest(root, id, {probe: 'oracle', args: {file: sealedPath}});
  const prepared = writeArchive(root, id, sealedPath);
  writeLog(root, id, [solvedEvidenceEvent(
    sealedPath, prepared.objects[0].entry.terminalEvidenceSha256)]);

  const result = checkLedgerConsistency(root);
  t.equal(fs.existsSync(path.join(root, sealedPath)), false,
    'ignored live oracle is absent');
  t.equal(fs.existsSync(path.join(root, 'solve/state')), false,
    'derived state cache is absent');
  t.equal(result.errors.length, 0, `archive satisfies Q1: ${errText(result)}`);
  t.end();
});

t.test('Q1: archive identity binding fails closed', async (t) => {
  const cases = [
    {
      name: 'Quest id mismatch',
      archiveId: 'other',
      archivePath: 'test-output/reports/archived.verdict.json',
      eventPath: 'test-output/reports/archived.verdict.json',
    },
    {
      name: 'sealed path mismatch',
      archiveId: 'archived',
      archivePath: 'test-output/reports/other.verdict.json',
      eventPath: 'test-output/reports/archived.verdict.json',
    },
    {
      name: 'terminal path mismatch',
      archiveId: 'archived',
      archivePath: 'test-output/reports/archived.verdict.json',
      eventPath: 'test-output/reports/other.verdict.json',
    },
    {
      name: 'terminal SHA-256 mismatch',
      archiveId: 'archived',
      archivePath: 'test-output/reports/archived.verdict.json',
      eventPath: 'test-output/reports/archived.verdict.json',
      eventSha256: 'f'.repeat(64),
    },
  ];
  for (const item of cases) {
    await t.test(item.name, (t) => {
      const root = mkFixture();
      t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
      const sealedPath = 'test-output/reports/archived.verdict.json';
      writeQuest(root, 'archived', {probe: 'oracle', args: {file: sealedPath}});
      const prepared = writeArchive(root, item.archiveId, item.archivePath);
      const sha256 = item.eventSha256 ||
        prepared.objects[0].entry.terminalEvidenceSha256;
      writeLog(root, 'archived', [solvedEvidenceEvent(item.eventPath, sha256)]);
      t.match(errText(checkLedgerConsistency(root)), /historical archive invalid:.*\(Q1\)/u,
        'identity mismatch remains Q1');
      t.end();
    });
  }
  t.end();
});

t.test('Q1: missing, noncanonical, duplicate, and tampered archive fails closed',
  async (t) => {
    const sealedPath = 'test-output/reports/archived.verdict.json';
    const fixture = () => {
      const root = mkFixture();
      writeQuest(root, 'archived', {probe: 'oracle', args: {file: sealedPath}});
      const prepared = writeArchive(root, 'archived', sealedPath);
      writeLog(root, 'archived', [solvedEvidenceEvent(
        sealedPath, prepared.objects[0].entry.terminalEvidenceSha256)]);
      return {root, prepared};
    };
    const paths = historicalOracleArchivePaths();
    const cases = [
      ['missing manifest', ({root}) => fs.rmSync(path.join(root, paths.manifest))],
      ['noncanonical manifest', ({root}) => fs.appendFileSync(
        path.join(root, paths.manifest), '\n')],
      ['duplicate entry', ({root, prepared}) => {
        prepared.manifest.entries.push({...prepared.manifest.entries[0]});
        fs.writeFileSync(path.join(root, paths.manifest),
          canonicalHistoricalOracleManifestBytes(prepared.manifest));
      }],
      ['tampered object', ({root, prepared}) => fs.appendFileSync(
        path.join(root, prepared.objects[0].entry.objectPath), 'tamper')],
      ['missing object', ({root, prepared}) => fs.rmSync(
        path.join(root, prepared.objects[0].entry.objectPath))],
    ];
    for (const [name, mutate] of cases) {
      await t.test(name, (t) => {
        const setup = fixture();
        t.teardown(() => fs.rmSync(setup.root, {recursive: true, force: true}));
        mutate(setup);
        t.match(errText(checkLedgerConsistency(setup.root)),
          /historical archive invalid:.*\(Q1\)/u, 'archive fault remains Q1');
        t.end();
      });
    }
    t.end();
  });

t.test('Q2: the exact sealed oracle done=true without terminal state is a WARNING', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const probeFile = 'solve/oracle/non-id-target/closure.json';
  writeQuest(root, 'q', {probe: 'oracle', args: {file: probeFile}});
  writeJsonFile(root, probeFile, {done: true});
  const r = checkLedgerConsistency(root);
  t.equal(r.errors.length, 0, 'Q2 does not gate');
  t.match(warnText(r), /oracle done=true but projected questStatus=open.*\(Q2\)/,
    'Q2 reads the sealed non-ID oracle target');
  t.end();
});

t.test('Q3: not-solved quest with a missing oracle-probe target is a WARNING', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeQuest(root, 'openq',
    {probe: 'oracle', args: {file: 'solve/oracle/openq.json'}});
  const r = checkLedgerConsistency(root);
  t.equal(r.errors.length, 0, 'Q3 does not gate (fresh quests legitimately lack oracles)');
  t.match(warnText(r), /oracle-probe target .* missing .*cannot evaluate closure.*\(Q3\)/,
    'Q3 warns on a latent unclosable quest');
  t.end();
});

t.test('clean clone projects a terminal log without solve/state cache', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeQuest(root, 'clean-clone',
    {probe: 'oracle', args: {file: 'solve/oracle/clean-clone.json'}});
  writeJson(root, 'solve/oracle', 'clean-clone', {done: true});
  writeLog(root, 'clean-clone', [{type: 'quest', status: 'solved'}]);

  const r = checkLedgerConsistency(root);
  t.equal(fs.existsSync(path.join(root, 'solve/state')), false,
    'fixture has no derived state directory');
  t.equal(r.errors.length, 0, `no errors: ${errText(r)}`);
  t.equal(r.warnings.length, 0, `no warnings: ${warnText(r)}`);
  t.end();
});

t.test('fresh failed closure evidence reopens a previously solved Quest', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeQuest(root, 'fresh-failure',
    {probe: 'oracle', args: {file: 'solve/oracle/fresh-failure.json'}});
  writeLog(root, 'fresh-failure', [
    {type: 'quest', status: 'solved'},
    {type: 'evidence-ingested', probeScope: 'doneWhen', done: false,
      invalidSample: false, evidence: 'fresh-failure.json'},
  ]);
  writeJson(root, 'solve/state', 'fresh-failure',
    {questId: 'fresh-failure', questStatus: 'solved'});

  const r = checkLedgerConsistency(root);
  t.equal(r.errors.length, 0, `stale solved cache does not trigger Q1: ${errText(r)}`);
  t.match(warnText(r), /quest fresh-failure: oracle-probe target .*\(Q3\)/,
    'Q3 observes the log-projected reopen');
  t.end();
});

t.test('structured verifier rejection reopens a previously solved Quest', (t) => {
  const root = mkFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const sha = 'a'.repeat(64);
  writeQuest(root, 'rejected',
    {probe: 'oracle', args: {file: 'solve/oracle/rejected.json'}});
  writeLog(root, 'rejected', [
    {type: 'attempt', frontier: 'rejected-main', verificationContractVersion: 1,
      changeRefIdentity: {sha256: sha}},
    {type: 'quest', status: 'solved'},
    {type: 'finding', frontier: 'rejected-main', kind: 'verifier-rejection',
      evidence: 'subagent:independent-review', verification: {
        schemaVersion: 1,
        scope: 'attempt',
        verdict: 'rejected',
        fingerprint: `sha256:${sha}`,
      }},
  ]);
  writeJson(root, 'solve/state', 'rejected',
    {questId: 'rejected', questStatus: 'solved'});

  const r = checkLedgerConsistency(root);
  t.equal(r.errors.length, 0, `stale solved cache does not trigger Q1: ${errText(r)}`);
  t.match(warnText(r), /quest rejected: oracle-probe target .*\(Q3\)/,
    'Q3 observes the verifier-rejected reopen');
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
