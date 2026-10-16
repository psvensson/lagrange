/**
 * R2 service-instance persistence registration. Real bootstrap/per-replica DDL
 * and cache policy only; no selection, lifecycle grant or Raft execution claim.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {createPartitionServiceTable} from
  '../../src/partition/partition-service-table-bootstrap.js';
import {SystemTableCache, CDC_OPERATIONS} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/tables.js';
import {
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_SCHEMAS,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CACHE_SYSTEM_TABLES,
  CACHE_HYDRATION_TABLES,
  CDC_PROPAGATED_TABLES,
} from '../../src/cache/cache-constants.js';
import {
  CDC_AUTHORITY_CLASS,
  getSystemTableCdcPolicy,
} from '../../src/cache/cdc-table-policy.js';
import {getSystemCachePrimaryKeyField} from
  '../../src/cache/system-cache-key-descriptor.js';

const NAME = 'service_instances';

function schema() {
  const found = SYSTEM_TABLE_SCHEMAS.filter((entry) => entry.tableName === NAME);
  assert.equal(found.length, 1, 'one production schema, not a fixture CREATE TABLE');
  return found[0];
}

test('service instances have one system name and a complete RF3 bootstrap registration', () => {
  assert.equal(TABLES.SERVICE_INSTANCES, NAME);
  assert.equal(SYSTEM_TABLE_NAME.SERVICE_INSTANCES, NAME);
  assert.equal(INITIAL_PARTITION_IDS[NAME], 'service_instances-p1');
  assert.deepEqual(INITIAL_REPLICA_IDS[NAME], [
    'service_instances-p1-r1', 'service_instances-p1-r2', 'service_instances-p1-r3',
  ]);
  assert.equal(getSystemCachePrimaryKeyField(NAME), 'service_id');
});

test('service instance schema retains exactly the R2 key, format and canonical state', () => {
  assert.deepEqual(schema().columns.map(({name, type, primaryKey, notNull}) =>
    ({name, type, primaryKey: primaryKey === true, notNull: notNull === true})), [
    {name: 'service_id', type: 'TEXT', primaryKey: true, notNull: true},
    {name: 'format', type: 'INTEGER', primaryKey: false, notNull: true},
    {name: 'state', type: 'TEXT', primaryKey: false, notNull: true},
  ]);
  assert.ok(schema().columns.every((column) =>
    !Object.hasOwn(column, 'defaultValue')), 'no default can mint instance authority');
});

test('generated service-instance DDL enforces one non-null row identity and required state', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(generateCreateTableSQL(schema()));
  const insert = db.prepare('INSERT INTO service_instances (service_id, format, state) VALUES (?, ?, ?)');
  const original = '{"version":1,"selected":null}';
  insert.run('tenant-bound-service', 1, original);
  assert.throws(() => insert.run('tenant-bound-service', 1, '{}'), /UNIQUE/u);
  assert.throws(() => insert.run(null, 1, '{}'), /NOT NULL/u);
  assert.throws(() => insert.run('missing-format', null, '{}'), /NOT NULL/u);
  assert.throws(() => insert.run('missing-state', 1, null), /NOT NULL/u);
  assert.deepEqual(db.prepare('SELECT * FROM service_instances').all(), [
    {service_id: 'tenant-bound-service', format: 1, state: original},
  ]);
});

test('service-instance CDC is an internal projection and bootstrap hydration, not external CDC', () => {
  assert.ok(CACHE_SYSTEM_TABLES.includes(NAME));
  assert.ok(CACHE_HYDRATION_TABLES.includes(NAME));
  assert.ok(CDC_PROPAGATED_TABLES.includes(NAME));
  const policy = getSystemTableCdcPolicy(NAME);
  assert.equal(policy.authorityClass, CDC_AUTHORITY_CLASS.CONTROL);
  assert.equal(policy.internalCachePropagation, true);
  assert.equal(policy.externalCdcAllowed, false);
  assert.equal(policy.readinessRelevant, false,
    'instance grants must not become a new cluster-readiness or formation authority');
});

test('the real per-replica table creator preserves the service-instance key and required fields', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  // Unrelated table-specific column upgrades are explicit collaborators here.
  // Only this table's real DDL owner and SQLite are under observation.
  const service = {db, tableName: NAME, schema: schema(), partitionId: 'component-p1',
    logger: {debug() {}},
    ensureServicesTableColumns() {}, ensureTablesTableColumns() {},
    ensureMessageGroupsTableColumns() {}, ensurePartitionsTableColumns() {},
    ensureSqlTransactionsTableColumns() {}, ensureReplicaOperationsTableColumns() {}};
  createPartitionServiceTable(service);
  const columns = db.prepare('PRAGMA table_info(service_instances)').all();
  assert.deepEqual(columns.map((col) => [col.name, col.type, col.notnull, col.pk]), [
    ['service_id', 'TEXT', 1, 1], ['format', 'INTEGER', 1, 0], ['state', 'TEXT', 1, 0],
  ]);
  db.prepare('INSERT INTO service_instances VALUES (?, ?, ?)').run('service', 1, '{}');
  createPartitionServiceTable(service);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM service_instances').get().n, 1,
    'opening an existing table cannot replace its retained identity');
});

test('the existing system cache projects service-instance rows by their service identity', () => {
  const cache = new SystemTableCache();
  const row = {service_id: 'cache-component-service', format: 1, state: '{"version":1}'};
  cache.applySystemTableChange(NAME, CDC_OPERATIONS.INSERT, row);
  assert.equal(cache.get(NAME, row.service_id).state, row.state);
  const next = {...row, state: '{"version":2}'};
  cache.applySystemTableChange(NAME, CDC_OPERATIONS.UPDATE, next);
  assert.equal(cache.getAll(NAME).length, 1);
  assert.equal(cache.get(NAME, row.service_id).state, next.state);
});
