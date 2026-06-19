import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {applyRebalanceCoordinatorLifecycleMethods} from './rebalance-coordinator-lifecycle.js';
import {applyRebalanceCoordinatorOperationReadMethods} from './rebalance-coordinator-operation-read-methods.js';
import {applyRebalanceCoordinatorTopologyGuardMethods} from './rebalance-coordinator-topology-guard-methods.js';
import {applyRebalanceCoordinatorOperationIntentMethods} from './rebalance-coordinator-operation-intent-methods.js';
import {applyRebalanceCoordinatorOwnerDelegationMethods} from './rebalance-coordinator-owner-delegation-methods.js';
import {applyRebalanceCoordinatorOperationCreationMethods} from './rebalance-coordinator-operation-creation.js';
import {applyRebalanceCoordinatorPriorityBudgetAdmissionMethods} from './rebalance-coordinator-priority-budget-admission.js';
import {applyRebalanceCoordinatorConcurrentBudgetGateMethods} from './rebalance-coordinator-concurrent-budget-gate.js';
import {applyRebalanceCoordinatorOwnerFacadeMethods} from './rebalance-coordinator-owner-facade.js';
import {applyRebalanceCoordinatorReservationLifecycleMethods} from './rebalance-coordinator-reservation-lifecycle-methods.js';
import {applyRebalanceCoordinatorRecoveryBudgetBindingMethods} from './rebalance-coordinator-recovery-budget-bindings.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_1I9PK = 'Skipping in-flight operation count during coordinator shutdown';

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
      partitionId.length > NUM.ZERO &&
      this.isPriorityControlPlanePartition(partitionId);
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
      allowDegrade: workloadProfile.allowPressureDegrade !== false,
      allowDefer: workloadProfile.allowPressureDefer === true,
      retryAfterMs: workloadProfile.retryAfterMs,
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
        .slice(NUM.ZERO, NUM.THREE) :
      [];
    const firstFailedParticipant =
      error?.firstFailedParticipant &&
      typeof error.firstFailedParticipant === 'object' ?
        error.firstFailedParticipant :
        (participantFailures.length > NUM.ZERO ? participantFailures[NUM.ZERO] : null);
    const tableName = typeof error?.tableName === 'string' &&
      error.tableName.length > NUM.ZERO ?
      error.tableName :
      (typeof firstFailedParticipant?.failedTable === 'string' ?
        firstFailedParticipant.failedTable :
        null);
    const payload = {
      ...context,
      queryDurationMs: Number.isFinite(context?.queryDurationMs) ?
        Math.max(NUM.ZERO, Math.floor(context.queryDurationMs)) :
        null,
      rowCount: Number.isFinite(context?.rowCount) ?
        Math.max(NUM.ZERO, Math.floor(context.rowCount)) :
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

    let inFlightOperationCount = NUM.ZERO;
    try {
      const inFlightOps = await this.queryShutdownIncompleteOperations();
      inFlightOperationCount = inFlightOps.length;
    } catch (error) {
      this.logger.debug(
        LOCAL_STR_1I9PK,
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

    this.operationsInCreation.clear();
    this.recentOperationIntents.clear();
    if (typeof this.workflowOwner?.shutdown === LOCAL_STR_FUNCTION) {
      this.workflowOwner.shutdown();
    }

    this.emit(REBALANCE_COORDINATOR_EVENT.SHUTDOWN);
  }
}

// Compose coordinator behavior from semantic method-group modules. Each module
// attaches its methods onto the shared RebalanceCoordinator prototype, so cross
// calls via `this.x()` resolve against one object (replacing the former
// segment-N inheritance chain). Application order mirrors the original chain.
applyRebalanceCoordinatorLifecycleMethods(RebalanceCoordinator);
applyRebalanceCoordinatorOperationReadMethods(RebalanceCoordinator);
applyRebalanceCoordinatorTopologyGuardMethods(RebalanceCoordinator);
applyRebalanceCoordinatorOperationIntentMethods(RebalanceCoordinator);
applyRebalanceCoordinatorOwnerDelegationMethods(RebalanceCoordinator);
applyRebalanceCoordinatorOperationCreationMethods(RebalanceCoordinator);
applyRebalanceCoordinatorPriorityBudgetAdmissionMethods(RebalanceCoordinator);
applyRebalanceCoordinatorConcurrentBudgetGateMethods(RebalanceCoordinator);
applyRebalanceCoordinatorOwnerFacadeMethods(RebalanceCoordinator);
applyRebalanceCoordinatorReservationLifecycleMethods(RebalanceCoordinator);
applyRebalanceCoordinatorRecoveryBudgetBindingMethods(RebalanceCoordinator);

export {RebalanceCoordinator};
