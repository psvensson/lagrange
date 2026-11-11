import {readLowerStateField} from '../utils/state-field-read.js';
import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {
  BOOTSTRAP_COHORT_STATE,
  readEstablishedBootstrapCohort,
} from './initial-partition-bootstrap-cohort.js';
import {buildSchemaProvisioningChildIntent} from
  './schema-provisioning-child-intent.js';
import {REBALANCER_SKIP_REASON} from '../rebalancer/rebalancer-constants.js';
import {REPLICA_OPERATION_VISIBILITY_READ_MODE} from
  '../rebalancer/replica-operation-repository.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_FUNCTION = 'function';
const BOOTSTRAP_OPERATIONS_NOT_VISIBLE_PREFIX =
  'Provisioning deferred: the durable bootstrap operations are not visible ' +
  'yet for partition ';

const {
  ConfigurationManager,
  OperationType,
  QUERY_ERROR_CODE,
  SERVICE_TYPE,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
} = SQL_QUERY_ENGINE_SHARED;

function extractCohortStrictNodeIds(engine, cohort) {
  return engine.orderProvisionTargetNodeIds(cohort?.eligibleNodeIds || []);
}

class SQLQueryEngineProvisioningMethods {
  /**
   * The founding cohort a prior attempt of the same schema job durably
   * established for the partition (R10, R14): read from the coordinator's
   * authoritative operation rows, never from the serving cohort of the
   * moment. A retry plans exactly the founders this answer names. A read the
   * operation owner defers is a typed retryable provisioning refusal.
   * @param {Object} context - Provisioning context.
   * @param {string} partitionId
   * @param {Object|null} bootstrapTableMetadata
   * @param {Object|null} bootstrapPartitionMetadata
   * @return {Promise<Object>} A BOOTSTRAP_COHORT_STATE answer.
   * @private
   */
  async readSchemaJobEstablishedBootstrapCohort(
    context,
    partitionId,
    bootstrapTableMetadata,
    bootstrapPartitionMetadata,
  ) {
    const schemaJobId = context?.schemaJobId;
    if (typeof schemaJobId !== LOCAL_STR_STRING ||
        schemaJobId.trim().length === 0) {
      return {state: BOOTSTRAP_COHORT_STATE.NO_DURABLE_INTENT};
    }
    let partitionOperations;
    try {
      partitionOperations = await this.rebalanceCoordinator.getOperationsByEntity(
        SERVICE_TYPE.PARTITION,
        partitionId,
        {visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED},
      );
    } catch (cause) {
      if (cause?.rebalanceSkipReason !==
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING) {
        throw cause;
      }
      const error = new Error(
        `${BOOTSTRAP_OPERATIONS_NOT_VISIBLE_PREFIX}${partitionId}`, {cause});
      error.code = QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE;
      error.retryAfterMs = cause.retryAfterMs;
      throw error;
    }
    // This job's own founding operations: the deterministic child intent of
    // (schema job, target node). Any other operation of the partition - a
    // later non-genesis ADD, a REMOVE - founds nothing.
    const schemaJobOperations = partitionOperations.filter((operation) =>
      operation?.type === OperationType.ADD &&
      operation.operationId === buildSchemaProvisioningChildIntent(
        schemaJobId, operation.targetNodeId).operationIntentId);
    return readEstablishedBootstrapCohort({
      partitionId,
      operations: schemaJobOperations,
      bootstrapTableMetadata,
      bootstrapPartitionMetadata,
    });
  }

  resolveInitialPartitionBootstrapLeaderNodeId(
    partitionId,
    plannedOperations = [],
  ) {
    const currentServices = this.getPartitionServiceRows(partitionId);
    const currentLeaderService = currentServices.find(
      (service) => readLowerStateField(service?.raft_role) === 'leader',
    );
    const currentLeaderNodeId =
      currentLeaderService?.node_id || currentLeaderService?.nodeId || null;
    if (
      typeof currentLeaderNodeId === LOCAL_STR_STRING &&
      currentLeaderNodeId.length > 0
    ) {
      return currentLeaderNodeId;
    }

    const currentR1Service = currentServices.find((service) => {
      const replicaId = String(
        service?.service_id || service?.replica_id || '',
      );
      return /-r1$/.test(replicaId);
    });
    const currentR1NodeId =
      currentR1Service?.node_id || currentR1Service?.nodeId || null;
    if (typeof currentR1NodeId === LOCAL_STR_STRING && currentR1NodeId.length > 0) {
      return currentR1NodeId;
    }

    const plannedR1Operation =
      plannedOperations.find((operation) => {
        const replicaId = String(operation?.replicaId || '');
        return /-r1$/.test(replicaId);
      }) || null;
    const plannedR1NodeId =
      plannedR1Operation?.targetNodeId || plannedR1Operation?.nodeId || null;
    if (typeof plannedR1NodeId === LOCAL_STR_STRING && plannedR1NodeId.length > 0) {
      return plannedR1NodeId;
    }

    const firstCurrentNodeId =
      currentServices.find((service) => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.node_id ||
      currentServices.find((service) => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId ||
      null;
    if (
      typeof firstCurrentNodeId === LOCAL_STR_STRING &&
      firstCurrentNodeId.length > 0
    ) {
      return firstCurrentNodeId;
    }

    const firstPlannedNodeId =
      plannedOperations.find((operation) => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.targetNodeId ||
      plannedOperations.find((operation) => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId ||
      null;
    return typeof firstPlannedNodeId === LOCAL_STR_STRING &&
      firstPlannedNodeId.length > 0 ?
      firstPlannedNodeId :
      null;
  }

  /**
   * Resolve active node IDs eligible for initial replica provisioning.
   * Prefers local node first to keep early routing local.
   * @param {number} requestedReplicaCount
   * @return {Array<string>} Ordered node IDs.
   * @private
   */
  resolveProvisionTargetNodeIds(requestedReplicaCount) {
    return this.resolveProvisionTargetNodeIdsWithDiagnostics(
      requestedReplicaCount,
    ).nodeIds;
  }

  /**
   * Resolve active node IDs plus eligibility diagnostics.
   * @param {number} requestedReplicaCount
   * @return {{nodeIds: string[], diagnostics: Object}}
   * @private
   */
  resolveProvisionTargetNodeIdsWithDiagnostics(requestedReplicaCount) {
    const desiredReplicaCount =
      Number.isInteger(requestedReplicaCount) && requestedReplicaCount > 0 ?
        requestedReplicaCount :
        1;

    const diagnostics =
      this.resolveProvisionTargetNodeDiagnostics(desiredReplicaCount);
    const selectedNodeIds = diagnostics.selectedNodeIds;

    const orderedNodeIds = this.orderProvisionTargetNodeIds(selectedNodeIds);
    const cappedNodeIds = orderedNodeIds.slice(
      0,
      Math.max(1, Math.min(desiredReplicaCount, orderedNodeIds.length)),
    );

    return {
      nodeIds: cappedNodeIds,
      diagnostics: {
        ...diagnostics,
        selectedNodeIds: orderedNodeIds,
        resolvedNodeIds: cappedNodeIds,
      },
    };
  }

  /**
   * Order node IDs lexicographically while keeping the local node first.
   * @param {Array<string>} nodeIds
   * @return {Array<string>}
   * @private
   */
  orderProvisionTargetNodeIds(nodeIds) {
    const uniqueNodeIds = [...new Set(nodeIds)];
    uniqueNodeIds.sort((left, right) => left.localeCompare(right));
    if (uniqueNodeIds.includes(this.nodeId)) {
      uniqueNodeIds.splice(uniqueNodeIds.indexOf(this.nodeId), 1);
      uniqueNodeIds.unshift(this.nodeId);
    }
    return uniqueNodeIds;
  }

  /**
   * Resolve provision-target diagnostics from the readiness owner's
   * committed serving cohort.
   * @param {number} requestedReplicaCount
   * @return {Object}
   * @private
   */
  resolveProvisionTargetNodeDiagnostics(requestedReplicaCount) {
    const desiredReplicaCount =
      Number.isInteger(requestedReplicaCount) && requestedReplicaCount > 0 ?
        requestedReplicaCount :
        1;
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService) {
      return {
        requestedReplicaCount: desiredReplicaCount,
        activeNodeRowCount: 0,
        activeServiceRowCount: 0,
        strictNodeIds: [],
        degradedFallbackNodeIds: [],
        selectedNodeIds: [],
        usedDegradedFallback: false,
        epoch: null,
      };
    }
    const cohort = typeof readinessService.answerServeCohort === LOCAL_STR_FUNCTION ?
      readinessService.answerServeCohort() :
      null;
    const strictNodeIds = extractCohortStrictNodeIds(this, cohort);
    const selectedNodeIds = strictNodeIds;

    return {
      requestedReplicaCount: desiredReplicaCount,
      activeNodeRowCount: cohort ?
        Object.keys(cohort.answers || {}).length :
        selectedNodeIds.length,
      activeServiceRowCount: 0,
      strictNodeIds,
      degradedFallbackNodeIds: [],
      selectedNodeIds,
      usedDegradedFallback: false,
      epoch: cohort?.epoch || null,
      cohort,
    };
  }

  /**
   * Resolve target nodes for one provisioning context.
   * Explicit targets override readiness-discovered nodes.
   * @param {string[]|undefined|null} explicitTargetNodeIds
   * @param {number} requestedReplicaCount
   * @param {Object|null} [provisionTargetDiagnostics]
   * @return {Array<string>}
   * @private
   */
  resolveProvisionTargetNodeIdsForContext(
    explicitTargetNodeIds,
    requestedReplicaCount,
    provisionTargetDiagnostics = null,
  ) {
    const explicitTargets = this.normalizeTargetNodeIds(explicitTargetNodeIds);
    if (explicitTargets.length === 0) {
      const hasProvidedDiagnostics =
        provisionTargetDiagnostics &&
        typeof provisionTargetDiagnostics === 'object';
      const diagnostics = hasProvidedDiagnostics ?
        provisionTargetDiagnostics :
        this.resolveProvisionTargetNodeIdsWithDiagnostics(
          requestedReplicaCount,
        ).diagnostics;
      const selectedNodeIds = Array.isArray(diagnostics?.selectedNodeIds) ?
        diagnostics.selectedNodeIds :
        [];
      return selectedNodeIds;
    }

    return explicitTargets;
  }

  /**
   * Normalize one node-id list to unique non-empty string IDs.
   * @param {Array<string>|undefined|null} targetNodeIds
   * @return {Array<string>}
   * @private
   */
  normalizeTargetNodeIds(targetNodeIds) {
    if (!Array.isArray(targetNodeIds)) {
      return [];
    }

    const normalizedNodeIds = [];
    const seenNodeIds = new Set();
    for (const nodeId of targetNodeIds) {
      const normalizedNodeId = String(nodeId || '');
      if (normalizedNodeId.length === 0 || seenNodeIds.has(normalizedNodeId)) {
        continue;
      }
      seenNodeIds.add(normalizedNodeId);
      normalizedNodeIds.push(normalizedNodeId);
    }

    return normalizedNodeIds;
  }

  /**
   * Capture the canonical topology snapshot for one managed split attempt.
   * The workflow reuses this persisted context for admission and child
   * provisioning instead of re-resolving targets mid-attempt.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  captureManagedSplitTopologySnapshot(options = {}) {
    const requiredReplicaCount =
      Number.isInteger(options.requiredReplicaCount) &&
      options.requiredReplicaCount > 0 ?
        options.requiredReplicaCount :
        1;
    const provisionTargetDiagnostics =
      this.resolveProvisionTargetNodeDiagnostics(requiredReplicaCount);
    return {
      ...(options.baseSnapshot || {}),
      capturedAt: new Date(this.nowFn()).toISOString(),
      sourceLeaderNodeId:
        options.partitionInfo?.leader_node_id ||
        options.partitionInfo?.leaderNodeId ||
        null,
      activePartitionVersion:
        options.tableInfo?.active_partition_version ||
        options.tableInfo?.activePartitionVersion ||
        null,
      targetPartitionVersion: options.targetVersion,
      requiredReplicaCount,
      sourceRoutableNodeIds: this.normalizeTargetNodeIds(
        options.sourceRoutableNodeIds,
      ),
      discoveredTargetNodeIds: this.normalizeTargetNodeIds(
        options.discoveredTargetNodeIds,
      ),
      candidateTargetNodeIds: this.normalizeTargetNodeIds(
        options.candidateTargetNodeIds,
      ),
      provisionTargetDiagnostics,
    };
  }

  /**
   * Estimate bytes for split admission using the canonical storage
   * accounting model when it is available.
   * @param {Object} partitionInfo
   * @return {number}
   * @private
   */
  estimateSplitAdmissionBytes(partitionInfo) {
    const sizeBytes = Number(
      partitionInfo?.size_bytes ?? partitionInfo?.sizeBytes,
    );
    const normalizedSizeBytes =
      Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0;
    const accountingService =
      this.rebalanceCoordinator?.storageAccountingService || null;

    if (
      accountingService &&
      typeof accountingService.estimateReplicaBytes === LOCAL_STR_FUNCTION
    ) {
      const splitAmplificationFactor =
        ConfigurationManager.getInstance().get(
          STORAGE_CAPACITY_CONFIG_KEY.SPLIT_AMPLIFICATION_FACTOR,
        ) || STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR;
      return accountingService.estimateReplicaBytes({
        entityType: SERVICE_TYPE.PARTITION,
        sizeBytes: normalizedSizeBytes,
        amplificationFactor: splitAmplificationFactor,
      });
    }

    return Math.max(1, Math.ceil(normalizedSizeBytes));
  }

  /**
   * Calculate the minimum majority-sized cohort required for a routable Raft
   * partition during split bootstrap.
   * @param {number} replicaCount
   * @return {number}
   * @private
   */
  calculateQuorumReplicaCount(replicaCount) {
    const normalizedReplicaCount =
      Number.isInteger(replicaCount) && replicaCount > 0 ? replicaCount : 1;
    return Math.floor(normalizedReplicaCount / 2) + 1;
  }
}

function createSQLQueryEngineProvisioningMethods() {
  return Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(
        SQLQueryEngineProvisioningMethods.prototype,
      ),
    ).filter(([name]) => name !== 'constructor'),
  );
}

export {createSQLQueryEngineProvisioningMethods};
