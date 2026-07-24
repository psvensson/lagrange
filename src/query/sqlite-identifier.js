const SIMPLE_SQLITE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const SQLITE_IDENTIFIER_QUOTE = '"';
const SQLITE_IDENTIFIER_ESCAPED_QUOTE = '""';

function renderSqliteIdentifier(identifier) {
  const value = String(identifier);
  if (SIMPLE_SQLITE_IDENTIFIER.test(value)) {
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
