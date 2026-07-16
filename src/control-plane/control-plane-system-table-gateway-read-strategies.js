import {
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE,
  canonicalizeSystemTableRow,
  buildAuthoritativeControlPlaneReadRequestOptions,
  normalizePhaseScope,
  stableSerialize,
} from './control-plane-system-table-gateway-shared.js';

const COMPLETE_TABLE_READ_SQL_PATTERN =
  /^SELECT\s+\*\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?$/iu;
const AUTHORITATIVE_READ_FAILURE_COLLECTION_FIELDS = Object.freeze([
  'failedPartitions',
  'partitionErrors',
  'participantFailures',
]);
const authoritativeObservationReceiptsByGateway = new WeakMap();

function resolveAuthoritativeObservationReceiptRegistry(gateway) {
  let receipts = authoritativeObservationReceiptsByGateway.get(gateway);
  if (!receipts) {
    receipts = new WeakMap();
    authoritativeObservationReceiptsByGateway.set(gateway, receipts);
  }
  return receipts;
}

function snapshotAuthoritativeReadRows(tableName, rows) {
  return Object.freeze(rows.map((row) => stableSerialize(
    canonicalizeSystemTableRow(tableName, row),
  )));
}

function authoritativeReadRowsMatchSnapshot(tableName, rows, snapshot) {
  if (!Array.isArray(rows) || rows.length !== snapshot?.length) {
    return false;
  }
  const currentSnapshot = snapshotAuthoritativeReadRows(tableName, rows);
  return currentSnapshot.every((row, index) => row === snapshot[index]);
}

function hasAuthoritativeReadFailureEvidence(result = {}) {
  if (result?.partial === true) {
    return true;
  }
  return AUTHORITATIVE_READ_FAILURE_COLLECTION_FIELDS.some((fieldName) => {
    const value = result?.[fieldName];
    return Array.isArray(value) ?
      value.length > 0 :
      Number.isFinite(value) && value > 0;
  });
}

function isCompleteAuthoritativeReadResult(result = {}) {
  return result?.success === true &&
    Array.isArray(result?.rows) &&
    !hasAuthoritativeReadFailureEvidence(result);
}

function isCompleteTableReadRequest(tableName, sql, params) {
  if (!Array.isArray(params) || params.length > 0) {
    return false;
  }
  const match = String(sql || '').trim().match(
    COMPLETE_TABLE_READ_SQL_PATTERN,
  );
  return match?.[1] === tableName;
}

const controlPlaneSystemTableGatewayReadStrategyMethods = {
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
      typeof readIntent?.readFromCache === 'function' ?
        readIntent.readFromCache :
        null;
    const cachePredicate =
      typeof readIntent?.cachePredicate === 'function' ?
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
      typeof systemTableCache?.filter === 'function'
    ) {
      rows = systemTableCache.filter(tableName, cachePredicate) || [];
    } else if (typeof systemTableCache?.getAll === 'function') {
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
  },

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
    const rows = Array.isArray(baseResult?.rows) ? baseResult.rows : [];
    const rowSetComplete = isCompleteAuthoritativeReadResult(baseResult);
    return {
      ...baseResult,
      ...extra,
      tableName,
      rows,
      rowSetComplete,
      outcome,
      strategyUsed,
    };
  },

  /**
   * Mint complete-table observation evidence only after the canonical read
   * gateway has validated both the request scope and the returned row set.
   * Callers may request this receipt, but they cannot assert completeness.
   * @param {Object} result
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {string} strategy
   * @param {Object} options
   * @return {Object}
   * @private
   */
  attachAuthoritativeObservationReceipt(
    result,
    tableName,
    sql,
    params,
    strategy,
    options,
  ) {
    if (
      options?.authoritativeObservationScope !==
      CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE
    ) {
      return result;
    }
    const causeId =
      typeof options?.sessionId === 'string' && options.sessionId.length > 0 ?
        options.sessionId :
        null;
    if (
      result?.rowSetComplete !== true ||
      !isCompleteTableReadRequest(tableName, sql, params) ||
      causeId === null
    ) {
      return {
        ...result,
        success: false,
        rows: [],
        rowSetComplete: false,
        authoritativeObservation: null,
        outcome: this.resolveAuthoritativeReadFailureOutcome(strategy),
        error:
          CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.READ_INCOMPLETE,
      };
    }
    const authoritativeObservation = Object.freeze({
      scope: CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
      tableName,
      observedAtMs: Math.floor(this.now()),
      causeId,
      rowSetComplete: true,
    });
    resolveAuthoritativeObservationReceiptRegistry(this).set(
      authoritativeObservation,
      Object.freeze({
        tableName,
        rows: result.rows,
        snapshot: snapshotAuthoritativeReadRows(tableName, result.rows),
      }),
    );
    return {...result, authoritativeObservation};
  },

  /**
   * Consume a gateway-minted receipt exactly once and bind it to the exact row
   * array returned by that complete authoritative read. Shape-compatible
   * caller objects are not observation evidence.
   * @param {Object} receipt
   * @param {string} tableName
   * @param {Array<Object>} rows
   * @return {boolean}
   * @private
   */
  consumeAuthoritativeObservationReceipt(receipt, tableName, rows) {
    if (!receipt || typeof receipt !== 'object') {
      return false;
    }
    const receipts = resolveAuthoritativeObservationReceiptRegistry(this);
    const mintedRead = receipts.get(receipt) || null;
    receipts.delete(receipt);
    return mintedRead?.tableName === tableName &&
      mintedRead?.rows === rows &&
      authoritativeReadRowsMatchSnapshot(tableName, rows, mintedRead?.snapshot);
  },

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
  },

  /**
   * @param {string} strategy
   * @return {string}
   * @private
   */
  resolveAuthoritativeReadFailureOutcome(strategy) {
    return strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED ?
      CONTROL_PLANE_READ_OUTCOME.STALE_NOT_ALLOWED :
      CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY;
  },

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
  },

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
  },

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
      'function'
    ) {
      if (
        allowSqlFallback &&
        strategy !== CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED
      ) {
        const sqlQueryEngine = this.resolveSqlQueryEngine();
        if (typeof sqlQueryEngine?.executeQuery === 'function') {
          const result = await sqlQueryEngine.executeQuery(
            sql,
            params,
            queryOptions,
          );
          return this.attachAuthoritativeObservationReceipt(
            this.buildGatewayReadResult(
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
            ),
            tableName,
            sql,
            params,
            strategy,
            options,
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

    return this.attachAuthoritativeObservationReceipt(
      this.buildGatewayReadResult(
        authoritativeResult,
        tableName,
        strategy,
        authoritativeResult?.success === true ?
          CONTROL_PLANE_READ_OUTCOME.AUTHORITATIVE :
          this.resolveAuthoritativeReadFailureOutcome(strategy),
      ),
      tableName,
      sql,
      params,
      strategy,
      options,
    );
  },

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
      'function'
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
              0,
        },
      );
    }
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    if (typeof sqlQueryEngine?.executeQuery !== 'function') {
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
  },

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
    } else if (typeof readIntent?.readBootstrapSnapshot === 'function') {
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
  },
};

function assignControlPlaneSystemTableGatewayReadStrategies(targetClass) {
  Object.assign(
    targetClass.prototype,
    controlPlaneSystemTableGatewayReadStrategyMethods,
  );
}

export {assignControlPlaneSystemTableGatewayReadStrategies};
