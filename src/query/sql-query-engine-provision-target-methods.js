import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_THREE = 3;

const {
  AddressManager,
  ENTITY_TYPE,
  NUM,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS,
  TABLE_PARTITION_TARGET_NODE_CONVERGENCE_REASON,
  TABLE_PARTITION_TARGET_NODE_WAIT,
  TIMEOUT_BUDGET_CLASSIFICATION,
  buildOwnerContractOutcome,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineProvisionTargetMethods {
  /**
   * Resolve the minimum routable replica cohort required before provisioning
   * can continue.
   * @param {number|undefined|null} requestedMinimumReplicaCount
   * @param {number} targetReplicaCount
   * @return {number}
   * @private
   */
  resolveMinimumProvisioningReplicaCount(
    requestedMinimumReplicaCount,
    targetReplicaCount,
  ) {
    if (
      !Number.isInteger(requestedMinimumReplicaCount) ||
      requestedMinimumReplicaCount <= LOCAL_NUM_ZERO
    ) {
      return targetReplicaCount;
    }

    return Math.max(
      LOCAL_NUM_ONE,
      Math.min(requestedMinimumReplicaCount, targetReplicaCount),
    );
  }

  /**
   * Preserve one quorum-sized floor for implicit RF3+ provisioning fallback.
   * Smaller cohorts still degrade to one replica so single-node bootstrap and
   * legacy RF2 owner paths remain backward-compatible.
   * @param {number} requestedReplicaCount
   * @param {number|undefined|null} visibleActiveNodeCount
   * @return {number}
   * @private
   */
  resolveImplicitProvisioningFallbackReplicaCount(
    requestedReplicaCount,
    visibleActiveNodeCount,
  ) {
    const normalizedReplicaCount =
      Number.isInteger(requestedReplicaCount) && requestedReplicaCount > 0 ?
        requestedReplicaCount :
        1;
    const normalizedVisibleActiveNodeCount =
      Number.isInteger(visibleActiveNodeCount) && visibleActiveNodeCount > 0 ?
        visibleActiveNodeCount :
        0;
    if (
      normalizedReplicaCount < LOCAL_NUM_THREE ||
      normalizedVisibleActiveNodeCount <= LOCAL_NUM_ONE
    ) {
      return LOCAL_NUM_ONE;
    }
    return this.calculateQuorumReplicaCount(normalizedReplicaCount);
  }

  /**
   * Wait for the active-node cache to expose enough provisioning targets.
   * @param {Object} options
   * @param {string} options.partitionId
   * @param {number} options.requiredReplicaCount
   * @param {Object} options.timeoutBudget
   * @param {string[]} [options.explicitTargetNodeIds]
   * @param {number} [options.maxWaitMs]
   * @param {boolean} [options.failOnTimeout]
   * @return {Promise<Object>}
   * @private
   */
  async waitForProvisionTargetNodeIds(options = {}) {
    const requiredReplicaCount =
      Number.isInteger(options.requiredReplicaCount) &&
      options.requiredReplicaCount > 0 ?
        options.requiredReplicaCount :
        1;
    const partitionId = String(options.partitionId || '');
    const explicitTargetNodeIds = this.normalizeTargetNodeIds(
      options.explicitTargetNodeIds,
    );
    let resolution =
      this.resolveProvisionTargetNodeIdsWithDiagnostics(requiredReplicaCount);
    let resolvedNodeIds = this.resolveProvisionTargetNodeIdsForContext(
      explicitTargetNodeIds,
      requiredReplicaCount,
      resolution.diagnostics,
    );
    let lastDiagnostics = resolution.diagnostics;
    let lastAdmissionProbe = null;
    let timedOut = false;
    const failOnTimeout = options.failOnTimeout !== false;
    const allowAdaptiveAdmissionConvergenceWait =
      options.allowAdaptiveAdmissionConvergenceWait === true;
    const maxWaitMs =
      Number.isFinite(options.maxWaitMs) && options.maxWaitMs > 0 ?
        Math.floor(options.maxWaitMs) :
        this.tablePartitionProvisioningTimeoutMs;
    const effectiveMaxWaitMs =
      allowAdaptiveAdmissionConvergenceWait &&
      explicitTargetNodeIds.length === LOCAL_NUM_ZERO &&
      Number.isInteger(lastDiagnostics?.activeNodeRowCount) &&
      lastDiagnostics.activeNodeRowCount >= requiredReplicaCount ?
        Math.min(
          this.tablePartitionProvisioningTimeoutMs,
          Math.max(maxWaitMs, TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS),
        ) :
        maxWaitMs;
    const waitTimeoutMs = Math.max(
      this.tablePartitionProvisioningPollIntervalMs,
      Math.min(effectiveMaxWaitMs, this.tablePartitionProvisioningTimeoutMs),
    );
    const refreshResolution = async () => {
      resolution =
        this.resolveProvisionTargetNodeIdsWithDiagnostics(requiredReplicaCount);
      lastDiagnostics = resolution.diagnostics;
      resolvedNodeIds = this.resolveProvisionTargetNodeIdsForContext(
        explicitTargetNodeIds,
        requiredReplicaCount,
        lastDiagnostics,
      );
      if (!partitionId || !this.supportsProvisioningAdmissionPrecheck()) {
        lastAdmissionProbe = null;
        return resolvedNodeIds.length >= requiredReplicaCount;
      }
      lastAdmissionProbe = await this.probeProvisioningTargetAdmission({
        partitionId,
        targetNodeIds: resolvedNodeIds,
      });
      return (
        lastAdmissionProbe.maximumProvisionableReplicaCount >=
        requiredReplicaCount
      );
    };
    if (await refreshResolution()) {
      return this.buildProvisionTargetNodeConvergenceResult({
        nodeIds: resolvedNodeIds,
        diagnostics: lastDiagnostics,
        admissionProbe: lastAdmissionProbe,
        timedOut,
        requiredReplicaCount,
        waitedMs: LOCAL_NUM_ZERO,
      });
    }

    const waitStartedAt = this.nowFn();
    try {
      await this.waitForCondition(
        refreshResolution,
        waitTimeoutMs,
        this.tablePartitionProvisioningPollIntervalMs,
        QUERY_ERROR_MSG.TABLE_PARTITION_TARGET_NODE_TIMEOUT_PREFIX +
          partitionId,
        {
          timeoutBudget: options.timeoutBudget || null,
          classification:
            TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
          nestedOperation: TABLE_PARTITION_TARGET_NODE_WAIT,
        },
      );
    } catch (error) {
      timedOut = true;
      const timeoutLogPayload = {
        partitionId,
        requiredReplicaCount,
        maxWaitMs: waitTimeoutMs,
        requestedMaxWaitMs: maxWaitMs,
        allowAdaptiveAdmissionConvergenceWait,
        waitedMs: this.nowFn() - waitStartedAt,
        diagnostics: lastDiagnostics,
        admissionProbe: lastAdmissionProbe,
      };
      if (failOnTimeout) {
        this.logger.error(
          QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT,
          timeoutLogPayload,
        );
        throw error;
      }
      this.logger.warn(
        QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT,
        timeoutLogPayload,
      );
    }

    if (lastDiagnostics?.usedDegradedFallback && !timedOut) {
      this.logger.warn(
        QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_FALLBACK_USED,
        {
          partitionId,
          requiredReplicaCount,
          diagnostics: lastDiagnostics,
        },
      );
    }

    return this.buildProvisionTargetNodeConvergenceResult({
      nodeIds: resolvedNodeIds,
      diagnostics: lastDiagnostics,
      admissionProbe: lastAdmissionProbe,
      timedOut,
      requiredReplicaCount,
      waitedMs: this.nowFn() - waitStartedAt,
    });
  }

  buildProvisionTargetNodeConvergenceResult(options = {}) {
    const timedOut = options.timedOut === true;
    const diagnostics =
      options?.diagnostics && typeof options.diagnostics === LOCAL_STR_OBJECT ?
        options.diagnostics :
        null;
    const reasonCodes = [];
    if (timedOut) {
      reasonCodes.push(
        TABLE_PARTITION_TARGET_NODE_CONVERGENCE_REASON.WAIT_TIMEOUT,
      );
    }
    if (diagnostics?.usedDegradedFallback === true) {
      reasonCodes.push(
        TABLE_PARTITION_TARGET_NODE_CONVERGENCE_REASON.DEGRADED_FALLBACK_USED,
      );
    }
    const contractOutcome = timedOut ?
      buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      }) :
      buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.READY,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
      });
    return {
      ...contractOutcome,
      nodeIds: Array.isArray(options.nodeIds) ? options.nodeIds : [],
      diagnostics,
      admissionProbe:
        options?.admissionProbe &&
        typeof options.admissionProbe === LOCAL_STR_OBJECT ?
          options.admissionProbe :
          null,
      timedOut,
      requiredReplicaCount:
        Number.isInteger(options.requiredReplicaCount) &&
        options.requiredReplicaCount > LOCAL_NUM_ZERO ?
          options.requiredReplicaCount :
          LOCAL_NUM_ONE,
      waitedMs:
        Number.isFinite(options.waitedMs) &&
        options.waitedMs > LOCAL_NUM_ZERO ?
          Math.floor(options.waitedMs) :
          LOCAL_NUM_ZERO,
      retryAfterMs: timedOut ?
        Math.max(NUM.ONE, this.tablePartitionProvisioningPollIntervalMs) :
        NUM.ZERO,
      reasonCodes: Object.freeze(reasonCodes),
    };
  }

  /**
   * Build the explicit bootstrap cohort for initial table partition creation.
   * @param {string} partitionId - Partition ID.
   * @param {Array<Object>} plannedOperations - Planned ADD operations.
   * @return {Object} Replica IDs and peer addresses for the initial cohort.
   * @private
   */
  buildInitialPartitionBootstrapTopology(partitionId, plannedOperations) {
    const addressManager = AddressManager.getInstance();
    const replicaIds = [];
    const peerAddresses = [];
    const seenReplicaIds = new Set();
    const currentServices = this.getPartitionServiceRows(partitionId);

    for (const service of currentServices) {
      const serviceReplicaId =
        service?.service_id || service?.replica_id || null;
      const nodeId = service?.node_id || service?.nodeId || null;
      if (
        typeof serviceReplicaId !== LOCAL_STR_STRING ||
        serviceReplicaId.length === LOCAL_NUM_ZERO
      ) {
        continue;
      }
      if (!seenReplicaIds.has(serviceReplicaId)) {
        seenReplicaIds.add(serviceReplicaId);
        replicaIds.push(serviceReplicaId);
      }
      if (
        typeof service?.address === LOCAL_STR_STRING &&
        service.address.length > LOCAL_NUM_ZERO
      ) {
        peerAddresses.push(service.address);
        continue;
      }
      if (
        typeof nodeId === LOCAL_STR_STRING &&
        nodeId.length > LOCAL_NUM_ZERO
      ) {
        peerAddresses.push(
          addressManager.format(
            nodeId,
            ENTITY_TYPE.PARTITION,
            serviceReplicaId,
          ),
        );
      }
    }

    for (const operation of plannedOperations) {
      const replicaId = operation?.replicaId || null;
      const nodeId = operation?.targetNodeId || operation?.nodeId || null;
      if (
        typeof replicaId !== LOCAL_STR_STRING ||
        replicaId.length === LOCAL_NUM_ZERO
      ) {
        continue;
      }
      if (!seenReplicaIds.has(replicaId)) {
        seenReplicaIds.add(replicaId);
        replicaIds.push(replicaId);
      }
      if (
        typeof nodeId === LOCAL_STR_STRING &&
        nodeId.length > LOCAL_NUM_ZERO
      ) {
        peerAddresses.push(
          addressManager.format(nodeId, ENTITY_TYPE.PARTITION, replicaId),
        );
      }
    }

    return {
      replicaIds,
      peerAddresses: [...new Set(peerAddresses)],
    };
  }
}

function createSQLQueryEngineProvisionTargetMethods() {
  return Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(
        SQLQueryEngineProvisionTargetMethods.prototype,
      ),
    ).filter(([name]) => name !== 'constructor'),
  );
}

export {createSQLQueryEngineProvisionTargetMethods};
