import {TABLES} from '../constants/index.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_REPLICA_HANDLER_ADDRESS_SUFFIX = '/service/replica-handler';

function getRuntimeView(runtime) {
  return runtime?.systemCache;
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

  /**
   * Observe the query plane's routing evidence for one split child: its
   * canonical leader node and the node ids whose services are routable
   * on the serve dimension the write path uses. The workflow owner
   * decides cutover readiness from this evidence.
   * @param {string} partitionId - Child partition ID.
   * @return {{leaderNodeId: string, routableNodeIds: string[]}}
   */
  resolveSplitChildLeaderRoutingEvidence(partitionId) {
    const queryExecutor = this.sqlQueryEngine?.queryExecutor;
    if (typeof queryExecutor?.getPartitionRoutingSnapshot !==
        LOCAL_STR_FUNCTION) {
      return {leaderNodeId: '', routableNodeIds: []};
    }
    const routingSnapshot = queryExecutor.getPartitionRoutingSnapshot(
      partitionId,
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    );
    return {
      leaderNodeId: String(routingSnapshot?.canonicalLeaderNodeId || ''),
      routableNodeIds: (routingSnapshot?.routableServices || [])
        .map((service) => String(service?.node_id ?? service?.nodeId ?? ''))
        .filter((nodeId) => nodeId.length > 0),
    };
  }

  /**
   * The engine's table-partition provisioning poll cadence: the wait
   * interval every routable wait already runs on.
   * @return {number}
   */
  resolveRoutingWaitPollIntervalMs() {
    return this.sqlQueryEngine?.tablePartitionProvisioningPollIntervalMs;
  }

  /**
   * Sleep through the engine's clock-owned sleep.
   * @param {number} ms
   * @return {Promise<void>}
   */
  delay(ms) {
    return this.sqlQueryEngine?.sleep(ms);
  }

  get logger() {
    return this.sqlQueryEngine?.logger || console;
  }

  get transactionCoordinator() {
    return this.sqlQueryEngine?.transactionCoordinator || null;
  }
}

export {ManagedSplitTopologyAdapter};
