/**
 * The one SQL comment scanner: `--` line comments and nested `/* *\/` block
 * comments (PostgreSQL nests block comments), with quoted text ('...' string
 * literals, "..." identifiers) skipped so a comment marker inside quotes is
 * never read as a comment.
 *
 * @module query/sql-comment-scanner
 */

const SQL_COMMENT_TOKEN = Object.freeze({
  BLOCK_CLOSE: '*/',
  BLOCK_OPEN: '/*',
  LINE: '--',
});
const SQL_COMMENT_SCAN_UNTERMINATED = -1;
const SQL_LINE_BREAK_PATTERN = /[\r\n]/u;
const SQL_WHITESPACE_PATTERN = /\s/u;
const SQL_QUOTE_CHARACTERS = new Set(['\'', '"']);
const COMMENT_REPLACEMENT = ' ';

/**
 * The offset just past a `--` line comment (and its line breaks).
 * @param {string} statement - SQL text.
 * @param {number} start - Offset of the `--`.
 * @return {number}
 */
function scanLineCommentEnd(statement, start) {
  let cursor = start + SQL_COMMENT_TOKEN.LINE.length;
  while (cursor < statement.length &&
      !SQL_LINE_BREAK_PATTERN.test(statement[cursor])) {
    cursor += 1;
  }
  while (cursor < statement.length &&
      SQL_LINE_BREAK_PATTERN.test(statement[cursor])) {
    cursor += 1;
  }
  return cursor;
}

/**
 * The offset just past a (nested) block comment.
 * @param {string} statement - SQL text.
 * @param {number} start - Offset of the opening `/*`.
 * @return {number} The offset, or SQL_COMMENT_SCAN_UNTERMINATED.
 */
function scanBlockCommentEnd(statement, start) {
  let cursor = start + SQL_COMMENT_TOKEN.BLOCK_OPEN.length;
  let depth = 1;
  while (cursor < statement.length) {
    if (statement.startsWith(SQL_COMMENT_TOKEN.BLOCK_OPEN, cursor)) {
      depth += 1;
      cursor += SQL_COMMENT_TOKEN.BLOCK_OPEN.length;
      continue;
    }
    if (statement.startsWith(SQL_COMMENT_TOKEN.BLOCK_CLOSE, cursor)) {
      depth -= 1;
      cursor += SQL_COMMENT_TOKEN.BLOCK_CLOSE.length;
      if (depth === 0) return cursor;
      continue;
    }
    cursor += 1;
  }
  return SQL_COMMENT_SCAN_UNTERMINATED;
}

/**
 * The offset just past a quoted run ('...' or "..."; a doubled quote is an
 * escaped quote inside it).
 * @param {string} statement - SQL text.
 * @param {number} start - Offset of the opening quote.
 * @return {number} The offset (the text's end when unterminated).
 */
function scanQuotedEnd(statement, start) {
  const quote = statement[start];
  let cursor = start + 1;
  while (cursor < statement.length) {
    if (statement[cursor] === quote) {
      if (statement[cursor + 1] !== quote) return cursor + 1;
      cursor += 1;
    }
    cursor += 1;
  }
  return statement.length;
}

/**
 * The offset of the first executable character: past leading whitespace and
 * comments (an unterminated block comment stops at its opening).
 * @param {string} statement - SQL text.
 * @return {number}
 */
function leadingSqlExecutableOffset(statement) {
  let cursor = 0;
  while (cursor < statement.length) {
    while (cursor < statement.length &&
        SQL_WHITESPACE_PATTERN.test(statement[cursor])) {
      cursor += 1;
    }
    if (statement.startsWith(SQL_COMMENT_TOKEN.LINE, cursor)) {
      cursor = scanLineCommentEnd(statement, cursor);
      continue;
    }
    if (statement.startsWith(SQL_COMMENT_TOKEN.BLOCK_OPEN, cursor)) {
      const next = scanBlockCommentEnd(statement, cursor);
      if (next === SQL_COMMENT_SCAN_UNTERMINATED) return cursor;
      cursor = next;
      continue;
    }
    return cursor;
  }
  return cursor;
}

/**
 * The text with every comment outside quotes replaced by one space. Quoted
 * text is kept verbatim. An unterminated block comment is kept verbatim
 * (the text stays malformed, as PostgreSQL refuses it).
 * @param {string} statement - SQL text.
 * @return {string}
 */
function stripSqlComments(statement) {
  let out = '';
  let cursor = 0;
  while (cursor < statement.length) {
    if (SQL_QUOTE_CHARACTERS.has(statement[cursor])) {
      const end = scanQuotedEnd(statement, cursor);
      out += statement.slice(cursor, end);
      cursor = end;
      continue;
    }
    if (statement.startsWith(SQL_COMMENT_TOKEN.LINE, cursor)) {
      out += COMMENT_REPLACEMENT;
      cursor = scanLineCommentEnd(statement, cursor);
      continue;
    }
    if (statement.startsWith(SQL_COMMENT_TOKEN.BLOCK_OPEN, cursor)) {
      const end = scanBlockCommentEnd(statement, cursor);
      if (end === SQL_COMMENT_SCAN_UNTERMINATED) {
        return out + statement.slice(cursor);
      }
      out += COMMENT_REPLACEMENT;
      cursor = end;
      continue;
    }
    out += statement[cursor];
    cursor += 1;
  }
  return out;
}

export {
  leadingSqlExecutableOffset,
  stripSqlComments,
};
