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
  new Set([
    PGWIRE_AUTH_MODE.TRUST,
    PGWIRE_AUTH_MODE.PASSWORD,
  ]),
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

const PGWIRE_LOOPBACK_HOSTS = Object.freeze(
  new Set(['127.0.0.1', '::1', 'localhost']),
);

const PGWIRE_CONFIG_FIELDS = Object.freeze(
  new Set(Object.values(PGWIRE_CONFIG_FIELD)),
);

// --- PG wire descriptor error messages ---

const PGWIRE_DESCRIPTOR_ERROR = Object.freeze({
  CONFIG_NOT_STRING:
    'runtime_config must be a string when provided',
  CONFIG_INVALID_JSON:
    'runtime_config must be valid JSON when provided',
  CONFIG_NOT_OBJECT:
    'runtime_config JSON must contain an object',
  CONFIG_UNSUPPORTED_FIELD:
    'runtime_config contains an unsupported field',
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
    'authMode must be trust or password',
  AUTH_MODE_REQUIRED:
    'authMode must be explicitly configured',
  TLS_MODE_INVALID:
    'tlsMode must be disable, prefer, or require',
  TLS_MODE_REQUIRED:
    'tlsMode must be explicitly configured',
  TRUST_REQUIRES_LOOPBACK:
    'trust authMode may only bind to a loopback host',
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
  if (typeof val !== 'number' ||
      !Number.isInteger(val) || val <= 0) {
    return {valid: false, error: notIntError};
  }
  if (val < MIN_PORT || val > MAX_PORT) {
    return {valid: false, error: rangeError};
  }
  return {valid: true};
}

function parsePgwireRuntimeConfig(configStr) {
  if (configStr === undefined || configStr === null) {
    return {
      valid: false,
      errors: [
        PGWIRE_DESCRIPTOR_ERROR.AUTH_MODE_REQUIRED,
        PGWIRE_DESCRIPTOR_ERROR.TLS_MODE_REQUIRED,
      ],
    };
  }
  if (typeof configStr !== 'string') {
    return {
      valid: false,
      errors: [PGWIRE_DESCRIPTOR_ERROR.CONFIG_NOT_STRING],
    };
  }
  try {
    const config = JSON.parse(configStr);
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      return {
        valid: false,
        errors: [PGWIRE_DESCRIPTOR_ERROR.CONFIG_NOT_OBJECT],
      };
    }
    return {valid: true, config};
  } catch (_error) {
    return {
      valid: false,
      errors: [PGWIRE_DESCRIPTOR_ERROR.CONFIG_INVALID_JSON],
    };
  }
}

function validateHostConfig(config) {
  if (!(PGWIRE_CONFIG_FIELD.HOST in config)) {
    return [];
  }
  const host = config[PGWIRE_CONFIG_FIELD.HOST];
  if (typeof host !== 'string') {
    return [PGWIRE_DESCRIPTOR_ERROR.HOST_NOT_STRING];
  }
  return host.trim().length === 0 ?
    [PGWIRE_DESCRIPTOR_ERROR.HOST_EMPTY] :
    [];
}

function validateKnownConfigFields(config) {
  return Object.keys(config).every((field) => PGWIRE_CONFIG_FIELDS.has(field)) ?
    [] :
    [PGWIRE_DESCRIPTOR_ERROR.CONFIG_UNSUPPORTED_FIELD];
}

function validateOptionalPortConfig(config, field, notIntegerError, rangeError) {
  if (!(field in config)) {
    return [];
  }
  const result = validatePort(config[field], notIntegerError, rangeError);
  return result.valid ? [] : [result.error];
}

function validatePortRangeOrder(config) {
  const start = config[PGWIRE_CONFIG_FIELD.PORT_RANGE_START];
  const end = config[PGWIRE_CONFIG_FIELD.PORT_RANGE_END];
  const validStart = validatePort(
    start,
    PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER,
    PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE,
  ).valid;
  const validEnd = validatePort(
    end,
    PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER,
    PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_OUT_OF_RANGE,
  ).valid;
  if (!validStart || !validEnd || end >= start) {
    return [];
  }
  return [PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_INVERTED];
}

function validateMaxSessionsConfig(config) {
  if (!(PGWIRE_CONFIG_FIELD.MAX_SESSIONS in config)) {
    return [];
  }
  const maxSessions = config[PGWIRE_CONFIG_FIELD.MAX_SESSIONS];
  return typeof maxSessions === 'number' &&
    Number.isInteger(maxSessions) && maxSessions > 0 ?
    [] :
    [PGWIRE_DESCRIPTOR_ERROR.MAX_SESSIONS_NOT_INTEGER];
}

function validateAuthConfig(config) {
  if (!(PGWIRE_CONFIG_FIELD.AUTH_MODE in config)) {
    return [PGWIRE_DESCRIPTOR_ERROR.AUTH_MODE_REQUIRED];
  }
  return ALLOWED_AUTH_MODES.has(config[PGWIRE_CONFIG_FIELD.AUTH_MODE]) ?
    [] :
    [PGWIRE_DESCRIPTOR_ERROR.AUTH_MODE_INVALID];
}

function validateTlsConfig(config) {
  if (!(PGWIRE_CONFIG_FIELD.TLS_MODE in config)) {
    return [PGWIRE_DESCRIPTOR_ERROR.TLS_MODE_REQUIRED];
  }
  return ALLOWED_TLS_MODES.has(config[PGWIRE_CONFIG_FIELD.TLS_MODE]) ?
    [] :
    [PGWIRE_DESCRIPTOR_ERROR.TLS_MODE_INVALID];
}

function validateTrustBindConfig(config) {
  const usesTrust =
    config[PGWIRE_CONFIG_FIELD.AUTH_MODE] === PGWIRE_AUTH_MODE.TRUST;
  const host = config[PGWIRE_CONFIG_FIELD.HOST];
  if (
    !usesTrust ||
    !(PGWIRE_CONFIG_FIELD.HOST in config) ||
    PGWIRE_LOOPBACK_HOSTS.has(host)
  ) {
    return [];
  }
  return [PGWIRE_DESCRIPTOR_ERROR.TRUST_REQUIRES_LOOPBACK];
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
  const parseResult = parsePgwireRuntimeConfig(configStr);
  if (!parseResult.valid) {
    return parseResult;
  }
  const config = parseResult.config;
  const errors = [
    ...validateKnownConfigFields(config),
    ...validateHostConfig(config),
    ...validateOptionalPortConfig(
      config,
      PGWIRE_CONFIG_FIELD.PORT,
      PGWIRE_DESCRIPTOR_ERROR.PORT_NOT_INTEGER,
      PGWIRE_DESCRIPTOR_ERROR.PORT_OUT_OF_RANGE,
    ),
    ...validateOptionalPortConfig(
      config,
      PGWIRE_CONFIG_FIELD.PORT_RANGE_START,
      PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER,
      PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE,
    ),
    ...validateOptionalPortConfig(
      config,
      PGWIRE_CONFIG_FIELD.PORT_RANGE_END,
      PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER,
      PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_OUT_OF_RANGE,
    ),
    ...validatePortRangeOrder(config),
    ...validateMaxSessionsConfig(config),
    ...validateAuthConfig(config),
    ...validateTlsConfig(config),
    ...validateTrustBindConfig(config),
  ];

  if (errors.length > 0) {
    return {valid: false, errors};
  }
  return {valid: true, config};
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
  PGWIRE_LOOPBACK_HOSTS,
  validatePgwireRuntimeConfig,
  isPgwireRuntimeRef,
};
