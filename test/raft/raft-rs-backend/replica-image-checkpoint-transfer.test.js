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
import {removeSnapshotInstallArtifactsForGeneration, requestSnapshotInstall,
  recoverPendingSnapshotInstall} from
  '../../../src/raft/snapshot-install.js';
import {RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION, RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE} from
  '../../../src/raft/snapshot-install-constants.js';
import {CREATE_ADMISSION_ERROR_CODE, ReplicaCreateAdmissionOwner} from
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

function admissionRepository() {
  const rows = new Map();
  let bootIncarnation = 7;
  const gateway = {
    async readAuthoritativeRows(_table, sql, params) {
      if (sql.includes('FROM nodes')) {
        return {success: true, rows: [{
          node_id: 'node-d', boot_incarnation: bootIncarnation,
        }]};
      }
      if (sql.includes('WHERE operation_id = ?')) {
        const row = rows.get(params[0]);
        return {success: true, rows: row ? [row] : []};
      }
      if (sql.includes('WHERE replica_id = ?')) {
        return {success: true, rows: [...rows.values()].filter((row) =>
          row.replica_id === params[0] && row.target_node_id === params[1] &&
          row.create_admission_state !== null)};
      }
      return {success: true, rows: [...rows.values()].filter((row) =>
        row.target_node_id === params[0] &&
        row.create_admission_state !== null)};
    },
    async updateSystemTableRow(_table, where, data) {
      const row = rows.get(where.operation_id);
      const matches = row && Object.entries(where)
        .every(([field, value]) => row[field] === value);
      if (!matches) return {success: true, outcome: 'no_op'};
      Object.assign(row, data);
      return {success: true, outcome: 'applied'};
    },
  };
  return {
    rows,
    ownerAt(ownerIncarnation, now) {
      return new ReplicaCreateAdmissionOwner({
        gateway, nodeId: 'node-d', ownerIncarnation, now,
      });
    },
    currentBootIncarnation() {
      return bootIncarnation;
    },
    setBootIncarnation(value) {
      bootIncarnation = value;
    },
  };
}

function admissionFixture({terminal = false, operationId = 'fresh-mg-install',
  attemptToken = 'attempt-fresh-mg', now = 20,
  repository = admissionRepository(), owner = null} = {}) {
  const row = {operation_id: operationId, type: OperationType.REPLACE,
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
  repository.rows.set(operationId, row);
  const ownerAt = (ownerIncarnation) =>
    repository.ownerAt(ownerIncarnation, () => now);
  const fixtureOwner = owner || ownerAt(repository.currentBootIncarnation());
  const request = {operationId: row.operation_id,
    operationType: row.type, entityType: row.entity_type,
    entityId: GROUP, partitionId: GROUP, replicaId: TARGET,
    admissionToken: `admission-${operationId}`, attemptToken,
    attemptSeq: 1, workflowUpdatedAt: 11};
  return {owner: fixtureOwner, ownerAt, repository, request, row,
    setBootIncarnation(value) {
      repository.setBootIncarnation(value);
    }};
}

async function withRenameFault(options, work) {
  const originalRename = fs.renameSync;
  fs.renameSync = (source, destination) => {
    if (source !== options.source || destination !== options.destination) {
      return originalRename(source, destination);
    }
    if (options.afterRename) originalRename(source, destination);
    const error = new Error(options.message);
    error.code = options.code;
    throw error;
  };
  try {
    return await work();
  } finally {
    fs.renameSync = originalRename;
  }
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
      const physicalClaim = await admission.owner.claimPhysicalWorker(evidence);
      t.ok(physicalClaim, 'the real CREATE owner grants the sole physical worker');
      admission.row.completed_at = 21;
      const installed = await requestSnapshotInstall({
        replicaDbPath: targetDbPath,
        checkpointsRoot: path.join(root, 'checkpoints'),
        generationIndex: Number(APPLIED_INDEX), expectedIdentity: identity(),
        expectedReplicaIdentity: TARGET, expectedPeerId: targetPeer,
        createAdmissionOwner: admission.owner,
        createAdmissionEvidence: evidence,
        createPhysicalWorkerClaim: physicalClaim,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'terminal settlement after admission preserves the exact install');
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
      const terminalRoot = path.join(root, 'terminal-restart');
      fs.cpSync(path.join(root, 'checkpoints', APPLIED_INDEX),
        path.join(terminalRoot, APPLIED_INDEX), {recursive: true});
      const terminalTarget = path.join(root, 'terminal-target.db');
      const terminalAdmission = admissionFixture({
        operationId: 'terminal-after-admission-crash',
        attemptToken: 'terminal-attempt', now: 40,
      });
      const terminalEvidence = await terminalAdmission.owner.claim(
        terminalAdmission.request);
      const terminalClaim = await terminalAdmission.owner
        .claimPhysicalWorker(terminalEvidence);
      terminalAdmission.row.completed_at = 41;
      const terminalInstallDir = path.join(terminalRoot,
        RAFT_SNAPSHOT_INSTALL_DIRNAME);
      const terminalStaging = path.join(terminalInstallDir,
        RAFT_SNAPSHOT_INSTALL_STAGING_FILE);
      const terminalMarker = path.join(terminalInstallDir,
        RAFT_SNAPSHOT_INSTALL_MARKER_FILE);
      await t.rejects(withRenameFault({source: terminalStaging,
        destination: terminalTarget, afterRename: true,
        code: 'SIMULATED_CRASH_AFTER_RENAME',
        message: 'crash after snapshot install rename'}, () =>
        requestSnapshotInstall({
          replicaDbPath: terminalTarget, checkpointsRoot: terminalRoot,
          generationIndex: Number(APPLIED_INDEX), expectedIdentity: identity(),
          expectedReplicaIdentity: TARGET, expectedPeerId: targetPeer,
          createAdmissionOwner: terminalAdmission.owner,
          createAdmissionEvidence: terminalEvidence,
          createPhysicalWorkerClaim: terminalClaim,
        })), {code: 'SIMULATED_CRASH_AFTER_RENAME'},
      'the real request stops after rename before its marker update');
      t.equal(JSON.parse(fs.readFileSync(terminalMarker, 'utf8')).state,
        'staged', 'the post-rename crash retains the real durable STAGED marker');
      t.equal(fs.existsSync(terminalStaging), false,
        'the real atomic rename consumed staging before the crash');
      t.equal(terminalAdmission.row.completed_at, 41,
        'ordinary operation settlement remains independent of install recovery');

      terminalAdmission.setBootIncarnation(8);
      const restartOwner = terminalAdmission.ownerAt(8);
      const restartEvidence = await restartOwner.takeoverRetained(
        {...terminalAdmission.row});
      const restartClaim = await restartOwner.claimPhysicalWorker(
        restartEvidence);
      t.ok(restartClaim, 'the current boot reclaims the exact durable CREATE');
      const authoritativeRead = restartOwner.readOperation.bind(restartOwner);
      restartOwner.readOperation = async () => {
        throw Object.assign(new Error('authority temporarily unavailable'),
          {code: 'OWNER_RPC_REQUIRED'});
      };
      await t.rejects(recoverPendingSnapshotInstall({
        replicaDbPath: terminalTarget, checkpointsRoot: terminalRoot,
        createAdmissionOwner: restartOwner,
        createAdmissionEvidence: restartEvidence,
        createPhysicalWorkerClaim: restartClaim}),
      {code: 'OWNER_RPC_REQUIRED'});
      t.ok(fs.existsSync(terminalMarker),
        'temporary authority loss retains recoverable install progress');
      restartOwner.readOperation = authoritativeRead;
      const recovered = await recoverPendingSnapshotInstall({
        replicaDbPath: terminalTarget, checkpointsRoot: terminalRoot,
        createAdmissionOwner: restartOwner,
        createAdmissionEvidence: restartEvidence,
        createPhysicalWorkerClaim: restartClaim});
      t.equal(recovered.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'current boot recovers the terminal-after-admission rename');

      const staleRoot = path.join(root, 'stale-install');
      fs.cpSync(path.join(root, 'checkpoints', APPLIED_INDEX),
        path.join(staleRoot, APPLIED_INDEX), {recursive: true});
      const crashTargetDir = path.join(root, 'crash-target');
      fs.mkdirSync(crashTargetDir);
      const successorDbPath = path.join(crashTargetDir, 'successor.db');
      const canonicalAdmissionRepository = admissionRepository();
      const stagedAdmission = admissionFixture({
        operationId: 'fresh-mg-install-a',
        attemptToken: 'attempt-staged-a', now: 50,
        repository: canonicalAdmissionRepository,
      });
      const stagedEvidence = await stagedAdmission.owner.claim(
        stagedAdmission.request);
      const stagedClaim = await stagedAdmission.owner
        .claimPhysicalWorker(stagedEvidence);
      const staleInstallDir = path.join(staleRoot,
        RAFT_SNAPSHOT_INSTALL_DIRNAME);
      const staleStaging = path.join(staleInstallDir,
        RAFT_SNAPSHOT_INSTALL_STAGING_FILE);
      const staleMarkerPath = path.join(staleInstallDir,
        RAFT_SNAPSHOT_INSTALL_MARKER_FILE);
      await t.rejects(withRenameFault({source: staleStaging,
        destination: successorDbPath, afterRename: false,
        code: 'EACCES', message: 'snapshot rename refused'}, () =>
        requestSnapshotInstall({
          replicaDbPath: successorDbPath, checkpointsRoot: staleRoot,
          generationIndex: Number(APPLIED_INDEX), expectedIdentity: identity(),
          expectedReplicaIdentity: TARGET, expectedPeerId: targetPeer,
          createAdmissionOwner: stagedAdmission.owner,
          createAdmissionEvidence: stagedEvidence,
          createPhysicalWorkerClaim: stagedClaim,
        })), {code: 'EACCES'},
      'the real request stops after durable STAGED before rename');
      const staleMarker = JSON.parse(fs.readFileSync(staleMarkerPath, 'utf8'));
      t.equal(staleMarker.state, 'staged',
        'failed real install retains its durable STAGED boundary');
      const delayedA = path.join(root, 'delayed-a-install');
      fs.cpSync(staleInstallDir, delayedA, {recursive: true});
      t.equal(await stagedAdmission.owner.closeForLifecycle({
        replicaId: stagedEvidence.replicaId,
        createdAt: stagedEvidence.replicaCreatedAt,
        createAttemptToken: stagedEvidence.attemptToken,
      }), false, 'lifecycle close waits for A physical ownership');
      t.equal(stagedAdmission.owner.releasePhysicalWorker(stagedClaim), true,
        'A releases its exact physical claim before cleanup');
      t.equal(await stagedAdmission.owner.closeForLifecycle({
        replicaId: stagedEvidence.replicaId,
        createdAt: stagedEvidence.replicaCreatedAt,
        createAttemptToken: stagedEvidence.attemptToken,
      }), true, 'lifecycle close settles A before successor admission');
      t.equal(stagedAdmission.row.create_admission_state, 'CLOSED',
        'the canonical durable repository records A CLOSED');
      const removed = await removeSnapshotInstallArtifactsForGeneration({
        checkpointsRoot: staleRoot, replicaId: TARGET,
        replicaCreatedAt: stagedEvidence.replicaCreatedAt,
        attemptToken: stagedEvidence.attemptToken,
      });
      t.equal(removed.allAbsent, true,
        'exact A cleanup removes only A install artifacts');

      stagedAdmission.owner.now = () => 60;
      const successorAdmission = admissionFixture({
        operationId: 'fresh-mg-install-b',
        attemptToken: 'attempt-successor-b', now: 60,
        repository: canonicalAdmissionRepository,
        owner: stagedAdmission.owner});
      const successorEvidence = await successorAdmission.owner.claim(
        successorAdmission.request);
      t.ok(successorEvidence.replicaCreatedAt > stagedEvidence.replicaCreatedAt,
        'successor B owns a later durable replica generation than A');
      const canonicalCensus = await stagedAdmission.owner
        .readReplicaAdmissions(TARGET);
      t.same(canonicalCensus.map((row) => [row.operation_id,
        row.create_admission_state]), [
        ['fresh-mg-install-a', 'CLOSED'],
        ['fresh-mg-install-b', 'ADMITTED'],
      ], 'A CLOSED and B ADMITTED coexist in one authoritative census');
      await t.rejects(stagedAdmission.owner.claim(stagedAdmission.request),
        {code: CREATE_ADMISSION_ERROR_CODE.STALE},
        'a late A CREATE claim is refused after close and B admission');
      const successorClaim = await successorAdmission.owner
        .claimPhysicalWorker(successorEvidence);
      t.ok(successorClaim, 'successor B claims canonical CREATE');
      const successorRoot = path.join(root, 'successor-checkpoints');
      fs.cpSync(path.join(root, 'checkpoints', APPLIED_INDEX),
        path.join(successorRoot, APPLIED_INDEX), {recursive: true});
      const successorInstall = await requestSnapshotInstall({
        replicaDbPath: successorDbPath, checkpointsRoot: successorRoot,
        generationIndex: Number(APPLIED_INDEX), expectedIdentity: identity(),
        expectedReplicaIdentity: TARGET, expectedPeerId: targetPeer,
        createAdmissionOwner: successorAdmission.owner,
        createAdmissionEvidence: successorEvidence,
        createPhysicalWorkerClaim: successorClaim});
      t.equal(successorInstall.outcome,
        RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'successor B materializes through canonical CREATE');

      fs.cpSync(delayedA, staleInstallDir, {recursive: true});
      const successorDigest = sha256Digest(fs.readFileSync(successorDbPath));
      const staleRetry = await requestSnapshotInstall({
        replicaDbPath: successorDbPath, checkpointsRoot: staleRoot,
        generationIndex: Number(APPLIED_INDEX), expectedIdentity: identity(),
        expectedReplicaIdentity: TARGET, expectedPeerId: targetPeer,
        createAdmissionOwner: stagedAdmission.owner,
        createAdmissionEvidence: stagedEvidence,
        createPhysicalWorkerClaim: stagedClaim});
      t.equal(staleRetry.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
        'closed A cannot begin a late snapshot install after B admission');
      t.equal(staleRetry.reason,
        RAFT_SNAPSHOT_INSTALL_REJECTION.CREATE_ADMISSION_REQUIRED,
        'late A install is refused by exact CREATE authority');
      t.equal(sha256Digest(fs.readFileSync(successorDbPath)), successorDigest,
        'late A install preserves successor B bytes');
      const staleRecovery = await recoverPendingSnapshotInstall({
        replicaDbPath: successorDbPath, checkpointsRoot: staleRoot,
        createAdmissionOwner: stagedAdmission.owner,
        createAdmissionEvidence: stagedEvidence,
        createPhysicalWorkerClaim: stagedClaim});
      t.equal(staleRecovery.outcome,
        RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT,
        'stale A cannot overwrite a successor database at restart');
      const successorRead = new Database(successorDbPath, {readonly: true});
      const successorBinding = JSON.parse(successorRead.prepare(
        'SELECT create_authority FROM _raft_snapshot_install_binding')
        .pluck().get());
      t.equal(successorBinding.operationId, successorEvidence.operationId,
        'successor B remains byte-owner after refusal');
      successorRead.close();
      const lateRemoved = await removeSnapshotInstallArtifactsForGeneration({
        checkpointsRoot: staleRoot, replicaId: TARGET,
        replicaCreatedAt: stagedEvidence.replicaCreatedAt,
        attemptToken: stagedEvidence.attemptToken,
      });
      t.equal(lateRemoved.allAbsent, true,
        'late A cleanup removes only its rebound artifacts');
      t.equal(sha256Digest(fs.readFileSync(successorDbPath)), successorDigest,
        'late A recovery and cleanup preserve successor B bytes');
      const successorAuthority = successorAdmission.owner
        .snapshotInstallAuthority(successorClaim);
      writeAtomicDurable(staleMarkerPath, {...staleMarker,
        createAuthority: successorAuthority});
      fs.writeFileSync(staleStaging, 'successor-staging');
      const staleCleanup = await removeSnapshotInstallArtifactsForGeneration({
        checkpointsRoot: staleRoot, replicaId: TARGET,
        replicaCreatedAt: staleMarker.createAuthority.replicaCreatedAt,
        attemptToken: staleMarker.createAuthority.attemptToken,
      });
      t.equal(staleCleanup.allAbsent, false,
        'stale A cleanup defers on successor B install artifacts');
      t.equal(fs.existsSync(staleStaging), true,
        'successor B staging survives stale cleanup');

      const rotated = admissionFixture({operationId: 'rotated-attempt'});
      const rotatedAdmitted = await rotated.owner.claim(rotated.request);
      const rotatedMaterialized = await rotated.owner.markMaterialized(
        rotatedAdmitted);
      const rotatedEvidence = await rotated.owner.markProgress(
        rotatedMaterialized, 'FAILED');
      const rotatedClaim = await rotated.owner
        .claimPhysicalWorker(rotatedEvidence);
      t.ok(rotatedClaim, 'rotation attack begins with real physical authority');
      const rotating = await rotated.owner.beginFailedAttemptRotation(
        rotatedEvidence, rotatedClaim);
      const rotatedSuccessor = await rotated.owner.finishFailedAttemptRotation(
        rotating, rotatedClaim);
      t.equal(rotatedSuccessor.attemptSeq, 2,
        'the owner durably rotates to the successor attempt');
      const rotatedTarget = path.join(root, 'rotated-target.db');
      const rotatedInstall = await requestSnapshotInstall({
        replicaDbPath: rotatedTarget,
        checkpointsRoot: path.join(root, 'checkpoints'),
        generationIndex: Number(APPLIED_INDEX), expectedIdentity: identity(),
        expectedReplicaIdentity: TARGET, expectedPeerId: targetPeer,
        createAdmissionOwner: rotated.owner,
        createAdmissionEvidence: rotatedEvidence,
        createPhysicalWorkerClaim: rotatedClaim,
      });
      t.equal(rotatedInstall.reason,
        RAFT_SNAPSHOT_INSTALL_REJECTION.CREATE_ADMISSION_REQUIRED,
        'attempt rotation refuses stale evidence before staging');
      t.equal(fs.existsSync(rotatedTarget), false,
        'attempt rotation cannot materialize stale bytes');

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
