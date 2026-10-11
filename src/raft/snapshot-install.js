// Raft snapshot atomic install (quest raft-snapshot-atomic-install, R3).
// Runs ONLY at the closed-handle boot boundary of the PartitionService init
// path: no connection to the replica database may be open. Staging copies
// and re-digests a sealed checkpoint payload, a reconstruction transaction
// rebuilds follower-local `_raft_log`/`_raft_state` (never imported from the
// sender — the payload was scrubbed of both at creation), and one atomic
// rename is the install transition. A durable canonical-JSON marker makes
// every crash point restart-distinguishable; healing is decided by the
// per-install nonce, never by boundary keys (two installs of the same
// generation are otherwise indistinguishable).

import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

import Database from 'better-sqlite3';

import {
  ensureDirectory,
  canonicalJsonBytes,
  exactKeys,
  fsyncDirectory,
  readCanonicalJson,
  sha256Digest,
  writeAtomicDurable,
  writeExclusiveDurable,
} from '../runtime/oci-host-agent-durable-files.js';

import {SQLiteLogAdapter} from './sqlite-log-adapter.js';
import {SQLITE_RAFT_STATE_KEY} from './sqlite-raft-state-constants.js';
import {
  RAFT_CHECKPOINT_APPLIED_STATE_KEY,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from './snapshot-checkpoint-constants.js';
import {RaftRsDurableStore} from './raft-rs-durable-store.js';
import {raftRsConfStateKey} from './raft-rs-conf-state-key.js';
import {stageRaftRsSnapshotLifecycle} from
  './raft-rs-snapshot-staging-lifecycle-operation.js';
import {readRaftRsPeerIdentityReservations} from
  './raft-rs-peer-identity.js';
import {readCheckpoint} from './snapshot-checkpoint-store.js';
import {isReplicaCreateInstallAuthority,
  replicaCreateInstallAuthoritiesEqual} from
  '../node/replica-create-admission-evidence.js';
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_RS_SNAPSHOT_STAGING_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_DETAIL,
  RAFT_SNAPSHOT_INSTALL_ARTIFACT_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_LEGACY_MARKER_FIELDS,
  RAFT_SNAPSHOT_INSTALL_MARKER_FIELDS,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_MARKER_KIND,
  RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE,
  RAFT_SNAPSHOT_INSTALL_STATE,
} from './snapshot-install-constants.js';

const OUTCOME = RAFT_SNAPSHOT_INSTALL_OUTCOME;
const STATE = RAFT_SNAPSHOT_INSTALL_STATE;
const REJECTION = RAFT_SNAPSHOT_INSTALL_REJECTION;
const INSTALL_ID_BYTES = 16;
const MARKER_ERROR_CODE = 'RAFT_SNAPSHOT_INSTALL_MARKER_CORRUPT';
const UPSERT_STATE_SQL =
  'INSERT INTO _raft_state (key, value) VALUES (?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET value = excluded.value';
const SELECT_STATE_SQL = 'SELECT value FROM _raft_state WHERE key = ?';
const DECIMAL_RADIX = 10;
const DB_EXTENSION = '.db';
const CHECKPOINTS_DIRNAME = 'checkpoints';
const INSTALL_BINDING_TABLE = '_raft_snapshot_install_binding';
const SELECT_INSTALL_BINDING_TABLE_SQL =
  'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?';
const NO_CREATE_AUTHORITY = Object.freeze({});
const NO_CREATE_AUTHORITY_JSON = '{}';
const ABSENT_PREINSTALL_DIGEST = 'absent';
const MARKER_KIND_FIELD = 'kind';
const INSTALL_MARKER_KINDS = new Set(
  Object.values(RAFT_SNAPSHOT_INSTALL_MARKER_KIND));
const STAGING_OUTCOME = RAFT_RS_SNAPSHOT_STAGING_OUTCOME;
const FRESH_STAGING_PAYLOAD_STATE = Object.freeze({
  ABSENT: 'absent',
  RAW: 'raw_checkpoint_payload',
  RECONSTRUCTED: 'reconstructed_for_receiver',
  CONFLICT: 'conflict',
});

function installResult(outcome, detail = {}) {
  return Object.freeze({outcome, ...detail});
}

/**
 * Deterministic checkpoints root for one replica database file:
 * {partitionDir}/checkpoints/{replicaId}/ (matches the S1 layout).
 * @param {string} replicaDbPath absolute replica database path
 * @return {string} the replica's checkpoint root directory
 */
function resolveReplicaCheckpointsRoot(replicaDbPath) {
  return path.join(
    path.dirname(replicaDbPath),
    CHECKPOINTS_DIRNAME,
    path.basename(replicaDbPath, DB_EXTENSION),
  );
}

function installDir(checkpointsRoot) {
  return path.join(checkpointsRoot, RAFT_SNAPSHOT_INSTALL_DIRNAME);
}

function markerPath(checkpointsRoot) {
  return path.join(installDir(checkpointsRoot), RAFT_SNAPSHOT_INSTALL_MARKER_FILE);
}

function stagingPath(checkpointsRoot) {
  return path.join(installDir(checkpointsRoot), RAFT_SNAPSHOT_INSTALL_STAGING_FILE);
}

function readMarker(checkpointsRoot) {
  const file = markerPath(checkpointsRoot);
  if (!fs.existsSync(file)) return null;
  const marker = readCanonicalJson(file, MARKER_ERROR_CODE);
  if (!exactKeys(marker, RAFT_SNAPSHOT_INSTALL_MARKER_FIELDS) &&
      !exactKeys(marker, RAFT_SNAPSHOT_INSTALL_LEGACY_MARKER_FIELDS)) {
    const error = new Error(MARKER_ERROR_CODE);
    error.code = MARKER_ERROR_CODE;
    throw error;
  }
  if (Object.hasOwn(marker, MARKER_KIND_FIELD) &&
      !INSTALL_MARKER_KINDS.has(marker.kind)) {
    const error = new Error(MARKER_ERROR_CODE);
    error.code = MARKER_ERROR_CODE;
    throw error;
  }
  return marker;
}

function writeMarker(checkpointsRoot, marker) {
  ensureDirectory(installDir(checkpointsRoot));
  writeAtomicDurable(markerPath(checkpointsRoot), marker);
}

function markerValue(state, installId, generationIndex, rejectionReason,
  detail = {}) {
  return Object.freeze({
    state,
    installId,
    generationIndex,
    rejectionReason: rejectionReason || RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
    kind: detail.kind || RAFT_SNAPSHOT_INSTALL_MARKER_KIND.LEGACY_PARTITION,
    createAuthority: detail.createAuthority || NO_CREATE_AUTHORITY,
    preInstallDigest: detail.preInstallDigest ?? ABSENT_PREINSTALL_DIGEST,
  });
}

function markerKind(marker) {
  return marker.kind || RAFT_SNAPSHOT_INSTALL_MARKER_KIND.LEGACY_PARTITION;
}

function markerDetail(marker) {
  return {kind: markerKind(marker),
    createAuthority: marker.createAuthority || NO_CREATE_AUTHORITY,
    preInstallDigest: marker.preInstallDigest ?? ABSENT_PREINSTALL_DIGEST};
}

function createAuthorityValid(authority) {
  return isReplicaCreateInstallAuthority(authority);
}

function fileDigest(file) {
  return fs.existsSync(file) ? sha256Digest(fs.readFileSync(file)) :
    ABSENT_PREINSTALL_DIGEST;
}

function stagedInstallBindingMatches(file, marker) {
  if (!fs.existsSync(file)) return false;
  const db = new Database(file, {readonly: true});
  try {
    const row = db.prepare(`SELECT create_authority FROM
      ${INSTALL_BINDING_TABLE} WHERE install_id = ?`).get(marker.installId);
    return replicaCreateInstallAuthoritiesEqual(
      JSON.parse(row?.create_authority || NO_CREATE_AUTHORITY_JSON),
      marker.createAuthority);
  } catch {
    return false;
  } finally {
    db.close();
  }
}

function stagingHasInstallBinding(file) {
  if (!fs.existsSync(file)) return false;
  const db = new Database(file, {readonly: true});
  try {
    return db.prepare(SELECT_INSTALL_BINDING_TABLE_SQL)
      .get(INSTALL_BINDING_TABLE) !== undefined;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

function descriptorMatchesCreateGroup(descriptor, authority) {
  const entityId = authority?.entityId;
  return descriptor?.payloadKind ===
      RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE &&
    [descriptor.entity?.kind === authority?.entityType,
      descriptor.entity?.id === entityId,
      descriptor.raftGroupId === entityId,
      authority?.partitionId === entityId,
      descriptor.raftRs?.groupId === entityId].every(Boolean);
}

function descriptorNamesCreateLearner(descriptor, authority) {
  const raftRs = descriptor?.raftRs;
  const reservation = raftRs?.peerReservations?.find(
    ({replicaIdentity}) => replicaIdentity === authority?.replicaId);
  return typeof reservation?.peerId === 'string' &&
    raftRs.confState?.learners?.includes(reservation.peerId);
}

function descriptorMatchesFreshMarker(descriptor, marker) {
  const authority = marker.createAuthority;
  return descriptorMatchesCreateGroup(descriptor, authority) &&
    descriptorNamesCreateLearner(descriptor, authority);
}

function freshStagingPayloadState(checkpointsRoot, marker,
  validation = null) {
  const staged = stagingPath(checkpointsRoot);
  if (!fs.existsSync(staged)) return FRESH_STAGING_PAYLOAD_STATE.ABSENT;
  if (stagedInstallBindingMatches(staged, marker)) {
    return FRESH_STAGING_PAYLOAD_STATE.RECONSTRUCTED;
  }
  if (stagingHasInstallBinding(staged)) {
    return FRESH_STAGING_PAYLOAD_STATE.CONFLICT;
  }
  const checkpoint = validation || readCheckpoint({checkpointDir:
    path.join(checkpointsRoot, String(marker.generationIndex))});
  return checkpoint.outcome === RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID &&
    descriptorMatchesFreshMarker(checkpoint.descriptor, marker) &&
    fileDigest(staged) === checkpoint.descriptor.payloadDigest ?
    FRESH_STAGING_PAYLOAD_STATE.RAW : FRESH_STAGING_PAYLOAD_STATE.CONFLICT;
}

function stagingBelongsToMarker(checkpointsRoot, marker) {
  const staged = stagingPath(checkpointsRoot);
  if (!fs.existsSync(staged)) return true;
  if (markerKind(marker) ===
      RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE) {
    return freshStagingPayloadState(checkpointsRoot, marker) !==
      FRESH_STAGING_PAYLOAD_STATE.CONFLICT;
  }
  return !stagingHasInstallBinding(staged);
}

function markerMatchesCleanupGeneration(marker, generation) {
  const authority = marker.createAuthority;
  return markerKind(marker) ===
      RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE &&
    authority?.replicaId === generation.replicaId &&
    authority?.replicaCreatedAt === generation.replicaCreatedAt &&
    authority?.attemptToken === generation.attemptToken;
}

function clearMarker(checkpointsRoot) {
  fs.rmSync(markerPath(checkpointsRoot), {force: true});
}

function removeStaging(checkpointsRoot) {
  const staged = stagingPath(checkpointsRoot);
  fs.rmSync(staged, {force: true});
  for (const suffix of RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES) {
    fs.rmSync(`${staged}${suffix}`, {force: true});
  }
}

function inspectSnapshotInstallArtifactsForGeneration(options) {
  const {checkpointsRoot, replicaId, replicaCreatedAt, attemptToken,
  } = options;
  if (!fs.existsSync(markerPath(checkpointsRoot))) {
    return Object.freeze({allAbsent: !fs.existsSync(stagingPath(checkpointsRoot)),
      outcomes: Object.freeze([])});
  }
  const marker = readMarker(checkpointsRoot);
  if (!markerMatchesCleanupGeneration(marker, {replicaId, replicaCreatedAt,
    attemptToken}) ||
      !stagingBelongsToMarker(checkpointsRoot, marker)) {
    return Object.freeze({allAbsent: false,
      outcomes: Object.freeze([{artifactPath: markerPath(checkpointsRoot),
        outcome: RAFT_SNAPSHOT_INSTALL_DETAIL.GENERATION_MISMATCH}])});
  }
  return Object.freeze({allAbsent: false, owned: true,
    outcomes: Object.freeze([])});
}

async function removeSnapshotInstallArtifactsForGeneration(options) {
  const {checkpointsRoot, beforeRemove} = options;
  const inspection = inspectSnapshotInstallArtifactsForGeneration(options);
  if (inspection.allAbsent || inspection.owned !== true) return inspection;
  const artifacts = [stagingPath(checkpointsRoot),
    ...RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES.map((suffix) =>
      `${stagingPath(checkpointsRoot)}${suffix}`), markerPath(checkpointsRoot)];
  const removedArtifacts = [];
  for (const artifactPath of artifacts) {
    if (!fs.existsSync(artifactPath)) continue;
    await beforeRemove?.(artifactPath);
    fs.rmSync(artifactPath, {force: true});
    removedArtifacts.push({artifactPath,
      outcome: RAFT_SNAPSHOT_INSTALL_ARTIFACT_OUTCOME.DELETED});
  }
  return Object.freeze({
    allAbsent: artifacts.every((artifactPath) => !fs.existsSync(artifactPath)),
    outcomes: Object.freeze(removedArtifacts),
  });
}

function readDurableStateValue(dbPath, key) {
  if (!fs.existsSync(dbPath)) return null;
  const db = new Database(dbPath, {readonly: true});
  try {
    const table = db.prepare(
      'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?',
    ).get('_raft_state');
    if (!table) return null;
    const row = db.prepare(SELECT_STATE_SQL).get(key);
    return row ? row.value : null;
  } finally {
    db.close();
  }
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

// The reconstruction transaction: create adapter-schema raft tables in the
// staged copy (the throwaway adapter is the single DDL owner whose
// `_raft_log` shape passes the boot-time legacy-schema tripwire), then write
// every follower-local row the installed replica boots from. The sender's
// log and vote rows never exist here — the payload was scrubbed at creation.
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
    [
      RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_TERM,
      String(facts.lastIncludedTerm),
    ],
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

async function admitsRaftRsInstall(options, descriptor) {
  const owner = options.createAdmissionOwner;
  const evidence = options.createAdmissionEvidence;
  const claim = options.createPhysicalWorkerClaim;
  if (!owner || typeof owner.revalidatePhysicalWorker !== 'function' ||
      !evidence || evidence.replicaId !== options.expectedReplicaIdentity ||
      evidence.entityType !== descriptor.entity.kind ||
      evidence.entityId !== descriptor.raftGroupId ||
      evidence.partitionId !== descriptor.raftGroupId) return false;
  if (await owner.revalidatePhysicalWorker(claim, evidence) !== true) {
    return false;
  }
  const reservation = descriptor.raftRs.peerReservations.find(
    ({replicaIdentity}) => replicaIdentity === options.expectedReplicaIdentity);
  return reservation?.peerId === String(options.expectedPeerId) &&
    descriptor.raftRs.confState.learners.includes(reservation.peerId);
}

/**
 * R3's explicit durable term/votedFor rule (scoped to durable `_raft_state`
 * rows; the live raft's term boot-seeding gap is a recorded pre-existing
 * finding): the durable term never regresses below the snapshot's included
 * term, and votedFor survives only when the term is unchanged — a raised
 * term has no vote yet, the one Raft-safe reset point. Sender values are
 * never an input.
 * @param {{currentTerm: number, votedFor: string|null}} localElection
 * @param {number} lastIncludedTerm snapshot's included term
 * @return {{currentTerm: number, votedFor: string|null}} durable rows
 */
function resolveDurableElectionRule(localElection, lastIncludedTerm) {
  if (localElection.currentTerm >= lastIncludedTerm) {
    return {
      currentTerm: localElection.currentTerm,
      votedFor: localElection.votedFor,
    };
  }
  return {currentTerm: lastIncludedTerm, votedFor: null};
}

function swapStagingIntoReplica(checkpointsRoot, replicaDbPath) {
  for (const suffix of RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES) {
    fs.rmSync(`${replicaDbPath}${suffix}`, {force: true});
  }
  ensureDirectory(path.dirname(replicaDbPath));
  fs.renameSync(stagingPath(checkpointsRoot), replicaDbPath);
  fsyncDirectory(path.dirname(replicaDbPath));
}

function readInstallIdFromDb(dbPath) {
  const value = readDurableStateValue(
    dbPath, RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.INSTALL_ID);
  return value || null;
}

function installedAppliedBoundaryMatches(record, expected) {
  return record.appliedIndex === expected.appliedIndex &&
    record.membershipGenerationIndex === expected.membershipGenerationIndex &&
    raftRsConfStateKey(record.confState) === raftRsConfStateKey(expected.confState);
}

function installedHardStateMatches(record, expected) {
  return record.hardState?.term === expected.appliedTerm &&
    record.hardState?.vote === '0' &&
    record.hardState?.commit === expected.appliedIndex;
}

function installedSnapshotMatches(record, expected) {
  const metadata = record.snapshot?.metadata;
  return metadata?.index === expected.appliedIndex &&
    metadata?.term === expected.appliedTerm &&
    metadata?.membershipGenerationIndex === expected.membershipGenerationIndex &&
    raftRsConfStateKey(metadata?.confState) ===
      raftRsConfStateKey(expected.confState);
}

function installedLifecycleMatches(db, expected, marker) {
  const receiverIdentity = marker.createAuthority?.replicaId;
  const receiverReservation = expected.peerReservations.find(
    ({replicaIdentity}) => replicaIdentity === receiverIdentity);
  const lifecycle = db.prepare(`SELECT peer_id, replica_identity, state,
    incarnation FROM _raft_rs_replica_lifecycle
    WHERE group_id = ? AND replica_identity = ?`).get(
    expected.groupId, receiverIdentity);
  return lifecycle?.peer_id === receiverReservation?.peerId &&
    lifecycle?.replica_identity === receiverIdentity &&
    lifecycle?.state === 'active' &&
    typeof lifecycle?.incarnation === 'string' &&
    lifecycle.incarnation.length > 0;
}

function installedBindingMatches(db, marker) {
  const binding = db.prepare(`SELECT create_authority FROM
    ${INSTALL_BINDING_TABLE} WHERE install_id = ?`).get(marker.installId);
  return replicaCreateInstallAuthoritiesEqual(
    JSON.parse(binding?.create_authority || NO_CREATE_AUTHORITY_JSON),
    marker.createAuthority);
}

function installedReservationsMatch(reservations, expected) {
  return reservations.length === expected.peerReservations.length &&
    reservations.every((reservation, index) => {
      const wanted = expected.peerReservations[index];
      return reservation.replicaIdentity === wanted.replicaIdentity &&
        reservation.peerId === wanted.peerId &&
        reservation.learnerAdmission === wanted.learnerAdmission &&
        reservation.promotionAdmission === wanted.promotionAdmission;
    });
}

function raftRsInstalledImageMatches(checkpointsRoot, replicaDbPath, marker) {
  if (!fs.existsSync(replicaDbPath)) return false;
  const checkpointDir = path.join(checkpointsRoot, String(marker.generationIndex));
  const checkpoint = readCheckpoint({checkpointDir});
  if (checkpoint.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID ||
      checkpoint.descriptor.payloadKind !==
        RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE) return false;
  const db = new Database(replicaDbPath, {readonly: true});
  try {
    const record = RaftRsDurableStore.readDurableRecordIn(
      db, checkpoint.descriptor.raftRs.groupId);
    const reservations = readRaftRsPeerIdentityReservations(db);
    const expected = checkpoint.descriptor.raftRs;
    return installedAppliedBoundaryMatches(record, expected) &&
      installedHardStateMatches(record, expected) &&
      installedSnapshotMatches(record, expected) &&
      installedLifecycleMatches(db, expected, marker) &&
      installedBindingMatches(db, marker) &&
      installedReservationsMatch(reservations, expected);
  } catch {
    return false;
  } finally {
    db.close();
  }
}

function rejectInstall(checkpointsRoot, marker, reason) {
  if (!stagingBelongsToMarker(checkpointsRoot, marker)) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
    });
  }
  writeMarker(checkpointsRoot, markerValue(
    STATE.REJECTED, marker.installId, marker.generationIndex, reason,
    markerDetail(marker)));
  removeStaging(checkpointsRoot);
  return installResult(OUTCOME.REJECTED, {reason});
}

function buildFreshCreateMarker(options, installId, generationIndex,
  replicaDbPath) {
  const createAuthority = options.createAdmissionOwner
    ?.snapshotInstallAuthority?.(
      options.createPhysicalWorkerClaim,
      options.createAdmissionEvidence,
    );
  if (!createAuthorityValid(createAuthority)) return null;
  return markerValue(STATE.STAGING, installId, generationIndex, null, {
    kind: RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE,
    createAuthority,
    preInstallDigest: fileDigest(replicaDbPath),
  });
}

function sameFreshCreateMarkerAttempt(existing, proposed) {
  return existing.state === STATE.STAGING &&
    existing.generationIndex === proposed.generationIndex &&
    markerKind(existing) ===
      RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE &&
    existing.preInstallDigest === proposed.preInstallDigest &&
    replicaCreateInstallAuthoritiesEqual(existing.createAuthority,
      proposed.createAuthority);
}

function acquireFreshCreateMarker(options, proposedMarker) {
  const {checkpointsRoot, replicaDbPath} = options;
  if (fs.existsSync(replicaDbPath)) return null;
  ensureDirectory(installDir(checkpointsRoot));
  if (fs.existsSync(markerPath(checkpointsRoot))) {
    const existing = readMarker(checkpointsRoot);
    return sameFreshCreateMarkerAttempt(existing, proposedMarker) ?
      existing : null;
  }
  if (fs.existsSync(stagingPath(checkpointsRoot))) return null;
  try {
    writeExclusiveDurable(markerPath(checkpointsRoot),
      canonicalJsonBytes(proposedMarker));
    fsyncDirectory(installDir(checkpointsRoot));
    return proposedMarker;
  } catch (error) {
    if (error?.code === 'EEXIST') return null;
    throw error;
  }
}

function syncCopiedFile(file) {
  const descriptor = fs.openSync(file, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fsyncDirectory(path.dirname(file));
}

function stagingFileIdentity(file) {
  const stat = fs.lstatSync(file);
  return {dev: stat.dev, ino: stat.ino, mode: stat.mode, nlink: stat.nlink};
}

function stagingDeferredError(result) {
  const error = new Error(result.reason);
  error.code = 'REPLICA_CREATE_ADMISSION_DEFERRED';
  error.errorCode = error.code;
  error.deferRetry = true;
  return error;
}

function swapPreparedInstall(checkpointsRoot, replicaDbPath, marker,
  raftRsImage, authority = null) {
  if (raftRsImage &&
      (!replicaCreateInstallAuthoritiesEqual(
        authority, marker.createAuthority) ||
      fileDigest(replicaDbPath) !== marker.preInstallDigest ||
      !stagedInstallBindingMatches(stagingPath(checkpointsRoot), marker))) {
    return false;
  }
  writeMarker(checkpointsRoot, markerValue(STATE.STAGED, marker.installId,
    marker.generationIndex, null, markerDetail(marker)));
  swapStagingIntoReplica(checkpointsRoot, replicaDbPath);
  writeMarker(checkpointsRoot, markerValue(STATE.INSTALLED, marker.installId,
    marker.generationIndex, null, markerDetail(marker)));
  return true;
}

// A fresh-create image commits only through the CREATE admission owner: the
// swap runs on that owner's authoritative operation-row read, which also
// re-requires the caller's admission basis (options.createAdmissionBasis, the
// columns a message-group learner's recorded fact and open admission hold).
async function commitPreparedInstall(options, marker, raftRsImage) {
  const swap = (authority = null) => swapPreparedInstall(
    options.checkpointsRoot, options.replicaDbPath, marker, raftRsImage,
    authority);
  return raftRsImage ? options.createAdmissionOwner.commitSnapshotInstall(
    options.createPhysicalWorkerClaim, swap, options.createAdmissionBasis) :
    swap();
}

/**
 * Perform one complete snapshot install at the closed-handle boundary. The
 * caller guarantees no open handle on the replica database. Every refusal is
 * a typed, marker-recorded outcome; the atomic point is the rename.
 * @param {Object} options install request
 * @param {string} options.replicaDbPath replica database file path
 * @param {string} options.checkpointsRoot the replica's checkpoint root
 * @param {number} options.generationIndex sealed generation to install
 * @param {Object} options.expectedIdentity receiver identity
 *   ({clusterId, raftGroupId, entity, membershipEpoch})
 * @return {Promise<Object>} typed install result
 */
const MEMORY_DB_PATH = ':memory:';

function rejectInvalidCheckpoint(checkpointsRoot, installId, generationIndex,
  validation) {
  const identityOutcomes = [
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_CLUSTER,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_GROUP,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_ENTITY,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.STALE_EPOCH,
  ];
  const reason = identityOutcomes.includes(validation.outcome) ?
    REJECTION.IDENTITY_MISMATCH : REJECTION.CHECKPOINT_INVALID;
  ensureDirectory(installDir(checkpointsRoot));
  if (fs.existsSync(markerPath(checkpointsRoot)) ||
      fs.existsSync(stagingPath(checkpointsRoot))) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
      validationOutcome: validation.outcome,
    });
  }
  try {
    writeExclusiveDurable(markerPath(checkpointsRoot), canonicalJsonBytes(
      markerValue(STATE.REJECTED, installId, generationIndex, reason)));
    fsyncDirectory(installDir(checkpointsRoot));
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
        detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
        validationOutcome: validation.outcome,
      });
    }
    throw error;
  }
  return installResult(OUTCOME.REJECTED,
    {reason, validationOutcome: validation.outcome});
}

async function prepareInstallMarker(options, validation, installId) {
  const {checkpointsRoot, generationIndex, replicaDbPath} = options;
  const raftRsImage = validation.descriptor.payloadKind ===
    RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE;
  if (!raftRsImage) {
    const marker = markerValue(STATE.STAGING, installId, generationIndex);
    writeMarker(checkpointsRoot, marker);
    return {marker, raftRsImage, result: null};
  }
  if (!await admitsRaftRsInstall(options, validation.descriptor)) {
    return {marker: null, raftRsImage, result: installResult(OUTCOME.REJECTED,
      {reason: REJECTION.CREATE_ADMISSION_REQUIRED})};
  }
  const proposed = buildFreshCreateMarker(
    options, installId, generationIndex, replicaDbPath);
  if (!proposed) {
    return {marker: null, raftRsImage, result: installResult(OUTCOME.REJECTED,
      {reason: REJECTION.CREATE_ADMISSION_REQUIRED})};
  }
  const marker = acquireFreshCreateMarker(options, proposed);
  const result = marker ? null : installResult(OUTCOME.INSTALL_STATE_CONFLICT,
    {detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH});
  return {marker, raftRsImage, result};
}

function copyValidatedPayload(checkpointDir, checkpointsRoot, raftRsImage,
  marker, validation) {
  if (!raftRsImage) removeStaging(checkpointsRoot);
  const staged = stagingPath(checkpointsRoot);
  if (!fs.existsSync(staged)) {
    fs.copyFileSync(path.join(checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE),
      staged, raftRsImage ? fs.constants.COPYFILE_EXCL : 0);
    if (raftRsImage) syncCopiedFile(staged);
  }
  return raftRsImage ?
    freshStagingPayloadState(checkpointsRoot, marker, validation) :
    fs.readFileSync(staged);
}

function reconstructFreshRaftRsImage(options, marker, descriptor) {
  const {checkpointsRoot, replicaDbPath} = options;
  const raftRs = descriptor.raftRs;
  const staged = stageRaftRsSnapshotLifecycle({checkpointsRoot,
    stagingFile: stagingPath(checkpointsRoot), destinationFile: replicaDbPath,
    fileIdentity: stagingFileIdentity(stagingPath(checkpointsRoot)),
    installId: marker.installId, generationIndex: marker.generationIndex,
    createAuthority: marker.createAuthority,
    destinationDigest: marker.preInstallDigest,
    groupId: raftRs.groupId, peerId: String(options.expectedPeerId),
    replicaIdentity: options.expectedReplicaIdentity,
    appliedIndex: raftRs.appliedIndex, appliedTerm: raftRs.appliedTerm,
    membershipGenerationIndex: raftRs.membershipGenerationIndex,
    confState: raftRs.confState,
    peerReservations: raftRs.peerReservations});
  if (staged.outcome === STAGING_OUTCOME.DEFERRED) {
    throw stagingDeferredError(staged);
  }
  return [STAGING_OUTCOME.INITIALIZED, STAGING_OUTCOME.REPLAY]
    .includes(staged.outcome) ? null :
    installResult(OUTCOME.INSTALL_STATE_CONFLICT, {detail: staged.reason});
}

function reconstructLegacyImage(checkpointsRoot, descriptor, installId,
  localElection) {
  const stagingDb = new Database(stagingPath(checkpointsRoot));
  try {
    reconstructStagedRaftState(stagingDb, {
      lastIncludedIndex: descriptor.lastIncludedIndex,
      lastIncludedTerm: descriptor.lastIncludedTerm,
      maxCommittedHlc: descriptor.maxCommittedHlc,
      installId,
      localElection,
    });
  } finally {
    stagingDb.close();
  }
}

async function requestSnapshotInstall(options) {
  const {
    replicaDbPath, checkpointsRoot, generationIndex, expectedIdentity,
  } = options;
  // Worker-path replicas (memory-backed SQLiteLogAdapter) never run the
  // PartitionService closed-handle boot resolver, so install is a typed
  // refusal there until S4's transfer wiring decides otherwise.
  if (replicaDbPath === MEMORY_DB_PATH) {
    return installResult(OUTCOME.REJECTED, {
      reason: REJECTION.WORKER_PATH_UNSUPPORTED,
    });
  }
  const checkpointDir = path.join(checkpointsRoot, String(generationIndex));
  const validation = readCheckpoint({checkpointDir, expectedIdentity});
  const installId = randomBytes(INSTALL_ID_BYTES).toString('hex');
  if (validation.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID) {
    return rejectInvalidCheckpoint(checkpointsRoot, installId,
      generationIndex, validation);
  }
  const prepared = await prepareInstallMarker(options, validation, installId);
  if (prepared.result) return prepared.result;
  const {marker, raftRsImage} = prepared;
  const localElection = readLocalDurableElectionState(replicaDbPath);
  const stagedPayload = copyValidatedPayload(
    checkpointDir, checkpointsRoot, raftRsImage, marker, validation);
  if (raftRsImage && stagedPayload === FRESH_STAGING_PAYLOAD_STATE.CONFLICT) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
    });
  }
  if (!raftRsImage &&
      sha256Digest(stagedPayload) !== validation.descriptor.payloadDigest) {
    return rejectInstall(
      checkpointsRoot, marker, REJECTION.STAGING_DIGEST_MISMATCH);
  }
  const reconstruction = raftRsImage ? reconstructFreshRaftRsImage(
    options, marker, validation.descriptor) : null;
  if (reconstruction) return reconstruction;
  if (!raftRsImage) {
    reconstructLegacyImage(checkpointsRoot, validation.descriptor, installId,
      localElection);
  }
  const swapped = await commitPreparedInstall(options, marker, raftRsImage);
  if (!swapped) {
    return rejectInstall(checkpointsRoot, marker,
      REJECTION.CREATE_GENERATION_MISMATCH);
  }
  clearMarker(checkpointsRoot);
  return installResult(OUTCOME.INSTALLED, {installId, generationIndex});
}

// The staged-marker nonce decision procedure (design: healing is decided by
// the install nonce, never by boundary keys).
function freshStagedInstallMatches(checkpointsRoot, replicaDbPath, marker,
  currentCreateAuthority) {
  return createAuthorityValid(marker.createAuthority) &&
    replicaCreateInstallAuthoritiesEqual(
      currentCreateAuthority, marker.createAuthority) &&
    fileDigest(replicaDbPath) === marker.preInstallDigest &&
    stagedInstallBindingMatches(stagingPath(checkpointsRoot), marker);
}

function recoverFreshStaging(options, marker, currentCreateAuthority) {
  const {checkpointsRoot, replicaDbPath} = options;
  if (!replicaCreateInstallAuthoritiesEqual(
    currentCreateAuthority, marker.createAuthority) ||
      fileDigest(replicaDbPath) !== marker.preInstallDigest) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
    });
  }
  const checkpointDir = path.join(checkpointsRoot,
    String(marker.generationIndex));
  const validation = readCheckpoint({checkpointDir});
  if (validation.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID ||
      !descriptorMatchesFreshMarker(validation.descriptor, marker)) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
    });
  }
  const reservation = validation.descriptor.raftRs.peerReservations.find(
    ({replicaIdentity}) =>
      replicaIdentity === marker.createAuthority.replicaId);
  const stagedPayload = copyValidatedPayload(checkpointDir, checkpointsRoot,
    true, marker, validation);
  if (stagedPayload === FRESH_STAGING_PAYLOAD_STATE.CONFLICT) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
    });
  }
  const reconstruction = reconstructFreshRaftRsImage({...options,
    expectedReplicaIdentity: marker.createAuthority.replicaId,
    expectedPeerId: reservation.peerId}, marker, validation.descriptor);
  if (reconstruction) return reconstruction;
  if (!swapPreparedInstall(checkpointsRoot, replicaDbPath, marker, true,
    currentCreateAuthority)) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
    });
  }
  clearMarker(checkpointsRoot);
  return installResult(OUTCOME.INSTALLED, {installId: marker.installId,
    generationIndex: marker.generationIndex});
}

function resolveStagedMarker(checkpointsRoot, replicaDbPath, marker,
  currentCreateAuthority = null) {
  const mainInstallId = readInstallIdFromDb(replicaDbPath);
  const stagingPresent = fs.existsSync(stagingPath(checkpointsRoot));
  if (mainInstallId === marker.installId) {
    if (stagingPresent) {
      return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
        detail: 'nonce_matches_with_staging_present',
      });
    }
    clearMarker(checkpointsRoot);
    return installResult(OUTCOME.INSTALLED, {
      installId: marker.installId,
      generationIndex: marker.generationIndex,
    });
  }
  if (!stagingPresent) {
    if (raftRsInstalledImageMatches(checkpointsRoot, replicaDbPath, marker) &&
        (markerKind(marker) !==
          RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE ||
        stagedInstallBindingMatches(replicaDbPath, marker))) {
      clearMarker(checkpointsRoot);
      return installResult(OUTCOME.INSTALLED, {
        installId: marker.installId,
        generationIndex: marker.generationIndex,
      });
    }
    if (markerKind(marker) ===
        RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE) {
      return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
        detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
      });
    }
    return rejectInstall(checkpointsRoot, marker, REJECTION.STAGING_LOST);
  }
  if (markerKind(marker) ===
      RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE) {
    if (!freshStagedInstallMatches(checkpointsRoot, replicaDbPath, marker,
      currentCreateAuthority)) {
      return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
        detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
      });
    }
  } else if (readInstallIdFromDb(stagingPath(checkpointsRoot)) !==
      marker.installId) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.LEGACY_STAGING_NONCE_MISMATCH,
    });
  }
  swapStagingIntoReplica(checkpointsRoot, replicaDbPath);
  writeMarker(checkpointsRoot, markerValue(
    STATE.INSTALLED, marker.installId, marker.generationIndex, null,
    markerDetail(marker)));
  clearMarker(checkpointsRoot);
  return installResult(OUTCOME.INSTALLED, {
    installId: marker.installId,
    generationIndex: marker.generationIndex,
  });
}

function resolveStagingMarker(options, checkpointsRoot, marker) {
  if (markerKind(marker) ===
      RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE) {
    return options.currentCreateAuthority ? recoverFreshStaging({...options,
      checkpointsRoot}, marker, options.currentCreateAuthority) :
      installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
        detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
      });
  }
  if (!stagingBelongsToMarker(checkpointsRoot, marker)) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
    });
  }
  removeStaging(checkpointsRoot);
  clearMarker(checkpointsRoot);
  return installResult(OUTCOME.NO_INSTALL, {detail: 'staging_discarded'});
}

/**
 * Resolve any pending install remnant at the boot boundary (idempotent,
 * crash-safe). Called by the PartitionService init path BEFORE the replica
 * database is opened; the worker path never runs this and install requests
 * for worker replicas are refused upstream.
 * @param {Object} options boot-boundary context
 * @param {string} options.replicaDbPath replica database file path
 * @param {string} [options.checkpointsRoot] override (defaults to the
 *   deterministic replica layout)
 * @return {Object} typed resolution outcome
 */
function resolvePendingSnapshotInstall(options) {
  const {replicaDbPath} = options;
  const checkpointsRoot = options.checkpointsRoot ||
    resolveReplicaCheckpointsRoot(replicaDbPath);
  if (!fs.existsSync(markerPath(checkpointsRoot))) {
    return installResult(OUTCOME.NO_INSTALL);
  }
  const marker = readMarker(checkpointsRoot);
  if (marker.state === STATE.STAGING) {
    return resolveStagingMarker(options, checkpointsRoot, marker);
  }
  if (marker.state === STATE.STAGED) {
    return resolveStagedMarker(checkpointsRoot, replicaDbPath, marker,
      options.currentCreateAuthority || null);
  }
  if (marker.state === STATE.INSTALLED) {
    if (readInstallIdFromDb(replicaDbPath) === marker.installId ||
        raftRsInstalledImageMatches(checkpointsRoot, replicaDbPath, marker) &&
        (markerKind(marker) !==
          RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE ||
        stagedInstallBindingMatches(replicaDbPath, marker))) {
      clearMarker(checkpointsRoot);
      return installResult(OUTCOME.INSTALLED, {
        installId: marker.installId,
        generationIndex: marker.generationIndex,
      });
    }
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: 'installed_marker_nonce_mismatch',
    });
  }
  return installResult(OUTCOME.REJECTED, {
    reason: marker.rejectionReason,
    detail: 'prior_rejection_retained',
  });
}

async function recoverPendingSnapshotInstall(options) {
  const owner = options.createAdmissionOwner;
  const claim = options.createPhysicalWorkerClaim;
  if (!owner || typeof owner.commitSnapshotInstall !== 'function' ||
      !claim) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
    });
  }
  let resolution = null;
  let invoked = false;
  const authorized = await owner.commitSnapshotInstall(claim,
    (authority) => {
      invoked = true;
      resolution = resolvePendingSnapshotInstall({...options,
        currentCreateAuthority: authority});
      return true;
    });
  return authorized && invoked ? resolution :
    installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH,
    });
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
