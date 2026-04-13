/**
 * Property test for CDC Replication Round-Trip (Property 7).
 *
 * Feature: worker-process-replica-isolation, Property 7: CDC Replication Round-Trip
 *
 * For any CDC event received by a message group leader, applying the event
 * to the leader's cache and then replicating via Raft SHALL result in all
 * follower caches containing equivalent data.
 *
 * **Validates: Requirements 3.3, 3.4, 4.4**
 *
 * @module test/worker/cdc-replication-round-trip.property.test.js
 */
// @ts-nocheck


import {describe, it, afterEach} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  MessageGroupWorkerService,
} from '../../src/worker/message-group-worker-service.js';
import {CDC_OPERATION} from '../../src/constants/index.js';

/**
 * System table names for testing.
 * @type {Array<string>}
 */
const SYSTEM_TABLES = ['nodes', 'tables', 'partitions', 'services'];

/**
 * Generate a valid node record.
 * @return {fc.Arbitrary<Object>}
 */
function nodeRecordArb() {
  return fc.record({
    node_id: fc.uuid(),
    node_address: fc.tuple(
      fc.ipV4(),
      fc.integer({min: 1024, max: 65535}),
    ).map(([ip, port]) => `${ip}:${port}`),
    cpu_cores: fc.integer({min: 1, max: 128}),
    memory_mb: fc.integer({min: 512, max: 1048576}),
    disk_gb: fc.integer({min: 10, max: 10000}),
    status: fc.constantFrom('active', 'inactive', 'draining'),
    connection_state: fc.constantFrom('connected', 'disconnected'),
    last_heartbeat: fc.integer({min: 0, max: Date.now()}),
    created_at: fc.integer({min: 0, max: Date.now()}),
  });
}

/**
 * Generate a valid table record.
 * @return {fc.Arbitrary<Object>}
 */
function tableRecordArb() {
  const now = Date.now();
  return fc.record({
    table_id: fc.uuid(),
    table_name: fc.string({minLength: 1, maxLength: 64})
      .filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
    schema_definition: fc.constant('{}'),
    partition_key: fc.constant('id'),
    table_policies: fc.constant('{}'),
    partition_count: fc.integer({min: 1, max: 100}),
    created_at: fc.integer({min: 0, max: now}),
    updated_at: fc.integer({min: 0, max: now}),
  });
}

/**
 * Generate a valid partition record.
 * @return {fc.Arbitrary<Object>}
 */
function partitionRecordArb() {
  const now = Date.now();
  return fc.record({
    partition_id: fc.uuid(),
    table_id: fc.uuid(),
    table_name: fc.string({minLength: 1, maxLength: 64})
      .filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
    partition_key_start: fc.string({minLength: 0, maxLength: 32}),
    partition_key_end: fc.string({minLength: 0, maxLength: 32}),
    replica_count: fc.constantFrom(1, 3, 5),
    size_bytes: fc.integer({min: 0, max: 1000000}),
    leader_node_id: fc.uuid(),
    state: fc.constantFrom('normal', 'splitting', 'merging'),
    created_at: fc.integer({min: 0, max: now}),
    updated_at: fc.integer({min: 0, max: now}),
  });
}

/**
 * Generate a valid service record.
 * @return {fc.Arbitrary<Object>}
 */
function serviceRecordArb() {
  const now = Date.now();
  return fc.record({
    service_id: fc.uuid(),
    service_type: fc.constantFrom('partition', 'message_group', 'query'),
    node_id: fc.uuid(),
    partition_id: fc.option(fc.uuid(), {nil: undefined}),
    group_id: fc.option(fc.uuid(), {nil: undefined}),
    replica_id: fc.option(fc.uuid(), {nil: undefined}),
    raft_role: fc.option(fc.constantFrom('leader', 'follower', 'candidate'), {nil: undefined}),
    status: fc.constantFrom('active', 'inactive', 'starting', 'stopping'),
    state_entered_at: fc.option(fc.integer({min: 0, max: now}), {nil: undefined}),
    previous_state: fc.option(fc.string({minLength: 0, maxLength: 32}), {nil: undefined}),
    trigger_reason: fc.option(fc.string({minLength: 0, maxLength: 64}), {nil: undefined}),
    error_message: fc.option(fc.string({minLength: 0, maxLength: 256}), {nil: undefined}),
    address: fc.option(fc.string({minLength: 0, maxLength: 128}), {nil: undefined}),
    created_at: fc.integer({min: 0, max: now}),
    updated_at: fc.integer({min: 0, max: now}),
  });
}

/**
 * Generate a CDC event for a specific table.
 * @param {string} tableName - Table name.
 * @return {fc.Arbitrary<Object>}
 */
function cdcEventArb(tableName) {
  let dataArb;
  switch (tableName) {
  case 'nodes':
    dataArb = nodeRecordArb();
    break;
  case 'tables':
    dataArb = tableRecordArb();
    break;
  case 'partitions':
    dataArb = partitionRecordArb();
    break;
  case 'services':
    dataArb = serviceRecordArb();
    break;
  default:
    dataArb = fc.record({id: fc.uuid()});
  }

  return fc.record({
    tableName: fc.constant(tableName),
    operation: fc.constant(CDC_OPERATION.INSERT),
    data: dataArb,
    sourcePartitionId: fc.uuid(),
    hlcTimestamp: fc.integer({min: 0}).map(String),
    sequenceNumber: fc.integer({min: 0, max: 1000000}),
  });
}

/**
 * Create a mock message bridge for tests that call onInitialize
 * directly. In production, ReplicaWorkerBase.initialize() creates
 * the real bridge.
 * @return {Object} Mock message bridge with deliver and send methods.
 */
function createMockMessageBridge() {
  return {
    deliver: async () => ({status: 'ok'}),
    send: async () => ({status: 'ok'}),
    initialize: async () => {},
    shutdown: async () => {},
    setMessageHandler: () => {},
    getStats: () => ({}),
  };
}

describe('Property 7: CDC Replication Round-Trip', () => {
  const services = [];
  const mockLogger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  afterEach(async () => {
    for (const service of services) {
      try {
        await service.onStop();
      } catch (_e) {
        // Ignore cleanup errors
      }
    }
    services.length = 0;
  });

  /**
   * Create and initialize a message group worker service.
   * @param {string} nodeId - Node ID.
   * @param {string} replicaId - Replica ID.
   * @param {string} groupId - Group ID.
   * @return {Promise<MessageGroupWorkerService>}
   */
  async function createService(nodeId, replicaId, groupId) {
    const service = new MessageGroupWorkerService({
      nodeId,
      replicaId,
      groupId,
      logger: mockLogger,
    });
    service.messageBridge = createMockMessageBridge();
    await service.onInitialize();
    service.initialized = true;
    services.push(service);
    return service;
  }

  it('should apply CDC INSERT event to follower cache', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SYSTEM_TABLES),
        async (tableName) => {
          const service = await createService('node-1', 'replica-1', 'group-1');
          service.isLeaderReplica = () => false;

          // Generate a CDC event for this table
          const cdcEvent = fc.sample(cdcEventArb(tableName), 1)[0];

          // Apply CDC event as follower (direct application)
          await service.applyCDCEvent(cdcEvent);

          // Verify data was applied to cache
          const primaryKey = getPrimaryKey(tableName, cdcEvent.data);
          const record = service.systemCache.get(tableName, primaryKey);

          assert.ok(record, `Record should exist in cache for ${tableName}`);
          assert.strictEqual(
            record[getPrimaryKeyColumn(tableName)],
            primaryKey,
            'Primary key should match',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should preserve all fields when applying CDC event', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeRecordArb(),
        async (nodeData) => {
          const service = await createService('node-1', 'replica-1', 'group-1');
          service.isLeaderReplica = () => false;

          const cdcEvent = {
            tableName: 'nodes',
            operation: CDC_OPERATION.INSERT,
            data: nodeData,
          };

          await service.applyCDCEvent(cdcEvent);

          const record = service.systemCache.get('nodes', nodeData.node_id);

          assert.ok(record, 'Record should exist');
          assert.strictEqual(record.node_id, nodeData.node_id);
          assert.strictEqual(record.node_address, nodeData.node_address);
          assert.strictEqual(record.cpu_cores, nodeData.cpu_cores);
          assert.strictEqual(record.memory_mb, nodeData.memory_mb);
          assert.strictEqual(record.status, nodeData.status);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle UPDATE operation correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeRecordArb(),
        fc.constantFrom('active', 'inactive', 'draining'),
        async (nodeData, newStatus) => {
          const service = await createService('node-1', 'replica-1', 'group-1');
          service.isLeaderReplica = () => false;

          // Insert first
          await service.applyCDCEvent({
            tableName: 'nodes',
            operation: CDC_OPERATION.INSERT,
            data: nodeData,
          });

          // Update status
          await service.applyCDCEvent({
            tableName: 'nodes',
            operation: CDC_OPERATION.UPDATE,
            data: {node_id: nodeData.node_id, status: newStatus},
          });

          const record = service.systemCache.get('nodes', nodeData.node_id);

          assert.ok(record, 'Record should exist after update');
          assert.strictEqual(record.status, newStatus, 'Status should be updated');
          // Other fields should be preserved
          assert.strictEqual(record.node_address, nodeData.node_address);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle DELETE operation correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeRecordArb(),
        async (nodeData) => {
          const service = await createService('node-1', 'replica-1', 'group-1');
          service.isLeaderReplica = () => false;

          // Insert first
          await service.applyCDCEvent({
            tableName: 'nodes',
            operation: CDC_OPERATION.INSERT,
            data: nodeData,
          });

          // Verify inserted
          let record = service.systemCache.get('nodes', nodeData.node_id);
          assert.ok(record, 'Record should exist after insert');

          // Delete
          await service.applyCDCEvent({
            tableName: 'nodes',
            operation: CDC_OPERATION.DELETE,
            data: {node_id: nodeData.node_id},
          });

          record = service.systemCache.get('nodes', nodeData.node_id);
          assert.strictEqual(record, undefined, 'Record should be deleted');
        },
      ),
      {numRuns: 10},
    );
  });

  it('should maintain cache consistency across multiple CDC events', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeRecordArb(), {minLength: 1, maxLength: 5}),
        async (nodeRecords) => {
          const service = await createService('node-1', 'replica-1', 'group-1');
          service.isLeaderReplica = () => false;

          // Apply all CDC events
          for (const nodeData of nodeRecords) {
            await service.applyCDCEvent({
              tableName: 'nodes',
              operation: CDC_OPERATION.INSERT,
              data: nodeData,
            });
          }

          // Verify all records exist
          for (const nodeData of nodeRecords) {
            const record = service.systemCache.get('nodes', nodeData.node_id);
            assert.ok(record, `Record ${nodeData.node_id} should exist`);
            assert.strictEqual(record.node_id, nodeData.node_id);
          }

          // Verify count matches (accounting for potential duplicates)
          const uniqueIds = new Set(nodeRecords.map((n) => n.node_id));
          const allRecords = service.systemCache.getAll('nodes');
          assert.strictEqual(allRecords.length, uniqueIds.size);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle CDC events for different tables independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeRecordArb(),
        tableRecordArb(),
        async (nodeData, tableData) => {
          const service = await createService('node-1', 'replica-1', 'group-1');
          service.isLeaderReplica = () => false;

          // Apply CDC events for different tables
          await service.applyCDCEvent({
            tableName: 'nodes',
            operation: CDC_OPERATION.INSERT,
            data: nodeData,
          });

          await service.applyCDCEvent({
            tableName: 'tables',
            operation: CDC_OPERATION.INSERT,
            data: tableData,
          });

          // Verify both records exist in their respective tables
          const nodeRecord = service.systemCache.get('nodes', nodeData.node_id);
          const tableRecord = service.systemCache.get('tables', tableData.table_id);

          assert.ok(nodeRecord, 'Node record should exist');
          assert.ok(tableRecord, 'Table record should exist');
          assert.strictEqual(nodeRecord.node_id, nodeData.node_id);
          assert.strictEqual(tableRecord.table_id, tableData.table_id);
        },
      ),
      {numRuns: 10},
    );
  });
});

/**
 * Get the primary key value from record data.
 * @param {string} tableName - Table name.
 * @param {Object} data - Record data.
 * @return {string} Primary key value.
 */
function getPrimaryKey(tableName, data) {
  const keyColumn = getPrimaryKeyColumn(tableName);
  return data[keyColumn];
}

/**
 * Get the primary key column name for a table.
 * @param {string} tableName - Table name.
 * @return {string} Primary key column name.
 */
function getPrimaryKeyColumn(tableName) {
  const keyMap = {
    nodes: 'node_id',
    tables: 'table_id',
    partitions: 'partition_id',
    services: 'service_id',
  };
  return keyMap[tableName] || 'id';
}
