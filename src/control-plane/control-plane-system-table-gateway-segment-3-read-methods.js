import {
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE,
  NUM,
  TYPEOF,
  buildAuthoritativeControlPlaneReadRequestOptions,
  normalizePhaseScope,
} from './control-plane-system-table-gateway-shared.js';

class ControlPlaneSystemTableGatewaySegment3ReadMethods {
  /**
   * @param {string} tableName
   * @param {Object} readIntent
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeCacheRead(tableName, readIntent, options) {
    const systemTableCache = this.resolveSystemTableCache();
    const readFromCache =
      typeof readIntent?.readFromCache === TYPEOF.FUNCTION ?
        readIntent.readFromCache :
        null;
    const cachePredicate =
      typeof readIntent?.cachePredicate === TYPEOF.FUNCTION ?
        readIntent.cachePredicate :
        null;
    if (!systemTableCache && !readFromCache) {
      return {
        success: false,
        tableName,
        rows: [],
        outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        strategyUsed: CONTROL_PLANE_READ_STRATEGY.CACHE,
        error:
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SYSTEM_TABLE_CACHE_UNAVAILABLE,
      };
    }

    let rows = [];
    if (readFromCache) {
      const cacheRows = await readFromCache(
        systemTableCache,
        readIntent,
        options,
      );
      rows = Array.isArray(cacheRows) ? cacheRows : [];
    } else if (
      cachePredicate &&
      typeof systemTableCache?.filter === TYPEOF.FUNCTION
    ) {
      rows = systemTableCache.filter(tableName, cachePredicate) || [];
    } else if (typeof systemTableCache?.getAll === TYPEOF.FUNCTION) {
      rows = systemTableCache.getAll(tableName) || [];
    }

    return {
      success: true,
      tableName,
      rows,
      rowCount: rows.length,
      outcome: CONTROL_PLANE_READ_OUTCOME.CACHE_HIT,
      strategyUsed: CONTROL_PLANE_READ_STRATEGY.CACHE,
    };
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {string} strategy
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  buildGatewayReadResult(
    baseResult,
    tableName,
    strategyUsed,
    outcome,
    extra = {},
  ) {
    return {
      ...baseResult,
      tableName,
      rows: Array.isArray(baseResult?.rows) ? baseResult.rows : [],
      outcome,
      strategyUsed,
      ...extra,
    };
  }

  /**
   * @param {string} tableName
   * @param {string} strategyUsed
   * @param {string} outcome
   * @param {string} error
   * @return {Object}
   * @private
   */
  buildUnavailableGatewayReadResult(tableName, strategyUsed, outcome, error) {
    return {
      success: false,
      tableName,
      rows: [],
      outcome,
      strategyUsed,
      error,
    };
  }

  /**
   * @param {string} strategy
   * @return {string}
   * @private
   */
  resolveAuthoritativeReadFailureOutcome(strategy) {
    return strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED ?
      CONTROL_PLANE_READ_OUTCOME.STALE_NOT_ALLOWED :
      CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY;
  }

  /**
   * @param {string} tableName
   * @param {Array<Object>} rows
   * @return {Object}
   * @private
   */
  buildBootstrapSnapshotSuccessResult(tableName, rows) {
    return {
      success: true,
      tableName,
      rows,
      rowCount: rows.length,
      outcome: CONTROL_PLANE_READ_OUTCOME.BOOTSTRAP_SNAPSHOT,
      strategyUsed: CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
    };
  }

  /**
   * @param {string} tableName
   * @param {string} error
   * @return {Object}
   * @private
   */
  buildBootstrapSnapshotFailureResult(tableName, error) {
    return this.buildUnavailableGatewayReadResult(
      tableName,
      CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
      CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
      error,
    );
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {string} strategy
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeAuthoritativeRead(tableName, sql, params, strategy, options) {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const queryOptions = this.buildQueryOptions(options, {
      tableName,
      sql,
    });
    const {
      authoritativeReadModeContract,
      requestOptions,
    } = buildAuthoritativeControlPlaneReadRequestOptions(
      options,
      queryOptions,
    );
    const allowSqlFallback = authoritativeReadModeContract.allowSqlFallback;
    if (
      typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead !==
      TYPEOF.FUNCTION
    ) {
      if (
        allowSqlFallback &&
        strategy !== CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED
      ) {
        const sqlQueryEngine = this.resolveSqlQueryEngine();
        if (typeof sqlQueryEngine?.executeQuery === TYPEOF.FUNCTION) {
          const result = await sqlQueryEngine.executeQuery(
            sql,
            params,
            queryOptions,
          );
          return this.buildGatewayReadResult(
            result,
            tableName,
            strategy,
            result?.success === true ?
              CONTROL_PLANE_READ_OUTCOME.AUTHORITATIVE :
              CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
            {
              source:
                CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE,
              usedSqlFallback: true,
            },
          );
        }
      }
      return this.buildUnavailableGatewayReadResult(
        tableName,
        strategy,
        this.resolveAuthoritativeReadFailureOutcome(strategy),
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.AUTHORITATIVE_READ_OWNER_UNAVAILABLE,
      );
    }

    const authoritativeResult =
      await cdcIntegrationService.executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        requestOptions,
      );

    return this.buildGatewayReadResult(
      authoritativeResult,
      tableName,
      strategy,
      authoritativeResult?.success === true ?
        CONTROL_PLANE_READ_OUTCOME.AUTHORITATIVE :
        this.resolveAuthoritativeReadFailureOutcome(strategy),
    );
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeOwnerLocalRead(tableName, sql, params, options) {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const queryOptions = this.buildQueryOptions(options, {
      tableName,
      sql,
    });
    const {requestOptions} = buildAuthoritativeControlPlaneReadRequestOptions(
      options,
      queryOptions,
    );
    if (
      typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead ===
      TYPEOF.FUNCTION
    ) {
      const authoritativeResult =
        await cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          requestOptions,
        );
      return this.buildGatewayReadResult(
        authoritativeResult,
        tableName,
        CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
        authoritativeResult?.success === true ?
          CONTROL_PLANE_READ_OUTCOME.OWNER_LOCAL_NON_PROPAGATED :
          CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        {
          rowCount: Number.isFinite(authoritativeResult?.rowCount) ?
            authoritativeResult.rowCount :
            Array.isArray(authoritativeResult?.rows) ?
              authoritativeResult.rows.length :
              NUM.ZERO,
        },
      );
    }
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    if (typeof sqlQueryEngine?.executeQuery !== TYPEOF.FUNCTION) {
      return this.buildUnavailableGatewayReadResult(
        tableName,
        CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
        CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.SQL_QUERY_ENGINE_UNAVAILABLE,
      );
    }
    const result = await sqlQueryEngine.executeQuery(
      sql,
      params,
      queryOptions,
    );
    return this.buildGatewayReadResult(
      result,
      tableName,
      CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
      result?.success === false ?
        CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY :
        CONTROL_PLANE_READ_OUTCOME.OWNER_LOCAL_NON_PROPAGATED,
    );
  }

  /**
   * @param {string} tableName
   * @param {Object} readIntent
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeBootstrapSnapshotRead(tableName, readIntent, options) {
    const phaseScope = normalizePhaseScope(
      readIntent?.phaseScope || options?.phaseScope,
    );
    if (!phaseScope) {
      return this.buildBootstrapSnapshotFailureResult(
        tableName,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.BOOTSTRAP_SNAPSHOT_PHASE_SCOPE_REQUIRED,
      );
    } else if (typeof readIntent?.readBootstrapSnapshot === TYPEOF.FUNCTION) {
      const rows = await readIntent.readBootstrapSnapshot(readIntent, options);
      return this.buildBootstrapSnapshotSuccessResult(
        tableName,
        Array.isArray(rows) ? rows : [],
      );
    } else if (!Array.isArray(readIntent?.bootstrapSnapshotRows)) {
      return this.buildBootstrapSnapshotFailureResult(
        tableName,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.BOOTSTRAP_SNAPSHOT_UNAVAILABLE,
      );
    }
    return this.buildBootstrapSnapshotSuccessResult(
      tableName,
      readIntent.bootstrapSnapshotRows,
    );
  }
}

function installControlPlaneSystemTableGatewaySegment3ReadMethods(prototype) {
  const methodDescriptors = Object.getOwnPropertyDescriptors(
    ControlPlaneSystemTableGatewaySegment3ReadMethods.prototype,
  );
  delete methodDescriptors.constructor;
  Object.defineProperties(prototype, methodDescriptors);
}

export {installControlPlaneSystemTableGatewaySegment3ReadMethods};
