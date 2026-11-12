// The install marker and staging files of one replica's checkpoints root
// (quest raft-snapshot-atomic-install): where they live, the marker's one
// value shape, and their removal. The installer (snapshot-install.js) owns
// every decision made on them.
import fs from 'node:fs';
import path from 'node:path';
import {ensureDirectory, exactKeys, readCanonicalJson, writeAtomicDurable} from
  '../runtime/oci-host-agent-durable-files.js';
import {RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES} from
  './snapshot-checkpoint-constants.js';
import {RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_LEGACY_MARKER_FIELDS,
  RAFT_SNAPSHOT_INSTALL_MARKER_FIELDS, RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_MARKER_KIND, RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE} from './snapshot-install-constants.js';

const MARKER_ERROR_CODE = 'RAFT_SNAPSHOT_INSTALL_MARKER_CORRUPT';
const NO_CREATE_AUTHORITY = Object.freeze({});
const ABSENT_PREINSTALL_DIGEST = 'absent';
const MARKER_KIND_FIELD = 'kind';
const INSTALL_MARKER_KINDS = new Set(
  Object.values(RAFT_SNAPSHOT_INSTALL_MARKER_KIND));

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

export {
  ABSENT_PREINSTALL_DIGEST,
  clearMarker,
  markerDetail,
  markerKind,
  markerPath,
  markerValue,
  readMarker,
  removeStaging,
  stagingPath,
  writeMarker,
};
