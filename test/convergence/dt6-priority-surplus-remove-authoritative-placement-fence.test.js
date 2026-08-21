import t from 'tap';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  MOVE_REASON,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {createTestCoordinator} from '../rebalancer/test-helpers.js';

const PARTITION_ID = `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`;
const LEDGER_PARTITION_ID = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
const TARGET_REPLICA_COUNT = 3;
const NODE_IDS = Object.freeze([
  'node-seed',
  'node-1',
  'node-2',
  'node-3',
  'node-4',
]);

function replicaRow(partitionId, replicaId, nodeId, options = {}) {
  const row = {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: nodeId,
    status: options.status || 'active',
    raft_role: options.raftRole || 'follower',
  };
  if (options.omitReplicaId === true) {
    delete row.service_id;
    delete row.replica_id;
  }
  return row;
}

function voterRows(partitionId, placements) {
  return placements.map(({replicaId, nodeId}, index) =>
    replicaRow(partitionId, replicaId, nodeId, {
      raftRole: index === 0 ? 'leader' : 'follower',
    }),
  );
}

function staleHandoffRows() {
  return voterRows(PARTITION_ID, [
    {replicaId: `${PARTITION_ID}-r1`, nodeId: 'node-seed'},
    {replicaId: `${PARTITION_ID}-r2`, nodeId: 'node-seed'},
    {replicaId: `${PARTITION_ID}-r3`, nodeId: 'node-seed'},
    {replicaId: `${PARTITION_ID}-r5`, nodeId: 'node-1'},
  ]);
}

function canonicalSpreadRows() {
  return voterRows(PARTITION_ID, [
    {replicaId: `${PARTITION_ID}-r1`, nodeId: 'node-seed'},
    {replicaId: `${PARTITION_ID}-r4`, nodeId: 'node-3'},
    {replicaId: `${PARTITION_ID}-r5`, nodeId: 'node-1'},
  ]);
}

function canonicalSurplusRows() {
  return voterRows(PARTITION_ID, [
    {replicaId: `${PARTITION_ID}-r1`, nodeId: 'node-seed'},
    {replicaId: `${PARTITION_ID}-r4`, nodeId: 'node-3'},
    {replicaId: `${PARTITION_ID}-r5`, nodeId: 'node-1'},
    {replicaId: `${PARTITION_ID}-r6`, nodeId: 'node-seed'},
  ]);
}

function ledgerSpreadRows() {
  return voterRows(LEDGER_PARTITION_ID, [
    {replicaId: `${LEDGER_PARTITION_ID}-r1`, nodeId: 'node-seed'},
    {replicaId: `${LEDGER_PARTITION_ID}-r2`, nodeId: 'node-1'},
    {replicaId: `${LEDGER_PARTITION_ID}-r3`, nodeId: 'node-3'},
  ]);
}

function cacheData(localRows = staleHandoffRows()) {
  return {
    nodes: NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      connection_state: 'ready',
      status: 'active',
    })),
    partitions: [PARTITION_ID, LEDGER_PARTITION_ID].map((partitionId) => ({
      partition_id: partitionId,
      replica_count: TARGET_REPLICA_COUNT,
    })),
    services: [...localRows, ...ledgerSpreadRows()],
  };
}

async function runRemove({
  authoritativeRows = canonicalSpreadRows(),
  authoritativeSource = 'owner_rpc_lane',
  authoritativeSuccess = true,
  authoritativeError = null,
  enforceConcurrentOperationBudget = true,
  localRows = staleHandoffRows(),
  moveReason = MOVE_REASON.SPREAD_REPLICAS,
  moveNodeId = 'node-seed',
  partitionId = PARTITION_ID,
  replicaId = `${PARTITION_ID}-r1`,
  targetPolicy = {
    targetReplicaCount: TARGET_REPLICA_COUNT,
    minReplicaCount: 2,
  },
} = {}) {
  const servicesReads = [];
  const mutations = [];
  const operationRows = [];
  const gateway = {
    async readAuthoritativeRows(tableName, _sql, params = [], options = {}) {
      if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
        servicesReads.push({params: [...params], options: {...options}});
        if (authoritativeError) {
          throw authoritativeError;
        }
        return authoritativeSuccess ? {
          success: true,
          source: authoritativeSource,
          rows: authoritativeRows,
        } : {
          success: false,
          error: 'services owner unavailable',
          rows: [],
        };
      }
      if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return {
          success: true,
          source: 'owner_rpc_lane',
          rows: [...operationRows],
        };
      }
      return {success: true, source: 'owner_rpc_lane', rows: []};
    },
    async readRows(tableName, sql, params = [], options = {}) {
      return this.readAuthoritativeRows(tableName, sql, params, options);
    },
    async executeQuery() {
      return {success: true, rows: []};
    },
    async submitMutation(mutation) {
      mutations.push(mutation);
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
  const coordinator = createTestCoordinator({
    nodeId: 'node-1',
    cacheData: cacheData(localRows),
    controlPlaneSystemTableGateway: gateway,
    cdcIntegrationService: {
      async insertSystemTableRow(tableName, row) {
        mutations.push({operation: 'insert', tableName, row});
        if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
          operationRows.push({...row});
        }
        return {success: true, partitionResult: {affectedRows: 1}};
      },
      async updateSystemTableRow(tableName, whereClause, data) {
        mutations.push({operation: 'update', tableName, whereClause, data});
        return {success: true, partitionResult: {affectedRows: 1}};
      },
      async refreshAuthoritativeCacheRow() {
        return true;
      },
    },
    tablePolicyService: {
      getPolicyForPartition: async () => targetPolicy,
    },
  });
  coordinator.queryShutdownIncompleteOperations = async () => [];
  coordinator.createOperationRecordInternal = async ({move}) => {
    mutations.push({operation: 'persist-intent', move: {...move}});
    return {
      operationId: 'captured-remove-operation',
      type: 'REMOVE',
      partitionId: move.partitionId,
      replicaId: move.replicaId,
      targetNodeId: move.nodeId,
      status: 'pending',
      workflowStep: 'PENDING',
    };
  };
  let operation = null;
  let error = null;
  try {
    operation = await coordinator.createOperation({
      type: 'REMOVE',
      partitionId,
      entityType: 'partition',
      entityId: partitionId,
      nodeId: moveNodeId,
      replicaId,
      moveReason,
      enforceConcurrentOperationBudget,
      emitOperationCreated: false,
    });
  } catch (caught) {
    error = caught;
  } finally {
    await coordinator.shutdown();
  }
  return {error, mutations, operation, servicesReads};
}

t.test(
  'leader handoff cannot persist REMOVE r1 from a stale four-row superset ' +
    'after owner placement has settled at three spread voters',
  async (t) => {
    const result = await runRemove();

    t.equal(result.operation, null, 'the stale destructive intent is discarded');
    t.equal(result.error?.rebalanceSkipReason, REBALANCER_SKIP_REASON.SAFETY_BLOCKED);
    t.equal(result.mutations.length, 0, 'no replica operation is persisted');
    t.equal(result.servicesReads.length, 1, 'one bounded owner read fences commit');
    t.equal(
      result.servicesReads[0]?.options.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    );
    t.equal(
      result.servicesReads[0]?.options.leaderMode,
      CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
    );
  },
);

t.test('a genuine four-voter monotonic surplus REMOVE is persisted', async (t) => {
  const result = await runRemove({
    authoritativeRows: canonicalSurplusRows(),
    replicaId: `${PARTITION_ID}-r6`,
  });

  t.equal(result.error, null);
  t.equal(result.operation?.type, 'REMOVE');
  t.equal(result.operation?.replicaId, `${PARTITION_ID}-r6`);
  t.equal(result.servicesReads.length, 1);
  t.ok(result.mutations.length > 0, 'the proven surplus operation is persisted');
});

t.test('an unavailable policy target fails closed before the owner read',
  async (t) => {
    const result = await runRemove({targetPolicy: null});

    t.equal(result.operation, null);
    t.equal(result.error?.rebalanceSkipReason, REBALANCER_SKIP_REASON.SAFETY_BLOCKED);
    t.equal(result.error?.admissionResult?.placementFenceDecision?.state,
      'target_unavailable');
    t.equal(result.mutations.length, 0);
    t.equal(result.servicesReads.length, 0);
  });

for (const testCase of [
  {
    name: 'owner unavailable',
    options: {authoritativeSuccess: false},
  },
  {
    name: 'owner read throws',
    options: {authoritativeError: new Error('services owner read failed')},
  },
  {
    name: 'non-owner fallback',
    options: {authoritativeSource: 'local_partition_replica'},
  },
  {
    name: 'source absent',
    options: {
      authoritativeRows: canonicalSurplusRows().filter(
        (row) => row.replica_id !== `${PARTITION_ID}-r1`,
      ),
    },
  },
  {
    name: 'source node changed',
    options: {
      authoritativeRows: canonicalSurplusRows(),
      replicaId: `${PARTITION_ID}-r6`,
      moveNodeId: 'node-1',
    },
  },
  {
    name: 'malformed replica identity',
    options: {
      authoritativeRows: [
        ...canonicalSurplusRows(),
        replicaRow(PARTITION_ID, 'malformed', 'node-4', {omitReplicaId: true}),
      ],
    },
  },
  {
    name: 'duplicate identical replica identity',
    options: {
      authoritativeRows: [
        ...canonicalSurplusRows(),
        replicaRow(PARTITION_ID, `${PARTITION_ID}-r6`, 'node-seed'),
      ],
    },
  },
  {
    name: 'duplicate conflicting replica identity',
    options: {
      authoritativeRows: [
        ...canonicalSurplusRows(),
        replicaRow(PARTITION_ID, `${PARTITION_ID}-r6`, 'node-4'),
      ],
    },
  },
  {
    name: 'diversity-reducing surplus source',
    options: {
      authoritativeRows: canonicalSurplusRows(),
      replicaId: `${PARTITION_ID}-r4`,
    },
  },
]) {
  t.test(`${testCase.name} evidence fails closed without persistence`, async (t) => {
    const result = await runRemove(testCase.options);
    t.equal(result.operation, null);
    t.equal(result.error?.rebalanceSkipReason, REBALANCER_SKIP_REASON.SAFETY_BLOCKED);
    t.equal(result.mutations.length, 0);
    t.equal(result.servicesReads.length, 1);
  });
}

t.test('ADD and REPLACE do not enter the destructive placement fence',
  async (t) => {
    let ownerReadCount = 0;
    const coordinator = createTestCoordinator({
      nodeId: 'node-1',
      cacheData: cacheData(),
    });
    coordinator.queryShutdownIncompleteOperations = async () => [];
    coordinator.getAuthoritativeEntityServiceRowsObservation = async () => {
      ownerReadCount += 1;
      throw new Error('destructive fence read was not expected');
    };
    try {
      for (const normalizedMoveType of ['ADD', 'REPLACE']) {
        await coordinator.ensurePrioritySurplusRemovePlacementFenceAllowed({
          normalizedMoveType,
          partitionId: PARTITION_ID,
          entityType: 'partition',
          entityId: PARTITION_ID,
          move: {
            type: normalizedMoveType,
            nodeId: 'node-3',
            replicaId: `${PARTITION_ID}-r1`,
          },
        });
      }
      t.equal(ownerReadCount, 0);
    } finally {
      await coordinator.shutdown();
    }
  });

for (const testCase of [
  {
    name: 'failed priority cleanup',
    options: {moveReason: MOVE_REASON.REPLICA_FAILED},
  },
  {
    name: 'non-priority standalone remove',
    options: {
      partitionId: 'ratings-p1',
      replicaId: 'ratings-p1-r1',
      enforceConcurrentOperationBudget: false,
    },
  },
]) {
  t.test(`${testCase.name} preserves the no-new-authority-read path`, async (t) => {
    const result = await runRemove(testCase.options);
    t.equal(result.error, null);
    t.equal(result.operation?.type, 'REMOVE');
    t.equal(result.servicesReads.length, 0);
    t.ok(result.mutations.length > 0);
  });
}
