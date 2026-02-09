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

  logger.info('Creating partition replica', {replicaId, threadId});

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
    logger,
  });

  // Call initialize() which creates messageBridge and then calls onInitialize()
  await service.initialize();

  replicas.set(replicaId, service);

  logger.info('Partition replica created', {replicaId, threadId});

  return {
    workerId: threadId,
    replicaId,
    status: 'created',
  };
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

  logger.info('Creating message group replica', {replicaId, threadId});

  const service = new MessageGroupWorkerService({
    nodeId: options.nodeId,
    groupId: options.groupId,
    replicaId: options.replicaId,
    replicaIds: options.replicaIds,
    peerAddresses: options.peerAddresses,
    logger,
  });

  // Call initialize() which creates messageBridge and then calls onInitialize()
  await service.initialize();

  replicas.set(replicaId, service);

  logger.info('Message group replica created', {replicaId, threadId});

  return {
    workerId: threadId,
    replicaId,
    status: 'created',
  };
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

  logger.info('Stopping replica', {replicaId, threadId});

  await service.onStop();
  replicas.delete(replicaId);

  logger.info('Replica stopped', {replicaId, threadId});

  return {
    replicaId,
    status: 'stopped',
  };
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

  if (!service) {
    return {
      healthy: false,
      replicaId,
      error: WORKER_ERROR_MSG.REPLICA_NOT_FOUND,
    };
  }

  return {
    healthy: service.initialized,
    replicaId,
    stats: service.getStats ? service.getStats() : null,
  };
}

/**
 * Worker entry point - handles operations from ReplicaWorkerManager.
 * @param {Object} task - Task to execute.
 * @return {Promise<Object>} Task result.
 */
export default async function workerEntryPoint(task) {
  const {operation, replicaId} = task;

  logger.debug('Received operation', {operation, replicaId, threadId});

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
