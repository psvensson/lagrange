import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import {sha256Digest, writeAtomicDurable} from
  '../../../src/runtime/oci-host-agent-durable-files.js';

import {test} from '../../../src/test-helpers/tap.js';
import {createSqliteStateMachineCheckpoint, readCheckpoint} from
  '../../../src/raft/snapshot-checkpoint-store.js';
import {RAFT_CHECKPOINT_CREATION_OUTCOME} from
  '../../../src/raft/snapshot-checkpoint-constants.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {requestSnapshotInstall, resolvePendingSnapshotInstall} from
  '../../../src/raft/snapshot-install.js';
import {RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION, RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE} from
  '../../../src/raft/snapshot-install-constants.js';
import {ReplicaCreateAdmissionOwner} from
  '../../../src/node/replica-create-admission-owner.js';
import {OperationType} from '../../../src/rebalancer/replica-status.js';

const GROUP = 'mg-checkpoint-owner-red';
const FOUNDERS = Object.freeze(['mg-red-a', 'mg-red-b', 'mg-red-c']);
const TARGET = 'mg-red-fresh-d';
const REMOVED = 'mg-red-removed-z';
const APPLIED_INDEX = '12';
const APPLIED_TERM = '4';
const MEMBERSHIP_GENERATION = '9';

function identity() {
  return {
    clusterId: 'cluster-fresh-mg',
    raftGroupId: GROUP,
    entity: {kind: 'message-group', id: GROUP},
    membershipEpoch: Number(MEMBERSHIP_GENERATION),
  };
}

function admissionFixture({terminal = false} = {}) {
  const row = {operation_id: 'fresh-mg-install', type: OperationType.REPLACE,
    entity_type: 'message-group', entity_id: GROUP, partition_id: GROUP,
    replica_id: TARGET, target_node_id: 'node-d', workflow_step: 'SENDING',
    updated_at: 11, completed_at: terminal ? 12 : null,
    create_admission_state: null, create_admission_token: null,
    create_admission_replica_created_at: null,
    create_admission_attempt_token: null,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: null,
    create_admission_workflow_updated_at: null,
    create_admission_owner_incarnation: null};
  const matches = (where) => Object.entries(where)
    .every(([field, value]) => row[field] === value);
  const gateway = {
    async readAuthoritativeRows(_table, sql, params) {
      return sql.includes('FROM nodes') ? {success: true, rows: [{
        node_id: 'node-d', boot_incarnation: 7,
      }]} : {success: true, rows: row.operation_id === params[0] ? [row] : []};
    },
    async updateSystemTableRow(_table, where, data) {
      if (!matches(where)) return {success: true, outcome: 'no_op'};
      Object.assign(row, data);
      return {success: true, outcome: 'applied'};
    },
  };
  const owner = new ReplicaCreateAdmissionOwner({gateway, nodeId: 'node-d',
    ownerIncarnation: 7, now: () => 20});
  const request = {operationId: row.operation_id,
    operationType: row.type, entityType: row.entity_type,
    entityId: GROUP, partitionId: GROUP, replicaId: TARGET,
    admissionToken: 'admission-fresh-mg', attemptToken: 'attempt-fresh-mg',
    attemptSeq: 1, workflowUpdatedAt: 11};
  return {owner, request, row};
}

test('the canonical checkpoint owner seals a group-neutral raft-rs image',
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-mg-rs-image-'));
    const db = new Database(path.join(root, 'source.db'));
    try {
      const registry = new RaftRsPeerIdentityRegistry(db);
      const voters = FOUNDERS.map((replica) => registry.registerReplica(replica));
      const targetPeer = registry.registerReplica(TARGET);
      const removedPeer = registry.registerReplica(REMOVED);
      const store = new RaftRsDurableStore(db);
      store.putAppliedState(GROUP, APPLIED_INDEX, {
        voters,
        learners: [targetPeer],
        votersOutgoing: [],
        learnersNext: [],
        autoLeave: false,
      }, undefined, MEMBERSHIP_GENERATION);
      store.appendEntries(GROUP, [{index: APPLIED_INDEX, term: APPLIED_TERM,
        entryType: 0, data: Buffer.from('{}').toString('base64')}]);
      store.putHardState(GROUP, {term: APPLIED_TERM, vote: '0',
        commit: APPLIED_INDEX});

      for (const invalidPeerId of ['0', '7', '01']) {
        const corruptPath = path.join(root, `corrupt-source-${invalidPeerId}.db`);
        await db.backup(corruptPath);
        const corruptDb = new Database(corruptPath);
        try {
          corruptDb.prepare('UPDATE raft_rs_peer_identity SET raft_peer_id = ? ' +
            'WHERE replica_identity = ?').run(invalidPeerId, TARGET);
          corruptDb.prepare('UPDATE _raft_rs_applied_state SET learners = ? ' +
            'WHERE group_id = ?').run(JSON.stringify([invalidPeerId]), GROUP);
          const refused = await createSqliteStateMachineCheckpoint({
            db: corruptDb, identity: identity(),
            checkpointsRoot: path.join(root, `corrupt-${invalidPeerId}`),
            raftRsGroupId: GROUP});
          t.equal(refused.outcome,
            RAFT_CHECKPOINT_CREATION_OUTCOME.APPLY_WATERMARK_DIVERGENCE,
            `source peer ${invalidPeerId} is refused before sealing`);
        } finally {
          corruptDb.close();
        }
      }

      const wrongKind = await createSqliteStateMachineCheckpoint({db,
        identity: identity(), checkpointsRoot: path.join(root, 'wrong-kind')});
      t.equal(wrongKind.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER,
        'the SQL-image kind refuses a raft-rs record instead of copying it');

      const created = await createSqliteStateMachineCheckpoint({
        db,
        identity: identity(),
        checkpointsRoot: path.join(root, 'checkpoints'),
        raftRsGroupId: GROUP,
      });

      t.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'file-backed raft-rs state is a supported canonical payload');
      const sealed = readCheckpoint({checkpointDir: path.join(root,
        'checkpoints', APPLIED_INDEX), expectedIdentity: identity()});
      t.equal(sealed.outcome, 'valid', 'the sealed replica image validates');
      t.equal(Object.isFrozen(created.descriptor.raftRs.confState.learners),
        true, 'the built descriptor deeply freezes ConfState member arrays');
      const malformedCases = [
        ['descriptor/payload peer map disagreement', (descriptor) => {
          descriptor.raftRs.peerReservations[0].peerId = '7';
        }],
        ['noncanonical generation', (descriptor) => {
          descriptor.raftRs.membershipGenerationIndex = '09';
        }],
      ];
      for (const [name, mutate] of malformedCases) {
        const malformedRoot = path.join(root, name.replaceAll(' ', '-'));
        const generation = path.join(malformedRoot, APPLIED_INDEX);
        fs.cpSync(path.join(root, 'checkpoints', APPLIED_INDEX), generation,
          {recursive: true});
        const descriptorFile = path.join(generation, 'checkpoint.json');
        const descriptor = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
        mutate(descriptor);
        writeAtomicDurable(descriptorFile, descriptor);
        const malformedTarget = path.join(root, `${name}.db`);
        const refused = await requestSnapshotInstall({
          replicaDbPath: malformedTarget, checkpointsRoot: malformedRoot,
          generationIndex: Number(APPLIED_INDEX), expectedIdentity: identity(),
          expectedReplicaIdentity: TARGET, expectedPeerId: targetPeer});
        t.equal(refused.reason,
          RAFT_SNAPSHOT_INSTALL_REJECTION.CHECKPOINT_INVALID,
          `${name} is refused before CREATE admission`);
        t.equal(fs.existsSync(malformedTarget), false,
          `${name} performs no physical target mutation`);
      }
      for (const invalidPeerId of ['0', '7', '01']) {
        const forgedRoot = path.join(root, `forged-${invalidPeerId}`);
        const generation = path.join(forgedRoot, APPLIED_INDEX);
        fs.cpSync(path.join(root, 'checkpoints', APPLIED_INDEX), generation,
          {recursive: true});
        const payloadFile = path.join(generation, 'payload.db');
        const payloadDb = new Database(payloadFile);
        payloadDb.prepare('UPDATE raft_rs_peer_identity SET raft_peer_id = ? ' +
          'WHERE replica_identity = ?').run(invalidPeerId, TARGET);
        payloadDb.close();
        const descriptorFile = path.join(generation, 'checkpoint.json');
        const descriptor = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
        descriptor.raftRs.peerReservations.find(
          ({replicaIdentity}) => replicaIdentity === TARGET).peerId =
            invalidPeerId;
        descriptor.raftRs.confState.learners = [invalidPeerId];
        const payloadBytes = fs.readFileSync(payloadFile);
        descriptor.payloadByteLength = payloadBytes.length;
        descriptor.payloadDigest = sha256Digest(payloadBytes);
        writeAtomicDurable(descriptorFile, descriptor);
        const forgedTarget = path.join(root, `forged-target-${invalidPeerId}.db`);
        const refused = await requestSnapshotInstall({
          replicaDbPath: forgedTarget, checkpointsRoot: forgedRoot,
          generationIndex: Number(APPLIED_INDEX), expectedIdentity: identity(),
          expectedReplicaIdentity: TARGET, expectedPeerId: invalidPeerId});
        t.equal(refused.reason,
          RAFT_SNAPSHOT_INSTALL_REJECTION.CHECKPOINT_INVALID,
          `matched descriptor/payload peer ${invalidPeerId} is refused`);
        t.equal(fs.existsSync(forgedTarget), false,
          `matched peer ${invalidPeerId} cannot materialize a target`);
      }
      const targetDbPath = path.join(root, 'target.db');
      const direct = await requestSnapshotInstall({replicaDbPath: targetDbPath,
        checkpointsRoot: path.join(root, 'checkpoints'),
        generationIndex: Number(APPLIED_INDEX), expectedIdentity: identity(),
        expectedReplicaIdentity: TARGET, expectedPeerId: targetPeer});
      t.equal(direct.reason,
        RAFT_SNAPSHOT_INSTALL_REJECTION.CREATE_ADMISSION_REQUIRED,
        'direct install without CREATE authority is refused');
      t.equal(fs.existsSync(targetDbPath), false,
        'direct refusal performs zero physical target mutation');

      const admission = admissionFixture();
      const evidence = await admission.owner.claim(admission.request);
      t.equal(await admission.owner.claimPhysicalWorker(evidence), true,
        'the real CREATE owner grants the sole physical worker');
      const installed = await requestSnapshotInstall({
        replicaDbPath: targetDbPath,
        checkpointsRoot: path.join(root, 'checkpoints'),
        generationIndex: Number(APPLIED_INDEX), expectedIdentity: identity(),
        expectedReplicaIdentity: TARGET, expectedPeerId: targetPeer,
        createAdmissionOwner: admission.owner,
        createAdmissionEvidence: evidence,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'the admitted fresh learner installs through the canonical owner');
      const targetDb = new Database(targetDbPath);
      try {
        const restored = new RaftRsDurableStore(targetDb).readDurableRecord(GROUP);
        t.equal(restored.appliedIndex, APPLIED_INDEX);
        t.equal(restored.membershipGenerationIndex, MEMBERSHIP_GENERATION);
        t.same(restored.confState.learners, [targetPeer]);
        t.equal(restored.hardState.term, APPLIED_TERM,
          'the receiver-local term starts at the installed boundary');
        t.equal(restored.hardState.vote, '0',
          'the sender vote is never copied into the fresh learner');
        t.equal(new RaftRsPeerIdentityRegistry(targetDb).raftPeerIdOf(TARGET),
          targetPeer);
        t.equal(new RaftRsPeerIdentityRegistry(targetDb).raftPeerIdOf(REMOVED),
          removedPeer, 'removed permanent reservations survive the image');
      } finally {
        targetDb.close();
      }
      const marker = path.join(root, 'checkpoints',
        RAFT_SNAPSHOT_INSTALL_DIRNAME, RAFT_SNAPSHOT_INSTALL_MARKER_FILE);
      writeAtomicDurable(marker, {state: 'staged', installId: 'lost-update',
        generationIndex: Number(APPLIED_INDEX), rejectionReason: 'none'});
      const recovered = resolvePendingSnapshotInstall({replicaDbPath: targetDbPath,
        checkpointsRoot: path.join(root, 'checkpoints')});
      t.equal(recovered.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'a crash after raft-rs rename is recognized from the installed image');

      const terminal = admissionFixture({terminal: true});
      await t.rejects(terminal.owner.claim(terminal.request),
        'terminal-first CREATE is refused by its durable owner');
      t.equal(terminal.row.create_admission_state, null,
        'terminal-first leaves no physical authority');
    } finally {
      db.close();
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
