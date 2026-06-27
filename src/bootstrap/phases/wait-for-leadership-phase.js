/**
 * Wait For Leadership Phase — handles waiting for message group leadership
 * establishment and system service leader readiness during the join process.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {
  INITIAL_PARTITION_IDS,
} from '../system-table-schemas-constants.js';
import {
  getMissingSystemServiceLeaders as getMissingLeaders,
  isSystemTableWriteReady,
} from '../../cache/leader-readiness-gate.js';
import {createSystemLeaderReadinessSnapshot} from '../system-readiness-snapshot.js';
import {
  subscribeToSystemTableCacheChanges,
  waitForStartupConvergence,
} from '../shared/startup-convergence-gate.js';
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
 * Tag a join-time leadership-establishment timeout as retryable.
 *
 * Message-group / system-service leadership not establishing within the wait
 * window is a transient under-load condition during a rolling restart — the
 * cluster is SAFE and still converging — not a terminal misconfiguration.
 * Without this tag the plain Error is classified non-retryable, so the joiner
 * exits on the first attempt and is dropped from membership (surfaces as
 * nodeSlotUnavailable / NODE_EXIT). Both flags are set to cover both consumers:
 * `deferRetry` is matched by isRetryableControlPlaneError (the inner join-resume
 * decision, which preserves durable join progress and re-enters the failed
 * segment) and `retryable` is read by resolveJoinFailureRetryable (the
 * main-level re-join fallback). Both paths are bounded by the resume policy
 * (attempt + elapsed budgets), so a leadership that never establishes still
 * exits — just after retrying within budget. Mirrors
 * buildRetryableMessageGroupRegistrationError and the EADDRINUSE fix (17697edd).
 * @param {Error} error - The leadership-timeout error to tag.
 * @return {Error} The same error, tagged retryable.
 */
function tagJoinLeadershipTimeoutRetryable(error) {
  error.deferRetry = true;
  error.retryable = true;
  return error;
}

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
    const requiredTables = this.getRequiredSystemWriteTables();

    logger.debug(JOINING_LOG_MSG.WAITING_LEADERSHIP, {
      nodeId: this.nodeId,
      timeoutMs,
      messageGroupCount:
        this.delegates.getMessageGroupServicesSize(),
    });

    while (now() - startTime < timeoutMs) {
      // Check whether any local replica can already carry the upcoming join
      // write set through the canonical metadata ingress path.
      const messageGroupServices =
        this.delegates.getMessageGroupServices();
      for (const [replicaId, service] of messageGroupServices) {
        const ingressReady =
          service?.isMetadataIngressReady?.({requiredTables}) === true;
        if (ingressReady) {
          logger.debug(JOINING_LOG_MSG.LEADERSHIP_ESTABLISHED, {
            nodeId: this.nodeId,
            replicaId,
            isLeader:
              service?.isLeaderReplica?.() === true,
            leaderId:
              typeof service?.getLeaderId === TYPEOF.FUNCTION ?
                service.getLeaderId() :
                null,
            requiredTables,
            elapsedMs: now() - startTime,
          });
          return;
        }
      }

      // Wait with exponential backoff
      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    // Timeout - fail joining (transient under load; tag retryable so the join
    // resume loop re-enters the wait within budget instead of exiting).
    const leadershipTimeout = JOINING_ERROR_MSG.leadershipTimeout;
    throw tagJoinLeadershipTimeoutRetryable(
      new Error(leadershipTimeout(timeoutMs)),
    );
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
    const timeoutMs = config.leadershipWaitTimeoutMs;

    logger.debug(JOINING_LOG_MSG.WAITING_LEADERSHIP, {
      nodeId: this.nodeId,
      timeoutMs,
    });

    await waitForStartupConvergence({
      timeoutMs,
      subscriptions: [
        (notify) => subscribeToSystemTableCacheChanges(
          systemTableCache,
          notify,
        ),
      ],
      evaluate: () =>
        this.createSystemServiceLeadershipSnapshot(systemTableCache),
      createTimeoutError: (readiness, context) => {
        const missing =
          this.getMissingSystemServiceLeaders(systemTableCache);
        const blockingMissing = readiness?.missingLeaders || missing;
        const leadershipTimeout = JOINING_ERROR_MSG.leadershipTimeout;
        const error = new Error(leadershipTimeout(timeoutMs));
        error.missingLeaders = blockingMissing;
        error.missingCount = readiness?.missingCount || NUM.ZERO;
        error.nonBlockingMissingLeaders = {
          missingMessageGroupLeaders:
            missing.missingMessageGroupLeaders,
          missingMessageGroupLeaderNodes:
            missing.missingMessageGroupLeaderNodes,
          missingMessageGroupLeaderAddresses:
            missing.missingMessageGroupLeaderAddresses,
        };
        error.timeoutMs = timeoutMs;
        error.timeoutKind = context.timeoutKind;
        return tagJoinLeadershipTimeoutRetryable(error);
      },
    });
  }

  /**
   * Get the system tables that must be write-routable before
   * state-query writes.
   * @return {Array<string>} Required system table names.
   */
  getRequiredSystemWriteTables() {
    return [...JOINING_REQUIRED_WRITE_TABLES];
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
   * @param {Object} _missing - Missing leader diagnostics.
   * @param {Object} systemTableCache - System table cache.
   * @return {Object} Blocking subset for state-query readiness.
   */
  getBlockingSystemServiceLeaders(_missing, systemTableCache) {
    return this.createSystemServiceLeadershipSnapshot(
      systemTableCache,
    ).missingLeaders;
  }

  createSystemServiceLeadershipSnapshot(systemTableCache) {
    return createSystemLeaderReadinessSnapshot({
      systemTableCache,
      requiredTables: this.getRequiredSystemWriteTables(),
      isTableWriteSatisfied: (cache, tableName) =>
        this.isSystemTableWriteRoutable(cache, tableName),
    });
  }
}

export {WaitForLeadershipPhase};
