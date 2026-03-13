import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {buildControlPlaneQueryOptions} from './timeout-budget.js';
import {TYPEOF} from '../constants/index.js';

const CONTROL_PLANE_LOCAL_READ_CONSISTENCY = 'local_leader';
const CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY = 'any_replica';
const GATEWAY_ERROR_MSG = Object.freeze({
  CDC_REQUIRED:
    'ControlPlaneSystemTableGateway requires cdcIntegrationService',
  SQL_ENGINE_REQUIRED:
    'ControlPlaneSystemTableGateway requires sqlQueryEngine',
});

function copyOption(target, source, key) {
  if (typeof source?.[key] === TYPEOF.UNDEFINED) {
    return target;
  }
  return {
    ...target,
    [key]: source[key],
  };
}

class ControlPlaneSystemTableGateway {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
  }

  /**
   * @param {Object|null} sqlQueryEngine
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine || null;
  }

  /**
   * @param {Object|null} cdcIntegrationService
   */
  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService || null;
  }

  /**
   * @return {boolean}
   */
  supportsReadRows() {
    return (
      typeof this.cdcIntegrationService
        ?.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION ||
      typeof this.sqlQueryEngine?.executeQuery === TYPEOF.FUNCTION
    );
  }

  /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildQueryOptions(options = {}) {
    const requestedTimeoutMs = Number.isFinite(options?.timeoutMs) ?
      options.timeoutMs :
      (
        Number.isFinite(options?.queryTimeoutMs) ?
          options.queryTimeoutMs :
          options?.requestedTimeoutMs
      );
    const queryOptions = {
      ...buildControlPlaneQueryOptions({
        requestedTimeoutMs,
        timeoutBudget: options?.timeoutBudget,
        now: this.now,
      }),
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    };
    if (typeof options?.sessionId === TYPEOF.STRING &&
        options.sessionId.length > 0) {
      queryOptions.sessionId = options.sessionId;
    }
    if (options?.cancellationToken) {
      queryOptions.cancellationToken = options.cancellationToken;
    }
    return queryOptions;
  }

  /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildWriteOptions(options = {}) {
    let writeOptions = {
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    };
    const queryTimeoutMs = Number.isFinite(options?.queryTimeoutMs) ?
      options.queryTimeoutMs :
      options?.timeoutMs;
    if (Number.isFinite(queryTimeoutMs)) {
      writeOptions.queryTimeoutMs = queryTimeoutMs;
    }
    writeOptions = copyOption(writeOptions, options, 'cancellationToken');
    writeOptions = copyOption(writeOptions, options, 'skipCacheWait');
    writeOptions = copyOption(writeOptions, options, 'expectedCacheFields');
    writeOptions = copyOption(writeOptions, options, 'minimumCacheFields');
    writeOptions = copyOption(writeOptions, options, 'fallbackPhase');
    writeOptions = copyOption(writeOptions, options, 'sessionId');
    return writeOptions;
  }

  /**
   * @private
   */
  assertSqlQueryEngine() {
    if (!this.sqlQueryEngine ||
        typeof this.sqlQueryEngine.executeQuery !== TYPEOF.FUNCTION) {
      throw new Error(GATEWAY_ERROR_MSG.SQL_ENGINE_REQUIRED);
    }
  }

  /**
   * @private
   */
  assertCdcIntegrationService() {
    if (!this.cdcIntegrationService) {
      throw new Error(GATEWAY_ERROR_MSG.CDC_REQUIRED);
    }
  }

  /**
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async executeQuery(sql, params = [], options = {}) {
    this.assertSqlQueryEngine();
    return this.sqlQueryEngine.executeQuery(
      sql,
      params,
      this.buildQueryOptions(options),
    );
  }

  /**
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async readRows(tableName, sql, params = [], options = {}) {
    const queryOptions = this.buildQueryOptions(options);
    if (this.cdcIntegrationService &&
        typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead ===
          TYPEOF.FUNCTION) {
      const authoritativeResult =
        await this.cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          {
            localReadConsistency:
              options?.localReadConsistency ||
              CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
            replicaFallbackConsistency:
              options?.replicaFallbackConsistency ||
              CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
            allowSqlFallback: options?.allowSqlFallback !== false,
            queryOptions,
          },
        );
      if (authoritativeResult?.success) {
        return authoritativeResult;
      }
      if (options?.requireAuthoritative === true) {
        return authoritativeResult;
      }
    }

    return this.executeQuery(sql, params, options);
  }

  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async insertSystemTableRow(tableName, row, options = {}) {
    this.assertCdcIntegrationService();
    return this.cdcIntegrationService.insertSystemTableRow(
      tableName,
      row,
      this.buildWriteOptions(options),
    );
  }

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} data
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async updateSystemTableRow(tableName, whereClause, data, options = {}) {
    this.assertCdcIntegrationService();
    return this.cdcIntegrationService.updateSystemTableRow(
      tableName,
      whereClause,
      data,
      this.buildWriteOptions(options),
    );
  }

  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async upsertSystemTableRow(tableName, row, options = {}) {
    this.assertCdcIntegrationService();
    return this.cdcIntegrationService.upsertSystemTableRow(
      tableName,
      row,
      this.buildWriteOptions(options),
    );
  }

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async deleteSystemTableRow(tableName, whereClause, options = {}) {
    this.assertCdcIntegrationService();
    return this.cdcIntegrationService.deleteSystemTableRow(
      tableName,
      whereClause,
      this.buildWriteOptions(options),
    );
  }
}

export {
  CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
  ControlPlaneSystemTableGateway,
};
