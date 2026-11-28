// SQL parsing helpers for CDC event generation.
import {STRING} from '../constants/index.js';
import {
  PARTITION_SERVICE_ERROR_MSG, PARTITION_SERVICE_LOG_MSG, PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_SQL_FRAGMENT, PARTITION_SERVICE_VALUE,
} from './partition-service-constants.js';
import {
  PARTITION_STATEMENT_DETERMINISTIC_WRITE_FUNCTIONS, PARTITION_STATEMENT_TOKEN,
} from './partition-statement-admission-constants.js';
import {asciiLower, lexPartitionStatement} from './partition-statement-admission-lexer.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  getSystemCachePrimaryKeyField, hasSystemCacheKeyDescriptor,
} from '../cache/system-cache-key-descriptor.js';
import {admitCdcRowFetchLog} from './partition-cdc-log-throttle.js';

const CDC_ROW_FETCH_LOG_SUPPRESSED_TABLES = new Set([
  SYSTEM_TABLE_NAME.LOGS, SYSTEM_TABLE_NAME.NODES, SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
]);

const SQL_LEXICAL_TOKEN = Object.freeze({
  BACKTICK: '`', BRACKET_CLOSE: ']', BRACKET_OPEN: '[', DOUBLE_QUOTE: '"', EQUALS: '=',
  FALSE_VALUE: 'FALSE', MASK_IDENT: '_', MASK_SPACE: ' ', SINGLE_QUOTE: '\'', TRUE_VALUE: 'TRUE',
});

const MASKED_LITERAL_TOKEN_TYPES = new Set([
  PARTITION_STATEMENT_TOKEN.STRING, PARTITION_STATEMENT_TOKEN.QUOTED,
  PARTITION_STATEMENT_TOKEN.BLOB,
]);
const QUOTE_DELIMITERS = new Set([
  SQL_LEXICAL_TOKEN.SINGLE_QUOTE, SQL_LEXICAL_TOKEN.DOUBLE_QUOTE,
  SQL_LEXICAL_TOKEN.BACKTICK, SQL_LEXICAL_TOKEN.BRACKET_OPEN,
]);

const SQL_NUMERIC_LITERAL_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const SQL_BOOLEAN_LITERAL_PATTERN = /^(?:TRUE|FALSE)$/i;
const SQL_QUOTED_IDENTIFIER_PATTERN = /^(?:"[\s\S]*"|`[\s\S]*`|\[[\s\S]*\])$/;
const SQL_INSERT_COLUMNS_PREFIX_PATTERN =
  /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+(?:\w+|"[^"]*"|`[^`]*`|\[[^\]]*\])\s*\(/i;
const SQL_VALUES_PREFIX_PATTERN = /^\s*VALUES\s*\(/i;
const SQL_MULTI_TUPLE_CONTINUATION_PATTERN = /^\s*,\s*\(/;
const SQL_SET_CLAUSE_PATTERN = /\bSET\s+/i;
const SQL_WHERE_CLAUSE_PATTERN = /\bWHERE\s+/i;
const SQL_AND_CONJUNCT_PATTERN = /\bAND\b/gi;
const SQL_ASSIGNMENT_LHS_PATTERN = /^(\w+)\s*=/;
const SQL_SIMPLE_IDENT_PATTERN = /^(\w+)$/;
const SQL_ESCAPED_SINGLE_QUOTE_PATTERN = /''/g;
const SQL_ESCAPED_DOUBLE_QUOTE_PATTERN = /""/g;
const SQL_ESCAPED_BACKTICK_PATTERN = /``/g;

function isMaskedQuoteToken(token) {
  return MASKED_LITERAL_TOKEN_TYPES.has(token.type) ||
    (token.type === PARTITION_STATEMENT_TOKEN.ILLEGAL &&
      QUOTE_DELIMITERS.has(token.text[0]));
}

function maskTokenText(token) {
  if (!isMaskedQuoteToken(token)) return token.text;
  const raw = token.text;
  if (raw.length <= 1) return raw;
  const innerLen = Math.max(0, raw.length - 2);
  return raw[0] + SQL_LEXICAL_TOKEN.MASK_IDENT.repeat(innerLen) + raw[raw.length - 1];
}

function projectLexedSql(sql, transformToken) {
  if (typeof sql !== 'string' || sql.length === 0) return STRING.EMPTY;
  const {tokens} = lexPartitionStatement(sql);
  let result = STRING.EMPTY;
  let cursor = 0;
  for (const token of tokens) {
    if (token.start > cursor) result += SQL_LEXICAL_TOKEN.MASK_SPACE.repeat(token.start - cursor);
    result += transformToken(token);
    cursor = token.start + token.text.length;
  }
  if (cursor < sql.length) result += SQL_LEXICAL_TOKEN.MASK_SPACE.repeat(sql.length - cursor);
  return result;
}

function maskSqlLiteralsAndComments(sql) {
  return projectLexedSql(sql, maskTokenText);
}

function stripSqlComments(sql) {
  return projectLexedSql(sql, (token) => token.text);
}

function isPositionalQuestionParamToken(token) {
  return token.type === PARTITION_STATEMENT_TOKEN.PARAM &&
    token.text.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK);
}

export function countSqlParameterPlaceholders(sql) {
  if (typeof sql !== 'string' || sql.length === 0) return 0;
  return lexPartitionStatement(sql).tokens.filter(isPositionalQuestionParamToken).length;
}

export function hasSqlParameterPlaceholders(sql) {
  if (typeof sql !== 'string' || sql.length === 0) return false;
  return lexPartitionStatement(sql).tokens.some(isPositionalQuestionParamToken);
}

function extractBalancedParens(sql, maskedSql, openParenIndex) {
  let depth = 0;
  for (let i = openParenIndex; i < maskedSql.length; i++) {
    const ch = maskedSql[i];
    if (ch === PARTITION_SERVICE_SQL_FRAGMENT.OPEN_PAREN) depth += 1;
    else if (ch === PARTITION_SERVICE_SQL_FRAGMENT.CLOSE_PAREN) {
      depth -= 1;
      if (depth === 0) {
        return {
          content: sql.slice(openParenIndex + 1, i),
          maskedContent: maskedSql.slice(openParenIndex + 1, i),
          start: openParenIndex, end: i,
        };
      }
    }
  }
  return null;
}

function splitTopLevelSqlList(rawText, maskedText) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < maskedText.length; i++) {
    const ch = maskedText[i];
    if (ch === PARTITION_SERVICE_SQL_FRAGMENT.OPEN_PAREN) depth += 1;
    else if (ch === PARTITION_SERVICE_SQL_FRAGMENT.CLOSE_PAREN) depth -= 1;
    else if (depth === 0 && ch === PARTITION_SERVICE_SQL_FRAGMENT.COMMA) {
      parts.push({raw: rawText.slice(start, i), masked: maskedText.slice(start, i)});
      start = i + 1;
    }
  }
  parts.push({raw: rawText.slice(start), masked: maskedText.slice(start)});
  return parts;
}

function splitSqlByPattern(rawText, maskedText, pattern) {
  const parts = [];
  const regex = new RegExp(pattern.source, pattern.flags);
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(maskedText)) !== null) {
    parts.push({
      raw: rawText.slice(lastIndex, match.index),
      masked: maskedText.slice(lastIndex, match.index),
    });
    lastIndex = match.index + match[0].length;
  }
  parts.push({raw: rawText.slice(lastIndex), masked: maskedText.slice(lastIndex)});
  return parts;
}

function unquoteSqlIdentifier(rawToken) {
  const trimmed = stripSqlComments(rawToken).trim();
  if (trimmed.length < 2) return trimmed;
  if (trimmed.startsWith(SQL_LEXICAL_TOKEN.DOUBLE_QUOTE) &&
      trimmed.endsWith(SQL_LEXICAL_TOKEN.DOUBLE_QUOTE)) {
    return trimmed.slice(1, -1).replace(
      SQL_ESCAPED_DOUBLE_QUOTE_PATTERN, SQL_LEXICAL_TOKEN.DOUBLE_QUOTE,
    );
  }
  if (trimmed.startsWith(SQL_LEXICAL_TOKEN.BACKTICK) &&
      trimmed.endsWith(SQL_LEXICAL_TOKEN.BACKTICK)) {
    return trimmed.slice(1, -1).replace(SQL_ESCAPED_BACKTICK_PATTERN, SQL_LEXICAL_TOKEN.BACKTICK);
  }
  if (trimmed.startsWith(SQL_LEXICAL_TOKEN.BRACKET_OPEN) &&
      trimmed.endsWith(SQL_LEXICAL_TOKEN.BRACKET_CLOSE)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function countUnmatchedClosingParens(maskedText) {
  let openCount = 0;
  let closeCount = 0;
  for (let i = 0; i < maskedText.length; i++) {
    if (maskedText[i] === PARTITION_SERVICE_SQL_FRAGMENT.OPEN_PAREN) openCount += 1;
    else if (maskedText[i] === PARTITION_SERVICE_SQL_FRAGMENT.CLOSE_PAREN) closeCount += 1;
  }
  return Math.max(0, closeCount - openCount);
}

function stripOuterParensOutsideLiterals(rawToken, maskedToken) {
  const leadingMatch = maskedToken.match(/^\s*\(+/);
  const startTrim = leadingMatch ? leadingMatch[0].length : 0;
  const innerRaw = rawToken.slice(startTrim).trimEnd();
  const innerMasked = maskedToken.slice(startTrim).trimEnd();
  const trailingMatch = innerMasked.match(/\)+$/);
  const trailingParensLen = trailingMatch ? trailingMatch[0].length : 0;
  const stripTrailing = Math.min(trailingParensLen, countUnmatchedClosingParens(innerMasked));
  const endTrim = innerRaw.length - stripTrailing;
  if (endTrim <= 0) return {raw: STRING.EMPTY, masked: STRING.EMPTY};
  return {
    raw: innerRaw.slice(0, endTrim).trim(),
    masked: innerMasked.slice(0, endTrim).trim(),
  };
}

function isSqlLiteralToken(token) {
  if (!token) return false;
  if (token.toUpperCase() === PARTITION_SERVICE_SQL_FRAGMENT.NULL_VALUE ||
      SQL_BOOLEAN_LITERAL_PATTERN.test(token) ||
      SQL_NUMERIC_LITERAL_PATTERN.test(token)) {
    return true;
  }
  const first = token[0];
  if (token.length < 2 || (first !== SQL_LEXICAL_TOKEN.SINGLE_QUOTE &&
      first !== SQL_LEXICAL_TOKEN.DOUBLE_QUOTE)) {
    return false;
  }
  const {tokens} = lexPartitionStatement(token);
  return tokens.length === 1 && (tokens[0].type === PARTITION_STATEMENT_TOKEN.STRING ||
    tokens[0].type === PARTITION_STATEMENT_TOKEN.QUOTED);
}

function parseAssignmentParts(rawPart, maskedPart) {
  const eqIndex = maskedPart.indexOf(SQL_LEXICAL_TOKEN.EQUALS);
  if (eqIndex === -1) return null;
  const colRaw = rawPart.slice(0, eqIndex);
  const colMasked = maskedPart.slice(0, eqIndex).trim();
  const column = SQL_QUOTED_IDENTIFIER_PATTERN.test(stripSqlComments(colRaw).trim()) ?
    unquoteSqlIdentifier(colRaw) :
    (colMasked.match(SQL_SIMPLE_IDENT_PATTERN)?.[1] ?? null);
  if (!column) return null;
  return {column, rhsRaw: rawPart.slice(eqIndex + 1), rhsMasked: maskedPart.slice(eqIndex + 1)};
}

function extractInsertSyntaxParts(sql) {
  const maskedSql = maskSqlLiteralsAndComments(sql);
  const columnsPrefixMatch = SQL_INSERT_COLUMNS_PREFIX_PATTERN.exec(maskedSql);
  if (!columnsPrefixMatch) return null;
  const columnsParen = extractBalancedParens(
    sql, maskedSql, columnsPrefixMatch.index + columnsPrefixMatch[0].length - 1,
  );
  if (!columnsParen) return null;
  const columns = splitTopLevelSqlList(columnsParen.content, columnsParen.maskedContent)
    .map((part) => unquoteSqlIdentifier(part.raw))
    .filter(Boolean);
  if (columns.length === 0) return null;

  const afterColumnsMasked = maskedSql.slice(columnsParen.end + 1);
  const valuesPrefixMatch = SQL_VALUES_PREFIX_PATTERN.exec(afterColumnsMasked);
  const valuesTuples = [];
  if (valuesPrefixMatch) {
    let openValuesParen =
      columnsParen.end + 1 + valuesPrefixMatch.index + valuesPrefixMatch[0].length - 1;
    while (openValuesParen >= 0 && openValuesParen < maskedSql.length) {
      const tupleParen = extractBalancedParens(sql, maskedSql, openValuesParen);
      if (!tupleParen) return null;
      valuesTuples.push(tupleParen);
      const restMasked = maskedSql.slice(tupleParen.end + 1);
      const nextMatch = SQL_MULTI_TUPLE_CONTINUATION_PATTERN.exec(restMasked);
      if (!nextMatch) break;
      openValuesParen = tupleParen.end + 1 + nextMatch.index + nextMatch[0].length - 1;
    }
  }
  const valuesParen = valuesTuples[0] ?? null;
  const hasMultiRowValues = valuesTuples.length > 1;
  return {columns, valuesParen, valuesTuples, hasMultiRowValues};
}

function extractUpdateClauses(sql) {
  const maskedSql = maskSqlLiteralsAndComments(sql);
  const setMatch = SQL_SET_CLAUSE_PATTERN.exec(maskedSql);
  if (!setMatch) return null;
  const setStart = setMatch.index + setMatch[0].length;
  const whereMatch = SQL_WHERE_CLAUSE_PATTERN.exec(maskedSql.slice(setStart));
  const setEnd = whereMatch ? setStart + whereMatch.index : sql.length;
  const whereStart = whereMatch ? setStart + whereMatch.index + whereMatch[0].length : null;
  return {
    setRaw: sql.slice(setStart, setEnd),
    setMasked: maskedSql.slice(setStart, setEnd),
    whereRaw: whereStart !== null ? sql.slice(whereStart) : null,
    whereMasked: whereStart !== null ? maskedSql.slice(whereStart) : null,
  };
}

function extractWhereClauseFromSql(sql) {
  const maskedSql = maskSqlLiteralsAndComments(sql);
  const whereMatch = SQL_WHERE_CLAUSE_PATTERN.exec(maskedSql);
  if (!whereMatch) return null;
  const whereStart = whereMatch.index + whereMatch[0].length;
  return {whereRaw: sql.slice(whereStart), whereMasked: maskedSql.slice(whereStart)};
}

/**
 * Extract column names from a simple conjunctive WHERE clause.
 * Supports nested wrapping parentheses around equality predicates.
 * @param {string} whereContent - WHERE clause content without the WHERE keyword.
 * @return {Array<string>} Extracted column names.
 */
export function extractConjunctiveWhereColumns(whereContent) {
  if (!whereContent) return [];
  const trimmed = whereContent.trim();
  const masked = maskSqlLiteralsAndComments(trimmed);
  return splitSqlByPattern(trimmed, masked, SQL_AND_CONJUNCT_PATTERN)
    .map(({raw, masked: partMasked}) => {
      const clean = stripOuterParensOutsideLiterals(raw, partMasked);
      return clean.masked.match(SQL_ASSIGNMENT_LHS_PATTERN)?.[1] ?? null;
    })
    .filter(Boolean);
}

/**
 * Extract WHERE clause column names from an UPDATE SQL statement outside
 * literals and comments.
 * @param {string} sql - UPDATE SQL statement.
 * @return {Array<string>} Ordered WHERE column names.
 */
export function extractUpdateWhereColumns(sql) {
  if (typeof sql !== 'string' || sql.length === 0) return [];
  const clauses = extractUpdateClauses(sql);
  return clauses?.whereRaw ? extractConjunctiveWhereColumns(clauses.whereRaw) : [];
}

function admitCdcFetch(message, tableName) {
  return !CDC_ROW_FETCH_LOG_SUPPRESSED_TABLES.has(tableName) ?
    admitCdcRowFetchLog(`${message}:${tableName}`) :
    null;
}

/**
 * Parse a single value token from a SQL VALUES clause.
 * @param {string} val - Value string.
 * @return {*} Parsed value.
 */
export function parseValue(val) {
  const trimmed = typeof val === 'string' ? val.trim() : String(val ?? STRING.EMPTY);
  const upper = trimmed.toUpperCase();
  if (upper === PARTITION_SERVICE_SQL_FRAGMENT.NULL_VALUE) return null;
  if (upper === SQL_LEXICAL_TOKEN.TRUE_VALUE) return true;
  if (upper === SQL_LEXICAL_TOKEN.FALSE_VALUE) return false;
  if (trimmed.length >= 2 &&
      trimmed.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) &&
      trimmed.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE)) {
    return trimmed.slice(1, -1)
      .replace(SQL_ESCAPED_SINGLE_QUOTE_PATTERN, PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE);
  }
  if (trimmed.length >= 2 &&
      trimmed.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) &&
      trimmed.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE)) {
    return trimmed.slice(1, -1)
      .replace(SQL_ESCAPED_DOUBLE_QUOTE_PATTERN, PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE);
  }
  if (trimmed.length > 0 && !isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

/**
 * Parse values from a SQL VALUES clause string.
 * Handles quoted strings, escaped quotes, comments, numbers, and NULL.
 * @param {string} valuesStr - Values string like "'val1', 123, NULL".
 * @return {Array} Parsed values.
 */
export function parseValuesFromSQL(valuesStr) {
  if (typeof valuesStr !== 'string' || valuesStr.trim().length === 0) return [];
  const masked = maskSqlLiteralsAndComments(valuesStr);
  return splitTopLevelSqlList(valuesStr, masked)
    .map((part) => stripSqlComments(part.raw).trim())
    .filter((token) => token.length > 0)
    .map((token) => parseValue(token));
}

function resolvePrimaryKeyLookupColumn(tableName, columns, row) {
  if (hasSystemCacheKeyDescriptor(tableName)) {
    const pkField = getSystemCachePrimaryKeyField(tableName);
    if (Object.prototype.hasOwnProperty.call(row, pkField)) return pkField;
  }
  return columns[0];
}

function hydrateInsertedRowFromDb(tableName, pkColumn, pkValue, rowData, db, logger) {
  if (!db || !pkColumn || pkValue === null || pkValue === undefined) return rowData;
  try {
    const row = db.prepare(`SELECT * FROM ${tableName} WHERE ${pkColumn} = ?`).get(pkValue);
    if (row) {
      const suppressed = admitCdcFetch(PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW, tableName);
      if (suppressed !== null) {
        logger?.info?.(PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW, {
          tableName, rowKeys: Object.keys(row), suppressedSinceLastEmit: suppressed,
        });
      }
      return row;
    }
  } catch (err) {
    logger?.warn?.(
      PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_INSERT_FAILED, {tableName, error: err.message},
    );
    throw err;
  }
  return rowData;
}

function logInsertSyntaxFailure(sql, hasPlaceholders, logger) {
  const msg = hasPlaceholders ?
    PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED :
    PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_INSERT_FAILED;
  logger?.warn?.(msg, {sql: sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT)});
}

function logTupleArityFailure(columnsCount, valuePartsCount, paramsCount, hasPlaceholders, logger) {
  if (hasPlaceholders) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
      columns: columnsCount, params: paramsCount,
    });
    return;
  }
  logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_INSERT_MISMATCH, {
    columns: columnsCount, values: valuePartsCount,
  });
}

function bindTupleFromParts(columns, tupleParen, params, startIndex, hasPlaceholders, logger, db) {
  const valueParts = splitTopLevelSqlList(tupleParen.content, tupleParen.maskedContent);
  if (valueParts.length !== columns.length) {
    logTupleArityFailure(
      columns.length, valueParts.length, params.length, hasPlaceholders, logger,
    );
    return null;
  }
  const row = {};
  let paramIndex = startIndex;
  for (let i = 0; i < columns.length; i++) {
    const slot = resolveBoundOrLiteralSlot(
      valueParts[i].raw, valueParts[i].masked, params, paramIndex, db,
    );
    if (slot.hasValue) row[columns[i]] = slot.value;
    paramIndex += slot.paramCount;
  }
  return {row, nextParamIndex: paramIndex};
}

function parseInsertTuples(parts, params, hasPlaceholders, logger, db) {
  const {columns, valuesTuples} = parts;
  const rows = [];
  let paramIndex = 0;
  for (const tupleParen of valuesTuples) {
    const bound = bindTupleFromParts(
      columns, tupleParen, params, paramIndex, hasPlaceholders, logger, db,
    );
    if (!bound) return [];
    rows.push(bound.row);
    paramIndex = bound.nextParamIndex;
  }
  if (hasPlaceholders && paramIndex !== params.length) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
      columns: paramIndex, params: params.length,
    });
    return [];
  }
  return rows;
}

/**
 * Extract all inserted/upserted rows from a single- or multi-row INSERT/UPSERT SQL
 * statement, hydrating each stored row from SQLite when `db` is available.
 * @param {string} sql - INSERT / INSERT OR REPLACE SQL statement.
 * @param {Array} params - Bound parameter values.
 * @param {string} tableName - Table name.
 * @param {Object|null} db - better-sqlite3 database handle.
 * @param {Object|null} logger - Logger instance.
 * @return {Array<Object>} Extracted row objects.
 */
export function extractInsertRowsFromSQL(sql, params, tableName, db, logger) {
  if (typeof sql !== 'string') return [];
  const normalizedParams = Array.isArray(params) ? params : [];
  const hasPlaceholders = hasSqlParameterPlaceholders(sql);
  if (hasPlaceholders && normalizedParams.length === 0) return [];
  const parts = extractInsertSyntaxParts(sql);
  if (!parts || parts.valuesTuples.length === 0) {
    logInsertSyntaxFailure(sql, hasPlaceholders, logger);
    return [];
  }
  const rows = parseInsertTuples(parts, normalizedParams, hasPlaceholders, logger, db);
  return rows.map((row) => {
    const pkColumn = resolvePrimaryKeyLookupColumn(tableName, parts.columns, row);
    return hydrateInsertedRowFromDb(tableName, pkColumn, row[pkColumn], row, db, logger);
  });
}

export function extractInsertDataFromSQL(sql, tableName, db, logger) {
  if (typeof sql !== 'string' || hasSqlParameterPlaceholders(sql)) return {};
  const parts = extractInsertSyntaxParts(sql);
  if (!parts || !parts.valuesParen || parts.hasMultiRowValues) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_INSERT_FAILED, {
      sql: sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT),
    });
    return {};
  }
  return extractInsertRowsFromSQL(sql, [], tableName, db, logger)[0] ?? {};
}

function extractFirstLiteralWhereEquality(sql, db = null) {
  const whereClause = extractWhereClauseFromSql(sql);
  if (!whereClause) return null;
  const conjuncts = splitSqlByPattern(
    whereClause.whereRaw, whereClause.whereMasked, SQL_AND_CONJUNCT_PATTERN,
  );
  for (const {raw, masked} of conjuncts) {
    const clean = stripOuterParensOutsideLiterals(raw, masked);
    const assignment = parseAssignmentParts(clean.raw, clean.masked);
    if (!assignment) continue;
    const slot = resolveBoundOrLiteralSlot(assignment.rhsRaw, assignment.rhsMasked, [], 0, db);
    if (slot.hasValue) return {keyColumn: assignment.column, keyValue: slot.value};
  }
  return null;
}

export function extractUpdateDataFromSQL(sql, tableName, db, logger) {
  if (typeof sql !== 'string' || hasSqlParameterPlaceholders(sql)) return {};
  const equality = extractFirstLiteralWhereEquality(sql, db);
  if (!equality) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_UPDATE_WHERE_FAILED, {
      sql: sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT),
    });
    return {};
  }
  const {keyColumn, keyValue} = equality;
  const fetchMsg = PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW;
  const fetchingSuppressed = admitCdcFetch(fetchMsg, tableName);
  if (fetchingSuppressed !== null) {
    logger?.info?.(fetchMsg, {
      tableName, keyColumn, keyValue, suppressedSinceLastEmit: fetchingSuppressed,
    });
  }
  if (!db) return {[keyColumn]: keyValue};
  try {
    const row = db.prepare(`SELECT * FROM ${tableName} WHERE ${keyColumn} = ?`).get(keyValue);
    if (row) {
      const fetchedMsg = PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW;
      const fetchedSuppressed = admitCdcFetch(fetchedMsg, tableName);
      if (fetchedSuppressed !== null) {
        logger?.info?.(fetchedMsg, {
          tableName, rowKeys: Object.keys(row), suppressedSinceLastEmit: fetchedSuppressed,
        });
      }
      return row;
    }
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_NO_ROW_UPDATE, {tableName, keyColumn, keyValue});
  } catch (err) {
    logger?.warn?.(
      PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_UPDATE_FAILED, {tableName, error: err.message},
    );
    throw err;
  }
  return {};
}

export function extractDeleteDataFromSQL(sql, logger, db = null) {
  if (typeof sql !== 'string' || hasSqlParameterPlaceholders(sql)) return {};
  const equality = extractFirstLiteralWhereEquality(sql, db);
  if (equality) return {[equality.keyColumn]: equality.keyValue};
  logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_DELETE_WHERE_FAILED, {
    sql: sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT),
  });
  return {};
}

const SCALAR_LITERAL_WORDS = new Set([
  PARTITION_SERVICE_SQL_FRAGMENT.NULL_VALUE,
  SQL_LEXICAL_TOKEN.TRUE_VALUE,
  SQL_LEXICAL_TOKEN.FALSE_VALUE,
]);

function isEvaluatableScalarTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return false;
  return tokens.every((token, idx) => {
    if (token.type === PARTITION_STATEMENT_TOKEN.ILLEGAL ||
        token.type === PARTITION_STATEMENT_TOKEN.QUOTED) {
      return false;
    }
    if (token.type === PARTITION_STATEMENT_TOKEN.PARAM) {
      return isPositionalQuestionParamToken(token);
    }
    if (token.type !== PARTITION_STATEMENT_TOKEN.WORD || SCALAR_LITERAL_WORDS.has(token.upper)) {
      return true;
    }
    return tokens[idx + 1]?.text === PARTITION_SERVICE_SQL_FRAGMENT.OPEN_PAREN &&
      PARTITION_STATEMENT_DETERMINISTIC_WRITE_FUNCTIONS.has(asciiLower(token.text));
  });
}

function unresolvedSlot(paramCount) {
  return {hasValue: false, value: undefined, paramCount};
}

function resolveBoundOrLiteralSlot(rhsRaw, rhsMasked, params, paramIndex, db) {
  const paramCount = countSqlParameterPlaceholders(rhsRaw);
  if (paramIndex + paramCount > params.length) return unresolvedSlot(paramCount);
  if (paramCount === 1 &&
      stripSqlComments(rhsMasked).trim() === PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK) {
    return {hasValue: true, value: params[paramIndex], paramCount};
  }
  if (paramCount === 0) {
    const literalToken = stripSqlComments(rhsRaw).trim();
    if (isSqlLiteralToken(literalToken)) {
      return {hasValue: true, value: parseValue(literalToken), paramCount};
    }
  }
  if (!db) return unresolvedSlot(paramCount);
  const {tokens} = lexPartitionStatement(rhsRaw);
  if (!isEvaluatableScalarTokens(tokens)) return unresolvedSlot(paramCount);
  const rhsParams = params.slice(paramIndex, paramIndex + paramCount);
  const row = db.prepare(`SELECT (${rhsRaw}) AS val`).get(...rhsParams);
  return {hasValue: row !== undefined, value: row?.val, paramCount};
}

function applyWhereConjunctsFromParams({
  whereRaw, whereMasked, params, startParamIndex, data, preserveExisting = false, db,
}) {
  let paramIndex = startParamIndex;
  const conjuncts = splitSqlByPattern(whereRaw, whereMasked, SQL_AND_CONJUNCT_PATTERN);
  for (const {raw, masked} of conjuncts) {
    const clean = stripOuterParensOutsideLiterals(raw, masked);
    const assignment = parseAssignmentParts(clean.raw, clean.masked);
    if (!assignment) {
      paramIndex += countSqlParameterPlaceholders(clean.raw);
      continue;
    }
    const slot = resolveBoundOrLiteralSlot(
      assignment.rhsRaw, assignment.rhsMasked, params, paramIndex, db,
    );
    paramIndex += slot.paramCount;
    const shouldWrite = !preserveExisting ||
      !Object.prototype.hasOwnProperty.call(data, assignment.column);
    if (shouldWrite && slot.hasValue) data[assignment.column] = slot.value;
  }
  return paramIndex;
}

function bindSingleInsertData(parts, params, logger, db) {
  const {columns, valuesParen} = parts;
  if (valuesParen) {
    const bound = bindTupleFromParts(columns, valuesParen, params, 0, true, logger, db);
    if (!bound) return null;
    if (bound.nextParamIndex !== params.length) {
      logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
        columns: bound.nextParamIndex, params: params.length,
      });
      return null;
    }
    return bound.row;
  }
  if (columns.length !== params.length) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
      columns: columns.length, params: params.length,
    });
    return null;
  }
  const data = {};
  for (let i = 0; i < columns.length; i++) data[columns[i]] = params[i];
  return data;
}

function extractInsertFromParams(sql, params, tableName, logger, db) {
  const parts = extractInsertSyntaxParts(sql);
  if (!parts) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED, {
      sql: sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT),
    });
    return {};
  }
  if (parts.hasMultiRowValues) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
      columns: parts.columns.length, params: params.length,
    });
    return {};
  }
  const data = bindSingleInsertData(parts, params, logger, db);
  if (!data) return {};
  logger?.debug?.(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_INSERT, {
    tableName, dataKeys: Object.keys(data),
  });
  return data;
}

function applySetAssignmentsFromParams(clauses, params, data, db) {
  let paramIndex = 0;
  for (const {raw, masked} of splitTopLevelSqlList(clauses.setRaw, clauses.setMasked)) {
    const assignment = parseAssignmentParts(raw, masked);
    if (!assignment) continue;
    const slot = resolveBoundOrLiteralSlot(
      assignment.rhsRaw, assignment.rhsMasked, params, paramIndex, db,
    );
    if (slot.hasValue) data[assignment.column] = slot.value;
    paramIndex += slot.paramCount;
  }
  return paramIndex;
}

function extractUpdateFromParams(sql, params, tableName, logger, db) {
  const clauses = extractUpdateClauses(sql);
  if (!clauses) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_UPDATE_SET_FAILED, {
      sql: sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT),
    });
    return {};
  }
  const data = {};
  let paramIndex = applySetAssignmentsFromParams(clauses, params, data, db);
  if (clauses.whereRaw !== null) {
    paramIndex = applyWhereConjunctsFromParams({
      whereRaw: clauses.whereRaw, whereMasked: clauses.whereMasked, params,
      startParamIndex: paramIndex, data, preserveExisting: true, db,
    });
  }
  if (paramIndex !== params.length) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_UPDATE_MISMATCH, {
      columns: paramIndex, params: params.length,
    });
    return {};
  }
  logger?.debug?.(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_UPDATE, {
    tableName, dataKeys: Object.keys(data),
  });
  return data;
}

function extractDeleteFromParams(sql, params, tableName, logger, db) {
  const whereClause = extractWhereClauseFromSql(sql);
  if (!whereClause) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_DELETE_WHERE_FAILED, {
      sql: sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT),
    });
    return {};
  }
  const data = {};
  const paramIndex = applyWhereConjunctsFromParams({
    whereRaw: whereClause.whereRaw, whereMasked: whereClause.whereMasked, params,
    startParamIndex: 0, data, preserveExisting: false, db,
  });
  if (paramIndex !== params.length) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_DELETE_MISMATCH, {
      columns: paramIndex, params: params.length, whereContent: whereClause.whereRaw.trim(),
    });
    return {};
  }
  logger?.debug?.(
    PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_DELETE,
    {tableName, dataKeys: Object.keys(data)},
  );
  return data;
}

export function extractDataFromParameterizedSQL(
  sql, params, tableName, operationType, logger, db = null,
) {
  if (typeof sql !== 'string' || !params || params.length === 0) return {};
  if (
    operationType === PARTITION_SERVICE_OPERATION.INSERT ||
    operationType === PARTITION_SERVICE_OPERATION.UPSERT
  ) {
    return extractInsertFromParams(sql, params, tableName, logger, db);
  }
  if (operationType === PARTITION_SERVICE_OPERATION.UPDATE) {
    return extractUpdateFromParams(sql, params, tableName, logger, db);
  }
  if (operationType === PARTITION_SERVICE_OPERATION.DELETE) {
    return extractDeleteFromParams(sql, params, tableName, logger, db);
  }
  return {};
}
