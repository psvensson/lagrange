/**
 * Unit tests for QueryRouter class.
 * Tests routing logic, retry behavior, leader redirect following, and timeout management.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import {describe, it} from 'node:test';
import assert from 'node:assert';
import {QueryRouter} from '../../src/query/query-router.js';
import {
  QUERY_ROUTER_ERROR_MSG,
  QUERY_RESPONSE_TYPE,
} from '../../src/query/query-constants.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

/**
 * Create a mock system cache with configurable services.
 * @param {Array} services - Array of service objects
 * @param {Array} nodes - Array of node rows
 * @param {Array} partitions - Array of partition rows
 * @return {Object} Mock system cache
 */
function createMockSystemCache(services = [], nodes = [], partitions = []) {
  const nodeById = new Map(
    nodes.map((node) => [node.node_id, node]),
  );
  const partitionById = new Map(
    partitions.map((partition) => [partition.partition_id, partition]),
  );
  return {
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      if (tableName === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      return [];
    },
    get: (tableName, key) => {
      if (tableName === TABLES.NODES) {
        return nodeById.get(key) || null;
      }
      if (tableName === TABLES.PARTITIONS) {
        return partitionById.get(key) || null;
      }
      return null;
    },
  };
}

/**
 * Create a mock message router with configurable responses.
 * @param {Function} deliverFn - Function to handle deliver calls
 * @return {Object} Mock message router
 */
function createMockMessageRouter(deliverFn) {
  return {
    deliver: deliverFn,
  };
}

/**
 * Create a standard active partition service.
 * @param {Object} overrides - Properties to override
 * @return {Object} Service object
 */
function createService(overrides = {}) {
  return {
    partition_id: 'partition-1',
    service_type: SERVICE_TYPE.PARTITION,
    status: SERVICE_STATUS.ACTIVE,
    raft_role: RAFT_ROLE.FOLLOWER,
    address: 'ws://localhost:8080',
    node_id: 'node-1',
    service_id: 'service-1',
    ...overrides,
  };
}

describe('QueryRouter', () => {
  describe('constructor', () => {
    it('should throw when systemCache is missing', () => {
      assert.throws(
        () => new QueryRouter({
          messageRouter: createMockMessageRouter(() => ({})),
        }),
        {message: QUERY_ROUTER_ERROR_MSG.SYSTEM_CACHE_REQUIRED},
      );
    });

    it('should throw when messageRouter is missing', () => {
      assert.throws(
        () => new QueryRouter({
          systemCache: createMockSystemCache(),
        }),
        {message: QUERY_ROUTER_ERROR_MSG.MESSAGE_ROUTER_REQUIRED},
      );
    });

    it('should create instance with required dependencies', () => {
      const router = new QueryRouter({
        systemCache: createMockSystemCache(),
        messageRouter: createMockMessageRouter(() => ({})),
      });
      assert.ok(router);
    });

    it('should use provided configuration values', () => {
      const router = new QueryRouter({
        systemCache: createMockSystemCache(),
        messageRouter: createMockMessageRouter(() => ({})),
        timeoutMs: 5000,
        retryAttempts: 3,
        retryDelayMs: 100,
      });
      assert.strictEqual(router.timeoutMs, 5000);
      assert.strictEqual(router.retryAttempts, 3);
      assert.strictEqual(router.retryDelayMs, 100);
    });
  });

  describe('findServiceCandidates', () => {
    it('should return empty array when no services exist', () => {
      const router = new QueryRouter({
        systemCache: createMockSystemCache([]),
        messageRouter: createMockMessageRouter(() => ({})),
      });

      const candidates = router.findServiceCandidates('partition-1');
      assert.deepStrictEqual(candidates, []);
    });

    it('should return candidates for matching partition', () => {
      const services = [
        createService({partition_id: 'partition-1', address: 'ws://node1:8080'}),
        createService({partition_id: 'partition-2', address: 'ws://node2:8080'}),
      ];

      const router = new QueryRouter({
        systemCache: createMockSystemCache(services),
        messageRouter: createMockMessageRouter(() => ({})),
      });

      const candidates = router.findServiceCandidates('partition-1');
      assert.strictEqual(candidates.length, 1);
      assert.strictEqual(candidates[0].address, 'ws://node1:8080');
    });

    it('should prioritize leader when preferLeader is true', () => {
      const services = [
        createService({
          service_id: 'follower-1',
          raft_role: RAFT_ROLE.FOLLOWER,
          address: 'ws://follower:8080',
        }),
        createService({
          service_id: 'leader-1',
          raft_role: RAFT_ROLE.LEADER,
          address: 'ws://leader:8080',
        }),
      ];

      const router = new QueryRouter({
        systemCache: createMockSystemCache(services),
        messageRouter: createMockMessageRouter(() => ({})),
      });

      const candidates = router.findServiceCandidates('partition-1', true);
      assert.strictEqual(candidates.length, 2);
      assert.strictEqual(candidates[0].address, 'ws://leader:8080');
      assert.strictEqual(candidates[0].isLeader, true);
    });

    it('should prefer canonical leader_node_id before stale service roles', () => {
      const services = [
        createService({
          service_id: 'stale-leader',
          node_id: 'node-stale',
          raft_role: RAFT_ROLE.LEADER,
          address: 'ws://stale:8080',
        }),
        createService({
          service_id: 'canonical-leader',
          node_id: 'node-canonical',
          raft_role: RAFT_ROLE.FOLLOWER,
          address: 'ws://canonical:8080',
        }),
      ];
      const partitions = [{
        partition_id: 'partition-1',
        leader_node_id: 'node-canonical',
      }];

      const router = new QueryRouter({
        systemCache: createMockSystemCache(services, [], partitions),
        messageRouter: createMockMessageRouter(() => ({})),
      });

      const candidates = router.findServiceCandidates('partition-1', true);
      assert.strictEqual(candidates.length, 2);
      assert.strictEqual(candidates[0].address, 'ws://canonical:8080');
    });

    it('should filter out services without addresses', () => {
      const services = [
        createService({address: 'ws://valid:8080'}),
        createService({service_id: 'no-address', address: null}),
        createService({service_id: 'empty-address', address: ''}),
      ];

      const router = new QueryRouter({
        systemCache: createMockSystemCache(services),
        messageRouter: createMockMessageRouter(() => ({})),
      });

      const candidates = router.findServiceCandidates('partition-1');
      assert.strictEqual(candidates.length, 1);
      assert.strictEqual(candidates[0].address, 'ws://valid:8080');
    });

    it('should filter out inactive services', () => {
      const services = [
        createService({status: SERVICE_STATUS.ACTIVE, address: 'ws://active:8080'}),
        createService({
          service_id: 'inactive',
          status: 'inactive',
          address: 'ws://inactive:8080',
        }),
      ];

      const router = new QueryRouter({
        systemCache: createMockSystemCache(services),
        messageRouter: createMockMessageRouter(() => ({})),
      });

      const candidates = router.findServiceCandidates('partition-1');
      assert.strictEqual(candidates.length, 1);
      assert.strictEqual(candidates[0].address, 'ws://active:8080');
    });

    it('should deduplicate services by service_id', () => {
      const services = [
        createService({service_id: 'same-id', address: 'ws://node1:8080'}),
        createService({service_id: 'same-id', address: 'ws://node2:8080'}),
      ];

      const router = new QueryRouter({
        systemCache: createMockSystemCache(services),
        messageRouter: createMockMessageRouter(() => ({})),
      });

      const candidates = router.findServiceCandidates('partition-1');
      assert.strictEqual(candidates.length, 1);
    });

    it('should prioritize same latency-group candidates when requested', () => {
      const services = [
        createService({
          service_id: 'remote-1',
          node_id: 'node-remote',
          address: 'ws://remote:8080',
        }),
        createService({
          service_id: 'local-1',
          node_id: 'node-local',
          address: 'ws://local:8080',
        }),
      ];
      const nodes = [
        {node_id: 'node-client', latency_group_id: 'g-1'},
        {node_id: 'node-local', latency_group_id: 'g-1'},
        {node_id: 'node-remote', latency_group_id: 'g-2'},
      ];

      const router = new QueryRouter({
        systemCache: createMockSystemCache(services, nodes),
        messageRouter: createMockMessageRouter(() => ({})),
      });

      const candidates = router.findServiceCandidates(
        'partition-1',
        false,
        {
          preferSameLatencyGroup: true,
          localNodeId: 'node-client',
        },
      );

      assert.strictEqual(candidates.length, 2);
      assert.strictEqual(candidates[0].nodeId, 'node-local');
      assert.strictEqual(candidates[1].nodeId, 'node-remote');
    });
  });

  describe('routeToPartition', () => {
    it('should route successfully on first attempt', async () => {
      const services = [
        createService({raft_role: RAFT_ROLE.LEADER, address: 'ws://leader:8080'}),
      ];

      const router = new QueryRouter({
        systemCache: createMockSystemCache(services),
        messageRouter: createMockMessageRouter(async () => ({
          acknowledged: true,
          success: true,
          rows: [{id: 1}],
        })),
        retryAttempts: 3,
        retryDelayMs: 1,
      });

      const result = await router.routeToPartition('partition-1', {type: 'QUERY'});
      assert.strictEqual(result.success, true);
      assert.ok(result.correlationId);
    });

    it('should include correlationId in routed message', async () => {
      const services = [createService({raft_role: RAFT_ROLE.LEADER})];
      let deliveredMessage = null;

      const router = new QueryRouter({
        systemCache: createMockSystemCache(services),
        messageRouter: createMockMessageRouter(async (_addr, msg) => {
          deliveredMessage = msg;
          return {acknowledged: true, success: true};
        }),
        retryAttempts: 1,
        retryDelayMs: 1,
      });

      await router.routeToPartition('partition-1', {type: 'QUERY'}, {
        correlationId: 'test-correlation-id',
      });

      assert.strictEqual(deliveredMessage.correlationId, 'test-correlation-id');
    });

    it('should throw when no candidates are found after retries', async () => {
      const router = new QueryRouter({
        systemCache: createMockSystemCache([]),
        messageRouter: createMockMessageRouter(async () => ({})),
        retryAttempts: 2,
        retryDelayMs: 1,
      });

      await assert.rejects(
        () => router.routeToPartition('partition-1', {type: 'QUERY'}),
        {message: QUERY_ROUTER_ERROR_MSG.noServiceCandidates('partition-1')},
      );
    });

    it('should follow leader redirect', async () => {
      const services = [
        createService({raft_role: RAFT_ROLE.FOLLOWER, address: 'ws://follower:8080'}),
      ];

      let callCount = 0;
      const router = new QueryRouter({
        systemCache: createMockSystemCache(services),
        messageRouter: createMockMessageRouter(async (address) => {
          callCount++;
          if (address === 'ws://follower:8080') {
            return {
              acknowledged: true,
              success: false,
              redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
              leaderAddress: 'ws://leader:8080',
            };
          }
          return {acknowledged: true, success: true};
        }),
        retryAttempts: 3,
        retryDelayMs: 1,
      });

      const result = await router.routeToPartition('partition-1', {type: 'QUERY'});
      assert.strictEqual(result.success, true);
      assert.strictEqual(callCount, 2);
    });

    it('should retry with exponential backoff on failure', async () => {
      const services = [createService({raft_role: RAFT_ROLE.LEADER})];
      let callCount = 0;

      const router = new QueryRouter({
        systemCache: createMockSystemCache(services),
        messageRouter: createMockMessageRouter(async () => {
          callCount++;
          if (callCount < 3) {
            return {acknowledged: true, success: false, error: 'Temporary failure'};
          }
          return {acknowledged: true, success: true};
        }),
        retryAttempts: 3,
        retryDelayMs: 1,
      });

      const result = await router.routeToPartition('partition-1', {type: 'QUERY'});
      assert.strictEqual(result.success, true);
      assert.strictEqual(callCount, 3);
    });

    it('should throw after exhausting retry attempts', async () => {
      const services = [createService({raft_role: RAFT_ROLE.LEADER})];

      const router = new QueryRouter({
        systemCache: createMockSystemCache(services),
        messageRouter: createMockMessageRouter(async () => ({
          acknowledged: true,
          success: false,
          error: 'Persistent failure',
        })),
        retryAttempts: 3,
        retryDelayMs: 1,
      });

      await assert.rejects(
        () => router.routeToPartition('partition-1', {type: 'QUERY'}),
        {message: QUERY_ROUTER_ERROR_MSG.routingFailed('partition-1', 3)},
      );
    });

    it('should throw on timeout', async () => {
      const services = [createService({raft_role: RAFT_ROLE.LEADER})];

      // Create a router with very short timeout
      const router = new QueryRouter({
        systemCache: createMockSystemCache(services),
        messageRouter: createMockMessageRouter(async () => {
          // Simulate slow response that exceeds timeout
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {acknowledged: true, success: false, error: 'Slow'};
        }),
        timeoutMs: 10,
        retryAttempts: 5,
        retryDelayMs: 1,
      });

      await assert.rejects(
        () => router.routeToPartition('partition-1', {type: 'QUERY'}),
        (err) => err.message.includes('timed out') || err.message.includes('Failed to route'),
      );
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff', () => {
      const router = new QueryRouter({
        systemCache: createMockSystemCache(),
        messageRouter: createMockMessageRouter(() => ({})),
        retryDelayMs: 100,
      });

      assert.strictEqual(router.calculateBackoffDelay(0), 100);
      assert.strictEqual(router.calculateBackoffDelay(1), 200);
      assert.strictEqual(router.calculateBackoffDelay(2), 400);
      assert.strictEqual(router.calculateBackoffDelay(3), 800);
    });
  });
});
