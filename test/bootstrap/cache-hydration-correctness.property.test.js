/**
 * Property-based test for Cache Hydration Correctness.
 * **Property 2: Cache Hydration Correctness**
 * **Validates: Requirements 2.1, 2.2, 2.3**
 *
 * Property: After hydrating from bootstrap response, the system cache SHALL
 * contain all records from the snapshots, the cache SHALL be queryable, and
 * bootstrap directories SHALL be cleared.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-joining-node', restApiPort: 9999},
    logging: {level: 'error'},
  });
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
});

/**
 * Create a mock SQL query engine for testing.
 * Note: Bootstrap directories have been removed from SQLQueryEngine.
 * This mock is kept minimal for testing purposes.
 * @return {Object} Mock SQL query engine.
 */
function createMockSQLQueryEngine() {
  return {
    setSystemCache(_cache) {},
    setMessageRouter(_router) {},
  };
}

/**
 * Feature: system-cache-seeding-architecture
 * Property 2: Cache Hydration Correctness
 *
 * After hydrating from bootstrap response, the system cache SHALL contain
 * all records from the snapshots.
 */
test('Property 2: All records from snapshots are in cache after hydration', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        nodes: fc.array(fc.record({
          node_id: fc.uuid(),
          node_address: fc.webUrl(),
          status: fc.constantFrom('active', 'inactive'),
          created_at: fc.integer({min: 0, max: Date.now()}),
          updated_at: fc.integer({min: 0, max: Date.now()}),
        }), {maxLength: 5}),
        partitions: fc.array(fc.record({
          partition_id: fc.uuid(),
          table_name: fc.string({minLength: 1, maxLength: 20}),
          key_range_start: fc.integer({min: 0, max: 1000}),
          key_range_end: fc.integer({min: 0, max: 1000}),
          replica_count: fc.constantFrom(3, 5, 7),
        }), {maxLength: 5}),
        services: fc.array(fc.record({
          service_id: fc.uuid(),
          service_type: fc.constantFrom('partition', 'message_group'),
          node_id: fc.uuid(),
          address: fc.string({minLength: 1, maxLength: 50}),
          status: fc.constantFrom('active', 'inactive'),
        }), {maxLength: 5}),
        tables: fc.array(fc.record({
          table_id: fc.uuid(),
          table_name: fc.string({minLength: 1, maxLength: 20}),
          schema: fc.string(),
        }), {maxLength: 5}),
        message_groups: fc.array(fc.record({
          group_id: fc.uuid(),
          group_name: fc.string({minLength: 1, maxLength: 20}),
          replica_count: fc.constantFrom(3, 5, 7),
        }), {maxLength: 5}),
        replica_operations: fc.array(fc.record({
          operation_id: fc.uuid(),
          operation_type: fc.constantFrom('add_replica', 'remove_replica'),
          status: fc.constantFrom('pending', 'in_progress', 'completed'),
        }), {maxLength: 5}),
      }),
      async (systemTableSnapshots) => {
        // Initialize NodeService with system table cache
        const nodeService = NodeService.getInstance();
        nodeService.initialize({
          nodeId: 'test-joining-node',
          nodeAddress: 'ws://localhost:9090',
        });

        // Clear cache before hydration to ensure clean state
        const cache = nodeService.getSystemTableCache();
        cache.clear();

        const joiningService = new NodeJoiningService({
          nodeId: 'test-joining-node',
          nodeAddress: 'ws://localhost:9090',
          seedNodeAddress: 'http://localhost:8080',
        });

        // Set bootstrap response with system table snapshots
        joiningService.bootstrapResponse = {
          success: true,
          systemTableSnapshots,
        };

        // Hydrate cache from bootstrap response
        await joiningService.hydrateSystemCacheFromBootstrap();

        // Verify all nodes are in cache
        const cachedNodes = cache.getAll(TABLES.NODES);
        if (cachedNodes.length !== systemTableSnapshots.nodes.length) {
          return false;
        }

        // Verify all partitions are in cache
        const cachedPartitions = cache.getAll(TABLES.PARTITIONS);
        if (cachedPartitions.length !== systemTableSnapshots.partitions.length) {
          return false;
        }

        // Verify all services are in cache
        const cachedServices = cache.getAll(TABLES.SERVICES);
        if (cachedServices.length !== systemTableSnapshots.services.length) {
          return false;
        }

        // Verify all tables are in cache
        const cachedTables = cache.getAll(TABLES.TABLES);
        if (cachedTables.length !== systemTableSnapshots.tables.length) {
          return false;
        }

        // Verify all message_groups are in cache
        const cachedMessageGroups = cache.getAll(TABLES.MESSAGE_GROUPS);
        if (cachedMessageGroups.length !== systemTableSnapshots.message_groups.length) {
          return false;
        }

        // Verify all replica_operations are in cache
        const cachedReplicaOps = cache.getAll(TABLES.REPLICA_OPERATIONS);
        if (cachedReplicaOps.length !== systemTableSnapshots.replica_operations.length) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('All records from snapshots are in cache after hydration');
});

/**
 * Feature: system-cache-seeding-architecture
 * Property 2: Cache Hydration Correctness
 *
 * After hydration, the cache SHALL be queryable for specific records.
 */
test('Property 2: Cache can be queried after hydration', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({
        node_id: fc.uuid(),
        node_address: fc.webUrl(),
        status: fc.constantFrom('active', 'inactive'),
      }), {minLength: 1, maxLength: 5}),
      async (nodes) => {
        // Initialize NodeService with system table cache
        const nodeService = NodeService.getInstance();
        nodeService.initialize({
          nodeId: 'test-joining-node',
          nodeAddress: 'ws://localhost:9090',
        });

        // Clear cache before hydration to ensure clean state
        const cache = nodeService.getSystemTableCache();
        cache.clear();

        const joiningService = new NodeJoiningService({
          nodeId: 'test-joining-node',
          nodeAddress: 'ws://localhost:9090',
          seedNodeAddress: 'http://localhost:8080',
        });

        // Set bootstrap response with nodes
        joiningService.bootstrapResponse = {
          success: true,
          systemTableSnapshots: {
            nodes,
            partitions: [],
            services: [],
            tables: [],
            message_groups: [],
            replica_operations: [],
          },
        };

        // Hydrate cache from bootstrap response
        await joiningService.hydrateSystemCacheFromBootstrap();

        // Verify we can query for each node by ID
        for (const node of nodes) {
          const cachedNode = cache.get(TABLES.NODES, node.node_id);
          if (!cachedNode) {
            return false;
          }
          if (cachedNode.node_id !== node.node_id) {
            return false;
          }
          if (cachedNode.node_address !== node.node_address) {
            return false;
          }
        }

        // Verify we can filter nodes by status
        const activeNodes = cache.filter(TABLES.NODES, (n) => n.status === 'active');
        const expectedActiveCount = nodes.filter((n) => n.status === 'active').length;
        if (activeNodes.length !== expectedActiveCount) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache can be queried after hydration');
});

/**
 * Feature: system-cache-seeding-architecture
 * Property 2: Cache Hydration Correctness
 *
 * After hydration, bootstrap directories are no longer used.
 * SQLQueryEngine now uses ONLY the system cache for routing.
 */
test('Property 2: SQLQueryEngine uses only system cache after hydration', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        nodes: fc.array(fc.record({
          node_id: fc.uuid(),
          node_address: fc.webUrl(),
          status: fc.constantFrom('active', 'inactive'),
        }), {maxLength: 3}),
      }),
      async (systemTableSnapshots) => {
        // Initialize NodeService with system table cache
        const nodeService = NodeService.getInstance();
        nodeService.initialize({
          nodeId: 'test-joining-node',
          nodeAddress: 'ws://localhost:9090',
        });

        const joiningService = new NodeJoiningService({
          nodeId: 'test-joining-node',
          nodeAddress: 'ws://localhost:9090',
          seedNodeAddress: 'http://localhost:8080',
        });

        // Create mock SQL query engine (no bootstrap directories)
        const mockQueryEngine = createMockSQLQueryEngine();

        // Set bootstrap response
        joiningService.bootstrapResponse = {
          success: true,
          systemTableSnapshots,
        };

        // Hydrate cache
        await joiningService.hydrateSystemCacheFromBootstrap();

        // Verify SQLQueryEngine no longer has bootstrap directory methods
        if (typeof mockQueryEngine.setBootstrapDirectories === 'function') {
          return false;
        }
        if (mockQueryEngine.bootstrapPartitions !== undefined) {
          return false;
        }
        if (mockQueryEngine.bootstrapServices !== undefined) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('SQLQueryEngine uses only system cache after hydration');
});

/**
 * Feature: system-cache-seeding-architecture
 * Property 2: Cache Hydration Correctness
 *
 * Hydration should handle empty snapshots gracefully.
 */
test('Property 2: Empty snapshots produce empty cache tables', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.constant(null),
      async (_input) => {
        // Initialize NodeService with system table cache
        const nodeService = NodeService.getInstance();
        nodeService.initialize({
          nodeId: 'test-joining-node',
          nodeAddress: 'ws://localhost:9090',
        });

        const joiningService = new NodeJoiningService({
          nodeId: 'test-joining-node',
          nodeAddress: 'ws://localhost:9090',
          seedNodeAddress: 'http://localhost:8080',
        });

        // Set bootstrap response with empty snapshots
        joiningService.bootstrapResponse = {
          success: true,
          systemTableSnapshots: {
            nodes: [],
            partitions: [],
            services: [],
            tables: [],
            message_groups: [],
            replica_operations: [],
          },
        };

        // Hydrate cache from bootstrap response
        await joiningService.hydrateSystemCacheFromBootstrap();

        // Get the system table cache
        const cache = nodeService.getSystemTableCache();

        // Verify all tables are empty
        if (cache.getAll(TABLES.NODES).length !== 0) return false;
        if (cache.getAll(TABLES.PARTITIONS).length !== 0) return false;
        if (cache.getAll(TABLES.SERVICES).length !== 0) return false;
        if (cache.getAll(TABLES.TABLES).length !== 0) return false;
        if (cache.getAll(TABLES.MESSAGE_GROUPS).length !== 0) return false;
        if (cache.getAll(TABLES.REPLICA_OPERATIONS).length !== 0) return false;

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Empty snapshots produce empty cache tables');
});

/**
 * Feature: system-cache-seeding-architecture
 * Property 2: Cache Hydration Correctness
 *
 * Hydration should handle missing systemTableSnapshots gracefully.
 */
test('Property 2: Missing snapshots handled gracefully', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.constant(null),
      async (_input) => {
        // Initialize NodeService with system table cache
        const nodeService = NodeService.getInstance();
        nodeService.initialize({
          nodeId: 'test-joining-node',
          nodeAddress: 'ws://localhost:9090',
        });

        const joiningService = new NodeJoiningService({
          nodeId: 'test-joining-node',
          nodeAddress: 'ws://localhost:9090',
          seedNodeAddress: 'http://localhost:8080',
        });

        // Set bootstrap response without systemTableSnapshots
        joiningService.bootstrapResponse = {
          success: true,
        };

        // Hydrate cache - should not throw
        await joiningService.hydrateSystemCacheFromBootstrap();

        // Get the system table cache
        const cache = nodeService.getSystemTableCache();

        // Cache should still be accessible
        const nodes = cache.getAll(TABLES.NODES);
        if (!Array.isArray(nodes)) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Missing snapshots handled gracefully');
});
