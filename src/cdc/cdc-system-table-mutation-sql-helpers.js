import {CDC_SQL} from './cdc-constants.js';
import {CDC_OPERATION, TYPEOF} from '../constants/index.js';

function serializeMutationValue(value) {
  if (value !== null && typeof value === TYPEOF.OBJECT) {
    return JSON.stringify(value);
  }
  return value;
}

export function buildSystemTableMutationSqlParts(mode, values) {
  const map = values || {};

  if (mode === CDC_OPERATION.INSERT) {
    const columns = Object.keys(map);
    const placeholders = columns
      .map(() => CDC_SQL.PARAM_PLACEHOLDER)
      .join(CDC_SQL.COMMA_SPACE);
    return {
      columns: columns.join(CDC_SQL.COMMA_SPACE),
      placeholders,
      values: columns.map((columnName) =>
        serializeMutationValue(map[columnName]),
      ),
    };
  }

  if (mode === CDC_OPERATION.UPDATE) {
    const columns = Object.keys(map);
    const setClause = columns
      .map((columnName) => `${columnName}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`)
      .join(CDC_SQL.COMMA_SPACE);
    return {
      setClause,
      values: columns.map((columnName) =>
        serializeMutationValue(map[columnName]),
      ),
    };
  }

  if (mode === CDC_OPERATION.DELETE) {
    const conditions = Object.keys(map);
    const whereStr = conditions
      .map((columnName) => `${columnName}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`)
      .join(CDC_SQL.WHERE_AND);
    return {
      whereStr,
      values: conditions.map((columnName) => map[columnName]),
    };
  }

  const conditions = Object.keys(map);
  const whereStr = conditions
    .map((columnName) => `${columnName}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`)
    .join(CDC_SQL.WHERE_AND);
  return {
    whereStr,
    values: conditions.map((columnName) => map[columnName]),
  };
}
