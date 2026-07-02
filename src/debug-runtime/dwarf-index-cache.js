/**
 * LRU cache for DWARF indexes keyed by module identity.
 */

import {
  DWARF_INDEX_DEFAULT as DEF,
  DWARF_INDEX_VALUE as VALUE,
  DWARF_INDEX_ERROR_MSG as ERR,
} from './dwarf-index-constants.js';

/**
 * Bounded in-memory LRU cache for DWARF indexes.
 */
class DwarfIndexCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxEntries] - Max entries in cache.
   */
  constructor(options = {}) {
    this._maxEntries = options.maxEntries ?? DEF.CACHE_MAX_ENTRIES;
    if (!isPositiveInteger(this._maxEntries)) {
      throw new Error(ERR.CACHE_MAX_ENTRIES_INVALID);
    }

    this._entries = new Map();
    this._inflightCreates = new Map();
    this.policy = VALUE.CACHE_POLICY_LRU;
  }

  /**
   * @return {number} Number of cached entries.
   */
  size() {
    return this._entries.size;
  }

  /**
   * @param {string} cacheKey - Cache key.
   * @return {boolean} True if cached.
   */
  has(cacheKey) {
    assertCacheKey(cacheKey);
    return this._entries.has(cacheKey);
  }

  /**
   * Get cached index and mark it as most recently used.
   *
   * @param {string} cacheKey - Cache key.
   * @return {Object|null} Cached index or null.
   */
  get(cacheKey) {
    assertCacheKey(cacheKey);
    if (!this._entries.has(cacheKey)) {
      return null;
    }

    const index = this._entries.get(cacheKey);
    this._entries.delete(cacheKey);
    this._entries.set(cacheKey, index);
    return index;
  }

  /**
   * Put index into cache and evict LRU entries if needed.
   *
   * @param {string} cacheKey - Cache key.
   * @param {Object} index - DWARF index object.
   * @return {Object} The inserted index.
   */
  set(cacheKey, index) {
    assertCacheKey(cacheKey);
    if (!index || typeof index !== 'object') {
      throw new Error(ERR.INDEX_REQUIRED);
    }

    if (this._entries.has(cacheKey)) {
      this._entries.delete(cacheKey);
    }
    this._entries.set(cacheKey, index);
    this._evictOverflow();
    return index;
  }

  /**
   * Delete an entry by key.
   *
   * @param {string} cacheKey - Cache key.
   * @return {boolean} True if deleted.
   */
  delete(cacheKey) {
    assertCacheKey(cacheKey);
    this._inflightCreates.delete(cacheKey);
    return this._entries.delete(cacheKey);
  }

  /**
   * Clear all cached and in-flight state.
   */
  clear() {
    this._entries.clear();
    this._inflightCreates.clear();
  }

  /**
   * Get cached index or create it once for concurrent callers.
   *
   * @param {string} cacheKey - Cache key.
   * @param {Function} createFn - Async builder function.
   * @return {Promise<Object>} Cached or created index.
   */
  async getOrCreate(cacheKey, createFn) {
    assertCacheKey(cacheKey);
    if (typeof createFn !== 'function') {
      throw new Error(ERR.CREATE_FN_REQUIRED);
    }

    const cached = this.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (this._inflightCreates.has(cacheKey)) {
      return await this._inflightCreates.get(cacheKey);
    }

    const createPromise = Promise.resolve()
      .then(() => createFn())
      .then((index) => {
        this.set(cacheKey, index);
        return index;
      })
      .finally(() => {
        this._inflightCreates.delete(cacheKey);
      });

    this._inflightCreates.set(cacheKey, createPromise);
    return await createPromise;
  }

  /**
   * Remove least-recently used entries until size <= max.
   *
   * @private
   */
  _evictOverflow() {
    while (this._entries.size > this._maxEntries) {
      const oldestKey = this._entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this._entries.delete(oldestKey);
    }
  }
}

/**
 * Assert a cache key shape.
 *
 * @param {*} cacheKey - Candidate key.
 */
function assertCacheKey(cacheKey) {
  if (typeof cacheKey !== 'string' ||
    cacheKey.trim().length === 0) {
    throw new Error(ERR.CACHE_KEY_REQUIRED);
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export {
  DwarfIndexCache,
};
