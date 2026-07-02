/**
 * Replica Worker Entry Point - Piscina worker entry point for replica processes.
 *
 * This module serves as the entry point for piscina worker processes that
 * run partition and message group replicas. It handles operation dispatch
 * and lifecycle management.
 *
 * @module worker/replica-worker
 * @see Requirements 5.4, 5.5 - Worker Process Lifecycle
 */

import {threadId} from 'worker_threads';
import {
  WORKER_OPERATION,
  WORKER_ERROR_MSG,
} from './worker-constants.js';
import {PartitionWorkerService} from './partition-worker-service.js';
import {MessageGroupWorkerService} from './message-group-worker-service.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_CREATING_PARTITION_REPLICA = 'Creating partition replica';
const LOCAL_STR_PARTITION_REPLICA_CREATED = 'Partition replica created';
const LOCAL_STR_CREATING_MESSAGE_GROUP_REPLICA = 'Creating message group replica';
const LOCAL_STR_MESSAGE_GROUP_REPLICA_CREATED = 'Message group replica created';
const LOCAL_STR_STOPPING_REPLICA = 'Stopping replica';
const LOCAL_STR_REPLICA_STOPPED = 'Replica stopped';
const LOCAL_STR_RECEIVED_OPERATION = 'Received operation';

const REPLICA_OPERATION_STATUS = Object.freeze({
  CREATED: 'created',
  STOPPED: 'stopped',
});

const REPLICA_HEALTH_CHECK_STATE = Object.freeze({
  MISSING: 'missing',
  NOT_READY: 'not_ready',
  STATS_FAILED: 'stats_failed',
  HEALTHY: 'healthy',
});

const REPLICA_HEALTH_CHECK_ERROR_MSG = Object.freeze({
  NOT_READY: 'Replica worker service not ready',
});

const REPLICA_WORKER_LOG_MSG = Object.freeze({
  STARTUP_CLEANUP_FAILED:
    'Failed to clean up worker replica after startup failure',
});

const EMPTY_HEALTH_STATS = Object.freeze({});

/**
 * Active replicas in this worker process.
 * @type {Map<string, PartitionWorkerService|MessageGroupWorkerService>}
 */
const replicas = new Map();

/**
 * Logger for worker process.
 * @type {Object}
 */
const logger = {
  info: (...args) => console.log(`[Worker ${threadId}]`, ...args),
  debug: (...args) => console.debug(`[Worker ${threadId}]`, ...args),
  trace: (...args) => console.debug(`[Worker ${threadId}]`, ...args),
  warn: (...args) => console.warn(`[Worker ${threadId}]`, ...args),
  error: (...args) => console.error(`[Worker ${threadId}]`, ...args),
};

function buildReplicaCreationResult(replicaId) {
  return {
    workerId: threadId,
    replicaId,
    status: REPLICA_OPERATION_STATUS.CREATED,
  };
}

function buildReplicaStopResult(replicaId) {
  return {
    replicaId,
    status: REPLICA_OPERATION_STATUS.STOPPED,
  };
}

async function cleanupReplicaCreationFailure(service, replicaId) {
  if (!service || service.initialized !== true) {
    return;
  }

  try {
    await service.stop();
  } catch (error) {
    logger.warn(REPLICA_WORKER_LOG_MSG.STARTUP_CLEANUP_FAILED, {
      replicaId,
      threadId,
      error: error.message,
    });
  }
}

function observeReplicaStats(service) {
  if (typeof service.getStats !== LOCAL_STR_FUNCTION) {
    return {
      state: REPLICA_HEALTH_CHECK_STATE.HEALTHY,
      stats: EMPTY_HEALTH_STATS,
      error: null,
    };
  }

  try {
    return {
      state: REPLICA_HEALTH_CHECK_STATE.HEALTHY,
      stats: service.getStats(),
      error: null,
    };
  } catch (error) {
    return {
      state: REPLICA_HEALTH_CHECK_STATE.STATS_FAILED,
      stats: EMPTY_HEALTH_STATS,
      error: error.message,
    };
  }
}

function buildReplicaHealthSnapshot(snapshot) {
  return snapshot;
}

function normalizeReplicaHealthSnapshot(replicaId, service) {
  if (!service) {
    return buildReplicaHealthSnapshot({
      replicaId,
      state: REPLICA_HEALTH_CHECK_STATE.MISSING,
      stats: EMPTY_HEALTH_STATS,
      error: WORKER_ERROR_MSG.REPLICA_NOT_FOUND,
    });
  }

  if (service.initialized !== true || service.started !== true) {
    return buildReplicaHealthSnapshot({
      replicaId,
      state: REPLICA_HEALTH_CHECK_STATE.NOT_READY,
      stats: EMPTY_HEALTH_STATS,
      error: REPLICA_HEALTH_CHECK_ERROR_MSG.NOT_READY,
    });
  }

  const statsObservation = observeReplicaStats(service);

  return buildReplicaHealthSnapshot({
    replicaId,
    state: statsObservation.state,
    stats: statsObservation.stats,
    error: statsObservation.error,
  });
}

function buildHealthCheckResult(snapshot) {
  return {
    healthy: snapshot.state === REPLICA_HEALTH_CHECK_STATE.HEALTHY,
    replicaId: snapshot.replicaId,
    error: snapshot.error,
    stats: snapshot.stats,
  };
}

/**
 * Create a partition replica in this worker process.
 * @param {Object} options - Partition configuration.
 * @return {Promise<Object>} Result with workerId.
 */
async function createPartitionReplica(options) {
  const {replicaId} = options;

  if (replicas.has(replicaId)) {
    throw new Error(WORKER_ERROR_MSG.REPLICA_ALREADY_EXISTS);
  }

  logger.info(LOCAL_STR_CREATING_PARTITION_REPLICA, {replicaId, threadId});

  const service = new PartitionWorkerService({
    nodeId: options.nodeId,
    partitionId: options.partitionId,
    replicaId: options.replicaId,
    tableId: options.tableId,
    tableName: options.tableName,
    schema: options.schema,
    dbPath: options.dbPath,
    replicaIds: options.replicaIds,
    peerAddresses: options.peerAddresses,
    deferElection: options.deferElection === true,
    logger,
  });

  try {
    await service.initialize();
    await service.start();
  } catch (error) {
    await cleanupReplicaCreationFailure(service, replicaId);
    throw error;
  }

  replicas.set(replicaId, service);

  logger.info(LOCAL_STR_PARTITION_REPLICA_CREATED, {replicaId, threadId});

  return buildReplicaCreationResult(replicaId);
}

/**
 * Create a message group replica in this worker process.
 * @param {Object} options - Message group configuration.
 * @return {Promise<Object>} Result with workerId.
 */
async function createMessageGroupReplica(options) {
  const {replicaId} = options;

  if (replicas.has(replicaId)) {
    throw new Error(WORKER_ERROR_MSG.REPLICA_ALREADY_EXISTS);
  }

  logger.info(LOCAL_STR_CREATING_MESSAGE_GROUP_REPLICA, {replicaId, threadId});

  const service = new MessageGroupWorkerService({
    nodeId: options.nodeId,
    groupId: options.groupId,
    replicaId: options.replicaId,
    replicaIds: options.replicaIds,
    peerAddresses: options.peerAddresses,
    deferElection: options.deferElection === true,
    logger,
  });

  try {
    await service.initialize();
    await service.start();
  } catch (error) {
    await cleanupReplicaCreationFailure(service, replicaId);
    throw error;
  }

  replicas.set(replicaId, service);

  logger.info(LOCAL_STR_MESSAGE_GROUP_REPLICA_CREATED, {replicaId, threadId});

  return buildReplicaCreationResult(replicaId);
}

/**
 * Stop a replica in this worker process.
 * @param {string} replicaId - Replica ID to stop.
 * @return {Promise<Object>} Result.
 */
async function stopReplica(replicaId) {
  const service = replicas.get(replicaId);

  if (!service) {
    throw new Error(WORKER_ERROR_MSG.REPLICA_NOT_FOUND);
  }

  logger.info(LOCAL_STR_STOPPING_REPLICA, {replicaId, threadId});

  await service.stop();
  replicas.delete(replicaId);

  logger.info(LOCAL_STR_REPLICA_STOPPED, {replicaId, threadId});

  return buildReplicaStopResult(replicaId);
}

/**
 * Deliver a message to a replica in this worker process.
 * @param {string} replicaId - Target replica ID.
 * @param {Object} message - Message to deliver.
 * @return {Promise<Object>} Response from replica.
 */
async function deliverMessage(replicaId, message) {
  const service = replicas.get(replicaId);

  if (!service) {
    throw new Error(WORKER_ERROR_MSG.REPLICA_NOT_FOUND);
  }

  return service.handleMessage(message);
}

/**
 * Perform health check on a replica.
 * @param {string} replicaId - Replica ID to check.
 * @return {Promise<Object>} Health status.
 */
async function healthCheck(replicaId) {
  const service = replicas.get(replicaId);
  const healthSnapshot = normalizeReplicaHealthSnapshot(
    replicaId,
    service,
  );
  return buildHealthCheckResult(healthSnapshot);
}

/**
 * Worker entry point - handles operations from ReplicaWorkerManager.
 * @param {Object} task - Task to execute.
 * @return {Promise<Object>} Task result.
 */
export default async function workerEntryPoint(task) {
  const {operation, replicaId} = task;

  logger.debug(LOCAL_STR_RECEIVED_OPERATION, {operation, replicaId, threadId});

  switch (operation) {
  case WORKER_OPERATION.CREATE_PARTITION_REPLICA:
    return createPartitionReplica(task);

  case WORKER_OPERATION.CREATE_MESSAGE_GROUP_REPLICA:
    return createMessageGroupReplica(task);

  case WORKER_OPERATION.STOP_REPLICA:
    return stopReplica(replicaId);

  case WORKER_OPERATION.DELIVER_MESSAGE:
    return deliverMessage(replicaId, task.message);

  case WORKER_OPERATION.HEALTH_CHECK:
    return healthCheck(replicaId);

  default:
    throw new Error(`${WORKER_ERROR_MSG.UNKNOWN_OPERATION}: ${operation}`);
  }
}

// Export for testing
export {
  replicas,
  createPartitionReplica,
  createMessageGroupReplica,
  stopReplica,
  deliverMessage,
  healthCheck,
};
