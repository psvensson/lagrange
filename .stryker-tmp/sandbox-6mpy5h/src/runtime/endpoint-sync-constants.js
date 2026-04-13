/**
 * Endpoint sync controller constants.
 *
 * Canonical constants for Kubernetes endpoint projection from
 * service_endpoints metadata.
 *
 * @module runtime/endpoint-sync-constants
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM } from '../constants/index.js';
import { WASM_SERVICE_PROTOCOL, WASM_SERVICE_HEALTH_STATUS } from '../wasm-service/wasm-service-constants.js';
const ENDPOINT_SYNC_ENV = Object.freeze(stryMutAct_9fa48("144953") ? {} : (stryCov_9fa48("144953"), {
  ADMIN_STREAM_URL: stryMutAct_9fa48("144954") ? "" : (stryCov_9fa48("144954"), 'ENDPOINT_SYNC_ADMIN_STREAM_URL'),
  ADMIN_AUTH_TOKEN: stryMutAct_9fa48("144955") ? "" : (stryCov_9fa48("144955"), 'ENDPOINT_SYNC_ADMIN_AUTH_TOKEN'),
  INTERVAL_MS: stryMutAct_9fa48("144956") ? "" : (stryCov_9fa48("144956"), 'ENDPOINT_SYNC_INTERVAL_MS'),
  PROTOCOL_ALLOWLIST: stryMutAct_9fa48("144957") ? "" : (stryCov_9fa48("144957"), 'ENDPOINT_SYNC_PROTOCOL_ALLOWLIST'),
  SERVICE_ID_ALLOWLIST: stryMutAct_9fa48("144958") ? "" : (stryCov_9fa48("144958"), 'ENDPOINT_SYNC_SERVICE_ID_ALLOWLIST'),
  HEALTHY_ONLY: stryMutAct_9fa48("144959") ? "" : (stryCov_9fa48("144959"), 'ENDPOINT_SYNC_HEALTHY_ONLY'),
  TARGET_NAMESPACE: stryMutAct_9fa48("144960") ? "" : (stryCov_9fa48("144960"), 'ENDPOINT_SYNC_TARGET_NAMESPACE'),
  STRICT_PORT_MODE: stryMutAct_9fa48("144961") ? "" : (stryCov_9fa48("144961"), 'ENDPOINT_SYNC_STRICT_PORT_MODE'),
  UNHEALTHY_POLICY: stryMutAct_9fa48("144962") ? "" : (stryCov_9fa48("144962"), 'ENDPOINT_SYNC_UNHEALTHY_POLICY'),
  MAX_ENDPOINTS_PER_SLICE: stryMutAct_9fa48("144963") ? "" : (stryCov_9fa48("144963"), 'ENDPOINT_SYNC_MAX_ENDPOINTS_PER_SLICE'),
  SERVICE_NAME_PREFIX: stryMutAct_9fa48("144964") ? "" : (stryCov_9fa48("144964"), 'ENDPOINT_SYNC_SERVICE_NAME_PREFIX'),
  LEADER_ELECTION_ENABLED: stryMutAct_9fa48("144965") ? "" : (stryCov_9fa48("144965"), 'ENDPOINT_SYNC_LEADER_ELECTION_ENABLED'),
  LEASE_NAME: stryMutAct_9fa48("144966") ? "" : (stryCov_9fa48("144966"), 'ENDPOINT_SYNC_LEASE_NAME'),
  LEASE_NAMESPACE: stryMutAct_9fa48("144967") ? "" : (stryCov_9fa48("144967"), 'ENDPOINT_SYNC_LEASE_NAMESPACE'),
  METRICS_ENABLED: stryMutAct_9fa48("144968") ? "" : (stryCov_9fa48("144968"), 'ENDPOINT_SYNC_METRICS_ENABLED'),
  SOURCE_QUERY_TIMEOUT_MS: stryMutAct_9fa48("144969") ? "" : (stryCov_9fa48("144969"), 'ENDPOINT_SYNC_SOURCE_QUERY_TIMEOUT_MS'),
  SOURCE_QUERY_MAX_RETRIES: stryMutAct_9fa48("144970") ? "" : (stryCov_9fa48("144970"), 'ENDPOINT_SYNC_SOURCE_QUERY_MAX_RETRIES'),
  SOURCE_QUERY_RETRY_DELAY_MS: stryMutAct_9fa48("144971") ? "" : (stryCov_9fa48("144971"), 'ENDPOINT_SYNC_SOURCE_QUERY_RETRY_DELAY_MS')
}));
const ENDPOINT_SYNC_BOOLEAN = Object.freeze(stryMutAct_9fa48("144972") ? {} : (stryCov_9fa48("144972"), {
  TRUE: stryMutAct_9fa48("144973") ? "" : (stryCov_9fa48("144973"), 'true'),
  FALSE: stryMutAct_9fa48("144974") ? "" : (stryCov_9fa48("144974"), 'false'),
  ONE: stryMutAct_9fa48("144975") ? "" : (stryCov_9fa48("144975"), '1'),
  ZERO: stryMutAct_9fa48("144976") ? "" : (stryCov_9fa48("144976"), '0')
}));
const ENDPOINT_SYNC_UNHEALTHY_POLICY = Object.freeze(stryMutAct_9fa48("144977") ? {} : (stryCov_9fa48("144977"), {
  EXCLUDE: stryMutAct_9fa48("144978") ? "" : (stryCov_9fa48("144978"), 'exclude'),
  NOT_READY: stryMutAct_9fa48("144979") ? "" : (stryCov_9fa48("144979"), 'not_ready')
}));
const ENDPOINT_SYNC_ALLOWED_UNHEALTHY_POLICIES = Object.freeze(new Set(Object.values(ENDPOINT_SYNC_UNHEALTHY_POLICY)));
const ENDPOINT_SYNC_DEFAULT = Object.freeze(stryMutAct_9fa48("144980") ? {} : (stryCov_9fa48("144980"), {
  INTERVAL_MS: 5000,
  HEALTHY_ONLY: stryMutAct_9fa48("144981") ? false : (stryCov_9fa48("144981"), true),
  STRICT_PORT_MODE: stryMutAct_9fa48("144982") ? false : (stryCov_9fa48("144982"), true),
  UNHEALTHY_POLICY: ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE,
  MAX_ENDPOINTS_PER_SLICE: 100,
  SERVICE_NAME_PREFIX: stryMutAct_9fa48("144983") ? "" : (stryCov_9fa48("144983"), 'svc'),
  LEADER_ELECTION_ENABLED: stryMutAct_9fa48("144984") ? false : (stryCov_9fa48("144984"), true),
  LEASE_NAME: stryMutAct_9fa48("144985") ? "" : (stryCov_9fa48("144985"), 'endpoint-sync-controller'),
  METRICS_ENABLED: stryMutAct_9fa48("144986") ? false : (stryCov_9fa48("144986"), true),
  SOURCE_QUERY_TIMEOUT_MS: 30000,
  SOURCE_QUERY_MAX_RETRIES: 3,
  SOURCE_QUERY_RETRY_DELAY_MS: 1000,
  PROTOCOL_ALLOWLIST: Object.freeze(stryMutAct_9fa48("144987") ? [] : (stryCov_9fa48("144987"), [WASM_SERVICE_PROTOCOL.POSTGRESQL])),
  SERVICE_ID_ALLOWLIST: Object.freeze(stryMutAct_9fa48("144988") ? ["Stryker was here"] : (stryCov_9fa48("144988"), []))
}));
const ENDPOINT_SYNC_LABEL = Object.freeze(stryMutAct_9fa48("144989") ? {} : (stryCov_9fa48("144989"), {
  MANAGED_KEY: stryMutAct_9fa48("144990") ? "" : (stryCov_9fa48("144990"), 'endpointsync.system/managed'),
  MANAGED_VALUE: stryMutAct_9fa48("144991") ? "" : (stryCov_9fa48("144991"), 'true'),
  SOURCE_KEY: stryMutAct_9fa48("144992") ? "" : (stryCov_9fa48("144992"), 'endpointsync.system/source'),
  SOURCE_VALUE: stryMutAct_9fa48("144993") ? "" : (stryCov_9fa48("144993"), 'service_endpoints'),
  SERVICE_KEY: stryMutAct_9fa48("144994") ? "" : (stryCov_9fa48("144994"), 'endpointsync.system/service-key')
}));
const ENDPOINT_SYNC_METRIC = Object.freeze(stryMutAct_9fa48("144995") ? {} : (stryCov_9fa48("144995"), {
  RECONCILE_DURATION_MS: stryMutAct_9fa48("144996") ? "" : (stryCov_9fa48("144996"), 'endpoint_sync_reconcile_duration_ms'),
  RECONCILE_FAILURES_TOTAL: stryMutAct_9fa48("144997") ? "" : (stryCov_9fa48("144997"), 'endpoint_sync_reconcile_failures_total'),
  EXPORTED_SERVICES: stryMutAct_9fa48("144998") ? "" : (stryCov_9fa48("144998"), 'endpoint_sync_exported_services'),
  EXPORTED_ENDPOINTS: stryMutAct_9fa48("144999") ? "" : (stryCov_9fa48("144999"), 'endpoint_sync_exported_endpoints'),
  PORT_CONFLICT_TOTAL: stryMutAct_9fa48("145000") ? "" : (stryCov_9fa48("145000"), 'endpoint_sync_port_conflict_total')
}));
const ENDPOINT_SYNC_LOG = Object.freeze(stryMutAct_9fa48("145001") ? {} : (stryCov_9fa48("145001"), {
  RECONCILE_SUMMARY: stryMutAct_9fa48("145002") ? "" : (stryCov_9fa48("145002"), 'endpoint_sync.reconcile.summary'),
  RECONCILE_FAILURE: stryMutAct_9fa48("145003") ? "" : (stryCov_9fa48("145003"), 'endpoint_sync.reconcile.failure'),
  GROUP_FAILURE: stryMutAct_9fa48("145004") ? "" : (stryCov_9fa48("145004"), 'endpoint_sync.reconcile.group_failure'),
  LEADER_STATUS: stryMutAct_9fa48("145005") ? "" : (stryCov_9fa48("145005"), 'endpoint_sync.leader.status'),
  EVENT_EMIT_FAILURE: stryMutAct_9fa48("145006") ? "" : (stryCov_9fa48("145006"), 'endpoint_sync.event.emit_failure')
}));
const ENDPOINT_SYNC_EVENT_REASON = Object.freeze(stryMutAct_9fa48("145007") ? {} : (stryCov_9fa48("145007"), {
  PORT_CONFLICT: stryMutAct_9fa48("145008") ? "" : (stryCov_9fa48("145008"), 'PortConflict'),
  SOURCE_QUERY_FAILED: stryMutAct_9fa48("145009") ? "" : (stryCov_9fa48("145009"), 'SourceQueryFailed'),
  RECONCILE_FAILED: stryMutAct_9fa48("145010") ? "" : (stryCov_9fa48("145010"), 'ReconcileFailed')
}));
const ENDPOINT_SYNC_EVENT_TYPE = Object.freeze(stryMutAct_9fa48("145011") ? {} : (stryCov_9fa48("145011"), {
  WARNING: stryMutAct_9fa48("145012") ? "" : (stryCov_9fa48("145012"), 'Warning')
}));
const ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE = Object.freeze(stryMutAct_9fa48("145013") ? {} : (stryCov_9fa48("145013"), {
  SERVICE: stryMutAct_9fa48("145014") ? "" : (stryCov_9fa48("145014"), 'service'),
  ENDPOINT_SLICE: stryMutAct_9fa48("145015") ? "" : (stryCov_9fa48("145015"), 'endpoint_slice'),
  GARBAGE_COLLECTION: stryMutAct_9fa48("145016") ? "" : (stryCov_9fa48("145016"), 'garbage_collection')
}));
const ENDPOINT_SYNC_LEASE = Object.freeze(stryMutAct_9fa48("145017") ? {} : (stryCov_9fa48("145017"), {
  API_VERSION: stryMutAct_9fa48("145018") ? "" : (stryCov_9fa48("145018"), 'coordination.k8s.io/v1'),
  KIND: stryMutAct_9fa48("145019") ? "" : (stryCov_9fa48("145019"), 'Lease'),
  DEFAULT_DURATION_SECONDS: 15,
  HOLDER_IDENTITY_FALLBACK: stryMutAct_9fa48("145020") ? "" : (stryCov_9fa48("145020"), 'endpoint-sync-controller')
}));
const ENDPOINT_SYNC_ERROR = Object.freeze(stryMutAct_9fa48("145021") ? {} : (stryCov_9fa48("145021"), {
  ADMIN_STREAM_URL_REQUIRED: stryMutAct_9fa48("145022") ? "" : (stryCov_9fa48("145022"), 'ENDPOINT_SYNC_ADMIN_STREAM_URL is required'),
  ADMIN_STREAM_URL_INVALID: stryMutAct_9fa48("145023") ? "" : (stryCov_9fa48("145023"), 'ENDPOINT_SYNC_ADMIN_STREAM_URL must start with ws:// or wss://'),
  INVALID_BOOLEAN_PREFIX: stryMutAct_9fa48("145024") ? "" : (stryCov_9fa48("145024"), 'Invalid boolean value for env key'),
  INVALID_INTEGER_PREFIX: stryMutAct_9fa48("145025") ? "" : (stryCov_9fa48("145025"), 'Invalid positive integer value for env key'),
  INVALID_UNHEALTHY_POLICY: stryMutAct_9fa48("145026") ? "" : (stryCov_9fa48("145026"), 'ENDPOINT_SYNC_UNHEALTHY_POLICY must be one of: exclude, not_ready'),
  PROTOCOL_ALLOWLIST_EMPTY: stryMutAct_9fa48("145027") ? "" : (stryCov_9fa48("145027"), 'ENDPOINT_SYNC_PROTOCOL_ALLOWLIST must contain at least one protocol'),
  SERVICE_NAME_PREFIX_REQUIRED: stryMutAct_9fa48("145028") ? "" : (stryCov_9fa48("145028"), 'ENDPOINT_SYNC_SERVICE_NAME_PREFIX must be non-empty'),
  LEASE_NAME_REQUIRED: stryMutAct_9fa48("145029") ? "" : (stryCov_9fa48("145029"), 'ENDPOINT_SYNC_LEASE_NAME must be non-empty'),
  SOURCE_QUERY_TIMEOUT: stryMutAct_9fa48("145030") ? "" : (stryCov_9fa48("145030"), 'Endpoint source query timed out'),
  SOURCE_QUERY_FAILED: stryMutAct_9fa48("145031") ? "" : (stryCov_9fa48("145031"), 'Endpoint source query failed'),
  SOURCE_QUERY_UNEXPECTED_MESSAGE: stryMutAct_9fa48("145032") ? "" : (stryCov_9fa48("145032"), 'Unexpected message from admin stream source query'),
  QUERY_RESULT_ERROR_PREFIX: stryMutAct_9fa48("145033") ? "" : (stryCov_9fa48("145033"), 'Admin stream query_result returned error'),
  QUERY_RESULT_ROWS_INVALID: stryMutAct_9fa48("145034") ? "" : (stryCov_9fa48("145034"), 'Admin stream query_result rows field must be an array'),
  STRICT_PORT_CONFLICT: stryMutAct_9fa48("145035") ? "" : (stryCov_9fa48("145035"), 'Strict port mode requires one unique port per logical service')
}));
const ENDPOINT_SYNC_SOURCE_QUERY = Object.freeze(stryMutAct_9fa48("145036") ? {} : (stryCov_9fa48("145036"), {
  QUERY_ID_PREFIX: stryMutAct_9fa48("145037") ? "" : (stryCov_9fa48("145037"), 'endpoint-sync-query-')
}));
const ENDPOINT_SYNC_LIST_SEPARATOR = Object.freeze(stryMutAct_9fa48("145038") ? {} : (stryCov_9fa48("145038"), {
  COMMA: stryMutAct_9fa48("145039") ? "" : (stryCov_9fa48("145039"), ','),
  SERVICE_KEY: stryMutAct_9fa48("145040") ? "" : (stryCov_9fa48("145040"), '|')
}));
const ENDPOINT_SYNC_NAME = Object.freeze(stryMutAct_9fa48("145041") ? {} : (stryCov_9fa48("145041"), {
  DNS1123_MAX_LENGTH: 63,
  HASH_LENGTH: 8,
  FALLBACK_SEGMENT: stryMutAct_9fa48("145042") ? "" : (stryCov_9fa48("145042"), 'svc'),
  CONCAT_SEPARATOR: stryMutAct_9fa48("145043") ? "" : (stryCov_9fa48("145043"), '-')
}));
const ENDPOINT_SYNC_REGEX = Object.freeze(stryMutAct_9fa48("145044") ? {} : (stryCov_9fa48("145044"), {
  WS_SCHEME: stryMutAct_9fa48("145046") ? /^wss:\/\// : stryMutAct_9fa48("145045") ? /wss?:\/\// : (stryCov_9fa48("145045", "145046"), /^wss?:\/\//),
  COMMA_SPLIT: stryMutAct_9fa48("145050") ? /\s*,\S*/ : stryMutAct_9fa48("145049") ? /\s*,\s/ : stryMutAct_9fa48("145048") ? /\S*,\s*/ : stryMutAct_9fa48("145047") ? /\s,\s*/ : (stryCov_9fa48("145047", "145048", "145049", "145050"), /\s*,\s*/),
  DNS1123_INVALID: stryMutAct_9fa48("145052") ? /[a-z0-9-]+/g : stryMutAct_9fa48("145051") ? /[^a-z0-9-]/g : (stryCov_9fa48("145051", "145052"), /[^a-z0-9-]+/g),
  DASH_DUPLICATE: stryMutAct_9fa48("145053") ? /-/g : (stryCov_9fa48("145053"), /-+/g),
  EDGE_DASH: stryMutAct_9fa48("145057") ? /^-+|-$/g : stryMutAct_9fa48("145056") ? /^-+|-+/g : stryMutAct_9fa48("145055") ? /^-|-+$/g : stryMutAct_9fa48("145054") ? /-+|-+$/g : (stryCov_9fa48("145054", "145055", "145056", "145057"), /^-+|-+$/g),
  IPV4: stryMutAct_9fa48("145064") ? /^(?:\d{1,3}\.){3}\D{1,3}$/ : stryMutAct_9fa48("145063") ? /^(?:\d{1,3}\.){3}\d$/ : stryMutAct_9fa48("145062") ? /^(?:\D{1,3}\.){3}\d{1,3}$/ : stryMutAct_9fa48("145061") ? /^(?:\d\.){3}\d{1,3}$/ : stryMutAct_9fa48("145060") ? /^(?:\d{1,3}\.)\d{1,3}$/ : stryMutAct_9fa48("145059") ? /^(?:\d{1,3}\.){3}\d{1,3}/ : stryMutAct_9fa48("145058") ? /(?:\d{1,3}\.){3}\d{1,3}$/ : (stryCov_9fa48("145058", "145059", "145060", "145061", "145062", "145063", "145064"), /^(?:\d{1,3}\.){3}\d{1,3}$/),
  IPV6: stryMutAct_9fa48("145068") ? /^[^0-9a-f:]+$/i : stryMutAct_9fa48("145067") ? /^[0-9a-f:]$/i : stryMutAct_9fa48("145066") ? /^[0-9a-f:]+/i : stryMutAct_9fa48("145065") ? /[0-9a-f:]+$/i : (stryCov_9fa48("145065", "145066", "145067", "145068"), /^[0-9a-f:]+$/i)
}));
const ENDPOINT_SYNC_ADDRESS_TYPE = Object.freeze(stryMutAct_9fa48("145069") ? {} : (stryCov_9fa48("145069"), {
  IPV4: stryMutAct_9fa48("145070") ? "" : (stryCov_9fa48("145070"), 'IPv4'),
  IPV6: stryMutAct_9fa48("145071") ? "" : (stryCov_9fa48("145071"), 'IPv6'),
  FQDN: stryMutAct_9fa48("145072") ? "" : (stryCov_9fa48("145072"), 'FQDN')
}));
const ENDPOINT_SYNC_HEALTH = Object.freeze(stryMutAct_9fa48("145073") ? {} : (stryCov_9fa48("145073"), {
  HEALTHY: WASM_SERVICE_HEALTH_STATUS.HEALTHY,
  UNHEALTHY: WASM_SERVICE_HEALTH_STATUS.UNHEALTHY
}));
const ENDPOINT_SYNC_NUM = Object.freeze(stryMutAct_9fa48("145074") ? {} : (stryCov_9fa48("145074"), {
  ZERO: NUM.ZERO,
  ONE: NUM.ONE
}));
export { ENDPOINT_SYNC_ENV, ENDPOINT_SYNC_BOOLEAN, ENDPOINT_SYNC_UNHEALTHY_POLICY, ENDPOINT_SYNC_ALLOWED_UNHEALTHY_POLICIES, ENDPOINT_SYNC_DEFAULT, ENDPOINT_SYNC_LABEL, ENDPOINT_SYNC_METRIC, ENDPOINT_SYNC_LOG, ENDPOINT_SYNC_EVENT_REASON, ENDPOINT_SYNC_EVENT_TYPE, ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE, ENDPOINT_SYNC_LEASE, ENDPOINT_SYNC_ERROR, ENDPOINT_SYNC_SOURCE_QUERY, ENDPOINT_SYNC_LIST_SEPARATOR, ENDPOINT_SYNC_NAME, ENDPOINT_SYNC_REGEX, ENDPOINT_SYNC_ADDRESS_TYPE, ENDPOINT_SYNC_HEALTH, ENDPOINT_SYNC_NUM };