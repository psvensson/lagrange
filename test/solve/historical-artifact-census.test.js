import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

import tap from 'tap';

import {
  buildHistoricalArtifactCensus,
  canonicalHistoricalCensusBytes,
  validateHistoricalArtifactCensus,
} from '../../scripts/solve/historical-artifact-census.js';

const RECEIPT =
  'solve/changes/solver-proof-artifact-content-addressing/migration-receipt.json';

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-census-'));
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

function commit(root) {
  execFileSync('git', ['add', 'solve'], {cwd: root});
  execFileSync('git', ['commit', '-qm', 'fixture'], {cwd: root});
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

function diff(marker, bytes = 0) {
  const content = [
    'diff --git a/src/a.js b/src/a.js',
    '--- a/src/a.js',
    '+++ b/src/a.js',
    '@@ -1 +1 @@',
    '-before',
    `+${marker}`,
    '',
  ].join('\n');
  return content.padEnd(bytes, marker);
}

function appendLog(root, questId, events) {
  write(root, `solve/log/${questId}.ndjson`,
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
}

function quest(root, questId) {
  write(root, `solve/quests/${questId}.json`, `${JSON.stringify({
    id: questId,
    statement: 'fixture',
    frontiers: [],
  })}\n`);
}

function receipt(root) {
  write(root, RECEIPT, '{"schemaVersion":1}\n');
}

function entry(census, filePath) {
  return census.files.find((row) => row[0] === filePath);
}

function entryClass(census, filePath) {
  return census.classes[entry(census, filePath)[4]].id;
}

tap.test('Git-tree census is stable, exhaustive, and excludes untracked files',
  (t) => {
    const root = tempRoot();
    const questId = 'alpha';
    const artifact = 'solve/changes/alpha/attempt-1.diff';
    receipt(root);
    quest(root, questId);
    write(root, artifact, diff('alpha', 40000));
    appendLog(root, questId, [{changeRef: `diff:${artifact}`}]);
    write(root, `solve/report/${questId}.md`, [
      '# Solve report: alpha',
      '**Outcome:** SOLVED (MEASURED)',
      '- Next action: continue supervised step for alpha-main',
      '',
    ].join('\n'));
    const revision = commit(root);
    write(root, 'solve/report/untracked-formation.md', 'must not enter census\n');

    const first = buildHistoricalArtifactCensus(root, {commit: revision});
    const second = buildHistoricalArtifactCensus(root, {commit: revision});
    t.equal(first.summary.trackedFiles, 5);
    t.equal(first.summary.classifiedFiles, first.summary.trackedFiles);
    t.equal(first.summary.decidedFiles, first.summary.trackedFiles);
    t.equal(first.summary.bytesReconciled, true);
    t.notOk(entry(first, 'solve/report/untracked-formation.md'));
    t.equal(entryClass(first, artifact), 'change-inline-a2b');
    t.equal(entryClass(first, `solve/report/${questId}.md`),
      'report-terminal-actionable-v1');
    t.same(validateHistoricalArtifactCensus(first), []);
    t.equal(canonicalHistoricalCensusBytes(first).toString(),
      canonicalHistoricalCensusBytes(second).toString());
    t.ok(first.childQuestBatch.a2b.every((batch) => batch.pathCount <= 25));
    t.ok(first.childQuestBatch.a2b.every((batch) =>
      batch.conservativeChangeBytes <= 262144));

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('unsupported and infeasible historical payloads are retained explicitly',
  (t) => {
    const root = tempRoot();
    receipt(root);
    write(root, 'solve/changes/small/attempt.diff', diff('small', 4096));
    write(root, 'solve/changes/large/attempt.diff', diff('large', 300000));
    write(root, 'solve/changes/legacy/attempt.diff.gz', gzipSync(diff('legacy')));
    appendLog(root, 'history', [
      {changeRef: 'diff:solve/changes/small/attempt.diff'},
      {changeRef: 'diff:solve/changes/large/attempt.diff'},
      {changeRef: 'diff:solve/changes/legacy/attempt.diff'},
    ]);
    const revision = commit(root);
    const census = buildHistoricalArtifactCensus(root, {commit: revision});

    t.equal(entryClass(census, 'solve/changes/small/attempt.diff'),
      'change-inline-policy');
    t.equal(entryClass(census, 'solve/changes/large/attempt.diff'),
      'change-inline-scope-infeasible');
    t.equal(entryClass(census, 'solve/changes/legacy/attempt.diff.gz'),
      'change-historical-gzip');
    t.equal(census.summary.a2bPayloads, 0);
    t.same(validateHistoricalArtifactCensus(census), []);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('report decisions require both regeneration proof and schema engagement',
  (t) => {
    const root = tempRoot();
    receipt(root);
    quest(root, 'current');
    appendLog(root, 'current', [{type: 'quest', status: 'solved'}]);
    write(root, 'solve/report/current.md', [
      '# Solve report: current',
      '**Outcome:** SOLVED (MEASURED)',
      '## Findings',
      '',
    ].join('\n'));
    write(root, 'solve/report/orphan.md', '# historical report without inputs\n');
    const census = buildHistoricalArtifactCensus(root, {commit: commit(root)});

    t.equal(entryClass(census, 'solve/report/current.md'), 'report-regenerable');
    t.equal(entryClass(census, 'solve/report/orphan.md'), 'report-unique');
    t.equal(census.childQuestBatch.a3b.length, 0);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('validator fails duplicate assignments, batch overflow, and tampering',
  (t) => {
    const root = tempRoot();
    receipt(root);
    write(root, 'solve/epics/a.md', '# A\n');
    const census = buildHistoricalArtifactCensus(root, {commit: commit(root)});

    const duplicate = structuredClone(census);
    duplicate.files.push(duplicate.files[0]);
    t.ok(validateHistoricalArtifactCensus(duplicate).includes('duplicate-path'));

    const overflow = structuredClone(census);
    overflow.childQuestBatch.a2b.push({
      questId: 'overflow',
      payloads: [],
      pathCount: 26,
      conservativeChangeBytes: 262145,
    });
    const overflowProblems = validateHistoricalArtifactCensus(overflow);
    t.ok(overflowProblems.includes('a2b-path-limit:overflow'));
    t.ok(overflowProblems.includes('a2b-byte-limit:overflow'));

    const tampered = structuredClone(census);
    tampered.summary.trackedBytes += 1;
    const tamperProblems = validateHistoricalArtifactCensus(tampered);
    t.ok(tamperProblems.includes('byte-count'));
    t.ok(tamperProblems.includes('census-digest'));

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('unknown tracked Solver paths and missing W12 receipt fail closed', (t) => {
  const missingReceipt = tempRoot();
  write(missingReceipt, 'solve/epics/a.md', '# A\n');
  t.throws(() => buildHistoricalArtifactCensus(missingReceipt, {
    commit: commit(missingReceipt),
  }), /W12 migration receipt is missing/u);
  fs.rmSync(missingReceipt, {recursive: true, force: true});

  const unknown = tempRoot();
  receipt(unknown);
  write(unknown, 'solve/unclassified/value.bin', 'unknown');
  t.throws(() => buildHistoricalArtifactCensus(unknown, {
    commit: commit(unknown),
  }), /unclassified tracked Solver paths/u);
  fs.rmSync(unknown, {recursive: true, force: true});
  t.end();
});

tap.test('tracked descriptors still use the W12 reader and reject missing objects',
  (t) => {
    const root = tempRoot();
    receipt(root);
    const payload = Buffer.from(diff('descriptor'));
    const payloadSha256 = createHash('sha256').update(payload).digest('hex');
    const objectBytes = gzipSync(payload);
    const descriptor = {
      schemaVersion: 1,
      kind: 'solve-change-artifact',
      hashAlgorithm: 'sha256',
      payloadSha256,
      payloadBytes: payload.length,
      contentEncoding: 'gzip',
      objectPath: `solve/artifacts/sha256/${payloadSha256.slice(0, 2)}/` +
        `${payloadSha256}.diff.gz`,
      objectStorageSha256: createHash('sha256').update(objectBytes).digest('hex'),
    };
    write(root, 'solve/changes/broken/attempt.diff.json',
      `${JSON.stringify(descriptor, null, 2)}\n`);
    appendLog(root, 'broken', [{
      changeRef: 'diff:solve/changes/broken/attempt.diff.json',
    }]);
    const revision = commit(root);
    t.throws(() => buildHistoricalArtifactCensus(root, {commit: revision}),
      /W11 reader cannot resolve/u);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('sealed census rejects live tracked-log drift', (t) => {
  const root = tempRoot();
  receipt(root);
  const artifact = 'solve/changes/alpha/attempt.diff';
  write(root, artifact, diff('alpha'));
  appendLog(root, 'alpha', [{changeRef: `diff:${artifact}`}]);
  const revision = commit(root);
  appendLog(root, 'alpha', [
    {changeRef: `diff:${artifact}`},
    {changeRef: `diff:${artifact}`},
  ]);

  t.throws(() => buildHistoricalArtifactCensus(root, {commit: revision}),
    /tracked historical W11 input drifted/u);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
