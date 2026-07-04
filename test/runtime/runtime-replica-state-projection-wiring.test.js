/**
 * Guard tests for runtime replica state projection
 * (quest: runtime-replica-state-projection).
 *
 * Proves the designed-but-never-wired services-table projection is
 * live through the PRODUCTION composition: the SQL engine wires
 * ServiceRuntimeLifecycle's state projection writer to the
 * control-plane system-table gateway, with create-once-then-update
 * discipline (TEST-0001 / ARCH-0009: the first projection INSERTs the
 * row with identity columns; every later transition UPDATEs the
 * existing row primary-key addressed; never INSERT OR REPLACE), and
 * the NOT NULL node_id resolves to the hosting engine's nodeId when
 * the lifecycle context lacks one.
 */

import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  createRuntimeStartupWiring,
} from '../../src/runtime/runtime-startup-wiring.js';
import {
  SQL_QUERY_LOOP_RUNTIME_REF,
} from '../../src/runtime/sql-query-loop-runtime-module.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
} from '../query/sql-query-engine-test-support.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

const HOST_NODE_ID = 'host-node';
const SVC_ID = 'svc-projection';

function buildHarness() {
  const {serviceRuntimeLifecycle} = createRuntimeStartupWiring();
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [], null),
    messageRouter: createMockMessageRouter(),
    nodeId: HOST_NODE_ID,
    serviceRuntimeLifecycle,
  });
  const writes = [];
  let rowExists = false;
  engine.controlPlaneSystemTableGateway = {
    updateSystemTableRow: async (tableName, whereClause, data) => {
      writes.push({kind: 'update', tableName, whereClause, data});
      return {partitionResult: {affectedRows: rowExists ? 1 : 0}};
    },
    insertSystemTableRow: async (tableName, row) => {
      writes.push({kind: 'insert', tableName, row});
      rowExists = true;
      return {success: true};
    },
    upsertSystemTableRow: async (tableName, row) => {
      writes.push({kind: 'upsert', tableName, row});
      return {success: true};
    },
    deleteSystemTableRow: async (tableName, whereClause) => {
      writes.push({kind: 'delete', tableName, whereClause});
      rowExists = false;
      return {success: true};
    },
  };
  return {engine, lifecycle: serviceRuntimeLifecycle, writes};
}

function loopDefinition() {
  return {
    serviceId: SVC_ID,
    serviceType: 'runtime_service',
    runtime_kind: 'native_js',
    runtime_ref: SQL_QUERY_LOOP_RUNTIME_REF,
    runtime_config: JSON.stringify({
      sql: 'SELECT 1',
      intervalMs: 60000,
    }),
  };
}

test('placed replica lifecycle projects create-once-then-update ' +
  'services rows through the production wiring', async (t) => {
  const {lifecycle, writes} = buildHarness();
  const definition = loopDefinition();

  const prepared = await lifecycle.prepare(definition, {nodeId: HOST_NODE_ID});
  t.equal(prepared.status, 'ready', 'replica prepares through the real path');
  const serviceWrites = () =>
    writes.filter((w) => w.tableName === TABLES.SERVICES);
  t.same(serviceWrites().map((w) => w.kind), ['update', 'insert'],
    'the FIRST projection probes with a primary-key UPDATE and, on ' +
      'miss, INSERTs the row (identity established once)');
  const created = serviceWrites()[1];
  t.equal(created.row.service_id, SVC_ID, 'row keyed by replica service id');
  t.equal(created.row.status, 'created', 'initial status projected');
  t.equal(created.row.node_id, HOST_NODE_ID,
    'NOT NULL node_id resolves to the hosting engine nodeId');
  t.ok(Number.isFinite(created.row.created_at), 'identity created_at set');

  await lifecycle.start({...definition});
  const afterStart = serviceWrites();
  t.equal(afterStart.length, 3, 'start projects exactly one more write');
  t.equal(afterStart[2].kind, 'update',
    'transitions UPDATE the existing row — never recreate/replace');
  t.equal(afterStart[2].data.status, 'active',
    'started replica projects ACTIVE (what the rebalancer and ' +
      'observers filter on)');
  t.same(afterStart[2].whereClause, {service_id: SVC_ID},
    'updates are primary-key addressed (ARCH-0029)');
  t.equal(afterStart[2].data.created_at, undefined,
    'transitions never rewrite the identity created_at');

  await lifecycle.stop({...definition});
  const afterStop = serviceWrites();
  const last = afterStop[afterStop.length - 1];
  t.equal(last.kind, 'delete',
    'a stopped replica row is DELETED (mirrors the partition and ' +
      'message-group row owners — no lingering stopped rows to skew ' +
      'the planner)');
  t.same(last.whereClause, {service_id: SVC_ID},
    'the delete is primary-key addressed');
  t.equal(
    afterStop.filter((w) => w.kind === 'insert').length,
    1,
    'exactly ONE insert across the whole lifecycle (TEST-0001)',
  );
  t.equal(
    afterStop.filter((w) => w.kind === 'upsert').length,
    0,
    'INSERT OR REPLACE is never used for lifecycle rows (ARCH-0009)',
  );
});

test('the rebalancer currentReplicas view sees dispatched replica rows ' +
  '(the strict-equality blind spot)', async (t) => {
  const {UnifiedRebalancer} = await import(
    '../../src/rebalancer/unified-rebalancer.js');
  const entityId = 'svc-vision';
  const projectedRows = [
    {
      service_id: `${entityId}-r1`,
      service_type: 'runtime_service',
      node_id: 'node-a',
      status: 'active',
      created_at: 1,
      updated_at: 1,
    },
    {
      service_id: 'svc-OTHER-r1',
      service_type: 'runtime_service',
      node_id: 'node-b',
      status: 'active',
      created_at: 1,
      updated_at: 1,
    },
  ];
  const cache = {
    filter: (table, predicate) => projectedRows.filter(predicate),
    get: () => null,
    getAll: () => [],
  };
  const rebalancer = new UnifiedRebalancer({
    entityId,
    entityType: 'runtime_service',
    systemTableCache: cache,
    cdcIntegrationService: {},
    tablePolicyService: {},
    nodeId: 'node-a',
    messageRouter: {},
    rebalanceCoordinator: {},
  });
  const replicas = rebalancer.getCurrentReplicas();
  t.equal(replicas.length, 1,
    'a dispatched ${entityId}-rN row belongs to its entity');
  t.equal(replicas[0].service_id, `${entityId}-r1`,
    'and only that entity — other services are excluded');
});

test('a start failure projects the failed state onto the existing row',
  async (t) => {
    const {lifecycle, writes} = buildHarness();
    lifecycle.registerNativeJsHandler('throwing-runtime', {
      prepare: async () => ({status: 'ready'}),
      start: async () => {
        throw new Error('boom during start');
      },
      stop: async () => {},
      health: async () => ({status: 'unknown'}),
    });
    const definition = {
      serviceId: SVC_ID,
      serviceType: 'runtime_service',
      runtime_kind: 'native_js',
      runtime_ref: 'throwing-runtime',
      runtime_config: null,
    };
    await lifecycle.prepare(definition, {nodeId: HOST_NODE_ID});

    await t.rejects(
      lifecycle.start({...definition}),
      undefined,
      'a throwing module start propagates',
    );
    const serviceWrites = writes.filter(
      (w) => w.tableName === TABLES.SERVICES);
    const last = serviceWrites[serviceWrites.length - 1];
    t.equal(last.kind, 'update', 'failure projects onto the existing row');
    t.equal(last.data.status, 'failed', 'failure state is visible');
    t.ok(typeof last.data.error_message === 'string' &&
      last.data.error_message.length > 0,
    'the failure reason is projected');
  });

test('an engine composed without a lifecycle stays inert', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [], null),
    messageRouter: createMockMessageRouter(),
    nodeId: HOST_NODE_ID,
  });
  t.equal(engine.serviceRuntimeLifecycle, null,
    'no lifecycle, no wiring, no throw');
});
