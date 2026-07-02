/**
 * Endpoint sync controller constants.
 *
 * Canonical constants for Kubernetes endpoint projection from
 * service_endpoints metadata.
 *
 * @module runtime/endpoint-sync-constants
 */

import {
  WASM_SERVICE_PROTOCOL,
  WASM_SERVICE_HEALTH_STATUS,
} from '../wasm-service/wasm-service-constants.js';

const ENDPOINT_SYNC_ENV = Object.freeze({
  ADMIN_STREAM_URL: 'ENDPOINT_SYNC_ADMIN_STREAM_URL',
  ADMIN_AUTH_TOKEN: 'ENDPOINT_SYNC_ADMIN_AUTH_TOKEN',
  INTERVAL_MS: 'ENDPOINT_SYNC_INTERVAL_MS',
  PROTOCOL_ALLOWLIST: 'ENDPOINT_SYNC_PROTOCOL_ALLOWLIST',
  SERVICE_ID_ALLOWLIST: 'ENDPOINT_SYNC_SERVICE_ID_ALLOWLIST',
  HEALTHY_ONLY: 'ENDPOINT_SYNC_HEALTHY_ONLY',
  TARGET_NAMESPACE: 'ENDPOINT_SYNC_TARGET_NAMESPACE',
  STRICT_PORT_MODE: 'ENDPOINT_SYNC_STRICT_PORT_MODE',
  UNHEALTHY_POLICY: 'ENDPOINT_SYNC_UNHEALTHY_POLICY',
  MAX_ENDPOINTS_PER_SLICE: 'ENDPOINT_SYNC_MAX_ENDPOINTS_PER_SLICE',
  SERVICE_NAME_PREFIX: 'ENDPOINT_SYNC_SERVICE_NAME_PREFIX',
  LEADER_ELECTION_ENABLED: 'ENDPOINT_SYNC_LEADER_ELECTION_ENABLED',
  LEASE_NAME: 'ENDPOINT_SYNC_LEASE_NAME',
  LEASE_NAMESPACE: 'ENDPOINT_SYNC_LEASE_NAMESPACE',
  METRICS_ENABLED: 'ENDPOINT_SYNC_METRICS_ENABLED',
  SOURCE_QUERY_TIMEOUT_MS: 'ENDPOINT_SYNC_SOURCE_QUERY_TIMEOUT_MS',
  SOURCE_QUERY_MAX_RETRIES: 'ENDPOINT_SYNC_SOURCE_QUERY_MAX_RETRIES',
  SOURCE_QUERY_RETRY_DELAY_MS: 'ENDPOINT_SYNC_SOURCE_QUERY_RETRY_DELAY_MS',
});

const ENDPOINT_SYNC_BOOLEAN = Object.freeze({
  TRUE: 'true',
  FALSE: 'false',
  ONE: '1',
  ZERO: '0',
});

const ENDPOINT_SYNC_UNHEALTHY_POLICY = Object.freeze({
  EXCLUDE: 'exclude',
  NOT_READY: 'not_ready',
});

const ENDPOINT_SYNC_ALLOWED_UNHEALTHY_POLICIES = Object.freeze(
  new Set(Object.values(ENDPOINT_SYNC_UNHEALTHY_POLICY)),
);

const ENDPOINT_SYNC_DEFAULT = Object.freeze({
  INTERVAL_MS: 5000,
  HEALTHY_ONLY: true,
  STRICT_PORT_MODE: true,
  UNHEALTHY_POLICY: ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE,
  MAX_ENDPOINTS_PER_SLICE: 100,
  SERVICE_NAME_PREFIX: 'svc',
  LEADER_ELECTION_ENABLED: true,
  LEASE_NAME: 'endpoint-sync-controller',
  METRICS_ENABLED: true,
  SOURCE_QUERY_TIMEOUT_MS: 30000,
  SOURCE_QUERY_MAX_RETRIES: 3,
  SOURCE_QUERY_RETRY_DELAY_MS: 1000,
  PROTOCOL_ALLOWLIST: Object.freeze([
    WASM_SERVICE_PROTOCOL.POSTGRESQL,
  ]),
  SERVICE_ID_ALLOWLIST: Object.freeze([]),
});

const ENDPOINT_SYNC_LABEL = Object.freeze({
  MANAGED_KEY: 'endpointsync.system/managed',
  MANAGED_VALUE: 'true',
  SOURCE_KEY: 'endpointsync.system/source',
  SOURCE_VALUE: 'service_endpoints',
  SERVICE_KEY: 'endpointsync.system/service-key',
});

const ENDPOINT_SYNC_METRIC = Object.freeze({
  RECONCILE_DURATION_MS: 'endpoint_sync_reconcile_duration_ms',
  RECONCILE_FAILURES_TOTAL: 'endpoint_sync_reconcile_failures_total',
  EXPORTED_SERVICES: 'endpoint_sync_exported_services',
  EXPORTED_ENDPOINTS: 'endpoint_sync_exported_endpoints',
  PORT_CONFLICT_TOTAL: 'endpoint_sync_port_conflict_total',
});

const ENDPOINT_SYNC_LOG = Object.freeze({
  RECONCILE_SUMMARY: 'endpoint_sync.reconcile.summary',
  RECONCILE_FAILURE: 'endpoint_sync.reconcile.failure',
  GROUP_FAILURE: 'endpoint_sync.reconcile.group_failure',
  LEADER_STATUS: 'endpoint_sync.leader.status',
  EVENT_EMIT_FAILURE: 'endpoint_sync.event.emit_failure',
});

const ENDPOINT_SYNC_EVENT_REASON = Object.freeze({
  PORT_CONFLICT: 'PortConflict',
  SOURCE_QUERY_FAILED: 'SourceQueryFailed',
  RECONCILE_FAILED: 'ReconcileFailed',
});

const ENDPOINT_SYNC_EVENT_TYPE = Object.freeze({
  WARNING: 'Warning',
});

const ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE = Object.freeze({
  SERVICE: 'service',
  ENDPOINT_SLICE: 'endpoint_slice',
  GARBAGE_COLLECTION: 'garbage_collection',
});

const ENDPOINT_SYNC_LEASE = Object.freeze({
  API_VERSION: 'coordination.k8s.io/v1',
  KIND: 'Lease',
  DEFAULT_DURATION_SECONDS: 15,
  HOLDER_IDENTITY_FALLBACK: 'endpoint-sync-controller',
});

const ENDPOINT_SYNC_ERROR = Object.freeze({
  ADMIN_STREAM_URL_REQUIRED:
    'ENDPOINT_SYNC_ADMIN_STREAM_URL is required',
  ADMIN_STREAM_URL_INVALID:
    'ENDPOINT_SYNC_ADMIN_STREAM_URL must start with ws:// or wss://',
  INVALID_BOOLEAN_PREFIX:
    'Invalid boolean value for env key',
  INVALID_INTEGER_PREFIX:
    'Invalid positive integer value for env key',
  INVALID_UNHEALTHY_POLICY:
    'ENDPOINT_SYNC_UNHEALTHY_POLICY must be one of: exclude, not_ready',
  PROTOCOL_ALLOWLIST_EMPTY:
    'ENDPOINT_SYNC_PROTOCOL_ALLOWLIST must contain at least one protocol',
  SERVICE_NAME_PREFIX_REQUIRED:
    'ENDPOINT_SYNC_SERVICE_NAME_PREFIX must be non-empty',
  LEASE_NAME_REQUIRED:
    'ENDPOINT_SYNC_LEASE_NAME must be non-empty',
  SOURCE_QUERY_TIMEOUT:
    'Endpoint source query timed out',
  SOURCE_QUERY_FAILED:
    'Endpoint source query failed',
  SOURCE_QUERY_UNEXPECTED_MESSAGE:
    'Unexpected message from admin stream source query',
  QUERY_RESULT_ERROR_PREFIX:
    'Admin stream query_result returned error',
  QUERY_RESULT_ROWS_INVALID:
    'Admin stream query_result rows field must be an array',
  STRICT_PORT_CONFLICT:
    'Strict port mode requires one unique port per logical service',
});

const ENDPOINT_SYNC_SOURCE_QUERY = Object.freeze({
  QUERY_ID_PREFIX: 'endpoint-sync-query-',
});

const ENDPOINT_SYNC_LIST_SEPARATOR = Object.freeze({
  COMMA: ',',
  SERVICE_KEY: '|',
});

const ENDPOINT_SYNC_NAME = Object.freeze({
  DNS1123_MAX_LENGTH: 63,
  HASH_LENGTH: 8,
  FALLBACK_SEGMENT: 'svc',
  CONCAT_SEPARATOR: '-',
});

const ENDPOINT_SYNC_REGEX = Object.freeze({
  WS_SCHEME: /^wss?:\/\//,
  COMMA_SPLIT: /\s*,\s*/,
  DNS1123_INVALID: /[^a-z0-9-]+/g,
  DASH_DUPLICATE: /-+/g,
  EDGE_DASH: /^-+|-+$/g,
  IPV4: /^(?:\d{1,3}\.){3}\d{1,3}$/,
  IPV6: /^[0-9a-f:]+$/i,
});

const ENDPOINT_SYNC_ADDRESS_TYPE = Object.freeze({
  IPV4: 'IPv4',
  IPV6: 'IPv6',
  FQDN: 'FQDN',
});

const ENDPOINT_SYNC_HEALTH = Object.freeze({
  HEALTHY: WASM_SERVICE_HEALTH_STATUS.HEALTHY,
  UNHEALTHY: WASM_SERVICE_HEALTH_STATUS.UNHEALTHY,
});

const ENDPOINT_SYNC_NUM = Object.freeze({
  ZERO: 0,
  ONE: 1,
});

export {
  ENDPOINT_SYNC_ENV,
  ENDPOINT_SYNC_BOOLEAN,
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
  ENDPOINT_SYNC_ALLOWED_UNHEALTHY_POLICIES,
  ENDPOINT_SYNC_DEFAULT,
  ENDPOINT_SYNC_LABEL,
  ENDPOINT_SYNC_METRIC,
  ENDPOINT_SYNC_LOG,
  ENDPOINT_SYNC_EVENT_REASON,
  ENDPOINT_SYNC_EVENT_TYPE,
  ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE,
  ENDPOINT_SYNC_LEASE,
  ENDPOINT_SYNC_ERROR,
  ENDPOINT_SYNC_SOURCE_QUERY,
  ENDPOINT_SYNC_LIST_SEPARATOR,
  ENDPOINT_SYNC_NAME,
  ENDPOINT_SYNC_REGEX,
  ENDPOINT_SYNC_ADDRESS_TYPE,
  ENDPOINT_SYNC_HEALTH,
  ENDPOINT_SYNC_NUM,
};
