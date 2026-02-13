/**
 * LatencyGroupManager - single owner for latency-group assignment lifecycle.
 */

import {EventEmitter} from 'events';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {COLUMN, NUM, TABLES, TYPEOF} from '../constants/index.js';
import {
  LATENCY_ASSIGNMENT_STATE,
  LATENCY_GROUP_STATE,
  LATENCY_TOPOLOGY_CONFIG_KEY,
  LATENCY_TOPOLOGY_DEFAULT,
} from './latency-topology-constants.js';
import {
  LATENCY_GROUP_MANAGER_DEFAULT,
  LATENCY_GROUP_MANAGER_ERROR_MSG,
  LATENCY_GROUP_MANAGER_EVENT,
  LATENCY_GROUP_MANAGER_LOG_MSG,
  LATENCY_GROUP_MANAGER_REASON,
  LATENCY_GROUP_MANAGER_STATE,
  LATENCY_GROUP_MANAGER_SUBSYSTEM,
  LATENCY_GROUP_MANAGER_TRIGGER,
} from './latency-group-manager-constants.js';

class LatencyGroupManager extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.systemTableCache
   * @param {Object} options.cdcIntegrationService
   * @param {Object} options.latencyMeasurementService
   * @param {Object} options.groupSelectionService
   * @param {Function} options.nowFn
   * @param {Function} options.randomFn
   * @param {Function} options.setTimeoutFn
   * @param {Function} options.clearTimeoutFn
   */
  constructor(options = {}) {
    super();
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.latencyMeasurementService = options.latencyMeasurementService || null;
    this.groupSelectionService = options.groupSelectionService || null;
    this.nowFn = options.nowFn || Date.now;
    this.randomFn = options.randomFn || Math.random;
    this.setTimeoutFn = options.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn || clearTimeout;

    this.config = ConfigurationManager.getInstance();
    this.refreshConfig();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(LATENCY_GROUP_MANAGER_SUBSYSTEM) :
      console;

    this.state = LATENCY_GROUP_MANAGER_STATE.CREATED;
    this.recalcTimer = null;
    this.cycleInFlight = false;
    this.stats = {
      cycleCount: NUM.ZERO,
      assignmentChangedCount: NUM.ZERO,
      assignmentUnchangedCount: NUM.ZERO,
      groupCreatedCount: NUM.ZERO,
      cycleFailureCount: NUM.ZERO,
      lastCycleAt: null,
      lastReason: null,
      lastTargetGroupId: null,
    };
  }

  /**
   * Initialize dependencies and validate required owners.
   * @param {Object} options
   */
  initialize(options = {}) {
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }
    if (options.latencyMeasurementService) {
      this.latencyMeasurementService = options.latencyMeasurementService;
    }
    if (options.groupSelectionService) {
      this.groupSelectionService = options.groupSelectionService;
    }
    if (options.nowFn) {
      this.nowFn = options.nowFn;
    }
    if (options.randomFn) {
      this.randomFn = options.randomFn;
    }
    if (options.setTimeoutFn) {
      this.setTimeoutFn = options.setTimeoutFn;
    }
    if (options.clearTimeoutFn) {
      this.clearTimeoutFn = options.clearTimeoutFn;
    }

    this.nodeId = assertCritical(
      this.nodeId,
      LATENCY_GROUP_MANAGER_ERROR_MSG.MISSING_NODE_ID,
    );
    this.systemTableCache = assertCritical(
      this.systemTableCache,
      LATENCY_GROUP_MANAGER_ERROR_MSG.MISSING_CACHE,
    );
    this.cdcIntegrationService = assertCritical(
      this.cdcIntegrationService,
      LATENCY_GROUP_MANAGER_ERROR_MSG.MISSING_CDC,
    );
    this.latencyMeasurementService = assertCritical(
      this.latencyMeasurementService,
      LATENCY_GROUP_MANAGER_ERROR_MSG.MISSING_MEASUREMENT_SERVICE,
    );
    this.groupSelectionService = assertCritical(
      this.groupSelectionService,
      LATENCY_GROUP_MANAGER_ERROR_MSG.MISSING_SELECTION_SERVICE,
    );
    this.refreshConfig();

    this.state = LATENCY_GROUP_MANAGER_STATE.INITIALIZED;
    this.logger.info(LATENCY_GROUP_MANAGER_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      groupThresholdMs: this.groupThresholdMs,
      recalcIntervalMs: this.recalcIntervalMs,
      recalcJitterRatio: this.recalcJitterRatio,
    });
  }

  /**
   * Start periodic assignment recalculation.
   * @param {Object} options
   * @param {boolean} options.runImmediately
   */
  start(options = {}) {
    this.ensureInitialized();
    if (this.state === LATENCY_GROUP_MANAGER_STATE.RUNNING) {
      return;
    }

    this.state = LATENCY_GROUP_MANAGER_STATE.RUNNING;
    this.logger.info(LATENCY_GROUP_MANAGER_LOG_MSG.STARTED, {
      nodeId: this.nodeId,
    });

    const runImmediately = options.runImmediately !== false;
    if (runImmediately) {
      void this.executeScheduledCycle(LATENCY_GROUP_MANAGER_TRIGGER.INITIAL);
      return;
    }

    this.scheduleNextCycle();
  }

  /**
   * Stop periodic assignment recalculation.
   */
  stop() {
    this.clearScheduledCycle();
    this.state = LATENCY_GROUP_MANAGER_STATE.STOPPED;
    this.logger.info(LATENCY_GROUP_MANAGER_LOG_MSG.STOPPED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Execute one assignment/reassignment cycle.
   * @param {Object} options
   * @param {string} options.trigger
   * @return {Promise<Object>}
   */
  async runAssignmentCycle(options = {}) {
    this.ensureInitialized();
    const trigger = options.trigger || LATENCY_GROUP_MANAGER_TRIGGER.MANUAL;
    this.stats.cycleCount += NUM.ONE;
    this.stats.lastCycleAt = this.now();

    if (this.cycleInFlight) {
      return {
        success: false,
        skipped: true,
        reason: LATENCY_GROUP_MANAGER_REASON.CYCLE_IN_FLIGHT,
        trigger,
      };
    }

    this.cycleInFlight = true;
    try {
      const localNodeRow = this.systemTableCache.get(TABLES.NODES, this.nodeId);
      if (!localNodeRow) {
        const result = {
          success: false,
          changed: false,
          reason: LATENCY_GROUP_MANAGER_REASON.MISSING_LOCAL_NODE,
          previousGroupId: null,
          targetGroupId: null,
          createdGroup: false,
          trigger,
        };
        this.emit(LATENCY_GROUP_MANAGER_EVENT.ASSIGNMENT_UNCHANGED, result);
        return result;
      }

      const allNodeRows = this.systemTableCache.getAll(TABLES.NODES);
      const allGroupRows = this.systemTableCache.getAll(TABLES.LATENCY_GROUPS);
      const decision = await this.computeAssignmentDecision(localNodeRow, allGroupRows);
      const assignment = await this.persistAssignmentDecision({
        decision,
        localNodeRow,
        allNodeRows,
        allGroupRows,
      });

      const eventName = assignment.changed ?
        LATENCY_GROUP_MANAGER_EVENT.ASSIGNMENT_CHANGED :
        LATENCY_GROUP_MANAGER_EVENT.ASSIGNMENT_UNCHANGED;
      const result = {
        success: true,
        trigger,
        ...assignment,
      };
      this.stats.lastReason = result.reason;
      this.stats.lastTargetGroupId = result.targetGroupId;
      if (result.changed) {
        this.stats.assignmentChangedCount += NUM.ONE;
      } else {
        this.stats.assignmentUnchangedCount += NUM.ONE;
      }

      this.emit(eventName, result);
      const logMessage = assignment.changed ?
        LATENCY_GROUP_MANAGER_LOG_MSG.ASSIGNMENT_CHANGED :
        LATENCY_GROUP_MANAGER_LOG_MSG.ASSIGNMENT_UNCHANGED;
      this.logger.info(logMessage, {
        nodeId: this.nodeId,
        trigger,
        reason: assignment.reason,
        previousGroupId: assignment.previousGroupId,
        targetGroupId: assignment.targetGroupId,
      });

      return result;
    } finally {
      this.cycleInFlight = false;
    }
  }

  /**
   * Execute one scheduled cycle and queue the next one when still running.
   * @param {string} trigger
   * @return {Promise<void>}
   * @private
   */
  async executeScheduledCycle(trigger) {
    if (this.state !== LATENCY_GROUP_MANAGER_STATE.RUNNING) {
      return;
    }

    try {
      await this.runAssignmentCycle({trigger});
    } catch (error) {
      this.stats.cycleFailureCount += NUM.ONE;
      this.logger.error(LATENCY_GROUP_MANAGER_LOG_MSG.CYCLE_FAILED, {
        nodeId: this.nodeId,
        trigger,
        error: error.message,
      });
      this.emit(LATENCY_GROUP_MANAGER_EVENT.CYCLE_FAILED, {
        nodeId: this.nodeId,
        trigger,
        error: error.message,
      });
    } finally {
      if (this.state === LATENCY_GROUP_MANAGER_STATE.RUNNING) {
        this.scheduleNextCycle();
      }
    }
  }

  /**
   * Determine the assignment target for the local node.
   * @param {Object} localNodeRow
   * @param {Object[]} groupRows
   * @return {Promise<Object>}
   * @private
   */
  async computeAssignmentDecision(localNodeRow, groupRows) {
    const currentGroupId = localNodeRow[COLUMN.LATENCY_GROUP_ID] || null;
    const activeGroups = this.getActiveGroups(groupRows);
    const measurements = await this.measureGroups(activeGroups);
    const nearestEligible = this.selectNearestEligibleGroup(measurements);
    const currentGroupMeasurement = this.getMeasurementForGroup(
      measurements,
      currentGroupId,
    );

    if (!currentGroupId) {
      if (nearestEligible) {
        return {
          reason: LATENCY_GROUP_MANAGER_REASON.JOIN_NEAREST_GROUP,
          currentGroupId: null,
          targetGroupId: nearestEligible.groupId,
          changed: true,
          createdGroupRow: null,
          measurements,
        };
      }

      const now = this.now();
      const groupId = this.buildGroupId(now);
      const createdGroupRow = {
        [COLUMN.GROUP_ID]: groupId,
        [COLUMN.REPRESENTATIVE_NODE_ID]: this.nodeId,
        [COLUMN.COORDINATOR_NODE_ID]: this.nodeId,
        [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE,
        [COLUMN.CREATED_AT]: now,
        [COLUMN.UPDATED_AT]: now,
      };
      return {
        reason: LATENCY_GROUP_MANAGER_REASON.CREATE_NEW_GROUP,
        currentGroupId: null,
        targetGroupId: groupId,
        changed: true,
        createdGroupRow,
        measurements,
      };
    }

    if (!nearestEligible) {
      return {
        reason: LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP,
        currentGroupId,
        targetGroupId: currentGroupId,
        changed: false,
        createdGroupRow: null,
        measurements,
      };
    }

    if (nearestEligible.groupId === currentGroupId) {
      return {
        reason: LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP,
        currentGroupId,
        targetGroupId: currentGroupId,
        changed: false,
        createdGroupRow: null,
        measurements,
      };
    }

    const currentRttMs = Number(currentGroupMeasurement?.rttMs);
    if (!Number.isFinite(currentRttMs) || nearestEligible.rttMs < currentRttMs) {
      return {
        reason: LATENCY_GROUP_MANAGER_REASON.REASSIGN_TO_BETTER_GROUP,
        currentGroupId,
        targetGroupId: nearestEligible.groupId,
        changed: true,
        createdGroupRow: null,
        measurements,
      };
    }

    return {
      reason: LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP,
      currentGroupId,
      targetGroupId: currentGroupId,
      changed: false,
      createdGroupRow: null,
      measurements,
    };
  }

  /**
   * Persist assignment and reconcile affected groups.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async persistAssignmentDecision(options) {
    const decision = options.decision;
    const allNodeRows = options.allNodeRows;
    const allGroupRows = options.allGroupRows;
    const previousGroupId = decision.currentGroupId || null;
    const targetGroupId = decision.targetGroupId || null;
    const now = this.now();

    if (decision.createdGroupRow) {
      await this.cdcIntegrationService.upsertSystemTableRow(
        TABLES.LATENCY_GROUPS,
        decision.createdGroupRow,
      );
      this.logger.info(LATENCY_GROUP_MANAGER_LOG_MSG.GROUP_CREATED, {
        nodeId: this.nodeId,
        groupId: decision.createdGroupRow[COLUMN.GROUP_ID],
      });
      this.stats.groupCreatedCount += NUM.ONE;
      this.emit(LATENCY_GROUP_MANAGER_EVENT.GROUP_CREATED, {
        nodeId: this.nodeId,
        groupId: decision.createdGroupRow[COLUMN.GROUP_ID],
      });
    }

    const isReassignment = previousGroupId &&
      targetGroupId &&
      previousGroupId !== targetGroupId;
    if (isReassignment) {
      await this.persistNodeAssignment({
        groupId: previousGroupId,
        assignmentState: LATENCY_ASSIGNMENT_STATE.REASSIGNING,
        timestamp: now,
      });
    }

    await this.persistNodeAssignment({
      groupId: targetGroupId,
      assignmentState: targetGroupId ?
        LATENCY_ASSIGNMENT_STATE.ASSIGNED :
        LATENCY_ASSIGNMENT_STATE.UNASSIGNED,
      timestamp: now,
    });

    const affectedGroupIds = this.collectAffectedGroupIds(
      previousGroupId,
      targetGroupId,
    );
    await this.reconcileAffectedGroups({
      affectedGroupIds,
      allNodeRows,
      allGroupRows,
      targetGroupId,
      createdGroupRow: decision.createdGroupRow,
      timestamp: now,
    });

    return {
      changed: decision.changed,
      reason: decision.reason,
      previousGroupId,
      targetGroupId,
      createdGroup: Boolean(decision.createdGroupRow),
      measurements: decision.measurements,
    };
  }

  /**
   * Persist local node latency assignment metadata.
   * @param {Object} options
   * @return {Promise<void>}
   * @private
   */
  async persistNodeAssignment(options) {
    const updateRow = {
      [COLUMN.LATENCY_GROUP_ID]: options.groupId,
      [COLUMN.LATENCY_ASSIGNMENT_STATE]: options.assignmentState,
      [COLUMN.LAST_LATENCY_CHECK_AT]: options.timestamp,
    };
    await this.cdcIntegrationService.updateSystemTableRow(
      TABLES.NODES,
      {[COLUMN.NODE_ID]: this.nodeId},
      updateRow,
    );
  }

  /**
   * Reconcile lifecycle state + leadership for affected groups.
   * @param {Object} options
   * @return {Promise<void>}
   * @private
   */
  async reconcileAffectedGroups(options) {
    const groupById = this.buildGroupMap(options.allGroupRows);
    if (options.createdGroupRow) {
      groupById.set(options.createdGroupRow[COLUMN.GROUP_ID], options.createdGroupRow);
    }
    const nodeRowsAfterAssignment = this.buildNodeRowsAfterAssignment(
      options.allNodeRows,
      options.targetGroupId,
    );

    for (const groupId of options.affectedGroupIds) {
      const groupRow = groupById.get(groupId) || null;
      const memberRows = nodeRowsAfterAssignment.filter((nodeRow) => {
        return nodeRow?.[COLUMN.LATENCY_GROUP_ID] === groupId;
      });
      if (!groupRow && memberRows.length === NUM.ZERO) {
        continue;
      }

      const desiredState = memberRows.length > NUM.ZERO ?
        LATENCY_GROUP_STATE.ACTIVE :
        LATENCY_GROUP_STATE.DRAINING;
      const normalizedGroupRow = this.buildNormalizedGroupRow({
        groupId,
        groupRow,
        desiredState,
        timestamp: options.timestamp,
      });

      if (this.shouldPersistLifecycleState(groupRow, normalizedGroupRow)) {
        await this.cdcIntegrationService.upsertSystemTableRow(
          TABLES.LATENCY_GROUPS,
          normalizedGroupRow,
        );
      }

      await this.groupSelectionService.applyGroupLeadership({
        groupRow: normalizedGroupRow,
        memberRows,
      });
    }
  }

  /**
   * Build a normalized group row for lifecycle + leadership reconciliation.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildNormalizedGroupRow(options) {
    const groupRow = options.groupRow;
    return {
      [COLUMN.GROUP_ID]: options.groupId,
      [COLUMN.REPRESENTATIVE_NODE_ID]:
        groupRow?.[COLUMN.REPRESENTATIVE_NODE_ID] || null,
      [COLUMN.COORDINATOR_NODE_ID]:
        groupRow?.[COLUMN.COORDINATOR_NODE_ID] || null,
      [COLUMN.STATE]: options.desiredState,
      [COLUMN.CREATED_AT]: groupRow?.[COLUMN.CREATED_AT] || options.timestamp,
      [COLUMN.UPDATED_AT]: options.timestamp,
    };
  }

  /**
   * Determine whether lifecycle row persistence is needed.
   * @param {Object|null} currentGroupRow
   * @param {Object} nextGroupRow
   * @return {boolean}
   * @private
   */
  shouldPersistLifecycleState(currentGroupRow, nextGroupRow) {
    if (!currentGroupRow) {
      return true;
    }
    return currentGroupRow[COLUMN.STATE] !== nextGroupRow[COLUMN.STATE];
  }

  /**
   * Build a group-id keyed map from cached rows.
   * @param {Object[]} allGroupRows
   * @return {Map<string, Object>}
   * @private
   */
  buildGroupMap(allGroupRows) {
    const map = new Map();
    for (const groupRow of allGroupRows) {
      const groupId = groupRow?.[COLUMN.GROUP_ID];
      if (!groupId) {
        continue;
      }
      map.set(groupId, groupRow);
    }
    return map;
  }

  /**
   * Build nodes view with local node assignment updated to the target group.
   * @param {Object[]} allNodeRows
   * @param {string|null} targetGroupId
   * @return {Object[]}
   * @private
   */
  buildNodeRowsAfterAssignment(allNodeRows, targetGroupId) {
    return allNodeRows.map((nodeRow) => {
      if (nodeRow?.[COLUMN.NODE_ID] !== this.nodeId) {
        return nodeRow;
      }
      return {
        ...nodeRow,
        [COLUMN.LATENCY_GROUP_ID]: targetGroupId,
      };
    });
  }

  /**
   * Collect unique non-null affected group IDs.
   * @param {string|null} previousGroupId
   * @param {string|null} targetGroupId
   * @return {string[]}
   * @private
   */
  collectAffectedGroupIds(previousGroupId, targetGroupId) {
    const groupIds = new Set();
    if (previousGroupId) {
      groupIds.add(previousGroupId);
    }
    if (targetGroupId) {
      groupIds.add(targetGroupId);
    }
    return [...groupIds];
  }

  /**
   * Measure latency to active group representatives.
   * @param {Object[]} groups
   * @return {Promise<Object[]>}
   * @private
   */
  async measureGroups(groups) {
    const measurements = [];
    for (const groupRow of groups) {
      const groupId = groupRow?.[COLUMN.GROUP_ID];
      const representativeNodeId = groupRow?.[COLUMN.REPRESENTATIVE_NODE_ID];
      if (!groupId || !representativeNodeId) {
        continue;
      }

      const measurement = await this.latencyMeasurementService.measureNodeLatency(
        representativeNodeId,
      );
      if (!measurement || !Number.isFinite(measurement.rttMs)) {
        continue;
      }

      measurements.push({
        groupId,
        representativeNodeId,
        rttMs: measurement.rttMs,
      });
    }

    return measurements.sort((left, right) => {
      if (left.rttMs !== right.rttMs) {
        return left.rttMs - right.rttMs;
      }
      if (left.groupId < right.groupId) {
        return NUM.NEGATIVE_ONE;
      }
      if (left.groupId > right.groupId) {
        return NUM.ONE;
      }
      return NUM.ZERO;
    });
  }

  /**
   * Select nearest eligible group under configured threshold.
   * @param {Object[]} measurements
   * @return {Object|null}
   * @private
   */
  selectNearestEligibleGroup(measurements) {
    const eligible = measurements.filter((measurement) => {
      return measurement.rttMs <= this.groupThresholdMs;
    });
    return eligible[NUM.ZERO] || null;
  }

  /**
   * Find measurement entry for a group.
   * @param {Object[]} measurements
   * @param {string|null} groupId
   * @return {Object|null}
   * @private
   */
  getMeasurementForGroup(measurements, groupId) {
    if (!groupId) {
      return null;
    }
    return measurements.find((measurement) => measurement.groupId === groupId) || null;
  }

  /**
   * Keep only groups currently considered active.
   * @param {Object[]} groupRows
   * @return {Object[]}
   * @private
   */
  getActiveGroups(groupRows) {
    return groupRows.filter((groupRow) => {
      const state = groupRow?.[COLUMN.STATE];
      return !state || state === LATENCY_GROUP_STATE.ACTIVE;
    });
  }

  /**
   * Schedule next periodic reassignment cycle.
   * @private
   */
  scheduleNextCycle() {
    this.clearScheduledCycle();
    const delayMs = this.computeNextDelayMs();
    this.recalcTimer = this.setTimeoutFn(() => {
      void this.executeScheduledCycle(LATENCY_GROUP_MANAGER_TRIGGER.PERIODIC);
    }, delayMs);
    if (typeof this.recalcTimer?.unref === TYPEOF.FUNCTION) {
      this.recalcTimer.unref();
    }
  }

  /**
   * Clear pending periodic cycle timer.
   * @private
   */
  clearScheduledCycle() {
    if (this.recalcTimer) {
      this.clearTimeoutFn(this.recalcTimer);
      this.recalcTimer = null;
    }
  }

  /**
   * Compute next periodic cycle delay with bounded jitter.
   * @return {number}
   * @private
   */
  computeNextDelayMs() {
    const jitterRange = this.recalcIntervalMs * this.recalcJitterRatio;
    if (jitterRange <= NUM.ZERO) {
      return this.recalcIntervalMs;
    }

    const rawRandom = this.randomFn();
    const randomValue = Number.isFinite(rawRandom) ?
      rawRandom :
      LATENCY_GROUP_MANAGER_DEFAULT.RANDOM_CENTER;
    const centeredRandom =
      (randomValue - LATENCY_GROUP_MANAGER_DEFAULT.RANDOM_CENTER) * NUM.TWO;
    const jitterOffset = Math.round(centeredRandom * jitterRange);
    return Math.max(
      LATENCY_GROUP_MANAGER_DEFAULT.MIN_DELAY_MS,
      this.recalcIntervalMs + jitterOffset,
    );
  }

  /**
   * Build deterministic group ID when no eligible group exists.
   * @param {number} timestamp
   * @return {string}
   * @private
   */
  buildGroupId(timestamp) {
    const baseTimestamp = Number.isFinite(timestamp) ?
      Math.floor(timestamp) :
      this.now();
    let attempt = NUM.ZERO;

    while (true) {
      const retrySuffix = attempt === NUM.ZERO ?
        '' :
        `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_SEPARATOR}` +
          `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_RETRY_MARKER}` +
          `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_SEPARATOR}` +
          `${attempt}`;
      const groupId = `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_PREFIX}` +
        `${this.nodeId}` +
        `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_SEPARATOR}` +
        `${baseTimestamp}${retrySuffix}`;
      if (!this.hasGroup(groupId)) {
        return groupId;
      }
      attempt += NUM.ONE;
    }
  }

  /**
   * Check whether a group already exists in cache.
   * @param {string} groupId
   * @return {boolean}
   * @private
   */
  hasGroup(groupId) {
    const hasFn = this.systemTableCache?.has;
    if (typeof hasFn !== TYPEOF.FUNCTION) {
      return false;
    }
    return hasFn.call(this.systemTableCache, TABLES.LATENCY_GROUPS, groupId);
  }

  /**
   * Refresh runtime config values from ConfigurationManager.
   */
  refreshConfig() {
    this.groupThresholdMs = this.resolveNumericConfig(
      LATENCY_TOPOLOGY_CONFIG_KEY.GROUP_THRESHOLD_MS,
      LATENCY_TOPOLOGY_DEFAULT.GROUP_THRESHOLD_MS,
      LATENCY_GROUP_MANAGER_DEFAULT.MIN_GROUP_THRESHOLD_MS,
    );
    this.recalcIntervalMs = this.resolveNumericConfig(
      LATENCY_TOPOLOGY_CONFIG_KEY.RECALC_INTERVAL_MS,
      LATENCY_TOPOLOGY_DEFAULT.RECALC_INTERVAL_MS,
      LATENCY_GROUP_MANAGER_DEFAULT.MIN_RECALC_INTERVAL_MS,
    );
    this.recalcJitterRatio = this.resolveRatioConfig(
      LATENCY_TOPOLOGY_CONFIG_KEY.RECALC_JITTER_RATIO,
      LATENCY_TOPOLOGY_DEFAULT.RECALC_JITTER_RATIO,
    );
  }

  /**
   * Resolve numeric config with fallback and lower bound.
   * @param {string} key
   * @param {number} fallback
   * @param {number} minValue
   * @return {number}
   * @private
   */
  resolveNumericConfig(key, fallback, minValue) {
    const value = this.config.get(key);
    if (typeof value !== TYPEOF.NUMBER || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(minValue, value);
  }

  /**
   * Resolve ratio config with fallback and hard bounds.
   * @param {string} key
   * @param {number} fallback
   * @return {number}
   * @private
   */
  resolveRatioConfig(key, fallback) {
    const value = this.config.get(key);
    if (typeof value !== TYPEOF.NUMBER || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(
      LATENCY_GROUP_MANAGER_DEFAULT.MAX_RECALC_JITTER_RATIO,
      Math.max(LATENCY_GROUP_MANAGER_DEFAULT.MIN_RECALC_JITTER_RATIO, value),
    );
  }

  /**
   * Ensure lifecycle initialization has happened.
   * @private
   */
  ensureInitialized() {
    assertCritical(
      this.state !== LATENCY_GROUP_MANAGER_STATE.CREATED,
      LATENCY_GROUP_MANAGER_ERROR_MSG.NOT_INITIALIZED,
    );
  }

  /**
   * Current wall clock timestamp.
   * @return {number}
   * @private
   */
  now() {
    return this.nowFn();
  }

  /**
   * Get diagnostics counters.
   * @return {Object}
   */
  getStats() {
    return {
      ...this.stats,
      nodeId: this.nodeId,
      state: this.state,
    };
  }
}

export {LatencyGroupManager};
