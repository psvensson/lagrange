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
const TABLES = Object.freeze(stryMutAct_9fa48("54877") ? {} : (stryCov_9fa48("54877"), {
  NODES: stryMutAct_9fa48("54878") ? "" : (stryCov_9fa48("54878"), 'nodes'),
  PARTITIONS: stryMutAct_9fa48("54879") ? "" : (stryCov_9fa48("54879"), 'partitions'),
  SERVICES: stryMutAct_9fa48("54880") ? "" : (stryCov_9fa48("54880"), 'services'),
  MESSAGE_GROUPS: stryMutAct_9fa48("54881") ? "" : (stryCov_9fa48("54881"), 'message_groups'),
  REPLICA_OPERATIONS: stryMutAct_9fa48("54882") ? "" : (stryCov_9fa48("54882"), 'replica_operations'),
  INDICES: stryMutAct_9fa48("54883") ? "" : (stryCov_9fa48("54883"), 'indices'),
  LOGS: stryMutAct_9fa48("54884") ? "" : (stryCov_9fa48("54884"), 'logs'),
  CONFIG: stryMutAct_9fa48("54885") ? "" : (stryCov_9fa48("54885"), 'config'),
  LIVE_QUERIES: stryMutAct_9fa48("54886") ? "" : (stryCov_9fa48("54886"), 'live_queries'),
  CONTEXTS: stryMutAct_9fa48("54887") ? "" : (stryCov_9fa48("54887"), 'contexts'),
  CODE: stryMutAct_9fa48("54888") ? "" : (stryCov_9fa48("54888"), 'code'),
  CONTROL_PLANE_PUBLICATIONS: stryMutAct_9fa48("54889") ? "" : (stryCov_9fa48("54889"), 'control_plane_publications'),
  TABLES: stryMutAct_9fa48("54890") ? "" : (stryCov_9fa48("54890"), 'tables'),
  SCHEMA_MIGRATIONS: stryMutAct_9fa48("54891") ? "" : (stryCov_9fa48("54891"), 'schema_migrations'),
  SCHEMA_MIGRATION_PARTITIONS: stryMutAct_9fa48("54892") ? "" : (stryCov_9fa48("54892"), 'schema_migration_partitions'),
  NODE_ENDPOINTS: stryMutAct_9fa48("54893") ? "" : (stryCov_9fa48("54893"), 'node_endpoints'),
  SERVICE_DEFINITIONS: stryMutAct_9fa48("54894") ? "" : (stryCov_9fa48("54894"), 'service_definitions'),
  SERVICE_ENDPOINTS: stryMutAct_9fa48("54895") ? "" : (stryCov_9fa48("54895"), 'service_endpoints'),
  SERVICE_TIMERS: stryMutAct_9fa48("54896") ? "" : (stryCov_9fa48("54896"), 'service_timers'),
  MODULE_MANIFESTS: stryMutAct_9fa48("54897") ? "" : (stryCov_9fa48("54897"), 'module_manifests'),
  PACKAGE_REGISTRY_MAPPINGS: stryMutAct_9fa48("54898") ? "" : (stryCov_9fa48("54898"), 'package_registry_mappings'),
  PACKAGE_REGISTRY_OVERRIDES: stryMutAct_9fa48("54899") ? "" : (stryCov_9fa48("54899"), 'package_registry_overrides'),
  MODULE_DEPENDENCY_LOCKS: stryMutAct_9fa48("54900") ? "" : (stryCov_9fa48("54900"), 'module_dependency_locks'),
  WASM_OPERATIONS: stryMutAct_9fa48("54901") ? "" : (stryCov_9fa48("54901"), 'wasm_operations'),
  SQL_TRANSACTIONS: stryMutAct_9fa48("54902") ? "" : (stryCov_9fa48("54902"), 'sql_transactions'),
  SQL_TRANSACTION_PARTICIPANTS: stryMutAct_9fa48("54903") ? "" : (stryCov_9fa48("54903"), 'sql_transaction_participants'),
  SQL_WRITE_OPERATIONS: stryMutAct_9fa48("54904") ? "" : (stryCov_9fa48("54904"), 'sql_write_operations'),
  DEBUG_SESSIONS: stryMutAct_9fa48("54905") ? "" : (stryCov_9fa48("54905"), 'debug_sessions'),
  DEBUG_BREAKPOINTS: stryMutAct_9fa48("54906") ? "" : (stryCov_9fa48("54906"), 'debug_breakpoints'),
  DEBUG_SNAPSHOTS: stryMutAct_9fa48("54907") ? "" : (stryCov_9fa48("54907"), 'debug_snapshots'),
  STORAGE_RESERVATIONS: stryMutAct_9fa48("54908") ? "" : (stryCov_9fa48("54908"), 'storage_reservations'),
  LATENCY_GROUPS: stryMutAct_9fa48("54909") ? "" : (stryCov_9fa48("54909"), 'latency_groups'),
  INTER_GROUP_LATENCIES: stryMutAct_9fa48("54910") ? "" : (stryCov_9fa48("54910"), 'inter_group_latencies')
}));
export { TABLES };