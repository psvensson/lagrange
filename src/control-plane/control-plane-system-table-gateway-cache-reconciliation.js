import {
  CDC_OPERATION,
  CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  areCanonicalSystemTableRowsEqual,
  buildControlPlaneCacheReconcileContract,
  canonicalizeSystemTableRow,
  getSystemCachePrimaryKeyFieldOrFallback,
  hasUsablePrimaryKeyValue,
} from './control-plane-system-table-gateway-shared.js';

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
    authoritativeRows = [],
    options = {},
  ) {
    const defaultCache = this.resolveSystemTableCache();
    const writableCache = options?.cacheMutationTarget || defaultCache;
    const readableCache =
      options?.systemTableCache || defaultCache || writableCache;
    if (
      !writableCache ||
      typeof writableCache.applySystemTableChange !== 'function' ||
      !readableCache
    ) {
      return {
        success: false,
        tableName,
        mutationCount: 0,
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        error:
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SYSTEM_TABLE_CACHE_UNAVAILABLE,
      };
    }

    const primaryKeyField =
      options?.primaryKeyField ||
      getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');
    const {reconcileIntent, deleteMissingPolicy} =
      buildControlPlaneCacheReconcileContract(options);
    const authoritativeEntries = Array.isArray(authoritativeRows) ?
      authoritativeRows :
      [];
    const cachedEntries = Array.isArray(options?.cachedRows) ?
      options.cachedRows :
      typeof options?.cachedRowFilter === 'function' &&
          typeof readableCache.filter === 'function' ?
        readableCache.filter(tableName, options.cachedRowFilter) || [] :
        typeof readableCache.getAll === 'function' ?
          readableCache.getAll(tableName) || [] :
          [];
    const rowComparator =
      typeof options?.areRowsEqual === 'function' ?
        options.areRowsEqual :
        (left, right) =>
          areCanonicalSystemTableRowsEqual(tableName, left, right);
    const causeOptions =
      typeof options?.causeId === 'string' &&
      options.causeId.length > 0 ?
        {causeId: options.causeId} :
        undefined;
    const cachedRowsByKey = new Map();
    const authoritativeKeys = new Set();
    let mutationCount = 0;

    for (const row of cachedEntries) {
      const key = row?.[primaryKeyField] ?? row?.id;
      if (!hasUsablePrimaryKeyValue(key)) {
        continue;
      }
      cachedRowsByKey.set(String(key), row);
    }

    for (const row of authoritativeEntries) {
      const canonicalRow = canonicalizeSystemTableRow(tableName, row);
      const key = canonicalRow?.[primaryKeyField] ?? canonicalRow?.id;
      if (!hasUsablePrimaryKeyValue(key)) {
        continue;
      }
      const normalizedKey = String(key);
      authoritativeKeys.add(normalizedKey);
      const cachedRow = cachedRowsByKey.get(normalizedKey) || null;
      if (rowComparator && rowComparator(cachedRow, canonicalRow)) {
        continue;
      }
      writableCache.applySystemTableChange(
        tableName,
        CDC_OPERATION.UPSERT,
        canonicalRow,
        causeOptions,
      );
      mutationCount += 1;
    }

    if (
      deleteMissingPolicy ===
      CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY.DELETE_MISSING
    ) {
      for (const cachedRow of cachedEntries) {
        const key = cachedRow?.[primaryKeyField] ?? cachedRow?.id;
        if (
          !hasUsablePrimaryKeyValue(key) ||
          authoritativeKeys.has(String(key))
        ) {
          continue;
        }
        writableCache.applySystemTableChange(
          tableName,
          CDC_OPERATION.DELETE,
          cachedRow,
          causeOptions,
        );
        mutationCount += 1;
      }
    }

    return {
      success: true,
      tableName,
      reconcileIntent,
      mutationCount,
      outcome:
        mutationCount > 0 ?
          CONTROL_PLANE_MUTATION_OUTCOME.APPLIED :
          CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
    };
  },
};

function assignControlPlaneSystemTableGatewayCacheReconciliation(targetClass) {
  Object.assign(
    targetClass.prototype,
    controlPlaneSystemTableGatewayCacheReconciliationMethods,
  );
}

export {assignControlPlaneSystemTableGatewayCacheReconciliation};
