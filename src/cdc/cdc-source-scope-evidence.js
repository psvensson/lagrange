import {digest} from '../utils/canonical-json-data.js';

const CDC_SOURCE_SCOPE_AUTHORITY = Object.freeze({
  BOOTSTRAP_GENESIS: 'bootstrap-genesis',
  OWNER_RPC_DESCRIPTOR: 'owner-rpc-descriptor',
  REPLICA_CREATE_WORKFLOW: 'replica-create-workflow',
});
const AUTHORITIES = new Set(Object.values(CDC_SOURCE_SCOPE_AUTHORITY));
const ACTIVE_AUTHORITIES = new Set([
  CDC_SOURCE_SCOPE_AUTHORITY.BOOTSTRAP_GENESIS,
  CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
]);
const PARTITION_STATE_NORMAL = 'NORMAL';
const PROPERTY_DESCRIPTOR_VALUE = 'value';

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataValue(row, snake, camel) {
  if (!isRecord(row)) return {present: false, value: undefined};
  for (const name of [snake, camel]) {
    const descriptor = Object.getOwnPropertyDescriptor(row, name);
    if (descriptor && Object.hasOwn(descriptor, PROPERTY_DESCRIPTOR_VALUE)) {
      return {present: true, value: descriptor.value};
    }
  }
  return {present: false, value: undefined};
}

function requiredString(row, snake, camel) {
  const field = ownDataValue(row, snake, camel);
  return field.present && typeof field.value === 'string' && field.value.length > 0 ?
    field.value : null;
}

function nullableString(row, snake, camel) {
  const field = ownDataValue(row, snake, camel);
  return field.present && (field.value === null || typeof field.value === 'string') ?
    field.value : undefined;
}

function positiveVersion(row, snake, camel) {
  const field = ownDataValue(row, snake, camel);
  return field.present && Number.isSafeInteger(field.value) && field.value > 0 ?
    field.value : null;
}

function nullablePositiveVersion(row, snake, camel) {
  const field = ownDataValue(row, snake, camel);
  if (!field.present) return undefined;
  if (field.value === null) return null;
  return Number.isSafeInteger(field.value) && field.value > 0 ? field.value : undefined;
}

function nonnegativeGeneration(row, snake, camel) {
  const field = ownDataValue(row, snake, camel);
  return field.present && Number.isSafeInteger(field.value) && field.value >= 0 ?
    field.value : null;
}

function sourceScopeFields(authority, partition, table) {
  const partitionId = requiredString(partition, 'partition_id', 'partitionId');
  const tableId = requiredString(partition, 'table_id', 'tableId');
  const describedTableId = requiredString(table, 'table_id', 'tableId');
  const tableName = requiredString(table, 'table_name', 'tableName');
  const rangeStart = nullableString(
    partition, 'partition_key_start', 'partitionKeyStart');
  const rangeEnd = nullableString(partition, 'partition_key_end', 'partitionKeyEnd');
  const partitionVersion = positiveVersion(
    partition, 'partition_version', 'partitionVersion');
  const activePartitionVersion = positiveVersion(
    table, 'active_partition_version', 'activePartitionVersion');
  const pendingPartitionVersion = nullablePositiveVersion(
    table, 'pending_partition_version', 'pendingPartitionVersion');
  const transitionState = nullableString(
    table, 'partition_transition_state', 'partitionTransitionState');
  const transitionGeneration = nonnegativeGeneration(
    table, 'partition_transition_generation', 'partitionTransitionGeneration');
  const partitionState = requiredString(partition, 'state', 'partitionState');
  return {authority, partitionId, tableId, describedTableId, tableName,
    rangeStart, rangeEnd, partitionVersion, activePartitionVersion,
    pendingPartitionVersion, transitionState, transitionGeneration,
    partitionState};
}

function validSourceScopeFields(fields) {
  return fields.partitionId !== null && fields.tableId !== null &&
    fields.tableId === fields.describedTableId && fields.tableName !== null &&
    fields.rangeStart !== undefined && fields.rangeEnd !== undefined &&
    fields.partitionVersion !== null &&
    fields.activePartitionVersion === fields.partitionVersion &&
    fields.pendingPartitionVersion !== undefined &&
    fields.transitionState !== undefined && fields.transitionGeneration !== null &&
    fields.partitionState === PARTITION_STATE_NORMAL;
}

function buildCdcSourceScopeEvidence(options = {}) {
  const authority = options.authority;
  const partition = options.partitionDescriptor;
  const table = options.tableDescriptor;
  if (!AUTHORITIES.has(authority) || !isRecord(partition) || !isRecord(table)) {
    return null;
  }
  const extracted = sourceScopeFields(authority, partition, table);
  if (!validSourceScopeFields(extracted)) return null;
  const {describedTableId: _describedTableId, ...fields} = extracted;
  const descriptorDigest = digest(fields);
  return Object.freeze({...fields, descriptorDigest,
    scopeId: digest({partitionId: fields.partitionId, descriptorDigest})});
}

function isCdcSourceScopeEvidence(value) {
  if (!isRecord(value) || !AUTHORITIES.has(value.authority)) return false;
  const rebuilt = buildCdcSourceScopeEvidence({authority: value.authority,
    partitionDescriptor: {partition_id: value.partitionId,
      table_id: value.tableId, partition_key_start: value.rangeStart,
      partition_key_end: value.rangeEnd, partition_version: value.partitionVersion,
      state: value.partitionState},
    tableDescriptor: {table_id: value.tableId, table_name: value.tableName,
      active_partition_version: value.activePartitionVersion,
      pending_partition_version: value.pendingPartitionVersion,
      partition_transition_state: value.transitionState,
      partition_transition_generation: value.transitionGeneration}});
  return rebuilt !== null && rebuilt.scopeId === value.scopeId &&
    rebuilt.descriptorDigest === value.descriptorDigest;
}

function isActiveCdcSourceScopeEvidence(value) {
  return isCdcSourceScopeEvidence(value) && ACTIVE_AUTHORITIES.has(value.authority);
}

function compareCdcSourceScopeEpoch(left, right) {
  if (left.transitionGeneration !== right.transitionGeneration) {
    return left.transitionGeneration - right.transitionGeneration;
  }
  return left.partitionVersion - right.partitionVersion;
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
  return isActiveCdcSourceScopeEvidence(scope) &&
    sourceScopeMatchesService(service, scope) ? scope : null;
}

export {
  CDC_SOURCE_SCOPE_AUTHORITY,
  buildCdcSourceScopeEvidence,
  compareCdcSourceScopeEpoch,
  eventCdcSourceScope,
  isActiveCdcSourceScopeEvidence,
  isCdcSourceScopeEvidence,
  sourceScopeMatchesService,
};
