import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';

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
    return this.sqlQueryEngine?.systemCache?.getAll(TABLES.TABLES) || [];
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

  isCriticalSystemPartition(partitionId) {
    return typeof this.sqlQueryEngine?.rebalanceCoordinator
      ?.isCriticalSystemPartition === 'function' &&
      this.sqlQueryEngine.rebalanceCoordinator
        .isCriticalSystemPartition(partitionId) === true;
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

  get logger() {
    return this.sqlQueryEngine?.logger || console;
  }

  get transactionCoordinator() {
    return this.sqlQueryEngine?.transactionCoordinator || null;
  }
}

export {ManagedSplitTopologyAdapter};
