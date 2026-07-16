import {
  CDC_OPERATION,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
  CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  areCanonicalSystemTableRowsEqual,
  buildControlPlaneCacheReconcileContract,
  canonicalizeSystemTableRow,
  getSystemCachePrimaryKeyFieldOrFallback,
  hasUsablePrimaryKeyValue,
} from './control-plane-system-table-gateway-shared.js';
import {
  isStaleForExistingRecord,
} from '../cache/system-table-cache-row-merge.js';

// The cache's own causal order (HLC / updated_at / nodes heartbeat watermark)
// is the authority on row supersession. A cached row that this order proves
// newer than the authoritative read explains its own divergence: the read was
// complete at read time and the cache has since advanced through CDC. Only
// unexplained divergence (a dropped write, a genuinely stale cache) may block
// complete-table observation publication.
function cachedRowSupersedesAuthoritativeRow(
  tableName,
  cachedRow,
  authoritativeRow,
) {
  return Boolean(cachedRow) &&
    isStaleForExistingRecord(tableName, cachedRow, authoritativeRow);
}

function buildAuthoritativeObservationFailure(
  tableName,
  reconcileIntent,
  mutationCount,
  error,
) {
  return {
    success: false,
    tableName,
    reconcileIntent,
    mutationCount,
    authoritativeObservedAtMs: null,
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
    error,
  };
}

function buildCacheUnavailableFailure(tableName) {
  return {
    success: false,
    tableName,
    mutationCount: 0,
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
    error:
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SYSTEM_TABLE_CACHE_UNAVAILABLE,
  };
}

function resolveCacheTargets(gateway, options) {
  const defaultCache = gateway.resolveSystemTableCache();
  return {
    writableCache: options?.cacheMutationTarget || defaultCache,
    readableCache:
      options?.systemTableCache || defaultCache ||
      options?.cacheMutationTarget,
  };
}

function hasUsableCacheTargets(writableCache, readableCache) {
  return Boolean(
    writableCache &&
    typeof writableCache.applySystemTableChange === 'function' &&
    readableCache,
  );
}

function resolveCachedEntries(readableCache, tableName, options) {
  if (Array.isArray(options?.cachedRows)) {
    return options.cachedRows;
  }
  if (
    typeof options?.cachedRowFilter === 'function' &&
    typeof readableCache.filter === 'function'
  ) {
    return readableCache.filter(tableName, options.cachedRowFilter) || [];
  }
  if (typeof readableCache.getAll === 'function') {
    return readableCache.getAll(tableName) || [];
  }
  return [];
}

function hasValidObservationTime(receipt) {
  const observedAtMs = Number(receipt?.observedAtMs);
  return Number.isFinite(observedAtMs) && observedAtMs >= 0;
}

function hasValidObservationCause(receipt) {
  return typeof receipt?.causeId === 'string' && receipt.causeId.length > 0;
}

function hasCompleteObservationReceipt(receipt, tableName) {
  return Boolean(
    receipt?.scope ===
      CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE &&
    receipt?.tableName === tableName &&
    receipt?.rowSetComplete === true &&
    hasValidObservationTime(receipt) &&
    hasValidObservationCause(receipt),
  );
}

function hasCompleteObservationInputs(
  authoritativeRows,
  options,
  readableCache,
) {
  return Boolean(
    Array.isArray(authoritativeRows) &&
    Array.isArray(options?.cachedRows) &&
    typeof options?.cachedRowFilter !== 'function' &&
    typeof readableCache.getAll === 'function',
  );
}

function hasAuthoritativeObservationStorage(writableCache, readableCache) {
  return Boolean(
    typeof writableCache.recordAuthoritativeObservation === 'function' &&
    typeof readableCache.getLastAuthoritativeObservedAtMs === 'function' &&
    typeof readableCache.getLastAuthoritativeObservedCauseId === 'function',
  );
}

function validateObservationRequest(options) {
  if (!options.observationRequested) {
    return null;
  }
  const contractValid =
    options.receiptMinted === true &&
    hasCompleteObservationReceipt(options.receipt, options.tableName) &&
    hasCompleteObservationInputs(
      options.authoritativeRows,
      options.reconcileOptions,
      options.readableCache,
    );
  if (!contractValid) {
    return CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.CONTRACT_INVALID;
  }
  if (!hasAuthoritativeObservationStorage(
    options.writableCache,
    options.readableCache,
  )) {
    return CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.STORAGE_UNAVAILABLE;
  }
  return null;
}

function buildCachedRowIndex(rows, primaryKeyField) {
  const rowsByKey = new Map();
  let invalidKeyCount = 0;
  for (const row of rows) {
    const key = row?.[primaryKeyField] ?? row?.id;
    if (!hasUsablePrimaryKeyValue(key)) {
      invalidKeyCount += 1;
      continue;
    }
    rowsByKey.set(String(key), row);
  }
  return {rowsByKey, invalidKeyCount};
}

function buildAuthoritativeRowIndex(tableName, rows, primaryKeyField) {
  const rowsByKey = new Map();
  const keys = new Set();
  let invalidKeyCount = 0;
  let duplicateKeyCount = 0;
  for (const row of rows) {
    const canonicalRow = canonicalizeSystemTableRow(tableName, row);
    const key = canonicalRow?.[primaryKeyField] ?? canonicalRow?.id;
    if (!hasUsablePrimaryKeyValue(key)) {
      invalidKeyCount += 1;
      continue;
    }
    const normalizedKey = String(key);
    if (keys.has(normalizedKey)) {
      duplicateKeyCount += 1;
    }
    keys.add(normalizedKey);
    rowsByKey.set(normalizedKey, canonicalRow);
  }
  return {rowsByKey, keys, invalidKeyCount, duplicateKeyCount};
}

function countUnreconciledCachedKeys(
  cachedRowsByKey,
  authoritativeKeys,
  deleteMissingPolicy,
) {
  if (
    deleteMissingPolicy ===
    CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY.DELETE_MISSING
  ) {
    return 0;
  }
  return [...cachedRowsByKey.keys()].filter(
    (key) => !authoritativeKeys.has(key),
  ).length;
}

function canPublishCompleteObservation(indexState) {
  const invalidKeyCount =
    indexState.invalidAuthoritativeKeyCount +
    indexState.invalidCachedKeyCount +
    indexState.duplicateAuthoritativeKeyCount;
  return invalidKeyCount === 0 &&
    indexState.unreconciledCachedKeyCount === 0;
}

function applyAuthoritativeUpserts(options) {
  let mutationCount = 0;
  for (const [normalizedKey, canonicalRow] of
    options.authoritativeRowsByKey) {
    const cachedRow = options.cachedRowsByKey.get(normalizedKey) || null;
    if (options.rowComparator(cachedRow, canonicalRow)) {
      continue;
    }
    if (cachedRowSupersedesAuthoritativeRow(
      options.tableName,
      cachedRow,
      canonicalRow,
    )) {
      continue;
    }
    options.writableCache.applySystemTableChange(
      options.tableName,
      CDC_OPERATION.UPSERT,
      canonicalRow,
      options.causeOptions,
    );
    mutationCount += 1;
  }
  return mutationCount;
}

function applyMissingRowDeletes(options) {
  if (
    options.deleteMissingPolicy !==
    CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY.DELETE_MISSING
  ) {
    return 0;
  }
  let mutationCount = 0;
  for (const cachedRow of options.cachedEntries) {
    const key = cachedRow?.[options.primaryKeyField] ?? cachedRow?.id;
    if (
      !hasUsablePrimaryKeyValue(key) ||
      options.authoritativeKeys.has(String(key))
    ) {
      continue;
    }
    options.writableCache.applySystemTableChange(
      options.tableName,
      CDC_OPERATION.DELETE,
      cachedRow,
      options.causeOptions,
    );
    mutationCount += 1;
  }
  return mutationCount;
}

function cacheExactlyMatchesAuthoritativeRows(options) {
  const reconciledEntries = options.readableCache.getAll(options.tableName) ||
    [];
  const reconciledIndex = buildCachedRowIndex(
    reconciledEntries,
    options.primaryKeyField,
  );
  if (
    reconciledIndex.invalidKeyCount > 0 ||
    reconciledIndex.rowsByKey.size !== options.authoritativeRowsByKey.size
  ) {
    return false;
  }
  return [...options.authoritativeRowsByKey].every(([key, row]) => {
    const reconciledRow = reconciledIndex.rowsByKey.get(key) || null;
    return options.rowComparator(reconciledRow, row) ||
      cachedRowSupersedesAuthoritativeRow(
        options.tableName,
        reconciledRow,
        row,
      );
  });
}

function publishAuthoritativeObservation(options) {
  if (!options.observationRequested) {
    return {success: true, observedAtMs: null};
  }
  const requestedObservedAtMs = Math.floor(
    Number(options.receipt.observedAtMs),
  );
  let observedAtMs = null;
  let persistedObservedAtMs = null;
  let persistedCauseId = null;
  try {
    observedAtMs = options.writableCache.recordAuthoritativeObservation(
      options.tableName,
      {
        observedAtMs: requestedObservedAtMs,
        causeId: options.receipt.causeId,
      },
    );
    persistedObservedAtMs =
      options.readableCache.getLastAuthoritativeObservedAtMs(
        options.tableName,
      );
    persistedCauseId =
      options.readableCache.getLastAuthoritativeObservedCauseId(
        options.tableName,
      );
  } catch (_error) {
    return {success: false, observedAtMs: null};
  }
  const storedTimeConfirmed = Number.isFinite(observedAtMs) &&
    observedAtMs === persistedObservedAtMs &&
    persistedObservedAtMs >= requestedObservedAtMs;
  const storedCauseConfirmed = persistedObservedAtMs > requestedObservedAtMs ?
    typeof persistedCauseId === 'string' && persistedCauseId.length > 0 :
    persistedCauseId === options.receipt.causeId;
  return {
    success: storedTimeConfirmed && storedCauseConfirmed,
    observedAtMs: storedTimeConfirmed && storedCauseConfirmed ?
      persistedObservedAtMs :
      null,
  };
}

function buildReconciliationContext(options) {
  const primaryKeyField = options.reconcileOptions?.primaryKeyField ||
    getSystemCachePrimaryKeyFieldOrFallback(options.tableName, 'id');
  const authoritativeEntries = Array.isArray(options.authoritativeRows) ?
    options.authoritativeRows :
    [];
  const cachedEntries = resolveCachedEntries(
    options.readableCache,
    options.tableName,
    options.reconcileOptions,
  );
  const rowComparator =
    typeof options.reconcileOptions?.areRowsEqual === 'function' ?
      options.reconcileOptions.areRowsEqual :
      (left, right) => areCanonicalSystemTableRowsEqual(
        options.tableName,
        left,
        right,
      );
  const causeOptions =
    typeof options.reconcileOptions?.causeId === 'string' &&
    options.reconcileOptions.causeId.length > 0 ?
      {causeId: options.reconcileOptions.causeId} :
      undefined;
  return {
    ...options,
    primaryKeyField,
    authoritativeEntries,
    cachedEntries,
    rowComparator,
    causeOptions,
  };
}

function buildReconciliationIndexes(context) {
  const cachedIndex = buildCachedRowIndex(
    context.cachedEntries,
    context.primaryKeyField,
  );
  const authoritativeIndex = buildAuthoritativeRowIndex(
    context.tableName,
    context.authoritativeEntries,
    context.primaryKeyField,
  );
  const unreconciledCachedKeyCount = countUnreconciledCachedKeys(
    cachedIndex.rowsByKey,
    authoritativeIndex.keys,
    context.deleteMissingPolicy,
  );
  return {
    cachedIndex,
    authoritativeIndex,
    publishable: canPublishCompleteObservation({
      invalidAuthoritativeKeyCount: authoritativeIndex.invalidKeyCount,
      invalidCachedKeyCount: cachedIndex.invalidKeyCount,
      duplicateAuthoritativeKeyCount: authoritativeIndex.duplicateKeyCount,
      unreconciledCachedKeyCount,
    }),
  };
}

function applyCacheReconciliation(context, indexes) {
  const mutationOptions = {
    tableName: context.tableName,
    primaryKeyField: context.primaryKeyField,
    authoritativeRowsByKey: indexes.authoritativeIndex.rowsByKey,
    authoritativeKeys: indexes.authoritativeIndex.keys,
    cachedRowsByKey: indexes.cachedIndex.rowsByKey,
    cachedEntries: context.cachedEntries,
    rowComparator: context.rowComparator,
    writableCache: context.writableCache,
    causeOptions: context.causeOptions,
    deleteMissingPolicy: context.deleteMissingPolicy,
  };
  return applyAuthoritativeUpserts(mutationOptions) +
    applyMissingRowDeletes(mutationOptions);
}

function observationCacheIsVerified(context, indexes) {
  if (!context.observationRequested) {
    return true;
  }
  return cacheExactlyMatchesAuthoritativeRows({
    tableName: context.tableName,
    primaryKeyField: context.primaryKeyField,
    authoritativeRowsByKey: indexes.authoritativeIndex.rowsByKey,
    readableCache: context.readableCache,
    rowComparator: context.rowComparator,
  });
}

function buildReconciliationSuccess(context, mutationCount, publication) {
  return {
    success: true,
    tableName: context.tableName,
    reconcileIntent: context.reconcileIntent,
    mutationCount,
    authoritativeObservedAtMs: publication.observedAtMs,
    outcome: mutationCount > 0 ?
      CONTROL_PLANE_MUTATION_OUTCOME.APPLIED :
      CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
  };
}

const controlPlaneSystemTableGatewayCacheReconciliationMethods = {
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
    authoritativeRows = null,
    options = {},
  ) {
    const {writableCache, readableCache} = resolveCacheTargets(this, options);
    if (!hasUsableCacheTargets(writableCache, readableCache)) {
      return buildCacheUnavailableFailure(tableName);
    }

    const {reconcileIntent, deleteMissingPolicy} =
      buildControlPlaneCacheReconcileContract(options);
    const receipt = options?.authoritativeObservation || null;
    const observationRequested = receipt !== null;
    const receiptMinted = !observationRequested ||
      this.consumeAuthoritativeObservationReceipt(
        receipt,
        tableName,
        authoritativeRows,
      );
    const observationError = validateObservationRequest({
      observationRequested,
      receiptMinted,
      receipt,
      tableName,
      authoritativeRows,
      reconcileOptions: options,
      readableCache,
      writableCache,
    });
    if (observationError) {
      return buildAuthoritativeObservationFailure(
        tableName,
        reconcileIntent,
        0,
        observationError,
      );
    }

    const context = buildReconciliationContext({
      tableName,
      authoritativeRows,
      reconcileOptions: options,
      reconcileIntent,
      deleteMissingPolicy,
      observationRequested,
      receipt,
      readableCache,
      writableCache,
    });
    const indexes = buildReconciliationIndexes(context);
    if (observationRequested && !indexes.publishable) {
      return buildAuthoritativeObservationFailure(
        tableName,
        reconcileIntent,
        0,
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.CACHE_NOT_RECONCILED,
      );
    }

    const mutationCount = applyCacheReconciliation(context, indexes);
    if (!observationCacheIsVerified(context, indexes)) {
      return buildAuthoritativeObservationFailure(
        tableName,
        reconcileIntent,
        mutationCount,
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.CACHE_NOT_RECONCILED,
      );
    }

    const publication = publishAuthoritativeObservation({
      ...context,
    });
    if (!publication.success) {
      return buildAuthoritativeObservationFailure(
        tableName,
        reconcileIntent,
        mutationCount,
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.STORAGE_UNAVAILABLE,
      );
    }

    return buildReconciliationSuccess(context, mutationCount, publication);
  },
};

function assignControlPlaneSystemTableGatewayCacheReconciliation(targetClass) {
  Object.assign(
    targetClass.prototype,
    controlPlaneSystemTableGatewayCacheReconciliationMethods,
  );
}

export {assignControlPlaneSystemTableGatewayCacheReconciliation};
