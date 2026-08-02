/**
 * Compressed playback evidence consumer-parity tests.
 *
 * Every consumer family of `snapshots.ndjson` evidence must produce
 * semantically identical results whether the artifact is retained as
 * legacy plain NDJSON or captured as the compressed `.gz` sibling, and
 * must discover compressed-only runs. Also pins the byte equality of the
 * two playback viewer copies and their local gzip loading support.
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {gzipSync} from 'node:zlib';
import {
  collectPlaybackSnapshotInsights,
} from '../failure-bundle-playback-insights.js';
import {
  replayPublicationPriorityEvidenceFromReportDir,
} from '../publication-evidence-replay.js';

const arrayMap = Function.call.bind(Array.prototype.map);
const stringIncludes = Function.call.bind(String.prototype.includes);
const execFileAsync = promisify(execFile);
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(MODULE_DIR, '../../../..');
const SNAPSHOTS_FILENAME = 'snapshots.ndjson';
const SNAPSHOTS_GZ_FILENAME = 'snapshots.ndjson.gz';
const TMP_PREFIX = 'playback-consumer-parity-';

const TERMINAL_SNAPSHOT = {
  timestamp: 100,
  partitions: [
    {partition_id: 'p1', leader_node: 'n1', leader_node_id: 'n1'},
    {partition_id: 'p2', leader_node: 'n2', leader_node_id: 'n2'},
  ],
  replicaOperations: [
    {partition_id: 'p1', type: 'REPLACE', workflow_step: 'PENDING'},
  ],
  services: [
    {partition_id: 'p1', replica_id: 'r1', status: 'active'},
  ],
};
const SNAPSHOT_NDJSON = JSON.stringify(TERMINAL_SNAPSHOT) + '\n';

async function withEvidenceVariants(writeFixture, evaluate) {
  const root = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  try {
    await writeFixture(root, SNAPSHOTS_FILENAME, SNAPSHOT_NDJSON);
    const plainResult = await evaluate(root);
    await rm(root, {recursive: true, force: true});
    await mkdir(root, {recursive: true});
    await writeFixture(
      root, SNAPSHOTS_GZ_FILENAME, gzipSync(SNAPSHOT_NDJSON));
    const compressedResult = await evaluate(root);
    return {plainResult, compressedResult};
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}

test('failure-bundle playback insights read compressed evidence identically', async () => {
  const entry = {
    details: {
      diagnostics: {
        controlPlaneDiagnostics: {
          publicationConvergence: {converged: false},
        },
      },
    },
  };
  const {plainResult, compressedResult} = await withEvidenceVariants(
    async (root, filename, content) => {
      await writeFile(join(root, filename), content);
    },
    (root) => collectPlaybackSnapshotInsights(root, entry),
  );
  assert.ok(plainResult, 'plain evidence should produce insights');
  assert.deepEqual(compressedResult, plainResult);
});

test('publication evidence replay reads compressed evidence identically', async () => {
  const {plainResult, compressedResult} = await withEvidenceVariants(
    async (root, filename, content) => {
      await writeFile(
        join(root, 'failure-bundle.json'), JSON.stringify({}) + '\n');
      await writeFile(join(root, filename), content);
    },
    async (root) => {
      const replay =
        await replayPublicationPriorityEvidenceFromReportDir(root);
      // The report directory differs between variants by design.
      return {...replay, reportDir: null};
    },
  );
  assert.ok(plainResult, 'plain evidence should replay');
  assert.equal(plainResult.source, 'snapshot');
  assert.deepEqual(compressedResult, plainResult);
});

test('analyze-replace-ghost-retirements discovers and reads compressed-only runs', async () => {
  const {plainResult, compressedResult} = await withEvidenceVariants(
    async (root, filename, content) => {
      await mkdir(join(root, 'scenario'), {recursive: true});
      await writeFile(join(root, 'scenario', filename), content);
    },
    async (root) => {
      const {stdout} = await execFileAsync(process.execPath, [
        join(REPO_ROOT, 'scripts/analyze-replace-ghost-retirements.js'),
        root,
      ], {cwd: REPO_ROOT});
      return JSON.parse(stdout);
    },
  );
  assert.equal(plainResult.witness, 'cl-023-replace-ghost-retirements');
  assert.deepEqual(compressedResult, plainResult);
});

test('analyze-leadership-flap discovers and reads compressed-only runs', async () => {
  const frames = arrayMap([
    {timestamp: 1000, partitions: [{partition_id: 'p1', leader_node: 'n1'}]},
    {timestamp: 4000, partitions: [{partition_id: 'p1', leader_node: 'n2'}]},
  ], (frame) => JSON.stringify(frame)).join('\n') + '\n';
  const evaluate = async (root) => {
    const {stdout} = await execFileAsync(process.execPath, [
      join(REPO_ROOT, 'scripts/analyze-leadership-flap.js'),
      '--dir', root,
      '--out', join(root, 'verdict.json'),
      '--json',
    ], {cwd: REPO_ROOT});
    return JSON.parse(stdout);
  };
  const writeFrames = async (root, compressed) => {
    const runDir = join(root, 'run-a', 'rolling-restart');
    await mkdir(runDir, {recursive: true});
    await writeFile(join(runDir, 'events.ndjson'), '');
    if (compressed) {
      await writeFile(join(runDir, SNAPSHOTS_GZ_FILENAME), gzipSync(frames));
    } else {
      await writeFile(join(runDir, SNAPSHOTS_FILENAME), frames);
    }
  };

  const root = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  try {
    await writeFrames(root, false);
    const plainResult = await evaluate(root);
    await rm(root, {recursive: true, force: true});
    await writeFrames(root, true);
    const compressedResult = await evaluate(root);
    assert.equal(plainResult.runsAnalyzed, 1);
    assert.equal(compressedResult.runsAnalyzed, 1,
      'compressed-only run must be discovered');
    assert.deepEqual(compressedResult, plainResult);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('passfail-leadership-score reads compressed-only corpus runs', async () => {
  const evaluate = async (root) => {
    const {stdout} = await execFileAsync(process.execPath, [
      join(REPO_ROOT, 'scripts/census/passfail-leadership-score.mjs'),
    ], {cwd: root});
    return JSON.parse(stdout);
  };
  const writeCorpus = async (root, compressed) => {
    const reports = join(root, 'test-output', 'reports');
    const runDir = join(reports, '.playback', 'run-x', 'rolling-restart');
    await mkdir(runDir, {recursive: true});
    await writeFile(
      join(reports, 'passfail-census-features.json'),
      JSON.stringify([
        {file: 'run-x.report.json', verdict: 'PASS'},
        {file: 'run-y.report.json', verdict: 'FAIL'},
      ]),
    );
    const filename = compressed ? SNAPSHOTS_GZ_FILENAME : SNAPSHOTS_FILENAME;
    const content = compressed ?
      gzipSync(SNAPSHOT_NDJSON) : SNAPSHOT_NDJSON;
    await writeFile(join(runDir, filename), content);
  };

  const root = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  try {
    await writeCorpus(root, false);
    const plainResult = await evaluate(root);
    await rm(root, {recursive: true, force: true});
    await writeCorpus(root, true);
    const compressedResult = await evaluate(root);
    assert.equal(plainResult.corpus.measured, 1);
    assert.equal(compressedResult.corpus.measured, 1,
      'compressed-only corpus run must stay observable');
    assert.deepEqual(compressedResult, plainResult);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('playback viewer copies stay byte-identical and gzip-capable', async () => {
  const adminViewer = await readFile(
    join(REPO_ROOT, 'src/admin/static/playback-viewer.html'));
  const harnessViewer = await readFile(
    join(REPO_ROOT, 'test/distributed/harness/playback-viewer.html'));
  assert.ok(adminViewer.equals(harnessViewer),
    'admin and harness playback viewers must be byte-identical');
  const viewerSource = adminViewer.toString('utf8');
  assert.ok(stringIncludes(viewerSource, 'DecompressionStream(\'gzip\')'),
    'viewer must decompress local .gz selections in the browser');
  assert.ok(
    stringIncludes(viewerSource, 'accept=".ndjson,.jsonl,.txt,.gz"'),
    'snapshots file input must accept .gz selections');
});
