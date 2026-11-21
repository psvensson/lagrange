const GATE_REPAIR_ROW_FAILED_LOG =
  'Failed to repair operation row for gate-repaired reservation';

/**
 * Require the native placement owner to confirm the exact existing row or
 * admit a legitimate retained-row restoration. Missing admission-bearing rows
 * remain refused by the same apply decision. Reservation repair alone cannot
 * authorize dispatch.
 * @param {Object} owner - Operation workflow owner (this).
 * @param {Object} operation - Dispatch candidate whose reservation was
 *   repaired by the gate.
 * @return {Promise<boolean>} True only after the native repair is confirmed.
 * @private
 */
async function repairOperationRowForGateRepairedReservation(owner, operation) {
  if (typeof owner.repository?.repairRetainedOperation !== 'function') {
    return false;
  }
  try {
    return await owner.repository.repairRetainedOperation(operation);
  } catch (error) {
    owner.logger?.warn?.(
      GATE_REPAIR_ROW_FAILED_LOG,
      {
        operationId: operation?.operationId || null,
        error: error?.message || String(error),
      },
    );
    return false;
  }
}

export {repairOperationRowForGateRepairedReservation};
