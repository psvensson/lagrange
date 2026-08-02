/**
 * Output-asset serving tests for AdminTestRunService: legacy plain
 * playback evidence, compressed sibling fallback, running-run
 * incomplete-gzip tolerance, and strict decoding for archived evidence.
 */

import {Buffer} from 'node:buffer';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {test} from '../../src/test-helpers/tap.js';
import {AdminTestRunService} from '../../src/admin/admin-test-run-service.js';
import {
  createPlaybackEvidenceWriter,
} from '../../src/diagnostics/playback-evidence-file.js';

const TMP_PREFIX = 'lagrange-admin-output-asset-';
const SCENARIO_RELATIVE_DIR = '.playback/run-1/rolling-restart';
const SNAPSHOTS_WILDCARD = `${SCENARIO_RELATIVE_DIR}/snapshots.ndjson`;
const SNAPSHOTS_GZ_WILDCARD = `${SNAPSHOTS_WILDCARD}.gz`;
const NDJSON_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8';
const PLAIN_EVIDENCE = '{"seq":1}\n{"seq":2}\n';
const RUN_ID = 'run-1';

async function createWorkspace() {
  const root = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  await mkdir(
    join(root, 'test-output', SCENARIO_RELATIVE_DIR),
    {recursive: true},
  );
  return root;
}

function snapshotsAbsolutePath(root, suffix = '') {
  return join(root, 'test-output', `${SNAPSHOTS_WILDCARD}${suffix}`);
}

async function collectBody(body) {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function writeActiveGzipBytes(root, records) {
  const targetPath = snapshotsAbsolutePath(root, '.gz');
  const writer = await createPlaybackEvidenceWriter(targetPath);
  for (const record of records) {
    await writer.appendRecord(record);
  }
  const activeBytes = await readFile(targetPath);
  await writer.abort();
  await writeFile(targetPath, activeBytes);
  return activeBytes;
}

function registerRun(service, status) {
  service.runs.set(RUN_ID, {
    runId: RUN_ID,
    status,
    playbackSnapshotsPath: join('test-output', SNAPSHOTS_WILDCARD),
  });
}

test('readOutputAsset serves legacy plain evidence unchanged', async (t) => {
  const root = await createWorkspace();
  t.teardown(() => rm(root, {recursive: true, force: true}));
  await writeFile(snapshotsAbsolutePath(root), PLAIN_EVIDENCE);
  const service = new AdminTestRunService({workspaceRoot: root});

  const payload = await service.readOutputAsset(SNAPSHOTS_WILDCARD);
  t.ok(payload, 'plain evidence should be served');
  t.equal(payload.contentType, NDJSON_CONTENT_TYPE);
  t.equal((await collectBody(payload.body)).toString('utf8'), PLAIN_EVIDENCE);
});

test('readOutputAsset decodes an archived gzip sibling strictly', async (t) => {
  const root = await createWorkspace();
  t.teardown(() => rm(root, {recursive: true, force: true}));
  await writeFile(
    snapshotsAbsolutePath(root, '.gz'), gzipSync(PLAIN_EVIDENCE));
  const service = new AdminTestRunService({workspaceRoot: root});

  const payload = await service.readOutputAsset(SNAPSHOTS_WILDCARD);
  t.ok(payload, 'archived compressed evidence should be served');
  t.equal(payload.contentType, NDJSON_CONTENT_TYPE);
  t.equal((await collectBody(payload.body)).toString('utf8'), PLAIN_EVIDENCE);
});

test('readOutputAsset prefers the exact plain file over the gz sibling', async (t) => {
  const root = await createWorkspace();
  t.teardown(() => rm(root, {recursive: true, force: true}));
  await writeFile(snapshotsAbsolutePath(root), PLAIN_EVIDENCE);
  await writeFile(
    snapshotsAbsolutePath(root, '.gz'), gzipSync('{"other":true}\n'));
  const service = new AdminTestRunService({workspaceRoot: root});

  const payload = await service.readOutputAsset(SNAPSHOTS_WILDCARD);
  t.equal((await collectBody(payload.body)).toString('utf8'), PLAIN_EVIDENCE);
});

test('readOutputAsset tolerates an incomplete tail only for a running run', async (t) => {
  const root = await createWorkspace();
  t.teardown(() => rm(root, {recursive: true, force: true}));
  const activeBytes = await writeActiveGzipBytes(root, [
    {seq: 1},
    {seq: 2, marker: 'tail'},
  ]);
  await writeFile(
    snapshotsAbsolutePath(root, '.gz'),
    activeBytes.subarray(0, activeBytes.length - 6),
  );
  const service = new AdminTestRunService({workspaceRoot: root});
  registerRun(service, 'running');

  const payload = await service.readOutputAsset(SNAPSHOTS_WILDCARD);
  t.ok(payload, 'active evidence should be served');
  const text = (await collectBody(payload.body)).toString('utf8');
  const lines = text.split('\n').filter((line) => line.length > 0);
  t.ok(lines.length >= 1, 'at least one complete record is visible');
  for (const line of lines) {
    t.doesNotThrow(() => JSON.parse(line), 'every served line is complete');
  }
});

test('readOutputAsset decodes strictly when the run is not running', async (t) => {
  const root = await createWorkspace();
  t.teardown(() => rm(root, {recursive: true, force: true}));
  const activeBytes = await writeActiveGzipBytes(root, [{seq: 1}]);
  await writeFile(snapshotsAbsolutePath(root, '.gz'), activeBytes);
  const service = new AdminTestRunService({workspaceRoot: root});
  registerRun(service, 'failed');

  const payload = await service.readOutputAsset(SNAPSHOTS_WILDCARD);
  t.ok(payload, 'payload resolves before decoding begins');
  await t.rejects(
    collectBody(payload.body),
    'unfinalized evidence must fail strict decoding for finished runs',
  );
});

test('readOutputAsset decodes strictly when no run is registered', async (t) => {
  const root = await createWorkspace();
  t.teardown(() => rm(root, {recursive: true, force: true}));
  const activeBytes = await writeActiveGzipBytes(root, [{seq: 1}]);
  await writeFile(snapshotsAbsolutePath(root, '.gz'), activeBytes);
  const service = new AdminTestRunService({workspaceRoot: root});

  const payload = await service.readOutputAsset(SNAPSHOTS_WILDCARD);
  t.ok(payload);
  await t.rejects(
    collectBody(payload.body),
    'offline evidence must use strict decoding',
  );
});

test('readOutputAsset never falls back on corrupt archives', async (t) => {
  const root = await createWorkspace();
  t.teardown(() => rm(root, {recursive: true, force: true}));
  const corrupt = gzipSync(PLAIN_EVIDENCE);
  corrupt[corrupt.length - 5] ^= 0xff;
  await writeFile(snapshotsAbsolutePath(root, '.gz'), corrupt);
  const service = new AdminTestRunService({workspaceRoot: root});
  registerRun(service, 'running');

  const payload = await service.readOutputAsset(SNAPSHOTS_WILDCARD);
  t.ok(payload);
  await t.rejects(
    collectBody(payload.body),
    'corruption must surface as an error, not a fallback',
  );
});

test('readOutputAsset serves explicit gz requests as raw bytes', async (t) => {
  const root = await createWorkspace();
  t.teardown(() => rm(root, {recursive: true, force: true}));
  const compressed = gzipSync(PLAIN_EVIDENCE);
  await writeFile(snapshotsAbsolutePath(root, '.gz'), compressed);
  const service = new AdminTestRunService({workspaceRoot: root});

  const payload = await service.readOutputAsset(SNAPSHOTS_GZ_WILDCARD);
  t.ok(payload, 'explicit gz path should be served');
  t.ok((await collectBody(payload.body)).equals(compressed));
});

test('readOutputAsset returns null when no artifact exists', async (t) => {
  const root = await createWorkspace();
  t.teardown(() => rm(root, {recursive: true, force: true}));
  const service = new AdminTestRunService({workspaceRoot: root});

  t.equal(await service.readOutputAsset(SNAPSHOTS_WILDCARD), null);
  t.equal(await service.readOutputAsset(SNAPSHOTS_GZ_WILDCARD), null);
});
