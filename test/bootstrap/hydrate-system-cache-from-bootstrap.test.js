/**
 * Unit tests for NodeJoiningService.hydrateSystemCacheFromBootstrap()
 * Tests the system cache hydration from bootstrap response snapshots.
 */

import tap from 'tap';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {TABLES} from '../../src/constants/index.js';

tap.test('hydrateSystemCacheFromBootstrap', async (t) => {
  t.test('should hydrate cache from bootstrap response snapshots', async (t) => {
    // Setup
    const nodeService = NodeService.getInstance();
    nodeService.initialize({
      nodeId: 'test-node-1',
      nodeAddress: 'http://localhost:3001',
    });

    const systemTableCache = nodeService.getSystemTableCache();
    systemTableCache.clear();

    const joiningService = new NodeJoiningService({
      nodeId: 'test-node-1',
      nodeAddress: 'http://localhost:3001',
      seedNodeAddress: 'http://localhost:3000',
    });

    // Create bootstrap response with snapshots
    joiningService.bootstrapResponse = {
      systemTableSnapshots: {
        nodes: [
          {node_id: 'seed-node', node_address: 'http://localhost:3000'},
        ],
        partitions: [
          {partition_id: 'p1', table_name: 'users'},
        ],
        services: [
          {service_id: 's1', partition_id: 'p1'},
        ],
        tables: [
          {table_id: 't1', table_name: 'users'},
        ],
        message_groups: [
          {group_id: 'mg1'},
        ],
        replica_operations: [],
      },
    };

    // Execute
    await joiningService.hydrateSystemCacheFromBootstrap();

    // Verify
    const nodes = systemTableCache.getAll(TABLES.NODES);
    t.equal(nodes.length, 1, 'should have 1 node');
    t.equal(nodes[0].node_id, 'seed-node', 'should have correct node_id');

    const partitions = systemTableCache.getAll(TABLES.PARTITIONS);
    t.equal(partitions.length, 1, 'should have 1 partition');
    t.equal(partitions[0].partition_id, 'p1', 'should have correct partition_id');

    const services = systemTableCache.getAll(TABLES.SERVICES);
    t.equal(services.length, 1, 'should have 1 service');

    const tables = systemTableCache.getAll(TABLES.TABLES);
    t.equal(tables.length, 1, 'should have 1 table');

    const messageGroups = systemTableCache.getAll(TABLES.MESSAGE_GROUPS);
    t.equal(messageGroups.length, 1, 'should have 1 message group');

    const replicaOps = systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);
    t.equal(replicaOps.length, 0, 'should have 0 replica operations');

    t.end();
  });

  t.test('should handle missing systemTableSnapshots gracefully', async (t) => {
    // Setup
    const nodeService = NodeService.getInstance();
    nodeService.initialize({
      nodeId: 'test-node-2',
      nodeAddress: 'http://localhost:3002',
    });

    const joiningService = new NodeJoiningService({
      nodeId: 'test-node-2',
      nodeAddress: 'http://localhost:3002',
      seedNodeAddress: 'http://localhost:3000',
    });

    // Bootstrap response without snapshots
    joiningService.bootstrapResponse = {
      success: true,
    };

    // Execute - should not throw
    await joiningService.hydrateSystemCacheFromBootstrap();

    t.pass('should handle missing snapshots without throwing');
    t.end();
  });

  t.test('should handle missing individual table snapshots', async (t) => {
    // Setup
    const nodeService = NodeService.getInstance();
    nodeService.initialize({
      nodeId: 'test-node-3',
      nodeAddress: 'http://localhost:3003',
    });

    const systemTableCache = nodeService.getSystemTableCache();
    systemTableCache.clear();

    const joiningService = new NodeJoiningService({
      nodeId: 'test-node-3',
      nodeAddress: 'http://localhost:3003',
      seedNodeAddress: 'http://localhost:3000',
    });

    // Bootstrap response with partial snapshots
    joiningService.bootstrapResponse = {
      systemTableSnapshots: {
        nodes: [
          {node_id: 'seed-node', node_address: 'http://localhost:3000'},
        ],
        // partitions missing
        services: null,
        // tables missing
        message_groups: undefined,
        replica_operations: [],
      },
    };

    // Execute - should not throw
    await joiningService.hydrateSystemCacheFromBootstrap();

    // Verify only nodes were hydrated
    const nodes = systemTableCache.getAll(TABLES.NODES);
    t.equal(nodes.length, 1, 'should have 1 node');

    const partitions = systemTableCache.getAll(TABLES.PARTITIONS);
    t.equal(partitions.length, 0, 'should have 0 partitions');

    t.end();
  });

  t.test('should hydrate multiple records per table', async (t) => {
    // Setup
    const nodeService = NodeService.getInstance();
    nodeService.initialize({
      nodeId: 'test-node-4',
      nodeAddress: 'http://localhost:3004',
    });

    const systemTableCache = nodeService.getSystemTableCache();
    systemTableCache.clear();

    const joiningService = new NodeJoiningService({
      nodeId: 'test-node-4',
      nodeAddress: 'http://localhost:3004',
      seedNodeAddress: 'http://localhost:3000',
    });

    // Bootstrap response with multiple records
    joiningService.bootstrapResponse = {
      systemTableSnapshots: {
        nodes: [
          {node_id: 'node-1', node_address: 'http://localhost:3001'},
          {node_id: 'node-2', node_address: 'http://localhost:3002'},
          {node_id: 'node-3', node_address: 'http://localhost:3003'},
        ],
        partitions: [
          {partition_id: 'p1', table_name: 'users'},
          {partition_id: 'p2', table_name: 'orders'},
        ],
        services: [],
        tables: [],
        message_groups: [],
        replica_operations: [],
      },
    };

    // Execute
    await joiningService.hydrateSystemCacheFromBootstrap();

    // Verify
    const nodes = systemTableCache.getAll(TABLES.NODES);
    t.equal(nodes.length, 3, 'should have 3 nodes');

    const partitions = systemTableCache.getAll(TABLES.PARTITIONS);
    t.equal(partitions.length, 2, 'should have 2 partitions');

    t.end();
  });

  t.end();
});
