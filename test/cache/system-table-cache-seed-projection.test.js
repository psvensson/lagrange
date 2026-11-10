/**
 * Seeded partial rows (quest system-table-row-decoders, lead decision
 * 2026-11-09): the cache stores exactly what was written; a seeder's partial
 * row carries its declared seed projection as a cache-local field; the
 * decoder gives a column outside it the named state ROW_NOT_OBSERVED,
 * distinct from ROW_ABSENT (a stored NULL); an unmarked row lacking a column
 * is still refused; the cache drops the marker exactly when the row holds
 * every stored column.
 */
import Database from 'better-sqlite3';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {SystemTableCache, CDC_OPERATIONS} from '../../src/cache/system-table-cache.js';
import {
  SYSTEM_TABLE_CACHE_MUTATION_MODE,
  SYSTEM_TABLE_CACHE_OBSERVED_COLUMNS_PROJECTION_NAME,
  SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD,
} from '../../src/cache/cache-constants.js';
import {
  NODES_SCHEMA,
  SYSTEM_TABLE_SCHEMAS,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  decodeNodesRow,
  defineNodesProjection,
} from '../../src/control-plane/nodes-row-decoder.js';
import {
  decodeServicesRowColumn,
  defineServicesProjection,
} from '../../src/control-plane/services-row-decoder.js';
import {
  ROW_ABSENT,
  ROW_NOT_OBSERVED,
  SYSTEM_TABLE_ROW_DECODE_REFUSAL,
  SystemTableRowDecodeError,
  seedProjectionRow,
} from '../../src/control-plane/system-table-row-decoding.js';
import {
  nodesRow,
  sqlInsertedSystemTableRow,
  systemTableRow,
} from '../test-helpers/system-table-row-fixture.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

const HINT_PROJECTION = defineNodesProjection('test_peer_hint_seed',
  ['node_id', 'node_address', 'status', 'connection_state']);
const SERVICES_SEED_PROJECTION = defineServicesProjection('test_services_seed',
  ['service_id', 'service_type', 'partition_id', 'node_id', 'status', 'address',
    'created_at', 'updated_at']);

function hintRow(nodeId = 'node-peer') {
  return seedProjectionRow(HINT_PROJECTION, {
    node_id: nodeId, node_address: 'ws://10.0.0.9:8080', status: 'joining',
    connection_state: 'connecting',
  });
}

function refusalReason(fn) {
  try {
    fn();
  } catch (error) {
    if (error instanceof SystemTableRowDecodeError) return error.reason;
    throw error;
  }
  return null;
}

test('a seeded row decodes its columns and NOT_OBSERVED elsewhere, distinct from ABSENT',
  async (t) => {
    const decoded = decodeNodesRow(hintRow());
    t.equal(decoded.nodeId, 'node-peer');
    t.equal(decoded.status, 'joining');
    t.equal(decoded.connectionState, 'connecting');
    for (const field of ['readyLeaseExpiresAt', 'lastHeartbeat', 'bootIncarnation',
      'cpuCores', 'createdAt', 'latencyGroupId']) {
      t.equal(decoded[field], ROW_NOT_OBSERVED, `${field} was never observed`);
    }
    const stored = decodeNodesRow(nodesRow({node_id: 'node-peer', ready_lease_expires_at: null}));
    t.equal(stored.readyLeaseExpiresAt, ROW_ABSENT, 'a stored NULL decodes to ROW_ABSENT');
    t.not(ROW_NOT_OBSERVED, ROW_ABSENT, 'the two named states are distinct');
    t.equal(decodeServicesRowColumn(seedProjectionRow(SERVICES_SEED_PROJECTION,
      systemTableRowSubset(TABLES.SERVICES, SERVICES_SEED_PROJECTION.columns)), 'raft_role'),
    ROW_NOT_OBSERVED, 'the one-column decoder applies the same rule');
  });

function systemTableRowSubset(tableName, columns) {
  const full = systemTableRow(tableName);
  return Object.fromEntries(columns.map((column) => [column, full[column]]));
}

test('a seeded row decodes every column it carries beyond its projection', async (t) => {
  const row = {...hintRow(), last_heartbeat: 42, ready_lease_expires_at: null};
  const decoded = decodeNodesRow(row);
  t.equal(decoded.lastHeartbeat, 42, 'a later observed column decodes');
  t.equal(decoded.readyLeaseExpiresAt, ROW_ABSENT, 'an observed NULL is ABSENT');
  t.equal(decoded.cpuCores, ROW_NOT_OBSERVED);
});

test('refusals: unmarked partial row, a projection column missing, a malformed marker',
  async (t) => {
    const {[SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD]: marker, ...unmarked} = hintRow();
    t.equal(refusalReason(() => decodeNodesRow(unmarked)),
      SYSTEM_TABLE_ROW_DECODE_REFUSAL.MISSING_COLUMN, 'an unmarked partial row is refused');
    const withoutStatus = {...hintRow()};
    delete withoutStatus.status;
    t.equal(refusalReason(() => decodeNodesRow(withoutStatus)),
      SYSTEM_TABLE_ROW_DECODE_REFUSAL.MISSING_COLUMN, 'a seeded column must be present');
    for (const bad of ['local', null, {...marker, table: TABLES.SERVICES},
      {...marker, columns: ['node_id', 'nodeId']}, {...marker, name: 7}]) {
      t.equal(refusalReason(() => decodeNodesRow({...unmarked,
        [SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD]: bad})),
      SYSTEM_TABLE_ROW_DECODE_REFUSAL.MALFORMED_SEED_PROJECTION, `marker ${JSON.stringify(bad)}`);
    }
    t.equal(refusalReason(() => decodeNodesRow({...hintRow(), nodeAlias: 'x'})),
      SYSTEM_TABLE_ROW_DECODE_REFUSAL.UNEXPECTED_COLUMN, 'a non-column key is still refused');
  });

test('seedProjectionRow holds the seeder to its declared columns', async (t) => {
  t.throws(() => seedProjectionRow(HINT_PROJECTION, {node_id: 'n', node_address: 'a',
    status: 'joining'}), /lacks connection_state/u);
  t.throws(() => seedProjectionRow(HINT_PROJECTION, {node_id: 'n', node_address: 'a',
    status: 'joining', connection_state: 'connecting', last_heartbeat: 1}),
  /last_heartbeat is outside/u);
  const marked = seedProjectionRow(HINT_PROJECTION, {node_id: 'n', node_address: 'a',
    status: 'joining', connection_state: 'connecting', updated_at_hlc: 'h'});
  t.same(marked[SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD], {table: TABLES.NODES,
    name: 'test_peer_hint_seed', columns: HINT_PROJECTION.columns},
  'cache-local provenance may ride along; the marker names the projection');
});

test('the cache stores a seeded row exactly as written (no completion)', async (t) => {
  for (const operation of [CDC_OPERATIONS.INSERT, CDC_OPERATIONS.UPSERT,
    CDC_OPERATIONS.UPDATE]) {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.NODES, operation, hintRow());
    t.same(cache.get(TABLES.NODES, 'node-peer'), hintRow(), `${operation}: stored as written`);
    const unmarked = {node_id: 'node-x', node_address: 'ws://x'};
    cache.applySystemTableChange(TABLES.NODES, operation, unmarked);
    t.same(cache.get(TABLES.NODES, 'node-x'), {...unmarked,
      [SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD]: {table: TABLES.NODES,
        name: SYSTEM_TABLE_CACHE_OBSERVED_COLUMNS_PROJECTION_NAME,
        columns: ['node_id', 'node_address']}},
    `${operation}: an unmarked partial row is stored as written, never completed, and ` +
      'marked with its observed columns (RD-1/RD-2 ruling)');
  }
});

test('the marker goes away exactly when the row holds every stored column', async (t) => {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPSERT, hintRow());
  const full = nodesRow({node_id: 'node-peer', status: 'active', ready_lease_expires_at: null});
  const {latency_group_id: _omitted, ...almostFull} = full;
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPSERT, almostFull);
  const held = cache.get(TABLES.NODES, 'node-peer');
  t.ok(Object.hasOwn(held, SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD),
    'one column still unobserved: the marker stays');
  t.equal(decodeNodesRow(held).latencyGroupId, ROW_NOT_OBSERVED);
  t.equal(decodeNodesRow(held).readyLeaseExpiresAt, ROW_ABSENT);
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPDATE,
    {node_id: 'node-peer', latency_group_id: null});
  const complete = cache.get(TABLES.NODES, 'node-peer');
  t.notOk(Object.hasOwn(complete, SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD),
    'every column present: the marker is gone');
  t.same(complete, full, 'the held row is the full row');

  const inserted = new SystemTableCache();
  inserted.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPSERT, hintRow());
  inserted.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.INSERT, full);
  t.same(inserted.get(TABLES.NODES, 'node-peer'), full, 'a full INSERT replaces the seed');

  const authoritative = new SystemTableCache();
  authoritative.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPSERT, hintRow());
  authoritative.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPSERT, full, {
    mutationMode: SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_RECONCILIATION,
  });
  t.notOk(Object.hasOwn(authoritative.get(TABLES.NODES, 'node-peer'),
    SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD),
  'an authoritative replacement keeps local fields, but the observed row drops the marker');
});

// The fixture's SQL-insert emulation (test SQL fakes) stores what SQLite stores.
test('sqlInsertedSystemTableRow equals the row SQLite stores, for every system table',
  async (t) => {
    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const full = systemTableRow(schema.tableName);
      const values = {};
      for (const column of schema.columns) {
        const required = (column.notNull === true || column.primaryKey === true ||
          (schema.primaryKey || []).includes(column.name)) && column.defaultValue === undefined;
        if (required) values[column.name] = full[column.name];
      }
      const db = new Database(':memory:');
      try {
        db.exec(generateCreateTableSQL(schema));
        const columns = Object.keys(values);
        db.prepare(`INSERT INTO ${schema.tableName} (${columns.join(', ')}) ` +
          `VALUES (${columns.map(() => '?').join(', ')})`)
          .run(...columns.map((column) => values[column]));
        t.same(sqlInsertedSystemTableRow(schema.tableName, values),
          db.prepare(`SELECT * FROM ${schema.tableName}`).get(), schema.tableName);
      } finally {
        db.close();
      }
    }
    t.throws(() => sqlInsertedSystemTableRow(NODES_SCHEMA.tableName, {node_id: 'n'}),
      /NOT NULL constraint failed: nodes\.node_address/u);
  });
