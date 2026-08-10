import {CDC_SQL} from './cdc-constants.js';
import {CDC_OPERATION} from '../constants/index.js';

function serializeMutationValue(value) {
  if (value !== null && typeof value === 'object') {
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

  return buildWhereParts(map);
}

// The null-sentinel where-value convention: a null whereClause value is an
// IS NULL predicate with NO bound parameter — `column = ?` binding null is
// never true in SQL, so rendering it as an equality silently matches zero
// rows (the replica-operation terminal CAS guards on `completed_at: null`
// and refused forever). Mirrors buildSqlMutationPlan in
// control-plane-system-table-gateway-query-execution.js verbatim so the two
// builders share one convention.
function buildWhereParts(map) {
  const conditions = Object.keys(map);
  const whereStr = conditions
    .map((columnName) => (map[columnName] === null ?
      `${columnName}${CDC_SQL.IS_NULL_PREDICATE}` :
      `${columnName}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`))
    .join(CDC_SQL.WHERE_AND);
  return {
    whereStr,
    values: conditions
      .filter((columnName) => map[columnName] !== null)
      .map((columnName) => map[columnName]),
  };
}
