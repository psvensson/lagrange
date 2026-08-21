import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_EMPTY = '';

const {
  OperationType,
  UNIFIED_SERVICE_TYPE,
} = REBALANCE_COORDINATOR_SHARED;

/**
 * Whether an in-flight operation consumes the runtime-service placement lane.
 * ADD and REPLACE are two workflow shapes for the same placement responsibility
 * and must receive one admission classification.
 * @param {Object} operation
 * @return {boolean}
 */
function isRuntimeServicePlacementOperation(operation) {
  const type = String(operation?.type || LOCAL_STR_EMPTY).toUpperCase();
  if (type !== OperationType.ADD && type !== OperationType.REPLACE) {
    return false;
  }
  const entityType = String(
    operation?.entityType || operation?.entity_type || LOCAL_STR_EMPTY,
  ).toLowerCase();
  return entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE;
}

/**
 * Resolve the effective plain-ADD limit for this admission. The lane is shared
 * by every non-priority ADD and non-dispatch-phase REPLACE, so one slot is held
 * for runtime-service placement while none is in flight. Runtime ADD and
 * REPLACE use the same owner decision; callers cannot select a create-only
 * variant. The hold is demand-sensitive and clamped so partition work cannot
 * deadlock at a one-slot budget.
 * @param {Object} coordinator
 * @param {Array} operations
 * @param {number} concurrentAddLimit
 * @param {Object} options
 * @return {number}
 */
function resolveRuntimeServicePlacementReservedAddLimit(
  coordinator,
  operations,
  concurrentAddLimit,
  options = {},
) {
  const reservedPlacementSlots =
    typeof coordinator.getReservedRuntimeServicePlacementSlots ===
      LOCAL_STR_FUNCTION ?
      coordinator.getReservedRuntimeServicePlacementSlots(options) :
      0;
  if (
    reservedPlacementSlots <= 0 ||
    options.isRuntimeServicePlacement === true
  ) {
    return concurrentAddLimit;
  }
  const inFlightRuntimePlacements = (
    Array.isArray(operations) ? operations : []
  ).filter((operation) =>
    isRuntimeServicePlacementOperation(operation),
  ).length;
  const activePlacementHold =
    inFlightRuntimePlacements > 0 ? 0 : reservedPlacementSlots;
  return Math.max(1, concurrentAddLimit - activePlacementHold);
}

export {
  isRuntimeServicePlacementOperation,
  resolveRuntimeServicePlacementReservedAddLimit,
};
