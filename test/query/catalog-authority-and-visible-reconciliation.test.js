import test from 'node:test';
import assert from 'node:assert/strict';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS as CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  METADATA_AUTHORITY_REFRESH_OUTCOME,
} from '../../src/query/sql-query-engine-metadata-authority-refresh.js';
import {
  createCommittedServeEligibilityOwner,
} from '../control-plane/serve-eligibility-test-support.js';
import {
  createMockMessageRouter,
  mockPartitionData,
} from './sql-query-engine-test-support.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const TEST_NODE_ID = 'node-a';

function buildWitness(tableName, role = 'leader', observedAtMs = 2000) {
  const partitionId = INITIAL_PARTITION_IDS[tableName] || `${tableName}-p1`;
  return {
    state: 'observed',
    partitionId,
    role,
    servingNodeId: TEST_NODE_ID,
    servingReplicaId: `replica-${TEST_NODE_ID}`,
    observedAtMs,
  };
}

function buildServiceRow(partitionId) {
  return {
    service_id: partitionId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: TEST_NODE_ID,
    raft_role: 'leader',
    address: `${TEST_NODE_ID}/partition/${partitionId}`,
    status: 'active',
  };
}

test('R1 follower, partial, degraded or mismatched catalog evidence is refused as UNAVAILABLE and never evicts cached rows', async () => {
  const cache = new SystemTableCache();
  const tableRow = {
    table_id: 'orders',
    table_name: 'orders',
    primary_key: 'id',
    partition_key: 'id',
    partition_key_type: 'TEXT',
    active_partition_version: 1,
    created_at: 1000,
    updated_at: 1000,
  };
  const partitionRow = {
    partition_id: 'orders-p1',
    table_name: 'orders',
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: 'TEXT',
    partition_version: 1,
    state: 'NORMAL',
    leader_node_id: TEST_NODE_ID,
    created_at: 1000,
    updated_at: 1000,
  };
  cache.applySystemTableChange(TABLES.TABLES, CDC_OPERATIONS.INSERT, tableRow);
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATIONS.INSERT, partitionRow);

  let mockReadResult = null;
  const gateway = {
    async readAuthoritativeRows(tableName, _sql, _params, _options) {
      if (typeof mockReadResult === 'function') {
        return mockReadResult(tableName);
      }
      return mockReadResult;
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: TEST_NODE_ID,
    systemCache: cache,
    controlPlaneSystemTableGateway: gateway,
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
  });

  // 1a. Follower read: role !== 'leader'
  mockReadResult = (tableName) => ({
    success: true,
    rows: [],
    rowSetComplete: true,
    readAuthorityWitness: buildWitness(tableName, 'follower', 2000),
  });
  let outcome = await engine.refreshTableRoutingMetadataFromAuthority('orders');
  assert.equal(
    outcome.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
    'follower read must return UNAVAILABLE',
  );
  assert.ok(
    cache.find(TABLES.TABLES, (r) => r.table_name === 'orders'),
    'cached table must not be evicted on follower read',
  );
  assert.equal(
    cache.filter(TABLES.PARTITIONS, (r) => r.table_name === 'orders').length,
    1,
    'cached partitions must not be evicted on follower read',
  );

  // 1b. Missing witness
  mockReadResult = () => ({
    success: true,
    rows: [],
    rowSetComplete: true,
  });
  outcome = await engine.refreshTableRoutingMetadataFromAuthority('orders');
  assert.equal(
    outcome.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
    'missing witness must return UNAVAILABLE',
  );
  assert.ok(
    cache.find(TABLES.TABLES, (r) => r.table_name === 'orders'),
    'cached table must not be evicted on missing witness',
  );

  // 1c. Partial read
  mockReadResult = (tableName) => ({
    success: true,
    rows: [],
    partial: true,
    rowSetComplete: false,
    readAuthorityWitness: buildWitness(tableName, 'leader', 2000),
  });
  outcome = await engine.refreshTableRoutingMetadataFromAuthority('orders');
  assert.equal(
    outcome.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
    'partial read must return UNAVAILABLE',
  );
  assert.ok(
    cache.find(TABLES.TABLES, (r) => r.table_name === 'orders'),
    'cached table must not be evicted on partial read',
  );

  // 1d. Degraded read
  mockReadResult = (tableName) => ({
    success: true,
    rows: [],
    degraded: true,
    rowSetComplete: true,
    readAuthorityWitness: buildWitness(tableName, 'leader', 2000),
  });
  outcome = await engine.refreshTableRoutingMetadataFromAuthority('orders');
  assert.equal(
    outcome.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
    'degraded read must return UNAVAILABLE',
  );
  assert.ok(
    cache.find(TABLES.TABLES, (r) => r.table_name === 'orders'),
    'cached table must not be evicted on degraded read',
  );

  // 1e. Mismatched scope / table identity
  mockReadResult = (tableName) => ({
    success: true,
    rows: tableName === TABLES.TABLES ?
      [{table_id: 'other_table', table_name: 'other_table', primary_key: 'id'}] : [],
    rowSetComplete: true,
    readAuthorityWitness: buildWitness(tableName, 'leader', 2000),
  });
  outcome = await engine.refreshTableRoutingMetadataFromAuthority('orders');
  assert.equal(
    outcome.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
    'scope mismatch must return UNAVAILABLE',
  );
  assert.ok(
    cache.find(TABLES.TABLES, (r) => r.table_name === 'orders'),
    'cached table must not be evicted on scope mismatch',
  );
});

test('R2 genuine leader-witnessed catalog absence evicts cached rows and records absence tombstone', async () => {
  const cache = new SystemTableCache();
  const tableRow = {
    table_id: 'orders',
    table_name: 'orders',
    primary_key: 'id',
    partition_key: 'id',
    partition_key_type: 'TEXT',
    active_partition_version: 1,
    created_at: 1000,
    updated_at: 1000,
  };
  const partitionRow = {
    partition_id: 'orders-p1',
    table_name: 'orders',
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: 'TEXT',
    partition_version: 1,
    state: 'NORMAL',
    leader_node_id: TEST_NODE_ID,
    created_at: 1000,
    updated_at: 1000,
  };
  cache.applySystemTableChange(TABLES.TABLES, CDC_OPERATIONS.INSERT, tableRow);
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATIONS.INSERT, partitionRow);

  const gateway = {
    async readAuthoritativeRows(tableName) {
      return {
        success: true,
        rows: [],
        rowSetComplete: true,
        readAuthorityWitness: buildWitness(tableName, 'leader', 2000),
      };
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: TEST_NODE_ID,
    systemCache: cache,
    controlPlaneSystemTableGateway: gateway,
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
  });

  const outcome = await engine.refreshTableRoutingMetadataFromAuthority('orders');
  assert.equal(
    outcome.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.ABSENT,
    'complete leader-witnessed empty read must return ABSENT',
  );
  assert.equal(
    cache.find(TABLES.TABLES, (r) => r.table_name === 'orders'),
    undefined,
    'cached table must be evicted on authoritative absence',
  );
  assert.equal(
    cache.filter(TABLES.PARTITIONS, (r) => r.table_name === 'orders').length,
    0,
    'cached partitions must be evicted on authoritative absence',
  );

  const tombstone = cache.tombstoneStore.tables.get(TABLES.TABLES)?.get('orders');
  assert.ok(tombstone, 'absence tombstone must be recorded');
  assert.equal(tombstone.authoritativeAbsence, true, 'tombstone must be authoritativeAbsence');
  assert.equal(
    tombstone.authoritativeObservedAtMs,
    2000,
    'tombstone must record authoritativeObservedAtMs',
  );
});

test('R3 causally newer authoritative observation restores metadata without waiting for tombstone TTL', async () => {
  const cache = new SystemTableCache();
  const initialTableRow = {
    table_id: 'orders',
    table_name: 'orders',
    primary_key: 'id',
    partition_key: 'id',
    partition_key_type: 'TEXT',
    active_partition_version: 1,
    created_at: 1000,
    updated_at: 1000,
  };
  const initialPartitionRow = {
    partition_id: 'orders-p1',
    table_name: 'orders',
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: 'TEXT',
    partition_version: 1,
    state: 'NORMAL',
    leader_node_id: TEST_NODE_ID,
    created_at: 1000,
    updated_at: 1000,
  };
  cache.applySystemTableChange(TABLES.TABLES, CDC_OPERATIONS.INSERT, initialTableRow);
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATIONS.INSERT, initialPartitionRow);

  // Step 1: Evict absent table via authoritative absence at 2000ms
  let currentReadMode = 'absent';
  const recreatedTableRow = {
    table_id: 'orders',
    table_name: 'orders',
    primary_key: 'id',
    partition_key: 'id',
    partition_key_type: 'TEXT',
    active_partition_version: 1,
    created_at: 2200,
    updated_at: 2200,
  };
  const recreatedPartitionRow = {
    partition_id: 'orders-p1',
    table_name: 'orders',
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: 'TEXT',
    partition_version: 1,
    state: 'NORMAL',
    leader_node_id: TEST_NODE_ID,
    created_at: 2200,
    updated_at: 2200,
  };
  const serviceRow = buildServiceRow('orders-p1');

  const gateway = {
    async readAuthoritativeRows(tableName) {
      if (currentReadMode === 'absent') {
        return {
          success: true,
          rows: [],
          rowSetComplete: true,
          readAuthorityWitness: buildWitness(tableName, 'leader', 2000),
        };
      }
      if (tableName === TABLES.TABLES) {
        return {
          success: true,
          rows: [recreatedTableRow],
          rowSetComplete: true,
          readAuthorityWitness: buildWitness(tableName, 'leader', 2500),
        };
      }
      if (tableName === TABLES.PARTITIONS) {
        return {
          success: true,
          rows: [recreatedPartitionRow],
          rowSetComplete: true,
          readAuthorityWitness: buildWitness(tableName, 'leader', 2500),
        };
      }
      if (tableName === TABLES.SERVICES) {
        return {
          success: true,
          rows: [serviceRow],
          rowSetComplete: true,
          readAuthorityWitness: buildWitness(tableName, 'leader', 2500),
        };
      }
      return {success: true, rows: []};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: TEST_NODE_ID,
    systemCache: cache,
    controlPlaneSystemTableGateway: gateway,
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
  });

  // Execute authoritative eviction
  const evictOutcome = await engine.refreshTableRoutingMetadataFromAuthority('orders');
  assert.equal(evictOutcome.outcome, METADATA_AUTHORITY_REFRESH_OUTCOME.ABSENT);

  // Step 2: Recreate table at 2500ms
  currentReadMode = 'recreated';
  const outcome = await engine.refreshTableRoutingMetadataFromAuthority('orders');
  assert.equal(
    outcome.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.FOUND,
    'causally newer authoritative observation must return FOUND',
  );
  assert.equal(outcome.applied, true, 'metadata must be applied');
  assert.ok(
    engine.getTableInfo('orders'),
    'recreated table metadata must be restored in cache',
  );
  assert.equal(
    cache.tombstoneStore.tables.get(TABLES.TABLES)?.has('orders'),
    false,
    'absence tombstone must be superseded and cleared without waiting for 30s TTL',
  );
});

test('R4 application success describes verified visible state and enables working query routing', async () => {
  mockPartitionData.set('orders-p1', [
    {id: 'ord-101', total: 50},
  ]);

  // 4a. If cache visibility fails (rows returned from gateway but fenced/unapplied in cache), return UNAVAILABLE
  const fencedCache = new SystemTableCache();
  fencedCache.tombstoneStore.record(TABLES.TABLES, 'orders', {
    table_id: 'orders',
    table_name: 'orders',
    created_at: 1000,
    updated_at: 1000,
  }, {
    authoritativeAbsence: true,
    authoritativeObservedAtMs: 3000,
  });

  const gatewayWithRows = {
    async readAuthoritativeRows(tableName) {
      if (tableName === TABLES.TABLES) {
        return {
          success: true,
          rows: [{
            table_id: 'orders',
            table_name: 'orders',
            primary_key: 'id',
            partition_key: 'id',
            partition_key_type: 'TEXT',
            active_partition_version: 1,
            created_at: 1000,
            updated_at: 1000,
          }],
          rowSetComplete: true,
          readAuthorityWitness: buildWitness(tableName, 'leader', 2000),
        };
      }
      if (tableName === TABLES.PARTITIONS) {
        return {
          success: true,
          rows: [{
            partition_id: 'orders-p1',
            table_name: 'orders',
            partition_key_start: null,
            partition_key_end: null,
            partition_key_type: 'TEXT',
            partition_version: 1,
            state: 'NORMAL',
            leader_node_id: TEST_NODE_ID,
            created_at: 1000,
            updated_at: 1000,
          }],
          rowSetComplete: true,
          readAuthorityWitness: buildWitness(tableName, 'leader', 2000),
        };
      }
      return {
        success: true,
        rows: [buildServiceRow('orders-p1')],
        rowSetComplete: true,
        readAuthorityWitness: buildWitness(tableName, 'leader', 2000),
      };
    },
  };

  const engineFencedCache = new SQLQueryEngine({
    nodeId: TEST_NODE_ID,
    systemCache: fencedCache,
    controlPlaneSystemTableGateway: gatewayWithRows,
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
  });

  const failureOutcome = await engineFencedCache.refreshTableRoutingMetadataFromAuthority('orders');
  assert.equal(
    failureOutcome.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE,
    'unapplied/fenced metadata must return UNAVAILABLE, never FOUND',
  );
  assert.equal(
    engineFencedCache.getTableInfo('orders'),
    null,
    'fenced table must not be visible in engine cache',
  );

  // 4b. When properly visible, query routing works end-to-end
  const cleanCache = new SystemTableCache();
  const goodGateway = {
    async readAuthoritativeRows(tableName) {
      if (tableName === TABLES.TABLES) {
        return {
          success: true,
          rows: [{
            table_id: 'orders',
            table_name: 'orders',
            primary_key: 'id',
            partition_key: 'id',
            partition_key_type: 'TEXT',
            active_partition_version: 1,
            created_at: 2000,
            updated_at: 2000,
          }],
          rowSetComplete: true,
          readAuthorityWitness: buildWitness(tableName, 'leader', 2000),
        };
      }
      if (tableName === TABLES.PARTITIONS) {
        return {
          success: true,
          rows: [{
            partition_id: 'orders-p1',
            table_name: 'orders',
            partition_key_start: null,
            partition_key_end: null,
            partition_key_type: 'TEXT',
            partition_version: 1,
            state: 'NORMAL',
            leader_node_id: TEST_NODE_ID,
            created_at: 2000,
            updated_at: 2000,
          }],
          rowSetComplete: true,
          readAuthorityWitness: buildWitness(tableName, 'leader', 2000),
        };
      }
      if (tableName === TABLES.SERVICES) {
        return {
          success: true,
          rows: [buildServiceRow('orders-p1')],
          rowSetComplete: true,
          readAuthorityWitness: buildWitness(tableName, 'leader', 2000),
        };
      }
      return {success: true, rows: []};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: TEST_NODE_ID,
    systemCache: cleanCache,
    controlPlaneSystemTableGateway: goodGateway,
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
  });

  const queryResult = await engine.executeQuery(
    'SELECT * FROM orders WHERE id = ?',
    ['ord-101'],
  );
  assert.equal(queryResult.success, true, 'query execution must succeed using refreshed metadata');
  assert.equal(queryResult.rows.length, 1, 'query should return matching row');
  assert.equal(queryResult.rows[0].id, 'ord-101', 'query row content matches');
});

test('R5 causally older replay is rejected and cannot resurrect deleted rows', async () => {
  const cache = new SystemTableCache();
  // Record authoritative absence at 2000ms
  cache.tombstoneStore.record(TABLES.TABLES, 'orders', {
    table_name: 'orders',
    created_at: 1000,
    updated_at: 1000,
  }, {
    authoritativeAbsence: true,
    authoritativeObservedAtMs: 2000,
  });

  // Attempt stale replay: row updated at 1000ms <= 2000ms tombstone
  cache.applySystemTableChange(TABLES.TABLES, CDC_OPERATIONS.UPSERT, {
    table_id: 'orders',
    table_name: 'orders',
    primary_key: 'id',
    created_at: 1000,
    updated_at: 1000,
  });

  assert.equal(
    cache.find(TABLES.TABLES, (r) => r.table_name === 'orders'),
    undefined,
    'stale replay must be fenced and not resurrect table row',
  );
  assert.ok(
    cache.tombstoneStore.tables.get(TABLES.TABLES)?.has('orders'),
    'absence tombstone must be retained across stale replay',
  );
});
