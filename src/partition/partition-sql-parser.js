/**
 * SQL parsing helpers for CDC event generation.
 * Extracted from PartitionService — pure parsing logic that operates
 * on SQL strings, a logger, and an optional DB handle.
 */

import {STRING} from '../constants/index.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_VALUE,
} from './partition-service-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {admitCdcRowFetchLog} from './partition-cdc-log-throttle.js';

const CDC_ROW_FETCH_LOG_SUPPRESSED_TABLES = new Set([
  SYSTEM_TABLE_NAME.LOGS,
  SYSTEM_TABLE_NAME.NODES,
  SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
]);

const SQL_LEXICAL_TOKEN = Object.freeze({
  BACKTICK: '`',
  BLOCK_COMMENT_END: '*/',
  BLOCK_COMMENT_START: '/*',
  BRACKET_CLOSE: ']',
  BRACKET_OPEN: '[',
  DOUBLE_QUOTE: '"',
  EQUALS: '=',
  FALSE_VALUE: 'FALSE',
  LINE_COMMENT_START: '--',
  MASK_IDENT: '_',
  MASK_SPACE: ' ',
  NEWLINE: '\n',
  SINGLE_QUOTE: '\'',
  TRUE_VALUE: 'TRUE',
});

const SQL_NUMERIC_LITERAL_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const SQL_BOOLEAN_LITERAL_PATTERN = /^(?:TRUE|FALSE)$/i;
const SQL_QUOTED_IDENTIFIER_PATTERN = /^(?:"[\s\S]*"|`[\s\S]*`|\[[\s\S]*\])$/;
const SQL_INSERT_COLUMNS_PREFIX_PATTERN =
  /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+(?:\w+|"[^"]*"|`[^`]*`|\[[^\]]*\])\s*\(/i;
const SQL_VALUES_PREFIX_PATTERN = /^\s*VALUES\s*\(/i;
const SQL_MULTI_TUPLE_CONTINUATION_PATTERN = /^,\s*\(/;
const SQL_SET_CLAUSE_PATTERN = /\bSET\s+/i;
const SQL_WHERE_CLAUSE_PATTERN = /\bWHERE\s+/i;
const SQL_AND_CONJUNCT_PATTERN = /\bAND\b/gi;
const SQL_ASSIGNMENT_LHS_PATTERN = /^(\w+)\s*=/;
const SQL_SIMPLE_IDENT_PATTERN = /^(\w+)$/;
const SQL_ESCAPED_SINGLE_QUOTE_PATTERN = /''/g;
const SQL_ESCAPED_DOUBLE_QUOTE_PATTERN = /""/g;
const SQL_ESCAPED_BACKTICK_PATTERN = /``/g;

function scanDelimitedQuoteEnd(sql, startIndex, quoteChar) {
  for (let i = startIndex + 1; i < sql.length; i++) {
    if (sql[i] === quoteChar) {
      if (i + 1 < sql.length && sql[i + 1] === quoteChar) {
        i += 1;
        continue;
      }
      return i;
    }
  }
  return sql.length - 1;
}

function scanSqlSpan(sql, startIndex) {
  const ch = sql[startIndex];
  if (ch === SQL_LEXICAL_TOKEN.SINGLE_QUOTE || ch === SQL_LEXICAL_TOKEN.DOUBLE_QUOTE ||
      ch === SQL_LEXICAL_TOKEN.BACKTICK) {
    return {endIndex: scanDelimitedQuoteEnd(sql, startIndex, ch), isComment: false};
  }
  if (ch === SQL_LEXICAL_TOKEN.BRACKET_OPEN) {
    const closeIndex = sql.indexOf(SQL_LEXICAL_TOKEN.BRACKET_CLOSE, startIndex + 1);
    return {endIndex: closeIndex === -1 ? sql.length - 1 : closeIndex, isComment: false};
  }
  if (sql.startsWith(SQL_LEXICAL_TOKEN.LINE_COMMENT_START, startIndex)) {
    const newlineIndex = sql.indexOf(SQL_LEXICAL_TOKEN.NEWLINE, startIndex + 2);
    return {endIndex: newlineIndex === -1 ? sql.length - 1 : newlineIndex - 1, isComment: true};
  }
  if (sql.startsWith(SQL_LEXICAL_TOKEN.BLOCK_COMMENT_START, startIndex)) {
    const closeIndex = sql.indexOf(SQL_LEXICAL_TOKEN.BLOCK_COMMENT_END, startIndex + 2);
    return {endIndex: closeIndex === -1 ? sql.length - 1 : closeIndex + 1, isComment: true};
  }
  return null;
}

function transformSqlSpans(sql, handleSpan) {
  if (typeof sql !== 'string' || sql.length === 0) return STRING.EMPTY;
  let result = STRING.EMPTY;
  for (let i = 0; i < sql.length; i++) {
    const span = scanSqlSpan(sql, i);
    if (span) {
      result += handleSpan(sql, i, span);
      i = span.endIndex;
    } else {
      result += sql[i];
    }
  }
  return result;
}

function maskSqlLiteralsAndComments(sql) {
  return transformSqlSpans(sql, (src, start, span) => {
    if (span.isComment) {
      return SQL_LEXICAL_TOKEN.MASK_SPACE.repeat(span.endIndex - start + 1);
    }
    const innerLen = Math.max(0, span.endIndex - start - 1);
    const endChar = span.endIndex > start ? src[span.endIndex] : STRING.EMPTY;
    return src[start] + SQL_LEXICAL_TOKEN.MASK_IDENT.repeat(innerLen) + endChar;
  });
}

function stripSqlComments(sql) {
  return transformSqlSpans(sql, (src, start, span) => (
    span.isComment ?
      SQL_LEXICAL_TOKEN.MASK_SPACE.repeat(span.endIndex - start + 1) :
      src.slice(start, span.endIndex + 1)
  ));
}

function scanSqlPlaceholders(sql, stopAtFirst) {
  if (typeof sql !== 'string' || sql.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < sql.length; i++) {
    const span = scanSqlSpan(sql, i);
    if (span) {
      i = span.endIndex;
    } else if (sql[i] === PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK) {
      count += 1;
      if (stopAtFirst) return count;
    }
  }
  return count;
}

/**
 * Count SQL binding `?` placeholders outside string literals, quoted identifiers,
 * and SQL comments.
 * @param {string} sql - SQL statement or fragment.
 * @return {number} Count of unquoted `?` placeholders.
 */
export function countSqlParameterPlaceholders(sql) {
  return scanSqlPlaceholders(sql, false);
}

/**
 * Determine whether SQL contains at least one binding `?` placeholder outside
 * string literals, quoted identifiers, and SQL comments.
 * @param {string} sql - SQL statement or fragment.
 * @return {boolean}
 */
export function hasSqlParameterPlaceholders(sql) {
  return scanSqlPlaceholders(sql, true) > 0;
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
          start: openParenIndex,
          end: i,
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

function stripOuterParensOutsideLiterals(rawToken, maskedToken) {
  const leadingMatch = maskedToken.match(/^\s*\(+/);
  const startTrim = leadingMatch ? leadingMatch[0].length : 0;
  const trailingMatch = maskedToken.match(/\)+(?=\s*$)/);
  const trailingParensLen = trailingMatch ? trailingMatch[0].length : 0;
  const trailingWsLen = rawToken.length - rawToken.trimEnd().length;
  const endTrim = trailingParensLen > 0 ?
    rawToken.length - trailingWsLen - trailingParensLen :
    rawToken.length;
  if (endTrim <= startTrim) return {raw: STRING.EMPTY, masked: STRING.EMPTY};
  return {
    raw: rawToken.slice(startTrim, endTrim).trim(),
    masked: maskedToken.slice(startTrim, endTrim).trim(),
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
  return scanDelimitedQuoteEnd(token, 0, first) === token.length - 1;
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
  let valuesParen = null;
  let hasMultiRowValues = false;
  if (valuesPrefixMatch) {
    const openValuesParen =
      columnsParen.end + 1 + valuesPrefixMatch.index + valuesPrefixMatch[0].length - 1;
    valuesParen = extractBalancedParens(sql, maskedSql, openValuesParen);
    if (valuesParen) {
      hasMultiRowValues = SQL_MULTI_TUPLE_CONTINUATION_PATTERN.test(
        maskedSql.slice(valuesParen.end + 1).trim(),
      );
    }
  }
  return {columns, valuesParen, hasMultiRowValues};
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
    return trimmed.slice(1, -1).replace(
      SQL_ESCAPED_SINGLE_QUOTE_PATTERN, PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE,
    );
  }
  if (trimmed.length >= 2 &&
      trimmed.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) &&
      trimmed.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE)) {
    return trimmed.slice(1, -1).replace(
      SQL_ESCAPED_DOUBLE_QUOTE_PATTERN, PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE,
    );
  }
  if (trimmed.length > 0) {
    const num = Number(trimmed);
    if (!isNaN(num)) return num;
  }
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

/**
 * Extract column/value data from an INSERT SQL statement.
 * Falls back to querying the DB for the full row when possible.
 * @param {string} sql - INSERT SQL statement.
 * @param {string} tableName - Table name.
 * @param {Object} db - better-sqlite3 database handle.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractInsertDataFromSQL(sql, tableName, db, logger) {
  if (typeof sql !== 'string' || hasSqlParameterPlaceholders(sql)) return {};
  const parts = extractInsertSyntaxParts(sql);
  if (!parts || !parts.valuesParen || parts.hasMultiRowValues) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_INSERT_FAILED, {
      sql: sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT),
    });
    return {};
  }

  const {columns, valuesParen} = parts;
  const values = parseValuesFromSQL(valuesParen.content);
  if (columns.length !== values.length) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_INSERT_MISMATCH, {
      columns: columns.length,
      values: values.length,
    });
    return {};
  }

  const data = {};
  for (let i = 0; i < columns.length; i++) data[columns[i]] = values[i];
  const pkColumn = columns[0];
  const pkValue = values[0];
  if (db && pkValue !== null && pkValue !== undefined) {
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
  }
  return data;
}

function extractFirstLiteralWhereEquality(sql) {
  const whereClause = extractWhereClauseFromSql(sql);
  if (!whereClause) return null;
  const conjuncts = splitSqlByPattern(
    whereClause.whereRaw, whereClause.whereMasked, SQL_AND_CONJUNCT_PATTERN,
  );
  for (const {raw, masked} of conjuncts) {
    const clean = stripOuterParensOutsideLiterals(raw, masked);
    const assignment = parseAssignmentParts(clean.raw, clean.masked);
    if (!assignment) continue;
    const rhsToken = stripSqlComments(assignment.rhsRaw).trim();
    if (isSqlLiteralToken(rhsToken)) {
      return {keyColumn: assignment.column, keyValue: parseValue(rhsToken)};
    }
  }
  return null;
}

/**
 * Extract data from an UPDATE SQL statement by querying the updated row.
 * @param {string} sql - UPDATE SQL statement.
 * @param {string} tableName - Table name.
 * @param {Object} db - better-sqlite3 database handle.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractUpdateDataFromSQL(sql, tableName, db, logger) {
  if (typeof sql !== 'string' || hasSqlParameterPlaceholders(sql)) return {};
  const equality = extractFirstLiteralWhereEquality(sql);
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

/**
 * Extract data from a DELETE SQL statement.
 * @param {string} sql - DELETE SQL statement.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractDeleteDataFromSQL(sql, logger) {
  if (typeof sql !== 'string' || hasSqlParameterPlaceholders(sql)) return {};
  const equality = extractFirstLiteralWhereEquality(sql);
  if (equality) return {[equality.keyColumn]: equality.keyValue};
  logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_DELETE_WHERE_FAILED, {
    sql: sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT),
  });
  return {};
}

function resolveBoundOrLiteralSlot(rhsRaw, rhsMasked, params, paramIndex) {
  const paramCount = countSqlParameterPlaceholders(rhsRaw);
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
  return {hasValue: false, value: undefined, paramCount};
}

function applyWhereConjunctsFromParams({
  whereRaw, whereMasked, params, startParamIndex, data, preserveExisting = false,
}) {
  let paramIndex = startParamIndex;
  const conjuncts = splitSqlByPattern(whereRaw, whereMasked, SQL_AND_CONJUNCT_PATTERN);
  for (const {raw, masked} of conjuncts) {
    const clean = stripOuterParensOutsideLiterals(raw, masked);
    const assignment = parseAssignmentParts(clean.raw, clean.masked);
    if (!assignment) continue;
    const {column, rhsRaw} = assignment;
    const paramCount = countSqlParameterPlaceholders(rhsRaw);
    const shouldWrite = !preserveExisting || !Object.prototype.hasOwnProperty.call(data, column);
    if (paramCount > 0) {
      const value = params[paramIndex];
      paramIndex += paramCount;
      if (shouldWrite) data[column] = value;
    } else if (shouldWrite) {
      const literalToken = stripSqlComments(rhsRaw).trim();
      if (isSqlLiteralToken(literalToken)) data[column] = parseValue(literalToken);
    }
  }
  return paramIndex;
}

function bindInsertValuesFromParts(columns, valuesParen, params, logger) {
  const valueParts = splitTopLevelSqlList(valuesParen.content, valuesParen.maskedContent);
  if (columns.length !== valueParts.length) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
      columns: columns.length, params: params.length,
    });
    return null;
  }
  const data = {};
  let paramIndex = 0;
  for (let i = 0; i < columns.length; i++) {
    const slot = resolveBoundOrLiteralSlot(
      valueParts[i].raw, valueParts[i].masked, params, paramIndex,
    );
    if (slot.hasValue) data[columns[i]] = slot.value;
    paramIndex += slot.paramCount;
  }
  if (paramIndex !== params.length) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
      columns: paramIndex, params: params.length,
    });
    return null;
  }
  return data;
}

function extractInsertFromParams(sql, params, tableName, logger) {
  const parts = extractInsertSyntaxParts(sql);
  if (!parts) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED, {
      sql: sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT),
    });
    return {};
  }
  const {columns, valuesParen, hasMultiRowValues} = parts;
  if (hasMultiRowValues) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
      columns: columns.length, params: params.length,
    });
    return {};
  }

  let data;
  if (valuesParen) {
    data = bindInsertValuesFromParts(columns, valuesParen, params, logger);
    if (!data) return {};
  } else if (columns.length !== params.length) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
      columns: columns.length, params: params.length,
    });
    return {};
  } else {
    data = {};
    for (let i = 0; i < columns.length; i++) data[columns[i]] = params[i];
  }

  logger?.debug?.(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_INSERT, {
    tableName, dataKeys: Object.keys(data),
  });
  return data;
}

function extractUpdateFromParams(sql, params, tableName, logger) {
  const clauses = extractUpdateClauses(sql);
  if (!clauses) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_UPDATE_SET_FAILED, {
      sql: sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT),
    });
    return {};
  }

  // Build data object while preserving UPDATE semantics:
  // SET-column values are authoritative; WHERE-only columns backfill keys.
  const data = {};
  let paramIndex = 0;
  for (const {raw, masked} of splitTopLevelSqlList(clauses.setRaw, clauses.setMasked)) {
    const assignment = parseAssignmentParts(raw, masked);
    if (!assignment) continue;
    const slot = resolveBoundOrLiteralSlot(
      assignment.rhsRaw, assignment.rhsMasked, params, paramIndex,
    );
    if (slot.hasValue) data[assignment.column] = slot.value;
    paramIndex += slot.paramCount;
  }

  if (clauses.whereRaw !== null) {
    paramIndex = applyWhereConjunctsFromParams({
      whereRaw: clauses.whereRaw, whereMasked: clauses.whereMasked, params,
      startParamIndex: paramIndex, data, preserveExisting: true,
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

function extractDeleteFromParams(sql, params, tableName, logger) {
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
    startParamIndex: 0, data, preserveExisting: false,
  });
  if (paramIndex !== params.length) {
    logger?.warn?.(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_DELETE_MISMATCH, {
      columns: paramIndex, params: params.length, whereContent: whereClause.whereRaw.trim(),
    });
    return {};
  }
  logger?.debug?.(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_DELETE, {
    tableName, dataKeys: Object.keys(data),
  });
  return data;
}

/**
 * Extract data from parameterized SQL (SQL with ? placeholders and params).
 * @param {string} sql - SQL statement with ? placeholders.
 * @param {Array} params - Parameter values.
 * @param {string} tableName - Table name.
 * @param {string} operationType - INSERT, UPDATE, or DELETE.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractDataFromParameterizedSQL(
  sql, params, tableName, operationType, logger,
) {
  if (typeof sql !== 'string' || !params || params.length === 0) return {};
  if (operationType === PARTITION_SERVICE_OPERATION.INSERT ||
    operationType === PARTITION_SERVICE_OPERATION.UPSERT) {
    return extractInsertFromParams(sql, params, tableName, logger);
  }
  if (operationType === PARTITION_SERVICE_OPERATION.UPDATE) {
    return extractUpdateFromParams(sql, params, tableName, logger);
  }
  if (operationType === PARTITION_SERVICE_OPERATION.DELETE) {
    return extractDeleteFromParams(sql, params, tableName, logger);
  }
  return {};
}
