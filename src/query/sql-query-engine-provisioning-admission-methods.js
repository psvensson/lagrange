import {throwIfCancellationRequested} from './query-cancellation.js';
import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {
  createTimeoutBudgetError, getRemainingBudgetMs, TIMEOUT_BUDGET_CLASSIFICATION,
} from '../control-plane/timeout-budget.js';
import {
  buildSchemaProvisioningChildIntent,
} from './schema-provisioning-child-intent.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_PARTITION_PROVISIONING = 'partition_provisioning';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_SEMI_SPACE = '; ';
const LOCAL_STR_WARN = 'warn';
const LOCAL_STR_ADMISSION_REENTER_CODE = 'OPERATION_CREATION_ADMISSION_REENTER';
const LOCAL_STR_PLANNING_IDENTITY_CHANGED =
  'readiness_planning_identity_changed';

const {
  CONTROL_PLANE_MUTATION_WORK_CLASS,
  OperationType,
  PROVISIONING_REJECTION_DETAIL_LIMIT,
  PROVISIONING_REJECTION_REASON_UNKNOWN,
  PROVISIONING_REJECTION_SUMMARY_NONE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  SERVICE_TYPE,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineProvisioningAdmissionMethods {
  /**
   * Return true when one create-operation error was denied by admission.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isProvisioningAdmissionDeniedError(error) {
    if (!error || typeof error !== LOCAL_STR_OBJECT) {
      return false;
    }
    const admissionResult = error.admissionResult;
    if (!admissionResult || typeof admissionResult !== LOCAL_STR_OBJECT) {
      return false;
    }
    return admissionResult.allowed === false;
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
        reasonEntry?.code || reasonEntry?.reason || reasonEntry || '',
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
      blockingReasons: Array.isArray(rejection?.blockingReasons) ?
        rejection.blockingReasons :
        [],
      reasonCodes: Array.isArray(rejection?.reasonCodes) ?
        rejection.reasonCodes :
        [],
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
      const targetNodeId = String(rejection?.targetNodeId || '');
      if (!targetNodeId) {
        continue;
      }
      const reasonCodes = [];
      for (const reasonCode of [
        ...(Array.isArray(rejection?.blockingReasons) ?
          rejection.blockingReasons :
          []),
        ...(Array.isArray(rejection?.reasonCodes) ? rejection.reasonCodes : []),
      ]) {
        const normalizedReasonCode = String(reasonCode || '');
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
        reasonCodes.length > 0 ?
          reasonCodes.join(',') :
          PROVISIONING_REJECTION_REASON_UNKNOWN;
      summaryEntries.push(`${targetNodeId}:${reasonSummary}`);
      if (summaryEntries.length >= PROVISIONING_REJECTION_DETAIL_LIMIT) {
        break;
      }
    }

    return summaryEntries.length > 0 ?
      summaryEntries.join(LOCAL_STR_SEMI_SPACE) :
      PROVISIONING_REJECTION_SUMMARY_NONE;
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
        candidateTargetNodeIds: Array.isArray(details?.candidateTargetNodeIds) ?
          details.candidateTargetNodeIds :
          [],
        existingRoutableNodeIds: Array.isArray(details?.existingRoutableNodeIds) ?
          details.existingRoutableNodeIds :
          [],
        plannedTargetNodeIds: Array.isArray(details?.plannedTargetNodeIds) ?
          details.plannedTargetNodeIds :
          [],
        rejectedTargets: Array.isArray(details?.rejectedTargetNodePlans) ?
          details.rejectedTargetNodePlans :
          [],
        rejectionSummary,
      },
    );
    const error = new Error(
      QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX +
        String(details?.partitionId || '') +
        `: required=${details?.minimumRoutableReplicaCount || 0}, ` +
        `provisionable=${details?.maximumProvisionableReplicaCount || 0}, ` +
        `target=${details?.targetReplicaCount || 0}, ` +
        `rejected=${rejectionSummary}`,
    );
    if (details?.retryable === true) {
      error.code =
        QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE;
    }
    throw error;
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

    this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_ABORT_PENDING, {
      partitionId,
      operationCount: operations.length,
      reason,
    });

    for (const operation of operations) {
      if (!operation || typeof operation !== LOCAL_STR_OBJECT) {
        continue;
      }
      try {
        await this.rebalanceCoordinator.failOperation(operation, reason, {
          logLevel: LOCAL_STR_WARN,
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
      typeof this.rebalanceCoordinator.checkProvisioningAdmission === LOCAL_STR_FUNCTION
    );
  }

  assertProvisioningAttemptBudget(timeoutBudget) {
    if (!timeoutBudget ||
        getRemainingBudgetMs(timeoutBudget, {now: this.nowFn}) !== 0) {
      return;
    }
    const error = createTimeoutBudgetError({
      message: QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_DEADLINE_EXHAUSTED,
      budget: timeoutBudget,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
      nestedOperation: LOCAL_STR_PARTITION_PROVISIONING,
      now: this.nowFn,
    });
    error.code = error.errorCode;
    throw error;
  }

  async readProvisioningTargetAdmission({
    partitionId, targetNodeId, childIntent, timeoutBudget, cancellationToken,
  }) {
    throwIfCancellationRequested(cancellationToken);
    this.assertProvisioningAttemptBudget(timeoutBudget);
    let decision;
    try {
      decision = await this.rebalanceCoordinator.checkProvisioningAdmission({
        type: OperationType.ADD,
        partitionId,
        entityType: SERVICE_TYPE.PARTITION,
        entityId: partitionId,
        nodeId: targetNodeId,
        controlPlaneMutationWorkClass:
          CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE,
        ...childIntent,
      });
    } catch (error) {
      if (!this.isProvisioningAdmissionDeniedError(error)) {
        throw error;
      }
      decision = {allowed: false, admissionResult: error.admissionResult, error};
    }
    throwIfCancellationRequested(cancellationToken);
    this.assertProvisioningAttemptBudget(timeoutBudget);

    if (decision?.allowed === true) {
      return decision;
    }
    if (decision?.allowed === false) {
      return {
        allowed: false,
        rejection: this.createProvisioningTargetRejection(targetNodeId, {
          admissionResult: decision.admissionResult,
          message: decision.error?.message,
        }),
      };
    }
    const error = new Error(`Provisioning admission unavailable for ${targetNodeId}`);
    error.code = QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE;
    throw error;
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
    const partitionId = String(options.partitionId || '');
    const targetNodeIds = this.normalizeTargetNodeIds(options.targetNodeIds);
    const existingRoutableNodeIds = this.getRoutablePartitionServiceNodeIds(
      partitionId, options.routingReadinessDimension,
    );
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

    const {requiredReplicaCount} = options;
    const checkedTargetNodeIds = [];
    const admittedTargetNodeIds = [];
    const acceptedTargetPlans = [];
    const rejectedTargetNodePlans = [];
    for (const targetNodeId of candidateTargetNodeIds) {
      if (Number.isInteger(requiredReplicaCount) &&
          existingRoutableNodeIds.length + admittedTargetNodeIds.length >=
            requiredReplicaCount) {
        break;
      }
      const admissionDecision = await this.readProvisioningTargetAdmission({
        partitionId,
        targetNodeId,
        childIntent: buildSchemaProvisioningChildIntent(options.schemaJobId, targetNodeId),
        timeoutBudget: options.timeoutBudget,
        cancellationToken: options.cancellationToken,
      });
      checkedTargetNodeIds.push(targetNodeId);
      if (admissionDecision.allowed) {
        admittedTargetNodeIds.push(targetNodeId);
        acceptedTargetPlans.push(Object.freeze({
          targetNodeId,
          operationCreationAdmission:
            admissionDecision.operationCreationAdmission,
        }));
        continue;
      }

      rejectedTargetNodePlans.push(admissionDecision.rejection);
    }

    return {
      existingRoutableNodeIds,
      candidateTargetNodeIds: checkedTargetNodeIds,
      admittedTargetNodeIds,
      admittedTargetPlans: Object.freeze(acceptedTargetPlans),
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
   * Return true when createOperation failed only because the control-plane
   * planning generation advanced after admission precheck.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isPlanningIdentityChangedReentryError(error) {
    if (error?.code !== LOCAL_STR_ADMISSION_REENTER_CODE) {
      return false;
    }
    const reasons = this.normalizeProvisioningReasonCodes(
      error?.reasonCodes || error?.admissionResult?.blockingReasons,
    );
    return reasons.includes(LOCAL_STR_PLANNING_IDENTITY_CHANGED);
  }

  /**
   * Build the createOperation move descriptor for one initial partition target.
   * @param {Object} options
   * @param {Object|null} operationCreationAdmission
   * @return {Object}
   * @private
   */
  buildProvisioningCreateOperationMove(options, operationCreationAdmission) {
    return {
      type: OperationType.ADD,
      partitionId: options.partitionId,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: options.partitionId,
      nodeId: options.targetNodeId,
      operationCreationAdmission: operationCreationAdmission || null,
      controlPlaneMutationWorkClass:
        CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE,
      // Initial partition provisioning executes these operations inline
      // once the complete bootstrap cohort is stamped. The durable hold is
      // the one dispatch authority until then: the owner's claim refuses a
      // held row on every lane, and the provisioner's hold release is a
      // compare-and-set on the durable held row.
      deferDispatchUntilBootstrapTopology: true,
      operationIntentId: options.childIntent.operationIntentId,
      replicaIntentId: options.childIntent.replicaIntentId,
      parentWorkflowFenceToken: options.parentWorkflowFenceToken,
    };
  }

  /**
   * Refresh provisioning admission for one target after a planning-generation
   * advance while preserving the deterministic child intent identity.
   * @param {Object} options
   * @return {Promise<Object|null>}
   * @private
   */
  async refreshProvisioningOperationAdmission(options) {
    const decision = await this.readProvisioningTargetAdmission(options);
    return decision.allowed ? decision.operationCreationAdmission : null;
  }

  /**
   * Create one initial-provisioning ADD operation, re-entering admission once
   * if a concurrent control-plane CDC event advanced the planning generation.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async createProvisioningOperationWithAdmissionReentry(options) {
    const createWithAdmission = (admission) =>
      this.rebalanceCoordinator.createOperation(
        this.buildProvisioningCreateOperationMove(options, admission),
        {assertFreshCreationAllowed: options.assertFreshCreationAllowed},
      );
    let admission = options.operationCreationAdmission || null;
    try {
      return await createWithAdmission(admission);
    } catch (error) {
      if (
        !options.supportsAdmissionPrecheck ||
        !this.isPlanningIdentityChangedReentryError(error)
      ) {
        throw error;
      }
      admission = await this.refreshProvisioningOperationAdmission(options);
      if (!admission) {
        throw error;
      }
      return createWithAdmission(admission);
    }
  }
}

function createSQLQueryEngineProvisioningAdmissionMethods() {
  return Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(
        SQLQueryEngineProvisioningAdmissionMethods.prototype,
      ),
    ).filter(([name]) => name !== 'constructor'),
  );
}

export {createSQLQueryEngineProvisioningAdmissionMethods};
