/**
 * LatencyGroupManager - single owner for latency-group assignment lifecycle.
 */

import {EventEmitter} from 'events';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {COLUMN, TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  LATENCY_ASSIGNMENT_STATE,
  LATENCY_GROUP_STATE,
} from './latency-topology-constants.js';
import {
  LATENCY_GROUP_MANAGER_ERROR_MSG,
  LATENCY_GROUP_MANAGER_EVENT,
  LATENCY_GROUP_MANAGER_LOG_MSG,
  LATENCY_GROUP_MANAGER_REASON,
  LATENCY_GROUP_MANAGER_STATE,
  LATENCY_GROUP_MANAGER_SUBSYSTEM,
  LATENCY_GROUP_MANAGER_TRIGGER,
} from './latency-group-manager-constants.js';
import {
  buildLatencyGroupMap,
  buildNodeRowsAfterAssignment,
  buildNormalizedGroupRow,
  collectAffectedGroupIds,
  getActiveLatencyGroups,
  getMeasurementForGroup,
  selectNearestEligibleGroup,
  shouldPersistLifecycleState,
} from './latency-group-manager-assignment-helpers.js';
import {
  buildLatencyGroupId,
  computeNextLatencyGroupCycleDelayMs,
  resolveLatencyGroupManagerConfig,
} from './latency-group-manager-runtime-helpers.js';

const LOCAL_STR_CRITICAL = 'critical';

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
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
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
    this.activeCyclePromises = new Set();
    this.stats = {
      cycleCount: 0,
      assignmentChangedCount: 0,
      assignmentUnchangedCount: 0,
      groupCreatedCount: 0,
      cycleFailureCount: 0,
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
    if (options.controlPlaneSystemTableGateway) {
      this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
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
  async stop() {
    this.clearScheduledCycle();
    this.state = LATENCY_GROUP_MANAGER_STATE.STOPPED;
    this.logger.info(LATENCY_GROUP_MANAGER_LOG_MSG.STOPPED, {
      nodeId: this.nodeId,
    });
    if (this.activeCyclePromises.size > 0) {
      await Promise.allSettled([...this.activeCyclePromises]);
    }
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
    this.stats.cycleCount += 1;
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
        this.stats.assignmentChangedCount += 1;
      } else {
        this.stats.assignmentUnchangedCount += 1;
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

    const cyclePromise = (async () => {
      try {
        await this.runAssignmentCycle({trigger});
      } catch (error) {
        this.stats.cycleFailureCount += 1;
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
    })();
    this.activeCyclePromises.add(cyclePromise);
    try {
      await cyclePromise;
    } finally {
      this.activeCyclePromises.delete(cyclePromise);
    }
  }

  /**
   * Build a new latency group row for this node.
   * @param {string} [pinnedGroupId] - Operator-pinned group id; when
   *   absent a measured-assignment group id is generated.
   * @return {Object}
   * @private
   */
  buildCreatedGroupRow(pinnedGroupId) {
    const now = this.now();
    const groupId = pinnedGroupId || buildLatencyGroupId({
      timestamp: now,
      nodeId: this.nodeId,
      nowFn: this.nowFn,
      systemTableCache: this.systemTableCache,
    });
    return {
      [COLUMN.GROUP_ID]: groupId,
      [COLUMN.REPRESENTATIVE_NODE_ID]: this.nodeId,
      [COLUMN.COORDINATOR_NODE_ID]: this.nodeId,
      [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE,
      [COLUMN.CREATED_AT]: now,
      [COLUMN.UPDATED_AT]: now,
    };
  }

  /**
   * Assignment decision when the operator has pinned this node's
   * latency group (zone label): the pin wins unconditionally — RTT is
   * never measured, and the group row is created on first use. The
   * manager stays the single owner of nodes.latency_group_id; it
   * honors the pin instead of being bypassed.
   * @param {string|null} currentGroupId
   * @param {Object[]} groupRows
   * @return {Object}
   * @private
   */
  computePinnedAssignmentDecision(currentGroupId, groupRows) {
    const pinnedGroupId = this.pinnedGroupId;
    if (currentGroupId === pinnedGroupId) {
      return {
        reason: LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP,
        currentGroupId,
        targetGroupId: pinnedGroupId,
        changed: false,
        createdGroupRow: null,
        measurements: [],
      };
    }
    const pinnedGroupExists = getActiveLatencyGroups(groupRows).some(
      (group) => group[COLUMN.GROUP_ID] === pinnedGroupId,
    );
    return {
      reason: pinnedGroupExists ?
        LATENCY_GROUP_MANAGER_REASON.JOIN_NEAREST_GROUP :
        LATENCY_GROUP_MANAGER_REASON.CREATE_NEW_GROUP,
      currentGroupId,
      targetGroupId: pinnedGroupId,
      changed: true,
      createdGroupRow: pinnedGroupExists ?
        null :
        this.buildCreatedGroupRow(pinnedGroupId),
      measurements: [],
    };
  }

  /**
   * Resolve the assignment reason for the current measurement snapshot.
   * @param {Object} options
   * @return {string}
   * @private
   */
  resolveAssignmentReason(options) {
    const currentGroupId = options.currentGroupId;
    const nearestEligible = options.nearestEligible;
    if (!currentGroupId && nearestEligible) {
      return LATENCY_GROUP_MANAGER_REASON.JOIN_NEAREST_GROUP;
    }
    if (options.shouldCreateNewGroup) {
      return LATENCY_GROUP_MANAGER_REASON.CREATE_NEW_GROUP;
    }
    if (!nearestEligible || nearestEligible.groupId === currentGroupId) {
      return LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP;
    }

    const currentRttMs = Number(options.currentGroupMeasurement?.rttMs);
    return !Number.isFinite(currentRttMs) || nearestEligible.rttMs < currentRttMs ?
      LATENCY_GROUP_MANAGER_REASON.REASSIGN_TO_BETTER_GROUP :
      LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP;
  }

  /**
   * Resolve the target latency group from a reason.
   * @param {Object} options
   * @return {string|null}
   * @private
   */
  resolveAssignmentTargetGroupId(options) {
    const reason = options.reason;
    if (reason === LATENCY_GROUP_MANAGER_REASON.JOIN_NEAREST_GROUP ||
        reason === LATENCY_GROUP_MANAGER_REASON.REASSIGN_TO_BETTER_GROUP) {
      return options.nearestEligible.groupId;
    }
    if (reason === LATENCY_GROUP_MANAGER_REASON.CREATE_NEW_GROUP) {
      return options.createdGroupRow[COLUMN.GROUP_ID];
    }
    return options.currentGroupId;
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
    if (this.pinnedGroupId) {
      return this.computePinnedAssignmentDecision(currentGroupId, groupRows);
    }
    const activeGroups = getActiveLatencyGroups(groupRows);
    const measurements = await this.measureGroups(activeGroups);
    const nearestEligible = selectNearestEligibleGroup(
      measurements,
      this.groupThresholdMs,
    );
    const currentGroupMeasurement = getMeasurementForGroup(
      measurements,
      currentGroupId,
    );
    const shouldCreateNewGroup = !currentGroupId && !nearestEligible;
    const createdGroupRow = shouldCreateNewGroup ? this.buildCreatedGroupRow() : null;
    const reason = this.resolveAssignmentReason({
      currentGroupId,
      nearestEligible,
      currentGroupMeasurement,
      shouldCreateNewGroup,
    });
    const targetGroupId = this.resolveAssignmentTargetGroupId({
      currentGroupId,
      createdGroupRow,
      nearestEligible,
      reason,
    });

    return {
      reason,
      currentGroupId,
      targetGroupId,
      changed: reason !== LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP,
      createdGroupRow,
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
      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName: TABLES.LATENCY_GROUPS,
        row: decision.createdGroupRow,
      }, {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: LOCAL_STR_CRITICAL,
      });
      this.logger.info(LATENCY_GROUP_MANAGER_LOG_MSG.GROUP_CREATED, {
        nodeId: this.nodeId,
        groupId: decision.createdGroupRow[COLUMN.GROUP_ID],
      });
      this.stats.groupCreatedCount += 1;
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

    const affectedGroupIds = collectAffectedGroupIds(
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
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.NODES,
      whereClause: {[COLUMN.NODE_ID]: this.nodeId},
      data: updateRow,
    }, {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: LOCAL_STR_CRITICAL,
    });
  }

  /**
   * Reconcile lifecycle state + leadership for affected groups.
   * @param {Object} options
   * @return {Promise<void>}
   * @private
   */
  async reconcileAffectedGroups(options) {
    const groupById = buildLatencyGroupMap(options.allGroupRows);
    if (options.createdGroupRow) {
      groupById.set(options.createdGroupRow[COLUMN.GROUP_ID], options.createdGroupRow);
    }
    const nodeRowsAfterAssignment = buildNodeRowsAfterAssignment({
      allNodeRows: options.allNodeRows,
      nodeId: this.nodeId,
      targetGroupId: options.targetGroupId,
    });

    for (const groupId of options.affectedGroupIds) {
      const groupRow = groupById.get(groupId) || null;
      const memberRows = nodeRowsAfterAssignment.filter((nodeRow) => {
        return nodeRow?.[COLUMN.LATENCY_GROUP_ID] === groupId;
      });
      if (!groupRow && memberRows.length === 0) {
        continue;
      }

      const desiredState = memberRows.length > 0 ?
        LATENCY_GROUP_STATE.ACTIVE :
        LATENCY_GROUP_STATE.DRAINING;
      const normalizedGroupRow = buildNormalizedGroupRow({
        groupId,
        groupRow,
        desiredState,
        timestamp: options.timestamp,
      });

      if (shouldPersistLifecycleState(groupRow, normalizedGroupRow)) {
        await this.getControlPlaneSystemTableGateway().submitMutation({
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
          tableName: TABLES.LATENCY_GROUPS,
          row: normalizedGroupRow,
        }, {
          workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
          deliveryPriority: LOCAL_STR_CRITICAL,
        });
      }

      await this.groupSelectionService.applyGroupLeadership({
        groupRow: normalizedGroupRow,
        memberRows,
      });
    }
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
        return -1;
      }
      if (left.groupId > right.groupId) {
        return 1;
      }
      return 0;
    });
  }

  /**
   * Schedule next periodic reassignment cycle.
   * @private
   */
  scheduleNextCycle() {
    this.clearScheduledCycle();
    const delayMs = computeNextLatencyGroupCycleDelayMs({
      recalcIntervalMs: this.recalcIntervalMs,
      recalcJitterRatio: this.recalcJitterRatio,
      randomFn: this.randomFn,
    });
    this.recalcTimer = this.setTimeoutFn(() => {
      void this.executeScheduledCycle(LATENCY_GROUP_MANAGER_TRIGGER.PERIODIC);
    }, delayMs);
    if (typeof this.recalcTimer?.unref === 'function') {
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
   * Refresh runtime config values from ConfigurationManager.
   */
  refreshConfig() {
    const runtimeConfig = resolveLatencyGroupManagerConfig(this.config);
    this.pinnedGroupId = runtimeConfig.pinnedGroupId;
    this.groupThresholdMs = runtimeConfig.groupThresholdMs;
    this.recalcIntervalMs = runtimeConfig.recalcIntervalMs;
    this.recalcJitterRatio = runtimeConfig.recalcJitterRatio;
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

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      getCdcIntegrationService: () => this.cdcIntegrationService,
      getSystemTableCache: () => this.systemTableCache,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
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
