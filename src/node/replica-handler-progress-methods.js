import {PARTITION_SERVICE_INIT_STAGE} from '../partition/partition-service-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_PROGRESS,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_HANDLER_LITERAL = Object.freeze({
  VALUE: '',
});

function assignReplicaHandlerProgressMethods(ReplicaHandler) {
  class ReplicaHandlerProgressMethods {
    /**
     * Start staged one-line progress reporting for replica creation.
     * @param {Object} details - Initial progress details.
     * @return {Object} Progress context.
     * @private
     */
    startReplicaCreationProgress(details) {
      const progress = this.creationProgressReporter.start({
        ...details,
        stage: PARTITION_SERVICE_INIT_STAGE.STARTING,
        peerTotal: Math.max(0, details.peerTotal || 0),
        peerJoined: 0,
      });
      if (progress && progress.replicaId) {
        this.creationProgressByReplica.set(progress.replicaId, progress);
      }
      return progress;
    }
    /**
     * Update replica creation progress with stage callback data.
     * @param {Object|null} progress - Progress context.
     * @param {Object} stageEvent - Stage event payload.
     * @private
     */
    updateReplicaCreationProgress(progress, stageEvent) {
      if (!progress || !stageEvent) {
        return;
      }
      const update = {};
      if (stageEvent.stage) {
        update.stage = stageEvent.stage;
      }
      if (Number.isFinite(stageEvent.peerTotal)) {
        update.peerTotal = Math.max(0, stageEvent.peerTotal);
      }
      if (Number.isFinite(stageEvent.peerJoined)) {
        update.peerJoined = Math.max(0, stageEvent.peerJoined);
      }
      if (stageEvent.peerId) {
        update.peerId = stageEvent.peerId;
      }
      if (stageEvent.partitionId) {
        update.partitionId = stageEvent.partitionId;
      }
      this.creationProgressReporter.update(progress, update);
    }
    /**
     * Complete replica creation progress reporting.
     * @param {Object|null} progress - Progress context.
     * @param {string} finalStage - Final stage label.
     * @private
     */
    finishReplicaCreationProgress(progress, finalStage = ReplicaStatus.ACTIVE) {
      this.creationProgressReporter.finish(progress, {stage: finalStage});
      this.clearReplicaCreationProgress(progress);
    }
    /**
     * Fail replica creation progress reporting.
     * @param {Object|null} progress - Progress context.
     * @param {Error|string|null} error - Failure reason.
     * @param {string} finalStage - Final stage label.
     * @private
     */
    failReplicaCreationProgress(
      progress,
      error,
      finalStage = ReplicaStatus.FAILED,
    ) {
      this.creationProgressReporter.fail(progress, error, {stage: finalStage});
      this.clearReplicaCreationProgress(progress);
    }
    /**
     * Remove progress context tracking for a replica.
     * @param {Object|null} progress - Progress context.
     * @private
     */
    clearReplicaCreationProgress(progress) {
      if (progress && progress.replicaId) {
        this.creationProgressByReplica.delete(progress.replicaId);
      }
    }
    /**
     * Track one detached async replica operation so shutdown can await it.
     * @param {Promise<*>} taskPromise
     * @return {Promise<*>}
     * @private
     */
    registerOperationTask(taskPromise) {
      let trackedTask = null;
      trackedTask = Promise.resolve(taskPromise).finally(() => {
        this.operationTasks.delete(trackedTask);
      });
      this.operationTasks.add(trackedTask);
      return trackedTask;
    }
    /**
     * Throw when the replica handler is shutting down.
     * @return {void}
     * @private
     */
    throwIfShuttingDown() {
      if (this.shuttingDown) {
        throw new Error(REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN);
      }
    }
    /**
     * Format staged replica creation progress line.
     * @param {Object} progress - Progress context.
     * @param {string|null} status - Optional terminal status.
     * @param {Error|string|null} error - Optional error.
     * @return {string} Formatted line.
     * @private
     */
    formatReplicaCreationProgressLine(progress, status, error) {
      const spinner =
        progress.spinnerFrame || REPLICA_HANDLER_PROGRESS.SPINNER_IDLE;
      const peerTotal = Number.isFinite(progress.peerTotal) ?
        progress.peerTotal :
        0;
      const peerJoined = Number.isFinite(progress.peerJoined) ?
        progress.peerJoined :
        0;
      const countPendingReplica =
        !status && !this.localServices.has(progress.replicaId);
      const localReplicas =
        this.localServices.size + (countPendingReplica ? 1 : 0);
      const statusText = status ? ` status=${status}` : '';
      const errorText = error ?
        ` error=${this.formatReplicaCreationError(error)}` :
        '';
      return (
        `${REPLICA_HANDLER_PROGRESS.PREFIX} ${spinner} ` +
        `service=${progress.partitionId} replica=${progress.replicaId} ` +
        `type=${REPLICA_HANDLER_SERVICE.TYPE} stage=${progress.stage} ` +
        `peers=${peerJoined}/${peerTotal} local_replicas=${localReplicas}` +
        `${statusText}${errorText}`
      );
    }
    /**
     * Build structured fallback context for progress logs.
     * @param {Object} progress - Progress context.
     * @param {string|null} status - Optional terminal status.
     * @param {Error|string|null} error - Optional error.
     * @return {Object} Structured context.
     * @private
     */
    buildReplicaCreationProgressContext(progress, status = null, error = null) {
      const context = {
        nodeId: this.nodeId,
        partitionId: progress.partitionId,
        replicaId: progress.replicaId,
        stage: progress.stage,
        peerTotal: progress.peerTotal,
        peerJoined: progress.peerJoined,
        localReplicas: this.localServices.size,
      };
      if (status) {
        context.status = status;
      }
      if (error) {
        context.error = this.formatReplicaCreationError(error);
      }
      return context;
    }
    /**
     * Normalize error values for progress output.
     * @param {Error|string|null} error - Error value.
     * @return {string} Error message.
     * @private
     */
    formatReplicaCreationError(error) {
      if (!error) {
        return REPLICA_HANDLER_LITERAL.VALUE;
      }
      return typeof error === REPLICA_HANDLER_TYPEOF.STRING ?
        error :
        error.message;
    }
    buildReplicaOperationResponse(status, fields = {}) {
      return {
        status,
        ...fields,
      };
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerProgressMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerProgressMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerProgressMethods};
