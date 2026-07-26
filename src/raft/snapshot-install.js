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
  exactKeys,
  fsyncDirectory,
  readCanonicalJson,
  sha256Digest,
  writeAtomicDurable,
} from '../runtime/oci-host-agent-durable-files.js';

import {SQLiteLogAdapter} from './sqlite-log-adapter.js';
import {SQLITE_RAFT_STATE_KEY} from './sqlite-log-adapter-callback-api.js';
import {
  RAFT_CHECKPOINT_APPLIED_STATE_KEY,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from './snapshot-checkpoint-constants.js';
import {readCheckpoint} from './snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_MARKER_FIELDS,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
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
  if (!exactKeys(marker, RAFT_SNAPSHOT_INSTALL_MARKER_FIELDS)) {
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

function markerValue(state, installId, generationIndex, rejectionReason) {
  return Object.freeze({
    state,
    installId,
    generationIndex,
    rejectionReason: rejectionReason || RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
  });
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

function rejectInstall(checkpointsRoot, marker, reason) {
  writeMarker(checkpointsRoot, markerValue(
    STATE.REJECTED, marker.installId, marker.generationIndex, reason));
  removeStaging(checkpointsRoot);
  return installResult(OUTCOME.REJECTED, {reason});
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
  const marker = markerValue(STATE.STAGING, installId, generationIndex);
  if (validation.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID) {
    const identityOutcomes = [
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_CLUSTER,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_GROUP,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_ENTITY,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.STALE_EPOCH,
    ];
    const reason = identityOutcomes.includes(validation.outcome) ?
      REJECTION.IDENTITY_MISMATCH : REJECTION.CHECKPOINT_INVALID;
    writeMarker(checkpointsRoot, markerValue(
      STATE.REJECTED, installId, generationIndex, reason));
    return installResult(OUTCOME.REJECTED, {
      reason,
      validationOutcome: validation.outcome,
    });
  }
  writeMarker(checkpointsRoot, marker);
  const localElection = readLocalDurableElectionState(replicaDbPath);
  removeStaging(checkpointsRoot);
  fs.copyFileSync(
    path.join(checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE),
    stagingPath(checkpointsRoot),
  );
  const stagedBytes = fs.readFileSync(stagingPath(checkpointsRoot));
  if (sha256Digest(stagedBytes) !== validation.descriptor.payloadDigest) {
    return rejectInstall(
      checkpointsRoot, marker, REJECTION.STAGING_DIGEST_MISMATCH);
  }
  const stagingDb = new Database(stagingPath(checkpointsRoot));
  try {
    reconstructStagedRaftState(stagingDb, {
      lastIncludedIndex: validation.descriptor.lastIncludedIndex,
      lastIncludedTerm: validation.descriptor.lastIncludedTerm,
      maxCommittedHlc: validation.descriptor.maxCommittedHlc,
      installId,
      localElection,
    });
  } finally {
    stagingDb.close();
  }
  writeMarker(checkpointsRoot, markerValue(
    STATE.STAGED, installId, generationIndex));
  swapStagingIntoReplica(checkpointsRoot, replicaDbPath);
  writeMarker(checkpointsRoot, markerValue(
    STATE.INSTALLED, installId, generationIndex));
  clearMarker(checkpointsRoot);
  return installResult(OUTCOME.INSTALLED, {installId, generationIndex});
}

// The staged-marker nonce decision procedure (design: healing is decided by
// the install nonce, never by boundary keys).
function resolveStagedMarker(checkpointsRoot, replicaDbPath, marker) {
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
    return rejectInstall(checkpointsRoot, marker, REJECTION.STAGING_LOST);
  }
  swapStagingIntoReplica(checkpointsRoot, replicaDbPath);
  writeMarker(checkpointsRoot, markerValue(
    STATE.INSTALLED, marker.installId, marker.generationIndex));
  clearMarker(checkpointsRoot);
  return installResult(OUTCOME.INSTALLED, {
    installId: marker.installId,
    generationIndex: marker.generationIndex,
  });
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
    removeStaging(checkpointsRoot);
    clearMarker(checkpointsRoot);
    return installResult(OUTCOME.NO_INSTALL, {detail: 'staging_discarded'});
  }
  if (marker.state === STATE.STAGED) {
    return resolveStagedMarker(checkpointsRoot, replicaDbPath, marker);
  }
  if (marker.state === STATE.INSTALLED) {
    if (readInstallIdFromDb(replicaDbPath) === marker.installId) {
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

export {
  requestSnapshotInstall,
  resolveDurableElectionRule,
  resolvePendingSnapshotInstall,
};
