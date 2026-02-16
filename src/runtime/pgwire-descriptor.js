/**
 * PG wire runtime descriptor validation.
 *
 * Validates runtime_config shape and type constraints for
 * sys-postgres-wire service definitions. Enforces fail-closed
 * semantics: invalid or missing required config fields produce
 * explicit errors.
 *
 * Requirements: 2.4, 7.1, 10.1
 *
 * @module runtime/pgwire-descriptor
 */

import {TYPEOF} from '../constants/types.js';
import {MIN_PORT, MAX_PORT} from '../constants/runtime.js';
import {META_SERVICE_RUNTIME_REF} from '../constants/wasm-meta.js';

// --- PG wire runtime config field names ---

const PGWIRE_CONFIG_FIELD = Object.freeze({
  HOST: 'host',
  PORT: 'port',
  PORT_RANGE_START: 'portRangeStart',
  PORT_RANGE_END: 'portRangeEnd',
  MAX_SESSIONS: 'maxSessions',
  AUTH_MODE: 'authMode',
  TLS_MODE: 'tlsMode',
});

// --- Allowed auth mode values ---

const PGWIRE_AUTH_MODE = Object.freeze({
  TRUST: 'trust',
  PASSWORD: 'password',
  SCRAM_SHA_256: 'scram-sha-256',
});

const ALLOWED_AUTH_MODES = Object.freeze(
  new Set(Object.values(PGWIRE_AUTH_MODE)),
);

// --- Allowed TLS mode values ---

const PGWIRE_TLS_MODE = Object.freeze({
  DISABLE: 'disable',
  PREFER: 'prefer',
  REQUIRE: 'require',
});

const ALLOWED_TLS_MODES = Object.freeze(
  new Set(Object.values(PGWIRE_TLS_MODE)),
);

// --- PG wire descriptor error messages ---

const PGWIRE_DESCRIPTOR_ERROR = Object.freeze({
  CONFIG_NOT_STRING:
    'runtime_config must be a string when provided',
  CONFIG_INVALID_JSON:
    'runtime_config must be valid JSON when provided',
  HOST_NOT_STRING:
    'host must be a string when provided',
  HOST_EMPTY:
    'host must be a non-empty string when provided',
  PORT_NOT_INTEGER:
    'port must be a positive integer',
  PORT_OUT_OF_RANGE:
    `port must be between ${MIN_PORT} and ${MAX_PORT}`,
  PORT_RANGE_START_NOT_INTEGER:
    'portRangeStart must be a positive integer',
  PORT_RANGE_START_OUT_OF_RANGE:
    `portRangeStart must be between ${MIN_PORT} and ${MAX_PORT}`,
  PORT_RANGE_END_NOT_INTEGER:
    'portRangeEnd must be a positive integer',
  PORT_RANGE_END_OUT_OF_RANGE:
    `portRangeEnd must be between ${MIN_PORT} and ${MAX_PORT}`,
  PORT_RANGE_INVERTED:
    'portRangeEnd must be >= portRangeStart',
  MAX_SESSIONS_NOT_INTEGER:
    'maxSessions must be a positive integer',
  AUTH_MODE_INVALID:
    'authMode must be one of: trust, password, scram-sha-256',
  TLS_MODE_INVALID:
    'tlsMode must be one of: disable, prefer, require',
});

// --- Validation functions ---

/**
 * Validate a port number value.
 *
 * @param {*} val - The value to check.
 * @param {string} notIntError - Error for non-integer.
 * @param {string} rangeError - Error for out-of-range.
 * @return {string|null} Error message or null if valid.
 */
function validatePort(val, notIntError, rangeError) {
  if (typeof val !== TYPEOF.NUMBER ||
      !Number.isInteger(val) || val <= 0) {
    return notIntError;
  }
  if (val < MIN_PORT || val > MAX_PORT) {
    return rangeError;
  }
  return null;
}

/**
 * Validate PG wire runtime_config JSON string.
 *
 * Checks listener config shape (host, port, port range) and
 * auth/TLS config shape. Fails closed on invalid values.
 *
 * @param {*} configStr - The runtime_config value (string or null).
 * @return {{valid: boolean, errors?: string[], config?: Object}}
 */
function validatePgwireRuntimeConfig(configStr) {
  if (configStr === undefined || configStr === null) {
    return {valid: true};
  }
  if (typeof configStr !== TYPEOF.STRING) {
    return {
      valid: false,
      errors: [PGWIRE_DESCRIPTOR_ERROR.CONFIG_NOT_STRING],
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(configStr);
  } catch (_e) {
    return {
      valid: false,
      errors: [PGWIRE_DESCRIPTOR_ERROR.CONFIG_INVALID_JSON],
    };
  }
  const errors = [];

  // --- host ---
  if (PGWIRE_CONFIG_FIELD.HOST in parsed) {
    const val = parsed[PGWIRE_CONFIG_FIELD.HOST];
    if (typeof val !== TYPEOF.STRING) {
      errors.push(PGWIRE_DESCRIPTOR_ERROR.HOST_NOT_STRING);
    } else if (val.trim().length === 0) {
      errors.push(PGWIRE_DESCRIPTOR_ERROR.HOST_EMPTY);
    }
  }

  // --- port ---
  if (PGWIRE_CONFIG_FIELD.PORT in parsed) {
    const err = validatePort(
      parsed[PGWIRE_CONFIG_FIELD.PORT],
      PGWIRE_DESCRIPTOR_ERROR.PORT_NOT_INTEGER,
      PGWIRE_DESCRIPTOR_ERROR.PORT_OUT_OF_RANGE,
    );
    if (err) errors.push(err);
  }

  // --- portRangeStart ---
  if (PGWIRE_CONFIG_FIELD.PORT_RANGE_START in parsed) {
    const err = validatePort(
      parsed[PGWIRE_CONFIG_FIELD.PORT_RANGE_START],
      PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER,
      PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE,
    );
    if (err) errors.push(err);
  }

  // --- portRangeEnd ---
  if (PGWIRE_CONFIG_FIELD.PORT_RANGE_END in parsed) {
    const err = validatePort(
      parsed[PGWIRE_CONFIG_FIELD.PORT_RANGE_END],
      PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER,
      PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_OUT_OF_RANGE,
    );
    if (err) errors.push(err);
  }

  // --- portRangeStart <= portRangeEnd ---
  if (PGWIRE_CONFIG_FIELD.PORT_RANGE_START in parsed &&
      PGWIRE_CONFIG_FIELD.PORT_RANGE_END in parsed &&
      !errors.some((e) =>
        e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER ||
        e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE ||
        e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER ||
        e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_OUT_OF_RANGE)) {
    const start = parsed[PGWIRE_CONFIG_FIELD.PORT_RANGE_START];
    const end = parsed[PGWIRE_CONFIG_FIELD.PORT_RANGE_END];
    if (end < start) {
      errors.push(PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_INVERTED);
    }
  }

  // --- maxSessions ---
  if (PGWIRE_CONFIG_FIELD.MAX_SESSIONS in parsed) {
    const val = parsed[PGWIRE_CONFIG_FIELD.MAX_SESSIONS];
    if (typeof val !== TYPEOF.NUMBER ||
        !Number.isInteger(val) || val <= 0) {
      errors.push(PGWIRE_DESCRIPTOR_ERROR.MAX_SESSIONS_NOT_INTEGER);
    }
  }

  // --- authMode ---
  if (PGWIRE_CONFIG_FIELD.AUTH_MODE in parsed) {
    if (!ALLOWED_AUTH_MODES.has(parsed[PGWIRE_CONFIG_FIELD.AUTH_MODE])) {
      errors.push(PGWIRE_DESCRIPTOR_ERROR.AUTH_MODE_INVALID);
    }
  }

  // --- tlsMode ---
  if (PGWIRE_CONFIG_FIELD.TLS_MODE in parsed) {
    if (!ALLOWED_TLS_MODES.has(parsed[PGWIRE_CONFIG_FIELD.TLS_MODE])) {
      errors.push(PGWIRE_DESCRIPTOR_ERROR.TLS_MODE_INVALID);
    }
  }

  if (errors.length > 0) {
    return {valid: false, errors};
  }
  return {valid: true, config: parsed};
}

/**
 * Check whether a runtime_ref identifies the PG wire runtime.
 *
 * @param {*} ref - The runtime_ref value.
 * @return {boolean}
 */
function isPgwireRuntimeRef(ref) {
  return ref === META_SERVICE_RUNTIME_REF.POSTGRES_WIRE;
}

export {
  PGWIRE_CONFIG_FIELD,
  PGWIRE_AUTH_MODE,
  ALLOWED_AUTH_MODES,
  PGWIRE_TLS_MODE,
  ALLOWED_TLS_MODES,
  PGWIRE_DESCRIPTOR_ERROR,
  validatePgwireRuntimeConfig,
  isPgwireRuntimeRef,
};
