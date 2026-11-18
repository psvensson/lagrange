// Actual admin -> NodesOwner -> gateway -> CDC DELETE over SQLite. Only the
// routed SQL engine/owner-RPC transport is substituted. Cache mutations model
// committed CDC observations; this does not prove cross-host propagation.
import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {AdminOwnerOperations} from '../../src/admin/admin-owner-operations.js';
import {NodesOwner} from '../../src/control-plane/owners/nodes-owner.js';
import {NODE_REGISTRATION_OUTCOME, writeNodeRegistrationAtIncarnation} from
  '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {buildNodeRegistrationRow} from
  '../../src/bootstrap/shared/node-registration-owner-row-builder.js';
import {NODES_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {TABLES} from '../../src/constants/index.js';
import {PARTITION_SETTLED_REPLAY} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});
const NODE_ID = 'removal-node';
const OBSERVATION = Object.freeze({bootIncarnation: 1, status: NODE_STATE.STOPPED});

function createFixture(t, beforeDelete = () => {}, afterDelete = () => {}) {
  const db = new Database(':memory:');
  t.teardown(() => db.close());
  db.exec(generateCreateTableSQL(NODES_SCHEMA));
  const cache = new SystemTableCache();
  const writes = [];
  let reads = 0;
  function observe() {
    return db.prepare('SELECT * FROM nodes WHERE node_id = ?').get(NODE_ID) || null;
  }
  function setStatus(status) {
    db.prepare('UPDATE nodes SET status = ? WHERE node_id = ?').run(status, NODE_ID);
    cache.applySystemTableChange(TABLES.NODES, CACHE_CDC_OPERATIONS.UPSERT, observe());
  }
  function registrationRow(bootIncarnation) {
    return buildNodeRegistrationRow({nodeId: NODE_ID, bootIncarnation,
      nodeAddress: '127.0.0.1:9999', now: bootIncarnation});
  }
  const original = {...registrationRow(1), status: NODE_STATE.STOPPED};
  db.prepare(`INSERT INTO nodes (${Object.keys(original).join(', ')}) VALUES (` +
    Object.keys(original).map(() => '?').join(', ') + ')').run(...Object.values(original));
  cache.applySystemTableChange(TABLES.NODES, CACHE_CDC_OPERATIONS.INSERT, observe());
  const service = new CDCIntegrationService({nodeId: NODE_ID, systemTableCache: cache,
    sqlQueryEngine: {async executeQuery(sql, params, options) {
      writes.push({sql, params, options});
      const deleting = sql.startsWith('DELETE');
      if (deleting) await beforeDelete({register, setStatus, db, cache});
      const result = db.prepare(sql).run(...params);
      if (result.changes > 0 && deleting) {
        cache.applySystemTableChange(TABLES.NODES, CACHE_CDC_OPERATIONS.DELETE,
          {node_id: NODE_ID, boot_incarnation: OBSERVATION.bootIncarnation});
      } else if (result.changes > 0) {
        cache.applySystemTableChange(TABLES.NODES, CACHE_CDC_OPERATIONS.UPSERT, observe());
      }
      if (deleting) await afterDelete({register, setStatus, db, cache});
      return {success: true, affectedRows: result.changes};
    }},
  });
  service.initialize();
  // Read transport seam only, used by the old admin pre-read. The removal
  // owner under repair has no authoritative read dependency.
  service.executeAuthoritativeSystemTableRead = async () => {
    reads += 1;
    return {success: true, rows: observe() ? [observe()] : []};
  };
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID,
    cdcIntegrationService: service, systemTableCache: cache});
  const owner = new NodesOwner({controlPlaneSystemTableGateway: gateway});
  async function register(bootIncarnation, status) {
    const result = await writeNodeRegistrationAtIncarnation({bootIncarnation,
      row: registrationRow(bootIncarnation),
      observe: async () => ({available: true, row: observe()}),
      insert: (row, options) => owner.insertNode(row, options),
      advance: (where, row, options) => owner.updateWhere(where, row, options),
    });
    t.equal(result.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
      'the real registration owner acquired the new incarnation');
    setStatus(status);
    return result;
  }
  const admin = new AdminOwnerOperations({getNodesOwner: () => owner}, NODE_ID);
  t.teardown(() => service.markShuttingDown());
  return {admin, owner, gateway, service, cache, db, observe, register, writes,
    get reads() {
      return reads;
    }};
}

test('NodesOwner mutation-time fence preserves a rejoined active incarnation', async (t) => {
  const fixture = createFixture(t, ({register}) => register(2, NODE_STATE.ACTIVE));
  const answer = await fixture.admin.removeNode(NODE_ID, OBSERVATION);
  t.equal(fixture.writes.filter(({sql}) => sql.startsWith('DELETE')).length, 1,
    'the real gateway issued one DELETE');
  t.equal(answer.statusCode, 409, 'zero affected rows are observation changed');
  t.equal(answer.body.success, false, 'not reported removed');
  t.equal(fixture.observe()?.boot_incarnation, 2, 'new incarnation survives in SQLite');
  t.equal(fixture.cache.get(TABLES.NODES, NODE_ID)?.boot_incarnation, 2,
    'new incarnation survives in SystemTableCache');
});

test('NodesOwner mutation-time fence preserves a changed status at the same incarnation',
  async (t) => {
    const fixture = createFixture(t, ({setStatus}) => setStatus(NODE_STATE.ACTIVE));
    const answer = await fixture.admin.removeNode(NODE_ID, OBSERVATION);
    t.equal(answer.statusCode, 409);
    t.equal(fixture.observe()?.status, NODE_STATE.ACTIVE);
    t.equal(fixture.cache.get(TABLES.NODES, NODE_ID)?.status, NODE_STATE.ACTIVE);
    t.equal(fixture.reads, 0, 'a zero-row conditional delete never starts absence repair');
  });

test('CDC authoritative deletion visibility reconciles the successor without deleting it',
  async (t) => {
    const fixture = createFixture(t);
    fixture.db.prepare('UPDATE nodes SET boot_incarnation = ?, status = ?, ' +
      'created_at = ?, last_heartbeat = ? WHERE node_id = ?')
      .run(2, NODE_STATE.ACTIVE, 2, 2, NODE_ID);
    t.equal(fixture.cache.get(TABLES.NODES, NODE_ID).boot_incarnation, 1,
      'cache still observes the deleted original');
    const repaired = await fixture.service.repairCacheVisibilityHole(
      TABLES.NODES, NODE_ID, false,
      {node_id: NODE_ID, boot_incarnation: 1, status: NODE_STATE.STOPPED});
    t.equal(repaired.authoritativeVisibilityConfirmed, true);
    t.equal(fixture.observe().boot_incarnation, 2, 'authoritative successor preserved');
    t.equal(fixture.cache.get(TABLES.NODES, NODE_ID).boot_incarnation, 2,
      'the existing authoritative cache repair installs the successor');
  });

test('CDC older absence observation cannot erase an already cached successor', async (t) => {
  const fixture = createFixture(t);
  await fixture.register(2, NODE_STATE.ACTIVE);
  fixture.service.executeAuthoritativeSystemTableRead = async () => ({success: true, rows: []});
  const repaired = await fixture.service.repairCacheVisibilityHole(
    TABLES.NODES, NODE_ID, false,
    {node_id: NODE_ID, boot_incarnation: 1, status: NODE_STATE.STOPPED});
  t.equal(repaired.authoritativeVisibilityConfirmed, true);
  t.equal(fixture.cache.get(TABLES.NODES, NODE_ID).boot_incarnation, 2);
  t.equal(fixture.observe().boot_incarnation, 2);
});

test('CDC missing predicate fields cannot prove disappearance of the matched row', async (t) => {
  const fixture = createFixture(t);
  const expected = {node_id: NODE_ID, boot_incarnation: 1, status: NODE_STATE.STOPPED};
  fixture.service.executeAuthoritativeSystemTableRead = async () => ({success: true,
    rows: [{node_id: NODE_ID}]});
  const observation = await fixture.service.repairCacheVisibilityHole(
    TABLES.NODES, NODE_ID, false, expected);
  t.notOk(observation.authoritativeVisibilityConfirmed);
  t.equal(fixture.cache.get(TABLES.NODES, NODE_ID).boot_incarnation, 1);
  const sparse = new CDCIntegrationService({systemTableCache: {
    has: () => true, get: () => ({node_id: NODE_ID}),
  }});
  t.equal(sparse.isCacheExpectationSatisfied(TABLES.NODES, NODE_ID, false, expected), false);
});

test('CDC conditional settled replay with an unknown count never requests row absence',
  async (t) => {
    const fixture = createFixture(t, ({setStatus}) => setStatus(NODE_STATE.ACTIVE));
    const execute = fixture.service.sqlQueryEngine.executeQuery;
    fixture.service.sqlQueryEngine.executeQuery = async (...args) => {
      await execute(...args);
      return {success: true, settledReplay: PARTITION_SETTLED_REPLAY.OUTCOME_NOT_RETAINED};
    };
    const answer = await fixture.admin.removeNode(NODE_ID, OBSERVATION);
    t.equal(answer.statusCode, 503, 'unknown affected count stays unconfirmed');
    t.equal(fixture.reads, 0, 'no row absence read or repair is started');
    t.equal(fixture.observe().status, NODE_STATE.ACTIVE);
    t.equal(fixture.cache.get(TABLES.NODES, NODE_ID).status, NODE_STATE.ACTIVE);
  });

test('NodesOwner removes the exact terminal row and a repeated intent removes nothing',
  async (t) => {
    const fixture = createFixture(t);
    const first = await fixture.admin.removeNode(NODE_ID, OBSERVATION);
    t.equal(first.statusCode, 200);
    t.equal(fixture.observe(), null);
    t.notOk(fixture.cache.get(TABLES.NODES, NODE_ID));
    const repeated = await fixture.admin.removeNode(NODE_ID, OBSERVATION);
    t.equal(repeated.statusCode, 409, 'repeated deletion has no newly removed row');
    await fixture.register(2, NODE_STATE.FAILED);
    const stale = await fixture.admin.removeNode(NODE_ID, OBSERVATION);
    t.equal(stale.statusCode, 409, 'stale HTTP retry never selects the new terminal incarnation');
    t.equal(fixture.observe()?.boot_incarnation, 2);
  });

test('CDC deletion visibility accepts an already observed successor after exact deletion',
  async (t) => {
    const fixture = createFixture(t, () => {},
      ({register}) => register(2, NODE_STATE.ACTIVE));
    const answer = await fixture.admin.removeNode(NODE_ID, OBSERVATION);
    t.equal(answer.statusCode, 200, 'the exact old row was removed');
    t.equal(fixture.observe()?.boot_incarnation, 2, 'successor remains durable');
    t.equal(fixture.reads, 0, 'visible successor requires no absence repair');
    t.equal(fixture.service.isCacheExpectationSatisfied(TABLES.NODES, NODE_ID, false,
      {node_id: NODE_ID, boot_incarnation: 1, status: NODE_STATE.STOPPED}), true);
  });
