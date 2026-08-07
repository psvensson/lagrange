// Dispatch-time reservation gate (audit findings 3+11): a storage-increasing
// operation must never dispatch while its storage reservation is missing —
// an under-reserved dispatch would strand the operation against the storage
// admission accounting the reservation witnesses. The gate reuses the
// coordinator's ensureReservationForOperation repair helper (deterministic
// res-${operationId} identity): an existing ACTIVE row is a no-op, a missing
// row re-runs the deterministic insert, and only a FAILED outcome skips the
// dispatch as OPERATION_NOT_DISPATCHABLE.
import {
  OPERATION_RESERVATION_ATTEMPT_OUTCOME,
} from './operation-reservation-attempt-outcome.js';
import {
  repairOperationRowForGateRepairedReservation,
} from './operation-workflow-gate-operation-row-repair.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  OPERATION_WORKFLOW_OWNER_REASON,
  OperationType,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const DISPATCH_RESERVATION_UNAVAILABLE_PREFIX =
  'storage reservation unavailable: ';
const DISPATCH_RESERVATION_REPAIR_FAILED_FALLBACK =
  'reservation repair failed';

function isStorageIncreasingOperationType(operationType) {
  return (
    operationType === OperationType.ADD ||
    operationType === OperationType.REPLACE
  );
}

/**
 * Whether the dispatch-time gate can engage for this owner: reduced
 * harnesses construct the owner without the coordinator's reservation
 * delegates, or build the coordinator without the reservation subsystem
 * (no reservation could ever be persisted or verified), so the gate has
 * nothing to enforce there. A production coordinator always reports
 * support — operation creation asserts the same accounting dependency.
 * @param {Object} owner - Operation workflow owner (this).
 * @return {boolean}
 * @private
 */
function isDispatchReservationGateEngaged(owner) {
  if (typeof owner.ensureReservationForOperation !== 'function') {
    return false;
  }
  return (
    typeof owner.hasStorageReservationSupport !== 'function' ||
    owner.hasStorageReservationSupport() === true
  );
}

/**
 * A gate-repaired reservation proves the row predates the creation-time
 * fail-closed throw (or lost its reservation to a sweep): the same pre-fix
 * crash window could strand the operation ledger row itself, and the
 * dispatch retry lanes only re-drive while a durable row remains visible.
 * Re-insert the deterministic row (canonical OR-IGNORE convergence) before
 * dispatching on.
 * @param {Object} owner - Operation workflow owner (this).
 * @param {Object} operation - Dispatch candidate.
 * @param {Object} attempt - Typed reservation repair attempt.
 * @return {Promise<void>}
 * @private
 */
async function repairGateRepairedOperationRow(owner, operation, attempt) {
  if (attempt?.outcome !== OPERATION_RESERVATION_ATTEMPT_OUTCOME.CREATED) {
    return;
  }
  await repairOperationRowForGateRepairedReservation(owner, operation);
}

/**
 * Verify an ACTIVE storage reservation exists for one dispatch candidate,
 * repairing a missing one through the deterministic reservation identity.
 * @param {Object} owner - Operation workflow owner (this).
 * @param {Object} operation - Resolved dispatch candidate.
 * @return {Promise<Object|null>} buildSkippedOperationResult-shaped skip
 *   result when the reservation could not be established, null when the
 *   dispatch may proceed.
 * @private
 */
async function ensureDispatchReservationOrSkip(owner, operation) {
  if (
    !isStorageIncreasingOperationType(operation?.type) ||
    !isDispatchReservationGateEngaged(owner)
  ) {
    return null;
  }
  const attempt = await owner.ensureReservationForOperation(operation);
  if (
    attempt?.outcome === OPERATION_RESERVATION_ATTEMPT_OUTCOME.CREATED ||
    attempt?.outcome === OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE
  ) {
    await repairGateRepairedOperationRow(owner, operation, attempt);
    return null;
  }
  return owner.buildSkippedOperationResult(
    OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
    operation.operationId,
    {
      error:
        DISPATCH_RESERVATION_UNAVAILABLE_PREFIX +
        (attempt?.error || DISPATCH_RESERVATION_REPAIR_FAILED_FALLBACK),
    },
  );
}

export {ensureDispatchReservationOrSkip};
