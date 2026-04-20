import { UNIFIED_REBALANCER_SHARED } from './unified-rebalancer-shared.js';
import { UnifiedRebalancerSegment5 } from './unified-rebalancer-segment-5.js';

const {
  CLUSTER_READINESS_TIMEOUT_MS,
  COLUMN,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WORKLOAD_CLASS,
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  CRITICAL_SYSTEM_ENDPOINT_VISIBILITY_AUTHORITATIVE_READ,
  CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON,
  ConfigurationManager,
  ControlPlaneReadinessService,
  DEFAULT_MESSAGE_GROUP_POLICY,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DEFAULT_TABLE_POLICY,
  ENDPOINT_STATUS,
  ENDPOINT_SYNC_HEALTH,
  EntityType,
  EventEmitter,
  LIFECYCLE_PHASE,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  META_SERVICE_ID,
  MovePlanner,
  MoveType,
  NUM,
  NodeStatus,
  OperationType,
  OwnerKeyReconcileQueue,
  PRESSURE_WORK_CLASS,
  PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS,
  PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT,
  PressureGovernor,
  RAFT_ROLE,
  READINESS_SKIP_DETAIL,
  REBALANCER_BUDGET_READ_OPTIONS,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_ERROR_MSG,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_TYPE,
  REBALANCER_NODE_STATUS,
  REBALANCER_QUEUE_NAME,
  REBALANCER_RUNTIME_REASON,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
  REBALANCER_TRIGGER,
  RECONCILE_REASON,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaStatus,
  SERVICE_STATUS,
  SQL_BUDGET,
  STABILIZATION_RESET_TRIGGER,
  STATE,
  SYSTEM_TABLE_NAME,
  StartupRecoveryCoordinator,
  StoragePressureBehavior,
  TABLES,
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SQL_CLAUSE,
  TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE,
  TRANSPORT_TYPE,
  TYPEOF,
  TriggerType,
  UNIFIED_REBALANCER_LITERAL,
  WORKFLOW_STEP,
  adjustToOddCount,
  assertCritical,
  buildControlPlaneWorkloadProfile,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildPublicationRecoveryGateSnapshot,
  createControlPlaneRuntimeBundle,
  getControlPlaneRetryAfterMs,
  getLocalControlPlaneMutationReadinessBlocker,
  getNextOddCount,
  getPartitionRowFromCache,
  getPreviousOddCount,
  hasPriorityRecoverySpreadGap,
  isBackgroundWorkLifecycleReadySnapshot,
  isCoordinatorOwnedOperationType,
  isCriticalTransportControlPlanePartitionTable,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeReadyWithConnection,
  isNodeReadyWithTransport,
  isNodeRecordReady,
  isOddReplicaCount,
  isPriorityControlPlanePartition,
  isReplaceRemoveDispatchPhase,
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  isRetryableControlPlaneError,
  isSystemTablePartition,
  isTerminalReplicaOperationSemanticPhase,
  isTerminalStep,
  isValidWorkflowStep,
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeReplicaOperationRecord,
  normalizeServiceEndpointRow,
  normalizeServiceRow,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveReplicaOperationSemanticPhase,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  shouldPriorityRecoveryOperationBlockPlanning,
  wasNodeRecordReadyWhenWritten,
} = UNIFIED_REBALANCER_SHARED;

class UnifiedRebalancer extends UnifiedRebalancerSegment5 {
  async getStatsAsync() {
    const stats = this.getStats();

    // Include coordinator stats if available
    if (this.rebalanceCoordinator && this.rebalanceCoordinator.getStats) {
      const coordStats = await this.rebalanceCoordinator.getStats();
      stats.coordinatorStats = {
        inFlightOperations: coordStats.inFlightOperations,
        operationsCreated: coordStats.operationsCreated,
        operationsCompleted: coordStats.operationsCompleted,
        operationsFailed: coordStats.operationsFailed,
      };
    }

    return stats;
  }

  /**
   * Shutdown the rebalancer.
   */
  shutdown() {
    this.isShuttingDown = true;
    this.isLeader = false;
    this.cancelScheduledCheck();
    this.rebalanceCheckQueue.shutdown();
    this.cancelStabilizationTimer();
    this.lastStateChangeTime = null;
    this.initialized = false;

    this.logger.info(REBALANCER_LOG_MSG.SHUTDOWN, {
      entityId: this.entityId,
      entityType: this.entityType,
    });
  }
}
export {
  UnifiedRebalancer,
  EntityType,
  TriggerType,
  MoveType,
  ReplicaStatus,
  NodeStatus,
  DEFAULT_TABLE_POLICY,
  DEFAULT_MESSAGE_GROUP_POLICY,
  isOddReplicaCount,
  adjustToOddCount,
  getNextOddCount,
  getPreviousOddCount,
};

