/**
 * The transaction-control statement grammar (BEGIN, START TRANSACTION,
 * COMMIT, END, ROLLBACK, ABORT) the SQL parser executes by.
 *
 * A statement is recognised only when its WHOLE text is one of these
 * statements: a text that begins with a transaction keyword and continues
 * with anything else (`BEGIN\nINSERT ...`) is a syntax error, never the
 * transaction statement with the rest dropped.
 *
 * @module query/sql-transaction-control-grammar
 */

import {AST_TYPE} from './parser-constants.js';

const SQL_STATEMENT_TERMINATOR = ';';
const SQL_WHITESPACE_CHARACTER_PATTERN = /\s/u;
const TOKEN_SEPARATOR_PATTERN = /\s+/u;
const MODE_SEPARATOR = ',';

// What a text is to the transaction-control grammar.
const TRANSACTION_CONTROL_KIND = Object.freeze({
  // Not a transaction-control statement (another statement, or a text
  // holding more than one statement: the parser refuses that whole).
  NONE: 'NOT_TRANSACTION_CONTROL',
  // Begins with a transaction keyword but is not one of the statements.
  MALFORMED: 'MALFORMED_TRANSACTION_CONTROL',
});

const OPTIONAL_NOISE_WORDS = new Set(['WORK', 'TRANSACTION']);
const TRANSACTION_KEYWORD = 'TRANSACTION';

// Leading keyword -> the statement it begins and whether it takes the
// PostgreSQL transaction modes (BEGIN, START TRANSACTION) and whether the
// TRANSACTION noise word is required (START TRANSACTION).
const STATEMENT_BY_LEADING_KEYWORD = new Map([
  ['BEGIN', {type: AST_TYPE.BEGIN_TRANSACTION, modes: true}],
  ['START', {type: AST_TYPE.BEGIN_TRANSACTION, modes: true,
    requiresTransactionKeyword: true}],
  ['COMMIT', {type: AST_TYPE.COMMIT, modes: false}],
  ['END', {type: AST_TYPE.COMMIT, modes: false}],
  ['ROLLBACK', {type: AST_TYPE.ROLLBACK, modes: false}],
  ['ABORT', {type: AST_TYPE.ROLLBACK, modes: false}],
]);

// The PostgreSQL transaction modes, as token sequences (accepted, as BEGIN
// always accepted them; the engine does not enforce them).
const TRANSACTION_MODES = Object.freeze([
  ['ISOLATION', 'LEVEL', 'SERIALIZABLE'],
  ['ISOLATION', 'LEVEL', 'REPEATABLE', 'READ'],
  ['ISOLATION', 'LEVEL', 'READ', 'COMMITTED'],
  ['ISOLATION', 'LEVEL', 'READ', 'UNCOMMITTED'],
  ['READ', 'WRITE'],
  ['READ', 'ONLY'],
  ['NOT', 'DEFERRABLE'],
  ['DEFERRABLE'],
]);

/**
 * The text with trailing statement terminators and whitespace removed
 * (`COMMIT;` and `COMMIT ; ;` are the one statement COMMIT).
 * @param {string} text - Trimmed statement text.
 * @return {string} The text without its trailing terminators.
 */
function stripTrailingTerminators(text) {
  let end = text.length;
  while (
    end > 0 &&
    (text[end - 1] === SQL_STATEMENT_TERMINATOR ||
      SQL_WHITESPACE_CHARACTER_PATTERN.test(text[end - 1]))
  ) {
    end -= 1;
  }
  return text.slice(0, end);
}

function tokenize(statement) {
  return statement
    .split(MODE_SEPARATOR).join(` ${MODE_SEPARATOR} `)
    .split(TOKEN_SEPARATOR_PATTERN)
    .filter((token) => token.length > 0);
}

function matchModeAt(tokens, index) {
  return TRANSACTION_MODES.find((mode) =>
    mode.every((word, offset) => tokens[index + offset] === word)) || null;
}

/**
 * Whether tokens[index..] is a (possibly empty) transaction-mode list:
 * modes separated by whitespace or single commas, no trailing comma.
 * @param {string[]} tokens - Statement tokens.
 * @param {number} index - First token after the statement keywords.
 * @return {boolean}
 */
function isModeList(tokens, index) {
  let position = index;
  let expectMode = false;
  while (position < tokens.length) {
    const mode = matchModeAt(tokens, position);
    if (!mode) return false;
    position += mode.length;
    expectMode = tokens[position] === MODE_SEPARATOR;
    if (expectMode) position += 1;
  }
  return !expectMode;
}

/**
 * Classify a transaction-control statement the way the engine executes it.
 * This is the parser's own grammar, exported so a protocol surface that
 * must decide before executing (a failed transaction block admits only its
 * end) reads the same answer the engine would.
 *
 * @param {string} sql - Statement text.
 * @return {string} AST_TYPE.BEGIN_TRANSACTION, AST_TYPE.COMMIT or
 *   AST_TYPE.ROLLBACK for the whole text being that statement;
 *   TRANSACTION_CONTROL_KIND.MALFORMED for a text that begins with a
 *   transaction keyword and is not one of the statements;
 *   TRANSACTION_CONTROL_KIND.NONE otherwise (including any text that holds
 *   a further statement after a `;`, which the parser refuses whole).
 */
function classifyTransactionControlStatement(sql) {
  if (typeof sql !== 'string') return TRANSACTION_CONTROL_KIND.NONE;
  const statement = stripTrailingTerminators(sql.trim()).toUpperCase();
  if (statement.includes(SQL_STATEMENT_TERMINATOR)) {
    return TRANSACTION_CONTROL_KIND.NONE;
  }
  const tokens = tokenize(statement);
  const rule = STATEMENT_BY_LEADING_KEYWORD.get(tokens[0]);
  if (!rule) return TRANSACTION_CONTROL_KIND.NONE;
  let index = 1;
  if (rule.requiresTransactionKeyword) {
    if (tokens[index] !== TRANSACTION_KEYWORD) {
      return TRANSACTION_CONTROL_KIND.MALFORMED;
    }
    index += 1;
  } else if (OPTIONAL_NOISE_WORDS.has(tokens[index])) {
    index += 1;
  }
  const wellFormed = rule.modes ?
    isModeList(tokens, index) :
    index === tokens.length;
  return wellFormed ? rule.type : TRANSACTION_CONTROL_KIND.MALFORMED;
}

export {
  TRANSACTION_CONTROL_KIND,
  classifyTransactionControlStatement,
};
