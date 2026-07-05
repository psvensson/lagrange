import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_EMPTY = '';

const {
  OperationType,
  UNIFIED_SERVICE_TYPE,
} = REBALANCE_COORDINATOR_SHARED;

/**
 * Whether an in-flight operation is a genuine runtime-service replica-create
 * (an ADD of a runtime_service entity). REPLACE/self-move of a service is
 * count-neutral and is NOT a create, so it never consumes the reserved slot.
 * @param {Object} operation
 * @return {boolean}
 */
function isServiceCreateAddOperation(operation) {
  const type = String(operation?.type || LOCAL_STR_EMPTY).toUpperCase();
  if (type !== OperationType.ADD) {
    return false;
  }
  const entityType = String(
    operation?.entityType || operation?.entity_type || LOCAL_STR_EMPTY,
  ).toLowerCase();
  return entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE;
}

/**
 * Resolve the effective plain-ADD limit for THIS admission after reserving a
 * fair-share slot for genuine runtime-service replica-creates (quest
 * formation-runtime-service-create-lane-budget-starvation). The global plain-ADD
 * lane is shared by every non-priority ADD + non-dispatch-phase REPLACE, so a
 * service's replica-create (no reserved slot) is otherwise starved by ordinary
 * spread/REPLACE churn. A genuine create sees the full limit; a non-create yields
 * one slot ONLY while no create is already in flight (demand-sensitive lift), and
 * the result is clamped to >= 1 so ordinary adds never deadlock at a small budget.
 * @param {Object} coordinator
 * @param {Array} operations - The in-flight add-budget operations being counted.
 * @param {number} concurrentAddLimit
 * @param {Object} options - Admission options; options.isGenuineCreate marks a
 *   runtime-service replica-create.
 * @return {number}
 */
function resolveCreateReservedAddLimit(
  coordinator,
  operations,
  concurrentAddLimit,
  options = {},
) {
  const reservedCreateSlots =
    typeof coordinator.getReservedCreateAddSlots === LOCAL_STR_FUNCTION ?
      coordinator.getReservedCreateAddSlots(options) :
      0;
  if (reservedCreateSlots <= 0 || options.isGenuineCreate === true) {
    return concurrentAddLimit;
  }
  const inFlightServiceCreates = (
    Array.isArray(operations) ? operations : []
  ).filter((operation) => isServiceCreateAddOperation(operation)).length;
  const activeCreateHaircut =
    inFlightServiceCreates > 0 ? 0 : reservedCreateSlots;
  return Math.max(1, concurrentAddLimit - activeCreateHaircut);
}

export {
  isServiceCreateAddOperation,
  resolveCreateReservedAddLimit,
};
