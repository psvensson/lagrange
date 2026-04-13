/**
 * CDC Integration Service - Routes all system table writes through SQL.
 * Ensures cache consistency by making CDC the single source of truth.
 *
 * Bootstrap-Direct Write Phase:
 * - Seed node uses a bootstrap-direct phase during initial setup
 * - The bootstrap-direct phase enables direct writes to local partitions
 * - Required because system cache is empty during seed node bootstrap
 * - After bootstrap, the service switches to sql-routed steady state
            if (repaired) {
 * Sql-Routed Steady State:
 * - All writes route through SQL query engine
 * - SQL engine uses system cache to find partition leaders
 * - Writes go to partition leader via message router
 * - Partition generates CDC event that updates all caches
 * - Single code path - no fallbacks or legacy mechanisms
 *
 * Requirements: 3.5, 5.6, 5.7, 5.8, 5.9, 5.10
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
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { LoggingService } from '../logging/logging-service.js';
import { CDC_OPERATION, COLUMN, ENTITY_TYPE, ERRORS, METRICS_LOG_TAG, NUM, SERVICE_STATUS, SERVICE_TYPE, SQL, STATE, STRING, TIME_MS, TYPEOF, ADDRESS, PROTOCOL } from '../constants/index.js';
import { ENTRYPOINT_DEFAULT } from '../constants/entrypoint.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { TIMEOUT_BUDGET_CLASSIFICATION, createTimeoutBudget, createTimeoutBudgetError, getRemainingBudgetMs } from '../control-plane/timeout-budget.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { buildPressureAdmissionFailure, PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { getControlPlaneErrorCode, getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../control-plane/control-plane-error-classification.js';
import { READ_MODEL_DIVERGENCE_TYPE, SQL_RECONCILIATION_REASON, buildDivergenceEvent } from '../control-plane/read-model-contract.js';
import { canonicalizeSystemTableRow } from '../control-plane/system-row-normalizers.js';
import { HLCClockService } from '../hlc/hlc-clock-service.js';
import { QUERY_ERROR_CODE, QUERY_ERROR_MSG } from '../query/query-constants.js';
import { SYSTEM_TABLE_NAME, INITIAL_PARTITION_IDS, getSchemaByTableName } from '../bootstrap/system-table-schemas-constants.js';
import { getSystemCachePrimaryKeyFieldOrFallback } from '../cache/system-cache-key-descriptor.js';
import { isTableInternalCachePropagationEnabled } from '../cache/cdc-table-policy.js';
import { CDCEventHandler } from './cdc-event-handler.js';
import { CDC_CONFIG_KEY, CDC_DEFAULTS, CDC_EPOCH_CONFIG_KEY, CDC_EVENT, CDC_ERROR_MSG, CDC_LOG_MSG, CDC_OPERATION_LABEL, CDC_PRIMARY_KEY, CDC_RETRY, CDC_SESSION, CDC_SKIP_REASON, CDC_SOURCE, CDC_SQL, CDC_STATS_DEFAULT, CDC_SUBSYSTEM } from './cdc-constants.js';
import { WRITE_ROUTER_MODE, createBootstrapDirectWriteRouter, createSqlWriteRouter } from './write-router/index.js';
import { NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE, resolveNodeWebSocketAddress } from '../transport/node-address-resolution.js';

/**
 * Valid system table names for CDC operations.
 */
const CDC_INTEGRATION_SERVICE_LITERAL = Object.freeze(stryMutAct_9fa48("35905") ? {} : (stryCov_9fa48("35905"), {
  VISIBILITYSTATE: stryMutAct_9fa48("35906") ? "" : (stryCov_9fa48("35906"), "visibilityState"),
  READY: stryMutAct_9fa48("35907") ? "" : (stryCov_9fa48("35907"), "ready"),
  DEFERRED: stryMutAct_9fa48("35908") ? "" : (stryCov_9fa48("35908"), "deferred"),
  LEADER: stryMutAct_9fa48("35909") ? "" : (stryCov_9fa48("35909"), "leader"),
  LOCAL_PARTITION_QUERY_UNAVAILABLE: stryMutAct_9fa48("35910") ? "" : (stryCov_9fa48("35910"), "local_partition_query_unavailable"),
  FAILED_TO_READ_AUTHORITATIVE_SYSTEM_TABLE_ROWS_FROM_LOCAL: stryMutAct_9fa48("35911") ? "" : (stryCov_9fa48("35911"), "Failed to read authoritative system table rows from local "),
  PARTITION_REPLICA: stryMutAct_9fa48("35912") ? "" : (stryCov_9fa48("35912"), "partition replica"),
  QUERY_DATA_PLANE_TRANSPORT_NOT_READY: stryMutAct_9fa48("35913") ? "" : (stryCov_9fa48("35913"), "query_data_plane_transport_not_ready"),
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE: stryMutAct_9fa48("35914") ? "" : (stryCov_9fa48("35914"), "authoritative_row_source_unavailable"),
  AUTHORITATIVE_QUERY_FAILED: stryMutAct_9fa48("35915") ? "" : (stryCov_9fa48("35915"), "authoritative_query_failed"),
  SELECT: stryMutAct_9fa48("35916") ? "" : (stryCov_9fa48("35916"), "SELECT"),
  EMPTY: stryMutAct_9fa48("35917") ? "Stryker was here!" : (stryCov_9fa48("35917"), ""),
  EMPTY_2: stryMutAct_9fa48("35918") ? "" : (stryCov_9fa48("35918"), ", "),
  EXECUTING_SQL_DIRECTLY_ON_LOCAL_PARTITION_BOOTSTRAP_MODE: stryMutAct_9fa48("35919") ? "" : (stryCov_9fa48("35919"), "Executing SQL directly on local partition (bootstrap mode)"),
  CDC_WRITE_ROUTER_IS_NOT_CONFIGURED: stryMutAct_9fa48("35920") ? "" : (stryCov_9fa48("35920"), "CDC write router is not configured"),
  NO_CONNECTION_TO_NODE: stryMutAct_9fa48("35921") ? "" : (stryCov_9fa48("35921"), "No connection to node"),
  FAILED_TO_FORWARD_WRITE_TO_LEADER: stryMutAct_9fa48("35922") ? "" : (stryCov_9fa48("35922"), "Failed to forward write to leader"),
  MESSAGE_TIMEOUT: stryMutAct_9fa48("35923") ? "" : (stryCov_9fa48("35923"), "Message timeout"),
  VALUE_60: 60,
  VALUE_1000: 1000,
  DIAGNOSED_CACHE_VISIBILITY_GAP_FROM_AUTHORITATIVE_SYSTEM_TABLE_READ: stryMutAct_9fa48("35924") ? "" : (stryCov_9fa48("35924"), "Diagnosed cache visibility gap from authoritative system table read"),
  UNKNOWN: stryMutAct_9fa48("35925") ? "" : (stryCov_9fa48("35925"), "unknown"),
  EMPTY_3: stryMutAct_9fa48("35926") ? "" : (stryCov_9fa48("35926"), "[]"),
  EMPTY_4: stryMutAct_9fa48("35927") ? "" : (stryCov_9fa48("35927"), "'"),
  EMPTY_5: stryMutAct_9fa48("35928") ? "" : (stryCov_9fa48("35928"), "\""),
  NULL: stryMutAct_9fa48("35929") ? "" : (stryCov_9fa48("35929"), "null"),
  DEFAULT_VALUE_STATE_NULL: stryMutAct_9fa48("35930") ? "" : (stryCov_9fa48("35930"), "null"),
  DEFAULT_VALUE_STATE_UNDEFINED: stryMutAct_9fa48("35931") ? "" : (stryCov_9fa48("35931"), "undefined"),
  DEFAULT_VALUE_STATE_VALUE: stryMutAct_9fa48("35932") ? "" : (stryCov_9fa48("35932"), "value"),
  TABLE_NAME_EXTRACTION_STATE_FOUND: stryMutAct_9fa48("35933") ? "" : (stryCov_9fa48("35933"), "found"),
  TABLE_NAME_EXTRACTION_STATE_INVALID_INPUT: stryMutAct_9fa48("35934") ? "" : (stryCov_9fa48("35934"), "invalid_input"),
  TABLE_NAME_EXTRACTION_STATE_NOT_FOUND: stryMutAct_9fa48("35935") ? "" : (stryCov_9fa48("35935"), "not_found")
}));
const VALID_SYSTEM_TABLES = Object.values(SYSTEM_TABLE_NAME);

/**
 * CDC operation types.
 */
const CDCOperationType = CDC_OPERATION;

/**
 * Config key for the current epoch in the config table.
 */
const EPOCH_CONFIG_KEY = CDC_EPOCH_CONFIG_KEY;
const delay = stryMutAct_9fa48("35936") ? () => undefined : (stryCov_9fa48("35936"), (() => {
  const delay = ms => new Promise(stryMutAct_9fa48("35937") ? () => undefined : (stryCov_9fa48("35937"), resolve => setTimeout(resolve, ms)));
  return delay;
})());
function materializeNormalizedDefaultValue(result) {
  if (stryMutAct_9fa48("35938")) {
    {}
  } else {
    stryCov_9fa48("35938");
    if (stryMutAct_9fa48("35941") ? result.state !== CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE : stryMutAct_9fa48("35940") ? false : stryMutAct_9fa48("35939") ? true : (stryCov_9fa48("35939", "35940", "35941"), result.state === CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE)) {
      if (stryMutAct_9fa48("35942")) {
        {}
      } else {
        stryCov_9fa48("35942");
        return result.value;
      }
    }
    if (stryMutAct_9fa48("35945") ? result.state !== CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_NULL : stryMutAct_9fa48("35944") ? false : stryMutAct_9fa48("35943") ? true : (stryCov_9fa48("35943", "35944", "35945"), result.state === CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_NULL)) {
      if (stryMutAct_9fa48("35946")) {
        {}
      } else {
        stryCov_9fa48("35946");
        return null;
      }
    }
    return undefined;
  }
}

/**
 * Determine whether CDC write-route metrics should be emitted for a table.
 * Metrics for logs table writes are skipped to avoid feedback loops where
 * persisted metrics generate more persisted metrics. Heartbeat-driven writes
 * for nodes and node_endpoints are also excluded to avoid periodic idle noise.
 * @param {string|null} tableName
 * @return {boolean}
 */
const TABLE_WRITE_METRIC_SUPPRESSED_TABLES = new Set(stryMutAct_9fa48("35947") ? [] : (stryCov_9fa48("35947"), [SYSTEM_TABLE_NAME.LOGS, SYSTEM_TABLE_NAME.NODES, SYSTEM_TABLE_NAME.NODE_ENDPOINTS]));
const TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES = new Set(stryMutAct_9fa48("35948") ? [] : (stryCov_9fa48("35948"), [SYSTEM_TABLE_NAME.LOGS]));
const AUTHORITATIVE_FALLBACK_PHASE = Object.freeze(stryMutAct_9fa48("35949") ? {} : (stryCov_9fa48("35949"), {
  BOOTSTRAP: stryMutAct_9fa48("35950") ? "" : (stryCov_9fa48("35950"), 'bootstrap'),
  RECOVERY: stryMutAct_9fa48("35951") ? "" : (stryCov_9fa48("35951"), 'recovery'),
  STEADY_STATE: stryMutAct_9fa48("35952") ? "" : (stryCov_9fa48("35952"), 'steady_state')
}));
const AUTHORITATIVE_FALLBACK_OUTCOME = Object.freeze(stryMutAct_9fa48("35953") ? {} : (stryCov_9fa48("35953"), {
  RECOVERED: stryMutAct_9fa48("35954") ? "" : (stryCov_9fa48("35954"), 'recovered'),
  DIAGNOSED: stryMutAct_9fa48("35955") ? "" : (stryCov_9fa48("35955"), 'diagnosed'),
  FAILED: stryMutAct_9fa48("35956") ? "" : (stryCov_9fa48("35956"), 'failed')
}));
const AUTHORITATIVE_FALLBACK_WINDOW_MS = TIME_MS.MINUTE;
const AUTHORITATIVE_FALLBACK_RECENT_LIMIT = NUM.TEN;
const AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS = 250;
const AUTHORITATIVE_FALLBACK_RETRY_DELAY_MS = 25;
const LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY = Object.freeze(stryMutAct_9fa48("35957") ? {} : (stryCov_9fa48("35957"), {
  ANY_REPLICA: stryMutAct_9fa48("35958") ? "" : (stryCov_9fa48("35958"), 'any_replica'),
  LOCAL_LEADER: stryMutAct_9fa48("35959") ? "" : (stryCov_9fa48("35959"), 'local_leader')
}));
const CDC_INTEGRATION_SERVICE_ERROR = Object.freeze(stryMutAct_9fa48("35960") ? {} : (stryCov_9fa48("35960"), {
  MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS: stryMutAct_9fa48("35961") ? "" : (stryCov_9fa48("35961"), 'Missing canonical node_endpoints websocket address')
}));
const QUERY_TRANSPORT_NOT_READY_ERROR_CODE = stryMutAct_9fa48("35962") ? "" : (stryCov_9fa48("35962"), 'ROUTER_QUERY_TRANSPORT_NOT_READY');
const AUTHORITATIVE_READ_SOURCE = Object.freeze(stryMutAct_9fa48("35963") ? {} : (stryCov_9fa48("35963"), {
  LOCAL_PARTITION_REPLICA: stryMutAct_9fa48("35964") ? "" : (stryCov_9fa48("35964"), 'local_partition_replica'),
  QUERY_TRANSPORT_PREFLIGHT: stryMutAct_9fa48("35965") ? "" : (stryCov_9fa48("35965"), 'query_transport_preflight'),
  OWNER_RPC_LANE: stryMutAct_9fa48("35966") ? "" : (stryCov_9fa48("35966"), 'owner_rpc_lane')
}));
const SYSTEM_TABLE_VISIBILITY_STATE = Object.freeze(stryMutAct_9fa48("35967") ? {} : (stryCov_9fa48("35967"), {
  VISIBLE: stryMutAct_9fa48("35968") ? "" : (stryCov_9fa48("35968"), 'visible'),
  PENDING_VISIBILITY: stryMutAct_9fa48("35969") ? "" : (stryCov_9fa48("35969"), 'pending_visibility'),
  DEFERRED_BY_PRESSURE: stryMutAct_9fa48("35970") ? "" : (stryCov_9fa48("35970"), 'deferred_by_pressure')
}));
function normalizeSystemTableVisibilityState(value, fallback = null) {
  if (stryMutAct_9fa48("35971")) {
    {}
  } else {
    stryCov_9fa48("35971");
    if (stryMutAct_9fa48("35974") ? value !== SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE : stryMutAct_9fa48("35973") ? false : stryMutAct_9fa48("35972") ? true : (stryCov_9fa48("35972", "35973", "35974"), value === SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE)) {
      if (stryMutAct_9fa48("35975")) {
        {}
      } else {
        stryCov_9fa48("35975");
        return SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE;
      }
    }
    if (stryMutAct_9fa48("35978") ? value !== SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY : stryMutAct_9fa48("35977") ? false : stryMutAct_9fa48("35976") ? true : (stryCov_9fa48("35976", "35977", "35978"), value === SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY)) {
      if (stryMutAct_9fa48("35979")) {
        {}
      } else {
        stryCov_9fa48("35979");
        return SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY;
      }
    }
    if (stryMutAct_9fa48("35982") ? value !== SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE : stryMutAct_9fa48("35981") ? false : stryMutAct_9fa48("35980") ? true : (stryCov_9fa48("35980", "35981", "35982"), value === SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE)) {
      if (stryMutAct_9fa48("35983")) {
        {}
      } else {
        stryCov_9fa48("35983");
        return SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE;
      }
    }
    return fallback;
  }
}
function buildSystemTableVisibilityResult(options = {}) {
  if (stryMutAct_9fa48("35984")) {
    {}
  } else {
    stryCov_9fa48("35984");
    const hasExplicitVisibilityState = stryMutAct_9fa48("35987") ? options && typeof options === TYPEOF.OBJECT || Object.hasOwn(options, 'visibilityState') : stryMutAct_9fa48("35986") ? false : stryMutAct_9fa48("35985") ? true : (stryCov_9fa48("35985", "35986", "35987"), (stryMutAct_9fa48("35989") ? options || typeof options === TYPEOF.OBJECT : stryMutAct_9fa48("35988") ? true : (stryCov_9fa48("35988", "35989"), options && (stryMutAct_9fa48("35991") ? typeof options !== TYPEOF.OBJECT : stryMutAct_9fa48("35990") ? true : (stryCov_9fa48("35990", "35991"), typeof options === TYPEOF.OBJECT)))) && Object.hasOwn(options, stryMutAct_9fa48("35992") ? "" : (stryCov_9fa48("35992"), 'visibilityState')));
    const visibilityState = normalizeSystemTableVisibilityState(stryMutAct_9fa48("35993") ? options.visibilityState : (stryCov_9fa48("35993"), options?.visibilityState), hasExplicitVisibilityState ? null : SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE);
    return Object.freeze(stryMutAct_9fa48("35994") ? {} : (stryCov_9fa48("35994"), {
      visibilityState,
      visible: stryMutAct_9fa48("35997") ? visibilityState !== SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE : stryMutAct_9fa48("35996") ? false : stryMutAct_9fa48("35995") ? true : (stryCov_9fa48("35995", "35996", "35997"), visibilityState === SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE),
      authoritativeVisibilityConfirmed: stryMutAct_9fa48("36000") ? options?.authoritativeVisibilityConfirmed !== true : stryMutAct_9fa48("35999") ? false : stryMutAct_9fa48("35998") ? true : (stryCov_9fa48("35998", "35999", "36000"), (stryMutAct_9fa48("36001") ? options.authoritativeVisibilityConfirmed : (stryCov_9fa48("36001"), options?.authoritativeVisibilityConfirmed)) === (stryMutAct_9fa48("36002") ? false : (stryCov_9fa48("36002"), true))),
      cacheRepaired: stryMutAct_9fa48("36005") ? options?.cacheRepaired !== true : stryMutAct_9fa48("36004") ? false : stryMutAct_9fa48("36003") ? true : (stryCov_9fa48("36003", "36004", "36005"), (stryMutAct_9fa48("36006") ? options.cacheRepaired : (stryCov_9fa48("36006"), options?.cacheRepaired)) === (stryMutAct_9fa48("36007") ? false : (stryCov_9fa48("36007"), true))),
      pressureAction: (stryMutAct_9fa48("36010") ? typeof options?.pressureAction !== TYPEOF.STRING : stryMutAct_9fa48("36009") ? false : stryMutAct_9fa48("36008") ? true : (stryCov_9fa48("36008", "36009", "36010"), typeof (stryMutAct_9fa48("36011") ? options.pressureAction : (stryCov_9fa48("36011"), options?.pressureAction)) === TYPEOF.STRING)) ? options.pressureAction : null,
      pressureReason: (stryMutAct_9fa48("36014") ? typeof options?.pressureReason !== TYPEOF.STRING : stryMutAct_9fa48("36013") ? false : stryMutAct_9fa48("36012") ? true : (stryCov_9fa48("36012", "36013", "36014"), typeof (stryMutAct_9fa48("36015") ? options.pressureReason : (stryCov_9fa48("36015"), options?.pressureReason)) === TYPEOF.STRING)) ? options.pressureReason : null,
      retryAfterMs: (stryMutAct_9fa48("36018") ? Number.isFinite(options?.retryAfterMs) || options.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("36017") ? false : stryMutAct_9fa48("36016") ? true : (stryCov_9fa48("36016", "36017", "36018"), Number.isFinite(stryMutAct_9fa48("36019") ? options.retryAfterMs : (stryCov_9fa48("36019"), options?.retryAfterMs)) && (stryMutAct_9fa48("36022") ? options.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("36021") ? options.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("36020") ? true : (stryCov_9fa48("36020", "36021", "36022"), options.retryAfterMs > NUM.ZERO)))) ? Math.floor(options.retryAfterMs) : null
    }));
  }
}
function normalizeSystemTableVisibilityResult(result, fallbackState = null) {
  if (stryMutAct_9fa48("36023")) {
    {}
  } else {
    stryCov_9fa48("36023");
    if (stryMutAct_9fa48("36026") ? result && typeof result === TYPEOF.OBJECT || Object.hasOwn(result, CDC_INTEGRATION_SERVICE_LITERAL.VISIBILITYSTATE) : stryMutAct_9fa48("36025") ? false : stryMutAct_9fa48("36024") ? true : (stryCov_9fa48("36024", "36025", "36026"), (stryMutAct_9fa48("36028") ? result || typeof result === TYPEOF.OBJECT : stryMutAct_9fa48("36027") ? true : (stryCov_9fa48("36027", "36028"), result && (stryMutAct_9fa48("36030") ? typeof result !== TYPEOF.OBJECT : stryMutAct_9fa48("36029") ? true : (stryCov_9fa48("36029", "36030"), typeof result === TYPEOF.OBJECT)))) && Object.hasOwn(result, CDC_INTEGRATION_SERVICE_LITERAL.VISIBILITYSTATE))) {
      if (stryMutAct_9fa48("36031")) {
        {}
      } else {
        stryCov_9fa48("36031");
        return buildSystemTableVisibilityResult(stryMutAct_9fa48("36032") ? {} : (stryCov_9fa48("36032"), {
          ...result,
          visibilityState: normalizeSystemTableVisibilityState(result.visibilityState, fallbackState)
        }));
      }
    }
    return buildSystemTableVisibilityResult(stryMutAct_9fa48("36033") ? {} : (stryCov_9fa48("36033"), {
      visibilityState: fallbackState
    }));
  }
}
function resolveAuthoritativeFallbackOutcome(recovered) {
  if (stryMutAct_9fa48("36034")) {
    {}
  } else {
    stryCov_9fa48("36034");
    return (stryMutAct_9fa48("36037") ? recovered !== true : stryMutAct_9fa48("36036") ? false : stryMutAct_9fa48("36035") ? true : (stryCov_9fa48("36035", "36036", "36037"), recovered === (stryMutAct_9fa48("36038") ? false : (stryCov_9fa48("36038"), true)))) ? AUTHORITATIVE_FALLBACK_OUTCOME.RECOVERED : AUTHORITATIVE_FALLBACK_OUTCOME.DIAGNOSED;
  }
}
function buildCDCNodeJoinedResult(options = {}) {
  if (stryMutAct_9fa48("36039")) {
    {}
  } else {
    stryCov_9fa48("36039");
    const result = stryMutAct_9fa48("36040") ? {} : (stryCov_9fa48("36040"), {
      processed: stryMutAct_9fa48("36043") ? options.processed !== true : stryMutAct_9fa48("36042") ? false : stryMutAct_9fa48("36041") ? true : (stryCov_9fa48("36041", "36042", "36043"), options.processed === (stryMutAct_9fa48("36044") ? false : (stryCov_9fa48("36044"), true))),
      nodeId: options.nodeId,
      connected: stryMutAct_9fa48("36047") ? options.connected !== true : stryMutAct_9fa48("36046") ? false : stryMutAct_9fa48("36045") ? true : (stryCov_9fa48("36045", "36046", "36047"), options.connected === (stryMutAct_9fa48("36048") ? false : (stryCov_9fa48("36048"), true))),
      skipped: stryMutAct_9fa48("36051") ? options.skipped !== true : stryMutAct_9fa48("36050") ? false : stryMutAct_9fa48("36049") ? true : (stryCov_9fa48("36049", "36050", "36051"), options.skipped === (stryMutAct_9fa48("36052") ? false : (stryCov_9fa48("36052"), true)))
    });
    if (stryMutAct_9fa48("36054") ? false : stryMutAct_9fa48("36053") ? true : (stryCov_9fa48("36053", "36054"), options.reason)) {
      if (stryMutAct_9fa48("36055")) {
        {}
      } else {
        stryCov_9fa48("36055");
        result.reason = options.reason;
      }
    }
    if (stryMutAct_9fa48("36057") ? false : stryMutAct_9fa48("36056") ? true : (stryCov_9fa48("36056", "36057"), options.error)) {
      if (stryMutAct_9fa48("36058")) {
        {}
      } else {
        stryCov_9fa48("36058");
        result.error = options.error;
      }
    }
    if (stryMutAct_9fa48("36060") ? false : stryMutAct_9fa48("36059") ? true : (stryCov_9fa48("36059", "36060"), options.wsAddress)) {
      if (stryMutAct_9fa48("36061")) {
        {}
      } else {
        stryCov_9fa48("36061");
        result.wsAddress = options.wsAddress;
      }
    }
    return result;
  }
}
function normalizeDeliveryPriority(value, fallback = null) {
  if (stryMutAct_9fa48("36062")) {
    {}
  } else {
    stryCov_9fa48("36062");
    return (stryMutAct_9fa48("36065") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("36064") ? false : stryMutAct_9fa48("36063") ? true : (stryCov_9fa48("36063", "36064", "36065"), (stryMutAct_9fa48("36067") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("36066") ? true : (stryCov_9fa48("36066", "36067"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("36070") ? value.length <= NUM.ZERO : stryMutAct_9fa48("36069") ? value.length >= NUM.ZERO : stryMutAct_9fa48("36068") ? true : (stryCov_9fa48("36068", "36069", "36070"), value.length > NUM.ZERO)))) ? value : fallback;
  }
}
function buildSystemTableMutationError(result, fallbackMessage) {
  if (stryMutAct_9fa48("36071")) {
    {}
  } else {
    stryCov_9fa48("36071");
    const error = new Error(stryMutAct_9fa48("36074") ? result?.error && fallbackMessage : stryMutAct_9fa48("36073") ? false : stryMutAct_9fa48("36072") ? true : (stryCov_9fa48("36072", "36073", "36074"), (stryMutAct_9fa48("36075") ? result.error : (stryCov_9fa48("36075"), result?.error)) || fallbackMessage));
    if (stryMutAct_9fa48("36078") ? typeof result?.errorCode === TYPEOF.STRING || result.errorCode.length > NUM.ZERO : stryMutAct_9fa48("36077") ? false : stryMutAct_9fa48("36076") ? true : (stryCov_9fa48("36076", "36077", "36078"), (stryMutAct_9fa48("36080") ? typeof result?.errorCode !== TYPEOF.STRING : stryMutAct_9fa48("36079") ? true : (stryCov_9fa48("36079", "36080"), typeof (stryMutAct_9fa48("36081") ? result.errorCode : (stryCov_9fa48("36081"), result?.errorCode)) === TYPEOF.STRING)) && (stryMutAct_9fa48("36084") ? result.errorCode.length <= NUM.ZERO : stryMutAct_9fa48("36083") ? result.errorCode.length >= NUM.ZERO : stryMutAct_9fa48("36082") ? true : (stryCov_9fa48("36082", "36083", "36084"), result.errorCode.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("36085")) {
        {}
      } else {
        stryCov_9fa48("36085");
        error.code = result.errorCode;
      }
    }
    if (stryMutAct_9fa48("36088") ? typeof result?.pressureAction === TYPEOF.STRING || result.pressureAction.length > NUM.ZERO : stryMutAct_9fa48("36087") ? false : stryMutAct_9fa48("36086") ? true : (stryCov_9fa48("36086", "36087", "36088"), (stryMutAct_9fa48("36090") ? typeof result?.pressureAction !== TYPEOF.STRING : stryMutAct_9fa48("36089") ? true : (stryCov_9fa48("36089", "36090"), typeof (stryMutAct_9fa48("36091") ? result.pressureAction : (stryCov_9fa48("36091"), result?.pressureAction)) === TYPEOF.STRING)) && (stryMutAct_9fa48("36094") ? result.pressureAction.length <= NUM.ZERO : stryMutAct_9fa48("36093") ? result.pressureAction.length >= NUM.ZERO : stryMutAct_9fa48("36092") ? true : (stryCov_9fa48("36092", "36093", "36094"), result.pressureAction.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("36095")) {
        {}
      } else {
        stryCov_9fa48("36095");
        error.pressureAction = result.pressureAction;
      }
    }
    if (stryMutAct_9fa48("36098") ? typeof result?.pressureReason === TYPEOF.STRING || result.pressureReason.length > NUM.ZERO : stryMutAct_9fa48("36097") ? false : stryMutAct_9fa48("36096") ? true : (stryCov_9fa48("36096", "36097", "36098"), (stryMutAct_9fa48("36100") ? typeof result?.pressureReason !== TYPEOF.STRING : stryMutAct_9fa48("36099") ? true : (stryCov_9fa48("36099", "36100"), typeof (stryMutAct_9fa48("36101") ? result.pressureReason : (stryCov_9fa48("36101"), result?.pressureReason)) === TYPEOF.STRING)) && (stryMutAct_9fa48("36104") ? result.pressureReason.length <= NUM.ZERO : stryMutAct_9fa48("36103") ? result.pressureReason.length >= NUM.ZERO : stryMutAct_9fa48("36102") ? true : (stryCov_9fa48("36102", "36103", "36104"), result.pressureReason.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("36105")) {
        {}
      } else {
        stryCov_9fa48("36105");
        error.pressureReason = result.pressureReason;
      }
    }
    if (stryMutAct_9fa48("36107") ? false : stryMutAct_9fa48("36106") ? true : (stryCov_9fa48("36106", "36107"), Number.isFinite(stryMutAct_9fa48("36108") ? result.retryAfterMs : (stryCov_9fa48("36108"), result?.retryAfterMs)))) {
      if (stryMutAct_9fa48("36109")) {
        {}
      } else {
        stryCov_9fa48("36109");
        error.retryAfterMs = stryMutAct_9fa48("36110") ? Math.min(NUM.ZERO, Math.floor(result.retryAfterMs)) : (stryCov_9fa48("36110"), Math.max(NUM.ZERO, Math.floor(result.retryAfterMs)));
        if (stryMutAct_9fa48("36114") ? error.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("36113") ? error.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("36112") ? false : stryMutAct_9fa48("36111") ? true : (stryCov_9fa48("36111", "36112", "36113", "36114"), error.retryAfterMs > NUM.ZERO)) {
          if (stryMutAct_9fa48("36115")) {
            {}
          } else {
            stryCov_9fa48("36115");
            error.deferRetry = stryMutAct_9fa48("36116") ? false : (stryCov_9fa48("36116"), true);
          }
        }
      }
    }
    if (stryMutAct_9fa48("36119") ? result?.pressureSummary || typeof result.pressureSummary === TYPEOF.OBJECT : stryMutAct_9fa48("36118") ? false : stryMutAct_9fa48("36117") ? true : (stryCov_9fa48("36117", "36118", "36119"), (stryMutAct_9fa48("36120") ? result.pressureSummary : (stryCov_9fa48("36120"), result?.pressureSummary)) && (stryMutAct_9fa48("36122") ? typeof result.pressureSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("36121") ? true : (stryCov_9fa48("36121", "36122"), typeof result.pressureSummary === TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("36123")) {
        {}
      } else {
        stryCov_9fa48("36123");
        error.pressureSummary = result.pressureSummary;
      }
    }
    return error;
  }
}
function sortMutationKeyObject(value) {
  if (stryMutAct_9fa48("36124")) {
    {}
  } else {
    stryCov_9fa48("36124");
    if (stryMutAct_9fa48("36126") ? false : stryMutAct_9fa48("36125") ? true : (stryCov_9fa48("36125", "36126"), Array.isArray(value))) {
      if (stryMutAct_9fa48("36127")) {
        {}
      } else {
        stryCov_9fa48("36127");
        return value.map(stryMutAct_9fa48("36128") ? () => undefined : (stryCov_9fa48("36128"), entry => sortMutationKeyObject(entry)));
      }
    }
    if (stryMutAct_9fa48("36131") ? !value && typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("36130") ? false : stryMutAct_9fa48("36129") ? true : (stryCov_9fa48("36129", "36130", "36131"), (stryMutAct_9fa48("36132") ? value : (stryCov_9fa48("36132"), !value)) || (stryMutAct_9fa48("36134") ? typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("36133") ? false : (stryCov_9fa48("36133", "36134"), typeof value !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("36135")) {
        {}
      } else {
        stryCov_9fa48("36135");
        return value;
      }
    }
    return stryMutAct_9fa48("36136") ? Object.keys(value).reduce((accumulator, key) => {
      accumulator[key] = sortMutationKeyObject(value[key]);
      return accumulator;
    }, {}) : (stryCov_9fa48("36136"), Object.keys(value).sort().reduce((accumulator, key) => {
      if (stryMutAct_9fa48("36137")) {
        {}
      } else {
        stryCov_9fa48("36137");
        accumulator[key] = sortMutationKeyObject(value[key]);
        return accumulator;
      }
    }, {}));
  }
}
function stableSerializeMutationKey(value) {
  if (stryMutAct_9fa48("36138")) {
    {}
  } else {
    stryCov_9fa48("36138");
    return JSON.stringify(sortMutationKeyObject(value));
  }
}
const AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES = Object.freeze(stryMutAct_9fa48("36139") ? [] : (stryCov_9fa48("36139"), [stryMutAct_9fa48("36140") ? "" : (stryCov_9fa48("36140"), 'last_heartbeat'), stryMutAct_9fa48("36141") ? "" : (stryCov_9fa48("36141"), 'lastHeartbeat'), stryMutAct_9fa48("36142") ? "" : (stryCov_9fa48("36142"), 'ready_lease_expires_at'), stryMutAct_9fa48("36143") ? "" : (stryCov_9fa48("36143"), 'readyLeaseExpiresAt'), stryMutAct_9fa48("36144") ? "" : (stryCov_9fa48("36144"), 'updated_at_hlc'), stryMutAct_9fa48("36145") ? "" : (stryCov_9fa48("36145"), 'updatedAtHlc'), stryMutAct_9fa48("36146") ? "" : (stryCov_9fa48("36146"), 'schema_version'), stryMutAct_9fa48("36147") ? "" : (stryCov_9fa48("36147"), 'schemaVersion'), stryMutAct_9fa48("36148") ? "" : (stryCov_9fa48("36148"), 'updated_at'), stryMutAct_9fa48("36149") ? "" : (stryCov_9fa48("36149"), 'updatedAt'), stryMutAct_9fa48("36150") ? "" : (stryCov_9fa48("36150"), 'completed_at'), stryMutAct_9fa48("36151") ? "" : (stryCov_9fa48("36151"), 'completedAt'), stryMutAct_9fa48("36152") ? "" : (stryCov_9fa48("36152"), 'created_at'), stryMutAct_9fa48("36153") ? "" : (stryCov_9fa48("36153"), 'createdAt')]));
function normalizeAuthoritativeFallbackPhase(value) {
  if (stryMutAct_9fa48("36154")) {
    {}
  } else {
    stryCov_9fa48("36154");
    if (stryMutAct_9fa48("36157") ? value !== AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP : stryMutAct_9fa48("36156") ? false : stryMutAct_9fa48("36155") ? true : (stryCov_9fa48("36155", "36156", "36157"), value === AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP)) {
      if (stryMutAct_9fa48("36158")) {
        {}
      } else {
        stryCov_9fa48("36158");
        return AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP;
      }
    }
    if (stryMutAct_9fa48("36161") ? value !== AUTHORITATIVE_FALLBACK_PHASE.RECOVERY : stryMutAct_9fa48("36160") ? false : stryMutAct_9fa48("36159") ? true : (stryCov_9fa48("36159", "36160", "36161"), value === AUTHORITATIVE_FALLBACK_PHASE.RECOVERY)) {
      if (stryMutAct_9fa48("36162")) {
        {}
      } else {
        stryCov_9fa48("36162");
        return AUTHORITATIVE_FALLBACK_PHASE.RECOVERY;
      }
    }
    return AUTHORITATIVE_FALLBACK_PHASE.STEADY_STATE;
  }
}
function normalizeAuthoritativeFallbackOutcome(value) {
  if (stryMutAct_9fa48("36163")) {
    {}
  } else {
    stryCov_9fa48("36163");
    if (stryMutAct_9fa48("36166") ? value !== AUTHORITATIVE_FALLBACK_OUTCOME.DIAGNOSED : stryMutAct_9fa48("36165") ? false : stryMutAct_9fa48("36164") ? true : (stryCov_9fa48("36164", "36165", "36166"), value === AUTHORITATIVE_FALLBACK_OUTCOME.DIAGNOSED)) {
      if (stryMutAct_9fa48("36167")) {
        {}
      } else {
        stryCov_9fa48("36167");
        return AUTHORITATIVE_FALLBACK_OUTCOME.DIAGNOSED;
      }
    }
    return (stryMutAct_9fa48("36170") ? value !== AUTHORITATIVE_FALLBACK_OUTCOME.FAILED : stryMutAct_9fa48("36169") ? false : stryMutAct_9fa48("36168") ? true : (stryCov_9fa48("36168", "36169", "36170"), value === AUTHORITATIVE_FALLBACK_OUTCOME.FAILED)) ? AUTHORITATIVE_FALLBACK_OUTCOME.FAILED : AUTHORITATIVE_FALLBACK_OUTCOME.RECOVERED;
  }
}
function normalizeLocalQueryTransportReadiness(readiness) {
  if (stryMutAct_9fa48("36171")) {
    {}
  } else {
    stryCov_9fa48("36171");
    if (stryMutAct_9fa48("36174") ? !readiness && typeof readiness !== TYPEOF.OBJECT : stryMutAct_9fa48("36173") ? false : stryMutAct_9fa48("36172") ? true : (stryCov_9fa48("36172", "36173", "36174"), (stryMutAct_9fa48("36175") ? readiness : (stryCov_9fa48("36175"), !readiness)) || (stryMutAct_9fa48("36177") ? typeof readiness === TYPEOF.OBJECT : stryMutAct_9fa48("36176") ? false : (stryCov_9fa48("36176", "36177"), typeof readiness !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("36178")) {
        {}
      } else {
        stryCov_9fa48("36178");
        return null;
      }
    }
    const ready = stryMutAct_9fa48("36181") ? readiness.ready !== true : stryMutAct_9fa48("36180") ? false : stryMutAct_9fa48("36179") ? true : (stryCov_9fa48("36179", "36180", "36181"), readiness.ready === (stryMutAct_9fa48("36182") ? false : (stryCov_9fa48("36182"), true)));
    return stryMutAct_9fa48("36183") ? {} : (stryCov_9fa48("36183"), {
      state: ready ? CDC_INTEGRATION_SERVICE_LITERAL.READY : CDC_INTEGRATION_SERVICE_LITERAL.DEFERRED,
      ready,
      reason: (stryMutAct_9fa48("36186") ? typeof readiness.reason === TYPEOF.STRING || readiness.reason.length > NUM.ZERO : stryMutAct_9fa48("36185") ? false : stryMutAct_9fa48("36184") ? true : (stryCov_9fa48("36184", "36185", "36186"), (stryMutAct_9fa48("36188") ? typeof readiness.reason !== TYPEOF.STRING : stryMutAct_9fa48("36187") ? true : (stryCov_9fa48("36187", "36188"), typeof readiness.reason === TYPEOF.STRING)) && (stryMutAct_9fa48("36191") ? readiness.reason.length <= NUM.ZERO : stryMutAct_9fa48("36190") ? readiness.reason.length >= NUM.ZERO : stryMutAct_9fa48("36189") ? true : (stryCov_9fa48("36189", "36190", "36191"), readiness.reason.length > NUM.ZERO)))) ? readiness.reason : null,
      retryAfterMs: (stryMutAct_9fa48("36194") ? Number.isFinite(readiness.retryAfterMs) || readiness.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("36193") ? false : stryMutAct_9fa48("36192") ? true : (stryCov_9fa48("36192", "36193", "36194"), Number.isFinite(readiness.retryAfterMs) && (stryMutAct_9fa48("36197") ? readiness.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("36196") ? readiness.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("36195") ? true : (stryCov_9fa48("36195", "36196", "36197"), readiness.retryAfterMs > NUM.ZERO)))) ? Math.floor(readiness.retryAfterMs) : NUM.ZERO
    });
  }
}
function shouldEmitTableWriteMetric(tableName) {
  if (stryMutAct_9fa48("36198")) {
    {}
  } else {
    stryCov_9fa48("36198");
    return stryMutAct_9fa48("36199") ? TABLE_WRITE_METRIC_SUPPRESSED_TABLES.has(tableName) : (stryCov_9fa48("36199"), !TABLE_WRITE_METRIC_SUPPRESSED_TABLES.has(tableName));
  }
}
function shouldLogTableWriteFailure(tableName) {
  if (stryMutAct_9fa48("36200")) {
    {}
  } else {
    stryCov_9fa48("36200");
    return stryMutAct_9fa48("36201") ? TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES.has(tableName) : (stryCov_9fa48("36201"), !TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES.has(tableName));
  }
}
function normalizeSystemTableWriteMode(service, error) {
  if (stryMutAct_9fa48("36202")) {
    {}
  } else {
    stryCov_9fa48("36202");
    if (stryMutAct_9fa48("36205") ? typeof error?.writeMode === TYPEOF.STRING || error.writeMode.length > NUM.ZERO : stryMutAct_9fa48("36204") ? false : stryMutAct_9fa48("36203") ? true : (stryCov_9fa48("36203", "36204", "36205"), (stryMutAct_9fa48("36207") ? typeof error?.writeMode !== TYPEOF.STRING : stryMutAct_9fa48("36206") ? true : (stryCov_9fa48("36206", "36207"), typeof (stryMutAct_9fa48("36208") ? error.writeMode : (stryCov_9fa48("36208"), error?.writeMode)) === TYPEOF.STRING)) && (stryMutAct_9fa48("36211") ? error.writeMode.length <= NUM.ZERO : stryMutAct_9fa48("36210") ? error.writeMode.length >= NUM.ZERO : stryMutAct_9fa48("36209") ? true : (stryCov_9fa48("36209", "36210", "36211"), error.writeMode.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("36212")) {
        {}
      } else {
        stryCov_9fa48("36212");
        return error.writeMode;
      }
    }
    if (stryMutAct_9fa48("36215") ? service?.writeRouter?.mode === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT && service?.bootstrapMode === true : stryMutAct_9fa48("36214") ? false : stryMutAct_9fa48("36213") ? true : (stryCov_9fa48("36213", "36214", "36215"), (stryMutAct_9fa48("36217") ? service?.writeRouter?.mode !== WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT : stryMutAct_9fa48("36216") ? false : (stryCov_9fa48("36216", "36217"), (stryMutAct_9fa48("36219") ? service.writeRouter?.mode : stryMutAct_9fa48("36218") ? service?.writeRouter.mode : (stryCov_9fa48("36218", "36219"), service?.writeRouter?.mode)) === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT)) || (stryMutAct_9fa48("36221") ? service?.bootstrapMode !== true : stryMutAct_9fa48("36220") ? false : (stryCov_9fa48("36220", "36221"), (stryMutAct_9fa48("36222") ? service.bootstrapMode : (stryCov_9fa48("36222"), service?.bootstrapMode)) === (stryMutAct_9fa48("36223") ? false : (stryCov_9fa48("36223"), true)))))) {
      if (stryMutAct_9fa48("36224")) {
        {}
      } else {
        stryCov_9fa48("36224");
        return WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT;
      }
    }
    return WRITE_ROUTER_MODE.SQL_ROUTED;
  }
}
function isCacheVisibilityTimeoutError(error) {
  if (stryMutAct_9fa48("36225")) {
    {}
  } else {
    stryCov_9fa48("36225");
    return stryMutAct_9fa48("36228") ? error?.timeoutClassification?.classification !== TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT : stryMutAct_9fa48("36227") ? false : stryMutAct_9fa48("36226") ? true : (stryCov_9fa48("36226", "36227", "36228"), (stryMutAct_9fa48("36230") ? error.timeoutClassification?.classification : stryMutAct_9fa48("36229") ? error?.timeoutClassification.classification : (stryCov_9fa48("36229", "36230"), error?.timeoutClassification?.classification)) === TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT);
  }
}
function annotateSystemTableMutationError(error, context = {}) {
  if (stryMutAct_9fa48("36231")) {
    {}
  } else {
    stryCov_9fa48("36231");
    if (stryMutAct_9fa48("36234") ? !error && typeof error !== TYPEOF.OBJECT : stryMutAct_9fa48("36233") ? false : stryMutAct_9fa48("36232") ? true : (stryCov_9fa48("36232", "36233", "36234"), (stryMutAct_9fa48("36235") ? error : (stryCov_9fa48("36235"), !error)) || (stryMutAct_9fa48("36237") ? typeof error === TYPEOF.OBJECT : stryMutAct_9fa48("36236") ? false : (stryCov_9fa48("36236", "36237"), typeof error !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("36238")) {
        {}
      } else {
        stryCov_9fa48("36238");
        return error;
      }
    }
    if (stryMutAct_9fa48("36240") ? false : stryMutAct_9fa48("36239") ? true : (stryCov_9fa48("36239", "36240"), Number.isFinite(context.attempt))) {
      if (stryMutAct_9fa48("36241")) {
        {}
      } else {
        stryCov_9fa48("36241");
        error.attempt = stryMutAct_9fa48("36242") ? Math.min(NUM.ONE, Math.floor(context.attempt)) : (stryCov_9fa48("36242"), Math.max(NUM.ONE, Math.floor(context.attempt)));
      }
    }
    if (stryMutAct_9fa48("36245") ? typeof context.writeMode === TYPEOF.STRING || context.writeMode.length > NUM.ZERO : stryMutAct_9fa48("36244") ? false : stryMutAct_9fa48("36243") ? true : (stryCov_9fa48("36243", "36244", "36245"), (stryMutAct_9fa48("36247") ? typeof context.writeMode !== TYPEOF.STRING : stryMutAct_9fa48("36246") ? true : (stryCov_9fa48("36246", "36247"), typeof context.writeMode === TYPEOF.STRING)) && (stryMutAct_9fa48("36250") ? context.writeMode.length <= NUM.ZERO : stryMutAct_9fa48("36249") ? context.writeMode.length >= NUM.ZERO : stryMutAct_9fa48("36248") ? true : (stryCov_9fa48("36248", "36249", "36250"), context.writeMode.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("36251")) {
        {}
      } else {
        stryCov_9fa48("36251");
        error.writeMode = context.writeMode;
      }
    }
    if (stryMutAct_9fa48("36254") ? context.cacheWaitTimedOut !== true : stryMutAct_9fa48("36253") ? false : stryMutAct_9fa48("36252") ? true : (stryCov_9fa48("36252", "36253", "36254"), context.cacheWaitTimedOut === (stryMutAct_9fa48("36255") ? false : (stryCov_9fa48("36255"), true)))) {
      if (stryMutAct_9fa48("36256")) {
        {}
      } else {
        stryCov_9fa48("36256");
        error.cacheWaitTimedOut = stryMutAct_9fa48("36257") ? false : (stryCov_9fa48("36257"), true);
      }
    }
    return error;
  }
}
function logSystemTableWriteFailure(service, logMessage, details, error) {
  if (stryMutAct_9fa48("36258")) {
    {}
  } else {
    stryCov_9fa48("36258");
    const payload = stryMutAct_9fa48("36259") ? {} : (stryCov_9fa48("36259"), {
      ...details,
      code: stryMutAct_9fa48("36262") ? getControlPlaneErrorCode(error) && null : stryMutAct_9fa48("36261") ? false : stryMutAct_9fa48("36260") ? true : (stryCov_9fa48("36260", "36261", "36262"), getControlPlaneErrorCode(error) || null),
      retryAfterMs: getControlPlaneRetryAfterMs(error),
      causeId: (stryMutAct_9fa48("36265") ? typeof details?.causeId !== TYPEOF.STRING : stryMutAct_9fa48("36264") ? false : stryMutAct_9fa48("36263") ? true : (stryCov_9fa48("36263", "36264", "36265"), typeof (stryMutAct_9fa48("36266") ? details.causeId : (stryCov_9fa48("36266"), details?.causeId)) === TYPEOF.STRING)) ? details.causeId : null,
      operation: (stryMutAct_9fa48("36269") ? typeof details?.operation !== TYPEOF.STRING : stryMutAct_9fa48("36268") ? false : stryMutAct_9fa48("36267") ? true : (stryCov_9fa48("36267", "36268", "36269"), typeof (stryMutAct_9fa48("36270") ? details.operation : (stryCov_9fa48("36270"), details?.operation)) === TYPEOF.STRING)) ? details.operation : null,
      writeMode: normalizeSystemTableWriteMode(service, error),
      bootstrapMode: stryMutAct_9fa48("36273") ? service?.writeRouter?.mode === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT && service?.bootstrapMode === true : stryMutAct_9fa48("36272") ? false : stryMutAct_9fa48("36271") ? true : (stryCov_9fa48("36271", "36272", "36273"), (stryMutAct_9fa48("36275") ? service?.writeRouter?.mode !== WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT : stryMutAct_9fa48("36274") ? false : (stryCov_9fa48("36274", "36275"), (stryMutAct_9fa48("36277") ? service.writeRouter?.mode : stryMutAct_9fa48("36276") ? service?.writeRouter.mode : (stryCov_9fa48("36276", "36277"), service?.writeRouter?.mode)) === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT)) || (stryMutAct_9fa48("36279") ? service?.bootstrapMode !== true : stryMutAct_9fa48("36278") ? false : (stryCov_9fa48("36278", "36279"), (stryMutAct_9fa48("36280") ? service.bootstrapMode : (stryCov_9fa48("36280"), service?.bootstrapMode)) === (stryMutAct_9fa48("36281") ? false : (stryCov_9fa48("36281"), true))))),
      primaryKey: sortMutationKeyObject(stryMutAct_9fa48("36284") ? details?.primaryKey && null : stryMutAct_9fa48("36283") ? false : stryMutAct_9fa48("36282") ? true : (stryCov_9fa48("36282", "36283", "36284"), (stryMutAct_9fa48("36285") ? details.primaryKey : (stryCov_9fa48("36285"), details?.primaryKey)) || null)),
      attempt: Number.isFinite(stryMutAct_9fa48("36286") ? details.attempt : (stryCov_9fa48("36286"), details?.attempt)) ? stryMutAct_9fa48("36287") ? Math.min(NUM.ONE, Math.floor(details.attempt)) : (stryCov_9fa48("36287"), Math.max(NUM.ONE, Math.floor(details.attempt))) : Number.isFinite(stryMutAct_9fa48("36288") ? error.attempt : (stryCov_9fa48("36288"), error?.attempt)) ? stryMutAct_9fa48("36289") ? Math.min(NUM.ONE, Math.floor(error.attempt)) : (stryCov_9fa48("36289"), Math.max(NUM.ONE, Math.floor(error.attempt))) : null,
      cacheWaitTimedOut: stryMutAct_9fa48("36292") ? (details?.cacheWaitTimedOut === true || error?.cacheWaitTimedOut === true) && isCacheVisibilityTimeoutError(error) : stryMutAct_9fa48("36291") ? false : stryMutAct_9fa48("36290") ? true : (stryCov_9fa48("36290", "36291", "36292"), (stryMutAct_9fa48("36294") ? details?.cacheWaitTimedOut === true && error?.cacheWaitTimedOut === true : stryMutAct_9fa48("36293") ? false : (stryCov_9fa48("36293", "36294"), (stryMutAct_9fa48("36296") ? details?.cacheWaitTimedOut !== true : stryMutAct_9fa48("36295") ? false : (stryCov_9fa48("36295", "36296"), (stryMutAct_9fa48("36297") ? details.cacheWaitTimedOut : (stryCov_9fa48("36297"), details?.cacheWaitTimedOut)) === (stryMutAct_9fa48("36298") ? false : (stryCov_9fa48("36298"), true)))) || (stryMutAct_9fa48("36300") ? error?.cacheWaitTimedOut !== true : stryMutAct_9fa48("36299") ? false : (stryCov_9fa48("36299", "36300"), (stryMutAct_9fa48("36301") ? error.cacheWaitTimedOut : (stryCov_9fa48("36301"), error?.cacheWaitTimedOut)) === (stryMutAct_9fa48("36302") ? false : (stryCov_9fa48("36302"), true)))))) || isCacheVisibilityTimeoutError(error))
    });
    if (stryMutAct_9fa48("36304") ? false : stryMutAct_9fa48("36303") ? true : (stryCov_9fa48("36303", "36304"), isRetryableControlPlaneError(error))) {
      if (stryMutAct_9fa48("36305")) {
        {}
      } else {
        stryCov_9fa48("36305");
        service.logger.warn(logMessage, payload);
        return;
      }
    }
    service.logger.error(logMessage, payload);
  }
}

/**
 * CDCIntegrationService routes all system table writes through SQL queries.
 * This ensures cache updates only happen via CDC events, maintaining consistency.
 * Queries are routed transparently to wherever the partition leader is.
 *
 * Key architectural constraint:
 * - Components MUST NOT write directly to System_Table_Cache
 * - All writes go through SQL → partition (wherever it is) → CDC → cache
 */
class CDCIntegrationService extends EventEmitter {
  /**
   * Create a new CDCIntegrationService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.sqlQueryEngine - SQL query engine for transparent routing.
   * @param {string} options.nodeId - Node ID for logging context.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("36306")) {
      {}
    } else {
      stryCov_9fa48("36306");
      super();

      // Primary: SQL query engine for transparent routing
      this.sqlQueryEngine = stryMutAct_9fa48("36309") ? options.sqlQueryEngine && null : stryMutAct_9fa48("36308") ? false : stryMutAct_9fa48("36307") ? true : (stryCov_9fa48("36307", "36308", "36309"), options.sqlQueryEngine || null);
      this.nodeId = stryMutAct_9fa48("36312") ? options.nodeId && STRING.UNKNOWN : stryMutAct_9fa48("36311") ? false : stryMutAct_9fa48("36310") ? true : (stryCov_9fa48("36310", "36311", "36312"), options.nodeId || STRING.UNKNOWN);
      this.systemTableCache = stryMutAct_9fa48("36315") ? options.systemTableCache && null : stryMutAct_9fa48("36314") ? false : stryMutAct_9fa48("36313") ? true : (stryCov_9fa48("36313", "36314", "36315"), options.systemTableCache || null);
      this.cacheMutationTarget = stryMutAct_9fa48("36318") ? options.cacheMutationTarget && (typeof options.systemTableCache?.applySystemTableChange === TYPEOF.FUNCTION ? options.systemTableCache : null) : stryMutAct_9fa48("36317") ? false : stryMutAct_9fa48("36316") ? true : (stryCov_9fa48("36316", "36317", "36318"), options.cacheMutationTarget || ((stryMutAct_9fa48("36321") ? typeof options.systemTableCache?.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("36320") ? false : stryMutAct_9fa48("36319") ? true : (stryCov_9fa48("36319", "36320", "36321"), typeof (stryMutAct_9fa48("36322") ? options.systemTableCache.applySystemTableChange : (stryCov_9fa48("36322"), options.systemTableCache?.applySystemTableChange)) === TYPEOF.FUNCTION)) ? options.systemTableCache : null));

      // Bootstrap mode for seed node direct writes
      this.bootstrapMode = stryMutAct_9fa48("36323") ? true : (stryCov_9fa48("36323"), false);
      this.bootstrapCompleted = stryMutAct_9fa48("36324") ? true : (stryCov_9fa48("36324"), false);
      this.localPartitionServices = null;
      this.partitionServicesProvider = options.partitionServicesProvider instanceof Map ? stryMutAct_9fa48("36325") ? () => undefined : (stryCov_9fa48("36325"), () => options.partitionServicesProvider) : (stryMutAct_9fa48("36328") ? typeof options.partitionServicesProvider !== TYPEOF.FUNCTION : stryMutAct_9fa48("36327") ? false : stryMutAct_9fa48("36326") ? true : (stryCov_9fa48("36326", "36327", "36328"), typeof options.partitionServicesProvider === TYPEOF.FUNCTION)) ? options.partitionServicesProvider : null;
      this.writeRouter = this.createSqlWriteRouter();

      // HLC clock for timestamps
      this.hlcClock = new HLCClockService(this.nodeId);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(CDC_SUBSYSTEM.INTEGRATION) : console;

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.retryMaxAttempts = stryMutAct_9fa48("36331") ? config.get(CDC_CONFIG_KEY.RETRY_MAX_ATTEMPTS) && CDC_DEFAULTS.RETRY_MAX_ATTEMPTS : stryMutAct_9fa48("36330") ? false : stryMutAct_9fa48("36329") ? true : (stryCov_9fa48("36329", "36330", "36331"), config.get(CDC_CONFIG_KEY.RETRY_MAX_ATTEMPTS) || CDC_DEFAULTS.RETRY_MAX_ATTEMPTS);
      this.retryDelayMs = stryMutAct_9fa48("36334") ? config.get(CDC_CONFIG_KEY.RETRY_DELAY_MS) && CDC_DEFAULTS.RETRY_DELAY_MS : stryMutAct_9fa48("36333") ? false : stryMutAct_9fa48("36332") ? true : (stryCov_9fa48("36332", "36333", "36334"), config.get(CDC_CONFIG_KEY.RETRY_DELAY_MS) || CDC_DEFAULTS.RETRY_DELAY_MS);
      this.cacheWaitTimeoutMs = stryMutAct_9fa48("36337") ? config.get(CDC_CONFIG_KEY.CACHE_WAIT_TIMEOUT_MS) && CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS : stryMutAct_9fa48("36336") ? false : stryMutAct_9fa48("36335") ? true : (stryCov_9fa48("36335", "36336", "36337"), config.get(CDC_CONFIG_KEY.CACHE_WAIT_TIMEOUT_MS) || CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS);

      // Epoch manager reference for CDC epoch change handling
      this.epochManager = null;

      // Rebalancer reference for node state change handling
      this.rebalancer = null;

      // Message router reference for mesh connectivity on node join
      this.messageRouter = stryMutAct_9fa48("36340") ? options.messageRouter && null : stryMutAct_9fa48("36339") ? false : stryMutAct_9fa48("36338") ? true : (stryCov_9fa48("36338", "36339", "36340"), options.messageRouter || null);
      this.cdcEventHandler = null;

      // Statistics
      this.stats = stryMutAct_9fa48("36341") ? {} : (stryCov_9fa48("36341"), {
        ...CDC_STATS_DEFAULT
      });
      this.authoritativeFallbackHistory = stryMutAct_9fa48("36342") ? ["Stryker was here"] : (stryCov_9fa48("36342"), []);
      this.authoritativeFallbackTotals = new Map();
      this.authoritativeFallbackWindowMs = AUTHORITATIVE_FALLBACK_WINDOW_MS;
      this.authoritativeFallbackRepairBudgetMs = (stryMutAct_9fa48("36345") ? Number.isFinite(options.authoritativeFallbackRepairBudgetMs) || options.authoritativeFallbackRepairBudgetMs > NUM.ZERO : stryMutAct_9fa48("36344") ? false : stryMutAct_9fa48("36343") ? true : (stryCov_9fa48("36343", "36344", "36345"), Number.isFinite(options.authoritativeFallbackRepairBudgetMs) && (stryMutAct_9fa48("36348") ? options.authoritativeFallbackRepairBudgetMs <= NUM.ZERO : stryMutAct_9fa48("36347") ? options.authoritativeFallbackRepairBudgetMs >= NUM.ZERO : stryMutAct_9fa48("36346") ? true : (stryCov_9fa48("36346", "36347", "36348"), options.authoritativeFallbackRepairBudgetMs > NUM.ZERO)))) ? Math.floor(options.authoritativeFallbackRepairBudgetMs) : AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS;
      this.authoritativeFallbackRetryDelayMs = (stryMutAct_9fa48("36351") ? Number.isFinite(options.authoritativeFallbackRetryDelayMs) || options.authoritativeFallbackRetryDelayMs >= NUM.ZERO : stryMutAct_9fa48("36350") ? false : stryMutAct_9fa48("36349") ? true : (stryCov_9fa48("36349", "36350", "36351"), Number.isFinite(options.authoritativeFallbackRetryDelayMs) && (stryMutAct_9fa48("36354") ? options.authoritativeFallbackRetryDelayMs < NUM.ZERO : stryMutAct_9fa48("36353") ? options.authoritativeFallbackRetryDelayMs > NUM.ZERO : stryMutAct_9fa48("36352") ? true : (stryCov_9fa48("36352", "36353", "36354"), options.authoritativeFallbackRetryDelayMs >= NUM.ZERO)))) ? Math.floor(options.authoritativeFallbackRetryDelayMs) : AUTHORITATIVE_FALLBACK_RETRY_DELAY_MS;
      this.inFlightMutationsByKey = new Map();
      this.initialized = stryMutAct_9fa48("36355") ? true : (stryCov_9fa48("36355"), false);
    }
  }

  /**
   * Set the system table cache used for post-write consistency waits.
   * @param {Object} cache - System table cache (read-only wrapper ok).
   */
  setSystemTableCache(cache) {
    if (stryMutAct_9fa48("36356")) {
      {}
    } else {
      stryCov_9fa48("36356");
      this.systemTableCache = cache;
      if (stryMutAct_9fa48("36359") ? !this.cacheMutationTarget || typeof cache?.applySystemTableChange === TYPEOF.FUNCTION : stryMutAct_9fa48("36358") ? false : stryMutAct_9fa48("36357") ? true : (stryCov_9fa48("36357", "36358", "36359"), (stryMutAct_9fa48("36360") ? this.cacheMutationTarget : (stryCov_9fa48("36360"), !this.cacheMutationTarget)) && (stryMutAct_9fa48("36362") ? typeof cache?.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("36361") ? true : (stryCov_9fa48("36361", "36362"), typeof (stryMutAct_9fa48("36363") ? cache.applySystemTableChange : (stryCov_9fa48("36363"), cache?.applySystemTableChange)) === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("36364")) {
          {}
        } else {
          stryCov_9fa48("36364");
          this.cacheMutationTarget = cache;
        }
      }
    }
  }

  /**
   * Set the writable cache target used by authoritative repair paths.
   * @param {Object} cache - Writable SystemTableCache instance.
   */
  setCacheMutationTarget(cache) {
    if (stryMutAct_9fa48("36365")) {
      {}
    } else {
      stryCov_9fa48("36365");
      this.cacheMutationTarget = cache;
    }
  }

  /**
   * Set the local partition-service provider for authoritative system-table
   * reads and direct local write bypasses in steady state.
   * @param {Function|Map|null} provider
   */
  setPartitionServicesProvider(provider) {
    if (stryMutAct_9fa48("36366")) {
      {}
    } else {
      stryCov_9fa48("36366");
      if (stryMutAct_9fa48("36368") ? false : stryMutAct_9fa48("36367") ? true : (stryCov_9fa48("36367", "36368"), provider instanceof Map)) {
        if (stryMutAct_9fa48("36369")) {
          {}
        } else {
          stryCov_9fa48("36369");
          this.partitionServicesProvider = stryMutAct_9fa48("36370") ? () => undefined : (stryCov_9fa48("36370"), () => provider);
          return;
        }
      }
      this.partitionServicesProvider = (stryMutAct_9fa48("36373") ? typeof provider !== TYPEOF.FUNCTION : stryMutAct_9fa48("36372") ? false : stryMutAct_9fa48("36371") ? true : (stryCov_9fa48("36371", "36372", "36373"), typeof provider === TYPEOF.FUNCTION)) ? provider : null;
    }
  }

  /**
   * Build context object for CDCEventHandler with live references.
   * @return {Object} Event handler context.
   * @private
   */
  createEventHandlerContext() {
    if (stryMutAct_9fa48("36374")) {
      {}
    } else {
      stryCov_9fa48("36374");
      return stryMutAct_9fa48("36375") ? {} : (stryCov_9fa48("36375"), {
        get epochManager() {
          if (stryMutAct_9fa48("36376")) {
            {}
          } else {
            stryCov_9fa48("36376");
            return this._service.epochManager;
          }
        },
        get rebalancer() {
          if (stryMutAct_9fa48("36377")) {
            {}
          } else {
            stryCov_9fa48("36377");
            return this._service.rebalancer;
          }
        },
        get messageRouter() {
          if (stryMutAct_9fa48("36378")) {
            {}
          } else {
            stryCov_9fa48("36378");
            return this._service.messageRouter;
          }
        },
        emit: (eventName, data) => {
          if (stryMutAct_9fa48("36379")) {
            {}
          } else {
            stryCov_9fa48("36379");
            this.emit(eventName, data);
          }
        },
        incrementEpochChanges: () => {
          if (stryMutAct_9fa48("36380")) {
            {}
          } else {
            stryCov_9fa48("36380");
            stryMutAct_9fa48("36381") ? this.stats.epochChanges-- : (stryCov_9fa48("36381"), this.stats.epochChanges++);
          }
        },
        incrementNodeStateChanges: () => {
          if (stryMutAct_9fa48("36382")) {
            {}
          } else {
            stryCov_9fa48("36382");
            stryMutAct_9fa48("36383") ? this.stats.nodeStateChanges-- : (stryCov_9fa48("36383"), this.stats.nodeStateChanges++);
          }
        },
        resolveNodeWebSocketAddress: targetNodeId => {
          if (stryMutAct_9fa48("36384")) {
            {}
          } else {
            stryCov_9fa48("36384");
            return resolveNodeWebSocketAddress(stryMutAct_9fa48("36385") ? {} : (stryCov_9fa48("36385"), {
              targetNodeId,
              systemTableCache: this.systemTableCache
            }));
          }
        },
        _service: this
      });
    }
  }

  /**
   * Ensure CDCEventHandler is instantiated for runtime CDC processing.
   * @return {CDCEventHandler} Active CDC event handler.
   * @private
   */
  ensureEventHandler() {
    if (stryMutAct_9fa48("36386")) {
      {}
    } else {
      stryCov_9fa48("36386");
      if (stryMutAct_9fa48("36389") ? false : stryMutAct_9fa48("36388") ? true : stryMutAct_9fa48("36387") ? this.cdcEventHandler : (stryCov_9fa48("36387", "36388", "36389"), !this.cdcEventHandler)) {
        if (stryMutAct_9fa48("36390")) {
          {}
        } else {
          stryCov_9fa48("36390");
          this.cdcEventHandler = new CDCEventHandler(stryMutAct_9fa48("36391") ? {} : (stryCov_9fa48("36391"), {
            nodeId: this.nodeId,
            eventContext: this.createEventHandlerContext()
          }));
        }
      }
      return this.cdcEventHandler;
    }
  }

  /**
   * Initialize the CDC integration service.
   * @param {Object} options - Initialization options.
   * @param {Object} options.sqlQueryEngine - SQL query engine for transparent routing.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("36392")) {
      {}
    } else {
      stryCov_9fa48("36392");
      if (stryMutAct_9fa48("36394") ? false : stryMutAct_9fa48("36393") ? true : (stryCov_9fa48("36393", "36394"), options.sqlQueryEngine)) {
        if (stryMutAct_9fa48("36395")) {
          {}
        } else {
          stryCov_9fa48("36395");
          this.sqlQueryEngine = options.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("36397") ? false : stryMutAct_9fa48("36396") ? true : (stryCov_9fa48("36396", "36397"), options.nodeId)) {
        if (stryMutAct_9fa48("36398")) {
          {}
        } else {
          stryCov_9fa48("36398");
          this.nodeId = options.nodeId;
        }
      }
      this.initialized = stryMutAct_9fa48("36399") ? false : (stryCov_9fa48("36399"), true);
      this.ensureEventHandler();
      this.logger.info(CDC_LOG_MSG.INITIALIZED, stryMutAct_9fa48("36400") ? {} : (stryCov_9fa48("36400"), {
        nodeId: this.nodeId,
        hasSqlQueryEngine: stryMutAct_9fa48("36401") ? !this.sqlQueryEngine : (stryCov_9fa48("36401"), !(stryMutAct_9fa48("36402") ? this.sqlQueryEngine : (stryCov_9fa48("36402"), !this.sqlQueryEngine)))
      }));
    }
  }

  /**
   * Set the SQL query engine for transparent query routing.
   * @param {Object} sqlQueryEngine - SQL query engine instance.
   */
  setSqlQueryEngine(sqlQueryEngine) {
    if (stryMutAct_9fa48("36403")) {
      {}
    } else {
      stryCov_9fa48("36403");
      this.sqlQueryEngine = sqlQueryEngine;
      this.logger.debug(CDC_LOG_MSG.SQL_ENGINE_SET, stryMutAct_9fa48("36404") ? {} : (stryCov_9fa48("36404"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Create SQL-routed write strategy.
   * @return {Object}
   * @private
   */
  createSqlWriteRouter() {
    if (stryMutAct_9fa48("36405")) {
      {}
    } else {
      stryCov_9fa48("36405");
      return createSqlWriteRouter(stryMutAct_9fa48("36406") ? {} : (stryCov_9fa48("36406"), {
        execute: stryMutAct_9fa48("36407") ? () => undefined : (stryCov_9fa48("36407"), (sql, params, options = {}) => this.executeSQLViaQueryEngine(sql, params, options))
      }));
    }
  }

  /**
   * Create bootstrap direct-write strategy.
   * @return {Object}
   * @private
   */
  createBootstrapDirectWriteRouter() {
    if (stryMutAct_9fa48("36408")) {
      {}
    } else {
      stryCov_9fa48("36408");
      return createBootstrapDirectWriteRouter(stryMutAct_9fa48("36409") ? {} : (stryCov_9fa48("36409"), {
        execute: stryMutAct_9fa48("36410") ? () => undefined : (stryCov_9fa48("36410"), (sql, params, options = {}) => this.executeSQLDirectToLocalPartition(sql, params, options))
      }));
    }
  }

  /**
   * Set active write router strategy.
   * @param {Object} writeRouter
   */
  setWriteRouter(writeRouter) {
    if (stryMutAct_9fa48("36411")) {
      {}
    } else {
      stryCov_9fa48("36411");
      this.writeRouter = writeRouter;
    }
  }

  /**
   * Enable or disable bootstrap mode for seed node direct writes.
   *
   * Bootstrap Mode (Seed Node Only):
   * - Enabled during seed node registration phase
   * - Allows direct writes to local partitions
   * - Bypasses SQL routing (which requires system cache)
   * - Solves chicken-and-egg problem: can't write without cache, can't populate
   *   cache without writing
   *
   * After Bootstrap:
   * - Mode is disabled
   * - All writes route through SQL engine
   * - SQL engine uses system cache to find partition leaders
   * - Single code path - no fallbacks
   *
   * Requirements: 8.1, 8.2
   * @param {boolean} enabled - Whether to enable bootstrap mode.
   * @param {Map} partitionServices - Map of local partition services (required if
   *   enabled).
   */
  setBootstrapMode(enabled, partitionServices) {
    if (stryMutAct_9fa48("36412")) {
      {}
    } else {
      stryCov_9fa48("36412");
      if (stryMutAct_9fa48("36414") ? false : stryMutAct_9fa48("36413") ? true : (stryCov_9fa48("36413", "36414"), enabled)) {
        if (stryMutAct_9fa48("36415")) {
          {}
        } else {
          stryCov_9fa48("36415");
          if (stryMutAct_9fa48("36417") ? false : stryMutAct_9fa48("36416") ? true : (stryCov_9fa48("36416", "36417"), this.bootstrapCompleted)) {
            if (stryMutAct_9fa48("36418")) {
              {}
            } else {
              stryCov_9fa48("36418");
              throw new Error(CDC_ERROR_MSG.BOOTSTRAP_REENTRY_FORBIDDEN);
            }
          }
          if (stryMutAct_9fa48("36421") ? !partitionServices && !(partitionServices instanceof Map) : stryMutAct_9fa48("36420") ? false : stryMutAct_9fa48("36419") ? true : (stryCov_9fa48("36419", "36420", "36421"), (stryMutAct_9fa48("36422") ? partitionServices : (stryCov_9fa48("36422"), !partitionServices)) || (stryMutAct_9fa48("36423") ? partitionServices instanceof Map : (stryCov_9fa48("36423"), !(partitionServices instanceof Map))))) {
            if (stryMutAct_9fa48("36424")) {
              {}
            } else {
              stryCov_9fa48("36424");
              throw new Error(CDC_LOG_MSG.BOOTSTRAP_MODE_REQUIRES_PARTITION_MAP);
            }
          }
          this.bootstrapMode = stryMutAct_9fa48("36425") ? false : (stryCov_9fa48("36425"), true);
          this.localPartitionServices = partitionServices;
          this.setWriteRouter(this.createBootstrapDirectWriteRouter());
          this.logger.info(CDC_LOG_MSG.BOOTSTRAP_MODE_ENABLED, stryMutAct_9fa48("36426") ? {} : (stryCov_9fa48("36426"), {
            nodeId: this.nodeId,
            partitionCount: partitionServices.size
          }));
        }
      } else {
        if (stryMutAct_9fa48("36427")) {
          {}
        } else {
          stryCov_9fa48("36427");
          if (stryMutAct_9fa48("36429") ? false : stryMutAct_9fa48("36428") ? true : (stryCov_9fa48("36428", "36429"), this.bootstrapMode)) {
            if (stryMutAct_9fa48("36430")) {
              {}
            } else {
              stryCov_9fa48("36430");
              this.bootstrapCompleted = stryMutAct_9fa48("36431") ? false : (stryCov_9fa48("36431"), true);
            }
          }
          this.bootstrapMode = stryMutAct_9fa48("36432") ? true : (stryCov_9fa48("36432"), false);
          this.localPartitionServices = null;
          this.setWriteRouter(this.createSqlWriteRouter());
          this.logger.info(CDC_LOG_MSG.BOOTSTRAP_MODE_DISABLED, stryMutAct_9fa48("36433") ? {} : (stryCov_9fa48("36433"), {
            nodeId: this.nodeId
          }));
        }
      }
    }
  }

  /**
   * Clear bootstrap mode (convenience method for disabling).
   */
  clearBootstrapMode() {
    if (stryMutAct_9fa48("36434")) {
      {}
    } else {
      stryCov_9fa48("36434");
      this.setBootstrapMode(stryMutAct_9fa48("36435") ? true : (stryCov_9fa48("36435"), false), null);
    }
  }

  /**
   * Resolve the currently available local partition-service registry.
   * @return {Map<string, Object>|null}
   * @private
   */
  resolvePartitionServices() {
    if (stryMutAct_9fa48("36436")) {
      {}
    } else {
      stryCov_9fa48("36436");
      if (stryMutAct_9fa48("36439") ? this.bootstrapMode || this.localPartitionServices instanceof Map : stryMutAct_9fa48("36438") ? false : stryMutAct_9fa48("36437") ? true : (stryCov_9fa48("36437", "36438", "36439"), this.bootstrapMode && this.localPartitionServices instanceof Map)) {
        if (stryMutAct_9fa48("36440")) {
          {}
        } else {
          stryCov_9fa48("36440");
          return this.localPartitionServices;
        }
      }
      if (stryMutAct_9fa48("36443") ? typeof this.partitionServicesProvider !== TYPEOF.FUNCTION : stryMutAct_9fa48("36442") ? false : stryMutAct_9fa48("36441") ? true : (stryCov_9fa48("36441", "36442", "36443"), typeof this.partitionServicesProvider === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("36444")) {
          {}
        } else {
          stryCov_9fa48("36444");
          const provided = this.partitionServicesProvider();
          return provided instanceof Map ? provided : null;
        }
      }
      return null;
    }
  }

  /**
   * Resolve cached system-table partition IDs for one table.
   * Falls back to the canonical initial partition ID when cache metadata is
   * not yet available locally.
   * @param {string} tableName
   * @return {Array<string>}
   * @private
   */
  resolveSystemTablePartitionIds(tableName) {
    if (stryMutAct_9fa48("36445")) {
      {}
    } else {
      stryCov_9fa48("36445");
      const cache = this.systemTableCache;
      if (stryMutAct_9fa48("36448") ? false : stryMutAct_9fa48("36447") ? true : stryMutAct_9fa48("36446") ? cache : (stryCov_9fa48("36446", "36447", "36448"), !cache)) {
        if (stryMutAct_9fa48("36449")) {
          {}
        } else {
          stryCov_9fa48("36449");
          return INITIAL_PARTITION_IDS[tableName] ? stryMutAct_9fa48("36450") ? [] : (stryCov_9fa48("36450"), [INITIAL_PARTITION_IDS[tableName]]) : stryMutAct_9fa48("36451") ? ["Stryker was here"] : (stryCov_9fa48("36451"), []);
        }
      }
      const partitionPredicate = row => {
        if (stryMutAct_9fa48("36452")) {
          {}
        } else {
          stryCov_9fa48("36452");
          const rowTableName = stryMutAct_9fa48("36453") ? (row?.table_name ?? row?.tableName) && null : (stryCov_9fa48("36453"), (stryMutAct_9fa48("36454") ? row?.table_name && row?.tableName : (stryCov_9fa48("36454"), (stryMutAct_9fa48("36455") ? row.table_name : (stryCov_9fa48("36455"), row?.table_name)) ?? (stryMutAct_9fa48("36456") ? row.tableName : (stryCov_9fa48("36456"), row?.tableName)))) ?? null);
          const rowTableId = stryMutAct_9fa48("36457") ? (row?.table_id ?? row?.tableId) && null : (stryCov_9fa48("36457"), (stryMutAct_9fa48("36458") ? row?.table_id && row?.tableId : (stryCov_9fa48("36458"), (stryMutAct_9fa48("36459") ? row.table_id : (stryCov_9fa48("36459"), row?.table_id)) ?? (stryMutAct_9fa48("36460") ? row.tableId : (stryCov_9fa48("36460"), row?.tableId)))) ?? null);
          return stryMutAct_9fa48("36463") ? rowTableName === tableName && rowTableId === tableName : stryMutAct_9fa48("36462") ? false : stryMutAct_9fa48("36461") ? true : (stryCov_9fa48("36461", "36462", "36463"), (stryMutAct_9fa48("36465") ? rowTableName !== tableName : stryMutAct_9fa48("36464") ? false : (stryCov_9fa48("36464", "36465"), rowTableName === tableName)) || (stryMutAct_9fa48("36467") ? rowTableId !== tableName : stryMutAct_9fa48("36466") ? false : (stryCov_9fa48("36466", "36467"), rowTableId === tableName)));
        }
      };
      const partitionRows = (stryMutAct_9fa48("36470") ? typeof cache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("36469") ? false : stryMutAct_9fa48("36468") ? true : (stryCov_9fa48("36468", "36469", "36470"), typeof cache.filter === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("36471") ? cache : (stryCov_9fa48("36471"), cache.filter(SYSTEM_TABLE_NAME.PARTITIONS, partitionPredicate)) : (stryMutAct_9fa48("36474") ? typeof cache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("36473") ? false : stryMutAct_9fa48("36472") ? true : (stryCov_9fa48("36472", "36473", "36474"), typeof cache.getAll === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("36475") ? cache.getAll(SYSTEM_TABLE_NAME.PARTITIONS) || [] : (stryCov_9fa48("36475"), (stryMutAct_9fa48("36478") ? cache.getAll(SYSTEM_TABLE_NAME.PARTITIONS) && [] : stryMutAct_9fa48("36477") ? false : stryMutAct_9fa48("36476") ? true : (stryCov_9fa48("36476", "36477", "36478"), cache.getAll(SYSTEM_TABLE_NAME.PARTITIONS) || (stryMutAct_9fa48("36479") ? ["Stryker was here"] : (stryCov_9fa48("36479"), [])))).filter(partitionPredicate)) : stryMutAct_9fa48("36480") ? ["Stryker was here"] : (stryCov_9fa48("36480"), []);
      const resolvedPartitionIds = stryMutAct_9fa48("36481") ? [] : (stryCov_9fa48("36481"), [...new Set(stryMutAct_9fa48("36482") ? partitionRows.map(row => row?.partition_id ?? row?.partitionId ?? row?.id ?? null) : (stryCov_9fa48("36482"), partitionRows.map(stryMutAct_9fa48("36483") ? () => undefined : (stryCov_9fa48("36483"), row => stryMutAct_9fa48("36484") ? (row?.partition_id ?? row?.partitionId ?? row?.id) && null : (stryCov_9fa48("36484"), (stryMutAct_9fa48("36485") ? (row?.partition_id ?? row?.partitionId) && row?.id : (stryCov_9fa48("36485"), (stryMutAct_9fa48("36486") ? row?.partition_id && row?.partitionId : (stryCov_9fa48("36486"), (stryMutAct_9fa48("36487") ? row.partition_id : (stryCov_9fa48("36487"), row?.partition_id)) ?? (stryMutAct_9fa48("36488") ? row.partitionId : (stryCov_9fa48("36488"), row?.partitionId)))) ?? (stryMutAct_9fa48("36489") ? row.id : (stryCov_9fa48("36489"), row?.id)))) ?? null))).filter(Boolean)))]);
      if (stryMutAct_9fa48("36493") ? resolvedPartitionIds.length <= NUM.ZERO : stryMutAct_9fa48("36492") ? resolvedPartitionIds.length >= NUM.ZERO : stryMutAct_9fa48("36491") ? false : stryMutAct_9fa48("36490") ? true : (stryCov_9fa48("36490", "36491", "36492", "36493"), resolvedPartitionIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("36494")) {
          {}
        } else {
          stryCov_9fa48("36494");
          return resolvedPartitionIds;
        }
      }
      return INITIAL_PARTITION_IDS[tableName] ? stryMutAct_9fa48("36495") ? [] : (stryCov_9fa48("36495"), [INITIAL_PARTITION_IDS[tableName]]) : stryMutAct_9fa48("36496") ? ["Stryker was here"] : (stryCov_9fa48("36496"), []);
    }
  }

  /**
   * Resolve every local partition service that hosts one partition.
   * @param {Map<string, Object>|null} partitionServices
   * @param {string} partitionId
   * @return {Array<Object>}
   * @private
   */
  resolveLocalPartitionServicesForPartition(partitionServices, partitionId) {
    if (stryMutAct_9fa48("36497")) {
      {}
    } else {
      stryCov_9fa48("36497");
      if (stryMutAct_9fa48("36500") ? !(partitionServices instanceof Map) && !partitionId : stryMutAct_9fa48("36499") ? false : stryMutAct_9fa48("36498") ? true : (stryCov_9fa48("36498", "36499", "36500"), (stryMutAct_9fa48("36501") ? partitionServices instanceof Map : (stryCov_9fa48("36501"), !(partitionServices instanceof Map))) || (stryMutAct_9fa48("36502") ? partitionId : (stryCov_9fa48("36502"), !partitionId)))) {
        if (stryMutAct_9fa48("36503")) {
          {}
        } else {
          stryCov_9fa48("36503");
          return stryMutAct_9fa48("36504") ? ["Stryker was here"] : (stryCov_9fa48("36504"), []);
        }
      }
      const matches = stryMutAct_9fa48("36505") ? ["Stryker was here"] : (stryCov_9fa48("36505"), []);
      const seenServices = new Set();
      const directMatch = stryMutAct_9fa48("36508") ? partitionServices.get(partitionId) && null : stryMutAct_9fa48("36507") ? false : stryMutAct_9fa48("36506") ? true : (stryCov_9fa48("36506", "36507", "36508"), partitionServices.get(partitionId) || null);
      if (stryMutAct_9fa48("36511") ? directMatch || !seenServices.has(directMatch) : stryMutAct_9fa48("36510") ? false : stryMutAct_9fa48("36509") ? true : (stryCov_9fa48("36509", "36510", "36511"), directMatch && (stryMutAct_9fa48("36512") ? seenServices.has(directMatch) : (stryCov_9fa48("36512"), !seenServices.has(directMatch))))) {
        if (stryMutAct_9fa48("36513")) {
          {}
        } else {
          stryCov_9fa48("36513");
          matches.push(directMatch);
          seenServices.add(directMatch);
        }
      }
      for (const partitionService of partitionServices.values()) {
        if (stryMutAct_9fa48("36514")) {
          {}
        } else {
          stryCov_9fa48("36514");
          if (stryMutAct_9fa48("36517") ? (!partitionService || partitionService.partitionId !== partitionId) && seenServices.has(partitionService) : stryMutAct_9fa48("36516") ? false : stryMutAct_9fa48("36515") ? true : (stryCov_9fa48("36515", "36516", "36517"), (stryMutAct_9fa48("36519") ? !partitionService && partitionService.partitionId !== partitionId : stryMutAct_9fa48("36518") ? false : (stryCov_9fa48("36518", "36519"), (stryMutAct_9fa48("36520") ? partitionService : (stryCov_9fa48("36520"), !partitionService)) || (stryMutAct_9fa48("36522") ? partitionService.partitionId === partitionId : stryMutAct_9fa48("36521") ? false : (stryCov_9fa48("36521", "36522"), partitionService.partitionId !== partitionId)))) || seenServices.has(partitionService))) {
            if (stryMutAct_9fa48("36523")) {
              {}
            } else {
              stryCov_9fa48("36523");
              continue;
            }
          }
          matches.push(partitionService);
          seenServices.add(partitionService);
        }
      }
      return matches;
    }
  }

  /**
   * Check whether one local partition service can be used directly.
   * @param {Object|null} partitionService
   * @return {boolean}
   * @private
   */
  isLocalPartitionServiceUsable(partitionService) {
    if (stryMutAct_9fa48("36524")) {
      {}
    } else {
      stryCov_9fa48("36524");
      if (stryMutAct_9fa48("36527") ? false : stryMutAct_9fa48("36526") ? true : stryMutAct_9fa48("36525") ? partitionService : (stryCov_9fa48("36525", "36526", "36527"), !partitionService)) {
        if (stryMutAct_9fa48("36528")) {
          {}
        } else {
          stryCov_9fa48("36528");
          return stryMutAct_9fa48("36529") ? true : (stryCov_9fa48("36529"), false);
        }
      }
      if (stryMutAct_9fa48("36532") ? partitionService.initialized !== false : stryMutAct_9fa48("36531") ? false : stryMutAct_9fa48("36530") ? true : (stryCov_9fa48("36530", "36531", "36532"), partitionService.initialized === (stryMutAct_9fa48("36533") ? true : (stryCov_9fa48("36533"), false)))) {
        if (stryMutAct_9fa48("36534")) {
          {}
        } else {
          stryCov_9fa48("36534");
          return stryMutAct_9fa48("36535") ? true : (stryCov_9fa48("36535"), false);
        }
      }
      return stryMutAct_9fa48("36538") ? (typeof partitionService.executeQuery === TYPEOF.FUNCTION || typeof partitionService.executeLocalQuery === TYPEOF.FUNCTION) && typeof partitionService?.db?.prepare === TYPEOF.FUNCTION : stryMutAct_9fa48("36537") ? false : stryMutAct_9fa48("36536") ? true : (stryCov_9fa48("36536", "36537", "36538"), (stryMutAct_9fa48("36540") ? typeof partitionService.executeQuery === TYPEOF.FUNCTION && typeof partitionService.executeLocalQuery === TYPEOF.FUNCTION : stryMutAct_9fa48("36539") ? false : (stryCov_9fa48("36539", "36540"), (stryMutAct_9fa48("36542") ? typeof partitionService.executeQuery !== TYPEOF.FUNCTION : stryMutAct_9fa48("36541") ? false : (stryCov_9fa48("36541", "36542"), typeof partitionService.executeQuery === TYPEOF.FUNCTION)) || (stryMutAct_9fa48("36544") ? typeof partitionService.executeLocalQuery !== TYPEOF.FUNCTION : stryMutAct_9fa48("36543") ? false : (stryCov_9fa48("36543", "36544"), typeof partitionService.executeLocalQuery === TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("36546") ? typeof partitionService?.db?.prepare !== TYPEOF.FUNCTION : stryMutAct_9fa48("36545") ? false : (stryCov_9fa48("36545", "36546"), typeof (stryMutAct_9fa48("36548") ? partitionService.db?.prepare : stryMutAct_9fa48("36547") ? partitionService?.db.prepare : (stryCov_9fa48("36547", "36548"), partitionService?.db?.prepare)) === TYPEOF.FUNCTION)));
    }
  }

  /**
   * Check whether one local partition service currently appears to be leader.
   * @param {Object|null} partitionService
   * @return {boolean}
   * @private
   */
  isLocalPartitionServiceLeader(partitionService) {
    if (stryMutAct_9fa48("36549")) {
      {}
    } else {
      stryCov_9fa48("36549");
      if (stryMutAct_9fa48("36552") ? false : stryMutAct_9fa48("36551") ? true : stryMutAct_9fa48("36550") ? this.isLocalPartitionServiceUsable(partitionService) : (stryCov_9fa48("36550", "36551", "36552"), !this.isLocalPartitionServiceUsable(partitionService))) {
        if (stryMutAct_9fa48("36553")) {
          {}
        } else {
          stryCov_9fa48("36553");
          return stryMutAct_9fa48("36554") ? true : (stryCov_9fa48("36554"), false);
        }
      }
      if (stryMutAct_9fa48("36557") ? partitionService.isLeader !== true : stryMutAct_9fa48("36556") ? false : stryMutAct_9fa48("36555") ? true : (stryCov_9fa48("36555", "36556", "36557"), partitionService.isLeader === (stryMutAct_9fa48("36558") ? false : (stryCov_9fa48("36558"), true)))) {
        if (stryMutAct_9fa48("36559")) {
          {}
        } else {
          stryCov_9fa48("36559");
          return stryMutAct_9fa48("36560") ? false : (stryCov_9fa48("36560"), true);
        }
      }
      if (stryMutAct_9fa48("36563") ? typeof partitionService.isLeaderReplica === TYPEOF.FUNCTION || partitionService.isLeaderReplica() === true : stryMutAct_9fa48("36562") ? false : stryMutAct_9fa48("36561") ? true : (stryCov_9fa48("36561", "36562", "36563"), (stryMutAct_9fa48("36565") ? typeof partitionService.isLeaderReplica !== TYPEOF.FUNCTION : stryMutAct_9fa48("36564") ? true : (stryCov_9fa48("36564", "36565"), typeof partitionService.isLeaderReplica === TYPEOF.FUNCTION)) && (stryMutAct_9fa48("36567") ? partitionService.isLeaderReplica() !== true : stryMutAct_9fa48("36566") ? true : (stryCov_9fa48("36566", "36567"), partitionService.isLeaderReplica() === (stryMutAct_9fa48("36568") ? false : (stryCov_9fa48("36568"), true)))))) {
        if (stryMutAct_9fa48("36569")) {
          {}
        } else {
          stryCov_9fa48("36569");
          return stryMutAct_9fa48("36570") ? false : (stryCov_9fa48("36570"), true);
        }
      }
      const role = stryMutAct_9fa48("36571") ? String((typeof partitionService.getRole === TYPEOF.FUNCTION ? partitionService.getRole() : null) || partitionService.role || partitionService.raftRole || '').toUpperCase() : (stryCov_9fa48("36571"), String(stryMutAct_9fa48("36574") ? ((typeof partitionService.getRole === TYPEOF.FUNCTION ? partitionService.getRole() : null) || partitionService.role || partitionService.raftRole) && '' : stryMutAct_9fa48("36573") ? false : stryMutAct_9fa48("36572") ? true : (stryCov_9fa48("36572", "36573", "36574"), (stryMutAct_9fa48("36576") ? ((typeof partitionService.getRole === TYPEOF.FUNCTION ? partitionService.getRole() : null) || partitionService.role) && partitionService.raftRole : stryMutAct_9fa48("36575") ? false : (stryCov_9fa48("36575", "36576"), (stryMutAct_9fa48("36578") ? (typeof partitionService.getRole === TYPEOF.FUNCTION ? partitionService.getRole() : null) && partitionService.role : stryMutAct_9fa48("36577") ? false : (stryCov_9fa48("36577", "36578"), ((stryMutAct_9fa48("36581") ? typeof partitionService.getRole !== TYPEOF.FUNCTION : stryMutAct_9fa48("36580") ? false : stryMutAct_9fa48("36579") ? true : (stryCov_9fa48("36579", "36580", "36581"), typeof partitionService.getRole === TYPEOF.FUNCTION)) ? partitionService.getRole() : null) || partitionService.role)) || partitionService.raftRole)) || (stryMutAct_9fa48("36582") ? "Stryker was here!" : (stryCov_9fa48("36582"), '')))).toLowerCase());
      if (stryMutAct_9fa48("36585") ? role !== CDC_INTEGRATION_SERVICE_LITERAL.LEADER : stryMutAct_9fa48("36584") ? false : stryMutAct_9fa48("36583") ? true : (stryCov_9fa48("36583", "36584", "36585"), role === CDC_INTEGRATION_SERVICE_LITERAL.LEADER)) {
        if (stryMutAct_9fa48("36586")) {
          {}
        } else {
          stryCov_9fa48("36586");
          return stryMutAct_9fa48("36587") ? false : (stryCov_9fa48("36587"), true);
        }
      }
      const leaderId = (stryMutAct_9fa48("36590") ? typeof partitionService.getLeaderId !== TYPEOF.FUNCTION : stryMutAct_9fa48("36589") ? false : stryMutAct_9fa48("36588") ? true : (stryCov_9fa48("36588", "36589", "36590"), typeof partitionService.getLeaderId === TYPEOF.FUNCTION)) ? partitionService.getLeaderId() : partitionService.leaderId;
      const replicaId = stryMutAct_9fa48("36593") ? partitionService.replicaId && partitionService.replica_id : stryMutAct_9fa48("36592") ? false : stryMutAct_9fa48("36591") ? true : (stryCov_9fa48("36591", "36592", "36593"), partitionService.replicaId || partitionService.replica_id);
      return stryMutAct_9fa48("36596") ? typeof leaderId === TYPEOF.STRING && typeof replicaId === TYPEOF.STRING && leaderId.length > NUM.ZERO || leaderId === replicaId : stryMutAct_9fa48("36595") ? false : stryMutAct_9fa48("36594") ? true : (stryCov_9fa48("36594", "36595", "36596"), (stryMutAct_9fa48("36598") ? typeof leaderId === TYPEOF.STRING && typeof replicaId === TYPEOF.STRING || leaderId.length > NUM.ZERO : stryMutAct_9fa48("36597") ? true : (stryCov_9fa48("36597", "36598"), (stryMutAct_9fa48("36600") ? typeof leaderId === TYPEOF.STRING || typeof replicaId === TYPEOF.STRING : stryMutAct_9fa48("36599") ? true : (stryCov_9fa48("36599", "36600"), (stryMutAct_9fa48("36602") ? typeof leaderId !== TYPEOF.STRING : stryMutAct_9fa48("36601") ? true : (stryCov_9fa48("36601", "36602"), typeof leaderId === TYPEOF.STRING)) && (stryMutAct_9fa48("36604") ? typeof replicaId !== TYPEOF.STRING : stryMutAct_9fa48("36603") ? true : (stryCov_9fa48("36603", "36604"), typeof replicaId === TYPEOF.STRING)))) && (stryMutAct_9fa48("36607") ? leaderId.length <= NUM.ZERO : stryMutAct_9fa48("36606") ? leaderId.length >= NUM.ZERO : stryMutAct_9fa48("36605") ? true : (stryCov_9fa48("36605", "36606", "36607"), leaderId.length > NUM.ZERO)))) && (stryMutAct_9fa48("36609") ? leaderId !== replicaId : stryMutAct_9fa48("36608") ? true : (stryCov_9fa48("36608", "36609"), leaderId === replicaId)));
    }
  }

  /**
   * Resolve local partition services for a system table.
   * @param {string} tableName
   * @param {Object} [options]
   * @param {string} [options.consistency]
   * @return {Array<Object>}
   * @private
   */
  resolveLocalSystemTableServices(tableName, options = {}) {
    if (stryMutAct_9fa48("36610")) {
      {}
    } else {
      stryCov_9fa48("36610");
      const partitionServices = this.resolvePartitionServices();
      if (stryMutAct_9fa48("36613") ? false : stryMutAct_9fa48("36612") ? true : stryMutAct_9fa48("36611") ? partitionServices instanceof Map : (stryCov_9fa48("36611", "36612", "36613"), !(partitionServices instanceof Map))) {
        if (stryMutAct_9fa48("36614")) {
          {}
        } else {
          stryCov_9fa48("36614");
          return stryMutAct_9fa48("36615") ? ["Stryker was here"] : (stryCov_9fa48("36615"), []);
        }
      }
      const consistency = stryMutAct_9fa48("36618") ? options.consistency && LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA : stryMutAct_9fa48("36617") ? false : stryMutAct_9fa48("36616") ? true : (stryCov_9fa48("36616", "36617", "36618"), options.consistency || LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA);
      const matches = stryMutAct_9fa48("36619") ? ["Stryker was here"] : (stryCov_9fa48("36619"), []);
      const seenServices = new Set();
      const partitionIds = this.resolveSystemTablePartitionIds(tableName);
      for (const partitionId of partitionIds) {
        if (stryMutAct_9fa48("36620")) {
          {}
        } else {
          stryCov_9fa48("36620");
          const candidates = this.resolveLocalPartitionServicesForPartition(partitionServices, partitionId);
          for (const partitionService of candidates) {
            if (stryMutAct_9fa48("36621")) {
              {}
            } else {
              stryCov_9fa48("36621");
              if (stryMutAct_9fa48("36624") ? !this.isLocalPartitionServiceUsable(partitionService) && seenServices.has(partitionService) : stryMutAct_9fa48("36623") ? false : stryMutAct_9fa48("36622") ? true : (stryCov_9fa48("36622", "36623", "36624"), (stryMutAct_9fa48("36625") ? this.isLocalPartitionServiceUsable(partitionService) : (stryCov_9fa48("36625"), !this.isLocalPartitionServiceUsable(partitionService))) || seenServices.has(partitionService))) {
                if (stryMutAct_9fa48("36626")) {
                  {}
                } else {
                  stryCov_9fa48("36626");
                  continue;
                }
              }
              if (stryMutAct_9fa48("36629") ? consistency === LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER || !this.isLocalPartitionServiceLeader(partitionService) : stryMutAct_9fa48("36628") ? false : stryMutAct_9fa48("36627") ? true : (stryCov_9fa48("36627", "36628", "36629"), (stryMutAct_9fa48("36631") ? consistency !== LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER : stryMutAct_9fa48("36630") ? true : (stryCov_9fa48("36630", "36631"), consistency === LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER)) && (stryMutAct_9fa48("36632") ? this.isLocalPartitionServiceLeader(partitionService) : (stryCov_9fa48("36632"), !this.isLocalPartitionServiceLeader(partitionService))))) {
                if (stryMutAct_9fa48("36633")) {
                  {}
                } else {
                  stryCov_9fa48("36633");
                  continue;
                }
              }
              matches.push(partitionService);
              seenServices.add(partitionService);
            }
          }
        }
      }
      stryMutAct_9fa48("36634") ? matches : (stryCov_9fa48("36634"), matches.sort((left, right) => {
        if (stryMutAct_9fa48("36635")) {
          {}
        } else {
          stryCov_9fa48("36635");
          return stryMutAct_9fa48("36636") ? Number(this.isLocalPartitionServiceLeader(right)) + Number(this.isLocalPartitionServiceLeader(left)) : (stryCov_9fa48("36636"), Number(this.isLocalPartitionServiceLeader(right)) - Number(this.isLocalPartitionServiceLeader(left)));
        }
      }));
      return matches;
    }
  }

  /**
   * Determine whether this node can satisfy one system-table write locally.
   * This is stronger than cache-based leader metadata during leadership churn:
   * if a local replica already owns leader state, direct local execution can
   * still succeed even before the services table reflects that leader row.
   * @param {string} tableName
   * @return {boolean}
   */
  canWriteSystemTableLocally(tableName) {
    if (stryMutAct_9fa48("36637")) {
      {}
    } else {
      stryCov_9fa48("36637");
      if (stryMutAct_9fa48("36640") ? !tableName && !VALID_SYSTEM_TABLES.includes(tableName) : stryMutAct_9fa48("36639") ? false : stryMutAct_9fa48("36638") ? true : (stryCov_9fa48("36638", "36639", "36640"), (stryMutAct_9fa48("36641") ? tableName : (stryCov_9fa48("36641"), !tableName)) || (stryMutAct_9fa48("36642") ? VALID_SYSTEM_TABLES.includes(tableName) : (stryCov_9fa48("36642"), !VALID_SYSTEM_TABLES.includes(tableName))))) {
        if (stryMutAct_9fa48("36643")) {
          {}
        } else {
          stryCov_9fa48("36643");
          return stryMutAct_9fa48("36644") ? true : (stryCov_9fa48("36644"), false);
        }
      }
      const localLeaders = this.resolveLocalSystemTableServices(tableName, stryMutAct_9fa48("36645") ? {} : (stryCov_9fa48("36645"), {
        consistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER
      }));
      return stryMutAct_9fa48("36649") ? localLeaders.length <= NUM.ZERO : stryMutAct_9fa48("36648") ? localLeaders.length >= NUM.ZERO : stryMutAct_9fa48("36647") ? false : stryMutAct_9fa48("36646") ? true : (stryCov_9fa48("36646", "36647", "36648", "36649"), localLeaders.length > NUM.ZERO);
    }
  }

  /**
   * Execute one read query against one local partition service.
   * @param {Object} partitionService
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalSystemTableRead(partitionService, sql, params = stryMutAct_9fa48("36650") ? ["Stryker was here"] : (stryCov_9fa48("36650"), [])) {
    if (stryMutAct_9fa48("36651")) {
      {}
    } else {
      stryCov_9fa48("36651");
      if (stryMutAct_9fa48("36654") ? typeof partitionService?.executeQuery !== TYPEOF.FUNCTION : stryMutAct_9fa48("36653") ? false : stryMutAct_9fa48("36652") ? true : (stryCov_9fa48("36652", "36653", "36654"), typeof (stryMutAct_9fa48("36655") ? partitionService.executeQuery : (stryCov_9fa48("36655"), partitionService?.executeQuery)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("36656")) {
          {}
        } else {
          stryCov_9fa48("36656");
          return partitionService.executeQuery(sql, params);
        }
      }
      if (stryMutAct_9fa48("36659") ? typeof partitionService?.executeLocalQuery !== TYPEOF.FUNCTION : stryMutAct_9fa48("36658") ? false : stryMutAct_9fa48("36657") ? true : (stryCov_9fa48("36657", "36658", "36659"), typeof (stryMutAct_9fa48("36660") ? partitionService.executeLocalQuery : (stryCov_9fa48("36660"), partitionService?.executeLocalQuery)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("36661")) {
          {}
        } else {
          stryCov_9fa48("36661");
          return partitionService.executeLocalQuery(sql, params);
        }
      }
      if (stryMutAct_9fa48("36664") ? typeof partitionService?.db?.prepare !== TYPEOF.FUNCTION : stryMutAct_9fa48("36663") ? false : stryMutAct_9fa48("36662") ? true : (stryCov_9fa48("36662", "36663", "36664"), typeof (stryMutAct_9fa48("36666") ? partitionService.db?.prepare : stryMutAct_9fa48("36665") ? partitionService?.db.prepare : (stryCov_9fa48("36665", "36666"), partitionService?.db?.prepare)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("36667")) {
          {}
        } else {
          stryCov_9fa48("36667");
          const stmt = partitionService.db.prepare(sql);
          return stryMutAct_9fa48("36668") ? {} : (stryCov_9fa48("36668"), {
            success: stryMutAct_9fa48("36669") ? false : (stryCov_9fa48("36669"), true),
            rows: stmt.all(...params)
          });
        }
      }
      return stryMutAct_9fa48("36670") ? {} : (stryCov_9fa48("36670"), {
        success: stryMutAct_9fa48("36671") ? true : (stryCov_9fa48("36671"), false),
        error: CDC_INTEGRATION_SERVICE_LITERAL.LOCAL_PARTITION_QUERY_UNAVAILABLE,
        rows: stryMutAct_9fa48("36672") ? ["Stryker was here"] : (stryCov_9fa48("36672"), [])
      });
    }
  }

  /**
   * Normalize one authoritative row version into a comparable value.
   * @param {Object|null} row
   * @return {number|string|null}
   * @private
   */
  extractAuthoritativeRowVersion(row) {
    if (stryMutAct_9fa48("36673")) {
      {}
    } else {
      stryCov_9fa48("36673");
      if (stryMutAct_9fa48("36676") ? !row && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("36675") ? false : stryMutAct_9fa48("36674") ? true : (stryCov_9fa48("36674", "36675", "36676"), (stryMutAct_9fa48("36677") ? row : (stryCov_9fa48("36677"), !row)) || (stryMutAct_9fa48("36679") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("36678") ? false : (stryCov_9fa48("36678", "36679"), typeof row !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("36680")) {
          {}
        } else {
          stryCov_9fa48("36680");
          return null;
        }
      }
      for (const fieldName of AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES) {
        if (stryMutAct_9fa48("36681")) {
          {}
        } else {
          stryCov_9fa48("36681");
          const value = row[fieldName];
          if (stryMutAct_9fa48("36684") ? value === undefined && value === null : stryMutAct_9fa48("36683") ? false : stryMutAct_9fa48("36682") ? true : (stryCov_9fa48("36682", "36683", "36684"), (stryMutAct_9fa48("36686") ? value !== undefined : stryMutAct_9fa48("36685") ? false : (stryCov_9fa48("36685", "36686"), value === undefined)) || (stryMutAct_9fa48("36688") ? value !== null : stryMutAct_9fa48("36687") ? false : (stryCov_9fa48("36687", "36688"), value === null)))) {
            if (stryMutAct_9fa48("36689")) {
              {}
            } else {
              stryCov_9fa48("36689");
              continue;
            }
          }
          const comparable = this.normalizeComparableCacheFieldValue(value);
          if (stryMutAct_9fa48("36692") ? comparable === null : stryMutAct_9fa48("36691") ? false : stryMutAct_9fa48("36690") ? true : (stryCov_9fa48("36690", "36691", "36692"), comparable !== null)) {
            if (stryMutAct_9fa48("36693")) {
              {}
            } else {
              stryCov_9fa48("36693");
              return comparable;
            }
          }
          if (stryMutAct_9fa48("36696") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("36695") ? false : stryMutAct_9fa48("36694") ? true : (stryCov_9fa48("36694", "36695", "36696"), (stryMutAct_9fa48("36698") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("36697") ? true : (stryCov_9fa48("36697", "36698"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("36701") ? value.length <= NUM.ZERO : stryMutAct_9fa48("36700") ? value.length >= NUM.ZERO : stryMutAct_9fa48("36699") ? true : (stryCov_9fa48("36699", "36700", "36701"), value.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("36702")) {
              {}
            } else {
              stryCov_9fa48("36702");
              return value;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Prefer the fresher authoritative repair row.
   * @param {Object} candidate
   * @param {Object} existing
   * @return {boolean}
   * @private
   */
  isAuthoritativeRepairRowNewer(candidate, existing) {
    if (stryMutAct_9fa48("36703")) {
      {}
    } else {
      stryCov_9fa48("36703");
      const candidateVersion = this.extractAuthoritativeRowVersion(candidate);
      const existingVersion = this.extractAuthoritativeRowVersion(existing);
      if (stryMutAct_9fa48("36706") ? candidateVersion !== null || existingVersion !== null : stryMutAct_9fa48("36705") ? false : stryMutAct_9fa48("36704") ? true : (stryCov_9fa48("36704", "36705", "36706"), (stryMutAct_9fa48("36708") ? candidateVersion === null : stryMutAct_9fa48("36707") ? true : (stryCov_9fa48("36707", "36708"), candidateVersion !== null)) && (stryMutAct_9fa48("36710") ? existingVersion === null : stryMutAct_9fa48("36709") ? true : (stryCov_9fa48("36709", "36710"), existingVersion !== null)))) {
        if (stryMutAct_9fa48("36711")) {
          {}
        } else {
          stryCov_9fa48("36711");
          if (stryMutAct_9fa48("36714") ? candidateVersion !== existingVersion : stryMutAct_9fa48("36713") ? false : stryMutAct_9fa48("36712") ? true : (stryCov_9fa48("36712", "36713", "36714"), candidateVersion === existingVersion)) {
            if (stryMutAct_9fa48("36715")) {
              {}
            } else {
              stryCov_9fa48("36715");
              return stryMutAct_9fa48("36719") ? JSON.stringify(candidate).length <= JSON.stringify(existing).length : stryMutAct_9fa48("36718") ? JSON.stringify(candidate).length >= JSON.stringify(existing).length : stryMutAct_9fa48("36717") ? false : stryMutAct_9fa48("36716") ? true : (stryCov_9fa48("36716", "36717", "36718", "36719"), JSON.stringify(candidate).length > JSON.stringify(existing).length);
            }
          }
          return stryMutAct_9fa48("36723") ? candidateVersion <= existingVersion : stryMutAct_9fa48("36722") ? candidateVersion >= existingVersion : stryMutAct_9fa48("36721") ? false : stryMutAct_9fa48("36720") ? true : (stryCov_9fa48("36720", "36721", "36722", "36723"), candidateVersion > existingVersion);
        }
      }
      if (stryMutAct_9fa48("36726") ? candidateVersion === null : stryMutAct_9fa48("36725") ? false : stryMutAct_9fa48("36724") ? true : (stryCov_9fa48("36724", "36725", "36726"), candidateVersion !== null)) {
        if (stryMutAct_9fa48("36727")) {
          {}
        } else {
          stryCov_9fa48("36727");
          return stryMutAct_9fa48("36728") ? false : (stryCov_9fa48("36728"), true);
        }
      }
      if (stryMutAct_9fa48("36731") ? existingVersion === null : stryMutAct_9fa48("36730") ? false : stryMutAct_9fa48("36729") ? true : (stryCov_9fa48("36729", "36730", "36731"), existingVersion !== null)) {
        if (stryMutAct_9fa48("36732")) {
          {}
        } else {
          stryCov_9fa48("36732");
          return stryMutAct_9fa48("36733") ? true : (stryCov_9fa48("36733"), false);
        }
      }
      return stryMutAct_9fa48("36737") ? JSON.stringify(candidate).length <= JSON.stringify(existing).length : stryMutAct_9fa48("36736") ? JSON.stringify(candidate).length >= JSON.stringify(existing).length : stryMutAct_9fa48("36735") ? false : stryMutAct_9fa48("36734") ? true : (stryCov_9fa48("36734", "36735", "36736", "36737"), JSON.stringify(candidate).length > JSON.stringify(existing).length);
    }
  }

  /**
   * Merge replicated authoritative row sets by primary key.
   * @param {string} tableName
   * @param {Array<Array<Object>>} rowSets
   * @return {Array<Object>}
   * @private
   */
  mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
    if (stryMutAct_9fa48("36738")) {
      {}
    } else {
      stryCov_9fa48("36738");
      const keyField = this.getPrimaryKeyField(tableName);
      const mergedRows = new Map();
      for (const rowSet of rowSets) {
        if (stryMutAct_9fa48("36739")) {
          {}
        } else {
          stryCov_9fa48("36739");
          const rows = Array.isArray(rowSet) ? rowSet : stryMutAct_9fa48("36740") ? ["Stryker was here"] : (stryCov_9fa48("36740"), []);
          for (const row of rows) {
            if (stryMutAct_9fa48("36741")) {
              {}
            } else {
              stryCov_9fa48("36741");
              const key = stryMutAct_9fa48("36742") ? (row?.[keyField] ?? row?.id) && null : (stryCov_9fa48("36742"), (stryMutAct_9fa48("36743") ? row?.[keyField] && row?.id : (stryCov_9fa48("36743"), (stryMutAct_9fa48("36744") ? row[keyField] : (stryCov_9fa48("36744"), row?.[keyField])) ?? (stryMutAct_9fa48("36745") ? row.id : (stryCov_9fa48("36745"), row?.id)))) ?? null);
              if (stryMutAct_9fa48("36748") ? key === null && key === undefined : stryMutAct_9fa48("36747") ? false : stryMutAct_9fa48("36746") ? true : (stryCov_9fa48("36746", "36747", "36748"), (stryMutAct_9fa48("36750") ? key !== null : stryMutAct_9fa48("36749") ? false : (stryCov_9fa48("36749", "36750"), key === null)) || (stryMutAct_9fa48("36752") ? key !== undefined : stryMutAct_9fa48("36751") ? false : (stryCov_9fa48("36751", "36752"), key === undefined)))) {
                if (stryMutAct_9fa48("36753")) {
                  {}
                } else {
                  stryCov_9fa48("36753");
                  continue;
                }
              }
              const existing = mergedRows.get(key);
              if (stryMutAct_9fa48("36756") ? !existing && this.isAuthoritativeRepairRowNewer(row, existing) : stryMutAct_9fa48("36755") ? false : stryMutAct_9fa48("36754") ? true : (stryCov_9fa48("36754", "36755", "36756"), (stryMutAct_9fa48("36757") ? existing : (stryCov_9fa48("36757"), !existing)) || this.isAuthoritativeRepairRowNewer(row, existing))) {
                if (stryMutAct_9fa48("36758")) {
                  {}
                } else {
                  stryCov_9fa48("36758");
                  mergedRows.set(key, row);
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("36759") ? [] : (stryCov_9fa48("36759"), [...mergedRows.values()]);
    }
  }

  /**
   * Read authoritative rows from node-local system partition replicas when
   * available.
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options]
   * @param {string} [options.consistency]
   * @return {Promise<{available: boolean, rows: Array<Object>}>}
   * @private
   */
  async queryLocalAuthoritativeSystemTableRows(tableName, sql, params = stryMutAct_9fa48("36760") ? ["Stryker was here"] : (stryCov_9fa48("36760"), []), options = {}) {
    if (stryMutAct_9fa48("36761")) {
      {}
    } else {
      stryCov_9fa48("36761");
      const localServices = this.resolveLocalSystemTableServices(tableName, stryMutAct_9fa48("36762") ? {} : (stryCov_9fa48("36762"), {
        consistency: options.consistency
      }));
      if (stryMutAct_9fa48("36765") ? localServices.length !== NUM.ZERO : stryMutAct_9fa48("36764") ? false : stryMutAct_9fa48("36763") ? true : (stryCov_9fa48("36763", "36764", "36765"), localServices.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("36766")) {
          {}
        } else {
          stryCov_9fa48("36766");
          return stryMutAct_9fa48("36767") ? {} : (stryCov_9fa48("36767"), {
            available: stryMutAct_9fa48("36768") ? true : (stryCov_9fa48("36768"), false),
            rows: stryMutAct_9fa48("36769") ? ["Stryker was here"] : (stryCov_9fa48("36769"), [])
          });
        }
      }
      const rowSets = stryMutAct_9fa48("36770") ? ["Stryker was here"] : (stryCov_9fa48("36770"), []);
      let available = stryMutAct_9fa48("36771") ? true : (stryCov_9fa48("36771"), false);
      for (const partitionService of localServices) {
        if (stryMutAct_9fa48("36772")) {
          {}
        } else {
          stryCov_9fa48("36772");
          try {
            if (stryMutAct_9fa48("36773")) {
              {}
            } else {
              stryCov_9fa48("36773");
              const result = await this.executeLocalSystemTableRead(partitionService, sql, params);
              if (stryMutAct_9fa48("36776") ? !result && result.success === false : stryMutAct_9fa48("36775") ? false : stryMutAct_9fa48("36774") ? true : (stryCov_9fa48("36774", "36775", "36776"), (stryMutAct_9fa48("36777") ? result : (stryCov_9fa48("36777"), !result)) || (stryMutAct_9fa48("36779") ? result.success !== false : stryMutAct_9fa48("36778") ? false : (stryCov_9fa48("36778", "36779"), result.success === (stryMutAct_9fa48("36780") ? true : (stryCov_9fa48("36780"), false)))))) {
                if (stryMutAct_9fa48("36781")) {
                  {}
                } else {
                  stryCov_9fa48("36781");
                  continue;
                }
              }
              rowSets.push(Array.isArray(result.rows) ? result.rows : stryMutAct_9fa48("36782") ? ["Stryker was here"] : (stryCov_9fa48("36782"), []));
              available = stryMutAct_9fa48("36783") ? false : (stryCov_9fa48("36783"), true);
            }
          } catch (error) {
            if (stryMutAct_9fa48("36784")) {
              {}
            } else {
              stryCov_9fa48("36784");
              this.logger.warn(stryMutAct_9fa48("36785") ? CDC_INTEGRATION_SERVICE_LITERAL.FAILED_TO_READ_AUTHORITATIVE_SYSTEM_TABLE_ROWS_FROM_LOCAL - CDC_INTEGRATION_SERVICE_LITERAL.PARTITION_REPLICA : (stryCov_9fa48("36785"), CDC_INTEGRATION_SERVICE_LITERAL.FAILED_TO_READ_AUTHORITATIVE_SYSTEM_TABLE_ROWS_FROM_LOCAL + CDC_INTEGRATION_SERVICE_LITERAL.PARTITION_REPLICA), stryMutAct_9fa48("36786") ? {} : (stryCov_9fa48("36786"), {
                nodeId: this.nodeId,
                tableName,
                partitionId: stryMutAct_9fa48("36789") ? partitionService?.partitionId && null : stryMutAct_9fa48("36788") ? false : stryMutAct_9fa48("36787") ? true : (stryCov_9fa48("36787", "36788", "36789"), (stryMutAct_9fa48("36790") ? partitionService.partitionId : (stryCov_9fa48("36790"), partitionService?.partitionId)) || null),
                replicaId: stryMutAct_9fa48("36793") ? partitionService?.replicaId && null : stryMutAct_9fa48("36792") ? false : stryMutAct_9fa48("36791") ? true : (stryCov_9fa48("36791", "36792", "36793"), (stryMutAct_9fa48("36794") ? partitionService.replicaId : (stryCov_9fa48("36794"), partitionService?.replicaId)) || null),
                error: stryMutAct_9fa48("36797") ? error?.message && String(error) : stryMutAct_9fa48("36796") ? false : stryMutAct_9fa48("36795") ? true : (stryCov_9fa48("36795", "36796", "36797"), (stryMutAct_9fa48("36798") ? error.message : (stryCov_9fa48("36798"), error?.message)) || String(error))
              }));
            }
          }
        }
      }
      return stryMutAct_9fa48("36799") ? {} : (stryCov_9fa48("36799"), {
        available,
        rows: available ? this.mergeAuthoritativeSystemTableRowSets(tableName, rowSets) : stryMutAct_9fa48("36800") ? ["Stryker was here"] : (stryCov_9fa48("36800"), [])
      });
    }
  }

  /**
   * Build bounded routing diagnostics for one system-table operation.
   * @param {string} tableName
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildSystemTableOperationDiagnostics(tableName, options = {}) {
    if (stryMutAct_9fa48("36801")) {
      {}
    } else {
      stryCov_9fa48("36801");
      const queryOptions = (stryMutAct_9fa48("36804") ? options?.queryOptions || typeof options.queryOptions === TYPEOF.OBJECT : stryMutAct_9fa48("36803") ? false : stryMutAct_9fa48("36802") ? true : (stryCov_9fa48("36802", "36803", "36804"), (stryMutAct_9fa48("36805") ? options.queryOptions : (stryCov_9fa48("36805"), options?.queryOptions)) && (stryMutAct_9fa48("36807") ? typeof options.queryOptions !== TYPEOF.OBJECT : stryMutAct_9fa48("36806") ? true : (stryCov_9fa48("36806", "36807"), typeof options.queryOptions === TYPEOF.OBJECT)))) ? options.queryOptions : {};
      const routingReadinessDimension = stryMutAct_9fa48("36810") ? queryOptions.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("36809") ? false : stryMutAct_9fa48("36808") ? true : (stryCov_9fa48("36808", "36809", "36810"), queryOptions.routingReadinessDimension || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE);
      const partitionIds = this.resolveSystemTablePartitionIds(tableName);
      const partitionId = stryMutAct_9fa48("36813") ? partitionIds[NUM.ZERO] && null : stryMutAct_9fa48("36812") ? false : stryMutAct_9fa48("36811") ? true : (stryCov_9fa48("36811", "36812", "36813"), partitionIds[NUM.ZERO] || null);
      let routingSnapshot = null;
      if (stryMutAct_9fa48("36816") ? partitionId && this.sqlQueryEngine?.queryExecutor || typeof this.sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot === TYPEOF.FUNCTION : stryMutAct_9fa48("36815") ? false : stryMutAct_9fa48("36814") ? true : (stryCov_9fa48("36814", "36815", "36816"), (stryMutAct_9fa48("36818") ? partitionId || this.sqlQueryEngine?.queryExecutor : stryMutAct_9fa48("36817") ? true : (stryCov_9fa48("36817", "36818"), partitionId && (stryMutAct_9fa48("36819") ? this.sqlQueryEngine.queryExecutor : (stryCov_9fa48("36819"), this.sqlQueryEngine?.queryExecutor)))) && (stryMutAct_9fa48("36821") ? typeof this.sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("36820") ? true : (stryCov_9fa48("36820", "36821"), typeof this.sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("36822")) {
          {}
        } else {
          stryCov_9fa48("36822");
          try {
            if (stryMutAct_9fa48("36823")) {
              {}
            } else {
              stryCov_9fa48("36823");
              routingSnapshot = this.sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot(partitionId, routingReadinessDimension);
            }
          } catch (_error) {
            if (stryMutAct_9fa48("36824")) {
              {}
            } else {
              stryCov_9fa48("36824");
              routingSnapshot = null;
            }
          }
        }
      }
      let partitionRow = null;
      let serviceRows = stryMutAct_9fa48("36825") ? ["Stryker was here"] : (stryCov_9fa48("36825"), []);
      if (stryMutAct_9fa48("36828") ? this.systemTableCache || typeof this.systemTableCache.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("36827") ? false : stryMutAct_9fa48("36826") ? true : (stryCov_9fa48("36826", "36827", "36828"), this.systemTableCache && (stryMutAct_9fa48("36830") ? typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("36829") ? true : (stryCov_9fa48("36829", "36830"), typeof this.systemTableCache.filter === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("36831")) {
          {}
        } else {
          stryCov_9fa48("36831");
          const partitionRows = stryMutAct_9fa48("36834") ? this.systemTableCache.filter(SYSTEM_TABLE_NAME.PARTITIONS, row => {
            const rowPartitionId = row?.partition_id || row?.partitionId || row?.id || null;
            if (partitionId && rowPartitionId === partitionId) {
              return true;
            }
            return row?.table_name === tableName || row?.tableName === tableName;
          }) && [] : stryMutAct_9fa48("36833") ? false : stryMutAct_9fa48("36832") ? true : (stryCov_9fa48("36832", "36833", "36834"), (stryMutAct_9fa48("36835") ? this.systemTableCache : (stryCov_9fa48("36835"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.PARTITIONS, row => {
            if (stryMutAct_9fa48("36836")) {
              {}
            } else {
              stryCov_9fa48("36836");
              const rowPartitionId = stryMutAct_9fa48("36839") ? (row?.partition_id || row?.partitionId || row?.id) && null : stryMutAct_9fa48("36838") ? false : stryMutAct_9fa48("36837") ? true : (stryCov_9fa48("36837", "36838", "36839"), (stryMutAct_9fa48("36841") ? (row?.partition_id || row?.partitionId) && row?.id : stryMutAct_9fa48("36840") ? false : (stryCov_9fa48("36840", "36841"), (stryMutAct_9fa48("36843") ? row?.partition_id && row?.partitionId : stryMutAct_9fa48("36842") ? false : (stryCov_9fa48("36842", "36843"), (stryMutAct_9fa48("36844") ? row.partition_id : (stryCov_9fa48("36844"), row?.partition_id)) || (stryMutAct_9fa48("36845") ? row.partitionId : (stryCov_9fa48("36845"), row?.partitionId)))) || (stryMutAct_9fa48("36846") ? row.id : (stryCov_9fa48("36846"), row?.id)))) || null);
              if (stryMutAct_9fa48("36849") ? partitionId || rowPartitionId === partitionId : stryMutAct_9fa48("36848") ? false : stryMutAct_9fa48("36847") ? true : (stryCov_9fa48("36847", "36848", "36849"), partitionId && (stryMutAct_9fa48("36851") ? rowPartitionId !== partitionId : stryMutAct_9fa48("36850") ? true : (stryCov_9fa48("36850", "36851"), rowPartitionId === partitionId)))) {
                if (stryMutAct_9fa48("36852")) {
                  {}
                } else {
                  stryCov_9fa48("36852");
                  return stryMutAct_9fa48("36853") ? false : (stryCov_9fa48("36853"), true);
                }
              }
              return stryMutAct_9fa48("36856") ? row?.table_name === tableName && row?.tableName === tableName : stryMutAct_9fa48("36855") ? false : stryMutAct_9fa48("36854") ? true : (stryCov_9fa48("36854", "36855", "36856"), (stryMutAct_9fa48("36858") ? row?.table_name !== tableName : stryMutAct_9fa48("36857") ? false : (stryCov_9fa48("36857", "36858"), (stryMutAct_9fa48("36859") ? row.table_name : (stryCov_9fa48("36859"), row?.table_name)) === tableName)) || (stryMutAct_9fa48("36861") ? row?.tableName !== tableName : stryMutAct_9fa48("36860") ? false : (stryCov_9fa48("36860", "36861"), (stryMutAct_9fa48("36862") ? row.tableName : (stryCov_9fa48("36862"), row?.tableName)) === tableName)));
            }
          }))) || (stryMutAct_9fa48("36863") ? ["Stryker was here"] : (stryCov_9fa48("36863"), [])));
          partitionRow = stryMutAct_9fa48("36866") ? partitionRows[NUM.ZERO] && null : stryMutAct_9fa48("36865") ? false : stryMutAct_9fa48("36864") ? true : (stryCov_9fa48("36864", "36865", "36866"), partitionRows[NUM.ZERO] || null);
          if (stryMutAct_9fa48("36868") ? false : stryMutAct_9fa48("36867") ? true : (stryCov_9fa48("36867", "36868"), partitionId)) {
            if (stryMutAct_9fa48("36869")) {
              {}
            } else {
              stryCov_9fa48("36869");
              serviceRows = stryMutAct_9fa48("36872") ? this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, row => {
                return row?.partition_id === partitionId && row?.service_type === SERVICE_TYPE.PARTITION;
              }) && [] : stryMutAct_9fa48("36871") ? false : stryMutAct_9fa48("36870") ? true : (stryCov_9fa48("36870", "36871", "36872"), (stryMutAct_9fa48("36873") ? this.systemTableCache : (stryCov_9fa48("36873"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, row => {
                if (stryMutAct_9fa48("36874")) {
                  {}
                } else {
                  stryCov_9fa48("36874");
                  return stryMutAct_9fa48("36877") ? row?.partition_id === partitionId || row?.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("36876") ? false : stryMutAct_9fa48("36875") ? true : (stryCov_9fa48("36875", "36876", "36877"), (stryMutAct_9fa48("36879") ? row?.partition_id !== partitionId : stryMutAct_9fa48("36878") ? true : (stryCov_9fa48("36878", "36879"), (stryMutAct_9fa48("36880") ? row.partition_id : (stryCov_9fa48("36880"), row?.partition_id)) === partitionId)) && (stryMutAct_9fa48("36882") ? row?.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("36881") ? true : (stryCov_9fa48("36881", "36882"), (stryMutAct_9fa48("36883") ? row.service_type : (stryCov_9fa48("36883"), row?.service_type)) === SERVICE_TYPE.PARTITION)));
                }
              }))) || (stryMutAct_9fa48("36884") ? ["Stryker was here"] : (stryCov_9fa48("36884"), [])));
            }
          }
        }
      }
      const leaderNodeId = stryMutAct_9fa48("36887") ? (routingSnapshot?.canonicalLeaderNodeId || partitionRow?.leader_node_id || partitionRow?.leaderNodeId) && null : stryMutAct_9fa48("36886") ? false : stryMutAct_9fa48("36885") ? true : (stryCov_9fa48("36885", "36886", "36887"), (stryMutAct_9fa48("36889") ? (routingSnapshot?.canonicalLeaderNodeId || partitionRow?.leader_node_id) && partitionRow?.leaderNodeId : stryMutAct_9fa48("36888") ? false : (stryCov_9fa48("36888", "36889"), (stryMutAct_9fa48("36891") ? routingSnapshot?.canonicalLeaderNodeId && partitionRow?.leader_node_id : stryMutAct_9fa48("36890") ? false : (stryCov_9fa48("36890", "36891"), (stryMutAct_9fa48("36892") ? routingSnapshot.canonicalLeaderNodeId : (stryCov_9fa48("36892"), routingSnapshot?.canonicalLeaderNodeId)) || (stryMutAct_9fa48("36893") ? partitionRow.leader_node_id : (stryCov_9fa48("36893"), partitionRow?.leader_node_id)))) || (stryMutAct_9fa48("36894") ? partitionRow.leaderNodeId : (stryCov_9fa48("36894"), partitionRow?.leaderNodeId)))) || null);
      const serviceRowCount = Number.isFinite(stryMutAct_9fa48("36895") ? routingSnapshot.serviceRowCount : (stryCov_9fa48("36895"), routingSnapshot?.serviceRowCount)) ? routingSnapshot.serviceRowCount : serviceRows.length;
      const routableServiceCount = Number.isFinite(stryMutAct_9fa48("36896") ? routingSnapshot.routableServiceCount : (stryCov_9fa48("36896"), routingSnapshot?.routableServiceCount)) ? routingSnapshot.routableServiceCount : stryMutAct_9fa48("36897") ? serviceRows.length : (stryCov_9fa48("36897"), serviceRows.filter(row => {
        if (stryMutAct_9fa48("36898")) {
          {}
        } else {
          stryCov_9fa48("36898");
          return stryMutAct_9fa48("36901") ? row?.status === SERVICE_STATUS.ACTIVE && typeof row?.address === TYPEOF.STRING || row.address.length > NUM.ZERO : stryMutAct_9fa48("36900") ? false : stryMutAct_9fa48("36899") ? true : (stryCov_9fa48("36899", "36900", "36901"), (stryMutAct_9fa48("36903") ? row?.status === SERVICE_STATUS.ACTIVE || typeof row?.address === TYPEOF.STRING : stryMutAct_9fa48("36902") ? true : (stryCov_9fa48("36902", "36903"), (stryMutAct_9fa48("36905") ? row?.status !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("36904") ? true : (stryCov_9fa48("36904", "36905"), (stryMutAct_9fa48("36906") ? row.status : (stryCov_9fa48("36906"), row?.status)) === SERVICE_STATUS.ACTIVE)) && (stryMutAct_9fa48("36908") ? typeof row?.address !== TYPEOF.STRING : stryMutAct_9fa48("36907") ? true : (stryCov_9fa48("36907", "36908"), typeof (stryMutAct_9fa48("36909") ? row.address : (stryCov_9fa48("36909"), row?.address)) === TYPEOF.STRING)))) && (stryMutAct_9fa48("36912") ? row.address.length <= NUM.ZERO : stryMutAct_9fa48("36911") ? row.address.length >= NUM.ZERO : stryMutAct_9fa48("36910") ? true : (stryCov_9fa48("36910", "36911", "36912"), row.address.length > NUM.ZERO)));
        }
      }).length);
      return Object.freeze(stryMutAct_9fa48("36913") ? {} : (stryCov_9fa48("36913"), {
        partitionId,
        leaderNodeId: (stryMutAct_9fa48("36916") ? typeof leaderNodeId === TYPEOF.STRING || leaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("36915") ? false : stryMutAct_9fa48("36914") ? true : (stryCov_9fa48("36914", "36915", "36916"), (stryMutAct_9fa48("36918") ? typeof leaderNodeId !== TYPEOF.STRING : stryMutAct_9fa48("36917") ? true : (stryCov_9fa48("36917", "36918"), typeof leaderNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("36921") ? leaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("36920") ? leaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("36919") ? true : (stryCov_9fa48("36919", "36920", "36921"), leaderNodeId.length > NUM.ZERO)))) ? leaderNodeId : null,
        serviceRowCount,
        routableServiceCount,
        queryTimeoutMs: (stryMutAct_9fa48("36924") ? Number.isFinite(queryOptions.timeoutMs) || queryOptions.timeoutMs > NUM.ZERO : stryMutAct_9fa48("36923") ? false : stryMutAct_9fa48("36922") ? true : (stryCov_9fa48("36922", "36923", "36924"), Number.isFinite(queryOptions.timeoutMs) && (stryMutAct_9fa48("36927") ? queryOptions.timeoutMs <= NUM.ZERO : stryMutAct_9fa48("36926") ? queryOptions.timeoutMs >= NUM.ZERO : stryMutAct_9fa48("36925") ? true : (stryCov_9fa48("36925", "36926", "36927"), queryOptions.timeoutMs > NUM.ZERO)))) ? Math.floor(queryOptions.timeoutMs) : null,
        routingReadinessDimension,
        deniedByReadiness: (stryMutAct_9fa48("36930") ? routingSnapshot || typeof routingSnapshot.deniedByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("36929") ? false : stryMutAct_9fa48("36928") ? true : (stryCov_9fa48("36928", "36929", "36930"), routingSnapshot && (stryMutAct_9fa48("36932") ? typeof routingSnapshot.deniedByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("36931") ? true : (stryCov_9fa48("36931", "36932"), typeof routingSnapshot.deniedByNodeId === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("36936") ? Object.keys(routingSnapshot.deniedByNodeId).length <= NUM.ZERO : stryMutAct_9fa48("36935") ? Object.keys(routingSnapshot.deniedByNodeId).length >= NUM.ZERO : stryMutAct_9fa48("36934") ? false : stryMutAct_9fa48("36933") ? true : (stryCov_9fa48("36933", "36934", "36935", "36936"), Object.keys(routingSnapshot.deniedByNodeId).length > NUM.ZERO) : stryMutAct_9fa48("36937") ? true : (stryCov_9fa48("36937"), false)
      }));
    }
  }

  /**
   * Execute an authoritative system-table read. Prefers local partition
   * replicas and falls back to the routed SQL engine when necessary.
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async executeAuthoritativeSystemTableRead(tableName, sql, params = stryMutAct_9fa48("36938") ? ["Stryker was here"] : (stryCov_9fa48("36938"), []), options = {}) {
    if (stryMutAct_9fa48("36939")) {
      {}
    } else {
      stryCov_9fa48("36939");
      const statement = stryMutAct_9fa48("36942") ? sql && `SELECT * FROM ${tableName}` : stryMutAct_9fa48("36941") ? false : stryMutAct_9fa48("36940") ? true : (stryCov_9fa48("36940", "36941", "36942"), sql || (stryMutAct_9fa48("36943") ? `` : (stryCov_9fa48("36943"), `SELECT * FROM ${tableName}`)));
      const requireOwnerRpcRead = stryMutAct_9fa48("36946") ? options.requireOwnerRpcRead !== true : stryMutAct_9fa48("36945") ? false : stryMutAct_9fa48("36944") ? true : (stryCov_9fa48("36944", "36945", "36946"), options.requireOwnerRpcRead === (stryMutAct_9fa48("36947") ? false : (stryCov_9fa48("36947"), true)));
      const preferredConsistency = stryMutAct_9fa48("36950") ? options.localReadConsistency && LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA : stryMutAct_9fa48("36949") ? false : stryMutAct_9fa48("36948") ? true : (stryCov_9fa48("36948", "36949", "36950"), options.localReadConsistency || LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA);
      const preferOwnerRpcRead = stryMutAct_9fa48("36953") ? options.preferOwnerRpcRead === true && requireOwnerRpcRead : stryMutAct_9fa48("36952") ? false : stryMutAct_9fa48("36951") ? true : (stryCov_9fa48("36951", "36952", "36953"), (stryMutAct_9fa48("36955") ? options.preferOwnerRpcRead !== true : stryMutAct_9fa48("36954") ? false : (stryCov_9fa48("36954", "36955"), options.preferOwnerRpcRead === (stryMutAct_9fa48("36956") ? false : (stryCov_9fa48("36956"), true)))) || requireOwnerRpcRead);
      const allowOwnerRpcFallback = stryMutAct_9fa48("36959") ? options.allowOwnerRpcFallback === false : stryMutAct_9fa48("36958") ? false : stryMutAct_9fa48("36957") ? true : (stryCov_9fa48("36957", "36958", "36959"), options.allowOwnerRpcFallback !== (stryMutAct_9fa48("36960") ? true : (stryCov_9fa48("36960"), false)));
      const baseDiagnostics = this.buildSystemTableOperationDiagnostics(tableName, options);
      let localRead = stryMutAct_9fa48("36961") ? {} : (stryCov_9fa48("36961"), {
        available: stryMutAct_9fa48("36962") ? true : (stryCov_9fa48("36962"), false),
        rows: stryMutAct_9fa48("36963") ? ["Stryker was here"] : (stryCov_9fa48("36963"), [])
      });
      let localReplicaFallbackHit = stryMutAct_9fa48("36964") ? true : (stryCov_9fa48("36964"), false);
      const readLocalAuthoritativeRows = async () => {
        if (stryMutAct_9fa48("36965")) {
          {}
        } else {
          stryCov_9fa48("36965");
          localRead = await this.queryLocalAuthoritativeSystemTableRows(tableName, statement, params, stryMutAct_9fa48("36966") ? {} : (stryCov_9fa48("36966"), {
            consistency: preferredConsistency
          }));
          if (stryMutAct_9fa48("36969") ? !localRead.available && options.replicaFallbackConsistency || options.replicaFallbackConsistency !== preferredConsistency : stryMutAct_9fa48("36968") ? false : stryMutAct_9fa48("36967") ? true : (stryCov_9fa48("36967", "36968", "36969"), (stryMutAct_9fa48("36971") ? !localRead.available || options.replicaFallbackConsistency : stryMutAct_9fa48("36970") ? true : (stryCov_9fa48("36970", "36971"), (stryMutAct_9fa48("36972") ? localRead.available : (stryCov_9fa48("36972"), !localRead.available)) && options.replicaFallbackConsistency)) && (stryMutAct_9fa48("36974") ? options.replicaFallbackConsistency === preferredConsistency : stryMutAct_9fa48("36973") ? true : (stryCov_9fa48("36973", "36974"), options.replicaFallbackConsistency !== preferredConsistency)))) {
            if (stryMutAct_9fa48("36975")) {
              {}
            } else {
              stryCov_9fa48("36975");
              localRead = await this.queryLocalAuthoritativeSystemTableRows(tableName, statement, params, stryMutAct_9fa48("36976") ? {} : (stryCov_9fa48("36976"), {
                consistency: options.replicaFallbackConsistency
              }));
              localReplicaFallbackHit = localRead.available;
            }
          }
        }
      };
      const buildLocalReadResult = () => {
        if (stryMutAct_9fa48("36977")) {
          {}
        } else {
          stryCov_9fa48("36977");
          return stryMutAct_9fa48("36978") ? {} : (stryCov_9fa48("36978"), {
            success: stryMutAct_9fa48("36979") ? false : (stryCov_9fa48("36979"), true),
            rows: localRead.rows,
            count: localRead.rows.length,
            rowCount: localRead.rows.length,
            source: AUTHORITATIVE_READ_SOURCE.LOCAL_PARTITION_REPLICA,
            localReadHit: stryMutAct_9fa48("36980") ? false : (stryCov_9fa48("36980"), true),
            localReplicaFallbackHit,
            queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
            systemTableDiagnostics: stryMutAct_9fa48("36981") ? {} : (stryCov_9fa48("36981"), {
              ...baseDiagnostics,
              localReadHit: stryMutAct_9fa48("36982") ? false : (stryCov_9fa48("36982"), true),
              localReplicaFallbackHit,
              routedToNode: null,
              deniedByReadiness: stryMutAct_9fa48("36983") ? true : (stryCov_9fa48("36983"), false)
            })
          });
        }
      };
      await readLocalAuthoritativeRows();
      const shouldConfirmEmptyLocalReadWithOwnerRpc = stryMutAct_9fa48("36986") ? options.confirmEmptyLocalReadWithOwnerRpc === true && allowOwnerRpcFallback && localRead.available && localRead.rows.length === NUM.ZERO && !preferOwnerRpcRead || !requireOwnerRpcRead : stryMutAct_9fa48("36985") ? false : stryMutAct_9fa48("36984") ? true : (stryCov_9fa48("36984", "36985", "36986"), (stryMutAct_9fa48("36988") ? options.confirmEmptyLocalReadWithOwnerRpc === true && allowOwnerRpcFallback && localRead.available && localRead.rows.length === NUM.ZERO || !preferOwnerRpcRead : stryMutAct_9fa48("36987") ? true : (stryCov_9fa48("36987", "36988"), (stryMutAct_9fa48("36990") ? options.confirmEmptyLocalReadWithOwnerRpc === true && allowOwnerRpcFallback && localRead.available || localRead.rows.length === NUM.ZERO : stryMutAct_9fa48("36989") ? true : (stryCov_9fa48("36989", "36990"), (stryMutAct_9fa48("36992") ? options.confirmEmptyLocalReadWithOwnerRpc === true && allowOwnerRpcFallback || localRead.available : stryMutAct_9fa48("36991") ? true : (stryCov_9fa48("36991", "36992"), (stryMutAct_9fa48("36994") ? options.confirmEmptyLocalReadWithOwnerRpc === true || allowOwnerRpcFallback : stryMutAct_9fa48("36993") ? true : (stryCov_9fa48("36993", "36994"), (stryMutAct_9fa48("36996") ? options.confirmEmptyLocalReadWithOwnerRpc !== true : stryMutAct_9fa48("36995") ? true : (stryCov_9fa48("36995", "36996"), options.confirmEmptyLocalReadWithOwnerRpc === (stryMutAct_9fa48("36997") ? false : (stryCov_9fa48("36997"), true)))) && allowOwnerRpcFallback)) && localRead.available)) && (stryMutAct_9fa48("36999") ? localRead.rows.length !== NUM.ZERO : stryMutAct_9fa48("36998") ? true : (stryCov_9fa48("36998", "36999"), localRead.rows.length === NUM.ZERO)))) && (stryMutAct_9fa48("37000") ? preferOwnerRpcRead : (stryCov_9fa48("37000"), !preferOwnerRpcRead)))) && (stryMutAct_9fa48("37001") ? requireOwnerRpcRead : (stryCov_9fa48("37001"), !requireOwnerRpcRead)));
      if (stryMutAct_9fa48("37004") ? localRead.available && !preferOwnerRpcRead && !requireOwnerRpcRead || !shouldConfirmEmptyLocalReadWithOwnerRpc : stryMutAct_9fa48("37003") ? false : stryMutAct_9fa48("37002") ? true : (stryCov_9fa48("37002", "37003", "37004"), (stryMutAct_9fa48("37006") ? localRead.available && !preferOwnerRpcRead || !requireOwnerRpcRead : stryMutAct_9fa48("37005") ? true : (stryCov_9fa48("37005", "37006"), (stryMutAct_9fa48("37008") ? localRead.available || !preferOwnerRpcRead : stryMutAct_9fa48("37007") ? true : (stryCov_9fa48("37007", "37008"), localRead.available && (stryMutAct_9fa48("37009") ? preferOwnerRpcRead : (stryCov_9fa48("37009"), !preferOwnerRpcRead)))) && (stryMutAct_9fa48("37010") ? requireOwnerRpcRead : (stryCov_9fa48("37010"), !requireOwnerRpcRead)))) && (stryMutAct_9fa48("37011") ? shouldConfirmEmptyLocalReadWithOwnerRpc : (stryCov_9fa48("37011"), !shouldConfirmEmptyLocalReadWithOwnerRpc)))) {
        if (stryMutAct_9fa48("37012")) {
          {}
        } else {
          stryCov_9fa48("37012");
          return buildLocalReadResult();
        }
      }
      const localQueryTransportReadiness = this.getLocalQueryTransportReadiness();
      if (stryMutAct_9fa48("37015") ? localQueryTransportReadiness?.ready === false || !allowOwnerRpcFallback : stryMutAct_9fa48("37014") ? false : stryMutAct_9fa48("37013") ? true : (stryCov_9fa48("37013", "37014", "37015"), (stryMutAct_9fa48("37017") ? localQueryTransportReadiness?.ready !== false : stryMutAct_9fa48("37016") ? true : (stryCov_9fa48("37016", "37017"), (stryMutAct_9fa48("37018") ? localQueryTransportReadiness.ready : (stryCov_9fa48("37018"), localQueryTransportReadiness?.ready)) === (stryMutAct_9fa48("37019") ? true : (stryCov_9fa48("37019"), false)))) && (stryMutAct_9fa48("37020") ? allowOwnerRpcFallback : (stryCov_9fa48("37020"), !allowOwnerRpcFallback)))) {
        if (stryMutAct_9fa48("37021")) {
          {}
        } else {
          stryCov_9fa48("37021");
          return stryMutAct_9fa48("37022") ? {} : (stryCov_9fa48("37022"), {
            success: stryMutAct_9fa48("37023") ? true : (stryCov_9fa48("37023"), false),
            error: stryMutAct_9fa48("37026") ? localQueryTransportReadiness.reason && CDC_INTEGRATION_SERVICE_LITERAL.QUERY_DATA_PLANE_TRANSPORT_NOT_READY : stryMutAct_9fa48("37025") ? false : stryMutAct_9fa48("37024") ? true : (stryCov_9fa48("37024", "37025", "37026"), localQueryTransportReadiness.reason || CDC_INTEGRATION_SERVICE_LITERAL.QUERY_DATA_PLANE_TRANSPORT_NOT_READY),
            errorCode: QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
            deferRetry: stryMutAct_9fa48("37027") ? false : (stryCov_9fa48("37027"), true),
            retryAfterMs: localQueryTransportReadiness.retryAfterMs,
            localQueryTransport: stryMutAct_9fa48("37028") ? {} : (stryCov_9fa48("37028"), {
              state: stryMutAct_9fa48("37031") ? localQueryTransportReadiness.state && CDC_INTEGRATION_SERVICE_LITERAL.DEFERRED : stryMutAct_9fa48("37030") ? false : stryMutAct_9fa48("37029") ? true : (stryCov_9fa48("37029", "37030", "37031"), localQueryTransportReadiness.state || CDC_INTEGRATION_SERVICE_LITERAL.DEFERRED),
              ready: stryMutAct_9fa48("37032") ? true : (stryCov_9fa48("37032"), false),
              reason: stryMutAct_9fa48("37035") ? localQueryTransportReadiness.reason && null : stryMutAct_9fa48("37034") ? false : stryMutAct_9fa48("37033") ? true : (stryCov_9fa48("37033", "37034", "37035"), localQueryTransportReadiness.reason || null),
              retryAfterMs: localQueryTransportReadiness.retryAfterMs
            }),
            rows: stryMutAct_9fa48("37036") ? ["Stryker was here"] : (stryCov_9fa48("37036"), []),
            source: AUTHORITATIVE_READ_SOURCE.QUERY_TRANSPORT_PREFLIGHT,
            localReadHit: stryMutAct_9fa48("37037") ? true : (stryCov_9fa48("37037"), false),
            localReplicaFallbackHit: stryMutAct_9fa48("37038") ? true : (stryCov_9fa48("37038"), false),
            queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
            systemTableDiagnostics: stryMutAct_9fa48("37039") ? {} : (stryCov_9fa48("37039"), {
              ...baseDiagnostics,
              localReadHit: stryMutAct_9fa48("37040") ? true : (stryCov_9fa48("37040"), false),
              localReplicaFallbackHit: stryMutAct_9fa48("37041") ? true : (stryCov_9fa48("37041"), false),
              routedToNode: null,
              deniedByReadiness: stryMutAct_9fa48("37042") ? false : (stryCov_9fa48("37042"), true)
            })
          });
        }
      }
      if (stryMutAct_9fa48("37045") ? localQueryTransportReadiness?.ready === false && preferOwnerRpcRead && localRead.available || !requireOwnerRpcRead : stryMutAct_9fa48("37044") ? false : stryMutAct_9fa48("37043") ? true : (stryCov_9fa48("37043", "37044", "37045"), (stryMutAct_9fa48("37047") ? localQueryTransportReadiness?.ready === false && preferOwnerRpcRead || localRead.available : stryMutAct_9fa48("37046") ? true : (stryCov_9fa48("37046", "37047"), (stryMutAct_9fa48("37049") ? localQueryTransportReadiness?.ready === false || preferOwnerRpcRead : stryMutAct_9fa48("37048") ? true : (stryCov_9fa48("37048", "37049"), (stryMutAct_9fa48("37051") ? localQueryTransportReadiness?.ready !== false : stryMutAct_9fa48("37050") ? true : (stryCov_9fa48("37050", "37051"), (stryMutAct_9fa48("37052") ? localQueryTransportReadiness.ready : (stryCov_9fa48("37052"), localQueryTransportReadiness?.ready)) === (stryMutAct_9fa48("37053") ? true : (stryCov_9fa48("37053"), false)))) && preferOwnerRpcRead)) && localRead.available)) && (stryMutAct_9fa48("37054") ? requireOwnerRpcRead : (stryCov_9fa48("37054"), !requireOwnerRpcRead)))) {
        if (stryMutAct_9fa48("37055")) {
          {}
        } else {
          stryCov_9fa48("37055");
          return buildLocalReadResult();
        }
      }
      if (stryMutAct_9fa48("37058") ? false : stryMutAct_9fa48("37057") ? true : stryMutAct_9fa48("37056") ? allowOwnerRpcFallback : (stryCov_9fa48("37056", "37057", "37058"), !allowOwnerRpcFallback)) {
        if (stryMutAct_9fa48("37059")) {
          {}
        } else {
          stryCov_9fa48("37059");
          if (stryMutAct_9fa48("37062") ? preferOwnerRpcRead && localRead.available || !requireOwnerRpcRead : stryMutAct_9fa48("37061") ? false : stryMutAct_9fa48("37060") ? true : (stryCov_9fa48("37060", "37061", "37062"), (stryMutAct_9fa48("37064") ? preferOwnerRpcRead || localRead.available : stryMutAct_9fa48("37063") ? true : (stryCov_9fa48("37063", "37064"), preferOwnerRpcRead && localRead.available)) && (stryMutAct_9fa48("37065") ? requireOwnerRpcRead : (stryCov_9fa48("37065"), !requireOwnerRpcRead)))) {
            if (stryMutAct_9fa48("37066")) {
              {}
            } else {
              stryCov_9fa48("37066");
              return buildLocalReadResult();
            }
          }
          return stryMutAct_9fa48("37067") ? {} : (stryCov_9fa48("37067"), {
            success: stryMutAct_9fa48("37068") ? true : (stryCov_9fa48("37068"), false),
            error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
            rows: stryMutAct_9fa48("37069") ? ["Stryker was here"] : (stryCov_9fa48("37069"), []),
            localReadHit: stryMutAct_9fa48("37070") ? true : (stryCov_9fa48("37070"), false),
            localReplicaFallbackHit: stryMutAct_9fa48("37071") ? true : (stryCov_9fa48("37071"), false),
            queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
            systemTableDiagnostics: stryMutAct_9fa48("37072") ? {} : (stryCov_9fa48("37072"), {
              ...baseDiagnostics,
              localReadHit: stryMutAct_9fa48("37073") ? true : (stryCov_9fa48("37073"), false),
              localReplicaFallbackHit: stryMutAct_9fa48("37074") ? true : (stryCov_9fa48("37074"), false),
              routedToNode: null
            })
          });
        }
      }
      const ownerRpcResult = await this.executeAuthoritativeOwnerRpcRead(tableName, statement, params, options, baseDiagnostics, localQueryTransportReadiness);
      if (stryMutAct_9fa48("37077") ? ownerRpcResult === null : stryMutAct_9fa48("37076") ? false : stryMutAct_9fa48("37075") ? true : (stryCov_9fa48("37075", "37076", "37077"), ownerRpcResult !== null)) {
        if (stryMutAct_9fa48("37078")) {
          {}
        } else {
          stryCov_9fa48("37078");
          if (stryMutAct_9fa48("37081") ? ownerRpcResult.success !== true && preferOwnerRpcRead && localRead.available || !requireOwnerRpcRead : stryMutAct_9fa48("37080") ? false : stryMutAct_9fa48("37079") ? true : (stryCov_9fa48("37079", "37080", "37081"), (stryMutAct_9fa48("37083") ? ownerRpcResult.success !== true && preferOwnerRpcRead || localRead.available : stryMutAct_9fa48("37082") ? true : (stryCov_9fa48("37082", "37083"), (stryMutAct_9fa48("37085") ? ownerRpcResult.success !== true || preferOwnerRpcRead : stryMutAct_9fa48("37084") ? true : (stryCov_9fa48("37084", "37085"), (stryMutAct_9fa48("37087") ? ownerRpcResult.success === true : stryMutAct_9fa48("37086") ? true : (stryCov_9fa48("37086", "37087"), ownerRpcResult.success !== (stryMutAct_9fa48("37088") ? false : (stryCov_9fa48("37088"), true)))) && preferOwnerRpcRead)) && localRead.available)) && (stryMutAct_9fa48("37089") ? requireOwnerRpcRead : (stryCov_9fa48("37089"), !requireOwnerRpcRead)))) {
            if (stryMutAct_9fa48("37090")) {
              {}
            } else {
              stryCov_9fa48("37090");
              return buildLocalReadResult();
            }
          }
          return ownerRpcResult;
        }
      }
      if (stryMutAct_9fa48("37093") ? preferOwnerRpcRead && localRead.available || !requireOwnerRpcRead : stryMutAct_9fa48("37092") ? false : stryMutAct_9fa48("37091") ? true : (stryCov_9fa48("37091", "37092", "37093"), (stryMutAct_9fa48("37095") ? preferOwnerRpcRead || localRead.available : stryMutAct_9fa48("37094") ? true : (stryCov_9fa48("37094", "37095"), preferOwnerRpcRead && localRead.available)) && (stryMutAct_9fa48("37096") ? requireOwnerRpcRead : (stryCov_9fa48("37096"), !requireOwnerRpcRead)))) {
        if (stryMutAct_9fa48("37097")) {
          {}
        } else {
          stryCov_9fa48("37097");
          return buildLocalReadResult();
        }
      }
      return stryMutAct_9fa48("37098") ? {} : (stryCov_9fa48("37098"), {
        success: stryMutAct_9fa48("37099") ? true : (stryCov_9fa48("37099"), false),
        error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
        rows: stryMutAct_9fa48("37100") ? ["Stryker was here"] : (stryCov_9fa48("37100"), []),
        localReadHit: stryMutAct_9fa48("37101") ? true : (stryCov_9fa48("37101"), false),
        localReplicaFallbackHit: stryMutAct_9fa48("37102") ? true : (stryCov_9fa48("37102"), false),
        queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
        systemTableDiagnostics: stryMutAct_9fa48("37103") ? {} : (stryCov_9fa48("37103"), {
          ...baseDiagnostics,
          localReadHit: stryMutAct_9fa48("37104") ? true : (stryCov_9fa48("37104"), false),
          localReplicaFallbackHit: stryMutAct_9fa48("37105") ? true : (stryCov_9fa48("37105"), false),
          routedToNode: null
        })
      });
    }
  }

  /**
   * Execute the recovery read over the owner-partition RPC lane instead of
   * the generic SQL query engine route.
   * @param {string} tableName
   * @param {string} statement
   * @param {Array<*>} params
   * @param {Object} options
   * @param {Object} baseDiagnostics
   * @param {Object|null} localQueryTransportReadiness
   * @return {Promise<Object|null>}
   * @private
   */
  async executeAuthoritativeOwnerRpcRead(tableName, statement, params, options, baseDiagnostics, localQueryTransportReadiness = null) {
    if (stryMutAct_9fa48("37106")) {
      {}
    } else {
      stryCov_9fa48("37106");
      const queryExecutor = stryMutAct_9fa48("37109") ? this.sqlQueryEngine?.queryExecutor && null : stryMutAct_9fa48("37108") ? false : stryMutAct_9fa48("37107") ? true : (stryCov_9fa48("37107", "37108", "37109"), (stryMutAct_9fa48("37110") ? this.sqlQueryEngine.queryExecutor : (stryCov_9fa48("37110"), this.sqlQueryEngine?.queryExecutor)) || null);
      if (stryMutAct_9fa48("37113") ? !queryExecutor && typeof queryExecutor.executeOnPartition !== TYPEOF.FUNCTION : stryMutAct_9fa48("37112") ? false : stryMutAct_9fa48("37111") ? true : (stryCov_9fa48("37111", "37112", "37113"), (stryMutAct_9fa48("37114") ? queryExecutor : (stryCov_9fa48("37114"), !queryExecutor)) || (stryMutAct_9fa48("37116") ? typeof queryExecutor.executeOnPartition === TYPEOF.FUNCTION : stryMutAct_9fa48("37115") ? false : (stryCov_9fa48("37115", "37116"), typeof queryExecutor.executeOnPartition !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("37117")) {
          {}
        } else {
          stryCov_9fa48("37117");
          return null;
        }
      }
      const partitionId = stryMutAct_9fa48("37120") ? INITIAL_PARTITION_IDS[tableName] && null : stryMutAct_9fa48("37119") ? false : stryMutAct_9fa48("37118") ? true : (stryCov_9fa48("37118", "37119", "37120"), INITIAL_PARTITION_IDS[tableName] || null);
      if (stryMutAct_9fa48("37123") ? false : stryMutAct_9fa48("37122") ? true : stryMutAct_9fa48("37121") ? partitionId : (stryCov_9fa48("37121", "37122", "37123"), !partitionId)) {
        if (stryMutAct_9fa48("37124")) {
          {}
        } else {
          stryCov_9fa48("37124");
          return null;
        }
      }
      const routingReadinessDimension = stryMutAct_9fa48("37127") ? options?.queryOptions?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("37126") ? false : stryMutAct_9fa48("37125") ? true : (stryCov_9fa48("37125", "37126", "37127"), (stryMutAct_9fa48("37129") ? options.queryOptions?.routingReadinessDimension : stryMutAct_9fa48("37128") ? options?.queryOptions.routingReadinessDimension : (stryCov_9fa48("37128", "37129"), options?.queryOptions?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE);
      const executionOptions = stryMutAct_9fa48("37130") ? {} : (stryCov_9fa48("37130"), {
        ...((stryMutAct_9fa48("37133") ? options.queryOptions || typeof options.queryOptions === TYPEOF.OBJECT : stryMutAct_9fa48("37132") ? false : stryMutAct_9fa48("37131") ? true : (stryCov_9fa48("37131", "37132", "37133"), options.queryOptions && (stryMutAct_9fa48("37135") ? typeof options.queryOptions !== TYPEOF.OBJECT : stryMutAct_9fa48("37134") ? true : (stryCov_9fa48("37134", "37135"), typeof options.queryOptions === TYPEOF.OBJECT)))) ? options.queryOptions : {}),
        routingReadinessDimension,
        allowReadinessAuthoritativeRefresh: stryMutAct_9fa48("37136") ? true : (stryCov_9fa48("37136"), false)
      });
      const queryResult = await queryExecutor.executeOnPartition(partitionId, statement, params, stryMutAct_9fa48("37137") ? false : (stryCov_9fa48("37137"), true), stryMutAct_9fa48("37138") ? false : (stryCov_9fa48("37138"), true), stryMutAct_9fa48("37139") ? true : (stryCov_9fa48("37139"), false), executionOptions);
      if (stryMutAct_9fa48("37142") ? false : stryMutAct_9fa48("37141") ? true : stryMutAct_9fa48("37140") ? queryResult?.success : (stryCov_9fa48("37140", "37141", "37142"), !(stryMutAct_9fa48("37143") ? queryResult.success : (stryCov_9fa48("37143"), queryResult?.success)))) {
        if (stryMutAct_9fa48("37144")) {
          {}
        } else {
          stryCov_9fa48("37144");
          const reseedResult = this.maybeReseedBootstrapOverlay(tableName, queryResult);
          if (stryMutAct_9fa48("37146") ? false : stryMutAct_9fa48("37145") ? true : (stryCov_9fa48("37145", "37146"), reseedResult.reseeded)) {
            if (stryMutAct_9fa48("37147")) {
              {}
            } else {
              stryCov_9fa48("37147");
              const retryResult = await queryExecutor.executeOnPartition(partitionId, statement, params, stryMutAct_9fa48("37148") ? false : (stryCov_9fa48("37148"), true), stryMutAct_9fa48("37149") ? false : (stryCov_9fa48("37149"), true), stryMutAct_9fa48("37150") ? true : (stryCov_9fa48("37150"), false), executionOptions);
              this.logger.info(CDC_LOG_MSG.OVERLAY_RESEED_RETRY_RESULT, stryMutAct_9fa48("37151") ? {} : (stryCov_9fa48("37151"), {
                nodeId: this.nodeId,
                tableName,
                retrySuccess: stryMutAct_9fa48("37152") ? retryResult?.success && false : (stryCov_9fa48("37152"), (stryMutAct_9fa48("37153") ? retryResult.success : (stryCov_9fa48("37153"), retryResult?.success)) ?? (stryMutAct_9fa48("37154") ? true : (stryCov_9fa48("37154"), false)))
              }));
              if (stryMutAct_9fa48("37157") ? retryResult.success : stryMutAct_9fa48("37156") ? false : stryMutAct_9fa48("37155") ? true : (stryCov_9fa48("37155", "37156", "37157"), retryResult?.success)) {
                if (stryMutAct_9fa48("37158")) {
                  {}
                } else {
                  stryCov_9fa48("37158");
                  return stryMutAct_9fa48("37159") ? {} : (stryCov_9fa48("37159"), {
                    ...retryResult,
                    rows: Array.isArray(retryResult.rows) ? retryResult.rows : stryMutAct_9fa48("37160") ? ["Stryker was here"] : (stryCov_9fa48("37160"), []),
                    rowCount: Array.isArray(retryResult.rows) ? retryResult.rows.length : NUM.ZERO,
                    source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
                    localReadHit: stryMutAct_9fa48("37161") ? true : (stryCov_9fa48("37161"), false),
                    localReplicaFallbackHit: stryMutAct_9fa48("37162") ? true : (stryCov_9fa48("37162"), false),
                    queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
                    localQueryTransport: (stryMutAct_9fa48("37165") ? localQueryTransportReadiness || typeof localQueryTransportReadiness === TYPEOF.OBJECT : stryMutAct_9fa48("37164") ? false : stryMutAct_9fa48("37163") ? true : (stryCov_9fa48("37163", "37164", "37165"), localQueryTransportReadiness && (stryMutAct_9fa48("37167") ? typeof localQueryTransportReadiness !== TYPEOF.OBJECT : stryMutAct_9fa48("37166") ? true : (stryCov_9fa48("37166", "37167"), typeof localQueryTransportReadiness === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("37168") ? {} : (stryCov_9fa48("37168"), {
                      state: stryMutAct_9fa48("37171") ? localQueryTransportReadiness.state && null : stryMutAct_9fa48("37170") ? false : stryMutAct_9fa48("37169") ? true : (stryCov_9fa48("37169", "37170", "37171"), localQueryTransportReadiness.state || null),
                      ready: stryMutAct_9fa48("37174") ? localQueryTransportReadiness.ready !== true : stryMutAct_9fa48("37173") ? false : stryMutAct_9fa48("37172") ? true : (stryCov_9fa48("37172", "37173", "37174"), localQueryTransportReadiness.ready === (stryMutAct_9fa48("37175") ? false : (stryCov_9fa48("37175"), true))),
                      reason: stryMutAct_9fa48("37178") ? localQueryTransportReadiness.reason && null : stryMutAct_9fa48("37177") ? false : stryMutAct_9fa48("37176") ? true : (stryCov_9fa48("37176", "37177", "37178"), localQueryTransportReadiness.reason || null),
                      retryAfterMs: stryMutAct_9fa48("37181") ? localQueryTransportReadiness.retryAfterMs && NUM.ZERO : stryMutAct_9fa48("37180") ? false : stryMutAct_9fa48("37179") ? true : (stryCov_9fa48("37179", "37180", "37181"), localQueryTransportReadiness.retryAfterMs || NUM.ZERO)
                    }) : null,
                    systemTableDiagnostics: stryMutAct_9fa48("37182") ? {} : (stryCov_9fa48("37182"), {
                      ...baseDiagnostics,
                      localReadHit: stryMutAct_9fa48("37183") ? true : (stryCov_9fa48("37183"), false),
                      localReplicaFallbackHit: stryMutAct_9fa48("37184") ? true : (stryCov_9fa48("37184"), false),
                      routedToNode: stryMutAct_9fa48("37187") ? (retryResult?.participantNodeId || baseDiagnostics.leaderNodeId) && null : stryMutAct_9fa48("37186") ? false : stryMutAct_9fa48("37185") ? true : (stryCov_9fa48("37185", "37186", "37187"), (stryMutAct_9fa48("37189") ? retryResult?.participantNodeId && baseDiagnostics.leaderNodeId : stryMutAct_9fa48("37188") ? false : (stryCov_9fa48("37188", "37189"), (stryMutAct_9fa48("37190") ? retryResult.participantNodeId : (stryCov_9fa48("37190"), retryResult?.participantNodeId)) || baseDiagnostics.leaderNodeId)) || null),
                      deniedByReadiness: stryMutAct_9fa48("37193") ? baseDiagnostics.deniedByReadiness !== true : stryMutAct_9fa48("37192") ? false : stryMutAct_9fa48("37191") ? true : (stryCov_9fa48("37191", "37192", "37193"), baseDiagnostics.deniedByReadiness === (stryMutAct_9fa48("37194") ? false : (stryCov_9fa48("37194"), true)))
                    })
                  });
                }
              }
              return stryMutAct_9fa48("37195") ? {} : (stryCov_9fa48("37195"), {
                ...(stryMutAct_9fa48("37198") ? (retryResult || queryResult) && {
                  success: false,
                  error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED,
                  rows: []
                } : stryMutAct_9fa48("37197") ? false : stryMutAct_9fa48("37196") ? true : (stryCov_9fa48("37196", "37197", "37198"), (stryMutAct_9fa48("37200") ? retryResult && queryResult : stryMutAct_9fa48("37199") ? false : (stryCov_9fa48("37199", "37200"), retryResult || queryResult)) || (stryMutAct_9fa48("37201") ? {} : (stryCov_9fa48("37201"), {
                  success: stryMutAct_9fa48("37202") ? true : (stryCov_9fa48("37202"), false),
                  error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED,
                  rows: stryMutAct_9fa48("37203") ? ["Stryker was here"] : (stryCov_9fa48("37203"), [])
                })))),
                rows: Array.isArray(stryMutAct_9fa48("37204") ? retryResult.rows : (stryCov_9fa48("37204"), retryResult?.rows)) ? retryResult.rows : stryMutAct_9fa48("37205") ? ["Stryker was here"] : (stryCov_9fa48("37205"), []),
                source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
                localReadHit: stryMutAct_9fa48("37206") ? true : (stryCov_9fa48("37206"), false),
                localReplicaFallbackHit: stryMutAct_9fa48("37207") ? true : (stryCov_9fa48("37207"), false),
                queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
                localQueryTransport: (stryMutAct_9fa48("37210") ? localQueryTransportReadiness || typeof localQueryTransportReadiness === TYPEOF.OBJECT : stryMutAct_9fa48("37209") ? false : stryMutAct_9fa48("37208") ? true : (stryCov_9fa48("37208", "37209", "37210"), localQueryTransportReadiness && (stryMutAct_9fa48("37212") ? typeof localQueryTransportReadiness !== TYPEOF.OBJECT : stryMutAct_9fa48("37211") ? true : (stryCov_9fa48("37211", "37212"), typeof localQueryTransportReadiness === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("37213") ? {} : (stryCov_9fa48("37213"), {
                  state: stryMutAct_9fa48("37216") ? localQueryTransportReadiness.state && null : stryMutAct_9fa48("37215") ? false : stryMutAct_9fa48("37214") ? true : (stryCov_9fa48("37214", "37215", "37216"), localQueryTransportReadiness.state || null),
                  ready: stryMutAct_9fa48("37219") ? localQueryTransportReadiness.ready !== true : stryMutAct_9fa48("37218") ? false : stryMutAct_9fa48("37217") ? true : (stryCov_9fa48("37217", "37218", "37219"), localQueryTransportReadiness.ready === (stryMutAct_9fa48("37220") ? false : (stryCov_9fa48("37220"), true))),
                  reason: stryMutAct_9fa48("37223") ? localQueryTransportReadiness.reason && null : stryMutAct_9fa48("37222") ? false : stryMutAct_9fa48("37221") ? true : (stryCov_9fa48("37221", "37222", "37223"), localQueryTransportReadiness.reason || null),
                  retryAfterMs: stryMutAct_9fa48("37226") ? localQueryTransportReadiness.retryAfterMs && NUM.ZERO : stryMutAct_9fa48("37225") ? false : stryMutAct_9fa48("37224") ? true : (stryCov_9fa48("37224", "37225", "37226"), localQueryTransportReadiness.retryAfterMs || NUM.ZERO)
                }) : null,
                systemTableDiagnostics: stryMutAct_9fa48("37227") ? {} : (stryCov_9fa48("37227"), {
                  ...baseDiagnostics,
                  localReadHit: stryMutAct_9fa48("37228") ? true : (stryCov_9fa48("37228"), false),
                  localReplicaFallbackHit: stryMutAct_9fa48("37229") ? true : (stryCov_9fa48("37229"), false),
                  routedToNode: stryMutAct_9fa48("37232") ? (retryResult?.participantNodeId || baseDiagnostics.leaderNodeId) && null : stryMutAct_9fa48("37231") ? false : stryMutAct_9fa48("37230") ? true : (stryCov_9fa48("37230", "37231", "37232"), (stryMutAct_9fa48("37234") ? retryResult?.participantNodeId && baseDiagnostics.leaderNodeId : stryMutAct_9fa48("37233") ? false : (stryCov_9fa48("37233", "37234"), (stryMutAct_9fa48("37235") ? retryResult.participantNodeId : (stryCov_9fa48("37235"), retryResult?.participantNodeId)) || baseDiagnostics.leaderNodeId)) || null),
                  deniedByReadiness: stryMutAct_9fa48("37238") ? baseDiagnostics.deniedByReadiness === true && retryResult?.errorCode === QUERY_TRANSPORT_NOT_READY_ERROR_CODE : stryMutAct_9fa48("37237") ? false : stryMutAct_9fa48("37236") ? true : (stryCov_9fa48("37236", "37237", "37238"), (stryMutAct_9fa48("37240") ? baseDiagnostics.deniedByReadiness !== true : stryMutAct_9fa48("37239") ? false : (stryCov_9fa48("37239", "37240"), baseDiagnostics.deniedByReadiness === (stryMutAct_9fa48("37241") ? false : (stryCov_9fa48("37241"), true)))) || (stryMutAct_9fa48("37243") ? retryResult?.errorCode !== QUERY_TRANSPORT_NOT_READY_ERROR_CODE : stryMutAct_9fa48("37242") ? false : (stryCov_9fa48("37242", "37243"), (stryMutAct_9fa48("37244") ? retryResult.errorCode : (stryCov_9fa48("37244"), retryResult?.errorCode)) === QUERY_TRANSPORT_NOT_READY_ERROR_CODE)))
                })
              });
            }
          }
        }
      }
      if (stryMutAct_9fa48("37247") ? false : stryMutAct_9fa48("37246") ? true : stryMutAct_9fa48("37245") ? queryResult?.success : (stryCov_9fa48("37245", "37246", "37247"), !(stryMutAct_9fa48("37248") ? queryResult.success : (stryCov_9fa48("37248"), queryResult?.success)))) {
        if (stryMutAct_9fa48("37249")) {
          {}
        } else {
          stryCov_9fa48("37249");
          return stryMutAct_9fa48("37250") ? {} : (stryCov_9fa48("37250"), {
            ...(stryMutAct_9fa48("37253") ? queryResult && {
              success: false,
              error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED,
              rows: []
            } : stryMutAct_9fa48("37252") ? false : stryMutAct_9fa48("37251") ? true : (stryCov_9fa48("37251", "37252", "37253"), queryResult || (stryMutAct_9fa48("37254") ? {} : (stryCov_9fa48("37254"), {
              success: stryMutAct_9fa48("37255") ? true : (stryCov_9fa48("37255"), false),
              error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED,
              rows: stryMutAct_9fa48("37256") ? ["Stryker was here"] : (stryCov_9fa48("37256"), [])
            })))),
            rows: Array.isArray(stryMutAct_9fa48("37257") ? queryResult.rows : (stryCov_9fa48("37257"), queryResult?.rows)) ? queryResult.rows : stryMutAct_9fa48("37258") ? ["Stryker was here"] : (stryCov_9fa48("37258"), []),
            source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
            localReadHit: stryMutAct_9fa48("37259") ? true : (stryCov_9fa48("37259"), false),
            localReplicaFallbackHit: stryMutAct_9fa48("37260") ? true : (stryCov_9fa48("37260"), false),
            queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
            localQueryTransport: (stryMutAct_9fa48("37263") ? localQueryTransportReadiness || typeof localQueryTransportReadiness === TYPEOF.OBJECT : stryMutAct_9fa48("37262") ? false : stryMutAct_9fa48("37261") ? true : (stryCov_9fa48("37261", "37262", "37263"), localQueryTransportReadiness && (stryMutAct_9fa48("37265") ? typeof localQueryTransportReadiness !== TYPEOF.OBJECT : stryMutAct_9fa48("37264") ? true : (stryCov_9fa48("37264", "37265"), typeof localQueryTransportReadiness === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("37266") ? {} : (stryCov_9fa48("37266"), {
              state: stryMutAct_9fa48("37269") ? localQueryTransportReadiness.state && null : stryMutAct_9fa48("37268") ? false : stryMutAct_9fa48("37267") ? true : (stryCov_9fa48("37267", "37268", "37269"), localQueryTransportReadiness.state || null),
              ready: stryMutAct_9fa48("37272") ? localQueryTransportReadiness.ready !== true : stryMutAct_9fa48("37271") ? false : stryMutAct_9fa48("37270") ? true : (stryCov_9fa48("37270", "37271", "37272"), localQueryTransportReadiness.ready === (stryMutAct_9fa48("37273") ? false : (stryCov_9fa48("37273"), true))),
              reason: stryMutAct_9fa48("37276") ? localQueryTransportReadiness.reason && null : stryMutAct_9fa48("37275") ? false : stryMutAct_9fa48("37274") ? true : (stryCov_9fa48("37274", "37275", "37276"), localQueryTransportReadiness.reason || null),
              retryAfterMs: stryMutAct_9fa48("37279") ? localQueryTransportReadiness.retryAfterMs && NUM.ZERO : stryMutAct_9fa48("37278") ? false : stryMutAct_9fa48("37277") ? true : (stryCov_9fa48("37277", "37278", "37279"), localQueryTransportReadiness.retryAfterMs || NUM.ZERO)
            }) : null,
            systemTableDiagnostics: stryMutAct_9fa48("37280") ? {} : (stryCov_9fa48("37280"), {
              ...baseDiagnostics,
              localReadHit: stryMutAct_9fa48("37281") ? true : (stryCov_9fa48("37281"), false),
              localReplicaFallbackHit: stryMutAct_9fa48("37282") ? true : (stryCov_9fa48("37282"), false),
              routedToNode: stryMutAct_9fa48("37285") ? (queryResult?.participantNodeId || baseDiagnostics.leaderNodeId) && null : stryMutAct_9fa48("37284") ? false : stryMutAct_9fa48("37283") ? true : (stryCov_9fa48("37283", "37284", "37285"), (stryMutAct_9fa48("37287") ? queryResult?.participantNodeId && baseDiagnostics.leaderNodeId : stryMutAct_9fa48("37286") ? false : (stryCov_9fa48("37286", "37287"), (stryMutAct_9fa48("37288") ? queryResult.participantNodeId : (stryCov_9fa48("37288"), queryResult?.participantNodeId)) || baseDiagnostics.leaderNodeId)) || null),
              deniedByReadiness: stryMutAct_9fa48("37291") ? baseDiagnostics.deniedByReadiness === true && queryResult?.errorCode === QUERY_TRANSPORT_NOT_READY_ERROR_CODE : stryMutAct_9fa48("37290") ? false : stryMutAct_9fa48("37289") ? true : (stryCov_9fa48("37289", "37290", "37291"), (stryMutAct_9fa48("37293") ? baseDiagnostics.deniedByReadiness !== true : stryMutAct_9fa48("37292") ? false : (stryCov_9fa48("37292", "37293"), baseDiagnostics.deniedByReadiness === (stryMutAct_9fa48("37294") ? false : (stryCov_9fa48("37294"), true)))) || (stryMutAct_9fa48("37296") ? queryResult?.errorCode !== QUERY_TRANSPORT_NOT_READY_ERROR_CODE : stryMutAct_9fa48("37295") ? false : (stryCov_9fa48("37295", "37296"), (stryMutAct_9fa48("37297") ? queryResult.errorCode : (stryCov_9fa48("37297"), queryResult?.errorCode)) === QUERY_TRANSPORT_NOT_READY_ERROR_CODE)))
            })
          });
        }
      }
      return stryMutAct_9fa48("37298") ? {} : (stryCov_9fa48("37298"), {
        ...queryResult,
        rows: Array.isArray(queryResult.rows) ? queryResult.rows : stryMutAct_9fa48("37299") ? ["Stryker was here"] : (stryCov_9fa48("37299"), []),
        rowCount: Array.isArray(queryResult.rows) ? queryResult.rows.length : NUM.ZERO,
        source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
        localReadHit: stryMutAct_9fa48("37300") ? true : (stryCov_9fa48("37300"), false),
        localReplicaFallbackHit: stryMutAct_9fa48("37301") ? true : (stryCov_9fa48("37301"), false),
        queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
        localQueryTransport: (stryMutAct_9fa48("37304") ? localQueryTransportReadiness || typeof localQueryTransportReadiness === TYPEOF.OBJECT : stryMutAct_9fa48("37303") ? false : stryMutAct_9fa48("37302") ? true : (stryCov_9fa48("37302", "37303", "37304"), localQueryTransportReadiness && (stryMutAct_9fa48("37306") ? typeof localQueryTransportReadiness !== TYPEOF.OBJECT : stryMutAct_9fa48("37305") ? true : (stryCov_9fa48("37305", "37306"), typeof localQueryTransportReadiness === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("37307") ? {} : (stryCov_9fa48("37307"), {
          state: stryMutAct_9fa48("37310") ? localQueryTransportReadiness.state && null : stryMutAct_9fa48("37309") ? false : stryMutAct_9fa48("37308") ? true : (stryCov_9fa48("37308", "37309", "37310"), localQueryTransportReadiness.state || null),
          ready: stryMutAct_9fa48("37313") ? localQueryTransportReadiness.ready !== true : stryMutAct_9fa48("37312") ? false : stryMutAct_9fa48("37311") ? true : (stryCov_9fa48("37311", "37312", "37313"), localQueryTransportReadiness.ready === (stryMutAct_9fa48("37314") ? false : (stryCov_9fa48("37314"), true))),
          reason: stryMutAct_9fa48("37317") ? localQueryTransportReadiness.reason && null : stryMutAct_9fa48("37316") ? false : stryMutAct_9fa48("37315") ? true : (stryCov_9fa48("37315", "37316", "37317"), localQueryTransportReadiness.reason || null),
          retryAfterMs: stryMutAct_9fa48("37320") ? localQueryTransportReadiness.retryAfterMs && NUM.ZERO : stryMutAct_9fa48("37319") ? false : stryMutAct_9fa48("37318") ? true : (stryCov_9fa48("37318", "37319", "37320"), localQueryTransportReadiness.retryAfterMs || NUM.ZERO)
        }) : null,
        systemTableDiagnostics: stryMutAct_9fa48("37321") ? {} : (stryCov_9fa48("37321"), {
          ...baseDiagnostics,
          localReadHit: stryMutAct_9fa48("37322") ? true : (stryCov_9fa48("37322"), false),
          localReplicaFallbackHit: stryMutAct_9fa48("37323") ? true : (stryCov_9fa48("37323"), false),
          routedToNode: stryMutAct_9fa48("37326") ? (queryResult?.participantNodeId || baseDiagnostics.leaderNodeId) && null : stryMutAct_9fa48("37325") ? false : stryMutAct_9fa48("37324") ? true : (stryCov_9fa48("37324", "37325", "37326"), (stryMutAct_9fa48("37328") ? queryResult?.participantNodeId && baseDiagnostics.leaderNodeId : stryMutAct_9fa48("37327") ? false : (stryCov_9fa48("37327", "37328"), (stryMutAct_9fa48("37329") ? queryResult.participantNodeId : (stryCov_9fa48("37329"), queryResult?.participantNodeId)) || baseDiagnostics.leaderNodeId)) || null),
          deniedByReadiness: stryMutAct_9fa48("37332") ? baseDiagnostics.deniedByReadiness !== true : stryMutAct_9fa48("37331") ? false : stryMutAct_9fa48("37330") ? true : (stryCov_9fa48("37330", "37331", "37332"), baseDiagnostics.deniedByReadiness === (stryMutAct_9fa48("37333") ? false : (stryCov_9fa48("37333"), true)))
        })
      });
    }
  }

  /**
   * Resolve the canonical local query/data-plane transport readiness snapshot.
   * This reuses the message-router transport owner instead of duplicating
   * query-ingress selection logic in the authoritative read path.
   * @return {{ready:boolean,reason:string|null,retryAfterMs:number}|null}
   * @private
   */
  getLocalQueryTransportReadiness() {
    if (stryMutAct_9fa48("37334")) {
      {}
    } else {
      stryCov_9fa48("37334");
      if (stryMutAct_9fa48("37337") ? !this.messageRouter && typeof this.messageRouter.getQueryDataPlaneTransportReadiness !== TYPEOF.FUNCTION : stryMutAct_9fa48("37336") ? false : stryMutAct_9fa48("37335") ? true : (stryCov_9fa48("37335", "37336", "37337"), (stryMutAct_9fa48("37338") ? this.messageRouter : (stryCov_9fa48("37338"), !this.messageRouter)) || (stryMutAct_9fa48("37340") ? typeof this.messageRouter.getQueryDataPlaneTransportReadiness === TYPEOF.FUNCTION : stryMutAct_9fa48("37339") ? false : (stryCov_9fa48("37339", "37340"), typeof this.messageRouter.getQueryDataPlaneTransportReadiness !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("37341")) {
          {}
        } else {
          stryCov_9fa48("37341");
          return null;
        }
      }
      return normalizeLocalQueryTransportReadiness(this.messageRouter.getQueryDataPlaneTransportReadiness());
    }
  }

  /**
   * Re-seed the SQL query engine bootstrap routing overlay when a
   * query fails with TABLE_NOT_FOUND or PARTITION_NOT_FOUND. This
   * breaks the circular dependency after seed restart where empty
   * cache + deleted overlay prevents authoritative discovery repair.
   * Reuses the existing seedBootstrapRoutingOverlayFromSnapshots
   * mechanism on the SQL query engine.
   * @param {string} tableName
   * @param {Object|null} queryResult
   * @return {{reseeded: boolean}}
   * @private
   */
  maybeReseedBootstrapOverlay(tableName, queryResult) {
    if (stryMutAct_9fa48("37342")) {
      {}
    } else {
      stryCov_9fa48("37342");
      const errorCode = stryMutAct_9fa48("37345") ? queryResult?.errorCode && null : stryMutAct_9fa48("37344") ? false : stryMutAct_9fa48("37343") ? true : (stryCov_9fa48("37343", "37344", "37345"), (stryMutAct_9fa48("37346") ? queryResult.errorCode : (stryCov_9fa48("37346"), queryResult?.errorCode)) || null);
      if (stryMutAct_9fa48("37349") ? errorCode !== QUERY_ERROR_CODE.TABLE_NOT_FOUND || errorCode !== QUERY_ERROR_CODE.PARTITION_NOT_FOUND : stryMutAct_9fa48("37348") ? false : stryMutAct_9fa48("37347") ? true : (stryCov_9fa48("37347", "37348", "37349"), (stryMutAct_9fa48("37351") ? errorCode === QUERY_ERROR_CODE.TABLE_NOT_FOUND : stryMutAct_9fa48("37350") ? true : (stryCov_9fa48("37350", "37351"), errorCode !== QUERY_ERROR_CODE.TABLE_NOT_FOUND)) && (stryMutAct_9fa48("37353") ? errorCode === QUERY_ERROR_CODE.PARTITION_NOT_FOUND : stryMutAct_9fa48("37352") ? true : (stryCov_9fa48("37352", "37353"), errorCode !== QUERY_ERROR_CODE.PARTITION_NOT_FOUND)))) {
        if (stryMutAct_9fa48("37354")) {
          {}
        } else {
          stryCov_9fa48("37354");
          return stryMutAct_9fa48("37355") ? {} : (stryCov_9fa48("37355"), {
            reseeded: stryMutAct_9fa48("37356") ? true : (stryCov_9fa48("37356"), false)
          });
        }
      }
      if (stryMutAct_9fa48("37359") ? !this.sqlQueryEngine && typeof this.sqlQueryEngine.installRecoveryRoutingOverlayEntry !== TYPEOF.FUNCTION : stryMutAct_9fa48("37358") ? false : stryMutAct_9fa48("37357") ? true : (stryCov_9fa48("37357", "37358", "37359"), (stryMutAct_9fa48("37360") ? this.sqlQueryEngine : (stryCov_9fa48("37360"), !this.sqlQueryEngine)) || (stryMutAct_9fa48("37362") ? typeof this.sqlQueryEngine.installRecoveryRoutingOverlayEntry === TYPEOF.FUNCTION : stryMutAct_9fa48("37361") ? false : (stryCov_9fa48("37361", "37362"), typeof this.sqlQueryEngine.installRecoveryRoutingOverlayEntry !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("37363")) {
          {}
        } else {
          stryCov_9fa48("37363");
          return stryMutAct_9fa48("37364") ? {} : (stryCov_9fa48("37364"), {
            reseeded: stryMutAct_9fa48("37365") ? true : (stryCov_9fa48("37365"), false)
          });
        }
      }
      const partitionId = stryMutAct_9fa48("37368") ? INITIAL_PARTITION_IDS[tableName] && null : stryMutAct_9fa48("37367") ? false : stryMutAct_9fa48("37366") ? true : (stryCov_9fa48("37366", "37367", "37368"), INITIAL_PARTITION_IDS[tableName] || null);
      if (stryMutAct_9fa48("37371") ? false : stryMutAct_9fa48("37370") ? true : stryMutAct_9fa48("37369") ? partitionId : (stryCov_9fa48("37369", "37370", "37371"), !partitionId)) {
        if (stryMutAct_9fa48("37372")) {
          {}
        } else {
          stryCov_9fa48("37372");
          return stryMutAct_9fa48("37373") ? {} : (stryCov_9fa48("37373"), {
            reseeded: stryMutAct_9fa48("37374") ? true : (stryCov_9fa48("37374"), false)
          });
        }
      }
      const connectedNodes = this.messageRouter ? this.messageRouter.getConnectedNodes() : stryMutAct_9fa48("37375") ? ["Stryker was here"] : (stryCov_9fa48("37375"), []);
      if (stryMutAct_9fa48("37378") ? connectedNodes.length !== NUM.ZERO : stryMutAct_9fa48("37377") ? false : stryMutAct_9fa48("37376") ? true : (stryCov_9fa48("37376", "37377", "37378"), connectedNodes.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("37379")) {
          {}
        } else {
          stryCov_9fa48("37379");
          return stryMutAct_9fa48("37380") ? {} : (stryCov_9fa48("37380"), {
            reseeded: stryMutAct_9fa48("37381") ? true : (stryCov_9fa48("37381"), false)
          });
        }
      }
      this.logger.info(CDC_LOG_MSG.OVERLAY_RESEED_ON_TABLE_NOT_FOUND, stryMutAct_9fa48("37382") ? {} : (stryCov_9fa48("37382"), {
        nodeId: this.nodeId,
        tableName,
        partitionId,
        connectedNodeCount: connectedNodes.length,
        originalError: stryMutAct_9fa48("37385") ? queryResult?.error && null : stryMutAct_9fa48("37384") ? false : stryMutAct_9fa48("37383") ? true : (stryCov_9fa48("37383", "37384", "37385"), (stryMutAct_9fa48("37386") ? queryResult.error : (stryCov_9fa48("37386"), queryResult?.error)) || null)
      }));
      const serviceRows = connectedNodes.map(stryMutAct_9fa48("37387") ? () => undefined : (stryCov_9fa48("37387"), nodeId => stryMutAct_9fa48("37388") ? {} : (stryCov_9fa48("37388"), {
        partition_id: partitionId,
        service_type: SERVICE_TYPE.PARTITION,
        status: SERVICE_STATUS.ACTIVE,
        node_id: nodeId,
        address: (stryMutAct_9fa48("37389") ? `` : (stryCov_9fa48("37389"), `${nodeId}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("37390") ? `` : (stryCov_9fa48("37390"), `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("37391") ? `` : (stryCov_9fa48("37391"), `${partitionId}`))
      })));
      const installed = this.sqlQueryEngine.installRecoveryRoutingOverlayEntry(partitionId, tableName, serviceRows);
      return stryMutAct_9fa48("37392") ? {} : (stryCov_9fa48("37392"), {
        reseeded: installed
      });
    }
  }

  /**
   * Normalize one direct local system-table write result into the SQL-engine
   * result shape expected by CDC callers.
   * @param {Object} result
   * @return {Object}
   * @private
   */
  normalizeLocalSystemTableWriteResult(result) {
    if (stryMutAct_9fa48("37393")) {
      {}
    } else {
      stryCov_9fa48("37393");
      if (stryMutAct_9fa48("37396") ? !result && typeof result !== TYPEOF.OBJECT : stryMutAct_9fa48("37395") ? false : stryMutAct_9fa48("37394") ? true : (stryCov_9fa48("37394", "37395", "37396"), (stryMutAct_9fa48("37397") ? result : (stryCov_9fa48("37397"), !result)) || (stryMutAct_9fa48("37399") ? typeof result === TYPEOF.OBJECT : stryMutAct_9fa48("37398") ? false : (stryCov_9fa48("37398", "37399"), typeof result !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("37400")) {
          {}
        } else {
          stryCov_9fa48("37400");
          return result;
        }
      }
      if (stryMutAct_9fa48("37403") ? typeof result.affectedRows === TYPEOF.NUMBER && typeof result.changes !== TYPEOF.NUMBER : stryMutAct_9fa48("37402") ? false : stryMutAct_9fa48("37401") ? true : (stryCov_9fa48("37401", "37402", "37403"), (stryMutAct_9fa48("37405") ? typeof result.affectedRows !== TYPEOF.NUMBER : stryMutAct_9fa48("37404") ? false : (stryCov_9fa48("37404", "37405"), typeof result.affectedRows === TYPEOF.NUMBER)) || (stryMutAct_9fa48("37407") ? typeof result.changes === TYPEOF.NUMBER : stryMutAct_9fa48("37406") ? false : (stryCov_9fa48("37406", "37407"), typeof result.changes !== TYPEOF.NUMBER)))) {
        if (stryMutAct_9fa48("37408")) {
          {}
        } else {
          stryCov_9fa48("37408");
          return result;
        }
      }
      return stryMutAct_9fa48("37409") ? {} : (stryCov_9fa48("37409"), {
        ...result,
        affectedRows: result.changes
      });
    }
  }

  /**
   * Try to execute a steady-state system-table write through a local partition
   * service before falling back to the routed SQL path.
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Promise<{handled: boolean, result?: Object}>}
   * @private
   */
  async tryExecuteLocalSystemTableWrite(sql, params = stryMutAct_9fa48("37410") ? ["Stryker was here"] : (stryCov_9fa48("37410"), [])) {
    if (stryMutAct_9fa48("37411")) {
      {}
    } else {
      stryCov_9fa48("37411");
      if (stryMutAct_9fa48("37414") ? !sql && typeof sql !== TYPEOF.STRING : stryMutAct_9fa48("37413") ? false : stryMutAct_9fa48("37412") ? true : (stryCov_9fa48("37412", "37413", "37414"), (stryMutAct_9fa48("37415") ? sql : (stryCov_9fa48("37415"), !sql)) || (stryMutAct_9fa48("37417") ? typeof sql === TYPEOF.STRING : stryMutAct_9fa48("37416") ? false : (stryCov_9fa48("37416", "37417"), typeof sql !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("37418")) {
          {}
        } else {
          stryCov_9fa48("37418");
          return stryMutAct_9fa48("37419") ? {} : (stryCov_9fa48("37419"), {
            handled: stryMutAct_9fa48("37420") ? true : (stryCov_9fa48("37420"), false)
          });
        }
      }
      if (stryMutAct_9fa48("37425") ? sql.toUpperCase().startsWith(CDC_INTEGRATION_SERVICE_LITERAL.SELECT) : stryMutAct_9fa48("37424") ? sql.trim().toLowerCase().startsWith(CDC_INTEGRATION_SERVICE_LITERAL.SELECT) : stryMutAct_9fa48("37423") ? sql.trim().toUpperCase().endsWith(CDC_INTEGRATION_SERVICE_LITERAL.SELECT) : stryMutAct_9fa48("37422") ? false : stryMutAct_9fa48("37421") ? true : (stryCov_9fa48("37421", "37422", "37423", "37424", "37425"), sql.trim().toUpperCase().startsWith(CDC_INTEGRATION_SERVICE_LITERAL.SELECT))) {
        if (stryMutAct_9fa48("37426")) {
          {}
        } else {
          stryCov_9fa48("37426");
          return stryMutAct_9fa48("37427") ? {} : (stryCov_9fa48("37427"), {
            handled: stryMutAct_9fa48("37428") ? true : (stryCov_9fa48("37428"), false)
          });
        }
      }
      const tableNameResult = this.extractTableNameFromSQL(sql);
      const tableName = (stryMutAct_9fa48("37431") ? tableNameResult.state !== CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND : stryMutAct_9fa48("37430") ? false : stryMutAct_9fa48("37429") ? true : (stryCov_9fa48("37429", "37430", "37431"), tableNameResult.state === CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND)) ? tableNameResult.tableName : null;
      if (stryMutAct_9fa48("37434") ? !tableName && !VALID_SYSTEM_TABLES.includes(tableName) : stryMutAct_9fa48("37433") ? false : stryMutAct_9fa48("37432") ? true : (stryCov_9fa48("37432", "37433", "37434"), (stryMutAct_9fa48("37435") ? tableName : (stryCov_9fa48("37435"), !tableName)) || (stryMutAct_9fa48("37436") ? VALID_SYSTEM_TABLES.includes(tableName) : (stryCov_9fa48("37436"), !VALID_SYSTEM_TABLES.includes(tableName))))) {
        if (stryMutAct_9fa48("37437")) {
          {}
        } else {
          stryCov_9fa48("37437");
          return stryMutAct_9fa48("37438") ? {} : (stryCov_9fa48("37438"), {
            handled: stryMutAct_9fa48("37439") ? true : (stryCov_9fa48("37439"), false)
          });
        }
      }
      const localServices = this.resolveLocalSystemTableServices(tableName, stryMutAct_9fa48("37440") ? {} : (stryCov_9fa48("37440"), {
        consistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER
      }));
      if (stryMutAct_9fa48("37443") ? localServices.length !== NUM.ZERO : stryMutAct_9fa48("37442") ? false : stryMutAct_9fa48("37441") ? true : (stryCov_9fa48("37441", "37442", "37443"), localServices.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("37444")) {
          {}
        } else {
          stryCov_9fa48("37444");
          return stryMutAct_9fa48("37445") ? {} : (stryCov_9fa48("37445"), {
            handled: stryMutAct_9fa48("37446") ? true : (stryCov_9fa48("37446"), false)
          });
        }
      }
      for (const partitionService of localServices) {
        if (stryMutAct_9fa48("37447")) {
          {}
        } else {
          stryCov_9fa48("37447");
          if (stryMutAct_9fa48("37450") ? typeof partitionService?.executeQuery === TYPEOF.FUNCTION : stryMutAct_9fa48("37449") ? false : stryMutAct_9fa48("37448") ? true : (stryCov_9fa48("37448", "37449", "37450"), typeof (stryMutAct_9fa48("37451") ? partitionService.executeQuery : (stryCov_9fa48("37451"), partitionService?.executeQuery)) !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("37452")) {
              {}
            } else {
              stryCov_9fa48("37452");
              continue;
            }
          }
          try {
            if (stryMutAct_9fa48("37453")) {
              {}
            } else {
              stryCov_9fa48("37453");
              const localResult = await partitionService.executeQuery(sql, params);
              const result = this.normalizeLocalSystemTableWriteResult(localResult);
              if (stryMutAct_9fa48("37456") ? !result && result.success === false : stryMutAct_9fa48("37455") ? false : stryMutAct_9fa48("37454") ? true : (stryCov_9fa48("37454", "37455", "37456"), (stryMutAct_9fa48("37457") ? result : (stryCov_9fa48("37457"), !result)) || (stryMutAct_9fa48("37459") ? result.success !== false : stryMutAct_9fa48("37458") ? false : (stryCov_9fa48("37458", "37459"), result.success === (stryMutAct_9fa48("37460") ? true : (stryCov_9fa48("37460"), false)))))) {
                if (stryMutAct_9fa48("37461")) {
                  {}
                } else {
                  stryCov_9fa48("37461");
                  const message = stryMutAct_9fa48("37464") ? result?.error && '' : stryMutAct_9fa48("37463") ? false : stryMutAct_9fa48("37462") ? true : (stryCov_9fa48("37462", "37463", "37464"), (stryMutAct_9fa48("37465") ? result.error : (stryCov_9fa48("37465"), result?.error)) || (stryMutAct_9fa48("37466") ? "Stryker was here!" : (stryCov_9fa48("37466"), '')));
                  if (stryMutAct_9fa48("37468") ? false : stryMutAct_9fa48("37467") ? true : (stryCov_9fa48("37467", "37468"), this.isTransientCdcError(message))) {
                    if (stryMutAct_9fa48("37469")) {
                      {}
                    } else {
                      stryCov_9fa48("37469");
                      continue;
                    }
                  }
                }
              }
              return stryMutAct_9fa48("37470") ? {} : (stryCov_9fa48("37470"), {
                handled: stryMutAct_9fa48("37471") ? false : (stryCov_9fa48("37471"), true),
                result
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("37472")) {
              {}
            } else {
              stryCov_9fa48("37472");
              if (stryMutAct_9fa48("37474") ? false : stryMutAct_9fa48("37473") ? true : (stryCov_9fa48("37473", "37474"), this.isTransientCdcError(stryMutAct_9fa48("37477") ? error?.message && CDC_INTEGRATION_SERVICE_LITERAL.EMPTY : stryMutAct_9fa48("37476") ? false : stryMutAct_9fa48("37475") ? true : (stryCov_9fa48("37475", "37476", "37477"), (stryMutAct_9fa48("37478") ? error.message : (stryCov_9fa48("37478"), error?.message)) || CDC_INTEGRATION_SERVICE_LITERAL.EMPTY)))) {
                if (stryMutAct_9fa48("37479")) {
                  {}
                } else {
                  stryCov_9fa48("37479");
                  continue;
                }
              }
              throw error;
            }
          }
        }
      }
      return stryMutAct_9fa48("37480") ? {} : (stryCov_9fa48("37480"), {
        handled: stryMutAct_9fa48("37481") ? true : (stryCov_9fa48("37481"), false)
      });
    }
  }

  /**
   * Validate table name is a valid system table.
   * @param {string} tableName - Table name to validate.
   * @throws {Error} If table name is invalid.
   * @private
   */
  validateTableName(tableName) {
    if (stryMutAct_9fa48("37482")) {
      {}
    } else {
      stryCov_9fa48("37482");
      if (stryMutAct_9fa48("37485") ? false : stryMutAct_9fa48("37484") ? true : stryMutAct_9fa48("37483") ? VALID_SYSTEM_TABLES.includes(tableName) : (stryCov_9fa48("37483", "37484", "37485"), !VALID_SYSTEM_TABLES.includes(tableName))) {
        if (stryMutAct_9fa48("37486")) {
          {}
        } else {
          stryCov_9fa48("37486");
          throw new Error((stryMutAct_9fa48("37487") ? `` : (stryCov_9fa48("37487"), `${CDC_ERROR_MSG.INVALID_TABLE_PREFIX}${tableName}. `)) + (stryMutAct_9fa48("37488") ? `` : (stryCov_9fa48("37488"), `${CDC_ERROR_MSG.VALID_TABLES_PREFIX}`)) + (stryMutAct_9fa48("37489") ? `` : (stryCov_9fa48("37489"), `${VALID_SYSTEM_TABLES.join(CDC_SQL.COMMA_SPACE)}`)));
        }
      }
    }
  }

  /**
   * Validate data has required id field.
   * @param {Object} data - Data to validate.
   * @param {string} operation - Operation type for error message.
   * @throws {Error} If data is invalid.
   * @private
   */
  validateData(data, operation) {
    if (stryMutAct_9fa48("37490")) {
      {}
    } else {
      stryCov_9fa48("37490");
      if (stryMutAct_9fa48("37493") ? !data && typeof data !== TYPEOF.OBJECT : stryMutAct_9fa48("37492") ? false : stryMutAct_9fa48("37491") ? true : (stryCov_9fa48("37491", "37492", "37493"), (stryMutAct_9fa48("37494") ? data : (stryCov_9fa48("37494"), !data)) || (stryMutAct_9fa48("37496") ? typeof data === TYPEOF.OBJECT : stryMutAct_9fa48("37495") ? false : (stryCov_9fa48("37495", "37496"), typeof data !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("37497")) {
          {}
        } else {
          stryCov_9fa48("37497");
          throw new Error(stryMutAct_9fa48("37498") ? `` : (stryCov_9fa48("37498"), `${operation}${CDC_ERROR_MSG.DATA_REQUIRED_SUFFIX}`));
        }
      }
    }
  }

  /**
   * Execute SQL directly on a local partition service (bootstrap mode only).
   *
   * Bootstrap Mode Direct Write Path:
   * - Bypasses SQL routing and system cache lookup
   * - Writes directly to local partition service
   * - Only used during seed node bootstrap before cache is populated
   * - After bootstrap, this path is never used again
   *
   * Process:
   * 1. Extract table name from SQL
   * 2. Find local partition service for that table
   * 3. Execute SQL directly on partition
   * 4. Return result
   *
   * Requirements: 8.3
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSQLDirectToLocalPartition(sql, params = stryMutAct_9fa48("37499") ? ["Stryker was here"] : (stryCov_9fa48("37499"), []), _options = {}) {
    if (stryMutAct_9fa48("37500")) {
      {}
    } else {
      stryCov_9fa48("37500");
      if (stryMutAct_9fa48("37503") ? !this.bootstrapMode && !this.localPartitionServices : stryMutAct_9fa48("37502") ? false : stryMutAct_9fa48("37501") ? true : (stryCov_9fa48("37501", "37502", "37503"), (stryMutAct_9fa48("37504") ? this.bootstrapMode : (stryCov_9fa48("37504"), !this.bootstrapMode)) || (stryMutAct_9fa48("37505") ? this.localPartitionServices : (stryCov_9fa48("37505"), !this.localPartitionServices)))) {
        if (stryMutAct_9fa48("37506")) {
          {}
        } else {
          stryCov_9fa48("37506");
          throw new Error(CDC_LOG_MSG.BOOTSTRAP_MODE_REQUIRED_FOR_DIRECT_SQL);
        }
      }

      // Extract table name from SQL
      const tableNameResult = this.extractTableNameFromSQL(sql);
      if (stryMutAct_9fa48("37509") ? tableNameResult.state === CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND : stryMutAct_9fa48("37508") ? false : stryMutAct_9fa48("37507") ? true : (stryCov_9fa48("37507", "37508", "37509"), tableNameResult.state !== CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND)) {
        if (stryMutAct_9fa48("37510")) {
          {}
        } else {
          stryCov_9fa48("37510");
          throw new Error(stryMutAct_9fa48("37511") ? `` : (stryCov_9fa48("37511"), `Could not extract table name from SQL: ${sql}`));
        }
      }
      const tableName = tableNameResult.tableName;
      const targetPartitionId = stryMutAct_9fa48("37514") ? INITIAL_PARTITION_IDS[tableName] && null : stryMutAct_9fa48("37513") ? false : stryMutAct_9fa48("37512") ? true : (stryCov_9fa48("37512", "37513", "37514"), INITIAL_PARTITION_IDS[tableName] || null);
      const candidates = stryMutAct_9fa48("37515") ? ["Stryker was here"] : (stryCov_9fa48("37515"), []);
      for (const service of this.localPartitionServices.values()) {
        if (stryMutAct_9fa48("37516")) {
          {}
        } else {
          stryCov_9fa48("37516");
          if (stryMutAct_9fa48("37519") ? false : stryMutAct_9fa48("37518") ? true : stryMutAct_9fa48("37517") ? service : (stryCov_9fa48("37517", "37518", "37519"), !service)) {
            if (stryMutAct_9fa48("37520")) {
              {}
            } else {
              stryCov_9fa48("37520");
              continue;
            }
          }
          if (stryMutAct_9fa48("37522") ? false : stryMutAct_9fa48("37521") ? true : (stryCov_9fa48("37521", "37522"), targetPartitionId)) {
            if (stryMutAct_9fa48("37523")) {
              {}
            } else {
              stryCov_9fa48("37523");
              if (stryMutAct_9fa48("37526") ? service.partitionId !== targetPartitionId : stryMutAct_9fa48("37525") ? false : stryMutAct_9fa48("37524") ? true : (stryCov_9fa48("37524", "37525", "37526"), service.partitionId === targetPartitionId)) {
                if (stryMutAct_9fa48("37527")) {
                  {}
                } else {
                  stryCov_9fa48("37527");
                  candidates.push(service);
                }
              }
              continue;
            }
          }
          if (stryMutAct_9fa48("37530") ? service.tableName === tableName && service.tableId === tableName : stryMutAct_9fa48("37529") ? false : stryMutAct_9fa48("37528") ? true : (stryCov_9fa48("37528", "37529", "37530"), (stryMutAct_9fa48("37532") ? service.tableName !== tableName : stryMutAct_9fa48("37531") ? false : (stryCov_9fa48("37531", "37532"), service.tableName === tableName)) || (stryMutAct_9fa48("37534") ? service.tableId !== tableName : stryMutAct_9fa48("37533") ? false : (stryCov_9fa48("37533", "37534"), service.tableId === tableName)))) {
            if (stryMutAct_9fa48("37535")) {
              {}
            } else {
              stryCov_9fa48("37535");
              candidates.push(service);
            }
          }
        }
      }

      // In bootstrap mode, services should already be initialized.
      // Skip the wait loop if we have candidates - they're ready to use.
      const initializedCandidates = (stryMutAct_9fa48("37539") ? candidates.length <= NUM.ZERO : stryMutAct_9fa48("37538") ? candidates.length >= NUM.ZERO : stryMutAct_9fa48("37537") ? false : stryMutAct_9fa48("37536") ? true : (stryCov_9fa48("37536", "37537", "37538", "37539"), candidates.length > NUM.ZERO)) ? candidates : stryMutAct_9fa48("37540") ? ["Stryker was here"] : (stryCov_9fa48("37540"), []);
      if (stryMutAct_9fa48("37543") ? initializedCandidates.length !== NUM.ZERO : stryMutAct_9fa48("37542") ? false : stryMutAct_9fa48("37541") ? true : (stryCov_9fa48("37541", "37542", "37543"), initializedCandidates.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("37544")) {
          {}
        } else {
          stryCov_9fa48("37544");
          const partitionIds = stryMutAct_9fa48("37545") ? candidates.map(service => service?.partitionId).join(', ') : (stryCov_9fa48("37545"), candidates.map(stryMutAct_9fa48("37546") ? () => undefined : (stryCov_9fa48("37546"), service => stryMutAct_9fa48("37547") ? service.partitionId : (stryCov_9fa48("37547"), service?.partitionId))).filter(Boolean).join(stryMutAct_9fa48("37548") ? "" : (stryCov_9fa48("37548"), ', ')));
          throw new Error((stryMutAct_9fa48("37549") ? `` : (stryCov_9fa48("37549"), `Partition services not initialized for table: ${tableName}. `)) + (stryMutAct_9fa48("37550") ? `` : (stryCov_9fa48("37550"), `Partitions: ${partitionIds}`)));
        }
      }
      const leaderService = initializedCandidates.find(stryMutAct_9fa48("37551") ? () => undefined : (stryCov_9fa48("37551"), service => service.isLeader));
      const partitionService = stryMutAct_9fa48("37554") ? (leaderService || initializedCandidates[NUM.ZERO]) && null : stryMutAct_9fa48("37553") ? false : stryMutAct_9fa48("37552") ? true : (stryCov_9fa48("37552", "37553", "37554"), (stryMutAct_9fa48("37556") ? leaderService && initializedCandidates[NUM.ZERO] : stryMutAct_9fa48("37555") ? false : (stryCov_9fa48("37555", "37556"), leaderService || initializedCandidates[NUM.ZERO])) || null);
      if (stryMutAct_9fa48("37559") ? false : stryMutAct_9fa48("37558") ? true : stryMutAct_9fa48("37557") ? partitionService : (stryCov_9fa48("37557", "37558", "37559"), !partitionService)) {
        if (stryMutAct_9fa48("37560")) {
          {}
        } else {
          stryCov_9fa48("37560");
          const availablePartitions = stryMutAct_9fa48("37561") ? Array.from(this.localPartitionServices.values()).map(service => service?.partitionId) : (stryCov_9fa48("37561"), Array.from(this.localPartitionServices.values()).map(stryMutAct_9fa48("37562") ? () => undefined : (stryCov_9fa48("37562"), service => stryMutAct_9fa48("37563") ? service.partitionId : (stryCov_9fa48("37563"), service?.partitionId))).filter(Boolean));
          throw new Error((stryMutAct_9fa48("37564") ? `` : (stryCov_9fa48("37564"), `No local partition service found for table: ${tableName}. `)) + (stryMutAct_9fa48("37565") ? `` : (stryCov_9fa48("37565"), `Available partitions: ${availablePartitions.join(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_2)}`)));
        }
      }
      this.logger.debug(CDC_INTEGRATION_SERVICE_LITERAL.EXECUTING_SQL_DIRECTLY_ON_LOCAL_PARTITION_BOOTSTRAP_MODE, stryMutAct_9fa48("37566") ? {} : (stryCov_9fa48("37566"), {
        nodeId: this.nodeId,
        tableName,
        partitionId: partitionService.partitionId,
        sql: stryMutAct_9fa48("37567") ? sql : (stryCov_9fa48("37567"), sql.substring(NUM.ZERO, stryMutAct_9fa48("37568") ? Math.max(sql.length, NUM.HUNDRED) : (stryCov_9fa48("37568"), Math.min(sql.length, NUM.HUNDRED))))
      }));
      const isSelect = stryMutAct_9fa48("37571") ? sql.toUpperCase().startsWith('SELECT') : stryMutAct_9fa48("37570") ? sql.trim().toLowerCase().startsWith('SELECT') : stryMutAct_9fa48("37569") ? sql.trim().toUpperCase().endsWith('SELECT') : (stryCov_9fa48("37569", "37570", "37571"), sql.trim().toUpperCase().startsWith(stryMutAct_9fa48("37572") ? "" : (stryCov_9fa48("37572"), 'SELECT')));

      // Execute SQL directly on local partition(s) without raft during bootstrap.
      if (stryMutAct_9fa48("37574") ? false : stryMutAct_9fa48("37573") ? true : (stryCov_9fa48("37573", "37574"), isSelect)) {
        if (stryMutAct_9fa48("37575")) {
          {}
        } else {
          stryCov_9fa48("37575");
          const result = await partitionService.executeLocalQuery(sql, params);
          if (stryMutAct_9fa48("37578") ? !result && result.success === false : stryMutAct_9fa48("37577") ? false : stryMutAct_9fa48("37576") ? true : (stryCov_9fa48("37576", "37577", "37578"), (stryMutAct_9fa48("37579") ? result : (stryCov_9fa48("37579"), !result)) || (stryMutAct_9fa48("37581") ? result.success !== false : stryMutAct_9fa48("37580") ? false : (stryCov_9fa48("37580", "37581"), result.success === (stryMutAct_9fa48("37582") ? true : (stryCov_9fa48("37582"), false)))))) {
            if (stryMutAct_9fa48("37583")) {
              {}
            } else {
              stryCov_9fa48("37583");
              throw new Error(stryMutAct_9fa48("37586") ? result?.error && `Direct partition query failed for table: ${tableName}` : stryMutAct_9fa48("37585") ? false : stryMutAct_9fa48("37584") ? true : (stryCov_9fa48("37584", "37585", "37586"), (stryMutAct_9fa48("37587") ? result.error : (stryCov_9fa48("37587"), result?.error)) || (stryMutAct_9fa48("37588") ? `` : (stryCov_9fa48("37588"), `Direct partition query failed for table: ${tableName}`))));
            }
          }
          return result;
        }
      }
      const targets = initializedCandidates;
      const results = stryMutAct_9fa48("37589") ? ["Stryker was here"] : (stryCov_9fa48("37589"), []);
      for (const service of targets) {
        if (stryMutAct_9fa48("37590")) {
          {}
        } else {
          stryCov_9fa48("37590");
          const result = await service.executeLocalQuery(sql, params);
          results.push(result);
          if (stryMutAct_9fa48("37593") ? !result && result.success === false : stryMutAct_9fa48("37592") ? false : stryMutAct_9fa48("37591") ? true : (stryCov_9fa48("37591", "37592", "37593"), (stryMutAct_9fa48("37594") ? result : (stryCov_9fa48("37594"), !result)) || (stryMutAct_9fa48("37596") ? result.success !== false : stryMutAct_9fa48("37595") ? false : (stryCov_9fa48("37595", "37596"), result.success === (stryMutAct_9fa48("37597") ? true : (stryCov_9fa48("37597"), false)))))) {
            if (stryMutAct_9fa48("37598")) {
              {}
            } else {
              stryCov_9fa48("37598");
              throw new Error(stryMutAct_9fa48("37601") ? result?.error && `Direct partition write failed for table: ${tableName}` : stryMutAct_9fa48("37600") ? false : stryMutAct_9fa48("37599") ? true : (stryCov_9fa48("37599", "37600", "37601"), (stryMutAct_9fa48("37602") ? result.error : (stryCov_9fa48("37602"), result?.error)) || (stryMutAct_9fa48("37603") ? `` : (stryCov_9fa48("37603"), `Direct partition write failed for table: ${tableName}`))));
            }
          }
        }
      }
      return results[NUM.ZERO];
    }
  }

  /**
   * Extract table name from SQL statement.
   * Supports INSERT INTO, UPDATE, DELETE FROM, and SQLite
   * INSERT OR <modifier> INTO statements.
   *
   * @param {string} sql - SQL query string.
   * @return {Object} Explicit table-name extraction result.
   * @private
   */
  extractTableNameFromSQL(sql) {
    if (stryMutAct_9fa48("37604")) {
      {}
    } else {
      stryCov_9fa48("37604");
      if (stryMutAct_9fa48("37607") ? !sql && typeof sql !== TYPEOF.STRING : stryMutAct_9fa48("37606") ? false : stryMutAct_9fa48("37605") ? true : (stryCov_9fa48("37605", "37606", "37607"), (stryMutAct_9fa48("37608") ? sql : (stryCov_9fa48("37608"), !sql)) || (stryMutAct_9fa48("37610") ? typeof sql === TYPEOF.STRING : stryMutAct_9fa48("37609") ? false : (stryCov_9fa48("37609", "37610"), typeof sql !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("37611")) {
          {}
        } else {
          stryCov_9fa48("37611");
          return Object.freeze(stryMutAct_9fa48("37612") ? {} : (stryCov_9fa48("37612"), {
            state: CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_INVALID_INPUT
          }));
        }
      }

      // INSERT INTO table_name or INSERT OR <modifier> INTO table_name
      let match = sql.match(stryMutAct_9fa48("37625") ? /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\W+)/i : stryMutAct_9fa48("37624") ? /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w)/i : stryMutAct_9fa48("37623") ? /INSERT\s+(?:OR\s+\w+\s+)?INTO\S+(\w+)/i : stryMutAct_9fa48("37622") ? /INSERT\s+(?:OR\s+\w+\s+)?INTO\s(\w+)/i : stryMutAct_9fa48("37621") ? /INSERT\s+(?:OR\s+\w+\S+)?INTO\s+(\w+)/i : stryMutAct_9fa48("37620") ? /INSERT\s+(?:OR\s+\w+\s)?INTO\s+(\w+)/i : stryMutAct_9fa48("37619") ? /INSERT\s+(?:OR\s+\W+\s+)?INTO\s+(\w+)/i : stryMutAct_9fa48("37618") ? /INSERT\s+(?:OR\s+\w\s+)?INTO\s+(\w+)/i : stryMutAct_9fa48("37617") ? /INSERT\s+(?:OR\S+\w+\s+)?INTO\s+(\w+)/i : stryMutAct_9fa48("37616") ? /INSERT\s+(?:OR\s\w+\s+)?INTO\s+(\w+)/i : stryMutAct_9fa48("37615") ? /INSERT\s+(?:OR\s+\w+\s+)INTO\s+(\w+)/i : stryMutAct_9fa48("37614") ? /INSERT\S+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i : stryMutAct_9fa48("37613") ? /INSERT\s(?:OR\s+\w+\s+)?INTO\s+(\w+)/i : (stryCov_9fa48("37613", "37614", "37615", "37616", "37617", "37618", "37619", "37620", "37621", "37622", "37623", "37624", "37625"), /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i));
      if (stryMutAct_9fa48("37627") ? false : stryMutAct_9fa48("37626") ? true : (stryCov_9fa48("37626", "37627"), match)) {
        if (stryMutAct_9fa48("37628")) {
          {}
        } else {
          stryCov_9fa48("37628");
          return Object.freeze(stryMutAct_9fa48("37629") ? {} : (stryCov_9fa48("37629"), {
            state: CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
            tableName: match[NUM.ONE]
          }));
        }
      }

      // UPDATE table_name SET
      match = sql.match(stryMutAct_9fa48("37635") ? /UPDATE\s+(\w+)\S+SET/i : stryMutAct_9fa48("37634") ? /UPDATE\s+(\w+)\sSET/i : stryMutAct_9fa48("37633") ? /UPDATE\s+(\W+)\s+SET/i : stryMutAct_9fa48("37632") ? /UPDATE\s+(\w)\s+SET/i : stryMutAct_9fa48("37631") ? /UPDATE\S+(\w+)\s+SET/i : stryMutAct_9fa48("37630") ? /UPDATE\s(\w+)\s+SET/i : (stryCov_9fa48("37630", "37631", "37632", "37633", "37634", "37635"), /UPDATE\s+(\w+)\s+SET/i));
      if (stryMutAct_9fa48("37637") ? false : stryMutAct_9fa48("37636") ? true : (stryCov_9fa48("37636", "37637"), match)) {
        if (stryMutAct_9fa48("37638")) {
          {}
        } else {
          stryCov_9fa48("37638");
          return Object.freeze(stryMutAct_9fa48("37639") ? {} : (stryCov_9fa48("37639"), {
            state: CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
            tableName: match[NUM.ONE]
          }));
        }
      }

      // DELETE FROM table_name
      match = sql.match(stryMutAct_9fa48("37645") ? /DELETE\s+FROM\s+(\W+)/i : stryMutAct_9fa48("37644") ? /DELETE\s+FROM\s+(\w)/i : stryMutAct_9fa48("37643") ? /DELETE\s+FROM\S+(\w+)/i : stryMutAct_9fa48("37642") ? /DELETE\s+FROM\s(\w+)/i : stryMutAct_9fa48("37641") ? /DELETE\S+FROM\s+(\w+)/i : stryMutAct_9fa48("37640") ? /DELETE\sFROM\s+(\w+)/i : (stryCov_9fa48("37640", "37641", "37642", "37643", "37644", "37645"), /DELETE\s+FROM\s+(\w+)/i));
      if (stryMutAct_9fa48("37647") ? false : stryMutAct_9fa48("37646") ? true : (stryCov_9fa48("37646", "37647"), match)) {
        if (stryMutAct_9fa48("37648")) {
          {}
        } else {
          stryCov_9fa48("37648");
          return Object.freeze(stryMutAct_9fa48("37649") ? {} : (stryCov_9fa48("37649"), {
            state: CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
            tableName: match[NUM.ONE]
          }));
        }
      }

      // SELECT FROM table_name (for completeness, though not used in bootstrap)
      match = sql.match(stryMutAct_9fa48("37653") ? /FROM\s+(\W+)/i : stryMutAct_9fa48("37652") ? /FROM\s+(\w)/i : stryMutAct_9fa48("37651") ? /FROM\S+(\w+)/i : stryMutAct_9fa48("37650") ? /FROM\s(\w+)/i : (stryCov_9fa48("37650", "37651", "37652", "37653"), /FROM\s+(\w+)/i));
      if (stryMutAct_9fa48("37655") ? false : stryMutAct_9fa48("37654") ? true : (stryCov_9fa48("37654", "37655"), match)) {
        if (stryMutAct_9fa48("37656")) {
          {}
        } else {
          stryCov_9fa48("37656");
          return Object.freeze(stryMutAct_9fa48("37657") ? {} : (stryCov_9fa48("37657"), {
            state: CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
            tableName: match[NUM.ONE]
          }));
        }
      }
      return Object.freeze(stryMutAct_9fa48("37658") ? {} : (stryCov_9fa48("37658"), {
        state: CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_NOT_FOUND
      }));
    }
  }

  /**
   * Resolve the canonical SQL session for one routed steady-state system-table
   * write so owner-managed CDC writes never share the default user session.
   * @param {Object} [options={}]
   * @return {string}
   * @private
   */
  resolveSystemWriteSessionId(options = {}) {
    if (stryMutAct_9fa48("37659")) {
      {}
    } else {
      stryCov_9fa48("37659");
      if (stryMutAct_9fa48("37662") ? typeof options.sessionId === TYPEOF.STRING || options.sessionId.length > NUM.ZERO : stryMutAct_9fa48("37661") ? false : stryMutAct_9fa48("37660") ? true : (stryCov_9fa48("37660", "37661", "37662"), (stryMutAct_9fa48("37664") ? typeof options.sessionId !== TYPEOF.STRING : stryMutAct_9fa48("37663") ? true : (stryCov_9fa48("37663", "37664"), typeof options.sessionId === TYPEOF.STRING)) && (stryMutAct_9fa48("37667") ? options.sessionId.length <= NUM.ZERO : stryMutAct_9fa48("37666") ? options.sessionId.length >= NUM.ZERO : stryMutAct_9fa48("37665") ? true : (stryCov_9fa48("37665", "37666", "37667"), options.sessionId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("37668")) {
          {}
        } else {
          stryCov_9fa48("37668");
          return options.sessionId;
        }
      }
      return stryMutAct_9fa48("37669") ? `` : (stryCov_9fa48("37669"), `${CDC_SESSION.SYSTEM_WRITE_PREFIX}:${uuidv4()}`);
    }
  }

  /**
   * Execute a SQL query through the query engine or directly to local partition.
   *
   * Routing Logic:
   * - Bootstrap mode enabled: Direct write to local partition (seed node only)
   * - Bootstrap mode disabled: Route through SQL engine to partition leader
   *
   * Normal Mode Flow:
   * 1. SQL engine uses system cache to find partition
   * 2. System cache provides partition leader address
   * 3. Message router delivers query to leader
   * 4. Partition executes query and generates CDC event
   * 5. CDC event updates all node caches
   *
  * Requirements: 8.4, 8.5
  * @param {string} sql - SQL query string.
  * @param {Array} params - Query parameters.
   * @param {Object} [options={}] - Query execution options.
  * @return {Promise<Object>} Query result.
  * @private
  */
  async executeSQLViaQueryEngine(sql, params = stryMutAct_9fa48("37670") ? ["Stryker was here"] : (stryCov_9fa48("37670"), []), options = {}) {
    if (stryMutAct_9fa48("37671")) {
      {}
    } else {
      stryCov_9fa48("37671");
      // SQL-routed mode: Route through SQL engine to partition leader
      if (stryMutAct_9fa48("37674") ? false : stryMutAct_9fa48("37673") ? true : stryMutAct_9fa48("37672") ? this.sqlQueryEngine : (stryCov_9fa48("37672", "37673", "37674"), !this.sqlQueryEngine)) {
        if (stryMutAct_9fa48("37675")) {
          {}
        } else {
          stryCov_9fa48("37675");
          throw new Error((stryMutAct_9fa48("37676") ? `` : (stryCov_9fa48("37676"), `${CDC_ERROR_MSG.CDC_ENGINE_MISSING_PREFIX}`)) + (stryMutAct_9fa48("37677") ? `` : (stryCov_9fa48("37677"), `${CDC_ERROR_MSG.CDC_ENGINE_MISSING_DETAIL}`)));
        }
      }
      const maxAttempts = stryMutAct_9fa48("37678") ? Math.min(CDC_RETRY.MIN_ATTEMPTS, Number(this.retryMaxAttempts) || CDC_DEFAULTS.RETRY_MAX_ATTEMPTS) : (stryCov_9fa48("37678"), Math.max(CDC_RETRY.MIN_ATTEMPTS, stryMutAct_9fa48("37681") ? Number(this.retryMaxAttempts) && CDC_DEFAULTS.RETRY_MAX_ATTEMPTS : stryMutAct_9fa48("37680") ? false : stryMutAct_9fa48("37679") ? true : (stryCov_9fa48("37679", "37680", "37681"), Number(this.retryMaxAttempts) || CDC_DEFAULTS.RETRY_MAX_ATTEMPTS)));
      const baseDelayMs = stryMutAct_9fa48("37682") ? Math.min(CDC_RETRY.MIN_DELAY_MS, Number(this.retryDelayMs) || CDC_DEFAULTS.RETRY_DELAY_MS) : (stryCov_9fa48("37682"), Math.max(CDC_RETRY.MIN_DELAY_MS, stryMutAct_9fa48("37685") ? Number(this.retryDelayMs) && CDC_DEFAULTS.RETRY_DELAY_MS : stryMutAct_9fa48("37684") ? false : stryMutAct_9fa48("37683") ? true : (stryCov_9fa48("37683", "37684", "37685"), Number(this.retryDelayMs) || CDC_DEFAULTS.RETRY_DELAY_MS)));
      const tableNameResult = this.extractTableNameFromSQL(sql);
      const tableName = (stryMutAct_9fa48("37688") ? tableNameResult.state !== CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND : stryMutAct_9fa48("37687") ? false : stryMutAct_9fa48("37686") ? true : (stryCov_9fa48("37686", "37687", "37688"), tableNameResult.state === CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND)) ? tableNameResult.tableName : null;
      const pressureDecision = PressureGovernor.getShared(stryMutAct_9fa48("37689") ? {} : (stryCov_9fa48("37689"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter
      })).evaluate(stryMutAct_9fa48("37690") ? {} : (stryCov_9fa48("37690"), {
        workClass: stryMutAct_9fa48("37693") ? options?.workClass && PRESSURE_WORK_CLASS.CRITICAL : stryMutAct_9fa48("37692") ? false : stryMutAct_9fa48("37691") ? true : (stryCov_9fa48("37691", "37692", "37693"), (stryMutAct_9fa48("37694") ? options.workClass : (stryCov_9fa48("37694"), options?.workClass)) || PRESSURE_WORK_CLASS.CRITICAL),
        resourceKeys: stryMutAct_9fa48("37695") ? [] : (stryCov_9fa48("37695"), [stryMutAct_9fa48("37696") ? "" : (stryCov_9fa48("37696"), 'control-plane:write'), stryMutAct_9fa48("37697") ? `` : (stryCov_9fa48("37697"), `control-plane:table:${stryMutAct_9fa48("37700") ? tableName && 'unknown' : stryMutAct_9fa48("37699") ? false : stryMutAct_9fa48("37698") ? true : (stryCov_9fa48("37698", "37699", "37700"), tableName || (stryMutAct_9fa48("37701") ? "" : (stryCov_9fa48("37701"), 'unknown')))}`)]),
        allowDegrade: stryMutAct_9fa48("37702") ? true : (stryCov_9fa48("37702"), false),
        allowDefer: stryMutAct_9fa48("37705") ? options?.allowPressureDefer !== true : stryMutAct_9fa48("37704") ? false : stryMutAct_9fa48("37703") ? true : (stryCov_9fa48("37703", "37704", "37705"), (stryMutAct_9fa48("37706") ? options.allowPressureDefer : (stryCov_9fa48("37706"), options?.allowPressureDefer)) === (stryMutAct_9fa48("37707") ? false : (stryCov_9fa48("37707"), true))),
        retryAfterMs: stryMutAct_9fa48("37708") ? options.pressureRetryAfterMs : (stryCov_9fa48("37708"), options?.pressureRetryAfterMs)
      }));
      const queryTimeoutMs = Number(stryMutAct_9fa48("37709") ? options.queryTimeoutMs : (stryCov_9fa48("37709"), options?.queryTimeoutMs));
      if (stryMutAct_9fa48("37712") ? pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER && pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("37711") ? false : stryMutAct_9fa48("37710") ? true : (stryCov_9fa48("37710", "37711", "37712"), (stryMutAct_9fa48("37714") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("37713") ? false : (stryCov_9fa48("37713", "37714"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)) || (stryMutAct_9fa48("37716") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("37715") ? false : (stryCov_9fa48("37715", "37716"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT)))) {
        if (stryMutAct_9fa48("37717")) {
          {}
        } else {
          stryCov_9fa48("37717");
          return buildPressureAdmissionFailure(pressureDecision, stryMutAct_9fa48("37718") ? {} : (stryCov_9fa48("37718"), {
            tableName
          }));
        }
      }
      const queryOptions = stryMutAct_9fa48("37719") ? {} : (stryCov_9fa48("37719"), {
        sessionId: this.resolveSystemWriteSessionId(options),
        workClass: stryMutAct_9fa48("37720") ? options.workClass : (stryCov_9fa48("37720"), options?.workClass),
        allowPressureDefer: stryMutAct_9fa48("37721") ? options.allowPressureDefer : (stryCov_9fa48("37721"), options?.allowPressureDefer),
        pressureRetryAfterMs: stryMutAct_9fa48("37722") ? options.pressureRetryAfterMs : (stryCov_9fa48("37722"), options?.pressureRetryAfterMs),
        deliveryPriority: normalizeDeliveryPriority(stryMutAct_9fa48("37723") ? options.deliveryPriority : (stryCov_9fa48("37723"), options?.deliveryPriority), (stryMutAct_9fa48("37726") ? pressureDecision.action === PRESSURE_GOVERNOR_ACTION.ALLOW && pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("37725") ? false : stryMutAct_9fa48("37724") ? true : (stryCov_9fa48("37724", "37725", "37726"), (stryMutAct_9fa48("37728") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.ALLOW : stryMutAct_9fa48("37727") ? false : (stryCov_9fa48("37727", "37728"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.ALLOW)) || (stryMutAct_9fa48("37730") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("37729") ? false : (stryCov_9fa48("37729", "37730"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE)))) ? stryMutAct_9fa48("37731") ? "" : (stryCov_9fa48("37731"), 'critical') : stryMutAct_9fa48("37732") ? "" : (stryCov_9fa48("37732"), 'background')),
        routingReadinessDimension: stryMutAct_9fa48("37735") ? options?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("37734") ? false : stryMutAct_9fa48("37733") ? true : (stryCov_9fa48("37733", "37734", "37735"), (stryMutAct_9fa48("37736") ? options.routingReadinessDimension : (stryCov_9fa48("37736"), options?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)
      });
      if (stryMutAct_9fa48("37739") ? Number.isFinite(queryTimeoutMs) || queryTimeoutMs > NUM.ZERO : stryMutAct_9fa48("37738") ? false : stryMutAct_9fa48("37737") ? true : (stryCov_9fa48("37737", "37738", "37739"), Number.isFinite(queryTimeoutMs) && (stryMutAct_9fa48("37742") ? queryTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("37741") ? queryTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("37740") ? true : (stryCov_9fa48("37740", "37741", "37742"), queryTimeoutMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("37743")) {
          {}
        } else {
          stryCov_9fa48("37743");
          queryOptions.timeoutMs = Math.floor(queryTimeoutMs);
        }
      }
      if (stryMutAct_9fa48("37746") ? options.cancellationToken : stryMutAct_9fa48("37745") ? false : stryMutAct_9fa48("37744") ? true : (stryCov_9fa48("37744", "37745", "37746"), options?.cancellationToken)) {
        if (stryMutAct_9fa48("37747")) {
          {}
        } else {
          stryCov_9fa48("37747");
          queryOptions.cancellationToken = options.cancellationToken;
        }
      }
      for (let attempt = NUM.ONE; stryMutAct_9fa48("37750") ? attempt > maxAttempts : stryMutAct_9fa48("37749") ? attempt < maxAttempts : stryMutAct_9fa48("37748") ? false : (stryCov_9fa48("37748", "37749", "37750"), attempt <= maxAttempts); stryMutAct_9fa48("37751") ? attempt -= NUM.ONE : (stryCov_9fa48("37751"), attempt += NUM.ONE)) {
        if (stryMutAct_9fa48("37752")) {
          {}
        } else {
          stryCov_9fa48("37752");
          try {
            if (stryMutAct_9fa48("37753")) {
              {}
            } else {
              stryCov_9fa48("37753");
              const attemptStartMs = Date.now();
              if (stryMutAct_9fa48("37756") ? false : stryMutAct_9fa48("37755") ? true : stryMutAct_9fa48("37754") ? this.bootstrapMode : (stryCov_9fa48("37754", "37755", "37756"), !this.bootstrapMode)) {
                if (stryMutAct_9fa48("37757")) {
                  {}
                } else {
                  stryCov_9fa48("37757");
                  const localWriteResult = await this.tryExecuteLocalSystemTableWrite(sql, params);
                  if (stryMutAct_9fa48("37759") ? false : stryMutAct_9fa48("37758") ? true : (stryCov_9fa48("37758", "37759"), localWriteResult.handled)) {
                    if (stryMutAct_9fa48("37760")) {
                      {}
                    } else {
                      stryCov_9fa48("37760");
                      return localWriteResult.result;
                    }
                  }
                }
              }
              const result = await this.sqlQueryEngine.executeQuery(sql, params, queryOptions);
              if (stryMutAct_9fa48("37763") ? result || result.success === false : stryMutAct_9fa48("37762") ? false : stryMutAct_9fa48("37761") ? true : (stryCov_9fa48("37761", "37762", "37763"), result && (stryMutAct_9fa48("37765") ? result.success !== false : stryMutAct_9fa48("37764") ? true : (stryCov_9fa48("37764", "37765"), result.success === (stryMutAct_9fa48("37766") ? true : (stryCov_9fa48("37766"), false)))))) {
                if (stryMutAct_9fa48("37767")) {
                  {}
                } else {
                  stryCov_9fa48("37767");
                  const message = stryMutAct_9fa48("37770") ? result.error && ERRORS.QUERY_FAILED : stryMutAct_9fa48("37769") ? false : stryMutAct_9fa48("37768") ? true : (stryCov_9fa48("37768", "37769", "37770"), result.error || ERRORS.QUERY_FAILED);
                  if (stryMutAct_9fa48("37773") ? this.isTransientCdcError(result) || attempt < maxAttempts : stryMutAct_9fa48("37772") ? false : stryMutAct_9fa48("37771") ? true : (stryCov_9fa48("37771", "37772", "37773"), this.isTransientCdcError(result) && (stryMutAct_9fa48("37776") ? attempt >= maxAttempts : stryMutAct_9fa48("37775") ? attempt <= maxAttempts : stryMutAct_9fa48("37774") ? true : (stryCov_9fa48("37774", "37775", "37776"), attempt < maxAttempts)))) {
                    if (stryMutAct_9fa48("37777")) {
                      {}
                    } else {
                      stryCov_9fa48("37777");
                      this.logger.warn(CDC_LOG_MSG.TRANSIENT_SQL_RETRY, stryMutAct_9fa48("37778") ? {} : (stryCov_9fa48("37778"), {
                        nodeId: this.nodeId,
                        attempt,
                        maxAttempts,
                        error: message,
                        retryAfterMs: getControlPlaneRetryAfterMs(result)
                      }));
                      await delay(this.resolveTransientCdcRetryDelayMs(baseDelayMs, attempt, result));
                      continue;
                    }
                  }
                  throw buildSystemTableMutationError(result, message);
                }
              }
              if (stryMutAct_9fa48("37780") ? false : stryMutAct_9fa48("37779") ? true : (stryCov_9fa48("37779", "37780"), shouldEmitTableWriteMetric(tableName))) {
                if (stryMutAct_9fa48("37781")) {
                  {}
                } else {
                  stryCov_9fa48("37781");
                  try {
                    if (stryMutAct_9fa48("37782")) {
                      {}
                    } else {
                      stryCov_9fa48("37782");
                      const durationMs = stryMutAct_9fa48("37783") ? Date.now() + attemptStartMs : (stryCov_9fa48("37783"), Date.now() - attemptStartMs);
                      this.logger.info(METRICS_LOG_TAG.CDC_SQL_ROUTE, stryMutAct_9fa48("37784") ? {} : (stryCov_9fa48("37784"), {
                        durationMs,
                        attempt,
                        maxAttempts,
                        bootstrapMode: stryMutAct_9fa48("37787") ? this.writeRouter?.mode !== WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT : stryMutAct_9fa48("37786") ? false : stryMutAct_9fa48("37785") ? true : (stryCov_9fa48("37785", "37786", "37787"), (stryMutAct_9fa48("37788") ? this.writeRouter.mode : (stryCov_9fa48("37788"), this.writeRouter?.mode)) === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT),
                        tableName
                      }));
                    }
                  } catch (_metricsErr) {
                    // Metrics logging must not propagate to callers
                  }
                }
              }
              return result;
            }
          } catch (error) {
            if (stryMutAct_9fa48("37789")) {
              {}
            } else {
              stryCov_9fa48("37789");
              const message = stryMutAct_9fa48("37792") ? error?.message && String(error) : stryMutAct_9fa48("37791") ? false : stryMutAct_9fa48("37790") ? true : (stryCov_9fa48("37790", "37791", "37792"), (stryMutAct_9fa48("37793") ? error.message : (stryCov_9fa48("37793"), error?.message)) || String(error));
              if (stryMutAct_9fa48("37796") ? !this.isTransientCdcError(error) && attempt >= maxAttempts : stryMutAct_9fa48("37795") ? false : stryMutAct_9fa48("37794") ? true : (stryCov_9fa48("37794", "37795", "37796"), (stryMutAct_9fa48("37797") ? this.isTransientCdcError(error) : (stryCov_9fa48("37797"), !this.isTransientCdcError(error))) || (stryMutAct_9fa48("37800") ? attempt < maxAttempts : stryMutAct_9fa48("37799") ? attempt > maxAttempts : stryMutAct_9fa48("37798") ? false : (stryCov_9fa48("37798", "37799", "37800"), attempt >= maxAttempts)))) {
                if (stryMutAct_9fa48("37801")) {
                  {}
                } else {
                  stryCov_9fa48("37801");
                  annotateSystemTableMutationError(error, stryMutAct_9fa48("37802") ? {} : (stryCov_9fa48("37802"), {
                    attempt,
                    writeMode: (stryMutAct_9fa48("37805") ? this.writeRouter?.mode !== WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT : stryMutAct_9fa48("37804") ? false : stryMutAct_9fa48("37803") ? true : (stryCov_9fa48("37803", "37804", "37805"), (stryMutAct_9fa48("37806") ? this.writeRouter.mode : (stryCov_9fa48("37806"), this.writeRouter?.mode)) === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT)) ? WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT : WRITE_ROUTER_MODE.SQL_ROUTED
                  }));
                  throw error;
                }
              }
              this.logger.warn(CDC_LOG_MSG.TRANSIENT_SQL_EXCEPTION_RETRY, stryMutAct_9fa48("37807") ? {} : (stryCov_9fa48("37807"), {
                nodeId: this.nodeId,
                attempt,
                maxAttempts,
                error: message,
                retryAfterMs: getControlPlaneRetryAfterMs(error)
              }));
              await delay(this.resolveTransientCdcRetryDelayMs(baseDelayMs, attempt, error));
            }
          }
        }
      }

      // Should be unreachable due to throws/returns above.
      throw new Error(ERRORS.QUERY_FAILED);
    }
  }

  /**
   * Execute SQL using the active write-router strategy.
   * @param {string} sql
   * @param {Array} params
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async executeSQL(sql, params = stryMutAct_9fa48("37808") ? ["Stryker was here"] : (stryCov_9fa48("37808"), []), options = {}) {
    if (stryMutAct_9fa48("37809")) {
      {}
    } else {
      stryCov_9fa48("37809");
      if (stryMutAct_9fa48("37812") ? !this.writeRouter && typeof this.writeRouter.execute !== TYPEOF.FUNCTION : stryMutAct_9fa48("37811") ? false : stryMutAct_9fa48("37810") ? true : (stryCov_9fa48("37810", "37811", "37812"), (stryMutAct_9fa48("37813") ? this.writeRouter : (stryCov_9fa48("37813"), !this.writeRouter)) || (stryMutAct_9fa48("37815") ? typeof this.writeRouter.execute === TYPEOF.FUNCTION : stryMutAct_9fa48("37814") ? false : (stryCov_9fa48("37814", "37815"), typeof this.writeRouter.execute !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("37816")) {
          {}
        } else {
          stryCov_9fa48("37816");
          throw new Error(CDC_INTEGRATION_SERVICE_LITERAL.CDC_WRITE_ROUTER_IS_NOT_CONFIGURED);
        }
      }
      return this.writeRouter.execute(sql, params, options);
    }
  }

  /**
   * Determine if a CDC write failure is transient and should be retried.
   * @param {*} errorLike - Error object, result, or message.
   * @return {boolean} True if transient.
   * @private
   */
  isTransientCdcError(errorLike) {
    if (stryMutAct_9fa48("37817")) {
      {}
    } else {
      stryCov_9fa48("37817");
      const message = (stryMutAct_9fa48("37820") ? typeof errorLike !== TYPEOF.STRING : stryMutAct_9fa48("37819") ? false : stryMutAct_9fa48("37818") ? true : (stryCov_9fa48("37818", "37819", "37820"), typeof errorLike === TYPEOF.STRING)) ? errorLike : stryMutAct_9fa48("37823") ? (errorLike?.message || errorLike?.error) && '' : stryMutAct_9fa48("37822") ? false : stryMutAct_9fa48("37821") ? true : (stryCov_9fa48("37821", "37822", "37823"), (stryMutAct_9fa48("37825") ? errorLike?.message && errorLike?.error : stryMutAct_9fa48("37824") ? false : (stryCov_9fa48("37824", "37825"), (stryMutAct_9fa48("37826") ? errorLike.message : (stryCov_9fa48("37826"), errorLike?.message)) || (stryMutAct_9fa48("37827") ? errorLike.error : (stryCov_9fa48("37827"), errorLike?.error)))) || (stryMutAct_9fa48("37828") ? "Stryker was here!" : (stryCov_9fa48("37828"), '')));
      return stryMutAct_9fa48("37831") ? (isRetryableControlPlaneError(errorLike) || message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || message === ERRORS.QUERY_FAILED || message.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE) || message.includes(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE) || message.includes(ERRORS.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE) || message.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) || message.includes(CDC_INTEGRATION_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) || message.includes(CDC_INTEGRATION_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER)) && message.includes(CDC_INTEGRATION_SERVICE_LITERAL.MESSAGE_TIMEOUT) : stryMutAct_9fa48("37830") ? false : stryMutAct_9fa48("37829") ? true : (stryCov_9fa48("37829", "37830", "37831"), (stryMutAct_9fa48("37833") ? (isRetryableControlPlaneError(errorLike) || message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || message === ERRORS.QUERY_FAILED || message.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE) || message.includes(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE) || message.includes(ERRORS.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE) || message.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) || message.includes(CDC_INTEGRATION_SERVICE_LITERAL.NO_CONNECTION_TO_NODE)) && message.includes(CDC_INTEGRATION_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER) : stryMutAct_9fa48("37832") ? false : (stryCov_9fa48("37832", "37833"), (stryMutAct_9fa48("37835") ? (isRetryableControlPlaneError(errorLike) || message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || message === ERRORS.QUERY_FAILED || message.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE) || message.includes(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE) || message.includes(ERRORS.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE) || message.includes(ERRORS.NO_HANDLER_FOR_ADDRESS)) && message.includes(CDC_INTEGRATION_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) : stryMutAct_9fa48("37834") ? false : (stryCov_9fa48("37834", "37835"), (stryMutAct_9fa48("37837") ? (isRetryableControlPlaneError(errorLike) || message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || message === ERRORS.QUERY_FAILED || message.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE) || message.includes(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE) || message.includes(ERRORS.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE)) && message.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) : stryMutAct_9fa48("37836") ? false : (stryCov_9fa48("37836", "37837"), (stryMutAct_9fa48("37839") ? (isRetryableControlPlaneError(errorLike) || message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || message === ERRORS.QUERY_FAILED || message.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE) || message.includes(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE)) && message.includes(ERRORS.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE) : stryMutAct_9fa48("37838") ? false : (stryCov_9fa48("37838", "37839"), (stryMutAct_9fa48("37841") ? (isRetryableControlPlaneError(errorLike) || message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || message === ERRORS.QUERY_FAILED || message.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE)) && message.includes(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE) : stryMutAct_9fa48("37840") ? false : (stryCov_9fa48("37840", "37841"), (stryMutAct_9fa48("37843") ? (isRetryableControlPlaneError(errorLike) || message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || message === ERRORS.QUERY_FAILED) && message.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE) : stryMutAct_9fa48("37842") ? false : (stryCov_9fa48("37842", "37843"), (stryMutAct_9fa48("37845") ? (isRetryableControlPlaneError(errorLike) || message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND)) && message === ERRORS.QUERY_FAILED : stryMutAct_9fa48("37844") ? false : (stryCov_9fa48("37844", "37845"), (stryMutAct_9fa48("37847") ? (isRetryableControlPlaneError(errorLike) || message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE)) && message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) : stryMutAct_9fa48("37846") ? false : (stryCov_9fa48("37846", "37847"), (stryMutAct_9fa48("37849") ? isRetryableControlPlaneError(errorLike) && message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) : stryMutAct_9fa48("37848") ? false : (stryCov_9fa48("37848", "37849"), isRetryableControlPlaneError(errorLike) || message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE))) || message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND))) || (stryMutAct_9fa48("37851") ? message !== ERRORS.QUERY_FAILED : stryMutAct_9fa48("37850") ? false : (stryCov_9fa48("37850", "37851"), message === ERRORS.QUERY_FAILED)))) || message.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE))) || message.includes(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE))) || message.includes(ERRORS.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE))) || message.includes(ERRORS.NO_HANDLER_FOR_ADDRESS))) || message.includes(CDC_INTEGRATION_SERVICE_LITERAL.NO_CONNECTION_TO_NODE))) || message.includes(CDC_INTEGRATION_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER))) || message.includes(CDC_INTEGRATION_SERVICE_LITERAL.MESSAGE_TIMEOUT));
    }
  }

  /**
   * Exponential backoff with a small cap so bootstrap/join doesn't hang forever.
   * @param {number} baseDelayMs - Base delay from config.
   * @param {number} attempt - Current attempt (1-based).
   * @return {number} Delay in ms.
   * @private
   */
  computeRetryDelayMs(baseDelayMs, attempt) {
    if (stryMutAct_9fa48("37852")) {
      {}
    } else {
      stryCov_9fa48("37852");
      const exp = stryMutAct_9fa48("37853") ? Math.max(CDC_RETRY.MAX_EXPONENT, Math.max(NUM.ZERO, attempt - NUM.ONE)) : (stryCov_9fa48("37853"), Math.min(CDC_RETRY.MAX_EXPONENT, stryMutAct_9fa48("37854") ? Math.min(NUM.ZERO, attempt - NUM.ONE) : (stryCov_9fa48("37854"), Math.max(NUM.ZERO, stryMutAct_9fa48("37855") ? attempt + NUM.ONE : (stryCov_9fa48("37855"), attempt - NUM.ONE))))); // cap at 64x
      return stryMutAct_9fa48("37856") ? Math.max(CDC_RETRY.MAX_DELAY_MS, baseDelayMs * CDC_RETRY.BACKOFF_BASE ** exp) : (stryCov_9fa48("37856"), Math.min(CDC_RETRY.MAX_DELAY_MS, stryMutAct_9fa48("37857") ? baseDelayMs / CDC_RETRY.BACKOFF_BASE ** exp : (stryCov_9fa48("37857"), baseDelayMs * CDC_RETRY.BACKOFF_BASE ** exp)));
    }
  }

  /**
   * Prefer explicit control-plane retry hints when present and fall back to
   * the standard CDC backoff otherwise.
   * @param {number} baseDelayMs
   * @param {number} attempt
   * @param {*} errorLike
   * @return {number}
   * @private
   */
  resolveTransientCdcRetryDelayMs(baseDelayMs, attempt, errorLike) {
    if (stryMutAct_9fa48("37858")) {
      {}
    } else {
      stryCov_9fa48("37858");
      const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
      if (stryMutAct_9fa48("37862") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("37861") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("37860") ? false : stryMutAct_9fa48("37859") ? true : (stryCov_9fa48("37859", "37860", "37861", "37862"), retryAfterMs > NUM.ZERO)) {
        if (stryMutAct_9fa48("37863")) {
          {}
        } else {
          stryCov_9fa48("37863");
          return retryAfterMs;
        }
      }
      return this.computeRetryDelayMs(baseDelayMs, attempt);
    }
  }

  /**
   * Determine whether a table write should wait for cache visibility.
   * Only CDC-propagated tables are guaranteed to appear in SystemTableCache.
   * @param {string} tableName - System table name.
   * @return {boolean} True when cache wait semantics apply.
   * @private
   */
  shouldWaitForCacheUpdate(tableName) {
    if (stryMutAct_9fa48("37864")) {
      {}
    } else {
      stryCov_9fa48("37864");
      return isTableInternalCachePropagationEnabled(tableName);
    }
  }

  /**
   * Wait for a system table cache update matching a primary key.
   * Used to make post-write cache visibility deterministic for callers.
   * @param {string} tableName - System table name.
   * @param {string} key - Primary key value.
   * @param {boolean} expectPresent - True if record should exist after write.
   * @param {Object} [options] - Cache wait options.
   * @param {Object} [options.expectedFields] - Exact field-value matches.
   * @param {Object} [options.minimumFields] - Minimum field thresholds.
   * @return {Promise<void>}
   * @private
   */
  async waitForCacheUpdate(tableName, key, expectPresent, options = {}) {
    if (stryMutAct_9fa48("37865")) {
      {}
    } else {
      stryCov_9fa48("37865");
      // During seed bootstrap registration, writes intentionally happen before
      // cache hydration. Waiting for cache visibility in this mode causes
      // per-write timeout delays and can stall bootstrap readiness.
      if (stryMutAct_9fa48("37867") ? false : stryMutAct_9fa48("37866") ? true : (stryCov_9fa48("37866", "37867"), this.bootstrapMode)) {
        if (stryMutAct_9fa48("37868")) {
          {}
        } else {
          stryCov_9fa48("37868");
          return buildSystemTableVisibilityResult();
        }
      }
      if (stryMutAct_9fa48("37871") ? false : stryMutAct_9fa48("37870") ? true : stryMutAct_9fa48("37869") ? this.shouldWaitForCacheUpdate(tableName) : (stryCov_9fa48("37869", "37870", "37871"), !this.shouldWaitForCacheUpdate(tableName))) {
        if (stryMutAct_9fa48("37872")) {
          {}
        } else {
          stryCov_9fa48("37872");
          return buildSystemTableVisibilityResult();
        }
      }
      const cache = this.systemTableCache;
      if (stryMutAct_9fa48("37875") ? !cache && typeof cache.onCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("37874") ? false : stryMutAct_9fa48("37873") ? true : (stryCov_9fa48("37873", "37874", "37875"), (stryMutAct_9fa48("37876") ? cache : (stryCov_9fa48("37876"), !cache)) || (stryMutAct_9fa48("37878") ? typeof cache.onCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("37877") ? false : (stryCov_9fa48("37877", "37878"), typeof cache.onCacheChange !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("37879")) {
          {}
        } else {
          stryCov_9fa48("37879");
          return buildSystemTableVisibilityResult();
        }
      }
      const expectedFields = (stryMutAct_9fa48("37882") ? options?.expectedFields || typeof options.expectedFields === TYPEOF.OBJECT : stryMutAct_9fa48("37881") ? false : stryMutAct_9fa48("37880") ? true : (stryCov_9fa48("37880", "37881", "37882"), (stryMutAct_9fa48("37883") ? options.expectedFields : (stryCov_9fa48("37883"), options?.expectedFields)) && (stryMutAct_9fa48("37885") ? typeof options.expectedFields !== TYPEOF.OBJECT : stryMutAct_9fa48("37884") ? true : (stryCov_9fa48("37884", "37885"), typeof options.expectedFields === TYPEOF.OBJECT)))) ? options.expectedFields : null;
      const minimumFields = (stryMutAct_9fa48("37888") ? options?.minimumFields || typeof options.minimumFields === TYPEOF.OBJECT : stryMutAct_9fa48("37887") ? false : stryMutAct_9fa48("37886") ? true : (stryCov_9fa48("37886", "37887", "37888"), (stryMutAct_9fa48("37889") ? options.minimumFields : (stryCov_9fa48("37889"), options?.minimumFields)) && (stryMutAct_9fa48("37891") ? typeof options.minimumFields !== TYPEOF.OBJECT : stryMutAct_9fa48("37890") ? true : (stryCov_9fa48("37890", "37891"), typeof options.minimumFields === TYPEOF.OBJECT)))) ? options.minimumFields : null;
      const normalizedExpectedFields = this.normalizeExpectedFieldsForMinimums(expectedFields, minimumFields);
      const timeoutMs = (stryMutAct_9fa48("37894") ? Number.isFinite(options?.timeoutMs) || options.timeoutMs > 0 : stryMutAct_9fa48("37893") ? false : stryMutAct_9fa48("37892") ? true : (stryCov_9fa48("37892", "37893", "37894"), Number.isFinite(stryMutAct_9fa48("37895") ? options.timeoutMs : (stryCov_9fa48("37895"), options?.timeoutMs)) && (stryMutAct_9fa48("37898") ? options.timeoutMs <= 0 : stryMutAct_9fa48("37897") ? options.timeoutMs >= 0 : stryMutAct_9fa48("37896") ? true : (stryCov_9fa48("37896", "37897", "37898"), options.timeoutMs > 0)))) ? Math.floor(options.timeoutMs) : this.cacheWaitTimeoutMs;
      const fallbackPhase = this.resolveAuthoritativeFallbackPhase(stryMutAct_9fa48("37899") ? options.fallbackPhase : (stryCov_9fa48("37899"), options?.fallbackPhase));
      const authoritativeRepairBudgetMs = stryMutAct_9fa48("37900") ? Math.min(NUM.ONE, Math.min(this.authoritativeFallbackRepairBudgetMs, Math.max(NUM.ONE, Math.floor(timeoutMs / 2)))) : (stryCov_9fa48("37900"), Math.max(NUM.ONE, stryMutAct_9fa48("37901") ? Math.max(this.authoritativeFallbackRepairBudgetMs, Math.max(NUM.ONE, Math.floor(timeoutMs / 2))) : (stryCov_9fa48("37901"), Math.min(this.authoritativeFallbackRepairBudgetMs, stryMutAct_9fa48("37902") ? Math.min(NUM.ONE, Math.floor(timeoutMs / 2)) : (stryCov_9fa48("37902"), Math.max(NUM.ONE, Math.floor(stryMutAct_9fa48("37903") ? timeoutMs * 2 : (stryCov_9fa48("37903"), timeoutMs / 2))))))));
      const cacheWaitBudgetMs = stryMutAct_9fa48("37904") ? Math.min(NUM.ONE, timeoutMs - authoritativeRepairBudgetMs) : (stryCov_9fa48("37904"), Math.max(NUM.ONE, stryMutAct_9fa48("37905") ? timeoutMs + authoritativeRepairBudgetMs : (stryCov_9fa48("37905"), timeoutMs - authoritativeRepairBudgetMs)));
      const isSatisfied = stryMutAct_9fa48("37906") ? () => undefined : (stryCov_9fa48("37906"), (() => {
        const isSatisfied = () => this.isCacheExpectationSatisfied(tableName, key, expectPresent, normalizedExpectedFields, minimumFields);
        return isSatisfied;
      })());
      if (stryMutAct_9fa48("37908") ? false : stryMutAct_9fa48("37907") ? true : (stryCov_9fa48("37907", "37908"), isSatisfied())) {
        if (stryMutAct_9fa48("37909")) {
          {}
        } else {
          stryCov_9fa48("37909");
          return buildSystemTableVisibilityResult();
        }
      }
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("37910")) {
          {}
        } else {
          stryCov_9fa48("37910");
          let settled = stryMutAct_9fa48("37911") ? true : (stryCov_9fa48("37911"), false);
          const timeoutBudget = createTimeoutBudget(stryMutAct_9fa48("37912") ? {} : (stryCov_9fa48("37912"), {
            configuredBudgetMs: timeoutMs
          }));
          const cleanup = (error = null, result = buildSystemTableVisibilityResult()) => {
            if (stryMutAct_9fa48("37913")) {
              {}
            } else {
              stryCov_9fa48("37913");
              if (stryMutAct_9fa48("37915") ? false : stryMutAct_9fa48("37914") ? true : (stryCov_9fa48("37914", "37915"), settled)) {
                if (stryMutAct_9fa48("37916")) {
                  {}
                } else {
                  stryCov_9fa48("37916");
                  return;
                }
              }
              settled = stryMutAct_9fa48("37917") ? false : (stryCov_9fa48("37917"), true);
              if (stryMutAct_9fa48("37920") ? typeof cache.offCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("37919") ? false : stryMutAct_9fa48("37918") ? true : (stryCov_9fa48("37918", "37919", "37920"), typeof cache.offCacheChange === TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("37921")) {
                  {}
                } else {
                  stryCov_9fa48("37921");
                  cache.offCacheChange(listener);
                }
              }
              if (stryMutAct_9fa48("37923") ? false : stryMutAct_9fa48("37922") ? true : (stryCov_9fa48("37922", "37923"), timer)) {
                if (stryMutAct_9fa48("37924")) {
                  {}
                } else {
                  stryCov_9fa48("37924");
                  clearTimeout(timer);
                }
              }
              if (stryMutAct_9fa48("37926") ? false : stryMutAct_9fa48("37925") ? true : (stryCov_9fa48("37925", "37926"), error)) {
                if (stryMutAct_9fa48("37927")) {
                  {}
                } else {
                  stryCov_9fa48("37927");
                  reject(error);
                  return;
                }
              }
              resolve(result);
            }
          };
          const listener = changedTable => {
            if (stryMutAct_9fa48("37928")) {
              {}
            } else {
              stryCov_9fa48("37928");
              if (stryMutAct_9fa48("37931") ? changedTable === tableName : stryMutAct_9fa48("37930") ? false : stryMutAct_9fa48("37929") ? true : (stryCov_9fa48("37929", "37930", "37931"), changedTable !== tableName)) {
                if (stryMutAct_9fa48("37932")) {
                  {}
                } else {
                  stryCov_9fa48("37932");
                  return;
                }
              }
              if (stryMutAct_9fa48("37934") ? false : stryMutAct_9fa48("37933") ? true : (stryCov_9fa48("37933", "37934"), isSatisfied())) {
                if (stryMutAct_9fa48("37935")) {
                  {}
                } else {
                  stryCov_9fa48("37935");
                  cleanup(null, buildSystemTableVisibilityResult());
                }
              }
            }
          };
          const timer = setTimeout(() => {
            if (stryMutAct_9fa48("37936")) {
              {}
            } else {
              stryCov_9fa48("37936");
              void (async () => {
                if (stryMutAct_9fa48("37937")) {
                  {}
                } else {
                  stryCov_9fa48("37937");
                  if (stryMutAct_9fa48("37939") ? false : stryMutAct_9fa48("37938") ? true : (stryCov_9fa48("37938", "37939"), isSatisfied())) {
                    if (stryMutAct_9fa48("37940")) {
                      {}
                    } else {
                      stryCov_9fa48("37940");
                      cleanup();
                      return;
                    }
                  }
                  let visibilityResult = buildSystemTableVisibilityResult(stryMutAct_9fa48("37941") ? {} : (stryCov_9fa48("37941"), {
                    visibilityState: null
                  }));
                  try {
                    if (stryMutAct_9fa48("37942")) {
                      {}
                    } else {
                      stryCov_9fa48("37942");
                      visibilityResult = await this.confirmCacheVisibilityHoleWithinBudget(tableName, key, expectPresent, normalizedExpectedFields, minimumFields, stryMutAct_9fa48("37943") ? {} : (stryCov_9fa48("37943"), {
                        fallbackPhase,
                        timeoutBudget
                      }));
                      const normalizedVisibilityResult = normalizeSystemTableVisibilityResult(visibilityResult, null);
                      if (stryMutAct_9fa48("37946") ? isSatisfied() && normalizedVisibilityResult.visible === true : stryMutAct_9fa48("37945") ? false : stryMutAct_9fa48("37944") ? true : (stryCov_9fa48("37944", "37945", "37946"), isSatisfied() || (stryMutAct_9fa48("37948") ? normalizedVisibilityResult.visible !== true : stryMutAct_9fa48("37947") ? false : (stryCov_9fa48("37947", "37948"), normalizedVisibilityResult.visible === (stryMutAct_9fa48("37949") ? false : (stryCov_9fa48("37949"), true)))))) {
                        if (stryMutAct_9fa48("37950")) {
                          {}
                        } else {
                          stryCov_9fa48("37950");
                          cleanup(null, buildSystemTableVisibilityResult(stryMutAct_9fa48("37951") ? {} : (stryCov_9fa48("37951"), {
                            ...normalizedVisibilityResult,
                            visibilityState: SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE
                          })));
                          return;
                        }
                      }
                      if (stryMutAct_9fa48("37954") ? options?.allowPendingVisibility === true || normalizedVisibilityResult.visibilityState === SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY : stryMutAct_9fa48("37953") ? false : stryMutAct_9fa48("37952") ? true : (stryCov_9fa48("37952", "37953", "37954"), (stryMutAct_9fa48("37956") ? options?.allowPendingVisibility !== true : stryMutAct_9fa48("37955") ? true : (stryCov_9fa48("37955", "37956"), (stryMutAct_9fa48("37957") ? options.allowPendingVisibility : (stryCov_9fa48("37957"), options?.allowPendingVisibility)) === (stryMutAct_9fa48("37958") ? false : (stryCov_9fa48("37958"), true)))) && (stryMutAct_9fa48("37960") ? normalizedVisibilityResult.visibilityState !== SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY : stryMutAct_9fa48("37959") ? true : (stryCov_9fa48("37959", "37960"), normalizedVisibilityResult.visibilityState === SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY)))) {
                        if (stryMutAct_9fa48("37961")) {
                          {}
                        } else {
                          stryCov_9fa48("37961");
                          cleanup(null, normalizedVisibilityResult);
                          return;
                        }
                      }
                      if (stryMutAct_9fa48("37964") ? options?.allowPendingVisibility === true || normalizedVisibilityResult.visibilityState === SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE : stryMutAct_9fa48("37963") ? false : stryMutAct_9fa48("37962") ? true : (stryCov_9fa48("37962", "37963", "37964"), (stryMutAct_9fa48("37966") ? options?.allowPendingVisibility !== true : stryMutAct_9fa48("37965") ? true : (stryCov_9fa48("37965", "37966"), (stryMutAct_9fa48("37967") ? options.allowPendingVisibility : (stryCov_9fa48("37967"), options?.allowPendingVisibility)) === (stryMutAct_9fa48("37968") ? false : (stryCov_9fa48("37968"), true)))) && (stryMutAct_9fa48("37970") ? normalizedVisibilityResult.visibilityState !== SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE : stryMutAct_9fa48("37969") ? true : (stryCov_9fa48("37969", "37970"), normalizedVisibilityResult.visibilityState === SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE)))) {
                        if (stryMutAct_9fa48("37971")) {
                          {}
                        } else {
                          stryCov_9fa48("37971");
                          cleanup(null, normalizedVisibilityResult);
                          return;
                        }
                      }
                      this.recordAuthoritativeFallbackSignal(stryMutAct_9fa48("37972") ? {} : (stryCov_9fa48("37972"), {
                        tableName,
                        key,
                        expectPresent,
                        phase: fallbackPhase,
                        outcome: AUTHORITATIVE_FALLBACK_OUTCOME.FAILED
                      }));
                    }
                  } catch (repairError) {
                    if (stryMutAct_9fa48("37973")) {
                      {}
                    } else {
                      stryCov_9fa48("37973");
                      this.recordAuthoritativeFallbackSignal(stryMutAct_9fa48("37974") ? {} : (stryCov_9fa48("37974"), {
                        tableName,
                        key,
                        expectPresent,
                        phase: fallbackPhase,
                        outcome: AUTHORITATIVE_FALLBACK_OUTCOME.FAILED
                      }));
                      this.logger.warn(stryMutAct_9fa48("37975") ? "" : (stryCov_9fa48("37975"), 'Authoritative cache repair failed after cache wait timeout'), stryMutAct_9fa48("37976") ? {} : (stryCov_9fa48("37976"), {
                        tableName,
                        key,
                        expectPresent,
                        error: stryMutAct_9fa48("37979") ? repairError?.message && String(repairError) : stryMutAct_9fa48("37978") ? false : stryMutAct_9fa48("37977") ? true : (stryCov_9fa48("37977", "37978", "37979"), (stryMutAct_9fa48("37980") ? repairError.message : (stryCov_9fa48("37980"), repairError?.message)) || String(repairError)),
                        nodeId: this.nodeId
                      }));
                    }
                  }
                  const buildCacheWaitTimeoutMessage = CDC_ERROR_MSG.CACHE_WAIT_TIMEOUT;
                  const timeoutMessage = buildCacheWaitTimeoutMessage(tableName, key, timeoutMs);
                  const timeoutError = createTimeoutBudgetError(stryMutAct_9fa48("37981") ? {} : (stryCov_9fa48("37981"), {
                    message: timeoutMessage,
                    budget: timeoutBudget,
                    classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
                    nestedOperation: stryMutAct_9fa48("37982") ? `` : (stryCov_9fa48("37982"), `cache_wait:${tableName}`)
                  }));
                  if (stryMutAct_9fa48("37985") ? typeof visibilityResult?.visibilityState !== TYPEOF.STRING : stryMutAct_9fa48("37984") ? false : stryMutAct_9fa48("37983") ? true : (stryCov_9fa48("37983", "37984", "37985"), typeof (stryMutAct_9fa48("37986") ? visibilityResult.visibilityState : (stryCov_9fa48("37986"), visibilityResult?.visibilityState)) === TYPEOF.STRING)) {
                    if (stryMutAct_9fa48("37987")) {
                      {}
                    } else {
                      stryCov_9fa48("37987");
                      timeoutError.visibilityState = visibilityResult.visibilityState;
                    }
                  }
                  if (stryMutAct_9fa48("37990") ? visibilityResult?.authoritativeVisibilityConfirmed !== true : stryMutAct_9fa48("37989") ? false : stryMutAct_9fa48("37988") ? true : (stryCov_9fa48("37988", "37989", "37990"), (stryMutAct_9fa48("37991") ? visibilityResult.authoritativeVisibilityConfirmed : (stryCov_9fa48("37991"), visibilityResult?.authoritativeVisibilityConfirmed)) === (stryMutAct_9fa48("37992") ? false : (stryCov_9fa48("37992"), true)))) {
                    if (stryMutAct_9fa48("37993")) {
                      {}
                    } else {
                      stryCov_9fa48("37993");
                      timeoutError.authoritativeVisibilityConfirmed = stryMutAct_9fa48("37994") ? false : (stryCov_9fa48("37994"), true);
                    }
                  }
                  if (stryMutAct_9fa48("37997") ? typeof visibilityResult?.pressureAction !== TYPEOF.STRING : stryMutAct_9fa48("37996") ? false : stryMutAct_9fa48("37995") ? true : (stryCov_9fa48("37995", "37996", "37997"), typeof (stryMutAct_9fa48("37998") ? visibilityResult.pressureAction : (stryCov_9fa48("37998"), visibilityResult?.pressureAction)) === TYPEOF.STRING)) {
                    if (stryMutAct_9fa48("37999")) {
                      {}
                    } else {
                      stryCov_9fa48("37999");
                      timeoutError.pressureAction = visibilityResult.pressureAction;
                    }
                  }
                  if (stryMutAct_9fa48("38002") ? typeof visibilityResult?.pressureReason !== TYPEOF.STRING : stryMutAct_9fa48("38001") ? false : stryMutAct_9fa48("38000") ? true : (stryCov_9fa48("38000", "38001", "38002"), typeof (stryMutAct_9fa48("38003") ? visibilityResult.pressureReason : (stryCov_9fa48("38003"), visibilityResult?.pressureReason)) === TYPEOF.STRING)) {
                    if (stryMutAct_9fa48("38004")) {
                      {}
                    } else {
                      stryCov_9fa48("38004");
                      timeoutError.pressureReason = visibilityResult.pressureReason;
                    }
                  }
                  if (stryMutAct_9fa48("38006") ? false : stryMutAct_9fa48("38005") ? true : (stryCov_9fa48("38005", "38006"), Number.isFinite(stryMutAct_9fa48("38007") ? visibilityResult.retryAfterMs : (stryCov_9fa48("38007"), visibilityResult?.retryAfterMs)))) {
                    if (stryMutAct_9fa48("38008")) {
                      {}
                    } else {
                      stryCov_9fa48("38008");
                      timeoutError.retryAfterMs = visibilityResult.retryAfterMs;
                      if (stryMutAct_9fa48("38012") ? timeoutError.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("38011") ? timeoutError.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("38010") ? false : stryMutAct_9fa48("38009") ? true : (stryCov_9fa48("38009", "38010", "38011", "38012"), timeoutError.retryAfterMs > NUM.ZERO)) {
                        if (stryMutAct_9fa48("38013")) {
                          {}
                        } else {
                          stryCov_9fa48("38013");
                          timeoutError.deferRetry = stryMutAct_9fa48("38014") ? false : (stryCov_9fa48("38014"), true);
                        }
                      }
                    }
                  }
                  cleanup(timeoutError);
                }
              })();
            }
          }, cacheWaitBudgetMs);
          cache.onCacheChange(listener);
        }
      });
    }
  }
  async confirmCacheVisibilityHoleWithinBudget(tableName, key, expectPresent, expectedFields = null, minimumFields = null, options = {}) {
    if (stryMutAct_9fa48("38015")) {
      {}
    } else {
      stryCov_9fa48("38015");
      let lastResult = buildSystemTableVisibilityResult(stryMutAct_9fa48("38016") ? {} : (stryCov_9fa48("38016"), {
        visibilityState: null
      }));
      const maxAttempts = 2;
      for (let attempt = NUM.ONE; stryMutAct_9fa48("38019") ? attempt > maxAttempts : stryMutAct_9fa48("38018") ? attempt < maxAttempts : stryMutAct_9fa48("38017") ? false : (stryCov_9fa48("38017", "38018", "38019"), attempt <= maxAttempts); stryMutAct_9fa48("38020") ? attempt -= NUM.ONE : (stryCov_9fa48("38020"), attempt += NUM.ONE)) {
        if (stryMutAct_9fa48("38021")) {
          {}
        } else {
          stryCov_9fa48("38021");
          lastResult = normalizeSystemTableVisibilityResult(await this.repairCacheVisibilityHole(tableName, key, expectPresent, expectedFields, minimumFields, options), null);
          if (stryMutAct_9fa48("38024") ? lastResult.authoritativeVisibilityConfirmed === true && lastResult.visibilityState === SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE : stryMutAct_9fa48("38023") ? false : stryMutAct_9fa48("38022") ? true : (stryCov_9fa48("38022", "38023", "38024"), (stryMutAct_9fa48("38026") ? lastResult.authoritativeVisibilityConfirmed !== true : stryMutAct_9fa48("38025") ? false : (stryCov_9fa48("38025", "38026"), lastResult.authoritativeVisibilityConfirmed === (stryMutAct_9fa48("38027") ? false : (stryCov_9fa48("38027"), true)))) || (stryMutAct_9fa48("38029") ? lastResult.visibilityState !== SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE : stryMutAct_9fa48("38028") ? false : (stryCov_9fa48("38028", "38029"), lastResult.visibilityState === SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE)))) {
            if (stryMutAct_9fa48("38030")) {
              {}
            } else {
              stryCov_9fa48("38030");
              return lastResult;
            }
          }
          const remainingBudgetMs = getRemainingBudgetMs(stryMutAct_9fa48("38031") ? options.timeoutBudget : (stryCov_9fa48("38031"), options?.timeoutBudget), stryMutAct_9fa48("38032") ? {} : (stryCov_9fa48("38032"), {
            now: this.now
          }));
          if (stryMutAct_9fa48("38035") ? attempt >= maxAttempts && remainingBudgetMs <= NUM.ZERO : stryMutAct_9fa48("38034") ? false : stryMutAct_9fa48("38033") ? true : (stryCov_9fa48("38033", "38034", "38035"), (stryMutAct_9fa48("38038") ? attempt < maxAttempts : stryMutAct_9fa48("38037") ? attempt > maxAttempts : stryMutAct_9fa48("38036") ? false : (stryCov_9fa48("38036", "38037", "38038"), attempt >= maxAttempts)) || (stryMutAct_9fa48("38041") ? remainingBudgetMs > NUM.ZERO : stryMutAct_9fa48("38040") ? remainingBudgetMs < NUM.ZERO : stryMutAct_9fa48("38039") ? false : (stryCov_9fa48("38039", "38040", "38041"), remainingBudgetMs <= NUM.ZERO)))) {
            if (stryMutAct_9fa48("38042")) {
              {}
            } else {
              stryCov_9fa48("38042");
              break;
            }
          }
          await delay(stryMutAct_9fa48("38043") ? Math.max(this.authoritativeFallbackRetryDelayMs, remainingBudgetMs) : (stryCov_9fa48("38043"), Math.min(this.authoritativeFallbackRetryDelayMs, remainingBudgetMs)));
        }
      }
      return lastResult;
    }
  }

  /**
   * Check whether the local cache currently satisfies a write expectation.
   * @param {string} tableName
   * @param {string} key
   * @param {boolean} expectPresent
   * @param {Object|null} expectedFields
   * @param {Object|null} minimumFields
   * @return {boolean}
   * @private
   */
  isCacheExpectationSatisfied(tableName, key, expectPresent, expectedFields = null, minimumFields = null) {
    if (stryMutAct_9fa48("38044")) {
      {}
    } else {
      stryCov_9fa48("38044");
      const present = this.hasCacheRecord(tableName, key);
      if (stryMutAct_9fa48("38047") ? expectPresent || !present : stryMutAct_9fa48("38046") ? false : stryMutAct_9fa48("38045") ? true : (stryCov_9fa48("38045", "38046", "38047"), expectPresent && (stryMutAct_9fa48("38048") ? present : (stryCov_9fa48("38048"), !present)))) {
        if (stryMutAct_9fa48("38049")) {
          {}
        } else {
          stryCov_9fa48("38049");
          return stryMutAct_9fa48("38050") ? true : (stryCov_9fa48("38050"), false);
        }
      }
      if (stryMutAct_9fa48("38053") ? !expectPresent || !present : stryMutAct_9fa48("38052") ? false : stryMutAct_9fa48("38051") ? true : (stryCov_9fa48("38051", "38052", "38053"), (stryMutAct_9fa48("38054") ? expectPresent : (stryCov_9fa48("38054"), !expectPresent)) && (stryMutAct_9fa48("38055") ? present : (stryCov_9fa48("38055"), !present)))) {
        if (stryMutAct_9fa48("38056")) {
          {}
        } else {
          stryCov_9fa48("38056");
          return stryMutAct_9fa48("38057") ? false : (stryCov_9fa48("38057"), true);
        }
      }
      if (stryMutAct_9fa48("38060") ? false : stryMutAct_9fa48("38059") ? true : stryMutAct_9fa48("38058") ? expectPresent : (stryCov_9fa48("38058", "38059", "38060"), !expectPresent)) {
        if (stryMutAct_9fa48("38061")) {
          {}
        } else {
          stryCov_9fa48("38061");
          return stryMutAct_9fa48("38062") ? true : (stryCov_9fa48("38062"), false);
        }
      }
      const record = this.getCacheRecord(tableName, key);
      return stryMutAct_9fa48("38065") ? this.doesCacheRecordMatchExpectedFields(record, expectedFields) || this.doesCacheRecordMeetMinimumFields(record, minimumFields) : stryMutAct_9fa48("38064") ? false : stryMutAct_9fa48("38063") ? true : (stryCov_9fa48("38063", "38064", "38065"), this.doesCacheRecordMatchExpectedFields(record, expectedFields) && this.doesCacheRecordMeetMinimumFields(record, minimumFields));
    }
  }

  /**
   * Determine whether the local cache has one record.
   * @param {string} tableName
   * @param {string} key
   * @return {boolean}
   * @private
   */
  hasCacheRecord(tableName, key) {
    if (stryMutAct_9fa48("38066")) {
      {}
    } else {
      stryCov_9fa48("38066");
      const cache = this.systemTableCache;
      if (stryMutAct_9fa48("38069") ? false : stryMutAct_9fa48("38068") ? true : stryMutAct_9fa48("38067") ? cache : (stryCov_9fa48("38067", "38068", "38069"), !cache)) {
        if (stryMutAct_9fa48("38070")) {
          {}
        } else {
          stryCov_9fa48("38070");
          return stryMutAct_9fa48("38071") ? true : (stryCov_9fa48("38071"), false);
        }
      }
      if (stryMutAct_9fa48("38074") ? typeof cache.has !== TYPEOF.FUNCTION : stryMutAct_9fa48("38073") ? false : stryMutAct_9fa48("38072") ? true : (stryCov_9fa48("38072", "38073", "38074"), typeof cache.has === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("38075")) {
          {}
        } else {
          stryCov_9fa48("38075");
          return cache.has(tableName, key);
        }
      }
      if (stryMutAct_9fa48("38078") ? typeof cache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("38077") ? false : stryMutAct_9fa48("38076") ? true : (stryCov_9fa48("38076", "38077", "38078"), typeof cache.get === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("38079")) {
          {}
        } else {
          stryCov_9fa48("38079");
          return Boolean(cache.get(tableName, key));
        }
      }
      return stryMutAct_9fa48("38080") ? true : (stryCov_9fa48("38080"), false);
    }
  }

  /**
   * Get one record from the local cache when available.
   * @param {string} tableName
   * @param {string} key
   * @return {Object|undefined}
   * @private
   */
  getCacheRecord(tableName, key) {
    if (stryMutAct_9fa48("38081")) {
      {}
    } else {
      stryCov_9fa48("38081");
      const cache = this.systemTableCache;
      if (stryMutAct_9fa48("38084") ? !cache && typeof cache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("38083") ? false : stryMutAct_9fa48("38082") ? true : (stryCov_9fa48("38082", "38083", "38084"), (stryMutAct_9fa48("38085") ? cache : (stryCov_9fa48("38085"), !cache)) || (stryMutAct_9fa48("38087") ? typeof cache.get === TYPEOF.FUNCTION : stryMutAct_9fa48("38086") ? false : (stryCov_9fa48("38086", "38087"), typeof cache.get !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("38088")) {
          {}
        } else {
          stryCov_9fa48("38088");
          return undefined;
        }
      }
      return cache.get(tableName, key);
    }
  }

  /**
    * Confirm one cache visibility gap authoritatively, emit divergence
    * diagnostics, and repair the local projection when a writable cache
    * target is available.
   * @param {string} tableName
   * @param {string} key
   * @param {boolean} expectPresent
   * @param {Object|null} expectedFields
   * @param {Object|null} minimumFields
   * @return {Promise<boolean>} True when authoritative state confirms the write.
   * @private
   */
  async repairCacheVisibilityHole(tableName, key, expectPresent, expectedFields = null, minimumFields = null, options = {}) {
    if (stryMutAct_9fa48("38089")) {
      {}
    } else {
      stryCov_9fa48("38089");
      if (stryMutAct_9fa48("38092") ? false : stryMutAct_9fa48("38091") ? true : stryMutAct_9fa48("38090") ? this.shouldWaitForCacheUpdate(tableName) : (stryCov_9fa48("38090", "38091", "38092"), !this.shouldWaitForCacheUpdate(tableName))) {
        if (stryMutAct_9fa48("38093")) {
          {}
        } else {
          stryCov_9fa48("38093");
          return buildSystemTableVisibilityResult();
        }
      }
      const primaryKeyField = this.getPrimaryKeyField(tableName);
      const queryResult = await this.executeAuthoritativeSystemTableRead(tableName, stryMutAct_9fa48("38094") ? `` : (stryCov_9fa48("38094"), `SELECT * FROM ${tableName} WHERE ${primaryKeyField} = ?`), stryMutAct_9fa48("38095") ? [] : (stryCov_9fa48("38095"), [key]));
      if (stryMutAct_9fa48("38098") ? false : stryMutAct_9fa48("38097") ? true : stryMutAct_9fa48("38096") ? queryResult?.success : (stryCov_9fa48("38096", "38097", "38098"), !(stryMutAct_9fa48("38099") ? queryResult.success : (stryCov_9fa48("38099"), queryResult?.success)))) {
        if (stryMutAct_9fa48("38100")) {
          {}
        } else {
          stryCov_9fa48("38100");
          const retryAfterMs = getControlPlaneRetryAfterMs(queryResult);
          if (stryMutAct_9fa48("38103") ? (retryAfterMs > NUM.ZERO || queryResult?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER || queryResult?.pressureAction === PRESSURE_GOVERNOR_ACTION.REJECT) && isRetryableControlPlaneError(queryResult) : stryMutAct_9fa48("38102") ? false : stryMutAct_9fa48("38101") ? true : (stryCov_9fa48("38101", "38102", "38103"), (stryMutAct_9fa48("38105") ? (retryAfterMs > NUM.ZERO || queryResult?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER) && queryResult?.pressureAction === PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("38104") ? false : (stryCov_9fa48("38104", "38105"), (stryMutAct_9fa48("38107") ? retryAfterMs > NUM.ZERO && queryResult?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("38106") ? false : (stryCov_9fa48("38106", "38107"), (stryMutAct_9fa48("38110") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("38109") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("38108") ? false : (stryCov_9fa48("38108", "38109", "38110"), retryAfterMs > NUM.ZERO)) || (stryMutAct_9fa48("38112") ? queryResult?.pressureAction !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("38111") ? false : (stryCov_9fa48("38111", "38112"), (stryMutAct_9fa48("38113") ? queryResult.pressureAction : (stryCov_9fa48("38113"), queryResult?.pressureAction)) === PRESSURE_GOVERNOR_ACTION.DEFER)))) || (stryMutAct_9fa48("38115") ? queryResult?.pressureAction !== PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("38114") ? false : (stryCov_9fa48("38114", "38115"), (stryMutAct_9fa48("38116") ? queryResult.pressureAction : (stryCov_9fa48("38116"), queryResult?.pressureAction)) === PRESSURE_GOVERNOR_ACTION.REJECT)))) || isRetryableControlPlaneError(queryResult))) {
            if (stryMutAct_9fa48("38117")) {
              {}
            } else {
              stryCov_9fa48("38117");
              return buildSystemTableVisibilityResult(stryMutAct_9fa48("38118") ? {} : (stryCov_9fa48("38118"), {
                visibilityState: SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE,
                retryAfterMs,
                pressureAction: stryMutAct_9fa48("38119") ? queryResult.pressureAction : (stryCov_9fa48("38119"), queryResult?.pressureAction),
                pressureReason: stryMutAct_9fa48("38120") ? queryResult.pressureReason : (stryCov_9fa48("38120"), queryResult?.pressureReason)
              }));
            }
          }
          return buildSystemTableVisibilityResult(stryMutAct_9fa48("38121") ? {} : (stryCov_9fa48("38121"), {
            visibilityState: null
          }));
        }
      }
      const rows = Array.isArray(queryResult.rows) ? queryResult.rows : stryMutAct_9fa48("38122") ? ["Stryker was here"] : (stryCov_9fa48("38122"), []);
      const cachedRecord = this.getCacheRecord(tableName, key);
      const phase = this.resolveAuthoritativeFallbackPhase(stryMutAct_9fa48("38123") ? options.fallbackPhase : (stryCov_9fa48("38123"), options?.fallbackPhase));
      if (stryMutAct_9fa48("38125") ? false : stryMutAct_9fa48("38124") ? true : (stryCov_9fa48("38124", "38125"), expectPresent)) {
        if (stryMutAct_9fa48("38126")) {
          {}
        } else {
          stryCov_9fa48("38126");
          const matchingRow = stryMutAct_9fa48("38129") ? rows.find(row => {
            return this.doesCacheRecordMatchExpectedFields(row, expectedFields) && this.doesCacheRecordMeetMinimumFields(row, minimumFields);
          }) && null : stryMutAct_9fa48("38128") ? false : stryMutAct_9fa48("38127") ? true : (stryCov_9fa48("38127", "38128", "38129"), rows.find(row => {
            if (stryMutAct_9fa48("38130")) {
              {}
            } else {
              stryCov_9fa48("38130");
              return stryMutAct_9fa48("38133") ? this.doesCacheRecordMatchExpectedFields(row, expectedFields) || this.doesCacheRecordMeetMinimumFields(row, minimumFields) : stryMutAct_9fa48("38132") ? false : stryMutAct_9fa48("38131") ? true : (stryCov_9fa48("38131", "38132", "38133"), this.doesCacheRecordMatchExpectedFields(row, expectedFields) && this.doesCacheRecordMeetMinimumFields(row, minimumFields));
            }
          }) || null);
          if (stryMutAct_9fa48("38136") ? false : stryMutAct_9fa48("38135") ? true : stryMutAct_9fa48("38134") ? matchingRow : (stryCov_9fa48("38134", "38135", "38136"), !matchingRow)) {
            if (stryMutAct_9fa48("38137")) {
              {}
            } else {
              stryCov_9fa48("38137");
              return buildSystemTableVisibilityResult(stryMutAct_9fa48("38138") ? {} : (stryCov_9fa48("38138"), {
                visibilityState: null
              }));
            }
          }
          let cacheRepaired = stryMutAct_9fa48("38139") ? true : (stryCov_9fa48("38139"), false);
          if (stryMutAct_9fa48("38142") ? false : stryMutAct_9fa48("38141") ? true : stryMutAct_9fa48("38140") ? this.isCacheExpectationSatisfied(tableName, key, expectPresent, expectedFields, minimumFields) : (stryCov_9fa48("38140", "38141", "38142"), !this.isCacheExpectationSatisfied(tableName, key, expectPresent, expectedFields, minimumFields))) {
            if (stryMutAct_9fa48("38143")) {
              {}
            } else {
              stryCov_9fa48("38143");
              this.emitCacheVisibilityDivergence(tableName, key, READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING, stryMutAct_9fa48("38146") ? cachedRecord && null : stryMutAct_9fa48("38145") ? false : stryMutAct_9fa48("38144") ? true : (stryCov_9fa48("38144", "38145", "38146"), cachedRecord || null), matchingRow, this.buildCacheVisibilityDivergentFields(primaryKeyField, expectedFields, minimumFields), phase);
              cacheRepaired = this.applyAuthoritativeCacheRepair(tableName, CDC_OPERATION.UPSERT, matchingRow, key);
            }
          }
          const cacheExpectationSatisfied = this.isCacheExpectationSatisfied(tableName, key, expectPresent, expectedFields, minimumFields);
          const visibilityState = cacheExpectationSatisfied ? SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE : SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY;
          this.recordAuthoritativeFallbackSignal(stryMutAct_9fa48("38147") ? {} : (stryCov_9fa48("38147"), {
            tableName,
            key,
            expectPresent,
            phase,
            outcome: resolveAuthoritativeFallbackOutcome(stryMutAct_9fa48("38150") ? cacheRepaired || cacheExpectationSatisfied : stryMutAct_9fa48("38149") ? false : stryMutAct_9fa48("38148") ? true : (stryCov_9fa48("38148", "38149", "38150"), cacheRepaired && cacheExpectationSatisfied))
          }));
          return buildSystemTableVisibilityResult(stryMutAct_9fa48("38151") ? {} : (stryCov_9fa48("38151"), {
            visibilityState,
            authoritativeVisibilityConfirmed: stryMutAct_9fa48("38152") ? false : (stryCov_9fa48("38152"), true),
            cacheRepaired
          }));
        }
      }
      if (stryMutAct_9fa48("38156") ? rows.length <= NUM.ZERO : stryMutAct_9fa48("38155") ? rows.length >= NUM.ZERO : stryMutAct_9fa48("38154") ? false : stryMutAct_9fa48("38153") ? true : (stryCov_9fa48("38153", "38154", "38155", "38156"), rows.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("38157")) {
          {}
        } else {
          stryCov_9fa48("38157");
          return buildSystemTableVisibilityResult(stryMutAct_9fa48("38158") ? {} : (stryCov_9fa48("38158"), {
            visibilityState: null
          }));
        }
      }
      let cacheRepaired = stryMutAct_9fa48("38159") ? true : (stryCov_9fa48("38159"), false);
      if (stryMutAct_9fa48("38161") ? false : stryMutAct_9fa48("38160") ? true : (stryCov_9fa48("38160", "38161"), cachedRecord)) {
        if (stryMutAct_9fa48("38162")) {
          {}
        } else {
          stryCov_9fa48("38162");
          this.emitCacheVisibilityDivergence(tableName, key, READ_MODEL_DIVERGENCE_TYPE.AUTHORITATIVE_MISSING, cachedRecord, null, stryMutAct_9fa48("38163") ? [] : (stryCov_9fa48("38163"), [primaryKeyField]), phase);
          cacheRepaired = this.applyAuthoritativeCacheRepair(tableName, CDC_OPERATION.DELETE, stryMutAct_9fa48("38164") ? {} : (stryCov_9fa48("38164"), {
            [primaryKeyField]: key
          }), key);
        }
      }
      const authoritativeAbsentRecovered = stryMutAct_9fa48("38167") ? cacheRepaired || !this.hasCacheRecord(tableName, key) : stryMutAct_9fa48("38166") ? false : stryMutAct_9fa48("38165") ? true : (stryCov_9fa48("38165", "38166", "38167"), cacheRepaired && (stryMutAct_9fa48("38168") ? this.hasCacheRecord(tableName, key) : (stryCov_9fa48("38168"), !this.hasCacheRecord(tableName, key))));
      this.recordAuthoritativeFallbackSignal(stryMutAct_9fa48("38169") ? {} : (stryCov_9fa48("38169"), {
        tableName,
        key,
        expectPresent,
        phase,
        outcome: resolveAuthoritativeFallbackOutcome(authoritativeAbsentRecovered)
      }));
      return buildSystemTableVisibilityResult(stryMutAct_9fa48("38170") ? {} : (stryCov_9fa48("38170"), {
        visibilityState: this.hasCacheRecord(tableName, key) ? SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY : SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
        authoritativeVisibilityConfirmed: stryMutAct_9fa48("38171") ? false : (stryCov_9fa48("38171"), true),
        cacheRepaired
      }));
    }
  }

  /**
   * Apply one authoritative repair row into the writable cache target.
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} row
   * @param {string} key
   * @return {boolean}
   * @private
   */
  applyAuthoritativeCacheRepair(tableName, operation, row, key) {
    if (stryMutAct_9fa48("38172")) {
      {}
    } else {
      stryCov_9fa48("38172");
      if (stryMutAct_9fa48("38175") ? (!this.cacheMutationTarget || typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION || !row) && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("38174") ? false : stryMutAct_9fa48("38173") ? true : (stryCov_9fa48("38173", "38174", "38175"), (stryMutAct_9fa48("38177") ? (!this.cacheMutationTarget || typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION) && !row : stryMutAct_9fa48("38176") ? false : (stryCov_9fa48("38176", "38177"), (stryMutAct_9fa48("38179") ? !this.cacheMutationTarget && typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("38178") ? false : (stryCov_9fa48("38178", "38179"), (stryMutAct_9fa48("38180") ? this.cacheMutationTarget : (stryCov_9fa48("38180"), !this.cacheMutationTarget)) || (stryMutAct_9fa48("38182") ? typeof this.cacheMutationTarget.applySystemTableChange === TYPEOF.FUNCTION : stryMutAct_9fa48("38181") ? false : (stryCov_9fa48("38181", "38182"), typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("38183") ? row : (stryCov_9fa48("38183"), !row)))) || (stryMutAct_9fa48("38185") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("38184") ? false : (stryCov_9fa48("38184", "38185"), typeof row !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("38186")) {
          {}
        } else {
          stryCov_9fa48("38186");
          return stryMutAct_9fa48("38187") ? true : (stryCov_9fa48("38187"), false);
        }
      }
      const canonicalRow = canonicalizeSystemTableRow(tableName, row);
      const causeId = stryMutAct_9fa48("38188") ? `` : (stryCov_9fa48("38188"), `authoritative-repair:${tableName}:${key}`);
      this.cacheMutationTarget.applySystemTableChange(tableName, operation, canonicalRow, stryMutAct_9fa48("38189") ? {} : (stryCov_9fa48("38189"), {
        causeId
      }));
      return stryMutAct_9fa48("38190") ? false : (stryCov_9fa48("38190"), true);
    }
  }

  /**
   * Resolve authoritative fallback phase from optional runtime context.
   * @param {string|undefined|null} phase
   * @return {string}
   * @private
   */
  resolveAuthoritativeFallbackPhase(phase) {
    if (stryMutAct_9fa48("38191")) {
      {}
    } else {
      stryCov_9fa48("38191");
      if (stryMutAct_9fa48("38194") ? typeof phase === TYPEOF.STRING || phase.length > NUM.ZERO : stryMutAct_9fa48("38193") ? false : stryMutAct_9fa48("38192") ? true : (stryCov_9fa48("38192", "38193", "38194"), (stryMutAct_9fa48("38196") ? typeof phase !== TYPEOF.STRING : stryMutAct_9fa48("38195") ? true : (stryCov_9fa48("38195", "38196"), typeof phase === TYPEOF.STRING)) && (stryMutAct_9fa48("38199") ? phase.length <= NUM.ZERO : stryMutAct_9fa48("38198") ? phase.length >= NUM.ZERO : stryMutAct_9fa48("38197") ? true : (stryCov_9fa48("38197", "38198", "38199"), phase.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("38200")) {
          {}
        } else {
          stryCov_9fa48("38200");
          return normalizeAuthoritativeFallbackPhase(phase);
        }
      }
      if (stryMutAct_9fa48("38202") ? false : stryMutAct_9fa48("38201") ? true : (stryCov_9fa48("38201", "38202"), this.bootstrapMode)) {
        if (stryMutAct_9fa48("38203")) {
          {}
        } else {
          stryCov_9fa48("38203");
          return AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP;
        }
      }
      return AUTHORITATIVE_FALLBACK_PHASE.STEADY_STATE;
    }
  }

  /**
   * Remove authoritative fallback samples that are older than the active window.
   * @param {number} nowMs
   * @private
   */
  pruneAuthoritativeFallbackHistory(nowMs) {
    if (stryMutAct_9fa48("38204")) {
      {}
    } else {
      stryCov_9fa48("38204");
      const threshold = stryMutAct_9fa48("38205") ? nowMs + this.authoritativeFallbackWindowMs : (stryCov_9fa48("38205"), nowMs - this.authoritativeFallbackWindowMs);
      this.authoritativeFallbackHistory = stryMutAct_9fa48("38206") ? this.authoritativeFallbackHistory : (stryCov_9fa48("38206"), this.authoritativeFallbackHistory.filter(stryMutAct_9fa48("38207") ? () => undefined : (stryCov_9fa48("38207"), entry => stryMutAct_9fa48("38211") ? entry.recordedAt < threshold : stryMutAct_9fa48("38210") ? entry.recordedAt > threshold : stryMutAct_9fa48("38209") ? false : stryMutAct_9fa48("38208") ? true : (stryCov_9fa48("38208", "38209", "38210", "38211"), entry.recordedAt >= threshold))));
    }
  }

  /**
   * Record one authoritative fallback signal for diagnostics and strict gating.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  recordAuthoritativeFallbackSignal(options = {}) {
    if (stryMutAct_9fa48("38212")) {
      {}
    } else {
      stryCov_9fa48("38212");
      const nowMs = Date.now();
      const tableName = String(stryMutAct_9fa48("38215") ? options.tableName && '' : stryMutAct_9fa48("38214") ? false : stryMutAct_9fa48("38213") ? true : (stryCov_9fa48("38213", "38214", "38215"), options.tableName || (stryMutAct_9fa48("38216") ? "Stryker was here!" : (stryCov_9fa48("38216"), ''))));
      const rowKey = String(stryMutAct_9fa48("38219") ? options.key && '' : stryMutAct_9fa48("38218") ? false : stryMutAct_9fa48("38217") ? true : (stryCov_9fa48("38217", "38218", "38219"), options.key || (stryMutAct_9fa48("38220") ? "Stryker was here!" : (stryCov_9fa48("38220"), ''))));
      const phase = this.resolveAuthoritativeFallbackPhase(options.phase);
      const outcome = normalizeAuthoritativeFallbackOutcome(options.outcome);
      const identity = stryMutAct_9fa48("38221") ? `` : (stryCov_9fa48("38221"), `${tableName}:${rowKey}:${phase}:${outcome}`);
      const totalEntry = stryMutAct_9fa48("38224") ? this.authoritativeFallbackTotals.get(identity) && {
        tableName,
        rowKey,
        phase,
        outcome,
        totalCount: NUM.ZERO,
        lastRecordedAt: NUM.ZERO
      } : stryMutAct_9fa48("38223") ? false : stryMutAct_9fa48("38222") ? true : (stryCov_9fa48("38222", "38223", "38224"), this.authoritativeFallbackTotals.get(identity) || (stryMutAct_9fa48("38225") ? {} : (stryCov_9fa48("38225"), {
        tableName,
        rowKey,
        phase,
        outcome,
        totalCount: NUM.ZERO,
        lastRecordedAt: NUM.ZERO
      })));
      stryMutAct_9fa48("38226") ? totalEntry.totalCount -= NUM.ONE : (stryCov_9fa48("38226"), totalEntry.totalCount += NUM.ONE);
      totalEntry.lastRecordedAt = nowMs;
      this.authoritativeFallbackTotals.set(identity, totalEntry);
      this.authoritativeFallbackHistory.push(stryMutAct_9fa48("38227") ? {} : (stryCov_9fa48("38227"), {
        tableName,
        rowKey,
        nodeId: this.nodeId,
        expectPresent: stryMutAct_9fa48("38230") ? options.expectPresent !== true : stryMutAct_9fa48("38229") ? false : stryMutAct_9fa48("38228") ? true : (stryCov_9fa48("38228", "38229", "38230"), options.expectPresent === (stryMutAct_9fa48("38231") ? false : (stryCov_9fa48("38231"), true))),
        phase,
        outcome,
        recordedAt: nowMs
      }));
      this.pruneAuthoritativeFallbackHistory(nowMs);
      let windowCount = NUM.ZERO;
      for (const entry of this.authoritativeFallbackHistory) {
        if (stryMutAct_9fa48("38232")) {
          {}
        } else {
          stryCov_9fa48("38232");
          if (stryMutAct_9fa48("38235") ? entry.tableName === tableName && entry.rowKey === rowKey && entry.phase === phase || entry.outcome === outcome : stryMutAct_9fa48("38234") ? false : stryMutAct_9fa48("38233") ? true : (stryCov_9fa48("38233", "38234", "38235"), (stryMutAct_9fa48("38237") ? entry.tableName === tableName && entry.rowKey === rowKey || entry.phase === phase : stryMutAct_9fa48("38236") ? true : (stryCov_9fa48("38236", "38237"), (stryMutAct_9fa48("38239") ? entry.tableName === tableName || entry.rowKey === rowKey : stryMutAct_9fa48("38238") ? true : (stryCov_9fa48("38238", "38239"), (stryMutAct_9fa48("38241") ? entry.tableName !== tableName : stryMutAct_9fa48("38240") ? true : (stryCov_9fa48("38240", "38241"), entry.tableName === tableName)) && (stryMutAct_9fa48("38243") ? entry.rowKey !== rowKey : stryMutAct_9fa48("38242") ? true : (stryCov_9fa48("38242", "38243"), entry.rowKey === rowKey)))) && (stryMutAct_9fa48("38245") ? entry.phase !== phase : stryMutAct_9fa48("38244") ? true : (stryCov_9fa48("38244", "38245"), entry.phase === phase)))) && (stryMutAct_9fa48("38247") ? entry.outcome !== outcome : stryMutAct_9fa48("38246") ? true : (stryCov_9fa48("38246", "38247"), entry.outcome === outcome)))) {
            if (stryMutAct_9fa48("38248")) {
              {}
            } else {
              stryCov_9fa48("38248");
              stryMutAct_9fa48("38249") ? windowCount -= NUM.ONE : (stryCov_9fa48("38249"), windowCount += NUM.ONE);
            }
          }
        }
      }
      return stryMutAct_9fa48("38250") ? {} : (stryCov_9fa48("38250"), {
        tableName,
        rowKey,
        nodeId: this.nodeId,
        expectPresent: stryMutAct_9fa48("38253") ? options.expectPresent !== true : stryMutAct_9fa48("38252") ? false : stryMutAct_9fa48("38251") ? true : (stryCov_9fa48("38251", "38252", "38253"), options.expectPresent === (stryMutAct_9fa48("38254") ? false : (stryCov_9fa48("38254"), true))),
        phase,
        outcome,
        windowCount,
        windowRatePerMinute: stryMutAct_9fa48("38255") ? windowCount / this.authoritativeFallbackWindowMs * CDC_INTEGRATION_SERVICE_LITERAL.VALUE_60 / CDC_INTEGRATION_SERVICE_LITERAL.VALUE_1000 : (stryCov_9fa48("38255"), (stryMutAct_9fa48("38256") ? windowCount / this.authoritativeFallbackWindowMs / CDC_INTEGRATION_SERVICE_LITERAL.VALUE_60 : (stryCov_9fa48("38256"), (stryMutAct_9fa48("38257") ? windowCount * this.authoritativeFallbackWindowMs : (stryCov_9fa48("38257"), windowCount / this.authoritativeFallbackWindowMs)) * CDC_INTEGRATION_SERVICE_LITERAL.VALUE_60)) * CDC_INTEGRATION_SERVICE_LITERAL.VALUE_1000),
        recordedAt: nowMs
      });
    }
  }

  /**
   * Summarize authoritative fallback diagnostics for local runtime export.
   * @return {Object}
   */
  getAuthoritativeFallbackDiagnostics() {
    if (stryMutAct_9fa48("38258")) {
      {}
    } else {
      stryCov_9fa48("38258");
      const nowMs = Date.now();
      this.pruneAuthoritativeFallbackHistory(nowMs);
      const phases = stryMutAct_9fa48("38259") ? {} : (stryCov_9fa48("38259"), {
        [AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP]: stryMutAct_9fa48("38260") ? {} : (stryCov_9fa48("38260"), {
          windowCount: NUM.ZERO,
          totalCount: NUM.ZERO
        }),
        [AUTHORITATIVE_FALLBACK_PHASE.RECOVERY]: stryMutAct_9fa48("38261") ? {} : (stryCov_9fa48("38261"), {
          windowCount: NUM.ZERO,
          totalCount: NUM.ZERO
        }),
        [AUTHORITATIVE_FALLBACK_PHASE.STEADY_STATE]: stryMutAct_9fa48("38262") ? {} : (stryCov_9fa48("38262"), {
          windowCount: NUM.ZERO,
          totalCount: NUM.ZERO
        })
      });
      const outcomes = stryMutAct_9fa48("38263") ? {} : (stryCov_9fa48("38263"), {
        [AUTHORITATIVE_FALLBACK_OUTCOME.RECOVERED]: stryMutAct_9fa48("38264") ? {} : (stryCov_9fa48("38264"), {
          windowCount: NUM.ZERO,
          totalCount: NUM.ZERO
        }),
        [AUTHORITATIVE_FALLBACK_OUTCOME.DIAGNOSED]: stryMutAct_9fa48("38265") ? {} : (stryCov_9fa48("38265"), {
          windowCount: NUM.ZERO,
          totalCount: NUM.ZERO
        }),
        [AUTHORITATIVE_FALLBACK_OUTCOME.FAILED]: stryMutAct_9fa48("38266") ? {} : (stryCov_9fa48("38266"), {
          windowCount: NUM.ZERO,
          totalCount: NUM.ZERO
        })
      });
      const byTable = {};
      let totalCount = NUM.ZERO;
      for (const totalEntry of this.authoritativeFallbackTotals.values()) {
        if (stryMutAct_9fa48("38267")) {
          {}
        } else {
          stryCov_9fa48("38267");
          stryMutAct_9fa48("38268") ? totalCount -= totalEntry.totalCount : (stryCov_9fa48("38268"), totalCount += totalEntry.totalCount);
          stryMutAct_9fa48("38269") ? phases[totalEntry.phase].totalCount -= totalEntry.totalCount : (stryCov_9fa48("38269"), phases[totalEntry.phase].totalCount += totalEntry.totalCount);
          stryMutAct_9fa48("38270") ? outcomes[totalEntry.outcome].totalCount -= totalEntry.totalCount : (stryCov_9fa48("38270"), outcomes[totalEntry.outcome].totalCount += totalEntry.totalCount);
          const tableEntry = stryMutAct_9fa48("38273") ? byTable[totalEntry.tableName] && {
            totalCount: NUM.ZERO,
            windowCount: NUM.ZERO,
            lastRecordedAt: NUM.ZERO
          } : stryMutAct_9fa48("38272") ? false : stryMutAct_9fa48("38271") ? true : (stryCov_9fa48("38271", "38272", "38273"), byTable[totalEntry.tableName] || (stryMutAct_9fa48("38274") ? {} : (stryCov_9fa48("38274"), {
            totalCount: NUM.ZERO,
            windowCount: NUM.ZERO,
            lastRecordedAt: NUM.ZERO
          })));
          stryMutAct_9fa48("38275") ? tableEntry.totalCount -= totalEntry.totalCount : (stryCov_9fa48("38275"), tableEntry.totalCount += totalEntry.totalCount);
          tableEntry.lastRecordedAt = stryMutAct_9fa48("38276") ? Math.min(tableEntry.lastRecordedAt, totalEntry.lastRecordedAt) : (stryCov_9fa48("38276"), Math.max(tableEntry.lastRecordedAt, totalEntry.lastRecordedAt));
          byTable[totalEntry.tableName] = tableEntry;
        }
      }
      for (const entry of this.authoritativeFallbackHistory) {
        if (stryMutAct_9fa48("38277")) {
          {}
        } else {
          stryCov_9fa48("38277");
          stryMutAct_9fa48("38278") ? phases[entry.phase].windowCount -= NUM.ONE : (stryCov_9fa48("38278"), phases[entry.phase].windowCount += NUM.ONE);
          stryMutAct_9fa48("38279") ? outcomes[entry.outcome].windowCount -= NUM.ONE : (stryCov_9fa48("38279"), outcomes[entry.outcome].windowCount += NUM.ONE);
          const tableEntry = stryMutAct_9fa48("38282") ? byTable[entry.tableName] && {
            totalCount: NUM.ZERO,
            windowCount: NUM.ZERO,
            lastRecordedAt: NUM.ZERO
          } : stryMutAct_9fa48("38281") ? false : stryMutAct_9fa48("38280") ? true : (stryCov_9fa48("38280", "38281", "38282"), byTable[entry.tableName] || (stryMutAct_9fa48("38283") ? {} : (stryCov_9fa48("38283"), {
            totalCount: NUM.ZERO,
            windowCount: NUM.ZERO,
            lastRecordedAt: NUM.ZERO
          })));
          stryMutAct_9fa48("38284") ? tableEntry.windowCount -= NUM.ONE : (stryCov_9fa48("38284"), tableEntry.windowCount += NUM.ONE);
          tableEntry.lastRecordedAt = stryMutAct_9fa48("38285") ? Math.min(tableEntry.lastRecordedAt, entry.recordedAt) : (stryCov_9fa48("38285"), Math.max(tableEntry.lastRecordedAt, entry.recordedAt));
          byTable[entry.tableName] = tableEntry;
        }
      }
      const recentEvents = stryMutAct_9fa48("38286") ? this.authoritativeFallbackHistory.map(entry => ({
        ...entry
      })) : (stryCov_9fa48("38286"), this.authoritativeFallbackHistory.slice(stryMutAct_9fa48("38287") ? +AUTHORITATIVE_FALLBACK_RECENT_LIMIT : (stryCov_9fa48("38287"), -AUTHORITATIVE_FALLBACK_RECENT_LIMIT)).map(stryMutAct_9fa48("38288") ? () => undefined : (stryCov_9fa48("38288"), entry => stryMutAct_9fa48("38289") ? {} : (stryCov_9fa48("38289"), {
        ...entry
      }))));
      return stryMutAct_9fa48("38290") ? {} : (stryCov_9fa48("38290"), {
        schemaVersion: NUM.ONE,
        nodeId: this.nodeId,
        windowMs: this.authoritativeFallbackWindowMs,
        totalCount,
        windowCount: this.authoritativeFallbackHistory.length,
        windowRatePerMinute: stryMutAct_9fa48("38291") ? this.authoritativeFallbackHistory.length / this.authoritativeFallbackWindowMs * CDC_INTEGRATION_SERVICE_LITERAL.VALUE_60 / CDC_INTEGRATION_SERVICE_LITERAL.VALUE_1000 : (stryCov_9fa48("38291"), (stryMutAct_9fa48("38292") ? this.authoritativeFallbackHistory.length / this.authoritativeFallbackWindowMs / CDC_INTEGRATION_SERVICE_LITERAL.VALUE_60 : (stryCov_9fa48("38292"), (stryMutAct_9fa48("38293") ? this.authoritativeFallbackHistory.length * this.authoritativeFallbackWindowMs : (stryCov_9fa48("38293"), this.authoritativeFallbackHistory.length / this.authoritativeFallbackWindowMs)) * CDC_INTEGRATION_SERVICE_LITERAL.VALUE_60)) * CDC_INTEGRATION_SERVICE_LITERAL.VALUE_1000),
        phases,
        outcomes,
        byTable,
        recentEvents
      });
    }
  }

  /**
   * Determine whether one cached row matches the expected post-write fields.
   * @param {Object|undefined} record
   * @param {Object|null} expectedFields
   * @return {boolean}
   * @private
   */
  doesCacheRecordMatchExpectedFields(record, expectedFields) {
    if (stryMutAct_9fa48("38294")) {
      {}
    } else {
      stryCov_9fa48("38294");
      if (stryMutAct_9fa48("38297") ? false : stryMutAct_9fa48("38296") ? true : stryMutAct_9fa48("38295") ? expectedFields : (stryCov_9fa48("38295", "38296", "38297"), !expectedFields)) {
        if (stryMutAct_9fa48("38298")) {
          {}
        } else {
          stryCov_9fa48("38298");
          return Boolean(record);
        }
      }
      if (stryMutAct_9fa48("38301") ? !record && typeof record !== TYPEOF.OBJECT : stryMutAct_9fa48("38300") ? false : stryMutAct_9fa48("38299") ? true : (stryCov_9fa48("38299", "38300", "38301"), (stryMutAct_9fa48("38302") ? record : (stryCov_9fa48("38302"), !record)) || (stryMutAct_9fa48("38304") ? typeof record === TYPEOF.OBJECT : stryMutAct_9fa48("38303") ? false : (stryCov_9fa48("38303", "38304"), typeof record !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("38305")) {
          {}
        } else {
          stryCov_9fa48("38305");
          return stryMutAct_9fa48("38306") ? true : (stryCov_9fa48("38306"), false);
        }
      }
      for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
        if (stryMutAct_9fa48("38307")) {
          {}
        } else {
          stryCov_9fa48("38307");
          if (stryMutAct_9fa48("38310") ? false : stryMutAct_9fa48("38309") ? true : stryMutAct_9fa48("38308") ? this.areCacheFieldValuesEqual(record[fieldName], expectedValue) : (stryCov_9fa48("38308", "38309", "38310"), !this.areCacheFieldValuesEqual(record[fieldName], expectedValue))) {
            if (stryMutAct_9fa48("38311")) {
              {}
            } else {
              stryCov_9fa48("38311");
              return stryMutAct_9fa48("38312") ? true : (stryCov_9fa48("38312"), false);
            }
          }
        }
      }
      return stryMutAct_9fa48("38313") ? false : (stryCov_9fa48("38313"), true);
    }
  }

  /**
   * Remove exact-match fields that are validated by minimum thresholds.
   * @param {Object|null} expectedFields
   * @param {Object|null} minimumFields
   * @return {Object|null}
   * @private
   */
  normalizeExpectedFieldsForMinimums(expectedFields, minimumFields) {
    if (stryMutAct_9fa48("38314")) {
      {}
    } else {
      stryCov_9fa48("38314");
      if (stryMutAct_9fa48("38317") ? false : stryMutAct_9fa48("38316") ? true : stryMutAct_9fa48("38315") ? expectedFields : (stryCov_9fa48("38315", "38316", "38317"), !expectedFields)) {
        if (stryMutAct_9fa48("38318")) {
          {}
        } else {
          stryCov_9fa48("38318");
          return null;
        }
      }
      if (stryMutAct_9fa48("38321") ? false : stryMutAct_9fa48("38320") ? true : stryMutAct_9fa48("38319") ? minimumFields : (stryCov_9fa48("38319", "38320", "38321"), !minimumFields)) {
        if (stryMutAct_9fa48("38322")) {
          {}
        } else {
          stryCov_9fa48("38322");
          return expectedFields;
        }
      }
      const normalized = {};
      for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
        if (stryMutAct_9fa48("38323")) {
          {}
        } else {
          stryCov_9fa48("38323");
          if (stryMutAct_9fa48("38325") ? false : stryMutAct_9fa48("38324") ? true : (stryCov_9fa48("38324", "38325"), Object.prototype.hasOwnProperty.call(minimumFields, fieldName))) {
            if (stryMutAct_9fa48("38326")) {
              {}
            } else {
              stryCov_9fa48("38326");
              continue;
            }
          }
          normalized[fieldName] = expectedValue;
        }
      }
      return (stryMutAct_9fa48("38330") ? Object.keys(normalized).length <= NUM.ZERO : stryMutAct_9fa48("38329") ? Object.keys(normalized).length >= NUM.ZERO : stryMutAct_9fa48("38328") ? false : stryMutAct_9fa48("38327") ? true : (stryCov_9fa48("38327", "38328", "38329", "38330"), Object.keys(normalized).length > NUM.ZERO)) ? normalized : null;
    }
  }

  /**
   * Determine whether one cached row satisfies all minimum field thresholds.
   * @param {Object|undefined} record
   * @param {Object|null} minimumFields
   * @return {boolean}
   * @private
   */
  doesCacheRecordMeetMinimumFields(record, minimumFields) {
    if (stryMutAct_9fa48("38331")) {
      {}
    } else {
      stryCov_9fa48("38331");
      if (stryMutAct_9fa48("38334") ? false : stryMutAct_9fa48("38333") ? true : stryMutAct_9fa48("38332") ? minimumFields : (stryCov_9fa48("38332", "38333", "38334"), !minimumFields)) {
        if (stryMutAct_9fa48("38335")) {
          {}
        } else {
          stryCov_9fa48("38335");
          return stryMutAct_9fa48("38336") ? false : (stryCov_9fa48("38336"), true);
        }
      }
      if (stryMutAct_9fa48("38339") ? !record && typeof record !== TYPEOF.OBJECT : stryMutAct_9fa48("38338") ? false : stryMutAct_9fa48("38337") ? true : (stryCov_9fa48("38337", "38338", "38339"), (stryMutAct_9fa48("38340") ? record : (stryCov_9fa48("38340"), !record)) || (stryMutAct_9fa48("38342") ? typeof record === TYPEOF.OBJECT : stryMutAct_9fa48("38341") ? false : (stryCov_9fa48("38341", "38342"), typeof record !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("38343")) {
          {}
        } else {
          stryCov_9fa48("38343");
          return stryMutAct_9fa48("38344") ? true : (stryCov_9fa48("38344"), false);
        }
      }
      for (const [fieldName, minimumValue] of Object.entries(minimumFields)) {
        if (stryMutAct_9fa48("38345")) {
          {}
        } else {
          stryCov_9fa48("38345");
          if (stryMutAct_9fa48("38348") ? false : stryMutAct_9fa48("38347") ? true : stryMutAct_9fa48("38346") ? this.isCacheFieldValueAtLeast(record[fieldName], minimumValue) : (stryCov_9fa48("38346", "38347", "38348"), !this.isCacheFieldValueAtLeast(record[fieldName], minimumValue))) {
            if (stryMutAct_9fa48("38349")) {
              {}
            } else {
              stryCov_9fa48("38349");
              return stryMutAct_9fa48("38350") ? true : (stryCov_9fa48("38350"), false);
            }
          }
        }
      }
      return stryMutAct_9fa48("38351") ? false : (stryCov_9fa48("38351"), true);
    }
  }

  /**
   * Check whether one cached value is equal to or greater than a minimum.
   * @param {*} actualValue
   * @param {*} minimumValue
   * @return {boolean}
   * @private
   */
  isCacheFieldValueAtLeast(actualValue, minimumValue) {
    if (stryMutAct_9fa48("38352")) {
      {}
    } else {
      stryCov_9fa48("38352");
      if (stryMutAct_9fa48("38354") ? false : stryMutAct_9fa48("38353") ? true : (stryCov_9fa48("38353", "38354"), this.areCacheFieldValuesEqual(actualValue, minimumValue))) {
        if (stryMutAct_9fa48("38355")) {
          {}
        } else {
          stryCov_9fa48("38355");
          return stryMutAct_9fa48("38356") ? false : (stryCov_9fa48("38356"), true);
        }
      }
      const actualComparable = this.normalizeComparableCacheFieldValue(actualValue);
      const minimumComparable = this.normalizeComparableCacheFieldValue(minimumValue);
      if (stryMutAct_9fa48("38359") ? actualComparable === null && minimumComparable === null : stryMutAct_9fa48("38358") ? false : stryMutAct_9fa48("38357") ? true : (stryCov_9fa48("38357", "38358", "38359"), (stryMutAct_9fa48("38361") ? actualComparable !== null : stryMutAct_9fa48("38360") ? false : (stryCov_9fa48("38360", "38361"), actualComparable === null)) || (stryMutAct_9fa48("38363") ? minimumComparable !== null : stryMutAct_9fa48("38362") ? false : (stryCov_9fa48("38362", "38363"), minimumComparable === null)))) {
        if (stryMutAct_9fa48("38364")) {
          {}
        } else {
          stryCov_9fa48("38364");
          return stryMutAct_9fa48("38365") ? true : (stryCov_9fa48("38365"), false);
        }
      }
      return stryMutAct_9fa48("38369") ? actualComparable < minimumComparable : stryMutAct_9fa48("38368") ? actualComparable > minimumComparable : stryMutAct_9fa48("38367") ? false : stryMutAct_9fa48("38366") ? true : (stryCov_9fa48("38366", "38367", "38368", "38369"), actualComparable >= minimumComparable);
    }
  }

  /**
   * Normalize one cache field into a comparable numeric value when possible.
   * @param {*} value
   * @return {number|null}
   * @private
   */
  normalizeComparableCacheFieldValue(value) {
    if (stryMutAct_9fa48("38370")) {
      {}
    } else {
      stryCov_9fa48("38370");
      if (stryMutAct_9fa48("38373") ? typeof value !== TYPEOF.NUMBER : stryMutAct_9fa48("38372") ? false : stryMutAct_9fa48("38371") ? true : (stryCov_9fa48("38371", "38372", "38373"), typeof value === TYPEOF.NUMBER)) {
        if (stryMutAct_9fa48("38374")) {
          {}
        } else {
          stryCov_9fa48("38374");
          return Number.isFinite(value) ? value : null;
        }
      }
      if (stryMutAct_9fa48("38377") ? typeof value !== TYPEOF.BIGINT : stryMutAct_9fa48("38376") ? false : stryMutAct_9fa48("38375") ? true : (stryCov_9fa48("38375", "38376", "38377"), typeof value === TYPEOF.BIGINT)) {
        if (stryMutAct_9fa48("38378")) {
          {}
        } else {
          stryCov_9fa48("38378");
          const normalized = Number(value);
          return Number.isFinite(normalized) ? normalized : null;
        }
      }
      if (stryMutAct_9fa48("38380") ? false : stryMutAct_9fa48("38379") ? true : (stryCov_9fa48("38379", "38380"), value instanceof Date)) {
        if (stryMutAct_9fa48("38381")) {
          {}
        } else {
          stryCov_9fa48("38381");
          const timestamp = value.getTime();
          return Number.isFinite(timestamp) ? timestamp : null;
        }
      }
      if (stryMutAct_9fa48("38384") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("38383") ? false : stryMutAct_9fa48("38382") ? true : (stryCov_9fa48("38382", "38383", "38384"), typeof value === TYPEOF.STRING)) {
        if (stryMutAct_9fa48("38385")) {
          {}
        } else {
          stryCov_9fa48("38385");
          if (stryMutAct_9fa48("38388") ? value.length !== NUM.ZERO : stryMutAct_9fa48("38387") ? false : stryMutAct_9fa48("38386") ? true : (stryCov_9fa48("38386", "38387", "38388"), value.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("38389")) {
              {}
            } else {
              stryCov_9fa48("38389");
              return null;
            }
          }
          const asNumber = Number(value);
          if (stryMutAct_9fa48("38391") ? false : stryMutAct_9fa48("38390") ? true : (stryCov_9fa48("38390", "38391"), Number.isFinite(asNumber))) {
            if (stryMutAct_9fa48("38392")) {
              {}
            } else {
              stryCov_9fa48("38392");
              return asNumber;
            }
          }
          const asDate = Date.parse(value);
          return Number.isFinite(asDate) ? asDate : null;
        }
      }
      return null;
    }
  }

  /**
   * Compare one cached field against an expected post-write value.
   * @param {*} actualValue
   * @param {*} expectedValue
   * @return {boolean}
   * @private
   */
  areCacheFieldValuesEqual(actualValue, expectedValue) {
    if (stryMutAct_9fa48("38393")) {
      {}
    } else {
      stryCov_9fa48("38393");
      if (stryMutAct_9fa48("38396") ? actualValue !== expectedValue : stryMutAct_9fa48("38395") ? false : stryMutAct_9fa48("38394") ? true : (stryCov_9fa48("38394", "38395", "38396"), actualValue === expectedValue)) {
        if (stryMutAct_9fa48("38397")) {
          {}
        } else {
          stryCov_9fa48("38397");
          return stryMutAct_9fa48("38398") ? false : (stryCov_9fa48("38398"), true);
        }
      }
      if (stryMutAct_9fa48("38401") ? actualValue === null || typeof actualValue !== TYPEOF.OBJECT || expectedValue === null || typeof expectedValue !== TYPEOF.OBJECT : stryMutAct_9fa48("38400") ? false : stryMutAct_9fa48("38399") ? true : (stryCov_9fa48("38399", "38400", "38401"), (stryMutAct_9fa48("38403") ? actualValue === null && typeof actualValue !== TYPEOF.OBJECT : stryMutAct_9fa48("38402") ? true : (stryCov_9fa48("38402", "38403"), (stryMutAct_9fa48("38405") ? actualValue !== null : stryMutAct_9fa48("38404") ? false : (stryCov_9fa48("38404", "38405"), actualValue === null)) || (stryMutAct_9fa48("38407") ? typeof actualValue === TYPEOF.OBJECT : stryMutAct_9fa48("38406") ? false : (stryCov_9fa48("38406", "38407"), typeof actualValue !== TYPEOF.OBJECT)))) && (stryMutAct_9fa48("38409") ? expectedValue === null && typeof expectedValue !== TYPEOF.OBJECT : stryMutAct_9fa48("38408") ? true : (stryCov_9fa48("38408", "38409"), (stryMutAct_9fa48("38411") ? expectedValue !== null : stryMutAct_9fa48("38410") ? false : (stryCov_9fa48("38410", "38411"), expectedValue === null)) || (stryMutAct_9fa48("38413") ? typeof expectedValue === TYPEOF.OBJECT : stryMutAct_9fa48("38412") ? false : (stryCov_9fa48("38412", "38413"), typeof expectedValue !== TYPEOF.OBJECT)))))) {
        if (stryMutAct_9fa48("38414")) {
          {}
        } else {
          stryCov_9fa48("38414");
          return stryMutAct_9fa48("38415") ? true : (stryCov_9fa48("38415"), false);
        }
      }
      try {
        if (stryMutAct_9fa48("38416")) {
          {}
        } else {
          stryCov_9fa48("38416");
          return stryMutAct_9fa48("38419") ? JSON.stringify(actualValue) !== JSON.stringify(expectedValue) : stryMutAct_9fa48("38418") ? false : stryMutAct_9fa48("38417") ? true : (stryCov_9fa48("38417", "38418", "38419"), JSON.stringify(actualValue) === JSON.stringify(expectedValue));
        }
      } catch (_parseErr) {
        if (stryMutAct_9fa48("38420")) {
          {}
        } else {
          stryCov_9fa48("38420");
          return stryMutAct_9fa48("38421") ? true : (stryCov_9fa48("38421"), false);
        }
      }
    }
  }

  /**
   * @param {string} primaryKeyField
   * @param {Object|null} expectedFields
   * @param {Object|null} minimumFields
   * @return {Array<string>}
   * @private
   */
  buildCacheVisibilityDivergentFields(primaryKeyField, expectedFields, minimumFields) {
    if (stryMutAct_9fa48("38422")) {
      {}
    } else {
      stryCov_9fa48("38422");
      return Array.from(new Set(stryMutAct_9fa48("38423") ? [] : (stryCov_9fa48("38423"), [primaryKeyField, ...Object.keys(stryMutAct_9fa48("38426") ? expectedFields && {} : stryMutAct_9fa48("38425") ? false : stryMutAct_9fa48("38424") ? true : (stryCov_9fa48("38424", "38425", "38426"), expectedFields || {})), ...Object.keys(stryMutAct_9fa48("38429") ? minimumFields && {} : stryMutAct_9fa48("38428") ? false : stryMutAct_9fa48("38427") ? true : (stryCov_9fa48("38427", "38428", "38429"), minimumFields || {}))])));
    }
  }

  /**
   * @param {string} tableName
   * @param {string} key
   * @param {string} divergenceType
   * @param {Object|null} cacheValue
   * @param {Object|null} authoritativeValue
   * @param {Array<string>} divergentFields
   * @param {string} phase
   * @private
   */
  emitCacheVisibilityDivergence(tableName, key, divergenceType, cacheValue, authoritativeValue, divergentFields, phase) {
    if (stryMutAct_9fa48("38430")) {
      {}
    } else {
      stryCov_9fa48("38430");
      const event = buildDivergenceEvent(stryMutAct_9fa48("38431") ? {} : (stryCov_9fa48("38431"), {
        divergenceType,
        tableName,
        ownerComponent: stryMutAct_9fa48("38432") ? "" : (stryCov_9fa48("38432"), 'CDCIntegrationService'),
        reconciliationReason: SQL_RECONCILIATION_REASON.DIAGNOSTICS_CACHE_RECONCILE,
        rowKey: key,
        cacheValue,
        authoritativeValue,
        divergentFields
      }));
      this.logger.warn(CDC_INTEGRATION_SERVICE_LITERAL.DIAGNOSED_CACHE_VISIBILITY_GAP_FROM_AUTHORITATIVE_SYSTEM_TABLE_READ, stryMutAct_9fa48("38433") ? {} : (stryCov_9fa48("38433"), {
        ...event,
        nodeId: this.nodeId,
        phase
      }));
      this.emit(CDC_EVENT.READ_MODEL_DIVERGENCE, event);
    }
  }

  /**
   * Build column list and value placeholders for INSERT.
   * @param {Object} data - Row data.
   * @return {Object} {columns, placeholders, values}
   * @private
   */
  buildInsertParts(data) {
    if (stryMutAct_9fa48("38434")) {
      {}
    } else {
      stryCov_9fa48("38434");
      const columns = Object.keys(data);
      const placeholders = columns.map(stryMutAct_9fa48("38435") ? () => undefined : (stryCov_9fa48("38435"), () => CDC_SQL.PARAM_PLACEHOLDER)).join(CDC_SQL.COMMA_SPACE);
      const values = columns.map(col => {
        if (stryMutAct_9fa48("38436")) {
          {}
        } else {
          stryCov_9fa48("38436");
          const val = data[col];
          // Serialize objects/arrays to JSON
          if (stryMutAct_9fa48("38439") ? val !== null || typeof val === TYPEOF.OBJECT : stryMutAct_9fa48("38438") ? false : stryMutAct_9fa48("38437") ? true : (stryCov_9fa48("38437", "38438", "38439"), (stryMutAct_9fa48("38441") ? val === null : stryMutAct_9fa48("38440") ? true : (stryCov_9fa48("38440", "38441"), val !== null)) && (stryMutAct_9fa48("38443") ? typeof val !== TYPEOF.OBJECT : stryMutAct_9fa48("38442") ? true : (stryCov_9fa48("38442", "38443"), typeof val === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("38444")) {
              {}
            } else {
              stryCov_9fa48("38444");
              return JSON.stringify(val);
            }
          }
          return val;
        }
      });
      return stryMutAct_9fa48("38445") ? {} : (stryCov_9fa48("38445"), {
        columns: columns.join(CDC_SQL.COMMA_SPACE),
        placeholders,
        values
      });
    }
  }

  /**
   * Filter row data to known columns for the target system table.
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data.
   * @return {Object} Filtered row data.
   * @private
   */
  filterDataForTable(tableName, data) {
    if (stryMutAct_9fa48("38446")) {
      {}
    } else {
      stryCov_9fa48("38446");
      const schema = getSchemaByTableName(tableName);
      if (stryMutAct_9fa48("38449") ? !schema && !schema.columns : stryMutAct_9fa48("38448") ? false : stryMutAct_9fa48("38447") ? true : (stryCov_9fa48("38447", "38448", "38449"), (stryMutAct_9fa48("38450") ? schema : (stryCov_9fa48("38450"), !schema)) || (stryMutAct_9fa48("38451") ? schema.columns : (stryCov_9fa48("38451"), !schema.columns)))) {
        if (stryMutAct_9fa48("38452")) {
          {}
        } else {
          stryCov_9fa48("38452");
          throw new Error(stryMutAct_9fa48("38453") ? `` : (stryCov_9fa48("38453"), `${CDC_ERROR_MSG.SCHEMA_MISSING_PREFIX}${tableName}`));
        }
      }
      const allowed = new Set(schema.columns.map(stryMutAct_9fa48("38454") ? () => undefined : (stryCov_9fa48("38454"), column => column.name)));
      const filtered = {};
      for (const [key, value] of Object.entries(data)) {
        if (stryMutAct_9fa48("38455")) {
          {}
        } else {
          stryCov_9fa48("38455");
          if (stryMutAct_9fa48("38457") ? false : stryMutAct_9fa48("38456") ? true : (stryCov_9fa48("38456", "38457"), allowed.has(key))) {
            if (stryMutAct_9fa48("38458")) {
              {}
            } else {
              stryCov_9fa48("38458");
              filtered[key] = value;
            }
          }
        }
      }
      return filtered;
    }
  }

  /**
   * Normalize INSERT/UPSERT row data using schema defaults and table-specific defaults.
   * @param {string} tableName - System table name.
   * @param {Object} data - Input row data.
   * @return {Object} Normalized row data.
   * @private
   */
  prepareInsertData(tableName, data, options = {}) {
    if (stryMutAct_9fa48("38459")) {
      {}
    } else {
      stryCov_9fa48("38459");
      const schema = getSchemaByTableName(tableName);
      if (stryMutAct_9fa48("38462") ? !schema && !schema.columns : stryMutAct_9fa48("38461") ? false : stryMutAct_9fa48("38460") ? true : (stryCov_9fa48("38460", "38461", "38462"), (stryMutAct_9fa48("38463") ? schema : (stryCov_9fa48("38463"), !schema)) || (stryMutAct_9fa48("38464") ? schema.columns : (stryCov_9fa48("38464"), !schema.columns)))) {
        if (stryMutAct_9fa48("38465")) {
          {}
        } else {
          stryCov_9fa48("38465");
          throw new Error(stryMutAct_9fa48("38466") ? `` : (stryCov_9fa48("38466"), `${CDC_ERROR_MSG.SCHEMA_MISSING_PREFIX}${tableName}`));
        }
      }
      const canonicalData = canonicalizeSystemTableRow(tableName, data);
      const rowData = this.filterDataForTable(tableName, stryMutAct_9fa48("38467") ? {} : (stryCov_9fa48("38467"), {
        ...canonicalData
      }));
      if (stryMutAct_9fa48("38470") ? Object.keys(rowData).length !== NUM.ZERO : stryMutAct_9fa48("38469") ? false : stryMutAct_9fa48("38468") ? true : (stryCov_9fa48("38468", "38469", "38470"), Object.keys(rowData).length === NUM.ZERO)) {
        if (stryMutAct_9fa48("38471")) {
          {}
        } else {
          stryCov_9fa48("38471");
          throw new Error(stryMutAct_9fa48("38472") ? `` : (stryCov_9fa48("38472"), `${CDC_ERROR_MSG.INSERT_VALID_COLUMNS_PREFIX}${tableName}`));
        }
      }
      const {
        generatePrimaryKey = stryMutAct_9fa48("38473") ? false : (stryCov_9fa48("38473"), true)
      } = options;
      const idField = this.getPrimaryKeyField(tableName);
      if (stryMutAct_9fa48("38476") ? !rowData[idField] || generatePrimaryKey : stryMutAct_9fa48("38475") ? false : stryMutAct_9fa48("38474") ? true : (stryCov_9fa48("38474", "38475", "38476"), (stryMutAct_9fa48("38477") ? rowData[idField] : (stryCov_9fa48("38477"), !rowData[idField])) && generatePrimaryKey)) {
        if (stryMutAct_9fa48("38478")) {
          {}
        } else {
          stryCov_9fa48("38478");
          rowData[idField] = uuidv4();
        }
      }
      this.applySchemaDefaults(schema, rowData);
      this.applyTableInsertDefaults(tableName, schema, rowData);
      this.applyTimestampDefaults(schema, rowData);
      return rowData;
    }
  }

  /**
   * Apply schema-defined defaults to missing fields.
   * @param {Object} schema - Table schema.
   * @param {Object} rowData - Row data to mutate.
   * @private
   */
  applySchemaDefaults(schema, rowData) {
    if (stryMutAct_9fa48("38479")) {
      {}
    } else {
      stryCov_9fa48("38479");
      for (const column of schema.columns) {
        if (stryMutAct_9fa48("38480")) {
          {}
        } else {
          stryCov_9fa48("38480");
          if (stryMutAct_9fa48("38483") ? rowData[column.name] === undefined : stryMutAct_9fa48("38482") ? false : stryMutAct_9fa48("38481") ? true : (stryCov_9fa48("38481", "38482", "38483"), rowData[column.name] !== undefined)) {
            if (stryMutAct_9fa48("38484")) {
              {}
            } else {
              stryCov_9fa48("38484");
              continue;
            }
          }
          if (stryMutAct_9fa48("38487") ? column.defaultValue !== undefined : stryMutAct_9fa48("38486") ? false : stryMutAct_9fa48("38485") ? true : (stryCov_9fa48("38485", "38486", "38487"), column.defaultValue === undefined)) {
            if (stryMutAct_9fa48("38488")) {
              {}
            } else {
              stryCov_9fa48("38488");
              continue;
            }
          }
          const normalizedDefault = this.normalizeDefaultValue(column.defaultValue);
          if (stryMutAct_9fa48("38491") ? normalizedDefault.state !== CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_UNDEFINED : stryMutAct_9fa48("38490") ? false : stryMutAct_9fa48("38489") ? true : (stryCov_9fa48("38489", "38490", "38491"), normalizedDefault.state === CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_UNDEFINED)) {
            if (stryMutAct_9fa48("38492")) {
              {}
            } else {
              stryCov_9fa48("38492");
              continue;
            }
          }
          rowData[column.name] = materializeNormalizedDefaultValue(normalizedDefault);
        }
      }
    }
  }

  /**
   * Apply generic timestamp defaults for inserts when columns exist.
   * @param {Object} schema - Table schema.
   * @param {Object} rowData - Row data to mutate.
   * @private
   */
  applyTimestampDefaults(schema, rowData) {
    if (stryMutAct_9fa48("38493")) {
      {}
    } else {
      stryCov_9fa48("38493");
      const now = Date.now();
      const columnNames = new Set(schema.columns.map(stryMutAct_9fa48("38494") ? () => undefined : (stryCov_9fa48("38494"), col => col.name)));
      if (stryMutAct_9fa48("38497") ? columnNames.has(COLUMN.CREATED_AT) || rowData[COLUMN.CREATED_AT] == null : stryMutAct_9fa48("38496") ? false : stryMutAct_9fa48("38495") ? true : (stryCov_9fa48("38495", "38496", "38497"), columnNames.has(COLUMN.CREATED_AT) && (stryMutAct_9fa48("38499") ? rowData[COLUMN.CREATED_AT] != null : stryMutAct_9fa48("38498") ? true : (stryCov_9fa48("38498", "38499"), rowData[COLUMN.CREATED_AT] == null)))) {
        if (stryMutAct_9fa48("38500")) {
          {}
        } else {
          stryCov_9fa48("38500");
          rowData[COLUMN.CREATED_AT] = now;
        }
      }
      if (stryMutAct_9fa48("38503") ? columnNames.has(COLUMN.UPDATED_AT) || rowData[COLUMN.UPDATED_AT] == null : stryMutAct_9fa48("38502") ? false : stryMutAct_9fa48("38501") ? true : (stryCov_9fa48("38501", "38502", "38503"), columnNames.has(COLUMN.UPDATED_AT) && (stryMutAct_9fa48("38505") ? rowData[COLUMN.UPDATED_AT] != null : stryMutAct_9fa48("38504") ? true : (stryCov_9fa48("38504", "38505"), rowData[COLUMN.UPDATED_AT] == null)))) {
        if (stryMutAct_9fa48("38506")) {
          {}
        } else {
          stryCov_9fa48("38506");
          rowData[COLUMN.UPDATED_AT] = now;
        }
      }
    }
  }

  /**
   * Apply table-specific defaults for inserts.
   * @param {string} tableName - System table name.
   * @param {Object} schema - Table schema.
   * @param {Object} rowData - Row data to mutate.
   * @private
   */
  applyTableInsertDefaults(tableName, _schema, rowData) {
    if (stryMutAct_9fa48("38507")) {
      {}
    } else {
      stryCov_9fa48("38507");
      const now = Date.now();
      if (stryMutAct_9fa48("38510") ? tableName === SYSTEM_TABLE_NAME.NODES : stryMutAct_9fa48("38509") ? false : stryMutAct_9fa48("38508") ? true : (stryCov_9fa48("38508", "38509", "38510"), tableName !== SYSTEM_TABLE_NAME.NODES)) {
        if (stryMutAct_9fa48("38511")) {
          {}
        } else {
          stryCov_9fa48("38511");
          return;
        }
      }
      if (stryMutAct_9fa48("38514") ? false : stryMutAct_9fa48("38513") ? true : stryMutAct_9fa48("38512") ? rowData[COLUMN.NODE_ADDRESS] : (stryCov_9fa48("38512", "38513", "38514"), !rowData[COLUMN.NODE_ADDRESS])) {
        if (stryMutAct_9fa48("38515")) {
          {}
        } else {
          stryCov_9fa48("38515");
          rowData[COLUMN.NODE_ADDRESS] = CDC_INTEGRATION_SERVICE_LITERAL.UNKNOWN;
        }
      }
      if (stryMutAct_9fa48("38518") ? rowData.cpu_cores != null : stryMutAct_9fa48("38517") ? false : stryMutAct_9fa48("38516") ? true : (stryCov_9fa48("38516", "38517", "38518"), rowData.cpu_cores == null)) {
        if (stryMutAct_9fa48("38519")) {
          {}
        } else {
          stryCov_9fa48("38519");
          rowData.cpu_cores = NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("38522") ? rowData.memory_mb != null : stryMutAct_9fa48("38521") ? false : stryMutAct_9fa48("38520") ? true : (stryCov_9fa48("38520", "38521", "38522"), rowData.memory_mb == null)) {
        if (stryMutAct_9fa48("38523")) {
          {}
        } else {
          stryCov_9fa48("38523");
          rowData.memory_mb = NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("38526") ? rowData.disk_gb != null : stryMutAct_9fa48("38525") ? false : stryMutAct_9fa48("38524") ? true : (stryCov_9fa48("38524", "38525", "38526"), rowData.disk_gb == null)) {
        if (stryMutAct_9fa48("38527")) {
          {}
        } else {
          stryCov_9fa48("38527");
          rowData.disk_gb = NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("38530") ? rowData.cpu_usage_percent != null : stryMutAct_9fa48("38529") ? false : stryMutAct_9fa48("38528") ? true : (stryCov_9fa48("38528", "38529", "38530"), rowData.cpu_usage_percent == null)) {
        if (stryMutAct_9fa48("38531")) {
          {}
        } else {
          stryCov_9fa48("38531");
          rowData.cpu_usage_percent = NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("38534") ? rowData.memory_usage_percent != null : stryMutAct_9fa48("38533") ? false : stryMutAct_9fa48("38532") ? true : (stryCov_9fa48("38532", "38533", "38534"), rowData.memory_usage_percent == null)) {
        if (stryMutAct_9fa48("38535")) {
          {}
        } else {
          stryCov_9fa48("38535");
          rowData.memory_usage_percent = NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("38538") ? rowData.disk_usage_percent != null : stryMutAct_9fa48("38537") ? false : stryMutAct_9fa48("38536") ? true : (stryCov_9fa48("38536", "38537", "38538"), rowData.disk_usage_percent == null)) {
        if (stryMutAct_9fa48("38539")) {
          {}
        } else {
          stryCov_9fa48("38539");
          rowData.disk_usage_percent = NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("38542") ? false : stryMutAct_9fa48("38541") ? true : stryMutAct_9fa48("38540") ? rowData.status : (stryCov_9fa48("38540", "38541", "38542"), !rowData.status)) {
        if (stryMutAct_9fa48("38543")) {
          {}
        } else {
          stryCov_9fa48("38543");
          rowData.status = SERVICE_STATUS.ACTIVE;
        }
      }
      if (stryMutAct_9fa48("38546") ? false : stryMutAct_9fa48("38545") ? true : stryMutAct_9fa48("38544") ? rowData.connection_state : (stryCov_9fa48("38544", "38545", "38546"), !rowData.connection_state)) {
        if (stryMutAct_9fa48("38547")) {
          {}
        } else {
          stryCov_9fa48("38547");
          rowData.connection_state = STATE.DISCONNECTED;
        }
      }
      if (stryMutAct_9fa48("38550") ? rowData.capabilities != null : stryMutAct_9fa48("38549") ? false : stryMutAct_9fa48("38548") ? true : (stryCov_9fa48("38548", "38549", "38550"), rowData.capabilities == null)) {
        if (stryMutAct_9fa48("38551")) {
          {}
        } else {
          stryCov_9fa48("38551");
          rowData.capabilities = CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_3;
        }
      }
      if (stryMutAct_9fa48("38554") ? rowData.last_heartbeat != null : stryMutAct_9fa48("38553") ? false : stryMutAct_9fa48("38552") ? true : (stryCov_9fa48("38552", "38553", "38554"), rowData.last_heartbeat == null)) {
        if (stryMutAct_9fa48("38555")) {
          {}
        } else {
          stryCov_9fa48("38555");
          rowData.last_heartbeat = now;
        }
      }
    }
  }

  /**
   * Normalize schema default values (strip quotes, parse numbers).
   * @param {string|number|null} value - Default value.
   * @return {Object} Explicit default-value normalization result.
   * @private
   */
  normalizeDefaultValue(value) {
    if (stryMutAct_9fa48("38556")) {
      {}
    } else {
      stryCov_9fa48("38556");
      if (stryMutAct_9fa48("38559") ? value === undefined && value === null : stryMutAct_9fa48("38558") ? false : stryMutAct_9fa48("38557") ? true : (stryCov_9fa48("38557", "38558", "38559"), (stryMutAct_9fa48("38561") ? value !== undefined : stryMutAct_9fa48("38560") ? false : (stryCov_9fa48("38560", "38561"), value === undefined)) || (stryMutAct_9fa48("38563") ? value !== null : stryMutAct_9fa48("38562") ? false : (stryCov_9fa48("38562", "38563"), value === null)))) {
        if (stryMutAct_9fa48("38564")) {
          {}
        } else {
          stryCov_9fa48("38564");
          return Object.freeze(stryMutAct_9fa48("38565") ? {} : (stryCov_9fa48("38565"), {
            state: (stryMutAct_9fa48("38568") ? value !== undefined : stryMutAct_9fa48("38567") ? false : stryMutAct_9fa48("38566") ? true : (stryCov_9fa48("38566", "38567", "38568"), value === undefined)) ? CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_UNDEFINED : CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_NULL
          }));
        }
      }
      if (stryMutAct_9fa48("38571") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("38570") ? false : stryMutAct_9fa48("38569") ? true : (stryCov_9fa48("38569", "38570", "38571"), typeof value !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("38572")) {
          {}
        } else {
          stryCov_9fa48("38572");
          return Object.freeze(stryMutAct_9fa48("38573") ? {} : (stryCov_9fa48("38573"), {
            state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
            value
          }));
        }
      }
      const trimmed = stryMutAct_9fa48("38574") ? value : (stryCov_9fa48("38574"), value.trim());
      if (stryMutAct_9fa48("38577") ? trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4) && trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4) && trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5) && trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5) : stryMutAct_9fa48("38576") ? false : stryMutAct_9fa48("38575") ? true : (stryCov_9fa48("38575", "38576", "38577"), (stryMutAct_9fa48("38579") ? trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4) || trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4) : stryMutAct_9fa48("38578") ? false : (stryCov_9fa48("38578", "38579"), (stryMutAct_9fa48("38580") ? trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4) : (stryCov_9fa48("38580"), trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4))) && (stryMutAct_9fa48("38581") ? trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4) : (stryCov_9fa48("38581"), trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4))))) || (stryMutAct_9fa48("38583") ? trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5) || trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5) : stryMutAct_9fa48("38582") ? false : (stryCov_9fa48("38582", "38583"), (stryMutAct_9fa48("38584") ? trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5) : (stryCov_9fa48("38584"), trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5))) && (stryMutAct_9fa48("38585") ? trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5) : (stryCov_9fa48("38585"), trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5))))))) {
        if (stryMutAct_9fa48("38586")) {
          {}
        } else {
          stryCov_9fa48("38586");
          return Object.freeze(stryMutAct_9fa48("38587") ? {} : (stryCov_9fa48("38587"), {
            state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
            value: stryMutAct_9fa48("38588") ? trimmed : (stryCov_9fa48("38588"), trimmed.slice(NUM.ONE, stryMutAct_9fa48("38589") ? +NUM.ONE : (stryCov_9fa48("38589"), -NUM.ONE)))
          }));
        }
      }
      if (stryMutAct_9fa48("38592") ? trimmed.toLowerCase() !== CDC_INTEGRATION_SERVICE_LITERAL.NULL : stryMutAct_9fa48("38591") ? false : stryMutAct_9fa48("38590") ? true : (stryCov_9fa48("38590", "38591", "38592"), (stryMutAct_9fa48("38593") ? trimmed.toUpperCase() : (stryCov_9fa48("38593"), trimmed.toLowerCase())) === CDC_INTEGRATION_SERVICE_LITERAL.NULL)) {
        if (stryMutAct_9fa48("38594")) {
          {}
        } else {
          stryCov_9fa48("38594");
          return Object.freeze(stryMutAct_9fa48("38595") ? {} : (stryCov_9fa48("38595"), {
            state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_NULL
          }));
        }
      }
      if (stryMutAct_9fa48("38597") ? false : stryMutAct_9fa48("38596") ? true : (stryCov_9fa48("38596", "38597"), (stryMutAct_9fa48("38605") ? /^-?\d+(\.\D+)?$/ : stryMutAct_9fa48("38604") ? /^-?\d+(\.\d)?$/ : stryMutAct_9fa48("38603") ? /^-?\d+(\.\d+)$/ : stryMutAct_9fa48("38602") ? /^-?\D+(\.\d+)?$/ : stryMutAct_9fa48("38601") ? /^-?\d(\.\d+)?$/ : stryMutAct_9fa48("38600") ? /^-\d+(\.\d+)?$/ : stryMutAct_9fa48("38599") ? /^-?\d+(\.\d+)?/ : stryMutAct_9fa48("38598") ? /-?\d+(\.\d+)?$/ : (stryCov_9fa48("38598", "38599", "38600", "38601", "38602", "38603", "38604", "38605"), /^-?\d+(\.\d+)?$/)).test(trimmed))) {
        if (stryMutAct_9fa48("38606")) {
          {}
        } else {
          stryCov_9fa48("38606");
          return Object.freeze(stryMutAct_9fa48("38607") ? {} : (stryCov_9fa48("38607"), {
            state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
            value: Number(trimmed)
          }));
        }
      }
      return Object.freeze(stryMutAct_9fa48("38608") ? {} : (stryCov_9fa48("38608"), {
        state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
        value: trimmed
      }));
    }
  }

  /**
   * Emit CDC error event only when listeners are registered.
   * @param {Object} payload - CDC error payload.
   * @private
   */
  emitErrorEvent(payload) {
    if (stryMutAct_9fa48("38609")) {
      {}
    } else {
      stryCov_9fa48("38609");
      if (stryMutAct_9fa48("38613") ? this.listenerCount(CDC_EVENT.ERROR) <= NUM.ZERO : stryMutAct_9fa48("38612") ? this.listenerCount(CDC_EVENT.ERROR) >= NUM.ZERO : stryMutAct_9fa48("38611") ? false : stryMutAct_9fa48("38610") ? true : (stryCov_9fa48("38610", "38611", "38612", "38613"), this.listenerCount(CDC_EVENT.ERROR) > NUM.ZERO)) {
        if (stryMutAct_9fa48("38614")) {
          {}
        } else {
          stryCov_9fa48("38614");
          this.emit(CDC_EVENT.ERROR, payload);
        }
      }
    }
  }

  /**
   * Build SET clause for UPDATE.
   * @param {Object} data - Data to update.
   * @return {Object} {setClause, values}
   * @private
   */
  buildUpdateParts(data) {
    if (stryMutAct_9fa48("38615")) {
      {}
    } else {
      stryCov_9fa48("38615");
      const columns = Object.keys(data);
      const setClause = columns.map(stryMutAct_9fa48("38616") ? () => undefined : (stryCov_9fa48("38616"), col => stryMutAct_9fa48("38617") ? `` : (stryCov_9fa48("38617"), `${col}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`))).join(CDC_SQL.COMMA_SPACE);
      const values = columns.map(col => {
        if (stryMutAct_9fa48("38618")) {
          {}
        } else {
          stryCov_9fa48("38618");
          const val = data[col];
          if (stryMutAct_9fa48("38621") ? val !== null || typeof val === TYPEOF.OBJECT : stryMutAct_9fa48("38620") ? false : stryMutAct_9fa48("38619") ? true : (stryCov_9fa48("38619", "38620", "38621"), (stryMutAct_9fa48("38623") ? val === null : stryMutAct_9fa48("38622") ? true : (stryCov_9fa48("38622", "38623"), val !== null)) && (stryMutAct_9fa48("38625") ? typeof val !== TYPEOF.OBJECT : stryMutAct_9fa48("38624") ? true : (stryCov_9fa48("38624", "38625"), typeof val === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("38626")) {
              {}
            } else {
              stryCov_9fa48("38626");
              return JSON.stringify(val);
            }
          }
          return val;
        }
      });
      return stryMutAct_9fa48("38627") ? {} : (stryCov_9fa48("38627"), {
        setClause,
        values
      });
    }
  }

  /**
   * Build WHERE clause from conditions.
   * @param {Object} whereClause - WHERE conditions.
   * @return {Object} {whereStr, values}
   * @private
   */
  buildWhereParts(whereClause) {
    if (stryMutAct_9fa48("38628")) {
      {}
    } else {
      stryCov_9fa48("38628");
      const conditions = Object.keys(whereClause);
      const whereStr = conditions.map(stryMutAct_9fa48("38629") ? () => undefined : (stryCov_9fa48("38629"), col => stryMutAct_9fa48("38630") ? `` : (stryCov_9fa48("38630"), `${col}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`))).join(CDC_SQL.WHERE_AND);
      const values = conditions.map(stryMutAct_9fa48("38631") ? () => undefined : (stryCov_9fa48("38631"), col => whereClause[col]));
      return stryMutAct_9fa48("38632") ? {} : (stryCov_9fa48("38632"), {
        whereStr,
        values
      });
    }
  }

  /**
   * Build one canonical single-flight key for an in-flight system-table
   * mutation so identical callers collapse into one routed write.
   * @param {string} operation
   * @param {string} tableName
   * @param {string|null} identity
   * @param {Object} payload
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  buildMutationSingleFlightKey(operation, tableName, identity, payload, options = {}) {
    if (stryMutAct_9fa48("38633")) {
      {}
    } else {
      stryCov_9fa48("38633");
      if (stryMutAct_9fa48("38636") ? options?.allowCoalescing !== false : stryMutAct_9fa48("38635") ? false : stryMutAct_9fa48("38634") ? true : (stryCov_9fa48("38634", "38635", "38636"), (stryMutAct_9fa48("38637") ? options.allowCoalescing : (stryCov_9fa48("38637"), options?.allowCoalescing)) === (stryMutAct_9fa48("38638") ? true : (stryCov_9fa48("38638"), false)))) {
        if (stryMutAct_9fa48("38639")) {
          {}
        } else {
          stryCov_9fa48("38639");
          return null;
        }
      }
      if (stryMutAct_9fa48("38642") ? typeof options?.coalescingKey === TYPEOF.STRING || options.coalescingKey.length > NUM.ZERO : stryMutAct_9fa48("38641") ? false : stryMutAct_9fa48("38640") ? true : (stryCov_9fa48("38640", "38641", "38642"), (stryMutAct_9fa48("38644") ? typeof options?.coalescingKey !== TYPEOF.STRING : stryMutAct_9fa48("38643") ? true : (stryCov_9fa48("38643", "38644"), typeof (stryMutAct_9fa48("38645") ? options.coalescingKey : (stryCov_9fa48("38645"), options?.coalescingKey)) === TYPEOF.STRING)) && (stryMutAct_9fa48("38648") ? options.coalescingKey.length <= NUM.ZERO : stryMutAct_9fa48("38647") ? options.coalescingKey.length >= NUM.ZERO : stryMutAct_9fa48("38646") ? true : (stryCov_9fa48("38646", "38647", "38648"), options.coalescingKey.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("38649")) {
          {}
        } else {
          stryCov_9fa48("38649");
          return stryMutAct_9fa48("38650") ? `` : (stryCov_9fa48("38650"), `${operation}:${tableName}:${options.coalescingKey}`);
        }
      }
      return stableSerializeMutationKey(stryMutAct_9fa48("38651") ? {} : (stryCov_9fa48("38651"), {
        operation,
        tableName,
        identity: stryMutAct_9fa48("38654") ? identity && null : stryMutAct_9fa48("38653") ? false : stryMutAct_9fa48("38652") ? true : (stryCov_9fa48("38652", "38653", "38654"), identity || null),
        payload,
        ignoreExisting: stryMutAct_9fa48("38657") ? options?.ignoreExisting !== true : stryMutAct_9fa48("38656") ? false : stryMutAct_9fa48("38655") ? true : (stryCov_9fa48("38655", "38656", "38657"), (stryMutAct_9fa48("38658") ? options.ignoreExisting : (stryCov_9fa48("38658"), options?.ignoreExisting)) === (stryMutAct_9fa48("38659") ? false : (stryCov_9fa48("38659"), true)))
      }));
    }
  }

  /**
   * Reuse one in-flight mutation promise when callers submit the same
   * canonical write intent concurrently.
   * @param {string|null} singleFlightKey
   * @param {Function} executionFactory
   * @return {Promise<Object>}
   * @private
   */
  runCoalescedMutation(singleFlightKey, executionFactory) {
    if (stryMutAct_9fa48("38660")) {
      {}
    } else {
      stryCov_9fa48("38660");
      if (stryMutAct_9fa48("38663") ? false : stryMutAct_9fa48("38662") ? true : stryMutAct_9fa48("38661") ? singleFlightKey : (stryCov_9fa48("38661", "38662", "38663"), !singleFlightKey)) {
        if (stryMutAct_9fa48("38664")) {
          {}
        } else {
          stryCov_9fa48("38664");
          return executionFactory();
        }
      }
      const existingMutation = this.inFlightMutationsByKey.get(singleFlightKey);
      if (stryMutAct_9fa48("38666") ? false : stryMutAct_9fa48("38665") ? true : (stryCov_9fa48("38665", "38666"), existingMutation)) {
        if (stryMutAct_9fa48("38667")) {
          {}
        } else {
          stryCov_9fa48("38667");
          return existingMutation;
        }
      }
      let inFlightMutation = null;
      inFlightMutation = Promise.resolve().then(stryMutAct_9fa48("38668") ? () => undefined : (stryCov_9fa48("38668"), () => executionFactory())).finally(() => {
        if (stryMutAct_9fa48("38669")) {
          {}
        } else {
          stryCov_9fa48("38669");
          if (stryMutAct_9fa48("38672") ? this.inFlightMutationsByKey.get(singleFlightKey) !== inFlightMutation : stryMutAct_9fa48("38671") ? false : stryMutAct_9fa48("38670") ? true : (stryCov_9fa48("38670", "38671", "38672"), this.inFlightMutationsByKey.get(singleFlightKey) === inFlightMutation)) {
            if (stryMutAct_9fa48("38673")) {
              {}
            } else {
              stryCov_9fa48("38673");
              this.inFlightMutationsByKey.delete(singleFlightKey);
            }
          }
        }
      });
      this.inFlightMutationsByKey.set(singleFlightKey, inFlightMutation);
      return inFlightMutation;
    }
  }

  /**
   * Insert a row into a system table.
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data to insert.
   * @param {Object} [options] - Insert options.
   * @return {Promise<Object>} Insert result.
   */
  async insertSystemTableRow(tableName, data, options = {}) {
    if (stryMutAct_9fa48("38674")) {
      {}
    } else {
      stryCov_9fa48("38674");
      this.validateTableName(tableName);
      this.validateData(data, CDC_OPERATION.INSERT);
      const rowData = this.prepareInsertData(tableName, data);
      const idField = this.getPrimaryKeyField(tableName);
      const trackingId = rowData[idField];
      const singleFlightKey = this.buildMutationSingleFlightKey(CDC_OPERATION.INSERT, tableName, trackingId, rowData, options);
      this.logger.debug(CDC_LOG_MSG.INSERTING_ROW, stryMutAct_9fa48("38675") ? {} : (stryCov_9fa48("38675"), {
        tableName,
        id: trackingId,
        nodeId: this.nodeId
      }));
      return this.runCoalescedMutation(singleFlightKey, async () => {
        if (stryMutAct_9fa48("38676")) {
          {}
        } else {
          stryCov_9fa48("38676");
          try {
            if (stryMutAct_9fa48("38677")) {
              {}
            } else {
              stryCov_9fa48("38677");
              const {
                columns,
                placeholders,
                values
              } = this.buildInsertParts(rowData);
              const sql = (stryMutAct_9fa48("38678") ? `` : (stryCov_9fa48("38678"), `${(stryMutAct_9fa48("38681") ? options?.ignoreExisting !== true : stryMutAct_9fa48("38680") ? false : stryMutAct_9fa48("38679") ? true : (stryCov_9fa48("38679", "38680", "38681"), (stryMutAct_9fa48("38682") ? options.ignoreExisting : (stryCov_9fa48("38682"), options?.ignoreExisting)) === (stryMutAct_9fa48("38683") ? false : (stryCov_9fa48("38683"), true)))) ? SQL.INSERT_OR_IGNORE_INTO : SQL.INSERT_INTO} ${tableName} (${columns}) `)) + (stryMutAct_9fa48("38684") ? `` : (stryCov_9fa48("38684"), `${SQL.VALUES} (${placeholders})`));
              const sqlStartMs = Date.now();
              const result = await this.executeSQL(sql, values, stryMutAct_9fa48("38685") ? {} : (stryCov_9fa48("38685"), {
                queryTimeoutMs: stryMutAct_9fa48("38686") ? options.queryTimeoutMs : (stryCov_9fa48("38686"), options?.queryTimeoutMs),
                cancellationToken: stryMutAct_9fa48("38689") ? options?.cancellationToken && null : stryMutAct_9fa48("38688") ? false : stryMutAct_9fa48("38687") ? true : (stryCov_9fa48("38687", "38688", "38689"), (stryMutAct_9fa48("38690") ? options.cancellationToken : (stryCov_9fa48("38690"), options?.cancellationToken)) || null),
                routingReadinessDimension: stryMutAct_9fa48("38691") ? options.routingReadinessDimension : (stryCov_9fa48("38691"), options?.routingReadinessDimension),
                workClass: stryMutAct_9fa48("38692") ? options.workClass : (stryCov_9fa48("38692"), options?.workClass),
                allowPressureDefer: stryMutAct_9fa48("38693") ? options.allowPressureDefer : (stryCov_9fa48("38693"), options?.allowPressureDefer),
                pressureRetryAfterMs: stryMutAct_9fa48("38694") ? options.pressureRetryAfterMs : (stryCov_9fa48("38694"), options?.pressureRetryAfterMs),
                deliveryPriority: stryMutAct_9fa48("38695") ? options.deliveryPriority : (stryCov_9fa48("38695"), options?.deliveryPriority)
              }));
              const sqlDurationMs = stryMutAct_9fa48("38696") ? Date.now() + sqlStartMs : (stryCov_9fa48("38696"), Date.now() - sqlStartMs);
              if (stryMutAct_9fa48("38699") ? false : stryMutAct_9fa48("38698") ? true : stryMutAct_9fa48("38697") ? result.success : (stryCov_9fa48("38697", "38698", "38699"), !result.success)) {
                if (stryMutAct_9fa48("38700")) {
                  {}
                } else {
                  stryCov_9fa48("38700");
                  throw buildSystemTableMutationError(result, CDC_ERROR_MSG.INSERT_FAILED);
                }
              }
              const pkField = this.getPrimaryKeyField(tableName);
              const pkValue = rowData[pkField];
              const cacheWaitStartMs = Date.now();
              let visibilityResult = buildSystemTableVisibilityResult();
              if (stryMutAct_9fa48("38703") ? pkValue || options?.skipCacheWait !== true : stryMutAct_9fa48("38702") ? false : stryMutAct_9fa48("38701") ? true : (stryCov_9fa48("38701", "38702", "38703"), pkValue && (stryMutAct_9fa48("38705") ? options?.skipCacheWait === true : stryMutAct_9fa48("38704") ? true : (stryCov_9fa48("38704", "38705"), (stryMutAct_9fa48("38706") ? options.skipCacheWait : (stryCov_9fa48("38706"), options?.skipCacheWait)) !== (stryMutAct_9fa48("38707") ? false : (stryCov_9fa48("38707"), true)))))) {
                if (stryMutAct_9fa48("38708")) {
                  {}
                } else {
                  stryCov_9fa48("38708");
                  visibilityResult = normalizeSystemTableVisibilityResult(await this.waitForCacheUpdate(tableName, pkValue, stryMutAct_9fa48("38709") ? false : (stryCov_9fa48("38709"), true), stryMutAct_9fa48("38710") ? {} : (stryCov_9fa48("38710"), {
                    allowPendingVisibility: stryMutAct_9fa48("38713") ? options?.allowPendingVisibility !== true : stryMutAct_9fa48("38712") ? false : stryMutAct_9fa48("38711") ? true : (stryCov_9fa48("38711", "38712", "38713"), (stryMutAct_9fa48("38714") ? options.allowPendingVisibility : (stryCov_9fa48("38714"), options?.allowPendingVisibility)) === (stryMutAct_9fa48("38715") ? false : (stryCov_9fa48("38715"), true)))
                  })));
                }
              }
              const cacheWaitDurationMs = stryMutAct_9fa48("38716") ? Date.now() + cacheWaitStartMs : (stryCov_9fa48("38716"), Date.now() - cacheWaitStartMs);
              if (stryMutAct_9fa48("38718") ? false : stryMutAct_9fa48("38717") ? true : (stryCov_9fa48("38717", "38718"), shouldEmitTableWriteMetric(tableName))) {
                if (stryMutAct_9fa48("38719")) {
                  {}
                } else {
                  stryCov_9fa48("38719");
                  try {
                    if (stryMutAct_9fa48("38720")) {
                      {}
                    } else {
                      stryCov_9fa48("38720");
                      this.logger.info(METRICS_LOG_TAG.CDC_WRITE, stryMutAct_9fa48("38721") ? {} : (stryCov_9fa48("38721"), {
                        tableName,
                        operation: CDC_OPERATION.INSERT,
                        sqlDurationMs,
                        cacheWaitDurationMs,
                        totalDurationMs: stryMutAct_9fa48("38722") ? sqlDurationMs - cacheWaitDurationMs : (stryCov_9fa48("38722"), sqlDurationMs + cacheWaitDurationMs)
                      }));
                    }
                  } catch (_metricsErr) {
                    // Metrics logging must not propagate to callers
                  }
                }
              }
              stryMutAct_9fa48("38723") ? this.stats.inserts-- : (stryCov_9fa48("38723"), this.stats.inserts++);
              this.logger.debug(CDC_LOG_MSG.INSERTED_ROW, stryMutAct_9fa48("38724") ? {} : (stryCov_9fa48("38724"), {
                tableName,
                id: trackingId,
                success: stryMutAct_9fa48("38725") ? false : (stryCov_9fa48("38725"), true)
              }));
              this.emit(CDC_EVENT.INSERT, stryMutAct_9fa48("38726") ? {} : (stryCov_9fa48("38726"), {
                tableName,
                data: rowData,
                result
              }));
              return stryMutAct_9fa48("38727") ? {} : (stryCov_9fa48("38727"), {
                success: stryMutAct_9fa48("38728") ? false : (stryCov_9fa48("38728"), true),
                operation: CDCOperationType.INSERT,
                tableName,
                data: rowData,
                affectedRows: stryMutAct_9fa48("38729") ? result.affectedRows : (stryCov_9fa48("38729"), result?.affectedRows),
                partitionResult: result,
                visibilityState: visibilityResult.visibilityState,
                authoritativeVisibilityConfirmed: visibilityResult.authoritativeVisibilityConfirmed,
                retryAfterMs: visibilityResult.retryAfterMs
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("38730")) {
              {}
            } else {
              stryCov_9fa48("38730");
              stryMutAct_9fa48("38731") ? this.stats.failures-- : (stryCov_9fa48("38731"), this.stats.failures++);
              if (stryMutAct_9fa48("38733") ? false : stryMutAct_9fa48("38732") ? true : (stryCov_9fa48("38732", "38733"), shouldLogTableWriteFailure(tableName))) {
                if (stryMutAct_9fa48("38734")) {
                  {}
                } else {
                  stryCov_9fa48("38734");
                  logSystemTableWriteFailure(this, CDC_LOG_MSG.INSERT_FAILED, stryMutAct_9fa48("38735") ? {} : (stryCov_9fa48("38735"), {
                    tableName,
                    id: trackingId,
                    error: error.message,
                    nodeId: this.nodeId,
                    causeId: (stryMutAct_9fa48("38738") ? typeof options?.causeId !== TYPEOF.STRING : stryMutAct_9fa48("38737") ? false : stryMutAct_9fa48("38736") ? true : (stryCov_9fa48("38736", "38737", "38738"), typeof (stryMutAct_9fa48("38739") ? options.causeId : (stryCov_9fa48("38739"), options?.causeId)) === TYPEOF.STRING)) ? options.causeId : null,
                    operation: CDC_OPERATION.INSERT,
                    primaryKey: trackingId ? stryMutAct_9fa48("38740") ? {} : (stryCov_9fa48("38740"), {
                      [idField]: trackingId
                    }) : null
                  }), error);
                }
              }
              this.emitErrorEvent(stryMutAct_9fa48("38741") ? {} : (stryCov_9fa48("38741"), {
                operation: CDCOperationType.INSERT,
                tableName,
                data: rowData,
                error: error.message
              }));
              throw error;
            }
          }
        }
      });
    }
  }

  /**
   * Update a row in a system table.
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} whereClause - WHERE clause conditions (must include primary key).
   * @param {Object} data - Data to update.
   * @return {Promise<Object>} Update result.
   */
  async updateSystemTableRow(tableName, whereClause, data, options = {}) {
    if (stryMutAct_9fa48("38742")) {
      {}
    } else {
      stryCov_9fa48("38742");
      this.validateTableName(tableName);
      this.validateData(whereClause, CDC_OPERATION_LABEL.UPDATE_WHERE);
      this.validateData(data, CDC_OPERATION_LABEL.UPDATE_DATA);
      const idField = this.getPrimaryKeyField(tableName);
      const id = stryMutAct_9fa48("38745") ? whereClause[idField] && whereClause[CDC_PRIMARY_KEY.FALLBACK] : stryMutAct_9fa48("38744") ? false : stryMutAct_9fa48("38743") ? true : (stryCov_9fa48("38743", "38744", "38745"), whereClause[idField] || whereClause[CDC_PRIMARY_KEY.FALLBACK]);
      if (stryMutAct_9fa48("38748") ? false : stryMutAct_9fa48("38747") ? true : stryMutAct_9fa48("38746") ? id : (stryCov_9fa48("38746", "38747", "38748"), !id)) {
        if (stryMutAct_9fa48("38749")) {
          {}
        } else {
          stryCov_9fa48("38749");
          throw new Error((stryMutAct_9fa48("38750") ? `` : (stryCov_9fa48("38750"), `${CDC_ERROR_MSG.UPDATE_PRIMARY_KEY_PREFIX}${idField}`)) + (stryMutAct_9fa48("38751") ? `` : (stryCov_9fa48("38751"), `${CDC_ERROR_MSG.UPDATE_PRIMARY_KEY_SUFFIX}`)));
        }
      }
      const updateData = this.filterDataForTable(tableName, stryMutAct_9fa48("38752") ? {} : (stryCov_9fa48("38752"), {
        ...data
      }));
      if (stryMutAct_9fa48("38755") ? Object.keys(updateData).length !== NUM.ZERO : stryMutAct_9fa48("38754") ? false : stryMutAct_9fa48("38753") ? true : (stryCov_9fa48("38753", "38754", "38755"), Object.keys(updateData).length === NUM.ZERO)) {
        if (stryMutAct_9fa48("38756")) {
          {}
        } else {
          stryCov_9fa48("38756");
          throw new Error(stryMutAct_9fa48("38757") ? `` : (stryCov_9fa48("38757"), `${CDC_ERROR_MSG.UPDATE_VALID_COLUMNS_PREFIX}${tableName}`));
        }
      }
      const singleFlightKey = this.buildMutationSingleFlightKey(CDC_OPERATION.UPDATE, tableName, id, stryMutAct_9fa48("38758") ? {} : (stryCov_9fa48("38758"), {
        whereClause,
        data: updateData
      }), options);
      this.logger.debug(CDC_LOG_MSG.UPDATING_ROW, stryMutAct_9fa48("38759") ? {} : (stryCov_9fa48("38759"), {
        tableName,
        id,
        nodeId: this.nodeId
      }));
      return this.runCoalescedMutation(singleFlightKey, async () => {
        if (stryMutAct_9fa48("38760")) {
          {}
        } else {
          stryCov_9fa48("38760");
          try {
            if (stryMutAct_9fa48("38761")) {
              {}
            } else {
              stryCov_9fa48("38761");
              const {
                setClause,
                values: setValues
              } = this.buildUpdateParts(updateData);
              const {
                whereStr,
                values: whereValues
              } = this.buildWhereParts(whereClause);
              const sql = (stryMutAct_9fa48("38762") ? `` : (stryCov_9fa48("38762"), `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClause} `)) + (stryMutAct_9fa48("38763") ? `` : (stryCov_9fa48("38763"), `${SQL.WHERE} ${whereStr}`));
              const sqlStartMs = Date.now();
              const result = await this.executeSQL(sql, stryMutAct_9fa48("38764") ? [] : (stryCov_9fa48("38764"), [...setValues, ...whereValues]), stryMutAct_9fa48("38765") ? {} : (stryCov_9fa48("38765"), {
                queryTimeoutMs: stryMutAct_9fa48("38766") ? options.queryTimeoutMs : (stryCov_9fa48("38766"), options?.queryTimeoutMs),
                cancellationToken: stryMutAct_9fa48("38769") ? options?.cancellationToken && null : stryMutAct_9fa48("38768") ? false : stryMutAct_9fa48("38767") ? true : (stryCov_9fa48("38767", "38768", "38769"), (stryMutAct_9fa48("38770") ? options.cancellationToken : (stryCov_9fa48("38770"), options?.cancellationToken)) || null),
                routingReadinessDimension: stryMutAct_9fa48("38771") ? options.routingReadinessDimension : (stryCov_9fa48("38771"), options?.routingReadinessDimension),
                workClass: stryMutAct_9fa48("38772") ? options.workClass : (stryCov_9fa48("38772"), options?.workClass),
                allowPressureDefer: stryMutAct_9fa48("38773") ? options.allowPressureDefer : (stryCov_9fa48("38773"), options?.allowPressureDefer),
                pressureRetryAfterMs: stryMutAct_9fa48("38774") ? options.pressureRetryAfterMs : (stryCov_9fa48("38774"), options?.pressureRetryAfterMs),
                deliveryPriority: stryMutAct_9fa48("38775") ? options.deliveryPriority : (stryCov_9fa48("38775"), options?.deliveryPriority)
              }));
              const sqlDurationMs = stryMutAct_9fa48("38776") ? Date.now() + sqlStartMs : (stryCov_9fa48("38776"), Date.now() - sqlStartMs);
              if (stryMutAct_9fa48("38779") ? false : stryMutAct_9fa48("38778") ? true : stryMutAct_9fa48("38777") ? result.success : (stryCov_9fa48("38777", "38778", "38779"), !result.success)) {
                if (stryMutAct_9fa48("38780")) {
                  {}
                } else {
                  stryCov_9fa48("38780");
                  throw buildSystemTableMutationError(result, CDC_ERROR_MSG.UPDATE_FAILED);
                }
              }
              const cacheWaitStartMs = Date.now();
              let visibilityResult = buildSystemTableVisibilityResult();
              if (stryMutAct_9fa48("38783") ? options?.skipCacheWait !== true || typeof result.affectedRows !== TYPEOF.NUMBER || result.affectedRows > NUM.ZERO : stryMutAct_9fa48("38782") ? false : stryMutAct_9fa48("38781") ? true : (stryCov_9fa48("38781", "38782", "38783"), (stryMutAct_9fa48("38785") ? options?.skipCacheWait === true : stryMutAct_9fa48("38784") ? true : (stryCov_9fa48("38784", "38785"), (stryMutAct_9fa48("38786") ? options.skipCacheWait : (stryCov_9fa48("38786"), options?.skipCacheWait)) !== (stryMutAct_9fa48("38787") ? false : (stryCov_9fa48("38787"), true)))) && (stryMutAct_9fa48("38789") ? typeof result.affectedRows !== TYPEOF.NUMBER && result.affectedRows > NUM.ZERO : stryMutAct_9fa48("38788") ? true : (stryCov_9fa48("38788", "38789"), (stryMutAct_9fa48("38791") ? typeof result.affectedRows === TYPEOF.NUMBER : stryMutAct_9fa48("38790") ? false : (stryCov_9fa48("38790", "38791"), typeof result.affectedRows !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("38794") ? result.affectedRows <= NUM.ZERO : stryMutAct_9fa48("38793") ? result.affectedRows >= NUM.ZERO : stryMutAct_9fa48("38792") ? false : (stryCov_9fa48("38792", "38793", "38794"), result.affectedRows > NUM.ZERO)))))) {
                if (stryMutAct_9fa48("38795")) {
                  {}
                } else {
                  stryCov_9fa48("38795");
                  const expectedCacheFields = (stryMutAct_9fa48("38798") ? options?.expectedCacheFields || typeof options.expectedCacheFields === TYPEOF.OBJECT : stryMutAct_9fa48("38797") ? false : stryMutAct_9fa48("38796") ? true : (stryCov_9fa48("38796", "38797", "38798"), (stryMutAct_9fa48("38799") ? options.expectedCacheFields : (stryCov_9fa48("38799"), options?.expectedCacheFields)) && (stryMutAct_9fa48("38801") ? typeof options.expectedCacheFields !== TYPEOF.OBJECT : stryMutAct_9fa48("38800") ? true : (stryCov_9fa48("38800", "38801"), typeof options.expectedCacheFields === TYPEOF.OBJECT)))) ? options.expectedCacheFields : null;
                  const minimumCacheFields = (stryMutAct_9fa48("38804") ? options?.minimumCacheFields || typeof options.minimumCacheFields === TYPEOF.OBJECT : stryMutAct_9fa48("38803") ? false : stryMutAct_9fa48("38802") ? true : (stryCov_9fa48("38802", "38803", "38804"), (stryMutAct_9fa48("38805") ? options.minimumCacheFields : (stryCov_9fa48("38805"), options?.minimumCacheFields)) && (stryMutAct_9fa48("38807") ? typeof options.minimumCacheFields !== TYPEOF.OBJECT : stryMutAct_9fa48("38806") ? true : (stryCov_9fa48("38806", "38807"), typeof options.minimumCacheFields === TYPEOF.OBJECT)))) ? options.minimumCacheFields : null;
                  visibilityResult = normalizeSystemTableVisibilityResult(await this.waitForCacheUpdate(tableName, id, stryMutAct_9fa48("38808") ? false : (stryCov_9fa48("38808"), true), stryMutAct_9fa48("38809") ? {} : (stryCov_9fa48("38809"), {
                    expectedFields: expectedCacheFields,
                    minimumFields: minimumCacheFields,
                    allowPendingVisibility: stryMutAct_9fa48("38812") ? options?.allowPendingVisibility !== true : stryMutAct_9fa48("38811") ? false : stryMutAct_9fa48("38810") ? true : (stryCov_9fa48("38810", "38811", "38812"), (stryMutAct_9fa48("38813") ? options.allowPendingVisibility : (stryCov_9fa48("38813"), options?.allowPendingVisibility)) === (stryMutAct_9fa48("38814") ? false : (stryCov_9fa48("38814"), true)))
                  })));
                }
              }
              const cacheWaitDurationMs = stryMutAct_9fa48("38815") ? Date.now() + cacheWaitStartMs : (stryCov_9fa48("38815"), Date.now() - cacheWaitStartMs);
              if (stryMutAct_9fa48("38817") ? false : stryMutAct_9fa48("38816") ? true : (stryCov_9fa48("38816", "38817"), shouldEmitTableWriteMetric(tableName))) {
                if (stryMutAct_9fa48("38818")) {
                  {}
                } else {
                  stryCov_9fa48("38818");
                  try {
                    if (stryMutAct_9fa48("38819")) {
                      {}
                    } else {
                      stryCov_9fa48("38819");
                      this.logger.info(METRICS_LOG_TAG.CDC_WRITE, stryMutAct_9fa48("38820") ? {} : (stryCov_9fa48("38820"), {
                        tableName,
                        operation: CDC_OPERATION.UPDATE,
                        sqlDurationMs,
                        cacheWaitDurationMs,
                        totalDurationMs: stryMutAct_9fa48("38821") ? sqlDurationMs - cacheWaitDurationMs : (stryCov_9fa48("38821"), sqlDurationMs + cacheWaitDurationMs)
                      }));
                    }
                  } catch (_metricsErr) {
                    // Metrics logging must not propagate to callers
                  }
                }
              }
              stryMutAct_9fa48("38822") ? this.stats.updates-- : (stryCov_9fa48("38822"), this.stats.updates++);
              this.logger.debug(CDC_LOG_MSG.UPDATED_ROW, stryMutAct_9fa48("38823") ? {} : (stryCov_9fa48("38823"), {
                tableName,
                id,
                success: stryMutAct_9fa48("38824") ? false : (stryCov_9fa48("38824"), true),
                changes: result.affectedRows
              }));
              this.emit(CDC_EVENT.UPDATE, stryMutAct_9fa48("38825") ? {} : (stryCov_9fa48("38825"), {
                tableName,
                whereClause,
                data: updateData,
                result
              }));
              return stryMutAct_9fa48("38826") ? {} : (stryCov_9fa48("38826"), {
                success: stryMutAct_9fa48("38827") ? false : (stryCov_9fa48("38827"), true),
                operation: CDCOperationType.UPDATE,
                tableName,
                whereClause,
                data: updateData,
                partitionResult: result,
                visibilityState: visibilityResult.visibilityState,
                authoritativeVisibilityConfirmed: visibilityResult.authoritativeVisibilityConfirmed,
                retryAfterMs: visibilityResult.retryAfterMs
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("38828")) {
              {}
            } else {
              stryCov_9fa48("38828");
              stryMutAct_9fa48("38829") ? this.stats.failures-- : (stryCov_9fa48("38829"), this.stats.failures++);
              if (stryMutAct_9fa48("38831") ? false : stryMutAct_9fa48("38830") ? true : (stryCov_9fa48("38830", "38831"), shouldLogTableWriteFailure(tableName))) {
                if (stryMutAct_9fa48("38832")) {
                  {}
                } else {
                  stryCov_9fa48("38832");
                  logSystemTableWriteFailure(this, CDC_LOG_MSG.UPDATE_FAILED, stryMutAct_9fa48("38833") ? {} : (stryCov_9fa48("38833"), {
                    tableName,
                    id,
                    error: error.message,
                    nodeId: this.nodeId,
                    causeId: (stryMutAct_9fa48("38836") ? typeof options?.causeId !== TYPEOF.STRING : stryMutAct_9fa48("38835") ? false : stryMutAct_9fa48("38834") ? true : (stryCov_9fa48("38834", "38835", "38836"), typeof (stryMutAct_9fa48("38837") ? options.causeId : (stryCov_9fa48("38837"), options?.causeId)) === TYPEOF.STRING)) ? options.causeId : null,
                    operation: CDC_OPERATION.UPDATE,
                    primaryKey: stryMutAct_9fa48("38838") ? {} : (stryCov_9fa48("38838"), {
                      [idField]: id
                    })
                  }), error);
                }
              }
              this.emitErrorEvent(stryMutAct_9fa48("38839") ? {} : (stryCov_9fa48("38839"), {
                operation: CDCOperationType.UPDATE,
                tableName,
                whereClause,
                data: updateData,
                error: error.message
              }));
              throw error;
            }
          }
        }
      });
    }
  }

  /**
   * Delete a row from a system table.
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} whereClause - WHERE clause conditions (must include primary key).
   * @param {Object} [options] - Delete options.
   * @return {Promise<Object>} Delete result.
   */
  async deleteSystemTableRow(tableName, whereClause, options = {}) {
    if (stryMutAct_9fa48("38840")) {
      {}
    } else {
      stryCov_9fa48("38840");
      this.validateTableName(tableName);
      this.validateData(whereClause, CDC_OPERATION_LABEL.DELETE_WHERE);
      const idField = this.getPrimaryKeyField(tableName);
      const id = stryMutAct_9fa48("38843") ? whereClause[idField] && whereClause[CDC_PRIMARY_KEY.FALLBACK] : stryMutAct_9fa48("38842") ? false : stryMutAct_9fa48("38841") ? true : (stryCov_9fa48("38841", "38842", "38843"), whereClause[idField] || whereClause[CDC_PRIMARY_KEY.FALLBACK]);
      if (stryMutAct_9fa48("38846") ? false : stryMutAct_9fa48("38845") ? true : stryMutAct_9fa48("38844") ? id : (stryCov_9fa48("38844", "38845", "38846"), !id)) {
        if (stryMutAct_9fa48("38847")) {
          {}
        } else {
          stryCov_9fa48("38847");
          throw new Error((stryMutAct_9fa48("38848") ? `` : (stryCov_9fa48("38848"), `${CDC_ERROR_MSG.DELETE_PRIMARY_KEY_PREFIX}${idField}`)) + (stryMutAct_9fa48("38849") ? `` : (stryCov_9fa48("38849"), `${CDC_ERROR_MSG.DELETE_PRIMARY_KEY_SUFFIX}`)));
        }
      }
      const singleFlightKey = this.buildMutationSingleFlightKey(CDC_OPERATION.DELETE, tableName, id, stryMutAct_9fa48("38850") ? {} : (stryCov_9fa48("38850"), {
        whereClause
      }), options);
      this.logger.debug(CDC_LOG_MSG.DELETING_ROW, stryMutAct_9fa48("38851") ? {} : (stryCov_9fa48("38851"), {
        tableName,
        id,
        nodeId: this.nodeId
      }));
      return this.runCoalescedMutation(singleFlightKey, async () => {
        if (stryMutAct_9fa48("38852")) {
          {}
        } else {
          stryCov_9fa48("38852");
          try {
            if (stryMutAct_9fa48("38853")) {
              {}
            } else {
              stryCov_9fa48("38853");
              const {
                whereStr,
                values
              } = this.buildWhereParts(whereClause);
              const sql = stryMutAct_9fa48("38854") ? `` : (stryCov_9fa48("38854"), `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereStr}`);
              const result = await this.executeSQL(sql, values, stryMutAct_9fa48("38855") ? {} : (stryCov_9fa48("38855"), {
                queryTimeoutMs: stryMutAct_9fa48("38856") ? options.queryTimeoutMs : (stryCov_9fa48("38856"), options?.queryTimeoutMs),
                cancellationToken: stryMutAct_9fa48("38859") ? options?.cancellationToken && null : stryMutAct_9fa48("38858") ? false : stryMutAct_9fa48("38857") ? true : (stryCov_9fa48("38857", "38858", "38859"), (stryMutAct_9fa48("38860") ? options.cancellationToken : (stryCov_9fa48("38860"), options?.cancellationToken)) || null),
                routingReadinessDimension: stryMutAct_9fa48("38861") ? options.routingReadinessDimension : (stryCov_9fa48("38861"), options?.routingReadinessDimension),
                workClass: stryMutAct_9fa48("38862") ? options.workClass : (stryCov_9fa48("38862"), options?.workClass),
                allowPressureDefer: stryMutAct_9fa48("38863") ? options.allowPressureDefer : (stryCov_9fa48("38863"), options?.allowPressureDefer),
                pressureRetryAfterMs: stryMutAct_9fa48("38864") ? options.pressureRetryAfterMs : (stryCov_9fa48("38864"), options?.pressureRetryAfterMs),
                deliveryPriority: stryMutAct_9fa48("38865") ? options.deliveryPriority : (stryCov_9fa48("38865"), options?.deliveryPriority)
              }));
              if (stryMutAct_9fa48("38868") ? false : stryMutAct_9fa48("38867") ? true : stryMutAct_9fa48("38866") ? result.success : (stryCov_9fa48("38866", "38867", "38868"), !result.success)) {
                if (stryMutAct_9fa48("38869")) {
                  {}
                } else {
                  stryCov_9fa48("38869");
                  throw buildSystemTableMutationError(result, CDC_ERROR_MSG.DELETE_FAILED);
                }
              }
              let visibilityResult = buildSystemTableVisibilityResult();
              if (stryMutAct_9fa48("38872") ? typeof result.affectedRows !== TYPEOF.NUMBER && result.affectedRows > NUM.ZERO : stryMutAct_9fa48("38871") ? false : stryMutAct_9fa48("38870") ? true : (stryCov_9fa48("38870", "38871", "38872"), (stryMutAct_9fa48("38874") ? typeof result.affectedRows === TYPEOF.NUMBER : stryMutAct_9fa48("38873") ? false : (stryCov_9fa48("38873", "38874"), typeof result.affectedRows !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("38877") ? result.affectedRows <= NUM.ZERO : stryMutAct_9fa48("38876") ? result.affectedRows >= NUM.ZERO : stryMutAct_9fa48("38875") ? false : (stryCov_9fa48("38875", "38876", "38877"), result.affectedRows > NUM.ZERO)))) {
                if (stryMutAct_9fa48("38878")) {
                  {}
                } else {
                  stryCov_9fa48("38878");
                  visibilityResult = normalizeSystemTableVisibilityResult(await this.waitForCacheUpdate(tableName, id, stryMutAct_9fa48("38879") ? true : (stryCov_9fa48("38879"), false), stryMutAct_9fa48("38880") ? {} : (stryCov_9fa48("38880"), {
                    allowPendingVisibility: stryMutAct_9fa48("38883") ? options?.allowPendingVisibility !== true : stryMutAct_9fa48("38882") ? false : stryMutAct_9fa48("38881") ? true : (stryCov_9fa48("38881", "38882", "38883"), (stryMutAct_9fa48("38884") ? options.allowPendingVisibility : (stryCov_9fa48("38884"), options?.allowPendingVisibility)) === (stryMutAct_9fa48("38885") ? false : (stryCov_9fa48("38885"), true)))
                  })));
                }
              }
              stryMutAct_9fa48("38886") ? this.stats.deletes-- : (stryCov_9fa48("38886"), this.stats.deletes++);
              this.logger.debug(CDC_LOG_MSG.DELETED_ROW, stryMutAct_9fa48("38887") ? {} : (stryCov_9fa48("38887"), {
                tableName,
                id,
                success: stryMutAct_9fa48("38888") ? false : (stryCov_9fa48("38888"), true),
                changes: result.affectedRows
              }));
              this.emit(CDC_EVENT.DELETE, stryMutAct_9fa48("38889") ? {} : (stryCov_9fa48("38889"), {
                tableName,
                whereClause,
                id,
                result
              }));
              return stryMutAct_9fa48("38890") ? {} : (stryCov_9fa48("38890"), {
                success: stryMutAct_9fa48("38891") ? false : (stryCov_9fa48("38891"), true),
                operation: CDCOperationType.DELETE,
                tableName,
                whereClause,
                id,
                partitionResult: result,
                visibilityState: visibilityResult.visibilityState,
                authoritativeVisibilityConfirmed: visibilityResult.authoritativeVisibilityConfirmed,
                retryAfterMs: visibilityResult.retryAfterMs
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("38892")) {
              {}
            } else {
              stryCov_9fa48("38892");
              stryMutAct_9fa48("38893") ? this.stats.failures-- : (stryCov_9fa48("38893"), this.stats.failures++);
              if (stryMutAct_9fa48("38895") ? false : stryMutAct_9fa48("38894") ? true : (stryCov_9fa48("38894", "38895"), shouldLogTableWriteFailure(tableName))) {
                if (stryMutAct_9fa48("38896")) {
                  {}
                } else {
                  stryCov_9fa48("38896");
                  logSystemTableWriteFailure(this, CDC_LOG_MSG.DELETE_FAILED, stryMutAct_9fa48("38897") ? {} : (stryCov_9fa48("38897"), {
                    tableName,
                    id,
                    error: error.message,
                    nodeId: this.nodeId,
                    causeId: (stryMutAct_9fa48("38900") ? typeof options?.causeId !== TYPEOF.STRING : stryMutAct_9fa48("38899") ? false : stryMutAct_9fa48("38898") ? true : (stryCov_9fa48("38898", "38899", "38900"), typeof (stryMutAct_9fa48("38901") ? options.causeId : (stryCov_9fa48("38901"), options?.causeId)) === TYPEOF.STRING)) ? options.causeId : null,
                    operation: CDC_OPERATION.DELETE,
                    primaryKey: stryMutAct_9fa48("38902") ? {} : (stryCov_9fa48("38902"), {
                      [idField]: id
                    })
                  }), error);
                }
              }
              this.emitErrorEvent(stryMutAct_9fa48("38903") ? {} : (stryCov_9fa48("38903"), {
                operation: CDCOperationType.DELETE,
                tableName,
                whereClause,
                error: error.message
              }));
              throw error;
            }
          }
        }
      });
    }
  }

  /**
   * Upsert a row in a system table (insert or replace on conflict).
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data to upsert (must include primary key).
   * @return {Promise<Object>} Upsert result.
   */
  async upsertSystemTableRow(tableName, data, options = {}) {
    if (stryMutAct_9fa48("38904")) {
      {}
    } else {
      stryCov_9fa48("38904");
      this.validateTableName(tableName);
      this.validateData(data, CDC_OPERATION_LABEL.UPSERT);
      const upsertData = this.prepareInsertData(tableName, data, stryMutAct_9fa48("38905") ? {} : (stryCov_9fa48("38905"), {
        generatePrimaryKey: stryMutAct_9fa48("38906") ? true : (stryCov_9fa48("38906"), false)
      }));
      const idField = this.getPrimaryKeyField(tableName);
      const id = upsertData[idField];
      if (stryMutAct_9fa48("38909") ? false : stryMutAct_9fa48("38908") ? true : stryMutAct_9fa48("38907") ? id : (stryCov_9fa48("38907", "38908", "38909"), !id)) {
        if (stryMutAct_9fa48("38910")) {
          {}
        } else {
          stryCov_9fa48("38910");
          throw new Error((stryMutAct_9fa48("38911") ? `` : (stryCov_9fa48("38911"), `${CDC_ERROR_MSG.UPSERT_PRIMARY_KEY_PREFIX}${idField}`)) + (stryMutAct_9fa48("38912") ? `` : (stryCov_9fa48("38912"), `${CDC_ERROR_MSG.UPSERT_PRIMARY_KEY_SUFFIX}`)));
        }
      }
      const singleFlightKey = this.buildMutationSingleFlightKey(CDC_OPERATION.UPSERT, tableName, id, upsertData, options);
      this.logger.debug(CDC_LOG_MSG.UPSERTING_ROW, stryMutAct_9fa48("38913") ? {} : (stryCov_9fa48("38913"), {
        tableName,
        id,
        nodeId: this.nodeId
      }));
      return this.runCoalescedMutation(singleFlightKey, async () => {
        if (stryMutAct_9fa48("38914")) {
          {}
        } else {
          stryCov_9fa48("38914");
          try {
            if (stryMutAct_9fa48("38915")) {
              {}
            } else {
              stryCov_9fa48("38915");
              const {
                columns,
                placeholders,
                values
              } = this.buildInsertParts(upsertData);
              // SQLite INSERT OR REPLACE
              const sql = (stryMutAct_9fa48("38916") ? `` : (stryCov_9fa48("38916"), `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} (${columns}) `)) + (stryMutAct_9fa48("38917") ? `` : (stryCov_9fa48("38917"), `${SQL.VALUES} (${placeholders})`));
              const result = await this.executeSQL(sql, values, stryMutAct_9fa48("38918") ? {} : (stryCov_9fa48("38918"), {
                queryTimeoutMs: stryMutAct_9fa48("38919") ? options.queryTimeoutMs : (stryCov_9fa48("38919"), options?.queryTimeoutMs),
                cancellationToken: stryMutAct_9fa48("38922") ? options?.cancellationToken && null : stryMutAct_9fa48("38921") ? false : stryMutAct_9fa48("38920") ? true : (stryCov_9fa48("38920", "38921", "38922"), (stryMutAct_9fa48("38923") ? options.cancellationToken : (stryCov_9fa48("38923"), options?.cancellationToken)) || null),
                routingReadinessDimension: stryMutAct_9fa48("38924") ? options.routingReadinessDimension : (stryCov_9fa48("38924"), options?.routingReadinessDimension),
                workClass: stryMutAct_9fa48("38925") ? options.workClass : (stryCov_9fa48("38925"), options?.workClass),
                allowPressureDefer: stryMutAct_9fa48("38926") ? options.allowPressureDefer : (stryCov_9fa48("38926"), options?.allowPressureDefer),
                pressureRetryAfterMs: stryMutAct_9fa48("38927") ? options.pressureRetryAfterMs : (stryCov_9fa48("38927"), options?.pressureRetryAfterMs),
                deliveryPriority: stryMutAct_9fa48("38928") ? options.deliveryPriority : (stryCov_9fa48("38928"), options?.deliveryPriority)
              }));
              if (stryMutAct_9fa48("38931") ? false : stryMutAct_9fa48("38930") ? true : stryMutAct_9fa48("38929") ? result.success : (stryCov_9fa48("38929", "38930", "38931"), !result.success)) {
                if (stryMutAct_9fa48("38932")) {
                  {}
                } else {
                  stryCov_9fa48("38932");
                  throw buildSystemTableMutationError(result, CDC_ERROR_MSG.UPSERT_FAILED);
                }
              }
              let visibilityResult = buildSystemTableVisibilityResult();
              if (stryMutAct_9fa48("38935") ? options?.skipCacheWait === true : stryMutAct_9fa48("38934") ? false : stryMutAct_9fa48("38933") ? true : (stryCov_9fa48("38933", "38934", "38935"), (stryMutAct_9fa48("38936") ? options.skipCacheWait : (stryCov_9fa48("38936"), options?.skipCacheWait)) !== (stryMutAct_9fa48("38937") ? false : (stryCov_9fa48("38937"), true)))) {
                if (stryMutAct_9fa48("38938")) {
                  {}
                } else {
                  stryCov_9fa48("38938");
                  visibilityResult = normalizeSystemTableVisibilityResult(await this.waitForCacheUpdate(tableName, id, stryMutAct_9fa48("38939") ? false : (stryCov_9fa48("38939"), true), stryMutAct_9fa48("38940") ? {} : (stryCov_9fa48("38940"), {
                    allowPendingVisibility: stryMutAct_9fa48("38943") ? options?.allowPendingVisibility !== true : stryMutAct_9fa48("38942") ? false : stryMutAct_9fa48("38941") ? true : (stryCov_9fa48("38941", "38942", "38943"), (stryMutAct_9fa48("38944") ? options.allowPendingVisibility : (stryCov_9fa48("38944"), options?.allowPendingVisibility)) === (stryMutAct_9fa48("38945") ? false : (stryCov_9fa48("38945"), true)))
                  })));
                }
              }
              stryMutAct_9fa48("38946") ? this.stats.updates-- : (stryCov_9fa48("38946"), this.stats.updates++);
              this.logger.debug(CDC_LOG_MSG.UPSERTED_ROW, stryMutAct_9fa48("38947") ? {} : (stryCov_9fa48("38947"), {
                tableName,
                id,
                success: stryMutAct_9fa48("38948") ? false : (stryCov_9fa48("38948"), true)
              }));
              this.emit(CDC_EVENT.UPSERT, stryMutAct_9fa48("38949") ? {} : (stryCov_9fa48("38949"), {
                tableName,
                data: upsertData,
                result
              }));
              return stryMutAct_9fa48("38950") ? {} : (stryCov_9fa48("38950"), {
                success: stryMutAct_9fa48("38951") ? false : (stryCov_9fa48("38951"), true),
                operation: CDCOperationType.UPSERT,
                tableName,
                data: upsertData,
                partitionResult: result,
                visibilityState: visibilityResult.visibilityState,
                authoritativeVisibilityConfirmed: visibilityResult.authoritativeVisibilityConfirmed,
                retryAfterMs: visibilityResult.retryAfterMs
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("38952")) {
              {}
            } else {
              stryCov_9fa48("38952");
              stryMutAct_9fa48("38953") ? this.stats.failures-- : (stryCov_9fa48("38953"), this.stats.failures++);
              if (stryMutAct_9fa48("38955") ? false : stryMutAct_9fa48("38954") ? true : (stryCov_9fa48("38954", "38955"), shouldLogTableWriteFailure(tableName))) {
                if (stryMutAct_9fa48("38956")) {
                  {}
                } else {
                  stryCov_9fa48("38956");
                  logSystemTableWriteFailure(this, CDC_LOG_MSG.UPSERT_FAILED, stryMutAct_9fa48("38957") ? {} : (stryCov_9fa48("38957"), {
                    tableName,
                    id,
                    error: error.message,
                    nodeId: this.nodeId,
                    causeId: (stryMutAct_9fa48("38960") ? typeof options?.causeId !== TYPEOF.STRING : stryMutAct_9fa48("38959") ? false : stryMutAct_9fa48("38958") ? true : (stryCov_9fa48("38958", "38959", "38960"), typeof (stryMutAct_9fa48("38961") ? options.causeId : (stryCov_9fa48("38961"), options?.causeId)) === TYPEOF.STRING)) ? options.causeId : null,
                    operation: CDC_OPERATION.UPSERT,
                    primaryKey: stryMutAct_9fa48("38962") ? {} : (stryCov_9fa48("38962"), {
                      [idField]: id
                    })
                  }), error);
                }
              }
              this.emitErrorEvent(stryMutAct_9fa48("38963") ? {} : (stryCov_9fa48("38963"), {
                operation: CDCOperationType.UPSERT,
                tableName,
                data: upsertData,
                error: error.message
              }));
              throw error;
            }
          }
        }
      });
    }
  }

  /**
   * Get the primary key field name for a system table.
   * @param {string} tableName - System table name.
   * @return {string} Primary key field name.
   * @private
   */
  getPrimaryKeyField(tableName) {
    if (stryMutAct_9fa48("38964")) {
      {}
    } else {
      stryCov_9fa48("38964");
      return getSystemCachePrimaryKeyFieldOrFallback(tableName, CDC_PRIMARY_KEY.FALLBACK);
    }
  }

  /**
   * Get service statistics.
   * @return {Object} Service statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("38965")) {
      {}
    } else {
      stryCov_9fa48("38965");
      return stryMutAct_9fa48("38966") ? {} : (stryCov_9fa48("38966"), {
        ...this.stats,
        total: stryMutAct_9fa48("38967") ? this.stats.inserts + this.stats.updates - this.stats.deletes : (stryCov_9fa48("38967"), (stryMutAct_9fa48("38968") ? this.stats.inserts - this.stats.updates : (stryCov_9fa48("38968"), this.stats.inserts + this.stats.updates)) + this.stats.deletes)
      });
    }
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    if (stryMutAct_9fa48("38969")) {
      {}
    } else {
      stryCov_9fa48("38969");
      this.stats = stryMutAct_9fa48("38970") ? {} : (stryCov_9fa48("38970"), {
        ...CDC_STATS_DEFAULT
      });
    }
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("38971")) {
      {}
    } else {
      stryCov_9fa48("38971");
      return this.initialized;
    }
  }

  /**
   * Set the epoch manager reference for CDC epoch change handling.
   * @param {AssignmentEpochManager} epochManager - The epoch manager instance.
   */
  setEpochManager(epochManager) {
    if (stryMutAct_9fa48("38972")) {
      {}
    } else {
      stryCov_9fa48("38972");
      if (stryMutAct_9fa48("38975") ? false : stryMutAct_9fa48("38974") ? true : stryMutAct_9fa48("38973") ? epochManager : (stryCov_9fa48("38973", "38974", "38975"), !epochManager)) {
        if (stryMutAct_9fa48("38976")) {
          {}
        } else {
          stryCov_9fa48("38976");
          throw new Error(CDC_ERROR_MSG.EPOCH_MANAGER_REQUIRED);
        }
      }
      this.epochManager = epochManager;
      this.logger.debug(CDC_LOG_MSG.EPOCH_MANAGER_SET, stryMutAct_9fa48("38977") ? {} : (stryCov_9fa48("38977"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Handle epoch change CDC event.
   * Listens for epoch changes in the config table and updates the local
   * AssignmentEpochManager.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be config).
   * @param {string} cdcEvent.operation - The operation type (INSERT, UPDATE).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.config_key - The config key.
   * @param {string} cdcEvent.data.config_value - The config value (epoch JSON).
   * @return {{applied: boolean, epoch?: number, error?: string}}
   *   Result object indicating if epoch was applied.
   */
  handleEpochChangeCDC(cdcEvent) {
    if (stryMutAct_9fa48("38978")) {
      {}
    } else {
      stryCov_9fa48("38978");
      return this.ensureEventHandler().handleEpochChangeCDC(cdcEvent);
    }
  }

  /**
   * Set the rebalancer reference for node state change handling.
   * @param {Object} rebalancer - The rebalancer instance (must have onNodeStateChange method).
   */
  setRebalancer(rebalancer) {
    if (stryMutAct_9fa48("38979")) {
      {}
    } else {
      stryCov_9fa48("38979");
      if (stryMutAct_9fa48("38982") ? false : stryMutAct_9fa48("38981") ? true : stryMutAct_9fa48("38980") ? rebalancer : (stryCov_9fa48("38980", "38981", "38982"), !rebalancer)) {
        if (stryMutAct_9fa48("38983")) {
          {}
        } else {
          stryCov_9fa48("38983");
          throw new Error(CDC_ERROR_MSG.REBALANCER_REQUIRED);
        }
      }
      this.rebalancer = rebalancer;
      this.logger.debug(CDC_LOG_MSG.REBALANCER_SET, stryMutAct_9fa48("38984") ? {} : (stryCov_9fa48("38984"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Handle node state change CDC event.
   * Listens for node state changes in the nodes table and triggers
   * the rebalancer when appropriate.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be nodes).
   * @param {string} cdcEvent.operation - The operation type (INSERT, UPDATE).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.node_id - The node ID.
   * @param {string} cdcEvent.data.status - The node status/state.
   * @return {{processed: boolean, nodeId?: string, oldState?: string,
   *   newState?: string, error?: string}}
   *   Result object indicating if the event was processed.
   */
  handleNodeStateCDC(cdcEvent) {
    if (stryMutAct_9fa48("38985")) {
      {}
    } else {
      stryCov_9fa48("38985");
      return this.ensureEventHandler().handleNodeStateCDC(cdcEvent);
    }
  }

  /**
   * Set the message router reference for mesh connectivity.
   * When set, the CDC service will establish connections to new nodes
   * when they are added to the nodes table via CDC events.
   * @param {Object} messageRouter - The message router instance.
   */
  setMessageRouter(messageRouter) {
    if (stryMutAct_9fa48("38986")) {
      {}
    } else {
      stryCov_9fa48("38986");
      if (stryMutAct_9fa48("38989") ? false : stryMutAct_9fa48("38988") ? true : stryMutAct_9fa48("38987") ? messageRouter : (stryCov_9fa48("38987", "38988", "38989"), !messageRouter)) {
        if (stryMutAct_9fa48("38990")) {
          {}
        } else {
          stryCov_9fa48("38990");
          throw new Error(CDC_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
        }
      }
      this.messageRouter = messageRouter;
      this.logger.debug(CDC_LOG_MSG.MESSAGE_ROUTER_SET, stryMutAct_9fa48("38991") ? {} : (stryCov_9fa48("38991"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Handle node joined CDC event for mesh connectivity.
   * When a new node is added to the nodes table, this method establishes
   * an outbound WebSocket connection to that node, ensuring full mesh
   * connectivity across the cluster.
   *
   * All nodes are equal peers - no special treatment for any node.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be nodes).
   * @param {string} cdcEvent.operation - The operation type (INSERT).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.node_id - The node ID.
   * @param {string} cdcEvent.data.node_address - The node address.
   * @return {Promise<{processed: boolean, nodeId?: string, connected?: boolean,
   *   error?: string}>} Result object indicating if connection was established.
   */
  async handleNodeJoinedCDC(cdcEvent) {
    if (stryMutAct_9fa48("38992")) {
      {}
    } else {
      stryCov_9fa48("38992");
      // Validate cdcEvent
      if (stryMutAct_9fa48("38995") ? !cdcEvent && typeof cdcEvent !== TYPEOF.OBJECT : stryMutAct_9fa48("38994") ? false : stryMutAct_9fa48("38993") ? true : (stryCov_9fa48("38993", "38994", "38995"), (stryMutAct_9fa48("38996") ? cdcEvent : (stryCov_9fa48("38996"), !cdcEvent)) || (stryMutAct_9fa48("38998") ? typeof cdcEvent === TYPEOF.OBJECT : stryMutAct_9fa48("38997") ? false : (stryCov_9fa48("38997", "38998"), typeof cdcEvent !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("38999")) {
          {}
        } else {
          stryCov_9fa48("38999");
          return stryMutAct_9fa48("39000") ? {} : (stryCov_9fa48("39000"), {
            processed: stryMutAct_9fa48("39001") ? true : (stryCov_9fa48("39001"), false),
            error: CDC_ERROR_MSG.INVALID_EVENT
          });
        }
      }

      // Check if this is a nodes table INSERT event
      const tableName = cdcEvent.tableName;
      if (stryMutAct_9fa48("39004") ? tableName === SYSTEM_TABLE_NAME.NODES : stryMutAct_9fa48("39003") ? false : stryMutAct_9fa48("39002") ? true : (stryCov_9fa48("39002", "39003", "39004"), tableName !== SYSTEM_TABLE_NAME.NODES)) {
        if (stryMutAct_9fa48("39005")) {
          {}
        } else {
          stryCov_9fa48("39005");
          return stryMutAct_9fa48("39006") ? {} : (stryCov_9fa48("39006"), {
            processed: stryMutAct_9fa48("39007") ? true : (stryCov_9fa48("39007"), false),
            error: stryMutAct_9fa48("39008") ? `` : (stryCov_9fa48("39008"), `${CDC_ERROR_MSG.NOT_NODES_TABLE_PREFIX}'${tableName}'`)
          });
        }
      }

      // Only process INSERT operations (new nodes joining)
      const operation = cdcEvent.operation;
      if (stryMutAct_9fa48("39011") ? operation === CDC_OPERATION.INSERT : stryMutAct_9fa48("39010") ? false : stryMutAct_9fa48("39009") ? true : (stryCov_9fa48("39009", "39010", "39011"), operation !== CDC_OPERATION.INSERT)) {
        if (stryMutAct_9fa48("39012")) {
          {}
        } else {
          stryCov_9fa48("39012");
          return stryMutAct_9fa48("39013") ? {} : (stryCov_9fa48("39013"), {
            processed: stryMutAct_9fa48("39014") ? true : (stryCov_9fa48("39014"), false),
            error: CDC_ERROR_MSG.NOT_INSERT_OPERATION
          });
        }
      }

      // Extract node data
      const targetNodeId = stryMutAct_9fa48("39015") ? cdcEvent.data[COLUMN.NODE_ID] : (stryCov_9fa48("39015"), cdcEvent.data?.[COLUMN.NODE_ID]);
      const nodeAddress = stryMutAct_9fa48("39016") ? cdcEvent.data[COLUMN.NODE_ADDRESS] : (stryCov_9fa48("39016"), cdcEvent.data?.[COLUMN.NODE_ADDRESS]);
      if (stryMutAct_9fa48("39019") ? false : stryMutAct_9fa48("39018") ? true : stryMutAct_9fa48("39017") ? targetNodeId : (stryCov_9fa48("39017", "39018", "39019"), !targetNodeId)) {
        if (stryMutAct_9fa48("39020")) {
          {}
        } else {
          stryCov_9fa48("39020");
          return stryMutAct_9fa48("39021") ? {} : (stryCov_9fa48("39021"), {
            processed: stryMutAct_9fa48("39022") ? true : (stryCov_9fa48("39022"), false),
            error: CDC_ERROR_MSG.NODE_ID_MISSING
          });
        }
      }

      // Skip if this is our own node
      if (stryMutAct_9fa48("39025") ? targetNodeId !== this.nodeId : stryMutAct_9fa48("39024") ? false : stryMutAct_9fa48("39023") ? true : (stryCov_9fa48("39023", "39024", "39025"), targetNodeId === this.nodeId)) {
        if (stryMutAct_9fa48("39026")) {
          {}
        } else {
          stryCov_9fa48("39026");
          this.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_SELF, stryMutAct_9fa48("39027") ? {} : (stryCov_9fa48("39027"), {
            nodeId: this.nodeId,
            targetNodeId
          }));
          return buildCDCNodeJoinedResult(stryMutAct_9fa48("39028") ? {} : (stryCov_9fa48("39028"), {
            processed: stryMutAct_9fa48("39029") ? false : (stryCov_9fa48("39029"), true),
            nodeId: targetNodeId,
            connected: stryMutAct_9fa48("39030") ? true : (stryCov_9fa48("39030"), false),
            skipped: stryMutAct_9fa48("39031") ? false : (stryCov_9fa48("39031"), true),
            reason: CDC_SKIP_REASON.SELF
          }));
        }
      }

      // Skip if no message router is set
      if (stryMutAct_9fa48("39034") ? false : stryMutAct_9fa48("39033") ? true : stryMutAct_9fa48("39032") ? this.messageRouter : (stryCov_9fa48("39032", "39033", "39034"), !this.messageRouter)) {
        if (stryMutAct_9fa48("39035")) {
          {}
        } else {
          stryCov_9fa48("39035");
          return stryMutAct_9fa48("39036") ? {} : (stryCov_9fa48("39036"), {
            processed: stryMutAct_9fa48("39037") ? true : (stryCov_9fa48("39037"), false),
            error: CDC_ERROR_MSG.MESSAGE_ROUTER_NOT_SET
          });
        }
      }
      const connectionState = (stryMutAct_9fa48("39040") ? typeof this.messageRouter.getConnectionState !== TYPEOF.FUNCTION : stryMutAct_9fa48("39039") ? false : stryMutAct_9fa48("39038") ? true : (stryCov_9fa48("39038", "39039", "39040"), typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION)) ? this.messageRouter.getConnectionState(targetNodeId) : stryMutAct_9fa48("39043") ? this.messageRouter.nodeConnections?.get(targetNodeId)?.state && null : stryMutAct_9fa48("39042") ? false : stryMutAct_9fa48("39041") ? true : (stryCov_9fa48("39041", "39042", "39043"), (stryMutAct_9fa48("39045") ? this.messageRouter.nodeConnections.get(targetNodeId)?.state : stryMutAct_9fa48("39044") ? this.messageRouter.nodeConnections?.get(targetNodeId).state : (stryCov_9fa48("39044", "39045"), this.messageRouter.nodeConnections?.get(targetNodeId)?.state)) || null);
      if (stryMutAct_9fa48("39048") ? connectionState !== STATE.CONNECTED : stryMutAct_9fa48("39047") ? false : stryMutAct_9fa48("39046") ? true : (stryCov_9fa48("39046", "39047", "39048"), connectionState === STATE.CONNECTED)) {
        if (stryMutAct_9fa48("39049")) {
          {}
        } else {
          stryCov_9fa48("39049");
          this.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_CONNECTED, stryMutAct_9fa48("39050") ? {} : (stryCov_9fa48("39050"), {
            nodeId: this.nodeId,
            targetNodeId
          }));
          return buildCDCNodeJoinedResult(stryMutAct_9fa48("39051") ? {} : (stryCov_9fa48("39051"), {
            processed: stryMutAct_9fa48("39052") ? false : (stryCov_9fa48("39052"), true),
            nodeId: targetNodeId,
            connected: stryMutAct_9fa48("39053") ? true : (stryCov_9fa48("39053"), false),
            skipped: stryMutAct_9fa48("39054") ? false : (stryCov_9fa48("39054"), true),
            reason: CDC_SKIP_REASON.ALREADY_CONNECTED
          }));
        }
      }
      const wsAddressResolution = resolveNodeWebSocketAddress(stryMutAct_9fa48("39055") ? {} : (stryCov_9fa48("39055"), {
        targetNodeId,
        systemTableCache: this.systemTableCache
      }));
      if (stryMutAct_9fa48("39058") ? wsAddressResolution.state === NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED : stryMutAct_9fa48("39057") ? false : stryMutAct_9fa48("39056") ? true : (stryCov_9fa48("39056", "39057", "39058"), wsAddressResolution.state !== NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED)) {
        if (stryMutAct_9fa48("39059")) {
          {}
        } else {
          stryCov_9fa48("39059");
          this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, stryMutAct_9fa48("39060") ? {} : (stryCov_9fa48("39060"), {
            nodeId: this.nodeId,
            targetNodeId,
            nodeAddress,
            error: CDC_INTEGRATION_SERVICE_ERROR.MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS
          }));
          return buildCDCNodeJoinedResult(stryMutAct_9fa48("39061") ? {} : (stryCov_9fa48("39061"), {
            processed: stryMutAct_9fa48("39062") ? true : (stryCov_9fa48("39062"), false),
            nodeId: targetNodeId,
            error: CDC_INTEGRATION_SERVICE_ERROR.MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS
          }));
        }
      }
      const wsAddress = wsAddressResolution.address;
      this.logger.info(CDC_LOG_MSG.NEW_NODE_DETECTED, stryMutAct_9fa48("39063") ? {} : (stryCov_9fa48("39063"), {
        nodeId: this.nodeId,
        targetNodeId,
        wsAddress
      }));

      // Establish connection to the new node
      try {
        if (stryMutAct_9fa48("39064")) {
          {}
        } else {
          stryCov_9fa48("39064");
          await this.messageRouter.connectToNode(targetNodeId, wsAddress);
          this.logger.info(CDC_LOG_MSG.NEW_NODE_CONNECTED, stryMutAct_9fa48("39065") ? {} : (stryCov_9fa48("39065"), {
            nodeId: this.nodeId,
            targetNodeId,
            wsAddress
          }));

          // Emit nodeJoined event
          this.emit(CDC_EVENT.NODE_JOINED, stryMutAct_9fa48("39066") ? {} : (stryCov_9fa48("39066"), {
            nodeId: targetNodeId,
            nodeAddress,
            wsAddress,
            timestamp: Date.now(),
            source: CDC_SOURCE.CDC
          }));
          return buildCDCNodeJoinedResult(stryMutAct_9fa48("39067") ? {} : (stryCov_9fa48("39067"), {
            processed: stryMutAct_9fa48("39068") ? false : (stryCov_9fa48("39068"), true),
            nodeId: targetNodeId,
            connected: stryMutAct_9fa48("39069") ? false : (stryCov_9fa48("39069"), true),
            wsAddress
          }));
        }
      } catch (connectError) {
        if (stryMutAct_9fa48("39070")) {
          {}
        } else {
          stryCov_9fa48("39070");
          // Log but don't fail - the node might be temporarily unavailable
          // Raft will handle retries and leader election
          this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, stryMutAct_9fa48("39071") ? {} : (stryCov_9fa48("39071"), {
            nodeId: this.nodeId,
            targetNodeId,
            wsAddress,
            error: connectError.message
          }));
          return buildCDCNodeJoinedResult(stryMutAct_9fa48("39072") ? {} : (stryCov_9fa48("39072"), {
            processed: stryMutAct_9fa48("39073") ? true : (stryCov_9fa48("39073"), false),
            nodeId: targetNodeId,
            error: connectError.message
          }));
        }
      }
    }
  }

  /**
   * Derive WebSocket address from node REST address.
   * @param {string} nodeAddress - Node address in format "hostname:port".
   * @return {string|null} WebSocket address or null if cannot derive.
   * @private
   */
  deriveWsAddressFromNodeAddress(nodeAddress) {
    if (stryMutAct_9fa48("39074")) {
      {}
    } else {
      stryCov_9fa48("39074");
      if (stryMutAct_9fa48("39077") ? !nodeAddress && typeof nodeAddress !== TYPEOF.STRING : stryMutAct_9fa48("39076") ? false : stryMutAct_9fa48("39075") ? true : (stryCov_9fa48("39075", "39076", "39077"), (stryMutAct_9fa48("39078") ? nodeAddress : (stryCov_9fa48("39078"), !nodeAddress)) || (stryMutAct_9fa48("39080") ? typeof nodeAddress === TYPEOF.STRING : stryMutAct_9fa48("39079") ? false : (stryCov_9fa48("39079", "39080"), typeof nodeAddress !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("39081")) {
          {}
        } else {
          stryCov_9fa48("39081");
          return null;
        }
      }

      // Parse hostname:port format
      const colonIndex = nodeAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
      if (stryMutAct_9fa48("39084") ? colonIndex === NUM.NEGATIVE_ONE && colonIndex === NUM.ZERO : stryMutAct_9fa48("39083") ? false : stryMutAct_9fa48("39082") ? true : (stryCov_9fa48("39082", "39083", "39084"), (stryMutAct_9fa48("39086") ? colonIndex !== NUM.NEGATIVE_ONE : stryMutAct_9fa48("39085") ? false : (stryCov_9fa48("39085", "39086"), colonIndex === NUM.NEGATIVE_ONE)) || (stryMutAct_9fa48("39088") ? colonIndex !== NUM.ZERO : stryMutAct_9fa48("39087") ? false : (stryCov_9fa48("39087", "39088"), colonIndex === NUM.ZERO)))) {
        if (stryMutAct_9fa48("39089")) {
          {}
        } else {
          stryCov_9fa48("39089");
          // No colon found or colon at start (empty hostname)
          return null;
        }
      }
      const hostname = stryMutAct_9fa48("39090") ? nodeAddress : (stryCov_9fa48("39090"), nodeAddress.substring(NUM.ZERO, colonIndex));
      if (stryMutAct_9fa48("39093") ? !hostname && hostname.length === NUM.ZERO : stryMutAct_9fa48("39092") ? false : stryMutAct_9fa48("39091") ? true : (stryCov_9fa48("39091", "39092", "39093"), (stryMutAct_9fa48("39094") ? hostname : (stryCov_9fa48("39094"), !hostname)) || (stryMutAct_9fa48("39096") ? hostname.length !== NUM.ZERO : stryMutAct_9fa48("39095") ? false : (stryCov_9fa48("39095", "39096"), hostname.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("39097")) {
          {}
        } else {
          stryCov_9fa48("39097");
          return null;
        }
      }
      const portStr = stryMutAct_9fa48("39098") ? nodeAddress : (stryCov_9fa48("39098"), nodeAddress.substring(stryMutAct_9fa48("39099") ? colonIndex - NUM.ONE : (stryCov_9fa48("39099"), colonIndex + NUM.ONE)));
      const restPort = parseInt(portStr, NUM.TEN);
      if (stryMutAct_9fa48("39102") ? !Number.isFinite(restPort) && restPort <= NUM.ZERO : stryMutAct_9fa48("39101") ? false : stryMutAct_9fa48("39100") ? true : (stryCov_9fa48("39100", "39101", "39102"), (stryMutAct_9fa48("39103") ? Number.isFinite(restPort) : (stryCov_9fa48("39103"), !Number.isFinite(restPort))) || (stryMutAct_9fa48("39106") ? restPort > NUM.ZERO : stryMutAct_9fa48("39105") ? restPort < NUM.ZERO : stryMutAct_9fa48("39104") ? false : (stryCov_9fa48("39104", "39105", "39106"), restPort <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("39107")) {
          {}
        } else {
          stryCov_9fa48("39107");
          return null;
        }
      }

      // WebSocket port = REST port + WS_PORT_OFFSET
      const wsPort = stryMutAct_9fa48("39108") ? restPort - ENTRYPOINT_DEFAULT.WS_PORT_OFFSET : (stryCov_9fa48("39108"), restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET);
      return stryMutAct_9fa48("39109") ? `` : (stryCov_9fa48("39109"), `${PROTOCOL.WS}${hostname}${ADDRESS.PORT_SEPARATOR}${wsPort}`);
    }
  }
}
export { CDCIntegrationService, CDCOperationType, EPOCH_CONFIG_KEY, LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY, VALID_SYSTEM_TABLES };