/**
 * The relocation acceptance counts unmet conditions over the budget owner's
 * rows and the relocation records. Each scenario starts from a green fixture
 * repository and breaks exactly one condition, so every condition is shown
 * both met and unmet; the fixture's records are written in the evidence
 * owner's shapes (RELOCATION), never restated here.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RELOCATION_QUEST_ID,
} from '../../scripts/checks/evidence-relocation-acceptance.js';
import {RELOCATION} from '../../scripts/solve/evidence-store.js';
import {EVIDENCE_DIR, QUESTS_DIR} from '../../scripts/solve/schema.js';

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


export {greenRepository, write, editJson, evidence, sha, SHARD, OLD_ROOT, BUNDLE, RECEIPT};
function editJson(root, relative, edit) {
  const file = path.join(root, relative);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
