// Actual HTTP/owner/gateway/CDC mutation into SQLite. Authoritative read
// transport is bound to that same database, not a projected cache answer.
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import {test} from '../../src/test-helpers/tap.js';
import {AdminOwnerOperations, registerAdminOwnerOperationRoutes} from
  '../../src/admin/admin-owner-operations.js';
import {LogsOwner} from '../../src/control-plane/owners/logs-owner.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LOGS_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {TABLES} from '../../src/constants/index.js';

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});
const MARKER_PATH = '/api/admin/logs/markers';
const NODE_ID = 'marker-node';
const REQUEST = Object.freeze({markerId: 'probe-one', message: 'partition witness'});
const LOG_ID = 'diagnostic-marker:probe-one';
const NOW = 1700000000000;

function createFixture(t, afterWrite = null) {
  const db = new Database(':memory:');
  t.teardown(() => db.close());
  db.exec(generateCreateTableSQL(LOGS_SCHEMA));
  const cache = new SystemTableCache();
  const writes = [];
  const observe = () => db.prepare('SELECT * FROM logs WHERE log_id = ?').get(LOG_ID);
  const service = new CDCIntegrationService({nodeId: NODE_ID, systemTableCache: cache,
    sqlQueryEngine: {async executeQuery(sql, params, options) {
      writes.push({sql, params, options});
      const result = db.prepare(sql).run(...params);
      if (result.changes > 0) {
        const row = db.prepare('SELECT * FROM logs ORDER BY rowid DESC LIMIT 1').get();
        cache.applySystemTableChange(TABLES.LOGS, CACHE_CDC_OPERATIONS.INSERT, row);
      }
      return afterWrite ? afterWrite(result) :
        {success: true, affectedRows: result.changes};
    }},
  });
  service.initialize();
  t.teardown(() => service.markShuttingDown());
  service.executeAuthoritativeSystemTableRead = async (_table, sql, params) =>
    ({success: true, rows: db.prepare(sql).all(...params)});
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID,
    cdcIntegrationService: service, systemTableCache: cache});
  const owner = new LogsOwner({controlPlaneSystemTableGateway: gateway, now: () => NOW});
  const app = Fastify();
  registerAdminOwnerOperationRoutes(app,
    new AdminOwnerOperations({getLogsOwner: () => owner}, NODE_ID));
  t.teardown(() => app.close());
  return {app, db, cache, service, owner, writes, observe};
}

test('diagnostic marker reaches logs through its fixed semantic owner', async (t) => {
  const fixture = createFixture(t);
  const response = await fixture.app.inject({method: 'POST', url: MARKER_PATH,
    payload: REQUEST});
  t.equal(response.statusCode, 200);
  t.equal(response.json().markerState, 'recorded');
  t.equal(response.json().logId, LOG_ID);
  const row = fixture.observe();
  t.equal(row?.node_id, NODE_ID, 'server identity is stored');
  t.equal(row?.message, REQUEST.message);
  t.equal(row?.level, 'info');
  t.equal(row?.timestamp, NOW);
  t.equal(row?.created_at, NOW);
  t.equal(fixture.writes.length, 1, 'one gateway insertion');
});

test('same original marker retries settle without changing the first row', async (t) => {
  const f = createFixture(t);
  const first = await f.app.inject({method: 'POST', url: MARKER_PATH, payload: REQUEST});
  t.equal(first.statusCode, 200);
  const original = f.observe();
  f.owner.now = () => NOW + 1000;
  const replay = await f.app.inject({method: 'POST', url: MARKER_PATH, payload: REQUEST});
  t.equal(replay.statusCode, 200);
  t.equal(replay.json().timestamp, NOW, 'the first recorded timestamp is retained');
  t.same(f.observe(), original, 'retry never updates the existing log');
  t.equal(f.writes.length, 2, 'each request attempted the uniqueness-fenced insert');
  t.equal(f.db.prepare('SELECT COUNT(*) AS count FROM logs').get().count, 1);
  const conflict = await f.app.inject({method: 'POST', url: MARKER_PATH,
    payload: {...REQUEST, message: 'different'}});
  t.equal(conflict.statusCode, 409);
  t.equal(conflict.json().errorCode, 'LOG_MARKER_IDENTITY_CONFLICT');
  t.same(f.observe(), original);
  const otherIngress = Fastify();
  registerAdminOwnerOperationRoutes(otherIngress,
    new AdminOwnerOperations({getLogsOwner: () => f.owner}, 'other-node'));
  t.teardown(() => otherIngress.close());
  const moved = await otherIngress.inject({method: 'POST', url: MARKER_PATH, payload: REQUEST});
  t.equal(moved.statusCode, 409, 'retry on a different ingress is different server intent');
  t.same(f.observe(), original);
});

test('an applied marker with an unknown write count settles from its durable row', async (t) => {
  const f = createFixture(t, () => ({success: true}));
  const response = await f.app.inject({method: 'POST', url: MARKER_PATH, payload: REQUEST});
  t.equal(response.statusCode, 200);
  t.equal(response.json().markerState, 'recorded');
  t.equal(f.observe().message, REQUEST.message);
  t.equal(f.writes.length, 1);
});

test('HTTP callers cannot provide node identity, log fields or mutation options', async (t) => {
  const f = createFixture(t);
  for (const field of ['nodeId', 'node_id', 'level', 'logId', 'timestamp',
    'writeIdentity', 'statementIngress', 'sql']) {
    const response = await f.app.inject({method: 'POST', url: MARKER_PATH,
      payload: {...REQUEST, [field]: 'caller-value'}});
    t.equal(response.statusCode, 400, field);
    t.equal(response.json().errorCode, 'LOG_MARKER_REQUEST_INVALID');
  }
  t.equal(f.writes.length, 0);
  t.equal(f.observe(), undefined);
});

test('distributed smoke transport records an owner marker and checks its SQL row', async (t) => {
  const {requestDiagnosticMarker} = await import(
    '../distributed/harness/cluster-node-owner-operations.js');
  const {run} = await import('../distributed/scenarios/admin-query-smoke.js');
  const f = createFixture(t);
  await f.app.listen({host: '127.0.0.1', port: 0});
  const node = {ip: '127.0.0.1', adminApiPort: f.app.server.address().port,
    appendDiagnosticMarker(marker) {
      return requestDiagnosticMarker(this, marker);
    },
    async query(sql, params) {
      return {rows: f.db.prepare(sql).all(...params)};
    }};
  const result = await run({getNodes: () => [node]});
  t.same(result, {queries: 1, ownerOperations: 1});
  t.equal(f.db.prepare('SELECT COUNT(*) AS count FROM logs').get().count, 1);
  t.equal(f.writes.length, 1);
});
