/**
 * Global Secondary Index dataset lifecycle and physical representation manager.
 * Owns index dataset schema generation (__idx_<tableName>_<indexName>),
 * composite primary-key layout, duplicate non-unique entry coexistence,
 * and entry-to-partition routing via compareRoutingKeys.
 *
 * Requirements: Stage C2 (RM-0.3-qs-non-unique-gsi).
 */

import {compareRoutingKeys} from '../partition/split-key-comparator.js';
import {
  BASE_PARTITION_ID_COLUMN,
  BASE_PK_COLUMN_PREFIX,
  GLOBAL_INDEX_DATASET_PREFIX,
} from './index-constants.js';

export {
  BASE_PARTITION_ID_COLUMN,
  BASE_PK_COLUMN_PREFIX,
};

const LOCAL_STR_ESCAPED_QUOTE = '""';
const LOCAL_STR_TEXT = 'TEXT';
const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_ID = 'id';
const LOCAL_STR_NOT_NULL = ' NOT NULL';
const DDL_PARSE_CHAR = Object.freeze({
  OPEN_PAREN: '(',
  CLOSE_PAREN: ')',
  COMMA: ',',
  DOUBLE_QUOTE: String.fromCharCode(34),
  SINGLE_QUOTE: String.fromCharCode(39),
  BACKTICK: '`',
  SPACE: ' ',
});
const TABLE_PRIMARY_KEY_CLAUSE_RE = /^PRIMARY\s+KEY\s*\((.+)\)$/iu;
const NON_COLUMN_CLAUSE_RE = /^(?:CONSTRAINT|UNIQUE|CHECK|FOREIGN)\b/iu;
const COLUMN_NOT_NULL_RE = /\bNOT\s+NULL\b/iu;
const COLUMN_INLINE_PK_RE = /\bPRIMARY\s+KEY\b/iu;
const COLUMN_CONSTRAINT_TAIL_RE =
  /\b(?:PRIMARY\s+KEY|NOT\s+NULL|NULL|UNIQUE|CHECK|DEFAULT|COLLATE|REFERENCES|GENERATED)\b.*$/iu;
const WHITESPACE_RE = /\s/u;

/**
 * Format the system-managed dataset table name for a global secondary index.
 * @param {string} tableName - Base table name.
 * @param {string} indexName - Index name.
 * @return {string} Dataset name.
 */
export function getGlobalIndexDatasetName(tableName, indexName) {
  return `${GLOBAL_INDEX_DATASET_PREFIX}${tableName}_${indexName}`;
}

/**
 * Format the prefixed column name for a base primary key column in the index dataset.
 * @param {string} pkColumn - Base table primary key column name.
 * @return {string} Prefixed column name.
 */
function getBasePrimaryKeyColumnName(pkColumn) {
  return `${BASE_PK_COLUMN_PREFIX}${pkColumn}`;
}

/**
 * Extract the base primary key column name from its prefixed index dataset column name.
 * @param {string} columnName - Prefixed column name in index dataset.
 * @return {string|null} Original base primary key column name or null.
 */
export function extractBasePrimaryKeyColumnName(columnName) {
  if (typeof columnName === 'string' &&
      columnName.startsWith(BASE_PK_COLUMN_PREFIX)) {
    return columnName.slice(BASE_PK_COLUMN_PREFIX.length);
  }
  return null;
}

/**
 * Safely quote an identifier for SQLite.
 * @param {string} identifier
 * @return {string} Quoted identifier.
 */
function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, LOCAL_STR_ESCAPED_QUOTE)}"`;
}

/**
 * Build the schema descriptor for a global secondary index dataset.
 * The primary key is the composite tuple (c_1, ..., c_k, __base_pk_1, ..., __base_pk_m).
 * @param {Object} options
 * @param {string} options.tableName - Base table name.
 * @param {string} options.indexName - Index name.
 * @param {string[]} options.columnNames - Indexed column names.
 * @param {string[]} options.basePrimaryKeyColumns - Base table primary key columns.
 * @param {Object} [options.columnTypes={}] - Column type map.
 * @return {Object} Schema descriptor.
 */
export function buildIndexDatasetSchema(options) {
  const {
    tableName,
    indexName,
    columnNames,
    basePrimaryKeyColumns,
    columnTypes = {},
  } = options;

  const datasetName = getGlobalIndexDatasetName(tableName, indexName);
  const basePkColumns = Array.isArray(basePrimaryKeyColumns) &&
    basePrimaryKeyColumns.length > 0 ?
    basePrimaryKeyColumns :
    [LOCAL_STR_ID];

  const columns = [];
  for (const col of columnNames) {
    columns.push({
      name: col,
      type: columnTypes[col] || LOCAL_STR_TEXT,
      notNull: false,
    });
  }
  for (const pkCol of basePkColumns) {
    columns.push({
      name: getBasePrimaryKeyColumnName(pkCol),
      type: columnTypes[pkCol] || LOCAL_STR_TEXT,
      notNull: true,
    });
  }
  columns.push({
    name: BASE_PARTITION_ID_COLUMN,
    type: LOCAL_STR_TEXT,
    notNull: true,
  });

  const primaryKey = [
    ...columnNames,
    ...basePkColumns.map((pk) => getBasePrimaryKeyColumnName(pk)),
  ];

  return {
    tableName: datasetName,
    baseTableName: tableName,
    indexName,
    columnNames: [...columnNames],
    basePrimaryKeyColumns: [...basePkColumns],
    partitionKey: columnNames[0],
    primaryKey,
    columns,
    tableConstraints: [],
  };
}

/**
 * Generate CREATE TABLE DDL SQL for the global secondary index dataset.
 * @param {Object} schema - Schema descriptor from buildIndexDatasetSchema.
 * @return {string} SQL DDL string.
 */
export function generateCreateIndexDatasetSql(schema) {
  const columnDefs = schema.columns.map((col) => {
    const nullClause = col.notNull ? LOCAL_STR_NOT_NULL : '';
    return `${quoteIdentifier(col.name)} ${col.type}${nullClause}`;
  });

  const pkClause = `PRIMARY KEY (${schema.primaryKey.map(quoteIdentifier).join(LOCAL_STR_COMMA_SPACE)})`;
  columnDefs.push(pkClause);

  return `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(schema.tableName)} (${columnDefs.join(LOCAL_STR_COMMA_SPACE)})`;
}

/**
 * Generate DROP TABLE DDL SQL for the global secondary index dataset.
 * @param {string} tableName - Base table name.
 * @param {string} indexName - Index name.
 * @return {string} SQL DDL string.
 */
export function generateDropIndexDatasetSql(tableName, indexName) {
  const datasetName = getGlobalIndexDatasetName(tableName, indexName);
  return `DROP TABLE IF EXISTS ${quoteIdentifier(datasetName)}`;
}

/**
 * Build a physical index entry row object from a base table row image.
 * @param {Object} baseRow - Row from base table.
 * @param {Object} context
 * @param {string[]} context.columnNames - Indexed column names.
 * @param {string[]} context.basePrimaryKeyColumns - Base table PK column names.
 * @param {string} context.basePartitionId - ID of base partition containing row.
 * @return {Object} Index entry row.
 */
export function buildIndexEntry(baseRow, context) {
  const {columnNames, basePrimaryKeyColumns, basePartitionId} = context;
  const entry = {};

  for (const col of columnNames) {
    entry[col] = baseRow[col] !== undefined ? baseRow[col] : null;
  }
  for (const pkCol of basePrimaryKeyColumns) {
    entry[getBasePrimaryKeyColumnName(pkCol)] = baseRow[pkCol];
  }
  entry[BASE_PARTITION_ID_COLUMN] = basePartitionId;

  return entry;
}

/**
 * Check whether a routing key falls inside a partition's [start, end) range.
 * @param {*} key - Key to check.
 * @param {Object} partition - Partition descriptor with key start/end.
 * @return {boolean} True if key falls in partition.
 */
function isKeyInIndexPartition(key, partition) {
  const start = partition.partition_key_start !== undefined ?
    partition.partition_key_start :
    partition.partitionKeyStart;
  const end = partition.partition_key_end !== undefined ?
    partition.partition_key_end :
    partition.partitionKeyEnd;

  if (start !== null && start !== undefined) {
    if (compareRoutingKeys(key, start) < 0) {
      return false;
    }
  }
  if (end !== null && end !== undefined) {
    if (compareRoutingKeys(key, end) >= 0) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve the target index partition for an index entry using compareRoutingKeys.
 * Routes by the leading indexed column.
 * @param {Object} entry - Index entry.
 * @param {Object[]} indexPartitions - Partitions of the index dataset.
 * @param {string} leadingColumnName - Leading indexed column name.
 * @return {Object|null} Matching partition or null.
 */
export function resolveIndexPartitionForEntry(
  entry,
  indexPartitions,
  leadingColumnName,
) {
  if (!Array.isArray(indexPartitions) || indexPartitions.length === 0) {
    return null;
  }
  if (indexPartitions.length === 1) {
    return indexPartitions[0];
  }

  const keyValue = entry[leadingColumnName];
  for (const partition of indexPartitions) {
    if (isKeyInIndexPartition(keyValue, partition)) {
      return partition;
    }
  }

  return null;
}

/**
 * Manager class for global index dataset lifecycle and operations.
 */
export class GlobalIndexDatasetManager {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.getIndexPartitions]
   */
  constructor(options = {}) {
    this.partitionsByIndex = new Map();
    if (typeof options.getIndexPartitions === 'function') {
      this.getIndexPartitions = options.getIndexPartitions;
    }
  }

  /**
   * Register partitions for an index name.
   * @param {string} indexName
   * @param {Object[]} partitions
   */
  registerIndexPartitions(indexName, partitions) {
    this.partitionsByIndex.set(indexName, Array.isArray(partitions) ? [...partitions] : []);
  }

  /**
   * Get partitions for an index name.
   * @param {string} indexName
   * @return {Object[]}
   */
  getIndexPartitions(indexName) {
    return this.partitionsByIndex.get(indexName) || [];
  }

  /**
   * Create index dataset table on a database handle.
   * @param {Object} db - SQLite database handle.
   * @param {Object} options - Options for buildIndexDatasetSchema.
   * @return {Object} Schema descriptor.
   */
  createIndexDataset(db, options) {
    const schema = buildIndexDatasetSchema(options);
    const ddl = generateCreateIndexDatasetSql(schema);
    db.exec(ddl);
    return schema;
  }

  /**
   * Drop index dataset table from a database handle.
   * @param {Object} db - SQLite database handle.
   * @param {string} tableName - Base table name.
   * @param {string} indexName - Index name.
   */
  dropIndexDataset(db, tableName, indexName) {
    const ddl = generateDropIndexDatasetSql(tableName, indexName);
    db.exec(ddl);
  }

  /**
   * Resolve target index partition for an index entry.
   * @param {Object} entry - Index entry.
   * @param {string} indexName - Index name.
   * @param {string} leadingColumnName - Leading column.
   * @return {Object|null} Matching partition or null.
   */
  resolveIndexPartition(entry, indexName, leadingColumnName) {
    const partitions = this.getIndexPartitions(indexName);
    return resolveIndexPartitionForEntry(entry, partitions, leadingColumnName);
  }
}

function advanceQuotedScanner(text, index, quoteChar) {
  let cursor = index + 1;
  while (cursor < text.length) {
    if (text[cursor] === quoteChar) {
      if (text[cursor + 1] === quoteChar) {
        cursor += 2;
        continue;
      }
      return cursor + 1;
    }
    cursor += 1;
  }
  return cursor;
}

function splitTopLevelCommaClauses(body) {
  const clauses = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === DDL_PARSE_CHAR.DOUBLE_QUOTE ||
        ch === DDL_PARSE_CHAR.SINGLE_QUOTE ||
        ch === DDL_PARSE_CHAR.BACKTICK) {
      i = advanceQuotedScanner(body, i, ch) - 1;
      continue;
    }
    if (ch === DDL_PARSE_CHAR.OPEN_PAREN) depth += 1;
    else if (ch === DDL_PARSE_CHAR.CLOSE_PAREN && depth > 0) depth -= 1;
    else if (ch === DDL_PARSE_CHAR.COMMA && depth === 0) {
      const segment = body.slice(start, i).trim();
      if (segment.length > 0) clauses.push(segment);
      start = i + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail.length > 0) clauses.push(tail);
  return clauses;
}

function unquoteIdentifierToken(token) {
  const trimmed = String(token || '').trim();
  if (trimmed.length >= 2 &&
      trimmed[0] === DDL_PARSE_CHAR.DOUBLE_QUOTE &&
      trimmed[trimmed.length - 1] === DDL_PARSE_CHAR.DOUBLE_QUOTE) {
    return trimmed.slice(1, -1).replaceAll(LOCAL_STR_ESCAPED_QUOTE, DDL_PARSE_CHAR.DOUBLE_QUOTE);
  }
  if (trimmed.length >= 2 &&
      trimmed[0] === DDL_PARSE_CHAR.BACKTICK &&
      trimmed[trimmed.length - 1] === DDL_PARSE_CHAR.BACKTICK) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readLeadingIdentifier(clause) {
  const first = clause[0];
  if (first === DDL_PARSE_CHAR.DOUBLE_QUOTE || first === DDL_PARSE_CHAR.BACKTICK) {
    const end = advanceQuotedScanner(clause, 0, first);
    return {
      name: unquoteIdentifierToken(clause.slice(0, end)),
      rest: clause.slice(end).trim(),
    };
  }
  let end = 0;
  while (end < clause.length && !WHITESPACE_RE.test(clause[end])) {
    end += 1;
  }
  return {
    name: clause.slice(0, end),
    rest: clause.slice(end).trim(),
  };
}

function parseColumnClause(clause) {
  const {name, rest} = readLeadingIdentifier(clause);
  if (!name) return null;
  const notNull = COLUMN_NOT_NULL_RE.test(rest);
  const inlinePk = COLUMN_INLINE_PK_RE.test(rest);
  const typeText = rest.replace(COLUMN_CONSTRAINT_TAIL_RE, '').trim().toUpperCase();
  return {
    column: {
      name,
      type: typeText || LOCAL_STR_TEXT,
      notNull,
    },
    inlinePk,
  };
}

/**
 * Inspect an existing physical index dataset table on a local SQLite database handle.
 * @param {Object} db - better-sqlite3 database handle.
 * @param {string} datasetName - Index dataset table name.
 * @return {{exists: boolean, columns: Array<Object>, primaryKey: string[]}}
 */
export function inspectLocalDatasetSchema(db, datasetName) {
  const cols = db.prepare(`PRAGMA table_info(${quoteIdentifier(datasetName)})`).all();
  if (!Array.isArray(cols) || cols.length === 0) {
    return {exists: false, columns: [], primaryKey: []};
  }
  const pkEntries = [];
  const columns = cols.map((col) => {
    if (Number(col.pk) > 0) {
      pkEntries.push({name: col.name, pkOrder: Number(col.pk)});
    }
    return {
      name: col.name,
      type: String(col.type || LOCAL_STR_TEXT).toUpperCase(),
      notNull: Number(col.notnull) === 1,
    };
  });
  pkEntries.sort((a, b) => a.pkOrder - b.pkOrder);
  return {
    exists: true,
    columns,
    primaryKey: pkEntries.map((entry) => entry.name),
  };
}

/**
 * Parse a SQLite CREATE TABLE DDL string (from sqlite_master.sql) into structural
 * column and primary-key descriptors comparable with buildIndexDatasetSchema.
 * @param {string} ddlSql - Stored CREATE TABLE SQL.
 * @return {{exists: boolean, columns: Array<Object>, primaryKey: string[]}|null}
 */
export function parseDatasetTableDdlSchema(ddlSql) {
  if (typeof ddlSql !== 'string' || ddlSql.trim().length === 0) {
    return {exists: false, columns: [], primaryKey: []};
  }
  const openIdx = ddlSql.indexOf(DDL_PARSE_CHAR.OPEN_PAREN);
  const closeIdx = ddlSql.lastIndexOf(DDL_PARSE_CHAR.CLOSE_PAREN);
  if (openIdx < 0 || closeIdx <= openIdx) {
    return null;
  }
  const clauses = splitTopLevelCommaClauses(ddlSql.slice(openIdx + 1, closeIdx));
  const columns = [];
  const inlinePrimaryKey = [];
  let tablePrimaryKey = [];
  for (const clause of clauses) {
    const pkMatch = clause.match(TABLE_PRIMARY_KEY_CLAUSE_RE);
    if (pkMatch) {
      tablePrimaryKey = splitTopLevelCommaClauses(pkMatch[1]).map(unquoteIdentifierToken);
      continue;
    }
    if (NON_COLUMN_CLAUSE_RE.test(clause)) {
      continue;
    }
    const parsed = parseColumnClause(clause);
    if (parsed) {
      columns.push(parsed.column);
      if (parsed.inlinePk) inlinePrimaryKey.push(parsed.column.name);
    }
  }
  return {
    exists: true,
    columns,
    primaryKey: tablePrimaryKey.length > 0 ? tablePrimaryKey : inlinePrimaryKey,
  };
}

function doesDatasetColumnMatch(actualCol, expectedCol) {
  if (!actualCol || !expectedCol || actualCol.name !== expectedCol.name) {
    return false;
  }
  const actualType = String(actualCol.type || LOCAL_STR_TEXT).toUpperCase();
  const expectedType = String(expectedCol.type || LOCAL_STR_TEXT).toUpperCase();
  return actualType === expectedType &&
    Boolean(actualCol.notNull) === Boolean(expectedCol.notNull);
}

function doesPrimaryKeyMatch(actualPk = [], expectedPk = []) {
  return actualPk.length === expectedPk.length &&
    expectedPk.every((pkCol, idx) => actualPk[idx] === pkCol);
}

/**
 * Compare an observed physical dataset schema against an expected schema descriptor.
 * @param {Object|null} actualSchema - Schema from inspectLocalDatasetSchema or parseDatasetTableDdlSchema.
 * @param {Object|null} expectedSchema - Schema from buildIndexDatasetSchema.
 * @return {boolean} True when columns, types, nullability, and primary key order match.
 */
export function doesDatasetSchemaMatch(actualSchema, expectedSchema) {
  if (actualSchema?.exists !== true || !expectedSchema) {
    return false;
  }
  const actualCols = actualSchema.columns || [];
  const expectedCols = expectedSchema.columns || [];
  if (actualCols.length !== expectedCols.length) {
    return false;
  }
  const columnsMatch = expectedCols.every(
    (expectedCol, idx) => doesDatasetColumnMatch(actualCols[idx], expectedCol),
  );
  return columnsMatch &&
    doesPrimaryKeyMatch(actualSchema.primaryKey, expectedSchema.primaryKey);
}
