import {test} from '../../src/test-helpers/tap.js';
import {TableCreationService} from
  '../../src/query/table-creation-service.js';
import {OWNER_CONTRACT_STATE} from
  '../../src/control-plane/owner-contract-outcome.js';
import {SCHEMA_PROVISIONING_ERROR_CODE} from
  '../../src/query/schema-provisioning-job-constants.js';
import {canonicalizeSchemaProvisioningIntent} from
  '../../src/query/schema-provisioning-intent.js';
import {createTimeoutBudget} from
  '../../src/control-plane/timeout-budget.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';

function createAst(extraColumn = null) {
  return {
    tableName: 'users',
    columns: [
      {name: 'id', dataType: {name: 'TEXT'}, primaryKey: true},
      ...(extraColumn ? [extraColumn] : []),
    ],
    primaryKey: ['id'],
    ifNotExists: false,
  };
}

function applyGatewayInsert(rows, mutation) {
  const {row, tableName} = mutation;
  const existing = [...rows.values()].find((candidate) =>
    tableName === 'schema_operations' &&
    candidate.table_identity_key === row.table_identity_key,
  );
  if (existing) return {success: false, affectedRows: 0, error: 'unique'};
  const identity = tableName === 'schema_operations' ? row.job_id :
    tableName === 'partitions' ? row.partition_id : row.table_id;
  rows.set(`${tableName}:${identity}`, {...row});
  return {success: true, affectedRows: 1, visibilityState: 'visible'};
}

function applyGatewayUpdate(rows, mutation) {
  const {tableName, whereClause} = mutation;
  const key = `${tableName}:${whereClause.job_id}`;
  const current = rows.get(key);
  const ownerMatches = whereClause.workflow_owner_id === undefined ||
    current?.workflow_owner_id === whereClause.workflow_owner_id;
  const matches = current && ownerMatches &&
    current.row_version === whereClause.row_version &&
    current.workflow_fence_token === whereClause.workflow_fence_token;
  if (!matches) return {success: true, affectedRows: 0};
  rows.set(key, {...current, ...mutation.data});
  return {success: true, affectedRows: 1, visibilityState: 'visible'};
}

function applyGatewayUpsert(rows, mutation) {
  const {row, tableName} = mutation;
  const identity = tableName === 'partitions' ?
    row.partition_id : row.table_id;
  rows.set(`${tableName}:${identity}`, {...row});
  return {success: true, affectedRows: 1, visibilityState: 'visible'};
}

function createGateway() {
  const rows = new Map();
  const writes = [];
  return {
    rows,
    writes,
    async submitMutation(mutation) {
      writes.push(mutation);
      const {operation, tableName} = mutation;
      const normalizedOperation = String(operation).toUpperCase();
      if (normalizedOperation === 'INSERT') {
        return applyGatewayInsert(rows, mutation);
      }
      if (normalizedOperation === 'UPDATE' && tableName === 'schema_operations') {
        return applyGatewayUpdate(rows, mutation);
      }
      if (normalizedOperation === 'UPSERT') {
        return applyGatewayUpsert(rows, mutation);
      }
      throw new Error(`Unexpected mutation ${operation} ${tableName}`);
    },
    async readRows(tableName, _sql, params) {
      const candidates = [...rows.entries()]
        .filter(([key]) => key.startsWith(`${tableName}:`))
        .map(([, row]) => row);
      if (tableName === 'schema_operations') {
        if (params.length === 0) {
          return {rows: candidates.filter(
            (row) => row.status !== 'SUCCEEDED' && row.status !== 'FAILED',
          )};
        }
        return {rows: candidates.filter(
          (row) => row.table_identity_key === params[0],
        )};
      }
      if (tableName === 'tables') {
        return {rows: candidates.filter((row) => row.table_name === params[0])};
      }
      if (tableName === 'partitions') {
        return {rows: candidates.filter(
          (row) => row.partition_id === params[0],
        )};
      }
      return {rows: []};
    },
  };
}

function createService(gateway, provisionCalls, overrides = {}) {
  const cdcIntegrationService = {
    insertSystemTableRow() {},
    updateSystemTableRow() {},
    upsertSystemTableRow() {},
  };
  return new TableCreationService({
    systemCache: {find: () => null, getAll: () => []},
    cdcIntegrationService,
    controlPlaneSystemTableGateway: gateway,
    schemaProvisioningOwnerId: 'schema-worker-a',
    ...overrides,
    partitionProvisioner: overrides.partitionProvisioner || (async (context) => {
      provisionCalls.push(context);
      return {
        resolvedReplicaCount: 3,
        routableReplicaCount: 3,
        fullReplicaCountConverged: true,
        contractState: 'ready',
        nextAction: 'proceed',
      };
    }),
  });
}

test('durable schema job atomically records intent and replays one terminal ' +
  'result', async (t) => {
  const gateway = createGateway();
  const provisionCalls = [];
  const service = createService(gateway, provisionCalls);

  const first = await service.createTable(createAst(), {namespace: 'tenant-a'});
  t.equal(first.contractState, OWNER_CONTRACT_STATE.READY);
  t.match(first.jobId, /^schema-job-/u);
  t.equal(provisionCalls.length, 1);
  t.equal(provisionCalls[0].schemaJobId, first.jobId);

  const tableRow = gateway.rows.get(`tables:${first.tableId}`);
  const partitionRow = gateway.rows.get(`partitions:${first.partitionId}`);
  const jobRow = gateway.rows.get(`schema_operations:${first.jobId}`);
  t.ok(tableRow, 'worker projects deterministic table metadata');
  t.equal(partitionRow.table_id, first.tableId);
  t.same(Object.keys(JSON.parse(jobRow.workflow_record)).sort(), [
    'enlistedParticipantCount',
    'participants',
    'transitionHistory',
  ], 'workflow_record contains only non-scalar participant/history state');

  const replay = await service.createTable(createAst(), {namespace: 'tenant-b'});
  t.equal(replay.jobId, first.jobId);
  t.equal(replay.tableId, first.tableId);
  t.equal(provisionCalls.length, 1,
    'cluster-global terminal replay does not provision twice');

  await t.rejects(
    service.createTable(createAst({
      name: 'email',
      dataType: {name: 'TEXT'},
    }), {namespace: 'tenant-a'}),
    {code: SCHEMA_PROVISIONING_ERROR_CODE.INTENT_CONFLICT},
    'same table identity with different semantic intent is a stable conflict',
  );
});

test('durable schema job resumes after crash immediately after intent insert',
  async (t) => {
    const gateway = createGateway();
    const firstCalls = [];
    const firstOwner = createService(gateway, firstCalls);
    const intent = await firstOwner.schemaProvisioningJobOwner.insertOrAttach(
      canonicalizeSchemaProvisioningIntent(
        createAst(),
        {namespace: 'tenant-b'},
      ),
    );
    t.equal(intent.created, true);
    t.equal(firstCalls.length, 0, 'crash point precedes all side effects');

    const resumedCalls = [];
    const resumedOwner = createService(gateway, resumedCalls);
    const [result] = await resumedOwner.resumeDurableProvisioningJobs();
    t.equal(result.contractState, OWNER_CONTRACT_STATE.READY,
      'READY activation resumes the authoritative nonterminal job');
    t.equal(resumedCalls.length, 1);
    t.equal(
      [...gateway.rows.values()].filter(
        (row) => row.table_identity_key === 'global.users',
      ).length,
      1,
      'restart attaches to the one atomic intent row',
    );
  });

test('client deadline returns a stable job and retry survives stale worker ' +
  'completion', async (t) => {
  const gateway = createGateway();
  const now = {value: 100};
  let releaseStaleWorker;
  let markStaleWorkerStarted;
  const staleWorkerResult = new Promise((resolve) => {
    releaseStaleWorker = resolve;
  });
  const staleWorkerStarted = new Promise((resolve) => {
    markStaleWorkerStarted = resolve;
  });
  const first = createService(gateway, [], {
    now: () => now.value,
    setTimeoutFn: (callback) => {
      callback();
      return 1;
    },
    clearTimeoutFn() {},
    schemaProvisioningOwnerId: 'schema-worker-stale',
    partitionProvisioner: () => {
      markStaleWorkerStarted();
      return staleWorkerResult;
    },
  });
  const pending = await first.createTable(createAst(), {
    namespace: 'tenant-c',
    timeoutBudget: createTimeoutBudget({
      configuredBudgetMs: 10,
      now: () => now.value,
    }),
  });
  t.equal(pending.contractState, OWNER_CONTRACT_STATE.PENDING);
  t.equal(pending.provisioningDeadlineExpired, true);
  t.match(pending.jobId, /^schema-job-/u);
  await staleWorkerStarted;

  const activeContender = createService(gateway, [], {
    now: () => now.value,
    schemaProvisioningOwnerId: 'schema-worker-contender',
  });
  const activeOutcome = await activeContender.createTable(createAst(), {
    namespace: 'tenant-c',
  });
  t.equal(activeOutcome.contractState, OWNER_CONTRACT_STATE.PENDING);
  t.same(activeOutcome.reasonCodes, ['schema_provisioning_active_owner']);
  t.same(
    activeContender.schemaProvisioningJobOwner.workflowCoordinator
      .requireWorkflow(pending.jobId).reasonCodes,
    ['schema_metadata_projecting'],
    'claim rejection projects a reason without mutating recovered state',
  );

  now.value = 40000;
  const retryCalls = [];
  const retry = createService(gateway, retryCalls, {
    now: () => now.value,
    schemaProvisioningOwnerId: 'schema-worker-retry',
  });
  const completed = await retry.createTable(createAst(), {
    namespace: 'tenant-c',
  });
  t.equal(completed.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(completed.jobId, pending.jobId);
  t.equal(retryCalls.length, 1);

  releaseStaleWorker({
    resolvedReplicaCount: 3,
    routableReplicaCount: 3,
    fullReplicaCountConverged: true,
    contractState: 'ready',
    nextAction: 'proceed',
  });
  await new Promise((resolve) => setImmediate(resolve));
  const terminalReplay = await retry.createTable(createAst(), {
    namespace: 'tenant-c',
  });
  t.equal(terminalReplay.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(terminalReplay.jobId, pending.jobId,
    'stale completion cannot replace the higher-epoch terminal result');

  const staleProcessReplay = await first.createTable(createAst(), {
    namespace: 'tenant-c',
  });
  t.equal(staleProcessReplay.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(staleProcessReplay.jobId, pending.jobId,
    'the stale process refreshes the authoritative terminal row');
});

test('pending durable schema work renews its lease and self-retries until ' +
  'replicas converge', async (t) => {
  const gateway = createGateway();
  const now = {value: 100};
  const retryTimers = [];
  const provisionCalls = [];
  const service = createService(gateway, provisionCalls, {
    now: () => now.value,
    schemaProvisioningLeaseMs: 30,
    schemaProvisioningRetrySetTimeoutFn(callback, delayMs) {
      const timer = {
        callback,
        cleared: false,
        delayMs,
        unref() {},
      };
      retryTimers.push(timer);
      return timer;
    },
    schemaProvisioningRetryClearTimeoutFn(timer) {
      timer.cleared = true;
    },
    async partitionProvisioner(context) {
      provisionCalls.push(context);
      now.value += 100;
      if (provisionCalls.length === 1) {
        return {
          resolvedReplicaCount: 1,
          routableReplicaCount: 1,
          fullReplicaCountConverged: false,
          contractState: OWNER_CONTRACT_STATE.PENDING,
          nextAction: 'retry',
        };
      }
      if (provisionCalls.length === 2) {
        throw new Error(
          'Timed out waiting for partition leader service for partition p1',
        );
      }
      return {
        resolvedReplicaCount: 3,
        routableReplicaCount: 3,
        fullReplicaCountConverged: true,
        contractState: OWNER_CONTRACT_STATE.READY,
        nextAction: 'proceed',
      };
    },
  });

  const pending = await service.createTable(createAst());
  t.equal(pending.contractState, OWNER_CONTRACT_STATE.PENDING);
  t.equal(provisionCalls.length, 1);
  t.equal(retryTimers.length, 1);
  t.equal(retryTimers[0].delayMs, 1000);

  let jobRow = gateway.rows.get(`schema_operations:${pending.jobId}`);
  t.equal(jobRow.status, 'PENDING');
  t.equal(jobRow.current_step, 'RECONCILING_REPLICAS');
  t.ok(jobRow.workflow_lease_expires_at > now.value,
    'the owner renews a lease that expired inside provisioning before ' +
    'persisting PENDING');

  retryTimers[0].callback();
  for (let turn = 0;
    turn < 100 && retryTimers.length < 2;
    turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  t.equal(provisionCalls.length, 2);
  t.equal(retryTimers.length, 2,
    'emitted timed-out leader wait schedules another durable attempt');

  retryTimers[1].callback();
  for (let turn = 0; turn < 100; turn += 1) {
    jobRow = gateway.rows.get(`schema_operations:${pending.jobId}`);
    if (jobRow?.status === 'SUCCEEDED') break;
    await new Promise((resolve) => setImmediate(resolve));
  }

  t.equal(provisionCalls.length, 3);
  t.equal(jobRow.status, 'SUCCEEDED');
  t.equal(jobRow.attempt_count, 3);
  t.ok(jobRow.workflow_lease_expires_at > now.value,
    'terminal transition also renews ownership after a long executor pass');

  const replay = await service.createTable(createAst());
  t.equal(replay.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(replay.jobId, pending.jobId);
  t.equal(provisionCalls.length, 3,
    'terminal replay does not schedule a fourth attempt');
});

test('terminal provisioning failure is durable and replayed without new work',
  async (t) => {
    const gateway = createGateway();
    let attempts = 0;
    const service = createService(gateway, [], {
      partitionProvisioner: async () => {
        attempts += 1;
        const error = new Error('placement policy rejected schema');
        error.code = 'PLACEMENT_POLICY_REJECTED';
        throw error;
      },
    });
    const failed = await service.createTable(createAst());
    t.equal(failed.contractState, OWNER_CONTRACT_STATE.FAILED);
    t.equal(failed.errorCode, 'PLACEMENT_POLICY_REJECTED');
    t.equal(attempts, 1);

    const replay = await service.createTable(createAst());
    t.equal(replay.contractState, OWNER_CONTRACT_STATE.FAILED);
    t.equal(replay.jobId, failed.jobId);
    t.equal(attempts, 1, 'terminal failure replay does not execute again');
  });

test('pre-cutover table metadata conflicts instead of being overwritten',
  async (t) => {
    const gateway = createGateway();
    gateway.rows.set('tables:tbl-legacy-users', {
      table_id: 'tbl-legacy-users',
      table_name: 'users',
      schema_definition: JSON.stringify({
        columns: [{name: 'id', type: 'INTEGER', primaryKey: true}],
      }),
    });
    const service = createService(gateway, []);
    const failed = await service.createTable(createAst());
    t.equal(failed.contractState, OWNER_CONTRACT_STATE.FAILED);
    t.equal(
      failed.errorCode,
      SCHEMA_PROVISIONING_ERROR_CODE.INTENT_CONFLICT,
    );
    t.equal(gateway.rows.get('tables:tbl-legacy-users').table_id,
      'tbl-legacy-users');
    t.equal(
      gateway.writes.some((mutation) =>
        mutation.tableName === 'tables' &&
        String(mutation.operation).toUpperCase() === 'UPSERT'),
      false,
      'durable replay never replaces existing metadata',
    );
  });

test('CREATE fails closed when durable intent persistence is unavailable',
  async (t) => {
    const service = new TableCreationService({
      systemCache: {find: () => null, getAll: () => []},
      controlPlaneSystemTableGateway: {},
    });
    await t.rejects(
      service.createTable(createAst()),
      {code: SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE},
    );
  });

test('durable job cannot succeed through detached metadata wiring',
  async (t) => {
    const gateway = createGateway();
    const submitMutation = gateway.submitMutation.bind(gateway);
    gateway.submitMutation = async (mutation) => {
      if (mutation.tableName !== 'schema_operations') {
        const error = new Error('metadata gateway detached');
        error.code = SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE;
        throw error;
      }
      return submitMutation(mutation);
    };
    const service = createService(gateway, [], {
      cdcIntegrationService: null,
    });
    const failed = await service.createTable(createAst());
    t.equal(failed.contractState, OWNER_CONTRACT_STATE.FAILED);
    t.equal(
      failed.errorCode,
      SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE,
    );
    t.equal(
      [...gateway.rows.keys()].some((key) => key.startsWith('tables:')),
      false,
    );
    t.equal(
      [...gateway.rows.keys()].some((key) => key.startsWith('partitions:')),
      false,
    );
  });

test('runtime recovery activation resumes durable schema jobs', async (t) => {
  let schemaResumes = 0;
  const engine = Object.create(SQLQueryEngine.prototype);
  engine.tableCreationService = {
    async resumeDurableProvisioningJobs() {
      schemaResumes += 1;
      return [];
    },
  };
  engine.logger = {warn() {}};
  engine.transactionCoordinator = {startRecoverySweep() {}};
  engine.recoverDistributedTransactionStateFromCache = () => {};
  engine.resumeRecoveredDistributedTransactions = async () => ({resumed: 0});

  await engine.activateDistributedTransactionRecovery();
  await new Promise((resolve) => setImmediate(resolve));
  t.equal(schemaResumes, 1,
    'actual READY recovery activation invokes schema replay');
});
