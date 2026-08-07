import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {applyRebalanceCoordinatorLifecycleMethods} from './rebalance-coordinator-lifecycle.js';
import {applyRebalanceCoordinatorOperationReadMethods} from './rebalance-coordinator-operation-read-methods.js';
import {applyRebalanceCoordinatorTopologyGuardMethods} from './rebalance-coordinator-topology-guard-methods.js';
import {applyRebalanceCoordinatorReplicaIdentityMethods} from './rebalance-coordinator-replica-identity-methods.js';
import {applyRebalanceCoordinatorOperationIntentMethods} from './rebalance-coordinator-operation-intent-methods.js';
import {applyRebalanceCoordinatorOwnerDelegationMethods} from './rebalance-coordinator-owner-delegation-methods.js';
import {applyRebalanceCoordinatorOperationCreationMethods} from './rebalance-coordinator-operation-creation.js';
import {applyRebalanceCoordinatorEntitySizeMethods} from './rebalance-coordinator-entity-size-methods.js';
import {applyRebalanceCoordinatorOperationPersistenceCollisionMethods} from './rebalance-coordinator-operation-persistence-collision.js';
import {applyRebalanceCoordinatorPriorityBudgetAdmissionMethods} from './rebalance-coordinator-priority-budget-admission.js';
import {applyRebalanceCoordinatorLedgerInterlockAdmissionMethods} from './rebalance-coordinator-ledger-interlock-admission.js';
import {applyRebalanceCoordinatorConcurrentBudgetGateMethods} from './rebalance-coordinator-concurrent-budget-gate.js';
import {applyRebalanceCoordinatorOwnerFacadeMethods} from './rebalance-coordinator-owner-facade.js';
import {applyRebalanceCoordinatorReservationLifecycleMethods} from './rebalance-coordinator-reservation-lifecycle-methods.js';
import {applyRebalanceCoordinatorRecoveryBudgetBindingMethods} from './rebalance-coordinator-recovery-budget-bindings.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_SKIPPING_IN_FLIGHT_OPERATION_COUNT_DURIN = 'Skipping in-flight operation count during coordinator shutdown';

const {
  CONTROL_PLANE_WORKLOAD_CLASS,
  EventEmitter,
  NUM,
  OUTCOME_EVENT_NAME,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  buildControlPlaneWorkloadProfile,
  classifySystemPartition,
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} = REBALANCE_COORDINATOR_SHARED;

class RebalanceCoordinator extends EventEmitter {
  /**
   * Create a new RebalanceCoordinator instance.
   * @param {Object} options - Configuration options. See
   *   {@link RebalanceCoordinatorLifecycle#initializeCoordinatorState}.
   */
  constructor(options = {}) {
    super();
    this.initializeCoordinatorState(options);
  }

  getLocalRouterPressureDecision(options = {}) {
    const partitionId = String(options.partitionId || '').trim();
    const criticalPressureBypass =
      partitionId.length > 0 &&
      classifySystemPartition({partitionId}).priorityControlPlane;
    const workloadProfile = buildControlPlaneWorkloadProfile(
      criticalPressureBypass ?
        CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY :
        CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_BACKGROUND_VISIBILITY,
    );
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).evaluate({
      workClass: workloadProfile.workClass || (criticalPressureBypass ?
        PRESSURE_WORK_CLASS.CRITICAL :
        PRESSURE_WORK_CLASS.BACKGROUND),
      resourceKeys: workloadProfile.resourceKeys,
    });
  }

  /**
   * Log one replica-operation query failure with severity aligned to whether
   * the control plane requested deferral/retry.
   * @param {Error|Object} error
   * @param {Object} [context={}]
   * @private
   */
  logQueryOperationsFailure(error, context = {}) {
    const participantFailures = Array.isArray(error?.participantFailures) ?
      error.participantFailures
        .filter((entry) => entry && typeof entry === 'object')
        .slice(0, NUM.THREE) :
      [];
    const firstFailedParticipant =
      error?.firstFailedParticipant &&
      typeof error.firstFailedParticipant === 'object' ?
        error.firstFailedParticipant :
        (participantFailures.length > 0 ? participantFailures[0] : null);
    const tableName = typeof error?.tableName === 'string' &&
      error.tableName.length > 0 ?
      error.tableName :
      (typeof firstFailedParticipant?.failedTable === 'string' ?
        firstFailedParticipant.failedTable :
        null);
    const payload = {
      ...context,
      queryDurationMs: Number.isFinite(context?.queryDurationMs) ?
        Math.max(0, Math.floor(context.queryDurationMs)) :
        null,
      rowCount: Number.isFinite(context?.rowCount) ?
        Math.max(0, Math.floor(context.rowCount)) :
        null,
      backpressured:
        typeof context?.backpressured === 'boolean' ?
          context.backpressured :
          (typeof this.isLocalRouterBackpressured === 'function' ?
            this.isLocalRouterBackpressured() :
            false),
      error: error?.message || error?.error || null,
      nodeId: this.nodeId,
      code: getControlPlaneErrorCode(error) || null,
      retryAfterMs: getControlPlaneRetryAfterMs(error),
      tableName,
      participantFailures,
      firstFailedParticipant,
    };
    if (isRetryableControlPlaneError(error)) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED,
        payload,
      );
      return;
    }
    this.logger.error(
      REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED,
      payload,
    );
  }

  /**
   * Get coordinator statistics.
   *
   * @return {Promise<Object>} Statistics object.
   */
  async getStats() {
    const inFlightOps = await this.getInFlightOperations();
    const allOps = await this.getAllOperations();

    const inFlightObservation =
      this.getIncompleteOperationObservation(inFlightOps);

    return {
      ...this.stats,
      inFlightOperations: inFlightOps.length,
      inFlightOperationObservationState: inFlightObservation.state,
      inFlightOperationRetryAfterMs: inFlightObservation.retryAfterMs,
      totalOperations: allOps.length,
    };
  }

  /**
   * Shutdown the coordinator.
   *
   * @return {Promise<void>}
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.initialized = false;
    // Stop the repository's authoritative read-retry / operation-persist-retry
    // loops from re-arming their backoff timers after teardown.
    if (this.repository &&
        typeof this.repository.markShuttingDown === LOCAL_STR_FUNCTION) {
      this.repository.markShuttingDown();
    }
    this.stopTimeoutChecking();

    // Unsubscribe from executor outcome events.
    if (this._boundOutcomeHandler && this.executorOutcomeEmitter) {
      this.executorOutcomeEmitter.removeListener(
        OUTCOME_EVENT_NAME,
        this._boundOutcomeHandler,
      );
      this._boundOutcomeHandler = null;
    }
    this.unbindLateDispatchDeliveryHonoredListener();
    if (this.cacheChangeListener &&
        typeof this.systemTableCache?.offCacheChange === LOCAL_STR_FUNCTION) {
      this.unbindSystemTableCacheListener();
      this.cacheChangeListener = null;
    }
    if (this._boundTerminalOperationIntentPruner) {
      this.unbindTerminalOperationIntentPruner();
      this._boundTerminalOperationIntentPruner = null;
    }

    let inFlightOperationCount = 0;
    try {
      const inFlightOps = await this.queryShutdownIncompleteOperations();
      inFlightOperationCount = inFlightOps.length;
    } catch (error) {
      this.logger.debug(
        LOCAL_STR_SKIPPING_IN_FLIGHT_OPERATION_COUNT_DURIN,
        {
          nodeId: this.nodeId,
          error: error.message,
        },
      );
    }

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
      inFlightOperations: inFlightOperationCount,
    });

    // Shutdown JOINS in-flight work (audit finding 14): bump the ownership
    // fence FIRST so every lane continuation past an await observes a stale
    // generation and stands down, then boundedly await the in-flight owner
    // lanes BEFORE releasing the retry registries — replacing flag-set +
    // map-clear while continuations proceed unguarded.
    let shutdownJoinResult = null;
    if (
      typeof this.workflowOwner?.bumpOperationOwnershipFenceEpoch ===
        LOCAL_STR_FUNCTION
    ) {
      this.workflowOwner.bumpOperationOwnershipFenceEpoch();
    }
    if (
      typeof this.workflowOwner?.joinInFlightOwnerLanes === LOCAL_STR_FUNCTION
    ) {
      shutdownJoinResult = await this.workflowOwner.joinInFlightOwnerLanes({
        timeoutMs: this.shutdownJoinTimeoutMs,
      });
    }

    this.operationsInCreation.clear();
    this.recentOperationIntents.clear();
    if (typeof this.workflowOwner?.shutdown === LOCAL_STR_FUNCTION) {
      this.workflowOwner.shutdown();
    }

    this.emit(REBALANCE_COORDINATOR_EVENT.SHUTDOWN, {
      shutdownJoin: shutdownJoinResult,
    });
  }
}

// Compose coordinator behavior from semantic method-group modules. Each module
// attaches its methods onto the shared RebalanceCoordinator prototype, so cross
// calls via `this.x()` resolve against one object (replacing the former
// segment-N inheritance chain). Application order mirrors the original chain.
applyRebalanceCoordinatorLifecycleMethods(RebalanceCoordinator);
applyRebalanceCoordinatorOperationReadMethods(RebalanceCoordinator);
applyRebalanceCoordinatorTopologyGuardMethods(RebalanceCoordinator);
applyRebalanceCoordinatorReplicaIdentityMethods(RebalanceCoordinator);
applyRebalanceCoordinatorOperationIntentMethods(RebalanceCoordinator);
applyRebalanceCoordinatorOwnerDelegationMethods(RebalanceCoordinator);
applyRebalanceCoordinatorOperationCreationMethods(RebalanceCoordinator);
applyRebalanceCoordinatorEntitySizeMethods(RebalanceCoordinator);
applyRebalanceCoordinatorOperationPersistenceCollisionMethods(
  RebalanceCoordinator,
);
applyRebalanceCoordinatorPriorityBudgetAdmissionMethods(RebalanceCoordinator);
applyRebalanceCoordinatorLedgerInterlockAdmissionMethods(RebalanceCoordinator);
applyRebalanceCoordinatorConcurrentBudgetGateMethods(RebalanceCoordinator);
applyRebalanceCoordinatorOwnerFacadeMethods(RebalanceCoordinator);
applyRebalanceCoordinatorReservationLifecycleMethods(RebalanceCoordinator);
applyRebalanceCoordinatorRecoveryBudgetBindingMethods(RebalanceCoordinator);

export {RebalanceCoordinator};
