import { SQL_QUERY_ENGINE_SHARED } from "./sql-query-engine-shared.js";
import { SQLQueryEngineSegment2 } from "./sql-query-engine-segment-2.js";

const {
  ACTIVE_PARTITION_STATE,
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
  AddressManager,
  AuthoritativeControlPlaneView,
  BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES,
  BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_NO_EXPIRY_MS,
  BOOTSTRAP_ROUTING_OVERLAY_PARTITION_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_REASON,
  BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE,
  BOOTSTRAP_ROUTING_OVERLAY_REUSE_STATE,
  BudgetEnforcer,
  CALLBACK_RUNTIME_KIND,
  CODE_LOOKUP_BY_FUNCTION_ID_SQL,
  CODE_LOOKUP_BY_FUNCTION_NAME_SQL,
  COLUMN,
  CONNECTION_STATE_CONNECTED,
  CONNECTION_STATE_READY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_WORK_CLASS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CallbackExecutionHost,
  CancellationToken,
  ConfigurationManager,
  DEFAULT_CODE_VERSION,
  DEFAULT_PARTITION_VERSION,
  DEFAULT_SNAPSHOT_MODE,
  DUAL_WRITE_ACTIVE_STATUSES,
  DistributedQueryPlanner,
  DistributedTransactionCoordinator,
  DistributedWriteCoordinator,
  ENTITY_TYPE,
  EXECUTION_MODE,
  EXPLAIN_DISTRIBUTED_PREFIX_REGEX,
  ExecutionContext,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LineageTracker,
  LoggingService,
  METRICS_LOG_TAG,
  MIGRATION_STATUS,
  MODULE_MANIFEST_LOOKUP_BY_ARTIFACT_POINTER_SQL,
  ManagedSplitTopologyAdapter,
  ManagedSplitWorkflow,
  MigrationCoordinator,
  MigrationPipeline,
  NATIVE_CALLBACK_EXPORTS_ARG,
  NATIVE_CALLBACK_MODULE_ARG,
  NATIVE_CALLBACK_RETURN_LINE,
  NUM,
  OPERATION_METADATA_KEY,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  OperationType,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PROVISIONING_REJECTION_DETAIL_LIMIT,
  PROVISIONING_REJECTION_REASON_UNKNOWN,
  PROVISIONING_REJECTION_SUMMARY_NONE,
  PartitionCallbackDispatcher,
  PartitionResolver,
  PressureGovernor,
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  QUERY_SUBSYSTEM,
  QueryExecutor,
  RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE,
  RETRYABLE_CONTROL_PLANE_TIMEOUT_CLASSIFICATIONS,
  ReplicaOperationField,
  SERVICE_TYPE,
  SQLParser,
  SQL_PARSE_CACHE,
  STATE,
  STATUS_ACTIVE,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  SYSTEM_TABLE_NAME,
  SqlParseCache,
  TABLES,
  TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS,
  TABLE_PARTITION_TARGET_NODE_CONVERGENCE_REASON,
  TABLE_PARTITION_TARGET_NODE_WAIT,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TableCreationService,
  TimeoutPolicy,
  WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS,
  WRITE_OPERATION_STATUS,
  WRITE_TRACKING_EXCLUDED_TABLES,
  ZERO_SHA256_DIGEST,
  buildBootstrapRoutingOverlayEntry,
  buildBootstrapRoutingOverlayEntryState,
  buildLocalControlPlaneMutationReadinessFailure,
  buildOwnerContractOutcome,
  buildPressureAdmissionFailure,
  buildSystemTableMutationRoutingGapFailure,
  createCallbackDriverRegistry,
  createControlPlaneRuntimeBundle,
  createEmptyTransactionRecoveryReplaySummary,
  createHash,
  createTimeoutBudgetError,
  executePlan,
  executeStage,
  getLocalControlPlaneMutationReadinessBlocker,
  getRemainingBudgetMs,
  getSchemaByTableName,
  getSystemTableMutationRoutingGapBlocker,
  hasActiveAddressedPartitionService,
  isNodeRecordReady,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
  isRetryableManagedSplitTransition,
  isSqlRequest,
  normalizeControlPlaneMutationWorkClass,
  parseCallbackModuleArtifact,
  reorderParams,
  resolveBootstrapLeaderSelection,
  resolveRetryableControlPlaneMutationDeferState,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineSegment3 extends SQLQueryEngineSegment2 {
  async provisionInitialTablePartition(context) {
    const partitionId = context?.partitionId;
    const requestedReplicaCount =
      Number.isInteger(context?.replicaCount) && context.replicaCount > 0
        ? context.replicaCount
        : 1;
    const explicitTargetNodeIds = this.normalizeTargetNodeIds(
      context?.targetNodeIds,
    );

    if (!partitionId) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_PARTITION_ID_REQUIRED,
      );
    }

    if (
      !this.rebalanceCoordinator ||
      typeof this.rebalanceCoordinator.createOperation !== "function" ||
      typeof this.rebalanceCoordinator.executeOperation !== "function"
    ) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_COORDINATOR_REQUIRED,
      );
    }

    let targetReplicaCount =
      explicitTargetNodeIds.length > 0
        ? Math.max(
            1,
            Math.min(requestedReplicaCount, explicitTargetNodeIds.length),
          )
        : Math.max(1, requestedReplicaCount);
    const hasExplicitMinimumRoutableReplicaCount =
      Number.isInteger(context?.minimumRoutableReplicaCount) &&
      context.minimumRoutableReplicaCount > 0;
    let minimumRoutableReplicaCount =
      this.resolveMinimumProvisioningReplicaCount(
        context?.minimumRoutableReplicaCount,
        targetReplicaCount,
      );
    let enforceEveryProvisioningOperation =
      minimumRoutableReplicaCount >= targetReplicaCount;
    const bootstrapTableMetadata =
      context?.tableMetadata && typeof context.tableMetadata === "object"
        ? context.tableMetadata
        : null;
    const bootstrapPartitionMetadata =
      context?.partitionMetadata &&
      typeof context.partitionMetadata === "object"
        ? context.partitionMetadata
        : null;
    const routingReadinessDimension =
      typeof context?.routingReadinessDimension === "string" &&
      context.routingReadinessDimension.length > 0
        ? context.routingReadinessDimension
        : this.queryExecutor?.defaultRoutingReadinessDimension;
    const timeoutBudget =
      context?.timeoutBudget ||
      this.createControlPlaneTimeoutBudget(
        this.tablePartitionProvisioningTimeoutMs,
      );
    let provisionTargetDiagnostics =
      explicitTargetNodeIds.length === 0
        ? this.resolveProvisionTargetNodeIdsWithDiagnostics(targetReplicaCount)
            .diagnostics
        : null;
    let provisionTargetNodeIds = this.resolveProvisionTargetNodeIdsForContext(
      explicitTargetNodeIds,
      targetReplicaCount,
      provisionTargetDiagnostics,
    );
    let provisioningContractState = OWNER_CONTRACT_STATE.READY;
    let provisioningNextAction = OWNER_CONTRACT_NEXT_ACTION.PROCEED;
    let provisioningReasonCodes = [];
    let provisioningRetryAfterMs = NUM.ZERO;
    let admissionConvergence =
      context?.admissionConvergence &&
      typeof context.admissionConvergence === "object"
        ? context.admissionConvergence
        : null;

    const routableNodeIds = this.getRoutablePartitionServiceNodeIds(
      partitionId,
      routingReadinessDimension,
    );
    if (routableNodeIds.length >= minimumRoutableReplicaCount) {
      return this.buildProvisioningCompletionSummary({
        requestedReplicaCount,
        resolvedReplicaCount: targetReplicaCount,
        minimumRoutableReplicaCount,
        routableReplicaCount: routableNodeIds.length,
      });
    }

    if (
      explicitTargetNodeIds.length === 0 &&
      enforceEveryProvisioningOperation &&
      (provisionTargetNodeIds.length < targetReplicaCount ||
        this.supportsProvisioningAdmissionPrecheck())
    ) {
      const convergenceResult = await this.waitForProvisionTargetNodeIds({
        partitionId,
        requiredReplicaCount: targetReplicaCount,
        timeoutBudget,
        failOnTimeout: false,
        maxWaitMs: this.tablePartitionTargetNodeConvergenceTimeoutMs,
        explicitTargetNodeIds,
        allowAdaptiveAdmissionConvergenceWait:
          this.tablePartitionTargetNodeConvergenceTimeoutMs ===
          QUERY_DEFAULTS.TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS,
      });
      admissionConvergence = convergenceResult.admissionProbe || null;
      provisionTargetDiagnostics =
        convergenceResult.diagnostics || provisionTargetDiagnostics;
      provisionTargetNodeIds = this.resolveProvisionTargetNodeIdsForContext(
        explicitTargetNodeIds,
        targetReplicaCount,
        provisionTargetDiagnostics,
      );
      const maximumProvisionableReplicaCount = Number.isInteger(
        admissionConvergence?.maximumProvisionableReplicaCount,
      )
        ? admissionConvergence.maximumProvisionableReplicaCount
        : provisionTargetNodeIds.length;
      const implicitFallbackMinimumReplicaCount =
        this.resolveImplicitProvisioningFallbackReplicaCount(
          targetReplicaCount,
          provisionTargetDiagnostics?.activeNodeRowCount,
        );

      if (
        convergenceResult.nextAction === OWNER_CONTRACT_NEXT_ACTION.WAIT &&
        maximumProvisionableReplicaCount > 0 &&
        maximumProvisionableReplicaCount < targetReplicaCount &&
        maximumProvisionableReplicaCount >= implicitFallbackMinimumReplicaCount
      ) {
        targetReplicaCount = Math.max(1, maximumProvisionableReplicaCount);
        if (!hasExplicitMinimumRoutableReplicaCount) {
          minimumRoutableReplicaCount = Math.min(
            minimumRoutableReplicaCount,
            targetReplicaCount,
          );
        }
        enforceEveryProvisioningOperation =
          minimumRoutableReplicaCount >= targetReplicaCount;
        provisioningContractState = convergenceResult.contractState;
        provisioningNextAction = convergenceResult.nextAction;
        provisioningReasonCodes = Array.isArray(convergenceResult.reasonCodes)
          ? [...convergenceResult.reasonCodes]
          : [];
        provisioningRetryAfterMs =
          Number.isFinite(convergenceResult.retryAfterMs) &&
          convergenceResult.retryAfterMs > NUM.ZERO
            ? Math.floor(convergenceResult.retryAfterMs)
            : NUM.ZERO;
        this.logger.warn(
          QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_FALLBACK_USED,
          {
            partitionId,
            requiredReplicaCount: convergenceResult.requiredReplicaCount,
            resolvedReplicaCount: targetReplicaCount,
            minimumRoutableReplicaCount,
            convergenceTimedOut: true,
            waitedMs: convergenceResult.waitedMs,
            diagnostics: convergenceResult.diagnostics,
            admissionConvergence,
          },
        );
      }
    }

    const routableNodeIdSet = new Set(routableNodeIds);
    const operationPlanningStartedAtMs = this.nowFn();
    const plannedOperations = [];
    const createdPlanningOperations = [];
    const rejectedTargetNodePlans = [];
    const requiredNewReplicaCount = Math.max(
      0,
      targetReplicaCount - routableNodeIdSet.size,
    );

    const candidateTargetNodeIds = [];
    const seenCandidateTargetNodeIds = new Set();
    for (const targetNodeId of provisionTargetNodeIds) {
      if (
        routableNodeIdSet.has(targetNodeId) ||
        seenCandidateTargetNodeIds.has(targetNodeId)
      ) {
        continue;
      }
      seenCandidateTargetNodeIds.add(targetNodeId);
      candidateTargetNodeIds.push(targetNodeId);
    }

    const supportsAdmissionPrecheck =
      typeof this.rebalanceCoordinator.checkProvisioningAdmission ===
      "function";
    const admittedTargetNodeIds = [];
    const precheckedTargetNodeIds = new Set();
    if (
      supportsAdmissionPrecheck &&
      admissionConvergence &&
      Array.isArray(admissionConvergence.candidateTargetNodeIds) &&
      Array.isArray(admissionConvergence.admittedTargetNodeIds) &&
      Array.isArray(admissionConvergence.rejectedTargetNodePlans)
    ) {
      for (const targetNodeId of admissionConvergence.candidateTargetNodeIds) {
        precheckedTargetNodeIds.add(String(targetNodeId || ""));
      }
      admittedTargetNodeIds.push(
        ...admissionConvergence.admittedTargetNodeIds.filter(
          (targetNodeId) =>
            typeof targetNodeId === "string" && targetNodeId.length > 0,
        ),
      );
      rejectedTargetNodePlans.push(
        ...admissionConvergence.rejectedTargetNodePlans,
      );
    }
    for (const targetNodeId of candidateTargetNodeIds) {
      if (precheckedTargetNodeIds.has(targetNodeId)) {
        continue;
      }
      if (!supportsAdmissionPrecheck) {
        admittedTargetNodeIds.push(targetNodeId);
        continue;
      }

      let admissionDecision = null;
      try {
        admissionDecision =
          await this.rebalanceCoordinator.checkProvisioningAdmission({
            type: OperationType.ADD,
            partitionId,
            entityType: SERVICE_TYPE.PARTITION,
            entityId: partitionId,
            nodeId: targetNodeId,
          });
      } catch (error) {
        if (!this.isProvisioningAdmissionDeniedError(error)) {
          throw error;
        }
        admissionDecision = {
          allowed: false,
          admissionResult: error.admissionResult || null,
          error,
        };
      }

      if (admissionDecision?.allowed === true) {
        admittedTargetNodeIds.push(targetNodeId);
        continue;
      }

      const rejectionError =
        admissionDecision?.error && typeof admissionDecision.error === "object"
          ? admissionDecision.error
          : (() => {
              const fallbackError = new Error(
                `Provisioning admission denied on ${targetNodeId}`,
              );
              fallbackError.admissionResult =
                admissionDecision?.admissionResult || null;
              return fallbackError;
            })();
      const rejection = this.createProvisioningTargetRejection(
        targetNodeId,
        rejectionError,
      );
      rejectedTargetNodePlans.push(rejection);
      this.logProvisioningTargetRejection(partitionId, targetNodeId, rejection);
    }

    const maximumPrecheckedProvisionableReplicaCount =
      routableNodeIdSet.size + admittedTargetNodeIds.length;
    if (
      supportsAdmissionPrecheck &&
      maximumPrecheckedProvisionableReplicaCount < minimumRoutableReplicaCount
    ) {
      this.throwProvisioningInsufficientTargets({
        partitionId,
        targetReplicaCount,
        minimumRoutableReplicaCount,
        candidateTargetNodeIds: provisionTargetNodeIds,
        existingRoutableNodeIds: [...routableNodeIdSet],
        plannedTargetNodeIds: admittedTargetNodeIds,
        rejectedTargetNodePlans,
        maximumProvisionableReplicaCount:
          maximumPrecheckedProvisionableReplicaCount,
      });
    }

    for (const targetNodeId of admittedTargetNodeIds) {
      if (plannedOperations.length >= requiredNewReplicaCount) {
        break;
      }

      try {
        const operation = await this.rebalanceCoordinator.createOperation({
          type: OperationType.ADD,
          partitionId,
          entityType: SERVICE_TYPE.PARTITION,
          entityId: partitionId,
          nodeId: targetNodeId,
          skipProvisioningAdmissionRecheck:
            precheckedTargetNodeIds.has(targetNodeId),
          controlPlaneMutationWorkClass:
            CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE,
          // Initial partition provisioning executes these operations inline
          // below, so skip the redundant coordinator-created dispatch trigger.
          emitOperationCreated: false,
        });
        plannedOperations.push(operation);

        const operationCreatedAt = Number(operation?.createdAt);
        if (
          !Number.isFinite(operationCreatedAt) ||
          operationCreatedAt >= operationPlanningStartedAtMs - 1000
        ) {
          createdPlanningOperations.push(operation);
        }
      } catch (error) {
        if (!this.isProvisioningAdmissionDeniedError(error)) {
          throw error;
        }
        const rejection = this.createProvisioningTargetRejection(
          targetNodeId,
          error,
        );
        rejectedTargetNodePlans.push(rejection);
        this.logProvisioningTargetRejection(
          partitionId,
          targetNodeId,
          rejection,
        );
      }
    }

    const maximumProvisionableReplicaCount =
      routableNodeIdSet.size + plannedOperations.length;
    const implicitFallbackMinimumReplicaCount =
      this.resolveImplicitProvisioningFallbackReplicaCount(
        targetReplicaCount,
        provisionTargetDiagnostics?.activeNodeRowCount,
      );
    if (maximumProvisionableReplicaCount < minimumRoutableReplicaCount) {
      if (
        !hasExplicitMinimumRoutableReplicaCount &&
        maximumProvisionableReplicaCount > 0 &&
        maximumProvisionableReplicaCount >= implicitFallbackMinimumReplicaCount
      ) {
        const previousTargetReplicaCount = targetReplicaCount;
        const previousMinimumRoutableReplicaCount = minimumRoutableReplicaCount;
        targetReplicaCount = Math.max(1, maximumProvisionableReplicaCount);
        minimumRoutableReplicaCount = targetReplicaCount;
        enforceEveryProvisioningOperation =
          minimumRoutableReplicaCount >= targetReplicaCount;
        this.logger.warn(
          QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_FALLBACK_USED,
          {
            partitionId,
            requiredReplicaCount: previousTargetReplicaCount,
            resolvedReplicaCount: targetReplicaCount,
            minimumRoutableReplicaCount,
            previousMinimumRoutableReplicaCount,
            planningShortfall: true,
            existingRoutableNodeIds: [...routableNodeIdSet],
            plannedTargetNodeIds: plannedOperations
              .map(
                (operation) =>
                  operation?.targetNodeId || operation?.nodeId || null,
              )
              .filter(
                (nodeId) => typeof nodeId === "string" && nodeId.length > 0,
              ),
            rejectedTargetNodePlans,
          },
        );
      } else {
        await this.abortProvisioningPlanningOperations(
          partitionId,
          createdPlanningOperations,
          QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_ABORTED_PRE_DISPATCH,
        );
        this.throwProvisioningInsufficientTargets({
          partitionId,
          targetReplicaCount,
          minimumRoutableReplicaCount,
          candidateTargetNodeIds: provisionTargetNodeIds,
          existingRoutableNodeIds: [...routableNodeIdSet],
          plannedTargetNodeIds: plannedOperations
            .map(
              (operation) =>
                operation?.targetNodeId || operation?.nodeId || null,
            )
            .filter(
              (nodeId) => typeof nodeId === "string" && nodeId.length > 0,
            ),
          rejectedTargetNodePlans,
          maximumProvisionableReplicaCount,
        });
      }
    }

    const bootstrapTopology = this.buildInitialPartitionBootstrapTopology(
      partitionId,
      plannedOperations,
    );
    const bootstrapLeaderNodeId =
      this.resolveInitialPartitionBootstrapLeaderNodeId(
        partitionId,
        plannedOperations,
      );
    this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
      partitionId,
      targetReplicaCount,
      minimumRoutableReplicaCount,
      enforceEveryProvisioningOperation,
      candidateTargetNodeCount: provisionTargetNodeIds.length,
      rejectedTargetNodeCount: rejectedTargetNodePlans.length,
      plannedOperationCount: plannedOperations.length,
      phase: "dispatch_operations",
      remainingBudgetMs: getRemainingBudgetMs(timeoutBudget, {
        now: this.nowFn,
      }),
    });

    const metadataWaitReplicaIds = [];
    for (const operation of plannedOperations) {
      operation[ReplicaOperationField.REPLICA_IDS] =
        bootstrapTopology.replicaIds;
      operation[ReplicaOperationField.PEER_ADDRESSES] =
        bootstrapTopology.peerAddresses;
      const initialStepEntry =
        Array.isArray(operation.stepsHistory) &&
        operation.stepsHistory.length > 0 &&
        operation.stepsHistory[0] &&
        typeof operation.stepsHistory[0] === "object"
          ? operation.stepsHistory[0]
          : null;
      if (initialStepEntry) {
        initialStepEntry[OPERATION_METADATA_KEY.REPLICA_IDS] =
          bootstrapTopology.replicaIds;
        initialStepEntry[OPERATION_METADATA_KEY.PEER_ADDRESSES] =
          bootstrapTopology.peerAddresses;
        if (bootstrapTableMetadata) {
          initialStepEntry[OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA] =
            bootstrapTableMetadata;
        }
        if (bootstrapPartitionMetadata) {
          initialStepEntry[
            OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA
          ] = bootstrapPartitionMetadata;
        }
      }
      if (bootstrapTableMetadata) {
        operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] =
          bootstrapTableMetadata;
      }
      if (bootstrapPartitionMetadata) {
        operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] =
          bootstrapPartitionMetadata;
      }
      if (
        typeof this.rebalanceCoordinator.dispatchOperation === "function" &&
        typeof this.rebalanceCoordinator.persistOperationUpdate === "function"
      ) {
        await this.rebalanceCoordinator.persistOperationUpdate(operation);
      }
      const executionResult =
        typeof this.rebalanceCoordinator.executeOperation === "function"
          ? await this.rebalanceCoordinator.executeOperation(operation)
          : await this.rebalanceCoordinator.dispatchOperation(operation);

      if (
        executionResult &&
        executionResult.success === false &&
        executionResult.skipped !== true
      ) {
        if (enforceEveryProvisioningOperation) {
          throw new Error(
            executionResult.error ||
              QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_DISPATCH_FAILED,
          );
        }
        continue;
      }

      const replicaId = operation?.replicaId || operation?.replica_id || null;
      if (typeof replicaId === "string" && replicaId.length > 0) {
        metadataWaitReplicaIds.push(replicaId);
      }
    }

    const uniqueMetadataWaitReplicaIds = [...new Set(metadataWaitReplicaIds)];
    if (uniqueMetadataWaitReplicaIds.length > 0) {
      if (enforceEveryProvisioningOperation) {
        this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
          partitionId,
          phase: "wait_replica_metadata",
          replicaIds: uniqueMetadataWaitReplicaIds,
          remainingBudgetMs: getRemainingBudgetMs(timeoutBudget, {
            now: this.nowFn,
          }),
        });
        await Promise.all(
          uniqueMetadataWaitReplicaIds.map((replicaId) =>
            this.waitForPartitionServiceMetadata(replicaId, timeoutBudget),
          ),
        );
      } else {
        this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
          partitionId,
          phase: "wait_minimum_replica_metadata",
          replicaIds: uniqueMetadataWaitReplicaIds,
          minimumRoutableReplicaCount,
          remainingBudgetMs: getRemainingBudgetMs(timeoutBudget, {
            now: this.nowFn,
          }),
        });
        await this.waitForMinimumRoutableReplicaMetadata(
          partitionId,
          uniqueMetadataWaitReplicaIds,
          minimumRoutableReplicaCount,
          timeoutBudget,
          routingReadinessDimension,
        );
      }
    }

    await this.waitForRoutablePartitionServiceCount(
      partitionId,
      minimumRoutableReplicaCount,
      timeoutBudget,
      routingReadinessDimension,
    );
    await this.waitForPartitionLeaderService(partitionId, timeoutBudget, {
      partitionMetadata: bootstrapPartitionMetadata,
      bootstrapLeaderNodeId,
      routingReadinessDimension,
    });
    const finalRoutableNodeIds = this.getRoutablePartitionServiceNodeIds(
      partitionId,
      routingReadinessDimension,
    );
    return this.buildProvisioningCompletionSummary({
      requestedReplicaCount,
      resolvedReplicaCount: targetReplicaCount,
      minimumRoutableReplicaCount,
      routableReplicaCount: finalRoutableNodeIds.length,
      contractState: provisioningContractState,
      nextAction: provisioningNextAction,
      reasonCodes: provisioningReasonCodes,
      retryAfterMs: provisioningRetryAfterMs,
    });
  }

  buildProvisioningCompletionSummary(options = {}) {
    const requestedReplicaCount =
      Number.isInteger(options?.requestedReplicaCount) &&
      options.requestedReplicaCount > NUM.ZERO
        ? options.requestedReplicaCount
        : null;
    const resolvedReplicaCount =
      Number.isInteger(options?.resolvedReplicaCount) &&
      options.resolvedReplicaCount > NUM.ZERO
        ? options.resolvedReplicaCount
        : requestedReplicaCount;
    const minimumRoutableReplicaCount =
      Number.isInteger(options?.minimumRoutableReplicaCount) &&
      options.minimumRoutableReplicaCount > NUM.ZERO
        ? options.minimumRoutableReplicaCount
        : resolvedReplicaCount;
    const routableReplicaCount =
      Number.isInteger(options?.routableReplicaCount) &&
      options.routableReplicaCount >= NUM.ZERO
        ? options.routableReplicaCount
        : NUM.ZERO;
    const fullReplicaCountConverged =
      !Number.isInteger(requestedReplicaCount) ||
      requestedReplicaCount <= NUM.ZERO ||
      routableReplicaCount >= requestedReplicaCount;
    const defaultContractOutcome = buildOwnerContractOutcome({
      contractState: fullReplicaCountConverged
        ? OWNER_CONTRACT_STATE.READY
        : OWNER_CONTRACT_STATE.PENDING,
      nextAction: fullReplicaCountConverged
        ? OWNER_CONTRACT_NEXT_ACTION.PROCEED
        : OWNER_CONTRACT_NEXT_ACTION.WAIT,
    });
    const requestedContractOutcome = buildOwnerContractOutcome({
      contractState:
        options?.contractState || defaultContractOutcome.contractState,
      nextAction: options?.nextAction || defaultContractOutcome.nextAction,
    });
    const contractOutcome =
      fullReplicaCountConverged === false &&
      requestedContractOutcome.contractState === OWNER_CONTRACT_STATE.READY &&
      requestedContractOutcome.nextAction === OWNER_CONTRACT_NEXT_ACTION.PROCEED
        ? defaultContractOutcome
        : requestedContractOutcome;

    return {
      requestedReplicaCount,
      resolvedReplicaCount,
      minimumRoutableReplicaCount,
      routableReplicaCount,
      fullReplicaCountConverged,
      contractState: contractOutcome.contractState,
      nextAction: contractOutcome.nextAction,
      reasonCodes: Array.isArray(options?.reasonCodes)
        ? [...options.reasonCodes]
        : [],
      retryAfterMs:
        Number.isFinite(options?.retryAfterMs) &&
        options.retryAfterMs > NUM.ZERO
          ? Math.floor(options.retryAfterMs)
          : NUM.ZERO,
    };
  }

  /**
   * Return true when one create-operation error was denied by admission.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isProvisioningAdmissionDeniedError(error) {
    if (!error || typeof error !== "object") {
      return false;
    }
    const admissionResult = error.admissionResult;
    if (!admissionResult || typeof admissionResult !== "object") {
      return false;
    }
    if (admissionResult.allowed === true) {
      return false;
    }
    return true;
  }

  /**
   * Normalize one list of admission reason entries to reason-code strings.
   * @param {Array<*>} reasonEntries
   * @return {string[]}
   * @private
   */
  normalizeProvisioningReasonCodes(reasonEntries) {
    if (!Array.isArray(reasonEntries)) {
      return [];
    }
    const reasonCodes = [];
    const seenReasonCodes = new Set();
    for (const reasonEntry of reasonEntries) {
      const normalizedReason = String(
        reasonEntry?.code || reasonEntry?.reason || reasonEntry || "",
      );
      if (!normalizedReason || seenReasonCodes.has(normalizedReason)) {
        continue;
      }
      seenReasonCodes.add(normalizedReason);
      reasonCodes.push(normalizedReason);
      if (reasonCodes.length >= PROVISIONING_REJECTION_DETAIL_LIMIT) {
        break;
      }
    }
    return reasonCodes;
  }

  /**
   * Build one structured provisioning rejection payload.
   * @param {string} targetNodeId
   * @param {Error} error
   * @return {Object}
   * @private
   */
  createProvisioningTargetRejection(targetNodeId, error) {
    const admissionResult = error?.admissionResult || null;
    const ineligibleNode = admissionResult?.ineligibleNodes?.[0] || null;
    const blockingReasons = this.normalizeProvisioningReasonCodes(
      admissionResult?.blockingReasons,
    );
    const reasonCodes = this.normalizeProvisioningReasonCodes(
      ineligibleNode?.reasonCodes,
    );
    return {
      targetNodeId,
      decisionType: admissionResult?.decisionType || null,
      blockingReasons,
      reasonCodes,
      nodeSummary: ineligibleNode?.nodeSummary || null,
      readinessSnapshot:
        admissionResult?.readinessSnapshots?.[targetNodeId] || null,
      message: error?.message || null,
    };
  }

  /**
   * Emit one structured target-rejection warning entry.
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @param {Object} rejection
   * @return {void}
   * @private
   */
  logProvisioningTargetRejection(partitionId, targetNodeId, rejection) {
    this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_REJECTED, {
      partitionId,
      targetNodeId,
      decisionType: rejection?.decisionType || null,
      blockingReasons: Array.isArray(rejection?.blockingReasons)
        ? rejection.blockingReasons
        : [],
      reasonCodes: Array.isArray(rejection?.reasonCodes)
        ? rejection.reasonCodes
        : [],
      nodeSummary: rejection?.nodeSummary || null,
      readinessSnapshot: rejection?.readinessSnapshot || null,
      message: rejection?.message || null,
    });
  }

  /**
   * Summarize rejected target nodes for compact error messages.
   * @param {Object[]} rejectedTargetNodePlans
   * @return {string}
   * @private
   */
  summarizeProvisioningTargetRejections(rejectedTargetNodePlans) {
    if (
      !Array.isArray(rejectedTargetNodePlans) ||
      rejectedTargetNodePlans.length === 0
    ) {
      return PROVISIONING_REJECTION_SUMMARY_NONE;
    }

    const summaryEntries = [];
    for (const rejection of rejectedTargetNodePlans) {
      const targetNodeId = String(rejection?.targetNodeId || "");
      if (!targetNodeId) {
        continue;
      }
      const reasonCodes = [];
      for (const reasonCode of [
        ...(Array.isArray(rejection?.blockingReasons)
          ? rejection.blockingReasons
          : []),
        ...(Array.isArray(rejection?.reasonCodes) ? rejection.reasonCodes : []),
      ]) {
        const normalizedReasonCode = String(reasonCode || "");
        if (
          !normalizedReasonCode ||
          reasonCodes.includes(normalizedReasonCode)
        ) {
          continue;
        }
        reasonCodes.push(normalizedReasonCode);
        if (reasonCodes.length >= PROVISIONING_REJECTION_DETAIL_LIMIT) {
          break;
        }
      }
      const reasonSummary =
        reasonCodes.length > 0
          ? reasonCodes.join(",")
          : PROVISIONING_REJECTION_REASON_UNKNOWN;
      summaryEntries.push(`${targetNodeId}:${reasonSummary}`);
      if (summaryEntries.length >= PROVISIONING_REJECTION_DETAIL_LIMIT) {
        break;
      }
    }

    return summaryEntries.length > 0
      ? summaryEntries.join("; ")
      : PROVISIONING_REJECTION_SUMMARY_NONE;
  }

  /**
   * Throw one canonical insufficient-targets provisioning error.
   * @param {Object} details
   * @return {never}
   * @private
   */
  throwProvisioningInsufficientTargets(details) {
    const rejectionSummary = this.summarizeProvisioningTargetRejections(
      details?.rejectedTargetNodePlans,
    );
    this.logger.error(
      QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS,
      {
        partitionId: details?.partitionId || null,
        targetReplicaCount: details?.targetReplicaCount || null,
        minimumRoutableReplicaCount:
          details?.minimumRoutableReplicaCount || null,
        candidateTargetNodeIds: Array.isArray(details?.candidateTargetNodeIds)
          ? details.candidateTargetNodeIds
          : [],
        existingRoutableNodeIds: Array.isArray(details?.existingRoutableNodeIds)
          ? details.existingRoutableNodeIds
          : [],
        plannedTargetNodeIds: Array.isArray(details?.plannedTargetNodeIds)
          ? details.plannedTargetNodeIds
          : [],
        rejectedTargets: Array.isArray(details?.rejectedTargetNodePlans)
          ? details.rejectedTargetNodePlans
          : [],
        rejectionSummary,
      },
    );
    throw new Error(
      QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX +
        String(details?.partitionId || "") +
        `: required=${details?.minimumRoutableReplicaCount || 0}, ` +
        `provisionable=${details?.maximumProvisionableReplicaCount || 0}, ` +
        `target=${details?.targetReplicaCount || 0}, ` +
        `rejected=${rejectionSummary}`,
    );
  }

  /**
   * Mark provisional planning operations as failed before dispatch.
   * @param {string} partitionId
   * @param {Object[]} operations
   * @param {string} reason
   * @return {Promise<void>}
   * @private
   */
  async abortProvisioningPlanningOperations(partitionId, operations, reason) {
    if (!Array.isArray(operations) || operations.length === 0) {
      return;
    }
    if (
      !this.rebalanceCoordinator ||
      typeof this.rebalanceCoordinator.failOperation !== "function"
    ) {
      return;
    }

    this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_ABORT_PENDING, {
      partitionId,
      operationCount: operations.length,
      reason,
    });

    for (const operation of operations) {
      if (!operation || typeof operation !== "object") {
        continue;
      }
      try {
        await this.rebalanceCoordinator.failOperation(operation, reason, {
          logLevel: "warn",
        });
      } catch (error) {
        this.logger.error(
          QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_ABORT_FAILED,
          {
            partitionId,
            operationId: operation?.operationId || null,
            error: error?.message || String(error),
          },
        );
      }
    }
  }

  /**
   * Return true when the coordinator can probe provisioning admission
   * without creating replica_operations rows.
   * @return {boolean}
   * @private
   */
  supportsProvisioningAdmissionPrecheck() {
    return (
      !!this.rebalanceCoordinator &&
      typeof this.rebalanceCoordinator.checkProvisioningAdmission === "function"
    );
  }

  /**
   * Probe provisioning admission for one candidate target cohort.
   * @param {Object} options
   * @param {string} options.partitionId
   * @param {string[]} options.targetNodeIds
   * @return {Promise<Object>}
   * @private
   */
  async probeProvisioningTargetAdmission(options = {}) {
    const partitionId = String(options.partitionId || "");
    const targetNodeIds = this.normalizeTargetNodeIds(options.targetNodeIds);
    const existingRoutableNodeIds =
      this.getRoutablePartitionServiceNodeIds(partitionId);
    const routableNodeIdSet = new Set(existingRoutableNodeIds);
    const candidateTargetNodeIds = [];

    for (const targetNodeId of targetNodeIds) {
      if (!routableNodeIdSet.has(targetNodeId)) {
        candidateTargetNodeIds.push(targetNodeId);
      }
    }

    if (!this.supportsProvisioningAdmissionPrecheck()) {
      return {
        existingRoutableNodeIds,
        candidateTargetNodeIds,
        admittedTargetNodeIds: [...candidateTargetNodeIds],
        rejectedTargetNodePlans: [],
        maximumProvisionableReplicaCount:
          existingRoutableNodeIds.length + candidateTargetNodeIds.length,
      };
    }

    const admittedTargetNodeIds = [];
    const rejectedTargetNodePlans = [];
    for (const targetNodeId of candidateTargetNodeIds) {
      let admissionDecision = null;
      try {
        admissionDecision =
          await this.rebalanceCoordinator.checkProvisioningAdmission({
            type: OperationType.ADD,
            partitionId,
            entityType: SERVICE_TYPE.PARTITION,
            entityId: partitionId,
            nodeId: targetNodeId,
          });
      } catch (error) {
        if (!this.isProvisioningAdmissionDeniedError(error)) {
          throw error;
        }
        admissionDecision = {
          allowed: false,
          admissionResult: error.admissionResult || null,
          error,
        };
      }

      if (admissionDecision?.allowed === true) {
        admittedTargetNodeIds.push(targetNodeId);
        continue;
      }

      const rejectionError =
        admissionDecision?.error && typeof admissionDecision.error === "object"
          ? admissionDecision.error
          : (() => {
              const fallbackError = new Error(
                `Provisioning admission denied on ${targetNodeId}`,
              );
              fallbackError.admissionResult =
                admissionDecision?.admissionResult || null;
              return fallbackError;
            })();
      rejectedTargetNodePlans.push(
        this.createProvisioningTargetRejection(targetNodeId, rejectionError),
      );
    }

    return {
      existingRoutableNodeIds,
      candidateTargetNodeIds,
      admittedTargetNodeIds,
      rejectedTargetNodePlans,
      maximumProvisionableReplicaCount:
        existingRoutableNodeIds.length + admittedTargetNodeIds.length,
    };
  }

  /**
   * Probe one child partition bootstrap cohort before split metadata is
   * inserted so managed split can defer instead of creating metadata-only
   * child partitions.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async probeInitialTablePartitionProvisioning(options = {}) {
    return this.probeProvisioningTargetAdmission(options);
  }

  /**
   * Return active, non-transitioning partitions eligible for split evaluation.
   * @return {Array<Object>} Partition metadata rows.
   */
}

export { SQLQueryEngineSegment3 };
