/**
 * WP-D witnesses (owner decision D3, 2026-11-17): the node host identity is
 * a required boot-time value, written into NODES.host_id by every NODES
 * registration, read through one typed reader, and added in place to an
 * existing NODES table. A row an older version wrote reads HOST_UNDECLARED;
 * a host is never derived from the node id.
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
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  PARTITION_TABLE_OBSERVATION,
  createPartitionServiceTable,
  partitionServiceTableSql,
  readPartitionServiceTableSchemaIn,
} from '../../src/partition/partition-service-table-bootstrap.js';
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

test('apply-time column add: an existing NODES table without host_id gains ' +
  'it in place, its rows read HOST_UNDECLARED, and its DDL equals a fresh ' +
  'table\'s', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  // The table as the previous version created it: every column but host_id.
  const previousSchema = {...NODES_SCHEMA, columns: NODES_SCHEMA.columns
    .filter((column) => column.name !== COLUMN.HOST_ID)};
  assert.equal(previousSchema.columns.length, NODES_SCHEMA.columns.length - 1);
  db.exec(partitionServiceTableSql(SYSTEM_TABLE_NAME.NODES, previousSchema));
  db.prepare('INSERT INTO nodes (node_id, node_address, cpu_cores, memory_mb, ' +
    'disk_gb, last_heartbeat, created_at) VALUES (?, ?, 1, 1, 1, 1, 1)')
    .run(NODE_ID, 'old:8080');

  const added = [];
  const service = nodesService(db);
  service.logger = {...QUIET, info: (message, fields) => {
    if (fields?.columnName) added.push(fields.columnName);
  }};
  createPartitionServiceTable(service);
  assert.deepEqual(added, [COLUMN.HOST_ID], 'host_id is added exactly once');
  const old = db.prepare('SELECT * FROM nodes WHERE node_id = ?').get(NODE_ID);
  assert.equal(old[COLUMN.HOST_ID], null);
  assert.equal(readNodeHostIdentity(old).state,
    NODE_HOST_IDENTITY_STATE.HOST_UNDECLARED);

  const upgraded = readPartitionServiceTableSchemaIn(db, NODES_SCHEMA);
  assert.equal(upgraded.state, PARTITION_TABLE_OBSERVATION.COMPLETE,
    'the upgraded table is the schema\'s own table');
  const fresh = new Database(':memory:');
  t.after(() => fresh.close());
  createPartitionServiceTable(nodesService(fresh));
  const ddl = (handle) => handle.prepare(
    'SELECT sql FROM sqlite_schema WHERE type = ? AND name = ?')
    .get('table', SYSTEM_TABLE_NAME.NODES).sql;
  assert.equal(ddl(db), ddl(fresh));

  // A declared registration lands in the added column.
  db.prepare('UPDATE nodes SET host_id = ? WHERE node_id = ?').run(HOST_A, NODE_ID);
  assert.equal(readNodeHostIdentity(db.prepare('SELECT * FROM nodes').get())
    .hostId, HOST_A);
  added.length = 0;
  createPartitionServiceTable(service);
  assert.deepEqual(added, [], 'a table that has host_id is left as it is');
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
