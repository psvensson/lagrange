/**
 * SystemCacheClient - Unified read-only cache client abstraction.
 *
 * Provides factory helpers for two read backings:
 * - direct cache reads (ReadOnlySystemTableCache-compatible)
 * - proxy cache reads (SystemCacheProxy-compatible)
 */

import {TYPEOF} from '../constants/index.js';

const LOCAL_NUM_ZERO = 0;

const SYSTEM_CACHE_CLIENT_MODE = Object.freeze({
  DIRECT: 'direct',
  PROXY: 'proxy',
});

const SYSTEM_CACHE_CLIENT_ERROR_MSG = Object.freeze({
  CACHE_REQUIRED: 'System cache backing is required',
  INVALID_LISTENER: 'Cache change listener must be a function',
  UNSUPPORTED_MODE: (mode) => `Unsupported system cache client mode: ${mode}`,
});

function assertCacheBacking(backing) {
  if (!backing) {
    throw new Error(SYSTEM_CACHE_CLIENT_ERROR_MSG.CACHE_REQUIRED);
  }
}

function createDirectSystemCacheClient(readOnlyCache) {
  assertCacheBacking(readOnlyCache);

  return {
    get: (tableName, key) => readOnlyCache.get(tableName, key),
    find: (tableName, predicate) => readOnlyCache.find(tableName, predicate),
    filter: (tableName, predicate) => readOnlyCache.filter(tableName, predicate),
    getAll: (tableName) => readOnlyCache.getAll(tableName),
    has: (tableName, key) => readOnlyCache.has(tableName, key),
    count: (tableName) => readOnlyCache.count(tableName),
    getTableNames: () => readOnlyCache.getTableNames(),
    onCacheChange: (listener) => {
      if (typeof listener !== TYPEOF.FUNCTION) {
        throw new Error(SYSTEM_CACHE_CLIENT_ERROR_MSG.INVALID_LISTENER);
      }
      return readOnlyCache.onCacheChange(listener);
    },
    offCacheChange: (listener) => {
      if (typeof listener !== TYPEOF.FUNCTION) {
        throw new Error(SYSTEM_CACHE_CLIENT_ERROR_MSG.INVALID_LISTENER);
      }
      return readOnlyCache.offCacheChange(listener);
    },
  };
}

function createProxySystemCacheClient(systemCacheProxy) {
  assertCacheBacking(systemCacheProxy);

  return {
    get: async (tableName, key) => systemCacheProxy.get(tableName, key),
    find: async (tableName, predicate) => systemCacheProxy.find(tableName, predicate),
    filter: async (tableName, predicate) => systemCacheProxy.filter(tableName, predicate),
    getAll: async (tableName) => systemCacheProxy.getAll(tableName),
    has: async (tableName, key) => systemCacheProxy.has(tableName, key),
    count: async (tableName) => {
      if (typeof systemCacheProxy.count === TYPEOF.FUNCTION) {
        return systemCacheProxy.count(tableName);
      }
      const records = await systemCacheProxy.getAll(tableName);
      return Array.isArray(records) ? records.length : LOCAL_NUM_ZERO;
    },
    getTableNames: async () => {
      if (typeof systemCacheProxy.getTableNames === TYPEOF.FUNCTION) {
        return systemCacheProxy.getTableNames();
      }
      return [];
    },
    onCacheChange: (_listener) => {
      // Proxy does not provide push-based cache events.
      return null;
    },
    offCacheChange: (_listener) => {
      // Proxy does not provide push-based cache events.
      return false;
    },
  };
}

function createSystemCacheClient(options = {}) {
  const mode = options.mode || SYSTEM_CACHE_CLIENT_MODE.DIRECT;
  if (mode === SYSTEM_CACHE_CLIENT_MODE.DIRECT) {
    return createDirectSystemCacheClient(options.cache);
  }
  if (mode === SYSTEM_CACHE_CLIENT_MODE.PROXY) {
    return createProxySystemCacheClient(options.cache);
  }
  throw new Error(SYSTEM_CACHE_CLIENT_ERROR_MSG.UNSUPPORTED_MODE(mode));
}

export {
  SYSTEM_CACHE_CLIENT_MODE,
  SYSTEM_CACHE_CLIENT_ERROR_MSG,
  createDirectSystemCacheClient,
  createProxySystemCacheClient,
  createSystemCacheClient,
};
