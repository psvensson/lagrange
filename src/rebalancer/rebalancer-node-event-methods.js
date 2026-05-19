import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';

const {
  EntityType,
  NodeStatus,
  STABILIZATION_RESET_TRIGGER,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_RUNTIME_REASON,
  RECONCILE_REASON,
  ReplicaStatus,
  UNIFIED_REBALANCER_LITERAL,
} = UNIFIED_REBALANCER_SHARED;

const REBALANCER_NODE_EVENT_METHODS = {
  /**
   * Trigger immediate check (called by CDC event handlers).
   * @param {string} reason - Reason for immediate check.
   */
  triggerImmediateCheck(reason) {
    if (!this.isLeader || this.isShuttingDown) {
      return;
    }

    this.logger.info(REBALANCER_LOG_MSG.IMMEDIATE_TRIGGER, {
      entityId: this.entityId,
      entityType: this.entityType,
      reason,
    });

    const reconcileReason = this.mapTriggerReason(reason);
    this.enqueueRebalanceCheck(reconcileReason);
  },

  /**
   * Map a trigger reason string to a typed RECONCILE_REASON constant.
   * @param {string} reason - The trigger reason.
   * @return {string} A RECONCILE_REASON constant.
   * @private
   */
  mapTriggerReason(reason) {
    switch (reason) {
    case REBALANCER_RUNTIME_REASON.NODE_BECAME_READY:
      return RECONCILE_REASON.NODE_BECAME_READY;
    case REBALANCER_RUNTIME_REASON.NODE_LEFT_READY:
      return RECONCILE_REASON.NODE_LEFT_READY;
    case REBALANCER_RUNTIME_REASON.NODE_FAILED:
      return RECONCILE_REASON.NODE_FAILED;
    default:
      return RECONCILE_REASON.PERIODIC_CHECK;
    }
  },

  /**
   * Reconcile callback for the rebalance check queue.
   * Cancels any pending scheduled check and runs checkRebalance.
   * @param {Array<string>} _reasons - Accumulated reason codes.
   * @private
   */
  async reconcileRebalanceCheck(_reasons) {
    this.cancelScheduledCheck();
    this.cancelStabilizationTimer();
    await this.checkRebalance();
  },

  /**
   * Handle node state change notification from CDC.
   * Called by CDCIntegrationService when a node's state changes.
   * Emits 'nodeStateChange' event and optionally 'rebalanceNeeded' event.
   * @param {string} nodeId - The node ID.
   * @param {string} oldState - The previous state.
   * @param {string} newState - The new state.
   */
  onNodeStateChange(nodeId, oldState, newState) {
    // Always emit nodeStateChange event for observability
    this.emit(REBALANCER_EVENT.NODE_STATE_CHANGE, {
      nodeId,
      oldState,
      newState,
      timestamp: Date.now(),
    });

    // Non-leaders still emit events but don't trigger rebalancing
    if (!this.isLeader) {
      return;
    }

    this.logger.debug(REBALANCER_LOG_MSG.NODE_STATE_CHANGE, {
      entityId: this.entityId,
      nodeId,
      oldState,
      newState,
    });

    const rebalanceDecision = this.resolveNodeStateChangeRebalanceDecision(
      oldState,
      newState,
    );
    if (rebalanceDecision.needed) {
      // Record state change to reset stabilization timer
      if (rebalanceDecision.stabilizationTrigger) {
        this.recordStateChange(rebalanceDecision.stabilizationTrigger);
      }

      // Emit rebalanceNeeded event for observability
      this.emit(REBALANCER_EVENT.REBALANCE_NEEDED, {
        nodeId,
        oldState,
        newState,
        reason: rebalanceDecision.reason,
        timestamp: Date.now(),
      });

      this.triggerImmediateCheck(rebalanceDecision.reason);
    }
  },

  /**
   * Resolve one node-state-change rebalance decision.
   * @param {string} oldState
   * @param {string} newState
   * @return {{
   *   needed: boolean,
   *   reason: string|null,
   *   stabilizationTrigger: string|null,
   * }}
   * @private
   */
  resolveNodeStateChangeRebalanceDecision(oldState, newState) {
    if (newState === NodeStatus.FAILED) {
      return {
        needed: true,
        reason: REBALANCER_RUNTIME_REASON.NODE_FAILED,
        stabilizationTrigger: STABILIZATION_RESET_TRIGGER.NODE_FAILED,
      };
    } else if (
      newState === NodeStatus.ACTIVE &&
      oldState !== NodeStatus.ACTIVE
    ) {
      return {
        needed: true,
        reason: REBALANCER_RUNTIME_REASON.NODE_BECAME_READY,
        stabilizationTrigger: STABILIZATION_RESET_TRIGGER.NODE_JOINED,
      };
    } else if (
      oldState === NodeStatus.ACTIVE &&
      newState !== NodeStatus.ACTIVE
    ) {
      return {
        needed: true,
        reason: REBALANCER_RUNTIME_REASON.NODE_LEFT_READY,
        stabilizationTrigger: STABILIZATION_RESET_TRIGGER.NODE_LEFT,
      };
    }
    return {
      needed: false,
      reason: null,
      stabilizationTrigger: null,
    };
  },

  /**
   * Check if a CDC event is critical.
   * @param {Object} event - CDC event.
   * @return {boolean} True if event is critical.
   */
  isCriticalCDCEvent(event) {
    if (
      this.buildPriorityRecoveryVisibilityRebalanceDecision(
        event,
        {requireLeader: false},
      ).visibilityProgress === true
    ) {
      return true;
    }

    // Node failure is critical
    if (
      event.tableName === UNIFIED_REBALANCER_LITERAL.NODES &&
      event.operation === UNIFIED_REBALANCER_LITERAL.UPDATE &&
      event.data?.status === NodeStatus.FAILED
    ) {
      return this.affectsMyReplicas(event);
    }

    // Service failure is critical
    if (
      event.tableName === UNIFIED_REBALANCER_LITERAL.SERVICES &&
      event.operation === UNIFIED_REBALANCER_LITERAL.UPDATE &&
      event.data?.status === ReplicaStatus.FAILED
    ) {
      return (
        event.data?.partition_id === this.entityId ||
        event.data?.group_id === this.entityId ||
        (this.entityType === EntityType.RUNTIME_SERVICE &&
          event.data?.service_id === this.entityId)
      );
    }

    return false;
  },

  /**
   * Check if an event affects this entity's replicas.
   * @param {Object} event - CDC event.
   * @return {boolean} True if event affects our replicas.
   */
  affectsMyReplicas(event) {
    const replicas = this.getCurrentReplicas();
    const nodeId = event.data?.node_id;

    if (!nodeId) {
      return false;
    }

    // Filter out replicas without node_id (defensive check)
    return replicas.some((r) => r && r.node_id === nodeId);
  },
};

export {REBALANCER_NODE_EVENT_METHODS};
