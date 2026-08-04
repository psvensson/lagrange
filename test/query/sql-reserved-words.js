/**
 * Reserved words that generated SQL identifiers must avoid: bare use of
 * any of these fails to parse (or parses as a keyword), so every
 * property-test identifier arbitrary filters against this set.
 */
export const SQL_RESERVED = new Set([
  'select', 'from', 'where', 'insert', 'update', 'delete',
  'into', 'values', 'set', 'create', 'drop', 'table', 'index',
  'and', 'or', 'not', 'null', 'true', 'false', 'as', 'on',
  'join', 'left', 'right', 'inner', 'outer', 'order', 'by',
  'group', 'having', 'limit', 'offset', 'union', 'all', 'in',
  'between', 'like', 'is', 'case', 'when', 'then', 'else',
  'end', 'cast', 'exists', 'with', 'recursive', 'distinct',
  'asc', 'desc', 'begin', 'commit', 'rollback', 'int',
  'integer', 'text', 'real', 'blob', 'boolean', 'varchar',
  'char', 'float', 'numeric', 'decimal', 'primary', 'key',
  'if', 'do', 'for', 'to',
  // node-sql-parser reserves CALL as a statement keyword (procedure
  // calls): bare `call` fails to parse exactly like bare `select`,
  // while quoted "call" is fine. Found by sql-parser-pg.property as a
  // shrunk counterexample (seed 1605617986) once the random seed
  // happened to generate it.
  'call',
]);
