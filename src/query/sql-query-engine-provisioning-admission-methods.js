import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_EMPTY = '';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_1AM9G = '; ';
const LOCAL_STR_WARN = 'warn';
const TRANSIENT_PROVISIONING_SHORTFALL_REASONS = new Set([
  'cluster_member_unhealthy',
  'control_plane_write_unhealthy',
  'metadata_publication_degraded',
  'routing_not_ready',
]);
const AGGREGATE_TRANSIENT_PROVISIONING_SHORTFALL_REASONS = new Set([
  'insufficient_placement_eligible_nodes',
]);

const {
  OperationType,
  PROVISIONING_REJECTION_DETAIL_LIMIT,
  PROVISIONING_REJECTION_REASON_UNKNOWN,
  PROVISIONING_REJECTION_SUMMARY_NONE,
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
      rejectedTargetNodePlans.length === LOCAL_NUM_ZERO
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
        reasonCodes.length > LOCAL_NUM_ZERO ?
          reasonCodes.join(',') :
          PROVISIONING_REJECTION_REASON_UNKNOWN;
      summaryEntries.push(`${targetNodeId}:${reasonSummary}`);
      if (summaryEntries.length >= PROVISIONING_REJECTION_DETAIL_LIMIT) {
        break;
      }
    }

    return summaryEntries.length > LOCAL_NUM_ZERO ?
      summaryEntries.join(LOCAL_STR_1AM9G) :
      PROVISIONING_REJECTION_SUMMARY_NONE;
  }

  /**
   * Return true when rejected targets are blocked only by transient control
   * plane recovery/readiness reasons.
   * @param {Object[]} rejectedTargetNodePlans
   * @return {boolean}
   * @private
   */
  hasOnlyTransientProvisioningShortfall(rejectedTargetNodePlans) {
    if (
      !Array.isArray(rejectedTargetNodePlans) ||
      rejectedTargetNodePlans.length === LOCAL_NUM_ZERO
    ) {
      return false;
    }
    let foundTransientReason = false;
    for (const rejection of rejectedTargetNodePlans) {
      const blockingReasons = (Array.isArray(rejection?.blockingReasons) ?
        rejection.blockingReasons :
        []).map((reason) => String(reason || LOCAL_STR_EMPTY))
        .filter(Boolean);
      const reasonCodes = (Array.isArray(rejection?.reasonCodes) ?
        rejection.reasonCodes :
        []).map((reason) => String(reason || LOCAL_STR_EMPTY))
        .filter(Boolean);
      const reasons = [...blockingReasons, ...reasonCodes];
      if (reasons.length === LOCAL_NUM_ZERO) {
        return false;
      }
      const hasTransientReason = reasons.some((reason) =>
        TRANSIENT_PROVISIONING_SHORTFALL_REASONS.has(reason),
      );
      if (!hasTransientReason) {
        return false;
      }
      for (const blockingReason of blockingReasons) {
        if (
          !TRANSIENT_PROVISIONING_SHORTFALL_REASONS.has(blockingReason) &&
          !AGGREGATE_TRANSIENT_PROVISIONING_SHORTFALL_REASONS.has(
            blockingReason,
          )
        ) {
          return false;
        }
      }
      for (const reasonCode of reasonCodes) {
        if (!TRANSIENT_PROVISIONING_SHORTFALL_REASONS.has(reasonCode)) {
          return false;
        }
      }
      foundTransientReason = true;
    }
    return foundTransientReason;
  }

  /**
   * Resolve the fallback floor for default CREATE TABLE provisioning minimums.
   * Explicit caller minimums must still be honored exactly.
   * @param {Object} options
   * @return {number}
   * @private
   */
  resolveProvisioningShortfallFallbackMinimum(options = {}) {
    const implicitMinimum =
      Number.isInteger(options.implicitFallbackMinimumReplicaCount) &&
      options.implicitFallbackMinimumReplicaCount > LOCAL_NUM_ZERO ?
        options.implicitFallbackMinimumReplicaCount :
        LOCAL_NUM_ONE;
    if (
      options.hasExplicitMinimumRoutableReplicaCount === true ||
      options.maximumProvisionableReplicaCount <= LOCAL_NUM_ZERO ||
      !this.hasOnlyTransientProvisioningShortfall(
        options.rejectedTargetNodePlans,
      )
    ) {
      return implicitMinimum;
    }
    return LOCAL_NUM_ONE;
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
    throw new Error(
      QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX +
        String(details?.partitionId || LOCAL_STR_EMPTY) +
        `: required=${details?.minimumRoutableReplicaCount || LOCAL_NUM_ZERO}, ` +
        `provisionable=${details?.maximumProvisionableReplicaCount || LOCAL_NUM_ZERO}, ` +
        `target=${details?.targetReplicaCount || LOCAL_NUM_ZERO}, ` +
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
    if (!Array.isArray(operations) || operations.length === LOCAL_NUM_ZERO) {
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
