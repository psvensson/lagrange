import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {test} from 'node:test';
import {NPM_RUNTIME_MARKER, runInstalledRuntimeProcess} from '../../scripts/npm-runtime-process.js';

const CHILD_PID = 987654;

test('installed process settlement cannot mistake exit for closed inherited pipes', async () => {
  const child = Object.assign(new EventEmitter(), {pid: CHILD_PID,
    stdout: new PassThrough(), stderr: new PassThrough()});
  const operation = runInstalledRuntimeProcess('/consumer', '/consumer/smoke.mjs', {}, [],
    () => child);
  child.stdout.write(NPM_RUNTIME_MARKER.STARTED + '\n' + NPM_RUNTIME_MARKER.STOPPED + '\n');
  let settled = false;
  operation.then(() => {
    settled = true;
  });
  child.emit('exit', 0, null);
  await Promise.resolve();
  assert.equal(settled, false, 'exit must not settle the owned pipe lifetime');
  child.emit('close', 0, null);
  await operation;
});
