import {EventEmitter} from 'node:events';
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
import {SQLParser} from '../../src/query/sql-parser.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schema-shared-constants.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {PgWireProtocolHandler} from
  '../../src/runtime/pgwire-protocol-handler.js';
import {PG_BACKEND_MSG, PG_ERROR_CODE, PG_TRANSACTION_STATE} from
  '../../src/runtime/pgwire-protocol-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {TABLES} from '../../src/constants/index.js';
import {SCHEMA_PROVISIONING_DEFAULT} from
  '../../src/query/schema-provisioning-job-constants.js';

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

function createNotNullDefaultAst() {
  return createAst({
    name: 'source_snapshot_json',
    dataType: {name: 'TEXT'},
    notNull: true,
    defaultValue: {type: 'literal', value: '{}'},
  });
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

// A committed metadata write answers its position (routed writes answer at
// commit); this fixture's projection applies at once unless paused.
function metadataPosition(mutation) {
  return {tableName: mutation.tableName,
    key: mutation.row?.table_id ?? mutation.row?.partition_id,
    originHlc: '1793615397288-1-seam-node'};
}

function createGateway() {
  const rows = new Map();
  const writes = [];
  return {
    rows,
    writes,
    paused: false,
    projectionWaits: [],
    awaitProjectionAt(position, options = {}) {
      if (!this.paused) return Promise.resolve({outcome: 'reached', position});
      return new Promise((resolve, reject) => {
        this.projectionWaits.push({position, options, resolve, reject});
      });
    },
    async submitMutation(mutation) {
      const answer = await this.applyMutation(mutation);
      return mutation.tableName === 'schema_operations' ? answer :
        {...answer, position: metadataPosition(mutation)};
    },
    async applyMutation(mutation) {
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

// Real SQL dispatch, table service, durable schema owner and wire mapping.
// Only durable storage, provisioning availability and timer delivery are seams.
function createSchemaWireClient(t, service, gateway, existingEngine = null) {
  const engine = existingEngine || new SQLQueryEngine({
    systemCache: {find: () => null, getAll: () => []},
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
    migrationAutoWire: false,
  });
  engine.tableCreationService.shutdown();
  engine.tableCreationService = service;
  t.teardown(() => service.shutdown());
  return async () => {
    const socket = new EventEmitter();
    const messages = [];
    socket.write = (message) => messages.push(Buffer.from(message));
    let outcome;
    const handler = new PgWireProtocolHandler({
      adapter: {
        async execute(sessionId, sql, params) {
          outcome = await engine.executeQuery(sql, params, {sessionId});
          return outcome;
        },
      },
      socket,
      logger: {debug() {}, info() {}, warn() {}, error() {}},
    });
    handler._session = {
      sessionId: 'quorum-refusal-client',
      getTransactionState: () => PG_TRANSACTION_STATE.IDLE,
      setTransactionState() {},
    };
    await handler._executeAndSend(
      'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY)', []);
    return {outcome, messages};
  };
}

function createServeRefreshClock() {
  const clock = {now: 1000, timers: []};
  clock.setTimeout = (callback, delayMs) => {
    const timer = {at: clock.now + delayMs, callback,
      cleared: false, unref() {}};
    clock.timers.push(timer);
    return timer;
  };
  clock.clearTimeout = (timer) => {
    timer.cleared = true;
  };
  clock.advance = async (elapsedMs) => {
    clock.now += elapsedMs;
    for (const timer of clock.timers.filter((entry) =>
      !entry.cleared && entry.at <= clock.now)) {
      timer.cleared = true;
      timer.callback();
    }
    await new Promise((resolve) => setImmediate(resolve));
  };
  return clock;
}

function serveRefreshPublication(epoch) {
  const members = JSON.stringify(['serve-a', 'serve-b', 'serve-c']);
  return {publication_id: `cluster_membership-${epoch}`,
    publication_kind: 'cluster_membership', publication_epoch: epoch,
    publisher_node_id: 'serve-a', status: 'PUBLISHED',
    published_active_node_ids: members, required_ack_node_ids: members,
    acknowledged_node_ids: members,
    priority_partition_summary: JSON.stringify({
      satisfied: true, blockedPartitions: []}),
  };
}

function createServeRefreshFixture(t, gateway) {
  const clock = createServeRefreshClock();
  const cache = new SystemTableCache();
  const state = {reads: 0, activeReads: 0, maxActiveReads: 0, hold: null,
    nodes: ['serve-a', 'serve-b', 'serve-c'].map((nodeId) => ({
      node_id: nodeId, status: 'active', boot_incarnation: 1,
      ready_lease_expires_at: 16000,
    })), publications: [serveRefreshPublication(3)], fail: false};
  const view = {
    canRead: () => true,
    async readReadinessOwnerRows(tableName) {
      state.reads += 1;
      state.activeReads += 1;
      state.maxActiveReads = Math.max(state.maxActiveReads, state.activeReads);
      const rows = tableName === TABLES.NODES ? state.nodes : state.publications;
      const answer = {success: !state.fail, rows: structuredClone(rows)};
      try {
        if (state.hold) await state.hold;
        return answer;
      } finally {
        state.activeReads -= 1;
      }
    },
  };
  const readiness = new ControlPlaneReadinessService({
    nodeId: 'serve-a', systemTableCache: cache,
    authoritativeControlPlaneView: view,
    now: () => clock.now,
    setTimeoutFn: clock.setTimeout, clearTimeoutFn: clock.clearTimeout,
  });
  const engine = new SQLQueryEngine({
    nodeId: 'serve-a', systemCache: cache,
    controlPlaneReadinessService: readiness,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false, migrationAutoWire: false,
  });
  t.teardown(() => readiness.shutdown());
  return {clock, cache, state, readiness, engine};
}

// Real public SQL -> schema custody -> provisioning cohort -> readiness owner
// -> SystemTableCache source events. Storage and native replica dispatch are
// the explicit seams; no test supplies a serve decision or a retry outcome.
for (const heldReadFails of [false, true]) {
  test('CREATE retains one job across regressed serve reads and an in-flight ' +
    `source wake (held read fails: ${heldReadFails})`, async (t) => {
    const gateway = createGateway();
    const {clock, cache, state, readiness, engine} =
      createServeRefreshFixture(t, gateway);
    const nativeDispatches = [];
    const service = createService(gateway, [], {
      systemCache: cache, now: () => clock.now,
      schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
      schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout,
      async partitionProvisioner(context) {
        const cohort = await engine.waitForProvisionTargetNodeIds({
          ...context, requiredReplicaCount: context.replicaCount,
          maxWaitMs: SCHEMA_PROVISIONING_DEFAULT.RETRY_AFTER_MS});
        nativeDispatches.push({partitionId: context.partitionId,
          nodeIds: cohort.nodeIds, epoch: cohort.epoch});
        return {resolvedReplicaCount: cohort.nodeIds.length,
          routableReplicaCount: cohort.nodeIds.length,
          fullReplicaCountConverged: true,
          contractState: OWNER_CONTRACT_STATE.READY,
          nextAction: 'proceed', epoch: cohort.epoch};
      },
    });
    const query = createSchemaWireClient(t, service, gateway, engine);
    await readiness.readServeEligibility();
    t.equal(readiness.answerServeCohort().epoch.publicationEpoch, 3);
    state.publications = [serveRefreshPublication(4)];
    cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
      'INSERT', serveRefreshPublication(5));
    await new Promise((resolve) => setImmediate(resolve));
    const first = await query();
    assertQuorumRefusal(t, first, first.outcome.detail);
    const jobKey = `schema_operations:${first.outcome.jobId}`;
    t.equal(gateway.rows.get(jobKey)?.status, 'PENDING');
    t.equal(nativeDispatches.length, 0, 'regressed committed epoch cannot dispatch');
    t.equal(readiness.answerServeCohort().reason, 'unavailable_stale');

    const beforeIdle = state.reads;
    await clock.advance(100);
    t.equal(state.reads, beforeIdle,
      'a regressed read creates no 100ms polling obligation');
    t.equal(nativeDispatches.length, 0);
    t.equal(gateway.rows.get(jobKey)?.attempt_count, 1,
      'the existing schema retry has not elapsed');

    let release;
    state.hold = new Promise((resolve) => {
      release = resolve;
    });
    state.fail = heldReadFails;
    const heldRead = readiness.readServeEligibility();
    const beforeWake = state.reads;
    state.nodes = state.nodes.map((row) => ({...row,
      ready_lease_expires_at: 21000}));
    state.publications = [serveRefreshPublication(5)];
    state.fail = false;
    // A real accepted cache apply arrives while the prior committed read is
    // held. Lease extension does not revoke, but must retain its wake.
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', state.nodes[0]);
    await new Promise((resolve) => setImmediate(resolve));
    state.hold = null;
    release();
    await heldRead;
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(state.reads, beforeWake + 2,
      'exactly one successor read consumes the source event before any timer');
    t.equal(state.maxActiveReads, 2,
      'only the two tables of one committed refresh overlap');
    t.equal(readiness.answerServeCohort().state, 'ready');
    t.equal(readiness.answerServeCohort().epoch?.publicationEpoch, 5);
    t.equal(nativeDispatches.length, 0, 'refresh cannot act as a schema worker');

    await clock.advance(SCHEMA_PROVISIONING_DEFAULT.RETRY_AFTER_MS - 100);
    for (let turn = 0; turn < 100; turn += 1) {
      if (gateway.rows.get(jobKey)?.status === 'SUCCEEDED') break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    t.equal(gateway.rows.get(jobKey)?.status, 'SUCCEEDED',
      'the existing schema retry completes the retained intent');
    t.equal(nativeDispatches.length, 1);
    t.same(nativeDispatches[0]?.nodeIds, ['serve-a', 'serve-b', 'serve-c']);
    t.equal(nativeDispatches[0]?.epoch?.publicationEpoch, 5);
    t.equal(service.schemaProvisioningJobOwner.retryTimersByWorkflowId.size, 0);
    t.equal(gateway.writes.filter((write) => write.tableName === 'tables' &&
      String(write.operation).toUpperCase() === 'INSERT').length, 1);
    const replay = await query();
    t.equal(replay.outcome.jobId, first.outcome.jobId);
    t.equal(replay.outcome.contractState, OWNER_CONTRACT_STATE.READY);
    t.ok(replay.messages.some((message) =>
      message[0] === PG_BACKEND_MSG.COMMAND_COMPLETE));
    t.equal(nativeDispatches.length, 1, 'terminal replay does not dispatch again');
  });
}

function assertQuorumRefusal(t, answer, refusal) {
  const {outcome, messages} = answer;
  t.equal(outcome.success, false, 'below quorum cannot complete CREATE');
  t.equal(outcome.contractState, OWNER_CONTRACT_STATE.DEFERRED);
  t.equal(outcome.nextAction, 'retry');
  t.equal(outcome.errorCode, QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE);
  t.same(outcome.epoch, refusal.epoch, 'current observation epoch survives');
  t.same(outcome.reasons, refusal.reasons, 'current refusal reasons survive');
  t.equal(outcome.retryAfterMs, refusal.retryAfterMs);
  t.same(outcome.detail, refusal, 'structured detail matches the observation');
  t.equal(messages.length, 1);
  t.equal(messages[0]?.[0], PG_BACKEND_MSG.ERROR_RESPONSE);
  t.ok(messages[0]?.includes(Buffer.from(PG_ERROR_CODE.CANNOT_CONNECT_NOW)),
    'public SQL maps the typed refusal to 57P03');
  t.ok(messages[0]?.includes(Buffer.from(JSON.stringify(refusal))),
    'the wire carries the current epoch, reasons and retry delay');
  t.notOk(messages.some((message) =>
    message[0] === PG_BACKEND_MSG.COMMAND_COMPLETE));
}

for (const recreateOwner of [false, true]) {
  test('below-quorum schema work retains retry custody and wire refusal ' +
    `through recovery (recreate owner: ${recreateOwner})`, async (t) => {
    const gateway = createGateway();
    const timers = [];
    const provisionCalls = [];
    const now = {value: 100};
    let quorumAvailable = false;
    let refusal = {epoch: {publicationEpoch: 7},
      reasons: ['serve_cohort_below_quorum'], retryAfterMs: 125};
    const overrides = {
      now: () => now.value,
      schemaProvisioningLeaseMs: 1000,
      schemaProvisioningRetrySetTimeoutFn(callback, delayMs) {
        const timer = {callback, delayMs, cleared: false, unref() {}};
        timers.push(timer);
        return timer;
      },
      schemaProvisioningRetryClearTimeoutFn(timer) {
        timer.cleared = true;
      },
      async partitionProvisioner(context) {
        provisionCalls.push(context);
        if (!quorumAvailable) {
          throw Object.assign(new Error('Provisioning unavailable: no quorum'), {
            code: QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE,
            ...refusal,
            detail: {...refusal},
          });
        }
        return {
          resolvedReplicaCount: recreateOwner ? 2 : 3,
          routableReplicaCount: recreateOwner ? 2 : 3,
          fullReplicaCountConverged: !recreateOwner,
          contractState: recreateOwner ? OWNER_CONTRACT_STATE.UNDER_REPLICATED :
            OWNER_CONTRACT_STATE.READY,
          nextAction: 'proceed',
          epoch: {publicationEpoch: 9},
          missingReplicaCount: recreateOwner ? 1 : 0,
        };
      },
    };
    let service = createService(gateway, provisionCalls, overrides);
    let query = createSchemaWireClient(t, service, gateway);
    const first = await query();
    assertQuorumRefusal(t, first, refusal);
    const jobId = first.outcome.jobId;
    const jobKey = `schema_operations:${jobId}`;
    t.equal(gateway.rows.get(jobKey)?.status, 'PENDING',
      'temporary quorum loss must not poison the durable intent as FAILED');
    t.equal(timers.length, 1, 'one canonical retry is retained');
    if (gateway.rows.get(jobKey)?.status !== 'PENDING') return;

    if (recreateOwner) {
      service.shutdown();
      t.ok(timers[0].cleared, 'old owner disarms its retry');
      service = createService(gateway, provisionCalls, {...overrides,
        schemaProvisioningOwnerId: 'schema-worker-b'});
      query = createSchemaWireClient(t, service, gateway);
      const [retained] = await service.resumeDurableProvisioningJobs();
      t.equal(retained.contractState, OWNER_CONTRACT_STATE.PENDING);
      t.equal(provisionCalls.length, 1,
        'new owner cannot provision under the previous live lease');
      now.value = gateway.rows.get(jobKey).workflow_lease_expires_at + 1;
    }
    refusal = {epoch: {publicationEpoch: 8},
      reasons: ['committed_lease_unavailable'], retryAfterMs: 275};
    const second = await query();
    assertQuorumRefusal(t, second, refusal);
    t.equal(second.outcome.jobId, jobId, 'repeated CREATE attaches to one job');
    t.equal(gateway.rows.get(jobKey).status, 'PENDING');
    t.equal(gateway.rows.get(jobKey).workflow_owner_id,
      recreateOwner ? 'schema-worker-b' : 'schema-worker-a');
    t.equal(service.schemaProvisioningJobOwner.retryTimersByWorkflowId.size, 1);
    t.equal(provisionCalls.length, 2, 'latest refusal comes from a new attempt');

    quorumAvailable = true;
    timers.at(-1).callback();
    for (let turn = 0; turn < 100; turn += 1) {
      if (gateway.rows.get(jobKey).status === 'SUCCEEDED') break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    t.equal(gateway.rows.get(jobKey).status, 'SUCCEEDED',
      'canonical owner timer completes the intent without another CREATE');
    t.equal(gateway.rows.get(jobKey).attempt_count, 3);
    t.equal(provisionCalls.length, 3);
    t.equal(service.schemaProvisioningJobOwner.retryTimersByWorkflowId.size, 0);
    t.equal(gateway.writes.filter((write) => write.tableName === 'tables' &&
      String(write.operation).toUpperCase() === 'INSERT').length, 1,
    'metadata is created once');
    const replay = await query();
    t.equal(replay.outcome.jobId, jobId);
    t.equal(replay.outcome.contractState, recreateOwner ?
      OWNER_CONTRACT_STATE.UNDER_REPLICATED : OWNER_CONTRACT_STATE.READY);
    t.ok(replay.messages.some((message) =>
      message[0] === PG_BACKEND_MSG.COMMAND_COMPLETE));
    t.equal(provisionCalls.length, 3, 'terminal success is replayed');
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

test('table creation shutdown cancels durable work and disarms retries',
  async (t) => {
    const gateway = createGateway();
    const retryTimers = [];
    const clearedTimers = [];
    const service = createService(gateway, [], {
      schemaProvisioningRetrySetTimeoutFn(callback, delayMs) {
        const timer = {callback, delayMs, unref() {}};
        retryTimers.push(timer);
        return timer;
      },
      schemaProvisioningRetryClearTimeoutFn(timer) {
        clearedTimers.push(timer);
      },
    });
    let executionOptions = null;
    let provisionCallCount = 0;
    service.executeCreateTableProvisioning = async (_ast, options) => {
      executionOptions = options;
      provisionCallCount += 1;
      return {
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: 'retry',
      };
    };

    const pending = await service.createTable(createAst());
    t.equal(pending.contractState, OWNER_CONTRACT_STATE.PENDING);
    t.equal(provisionCallCount, 1);
    t.equal(retryTimers.length, 1);
    t.equal(
      service.schemaProvisioningJobOwner.retryTimersByWorkflowId.size,
      1,
    );
    t.ok(executionOptions.cancellationToken);
    t.equal(executionOptions.cancellationToken.isCancelled(), false);

    await service.shutdown();

    t.equal(executionOptions.cancellationToken.isCancelled(), true);
    t.equal(service.schemaProvisioningJobOwner.shuttingDown, true);
    t.equal(
      service.schemaProvisioningJobOwner.retryTimersByWorkflowId.size,
      0,
    );
    t.same(clearedTimers, retryTimers);

    retryTimers[0].callback();
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(
      provisionCallCount,
      1,
      'a raced retry callback cannot restart provisioning after shutdown',
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

test('durable schema recovery preserves NOT NULL DEFAULT metadata identity',
  async (t) => {
    const gateway = createGateway();
    const now = {value: 100};
    const firstCalls = [];
    const firstOwner = createService(gateway, firstCalls, {
      now: () => now.value,
      schemaProvisioningOwnerId: 'schema-worker-first',
      schemaProvisioningLeaseMs: 30,
      schemaProvisioningRetrySetTimeoutFn() {
        return {unref() {}};
      },
      schemaProvisioningRetryClearTimeoutFn() {},
      async partitionProvisioner(context) {
        firstCalls.push(context);
        return {
          resolvedReplicaCount: 1,
          routableReplicaCount: 1,
          fullReplicaCountConverged: false,
          contractState: OWNER_CONTRACT_STATE.PENDING,
          nextAction: 'retry',
        };
      },
    });

    const pending = await firstOwner.createTable(createNotNullDefaultAst());
    t.equal(pending.contractState, OWNER_CONTRACT_STATE.PENDING);
    t.equal(firstCalls.length, 1);

    const jobRow = gateway.rows.get(`schema_operations:${pending.jobId}`);
    const tableRow = gateway.rows.get(`tables:${jobRow.table_id}`);
    const projectedSchema = JSON.parse(tableRow.schema_definition);
    t.equal(projectedSchema.columns[1].notNull, true);
    t.equal(projectedSchema.columns[1].defaultValue, '\'{}\'');

    const recordedIntent = JSON.parse(jobRow.normalized_ddl);
    t.equal(recordedIntent.columns[1].nullable, false,
      'canonical intent records parser-AST NOT NULL semantics');

    now.value = 40000;
    const resumedCalls = [];
    const resumedOwner = createService(gateway, resumedCalls, {
      now: () => now.value,
      schemaProvisioningOwnerId: 'schema-worker-restart',
    });
    const [result] = await resumedOwner.resumeDurableProvisioningJobs();

    t.equal(result.contractState, OWNER_CONTRACT_STATE.READY,
      'fresh owner accepts metadata projected from the same durable intent');
    t.equal(result.jobId, pending.jobId);
    t.equal(result.tableId, jobRow.table_id);
    t.equal(resumedCalls.length, 1);
    t.equal(gateway.rows.get(`tables:${jobRow.table_id}`).table_id,
      jobRow.table_id, 'restart preserves the deterministic table identity');
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

// Corrective 2c: client-visible DDL keeps same-node read-your-writes. The
// statement's answer waits at its own metadata positions; its content still
// comes from the commit and provisioning.
test('CREATE TABLE answers only once this node projects its own metadata',
  async (t) => {
    const gateway = createGateway();
    gateway.paused = true;
    const service = createService(gateway, []);
    let answered = false;
    const creating = service.createTable(createAst(), {namespace: 'tenant-a'})
      .then((result) => {
        answered = true;
        return result;
      });
    for (let turn = 0; turn < 50 && gateway.projectionWaits.length < 2;
      turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    t.same(gateway.projectionWaits.map((wait) => wait.position.tableName),
      ['tables', 'partitions'], 'it waits at both metadata positions');
    t.equal(gateway.projectionWaits[0].options.statement, 'CREATE TABLE');
    t.equal(answered, false, 'no answer before the projection holds them');
    for (const wait of gateway.projectionWaits) wait.resolve({});
    const result = await creating;
    t.equal(result.contractState, OWNER_CONTRACT_STATE.READY,
      'the answer is the commit and provisioning answer');
  });

test('a projection wait ended by disconnect answers CREATE TABLE typed ' +
  'unavailable; the metadata stays committed', async (t) => {
  const gateway = createGateway();
  gateway.paused = true;
  const service = createService(gateway, []);
  const controller = new AbortController();
  const creating = service.createTable(createAst(),
    {namespace: 'tenant-a', abortSignal: controller.signal})
    .then(() => null, (error) => error);
  for (let turn = 0; turn < 50 && gateway.projectionWaits.length < 2;
    turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  t.equal(gateway.projectionWaits[0].options.abortSignal, controller.signal,
    'the session signal reaches the wait');
  for (const wait of gateway.projectionWaits) {
    wait.reject(Object.assign(new Error('ended'),
      {code: 'client_disconnected'}));
  }
  const refusal = await creating;
  t.equal(refusal?.code, SCHEMA_PROVISIONING_ERROR_CODE.PROJECTION_UNAVAILABLE);
  t.equal(refusal?.projectionOutcome, 'client_disconnected');
  t.equal([...gateway.rows.keys()].filter((key) =>
    key.startsWith('tables:')).length, 1, 'the metadata stays committed');
});

test('a resumed job has no client and never waits for projection',
  async (t) => {
    const gateway = createGateway();
    gateway.paused = true;
    const service = createService(gateway, []);
    await service.executeDurableSchemaProvisioningJob(createAst(), {
      tableId: 'tbl-resumed', partitionId: 'tbl-resumed-p1',
      jobId: 'schema-job-resumed', ownerFenceToken: 1,
      assertOwnership: async () => {},
    });
    t.equal(gateway.projectionWaits.length, 0);
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

test('every exact reserved name is rejected before durable intent with an empty ' +
  'catalog', async (t) => {
  const gateway = createGateway();
  const calls = [];
  const service = createService(gateway, calls);
  t.teardown(() => service.shutdown());
  for (const tableName of Object.values(SYSTEM_TABLE_NAME)) {
    await t.rejects(service.createTable({...createAst(), tableName}),
      {code: 'SYSTEM_TABLE_NAME_RESERVED'}, tableName);
  }
  t.equal(gateway.writes.length, 0, 'no intent or metadata mutation');
  t.equal(calls.length, 0, 'no physical provisioning');
});

test('reserved pending intent is refused by real durable resume before table ' +
  'metadata or provisioning', async (t) => {
  const gateway = createGateway();
  const service = createService(gateway, []);
  t.teardown(() => service.shutdown());
  await service.schemaProvisioningJobOwner.insertOrAttach(
    canonicalizeSchemaProvisioningIntent({...createAst(), tableName: 'logs'}));
  const calls = [];
  const resumed = createService(gateway, calls);
  t.teardown(() => resumed.shutdown());
  const [result] = await resumed.resumeDurableProvisioningJobs();
  t.equal(result.success, false);
  t.equal(result.errorCode, 'SYSTEM_TABLE_NAME_RESERVED');
  t.equal(calls.length, 0);
  t.ok(gateway.writes.every((mutation) =>
    mutation.tableName === 'schema_operations'),
  'only existing job failure state may be persisted');
});

test('Logs case survives schema job identity, metadata creation and restart',
  async (t) => {
    const gateway = createGateway();
    const first = createService(gateway, []);
    t.teardown(() => first.shutdown());
    const ast = new SQLParser('CREATE TABLE "Logs" (id TEXT PRIMARY KEY)').parse();
    const intent = canonicalizeSchemaProvisioningIntent(ast);
    t.equal(intent.tableIdentityKey, 'global.Logs');
    t.not(intent.jobId, canonicalizeSchemaProvisioningIntent({
      ...ast, tableName: 'logs',
    }).jobId, 'distinct logical names have distinct durable identity');
    await first.schemaProvisioningJobOwner.insertOrAttach(intent);
    const calls = [];
    const resumed = createService(gateway, calls);
    t.teardown(() => resumed.shutdown());
    const [result] = await resumed.resumeDurableProvisioningJobs();
    t.equal(result.success, true);
    t.equal(result.tableName, 'Logs');
    t.equal(calls.length, 1);
    t.equal(calls[0].tableName, 'Logs');
    t.equal(gateway.rows.get(`tables:${intent.tableId}`).table_name, 'Logs');
    t.equal((await resumed.findExistingTableRecord('Logs')).table_id,
      intent.tableId, 'authoritative catalog resolves exact name');
    t.equal(await resumed.findExistingTableRecord('logs'), null,
      'authoritative catalog does not resolve a case alias');
  });
