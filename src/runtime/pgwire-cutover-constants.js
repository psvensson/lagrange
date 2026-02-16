/**
 * Constants for PG wire hard-cutover guard.
 *
 * Defines the single-path contract assertions, forbidden patterns,
 * and error messages for the replicated-only PG wire listener path.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4
 *
 * @module runtime/pgwire-cutover-constants
 */

// --- Subsystem identifier ---

const PGWIRE_CUTOVER_SUBSYSTEM = 'pgwire-cutover-guard';

// --- Forbidden entrypoint symbols ---
// Any function or export matching these names in bootstrap/join/
// entrypoint modules would indicate a legacy standalone listener
// path that must not exist.

const FORBIDDEN_ENTRYPOINT_SYMBOLS = Object.freeze([
  'startPostgresListener',
  'createPostgresServer',
  'startPgWireListener',
  'startStandalonePostgres',
  'createStandalonePgWire',
  'initPostgresDirectListener',
]);

// --- Forbidden config keys ---
// Configuration keys that would indicate dual-mode execution
// (standalone vs replicated) for PG wire startup.

const FORBIDDEN_CONFIG_KEYS = Object.freeze([
  'pgwire.standalone',
  'pgwire.directListener',
  'pgwire.legacyMode',
  'pgwire.dualMode',
  'postgres.standalone',
  'postgres.directListener',
]);

// --- Guard error messages ---

const PGWIRE_CUTOVER_ERROR = Object.freeze({
  LEGACY_ENTRYPOINT_DETECTED:
    'legacy standalone PG wire entrypoint detected',
  DUAL_MODE_CONFIG_DETECTED:
    'dual-mode PG wire configuration detected',
  DIRECT_LISTENER_DETECTED:
    'direct PG wire listener startup outside runtime module',
});

// --- Guard log messages ---

const PGWIRE_CUTOVER_LOG = Object.freeze({
  CONTRACT_VERIFIED:
    'PG wire single-path contract verified: replicated-only',
  VIOLATION_DETECTED:
    'PG wire single-path contract violation detected',
});

export {
  PGWIRE_CUTOVER_SUBSYSTEM,
  FORBIDDEN_ENTRYPOINT_SYMBOLS,
  FORBIDDEN_CONFIG_KEYS,
  PGWIRE_CUTOVER_ERROR,
  PGWIRE_CUTOVER_LOG,
};
