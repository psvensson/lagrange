// Does a fresh seed's bootstrap take the CDC bootstrap-direct lane's
// fallback arm (line-regression-causes stage 3, item 5, report only)?
// cdc-bootstrap-direct-sql.js sends each write of the seed's registration
// window through the raft lane first and, when that lane answers a failure or
// throws, re-executes the same SQL on the local replicas OUTSIDE raft
// (executeLocalQuery), under no key. The arm logs
// CDC_LOG_MSG.BOOTSTRAP_RAFT_WRITE_LANE_FELL_BACK before it runs.
//
// The seed runs through the actual public startLagrangeRuntime in a new child
// process (test/test-helpers/fresh-seed-activation-public-child.js, the
// fresh-seed-activation witness's child) with its own warnings logged;
// nothing is replaced. Green: this fresh seed bootstrapped without the arm.
// Red: the arm ran; the failure lists every fallback with the raft lane's
// error, i.e. what the arm was needed for in a real bootstrap.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {CDC_LOG_MSG} from '../../src/cdc/cdc-constants.js';

const CHILD = new URL('../test-helpers/fresh-seed-activation-public-child.js', import.meta.url);
const NODE_ID = '550e8400-e29b-41d4-a716-446655449981';
const HOST = '127.0.0.1';
const LOG_LEVEL = 'warn';
const TEST_TIMEOUT_MS = 240000;
const FALLBACK = CDC_LOG_MSG.BOOTSTRAP_RAFT_WRITE_LANE_FELL_BACK;
const allocator = createPortAllocator(import.meta.url);

async function startFreshSeed(directory) {
  const ports = allocator.getListenerPorts();
  const child = fork(CHILD, ['initial', directory, NODE_ID, JSON.stringify(ports), HOST, LOG_LEVEL],
    {execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const closed = new Promise((resolve) => child.once('close', resolve));
  try {
    const report = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('message', resolve);
      child.once('close', () =>
        reject(new Error(`fresh seed exited before its report:\n${output}`)));
    });
    if (child.connected) child.send('exit-after-observation');
    await closed;
    return {report, output};
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  }
}

test('a fresh seed bootstraps without re-executing a write outside raft',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'seed-bootstrap-direct-lane-'));
    try {
      const {report, output} = await startFreshSeed(directory);
      const fallbacks = output.split('\n').filter((line) => line.includes(FALLBACK));
      console.log(`# WITNESS seed-bootstrap-direct-lane ${JSON.stringify({
        returnedRuntime: report.returnedRuntime, startupError: report.startupError,
        serviceWrite: report.service?.write?.success ?? null, fallbacks: fallbacks.length})}`);
      for (const line of fallbacks) console.log(`# WITNESS fallback ${line}`);
      assert.equal(report.returnedRuntime, true,
        `the seed reached service (${JSON.stringify(report.startupError)})`);
      assert.deepEqual(fallbacks, [], 'the raft lane failed and the direct arm ran');
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
