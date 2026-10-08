import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../../src/test-helpers/tap.js';
import {createSqliteStateMachineCheckpoint} from
  '../../../src/raft/snapshot-checkpoint-store.js';
import {RAFT_CHECKPOINT_CREATION_OUTCOME} from
  '../../../src/raft/snapshot-checkpoint-constants.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {requestSnapshotInstall} from '../../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE,
} from '../../../src/raft/snapshot-install-constants.js';
import {
  CREATE_ADMISSION_ERROR_CODE,
  CREATE_ADMISSION_STATE,
  ReplicaCreateAdmissionOwner,
} from '../../../src/node/replica-create-admission-owner.js';
import {OperationType} from '../../../src/rebalancer/replica-status.js';

const GROUP = 'mg-checkpoint-owner-negative';
const FOUNDERS = Object.freeze(['mg-neg-a', 'mg-neg-b', 'mg-neg-c']);
const TARGET = 'mg-neg-fresh-d';
const REMOVED = 'mg-neg-removed-z';
const HISTORICAL = 'mg-neg-historical-y';
const APPLIED_INDEX = '12';
const APPLIED_TERM = '4';
const MEMBERSHIP_GENERATION = '9';
const SUCCESSOR_BYTES = Buffer.from('successor-generation-bytes');

function identity() {
  return {
    clusterId: 'cluster-fresh-mg-negative',
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

function admissionFixture({operationId, attemptToken, now = 20,
  terminal = false, repository = admissionRepository(), owner = null} = {}) {
  const row = {operation_id: operationId, type: OperationType.REPLACE,
    entity_type: 'message-group', entity_id: GROUP, partition_id: GROUP,
    replica_id: TARGET, source_replica_id: REMOVED, target_node_id: 'node-d',
    workflow_step: 'SENDING', updated_at: 11,
    completed_at: terminal ? now : null,
    create_admission_state: null, create_admission_token: null,
    create_admission_replica_created_at: null,
    create_admission_attempt_token: null,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: null,
    create_admission_workflow_updated_at: null,
    create_admission_owner_incarnation: null};
  repository.rows.set(operationId, row);
  const fixtureOwner = owner ||
    repository.ownerAt(repository.currentBootIncarnation(), () => now);
  const ownerAt = (ownerIncarnation, ownerNow = now) =>
    repository.ownerAt(ownerIncarnation, () => ownerNow);
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

async function createNativeImage(root, {targetRole = 'learner'} = {}) {
  const sourceDbPath = path.join(root, `source-${targetRole}.db`);
  const db = new Database(sourceDbPath);
  try {
    const registry = new RaftRsPeerIdentityRegistry(db);
    const founderPeers = FOUNDERS.map((replica) =>
      registry.registerReplica(replica));
    const targetPeer = registry.registerReplica(TARGET);
    const sourcePeer = registry.registerReplica(REMOVED);
    const historicalPeer = registry.registerReplica(HISTORICAL);
    const store = new RaftRsDurableStore(db);
    const voters = targetRole === 'voter' ?
      [...founderPeers, targetPeer] : founderPeers;
    const learners = targetRole === 'learner' ? [targetPeer] : [];
    store.putAppliedState(GROUP, APPLIED_INDEX, {
      voters,
      learners,
      votersOutgoing: [],
      learnersNext: [],
      autoLeave: false,
    }, undefined, MEMBERSHIP_GENERATION);
    store.appendEntries(GROUP, [{index: APPLIED_INDEX, term: APPLIED_TERM,
      entryType: 0, data: Buffer.from('{}').toString('base64')}]);
    store.putHardState(GROUP, {term: APPLIED_TERM, vote: '0',
      commit: APPLIED_INDEX});
    const checkpointsRoot = path.join(root, `checkpoints-${targetRole}`);
    const created = await createSqliteStateMachineCheckpoint({
      db,
      identity: identity(),
      checkpointsRoot,
      raftRsGroupId: GROUP,
    });
    return {created, checkpointsRoot, targetPeer, sourcePeer, historicalPeer};
  } finally {
    db.close();
  }
}

function installArtifactPaths(checkpointsRoot) {
  const installDir = path.join(checkpointsRoot, RAFT_SNAPSHOT_INSTALL_DIRNAME);
  return {
    marker: path.join(installDir, RAFT_SNAPSHOT_INSTALL_MARKER_FILE),
    staging: path.join(installDir, RAFT_SNAPSHOT_INSTALL_STAGING_FILE),
  };
}


function cloneCheckpointsRoot(root, sourceRoot, name) {
  const cloned = path.join(root, name);
  fs.cpSync(path.join(sourceRoot, APPLIED_INDEX),
    path.join(cloned, APPLIED_INDEX), {recursive: true});
  return cloned;
}

function assertEvidenceMatchesRequest(t, evidence, request, row, label) {
  t.equal(evidence.operationId, request.operationId,
    `${label}: evidence binds operation id`);
  t.equal(evidence.operationType, request.operationType,
    `${label}: evidence binds operation type`);
  t.equal(evidence.entityId, request.entityId,
    `${label}: evidence binds entity id`);
  t.equal(evidence.partitionId, request.partitionId,
    `${label}: evidence binds partition id`);
  t.equal(evidence.replicaId, request.replicaId,
    `${label}: evidence binds target replica id`);
  t.equal(evidence.targetNodeId, row.target_node_id,
    `${label}: evidence binds target node`);
  t.equal(evidence.admissionToken, request.admissionToken,
    `${label}: evidence binds admission token`);
  t.equal(evidence.attemptToken, request.attemptToken,
    `${label}: evidence binds attempt token`);
  t.equal(evidence.attemptSeq, request.attemptSeq,
    `${label}: evidence binds attempt sequence`);
  t.equal(evidence.workflowUpdatedAt, request.workflowUpdatedAt,
    `${label}: evidence binds workflow timestamp`);
  t.equal(evidence.ownerIncarnation, row.create_admission_owner_incarnation,
    `${label}: evidence binds owner incarnation`);
  t.equal(evidence.replicaCreatedAt,
    row.create_admission_replica_created_at,
    `${label}: evidence binds durable replica generation`);
}


async function assertCreateAdmissionInstallRefusal(t, options) {
  const {root, image, name, evidence, claim, owner} = options;
  const targetPath = path.join(root,
    `${name.replaceAll(/[^A-Za-z0-9_-]/g, '-')}.db`);
  fs.writeFileSync(targetPath, SUCCESSOR_BYTES);
  const beforeDigest = fs.readFileSync(targetPath).toString('hex');
  const checkpointsRoot = cloneCheckpointsRoot(
    root, image.checkpointsRoot,
    `${name.replaceAll(/[^A-Za-z0-9_-]/g, '-')}-checkpoints`);
  const artifacts = installArtifactPaths(checkpointsRoot);
  t.equal(fs.existsSync(artifacts.marker), false,
    `${name}: setup starts without install marker`);
  t.equal(fs.existsSync(artifacts.staging), false,
    `${name}: setup starts without install staging`);
  const refused = await requestSnapshotInstall({
    replicaDbPath: targetPath,
    checkpointsRoot,
    generationIndex: Number(APPLIED_INDEX),
    expectedIdentity: identity(),
    expectedReplicaIdentity: TARGET,
    expectedPeerId: image.targetPeer,
    createAdmissionOwner: owner,
    createAdmissionEvidence: evidence,
    createPhysicalWorkerClaim: claim,
  });
  t.equal(refused.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
    `${name}: install is refused`);
  t.equal(refused.reason,
    RAFT_SNAPSHOT_INSTALL_REJECTION.CREATE_ADMISSION_REQUIRED,
    `${name}: refusal is the named CREATE admission gate`);
  t.equal(fs.existsSync(artifacts.marker), false,
    `${name}: marker is not created before refusal`);
  t.equal(fs.existsSync(artifacts.staging), false,
    `${name}: staging is not created before refusal`);
  t.equal(fs.readFileSync(targetPath).toString('hex'), beforeDigest,
    `${name}: target bytes are preserved`);
}

async function validCreateAuthority(operationId) {
  const admission = admissionFixture({
    operationId,
    attemptToken: `attempt-${operationId}`,
  });
  const evidence = await admission.owner.claim(admission.request);
  const claim = await admission.owner.claimPhysicalWorker(evidence);
  return {admission, evidence, claim};
}

test('R5 component: exact CREATE native image install refuses mismatched owner facts before mutation',
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-mg-r5-neg-'));
    try {
      const learnerImage = await createNativeImage(root);
      const voterImage = await createNativeImage(root, {targetRole: 'voter'});
      t.equal(learnerImage.created.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'setup: learner image is a valid sealed native checkpoint');
      t.equal(voterImage.created.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'setup: voter image is a valid sealed native checkpoint');

      const cases = [
        {
          name: 'current target is already voter, not learner',
          image: voterImage,
          expectedReplicaIdentity: TARGET,
          expectedPeerId: voterImage.targetPeer,
          claim: ({claim}) => claim,
        },
        {
          name: 'expected target replica identity does not match CREATE evidence',
          image: learnerImage,
          expectedReplicaIdentity: REMOVED,
          expectedPeerId: learnerImage.sourcePeer,
          claim: ({claim}) => claim,
        },
        {
          name: 'expected peer id does not match target reservation',
          image: learnerImage,
          expectedReplicaIdentity: TARGET,
          expectedPeerId: learnerImage.sourcePeer,
          claim: ({claim}) => claim,
        },
        {
          name: 'copied physical worker claim is unbranded',
          image: learnerImage,
          expectedReplicaIdentity: TARGET,
          expectedPeerId: learnerImage.targetPeer,
          claim: ({claim}) => ({...claim}),
        },
      ];

      for (const [index, candidate] of cases.entries()) {
        const operationId = `fresh-mg-r5-negative-${index}`;
        const authority = await validCreateAuthority(operationId);
        t.ok(authority.claim,
          `${candidate.name}: setup has a real CREATE physical worker claim`);
        const targetPath = path.join(root, `successor-${index}.db`);
        fs.writeFileSync(targetPath, SUCCESSOR_BYTES);
        const beforeDigest = fs.readFileSync(targetPath).toString('hex');
        const artifacts = installArtifactPaths(candidate.image.checkpointsRoot);
        t.equal(fs.existsSync(artifacts.marker), false,
          `${candidate.name}: setup starts without install marker`);
        t.equal(fs.existsSync(artifacts.staging), false,
          `${candidate.name}: setup starts without install staging`);

        const refused = await requestSnapshotInstall({
          replicaDbPath: targetPath,
          checkpointsRoot: candidate.image.checkpointsRoot,
          generationIndex: Number(APPLIED_INDEX),
          expectedIdentity: identity(),
          expectedReplicaIdentity: candidate.expectedReplicaIdentity,
          expectedPeerId: candidate.expectedPeerId,
          createAdmissionOwner: authority.admission.owner,
          createAdmissionEvidence: authority.evidence,
          createPhysicalWorkerClaim: candidate.claim(authority),
        });

        t.equal(refused.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
          `${candidate.name}: install is refused`);
        t.equal(refused.reason,
          RAFT_SNAPSHOT_INSTALL_REJECTION.CREATE_ADMISSION_REQUIRED,
          `${candidate.name}: refusal is the named CREATE admission gate`);
        t.equal(fs.existsSync(artifacts.marker), false,
          `${candidate.name}: marker is not created before refusal`);
        t.equal(fs.existsSync(artifacts.staging), false,
          `${candidate.name}: staging is not created before refusal`);
        t.equal(fs.readFileSync(targetPath).toString('hex'), beforeDigest,
          `${candidate.name}: successor target bytes are preserved`);
        t.same(authority.admission.row.create_admission_state, 'ADMITTED',
          `${candidate.name}: ordinary CREATE debt remains independent`);
      }
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });


test('R5 component: exact CREATE owner matrix preserves fresh learner authority',
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-mg-r5-matrix-'));
    try {
      const image = await createNativeImage(root);
      t.equal(image.created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'setup: learner image is a valid sealed native checkpoint');

      const duplicate = admissionFixture({
        operationId: 'fresh-mg-r5-duplicate',
        attemptToken: 'attempt-duplicate-a',
      });
      const firstEvidence = await duplicate.owner.claim(duplicate.request);
      const retryEvidence = await duplicate.owner.claim(duplicate.request);
      assertEvidenceMatchesRequest(t, firstEvidence, duplicate.request,
        duplicate.row, 'duplicate first claim');
      t.equal(retryEvidence.replicaCreatedAt, firstEvidence.replicaCreatedAt,
        'duplicate retry adopts the same durable replica generation');
      t.equal(duplicate.row.create_admission_state,
        CREATE_ADMISSION_STATE.ADMITTED,
        'duplicate retry leaves admission in ADMITTED');
      const firstClaim = await duplicate.owner
        .claimPhysicalWorker(firstEvidence);
      t.ok(firstClaim,
        'first physical worker claim is branded by the owner');
      t.equal(await duplicate.owner.claimPhysicalWorker(retryEvidence), false,
        'duplicate physical worker is refused while the first claim is live');
      t.equal(await duplicate.owner.revalidatePhysicalWorker(firstClaim,
        firstEvidence), true,
      'physical worker revalidates against exact evidence');
      t.equal(duplicate.owner.releasePhysicalWorker(firstClaim), true,
        'exact physical claim can be released');
      const reclaimed = await duplicate.owner.claimPhysicalWorker(retryEvidence);
      t.ok(reclaimed,
        'released duplicate retry can reclaim the exact same generation');
      t.equal(duplicate.owner.releasePhysicalWorker(reclaimed), true,
        'reclaimed physical claim releases cleanly');

      const crossRepository = admissionRepository();
      const crossA = admissionFixture({
        operationId: 'fresh-mg-r5-cross-a',
        attemptToken: 'attempt-cross-a',
        repository: crossRepository,
      });
      const crossB = admissionFixture({
        operationId: 'fresh-mg-r5-cross-b',
        attemptToken: 'attempt-cross-b',
        repository: crossRepository,
        owner: crossA.owner,
      });
      const crossAEvidence = await crossA.owner.claim(crossA.request);
      const crossBEvidence = await crossB.owner.claim(crossB.request);
      const crossAClaim = await crossA.owner.claimPhysicalWorker(
        crossAEvidence);
      const crossBClaim = await crossB.owner.claimPhysicalWorker(
        crossBEvidence);
      t.ok(crossAClaim,
        'cross-wire A has a genuine branded physical worker claim');
      t.ok(crossBClaim,
        'cross-wire B has a genuine branded physical worker claim');
      await assertCreateAdmissionInstallRefusal(t, {
        root, image,
        name: 'cross-wire evidence A with claim B',
        owner: crossA.owner,
        evidence: crossAEvidence,
        claim: crossBClaim,
      });
      await assertCreateAdmissionInstallRefusal(t, {
        root, image,
        name: 'cross-wire evidence B with claim A',
        owner: crossA.owner,
        evidence: crossBEvidence,
        claim: crossAClaim,
      });
      crossA.setBootIncarnation(8);
      const newBootOwner = crossA.ownerAt(8, 40);
      await assertCreateAdmissionInstallRefusal(t, {
        root, image,
        name: 'old boot evidence and claim under new owner',
        owner: newBootOwner,
        evidence: crossAEvidence,
        claim: crossAClaim,
      });

      const admitted = admissionFixture({
        operationId: 'fresh-mg-r5-admission-first',
        attemptToken: 'attempt-admission-first',
      });
      const admittedEvidence = await admitted.owner.claim(admitted.request);
      const admittedClaim = await admitted.owner
        .claimPhysicalWorker(admittedEvidence);
      const admittedRoot = cloneCheckpointsRoot(root, image.checkpointsRoot,
        'admission-first-checkpoints');
      const admittedTarget = path.join(root, 'admission-first-target.db');
      const installed = await requestSnapshotInstall({
        replicaDbPath: admittedTarget,
        checkpointsRoot: admittedRoot,
        generationIndex: Number(APPLIED_INDEX),
        expectedIdentity: identity(),
        expectedReplicaIdentity: TARGET,
        expectedPeerId: image.targetPeer,
        createAdmissionOwner: admitted.owner,
        createAdmissionEvidence: admittedEvidence,
        createPhysicalWorkerClaim: admittedClaim,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'admission-first CREATE authority is sufficient for component install');
      const admittedDb = new Database(admittedTarget, {readonly: true});
      try {
        const restored = new RaftRsDurableStore(admittedDb)
          .readDurableRecord(GROUP);
        t.equal(restored.membershipGenerationIndex, MEMBERSHIP_GENERATION,
          'installed learner preserves committed membership generation');
        t.same(restored.confState.learners, [image.targetPeer],
          'installed image keeps the target as committed learner');
        t.equal(new RaftRsPeerIdentityRegistry(admittedDb)
          .raftPeerIdOf(TARGET), image.targetPeer,
        'installed image preserves target peer reservation');
        const registry = new RaftRsPeerIdentityRegistry(admittedDb);
        t.equal(admitted.row.source_replica_id, REMOVED,
          'authoritative REPLACE row binds the source replica identity');
        t.equal(registry.raftPeerIdOf(admitted.row.source_replica_id),
          image.sourcePeer,
          'installed image retains the exact REPLACE source reservation');
        t.equal(registry.raftPeerIdOf(HISTORICAL), image.historicalPeer,
          'installed image also retains unrelated historical reservation');
      } finally {
        admittedDb.close();
      }
      t.equal(admitted.row.create_admission_state,
        CREATE_ADMISSION_STATE.ADMITTED,
        'component install does not settle the ordinary CREATE workflow');

      const terminal = admissionFixture({
        operationId: 'fresh-mg-r5-terminal-first',
        attemptToken: 'attempt-terminal-first',
        terminal: true,
      });
      await t.rejects(terminal.owner.claim(terminal.request), {
        code: CREATE_ADMISSION_ERROR_CODE.REFUSED_TERMINAL,
      }, 'terminal-first CREATE is refused before physical authority');
      t.equal(terminal.row.create_admission_state, null,
        'terminal-first refusal leaves no admission state');

      const repository = admissionRepository();
      const stale = admissionFixture({
        operationId: 'fresh-mg-r5-stale-a',
        attemptToken: 'attempt-stale-a',
        repository,
        now: 50,
      });
      const staleEvidence = await stale.owner.claim(stale.request);
      const materialized = await stale.owner.markMaterialized(staleEvidence);
      const failed = await stale.owner.markProgress(materialized, 'FAILED');
      const staleClaim = await stale.owner.claimPhysicalWorker(failed);
      t.ok(staleClaim, 'stale A begins rotation with exact physical authority');
      const rotating = await stale.owner.beginFailedAttemptRotation(
        failed, staleClaim);
      const rotated = await stale.owner.finishFailedAttemptRotation(
        rotating, staleClaim);
      t.equal(rotated.attemptSeq, 2,
        'release/reclaim rotation advances to a successor attempt');
      t.equal(rotated.previousAttemptToken, null,
        'finished rotation clears previous-attempt ownership');
      t.equal(rotated.replicaCreatedAt, staleEvidence.replicaCreatedAt,
        'attempt rotation retains the exact durable replica generation');
      t.equal(await stale.owner.revalidatePhysicalWorker(staleClaim,
        staleEvidence), false,
      'old attempt evidence no longer revalidates after rotation');
      t.equal(await stale.owner.revalidatePhysicalWorker(staleClaim,
        rotated), true,
      'physical claim advances to rotated evidence');
      const rotatedRoot = cloneCheckpointsRoot(root, image.checkpointsRoot,
        'rotated-checkpoints');
      const rotatedTarget = path.join(root, 'rotated-target.db');
      const staleAttemptInstall = await requestSnapshotInstall({
        replicaDbPath: rotatedTarget,
        checkpointsRoot: rotatedRoot,
        generationIndex: Number(APPLIED_INDEX),
        expectedIdentity: identity(),
        expectedReplicaIdentity: TARGET,
        expectedPeerId: image.targetPeer,
        createAdmissionOwner: stale.owner,
        createAdmissionEvidence: staleEvidence,
        createPhysicalWorkerClaim: staleClaim,
      });
      t.equal(staleAttemptInstall.outcome,
        RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
        'stale pre-rotation evidence cannot install after rotation');
      t.equal(staleAttemptInstall.reason,
        RAFT_SNAPSHOT_INSTALL_REJECTION.CREATE_ADMISSION_REQUIRED,
        'stale pre-rotation evidence is refused by exact CREATE authority');
      t.equal(fs.existsSync(rotatedTarget), false,
        'stale attempt refusal performs no target mutation');

      const successorA = admissionFixture({
        operationId: 'fresh-mg-r5-successor-a',
        attemptToken: 'attempt-successor-a',
        repository,
        now: 60,
      });
      const successorAEvidence = await successorA.owner.claim(
        successorA.request);
      const successorAClaim = await successorA.owner
        .claimPhysicalWorker(successorAEvidence);
      t.equal(successorA.owner.releasePhysicalWorker(successorAClaim), true,
        'A releases before lifecycle close');
      const closedA = await successorA.owner.close(successorAEvidence);
      t.equal(closedA.admissionState, CREATE_ADMISSION_STATE.CLOSED,
        'A closes before successor B admission');
      const successorB = admissionFixture({
        operationId: 'fresh-mg-r5-successor-b',
        attemptToken: 'attempt-successor-b',
        repository,
        owner: successorA.owner,
        now: 70,
      });
      successorA.owner.now = () => 70;
      const successorBEvidence = await successorB.owner.claim(
        successorB.request);
      t.ok(successorBEvidence.replicaCreatedAt >
        successorAEvidence.replicaCreatedAt,
      'successor B owns a later durable generation than A');
      await t.rejects(successorA.owner.claim(successorA.request), {
        code: CREATE_ADMISSION_ERROR_CODE.STALE,
      }, 'late A CREATE claim is fenced after close and B admission');
      t.equal(successorA.row.create_admission_state,
        CREATE_ADMISSION_STATE.CLOSED,
        'late A fence preserves A cleanup authority as CLOSED');
      t.equal(successorB.row.create_admission_state,
        CREATE_ADMISSION_STATE.ADMITTED,
        'late A fence does not block successor B admission settlement');
      const successorBClaim = await successorB.owner
        .claimPhysicalWorker(successorBEvidence);
      const successorBRoot = cloneCheckpointsRoot(root, image.checkpointsRoot,
        'successor-b-checkpoints');
      const successorPath = path.join(root, 'successor-generation.db');
      const installedB = await requestSnapshotInstall({
        replicaDbPath: successorPath,
        checkpointsRoot: successorBRoot,
        generationIndex: Number(APPLIED_INDEX),
        expectedIdentity: identity(),
        expectedReplicaIdentity: TARGET,
        expectedPeerId: image.targetPeer,
        createAdmissionOwner: successorB.owner,
        createAdmissionEvidence: successorBEvidence,
        createPhysicalWorkerClaim: successorBClaim,
      });
      t.equal(installedB.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'successor B materializes through exact CREATE authority');
      const successorBytes = fs.readFileSync(successorPath).toString('hex');
      const lateARoot = cloneCheckpointsRoot(root, image.checkpointsRoot,
        'late-a-checkpoints');
      const lateAInstall = await requestSnapshotInstall({
        replicaDbPath: successorPath,
        checkpointsRoot: lateARoot,
        generationIndex: Number(APPLIED_INDEX),
        expectedIdentity: identity(),
        expectedReplicaIdentity: TARGET,
        expectedPeerId: image.targetPeer,
        createAdmissionOwner: successorA.owner,
        createAdmissionEvidence: successorAEvidence,
        createPhysicalWorkerClaim: successorAClaim,
      });
      t.equal(lateAInstall.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
        'closed A cannot overwrite successor B generation');
      t.equal(lateAInstall.reason,
        RAFT_SNAPSHOT_INSTALL_REJECTION.CREATE_ADMISSION_REQUIRED,
        'late A is refused by exact CREATE authority');
      t.equal(fs.readFileSync(successorPath).toString('hex'), successorBytes,
        'identity81 exact-generation successor bytes are preserved');
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
