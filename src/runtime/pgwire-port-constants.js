/**
 * Constants for PG wire port allocation and collision handling.
 *
 * Defines allocation modes, default dynamic port range, and
 * typed error messages for bind conflicts and validation failures.
 *
 * Reuses MIN_PORT / MAX_PORT from runtime constants for range
 * validation. Does NOT duplicate port range constants from
 * wasm-service — PG wire uses its own distinct default range.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 *
 * @module runtime/pgwire-port-constants
 */

// --- Port allocation mode selector ---

const PORT_ALLOCATION_MODE = Object.freeze({
  FIXED: 'fixed',
  DYNAMIC: 'dynamic',
});

// --- Default dynamic port range for PG wire ---

const PGWIRE_DYNAMIC_PORT_RANGE_START = 5432;
const PGWIRE_DYNAMIC_PORT_RANGE_END = 5532;

// --- Typed error messages ---

const PGWIRE_PORT_ERROR = Object.freeze({
  PORT_OUT_OF_RANGE:
    'port is outside the valid range',
  PORT_NOT_INTEGER:
    'port must be a positive integer',
  RANGE_START_AFTER_END:
    'dynamic port range start must be <= end',
  RANGE_OUTSIDE_BOUNDS:
    'dynamic port range must be within valid port bounds',
  NO_PORTS_AVAILABLE:
    'no ports available in dynamic range',
  BIND_CONFLICT:
    'port bind conflict (EADDRINUSE)',
  SERVICE_ID_REQUIRED:
    'serviceId is required for port allocation',
});

// --- Error code for bind conflicts ---

const BIND_CONFLICT_CODE = 'EADDRINUSE';

export {
  PORT_ALLOCATION_MODE,
  PGWIRE_DYNAMIC_PORT_RANGE_START,
  PGWIRE_DYNAMIC_PORT_RANGE_END,
  PGWIRE_PORT_ERROR,
  BIND_CONFLICT_CODE,
};
