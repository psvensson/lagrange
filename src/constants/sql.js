// Shared SQL fragments used across subsystems. Keep these small and composable
// (keywords + common operators) so callers can still build readable SQL.
const SQL = Object.freeze({
  INSERT_INTO: 'INSERT INTO',
  INSERT_OR_REPLACE_INTO: 'INSERT OR REPLACE INTO',
  INSERT_OR_IGNORE_INTO: 'INSERT OR IGNORE INTO',
  UPDATE: 'UPDATE',
  DELETE_FROM: 'DELETE FROM',
  SELECT: 'SELECT',
  WHERE: 'WHERE',
  VALUES: 'VALUES',
  SET: 'SET',
  AND: 'AND',
  OR: 'OR',
  IN: 'IN',
  LIMIT: 'LIMIT',
  ORDER_BY: 'ORDER BY',
  GROUP_BY: 'GROUP BY',
  RETURNING: 'RETURNING',
});

export {SQL};
