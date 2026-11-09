import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  applyAuthoritativeSystemTableRowsToCache,
  evictAuthoritativeAbsentSystemTableRowsFromCache,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  getSystemCachePrimaryKeyField,
  resolveSystemCacheRowKey,
} from '../cache/system-cache-key-descriptor.js';
import {
  areAuthoritativeSystemTableCacheRowsEqual,
} from '../cache/system-table-cache-authoritative-reconciliation.js';

const {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  TABLES,
  getRemainingBudgetMs,
} = SQL_QUERY_ENGINE_SHARED;

// ends-on: authoritative table and partition routing metadata query answers
const DEFAULT_METADATA_LOOKUP_TIMEOUT_MS = 2500;
const LOOKUP_TABLE_SQL = 'SELECT * FROM tables WHERE table_name = ?';
const LOOKUP_PARTITIONS_SQL = 'SELECT * FROM partitions WHERE table_name = ?';
const LOOKUP_SERVICES_SQL =
  'SELECT * FROM services WHERE service_type = \'partition\'';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_NUMBER = 'number';
const TIMEOUT_MESSAGE_REGEX = /\b(?:timed?\s*out|timeout|deadline)\b/iu;
const CANCELLED_MESSAGE_REGEX = /\b(?:cancel(?:led|ed)?|aborted)\b/iu;

const METADATA_AUTHORITY_REFRESH_OUTCOME = Object.freeze({
  FOUND: 'FOUND',
  ABSENT: 'ABSENT',
  UNAVAILABLE: 'UNAVAILABLE',
});

const METADATA_AUTHORITY_UNAVAILABLE_REASON = Object.freeze({
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled',
  AUTHORITY_READ_FAILED: 'authority_read_failed',
});

const METADATA_AUTHORITY_ERROR_CODE = Object.freeze({
  ROUTING_METADATA_UNAVAILABLE: 'ROUTING_METADATA_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
});

const SELF_ROUTED_AUTHORITY_TABLES = new Set([
  TABLES.TABLES,
  TABLES.PARTITIONS,
  TABLES.SERVICES,
]);

function isCancellationRequested(cancellationToken) {
  if (!cancellationToken || typeof cancellationToken !== LOCAL_STR_OBJECT) {
    return false;
  }
  if (typeof cancellationToken.isCancelled === LOCAL_STR_FUNCTION) {
    return cancellationToken.isCancelled() === true;
  }
  if (typeof cancellationToken.isCancellationRequested === LOCAL_STR_FUNCTION) {
    return cancellationToken.isCancellationRequested() === true;
  }
  return cancellationToken.cancelled === true ||
    cancellationToken.aborted === true;
}

function readTimeoutBudgetRemainingMs(timeoutBudget, nowFn) {
  if (!timeoutBudget || typeof timeoutBudget !== LOCAL_STR_OBJECT) {
    return null;
  }
  const remaining = getRemainingBudgetMs(timeoutBudget, {now: nowFn});
  return Number.isFinite(remaining) ?
    Math.max(0, Math.floor(remaining)) :
    null;
}

function readDeadlineRemainingMs(queryOptions, nowFn) {
  const deadline = queryOptions?.deadlineAtMs ?? queryOptions?.deadlineMs;
  if (typeof deadline !== LOCAL_STR_NUMBER || !Number.isFinite(deadline)) {
    return null;
  }
  return Math.max(0, Math.floor(deadline - nowFn()));
}

function readExplicitTimeoutMs(queryOptions) {
  const timeout = queryOptions?.timeoutMs ?? queryOptions?.queryTimeoutMs;
  if (typeof timeout !== LOCAL_STR_NUMBER || !Number.isFinite(timeout)) {
    return null;
  }
  return Math.max(0, Math.floor(timeout));
}

function resolveRemainingLookupBudgetMs(engine, queryOptions = {}) {
  const nowFn =
    typeof engine?.nowFn === LOCAL_STR_FUNCTION ? engine.nowFn : Date.now;
  const candidates = [
    readTimeoutBudgetRemainingMs(queryOptions?.timeoutBudget, nowFn),
    readDeadlineRemainingMs(queryOptions, nowFn),
    readExplicitTimeoutMs(queryOptions),
  ].filter((value) => value !== null);
  return candidates.length > 0 ?
    Math.min(...candidates) :
    DEFAULT_METADATA_LOOKUP_TIMEOUT_MS;
}

function buildTableNotFoundFailureResult(tableName) {
  return {
    success: false,
    error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
    errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
  };
}

function buildUnavailableFailureResult(tableName, reason, detailError = '') {
  let errorCode = METADATA_AUTHORITY_ERROR_CODE.ROUTING_METADATA_UNAVAILABLE;
  let fallbackMessage =
    `Authoritative routing metadata unavailable for table: ${tableName}`;
  if (reason === METADATA_AUTHORITY_UNAVAILABLE_REASON.CANCELLED) {
    errorCode = METADATA_AUTHORITY_ERROR_CODE.CANCELLED;
    fallbackMessage =
      `Query cancelled while refreshing routing metadata for table: ${tableName}`;
  } else if (reason === METADATA_AUTHORITY_UNAVAILABLE_REASON.TIMEOUT) {
    errorCode = METADATA_AUTHORITY_ERROR_CODE.TIMEOUT;
    fallbackMessage =
      `Timed out refreshing routing metadata from authority for table: ${tableName}`;
  }
  const error =
    typeof detailError === LOCAL_STR_STRING && detailError.length > 0 ?
      detailError :
      fallbackMessage;
  return {
    success: false,
    tableName,
    outcome: METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
    reason,
    error,
    errorCode,
  };
}

function buildFoundRefreshResult(applied) {
  return {
    outcome: METADATA_AUTHORITY_REFRESH_OUTCOME.FOUND,
    applied: Boolean(applied),
  };
}

function buildAbsentRefreshResult(tableName) {
  const errorResponse = buildTableNotFoundFailureResult(tableName);
  return {
    outcome: METADATA_AUTHORITY_REFRESH_OUTCOME.ABSENT,
    applied: false,
    errorResponse,
    failure: errorResponse,
  };
}

function buildUnavailableRefreshResult(tableName, reason, detailMessage = '') {
  const errorResponse = buildUnavailableFailureResult(
    tableName,
    reason,
    detailMessage,
  );
  return {
    outcome: METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
    applied: false,
    reason,
    error: errorResponse.error,
    errorCode: errorResponse.errorCode,
    errorResponse,
    failure: errorResponse,
  };
}

function classifyFailureReason(errorMessage, errorCode = '') {
  const normalizedCode = String(errorCode || '').toUpperCase();
  const normalizedMessage = String(errorMessage || '');
  if (
    normalizedCode === METADATA_AUTHORITY_ERROR_CODE.CANCELLED ||
    CANCELLED_MESSAGE_REGEX.test(normalizedMessage)
  ) {
    return METADATA_AUTHORITY_UNAVAILABLE_REASON.CANCELLED;
  }
  if (
    normalizedCode === METADATA_AUTHORITY_ERROR_CODE.TIMEOUT ||
    TIMEOUT_MESSAGE_REGEX.test(normalizedMessage)
  ) {
    return METADATA_AUTHORITY_UNAVAILABLE_REASON.TIMEOUT;
  }
  return METADATA_AUTHORITY_UNAVAILABLE_REASON.AUTHORITY_READ_FAILED;
}

function hasDirectControlPlaneAuthority(engine, gateway) {
  const cdcService =
    typeof gateway.resolveCdcIntegrationService === LOCAL_STR_FUNCTION ?
      gateway.resolveCdcIntegrationService() :
      engine?.cdcIntegrationService;
  if (
    typeof cdcService?.executeAuthoritativeSystemTableRead ===
    LOCAL_STR_FUNCTION
  ) {
    return true;
  }
  return Boolean(engine?.getAuthoritativeControlPlaneView?.());
}

function hasRoutableSystemCatalogPartitions(engine, tableName) {
  if (SELF_ROUTED_AUTHORITY_TABLES.has(tableName)) {
    return false;
  }
  return [TABLES.TABLES, TABLES.PARTITIONS, TABLES.SERVICES].every(
    (catalogTable) =>
      (engine?.getTablePartitions?.(catalogTable)?.length || 0) > 0,
  );
}

function isGatewayConfigured(gateway) {
  return Boolean(
    gateway && typeof gateway.readAuthoritativeRows === LOCAL_STR_FUNCTION,
  );
}

function canReadGatewayForTableMetadata(engine, gateway, tableName) {
  if (!isGatewayConfigured(gateway)) {
    return false;
  }
  const boundEngine =
    typeof gateway.resolveSqlQueryEngine === LOCAL_STR_FUNCTION ?
      gateway.resolveSqlQueryEngine() :
      null;
  if (boundEngine !== engine) {
    return true;
  }
  return hasDirectControlPlaneAuthority(engine, gateway) ||
    hasRoutableSystemCatalogPartitions(engine, tableName);
}

function createRaceCleanupGuard(budgetMs, cancellationToken) {
  let timer = null;
  let unsubscribeCancel = null;
  const raceEntries = [];
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve({
        outcome: METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
        reason: METADATA_AUTHORITY_UNAVAILABLE_REASON.TIMEOUT,
        errorMessage: '',
      });
    }, budgetMs);
  });
  raceEntries.push(timeoutPromise);
  if (typeof cancellationToken?.onCancel === LOCAL_STR_FUNCTION) {
    const cancelPromise = new Promise((resolve) => {
      const cancelHandler = (reason) => {
        resolve({
          outcome: METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
          reason: METADATA_AUTHORITY_UNAVAILABLE_REASON.CANCELLED,
          errorMessage: typeof reason === LOCAL_STR_STRING ? reason : '',
        });
      };
      const off = cancellationToken.onCancel(cancelHandler);
      unsubscribeCancel =
        typeof off === LOCAL_STR_FUNCTION ?
          off :
          () => cancellationToken.offCancel?.(cancelHandler);
    });
    raceEntries.push(cancelPromise);
  }
  const cleanup = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (typeof unsubscribeCancel === LOCAL_STR_FUNCTION) {
      unsubscribeCancel();
      unsubscribeCancel = null;
    }
  };
  return {raceEntries, cleanup};
}

function isFailedGatewayReadResult(result) {
  return !result || result.success === false || !Array.isArray(result.rows);
}

function buildFailedBatchOutcome(result) {
  const errorText = String(result?.error || '');
  return {
    outcome: METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
    reason: classifyFailureReason(errorText, result?.errorCode),
    errorMessage: errorText,
  };
}

function evaluateAuthoritativeReadBatch(results) {
  const failedResult = results.find((result) =>
    isFailedGatewayReadResult(result),
  );
  return failedResult ?
    buildFailedBatchOutcome(failedResult) :
    {
      outcome: METADATA_AUTHORITY_REFRESH_OUTCOME.FOUND,
      results,
    };
}

function resolvePreflightFetchState(engine, queryOptions) {
  const cancellationToken = queryOptions?.cancellationToken || null;
  if (isCancellationRequested(cancellationToken)) {
    return {
      earlyOutcome: {
        outcome: METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
        reason: METADATA_AUTHORITY_UNAVAILABLE_REASON.CANCELLED,
        errorMessage: String(cancellationToken?.getReason?.() || ''),
      },
    };
  }
  const budgetMs = resolveRemainingLookupBudgetMs(engine, queryOptions);
  return budgetMs <= 0 ?
    {
      earlyOutcome: {
        outcome: METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
        reason: METADATA_AUTHORITY_UNAVAILABLE_REASON.TIMEOUT,
        errorMessage: '',
      },
    } :
    {budgetMs, cancellationToken};
}

function buildCaughtFetchOutcome(error, cancellationToken) {
  const message = String(error?.message || error || '');
  return {
    outcome: METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
    reason: isCancellationRequested(cancellationToken) ?
      METADATA_AUTHORITY_UNAVAILABLE_REASON.CANCELLED :
      classifyFailureReason(message, error?.code || error?.errorCode),
    errorMessage: message,
  };
}

function startAuthoritativeCatalogReads(gateway, targetName, readOptions) {
  const fetchPromise = Promise.all([
    gateway.readAuthoritativeRows(
      TABLES.TABLES,
      LOOKUP_TABLE_SQL,
      [targetName],
      readOptions,
    ),
    gateway.readAuthoritativeRows(
      TABLES.PARTITIONS,
      LOOKUP_PARTITIONS_SQL,
      [targetName],
      readOptions,
    ),
    gateway.readAuthoritativeRows(
      TABLES.SERVICES,
      LOOKUP_SERVICES_SQL,
      [],
      readOptions,
    ),
  ]).then((results) => evaluateAuthoritativeReadBatch(results));
  fetchPromise.catch(() => {});
  return fetchPromise;
}

async function fetchAuthoritativeTableRows(
  engine,
  gateway,
  targetName,
  queryOptions = {},
) {
  const preflight = resolvePreflightFetchState(engine, queryOptions);
  if (preflight.earlyOutcome) {
    return preflight.earlyOutcome;
  }
  const {budgetMs, cancellationToken} = preflight;
  const readOptions = {
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC,
    timeoutMs: budgetMs,
    ...(cancellationToken ? {cancellationToken} : {}),
  };
  const {raceEntries, cleanup} = createRaceCleanupGuard(
    budgetMs,
    cancellationToken,
  );
  try {
    const fetchPromise = startAuthoritativeCatalogReads(
      gateway,
      targetName,
      readOptions,
    );
    return await Promise.race([fetchPromise, ...raceEntries]);
  } catch (error) {
    return buildCaughtFetchOutcome(error, cancellationToken);
  } finally {
    cleanup();
  }
}

function findCachedRowByField(store, tableName, keyField, key) {
  if (key === undefined || key === null) {
    return null;
  }
  if (typeof store.find === LOCAL_STR_FUNCTION) {
    return store.find(
      tableName,
      (candidate) => candidate?.[keyField] === key,
    ) || null;
  }
  if (typeof store.getAll === LOCAL_STR_FUNCTION) {
    const rows = store.getAll(tableName) || [];
    return rows.find((candidate) => candidate?.[keyField] === key) || null;
  }
  return null;
}

function findExistingCachedRow(store, tableName, row) {
  if (!store || !row || typeof row !== LOCAL_STR_OBJECT) {
    return null;
  }
  const key = resolveSystemCacheRowKey(tableName, row);
  if (
    typeof key === LOCAL_STR_STRING &&
    key.length > 0 &&
    typeof store.get === LOCAL_STR_FUNCTION
  ) {
    const direct = store.get(tableName, key);
    if (direct) {
      return direct;
    }
  }
  const keyField = getSystemCachePrimaryKeyField(tableName);
  return findCachedRowByField(store, tableName, keyField, key);
}

function filterChangedRows(store, tableName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  return rows.filter((row) => {
    if (!row || typeof row !== LOCAL_STR_OBJECT) {
      return false;
    }
    const existingRow = findExistingCachedRow(store, tableName, row);
    if (!existingRow) {
      return true;
    }
    return !areAuthoritativeSystemTableCacheRowsEqual(
      tableName,
      existingRow,
      row,
    );
  });
}

function applyTableResultToStore(store, gateway, tableName, result) {
  const changedRows = filterChangedRows(store, tableName, result?.rows);
  if (changedRows.length === 0) return false;
  return applyAuthoritativeSystemTableRowsToCache(gateway, store, tableName, changedRows);
}

function evictStoreRow(store, gateway, systemTable, row) {
  if (!store || !row || typeof row !== LOCAL_STR_OBJECT) return;
  evictAuthoritativeAbsentSystemTableRowsFromCache(gateway, store, systemTable, [row]);
}

function evictMatchingStoreRows(store, gateway, systemTable, predicate) {
  const rows = typeof store?.getAll === LOCAL_STR_FUNCTION ? store.getAll(systemTable) || [] : [];
  for (const row of rows) {
    if (predicate(row)) evictStoreRow(store, gateway, systemTable, row);
  }
}

function evictAbsentCatalogRows(store, gateway, tableName, results) {
  if (!Array.isArray(results) || !store) return;
  if (!hasAnyRowInResult(results[0])) {
    evictMatchingStoreRows(store, gateway, TABLES.TABLES,
      (row) => row?.table_name === tableName || row?.table_id === tableName);
    evictMatchingStoreRows(
      store, gateway, TABLES.PARTITIONS, (row) => row?.table_name === tableName);
  } else if (!hasAnyRowInResult(results[1])) {
    evictMatchingStoreRows(
      store, gateway, TABLES.PARTITIONS, (row) => row?.table_name === tableName);
  }
}

function applyAuthoritativeRowsToStore(store, gateway, results, tableName = null) {
  if (!Array.isArray(results)) return false;
  evictAbsentCatalogRows(store, gateway, tableName, results);
  const [tableResult, partitionResult, serviceResult] = results;
  const tableApplied = applyTableResultToStore(store, gateway, TABLES.TABLES, tableResult);
  const partitionApplied =
    applyTableResultToStore(store, gateway, TABLES.PARTITIONS, partitionResult);
  const serviceApplied = applyTableResultToStore(store, gateway, TABLES.SERVICES, serviceResult);
  return tableApplied || partitionApplied || serviceApplied;
}

function hasAnyRowInResult(result) {
  return Array.isArray(result?.rows) && result.rows.length > 0;
}

function resolveMetadataPresence(engine, tableName, results = null) {
  if (Array.isArray(results)) {
    return {
      hasTableMetadata: hasAnyRowInResult(results[0]),
      hasPartitions: hasAnyRowInResult(results[1]),
    };
  }
  const hasTableMetadata = Boolean(engine?.getTableInfo?.(tableName));
  const hasPartitions = (engine?.getTablePartitions?.(tableName)?.length || 0) > 0;
  return {hasTableMetadata, hasPartitions};
}

function classifyMetadataPresenceOutcome(tableName, presence, applied) {
  if (!presence.hasTableMetadata) return buildAbsentRefreshResult(tableName);
  if (!presence.hasPartitions) {
    return buildUnavailableRefreshResult(
      tableName, METADATA_AUTHORITY_UNAVAILABLE_REASON.AUTHORITY_READ_FAILED);
  }
  return buildFoundRefreshResult(applied);
}

function resolveStoreAndGateway(engine) {
  const gateway = engine?.getControlPlaneSystemTableGateway?.() ||
    engine?.controlPlaneSystemTableGateway || null;
  const store = engine?.cdcIntegrationService?.cacheMutationTarget ||
    engine?.systemCache || null;
  return {gateway, store};
}

function settleUnreadableGatewayOutcome(engine, gateway, tableName) {
  const presence = resolveMetadataPresence(engine, tableName);
  if (presence.hasTableMetadata && presence.hasPartitions) return buildFoundRefreshResult(false);
  if (isGatewayConfigured(gateway) || presence.hasTableMetadata) {
    return buildUnavailableRefreshResult(
      tableName, METADATA_AUTHORITY_UNAVAILABLE_REASON.AUTHORITY_READ_FAILED);
  }
  return buildAbsentRefreshResult(tableName);
}

function settleFetchedMetadataOutcome(engine, store, gateway, context) {
  const {tableName, fetchOutcome} = context;
  if (fetchOutcome.outcome === METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE) {
    return buildUnavailableRefreshResult(tableName, fetchOutcome.reason, fetchOutcome.errorMessage);
  }
  const applied = fetchOutcome.outcome === METADATA_AUTHORITY_REFRESH_OUTCOME.FOUND ?
    applyAuthoritativeRowsToStore(store, gateway, fetchOutcome.results, tableName) : false;
  const presence = resolveMetadataPresence(engine, tableName, fetchOutcome.results);
  return classifyMetadataPresenceOutcome(tableName, presence, applied);
}

async function refreshTableRoutingMetadataFromAuthority(
  engine,
  tableName,
  lookupOptions = {},
) {
  if (typeof tableName !== LOCAL_STR_STRING || tableName.length === 0) {
    return buildAbsentRefreshResult(String(tableName || ''));
  }
  const {gateway, store} = resolveStoreAndGateway(engine);
  if (!store || !canReadGatewayForTableMetadata(engine, gateway, tableName)) {
    return settleUnreadableGatewayOutcome(engine, gateway, tableName);
  }
  const fetchOutcome = await fetchAuthoritativeTableRows(
    engine,
    gateway,
    tableName,
    lookupOptions,
  );
  return settleFetchedMetadataOutcome(engine, store, gateway, {
    tableName,
    fetchOutcome,
  });
}

function hasRoutableTablePlan(tablePlan) {
  return Boolean(
    tablePlan &&
    Array.isArray(tablePlan.partitions) &&
    tablePlan.partitions.length > 0,
  );
}

function collectColdSelectTables(engine, ast, distributedPlan) {
  const coldTables = [];
  const seen = new Set();
  const addIfCold = (tableName, alias) => {
    if (
      typeof tableName !== LOCAL_STR_STRING ||
      tableName.length === 0 ||
      seen.has(tableName)
    ) {
      return;
    }
    const plan =
      distributedPlan.tablePlans.get(alias || tableName) ||
      distributedPlan.tablePlans.get(tableName) ||
      null;
    if (!engine.getTableInfo(tableName) || !hasRoutableTablePlan(plan)) {
      seen.add(tableName);
      coldTables.push(tableName);
    }
  };
  addIfCold(ast.from.name, ast.from.alias || ast.from.name);
  for (const join of ast.joins || []) {
    const joinTableName = join.table?.name;
    if (joinTableName) {
      addIfCold(joinTableName, join.table.alias || joinTableName);
    }
  }
  return coldTables;
}

async function refreshColdSelectTables(engine, coldTables, queryOptions) {
  for (const coldTableName of coldTables) {
    const refreshResult =
      await engine.refreshTableRoutingMetadataFromAuthority(
        coldTableName,
        queryOptions,
      );
    if (
      refreshResult.outcome !== METADATA_AUTHORITY_REFRESH_OUTCOME.FOUND
    ) {
      return refreshResult.failure;
    }
  }
  return null;
}

function validatePlannedSelectRootAndJoins(engine, ast, distributedPlan) {
  const tableName = ast.from.name;
  const rootAlias = ast.from.alias || tableName;
  const rootPlan =
    distributedPlan.tablePlans.get(rootAlias) ||
    distributedPlan.tablePlans.get(tableName) ||
    null;
  const tableInfo = engine.getTableInfo(tableName);
  if (!tableInfo) {
    return {errorResponse: buildTableNotFoundFailureResult(tableName)};
  }
  if (!hasRoutableTablePlan(rootPlan)) {
    return {
      errorResponse: buildUnavailableFailureResult(
        tableName,
        METADATA_AUTHORITY_UNAVAILABLE_REASON.AUTHORITY_READ_FAILED,
      ),
    };
  }
  const joinErrorResponse = engine.validateSelectJoinPlans(
    ast,
    distributedPlan,
  );
  return joinErrorResponse ?
    {errorResponse: joinErrorResponse} :
    {rootPlan};
}

async function resolveSelectExecutionPlanWithAuthorityRefresh(
  engine,
  ast,
  params,
  context = {},
) {
  const {sessionId, queryOptions = {}} = context;
  const tableName = ast.from.name;
  const planningStartTimeMs = Date.now();
  let distributedPlan = engine.distributedQueryPlanner.planSelect(
    ast,
    params,
    {sessionId},
  );
  const coldTables = collectColdSelectTables(engine, ast, distributedPlan);
  if (coldTables.length > 0) {
    const refreshFailure = await refreshColdSelectTables(
      engine,
      coldTables,
      queryOptions,
    );
    if (refreshFailure) {
      return {settled: true, response: refreshFailure};
    }
    distributedPlan = engine.distributedQueryPlanner.planSelect(
      ast,
      params,
      {sessionId},
    );
  }
  const planningDurationMs = Date.now() - planningStartTimeMs;
  const validation = validatePlannedSelectRootAndJoins(
    engine,
    ast,
    distributedPlan,
  );
  if (validation.errorResponse) {
    return {settled: true, response: validation.errorResponse};
  }
  const tableInfo = engine.getTableInfo(tableName);
  const dualWriteMode = engine.isDualWriteModeActiveForTable(tableInfo);
  return {
    settled: false,
    distributedPlan,
    rootPlan: validation.rootPlan,
    tableInfo,
    dualWriteMode,
    planningDurationMs,
  };
}

function isWriteTableMetadataCold(tableInfo, tablePlan) {
  return !tableInfo || !hasRoutableTablePlan(tablePlan);
}

async function resolveWriteExecutionPlanWithAuthorityRefresh(
  engine, ast, params, context = {},
) {
  const {sessionId, queryOptions = {}, planStatement} = context;
  const tableName = ast.table;
  const planningStartTimeMs = Date.now();
  let distributedPlan = planStatement(
    engine.distributedQueryPlanner, ast, params, {sessionId});
  let tableInfo = engine.getTableInfo(tableName);
  let tablePlan = distributedPlan.tablePlans.get(tableName) || null;
  if (isWriteTableMetadataCold(tableInfo, tablePlan)) {
    const refreshResult = await engine.refreshTableRoutingMetadataFromAuthority(
      tableName, queryOptions);
    if (refreshResult.outcome !== METADATA_AUTHORITY_REFRESH_OUTCOME.FOUND) {
      return {settled: true, response: refreshResult.failure};
    }
    distributedPlan = planStatement(
      engine.distributedQueryPlanner, ast, params, {sessionId});
    tableInfo = engine.getTableInfo(tableName);
    tablePlan = distributedPlan.tablePlans.get(tableName) || null;
  }
  const planningDurationMs = Date.now() - planningStartTimeMs;
  if (isWriteTableMetadataCold(tableInfo, tablePlan)) {
    const response = tableInfo ?
      buildUnavailableFailureResult(
        tableName, METADATA_AUTHORITY_UNAVAILABLE_REASON.AUTHORITY_READ_FAILED) :
      buildTableNotFoundFailureResult(tableName);
    return {settled: true, response};
  }
  const dualWriteMigration = engine.getActiveDualWriteMigration(tableInfo);
  return {
    settled: false, distributedPlan, tablePlan, tableInfo,
    dualWriteMigration, planningDurationMs,
  };
}

export {
  METADATA_AUTHORITY_ERROR_CODE,
  METADATA_AUTHORITY_REFRESH_OUTCOME,
  METADATA_AUTHORITY_UNAVAILABLE_REASON,
  refreshTableRoutingMetadataFromAuthority,
  resolveSelectExecutionPlanWithAuthorityRefresh,
  resolveWriteExecutionPlanWithAuthorityRefresh,
};
