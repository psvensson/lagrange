/**
 * Failure Detector - Detects node failures via heartbeat timeout.
 * Marks affected replicas as unavailable when nodes fail.
 * Requirements: 14.1
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {SERVICE_TYPE} from '../constants/index.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {assertCritical} from '../utils/assert.js';
import {
  FAILURE_DETECTOR_ACTION,
  FAILURE_DETECTOR_DEFAULT,
  FAILURE_DETECTOR_ERROR_MSG,
  FAILURE_DETECTOR_EVENT,
  FAILURE_DETECTOR_LOG_MSG,
  FAILURE_DETECTOR_SQL,
  FAILURE_DETECTOR_SUBSYSTEM,
  NODE_STATUS,
} from './node-constants.js';
import {
  FAILURE_REPAIR_INTENT_RECORDER_METHOD,
  FAILURE_REPAIR_INTENT_TRANSITION_TYPE,
  buildFailureRepairIntentRecord,
  createInMemoryFailureRepairIntentRecorder,
} from './failure-repair-intent-contract.js';
import {
  buildObservedNodeWhereClause,
  guardedUpdateApplied,
} from './failure-detector-control-plane-guards.js';
import {
  markFailureDetectorMessageGroupReplicaAsFailed,
  markFailureDetectorPartitionReplicaAsFailed,
  markFailureDetectorReplicasAsFailed,
} from './failure-detector-replica-failures.js';

/**
 * FailureDetector monitors node health via heartbeat timeouts.
 * When a node fails, it marks all affected replicas as unavailable.
 *
 * Two-layer detection:
 * - Layer 1 (Raft-Level): Fast detection of replica failures (150-500ms)
 * - Layer 2 (Node-Level): Confirmation of node failures (15 seconds)
 */
const NodeStatus = NODE_STATUS;

class FailureDetector extends EventEmitter {
  /**
   * Create a new FailureDetector.
   * @param {Object} options - Configuration options.
   * @param {Object} options.sqlQueryEngine - SQL query engine for reads.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {string} options.nodeId - This node's ID.
   */
  constructor(options = {}) {
    super();

    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.failureRepairIntentRecorder =
      options.failureRepairIntentRecorder ||
      createInMemoryFailureRepairIntentRecorder();
    this.nodeId = options.nodeId || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.checkIntervalMs =
      config.get(CONFIG_KEY.FAILURE_DETECTOR_CHECK_INTERVAL_MS) ||
      FAILURE_DETECTOR_DEFAULT.CHECK_INTERVAL_MS;
    this.suspicionThresholdMs =
      config.get(CONFIG_KEY.FAILURE_DETECTOR_SUSPICION_THRESHOLD_MS) ||
      FAILURE_DETECTOR_DEFAULT.SUSPICION_THRESHOLD_MS;
    this.failureThresholdMs =
      config.get(CONFIG_KEY.FAILURE_DETECTOR_FAILURE_THRESHOLD_MS) ||
      FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS;
    this.flappingWindowMs =
      config.get(CONFIG_KEY.FAILURE_DETECTOR_FLAPPING_WINDOW_MS) ||
      FAILURE_DETECTOR_DEFAULT.FLAPPING_WINDOW_MS;
    this.flappingThreshold =
      config.get(CONFIG_KEY.FAILURE_DETECTOR_FLAPPING_THRESHOLD) ||
      FAILURE_DETECTOR_DEFAULT.FLAPPING_THRESHOLD;
    this.adaptiveMaxThresholdMs =
      config.get(CONFIG_KEY.FAILURE_DETECTOR_ADAPTIVE_MAX_THRESHOLD_MS) ||
      FAILURE_DETECTOR_DEFAULT.ADAPTIVE_MAX_THRESHOLD_MS;
    this.stabilityPeriodMs =
      config.get(CONFIG_KEY.FAILURE_DETECTOR_STABILITY_PERIOD_MS) ||
      FAILURE_DETECTOR_DEFAULT.STABILITY_PERIOD_MS;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(FAILURE_DETECTOR_SUBSYSTEM);

    // State
    this.checkTimer = null;
    this.adaptiveResetTimer = null;
    this.recentFailures = new Map(); // nodeId -> failure timestamps
    this.currentFailureThreshold = this.failureThresholdMs;
    this.initialized = false;
  }

  /**
   * Initialize the failure detector.
   * @param {Object} options - Initialization options.
   */
  initialize(options = {}) {
    if (options.sqlQueryEngine) {
      this.sqlQueryEngine = options.sqlQueryEngine;
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
    if (options.failureRepairIntentRecorder) {
      this.failureRepairIntentRecorder = options.failureRepairIntentRecorder;
    }
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }

    if (!this.nodeId) {
      throw new Error(FAILURE_DETECTOR_ERROR_MSG.MISSING_NODE_ID);
    }
    if (!this.sqlQueryEngine && this.cdcIntegrationService?.sqlQueryEngine) {
      this.sqlQueryEngine = this.cdcIntegrationService.sqlQueryEngine;
    }
    this.sqlQueryEngine = assertCritical(
      this.sqlQueryEngine,
      FAILURE_DETECTOR_ERROR_MSG.MISSING_SQL_QUERY_ENGINE,
    );
    if (!this.cdcIntegrationService && !this.controlPlaneSystemTableGateway) {
      throw new Error(FAILURE_DETECTOR_ERROR_MSG.MISSING_CDC_SERVICE);
    }

    this.initialized = true;

    this.logger.info(FAILURE_DETECTOR_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      checkIntervalMs: this.checkIntervalMs,
      suspicionThresholdMs: this.suspicionThresholdMs,
      failureThresholdMs: this.failureThresholdMs,
    });
  }

  /**
   * Replace the active SQL query engine with a newer canonical engine.
   * No-op if called with null/undefined.
   * @param {Object} sqlQueryEngine - The real SQL query engine.
   */
  upgradeSqlQueryEngine(sqlQueryEngine) {
    if (!sqlQueryEngine) return;
    this.sqlQueryEngine = sqlQueryEngine;
  }

  /**
   * Start the failure detection loop.
   */
  start() {
    if (!this.initialized) {
      throw new Error(FAILURE_DETECTOR_ERROR_MSG.NOT_INITIALIZED);
    }

    if (this.checkTimer) {
      return; // Already running
    }

    this.logger.info(FAILURE_DETECTOR_LOG_MSG.STARTING, {
      nodeId: this.nodeId,
      intervalMs: this.checkIntervalMs,
    });

    this.checkTimer = setInterval(async () => {
      try {
        await this.checkNodeHealth();
      } catch (error) {
        if (error?.isCritical) {
          throw error;
        }
        this.logger.error(FAILURE_DETECTOR_LOG_MSG.CHECK_ERROR, {
          nodeId: this.nodeId,
          error: error.message,
        });
        throw error;
      }
    }, this.checkIntervalMs);
    this.checkTimer.unref();

    // Reset timer is demand-driven and only runs after observed failures.
    this.ensureAdaptiveThresholdResetTimer();
  }

  /**
   * Stop the failure detection loop.
   */
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.stopAdaptiveThresholdResetTimer();

    this.logger.info(FAILURE_DETECTOR_LOG_MSG.STOPPED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Check health of all known nodes.
   * @return {Promise<void>}
   */
  async checkNodeHealth() {
    const now = Date.now();
    const nodes = await this.getNodes();

    for (const node of nodes) {
      // Skip self
      if (node.node_id === this.nodeId) {
        continue;
      }

      await this.evaluateNodeHealth(node, now);
    }
  }

  /**
   * Evaluate health of a single node.
   * @param {Object} node - Node to evaluate.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async evaluateNodeHealth(node, now) {
    const lastHeartbeat = node.last_heartbeat || 0;
    const timeSinceHeartbeat = now - lastHeartbeat;

    // Node recovery detected
    if (node.status === NODE_STATUS.FAILED &&
        timeSinceHeartbeat < this.currentFailureThreshold) {
      await this.handleNodeRecovery(node, now);
      return;
    }

    // Skip already failed nodes
    if (node.status === NODE_STATUS.FAILED) {
      return;
    }

    // Node has failed (no heartbeat for too long)
    if (timeSinceHeartbeat > this.currentFailureThreshold) {
      if (node.status === NODE_STATUS.SUSPECTED) {
        // Already suspected, now confirm failure
        await this.handleNodeFailure(node, now);
      } else if (node.status === NODE_STATUS.ACTIVE) {
        // First timeout, mark as suspected
        await this.handleNodeSuspicion(node, now, timeSinceHeartbeat);
      }
      return;
    }

    // Node is suspected (slow to respond)
    if (timeSinceHeartbeat > this.suspicionThresholdMs &&
        node.status === NODE_STATUS.ACTIVE) {
      await this.handleNodeSuspicion(node, now, timeSinceHeartbeat);
    }
  }

  /**
   * Handle node suspicion (first sign of potential failure).
   * @param {Object} node - Node to mark as suspected.
   * @param {number} now - Current timestamp.
   * @param {number} timeSinceHeartbeat - Time since last heartbeat.
   * @return {Promise<void>}
   * @private
   */
  async handleNodeSuspicion(node, now, timeSinceHeartbeat) {
    this.logger.warn(FAILURE_DETECTOR_LOG_MSG.NODE_SUSPECTED, {
      nodeId: node.node_id,
      timeSinceHeartbeat,
      threshold: this.suspicionThresholdMs,
    });

    try {
      const result = await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: SYSTEM_TABLE_NAME.NODES,
        whereClause: buildObservedNodeWhereClause(node),
        data: {
          status: NODE_STATUS.SUSPECTED,
          updated_at: now,
        },
      }, {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        deliveryPriority: 'critical',
      });
      if (!guardedUpdateApplied(result)) {
        this.logger.debug(FAILURE_DETECTOR_LOG_MSG.STALE_NODE_SUSPICION_UPDATE, {
          nodeId: node.node_id,
          timeSinceHeartbeat,
        });
        return;
      }
    } catch (error) {
      this.logger.error(FAILURE_DETECTOR_LOG_MSG.MARK_NODE_SUSPECTED_FAILED, {
        nodeId: node.node_id,
        error: error.message,
      });
      throw error;
    }

    this.emit(FAILURE_DETECTOR_EVENT.NODE_SUSPECTED, {
      nodeId: node.node_id,
      timeSinceHeartbeat,
    });
  }

  /**
   * Handle confirmed node failure.
   * @param {Object} node - Node that has failed.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async handleNodeFailure(node, now) {
    this.logger.error(FAILURE_DETECTOR_LOG_MSG.NODE_FAILURE_DETECTED, {
      nodeId: node.node_id,
      lastHeartbeat: new Date(node.last_heartbeat || 0).toISOString(),
      threshold: this.currentFailureThreshold,
    });

    // Check for flapping
    await this.checkFlapping(node.node_id, now);

    // Mark node as failed
    try {
      const result = await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: SYSTEM_TABLE_NAME.NODES,
        whereClause: buildObservedNodeWhereClause(node),
        data: {
          status: NODE_STATUS.FAILED,
          failed_at: now,
          updated_at: now,
        },
      }, {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        deliveryPriority: 'critical',
      });
      if (!guardedUpdateApplied(result)) {
        this.logger.debug(FAILURE_DETECTOR_LOG_MSG.STALE_NODE_FAILURE_UPDATE, {
          nodeId: node.node_id,
        });
        return;
      }
    } catch (error) {
      this.logger.error(FAILURE_DETECTOR_LOG_MSG.MARK_NODE_FAILED_FAILED, {
        nodeId: node.node_id,
        error: error.message,
      });
      throw error;
    }

    await this.recordDurableRepairIntent({
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.NODE_FAILURE,
      nodeId: node.node_id,
      observedAt: now,
    });

    // Mark all replicas on this node as failed
    await this.markReplicasAsFailed(node.node_id, now);

    this.emit(FAILURE_DETECTOR_EVENT.NODE_FAILURE, {
      nodeId: node.node_id,
      timestamp: now,
    });
  }

  /**
   * Handle node recovery.
   * @param {Object} node - Node that has recovered.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async handleNodeRecovery(node, now) {
    const downtime = now - (node.failed_at || node.last_heartbeat || now);

    this.logger.info(FAILURE_DETECTOR_LOG_MSG.NODE_RECOVERY_DETECTED, {
      nodeId: node.node_id,
      downtime,
    });

    try {
      const result = await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: SYSTEM_TABLE_NAME.NODES,
        whereClause: buildObservedNodeWhereClause(node),
        data: {
          status: NODE_STATUS.RECOVERING,
          recovered_at: now,
          updated_at: now,
        },
      }, {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        deliveryPriority: 'critical',
      });
      if (!guardedUpdateApplied(result)) {
        this.logger.debug(FAILURE_DETECTOR_LOG_MSG.STALE_NODE_RECOVERY_UPDATE, {
          nodeId: node.node_id,
        });
        return;
      }
    } catch (error) {
      this.logger.error(FAILURE_DETECTOR_LOG_MSG.MARK_NODE_RECOVERING_FAILED, {
        nodeId: node.node_id,
        error: error.message,
      });
      throw error;
    }

    await this.recordDurableRepairIntent({
      transitionType: FAILURE_REPAIR_INTENT_TRANSITION_TYPE.NODE_RECOVERY,
      nodeId: node.node_id,
      observedAt: now,
    });

    this.emit(FAILURE_DETECTOR_EVENT.NODE_RECOVERY, {
      nodeId: node.node_id,
      downtime,
      timestamp: now,
    });
  }

  /**
   * Mark all replicas on a failed node as failed.
   * @param {string} nodeId - Failed node ID.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async markReplicasAsFailed(nodeId, now) {
    return markFailureDetectorReplicasAsFailed(this, nodeId, now);
  }

  /**
   * Mark a partition replica as failed.
   * @param {Object} replica - Replica to mark as failed.
   * @param {string} nodeId - Node ID where replica was located.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async markReplicaAsFailed(replica, nodeId, now) {
    return markFailureDetectorPartitionReplicaAsFailed(
      this,
      replica,
      nodeId,
      now,
    );
  }

  /**
   * Mark a message group replica as failed.
   * @param {Object} replica - Replica to mark as failed.
   * @param {string} nodeId - Node ID where replica was located.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async markMessageGroupReplicaAsFailed(replica, nodeId, now) {
    return markFailureDetectorMessageGroupReplicaAsFailed(
      this,
      replica,
      nodeId,
      now,
    );
  }

  /**
   * Check for node flapping (repeated failures).
   * @param {string} nodeId - Node ID to check.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async checkFlapping(nodeId, now) {
    const failures = this.recentFailures.get(nodeId) || [];

    // Filter to recent failures within window
    const recentCount = failures.filter(
      (t) => now - t < this.flappingWindowMs,
    ).length;

    if (recentCount >= this.flappingThreshold) {
      this.logger.error(FAILURE_DETECTOR_LOG_MSG.NODE_FLAPPING_DETECTED, {
        nodeId,
        failureCount: recentCount,
        window: this.flappingWindowMs,
        action: FAILURE_DETECTOR_ACTION.ADAPTIVE_THRESHOLD_INCREASE,
      });

      // Increase threshold adaptively (up to max)
      this.currentFailureThreshold = Math.min(
        this.currentFailureThreshold * FAILURE_DETECTOR_DEFAULT.ADAPTIVE_MULTIPLIER,
        this.adaptiveMaxThresholdMs,
      );
    }

    // Record this failure
    failures.push(now);
    this.recentFailures.set(nodeId, failures);
    this.ensureAdaptiveThresholdResetTimer();
  }

  /**
   * Ensure adaptive threshold reset timer is running when needed.
   * @private
   */
  ensureAdaptiveThresholdResetTimer() {
    if (this.adaptiveResetTimer || this.recentFailures.size === 0) {
      return;
    }

    this.adaptiveResetTimer = setInterval(() => {
      const now = Date.now();

      for (const [nodeId, failures] of this.recentFailures) {
        if (failures.length === 0) {
          continue;
        }

        const lastFailure = Math.max(...failures);

        if (now - lastFailure > this.stabilityPeriodMs) {
          // Node has been stable, reset threshold
          this.currentFailureThreshold = this.failureThresholdMs;
          this.recentFailures.delete(nodeId);

          this.logger.info(FAILURE_DETECTOR_LOG_MSG.RESET_ADAPTIVE_THRESHOLD, {
            nodeId,
            newThreshold: this.currentFailureThreshold,
          });
        }
      }

      if (this.recentFailures.size === 0) {
        this.stopAdaptiveThresholdResetTimer();
      }
    }, FAILURE_DETECTOR_DEFAULT.ADAPTIVE_RESET_INTERVAL_MS);
    this.adaptiveResetTimer.unref();
  }

  /**
   * Stop adaptive threshold reset timer if running.
   * @private
   */
  stopAdaptiveThresholdResetTimer() {
    if (!this.adaptiveResetTimer) {
      return;
    }
    clearInterval(this.adaptiveResetTimer);
    this.adaptiveResetTimer = null;
  }

  /**
   * Get all nodes via SQL query engine.
   * @return {Promise<Array<Object>>} Array of node objects.
   * @private
   */
  async getNodes() {
    const result = await readAuthoritativeControlPlaneRows(
      this.getControlPlaneSystemTableGateway(),
      SYSTEM_TABLE_NAME.NODES,
      FAILURE_DETECTOR_SQL.SELECT_ALL_NODES,
      [],
      {
        coalescingKey: 'failure-detector:nodes',
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
      },
    );
    return result.rows || [];
  }

  /**
   * Get partition replicas on a specific node via SQL query engine.
   * @param {string} nodeId - Node ID.
   * @return {Promise<Array<Object>>} Array of replica objects.
   * @private
   */
  async getPartitionReplicasOnNode(nodeId) {
    const result = await readAuthoritativeControlPlaneRows(
      this.getControlPlaneSystemTableGateway(),
      SYSTEM_TABLE_NAME.SERVICES,
      FAILURE_DETECTOR_SQL.SELECT_SERVICES_BY_NODE_AND_TYPE,
      [nodeId, SERVICE_TYPE.PARTITION],
      {
        coalescingKey: `failure-detector:partition-services:${nodeId}`,
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
      },
    );
    return result.rows || [];
  }

  /**
   * Get message group replicas on a specific node via SQL query engine.
   * @param {string} nodeId - Node ID.
   * @return {Promise<Array<Object>>} Array of replica objects.
   * @private
   */
  async getMessageGroupReplicasOnNode(nodeId) {
    const result = await readAuthoritativeControlPlaneRows(
      this.getControlPlaneSystemTableGateway(),
      SYSTEM_TABLE_NAME.SERVICES,
      FAILURE_DETECTOR_SQL.SELECT_SERVICES_BY_NODE_AND_TYPE,
      [nodeId, SERVICE_TYPE.MESSAGE_GROUP_REPLICA],
      {
        coalescingKey: `failure-detector:mg-services:${nodeId}`,
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
      },
    );
    return result.rows || [];
  }

  /**
   * Get current failure threshold.
   * @return {number} Current failure threshold in ms.
   */
  getFailureThreshold() {
    return this.currentFailureThreshold;
  }

  /**
   * Get failure detector statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    return {
      nodeId: this.nodeId,
      checkIntervalMs: this.checkIntervalMs,
      currentFailureThreshold: this.currentFailureThreshold,
      recentFailuresCount: this.recentFailures.size,
      isRunning: this.checkTimer !== null,
      initialized: this.initialized,
    };
  }

  /**
   * Get in-memory repair intents when the default diagnostic recorder is used.
   * @return {Array<Object>} Recorded durable repair intent records.
   */
  getFailureRepairIntentRecords() {
    if (
      typeof this.failureRepairIntentRecorder?.getRecords === 'function'
    ) {
      return this.failureRepairIntentRecorder.getRecords();
    }
    return [];
  }

  /**
   * Record a canonical durable repair intent before wake events are emitted.
   * @param {Object} options - Repair intent record options.
   * @return {Promise<Object>} Recorded repair intent.
   * @private
   */
  async recordDurableRepairIntent(options) {
    const repairIntentRecord = buildFailureRepairIntentRecord({
      ...options,
      sourceNodeId: this.nodeId,
    });
    return this.failureRepairIntentRecorder[
      FAILURE_REPAIR_INTENT_RECORDER_METHOD.RECORD_INTENT
    ](repairIntentRecord);
  }

  /**
   * Check if failure detector is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Check if failure detector is running.
   * @return {boolean} True if running.
   */
  isRunning() {
    return this.checkTimer !== null;
  }

  /**
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      getSqlQueryEngine: () => this.sqlQueryEngine,
      getCdcIntegrationService: () => this.cdcIntegrationService,
      getMessageRouter: () => this.cdcIntegrationService?.messageRouter || null,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Shutdown the failure detector.
   */
  shutdown() {
    this.stop();
    this.recentFailures.clear();
    this.currentFailureThreshold = this.failureThresholdMs;
    this.initialized = false;

    this.logger.info(FAILURE_DETECTOR_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
    });
  }
}

export {FailureDetector, NodeStatus, ReplicaStatus};
