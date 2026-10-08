// Snapshot-owner R4 destructive-loss discriminator.
//
// This is intentionally test-only. Existing identity-reuse controls prove that
// an empty re-open of a previously existing identity is held reseed-required;
// R4 additionally requires a retained old disk clone of that same identity not
// to resurrect after the destructive-loss owner has classified the generation.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  formedCluster,
  hardStateOf,
  lifecycleRow,
  peerIdsOf,
} from './identity-reuse-harness.js';
import {
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {raftRsLifecycleAdministration} from
  '../../../src/raft/raft-rs-lifecycle-administration.js';

const RESEED_REQUIRED = COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED;
const FORMED_ENTRIES = 8;
const SETTLE_ROUNDS = 300;
const EXISTED = Object.freeze({
  [RAFT_OPERATION_PORT_REQUEST.IDENTITY_EXISTED]: true,
});

function copySqliteDatabase(from, to) {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${to}${suffix}`, {force: true});
    if (fs.existsSync(`${from}${suffix}`)) {
      fs.copyFileSync(`${from}${suffix}`, `${to}${suffix}`);
    }
  }
}

function closeReplica(cluster, replicaId) {
  const replica = cluster.replica(replicaId);
  replica.node.close();
  replica.db.close();
}

function wipeAndReopenEmpty(cluster, replicaId, founders, extraRequest) {
  closeReplica(cluster, replicaId);
  fs.rmSync(cluster.dbFileOf(replicaId), {force: true});
  try {
    cluster.buildReplica(replicaId, founders, extraRequest);
    return null;
  } catch (error) {
    const replica = cluster.replica(replicaId);
    replica.db.close();
    cluster.replicas.delete(replicaId);
    return error;
  }
}

function reopenExistingFile(cluster, replicaId, founders, extraRequest) {
  try {
    cluster.buildReplica(replicaId, founders, extraRequest);
    return null;
  } catch (error) {
    const replica = cluster.replica(replicaId);
    replica?.db?.close?.();
    cluster.replicas.delete(replicaId);
    return error;
  }
}

function commitOf(cluster, replicaId) {
  return Number(cluster.node(replicaId).readStatus().commitIndex);
}

function keepsCommitting(cluster, leader, followers) {
  const before = commitOf(cluster, leader);
  cluster.propose(leader, {op: 'after-destructive-loss'});
  return cluster.settle(() => [leader, ...followers].every((replicaId) =>
    commitOf(cluster, replicaId) > before), {rounds: SETTLE_ROUNDS});
}

test('R4: a retained old disk clone cannot resurrect a same-identity voter ' +
  'after destructive local identity and HardState loss is classified',
async () => {
  const founders = ['r4-a', 'r4-b', 'r4-c', 'r4-d', 'r4-e'];
  const [leader, follower, target, d, e] = founders;
  const cluster = formedCluster('r4-destructive-loss-old-clone', founders,
    FORMED_ENTRIES);
  try {
    const targetPath = cluster.dbFileOf(target);
    const clonePath = path.join(cluster.directory, `${target}.old-clone.sqlite`);
    const peerIds = peerIdsOf(cluster);
    const targetPeerId = peerIds[target];
    const beforeHardState = hardStateOf(cluster, target);
    assert.ok(beforeHardState?.term > 0, 'setup: target has a durable term');
    copySqliteDatabase(targetPath, clonePath);

    const entriesBefore = cluster.coreEntries.length;
    const classified = wipeAndReopenEmpty(cluster, target, founders, EXISTED);
    assert.ok(classified !== null, 'setup: destructive loss was not classified');
    assert.equal(classified.consensus?.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(classified.consensus?.reason, RESEED_REQUIRED);
    assert.deepEqual({...lifecycleRow(cluster, target)}, {
      state: 'retired', reason: RESEED_REQUIRED,
    }, 'new empty file did not record the reseed hold');
    assert.equal(cluster.coreEntries.slice(entriesBefore)
      .filter((entry) => entry.operation === 'create_node').length, 0,
    'classification entered the core');

    // Existing controls stop here. R4's snapshot-owner obligation additionally
    // fences a stale old disk clone of the same identity. Restoring the clone
    // models a lost-vote/same-term recovery attempt: the clone contains the
    // old local HardState and lifecycle row, so only a durable owner fence can
    // prevent same-identity resurrection.
    copySqliteDatabase(clonePath, targetPath);
    const reopened = reopenExistingFile(cluster, target, founders, EXISTED);
    assert.equal(reopened, null,
      'precondition: current source opens the old clone; future owner may throw');
    const resurrectedStatus = cluster.node(target).readStatus();
    assert.equal(String(resurrectedStatus.term), String(beforeHardState.term),
      'setup: the old clone reopened at the retained same term');
    assert.ok(resurrectedStatus.confState.voters.includes(targetPeerId),
      'setup: the old clone still sees itself as a configured voter');
    assert.equal(resurrectedStatus.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      'snapshot-owner R4 must refuse the old clone instead of reopening it');
    assert.equal(resurrectedStatus.reason, RESEED_REQUIRED);
    const campaign = await cluster.node(target).campaign();
    assert.equal(campaign.reason, RESEED_REQUIRED,
      'the old clone must not campaign or vote');
    cluster.tickers = [leader, follower, d, e];
    assert.ok(keepsCommitting(cluster, leader, [follower, d, e]),
      'surviving quorum stopped committing after destructive loss');
    assert.ok(cluster.node(leader).readStatus().confState.voters
      .includes(targetPeerId), 'setup: target remains a configured voter');
    assert.ok(raftRsLifecycleAdministration.isRetiredFor(
      raftRsLifecycleAdministration.readReplicaLifecycle(
        targetPath, cluster.partitionId, target), RESEED_REQUIRED),
    'externally visible lifecycle read does not expose the retirement/HOLD');
  } finally {
    cluster.dispose();
  }
});
