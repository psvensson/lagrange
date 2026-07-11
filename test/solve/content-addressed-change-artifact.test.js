import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

import tap from 'tap';

import {
  contentObjectRoot,
  migrateInlineChangeArtifact,
  readChangeArtifact,
  writeContentAddressedChangeArtifact,
} from '../../scripts/solve/content-addressed-change-artifact.js';
import {
  changeArtifactIdentity,
  changeArtifactIdentityMatches,
  changedPathsFromDiffContent,
  inspectChangeArtifact,
} from '../../scripts/solve/change-artifact.js';
import {
  migrateProofArtifacts,
  RECEIPT_PATH,
  validateProofArtifactMigration,
} from '../../scripts/solve/proof-artifact-migration.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'content-addressed-artifact-'));
}

function write(root, relative, content) {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, content);
  return filePath;
}

function patchContent(marker, size) {
  return [
    'diff --git a/scripts/demo.js b/scripts/demo.js',
    '--- a/scripts/demo.js',
    '+++ b/scripts/demo.js',
    '@@ -1 +1 @@',
    '-before',
    `+${marker}`,
    '',
  ].join('\n').padEnd(size, marker);
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

function quest(id) {
  return {
    id,
    class: 'process',
    statement: 'Verify content-addressed artifacts.',
    frontiers: [{id: `${id}-main`}],
  };
}

tap.test('identical 1 MiB patches use two descriptors and one verified object', (t) => {
  const root = tempRoot();
  const payload = patchContent('large', 1024 * 1024);
  const first = writeContentAddressedChangeArtifact(
    root, 'solve/changes/demo/attempt-1.diff', payload);
  const second = writeContentAddressedChangeArtifact(
    root, 'solve/changes/demo/attempt-2.diff', payload);
  const objects = walkFiles(contentObjectRoot(root));

  t.equal(first.kind, 'content-addressed');
  t.equal(second.kind, 'content-addressed');
  t.equal(first.objectCreated, true);
  t.equal(second.objectCreated, false);
  t.equal(objects.length, 1, 'second identical payload creates no content object');
  t.ok(fs.statSync(objects[0]).size <= 1.05 * 1024 * 1024,
    'payload storage stays within the quantitative ceiling');
  t.equal(readChangeArtifact(root, first.changeRef).valid, true);
  t.equal(readChangeArtifact(root, second.changeRef).valid, true);
  t.equal(inspectChangeArtifact(root, quest('demo'), first.changeRef).valid, true);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('32 KiB boundary selects inline below and descriptor at threshold', (t) => {
  const root = tempRoot();
  const below = writeContentAddressedChangeArtifact(
    root,
    'solve/changes/demo/below.diff',
    patchContent('below', 32767),
  );
  const atThreshold = writeContentAddressedChangeArtifact(
    root,
    'solve/changes/demo/threshold.diff',
    patchContent('threshold', 32768),
  );

  t.equal(below.kind, 'inline');
  t.equal(below.changeRef, 'diff:solve/changes/demo/below.diff');
  t.equal(atThreshold.kind, 'content-addressed');
  t.equal(atThreshold.changeRef,
    'diff:solve/changes/demo/threshold.diff.json');

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('missing and tampered objects fail inspection and sealed identity', (t) => {
  const root = tempRoot();
  const written = writeContentAddressedChangeArtifact(
    root,
    'solve/changes/demo/attempt-1.diff',
    patchContent('tamper', 65536),
  );
  const identity = changeArtifactIdentity(root, 'demo', written.changeRef);
  const originalObject = fs.readFileSync(written.objectPath);

  fs.writeFileSync(written.objectPath, Buffer.from('tampered'));
  const tampered = inspectChangeArtifact(root, quest('demo'), written.changeRef);
  t.equal(tampered.valid, false);
  t.match(tampered.problems.join(' '), /gzip|SHA-256/iu);
  t.equal(changeArtifactIdentityMatches(
    identity,
    changeArtifactIdentity(root, 'demo', written.changeRef)), false);

  fs.writeFileSync(written.objectPath, originalObject);
  fs.rmSync(written.objectPath);
  const missing = inspectChangeArtifact(root, quest('demo'), written.changeRef);
  t.equal(missing.valid, false);
  t.match(missing.problems.join(' '), /missing/iu);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('descriptor tampering and traversal fail closed', (t) => {
  const root = tempRoot();
  const written = writeContentAddressedChangeArtifact(
    root,
    'solve/changes/demo/attempt-1.diff',
    patchContent('descriptor', 65536),
  );
  const descriptor = JSON.parse(fs.readFileSync(written.artifactPath, 'utf8'));

  fs.writeFileSync(written.artifactPath, `${JSON.stringify({
    ...descriptor,
    objectPath: '../../outside.diff.gz',
  })}\n`);
  const traversal = inspectChangeArtifact(root, quest('demo'), written.changeRef);
  t.equal(traversal.valid, false);
  t.match(traversal.problems.join(' '), /canonical|escapes/iu);

  fs.rmSync(written.artifactPath);
  const missingDescriptor = readChangeArtifact(root, written.changeRef);
  t.equal(missingDescriptor.valid, false);
  t.match(missingDescriptor.problems.join(' '), /does not exist/iu);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('historical gzip changeRefs remain readable through the shared owner', (t) => {
  const root = tempRoot();
  const relative = 'solve/changes/legacy/archived.diff';
  write(root, `${relative}.gz`, gzipSync(patchContent('archived', 4096)));
  const changeRef = `diff:${relative}`;
  const artifact = readChangeArtifact(root, changeRef);

  t.equal(artifact.valid, true);
  t.equal(artifact.kind, 'historical-gzip');
  t.equal(inspectChangeArtifact(root, quest('legacy'), changeRef).valid, true);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('outer path parsing ignores nested patch header-shaped content', (t) => {
  const content = [
    'diff --git a/solve/changes/old.diff b/solve/changes/old.diff',
    'deleted file mode 100644',
    '--- a/solve/changes/old.diff',
    '+++ /dev/null',
    '@@ -1,3 +0,0 @@',
    '-diff --git a/docs/inner.md b/docs/inner.md',
    '--- **Admin API**',
    '--- **Ports**:',
  ].join('\n');

  t.same(changedPathsFromDiffContent(content), ['solve/changes/old.diff']);
  t.end();
});

tap.test('legacy inline identity survives verified descriptor migration', (t) => {
  const root = tempRoot();
  const relative = 'solve/changes/legacy/attempt-1.diff';
  write(root, relative, patchContent('legacy', 65536));
  const changeRef = `diff:${relative}`;
  const before = changeArtifactIdentity(root, 'legacy', changeRef);

  const migration = migrateInlineChangeArtifact(root, relative);
  const after = changeArtifactIdentity(root, 'legacy', changeRef);
  t.equal(migration.migrated, true);
  t.equal(fs.existsSync(path.join(root, relative)), false);
  t.equal(readChangeArtifact(root, changeRef).valid, true);
  t.equal(changeArtifactIdentityMatches(before, after), true,
    'logical identity remains stable for historical accepted attempts');

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

function installMigrationBaseline(root, payload) {
  const paths = [
    'solve/changes/old/attempt-1.diff',
    'solve/changes/old/attempt-2.diff',
  ];
  paths.forEach((relative) => write(root, relative, payload));
  const references = paths.map((relative) => ({
    changeRef: `diff:${relative}`,
    classified: true,
    resolved: true,
    readabilityStatus: 'readable',
    payloadSha256: changeArtifactIdentity(root, 'old', `diff:${relative}`).sha256,
  }));
  references.push({
    changeRef: 'diff:src/historical-invalid.js',
    classified: true,
    resolved: false,
    readabilityStatus: 'historical-invalid-source-reference',
  });
  const census = {
    summary: {classifiedReferenceOccurrences: references.length},
    migrationPolicy: {inlineThresholdBytes: 32768, contentCompression: 'gzip'},
    references,
    duplicateGroups: [{
      payloadSha256: references[0].payloadSha256,
      payloadBytes: Buffer.byteLength(payload),
      copies: 2,
      duplicatePayloadBytes: Buffer.byteLength(payload),
      paths,
    }],
  };
  const evidence = 'test-output/reports/w11.report.json';
  write(root, evidence, `${JSON.stringify({
    standardSummary: {scenarios: [{
      scenario: 'solver-proof-artifact-census',
      detail: {census},
    }]},
  })}\n`);
  write(root, 'solve/log/solver-proof-artifact-census.ndjson',
    `${JSON.stringify({type: 'quest', status: 'solved', evidence})}\n`);
}

tap.test('migration preserves W11 readable refs and removes eligible duplicates', (t) => {
  const root = tempRoot();
  installMigrationBaseline(root, patchContent('duplicate', 43062));

  const migrated = migrateProofArtifacts(root);
  const validation = validateProofArtifactMigration(root);
  t.equal(migrated.receipt.migratedArtifacts, 2);
  t.equal(migrated.receipt.newlyMigratedArtifacts, 2);
  t.equal(migrated.receipt.recoveredMigratedArtifacts, 0);
  t.equal(migrated.receipt.eligibleDuplicateGroups, 1);
  t.equal(migrated.receipt.remainingDuplicateBytes, 0);
  t.equal(migrated.receipt.duplicateReduction, 1);
  t.equal(validation.valid, true, validation.problems.join('; '));

  const firstMigration = migrated.receipt.migrations[0];
  const descriptorPath = path.join(root, firstMigration.descriptorPath);
  const originalDescriptor = fs.readFileSync(descriptorPath);
  fs.appendFileSync(descriptorPath, ' ');
  t.equal(inspectChangeArtifact(
    root, quest('old'), `diff:${firstMigration.path}`).valid, false,
  'descriptor representation tampering fails the audit inspector');
  t.equal(validateProofArtifactMigration(root).valid, false,
    'one-byte descriptor representation tampering fails receipt identity');
  fs.writeFileSync(descriptorPath, originalDescriptor);

  const objectPath = path.join(root, firstMigration.objectPath);
  const originalObject = fs.readFileSync(objectPath);
  const metadataTamper = Buffer.from(originalObject);
  metadataTamper[4] ^= 1;
  fs.writeFileSync(objectPath, metadataTamper);
  t.equal(readChangeArtifact(root, `diff:${firstMigration.path}`).valid, false,
    'gzip metadata tamper fails the descriptor-owned storage seal');
  t.equal(inspectChangeArtifact(
    root, quest('old'), `diff:${firstMigration.path}`).valid, false,
  'object representation tampering fails the audit inspector');
  t.equal(validateProofArtifactMigration(root).valid, false,
    'one-byte object representation tampering fails receipt identity');
  fs.writeFileSync(objectPath, originalObject);

  const receiptPath = path.join(root, RECEIPT_PATH);
  const validReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  fs.writeFileSync(receiptPath, `${JSON.stringify({
    ...validReceipt,
    inlineThresholdBytes: 1,
    contentCompression: 'none',
    eligibleDuplicateGroups: 99,
    baselineDuplicateBytes: 1,
    duplicateReduction: 0.95,
    migrations: validReceipt.migrations.slice(0, 1),
  })}\n`);
  t.equal(validateProofArtifactMigration(root).valid, false,
    'forged policy, counts, and partial path coverage fail reconciliation');
  fs.writeFileSync(receiptPath, `${JSON.stringify(validReceipt, null, 2)}\n`);

  t.throws(() => migrateProofArtifacts(root), /zero-migration/iu,
    'an unchanged second run cannot claim migration credit');

  fs.rmSync(receiptPath);
  const recovered = migrateProofArtifacts(root);
  t.equal(recovered.receipt.migratedArtifacts, 2);
  t.equal(recovered.receipt.newlyMigratedArtifacts, 0);
  t.equal(recovered.receipt.recoveredMigratedArtifacts, 2,
    'receipt loss after rewrites is recoverable and explicitly classified');

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
