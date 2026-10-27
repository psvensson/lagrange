// Read-only SQLite mechanics shared by the existing retained application
// stores. Each caller supplies its own complete projection and owned DDL;
// this module defines no bootstrap eligibility or application schema.
const RETAINED_STORE_ERROR = Object.freeze({
  SCHEMA_UNAVAILABLE: 'partition_retained_store_schema_unavailable',
  SCHEMA_CONTRARY: 'partition_retained_store_schema_contrary',
  ROW_CONTRARY: 'partition_retained_store_row_contrary',
});
const SCHEMA_OBJECTS =
  'SELECT type, name, sql FROM sqlite_schema WHERE tbl_name = ? ORDER BY type, name';
const NAMED_SCHEMA_OBJECT = 'SELECT type FROM sqlite_schema WHERE name = ?';
const SCHEMA_KIND = Object.freeze({TABLE: 'table', INDEX: 'index', TRIGGER: 'trigger'});
const SQL_FORMAT = Object.freeze({IDEMPOTENT: ' IF NOT EXISTS', SPACE: ' ', CAPTURE: '$1'});

function retainedStoreError(code, table) {
  return Object.assign(new Error(code), {code, table});
}

function retainedStoreTableExistsIn(db, table) {
  if (!db.inTransaction) {
    throw retainedStoreError(RETAINED_STORE_ERROR.SCHEMA_UNAVAILABLE, table);
  }
  const object = db.prepare(NAMED_SCHEMA_OBJECT).get(table);
  if (object === undefined) return false;
  if (object.type !== SCHEMA_KIND.TABLE) {
    throw retainedStoreError(RETAINED_STORE_ERROR.SCHEMA_CONTRARY, table);
  }
  return true;
}

// These internal owners use unquoted identifiers and no string literals in
// their DDL. Normalize only formatting and SQLite's removal of IF NOT EXISTS;
// keep every constraint, type, default, column and index in the comparison.
// ALTER ADD COLUMN from an older owner produces the same normalized shape.
function normalizedOwnerSql(sql) {
  return sql.replace(SQL_FORMAT.IDEMPOTENT, '').replace(/\s+/gu, SQL_FORMAT.SPACE)
    .replace(/\s*([(),=])\s*/gu, SQL_FORMAT.CAPTURE).trim();
}

function readRetainedStoreRowsIn(db, {table, select, create, indexes = []}) {
  if (!retainedStoreTableExistsIn(db, table)) {
    throw retainedStoreError(RETAINED_STORE_ERROR.SCHEMA_UNAVAILABLE, table);
  }
  // A complete explicit projection proves required columns exist even when
  // the table is empty. A failed prepare is unavailable, never empty evidence.
  const statement = db.prepare(select).safeIntegers(true);
  const objects = db.prepare(SCHEMA_OBJECTS).all(table);
  const definition = objects.find(({type}) => type === SCHEMA_KIND.TABLE);
  if (!definition) throw retainedStoreError(RETAINED_STORE_ERROR.SCHEMA_UNAVAILABLE, table);
  const actualIndexes = objects.filter(({type, sql}) => type === SCHEMA_KIND.INDEX && sql !== null);
  const expectedIndexes = indexes.map(normalizedOwnerSql);
  if (normalizedOwnerSql(definition.sql) !== normalizedOwnerSql(create) ||
      objects.some(({type}) => type === SCHEMA_KIND.TRIGGER) ||
      actualIndexes.some(({sql}) => !expectedIndexes.includes(normalizedOwnerSql(sql)))) {
    throw retainedStoreError(RETAINED_STORE_ERROR.SCHEMA_CONTRARY, table);
  }
  if (actualIndexes.length !== expectedIndexes.length) {
    throw retainedStoreError(RETAINED_STORE_ERROR.SCHEMA_UNAVAILABLE, table);
  }
  return statement.all();
}

function isStoredInteger(value, minimum = null) {
  return typeof value === 'bigint' && (minimum === null || value >= minimum);
}

function isStoredNullableText(value) {
  return value === null || typeof value === 'string';
}

function isStoredNullableInteger(value, minimum = null) {
  return value === null || isStoredInteger(value, minimum);
}

export {RETAINED_STORE_ERROR, retainedStoreError, retainedStoreTableExistsIn,
  readRetainedStoreRowsIn,
  isStoredInteger, isStoredNullableText, isStoredNullableInteger};
