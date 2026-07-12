import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import tap from 'tap';

import {migrateInlineChangeArtifact} from
  '../../scripts/solve/content-addressed-change-artifact.js';
import {
  buildHistoricalArtifactCensus,
  canonicalHistoricalCensusBytes,
} from '../../scripts/solve/historical-artifact-census.js';
import {
  canonicalMigrationV2Bytes,
  historicalMigrationV2Paths,
  validateHistoricalMigrationV2Manifest,
  writeHistoricalMigrationV2Manifest,
} from '../../scripts/solve/historical-artifact-migration-v2.js';

const W12_RECEIPT =
  'solve/changes/solver-proof-artifact-content-addressing/migration-receipt.json';
const CENSUS_PATH = 'solve/changes/solver-historical-artifact-census/census.json';
const SOURCE_PATH = 'solve/changes/alpha/attempt-1.diff';
const TEST_CONTRACT = Object.freeze({
  expectedBatchCount: 1,
  expectedPayloadCount: 1,
});

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-v2-'));
  execFileSync('git', ['init', '-q'], {cwd: root});
  execFileSync('git', ['config', 'user.email', 'test@example.com'], {cwd: root});
  execFileSync('git', ['config', 'user.name', 'Test'], {cwd: root});
  return root;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return file;
}

function commit(root, message) {
  execFileSync('git', ['add', 'solve'], {cwd: root});
  execFileSync('git', ['commit', '-qm', message], {cwd: root});
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

function patchContent(marker, bytes = 40000) {
  return [
    'diff --git a/src/a.js b/src/a.js',
    '--- a/src/a.js',
    '+++ b/src/a.js',
    '@@ -1 +1 @@',
    '-before',
    `+${marker}`,
    '',
  ].join('\n').padEnd(bytes, marker);
}

function installFixture(root) {
  write(root, W12_RECEIPT, '{"schemaVersion":1,"kind":"w12"}\n');
  write(root, SOURCE_PATH, patchContent('alpha'));
  write(root, 'solve/log/alpha.ndjson', `${JSON.stringify({
    type: 'attempt',
    changeRef: `diff:${SOURCE_PATH}`,
  })}\n`);
  const baseline = commit(root, 'baseline');
  const census = buildHistoricalArtifactCensus(root, {commit: baseline});
  write(root, CENSUS_PATH, canonicalHistoricalCensusBytes(census));
  commit(root, 'census');
  return census;
}

function manifestFile(root) {
  return path.join(root, historicalMigrationV2Paths().manifest);
}

function validate(root) {
  return validateHistoricalMigrationV2Manifest(root, TEST_CONTRACT);
}

tap.test('v2 manifest binds census, schema, batches, and logical identities', (t) => {
  const root = tempRoot();
  const census = installFixture(root);
  const sourceBefore = fs.readFileSync(path.join(root, SOURCE_PATH));
  const w12Before = fs.readFileSync(path.join(root, W12_RECEIPT));
  const result = writeHistoricalMigrationV2Manifest(root, TEST_CONTRACT);
  const validation = validate(root);

  t.equal(validation.valid, true, validation.problems.join('; '));
  t.equal(result.manifest.schemaVersion, 2);
  t.equal(result.manifest.batches.length, 1);
  t.equal(result.manifest.batches[0].entries.length, 1);
  t.equal(result.manifest.census.censusSha256, census.censusSha256);
  const entry = result.manifest.batches[0].entries[0];
  t.equal(entry.before.payloadSha256, entry.plannedAfter.payloadSha256);
  t.equal(entry.before.payloadBytes, entry.plannedAfter.payloadBytes);
  t.equal(entry.plannedAfter.descriptorPath, `${SOURCE_PATH}.json`);
  t.equal(fs.readFileSync(path.join(root, SOURCE_PATH)).equals(sourceBefore), true);
  t.equal(fs.readFileSync(path.join(root, W12_RECEIPT)).equals(w12Before), true);
  t.equal(fs.existsSync(path.join(root,
    historicalMigrationV2Paths().batchReceipts)), false);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('creation is immutable, while receipt-loss recovery is byte-identical', (t) => {
  const root = tempRoot();
  installFixture(root);
  const first = writeHistoricalMigrationV2Manifest(root, TEST_CONTRACT);
  const firstBytes = fs.readFileSync(manifestFile(root));
  t.throws(() => writeHistoricalMigrationV2Manifest(root, TEST_CONTRACT),
    /already exists/u);
  fs.rmSync(manifestFile(root));
  const recovered = writeHistoricalMigrationV2Manifest(root, TEST_CONTRACT);
  t.equal(canonicalMigrationV2Bytes(first.manifest)
    .equals(canonicalMigrationV2Bytes(recovered.manifest)), true);
  t.equal(fs.readFileSync(manifestFile(root)).equals(firstBytes), true);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('manifest tampering and partial coverage fail validation', (t) => {
  const root = tempRoot();
  installFixture(root);
  const {manifest} = writeHistoricalMigrationV2Manifest(root, TEST_CONTRACT);
  const variants = [
    {...manifest, batchInventorySha256: 'tampered'},
    {...manifest, batches: []},
    {...manifest, batches: [{...manifest.batches[0], ordinal: 2}]},
    {...manifest, batches: [{...manifest.batches[0], pathCount: 26}]},
    {...manifest, batches: [{
      ...manifest.batches[0],
      entries: [{
        ...manifest.batches[0].entries[0],
        plannedAfter: {
          ...manifest.batches[0].entries[0].plannedAfter,
          descriptorPath: '../../escape.diff.json',
        },
      }],
    }]},
  ];
  for (const variant of variants) {
    fs.writeFileSync(manifestFile(root), canonicalMigrationV2Bytes(variant));
    t.equal(validate(root).valid, false);
  }
  fs.writeFileSync(manifestFile(root), Buffer.concat([
    canonicalMigrationV2Bytes(manifest),
    Buffer.from(' '),
  ]));
  t.equal(validate(root).valid, false, 'noncanonical whitespace fails');

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('census, W12, source, and preexisting batch drift fail closed', (t) => {
  const root = tempRoot();
  installFixture(root);
  writeHistoricalMigrationV2Manifest(root, TEST_CONTRACT);
  const validManifest = fs.readFileSync(manifestFile(root));
  const validW12 = fs.readFileSync(path.join(root, W12_RECEIPT));
  const validCensus = fs.readFileSync(path.join(root, CENSUS_PATH));
  const validSource = fs.readFileSync(path.join(root, SOURCE_PATH));

  fs.appendFileSync(path.join(root, W12_RECEIPT), ' ');
  t.equal(validate(root).valid, false, 'W12 identity drift fails');
  fs.writeFileSync(path.join(root, W12_RECEIPT), validW12);

  fs.appendFileSync(path.join(root, CENSUS_PATH), ' ');
  t.equal(validate(root).valid, false, 'uncommitted census drift fails');
  fs.writeFileSync(path.join(root, CENSUS_PATH), validCensus);

  fs.appendFileSync(path.join(root, SOURCE_PATH), ' ');
  t.equal(validate(root).valid, false, 'logical source drift fails');
  fs.writeFileSync(path.join(root, SOURCE_PATH), validSource);
  fs.writeFileSync(manifestFile(root), validManifest);

  fs.rmSync(manifestFile(root));
  write(root, `${historicalMigrationV2Paths().batchReceipts}/partial.json`, '{}\n');
  const missing = validate(root);
  t.equal(missing.valid, false);
  t.match(missing.problems.join(' '), /batch receipts exist/u);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('creation rejects already migrated or missing sources', (t) => {
  const migratedRoot = tempRoot();
  installFixture(migratedRoot);
  migrateInlineChangeArtifact(migratedRoot, SOURCE_PATH);
  t.throws(() => writeHistoricalMigrationV2Manifest(
    migratedRoot, TEST_CONTRACT), /not inline/u);
  fs.rmSync(migratedRoot, {recursive: true, force: true});

  const missingRoot = tempRoot();
  installFixture(missingRoot);
  fs.rmSync(path.join(missingRoot, SOURCE_PATH));
  t.throws(() => writeHistoricalMigrationV2Manifest(
    missingRoot, TEST_CONTRACT), /unreadable/u);
  fs.rmSync(missingRoot, {recursive: true, force: true});
  t.end();
});

tap.test('creation rejects committed W12 authority drift', (t) => {
  const root = tempRoot();
  installFixture(root);
  fs.appendFileSync(path.join(root, W12_RECEIPT), ' ');
  commit(root, 'repurpose W12');

  t.throws(() => writeHistoricalMigrationV2Manifest(root, TEST_CONTRACT),
    /differs from the A1 authority/u);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
