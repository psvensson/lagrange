// Raft snapshot atomic install (quest raft-snapshot-atomic-install, R3).
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import Database from 'better-sqlite3';
import {ENTITY_TYPE} from '../constants/addresses.js';
import {canonicalJsonBytes, ensureDirectory, fsyncDirectory, sha256Digest} from
  '../runtime/oci-host-agent-durable-files.js';
import {SQLiteLogAdapter} from './sqlite-log-adapter.js';
import {SQLITE_RAFT_STATE_KEY} from './sqlite-raft-state-constants.js';
import {RAFT_CHECKPOINT_APPLIED_STATE_KEY, RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME} from './snapshot-checkpoint-constants.js';
import {RaftRsDurableStore} from './raft-rs-durable-store.js';
import {RAFT_RS_ZERO_INDEX} from './raft-rs-durable-store-constants.js';
import {raftRsConfStateKey} from './raft-rs-conf-state-key.js';
import {inspectSnapshotReceiver, snapshotReceiverStillAdmitted} from
  './snapshot-receiver-admission.js';
import {prepareReplicaLifecycleForSnapshot} from
  './raft-rs-replica-lifecycle-owner.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {readRaftRsPeerIdentityReservations} from './raft-rs-peer-identity.js';
import {readCheckpoint} from './snapshot-checkpoint-store.js';
import {isReplicaCreateInstallAuthority, replicaCreateInstallAuthoritiesEqual}
  from '../node/replica-create-admission-evidence.js';
import {RAFT_SNAPSHOT_BOUNDARY_STATE_KEY, RAFT_SNAPSHOT_INSTALL_DETAIL,
  RAFT_SNAPSHOT_INSTALL_MARKER_KIND, RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
  RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES,
  RAFT_SNAPSHOT_INSTALL_OUTCOME, RAFT_SNAPSHOT_INSTALL_REJECTION,
  RAFT_SNAPSHOT_INSTALL_STATE} from './snapshot-install-constants.js';
import {clearMarker, installArtifactPresent, installConflict, markerDetail,
  markerValue, removeStaging, stagingPath,
  writeMarker} from './snapshot-install-marker.js';
import {fileDigest, inspectOwnedInstallArtifacts,
  inspectSnapshotInstallArtifactsForGeneration, readInstallImage,
  removeSnapshotInstallArtifactsForGeneration, requireInstallSidecarsAbsent,
  requireNoInstallArtifacts, stagedInstallBindingMatches, writeStagedInstallBinding} from
  './snapshot-install-artifact-owner.js';

const OUTCOME = RAFT_SNAPSHOT_INSTALL_OUTCOME;
const STATE = RAFT_SNAPSHOT_INSTALL_STATE;
const REJECTION = RAFT_SNAPSHOT_INSTALL_REJECTION;
const INSTALL_ID_BYTES = 16;
const UPSERT_STATE_SQL =
  'INSERT INTO _raft_state (key, value) VALUES (?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET value = excluded.value';
const SELECT_STATE_SQL = 'SELECT value FROM _raft_state WHERE key = ?';
const DECIMAL_RADIX = 10;
const DB_EXTENSION = '.db';
const CHECKPOINTS_DIRNAME = 'checkpoints';
// An install that presents no custody of its replica.
const NO_CUSTODY = null;

function installResult(outcome, detail = {}) {
  return Object.freeze({outcome, ...detail});
}

function resolveReplicaCheckpointsRoot(replicaDbPath) {
  return path.join(path.dirname(replicaDbPath), CHECKPOINTS_DIRNAME,
    path.basename(replicaDbPath, DB_EXTENSION));
}

function createAuthorityValid(authority) {
  return isReplicaCreateInstallAuthority(authority);
}

function readDurableStateValue(dbPath, key) {
  if (!installArtifactPresent(dbPath)) return null;
  return readInstallImage(dbPath, (db) => {
    const table = db.prepare(
      'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?',
    ).get('_raft_state');
    if (!table) return null;
    const row = db.prepare(SELECT_STATE_SQL).get(key);
    return row ? row.value : null;
  });
}

function readLocalDurableElectionState(replicaDbPath) {
  const termValue = readDurableStateValue(
    replicaDbPath, SQLITE_RAFT_STATE_KEY.CURRENT_TERM);
  const parsedTerm = termValue === null ?
    0 : Number.parseInt(termValue, DECIMAL_RADIX);
  return {
    currentTerm: Number.isSafeInteger(parsedTerm) && parsedTerm > 0 ?
      parsedTerm : 0,
    votedFor: readDurableStateValue(
      replicaDbPath, SQLITE_RAFT_STATE_KEY.VOTED_FOR),
  };
}

function reconstructStagedRaftState(stagingDb, facts) {
  const throwawayAdapter = new SQLiteLogAdapter(stagingDb);
  throwawayAdapter.close();
  const upsert = stagingDb.prepare(UPSERT_STATE_SQL);
  const boundaryIndex = String(facts.lastIncludedIndex);
  const rule = resolveDurableElectionRule(
    facts.localElection, facts.lastIncludedTerm);
  const rows = [
    [SQLITE_RAFT_STATE_KEY.COMMITTED_INDEX, boundaryIndex],
    [RAFT_CHECKPOINT_APPLIED_STATE_KEY.LAST_APPLIED_INDEX, boundaryIndex],
    [RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_INDEX, boundaryIndex],
    [RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_TERM,
      String(facts.lastIncludedTerm)],
    [RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.MAX_COMMITTED_HLC, facts.maxCommittedHlc],
    [RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.INSTALL_ID, facts.installId],
    [SQLITE_RAFT_STATE_KEY.CURRENT_TERM, String(rule.currentTerm)],
  ];
  if (rule.votedFor !== null) {
    rows.push([SQLITE_RAFT_STATE_KEY.VOTED_FOR, rule.votedFor]);
  }
  stagingDb.transaction(() => {
    for (const [key, value] of rows) upsert.run(key, value);
  })();
}

function resolveCatchupHardState(raftRs, localHardState) {
  const localTerm = BigInt(localHardState?.term ?? RAFT_RS_ZERO_INDEX);
  const snapTerm = BigInt(raftRs.appliedTerm);
  if (localTerm > snapTerm) {
    return {
      term: String(localTerm),
      vote: String(localHardState?.vote ?? RAFT_RS_ZERO_INDEX),
      commit: raftRs.appliedIndex,
    };
  }
  return {
    term: raftRs.appliedTerm,
    vote: localTerm === snapTerm ?
      String(localHardState?.vote ?? RAFT_RS_ZERO_INDEX) : RAFT_RS_ZERO_INDEX,
    commit: raftRs.appliedIndex,
  };
}

function reconstructStagedRaftRsState(stagingDb, descriptor, receiver) {
  const {raftRs} = descriptor;
  const lifecycle = prepareReplicaLifecycleForSnapshot({db: stagingDb,
    groupId: raftRs.groupId, peerId: String(receiver.peerId),
    replicaIdentity: receiver.replicaIdentity,
    receiverIncarnation: receiver.incarnation});
  if (lifecycle.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    throw Object.assign(new Error(lifecycle.reason), {consensus: lifecycle});
  }
  const store = new RaftRsDurableStore(stagingDb);
  const hardState = receiver.followerCatchup ?
    resolveCatchupHardState(raftRs, receiver.hardState) :
    {term: raftRs.appliedTerm, vote: RAFT_RS_ZERO_INDEX, commit: raftRs.appliedIndex};
  const snapshotData = receiver.followerCatchup ?
    RaftRsDurableStore.encodeSnapshotWitnessData(descriptor.maxCommittedHlc) :
    undefined;
  store.transaction(() => {
    const bootstrapIndex = receiver.followerCatchup &&
      receiver.bootstrapIndex !== null ?
      receiver.bootstrapIndex : raftRs.appliedIndex;
    const admissionIndex = receiver.followerCatchup &&
      receiver.bootstrapIndex !== null ?
      (receiver.admissionIndex ??
        (raftRs.confState.voters.includes(String(receiver.peerId)) ?
          raftRs.appliedIndex : null)) : null;
    store.putBootstrapAppliedState(raftRs.groupId, raftRs.confState, {
      bootstrapIndex, admissionIndex,
      membershipGenerationIndex: raftRs.membershipGenerationIndex});
    store.putAppliedState(raftRs.groupId, raftRs.appliedIndex,
      raftRs.confState, undefined, raftRs.membershipGenerationIndex);
    store.putHardState(raftRs.groupId, hardState);
    store.putSnapshot(raftRs.groupId, {
      ...(snapshotData === undefined ? {} : {data: snapshotData}),
      metadata: {index: raftRs.appliedIndex, term: raftRs.appliedTerm,
        confState: raftRs.confState},
    }, raftRs.membershipGenerationIndex);
  });
}

async function admitsRaftRsInstall(options, descriptor) {
  const owner = options.createAdmissionOwner;
  const evidence = options.createAdmissionEvidence;
  const claim = options.createPhysicalWorkerClaim;
  if (!owner || typeof owner.revalidatePhysicalWorker !== 'function' ||
      !evidence || evidence.replicaId !== options.expectedReplicaIdentity ||
      evidence.entityType !== descriptor.entity.kind ||
      evidence.entityId !== descriptor.raftGroupId ||
      evidence.partitionId !== descriptor.raftGroupId) return false;
  if (await owner.revalidatePhysicalWorker(claim, evidence) !== true) return false;
  const reservation = descriptor.raftRs.peerReservations.find(
    ({replicaIdentity}) => replicaIdentity === options.expectedReplicaIdentity);
  return reservation?.peerId === String(options.expectedPeerId) &&
    descriptor.raftRs.confState.learners.includes(reservation.peerId);
}

function resolveDurableElectionRule(localElection, lastIncludedTerm) {
  if (localElection.currentTerm >= lastIncludedTerm) {
    return {currentTerm: localElection.currentTerm, votedFor: localElection.votedFor};
  }
  return {currentTerm: lastIncludedTerm, votedFor: null};
}

function swapStagingIntoReplica(checkpointsRoot, replicaDbPath) {
  for (const suffix of RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES) {
    fs.rmSync(`${replicaDbPath}${suffix}`, {force: true});
  }
  ensureDirectory(path.dirname(replicaDbPath));
  fs.renameSync(stagingPath(checkpointsRoot), replicaDbPath);
  fsyncDirectory(path.dirname(replicaDbPath));
}

function readInstallIdFromDb(dbPath) {
  return readDurableStateValue(dbPath, RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.INSTALL_ID) ||
    null;
}

function raftRsInstalledImageMatches(checkpointsRoot, replicaDbPath, marker) {
  if (!fs.existsSync(replicaDbPath)) return false;
  const checkpointDir = path.join(checkpointsRoot, String(marker.generationIndex));
  const checkpoint = readCheckpoint({checkpointDir});
  if (checkpoint.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID ||
      checkpoint.descriptor.payloadKind !==
        RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE) return false;
  return readInstallImage(replicaDbPath, (db) => {
    const record = RaftRsDurableStore.readDurableRecordIn(
      db, checkpoint.descriptor.raftRs.groupId);
    const reservations = readRaftRsPeerIdentityReservations(db);
    const expected = checkpoint.descriptor.raftRs;
    return record.appliedIndex === expected.appliedIndex &&
      record.membershipGenerationIndex === expected.membershipGenerationIndex &&
      raftRsConfStateKey(record.confState) ===
        raftRsConfStateKey(expected.confState) &&
      reservations.length === expected.peerReservations.length &&
      reservations.every((reservation, index) =>
        reservation.replicaIdentity ===
          expected.peerReservations[index].replicaIdentity &&
        reservation.peerId === expected.peerReservations[index].peerId &&
        reservation.nodeId === expected.peerReservations[index].nodeId &&
        reservation.learnerAdmission === expected.peerReservations[index].learnerAdmission);
  });
}

function requireCurrentInstallMarker(checkpointsRoot, marker) {
  const current = inspectOwnedInstallArtifacts(checkpointsRoot, marker.createAuthority);
  if (current.marker === null ||
      !canonicalJsonBytes(current.marker).equals(canonicalJsonBytes(marker))) {
    throw installConflict(RAFT_SNAPSHOT_INSTALL_DETAIL.ARTIFACT_CHANGED);
  }
  return current;
}

function rejectInstall(checkpointsRoot, marker, reason) {
  requireCurrentInstallMarker(checkpointsRoot, marker);
  writeMarker(checkpointsRoot, markerValue(STATE.REJECTED, marker.installId,
    marker.generationIndex, reason, markerDetail(marker)));
  removeStaging(checkpointsRoot);
  return installResult(OUTCOME.REJECTED, {reason});
}

function buildFreshCreateMarker(options, installId, generationIndex,
  replicaDbPath) {
  const createAuthority = options.createAdmissionOwner
    ?.snapshotInstallAuthority?.(options.createPhysicalWorkerClaim,
      options.createAdmissionEvidence);
  if (!createAuthorityValid(createAuthority)) return null;
  return markerValue(STATE.STAGING, installId, generationIndex,
    RAFT_SNAPSHOT_INSTALL_NO_REJECTION, {
      kind: RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE,
      createAuthority, preInstallDigest: fileDigest(replicaDbPath)});
}

function buildReceiverMarker(options, descriptor, kind, installId,
  generationIndex, replicaDbPath) {
  return markerValue(STATE.STAGING, installId, generationIndex,
    RAFT_SNAPSHOT_INSTALL_NO_REJECTION, {
      kind,
      createAuthority: Object.freeze({entityId: descriptor.entity.id,
        entityType: descriptor.entity.kind, partitionId: descriptor.raftGroupId,
        replicaId: options.expectedReplicaIdentity}),
      preInstallDigest: fileDigest(replicaDbPath)});
}

function isFollowerCatchupInstall(options, descriptor, raftRsImage) {
  return raftRsImage && !options.createAdmissionOwner &&
    descriptor.entity?.kind === ENTITY_TYPE.PARTITION &&
    typeof options.expectedReplicaIdentity === 'string' &&
    options.expectedReplicaIdentity.length > 0 &&
    fs.existsSync(options.replicaDbPath);
}

function resolveInstallPeerId(options, descriptor) {
  if (options.expectedPeerId !== undefined && options.expectedPeerId !== null) {
    return options.expectedPeerId;
  }
  return descriptor.raftRs?.peerReservations.find(
    ({replicaIdentity}) => replicaIdentity === options.expectedReplicaIdentity,
  )?.peerId ?? null;
}

function followerCatchupStagedInstallMatches(checkpointsRoot, replicaDbPath,
  marker) {
  return fileDigest(replicaDbPath) === marker.preInstallDigest &&
    snapshotReceiverStillAdmitted(checkpointsRoot, replicaDbPath, marker) &&
    raftRsInstalledImageMatches(
      checkpointsRoot, stagingPath(checkpointsRoot), marker) &&
    stagedInstallBindingMatches(stagingPath(checkpointsRoot), marker);
}

// The swap. A follower catch-up replaces the database of an established
// replica, so it requires the custody of that replica's install episode,
// read here, synchronously with the marker write and the rename (no await
// follows the read): an episode another owner claimed swaps nothing. This is
// beside the receiver lifecycle owner's journal check, which is the physical
// evidence about openers the handler does not know.
function swapPreparedInstall(checkpointsRoot, replicaDbPath, marker,
  raftRsImage, authority = null, custody = NO_CUSTODY) {
  requireCurrentInstallMarker(checkpointsRoot, marker);
  requireInstallSidecarsAbsent(replicaDbPath);
  if (!raftRsImage && (fileDigest(replicaDbPath) !== marker.preInstallDigest ||
      !stagedInstallBindingMatches(stagingPath(checkpointsRoot), marker))) return false;
  if (raftRsImage) {
    const followerCatchup = marker.kind ===
      RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FOLLOWER_CATCHUP;
    if (followerCatchup && (custody === NO_CUSTODY || custody.isHeld() !== true)) {
      return false;
    }
    const valid = followerCatchup ?
      followerCatchupStagedInstallMatches(checkpointsRoot, replicaDbPath, marker) :
      freshStagedInstallMatches(checkpointsRoot, replicaDbPath, marker, authority);
    if (!valid) return false;
  }
  writeMarker(checkpointsRoot, markerValue(STATE.STAGED, marker.installId,
    marker.generationIndex, RAFT_SNAPSHOT_INSTALL_NO_REJECTION, markerDetail(marker)));
  swapStagingIntoReplica(checkpointsRoot, replicaDbPath);
  writeMarker(checkpointsRoot, markerValue(STATE.INSTALLED, marker.installId,
    marker.generationIndex, RAFT_SNAPSHOT_INSTALL_NO_REJECTION, markerDetail(marker)));
  return true;
}

// A fresh-create image commits only through the CREATE admission owner: the
// swap runs on that owner's authoritative operation-row read, which also
// re-requires the caller's admission basis (options.createAdmissionBasis, the
// columns a message-group learner's recorded fact and open admission hold).
async function commitPreparedInstall(options, marker, raftRsImage) {
  const captured = requireCurrentInstallMarker(options.checkpointsRoot, marker).captured;
  const swap = (authority = null) => {
    captured.assertUnchanged();
    return swapPreparedInstall(options.checkpointsRoot, options.replicaDbPath,
      marker, raftRsImage, authority, options.custody ?? NO_CUSTODY);
  };
  const freshCreate = raftRsImage &&
    marker.kind === RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE;
  return freshCreate ? options.createAdmissionOwner.commitSnapshotInstall(
    options.createPhysicalWorkerClaim, swap, options.createAdmissionBasis) : swap();
}

const MEMORY_DB_PATH = ':memory:';

function rejectInvalidCheckpoint(validationOutcome) {
  const identityOutcomes = [
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_CLUSTER,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_GROUP,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_ENTITY,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.STALE_EPOCH,
  ];
  const reason = identityOutcomes.includes(validationOutcome) ?
    REJECTION.IDENTITY_MISMATCH : REJECTION.CHECKPOINT_INVALID;
  return installResult(OUTCOME.REJECTED, {reason, validationOutcome});
}

async function prepareInstallAdmissionAndMarker(
  options, descriptor, installId, generationIndex, raftRsImage, followerCatchup) {
  if (!raftRsImage) {
    if (descriptor.entity.kind !== ENTITY_TYPE.PARTITION ||
        typeof options.expectedReplicaIdentity !== 'string' ||
        options.expectedReplicaIdentity.length === 0) {
      return {ok: false, rejection: installResult(OUTCOME.REJECTED, {
        reason: REJECTION.RECEIVER_STATE_REFUSED})};
    }
    return {ok: true, marker: buildReceiverMarker(options, descriptor,
      RAFT_SNAPSHOT_INSTALL_MARKER_KIND.PARTITION_STATE_MACHINE,
      installId, generationIndex, options.replicaDbPath)};
  }
  if (!followerCatchup && !await admitsRaftRsInstall(options, descriptor)) {
    return {ok: false, rejection: installResult(OUTCOME.REJECTED, {
      reason: REJECTION.CREATE_ADMISSION_REQUIRED})};
  }
  const receiver = inspectSnapshotReceiver({
    replicaDbPath: options.replicaDbPath, descriptor,
    replicaIdentity: options.expectedReplicaIdentity,
    allowEstablishedReceiver: followerCatchup});
  if (receiver.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    return {ok: false, rejection: installResult(OUTCOME.REJECTED, {
      reason: REJECTION.RECEIVER_STATE_REFUSED, consensus: receiver})};
  }
  const marker = followerCatchup ?
    buildReceiverMarker(options, descriptor,
      RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FOLLOWER_CATCHUP, installId, generationIndex,
      options.replicaDbPath) :
    buildFreshCreateMarker(options, installId, generationIndex,
      options.replicaDbPath);
  if (!marker) {
    return {ok: false, rejection: installResult(OUTCOME.REJECTED, {
      reason: REJECTION.CREATE_ADMISSION_REQUIRED})};
  }
  return {ok: true, marker, receiverDetail: receiver.detail};
}

function populateStagedInstallDb({
  stagingDb, descriptor, options, marker, installId, localElection,
  raftRsImage, followerCatchup, receiverDetail,
}) {
  if (raftRsImage) {
    reconstructStagedRaftRsState(stagingDb, descriptor, {
      peerId: resolveInstallPeerId(options, descriptor),
      incarnation: receiverDetail.incarnation,
      replicaIdentity: options.expectedReplicaIdentity,
      followerCatchup,
      bootstrapIndex: receiverDetail.bootstrapIndex ?? null,
      admissionIndex: receiverDetail.admissionIndex ?? null,
      hardState: receiverDetail.hardState ?? null,
    });
  } else {
    reconstructStagedRaftState(stagingDb, {
      lastIncludedIndex: descriptor.lastIncludedIndex,
      lastIncludedTerm: descriptor.lastIncludedTerm,
      maxCommittedHlc: descriptor.maxCommittedHlc,
      installId, localElection,
    });
  }
  writeStagedInstallBinding(stagingDb, marker);
}

function installPreflight(options) {
  try {
    requireNoInstallArtifacts(options.checkpointsRoot);
    requireInstallSidecarsAbsent(options.replicaDbPath);
    return null;
  } catch (error) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {detail: error.message});
  }
}

async function executeSnapshotInstall(options) {
  const {replicaDbPath, checkpointsRoot, generationIndex, expectedIdentity} = options;
  if (replicaDbPath === MEMORY_DB_PATH) {
    return installResult(OUTCOME.REJECTED, {
      reason: REJECTION.WORKER_PATH_UNSUPPORTED});
  }
  const conflict = installPreflight(options);
  if (conflict !== null) return conflict;
  const checkpointDir = path.join(checkpointsRoot, String(generationIndex));
  const validation = readCheckpoint({checkpointDir, expectedIdentity});
  const installId = randomBytes(INSTALL_ID_BYTES).toString('hex');
  if (validation.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID) {
    return rejectInvalidCheckpoint(validation.outcome);
  }
  const raftRsImage = validation.descriptor.payloadKind ===
    RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE;
  const followerCatchup = isFollowerCatchupInstall(
    options, validation.descriptor, raftRsImage);
  const admission = await prepareInstallAdmissionAndMarker(
    options, validation.descriptor, installId, generationIndex, raftRsImage,
    followerCatchup);
  if (!admission.ok) return admission.rejection;
  const {marker, receiverDetail} = admission;
  const moved = installPreflight(options);
  if (moved !== null) return moved;
  writeMarker(checkpointsRoot, marker);
  const localElection = readLocalDurableElectionState(replicaDbPath);
  removeStaging(checkpointsRoot);
  fs.copyFileSync(path.join(checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE),
    stagingPath(checkpointsRoot));
  const stagedBytes = fs.readFileSync(stagingPath(checkpointsRoot));
  if (sha256Digest(stagedBytes) !== validation.descriptor.payloadDigest) {
    return rejectInstall(checkpointsRoot, marker, REJECTION.STAGING_DIGEST_MISMATCH);
  }
  const stagingDb = new Database(stagingPath(checkpointsRoot));
  try {
    populateStagedInstallDb({stagingDb, descriptor: validation.descriptor,
      options, marker, installId, localElection, raftRsImage, followerCatchup,
      receiverDetail});
  } finally {
    stagingDb.close();
  }
  const swapped = await commitPreparedInstall(options, marker, raftRsImage);
  if (!swapped) {
    // Custody only ever goes from held to void: a follower catch-up whose
    // custody is not held now was refused for it, or would be.
    const custody = options.custody ?? NO_CUSTODY;
    return rejectInstall(checkpointsRoot, marker, followerCatchup &&
        (custody === NO_CUSTODY || custody.isHeld() !== true) ?
      REJECTION.CUSTODY_NOT_HELD : REJECTION.CREATE_GENERATION_MISMATCH);
  }
  requireCurrentInstallMarker(checkpointsRoot, markerValue(STATE.INSTALLED,
    installId, generationIndex, RAFT_SNAPSHOT_INSTALL_NO_REJECTION, markerDetail(marker)));
  clearMarker(checkpointsRoot);
  return installResult(OUTCOME.INSTALLED, {installId, generationIndex});
}

async function requestSnapshotInstall(options) {
  try {
    return await executeSnapshotInstall(options);
  } catch (error) {
    if (error.code !== OUTCOME.INSTALL_STATE_CONFLICT) throw error;
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {detail: error.message});
  }
}

function freshStagedInstallMatches(checkpointsRoot, replicaDbPath, marker,
  currentCreateAuthority) {
  return createAuthorityValid(marker.createAuthority) &&
    replicaCreateInstallAuthoritiesEqual(
      currentCreateAuthority, marker.createAuthority) &&
    fileDigest(replicaDbPath) === marker.preInstallDigest &&
    snapshotReceiverStillAdmitted(checkpointsRoot, replicaDbPath, marker) &&
    raftRsInstalledImageMatches(checkpointsRoot, stagingPath(checkpointsRoot), marker) &&
    stagedInstallBindingMatches(stagingPath(checkpointsRoot), marker);
}

function validateStagedMarkerTarget(
  checkpointsRoot, replicaDbPath, marker, currentCreateAuthority) {
  if (marker.kind === RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE) {
    return freshStagedInstallMatches(
      checkpointsRoot, replicaDbPath, marker, currentCreateAuthority);
  }
  if (marker.kind === RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FOLLOWER_CATCHUP) {
    return followerCatchupStagedInstallMatches(checkpointsRoot, replicaDbPath, marker);
  }
  return fileDigest(replicaDbPath) === marker.preInstallDigest &&
    readInstallIdFromDb(stagingPath(checkpointsRoot)) === marker.installId;
}

function installedMarkerMatches(checkpointsRoot, replicaDbPath, marker) {
  if (!stagedInstallBindingMatches(replicaDbPath, marker)) return false;
  return marker.kind === RAFT_SNAPSHOT_INSTALL_MARKER_KIND.PARTITION_STATE_MACHINE ?
    readInstallIdFromDb(replicaDbPath) === marker.installId :
    raftRsInstalledImageMatches(checkpointsRoot, replicaDbPath, marker);
}

function resolveStagedMarker(checkpointsRoot, replicaDbPath, inspection,
  currentCreateAuthority) {
  const {marker, stagedPresent} = inspection;
  if (installedMarkerMatches(checkpointsRoot, replicaDbPath, marker)) {
    if (stagedPresent) throw installConflict(RAFT_SNAPSHOT_INSTALL_DETAIL.INSTALLED_WITH_STAGING);
    clearMarker(checkpointsRoot);
  } else {
    if (marker.state === STATE.INSTALLED) {
      throw installConflict(RAFT_SNAPSHOT_INSTALL_DETAIL.INSTALLED_BINDING_MISMATCH);
    }
    if (!stagedPresent) {
      if (fileDigest(replicaDbPath) !== marker.preInstallDigest) {
        throw installConflict(RAFT_SNAPSHOT_INSTALL_DETAIL.TARGET_CHANGED);
      }
      return rejectInstall(checkpointsRoot, marker, REJECTION.STAGING_LOST);
    }
    if (!validateStagedMarkerTarget(
      checkpointsRoot, replicaDbPath, marker, currentCreateAuthority)) {
      throw installConflict(RAFT_SNAPSHOT_INSTALL_DETAIL.STAGING_BINDING_MISMATCH);
    }
    swapStagingIntoReplica(checkpointsRoot, replicaDbPath);
    writeMarker(checkpointsRoot, markerValue(STATE.INSTALLED, marker.installId,
      marker.generationIndex, RAFT_SNAPSHOT_INSTALL_NO_REJECTION, markerDetail(marker)));
    clearMarker(checkpointsRoot);
  }
  return installResult(OUTCOME.INSTALLED, {
    installId: marker.installId, generationIndex: marker.generationIndex});
}

function resolveOwnedPendingInstall(options, checkpointsRoot) {
  const {replicaDbPath} = options;
  const inspection = inspectOwnedInstallArtifacts(checkpointsRoot, {
    replicaId: options.expectedReplicaIdentity, partitionId: options.expectedRaftGroupId});
  const {marker} = inspection;
  if (marker === null) return installResult(OUTCOME.NO_INSTALL);
  requireInstallSidecarsAbsent(replicaDbPath);
  if (marker.kind === RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE &&
      !replicaCreateInstallAuthoritiesEqual(
        options.currentCreateAuthority, marker.createAuthority)) {
    throw installConflict(RAFT_SNAPSHOT_INSTALL_DETAIL.GENERATION_MISMATCH);
  }
  if (marker.state === STATE.STAGED || marker.state === STATE.INSTALLED) {
    return resolveStagedMarker(checkpointsRoot, replicaDbPath, inspection,
      options.currentCreateAuthority);
  }
  if (fileDigest(replicaDbPath) !== marker.preInstallDigest) {
    throw installConflict(RAFT_SNAPSHOT_INSTALL_DETAIL.TARGET_CHANGED);
  }
  removeStaging(checkpointsRoot);
  clearMarker(checkpointsRoot);
  return marker.state === STATE.STAGING ?
    installResult(OUTCOME.NO_INSTALL, {detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGING_DISCARDED}) :
    installResult(OUTCOME.REJECTED, {reason: marker.rejectionReason,
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.PRIOR_REJECTION_CONSUMED});
}

function resolvePendingSnapshotInstall(options) {
  const checkpointsRoot = options.checkpointsRoot ??
    resolveReplicaCheckpointsRoot(options.replicaDbPath);
  try {
    return resolveOwnedPendingInstall(options, checkpointsRoot);
  } catch (error) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {detail: error.message});
  }
}

async function recoverPendingSnapshotInstall(options) {
  const owner = options.createAdmissionOwner;
  const claim = options.createPhysicalWorkerClaim;
  if (!owner || typeof owner.commitSnapshotInstall !== 'function' || !claim) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH});
  }
  let resolution = null;
  let invoked = false;
  const authorized = await owner.commitSnapshotInstall(claim, (authority) => {
    invoked = true;
    resolution = resolvePendingSnapshotInstall({...options,
      currentCreateAuthority: authority, expectedReplicaIdentity: authority.replicaId,
      expectedRaftGroupId: authority.partitionId});
    return true;
  }, options.createAdmissionBasis);
  return authorized && invoked ? resolution :
    installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH});
}

export {
  inspectSnapshotInstallArtifactsForGeneration,
  removeSnapshotInstallArtifactsForGeneration,
  recoverPendingSnapshotInstall,
  requestSnapshotInstall,
  resolveDurableElectionRule,
  resolvePendingSnapshotInstall,
  resolveReplicaCheckpointsRoot,
};
