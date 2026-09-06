// The v1 -> v2 migration over a small fixture tree: every log entry is
// accounted for (zero unmapped), records are whole under legacy, open-quest
// evidence moves into the quest directory with probe paths rewritten, drafts
// without a roadmap row are deleted, orphan logs and the theory ledger fold
// into legacy quests, and closed material goes to one archive bundle.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  ARCHIVE_NAME, MIGRATION_INVENTORY_FILE, REPORT_FILE, migrate,
  verifyMigrationCorpus, writeMigrationInventory,
} from '../../scripts/solve/migrate-v1.js';
import {listQuestIds, questState, readEpic, readLog, readQuest} from '../../scripts/solve/store.js';
import {epicProblems, questProblems} from '../../scripts/solve/schema.js';

const OPEN_ID = 'open-quest';
const CLOSED_ID = 'closed-quest';
const DRAFT_ID = 'draft-quest';
const ROW_DRAFT_ID = 'row-draft';
const ORPHAN_ID = 'orphan-log';
const EPIC_ID = 'demo-epic';
const ROADMAP_ROW = 'RM-0.1-demo';
const SHA = 'b'.repeat(40);
const GIT_USER = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];
const STATEMENT = 'Demo statement.';
const LEDGER = ['# Experiment And Theory Ledger', '', 'preamble', '',
  '## theory-20260101-cited', '', '- Status: supported',
  `- Hypothesis: cited theory (solve/quests/${CLOSED_ID}.json)`, '',
  '## theory-20260102-orphan', '', '- Status: falsified', '- Hypothesis: orphan theory', ''];

function git(root, args) {
  return execFileSync('git', [...GIT_USER, ...args], {cwd: root, encoding: 'utf8'});
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

function lines(entries) {
  return entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
}

function v1Quest(id, links = {}, extra = {}) {
  return {id, statement: STATEMENT, class: 'product', priority: 1,
    links: {roadmapRow: null, planDoc: `solve/epics/${EPIC_ID}.md`, draftedAtCommit: SHA, ...links},
    doneWhen: {probe: 'oracle', args: {file: `solve/oracle/${id}.json`}},
    frontiers: [{id: `${id}-main`, metric: {probe: 'oracle', args: {file: `solve/oracle/${id}.json`}}}],
    constraints: [], ...extra};
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-migrate-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init', '-q']);
  // The code under test commits through this repository, and a machine
  // without a global git identity (any CI runner) would otherwise refuse.
  git(root, ['config', 'user.name', 'lagrange-test']);
  git(root, ['config', 'user.email', 'lagrange-test@example.com']);
  write(root, `solve/epics/${EPIC_ID}.md`, ['---', 'epicContractVersion: 2', `id: ${EPIC_ID}`,
    'roadmapRow: null', 'graduatesTo: null', '---', '', '# Demo epic', ''].join('\n'));
  write(root, 'solve/epics/README.md', '# epics\n');
  write(root, 'solve/epics/_template.md', '---\nid: <id>\n---\n');
  write(root, `solve/quests/${OPEN_ID}.json`, v1Quest(OPEN_ID));
  write(root, `solve/log/${OPEN_ID}.ndjson`, lines([
    {type: 'quest-declared', sealed: {statement: STATEMENT}},
    {type: 'attempt', hypothesis: 'h'},
    {type: 'finding', kind: 'verifier-approval', claim: 'ok'},
    {type: 'gate-decision', code: 'x'},
  ]));
  write(root, `solve/oracle/${OPEN_ID}.json`, {metric: 1, target: 0});
  write(root, `solve/evidence/${OPEN_ID}.receipt.json`, {ok: true});
  write(root, `solve/changes/${OPEN_ID}/attempt-1.diff.gz`, 'not really gzip');
  write(root, `solve/quests/${CLOSED_ID}.json`, v1Quest(CLOSED_ID, {planDoc: null}));
  write(root, `solve/log/${CLOSED_ID}.ndjson`, lines([
    {type: 'quest-declared', sealed: {statement: STATEMENT}},
    {type: 'attempt', hypothesis: 'h'},
    {type: 'solved', frontier: `${CLOSED_ID}-main`},
    {type: 'quest', status: 'solved'},
  ]));
  write(root, `solve/evidence/${CLOSED_ID}.receipt.json`, {ok: true});
  write(root, `solve/changes/${CLOSED_ID}/attempt-1.diff.json`, {diff: 'x'});
  write(root, `solve/quests/${DRAFT_ID}.json`, v1Quest(DRAFT_ID));
  write(root, `solve/quests/${ROW_DRAFT_ID}.json`, v1Quest(ROW_DRAFT_ID, {roadmapRow: ROADMAP_ROW}));
  write(root, `solve/log/${ORPHAN_ID}.ndjson`, lines([{type: 'reflection', text: 'r'}]));
  write(root, 'solve/theory-ledger.md', LEDGER.join('\n'));
  write(root, 'solve/release-0-1-0-alpha-readiness.json', {metric: 0});
  write(root, 'solve/config.example.json', {enabled: false});
  write(root, 'solve/report/x.json', {});
  write(root, 'solve/changes/global-owner-debt-inventory/inventory.json', {});
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'v1 tree']);
  return root;
}

test('migration is lossless, on shape, and accounts for every entry', (t) => {
  const root = fixture(t);
  const bundleDir = path.join(root, 'bundle-out');
  const result = migrate(root, {bundleDir});
  assert.equal(result.entries, 9);
  assert.equal(result.unmapped, 0);
  assert.equal(result.drafts, 2);
  assert.ok(fs.existsSync(path.join(bundleDir, ARCHIVE_NAME)));
  const report = fs.readFileSync(path.join(root, REPORT_FILE), 'utf8');
  assert.match(report, /Mapped: 9\. Unmapped: 0\./u);
  assert.match(report, /\| gate-decision -> kept verbatim \| 1 \|/u);
  assert.match(report, /\| finding -> verification \| 1 \|/u);
  assert.match(report, /\(empty\)/u);
  assert.deepEqual(listQuestIds(root).sort(), [CLOSED_ID, OPEN_ID, ORPHAN_ID, 'theory-ledger']);
  for (const id of listQuestIds(root)) {
    assert.deepEqual(questProblems(readQuest(root, id)), [], id);
  }
  // Open quest: evidence moved, probe path rewritten, sealed for v2, legacy whole.
  const open = readQuest(root, OPEN_ID);
  assert.equal(open.epic, EPIC_ID);
  assert.equal(open.sealedAt, SHA);
  assert.equal(open.doneWhen.args.file, `solve/quests/${OPEN_ID}/evidence/oracle.json`);
  assert.ok(fs.existsSync(path.join(root, open.doneWhen.args.file)));
  assert.ok(fs.existsSync(path.join(root, `solve/quests/${OPEN_ID}/evidence/${OPEN_ID}.receipt.json`)));
  // An archive may not live under solve/, so it goes to the bundle even for
  // an open quest, and never into the quest directory.
  assert.equal(fs.existsSync(path.join(root,
    `solve/quests/${OPEN_ID}/evidence/changes/attempt-1.diff.gz`)), false);
  assert.ok(readLog(root, OPEN_ID).some((entry) => entry.kind === 'evidence' &&
    entry.archive === ARCHIVE_NAME &&
    entry.files.includes(`solve/changes/${OPEN_ID}/attempt-1.diff.gz`)));
  assert.deepEqual(open.legacy.frontiers.length, 1);
  assert.equal(open.legacy.links.planDoc, `solve/epics/${EPIC_ID}.md`);
  const openState = questState(readLog(root, OPEN_ID));
  assert.equal(openState.status, 'open');
  assert.ok(openState.seal, 'a migrated open quest is sealed');
  assert.equal(readLog(root, OPEN_ID)[0].type, 'quest-declared', 'v1 bytes first, verbatim');
  // Closed quest: no evidence dir, archive finding, cited theory attached, legacy epic.
  const closed = readQuest(root, CLOSED_ID);
  assert.equal(closed.epic, 'legacy');
  assert.equal(fs.existsSync(path.join(root, `solve/quests/${CLOSED_ID}/evidence`)), false);
  const closedLog = readLog(root, CLOSED_ID);
  assert.equal(questState(closedLog).status, 'solved');
  assert.ok(closedLog.some((entry) => entry.kind === 'evidence' && entry.archive === ARCHIVE_NAME));
  assert.ok(closedLog.some((entry) => entry.kind === 'theory' && entry.status === 'supported'));
  // Orphan log and ledger become superseded legacy quests.
  assert.equal(questState(readLog(root, ORPHAN_ID)).status, 'superseded');
  const ledger = readLog(root, 'theory-ledger');
  assert.ok(ledger.some((entry) => entry.kind === 'theory' && entry.status === 'falsified'));
  assert.equal(questState(ledger).status, 'superseded');
  // Epics: rewritten front-matter is valid; the row draft became a line.
  const epic = readEpic(root, EPIC_ID);
  assert.deepEqual(epicProblems(epic.front), []);
  assert.equal(epic.front.status, 'open');
  assert.equal(epic.front.legacy, true);
  assert.ok(epic.front.quests.includes(OPEN_ID));
  assert.match(epic.body, new RegExp(`- ${ROW_DRAFT_ID} \\(${ROADMAP_ROW}\\)`, 'u'));
  assert.deepEqual(epicProblems(readEpic(root, 'legacy').front), []);
  // v1 layout gone, generated inventory kept.
  for (const gone of ['solve/log', 'solve/evidence', 'solve/oracle', 'solve/report',
    `solve/quests/${OPEN_ID}.json`, `solve/quests/${DRAFT_ID}.json`, 'solve/theory-ledger.md',
    'solve/config.example.json', `solve/changes/${CLOSED_ID}`]) {
    assert.equal(fs.existsSync(path.join(root, gone)), false, gone);
  }
  assert.ok(fs.existsSync(path.join(root, 'solve/changes/global-owner-debt-inventory/inventory.json')));
  assert.throws(() => migrate(root, {bundleDir}), /already ran/u);
});

test('the grandfathered corpus is inventoried and its integrity is standing', (t) => {
  const root = fixture(t);
  const baseCommit = git(root, ['rev-parse', 'HEAD']).trim();
  migrate(root, {bundleDir: path.join(root, 'bundle-out')});
  const inventory = writeMigrationInventory(root, baseCommit);
  // One entry per v1 log that became a migrated quest: the two declared
  // quests and the orphan log; drafts carry no log and no payload.
  assert.deepEqual(inventory.quests.map((quest) => quest.id).sort(),
    [CLOSED_ID, OPEN_ID, ORPHAN_ID].sort());
  assert.equal(inventory.baseCommit, baseCommit);
  assert.equal(inventory.totals.quests, 3);
  assert.ok(inventory.totals.bytes > 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(
    path.join(root, MIGRATION_INVENTORY_FILE), 'utf8')), inventory);

  const intact = verifyMigrationCorpus(root);
  assert.deepEqual(intact.drift, [], 'the migration is lossless');
  assert.equal(intact.bytes, inventory.totals.bytes);

  // v2 entries appended after the migration never disturb the payload.
  const openLog = path.join(root, `solve/quests/${OPEN_ID}/log.ndjson`);
  fs.appendFileSync(openLog, `${JSON.stringify({type: 'attempt', text: 'later'})}\n`);
  assert.deepEqual(verifyMigrationCorpus(root).drift, []);

  // Every way of losing the payload is named; each edit is inside it.
  const closedLog = path.join(root, `solve/quests/${CLOSED_ID}/log.ndjson`);
  const closedBytes = fs.readFileSync(closedLog);
  const payload = inventory.quests.find((quest) => quest.id === CLOSED_ID).bytes;
  fs.writeFileSync(closedLog, closedBytes.subarray(0, payload - 1));
  assert.deepEqual(verifyMigrationCorpus(root).drift,
    [{id: CLOSED_ID, reason: 'log is shorter than its migrated v1 payload'}]);
  const rewritten = Buffer.from(closedBytes);
  rewritten[0] = rewritten[0] === 0x78 ? 0x79 : 0x78;
  fs.writeFileSync(closedLog, rewritten);
  assert.match(verifyMigrationCorpus(root).drift[0].reason, /digest/u);
  fs.rmSync(closedLog);
  assert.deepEqual(verifyMigrationCorpus(root).drift,
    [{id: CLOSED_ID, reason: 'log is gone'}]);
});
