import {TABLES} from '../../src/constants/index.js';
import {
  ManagedMergeWorkflow,
} from '../../src/partition/managed-merge-workflow.js';
import {
  createAdmissionResult,
  createTransactionCoordinator,
} from './managed-split-workflow-test-helpers.js';

const FIXTURE_TABLE_ID = 'tbl-users';
const FIXTURE_TABLE_NAME = 'users';
const FIXTURE_LEFT_PARTITION_ID = 'users-p1';
const FIXTURE_RIGHT_PARTITION_ID = 'users-p2';
const FIXTURE_SIBLING_PARTITION_ID = 'users-p3';
const FIXTURE_BOUNDARY_KEY = 'm';
const FIXTURE_SIBLING_BOUNDARY_KEY = 't';

function createDefaultPartitionInfos() {
  return {
    [FIXTURE_LEFT_PARTITION_ID]: {
      partition_id: FIXTURE_LEFT_PARTITION_ID,
      table_id: FIXTURE_TABLE_ID,
      table_name: FIXTURE_TABLE_NAME,
      partition_key_start: null,
      partition_key_end: FIXTURE_BOUNDARY_KEY,
      partition_version: 1,
      replica_count: 2,
      leader_node_id: 'node-a',
      size_bytes: 128,
      state: 'NORMAL',
    },
    [FIXTURE_RIGHT_PARTITION_ID]: {
      partition_id: FIXTURE_RIGHT_PARTITION_ID,
      table_id: FIXTURE_TABLE_ID,
      table_name: FIXTURE_TABLE_NAME,
      partition_key_start: FIXTURE_BOUNDARY_KEY,
      partition_key_end: null,
      partition_version: 1,
      replica_count: 2,
      leader_node_id: 'node-a',
      size_bytes: 96,
      state: 'NORMAL',
    },
  };
}

/**
 * Three adjacent partitions at the active epoch — the natural result of
 * two managed splits and the shape that exposed the sibling-blackhole
 * defect: p1 [null,'m'), p2 ['m','t'), p3 ['t',null).
 * @return {Object} partitionInfos keyed by partition id.
 */
function createThreePartitionInfos() {
  const partitionInfos = createDefaultPartitionInfos();
  partitionInfos[FIXTURE_RIGHT_PARTITION_ID].partition_key_end =
    FIXTURE_SIBLING_BOUNDARY_KEY;
  partitionInfos[FIXTURE_SIBLING_PARTITION_ID] = {
    partition_id: FIXTURE_SIBLING_PARTITION_ID,
    table_id: FIXTURE_TABLE_ID,
    table_name: FIXTURE_TABLE_NAME,
    partition_key_start: FIXTURE_SIBLING_BOUNDARY_KEY,
    partition_key_end: null,
    partition_version: 1,
    replica_count: 2,
    leader_node_id: 'node-a',
    size_bytes: 4096,
    state: 'NORMAL',
  };
  return partitionInfos;
}

/**
 * Parse the durable table row's transition columns the way the SQL query
 * engine's parsePartitionTransition does, so recovery paths behave like
 * production against the recorded durable row.
 * @param {Object|null} tableInfo
 * @return {Object|null}
 */
function parseDurablePartitionTransition(tableInfo) {
  const state = tableInfo?.partition_transition_state || null;
  const rawMetadata = tableInfo?.partition_transition_metadata || null;
  if (!state || !rawMetadata) {
    return null;
  }
  const metadata = typeof rawMetadata === 'string' ?
    JSON.parse(rawMetadata) :
    rawMetadata;
  return {state, metadata};
}

/**
 * Resolve one helper option with a fallback default.
 * Keeps buildMergeWorkflow itself a flat wiring table.
 * @param {Object} options
 * @param {string} name
 * @param {*} fallback
 * @return {*}
 */
function resolveOption(options, name, fallback) {
  return Object.hasOwn(options, name) ? options[name] : fallback;
}

function createRecordingCdcIntegrationService(recorders) {
  const {
    updateCalls,
    insertCalls,
    deleteCalls,
    durableTableRow,
    partitionInfos,
  } = recorders;
  return {
    async updateSystemTableRow(tableName, whereClause, data, updateOptions) {
      updateCalls.push({tableName, whereClause, data, options: updateOptions});
      if (tableName === TABLES.TABLES) {
        Object.assign(durableTableRow, data);
      }
      // Apply PARTITIONS mutations to the fixture rows so routing/epoch
      // assertions observe the same durable state production would.
      if (tableName === TABLES.PARTITIONS &&
          partitionInfos?.[whereClause?.partition_id]) {
        Object.assign(partitionInfos[whereClause.partition_id], data);
      }
      return {success: true, affectedRows: 1};
    },
    async insertSystemTableRow(tableName, row, insertOptions) {
      insertCalls.push({tableName, row, options: insertOptions});
      if (tableName === TABLES.PARTITIONS &&
          partitionInfos && row?.partition_id) {
        partitionInfos[row.partition_id] = {...row};
      }
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause, deleteOptions) {
      deleteCalls.push({tableName, whereClause, options: deleteOptions});
      if (tableName === TABLES.PARTITIONS &&
          partitionInfos?.[whereClause?.partition_id]) {
        delete partitionInfos[whereClause.partition_id];
      }
      return {success: true};
    },
  };
}

function createDefaultDurableTableRow() {
  return {
    table_id: FIXTURE_TABLE_ID,
    table_name: FIXTURE_TABLE_NAME,
    partition_key: 'id',
    active_partition_version: 1,
    partition_count: 2,
    partition_transition_state: null,
    partition_transition_metadata: null,
  };
}

function createDefaultServiceRowsByPartitionId() {
  return {
    [FIXTURE_LEFT_PARTITION_ID]: [
      {
        partition_id: FIXTURE_LEFT_PARTITION_ID,
        replica_id: 'users-p1-r1',
        node_id: 'node-a',
      },
    ],
    [FIXTURE_RIGHT_PARTITION_ID]: [
      {
        partition_id: FIXTURE_RIGHT_PARTITION_ID,
        replica_id: 'users-p2-r1',
        node_id: 'node-b',
      },
    ],
  };
}

function createDefaultProvisioningProbe() {
  return async (context) => {
    const targetNodeIds = Array.isArray(context?.targetNodeIds) ?
      [...context.targetNodeIds] :
      [];
    return {
      existingRoutableNodeIds: [],
      candidateTargetNodeIds: targetNodeIds,
      admittedTargetNodeIds: targetNodeIds,
      rejectedTargetNodePlans: [],
      maximumProvisionableReplicaCount: targetNodeIds.length,
    };
  };
}

function buildMergeWorkflow(options = {}) {
  const opt = (name, fallback) => resolveOption(options, name, fallback);
  const updateCalls = opt('updateCalls', []);
  const insertCalls = opt('insertCalls', []);
  const deleteCalls = opt('deleteCalls', []);
  const admissionCalls = opt('admissionCalls', []);
  const provisionCalls = opt('provisionCalls', []);
  const startMergeCalls = opt('startMergeCalls', []);
  const replicaRemovalCalls = opt('replicaRemovalCalls', []);
  const partitionInfos = opt('partitionInfos', createDefaultPartitionInfos());
  const durableTableRow = opt(
    'durableTableRow', createDefaultDurableTableRow(),
  );
  const serviceRowsByPartitionId = opt(
    'serviceRowsByPartitionId', createDefaultServiceRowsByPartitionId(),
  );
  const now = opt('now', () => 1000);

  const workflow = new ManagedMergeWorkflow({
    nodeId: 'node-a',
    cdcIntegrationService: opt(
      'cdcIntegrationService',
      createRecordingCdcIntegrationService({
        updateCalls, insertCalls, deleteCalls, durableTableRow,
        partitionInfos,
      }),
    ),
    getPartitionInfo: opt(
      'getPartitionInfo',
      (partitionId) => partitionInfos[partitionId] || null,
    ),
    listTablePartitionRows: opt(
      'listTablePartitionRows',
      (tableId) => Object.values(partitionInfos).filter(
        (row) => row.table_id === tableId,
      ),
    ),
    getTableInfo: opt('getTableInfo', () => durableTableRow),
    listTableInfos: opt('listTableInfos', () => [durableTableRow]),
    parsePartitionTransition: opt(
      'parsePartitionTransition', parseDurablePartitionTransition,
    ),
    isLocalManagedMergeLeader: opt('isLocalManagedMergeLeader', () => true),
    resolveActivePartitionVersion: opt(
      'resolveActivePartitionVersion',
      () => Number(durableTableRow.active_partition_version) || 1,
    ),
    calculateQuorumReplicaCount: opt('calculateQuorumReplicaCount', () => 2),
    resolveProvisionTargetNodeIds: opt(
      'resolveProvisionTargetNodeIds',
      () => ['node-a', 'node-b', 'node-c'],
    ),
    getRoutablePartitionServiceNodeIds: opt(
      'getRoutablePartitionServiceNodeIds',
      () => ['node-a', 'node-b'],
    ),
    isCriticalSystemPartition: opt('isCriticalSystemPartition', () => false),
    storageAdmissionService: opt('storageAdmissionService', {
      async checkSplit(payload) {
        admissionCalls.push(payload);
        return createAdmissionResult();
      },
    }),
    pressureGovernor: opt('pressureGovernor', null),
    waitForTablePartitionMetadata: opt(
      'waitForTablePartitionMetadata', async () => {},
    ),
    probeInitialTablePartitionProvisioning: opt(
      'probeInitialTablePartitionProvisioning',
      createDefaultProvisioningProbe(),
    ),
    provisionInitialTablePartition: opt(
      'provisionInitialTablePartition',
      async (context) => {
        provisionCalls.push(context);
      },
    ),
    startMergeReplicationOnSourcePartition: opt(
      'startMergeReplicationOnSourcePartition',
      async (partitionId, tableId, tableName, transitionMetadata) => {
        startMergeCalls.push({
          partitionId,
          tableId,
          tableName,
          transitionMetadata,
        });
      },
    ),
    listPartitionServiceRows: opt(
      'listPartitionServiceRows',
      (partitionId) => serviceRowsByPartitionId[partitionId] || [],
    ),
    deliverReplicaRemoval: opt(
      'deliverReplicaRemoval',
      async (request) => {
        replicaRemovalCalls.push(request);
        return {status: 'initiated'};
      },
    ),
    mergeStorageThresholdBytes: opt('mergeStorageThresholdBytes', undefined),
    logger: opt('logger', {info() {}, warn() {}, error() {}}),
    now,
    transactionCoordinator: opt(
      'transactionCoordinator', createTransactionCoordinator(now),
    ),
  });

  return {
    workflow,
    durableTableRow,
    partitionInfos,
    updateCalls,
    insertCalls,
    deleteCalls,
    admissionCalls,
    provisionCalls,
    startMergeCalls,
    replicaRemovalCalls,
  };
}

export {
  createRecordingCdcIntegrationService,
  FIXTURE_BOUNDARY_KEY,
  FIXTURE_SIBLING_BOUNDARY_KEY,
  FIXTURE_LEFT_PARTITION_ID,
  FIXTURE_RIGHT_PARTITION_ID,
  FIXTURE_SIBLING_PARTITION_ID,
  FIXTURE_TABLE_ID,
  FIXTURE_TABLE_NAME,
  buildMergeWorkflow,
  createDefaultPartitionInfos,
  createThreePartitionInfos,
  parseDurablePartitionTransition,
};
