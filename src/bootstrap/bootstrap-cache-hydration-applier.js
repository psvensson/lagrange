/**
 * Bootstrap-only cache hydration applier.
 *
 * This is the sanctioned direct-cache exception for seed/join hydration
 * before steady-state CDC subscriptions are active.
 *
 * @param {Object} systemTableCache - Target cache.
 * @return {Function} Bootstrap-only row applier.
 */
function createBootstrapCacheHydrationApplier(systemTableCache) {
  return async (tableName, operation, row) => {
    systemTableCache.applySystemTableChange(tableName, operation, row);
  };
}

export {createBootstrapCacheHydrationApplier};
