// The real startup owner must not turn a failed public listener into a ready
// runtime. The occupied listener belongs to this test; the child uses the
// existing actual fresh-seed public startup actuator without substitutions.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {contender} from '../entrypoint/data-directory-owner-contender.js';

const CHILD = new URL('../test-helpers/fresh-seed-activation-public-child.js', import.meta.url);
const HOST = '127.0.0.1';
const NODE_ID = '550e8400-e29b-41d4-a716-446655449973';
const allocator = createPortAllocator(import.meta.url);

function connectOutcome(port) {
  return new Promise((resolve) => {
    const socket = net.connect({host: HOST, port, localAddress: '127.0.0.2'});
    socket.once('connect', () => {
      socket.destroy();
      resolve('connected');
    });
    socket.once('error', (error) => resolve(error.code));
  });
}

test('occupied transport listener refuses real seed startup and releases only its own custody',
  {timeout: 240000}, async (t) => {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'seed-listener-failure-'));
    const ports = allocator.getListenerPorts();
    const blockerErrors = new Map();
    const blockerConnections = new Set();
    const blocker = net.createServer((socket) => {
      blockerConnections.add(socket);
      socket.once('close', () => blockerConnections.delete(socket));
      socket.on('error', (error) =>
        blockerErrors.set(error.code, (blockerErrors.get(error.code) || 0) + 1));
      socket.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    });
    blocker.listen(ports.transportWebSocketPort, HOST);
    await once(blocker, 'listening');
    const blockerAddress = blocker.address();
    const outputPath = path.join(directory, 'child-output.log');
    const output = fs.createWriteStream(outputPath);
    const child = fork(CHILD, ['initial', directory, NODE_ID, JSON.stringify(ports), HOST],
      {execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
    child.stdout.pipe(output, {end: false});
    child.stderr.pipe(output, {end: false});
    const closed = new Promise((resolve) => child.once('close', (code, signal) =>
      output.end(() => resolve({code, signal}))));
    let passed = false;
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await closed;
      for (const socket of blockerConnections) socket.destroy();
      await new Promise((resolve) => blocker.close(resolve));
      if (passed) fs.rmSync(directory, {recursive: true, force: true});
    });
    const [report] = await once(child, 'message');
    // The original process remains alive while a distinct process asks the
    // production directory owner whether cleanup released custody.
    const custody = await contender(t, directory);
    const restAfterCleanup = await connectOutcome(ports.restApiPort);
    t.diagnostic(JSON.stringify({directory, outputPath, blockerAddress,
      blockerErrors: Object.fromEntries(blockerErrors),
      returnedRuntime: report.returnedRuntime, startupError: report.startupError,
      cleanupError: report.cleanupError, readyAdmissions: report.observation.admission
        .filter(({surface}) => surface === 'rest-readyz'), custody, restAfterCleanup}));
    child.send('exit-after-observation');
    assert.deepEqual(await closed, {code: 0, signal: null});
    assert.equal(report.returnedRuntime, false, 'a failed listen cannot return a runtime');
    assert.equal(report.startupError?.code, 'EADDRINUSE', 'the actual bind error survives startup');
    assert.equal(report.cleanupError, null);
    assert.deepEqual(report.observation.admission.filter(({surface}) => surface === 'rest-readyz'),
      [], 'failed startup never publishes a ready HTTP response');
    assert.equal(restAfterCleanup, 'ECONNREFUSED', 'startup cleanup closes its HTTP listener');
    assert.equal(custody.acquired, true, 'successful cleanup releases real directory custody');
    assert.deepEqual(blocker.address(), blockerAddress,
      'startup cleanup does not close another owner\'s occupied listener');
    passed = true;
  });
