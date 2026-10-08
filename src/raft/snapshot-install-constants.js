// Raft snapshot atomic-install vocabulary (quest raft-snapshot-atomic-install,
// spec solve/specs/raft-snapshot-transfer-install/ R3). Owns the install
// state machine, the boundary/HLC/nonce `_raft_state` keys, the durable
// marker layout, and every typed install outcome. Checkpoint creation and
// validation vocabulary stays in snapshot-checkpoint-constants.js; transfer
// (S3) and retention (S5) own their own vocabulary.

// `_raft_state` keys written by the install reconstruction transaction.
// Follower-local by construction: the whole `_raft_state` table is excluded
// from checkpoint payloads, so none of these can ever cross replicas.
const RAFT_SNAPSHOT_BOUNDARY_STATE_KEY = Object.freeze({
  LAST_INCLUDED_INDEX: 'snapshotLastIncludedIndex',
  LAST_INCLUDED_TERM: 'snapshotLastIncludedTerm',
  MAX_COMMITTED_HLC: 'maxCommittedHlc',
  INSTALL_ID: 'snapshotInstallId',
});

// Durable install marker: {checkpointsRoot}/install/install-state.json plus
// the staged payload beside it. Non-`.db` names inside a subdirectory keep
// both invisible to the bootstrap rejoin-hints `*.db` scan.
const RAFT_SNAPSHOT_INSTALL_DIRNAME = 'install';
const RAFT_SNAPSHOT_INSTALL_MARKER_FILE = 'install-state.json';
const RAFT_SNAPSHOT_INSTALL_STAGING_FILE = 'staging-payload';

// Install state machine (R3: restart SHALL distinguish no install, partial
// staging, complete uninstalled, installed, and rejected). "No install" is
// the absence of the marker file.
const RAFT_SNAPSHOT_INSTALL_STATE = Object.freeze({
  STAGING: 'staging',
  STAGED: 'staged',
  INSTALLED: 'installed',
  REJECTED: 'rejected',
});

const RAFT_SNAPSHOT_INSTALL_MARKER_KIND = Object.freeze({
  LEGACY_PARTITION: 'legacy_partition',
  RAFT_RS_FRESH_CREATE: 'raft_rs_fresh_create',
});

// Typed outcomes of resolving a pending install at the boot boundary. Only
// INSTALLED and NO_INSTALL allow the boot to proceed on new state; REJECTED
// boots the old state; CONFLICT fails closed.
const RAFT_SNAPSHOT_INSTALL_OUTCOME = Object.freeze({
  NO_INSTALL: 'no_install',
  INSTALLED: 'installed',
  REJECTED: 'rejected',
  INSTALL_STATE_CONFLICT: 'install_state_conflict',
});

// Typed rejection reasons recorded in the marker.
const RAFT_SNAPSHOT_INSTALL_REJECTION = Object.freeze({
  STAGING_LOST: 'staging_lost',
  STAGING_DIGEST_MISMATCH: 'staging_digest_mismatch',
  IDENTITY_MISMATCH: 'identity_mismatch',
  CHECKPOINT_INVALID: 'checkpoint_invalid',
  WORKER_PATH_UNSUPPORTED: 'worker_path_unsupported',
  CREATE_ADMISSION_REQUIRED: 'create_admission_required',
  PAYLOAD_VERSION_UNSUPPORTED_FOR_CREATE: 'payload_version_unsupported_for_create',
  RAFT_RS_DESCRIPTOR_MISMATCH: 'raft_rs_descriptor_mismatch',
  CREATE_GENERATION_MISMATCH: 'create_generation_mismatch',
});

// Marker exact-object shape.
const RAFT_SNAPSHOT_INSTALL_MARKER_FIELDS = Object.freeze([
  'state',
  'installId',
  'generationIndex',
  'rejectionReason',
  'kind',
  'createAuthority',
  'preInstallDigest',
]);
const RAFT_SNAPSHOT_INSTALL_LEGACY_MARKER_FIELDS = Object.freeze([
  'state',
  'installId',
  'generationIndex',
  'rejectionReason',
]);
const RAFT_SNAPSHOT_INSTALL_NO_REJECTION = 'none';
const RAFT_SNAPSHOT_INSTALL_DETAIL = Object.freeze({
  GENERATION_MISMATCH: 'generation_mismatch',
  STAGED_CREATE_GENERATION_MISMATCH: 'staged_create_generation_mismatch',
  LEGACY_STAGING_NONCE_MISMATCH: 'legacy_staging_nonce_mismatch',
});
const RAFT_SNAPSHOT_INSTALL_ARTIFACT_OUTCOME = Object.freeze({
  DELETED: 'deleted',
});

export {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_DETAIL,
  RAFT_SNAPSHOT_INSTALL_ARTIFACT_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_MARKER_FIELDS,
  RAFT_SNAPSHOT_INSTALL_LEGACY_MARKER_FIELDS,
  RAFT_SNAPSHOT_INSTALL_MARKER_KIND,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE,
  RAFT_SNAPSHOT_INSTALL_STATE,
};
