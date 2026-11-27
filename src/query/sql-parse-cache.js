import {SQL_PARSE_CACHE} from './query-constants.js';

const AST_TEMPLATE_KEY_SYMBOL = Symbol.for('lagrange.sqlParseCache.templateKey');

function attachTemplateKey(ast, key) {
  if (ast && typeof ast === 'object') {
    Object.defineProperty(ast, AST_TEMPLATE_KEY_SYMBOL, {
      value: key,
      enumerable: false,
      configurable: true,
      writable: false,
    });
  }
  return ast;
}

/**
 * LRU cache for parsed SQL ASTs keyed on (sql, dialect).
 * Uses Map insertion-order semantics for O(1) LRU eviction.
 */
class SqlParseCache {
  constructor(maxSize = SQL_PARSE_CACHE.DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Returns a deep clone of the cached AST for the given sql/dialect,
   * or null on cache miss. Promotes the entry to most-recently-used.
   */
  get(sql, dialect) {
    const key = this.buildKey(sql, dialect);
    const entry = this.cache.get(key);
    if (!entry) return null;
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return attachTemplateKey(this.cloneAst(entry), key);
  }

  /**
   * Returns the cached AST without cloning for read-only callers (statement
   * admission and PG wire description), or null on cache miss.
   */
  peekReadOnly(statementText, dialect) {
    const key = this.buildKey(statementText, dialect);
    const entry = this.cache.get(key);
    if (!entry) return null;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  /**
   * Stores an AST under the composite (sql, dialect) key.
   * Evicts the least recently used entry when at capacity.
   */
  set(sql, dialect, ast) {
    const key = this.buildKey(sql, dialect);
    this.cache.delete(key);
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, attachTemplateKey(ast, key));
  }

  /**
   * Builds a composite cache key from sql and dialect.
   */
  buildKey(sql, dialect) {
    return dialect ? `${dialect}:${sql}` : sql;
  }

  /**
   * Deep-clones an AST so callers can mutate freely.
   */
  cloneAst(ast) {
    const cloned = structuredClone(ast);
    const key = ast?.[AST_TEMPLATE_KEY_SYMBOL];
    return typeof key === 'string' ? attachTemplateKey(cloned, key) : cloned;
  }
}

export {AST_TEMPLATE_KEY_SYMBOL, SqlParseCache};
