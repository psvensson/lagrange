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
  buildProvisioningCompletionSummary,
} from './provisioning-completion-summary.js';
import {shouldRetainDurableSchemaPlanningOperations} from
  './durable-schema-planning-retention.js';
import {buildSchemaProvisioningChildIntent} from
  './schema-provisioning-child-intent.js';
import {PLACEMENT_RESULT_FIELD} from
  '../partition/partition-placement-admission-constants.js';
import {
  buildFoundingAdmissionStatement,
} from '../rebalancer/replica-placement-owner-admission-statement.js';
import {
  PLACEMENT_OUTCOME,
  PLACEMENT_REFUSAL,
} from '../rebalancer/replica-placement-owner-constants.js';
import {
  classifyPlacementClass,
} from '../rebalancer/replica-placement-owner-order.js';

const DEFAULT_FOUND_SCHEMA_JOB_ID = 'provision';
const DEFAULT_FOUND_SOURCE_NODE_ID = 'node-1';
const FOUND_ENTRY_PREFIX = 'found';
const PLACEMENT_FOUND_REFUSED_CODE = 'PLACEMENT_FOUND_REFUSED';

function isFoundingPlacementAccepted(result, foundingIntentId) {
  if (!result || !Array.isArray(result.operationIds) ||
      result.operationIds.length === 0) {
    return false;
  }
  if (result.outcome === PLACEMENT_OUTCOME.ADMITTED) {
    return true;
  }
  const intentMatches = !result.foundingIntentId ||
    result.foundingIntentId === foundingIntentId;
  return result.outcome === PLACEMENT_OUTCOME.REFUSED &&
    result.reason === PLACEMENT_REFUSAL.ALREADY_FOUNDED &&
    intentMatches;
}

function throwFoundingPlacementError(partitionId, answer, result) {
  const failureCode = result?.reason || PLACEMENT_FOUND_REFUSED_CODE;
  const error = new Error(
    `Founding placement admission refused for ${partitionId}: ${failureCode}`,
  );
  error.code = failureCode;
  error.failureCode = failureCode;
  error.entryId = answer?.entryId || null;
  error.placementResult = result || null;
  error.admissionAnswer = answer || null;
  throw error;
}

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ONE_THOUSAND = 1000;
const LOCAL_STR_DISPATCH_OPERATIONS = 'dispatch_operations';
const LOCAL_STR_WAIT_REPLICA_METADATA = 'wait_replica_metadata';
const LOCAL_STR_WAIT_MINIMUM_REPLICA_METADATA = 'wait_minimum_replica_metadata';

const {
  CONTROL_PLANE_MUTATION_WORK_CLASS,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  OperationType,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  ReplicaOperationField,
  SERVICE_TYPE,
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
      explicitTargetNodeIds.length === 0 &&
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
        explicitTargetNodeIds,
        allowAdaptiveAdmissionConvergenceWait:
          this.tablePartitionTargetNodeConvergenceTimeoutMs ===
          QUERY_DEFAULTS.TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS,
        cancellationToken,
      });
      admissionConvergence = convergenceResult.admissionProbe || null;
      provisionTargetDiagnostics =
        convergenceResult.diagnostics || provisionTargetDiagnostics;
      provisionTargetNodeIds = this.resolveProvisionTargetNodeIdsForContext(
        explicitTargetNodeIds,
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
      for (const plan of Array.isArray(
        admissionConvergence.admittedTargetPlans,
      ) ? admissionConvergence.admittedTargetPlans : []) {
        if (
          typeof plan?.targetNodeId === LOCAL_STR_STRING &&
          plan.targetNodeId.length > 0 &&
          plan.operationCreationAdmission
        ) {
          operationCreationAdmissionByTargetNodeId.set(
            plan.targetNodeId,
            plan.operationCreationAdmission,
          );
        }
      }
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
      const childIntent = buildSchemaProvisioningChildIntent(
        context?.schemaJobId,
        targetNodeId,
      );
      try {
        admissionDecision =
          await this.rebalanceCoordinator.checkProvisioningAdmission({
            type: OperationType.ADD,
            partitionId,
            entityType: SERVICE_TYPE.PARTITION,
            entityId: partitionId,
            nodeId: targetNodeId,
            controlPlaneMutationWorkClass:
              CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE,
            operationIntentId: childIntent.operationIntentId,
            replicaIntentId: childIntent.replicaIntentId,
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
        if (admissionDecision.operationCreationAdmission) {
          operationCreationAdmissionByTargetNodeId.set(
            targetNodeId,
            admissionDecision.operationCreationAdmission,
          );
        }
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

    if (this.rebalanceCoordinator?.placementAdmissionEnabled === true &&
        routableNodeIdSet.size === 0 &&
        admittedTargetNodeIds.length > 0 &&
        requiredNewReplicaCount > 0) {
      await context?.assertProvisioningOwnership?.();
      const founded = await this.tryProvisionFoundingSetViaPlacementAdmission({
        partitionId,
        targetNodeIds: admittedTargetNodeIds.slice(0, requiredNewReplicaCount),
        context,
      });
      plannedOperations.push(...founded.plannedOperations);
      createdPlanningOperations.push(...founded.createdOperations);
    } else {
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

    const bootstrapTopology = this.buildInitialPartitionBootstrapTopology(
      partitionId,
      plannedOperations,
    );
    // The founding cohort's GENESIS stamp (owner decision O1): the second
    // and last stamp origin beside the creation owner's committed read.
    const bootstrapMembership = genesisStamp(bootstrapTopology.replicaIds,
      bootstrapTopology.founderNodeIds);
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

    // The provisioner stamps and executes only the rows whose bootstrap
    // dispatch hold it releases itself. The release is the coordinator's
    // compare-and-set on the DURABLE held row (PENDING, hold present), never
    // a write of this attempt's in-memory copy: a deterministic-intent retry
    // can hand back a row a dispatch lane already claimed or a prior attempt
    // already released, and writing that copy back would rewind the claim.
    // A row whose release is refused belongs to another owner: it stays in
    // the plan for counting and its outcome is awaited through its
    // routability like any other create, but it is never stamped or
    // executed here.
    const bootstrapStamp = Object.freeze({
      [ReplicaOperationField.REPLICA_IDS]: bootstrapTopology.replicaIds,
      [ReplicaOperationField.PEER_ADDRESSES]: bootstrapTopology.peerAddresses,
      [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]: bootstrapMembership,
      [ReplicaOperationField.BOOTSTRAP_TABLE_METADATA]: bootstrapTableMetadata,
      [ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA]:
        bootstrapPartitionMetadata,
    });
    const releasedOperationsById = new Map();
    for (const operation of plannedOperations) {
      throwIfCancellationRequested(cancellationToken);
      const release =
        await this.rebalanceCoordinator.releaseBootstrapTopologyDispatchHold(
          operation.operationId,
          bootstrapStamp,
        );
      if (release.released === true) {
        releasedOperationsById.set(operation.operationId, release.operation);
      }
    }

    const metadataWaitReplicaIds = [];
    for (const operation of plannedOperations) {
      throwIfCancellationRequested(cancellationToken);
      const releasedOperation =
        releasedOperationsById.get(operation.operationId);
      if (!releasedOperation) {
        if (
          typeof operation.replicaId === LOCAL_STR_STRING &&
          operation.replicaId.length > 0
        ) {
          metadataWaitReplicaIds.push(operation.replicaId);
        }
        continue;
      }
      const executionResult =
        await this.rebalanceCoordinator.executeOperation(releasedOperation, {
          ownerTurnPolicy: OPERATION_OWNER_TURN_POLICY.RETAIN,
        });
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

      if (
        typeof releasedOperation.replicaId === LOCAL_STR_STRING &&
        releasedOperation.replicaId.length > 0
      ) {
        metadataWaitReplicaIds.push(releasedOperation.replicaId);
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

  async tryProvisionFoundingSetViaPlacementAdmission({
    partitionId,
    targetNodeIds,
    context,
  }) {
    const coordinator = this.rebalanceCoordinator;
    const jobPrefix = context?.schemaJobId || DEFAULT_FOUND_SCHEMA_JOB_ID;
    const foundingIntentId = `${jobPrefix}:${partitionId}`;
    const sourceNodeId = this.nodeId || DEFAULT_FOUND_SOURCE_NODE_ID;
    const placementClass = classifyPlacementClass(partitionId);
    const formationLatchEpoch =
      coordinator.resolveFormationLatchEpochForPlacement(placementClass, partitionId);
    const statement = buildFoundingAdmissionStatement({
      partitionId,
      placementClass,
      foundingIntentId,
      targetNodeIds,
      sourceNodeId,
      formationLatchEpoch,
      positions: {},
    });
    const answer = await coordinator.admitPlacementStatement({
      intentKey: `${FOUND_ENTRY_PREFIX}:${foundingIntentId}`,
      statement,
    });
    const result = answer?.[PLACEMENT_RESULT_FIELD];
    if (!isFoundingPlacementAccepted(result, foundingIntentId)) {
      throwFoundingPlacementError(partitionId, answer, result);
    }
    const operations = await coordinator.materializePlacementAdmittedOperations({
      operationIds: result.operationIds,
      partitionId,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: partitionId,
      targetNodeIds,
      sourceNodeId,
      deferredBootstrap: true,
    });
    if (!Array.isArray(operations) ||
        operations.length !== result.operationIds.length) {
      return {
        provisioned: false,
        deferred: true,
        operations: null,
        plannedOperations: [],
        createdOperations: [],
        result,
        answer,
      };
    }
    const admitted = result.outcome === PLACEMENT_OUTCOME.ADMITTED;
    return {
      provisioned: true,
      deferred: false,
      operations,
      plannedOperations: operations,
      createdOperations: admitted ? operations : [],
      result,
      answer,
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

export {SQLQueryEngineInitialPartitionProvisioning};
