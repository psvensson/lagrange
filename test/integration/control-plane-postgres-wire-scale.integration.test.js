// Real HTTP -> semantic owner -> gateway -> CDC SQL builder -> SQLite.
// SQL transport is the local seam; placement and runtime remain their owners.
import Database from 'better-sqlite3';
import {setImmediate as nextTurn} from 'node:timers/promises';
import Fastify from 'fastify';
import {test} from '../../src/test-helpers/tap.js';
import {AdminOwnerOperations, registerAdminOwnerOperationRoutes} from
  '../../src/admin/admin-owner-operations.js';
import {ServiceDefinitionsOwner} from
  '../../src/control-plane/owners/service-definitions-owner.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createPostgresWireDefinition} from '../../src/wasm-service/meta-service-factory.js';
import {serializeServiceDefinition} from '../../src/wasm-service/wasm-service-models.js';
import {SERVICE_DEFINITIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {TABLES} from '../../src/constants/index.js';
import {RuntimeServiceRebalancerOwner} from
  '../../src/bootstrap/shared/runtime-service-rebalancer-setup.js';
import {resolveRuntimeServiceTargetReplicaCount} from '../../src/rebalancer/runtime-service-policy.js';

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});
const SERVICE_ID = 'sys-postgres-wire';
const SCALE_PATH = '/api/admin/services/sys-postgres-wire/scale';
const REQUEST = Object.freeze({replicaCount: 2,
  runtimeConfig: Object.freeze({host: '127.0.0.1', authMode: 'password', tlsMode: 'disable'})});

function createFixture(t, beforeUpdate = () => {}) {
  const db = new Database(':memory:');
  t.teardown(() => db.close());
  db.exec(generateCreateTableSQL(SERVICE_DEFINITIONS_SCHEMA));
  const row = serializeServiceDefinition(createPostgresWireDefinition());
  db.prepare(`INSERT INTO service_definitions (${Object.keys(row).join(', ')}) VALUES (` +
    Object.keys(row).map(() => '?').join(', ') + ')').run(...Object.values(row));
  const observe = () => db.prepare('SELECT * FROM service_definitions WHERE service_id = ?')
    .get(SERVICE_ID);
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, CACHE_CDC_OPERATIONS.INSERT, observe());
  const writes = [];
  const service = new CDCIntegrationService({nodeId: 'scale-node', systemTableCache: cache,
    sqlQueryEngine: {async executeQuery(sql, params) {
      writes.push({sql, params});
      beforeUpdate(db);
      const result = db.prepare(sql).run(...params);
      if (result.changes > 0) {
        cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS,
          CACHE_CDC_OPERATIONS.UPSERT, observe());
      }
      return {success: true, affectedRows: result.changes};
    }},
  });
  service.initialize();
  t.teardown(() => service.markShuttingDown());
  const gateway = new ControlPlaneSystemTableGateway({nodeId: 'scale-node',
    cdcIntegrationService: service, systemTableCache: cache});
  const owner = new ServiceDefinitionsOwner({catalogOwner: {},
    controlPlaneSystemTableGateway: gateway});
  const targets = [];
  const placementOwner = new RuntimeServiceRebalancerOwner({nodeId: 'scale-node',
    systemTableCache: cache, cdcIntegrationService: service, tablePolicyService: {},
    messageRouter: {}, rebalanceCoordinator: {}, serviceDefinitionsOwner: owner,
    createRebalancer: () => ({initialize() {}, setLeader() {}, shutdown() {},
      enqueueRebalanceCheck() {
        targets.push(resolveRuntimeServiceTargetReplicaCount(
          cache.get(TABLES.SERVICE_DEFINITIONS, SERVICE_ID)));
      }}),
  });
  placementOwner.setLeader(true);
  t.teardown(() => placementOwner.shutdown());
  const app = Fastify();
  registerAdminOwnerOperationRoutes(app,
    new AdminOwnerOperations({getServiceDefinitionsOwner: () => owner}));
  t.teardown(() => app.close());
  return {db, cache, observe, writes, owner, app, targets};
}

test('operator PG-wire scale persists desired state through the real owner gateway', async (t) => {
  const fixture = createFixture(t);
  const before = fixture.observe();
  const response = await fixture.app.inject({method: 'POST', url: SCALE_PATH, payload: REQUEST});
  t.equal(response.statusCode, 200, 'supported operator route accepts the desired state');
  t.equal(response.json().scaleState, 'desired_state_persisted', 'not an achieved listener claim');
  t.equal(fixture.observe().replica_count, REQUEST.replicaCount, 'count is durable');
  t.same(JSON.parse(fixture.observe().runtime_config), REQUEST.runtimeConfig, 'config is durable');
  const after = fixture.observe();
  delete before.replica_count;
  delete before.runtime_config;
  delete after.replica_count;
  delete after.runtime_config;
  t.same(after, before, 'all lifecycle, lineage and runtime identity fields remain unchanged');
  t.equal(fixture.writes.length, 1, 'one existing gateway mutation');
  await nextTurn();
  t.equal(fixture.targets.at(-1), 2, 'committed cache change wakes existing placement owner');
  const repeated = await fixture.app.inject({method: 'POST', url: SCALE_PATH, payload: REQUEST});
  t.equal(repeated.statusCode, 200, 'an identical assignment is idempotent');
  const down = await fixture.app.inject({method: 'POST', url: SCALE_PATH,
    payload: {...REQUEST, replicaCount: 0}});
  t.equal(down.statusCode, 200);
  await nextTurn();
  t.equal(fixture.targets.at(-1), 0, 'existing placement policy sees scale-down to zero');
});

test('operator PG-wire scale fences every built-in runtime identity field at mutation', async (t) => {
  for (const [column, value] of Object.entries({service_id: 'foreign-service',
    runtime_ref: 'foreign-runtime', runtime_kind: 'wasm_component',
    protocol: 'http', status: 'inactive'})) {
    const fixture = createFixture(t, (db) => db.prepare(
      `UPDATE service_definitions SET ${column} = ? WHERE service_id = ?`)
      .run(value, SERVICE_ID));
    const response = await fixture.app.inject({method: 'POST', url: SCALE_PATH, payload: REQUEST});
    t.equal(response.statusCode, 409, `mutation-time ${column} guard refuses`);
    t.equal(fixture.db.prepare('SELECT replica_count FROM service_definitions').get().replica_count,
      0, 'unsupported runtime was not scaled');
    t.equal(response.json().success, false);
  }
});
