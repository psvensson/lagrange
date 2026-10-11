// The statement-admission owner's lexer: a pure function of the SQL text,
// pinned to SQLite's own tokenizer (sqlite3GetToken, 3.49.2 as bundled by
// better-sqlite3 11.10.0; TX1 design revision 10, section 3.3, "Lexical rules
// of the head"). It reads the head keyword and the token stream the rowid
// rules inspect; it never touches a connection.
//
// - Whitespace is space, tab, LF, FF and CR, plus a UTF-8 BOM read as space.
//   U+2028 is not whitespace (SQLite reads every non-ASCII character as an
//   identifier character). VT continues a run but is illegal at its start,
//   so a VT anywhere before the head refuses (that only refuses more).
// - A `--` comment ends only at LF, never at CR or U+2028; a `/*` comment
//   ends at the first `*/` or at the end of the text (a trailing `/*` with
//   nothing after it is a slash).
// - Anything else before the head refuses: a `;`, a `(`, a quoted name, any
//   other character. The head is the first token, a bare keyword.
import {
  PARTITION_STATEMENT_CHAR as CHAR,
  PARTITION_STATEMENT_CHAR_CLASS as CHAR_CLASS,
  PARTITION_STATEMENT_TOKEN as TOKEN,
  PARTITION_STATEMENT_WHITESPACE as WHITESPACE,
} from './partition-statement-admission-constants.js';

// SQLite numeric literals: hex, or decimal with an optional fraction and
// exponent (digit separators `_` included, 3.46+).
const NUMBER_PATTERN =
  /0[xX][0-9A-Fa-f_]+|[0-9][0-9_]*(?:\.[0-9_]*)?(?:[eE][+-]?[0-9_]+)?|\.[0-9][0-9_]*(?:[eE][+-]?[0-9_]+)?/y;
const NAMED_PARAM_PREFIXES = new Set([CHAR.COLON, CHAR.AT, CHAR.DOLLAR,
  CHAR.HASH]);
const QUOTED_IDENTIFIER_CLOSERS = new Map([[CHAR.DOUBLE_QUOTE, CHAR.DOUBLE_QUOTE],
  [CHAR.BACKTICK, CHAR.BACKTICK]]);
const UPPER_KEYWORD = /^[A-Za-z_]+$/;
const ASCII_UPPER_CASE = /[A-Z]/g;

const isWhitespace = (char) => WHITESPACE.has(char) || char === CHAR.BOM;
const isIdChar = (char) => char !== undefined && CHAR_CLASS.ID_CHAR.test(char);
const isDigit = (char) => char !== undefined && CHAR_CLASS.DIGIT.test(char);

// ASCII lower-case, as SQLite compares identifiers (sqlite3StrICmp).
function asciiLower(text) {
  return String(text).replace(ASCII_UPPER_CASE, (char) => char.toLowerCase());
}

function scanWhile(text, index, predicate) {
  let end = index;
  while (end < text.length && predicate(text[end])) {
    end += 1;
  }
  return end;
}

// A quoted run closed by `closer`, a doubled closer escaping it: the end index
// (null when unterminated) and the unescaped value.
function scanQuoted(text, index, closer) {
  let value = '';
  let cursor = index + 1;
  while (cursor < text.length) {
    if (text[cursor] !== closer) {
      value += text[cursor];
      cursor += 1;
    } else if (text[cursor + 1] === closer) {
      value += closer;
      cursor += 2;
    } else {
      return {end: cursor + 1, value};
    }
  }
  return {end: null, value};
}

function quotedPiece(text, index, closer, type) {
  const scanned = scanQuoted(text, index, closer);
  if (scanned.end === null) {
    return {type: TOKEN.ILLEGAL, end: text.length};
  }
  return {type, end: scanned.end, value: scanned.value};
}

function bracketPiece(text, index) {
  const close = text.indexOf(CHAR.CLOSE_BRACKET, index + 1);
  if (close < 0) {
    return {type: TOKEN.ILLEGAL, end: text.length};
  }
  return {type: TOKEN.QUOTED, end: close + 1, value: text.slice(index + 1, close)};
}

function commentEnd(text, index) {
  if (text[index] === CHAR.DASH && text[index + 1] === CHAR.DASH) {
    const lineFeed = text.indexOf(CHAR.LF, index + 2);
    return lineFeed < 0 ? text.length : lineFeed;
  }
  if (text[index] === CHAR.SLASH && text[index + 1] === CHAR.STAR &&
      index + 2 < text.length) {
    const close = text.indexOf(CHAR.STAR + CHAR.SLASH, index + 2);
    return close < 0 ? text.length : close + 2;
  }
  return null;
}

function numberPiece(text, index) {
  NUMBER_PATTERN.lastIndex = index;
  const match = NUMBER_PATTERN.exec(text);
  const end = index + match[0].length;
  // A number running into identifier characters is one illegal token.
  if (isIdChar(text[end])) {
    return {type: TOKEN.ILLEGAL, end: scanWhile(text, end, isIdChar)};
  }
  return {type: TOKEN.NUMBER, end};
}

function paramPiece(text, index) {
  if (text[index] === CHAR.QUESTION) {
    return {type: TOKEN.PARAM, end: scanWhile(text, index + 1, isDigit)};
  }
  const end = scanWhile(text, index + 1, isIdChar);
  return end > index + 1 ? {type: TOKEN.PARAM, end} :
    {type: TOKEN.ILLEGAL, end: index + 1};
}

function isNumberStart(text, index) {
  return isDigit(text[index]) ||
    (text[index] === CHAR.DOT && isDigit(text[index + 1]));
}

function literalPiece(text, index) {
  const char = text[index];
  if (char === CHAR.QUOTE) {
    return quotedPiece(text, index, CHAR.QUOTE, TOKEN.STRING);
  }
  if (CHAR.BLOB_PREFIXES.includes(char) && text[index + 1] === CHAR.QUOTE) {
    return {...quotedPiece(text, index + 1, CHAR.QUOTE, TOKEN.BLOB), value: null};
  }
  if (QUOTED_IDENTIFIER_CLOSERS.has(char)) {
    return quotedPiece(text, index, QUOTED_IDENTIFIER_CLOSERS.get(char),
      TOKEN.QUOTED);
  }
  if (char === CHAR.OPEN_BRACKET) {
    return bracketPiece(text, index);
  }
  return null;
}

// One token (never trivia) starting at `index`.
function tokenPiece(text, index) {
  const literal = literalPiece(text, index);
  if (literal !== null) {
    return literal;
  }
  const char = text[index];
  if (isNumberStart(text, index)) {
    return numberPiece(text, index);
  }
  if (char === CHAR.QUESTION || NAMED_PARAM_PREFIXES.has(char)) {
    return paramPiece(text, index);
  }
  if (CHAR_CLASS.ID_START.test(char)) {
    const end = scanWhile(text, index, isIdChar);
    return {type: TOKEN.WORD, end, value: text.slice(index, end)};
  }
  return {type: TOKEN.PUNCT, end: index + 1};
}

// Whitespace and comments: the end of the trivia at `index`, or null.
function triviaEnd(text, index) {
  if (isWhitespace(text[index])) {
    return scanWhile(text, index, isWhitespace);
  }
  return commentEnd(text, index);
}

function buildToken(text, index, piece, depth) {
  const raw = text.slice(index, piece.end);
  const value = piece.value ?? raw;
  return {
    type: piece.type,
    text: raw,
    value,
    // The keyword a bare word may be (ASCII letters only), else null.
    upper: piece.type === TOKEN.WORD && UPPER_KEYWORD.test(value) ?
      value.toUpperCase() : null,
    identifier: piece.type === TOKEN.WORD || piece.type === TOKEN.QUOTED ?
      asciiLower(value) : null,
    depth,
    start: index,
  };
}

function nextDepth(token, depth) {
  if (token.text === CHAR.OPEN_PAREN) {
    return depth + 1;
  }
  return token.text === CHAR.CLOSE_PAREN ? depth - 1 : depth;
}

// Pair each `(` with its `)` (token.close, the index of the `)`; absent when
// unclosed), so a walk of a parenthesized list is linear in the text.
function pairParentheses(tokens, index, openStack) {
  if (tokens[index].text === CHAR.OPEN_PAREN) {
    openStack.push(index);
  } else if (tokens[index].text === CHAR.CLOSE_PAREN && openStack.length > 0) {
    tokens[openStack.pop()].close = index;
  }
}

/**
 * The SQLite tokens of one SQL text (whitespace and comments dropped), each
 * with its parenthesis depth (a `(` and its `)` carry the outer depth; a `(`
 * also carries `close`, its `)`'s index), and the head keyword: the ASCII
 * upper-case first token when it is a bare word preceded only by whitespace
 * and comments without a VT, else null.
 * @param {string} sql - The SQL text.
 * @return {{head: (string|null), tokens: Array<Object>}} The lexed text.
 */
function lexPartitionStatement(sql) {
  const text = String(sql);
  const tokens = [];
  const openStack = [];
  let index = 0;
  let depth = 0;
  while (index < text.length) {
    const trivia = triviaEnd(text, index);
    if (trivia !== null) {
      index = trivia;
      continue;
    }
    const piece = tokenPiece(text, index);
    const closes = text[index] === CHAR.CLOSE_PAREN;
    const token = buildToken(text, index, piece, closes ? depth - 1 : depth);
    depth = nextDepth(token, depth);
    tokens.push(token);
    pairParentheses(tokens, tokens.length - 1, openStack);
    index = piece.end;
  }
  const first = tokens[0] ?? null;
  const leadingVt = first !== null && text.slice(0, first.start).includes(CHAR.VT);
  return {head: first !== null && !leadingVt ? first.upper : null, tokens};
}

export {asciiLower, lexPartitionStatement};
