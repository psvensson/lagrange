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
  JOIN_PROBED_PEER: 'join_probed_peer',
  JOIN_RECOVERED_PEER: 'join_recovered_peer',
  PEER_REQUIRED_BUT_MISSING: 'peer_required_but_missing',
  STARTUP_MODE_COMPAT: 'startup_mode_compat',
});
const MEMBERSHIP_OWNER_EVIDENCE_SOURCE = Object.freeze({
  EXPLICIT: 'explicit',
  STARTUP_MODE: 'startup_mode',
});

export {
  MEMBERSHIP_OWNER_EVIDENCE_SOURCE,
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  MEMBERSHIP_OWNER_REASON,
  REJOIN_HINTS_FILENAME,
  REJOIN_HINTS_TEMP_SUFFIX,
  REJOIN_HINTS_WRITE_INTERVAL_MS,
  STARTUP_JOIN_MODE,
  TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT,
};
