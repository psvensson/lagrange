import {NUM, TYPEOF} from '../constants/index.js';
import {canonicalizeSystemTableRow} from './system-row-normalizers.js';
import {
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_SQL_OPERATION,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_WRITE_OPERATION_KINDS,
  SYSTEM_TABLE_NAMES,
} from './control-plane-system-table-gateway-constants.js';

function normalizeCoalescingToken(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    null;
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObjectKeys(entry));
  }
  if (!value || typeof value !== TYPEOF.OBJECT) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      accumulator[key] = sortObjectKeys(value[key]);
      return accumulator;
    }, {});
}

function stableSerialize(value) {
  return JSON.stringify(sortObjectKeys(value));
}

function areCanonicalSystemTableRowsEqual(tableName, left, right) {
  if (
    !left ||
    !right ||
    typeof left !== TYPEOF.OBJECT ||
    typeof right !== TYPEOF.OBJECT
  ) {
    return false;
  }
  const canonicalLeft = canonicalizeSystemTableRow(tableName, left);
  const canonicalRight = canonicalizeSystemTableRow(tableName, right);
  return stableSerialize(canonicalLeft) === stableSerialize(canonicalRight);
}

function normalizeSystemTableName(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return SYSTEM_TABLE_NAMES.has(normalized) ? normalized : null;
}

function normalizePhaseScope(value) {
  if (value === CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP) {
    return CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP;
  }
  if (value === CONTROL_PLANE_PHASE_SCOPE.JOIN) {
    return CONTROL_PLANE_PHASE_SCOPE.JOIN;
  }
  return null;
}

function extractSystemTableNameFromSql(sql) {
  if (typeof sql !== TYPEOF.STRING || sql.trim().length === NUM.ZERO) {
    return null;
  }
  const normalizedSql = sql.trim();
  for (const matcher of [
    /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i,
    /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i,
    /^\s*update\s+([a-zA-Z_][\w]*)/i,
    /^\s*delete\s+from\s+([a-zA-Z_][\w]*)/i,
  ]) {
    const match = normalizedSql.match(matcher);
    if (match?.[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE]) {
      return normalizeSystemTableName(
        match[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE],
      );
    }
  }
  return null;
}

function normalizeSqlOperationKind(value) {
  if (value === CONTROL_PLANE_SQL_OPERATION.READ) {
    return CONTROL_PLANE_SQL_OPERATION.READ;
  }
  if (CONTROL_PLANE_WRITE_OPERATION_KINDS.has(value)) {
    return CONTROL_PLANE_SQL_OPERATION.WRITE;
  }
  return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
}

function normalizeMutationOperation(value) {
  if (value === CONTROL_PLANE_MUTATION_OPERATION.INSERT) {
    return CONTROL_PLANE_MUTATION_OPERATION.INSERT;
  }
  if (value === CONTROL_PLANE_MUTATION_OPERATION.UPDATE) {
    return CONTROL_PLANE_MUTATION_OPERATION.UPDATE;
  }
  if (value === CONTROL_PLANE_MUTATION_OPERATION.UPSERT) {
    return CONTROL_PLANE_MUTATION_OPERATION.UPSERT;
  }
  if (value === CONTROL_PLANE_MUTATION_OPERATION.DELETE) {
    return CONTROL_PLANE_MUTATION_OPERATION.DELETE;
  }
  return null;
}

function normalizeMutationMergePolicy(value) {
  if (value === CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE) {
    return CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE;
  }
  if (value === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT) {
    return CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT;
  }
  if (value === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING) {
    return CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING;
  }
  return null;
}

function createDeferredPromise() {
  let resolve = null;
  let reject = null;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return {promise, resolve, reject};
}

function normalizePositiveInteger(value, fallbackValue) {
  return Number.isInteger(value) && value > NUM.ZERO ? value : fallbackValue;
}

function hasUsablePrimaryKeyValue(value) {
  if (typeof value === TYPEOF.UNDEFINED || value === null) {
    return false;
  }
  if (typeof value === TYPEOF.STRING) {
    return value.trim().length > NUM.ZERO;
  }
  return true;
}

function normalizeDistinctStringArray(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : []).filter(
        (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
      ),
    ),
  ];
}

function extractSqlOperationKind(sql) {
  if (typeof sql !== TYPEOF.STRING) {
    return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
  }
  const normalizedSql = sql.trim().toLowerCase();
  if (
    normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SELECT)
  ) {
    return CONTROL_PLANE_SQL_OPERATION.READ;
  }
  if (
    normalizedSql.startsWith(
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.INSERT,
    ) ||
    normalizedSql.startsWith(
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UPDATE,
    ) ||
    normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELETE)
  ) {
    return CONTROL_PLANE_SQL_OPERATION.WRITE;
  }
  return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
}

function copyOption(target, source, key) {
  if (typeof source?.[key] === TYPEOF.UNDEFINED) {
    return target;
  }
  return {
    ...target,
    [key]: source[key],
  };
}

function resolveControlPlaneSystemTableDeliverySource({
  deliverySource = null,
  tableName = null,
  sql = null,
  operationKind = null,
  coalescingKey = null,
} = {}) {
  if (typeof deliverySource === TYPEOF.STRING && deliverySource.length > NUM.ZERO) {
    return deliverySource;
  }
  const normalizedTableName =
    normalizeSystemTableName(tableName) || extractSystemTableNameFromSql(sql);
  const normalizedOperationKindCandidate =
    normalizeSqlOperationKind(operationKind);
  const normalizedOperationKind =
    normalizedOperationKindCandidate !== CONTROL_PLANE_SQL_OPERATION.UNKNOWN ?
      normalizedOperationKindCandidate :
      extractSqlOperationKind(sql);
  if (
    !normalizedTableName ||
    normalizedOperationKind === CONTROL_PLANE_SQL_OPERATION.UNKNOWN
  ) {
    return null;
  }
  const deliveryPrefix =
    normalizedOperationKind === CONTROL_PLANE_SQL_OPERATION.READ ?
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_COLON_READ :
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_COLON_WRITE;
  const normalizedCoalescingKey = normalizeCoalescingToken(coalescingKey);
  const deliverySourceParts = normalizedCoalescingKey ?
    [deliveryPrefix, normalizedTableName, normalizedCoalescingKey] :
    [deliveryPrefix, normalizedTableName];
  return deliverySourceParts.join(
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERY_SOURCE_SEPARATOR,
  );
}

export {
  areCanonicalSystemTableRowsEqual,
  copyOption,
  createDeferredPromise,
  extractSqlOperationKind,
  extractSystemTableNameFromSql,
  hasUsablePrimaryKeyValue,
  normalizeCoalescingToken,
  normalizeDistinctStringArray,
  normalizeMutationMergePolicy,
  normalizeMutationOperation,
  normalizePhaseScope,
  normalizePositiveInteger,
  normalizeSqlOperationKind,
  normalizeSystemTableName,
  resolveControlPlaneSystemTableDeliverySource,
  sortObjectKeys,
  stableSerialize,
};
