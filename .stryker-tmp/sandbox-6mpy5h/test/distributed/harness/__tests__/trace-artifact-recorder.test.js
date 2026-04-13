/**
 * Unit tests for trace artifact recorder.
 */
// @ts-nocheck


import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WebSocketServer} from 'ws';
import {
  TraceArtifactRecorder,
} from '../trace-artifact-recorder.js';
import {OUTPUT} from '../constants.js';

const TRACE_PATH = '/api/admin/debug/trace';
const SESSION_PATH = '/api/admin/debug/sessions';
const JSON_CONTENT_TYPE = 'application/json';
const STATUS_OK = 200;

test('TraceArtifactRecorder captures trace stream and writes artifacts',
  async (t) => {
    const tempDir = await mkdtemp(
      join(tmpdir(), 'trace-recorder-test-'),
    );

    let createSessionCalls = 0;
    let detachSessionCalls = 0;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'POST' &&
        url.pathname === SESSION_PATH) {
        createSessionCalls += 1;
      } else if (req.method === 'PATCH' &&
        url.pathname.startsWith(`${SESSION_PATH}/`)) {
        detachSessionCalls += 1;
      }
      res.statusCode = STATUS_OK;
      res.setHeader('content-type', JSON_CONTENT_TYPE);
      res.end(JSON.stringify({ok: true}));
    });
    const wss = new WebSocketServer({
      server,
      path: TRACE_PATH,
    });

    await new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve());
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const adminApiPort = address.port;

    wss.on('connection', (socket) => {
      socket.send(JSON.stringify({
        level: 'info',
        message: 'first',
        lineageId: 'lineage-a',
        nodeId: 'node-a',
      }));
      socket.send(JSON.stringify({
        level: 'debug',
        message: 'second',
        lineageId: 'lineage-b',
        nodeId: 'node-b',
      }));
    });

    const recorder = new TraceArtifactRecorder({
      outputDir: tempDir,
    });

    try {
      await recorder.start({
        scenarioName: 'trace-scenario',
        node: {
          id: 'node-seed',
          ip: '127.0.0.1',
        },
        debugTrace: {
          enabled: true,
          serviceName: 'svc-debug',
          adminApiPort,
        },
      });

      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      const manifest = await recorder.stop();

      assert.equal(createSessionCalls, 1);
      assert.equal(detachSessionCalls, 1);
      assert.equal(manifest.eventCount, 2);
      assert.deepEqual(manifest.lineageIds, ['lineage-a', 'lineage-b']);
      assert.deepEqual(manifest.nodeIds, ['node-a', 'node-b']);
      assert.ok(manifest.files.events.endsWith(OUTPUT.DEBUG_TRACE_EVENTS_FILENAME));
      assert.ok(
        manifest.files.manifest.endsWith(OUTPUT.DEBUG_TRACE_MANIFEST_FILENAME),
      );

      const eventsRaw = await readFile(manifest.files.events, 'utf8');
      const lines = eventsRaw.trim().split('\n');
      assert.equal(lines.length, 2);
      const first = JSON.parse(lines[0]);
      assert.equal(first.message, 'first');
    } finally {
      await new Promise((resolve) => {
        wss.close(() => resolve());
      });
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
      await rm(tempDir, {recursive: true, force: true});
    }
  });

test('TraceArtifactRecorder emits warning when started without node context',
  async () => {
    const recorder = new TraceArtifactRecorder({
      outputDir: 'test-output',
    });
    await recorder.start({
      scenarioName: 'trace-without-node',
      debugTrace: {enabled: true},
    });
    const manifest = await recorder.stop();
    assert.ok(Array.isArray(manifest.warnings));
    assert.ok(manifest.warnings.length > 0);
  });
