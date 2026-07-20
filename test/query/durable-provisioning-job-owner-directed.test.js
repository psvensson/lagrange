import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {OWNER_CONTRACT_STATE} from
  '../../src/control-plane/owner-contract-outcome.js';
import {createTimeoutBudget} from
  '../../src/control-plane/timeout-budget.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {TableCreationService} from
  '../../src/query/table-creation-service.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {
  createMockMessageRouter,
  createProvisioningReadyService,
} from './sql-query-engine-test-support.js';

const TABLE_NAME = 'w9_directed_provisioning_probe';
const NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);

function createAst() {
  return {
    tableName: TABLE_NAME,
    columns: [
      {name: 'id', dataType: {name: 'TEXT'}, primaryKey: true},
      {name: 'payload', dataType: {name: 'TEXT'}},
    ],
    primaryKey: ['id'],
    ifNotExists: false,
  };
}

function mutationIdentity(tableName, row) {
  if (tableName === TABLES.SCHEMA_OPERATIONS) return row.job_id;
  if (tableName === TABLES.REPLICA_OPERATIONS) return row.operation_id;
  if (tableName === TABLES.PARTITIONS) return row.partition_id;
  return row.table_id;
}

function applyDirectedInsert(rows, tableRows, mutation) {
  const {tableName} = mutation;
  if (tableName === TABLES.SCHEMA_OPERATIONS) {
    const conflict = tableRows(tableName).find((row) =>
      row.table_identity_key === mutation.row.table_identity_key,
    );
    if (conflict) return {success: false, affectedRows: 0};
  }
  const key = `${tableName}:${mutationIdentity(tableName, mutation.row)}`;
  if (rows.has(key)) return {success: true, affectedRows: 0};
  rows.set(key, {...mutation.row});
  return {success: true, affectedRows: 1, visibilityState: 'visible'};
}

function applyDirectedUpdate(rows, mutation) {
  const {tableName} = mutation;
  const identity = mutation.whereClause?.job_id ||
    mutation.whereClause?.operation_id;
  const key = `${tableName}:${identity}`;
  const current = rows.get(key);
  if (!current) return {success: true, affectedRows: 0};
  if (tableName === TABLES.SCHEMA_OPERATIONS) {
    const where = mutation.whereClause;
    if (
      current.row_version !== where.row_version ||
      current.workflow_fence_token !== where.workflow_fence_token ||
      (where.workflow_owner_id !== undefined &&
        current.workflow_owner_id !== where.workflow_owner_id)
    ) {
      return {success: true, affectedRows: 0};
    }
  }
  rows.set(key, {...current, ...mutation.data});
  return {success: true, affectedRows: 1, visibilityState: 'visible'};
}

function createDurableGateway(serviceRows) {
  const rows = new Map();
  const writes = [];

  function tableRows(tableName) {
    return [...rows.entries()]
      .filter(([key]) => key.startsWith(`${tableName}:`))
      .map(([, row]) => row);
  }

  function readReplicaOperations(sql, params) {
    const candidates = tableRows(TABLES.REPLICA_OPERATIONS);
    if (sql.includes('operation_id = ?')) {
      return candidates.filter((row) => row.operation_id === params[0]);
    }
    if (sql.includes('target_node_id = ?')) {
      return candidates.filter((row) =>
        row.partition_id === params[0] && row.target_node_id === params[1],
      );
    }
    if (sql.includes('entity_type = ?')) {
      return candidates.filter((row) =>
        row.entity_type === params[0] && row.entity_id === params[1],
      );
    }
    if (sql.includes('partition_id = ?')) {
      return candidates.filter((row) => row.partition_id === params[0]);
    }
    return candidates;
  }

  async function readRows(tableName, sql = '', params = []) {
    if (tableName === TABLES.SERVICES) return {success: true, rows: serviceRows};
    if (tableName === TABLES.REPLICA_OPERATIONS) {
      return {success: true, rows: readReplicaOperations(sql, params)};
    }
    const candidates = tableRows(tableName);
    if (tableName === TABLES.SCHEMA_OPERATIONS) {
      return {rows: params.length === 0 ? candidates.filter(
        (row) => row.status !== 'SUCCEEDED' && row.status !== 'FAILED',
      ) : candidates.filter((row) => row.table_identity_key === params[0])};
    }
    if (tableName === TABLES.TABLES) {
      return {rows: candidates.filter((row) => row.table_name === params[0])};
    }
    if (tableName === TABLES.PARTITIONS) {
      return {rows: candidates.filter((row) => row.partition_id === params[0])};
    }
    return {success: true, rows: candidates};
  }

  return {
    rows,
    writes,
    cdcIntegrationService: {
      insertSystemTableRow() {},
      updateSystemTableRow() {},
    },
    async submitMutation(mutation) {
      writes.push(mutation);
      const operation = String(mutation.operation).toUpperCase();
      const tableName = mutation.tableName;
      if (operation === 'INSERT') {
        return applyDirectedInsert(rows, tableRows, mutation);
      }
      if (operation === 'UPDATE') {
        return applyDirectedUpdate(rows, mutation);
      }
      throw new Error(`Unexpected durable mutation ${operation} ${tableName}`);
    },
    readRows,
    readAuthoritativeRows: readRows,
    async executeQuery(sql, params = []) {
      if (sql.includes('replica_operations')) {
        return readRows(TABLES.REPLICA_OPERATIONS, sql, params);
      }
      if (sql.includes('services')) return readRows(TABLES.SERVICES, sql, params);
      return {success: true, rows: []};
    },
  };
}

function createCache(serviceRows) {
  const nodes = NODE_IDS.map((nodeId) => ({node_id: nodeId, status: 'active'}));
  const records = (tableName) => {
    if (tableName === TABLES.NODES) return nodes;
    if (tableName === TABLES.SERVICES) return serviceRows;
    return [];
  };
  return {
    getAll: records,
    filter: (tableName, predicate) => records(tableName).filter(predicate),
    find: (tableName, predicate) => records(tableName).find(predicate) || null,
    onCacheChange() {},
    offCacheChange() {},
  };
}

function createRuntime(options) {
  const {
    capacity,
    clock,
    gateway,
    ownerId,
    serviceRows,
    suspendWhenConstrained = false,
  } = options;
  const cache = createCache(serviceRows);
  const messageRouter = createMockMessageRouter();
  messageRouter.deliver = async (_target, request, deliveryOptions = {}) => {
    const targetNodeId = deliveryOptions.targetNodeId;
    capacity.dispatches.push({
      operationId: request.operationId,
      replicaId: request.replicaId,
      targetNodeId,
    });
    if (!serviceRows.some((row) => row.service_id === request.replicaId)) {
      serviceRows.push({
        service_id: request.replicaId,
        replica_id: request.replicaId,
        partition_id: request.partitionId,
        node_id: targetNodeId,
        service_type: 'partition',
        status: 'active',
        raft_role: targetNodeId === NODE_IDS[0] ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${request.partitionId}`,
      });
    }
    return {acknowledged: true, status: 'completed'};
  };
  const sqlPersistence = {
    executeQuery: (sql, params) => gateway.executeQuery(sql, params),
  };
  const coordinator = new RebalanceCoordinator({
    nodeId: NODE_IDS[0],
    systemTableCache: cache,
    cdcIntegrationService: {
      async insertSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async upsertSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async waitForCacheUpdate() {},
      // Terminal ACTIVE completion requires the authoritative cache-row
      // refresh to succeed (b52aa01d) before the operation may finish.
      async refreshAuthoritativeCacheRow() {
        return true;
      },
    },
    messageRouter,
    tablePolicyService: {
      async getPolicyForPartition() {
        return {replicaCount: NODE_IDS.length, minReplicaCount: 2};
      },
    },
    sqlQueryEngine: sqlPersistence,
    transactionCoordinator: {
      async begin() {
        return {success: true};
      },
      async commit() {
        return {success: true};
      },
      async rollback() {
        return {success: true};
      },
    },
    controlPlaneReadinessService: createProvisioningReadyService(cache),
    controlPlaneSystemTableGateway: gateway,
    storageAccountingService: {estimateReplicaBytes: () => 1},
    storageAdmissionService: {
      async checkAdd(context) {
        if (capacity.available) {
          return {allowed: true, decisionType: 'admitted'};
        }
        capacity.deniedNodeIds.add(context?.nodeId || 'unknown');
        return {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['capacity_unavailable'],
        };
      },
      async checkReplace() {
        return {allowed: capacity.available, decisionType: 'admitted'};
      },
    },
    enableTimeouts: false,
    nowFn: () => clock.value,
  });
  coordinator.ensureOperationLedgerSelfMoveSerialized = async () => null;
  coordinator.persistOperationUpdate = async (operation) => {
    const key = `${TABLES.REPLICA_OPERATIONS}:${operation.operationId}`;
    gateway.rows.set(key, {
      ...gateway.rows.get(key),
      status: operation.status,
      workflow_step: operation.workflowStep,
      steps_history: JSON.stringify(operation.stepsHistory),
      replica_id: operation.replicaId,
    });
    return true;
  };
  coordinator.initialize();

  const engine = new SQLQueryEngine({
    nodeId: NODE_IDS[0],
    systemCache: cache,
    messageRouter,
    rebalanceCoordinator: coordinator,
    controlPlaneReadinessService: createProvisioningReadyService(cache),
    tablePartitionProvisioningTimeoutMs: 50,
    tablePartitionProvisioningPollIntervalMs: 1,
    tablePartitionTargetNodeConvergenceTimeoutMs: 5,
    nowFn: () => clock.value,
  });
  const suspendedSleep = new Promise(() => {});
  engine.sleep = async (durationMs) => {
    if (suspendWhenConstrained && !capacity.available) return suspendedSleep;
    clock.value += durationMs;
  };

  const service = new TableCreationService({
    systemCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow() {},
      updateSystemTableRow() {},
      upsertSystemTableRow() {},
    },
    controlPlaneSystemTableGateway: gateway,
    schemaProvisioningOwnerId: ownerId,
    now: () => clock.value,
    setTimeoutFn: (callback) => {
      callback();
      return 1;
    },
    clearTimeoutFn() {},
    partitionProvisioner: (context) =>
      engine.provisionInitialTablePartition(context),
  });
  return {coordinator, engine, service};
}

async function runDurableProvisioningDirectedScenario(t) {
  const clock = {value: 100};
  const capacity = {
    available: false,
    deniedNodeIds: new Set(),
    dispatches: [],
  };
  const serviceRows = [];
  const gateway = createDurableGateway(serviceRows);
  const firstRuntime = createRuntime({
    capacity,
    clock,
    gateway,
    ownerId: 'schema-owner-before-restart',
    serviceRows,
    suspendWhenConstrained: true,
  });

  const pending = await firstRuntime.service.createTable(createAst(), {
    timeoutBudget: createTimeoutBudget({
      configuredBudgetMs: 10,
      now: () => clock.value,
    }),
  });
  t.equal(pending.contractState, OWNER_CONTRACT_STATE.PENDING);
  while (capacity.deniedNodeIds.size === 0) await new Promise(setImmediate);
  t.ok(capacity.deniedNodeIds.size > 0,
    'real RebalanceCoordinator admission observed constrained capacity');

  clock.value = 40000;
  capacity.available = true;
  const recoveredRuntime = createRuntime({
    capacity,
    clock,
    gateway,
    ownerId: 'schema-owner-after-restart',
    serviceRows,
  });
  const completed = await recoveredRuntime.service.createTable(createAst());
  t.equal(completed.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(completed.jobId, pending.jobId,
    'owner recreation attaches to the durable parent identity');

  const jobs = [...gateway.rows.values()].filter((row) =>
    row.table_name === TABLE_NAME && row.job_id,
  );
  const tables = [...gateway.rows.values()].filter((row) =>
    row.table_name === TABLE_NAME && row.table_id && !row.job_id &&
      !row.partition_id,
  );
  const partitions = [...gateway.rows.values()].filter((row) =>
    row.table_id === completed.tableId && row.partition_id,
  );
  const operations = [...gateway.rows.values()].filter((row) =>
    row.partition_id === completed.partitionId && row.operation_id,
  );
  const activeReplicas = serviceRows.filter((row) =>
    row.partition_id === completed.partitionId && row.status === 'active',
  );

  t.equal(jobs.length, 1);
  t.equal(jobs[0].status, 'SUCCEEDED');
  t.equal(tables.length, 1);
  t.equal(partitions.length, 1);
  t.equal(activeReplicas.length, NODE_IDS.length);
  t.equal(new Set(activeReplicas.map((row) => row.node_id)).size, NODE_IDS.length);
  t.equal(operations.length, NODE_IDS.length);
  t.equal(new Set(operations.map((row) => row.operation_id)).size, operations.length);
  t.equal(new Set(operations.map((row) => row.replica_id)).size, operations.length);
  const expectedOperationIds = NODE_IDS.map((nodeId) =>
    `${completed.jobId}:operation:${nodeId}`,
  ).sort();
  const expectedReplicaIds = NODE_IDS.map((nodeId) =>
    `${completed.jobId}:replica:${nodeId}`,
  ).sort();
  t.equal(
    JSON.stringify(operations.map((row) => row.operation_id).sort()),
    JSON.stringify(expectedOperationIds),
  );
  t.equal(
    JSON.stringify(operations.map((row) => row.replica_id).sort()),
    JSON.stringify(expectedReplicaIds),
  );
  t.equal(capacity.dispatches.length, NODE_IDS.length,
    'all child work crossed the real coordinator dispatch owner');
  t.equal(operations.every((row) => row.workflow_step === 'ACTIVE'), true);

  const replay = await recoveredRuntime.service.createTable(createAst());
  t.equal(replay.jobId, completed.jobId);
  t.equal(
    [...gateway.rows.values()].filter((row) => row.operation_id).length,
    operations.length,
    'terminal replay creates no duplicate child operation or replica identity',
  );
  await recoveredRuntime.coordinator.shutdown();
  await firstRuntime.coordinator.shutdown();
  return {
    fidelity: 'deterministic-directed',
    observable:
      'capacity pending -> owner recreation -> one terminal duplicate-free job',
    jobId: completed.jobId,
    tableId: completed.tableId,
    partitionId: completed.partitionId,
    jobStatus: jobs[0].status,
    schemaJobCount: jobs.length,
    tableCount: tables.length,
    partitionCount: partitions.length,
    activeReplicaCount: activeReplicas.length,
    distinctReplicaNodeCount:
      new Set(activeReplicas.map((row) => row.node_id)).size,
    childOperationCount: operations.length,
    operationIds: expectedOperationIds,
    replicaIds: expectedReplicaIds,
    dispatchCount: capacity.dispatches.length,
  };
}

if (process.env.W9_DIRECTED_REPORT_MODE !== '1') {
  test('directed real-owner chain: capacity pending -> owner recreation -> ' +
    'one terminal job with deterministic duplicate-free replica operations',
  async (t) => {
    const evidence = await runDurableProvisioningDirectedScenario(t);
    t.equal(evidence.fidelity, 'deterministic-directed');
  });
}

export {runDurableProvisioningDirectedScenario};
