import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {test} from 'node:test';
import {verifyInstalledRuntime} from '../../scripts/npm-runtime-smoke.js';
import {buildNpmPackage, verifyInstalledPackage} from '../../scripts/release-npm-package.js';

const CHILD_PID = 987654;
const EXCESS_OUTPUT_BYTES = 32 * 1024 * 1024;

async function controlledChild(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-runtime-owner-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const log = path.join(directory, 'runtime.log');
  const child = Object.assign(new EventEmitter(), {
    pid: CHILD_PID, stdout: new PassThrough(), stderr: new PassThrough(),
  });
  const launched = Promise.withResolvers();
  const operation = verifyInstalledRuntime(directory, path.join(directory, 'data'), log,
    (command, args, options) => {
      assert.equal(command, process.execPath);
      assert.equal(options.cwd, directory);
      assert.equal(options.detached, process.platform !== 'win32');
      launched.resolve({config: JSON.parse(args[1]), consumer: args[0]});
      return child;
    });
  const details = await launched.promise;
  return {child, operation, log, ...details};
}

function writeWitnesses(fixture) {
  fixture.child.stdout.write(fixture.config.startedMarker + '\n' +
    fixture.config.stoppedMarker + '\n');
}

function capturedBytes(file, stream) {
  const records = fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  return Buffer.concat(records.filter((entry) => entry.stream === stream)
    .map((entry) => Buffer.from(entry.base64, 'base64')));
}

test('installed runtime process owner waits for close after exit and preserves raw output', async (t) => {
  const fixture = await controlledChild(t);
  writeWitnesses(fixture);
  let settled = false;
  fixture.operation.then(() => {
    settled = true;
  });
  fixture.child.emit('exit', 0, null);
  await Promise.resolve();
  assert.equal(settled, false);
  assert(fs.existsSync(fixture.consumer));
  fixture.child.emit('close', 0, null);
  await fixture.operation;
  assert.equal(fs.existsSync(fixture.consumer), false);
  assert.match(capturedBytes(fixture.log, 'stdout').toString('utf8'), /LAGRANGE_NPM_RUNTIME_STOPPED/);
});

test('installed runtime process owner rejects zero exit without actual lifecycle witnesses',
  async (t) => {
    const fixture = await controlledChild(t);
    const rejected = assert.rejects(fixture.operation, /lacks start\/stop witnesses/);
    fixture.child.emit('close', 0, null);
    await rejected;
  });

test('installed runtime process owner preserves startup failure even after an exit event', async (t) => {
  const fixture = await controlledChild(t);
  fixture.child.stderr.write('first runtime-start failure\n');
  const rejected = assert.rejects(fixture.operation, /first runtime-start failure/);
  fixture.child.emit('exit', 1, null);
  fixture.child.emit('close', 1, null);
  await rejected;
  assert.equal(capturedBytes(fixture.log, 'stderr').toString('utf8'), 'first runtime-start failure\n');
});

test('installed runtime output preserves split UTF8 bytes separately across interleaved streams',
  async (t) => {
    const fixture = await controlledChild(t);
    const stdout = Buffer.from('λ🙂\n');
    const stderr = Buffer.from('分割\n');
    for (let index = 0; index < Math.max(stdout.length, stderr.length); index += 1) {
      if (index < stdout.length) fixture.child.stdout.write(stdout.subarray(index, index + 1));
      if (index < stderr.length) fixture.child.stderr.write(stderr.subarray(index, index + 1));
    }
    writeWitnesses(fixture);
    fixture.child.emit('close', 0, null);
    await fixture.operation;
    assert.deepEqual(capturedBytes(fixture.log, 'stdout').subarray(0, stdout.length), stdout);
    assert.deepEqual(capturedBytes(fixture.log, 'stderr'), stderr);
  });

test('stderr lifecycle text cannot substitute for public stdout witnesses', async (t) => {
  const fixture = await controlledChild(t);
  fixture.child.stderr.write(fixture.config.startedMarker + '\n' +
    fixture.config.stoppedMarker + '\n');
  const rejected = assert.rejects(fixture.operation, /lacks start\/stop witnesses/);
  fixture.child.emit('close', 0, null);
  await rejected;
});

test('installed runtime process owner kills the complete process group at its deadline', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const fixture = await controlledChild(t);
  const kills = [];
  t.mock.method(process, 'kill', (pid, signal) => {
    kills.push({pid, signal});
    fixture.child.emit('close', null, signal);
    return true;
  });
  const rejected = assert.rejects(fixture.operation, /deadline expired/);
  t.mock.timers.runAll();
  await rejected;
  assert.deepEqual(kills, [{pid: -CHILD_PID, signal: 'SIGKILL'}]);
});

test('installed runtime process owner bounds missing close after spawn failure', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const fixture = await controlledChild(t);
  const kills = [];
  t.mock.method(process, 'kill', (pid) => {
    kills.push(pid); return true;
  });
  fixture.child.emit('error', new Error('spawn boundary failed'));
  const rejected = assert.rejects(fixture.operation, /did not close after kill/);
  t.mock.timers.runAll();
  t.mock.timers.runAll();
  await rejected;
  assert.deepEqual(kills, [-CHILD_PID]);
  assert.equal(fixture.child.stdout.destroyed, true);
  assert.equal(fixture.child.stderr.destroyed, true);
});

test('installed runtime process owner refuses unbounded child output', async (t) => {
  const fixture = await controlledChild(t);
  t.mock.method(process, 'kill', () => {
    fixture.child.emit('close', null, 'SIGKILL');
    return true;
  });
  const rejected = assert.rejects(fixture.operation, /output limit exceeded/);
  fixture.child.stdout.write(Buffer.alloc(EXCESS_OUTPUT_BYTES));
  await rejected;
  assert.equal(fs.statSync(fixture.log).size, 0);
});

test('npm package and installed runtime harnesses refuse before acting under passive probes',
  async () => {
    const previous = process.env.LAGRANGE_PROBE;
    process.env.LAGRANGE_PROBE = '1';
    try {
      await assert.rejects(buildNpmPackage(), /refused under LAGRANGE_PROBE=1/);
      await assert.rejects(verifyInstalledPackage({}), /refused under LAGRANGE_PROBE=1/);
      await assert.rejects(verifyInstalledRuntime('/absent', '/absent/data', '/absent/log'),
        /refused under LAGRANGE_PROBE=1/);
    } finally {
      if (previous === undefined) delete process.env.LAGRANGE_PROBE;
      else process.env.LAGRANGE_PROBE = previous;
    }
  });
