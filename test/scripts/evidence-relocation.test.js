/**
 * `solve evidence relocate`: committed bulk evidence leaves the tree only
 * after it is bundled with a manifest, uploaded through the existing add
 * path, downloaded again, and every member hashed equal to the manifest and
 * to the blob at the source commit. These scenarios use a fixture git
 * repository and a fake uploader standing in for the release; the real
 * upload is exercised by the relocation itself.
 */

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {evidenceRelocate} from '../../scripts/solve/commands.js';
import {
  MEMBER_MISMATCH, RELOCATION, RELOCATION_REFUSAL, bundleBasename, parsePathsList,
  relocationRefusals, sha256Of, sourceBlobs, sourceRefusals, verifyRelocationBundle,
  writeRelocationBundle, addingCommits, relocationManifest,
} from '../../scripts/solve/evidence-store.js';
import {relocationAcceptance} from '../../scripts/checks/evidence-relocation-acceptance.js';
import {METRIC} from '../../scripts/checks/solve-v2-budget.js';
import {readLog} from '../../scripts/solve/store.js';

const RECORD_QUEST = 'lineage-evidence-relocation';
const QUEST = 'bulky-quest';
const DATE = '2026-10-24';
const RECEIPT = `solve/quests/${QUEST}/evidence/receipt.json`;
const BULK = Object.freeze({
  [`solve/quests/${QUEST}/evidence/lab/run.log`]: 'lab log bytes\n',
  [`solve/quests/${QUEST}/evidence/lab/tap/a.tap`]: 'TAP version 13\nok 1\n',
  [`solve/quests/${QUEST}/evidence/dump.json`]: '{"big": true}\n',
});

function git(root, args) {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com',
    ...args], {cwd: root, encoding: 'utf8'});
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

function openQuest(root, id, doneWhen) {
  write(root, `solve/quests/${id}/quest.json`, {schema: 'solve-quest/2', id, doneWhen});
  write(root, `solve/quests/${id}/log.ndjson`, '');
}

// A committed repository holding bulk evidence on an open quest, its
// required receipt, and the open record quest.
function repository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-relocation-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init', '-q']);
  openQuest(root, RECORD_QUEST, {probe: 'script',
    args: {command: 'node scripts/checks/x.js --metric'}});
  openQuest(root, QUEST, {probe: 'test-receipt',
    args: {file: RECEIPT, requiredReceipts: ['r1']}});
  write(root, RECEIPT, {schema: 'test-receipt/1'});
  for (const [file, content] of Object.entries(BULK)) write(root, file, content);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'bulk evidence']);
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-relocation-tmp-'));
  t.after(() => fs.rmSync(tmpdir, {recursive: true, force: true}));
  return {root, tmpdir, head: git(root, ['rev-parse', 'HEAD']).trim()};
}

// The release, faked: an upload keeps the bytes, a download returns them
// (or, from the `tamperFrom`th download on, altered bytes).
function fakeRelease({tamperFrom = Infinity} = {}) {
  const assets = new Map();
  const calls = [];
  let downloads = 0;
  const run = (args) => {
    calls.push(args[1]);
    if (args[1] === 'upload') assets.set(path.basename(args[3]), fs.readFileSync(args[3]));
    if (args[1] === 'download') {
      downloads += 1;
      const name = args[args.indexOf('--pattern') + 1];
      const bytes = assets.get(name);
      fs.writeFileSync(path.join(args[args.indexOf('--dir') + 1], name),
        downloads >= tamperFrom ? Buffer.concat([bytes, Buffer.from('x')]) : bytes);
    }
    if (args[1] === 'view') {
      return JSON.stringify({assets: [...assets.keys()].map((name) =>
        ({name, url: `https://example.test/${name}`}))});
    }
    return '';
  };
  return {run, calls, assets};
}

function pathsFile(root, paths) {
  const file = path.join(root, 'relocate.list');
  fs.writeFileSync(file, `# bulk evidence\n${paths.join('\n')}\n\n`);
  return file;
}

test('a list names paths one per line, ignoring blanks and comments', () => {
  assert.deepEqual(parsePathsList('# c\n solve/a \n\nsolve/b\n'), ['solve/a', 'solve/b']);
  assert.equal(bundleBasename({label: 'q-lineage-evidence', sourceCommit: 'abcdef0123456',
    date: DATE}), 'q-lineage-evidence-abcdef012-2026-10-24.tar.gz');
});

test('records, logs, required artifacts, repeats and paths outside solve/ are refused', () => {
  const required = new Set(['solve/quests/q/evidence/receipt.json']);
  const refusals = relocationRefusals(['solve/quests/q/evidence/ok.log',
    'src/index.js', 'solve/../src/x.js', 'solve/quests/q/quest.json',
    'solve/quests/q/log.ndjson', 'solve/quests/q/evidence/receipt.json',
    'solve/quests/q/evidence/ok.log'], required);
  assert.deepEqual(refusals.map((entry) => entry.reason), [
    RELOCATION_REFUSAL.OUTSIDE_SOLVE, RELOCATION_REFUSAL.OUTSIDE_SOLVE,
    RELOCATION_REFUSAL.QUEST_RECORD, RELOCATION_REFUSAL.QUEST_LOG,
    RELOCATION_REFUSAL.REQUIRED_ARTIFACT, RELOCATION_REFUSAL.DUPLICATE]);
});

test('a path absent at the source commit, or edited since, is refused', (t) => {
  const {root, head} = repository(t);
  const [first] = Object.keys(BULK);
  fs.appendFileSync(path.join(root, first), 'edited');
  const paths = [first, 'solve/quests/bulky-quest/evidence/never-committed.log'];
  assert.deepEqual(sourceRefusals(root, paths, sourceBlobs(root, head, paths))
    .map((entry) => entry.reason),
  [RELOCATION_REFUSAL.TREE_DRIFT, RELOCATION_REFUSAL.NOT_AT_SOURCE]);
});

test('the manifest names every path with its source bytes and adding commit', (t) => {
  const {root, head} = repository(t);
  const paths = Object.keys(BULK);
  const blobs = sourceBlobs(root, head, paths);
  const manifest = relocationManifest({paths, sourceCommit: head, blobs,
    adds: addingCommits(root, head, paths)});
  assert.equal(manifest.schema, RELOCATION.MANIFEST_SCHEMA);
  assert.deepEqual(manifest.files.map((entry) => entry.path), [...paths].sort());
  for (const entry of manifest.files) {
    assert.equal(entry.sha256, sha256Of(path.join(root, entry.path)));
    assert.equal(entry.bytes, Buffer.byteLength(BULK[entry.path]));
    assert.equal(entry.addedCommit, head);
  }
});

test('verification hashes every downloaded member against manifest and source', (t) => {
  const {root, head, tmpdir} = repository(t);
  const paths = Object.keys(BULK);
  const blobs = sourceBlobs(root, head, paths);
  const manifest = relocationManifest({paths, sourceCommit: head, blobs,
    adds: addingCommits(root, head, paths)});
  const scratch = fs.mkdtempSync(path.join(tmpdir, 'bundle-'));
  const bundle = writeRelocationBundle({root, manifest, scratch, basename: 'b.tar.gz'});
  const release = fakeRelease();
  release.run(['release', 'upload', 'solve-evidence', bundle]);
  const good = verifyRelocationBundle({asset: 'b.tar.gz', manifest, blobs,
    run: release.run, tmpdir});
  assert.equal(good.downloadedSha256, sha256Of(bundle));
  assert.equal(good.manifestMatches, true);
  assert.deepEqual(good.unexpectedMembers, []);
  assert.equal(good.results, RELOCATION.RESULT_MATCH.repeat(paths.length));
  // A source blob that differs from what was bundled is a member mismatch.
  const drifted = new Map(blobs);
  drifted.set(paths[0], {sha256: '0'.repeat(64), bytes: 1});
  const bad = verifyRelocationBundle({asset: 'b.tar.gz', manifest, blobs: drifted,
    run: release.run, tmpdir});
  assert.deepEqual(bad.mismatches, [{path: paths[0], reason: MEMBER_MISMATCH.SOURCE}]);
  assert.equal(bad.results.includes(RELOCATION.RESULT_MISMATCH), true);
});

test('a dry run plans the bundle and touches neither the release nor the tree', (t) => {
  const {root, head, tmpdir} = repository(t);
  const release = fakeRelease();
  const plan = evidenceRelocate(root, {id: QUEST, recordTo: RECORD_QUEST,
    pathsFile: pathsFile(root, Object.keys(BULK)), sourceCommit: head, date: DATE,
    dryRun: true, run: release.run, tmpdir});
  assert.equal(plan.files, 3);
  assert.equal(plan.bundle, `${QUEST}-evidence-${head.slice(0, 9)}-${DATE}.tar.gz`);
  assert.deepEqual(release.calls, []);
  for (const file of Object.keys(BULK)) assert.ok(fs.existsSync(path.join(root, file)));
});

test('a required artifact in the list refuses the relocation before any upload', (t) => {
  const {root, head, tmpdir} = repository(t);
  const release = fakeRelease();
  assert.throws(() => evidenceRelocate(root, {id: QUEST, recordTo: RECORD_QUEST,
    pathsFile: pathsFile(root, [...Object.keys(BULK), RECEIPT]), sourceCommit: head,
    run: release.run, tmpdir}), /refusing 1 path.*receipt\.json: a proof artifact/su);
  assert.deepEqual(release.calls, []);
});

test('a bundle whose re-download does not verify removes nothing and records nothing', (t) => {
  const {root, head, tmpdir} = repository(t);
  // The add path's own download verifies; the independent second one is altered.
  const release = fakeRelease({tamperFrom: 2});
  assert.throws(() => evidenceRelocate(root, {id: QUEST, recordTo: RECORD_QUEST,
    pathsFile: pathsFile(root, Object.keys(BULK)), sourceCommit: head, date: DATE,
    run: release.run, tmpdir}), /did not verify; nothing was removed/u);
  for (const file of Object.keys(BULK)) assert.ok(fs.existsSync(path.join(root, file)));
  assert.equal(fs.existsSync(path.join(root, RELOCATION.RECORDS_DIR, RECORD_QUEST,
    RELOCATION.INVENTORY_FILE)), false);
  assert.equal(fs.existsSync(path.join(root, 'solve/quests', RECORD_QUEST, 'evidence')), false);
});

test('a verified relocation records the mapping, removes the paths, and meets acceptance', (t) => {
  const {root, head, tmpdir} = repository(t);
  const release = fakeRelease();
  const result = evidenceRelocate(root, {id: QUEST, recordTo: RECORD_QUEST,
    pathsFile: pathsFile(root, Object.keys(BULK)), sourceCommit: head, date: DATE,
    run: release.run, tmpdir});
  assert.equal(result.removed, 3);
  for (const file of Object.keys(BULK)) assert.equal(fs.existsSync(path.join(root, file)), false);
  assert.ok(fs.existsSync(path.join(root, RECEIPT)), 'the required receipt stays');
  const [finding] = readLog(root, QUEST);
  assert.equal(finding.kind, 'evidence');
  assert.equal(finding.asset, result.uploaded.asset);
  assert.match(git(root, ['status', '--porcelain']), /^D {2}solve\/quests\/bulky-quest\/evidence\/dump\.json$/mu,
    'removal is staged with git rm');
  const okRows = () => [METRIC.SOLVE_ACTIVE_BYTES, METRIC.SOLVE_FILES_OVER_1MB,
    METRIC.QUEST_DIRS_OFF_SHAPE].map((id) => ({id, value: 0, budget: 0, ok: true}));
  const conditions = relocationAcceptance({root, budgetRows: okRows});
  assert.deepEqual(conditions.filter((entry) => !entry.met), [],
    'the records the tool writes are the records acceptance reads');
  const records = path.join(RELOCATION.RECORDS_DIR, RECORD_QUEST);
  assert.equal(result.records, records);
  for (const file of [RELOCATION.INVENTORY_FILE, RELOCATION.VERIFICATION_FILE,
    result.recorded.shard]) {
    assert.ok(fs.existsSync(path.join(root, records, file)), `${file} under ${records}`);
  }
});

test('a relocation recorded by a quest leaves nothing under that quest\'s evidence/', (t) => {
  // Records written under the recording quest would be off the closed-quest
  // shape the moment it closes; the owner writes them to its record home.
  const {root, head, tmpdir} = repository(t);
  const release = fakeRelease();
  evidenceRelocate(root, {id: QUEST, recordTo: RECORD_QUEST,
    pathsFile: pathsFile(root, Object.keys(BULK)), sourceCommit: head, date: DATE,
    run: release.run, tmpdir});
  const recordQuest = path.join(root, 'solve/quests', RECORD_QUEST);
  assert.deepEqual(fs.readdirSync(recordQuest).sort(), ['log.ndjson', 'quest.json']);
  const evidence = path.join(root, 'solve/quests', QUEST, 'evidence');
  assert.deepEqual(fs.readdirSync(evidence), ['receipt.json'],
    'the uploading quest keeps only its required receipt');
});
