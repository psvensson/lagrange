/**
 * Locking read grammar and AST validation for PostgreSQL SELECT ... FOR UPDATE.
 *
 * Implements Stage B2 (locking-read-canonical-ast) fail-fast locking read
 * semantics in accordance with architecture/postgres-locking-reads.md and
 * solve/specs/release-0-3-queryable-core/locking-read-wait-policy.json.
 *
 * Scans SQL tokens accurately, strips trailing FOR UPDATE before passing SQL
 * to the underlying engine parser, and attaches canonical locking metadata to
 * the SELECT AST. Deterministically fails closed with SQLError (0A000) for all
 * unsupported locking read variants, subqueries/CTEs, and incompatible clauses.
 *
 * @module query/sql-locking-read-grammar
 */

import {AST_TYPE, EXPR_TYPE} from './parser-constants.js';
import {BaseError} from '../utils/base-error.js';
import {NUM} from '../constants/index.js';
import {PG_ERROR_CODE} from '../runtime/pgwire-protocol-constants.js';
import {QUERY_ERROR_CODE} from './query-constants.js';

const LOCAL_STR_SQL_ERROR = 'SQLError';
const LOCAL_STR_DEFAULT_CODE = 'SQL_ERROR';

const stringSlice = Function.call.bind(String.prototype.slice);
const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringTest = Function.call.bind(RegExp.prototype.test);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySome = Function.call.bind(Array.prototype.some);
const setHas = Function.call.bind(Set.prototype.has);
const objectFreeze = Object.freeze;

class SQLError extends BaseError {
  constructor(message, options = {}) {
    super(message, {cause: options.cause, context: options.context});
    this.name = LOCAL_STR_SQL_ERROR;
    this.code = options.code || options.errorCode || LOCAL_STR_DEFAULT_CODE;
    const sqlState = options.sqlState ||
      options.details?.sqlState ||
      PG_ERROR_CODE.FEATURE_NOT_SUPPORTED;
    this.sqlState = sqlState;
    this.details = objectFreeze({
      sqlState,
      ...(options.details || {}),
    });
    objectFreeze(this);
  }
}

const LOCKING_READ_STRENGTH = objectFreeze({
  UPDATE: 'UPDATE',
});

const LOCKING_READ_WAIT_POLICY = objectFreeze({
  FAIL_FAST: 'FAIL_FAST',
});

const SQL_KEYWORD = objectFreeze({
  SELECT: 'SELECT',
  WITH: 'WITH',
  FOR: 'FOR',
  UPDATE: 'UPDATE',
  SHARE: 'SHARE',
  KEY: 'KEY',
  NO: 'NO',
  NOWAIT: 'NOWAIT',
  SKIP: 'SKIP',
  LOCKED: 'LOCKED',
  OF: 'OF',
});

const TOKEN_KIND = objectFreeze({
  WORD: 'WORD',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  SEMICOLON: 'SEMICOLON',
});

const LOCKING_CLAUSE_KIND = objectFreeze({
  FOR_UPDATE: 'FOR_UPDATE',
  FOR_UPDATE_NOWAIT: 'FOR_UPDATE_NOWAIT',
  FOR_UPDATE_SKIP_LOCKED: 'FOR_UPDATE_SKIP_LOCKED',
  FOR_UPDATE_OF: 'FOR_UPDATE_OF',
  FOR_SHARE: 'FOR_SHARE',
  FOR_KEY_SHARE: 'FOR_KEY_SHARE',
  FOR_NO_KEY_UPDATE: 'FOR_NO_KEY_UPDATE',
  UNSUPPORTED_FOR_CLAUSE: 'UNSUPPORTED_FOR_CLAUSE',
});

const LOCKING_ERROR_MSG = objectFreeze({
  FOR_SHARE_UNSUPPORTED:
    'FOR SHARE is not supported; only FOR UPDATE is supported',
  FOR_KEY_SHARE_UNSUPPORTED:
    'FOR KEY SHARE is not supported; only FOR UPDATE is supported',
  FOR_NO_KEY_UPDATE_UNSUPPORTED:
    'FOR NO KEY UPDATE is not supported; only FOR UPDATE is supported',
  NOWAIT_UNSUPPORTED:
    'NOWAIT is not supported; the wait policy is fail-fast refusal',
  SKIP_LOCKED_UNSUPPORTED:
    'SKIP LOCKED is not supported; the wait policy is fail-fast refusal',
  FOR_UPDATE_OF_UNSUPPORTED:
    'FOR UPDATE OF is not supported; locking reads target all selected rows',
  SUBQUERY_OR_CTE_UNSUPPORTED:
    'Locking read inside subqueries or CTEs is not supported',
  NON_SELECT_UNSUPPORTED:
    'Locking read is only supported on SELECT statements',
  DISTINCT_UNSUPPORTED:
    'FOR UPDATE cannot be used with DISTINCT',
  GROUP_BY_UNSUPPORTED:
    'FOR UPDATE cannot be used with GROUP BY or HAVING',
  SET_OP_UNSUPPORTED:
    'FOR UPDATE cannot be used with set operations (UNION, INTERSECT, EXCEPT)',
  AGGREGATE_UNSUPPORTED:
    'FOR UPDATE cannot be used with aggregate functions',
  POSITION_UNSUPPORTED:
    'FOR UPDATE must appear at the end of the query',
});

const AGGREGATE_NAMES = new Set([
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
]);

const SQL_WHITESPACE_PATTERN = /\s/u;
const SQL_WORD_PATTERN = /[a-zA-Z0-9_]/u;
const DOLLAR_QUOTE_START_PATTERN = /^\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/u;
const LINE_BREAK_PATTERN = /[\r\n]/u;
const BLOCK_OPEN = '/*';
const BLOCK_CLOSE = '*/';
const CHAR_HYPHEN = '-';
const CHAR_SLASH = '/';
const CHAR_ASTERISK = '*';
const CHAR_SINGLE_QUOTE = '\'';
const CHAR_DOUBLE_QUOTE = '"';
const CHAR_BACKTICK = '`';
const CHAR_DOLLAR = '$';
const CHAR_LPAREN = '(';
const CHAR_RPAREN = ')';
const CHAR_SEMICOLON = ';';

function createUnsupportedSqlFeatureError(message) {
  return new SQLError(message, {
    code: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
    sqlState: PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
    details: {
      sqlState: PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
    },
  });
}

function scanQuotedRun(sql, start, quoteChar) {
  let cursor = start + 1;
  const len = sql.length;
  while (cursor < len) {
    if (sql[cursor] === quoteChar) {
      if (cursor + 1 < len && sql[cursor + 1] === quoteChar) {
        cursor += 2;
        continue;
      }
      return cursor + 1;
    }
    cursor += 1;
  }
  return len;
}

function scanBlockCommentEnd(sql, start) {
  let cursor = start + 2;
  let depth = 1;
  const len = sql.length;
  while (cursor < len && depth > 0) {
    if (stringStartsWith(sql, BLOCK_OPEN, cursor)) {
      depth += 1;
      cursor += 2;
    } else if (stringStartsWith(sql, BLOCK_CLOSE, cursor)) {
      depth -= 1;
      cursor += 2;
    } else {
      cursor += 1;
    }
  }
  return cursor;
}

function scanComment(sql, cursor, ch) {
  const len = sql.length;
  if (ch === CHAR_HYPHEN && cursor + 1 < len && sql[cursor + 1] === CHAR_HYPHEN) {
    let next = cursor + 2;
    while (next < len && !stringTest(LINE_BREAK_PATTERN, sql[next])) {
      next += 1;
    }
    return next;
  }

  if (ch === CHAR_SLASH && cursor + 1 < len && sql[cursor + 1] === CHAR_ASTERISK) {
    return scanBlockCommentEnd(sql, cursor);
  }

  return null;
}

function scanQuote(sql, cursor, ch) {
  const len = sql.length;
  if (ch === CHAR_SINGLE_QUOTE || ch === CHAR_DOUBLE_QUOTE || ch === CHAR_BACKTICK) {
    return scanQuotedRun(sql, cursor, ch);
  }

  if (ch === CHAR_DOLLAR) {
    const rest = stringSlice(sql, cursor);
    const match = DOLLAR_QUOTE_START_PATTERN.exec(rest);
    if (match) {
      const tag = match[0];
      const searchStart = cursor + tag.length;
      const closingIndex = stringIndexOf(sql, tag, searchStart);
      return closingIndex !== -1 ? closingIndex + tag.length : len;
    }
  }

  return null;
}

function scanCommentOrQuote(sql, cursor, ch) {
  const commentEnd = scanComment(sql, cursor, ch);
  if (commentEnd !== null) {
    return commentEnd;
  }
  return scanQuote(sql, cursor, ch);
}

function scanPunctuationOrWord(sql, cursor, ch, parenDepth, tokens) {
  if (ch === CHAR_LPAREN) {
    arrayPush(tokens, {
      type: TOKEN_KIND.LPAREN,
      start: cursor,
      end: cursor + 1,
      depth: parenDepth,
    });
    return {nextCursor: cursor + 1, nextParenDepth: parenDepth + 1};
  }

  if (ch === CHAR_RPAREN) {
    const updatedDepth = parenDepth > 0 ? parenDepth - 1 : 0;
    arrayPush(tokens, {
      type: TOKEN_KIND.RPAREN,
      start: cursor,
      end: cursor + 1,
      depth: updatedDepth,
    });
    return {nextCursor: cursor + 1, nextParenDepth: updatedDepth};
  }

  if (ch === CHAR_SEMICOLON) {
    arrayPush(tokens, {
      type: TOKEN_KIND.SEMICOLON,
      start: cursor,
      end: cursor + 1,
      depth: parenDepth,
    });
    return {nextCursor: cursor + 1, nextParenDepth: parenDepth};
  }

  if (stringTest(SQL_WORD_PATTERN, ch)) {
    const start = cursor;
    let end = cursor;
    const len = sql.length;
    while (end < len && stringTest(SQL_WORD_PATTERN, sql[end])) {
      end += 1;
    }
    const value = stringSlice(sql, start, end);
    arrayPush(tokens, {
      type: TOKEN_KIND.WORD,
      value,
      upper: stringToUpperCase(value),
      start,
      end,
      depth: parenDepth,
    });
    return {nextCursor: end, nextParenDepth: parenDepth};
  }

  return {nextCursor: cursor + 1, nextParenDepth: parenDepth};
}

function tokenizeSql(sql) {
  const tokens = [];
  let cursor = 0;
  let parenDepth = 0;
  const len = sql.length;

  while (cursor < len) {
    const ch = sql[cursor];

    if (stringTest(SQL_WHITESPACE_PATTERN, ch)) {
      cursor += 1;
      continue;
    }

    const commentOrQuoteEnd = scanCommentOrQuote(sql, cursor, ch);
    if (commentOrQuoteEnd !== null) {
      cursor = commentOrQuoteEnd;
      continue;
    }

    const step = scanPunctuationOrWord(sql, cursor, ch, parenDepth, tokens);
    cursor = step.nextCursor;
    parenDepth = step.nextParenDepth;
  }

  return tokens;
}

function matchUpdateClause(tokens, i) {
  const next2 = tokens[i + 2];
  if (next2?.type === TOKEN_KIND.WORD) {
    if (next2.upper === SQL_KEYWORD.NOWAIT) {
      return {clause: LOCKING_CLAUSE_KIND.FOR_UPDATE_NOWAIT, endTokenIndex: i + 2};
    }
    if (next2.upper === SQL_KEYWORD.SKIP) {
      const next3 = tokens[i + NUM.THREE];
      if (next3?.type === TOKEN_KIND.WORD && next3.upper === SQL_KEYWORD.LOCKED) {
        return {clause: LOCKING_CLAUSE_KIND.FOR_UPDATE_SKIP_LOCKED, endTokenIndex: i + NUM.THREE};
      }
    }
    if (next2.upper === SQL_KEYWORD.OF) {
      return {clause: LOCKING_CLAUSE_KIND.FOR_UPDATE_OF, endTokenIndex: i + 2};
    }
  }
  return {clause: LOCKING_CLAUSE_KIND.FOR_UPDATE, endTokenIndex: i + 1};
}

function matchNoClause(tokens, i) {
  const next2 = tokens[i + 2];
  const next3 = tokens[i + NUM.THREE];
  if (next2?.type === TOKEN_KIND.WORD && next2.upper === SQL_KEYWORD.KEY &&
      next3?.type === TOKEN_KIND.WORD && next3.upper === SQL_KEYWORD.UPDATE) {
    return {clause: LOCKING_CLAUSE_KIND.FOR_NO_KEY_UPDATE, endTokenIndex: i + NUM.THREE};
  }
  return {clause: LOCKING_CLAUSE_KIND.UNSUPPORTED_FOR_CLAUSE, endTokenIndex: i + 1};
}

function matchKeyClause(tokens, i) {
  const next2 = tokens[i + 2];
  if (next2?.type === TOKEN_KIND.WORD && next2.upper === SQL_KEYWORD.SHARE) {
    return {clause: LOCKING_CLAUSE_KIND.FOR_KEY_SHARE, endTokenIndex: i + 2};
  }
  return {clause: LOCKING_CLAUSE_KIND.UNSUPPORTED_FOR_CLAUSE, endTokenIndex: i + 1};
}

function matchLockingClause(tokens, i) {
  const next1 = tokens[i + 1];
  if (!next1 || next1.type !== TOKEN_KIND.WORD) {
    return {clause: LOCKING_CLAUSE_KIND.UNSUPPORTED_FOR_CLAUSE, endTokenIndex: i};
  }

  switch (next1.upper) {
  case SQL_KEYWORD.UPDATE:
    return matchUpdateClause(tokens, i);
  case SQL_KEYWORD.SHARE:
    return {clause: LOCKING_CLAUSE_KIND.FOR_SHARE, endTokenIndex: i + 1};
  case SQL_KEYWORD.NO:
    return matchNoClause(tokens, i);
  case SQL_KEYWORD.KEY:
    return matchKeyClause(tokens, i);
  default:
    return {clause: LOCKING_CLAUSE_KIND.UNSUPPORTED_FOR_CLAUSE, endTokenIndex: i + 1};
  }
}

function failClosedForClause(clause) {
  switch (clause) {
  case LOCKING_CLAUSE_KIND.FOR_SHARE:
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.FOR_SHARE_UNSUPPORTED);
  case LOCKING_CLAUSE_KIND.FOR_KEY_SHARE:
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.FOR_KEY_SHARE_UNSUPPORTED);
  case LOCKING_CLAUSE_KIND.FOR_NO_KEY_UPDATE:
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.FOR_NO_KEY_UPDATE_UNSUPPORTED);
  case LOCKING_CLAUSE_KIND.FOR_UPDATE_NOWAIT:
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.NOWAIT_UNSUPPORTED);
  case LOCKING_CLAUSE_KIND.FOR_UPDATE_SKIP_LOCKED:
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.SKIP_LOCKED_UNSUPPORTED);
  case LOCKING_CLAUSE_KIND.FOR_UPDATE_OF:
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.FOR_UPDATE_OF_UNSUPPORTED);
  default:
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.FOR_SHARE_UNSUPPORTED);
  }
}

function validateLockingTokenContext(tok, isSelect, clauseInfo) {
  if (tok.depth > 0) {
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.SUBQUERY_OR_CTE_UNSUPPORTED);
  }

  if (!isSelect) {
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.NON_SELECT_UNSUPPORTED);
  }

  if (clauseInfo.clause !== LOCKING_CLAUSE_KIND.FOR_UPDATE) {
    failClosedForClause(clauseInfo.clause);
  }
}

function stripValidTrailingClause(sql, tokens, tok, clauseInfo) {
  const remainingTokens = arraySlice(tokens, clauseInfo.endTokenIndex + 1);
  for (let r = 0; r < remainingTokens.length; r++) {
    if (remainingTokens[r].type !== TOKEN_KIND.SEMICOLON) {
      throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.POSITION_UNSUPPORTED);
    }
  }

  const updateToken = tokens[clauseInfo.endTokenIndex];
  const before = stringSlice(sql, 0, tok.start);
  const after = stringSlice(sql, updateToken.end);
  return before + after;
}

function stripAndValidateLockingClause(sql) {
  if (typeof sql !== 'string' || !sql.includes(SQL_KEYWORD.FOR)) {
    return {sql, hasLocking: false};
  }

  const tokens = tokenizeSql(sql);
  let firstWord = null;
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.type === TOKEN_KIND.WORD && t.depth === 0) {
      firstWord = t;
      break;
    }
  }

  const isSelect = firstWord?.upper === SQL_KEYWORD.SELECT ||
    firstWord?.upper === SQL_KEYWORD.WITH;

  let foundLocking = false;
  let resultSql = sql;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type !== TOKEN_KIND.WORD || tok.upper !== SQL_KEYWORD.FOR) {
      continue;
    }

    const clauseInfo = matchLockingClause(tokens, i);
    validateLockingTokenContext(tok, isSelect, clauseInfo);
    resultSql = stripValidTrailingClause(sql, tokens, tok, clauseInfo);
    foundLocking = true;
  }

  return {sql: resultSql, hasLocking: foundLocking};
}

function isAggregateExpression(expr) {
  if (expr.type === EXPR_TYPE.AGGREGATE) {
    return true;
  }
  if (typeof expr.function === 'string' && setHas(AGGREGATE_NAMES, stringToUpperCase(expr.function))) {
    return true;
  }
  if (typeof expr.name === 'string' && setHas(AGGREGATE_NAMES, stringToUpperCase(expr.name))) {
    return true;
  }
  return false;
}

function expressionHasAggregate(expr) {
  if (!expr || typeof expr !== 'object') {
    return false;
  }
  if (isAggregateExpression(expr)) {
    return true;
  }

  const childExprs = [
    expr.left,
    expr.right,
    expr.expr,
    ...(Array.isArray(expr.args) ? expr.args : []),
    ...(Array.isArray(expr.values) ? expr.values : []),
  ];
  return arraySome(childExprs, expressionHasAggregate);
}

function astHasAggregate(ast) {
  if (Array.isArray(ast.columns)) {
    for (let i = 0; i < ast.columns.length; i++) {
      const col = ast.columns[i];
      if (expressionHasAggregate(col.expression) || expressionHasAggregate(col)) {
        return true;
      }
    }
  }
  if (ast.where && expressionHasAggregate(ast.where)) {
    return true;
  }
  if (ast.having && expressionHasAggregate(ast.having)) {
    return true;
  }
  return false;
}

function ensureNoGroupingOrDistinct(ast) {
  if (ast.distinct === true) {
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.DISTINCT_UNSUPPORTED);
  }

  const hasGroupBy = ast.groupBy !== null &&
    (!Array.isArray(ast.groupBy) || ast.groupBy.length > 0);
  if (hasGroupBy || ast.having !== null) {
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.GROUP_BY_UNSUPPORTED);
  }
}

function ensureNoSetOpOrAggregate(ast) {
  if (ast.setOperation !== null) {
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.SET_OP_UNSUPPORTED);
  }

  if (astHasAggregate(ast)) {
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.AGGREGATE_UNSUPPORTED);
  }
}

function validateSelectAstLocking(ast, hasLocking) {
  if (!hasLocking) {
    if (ast && ast.type === AST_TYPE.SELECT) {
      ast.locking = null;
    }
    return ast;
  }

  if (!ast || ast.type !== AST_TYPE.SELECT) {
    throw createUnsupportedSqlFeatureError(LOCKING_ERROR_MSG.NON_SELECT_UNSUPPORTED);
  }

  ensureNoGroupingOrDistinct(ast);
  ensureNoSetOpOrAggregate(ast);

  ast.locking = objectFreeze({
    strength: LOCKING_READ_STRENGTH.UPDATE,
    waitPolicy: LOCKING_READ_WAIT_POLICY.FAIL_FAST,
  });

  return ast;
}

export {
  LOCKING_READ_STRENGTH,
  LOCKING_READ_WAIT_POLICY,
  SQLError,
  stripAndValidateLockingClause,
  validateSelectAstLocking,
};
