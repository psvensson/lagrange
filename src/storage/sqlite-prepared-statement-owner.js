// The prepared statements of one SQLite database handle, prepared once.
//
// A statement belongs to the handle that prepared it, so the statements are
// held by handle identity: a file that is closed and reopened (a snapshot
// install replaces a replica's database file) is another handle and starts
// with no statements, and a closed handle's statements refuse exactly as
// `prepare` on it would. SQLite re-prepares a held statement against the
// current schema by itself, so a statement prepared before a migration reads
// the migrated shape.
//
// Only fixed SQL text belongs here (an owner's own constants): every distinct
// text is retained for the handle's lifetime. A statement is handed out for a
// complete `get`, `all` or `run`; an open iterator would hold it busy.

const DEFAULT_INTEGER_STATEMENTS = new WeakMap();
const EXACT_INTEGER_STATEMENTS = new WeakMap();

function statementsOf(statementsByDatabase, database) {
  let statements = statementsByDatabase.get(database);
  if (statements === undefined) {
    statements = new Map();
    statementsByDatabase.set(database, statements);
  }
  return statements;
}

/**
 * This handle's statement for a fixed SQL text, prepared on first use.
 * @param {Object} database - An open better-sqlite3 database handle.
 * @param {string} sql - The owner's fixed SQL text.
 * @return {Object} The prepared statement.
 */
function preparedStatementOf(database, sql) {
  const statements = statementsOf(DEFAULT_INTEGER_STATEMENTS, database);
  let statement = statements.get(sql);
  if (statement === undefined) {
    statement = database.prepare(sql);
    statements.set(sql, statement);
  }
  return statement;
}

/**
 * This handle's statement for a fixed SQL text that returns every integer as
 * an exact BigInt. It is a separate statement from the default one, so the
 * two integer modes of one text never share a statement.
 * @param {Object} database - An open better-sqlite3 database handle.
 * @param {string} sql - The owner's fixed SQL text.
 * @return {Object} The prepared statement, in safe-integer mode.
 */
function preparedExactStatementOf(database, sql) {
  const statements = statementsOf(EXACT_INTEGER_STATEMENTS, database);
  let statement = statements.get(sql);
  if (statement === undefined) {
    statement = database.prepare(sql).safeIntegers(true);
    statements.set(sql, statement);
  }
  return statement;
}

export {preparedExactStatementOf, preparedStatementOf};
