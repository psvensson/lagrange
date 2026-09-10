const readStatementByDatabase = /* @__PURE__ */ new WeakMap();

/**
 * Retain one most-recent SELECT statement per SQLite database handle.
 * Repeated control-plane reads use stable SQL with new bound parameters, while
 * a single slot keeps arbitrary local SQL from creating an unbounded cache.
 *
 * @param {Object} database - SQLite-compatible database handle.
 * @param {string} sql - Exact SELECT statement text.
 * @return {Object} Prepared SQLite statement.
 */
function preparePartitionReadStatement(database, sql) {
  const retained = readStatementByDatabase.get(database);
  if (retained?.sql === sql) {
    return retained.statement;
  }
  const statement = database.prepare(sql);
  readStatementByDatabase.set(database, {sql, statement});
  return statement;
}

export {preparePartitionReadStatement};
