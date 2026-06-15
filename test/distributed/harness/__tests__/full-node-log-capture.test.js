import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {
  captureFullNodeLog,
  createNodeLogStreamer,
  splitLinesByIncarnation,
  assessCaptureCompleteness,
  finalizeFileBasedCapture,
  findBootSourceProvenance,
  fullLogDestPath,
  STALE_CAPTURE_GAP_MS,
} from '../full-node-log-capture.js';

const STREAM_STDOUT = 1;
const FRAME_HEADER_BYTES = 8;
const SIZE_OFFSET = 4;

// Build one Docker multiplexed stdout frame: 8-byte header
// [streamType, 0,0,0, size(BE32)] followed by the payload bytes.
function frame(text) {
  const payload = Buffer.from(text, 'utf8');
  const header = Buffer.alloc(FRAME_HEADER_BYTES);
  header[0] = STREAM_STDOUT;
  header.writeUInt32BE(payload.length, SIZE_OFFSET);
  return Buffer.concat([header, payload]);
}

function multiplexed(lines) {
  return Buffer.concat(lines.map((line) => frame(line + '\n')));
}

describe('captureFullNodeLog', () => {
  let workspace;

  before(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'fullog-'));
  });

  after(async () => {
    await rm(workspace, {recursive: true, force: true});
  });

  it('decodes multiplexed frames and gzips the decoded text', async () => {
    const destPath = path.join(workspace, 'node-a.log.gz');
    const raw = multiplexed(['{"msg":"first"}', '{"msg":"second"}']);
    const readLogs = async (options) => {
      assert.equal(options.rawBuffer, true);
      return raw;
    };
    const result = await captureFullNodeLog({readLogs, destPath});
    assert.equal(result.lineCount, 2);
    assert.ok(result.byteSize > 0);
    const decompressed = gunzipSync(await readFile(destPath)).toString('utf8');
    assert.equal(decompressed, '{"msg":"first"}\n{"msg":"second"}\n');
  });

  it('handles an empty log stream without writing garbage', async () => {
    const destPath = path.join(workspace, 'node-empty.log.gz');
    const result = await captureFullNodeLog({
      readLogs: async () => Buffer.alloc(0),
      destPath,
    });
    assert.equal(result.lineCount, 0);
    const decompressed = gunzipSync(await readFile(destPath)).toString('utf8');
    assert.equal(decompressed, '');
  });

  it('fullLogDestPath nests under .full-logs/{scenario}/{nodeId}.log.gz', () => {
    const dest = fullLogDestPath('/out', 'rolling-restart', 'node-7');
    assert.equal(dest, '/out/.full-logs/rolling-restart/node-7.log.gz');
  });

  it('returns boot provenance parsed from the captured STARTING line', async () => {
    const destPath = path.join(workspace, 'node-prov.log.gz');
    const raw = multiplexed([
      '{"msg":"other"}',
      JSON.stringify({
        msg: 'Distributed Database System starting',
        bootedSrcFingerprint: 'abc123',
        expectedSrcFingerprint: 'abc123',
        srcFingerprintMatches: true,
      }),
    ]);
    const result = await captureFullNodeLog({
      readLogs: async () => raw,
      destPath,
    });
    assert.equal(result.bootSourceProvenance.srcFingerprintMatches, true);
    assert.equal(result.bootSourceProvenance.bootedSrcFingerprint, 'abc123');
  });
});

describe('finalizeFileBasedCapture', () => {
  let workspace;

  before(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'filecap-'));
  });

  after(async () => {
    await rm(workspace, {recursive: true, force: true});
  });

  it('gzips the host ndjson and reports app-time completeness + provenance', async () => {
    const hostFilePath = path.join(workspace, 'node.ndjson');
    const destGzPath = path.join(workspace, 'out', 'node.log.gz');
    const teardownWallMs = Date.parse('2026-06-09T13:05:00.000Z');
    const lines = [
      JSON.stringify({time: '2026-06-09T13:00:00.000Z', msg: 'boot',
        bootedSrcFingerprint: 'fp', expectedSrcFingerprint: 'fp',
        srcFingerprintMatches: true}),
      JSON.stringify({time: '2026-06-09T13:04:59.000Z', msg: 'tick'}),
    ];
    await writeFile(hostFilePath, lines.join('\n') + '\n', 'utf8');
    const r = await finalizeFileBasedCapture({
      hostFilePath,
      destGzPath,
      teardownWallMs,
    });
    assert.equal(r.lineCount, 2);
    assert.equal(r.completeness.complete, true, 'tail reaches teardown');
    assert.equal(r.bootSourceProvenance.srcFingerprintMatches, true);
    const text = gunzipSync(await readFile(destGzPath)).toString('utf8');
    assert.equal(text, lines.join('\n') + '\n');
  });

  it('flags incompleteness via APP-time when the node went quiet early', async () => {
    const hostFilePath = path.join(workspace, 'quiet.ndjson');
    const destGzPath = path.join(workspace, 'out', 'quiet.log.gz');
    // App time stops minutes before teardown — the gap the streaming check (which
    // saw only docker-receipt time) missed.
    const teardownWallMs = Date.parse('2026-06-09T13:10:00.000Z');
    await writeFile(
      hostFilePath,
      JSON.stringify({time: '2026-06-09T13:00:30.000Z', msg: 'last'}) + '\n',
      'utf8',
    );
    const r = await finalizeFileBasedCapture({hostFilePath, destGzPath, teardownWallMs});
    assert.equal(r.completeness.complete, false);
    assert.equal(r.completeness.reason, 'stale-tail');
  });

  it('reports incomplete (no lines) when the host file is missing', async () => {
    const r = await finalizeFileBasedCapture({
      hostFilePath: path.join(workspace, 'does-not-exist.ndjson'),
      destGzPath: path.join(workspace, 'out', 'missing.log.gz'),
      teardownWallMs: Date.now(),
    });
    assert.equal(r.completeness.complete, false);
    assert.equal(r.completeness.reason, 'no-lines-captured');
  });
});

describe('findBootSourceProvenance', () => {
  it('detects a confirmed stale mismatch', () => {
    const provenance = findBootSourceProvenance([
      '{"msg":"noise"}',
      JSON.stringify({
        bootedSrcFingerprint: 'old',
        expectedSrcFingerprint: 'new',
        srcFingerprintMatches: false,
      }),
    ]);
    assert.equal(provenance.srcFingerprintMatches, false);
    assert.equal(provenance.bootedSrcFingerprint, 'old');
    assert.equal(provenance.expectedSrcFingerprint, 'new');
  });

  it('returns null when no boot line is present (inconclusive)', () => {
    assert.equal(
      findBootSourceProvenance(['not json', '{"msg":"no fingerprint here"}']),
      null,
    );
  });

  it('uses the last boot line when a container restarted', () => {
    const provenance = findBootSourceProvenance([
      JSON.stringify({srcFingerprintMatches: false}),
      JSON.stringify({srcFingerprintMatches: true}),
    ]);
    assert.equal(provenance.srcFingerprintMatches, true);
  });
});

describe('assessCaptureCompleteness', () => {
  it('flags a capture with no lines', () => {
    const r = assessCaptureCompleteness({
      lastLineWallMs: 0,
      teardownWallMs: 1000,
      lineCount: 0,
    });
    assert.equal(r.complete, false);
    assert.equal(r.reason, 'no-lines-captured');
  });

  it('flags a stale tail (node went quiet long before teardown)', () => {
    const teardownWallMs = 1_000_000;
    const r = assessCaptureCompleteness({
      lastLineWallMs: teardownWallMs - (STALE_CAPTURE_GAP_MS + 1),
      teardownWallMs,
      lineCount: 500,
    });
    assert.equal(r.complete, false);
    assert.equal(r.reason, 'stale-tail');
  });

  it('accepts a capture whose tail reaches teardown', () => {
    const teardownWallMs = 1_000_000;
    const r = assessCaptureCompleteness({
      lastLineWallMs: teardownWallMs - 100,
      teardownWallMs,
      lineCount: 500,
    });
    assert.equal(r.complete, true);
  });
});

describe('createNodeLogStreamer', () => {
  let workspace;

  before(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'streamer-'));
  });

  after(async () => {
    await rm(workspace, {recursive: true, force: true});
  });

  // Fake provider whose followContainerLogStream resolves an `attached` promise
  // so the test can deterministically feed lines only after attach() has run.
  function makeFakeProvider() {
    const calls = [];
    let resolveAttached;
    let attached = new Promise((r) => {
      resolveAttached = r;
    });
    return {
      calls,
      nextAttach: () => attached,
      followContainerLogStream(containerId, opts) {
        calls.push(opts);
        const prevResolve = resolveAttached;
        attached = new Promise((r) => {
          resolveAttached = r;
        });
        prevResolve(opts);
        return {stop: () => {}};
      },
    };
  }

  it('streams payload lines to a gzip file and tracks status', async () => {
    const provider = makeFakeProvider();
    const destPath = path.join(workspace, 'stream-a.log.gz');
    const streamer = createNodeLogStreamer({
      provider,
      containerId: 'c1',
      destPath,
    });
    const opts = await provider.nextAttach();
    opts.onLine('2026-06-09T13:00:00.000Z', '{"msg":"one"}');
    opts.onLine('2026-06-09T13:00:01.000Z', '{"msg":"two"}');
    const status = await streamer.stop();
    assert.equal(status.lineCount, 2);
    assert.equal(status.lastDockerTs, '2026-06-09T13:00:01.000Z');
    const text = gunzipSync(await readFile(destPath)).toString('utf8');
    assert.equal(text, '{"msg":"one"}\n{"msg":"two"}\n');
  });

  it('re-attaches after the stream ends, resuming from the last timestamp', async () => {
    const provider = makeFakeProvider();
    const destPath = path.join(workspace, 'stream-reattach.log.gz');
    const timers = [];
    const streamer = createNodeLogStreamer({
      provider,
      containerId: 'c2',
      destPath,
      setTimeoutFn: (fn) => {
        timers.push(fn);
        return timers.length;
      },
      clearTimeoutFn: () => {},
    });
    const first = await provider.nextAttach();
    first.onLine('2026-06-09T13:00:00.000Z', '{"n":1}');
    // Container "restarts": the stream ends → streamer schedules a re-attach.
    first.onEnd();
    assert.equal(timers.length, 1, 'a re-attach was scheduled');
    const attachAgain = provider.nextAttach();
    timers[0]();
    const second = await attachAgain;
    assert.equal(
      second.since,
      '2026-06-09T13:00:00.000Z',
      're-attach resumes from last seen Docker timestamp',
    );
    second.onLine('2026-06-09T13:00:05.000Z', '{"n":2}');
    const status = await streamer.stop();
    assert.equal(status.lineCount, 2);
    const text = gunzipSync(await readFile(destPath)).toString('utf8');
    assert.equal(text, '{"n":1}\n{"n":2}\n');
  });

  it('dedups inclusive `since` re-delivery at the restart boundary', async () => {
    const provider = makeFakeProvider();
    const destPath = path.join(workspace, 'stream-dedup.log.gz');
    const timers = [];
    const streamer = createNodeLogStreamer({
      provider,
      containerId: 'c3',
      destPath,
      setTimeoutFn: (fn) => {
        timers.push(fn);
        return timers.length;
      },
      clearTimeoutFn: () => {},
    });
    const first = await provider.nextAttach();
    first.onLine('2026-06-09T13:00:00.000Z', '{"n":1}');
    first.onEnd();
    const attachAgain = provider.nextAttach();
    timers[0]();
    const second = await attachAgain;
    // Docker `since` is inclusive: it re-delivers the boundary line we already
    // have. It must be dropped, and only the genuinely-new line kept.
    second.onLine('2026-06-09T13:00:00.000Z', '{"n":1}');
    second.onLine('2026-06-09T13:00:03.000Z', '{"n":2}');
    const status = await streamer.stop();
    assert.equal(status.lineCount, 2, 'boundary duplicate dropped, new line kept');
    const text = gunzipSync(await readFile(destPath)).toString('utf8');
    assert.equal(text, '{"n":1}\n{"n":2}\n');
  });

  it('injects an incarnation-boundary marker so post-restart lines are filterable', async () => {
    const provider = makeFakeProvider();
    const destPath = path.join(workspace, 'stream-incarnation.log.gz');
    const streamer = createNodeLogStreamer({
      provider,
      containerId: 'c4',
      destPath,
      nowMs: () => 1234,
    });
    const opts = await provider.nextAttach();
    // Incarnation 1 output, then a restart boundary, then incarnation 2 output.
    opts.onLine('2026-06-09T13:00:00.000Z', '{"n":1}');
    streamer.markIncarnationBoundary(2, {nodeId: 'node-a'});
    opts.onLine('2026-06-09T13:00:05.000Z', '{"n":2}');
    const status = await streamer.stop();
    // The synthetic marker counts as a captured line.
    assert.equal(status.lineCount, 3);
    // A synthetic marker carries no Docker timestamp, so it must not move the
    // re-attach cursor.
    assert.equal(status.lastDockerTs, '2026-06-09T13:00:05.000Z');
    const lines = gunzipSync(await readFile(destPath))
      .toString('utf8')
      .trimEnd()
      .split('\n');
    const groups = splitLinesByIncarnation(lines);
    assert.equal(groups.length, 2, 'two incarnations separated by the marker');
    assert.deepEqual(groups[0], ['{"n":1}']);
    assert.deepEqual(groups[1], ['{"n":2}']);
    const marker = JSON.parse(lines[1]);
    assert.equal(marker.harnessEvent, 'incarnation-boundary');
    assert.equal(marker.incarnation, 2);
    assert.equal(marker.nodeId, 'node-a');
  });

  it('markIncarnationBoundary is a no-op after stop (never throws)', async () => {
    const provider = makeFakeProvider();
    const destPath = path.join(workspace, 'stream-incarnation-poststop.log.gz');
    const streamer = createNodeLogStreamer({provider, containerId: 'c5', destPath});
    await provider.nextAttach();
    await streamer.stop();
    assert.equal(streamer.markIncarnationBoundary(2, {nodeId: 'node-b'}), false);
  });
});

describe('splitLinesByIncarnation', () => {
  it('groups lines before the first boundary as incarnation 1', () => {
    const groups = splitLinesByIncarnation(['{"a":1}', '{"a":2}']);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0], ['{"a":1}', '{"a":2}']);
  });

  it('opens a new group at each boundary and excludes the marker line', () => {
    const groups = splitLinesByIncarnation([
      '{"a":1}',
      JSON.stringify({harnessEvent: 'incarnation-boundary', incarnation: 2}),
      '{"a":2}',
      JSON.stringify({harnessEvent: 'incarnation-boundary', incarnation: 3}),
      '{"a":3}',
    ]);
    assert.equal(groups.length, 3);
    assert.deepEqual(groups[0], ['{"a":1}']);
    assert.deepEqual(groups[1], ['{"a":2}']);
    assert.deepEqual(groups[2], ['{"a":3}']);
  });

  it('keeps non-JSON lines in the current incarnation', () => {
    const groups = splitLinesByIncarnation(['plain text', '{"a":1}']);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0], ['plain text', '{"a":1}']);
  });
});
