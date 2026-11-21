import assert from 'node:assert/strict';
import {CONTROL_PLANE_MUTATION_OPERATION} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';

const MISMATCHED_OPERATION_TYPE = 'fixture-mismatched-operation-type';

export function isGuardedLedgerUpdate(mutation, operationId) {
  return mutation.operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE &&
    mutation.tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
    mutation.whereClause?.operation_id === operationId;
}

// Add a nonmatching condition at the storage boundary to exercise a real
// zero-row acknowledgement while preserving the owner's original predicates.
export async function refuseGuardedLedgerUpdate(submit, mutation, options) {
  assert.equal(mutation.whereClause.type, undefined);
  const result = await submit({
    ...mutation,
    whereClause: {...mutation.whereClause, type: MISMATCHED_OPERATION_TYPE},
  }, options);
  assert.equal(result.success, true);
  assert.equal(result.partitionResult?.affectedRows, 0);
  return result;
}
