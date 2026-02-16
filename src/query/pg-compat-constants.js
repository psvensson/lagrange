/**
 * PostgreSQL compatibility layer constants.
 * All string literals, error messages, and configuration values
 * for the PG-to-SQLite translation layer.
 * Requirements: 1.1, 6.3, 8.2, 8.3
 */

/**
 * Parser dialect modes for SQLParser.
 * Controls which node-sql-parser database mode is used.
 */
const PARSER_DIALECT = Object.freeze({
  SQLITE: 'sqlite',
  POSTGRESQL: 'postgresql',
});

/**
 * Error message prefixes for PG translation failures.
 * Each prefix is concatenated with the specific value at throw site.
 */
const PG_TRANSLATE_ERROR = Object.freeze({
  MISSING_PARAM_INDEX: 'Positional parameter $N references index ',
  PARAM_GAP: 'Non-sequential positional parameters: gap at ',
  UNSUPPORTED_EXTRACT_FIELD: 'Unsupported EXTRACT field: ',
  UNSUPPORTED_DATE_TRUNC_FIELD: 'Unsupported DATE_TRUNC precision: ',
});

/**
 * strftime format strings for EXTRACT(field FROM expr) translation.
 * Maps PG EXTRACT field names to SQLite strftime format codes.
 */
const PG_EXTRACT_FORMAT = Object.freeze({
  year: '%Y',
  month: '%m',
  day: '%d',
  hour: '%H',
  minute: '%M',
  second: '%S',
  dow: '%w',
  doy: '%j',
  epoch: '%s',
});

/**
 * strftime format strings for DATE_TRUNC(precision, expr) translation.
 * Maps PG DATE_TRUNC precision names to SQLite strftime format strings
 * that truncate to the specified precision.
 */
const PG_DATE_TRUNC_FORMAT = Object.freeze({
  year: '%Y-01-01 00:00:00',
  month: '%Y-%m-01 00:00:00',
  day: '%Y-%m-%d 00:00:00',
  hour: '%Y-%m-%d %H:00:00',
  minute: '%Y-%m-%d %H:%M:00',
  second: '%Y-%m-%d %H:%M:%S',
});

/**
 * New EXPR_TYPE values for PG compatibility AST nodes.
 * These extend the base EXPR_TYPE in sql-parser.js with node types
 * needed by the PG translation layer.
 */
const PG_EXPR_TYPE = Object.freeze({
  CAST: 'cast',
  CASE: 'case',
  SUBQUERY: 'subquery',
  EXISTS: 'exists',
  FUNCTION_CALL: 'function_call',
});

export {
  PARSER_DIALECT,
  PG_TRANSLATE_ERROR,
  PG_EXTRACT_FORMAT,
  PG_DATE_TRUNC_FORMAT,
  PG_EXPR_TYPE,
};
