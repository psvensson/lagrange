const REJOIN_HINTS_FILENAME = 'cluster-rejoin-hints.json';
const REJOIN_HINTS_TEMP_SUFFIX = '.tmp';
const REJOIN_HINTS_WRITE_INTERVAL_MS = 1000;
const STARTUP_JOIN_MODE = Object.freeze({
  FRESH_JOIN: 'fresh_join',
  DURABLE_REJOIN: 'durable_rejoin',
  SEED: 'seed',
});
const TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT = Object.freeze({
  SEMANTIC_OWNER: 'topology_control_plane',
  BOUNDARY: 'boot_join_rejoin_membership_kernel',
});
const MEMBERSHIP_OWNER_OUTCOME_TYPE = Object.freeze({
  BOOTSTRAP_SEED: 'bootstrap_seed',
  JOIN_ADMISSION: 'join_admission',
  RESTART_REENTRY: 'restart_reentry',
  BLOCKED_STARTUP: 'blocked_startup',
});
const MEMBERSHIP_OWNER_REASON = Object.freeze({
  DURABLE_SEED: 'durable_seed',
  EXPLICIT_SEED: 'explicit_seed',
  FRESH_SEED: 'fresh_seed',
  IDENTITY_MISMATCH: 'identity_mismatch',
  INVALID_STARTUP_MODE: 'invalid_startup_mode',
  JOIN_PROBED_PEER: 'join_probed_peer',
  JOIN_RECOVERED_PEER: 'join_recovered_peer',
  PEER_REQUIRED_BUT_MISSING: 'peer_required_but_missing',
  STARTUP_MODE_COMPAT: 'startup_mode_compat',
  UNREADABLE_DURABLE_EVIDENCE: 'unreadable_durable_evidence',
});
const MEMBERSHIP_OWNER_EVIDENCE_SOURCE = Object.freeze({
  EXPLICIT: 'explicit',
  STARTUP_MODE: 'startup_mode',
});

/**
 * Typed read outcome for one durable evidence source (rejoin hints file or
 * one nodes-table replica DB). Absence must be positively proven; a source
 * that was discovered but could not be read is UNREADABLE, never absent, so
 * the fresh-seed path stays fail-closed over damaged durable state.
 */
const DURABLE_EVIDENCE_STATE = Object.freeze({
  MISSING: 'missing',
  READABLE: 'readable',
  UNREADABLE: 'unreadable',
});

/**
 * Explicit operator escape hatch: setting this environment variable to the
 * literal '1' authorizes one fresh-cluster bootstrap over unreadable durable
 * evidence. Honored only by the startup entrypoint, never inside the
 * evidence readers themselves.
 */
const FORCE_NEW_CLUSTER_ENV = 'LAGRANGE_FORCE_NEW_CLUSTER';

export {
  DURABLE_EVIDENCE_STATE,
  FORCE_NEW_CLUSTER_ENV,
  MEMBERSHIP_OWNER_EVIDENCE_SOURCE,
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  MEMBERSHIP_OWNER_REASON,
  REJOIN_HINTS_FILENAME,
  REJOIN_HINTS_TEMP_SUFFIX,
  REJOIN_HINTS_WRITE_INTERVAL_MS,
  STARTUP_JOIN_MODE,
  TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT,
};
