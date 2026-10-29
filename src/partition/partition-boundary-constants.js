/**
 * Canonical constants for partition boundary representation.
 */

export const PARTITION_BOUNDARY_KEY_TYPE = Object.freeze({
  INTEGER: 'INTEGER',
  REAL: 'REAL',
  TEXT: 'TEXT',
  BLOB: 'BLOB',
  COMPOSITE: 'COMPOSITE',
});

export const SQL_TYPE_NAME = Object.freeze({
  INTEGER: 'INTEGER',
  INT: 'INT',
  BIGINT: 'BIGINT',
  SMALLINT: 'SMALLINT',
  TINYINT: 'TINYINT',
  REAL: 'REAL',
  FLOAT: 'FLOAT',
  DOUBLE: 'DOUBLE',
  NUMERIC: 'NUMERIC',
  DECIMAL: 'DECIMAL',
  TEXT: 'TEXT',
  VARCHAR: 'VARCHAR',
  CHAR: 'CHAR',
  CLOB: 'CLOB',
  BLOB: 'BLOB',
  COMPOSITE: 'COMPOSITE',
});

export const BOUNDARY_ENCODING = Object.freeze({
  BASE64: 'base64',
});
