const SIMPLE_SQLITE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const SQLITE_IDENTIFIER_QUOTE = '"';
const SQLITE_IDENTIFIER_ESCAPED_QUOTE = '""';

// SQLite reserved and clause keywords (sqlite.org/lang_keywords.html, verified
// against SQLite 3.49.2) that must be double-quoted when used as identifiers.
const SQLITE_RESERVED_IDENTIFIERS = new Set([
  'ADD', 'ALL', 'ALTER', 'AND', 'AS', 'ASC', 'AUTOINCREMENT', 'BETWEEN', 'BY',
  'CASE', 'CAST', 'CHECK', 'COLLATE', 'COMMIT', 'CONSTRAINT', 'CREATE', 'CROSS',
  'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'DEFAULT', 'DEFERRABLE',
  'DELETE', 'DESC', 'DISTINCT', 'DO', 'DROP', 'ELSE', 'END', 'ESCAPE', 'EXCEPT',
  'EXISTS', 'FALSE', 'FILTER', 'FOREIGN', 'FROM', 'FULL', 'GLOB', 'GROUP',
  'HAVING', 'IF', 'IN', 'INDEX', 'INNER', 'INSERT', 'INTERSECT', 'INTO', 'IS',
  'ISNULL', 'JOIN', 'LEFT', 'LIKE', 'LIMIT', 'MATCH', 'NATURAL', 'NOT',
  'NOTHING', 'NOTNULL', 'NULL', 'NULLS', 'ON', 'OR', 'ORDER', 'OUTER', 'OVER',
  'PRIMARY', 'RAISE', 'RECURSIVE', 'REFERENCES', 'REGEXP', 'RETURNING', 'RIGHT',
  'ROLLBACK', 'SELECT', 'SET', 'TABLE', 'THEN', 'TO', 'TRANSACTION', 'TRUE',
  'UNION', 'UNIQUE', 'UPDATE', 'USING', 'VALUES', 'WHEN', 'WHERE', 'WINDOW',
  'WITH',
]);

function renderSqliteIdentifier(identifier) {
  const value = String(identifier);
  if (SIMPLE_SQLITE_IDENTIFIER.test(value) &&
      !SQLITE_RESERVED_IDENTIFIERS.has(value.toUpperCase())) {
    return value;
  }
  return SQLITE_IDENTIFIER_QUOTE +
    value.replaceAll(
      SQLITE_IDENTIFIER_QUOTE,
      SQLITE_IDENTIFIER_ESCAPED_QUOTE,
    ) +
    SQLITE_IDENTIFIER_QUOTE;
}

export {renderSqliteIdentifier};
