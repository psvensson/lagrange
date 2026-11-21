import {EventEmitter} from 'node:events';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {TableCreationService} from '../../src/query/table-creation-service.js';
import {PgWireProtocolHandler} from '../../src/runtime/pgwire-protocol-handler.js';
import {PG_TRANSACTION_STATE} from '../../src/runtime/pgwire-protocol-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
import {createReadinessServiceForTest} from '../helpers/readiness-service-fixture.js';

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

function serveRefreshPublication(epoch, nodeIds = ['serve-a', 'serve-b', 'serve-c']) {
  const members = JSON.stringify(nodeIds);
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
  const readiness = createReadinessServiceForTest({
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

export {
  createGateway, createService, createSchemaWireClient, createServeRefreshFixture,
  serveRefreshPublication,
};
