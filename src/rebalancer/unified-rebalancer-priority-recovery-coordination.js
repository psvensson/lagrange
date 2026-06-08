import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  buildPriorityRecoveryVisibilityRebalanceDecision,
} from './priority-recovery-visibility-decision.js';
import {
  isControlPlanePublicationsWriteLeader,
  CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
} from '../control-plane/control-plane-publications-leadership.js';
import {TABLES} from '../constants/tables.js';
import {COLUMN} from '../constants/columns.js';

const PUBLICATIONS_WRITE_LEADER_DIAG_MSG =
  'DIAG publications write-leader resolution (seed-driven membership)';

const {
  REBALANCE_COORDINATOR_EVENT,
  RECONCILE_REASON,
  TYPEOF,
  UNIFIED_REBALANCER_LITERAL,
  WORKFLOW_STEP,
  getPartitionRowFromCache,
  isCoordinatorOwnedOperationType,
  isPriorityControlPlanePartition,
  isPriorityRecoveryEmergencyPartition,
  isTerminalReplicaOperationRecord,
  resolveTrackedPriorityRecoveryAdmissionPlan,
} = UNIFIED_REBALANCER_SHARED;

const PRIORITY_RECOVERY_COORDINATOR_STEP_PROGRESS_SET = new Set([
  WORKFLOW_STEP.ACTIVE,
  WORKFLOW_STEP.REMOVED,
]);
const PRIORITY_RECOVERY_COORDINATOR_TERMINAL_EVENT_SET = new Set([
  REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
  REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
]);
const PRIORITY_RECOVERY_COORDINATION_CONSTRUCTOR = 'constructor';

class UnifiedRebalancerPriorityRecoveryCoordination {
  bindCoordinatorProgressListeners(coordinator) {
    if (
      !coordinator ||
      typeof coordinator.on !== TYPEOF.FUNCTION ||
      this.isControlPlanePriorityPartition() !== true ||
      this.coordinatorProgressListenerBindings
    ) {
      return;
    }
    const stepChangedListener = (event = {}) =>
      this.handleCoordinatorProgressEvent(
        REBALANCE_COORDINATOR_EVENT.STEP_CHANGED,
        event,
      );
    const operationCompletedListener = (event = {}) =>
      this.handleCoordinatorProgressEvent(
        REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
        event,
      );
    const operationFailedListener = (event = {}) =>
      this.handleCoordinatorProgressEvent(
        REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
        event,
      );
    coordinator.on(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED, stepChangedListener);
    coordinator.on(
      REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
      operationCompletedListener,
    );
    coordinator.on(
      REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
      operationFailedListener,
    );
    this.coordinatorProgressListenerBindings = {
      coordinator,
      stepChangedListener,
      operationCompletedListener,
      operationFailedListener,
    };
  }

  unbindCoordinatorProgressListeners() {
    const bindings = this.coordinatorProgressListenerBindings;
    if (!bindings?.coordinator) {
      this.coordinatorProgressListenerBindings = null;
      return;
    }
    const unsubscribe =
      typeof bindings.coordinator.off === TYPEOF.FUNCTION ?
        bindings.coordinator.off.bind(bindings.coordinator) :
        typeof bindings.coordinator.removeListener === TYPEOF.FUNCTION ?
          bindings.coordinator.removeListener.bind(bindings.coordinator) :
          null;
    if (unsubscribe) {
      unsubscribe(
        REBALANCE_COORDINATOR_EVENT.STEP_CHANGED,
        bindings.stepChangedListener,
      );
      unsubscribe(
        REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
        bindings.operationCompletedListener,
      );
      unsubscribe(
        REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
        bindings.operationFailedListener,
      );
    }
    this.coordinatorProgressListenerBindings = null;
  }

  bindPriorityRecoveryVisibilityCacheListener(
    systemTableCache = this.systemTableCache,
  ) {
    if (
      !systemTableCache ||
      typeof systemTableCache.onCacheChange !== TYPEOF.FUNCTION ||
      this.isControlPlanePriorityPartition() !== true ||
      this.priorityRecoveryVisibilityCacheListener
    ) {
      return;
    }
    this.priorityRecoveryVisibilityCacheListener =
      (tableName, operation, record) => {
        this.handlePriorityRecoveryVisibilityEvent({
          tableName,
          operation,
          data: record,
        });
      };
    systemTableCache.onCacheChange(this.priorityRecoveryVisibilityCacheListener);
  }

  unbindPriorityRecoveryVisibilityCacheListener(
    systemTableCache = this.systemTableCache,
  ) {
    if (
      !this.priorityRecoveryVisibilityCacheListener ||
      !systemTableCache ||
      typeof systemTableCache.offCacheChange !== TYPEOF.FUNCTION
    ) {
      this.priorityRecoveryVisibilityCacheListener = null;
      return;
    }
    systemTableCache.offCacheChange(this.priorityRecoveryVisibilityCacheListener);
    this.priorityRecoveryVisibilityCacheListener = null;
  }

  buildCoordinatorProgressRebalanceDecision(eventName, payload = {}) {
    const operation =
      payload?.operation && typeof payload.operation === TYPEOF.OBJECT ?
        payload.operation :
        {};
    const operationPartitionId = String(
      operation.partitionId ||
        operation.partition_id ||
        operation.entityId ||
        operation.entity_id ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    const normalizedNewStep = String(
      payload?.newStep ||
        payload?.new_step ||
        operation.workflowStep ||
        operation.workflow_step ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toUpperCase();
    const operationPriorityPartition =
      operationPartitionId.length > UNIFIED_REBALANCER_LITERAL.ZERO &&
      isPriorityControlPlanePartition({
        partitionId: operationPartitionId,
        partitionRow: getPartitionRowFromCache(
          this.systemTableCache,
          operationPartitionId,
        ),
      });
    const stepProgress =
      eventName === REBALANCE_COORDINATOR_EVENT.STEP_CHANGED &&
      PRIORITY_RECOVERY_COORDINATOR_STEP_PROGRESS_SET.has(normalizedNewStep);
    const terminalProgress =
      PRIORITY_RECOVERY_COORDINATOR_TERMINAL_EVENT_SET.has(eventName);
    const evidence = {
      isLeader: this.isLeader === true,
      priorityPartition: this.isControlPlanePriorityPartition() === true,
      partitionMatches: operationPartitionId === this.entityId,
      operationPriorityPartition,
      stepProgress,
      terminalProgress,
    };
    return {
      shouldEnqueue:
        evidence.isLeader &&
        evidence.priorityPartition &&
        (evidence.partitionMatches || evidence.operationPriorityPartition) &&
        (evidence.stepProgress || evidence.terminalProgress),
      reconcileReason: RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS,
      evidence,
    };
  }

  handleCoordinatorProgressEvent(eventName, payload = {}) {
    const decision = this.buildCoordinatorProgressRebalanceDecision(
      eventName,
      payload,
    );
    if (decision.shouldEnqueue !== true) {
      return false;
    }
    this.enqueueRebalanceCheck(decision.reconcileReason);
    this.enqueueMembershipPublicationReconcile(decision.reconcileReason);
    return true;
  }

  buildCoordinatorRebindRebalanceDecision(coordinator) {
    const evidence = {
      isLeader: this.isLeader === true,
      priorityPartition: this.isControlPlanePriorityPartition() === true,
      hasCoordinator: !!coordinator,
    };
    return {
      shouldEnqueue:
        evidence.isLeader &&
        evidence.priorityPartition &&
        evidence.hasCoordinator,
      reconcileReason: RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS,
      evidence,
    };
  }

  handleCoordinatorRebindProgress(coordinator) {
    const decision =
      this.buildCoordinatorRebindRebalanceDecision(coordinator);
    if (decision.shouldEnqueue !== true) {
      return false;
    }
    this.enqueueRebalanceCheck(decision.reconcileReason);
    this.enqueueMembershipPublicationReconcile(decision.reconcileReason);
    return true;
  }

  buildPriorityRecoveryVisibilityRebalanceDecision(event = {}, options = {}) {
    return buildPriorityRecoveryVisibilityRebalanceDecision(
      event,
      {
        entityId: this.entityId,
        isLeader: this.isLeader,
        isPriorityPartition: this.isControlPlanePriorityPartition() === true,
        isCoordinatorOwnedOperationType,
        isTerminalReplicaOperationRecord,
      },
      options,
    );
  }

  handlePriorityRecoveryVisibilityEvent(event = {}) {
    const decision = this.buildPriorityRecoveryVisibilityRebalanceDecision(
      event,
    );
    if (decision.shouldEnqueue !== true) {
      return false;
    }
    this.enqueueRebalanceCheck(decision.reconcileReason);
    this.enqueueMembershipPublicationReconcile(decision.reconcileReason);
    return true;
  }

  /**
   * Priority recovery progress must wake the canonical publication owner so
   * durable spread summaries converge from fresh service rows.
   *
   * @param {string} reason
   * @return {boolean}
   * @private
   */
  enqueueMembershipPublicationReconcile(reason) {
    // DIAGNOSTIC (runs on the seed when priority-recovery progresses): does the
    // leadership predicate recognize THIS node as the control_plane_publications
    // write-leader, and via which source? Compares the helper result against the
    // raw Tier-1 (partitions row leader_node_id) and the live rebalancer isLeader.
    // Transition-logged at warn so it lands in bundles.
    try {
      let tier1LeaderNodeId = null;
      try {
        tier1LeaderNodeId =
          this.systemTableCache?.get?.(
            TABLES.PARTITIONS,
            CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
          )?.[COLUMN.LEADER_NODE_ID] || null;
      } catch {
        tier1LeaderNodeId = null;
      }
      const helperResult = isControlPlanePublicationsWriteLeader(
        this.systemTableCache,
        this.nodeId,
      );
      const snapshot =
        `helper=${helperResult} tier1=${tier1LeaderNodeId || 'none'} ` +
        `liveIsLeader=${this.isLeader === true}`;
      if (this.publicationsWriteLeaderDiagSnapshot !== snapshot) {
        this.publicationsWriteLeaderDiagSnapshot = snapshot;
        this.logger?.warn?.(PUBLICATIONS_WRITE_LEADER_DIAG_MSG, {
          nodeId: this.nodeId,
          helperSaysWriteLeader: helperResult,
          tier1PartitionsLeaderNodeId: tier1LeaderNodeId,
          liveRebalancerIsLeader: this.isLeader === true,
        });
      }
    } catch {
      // diagnostic must never affect behavior
    }
    const publicationService =
      this.controlPlaneReadinessService?.membershipPublicationService;
    if (
      !publicationService ||
      typeof publicationService.enqueueClusterMembershipReconcile !==
        TYPEOF.FUNCTION
    ) {
      return false;
    }
    return publicationService.enqueueClusterMembershipReconcile(reason);
  }

  /**
   * Global priority control-plane recovery remains active while the latest
   * publication row still reports spread unsatisfied.
   * @return {boolean}
   * @private
   */
  isGlobalPriorityControlPlaneRecoveryActive() {
    return this.getPriorityRecoveryAdmissionPlan().recoveryActive === true;
  }

  /**
   * Publication and replica-operation partitions own the recovery surfaces
   * the rest of priority convergence depends on. Keep the emergency
   * classification aligned with the coordinator admission contract rather
   * than the broader transport-critical routing classifier.
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  isEmergencyPriorityControlPlanePartition(partitionId) {
    return isPriorityRecoveryEmergencyPartition(partitionId);
  }

  /**
   * Resolve the current priority-recovery admission plan from membership
   * publication state so move-budget reservation follows the same canonical
   * recovery summary as coordinator add admission.
   * @return {Object}
   * @private
   */
  getPriorityRecoveryAdmissionPlan() {
    return resolveTrackedPriorityRecoveryAdmissionPlan({
      tracker: this.priorityRecoveryAdmissionTracker,
      publicationRow: this.getLatestMembershipPublicationRow(),
      nowMs: this.nowFn(),
      staleGraceMs: this.priorityRecoveryActivityStaleGraceMs,
      maxConcurrentAdds: this.maxConcurrentMoves,
      isPriorityPartition: (partitionId) =>
        isPriorityControlPlanePartition({
          partitionId,
        }),
      isEmergencyPriorityPartition: (partitionId) =>
        this.isEmergencyPriorityControlPlanePartition(partitionId),
    });
  }

  /**
   * Priority control-plane partitions participate directly in the global
   * recovery phase tracked from membership publication state.
   * @return {boolean}
   * @private
   */
  isPriorityControlPlaneRecoveryActive() {
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    return this.isGlobalPriorityControlPlaneRecoveryActive();
  }
}

function applyUnifiedRebalancerPriorityRecoveryCoordination(targetClass) {
  const sourcePrototype =
    UnifiedRebalancerPriorityRecoveryCoordination.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === PRIORITY_RECOVERY_COORDINATION_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyUnifiedRebalancerPriorityRecoveryCoordination};
