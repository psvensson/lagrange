// Install-local identity, immutable image observation and generation cleanup.
// No runtime/CREATE authority is minted here; callers supply their owner facts.
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {canonicalJsonBytes, sha256Digest} from '../runtime/oci-host-agent-durable-files.js';
import {RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_SNAPSHOT_INSTALL_ARTIFACT_OUTCOME as ARTIFACT,
  RAFT_SNAPSHOT_INSTALL_DETAIL as DETAIL,
  RAFT_SNAPSHOT_INSTALL_MARKER_KIND as KIND,
  RAFT_SNAPSHOT_INSTALL_OUTCOME as OUTCOME,
  RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES} from './snapshot-install-constants.js';
import {ABSENT_PREINSTALL_DIGEST, installArtifactPresent, installConflict,
  markerPath, readMarker, requireMarkerTarget, stagingPath} from './snapshot-install-marker.js';

const SQLITE_SIGNATURE = Buffer.from('SQLite format 3\0');
const SQLITE_WRITE_VERSION_OFFSET = 18;
const SQLITE_READ_VERSION_OFFSET = 19;
const SQLITE_ROLLBACK_VERSION = 1;
const SQLITE_WAL_VERSION = 2;
const TEXT_ENCODING = 'utf8';
const STATE_TABLE = '_raft_state';
const SELECT_STATE_TABLE = 'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?';
const SELECT_STATE_VALUE = 'SELECT value FROM _raft_state WHERE key = ?';
const CREATE_STATE_TABLE =
  'CREATE TABLE IF NOT EXISTS _raft_state (key TEXT PRIMARY KEY, value TEXT)';
const UPSERT_STATE = 'INSERT INTO _raft_state (key, value) VALUES (?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET value = excluded.value';

function installArtifactPaths(checkpointsRoot) {
  const staged = stagingPath(checkpointsRoot);
  return [staged, ...RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES.map((suffix) =>
    `${staged}${suffix}`), markerPath(checkpointsRoot)];
}

function requireInstallSidecarsAbsent(file) {
  for (const suffix of RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES) {
    if (installArtifactPresent(`${file}${suffix}`)) {
      throw installConflict(DETAIL.SIDECAR_PRESENT);
    }
  }
}

function fileDigest(file) {
  return installArtifactPresent(file) ? sha256Digest(fs.readFileSync(file)) :
    ABSENT_PREINSTALL_DIGEST;
}

// Deserialize only a closed main image. SQLite documents that a WAL-mode
// header must be normalized before deserialize, even after checkpoint/close.
// This is a private representation conversion; original bytes never change.
function privateInstallImage(file) {
  requireInstallSidecarsAbsent(file);
  if (!installArtifactPresent(file)) throw installConflict(DETAIL.UNOWNED_ARTIFACT);
  const bytes = fs.readFileSync(file);
  const writeVersion = bytes[SQLITE_WRITE_VERSION_OFFSET];
  const readVersion = bytes[SQLITE_READ_VERSION_OFFSET];
  if (!bytes.subarray(0, SQLITE_SIGNATURE.length).equals(SQLITE_SIGNATURE) ||
      ![SQLITE_ROLLBACK_VERSION, SQLITE_WAL_VERSION].includes(writeVersion) ||
      writeVersion !== readVersion) throw installConflict(DETAIL.UNOWNED_ARTIFACT);
  bytes[SQLITE_WRITE_VERSION_OFFSET] = SQLITE_ROLLBACK_VERSION;
  bytes[SQLITE_READ_VERSION_OFFSET] = SQLITE_ROLLBACK_VERSION;
  return bytes;
}

function readInstallImage(file, read) {
  let db;
  try {
    db = new Database(privateInstallImage(file), {readonly: true});
    return read(db);
  } catch (error) {
    throw installConflict(DETAIL.UNOWNED_ARTIFACT, error);
  } finally {
    db?.close();
  }
}

function immutableBinding(marker) {
  return {installId: marker.installId, kind: marker.kind,
    generationIndex: marker.generationIndex, createAuthority: marker.createAuthority,
    preInstallDigest: marker.preInstallDigest};
}

function writeStagedInstallBinding(db, marker) {
  db.exec(CREATE_STATE_TABLE);
  db.prepare(UPSERT_STATE).run(RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.INSTALL_BINDING,
    canonicalJsonBytes(immutableBinding(marker)).toString(TEXT_ENCODING));
}

function stagedInstallBindingMatches(file, marker) {
  if (!installArtifactPresent(file)) return false;
  return readInstallImage(file, (db) => {
    if (!db.prepare(SELECT_STATE_TABLE).get(STATE_TABLE)) return false;
    const row = db.prepare(SELECT_STATE_VALUE)
      .get(RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.INSTALL_BINDING);
    return row !== undefined && canonicalJsonBytes(JSON.parse(row.value))
      .equals(canonicalJsonBytes(immutableBinding(marker)));
  });
}

function fingerprint(file) {
  if (!installArtifactPresent(file)) return null;
  try {
    const bytes = fs.readFileSync(file);
    return `${bytes.length}:${sha256Digest(bytes)}`;
  } catch (error) {
    throw installConflict(DETAIL.ARTIFACT_UNAVAILABLE, error);
  }
}

// Fingerprints, not full database buffers, survive an asynchronous callback.
function captureInstallArtifacts(checkpointsRoot) {
  const captured = new Map(installArtifactPaths(checkpointsRoot)
    .map((file) => [file, fingerprint(file)]));
  return {
    assertUnchanged() {
      for (const [file, before] of captured) {
        if (fingerprint(file) !== before) throw installConflict(DETAIL.ARTIFACT_CHANGED);
      }
    },
    removed(file) {
      captured.set(file, null);
    },
  };
}

function inspectOwnedInstallArtifacts(checkpointsRoot, target) {
  const captured = captureInstallArtifacts(checkpointsRoot);
  const marker = readMarker(checkpointsRoot);
  const staged = stagingPath(checkpointsRoot);
  requireInstallSidecarsAbsent(staged);
  const stagedPresent = installArtifactPresent(staged);
  if (marker === null) {
    if (stagedPresent) throw installConflict(DETAIL.UNOWNED_ARTIFACT);
    return {marker, stagedPresent, captured};
  }
  requireMarkerTarget(marker, target);
  if (stagedPresent && !stagedInstallBindingMatches(staged, marker)) {
    throw installConflict(DETAIL.STAGING_BINDING_MISMATCH);
  }
  captured.assertUnchanged();
  return {marker, stagedPresent, captured};
}

function requireNoInstallArtifacts(checkpointsRoot) {
  for (const file of installArtifactPaths(checkpointsRoot)) {
    if (installArtifactPresent(file)) throw installConflict(DETAIL.PENDING_INSTALL);
  }
}

function markerMatchesCleanupGeneration(marker, generation) {
  if (marker.kind !== KIND.RAFT_RS_FRESH_CREATE) return true;
  return marker.createAuthority.replicaCreatedAt === generation.replicaCreatedAt &&
    marker.createAuthority.attemptToken === generation.attemptToken;
}

function inspectSnapshotInstallArtifactsForGeneration(options) {
  try {
    const {marker, captured} = inspectOwnedInstallArtifacts(options.checkpointsRoot, options);
    if (marker !== null && !markerMatchesCleanupGeneration(marker, options)) {
      throw installConflict(DETAIL.GENERATION_MISMATCH);
    }
    return Object.freeze({allAbsent: marker === null, owned: marker !== null,
      assertUnchanged: captured.assertUnchanged, outcomes: Object.freeze([])});
  } catch (error) {
    return Object.freeze({allAbsent: false, owned: false, outcome: OUTCOME.INSTALL_STATE_CONFLICT,
      outcomes: Object.freeze([{artifactPath: markerPath(options.checkpointsRoot),
        outcome: OUTCOME.INSTALL_STATE_CONFLICT, error}])});
  }
}

async function removeSnapshotInstallArtifactsForGeneration(options) {
  const inspection = inspectSnapshotInstallArtifactsForGeneration(options);
  if (inspection.allAbsent || !inspection.owned) return inspection;
  const captured = captureInstallArtifacts(options.checkpointsRoot);
  const deletedArtifacts = [];
  for (const artifactPath of installArtifactPaths(options.checkpointsRoot)) {
    if (!installArtifactPresent(artifactPath)) continue;
    await options.beforeRemove?.(artifactPath);
    captured.assertUnchanged();
    fs.unlinkSync(artifactPath);
    captured.removed(artifactPath);
    deletedArtifacts.push(artifactPath);
  }
  captured.assertUnchanged();
  return Object.freeze({allAbsent: true, outcomes: Object.freeze(deletedArtifacts.map(
    (artifactPath) => ({artifactPath, outcome: ARTIFACT.DELETED})))});
}

export {
  fileDigest, inspectOwnedInstallArtifacts, inspectSnapshotInstallArtifactsForGeneration,
  readInstallImage, removeSnapshotInstallArtifactsForGeneration,
  requireInstallSidecarsAbsent, requireNoInstallArtifacts,
  stagedInstallBindingMatches, writeStagedInstallBinding,
};
