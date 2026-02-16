/**
 * PostgreSQL type to SQLite affinity mapping.
 * Maps PG type names to SQLite type affinities (TEXT, INTEGER, REAL, BLOB).
 * Unknown types pass through uppercased.
 * Requirements: 6.2, 6.3
 */

/**
 * Frozen map of PostgreSQL type names (lowercased) to SQLite affinities.
 * Covers all types listed in Requirement 6.3.
 */
const PG_TYPE_AFFINITY_MAP = Object.freeze({
  'varchar': 'TEXT',
  'text': 'TEXT',
  'char': 'TEXT',
  'character varying': 'TEXT',
  'integer': 'INTEGER',
  'int': 'INTEGER',
  'smallint': 'INTEGER',
  'bigint': 'INTEGER',
  'serial': 'INTEGER',
  'bigserial': 'INTEGER',
  'boolean': 'INTEGER',
  'real': 'REAL',
  'double precision': 'REAL',
  'float': 'REAL',
  'numeric': 'REAL',
  'decimal': 'REAL',
  'bytea': 'BLOB',
});

/**
 * Resolves a PostgreSQL type name to its SQLite affinity.
 * @param {string} pgType - PostgreSQL type name (case-insensitive).
 * @returns {string} SQLite affinity or the input type uppercased if unmapped.
 */
function resolveAffinity(pgType) {
  const normalized = pgType.toLowerCase();
  return PG_TYPE_AFFINITY_MAP[normalized] || pgType.toUpperCase();
}

export {PG_TYPE_AFFINITY_MAP, resolveAffinity};
