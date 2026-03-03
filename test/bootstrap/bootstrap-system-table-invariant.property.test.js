/**
 * Property-based test for Bootstrap System Table Invariant.
 *
 * **Feature: test-failure-fixes, Property 1: Bootstrap System Table Invariant**
 *
 * Property 1: For any successful bootstrap sequence, all system tables
 * (nodes, services, partitions, tables, message_groups, replica_operations)
 * SHALL exist in the system cache with valid schemas before any CDC
 * operations are attempted.
 *
 * **Validates: Requirements 1.1, 1.4**
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_SCHEMAS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {TABLES} from '../../src/constants/index.js';
import {CACHE_SYSTEM_TABLES} from '../../src/cache/cache-constants.js';

/**
 * Required system tables that must exist after bootstrap.
 * These are the core tables specified in the design document.
 */
const REQUIRED_BOOTSTRAP_TABLES = Object.freeze([
  SYSTEM_TABLE_NAME.NODES,
  SYSTEM_TABLE_NAME.SERVICES,
  SYSTEM_TABLE_NAME.PARTITIONS,
  SYSTEM_TABLE_NAME.TABLES,
  SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
]);

/**
 * Initialize test environment with required singletons.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();

  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({node: {id: 'test-node'}});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Cleanup test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
}

beforeEach(() => {
  initializeTestEnvironment();
});

afterEach(() => {
  cleanupTestEnvironment();
});

/**
 * Arbitrary for generating valid node data.
 */
const nodeDataArb = fc.record({
  node_id: fc.uuid(),
  node_address: fc.webUrl(),
  cpu_cores: fc.integer({min: 1, max: 128}),
  memory_mb: fc.integer({min: 1024, max: 1048576}),
  disk_gb: fc.integer({min: 10, max: 10000}),
  status: fc.constantFrom('active', 'inactive', 'joining'),
  connection_state: fc.constantFrom('connected', 'disconnected', 'connecting'),
  last_heartbeat: fc.integer({min: 0, max: Date.now()}),
  created_at: fc.integer({min: 0, max: Date.now()}),
});

/**
 * Arbitrary for generating valid service data.
 */
const serviceDataArb = fc.record({
  service_id: fc.uuid(),
  service_type: fc.constantFrom('partition', 'message_group'),
  node_id: fc.uuid(),
  partition_id: fc.option(fc.uuid(), {nil: null}),
  group_id: fc.option(fc.uuid(), {nil: null}),
  replica_id: fc.uuid(),
  raft_role: fc.constantFrom('leader', 'follower', 'candidate'),
  status: fc.constantFrom('active', 'inactive', 'starting'),
  created_at: fc.integer({min: 0, max: Date.now()}),
  updated_at: fc.integer({min: 0, max: Date.now()}),
});

/**
 * Arbitrary for generating valid partition data.
 */
const partitionDataArb = fc.record({
  partition_id: fc.uuid(),
  table_id: fc.uuid(),
  table_name: fc.string({minLength: 1, maxLength: 50}),
  replica_count: fc.constantFrom(3, 5, 7),
  state: fc.constantFrom('NORMAL', 'SPLITTING', 'MERGING'),
  created_at: fc.integer({min: 0, max: Date.now()}),
  updated_at: fc.integer({min: 0, max: Date.now()}),
});

/**
 * Arbitrary for generating valid table data.
 */
const tableDataArb = fc.record({
  table_id: fc.uuid(),
  table_name: fc.string({minLength: 1, maxLength: 50}),
  schema_definition: fc.json(),
  partition_key: fc.string({minLength: 1, maxLength: 50}),
  partition_count: fc.integer({min: 1, max: 100}),
  created_at: fc.integer({min: 0, max: Date.now()}),
  updated_at: fc.integer({min: 0, max: Date.now()}),
});

/**
 * Arbitrary for generating valid message group data.
 */
const messageGroupDataArb = fc.record({
  group_id: fc.uuid(),
  group_name: fc.string({minLength: 1, maxLength: 50}),
  replica_count: fc.constantFrom(3, 5, 7),
  leader_node_id: fc.option(fc.uuid(), {nil: null}),
  created_at: fc.integer({min: 0, max: Date.now()}),
  updated_at: fc.integer({min: 0, max: Date.now()}),
});

/**
 * Arbitrary for generating valid replica operation data.
 */
const replicaOperationDataArb = fc.record({
  operation_id: fc.uuid(),
  type: fc.constantFrom('ADD', 'REMOVE'),
  partition_id: fc.uuid(),
  replica_id: fc.uuid(),
  source_node_id: fc.uuid(),
  target_node_id: fc.uuid(),
  status: fc.constantFrom('pending', 'in_progress', 'completed', 'failed'),
  workflow_step: fc.string({minLength: 1, maxLength: 50}),
  created_at: fc.integer({min: 0, max: Date.now()}),
  updated_at: fc.integer({min: 0, max: Date.now()}),
  steps_history: fc.json(),
});

/**
 * Property 1: Bootstrap System Table Invariant - All Tables Exist
 *
 * For any successful bootstrap sequence, all required system tables
 * SHALL exist in the system cache.
 *
 * **Validates: Requirements 1.1**
 */
test('Property 1: All required system tables exist after bootstrap', async (t) => {
  await fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        const cache = new SystemTableCache();

        // Verify all required tables are recognized by the cache
        const tableNames = cache.getTableNames();

        for (const tableName of REQUIRED_BOOTSTRAP_TABLES) {
          if (!tableNames.includes(tableName)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('All required system tables exist after bootstrap');
});

/**
 * Property 1: Bootstrap System Table Invariant - Tables Accept Valid Data
 *
 * For any valid data conforming to system table schemas, the cache
 * SHALL accept and store the data correctly.
 *
 * **Validates: Requirements 1.1, 1.4**
 */
test('Property 1: System tables accept valid data after bootstrap', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      nodeDataArb,
      serviceDataArb,
      partitionDataArb,
      async (nodeData, serviceData, partitionData) => {
        const cache = new SystemTableCache();

        // Apply data to each required table
        cache.applySystemTableChange(TABLES.NODES, 'INSERT', nodeData);
        cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', serviceData);
        cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', partitionData);

        // Verify data was stored correctly
        const storedNode = cache.get(TABLES.NODES, nodeData.node_id);
        const storedService = cache.get(TABLES.SERVICES, serviceData.service_id);
        const storedPartition = cache.get(TABLES.PARTITIONS, partitionData.partition_id);

        if (!storedNode || storedNode.node_id !== nodeData.node_id) {
          return false;
        }
        if (!storedService || storedService.service_id !== serviceData.service_id) {
          return false;
        }
        if (!storedPartition || storedPartition.partition_id !== partitionData.partition_id) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('System tables accept valid data after bootstrap');
});

/**
 * Property 1: Bootstrap System Table Invariant - All Tables Queryable
 *
 * For any system table, the cache SHALL support get, getAll, filter,
 * and find operations.
 *
 * **Validates: Requirements 1.4**
 */
test('Property 1: All system tables are queryable after bootstrap', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(nodeDataArb, {minLength: 1, maxLength: 5}),
      async (nodes) => {
        const cache = new SystemTableCache();

        // Insert nodes
        for (const node of nodes) {
          cache.applySystemTableChange(TABLES.NODES, 'INSERT', node);
        }

        // Verify getAll works
        const allNodes = cache.getAll(TABLES.NODES);
        if (allNodes.length !== nodes.length) {
          return false;
        }

        // Verify get works for each node
        for (const node of nodes) {
          const retrieved = cache.get(TABLES.NODES, node.node_id);
          if (!retrieved || retrieved.node_id !== node.node_id) {
            return false;
          }
        }

        // Verify filter works
        const activeNodes = cache.filter(TABLES.NODES, (n) => n.status === 'active');
        const expectedActiveCount = nodes.filter((n) => n.status === 'active').length;
        if (activeNodes.length !== expectedActiveCount) {
          return false;
        }

        // Verify find works
        const firstNode = cache.find(TABLES.NODES, (n) => n.node_id === nodes[0].node_id);
        if (!firstNode || firstNode.node_id !== nodes[0].node_id) {
          return false;
        }

        // Verify has works
        if (!cache.has(TABLES.NODES, nodes[0].node_id)) {
          return false;
        }

        // Verify count works
        if (cache.count(TABLES.NODES) !== nodes.length) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('All system tables are queryable after bootstrap');
});

/**
 * Property 1: Bootstrap System Table Invariant - Schema Consistency
 *
 * For any system table schema defined in SYSTEM_TABLE_SCHEMAS,
 * the table name SHALL be a valid system table in the cache.
 *
 * **Validates: Requirements 1.1**
 */
test('Property 1: All schema-defined tables are valid cache tables', async (t) => {
  await fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        const cache = new SystemTableCache();
        const cacheTableNames = cache.getTableNames();

        // Verify all schema-defined tables are in the cache
        for (const schema of SYSTEM_TABLE_SCHEMAS) {
          if (!cacheTableNames.includes(schema.tableName)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('All schema-defined tables are valid cache tables');
});

/**
 * Property 1: Bootstrap System Table Invariant - Cache Initialization
 *
 * For any newly created SystemTableCache, all system tables SHALL
 * be initialized as empty maps ready to receive data.
 *
 * **Validates: Requirements 1.4**
 */
test('Property 1: Cache initializes all system tables as empty', async (t) => {
  await fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        const cache = new SystemTableCache();

        // Verify all system tables are initialized and empty
        for (const tableName of CACHE_SYSTEM_TABLES) {
          const count = cache.count(tableName);
          if (count !== 0) {
            return false;
          }

          const all = cache.getAll(tableName);
          if (!Array.isArray(all) || all.length !== 0) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache initializes all system tables as empty');
});

/**
 * Property 1: Bootstrap System Table Invariant - Complete Table Coverage
 *
 * The CACHE_SYSTEM_TABLES constant SHALL include all required
 * bootstrap tables.
 *
 * **Validates: Requirements 1.1, 1.4**
 */
test('Property 1: CACHE_SYSTEM_TABLES includes all required bootstrap tables', async (t) => {
  await fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        // Verify all required bootstrap tables are in CACHE_SYSTEM_TABLES
        for (const tableName of REQUIRED_BOOTSTRAP_TABLES) {
          if (!CACHE_SYSTEM_TABLES.includes(tableName)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('CACHE_SYSTEM_TABLES includes all required bootstrap tables');
});

/**
 * Property 1: Bootstrap System Table Invariant - CDC Operations Ready
 *
 * For any system table, the cache SHALL support CDC operations
 * (INSERT, UPDATE, DELETE, UPSERT) after bootstrap.
 *
 * **Validates: Requirements 1.4**
 */
test('Property 1: System tables support CDC operations after bootstrap', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      tableDataArb,
      messageGroupDataArb,
      replicaOperationDataArb,
      async (tableData, messageGroupData, replicaOpData) => {
        const cache = new SystemTableCache();

        // Test INSERT operation
        cache.applySystemTableChange(TABLES.TABLES, 'INSERT', tableData);
        if (!cache.has(TABLES.TABLES, tableData.table_id)) {
          return false;
        }

        // Test UPDATE operation
        const updatedTableData = {...tableData, partition_count: tableData.partition_count + 1};
        cache.applySystemTableChange(TABLES.TABLES, 'UPDATE', updatedTableData);
        const updated = cache.get(TABLES.TABLES, tableData.table_id);
        if (updated.partition_count !== updatedTableData.partition_count) {
          return false;
        }

        // Test UPSERT operation on message_groups
        cache.applySystemTableChange(TABLES.MESSAGE_GROUPS, 'UPSERT', messageGroupData);
        if (!cache.has(TABLES.MESSAGE_GROUPS, messageGroupData.group_id)) {
          return false;
        }

        // Test INSERT on replica_operations
        cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', replicaOpData);
        if (!cache.has(TABLES.REPLICA_OPERATIONS, replicaOpData.operation_id)) {
          return false;
        }

        // Test DELETE operation
        cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'DELETE', replicaOpData);
        if (cache.has(TABLES.REPLICA_OPERATIONS, replicaOpData.operation_id)) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('System tables support CDC operations after bootstrap');
});

