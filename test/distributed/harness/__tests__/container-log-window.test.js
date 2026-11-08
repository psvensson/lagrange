// A container's Docker log output is read as a stream and windowed as it
// arrives (container-log-window.js): the last bytes are kept, every byte is
// counted, and peak memory is the window, never the log (quest
// failure-bundle-evidence-completeness, R12/R13 acquisition bound).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readContainerLogWindow} from '../container-log-window.js';
import {DockerProvider} from '../docker-provider.js';
import {LOG_WINDOW_COVERAGE} from '../failure-bundle-artifact-foundation.js';
import {FAILURE_STDERR_LOG_TAIL_BYTES} from '../constants.js';
import {
  DOCKER_STREAM,
  dockerLogFrame,
  fakeDockerDaemon,
} from './fake-docker-daemon.js';

const MIB = 1024 * 1024;
const stringIncludes = Function.call.bind(String.prototype.includes);

describe('readContainerLogWindow', () => {
  it('streams the log (follow:false) and keeps the last bytes, counting ' +
    'every byte', async () => {
    const lines = [];
    for (let index = 0; index < 50; index += 1) {
      lines.push(`line ${100 + index} ${'z'.repeat(40)}`);
    }
    const chunks = [];
    for (const [index, line] of lines.entries()) {
      chunks.push(dockerLogFrame(index % 2 ? DOCKER_STREAM.STDERR : DOCKER_STREAM.STDOUT,
        line + '\n'));
    }
    const dials = [];
    const total = Buffer.byteLength(lines.join('\n') + '\n');
    const {lines: kept, coverage} = await readContainerLogWindow(
      fakeDockerDaemon(chunks, dials), 'c1', {maxRetainedBytes: 500});
    assert.equal(dials[0].isStream, true, 'read as a stream');
    assert.equal(dials[0].options.follow, false, 'the daemon ends it');
    assert.equal(dials[0].options.tail, undefined, 'no line tail');
    assert.ok(coverage.retainedBytes <= 500);
    assert.equal(coverage.retainedBytes + coverage.withheldBytes, total);
    assert.equal(kept[kept.length - 1], lines[lines.length - 1]);
    assert.equal(coverage.source, 'container:c1');
  });

  it('an empty output is a missing-class record, never a complete window',
    async () => {
      const {coverage} = await readContainerLogWindow(fakeDockerDaemon([]), 'c2',
        {maxRetainedBytes: 500});
      assert.equal(coverage.missingReason,
        LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_EMPTY);
      assert.equal(coverage.complete, false);
    });

  it('holds the window, not the log: 256 MiB streams through a 1 MiB window',
    async () => {
      const frameBody = Buffer.alloc(MIB, 'q');
      const oneFrame = dockerLogFrame(DOCKER_STREAM.STDOUT, frameBody);
      const FRAME_COUNT = 256;
      const baseline = process.memoryUsage().arrayBuffers;
      let peak = 0;
      function* frames() {
        for (let index = 0; index < FRAME_COUNT; index += 1) {
          peak = Math.max(peak, process.memoryUsage().arrayBuffers - baseline);
          yield oneFrame;
        }
      }
      const {coverage} = await readContainerLogWindow(
        fakeDockerDaemon(frames()), 'c3', {maxRetainedBytes: MIB});
      assert.equal(coverage.retainedBytes, MIB);
      assert.equal(coverage.withheldBytes, (FRAME_COUNT - 1) * MIB);
      assert.ok(peak < 128 * MIB,
        `peak external memory ${peak} bytes must stay far below the log`);
    });
});

describe('DockerProvider failed-container echo', () => {
  it('prints the streamed tail with the withheld count', async () => {
    const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});
    const body = 'e'.repeat(FAILURE_STDERR_LOG_TAIL_BYTES * 2) + '\nlast line\n';
    provider._docker = {...fakeDockerDaemon([dockerLogFrame(DOCKER_STREAM.STDERR, body)]),
      getContainer: () => ({remove: async () => {}})};
    const written = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = (chunk) => {
      written.push(String(chunk));
      return true;
    };
    try {
      await provider._cleanupFailedContainer('failed-1');
    } finally {
      process.stderr.write = originalWrite;
    }
    const echo = written.join('');
    assert.match(echo, new RegExp(
      `last ${FAILURE_STDERR_LOG_TAIL_BYTES} bytes; ` +
      `${Buffer.byteLength(body) - FAILURE_STDERR_LOG_TAIL_BYTES} earlier ` +
      'bytes withheld'));
    assert.ok(stringIncludes(echo, 'last line'));
  });
});
