// Component proof: startup cleanup and real process-directory ownership.
// This does not execute a successor runtime or claim native recreation safety.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import Database from 'better-sqlite3';
import {acquireDataDirectoryProcessOwner, DATA_DIRECTORY_OWNER_ERROR_CODE} from
  '../../src/storage/data-directory-process-owner.js';
import {createStartupAcquisitionLedger} from
  '../../src/entrypoint-startup-acquisition-ledger.js';

const OWNER_MODULE = new URL('../../src/storage/data-directory-process-owner.js', import.meta.url);

function contender(t, dataDir) {
  // Same genuine second-process acquisition convention as
  // replica-lifecycle-durable-generation.test.js; no lock implementation fake.
  const program = `
    import {acquireDataDirectoryProcessOwner} from ${JSON.stringify(OWNER_MODULE.href)};
    try {
      const owner = acquireDataDirectoryProcessOwner(${JSON.stringify(dataDir)});
      process.stdout.write(JSON.stringify({acquired:true,pid:process.pid}));
      owner.release();
    } catch (error) {
      process.stdout.write(JSON.stringify({acquired:false,pid:process.pid,
        code:error.code,message:error.message}));
      process.exitCode = error.code === ${JSON.stringify(DATA_DIRECTORY_OWNER_ERROR_CODE)} ?
        23 : 24;
    }
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', program],
      {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (bytes) => {
      stdout += bytes;
    });
    child.stderr.on('data', (bytes) => {
      stderr += bytes;
    });
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => {
      try {
        resolve({exitCode, signal, stderr, ...JSON.parse(stdout)});
      } catch (error) {
        reject(new Error(`contender failed to report: ${stdout}; ${stderr}`, {cause: error}));
      }
    });
  });
}


for (const failCleanup of [true, false]) {
  test(`startup cleanup preserves process custody when cleanup fails=${failCleanup}`, async (t) => {
    const dataDir = mkdtempSync(join(tmpdir(), 'creation-startup-custody-'));
    const owner = acquireDataDirectoryProcessOwner(dataDir);
    const oldResource = new Database(join(dataDir, 'old-resource.sqlite'));
    const ledger = createStartupAcquisitionLedger();
    const events = [];
    const failure = new Error('injected owned cleanup failure');
    t.after(() => {
      if (oldResource.open) oldResource.close();
      owner.release();
      rmSync(dataDir, {recursive: true, force: true});
    });
    // Registered first: released last, and only if every ordinary cleanup succeeds.
    // The predecessor accepts but ignores this proposed option; the failure is
    // measured acquisition with a real old handle, never an unknown API failure.
    ledger.defer(() => {
      events.push('release-process-owner');
      owner.release();
    }, {requiresSuccessfulCleanup: true});
    ledger.defer(() => {
      events.push('later-ordinary-cleanup');
    });
    ledger.defer(() => {
      events.push('owned-resource-cleanup');
      if (failCleanup) throw failure;
      oldResource.close();
    });
    const before = await contender(t, dataDir);
    assert.equal(before.exitCode, 23, 'real competing process is initially fenced');
    let error = null;
    try {
      await ledger.unwind();
    } catch (cause) {
      error = cause;
    }
    const after = await contender(t, dataDir);
    t.diagnostic(JSON.stringify({scope: 'component startup custody', failCleanup,
      before, after, events, oldResourceOpen: oldResource.open,
      error: error?.message ?? null}));
    assert.equal(error, failCleanup ? failure : null);
    assert.equal(events.includes('later-ordinary-cleanup'), true,
      'one cleanup failure does not skip the remaining ordinary owners');
    assert.equal(oldResource.open, failCleanup);
    assert.equal(after.exitCode, failCleanup ? 23 : 0,
      failCleanup ? 'STARTUP_RELEASED_PROCESS_CUSTODY_AFTER_FAILED_CLEANUP' :
        'HEALTHY_STARTUP_UNWIND_MUST_RELEASE_CUSTODY');
    assert.equal(events.includes('release-process-owner'), !failCleanup);
    await ledger.unwind();
    assert.equal(events.filter((event) => event === 'owned-resource-cleanup').length, 1,
      'a repeated unwind does not retry a possibly effectful cleanup');
  });
}
