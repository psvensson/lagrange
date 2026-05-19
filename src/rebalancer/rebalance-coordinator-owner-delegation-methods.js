const LOCAL_STR_FUNCTION = 'function';

class RebalanceCoordinatorOwnerDelegationMethods {
  /**
   * Prune expired recent operation intents.
   * @private
   */
  pruneExpiredOperationIntents() {
    const now = Date.now();
    for (const [key, entry] of this.recentOperationIntents.entries()) {
      if (!entry || entry.expiresAt <= now) {
        this.recentOperationIntents.delete(key);
      }
    }
  }

  /**
   * Build one operation single-flight key for shared workflow coordination.
   * @param {string} scope - Lock scope prefix.
   * @param {string} key - Scope-specific key.
   * @return {string} Single-flight owner key.
   * @private
   */
  buildOperationSingleFlightKey(scope, key) {
    return this.workflowOwner.buildOperationSingleFlightKey(scope, key);
  }

  /**
   * Build create-operation single-flight key.
   * @param {string} dedupeKey - Move-intent dedupe key.
   * @return {string}
   * @private
   */
  getCreateOperationSingleFlightKey(dedupeKey) {
    return this.workflowOwner.getCreateOperationSingleFlightKey(dedupeKey);
  }

  /**
   * Build the shared single-flight key for concurrent create-budget checks.
   * @param {string} scope
   * @return {string}
   * @private
   */
  getCreateBudgetSingleFlightKey(scope) {
    return this.workflowOwner.getCreateBudgetSingleFlightKey(scope);
  }

  /**
   * Build execute-operation single-flight key.
   * @param {string} operationId - Operation ID.
   * @return {string}
   * @private
   */
  getExecuteOperationSingleFlightKey(operationId) {
    return this.workflowOwner.getExecuteOperationSingleFlightKey(operationId);
  }

  /**
   * Build the shared owner-key single-flight gate for one persisted
   * operation.
   * @param {string} operationId - Operation ID.
   * @return {string}
   * @private
   */
  getOperationOwnerSingleFlightKey(operationId) {
    return this.workflowOwner.getOperationOwnerSingleFlightKey(operationId);
  }

  /**
   * Claim a PENDING operation for dispatch by transitioning it to
   * SENDING through the coordinator-owned workflow path.
   *
   * This is the single-owner replacement for the direct
   * cdcIntegrationService.updateSystemTableRow call that previously
   * lived in ReplicaDispatchService.claimPendingDispatch.
   *
   * Design reference: §2 — dispatch claim routed through coordinator.
   *
   * @param {string} operationId - The operation to claim.
   * @return {Promise<Object|null>} The claimed operation in SENDING
   *   state, or null if the claim could not be acquired (operation
   *   not found, not PENDING, or not locally owned).
   */
  async claimDispatchTransition(operationId) {
    return this.workflowOwner.claimDispatchTransition(operationId);
  }

  /**
   * Dispatch one operation through the coordinator-owned single-flight lane.
   * This is the canonical owner entry point for PENDING dispatch and any
   * retry of an already-claimed SENDING operation.
   *
   * Accepts either an operation id, a SQL row, or a canonical operation
   * payload. Callers that carry extra in-memory metadata (for example initial
   * bootstrap peer lists) should pass the canonical operation object so that
   * this owner path can preserve it.
   *
   * @param {string|Object} operationInput - Operation id or payload.
   * @return {Promise<Object>} Execution result or typed skip.
   */
  async dispatchOperation(operationInput, options = {}) {
    return this.workflowOwner.dispatchOperation(operationInput, options);
  }

  /**
   * Normalize one topology mutation work class for coordinator callers.
   * Background work is deferable; interactive/critical work keeps its current
   * caller-visible behavior.
   *
   * @param {Object} move
   * @return {string}
   * @private
   */
  normalizeControlPlaneMutationWorkClass(move) {
    return this.provisioningAdmissionPolicy.normalizeControlPlaneMutationWorkClass(
      move,
    );
  }

  /**
   * Build an admission result for local control-plane mutation unhealthiness.
   * @param {Object} blocker
   * @return {Object}
   * @private
   */
  buildLocalControlPlaneMutationAdmissionResult(blocker) {
    return this.provisioningAdmissionPolicy.buildLocalControlPlaneMutationAdmissionResult(
      blocker,
    );
  }

  /**
   * Defer optional background topology mutation when the local control-plane
   * mutation contract is not currently healthy.
   * @param {Object} move
   * @return {void}
   * @private
   */
  assertLocalControlPlaneMutationReady(move) {
    return this.provisioningAdmissionPolicy.assertLocalControlPlaneMutationReady(
      move,
    );
  }

  /**
   * Resolve the current published membership epoch, when available.
   * @return {number|null}
   * @private
   */
  getCurrentPublishedMembershipEpoch() {
    if (
      !this.controlPlaneReadinessService ||
      typeof this.controlPlaneReadinessService
        .getCurrentPublishedMembershipEpochSync !== LOCAL_STR_FUNCTION
    ) {
      return null;
    }
    return this.controlPlaneReadinessService.getCurrentPublishedMembershipEpochSync(
      this.nodeId,
      Date.now(),
    );
  }
}

function applyRebalanceCoordinatorOwnerDelegationMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorOwnerDelegationMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === 'constructor') {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyRebalanceCoordinatorOwnerDelegationMethods};
