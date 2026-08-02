import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {
  createPlaybackEvidenceReadStream,
  createPlaybackEvidenceWriter,
  gzipPlaybackEvidencePath,
  readPlaybackEvidenceFile,
  readPlaybackEvidenceFileSync,
  resolvePlaybackEvidencePath,
  resolvePlaybackEvidencePathSync,
} from '../../src/diagnostics/playback-evidence-file.js';

const TMP_PREFIX = 'playback-evidence-file-';
const LOGICAL_NAME = 'snapshots.ndjson';
const PLAIN_CONTENT = '{"seq":1}\n{"seq":2}\n';
const COMPRESSED_CONTENT = '{"seq":10}\n{"seq":11}\n';
const ERROR_CODE_MISSING = 'ENOENT';

async function collectStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

describe('playback evidence file owner', () => {
  let workspace;
  let logicalPath;
  let compressedPath;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), TMP_PREFIX));
    logicalPath = path.join(workspace, LOGICAL_NAME);
    compressedPath = gzipPlaybackEvidencePath(logicalPath);
  });

  afterEach(async () => {
    await rm(workspace, {recursive: true, force: true});
  });

  describe('resolver precedence matrix', () => {
    it('prefers the exact plain file even when a gz sibling exists', async () => {
      await writeFile(logicalPath, PLAIN_CONTENT);
      await writeFile(compressedPath, gzipSync(COMPRESSED_CONTENT));
      assert.equal(resolvePlaybackEvidencePathSync(logicalPath), logicalPath);
      assert.equal(await resolvePlaybackEvidencePath(logicalPath), logicalPath);
    });

    it('falls back to the gz sibling when the plain file is missing', async () => {
      await writeFile(compressedPath, gzipSync(COMPRESSED_CONTENT));
      assert.equal(
        resolvePlaybackEvidencePathSync(logicalPath), compressedPath);
      assert.equal(
        await resolvePlaybackEvidencePath(logicalPath), compressedPath);
    });

    it('resolves explicit gz paths exact-only', async () => {
      await writeFile(logicalPath, PLAIN_CONTENT);
      assert.equal(resolvePlaybackEvidencePathSync(compressedPath), null);
      assert.equal(await resolvePlaybackEvidencePath(compressedPath), null);
      await writeFile(compressedPath, gzipSync(COMPRESSED_CONTENT));
      assert.equal(
        resolvePlaybackEvidencePathSync(compressedPath), compressedPath);
      assert.equal(
        await resolvePlaybackEvidencePath(compressedPath), compressedPath);
    });

    it('returns null when neither artifact exists', async () => {
      assert.equal(resolvePlaybackEvidencePathSync(logicalPath), null);
      assert.equal(await resolvePlaybackEvidencePath(logicalPath), null);
    });
  });

  describe('sync and async read compatibility', () => {
    it('reads legacy plain evidence identically in both modes', async () => {
      await writeFile(logicalPath, PLAIN_CONTENT);
      assert.equal(readPlaybackEvidenceFileSync(logicalPath), PLAIN_CONTENT);
      assert.equal(
        await readPlaybackEvidenceFile(logicalPath), PLAIN_CONTENT);
    });

    it('reads compressed evidence through the logical path', async () => {
      await writeFile(compressedPath, gzipSync(COMPRESSED_CONTENT));
      assert.equal(
        readPlaybackEvidenceFileSync(logicalPath), COMPRESSED_CONTENT);
      assert.equal(
        await readPlaybackEvidenceFile(logicalPath), COMPRESSED_CONTENT);
    });

    it('reads an explicit gz path directly', async () => {
      await writeFile(compressedPath, gzipSync(COMPRESSED_CONTENT));
      assert.equal(
        readPlaybackEvidenceFileSync(compressedPath), COMPRESSED_CONTENT);
      assert.equal(
        await readPlaybackEvidenceFile(compressedPath), COMPRESSED_CONTENT);
    });

    it('throws ENOENT for missing evidence in both modes', async () => {
      assert.throws(
        () => readPlaybackEvidenceFileSync(logicalPath),
        {code: ERROR_CODE_MISSING},
      );
      await assert.rejects(
        readPlaybackEvidenceFile(logicalPath),
        {code: ERROR_CODE_MISSING},
      );
    });

    it('surfaces corruption instead of falling back', async () => {
      const corrupt = gzipSync(COMPRESSED_CONTENT);
      corrupt[corrupt.length - 5] ^= 0xff;
      await writeFile(compressedPath, corrupt);
      await writeFile(logicalPath + '.unrelated', PLAIN_CONTENT);
      assert.throws(() => readPlaybackEvidenceFileSync(logicalPath));
      await assert.rejects(readPlaybackEvidenceFile(logicalPath));
    });
  });

  describe('writer', () => {
    it('preserves append ordering across serialized writes', async () => {
      const writer = await createPlaybackEvidenceWriter(compressedPath);
      const total = 50;
      await Promise.all(
        Array.from({length: total}, (_v, index) =>
          writer.appendRecord({seq: index})),
      );
      await writer.close();
      const lines = readPlaybackEvidenceFileSync(logicalPath)
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line).seq);
      assert.deepEqual(lines, Array.from({length: total}, (_v, i) => i));
    });

    it('absorbs large-record backpressure without loss', async () => {
      const writer = await createPlaybackEvidenceWriter(compressedPath);
      const bigPayload = 'x'.repeat(1024 * 1024);
      for (let index = 0; index < 4; index++) {
        await writer.appendRecord({seq: index, payload: bigPayload});
      }
      await writer.close();
      const records = readPlaybackEvidenceFileSync(logicalPath)
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
      assert.equal(records.length, 4);
      assert.equal(records[3].payload.length, bigPayload.length);
    });

    it('makes flushed records visible before finalization', async () => {
      const writer = await createPlaybackEvidenceWriter(compressedPath);
      await writer.appendRecord({seq: 1});
      await writer.appendRecord({seq: 2});
      const activeStream = await createPlaybackEvidenceReadStream(
        logicalPath, {allowIncomplete: true});
      const visible = await collectStream(activeStream);
      assert.equal(visible, '{"seq":1}\n{"seq":2}\n');
      await writer.close();
    });

    it('produces a strictly decodable stream after close', async () => {
      const writer = await createPlaybackEvidenceWriter(compressedPath);
      await writer.appendRecord({seq: 1});
      await writer.close();
      const strictStream =
        await createPlaybackEvidenceReadStream(logicalPath);
      assert.equal(await collectStream(strictStream), '{"seq":1}\n');
    });

    it('rejects appends after close', async () => {
      const writer = await createPlaybackEvidenceWriter(compressedPath);
      await writer.close();
      await assert.rejects(writer.appendRecord({seq: 1}));
    });

    it('abort removes the partially written artifact', async () => {
      const writer = await createPlaybackEvidenceWriter(compressedPath);
      await writer.appendRecord({seq: 1});
      await writer.abort();
      await assert.rejects(stat(compressedPath), {code: ERROR_CODE_MISSING});
    });
  });

  describe('read streams', () => {
    it('strict decoding rejects an unfinalized gzip stream', async () => {
      const writer = await createPlaybackEvidenceWriter(compressedPath);
      await writer.appendRecord({seq: 1});
      const activeBytes = await readFile(compressedPath);
      await writer.abort();
      await writeFile(compressedPath, activeBytes);
      const strictStream =
        await createPlaybackEvidenceReadStream(logicalPath);
      await assert.rejects(collectStream(strictStream));
    });

    it('incomplete decoding emits only newline-complete records', async () => {
      const writer = await createPlaybackEvidenceWriter(compressedPath);
      await writer.appendRecord({seq: 1});
      await writer.appendRecord({seq: 2, marker: 'tail-record'});
      const activeBytes = await readFile(compressedPath);
      await writer.abort();
      // Simulate a mid-write capture: drop trailing bytes of the tail flush.
      await writeFile(
        compressedPath, activeBytes.subarray(0, activeBytes.length - 6));
      const activeStream = await createPlaybackEvidenceReadStream(
        logicalPath, {allowIncomplete: true});
      const visible = await collectStream(activeStream);
      const lines = visible.split('\n').filter((line) => line.length > 0);
      assert.ok(lines.length >= 1);
      for (const line of lines) {
        assert.doesNotThrow(() => JSON.parse(line));
      }
      assert.equal(JSON.parse(lines[0]).seq, 1);
    });

    it('streams plain evidence unchanged', async () => {
      await writeFile(logicalPath, PLAIN_CONTENT);
      const stream = await createPlaybackEvidenceReadStream(logicalPath);
      assert.equal(await collectStream(stream), PLAIN_CONTENT);
      assert.ok(stream instanceof createReadStream(logicalPath).constructor);
    });

    it('destroying a decoded stream releases the file descriptor', async () => {
      const writer = await createPlaybackEvidenceWriter(compressedPath);
      // Incompressible payloads keep the artifact multi-chunk so the
      // source stream cannot drain on the first read.
      for (let index = 0; index < 8; index++) {
        await writer.appendRecord({
          seq: index,
          bulk: randomBytes(256 * 1024).toString('hex'),
        });
      }
      await writer.close();

      const fdDir = '/proc/self/fd';
      let baselineFdCount;
      try {
        baselineFdCount = (await readdir(fdDir)).length;
      } catch {
        return; // fd introspection unavailable on this platform
      }

      for (let index = 0; index < 10; index++) {
        const stream = await createPlaybackEvidenceReadStream(
          logicalPath, {allowIncomplete: index % 2 === 0});
        await once(stream, 'data');
        stream.destroy();
        await once(stream, 'close');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));

      const finalFdCount = (await readdir(fdDir)).length;
      assert.ok(
        finalFdCount <= baselineFdCount + 1,
        'aborted decoded streams leaked file descriptors: ' +
          `${baselineFdCount} -> ${finalFdCount}`,
      );
    });
  });
});
