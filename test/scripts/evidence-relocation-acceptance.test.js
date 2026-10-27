/**
 * The relocation acceptance counts unmet conditions over the budget owner's
 * rows and the relocation records. Each scenario starts from a green fixture
 * repository and breaks exactly one condition, so every condition is shown
 * both met and unmet; the fixture's records are written in the evidence
 * owner's shapes (RELOCATION), never restated here.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  CONDITION, RELOCATION_QUEST_ID, relocationAcceptance,
} from '../../scripts/checks/evidence-relocation-acceptance.js';
import {METRIC} from '../../scripts/checks/solve-v2-budget.js';
import {RELOCATION} from '../../scripts/solve/evidence-store.js';
import {EVIDENCE_DIR, QUESTS_DIR} from '../../scripts/solve/schema.js';

const BUDGET_IDS = Object.freeze([METRIC.SOLVE_ACTIVE_BYTES,
  METRIC.SOLVE_FILES_OVER_1MB, METRIC.QUEST_DIRS_OFF_SHAPE]);
const BUNDLE = 'q--q-evidence-0123456789-2026-10-24.tar.gz';
const SOURCE_COMMIT = 'a'.repeat(40);
const RECEIPT = `${QUESTS_DIR}/q/${EVIDENCE_DIR}/receipt.json`;
const OLD_ROOT = `${QUESTS_DIR}/q/${EVIDENCE_DIR}/`;
const SHARD = `${RELOCATION.SHARD_DIR}/q--q-evidence-0123456789-2026-10-24.json`;

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, typeof content === 'string' ? content :
    `${JSON.stringify(content, null, 2)}\n`);
}

// The records live where the evidence owner puts them, outside every quest.
function evidence(relative) {
  return `${RELOCATION.RECORDS_DIR}/${RELOCATION_QUEST_ID}/${relative}`;
}

function okRows() {
  return BUDGET_IDS.map((id) => ({id, value: 0, budget: 0, ok: true, detail: []}));
}

// A repository whose relocation is complete: two files relocated from quest
// q (absent from the tree), q's required receipt present, and a passing
// verification bound to the shard it verified.
function greenRepository(t, {files = [['a.log', 'alpha'], ['b/c.tap', 'beta']]} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relocation-acceptance-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  write(root, `${QUESTS_DIR}/${RELOCATION_QUEST_ID}/quest.json`, {id: RELOCATION_QUEST_ID,
    doneWhen: {probe: 'script', args: {command: 'node scripts/checks/x.js --metric'}}});
  write(root, `${QUESTS_DIR}/q/quest.json`, {id: 'q', doneWhen: {probe: 'test-receipt',
    args: {file: RECEIPT, requiredReceipts: ['r1']}}});
  write(root, RECEIPT, {schema: 'test-receipt/1'});
  const bundleSha256 = sha('bundle');
  const entry = {bundle: BUNDLE, bundleSha256, url: `https://example.test/${BUNDLE}`,
    sourceCommit: SOURCE_COMMIT, root: OLD_ROOT, files: files.length, shard: SHARD};
  const shard = {schema: RELOCATION.SHARD_SCHEMA, bundle: BUNDLE, bundleSha256,
    url: entry.url, sourceCommit: SOURCE_COMMIT, root: OLD_ROOT,
    files: files.map(([name, content]) => [name, sha(content), content.length])};
  write(root, evidence(SHARD), shard);
  write(root, evidence(RELOCATION.INVENTORY_FILE),
    {schema: RELOCATION.INVENTORY_SCHEMA, bundles: [entry]});
  const shardSha256 = sha(fs.readFileSync(path.join(root, evidence(SHARD))));
  write(root, evidence(RELOCATION.VERIFICATION_FILE), {
    schema: RELOCATION.VERIFICATION_SCHEMA,
    bundles: [{bundle: BUNDLE, url: entry.url, bundleSha256, sourceCommit: SOURCE_COMMIT,
      shard: SHARD, shardSha256, verifiedAt: '2026-10-24T00:00:00.000Z',
      downloadedSha256: bundleSha256, extracted: true, manifestMatches: true, unexpectedMembers: [],
      members: files.length, results: RELOCATION.RESULT_MATCH.repeat(files.length),
      mismatches: [], verified: true}],
  });
  return root;
}

function unmet(root, budgetRows = okRows) {
  return relocationAcceptance({root, budgetRows})
    .filter((entry) => !entry.met).map((entry) => entry.id);
}

function editJson(root, relative, edit) {
  const file = path.join(root, relative);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

test('a complete, verified relocation meets every condition', (t) => {
  assert.deepEqual(unmet(greenRepository(t)), []);
});

test('each budget row over budget, or not reported, is one unmet condition', (t) => {
  const root = greenRepository(t);
  for (const id of BUDGET_IDS) {
    const rows = () => okRows().map((row) => row.id === id ?
      {...row, value: 1, ok: false} : row);
    assert.deepEqual(unmet(root, rows), [`budget:${id}`]);
  }
  assert.deepEqual(unmet(root, () => []), BUDGET_IDS.map((id) => `budget:${id}`),
    'a row the budget owner no longer reports is never read as met');
});

test('no relocation records at all leaves the inventory and verification unmet', (t) => {
  const root = greenRepository(t);
  fs.rmSync(path.join(root, evidence(RELOCATION.INVENTORY_FILE)));
  fs.rmSync(path.join(root, evidence(RELOCATION.VERIFICATION_FILE)));
  assert.deepEqual(unmet(root), [CONDITION.INVENTORY, CONDITION.VERIFIED]);
});

test('a malformed inventory is refused', (t) => {
  const root = greenRepository(t);
  editJson(root, evidence(SHARD), (shard) => {
    shard.files[0][1] = 'not-a-sha';
  });
  assert.ok(unmet(root).includes(CONDITION.INVENTORY));
  const other = greenRepository(t);
  editJson(other, evidence(RELOCATION.INVENTORY_FILE), (index) => {
    index.bundles[0].files = 3;
  });
  assert.ok(unmet(other).includes(CONDITION.INVENTORY),
    'a shard whose count disagrees with its index entry is malformed');
  const third = greenRepository(t, {files: [['a.log', 'alpha'], ['a.log', 'alpha']]});
  assert.ok(unmet(third).includes(CONDITION.INVENTORY), 'a path inventoried twice');
});

test('a bundle without a passing verification is unmet', (t) => {
  const cases = [
    (record) => {
      record.downloadedSha256 = sha('other');
    },
    (record) => {
      record.results = `${RELOCATION.RESULT_MISMATCH}${RELOCATION.RESULT_MATCH}`;
    },
    (record) => {
      record.results = RELOCATION.RESULT_MATCH;
    },
    (record) => {
      record.mismatches = [{path: 'a.log', reason: 'x'}];
    },
    (record) => {
      record.verified = false;
    },
    (record) => {
      record.extracted = false;
    },
  ];
  for (const breakIt of cases) {
    const root = greenRepository(t);
    editJson(root, evidence(RELOCATION.VERIFICATION_FILE), (value) => {
      breakIt(value.bundles[0]);
    });
    assert.deepEqual(unmet(root), [CONDITION.VERIFIED]);
  }
});

test('a shard edited after its verification no longer counts as verified', (t) => {
  const root = greenRepository(t);
  fs.appendFileSync(path.join(root, evidence(SHARD)), ' ');
  assert.deepEqual(unmet(root), [CONDITION.VERIFIED]);
});

test('an inventoried path still in the tree is unmet', (t) => {
  const root = greenRepository(t);
  write(root, `${OLD_ROOT}a.log`, 'alpha');
  assert.deepEqual(unmet(root), [CONDITION.ABSENT]);
});

test('a missing required artifact under solve/quests is unmet; one outside reach is not', (t) => {
  const root = greenRepository(t);
  fs.rmSync(path.join(root, RECEIPT));
  assert.deepEqual(unmet(root), [CONDITION.REQUIRED_PRESENT]);
  const legacy = greenRepository(t);
  write(legacy, `${QUESTS_DIR}/legacy/quest.json`, {id: 'legacy', doneWhen: {
    probe: 'oracle', args: {file: 'solve/oracle/legacy.json'}}});
  assert.deepEqual(unmet(legacy), [],
    'a v1 path outside solve/quests and solve/epics is not this relocation\'s reach');
});

test('an inventoried log, quest record or required artifact is unmet', (t) => {
  for (const name of ['log.ndjson', 'quest.json']) {
    const root = greenRepository(t, {files: [[`nested/${name}`, 'x']]});
    assert.deepEqual(unmet(root), [CONDITION.PROTECTED]);
  }
  const root = greenRepository(t, {files: [['receipt.json', 'receipt']]});
  // The receipt is both required and inventoried: it is present (so the
  // absence condition is unmet too), and inventorying it is refused.
  assert.deepEqual(unmet(root), [CONDITION.ABSENT, CONDITION.PROTECTED]);
});

test('records left under the quest\'s evidence/ are not read; --records reads a moved home', (t) => {
  const root = greenRepository(t);
  const legacy = `${QUESTS_DIR}/${RELOCATION_QUEST_ID}/${EVIDENCE_DIR}`;
  fs.cpSync(path.join(root, RELOCATION.RECORDS_DIR, RELOCATION_QUEST_ID),
    path.join(root, legacy), {recursive: true});
  fs.rmSync(path.join(root, RELOCATION.RECORDS_DIR), {recursive: true});
  assert.deepEqual(unmet(root), [CONDITION.INVENTORY, CONDITION.VERIFIED],
    'the owner location is the only default');
  assert.deepEqual(relocationAcceptance({root, budgetRows: okRows, records: legacy})
    .filter((entry) => !entry.met), [], 'an explicit records directory is honoured');
});
