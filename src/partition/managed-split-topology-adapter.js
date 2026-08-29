import {COLUMN, NODE_STATE, TABLES} from '../constants/index.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  MEMBERSHIP_PUBLICATION_STATUS,
} from '../control-plane/membership-publication-row-contract.js';
import {
  buildSplitCutoverHandoffAddress,
} from './split-cutover-handoff-contract.js';
import {copyDenseOwnDataArray} from '../utils/strict-own-data.js';

const arrayFind = Function.call.bind(Array.prototype.find);
const arraySort = Function.call.bind(Array.prototype.sort);
const DateConstructor = Date;
const dateNow = Date.now;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const numberConstructor = Number;
const numberIsSafeInteger = Number.isSafeInteger;
const promiseResolve = Promise.resolve.bind(Promise);
const stringConstructor = String;

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_REPLICA_HANDLER_ADDRESS_SUFFIX = '/service/replica-handler';
const SPLIT_COHORT_PUBLICATION_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});
const UNAVAILABLE_SPLIT_COHORT_PUBLICATION = Object.freeze({
  state: SPLIT_COHORT_PUBLICATION_STATE.UNAVAILABLE,
});

function getRuntimeView(runtime) {
  return runtime?.systemCache;
}

function readSplitCohortPublication(engine) {
  const readiness = engine?.controlPlaneReadinessService;
  const observedAt = dateToISOString(new DateConstructor(
    engine?.nowFn?.() ?? dateNow(),
  ));
  return readiness?.getMembershipPublicationDiagnosticsSync?.(
    engine?.nodeId,
    observedAt,
  );
}

function splitCohortPublicationIsValid(publication, publicationEpoch) {
  return publication?.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED &&
    publication?.publishedActiveNodeIdsPresent === true &&
    numberIsSafeInteger(publicationEpoch) && publicationEpoch > 0;
}

function resolvePublishedSplitCohortPublication(engine) {
  const publication = readSplitCohortPublication(engine);
  const publicationEpoch = numberConstructor(publication?.publicationEpoch);
  if (!splitCohortPublicationIsValid(publication, publicationEpoch)) {
    return UNAVAILABLE_SPLIT_COHORT_PUBLICATION;
  }
  const publishedActiveNodeIds = copyDenseOwnDataArray(
    publication.publishedActiveNodeIds,
  ) || [];
  arraySort(publishedActiveNodeIds);
  return {
    state: SPLIT_COHORT_PUBLICATION_STATE.AVAILABLE,
    publicationEpoch,
    publishedActiveNodeIds,
  };
}

function buildSplitCohortNode(nodeRows, nodeId) {
  const row = arrayFind(nodeRows, (entry) =>
    stringConstructor(entry?.node_id ?? entry?.nodeId ?? '') === nodeId);
  return {
    nodeId,
    bootIncarnation: numberConstructor(
      row?.boot_incarnation ?? row?.bootIncarnation,
    ),
  };
}

function hasChangedBootIncarnation(row, requiredNode) {
  const currentBootIncarnation = numberConstructor(
    row?.[COLUMN.BOOT_INCARNATION] ?? row?.bootIncarnation,
  );
  return numberIsSafeInteger(currentBootIncarnation) &&
    currentBootIncarnation > 0 &&
    currentBootIncarnation !== requiredNode?.bootIncarnation;
}

function hasTerminalNodeStatus(row) {
  const status = stringConstructor(
    row?.[COLUMN.STATUS] ?? row?.status ?? '',
  );
  return status === NODE_STATE.FAILED ||
    status === NODE_STATE.SHUTTING_DOWN ||
    status === NODE_STATE.STOPPED;
}

class ManagedSplitTopologyAdapter {
  constructor(options = {}) {
    this.sqlQueryEngine = options.sqlQueryEngine || null;
  }

  getCDCIntegrationService() {
    return this.sqlQueryEngine?.cdcIntegrationService || null;
  }

  getPartitionInfo(partitionId) {
    return this.sqlQueryEngine?.getPartitionInfo(partitionId) || null;
  }

  getTableInfo(tableNameOrId) {
    return this.sqlQueryEngine?.getTableInfo(tableNameOrId) || null;
  }

  listTableInfos() {
    return getRuntimeView(this.sqlQueryEngine)?.getAll(TABLES.TABLES) || [];
  }

  parsePartitionTransition(tableInfo) {
    return this.sqlQueryEngine?.parsePartitionTransition(tableInfo) || null;
  }

  isLocalManagedSplitLeader(partitionInfo) {
    return this.sqlQueryEngine?.isLocalManagedSplitLeader(partitionInfo) ===
      true;
  }

  resolveActivePartitionVersion(tableInfo) {
    return this.sqlQueryEngine?.resolveActivePartitionVersion(tableInfo) || 1;
  }

  buildManagedSplitPlan(...args) {
    return this.sqlQueryEngine?.buildManagedSplitPlan(...args);
  }

  resolveProvisionTargetNodeIds(replicaCount) {
    return this.sqlQueryEngine?.resolveProvisionTargetNodeIds(replicaCount) ||
      [];
  }

  getRoutablePartitionServiceNodeIds(partitionId) {
    return this.sqlQueryEngine?.getRoutablePartitionServiceNodeIds(
      partitionId,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    ) || [];
  }

  isSystemTablePartitionId(partitionId) {
    return typeof this.sqlQueryEngine?.rebalanceCoordinator
      ?.isCriticalSystemPartition === LOCAL_STR_FUNCTION &&
      classifySystemPartition({partitionId}).systemTable;
  }

  captureTopologySnapshot(context) {
    return this.sqlQueryEngine
      ?.captureManagedSplitTopologySnapshot(context) || null;
  }

  calculateQuorumReplicaCount(replicaCount) {
    return this.sqlQueryEngine?.calculateQuorumReplicaCount(replicaCount);
  }

  get storageAdmissionService() {
    return this.sqlQueryEngine?.rebalanceCoordinator
      ?.storageAdmissionService || null;
  }

  get messageRouter() {
    return this.sqlQueryEngine?.messageRouter || null;
  }

  createExecutionTimeoutBudget() {
    return this.sqlQueryEngine?.createControlPlaneTimeoutBudget(
      this.sqlQueryEngine?.tablePartitionProvisioningTimeoutMs,
    );
  }

  estimateSplitAdmissionBytes(partitionInfo, tableInfo) {
    return this.sqlQueryEngine
      ?.estimateSplitAdmissionBytes(partitionInfo, tableInfo);
  }

  waitForTablePartitionMetadata(tableId, partitionId, timeoutBudget) {
    return this.sqlQueryEngine?.waitForTablePartitionMetadata(
      tableId,
      partitionId,
      timeoutBudget,
    );
  }

  probeInitialTablePartitionProvisioning(context) {
    return this.sqlQueryEngine?.probeInitialTablePartitionProvisioning(context);
  }

  provisionInitialTablePartition(context) {
    return this.sqlQueryEngine?.provisionInitialTablePartition(context);
  }

  startSplitReplicationOnSourcePartition(
    partitionId,
    tableId,
    tableName,
    transitionMetadata,
  ) {
    return this.sqlQueryEngine?.startSplitReplicationOnSourcePartition(
      partitionId,
      tableId,
      tableName,
      transitionMetadata,
    );
  }

  /**
   * List authoritative partitions rows belonging to one table. Used by
   * the split workflow to compute the non-participating sibling set
   * that must be carried forward into the target epoch at cutover.
   * @param {string} tableId - Table ID.
   * @return {Array<Object>} Partitions rows.
   */
  listTablePartitionRows(tableId) {
    const rows =
      getRuntimeView(this.sqlQueryEngine)?.getAll(TABLES.PARTITIONS) || [];
    return rows.filter((row) => {
      const rowTableId = row?.table_id ?? row?.tableId;
      return String(rowTableId || '') === String(tableId || '');
    });
  }

  /**
   * List authoritative services rows hosting replicas of one partition.
   * Used by the split workflow to enumerate the retired source raft
   * group (and the aborted children) at dissolution/teardown.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Services rows.
   */
  listPartitionServiceRows(partitionId) {
    const rows =
      getRuntimeView(this.sqlQueryEngine)?.getAll(TABLES.SERVICES) || [];
    return rows.filter((row) => {
      const rowPartitionId = row?.partition_id ?? row?.partitionId;
      return String(rowPartitionId || '') === String(partitionId || '');
    });
  }

  /**
   * Deliver one replica-removal request to the node hosting a retired
   * replica. Reuses the existing rebalancer REMOVE_REPLICA node
   * handler (ReplicaHandler.handleRemoveReplica).
   * @param {Object} request - Replica removal request.
   * @param {string} request.nodeId - Hosting node ID.
   * @return {Promise<Object>} Handler response.
   */
  deliverReplicaRemoval(request) {
    const nodeId = String(request?.nodeId || '');
    if (!nodeId || !this.messageRouter) {
      return Promise.resolve(null);
    }
    return this.messageRouter.deliver(
      nodeId + LOCAL_STR_REPLICA_HANDLER_ADDRESS_SUFFIX,
      request.message,
    );
  }

  captureSplitQueryPlaneCohort() {
    const publication = resolvePublishedSplitCohortPublication(
      this.sqlQueryEngine,
    );
    if (publication.state !== SPLIT_COHORT_PUBLICATION_STATE.AVAILABLE) {
      return null;
    }
    const nodeRows =
      getRuntimeView(this.sqlQueryEngine)?.getAll(TABLES.NODES) || [];
    const nodes = [];
    for (let index = 0;
      index < publication.publishedActiveNodeIds.length;
      index++) {
      nodes[nodes.length] = buildSplitCohortNode(
        nodeRows,
        publication.publishedActiveNodeIds[index],
      );
    }
    return {publicationEpoch: publication.publicationEpoch, nodes};
  }

  isSplitQueryPlaneIncarnationRetired(requiredNode) {
    const nodeRows =
      getRuntimeView(this.sqlQueryEngine)?.getAll(TABLES.NODES) || [];
    const row = arrayFind(nodeRows, (entry) =>
      stringConstructor(entry?.[COLUMN.NODE_ID] ?? entry?.nodeId ?? '') ===
        requiredNode?.nodeId);
    if (!row) return false;
    return hasChangedBootIncarnation(row, requiredNode) ||
      hasTerminalNodeStatus(row);
  }

  deliverSplitCutoverHandoff(nodeId, message) {
    if (!nodeId || !this.messageRouter) return promiseResolve(null);
    return this.messageRouter.deliver(
      buildSplitCutoverHandoffAddress(nodeId),
      message,
      {targetNodeId: nodeId},
    );
  }

  get logger() {
    return this.sqlQueryEngine?.logger || console;
  }

  get transactionCoordinator() {
    return this.sqlQueryEngine?.transactionCoordinator || null;
  }
}

export {ManagedSplitTopologyAdapter};
