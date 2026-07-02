
const LOCAL_STR_OPERATION_LANE = 'operation-lane';

const OPERATION_LANE_ERROR_MSG = Object.freeze({
  EXECUTION_FACTORY_REQUIRED:
    'OperationLane requires an execution factory',
  OWNER_KEY_REQUIRED:
    'OperationLane requires an owner key',
  WORKFLOW_COORDINATOR_REQUIRED:
    'OperationLane requires a workflow coordinator with runExclusive()',
});

class OperationLane {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.name = options.name || LOCAL_STR_OPERATION_LANE;
    this.workflowCoordinator = options.workflowCoordinator || null;
    if (!this.workflowCoordinator ||
        typeof this.workflowCoordinator.runExclusive !== 'function') {
      throw new Error(OPERATION_LANE_ERROR_MSG.WORKFLOW_COORDINATOR_REQUIRED);
    }
    this.timeoutPolicy = options.timeoutPolicy || null;
    this.ownerKeyFactory =
      typeof options.ownerKeyFactory === 'function' ?
        options.ownerKeyFactory :
        null;
  }

  /**
   * Resolve one owner key from a context object or string.
   * @param {Object|string} context
   * @return {string}
   */
  resolveOwnerKey(context = {}) {
    if (typeof context === 'string' && context.length > 0) {
      return context;
    }

    const explicitOwnerKey = String(context?.ownerKey || '');
    if (explicitOwnerKey.length > 0) {
      return explicitOwnerKey;
    }

    if (this.ownerKeyFactory) {
      const derivedOwnerKey = String(this.ownerKeyFactory(context) || '');
      if (derivedOwnerKey.length > 0) {
        return derivedOwnerKey;
      }
    }

    for (const fallback of [
      context?.workflowId,
      context?.operationId,
      context?.partitionId,
    ]) {
      const normalizedFallback = String(fallback || '');
      if (normalizedFallback.length > 0) {
        return normalizedFallback;
      }
    }

    throw new Error(OPERATION_LANE_ERROR_MSG.OWNER_KEY_REQUIRED);
  }

  /**
   * Run one owner-scoped execution through the shared single-flight gate.
   * @param {Object|string} context
   * @param {Function} executionFactory
   * @return {Promise<*>}
   */
  run(context, executionFactory) {
    if (typeof executionFactory !== 'function') {
      throw new Error(OPERATION_LANE_ERROR_MSG.EXECUTION_FACTORY_REQUIRED);
    }

    const normalizedContext = typeof context === 'string' ?
      {ownerKey: context} :
      (context || {});
    const ownerKey = this.resolveOwnerKey(normalizedContext);

    return this.workflowCoordinator.runExclusive(
      ownerKey,
      async () => {
        const timeoutBudget = this.timeoutPolicy ?
          this.timeoutPolicy.allocateOrThrow(normalizedContext) :
          (normalizedContext.timeoutBudget || null);
        return executionFactory({
          laneName: this.name,
          ownerKey,
          timeoutBudget,
          context: normalizedContext,
        });
      },
    );
  }
}

export {OperationLane};
