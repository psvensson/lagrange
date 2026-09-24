// The one statement a logical write sends its partition (quest
// reroute-carries-the-entry-id, verification round 3, B4). The partition
// binds a write's entryId to the digest of the statement it settled, so
// every carrier of one logical write's entryId must send the same text: the
// text the engine path sends. That text is the statement parsed as the
// engine parses it (its dialect's parameter order included) and rendered by
// the executor's one write renderer (renderWriteStatementSql). The engine's
// statement parse is this module's, and a carrier that holds its caller's
// statement (the CDC local lane) renders it here before sending it, never
// the caller's text.

import {reorderParams} from './pg/pg-translate.js';
import {
  isRenderedWriteStatement,
  renderWriteStatementSql,
} from './query-executor-sql-command-rendering.js';
import {SQLParser} from './sql-parser.js';

// What a statement's rendering is (R07): its partition text and parameters,
// a statement that does not parse, or a statement that is not a partition
// write (INSERT, UPDATE or DELETE).
const PARTITION_WRITE_STATEMENT_RENDERING = Object.freeze({
  RENDERED: 'rendered',
  UNPARSEABLE: 'unparseable',
  NOT_A_WRITE: 'not_a_write',
});

function parseText(text, dialect) {
  return new SQLParser(text, {dialect}).parse();
}

// A statement's AST through the engine's parses (its parse cache): the held
// parse (a clone), or a fresh parse the parses then hold.
function parseThroughParses(text, dialect, parses) {
  const held = parses.get(text, dialect);
  if (held) {
    return held;
  }
  const parsed = parseText(text, dialect);
  parses.set(text, dialect, parsed);
  return parses.cloneAst(parsed);
}

/**
 * Parse a statement as the engine parses it: its AST (through the engine's
 * parse cache when one is given) and its parameters in the order its
 * dialect binds them.
 * @param {string} text - The statement.
 * @param {Array} params - Its parameters.
 * @param {Object} [options] - {dialect, parses}: its dialect, and the parse
 *   cache to parse it through.
 * @return {{ast: Object, params: Array}} The parsed statement.
 * @throws {Error} When the statement does not parse.
 */
function parseStatement(text, params, {dialect, parses} = {}) {
  const ast = parses === undefined ? parseText(text, dialect) :
    parseThroughParses(text, dialect, parses);
  const mapped = ast._paramMapping?.length > 0;
  return {ast, params: mapped ? reorderParams(params, ast._paramMapping) :
    params};
}

/**
 * The statement a partition write is sent as: its text as the engine path
 * renders it, and its parameters as the engine binds them.
 * @param {string} sql - The caller's statement.
 * @param {Array} [params] - Its parameters.
 * @param {Object} [options] - {dialect, parses}: the caller's SQL dialect,
 *   and the engine's parse cache to parse it through (the one parse cache).
 * @return {Object} {state: RENDERED, sql, params}, or {state: UNPARSEABLE,
 *   error} or {state: NOT_A_WRITE}.
 */
function renderPartitionWriteStatement(sql, params = [],
  {dialect, parses} = {}) {
  let parsed;
  try {
    parsed = parseStatement(sql, params, {dialect, parses});
  } catch (error) {
    return {state: PARTITION_WRITE_STATEMENT_RENDERING.UNPARSEABLE,
      error: error.message};
  }
  if (!isRenderedWriteStatement(parsed.ast)) {
    return {state: PARTITION_WRITE_STATEMENT_RENDERING.NOT_A_WRITE};
  }
  return {
    state: PARTITION_WRITE_STATEMENT_RENDERING.RENDERED,
    sql: renderWriteStatementSql(parsed.ast),
    params: parsed.params,
  };
}

export {
  PARTITION_WRITE_STATEMENT_RENDERING,
  parseStatement,
  renderPartitionWriteStatement,
};
