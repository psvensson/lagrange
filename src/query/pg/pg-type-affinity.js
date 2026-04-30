const LOCAL_STR_STRING = 'string';

/**
 * PostgreSQL type to SQLite affinity mapping.
 * Maps PG type names to SQLite type affinities (TEXT, INTEGER, REAL, BLOB).
 * Unknown types pass through uppercased.
 * Requirements: 6.2, 6.3
 */

/**
 * SQLite type affinity constants.
 */
const AFFINITY_TEXT = 'TEXT';
const AFFINITY_INTEGER = 'INTEGER';
const AFFINITY_REAL = 'REAL';
const AFFINITY_BLOB = 'BLOB';

const PG_TYPE_ERROR_MSG = 'pgType must be a string';

/**
 * Frozen map of PostgreSQL type names (lowercased) to SQLite affinities.
 * Covers all types listed in Requirement 6.3.
 */
const PG_TYPE_AFFINITY_MAP = Object.freeze({
  'varchar': AFFINITY_TEXT,
  'text': AFFINITY_TEXT,
  'char': AFFINITY_TEXT,
  'character varying': AFFINITY_TEXT,
  'integer': AFFINITY_INTEGER,
  'int': AFFINITY_INTEGER,
  'smallint': AFFINITY_INTEGER,
  'bigint': AFFINITY_INTEGER,
  'serial': AFFINITY_INTEGER,
  'bigserial': AFFINITY_INTEGER,
  'boolean': AFFINITY_INTEGER,
  'real': AFFINITY_REAL,
  'double precision': AFFINITY_REAL,
  'float': AFFINITY_REAL,
  'numeric': AFFINITY_REAL,
  'decimal': AFFINITY_REAL,
  'bytea': AFFINITY_BLOB,
});

/**
 * Resolves a PostgreSQL type name to its SQLite affinity.
 * @param {string} pgType - PostgreSQL type name (case-insensitive).
 * @returns {string} SQLite affinity or the input type uppercased if unmapped.
 */
function resolveAffinity(pgType) {
  if (typeof pgType !== LOCAL_STR_STRING) {
    throw new TypeError(PG_TYPE_ERROR_MSG);
  }
  const normalized = pgType.toLowerCase();
  return PG_TYPE_AFFINITY_MAP[normalized] || pgType.toUpperCase();
}

export {PG_TYPE_AFFINITY_MAP, resolveAffinity};
