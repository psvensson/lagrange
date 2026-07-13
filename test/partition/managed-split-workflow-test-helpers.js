import {TABLES} from '../../src/constants/index.js';
import {
  ManagedSplitWorkflow,
} from '../../src/partition/managed-split-workflow.js';
import {
  DistributedTransactionCoordinator,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_OPERATION_TYPE,
} from '../../src/rebalancer/storage-admission-constants.js';

function createAdmissionResult(overrides = {}) {
  return {
    allowed: true,
    decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
    operationType: STORAGE_ADMISSION_OPERATION_TYPE.PARTITION_SPLIT,
    requiredReplicaCount: 2,
    eligibleNodeIds: ['node-a', 'node-b'],
    ineligibleNodes: [],
    blockingReasons: [],
    decisionTimestamp: '1970-01-01T00:00:01.000Z',
    ...overrides,
  };
}

function createTransactionCoordinator(now = () => 1000) {
  return new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now,
  });
}

function buildWorkflow(options = {}) {
  const updateCalls = options.updateCalls || [];
  const insertCalls = options.insertCalls || [];
  const admissionCalls = options.admissionCalls || [];
  const probeProvisioningCalls = options.probeProvisioningCalls || [];
  const provisionCalls = options.provisionCalls || [];
  const durableTableRows = Array.isArray(options.durableTableRows) ?
    options.durableTableRows :
    null;
  const defaultTableInfo = {
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key: 'id',
    active_partition_version: 1,
    partition_transition_state: null,
    partition_transition_metadata: null,
  };
  const resolvedTableInfo = durableTableRows && durableTableRows.length > 0 ?
    durableTableRows[0] :
    (options.tableInfo || defaultTableInfo);
  const transactionCoordinator =
    Object.prototype.hasOwnProperty.call(options, 'transactionCoordinator') ?
      options.transactionCoordinator :
      createTransactionCoordinator(options.now || (() => 1000));
  const workflow = new ManagedSplitWorkflow({
    nodeId: 'node-a',
    cdcIntegrationService: options.cdcIntegrationService || {
      async updateSystemTableRow(tableName, whereClause, data, updateOptions) {
        updateCalls.push({tableName, whereClause, data, options: updateOptions});
        if (tableName === TABLES.TABLES &&
            durableTableRows &&
            durableTableRows.length > 0) {
          Object.assign(durableTableRows[0], data);
        }
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row, options) {
        insertCalls.push({tableName, row, options});
        return {success: true};
      },
    },
    getPartitionInfo: options.getPartitionInfo || (() => ({
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      replica_count: 3,
      leader_node_id: 'node-a',
      size_bytes: 128,
    })),
    getTableInfo: options.getTableInfo || (() => resolvedTableInfo),
    listTableInfos: options.listTableInfos ||
      (() => durableTableRows ? durableTableRows : [resolvedTableInfo]),
    parsePartitionTransition: options.parsePartitionTransition || (() => null),
    isLocalManagedSplitLeader: options.isLocalManagedSplitLeader ||
      (() => true),
    resolveActivePartitionVersion: options.resolveActivePartitionVersion ||
      (() => 1),
    buildManagedSplitPlan: options.buildManagedSplitPlan || (async () => ({
      medianKey: 'm',
      leftPartition: {
        partitionId: 'users-p-left',
        keyRange: {start: null, end: 'm'},
      },
      rightPartition: {
        partitionId: 'users-p-right',
        keyRange: {start: 'm', end: null},
      },
    })),
    calculateQuorumReplicaCount: options.calculateQuorumReplicaCount ||
      (() => 2),
    resolveProvisionTargetNodeIds: options.resolveProvisionTargetNodeIds ||
      (() => ['node-a', 'node-b', 'node-c']),
    getRoutablePartitionServiceNodeIds:
      options.getRoutablePartitionServiceNodeIds ||
      (() => ['node-a', 'node-b']),
    isSystemTablePartitionId:
      options.isSystemTablePartitionId ||
      (() => false),
    captureTopologySnapshot:
      options.captureTopologySnapshot || null,
    storageAdmissionService:
      Object.hasOwn(options, 'storageAdmissionService') ?
        options.storageAdmissionService :
        {
          async checkSplit(payload) {
            admissionCalls.push(payload);
            return createAdmissionResult();
          },
        },
    pressureGovernor: options.pressureGovernor || null,
    waitForTablePartitionMetadata:
      options.waitForTablePartitionMetadata || (async () => {}),
    probeInitialTablePartitionProvisioning:
      options.probeInitialTablePartitionProvisioning || (async (context) => {
        probeProvisioningCalls.push(context);
        return {
          existingRoutableNodeIds: [],
          candidateTargetNodeIds: Array.isArray(context?.targetNodeIds) ?
            [...context.targetNodeIds] :
            [],
          admittedTargetNodeIds: Array.isArray(context?.targetNodeIds) ?
            [...context.targetNodeIds] :
            [],
          rejectedTargetNodePlans: [],
          maximumProvisionableReplicaCount: Array.isArray(
            context?.targetNodeIds,
          ) ?
            context.targetNodeIds.length :
            0,
        };
      }),
    provisionInitialTablePartition:
      options.provisionInitialTablePartition || (async (context) => {
        provisionCalls.push(context);
      }),
    startSplitReplicationOnSourcePartition:
      options.startSplitReplicationOnSourcePartition || (async () => {}),
    logger: options.logger || {info() {}, error() {}},
    now: options.now || (() => 1000),
    transactionCoordinator,
  });

  return {
    workflow,
    updateCalls,
    insertCalls,
    admissionCalls,
    probeProvisioningCalls,
    provisionCalls,
  };
}

export {
  buildWorkflow,
  createAdmissionResult,
  createTransactionCoordinator,
};
