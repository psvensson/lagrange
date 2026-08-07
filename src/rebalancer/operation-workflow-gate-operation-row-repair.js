// Operation-row repair for the fail-closed reservation gate (audit findings
// 3+11). A storage-increasing operation whose reservation had to be
// REPAIRED at dispatch time (outcome CREATED — the row predates the
// creation-time fail-closed throw, or its reservation was swept while the
// row lingered) can also be missing its own replica_operations row: both
// side effects shared one pre-fix creation crash window, and the dispatch
// retry lanes only re-drive while a durable row remains visible. The
// re-insert is the canonical OR-IGNORE idempotent insert (the same
// convergence the CL-017(b) divergence-reinsert relies on), so concurrent
// repair attempts land on the same deterministic operation row.
const OPERATION_GATE_REPAIR_INSERT_OPTIONS = Object.freeze({
  confirmPersistence: false,
});
const GATE_REPAIR_ROW_FAILED_LOG =
  'Failed to repair operation row for gate-repaired reservation';

/**
 * Best-effort re-insert of the operation row after the dispatch gate
 * repaired a missing reservation. Failures are swallowed by the
 * repository's idempotent-insert contract (an existing row wins) or
 * surfaced to the caller's log — the gate's skip result already re-arms the
 * canonical retry lanes.
 * @param {Object} owner - Operation workflow owner (this).
 * @param {Object} operation - Dispatch candidate whose reservation was
 *   repaired by the gate.
 * @return {Promise<boolean>} True when a repair insert was attempted.
 * @private
 */
async function repairOperationRowForGateRepairedReservation(owner, operation) {
  if (typeof owner.repository?.persistNewOperation !== 'function') {
    return false;
  }
  try {
    await owner.repository.persistNewOperation(
      operation,
      OPERATION_GATE_REPAIR_INSERT_OPTIONS,
    );
    return true;
  } catch (error) {
    owner.logger?.warn?.(
      GATE_REPAIR_ROW_FAILED_LOG,
      {
        operationId: operation?.operationId || null,
        error: error?.message || String(error),
      },
    );
    return true;
  }
}

export {repairOperationRowForGateRepairedReservation};
