// Canonical durable marker vocabulary and decoding for the install owner.
import fs from 'node:fs';
import path from 'node:path';
import {ENTITY_TYPE} from '../constants/addresses.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {isReplicaCreateInstallAuthority} from '../node/replica-create-admission-evidence.js';
import {ensureDirectory, exactKeys, readCanonicalJson, writeAtomicDurable} from
  '../runtime/oci-host-agent-durable-files.js';
import {RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_DETAIL as DETAIL,
  RAFT_SNAPSHOT_INSTALL_MARKER_FIELDS, RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_MARKER_KIND as KIND, RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
  RAFT_SNAPSHOT_INSTALL_OUTCOME, RAFT_SNAPSHOT_INSTALL_REJECTION,
  RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES, RAFT_SNAPSHOT_INSTALL_STATE as STATE,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE} from './snapshot-install-constants.js';

const ABSENT_PREINSTALL_DIGEST = 'absent';
const FILE_ABSENT = 'ENOENT';
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const RECEIVER_AUTHORITY_FIELDS = Object.freeze([
  'entityId', 'entityType', 'partitionId', 'replicaId',
]);
const INSTALL_MARKER_KINDS = new Set(Object.values(KIND));
const INSTALL_MARKER_STATES = new Set(Object.values(STATE));
const INSTALL_REJECTIONS = new Set(Object.values(RAFT_SNAPSHOT_INSTALL_REJECTION));

function installConflict(detail, cause) {
  return Object.assign(new Error(detail, {cause}), {
    code: RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT, detail,
  });
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

// Only ENOENT is absence. A symlink, directory or unavailable file is not a
// grant to remove adjacent bytes or to replace an install.
function installArtifactPresent(file) {
  try {
    if (!fs.lstatSync(file).isFile()) throw installConflict(DETAIL.UNOWNED_ARTIFACT);
    return true;
  } catch (error) {
    if (error.code === FILE_ABSENT) return false;
    throw installConflict(DETAIL.ARTIFACT_UNAVAILABLE, error);
  }
}

function nonemptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function validAuthority(marker) {
  const authority = marker.createAuthority;
  if (marker.kind === KIND.RAFT_RS_FRESH_CREATE) {
    return isReplicaCreateInstallAuthority(authority) &&
      [ENTITY_TYPE.PARTITION, SERVICE_TYPE.MESSAGE_GROUP].includes(authority.entityType) &&
      authority.entityId === authority.partitionId;
  }
  return exactKeys(authority, RECEIVER_AUTHORITY_FIELDS) &&
    RECEIVER_AUTHORITY_FIELDS.every((field) => nonemptyString(authority[field])) &&
    authority.entityType === ENTITY_TYPE.PARTITION;
}

function validMarkerReason(marker) {
  return marker.state === STATE.REJECTED ?
    INSTALL_REJECTIONS.has(marker.rejectionReason) :
    marker.rejectionReason === RAFT_SNAPSHOT_INSTALL_NO_REJECTION;
}

function requireMarker(marker) {
  if (!exactKeys(marker, RAFT_SNAPSHOT_INSTALL_MARKER_FIELDS) ||
      !INSTALL_MARKER_KINDS.has(marker.kind) || !INSTALL_MARKER_STATES.has(marker.state) ||
      !nonemptyString(marker.installId) ||
      !Number.isSafeInteger(marker.generationIndex) || marker.generationIndex < 0 ||
      !validMarkerReason(marker) || !validAuthority(marker) ||
      !(marker.preInstallDigest === ABSENT_PREINSTALL_DIGEST ||
        DIGEST_PATTERN.test(marker.preInstallDigest))) {
    throw installConflict(DETAIL.INVALID_MARKER);
  }
  return Object.freeze({...marker, createAuthority: Object.freeze({...marker.createAuthority})});
}

function readMarker(checkpointsRoot) {
  const file = markerPath(checkpointsRoot);
  if (!installArtifactPresent(file)) return null;
  return requireMarker(readCanonicalJson(
    file, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT));
}

function writeMarker(checkpointsRoot, marker) {
  const value = requireMarker(marker);
  ensureDirectory(installDir(checkpointsRoot));
  writeAtomicDurable(markerPath(checkpointsRoot), value);
}

function markerValue(state, installId, generationIndex, rejectionReason, detail) {
  return requireMarker({state, installId, generationIndex, rejectionReason,
    kind: detail.kind, createAuthority: detail.createAuthority,
    preInstallDigest: detail.preInstallDigest});
}

function markerDetail(marker) {
  return {kind: marker.kind, createAuthority: marker.createAuthority,
    preInstallDigest: marker.preInstallDigest};
}

function requireMarkerTarget(marker, target) {
  if (!nonemptyString(target?.replicaId) || !nonemptyString(target?.partitionId) ||
      marker.createAuthority.replicaId !== target.replicaId ||
      marker.createAuthority.partitionId !== target.partitionId) {
    throw installConflict(DETAIL.TARGET_MISMATCH);
  }
}

function clearMarker(checkpointsRoot) {
  fs.rmSync(markerPath(checkpointsRoot), {force: true});
}

function removeStaging(checkpointsRoot) {
  const staged = stagingPath(checkpointsRoot);
  fs.rmSync(staged, {force: true});
  for (const suffix of RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES) {
    fs.rmSync(`${staged}${suffix}`, {force: true});
  }
}

export {
  ABSENT_PREINSTALL_DIGEST, clearMarker, installArtifactPresent, installConflict,
  markerDetail, markerPath, markerValue, readMarker, removeStaging,
  requireMarkerTarget, stagingPath, writeMarker,
};
