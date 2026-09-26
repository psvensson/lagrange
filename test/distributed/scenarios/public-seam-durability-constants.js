/**
 * Named states, SQL, and the interim retry policy of the provider-neutral
 * public-seam durability scenario (public-seam-durability.js).
 *
 * The scenario observes only what a public client of the cluster sees: rows
 * and errors from each node's PostgreSQL-wire endpoint. It never reads raft
 * state, configuration state, terms, leaders, or peer lists.
 */

const PUBLIC_SEAM_SCENARIO_NAME = 'public-seam-durability';
const PUBLIC_SEAM_SCENARIO_CONFIG_KEY = 'publicSeamDurability';
const PUBLIC_SEAM_OVERRIDES_KEY = 'publicSeamDurability';

// Per-step outcome (R07: an outcome is a named state).
const PUBLIC_SEAM_STEP_OUTCOME = Object.freeze({
  FAIL: 'FAIL',
  NOT_RUN: 'NOT_RUN',
  PASS: 'PASS',
});

const PUBLIC_SEAM_VERDICT = Object.freeze({
  FAIL: 'FAIL',
  PASS: 'PASS',
});

// Certification status of this scenario's evidence. PREPARED means the
// harness exists but the tree still runs the legacy consensus provider, so
// a PASS is not an rs-raft certification; CANDIDATE means the legacy
// provider is gone and the owner decides whether the run certifies.
const PUBLIC_SEAM_CERTIFICATION = Object.freeze({
  CANDIDATE: 'CANDIDATE',
  PREPARED_BLOCKED: 'PREPARED_BLOCKED_ON_RS_RAFT_CUTOVER',
});
const PUBLIC_SEAM_CERTIFICATION_LINE_PREFIX = 'certification: ';
const PUBLIC_SEAM_CERTIFICATION_SOURCE =
  'src/raft/raft-provider-control.js#resolveRaftProvider (runtime default)';

const PUBLIC_SEAM_STEP = Object.freeze({
  BINDING_AFTER_RESTART: 'binding_after_restart',
  BINDING_BEFORE_OUTAGE: 'binding_before_outage',
  BLOB_ROUND_TRIP: 'blob_round_trip',
  CLUSTER_CONVERGED: 'cluster_converged',
  FINAL_STATE_AGREEMENT: 'final_state_agreement',
  NO_DUPLICATE_EFFECTS: 'no_duplicate_effects',
  OBJECT_WRITE_COMMITTED: 'object_write_committed',
  PARTICIPANT_RESTARTED: 'participant_restarted',
  PARTICIPANT_STOPPED: 'participant_stopped',
  PUBLIC_CLIENT_READY: 'public_client_ready',
  REMOTE_READ_AGREEMENT: 'remote_read_agreement',
  SURVIVOR_READ_DURING_OUTAGE: 'survivor_read_during_outage',
  TOPOLOGY_LEAK_CHECK: 'topology_leak_check',
  WRITE_AFTER_RESTART: 'write_after_restart',
  WRITE_DURING_OUTAGE: 'write_during_outage',
});

// Why a step did not run: always an explicit reason, never a silent skip.
const PUBLIC_SEAM_NOT_RUN_REASON = Object.freeze({
  BINDING_DISABLED:
    'binding disabled by config (scenarios.publicSeamDurability.binding' +
    '.enabled=false)',
  BLOCKED_BY: 'blocked_by:',
});

// Outcome of a write under the retry policy.
const PUBLIC_SEAM_WRITE_OUTCOME = Object.freeze({
  COMMITTED: 'committed',
  COMMITTED_BY_PRIOR_ATTEMPT: 'committed_by_prior_attempt',
  TERMINAL: 'terminal',
  UNAVAILABLE_TYPED: 'unavailable_typed',
});

const PUBLIC_SEAM_OUTCOME_CLASS = Object.freeze({
  RETRYABLE: 'retryable',
  TERMINAL: 'terminal',
});

// TODO(images-seam Track B): this block is the interim retry-safe class
// table. Replace it with Track B's public retry-safe outcome owner constant
// when that lands on the epic branch; until then only `deferred === true`,
// a numeric retry-after hint, and connection-refused-before-dispatch are
// retried and every other outcome is terminal. Reads (SELECT, read-only
// CALL) are bounded polls, not retries; this policy governs writes only.
const PUBLIC_SEAM_INTERIM_RETRY_POLICY = Object.freeze({
  connectionRefusedCodes: Object.freeze(['ECONNREFUSED']),
  delayMs: 500,
  maxAttempts: 5,
  owner: 'interim:images-seam-track-b-pending',
  retryAfterDetailField: 'retry_after_ms',
  retryOnDeferred: true,
  retryOnRetryAfterMs: true,
});

// Where the value leak scan's partition identifiers came from. UNAVAILABLE
// fails the leak check closed: a scan without them is incomplete.
const PUBLIC_SEAM_IDENTIFIER_SOURCE = Object.freeze({
  READ: 'read',
  UNAVAILABLE: 'unavailable',
});

const PUBLIC_SEAM_OBJECT = Object.freeze({
  BODY_BYTE_COUNT: 64,
  BODY_SEED: 7,
  HISTORY_ID_SEPARATOR: ':v',
  ID_PREFIX: 'object-',
  INITIAL_VERSION: 1,
});

const PUBLIC_SEAM_SQL = Object.freeze({
  BEGIN: 'BEGIN',
  COMMIT: 'COMMIT',
  COUNT_HISTORY:
    'SELECT COUNT(*) AS history_count FROM object_history ' +
    'WHERE object_id = $1',
  CREATE_HISTORY:
    'CREATE TABLE object_history (id TEXT PRIMARY KEY, ' +
    'object_id TEXT, version INTEGER)',
  // The scenario speaks PostgreSQL to the wire, so the byte column is
  // BYTEA (the pgwire parser's PostgreSQL dialect rejects BLOB; the engine
  // maps BYTEA to BLOB affinity).
  CREATE_OBJECTS:
    'CREATE TABLE objects (id TEXT PRIMARY KEY, body BYTEA, version INTEGER)',
  INSERT_HISTORY:
    'INSERT INTO object_history (id, object_id, version) VALUES ($1, $2, $3)',
  INSERT_OBJECT:
    'INSERT INTO objects (id, body, version) VALUES ($1, $2, $3)',
  PROBE_HISTORY: 'SELECT COUNT(*) AS history_count FROM object_history',
  PROBE_OBJECTS: 'SELECT COUNT(*) AS object_count FROM objects',
  ROLLBACK: 'ROLLBACK',
  SELECT_HISTORY:
    'SELECT id, object_id, version FROM object_history ' +
    'WHERE object_id = $1 ORDER BY version',
  SELECT_OBJECT: 'SELECT id, body, version FROM objects WHERE id = $1',
  UPDATE_OBJECT:
    'UPDATE objects SET body = $1, version = $2 WHERE id = $3 AND version = $4',
});

// Public PostgreSQL-wire listener provisioning. sys-postgres-wire ships at
// replica_count 0 bound to loopback in trust mode
// (src/wasm-service/meta-service-factory.js), so a docker cluster has no
// public client endpoint until an operator scales it. The documented scale
// path is raising service_definitions.replica_count
// (architecture/postgres-wire.md "PostgreSQL Wire Scale Operations");
// external binding requires password mode, whose credentials the harness
// already injects as PGWIRE_AUTH_* on every node.
const PUBLIC_SEAM_LISTENER = Object.freeze({
  BIND_ALL_HOST: '0.0.0.0',
  CONNECT_TIMEOUT_MS: 5000,
});

// The binding step's statements, kept apart from its non-SQL settings so
// the wire-dialect unit test can enumerate every statement the scenario
// sends. CALL BINDING is lifecycle grammar (classified before the parser).
const PUBLIC_SEAM_BINDING_SQL = Object.freeze({
  CALL_BINDING: 'CALL BINDING $1',
  CREATE_TABLE:
    'CREATE TABLE account_activity (id INTEGER PRIMARY KEY, ' +
    'account_id INTEGER, amount_cents INTEGER, flagged INTEGER, pad TEXT)',
  INSERT_ROW:
    'INSERT INTO account_activity (id, account_id, amount_cents, flagged, ' +
    'pad) VALUES ($1, $2, $3, $4, $5)',
});

const PUBLIC_SEAM_BINDING = Object.freeze({
  ACCOUNT_IDS: Object.freeze([101, 202]),
  ARTIFACT_SOURCE_SERVICE_PIPELINE: 'service-pipeline-local-oci',
  CALL_BINDING_MARKER: '--call--',
  CALL_SCHEMA_VERSION: 2,
  PROJECT_SUBDIRECTORY: 'public-seam-durability',
  RESULT_COLUMN: 'result',
  ROW_COUNT: 8,
  ROW_ID_BASE: 1000,
  ROW_AMOUNT_STEP_CENTS: 125,
  ROW_FLAG_MODULUS: 3,
});

export {
  PUBLIC_SEAM_BINDING,
  PUBLIC_SEAM_BINDING_SQL,
  PUBLIC_SEAM_CERTIFICATION,
  PUBLIC_SEAM_CERTIFICATION_LINE_PREFIX,
  PUBLIC_SEAM_CERTIFICATION_SOURCE,
  PUBLIC_SEAM_IDENTIFIER_SOURCE,
  PUBLIC_SEAM_INTERIM_RETRY_POLICY,
  PUBLIC_SEAM_LISTENER,
  PUBLIC_SEAM_NOT_RUN_REASON,
  PUBLIC_SEAM_OBJECT,
  PUBLIC_SEAM_OUTCOME_CLASS,
  PUBLIC_SEAM_OVERRIDES_KEY,
  PUBLIC_SEAM_SCENARIO_CONFIG_KEY,
  PUBLIC_SEAM_SCENARIO_NAME,
  PUBLIC_SEAM_SQL,
  PUBLIC_SEAM_STEP,
  PUBLIC_SEAM_STEP_OUTCOME,
  PUBLIC_SEAM_VERDICT,
  PUBLIC_SEAM_WRITE_OUTCOME,
};
