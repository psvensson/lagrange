// Bounded pure-function memo for converted SQL ASTs, keyed by `(dialect, sql)`.
// Each lookup returns an isolated deep clone so callers may annotate or
// transform their AST without affecting subsequent parses of the same SQL text.

const SQL_PARSE_MEMO_MAX_ENTRIES = 256;
const SQL_PARSE_MEMO_MAX_SQL_LENGTH = 4096;
const DIALECT_KEY_SEPARATOR = '\0';

function cloneAstValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      out[index] = cloneAstValue(value[index]);
    }
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return structuredClone(value);
  const out = proto === null ? Object.create(null) : {};
  for (const key of Object.keys(value)) {
    out[key] = cloneAstValue(value[key]);
  }
  return out;
}

class SqlAstParseMemo {
  #entries = new Map();

  readClone(dialect, sql) {
    if (typeof sql !== 'string' || sql.length > SQL_PARSE_MEMO_MAX_SQL_LENGTH) {
      return null;
    }
    const key = `${dialect}${DIALECT_KEY_SEPARATOR}${sql}`;
    const stored = this.#entries.get(key);
    if (stored === undefined) return null;
    this.#entries.delete(key);
    this.#entries.set(key, stored);
    return cloneAstValue(stored);
  }

  recordClone(dialect, sql, ast) {
    if (typeof sql !== 'string' || sql.length > SQL_PARSE_MEMO_MAX_SQL_LENGTH) {
      return;
    }
    const key = `${dialect}${DIALECT_KEY_SEPARATOR}${sql}`;
    if (this.#entries.size >= SQL_PARSE_MEMO_MAX_ENTRIES) {
      this.#entries.delete(this.#entries.keys().next().value);
    }
    this.#entries.set(key, cloneAstValue(ast));
  }
}

const SHARED_SQL_AST_PARSE_MEMO = new SqlAstParseMemo();

export {SHARED_SQL_AST_PARSE_MEMO, SqlAstParseMemo, cloneAstValue};
