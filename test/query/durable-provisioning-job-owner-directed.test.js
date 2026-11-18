import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {TABLES} from '../../src/constants/index.js';
import {getSystemCachePrimaryKeyField} from
  '../../src/cache/system-cache-key-descriptor.js';
import {STORAGE_RESERVATIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
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
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from '../../src/raft/raft-committed-membership-constants.js';
import {
  isBootstrapTopologyDispatchDeferred,
} from '../../src/rebalancer/replica-status.js';
import {
  isCoordinatorOwnedOperationType,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  DISPATCH_PENDING_WORKFLOW_STEPS,
} from '../../src/rebalancer/replica-operation-step-policy.js';
import {
  createMockMessageRouter,
  createProvisioningReadyService,
} from './sql-query-engine-test-support.js';

const TABLE_NAME = 'w9_directed_provisioning_probe';
// ReplicaDispatchService's dispatch cause (REPLICA_DISPATCH_SERVICE_LITERAL).
const REPLICA_OPERATION_DISPATCH_CAUSE = 'replica_operation_dispatch';
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

// SQL UPDATE ... WHERE semantics for a replica_operations row: every stated
// predicate column must equal the durable value (a null predicate is IS NULL).
function replicaOperationWhereMatches(current, whereClause) {
  return Object.entries(whereClause).every(([column, expected]) =>
    expected === undefined ||
      (expected === null ?
        current[column] === null || current[column] === undefined :
        current[column] === expected));
}

function applyDirectedUpdate(rows, mutation, replicaOperationWrites) {
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
  if (tableName === TABLES.REPLICA_OPERATIONS) {
    const applied = replicaOperationWhereMatches(current, mutation.whereClause);
    replicaOperationWrites.push({
      operationId: identity,
      applied,
      fromStep: current.workflow_step,
      toStep: mutation.data?.workflow_step ?? current.workflow_step,
    });
    if (!applied) return {success: true, affectedRows: 0};
  }
  rows.set(key, {...current, ...mutation.data});
  return {success: true, affectedRows: 1, visibilityState: 'visible'};
}

function createDurableGateway(t, serviceRows) {
  const rows = new Map();
  const writes = [];
  const replicaOperationWrites = [];
  const reservationReadRows = [];
  const reservationDatabase = new Database(':memory:');
  reservationDatabase.exec(generateCreateTableSQL(STORAGE_RESERVATIONS_SCHEMA));
  for (const indexSql of generateCreateIndexSQL(STORAGE_RESERVATIONS_SCHEMA)) {
    reservationDatabase.exec(indexSql);
  }
  t.teardown(() => reservationDatabase.close());

  function executeReservationSql(sql, params) {
    try {
      const statement = reservationDatabase.prepare(sql);
      if (statement.reader) {
        const resultRows = statement.all(...params);
        reservationReadRows.push(...resultRows.map((row) => ({...row})));
        return {
          success: true,
          rows: resultRows,
          affectedRows: resultRows.length,
        };
      }
      const result = statement.run(...params);
      return {
        success: true,
        rows: [],
        changes: result.changes,
        affectedRows: result.changes,
      };
    } catch (error) {
      return {success: false, error: error.message, errorCode: error.code};
    }
  }

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
    if (tableName === TABLES.STORAGE_RESERVATIONS) {
      return executeReservationSql(sql, params);
    }
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

  const gateway = {
    rows,
    writes,
    replicaOperationWrites,
    reservationReadRows,
    // The applied replica_operations change feed (the CDC fan-out a node's
    // replica dispatch service replays). A runtime that models that lane
    // subscribes here; null means no live dispatch lane.
    onReplicaOperationApplied: null,
    readStoredReservation(reservationId) {
      return reservationDatabase.prepare(
        'SELECT * FROM storage_reservations WHERE reservation_id = ?',
      ).get(reservationId) || null;
    },
    cdcIntegrationService: {
      insertSystemTableRow() {},
      updateSystemTableRow() {},
    },
    async submitMutation(mutation) {
      writes.push(mutation);
      const operation = String(mutation.operation).toUpperCase();
      const tableName = mutation.tableName;
      let result = null;
      if (operation === 'INSERT') {
        result = applyDirectedInsert(rows, tableRows, mutation);
      } else if (operation === 'UPDATE') {
        result = applyDirectedUpdate(rows, mutation, replicaOperationWrites);
      } else {
        throw new Error(
          `Unexpected durable mutation ${operation} ${tableName}`);
      }
      const identity = mutation.whereClause?.operation_id ||
        mutation.row?.operation_id;
      if (
        tableName === TABLES.REPLICA_OPERATIONS &&
        result.affectedRows > 0 &&
        gateway.onReplicaOperationApplied
      ) {
        gateway.onReplicaOperationApplied(
          {...rows.get(`${TABLES.REPLICA_OPERATIONS}:${identity}`)});
      }
      return result;
    },
    readRows,
    readAuthoritativeRows: readRows,
    // A committed CREATE TABLE is projected on this node at once: the
    // directed world has one durable store and no apply lag.
    async awaitProjectionAt() {},
    async executeQuery(sql, params = []) {
      if (sql.includes('storage_reservations')) {
        return executeReservationSql(sql, params);
      }
      if (sql.includes('replica_operations')) {
        return readRows(TABLES.REPLICA_OPERATIONS, sql, params);
      }
      if (sql.includes('services')) return readRows(TABLES.SERVICES, sql, params);
      return {success: true, rows: []};
    },
  };
  return gateway;
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
    // The SystemTableCache keyed read, by each table's canonical key field.
    get: (tableName, key) => records(tableName).find((row) =>
      row[getSystemCachePrimaryKeyField(tableName)] === key),
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
    dispatchLane = false,
  } = options;
  const cache = createCache(serviceRows);
  const messageRouter = createMockMessageRouter();
  messageRouter.deliver = async (_target, request, deliveryOptions = {}) => {
    const targetNodeId = deliveryOptions.targetNodeId;
    capacity.dispatches.push({
      operationId: request.operationId,
      replicaId: request.replicaId,
      targetNodeId,
      // The durable step at the physical CREATE: a dispatch is claimed only
      // when its owner's PENDING -> SENDING write is durable.
      durableWorkflowStep: gateway.rows.get(
        `${TABLES.REPLICA_OPERATIONS}:${request.operationId}`,
      )?.workflow_step ?? null,
      // The founding cohort the CREATE carries (the released stamp).
      cohortReplicaIds: request.replicaIds ?? null,
      bootstrapMembershipKind: request.bootstrapMembership?.kind ?? null,
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
    return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
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
      // Terminal ACTIVE completion requires the authoritative cache-row
      // refresh to succeed (b52aa01d) before the operation may finish.
      async refreshAuthoritativeCacheRow() {
        return true;
      },
    },
    messageRouter,
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: NODE_IDS.length, minReplicaCount: 2};
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
    controlPlaneReadinessService:
      createProvisioningReadyService(cache, () => clock.value),
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
  // The in-memory durable gateway is the only mutation route in this
  // directed world; the coordinator's route observation sees it as live.
  coordinator.observeReplicaOperationMutationRoute = () =>
    ({allowed: true, retryAfterMs: 0});
  coordinator.initialize();
  const laneDispatches = new Set();
  if (dispatchLane) {
    // This node's replica dispatch lane: the CDC replay of an applied
    // replica_operations change hands every unheld, claimable row to the
    // coordinator's dispatch owner (replica-dispatch-replay-health-
    // readiness.js -> ReplicaDispatchService.dispatchOperationRow), one
    // event-loop turn after the write, as a CDC delivery arrives.
    gateway.onReplicaOperationApplied = (row) => {
      if (
        !isCoordinatorOwnedOperationType(row.type) ||
        isBootstrapTopologyDispatchDeferred(row) ||
        !DISPATCH_PENDING_WORKFLOW_STEPS.has(row.workflow_step)
      ) {
        return;
      }
      laneDispatches.add(new Promise(setImmediate).then(() =>
        coordinator.dispatchOperation(
          coordinator.repository.rowToOperation(row),
          {cause: REPLICA_OPERATION_DISPATCH_CAUSE},
        )));
    };
  }

  const engine = new SQLQueryEngine({
    nodeId: NODE_IDS[0],
    systemCache: cache,
    messageRouter,
    rebalanceCoordinator: coordinator,
    controlPlaneReadinessService:
      createProvisioningReadyService(cache, () => clock.value),
    tablePartitionProvisioningTimeoutMs: 50,
    tablePartitionProvisioningPollIntervalMs: 1,
    tablePartitionTargetNodeConvergenceTimeoutMs: 5,
    nowFn: () => clock.value,
  });
  const suspendedSleep = new Promise(() => {});
  engine.sleep = async (durationMs) => {
    if (suspendWhenConstrained && !capacity.available) return suspendedSleep;
    clock.value += durationMs;
    // A wait that a live dispatch lane must answer yields one event-loop
    // turn, as a real timer does, so the lane's dispatch interleaves.
    if (dispatchLane) await new Promise(setImmediate);
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
  return {coordinator, engine, service, laneDispatches};
}

async function runDurableProvisioningDirectedScenario(t) {
  const clock = {value: 100};
  const capacity = {
    available: false,
    deniedNodeIds: new Set(),
    dispatches: [],
  };
  const serviceRows = [];
  const gateway = createDurableGateway(t, serviceRows);
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
  for (const operation of operations) {
    const reservation = gateway.readStoredReservation(
      `res-${operation.operation_id}`,
    );
    t.ok(reservation,
      'strict reservation birth persists in the canonical SQLite table');
    t.equal(reservation.operation_id, operation.operation_id);
    t.ok(gateway.reservationReadRows.some((row) =>
      row.operation_id === operation.operation_id && row.status === 'active',
    ), 'dispatch adopted an authoritative ACTIVE reservation row');
    t.equal(reservation.status, 'released',
      'legitimate terminal provisioning releases the adopted reservation');
  }

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

// Where a first provisioning attempt dies, named by the coordinator call that
// fails: before the cohort's dispatch hold is released (every row still
// held), or after the release and before any inline execution (every row
// released, unclaimed and undispatched).
const FIRST_ATTEMPT_INTERRUPT = Object.freeze({
  NONE: null,
  BEFORE_HOLD_RELEASE: 'releaseBootstrapTopologyDispatchHold',
  AFTER_HOLD_RELEASE: 'executeOperation',
});

function readWorkflowSteps(row) {
  return JSON.parse(row.steps_history).map((entry) => entry.step);
}

function readPartitionOperationRows(gateway) {
  return [...gateway.rows.values()].filter((row) => row.operation_id);
}

async function runInterruptedFirstAttempt(t, world, interruptAt) {
  const {capacity, clock, gateway, serviceRows} = world;
  const firstRuntime = createRuntime({
    capacity,
    clock,
    gateway,
    ownerId: 'schema-owner-interrupted',
    serviceRows,
  });
  firstRuntime.coordinator[interruptAt] = async () => {
    throw new Error(
      'Authoritative replica operation not confirmed: attempt interrupted');
  };
  const interrupted = await firstRuntime.service.createTable(createAst(), {
    timeoutBudget: createTimeoutBudget({
      configuredBudgetMs: 10,
      now: () => clock.value,
    }),
  });
  for (let turn = 0; turn < 50; turn += 1) await new Promise(setImmediate);
  t.equal(interrupted.contractState, OWNER_CONTRACT_STATE.PENDING,
    'the interrupted attempt leaves the durable job pending');
  const rows = readPartitionOperationRows(gateway);
  t.equal(rows.length, NODE_IDS.length);
  t.ok(rows.every((row) => row.workflow_step === 'PENDING'),
    'every child row is left PENDING');
  t.ok(rows.every((row) => isBootstrapTopologyDispatchDeferred(row) ===
    (interruptAt === FIRST_ATTEMPT_INTERRUPT.BEFORE_HOLD_RELEASE)),
  'the child rows are held exactly when the attempt died before release');
  t.equal(capacity.dispatches.length, 0,
    'the interrupted attempt dispatched nothing');
  return {firstRuntime, interrupted};
}

// One provisioning job whose retry (or first run) executes on a node with a
// live replica dispatch lane: the coordinator's own lanes and the
// provisioner's inline execution compete for every child row, and the
// durable rows must show exactly one claimed dispatch each.
async function runDispatchLaneProvisioningScenario(t, interruptAt) {
  const world = {
    clock: {value: 100},
    capacity: {available: true, deniedNodeIds: new Set(), dispatches: []},
    serviceRows: [],
  };
  world.gateway = createDurableGateway(t, world.serviceRows);
  const {capacity, clock, gateway, serviceRows} = world;
  const first = interruptAt === FIRST_ATTEMPT_INTERRUPT.NONE ?
    null :
    await runInterruptedFirstAttempt(t, world, interruptAt);

  clock.value = 40000;
  const laneRuntime = createRuntime({
    capacity,
    clock,
    gateway,
    ownerId: 'schema-owner-dispatch-lane',
    serviceRows,
    dispatchLane: true,
  });
  const completed = await laneRuntime.service.createTable(createAst());
  await Promise.allSettled([...laneRuntime.laneDispatches]);
  t.equal(completed.contractState, OWNER_CONTRACT_STATE.READY);
  if (first) {
    t.equal(completed.jobId, first.interrupted.jobId,
      'the retry attaches to the durable parent identity');
  }

  const operations = readPartitionOperationRows(gateway);
  t.equal(operations.length, NODE_IDS.length);
  t.ok(operations.every((row) => row.workflow_step === 'ACTIVE'),
    'every child operation completed');
  t.ok(operations.every((row) => !isBootstrapTopologyDispatchDeferred(row)),
    'every child hold was released');
  const dispatchCounts = new Map();
  for (const dispatch of capacity.dispatches) {
    dispatchCounts.set(dispatch.operationId,
      (dispatchCounts.get(dispatch.operationId) || 0) + 1);
  }
  t.same(
    operations.map((row) => dispatchCounts.get(row.operation_id) || 0),
    operations.map(() => 1),
    'each child row is dispatched exactly once across every lane',
  );
  t.same(
    capacity.dispatches.filter((dispatch) =>
      dispatch.durableWorkflowStep === 'PENDING'),
    [],
    'no CREATE is sent for a row whose durable claim is not written',
  );
  const cohort = operations.map((row) => row.replica_id).sort();
  t.same(
    capacity.dispatches.map((dispatch) => ({
      cohort: [...(dispatch.cohortReplicaIds ?? [])].sort(),
      membership: dispatch.bootstrapMembershipKind,
    })),
    capacity.dispatches.map(() => ({
      cohort,
      membership: COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS,
    })),
    'every CREATE carries the complete released cohort stamp: no row is ' +
      'dispatched while its hold is still in place',
  );
  for (const row of operations) {
    const steps = readWorkflowSteps(row);
    t.ok(steps.includes('SENDING'),
      `${row.operation_id} keeps its durable SENDING claim`);
    t.equal(steps.lastIndexOf('PENDING'), 0,
      `${row.operation_id} never returns to PENDING once claimed`);
  }
  t.same(
    gateway.replicaOperationWrites.filter((write) =>
      write.applied && write.fromStep !== 'PENDING' &&
        write.toStep === 'PENDING'),
    [],
    'no writer rewinds a claimed child row to PENDING',
  );
  await laneRuntime.coordinator.shutdown();
  await first?.firstRuntime.coordinator.shutdown();
}

// Two coordinators (two nodes' owners) race to release the same held row:
// both observe it held and PENDING, and the release compare-and-set on the
// observed steps history admits exactly one.
async function runConcurrentHoldReleaseScenario(t) {
  const world = {
    clock: {value: 100},
    capacity: {available: true, deniedNodeIds: new Set(), dispatches: []},
    serviceRows: [],
  };
  world.gateway = createDurableGateway(t, world.serviceRows);
  const {firstRuntime} = await runInterruptedFirstAttempt(t, world,
    FIRST_ATTEMPT_INTERRUPT.BEFORE_HOLD_RELEASE);
  const [heldRow] = readPartitionOperationRows(world.gateway);
  const releasers = ['schema-owner-race-a', 'schema-owner-race-b'].map(
    (ownerId) => createRuntime({...world, ownerId}).coordinator);
  const stamp = Object.freeze({
    replicaIds: [heldRow.replica_id],
    peerAddresses: [`${heldRow.target_node_id}/partition/race`],
  });
  const outcomes = await Promise.all(releasers.map((coordinator) =>
    coordinator.releaseBootstrapTopologyDispatchHold(
      heldRow.operation_id, stamp)));
  t.same(outcomes.map((outcome) => outcome.released).sort(), [false, true],
    'exactly one concurrent releaser wins the held row');
  const refused = outcomes.find((outcome) => !outcome.released);
  t.equal(refused?.operation?.workflowStep, 'PENDING',
    'the refused releaser re-reads the row its rival released');
  t.equal(refused?.operation?.stepsHistory?.length, 1);
  t.notOk(isBootstrapTopologyDispatchDeferred(refused?.operation),
    'the re-read row no longer carries the hold');
  t.same(
    world.gateway.replicaOperationWrites.filter((write) =>
      write.operationId === heldRow.operation_id && write.applied),
    [{
      operationId: heldRow.operation_id,
      applied: true,
      fromStep: 'PENDING',
      toStep: 'PENDING',
    }],
    'one release write applied; the rival compare-and-set changed nothing',
  );
  for (const coordinator of releasers) await coordinator.shutdown();
  await firstRuntime.coordinator.shutdown();
}

if (process.env.W9_DIRECTED_REPORT_MODE !== '1') {
  test('directed real-owner chain: capacity pending -> owner recreation -> ' +
    'one terminal job with deterministic duplicate-free replica operations',
  async (t) => {
    const evidence = await runDurableProvisioningDirectedScenario(t);
    t.equal(evidence.fidelity, 'deterministic-directed');
  });

  test('retry after an attempt died with every child hold released: the ' +
    'reused unheld rows are claimed and dispatched once by the owner lanes, ' +
    'never rewound or re-executed by the retrying provisioner',
  async (t) => {
    await runDispatchLaneProvisioningScenario(t,
      FIRST_ATTEMPT_INTERRUPT.AFTER_HOLD_RELEASE);
  });

  test('retry after an attempt died before releasing the child holds: the ' +
    'retry releases each held row once and every row is dispatched once',
  async (t) => {
    await runDispatchLaneProvisioningScenario(t,
      FIRST_ATTEMPT_INTERRUPT.BEFORE_HOLD_RELEASE);
  });

  test('concurrent hold releases of one held row: exactly one applies',
    async (t) => {
      await runConcurrentHoldReleaseScenario(t);
    });

  test('fresh provisioning beside a live dispatch lane: the durable hold is ' +
    'the one dispatch authority and every row is dispatched once',
  async (t) => {
    await runDispatchLaneProvisioningScenario(t, FIRST_ATTEMPT_INTERRUPT.NONE);
  });
}

export {runDurableProvisioningDirectedScenario};
