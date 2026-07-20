import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {ReplicaDispatchServiceLifecycle} from './replica-dispatch-service-lifecycle.js';
import {
  DISPATCH_PENDING_WORKFLOW_STEPS,
  RUNTIME_TARGET_PROGRESS_WAKE_WORKFLOW_STEPS,
  isActiveReplaceSourceRemovalPhase,
} from '../rebalancer/replica-operation-step-policy.js';
import {
  CONTROL_PLANE_OPERATION_HANDOFF_MODE,
} from './control-plane-constants.js';
import {UNIFIED_SERVICE_TYPE} from '../constants/index.js';
import {
  getDispatchRetryRowOperationIds,
  getDispatchRetryRowPartitionIds,
  getPriorityRecoveryDispatchRetryBlockedOperationIds,
  getPriorityRecoveryDispatchRetryBlockedPartitionIds,
  mergeDispatchRetryRowsByOperationId,
} from './replica-dispatch-priority-recovery-retry-evidence.js';

const {
  ControlPlaneField,
  DISPATCH_LOG_MSG,
  OperationType,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  SYSTEM_TABLE_NAME,
  WORKFLOW_STEP,
  classifySystemPartition,
  isCoordinatorOwnedOperationType,
  shouldUseAuthoritativePriorityRecoveryRediscovery,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const DISPATCH_REPLAY_READY_NODE_PHASE = Object.freeze({
  INITIAL_TARGET_DISPATCH: 'initial_target_dispatch',
  CREATE_TARGET_REARM: 'create_target_rearm',
  ACTIVE_REPLACE_SOURCE_REMOVAL: 'active_replace_source_removal',
  NOT_REPLAYABLE: 'not_replayable',
});
const RUNTIME_TARGET_PROGRESS_WAKE_OPERATION_TYPES = Object.freeze(
  new Set([
    OperationType.ADD,
    OperationType.REPLACE,
  ]),
);

class ReplicaDispatchReplayReadiness extends ReplicaDispatchServiceLifecycle {
  /**
   * Retry dispatches for operations targeting a ready node.
   * Re-enters the canonical per-operation queue so ready-node retries cannot
   * create a second inline dispatch owner path.
   * @param {string} nodeId - Ready node ID.
   * @return {Promise<void>}
   * @private
   */
  async retryPendingDispatchesForNode(nodeId, options = {}) {
    if (!nodeId || this.retryInFlightNodes.has(nodeId)) {
      return;
    }

    this.retryInFlightNodes.add(nodeId);
    try {
      const dispatchRows = await this.getDispatchRetryRowsForNode(nodeId);
      if (dispatchRows.length === 0) {
        return;
      }

      this.logger.info(DISPATCH_LOG_MSG.RETRY_PENDING_READY_NODE, {
        nodeId,
        pendingCount: dispatchRows.length,
      });

      for (const row of dispatchRows) {
        if (
          !row?.operation_id ||
          this.isBootstrapTopologyDispatchDeferred(row)
        ) {
          continue;
        }
        if (!this.isReplicaOperationLocallyOwned(row)) {
          await this.sendDirectDispatchWakeup(this.buildOperationFromRow(row));
          continue;
        }
        this.operationDispatchQueue.enqueue(
          row.operation_id,
          RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
          {
            row,
            readyNodeId: nodeId,
            readyNodeRow:
              options?.readyNodeRow &&
              typeof options.readyNodeRow === 'object' ?
                {...options.readyNodeRow} :
                null,
          },
        );
      }
    } finally {
      this.retryInFlightNodes.delete(nodeId);
    }
  }

  /**
   * Resolve the node that must be ready for one dispatch replay.
   * REPLACE operations in ACTIVE replay source removal against the source
   * node, while initial dispatch phases still target the replacement node.
   *
   * @param {Object} operation
   * @return {string|null}
   * @private
   */
  resolveDispatchReplayNodeId(operation) {
    const replayNodeIds = this.resolveDispatchReplayNodeIds(operation);
    return replayNodeIds[0] || null;
  }

  /**
   * Resolve all ready-node triggers that should re-enter one operation.
   * Initial dispatch follows the target node. ACTIVE REPLACE source removal is
   * target-owned, but source readiness is the transport precondition for the
   * removal request, so either node can supply the wake-up.
   *
   * @param {Object} operation
   * @return {string[]}
   * @private
   */
  resolveDispatchReplayNodeIds(operation) {
    const evidence = this.buildDispatchReplayReadyNodeEvidence(operation);
    const nodeIds = [
      ...evidence.sourceNodeIds,
      ...evidence.ownerNodeIds,
      ...evidence.targetNodeIds,
    ];
    return [...new Set(nodeIds)].filter((nodeId) => {
      return typeof nodeId === 'string' && nodeId.length > 0;
    });
  }

  /**
   * @param {Object} operation
   * @return {Object}
   * @private
   */
  buildDispatchReplayReadyNodeEvidence(operation) {
    if (!operation || typeof operation !== 'object') {
      return Object.freeze({
        phase: DISPATCH_REPLAY_READY_NODE_PHASE.NOT_REPLAYABLE,
        sourceNodeIds: Object.freeze([]),
        ownerNodeIds: Object.freeze([]),
        targetNodeIds: Object.freeze([]),
      });
    }
    const workflowStep = operation.workflow_step;
    const targetNodeId = operation.target_node_id || null;
    const ownerNodeId = this.resolveReplicaOperationOwnerNodeId(operation);
    if (DISPATCH_PENDING_WORKFLOW_STEPS.has(workflowStep)) {
      return Object.freeze({
        phase: DISPATCH_REPLAY_READY_NODE_PHASE.INITIAL_TARGET_DISPATCH,
        sourceNodeIds: Object.freeze([]),
        ownerNodeIds: Object.freeze([]),
        targetNodeIds: Object.freeze([targetNodeId]),
      });
    }
    if (this.isDispatchReplayCreateTargetRearmOperation(operation)) {
      return Object.freeze({
        phase: DISPATCH_REPLAY_READY_NODE_PHASE.CREATE_TARGET_REARM,
        sourceNodeIds: Object.freeze([]),
        ownerNodeIds: Object.freeze([]),
        targetNodeIds: Object.freeze([targetNodeId]),
      });
    }
    if (
      operation.type === OperationType.REPLACE &&
      workflowStep === WORKFLOW_STEP.ACTIVE
    ) {
      return Object.freeze({
        phase: DISPATCH_REPLAY_READY_NODE_PHASE.ACTIVE_REPLACE_SOURCE_REMOVAL,
        sourceNodeIds: Object.freeze([operation.source_node_id || null]),
        ownerNodeIds: Object.freeze([ownerNodeId]),
        targetNodeIds: Object.freeze([]),
      });
    }
    return Object.freeze({
      phase: DISPATCH_REPLAY_READY_NODE_PHASE.NOT_REPLAYABLE,
      sourceNodeIds: Object.freeze([]),
      ownerNodeIds: Object.freeze([]),
      targetNodeIds: Object.freeze([]),
    });
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isDispatchReplayCreateTargetRearmOperation(operation) {
    return (
      classifySystemPartition({partitionId: operation?.partition_id}).systemTable &&
      operation.workflow_step === WORKFLOW_STEP.CREATING &&
      (
        operation.type === OperationType.ADD ||
        operation.type === OperationType.REPLACE
      )
    );
  }

  /**
   * Target executor completion wakes are progress signals, not permission to
   * make every non-system SENDING or CREATING operation generally replayable.
   * Admit only the runtime create-side shape whose source owner can reconcile
   * the exact services row through its canonical workflow lane. SENDING is
   * included because the target can publish ACTIVE before the in-flight source
   * dispatch owner has committed its subsequent CREATING transition.
   *
   * @param {Object} operation
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  isRuntimeTargetProgressWakeOperation(operation, context = {}) {
    return (
      context?.[ControlPlaneField.HANDOFF_MODE] ===
        CONTROL_PLANE_OPERATION_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME &&
      this.isRuntimeTargetProgressWakeRow(operation)
    );
  }

  /**
   * The row shape of the canonical runtime target-progress wake, independent
   * of HOW the wake evidence arrived. The delivered target-executor-outcome
   * handoff is the primary evidence; the deferred-retry lane admits the same
   * row shape when that handoff is lost (its budget stopped without reaching
   * the source), because the owner lane it routes into terminates only from
   * exact-target ACTIVE services proof either way.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isRuntimeTargetProgressWakeRow(operation) {
    const partitionClassification = classifySystemPartition({
      partitionId: operation?.partition_id,
    });
    return [
      operation?.entity_type === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      RUNTIME_TARGET_PROGRESS_WAKE_OPERATION_TYPES.has(operation?.type),
      RUNTIME_TARGET_PROGRESS_WAKE_WORKFLOW_STEPS.has(
        operation?.workflow_step,
      ),
      partitionClassification.systemTable !== true,
    ].every(Boolean);
  }

  /**
   * @param {Object} operation
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  shouldExecuteOperationFromDispatchReplay(operation, context = {}) {
    if (!operation || typeof operation !== 'object') {
      return false;
    }
    if (this.isBootstrapTopologyDispatchDeferred(operation)) {
      return false;
    }
    return (
      this.isDispatchReplayCreateTargetRearmOperation(operation) ||
      this.isRuntimeTargetProgressWakeOperation(operation, context) ||
      (
        operation.type === OperationType.REPLACE &&
        operation.workflow_step === WORKFLOW_STEP.ACTIVE
      )
    );
  }

  /**
   * @param {Object} operation
   * @param {string} nodeId
   * @return {boolean}
   * @private
   */
  matchesDispatchReplayReadyNode(operation, nodeId) {
    if (typeof nodeId !== 'string' || nodeId.length === 0) {
      return false;
    }
    return this.resolveDispatchReplayNodeIds(operation).includes(nodeId);
  }

  /**
   * Determine whether one row remains replayable through the dispatch queue.
   * PENDING/SENDING rows replay initial dispatch, CREATING system-table rows
   * re-arm target creation, and ACTIVE REPLACE rows replay source removal on
   * the canonical owner.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isDispatchReplayableOperationRow(operation) {
    if (!operation || typeof operation !== 'object') {
      return false;
    }
    if (DISPATCH_PENDING_WORKFLOW_STEPS.has(operation.workflow_step)) {
      return true;
    }
    if (this.isDispatchReplayCreateTargetRearmOperation(operation)) {
      return true;
    }
    return isActiveReplaceSourceRemovalPhase(
      operation.type,
      operation.workflow_step,
    );
  }

  /**
   * Read dispatch-retry replica_operations for one target node.
   * Uses SystemTableCache first, then falls back to the authoritative
   * repository owner path when unresolved priority recovery indicates cache
   * visibility may be lagging.
   * @param {string} nodeId - Target node ID.
   * @return {Promise<Array<Object>>} Dispatchable operation rows.
   * @private
   */
  async getDispatchRetryRowsForNode(nodeId) {
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (
      membershipPublicationService &&
      typeof membershipPublicationService.getDispatchRetryRowsForNode ===
        'function'
    ) {
      try {
        const dispatchRows =
          await membershipPublicationService.getDispatchRetryRowsForNode(
            nodeId,
          );
        return this.mergeAuthoritativePriorityRecoveryDispatchRowsForNode(
          nodeId,
          Array.isArray(dispatchRows) ? dispatchRows : [],
        );
      } catch (error) {
        this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_LOOKUP_FAILED, {
          nodeId,
          error: error?.message || String(error),
          path: REPLICA_DISPATCH_SERVICE_LITERAL.MEMBERSHIP_PUBLICATION_OWNER_DISPATCH_RETRY,
        });
      }
    }

    const cacheRows =
      this.replicaOperationsOwner &&
      typeof this.replicaOperationsOwner.listReplicaOperationsFromCache ===
        'function' ?
        (await this.replicaOperationsOwner.listReplicaOperationsFromCache())
          .rows || [] :
        this.getSystemTableRowsFromCache(
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        );
    const dispatchRows = cacheRows.filter((row) => {
      return (
        isCoordinatorOwnedOperationType(row?.type) &&
        this.matchesDispatchReplayReadyNode(row, nodeId) &&
        this.isDispatchReplayableOperationRow(row)
      );
    });

    return this.mergeAuthoritativePriorityRecoveryDispatchRowsForNode(
      nodeId,
      dispatchRows,
    );
  }

  async mergeAuthoritativePriorityRecoveryDispatchRowsForNode(
    nodeId,
    dispatchRows,
  ) {
    const coverage =
      await this.resolvePriorityRecoveryDispatchRetryCacheCoverage(
        nodeId,
        dispatchRows,
      );
    if (
      !(await this.shouldUseAuthoritativePriorityRecoveryRediscovery(
        nodeId,
        {
          cacheVisible: coverage.cacheVisible,
          publicationConvergence: coverage.publicationConvergence,
        },
      ))
    ) {
      return dispatchRows;
    }
    return mergeDispatchRetryRowsByOperationId(
      await this.getAuthoritativeDispatchRetryRowsForNode(nodeId),
      dispatchRows,
    );
  }

  async hasCompletePriorityRecoveryDispatchRetryCacheCoverage(
    nodeId,
    dispatchRows,
  ) {
    return (
      await this.resolvePriorityRecoveryDispatchRetryCacheCoverage(
        nodeId,
        dispatchRows,
      )
    ).cacheVisible;
  }

  async resolvePriorityRecoveryDispatchRetryCacheCoverage(
    nodeId,
    dispatchRows,
  ) {
    const readinessService = this.controlPlaneReadinessService;
    const canResolveCoverage =
      Array.isArray(dispatchRows) &&
      dispatchRows.length > 0 &&
      readinessService &&
      typeof readinessService === 'object';
    const publicationConvergence = canResolveCoverage ?
      await this.resolvePriorityRecoveryPublicationConvergence(
        readinessService,
        nodeId,
      ) :
      null;
    const blockedPartitionIds = canResolveCoverage ?
      getPriorityRecoveryDispatchRetryBlockedPartitionIds(
        publicationConvergence,
      ) :
      [];
    const blockedOperationIds = canResolveCoverage ?
      getPriorityRecoveryDispatchRetryBlockedOperationIds(
        publicationConvergence,
      ) :
      [];
    const dispatchPartitionIds = getDispatchRetryRowPartitionIds(
      dispatchRows,
    );
    const dispatchOperationIds = getDispatchRetryRowOperationIds(
      dispatchRows,
    );
    const partitionCoverageComplete =
      blockedPartitionIds.length === 0 ||
      blockedPartitionIds.every((partitionId) =>
        dispatchPartitionIds.has(partitionId),
      );
    const operationCoverageComplete =
      blockedOperationIds.length === 0 ||
      blockedOperationIds.every((operationId) =>
        dispatchOperationIds.has(operationId),
      );
    return {
      cacheVisible:
        canResolveCoverage &&
        partitionCoverageComplete &&
        operationCoverageComplete,
      publicationConvergence,
    };
  }

  /**
   * Compatibility alias for older tests/callers. Ready-node retry now
   * re-enters both PENDING and SENDING rows, but the historical method name
   * is kept to avoid a second compatibility seam.
   *
   * @param {string} nodeId
   * @return {Promise<Array<Object>>}
   */
  async getPendingReplicaOpsForNode(nodeId) {
    return this.getDispatchRetryRowsForNode(nodeId);
  }

  /**
   * Decide whether ready-node retry should bypass cache-only rediscovery for
   * unresolved priority control-plane recovery.
   * @param {string} nodeId
   * @return {Promise<boolean>}
   * @private
   */
  async shouldUseAuthoritativePriorityRecoveryRediscovery(
    nodeId,
    options = {},
  ) {
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService || typeof readinessService !== 'object') {
      return false;
    }

    try {
      const publicationConvergence =
        options?.publicationConvergence &&
        typeof options.publicationConvergence === 'object' ?
          options.publicationConvergence :
          await this.resolvePriorityRecoveryPublicationConvergence(
            readinessService,
            nodeId,
          );
      return shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId, {
        cacheVisible: options?.cacheVisible === true,
        publicationConvergence,
      });
    } catch (error) {
      this.logger.warn(DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_REFRESH_FAILED, {
        nodeId,
        error: error?.message || String(error),
      });
      return false;
    }
  }

  /**
   * Resolve one publication-convergence snapshot for priority-recovery
   * rediscovery.
   * @param {Object} readinessService
   * @param {string} nodeId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolvePriorityRecoveryPublicationConvergence(
    readinessService,
    nodeId,
  ) {
    if (
      typeof readinessService.getMembershipPublicationDiagnosticsSync ===
      'function'
    ) {
      const syncDiagnostics =
        readinessService.getMembershipPublicationDiagnosticsSync(
          nodeId,
          Date.now(),
        );
      if (syncDiagnostics) {
        return syncDiagnostics;
      }
    }
    if (
      typeof readinessService.getMembershipPublicationDiagnostics ===
      'function'
    ) {
      return readinessService.getMembershipPublicationDiagnostics(
        nodeId,
        Date.now(),
      );
    }
    return null;
  }

  /**
   * Read dispatch-retry operations through the canonical repository owner path
   * when cache coverage is missing under priority recovery.
   * @param {string} nodeId
   * @return {Promise<Array<Object>>}
   * @private
   */
  async getAuthoritativeDispatchRetryRowsForNode(nodeId) {
    const repository = this.rebalanceCoordinator?.repository || null;
    if (
      !repository ||
      typeof repository.queryIncompleteOperations !== 'function'
    ) {
      return [];
    }

    try {
      const operations = await repository.queryIncompleteOperations({
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      if (!Array.isArray(operations) || operations.length === 0) {
        return [];
      }

      return operations
        .filter((operation) => {
          const operationRow = this.buildOperationRowFromCoordinator(operation);
          return (
            isCoordinatorOwnedOperationType(operation?.type) &&
            this.matchesDispatchReplayReadyNode(operationRow, nodeId) &&
            this.isDispatchReplayableOperationRow(operationRow)
          );
        })
        .map((operation) => this.buildOperationRowFromCoordinator(operation));
    } catch (error) {
      this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_LOOKUP_FAILED, {
        nodeId,
        error: error?.message || String(error),
        path: REPLICA_DISPATCH_SERVICE_LITERAL.AUTHORITATIVE_PRIORITY_RECOVERY_RETRY,
      });
      return [];
    }
  }

  /**
   * Check whether one replica operation row is owned by this node.
   * Ready-node retries must only re-enter operations through the canonical
   * owner, even though replica_operations rows are globally replicated.
   * @param {Object} operation - Replica operation row or object.
   * @return {boolean}
   * @private
   */
  isReplicaOperationLocallyOwned(operation) {
    if (!operation || typeof operation !== 'object') {
      return false;
    }
    if (
      this.rebalanceCoordinator &&
      typeof this.rebalanceCoordinator.isOperationLocallyOwned ===
        'function'
    ) {
      return this.rebalanceCoordinator.isOperationLocallyOwned(operation);
    }
    if (
      this.rebalanceCoordinator &&
      typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId ===
        'function'
    ) {
      return (
        this.rebalanceCoordinator.resolveOperationOwnerNodeId(operation) ===
        this.nodeId
      );
    }
    return (
      String(
        operation?.sourceNodeId ||
          operation?.source_node_id ||
          REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING,
      ) === this.nodeId
    );
  }
}

export {ReplicaDispatchReplayReadiness};
