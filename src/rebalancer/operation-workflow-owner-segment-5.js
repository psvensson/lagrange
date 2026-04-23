import { OPERATION_WORKFLOW_OWNER_SHARED } from "./operation-workflow-owner-shared.js";
import { OperationWorkflowOwnerSegment4 } from "./operation-workflow-owner-segment-4.js";

const {
  AUTHORITATIVE_TRANSITION_RECOVERY_STATUS,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS,
  ControlPlaneField,
  ControlPlaneMessageType,
  ControlPlaneReadinessService,
  DEFAULT_MIN_REPLICA_COUNT,
  DIRECT_TRANSITION_PERSIST_PARTITION_IDS,
  DISPATCH_RETRY_DELAY_MS,
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
  EXECUTOR_OUTCOME_FIELD,
  FAILURE_LOG_LEVEL,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INITIAL_PARTITION_IDS,
  METRICS_LOG_TAG,
  NUM,
  OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES,
  OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS,
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  OPERATION_HANDLER,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_METADATA_KEY,
  OPERATION_OWNER_ACTION,
  OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR,
  OPERATION_SINGLE_FLIGHT_SCOPE,
  OPERATION_TRANSITION_REASON,
  OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OPERATION_WORKFLOW_OWNER_REASON,
  OperationType,
  PARTITION_SERVICE_ERROR_MSG,
  PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS,
  PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE,
  QUERY_ERROR_MSG,
  RAFT_ROLE,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  RECOVERABLE_TRANSITION_COMMIT_STATUS,
  RECOVERABLE_TRANSITION_ROLLBACK_STATUS,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  REMOVE_SAFETY_READ_QUERY_OPTIONS,
  REMOVE_SAFETY_SQL,
  REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  SAFETY_DEFERRED_LOG_THROTTLE_MS,
  SAFETY_DEFERRED_RETRY_DELAY_MS,
  SERVICE_TYPE,
  SQL_RECONCILIATION_REASON,
  SYSTEM_TABLE_NAME,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TIME_MS,
  TRANSACTION_STATUS,
  TRANSITION_RECOVERY_READ_OPTIONS,
  TRANSITION_RECOVERY_SQL,
  TRANSITION_RETRY_DELAY_MS,
  TRANSITION_STEP_OPTIONS,
  TYPEOF,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
  WORKFLOW_STEP_TO_STATUS,
  buildControlPlaneQueryOptions,
  buildPriorityRecoveryBlockedPartitionIds,
  buildPriorityRecoveryCompletion,
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildSelectRowsByTransactionIdsSql,
  buildTimeoutClassification,
  classifyTransportDeliveryOutcome,
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
  getControlPlaneRetryAfterMs,
  getWorkflowSteps,
  hasPriorityRecoverySpreadGap,
  isCoordinatorOwnedOperationType,
  isDeliveredTransportDeliveryOutcome,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
  isSystemTablePartition,
  normalizeNodeIdList,
  normalizeReplicaRowNodeIds,
  readAuthoritativeControlPlaneRows,
  resolvePriorityRecoveryActiveNodeCohort,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const PRIORITY_RECOVERY_WORKFLOW_TIMEOUT_STEPS = Object.freeze([
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
  WORKFLOW_STEP.CREATING,
  WORKFLOW_STEP.SYNCING,
  WORKFLOW_STEP.STOPPING,
]);

class OperationWorkflowOwnerSegment5 extends OperationWorkflowOwnerSegment4 {
  buildPriorityRecoveryWorkflowStepTimeoutMap(operation = null) {
    const timeoutMap = {};
    for (const workflowStep of PRIORITY_RECOVERY_WORKFLOW_TIMEOUT_STEPS) {
      const stepTimeoutMs = this.getTimeoutForStep(workflowStep, operation);
      if (!Number.isFinite(stepTimeoutMs) || stepTimeoutMs <= NUM.ZERO) {
        continue;
      }
      timeoutMap[workflowStep] = Math.floor(stepTimeoutMs);
    }
    return Object.freeze(timeoutMap);
  }

  async handleStopPhaseSatisfiedResponse(operation, responseStatus) {
    try {
      if (operation?.workflowStep !== WORKFLOW_STEP.STOPPING) {
        await this.updateStep(operation, WORKFLOW_STEP.STOPPING);
      }
      await this.completeOperation(operation);
      return this.buildSuccessfulOperationResult(operation.operationId, {
        status: responseStatus,
      });
    } catch (error) {
      if (
        this.deferObservedProgressRetry(
          operation?.operationId || null,
          SYSTEM_TABLE_NAME.SERVICES,
          OPERATION_WORKFLOW_OWNER_LITERAL.DELETE,
          error,
        )
      ) {
        return this.buildSkippedOperationResult(
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
          operation?.operationId || null,
          {
            error: this.normalizeErrorMessage(
              error,
              OPERATION_WORKFLOW_OWNER_LITERAL.RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE,
            ),
          },
        );
      }
      throw error;
    }
  }

  // --- Safety checks ---

  /**
   * @param {string} partitionId
   * @return {boolean}
   */
  isCriticalSystemPartition(partitionId) {
    return isSystemTablePartition({ partitionId });
  }

  /**
   * Resolve the readiness decision dimension for one operation context.
   * Critical system partitions should continue owner progression while
   * publication convergence is pending; ordinary entities remain strict.
   *
   * @param {Object|string|null} operationOrPartitionId
   * @return {string}
   */
  resolveOperationReadinessDecisionDimension(operationOrPartitionId = null) {
    const partitionId =
      typeof operationOrPartitionId === "string"
        ? operationOrPartitionId
        : operationOrPartitionId?.partitionId || null;
    if (this.isCriticalSystemPartition(partitionId)) {
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }

  /**
   * Check decision dimension readiness with compatibility fallback.
   * Fallback applies only when older snapshots omit
   * controlPlaneRecoveryEligible explicitly.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @return {boolean}
   */
  isReadinessDimensionSatisfied(readiness, decisionDimension) {
    const dimensions =
      readiness?.dimensions && typeof readiness.dimensions === "object"
        ? readiness.dimensions
        : null;
    if (!dimensions) {
      return false;
    }
    if (dimensions[decisionDimension] === true) {
      return true;
    }
    if (
      decisionDimension !==
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ) {
      return false;
    }
    if (Object.hasOwn(dimensions, decisionDimension)) {
      return false;
    }
    return (
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true
    );
  }

  /**
   * @param {Object} replicaRow
   * @return {boolean}
   */
  isVoterReadyRoutableReplica(replicaRow, options = {}) {
    if (!replicaRow) {
      return false;
    }
    if (replicaRow.status !== ReplicaStatus.ACTIVE) {
      return false;
    }
    if (!replicaRow.address) {
      return false;
    }
    const raftRole =
      typeof replicaRow.raft_role === "string"
        ? replicaRow.raft_role.toLowerCase()
        : null;
    if (!raftRole || raftRole === RAFT_ROLE.LEARNER) {
      return false;
    }
    const partitionId =
      options?.partitionId ||
      replicaRow.partition_id ||
      replicaRow.partitionId ||
      null;
    return this.isNodeReadyForRouting(replicaRow.node_id, {
      partitionId,
      decisionDimension: options?.decisionDimension || null,
      participationKind: options?.participationKind || null,
    });
  }

  /**
   * @param {Object} replicaRow
   * @param {Object} operation
   * @return {boolean}
   */
  isOperationReplicaRow(replicaRow, operation) {
    if (!replicaRow || !operation) {
      return false;
    }
    if (!operation.replicaId) {
      return false;
    }
    return (
      replicaRow.service_id === operation.replicaId ||
      replicaRow.replica_id === operation.replicaId
    );
  }

  /**
   * @param {Object} replicaRow
   * @return {string|null}
   * @private
   */
  getReplicaRowIdentity(replicaRow) {
    const serviceId =
      typeof replicaRow?.service_id === TYPEOF.STRING
        ? replicaRow.service_id.trim()
        : typeof replicaRow?.serviceId === TYPEOF.STRING
          ? replicaRow.serviceId.trim()
          : "";
    if (serviceId.length > NUM.ZERO) {
      return serviceId;
    }
    const replicaId =
      typeof replicaRow?.replica_id === TYPEOF.STRING
        ? replicaRow.replica_id.trim()
        : typeof replicaRow?.replicaId === TYPEOF.STRING
          ? replicaRow.replicaId.trim()
          : "";
    return replicaId.length > NUM.ZERO ? replicaId : null;
  }

  /**
   * @param {Object} replicaRow
   * @return {string|null}
   * @private
   */
  normalizeReplicaRowRaftRole(replicaRow) {
    return typeof replicaRow?.raft_role === TYPEOF.STRING
      ? replicaRow.raft_role.trim().toLowerCase()
      : null;
  }

  /**
   * @param {Object} replicaRow
   * @return {boolean}
   * @private
   */
  isLeaderReplicaRow(replicaRow) {
    return this.normalizeReplicaRowRaftRole(replicaRow) === RAFT_ROLE.LEADER;
  }

  /**
   * @param {Object|null} replicaRow
   * @return {string}
   * @private
   */
  getPriorityPublicationSourceRoleState(replicaRow) {
    const normalizedRaftRole = this.normalizeReplicaRowRaftRole(replicaRow);
    if (normalizedRaftRole === RAFT_ROLE.FOLLOWER) {
      return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
    }
    if (normalizedRaftRole === RAFT_ROLE.LEADER) {
      return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER;
    }
    return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.UNKNOWN;
  }

  /**
   * @param {Object|null} partitionRow
   * @return {string|null}
   * @private
   */
  getCriticalPartitionLeaderNodeIdForSafety(partitionRow) {
    const leaderNodeId =
      typeof partitionRow?.leader_node_id === TYPEOF.STRING
        ? partitionRow.leader_node_id.trim()
        : null;
    return leaderNodeId && leaderNodeId.length > NUM.ZERO ? leaderNodeId : null;
  }

  /**
   * @return {Map<string, Object>}
   * @private
   */
  getPriorityPublicationLeaderHandoffEvidenceMap() {
    if (
      !(
        this.priorityPublicationLeaderHandoffEvidenceByOperationId instanceof
        Map
      )
    ) {
      this.priorityPublicationLeaderHandoffEvidenceByOperationId = new Map();
    }
    return this.priorityPublicationLeaderHandoffEvidenceByOperationId;
  }

  /**
   * @param {Object} operation
   * @param {string|null} sourceReplicaId
   * @return {Object|null}
   * @private
   */
  getPriorityPublicationLeaderHandoffEvidence(operation, sourceReplicaId) {
    const operationId =
      typeof operation?.operationId === TYPEOF.STRING
        ? operation.operationId.trim()
        : null;
    if (!operationId) {
      return null;
    }
    const evidence =
      this.getPriorityPublicationLeaderHandoffEvidenceMap().get(operationId) ||
      null;
    if (!evidence) {
      return null;
    }
    const evidenceExpired =
      !Number.isFinite(evidence.observedAt) ||
      Date.now() - evidence.observedAt >
        PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE.STALE_AFTER_MS;
    const evidenceMismatch =
      typeof sourceReplicaId === TYPEOF.STRING &&
      sourceReplicaId.length > NUM.ZERO &&
      evidence.sourceReplicaId !== sourceReplicaId;
    if (evidenceExpired || evidenceMismatch) {
      this.getPriorityPublicationLeaderHandoffEvidenceMap().delete(operationId);
      return null;
    }
    return evidence;
  }

  /**
   * @param {Object} operation
   * @param {Object|null} handoffRequest
   * @param {Object|null} response
   * @return {void}
   * @private
   */
  recordPriorityPublicationLeaderHandoffEvidence(
    operation,
    handoffRequest,
    response,
  ) {
    if (
      !operation ||
      !handoffRequest ||
      handoffRequest.messageType !==
        ReplicaOperationMessageType.STEP_DOWN_REPLICA ||
      (response?.status !== ReplicaOperationResponseStatus.COMPLETED &&
        response?.status !== ReplicaOperationResponseStatus.NOT_FOUND)
    ) {
      return;
    }
    const operationId =
      typeof operation.operationId === TYPEOF.STRING
        ? operation.operationId.trim()
        : null;
    const sourceReplicaId =
      typeof handoffRequest.requestReplicaId === TYPEOF.STRING
        ? handoffRequest.requestReplicaId.trim()
        : null;
    if (!operationId || !sourceReplicaId) {
      return;
    }
    this.getPriorityPublicationLeaderHandoffEvidenceMap().set(
      operationId,
      Object.freeze({
        observedAt: Date.now(),
        sourceReplicaId,
      }),
    );
  }

  /**
   * @param {Object} operation
   * @param {string} sourceRoleState
   * @param {Object|null} partitionRow
   * @param {string|null} sourceReplicaId
   * @return {string}
   * @private
   */
  resolvePriorityPublicationSourceRoleState(
    operation,
    sourceRoleState,
    partitionRow,
    sourceReplicaId,
  ) {
    if (sourceRoleState === PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER) {
      return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
    }

    const sourceNodeId =
      typeof operation?.sourceNodeId === TYPEOF.STRING
        ? operation.sourceNodeId.trim()
        : null;
    const partitionLeaderNodeId =
      this.getCriticalPartitionLeaderNodeIdForSafety(partitionRow);
    const completedLeaderHandoffEvidence =
      this.getPriorityPublicationLeaderHandoffEvidence(
        operation,
        sourceReplicaId,
      );
    if (sourceNodeId && partitionLeaderNodeId) {
      if (
        partitionLeaderNodeId === sourceNodeId &&
        completedLeaderHandoffEvidence
      ) {
        return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
      }
      return partitionLeaderNodeId === sourceNodeId
        ? PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER
        : PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
    }
    if (completedLeaderHandoffEvidence) {
      return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
    }
    return sourceRoleState;
  }

  /**
   * @param {string} partitionId
   * @return {Object[]}
   * @private
   */
  getCachedCriticalReplicaRows(partitionId) {
    const systemTableCache = this.repository.systemTableCache;
    if (
      !systemTableCache ||
      typeof systemTableCache.filter !== TYPEOF.FUNCTION
    ) {
      return [];
    }
    return (
      systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES,
        (row) =>
          row.partition_id === partitionId &&
          row.service_type === SERVICE_TYPE.PARTITION,
      ) || []
    );
  }

  /**
   * @param {Object[]} authoritativeRows
   * @param {Object[]} cachedRows
   * @return {Object[]}
   * @private
   */
  mergeReplicaRowsForSafety(authoritativeRows, cachedRows) {
    const mergedRowsById = new Map();
    const mergeDefinedReplicaRowFields = (baseRow, incomingRow) => {
      const mergedRow = {
        ...(baseRow || {}),
      };
      for (const [fieldName, fieldValue] of Object.entries(incomingRow || {})) {
        if (fieldValue === null || fieldValue === undefined) {
          continue;
        }
        mergedRow[fieldName] = fieldValue;
      }
      return mergedRow;
    };
    const appendRow = (row, preferIncoming = false) => {
      if (!row || typeof row !== TYPEOF.OBJECT) {
        return;
      }
      const rowId = this.getReplicaRowIdentity(row);
      if (!rowId) {
        mergedRowsById.set(Symbol("service_row"), { ...row });
        return;
      }
      if (!preferIncoming || !mergedRowsById.has(rowId)) {
        mergedRowsById.set(rowId, { ...row });
        return;
      }
      mergedRowsById.set(
        rowId,
        mergeDefinedReplicaRowFields(mergedRowsById.get(rowId), row),
      );
    };
    for (const cachedRow of cachedRows) {
      appendRow(cachedRow, false);
    }
    for (const authoritativeRow of authoritativeRows) {
      appendRow(authoritativeRow, true);
    }
    return [...mergedRowsById.values()];
  }

  /**
   * Resolve the best currently-available services rows for one critical
   * partition safety decision. Cache remains the fallback when authoritative
   * visibility lags or the read path is transiently unavailable.
   *
   * @param {string} partitionId
   * @return {Promise<Object[]>}
   * @private
   */
  async getCriticalReplicaRowsForSafety(partitionId) {
    const cachedRows = this.getCachedCriticalReplicaRows(partitionId);
    const gateway = this.repository?.controlPlaneSystemTableGateway;
    if (!gateway) {
      return cachedRows;
    }
    try {
      const result = await readAuthoritativeControlPlaneRows(
        gateway,
        SYSTEM_TABLE_NAME.SERVICES,
        REMOVE_SAFETY_SQL.SELECT_PARTITION_REPLICA_ROWS,
        [SERVICE_TYPE.PARTITION, partitionId],
        REMOVE_SAFETY_READ_QUERY_OPTIONS,
      );
      if (
        !result?.success ||
        !Array.isArray(result.rows) ||
        result.rows.length === NUM.ZERO
      ) {
        return cachedRows;
      }
      return this.mergeReplicaRowsForSafety(result.rows, cachedRows);
    } catch {
      return cachedRows;
    }
  }

  /**
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getCachedCriticalPartitionRow(partitionId) {
    const systemTableCache = this.repository.systemTableCache;
    if (
      !partitionId ||
      !systemTableCache ||
      typeof systemTableCache.get !== TYPEOF.FUNCTION
    ) {
      return null;
    }
    return (
      systemTableCache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId) || null
    );
  }

  /**
   * @param {Object|null} authoritativeRow
   * @param {Object|null} cachedRow
   * @return {Object|null}
   * @private
   */
  mergePartitionRowForSafety(authoritativeRow, cachedRow) {
    if (!cachedRow && !authoritativeRow) {
      return null;
    }
    return {
      ...(cachedRow || {}),
      ...(authoritativeRow || {}),
    };
  }

  /**
   * @param {string} partitionId
   * @return {Promise<Object|null>}
   * @private
   */
  async getCriticalPartitionRowForSafety(partitionId) {
    const cachedRow = this.getCachedCriticalPartitionRow(partitionId);
    const gateway = this.repository?.controlPlaneSystemTableGateway;
    if (!partitionId || !gateway) {
      return cachedRow;
    }
    try {
      const result = await readAuthoritativeControlPlaneRows(
        gateway,
        SYSTEM_TABLE_NAME.PARTITIONS,
        REMOVE_SAFETY_SQL.SELECT_PARTITION_ROW,
        [partitionId],
        REMOVE_SAFETY_READ_QUERY_OPTIONS,
      );
      if (
        !result?.success ||
        !Array.isArray(result.rows) ||
        result.rows.length === NUM.ZERO
      ) {
        return cachedRow;
      }
      return this.mergePartitionRowForSafety(result.rows[0], cachedRow);
    } catch {
      return cachedRow;
    }
  }

  /**
   * @param {string} partitionId
   * @return {Promise<number>}
   */
  async getCriticalMinReplicaCount(partitionId) {
    if (
      !this.tablePolicyService ||
      typeof this.tablePolicyService.getPolicyForPartition !==
        OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION
    ) {
      return DEFAULT_MIN_REPLICA_COUNT;
    }

    try {
      const policy =
        await this.tablePolicyService.getPolicyForPartition(partitionId);
      const minReplicaCount = Number(policy?.minReplicaCount);
      if (Number.isFinite(minReplicaCount) && minReplicaCount > NUM.ZERO) {
        return Math.floor(minReplicaCount);
      }
    } catch (error) {
      this.logger.warn(
        OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_RESOLVE_MINREPLICACOUNT_FOR_CRITICAL +
          OPERATION_WORKFLOW_OWNER_LITERAL.PARTITION_SAFETY_CHECK,
        {
          partitionId,
          error: error.message,
        },
      );
    }

    return DEFAULT_MIN_REPLICA_COUNT;
  }

  /**
   * @param {string} nodeId
   * @return {boolean}
   */
  isNodeReadyForRouting(nodeId, options = {}) {
    if (!nodeId) {
      return false;
    }
    const decisionDimension =
      typeof options?.decisionDimension === TYPEOF.STRING &&
      options.decisionDimension.length > NUM.ZERO
        ? options.decisionDimension
        : this.resolveOperationReadinessDecisionDimension(
            options?.partitionId || null,
          );
    const participationKind = options?.participationKind || null;
    if (
      participationKind &&
      this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService
        .getControlPlaneParticipationSync === TYPEOF.FUNCTION
    ) {
      const participation =
        this.controlPlaneReadinessService.getControlPlaneParticipationSync(
          nodeId,
          {
            decisionDimension,
            participationKind,
            partitionId: options?.partitionId || null,
          },
        );
      return participation?.eligible === true;
    }
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
      nodeId,
      {
        decisionDimension: decisionDimension,
      },
    );
    return this.isReadinessDimensionSatisfied(readiness, decisionDimension);
  }

  /**
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async getPriorityRecoveryPlanningSnapshot(operation) {
    if (
      !operation ||
      !isPriorityControlPlanePartition({
        partitionId: operation.partitionId,
      })
    ) {
      return null;
    }

    const readinessService = this.controlPlaneReadinessService;
    if (
      !readinessService ||
      (typeof readinessService.getPriorityRecoveryPlanningAnswerBestEffort !==
        TYPEOF.FUNCTION &&
        typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !==
          TYPEOF.FUNCTION &&
        typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort !==
          TYPEOF.FUNCTION &&
        typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !==
          TYPEOF.FUNCTION)
    ) {
      return null;
    }

    const publicationNodeId = String(this.nodeId || "").trim();
    const observedAt = Date.now();
    if (
      typeof readinessService.getPriorityRecoveryPlanningAnswerBestEffort ===
      TYPEOF.FUNCTION
    ) {
      return readinessService.getPriorityRecoveryPlanningAnswerBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    if (
      typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort ===
      TYPEOF.FUNCTION
    ) {
      return readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    if (
      typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort ===
      TYPEOF.FUNCTION
    ) {
      return readinessService.getMembershipPublicationPlanningAnswerBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    if (
      typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort ===
      TYPEOF.FUNCTION
    ) {
      return readinessService.getMembershipPublicationPlanningSnapshotBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    return null;
  }

  /**
   * @param {Object|null} planningSnapshot
   * @return {string|null}
   * @private
   */
  normalizePriorityPublicationStatus(planningSnapshot) {
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return null;
    }
    const publicationStatus =
      typeof planningSnapshot.publicationStatus === TYPEOF.STRING &&
      planningSnapshot.publicationStatus.length > NUM.ZERO
        ? planningSnapshot.publicationStatus
        : typeof planningSnapshot.status === TYPEOF.STRING &&
            planningSnapshot.status.length > NUM.ZERO
          ? planningSnapshot.status
          : null;
    return publicationStatus ? publicationStatus.trim().toUpperCase() : null;
  }

  /**
   * @param {Object} operation
   * @param {Object|null} sourceReplicaRow
   * @param {Object|null} planningSnapshot
   * @return {Object}
   * @private
   */
  buildPriorityPublicationLeaderRemoveSafetySnapshot(
    operation,
    sourceReplicaRow,
    partitionRow,
    planningSnapshot,
  ) {
    const partitionId =
      typeof operation?.partitionId === TYPEOF.STRING
        ? operation.partitionId
        : null;
    const publicationPartitionId =
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
    const sourceReplicaId =
      this.getReplicaRowIdentity(sourceReplicaRow) ||
      this.repository.getReplaceSourceReplicaId(operation) ||
      null;
    const observedSourceRoleState =
      this.getPriorityPublicationSourceRoleState(sourceReplicaRow);
    const sourceRoleState = this.resolvePriorityPublicationSourceRoleState(
      operation,
      observedSourceRoleState,
      partitionRow,
      sourceReplicaId,
    );
    const partitionLeaderNodeId =
      this.getCriticalPartitionLeaderNodeIdForSafety(partitionRow);
    const publicationStatus =
      this.normalizePriorityPublicationStatus(planningSnapshot);

    if (
      operation?.type !== OperationType.REPLACE ||
      !this.isReplaceSourceLeaderHandoffRequiredPartition(partitionId)
    ) {
      return Object.freeze({
        state: PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.NOT_APPLICABLE,
        partitionId,
        sourceRoleState,
        observedSourceRoleState,
        sourceReplicaId,
        partitionLeaderNodeId,
        publicationPartitionId,
        publicationStatus,
      });
    }

    if (sourceRoleState === PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER) {
      return Object.freeze({
        state: PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.SAFE,
        partitionId,
        sourceRoleState,
        observedSourceRoleState,
        sourceReplicaId,
        partitionLeaderNodeId,
        publicationPartitionId,
        publicationStatus,
      });
    }

    if (partitionId === publicationPartitionId && !publicationStatus) {
      return Object.freeze({
        state:
          PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.PUBLICATION_STATUS_UNAVAILABLE,
        partitionId,
        sourceRoleState,
        observedSourceRoleState,
        sourceReplicaId,
        partitionLeaderNodeId,
        publicationPartitionId,
        publicationStatus: null,
      });
    }

    if (
      partitionId === publicationPartitionId &&
      publicationStatus !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
    ) {
      return Object.freeze({
        state:
          PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.WAIT_PUBLICATION_PUBLISHED,
        partitionId,
        sourceRoleState,
        observedSourceRoleState,
        sourceReplicaId,
        partitionLeaderNodeId,
        publicationPartitionId,
        publicationStatus,
      });
    }

    return Object.freeze({
      state:
        PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_SOURCE_LEADER_HANDOFF,
      partitionId,
      sourceRoleState,
      observedSourceRoleState,
      sourceReplicaId,
      partitionLeaderNodeId,
      publicationPartitionId,
      publicationStatus,
    });
  }

  /**
   * @param {Object} operation
   * @param {Object|null} sourceReplicaRow
   * @return {Promise<Object|null>}
   * @private
   */
  async evaluatePriorityPublicationLeaderRemoveSafety(
    operation,
    sourceReplicaRow,
  ) {
    const partitionRow = await this.getCriticalPartitionRowForSafety(
      operation?.partitionId || null,
    );
    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    const safetySnapshot =
      this.buildPriorityPublicationLeaderRemoveSafetySnapshot(
        operation,
        sourceReplicaRow,
        partitionRow,
        planningSnapshot,
      );

    if (
      safetySnapshot.state ===
      PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.NOT_APPLICABLE
    ) {
      return null;
    }

    if (
      safetySnapshot.state ===
      PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.SAFE
    ) {
      return this.buildSafeRemoveSafetyEvaluation();
    }

    if (
      safetySnapshot.state ===
      PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.PUBLICATION_STATUS_UNAVAILABLE
    ) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
          safetySnapshot.publicationPartitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.OPEN_PAREN +
          OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP +
          OPERATION_WORKFLOW_OWNER_LITERAL.CLOSE_PAREN +
          OPERATION_WORKFLOW_OWNER_LITERAL.SAFE_REMOVAL_UNAVAILABLE_SUFFIX,
      );
    }

    if (
      safetySnapshot.state ===
      PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.WAIT_PUBLICATION_PUBLISHED
    ) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
          safetySnapshot.publicationPartitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.SOURCE_LEADER +
          safetySnapshot.sourceReplicaId +
          OPERATION_WORKFLOW_OWNER_LITERAL.CANNOT_BE_REMOVED_WHILE +
          OPERATION_WORKFLOW_OWNER_LITERAL.PUBLICATION_STATUS_IS +
          safetySnapshot.publicationStatus,
      );
    }

    return this.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
        safetySnapshot.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.SOURCE_LEADER +
        safetySnapshot.sourceReplicaId +
        OPERATION_WORKFLOW_OWNER_LITERAL.HANDOFF_PENDING_BEFORE_SAFE_REMOVAL,
      {
        handoffRequest: Object.freeze({
          dispatchNodeId: operation.sourceNodeId,
          messageType: ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          requestReason:
            OPERATION_WORKFLOW_OWNER_LITERAL.REPLACE_SOURCE_LEADER_HANDOFF,
          requestReplicaId: safetySnapshot.sourceReplicaId,
        }),
      },
    );
  }

  /**
   * @param {Object} operation
   * @param {Object|null} handoffRequest
   * @return {Promise<void>}
   * @private
   */
  async dispatchRemoveSafetyHandoffRequest(operation, handoffRequest) {
    if (
      !operation ||
      !handoffRequest ||
      typeof handoffRequest !== TYPEOF.OBJECT ||
      typeof handoffRequest.dispatchNodeId !== TYPEOF.STRING ||
      handoffRequest.dispatchNodeId.length === NUM.ZERO ||
      typeof handoffRequest.requestReplicaId !== TYPEOF.STRING ||
      handoffRequest.requestReplicaId.length === NUM.ZERO
    ) {
      return;
    }

    const entityType = operation.entityType || SERVICE_TYPE.PARTITION;
    const entityId = operation.entityId || operation.partitionId;
    const handlerType =
      OPERATION_HANDLER[entityType] ||
      OPERATION_HANDLER[SERVICE_TYPE.PARTITION];
    const target = `${handoffRequest.dispatchNodeId}/service/${handlerType}`;
    const request = {
      [ReplicaOperationField.TYPE]: handoffRequest.messageType,
      [ReplicaOperationField.OPERATION_ID]: operation.operationId,
      [ReplicaOperationField.OPERATION_TYPE]: operation.type,
      [ReplicaOperationField.PARTITION_ID]: operation.partitionId,
      [ReplicaOperationField.REPLICA_ID]: handoffRequest.requestReplicaId,
      [ReplicaOperationField.SOURCE_NODE_ID]: operation.sourceNodeId,
      [ReplicaOperationField.ENTITY_TYPE]: entityType,
      [ReplicaOperationField.ENTITY_ID]: entityId,
    };
    if (handoffRequest.requestReason) {
      request[ReplicaOperationField.REASON] = handoffRequest.requestReason;
    }

    try {
      const response = await this.messageRouter.deliver(target, request, {
        targetNodeId: handoffRequest.dispatchNodeId,
        deliveryPriority: "critical",
      });
      this.recordPriorityPublicationLeaderHandoffEvidence(
        operation,
        handoffRequest,
        response,
      );
    } catch (_error) {
      return;
    }
  }

  /**
   * Expose the canonical planning snapshot owner for coordinator-level gates
   * that need to decide whether one in-flight priority recovery row still
   * blocks the next add-like action.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   */
  async getPriorityRecoveryPlanningSnapshotForOperation(operation) {
    return this.getPriorityRecoveryPlanningSnapshot(operation);
  }

  /**
   * Reuse the repository-owned deferred observation contract when composing the
   * runtime priority-recovery snapshot so safety and admission consumers do not
   * issue a second visibility judgment from planning rows alone.
   *
   * @param {Object[]} operations
   * @return {Object|null}
   * @private
   */
  resolvePriorityRecoveryIncompleteOperationObservation(operations = []) {
    if (
      !this.repository ||
      typeof this.repository.resolveIncompleteOperationObservation !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    const normalizedOperations = (Array.isArray(operations) ? operations : [])
      .filter((operation) => operation && typeof operation === TYPEOF.OBJECT);
    if (normalizedOperations.length === NUM.ZERO) {
      return null;
    }
    return this.repository.resolveIncompleteOperationObservation(
      normalizedOperations,
    );
  }

  /**
   * Build one canonical decision snapshot for the given priority partition
   * using the shared snapshot grammar and the repository-owned visibility
   * defer contract.
   *
   * @param {string} partitionId
   * @param {Object[]} operations
   * @param {Object|null} planningSnapshot
   * @return {Object|null}
   * @private
   */
  buildPriorityRecoveryDecisionSnapshotForOperations(
    partitionId,
    operations = [],
    planningSnapshot = null,
  ) {
    const normalizedPartitionId = String(partitionId || "").trim();
    if (
      normalizedPartitionId.length === NUM.ZERO ||
      !planningSnapshot ||
      typeof planningSnapshot !== TYPEOF.OBJECT
    ) {
      return null;
    }
    const operationRecords = (Array.isArray(operations) ? operations : [])
      .filter((operation) => {
        return operation && typeof operation === TYPEOF.OBJECT;
      });
    const representativeOperationRecord =
      operationRecords.find((operation) =>
        operation && typeof operation === TYPEOF.OBJECT,
      ) || null;
    const capturedAtMs = Date.now();
    const stepTimeoutMsByWorkflowStep =
      this.buildPriorityRecoveryWorkflowStepTimeoutMap(
        representativeOperationRecord,
      );
    const operationContexts = operationRecords
      .map((operation) =>
        buildPriorityRecoveryOperationContextFromRecord(
          operation,
          {
            nowMs: capturedAtMs,
            stepTimeoutMsByWorkflowStep,
          },
        ),
      )
      .filter((operationContext) => {
        return (
          operationContext &&
          operationContext.partitionId === normalizedPartitionId
        );
      });
    const incompleteObservation =
      this.resolvePriorityRecoveryIncompleteOperationObservation(
        operationRecords,
      );
    const deferredVisibilityOutcome =
      incompleteObservation?.deferredOutcome || null;
    const authoritativeOperationReadDeferred =
      incompleteObservation?.state ===
        INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED ||
      deferredVisibilityOutcome?.completionState ===
        PRIORITY_RECOVERY_COMPLETION_STATE
          .AUTHORITATIVE_OPERATION_READ_DEFERRED;
    const representativeOperationContext =
      operationContexts.length === NUM.ONE ? operationContexts[NUM.ZERO] : null;
    return buildPriorityRecoveryDecisionSnapshot({
      partitionId: normalizedPartitionId,
      capturedAt: capturedAtMs,
      publicationConvergence: planningSnapshot,
      operationContexts,
      operationId: representativeOperationContext?.operationId || null,
      operationContext: representativeOperationContext,
      stepTimeoutMsByWorkflowStep,
      authoritativeOperationReadDeferred,
    });
  }

  /**
   * Expose the canonical runtime-owned priority-recovery decision snapshot for
   * one in-flight operation.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   */
  async getPriorityRecoveryDecisionSnapshotForOperation(operation) {
    const partitionId = String(
      operation?.partitionId || operation?.entityId || "",
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      return null;
    }
    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    return this.buildPriorityRecoveryDecisionSnapshotForOperations(
      partitionId,
      [operation],
      planningSnapshot,
    );
  }

  /**
   * Expose the canonical runtime-owned priority-recovery decision snapshot for
   * one partition's current in-flight operations.
   *
   * @param {string} partitionId
   * @param {Object[]} operations
   * @return {Promise<Object|null>}
   */
  async getPriorityRecoveryDecisionSnapshotForPartitionOperations(
    partitionId,
    operations = [],
  ) {
    const representativeOperation = (Array.isArray(operations) ? operations : [])
      .find((operation) => operation && typeof operation === TYPEOF.OBJECT);
    if (!representativeOperation) {
      return null;
    }
    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(representativeOperation);
    return this.buildPriorityRecoveryDecisionSnapshotForOperations(
      partitionId,
      operations,
      planningSnapshot,
    );
  }

  /**
   * Resolve the shared priority-recovery evidence snapshot for the operation
   * currently under safety evaluation.
   *
   * @param {Object} operation
   * @param {Object|null} planningSnapshot
   * @return {Object|null}
   */
}

export { OperationWorkflowOwnerSegment5 };
