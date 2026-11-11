import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineStatementExecution} from './sql-query-engine-statement-execution.js';
import {
  createSQLQueryEngineProvisioningAdmissionMethods,
} from './sql-query-engine-provisioning-admission-methods.js';
import {
  resolveQueryCancellationToken,
  throwIfCancellationRequested,
} from './query-cancellation.js';
import {OPERATION_OWNER_TURN_POLICY} from '../rebalancer/operation-owner-turn-policy.js';
import {genesisStamp} from '../raft/raft-committed-membership-stamp.js';
import {
  BOOTSTRAP_COHORT_STATE,
  resolveInitialPartitionBootstrapCohort,
} from './initial-partition-bootstrap-cohort.js';
import {
  isTerminalSuccessfulCreateOperation,
} from '../rebalancer/replica-operation-progress.js';
import {
  buildProvisioningCompletionSummary,
} from './provisioning-completion-summary.js';
import {shouldRetainDurableSchemaPlanningOperations} from
  './durable-schema-planning-retention.js';
import {buildSchemaProvisioningChildIntent} from
  './schema-provisioning-child-intent.js';
import {WORKFLOW_STEP} from '../constants/index.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ONE_THOUSAND = 1000;
const LOCAL_STR_DISPATCH_OPERATIONS = 'dispatch_operations';
const LOCAL_STR_WAIT_REPLICA_METADATA = 'wait_replica_metadata';
const LOCAL_STR_WAIT_MINIMUM_REPLICA_METADATA = 'wait_minimum_replica_metadata';

const {
  OPERATION_METADATA_KEY,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  ReplicaOperationField,
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

    const bootstrapTableMetadata =
      context?.tableMetadata && typeof context.tableMetadata === 'object' ?
        context.tableMetadata :
        null;
    const bootstrapPartitionMetadata =
      context?.partitionMetadata &&
      typeof context.partitionMetadata === 'object' ?
        context.partitionMetadata :
        null;
    // A retry of the same schema job plans exactly the founders its durable
    // bootstrap operations already name; only an unfounded partition is
    // planned from the caller's targets or the current serving cohort.
    const establishedCohort =
      await this.readSchemaJobEstablishedBootstrapCohort(
        context,
        partitionId,
        bootstrapTableMetadata,
        bootstrapPartitionMetadata,
      );
    const planTargetNodeIds =
      establishedCohort.state === BOOTSTRAP_COHORT_STATE.ESTABLISHED ?
        establishedCohort.founderTargetNodeIds :
        explicitTargetNodeIds;

    let targetReplicaCount =
      planTargetNodeIds.length > 0 ?
        Math.max(
          1,
          Math.min(requestedReplicaCount, planTargetNodeIds.length),
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
      planTargetNodeIds.length === 0 ?
        this.resolveProvisionTargetNodeIdsWithDiagnostics(targetReplicaCount)
          .diagnostics :
        null;
    let provisionTargetNodeIds = this.resolveProvisionTargetNodeIdsForContext(
      planTargetNodeIds,
      targetReplicaCount,
      provisionTargetDiagnostics,
    );
    let provisioningContractState = OWNER_CONTRACT_STATE.READY;
    let provisioningNextAction = OWNER_CONTRACT_NEXT_ACTION.PROCEED;
    let provisioningReasonCodes = [];
    let provisioningRetryAfterMs = 0;
    let provisioningEpoch = provisionTargetDiagnostics?.epoch || null;
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
      return buildProvisioningCompletionSummary({
        requestedReplicaCount,
        resolvedReplicaCount: targetReplicaCount,
        minimumRoutableReplicaCount,
        routableReplicaCount: routableNodeIds.length,
      });
    }

    if (
      planTargetNodeIds.length === 0 &&
      (provisionTargetNodeIds.length < targetReplicaCount ||
        this.supportsProvisioningAdmissionPrecheck())
    ) {
      const convergenceResult = await this.waitForProvisionTargetNodeIds({
        partitionId,
        schemaJobId: context?.schemaJobId,
        requiredReplicaCount: targetReplicaCount,
        minimumRoutableReplicaCount,
        hasExplicitMinimumRoutableReplicaCount,
        minimumRoutableReplicaCountWasDefaulted:
          context?.minimumRoutableReplicaCountWasDefaulted === true,
        timeoutBudget,
        failOnTimeout: false,
        maxWaitMs: this.tablePartitionTargetNodeConvergenceTimeoutMs,
        explicitTargetNodeIds: planTargetNodeIds,
        allowAdaptiveAdmissionConvergenceWait:
          this.tablePartitionTargetNodeConvergenceTimeoutMs ===
          QUERY_DEFAULTS.TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS,
        cancellationToken,
      });
      admissionConvergence = convergenceResult.admissionProbe || null;
      provisionTargetDiagnostics =
        convergenceResult.diagnostics || provisionTargetDiagnostics;
      provisionTargetNodeIds = this.resolveProvisionTargetNodeIdsForContext(
        planTargetNodeIds,
        targetReplicaCount,
        provisionTargetDiagnostics,
      );
      provisioningEpoch = convergenceResult?.epoch || provisioningEpoch;
      if (convergenceResult.contractState === OWNER_CONTRACT_STATE.DEFERRED) {
        const error = new Error(
          `Provisioning unavailable: quorum not reachable for partition ${partitionId}`,
        );
        error.code = QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE;
        error.errorCode = QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE;
        error.epoch = convergenceResult.epoch || null;
        error.reasons = convergenceResult.reasons || [];
        error.retryAfterMs = convergenceResult.retryAfterMs || 0;
        error.detail = {
          epoch: error.epoch,
          reasons: error.reasons,
          retryAfterMs: error.retryAfterMs,
        };
        throw error;
      }
      targetReplicaCount = provisionTargetNodeIds.length;
      if (!hasExplicitMinimumRoutableReplicaCount) {
        minimumRoutableReplicaCount = Math.max(
          this.calculateQuorumReplicaCount(requestedReplicaCount),
          Math.min(minimumRoutableReplicaCount, targetReplicaCount),
        );
      }
      if (targetReplicaCount < minimumRoutableReplicaCount) {
        const error = new Error(
          `Provisioning unavailable: quorum not reachable for partition ${partitionId}`,
        );
        error.code = QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE;
        error.errorCode = QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE;
        error.epoch = provisioningEpoch;
        error.reasons = convergenceResult.reasons || [];
        error.retryAfterMs = convergenceResult.retryAfterMs || 0;
        error.detail = {
          epoch: error.epoch,
          reasons: error.reasons,
          retryAfterMs: error.retryAfterMs,
        };
        throw error;
      }
      enforceEveryProvisioningOperation = true;
      provisioningContractState = convergenceResult.contractState;
      provisioningNextAction = convergenceResult.nextAction;
      provisioningReasonCodes = Array.isArray(convergenceResult.reasonCodes) ?
        [...convergenceResult.reasonCodes] :
        [];
      provisioningRetryAfterMs = convergenceResult.retryAfterMs || 0;
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
    const operationCreationAdmissionByTargetNodeId = new Map();
    const precheckedTargetNodeIds = new Set();
    const unsettledTargetNodePlans = [];
    const acceptSettledTargets = (settled) => {
      admittedTargetNodeIds.push(...settled.admittedTargetNodeIds.filter(
        (targetNodeId) =>
          typeof targetNodeId === LOCAL_STR_STRING && targetNodeId.length > 0,
      ));
      for (const plan of settled.admittedTargetPlans || []) {
        if (plan?.operationCreationAdmission) {
          operationCreationAdmissionByTargetNodeId.set(
            plan.targetNodeId,
            plan.operationCreationAdmission,
          );
        }
      }
      rejectedTargetNodePlans.push(...settled.rejectedTargetNodePlans);
      unsettledTargetNodePlans.push(...(settled.unsettledTargetNodePlans || []));
    };
    if (
      supportsAdmissionPrecheck &&
      admissionConvergence &&
      Array.isArray(admissionConvergence.candidateTargetNodeIds) &&
      Array.isArray(admissionConvergence.admittedTargetNodeIds) &&
      Array.isArray(admissionConvergence.rejectedTargetNodePlans)
    ) {
      // A target the earlier probe left unsettled is not prechecked: it is
      // settled again here, under this statement's budget.
      const probeUnsettled = new Set((admissionConvergence
        .unsettledTargetNodePlans || []).map((plan) => plan?.targetNodeId));
      for (const targetNodeId of admissionConvergence.candidateTargetNodeIds) {
        if (!probeUnsettled.has(targetNodeId)) {
          precheckedTargetNodeIds.add(String(targetNodeId || ''));
        }
      }
      acceptSettledTargets({...admissionConvergence,
        unsettledTargetNodePlans: []});
    }
    const uncheckedTargetNodeIds = candidateTargetNodeIds.filter(
      (targetNodeId) => !precheckedTargetNodeIds.has(targetNodeId));
    if (!supportsAdmissionPrecheck) {
      admittedTargetNodeIds.push(...uncheckedTargetNodeIds);
    } else if (uncheckedTargetNodeIds.length > 0) {
      acceptSettledTargets(await this.admitProvisioningTargets({
        partitionId,
        targetNodeIds: uncheckedTargetNodeIds,
        schemaJobId: context?.schemaJobId,
        timeoutBudget,
        cancellationToken,
      }));
    }
    this.throwIfProvisioningAdmissionUnsettled(
      partitionId,
      unsettledTargetNodePlans,
    );

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
        retryable: !hasExplicitMinimumRoutableReplicaCount,
      });
    }

    for (const targetNodeId of admittedTargetNodeIds) {
      throwIfCancellationRequested(cancellationToken);
      if (plannedOperations.length >= requiredNewReplicaCount) {
        break;
      }

      try {
        await context?.assertProvisioningOwnership?.();
        const childIntent = buildSchemaProvisioningChildIntent(
          context?.schemaJobId,
          targetNodeId,
        );
        const operation =
          await this.createProvisioningOperationWithAdmissionReentry({
            partitionId,
            targetNodeId,
            childIntent,
            supportsAdmissionPrecheck,
            operationCreationAdmission:
              operationCreationAdmissionByTargetNodeId.get(targetNodeId) ||
              null,
            parentWorkflowFenceToken: context?.schemaOwnerFenceToken ?? null,
            timeoutBudget,
            cancellationToken,
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
          await this.releaseUnsettledFoundingOperations(context, partitionId,
            createdPlanningOperations, error);
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
    if (maximumProvisionableReplicaCount < minimumRoutableReplicaCount) {
      const retryable = !hasExplicitMinimumRoutableReplicaCount;
      const retainDurableSchemaPlanningOperations =
        retryable &&
        shouldRetainDurableSchemaPlanningOperations(
          context,
          createdPlanningOperations,
        );
      if (!retainDurableSchemaPlanningOperations) {
        await this.abortProvisioningPlanningOperations(
          partitionId,
          createdPlanningOperations,
          QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_ABORTED_PRE_DISPATCH,
        );
      }
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
        retryable,
      });
    }

    this.logProvisioningFoundingBelowRequested({
      partitionId,
      requestedReplicaCount,
      foundingReplicaCount: maximumProvisionableReplicaCount,
      minimumRoutableReplicaCount,
      candidateTargetNodeIds: provisionTargetNodeIds,
      rejectedTargetNodePlans,
    });
    const candidateTopology = this.buildInitialPartitionBootstrapTopology(
      partitionId,
      plannedOperations,
    );
    // The founding cohort's GENESIS stamp (owner decision O1): the second
    // and last stamp origin beside the creation owner's committed read.
    // Validated against any already-established operation cohort so retries
    // and restarts preserve the founding cohort without rewriting operations.
    const plannedCohort = resolveInitialPartitionBootstrapCohort({
      partitionId,
      plannedOperations,
      candidateTopology,
      bootstrapTableMetadata,
      bootstrapPartitionMetadata,
      explicitTargetNodeIds,
    });
    const {bootstrappedOperations} = plannedCohort;
    const cohortEstablished =
      plannedCohort.state === BOOTSTRAP_COHORT_STATE.ESTABLISHED;
    const bootstrapTopology = cohortEstablished ?
      plannedCohort.bootstrapTopology : candidateTopology;
    const bootstrapMembership = cohortEstablished ?
      plannedCohort.bootstrapMembership :
      genesisStamp(candidateTopology.replicaIds,
        candidateTopology.founderNodeIds);
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

    for (const operation of plannedOperations) {
      throwIfCancellationRequested(cancellationToken);
      if (
        isTerminalSuccessfulCreateOperation(operation) ||
        bootstrappedOperations.has(operation)
      ) {
        continue;
      }

      operation[ReplicaOperationField.REPLICA_IDS] =
        bootstrapTopology.replicaIds;
      operation[ReplicaOperationField.PEER_ADDRESSES] =
        bootstrapTopology.peerAddresses;
      operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP] =
        bootstrapMembership;
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
        initialStepEntry[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP] =
          bootstrapMembership;
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
      operation.updatedAt = this.nowFn();
      if (
        typeof this.rebalanceCoordinator.dispatchOperation === LOCAL_STR_FUNCTION &&
        typeof this.rebalanceCoordinator.persistOperationUpdate === LOCAL_STR_FUNCTION
      ) {
        await this.rebalanceCoordinator.persistOperationUpdate(operation);
      }
    }

    const metadataWaitReplicaIds = [];
    for (const operation of plannedOperations) {
      throwIfCancellationRequested(cancellationToken);
      // A deterministic-intent retry can hand back the prior attempt's
      // durably terminal-successful operation (collision terminal arm).
      // The replica already exists: re-stamping and re-executing it is the
      // round-10 livelock. Keep it in the plan for counting, wait on its
      // routability like any other create, but never re-dispatch it.
      if (isTerminalSuccessfulCreateOperation(operation)) {
        const terminalReplicaId =
          operation?.replicaId || operation?.replica_id || null;
        if (
          typeof terminalReplicaId === LOCAL_STR_STRING &&
          terminalReplicaId.length > 0
        ) {
          metadataWaitReplicaIds.push(terminalReplicaId);
        }
        continue;
      }
      // An operation a prior attempt already dispatched is in flight under
      // its workflow owner (its durable step says so): wait on its replica,
      // never dispatch it again.
      if (
        operation.workflowStep === WORKFLOW_STEP.CREATING ||
        operation.workflowStep === WORKFLOW_STEP.SYNCING ||
        operation.workflowStep === WORKFLOW_STEP.ACTIVE
      ) {
        const replicaId = operation?.replicaId ?? null;
        if (
          typeof replicaId === LOCAL_STR_STRING &&
          replicaId.length > 0
        ) {
          metadataWaitReplicaIds.push(replicaId);
        }
        continue;
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
          const dispatchError = new Error(
            executionResult.error ||
              QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_DISPATCH_FAILED,
          );
          if (executionResult.code) {
            dispatchError.code = executionResult.code;
          }
          if (executionResult.errorCode) {
            dispatchError.errorCode = executionResult.errorCode;
          }
          if (executionResult.deferRetry !== undefined) {
            dispatchError.deferRetry = executionResult.deferRetry;
          }
          if (executionResult.retryAfterMs !== undefined) {
            dispatchError.retryAfterMs = executionResult.retryAfterMs;
          }
          if (executionResult.participantFailures) {
            dispatchError.participantFailures = executionResult.participantFailures;
          }
          if (executionResult.firstFailedParticipant) {
            dispatchError.firstFailedParticipant = executionResult.firstFailedParticipant;
          }
          if (executionResult.cause) {
            dispatchError.cause = executionResult.cause;
          }
          throw dispatchError;
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
    return buildProvisioningCompletionSummary({
      requestedReplicaCount,
      resolvedReplicaCount: targetReplicaCount,
      minimumRoutableReplicaCount,
      routableReplicaCount: finalRoutableNodeIds.length,
      contractState: provisioningContractState,
      nextAction: provisioningNextAction,
      reasonCodes: provisioningReasonCodes,
      retryAfterMs: provisioningRetryAfterMs,
      epoch: provisioningEpoch,
    });
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

export {SQLQueryEngineInitialPartitionProvisioning};
