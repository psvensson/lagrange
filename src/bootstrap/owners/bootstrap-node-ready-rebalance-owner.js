import {
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_NODE_READY_REBALANCE_TABLES,
  BOOTSTRAP_REBALANCE_REASON,
} from '../bootstrap-constants.js';
import {
  compareNodeHeartbeatWatermarks,
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
    this.latestObservedNodeRows = new Map();
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

  getLocalNodeId() {
    return this.delegates.getLocalNodeId?.() || null;
  }

  isBootstrapNodeReadyRebalanceActive() {
    return this.delegates.isBootstrapNodeReadyRebalanceActive?.() !== false;
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
    const localNodeId = this.getLocalNodeId();
    if (!nodeId) {
      logger.info('Skipping node-ready rebalance trigger: missing node_id', {
        operation: cdcEvent?.operation || null,
      });
      return false;
    }

    if (this.isBootstrapNodeReadyRebalanceActive() !== true) {
      logger.debug(
        'Skipping node-ready rebalance trigger: bootstrap node_ready lane is inactive',
        {
          readyNodeId: nodeId,
          localNodeId,
          operation: cdcEvent?.operation || null,
        },
      );
      return false;
    }

    if (nodeId === localNodeId) {
      logger.debug(
        'Skipping node-ready rebalance trigger: local node readiness is runtime-owned',
        {
          readyNodeId: nodeId,
          localNodeId,
          operation: cdcEvent?.operation || null,
        },
      );
      return false;
    }

    const now = Date.now();
    const observedNodeRow =
      this.latestObservedNodeRows.get(nodeId) || null;
    const effectivePreviousRow =
      this.resolveMostRecentNodeRow(previousRow, observedNodeRow);
    const previousRowWasReady = isNodeRecordReady(previousRow, {now});
    const incomingRowIsReady = isNodeRecordReady(nodeRow, {now});
    const incomingLastHeartbeat = Number(
      nodeRow.last_heartbeat ??
      nodeRow.lastHeartbeat ??
      NaN,
    );
    const incomingLooksOlderThanObserved =
      effectivePreviousRow &&
      compareNodeHeartbeatWatermarks(
        effectivePreviousRow,
        nodeRow,
      ) < NUM.ZERO;
    const shouldSuppressObservedRegression =
      incomingLooksOlderThanObserved &&
      (
        incomingRowIsReady ||
        !previousRowWasReady ||
        Number.isFinite(incomingLastHeartbeat)
      );

    if (shouldSuppressObservedRegression) {
      logger.debug(
        'Skipping node-ready rebalance trigger: stale node liveness regression',
        {
          readyNodeId: nodeId,
          localNodeId,
          operation: cdcEvent?.operation || null,
          previousReadyLeaseExpiresAt:
            effectivePreviousRow.ready_lease_expires_at ??
            effectivePreviousRow.readyLeaseExpiresAt ??
            null,
          incomingReadyLeaseExpiresAt:
            nodeRow.ready_lease_expires_at ??
            nodeRow.readyLeaseExpiresAt ??
            null,
          previousLastHeartbeat:
            effectivePreviousRow.last_heartbeat ??
            effectivePreviousRow.lastHeartbeat ??
            null,
          incomingLastHeartbeat:
            nodeRow.last_heartbeat ??
            nodeRow.lastHeartbeat ??
            null,
        },
      );
      return false;
    }

    const nextObservedRow =
      incomingLooksOlderThanObserved ?
        nodeRow :
        this.resolveMostRecentNodeRow(effectivePreviousRow, nodeRow);
    this.latestObservedNodeRows.set(nodeId, nextObservedRow);

    if (isNodeHeartbeatWatermarkRegression(previousRow, incomingRow)) {
      logger.debug(
        'Skipping node-ready rebalance trigger: stale node liveness regression',
        {
          readyNodeId: nodeId,
          localNodeId,
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
    const isReady = isNodeRecordReady(nextObservedRow, {now});
    const wasReady = isNodeRecordReady(effectivePreviousRow, {now});

    if (!isReady) {
      logger.info('Skipping node-ready rebalance trigger: node not ready', {
        readyNodeId: nodeId,
        localNodeId,
        status: nextObservedRow.status || null,
        readyLeaseExpiresAt: nextObservedRow.ready_lease_expires_at || null,
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
          readyNodeId: nodeId,
          localNodeId,
          status: nextObservedRow.status || null,
          readyLeaseExpiresAt: nextObservedRow.ready_lease_expires_at || null,
          operation: cdcEvent?.operation || null,
        },
      );
      return false;
    }

    if (this.rebalanceTriggeredNodeIds.has(nodeId)) {
      logger.info('Skipping node-ready rebalance trigger: already scheduled', {
        readyNodeId: nodeId,
        localNodeId,
      });
      return false;
    }
    this.rebalanceTriggeredNodeIds.add(nodeId);

    if (this.pendingNodeReadyRebalanceTimers.has(nodeId)) {
      return false;
    }

    logger.info('Scheduling node-ready rebalance trigger', {
      readyNodeId: nodeId,
      localNodeId,
      reason: BOOTSTRAP_REBALANCE_REASON.NODE_READY,
      delayMs: this.getNodeReadyRebalanceDelayMs(),
      status: nextObservedRow.status || null,
      readyLeaseExpiresAt: nextObservedRow.ready_lease_expires_at || null,
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
    this.rebalanceTriggeredNodeIds.delete(nodeId);
    this.executeNodeReadyRebalance(BOOTSTRAP_REBALANCE_REASON.NODE_READY);
  }

  clearNodeReadyRebalanceState() {
    for (const timer of this.pendingNodeReadyRebalanceTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingNodeReadyRebalanceTimers.clear();
    this.rebalanceTriggeredNodeIds.clear();
    this.latestObservedNodeRows.clear();
  }

  resolveMostRecentNodeRow(primaryRow, fallbackRow) {
    if (!primaryRow) {
      return fallbackRow || null;
    }
    if (!fallbackRow) {
      return primaryRow;
    }

    const comparison = compareNodeHeartbeatWatermarks(
      primaryRow,
      fallbackRow,
    );
    if (comparison > NUM.ZERO) {
      return fallbackRow;
    }
    if (comparison < NUM.ZERO) {
      return primaryRow;
    }

    return {
      ...fallbackRow,
      ...primaryRow,
    };
  }
}

export {BootstrapNodeReadyRebalanceOwner};
