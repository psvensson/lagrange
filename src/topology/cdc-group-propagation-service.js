/**
 * CDCGroupPropagationService - single owner for topology-aware CDC fanout.
 */

import {EventEmitter} from 'events';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {COLUMN, NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES, TYPEOF} from '../constants/index.js';
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
  CDC_GROUP_PROPAGATION_RETRY,
  CDC_GROUP_PROPAGATION_STATE,
  CDC_GROUP_PROPAGATION_STRATEGY,
  CDC_GROUP_PROPAGATION_STATUS,
  CDC_GROUP_PROPAGATION_SUBSYSTEM,
} from './cdc-group-propagation-constants.js';

const CDC_GROUP_PROPAGATION_MESSAGE = Object.freeze({
  STATUS_DELIVERED: 'delivered',
});
const MESSAGE_GROUP_REPLICA_SUFFIX = '-r';
const DELIVERY_ERROR_UNKNOWN = 'unknown delivery error';

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
      lastStrategy: null,
      lastMode: null,
      lastFallbackReason: null,
      lastPropagationAt: null,
      lastTargetGroupCount: NUM.ZERO,
    };

    this.deliveryRetryMaxAttempts = this.resolvePositiveInteger(
      options.deliveryRetryMaxAttempts,
      CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS,
    );
    this.deliveryRetryDelayMs = this.resolvePositiveInteger(
      options.deliveryRetryDelayMs,
      CDC_GROUP_PROPAGATION_RETRY.INITIAL_DELAY_MS,
    );
    this.deliveryRetryBackoffMultiplier = this.resolvePositiveNumber(
      options.deliveryRetryBackoffMultiplier,
      CDC_GROUP_PROPAGATION_RETRY.BACKOFF_MULTIPLIER,
    );
    this.deliveryRetryMaxDelayMs = this.resolvePositiveInteger(
      options.deliveryRetryMaxDelayMs,
      CDC_GROUP_PROPAGATION_RETRY.MAX_DELAY_MS,
    );
    this.backgroundRetryTimers = new Set();
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
    this.clearBackgroundRetryTimers();
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

    const deliveryFailures = await this.deliverToTargetsWithRetry({
      tableName,
      operation,
      data,
      sourceGroupId: groupedContext.sourceGroupId,
      targets: groupedContext.targets,
    });

    const timestamp = this.now();
    this.stats.groupedCount += NUM.ONE;
    this.stats.lastStrategy =
      CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR;
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
      strategy: CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR,
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
      strategy: CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR,
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

    const sourceGroupId = this.resolveSourceMessageGroupId(
      options.sourceMessageGroupService,
    );
    const safeTargets = this.buildSafeTargets(sourceGroupId);
    const deliveryFailures = await this.deliverToTargetsWithRetry({
      tableName: options.tableName,
      operation: options.operation,
      data: options.data,
      sourceGroupId,
      targets: safeTargets,
    });

    const timestamp = this.now();
    this.stats.safeCount += NUM.ONE;
    this.stats.lastStrategy =
      CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT;
    this.stats.lastMode = CDC_GROUP_PROPAGATION_STATUS.SAFE;
    this.stats.lastFallbackReason = options.fallbackReason || null;
    this.stats.lastPropagationAt = timestamp;
    this.stats.lastTargetGroupCount = safeTargets.length;

    if (options.fallbackReason) {
      this.stats.fallbackCount += NUM.ONE;
      this.emit(CDC_GROUP_PROPAGATION_EVENT.SAFE_FALLBACK, {
        reason: options.fallbackReason,
        tableName: options.tableName,
        operation: options.operation,
      });
      const fallbackLogContext = {
        nodeId: this.nodeId,
        tableName: options.tableName,
        operation: options.operation,
        strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT,
        reason: options.fallbackReason,
      };
      if (options.fallbackReason === CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE) {
        this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.SAFE_FALLBACK, fallbackLogContext);
      } else {
        this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.SAFE_FALLBACK, fallbackLogContext);
      }
    }

    this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.PROPAGATED_SAFE, {
      nodeId: this.nodeId,
      tableName: options.tableName,
      operation: options.operation,
      strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT,
    });

    return {
      success: deliveryFailures.length === NUM.ZERO,
      strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT,
      mode: CDC_GROUP_PROPAGATION_STATUS.SAFE,
      status: CDC_GROUP_PROPAGATION_MESSAGE.STATUS_DELIVERED,
      sourceGroupId,
      targetGroupCount: safeTargets.length,
      deliveryFailures,
      fallbackReason: options.fallbackReason || null,
      timestamp,
    };
  }

  /**
   * Deliver CDC payload to targets with bounded retry on failed destinations.
   * @param {Object} options
   * @return {Promise<Array<Object>>}
   * @private
   */
  async deliverToTargetsWithRetry(options) {
    let pendingTargets = Array.isArray(options.targets) ?
      [...options.targets] :
      [];
    let deliveryFailures = [];
    let attempt = NUM.ONE;
    const maxAttempts = Math.max(NUM.ONE, this.deliveryRetryMaxAttempts);

    while (pendingTargets.length > NUM.ZERO && attempt <= maxAttempts) {
      deliveryFailures = await this.deliverToTargets({
        ...options,
        targets: pendingTargets,
      });

      if (deliveryFailures.length === NUM.ZERO) {
        return [];
      }

      if (attempt >= maxAttempts) {
        break;
      }

      const retryDelayMs = this.computeRetryDelayMs(attempt);
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.RETRYING_DELIVERY_FAILURES, {
        nodeId: this.nodeId,
        tableName: options.tableName,
        operation: options.operation,
        attempt,
        retryDelayMs,
        failureCount: deliveryFailures.length,
      });
      await this.sleep(retryDelayMs);

      pendingTargets = this.convertFailuresToRetryTargets(deliveryFailures);
      attempt += NUM.ONE;
    }

    if (deliveryFailures.length > NUM.ZERO) {
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, {
        nodeId: this.nodeId,
        tableName: options.tableName,
        operation: options.operation,
        attempts: maxAttempts,
        failureCount: deliveryFailures.length,
      });
      const retryTargets = this.convertFailuresToRetryTargets(deliveryFailures);
      this.scheduleBackgroundRetry({
        tableName: options.tableName,
        operation: options.operation,
        data: options.data,
        sourceGroupId: options.sourceGroupId,
        targets: retryTargets,
        attempt: maxAttempts + NUM.ONE,
      });
    }

    return deliveryFailures;
  }

  /**
   * Continue delivery retries in background after bounded synchronous retries.
   * @param {Object} options
   * @param {string} options.tableName
   * @param {string} options.operation
   * @param {Object} options.data
   * @param {string|null} options.sourceGroupId
   * @param {Array<Object>} options.targets
   * @param {number} options.attempt
   * @private
   */
  scheduleBackgroundRetry(options) {
    if (this.state !== CDC_GROUP_PROPAGATION_STATE.RUNNING) {
      return;
    }
    if (!Array.isArray(options.targets) || options.targets.length === NUM.ZERO) {
      return;
    }

    const attempt = Number.isFinite(options.attempt) && options.attempt > NUM.ZERO ?
      Math.floor(options.attempt) :
      NUM.ONE;
    const retryDelayMs = this.computeRetryDelayMs(attempt);
    this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.RETRYING_DELIVERY_FAILURES, {
      nodeId: this.nodeId,
      tableName: options.tableName,
      operation: options.operation,
      attempt,
      retryDelayMs,
      failureCount: options.targets.length,
      background: true,
    });

    const retryTimer = setTimeout(async () => {
      this.backgroundRetryTimers.delete(retryTimer);
      if (this.state !== CDC_GROUP_PROPAGATION_STATE.RUNNING) {
        return;
      }

      const deliveryFailures = await this.deliverToTargets({
        tableName: options.tableName,
        operation: options.operation,
        data: options.data,
        sourceGroupId: options.sourceGroupId,
        targets: options.targets,
      });
      if (deliveryFailures.length === NUM.ZERO) {
        return;
      }
      const retryTargets = this.convertFailuresToRetryTargets(deliveryFailures);
      this.scheduleBackgroundRetry({
        tableName: options.tableName,
        operation: options.operation,
        data: options.data,
        sourceGroupId: options.sourceGroupId,
        targets: retryTargets,
        attempt: attempt + NUM.ONE,
      });
    }, retryDelayMs);
    this.backgroundRetryTimers.add(retryTimer);
  }

  /**
   * Clear all pending background retry timers.
   * @private
   */
  clearBackgroundRetryTimers() {
    for (const retryTimer of this.backgroundRetryTimers) {
      clearTimeout(retryTimer);
    }
    this.backgroundRetryTimers.clear();
  }

  /**
   * Convert delivery failures into retry targets.
   * @param {Array<Object>} deliveryFailures
   * @return {Array<Object>}
   * @private
   */
  convertFailuresToRetryTargets(deliveryFailures) {
    const targetsByGroupId = new Map();
    for (const failure of deliveryFailures) {
      const groupId = failure?.targetGroupId;
      if (typeof groupId !== TYPEOF.STRING || groupId.length === NUM.ZERO) {
        continue;
      }
      targetsByGroupId.set(groupId, {
        groupId,
        coordinatorNodeId: failure?.coordinatorNodeId || null,
        address: failure?.address || null,
      });
    }
    return [...targetsByGroupId.values()];
  }

  /**
   * Compute exponential backoff retry delay.
   * @param {number} attempt
   * @return {number}
   * @private
   */
  computeRetryDelayMs(attempt) {
    const safeAttempt = Number.isFinite(attempt) && attempt > NUM.ZERO ?
      attempt :
      NUM.ONE;
    const exponentialFactor = Math.pow(
      this.deliveryRetryBackoffMultiplier,
      safeAttempt - NUM.ONE,
    );
    const delayMs = this.deliveryRetryDelayMs * exponentialFactor;
    return Math.min(this.deliveryRetryMaxDelayMs, Math.max(NUM.ONE, Math.floor(delayMs)));
  }

  /**
   * Sleep helper for retry delay.
   * @param {number} delayMs
   * @return {Promise<void>}
   * @private
   */
  async sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
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
    const services = this.resolveActiveMessageGroupServices((serviceRow) => {
      return serviceRow?.[COLUMN.NODE_ID] === coordinatorNodeId;
    });
    if (services.length === NUM.ZERO) {
      return null;
    }

    const sorted = this.sortCoordinatorCandidates(services);

    return sorted[NUM.ZERO]?.[COLUMN.ADDRESS] || null;
  }

  /**
   * Resolve source message-group id from message-group service owner.
   * @param {Object} sourceMessageGroupService
   * @return {string|null}
   * @private
   */
  resolveSourceMessageGroupId(sourceMessageGroupService) {
    const groupId = sourceMessageGroupService?.groupId;
    if (typeof groupId !== TYPEOF.STRING || groupId.length === NUM.ZERO) {
      return null;
    }
    return groupId;
  }

  /**
   * Resolve active message-group service rows from cache.
   * @param {Function|null} predicate
   * @return {Array<Object>}
   * @private
   */
  resolveActiveMessageGroupServices(predicate = null) {
    const rowPredicate = typeof predicate === TYPEOF.FUNCTION ? predicate : null;
    return this.systemTableCache.filter(TABLES.SERVICES, (serviceRow) => {
      const isMessageGroup =
        serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
      const isActive = serviceRow?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE;
      const hasAddress =
        typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
      if (!isMessageGroup || !isActive || !hasAddress) {
        return false;
      }
      if (!rowPredicate) {
        return true;
      }
      return rowPredicate(serviceRow) === true;
    });
  }

  /**
   * Deterministically sort coordinator candidates.
   * Prefers leaders then lexical service id.
   * @param {Array<Object>} services
   * @return {Array<Object>}
   * @private
   */
  sortCoordinatorCandidates(services) {
    return [...services].sort((left, right) => {
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
  }

  /**
   * Resolve message-group id from services row.
   * @param {Object} serviceRow
   * @return {string|null}
   * @private
   */
  resolveMessageGroupId(serviceRow) {
    const explicitGroupId = serviceRow?.[COLUMN.GROUP_ID];
    if (typeof explicitGroupId === TYPEOF.STRING &&
      explicitGroupId.length > NUM.ZERO) {
      return explicitGroupId;
    }
    const serviceId = serviceRow?.[COLUMN.SERVICE_ID];
    if (typeof serviceId !== TYPEOF.STRING || serviceId.length === NUM.ZERO) {
      return null;
    }
    const replicaSuffixIndex = serviceId.lastIndexOf(
      MESSAGE_GROUP_REPLICA_SUFFIX,
    );
    if (replicaSuffixIndex <= NUM.ZERO) {
      return null;
    }
    return serviceId.slice(NUM.ZERO, replicaSuffixIndex);
  }

  /**
   * Build safe propagation targets from active message-group leaders.
   * @param {string|null} sourceGroupId
   * @return {Array<Object>}
   * @private
   */
  buildSafeTargets(sourceGroupId) {
    const services = this.resolveActiveMessageGroupServices();
    const servicesByGroupId = new Map();
    for (const serviceRow of services) {
      const groupId = this.resolveMessageGroupId(serviceRow);
      if (!groupId) {
        continue;
      }
      if (!servicesByGroupId.has(groupId)) {
        servicesByGroupId.set(groupId, []);
      }
      servicesByGroupId.get(groupId).push(serviceRow);
    }

    const orderedGroupIds = [...servicesByGroupId.keys()]
      .sort((left, right) => left.localeCompare(right));
    const targets = [];
    for (const groupId of orderedGroupIds) {
      if (sourceGroupId && groupId === sourceGroupId) {
        continue;
      }
      const selectedService =
        this.sortCoordinatorCandidates(servicesByGroupId.get(groupId))[NUM.ZERO];
      if (!selectedService) {
        continue;
      }
      targets.push({
        groupId,
        coordinatorNodeId: selectedService[COLUMN.NODE_ID] || null,
        address: selectedService[COLUMN.ADDRESS],
      });
    }
    return targets;
  }

  /**
   * Deliver CDC payload to target coordinators.
   * @param {Object} options
   * @return {Promise<Array<Object>>}
   * @private
   */
  async deliverToTargets(options) {
    const deliveryFailures = [];
    for (const target of options.targets) {
      if (!this.messageRouter ||
        typeof this.messageRouter.deliver !== TYPEOF.FUNCTION) {
        deliveryFailures.push({
          targetGroupId: target.groupId,
          coordinatorNodeId: target.coordinatorNodeId,
          address: target.address,
          error: CDC_GROUP_PROPAGATION_REASON.MESSAGE_ROUTER_UNAVAILABLE,
        });
        continue;
      }

      const payload = {
        type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION,
        tableName: options.tableName,
        operation: options.operation,
        data: options.data,
        sourceNodeId: this.nodeId,
        sourceGroupId: options.sourceGroupId,
        targetGroupId: target.groupId,
      };
      let result = null;
      try {
        result = await this.messageRouter.deliver(
          target.address,
          payload,
          {targetNodeId: target.coordinatorNodeId},
        );
      } catch (error) {
        deliveryFailures.push({
          targetGroupId: target.groupId,
          coordinatorNodeId: target.coordinatorNodeId,
          address: target.address,
          error: String(error?.message || error || DELIVERY_ERROR_UNKNOWN),
        });
        continue;
      }
      if (!result?.acknowledged) {
        deliveryFailures.push({
          targetGroupId: target.groupId,
          coordinatorNodeId: target.coordinatorNodeId,
          address: target.address,
          error: result?.error || null,
        });
      }
    }
    return deliveryFailures;
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
      deliveryRetryMaxAttempts: this.deliveryRetryMaxAttempts,
      deliveryRetryDelayMs: this.deliveryRetryDelayMs,
      deliveryRetryBackoffMultiplier: this.deliveryRetryBackoffMultiplier,
      deliveryRetryMaxDelayMs: this.deliveryRetryMaxDelayMs,
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

  /**
   * Resolve positive integer option with fallback.
   * @param {*} value
   * @param {number} fallback
   * @return {number}
   * @private
   */
  resolvePositiveInteger(value, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    const normalized = Math.floor(value);
    if (normalized < NUM.ONE) {
      return fallback;
    }
    return normalized;
  }

  /**
   * Resolve positive numeric option with fallback.
   * @param {*} value
   * @param {number} fallback
   * @return {number}
   * @private
   */
  resolvePositiveNumber(value, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (value <= NUM.ZERO) {
      return fallback;
    }
    return value;
  }
}

export {CDCGroupPropagationService};
