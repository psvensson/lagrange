// The follower-side install orchestration (raft/snapshot-catchup-install.js,
// quest partition-checkpoint-epoch-generation, finding 1): nothing
// irreversible happens before the recreation owner admits it, and on every
// path after the shutdown the stopped replica is handed to that owner
// exactly once. Real transfer, checkpoint store and install owner; the
// replica service and the recreation owner are stand-ins.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  bulkConnectionTransferSocket,
} from '../../src/raft/bulk-connection-transfer-socket.js';
import {
  RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME as OUTCOME,
  RAFT_SNAPSHOT_RECREATION_STATE as RECREATION,
} from '../../src/raft/snapshot-catchup-constants.js';
import {
  orchestrateSnapshotCatchupInstall,
} from '../../src/raft/snapshot-catchup-install.js';
import {
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION,
} from '../../src/raft/snapshot-install-constants.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON,
} from '../../src/raft/snapshot-transfer-constants.js';
import {serveSnapshotTransfer} from '../../src/raft/snapshot-transfer.js';
import {
  createAdoptedBulkConnectionPair,
  createSealedGuardGeneration,
} from './bulk-transfer-socket-fixture.js';

const PARTITION_ID = 'install_rows-p1';
const STATE_TABLE = 'install_rows';
const IDENTITY = Object.freeze({clusterId: 'install-cluster-1',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: 3});
const SMALL_CHUNK_BYTES = 4096;
const SINGLETONS = [ConfigurationManager, LoggingService];
beforeEach(() => {
  for (const singleton of SINGLETONS) singleton.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'install-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  for (const singleton of SINGLETONS) singleton.resetInstance();
});

// One offered generation driven through the orchestration. `plan` places the
// faults: the identity the install reads, the admission, the shutdown, and
// what the recreation owner answers.
async function orchestrate(plan = {}) {
  const fixture = await createSealedGuardGeneration({prefix: 'catchup-install-',
    partitionId: PARTITION_ID, stateTable: STATE_TABLE, term: 5,
    identity: IDENTITY, entryCount: 4});
  const channel = createAdoptedBulkConnectionPair();
  const calls = [];
  const service = {replicaId: `${PARTITION_ID}-r2`,
    dbPath: path.join(fixture.receiveRoot, 'replica', 'target.db'),
    isShutdown: false,
    async shutdown() {
      calls.push('shutdown');
      this.isShutdown = true;
      if (plan.shutdownThrows) throw new Error('the service could not stop');
    }};
  // The receive reads the expected identity while it runs; once the receive
  // has ended (the admission is asked next) the only reader is the install.
  let receiving = true;
  // The episode's custody: held until the plan has another owner claim it.
  let held = plan.claimedBeforeShutdown !== true;
  const custody = {isHeld: () => held};
  const expectedIdentity = () => {
    if (receiving) return plan.receiveIdentity ?? IDENTITY;
    if (plan.installIdentityThrows) throw new Error('the cache could not be read');
    return plan.installIdentity ?? IDENTITY;
  };
  try {
    const [served, result] = await Promise.all([
      serveSnapshotTransfer({
        socket: bulkConnectionTransferSocket(channel.serveConnection),
        checkpointsRoot: fixture.checkpointsRoot,
        generationIndex: fixture.boundaryIndex,
        transferId: 'catchup-install-transfer',
        chunkSizeBytes: SMALL_CHUNK_BYTES}),
      orchestrateSnapshotCatchupInstall({
        service,
        receiveOptions: {
          socket: bulkConnectionTransferSocket(channel.receiveConnection),
          checkpointsRoot: path.join(fixture.receiveRoot, 'checkpoints'),
          expectedIdentity, chunkSizeBytes: SMALL_CHUNK_BYTES},
        onTransferEnded: () => calls.push('transfer-ended'),
        recreation: {
          signal: new AbortController().signal,
          custody,
          admit: async (descriptor) => {
            calls.push(`admit:${descriptor.lastIncludedIndex}`);
            receiving = false;
            return plan.admission ?? {admitted: true};
          },
          receiveFailed: () => calls.push('receive-failed'),
          step: (run) => {
            calls.push('step');
            return run().finally(() => {
              if (plan.claimedAfterStep === calls.filter((call) =>
                call === 'step').length) held = false;
            });
          },
          recreate: async () => {
            calls.push('recreate');
            return plan.recreation ?? {state: RECREATION.RUNNING,
              service: {replacement: true}};
          },
        },
      }),
    ]);
    return {served, result, calls, service, boundary: fixture.boundaryIndex,
      installed: fs.existsSync(service.dbPath)};
  } finally {
    channel.close();
    fixture.close();
  }
}

test('installed and recreated: the receive, the admission, the shutdown ' +
  'step, the install step and the recreation, in that order', async () => {
  const run = await orchestrate();
  assert.equal(run.result.outcome, OUTCOME.INSTALLED_AND_RECREATED);
  assert.deepEqual(run.calls, ['transfer-ended', `admit:${run.boundary}`,
    'step', 'shutdown', 'step', 'recreate']);
  assert.deepEqual(run.result.service, {replacement: true},
    'the service is the one the recreation owner answered');
  assert.equal(run.result.install.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED);
  assert.equal(run.installed, true);
});

test('a failed receive stops nothing and asks nobody', async () => {
  const run = await orchestrate({
    receiveIdentity: {...IDENTITY, clusterId: 'another-cluster'}});
  assert.equal(run.result.outcome, OUTCOME.RECEIVE_FAILED);
  assert.equal(run.result.transfer.reason,
    RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.IDENTITY_MISMATCH);
  assert.deepEqual(run.calls, ['transfer-ended', 'receive-failed'],
    'the episode is told its receive failed');
  assert.equal(run.service.isShutdown, false);
});

test('a recreate that is not admitted is decided before the shutdown: the ' +
  'replica is untouched and no obligation is taken', async () => {
  const admission = Object.freeze({admitted: false, decision: 'held',
    reason: 'row_unobservable'});
  const run = await orchestrate({admission});
  assert.equal(run.result.outcome, OUTCOME.RECREATE_NOT_ADMITTED);
  assert.equal(run.result.admission, admission);
  assert.deepEqual(run.calls, ['transfer-ended', `admit:${run.boundary}`]);
  assert.equal(run.service.isShutdown, false);
  assert.equal(run.installed, false);
});

test('a shutdown that threw installs nothing and hands the replica to its ' +
  'recreation owner once', async () => {
  const run = await orchestrate({shutdownThrows: true,
    recreation: {state: RECREATION.PENDING, attempt: 'previous_service_not_released'}});
  assert.equal(run.result.outcome, OUTCOME.SHUTDOWN_FAILED);
  assert.equal(run.result.detail, 'the service could not stop');
  assert.equal(run.result.recreation.state, RECREATION.PENDING);
  assert.deepEqual(run.calls.slice(2), ['step', 'shutdown', 'recreate']);
  assert.equal(run.installed, false, 'the install was never asked');
});

test('a rejected install hands the stopped replica to its recreation owner ' +
  'once, whatever the owner then answers', async () => {
  const run = await orchestrate({
    installIdentity: {...IDENTITY, clusterId: 'another-cluster'}});
  assert.equal(run.result.outcome, OUTCOME.INSTALL_REJECTED);
  assert.equal(run.result.install.reason,
    RAFT_SNAPSHOT_INSTALL_REJECTION.IDENTITY_MISMATCH);
  assert.equal(run.result.recreation.state, RECREATION.RUNNING);
  assert.equal(Object.hasOwn(run.result, 'service'), false,
    'a rejected install is not recovery progress, even with the replica back');
  assert.deepEqual(run.calls.filter((call) => call === 'recreate'), ['recreate']);
});

test('an install that threw is typed, and the stopped replica is handed ' +
  'over', async () => {
  const run = await orchestrate({installIdentityThrows: true});
  assert.equal(run.result.outcome, OUTCOME.INSTALL_FAULTED);
  assert.equal(run.result.detail, 'the cache could not be read');
  assert.deepEqual(run.calls.slice(2), ['step', 'shutdown', 'step', 'recreate']);
});

test('an episode claimed between its admission and its shutdown stops ' +
  'nothing: the replica is untouched', async () => {
  const run = await orchestrate({claimedBeforeShutdown: true});
  assert.equal(run.result.outcome, OUTCOME.RECREATE_NOT_ADMITTED);
  assert.deepEqual(run.result.admission,
    {admitted: false, reason: 'episode_claimed'});
  assert.deepEqual(run.calls, ['transfer-ended', `admit:${run.boundary}`]);
  assert.equal(run.service.isShutdown, false);
  assert.equal(run.installed, false);
});

test('an episode claimed during its shutdown step installs nothing and ' +
  'hands the stopped replica back once', async () => {
  const run = await orchestrate({claimedAfterStep: 1,
    recreation: {state: RECREATION.RELEASED, record: 'claimed',
      claim: 'removal'}});
  assert.equal(run.result.outcome, OUTCOME.RECREATE_RELEASED);
  assert.deepEqual(run.calls.slice(2), ['step', 'shutdown', 'recreate'],
    'no install step ran after the custody was void');
  assert.equal(run.installed, false);
  assert.equal(run.result.recreation.claim, 'removal');
});

test('an installed image whose replica is not back yet, or was released, ' +
  'is named as such', async () => {
  const pending = await orchestrate({
    recreation: {state: RECREATION.PENDING, attempt: 'create_threw'}});
  assert.equal(pending.result.outcome, OUTCOME.RECREATE_PENDING);
  assert.equal(pending.result.recreation.attempt, 'create_threw');
  const released = await orchestrate({
    recreation: {state: RECREATION.RELEASED, record: 'claimed'}});
  assert.equal(released.result.outcome, OUTCOME.RECREATE_RELEASED);
  assert.equal(released.installed, true);
});
