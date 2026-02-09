/**
 * Unit tests for LeaderReadinessGate.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  getMissingSystemServiceLeaders,
  isSystemTableWriteReady,
} from '../../src/cache/leader-readiness-gate.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {COLUMN, SERVICE_TYPE, STATE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';

// ============================================================================
// Test Setup and Teardown
// ============================================================================

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// ============================================================================
// Mock System Table Cache Helper Functions
// ============================================================================

/**
 * Create a mock system table cache with configurable data.
 * @param {Object} data - Data to populate the cache with.
 * @param {Array} data.partitions - Partition records.
 * @param {Array} data.messageGroups - Message group records.
 * @param {Array} data.services - Service records.
 * @return {Object} Mock cache object.
 */
function createMockCache(data = {}) {
  const tables = {
    [TABLES.PARTITIONS]: data.partitions || [],
    [TABLES.MESSAGE_GROUPS]: data.messageGroups || [],
    [TABLES.SERVICES]: data.services || [],
  };

  return {
    getAll: (tableName) => tables[tableName] || [],
    filter: (tableName, predicate) => {
      const records = tables[tableName] || [];
      return records.filter(predicate);
    },
  };
}

/**
 * Create a partition record.
 * @param {string} partitionId - Partition ID.
 * @param {Object} overrides - Optional field overrides.
 * @return {Object} Partition record.
 */
function createPartitionRecord(partitionId, overrides = {}) {
  return {
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.TABLE_ID]: overrides.tableId || `table-${partitionId}`,
    [COLUMN.LEADER_NODE_ID]: overrides.leaderNodeId || null,
    ...overrides,
  };
}

/**
 * Create a message group record.
 * @param {string} groupId - Group ID.
 * @param {Object} overrides - Optional field overrides.
 * @return {Object} Message group record.
 */
function createMessageGroupRecord(groupId, overrides = {}) {
  return {
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.LEADER_NODE_ID]: overrides.leaderNodeId || null,
    ...overrides,
  };
}

/**
 * Create a leader service record for a partition.
 * @param {string} partitionId - Partition ID.
 * @param {Object} overrides - Optional field overrides.
 * @return {Object} Service record.
 */
function createPartitionLeaderService(partitionId, overrides = {}) {
  const hasNodeId = Object.prototype.hasOwnProperty.call(overrides, 'nodeId');
  const hasAddress = Object.prototype.hasOwnProperty.call(overrides, 'address');
  return {
    [COLUMN.SERVICE_ID]: overrides.serviceId || `${partitionId}-leader`,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
    [COLUMN.STATUS]: STATE.ACTIVE,
    [COLUMN.NODE_ID]: hasNodeId ? overrides.nodeId : 'node-1',
    [COLUMN.ADDRESS]: hasAddress ? overrides.address : 'ws://127.0.0.1:8080',
  };
}

/**
 * Create a leader service record for a message group.
 * @param {string} groupId - Group ID.
 * @param {Object} overrides - Optional field overrides.
 * @return {Object} Service record.
 */
function createMessageGroupLeaderService(groupId, overrides = {}) {
  const hasNodeId = Object.prototype.hasOwnProperty.call(overrides, 'nodeId');
  const hasAddress = Object.prototype.hasOwnProperty.call(overrides, 'address');
  return {
    [COLUMN.SERVICE_ID]: overrides.serviceId || `${groupId}-leader`,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
    [COLUMN.STATUS]: STATE.ACTIVE,
    [COLUMN.NODE_ID]: hasNodeId ? overrides.nodeId : 'node-1',
    [COLUMN.ADDRESS]: hasAddress ? overrides.address : 'ws://127.0.0.1:8080',
  };
}

// ============================================================================
// getMissingSystemServiceLeaders Tests - Empty Cache
// ============================================================================

test('getMissingSystemServiceLeaders - returns empty arrays for null cache', async (t) => {
  const result = getMissingSystemServiceLeaders(null);

  t.same(result.missingPartitionLeaders, [], 'missingPartitionLeaders should be empty');
  t.same(result.missingMessageGroupLeaders, [], 'missingMessageGroupLeaders should be empty');
  t.same(result.missingPartitionLeaderAddresses, [],
    'missingPartitionLeaderAddresses should be empty');
  t.same(result.missingMessageGroupLeaderAddresses, [],
    'missingMessageGroupLeaderAddresses should be empty');
});

test('getMissingSystemServiceLeaders - returns empty arrays for empty cache', async (t) => {
  const cache = createMockCache();
  const result = getMissingSystemServiceLeaders(cache);

  t.same(result.missingPartitionLeaders, [], 'missingPartitionLeaders should be empty');
  t.same(result.missingMessageGroupLeaders, [], 'missingMessageGroupLeaders should be empty');
  t.same(result.missingPartitionLeaderAddresses, [],
    'missingPartitionLeaderAddresses should be empty');
  t.same(result.missingMessageGroupLeaderAddresses, [],
    'missingMessageGroupLeaderAddresses should be empty');
});

// ============================================================================
// getMissingSystemServiceLeaders Tests - All Leaders Present (Requirement 5.1)
// ============================================================================

test('getMissingSystemServiceLeaders - returns empty arrays when all partition leaders present',
  async (t) => {
    const cache = createMockCache({
      partitions: [
        createPartitionRecord('p1'),
        createPartitionRecord('p2'),
        createPartitionRecord('p3'),
      ],
      services: [
        createPartitionLeaderService('p1'),
        createPartitionLeaderService('p2'),
        createPartitionLeaderService('p3'),
      ],
    });

    const result = getMissingSystemServiceLeaders(cache);

    t.same(result.missingPartitionLeaders, [], 'missingPartitionLeaders should be empty');
    t.same(result.missingPartitionLeaderAddresses, [],
      'missingPartitionLeaderAddresses should be empty');
    t.same(result.missingPartitionLeaderNodes, [],
      'missingPartitionLeaderNodes should be empty');
  });

test('getMissingSystemServiceLeaders - returns empty arrays when all message group leaders present',
  async (t) => {
    const cache = createMockCache({
      messageGroups: [
        createMessageGroupRecord('mg1'),
        createMessageGroupRecord('mg2'),
      ],
      services: [
        createMessageGroupLeaderService('mg1'),
        createMessageGroupLeaderService('mg2'),
      ],
    });

    const result = getMissingSystemServiceLeaders(cache);

    t.same(result.missingMessageGroupLeaders, [], 'missingMessageGroupLeaders should be empty');
    t.same(result.missingMessageGroupLeaderAddresses, [],
      'missingMessageGroupLeaderAddresses should be empty');
    t.same(result.missingMessageGroupLeaderNodes, [],
      'missingMessageGroupLeaderNodes should be empty');
  });

test('getMissingSystemServiceLeaders - empty arrays when all leaders have addresses',
  async (t) => {
    const cache = createMockCache({
      partitions: [
        createPartitionRecord('p1'),
        createPartitionRecord('p2'),
      ],
      messageGroups: [
        createMessageGroupRecord('mg1'),
      ],
      services: [
        createPartitionLeaderService('p1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
        createPartitionLeaderService('p2', {address: 'ws://node2:8080', nodeId: 'node-2'}),
        createMessageGroupLeaderService('mg1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
      ],
    });

    const result = getMissingSystemServiceLeaders(cache);

    t.same(result.missingPartitionLeaders, [], 'missingPartitionLeaders should be empty');
    t.same(result.missingMessageGroupLeaders, [], 'missingMessageGroupLeaders should be empty');
    t.same(result.missingPartitionLeaderAddresses, [],
      'missingPartitionLeaderAddresses should be empty');
    t.same(result.missingMessageGroupLeaderAddresses, [],
      'missingMessageGroupLeaderAddresses should be empty');
  });

// ============================================================================
// getMissingSystemServiceLeaders Tests - Missing Partition Leaders (Requirement 5.2)
// ============================================================================

test('getMissingSystemServiceLeaders - identifies missing partition leaders', async (t) => {
  const cache = createMockCache({
    partitions: [
      createPartitionRecord('p1'),
      createPartitionRecord('p2'),
      createPartitionRecord('p3'),
    ],
    services: [
      createPartitionLeaderService('p1'),
      // p2 has no leader service
      createPartitionLeaderService('p3'),
    ],
  });

  const result = getMissingSystemServiceLeaders(cache);

  t.same(result.missingPartitionLeaders, ['p2'],
    'Should identify p2 as missing partition leader');
});

test('getMissingSystemServiceLeaders - identifies multiple missing partition leaders',
  async (t) => {
    const cache = createMockCache({
      partitions: [
        createPartitionRecord('p1'),
        createPartitionRecord('p2'),
        createPartitionRecord('p3'),
        createPartitionRecord('p4'),
      ],
      services: [
        createPartitionLeaderService('p1'),
        // p2, p3, p4 have no leader services
      ],
    });

    const result = getMissingSystemServiceLeaders(cache);

    t.same(result.missingPartitionLeaders.sort(), ['p2', 'p3', 'p4'],
      'Should identify all missing partition leaders');
  });

test('getMissingSystemServiceLeaders - does not count follower as leader', async (t) => {
  const cache = createMockCache({
    partitions: [
      createPartitionRecord('p1'),
    ],
    services: [
      {
        [COLUMN.SERVICE_ID]: 'p1-follower',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: 'p1',
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER, // Not a leader
        [COLUMN.STATUS]: STATE.ACTIVE,
        [COLUMN.NODE_ID]: 'node-1',
        [COLUMN.ADDRESS]: 'ws://127.0.0.1:8080',
      },
    ],
  });

  const result = getMissingSystemServiceLeaders(cache);

  t.same(result.missingPartitionLeaders, ['p1'],
    'Should not count follower as leader');
});

test('getMissingSystemServiceLeaders - does not count inactive leader', async (t) => {
  const cache = createMockCache({
    partitions: [
      createPartitionRecord('p1'),
    ],
    services: [
      {
        [COLUMN.SERVICE_ID]: 'p1-leader',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: 'p1',
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.STATUS]: STATE.STOPPED, // Not active
        [COLUMN.NODE_ID]: 'node-1',
        [COLUMN.ADDRESS]: 'ws://127.0.0.1:8080',
      },
    ],
  });

  const result = getMissingSystemServiceLeaders(cache);

  t.same(result.missingPartitionLeaders, ['p1'],
    'Should not count inactive leader');
});

// ============================================================================
// getMissingSystemServiceLeaders Tests - Missing Message Group Leaders (Requirement 5.3)
// ============================================================================

test('getMissingSystemServiceLeaders - identifies missing message group leaders', async (t) => {
  const cache = createMockCache({
    messageGroups: [
      createMessageGroupRecord('mg1'),
      createMessageGroupRecord('mg2'),
      createMessageGroupRecord('mg3'),
    ],
    services: [
      createMessageGroupLeaderService('mg1'),
      // mg2 has no leader service
      createMessageGroupLeaderService('mg3'),
    ],
  });

  const result = getMissingSystemServiceLeaders(cache);

  t.same(result.missingMessageGroupLeaders, ['mg2'],
    'Should identify mg2 as missing message group leader');
});

test('getMissingSystemServiceLeaders - identifies multiple missing message group leaders',
  async (t) => {
    const cache = createMockCache({
      messageGroups: [
        createMessageGroupRecord('mg1'),
        createMessageGroupRecord('mg2'),
        createMessageGroupRecord('mg3'),
      ],
      services: [
        // No leader services for any message group
      ],
    });

    const result = getMissingSystemServiceLeaders(cache);

    t.same(result.missingMessageGroupLeaders.sort(), ['mg1', 'mg2', 'mg3'],
      'Should identify all missing message group leaders');
  });

// ============================================================================
// getMissingSystemServiceLeaders Tests - Partial Metadata (Requirement 5.4)
// ============================================================================

test('getMissingSystemServiceLeaders - identifies leaders with missing addresses', async (t) => {
  const cache = createMockCache({
    partitions: [
      createPartitionRecord('p1'),
      createPartitionRecord('p2'),
    ],
    services: [
      createPartitionLeaderService('p1', {address: 'ws://node1:8080'}),
      createPartitionLeaderService('p2', {address: null}), // Missing address
    ],
  });

  const result = getMissingSystemServiceLeaders(cache);

  t.same(result.missingPartitionLeaders, [], 'p2 has a leader service');
  t.same(result.missingPartitionLeaderAddresses, ['p2'],
    'Should identify p2 as missing address');
});

test('getMissingSystemServiceLeaders - identifies message group leaders with missing addresses',
  async (t) => {
    const cache = createMockCache({
      messageGroups: [
        createMessageGroupRecord('mg1'),
        createMessageGroupRecord('mg2'),
      ],
      services: [
        createMessageGroupLeaderService('mg1', {address: 'ws://node1:8080'}),
        createMessageGroupLeaderService('mg2', {address: undefined}), // Missing address
      ],
    });

    const result = getMissingSystemServiceLeaders(cache);

    t.same(result.missingMessageGroupLeaders, [], 'mg2 has a leader service');
    t.same(result.missingMessageGroupLeaderAddresses, ['mg2'],
      'Should identify mg2 as missing address');
  });

test('getMissingSystemServiceLeaders - identifies leaders with missing node_id', async (t) => {
  const cache = createMockCache({
    partitions: [
      createPartitionRecord('p1'),
    ],
    services: [
      createPartitionLeaderService('p1', {nodeId: null, address: 'ws://node1:8080'}),
    ],
  });

  const result = getMissingSystemServiceLeaders(cache);

  t.same(result.missingPartitionLeaderNodes, ['p1'],
    'Should identify p1 as missing node_id');
});

test('getMissingSystemServiceLeaders - handles mixed missing metadata', async (t) => {
  const cache = createMockCache({
    partitions: [
      createPartitionRecord('p1'),
      createPartitionRecord('p2'),
      createPartitionRecord('p3'),
    ],
    messageGroups: [
      createMessageGroupRecord('mg1'),
      createMessageGroupRecord('mg2'),
    ],
    services: [
      createPartitionLeaderService('p1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
      createPartitionLeaderService('p2', {address: null, nodeId: 'node-2'}), // Missing address
      // p3 has no leader service at all
      createMessageGroupLeaderService('mg1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
      createMessageGroupLeaderService('mg2', {address: null, nodeId: null}), // Missing both
    ],
  });

  const result = getMissingSystemServiceLeaders(cache);

  t.same(result.missingPartitionLeaders, ['p3'], 'p3 has no leader');
  t.same(result.missingPartitionLeaderAddresses, ['p2'], 'p2 leader missing address');
  t.same(result.missingMessageGroupLeaders, [], 'All message groups have leaders');
  t.same(result.missingMessageGroupLeaderAddresses, ['mg2'], 'mg2 leader missing address');
  t.same(result.missingMessageGroupLeaderNodes, ['mg2'], 'mg2 leader missing node_id');
});

// ============================================================================
// getMissingSystemServiceLeaders Tests - requireLeaderNodeId Option
// ============================================================================

test('getMissingSystemServiceLeaders - requireLeaderNodeId checks partition table leader_node_id',
  async (t) => {
    const cache = createMockCache({
      partitions: [
        createPartitionRecord('p1', {leaderNodeId: 'node-1'}),
        createPartitionRecord('p2', {leaderNodeId: null}), // Missing in partition table
      ],
      services: [
        createPartitionLeaderService('p1', {nodeId: 'node-1', address: 'ws://node1:8080'}),
        createPartitionLeaderService('p2', {nodeId: 'node-2', address: 'ws://node2:8080'}),
      ],
    });

    const result = getMissingSystemServiceLeaders(cache, {requireLeaderNodeId: true});

    t.ok(result.missingPartitionLeaderNodes.includes('p2'),
      'Should identify p2 as missing leader_node_id in partition table');
  });

// ============================================================================
// getMissingSystemServiceLeaders Tests - Edge Cases
// ============================================================================

test('getMissingSystemServiceLeaders - skips partitions without partition_id', async (t) => {
  const cache = createMockCache({
    partitions: [
      {[COLUMN.TABLE_ID]: 'table-1'}, // No partition_id
      createPartitionRecord('p1'),
    ],
    services: [
      createPartitionLeaderService('p1'),
    ],
  });

  const result = getMissingSystemServiceLeaders(cache);

  t.same(result.missingPartitionLeaders, [],
    'Should skip partition without partition_id');
});

test('getMissingSystemServiceLeaders - skips message groups without group_id', async (t) => {
  const cache = createMockCache({
    messageGroups: [
      {name: 'unnamed-group'}, // No group_id
      createMessageGroupRecord('mg1'),
    ],
    services: [
      createMessageGroupLeaderService('mg1'),
    ],
  });

  const result = getMissingSystemServiceLeaders(cache);

  t.same(result.missingMessageGroupLeaders, [],
    'Should skip message group without group_id');
});

// ============================================================================
// isSystemTableWriteReady Tests
// ============================================================================

test('isSystemTableWriteReady - returns false for null cache', async (t) => {
  const result = isSystemTableWriteReady(null, TABLES.NODES);

  t.equal(result, false, 'Should return false for null cache');
});

test('isSystemTableWriteReady - returns false for unknown table', async (t) => {
  const cache = createMockCache();
  const result = isSystemTableWriteReady(cache, 'unknown_table');

  t.equal(result, false, 'Should return false for unknown table');
});

test('isSystemTableWriteReady - returns false when partition record missing', async (t) => {
  const cache = createMockCache({
    partitions: [], // No partition records
    services: [],
  });

  const result = isSystemTableWriteReady(cache, TABLES.NODES);

  t.equal(result, false, 'Should return false when partition record missing');
});

test('isSystemTableWriteReady - returns false when leader service missing', async (t) => {
  const partitionId = INITIAL_PARTITION_IDS[TABLES.NODES];
  const cache = createMockCache({
    partitions: [
      createPartitionRecord(partitionId),
    ],
    services: [], // No leader service
  });

  const result = isSystemTableWriteReady(cache, TABLES.NODES);

  t.equal(result, false, 'Should return false when leader service missing');
});

test('isSystemTableWriteReady - returns true when partition has leader with address', async (t) => {
  const partitionId = INITIAL_PARTITION_IDS[TABLES.NODES];
  const cache = createMockCache({
    partitions: [
      createPartitionRecord(partitionId),
    ],
    services: [
      createPartitionLeaderService(partitionId, {address: 'ws://node1:8080'}),
    ],
  });

  const result = isSystemTableWriteReady(cache, TABLES.NODES);

  t.equal(result, true, 'Should return true when leader has address');
});

test('isSystemTableWriteReady - returns false for non-services table without address',
  async (t) => {
    const partitionId = INITIAL_PARTITION_IDS[TABLES.NODES];
    const cache = createMockCache({
      partitions: [
        createPartitionRecord(partitionId),
      ],
      services: [
        createPartitionLeaderService(partitionId, {address: null}), // No address
      ],
    });

    const result = isSystemTableWriteReady(cache, TABLES.NODES);

    t.equal(result, false, 'Should return false for non-services table without address');
  });

test('isSystemTableWriteReady - services table uses relaxed check without address', async (t) => {
  const partitionId = INITIAL_PARTITION_IDS[TABLES.SERVICES];
  const cache = createMockCache({
    partitions: [
      createPartitionRecord(partitionId),
    ],
    services: [
      createPartitionLeaderService(partitionId, {address: null}), // No address
    ],
  });

  const result = isSystemTableWriteReady(cache, TABLES.SERVICES);

  t.equal(result, true,
    'Services table should use relaxed check (no address required)');
});
