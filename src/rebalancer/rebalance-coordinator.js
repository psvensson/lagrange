import { REBALANCE_COORDINATOR_SHARED } from './rebalance-coordinator-shared.js';
import { RebalanceCoordinatorSegment5 } from './rebalance-coordinator-segment-5.js';

const {
  CONCURRENT_CREATE_BUDGET_SCOPE,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_QUERY_OPTIONS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WORKLOAD_CLASS,
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  ConfigurationManager,
  ControlPlaneReadinessService,
  DEFAULT_AMPLIFICATION_FACTOR,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DurableWorkflowCoordinator,
  EventEmitter,
  ExecutorOutcomeEmitter,
  INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  LoggingService,
  NUM,
  OPERATION_METADATA_KEY,
  OUTCOME_EVENT_NAME,
  OperationLane,
  OperationType,
  OperationWorkflowOwner,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PRIORITY_RECENT_INTENT_TTL_MS,
  PressureGovernor,
  ProvisioningAdmissionPolicy,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  RECENT_INTENT_TTL_MS,
  RECENT_OPERATION_INTENT_VISIBILITY_STATE,
  REPLICA_ID_SEPARATOR,
  REPLICA_ID_START_INDEX,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  RESERVATION_REASON,
  RESERVATION_STATUS,
  ReplicaOperationField,
  ReplicaOperationRepository,
  SERVICE_TYPE,
  SQL,
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  STORAGE_RESERVATION_READ_QUERY_OPTIONS,
  STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
  SYSTEM_TABLE_NAME,
  StartupRecoveryCoordinator,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TIME_MS,
  TOPOLOGY_GUARD_DEFAULT_PARTITION_TARGET_REPLICA_COUNT,
  TOPOLOGY_GUARD_ERROR_MSG,
  TOPOLOGY_GUARD_REASON,
  TOPOLOGY_GUARD_STATE,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
  assertCritical,
  buildControlPlaneQueryOptions,
  buildControlPlaneWorkloadProfile,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildReplicatedServiceBootstrapTopology,
  buildTimeoutClassification,
  createChildTimeoutBudget,
  createControlPlaneRuntimeBundle,
  createOperationRecord,
  createTopLevelOperationBudget,
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isCriticalTransportControlPlanePartitionTable,
  isPriorityControlPlanePartitionTable,
  isRetryableControlPlaneError,
  readAuthoritativeControlPlaneRows,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  shouldPriorityRecoveryOperationBlockPlanning,
  uuidv4,
} = REBALANCE_COORDINATOR_SHARED;

class RebalanceCoordinator extends RebalanceCoordinatorSegment5 {
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
    if (this.cacheChangeListener &&
        typeof this.systemTableCache?.offCacheChange === 'function') {
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
        'Skipping in-flight operation count during coordinator shutdown',
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
    if (typeof this.workflowOwner?.shutdown === 'function') {
      this.workflowOwner.shutdown();
    }

    this.emit(REBALANCE_COORDINATOR_EVENT.SHUTDOWN);
  }
}
export {RebalanceCoordinator};

