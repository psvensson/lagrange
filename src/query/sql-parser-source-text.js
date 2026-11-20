/**
 * What the SQL front end reads from the statement text itself, with SQLite's
 * own lexical rules (the statement-admission owner's lexer, pinned to
 * sqlite3GetToken) and SQLite's own grammar, rather than from
 * node-sql-parser's AST (design coordinator-sqlite-merge §2.5):
 *
 * - result-column spans: SQLite names an unaliased result expression by the
 *   text of its span (sqlite3ExprListSetSpan: from the expression's first
 *   token to the next token, whitespace trimmed). node-sql-parser keeps no
 *   positions, so the spans are read here and attached to the select-list
 *   columns in the order SQLite reads the SELECT keywords;
 * - the parse text: SQLite constructs node-sql-parser's grammar misreads or
 *   omits (`LIMIT ?` / `OFFSET ?`, `? COLLATE`, negative decimal zero,
 *   `IS [NOT] DISTINCT FROM`, `[NOT] GLOB`, `[NOT] REGEXP`, `[NOT] MATCH`,
 *   postfix `ISNULL` / `NOTNULL`, `SUM/AVG/TOTAL(DISTINCT ...)`,
 *   `OVER (ORDER BY ...)`, aggregate `ORDER BY`, and `EXCEPT` / `INTERSECT`)
 *   are respelled into reserved internal sentinels before it parses;
 * - the grammar verdict: when node-sql-parser cannot parse a statement,
 *   SQLite (prepare on an empty in-memory database) decides whether the text
 *   is SQL at all. Valid SQLite the front end cannot carry is the typed
 *   UNSUPPORTED_SQL_FEATURE refusal; anything else stays a syntax error.
 *
 * @module query/sql-parser-source-text
 */

import Database from 'better-sqlite3';

import {
  asciiLower,
  lexPartitionStatement,
} from '../partition/partition-statement-admission-lexer.js';

const KEYWORD = Object.freeze({
  SELECT: 'SELECT',
  DISTINCT: 'DISTINCT',
  ALL: 'ALL',
  AS: 'AS',
  FROM: 'FROM',
  IS: 'IS',
  NOT: 'NOT',
  LIMIT: 'LIMIT',
  OFFSET: 'OFFSET',
  COLLATE: 'COLLATE',
  WINDOW: 'WINDOW',
  OVER: 'OVER',
  ORDER: 'ORDER',
  BY: 'BY',
  EXCEPT: 'EXCEPT',
  INTERSECT: 'INTERSECT',
  CREATE: 'CREATE',
  VALUES: 'VALUES',
});
const TOKEN_TEXT = Object.freeze({
  COMMA: ',',
  SEMICOLON: ';',
  PLACEHOLDER: '?',
  MINUS: '-',
  OPEN_PAREN: '(',
  CLOSE_PAREN: ')',
});
const NUMBER_TOKEN = 'number';
const STRING_TOKEN = 'string';
const BLOB_TOKEN = 'blob';
const PARAM_TOKEN = 'param';
const IS_NOT_DISTINCT_DISTANCE = 3;
const WINDOW_AS_OFFSET = 2;
const WINDOW_PAREN_OFFSET = 3;
const EXTERNAL_WITH_KEY = 'with';
// The reserved keywords that end a SELECT's result-column list at its own depth
// (`WINDOW` is non-reserved in SQLite and only ends a list as `WINDOW <id> AS (`).
const SELECT_LIST_END = new Set([
  'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER',
  'LIMIT', 'UNION', 'EXCEPT', 'INTERSECT',
]);
// sqlite3Isspace: the ASCII whitespace SQLite trims from a span.
const SPAN_EDGE_WHITESPACE = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/gu;
const DECIMAL_ZERO_LEXEME = /^(?:0+\.0*|0*\.0+)$/u;
const BIG_INTEGER_LEXEME = /^[0-9]{16,}$/u;
/** The named parameter a `LIMIT ?` / `OFFSET ?` placeholder is respelled as. */
const LIMIT_PARAMETER_NAME = '__lagrange_limit_parameter';
const LIMIT_PARAMETER_TEXT = `:${LIMIT_PARAMETER_NAME}`;
/** The identifier a `? COLLATE ...` placeholder is respelled as. */
const COLLATED_PARAMETER_NAME = '__lagrange_collated_parameter';
/** Sentinel identifier for `OVER (ORDER BY ...)` without `PARTITION BY`. */
const WINDOW_NO_PARTITION_NAME = '__lagrange_window_no_partition';
/** Sentinel identifier for aggregate `ORDER BY` inside function arguments. */
const AGGREGATE_ORDER_BY_SENTINEL = '__lagrange_agg_order_by';

const BINARY_OP_SENTINEL = Object.freeze({
  IS_DISTINCT_FROM: '__lagrange_op_is_distinct',
  IS_NOT_DISTINCT_FROM: '__lagrange_op_is_not_distinct',
  GLOB: '__lagrange_op_glob',
  NOT_GLOB: '__lagrange_op_not_glob',
  REGEXP: '__lagrange_op_regexp',
  NOT_REGEXP: '__lagrange_op_not_regexp',
  MATCH: '__lagrange_op_match',
  NOT_MATCH: '__lagrange_op_not_match',
  ISNULL: '__lagrange_op_isnull',
  NOTNULL: '__lagrange_op_notnull',
});

const RESPELLED_BINARY_OPERATOR_BY_SENTINEL = Object.freeze(
  Object.assign(Object.create(null), {
    [BINARY_OP_SENTINEL.IS_DISTINCT_FROM]: 'IS DISTINCT FROM',
    [BINARY_OP_SENTINEL.IS_NOT_DISTINCT_FROM]: 'IS NOT DISTINCT FROM',
    [BINARY_OP_SENTINEL.GLOB]: 'GLOB',
    [BINARY_OP_SENTINEL.NOT_GLOB]: 'NOT GLOB',
    [BINARY_OP_SENTINEL.REGEXP]: 'REGEXP',
    [BINARY_OP_SENTINEL.NOT_REGEXP]: 'NOT REGEXP',
    [BINARY_OP_SENTINEL.MATCH]: 'MATCH',
    [BINARY_OP_SENTINEL.NOT_MATCH]: 'NOT MATCH',
    [BINARY_OP_SENTINEL.ISNULL]: 'ISNULL',
    [BINARY_OP_SENTINEL.NOTNULL]: 'NOTNULL',
  }),
);

const POSTFIX_NULL_OPERATORS = Object.freeze(new Set(['ISNULL', 'NOTNULL']));

const DIRECT_BINARY_OP_SENTINEL_BY_KEYWORD = Object.freeze(
  Object.assign(Object.create(null), {
    GLOB: BINARY_OP_SENTINEL.GLOB,
    REGEXP: BINARY_OP_SENTINEL.REGEXP,
    MATCH: BINARY_OP_SENTINEL.MATCH,
  }),
);

const NEGATED_BINARY_OP_SENTINEL_BY_KEYWORD = Object.freeze(
  Object.assign(Object.create(null), {
    GLOB: BINARY_OP_SENTINEL.NOT_GLOB,
    REGEXP: BINARY_OP_SENTINEL.NOT_REGEXP,
    MATCH: BINARY_OP_SENTINEL.NOT_MATCH,
  }),
);

const POSTFIX_OP_SENTINEL_BY_KEYWORD = Object.freeze(
  Object.assign(Object.create(null), {
    ISNULL: BINARY_OP_SENTINEL.ISNULL,
    NOTNULL: BINARY_OP_SENTINEL.NOTNULL,
  }),
);

const DISTINCT_AGGREGATE_BY_SENTINEL = Object.freeze(
  Object.assign(Object.create(null), {
    __lagrange_distinct_sum: 'SUM',
    __lagrange_distinct_avg: 'AVG',
    __lagrange_distinct_total: 'TOTAL',
    __lagrange_distinct_min: 'MIN',
    __lagrange_distinct_max: 'MAX',
    __lagrange_distinct_group_concat: 'GROUP_CONCAT',
  }),
);

const DISTINCT_AGGREGATE_SENTINEL_BY_NAME = Object.freeze(
  Object.assign(Object.create(null), {
    sum: '__lagrange_distinct_sum',
    avg: '__lagrange_distinct_avg',
    total: '__lagrange_distinct_total',
    min: '__lagrange_distinct_min',
    max: '__lagrange_distinct_max',
    group_concat: '__lagrange_distinct_group_concat',
  }),
);

const SET_OP_OPTION_SENTINEL = Object.freeze({
  EXCEPT: 'SQL_BIG_RESULT',
  INTERSECT: 'SQL_SMALL_RESULT',
});

const SET_OP_BY_OPTION_SENTINEL = Object.freeze(
  Object.assign(Object.create(null), {
    [SET_OP_OPTION_SENTINEL.EXCEPT]: KEYWORD.EXCEPT,
    [SET_OP_OPTION_SENTINEL.INTERSECT]: KEYWORD.INTERSECT,
  }),
);

const RESERVED_INTERNAL_NAMES = new Set([
  LIMIT_PARAMETER_NAME,
  COLLATED_PARAMETER_NAME,
  WINDOW_NO_PARTITION_NAME,
  AGGREGATE_ORDER_BY_SENTINEL,
  ...Object.values(BINARY_OP_SENTINEL),
  ...Object.keys(DISTINCT_AGGREGATE_BY_SENTINEL),
  asciiLower(SET_OP_OPTION_SENTINEL.EXCEPT),
  asciiLower(SET_OP_OPTION_SENTINEL.INTERSECT),
]);

const EXPR_CONTINUATION_PREDECESSORS = new Set([
  'SELECT', 'DISTINCT', 'ALL', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'BY',
  'LIMIT', 'OFFSET', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'CROSS', 'NATURAL', 'ON',
  'USING', 'WHEN', 'THEN', 'ELSE', 'CASE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'LIKE',
  'GLOB', 'REGEXP', 'MATCH', 'BETWEEN', 'ESCAPE', 'COLLATE', 'AS', 'SET', 'VALUES',
  'INTO', 'TABLE', 'INDEX', 'CREATE', 'INSERT', 'UPDATE', 'DELETE', 'WITH',
  'UNION', 'EXCEPT', 'INTERSECT',
]);

const OPERAND_TOKEN_TYPES = new Set([
  NUMBER_TOKEN,
  STRING_TOKEN,
  BLOB_TOKEN,
  PARAM_TOKEN,
]);

const NEGATIVE_SIGN_SPACED = '- ';
const EXTERNAL_SELECT_TYPE = 'select';
// SQLite parser diagnostics: the text is not SQL (sqlite3RunParser and the
// grammar actions that refuse clause order).
const SQLITE_GRAMMAR_REFUSAL =
  /syntax error|incomplete input|unrecognized token|should come after|parser stack overflow/u;
const MEMORY_DATABASE = ':memory:';

function previousAtDepth(tokens, index, depth, distance) {
  const token = tokens[index - distance];
  return token && token.depth === depth ? token : null;
}

function isDistinctFromKeyword(tokens, index) {
  const depth = tokens[index].depth;
  if (previousAtDepth(tokens, index, depth, 1)?.upper !== KEYWORD.DISTINCT) return false;
  const before = previousAtDepth(tokens, index, depth, 2);
  return before?.upper === KEYWORD.IS ||
    (before?.upper === KEYWORD.NOT &&
      previousAtDepth(tokens, index, depth, IS_NOT_DISTINCT_DISTANCE)?.upper === KEYWORD.IS);
}

function isWindowClauseKeyword(tokens, index, depth) {
  if (tokens[index].upper !== KEYWORD.WINDOW) return false;
  const nameToken = tokens[index + 1];
  const asToken = tokens[index + WINDOW_AS_OFFSET];
  const parenToken = tokens[index + WINDOW_PAREN_OFFSET];
  return nameToken?.depth === depth && nameToken.identifier !== null &&
    asToken?.depth === depth && asToken.upper === KEYWORD.AS &&
    parenToken?.text === TOKEN_TEXT.OPEN_PAREN;
}

function isSelectListEndToken(tokens, index, depth) {
  const token = tokens[index];
  if (token.depth < depth) return true;
  if (token.depth !== depth) return false;
  if (token.text === TOKEN_TEXT.SEMICOLON) return true;
  if (isWindowClauseKeyword(tokens, index, depth)) return true;
  return SELECT_LIST_END.has(token.upper) && !isDistinctFromKeyword(tokens, index);
}

function spanText(text, tokens, first, end) {
  const stop = end < tokens.length ? tokens[end].start : text.length;
  return text.slice(tokens[first].start, stop).replace(SPAN_EDGE_WHITESPACE, '');
}

// The result-column spans of the SELECT keyword at `selectIndex`.
function selectListSpans(text, tokens, selectIndex) {
  const depth = tokens[selectIndex].depth;
  let index = selectIndex + 1;
  const quantifier = tokens[index];
  if (quantifier?.depth === depth &&
      (quantifier.upper === KEYWORD.DISTINCT || quantifier.upper === KEYWORD.ALL)) {
    index += 1;
  }
  const spans = [];
  let itemStart = index;
  for (; index < tokens.length; index += 1) {
    if (isSelectListEndToken(tokens, index, depth)) break;
    if (tokens[index].depth === depth && tokens[index].text === TOKEN_TEXT.COMMA) {
      spans.push(spanText(text, tokens, itemStart, index));
      itemStart = index + 1;
    }
  }
  if (itemStart < index) spans.push(spanText(text, tokens, itemStart, index));
  const endToken = tokens[index];
  const endedAtFrom = endToken?.depth === depth && endToken.upper === KEYWORD.FROM;
  return {spans, endedAtFrom};
}

/**
 * The result-column spans of every SELECT of a statement, in the order of
 * the SELECT keywords in the text.
 * @param {string} text - The statement text.
 * @return {Array<{spans: Array<string>, endedAtFrom: boolean}>}
 */
function sourceSelectListSpans(text) {
  const {tokens} = lexPartitionStatement(text);
  const scopes = [];
  tokens.forEach((token, index) => {
    if (token.upper === KEYWORD.SELECT) scopes.push(selectListSpans(text, tokens, index));
  });
  return scopes;
}

/**
 * node-sql-parser's SELECT nodes in the order their SELECT keywords occur in
 * the text: a node's WITH clause first, then the node, then its clauses and
 * compound arms in source order.
 * @param {Object} externalAst - node-sql-parser statement.
 * @return {Object[]}
 */
function orderedExternalSelects(externalAst) {
  const selects = [];
  const seen = new Set();
  const visit = (node) => {
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === EXTERNAL_SELECT_TYPE && Array.isArray(node.columns)) {
      visit(node.with);
      selects.push(node);
      for (const [key, value] of Object.entries(node)) {
        if (key !== EXTERNAL_WITH_KEY) visit(value);
      }
      return;
    }
    Object.values(node).forEach(visit);
  };
  visit(externalAst);
  return selects;
}

function isInsideLimitClause(tokens, commaIndex, depth) {
  for (let cursor = commaIndex - 1; cursor >= 0; cursor -= 1) {
    const token = tokens[cursor];
    if (token.depth < depth) return false;
    if (token.depth !== depth) continue;
    if (token.upper === KEYWORD.LIMIT) return true;
    if (SELECT_LIST_END.has(token.upper) || token.upper === KEYWORD.SELECT ||
        token.text === TOKEN_TEXT.SEMICOLON) {
      return false;
    }
  }
  return false;
}

function isLimitPlaceholder(tokens, index) {
  const token = tokens[index];
  if (token.text !== TOKEN_TEXT.PLACEHOLDER) return false;
  const depth = token.depth;
  const previous = previousAtDepth(tokens, index, depth, 1);
  if (previous?.upper === KEYWORD.LIMIT || previous?.upper === KEYWORD.OFFSET) return true;
  return previous?.text === TOKEN_TEXT.COMMA && isInsideLimitClause(tokens, index - 1, depth);
}

function isCollatedPlaceholder(tokens, index) {
  const token = tokens[index];
  const next = tokens[index + 1];
  return token.text === TOKEN_TEXT.PLACEHOLDER &&
    next?.depth === token.depth &&
    next.upper === KEYWORD.COLLATE;
}

function isNegativeDecimalZero(tokens, index) {
  const token = tokens[index];
  const next = tokens[index + 1];
  return token.text === TOKEN_TEXT.MINUS && next?.type === NUMBER_TOKEN &&
    next.start === token.start + 1 &&
    (DECIMAL_ZERO_LEXEME.test(next.text) || BIG_INTEGER_LEXEME.test(next.text));
}

function isAfterOperandToken(tokens, index) {
  const depth = tokens[index].depth;
  if (tokens[0]?.upper === KEYWORD.CREATE && depth <= 1) return false;
  const prev = tokens[index - 1];
  if (!prev) return false;
  if (prev.text === TOKEN_TEXT.CLOSE_PAREN) return prev.depth === depth;
  if (prev.depth !== depth) return false;
  if (OPERAND_TOKEN_TYPES.has(prev.type)) return true;
  return prev.identifier !== null && !EXPR_CONTINUATION_PREDECESSORS.has(prev.upper);
}

function respellIsDistinctOperator(tokens, index) {
  const token = tokens[index];
  if (token.upper !== KEYWORD.IS) return null;
  const depth = token.depth;
  const t1 = tokens[index + 1];
  const t2 = tokens[index + 2];
  if (t1?.depth === depth && t1.upper === KEYWORD.DISTINCT &&
      t2?.depth === depth && t2.upper === KEYWORD.FROM) {
    return {
      replacement: `LIKE ${BINARY_OP_SENTINEL.IS_DISTINCT_FROM} =`,
      endIndex: index + 2,
    };
  }
  const t3 = tokens[index + IS_NOT_DISTINCT_DISTANCE];
  if (t1?.depth === depth && t1.upper === KEYWORD.NOT &&
      t2?.depth === depth && t2.upper === KEYWORD.DISTINCT &&
      t3?.depth === depth && t3.upper === KEYWORD.FROM) {
    return {
      replacement: `LIKE ${BINARY_OP_SENTINEL.IS_NOT_DISTINCT_FROM} =`,
      endIndex: index + IS_NOT_DISTINCT_DISTANCE,
    };
  }
  return null;
}

function respellBinaryOrPostfixOperator(tokens, index) {
  if (!isAfterOperandToken(tokens, index)) return null;
  const token = tokens[index];
  const next = tokens[index + 1];
  if (token.upper === KEYWORD.NOT && next?.depth === token.depth &&
      Object.hasOwn(NEGATED_BINARY_OP_SENTINEL_BY_KEYWORD, next.upper)) {
    const sentinel = NEGATED_BINARY_OP_SENTINEL_BY_KEYWORD[next.upper];
    return {replacement: `LIKE ${sentinel} =`, endIndex: index + 1};
  }
  if (Object.hasOwn(DIRECT_BINARY_OP_SENTINEL_BY_KEYWORD, token.upper)) {
    const sentinel = DIRECT_BINARY_OP_SENTINEL_BY_KEYWORD[token.upper];
    return {replacement: `LIKE ${sentinel} =`, endIndex: index};
  }
  if (Object.hasOwn(POSTFIX_OP_SENTINEL_BY_KEYWORD, token.upper)) {
    const sentinel = POSTFIX_OP_SENTINEL_BY_KEYWORD[token.upper];
    return {replacement: `LIKE ${sentinel} = 1`, endIndex: index};
  }
  return null;
}

function respellDistinctAggregateCall(tokens, index) {
  const token = tokens[index];
  if (!token.identifier || !Object.hasOwn(DISTINCT_AGGREGATE_SENTINEL_BY_NAME, token.identifier)) {
    return null;
  }
  if (tokens[index + 1]?.text !== TOKEN_TEXT.OPEN_PAREN ||
      tokens[index + 2]?.upper !== KEYWORD.DISTINCT) {
    return null;
  }
  const sentinel = DISTINCT_AGGREGATE_SENTINEL_BY_NAME[token.identifier];
  return {replacement: `${sentinel}(`, endIndex: index + 2};
}

function isWindowOrderOnlyOpenParen(tokens, index) {
  const token = tokens[index];
  return token.text === TOKEN_TEXT.OPEN_PAREN &&
    tokens[index - 1]?.upper === KEYWORD.OVER &&
    tokens[index + 1]?.upper === KEYWORD.ORDER &&
    tokens[index + 2]?.upper === KEYWORD.BY;
}

function isFunctionCallOrderByKeyword(tokens, index) {
  const token = tokens[index];
  if (token.upper !== KEYWORD.ORDER || tokens[index + 1]?.upper !== KEYWORD.BY ||
      token.depth < 1) {
    return false;
  }
  const targetOpenDepth = token.depth - 1;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const current = tokens[cursor];
    if (current.depth === token.depth &&
        (current.upper === KEYWORD.SELECT || current.upper === KEYWORD.VALUES)) {
      return false;
    }
    if (current.depth === targetOpenDepth && current.text === TOKEN_TEXT.OPEN_PAREN) {
      const beforeOpen = tokens[cursor - 1];
      return Boolean(beforeOpen?.identifier) && beforeOpen.upper !== KEYWORD.OVER;
    }
    if (current.depth < targetOpenDepth) return false;
  }
  return false;
}

function respellCompoundSetOperator(tokens, index) {
  const token = tokens[index];
  if (!Object.hasOwn(SET_OP_OPTION_SENTINEL, token.upper)) return null;
  const next = tokens[index + 1];
  if (next?.depth !== token.depth || next.upper !== KEYWORD.SELECT) return null;
  return {
    replacement: `UNION SELECT ${SET_OP_OPTION_SENTINEL[token.upper]}`,
    endIndex: index + 1,
  };
}

function singleTokenRespelling(tokens, index) {
  if (isLimitPlaceholder(tokens, index)) return LIMIT_PARAMETER_TEXT;
  if (isCollatedPlaceholder(tokens, index)) return COLLATED_PARAMETER_NAME;
  if (isNegativeDecimalZero(tokens, index)) return NEGATIVE_SIGN_SPACED;
  if (isWindowOrderOnlyOpenParen(tokens, index)) {
    return `(PARTITION BY ${WINDOW_NO_PARTITION_NAME} `;
  }
  if (isFunctionCallOrderByKeyword(tokens, index)) {
    return `) OVER (PARTITION BY ${AGGREGATE_ORDER_BY_SENTINEL} ORDER`;
  }
  return null;
}

function tokenRespelling(tokens, index) {
  const single = singleTokenRespelling(tokens, index);
  if (single !== null) return {replacement: single, endIndex: index};
  return respellIsDistinctOperator(tokens, index) ??
    respellBinaryOrPostfixOperator(tokens, index) ??
    respellDistinctAggregateCall(tokens, index) ??
    respellCompoundSetOperator(tokens, index);
}

function isReservedInternalToken(token) {
  if (token.identifier !== null && RESERVED_INTERNAL_NAMES.has(token.identifier)) {
    return true;
  }
  return token.type === PARAM_TOKEN &&
    RESERVED_INTERNAL_NAMES.has(asciiLower(token.text.slice(1)));
}

/**
 * The text node-sql-parser is given: SQLite constructs node-sql-parser cannot
 * read directly are respelled into reserved sentinels; every other byte is
 * the statement's.
 * @param {string} text - The statement text.
 * @return {{text: string, usesReservedName: boolean}}
 */
function nodeSqlParserText(text) {
  const {tokens} = lexPartitionStatement(text);
  let out = '';
  let cursor = 0;
  let usesReservedName = false;
  for (const token of tokens) {
    if (isReservedInternalToken(token)) {
      usesReservedName = true;
    }
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const respelled = tokenRespelling(tokens, index);
    if (respelled !== null) {
      const startToken = tokens[index];
      const endToken = tokens[respelled.endIndex];
      out += text.slice(cursor, startToken.start) + respelled.replacement;
      cursor = endToken.start + endToken.text.length;
      index = respelled.endIndex;
    }
  }
  return {text: out + text.slice(cursor), usesReservedName};
}

/**
 * Whether SQLite's grammar accepts the statement: it prepares on an empty
 * in-memory database, or fails for a reason other than its parser (an
 * unknown table, column or function is a name-resolution failure of valid
 * SQL). Nothing is executed.
 * @param {string} text - The statement text node-sql-parser refused.
 * @return {boolean}
 */
function sqliteAcceptsGrammar(text) {
  const database = new Database(MEMORY_DATABASE);
  try {
    database.prepare(text);
    return true;
  } catch (error) {
    return error instanceof RangeError ? false :
      !SQLITE_GRAMMAR_REFUSAL.test(String(error?.message));
  } finally {
    database.close();
  }
}

export {
  AGGREGATE_ORDER_BY_SENTINEL,
  COLLATED_PARAMETER_NAME,
  DISTINCT_AGGREGATE_BY_SENTINEL,
  LIMIT_PARAMETER_NAME,
  POSTFIX_NULL_OPERATORS,
  RESPELLED_BINARY_OPERATOR_BY_SENTINEL,
  SET_OP_BY_OPTION_SENTINEL,
  WINDOW_NO_PARTITION_NAME,
  nodeSqlParserText,
  orderedExternalSelects,
  sourceSelectListSpans,
  sqliteAcceptsGrammar,
};
