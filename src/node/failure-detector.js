/**
 * Failure Detector - Detects node failures via heartbeat timeout.
 * Marks affected replicas as unavailable when nodes fail.
 * Requirements: 14.1
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas.js';

/**
 * Node status values.
 */
const NodeStatus = {
  ACTIVE: 'active',
  SUSPECTED: 'suspected',
  FAILED: 'failed',
  RECOVERING: 'recovering',
};

/**
 * Replica status values.
 */
const ReplicaStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  FAILED: 'failed',
  STARTING: 'starting',
  STOPPING: 'stopping',
};

/**
 * FailureDetector monitors node health via heartbeat timeouts.
 * When a node fails, it marks all affected replicas as unavailable.
 *
 * Two-layer detection:
 * - Layer 1 (Raft-Level): Fast detection of replica failures (150-500ms)
 * - Layer 2 (Node-Level): Confirmation of node failures (15 seconds)
 */
class FailureDetector extends EventEmitter {
  /**
   * Create a new FailureDetector.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {string} options.nodeId - This node's ID.
   */
  constructor(options = {}) {
    super();

    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.nodeId = options.nodeId || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.checkIntervalMs = config.get('failureDetector.checkIntervalMs') || 5000;
    this.suspicionThresholdMs =
      config.get('failureDetector.suspicionThresholdMs') || 10000;
    this.failureThresholdMs =
      config.get('failureDetector.failureThresholdMs') || 15000;
    this.flappingWindowMs =
      config.get('failureDetector.flappingWindowMs') || 30000;
    this.flappingThreshold =
      config.get('failureDetector.flappingThreshold') || 3;
    this.adaptiveMaxThresholdMs =
      config.get('failureDetector.adaptiveMaxThresholdMs') || 60000;
    this.stabilityPeriodMs =
      config.get('failureDetector.stabilityPeriodMs') || 300000;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('failure-detector') : console;

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
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }

    if (!this.nodeId) {
      throw new Error('FailureDetector requires nodeId');
    }

    this.initialized = true;

    this.logger.info('Failure detector initialized', {
      nodeId: this.nodeId,
      checkIntervalMs: this.checkIntervalMs,
      suspicionThresholdMs: this.suspicionThresholdMs,
      failureThresholdMs: this.failureThresholdMs,
    });
  }

  /**
   * Start the failure detection loop.
   */
  start() {
    if (!this.initialized) {
      throw new Error('FailureDetector not initialized');
    }

    if (this.checkTimer) {
      return; // Already running
    }

    this.logger.info('Starting failure detection', {
      nodeId: this.nodeId,
      intervalMs: this.checkIntervalMs,
    });

    this.checkTimer = setInterval(async () => {
      try {
        await this.checkNodeHealth();
      } catch (error) {
        this.logger.error('Error during failure detection check', {
          nodeId: this.nodeId,
          error: error.message,
        });
      }
    }, this.checkIntervalMs);

    // Start adaptive threshold reset timer
    this.startAdaptiveThresholdReset();
  }

  /**
   * Stop the failure detection loop.
   */
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    if (this.adaptiveResetTimer) {
      clearInterval(this.adaptiveResetTimer);
      this.adaptiveResetTimer = null;
    }

    this.logger.info('Stopped failure detection', {
      nodeId: this.nodeId,
    });
  }

  /**
   * Check health of all known nodes.
   * @return {Promise<void>}
   */
  async checkNodeHealth() {
    const now = Date.now();
    const nodes = this.getNodes();

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
    if (node.status === NodeStatus.FAILED &&
        timeSinceHeartbeat < this.currentFailureThreshold) {
      await this.handleNodeRecovery(node, now);
      return;
    }

    // Skip already failed nodes
    if (node.status === NodeStatus.FAILED) {
      return;
    }

    // Node has failed (no heartbeat for too long)
    if (timeSinceHeartbeat > this.currentFailureThreshold) {
      if (node.status === NodeStatus.SUSPECTED) {
        // Already suspected, now confirm failure
        await this.handleNodeFailure(node, now);
      } else if (node.status === NodeStatus.ACTIVE) {
        // First timeout, mark as suspected
        await this.handleNodeSuspicion(node, now, timeSinceHeartbeat);
      }
      return;
    }

    // Node is suspected (slow to respond)
    if (timeSinceHeartbeat > this.suspicionThresholdMs &&
        node.status === NodeStatus.ACTIVE) {
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
    this.logger.warn('Node suspected of failure', {
      nodeId: node.node_id,
      timeSinceHeartbeat,
      threshold: this.suspicionThresholdMs,
    });

    if (this.cdcIntegrationService) {
      try {
        await this.cdcIntegrationService.updateSystemTableRow(
          SystemTableName.NODES,
          {node_id: node.node_id},
          {
            status: NodeStatus.SUSPECTED,
            updated_at: now,
          },
        );
      } catch (error) {
        this.logger.error('Failed to mark node as suspected', {
          nodeId: node.node_id,
          error: error.message,
        });
      }
    }

    this.emit('nodeSuspected', {
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
    this.logger.error('Node failure detected', {
      nodeId: node.node_id,
      lastHeartbeat: new Date(node.last_heartbeat || 0).toISOString(),
      threshold: this.currentFailureThreshold,
    });

    // Check for flapping
    await this.checkFlapping(node.node_id, now);

    // Mark node as failed
    if (this.cdcIntegrationService) {
      try {
        await this.cdcIntegrationService.updateSystemTableRow(
          SystemTableName.NODES,
          {node_id: node.node_id},
          {
            status: NodeStatus.FAILED,
            failed_at: now,
            updated_at: now,
          },
        );
      } catch (error) {
        this.logger.error('Failed to mark node as failed', {
          nodeId: node.node_id,
          error: error.message,
        });
      }
    }

    // Mark all replicas on this node as failed
    await this.markReplicasAsFailed(node.node_id, now);

    this.emit('nodeFailure', {
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

    this.logger.info('Node recovery detected', {
      nodeId: node.node_id,
      downtime,
    });

    if (this.cdcIntegrationService) {
      try {
        await this.cdcIntegrationService.updateSystemTableRow(
          SystemTableName.NODES,
          {node_id: node.node_id},
          {
            status: NodeStatus.RECOVERING,
            recovered_at: now,
            updated_at: now,
          },
        );
      } catch (error) {
        this.logger.error('Failed to mark node as recovering', {
          nodeId: node.node_id,
          error: error.message,
        });
      }
    }

    this.emit('nodeRecovery', {
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
    // Mark partition replicas as failed
    const partitionReplicas = this.getPartitionReplicasOnNode(nodeId);
    for (const replica of partitionReplicas) {
      await this.markReplicaAsFailed(replica, nodeId, now);
    }

    // Mark message group replicas as failed
    const messageGroupReplicas = this.getMessageGroupReplicasOnNode(nodeId);
    for (const replica of messageGroupReplicas) {
      await this.markMessageGroupReplicaAsFailed(replica, nodeId, now);
    }

    this.logger.info('Marked replicas as failed', {
      nodeId,
      partitionReplicas: partitionReplicas.length,
      messageGroupReplicas: messageGroupReplicas.length,
    });
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
    if (!this.cdcIntegrationService) {
      return;
    }

    try {
      await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.SERVICES,
        {service_id: replica.service_id},
        {
          status: ReplicaStatus.FAILED,
          updated_at: now,
        },
      );

      this.logger.warn('Marked partition replica as failed', {
        serviceId: replica.service_id,
        partitionId: replica.partition_id,
        nodeId,
      });

      this.emit('replicaFailed', {
        type: 'partition',
        serviceId: replica.service_id,
        partitionId: replica.partition_id,
        nodeId,
      });
    } catch (error) {
      this.logger.error('Failed to mark partition replica as failed', {
        serviceId: replica.service_id,
        error: error.message,
      });
    }
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
    if (!this.cdcIntegrationService) {
      return;
    }

    try {
      await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.SERVICES,
        {service_id: replica.service_id},
        {
          status: ReplicaStatus.FAILED,
          updated_at: now,
        },
      );

      this.logger.warn('Marked message group replica as failed', {
        serviceId: replica.service_id,
        groupId: replica.group_id,
        nodeId,
      });

      this.emit('replicaFailed', {
        type: 'message_group',
        serviceId: replica.service_id,
        groupId: replica.group_id,
        nodeId,
      });
    } catch (error) {
      this.logger.error('Failed to mark message group replica as failed', {
        serviceId: replica.service_id,
        error: error.message,
      });
    }
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
      this.logger.error('Node flapping detected', {
        nodeId,
        failureCount: recentCount,
        window: this.flappingWindowMs,
        action: 'Increasing failure threshold adaptively',
      });

      // Increase threshold adaptively (up to max)
      this.currentFailureThreshold = Math.min(
        this.currentFailureThreshold * 1.5,
        this.adaptiveMaxThresholdMs,
      );
    }

    // Record this failure
    failures.push(now);
    this.recentFailures.set(nodeId, failures);
  }

  /**
   * Start adaptive threshold reset timer.
   * @private
   */
  startAdaptiveThresholdReset() {
    if (this.adaptiveResetTimer) {
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

          this.logger.info('Reset adaptive threshold for stable node', {
            nodeId,
            newThreshold: this.currentFailureThreshold,
          });
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Get all nodes from cache.
   * @return {Array<Object>} Array of node objects.
   * @private
   */
  getNodes() {
    if (!this.systemTableCache) {
      return [];
    }

    try {
      return this.systemTableCache.getAll('nodes') || [];
    } catch (_error) {
      return [];
    }
  }

  /**
   * Get partition replicas on a specific node.
   * @param {string} nodeId - Node ID.
   * @return {Array<Object>} Array of replica objects.
   * @private
   */
  getPartitionReplicasOnNode(nodeId) {
    if (!this.systemTableCache) {
      return [];
    }

    try {
      return this.systemTableCache.filter('services', (service) => {
        return service.node_id === nodeId &&
          service.service_type === 'partition';
      }) || [];
    } catch (_error) {
      return [];
    }
  }

  /**
   * Get message group replicas on a specific node.
   * @param {string} nodeId - Node ID.
   * @return {Array<Object>} Array of replica objects.
   * @private
   */
  getMessageGroupReplicasOnNode(nodeId) {
    if (!this.systemTableCache) {
      return [];
    }

    try {
      return this.systemTableCache.filter('services', (service) => {
        return service.node_id === nodeId &&
          service.service_type === 'message_group_replica';
      }) || [];
    } catch (_error) {
      return [];
    }
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
   * Shutdown the failure detector.
   */
  shutdown() {
    this.stop();
    this.recentFailures.clear();
    this.currentFailureThreshold = this.failureThresholdMs;
    this.initialized = false;

    this.logger.info('Failure detector shutdown', {
      nodeId: this.nodeId,
    });
  }
}

export {FailureDetector, NodeStatus, ReplicaStatus};
