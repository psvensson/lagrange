import {
  BOOTSTRAP_REPLICA_PROGRESS,
} from '../bootstrap-constants.js';
import {PARTITION_SERVICE_INIT_STAGE} from
  '../../partition/partition-service-constants.js';
import {
  STRING,
} from '../../constants/index.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOCAL_STR_STRING = 'string';

function assignSeedPartitionReplicaProgressMethods(SeedPartitionsPhase) {
  class SeedPartitionReplicaProgressMethods {
    /**
     * Start progress reporting for one partition replica creation.
     * @param {Object} details
     * @return {Object}
     */
    startPartitionReplicaProgress(details) {
      const d = this.delegates;
      return d.getPartitionReplicaProgressReporter().start({
        ...details,
        stage: PARTITION_SERVICE_INIT_STAGE.STARTING,
        peerTotal: Math.max(
          0, details.peerTotal || 0,
        ),
        peerJoined: 0,
      });
    }

    /**
     * Update partition creation progress based on stage callbacks.
     * @param {Object|null} progress
     * @param {Object} stageEvent
     */
    updatePartitionReplicaProgress(progress, stageEvent) {
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
        update.peerJoined = Math.max(
          0, stageEvent.peerJoined,
        );
      }
      if (stageEvent.peerId) {
        update.peerId = stageEvent.peerId;
      }
      if (Number.isFinite(stageEvent.sizeBytes)) {
        update.sizeBytes = stageEvent.sizeBytes;
      }

      const d = this.delegates;
      d.getPartitionReplicaProgressReporter().update(
        progress, update,
      );
    }

    /**
     * Complete partition creation progress reporting.
     * @param {Object|null} progress
     */
    finishPartitionReplicaProgress(progress) {
      const d = this.delegates;
      d.getPartitionReplicaProgressReporter().finish(progress, {
        stage: PARTITION_SERVICE_INIT_STAGE.READY,
      });
    }

    /**
     * Fail partition creation progress reporting.
     * @param {Object|null} progress
     * @param {Error|string|null} error
     */
    failPartitionReplicaProgress(progress, error) {
      const d = this.delegates;
      d.getPartitionReplicaProgressReporter().fail(progress, error);
    }

    /**
     * Format one partition creation progress line.
     * @param {Object} progress
     * @param {string|null} status
     * @param {Error|string|null} error
     * @return {string}
     */
    formatPartitionReplicaProgressLine(progress, status, error) {
      const d = this.delegates;
      const spinner = progress.spinnerFrame ||
        BOOTSTRAP_REPLICA_PROGRESS.SPINNER_IDLE;
      const peerTotal = Number.isFinite(progress.peerTotal) ?
        progress.peerTotal : 0;
      const peerJoined = Number.isFinite(progress.peerJoined) ?
        progress.peerJoined : 0;
      const localReplicas = d.getPartitionServices().size +
        (status ? 0 : 1);
      const statusText = status ? ` status=${status}` : '';
      const errorText = error ?
        ` error=${this.formatReplicaCreationError(error)}` : '';

      return (
        `${BOOTSTRAP_REPLICA_PROGRESS.PREFIX} ${spinner} ` +
        `service=${progress.partitionId} ` +
        `replica=${progress.replicaId} ` +
        `type=${BOOTSTRAP_REPLICA_PROGRESS.TYPE_PARTITION} ` +
        `stage=${progress.stage} ` +
        `peers=${peerJoined}/${peerTotal} ` +
        `local_replicas=${localReplicas}` +
        `${statusText}${errorText}`
      );
    }

    /**
     * Build structured context for non-interactive partition progress
     * logs.
     * @param {Object} progress
     * @param {string|null} status
     * @param {Error|string|null} error
     * @return {Object}
     */
    buildPartitionReplicaProgressContext(
      progress, status = null, error = null,
    ) {
      const d = this.delegates;
      const context = {
        nodeId: d.getNodeId(),
        partitionId: progress.partitionId,
        tableName: progress.tableName,
        replicaId: progress.replicaId,
        stage: progress.stage,
        peerTotal: progress.peerTotal,
        peerJoined: progress.peerJoined,
        localReplicas: d.getPartitionServices().size,
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
     * Normalize replica creation errors for display.
     * @param {Error|string|null} error
     * @return {string}
     */
    formatReplicaCreationError(error) {
      if (!error) {
        return STRING.EMPTY;
      }
      return typeof error === LOCAL_STR_STRING ? error : error.message;
    }
  }

  for (const methodName of Object.getOwnPropertyNames(
    SeedPartitionReplicaProgressMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      SeedPartitionsPhase.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        SeedPartitionReplicaProgressMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignSeedPartitionReplicaProgressMethods};
