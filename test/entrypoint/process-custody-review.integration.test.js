import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {
  acquireDataDirectoryProcessOwner,
  DATA_DIRECTORY_OWNER_ERROR_CODE,
} from '../../src/storage/data-directory-process-owner.js';
import {createStartupAcquisitionLedger} from
  '../../src/entrypoint-startup-acquisition-ledger.js';

const CHILD = new URL('./process-custody-review-child.js', import.meta.url);

function directory() {
  const dataDir = mkdtempSync(join(tmpdir(), 'custody-review-'));
  return {dataDir, remove: () => rmSync(dataDir, {recursive: true, force: true})};
}

function probe(dataDir) {
  try {
    const owner = acquireDataDirectoryProcessOwner(dataDir);
    owner.release();
    return 'acquired';
  } catch (error) {
    assert.equal(error.code, DATA_DIRECTORY_OWNER_ERROR_CODE);
    return 'held';
  }
}

function childOwner(t, mode, fixture) {
  const child = fork(CHILD, [mode, fixture.dataDir], {
    execArgv: ['--expose-gc'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  const capture = (bytes) => {
    output = (output + bytes.toString()).slice(-64000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const closed = new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({code, signal}));
  });
  const ready = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('message', resolve);
    child.once('close', () => reject(new Error(`owner exited before ready: ${output}`)));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
    fixture.remove();
  });
  return {child, closed, ready};
}

for (const mode of ['gc', 'startup-failed-cleanup', 'startup-healthy-cleanup']) {
  test(`process custody review: ${mode}`, async (t) => {
    const fixture = directory();
    const running = childOwner(t, mode, fixture);
    {
      const result = await running.ready;
      assert.equal(result.kind, 'ready');
      assert.equal(result.mode, mode);
      assert.notEqual(result.pid, process.pid);
      const admission = probe(fixture.dataDir);
      t.diagnostic(JSON.stringify({scope: 'process/SQLite custody only', result, admission}));
      assert.equal(admission, mode === 'startup-healthy-cleanup' ? 'acquired' : 'held',
        'LIVE_PROCESS_RELEASED_DIRECTORY_WITH_UNRETIRED_RESOURCE');
      if (mode === 'gc') {
        assert.equal(result.wrapperCollected, true, 'GC must actually collect the wrapper');
      } else {
        assert.deepEqual(result.events, ['initialize', 'shutdown'], 'actual startup must engage');
        assert.equal(result.resourceOpen, mode === 'startup-failed-cleanup');
        assert.equal(mode === 'startup-failed-cleanup' ?
          result.cleanupErrorVisible : result.originalStartupError, true,
        'STARTUP_MUST_PRESERVE_ORIGINAL_AND_CLEANUP_FAILURES');
      }
    }
    {
      if (running.child.connected) running.child.send('exit');
      const ended = await running.closed;
      assert.deepEqual(ended, {code: 0, signal: null});
      assert.equal(probe(fixture.dataDir), 'acquired', 'process death permits retained restart');
      fixture.remove();
    }
  });
}

for (const failure of [undefined, null, false, 0, '']) {
  test(`startup ledger retains falsy cleanup rejection: ${String(failure)}`, async () => {
    const ledger = createStartupAcquisitionLedger();
    const events = [];
    ledger.defer(() => events.push('exclusive'), {requiresSuccessfulCleanup: true});
    ledger.defer(() => events.push('last-ordinary'));
    ledger.defer(() => {
      throw failure;
    });
    let caught = false;
    try {
      await ledger.unwind();
    } catch (error) {
      caught = true;
      assert.equal(error, failure);
    }
    assert.equal(caught, true, 'falsy failure must not become cleanup success');
    assert.deepEqual(events, ['last-ordinary']);
    await ledger.unwind();
    assert.deepEqual(events, ['last-ordinary'], 'repeated unwind does not repeat effects');
  });
}

test('native rollback and close failure retain exact lock until explicit release', (t) => {
  const fixture = directory();
  const owner = acquireDataDirectoryProcessOwner(fixture.dataDir);
  const lockPath = owner.lockPath;
  const originalExec = Database.prototype.exec;
  const originalClose = Database.prototype.close;
  const failure = new Error('injected native release failure');
  t.after(() => {
    Database.prototype.exec = originalExec;
    Database.prototype.close = originalClose;
    owner.release();
    fixture.remove();
  });
  try {
    Database.prototype.exec = function(...args) {
      if (this.name === lockPath && args[0] === 'ROLLBACK') throw failure;
      return originalExec.apply(this, args);
    };
    Database.prototype.close = function(...args) {
      if (this.name === lockPath) throw failure;
      return originalClose.apply(this, args);
    };
    assert.throws(() => owner.release(), (error) => error === failure);
  } finally {
    Database.prototype.exec = originalExec;
    Database.prototype.close = originalClose;
  }
  try {
    assert.equal(probe(fixture.dataDir), 'held');
    owner.release();
    assert.equal(probe(fixture.dataDir), 'acquired');
    owner.release();
  } finally {
    owner.release();
    fixture.remove();
  }
});
