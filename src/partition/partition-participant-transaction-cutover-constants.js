// TX1 v10 release-interaction refinement, accepted 2026-10-11. The release
// sequence owns volatile execution admission; durable origin, membership,
// applied progress and lifecycle identity remain with their existing owners.
const PARTICIPANT_RELEASE_TYPE = 'PARTICIPANT_RELEASE';
const PARTICIPANT_RELEASE_RESULT_FIELD = 'releaseResult';
const PARTICIPANT_RELEASE_VERSION = 1;
const PARTICIPANT_RELEASE_ACTION = Object.freeze({
  RELEASE: 'release', INSPECT: 'inspect', PAUSE: 'pause',
  REOPEN: 'reopen', ENABLE: 'enable',
  OBSERVE_APPLIED_POSITION: 'observe_applied_position', RESUME: 'resume',
});
const PARTICIPANT_CUTOVER_PHASE = Object.freeze({
  INSPECT: 'inspect', PAUSE: 'pause', REOPEN: 'reopen',
  ROWID_CENSUS: 'rowid_census', ENABLE: 'enable', REPLICA_CENSUS: 'replica_census',
  RESUME: 'resume',
});
const PARTICIPANT_CUTOVER_OUTCOME = Object.freeze({
  CUT_OVER: 'cut_over', OBSERVED: 'observed', PAUSED: 'paused',
  DRAINED: 'drained', REOPENED: 'reopened', RESUMED: 'resumed',
  NOT_LEADER: 'not_leader', UNAVAILABLE: 'release_fact_unavailable',
  INVALID: 'release_request_invalid', STALE: 'release_generation_changed',
  BUILD_MISMATCH: 'release_build_mismatch', DRAIN_PENDING: 'release_drain_pending',
  TOPOLOGY_PENDING: 'release_topology_pending', REOPEN_REQUIRED: 'reopen_required',
  REOPEN_REFUSED: 'release_reopen_refused', OPERATOR_REQUIRED: 'release_operator_required',
  ROWID_CEILING_REACHED: 'rowid_ceiling_reached', ENABLE_REFUSED: 'enable_refused',
  ORIGIN_REPLICATION_PENDING: 'origin_replication_pending',
  QUERY_DRAIN_PENDING: 'query_transaction_drain_pending',
  CENSUS_REFUSED: 'release_census_refused',
});
const PARTICIPANT_RELEASE_ADMISSION = Object.freeze({CLOSED: 'closed', OPEN: 'open'});
const PARTICIPANT_CUTOVER_BOUND = Object.freeze({
  DRAIN_DEADLINE_MS: 30000, REPLICA_CENSUS_DEADLINE_MS: 30000,
  REQUEST_TIMEOUT_MS: 5000, POLL_INTERVAL_MS: 20, QUIET_POLLS: 2,
  PAUSE_RETRY_AFTER_MS: 100, RECOVERY_RETRY_MS: 1000,
});
const PARTICIPANT_RELEASE_ROUTE_SUFFIX = '/service/replica-handler';
const PARTICIPANT_RELEASE_PRIORITY = 'critical';
const PARTICIPANT_RELEASE_TRIGGER = Object.freeze({
  OPERATOR: 'operator', EXISTING_ORIGIN: 'existing-origin',
  FRESH_SEED: 'fresh-seed', FRESH_CREATE: 'fresh-create',
});
const PARTICIPANT_RELEASE_LOG = 'Participant release recovery';
export {
  PARTICIPANT_CUTOVER_BOUND, PARTICIPANT_CUTOVER_OUTCOME, PARTICIPANT_CUTOVER_PHASE,
  PARTICIPANT_RELEASE_ACTION, PARTICIPANT_RELEASE_ADMISSION, PARTICIPANT_RELEASE_PRIORITY,
  PARTICIPANT_RELEASE_RESULT_FIELD, PARTICIPANT_RELEASE_ROUTE_SUFFIX, PARTICIPANT_RELEASE_TRIGGER,
  PARTICIPANT_RELEASE_TYPE, PARTICIPANT_RELEASE_VERSION, PARTICIPANT_RELEASE_LOG,
};
