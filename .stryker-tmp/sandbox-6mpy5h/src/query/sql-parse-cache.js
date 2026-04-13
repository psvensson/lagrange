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
import { SQL_PARSE_CACHE } from './query-constants.js';

/**
 * LRU cache for parsed SQL ASTs keyed on (sql, dialect).
 * Uses Map insertion-order semantics for O(1) LRU eviction.
 */
class SqlParseCache {
  constructor(maxSize = SQL_PARSE_CACHE.DEFAULT_MAX_SIZE) {
    if (stryMutAct_9fa48("118878")) {
      {}
    } else {
      stryCov_9fa48("118878");
      this.maxSize = maxSize;
      this.cache = new Map();
    }
  }

  /**
   * Returns a deep clone of the cached AST for the given sql/dialect,
   * or null on cache miss. Promotes the entry to most-recently-used.
   */
  get(sql, dialect) {
    if (stryMutAct_9fa48("118879")) {
      {}
    } else {
      stryCov_9fa48("118879");
      const key = this.buildKey(sql, dialect);
      const entry = this.cache.get(key);
      if (stryMutAct_9fa48("118882") ? false : stryMutAct_9fa48("118881") ? true : stryMutAct_9fa48("118880") ? entry : (stryCov_9fa48("118880", "118881", "118882"), !entry)) return null;
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);
      return this.cloneAst(entry);
    }
  }

  /**
   * Stores an AST under the composite (sql, dialect) key.
   * Evicts the least recently used entry when at capacity.
   */
  set(sql, dialect, ast) {
    if (stryMutAct_9fa48("118883")) {
      {}
    } else {
      stryCov_9fa48("118883");
      const key = this.buildKey(sql, dialect);
      this.cache.delete(key);
      if (stryMutAct_9fa48("118887") ? this.cache.size < this.maxSize : stryMutAct_9fa48("118886") ? this.cache.size > this.maxSize : stryMutAct_9fa48("118885") ? false : stryMutAct_9fa48("118884") ? true : (stryCov_9fa48("118884", "118885", "118886", "118887"), this.cache.size >= this.maxSize)) {
        if (stryMutAct_9fa48("118888")) {
          {}
        } else {
          stryCov_9fa48("118888");
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }
      }
      this.cache.set(key, ast);
    }
  }

  /**
   * Builds a composite cache key from sql and dialect.
   */
  buildKey(sql, dialect) {
    if (stryMutAct_9fa48("118889")) {
      {}
    } else {
      stryCov_9fa48("118889");
      return dialect ? stryMutAct_9fa48("118890") ? `` : (stryCov_9fa48("118890"), `${dialect}:${sql}`) : sql;
    }
  }

  /**
   * Deep-clones an AST so callers can mutate freely.
   */
  cloneAst(ast) {
    if (stryMutAct_9fa48("118891")) {
      {}
    } else {
      stryCov_9fa48("118891");
      return structuredClone(ast);
    }
  }
}
export { SqlParseCache };