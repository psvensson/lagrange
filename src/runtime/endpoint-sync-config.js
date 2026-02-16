/**
 * Endpoint sync configuration parsing and validation.
 *
 * Parses environment variables for endpoint sync controller
 * behavior and returns a validated config object.
 *
 * @module runtime/endpoint-sync-config
 */

import {TYPEOF} from '../constants/index.js';
import {
  ENDPOINT_SYNC_ALLOWED_UNHEALTHY_POLICIES,
  ENDPOINT_SYNC_BOOLEAN,
  ENDPOINT_SYNC_DEFAULT,
  ENDPOINT_SYNC_ENV,
  ENDPOINT_SYNC_ERROR,
  ENDPOINT_SYNC_REGEX,
} from './endpoint-sync-constants.js';

/**
 * Parse a comma-separated list into trimmed non-empty values.
 *
 * @param {*} raw - Raw env value.
 * @return {Array<string>} Parsed values.
 */
function parseCsvList(raw) {
  if (typeof raw !== TYPEOF.STRING) {
    return [];
  }
  return raw
    .trim()
    .split(ENDPOINT_SYNC_REGEX.COMMA_SPLIT)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Parse boolean env value with validation.
 *
 * @param {*} raw - Raw env value.
 * @param {boolean} fallback - Default when value is absent.
 * @param {string} envKey - Env key for error context.
 * @param {Array<string>} errors - Mutable error list.
 * @return {boolean}
 */
function parseBooleanEnv(raw, fallback, envKey, errors) {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  if (typeof raw !== TYPEOF.STRING) {
    errors.push(`${ENDPOINT_SYNC_ERROR.INVALID_BOOLEAN_PREFIX}: ${envKey}`);
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === ENDPOINT_SYNC_BOOLEAN.TRUE ||
      normalized === ENDPOINT_SYNC_BOOLEAN.ONE) {
    return true;
  }
  if (normalized === ENDPOINT_SYNC_BOOLEAN.FALSE ||
      normalized === ENDPOINT_SYNC_BOOLEAN.ZERO) {
    return false;
  }

  errors.push(`${ENDPOINT_SYNC_ERROR.INVALID_BOOLEAN_PREFIX}: ${envKey}`);
  return fallback;
}

/**
 * Parse positive integer env value with validation.
 *
 * @param {*} raw - Raw env value.
 * @param {number} fallback - Default when value is absent.
 * @param {string} envKey - Env key for error context.
 * @param {Array<string>} errors - Mutable error list.
 * @return {number}
 */
function parsePositiveIntegerEnv(raw, fallback, envKey, errors) {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${ENDPOINT_SYNC_ERROR.INVALID_INTEGER_PREFIX}: ${envKey}`);
    return fallback;
  }
  return parsed;
}

/**
 * Normalize protocol identifiers to lowercase.
 *
 * @param {Array<string>} protocols - Parsed protocol list.
 * @return {Array<string>}
 */
function normalizeProtocols(protocols) {
  return protocols.map((protocol) => protocol.toLowerCase());
}

/**
 * Build endpoint-sync configuration from env values.
 *
 * @param {Object} [env=process.env] - Environment key-value map.
 * @return {{valid: boolean, errors: Array<string>, config: Object}}
 */
function buildEndpointSyncConfig(env = process.env) {
  const errors = [];

  const adminStreamUrlRaw = env[ENDPOINT_SYNC_ENV.ADMIN_STREAM_URL] || '';
  const adminStreamUrl =
    typeof adminStreamUrlRaw === TYPEOF.STRING ?
      adminStreamUrlRaw.trim() :
      '';

  if (adminStreamUrl.length === 0) {
    errors.push(ENDPOINT_SYNC_ERROR.ADMIN_STREAM_URL_REQUIRED);
  } else if (!ENDPOINT_SYNC_REGEX.WS_SCHEME.test(adminStreamUrl)) {
    errors.push(ENDPOINT_SYNC_ERROR.ADMIN_STREAM_URL_INVALID);
  }

  const protocolAllowlistRaw = env[ENDPOINT_SYNC_ENV.PROTOCOL_ALLOWLIST];
  const protocolAllowlist = protocolAllowlistRaw !== undefined ?
    normalizeProtocols(parseCsvList(protocolAllowlistRaw)) :
    [...ENDPOINT_SYNC_DEFAULT.PROTOCOL_ALLOWLIST];

  if (protocolAllowlist.length === 0) {
    errors.push(ENDPOINT_SYNC_ERROR.PROTOCOL_ALLOWLIST_EMPTY);
  }

  const serviceIdAllowlist =
    parseCsvList(env[ENDPOINT_SYNC_ENV.SERVICE_ID_ALLOWLIST]);

  const unhealthyPolicyRaw =
    env[ENDPOINT_SYNC_ENV.UNHEALTHY_POLICY] ||
    ENDPOINT_SYNC_DEFAULT.UNHEALTHY_POLICY;
  const unhealthyPolicy =
    typeof unhealthyPolicyRaw === TYPEOF.STRING ?
      unhealthyPolicyRaw.trim() :
      '';
  if (!ENDPOINT_SYNC_ALLOWED_UNHEALTHY_POLICIES.has(unhealthyPolicy)) {
    errors.push(ENDPOINT_SYNC_ERROR.INVALID_UNHEALTHY_POLICY);
  }

  const serviceNamePrefixRaw =
    env[ENDPOINT_SYNC_ENV.SERVICE_NAME_PREFIX] ||
    ENDPOINT_SYNC_DEFAULT.SERVICE_NAME_PREFIX;
  const serviceNamePrefix =
    typeof serviceNamePrefixRaw === TYPEOF.STRING ?
      serviceNamePrefixRaw.trim().toLowerCase() :
      '';
  if (serviceNamePrefix.length === 0) {
    errors.push(ENDPOINT_SYNC_ERROR.SERVICE_NAME_PREFIX_REQUIRED);
  }

  const leaseNameRaw =
    env[ENDPOINT_SYNC_ENV.LEASE_NAME] ||
    ENDPOINT_SYNC_DEFAULT.LEASE_NAME;
  const leaseName =
    typeof leaseNameRaw === TYPEOF.STRING ?
      leaseNameRaw.trim() :
      '';
  if (leaseName.length === 0) {
    errors.push(ENDPOINT_SYNC_ERROR.LEASE_NAME_REQUIRED);
  }

  const targetNamespaceRaw = env[ENDPOINT_SYNC_ENV.TARGET_NAMESPACE] || '';
  const targetNamespace =
    typeof targetNamespaceRaw === TYPEOF.STRING ?
      targetNamespaceRaw.trim() :
      '';

  const leaseNamespaceRaw = env[ENDPOINT_SYNC_ENV.LEASE_NAMESPACE] || '';
  const leaseNamespace =
    typeof leaseNamespaceRaw === TYPEOF.STRING ?
      leaseNamespaceRaw.trim() :
      '';

  const config = {
    adminStreamUrl,
    adminAuthToken: env[ENDPOINT_SYNC_ENV.ADMIN_AUTH_TOKEN] || null,
    intervalMs: parsePositiveIntegerEnv(
      env[ENDPOINT_SYNC_ENV.INTERVAL_MS],
      ENDPOINT_SYNC_DEFAULT.INTERVAL_MS,
      ENDPOINT_SYNC_ENV.INTERVAL_MS,
      errors,
    ),
    protocolAllowlist,
    serviceIdAllowlist,
    healthyOnly: parseBooleanEnv(
      env[ENDPOINT_SYNC_ENV.HEALTHY_ONLY],
      ENDPOINT_SYNC_DEFAULT.HEALTHY_ONLY,
      ENDPOINT_SYNC_ENV.HEALTHY_ONLY,
      errors,
    ),
    strictPortMode: parseBooleanEnv(
      env[ENDPOINT_SYNC_ENV.STRICT_PORT_MODE],
      ENDPOINT_SYNC_DEFAULT.STRICT_PORT_MODE,
      ENDPOINT_SYNC_ENV.STRICT_PORT_MODE,
      errors,
    ),
    unhealthyPolicy,
    maxEndpointsPerSlice: parsePositiveIntegerEnv(
      env[ENDPOINT_SYNC_ENV.MAX_ENDPOINTS_PER_SLICE],
      ENDPOINT_SYNC_DEFAULT.MAX_ENDPOINTS_PER_SLICE,
      ENDPOINT_SYNC_ENV.MAX_ENDPOINTS_PER_SLICE,
      errors,
    ),
    sourceQueryTimeoutMs: parsePositiveIntegerEnv(
      env[ENDPOINT_SYNC_ENV.SOURCE_QUERY_TIMEOUT_MS],
      ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_TIMEOUT_MS,
      ENDPOINT_SYNC_ENV.SOURCE_QUERY_TIMEOUT_MS,
      errors,
    ),
    sourceQueryMaxRetries: parsePositiveIntegerEnv(
      env[ENDPOINT_SYNC_ENV.SOURCE_QUERY_MAX_RETRIES],
      ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_MAX_RETRIES,
      ENDPOINT_SYNC_ENV.SOURCE_QUERY_MAX_RETRIES,
      errors,
    ),
    sourceQueryRetryDelayMs: parsePositiveIntegerEnv(
      env[ENDPOINT_SYNC_ENV.SOURCE_QUERY_RETRY_DELAY_MS],
      ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_RETRY_DELAY_MS,
      ENDPOINT_SYNC_ENV.SOURCE_QUERY_RETRY_DELAY_MS,
      errors,
    ),
    targetNamespace,
    serviceNamePrefix,
    leaderElectionEnabled: parseBooleanEnv(
      env[ENDPOINT_SYNC_ENV.LEADER_ELECTION_ENABLED],
      ENDPOINT_SYNC_DEFAULT.LEADER_ELECTION_ENABLED,
      ENDPOINT_SYNC_ENV.LEADER_ELECTION_ENABLED,
      errors,
    ),
    leaseName,
    leaseNamespace,
    metricsEnabled: parseBooleanEnv(
      env[ENDPOINT_SYNC_ENV.METRICS_ENABLED],
      ENDPOINT_SYNC_DEFAULT.METRICS_ENABLED,
      ENDPOINT_SYNC_ENV.METRICS_ENABLED,
      errors,
    ),
  };

  return {
    valid: errors.length === 0,
    errors,
    config,
  };
}

export {
  parseCsvList,
  parseBooleanEnv,
  parsePositiveIntegerEnv,
  normalizeProtocols,
  buildEndpointSyncConfig,
};
