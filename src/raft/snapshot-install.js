// Raft snapshot atomic install (quest raft-snapshot-atomic-install, R3).
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import Database from 'better-sqlite3';
import {ENTITY_TYPE} from '../constants/addresses.js';
import {ensureDirectory, exactKeys, fsyncDirectory, readCanonicalJson,
  sha256Digest, writeAtomicDurable} from
  '../runtime/oci-host-agent-durable-files.js';
import {SQLiteLogAdapter} from './sqlite-log-adapter.js';
import {SQLITE_RAFT_STATE_KEY} from './sqlite-raft-state-constants.js';
import {RAFT_CHECKPOINT_APPLIED_STATE_KEY, RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_KIND, RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES,
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
import {RAFT_SNAPSHOT_BOUNDARY_STATE_KEY, RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_DETAIL, RAFT_SNAPSHOT_INSTALL_ARTIFACT_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_LEGACY_MARKER_FIELDS,
  RAFT_SNAPSHOT_INSTALL_MARKER_FIELDS, RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_MARKER_KIND, RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
  RAFT_SNAPSHOT_INSTALL_OUTCOME, RAFT_SNAPSHOT_INSTALL_REJECTION,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE, RAFT_SNAPSHOT_INSTALL_STATE} from
  './snapshot-install-constants.js';

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

function installResult(outcome, detail = {}) {
  return Object.freeze({outcome, ...detail});
}

function resolveReplicaCheckpointsRoot(replicaDbPath) {
  return path.join(path.dirname(replicaDbPath), CHECKPOINTS_DIRNAME,
    path.basename(replicaDbPath, DB_EXTENSION));
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
    throw Object.assign(new Error(MARKER_ERROR_CODE), {code: MARKER_ERROR_CODE});
  }
  if (Object.hasOwn(marker, MARKER_KIND_FIELD) &&
      !INSTALL_MARKER_KINDS.has(marker.kind)) {
    throw Object.assign(new Error(MARKER_ERROR_CODE), {code: MARKER_ERROR_CODE});
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
    state, installId, generationIndex,
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

function writeStagedInstallBinding(db, marker) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${INSTALL_BINDING_TABLE} (
    install_id TEXT PRIMARY KEY, create_authority TEXT NOT NULL)`);
  db.prepare(`INSERT INTO ${INSTALL_BINDING_TABLE}
    (install_id, create_authority) VALUES (?, ?)`)
    .run(marker.installId, JSON.stringify(marker.createAuthority));
}

function isRaftRsBoundMarker(marker) {
  const kind = markerKind(marker);
  return kind === RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE ||
    kind === RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FOLLOWER_CATCHUP;
}

function stagedInstallBindingMatches(file, marker) {
  if (!fs.existsSync(file)) return false;
  const db = new Database(file, {readonly: true});
  try {
    const row = db.prepare(`SELECT create_authority FROM
      ${INSTALL_BINDING_TABLE} WHERE install_id = ?`).get(marker.installId);
    if (markerKind(marker) ===
        RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FOLLOWER_CATCHUP) {
      return Boolean(row) &&
        row.create_authority === JSON.stringify(marker.createAuthority);
    }
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

function stagingBelongsToMarker(checkpointsRoot, marker) {
  const staged = stagingPath(checkpointsRoot);
  if (!fs.existsSync(staged)) return true;
  return isRaftRsBoundMarker(marker) ?
    stagedInstallBindingMatches(staged, marker) :
    !stagingHasInstallBinding(staged);
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
  const {checkpointsRoot, replicaId, replicaCreatedAt, attemptToken} = options;
  if (!fs.existsSync(markerPath(checkpointsRoot))) {
    return Object.freeze({allAbsent: !fs.existsSync(stagingPath(checkpointsRoot)),
      outcomes: Object.freeze([])});
  }
  const marker = readMarker(checkpointsRoot);
  if (!markerMatchesCleanupGeneration(marker, {replicaId, replicaCreatedAt,
    attemptToken}) || !stagingBelongsToMarker(checkpointsRoot, marker)) {
    return Object.freeze({allAbsent: false,
      outcomes: Object.freeze([{artifactPath: markerPath(checkpointsRoot),
        outcome: RAFT_SNAPSHOT_INSTALL_DETAIL.GENERATION_MISMATCH}])});
  }
  return Object.freeze({allAbsent: false, owned: true, outcomes: Object.freeze([])});
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
  for (const suffix of RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES) {
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
  const db = new Database(replicaDbPath, {readonly: true});
  try {
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
        reservation.learnerAdmission === expected.peerReservations[index].learnerAdmission);
  } catch {
    return false;
  } finally {
    db.close();
  }
}

function rejectInstall(checkpointsRoot, marker, reason) {
  if (!stagingBelongsToMarker(checkpointsRoot, marker)) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH});
  }
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
  return markerValue(STATE.STAGING, installId, generationIndex, null, {
    kind: RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE,
    createAuthority, preInstallDigest: fileDigest(replicaDbPath)});
}

function buildFollowerCatchupMarker(options, descriptor, installId,
  generationIndex, replicaDbPath) {
  return markerValue(STATE.STAGING, installId, generationIndex, null, {
    kind: RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FOLLOWER_CATCHUP,
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

function swapPreparedInstall(checkpointsRoot, replicaDbPath, marker,
  raftRsImage, authority = null) {
  if (raftRsImage) {
    const valid = markerKind(marker) ===
        RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FOLLOWER_CATCHUP ?
      followerCatchupStagedInstallMatches(checkpointsRoot, replicaDbPath, marker) :
      freshStagedInstallMatches(checkpointsRoot, replicaDbPath, marker, authority);
    if (!valid) return false;
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
    options.checkpointsRoot, options.replicaDbPath, marker, raftRsImage, authority);
  const freshCreate = raftRsImage &&
    markerKind(marker) === RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE;
  return freshCreate ? options.createAdmissionOwner.commitSnapshotInstall(
    options.createPhysicalWorkerClaim, swap, options.createAdmissionBasis) : swap();
}

const MEMORY_DB_PATH = ':memory:';

function rejectInvalidCheckpoint(
  checkpointsRoot, installId, generationIndex, validationOutcome) {
  const identityOutcomes = [
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_CLUSTER,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_GROUP,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_ENTITY,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.STALE_EPOCH,
  ];
  const reason = identityOutcomes.includes(validationOutcome) ?
    REJECTION.IDENTITY_MISMATCH : REJECTION.CHECKPOINT_INVALID;
  writeMarker(checkpointsRoot, markerValue(
    STATE.REJECTED, installId, generationIndex, reason));
  return installResult(OUTCOME.REJECTED, {reason, validationOutcome});
}

async function prepareInstallAdmissionAndMarker(
  options, descriptor, installId, generationIndex, raftRsImage, followerCatchup) {
  if (!raftRsImage) {
    return {ok: true, marker: markerValue(STATE.STAGING, installId, generationIndex)};
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
    buildFollowerCatchupMarker(options, descriptor, installId, generationIndex,
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
    writeStagedInstallBinding(stagingDb, marker);
    return;
  }
  reconstructStagedRaftState(stagingDb, {
    lastIncludedIndex: descriptor.lastIncludedIndex,
    lastIncludedTerm: descriptor.lastIncludedTerm,
    maxCommittedHlc: descriptor.maxCommittedHlc,
    installId, localElection,
  });
}

async function requestSnapshotInstall(options) {
  const {replicaDbPath, checkpointsRoot, generationIndex, expectedIdentity} = options;
  if (replicaDbPath === MEMORY_DB_PATH) {
    return installResult(OUTCOME.REJECTED, {
      reason: REJECTION.WORKER_PATH_UNSUPPORTED});
  }
  const checkpointDir = path.join(checkpointsRoot, String(generationIndex));
  const validation = readCheckpoint({checkpointDir, expectedIdentity});
  const installId = randomBytes(INSTALL_ID_BYTES).toString('hex');
  if (validation.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID) {
    return rejectInvalidCheckpoint(
      checkpointsRoot, installId, generationIndex, validation.outcome);
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
    return rejectInstall(checkpointsRoot, marker,
      REJECTION.CREATE_GENERATION_MISMATCH);
  }
  clearMarker(checkpointsRoot);
  return installResult(OUTCOME.INSTALLED, {installId, generationIndex});
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
  if (markerKind(marker) ===
      RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FRESH_CREATE) {
    return freshStagedInstallMatches(
      checkpointsRoot, replicaDbPath, marker, currentCreateAuthority) ? null :
      RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH;
  }
  if (markerKind(marker) ===
      RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FOLLOWER_CATCHUP) {
    return followerCatchupStagedInstallMatches(
      checkpointsRoot, replicaDbPath, marker) ? null :
      RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH;
  }
  return readInstallIdFromDb(stagingPath(checkpointsRoot)) === marker.installId ?
    null : RAFT_SNAPSHOT_INSTALL_DETAIL.LEGACY_STAGING_NONCE_MISMATCH;
}

function resolveStagedMarker(checkpointsRoot, replicaDbPath, marker,
  currentCreateAuthority = null) {
  const mainInstallId = readInstallIdFromDb(replicaDbPath);
  const stagingPresent = fs.existsSync(stagingPath(checkpointsRoot));
  if (mainInstallId === marker.installId) {
    if (stagingPresent) {
      return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
        detail: 'nonce_matches_with_staging_present'});
    }
    clearMarker(checkpointsRoot);
    return installResult(OUTCOME.INSTALLED, {
      installId: marker.installId, generationIndex: marker.generationIndex});
  }
  if (!stagingPresent) {
    if (raftRsInstalledImageMatches(checkpointsRoot, replicaDbPath, marker) &&
        (!isRaftRsBoundMarker(marker) ||
        stagedInstallBindingMatches(replicaDbPath, marker))) {
      clearMarker(checkpointsRoot);
      return installResult(OUTCOME.INSTALLED, {
        installId: marker.installId, generationIndex: marker.generationIndex});
    }
    return rejectInstall(checkpointsRoot, marker, REJECTION.STAGING_LOST);
  }
  const conflictDetail = validateStagedMarkerTarget(
    checkpointsRoot, replicaDbPath, marker, currentCreateAuthority);
  if (conflictDetail !== null) {
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {detail: conflictDetail});
  }
  swapStagingIntoReplica(checkpointsRoot, replicaDbPath);
  writeMarker(checkpointsRoot, markerValue(STATE.INSTALLED, marker.installId,
    marker.generationIndex, null, markerDetail(marker)));
  clearMarker(checkpointsRoot);
  return installResult(OUTCOME.INSTALLED, {
    installId: marker.installId, generationIndex: marker.generationIndex});
}

function resolvePendingSnapshotInstall(options) {
  const {replicaDbPath} = options;
  const checkpointsRoot = options.checkpointsRoot ||
    resolveReplicaCheckpointsRoot(replicaDbPath);
  if (!fs.existsSync(markerPath(checkpointsRoot))) {
    return installResult(OUTCOME.NO_INSTALL);
  }
  const marker = readMarker(checkpointsRoot);
  if (marker.state === STATE.STAGING) {
    if (!stagingBelongsToMarker(checkpointsRoot, marker)) {
      return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
        detail: RAFT_SNAPSHOT_INSTALL_DETAIL.STAGED_CREATE_GENERATION_MISMATCH});
    }
    removeStaging(checkpointsRoot);
    clearMarker(checkpointsRoot);
    return installResult(OUTCOME.NO_INSTALL, {detail: 'staging_discarded'});
  }
  if (marker.state === STATE.STAGED) {
    return resolveStagedMarker(checkpointsRoot, replicaDbPath, marker,
      options.currentCreateAuthority || null);
  }
  if (marker.state === STATE.INSTALLED) {
    if (readInstallIdFromDb(replicaDbPath) === marker.installId ||
        raftRsInstalledImageMatches(checkpointsRoot, replicaDbPath, marker) &&
        (!isRaftRsBoundMarker(marker) ||
        stagedInstallBindingMatches(replicaDbPath, marker))) {
      clearMarker(checkpointsRoot);
      return installResult(OUTCOME.INSTALLED, {
        installId: marker.installId, generationIndex: marker.generationIndex});
    }
    return installResult(OUTCOME.INSTALL_STATE_CONFLICT, {
      detail: 'installed_marker_nonce_mismatch'});
  }
  return installResult(OUTCOME.REJECTED, {
    reason: marker.rejectionReason, detail: 'prior_rejection_retained'});
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
      currentCreateAuthority: authority});
    return true;
  });
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
