/**
 * LRU cache for DWARF indexes keyed by module identity.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM, TYPEOF } from '../constants/index.js';
import { DWARF_INDEX_DEFAULT as DEF, DWARF_INDEX_VALUE as VALUE, DWARF_INDEX_ERROR_MSG as ERR } from './dwarf-index-constants.js';

/**
 * Bounded in-memory LRU cache for DWARF indexes.
 */
class DwarfIndexCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxEntries] - Max entries in cache.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("77406")) {
      {}
    } else {
      stryCov_9fa48("77406");
      this._maxEntries = stryMutAct_9fa48("77407") ? options.maxEntries && DEF.CACHE_MAX_ENTRIES : (stryCov_9fa48("77407"), options.maxEntries ?? DEF.CACHE_MAX_ENTRIES);
      if (stryMutAct_9fa48("77410") ? false : stryMutAct_9fa48("77409") ? true : stryMutAct_9fa48("77408") ? isPositiveInteger(this._maxEntries) : (stryCov_9fa48("77408", "77409", "77410"), !isPositiveInteger(this._maxEntries))) {
        if (stryMutAct_9fa48("77411")) {
          {}
        } else {
          stryCov_9fa48("77411");
          throw new Error(ERR.CACHE_MAX_ENTRIES_INVALID);
        }
      }
      this._entries = new Map();
      this._inflightCreates = new Map();
      this.policy = VALUE.CACHE_POLICY_LRU;
    }
  }

  /**
   * @return {number} Number of cached entries.
   */
  size() {
    if (stryMutAct_9fa48("77412")) {
      {}
    } else {
      stryCov_9fa48("77412");
      return this._entries.size;
    }
  }

  /**
   * @param {string} cacheKey - Cache key.
   * @return {boolean} True if cached.
   */
  has(cacheKey) {
    if (stryMutAct_9fa48("77413")) {
      {}
    } else {
      stryCov_9fa48("77413");
      assertCacheKey(cacheKey);
      return this._entries.has(cacheKey);
    }
  }

  /**
   * Get cached index and mark it as most recently used.
   *
   * @param {string} cacheKey - Cache key.
   * @return {Object|null} Cached index or null.
   */
  get(cacheKey) {
    if (stryMutAct_9fa48("77414")) {
      {}
    } else {
      stryCov_9fa48("77414");
      assertCacheKey(cacheKey);
      if (stryMutAct_9fa48("77417") ? false : stryMutAct_9fa48("77416") ? true : stryMutAct_9fa48("77415") ? this._entries.has(cacheKey) : (stryCov_9fa48("77415", "77416", "77417"), !this._entries.has(cacheKey))) {
        if (stryMutAct_9fa48("77418")) {
          {}
        } else {
          stryCov_9fa48("77418");
          return null;
        }
      }
      const index = this._entries.get(cacheKey);
      this._entries.delete(cacheKey);
      this._entries.set(cacheKey, index);
      return index;
    }
  }

  /**
   * Put index into cache and evict LRU entries if needed.
   *
   * @param {string} cacheKey - Cache key.
   * @param {Object} index - DWARF index object.
   * @return {Object} The inserted index.
   */
  set(cacheKey, index) {
    if (stryMutAct_9fa48("77419")) {
      {}
    } else {
      stryCov_9fa48("77419");
      assertCacheKey(cacheKey);
      if (stryMutAct_9fa48("77422") ? !index && typeof index !== TYPEOF.OBJECT : stryMutAct_9fa48("77421") ? false : stryMutAct_9fa48("77420") ? true : (stryCov_9fa48("77420", "77421", "77422"), (stryMutAct_9fa48("77423") ? index : (stryCov_9fa48("77423"), !index)) || (stryMutAct_9fa48("77425") ? typeof index === TYPEOF.OBJECT : stryMutAct_9fa48("77424") ? false : (stryCov_9fa48("77424", "77425"), typeof index !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("77426")) {
          {}
        } else {
          stryCov_9fa48("77426");
          throw new Error(ERR.INDEX_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("77428") ? false : stryMutAct_9fa48("77427") ? true : (stryCov_9fa48("77427", "77428"), this._entries.has(cacheKey))) {
        if (stryMutAct_9fa48("77429")) {
          {}
        } else {
          stryCov_9fa48("77429");
          this._entries.delete(cacheKey);
        }
      }
      this._entries.set(cacheKey, index);
      this._evictOverflow();
      return index;
    }
  }

  /**
   * Delete an entry by key.
   *
   * @param {string} cacheKey - Cache key.
   * @return {boolean} True if deleted.
   */
  delete(cacheKey) {
    if (stryMutAct_9fa48("77430")) {
      {}
    } else {
      stryCov_9fa48("77430");
      assertCacheKey(cacheKey);
      this._inflightCreates.delete(cacheKey);
      return this._entries.delete(cacheKey);
    }
  }

  /**
   * Clear all cached and in-flight state.
   */
  clear() {
    if (stryMutAct_9fa48("77431")) {
      {}
    } else {
      stryCov_9fa48("77431");
      this._entries.clear();
      this._inflightCreates.clear();
    }
  }

  /**
   * Get cached index or create it once for concurrent callers.
   *
   * @param {string} cacheKey - Cache key.
   * @param {Function} createFn - Async builder function.
   * @return {Promise<Object>} Cached or created index.
   */
  async getOrCreate(cacheKey, createFn) {
    if (stryMutAct_9fa48("77432")) {
      {}
    } else {
      stryCov_9fa48("77432");
      assertCacheKey(cacheKey);
      if (stryMutAct_9fa48("77435") ? typeof createFn === TYPEOF.FUNCTION : stryMutAct_9fa48("77434") ? false : stryMutAct_9fa48("77433") ? true : (stryCov_9fa48("77433", "77434", "77435"), typeof createFn !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("77436")) {
          {}
        } else {
          stryCov_9fa48("77436");
          throw new Error(ERR.CREATE_FN_REQUIRED);
        }
      }
      const cached = this.get(cacheKey);
      if (stryMutAct_9fa48("77438") ? false : stryMutAct_9fa48("77437") ? true : (stryCov_9fa48("77437", "77438"), cached)) {
        if (stryMutAct_9fa48("77439")) {
          {}
        } else {
          stryCov_9fa48("77439");
          return cached;
        }
      }
      if (stryMutAct_9fa48("77441") ? false : stryMutAct_9fa48("77440") ? true : (stryCov_9fa48("77440", "77441"), this._inflightCreates.has(cacheKey))) {
        if (stryMutAct_9fa48("77442")) {
          {}
        } else {
          stryCov_9fa48("77442");
          return await this._inflightCreates.get(cacheKey);
        }
      }
      const createPromise = Promise.resolve().then(stryMutAct_9fa48("77443") ? () => undefined : (stryCov_9fa48("77443"), () => createFn())).then(index => {
        if (stryMutAct_9fa48("77444")) {
          {}
        } else {
          stryCov_9fa48("77444");
          this.set(cacheKey, index);
          return index;
        }
      }).finally(() => {
        if (stryMutAct_9fa48("77445")) {
          {}
        } else {
          stryCov_9fa48("77445");
          this._inflightCreates.delete(cacheKey);
        }
      });
      this._inflightCreates.set(cacheKey, createPromise);
      return await createPromise;
    }
  }

  /**
   * Remove least-recently used entries until size <= max.
   *
   * @private
   */
  _evictOverflow() {
    if (stryMutAct_9fa48("77446")) {
      {}
    } else {
      stryCov_9fa48("77446");
      while (stryMutAct_9fa48("77449") ? this._entries.size <= this._maxEntries : stryMutAct_9fa48("77448") ? this._entries.size >= this._maxEntries : stryMutAct_9fa48("77447") ? false : (stryCov_9fa48("77447", "77448", "77449"), this._entries.size > this._maxEntries)) {
        if (stryMutAct_9fa48("77450")) {
          {}
        } else {
          stryCov_9fa48("77450");
          const oldestKey = this._entries.keys().next().value;
          if (stryMutAct_9fa48("77453") ? oldestKey !== undefined : stryMutAct_9fa48("77452") ? false : stryMutAct_9fa48("77451") ? true : (stryCov_9fa48("77451", "77452", "77453"), oldestKey === undefined)) {
            if (stryMutAct_9fa48("77454")) {
              {}
            } else {
              stryCov_9fa48("77454");
              break;
            }
          }
          this._entries.delete(oldestKey);
        }
      }
    }
  }
}

/**
 * Assert a cache key shape.
 *
 * @param {*} cacheKey - Candidate key.
 */
function assertCacheKey(cacheKey) {
  if (stryMutAct_9fa48("77455")) {
    {}
  } else {
    stryCov_9fa48("77455");
    if (stryMutAct_9fa48("77458") ? typeof cacheKey !== TYPEOF.STRING && cacheKey.trim().length === NUM.ZERO : stryMutAct_9fa48("77457") ? false : stryMutAct_9fa48("77456") ? true : (stryCov_9fa48("77456", "77457", "77458"), (stryMutAct_9fa48("77460") ? typeof cacheKey === TYPEOF.STRING : stryMutAct_9fa48("77459") ? false : (stryCov_9fa48("77459", "77460"), typeof cacheKey !== TYPEOF.STRING)) || (stryMutAct_9fa48("77462") ? cacheKey.trim().length !== NUM.ZERO : stryMutAct_9fa48("77461") ? false : (stryCov_9fa48("77461", "77462"), (stryMutAct_9fa48("77463") ? cacheKey.length : (stryCov_9fa48("77463"), cacheKey.trim().length)) === NUM.ZERO)))) {
      if (stryMutAct_9fa48("77464")) {
        {}
      } else {
        stryCov_9fa48("77464");
        throw new Error(ERR.CACHE_KEY_REQUIRED);
      }
    }
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isPositiveInteger(value) {
  if (stryMutAct_9fa48("77465")) {
    {}
  } else {
    stryCov_9fa48("77465");
    return stryMutAct_9fa48("77468") ? Number.isInteger(value) || value > NUM.ZERO : stryMutAct_9fa48("77467") ? false : stryMutAct_9fa48("77466") ? true : (stryCov_9fa48("77466", "77467", "77468"), Number.isInteger(value) && (stryMutAct_9fa48("77471") ? value <= NUM.ZERO : stryMutAct_9fa48("77470") ? value >= NUM.ZERO : stryMutAct_9fa48("77469") ? true : (stryCov_9fa48("77469", "77470", "77471"), value > NUM.ZERO)));
  }
}
export { DwarfIndexCache };