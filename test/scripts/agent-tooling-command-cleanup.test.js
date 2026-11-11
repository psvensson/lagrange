// Real Node permission denial after actual child execution; no mocked process result.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {run, requireSuccess} from '../../scripts/agent-tooling/process.js';

const OWNER = new URL('../../scripts/agent-tooling/process.js', import.meta.url).href;
const CHILD_TIMEOUT_MS = 500;
const OBSERVER_TIMEOUT_MS = 15000;
const STDOUT = 'actual retained stdout';
const STDERR = 'actual retained stderr';

function restrictedExecution(t, mode, outcome) {
  const root = fs.realpathSync(process.cwd());
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tooling-cleanup-denial-'));
  t.after(() => fs.rmSync(directory, {recursive: true}));
  const marker = path.join(directory, 'executed.json');
  const workload = `
    const fs = require('node:fs');
    fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({pid: process.pid}));
    fs.writeSync(1, ${JSON.stringify(STDOUT)});
    fs.writeSync(2, ${JSON.stringify(STDERR)});
    ${outcome === 'timeout' ? 'setInterval(() => {}, 1000);' : ''}
  `;
  const invocation = mode === 'raw-node-control' ?
    'spawnSync(process.execPath, ["-e", workload], options)' :
    'run(process.cwd(), process.execPath, ["-e", workload], options)';
  const script = `
    import fs from 'node:fs';
    import {spawnSync} from 'node:child_process';
    import {run, requireSuccess} from ${JSON.stringify(OWNER)};
    const workload = ${JSON.stringify(workload)};
    const options = {timeout: ${CHILD_TIMEOUT_MS}, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']};
    try {
      const observation = ${invocation};
      let refusal = null;
      if (${JSON.stringify(mode)} === 'production-owner') {
        try { requireSuccess(observation); }
        catch (error) { refusal = error.message; }
      }
      fs.writeSync(1, JSON.stringify({observation, refusal}));
    } catch (error) {
      fs.writeSync(1, JSON.stringify({thrown: {code: error.code, message: error.message}}));
    }
  `;
  const args = ['--permission', '--allow-child-process',
    `--allow-fs-read=${root}`, `--allow-fs-read=${directory}`,
    `--allow-fs-write=${directory}`, '--input-type=module', '-e', script];
  const observed = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8',
    timeout: OBSERVER_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe']});
  t.diagnostic(JSON.stringify({mode, outcome, status: observed.status,
    stdout: observed.stdout, stderr: observed.stderr}));
  assert.equal(observed.status, 0, 'the real restricted observer completed');
  assert.equal(observed.signal, null);
  assert.equal(observed.error, undefined);
  const executed = JSON.parse(fs.readFileSync(marker, 'utf8'));
  assert.equal(fs.existsSync(`/proc/${executed.pid}`), false,
    'the unrestricted observer sees that the deliberately bounded child exited');
  return {record: JSON.parse(observed.stdout), executed};
}

test('raw Node still returns actual output under the same permission restriction', (t) => {
  const {record: {observation}} = restrictedExecution(t, 'raw-node-control', 'success');
  assert.equal(observation.status, 0);
  assert.equal(observation.signal, null);
  assert.equal(observation.stdout, STDOUT);
  assert.ok(observation.stderr.startsWith(STDERR));
});

for (const outcome of ['success', 'timeout']) {
  test(`cleanup denial preserves the actual ${outcome} result and refuses success`, (t) => {
    const {record: observed, executed} = restrictedExecution(t, 'production-owner', outcome);
    assert.equal(Object.hasOwn(observed, 'observation'), true,
      'catchable post-execution cleanup failure must retain the command observation');
    const {observation, refusal} = observed;
    assert.equal(observation.stdout, STDOUT);
    assert.ok(observation.stderr.startsWith(STDERR));
    assert.equal(observation.cwd, fs.realpathSync(process.cwd()));
    assert.equal(observation.command[0], process.execPath);
    assert.ok(Date.parse(observation.endedAt) >= Date.parse(observation.startedAt));
    assert.match(refusal, /tooling_command_unavailable/u);
    const failure = JSON.parse(observation.error);
    assert.equal(failure.code, 'tooling_command_cleanup_unavailable');
    assert.equal(failure.cleanupError.code, 'ERR_ACCESS_DENIED');
    assert.ok(failure.cleanupError.message.length > 0);
    assert.equal(failure.groupId, executed.pid);
    if (outcome === 'success') {
      assert.equal(observation.exitCode, 0);
      assert.equal(observation.signal, null);
      assert.equal(failure.commandError, null);
    } else {
      assert.equal(observation.exitCode, null);
      assert.equal(observation.signal, 'SIGKILL');
      assert.equal(failure.commandError.code, 'ETIMEDOUT');
      assert.match(failure.commandError.message, /ETIMEDOUT/u);
    }
  });
}

test('native spawn failure represents unavailable streams explicitly without inventing bytes', () => {
  const root = fs.realpathSync(process.cwd());
  const command = path.join(root, 'test-output', 'absent-command-cleanup-retention-control');
  assert.equal(fs.existsSync(command), false);
  const observation = run(root, command, [], {timeout: CHILD_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe']});
  assert.equal(observation.exitCode, null);
  assert.equal(observation.signal, null);
  assert.match(observation.error, /ENOENT/u);
  assert.equal(observation.stdout, null);
  assert.equal(observation.stderr, null);
  assert.throws(() => requireSuccess(observation), /tooling_command_unavailable/u);
});

test('a deliberately uncaptured stream is not textual command success', () => {
  const root = fs.realpathSync(process.cwd());
  const observation = run(root, process.execPath, ['-e', 'process.exit(0)'],
    {timeout: CHILD_TIMEOUT_MS, stdio: ['ignore', 'ignore', 'pipe']});
  assert.equal(observation.exitCode, 0);
  assert.equal(observation.error, null);
  assert.equal(observation.stdout, null);
  assert.throws(() => requireSuccess(observation), /tooling_command_output_unavailable/u);
});
