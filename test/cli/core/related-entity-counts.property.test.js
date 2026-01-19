/**
 * Property Test: Related Entity Counts
 * Property 9: For any entity, the related entity counts returned by
 * getRelatedCounts should match the actual count of related entities
 * in the cache.
 *
 * **Validates: Requirements 11.6**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {NavigationController} from '../../../src/cli/core/navigation-controller.js';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';

/**
 * Generate a node record
 */
const nodeArb = fc.record({
  node_id: fc.string({minLength: 1, maxLength: 10}),
  node_address: fc.string({minLength: 1, maxLength: 20}),
  status: fc.constantFrom('active', 'inactive', 'failed'),
});

/**
 * Generate a service record
 */
const _serviceArb = (nodeIds) => fc.record({
  service_id: fc.string({minLength: 1, maxLength: 10}),
  node_id: fc.constantFrom(...nodeIds),
  service_type: fc.constantFrom('partition', 'message_group', 'node'),
  status: fc.constantFrom('running', 'stopped'),
});

/**
 * Generate a table record
 */
const tableArb = fc.record({
  table_id: fc.string({minLength: 1, maxLength: 10}),
  table_name: fc.string({minLength: 1, maxLength: 20}),
});

/**
 * Generate a partition record
 */
const _partitionArb = (tableIds) => fc.record({
  partition_id: fc.string({minLength: 1, maxLength: 10}),
  table_id: fc.constantFrom(...tableIds),
  replica_count: fc.integer({min: 1, max: 5}),
});

test('Property 9: Related Entity Counts', async (t) => {
  await t.test('node service count matches actual services', async (t) => {
    fc.assert(
      fc.property(
        fc.array(nodeArb, {minLength: 1, maxLength: 3}),
        fc.integer({min: 0, max: 10}),
        (nodes, serviceCount) => {
          // Ensure unique node IDs
          const uniqueNodes = [];
          const seenIds = new Set();
          for (const node of nodes) {
            if (!seenIds.has(node.node_id)) {
              seenIds.add(node.node_id);
              uniqueNodes.push(node);
            }
          }

          if (uniqueNodes.length === 0) return true;

          const cache = new RemoteCache();
          const nodeIds = uniqueNodes.map((n) => n.node_id);

          // Generate services for the nodes
          const services = [];
          for (let i = 0; i < serviceCount; i++) {
            const nodeId = nodeIds[i % nodeIds.length];
            services.push({
              service_id: `service-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              status: 'running',
            });
          }

          cache.loadFromDump({
            nodes: uniqueNodes,
            services: services,
          });

          const nav = new NavigationController(cache);

          // Check each node's service count
          for (const node of uniqueNodes) {
            const counts = nav.getRelatedCounts('node', node.node_id);
            const actualCount = services.filter(
              (s) => s.node_id === node.node_id,
            ).length;

            if (counts.services !== actualCount) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('node service count matches actual services');
  });

  await t.test('table partition count matches actual partitions', async (t) => {
    fc.assert(
      fc.property(
        fc.array(tableArb, {minLength: 1, maxLength: 3}),
        fc.integer({min: 0, max: 10}),
        (tables, partitionCount) => {
          // Ensure unique table IDs
          const uniqueTables = [];
          const seenIds = new Set();
          for (const table of tables) {
            if (!seenIds.has(table.table_id)) {
              seenIds.add(table.table_id);
              uniqueTables.push(table);
            }
          }

          if (uniqueTables.length === 0) return true;

          const cache = new RemoteCache();
          const tableIds = uniqueTables.map((t) => t.table_id);

          // Generate partitions for the tables
          const partitions = [];
          for (let i = 0; i < partitionCount; i++) {
            const tableId = tableIds[i % tableIds.length];
            partitions.push({
              partition_id: `partition-${i}`,
              table_id: tableId,
              replica_count: 3,
            });
          }

          cache.loadFromDump({
            tables: uniqueTables,
            partitions: partitions,
          });

          const nav = new NavigationController(cache);

          // Check each table's partition count
          for (const table of uniqueTables) {
            const counts = nav.getRelatedCounts('table', table.table_id);
            const actualCount = partitions.filter(
              (p) => p.table_id === table.table_id,
            ).length;

            if (counts.partitions !== actualCount) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('table partition count matches actual partitions');
  });

  await t.test('partition replica count from partition record', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 10}),
        fc.integer({min: 1, max: 7}),
        (partitionId, replicaCount) => {
          const cache = new RemoteCache();

          cache.loadFromDump({
            partitions: [{
              partition_id: partitionId,
              table_id: 'table-1',
              replica_count: replicaCount,
            }],
          });

          const nav = new NavigationController(cache);
          const counts = nav.getRelatedCounts('partition', partitionId);

          return counts.replicas === replicaCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('partition replica count from partition record');
  });

  await t.test('message group replica count from group record', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 10}),
        fc.integer({min: 1, max: 7}),
        (groupId, replicaCount) => {
          const cache = new RemoteCache();

          cache.loadFromDump({
            message_groups: [{
              group_id: groupId,
              replica_count: replicaCount,
            }],
          });

          const nav = new NavigationController(cache);
          const counts = nav.getRelatedCounts('message_group', groupId);

          return counts.replicas === replicaCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('message group replica count from group record');
  });

  await t.test('unknown entity type returns empty counts', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 10}),
        (entityId) => {
          const cache = new RemoteCache();
          const nav = new NavigationController(cache);

          const counts = nav.getRelatedCounts('unknown_type', entityId);

          return Object.keys(counts).length === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('unknown entity type returns empty counts');
  });

  await t.test('missing entity returns zero counts', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 10}),
        (nodeId) => {
          const cache = new RemoteCache();
          cache.loadFromDump({
            nodes: [],
            services: [],
          });

          const nav = new NavigationController(cache);
          const counts = nav.getRelatedCounts('node', nodeId);

          // Should return 0 services for non-existent node
          return counts.services === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('missing entity returns zero counts');
  });
});
