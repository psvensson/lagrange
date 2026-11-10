/**
 * The base of a table-policy write (census site 6 of quest
 * replica-admission-from-committed-operation, attempt 2; three-class rule,
 * shared row: the TABLES row is written by table creation, split and policy
 * owners). The base is this node's own last committed policy (the committed
 * policy fence) or, at an unknown position, one committed read through the
 * gateway with typed unavailability - never the projection.
 */

import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {requireConfirmedSingleRowMutation} from
  '../control-plane/control-plane-single-row-confirmation.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {POLICY_ERROR_CODE, POLICY_SUBSYSTEM} from './policy-constants.js';

const MAX_COMMITTED_POLICY_FENCES = 256;
const MAX_SUPERSEDED_POLICY_SNAPSHOTS = 64;
const TABLE_POLICY_BASE_READ_SQL = 'SELECT * FROM tables WHERE table_id = ?';
const TABLE_POLICY_BASE_UNAVAILABLE_MESSAGE =
  'The committed table row could not be read as the policy write base';
const TABLE_POLICY_WRITE_DELIVERY_PRIORITY = 'critical';
const POLICY_MUTATION_CONFIRMATION = Object.freeze({
  ownerName: POLICY_SUBSYSTEM.TABLE_POLICY,
  tableName: TABLES.TABLES,
  changed: Object.freeze({code: POLICY_ERROR_CODE.OBSERVATION_CHANGED,
    message: 'The table policy mutation affected no row'}),
  unconfirmed: Object.freeze({code: POLICY_ERROR_CODE.OUTCOME_UNCONFIRMED,
    message: 'The table policy mutation application is not confirmed'}),
});

function retireCommittedPolicyFence(service, tableId) {
  if (!tableId) {
    return;
  }
  service.committedPolicyFences?.delete(tableId);
  service.supersededSnapshots?.delete(tableId);
}

function recordCommittedPolicyFence(service, tableId, fenceEntry, snapshots = []) {
  if (!tableId) {
    return;
  }
  const maxSnapshots = service.maxSupersededPolicySnapshots ||
    MAX_SUPERSEDED_POLICY_SNAPSHOTS;
  const maxFences = service.maxCommittedPolicyFences ||
    MAX_COMMITTED_POLICY_FENCES;
  const boundedSnapshots = Array.isArray(snapshots) ?
    snapshots.slice(-maxSnapshots) :
    [];
  if (service.supersededSnapshots.has(tableId)) {
    service.supersededSnapshots.delete(tableId);
  }
  while (
    service.supersededSnapshots.size >= maxSnapshots &&
    service.supersededSnapshots.size > 0
  ) {
    const oldestSnapshotKey = service.supersededSnapshots.keys().next().value;
    service.supersededSnapshots.delete(oldestSnapshotKey);
  }
  service.supersededSnapshots.set(tableId, boundedSnapshots);

  if (service.committedPolicyFences.has(tableId)) {
    service.committedPolicyFences.delete(tableId);
  }
  while (
    service.committedPolicyFences.size >= maxFences &&
    service.committedPolicyFences.size > 0
  ) {
    const oldestFenceKey = service.committedPolicyFences.keys().next().value;
    service.committedPolicyFences.delete(oldestFenceKey);
    service.supersededSnapshots.delete(oldestFenceKey);
  }
  service.committedPolicyFences.set(tableId, {
    ...fenceEntry,
    supersededSnapshots: boundedSnapshots,
  });
}

function isSupersededByCommittedPolicyFence(service, fence, row, tableId = null) {
  if (!row) {
    return true;
  }
  const rowPolicies = row.table_policies ?? null;
  const rowUpdatedAt = row.updated_at ?? null;
  const rowVersion = row.version ?? null;
  const fenceVersion = fence.version ?? null;
  if (
    rowVersion !== null &&
    fenceVersion !== null &&
    Number.isFinite(Number(rowVersion)) &&
    Number.isFinite(Number(fenceVersion))
  ) {
    if (Number(rowVersion) < Number(fenceVersion)) {
      return true;
    }
    if (
      Number(rowVersion) > Number(fenceVersion) ||
      (rowPolicies === (fence.table_policies ?? null) &&
        rowUpdatedAt === (fence.updated_at ?? null))
    ) {
      return false;
    }
  }
  if (
    fence.table_policies !== undefined &&
    rowPolicies === fence.table_policies &&
    rowUpdatedAt === (fence.updated_at ?? null)
  ) {
    return false;
  }
  const snapshots =
    (tableId ? service.supersededSnapshots?.get(tableId) : null) ||
    fence.supersededSnapshots;
  if (
    Array.isArray(snapshots) &&
    snapshots.some(
      (snapshot) =>
        snapshot.table_policies === rowPolicies &&
        snapshot.updated_at === rowUpdatedAt,
    )
  ) {
    return true;
  }
  if (
    rowVersion !== null &&
    fenceVersion !== null &&
    Number.isFinite(Number(rowVersion)) &&
    Number.isFinite(Number(fenceVersion))
  ) {
    return Number(rowVersion) < Number(fenceVersion);
  }
  return (
    Number.isFinite(rowUpdatedAt) &&
    Number.isFinite(fence.updated_at) &&
    rowUpdatedAt < fence.updated_at
  );
}

function isStaleAgainstCommittedPolicyFence(service, tableId, row) {
  const fence = service.committedPolicyFences?.get(tableId);
  if (!fence) {
    return false;
  }
  if (service.isSupersededByCommittedPolicyFence(fence, row, tableId)) {
    return true;
  }
  retireCommittedPolicyFence(service, tableId);
  return false;
}

function applyCommittedPolicyFence(service, tableId, row) {
  const fence = service.committedPolicyFences?.get(tableId);
  if (!fence || !row) {
    return row;
  }
  const rowVersion = Number(row.version ?? NaN);
  const fenceVersion = Number(fence.version ?? NaN);
  if (
    Number.isFinite(rowVersion) &&
    Number.isFinite(fenceVersion) &&
    fenceVersion <= rowVersion &&
    row.table_policies === undefined
  ) {
    retireCommittedPolicyFence(service, tableId);
    return row;
  }
  if (service.isSupersededByCommittedPolicyFence(fence, row, tableId)) {
    return {
      ...row,
      table_policies: fence.table_policies,
      updated_at: fence.updated_at,
      ...(fence.version !== undefined ? {version: fence.version} : {}),
    };
  }
  retireCommittedPolicyFence(service, tableId);
  return row;
}

function commitPolicyFenceAfterWrite(
  service,
  tableId,
  table,
  serializedPolicy,
  updatedAt,
  updatedStoredPolicy,
  priorSupersededSnapshots,
  priorFenceVersion,
) {
  const existingFence = service.committedPolicyFences.get(tableId);
  const priorSnapshot = {
    table_policies: table?.table_policies ?? null,
    updated_at: table?.updated_at ?? null,
  };
  const supersededSnapshots = existingFence ?
    [
      ...priorSupersededSnapshots,
      {
        table_policies: existingFence.table_policies,
        updated_at: existingFence.updated_at,
      },
      priorSnapshot,
    ] :
    [...priorSupersededSnapshots, priorSnapshot];
  const nextVersion = Math.max(
    priorFenceVersion,
    Number(table?.version ?? 0),
  ) + 1;
  service.recordCommittedPolicyFence(
    tableId,
    {
      table_policies: serializedPolicy,
      updated_at: updatedAt,
      version: updatedStoredPolicy.version ?? nextVersion,
    },
    supersededSnapshots,
  );
}

function hasCommittedRowCaughtUpToFence(service, tableId, fence, committed) {
  if (!committed) {
    return false;
  }
  if (typeof service?.isSupersededByCommittedPolicyFence === 'function') {
    return !service.isSupersededByCommittedPolicyFence(
      fence,
      committed,
      tableId,
    );
  }
  return !isSupersededByCommittedPolicyFence(service, fence, committed, tableId);
}

/**
 * @param {Object} service - The TablePolicyService.
 * @param {string} tableId - Table ID.
 * @return {Promise<Object|null>} The base row ({table_policies,
 *   updated_at, ...}); rejects typed TABLE_POLICY_BASE_UNAVAILABLE with the
 *   authority's retryAfterMs.
 */
async function readCommittedPolicyBase(service, tableId) {
  const fence = service.committedPolicyFences?.get(tableId) ?? null;
  const read = await service.getControlPlaneSystemTableGateway()
    .readAuthoritativeRows(TABLES.TABLES, TABLE_POLICY_BASE_READ_SQL,
      [tableId], {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      });
  if (read?.success !== true || !Array.isArray(read.rows)) {
    const refusal = new Error(TABLE_POLICY_BASE_UNAVAILABLE_MESSAGE);
    refusal.code = POLICY_ERROR_CODE.BASE_UNAVAILABLE;
    refusal.retryAfterMs = Number.isFinite(read?.retryAfterMs) ?
      read.retryAfterMs : null;
    throw refusal;
  }
  const committed = read.rows[0] ?? null;
  if (!fence) {
    return committed;
  }
  if (hasCommittedRowCaughtUpToFence(service, tableId, fence, committed)) {
    retireCommittedPolicyFence(service, tableId);
    return committed;
  }
  return {
    ...(committed || {}),
    table_id: tableId,
    table_policies: fence.table_policies,
    updated_at: fence.updated_at,
    ...(fence.version !== undefined ? {version: fence.version} : {}),
  };
}

/**
 * Write the policy conditionally on its committed base: a zero-row answer
 * is another writer's change, refused typed
 * (TABLE_POLICY_MUTATION_OBSERVATION_CHANGED); any refusal drops the kept
 * base, so the next update re-reads it from the committed authority.
 * @param {Object} service - The TablePolicyService.
 * @param {string} tableId - Table ID.
 * @param {Object|null} base - The committed base row.
 * @param {string} serializedPolicy - The next stored policy.
 * @param {number} updatedAt - The write's updated_at.
 * @return {Promise<void>}
 */
async function writePolicyConditionally(service, tableId, base,
  serializedPolicy, updatedAt) {
  const mutationResult = await service.getControlPlaneSystemTableGateway()
    .submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.TABLES,
      whereClause: {
        table_id: tableId,
        table_policies: base?.table_policies ?? null,
        updated_at: base?.updated_at ?? null,
      },
      data: {table_policies: serializedPolicy, updated_at: updatedAt},
    }, {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: TABLE_POLICY_WRITE_DELIVERY_PRIORITY,
    });
  try {
    requireConfirmedSingleRowMutation(mutationResult,
      POLICY_MUTATION_CONFIRMATION);
  } catch (refusal) {
    retireCommittedPolicyFence(service, tableId);
    throw refusal;
  }
}

export {
  MAX_COMMITTED_POLICY_FENCES,
  MAX_SUPERSEDED_POLICY_SNAPSHOTS,
  applyCommittedPolicyFence,
  commitPolicyFenceAfterWrite,
  isStaleAgainstCommittedPolicyFence,
  isSupersededByCommittedPolicyFence,
  readCommittedPolicyBase,
  recordCommittedPolicyFence,
  retireCommittedPolicyFence,
  writePolicyConditionally,
};
