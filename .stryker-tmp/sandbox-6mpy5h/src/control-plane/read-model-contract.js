/**
 * Read-Model Contract — Canonical read-model source declarations for
 * control-plane decisions.
 *
 * Each control-plane decision path declares exactly one read-model source.
 * Mixed cache/SQL fallback within a single semantic decision is forbidden.
 *
 * Sources:
 * - SYSTEM_TABLE_CACHE: CDC-propagated metadata, steady-state decisions.
 * - AUTHORITATIVE_SQL: Partition-leader writes and deduplication queries.
 * - RECOVERY_SQL: Explicit recovery sweeps with typed reason codes.
 * - DIAGNOSTICS_SQL: Reconciliation and diagnostics with typed reason codes.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
// @ts-nocheck


/**
 * Canonical read-model source types.
 * Every control-plane decision must declare exactly one of these.
 * @enum {string}
 */function stryNS_9fa48() {
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
const READ_MODEL_SOURCE = Object.freeze(stryMutAct_9fa48("71926") ? {} : (stryCov_9fa48("71926"), {
  /** CDC-propagated metadata via SystemTableCache — steady-state reads. */
  SYSTEM_TABLE_CACHE: stryMutAct_9fa48("71927") ? "" : (stryCov_9fa48("71927"), 'system_table_cache'),
  /** Direct SQL to partition leader — authoritative writes/dedup. */
  AUTHORITATIVE_SQL: stryMutAct_9fa48("71928") ? "" : (stryCov_9fa48("71928"), 'authoritative_sql'),
  /** SQL for explicit recovery sweeps — typed reason required. */
  RECOVERY_SQL: stryMutAct_9fa48("71929") ? "" : (stryCov_9fa48("71929"), 'recovery_sql'),
  /** SQL for diagnostics/reconciliation — typed reason required. */
  DIAGNOSTICS_SQL: stryMutAct_9fa48("71930") ? "" : (stryCov_9fa48("71930"), 'diagnostics_sql')
}));

/**
 * Declared read-model contracts per control-plane decision.
 *
 * Each entry maps a decision identifier to its canonical read-model source.
 * Components annotate their decision methods with these identifiers via
 * JSDoc `@readModel` tags referencing the key here.
 *
 * Adding a new decision requires declaring its source in this registry.
 * Mixed cache/SQL fallback for the same semantic is forbidden.
 *
 * @enum {string}
 */
const CONTROL_PLANE_DECISION_READ_MODEL = Object.freeze(stryMutAct_9fa48("71931") ? {} : (stryCov_9fa48("71931"), {
  // ── ControlPlaneReadinessService ──────────────────────────────────
  READINESS_NODE_STATE: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  READINESS_SERVICE_STATE: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  READINESS_CAPACITY: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  // ── ReplicaDispatchService ──────────────────────────────────────
  DISPATCH_NODE_READINESS: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  DISPATCH_OPERATION_LOOKUP: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  DISPATCH_CLAIM: READ_MODEL_SOURCE.AUTHORITATIVE_SQL,
  DISPATCH_HANDLER_CHECK: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  // ── UnifiedRebalancer ─────────────────────────────────────────
  REBALANCE_AVAILABLE_NODES: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  REBALANCE_CURRENT_REPLICAS: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  REBALANCE_IN_FLIGHT_OPERATIONS: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  REBALANCE_GLOBAL_BUDGET: READ_MODEL_SOURCE.AUTHORITATIVE_SQL,
  REBALANCE_CONFIGURED_BUDGET: READ_MODEL_SOURCE.AUTHORITATIVE_SQL,
  // ── RebalanceCoordinator ──────────────────────────────────────
  COORDINATOR_ENTITY_SERVICES: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  COORDINATOR_ENTITY_IN_FLIGHT: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  COORDINATOR_NODE_READINESS: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  COORDINATOR_SAFETY_CHECK: READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE,
  COORDINATOR_OPERATION_PERSIST: READ_MODEL_SOURCE.AUTHORITATIVE_SQL,
  COORDINATOR_OPERATION_DEDUP: READ_MODEL_SOURCE.AUTHORITATIVE_SQL,
  COORDINATOR_TIMEOUT_QUERY: READ_MODEL_SOURCE.RECOVERY_SQL,
  COORDINATOR_RECOVERY_QUERY: READ_MODEL_SOURCE.RECOVERY_SQL,
  COORDINATOR_REPLICA_STATUS_RECONCILE: READ_MODEL_SOURCE.RECOVERY_SQL,
  COORDINATOR_RESERVATION_RECONCILE: READ_MODEL_SOURCE.RECOVERY_SQL
}));

/**
 * Typed divergence event types emitted when cache and authoritative
 * state differ during recovery or diagnostics reconciliation.
 * Requirements: 3.2, 3.4
 * @enum {string}
 */
const READ_MODEL_DIVERGENCE_TYPE = Object.freeze(stryMutAct_9fa48("71932") ? {} : (stryCov_9fa48("71932"), {
  /** Cache row missing but authoritative SQL row exists. */
  CACHE_MISSING: stryMutAct_9fa48("71933") ? "" : (stryCov_9fa48("71933"), 'cache_missing'),
  /** Authoritative SQL row missing but cache row exists. */
  AUTHORITATIVE_MISSING: stryMutAct_9fa48("71934") ? "" : (stryCov_9fa48("71934"), 'authoritative_missing'),
  /** Both exist but field values differ. */
  FIELD_MISMATCH: stryMutAct_9fa48("71935") ? "" : (stryCov_9fa48("71935"), 'field_mismatch'),
  /** Row count differs between cache and authoritative source. */
  COUNT_MISMATCH: stryMutAct_9fa48("71936") ? "" : (stryCov_9fa48("71936"), 'count_mismatch')
}));

/**
 * Reason codes for SQL reconciliation paths.
 * Every RECOVERY_SQL or DIAGNOSTICS_SQL read must declare one of these.
 * Requirements: 3.2
 * @enum {string}
 */
const SQL_RECONCILIATION_REASON = Object.freeze(stryMutAct_9fa48("71937") ? {} : (stryCov_9fa48("71937"), {
  /** Recovery sweep for incomplete operations after node restart. */
  RECOVERY_INCOMPLETE_OPERATIONS: stryMutAct_9fa48("71938") ? "" : (stryCov_9fa48("71938"), 'recovery_incomplete_operations'),
  /** Recovery reconciliation of replica status during sync. */
  RECOVERY_REPLICA_STATUS: stryMutAct_9fa48("71939") ? "" : (stryCov_9fa48("71939"), 'recovery_replica_status'),
  /** Recovery reconciliation of stale/orphan reservations. */
  RECOVERY_RESERVATION_RECONCILE: stryMutAct_9fa48("71940") ? "" : (stryCov_9fa48("71940"), 'recovery_reservation_reconcile'),
  /** Authoritative confirmation after replica operation persistence. */
  RECOVERY_OPERATION_PERSIST_CONFIRMATION: stryMutAct_9fa48("71941") ? "" : (stryCov_9fa48("71941"), 'recovery_operation_persist_confirmation'),
  /** Diagnostics comparison of cache vs authoritative state. */
  DIAGNOSTICS_CACHE_RECONCILE: stryMutAct_9fa48("71942") ? "" : (stryCov_9fa48("71942"), 'diagnostics_cache_reconcile'),
  /** Allocating canonical replica ID requires authoritative dedup. */
  AUTHORITATIVE_REPLICA_ID_ALLOC: stryMutAct_9fa48("71943") ? "" : (stryCov_9fa48("71943"), 'authoritative_replica_id_alloc')
}));

/**
 * Build a structured divergence event payload.
 * Emitted when cache and authoritative state differ during
 * recovery or diagnostics reconciliation.
 *
 * @param {Object} options - Divergence details.
 * @param {string} options.divergenceType - One of READ_MODEL_DIVERGENCE_TYPE.
 * @param {string} options.tableName - System table where divergence found.
 * @param {string} options.ownerComponent - Component that detected it.
 * @param {string} options.reconciliationReason - SQL_RECONCILIATION_REASON.
 * @param {string} [options.rowKey] - Primary key of the divergent row.
 * @param {Object} [options.cacheValue] - Value from cache (if present).
 * @param {Object} [options.authoritativeValue] - Value from SQL.
 * @param {Array<string>} [options.divergentFields] - Field names that differ.
 * @return {Object} Frozen divergence event payload.
 */
function buildDivergenceEvent(options) {
  if (stryMutAct_9fa48("71944")) {
    {}
  } else {
    stryCov_9fa48("71944");
    return Object.freeze(stryMutAct_9fa48("71945") ? {} : (stryCov_9fa48("71945"), {
      divergenceType: options.divergenceType,
      tableName: options.tableName,
      ownerComponent: options.ownerComponent,
      reconciliationReason: options.reconciliationReason,
      rowKey: stryMutAct_9fa48("71948") ? options.rowKey && null : stryMutAct_9fa48("71947") ? false : stryMutAct_9fa48("71946") ? true : (stryCov_9fa48("71946", "71947", "71948"), options.rowKey || null),
      cacheValue: stryMutAct_9fa48("71951") ? options.cacheValue && null : stryMutAct_9fa48("71950") ? false : stryMutAct_9fa48("71949") ? true : (stryCov_9fa48("71949", "71950", "71951"), options.cacheValue || null),
      authoritativeValue: stryMutAct_9fa48("71954") ? options.authoritativeValue && null : stryMutAct_9fa48("71953") ? false : stryMutAct_9fa48("71952") ? true : (stryCov_9fa48("71952", "71953", "71954"), options.authoritativeValue || null),
      divergentFields: stryMutAct_9fa48("71957") ? options.divergentFields && null : stryMutAct_9fa48("71956") ? false : stryMutAct_9fa48("71955") ? true : (stryCov_9fa48("71955", "71956", "71957"), options.divergentFields || null),
      detectedAt: Date.now()
    }));
  }
}

/**
 * Validate that a read-model source is one of the declared canonical values.
 * @param {string} source - The source to validate.
 * @return {boolean} True when the source is a valid READ_MODEL_SOURCE value.
 */
function isValidReadModelSource(source) {
  if (stryMutAct_9fa48("71958")) {
    {}
  } else {
    stryCov_9fa48("71958");
    return Object.values(READ_MODEL_SOURCE).includes(source);
  }
}
export { READ_MODEL_SOURCE, CONTROL_PLANE_DECISION_READ_MODEL, READ_MODEL_DIVERGENCE_TYPE, SQL_RECONCILIATION_REASON, buildDivergenceEvent, isValidReadModelSource };