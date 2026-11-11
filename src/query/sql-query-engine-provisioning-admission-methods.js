import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {
  buildSchemaProvisioningChildIntent,
} from './schema-provisioning-child-intent.js';
import {
  OPERATION_CREATION_ADMISSION_DENIAL_CLASS,
  OPERATION_CREATION_ADMISSION_ERROR_CODE,
  classifyOperationCreationAdmissionDenial,
} from '../rebalancer/rebalance-coordinator-operation-creation-admission.js';
import {
  PROVISIONING_TARGET_ADMISSION_STATE,
  settleProvisioningTargetAdmission,
} from './provisioning-target-admission-settle.js';
import {shouldRetainDurableSchemaPlanningOperations} from
  './durable-schema-planning-retention.js';
import {REPLICA_OPERATION_VISIBILITY_READ_MODE} from
  '../rebalancer/replica-operation-repository.js';
import {buildReplicaOperationProgressSnapshot} from
  '../rebalancer/replica-status.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_SEMI_SPACE = '; ';
const LOCAL_STR_WARN = 'warn';
const PROVISIONING_FOUNDING_BELOW_REQUESTED_LOG_MSG =
  'Founding table partition below its requested replica count';
const PROVISIONING_FOUNDING_BELOW_REQUESTED_REASON = Object.freeze({
  TARGETS_REFUSED: 'founding_targets_refused',
  CANDIDATE_NODES_SHORT: 'founding_candidate_nodes_short',
});
const SCHEMA_JOB_HELD_FOUNDER_RELEASED_REASON =
  'Schema job ended with this founding operation held unstamped';
const PROVISIONING_ADMISSION_UNSETTLED_MESSAGE =
  'Provisioning unavailable: target admission did not settle within the ' +
  'statement budget for partition ';

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
      admissionState: rejection?.admissionState || null,
      reentries: rejection?.reentries ?? null,
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
    if (
      !this.rebalanceCoordinator ||
      typeof this.rebalanceCoordinator.failOperation !== LOCAL_STR_FUNCTION
    ) {
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

    const settled = await this.admitProvisioningTargets({
      partitionId,
      targetNodeIds: candidateTargetNodeIds,
      schemaJobId: options.schemaJobId,
      timeoutBudget: options.timeoutBudget || null,
      cancellationToken: options.cancellationToken || null,
    });
    return {
      existingRoutableNodeIds,
      candidateTargetNodeIds,
      ...settled,
      maximumProvisionableReplicaCount:
        existingRoutableNodeIds.length + settled.admittedTargetNodeIds.length,
    };
  }

  /**
   * Settle admission for each founding target through the one settle path
   * (provisioning-target-admission-settle.js) and log every refusal and
   * every unsettled target with its typed reasons. An UNSETTLED target is
   * neither admitted nor rejected.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async admitProvisioningTargets(options) {
    const admittedTargetNodeIds = [];
    const admittedTargetPlans = [];
    const rejectedTargetNodePlans = [];
    const unsettledTargetNodePlans = [];
    for (const targetNodeId of options.targetNodeIds) {
      const settled = await settleProvisioningTargetAdmission(this, {
        partitionId: options.partitionId,
        targetNodeId,
        childIntent: buildSchemaProvisioningChildIntent(
          options.schemaJobId,
          targetNodeId,
        ),
      }, options);
      if (settled.state === PROVISIONING_TARGET_ADMISSION_STATE.ADMITTED) {
        admittedTargetNodeIds.push(targetNodeId);
        admittedTargetPlans.push(Object.freeze({
          targetNodeId,
          operationCreationAdmission:
            settled.decision.operationCreationAdmission,
        }));
        continue;
      }
      const plan = {
        ...this.createProvisioningTargetRejection(
          targetNodeId,
          this.buildProvisioningAdmissionDenialError(targetNodeId, settled),
        ),
        admissionState: settled.state,
        reentries: settled.reentries,
      };
      (settled.state === PROVISIONING_TARGET_ADMISSION_STATE.REFUSED ?
        rejectedTargetNodePlans : unsettledTargetNodePlans).push(plan);
      this.logProvisioningTargetRejection(options.partitionId, targetNodeId,
        plan);
    }
    return {
      admittedTargetNodeIds,
      admittedTargetPlans: Object.freeze(admittedTargetPlans),
      rejectedTargetNodePlans,
      unsettledTargetNodePlans,
    };
  }

  /**
   * The error a denied settle is described by: the thrown one, or one built
   * from the returned observation.
   * @param {string} targetNodeId
   * @param {Object} settled
   * @return {Error}
   * @private
   */
  buildProvisioningAdmissionDenialError(targetNodeId, settled) {
    const decision = settled.decision;
    if (decision?.error && typeof decision.error === LOCAL_STR_OBJECT) {
      return decision.error;
    }
    const error = new Error(`Provisioning admission denied on ${targetNodeId}`);
    error.admissionResult = decision?.admissionResult || null;
    return error;
  }

  /**
   * Founding a partition with fewer members than requested is an explicit
   * decision, taken only on non-transient grounds (a transient admission
   * deferral fails the statement retryably before this point): every
   * per-target refusal it rests on, or the shortfall of candidate nodes.
   * @param {Object} details
   * @return {boolean} whether the cohort is founded below the request
   * @private
   */
  logProvisioningFoundingBelowRequested(details) {
    if (details.foundingReplicaCount >= details.requestedReplicaCount) {
      return false;
    }
    const refusals = Array.isArray(details.rejectedTargetNodePlans) ?
      details.rejectedTargetNodePlans : [];
    this.logger?.warn?.(PROVISIONING_FOUNDING_BELOW_REQUESTED_LOG_MSG, {
      partitionId: details.partitionId,
      requestedReplicaCount: details.requestedReplicaCount,
      foundingReplicaCount: details.foundingReplicaCount,
      minimumRoutableReplicaCount: details.minimumRoutableReplicaCount,
      reason: refusals.length > 0 ?
        PROVISIONING_FOUNDING_BELOW_REQUESTED_REASON.TARGETS_REFUSED :
        PROVISIONING_FOUNDING_BELOW_REQUESTED_REASON.CANDIDATE_NODES_SHORT,
      candidateTargetNodeIds: details.candidateTargetNodeIds,
      refusals: this.summarizeProvisioningTargetRejections(refusals),
    });
    return true;
  }

  /**
   * Fail the statement, retryably, when a founding target's admission did
   * not settle within its budget: the cohort is never founded smaller on a
   * transient deferral.
   * @param {string} partitionId
   * @param {Object[]} unsettledTargetNodePlans
   * @return {void}
   * @private
   */
  throwIfProvisioningAdmissionUnsettled(partitionId, unsettledTargetNodePlans) {
    if (!Array.isArray(unsettledTargetNodePlans) ||
        unsettledTargetNodePlans.length === 0) {
      return;
    }
    const error = new Error(PROVISIONING_ADMISSION_UNSETTLED_MESSAGE +
      `${partitionId}: ` +
      this.summarizeProvisioningTargetRejections(unsettledTargetNodePlans));
    error.code = QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE;
    // Retryable for every consumer, the managed split and merge retry
    // policies included (they read `retryable`, not the code).
    error.retryable = true;
    error.unsettledTargetNodePlans = unsettledTargetNodePlans;
    throw error;
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
      // below. Keep durable CDC/replay dispatch held until the complete
      // bootstrap cohort is stamped, then skip the redundant local trigger.
      deferDispatchUntilBootstrapTopology: true,
      emitOperationCreated: false,
      operationIntentId: options.childIntent.operationIntentId,
      replicaIntentId: options.childIntent.replicaIntentId,
      parentWorkflowFenceToken: options.parentWorkflowFenceToken,
    };
  }

  /**
   * Create one initial-provisioning ADD operation. The creation boundary
   * re-observes admission; when it re-enters on the admission owner's own
   * transient deferral, the settle path first waits for what the owner
   * names as clearing that deferral (the error is its prior denial) and
   * then settles admission again, all within the statement budget. A
   * target still unsettled at the bound fails the statement retryably
   * (never a per-target rejection); a refusal is rethrown as the rejection
   * it is.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async createProvisioningOperationWithAdmissionReentry(options) {
    let admission = options.operationCreationAdmission || null;
    for (;;) {
      try {
        return await this.rebalanceCoordinator.createOperation(
          this.buildProvisioningCreateOperationMove(options, admission),
        );
      } catch (error) {
        if (
          !options.supportsAdmissionPrecheck ||
          error?.code !== OPERATION_CREATION_ADMISSION_ERROR_CODE ||
          classifyOperationCreationAdmissionDenial(error) !==
            OPERATION_CREATION_ADMISSION_DENIAL_CLASS.TRANSIENT_REENTER
        ) {
          throw error;
        }
        const settled = await settleProvisioningTargetAdmission(this, options,
          {...options, priorDenial: error});
        if (settled.state === PROVISIONING_TARGET_ADMISSION_STATE.REFUSED) {
          throw this.buildProvisioningAdmissionDenialError(
            options.targetNodeId, settled);
        }
        if (settled.state === PROVISIONING_TARGET_ADMISSION_STATE.UNSETTLED) {
          this.throwIfProvisioningAdmissionUnsettled(options.partitionId, [{
            ...this.createProvisioningTargetRejection(options.targetNodeId,
              error),
            admissionState: settled.state,
            reentries: settled.reentries,
          }]);
        }
        admission = settled.decision.operationCreationAdmission || null;
      }
    }
  }

  /**
   * The contract for a founding left partly created by an unsettled
   * target (the creation boundary of target B can re-enter after target
   * A's operation was persisted): the statement fails retryably and what
   * this attempt created is kept only where the retry is guaranteed to
   * complete it. Under a schema job, the job's own deterministic,
   * dispatch-deferred, unstamped founding operations are retained: the
   * schema provisioning job owner keeps the job PENDING on the retryable
   * code and runs it again; the retry reads the cohort UNFOUNDED (nothing is
   * stamped before every founder is created), re-creating (job, target)
   * collides with the held operation and reuses it, and the cohort is
   * stamped once. Anything else (no schema job: NO_DURABLE_INTENT, or
   * operations not of that shape) is failed before the error propagates, so
   * no held half-founding outlives the statement.
   * @param {Object} context the provisioning context
   * @param {string} partitionId
   * @param {Object[]} createdPlanningOperations
   * @param {Error} error the statement's failure
   * @return {Promise<void>}
   * @private
   */
  /**
   * Fail every founding operation a schema job still holds unstamped: its
   * deterministic (job, target) ADDs whose bootstrap dispatch is still held
   * (stamping releases the hold) and that are not terminal. Called by the
   * schema provisioning job owner before the job ends, so a held founder
   * never outlives its job. A read or fail that cannot complete throws.
   * @param {{jobId: string, partitionId: string}} job
   * @return {Promise<Array<string>>} the released operation ids
   */
  async releaseSchemaJobHeldFoundingOperations(job) {
    const operations = await this.rebalanceCoordinator.getOperationsByEntity(
      SERVICE_TYPE.PARTITION,
      job.partitionId,
      {visibilityReadMode:
        REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED},
    );
    const held = operations.filter((operation) =>
      buildReplicaOperationProgressSnapshot(operation).terminal !== true &&
      shouldRetainDurableSchemaPlanningOperations({schemaJobId: job.jobId},
        [operation]));
    for (const operation of held) {
      await this.rebalanceCoordinator.failOperation(operation,
        SCHEMA_JOB_HELD_FOUNDER_RELEASED_REASON, {logLevel: LOCAL_STR_WARN});
    }
    return held.map((operation) => operation.operationId);
  }

  async releaseUnsettledFoundingOperations(
    context,
    partitionId,
    createdPlanningOperations,
    error,
  ) {
    if (!Array.isArray(error?.unsettledTargetNodePlans) ||
        createdPlanningOperations.length === 0 ||
        shouldRetainDurableSchemaPlanningOperations(context,
          createdPlanningOperations)) {
      return;
    }
    await this.abortProvisioningPlanningOperations(
      partitionId,
      createdPlanningOperations,
      QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_ABORTED_PRE_DISPATCH,
    );
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
