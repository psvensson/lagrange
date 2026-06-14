import {
  canWriteSystemTableLocally,
  isLocalPartitionServiceLeader,
  isLocalPartitionServiceUsable,
  resolveLocalPartitionServicesForPartition,
  resolveLocalSystemTableServices,
  resolvePartitionServices,
  resolveSystemTablePartitionIds,
  executeLocalSystemTableRead as executeLocalSystemTableReadFromHelpers,
} from './cdc-integration-service-local-system-table-routing.js';
import {
  buildOwnerRpcSqlFallbackQueryOptions,
  buildSystemTableOperationDiagnostics,
  executeAuthoritativeOwnerRpcRead as executeAuthoritativeOwnerRpcReadFromHelpers,
  executeAuthoritativeSqlFallbackRead as executeAuthoritativeSqlFallbackReadFromHelpers,
  executeAuthoritativeSystemTableRead as executeAuthoritativeSystemTableReadFromHelpers,
  getLocalQueryTransportReadiness,
  isAuthoritativeRepairRowNewer as isAuthoritativeRepairRowNewerFromHelpers,
  maybeReseedBootstrapOverlay,
  mergeAuthoritativeSystemTableRowSets,
  normalizeAuthoritativeReadLocalQueryTransport,
  normalizeLocalSystemTableWriteResult,
  queryLocalAuthoritativeSystemTableRows,
  extractAuthoritativeRowVersion,
  shouldRetryOwnerRpcReadViaSqlFallback,
} from './cdc-integration-service-authoritative-read-flow.js';

const CDC_INTEGRATION_SERVICE_AUTHORITATIVE_READ_CONSTRUCTOR = 'constructor';

/**
 * Local-partition routing and authoritative system-table read methods. These
 * are thin instance-level adapters over the routing and authoritative-read-flow
 * helpers; they attach to the public service prototype so `this` keeps the
 * live service references the helpers expect.
 */
class CDCIntegrationServiceAuthoritativeReadDelegates {
  /**
   * Resolve the currently available local partition-service registry.
   * @return {Map<string, Object>|null}
   * @private
   */
  resolvePartitionServices() {
    return resolvePartitionServices(this);
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
    return resolveSystemTablePartitionIds(this, tableName);
  }

  /**
   * Resolve every local partition service that hosts one partition.
   * @param {Map<string, Object>|null} partitionServices
   * @param {string} partitionId
   * @return {Array<Object>}
   * @private
   */
  resolveLocalPartitionServicesForPartition(partitionServices, partitionId) {
    return resolveLocalPartitionServicesForPartition(
      partitionServices,
      partitionId,
    );
  }

  /**
   * Check whether one local partition service can be used directly.
   * @param {Object|null} partitionService
   * @return {boolean}
   * @private
   */
  isLocalPartitionServiceUsable(partitionService) {
    return isLocalPartitionServiceUsable(partitionService);
  }

  /**
   * Check whether one local partition service currently appears to be leader.
   * @param {Object|null} partitionService
   * @return {boolean}
   * @private
   */
  isLocalPartitionServiceLeader(partitionService) {
    return isLocalPartitionServiceLeader(partitionService);
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
    return resolveLocalSystemTableServices(this, tableName, options);
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
    return canWriteSystemTableLocally(this, tableName);
  }

  /**
   * Execute one read query against one local partition service.
   * @param {Object} partitionService
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalSystemTableRead(partitionService, sql, params = []) {
    return executeLocalSystemTableReadFromHelpers(
      this,
      partitionService,
      sql,
      params,
    );
  }

  /**
   * Normalize one authoritative row version into a comparable value.
   * @param {Object|null} row
   * @return {number|string|null}
   * @private
   */
  extractAuthoritativeRowVersion(row) {
    return extractAuthoritativeRowVersion(this, row);
  }

  /**
   * Prefer the fresher authoritative repair row.
   * @param {Object} candidate
   * @param {Object} existing
   * @return {boolean}
   * @private
   */
  isAuthoritativeRepairRowNewer(candidate, existing) {
    return isAuthoritativeRepairRowNewerFromHelpers(
      this,
      candidate,
      existing,
    );
  }

  /**
   * Merge replicated authoritative row sets by primary key.
   * @param {string} tableName
   * @param {Array<Array<Object>>} rowSets
   * @return {Array<Object>}
   * @private
   */
  mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
    return mergeAuthoritativeSystemTableRowSets(this, tableName, rowSets);
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
  async queryLocalAuthoritativeSystemTableRows(
    tableName,
    sql,
    params = [],
    options = {},
  ) {
    return queryLocalAuthoritativeSystemTableRows(
      this,
      tableName,
      sql,
      params,
      options,
    );
  }

  /**
   * Build bounded routing diagnostics for one system-table operation.
   * @param {string} tableName
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildSystemTableOperationDiagnostics(tableName, options = {}) {
    return buildSystemTableOperationDiagnostics(this, tableName, options);
  }

  normalizeAuthoritativeReadLocalQueryTransport(
    localQueryTransportReadiness = null,
  ) {
    return normalizeAuthoritativeReadLocalQueryTransport(
      localQueryTransportReadiness,
    );
  }

  shouldRetryOwnerRpcReadViaSqlFallback(
    ownerRpcResult,
    options = {},
    localQueryTransportReadiness = null,
  ) {
    return shouldRetryOwnerRpcReadViaSqlFallback(
      ownerRpcResult,
      options,
      localQueryTransportReadiness,
    );
  }

  buildOwnerRpcSqlFallbackQueryOptions(queryOptions = {}, baseDiagnostics = {}) {
    return buildOwnerRpcSqlFallbackQueryOptions(queryOptions, baseDiagnostics);
  }

  async executeAuthoritativeSqlFallbackRead(
    tableName,
    statement,
    params,
    options,
    baseDiagnostics,
    localQueryTransportReadiness = null,
  ) {
    return executeAuthoritativeSqlFallbackReadFromHelpers(
      this,
      tableName,
      statement,
      params,
      options,
      baseDiagnostics,
      localQueryTransportReadiness,
    );
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
  async executeAuthoritativeSystemTableRead(
    tableName,
    sql,
    params = [],
    options = {},
  ) {
    return executeAuthoritativeSystemTableReadFromHelpers(
      this,
      tableName,
      sql,
      params,
      options,
    );
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
  async executeAuthoritativeOwnerRpcRead(
    tableName,
    statement,
    params,
    options,
    baseDiagnostics,
    localQueryTransportReadiness = null,
  ) {
    return executeAuthoritativeOwnerRpcReadFromHelpers(
      this,
      tableName,
      statement,
      params,
      options,
      baseDiagnostics,
      localQueryTransportReadiness,
    );
  }

  /**
   * Resolve the canonical local query/data-plane transport readiness snapshot.
   * This reuses the message-router transport owner instead of duplicating
   * query-ingress selection logic in the authoritative read path.
   * @return {{ready:boolean,reason:string|null,retryAfterMs:number}|null}
   * @private
   */
  getLocalQueryTransportReadiness() {
    return getLocalQueryTransportReadiness(this);
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
    return maybeReseedBootstrapOverlay(this, tableName, queryResult);
  }

  /**
   * Normalize one direct local system-table write result into the SQL-engine
   * result shape expected by CDC callers.
   * @param {Object} result
   * @return {Object}
   * @private
   */
  normalizeLocalSystemTableWriteResult(result) {
    return normalizeLocalSystemTableWriteResult(result);
  }
}

/**
 * Mix the local-routing/authoritative-read delegate methods onto the target
 * class prototype.
 * @param {Function} targetClass
 */
function applyCDCIntegrationServiceAuthoritativeReadDelegates(targetClass) {
  const sourcePrototype =
    CDCIntegrationServiceAuthoritativeReadDelegates.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === CDC_INTEGRATION_SERVICE_AUTHORITATIVE_READ_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyCDCIntegrationServiceAuthoritativeReadDelegates};
