/**
 * Property test for QueryRouter Service Candidate Discovery.
 * Property 3: For any partition ID that exists in the system cache, the
 * QueryRouter SHALL return at least one valid service candidate with a
 * reachable address.
 *
 * Validates: Requirements 3.2
 *
 * Feature: code-clarity-maintainability
 * Property 3: QueryRouter Service Candidate Discovery
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {QueryRouter} from '../../src/query/query-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

// Initialize configuration and logging for tests (module level)
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

/**
 * Create a mock system cache with configurable services.
 * @param {Array<Object>} services - Array of service objects to return
 * @return {Object} Mock system cache
 */
function createMockSystemCache(services) {
  return {
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
  };
}

/**
 * Create a mock message router.
 * @return {Object} Mock message router
 */
function createMockMessageRouter() {
  return {
    deliver: async () => ({acknowledged: true, success: true}),
  };
}

/**
 * Generate a valid service entry for a partition.
 * @param {string} partitionId - Partition ID
 * @param {string} serviceId - Service ID
 * @param {string} address - Service address
 * @param {string} raftRole - Raft role (leader/follower)
 * @param {string} nodeId - Node ID
 * @return {Object} Service entry
 */
function createServiceEntry(partitionId, serviceId, address, raftRole, nodeId) {
  return {
    partition_id: partitionId,
    service_id: serviceId,
    service_type: SERVICE_TYPE.PARTITION,
    status: SERVICE_STATUS.ACTIVE,
    address,
    raft_role: raftRole,
    node_id: nodeId,
  };
}

/**
 * Feature: code-clarity-maintainability
 * Property 3: QueryRouter Service Candidate Discovery
 *
 * For any partition ID that exists in the system cache, the QueryRouter SHALL
 * return at least one valid service candidate with a reachable address.
 */
test('Property 3: QueryRouter Service Candidate Discovery', async (t) => {
  /**
   * Property: Valid candidates are returned for existing partitions.
   *
   * For any partition ID with services in the system cache, findServiceCandidates
   * should return at least one candidate with a valid address.
   *
   * **Validates: Requirements 3.2**
   */
  t.test('valid candidates are returned for existing partitions', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        // Generate service ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        // Generate address (host:port format)
        fc.tuple(
          fc.string({minLength: 1, maxLength: 15}).filter((s) => /^[a-z0-9-]+$/.test(s)),
          fc.integer({min: 1024, max: 65535}),
        ).map(([host, port]) => `${host}:${port}`),
        // Generate node ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (partitionId, serviceId, address, nodeId) => {
          const services = [
            createServiceEntry(
              partitionId,
              serviceId,
              address,
              RAFT_ROLE.LEADER,
              nodeId,
            ),
          ];

          const systemCache = createMockSystemCache(services);
          const messageRouter = createMockMessageRouter();

          const router = new QueryRouter({
            systemCache,
            messageRouter,
          });

          const candidates = router.findServiceCandidates(partitionId);

          // Should return at least one candidate
          if (candidates.length === 0) {
            return false;
          }

          // All candidates should have addresses
          const allHaveAddresses = candidates.every((c) => c.address && c.address.length > 0);
          if (!allHaveAddresses) {
            return false;
          }

          // The returned address should match the service address
          const hasCorrectAddress = candidates.some((c) => c.address === address);
          return hasCorrectAddress;
        },
      ),
      {numRuns: 10},
    );

    t.pass('valid candidates are returned for existing partitions');
  });

  /**
   * Property: All candidates have addresses.
   *
   * For any set of services in the cache, all returned candidates must have
   * non-empty address fields.
   *
   * **Validates: Requirements 3.2**
   */
  t.test('all candidates have addresses', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        // Generate multiple services (1-5)
        fc.array(
          fc.record({
            serviceId: fc.string({minLength: 1, maxLength: 15})
              .filter((s) => s.trim().length > 0),
            host: fc.string({minLength: 1, maxLength: 10})
              .filter((s) => /^[a-z0-9-]+$/.test(s)),
            port: fc.integer({min: 1024, max: 65535}),
            nodeId: fc.string({minLength: 1, maxLength: 15})
              .filter((s) => s.trim().length > 0),
            isLeader: fc.boolean(),
          }),
          {minLength: 1, maxLength: 5},
        ),
        async (partitionId, serviceConfigs) => {
          const services = serviceConfigs.map((cfg, idx) =>
            createServiceEntry(
              partitionId,
              `${cfg.serviceId}-${idx}`,
              `${cfg.host}:${cfg.port}`,
              cfg.isLeader ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
              cfg.nodeId,
            ),
          );

          const systemCache = createMockSystemCache(services);
          const messageRouter = createMockMessageRouter();

          const router = new QueryRouter({
            systemCache,
            messageRouter,
          });

          const candidates = router.findServiceCandidates(partitionId);

          // All candidates must have non-empty addresses
          return candidates.every((c) =>
            c.address !== undefined &&
            c.address !== null &&
            c.address.length > 0,
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('all candidates have addresses');
  });

  /**
   * Property: Leaders are prioritized when preferLeader is true.
   *
   * When preferLeader is true and there are leader services, the first
   * candidate should be a leader.
   *
   * **Validates: Requirements 3.2**
   */
  t.test('leaders are prioritized when preferLeader is true', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        // Generate leader service config
        fc.record({
          serviceId: fc.string({minLength: 1, maxLength: 15})
            .filter((s) => s.trim().length > 0),
          host: fc.string({minLength: 1, maxLength: 10})
            .filter((s) => /^[a-z0-9-]+$/.test(s)),
          port: fc.integer({min: 1024, max: 65535}),
          nodeId: fc.string({minLength: 1, maxLength: 15})
            .filter((s) => s.trim().length > 0),
        }),
        // Generate follower service configs (0-3)
        fc.array(
          fc.record({
            serviceId: fc.string({minLength: 1, maxLength: 15})
              .filter((s) => s.trim().length > 0),
            host: fc.string({minLength: 1, maxLength: 10})
              .filter((s) => /^[a-z0-9-]+$/.test(s)),
            port: fc.integer({min: 1024, max: 65535}),
            nodeId: fc.string({minLength: 1, maxLength: 15})
              .filter((s) => s.trim().length > 0),
          }),
          {minLength: 0, maxLength: 3},
        ),
        async (partitionId, leaderConfig, followerConfigs) => {
          // Create follower services first (to ensure they're not naturally first)
          const services = followerConfigs.map((cfg, idx) =>
            createServiceEntry(
              partitionId,
              `follower-${cfg.serviceId}-${idx}`,
              `${cfg.host}:${cfg.port}`,
              RAFT_ROLE.FOLLOWER,
              cfg.nodeId,
            ),
          );

          // Add leader service
          services.push(
            createServiceEntry(
              partitionId,
              `leader-${leaderConfig.serviceId}`,
              `${leaderConfig.host}:${leaderConfig.port}`,
              RAFT_ROLE.LEADER,
              leaderConfig.nodeId,
            ),
          );

          const systemCache = createMockSystemCache(services);
          const messageRouter = createMockMessageRouter();

          const router = new QueryRouter({
            systemCache,
            messageRouter,
          });

          // With preferLeader=true (default)
          const candidates = router.findServiceCandidates(partitionId, true);

          // First candidate should be the leader
          if (candidates.length === 0) {
            return false;
          }

          return candidates[0].isLeader === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('leaders are prioritized when preferLeader is true');
  });

  /**
   * Property: Empty array returned for non-existent partitions.
   *
   * When a partition ID has no services in the cache, findServiceCandidates
   * should return an empty array.
   *
   * **Validates: Requirements 3.2**
   */
  t.test('empty array returned for non-existent partitions', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate partition ID that exists
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        // Generate partition ID that doesn't exist
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (existingPartitionId, queryPartitionId) => {
          // Ensure they're different
          const nonExistentId = existingPartitionId === queryPartitionId ?
            `${queryPartitionId}-nonexistent` :
            queryPartitionId;

          const services = [
            createServiceEntry(
              existingPartitionId,
              'service-1',
              'host:8080',
              RAFT_ROLE.LEADER,
              'node-1',
            ),
          ];

          const systemCache = createMockSystemCache(services);
          const messageRouter = createMockMessageRouter();

          const router = new QueryRouter({
            systemCache,
            messageRouter,
          });

          const candidates = router.findServiceCandidates(nonExistentId);

          // Should return empty array for non-existent partition
          return candidates.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('empty array returned for non-existent partitions');
  });

  /**
   * Property: Only active partition services are returned.
   *
   * Services with non-active status or non-partition service type should
   * not be included in candidates.
   *
   * **Validates: Requirements 3.2**
   */
  t.test('only active partition services are returned', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (partitionId) => {
          // Create services with various statuses and types
          const services = [
            // Active partition service (should be included)
            {
              partition_id: partitionId,
              service_id: 'active-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              address: 'host1:8080',
              raft_role: RAFT_ROLE.LEADER,
              node_id: 'node-1',
            },
            // Inactive partition service (should be excluded)
            {
              partition_id: partitionId,
              service_id: 'inactive-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.STOPPED,
              address: 'host2:8080',
              raft_role: RAFT_ROLE.FOLLOWER,
              node_id: 'node-2',
            },
            // Active non-partition service (should be excluded)
            {
              partition_id: partitionId,
              service_id: 'active-message-group',
              service_type: SERVICE_TYPE.MESSAGE_GROUP,
              status: SERVICE_STATUS.ACTIVE,
              address: 'host3:8080',
              raft_role: RAFT_ROLE.LEADER,
              node_id: 'node-3',
            },
          ];

          const systemCache = createMockSystemCache(services);
          const messageRouter = createMockMessageRouter();

          const router = new QueryRouter({
            systemCache,
            messageRouter,
          });

          const candidates = router.findServiceCandidates(partitionId);

          // Should only return the active partition service
          if (candidates.length !== 1) {
            return false;
          }

          return candidates[0].address === 'host1:8080';
        },
      ),
      {numRuns: 10},
    );

    t.pass('only active partition services are returned');
  });
});
