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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { threadId } from 'worker_threads';
import { WORKER_OPERATION, WORKER_ERROR_MSG } from './worker-constants.js';
import { PartitionWorkerService } from './partition-worker-service.js';
import { MessageGroupWorkerService } from './message-group-worker-service.js';

/**
 * Active replicas in this worker process.
 * @type {Map<string, PartitionWorkerService|MessageGroupWorkerService>}
 */
const replicas = new Map();

/**
 * Logger for worker process.
 * @type {Object}
 */
const logger = stryMutAct_9fa48("165994") ? {} : (stryCov_9fa48("165994"), {
  info: stryMutAct_9fa48("165995") ? () => undefined : (stryCov_9fa48("165995"), (...args) => console.log(stryMutAct_9fa48("165996") ? `` : (stryCov_9fa48("165996"), `[Worker ${threadId}]`), ...args)),
  debug: stryMutAct_9fa48("165997") ? () => undefined : (stryCov_9fa48("165997"), (...args) => console.debug(stryMutAct_9fa48("165998") ? `` : (stryCov_9fa48("165998"), `[Worker ${threadId}]`), ...args)),
  trace: stryMutAct_9fa48("165999") ? () => undefined : (stryCov_9fa48("165999"), (...args) => console.debug(stryMutAct_9fa48("166000") ? `` : (stryCov_9fa48("166000"), `[Worker ${threadId}]`), ...args)),
  warn: stryMutAct_9fa48("166001") ? () => undefined : (stryCov_9fa48("166001"), (...args) => console.warn(stryMutAct_9fa48("166002") ? `` : (stryCov_9fa48("166002"), `[Worker ${threadId}]`), ...args)),
  error: stryMutAct_9fa48("166003") ? () => undefined : (stryCov_9fa48("166003"), (...args) => console.error(stryMutAct_9fa48("166004") ? `` : (stryCov_9fa48("166004"), `[Worker ${threadId}]`), ...args))
});

/**
 * Create a partition replica in this worker process.
 * @param {Object} options - Partition configuration.
 * @return {Promise<Object>} Result with workerId.
 */
async function createPartitionReplica(options) {
  if (stryMutAct_9fa48("166005")) {
    {}
  } else {
    stryCov_9fa48("166005");
    const {
      replicaId
    } = options;
    if (stryMutAct_9fa48("166007") ? false : stryMutAct_9fa48("166006") ? true : (stryCov_9fa48("166006", "166007"), replicas.has(replicaId))) {
      if (stryMutAct_9fa48("166008")) {
        {}
      } else {
        stryCov_9fa48("166008");
        throw new Error(WORKER_ERROR_MSG.REPLICA_ALREADY_EXISTS);
      }
    }
    logger.info(stryMutAct_9fa48("166009") ? "" : (stryCov_9fa48("166009"), 'Creating partition replica'), stryMutAct_9fa48("166010") ? {} : (stryCov_9fa48("166010"), {
      replicaId,
      threadId
    }));
    const service = new PartitionWorkerService(stryMutAct_9fa48("166011") ? {} : (stryCov_9fa48("166011"), {
      nodeId: options.nodeId,
      partitionId: options.partitionId,
      replicaId: options.replicaId,
      tableId: options.tableId,
      tableName: options.tableName,
      schema: options.schema,
      dbPath: options.dbPath,
      replicaIds: options.replicaIds,
      peerAddresses: options.peerAddresses,
      deferElection: stryMutAct_9fa48("166014") ? options.deferElection !== true : stryMutAct_9fa48("166013") ? false : stryMutAct_9fa48("166012") ? true : (stryCov_9fa48("166012", "166013", "166014"), options.deferElection === (stryMutAct_9fa48("166015") ? false : (stryCov_9fa48("166015"), true))),
      logger
    }));

    // Call initialize() which creates messageBridge and then calls onInitialize()
    await service.initialize();
    replicas.set(replicaId, service);
    logger.info(stryMutAct_9fa48("166016") ? "" : (stryCov_9fa48("166016"), 'Partition replica created'), stryMutAct_9fa48("166017") ? {} : (stryCov_9fa48("166017"), {
      replicaId,
      threadId
    }));
    return stryMutAct_9fa48("166018") ? {} : (stryCov_9fa48("166018"), {
      workerId: threadId,
      replicaId,
      status: stryMutAct_9fa48("166019") ? "" : (stryCov_9fa48("166019"), 'created')
    });
  }
}

/**
 * Create a message group replica in this worker process.
 * @param {Object} options - Message group configuration.
 * @return {Promise<Object>} Result with workerId.
 */
async function createMessageGroupReplica(options) {
  if (stryMutAct_9fa48("166020")) {
    {}
  } else {
    stryCov_9fa48("166020");
    const {
      replicaId
    } = options;
    if (stryMutAct_9fa48("166022") ? false : stryMutAct_9fa48("166021") ? true : (stryCov_9fa48("166021", "166022"), replicas.has(replicaId))) {
      if (stryMutAct_9fa48("166023")) {
        {}
      } else {
        stryCov_9fa48("166023");
        throw new Error(WORKER_ERROR_MSG.REPLICA_ALREADY_EXISTS);
      }
    }
    logger.info(stryMutAct_9fa48("166024") ? "" : (stryCov_9fa48("166024"), 'Creating message group replica'), stryMutAct_9fa48("166025") ? {} : (stryCov_9fa48("166025"), {
      replicaId,
      threadId
    }));
    const service = new MessageGroupWorkerService(stryMutAct_9fa48("166026") ? {} : (stryCov_9fa48("166026"), {
      nodeId: options.nodeId,
      groupId: options.groupId,
      replicaId: options.replicaId,
      replicaIds: options.replicaIds,
      peerAddresses: options.peerAddresses,
      deferElection: stryMutAct_9fa48("166029") ? options.deferElection !== true : stryMutAct_9fa48("166028") ? false : stryMutAct_9fa48("166027") ? true : (stryCov_9fa48("166027", "166028", "166029"), options.deferElection === (stryMutAct_9fa48("166030") ? false : (stryCov_9fa48("166030"), true))),
      logger
    }));

    // Call initialize() which creates messageBridge and then calls onInitialize()
    await service.initialize();
    replicas.set(replicaId, service);
    logger.info(stryMutAct_9fa48("166031") ? "" : (stryCov_9fa48("166031"), 'Message group replica created'), stryMutAct_9fa48("166032") ? {} : (stryCov_9fa48("166032"), {
      replicaId,
      threadId
    }));
    return stryMutAct_9fa48("166033") ? {} : (stryCov_9fa48("166033"), {
      workerId: threadId,
      replicaId,
      status: stryMutAct_9fa48("166034") ? "" : (stryCov_9fa48("166034"), 'created')
    });
  }
}

/**
 * Stop a replica in this worker process.
 * @param {string} replicaId - Replica ID to stop.
 * @return {Promise<Object>} Result.
 */
async function stopReplica(replicaId) {
  if (stryMutAct_9fa48("166035")) {
    {}
  } else {
    stryCov_9fa48("166035");
    const service = replicas.get(replicaId);
    if (stryMutAct_9fa48("166038") ? false : stryMutAct_9fa48("166037") ? true : stryMutAct_9fa48("166036") ? service : (stryCov_9fa48("166036", "166037", "166038"), !service)) {
      if (stryMutAct_9fa48("166039")) {
        {}
      } else {
        stryCov_9fa48("166039");
        throw new Error(WORKER_ERROR_MSG.REPLICA_NOT_FOUND);
      }
    }
    logger.info(stryMutAct_9fa48("166040") ? "" : (stryCov_9fa48("166040"), 'Stopping replica'), stryMutAct_9fa48("166041") ? {} : (stryCov_9fa48("166041"), {
      replicaId,
      threadId
    }));
    await service.onStop();
    replicas.delete(replicaId);
    logger.info(stryMutAct_9fa48("166042") ? "" : (stryCov_9fa48("166042"), 'Replica stopped'), stryMutAct_9fa48("166043") ? {} : (stryCov_9fa48("166043"), {
      replicaId,
      threadId
    }));
    return stryMutAct_9fa48("166044") ? {} : (stryCov_9fa48("166044"), {
      replicaId,
      status: stryMutAct_9fa48("166045") ? "" : (stryCov_9fa48("166045"), 'stopped')
    });
  }
}

/**
 * Deliver a message to a replica in this worker process.
 * @param {string} replicaId - Target replica ID.
 * @param {Object} message - Message to deliver.
 * @return {Promise<Object>} Response from replica.
 */
async function deliverMessage(replicaId, message) {
  if (stryMutAct_9fa48("166046")) {
    {}
  } else {
    stryCov_9fa48("166046");
    const service = replicas.get(replicaId);
    if (stryMutAct_9fa48("166049") ? false : stryMutAct_9fa48("166048") ? true : stryMutAct_9fa48("166047") ? service : (stryCov_9fa48("166047", "166048", "166049"), !service)) {
      if (stryMutAct_9fa48("166050")) {
        {}
      } else {
        stryCov_9fa48("166050");
        throw new Error(WORKER_ERROR_MSG.REPLICA_NOT_FOUND);
      }
    }
    return service.handleMessage(message);
  }
}

/**
 * Perform health check on a replica.
 * @param {string} replicaId - Replica ID to check.
 * @return {Promise<Object>} Health status.
 */
async function healthCheck(replicaId) {
  if (stryMutAct_9fa48("166051")) {
    {}
  } else {
    stryCov_9fa48("166051");
    const service = replicas.get(replicaId);
    if (stryMutAct_9fa48("166054") ? false : stryMutAct_9fa48("166053") ? true : stryMutAct_9fa48("166052") ? service : (stryCov_9fa48("166052", "166053", "166054"), !service)) {
      if (stryMutAct_9fa48("166055")) {
        {}
      } else {
        stryCov_9fa48("166055");
        return stryMutAct_9fa48("166056") ? {} : (stryCov_9fa48("166056"), {
          healthy: stryMutAct_9fa48("166057") ? true : (stryCov_9fa48("166057"), false),
          replicaId,
          error: WORKER_ERROR_MSG.REPLICA_NOT_FOUND
        });
      }
    }
    return stryMutAct_9fa48("166058") ? {} : (stryCov_9fa48("166058"), {
      healthy: service.initialized,
      replicaId,
      stats: service.getStats ? service.getStats() : null
    });
  }
}

/**
 * Worker entry point - handles operations from ReplicaWorkerManager.
 * @param {Object} task - Task to execute.
 * @return {Promise<Object>} Task result.
 */
export default async function workerEntryPoint(task) {
  if (stryMutAct_9fa48("166059")) {
    {}
  } else {
    stryCov_9fa48("166059");
    const {
      operation,
      replicaId
    } = task;
    logger.debug(stryMutAct_9fa48("166060") ? "" : (stryCov_9fa48("166060"), 'Received operation'), stryMutAct_9fa48("166061") ? {} : (stryCov_9fa48("166061"), {
      operation,
      replicaId,
      threadId
    }));
    switch (operation) {
      case WORKER_OPERATION.CREATE_PARTITION_REPLICA:
        if (stryMutAct_9fa48("166062")) {} else {
          stryCov_9fa48("166062");
          return createPartitionReplica(task);
        }
      case WORKER_OPERATION.CREATE_MESSAGE_GROUP_REPLICA:
        if (stryMutAct_9fa48("166063")) {} else {
          stryCov_9fa48("166063");
          return createMessageGroupReplica(task);
        }
      case WORKER_OPERATION.STOP_REPLICA:
        if (stryMutAct_9fa48("166064")) {} else {
          stryCov_9fa48("166064");
          return stopReplica(replicaId);
        }
      case WORKER_OPERATION.DELIVER_MESSAGE:
        if (stryMutAct_9fa48("166065")) {} else {
          stryCov_9fa48("166065");
          return deliverMessage(replicaId, task.message);
        }
      case WORKER_OPERATION.HEALTH_CHECK:
        if (stryMutAct_9fa48("166066")) {} else {
          stryCov_9fa48("166066");
          return healthCheck(replicaId);
        }
      default:
        if (stryMutAct_9fa48("166067")) {} else {
          stryCov_9fa48("166067");
          throw new Error(stryMutAct_9fa48("166068") ? `` : (stryCov_9fa48("166068"), `${WORKER_ERROR_MSG.UNKNOWN_OPERATION}: ${operation}`));
        }
    }
  }
}

// Export for testing
export { replicas, createPartitionReplica, createMessageGroupReplica, stopReplica, deliverMessage, healthCheck };