import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from './pressure-governor.js';
import {buildControlPlaneQueryOptions} from './timeout-budget.js';
import {
  CDC_OPERATION,
  METRICS_LOG_TAG,
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {getSystemCachePrimaryKeyFieldOrFallback} from
  '../cache/system-cache-key-descriptor.js';

const CONTROL_PLANE_LOCAL_READ_CONSISTENCY = 'local_leader';
const CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY = 'any_replica';
const CONTROL_PLANE_READ_STRATEGY = Object.freeze({
  CACHE: 'cache',
  AUTHORITATIVE: 'authoritative',
  AUTHORITATIVE_REQUIRED: 'authoritative_required',
  OWNER_LOCAL_NON_PROPAGATED: 'owner_local_non_propagated',
  BOOTSTRAP_SNAPSHOT: 'bootstrap_snapshot',
});
const CONTROL_PLANE_PHASE_SCOPE = Object.freeze({
  BOOTSTRAP: 'bootstrap',
  JOIN: 'join',
});
const CONTROL_PLANE_READ_OUTCOME = Object.freeze({
  CACHE_HIT: 'cache_hit',
  AUTHORITATIVE: 'authoritative',
  OWNER_LOCAL_NON_PROPAGATED: 'owner_local_non_propagated',
  BOOTSTRAP_SNAPSHOT: 'bootstrap_snapshot',
  DEFERRED: 'deferred',
  REJECTED: 'rejected',
  STALE_NOT_ALLOWED: 'stale_not_allowed',
  OWNER_NOT_READY: 'owner_not_ready',
});
const CONTROL_PLANE_MUTATION_OUTCOME = Object.freeze({
  APPLIED: 'applied',
  NO_OP: 'no_op',
  DEFERRED: 'deferred',
  REJECTED: 'rejected',
  OWNER_NOT_READY: 'owner_not_ready',
  OBSERVED_STATE_CHANGED: 'observed_state_changed',
});
const CONTROL_PLANE_SQL_OPERATION = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  UNKNOWN: 'unknown',
});
const CONTROL_PLANE_MUTATION_OPERATION = Object.freeze({
  INSERT: 'insert',
  UPDATE: 'update',
  UPSERT: 'upsert',
  DELETE: 'delete',
});
const CONTROL_PLANE_MUTATION_MERGE_POLICY = Object.freeze({
  NONE: 'none',
  SINGLE_FLIGHT: 'single_flight',
  REPLACE_PENDING: 'replace_pending',
});
const CONTROL_PLANE_GATEWAY_LIMIT = Object.freeze({
  MAX_TRACKED_READ_REQUESTS: 512,
  MAX_TRACKED_QUERY_REQUESTS: 512,
  MAX_TRACKED_MUTATION_REQUESTS: 512,
  MAX_PENDING_REPLACE_MUTATION_REQUESTS: 512,
});
const CONTROL_PLANE_GATEWAY_ERROR_CODE = Object.freeze({
  MUTATION_TRACKING_SATURATED: 'CONTROL_PLANE_MUTATION_TRACKING_SATURATED',
});
const GATEWAY_ERROR_MSG = Object.freeze({
  CDC_REQUIRED:
    'ControlPlaneSystemTableGateway requires cdcIntegrationService',
  SQL_ENGINE_REQUIRED:
    'ControlPlaneSystemTableGateway requires sqlQueryEngine',
  MUTATION_OPERATION_REQUIRED:
    'ControlPlaneSystemTableGateway requires a supported mutation operation',
  MUTATION_TABLE_REQUIRED:
    'ControlPlaneSystemTableGateway requires a valid system table name',
  MUTATION_ROW_REQUIRED:
    'ControlPlaneSystemTableGateway requires row data for insert/upsert',
  MUTATION_WHERE_REQUIRED:
    'ControlPlaneSystemTableGateway requires whereClause for update/delete',
  MUTATION_DATA_REQUIRED:
    'ControlPlaneSystemTableGateway requires update data for update',
});
const GATEWAY_LOG_MSG = Object.freeze({
  READ_DEFERRED: 'Control-plane metadata read deferred',
  READ_REJECTED: 'Control-plane metadata read rejected',
  MUTATION_DEFERRED: 'Control-plane metadata mutation deferred',
  MUTATION_REJECTED: 'Control-plane metadata mutation rejected',
});
const SYSTEM_TABLE_NAMES = new Set(Object.values(SYSTEM_TABLE_NAME));

function normalizeCoalescingToken(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    null;
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObjectKeys(entry));
  }
  if (!value || typeof value !== TYPEOF.OBJECT) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      accumulator[key] = sortObjectKeys(value[key]);
      return accumulator;
    }, {});
}

function stableSerialize(value) {
  return JSON.stringify(sortObjectKeys(value));
}

function normalizeSystemTableName(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return SYSTEM_TABLE_NAMES.has(normalized) ? normalized : null;
}

function normalizePhaseScope(value) {
  if (value === CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP) {
    return CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP;
  }
  if (value === CONTROL_PLANE_PHASE_SCOPE.JOIN) {
    return CONTROL_PLANE_PHASE_SCOPE.JOIN;
  }
  return null;
}

function extractSystemTableNameFromSql(sql) {
  if (typeof sql !== TYPEOF.STRING || sql.trim().length === NUM.ZERO) {
    return null;
  }
  const normalizedSql = sql.trim();
  for (const matcher of [
    /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i,
    /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i,
    /^\s*update\s+([a-zA-Z_][\w]*)/i,
    /^\s*delete\s+from\s+([a-zA-Z_][\w]*)/i,
  ]) {
    const match = normalizedSql.match(matcher);
    if (match?.[1]) {
      return normalizeSystemTableName(match[1]);
    }
  }
  return null;
}

function normalizeSqlOperationKind(value) {
  if (value === CONTROL_PLANE_SQL_OPERATION.READ) {
    return CONTROL_PLANE_SQL_OPERATION.READ;
  }
  if (value === CONTROL_PLANE_SQL_OPERATION.WRITE) {
    return CONTROL_PLANE_SQL_OPERATION.WRITE;
  }
  return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
}

function normalizeMutationOperation(value) {
  if (value === CONTROL_PLANE_MUTATION_OPERATION.INSERT) {
    return CONTROL_PLANE_MUTATION_OPERATION.INSERT;
  }
  if (value === CONTROL_PLANE_MUTATION_OPERATION.UPDATE) {
    return CONTROL_PLANE_MUTATION_OPERATION.UPDATE;
  }
  if (value === CONTROL_PLANE_MUTATION_OPERATION.UPSERT) {
    return CONTROL_PLANE_MUTATION_OPERATION.UPSERT;
  }
  if (value === CONTROL_PLANE_MUTATION_OPERATION.DELETE) {
    return CONTROL_PLANE_MUTATION_OPERATION.DELETE;
  }
  return null;
}

function normalizeMutationMergePolicy(value) {
  if (value === CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE) {
    return CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE;
  }
  if (value === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT) {
    return CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT;
  }
  if (value === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING) {
    return CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING;
  }
  return null;
}

function createDeferredPromise() {
  let resolve = null;
  let reject = null;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return {promise, resolve, reject};
}

function normalizePositiveInteger(value, fallbackValue) {
  return Number.isInteger(value) && value > NUM.ZERO ? value : fallbackValue;
}

function normalizeReadStrategy(value) {
  if (value === CONTROL_PLANE_READ_STRATEGY.CACHE) {
    return CONTROL_PLANE_READ_STRATEGY.CACHE;
  }
  if (value === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE) {
    return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE;
  }
  if (value === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED) {
    return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED;
  }
  if (value === CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED) {
    return CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED;
  }
  if (value === CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT) {
    return CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT;
  }
  return null;
}

function extractSqlOperationKind(sql) {
  if (typeof sql !== TYPEOF.STRING) {
    return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
  }
  const normalizedSql = sql.trim().toLowerCase();
  if (normalizedSql.startsWith('select')) {
    return CONTROL_PLANE_SQL_OPERATION.READ;
  }
  if (normalizedSql.startsWith('insert') ||
      normalizedSql.startsWith('update') ||
      normalizedSql.startsWith('delete')) {
    return CONTROL_PLANE_SQL_OPERATION.WRITE;
  }
  return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
}

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
    this.systemTableCache = options.systemTableCache || null;
    this.messageRouter = options.messageRouter || null;
    this.pressureGovernor = options.pressureGovernor || null;
    this.logger = options.logger || null;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.inFlightReadRequestsByKey = new Map();
    this.inFlightQueryRequestsByKey = new Map();
    this.inFlightMutationRequestsByKey = new Map();
    this.pendingReplaceMutationRequestsByKey = new Map();
    this.gatewayLimits = Object.freeze({
      maxTrackedReadRequests: normalizePositiveInteger(
        options.maxTrackedReadRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_READ_REQUESTS,
      ),
      maxTrackedQueryRequests: normalizePositiveInteger(
        options.maxTrackedQueryRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_QUERY_REQUESTS,
      ),
      maxTrackedMutationRequests: normalizePositiveInteger(
        options.maxTrackedMutationRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_MUTATION_REQUESTS,
      ),
      maxPendingReplaceMutationRequests: normalizePositiveInteger(
        options.maxPendingReplaceMutationRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_PENDING_REPLACE_MUTATION_REQUESTS,
      ),
    });
    this.gatewayMetrics = {
      readSingleFlightJoinCount: NUM.ZERO,
      querySingleFlightJoinCount: NUM.ZERO,
      mutationSingleFlightJoinCount: NUM.ZERO,
      readTrackingBypassCount: NUM.ZERO,
      queryTrackingBypassCount: NUM.ZERO,
      mutationReplacePendingQueuedCount: NUM.ZERO,
      mutationReplacePendingSupersededCount: NUM.ZERO,
      mutationTrackingRejectedCount: NUM.ZERO,
      maxObservedInFlightReadRequests: NUM.ZERO,
      maxObservedInFlightQueryRequests: NUM.ZERO,
      maxObservedInFlightMutationRequests: NUM.ZERO,
      maxObservedPendingReplaceMutationRequests: NUM.ZERO,
      maxObservedRetainedRequestCount: NUM.ZERO,
      maxObservedReadLatencyMs: NUM.ZERO,
      maxObservedMutationLatencyMs: NUM.ZERO,
      readOutcomeCounts: Object.create(null),
      mutationOutcomeCounts: Object.create(null),
    };
    this.lastRetentionMetricSignature = null;
    this.recordGatewayRetentionSnapshot();
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
   * @param {Object|null} systemTableCache
   */
  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache || null;
  }

  /**
   * @param {Object|null} messageRouter
   */
  setMessageRouter(messageRouter) {
    this.messageRouter = messageRouter || null;
  }

  /**
   * Reconcile authoritative rows into the writable system-table cache.
   * This is the only runtime cache-repair ingress outside CDC delivery.
   *
   * @param {string} tableName
   * @param {Object[]} authoritativeRows
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async reconcileAuthoritativeCacheRows(
    tableName,
    authoritativeRows = [],
    options = {},
  ) {
    const writableCache = options?.cacheMutationTarget || this.systemTableCache;
    const readableCache = options?.systemTableCache || this.systemTableCache || writableCache;
    if (!writableCache ||
        typeof writableCache.applySystemTableChange !== TYPEOF.FUNCTION ||
        !readableCache) {
      return {
        success: false,
        tableName,
        mutationCount: NUM.ZERO,
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        error: 'system_table_cache_unavailable',
      };
    }

    const primaryKeyField = options?.primaryKeyField ||
      getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');
    const authoritativeEntries = Array.isArray(authoritativeRows) ?
      authoritativeRows :
      [];
    const cachedEntries = Array.isArray(options?.cachedRows) ?
      options.cachedRows :
      (
        typeof options?.cachedRowFilter === TYPEOF.FUNCTION &&
          typeof readableCache.filter === TYPEOF.FUNCTION ?
          readableCache.filter(tableName, options.cachedRowFilter) || [] :
          (
            typeof readableCache.getAll === TYPEOF.FUNCTION ?
              readableCache.getAll(tableName) || [] :
              []
          )
      );
    const rowComparator = typeof options?.areRowsEqual === TYPEOF.FUNCTION ?
      options.areRowsEqual :
      null;
    const causeOptions = typeof options?.causeId === TYPEOF.STRING &&
      options.causeId.length > NUM.ZERO ?
      {causeId: options.causeId} :
      undefined;
    const cachedRowsByKey = new Map();
    const authoritativeKeys = new Set();
    let mutationCount = NUM.ZERO;

    for (const row of cachedEntries) {
      const key = row?.[primaryKeyField] ?? row?.id;
      if (typeof key === TYPEOF.UNDEFINED || key === null) {
        continue;
      }
      cachedRowsByKey.set(String(key), row);
    }

    for (const row of authoritativeEntries) {
      const key = row?.[primaryKeyField] ?? row?.id;
      if (typeof key === TYPEOF.UNDEFINED || key === null) {
        continue;
      }
      const normalizedKey = String(key);
      authoritativeKeys.add(normalizedKey);
      const cachedRow = cachedRowsByKey.get(normalizedKey) || null;
      if (rowComparator && rowComparator(cachedRow, row)) {
        continue;
      }
      writableCache.applySystemTableChange(
        tableName,
        CDC_OPERATION.UPSERT,
        row,
        causeOptions,
      );
      mutationCount += NUM.ONE;
    }

    if (options?.deleteMissing !== false) {
      for (const cachedRow of cachedEntries) {
        const key = cachedRow?.[primaryKeyField] ?? cachedRow?.id;
        if (typeof key === TYPEOF.UNDEFINED ||
            key === null ||
            authoritativeKeys.has(String(key))) {
          continue;
        }
        writableCache.applySystemTableChange(
          tableName,
          CDC_OPERATION.DELETE,
          cachedRow,
          causeOptions,
        );
        mutationCount += NUM.ONE;
      }
    }

    return {
      success: true,
      tableName,
      mutationCount,
      outcome:
        mutationCount > NUM.ZERO ?
          CONTROL_PLANE_MUTATION_OUTCOME.APPLIED :
          CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
    };
  }

  /**
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (this.pressureGovernor) {
      this.pressureGovernor.configure({
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        logger: this.logger,
      });
      return this.pressureGovernor;
    }
    this.pressureGovernor = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      logger: this.logger,
    });
    return this.pressureGovernor;
  }

  /**
   * @return {boolean}
   */
  supportsReadRows() {
    return (
      Boolean(this.systemTableCache) ||
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
    let queryOptions = {
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
    queryOptions = copyOption(queryOptions, options, 'deliveryPriority');
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
    writeOptions = copyOption(writeOptions, options, 'deliveryPriority');
    writeOptions = copyOption(writeOptions, options, 'workClass');
    writeOptions = copyOption(writeOptions, options, 'allowPressureDefer');
    writeOptions = copyOption(writeOptions, options, 'pressureRetryAfterMs');
    writeOptions = copyOption(writeOptions, options, 'coalescingKey');
    writeOptions = copyOption(writeOptions, options, 'allowCoalescing');
    writeOptions = copyOption(writeOptions, options, 'mergePolicy');
    return writeOptions;
  }

  /**
   * @return {Object}
   */
  getStats() {
    return {
      limits: {...this.gatewayLimits},
      retainedRequests: {
        inFlightReads: this.inFlightReadRequestsByKey.size,
        inFlightQueries: this.inFlightQueryRequestsByKey.size,
        inFlightMutations: this.inFlightMutationRequestsByKey.size,
        pendingReplaceMutations: this.pendingReplaceMutationRequestsByKey.size,
        total:
          this.inFlightReadRequestsByKey.size +
          this.inFlightQueryRequestsByKey.size +
          this.inFlightMutationRequestsByKey.size +
          this.pendingReplaceMutationRequestsByKey.size,
      },
      metrics: this.buildGatewayMetricsSnapshot(),
    };
  }

  /**
   * @return {Object}
   * @private
   */
  buildGatewayMetricsSnapshot() {
    return {
      ...this.gatewayMetrics,
      readOutcomeCounts: {...this.gatewayMetrics.readOutcomeCounts},
      mutationOutcomeCounts: {...this.gatewayMetrics.mutationOutcomeCounts},
    };
  }

  /**
   * @return {Object}
   * @private
   */
  buildRetainedRequestsSnapshot() {
    return {
      inFlightReads: this.inFlightReadRequestsByKey.size,
      inFlightQueries: this.inFlightQueryRequestsByKey.size,
      inFlightMutations: this.inFlightMutationRequestsByKey.size,
      pendingReplaceMutations: this.pendingReplaceMutationRequestsByKey.size,
      total:
        this.inFlightReadRequestsByKey.size +
        this.inFlightQueryRequestsByKey.size +
        this.inFlightMutationRequestsByKey.size +
        this.pendingReplaceMutationRequestsByKey.size,
    };
  }

  /**
   * @return {Object}
   * @private
   */
  buildRetentionMetricData() {
    const retainedRequests = this.buildRetainedRequestsSnapshot();
    const retainedRequestCapacity =
      this.gatewayLimits.maxTrackedReadRequests +
      this.gatewayLimits.maxTrackedQueryRequests +
      this.gatewayLimits.maxTrackedMutationRequests +
      this.gatewayLimits.maxPendingReplaceMutationRequests;
    return {
      nodeId: this.nodeId,
      retainedRequests,
      limits: {...this.gatewayLimits},
      retainedRequestCapacity,
      retainedRequestUtilization:
        retainedRequestCapacity > NUM.ZERO ?
          retainedRequests.total / retainedRequestCapacity :
          NUM.ZERO,
      boundedByTrackedCapacity: retainedRequests.total <= retainedRequestCapacity,
      maxObservedRetainedRequestCount:
        this.gatewayMetrics.maxObservedRetainedRequestCount,
    };
  }

  /**
   * @private
   */
  recordGatewayRetentionSnapshot() {
    const retainedRequests = this.buildRetainedRequestsSnapshot();
    const retainedRequestCount = retainedRequests.total;
    this.gatewayMetrics.maxObservedInFlightReadRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightReadRequests,
      retainedRequests.inFlightReads,
    );
    this.gatewayMetrics.maxObservedInFlightQueryRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightQueryRequests,
      retainedRequests.inFlightQueries,
    );
    this.gatewayMetrics.maxObservedInFlightMutationRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightMutationRequests,
      retainedRequests.inFlightMutations,
    );
    this.gatewayMetrics.maxObservedPendingReplaceMutationRequests = Math.max(
      this.gatewayMetrics.maxObservedPendingReplaceMutationRequests,
      retainedRequests.pendingReplaceMutations,
    );
    this.gatewayMetrics.maxObservedRetainedRequestCount = Math.max(
      this.gatewayMetrics.maxObservedRetainedRequestCount,
      retainedRequestCount,
    );
    this.emitGatewayRetentionMetric();
  }

  /**
   * @param {string} metricName
   * @private
   */
  incrementGatewayMetric(metricName) {
    if (typeof this.gatewayMetrics?.[metricName] !== TYPEOF.NUMBER) {
      return;
    }
    this.gatewayMetrics[metricName] += 1;
  }

  /**
   * @param {string} metricName
   * @param {number} latencyMs
   * @private
   */
  recordGatewayLatency(metricName, latencyMs) {
    if (typeof this.gatewayMetrics?.[metricName] !== TYPEOF.NUMBER) {
      return;
    }
    if (!Number.isFinite(latencyMs) || latencyMs < NUM.ZERO) {
      return;
    }
    this.gatewayMetrics[metricName] = Math.max(
      this.gatewayMetrics[metricName],
      Math.floor(latencyMs),
    );
  }

  /**
   * @param {string} bucketName
   * @param {string|null} outcome
   * @private
   */
  incrementGatewayOutcomeMetric(bucketName, outcome) {
    const bucket = this.gatewayMetrics?.[bucketName];
    if (!bucket || typeof bucket !== TYPEOF.OBJECT) {
      return;
    }
    const normalizedOutcome = typeof outcome === TYPEOF.STRING &&
      outcome.length > NUM.ZERO ?
      outcome :
      'unknown';
    bucket[normalizedOutcome] = Number.isFinite(bucket[normalizedOutcome]) ?
      bucket[normalizedOutcome] + NUM.ONE :
      NUM.ONE;
  }

  /**
   * @param {string} tag
   * @param {Object} data
   * @private
   */
  emitGatewayMetric(tag, data) {
    if (typeof this.logger?.info !== TYPEOF.FUNCTION) {
      return;
    }
    try {
      this.logger.info(tag, data);
    } catch (_error) {
      // Metrics logging must not change gateway behavior.
    }
  }

  /**
   * @param {string} message
   * @param {Object} data
   * @private
   */
  emitGatewayWarning(message, data) {
    if (typeof this.logger?.warn !== TYPEOF.FUNCTION) {
      return;
    }
    try {
      this.logger.warn(message, data);
    } catch (_error) {
      // Diagnostic logging must not change gateway behavior.
    }
  }

  /**
   * @private
   */
  emitGatewayRetentionMetric() {
    const data = this.buildRetentionMetricData();
    const signature = stableSerialize(data);
    if (signature === this.lastRetentionMetricSignature) {
      return;
    }
    this.lastRetentionMetricSignature = signature;
    this.emitGatewayMetric(METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_RETENTION, data);
  }

  /**
   * @param {number} startedAtMs
   * @return {number}
   * @private
   */
  resolveLatencyMs(startedAtMs) {
    if (!Number.isFinite(startedAtMs)) {
      return NUM.ZERO;
    }
    return Math.max(NUM.ZERO, Math.floor(this.now() - startedAtMs));
  }

  /**
   * @param {Object} context
   * @param {Object} result
   * @private
   */
  recordReadTelemetry(context = {}, result = {}) {
    const latencyMs = this.resolveLatencyMs(context.startedAtMs);
    const outcome = typeof result?.outcome === TYPEOF.STRING ?
      result.outcome :
      CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY;
    this.incrementGatewayOutcomeMetric('readOutcomeCounts', outcome);
    this.recordGatewayLatency('maxObservedReadLatencyMs', latencyMs);
    this.emitGatewayMetric(METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_READ, {
      nodeId: this.nodeId,
      owner: context.owner || null,
      tableName: context.tableName || null,
      outcome,
      strategy: result?.strategyUsed || context.strategy || null,
      workClass: context.workClass || null,
      coalescingKey: context.coalescingKey || null,
      latencyMs,
      success: result?.success === true,
      rowCount: Number.isFinite(result?.rowCount) ?
        result.rowCount :
        (Array.isArray(result?.rows) ? result.rows.length : NUM.ZERO),
    });
    if (outcome === CONTROL_PLANE_READ_OUTCOME.DEFERRED ||
        outcome === CONTROL_PLANE_READ_OUTCOME.REJECTED) {
      this.emitGatewayWarning(
        outcome === CONTROL_PLANE_READ_OUTCOME.DEFERRED ?
          GATEWAY_LOG_MSG.READ_DEFERRED :
          GATEWAY_LOG_MSG.READ_REJECTED,
        {
          nodeId: this.nodeId,
          owner: context.owner || null,
          tableName: context.tableName || null,
          strategy: result?.strategyUsed || context.strategy || null,
          workClass: context.workClass || null,
          coalescingKey: context.coalescingKey || null,
          pressureAction: result?.pressureAction || null,
          pressureReason: result?.pressureReason || null,
          retryAfterMs: Number.isFinite(result?.retryAfterMs) ?
            result.retryAfterMs :
            null,
          error: result?.error || null,
        },
      );
    }
  }

  /**
   * @param {Object} context
   * @param {Object} result
   * @private
   */
  recordMutationTelemetry(context = {}, result = {}) {
    const latencyMs = this.resolveLatencyMs(context.startedAtMs);
    const outcome = typeof result?.outcome === TYPEOF.STRING ?
      result.outcome :
      CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY;
    this.incrementGatewayOutcomeMetric('mutationOutcomeCounts', outcome);
    this.recordGatewayLatency('maxObservedMutationLatencyMs', latencyMs);
    this.emitGatewayMetric(METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_MUTATION, {
      nodeId: this.nodeId,
      owner: context.owner || null,
      tableName: context.tableName || null,
      operation: context.operation || null,
      outcome,
      workClass: context.workClass || null,
      coalescingKey: context.coalescingKey || null,
      mergePolicy: context.mergePolicy || null,
      latencyMs,
      success: result?.success === true,
    });
    if (outcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED ||
        outcome === CONTROL_PLANE_MUTATION_OUTCOME.REJECTED) {
      this.emitGatewayWarning(
        outcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED ?
          GATEWAY_LOG_MSG.MUTATION_DEFERRED :
          GATEWAY_LOG_MSG.MUTATION_REJECTED,
        {
          nodeId: this.nodeId,
          owner: context.owner || null,
          tableName: context.tableName || null,
          operation: context.operation || null,
          workClass: context.workClass || null,
          coalescingKey: context.coalescingKey || null,
          mergePolicy: context.mergePolicy || null,
          pressureAction: result?.pressureAction || null,
          pressureReason: result?.pressureReason || null,
          retryAfterMs: Number.isFinite(result?.retryAfterMs) ?
            result.retryAfterMs :
            null,
          error: result?.error || null,
        },
      );
    }
  }

  /**
   * @param {Object} result
   * @return {Object}
   * @private
   */
  buildTrackingSaturatedMutationResult(result = {}) {
    return {
      success: false,
      error: 'control_plane_mutation_tracking_saturated',
      errorCode: CONTROL_PLANE_GATEWAY_ERROR_CODE.MUTATION_TRACKING_SATURATED,
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
      ...result,
    };
  }

  /**
   * @param {Map<string, Promise<Object>>} requestMap
   * @param {string|null} key
   * @param {Function} executionFactory
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  runSingleFlight(requestMap, key, executionFactory, options = {}) {
    if (!key) {
      return executionFactory();
    }
    const existingRequest = requestMap.get(key);
    if (existingRequest) {
      if (typeof options?.joinMetricName === TYPEOF.STRING) {
        this.incrementGatewayMetric(options.joinMetricName);
      }
      return existingRequest;
    }
    const maxTrackedRequests = normalizePositiveInteger(
      options?.maxTrackedRequests,
      Number.MAX_SAFE_INTEGER,
    );
    if (requestMap.size >= maxTrackedRequests) {
      if (typeof options?.bypassMetricName === TYPEOF.STRING) {
        this.incrementGatewayMetric(options.bypassMetricName);
      }
      return executionFactory();
    }
    let inFlightRequest = null;
    inFlightRequest = Promise.resolve()
      .then(() => executionFactory())
      .finally(() => {
        if (requestMap.get(key) === inFlightRequest) {
          requestMap.delete(key);
          this.recordGatewayRetentionSnapshot();
        }
      });
    requestMap.set(key, inFlightRequest);
    this.recordGatewayRetentionSnapshot();
    return inFlightRequest;
  }

  /**
   * @param {Object} mutation
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildMutationCoalescingDescriptor(mutation = {}, options = {}) {
    const allowCoalescing = options?.allowCoalescing !== false;
    const mergePolicy = normalizeMutationMergePolicy(
      options?.mergePolicy || mutation?.mergePolicy,
    ) || (
      allowCoalescing ?
        CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT :
        CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE
    );
    const explicitKey = normalizeCoalescingToken(
      options?.coalescingKey || mutation?.coalescingKey,
    );
    if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE) {
      return {
        requestKey: null,
        mergePolicy,
      };
    }
    if (!explicitKey) {
      if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING) {
        return {
          requestKey: null,
          mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE,
        };
      }
      return {
        requestKey: stableSerialize({
          kind: 'control-plane-mutation',
          tableName: mutation?.tableName || null,
          operation: mutation?.operation || null,
          row: mutation?.row || null,
          whereClause: mutation?.whereClause || null,
          data: mutation?.data || null,
          workClass: options?.workClass || null,
          deliveryPriority: options?.deliveryPriority || null,
          allowPressureDefer: options?.allowPressureDefer === true,
          routingReadinessDimension:
            options?.routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
        }),
        mergePolicy,
      };
    }
    if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT) {
      return {
        requestKey: stableSerialize({
          kind: 'control-plane-mutation',
          explicitKey,
          tableName: mutation?.tableName || null,
          operation: mutation?.operation || null,
          row: mutation?.row || null,
          whereClause: mutation?.whereClause || null,
          data: mutation?.data || null,
          workClass: options?.workClass || null,
          deliveryPriority: options?.deliveryPriority || null,
          allowPressureDefer: options?.allowPressureDefer === true,
          routingReadinessDimension:
            options?.routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
        }),
        mergePolicy,
      };
    }
    return {
      requestKey: `control-plane:mutation:${mutation?.tableName || 'unknown'}:` +
        `${explicitKey}`,
      mergePolicy,
    };
  }

  /**
   * @param {string} requestKey
   * @return {Object}
   * @private
   */
  buildSupersededMutationResult(requestKey) {
    return {
      success: true,
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
      requestKey,
      superseded: true,
    };
  }

  /**
   * @param {string} requestKey
   * @param {Function} executionFactory
   * @param {Object|null} [deferred=null]
   * @return {Promise<Object>}
   * @private
   */
  scheduleMutationExecution(requestKey, executionFactory, deferred = null) {
    if (!this.inFlightMutationRequestsByKey.has(requestKey) &&
        this.inFlightMutationRequestsByKey.size >=
          this.gatewayLimits.maxTrackedMutationRequests) {
      this.incrementGatewayMetric('mutationTrackingRejectedCount');
      const saturatedResult = this.buildTrackingSaturatedMutationResult({
        requestKey,
      });
      if (deferred) {
        deferred.resolve(saturatedResult);
        return deferred.promise;
      }
      return Promise.resolve(saturatedResult);
    }
    let executionPromise = null;
    executionPromise = Promise.resolve()
      .then(() => executionFactory())
      .then((result) => {
        if (deferred) {
          deferred.resolve(result);
        }
        return result;
      }, (error) => {
        if (deferred) {
          deferred.reject(error);
        }
        throw error;
      })
      .finally(() => {
        if (this.inFlightMutationRequestsByKey.get(requestKey) === executionPromise) {
          this.inFlightMutationRequestsByKey.delete(requestKey);
          this.recordGatewayRetentionSnapshot();
        }
        const pendingRequest = this.pendingReplaceMutationRequestsByKey.get(requestKey);
        if (!pendingRequest) {
          return;
        }
        this.pendingReplaceMutationRequestsByKey.delete(requestKey);
        this.recordGatewayRetentionSnapshot();
        this.scheduleMutationExecution(
          requestKey,
          pendingRequest.executionFactory,
          pendingRequest.deferred,
        );
      });
    this.inFlightMutationRequestsByKey.set(requestKey, executionPromise);
    this.recordGatewayRetentionSnapshot();
    return deferred ? deferred.promise : executionPromise;
  }

  /**
   * @param {string} requestKey
   * @param {Function} executionFactory
   * @return {Promise<Object>}
   * @private
   */
  runReplacePendingMutation(requestKey, executionFactory) {
    const inFlightRequest = this.inFlightMutationRequestsByKey.get(requestKey);
    if (!inFlightRequest) {
      return this.scheduleMutationExecution(requestKey, executionFactory);
    }

    const existingPending = this.pendingReplaceMutationRequestsByKey.get(requestKey);
    if (existingPending) {
      this.incrementGatewayMetric('mutationReplacePendingSupersededCount');
      existingPending.deferred.resolve(
        this.buildSupersededMutationResult(requestKey),
      );
    }

    if (!existingPending &&
        this.pendingReplaceMutationRequestsByKey.size >=
          this.gatewayLimits.maxPendingReplaceMutationRequests) {
      this.incrementGatewayMetric('mutationTrackingRejectedCount');
      return Promise.resolve(this.buildTrackingSaturatedMutationResult({
        requestKey,
      }));
    }

    const deferred = createDeferredPromise();
    this.pendingReplaceMutationRequestsByKey.set(requestKey, {
      deferred,
      executionFactory,
    });
    this.incrementGatewayMetric('mutationReplacePendingQueuedCount');
    this.recordGatewayRetentionSnapshot();
    return deferred.promise;
  }

  /**
   * @param {string|null} tableName
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  evaluateReadPressure(tableName, options = {}) {
    return this.getPressureGovernor().evaluate({
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      resourceKeys: [
        'control-plane:read',
        `control-plane:table:${tableName || 'unknown'}`,
      ],
      allowDegrade: options?.allowPressureDegrade !== false,
      allowDefer: options?.allowPressureDefer === true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
  }

  /**
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  buildReadRequestKey(tableName, sql, params = [], options = {}) {
    const explicitKey = normalizeCoalescingToken(options?.coalescingKey);
    if (explicitKey) {
      return `control-plane:read:${tableName || 'unknown'}:${explicitKey}`;
    }
    if (options?.allowCoalescing === false) {
      return null;
    }
    return stableSerialize({
      kind: 'control-plane-read',
      tableName: tableName || null,
      strategy: options?.strategy || null,
      sql: sql || null,
      params: Array.isArray(params) ? params : [],
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      allowPressureDegrade: options?.allowPressureDegrade !== false,
      allowPressureDefer: options?.allowPressureDefer === true,
      phaseScope: normalizePhaseScope(options?.phaseScope),
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    });
  }

  /**
   * @param {string} sql
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  resolveSystemTableQueryDescriptor(sql, options = {}) {
    const tableName = normalizeSystemTableName(
      options?.controlPlaneTableName ||
      options?.tableName ||
      extractSystemTableNameFromSql(sql),
    );
    const operationKind = normalizeSqlOperationKind(
      options?.controlPlaneOperationKind ||
      options?.operationKind ||
      extractSqlOperationKind(sql),
    );
    return {
      tableName,
      operationKind,
      isSystemTable:
        Boolean(tableName) &&
        operationKind !== CONTROL_PLANE_SQL_OPERATION.UNKNOWN,
    };
  }

  /**
   * @param {Object} descriptor
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  buildExecuteQueryKey(descriptor, sql, params = [], options = {}) {
    const explicitKey = normalizeCoalescingToken(options?.coalescingKey);
    if (explicitKey) {
      return `control-plane:query:${descriptor.tableName || 'unknown'}:` +
        `${descriptor.operationKind}:${explicitKey}`;
    }
    if (options?.allowCoalescing === false) {
      return null;
    }
    if (descriptor.operationKind !== CONTROL_PLANE_SQL_OPERATION.READ) {
      return null;
    }
    return stableSerialize({
      kind: 'control-plane-query',
      tableName: descriptor.tableName || null,
      operationKind: descriptor.operationKind,
      sql: sql || null,
      params: Array.isArray(params) ? params : [],
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      allowPressureDefer: options?.allowPressureDefer === true,
      allowPressureDegrade: options?.allowPressureDegrade === true,
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    });
  }

  /**
   * @param {Object} descriptor
   * @param {Object} [options={}]
   * @return {Object|null}
   * @private
   */
  evaluateExecuteQueryPressure(descriptor, options = {}) {
    if (descriptor?.isSystemTable !== true) {
      return null;
    }
    const shouldEvaluate =
      options?.enforcePressureAdmission === true ||
      options?.allowPressureDefer === true ||
      options?.allowPressureDegrade === true ||
      typeof options?.workClass === TYPEOF.STRING;
    if (!shouldEvaluate) {
      return null;
    }
    const isWrite = descriptor.operationKind === CONTROL_PLANE_SQL_OPERATION.WRITE;
    return this.getPressureGovernor().evaluate({
      workClass:
        options?.workClass ||
        (isWrite ?
          PRESSURE_WORK_CLASS.CRITICAL :
          PRESSURE_WORK_CLASS.INTERACTIVE),
      resourceKeys: [
        `control-plane:${isWrite ? 'write' : 'read'}`,
        `control-plane:table:${descriptor.tableName || 'unknown'}`,
      ],
      allowDegrade:
        isWrite ?
          false :
          options?.allowPressureDegrade === true,
      allowDefer: options?.allowPressureDefer === true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
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
    const descriptor = this.resolveSystemTableQueryDescriptor(sql, options);
    const pressureDecision = this.evaluateExecuteQueryPressure(
      descriptor,
      options,
    );
    if (pressureDecision &&
        (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
          pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT ||
          pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE)) {
      return buildPressureAdmissionFailure(pressureDecision, {
        tableName: descriptor.tableName,
      });
    }
    const queryKey = this.buildExecuteQueryKey(
      descriptor,
      sql,
      params,
      options,
    );
    return this.runSingleFlight(
      this.inFlightQueryRequestsByKey,
      queryKey,
      () => {
        return this.sqlQueryEngine.executeQuery(
          sql,
          params,
          this.buildQueryOptions(options),
        );
      },
      {
        joinMetricName: 'querySingleFlightJoinCount',
        bypassMetricName: 'queryTrackingBypassCount',
        maxTrackedRequests: this.gatewayLimits.maxTrackedQueryRequests,
      },
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
    const strategy = normalizeReadStrategy(
      options?.strategy ||
      options?.readStrategy ||
      (
        options?.bootstrapSnapshotRows ||
        typeof options?.readBootstrapSnapshot === TYPEOF.FUNCTION ?
          CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT :
          (
            options?.cachePredicate ||
            typeof options?.readFromCache === TYPEOF.FUNCTION ?
              CONTROL_PLANE_READ_STRATEGY.CACHE :
              (
                options?.requireAuthoritative === true ?
                  CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED :
                  (
                    typeof this.cdcIntegrationService
                      ?.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION ?
                      CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE :
                      CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED
                  )
              )
          )
      ),
    );
    return this.executeRead({
      tableName,
      sql,
      params,
      strategy,
      cachePredicate: options?.cachePredicate,
      readFromCache: options?.readFromCache,
      readBootstrapSnapshot: options?.readBootstrapSnapshot,
      bootstrapSnapshotRows: options?.bootstrapSnapshotRows,
      phaseScope: normalizePhaseScope(options?.phaseScope),
    }, options);
  }

  /**
   * Canonical control-plane metadata read ingress.
   * One intent declares one strategy. The gateway executes that strategy only.
   *
   * @param {Object} readIntent
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async executeRead(readIntent = {}, options = {}) {
    const tableName = normalizeSystemTableName(readIntent?.tableName);
    const strategy = normalizeReadStrategy(readIntent?.strategy);
    const sql = readIntent?.sql || null;
    const params = Array.isArray(readIntent?.params) ? readIntent.params : [];
    const mergedOptions = {
      ...options,
      strategy,
    };
    const requestKey = this.buildReadRequestKey(
      tableName,
      sql,
      params,
      mergedOptions,
    );
    const telemetryContext = {
      startedAtMs: this.now(),
      owner: readIntent?.owner || options?.owner || null,
      tableName,
      strategy,
      workClass: mergedOptions?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      coalescingKey: normalizeCoalescingToken(mergedOptions?.coalescingKey),
    };
    try {
      const result = await this.runSingleFlight(
        this.inFlightReadRequestsByKey,
        requestKey,
        async () => {
          const pressureDecision = this.evaluateReadPressure(tableName, mergedOptions);
          if (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
              pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT ||
              pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE) {
            const failure = buildPressureAdmissionFailure(pressureDecision, {
              tableName,
            });
            return {
              ...failure,
              outcome:
                pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
                  CONTROL_PLANE_READ_OUTCOME.DEFERRED :
                  CONTROL_PLANE_READ_OUTCOME.REJECTED,
              strategyUsed: strategy,
            };
          }

          switch (strategy) {
            case CONTROL_PLANE_READ_STRATEGY.CACHE:
              return this.executeCacheRead(tableName, readIntent, mergedOptions);
            case CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE:
            case CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED:
              return this.executeAuthoritativeRead(
                tableName,
                sql,
                params,
                strategy,
                mergedOptions,
              );
            case CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED:
              return this.executeOwnerLocalRead(tableName, sql, params, mergedOptions);
            case CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT:
              return this.executeBootstrapSnapshotRead(
                tableName,
                readIntent,
                mergedOptions,
              );
            default:
              return {
                success: false,
                error: 'unsupported_control_plane_read_strategy',
                tableName,
                rows: [],
                outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
                strategyUsed: null,
              };
          }
        },
        {
          joinMetricName: 'readSingleFlightJoinCount',
          bypassMetricName: 'readTrackingBypassCount',
          maxTrackedRequests: this.gatewayLimits.maxTrackedReadRequests,
        },
      );
      this.recordReadTelemetry(telemetryContext, result);
      return result;
    } catch (error) {
      this.recordReadTelemetry(telemetryContext, {
        success: false,
        outcome: error?.outcome || CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        rowCount: NUM.ZERO,
      });
      throw error;
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async insertSystemTableRow(tableName, row, options = {}) {
    return this.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
      tableName,
      row,
    }, options);
  }

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} data
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async updateSystemTableRow(tableName, whereClause, data, options = {}) {
    return this.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName,
      whereClause,
      data,
    }, options);
  }

  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async upsertSystemTableRow(tableName, row, options = {}) {
    return this.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName,
      row,
    }, options);
  }

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async deleteSystemTableRow(tableName, whereClause, options = {}) {
    return this.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
      tableName,
      whereClause,
    }, options);
  }

  /**
   * Canonical control-plane mutation ingress for system-table writes.
   * Legacy insert/update/upsert/delete helpers delegate here so write
   * admission, routing, and backpressure policy stay on one path.
   *
   * @param {Object} mutation
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async submitMutation(mutation = {}, options = {}) {
    this.assertCdcIntegrationService();
    const operation = normalizeMutationOperation(mutation?.operation);
    const tableName = normalizeSystemTableName(mutation?.tableName);
    if (!operation) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_OPERATION_REQUIRED);
    }
    if (!tableName) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
    }
    const writeOptions = this.buildWriteOptions(options);
    const {requestKey, mergePolicy} = this.buildMutationCoalescingDescriptor(
      {
        ...mutation,
        operation,
        tableName,
      },
      writeOptions,
    );
    const telemetryContext = {
      startedAtMs: this.now(),
      owner: mutation?.owner || options?.owner || null,
      tableName,
      operation,
      workClass: writeOptions?.workClass || null,
      coalescingKey: normalizeCoalescingToken(writeOptions?.coalescingKey),
      mergePolicy,
    };
    const executionFactory = async () => {
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT) {
        if (!mutation?.row || typeof mutation.row !== TYPEOF.OBJECT) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
        }
        return this.normalizeMutationResult(await this.cdcIntegrationService.insertSystemTableRow(
          tableName,
          mutation.row,
          writeOptions,
        ));
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE) {
        if (!mutation?.whereClause ||
            typeof mutation.whereClause !== TYPEOF.OBJECT) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
        }
        if (!mutation?.data || typeof mutation.data !== TYPEOF.OBJECT) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
        }
        return this.normalizeMutationResult(await this.cdcIntegrationService.updateSystemTableRow(
          tableName,
          mutation.whereClause,
          mutation.data,
          writeOptions,
        ));
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT) {
        if (!mutation?.row || typeof mutation.row !== TYPEOF.OBJECT) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
        }
        return this.normalizeMutationResult(await this.cdcIntegrationService.upsertSystemTableRow(
          tableName,
          mutation.row,
          writeOptions,
        ));
      }
      if (!mutation?.whereClause ||
          typeof mutation.whereClause !== TYPEOF.OBJECT) {
        throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
      }
      return this.normalizeMutationResult(await this.cdcIntegrationService.deleteSystemTableRow(
        tableName,
        mutation.whereClause,
        writeOptions,
      ));
    };

    if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING &&
        requestKey) {
      const result = await this.runReplacePendingMutation(requestKey, executionFactory);
      this.recordMutationTelemetry(telemetryContext, result);
      return result;
    }

    if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT &&
        requestKey) {
      try {
        const result = await this.runSingleFlight(
          this.inFlightMutationRequestsByKey,
          requestKey,
          executionFactory,
          {
            joinMetricName: 'mutationSingleFlightJoinCount',
            maxTrackedRequests: this.gatewayLimits.maxTrackedMutationRequests,
          },
        );
        this.recordMutationTelemetry(telemetryContext, result);
        return result;
      } catch (error) {
        this.recordMutationTelemetry(telemetryContext, {
          success: false,
          outcome:
            error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        });
        throw error;
      }
    }

    try {
      const result = await executionFactory();
      this.recordMutationTelemetry(telemetryContext, result);
      return result;
    } catch (error) {
      this.recordMutationTelemetry(telemetryContext, {
        success: false,
        outcome:
          error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
      });
      throw error;
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} readIntent
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeCacheRead(tableName, readIntent, options) {
    const readFromCache = typeof readIntent?.readFromCache === TYPEOF.FUNCTION ?
      readIntent.readFromCache :
      null;
    const cachePredicate = typeof readIntent?.cachePredicate === TYPEOF.FUNCTION ?
      readIntent.cachePredicate :
      null;
    if (!this.systemTableCache && !readFromCache) {
      return {
        success: false,
        tableName,
        rows: [],
        outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        strategyUsed: CONTROL_PLANE_READ_STRATEGY.CACHE,
        error: 'system_table_cache_unavailable',
      };
    }

    let rows = [];
    if (readFromCache) {
      const cacheRows = await readFromCache(this.systemTableCache, readIntent, options);
      rows = Array.isArray(cacheRows) ? cacheRows : [];
    } else if (cachePredicate && typeof this.systemTableCache?.filter === TYPEOF.FUNCTION) {
      rows = this.systemTableCache.filter(tableName, cachePredicate) || [];
    } else if (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION) {
      rows = this.systemTableCache.getAll(tableName) || [];
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
  async executeAuthoritativeRead(tableName, sql, params, strategy, options) {
    if (typeof this.cdcIntegrationService?.executeAuthoritativeSystemTableRead !==
      TYPEOF.FUNCTION) {
      return {
        success: false,
        tableName,
        rows: [],
        outcome:
          strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED ?
            CONTROL_PLANE_READ_OUTCOME.STALE_NOT_ALLOWED :
            CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        strategyUsed: strategy,
        error: 'authoritative_read_owner_unavailable',
      };
    }

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
          allowSqlFallback: false,
          queryOptions: this.buildQueryOptions(options),
        },
      );

    return {
      ...authoritativeResult,
      tableName,
      rows: Array.isArray(authoritativeResult?.rows) ?
        authoritativeResult.rows :
        [],
      outcome:
        authoritativeResult?.success === true ?
          CONTROL_PLANE_READ_OUTCOME.AUTHORITATIVE :
          (
            strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED ?
              CONTROL_PLANE_READ_OUTCOME.STALE_NOT_ALLOWED :
              CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY
          ),
      strategyUsed: strategy,
    };
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
    if (typeof this.sqlQueryEngine?.executeQuery !== TYPEOF.FUNCTION) {
      return {
        success: false,
        tableName,
        rows: [],
        outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        strategyUsed: CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
        error: 'sql_query_engine_unavailable',
      };
    }
    const result = await this.sqlQueryEngine.executeQuery(
      sql,
      params,
      this.buildQueryOptions(options),
    );
    return {
      ...result,
      tableName,
      rows: Array.isArray(result?.rows) ? result.rows : [],
      outcome:
        result?.success === false ?
          CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY :
          CONTROL_PLANE_READ_OUTCOME.OWNER_LOCAL_NON_PROPAGATED,
      strategyUsed: CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
    };
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
      return {
        success: false,
        tableName,
        rows: [],
        outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        strategyUsed: CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
        error: 'bootstrap_snapshot_phase_scope_required',
      };
    }
    if (typeof readIntent?.readBootstrapSnapshot === TYPEOF.FUNCTION) {
      const rows = await readIntent.readBootstrapSnapshot(readIntent, options);
      return {
        success: true,
        tableName,
        rows: Array.isArray(rows) ? rows : [],
        rowCount: Array.isArray(rows) ? rows.length : NUM.ZERO,
        outcome: CONTROL_PLANE_READ_OUTCOME.BOOTSTRAP_SNAPSHOT,
        strategyUsed: CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
      };
    }
    if (!Array.isArray(readIntent?.bootstrapSnapshotRows)) {
      return {
        success: false,
        tableName,
        rows: [],
        outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        strategyUsed: CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
        error: 'bootstrap_snapshot_unavailable',
      };
    }
    return {
      success: true,
      tableName,
      rows: readIntent.bootstrapSnapshotRows,
      rowCount: readIntent.bootstrapSnapshotRows.length,
      outcome: CONTROL_PLANE_READ_OUTCOME.BOOTSTRAP_SNAPSHOT,
      strategyUsed: CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
    };
  }

  /**
   * @param {Object} result
   * @return {Object}
   * @private
   */
  normalizeMutationResult(result) {
    if (result?.outcome) {
      return result;
    }
    if (result?.success === false) {
      return {
        ...result,
        outcome:
          result?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER ?
            CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED :
            (
              result?.pressureAction === PRESSURE_GOVERNOR_ACTION.REJECT ?
                CONTROL_PLANE_MUTATION_OUTCOME.REJECTED :
                CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY
            ),
      };
    }
    const affectedRows = Number(
      result?.partitionResult?.affectedRows ?? result?.affectedRows,
    );
    if (Number.isFinite(affectedRows) && affectedRows <= NUM.ZERO) {
      return {
        ...result,
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
      };
    }
    return {
      ...result,
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    };
  }
}

export {
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
  ControlPlaneSystemTableGateway,
};
