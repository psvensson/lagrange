/**
 * Property Test: SQL Engine Cache-Based Routing
 * **Property: SQL Engine Cache-Based Routing**
 * **Validates: Requirements 5.1, 5.2, 5.3**
 *
 * Feature: system-cache-seeding-architecture
 *
 * *For any* SQL query (SELECT, INSERT, UPDATE, DELETE),
 * the query SHALL route through the message router to the correct
 * partition leader address found in the system cache.
 *
 * This property test verifies:
 * 1. All queries route through message router (not direct partition access)
 * 2. Correct partition leader is used from system cache
 * 3. System tables prefer leader for consistency
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {TABLES, SERVICE_TYPE, STATE} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

/**
 * Generator for valid table names.
 */
const tableNameArb = fc.stringMatching(/^[a-z_][a-z0-9_]{0,20}$/);

/**
 * Generator for valid partition IDs.
 */
const partitionIdArb = fc.uuid();

/**
 * Generator for valid node addresses.
 */
const nodeAddressArb = fc.stringMatching(/^node[0-9]+$/);

/**
 * Create a mock system cache with partition and service data.
 * @param {string} tableName - Table name.
 * @param {Array<Object>} partitions - Partition data.
 * @param {Array<Object>} services - Service data.
 * @return {Object} Mock system cache.
 */
function createMockSystemCache(tableName, partitions, services) {
  return {
    filter: function(table, predicate) {
      if (table === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (table === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll: function(table) {
      if (table === TABLES.PARTITIONS) {
        return partitions;
      }
      if (table === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };
}

/**
 * Create a mock message router that tracks deliveries.
 * @return {Object} Mock message router with tracking.
 */
function createMockMessageRouter() {
  const deliveries = [];

  return {
    deliver: async function(address, message) {
      deliveries.push({address, message});
      return {
        acknowledged: true,
        success: true,
        rows: [],
        changes: 0,
      };
    },
    getDeliveries: function() {
      return deliveries;
    },
    clearDeliveries: function() {
      deliveries.length = 0;
    },
  };
}

test('Property: SQL Engine Cache-Based Routing', async (t) => {
  /**
   * Property 1: All queries route through message router.
   * **Validates: Requirement 5.1**
   *
   * For any SQL query, the query SHALL route through the message router
   * and NOT access partitions directly.
   */
  t.test('all queries route through message router', async (t) => {
    fc.assert(
      fc.property(
        tableNameArb,
        partitionIdArb,
        nodeAddressArb,
        (tableName, partitionId, nodeAddress) => {
          const partitions = [{
            partition_id: partitionId,
            table_name: tableName,
            start_key: '',
            end_key: '',
          }];

          const services = [{
            partition_id: partitionId,
            service_type: SERVICE_TYPE.PARTITION,
            raft_role: RAFT_ROLE.LEADER,
            status: STATE.ACTIVE,
            address: `${nodeAddress}/partition/${partitionId}`,
            node_id: nodeAddress,
            service_id: partitionId,
          }];

          const systemCache = createMockSystemCache(
            tableName,
            partitions,
            services,
          );
          const messageRouter = createMockMessageRouter();

          const executor = new QueryExecutor({
            systemCache,
            messageRouter,
            nodeId: 'test-node',
          });

          // Test SELECT query
          const selectAst = new SQLParser(
            `SELECT * FROM ${tableName}`,
          ).parse();
          executor.executeSelect(selectAst, [partitionId], []);

          const deliveries = messageRouter.getDeliveries();
          const routedThroughMessageRouter = deliveries.length > 0;
          const usedCorrectAddress = deliveries.every(
            (d) => d.address === `${nodeAddress}/partition/${partitionId}`,
          );

          return routedThroughMessageRouter && usedCorrectAddress;
        },
      ),
      {numRuns: 10},
    );

    t.pass('all queries route through message router');
  });

  /**
   * Property 2: Correct partition leader is used from system cache.
   * **Validates: Requirement 5.2**
   *
   * For any INSERT/UPDATE/DELETE query, the query SHALL use the system
   * cache to find the partition leader address and route to that leader.
   */
  t.test('queries use correct partition leader from cache', async (t) => {
    fc.assert(
      fc.property(
        tableNameArb,
        fc.array(partitionIdArb, {minLength: 1, maxLength: 5}),
        nodeAddressArb,
        (tableName, partitionIds, nodeAddress) => {
          const partitions = partitionIds.map((id) => ({
            partition_id: id,
            table_name: tableName,
            start_key: '',
            end_key: '',
          }));

          const services = partitionIds.map((id) => ({
            partition_id: id,
            service_type: SERVICE_TYPE.PARTITION,
            raft_role: RAFT_ROLE.LEADER,
            status: STATE.ACTIVE,
            address: `${nodeAddress}/partition/${id}`,
            node_id: nodeAddress,
            service_id: id,
          }));

          const systemCache = createMockSystemCache(
            tableName,
            partitions,
            services,
          );
          const messageRouter = createMockMessageRouter();

          const executor = new QueryExecutor({
            systemCache,
            messageRouter,
            nodeId: 'test-node',
          });

          // Test INSERT query
          const insertAst = new SQLParser(
            `INSERT INTO ${tableName} (id) VALUES (1)`,
          ).parse();
          executor.executeInsert(insertAst, partitionIds[0], []);

          const deliveries = messageRouter.getDeliveries();
          const usedLeaderAddress = deliveries.every((d) => {
            const service = services.find((s) => d.address === s.address);
            return service && service.raft_role === RAFT_ROLE.LEADER;
          });

          return usedLeaderAddress;
        },
      ),
      {numRuns: 10},
    );

    t.pass('queries use correct partition leader from cache');
  });

  /**
   * Property 3: System tables prefer leader for consistency.
   * **Validates: Requirement 5.3**
   *
   * For any system table query, the query SHALL prefer the partition
   * leader to ensure consistency.
   */
  t.test('system table queries prefer leader', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          TABLES.NODES,
          TABLES.PARTITIONS,
          TABLES.SERVICES,
          TABLES.TABLES,
          TABLES.MESSAGE_GROUPS,
          TABLES.REPLICA_OPERATIONS,
        ),
        partitionIdArb,
        nodeAddressArb,
        (systemTable, partitionId, nodeAddress) => {
          const partitions = [{
            partition_id: partitionId,
            table_name: systemTable,
            start_key: '',
            end_key: '',
          }];

          const services = [
            {
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              raft_role: RAFT_ROLE.LEADER,
              status: STATE.ACTIVE,
              address: `${nodeAddress}/partition/${partitionId}`,
              node_id: nodeAddress,
              service_id: partitionId,
            },
            {
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              raft_role: RAFT_ROLE.FOLLOWER,
              status: STATE.ACTIVE,
              address: `node2/partition/${partitionId}`,
              node_id: 'node2',
              service_id: `${partitionId}-follower`,
            },
          ];

          const systemCache = createMockSystemCache(
            systemTable,
            partitions,
            services,
          );
          const messageRouter = createMockMessageRouter();

          const executor = new QueryExecutor({
            systemCache,
            messageRouter,
            nodeId: 'test-node',
          });

          // Test SELECT query on system table
          const selectAst = new SQLParser(
            `SELECT * FROM ${systemTable}`,
          ).parse();
          executor.executeSelect(selectAst, [partitionId], []);

          const deliveries = messageRouter.getDeliveries();
          const usedLeaderAddress = deliveries.every((d) => {
            const service = services.find((s) => d.address === s.address);
            return service && service.raft_role === RAFT_ROLE.LEADER;
          });

          return usedLeaderAddress;
        },
      ),
      {numRuns: 10},
    );

    t.pass('system table queries prefer leader');
  });

  /**
   * Property 4: Multiple partitions route to correct leaders.
   * **Validates: Requirements 5.1, 5.2**
   *
   * For any query spanning multiple partitions, each partition SHALL
   * route to its own leader address from the system cache.
   */
  t.test('multiple partitions route to correct leaders', async (t) => {
    fc.assert(
      fc.property(
        tableNameArb,
        fc.array(partitionIdArb, {minLength: 2, maxLength: 5}),
        fc.array(nodeAddressArb, {minLength: 2, maxLength: 5}),
        (tableName, partitionIds, nodeAddresses) => {
          const partitions = partitionIds.map((id) => ({
            partition_id: id,
            table_name: tableName,
            start_key: '',
            end_key: '',
          }));

          const services = partitionIds.map((id, index) => ({
            partition_id: id,
            service_type: SERVICE_TYPE.PARTITION,
            raft_role: RAFT_ROLE.LEADER,
            status: STATE.ACTIVE,
            address: `${nodeAddresses[index % nodeAddresses.length]}/partition/${id}`,
            node_id: nodeAddresses[index % nodeAddresses.length],
            service_id: id,
          }));

          const systemCache = createMockSystemCache(
            tableName,
            partitions,
            services,
          );
          const messageRouter = createMockMessageRouter();

          const executor = new QueryExecutor({
            systemCache,
            messageRouter,
            nodeId: 'test-node',
          });

          // Test SELECT query spanning multiple partitions
          const selectAst = new SQLParser(
            `SELECT * FROM ${tableName}`,
          ).parse();
          executor.executeSelect(selectAst, partitionIds, []);

          const deliveries = messageRouter.getDeliveries();
          const correctNumberOfDeliveries = deliveries.length === partitionIds.length;
          const allUsedLeaderAddresses = deliveries.every((d) => {
            const service = services.find((s) => d.address === s.address);
            return service && service.raft_role === RAFT_ROLE.LEADER;
          });

          return correctNumberOfDeliveries && allUsedLeaderAddresses;
        },
      ),
      {numRuns: 10},
    );

    t.pass('multiple partitions route to correct leaders');
  });

  /**
   * Property 5: Query fails gracefully when cache missing data.
   * **Validates: Requirement 5.5**
   *
   * If the system cache does not have partition information, the query
   * SHALL fail with a clear error (or return empty results gracefully).
   */
  t.test('query handles missing cache data gracefully', async (t) => {
    fc.assert(
      fc.property(
        tableNameArb,
        partitionIdArb,
        (tableName, partitionId) => {
          const systemCache = {
            filter: function(_table, _predicate) {
              return []; // No data in cache
            },
            getAll: function(_table) {
              return [];
            },
          };

          const messageRouter = createMockMessageRouter();

          const executor = new QueryExecutor({
            systemCache,
            messageRouter,
            nodeId: 'test-node',
          });

          // Test SELECT query with missing cache data
          const selectAst = new SQLParser(
            `SELECT * FROM ${tableName}`,
          ).parse();
          const result = executor.executeSelect(selectAst, [partitionId], []);

          // Should handle gracefully (return empty or fail clearly)
          return result !== undefined;
        },
      ),
      {numRuns: 10},
    );

    t.pass('query handles missing cache data gracefully');
  });

  /**
   * Property 6: SQLQueryEngine uses cache for partition lookup.
   * **Validates: Requirements 5.1, 5.4**
   *
   * The SQL engine SHALL use the system cache (not bootstrap directories)
   * to find partition locations for any query.
   */
  t.test('SQLQueryEngine uses cache for partition lookup', async (t) => {
    fc.assert(
      fc.property(
        tableNameArb,
        partitionIdArb,
        nodeAddressArb,
        (tableName, partitionId, nodeAddress) => {
          const partitions = [{
            partition_id: partitionId,
            table_name: tableName,
            start_key: '',
            end_key: '',
          }];

          const services = [{
            partition_id: partitionId,
            service_type: SERVICE_TYPE.PARTITION,
            raft_role: RAFT_ROLE.LEADER,
            status: STATE.ACTIVE,
            address: `${nodeAddress}/partition/${partitionId}`,
            node_id: nodeAddress,
            service_id: partitionId,
          }];

          const systemCache = createMockSystemCache(
            tableName,
            partitions,
            services,
          );
          const messageRouter = createMockMessageRouter();

          const engine = new SQLQueryEngine({
            systemCache,
            messageRouter,
            nodeId: 'test-node',
          });

          // Execute query
          engine.executeQuery(`SELECT * FROM ${tableName}`);

          const deliveries = messageRouter.getDeliveries();
          const usedCache = deliveries.length > 0;
          const usedCorrectAddress = deliveries.every(
            (d) => d.address === `${nodeAddress}/partition/${partitionId}`,
          );

          return usedCache && usedCorrectAddress;
        },
      ),
      {numRuns: 10},
    );

    t.pass('SQLQueryEngine uses cache for partition lookup');
  });
});
