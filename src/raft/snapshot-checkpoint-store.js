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

import {SQLITE_RAFT_STATE_KEY} from './sqlite-log-adapter-callback-api.js';
import {
  RAFT_CHECKPOINT_APPLIED_STATE_KEY,
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_EXCLUDED_TABLES,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES,
  RAFT_CHECKPOINT_PAYLOAD_VERSION,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from './snapshot-checkpoint-constants.js';
import {
  buildCheckpointDescriptor,
  checkpointResult,
  matchCheckpointIdentity,
  validateCheckpointDescriptor,
} from './snapshot-checkpoint-format.js';

const CREATION = RAFT_CHECKPOINT_CREATION_OUTCOME;
const VALIDATION = RAFT_CHECKPOINT_VALIDATION_OUTCOME;
const STAGING_PREFIX = '.staging-';
const STAGING_RANDOM_BYTES = 8;
const SELECT_STATE_VALUE = 'SELECT value FROM _raft_state WHERE key = ?';
const SELECT_LOG_TERM = 'SELECT term FROM _raft_log WHERE log_index = ?';
const DROP_TABLE_PREFIX = 'DROP TABLE IF EXISTS ';
const VACUUM_SQL = 'VACUUM';
const DECIMAL_RADIX = 10;
const EMPTY_LOG_INDEX = 0;
// CL-042 discipline: an empty log's last-log-term is 0.
const EMPTY_LOG_TERM = 0;

function creationResult(outcome, reasons = [], extra = {}) {
  return Object.freeze({
    outcome,
    reasons: Object.freeze([...reasons]),
    ...extra,
  });
}

function readStateInteger(copyDb, key) {
  const row = copyDb.prepare(SELECT_STATE_VALUE).get(key);
  if (!row) return {present: false, value: EMPTY_LOG_INDEX};
  const value = Number.parseInt(row.value, DECIMAL_RADIX);
  return {present: Number.isSafeInteger(value), value};
}

// Read both watermarks from the backup COPY itself so the sealed metadata is
// exact for the copied image. Legacy-tolerant on the committed key.
function readCopyWatermarks(copyDb) {
  const committed = readStateInteger(
    copyDb, SQLITE_RAFT_STATE_KEY.COMMITTED_INDEX);
  const legacy = readStateInteger(
    copyDb, SQLITE_RAFT_STATE_KEY.LEGACY_COMMIT_INDEX);
  const applied = readStateInteger(
    copyDb, RAFT_CHECKPOINT_APPLIED_STATE_KEY.LAST_APPLIED_INDEX);
  const directApply = copyDb.prepare(SELECT_STATE_VALUE).get(
    RAFT_CHECKPOINT_APPLIED_STATE_KEY.DIRECT_APPLY_MARKER);
  const appliedGap = copyDb.prepare(SELECT_STATE_VALUE).get(
    RAFT_CHECKPOINT_APPLIED_STATE_KEY.APPLIED_GAP_MARKER);
  return {
    committedIndex: committed.present ? committed.value : legacy.value,
    appliedIndex: applied.value,
    appliedPresent: applied.present,
    directApplyMarked: Boolean(directApply),
    appliedGapMarked: Boolean(appliedGap),
  };
}

// The applied-watermark gate (fail-closed): creation refuses any image whose
// applied prefix is not exactly certified by its committed watermark. Rows
// are ordered; the first failing row names the canonical reason.
const WATERMARK_GATE_RULES = Object.freeze([
  Object.freeze({
    reason: 'direct_apply_marker',
    holds: (w) => !w.directApplyMarked,
  }),
  Object.freeze({
    reason: 'applied_gap_marker',
    holds: (w) => !w.appliedGapMarked,
  }),
  Object.freeze({
    reason: 'applied_watermark_absent',
    holds: (w) => w.appliedPresent,
  }),
  Object.freeze({
    reason: 'applied_committed_mismatch',
    holds: (w) => w.appliedIndex === w.committedIndex,
  }),
]);

function evaluateWatermarkGate(watermarks) {
  const failed = WATERMARK_GATE_RULES.find((rule) => !rule.holds(watermarks));
  return failed ?
    creationResult(CREATION.APPLY_WATERMARK_DIVERGENCE, [failed.reason]) :
    creationResult(CREATION.CREATED);
}

function readLastIncludedTerm(copyDb, lastIncludedIndex) {
  if (lastIncludedIndex === EMPTY_LOG_INDEX) {
    return {found: true, term: EMPTY_LOG_TERM};
  }
  const row = copyDb.prepare(SELECT_LOG_TERM).get(lastIncludedIndex);
  return row ?
    {found: true, term: row.term} :
    {found: false, term: EMPTY_LOG_TERM};
}

function scrubCopy(copyDb) {
  for (const table of RAFT_CHECKPOINT_EXCLUDED_TABLES) {
    copyDb.exec(`${DROP_TABLE_PREFIX}${table}`);
  }
  copyDb.exec(VACUUM_SQL);
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

/**
 * Create one sealed checkpoint generation from a live file-backed SQLite
 * partition database. Fail-closed: memory-backed databases and images whose
 * applied watermark diverges from the committed watermark are typed
 * rejections, never checkpoints.
 * @param {Object} options creation options
 * @param {Database} options.db live better-sqlite3 handle (source)
 * @param {Object} options.identity creating owner identity
 *   ({clusterId, raftGroupId, entity: {kind, id}, membershipEpoch})
 * @param {string} options.checkpointsRoot durable checkpoint root directory
 * @return {Promise<Object>} typed creation result
 */
async function createSqliteStateMachineCheckpoint(options) {
  const {db, identity, checkpointsRoot} = options;
  if (!db || db.memory || !db.open) {
    return creationResult(CREATION.UNSUPPORTED_ADAPTER, ['memory_backed_db']);
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
    let watermarks;
    let gate;
    let lastIncluded;
    try {
      watermarks = readCopyWatermarks(copyDb);
      gate = evaluateWatermarkGate(watermarks);
      if (gate.outcome === CREATION.CREATED) {
        lastIncluded = readLastIncludedTerm(copyDb, watermarks.committedIndex);
        if (!lastIncluded.found) {
          gate = creationResult(
            CREATION.APPLY_WATERMARK_DIVERGENCE, ['missing_log_entry']);
        } else {
          scrubCopy(copyDb);
        }
      }
    } finally {
      copyDb.close();
    }
    if (gate.outcome !== CREATION.CREATED) {
      return gate;
    }
    for (const sidecar of sidecarPaths(stagingPayload)) {
      fs.rmSync(sidecar, {force: true});
    }
    fsyncFile(stagingPayload);
    const payloadBytes = fs.readFileSync(stagingPayload);
    const descriptor = buildCheckpointDescriptor({
      clusterId: identity.clusterId,
      raftGroupId: identity.raftGroupId,
      entity: identity.entity,
      membershipEpoch: identity.membershipEpoch,
      lastIncludedIndex: watermarks.committedIndex,
      lastIncludedTerm: lastIncluded.term,
      payloadKind: RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE,
      payloadVersion: RAFT_CHECKPOINT_PAYLOAD_VERSION[
        RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE],
      payloadByteLength: payloadBytes.length,
      payloadDigest: sha256Digest(payloadBytes),
    });
    const generationDir = path.join(
      checkpointsRoot, String(watermarks.committedIndex));
    ensureDirectory(generationDir);
    const finalPayload = path.join(generationDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
    fs.renameSync(stagingPayload, finalPayload);
    fsyncDirectory(generationDir);
    writeAtomicDurable(
      path.join(generationDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE), descriptor);
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

/**
 * List sealed checkpoint generations (ascending lastIncludedIndex) under a
 * checkpoint root. Staging and non-generation entries are ignored.
 * @param {string} checkpointsRoot durable checkpoint root directory
 * @return {number[]} ascending generation indices
 */
function listCheckpointGenerations(checkpointsRoot) {
  if (!fs.existsSync(checkpointsRoot)) {
    return [];
  }
  return fs.readdirSync(checkpointsRoot, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      index: Number.parseInt(entry.name, DECIMAL_RADIX),
    }))
    .filter(({name, index}) => Number.isSafeInteger(index) && index >= 0 &&
      name === String(index))
    .map(({index}) => index)
    .sort((left, right) => left - right);
}

export {
  createSqliteStateMachineCheckpoint,
  listCheckpointGenerations,
  readCheckpoint,
};
