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
import { CONFIG_KEY } from '../config/config-constants.js';
import { NUM } from '../constants/index.js';
const ADMIN_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("799") ? {} : (stryCov_9fa48("799"), {
  WEBSOCKET_API: stryMutAct_9fa48("800") ? "" : (stryCov_9fa48("800"), 'admin-websocket-api')
}));
const ADMIN_ROUTE = Object.freeze(stryMutAct_9fa48("801") ? {} : (stryCov_9fa48("801"), {
  ROOT: stryMutAct_9fa48("802") ? "" : (stryCov_9fa48("802"), '/'),
  HEALTH: stryMutAct_9fa48("803") ? "" : (stryCov_9fa48("803"), '/health'),
  STREAM: stryMutAct_9fa48("804") ? "" : (stryCov_9fa48("804"), '/api/admin/stream'),
  TEST_DASHBOARD: stryMutAct_9fa48("805") ? "" : (stryCov_9fa48("805"), '/ui/tests'),
  TESTS: stryMutAct_9fa48("806") ? "" : (stryCov_9fa48("806"), '/api/admin/tests'),
  TEST_RUNS: stryMutAct_9fa48("807") ? "" : (stryCov_9fa48("807"), '/api/admin/test-runs'),
  TEST_RUN_BY_ID: stryMutAct_9fa48("808") ? "" : (stryCov_9fa48("808"), '/api/admin/test-runs/:runId'),
  TEST_RUN_STOP: stryMutAct_9fa48("809") ? "" : (stryCov_9fa48("809"), '/api/admin/test-runs/:runId/stop'),
  TEST_RUN_STREAM: stryMutAct_9fa48("810") ? "" : (stryCov_9fa48("810"), '/api/admin/test-runs/:runId/stream'),
  SERVICE_DIAGNOSTICS: stryMutAct_9fa48("811") ? "" : (stryCov_9fa48("811"), '/api/admin/diagnostics/services'),
  CDC_DIAGNOSTICS: stryMutAct_9fa48("812") ? "" : (stryCov_9fa48("812"), '/api/admin/diagnostics/cdc'),
  PARTITION_DIAGNOSTICS: stryMutAct_9fa48("813") ? "" : (stryCov_9fa48("813"), '/api/admin/diagnostics/partitions'),
  SQL_DIAGNOSTICS: stryMutAct_9fa48("814") ? "" : (stryCov_9fa48("814"), '/api/admin/diagnostics/sql'),
  PREFLIGHT_CRITICAL_PATH_SNAPSHOT: stryMutAct_9fa48("815") ? "" : (stryCov_9fa48("815"), '/api/admin/diagnostics/preflight-critical-path-snapshot'),
  CONTROL_SNAPSHOT: stryMutAct_9fa48("816") ? "" : (stryCov_9fa48("816"), '/api/admin/control-snapshot'),
  SERVICE_DISCOVERY: stryMutAct_9fa48("817") ? "" : (stryCov_9fa48("817"), '/api/admin/discovery/services'),
  DEBUG_SESSIONS: stryMutAct_9fa48("818") ? "" : (stryCov_9fa48("818"), '/api/admin/debug/sessions'),
  DEBUG_SESSION_BY_ID: stryMutAct_9fa48("819") ? "" : (stryCov_9fa48("819"), '/api/admin/debug/sessions/:sessionId'),
  DEBUG_SESSION_ATTACH: stryMutAct_9fa48("820") ? "" : (stryCov_9fa48("820"), '/api/admin/debug/sessions/:sessionId/attach'),
  DEBUG_SESSION_BREAKPOINTS: stryMutAct_9fa48("821") ? "" : (stryCov_9fa48("821"), '/api/admin/debug/sessions/:sessionId/breakpoints'),
  DEBUG_SESSION_SNAPSHOTS: stryMutAct_9fa48("822") ? "" : (stryCov_9fa48("822"), '/api/admin/debug/sessions/:sessionId/snapshots'),
  DEBUG_SNAPSHOT_BY_ID: stryMutAct_9fa48("823") ? "" : (stryCov_9fa48("823"), '/api/admin/debug/snapshots/:snapshotId'),
  DEBUG_DAP_REQUEST: stryMutAct_9fa48("824") ? "" : (stryCov_9fa48("824"), '/api/admin/debug/dap/request'),
  DEBUG_TRACE_STREAM: stryMutAct_9fa48("825") ? "" : (stryCov_9fa48("825"), '/api/admin/debug/trace'),
  PLAYBACK_VIEWER: stryMutAct_9fa48("826") ? "" : (stryCov_9fa48("826"), '/ui/playback-viewer'),
  OUTPUT_FILES: stryMutAct_9fa48("827") ? "" : (stryCov_9fa48("827"), '/ui/test-output/*')
}));
const ADMIN_STATUS = Object.freeze(stryMutAct_9fa48("828") ? {} : (stryCov_9fa48("828"), {
  HEALTHY: stryMutAct_9fa48("829") ? "" : (stryCov_9fa48("829"), 'healthy')
}));
const ADMIN_CLIENT = Object.freeze(stryMutAct_9fa48("830") ? {} : (stryCov_9fa48("830"), {
  PREFIX: stryMutAct_9fa48("831") ? "" : (stryCov_9fa48("831"), 'client-'),
  RANDOM_BASE: 36,
  RANDOM_START: 2,
  RANDOM_LENGTH: 9
}));
const ADMIN_LIMIT = Object.freeze(stryMutAct_9fa48("832") ? {} : (stryCov_9fa48("832"), {
  SQL_PREVIEW_LENGTH: NUM.HUNDRED
}));
const ADMIN_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("833") ? {} : (stryCov_9fa48("833"), {
  QUERY_TIMEOUT_MS: CONFIG_KEY.ADMIN_QUERY_TIMEOUT_MS,
  CACHE_DUMP_TIMEOUT_MS: CONFIG_KEY.ADMIN_CACHE_DUMP_TIMEOUT_MS
}));
const ADMIN_DEFAULT = Object.freeze(stryMutAct_9fa48("834") ? {} : (stryCov_9fa48("834"), {
  NODE_ID: stryMutAct_9fa48("835") ? "" : (stryCov_9fa48("835"), 'admin-api'),
  WEBSOCKET_PORT: 8081,
  QUERY_TIMEOUT_MS: 30000,
  CACHE_DUMP_TIMEOUT_MS: 5000,
  HOST: stryMutAct_9fa48("836") ? "" : (stryCov_9fa48("836"), '0.0.0.0'),
  ENFORCEMENT_MODE: stryMutAct_9fa48("837") ? "" : (stryCov_9fa48("837"), 'observe')
}));
const ADMIN_STANDALONE_DEFAULT = Object.freeze(stryMutAct_9fa48("838") ? {} : (stryCov_9fa48("838"), {
  HOST: stryMutAct_9fa48("839") ? "" : (stryCov_9fa48("839"), '127.0.0.1'),
  PORT: 8181,
  NODE_ID: stryMutAct_9fa48("840") ? "" : (stryCov_9fa48("840"), 'standalone-test-run-server')
}));
const ADMIN_CONTENT_TYPE = Object.freeze(stryMutAct_9fa48("841") ? {} : (stryCov_9fa48("841"), {
  HTML: stryMutAct_9fa48("842") ? "" : (stryCov_9fa48("842"), 'text/html; charset=utf-8'),
  JSON: stryMutAct_9fa48("843") ? "" : (stryCov_9fa48("843"), 'application/json; charset=utf-8'),
  NDJSON: stryMutAct_9fa48("844") ? "" : (stryCov_9fa48("844"), 'application/x-ndjson; charset=utf-8'),
  JAVASCRIPT: stryMutAct_9fa48("845") ? "" : (stryCov_9fa48("845"), 'application/javascript; charset=utf-8'),
  CSS: stryMutAct_9fa48("846") ? "" : (stryCov_9fa48("846"), 'text/css; charset=utf-8'),
  TEXT: stryMutAct_9fa48("847") ? "" : (stryCov_9fa48("847"), 'text/plain; charset=utf-8'),
  EVENT_STREAM: stryMutAct_9fa48("848") ? "" : (stryCov_9fa48("848"), 'text/event-stream; charset=utf-8')
}));
const ADMIN_HEADER = Object.freeze(stryMutAct_9fa48("849") ? {} : (stryCov_9fa48("849"), {
  TENANT_ID: stryMutAct_9fa48("850") ? "" : (stryCov_9fa48("850"), 'x-tenant-id'),
  PRINCIPAL: stryMutAct_9fa48("851") ? "" : (stryCov_9fa48("851"), 'x-principal'),
  ROLES: stryMutAct_9fa48("852") ? "" : (stryCov_9fa48("852"), 'x-roles')
}));
const ADMIN_TEST_RUN_PATH = Object.freeze(stryMutAct_9fa48("853") ? {} : (stryCov_9fa48("853"), {
  SCENARIOS_DIR: stryMutAct_9fa48("854") ? "" : (stryCov_9fa48("854"), 'test/distributed/scenarios'),
  CONFIG_DIR: stryMutAct_9fa48("855") ? "" : (stryCov_9fa48("855"), 'test/distributed/config'),
  RUNNER_SCRIPT: stryMutAct_9fa48("856") ? "" : (stryCov_9fa48("856"), 'test/distributed/run.js'),
  OUTPUT_DIR: stryMutAct_9fa48("857") ? "" : (stryCov_9fa48("857"), 'test-output'),
  METADATA_DIR: stryMutAct_9fa48("858") ? "" : (stryCov_9fa48("858"), '.run-metadata'),
  DASHBOARD_PAGE: stryMutAct_9fa48("859") ? "" : (stryCov_9fa48("859"), 'src/admin/static/test-run-dashboard.html'),
  PLAYBACK_VIEWER: stryMutAct_9fa48("860") ? "" : (stryCov_9fa48("860"), 'test/distributed/harness/playback-viewer.html')
}));
const ADMIN_TEST_RUN_STATUS = Object.freeze(stryMutAct_9fa48("861") ? {} : (stryCov_9fa48("861"), {
  PENDING: stryMutAct_9fa48("862") ? "" : (stryCov_9fa48("862"), 'pending'),
  RUNNING: stryMutAct_9fa48("863") ? "" : (stryCov_9fa48("863"), 'running'),
  STOPPING: stryMutAct_9fa48("864") ? "" : (stryCov_9fa48("864"), 'stopping'),
  STOPPED: stryMutAct_9fa48("865") ? "" : (stryCov_9fa48("865"), 'stopped'),
  PASSED: stryMutAct_9fa48("866") ? "" : (stryCov_9fa48("866"), 'passed'),
  FAILED: stryMutAct_9fa48("867") ? "" : (stryCov_9fa48("867"), 'failed')
}));
const ADMIN_TEST_LOG_STREAM = Object.freeze(stryMutAct_9fa48("868") ? {} : (stryCov_9fa48("868"), {
  STDOUT: stryMutAct_9fa48("869") ? "" : (stryCov_9fa48("869"), 'stdout'),
  STDERR: stryMutAct_9fa48("870") ? "" : (stryCov_9fa48("870"), 'stderr'),
  SYSTEM: stryMutAct_9fa48("871") ? "" : (stryCov_9fa48("871"), 'system'),
  ARCHIVE: stryMutAct_9fa48("872") ? "" : (stryCov_9fa48("872"), 'archive')
}));
const ADMIN_TEST_STREAM_EVENT = Object.freeze(stryMutAct_9fa48("873") ? {} : (stryCov_9fa48("873"), {
  LOG: stryMutAct_9fa48("874") ? "" : (stryCov_9fa48("874"), 'log'),
  STATUS: stryMutAct_9fa48("875") ? "" : (stryCov_9fa48("875"), 'status'),
  PROGRESS: stryMutAct_9fa48("876") ? "" : (stryCov_9fa48("876"), 'progress')
}));
const ADMIN_TEST_DEFAULT = Object.freeze(stryMutAct_9fa48("877") ? {} : (stryCov_9fa48("877"), {
  CONFIG_FILE: stryMutAct_9fa48("878") ? "" : (stryCov_9fa48("878"), 'local.json'),
  LOG_LINE_LIMIT: 2000,
  ARCHIVE_LOG_LINE_LIMIT: 500,
  STREAM_RETRY_MS: 1000,
  REPORT_EXTENSION: stryMutAct_9fa48("879") ? "" : (stryCov_9fa48("879"), '.report.json'),
  SCENARIO_EXTENSION: stryMutAct_9fa48("880") ? "" : (stryCov_9fa48("880"), '.js'),
  CONFIG_EXTENSION: stryMutAct_9fa48("881") ? "" : (stryCov_9fa48("881"), '.json'),
  TIMELINE_FILENAME: stryMutAct_9fa48("882") ? "" : (stryCov_9fa48("882"), '_timeline.log'),
  PLAYBACK_EVENTS_FILENAME: stryMutAct_9fa48("883") ? "" : (stryCov_9fa48("883"), 'events.ndjson'),
  PLAYBACK_SAMPLES_FILENAME: stryMutAct_9fa48("884") ? "" : (stryCov_9fa48("884"), 'samples.ndjson'),
  PLAYBACK_SNAPSHOTS_FILENAME: stryMutAct_9fa48("885") ? "" : (stryCov_9fa48("885"), 'snapshots.ndjson'),
  PLAYBACK_MANIFEST_FILENAME: stryMutAct_9fa48("886") ? "" : (stryCov_9fa48("886"), 'playback-manifest.json'),
  GIT_HASH_UNKNOWN: stryMutAct_9fa48("887") ? "" : (stryCov_9fa48("887"), 'unknown'),
  SIGNAL_TERM: stryMutAct_9fa48("888") ? "" : (stryCov_9fa48("888"), 'SIGTERM')
}));
const ADMIN_TEST_ERROR_MSG = Object.freeze(stryMutAct_9fa48("889") ? {} : (stryCov_9fa48("889"), {
  RUN_NOT_FOUND: stryMutAct_9fa48("890") ? "" : (stryCov_9fa48("890"), 'Test run not found'),
  RUN_NOT_ACTIVE: stryMutAct_9fa48("891") ? "" : (stryCov_9fa48("891"), 'Test run is not active'),
  RUN_DELETE_ACTIVE: stryMutAct_9fa48("892") ? "" : (stryCov_9fa48("892"), 'Cannot delete an active test run'),
  SCENARIO_REQUIRED: stryMutAct_9fa48("893") ? "" : (stryCov_9fa48("893"), 'Scenario is required'),
  SCENARIO_NOT_FOUND: stryMutAct_9fa48("894") ? "" : (stryCov_9fa48("894"), 'Scenario not found'),
  CONFIG_NOT_FOUND: stryMutAct_9fa48("895") ? "" : (stryCov_9fa48("895"), 'Config not found'),
  CONFIG_PREFLIGHT_FAILED: stryMutAct_9fa48("896") ? "" : (stryCov_9fa48("896"), 'Config preflight failed'),
  OUTPUT_PATH_INVALID: stryMutAct_9fa48("897") ? "" : (stryCov_9fa48("897"), 'Output path is invalid'),
  DASHBOARD_NOT_FOUND: stryMutAct_9fa48("898") ? "" : (stryCov_9fa48("898"), 'Admin test dashboard page not found'),
  PLAYBACK_VIEWER_NOT_FOUND: stryMutAct_9fa48("899") ? "" : (stryCov_9fa48("899"), 'Playback viewer page not found')
}));
const ADMIN_DEBUG_ERROR_MSG = Object.freeze(stryMutAct_9fa48("900") ? {} : (stryCov_9fa48("900"), {
  SECURITY_CONTEXT_REQUIRED: stryMutAct_9fa48("901") ? "" : (stryCov_9fa48("901"), 'Debug route requires tenant and principal headers'),
  SERVICE_UNAVAILABLE: stryMutAct_9fa48("902") ? "" : (stryCov_9fa48("902"), 'Debug metadata service is not available'),
  DAP_UNAVAILABLE: stryMutAct_9fa48("903") ? "" : (stryCov_9fa48("903"), 'Debug DAP router is not available')
}));
const ADMIN_ENFORCEMENT_MODE = Object.freeze(stryMutAct_9fa48("904") ? {} : (stryCov_9fa48("904"), {
  OBSERVE: stryMutAct_9fa48("905") ? "" : (stryCov_9fa48("905"), 'observe'),
  ENFORCE: stryMutAct_9fa48("906") ? "" : (stryCov_9fa48("906"), 'enforce')
}));
const ADMIN_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("907") ? {} : (stryCov_9fa48("907"), {
  // Outgoing
  CACHE_DUMP: stryMutAct_9fa48("908") ? "" : (stryCov_9fa48("908"), 'cache_dump'),
  CDC_EVENT: stryMutAct_9fa48("909") ? "" : (stryCov_9fa48("909"), 'cdc_event'),
  QUERY_RESULT: stryMutAct_9fa48("910") ? "" : (stryCov_9fa48("910"), 'query_result'),
  LIVE_QUERY_EVENT: stryMutAct_9fa48("911") ? "" : (stryCov_9fa48("911"), 'live_query_event'),
  ERROR: stryMutAct_9fa48("912") ? "" : (stryCov_9fa48("912"), 'error'),
  // Incoming
  QUERY: stryMutAct_9fa48("913") ? "" : (stryCov_9fa48("913"), 'query'),
  PARTITION_CALLBACK: stryMutAct_9fa48("914") ? "" : (stryCov_9fa48("914"), 'partition_callback'),
  REFRESH: stryMutAct_9fa48("915") ? "" : (stryCov_9fa48("915"), 'refresh'),
  LIVE_QUERY_SUBSCRIBE: stryMutAct_9fa48("916") ? "" : (stryCov_9fa48("916"), 'live_query_subscribe'),
  LIVE_QUERY_UNSUBSCRIBE: stryMutAct_9fa48("917") ? "" : (stryCov_9fa48("917"), 'live_query_unsubscribe')
}));
const ADMIN_ERROR_CODE = Object.freeze(stryMutAct_9fa48("918") ? {} : (stryCov_9fa48("918"), {
  SYNTAX_ERROR: stryMutAct_9fa48("919") ? "" : (stryCov_9fa48("919"), 'SYNTAX_ERROR'),
  TABLE_NOT_FOUND: stryMutAct_9fa48("920") ? "" : (stryCov_9fa48("920"), 'TABLE_NOT_FOUND'),
  TIMEOUT: stryMutAct_9fa48("921") ? "" : (stryCov_9fa48("921"), 'TIMEOUT'),
  INTERNAL_ERROR: stryMutAct_9fa48("922") ? "" : (stryCov_9fa48("922"), 'INTERNAL_ERROR'),
  MALFORMED_JSON: stryMutAct_9fa48("923") ? "" : (stryCov_9fa48("923"), 'MALFORMED_JSON')
}));
const ADMIN_ERROR_MESSAGE = Object.freeze(stryMutAct_9fa48("924") ? {} : (stryCov_9fa48("924"), {
  INVALID_JSON: stryMutAct_9fa48("925") ? "" : (stryCov_9fa48("925"), 'Invalid JSON message'),
  MISSING_TYPE: stryMutAct_9fa48("926") ? "" : (stryCov_9fa48("926"), 'Message must have a "type" field'),
  MISSING_QUERY_ID: stryMutAct_9fa48("927") ? "" : (stryCov_9fa48("927"), 'Query message must include queryId'),
  MISSING_SQL: stryMutAct_9fa48("928") ? "" : (stryCov_9fa48("928"), 'Query message must include sql string'),
  MISSING_CALLBACK_STATEMENT: stryMutAct_9fa48("929") ? "" : (stryCov_9fa48("929"), 'Partition callback message must include statement string'),
  MISSING_CALLBACK_MODULE_REF: stryMutAct_9fa48("930") ? "" : (stryCov_9fa48("930"), 'Partition callback message must include callbackModuleRef'),
  MISSING_CALLBACK_EXPORT: stryMutAct_9fa48("931") ? "" : (stryCov_9fa48("931"), 'Partition callback message must include callbackExport'),
  MISSING_CALLBACK_RUNTIME_KIND: stryMutAct_9fa48("932") ? "" : (stryCov_9fa48("932"), 'Partition callback message must include runtimeKind'),
  QUERY_ENGINE_UNAVAILABLE: stryMutAct_9fa48("933") ? "" : (stryCov_9fa48("933"), 'SQL query engine not available'),
  SERVICE_DIAGNOSTICS_UNAVAILABLE: stryMutAct_9fa48("934") ? "" : (stryCov_9fa48("934"), 'Service lifecycle diagnostics provider is not available'),
  SERVICE_DISPATCH_OPERATION_UNSUPPORTED: stryMutAct_9fa48("935") ? "" : (stryCov_9fa48("935"), 'Unsupported admin service-dispatch operation'),
  SYSTEM_CACHE_EMPTY: stryMutAct_9fa48("936") ? "" : (stryCov_9fa48("936"), 'System table cache is empty'),
  CONTROL_SNAPSHOT_SCOPE_UNSUPPORTED: stryMutAct_9fa48("937") ? "" : (stryCov_9fa48("937"), 'Control snapshot scope must be "local"'),
  CONTROL_SNAPSHOT_UNAVAILABLE: stryMutAct_9fa48("938") ? "" : (stryCov_9fa48("938"), 'Control snapshot unavailable because system cache is not configured'),
  CDC_DIAGNOSTICS_UNAVAILABLE: stryMutAct_9fa48("939") ? "" : (stryCov_9fa48("939"), 'CDC diagnostics unavailable because system cache is not configured'),
  PARTITION_DIAGNOSTICS_UNAVAILABLE: stryMutAct_9fa48("940") ? "" : (stryCov_9fa48("940"), 'Partition diagnostics unavailable because system cache is not configured'),
  SQL_DIAGNOSTICS_UNAVAILABLE: stryMutAct_9fa48("941") ? "" : (stryCov_9fa48("941"), 'SQL diagnostics unavailable because system cache is not configured'),
  SERVICE_DISCOVERY_UNAVAILABLE: stryMutAct_9fa48("942") ? "" : (stryCov_9fa48("942"), 'Service discovery unavailable because system cache is not configured'),
  LIVE_QUERY_MANAGER_UNAVAILABLE: stryMutAct_9fa48("943") ? "" : (stryCov_9fa48("943"), 'Live query manager not available'),
  LIVE_QUERY_MISSING_SUBSCRIPTION_ID: stryMutAct_9fa48("944") ? "" : (stryCov_9fa48("944"), 'Live query subscribe must include subscriptionId'),
  LIVE_QUERY_MISSING_SQL: stryMutAct_9fa48("945") ? "" : (stryCov_9fa48("945"), 'Live query subscribe must include sql string'),
  LIVE_QUERY_PARSE_FAILED: stryMutAct_9fa48("946") ? "" : (stryCov_9fa48("946"), 'Failed to parse live query SQL'),
  queryTimeout: stryMutAct_9fa48("947") ? () => undefined : (stryCov_9fa48("947"), timeoutMs => stryMutAct_9fa48("948") ? `` : (stryCov_9fa48("948"), `Query timeout after ${timeoutMs}ms`))
}));
const ADMIN_ERROR_HINT = Object.freeze(stryMutAct_9fa48("949") ? {} : (stryCov_9fa48("949"), {
  INVALID_JSON: stryMutAct_9fa48("950") ? "" : (stryCov_9fa48("950"), 'Ensure message is valid JSON'),
  MISSING_TYPE: stryMutAct_9fa48("951") ? "" : (stryCov_9fa48("951"), 'Include type field in message'),
  MISSING_QUERY_ID: stryMutAct_9fa48("952") ? "" : (stryCov_9fa48("952"), 'Include queryId field'),
  MISSING_SQL: stryMutAct_9fa48("953") ? "" : (stryCov_9fa48("953"), 'Include sql field'),
  MISSING_CALLBACK_STATEMENT: stryMutAct_9fa48("954") ? "" : (stryCov_9fa48("954"), 'Include statement field'),
  MISSING_CALLBACK_MODULE_REF: stryMutAct_9fa48("955") ? "" : (stryCov_9fa48("955"), 'Include callbackModuleRef field'),
  MISSING_CALLBACK_EXPORT: stryMutAct_9fa48("956") ? "" : (stryCov_9fa48("956"), 'Include callbackExport field'),
  MISSING_CALLBACK_RUNTIME_KIND: stryMutAct_9fa48("957") ? "" : (stryCov_9fa48("957"), 'Include runtimeKind field'),
  LIVE_QUERY_MISSING_SUBSCRIPTION_ID: stryMutAct_9fa48("958") ? "" : (stryCov_9fa48("958"), 'Include subscriptionId field'),
  LIVE_QUERY_MISSING_SQL: stryMutAct_9fa48("959") ? "" : (stryCov_9fa48("959"), 'Include sql field with LIVE SELECT statement')
}));
const ADMIN_ERROR_MATCH = Object.freeze(stryMutAct_9fa48("960") ? {} : (stryCov_9fa48("960"), {
  PARSE: stryMutAct_9fa48("961") ? "" : (stryCov_9fa48("961"), 'parse'),
  SYNTAX: stryMutAct_9fa48("962") ? "" : (stryCov_9fa48("962"), 'syntax'),
  TABLE_NOT_FOUND: stryMutAct_9fa48("963") ? "" : (stryCov_9fa48("963"), 'table not found'),
  TABLE_NOT_FOUND_CODE: stryMutAct_9fa48("964") ? "" : (stryCov_9fa48("964"), 'table_not_found'),
  TIMEOUT: stryMutAct_9fa48("965") ? "" : (stryCov_9fa48("965"), 'timeout')
}));
const ADMIN_LOG_MSG = Object.freeze(stryMutAct_9fa48("966") ? {} : (stryCov_9fa48("966"), {
  STARTED: stryMutAct_9fa48("967") ? "" : (stryCov_9fa48("967"), 'Admin WebSocket API started'),
  CLIENT_CONNECTED: stryMutAct_9fa48("968") ? "" : (stryCov_9fa48("968"), 'Admin client connected'),
  CLIENT_DISCONNECTED: stryMutAct_9fa48("969") ? "" : (stryCov_9fa48("969"), 'Admin client disconnected'),
  SOCKET_ERROR: stryMutAct_9fa48("970") ? "" : (stryCov_9fa48("970"), 'WebSocket error'),
  CACHE_EMPTY_QUERYING: stryMutAct_9fa48("971") ? "" : (stryCov_9fa48("971"), 'Cache is empty, querying partitions directly'),
  CACHE_DUMP_SENT: stryMutAct_9fa48("972") ? "" : (stryCov_9fa48("972"), 'Cache dump sent'),
  CACHE_DUMP_FAILED: stryMutAct_9fa48("973") ? "" : (stryCov_9fa48("973"), 'Failed to send cache dump'),
  SYSTEM_TABLE_QUERY_FAILED: stryMutAct_9fa48("974") ? "" : (stryCov_9fa48("974"), 'Failed to query system table for dump'),
  RECEIVED_MESSAGE: stryMutAct_9fa48("975") ? "" : (stryCov_9fa48("975"), 'Received message'),
  UNKNOWN_MESSAGE: stryMutAct_9fa48("976") ? "" : (stryCov_9fa48("976"), 'Ignoring unknown message type'),
  EXECUTING_QUERY: stryMutAct_9fa48("977") ? "" : (stryCov_9fa48("977"), 'Executing query'),
  QUERY_RESULT_SENT: stryMutAct_9fa48("978") ? "" : (stryCov_9fa48("978"), 'Query result sent'),
  REFRESH_REQUESTED: stryMutAct_9fa48("979") ? "" : (stryCov_9fa48("979"), 'Refresh requested'),
  SEND_FAILED: stryMutAct_9fa48("980") ? "" : (stryCov_9fa48("980"), 'Failed to send message to client'),
  TEST_RUN_STARTED: stryMutAct_9fa48("981") ? "" : (stryCov_9fa48("981"), 'Admin test run started'),
  TEST_RUN_FINISHED: stryMutAct_9fa48("982") ? "" : (stryCov_9fa48("982"), 'Admin test run finished'),
  TEST_RUN_STOP_REQUESTED: stryMutAct_9fa48("983") ? "" : (stryCov_9fa48("983"), 'Admin test run stop requested'),
  TEST_RUN_DELETED: stryMutAct_9fa48("984") ? "" : (stryCov_9fa48("984"), 'Admin test run deleted'),
  TEST_RUN_LOG_STREAM_SUBSCRIBED: stryMutAct_9fa48("985") ? "" : (stryCov_9fa48("985"), 'Admin test run log stream subscribed'),
  TEST_RUN_LOG_STREAM_UNSUBSCRIBED: stryMutAct_9fa48("986") ? "" : (stryCov_9fa48("986"), 'Admin test run log stream unsubscribed'),
  TRACE_STREAM_SUBSCRIBED: stryMutAct_9fa48("987") ? "" : (stryCov_9fa48("987"), 'Admin debug trace stream subscribed'),
  TRACE_STREAM_UNSUBSCRIBED: stryMutAct_9fa48("988") ? "" : (stryCov_9fa48("988"), 'Admin debug trace stream unsubscribed'),
  LIVE_QUERY_SUBSCRIBED: stryMutAct_9fa48("989") ? "" : (stryCov_9fa48("989"), 'Live query subscription registered'),
  LIVE_QUERY_UNSUBSCRIBED: stryMutAct_9fa48("990") ? "" : (stryCov_9fa48("990"), 'Live query subscription removed'),
  LIVE_QUERY_SUBSCRIBE_FAILED: stryMutAct_9fa48("991") ? "" : (stryCov_9fa48("991"), 'Live query subscribe failed'),
  SHUTDOWN: stryMutAct_9fa48("992") ? "" : (stryCov_9fa48("992"), 'Admin WebSocket API shutdown'),
  SERVER_CLOSE_ERROR: stryMutAct_9fa48("993") ? "" : (stryCov_9fa48("993"), 'Error closing HTTP server')
}));
const ADMIN_CACHE_DUMP = Object.freeze(stryMutAct_9fa48("994") ? {} : (stryCov_9fa48("994"), {
  EMPTY: stryMutAct_9fa48("995") ? ["Stryker was here"] : (stryCov_9fa48("995"), []),
  QUERY_PREFIX: stryMutAct_9fa48("996") ? "" : (stryCov_9fa48("996"), 'SELECT * FROM ')
}));
const ADMIN_QUERY_RESULT = Object.freeze(stryMutAct_9fa48("997") ? {} : (stryCov_9fa48("997"), {
  AFFECTED_ROWS_DEFAULT: NUM.ZERO
}));
const CONSISTENCY_MISMATCH_KIND = Object.freeze(stryMutAct_9fa48("998") ? {} : (stryCov_9fa48("998"), {
  LEADER: stryMutAct_9fa48("999") ? "" : (stryCov_9fa48("999"), 'leader_mismatch'),
  PARTITION_SET: stryMutAct_9fa48("1000") ? "" : (stryCov_9fa48("1000"), 'partition_set_mismatch'),
  REPLICA_ROLE: stryMutAct_9fa48("1001") ? "" : (stryCov_9fa48("1001"), 'replica_role_inconsistency'),
  REPLICA_OPERATION: stryMutAct_9fa48("1002") ? "" : (stryCov_9fa48("1002"), 'replica_operation_mismatch')
}));
const ADMIN_CONTROL_SNAPSHOT = Object.freeze(stryMutAct_9fa48("1003") ? {} : (stryCov_9fa48("1003"), {
  QUERY_SQL: stryMutAct_9fa48("1004") ? "" : (stryCov_9fa48("1004"), 'SELECT * FROM control_snapshot_local()'),
  QUERY_SQL_FORCE_REPAIR: stryMutAct_9fa48("1005") ? "" : (stryCov_9fa48("1005"), 'SELECT * FROM control_snapshot_local(true)'),
  QUERY_SCOPE_KEY: stryMutAct_9fa48("1006") ? "" : (stryCov_9fa48("1006"), 'scope'),
  QUERY_SCOPE_LOCAL: stryMutAct_9fa48("1007") ? "" : (stryCov_9fa48("1007"), 'local'),
  SCHEMA_VERSION: 1,
  TABLE_NAME: stryMutAct_9fa48("1008") ? "" : (stryCov_9fa48("1008"), 'control_snapshot_local'),
  IN_FLIGHT_EXCLUDED_STATUSES: Object.freeze(stryMutAct_9fa48("1009") ? [] : (stryCov_9fa48("1009"), [stryMutAct_9fa48("1010") ? "" : (stryCov_9fa48("1010"), 'active'), stryMutAct_9fa48("1011") ? "" : (stryCov_9fa48("1011"), 'removed'), stryMutAct_9fa48("1012") ? "" : (stryCov_9fa48("1012"), 'failed')]))
}));
const ADMIN_SERVICE_DISCOVERY = Object.freeze(stryMutAct_9fa48("1013") ? {} : (stryCov_9fa48("1013"), {
  QUERY_SQL: stryMutAct_9fa48("1014") ? "" : (stryCov_9fa48("1014"), 'SELECT * FROM service_discovery_local()'),
  SCHEMA_VERSION: 2,
  TABLE_NAME: stryMutAct_9fa48("1015") ? "" : (stryCov_9fa48("1015"), 'service_discovery_local'),
  QUERY_PROTOCOL_KEY: stryMutAct_9fa48("1016") ? "" : (stryCov_9fa48("1016"), 'protocol'),
  QUERY_SERVICE_ID_KEY: stryMutAct_9fa48("1017") ? "" : (stryCov_9fa48("1017"), 'serviceId'),
  QUERY_NODE_ID_KEY: stryMutAct_9fa48("1018") ? "" : (stryCov_9fa48("1018"), 'nodeId'),
  QUERY_TABLE_NAME_KEY: stryMutAct_9fa48("1019") ? "" : (stryCov_9fa48("1019"), 'tableName'),
  QUERY_HEALTHY_ONLY_KEY: stryMutAct_9fa48("1020") ? "" : (stryCov_9fa48("1020"), 'healthyOnly'),
  QUERY_UNHEALTHY_POLICY_KEY: stryMutAct_9fa48("1021") ? "" : (stryCov_9fa48("1021"), 'unhealthyPolicy')
}));
const ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT = Object.freeze(stryMutAct_9fa48("1022") ? {} : (stryCov_9fa48("1022"), {
  QUERY_SQL: stryMutAct_9fa48("1023") ? "" : (stryCov_9fa48("1023"), 'SELECT * FROM preflight_critical_path_snapshot_local()'),
  SCHEMA_VERSION: 1,
  TABLE_NAME: stryMutAct_9fa48("1024") ? "" : (stryCov_9fa48("1024"), 'preflight_critical_path_snapshot_local')
}));
const ADMIN_OPERATIONAL_DIAGNOSTICS = Object.freeze(stryMutAct_9fa48("1025") ? {} : (stryCov_9fa48("1025"), {
  CDC_SCHEMA_VERSION: 1,
  PARTITION_SCHEMA_VERSION: 1,
  SQL_SCHEMA_VERSION: 1
}));
export { ADMIN_CONTENT_TYPE, ADMIN_CONFIG_KEY, ADMIN_DEBUG_ERROR_MSG, ADMIN_CLIENT, ADMIN_CACHE_DUMP, ADMIN_DEFAULT, ADMIN_STANDALONE_DEFAULT, ADMIN_ENFORCEMENT_MODE, ADMIN_ERROR_CODE, ADMIN_ERROR_HINT, ADMIN_ERROR_MATCH, ADMIN_ERROR_MESSAGE, ADMIN_LIMIT, ADMIN_LOG_MSG, ADMIN_MESSAGE_TYPE, ADMIN_HEADER, ADMIN_QUERY_RESULT, CONSISTENCY_MISMATCH_KIND, ADMIN_CONTROL_SNAPSHOT, ADMIN_SERVICE_DISCOVERY, ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT, ADMIN_OPERATIONAL_DIAGNOSTICS, ADMIN_ROUTE, ADMIN_STATUS, ADMIN_SUBSYSTEM, ADMIN_TEST_DEFAULT, ADMIN_TEST_ERROR_MSG, ADMIN_TEST_LOG_STREAM, ADMIN_TEST_RUN_PATH, ADMIN_TEST_RUN_STATUS, ADMIN_TEST_STREAM_EVENT };