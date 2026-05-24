/**
 * ReplicaWorkerManager progress-reporting methods.
 *
 * These methods are assigned to ReplicaWorkerManager.prototype by the owner
 * module to keep the public manager surface unchanged.
 *
 * @module worker/replica-worker-manager-progress
 */

function createReplicaWorkerManagerProgressMethods(deps = {}) {
  const {
    REPLICA_CREATE_PROGRESS,
    LOCAL_STR_EMPTY,
    LOCAL_STR_STRING,
  } = deps;

  return {
    /**
     * Start a replica creation progress line.
     * Falls back to structured logs when terminal control is unavailable.
     * @param {Object} details - Progress details.
     * @param {string} details.entityType - Replica entity type.
     * @param {string} details.replicaId - Replica ID.
     * @param {string} details.serviceId - Parent service ID.
     * @return {Object} Progress context.
     * @private
     */
    startReplicaCreationProgress(details) {
      return this.creationProgressReporter.start({
        ...details,
        state: REPLICA_CREATE_PROGRESS.STATE_STARTING,
      });
    },

    /**
     * Update the state of an existing replica creation progress line.
     * @param {Object|null} progress - Progress context.
     * @param {string} nextState - Next state label.
     * @private
     */
    updateReplicaCreationProgress(progress, nextState) {
      this.creationProgressReporter.update(progress, {state: nextState});
    },

    /**
     * Complete a replica creation progress line.
     * @param {Object|null} progress - Progress context.
     * @param {string} finalState - Final state label.
     * @private
     */
    finishReplicaCreationProgress(progress, finalState) {
      this.creationProgressReporter.finish(progress, {state: finalState});
    },

    /**
     * Mark a replica creation progress line as failed.
     * @param {Object|null} progress - Progress context.
     * @param {string} finalState - Final state label.
     * @param {Error|string|null} error - Failure reason.
     * @private
     */
    failReplicaCreationProgress(progress, finalState, error) {
      this.creationProgressReporter.fail(progress, error, {state: finalState});
    },

    /**
     * Build the formatted line shown in interactive and fallback modes.
     * @param {Object} progress - Progress context.
     * @param {string|null} status - Optional terminal status.
     * @param {Error|string|null} error - Optional error.
     * @return {string} Formatted progress line.
     * @private
     */
    formatReplicaCreationProgressLine(progress, status, error) {
      const spinner = progress.spinnerFrame ||
        REPLICA_CREATE_PROGRESS.SPINNER_IDLE;
      const totalLocal = this.getWorkerCount();
      const localByType = this.getWorkersByType(progress.entityType).length;
      const statusText = status ? ` status=${status}` : '';
      const errorText = error ?
        ` error=${this.formatReplicaCreationError(error)}` :
        '';

      return (
        `${REPLICA_CREATE_PROGRESS.PREFIX} ${spinner} ` +
        `service=${progress.serviceId} replica=${progress.replicaId} ` +
        `type=${progress.entityType} state=${progress.state} ` +
        `local_replicas=${totalLocal} type_replicas=${localByType}` +
        `${statusText}${errorText}`
      );
    },

    /**
     * Build structured context for fallback log output.
     * @param {Object} progress - Progress context.
     * @param {string|null} status - Optional terminal status.
     * @param {Error|string|null} error - Optional error.
     * @return {Object} Structured context object.
     * @private
     */
    buildReplicaCreationProgressContext(progress, status = null, error = null) {
      const context = {
        nodeId: this.nodeId,
        serviceId: progress.serviceId,
        replicaId: progress.replicaId,
        entityType: progress.entityType,
        state: progress.state,
        localReplicas: this.getWorkerCount(),
        typeReplicas: this.getWorkersByType(progress.entityType).length,
      };
      if (status) {
        context.status = status;
      }
      if (error) {
        context.error = this.formatReplicaCreationError(error);
      }
      return context;
    },

    /**
     * Normalize replica creation errors for display.
     * @param {Error|string|null} error - Error value.
     * @return {string} Error message.
     * @private
     */
    formatReplicaCreationError(error) {
      if (!error) {
        return LOCAL_STR_EMPTY;
      }
      return typeof error === LOCAL_STR_STRING ? error : error.message;
    },
  };
}

export {createReplicaWorkerManagerProgressMethods};
