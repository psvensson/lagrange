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

/**
 * @param {Object} service - The TablePolicyService.
 * @param {string} tableId - Table ID.
 * @return {Promise<Object|null>} The base row ({table_policies,
 *   updated_at, ...}); rejects typed TABLE_POLICY_BASE_UNAVAILABLE with the
 *   authority's retryAfterMs.
 */
async function readCommittedPolicyBase(service, tableId) {
  const fence = service.committedPolicyFences.get(tableId);
  if (fence) {
    return {
      table_id: tableId,
      table_policies: fence.table_policies,
      updated_at: fence.updated_at,
    };
  }
  const read = await service.getControlPlaneSystemTableGateway()
    .readAuthoritativeRows(TABLES.TABLES, TABLE_POLICY_BASE_READ_SQL,
      [tableId], {workClass: PRESSURE_WORK_CLASS.INTERACTIVE});
  if (read?.success !== true || !Array.isArray(read.rows)) {
    const refusal = new Error(TABLE_POLICY_BASE_UNAVAILABLE_MESSAGE);
    refusal.code = POLICY_ERROR_CODE.BASE_UNAVAILABLE;
    refusal.retryAfterMs = Number.isFinite(read?.retryAfterMs) ?
      read.retryAfterMs : null;
    throw refusal;
  }
  return read.rows[0] ?? null;
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
    service.committedPolicyFences.delete(tableId);
    throw refusal;
  }
}

export {readCommittedPolicyBase, writePolicyConditionally};
