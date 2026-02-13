/**
 * CDCGroupPropagationService - single owner for topology-aware CDC fanout.
 */

import {EventEmitter} from 'events';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {COLUMN, NUM, SERVICE_TYPE, STATE, TABLES, TYPEOF} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  LATENCY_GROUP_STATE,
  LATENCY_PROPAGATION_MODE,
  LATENCY_TOPOLOGY_CONFIG_KEY,
  LATENCY_TOPOLOGY_DEFAULT,
  LATENCY_TOPOLOGY_MESSAGE_TYPE,
} from './latency-topology-constants.js';
import {
  CDC_GROUP_PROPAGATION_ERROR_MSG,
  CDC_GROUP_PROPAGATION_EVENT,
  CDC_GROUP_PROPAGATION_LOG_MSG,
  CDC_GROUP_PROPAGATION_REASON,
  CDC_GROUP_PROPAGATION_STATE,
  CDC_GROUP_PROPAGATION_STATUS,
  CDC_GROUP_PROPAGATION_SUBSYSTEM,
} from './cdc-group-propagation-constants.js';

const CDC_GROUP_PROPAGATION_MESSAGE = Object.freeze({
  STATUS_DELIVERED: 'delivered',
});

class CDCGroupPropagationService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.systemTableCache
   * @param {Object} options.messageRouter
   * @param {Object} options.latencyTreeService
   * @param {Function} options.nowFn
   */
  constructor(options = {}) {
    super();
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.messageRouter = options.messageRouter || null;
    this.latencyTreeService = options.latencyTreeService || null;
    this.nowFn = options.nowFn || Date.now;

    this.config = ConfigurationManager.getInstance();
    this.propagationMode = LATENCY_TOPOLOGY_DEFAULT.PROPAGATION_MODE;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CDC_GROUP_PROPAGATION_SUBSYSTEM) :
      console;

    this.state = CDC_GROUP_PROPAGATION_STATE.CREATED;
    this.stats = {
      groupedCount: NUM.ZERO,
      safeCount: NUM.ZERO,
      fallbackCount: NUM.ZERO,
      groupedDeliveryFailureCount: NUM.ZERO,
      lastMode: null,
      lastFallbackReason: null,
      lastPropagationAt: null,
      lastTargetGroupCount: NUM.ZERO,
    };
  }

  /**
   * Initialize dependencies.
   * @param {Object} options
   */
  initialize(options = {}) {
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.messageRouter) {
      this.messageRouter = options.messageRouter;
    }
    if (options.latencyTreeService) {
      this.latencyTreeService = options.latencyTreeService;
    }
    if (options.nowFn) {
      this.nowFn = options.nowFn;
    }

    this.nodeId = assertCritical(
      this.nodeId,
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_NODE_ID,
    );
    this.systemTableCache = assertCritical(
      this.systemTableCache,
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CACHE,
    );
    this.latencyTreeService = assertCritical(
      this.latencyTreeService,
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_TREE_SERVICE,
    );

    this.refreshConfig();
    this.state = CDC_GROUP_PROPAGATION_STATE.INITIALIZED;
    this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      propagationMode: this.propagationMode,
    });
  }

  /**
   * Start propagation lifecycle.
   */
  start() {
    this.ensureInitialized();
    this.refreshConfig();
    this.state = CDC_GROUP_PROPAGATION_STATE.RUNNING;
    this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.STARTED, {
      nodeId: this.nodeId,
      propagationMode: this.propagationMode,
    });
  }

  /**
   * Stop propagation lifecycle.
   */
  stop() {
    this.state = CDC_GROUP_PROPAGATION_STATE.STOPPED;
    this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.STOPPED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Propagate one CDC event through grouped mode or safe mode.
   * @param {Object} options
   * @param {string} options.tableName
   * @param {string} options.operation
   * @param {Object} options.data
   * @param {Object} options.sourceMessageGroupService
   * @return {Promise<Object>}
   */
  async propagateCDCEvent(options = {}) {
    this.ensureInitialized();
    const tableName = options.tableName;
    const operation = options.operation;
    const data = options.data;
    const sourceMessageGroupService = options.sourceMessageGroupService;

    assertCritical(
      sourceMessageGroupService &&
      typeof sourceMessageGroupService.applyCDCEvent === TYPEOF.FUNCTION,
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_MESSAGE_GROUP_SERVICE,
    );
    assertCritical(
      tableName && operation && data,
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CDC_PAYLOAD,
    );

    this.refreshConfig();
    const groupedContext = this.buildGroupedContext();
    if (groupedContext.fallbackReason) {
      return this.propagateSafe({
        tableName,
        operation,
        data,
        sourceMessageGroupService,
        fallbackReason: groupedContext.fallbackReason,
      });
    }

    if (this.propagationMode !== LATENCY_PROPAGATION_MODE.GROUPED) {
      return this.propagateSafe({
        tableName,
        operation,
        data,
        sourceMessageGroupService,
        fallbackReason: CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE,
      });
    }

    await sourceMessageGroupService.applyCDCEvent(tableName, operation, data);

    const deliveryFailures = [];
    for (const target of groupedContext.targets) {
      const payload = {
        type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION,
        tableName,
        operation,
        data,
        sourceNodeId: this.nodeId,
        sourceGroupId: groupedContext.sourceGroupId,
        targetGroupId: target.groupId,
      };
      const result = await this.messageRouter.deliver(
        target.address,
        payload,
        {targetNodeId: target.coordinatorNodeId},
      );
      if (!result?.acknowledged) {
        deliveryFailures.push({
          targetGroupId: target.groupId,
          coordinatorNodeId: target.coordinatorNodeId,
          address: target.address,
          error: result?.error || null,
        });
      }
    }

    const timestamp = this.now();
    this.stats.groupedCount += NUM.ONE;
    this.stats.lastMode = CDC_GROUP_PROPAGATION_STATUS.GROUPED;
    this.stats.lastFallbackReason = null;
    this.stats.lastPropagationAt = timestamp;
    this.stats.lastTargetGroupCount = groupedContext.targets.length;

    if (deliveryFailures.length > NUM.ZERO) {
      this.stats.groupedDeliveryFailureCount += deliveryFailures.length;
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.GROUPED_DELIVERY_FAILED, {
        nodeId: this.nodeId,
        tableName,
        operation,
        failureCount: deliveryFailures.length,
      });
    }

    const result = {
      success: deliveryFailures.length === NUM.ZERO,
      mode: CDC_GROUP_PROPAGATION_STATUS.GROUPED,
      status: CDC_GROUP_PROPAGATION_MESSAGE.STATUS_DELIVERED,
      sourceGroupId: groupedContext.sourceGroupId,
      targetGroupCount: groupedContext.targets.length,
      deliveryFailures,
      timestamp,
    };
    this.emit(CDC_GROUP_PROPAGATION_EVENT.PROPAGATED, result);
    this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.PROPAGATED_GROUPED, {
      nodeId: this.nodeId,
      tableName,
      operation,
      sourceGroupId: groupedContext.sourceGroupId,
      targetGroupCount: groupedContext.targets.length,
      deliveryFailureCount: deliveryFailures.length,
    });
    return result;
  }

  /**
   * Apply canonical safe propagation path.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async propagateSafe(options) {
    await options.sourceMessageGroupService.applyCDCEvent(
      options.tableName,
      options.operation,
      options.data,
    );

    const timestamp = this.now();
    this.stats.safeCount += NUM.ONE;
    this.stats.lastMode = CDC_GROUP_PROPAGATION_STATUS.SAFE;
    this.stats.lastFallbackReason = options.fallbackReason || null;
    this.stats.lastPropagationAt = timestamp;
    this.stats.lastTargetGroupCount = NUM.ZERO;

    if (options.fallbackReason) {
      this.stats.fallbackCount += NUM.ONE;
      this.emit(CDC_GROUP_PROPAGATION_EVENT.SAFE_FALLBACK, {
        reason: options.fallbackReason,
        tableName: options.tableName,
        operation: options.operation,
      });
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.SAFE_FALLBACK, {
        nodeId: this.nodeId,
        tableName: options.tableName,
        operation: options.operation,
        reason: options.fallbackReason,
      });
    }

    this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.PROPAGATED_SAFE, {
      nodeId: this.nodeId,
      tableName: options.tableName,
      operation: options.operation,
    });

    return {
      success: true,
      mode: CDC_GROUP_PROPAGATION_STATUS.SAFE,
      status: CDC_GROUP_PROPAGATION_MESSAGE.STATUS_DELIVERED,
      fallbackReason: options.fallbackReason || null,
      timestamp,
    };
  }

  /**
   * Build grouped propagation routing context.
   * @return {Object}
   * @private
   */
  buildGroupedContext() {
    const localNode = this.systemTableCache.get(TABLES.NODES, this.nodeId);
    const sourceGroupId = localNode?.[COLUMN.LATENCY_GROUP_ID] || null;
    if (!sourceGroupId) {
      return {
        sourceGroupId: null,
        targets: [],
        fallbackReason: CDC_GROUP_PROPAGATION_REASON.MISSING_LOCAL_GROUP,
      };
    }

    const activeGroups = this.systemTableCache
      .getAll(TABLES.LATENCY_GROUPS)
      .filter((groupRow) => {
        const groupId = groupRow?.[COLUMN.GROUP_ID];
        const state = groupRow?.[COLUMN.STATE];
        if (!groupId) {
          return false;
        }
        return !state || state === LATENCY_GROUP_STATE.ACTIVE;
      });
    if (activeGroups.length === NUM.ZERO) {
      return {
        sourceGroupId,
        targets: [],
        fallbackReason: CDC_GROUP_PROPAGATION_REASON.MISSING_ACTIVE_GROUPS,
      };
    }

    const targetOrder = this.latencyTreeService.getRoutingOrder(sourceGroupId);
    const groupById = new Map(activeGroups.map((groupRow) =>
      [groupRow[COLUMN.GROUP_ID], groupRow],
    ));
    const orderedTargetIds = targetOrder.filter((groupId) => groupId !== sourceGroupId);
    const targets = [];

    for (const groupId of orderedTargetIds) {
      const groupRow = groupById.get(groupId);
      if (!groupRow) {
        continue;
      }
      const coordinatorNodeId = groupRow?.[COLUMN.COORDINATOR_NODE_ID];
      if (!coordinatorNodeId) {
        return {
          sourceGroupId,
          targets: [],
          fallbackReason: CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_NODE,
        };
      }
      const address = this.resolveCoordinatorAddress(coordinatorNodeId);
      if (!address) {
        return {
          sourceGroupId,
          targets: [],
          fallbackReason: CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS,
        };
      }
      targets.push({
        groupId,
        coordinatorNodeId,
        address,
      });
    }

    if (targets.length > NUM.ZERO &&
      (!this.messageRouter ||
        typeof this.messageRouter.deliver !== TYPEOF.FUNCTION)) {
      return {
        sourceGroupId,
        targets: [],
        fallbackReason: CDC_GROUP_PROPAGATION_REASON.MESSAGE_ROUTER_UNAVAILABLE,
      };
    }

    return {
      sourceGroupId,
      targets,
      fallbackReason: null,
    };
  }

  /**
   * Resolve one coordinator message-group address for a node.
   * @param {string} coordinatorNodeId
   * @return {string|null}
   * @private
   */
  resolveCoordinatorAddress(coordinatorNodeId) {
    const services = this.systemTableCache.filter(TABLES.SERVICES, (serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        serviceRow?.[COLUMN.NODE_ID] === coordinatorNodeId &&
        serviceRow?.[COLUMN.STATUS] === STATE.ACTIVE &&
        typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    });
    if (services.length === NUM.ZERO) {
      return null;
    }

    const sorted = [...services].sort((left, right) => {
      const leftLeader = left?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
      const rightLeader = right?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
      if (leftLeader && !rightLeader) {
        return NUM.NEGATIVE_ONE;
      }
      if (!leftLeader && rightLeader) {
        return NUM.ONE;
      }
      const leftServiceId = left?.[COLUMN.SERVICE_ID] || '';
      const rightServiceId = right?.[COLUMN.SERVICE_ID] || '';
      if (leftServiceId < rightServiceId) {
        return NUM.NEGATIVE_ONE;
      }
      if (leftServiceId > rightServiceId) {
        return NUM.ONE;
      }
      return NUM.ZERO;
    });

    return sorted[NUM.ZERO]?.[COLUMN.ADDRESS] || null;
  }

  /**
   * Refresh propagation mode from centralized config.
   */
  refreshConfig() {
    const value = this.config.get(LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE);
    if (value === LATENCY_PROPAGATION_MODE.GROUPED) {
      this.propagationMode = LATENCY_PROPAGATION_MODE.GROUPED;
      return;
    }
    this.propagationMode = LATENCY_PROPAGATION_MODE.SAFE;
  }

  /**
   * Get current diagnostics counters.
   * @return {Object}
   */
  getStats() {
    return {
      ...this.stats,
      nodeId: this.nodeId,
      state: this.state,
      propagationMode: this.propagationMode,
    };
  }

  /**
   * Ensure lifecycle initialization has happened.
   * @private
   */
  ensureInitialized() {
    assertCritical(
      this.state !== CDC_GROUP_PROPAGATION_STATE.CREATED,
      CDC_GROUP_PROPAGATION_ERROR_MSG.NOT_INITIALIZED,
    );
  }

  /**
   * Current wall-clock time.
   * @return {number}
   * @private
   */
  now() {
    return this.nowFn();
  }
}

export {CDCGroupPropagationService};
