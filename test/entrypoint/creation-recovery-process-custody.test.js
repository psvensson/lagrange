// Component witness for a proposed creation-recovery premise, not a native RF3
// or data-loss demonstration. The injected failure leaves a real old SQLite
// resource open; the actual shutdown and data-directory lock owners are composed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import Database from 'better-sqlite3';
import {acquireDataDirectoryProcessOwner, bindDataDirectoryProcessOwner,
  DATA_DIRECTORY_OWNER_ERROR_CODE} from '../../src/storage/data-directory-process-owner.js';
import {createRuntimeShutdown} from '../../src/entrypoint-runtime-shutdown-lifecycle.js';

const OWNER_MODULE = new URL('../../src/storage/data-directory-process-owner.js', import.meta.url);
const QUIET_LOGGER = {info() {}, warn() {}, error() {}, debug() {}};

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

function fixture(t, failureAt = null) {
  const dataDir = mkdtempSync(join(tmpdir(), 'creation-process-custody-'));
  const owner = acquireDataDirectoryProcessOwner(dataDir);
  const oldResource = new Database(join(dataDir, 'old-owned-resource.sqlite'));
  const events = [];
  const injectedFailure = new Error(`injected ${failureAt} failure`);
  const shutdownRuntime = createRuntimeShutdown({
    logger: QUIET_LOGGER, nodeId: 'component-node', adminAPI: null,
    async closeApplicationDatabases() {
      events.push('closeApplicationDatabases');
      if (failureAt === 'closeApplicationDatabases') throw injectedFailure;
    },
    membershipLifecycleController: {
      async submitDrainIntent() {
        events.push('submitDrainIntent');
        if (failureAt === 'submitDrainIntent') throw injectedFailure;
        return {};
      },
    },
    async ownerCleanup() {
      events.push('ownerCleanup');
      oldResource.close();
    },
    bootstrapAPI: {
      async shutdown() {
        events.push('bootstrapAPI.shutdown');
      },
    },
  });
  const runtime = bindDataDirectoryProcessOwner({shutdownRuntime}, owner);
  t.after(() => {
    owner.release();
    if (oldResource.open) oldResource.close();
    rmSync(dataDir, {recursive: true, force: true});
  });
  return {dataDir, oldResource, events, runtime, injectedFailure};
}

for (const failureAt of ['closeApplicationDatabases', 'submitDrainIntent']) {
  test(`creation recovery cannot use process-lock acquisition after ${failureAt} rejects`, async (t) => {
    const f = fixture(t, failureAt);
    const before = await contender(t, f.dataDir);
    assert.equal(before.exitCode, 23, 'actual competing process is fenced before shutdown');
    assert.equal(before.code, DATA_DIRECTORY_OWNER_ERROR_CODE);
    assert.notEqual(before.pid, process.pid);
    let rejected;
    try {
      await f.runtime.shutdownRuntime();
    } catch (error) {
      rejected = error;
    }
    assert.equal(rejected, f.injectedFailure, 'the named failure is the shutdown rejection');
    assert.equal(f.events.includes('ownerCleanup'), false, 'resource owner never received cleanup');
    assert.equal(f.oldResource.open, true, 'the old real SQLite resource is still open');
    const after = await contender(t, f.dataDir);
    t.diagnostic(JSON.stringify({scope: 'component creation-recovery custody premise', failureAt,
      parentPid: process.pid, before, events: f.events,
      shutdownError: {message: rejected.message}, oldResourceOpen: f.oldResource.open, after,
      limitation: 'acquisition is tested; no successor startup, recreation or RF3 is claimed'}));
    assert.equal(after.exitCode, 23, 'SUCCESSOR_ADMITTED_WITH_UNRELEASED_OLD_RESOURCE');
    assert.equal(after.acquired, false);
    assert.equal(after.code, DATA_DIRECTORY_OWNER_ERROR_CODE);
  });
}

test('healthy runtime shutdown releases the process lock only after owned resource cleanup', async (t) => {
  const f = fixture(t);
  const before = await contender(t, f.dataDir);
  assert.equal(before.exitCode, 23);
  await f.runtime.shutdownRuntime();
  const after = await contender(t, f.dataDir);
  t.diagnostic(JSON.stringify({scope: 'healthy component shutdown', before, events: f.events,
    oldResourceOpen: f.oldResource.open, after}));
  assert.deepEqual(f.events, ['closeApplicationDatabases', 'submitDrainIntent', 'ownerCleanup',
    'bootstrapAPI.shutdown']);
  assert.equal(f.oldResource.open, false);
  assert.equal(after.exitCode, 0);
  assert.equal(after.acquired, true);
});
