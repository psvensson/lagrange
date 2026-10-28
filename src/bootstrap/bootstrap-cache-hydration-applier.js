/**
 * Bootstrap-only cache hydration applier.
 *
 * This is the sanctioned direct-cache exception for seed/join hydration
 * before steady-state CDC subscriptions are active.
 *
 * Synchronous by contract: a thrown cache failure must propagate to the
 * registration boundary instead of escaping as an unobserved rejection.
 *
 * @param {Object} systemTableCache - Target cache.
 * @return {Function} Bootstrap-only row applier.
 */
function createBootstrapCacheHydrationApplier(systemTableCache) {
  return (tableName, operation, row) => {
    systemTableCache.applySystemTableChange(tableName, operation, row);
  };
}

export {createBootstrapCacheHydrationApplier};
