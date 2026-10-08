// Snapshot-owner R3 intact-member install-owner discriminator.
//
// Test-only component fixture: it bypasses the current registered-callback and
// checkpoint-source refusal by constructing a valid raft-rs checkpoint through
// production durable-store owners, then calls the real install owner against an
// intact existing file-backed target. It is not a fully formed PartitionService
// membership/registered-receive witness, and it does not grant CREATE authority.
// The archived v2 diagnostic pins today's first refusal. This acceptance
// file keeps only the future-green required install behavior: preserve the
// receiver's durable identity, lifecycle incarnation, local term and vote while
// advancing the snapshot prefix and membership generation from the source image.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {
  createSqliteStateMachineCheckpoint,
  readCheckpoint,
} from '../../../src/raft/snapshot-checkpoint-store.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../../../src/raft/snapshot-checkpoint-constants.js';
import {requestSnapshotInstall} from '../../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
} from '../../../src/raft/snapshot-install-constants.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {RaftRsPeerIdentityRegistry, readRaftRsPeerIdentityReservations} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {RaftRsReplicaLifecycleOwner} from
  '../../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {raftRsLifecycleAdministration} from
  '../../../src/raft/raft-rs-lifecycle-administration.js';

const GROUP_ID = 'r3-intact-member-install-owner';
const SOURCE_REPLICA_ID = 'r3-source';
const TARGET_REPLICA_ID = 'r3-target';
const SOURCE_INCARNATION = 'r3-source-incarnation';
const TARGET_INCARNATION = 'r3-target-incarnation';
const SNAPSHOT_INDEX = '12';
const SNAPSHOT_TERM = '4';
const SNAPSHOT_MEMBERSHIP_GENERATION = '9';
const TARGET_APPLIED_INDEX = '5';
const TARGET_APPLIED_TERM = '3';
const TARGET_MEMBERSHIP_GENERATION = '0';
const TARGET_LOCAL_TERM = '6';

function identity() {
  return Object.freeze({
    clusterId: 'r3-intact-install-cluster',
    raftGroupId: GROUP_ID,
    entity: Object.freeze({kind: 'partition', id: GROUP_ID}),
    membershipEpoch: Number(SNAPSHOT_MEMBERSHIP_GENERATION),
  });
}

function confState(voters) {
  return Object.freeze({
    voters: Object.freeze([...voters]),
    learners: Object.freeze([]),
    votersOutgoing: Object.freeze([]),
    learnersNext: Object.freeze([]),
    autoLeave: false,
  });
}

function createReplicaRecord(dbPath, {lifecycleReplicaIdentity,
  lifecycleIncarnation, appliedIndex, appliedTerm, membershipGeneration,
  hardTerm, hardVote, hardCommit}) {
  const db = new Database(dbPath);
  try {
    const registry = new RaftRsPeerIdentityRegistry(db);
    const sourcePeerId = registry.registerReplica(SOURCE_REPLICA_ID);
    const targetPeerId = registry.registerReplica(TARGET_REPLICA_ID);
    const lifecyclePeerId = lifecycleReplicaIdentity === SOURCE_REPLICA_ID ?
      sourcePeerId : targetPeerId;
    new RaftRsReplicaLifecycleOwner({
      db,
      groupId: GROUP_ID,
      peerId: lifecyclePeerId,
      replicaIdentity: lifecycleReplicaIdentity,
      mintIncarnation: () => lifecycleIncarnation,
    });
    const store = new RaftRsDurableStore(db);
    store.putAppliedState(GROUP_ID, appliedIndex,
      confState([sourcePeerId, targetPeerId]), undefined,
      membershipGeneration);
    store.appendEntries(GROUP_ID, [{
      index: appliedIndex,
      term: appliedTerm,
      entryType: 0,
      data: Buffer.from('{}').toString('base64'),
    }]);
    store.putHardState(GROUP_ID, {
      term: hardTerm,
      vote: hardVote,
      commit: hardCommit,
    });
    return {sourcePeerId, targetPeerId};
  } finally {
    db.close();
  }
}

function readHardState(dbPath) {
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return db.prepare(`
      SELECT CAST(term AS TEXT) AS term, CAST(vote AS TEXT) AS vote,
        CAST(commit_index AS TEXT) AS commit_index
      FROM _raft_rs_hard_state WHERE group_id = ?
    `).get(GROUP_ID) ?? null;
  } finally {
    db.close();
  }
}

function readAppliedState(dbPath) {
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return db.prepare(`
      SELECT CAST(applied_index AS TEXT) AS applied_index,
        CAST(membership_generation_index AS TEXT) AS membership_generation_index,
        voters, learners
      FROM _raft_rs_applied_state WHERE group_id = ?
    `).get(GROUP_ID) ?? null;
  } finally {
    db.close();
  }
}

function readPeerReservation(dbPath, replicaIdentity = TARGET_REPLICA_ID) {
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return readRaftRsPeerIdentityReservations(db)
      .find((reservation) =>
        reservation.replicaIdentity === replicaIdentity) ?? null;
  } finally {
    db.close();
  }
}

function durableTargetFacts(dbPath) {
  return Object.freeze({
    hardState: readHardState(dbPath),
    lifecycle: raftRsLifecycleAdministration.readReplicaLifecycle(
      dbPath, GROUP_ID, TARGET_REPLICA_ID),
    applied: readAppliedState(dbPath),
    reservation: readPeerReservation(dbPath),
  });
}

function durableSourceLifecycle(dbPath) {
  return raftRsLifecycleAdministration.readReplicaLifecycle(
    dbPath, GROUP_ID, SOURCE_REPLICA_ID);
}

function parseJsonArray(value) {
  return Object.freeze(JSON.parse(value));
}

function assertTargetPreservedAndSnapshotAdvanced(before, after, peerIds) {
  assert.deepEqual(after.lifecycle, before.lifecycle,
    'intact-member install must preserve target lifecycle/incarnation');
  assert.deepEqual(after.reservation, before.reservation,
    'intact-member install must preserve target identity reservation');
  assert.equal(after.hardState?.term, TARGET_LOCAL_TERM,
    'intact-member install must retain target local term above snapshot term');
  assert.equal(after.hardState?.vote, peerIds.targetPeerId,
    'intact-member install must retain target local vote');
  assert.equal(after.hardState?.commit_index, SNAPSHOT_INDEX,
    'intact-member install should advance local commit to the snapshot boundary');
  assert.equal(after.applied?.applied_index, SNAPSHOT_INDEX,
    'intact-member install should advance applied index to the snapshot image');
  assert.equal(after.applied?.membership_generation_index,
    SNAPSHOT_MEMBERSHIP_GENERATION,
    'intact-member install should advance membership generation to the image');
  assert.deepEqual(parseJsonArray(after.applied?.voters),
    [peerIds.sourcePeerId, peerIds.targetPeerId],
    'intact-member install should adopt the authoritative snapshot ConfState');
  assert.deepEqual(parseJsonArray(after.applied?.learners), [],
    'setup has no learner transition in this component-level discriminator');
}

async function buildCheckpointAndAttemptInstall() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-intact-install-'));
  let returned = false;
  try {
    const sourceDbPath = path.join(workDir, 'source.db');
    const targetDbPath = path.join(workDir, 'target.db');
    const checkpointsRoot = path.join(workDir, 'checkpoints');
    const sourcePeerIds = createReplicaRecord(sourceDbPath, {
      lifecycleReplicaIdentity: SOURCE_REPLICA_ID,
      lifecycleIncarnation: SOURCE_INCARNATION,
      appliedIndex: SNAPSHOT_INDEX,
      appliedTerm: SNAPSHOT_TERM,
      membershipGeneration: SNAPSHOT_MEMBERSHIP_GENERATION,
      hardTerm: SNAPSHOT_TERM,
      hardVote: '0',
      hardCommit: SNAPSHOT_INDEX,
    });
    const targetPeerIds = createReplicaRecord(targetDbPath, {
      lifecycleReplicaIdentity: TARGET_REPLICA_ID,
      lifecycleIncarnation: TARGET_INCARNATION,
      appliedIndex: TARGET_APPLIED_INDEX,
      appliedTerm: TARGET_APPLIED_TERM,
      membershipGeneration: TARGET_MEMBERSHIP_GENERATION,
      hardTerm: TARGET_LOCAL_TERM,
      hardVote: sourcePeerIds.targetPeerId,
      hardCommit: TARGET_APPLIED_INDEX,
    });
    assert.deepEqual(targetPeerIds, sourcePeerIds,
      'setup: deterministic registry must assign matching peer ids');
    const peerIds = targetPeerIds;
    const sourceLifecycle = durableSourceLifecycle(sourceDbPath);
    assert.equal(sourceLifecycle.state, 'active',
      'setup: source database must hold the source lifecycle row');
    assert.equal(sourceLifecycle.incarnation, SOURCE_INCARNATION,
      'setup: source record must not reuse the target incarnation');
    const targetFactsBefore = durableTargetFacts(targetDbPath);
    assert.equal(targetFactsBefore.lifecycle.state, 'active',
      'setup: target must be an intact active member');
    assert.equal(targetFactsBefore.lifecycle.incarnation, TARGET_INCARNATION,
      'setup: target lifecycle incarnation is independently durable');
    assert.equal(String(targetFactsBefore.hardState?.term), TARGET_LOCAL_TERM,
      'setup: target has durable local election term above snapshot term');
    assert.equal(targetFactsBefore.hardState?.vote, peerIds.targetPeerId,
      'setup: target has a durable local vote to preserve');
    assert.equal(targetFactsBefore.reservation?.peerId, peerIds.targetPeerId,
      'setup: target reservation matches the expected peer id');
    assert.equal(targetFactsBefore.applied?.applied_index, TARGET_APPLIED_INDEX,
      'setup: target begins behind the snapshot image');
    assert.equal(targetFactsBefore.applied?.membership_generation_index,
      TARGET_MEMBERSHIP_GENERATION,
      'setup: target begins before the snapshot membership generation');

    const sourceDb = new Database(sourceDbPath);
    let created;
    try {
      created = await createSqliteStateMachineCheckpoint({
        db: sourceDb,
        identity: identity(),
        checkpointsRoot,
        raftRsGroupId: GROUP_ID,
      });
    } finally {
      sourceDb.close();
    }
    assert.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
      `setup: checkpoint creation failed ${JSON.stringify(created)}`);
    const validation = readCheckpoint({
      checkpointDir: created.checkpointDir,
      expectedIdentity: identity(),
    });
    assert.equal(validation.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
      `setup: checkpoint is not valid ${JSON.stringify(validation)}`);
    assert.equal(validation.descriptor.payloadKind,
      RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE,
      'setup: discriminator must reach the raft-rs install branch');

    const install = await requestSnapshotInstall({
      replicaDbPath: targetDbPath,
      checkpointsRoot,
      generationIndex: Number(SNAPSHOT_INDEX),
      expectedIdentity: identity(),
      expectedReplicaIdentity: TARGET_REPLICA_ID,
      expectedPeerId: peerIds.targetPeerId,
    });
    returned = true;
    return Object.freeze({
      workDir,
      targetDbPath,
      targetFactsBefore,
      install,
      peerIds,
    });
  } finally {
    if (!returned) {
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  }
}

test('R3 future: intact durable member installs snapshot without CREATE while preserving target ownership',
  async () => {
    const fixture = await buildCheckpointAndAttemptInstall();
    try {
      assert.equal(fixture.install.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'future R3 intact-member install should preserve target identity, ' +
        'incarnation and local election facts while advancing snapshot state; ' +
        `current result ${JSON.stringify(fixture.install)}`);
      assertTargetPreservedAndSnapshotAdvanced(fixture.targetFactsBefore,
        durableTargetFacts(fixture.targetDbPath), fixture.peerIds);
    } finally {
      fs.rmSync(fixture.workDir, {recursive: true, force: true});
    }
  });
