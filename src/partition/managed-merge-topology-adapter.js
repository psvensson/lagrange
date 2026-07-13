import {TABLES} from '../constants/index.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  PARTITION_SERVICE_MESSAGE_TYPE,
} from './partition-service-constants.js';

const LOCAL_STR_PARTITION_ID = 'partition_id';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_PARTITION_ID_CAMEL = 'partitionId';
const LOCAL_STR_TABLE_ID = 'table_id';
const LOCAL_STR_TABLE_ID_CAMEL = 'tableId';
const LOCAL_STR_REPLICA_HANDLER_ADDRESS_SUFFIX = '/service/replica-handler';
const MERGE_REPLICATION_START_FAILED =
  'Failed to start merge replication on source partition';

function getRuntimeView(runtime) {
  return runtime?.systemCache;
}

/**
 * Topology adapter binding ManagedMergeWorkflow to the runtime SQL query
 * engine. Mirrors ManagedSplitTopologyAdapter; the merge-specific additions
 * are source replication start (new START_MERGE_REPLICATION message leg),
 * service-row enumeration for dissolution, and replica-removal dispatch that
 * reuses the rebalancer's REMOVE_REPLICA node handler.
 */
class ManagedMergeTopologyAdapter {
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

  isLocalManagedMergeLeader(partitionInfo) {
    return this.sqlQueryEngine?.isLocalManagedSplitLeader(partitionInfo) ===
      true;
  }

  resolveActivePartitionVersion(tableInfo) {
    return this.sqlQueryEngine?.resolveActivePartitionVersion(tableInfo) || 1;
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

  /**
   * Start merge replication on one source partition leader.
   * Mirrors sqlQueryEngine.startSplitReplicationOnSourcePartition but sends
   * the merge message leg, so the workflow stays wired without editing the
   * query engine surface.
   * @param {string} partitionId - Source partition ID.
   * @param {string} tableId - Table ID.
   * @param {string} tableName - Table name.
   * @param {Object} transitionMetadata - Durable merge transition metadata.
   * @return {Promise<void>}
   */
  async startMergeReplicationOnSourcePartition(
    partitionId,
    tableId,
    tableName,
    transitionMetadata,
  ) {
    const serviceInfo =
      this.sqlQueryEngine?.queryExecutor?.findPartitionService(partitionId);
    if (!serviceInfo || !this.messageRouter) {
      throw new Error(MERGE_REPLICATION_START_FAILED);
    }

    const response = await this.messageRouter.deliver(serviceInfo.address, {
      type: PARTITION_SERVICE_MESSAGE_TYPE.START_MERGE_REPLICATION,
      partitionId,
      tableId,
      tableName,
      transitionMetadata,
    });

    if (!response?.acknowledged || response?.success === false) {
      throw new Error(response?.error || MERGE_REPLICATION_START_FAILED);
    }
  }

  /**
   * List authoritative partitions rows belonging to one table. Used by the
   * merge workflow to compute the non-participating sibling set that must
   * be carried forward into the target epoch at cutover.
   * @param {string} tableId - Table ID.
   * @return {Array<Object>} Partitions rows.
   */
  listTablePartitionRows(tableId) {
    const rows =
      getRuntimeView(this.sqlQueryEngine)?.getAll(TABLES.PARTITIONS) || [];
    return rows.filter((row) => {
      const rowTableId =
        row?.[LOCAL_STR_TABLE_ID] ?? row?.[LOCAL_STR_TABLE_ID_CAMEL];
      return String(rowTableId || '') === String(tableId || '');
    });
  }

  /**
   * List authoritative services rows hosting replicas of one partition.
   * Used by the merge workflow to enumerate the retired raft group.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Services rows.
   */
  listPartitionServiceRows(partitionId) {
    const rows =
      getRuntimeView(this.sqlQueryEngine)?.getAll(TABLES.SERVICES) || [];
    return rows.filter((row) => {
      const rowPartitionId =
        row?.[LOCAL_STR_PARTITION_ID] ?? row?.[LOCAL_STR_PARTITION_ID_CAMEL];
      return String(rowPartitionId || '') === String(partitionId || '');
    });
  }

  /**
   * Deliver one replica-removal request to the node hosting a retired
   * source replica. Reuses the existing rebalancer REMOVE_REPLICA node
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
    const target = nodeId + LOCAL_STR_REPLICA_HANDLER_ADDRESS_SUFFIX;
    return this.messageRouter.deliver(target, request.message);
  }

  get logger() {
    return this.sqlQueryEngine?.logger || console;
  }

  get transactionCoordinator() {
    return this.sqlQueryEngine?.transactionCoordinator || null;
  }
}

export {ManagedMergeTopologyAdapter};
