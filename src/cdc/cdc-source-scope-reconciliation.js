import {TABLES} from '../constants/index.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {isValidLeaderReadAuthorityWitness} from
  '../control-plane/control-plane-authoritative-read-witness.js';
import {buildControlPlaneReadAuthority} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {CONTROL_PLANE_READ_RECOVERY_ROUTING} from
  '../control-plane/control-plane-readiness-constants.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {AUTHORITATIVE_READ_SOURCE} from
  './cdc-integration-service-shared-constants.js';
import {captureCdcCoverageToken, isCurrentCdcCoverageLifecycle} from
  './cdc-coverage-lifecycle-owner.js';
import {CDC_SOURCE_SCOPE_AUTHORITY, buildCdcSourceScopeEvidence} from
  './cdc-source-scope-evidence.js';
import {digest} from '../utils/canonical-json-data.js';
import {compareRoutingKeys} from '../partition/split-key-comparator.js';

const PROPERTY_DESCRIPTOR_VALUE = 'value';

const CDC_SCOPE_RECONCILE_STATE = Object.freeze({
  COMPLETE: 'complete',
  DEFERRED: 'deferred',
});
const CDC_SCOPE_RECONCILE_REASON = Object.freeze({
  DEADLINE: 'cdc_coverage_descriptor_deadline_spent',
  IDENTITY_INVALID: 'cdc_coverage_descriptor_identity_invalid',
  LIFECYCLE_STALE: 'cdc_coverage_target_lifecycle_stale',
  READ_UNAVAILABLE: 'cdc_coverage_descriptor_read_unavailable',
  SANDWICH_CHANGED: 'cdc_coverage_descriptor_epoch_changed',
});

function deferred(reasonCode, extra = {}) {
  return Object.freeze({state: CDC_SCOPE_RECONCILE_STATE.DEFERRED,
    success: false, deferRetry: true, reasonCode, ...extra});
}

function buildCdcCoverageReadAuthority() {
  return buildControlPlaneReadAuthority({
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
    recoveryRouting:
      CONTROL_PLANE_READ_RECOVERY_ROUTING.PRIORITY_RECOVERY_BOOTSTRAP,
  });
}

function remainingMs(service, deadlineMs) {
  return Math.floor(deadlineMs - service.timeSource.now());
}

function witnessedSingleRow(result, tableName) {
  return result?.success === true &&
    result.source === AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE &&
    Array.isArray(result.rows) && result.rows.length === 1 &&
    isValidLeaderReadAuthorityWitness(result.readAuthorityWitness,
      INITIAL_PARTITION_IDS[tableName]) ? result.rows[0] : null;
}

function witnessedRows(result, tableName) {
  return result?.success === true &&
    result.source === AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE &&
    Array.isArray(result.rows) && result.rows.length > 0 &&
    isValidLeaderReadAuthorityWitness(result.readAuthorityWitness,
      INITIAL_PARTITION_IDS[tableName]) ? result.rows : null;
}

function ownNonemptyString(record, field) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(record, field);
  return descriptor && Object.hasOwn(descriptor, PROPERTY_DESCRIPTOR_VALUE) &&
    typeof descriptor.value === 'string' && descriptor.value.length > 0 ?
    descriptor.value : null;
}

function readOptions(authority, remaining) {
  return {readAuthority: authority, workClass: PRESSURE_WORK_CLASS.CRITICAL,
    deliveryPriority: PRESSURE_WORK_CLASS.CRITICAL,
    queryOptions: {timeoutMs: remaining}};
}

async function readDescriptorRow(service, lifecycle, deadlineMs, authority,
  tableName, field, value) {
  if (!isCurrentCdcCoverageLifecycle(lifecycle)) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.LIFECYCLE_STALE)};
  }
  const remaining = remainingMs(service, deadlineMs);
  if (remaining <= 0) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.DEADLINE)};
  }
  let result;
  try {
    result = await service.executeAuthoritativeSystemTableRead(tableName,
      `SELECT * FROM ${tableName} WHERE ${field} = ?`, [value],
      readOptions(authority, remaining));
  } catch (error) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.READ_UNAVAILABLE,
      {detail: error?.message || String(error)})};
  }
  if (!isCurrentCdcCoverageLifecycle(lifecycle)) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.LIFECYCLE_STALE)};
  }
  if (remainingMs(service, deadlineMs) <= 0) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.DEADLINE)};
  }
  const row = witnessedSingleRow(result, tableName);
  return row === null ?
    {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.READ_UNAVAILABLE)} :
    {row, witness: result.readAuthorityWitness};
}

async function readDescriptorRows(service, lifecycle, deadlineMs, authority,
  tableName, sql, params) {
  if (!isCurrentCdcCoverageLifecycle(lifecycle)) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.LIFECYCLE_STALE)};
  }
  const remaining = remainingMs(service, deadlineMs);
  if (remaining <= 0) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.DEADLINE)};
  }
  let result;
  try {
    result = await service.executeAuthoritativeSystemTableRead(tableName,
      sql, params, readOptions(authority, remaining));
  } catch (error) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.READ_UNAVAILABLE,
      {detail: error?.message || String(error)})};
  }
  if (!isCurrentCdcCoverageLifecycle(lifecycle)) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.LIFECYCLE_STALE)};
  }
  if (remainingMs(service, deadlineMs) <= 0) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.DEADLINE)};
  }
  const rows = witnessedRows(result, tableName);
  return rows === null ?
    {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.READ_UNAVAILABLE)} :
    {rows, witness: result.readAuthorityWitness};
}

function exactRequest(request) {
  return request && (request.tableId === undefined ||
    typeof request.tableId === 'string' && request.tableId.length > 0) &&
    typeof request.tableName === 'string' &&
    request.tableName.length > 0 && typeof request.partitionId === 'string' &&
    request.partitionId.length > 0;
}

function sourceScopeMatchesRequest(scope, request) {
  return (request.tableId === undefined || scope.tableId === request.tableId) &&
    scope.tableName === request.tableName &&
    scope.partitionId === request.partitionId;
}

function stableDescriptorSandwich(before, after, request) {
  return before !== null && after !== null && before.scopeId === after.scopeId &&
    sourceScopeMatchesRequest(before, request);
}

async function readDescriptorSandwich(service, lifecycle, request, authority) {
  const tableField = request.tableId === undefined ? 'table_name' : 'table_id';
  const tableValue = request.tableId ?? request.tableName;
  const tableBefore = await readDescriptorRow(service, lifecycle,
    request.deadlineMs, authority, TABLES.TABLES, tableField, tableValue);
  if (tableBefore.refusal) return tableBefore;
  const observedTableId = ownNonemptyString(tableBefore.row, 'table_id');
  if (observedTableId === null) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.IDENTITY_INVALID,
      {deferRetry: false})};
  }
  const partition = await readDescriptorRow(service, lifecycle,
    request.deadlineMs, authority, TABLES.PARTITIONS, 'partition_id',
    request.partitionId);
  if (partition.refusal) return partition;
  const tableAfter = await readDescriptorRow(service, lifecycle,
    request.deadlineMs, authority, TABLES.TABLES, 'table_id', observedTableId);
  return tableAfter.refusal ? tableAfter : {tableBefore, partition, tableAfter};
}

function rangeStartOrder(left, right) {
  if (left.rangeStart === null) return right.rangeStart === null ? 0 : -1;
  if (right.rangeStart === null) return 1;
  return compareRoutingKeys(left.rangeStart, right.rangeStart);
}

function completeOrderedScopes(scopes) {
  if (scopes.length === 0) return null;
  const ordered = [...scopes].sort(rangeStartOrder);
  if (ordered[0].rangeStart !== null ||
      ordered[ordered.length - 1].rangeEnd !== null) return null;
  const ids = new Set();
  for (let index = 0; index < ordered.length; index += 1) {
    const scope = ordered[index];
    if (ids.has(scope.partitionId)) return null;
    ids.add(scope.partitionId);
    if (index > 0 && ordered[index - 1].rangeEnd !== scope.rangeStart) {
      return null;
    }
  }
  return Object.freeze(ordered);
}

async function readDescriptorSetSandwich(service, lifecycle, request, authority) {
  const tableBefore = await readDescriptorRow(service, lifecycle,
    request.deadlineMs, authority, TABLES.TABLES, 'table_name',
    request.tableName);
  if (tableBefore.refusal) {
    return tableBefore;
  }
  const tableId = ownNonemptyString(tableBefore.row, 'table_id');
  if (tableId === null) {
    return {refusal: deferred(CDC_SCOPE_RECONCILE_REASON.IDENTITY_INVALID,
      {deferRetry: false})};
  }
  const partitions = await readDescriptorRows(service, lifecycle,
    request.deadlineMs, authority,
    TABLES.PARTITIONS,
    `SELECT * FROM ${TABLES.PARTITIONS} WHERE table_id = ? AND state = ?`,
    [tableId, 'NORMAL']);
  if (partitions.refusal) {
    return partitions;
  }
  const tableAfter = await readDescriptorRow(service, lifecycle,
    request.deadlineMs, authority, TABLES.TABLES, 'table_id', tableId);
  return tableAfter.refusal ? tableAfter :
    {tableBefore, tableAfter, partitionRows: partitions.rows,
      partitionWitness: partitions.witness};
}

function buildOrderedSourceScopes(sandwich, tableName) {
  const scopes = [];
  for (const partitionDescriptor of sandwich.partitionRows) {
    const before = buildCdcSourceScopeEvidence({
      authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
      tableDescriptor: sandwich.tableBefore.row, partitionDescriptor});
    const after = buildCdcSourceScopeEvidence({
      authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
      tableDescriptor: sandwich.tableAfter.row, partitionDescriptor});
    if (!stableDescriptorSandwich(before, after,
      {tableName, partitionId: before?.partitionId})) return null;
    scopes.push(before);
  }
  return completeOrderedScopes(scopes);
}

async function acquireWitnessedCdcSourceScope(service, request = {}) {
  if (!exactRequest(request) || !Number.isFinite(request.deadlineMs)) {
    return deferred(CDC_SCOPE_RECONCILE_REASON.IDENTITY_INVALID,
      {deferRetry: false});
  }
  const lifecycle = request.lifecycle ?? captureCdcCoverageToken(service);
  if (!isCurrentCdcCoverageLifecycle(lifecycle)) {
    return deferred(CDC_SCOPE_RECONCILE_REASON.LIFECYCLE_STALE);
  }
  const authority = buildCdcCoverageReadAuthority();
  const sandwich = await readDescriptorSandwich(
    service, lifecycle, request, authority);
  if (sandwich.refusal) return sandwich.refusal;
  const {tableBefore, partition, tableAfter} = sandwich;
  const before = buildCdcSourceScopeEvidence({
    authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
    tableDescriptor: tableBefore.row, partitionDescriptor: partition.row});
  const after = buildCdcSourceScopeEvidence({
    authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
    tableDescriptor: tableAfter.row, partitionDescriptor: partition.row});
  if (!stableDescriptorSandwich(before, after, request)) {
    return deferred(CDC_SCOPE_RECONCILE_REASON.SANDWICH_CHANGED);
  }
  const witnesses = Object.freeze({tableBefore: tableBefore.witness,
    partition: partition.witness, tableAfter: tableAfter.witness});
  return Object.freeze({state: CDC_SCOPE_RECONCILE_STATE.COMPLETE, success: true,
    sourceScope: before, observationId: digest({sourceScope: before, witnesses}),
    witnesses});
}

async function acquireWitnessedCdcSourceScopes(service, request = {}) {
  if (!request || typeof request.tableName !== 'string' ||
      request.tableName.length === 0 || !Number.isFinite(request.deadlineMs)) {
    return deferred(CDC_SCOPE_RECONCILE_REASON.IDENTITY_INVALID,
      {deferRetry: false});
  }
  const lifecycle = request.lifecycle ?? captureCdcCoverageToken(service);
  if (!isCurrentCdcCoverageLifecycle(lifecycle)) {
    return deferred(CDC_SCOPE_RECONCILE_REASON.LIFECYCLE_STALE);
  }
  const sandwich = await readDescriptorSetSandwich(service, lifecycle, request,
    buildCdcCoverageReadAuthority());
  if (sandwich.refusal) return sandwich.refusal;
  const ordered = buildOrderedSourceScopes(sandwich, request.tableName);
  if (ordered === null) {
    return deferred(CDC_SCOPE_RECONCILE_REASON.SANDWICH_CHANGED);
  }
  return Object.freeze({state: CDC_SCOPE_RECONCILE_STATE.COMPLETE,
    success: true, sourceScopes: ordered,
    observationId: digest({sourceScopes: ordered,
      tableBefore: sandwich.tableBefore.witness,
      partitions: sandwich.partitionWitness,
      tableAfter: sandwich.tableAfter.witness})});
}

export {
  CDC_SCOPE_RECONCILE_REASON,
  CDC_SCOPE_RECONCILE_STATE,
  acquireWitnessedCdcSourceScope,
  acquireWitnessedCdcSourceScopes,
  buildCdcCoverageReadAuthority,
};
