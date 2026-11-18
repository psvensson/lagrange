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
 * - the parse text: two lexemes node-sql-parser misreads are respelled
 *   before it parses (`LIMIT ?` / `OFFSET ?`, which its grammar refuses, and
 *   a negative decimal zero, whose sign it drops);
 * - the grammar verdict: when node-sql-parser cannot parse a statement,
 *   SQLite (prepare on an empty in-memory database) decides whether the text
 *   is SQL at all. Valid SQLite the front end cannot carry is the typed
 *   UNSUPPORTED_SQL_FEATURE refusal; anything else stays a syntax error.
 *
 * @module query/sql-parser-source-text
 */

import Database from 'better-sqlite3';

import {lexPartitionStatement} from '../partition/partition-statement-admission-lexer.js';

const KEYWORD = Object.freeze({
  SELECT: 'SELECT',
  DISTINCT: 'DISTINCT',
  ALL: 'ALL',
  FROM: 'FROM',
  IS: 'IS',
  NOT: 'NOT',
  LIMIT: 'LIMIT',
  OFFSET: 'OFFSET',
});
const TOKEN_TEXT = Object.freeze({
  COMMA: ',',
  SEMICOLON: ';',
  PLACEHOLDER: '?',
  MINUS: '-',
});
const NUMBER_TOKEN = 'number';
// The keywords that end a SELECT's result-column list at its own depth.
const SELECT_LIST_END = new Set(['FROM', 'WHERE', 'GROUP', 'HAVING', 'WINDOW', 'ORDER',
  'LIMIT', 'UNION', 'EXCEPT', 'INTERSECT']);
// sqlite3Isspace: the ASCII whitespace SQLite trims from a span.
const SPAN_EDGE_WHITESPACE = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/gu;
const DECIMAL_ZERO_LEXEME = /^(?:0+\.0*|0*\.0+)$/u;
/** The named parameter a `LIMIT ?` / `OFFSET ?` placeholder is respelled as. */
const LIMIT_PARAMETER_NAME = '__lagrange_limit_parameter';
const LIMIT_PARAMETER_TEXT = `:${LIMIT_PARAMETER_NAME}`;
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
      previousAtDepth(tokens, index, depth, 3)?.upper === KEYWORD.IS);
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
    const token = tokens[index];
    if (token.depth < depth || (token.depth === depth &&
        (token.text === TOKEN_TEXT.SEMICOLON ||
          (SELECT_LIST_END.has(token.upper) && !isDistinctFromKeyword(tokens, index))))) {
      break;
    }
    if (token.depth === depth && token.text === TOKEN_TEXT.COMMA) {
      spans.push(spanText(text, tokens, itemStart, index));
      itemStart = index + 1;
    }
  }
  if (itemStart < index) spans.push(spanText(text, tokens, itemStart, index));
  return spans;
}

/**
 * The result-column spans of every SELECT of a statement, in the order of
 * the SELECT keywords in the text.
 * @param {string} text - The statement text.
 * @return {Array<Array<string>>}
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
        if (key !== 'with') visit(value);
      }
      return;
    }
    Object.values(node).forEach(visit);
  };
  visit(externalAst);
  return selects;
}

function isLimitPlaceholder(tokens, index) {
  const token = tokens[index];
  if (token.text !== TOKEN_TEXT.PLACEHOLDER) return false;
  const depth = token.depth;
  const previous = previousAtDepth(tokens, index, depth, 1);
  if (previous?.upper === KEYWORD.LIMIT || previous?.upper === KEYWORD.OFFSET) return true;
  return previous?.text === TOKEN_TEXT.COMMA &&
    previousAtDepth(tokens, index, depth, 3)?.upper === KEYWORD.LIMIT;
}

function isNegativeDecimalZero(tokens, index) {
  const token = tokens[index];
  const next = tokens[index + 1];
  return token.text === TOKEN_TEXT.MINUS && next?.type === NUMBER_TOKEN &&
    next.start === token.start + 1 && DECIMAL_ZERO_LEXEME.test(next.text);
}

/**
 * The text node-sql-parser is given: `?` in LIMIT/OFFSET respelled as the
 * reserved named parameter, and a sign written against a decimal zero
 * spaced off it (node-sql-parser folds the sign into the lexeme through
 * toFixed, which drops the sign of -0). Every other byte is the statement's.
 * @param {string} text - The statement text.
 * @return {{text: string, usesReservedName: boolean}}
 */
function nodeSqlParserText(text) {
  const {tokens} = lexPartitionStatement(text);
  let out = '';
  let cursor = 0;
  let usesReservedName = false;
  tokens.forEach((token, index) => {
    if (token.text === LIMIT_PARAMETER_TEXT) usesReservedName = true;
    if (isLimitPlaceholder(tokens, index)) {
      out += text.slice(cursor, token.start) + LIMIT_PARAMETER_TEXT;
      cursor = token.start + token.text.length;
    } else if (isNegativeDecimalZero(tokens, index)) {
      out += text.slice(cursor, token.start) + NEGATIVE_SIGN_SPACED;
      cursor = token.start + token.text.length;
    }
  });
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
  LIMIT_PARAMETER_NAME,
  nodeSqlParserText,
  orderedExternalSelects,
  sourceSelectListSpans,
  sqliteAcceptsGrammar,
};
