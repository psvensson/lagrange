import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {throwIfCancellationRequested} from './query-cancellation.js';
import {founderNodeIdsOfPlacement} from
  '../raft/raft-rs-committed-peer-address.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_UNAVAILABLE = 'unavailable';
const LOCAL_STR_ELIGIBLE = 'eligible';
const LOCAL_STR_READY_LEASE_EXPIRED = 'ready_lease_expired';
const LOCAL_STR_PROVISIONING_UNAVAILABLE = 'provisioning_unavailable';
const TARGET_NODE_WAIT_LOG_LEVEL = Object.freeze({
  FAIL: 'error',
  CONTINUE: 'warn',
});

const {
  AddressManager,
  ENTITY_TYPE,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG: _QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  TABLE_PARTITION_TARGET_NODE_WAIT: _TABLE_PARTITION_TARGET_NODE_WAIT,
  TIMEOUT_BUDGET_CLASSIFICATION: _TIMEOUT_BUDGET_CLASSIFICATION,
  buildOwnerContractOutcome,
} = SQL_QUERY_ENGINE_SHARED;

/**
 * Log a provisioning-target wait failure that waitForCondition did not
 * already report as a spent bound (e.g. a budget refused up front).
 * @param {Object} engine - SQL query engine.
 * @param {Error} error - The wait failure.
 * @param {Object} payload - Log payload.
 * @param {boolean} failOnTimeout - Whether the failure propagates.
 * @private
 */
function _logUnreportedTargetNodeWaitFailure(
  engine,
  error,
  payload,
  failOnTimeout,
) {
  if (error?.waitBoundSpentReported === true) {
    return;
  }
  const level = failOnTimeout ?
    TARGET_NODE_WAIT_LOG_LEVEL.FAIL :
    TARGET_NODE_WAIT_LOG_LEVEL.CONTINUE;
  engine.logger[level](
    QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT,
    payload,
  );
}

function appendAnswerUnavailabilityReasons(reasons, ans) {
  if (ans?.state === LOCAL_STR_UNAVAILABLE) {
    reasons.push(ans.reason);
  } else if (
    ans?.decision !== LOCAL_STR_ELIGIBLE &&
    Array.isArray(ans?.reasons)
  ) {
    reasons.push(...ans.reasons);
  }
}

function collectCohortUnavailabilityReasons(cohort) {
  const reasons =
    cohort?.state === LOCAL_STR_UNAVAILABLE && cohort.reason ?
      [cohort.reason] :
      [];
  for (const ans of Object.values(cohort?.answers || {})) {
    appendAnswerUnavailabilityReasons(reasons, ans);
  }
  if (reasons.length === 0) {
    reasons.push(LOCAL_STR_READY_LEASE_EXPIRED);
  }
  return [...new Set(reasons)];
}

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
      requestedMinimumReplicaCount <= 0
    ) {
      return targetReplicaCount;
    }

    return Math.max(
      1,
      Math.min(requestedMinimumReplicaCount, targetReplicaCount),
    );
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
    const cancellationToken = options.cancellationToken;
    throwIfCancellationRequested(cancellationToken);
    const requiredReplicaCount =
      Number.isInteger(options.requiredReplicaCount) &&
      options.requiredReplicaCount > 0 ?
        options.requiredReplicaCount :
        1;
    const partitionId = String(options.partitionId || '');
    const explicitTargetNodeIds = this.normalizeTargetNodeIds(
      options.explicitTargetNodeIds,
    );

    const readiness = this.controlPlaneReadinessService;
    let cohort = readiness && typeof readiness.answerServeCohort === LOCAL_STR_FUNCTION ?
      readiness.answerServeCohort() :
      null;

    if (
      cohort?.state === LOCAL_STR_UNAVAILABLE &&
      typeof readiness.readServeEligibility === LOCAL_STR_FUNCTION
    ) {
      const waitBudgetMs = Number.isFinite(options.maxWaitMs) && options.maxWaitMs > 0 ?
        options.maxWaitMs : this.tablePartitionProvisioningTimeoutMs;
      try {
        await readiness.readServeEligibility({
          timeoutMs: waitBudgetMs,
          timeoutBudget: options.timeoutBudget || null,
          cancellationToken: options.cancellationToken || null,
          signal: options.signal || null,
        });
      } catch (waitError) {
        throwIfCancellationRequested(cancellationToken);
        if (options.signal?.aborted) {
          throw waitError;
        }
        this.logger?.debug?.(
          QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT,
          {error: waitError?.message},
        );
      }
      throwIfCancellationRequested(cancellationToken);
      cohort = readiness.answerServeCohort();
    }

    const resolution =
      this.resolveProvisionTargetNodeIdsWithDiagnostics(requiredReplicaCount);
    const lastDiagnostics = resolution.diagnostics;
    const resolvedNodeIds = this.resolveProvisionTargetNodeIdsForContext(
      explicitTargetNodeIds,
      requiredReplicaCount,
      lastDiagnostics,
    );

    let lastAdmissionProbe = null;
    if (partitionId && this.supportsProvisioningAdmissionPrecheck()) {
      lastAdmissionProbe = await this.probeProvisioningTargetAdmission({
        partitionId,
        targetNodeIds: resolvedNodeIds,
        schemaJobId: options.schemaJobId,
        timeoutBudget: options.timeoutBudget || null,
        cancellationToken,
      });
    }

    const quorumReplicaCount =
      this.calculateQuorumReplicaCount(requiredReplicaCount);
    const explicitMinimumReplicaCount =
      options.hasExplicitMinimumRoutableReplicaCount === true &&
      Number.isInteger(options.minimumRoutableReplicaCount) &&
      options.minimumRoutableReplicaCount > 0 ?
        Math.min(requiredReplicaCount, options.minimumRoutableReplicaCount) :
        quorumReplicaCount;
    const quorumCount = Math.max(quorumReplicaCount, explicitMinimumReplicaCount);
    const epoch = cohort?.epoch || lastDiagnostics?.epoch || null;
    const failOnTimeout = options.failOnTimeout !== false;

    if (resolvedNodeIds.length < quorumCount) {
      const uniqueReasons = collectCohortUnavailabilityReasons(cohort);
      const retryAfterMs = cohort?.retryAfterMs || this.tablePartitionProvisioningTimeoutMs;

      const error = new Error(
        `Provisioning unavailable: quorum not reachable for partition ${partitionId} (have ${resolvedNodeIds.length}, quorum ${quorumCount})`,
      );
      error.code = QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE;
      error.errorCode = QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE;
      error.epoch = epoch;
      error.reasons = uniqueReasons;
      error.retryAfterMs = retryAfterMs;
      error.detail = {
        epoch,
        reasons: uniqueReasons,
        retryAfterMs,
      };

      if (failOnTimeout) {
        throw error;
      }

      return this.buildProvisionTargetNodeConvergenceResult({
        nodeIds: resolvedNodeIds,
        diagnostics: lastDiagnostics,
        admissionProbe: lastAdmissionProbe,
        timedOut: true,
        requiredReplicaCount,
        waitedMs: 0,
        epoch,
        reasons: uniqueReasons,
        retryAfterMs,
        contractOutcome: buildOwnerContractOutcome({
          contractState: OWNER_CONTRACT_STATE.DEFERRED,
          nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
        }),
      });
    }

    return this.buildProvisionTargetNodeConvergenceResult({
      nodeIds: resolvedNodeIds,
      diagnostics: lastDiagnostics,
      admissionProbe: lastAdmissionProbe,
      timedOut: false,
      requiredReplicaCount,
      waitedMs: 0,
      epoch,
      contractOutcome: buildOwnerContractOutcome({
        contractState: resolvedNodeIds.length >= requiredReplicaCount ?
          OWNER_CONTRACT_STATE.READY :
          OWNER_CONTRACT_STATE.UNDER_REPLICATED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
      }),
    });
  }

  buildProvisionTargetNodeConvergenceResult(options = {}) {
    const timedOut = options.timedOut === true;
    const diagnostics =
      options?.diagnostics && typeof options.diagnostics === LOCAL_STR_OBJECT ?
        options.diagnostics :
        null;
    const reasonCodes = options.reasons ? [...options.reasons] : [];
    if (timedOut && reasonCodes.length === 0) {
      reasonCodes.push(LOCAL_STR_PROVISIONING_UNAVAILABLE);
    }
    const contractOutcome = options.contractOutcome || (timedOut ?
      buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.DEFERRED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
      }) :
      buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.READY,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
      }));
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
        options.requiredReplicaCount > 0 ?
          options.requiredReplicaCount :
          1,
      waitedMs:
        Number.isFinite(options.waitedMs) &&
        options.waitedMs > 0 ?
          Math.floor(options.waitedMs) :
          0,
      retryAfterMs:
        Number.isFinite(options.retryAfterMs) ?
          options.retryAfterMs :
          timedOut ?
            Math.max(1, this.tablePartitionProvisioningPollIntervalMs) :
            0,
      reasonCodes: Object.freeze(reasonCodes),
      reasons: reasonCodes,
      epoch: options.epoch || diagnostics?.epoch || null,
    };
  }

  /**
   * Build the explicit bootstrap cohort for initial table partition creation.
   * @param {string} partitionId - Partition ID.
   * @param {Array<Object>} plannedOperations - Planned ADD operations.
   * @return {Object} Replica IDs, peer addresses and the founders' placed
   *   nodes for the initial cohort.
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
        serviceReplicaId.length === 0
      ) {
        continue;
      }
      if (!seenReplicaIds.has(serviceReplicaId)) {
        seenReplicaIds.add(serviceReplicaId);
        replicaIds.push(serviceReplicaId);
      }
      if (
        typeof service?.address === LOCAL_STR_STRING &&
        service.address.length > 0
      ) {
        peerAddresses.push(service.address);
        continue;
      }
      if (
        typeof nodeId === LOCAL_STR_STRING &&
        nodeId.length > 0
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
        replicaId.length === 0
      ) {
        continue;
      }
      if (!seenReplicaIds.has(replicaId)) {
        seenReplicaIds.add(replicaId);
        replicaIds.push(replicaId);
      }
      if (
        typeof nodeId === LOCAL_STR_STRING &&
        nodeId.length > 0
      ) {
        peerAddresses.push(
          addressManager.format(nodeId, ENTITY_TYPE.PARTITION, replicaId),
        );
      }
    }

    const uniquePeerAddresses = [...new Set(peerAddresses)];
    return {
      replicaIds,
      peerAddresses: uniquePeerAddresses,
      founderNodeIds: founderNodeIdsOfPlacement(replicaIds,
        uniquePeerAddresses),
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
