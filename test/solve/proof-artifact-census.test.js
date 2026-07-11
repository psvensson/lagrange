import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

import tap from 'tap';

import {buildProofArtifactCensus} from '../../scripts/solve/proof-artifact-census.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'proof-artifact-census-'));
}

function write(root, relative, content) {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, content);
  return filePath;
}

function diffContent(marker, minimumBytes = 0) {
  const header = [
    'diff --git a/src/a.js b/src/a.js',
    '--- a/src/a.js',
    '+++ b/src/a.js',
    '@@ -1 +1 @@',
    '-before',
    `+${marker}`,
    '',
  ].join('\n');
  return header.padEnd(minimumBytes, marker);
}

function appendLog(root, questId, events) {
  write(root, `solve/log/${questId}.ndjson`,
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
}

tap.test('census resolves inline and historical gzip refs and reconciles bytes', (t) => {
  const root = tempRoot();
  const duplicate = diffContent('duplicate', 4096);
  write(root, 'solve/changes/alpha/attempt-1.diff', duplicate);
  write(root, 'solve/changes/alpha/attempt-2.diff', duplicate);
  write(root, 'solve/changes/alpha/unreferenced.diff', diffContent('unused'));
  write(root, 'solve/changes/legacy/old.diff.gz', gzipSync(diffContent('legacy')));
  appendLog(root, 'alpha', [{
    type: 'attempt',
    changeRef: 'diff:solve/changes/alpha/attempt-1.diff',
  }, {
    type: 'violation',
    attempt: {changeRef: 'diff:solve/changes/alpha/attempt-2.diff'},
  }]);
  appendLog(root, 'legacy', [{
    type: 'attempt',
    changeRef: 'diff:solve/changes/legacy/old.diff',
  }]);

  const census = buildProofArtifactCensus(root);
  t.equal(census.summary.artifactCount, 4);
  t.equal(census.summary.referenceOccurrences, 3);
  t.equal(census.summary.classifiedReferenceOccurrences, 3);
  t.equal(census.summary.resolvedReferenceOccurrences, 3);
  t.equal(census.summary.historicalFallbackOccurrences, 1);
  t.equal(census.summary.unreferencedArtifactCount, 1);
  t.equal(census.summary.unresolvedReferenceOccurrences, 0);
  t.ok(census.references.every((reference) => reference.referenceSha256),
    'every historical changeRef value has a content identity');
  t.equal(census.summary.readableArtifactCount, 4);
  t.equal(census.summary.bytesReconciled, true);
  t.equal(census.duplicateGroups.length, 1);
  t.equal(census.migrationPolicy.inlineThresholdBytes, 4096);
  t.equal(census.migrationPolicy.eligibleDuplicateGroups, 1);
  t.equal(census.migrationPolicy.contentCompression, 'gzip');

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('census reports missing refs and corrupt compressed payloads', (t) => {
  const root = tempRoot();
  write(root, 'solve/changes/broken/corrupt.diff.gz', 'not-gzip');
  appendLog(root, 'broken', [{
    changeRef: 'diff:solve/changes/broken/missing.diff',
  }]);

  const census = buildProofArtifactCensus(root);
  t.equal(census.summary.artifactCount, 1);
  t.equal(census.summary.readableArtifactCount, 0);
  t.equal(census.summary.unresolvedReferenceOccurrences, 1);
  t.equal(census.unresolvedReferences[0].reason, 'payload-missing');
  t.match(census.artifacts[0].readError, /header|incorrect|unknown/iu);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('census classifies legacy source-path refs without treating them as payloads',
  (t) => {
    const root = tempRoot();
    appendLog(root, 'legacy', [{
      type: 'attempt',
      changeRef: 'diff:src/legacy.js',
    }]);

    const census = buildProofArtifactCensus(root);
    t.equal(census.summary.referenceOccurrences, 1);
    t.equal(census.summary.classifiedReferenceOccurrences, 1);
    t.equal(census.summary.resolvedReferenceOccurrences, 0);
    t.equal(census.summary.unresolvedReferenceOccurrences, 0);
    t.equal(census.summary.historicalInvalidReferenceOccurrences, 1);
    t.equal(census.references[0].readabilityStatus,
      'historical-invalid-source-reference');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('empty artifact inventory cannot satisfy byte reconciliation', (t) => {
  const root = tempRoot();
  const census = buildProofArtifactCensus(root);

  t.equal(census.summary.artifactCount, 0);
  t.equal(census.summary.storageBytes, 0);
  t.equal(census.summary.filesystemBytes, 0);
  t.equal(census.summary.bytesReconciled, false);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
