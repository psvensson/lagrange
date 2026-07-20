import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineStatementExecution} from './sql-query-engine-statement-execution.js';
import {
  createSQLQueryEngineProvisioningAdmissionMethods,
} from './sql-query-engine-provisioning-admission-methods.js';
import {
  createSQLQueryEngineProvisioningDeadlineMethods,
} from './sql-query-engine-provisioning-deadline-methods.js';
import {
  resolveQueryCancellationToken,
  throwIfCancellationRequested,
} from './query-cancellation.js';
import {OPERATION_OWNER_TURN_POLICY} from '../rebalancer/operation-owner-turn-policy.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ONE_THOUSAND = 1000;
const LOCAL_STR_DISPATCH_OPERATIONS = 'dispatch_operations';
const LOCAL_STR_WAIT_REPLICA_METADATA = 'wait_replica_metadata';
const LOCAL_STR_WAIT_MINIMUM_REPLICA_METADATA = 'wait_minimum_replica_metadata';

function buildSchemaProvisioningChildIntentId(jobId, targetNodeId, kind) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) return null;
  return `${normalizedJobId}:${kind}:${String(targetNodeId || '').trim()}`;
}

const {
  CONTROL_PLANE_MUTATION_WORK_CLASS,
  OPERATION_METADATA_KEY,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  OperationType,
  QUERY_DEFAULTS,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  ReplicaOperationField,
  SERVICE_TYPE,
  buildOwnerContractOutcome,
  getRemainingBudgetMs,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineInitialPartitionProvisioning extends SQLQueryEngineStatementExecution {
  async provisionInitialTablePartition(context) {
    const cancellationToken = resolveQueryCancellationToken(context);
    throwIfCancellationRequested(cancellationToken);
    const partitionId = context?.partitionId;
    const requestedReplicaCount =
      Number.isInteger(context?.replicaCount) && context.replicaCount > 0 ?
        context.replicaCount :
        1;
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
      typeof this.rebalanceCoordinator.createOperation !== LOCAL_STR_FUNCTION ||
      typeof this.rebalanceCoordinator.executeOperation !== LOCAL_STR_FUNCTION
    ) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_COORDINATOR_REQUIRED,
      );
    }

    let targetReplicaCount =
      explicitTargetNodeIds.length > 0 ?
        Math.max(
          1,
          Math.min(requestedReplicaCount, explicitTargetNodeIds.length),
        ) :
        Math.max(1, requestedReplicaCount);
    const hasExplicitMinimumRoutableReplicaCount =
      Number.isInteger(context?.minimumRoutableReplicaCount) &&
      context.minimumRoutableReplicaCount > 0 &&
      context?.minimumRoutableReplicaCountWasDefaulted !== true;
    let minimumRoutableReplicaCount =
      this.resolveMinimumProvisioningReplicaCount(
        context?.minimumRoutableReplicaCount,
        targetReplicaCount,
      );
    let enforceEveryProvisioningOperation =
      minimumRoutableReplicaCount >= targetReplicaCount;
    const bootstrapTableMetadata =
      context?.tableMetadata && typeof context.tableMetadata === 'object' ?
        context.tableMetadata :
        null;
    const bootstrapPartitionMetadata =
      context?.partitionMetadata &&
      typeof context.partitionMetadata === 'object' ?
        context.partitionMetadata :
        null;
    const routingReadinessDimension =
      typeof context?.routingReadinessDimension === 'string' &&
      context.routingReadinessDimension.length > 0 ?
        context.routingReadinessDimension :
        this.queryExecutor?.defaultRoutingReadinessDimension;
    const timeoutBudget =
      context?.timeoutBudget ||
      this.createControlPlaneTimeoutBudget(
        this.tablePartitionProvisioningTimeoutMs,
      );
    let provisionTargetDiagnostics =
      explicitTargetNodeIds.length === 0 ?
        this.resolveProvisionTargetNodeIdsWithDiagnostics(targetReplicaCount)
          .diagnostics :
        null;
    let provisionTargetNodeIds = this.resolveProvisionTargetNodeIdsForContext(
      explicitTargetNodeIds,
      targetReplicaCount,
      provisionTargetDiagnostics,
    );
    let provisioningContractState = OWNER_CONTRACT_STATE.READY;
    let provisioningNextAction = OWNER_CONTRACT_NEXT_ACTION.PROCEED;
    let provisioningReasonCodes = [];
    let provisioningRetryAfterMs = 0;
    let admissionConvergence =
      context?.admissionConvergence &&
      typeof context.admissionConvergence === LOCAL_STR_OBJECT ?
        context.admissionConvergence :
        null;

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
      // Quorum-minimum creates also converge admission before planning; run-24
      // otherwise fail-fasted into a transient whole-cluster ledger hold.
      (enforceEveryProvisioningOperation ||
        this.supportsProvisioningAdmissionPrecheck()) &&
      (provisionTargetNodeIds.length < targetReplicaCount ||
        this.supportsProvisioningAdmissionPrecheck())
    ) {
      // A quorum-minimum create proceeds when the minimum admits; requiring the
      // full target would wait for replicas the rebalancer can fill afterwards.
      const convergenceRequiredReplicaCount = enforceEveryProvisioningOperation ?
        targetReplicaCount :
        Math.max(1, minimumRoutableReplicaCount);
      let convergenceResult = await this.waitForProvisionTargetNodeIds({
        partitionId,
        requiredReplicaCount: convergenceRequiredReplicaCount,
        timeoutBudget,
        failOnTimeout: false,
        maxWaitMs: this.tablePartitionTargetNodeConvergenceTimeoutMs,
        explicitTargetNodeIds,
        allowAdaptiveAdmissionConvergenceWait:
          this.tablePartitionTargetNodeConvergenceTimeoutMs ===
          QUERY_DEFAULTS.TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS,
        cancellationToken,
      });
      admissionConvergence = convergenceResult.admissionProbe || null;
      const transientHoldRewaitResult =
        await this.waitOutWholeClusterTransientProvisioningHold({
          partitionId,
          requiredReplicaCount: convergenceRequiredReplicaCount,
          timeoutBudget,
          explicitTargetNodeIds,
          hasExplicitMinimumRoutableReplicaCount,
          admissionConvergence,
          cancellationToken,
        });
      if (transientHoldRewaitResult) {
        convergenceResult = transientHoldRewaitResult;
        admissionConvergence = convergenceResult.admissionProbe || null;
      }
      provisionTargetDiagnostics =
        convergenceResult.diagnostics || provisionTargetDiagnostics;
      provisionTargetNodeIds = this.resolveProvisionTargetNodeIdsForContext(
        explicitTargetNodeIds,
        targetReplicaCount,
        provisionTargetDiagnostics,
      );
      const maximumProvisionableReplicaCount = Number.isInteger(
        admissionConvergence?.maximumProvisionableReplicaCount,
      ) ?
        admissionConvergence.maximumProvisionableReplicaCount :
        provisionTargetNodeIds.length;
      const implicitFallbackMinimumReplicaCount =
        this.resolveImplicitProvisioningFallbackReplicaCount(
          targetReplicaCount,
          provisionTargetDiagnostics?.activeNodeRowCount,
        );
      const fallbackMinimumReplicaCount =
        this.resolveProvisioningShortfallFallbackMinimum({
          hasExplicitMinimumRoutableReplicaCount,
          implicitFallbackMinimumReplicaCount,
          maximumProvisionableReplicaCount,
          rejectedTargetNodePlans:
            admissionConvergence?.rejectedTargetNodePlans,
        });

      if (
        convergenceResult.nextAction === OWNER_CONTRACT_NEXT_ACTION.WAIT &&
        maximumProvisionableReplicaCount > 0 &&
        maximumProvisionableReplicaCount < targetReplicaCount &&
        maximumProvisionableReplicaCount >= fallbackMinimumReplicaCount
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
        provisioningReasonCodes = Array.isArray(convergenceResult.reasonCodes) ?
          [...convergenceResult.reasonCodes] :
          [];
        provisioningRetryAfterMs =
          Number.isFinite(convergenceResult.retryAfterMs) &&
          convergenceResult.retryAfterMs > 0 ?
            Math.floor(convergenceResult.retryAfterMs) :
            0;
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
      'function';
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
        precheckedTargetNodeIds.add(String(targetNodeId || ''));
      }
      admittedTargetNodeIds.push(
        ...admissionConvergence.admittedTargetNodeIds.filter(
          (targetNodeId) =>
            typeof targetNodeId === LOCAL_STR_STRING && targetNodeId.length > 0,
        ),
      );
      rejectedTargetNodePlans.push(
        ...admissionConvergence.rejectedTargetNodePlans,
      );
    }
    for (const targetNodeId of candidateTargetNodeIds) {
      throwIfCancellationRequested(cancellationToken);
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
        admissionDecision?.error && typeof admissionDecision.error === 'object' ?
          admissionDecision.error :
          (() => {
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
      const implicitFallbackMinimumReplicaCount =
        this.resolveImplicitProvisioningFallbackReplicaCount(
          targetReplicaCount,
          provisionTargetDiagnostics?.activeNodeRowCount,
        );
      const fallbackMinimumReplicaCount =
        this.resolveProvisioningShortfallFallbackMinimum({
          hasExplicitMinimumRoutableReplicaCount,
          implicitFallbackMinimumReplicaCount,
          maximumProvisionableReplicaCount:
            maximumPrecheckedProvisionableReplicaCount,
          rejectedTargetNodePlans,
        });
      if (
        !hasExplicitMinimumRoutableReplicaCount &&
        maximumPrecheckedProvisionableReplicaCount > 0 &&
        maximumPrecheckedProvisionableReplicaCount >= fallbackMinimumReplicaCount
      ) {
        const previousTargetReplicaCount = targetReplicaCount;
        const previousMinimumRoutableReplicaCount = minimumRoutableReplicaCount;
        targetReplicaCount = Math.max(
          1,
          maximumPrecheckedProvisionableReplicaCount,
        );
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
            admissionShortfall: true,
            existingRoutableNodeIds: [...routableNodeIdSet],
            plannedTargetNodeIds: admittedTargetNodeIds,
            rejectedTargetNodePlans,
          },
        );
      } else {
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
          retryable: !hasExplicitMinimumRoutableReplicaCount,
        });
      }
    }

    for (const targetNodeId of admittedTargetNodeIds) {
      throwIfCancellationRequested(cancellationToken);
      if (plannedOperations.length >= requiredNewReplicaCount) {
        break;
      }

      try {
        await context?.assertProvisioningOwnership?.();
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
          // below. Keep durable CDC/replay dispatch held until the complete
          // bootstrap cohort is stamped, then skip the redundant local trigger.
          deferDispatchUntilBootstrapTopology: true,
          emitOperationCreated: false,
          operationIntentId: buildSchemaProvisioningChildIntentId(
            context?.schemaJobId,
            targetNodeId,
            'operation',
          ),
          replicaIntentId: buildSchemaProvisioningChildIntentId(
            context?.schemaJobId,
            targetNodeId,
            'replica',
          ),
          parentWorkflowFenceToken:
            context?.schemaOwnerFenceToken ?? null,
        });
        plannedOperations.push(operation);

        const operationCreatedAt = Number(operation?.createdAt);
        if (
          !Number.isFinite(operationCreatedAt) ||
          operationCreatedAt >= operationPlanningStartedAtMs - LOCAL_NUM_ONE_THOUSAND
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
    const fallbackMinimumReplicaCount =
      this.resolveProvisioningShortfallFallbackMinimum({
        hasExplicitMinimumRoutableReplicaCount,
        implicitFallbackMinimumReplicaCount,
        maximumProvisionableReplicaCount,
        rejectedTargetNodePlans,
      });
    if (maximumProvisionableReplicaCount < minimumRoutableReplicaCount) {
      if (
        !hasExplicitMinimumRoutableReplicaCount &&
        maximumProvisionableReplicaCount > 0 &&
        maximumProvisionableReplicaCount >= fallbackMinimumReplicaCount
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
                (nodeId) => typeof nodeId === LOCAL_STR_STRING && nodeId.length > 0,
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
              (nodeId) => typeof nodeId === LOCAL_STR_STRING && nodeId.length > 0,
            ),
          rejectedTargetNodePlans,
          maximumProvisionableReplicaCount,
          retryable: !hasExplicitMinimumRoutableReplicaCount,
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
      phase: LOCAL_STR_DISPATCH_OPERATIONS,
      remainingBudgetMs: getRemainingBudgetMs(timeoutBudget, {
        now: this.nowFn,
      }),
    });

    const metadataWaitReplicaIds = [];
    for (const operation of plannedOperations) {
      throwIfCancellationRequested(cancellationToken);
      operation[ReplicaOperationField.REPLICA_IDS] =
        bootstrapTopology.replicaIds;
      operation[ReplicaOperationField.PEER_ADDRESSES] =
        bootstrapTopology.peerAddresses;
      const initialStepEntry =
        Array.isArray(operation.stepsHistory) &&
        operation.stepsHistory.length > 0 &&
        operation.stepsHistory[0] &&
        typeof operation.stepsHistory[0] === 'object' ?
          operation.stepsHistory[0] :
          null;
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
        delete initialStepEntry[
          OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED
        ];
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
        typeof this.rebalanceCoordinator.dispatchOperation === LOCAL_STR_FUNCTION &&
        typeof this.rebalanceCoordinator.persistOperationUpdate === LOCAL_STR_FUNCTION
      ) {
        await this.rebalanceCoordinator.persistOperationUpdate(operation);
      }
      const executionResult =
        typeof this.rebalanceCoordinator.executeOperation === 'function' ?
          await this.rebalanceCoordinator.executeOperation(operation, {
            ownerTurnPolicy: OPERATION_OWNER_TURN_POLICY.RETAIN,
          }) :
          await this.rebalanceCoordinator.dispatchOperation(operation);
      throwIfCancellationRequested(cancellationToken);

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
      if (typeof replicaId === LOCAL_STR_STRING && replicaId.length > 0) {
        metadataWaitReplicaIds.push(replicaId);
      }
    }

    const uniqueMetadataWaitReplicaIds = [...new Set(metadataWaitReplicaIds)];
    if (uniqueMetadataWaitReplicaIds.length > 0) {
      if (enforceEveryProvisioningOperation) {
        this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
          partitionId,
          phase: LOCAL_STR_WAIT_REPLICA_METADATA,
          replicaIds: uniqueMetadataWaitReplicaIds,
          remainingBudgetMs: getRemainingBudgetMs(timeoutBudget, {
            now: this.nowFn,
          }),
        });
        await Promise.all(
          uniqueMetadataWaitReplicaIds.map((replicaId) =>
            this.waitForPartitionServiceMetadata(replicaId, timeoutBudget, {
              cancellationToken,
            }),
          ),
        );
      } else {
        this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
          partitionId,
          phase: LOCAL_STR_WAIT_MINIMUM_REPLICA_METADATA,
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
          {cancellationToken},
        );
      }
      throwIfCancellationRequested(cancellationToken);
    }

    await this.waitForRoutablePartitionServiceCount(
      partitionId,
      minimumRoutableReplicaCount,
      timeoutBudget,
      routingReadinessDimension,
      {cancellationToken},
    );
    throwIfCancellationRequested(cancellationToken);
    await this.waitForPartitionLeaderService(partitionId, timeoutBudget, {
      partitionMetadata: bootstrapPartitionMetadata,
      bootstrapLeaderNodeId,
      routingReadinessDimension,
      cancellationToken,
    });
    throwIfCancellationRequested(cancellationToken);
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
      options.requestedReplicaCount > 0 ?
        options.requestedReplicaCount :
        null;
    const resolvedReplicaCount =
      Number.isInteger(options?.resolvedReplicaCount) &&
      options.resolvedReplicaCount > 0 ?
        options.resolvedReplicaCount :
        requestedReplicaCount;
    const minimumRoutableReplicaCount =
      Number.isInteger(options?.minimumRoutableReplicaCount) &&
      options.minimumRoutableReplicaCount > 0 ?
        options.minimumRoutableReplicaCount :
        resolvedReplicaCount;
    const routableReplicaCount =
      Number.isInteger(options?.routableReplicaCount) &&
      options.routableReplicaCount >= 0 ?
        options.routableReplicaCount :
        0;
    const fullReplicaCountConverged =
      !Number.isInteger(requestedReplicaCount) ||
      requestedReplicaCount <= 0 ||
      routableReplicaCount >= requestedReplicaCount;
    const defaultContractOutcome = buildOwnerContractOutcome({
      contractState: fullReplicaCountConverged ?
        OWNER_CONTRACT_STATE.READY :
        OWNER_CONTRACT_STATE.PENDING,
      nextAction: fullReplicaCountConverged ?
        OWNER_CONTRACT_NEXT_ACTION.PROCEED :
        OWNER_CONTRACT_NEXT_ACTION.WAIT,
    });
    const requestedContractOutcome = buildOwnerContractOutcome({
      contractState:
        options?.contractState || defaultContractOutcome.contractState,
      nextAction: options?.nextAction || defaultContractOutcome.nextAction,
    });
    const contractOutcome =
      fullReplicaCountConverged === false &&
      requestedContractOutcome.contractState === OWNER_CONTRACT_STATE.READY &&
      requestedContractOutcome.nextAction === OWNER_CONTRACT_NEXT_ACTION.PROCEED ?
        defaultContractOutcome :
        requestedContractOutcome;

    return {
      requestedReplicaCount,
      resolvedReplicaCount,
      minimumRoutableReplicaCount,
      routableReplicaCount,
      fullReplicaCountConverged,
      contractState: contractOutcome.contractState,
      nextAction: contractOutcome.nextAction,
      reasonCodes: Array.isArray(options?.reasonCodes) ?
        [...options.reasonCodes] :
        [],
      retryAfterMs:
        Number.isFinite(options?.retryAfterMs) &&
        options.retryAfterMs > 0 ?
          Math.floor(options.retryAfterMs) :
          0,
    };
  }

  /**
   * Return active, non-transitioning partitions eligible for split evaluation.
   * @return {Array<Object>} Partition metadata rows.
   */
}

Object.defineProperties(
  SQLQueryEngineInitialPartitionProvisioning.prototype,
  createSQLQueryEngineProvisioningAdmissionMethods(),
);
Object.defineProperties(
  SQLQueryEngineInitialPartitionProvisioning.prototype,
  createSQLQueryEngineProvisioningDeadlineMethods(),
);

export {SQLQueryEngineInitialPartitionProvisioning};
