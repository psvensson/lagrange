// Starts one real fresh seed through the fresh-seed public child
// (test/test-helpers/fresh-seed-activation-public-child.js: the actual
// public startLagrangeRuntime in a new process) with the bootstrap-lane
// observer installed, and answers its report and wall time.
import {fork} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const CHILD = new URL('./fresh-seed-activation-public-child.js', import.meta.url);
const HOST = '127.0.0.1';
const LOG_LEVEL = 'error';

async function startObservedFreshSeed({nodeId, ports, observe}) {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'seed-bootstrap-lane-'));
  const startedAt = Date.now();
  const child = fork(CHILD, ['initial', directory, nodeId, JSON.stringify(ports), HOST, LOG_LEVEL,
    observe], {execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
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
    const wallMs = Date.now() - startedAt;
    if (child.connected) child.send('exit-after-observation');
    await closed;
    return {report, wallMs};
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

export {startObservedFreshSeed};
