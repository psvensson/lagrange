import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {throwIfCancellationRequested} from './query-cancellation.js';
import {founderNodeIdsOfPlacement} from
  '../raft/raft-rs-committed-peer-address.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_UNAVAILABLE = 'unavailable';
const LOCAL_STR_ELIGIBLE = 'eligible';
const {
  AddressManager,
  ENTITY_TYPE,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  QUERY_ERROR_CODE,
  QUERY_LOG_MSG,
  buildOwnerContractOutcome,
} = SQL_QUERY_ENGINE_SHARED;

function readTargetAnswerReasons(answer) {
  if (answer.state === LOCAL_STR_UNAVAILABLE) {
    return answer.reason ? [answer.reason] : [];
  }
  return answer.decision !== LOCAL_STR_ELIGIBLE ? answer.reasons : [];
}

function buildProvisionTargetRefusal({
  partitionId, jobId, diagnostics, nodeIds, requiredReplicaCount,
  quorumReplicaCount, retryAfterMs,
}) {
  const {cohort, epoch, selectedNodeIds} = diagnostics;
  const reasonCodes = new Set();
  if (cohort?.state === LOCAL_STR_UNAVAILABLE && cohort.reason) {
    reasonCodes.add(cohort.reason);
  }
  const nodeReasons = Object.fromEntries(Object.entries(cohort?.answers || {})
    .map(([nodeId, answer]) => [nodeId, readTargetAnswerReasons(answer)])
    .filter(([, reasons]) => reasons?.length > 0));
  for (const reasons of Object.values(nodeReasons)) {
    for (const reason of reasons) reasonCodes.add(reason);
  }
  return {
    partitionId,
    jobId,
    epoch,
    reasons: [...reasonCodes],
    nodeReasons,
    candidateTargetNodeIds: nodeIds,
    eligibleTargetNodeIds: selectedNodeIds,
    requiredReplicaCount,
    quorumReplicaCount,
    targetObservationChanged: selectedNodeIds.length >= quorumReplicaCount &&
      nodeIds.length < quorumReplicaCount,
    retryAfterMs,
  };
}

function throwProvisionTargetRefusal(detail) {
  const {partitionId, candidateTargetNodeIds, quorumReplicaCount} = detail;
  const error = new Error(
    `Provisioning unavailable: quorum not reachable for partition ${partitionId} ` +
    `(have ${candidateTargetNodeIds.length}, quorum ${quorumReplicaCount})`,
  );
  error.code = QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE;
  error.errorCode = error.code;
  error.epoch = detail.epoch;
  error.reasons = detail.reasons;
  error.reasonCodes = detail.reasons;
  error.retryAfterMs = detail.retryAfterMs;
  error.detail = detail;
  throw error;
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
   * Resolve a provisioning quorum from the serving-eligibility owner.
   * @param {Object} options
   * @param {string} options.partitionId
   * @param {number} options.requiredReplicaCount
   * @param {Object} options.timeoutBudget
   * @param {string[]} [options.explicitTargetNodeIds]
   * @param {number} [options.maxWaitMs]
   * @param {boolean} [options.failOnTimeout]
   * @param {Function} [options.assertProvisioningOwnership]
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
    const hasExplicitTargets = explicitTargetNodeIds.length > 0;
    let {diagnostics} = this.resolveProvisionTargetNodeIdsWithDiagnostics(
      requiredReplicaCount, hasExplicitTargets ? null : undefined,
    );

    if (
      diagnostics.cohort?.state === LOCAL_STR_UNAVAILABLE &&
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
      ({diagnostics} =
        this.resolveProvisionTargetNodeIdsWithDiagnostics(requiredReplicaCount));
    }

    let nodeIds = hasExplicitTargets ? explicitTargetNodeIds : diagnostics.selectedNodeIds;
    const majorityCount = this.calculateQuorumReplicaCount(requiredReplicaCount);
    const requestedMinimum = options.minimumRoutableReplicaCount;
    const quorumReplicaCount =
      options.hasExplicitMinimumRoutableReplicaCount === true &&
      Number.isInteger(requestedMinimum) && requestedMinimum > 0 ?
        Math.max(majorityCount, Math.min(requestedMinimum, requiredReplicaCount)) :
        majorityCount;

    let admissionProbe = null;
    if (nodeIds.length >= quorumReplicaCount) {
      if (partitionId && this.supportsProvisioningAdmissionPrecheck()) {
        admissionProbe = await this.probeProvisioningTargetAdmission({
          partitionId,
          targetNodeIds: nodeIds,
          schemaJobId: options.schemaJobId,
        });
      }
      if (options.assertProvisioningOwnership) {
        await options.assertProvisioningOwnership();
      }
      throwIfCancellationRequested(cancellationToken);
      if (!hasExplicitTargets && (admissionProbe || options.assertProvisioningOwnership)) {
        // The owner fences expired or superseded evidence on every answer.
        // Newly eligible targets belong to a subsequent admission attempt.
        ({diagnostics} =
          this.resolveProvisionTargetNodeIdsWithDiagnostics(requiredReplicaCount));
        const eligibleNodeIds = new Set(diagnostics.selectedNodeIds);
        nodeIds = nodeIds.filter((nodeId) => eligibleNodeIds.has(nodeId));
      }
    }

    if (nodeIds.length < quorumReplicaCount) {
      const detail = buildProvisionTargetRefusal({
        partitionId,
        jobId: options.schemaJobId ?? null,
        diagnostics,
        nodeIds,
        requiredReplicaCount,
        quorumReplicaCount,
        retryAfterMs: diagnostics.cohort?.retryAfterMs ??
          this.tablePartitionProvisioningTimeoutMs,
      });
      if (options.failOnTimeout !== false) {
        throwProvisionTargetRefusal(detail);
      }
      return this.buildProvisionTargetNodeConvergenceResult({
        nodeIds,
        diagnostics,
        admissionProbe,
        timedOut: true,
        requiredReplicaCount,
        quorumReplicaCount,
        waitedMs: 0,
        reasons: detail.reasons,
        retryAfterMs: detail.retryAfterMs,
      });
    }

    return this.buildProvisionTargetNodeConvergenceResult({
      nodeIds,
      diagnostics,
      admissionProbe,
      timedOut: false,
      requiredReplicaCount,
      quorumReplicaCount,
      waitedMs: 0,
      contractOutcome: buildOwnerContractOutcome({
        contractState: nodeIds.length >= requiredReplicaCount ?
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
      quorumReplicaCount: options.quorumReplicaCount,
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
      epoch: diagnostics?.epoch || null,
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
      const existingReplicaIds = Array.isArray(operation?.replicaIds) ?
        operation.replicaIds :
        [];
      for (const existingReplicaId of existingReplicaIds) {
        if (
          typeof existingReplicaId === LOCAL_STR_STRING &&
          existingReplicaId.length > 0 &&
          !seenReplicaIds.has(existingReplicaId)
        ) {
          seenReplicaIds.add(existingReplicaId);
          replicaIds.push(existingReplicaId);
        }
      }
      const existingPeerAddresses = Array.isArray(operation?.peerAddresses) ?
        operation.peerAddresses :
        [];
      for (const existingPeerAddress of existingPeerAddresses) {
        if (
          typeof existingPeerAddress === LOCAL_STR_STRING &&
          existingPeerAddress.length > 0
        ) {
          peerAddresses.push(existingPeerAddress);
        }
      }
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
