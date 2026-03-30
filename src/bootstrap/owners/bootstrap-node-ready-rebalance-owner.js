import {
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_NODE_READY_REBALANCE_TABLES,
  BOOTSTRAP_REBALANCE_REASON,
} from '../bootstrap-constants.js';
import {
  isNodeHeartbeatWatermarkRegression,
  isNodeRecordReady,
} from '../../node/node-readiness-policy.js';
import {NUM} from '../../constants/index.js';

const NODE_READY_REBALANCE_TABLE_SET =
  new Set(BOOTSTRAP_NODE_READY_REBALANCE_TABLES);

class BootstrapNodeReadyRebalanceOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.rebalanceTriggeredNodeIds = new Set();
    this.pendingNodeReadyRebalanceTimers = new Map();
  }

  getLogger() {
    return this.delegates.getLogger?.() || console;
  }

  getNodeReadyRebalanceDelayMs() {
    return this.delegates.getNodeReadyRebalanceDelayMs?.() || NUM.ZERO;
  }

  getPartitionServices() {
    return this.delegates.getPartitionServices?.() || new Map();
  }

  executeNodeReadyRebalance(reason) {
    if (typeof this.delegates.executeNodeReadyRebalance === 'function') {
      this.delegates.executeNodeReadyRebalance(reason);
      return;
    }
    this.triggerRebalancingOnAllPartitions(reason);
  }

  triggerRebalancingOnAllPartitions(reason) {
    const logger = this.getLogger();
    const partitionServices = this.getPartitionServices();
    const nodeReadyScoped = reason === BOOTSTRAP_REBALANCE_REASON.NODE_READY;
    let leaderPartitionCount = NUM.ZERO;
    let triggeredPartitionCount = NUM.ZERO;

    for (const partition of partitionServices.values()) {
      if (!partition?.isLeader) {
        continue;
      }
      leaderPartitionCount++;
      if (nodeReadyScoped &&
          !this.shouldTriggerNodeReadyRebalanceForPartition(partition)) {
        continue;
      }
      triggeredPartitionCount++;
      partition.triggerRebalanceCheck(reason);
    }

    logger.info(BOOTSTRAP_LOG_MSG.REBALANCE_TRIGGER, {
      reason,
      partitionCount: partitionServices.size,
      leaderPartitionCount,
      triggeredPartitionCount,
      scope: nodeReadyScoped ?
        'bootstrap_convergence_critical' :
        'all_leader_partitions',
    });
  }

  shouldTriggerNodeReadyRebalanceForPartition(partition) {
    const tableName =
      partition?.tableName ||
      partition?.table_id ||
      partition?.tableId ||
      null;
    if (typeof tableName === 'string' &&
        NODE_READY_REBALANCE_TABLE_SET.has(tableName)) {
      return true;
    }

    const partitionId =
      partition?.partitionId ||
      partition?.partition_id ||
      partition?.serviceId ||
      partition?.service_id ||
      null;
    if (typeof partitionId !== 'string' || partitionId.length === NUM.ZERO) {
      return false;
    }
    for (const nodeReadyTableName of BOOTSTRAP_NODE_READY_REBALANCE_TABLES) {
      if (partitionId === `${nodeReadyTableName}-p1`) {
        return true;
      }
    }
    return false;
  }

  handleNodeReadyRebalanceTrigger(cdcEvent, previousNodeRow) {
    const logger = this.getLogger();
    const rawNodeRow = cdcEvent?.data || null;
    const previousRow = previousNodeRow &&
      typeof previousNodeRow === 'object' ?
      previousNodeRow :
      {};
    const incomingRow = rawNodeRow &&
      typeof rawNodeRow === 'object' ?
      rawNodeRow :
      {};
    const nodeRow = {
      ...previousRow,
      ...incomingRow,
      node_id:
        incomingRow.node_id ??
        incomingRow.nodeId ??
        previousRow.node_id ??
        previousRow.nodeId ??
        null,
      status:
        incomingRow.status ??
        incomingRow.nodeStatus ??
        incomingRow.state ??
        incomingRow.lifecycle_state ??
        incomingRow.lifecycleState ??
        previousRow.status ??
        previousRow.nodeStatus ??
        previousRow.state ??
        previousRow.lifecycle_state ??
        previousRow.lifecycleState ??
        null,
      ready_lease_expires_at:
        incomingRow.ready_lease_expires_at ??
        incomingRow.readyLeaseExpiresAt ??
        incomingRow.readyLeaseExpiresAtMs ??
        incomingRow.readyLeaseExpires ??
        previousRow.ready_lease_expires_at ??
        previousRow.readyLeaseExpiresAt ??
        previousRow.readyLeaseExpiresAtMs ??
        previousRow.readyLeaseExpires ??
        null,
    };
    const nodeId = nodeRow?.node_id;
    if (!nodeId) {
      logger.info('Skipping node-ready rebalance trigger: missing node_id', {
        operation: cdcEvent?.operation || null,
      });
      return false;
    }

    const now = Date.now();
    if (isNodeHeartbeatWatermarkRegression(previousRow, incomingRow)) {
      logger.debug(
        'Skipping node-ready rebalance trigger: stale node liveness regression',
        {
          nodeId,
          operation: cdcEvent?.operation || null,
          previousReadyLeaseExpiresAt:
            previousRow.ready_lease_expires_at ??
            previousRow.readyLeaseExpiresAt ??
            null,
          incomingReadyLeaseExpiresAt:
            incomingRow.ready_lease_expires_at ??
            incomingRow.readyLeaseExpiresAt ??
            null,
          previousLastHeartbeat:
            previousRow.last_heartbeat ??
            previousRow.lastHeartbeat ??
            null,
          incomingLastHeartbeat:
            incomingRow.last_heartbeat ??
            incomingRow.lastHeartbeat ??
            null,
        },
      );
      return false;
    }
    const isReady = isNodeRecordReady(nodeRow, {now});
    const wasReady = isNodeRecordReady(previousRow, {now});

    if (!isReady) {
      logger.info('Skipping node-ready rebalance trigger: node not ready', {
        nodeId,
        status: nodeRow.status || null,
        readyLeaseExpiresAt: nodeRow.ready_lease_expires_at || null,
        operation: cdcEvent?.operation || null,
      });
      const existingTimer = this.pendingNodeReadyRebalanceTimers.get(nodeId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.pendingNodeReadyRebalanceTimers.delete(nodeId);
        this.rebalanceTriggeredNodeIds.delete(nodeId);
      }
      return false;
    }

    if (wasReady) {
      logger.debug(
        'Skipping node-ready rebalance trigger: no not-ready to ready transition',
        {
          nodeId,
          status: nodeRow.status || null,
          readyLeaseExpiresAt: nodeRow.ready_lease_expires_at || null,
          operation: cdcEvent?.operation || null,
        },
      );
      return false;
    }

    if (this.rebalanceTriggeredNodeIds.has(nodeId)) {
      logger.info('Skipping node-ready rebalance trigger: already scheduled', {
        nodeId,
      });
      return false;
    }
    this.rebalanceTriggeredNodeIds.add(nodeId);

    if (this.pendingNodeReadyRebalanceTimers.has(nodeId)) {
      return false;
    }

    logger.info('Scheduling node-ready rebalance trigger', {
      nodeId,
      reason: BOOTSTRAP_REBALANCE_REASON.NODE_READY,
      delayMs: this.getNodeReadyRebalanceDelayMs(),
      status: nodeRow.status || null,
      readyLeaseExpiresAt: nodeRow.ready_lease_expires_at || null,
    });

    const timer = setTimeout(() => {
      void this.executeNodeReadyRebalanceTrigger(nodeId);
    }, this.getNodeReadyRebalanceDelayMs());
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    this.pendingNodeReadyRebalanceTimers.set(nodeId, timer);
    return true;
  }

  async executeNodeReadyRebalanceTrigger(nodeId) {
    this.pendingNodeReadyRebalanceTimers.delete(nodeId);
    this.executeNodeReadyRebalance(BOOTSTRAP_REBALANCE_REASON.NODE_READY);
  }

  clearNodeReadyRebalanceState() {
    for (const timer of this.pendingNodeReadyRebalanceTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingNodeReadyRebalanceTimers.clear();
    this.rebalanceTriggeredNodeIds.clear();
  }
}

export {BootstrapNodeReadyRebalanceOwner};
