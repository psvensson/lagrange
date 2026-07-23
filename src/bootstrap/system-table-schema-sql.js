const LOCAL_STR_RPAREN = ')';

/**
 * Generate SQL CREATE TABLE statement from schema.
 * @param {Object} schema - Table schema definition.
 * @return {string} SQL CREATE TABLE statement.
 */
function generateCreateTableSQL(schema) {
  const columnDefs = schema.columns.map((col) => {
    let def = `${col.name} ${col.type}`;
    if (col.primaryKey) {
      def += ' PRIMARY KEY';
    }
    if (col.notNull) {
      def += ' NOT NULL';
    }
    if (col.unique) {
      def += ' UNIQUE';
    }
    if (col.defaultValue !== undefined) {
      def += ` DEFAULT ${col.defaultValue}`;
    }
    return def;
  }).join(', ');

  let sql = `CREATE TABLE IF NOT EXISTS ${schema.tableName} (${columnDefs}`;

  if (schema.primaryKey && schema.primaryKey.length > 0) {
    const pkCols = schema.primaryKey.join(', ');
    sql += `, PRIMARY KEY (${pkCols})`;
  }

  sql += LOCAL_STR_RPAREN;
  return sql;
}

/**
 * Generate SQL CREATE INDEX statements from schema.
 * @param {Object} schema - Table schema definition.
 * @return {Array<string>} Array of SQL CREATE INDEX statements.
 */
function generateCreateIndexSQL(schema) {
  if (!schema.indices || schema.indices.length === 0) {
    return [];
  }

  return schema.indices.map((idx) => {
    const columns = idx.columns.join(', ');
    const uniqueness = idx.unique ? 'UNIQUE ' : '';
    return `CREATE ${uniqueness}INDEX IF NOT EXISTS ${idx.name} ` +
      `ON ${schema.tableName}(${columns})`;
  });
}

export {
  generateCreateIndexSQL,
  generateCreateTableSQL,
};
