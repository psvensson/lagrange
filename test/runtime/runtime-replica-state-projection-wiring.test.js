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
  RUNTIME_REPLICA_STATE_PROJECTION_EVENT,
} from '../../src/query/runtime-replica-state-projection-owner.js';
import {
  SQL_QUERY_LOOP_RUNTIME_REF,
} from '../../src/runtime/sql-query-loop-runtime-module.js';
import {
  ReplicaOperationRepository,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
} from '../query/sql-query-engine-test-support.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

const HOST_NODE_ID = 'host-node';
const SVC_ID = 'svc-projection';
const RUNTIME_ENTITY_ID = 'svc';
const INCLUDED_RUNTIME_SERVICE_IDS = Object.freeze([
  RUNTIME_ENTITY_ID,
  `${RUNTIME_ENTITY_ID}-r1`,
  `${RUNTIME_ENTITY_ID}-r12`,
]);
const EXCLUDED_RUNTIME_SERVICE_IDS = Object.freeze([
  `${RUNTIME_ENTITY_ID}-report-r1`,
  `${RUNTIME_ENTITY_ID}-r`,
  `${RUNTIME_ENTITY_ID}-r0`,
  `${RUNTIME_ENTITY_ID}-r01`,
  `${RUNTIME_ENTITY_ID}-r-1`,
  `${RUNTIME_ENTITY_ID}-rx`,
  `${RUNTIME_ENTITY_ID}-r1-extra`,
]);

function runtimeServiceIdentityRows() {
  return [
    ...INCLUDED_RUNTIME_SERVICE_IDS,
    ...EXCLUDED_RUNTIME_SERVICE_IDS,
  ].map((serviceId, index) => ({
    service_id: serviceId,
    service_type: 'runtime_service',
    node_id: `node-${index + 1}`,
    status: 'active',
    created_at: 1,
    updated_at: 1,
  }));
}

function buildHarness() {
  const {serviceRuntimeLifecycle} = createRuntimeStartupWiring();
  const writes = [];
  let rowExists = false;
  const controlPlaneSystemTableGateway = {
    updateSystemTableRow: async (tableName, whereClause, data) => {
      writes.push({kind: 'update', tableName, whereClause, data});
      return {
        success: true,
        partitionResult: {affectedRows: rowExists ? 1 : 0},
      };
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
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [], null),
    messageRouter: createMockMessageRouter(),
    nodeId: HOST_NODE_ID,
    serviceRuntimeLifecycle,
    controlPlaneSystemTableGateway,
  });
  return {
    engine,
    lifecycle: serviceRuntimeLifecycle,
    projectionOwner: engine.runtimeReplicaStateProjectionOwner,
    writes,
  };
}

function waitForAppliedProjection(projectionOwner, status) {
  return new Promise((resolve) => {
    const listener = (event) => {
      if (event?.status !== status) {
        return;
      }
      projectionOwner.removeListener(
        RUNTIME_REPLICA_STATE_PROJECTION_EVENT.APPLIED,
        listener,
      );
      resolve(event);
    };
    projectionOwner.on(
      RUNTIME_REPLICA_STATE_PROJECTION_EVENT.APPLIED,
      listener,
    );
  });
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
  const {engine, lifecycle, projectionOwner, writes} = buildHarness();
  t.teardown(() => engine.shutdown());
  const definition = loopDefinition();

  const createdApplied = waitForAppliedProjection(
    projectionOwner,
    'created',
  );
  const prepared = await lifecycle.prepare(definition, {nodeId: HOST_NODE_ID});
  await createdApplied;
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

  const activeApplied = waitForAppliedProjection(
    projectionOwner,
    'active',
  );
  await lifecycle.start({...definition});
  await activeApplied;
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

  const stoppedApplied = waitForAppliedProjection(
    projectionOwner,
    'stopped',
  );
  await lifecycle.stop({...definition});
  await stoppedApplied;
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

test('the rebalancer currentReplicas view uses exact canonical runtime IDs',
  async (t) => {
    const {UnifiedRebalancer} = await import(
      '../../src/rebalancer/unified-rebalancer.js');
    const projectedRows = runtimeServiceIdentityRows();
    const cache = {
      filter: (table, predicate) => projectedRows.filter(predicate),
      get: () => null,
      getAll: () => [],
    };
    const rebalancer = new UnifiedRebalancer({
      entityId: RUNTIME_ENTITY_ID,
      entityType: 'runtime_service',
      systemTableCache: cache,
      cdcIntegrationService: {},
      tablePolicyService: {},
      nodeId: 'node-a',
      messageRouter: {},
      rebalanceCoordinator: {},
    });
    const replicas = rebalancer.getCurrentReplicas();
    t.same(
      replicas.map((row) => row.service_id),
      INCLUDED_RUNTIME_SERVICE_IDS,
      'bare and positive-decimal replica ids belong; overlapping prefixes ' +
        'and malformed ordinals do not',
    );
  });

test('the replica-operation repository uses exact canonical runtime IDs',
  async (t) => {
    const projectedRows = runtimeServiceIdentityRows();
    const repository = new ReplicaOperationRepository({
      nodeId: 'node-a',
      systemTableCache: {
        filter: (_tableName, predicate) => projectedRows.filter(predicate),
      },
      cdcIntegrationService: {},
      controlPlaneSystemTableGateway: {},
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
    });

    const serviceRows = repository.getEntityServiceRows({
      partitionId: RUNTIME_ENTITY_ID,
      entityType: 'runtime_service',
      entityId: RUNTIME_ENTITY_ID,
    });

    t.same(
      serviceRows.map((row) => row.service_id),
      INCLUDED_RUNTIME_SERVICE_IDS,
      'bare and positive-decimal replica ids belong; overlapping prefixes ' +
        'and malformed ordinals do not',
    );
  });

test('a start failure projects the failed state onto the existing row',
  async (t) => {
    const {engine, lifecycle, projectionOwner, writes} = buildHarness();
    t.teardown(() => engine.shutdown());
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
    const createdApplied = waitForAppliedProjection(
      projectionOwner,
      'created',
    );
    await lifecycle.prepare(definition, {nodeId: HOST_NODE_ID});
    await createdApplied;

    const failedApplied = waitForAppliedProjection(
      projectionOwner,
      'failed',
    );
    await t.rejects(
      lifecycle.start({...definition}),
      undefined,
      'a throwing module start propagates',
    );
    await failedApplied;
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
