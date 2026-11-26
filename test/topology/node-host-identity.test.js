/**
 * WP-D witnesses (owner decision D3, 2026-11-17; ruling A3, 2026-11-18): the
 * node host identity is a required boot-time value, written into NODES.host_id
 * by every NODES registration, read through one typed reader, and created from
 * NODES_SCHEMA without any runtime ALTER TABLE shim. A row without a declared
 * host reads HOST_UNDECLARED; a host is never derived from the node id.
 */
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {COLUMN} from '../../src/constants/index.js';
import {
  NODE_HOST_ID_ERROR_CODE,
  NODE_HOST_IDENTITY_STATE,
  readNodeHostIdentity,
  requireDeclaredNodeHostId,
} from '../../src/topology/node-host-identity.js';
import {
  NODES_SCHEMA,
  generateCreateIndexSQL,
  generateCreateTableSQL,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  NODES_SCHEMA_UNSUPPORTED,
  PARTITION_TABLE_OBSERVATION,
  createPartitionServiceTable,
  readPartitionServiceTableSchemaIn,
} from '../../src/partition/partition-service-table-bootstrap.js';
import {renderTableDefinitionSql} from '../../src/query/sql-table-definition.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {buildReplacementServiceOptions} from '../../src/partition/partition-reopen-options.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {PartitionServiceEntryApplyBase} from
  '../../src/partition/partition-service-entry-apply-base.js';
import {
  buildDurableRejoinMembershipResolution,
  buildExistingJoinAdmissionProgressResolution,
  buildNodeRegistrationRow,
} from '../../src/bootstrap/shared/node-registration-owner-row-builder.js';
import {NodeRegistrationOwner} from
  '../../src/bootstrap/shared/node-registration-owner.js';
import {createBootstrapServiceControlPlaneRuntimeMethods} from
  '../../src/bootstrap/bootstrap-service-control-plane-runtime-methods.js';
import {resolveRuntimeHostId} from '../../src/entrypoint-runtime-options.js';
import {startLagrangeRuntime} from '../../src/lagrange-runtime-startup.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {DataDirectoryManager} from '../../src/storage/data-directory-manager.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {resetProcessRuntimeClaimForTests} from
  '../../src/lagrange-runtime-process-claim.js';

const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const NODE_ID = '550e8400-e29b-41d4-a716-446655440d01';
const HOST_A = 'host-a';
const HOST_B = 'host-b.example.internal';

test('the declared host is required: absent or empty refuses, a host name ' +
  'is returned exactly as declared', () => {
  for (const absent of [undefined, null, '']) {
    assert.throws(() => requireDeclaredNodeHostId(absent),
      {code: NODE_HOST_ID_ERROR_CODE.REQUIRED});
  }
  for (const malformed of [' host-a', 'host a', '-host', 'host-', 'a/b',
    'x'.repeat(254), 42, {}, ['host-a']]) {
    assert.throws(() => requireDeclaredNodeHostId(malformed),
      {code: NODE_HOST_ID_ERROR_CODE.INVALID}, JSON.stringify(malformed));
  }
  for (const name of ['a', HOST_A, HOST_B, 'gke-pool-1-abc123', 'Tv-Dator',
    'DESKTOP_1', 'x'.repeat(253)]) {
    assert.equal(requireDeclaredNodeHostId(name), name);
  }
});

test('the one reader: a declared row is DECLARED; an older version\'s row, a ' +
  'NULL and an unwritable value are HOST_UNDECLARED, never the node id', () => {
  assert.deepEqual(readNodeHostIdentity({[COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.HOST_ID]: HOST_A}),
  {state: NODE_HOST_IDENTITY_STATE.DECLARED, hostId: HOST_A});
  const undeclared = {state: NODE_HOST_IDENTITY_STATE.HOST_UNDECLARED,
    hostId: null};
  // A row an older version wrote has no host_id at all.
  assert.deepEqual(readNodeHostIdentity({[COLUMN.NODE_ID]: NODE_ID}),
    undeclared);
  assert.deepEqual(readNodeHostIdentity({[COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.HOST_ID]: null}), undeclared);
  assert.deepEqual(readNodeHostIdentity({[COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.HOST_ID]: 'not a host'}), undeclared);
  assert.deepEqual(readNodeHostIdentity(null), undeclared);
  // One field: no camelCase alias is read.
  assert.deepEqual(readNodeHostIdentity({[COLUMN.NODE_ID]: NODE_ID,
    hostId: HOST_A}), undeclared);
  assert.ok(Object.isFrozen(readNodeHostIdentity({[COLUMN.HOST_ID]: HOST_A})));
});

function nodesService(db) {
  return Object.assign(Object.create(PartitionServiceEntryApplyBase.prototype), {
    db, tableName: SYSTEM_TABLE_NAME.NODES, schema: NODES_SCHEMA,
    tableId: SYSTEM_TABLE_NAME.NODES, partitionId: 'nodes-p1',
    replicaId: 'nodes-p1-r1', nodeId: NODE_ID, logger: QUIET,
  });
}

test('schema: a fresh NODES table declares host_id, writes and reads it ' +
  'through readNodeHostIdentity, and never alters a pre-release table in place',
(t) => {
  const fresh = new Database(':memory:');
  t.after(() => fresh.close());
  createPartitionServiceTable(nodesService(fresh));
  assert.equal(readPartitionServiceTableSchemaIn(fresh, NODES_SCHEMA).state,
    PARTITION_TABLE_OBSERVATION.COMPLETE);
  fresh.prepare('INSERT INTO nodes (node_id, node_address, cpu_cores, ' +
    'memory_mb, disk_gb, last_heartbeat, created_at) ' +
    'VALUES (?, ?, 1, 1, 1, 1, 1)')
    .run(NODE_ID, 'old:8080');
  const undeclared = fresh.prepare(
    'SELECT * FROM nodes WHERE node_id = ?').get(NODE_ID);
  assert.equal(undeclared[COLUMN.HOST_ID], null);
  assert.equal(readNodeHostIdentity(undeclared).state,
    NODE_HOST_IDENTITY_STATE.HOST_UNDECLARED);
  fresh.prepare('UPDATE nodes SET host_id = ? WHERE node_id = ?')
    .run(HOST_A, NODE_ID);
  assert.equal(readNodeHostIdentity(
    fresh.prepare('SELECT * FROM nodes WHERE node_id = ?').get(NODE_ID)).hostId,
  HOST_A);

  // Under O16 + A3, old clusters are re-founded behind the version fence;
  // createPartitionServiceTable never alters a pre-release table in place.
  const older = new Database(':memory:');
  t.after(() => older.close());
  const previousSchema = {...NODES_SCHEMA, columns: NODES_SCHEMA.columns
    .filter((column) => column.name !== COLUMN.HOST_ID)};
  older.exec(renderTableDefinitionSql(SYSTEM_TABLE_NAME.NODES, previousSchema));
  assert.throws(() => createPartitionServiceTable(nodesService(older)),
    {code: NODES_SCHEMA_UNSUPPORTED, source: 'sqlite'});
  const observed = readPartitionServiceTableSchemaIn(older, NODES_SCHEMA);
  assert.equal(observed.state, PARTITION_TABLE_OBSERVATION.UNAVAILABLE);
  assert.deepEqual(observed.missingColumns, [COLUMN.HOST_ID]);
});

test('generated NODES SQL opens with the same nullable host metric as partition DDL', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(generateCreateTableSQL(NODES_SCHEMA));
  for (const sql of generateCreateIndexSQL(NODES_SCHEMA)) db.exec(sql);
  createPartitionServiceTable(nodesService(db));
  const host = db.pragma('table_info(nodes)').find(({name}) =>
    name === COLUMN.HOST_CPU_UTILIZATION_PERCENT);
  assert.equal(host.type, 'REAL');
  assert.equal(host.notnull, 0);
  assert.equal(host.dflt_value, null);
});

test('NODES rejects the previous CPU schema on reopen and fresh allocation', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  const service = nodesService(db);
  const previous = {...NODES_SCHEMA, columns: NODES_SCHEMA.columns.map((column) =>
    column.name === COLUMN.HOST_CPU_UTILIZATION_PERCENT ?
      {name: 'cpu_usage_percent', type: 'REAL', defaultValue: 0} : column)};
  assert.throws(() => createPartitionServiceTable({...service, schema: previous}),
    {code: NODES_SCHEMA_UNSUPPORTED, source: 'catalog'});
  db.exec(renderTableDefinitionSql(SYSTEM_TABLE_NAME.NODES, previous));
  assert.throws(() => createPartitionServiceTable(service),
    {code: NODES_SCHEMA_UNSUPPORTED, source: 'sqlite'});
  assert.ok(db.pragma('table_info(nodes)').some(({name}) => name === 'cpu_usage_percent'));
});

test('NODES catalog requires the declared keys and indexes before creating any table', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  for (const schema of [
    {...NODES_SCHEMA, columns: NODES_SCHEMA.columns.map((col) =>
      col.primaryKey ? {...col, primaryKey: false} : col)},
    {...NODES_SCHEMA, columns: NODES_SCHEMA.columns.map((col) =>
      col.unique ? {...col, unique: false} : col)},
    {...NODES_SCHEMA, indices: NODES_SCHEMA.indices.slice(1)},
  ]) {
    assert.throws(() => createPartitionServiceTable({...nodesService(db), schema}),
      {code: NODES_SCHEMA_UNSUPPORTED, source: 'catalog'});
    assert.equal(db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'nodes'").get(), undefined);
  }
});

test('NODES fresh creation rolls back when another table owns a required index name', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE unrelated(status TEXT); CREATE INDEX idx_nodes_status ON unrelated(status)');
  assert.throws(() => createPartitionServiceTable(nodesService(db)),
    {code: NODES_SCHEMA_UNSUPPORTED, source: 'sqlite'});
  assert.equal(db.prepare("SELECT type FROM sqlite_schema WHERE name='nodes'").get(), undefined);
  assert.equal(db.prepare("SELECT tbl_name FROM sqlite_schema WHERE name='idx_nodes_status'").get()
    .tbl_name, 'unrelated');
});

test('NODES fresh partition enforces identity and replacement refuses a damaged store', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nodes-strict-reopen-'));
  const services = [];
  const open = async (options) => {
    const service = new PartitionService({...options, systemTableCache: new SystemTableCache()});
    services.push(service);
    await service.initialize();
    return service;
  };
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  try {
    ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
    LoggingService.getInstance().initialize({level: 'error'});
    const first = await open(withFoundingStamp({partitionId: 'nodes-p1', tableId: 'nodes',
      tableName: 'nodes', replicaId: 'nodes-p1-r1', nodeId: NODE_ID,
      dbPath: join(directory, 'nodes.sqlite'), schema: NODES_SCHEMA}));
    const write = first.db.prepare('INSERT INTO nodes (node_id,node_address,cpu_cores,memory_mb,' +
      'disk_gb,last_heartbeat,created_at) VALUES (?,?,1,1,1,1,1)');
    write.run('n1', 'a1');
    assert.throws(() => write.run('n1', 'a2'), {code: 'SQLITE_CONSTRAINT_PRIMARYKEY'});
    assert.throws(() => write.run('n2', 'a1'), {code: 'SQLITE_CONSTRAINT_UNIQUE'});
    const replacement = buildReplacementServiceOptions(first);
    await first.shutdown();
    const reopened = await open(replacement);
    assert.equal(reopened.db.prepare('SELECT node_address FROM nodes WHERE node_id=?').get('n1')
      .node_address, 'a1');
    await reopened.shutdown();
    const db = new Database(replacement.dbPath);
    try {
      db.exec('DROP INDEX idx_nodes_address');
      await assert.rejects(open(replacement), {code: NODES_SCHEMA_UNSUPPORTED, source: 'sqlite'});
      assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='idx_nodes_address'").get(),
        undefined, 'the missing index is not recreated on reopen');
      db.exec('CREATE INDEX idx_nodes_address ON nodes(status)');
      await assert.rejects(open(replacement), {code: NODES_SCHEMA_UNSUPPORTED, source: 'sqlite'});
      db.exec('DROP TABLE nodes');
      await assert.rejects(open(replacement), {code: NODES_SCHEMA_UNSUPPORTED, source: 'sqlite'});
      for (const key of ['primaryKey', 'unique']) {
        const withoutKey = {...NODES_SCHEMA, columns: NODES_SCHEMA.columns.map((col) =>
          col[key] ? {...col, [key]: false} : col)};
        db.exec(generateCreateTableSQL(withoutKey));
        for (const sql of generateCreateIndexSQL(NODES_SCHEMA)) db.exec(sql);
        await assert.rejects(open(replacement), {code: NODES_SCHEMA_UNSUPPORTED, source: 'sqlite'});
        db.exec('DROP TABLE nodes');
      }
    } finally {
      db.close();
    }
  } finally {
    for (const service of services) await service.shutdown();
    await rm(directory, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('every joiner registration row carries the declared host; without one ' +
  'no row is built', () => {
  const row = buildNodeRegistrationRow({nodeId: NODE_ID, nodeAddress: 'n:8080',
    hostId: HOST_A, nodeCapabilities: [], bootIncarnation: 3, now: 10});
  assert.equal(row[COLUMN.HOST_ID], HOST_A);
  assert.throws(() => buildNodeRegistrationRow({nodeId: NODE_ID,
    nodeAddress: 'n:8080', nodeCapabilities: [], bootIncarnation: 3, now: 10}),
  {code: NODE_HOST_ID_ERROR_CODE.REQUIRED});
});

test('a restart re-declares: the re-entry row carries this boot\'s host, ' +
  'over an older version\'s row and over a previously declared host', () => {
  const resolution = (authoritativeNodeRow, hostId) => ({
    durable: buildDurableRejoinMembershipResolution({authoritativeNodeRow,
      authoritativeEndpointRow: null, metaEndpointRows: [], now: 20,
      currentIncarnation: 4, hostId}),
    progress: buildExistingJoinAdmissionProgressResolution({authoritativeNodeRow,
      authoritativeEndpointRow: null, metaEndpointRows: [], now: 20,
      currentIncarnation: 4, hostId}),
  });
  const olderVersionRow = {[COLUMN.NODE_ID]: NODE_ID, [COLUMN.BOOT_INCARNATION]: 3};
  const declaredRow = {...olderVersionRow, [COLUMN.HOST_ID]: HOST_A};
  for (const [persisted, declared] of [[olderVersionRow, HOST_B],
    [declaredRow, HOST_B], [declaredRow, HOST_A]]) {
    const {durable, progress} = resolution(persisted, declared);
    assert.equal(durable.nodeRow[COLUMN.HOST_ID], declared);
    assert.equal(progress.nodeRow[COLUMN.HOST_ID], declared);
    assert.equal(durable.observedNodeRow, persisted);
  }
  // The persisted host is never kept for a boot that declares none.
  assert.throws(() => resolution(declaredRow, undefined),
    {code: NODE_HOST_ID_ERROR_CODE.REQUIRED});
});

test('the joiner registration owner refuses before any registration effect ' +
  'when the node declares no host', async () => {
  const effects = [];
  const owner = new NodeRegistrationOwner({
    // Declared absent: the refusal this witness proves.
    hostId: undefined,
    nodeId: NODE_ID,
    nodeAddress: 'n:8080',
    delegates: {
      getLogger: () => QUIET,
      getNow: () => () => 1,
      getSystemTableCache: () => ({applySystemTableChange() {
        effects.push('cache-seed');
      }}),
    },
  });
  owner.resolveExistingDurableRejoinMembership = async () => {
    effects.push('durable-rejoin-read');
    return null;
  };
  await assert.rejects(owner.registerNodeInCluster(),
    {code: NODE_HOST_ID_ERROR_CODE.REQUIRED});
  assert.deepEqual(effects, []);
});

test('the seed registration refuses before any wait or write when the node ' +
  'declares no host', async () => {
  const effects = [];
  const seed = Object.assign(
    Object.create(createBootstrapServiceControlPlaneRuntimeMethods()), {
      nodeId: NODE_ID,
      nodeAddress: 'seed:8080',
      logger: QUIET,
      heartbeatService: {sendHeartbeat: async () => effects.push('heartbeat')},
      seedCacheHydrationPhase: {waitForSystemServiceLeadersInCache:
        async () => effects.push('leader-wait')},
    });
  await assert.rejects(seed.registerSeedNodeWithControlPlane(),
    {code: NODE_HOST_ID_ERROR_CODE.REQUIRED});
  assert.deepEqual(effects, []);
});

test('entrypoint: NODE_HOST_ID / node.hostId is the one configured value', (t) => {
  t.after(() => ConfigurationManager.resetInstance());
  const resolveWith = (configuration, environment) => {
    ConfigurationManager.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize(configuration, {environment});
    return resolveRuntimeHostId(config);
  };
  assert.equal(resolveWith({node: {id: 'n'}}, {NODE_HOST_ID: HOST_A}), HOST_A);
  assert.equal(resolveWith({node: {id: 'n', hostId: HOST_B}}, {}), HOST_B);
  assert.throws(() => resolveWith({node: {id: 'n'}}, {}),
    {code: NODE_HOST_ID_ERROR_CODE.REQUIRED});
  assert.throws(() => resolveWith({node: {id: 'n'}}, {NODE_HOST_ID: 'a b'}),
    {code: NODE_HOST_ID_ERROR_CODE.INVALID});
});

test('entrypoint: a node without a declared host refuses to start, before ' +
  'it acquires its data directory', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'lagrange-host-identity-'));
  const reset = () => {
    resetProcessRuntimeClaimForTests();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    DataDirectoryManager.resetInstance();
  };
  reset();
  t.after(async () => {
    reset();
    await rm(root, {force: true, recursive: true});
  });
  await assert.rejects(startLagrangeRuntime({
    cliArgs: {dataDir: root, dryRun: true},
    configuration: {logging: {level: 'error'}, node: {id: 'host-refusal'}},
    environment: {NODE_ID: 'host-refusal'},
  }), {code: NODE_HOST_ID_ERROR_CODE.REQUIRED});
  const owner = acquireDataDirectoryProcessOwner(root);
  owner.release();
});
