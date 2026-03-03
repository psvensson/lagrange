/**
 * Wait For Leadership Phase — handles waiting for message group leadership
 * establishment and system service leader readiness during the join process.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../message-group-assignment.js';
import {
  INITIAL_PARTITION_IDS,
} from '../system-table-schemas-constants.js';
import {
  getMissingSystemServiceLeaders as getMissingLeaders,
  getMissingSystemServiceLeaderCount,
  isSystemTableWriteReady,
} from '../../cache/leader-readiness-gate.js';
import {
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
} from '../node-joining-constants.js';
import {ReplicaStatus} from '../../rebalancer/replica-status.js';
import {
  COLUMN,
  NUM,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
} from '../../constants/index.js';

const JOINING_REQUIRED_WRITE_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.NODE_ENDPOINTS,
]);

/**
 * Handles the wait-for-leadership phase of the join process.
 */
class WaitForLeadershipPhase {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.delegates - Callbacks into the joining
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.delegates = options.delegates || {};
  }

  /**
   * Phase: Wait for message group leadership to be established.
   * @return {Promise<void>}
   */
  async phaseWaitForLeadership() {
    const config = this.delegates.getConfig();
    const logger = this.delegates.getLogger();
    const now = this.delegates.getNow();
    const sleep = this.delegates.getSleep();

    const startTime = now();
    const timeoutMs = config.leadershipWaitTimeoutMs;
    let delay = config.leadershipWaitInitialDelayMs;
    const maxDelay = config.leadershipWaitMaxDelayMs;
    const backoffMultiplier = config.leadershipWaitBackoffMultiplier;
    const systemTableCache =
      this.delegates.getSystemTableCache();

    logger.debug(JOINING_LOG_MSG.WAITING_LEADERSHIP, {
      nodeId: this.nodeId,
      timeoutMs,
      messageGroupCount:
        this.delegates.getMessageGroupServicesSize(),
    });

    while (now() - startTime < timeoutMs) {
      const hasCacheLeader =
        this.delegates.hasMessageGroupLeaderInCache(
          systemTableCache,
        );

      // Check if any local replica is leader or has a known leader
      const messageGroupServices =
        this.delegates.getMessageGroupServices();
      for (const [replicaId, service] of messageGroupServices) {
        if (service.isLeaderReplica() || service.getLeaderId()) {
          logger.debug(JOINING_LOG_MSG.LEADERSHIP_ESTABLISHED, {
            nodeId: this.nodeId,
            replicaId,
            isLeader: service.isLeaderReplica(),
            leaderId: service.getLeaderId(),
            elapsedMs: now() - startTime,
          });
          return;
        }
      }
      if (hasCacheLeader) {
        logger.debug(JOINING_LOG_MSG.LEADERSHIP_ESTABLISHED, {
          nodeId: this.nodeId,
          replicaId: null,
          isLeader: false,
          leaderId: null,
          elapsedMs: now() - startTime,
        });
        return;
      }

      // Wait with exponential backoff
      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    // Timeout - fail joining
    const leadershipTimeout = JOINING_ERROR_MSG.leadershipTimeout;
    throw new Error(leadershipTimeout(timeoutMs));
  }

  /**
   * Wait for system table leaders to be present in cache before
   * seeding writes.
   * @param {Object} systemTableCache - System table cache.
   * @return {Promise<void>}
   */
  async waitForSystemServiceLeaders(systemTableCache) {
    const config = this.delegates.getConfig();
    const logger = this.delegates.getLogger();
    const now = this.delegates.getNow();
    const sleep = this.delegates.getSleep();

    const startTime = now();
    const timeoutMs = config.leadershipWaitTimeoutMs;
    let delay = config.leadershipWaitInitialDelayMs;
    const maxDelay = config.leadershipWaitMaxDelayMs;
    const backoffMultiplier = config.leadershipWaitBackoffMultiplier;

    logger.debug(JOINING_LOG_MSG.WAITING_LEADERSHIP, {
      nodeId: this.nodeId,
      timeoutMs,
    });

    while (now() - startTime < timeoutMs) {
      const missing =
        this.getMissingSystemServiceLeaders(systemTableCache);
      const blockingMissing =
        this.getBlockingSystemServiceLeaders(
          missing,
          systemTableCache,
        );
      const missingCount =
        getMissingSystemServiceLeaderCount(blockingMissing);

      if (missingCount === NUM.ZERO) {
        return;
      }

      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    const missing =
      this.getMissingSystemServiceLeaders(systemTableCache);
    const blockingMissing =
      this.getBlockingSystemServiceLeaders(
        missing,
        systemTableCache,
      );
    const leadershipTimeout = JOINING_ERROR_MSG.leadershipTimeout;
    const error = new Error(leadershipTimeout(timeoutMs));
    error.missingLeaders = blockingMissing;
    error.missingCount =
      getMissingSystemServiceLeaderCount(blockingMissing);
    error.nonBlockingMissingLeaders = {
      missingMessageGroupLeaders:
        missing.missingMessageGroupLeaders,
      missingMessageGroupLeaderNodes:
        missing.missingMessageGroupLeaderNodes,
      missingMessageGroupLeaderAddresses:
        missing.missingMessageGroupLeaderAddresses,
    };
    error.timeoutMs = timeoutMs;
    throw error;
  }

  /**
   * Get the system tables that must be write-routable before
   * state-query writes.
   * @return {Array<string>} Required system table names.
   */
  getRequiredSystemWriteTables() {
    const requiredTables = [...JOINING_REQUIRED_WRITE_TABLES];
    const strategy =
      this.delegates.getBootstrapResponse()
        ?.messageGroupAssignment?.strategy;

    if (strategy === AssignmentStrategy.CREATE_SELF_HOSTED) {
      requiredTables.push(TABLES.MESSAGE_GROUPS);
    }

    return requiredTables;
  }

  /**
   * Check whether a system table is currently write-routable for
   * join workflow. Allows follower-routed writes when leader
   * metadata is temporarily stale.
   * @param {Object} systemTableCache - System table cache.
   * @param {string} tableName - System table name.
   * @return {boolean} True when writes can be routed.
   */
  isSystemTableWriteRoutable(systemTableCache, tableName) {
    if (isSystemTableWriteReady(systemTableCache, tableName)) {
      return true;
    }

    const partitionId = INITIAL_PARTITION_IDS[tableName];
    if (
      !partitionId ||
      typeof systemTableCache?.filter !== TYPEOF.FUNCTION
    ) {
      return false;
    }

    const routableServices = systemTableCache.filter(
      TABLES.SERVICES,
      (service) =>
        service?.[COLUMN.SERVICE_TYPE] ===
          SERVICE_TYPE.PARTITION &&
        service?.[COLUMN.PARTITION_ID] === partitionId &&
        service?.[COLUMN.STATUS] !== ReplicaStatus.FAILED &&
        service?.[COLUMN.STATUS] !== ReplicaStatus.REMOVED &&
        typeof service?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        service[COLUMN.ADDRESS].length > NUM.ZERO,
    );

    return routableServices.length > NUM.ZERO;
  }

  /**
   * Check whether the cache currently includes a partition row for
   * a table. Minimal synthetic caches in tests may omit unrelated
   * system partitions.
   * @param {Object} systemTableCache - System table cache.
   * @param {string} tableName - System table name.
   * @return {boolean} True when table partition is present in cache.
   */
  hasSystemTablePartition(systemTableCache, tableName) {
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    if (!partitionId) {
      return false;
    }

    if (typeof systemTableCache?.filter === TYPEOF.FUNCTION) {
      const partitions = systemTableCache.filter(
        TABLES.PARTITIONS,
        (partition) =>
          partition?.[COLUMN.PARTITION_ID] === partitionId,
      );
      return partitions.length > NUM.ZERO;
    }

    if (typeof systemTableCache?.getAll === TYPEOF.FUNCTION) {
      const partitions =
        systemTableCache.getAll(TABLES.PARTITIONS) || [];
      return partitions.some(
        (partition) =>
          partition?.[COLUMN.PARTITION_ID] === partitionId,
      );
    }

    return false;
  }

  /**
   * Find missing service leaders using system table cache.
   * @param {Object} systemTableCache - System table cache.
   * @return {Object} Missing leader lists.
   */
  getMissingSystemServiceLeaders(systemTableCache) {
    return getMissingLeaders(systemTableCache, {
      // leader_node_id in partitions/message_groups is
      // asynchronously propagated. Join readiness only requires
      // routable leader services (address + node_id).
      requireLeaderNodeId: false,
    });
  }

  /**
   * Keep join-time readiness gates focused on system-table write
   * routing. Message-group leader rows can legitimately lag during
   * MOVE_REPLICA handoffs.
   * @param {Object} missing - Missing leader diagnostics.
   * @param {Object} systemTableCache - System table cache.
   * @return {Object} Blocking subset for state-query readiness.
   */
  getBlockingSystemServiceLeaders(missing, systemTableCache) {
    const requiredTables = this.getRequiredSystemWriteTables();
    const missingPartitionLeaders = [];
    const missingPartitionLeaderNodes = [];
    const missingPartitionLeaderAddresses = [];
    const missingRequiredTables = [];

    for (const tableName of requiredTables) {
      if (
        !this.hasSystemTablePartition(
          systemTableCache,
          tableName,
        )
      ) {
        continue;
      }

      if (
        this.isSystemTableWriteRoutable(
          systemTableCache,
          tableName,
        )
      ) {
        continue;
      }

      missingRequiredTables.push(tableName);

      const partitionId = INITIAL_PARTITION_IDS[tableName];
      if (!partitionId) {
        continue;
      }
      missingPartitionLeaders.push(partitionId);

      if (
        missing.missingPartitionLeaderNodes
          ?.includes(partitionId)
      ) {
        missingPartitionLeaderNodes.push(partitionId);
      }
      if (
        missing.missingPartitionLeaderAddresses
          ?.includes(partitionId)
      ) {
        missingPartitionLeaderAddresses.push(partitionId);
      }
    }

    return {
      ...missing,
      missingPartitionLeaders,
      missingPartitionLeaderNodes,
      missingPartitionLeaderAddresses,
      missingMessageGroupLeaders: [],
      missingMessageGroupLeaderNodes: [],
      missingMessageGroupLeaderAddresses: [],
      missingRequiredTables,
    };
  }
}

export {WaitForLeadershipPhase};
