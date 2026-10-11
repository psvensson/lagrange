import {digest} from '../utils/canonical-json-data.js';

const CDC_SOURCE_SCOPE_AUTHORITY = Object.freeze({
  BOOTSTRAP_GENESIS: 'bootstrap-genesis',
  REPLICA_CREATE_WORKFLOW: 'replica-create-workflow',
});
const AUTHORITIES = new Set(Object.values(CDC_SOURCE_SCOPE_AUTHORITY));

function positiveVersion(value) {
  const version = Number(value);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function descriptorField(row, snake, camel) {
  return row?.[snake] ?? row?.[camel] ?? null;
}

function buildCdcSourceScopeEvidence(options = {}) {
  const authority = options.authority;
  const partition = options.partitionDescriptor || {};
  const table = options.tableDescriptor || {};
  if (!AUTHORITIES.has(authority)) return null;
  const partitionId = nonEmpty(descriptorField(
    partition, 'partition_id', 'partitionId'));
  const tableId = nonEmpty(descriptorField(partition, 'table_id', 'tableId'));
  const describedTableId = nonEmpty(descriptorField(table, 'table_id', 'tableId'));
  const tableName = nonEmpty(descriptorField(table, 'table_name', 'tableName'));
  const partitionVersion = positiveVersion(descriptorField(
    partition, 'partition_version', 'partitionVersion'));
  const activePartitionVersion = positiveVersion(descriptorField(
    table, 'active_partition_version', 'activePartitionVersion'));
  if (!partitionId || !tableId || !describedTableId || tableId !== describedTableId ||
      !tableName || partitionVersion === null ||
      activePartitionVersion !== partitionVersion) return null;
  const fields = {authority, partitionId, tableId, tableName,
    rangeStart: descriptorField(partition, 'partition_key_start', 'partitionKeyStart'),
    rangeEnd: descriptorField(partition, 'partition_key_end', 'partitionKeyEnd'),
    partitionVersion, activePartitionVersion};
  const descriptorDigest = digest(fields);
  return Object.freeze({...fields, descriptorDigest,
    scopeId: digest({partitionId, descriptorDigest})});
}

function isCdcSourceScopeEvidence(value) {
  if (!value || !AUTHORITIES.has(value.authority)) return false;
  const rebuilt = buildCdcSourceScopeEvidence({authority: value.authority,
    partitionDescriptor: {partition_id: value.partitionId,
      table_id: value.tableId, partition_key_start: value.rangeStart,
      partition_key_end: value.rangeEnd,
      partition_version: value.partitionVersion},
    tableDescriptor: {table_id: value.tableId, table_name: value.tableName,
      active_partition_version: value.activePartitionVersion}});
  return rebuilt !== null && rebuilt.scopeId === value.scopeId &&
    rebuilt.descriptorDigest === value.descriptorDigest;
}

function sourceScopeMatchesService(service, scope) {
  const range = service.getKeyRange?.() ?? service.keyRange ?? {};
  return scope.partitionId === service.partitionId &&
    scope.tableId === service.tableId && scope.tableName === service.tableName &&
    (scope.rangeStart ?? null) === (range.start ?? null) &&
    (scope.rangeEnd ?? null) === (range.end ?? null);
}

function eventCdcSourceScope(service) {
  const scope = service.cdcSourceScopeEvidence;
  return isCdcSourceScopeEvidence(scope) && sourceScopeMatchesService(service, scope) ?
    scope : null;
}

export {
  CDC_SOURCE_SCOPE_AUTHORITY,
  buildCdcSourceScopeEvidence,
  eventCdcSourceScope,
  isCdcSourceScopeEvidence,
  sourceScopeMatchesService,
};
