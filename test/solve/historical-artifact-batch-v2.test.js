import {execFileSync, spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import tap from 'tap';

import {
  migrateInlineChangeArtifact,
  prepareContentAddressedChangeArtifact,
  readChangeArtifact,
} from
  '../../scripts/solve/content-addressed-change-artifact.js';
import {
  executeHistoricalArtifactBatch,
  historicalBatchReceiptPath,
  validateHistoricalArtifactBatchReceipt,
  validateHistoricalArtifactBatchTooling,
} from '../../scripts/solve/historical-artifact-batch-v2.js';
import {HISTORICAL_ARTIFACT_MIGRATION_V2 as CONTRACT} from
  '../../scripts/solve/historical-artifact-migration-v2-constants.js';
import {canonicalMigrationV2Bytes} from
  '../../scripts/solve/historical-artifact-migration-v2.js';
import {HISTORICAL_ARTIFACT_BATCH_FAULT_PRELOAD} from
  './helpers/historical-artifact-batch-fault-preload.js';

const AUTHORITY_COMMIT = '03f3b93d1dd03becb977f40bc3e5a099725d87d6';
const QUEST_PREFIX = 'solver-historical-artifact-batch-';
const QUEST_001 = `${QUEST_PREFIX}001`;
const QUEST_002 = `${QUEST_PREFIX}002`;
const CLI = path.resolve('scripts/migrate-solver-historical-artifact-batch.js');
const FAULT_PRELOAD = HISTORICAL_ARTIFACT_BATCH_FAULT_PRELOAD;
const SOURCE_REPO = process.cwd();
const TEXT_ENCODING = 'utf8';

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-v2-'));
  execFileSync('git', ['init', '-q'], {cwd: root});
  execFileSync('git', ['config', 'user.email', 'test@example.com'], {cwd: root});
  execFileSync('git', ['config', 'user.name', 'Test'], {cwd: root});
  return root;
}

function gitShow(relative) {
  return execFileSync('git', ['show', `${AUTHORITY_COMMIT}:${relative}`], {
    cwd: SOURCE_REPO,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return file;
}

function commit(root, paths = ['solve']) {
  execFileSync('git', ['add', ...paths], {cwd: root});
  execFileSync('git', ['commit', '-qm', 'fixture'], {cwd: root});
}

function questPath(questId) {
  return `solve/quests/${questId}.json`;
}

function installQuest(root, questId, bytes = '{}\n') {
  write(root, questPath(questId), bytes);
}

function installFixture(root) {
  const manifestBytes = gitShow(CONTRACT.MANIFEST_PATH);
  const manifest = JSON.parse(manifestBytes.toString(TEXT_ENCODING));
  const paths = [
    CONTRACT.MANIFEST_PATH,
    CONTRACT.CENSUS_PATH,
    CONTRACT.W12_RECEIPT_PATH,
    ...manifest.batches.flatMap((batch) =>
      batch.entries.map((entry) => entry.sourcePath)),
  ];
  for (const relative of new Set(paths)) {
    write(root, relative,
      relative === CONTRACT.MANIFEST_PATH ? manifestBytes : gitShow(relative));
  }
  commit(root);
  installQuest(root, QUEST_001);
  return manifest;
}

function batch(manifest, questId) {
  return manifest.batches.find((item) => item.questId === questId);
}

function receiptFile(root, questId = QUEST_001) {
  return path.join(root, historicalBatchReceiptPath(questId));
}

function sourceArtifact(root, entry) {
  return readChangeArtifact(root, `diff:${entry.sourcePath}`);
}

function cleanup(root) {
  fs.rmSync(root, {recursive: true, force: true});
}

function childExit(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, options);
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString(TEXT_ENCODING);
    });
    child.on('exit', (status) => resolve({status, stderr}));
  });
}

tap.test('tooling pins the production A2a authority', (t) => {
  const root = tempRoot();
  installFixture(root);
  const validation = validateHistoricalArtifactBatchTooling(root);
  t.equal(validation.valid, true, validation.problems.join('; '));
  t.equal(validation.manifestSha256, CONTRACT.AUTHORITATIVE_MANIFEST_SHA256);
  t.equal(validation.batchCount, CONTRACT.EXPECTED_BATCH_COUNT);
  t.equal(validation.payloadCount, CONTRACT.EXPECTED_PAYLOAD_COUNT);

  fs.appendFileSync(path.join(root, CONTRACT.MANIFEST_PATH), ' ');
  commit(root, [CONTRACT.MANIFEST_PATH]);
  t.match(validateHistoricalArtifactBatchTooling(root).problems.join(' '),
    /immutable authority/u);
  cleanup(root);
  t.end();
});

tap.test('batch 001 preserves identity, stages exact scope, and rejects replay', (t) => {
  const root = tempRoot();
  const manifest = installFixture(root);
  const entry = batch(manifest, QUEST_001).entries[0];
  const before = fs.readFileSync(path.join(root, entry.sourcePath));
  const result = executeHistoricalArtifactBatch(root, QUEST_001);
  const artifact = sourceArtifact(root, entry);
  const validation = validateHistoricalArtifactBatchReceipt(root, QUEST_001);

  t.equal(validation.valid, true, validation.problems.join('; '));
  t.equal(artifact.valid, true);
  t.equal(artifact.kind, 'content-addressed');
  t.equal(artifact.payload.equals(before), true);
  t.equal(result.receipt.before[0].payloadSha256,
    result.receipt.after[0].payloadSha256);
  t.equal(result.scope.migration.changedPaths, 4);
  t.ok(result.scope.migration.changedBytes > before.length);
  t.equal(result.scope.stagedPaths.includes(questPath(QUEST_001)), true);
  t.throws(() => executeHistoricalArtifactBatch(root, QUEST_001),
    /already exists|staged diff/u);
  cleanup(root);
  t.end();
});

tap.test('tamper and receipt deletion fail closed', (t) => {
  const root = tempRoot();
  installFixture(root);
  const {receipt} = executeHistoricalArtifactBatch(root, QUEST_001);
  const validReceipt = fs.readFileSync(receiptFile(root));
  fs.writeFileSync(receiptFile(root), Buffer.concat([validReceipt, Buffer.from(' ')]));
  t.equal(validateHistoricalArtifactBatchReceipt(root, QUEST_001).valid, false);
  fs.writeFileSync(receiptFile(root), validReceipt);

  const descriptor = path.join(root, receipt.after[0].descriptorPath);
  const descriptorBytes = fs.readFileSync(descriptor);
  fs.appendFileSync(descriptor, ' ');
  t.equal(validateHistoricalArtifactBatchReceipt(root, QUEST_001).valid, false);
  fs.writeFileSync(descriptor, descriptorBytes);

  const object = path.join(root, receipt.after[0].objectPath);
  const objectBytes = fs.readFileSync(object);
  fs.writeFileSync(object, Buffer.from('tampered'));
  t.equal(validateHistoricalArtifactBatchReceipt(root, QUEST_001).valid, false);
  fs.writeFileSync(object, objectBytes);
  t.equal(validateHistoricalArtifactBatchReceipt(root, QUEST_001).valid, true);

  fs.rmSync(receiptFile(root));
  execFileSync('git', ['reset', '-q'], {cwd: root});
  t.throws(() => executeHistoricalArtifactBatch(root, QUEST_001),
    /physical state/u);
  cleanup(root);
  t.end();
});

tap.test('partial descriptor, object, backup, and temp siblings reject', (t) => {
  const siblingRoot = tempRoot();
  const siblingManifest = installFixture(siblingRoot);
  const first = batch(siblingManifest, QUEST_001).entries[0];
  write(siblingRoot, first.plannedAfter.descriptorPath, '{}\n');
  t.throws(() => executeHistoricalArtifactBatch(siblingRoot, QUEST_001),
    /physical state/u);
  cleanup(siblingRoot);

  const objectRoot = tempRoot();
  const objectManifest = installFixture(objectRoot);
  const objectEntry = batch(objectManifest, QUEST_001).entries[0];
  const prepared = prepareContentAddressedChangeArtifact(
    objectEntry.sourcePath,
    fs.readFileSync(path.join(objectRoot, objectEntry.sourcePath)),
  );
  write(objectRoot, objectEntry.plannedAfter.objectPath, prepared.objectBytes);
  t.throws(() => executeHistoricalArtifactBatch(objectRoot, QUEST_001),
    /physical state/u);
  t.equal(fs.existsSync(path.join(objectRoot, objectEntry.sourcePath)), true);
  cleanup(objectRoot);

  const staleRoot = tempRoot();
  const staleManifest = installFixture(staleRoot);
  const staleEntry = batch(staleManifest, QUEST_001).entries[0];
  const staleSource = fs.readFileSync(path.join(staleRoot, staleEntry.sourcePath));
  write(staleRoot, `${staleEntry.sourcePath}.a2b-backup-${QUEST_001}`,
    'STALE-BACKUP');
  write(staleRoot,
    `${staleEntry.plannedAfter.descriptorPath}.a2b-staged-${QUEST_001}`,
    'STALE-TEMP');
  t.throws(() => executeHistoricalArtifactBatch(staleRoot, QUEST_001),
    /transaction sibling/u);
  t.equal(fs.readFileSync(path.join(staleRoot, staleEntry.sourcePath))
    .equals(staleSource), true);
  cleanup(staleRoot);
  t.end();
});

tap.test('future batch mutation rejects', (t) => {
  const futureRoot = tempRoot();
  const futureManifest = installFixture(futureRoot);
  const future = batch(futureManifest, QUEST_002).entries[0];
  migrateInlineChangeArtifact(futureRoot, future.sourcePath);
  t.throws(() => executeHistoricalArtifactBatch(futureRoot, QUEST_001),
    /physical state/u);
  cleanup(futureRoot);
  t.end();
});

tap.test('out-of-order and unexpected receipts reject', (t) => {
  const orderRoot = tempRoot();
  installFixture(orderRoot);
  installQuest(orderRoot, QUEST_002);
  t.throws(() => executeHistoricalArtifactBatch(orderRoot, QUEST_002),
    /ordinal prefix/u);
  write(orderRoot, historicalBatchReceiptPath(`${QUEST_PREFIX}999`), '{}\n');
  t.throws(() => executeHistoricalArtifactBatch(orderRoot, QUEST_001),
    /ordinal prefix/u);
  cleanup(orderRoot);
  t.end();
});

tap.test('corrupt pre-existing object and multi-payload failure roll back', (t) => {
  const corruptRoot = tempRoot();
  const corruptManifest = installFixture(corruptRoot);
  const first = batch(corruptManifest, QUEST_001).entries[0];
  write(corruptRoot, first.plannedAfter.objectPath, 'corrupt');
  t.throws(() => executeHistoricalArtifactBatch(corruptRoot, QUEST_001),
    /physical state/u);
  t.equal(fs.existsSync(path.join(corruptRoot, first.sourcePath)), true);
  t.equal(fs.existsSync(path.join(corruptRoot,
    first.plannedAfter.descriptorPath)), false);
  t.equal(fs.readFileSync(path.join(corruptRoot,
    first.plannedAfter.objectPath), TEXT_ENCODING), 'corrupt');
  cleanup(corruptRoot);

  const multiRoot = tempRoot();
  const multiManifest = installFixture(multiRoot);
  executeHistoricalArtifactBatch(multiRoot, QUEST_001);
  commit(multiRoot);
  installQuest(multiRoot, QUEST_002);
  const secondBatch = batch(multiManifest, QUEST_002);
  write(multiRoot, secondBatch.entries[1].plannedAfter.objectPath, 'corrupt');
  t.throws(() => executeHistoricalArtifactBatch(multiRoot, QUEST_002),
    /physical state/u);
  for (const entry of secondBatch.entries) {
    t.equal(fs.existsSync(path.join(multiRoot, entry.sourcePath)), true);
    t.equal(fs.existsSync(path.join(multiRoot,
      entry.plannedAfter.descriptorPath)), false);
  }
  t.equal(fs.existsSync(receiptFile(multiRoot, QUEST_002)), false);
  cleanup(multiRoot);
  t.end();
});

for (const phase of [
  'journal',
  'object',
  'descriptor',
  'source',
  'receipt-temporary',
  'receipt',
  'cleanup',
]) {
  tap.test(`restart recovery handles durable phase ${phase}`, (t) => {
    const root = tempRoot();
    installFixture(root);
    const killed = spawnSync(process.execPath,
      ['--import', FAULT_PRELOAD, CLI, '001'], {
        cwd: root,
        env: {...process.env, A2B_FAULT_PHASE: phase},
      });
    t.not(killed.status, 0, `${phase} interrupted`);
    if (['receipt', 'cleanup'].includes(phase)) {
      t.throws(() => executeHistoricalArtifactBatch(root, QUEST_001),
        /already exists/u, `${phase} rolls forward`);
    } else {
      executeHistoricalArtifactBatch(root, QUEST_001);
    }
    const validation = validateHistoricalArtifactBatchReceipt(root, QUEST_001);
    t.equal(validation.valid, true, `${phase}: ${validation.problems.join('; ')}`);
    cleanup(root);
    t.end();
  });
}

tap.test('forged journal paths cannot mutate unrelated files', (t) => {
  const root = tempRoot();
  installFixture(root);
  const killed = spawnSync(process.execPath,
    ['--import', FAULT_PRELOAD, CLI, '001'], {
      cwd: root,
      env: {...process.env, A2B_FAULT_PHASE: 'journal'},
    });
  t.not(killed.status, 0);
  const journalFile = `${receiptFile(root)}.transaction.json`;
  const journal = JSON.parse(fs.readFileSync(journalFile, TEXT_ENCODING));
  const unrelated = 'solve/changes/unrelated-preserve.txt';
  write(root, unrelated, 'preserve-me\n');
  journal.entries[0].backupPath = unrelated;
  fs.writeFileSync(journalFile, canonicalMigrationV2Bytes(journal));

  executeHistoricalArtifactBatch(root, QUEST_001);
  t.equal(fs.readFileSync(path.join(root, unrelated), TEXT_ENCODING),
    'preserve-me\n');
  t.equal(validateHistoricalArtifactBatchReceipt(root, QUEST_001).valid, true);
  cleanup(root);
  t.end();
});

tap.test('unrelated historical writes during execution are detected', (t) => {
  const root = tempRoot();
  const manifest = installFixture(root);
  const entry = batch(manifest, QUEST_001).entries[0];
  const result = spawnSync(process.execPath,
    ['--import', FAULT_PRELOAD, CLI, '001'], {
      cwd: root,
      env: {...process.env, A2B_FAULT_PHASE: 'unrelated-write'},
      encoding: TEXT_ENCODING,
    });
  t.not(result.status, 0);
  t.match(result.stderr, /unrelated historical file/u);
  t.equal(fs.existsSync(path.join(root, entry.sourcePath)), true);
  t.equal(fs.existsSync(receiptFile(root)), false);
  t.equal(fs.readFileSync(path.join(root,
    'solve/changes/injected-unrelated.txt'), TEXT_ENCODING),
  'injected-during-transaction\n');
  cleanup(root);
  t.end();
});

tap.test('stale-lock takeover has exactly one owner', async (t) => {
  const root = tempRoot();
  installFixture(root);
  write(root, `${historicalBatchReceiptPath(QUEST_001)}.lock`,
    `${JSON.stringify({pid: Number.MAX_SAFE_INTEGER, token: 'stale'})}\n`);
  const options = {cwd: root, stdio: ['ignore', 'ignore', 'pipe']};
  const results = await Promise.all([
    childExit(process.execPath, [CLI, '001'], options),
    childExit(process.execPath, [CLI, '001'], options),
  ]);
  t.equal(results.filter((result) => result.status === 0).length, 1);
  const validation = validateHistoricalArtifactBatchReceipt(root, QUEST_001);
  t.equal(validation.valid, true, validation.problems.join('; '));
  cleanup(root);
});

tap.test('invalid API quest ids cannot create transaction paths', (t) => {
  const root = tempRoot();
  installFixture(root);
  t.throws(() => executeHistoricalArtifactBatch(root, '../../escape'),
    /absent from A2a plan/u);
  t.equal(fs.existsSync(path.join(root,
    'solve/changes/escape.receipt.json.lock')), false);
  cleanup(root);
  t.end();
});

tap.test('live lock and actual staged/sized diffs reject before recording', (t) => {
  const lockedRoot = tempRoot();
  installFixture(lockedRoot);
  write(lockedRoot, `${historicalBatchReceiptPath(QUEST_001)}.lock`,
    `${JSON.stringify({pid: process.pid})}\n`);
  t.throws(() => executeHistoricalArtifactBatch(lockedRoot, QUEST_001),
    /transaction lock/u);
  cleanup(lockedRoot);

  const stagedRoot = tempRoot();
  const stagedManifest = installFixture(stagedRoot);
  for (let index = 0; index < 26; index += 1) {
    write(stagedRoot, `extra/path-${index}.txt`, `${index}\n`);
  }
  execFileSync('git', ['add', 'extra'], {cwd: stagedRoot});
  t.throws(() => executeHistoricalArtifactBatch(stagedRoot, QUEST_001),
    /outside this batch/u);
  const stagedSource = batch(stagedManifest, QUEST_001).entries[0].sourcePath;
  t.equal(fs.existsSync(path.join(stagedRoot, stagedSource)), true);
  t.equal(fs.existsSync(receiptFile(stagedRoot)), false);
  cleanup(stagedRoot);

  const sizedRoot = tempRoot();
  const sizedManifest = installFixture(sizedRoot);
  write(sizedRoot, questPath(QUEST_001), 'x'.repeat(200000));
  execFileSync('git', ['add', questPath(QUEST_001)], {cwd: sizedRoot});
  t.throws(() => executeHistoricalArtifactBatch(sizedRoot, QUEST_001),
    /256-KiB/u);
  const sizedSource = batch(sizedManifest, QUEST_001).entries[0].sourcePath;
  t.equal(fs.existsSync(path.join(sizedRoot, sizedSource)), true);
  t.equal(fs.existsSync(receiptFile(sizedRoot)), false);
  cleanup(sizedRoot);
  t.end();
});
