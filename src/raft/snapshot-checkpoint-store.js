// Raft snapshot checkpoint store: durable creation (backup-then-scrub),
// restart-read, and typed validation of sealed checkpoint generations (quest
// raft-snapshot-checkpoint-format, R1). One generation =
// {checkpointsRoot}/{lastIncludedIndex}/payload.db + checkpoint.json; the
// descriptor is written atomically AFTER the payload is durable, so it is the
// publication token. Envelope logic lives in snapshot-checkpoint-format.js.

import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

import Database from 'better-sqlite3';

import {
  ensureDirectory,
  fsyncDirectory,
  readCanonicalJson,
  sha256Digest,
  writeAtomicDurable,
} from '../runtime/oci-host-agent-durable-files.js';

import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES,
  RAFT_CHECKPOINT_PAYLOAD_VERSION,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
  RAFT_RS_CHECKPOINT_REASON,
} from './snapshot-checkpoint-constants.js';
import {
  buildCheckpointDescriptor,
  checkpointResult,
  matchCheckpointIdentity,
  validateCheckpointDescriptor,
} from './snapshot-checkpoint-format.js';
import {
  gatherRetentionPins,
  listCheckpointGenerations,
  sweepCheckpointGenerations,
} from './snapshot-retention.js';
import {RaftRsDurableStore} from './raft-rs-durable-store.js';
import {readRaftRsPeerIdentityReservations} from
  './raft-rs-peer-identity.js';
import {
  computeRaftRsMaxCommittedHlc,
  hasPendingPreparedParticipantTransactions,
  scrubRaftRsCheckpointPayload,
  validateRaftRsPayloadTables,
} from './snapshot-application-content.js';

const CREATION = RAFT_CHECKPOINT_CREATION_OUTCOME;
const VALIDATION = RAFT_CHECKPOINT_VALIDATION_OUTCOME;
const STAGING_PREFIX = '.staging-';
const STAGING_RANDOM_BYTES = 8;
const NO_COMMITTED_HLC = '0';
const MAX_SAFE_EXACT = BigInt(Number.MAX_SAFE_INTEGER);

function creationResult(outcome, reasons = [], extra = {}) {
  return Object.freeze({
    outcome,
    reasons: Object.freeze([...reasons]),
    ...extra,
  });
}

function readRaftRsRecord(copyDb, groupId) {
  try {
    return RaftRsDurableStore.readDurableRecordIn(copyDb, groupId);
  } catch {
    return null;
  }
}

function readRaftRsReservations(copyDb) {
  try {
    return readRaftRsPeerIdentityReservations(copyDb);
  } catch {
    return null;
  }
}

function validRaftRsProgress(record) {
  if (!record?.hardState) return false;
  const applied = BigInt(record.appliedIndex);
  const committed = BigInt(record.hardState.commit);
  const generation = BigInt(record.membershipGenerationIndex);
  return committed >= applied && generation <= applied &&
    applied <= MAX_SAFE_EXACT;
}

function raftRsBoundaryTerm(record) {
  const applied = BigInt(record.appliedIndex);
  const boundaryEntry = record.entries.find(
    ({index}) => BigInt(index) === applied);
  return boundaryEntry?.term ??
    (record.snapshot?.metadata?.index === record.appliedIndex ?
      record.snapshot.metadata.term : null);
}

function reservationsCoverConfState(record, peerReservations) {
  const reservedPeers = new Set(peerReservations.map(({peerId}) => peerId));
  const configuredPeers = [record.confState.voters, record.confState.learners,
    record.confState.votersOutgoing, record.confState.learnersNext].flat();
  return configuredPeers.every((peerId) => reservedPeers.has(String(peerId)));
}

function readRaftRsCheckpoint(copyDb, groupId) {
  const record = readRaftRsRecord(copyDb, groupId);
  if (!validRaftRsProgress(record)) return null;
  const boundaryTerm = raftRsBoundaryTerm(record);
  if (boundaryTerm === null || BigInt(boundaryTerm) > MAX_SAFE_EXACT) return null;
  const peerReservations = readRaftRsReservations(copyDb);
  if (!peerReservations ||
      !reservationsCoverConfState(record, peerReservations)) return null;
  return {
    groupId,
    appliedIndex: record.appliedIndex,
    appliedTerm: String(boundaryTerm),
    membershipGenerationIndex: record.membershipGenerationIndex,
    confState: record.confState,
    peerReservations,
  };
}

function prepareRaftRsCheckpointCopy(copyDb, groupId, entity) {
  if (hasPendingPreparedParticipantTransactions(copyDb)) {
    return {gate: creationResult(CREATION.PREPARED_TRANSACTIONS_PENDING,
      [RAFT_RS_CHECKPOINT_REASON.PREPARED_TRANSACTIONS])};
  }
  const raftRsDescriptor = readRaftRsCheckpoint(copyDb, groupId);
  if (!raftRsDescriptor) {
    return {gate: creationResult(CREATION.APPLY_WATERMARK_DIVERGENCE,
      [RAFT_RS_CHECKPOINT_REASON.BOUNDARY])};
  }
  const maxCommittedHlc = computeRaftRsMaxCommittedHlc(copyDb, groupId);
  scrubRaftRsCheckpointPayload(copyDb, entity.kind, entity.id);
  return {
    gate: creationResult(CREATION.CREATED),
    watermarks: {committedIndex: Number(raftRsDescriptor.appliedIndex)},
    lastIncluded: {found: true, term: Number(raftRsDescriptor.appliedTerm)},
    maxCommittedHlc,
    raftRsDescriptor,
  };
}

function fsyncFile(file) {
  const descriptor = fs.openSync(file, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function sidecarPaths(payloadPath) {
  return RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES.map(
    (suffix) => `${payloadPath}${suffix}`);
}

function removeStagingDirectory(stagingDir) {
  fs.rmSync(stagingDir, {recursive: true, force: true});
}

function buildCreatedCheckpointDescriptor(identity, prepared, payloadBytes) {
  const payloadKind = RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE;
  return buildCheckpointDescriptor({
    clusterId: identity.clusterId,
    raftGroupId: identity.raftGroupId,
    entity: identity.entity,
    membershipEpoch: identity.membershipEpoch,
    lastIncludedIndex: prepared.watermarks.committedIndex,
    lastIncludedTerm: prepared.lastIncluded.term,
    maxCommittedHlc: prepared.maxCommittedHlc ?? NO_COMMITTED_HLC,
    payloadKind,
    payloadVersion: RAFT_CHECKPOINT_PAYLOAD_VERSION[payloadKind],
    payloadByteLength: payloadBytes.length,
    payloadDigest: sha256Digest(payloadBytes),
    raftRs: prepared.raftRsDescriptor,
  });
}

/**
 * Create one sealed raft-rs checkpoint generation from a live file-backed
 * SQLite replica database. Fail-closed: memory-backed databases, missing
 * `raftRsGroupId`, and images whose applied watermark diverges from the
 * committed watermark are typed rejections, never checkpoints.
 * @param {Object} options creation options
 * @param {Database} options.db live better-sqlite3 handle (source)
 * @param {Object} options.identity creating owner identity
 *   ({clusterId, raftGroupId, entity: {kind, id}, membershipEpoch})
 * @param {string} options.checkpointsRoot durable checkpoint root directory
 * @param {string} options.raftRsGroupId canonical raft-rs group identifier
 * @param {number[]} [options.inProcessPins] in-process retention pins (the
 *   S4 dispatcher's in-flight generation indexes) honored by the
 *   opportunistic post-creation sweep
 * @return {Promise<Object>} typed creation result
 */
async function createSqliteStateMachineCheckpoint(options) {
  const {db, identity, checkpointsRoot, raftRsGroupId} = options;
  if (!db || db.memory || !db.open) {
    return creationResult(CREATION.UNSUPPORTED_ADAPTER, ['memory_backed_db']);
  }
  if (typeof raftRsGroupId !== 'string' || raftRsGroupId.trim().length === 0) {
    return creationResult(CREATION.UNSUPPORTED_ADAPTER,
      [RAFT_RS_CHECKPOINT_REASON.PAYLOAD_KIND_REQUIRED]);
  }
  if (db.inTransaction) {
    return creationResult(CREATION.PREPARED_TRANSACTIONS_PENDING,
      [RAFT_RS_CHECKPOINT_REASON.LOCAL_TRANSACTION_OPEN]);
  }
  ensureDirectory(checkpointsRoot);
  const stagingDir = path.join(
    checkpointsRoot,
    `${STAGING_PREFIX}${randomBytes(STAGING_RANDOM_BYTES).toString('hex')}`,
  );
  ensureDirectory(stagingDir);
  const stagingPayload = path.join(stagingDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
  try {
    await db.backup(stagingPayload);
    const copyDb = new Database(stagingPayload);
    let prepared;
    try {
      prepared = prepareRaftRsCheckpointCopy(
        copyDb, raftRsGroupId, identity.entity);
    } finally {
      copyDb.close();
    }
    const {gate, watermarks} = prepared;
    if (gate.outcome !== CREATION.CREATED) {
      return gate;
    }
    for (const sidecar of sidecarPaths(stagingPayload)) {
      fs.rmSync(sidecar, {force: true});
    }
    fsyncFile(stagingPayload);
    const descriptor = buildCreatedCheckpointDescriptor(
      identity, prepared, fs.readFileSync(stagingPayload));
    const stagedDescriptor = path.join(stagingDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE);
    writeAtomicDurable(stagedDescriptor, descriptor);
    const validation = readCheckpoint({checkpointDir: stagingDir});
    if (validation.outcome !== VALIDATION.VALID) {
      return creationResult(CREATION.IMAGE_REJECTED, validation.reasons, {validation});
    }
    const generationDir = path.join(
      checkpointsRoot, String(watermarks.committedIndex));
    ensureDirectory(generationDir);
    const finalPayload = path.join(generationDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
    fs.renameSync(stagingPayload, finalPayload);
    fsyncDirectory(generationDir);
    fs.renameSync(stagedDescriptor, path.join(generationDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE));
    fsyncDirectory(generationDir);
    // Opportunistic bounded-retention sweep (S5): the one production-adjacent
    // moment S1 owns. The full pin set travels on EVERY invocation — durable
    // install/transfer markers plus the caller's in-process pins — and the
    // just-created generation is the newest complete one, so it survives.
    sweepCheckpointGenerations({
      checkpointsRoot,
      pinnedGenerationIndexes: gatherRetentionPins({
        checkpointsRoot,
        inProcessPins: options.inProcessPins,
      }),
    });
    return creationResult(CREATION.CREATED, [], {
      checkpointDir: generationDir,
      descriptor,
    });
  } finally {
    removeStagingDirectory(stagingDir);
  }
}

function readDescriptorFile(descriptorPath) {
  try {
    return {value: readCanonicalJson(descriptorPath, VALIDATION.CORRUPT_DESCRIPTOR)};
  } catch (error) {
    return {error};
  }
}

function validatePayloadAgainstDescriptor(checkpointDir, descriptor) {
  const payloadPath = path.join(checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
  if (!fs.existsSync(payloadPath)) {
    return checkpointResult(VALIDATION.PARTIAL, ['payload_missing']);
  }
  const staleSidecars = sidecarPaths(payloadPath)
    .filter((sidecar) => fs.existsSync(sidecar));
  if (staleSidecars.length > 0) {
    return checkpointResult(VALIDATION.CORRUPT_PAYLOAD, ['stale_sidecar']);
  }
  const payloadBytes = fs.readFileSync(payloadPath);
  if (payloadBytes.length !== descriptor.payloadByteLength) {
    return checkpointResult(VALIDATION.CORRUPT_PAYLOAD, ['byte_length']);
  }
  if (sha256Digest(payloadBytes) !== descriptor.payloadDigest) {
    return checkpointResult(VALIDATION.CORRUPT_PAYLOAD, ['digest']);
  }
  if (descriptor.payloadKind ===
      RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE) {
    const payloadDb = new Database(payloadPath, {readonly: true});
    try {
      let reservations;
      try {
        reservations = readRaftRsPeerIdentityReservations(payloadDb);
      } catch {
        return checkpointResult(VALIDATION.CORRUPT_PAYLOAD,
          [RAFT_RS_CHECKPOINT_REASON.PEER_RESERVATIONS]);
      }
      const described = descriptor.raftRs.peerReservations;
      if (reservations.length !== described.length || reservations.some(
        (reservation, index) =>
          reservation.replicaIdentity !== described[index].replicaIdentity ||
          reservation.peerId !== described[index].peerId ||
          reservation.nodeId !== described[index].nodeId ||
          reservation.learnerAdmission !== described[index].learnerAdmission)) {
        return checkpointResult(VALIDATION.CORRUPT_PAYLOAD,
          [RAFT_RS_CHECKPOINT_REASON.PEER_RESERVATIONS]);
      }
      if (!validateRaftRsPayloadTables(payloadDb, descriptor)) {
        return checkpointResult(VALIDATION.CORRUPT_PAYLOAD,
          [RAFT_RS_CHECKPOINT_REASON.PAYLOAD_TABLES]);
      }
    } finally {
      payloadDb.close();
    }
  }
  return checkpointResult(VALIDATION.VALID);
}

/**
 * Read and validate one sealed checkpoint generation from disk (restart-safe:
 * no in-process state is consulted). The full chain is partial → corrupt
 * descriptor → unsupported → corrupt payload → identity, and any failure is a
 * typed non-progress outcome.
 * @param {Object} options read options
 * @param {string} options.checkpointDir one generation directory
 * @param {Object} [options.expectedIdentity] receiver identity to enforce
 * @return {Object} typed validation result ({outcome, reasons, descriptor?})
 */
function readCheckpoint(options) {
  const {checkpointDir, expectedIdentity} = options;
  const descriptorPath = path.join(
    checkpointDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE);
  if (!fs.existsSync(descriptorPath)) {
    return checkpointResult(VALIDATION.PARTIAL, ['descriptor_missing']);
  }
  const parsed = readDescriptorFile(descriptorPath);
  if (parsed.error) {
    return checkpointResult(VALIDATION.CORRUPT_DESCRIPTOR, ['descriptor_bytes']);
  }
  const structural = validateCheckpointDescriptor(parsed.value);
  if (structural.outcome !== VALIDATION.VALID) {
    return structural;
  }
  const payload = validatePayloadAgainstDescriptor(checkpointDir, parsed.value);
  if (payload.outcome !== VALIDATION.VALID) {
    return payload;
  }
  if (expectedIdentity) {
    const identity = matchCheckpointIdentity(parsed.value, expectedIdentity);
    if (identity.outcome !== VALIDATION.VALID) {
      return identity;
    }
  }
  return Object.freeze({
    outcome: VALIDATION.VALID,
    reasons: Object.freeze([]),
    descriptor: parsed.value,
  });
}

// listCheckpointGenerations moved to snapshot-retention.js (S5, which owns
// generation lifecycle); re-exported here so existing consumers keep their
// import site.
export {
  createSqliteStateMachineCheckpoint,
  listCheckpointGenerations,
  readCheckpoint,
};
