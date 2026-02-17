/**
 * Unit tests for CacheHydrationGate.
 * Tests cache hydration completeness validation for bootstrap phase gates.
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {CacheHydrationGate} from '../../src/bootstrap/cache-hydration-gate.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

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
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
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
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.NODE_ID]: hasNodeId ? overrides.nodeId : 'node-1',
    [COLUMN.ADDRESS]: hasAddress ? overrides.address : 'ws://127.0.0.1:8080',
  };
}

// ============================================================================
// CacheHydrationGate Tests - Passes When All Leader Metadata Complete
// ============================================================================

test('CacheHydrationGate - passes when all partition leaders have complete metadata',
  async (t) => {
    const gate = new CacheHydrationGate();
    const cache = createMockCache({
      partitions: [
        createPartitionRecord('p1'),
        createPartitionRecord('p2'),
        createPartitionRecord('p3'),
      ],
      services: [
        createPartitionLeaderService('p1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
        createPartitionLeaderService('p2', {address: 'ws://node2:8080', nodeId: 'node-2'}),
        createPartitionLeaderService('p3', {address: 'ws://node3:8080', nodeId: 'node-3'}),
      ],
    });

    const result = gate.validate({systemTableCache: cache});

    t.equal(result.success, true, 'Should pass when all partition leaders complete');
    t.same(result.errors, [], 'Should have no errors');
    t.same(result.diagnostics.missingPartitionLeaders, [],
      'Should have no missing partition leaders');
    t.same(result.diagnostics.missingPartitionLeaderAddresses, [],
      'Should have no missing partition leader addresses');
  });

test('CacheHydrationGate - passes when all message group leaders have complete metadata',
  async (t) => {
    const gate = new CacheHydrationGate();
    const cache = createMockCache({
      messageGroups: [
        createMessageGroupRecord('mg1'),
        createMessageGroupRecord('mg2'),
      ],
      services: [
        createMessageGroupLeaderService('mg1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
        createMessageGroupLeaderService('mg2', {address: 'ws://node2:8080', nodeId: 'node-2'}),
      ],
    });

    const result = gate.validate({systemTableCache: cache});

    t.equal(result.success, true, 'Should pass when all message group leaders complete');
    t.same(result.errors, [], 'Should have no errors');
    t.same(result.diagnostics.missingMessageGroupLeaders, [],
      'Should have no missing message group leaders');
    t.same(result.diagnostics.missingMessageGroupLeaderAddresses, [],
      'Should have no missing message group leader addresses');
  });

test('CacheHydrationGate - passes when all partitions and message groups have complete metadata',
  async (t) => {
    const gate = new CacheHydrationGate();
    const cache = createMockCache({
      partitions: [
        createPartitionRecord('p1'),
        createPartitionRecord('p2'),
      ],
      messageGroups: [
        createMessageGroupRecord('mg1'),
        createMessageGroupRecord('mg2'),
      ],
      services: [
        createPartitionLeaderService('p1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
        createPartitionLeaderService('p2', {address: 'ws://node2:8080', nodeId: 'node-2'}),
        createMessageGroupLeaderService('mg1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
        createMessageGroupLeaderService('mg2', {address: 'ws://node2:8080', nodeId: 'node-2'}),
      ],
    });

    const result = gate.validate({systemTableCache: cache});

    t.equal(result.success, true, 'Should pass when all leaders complete');
    t.same(result.errors, [], 'Should have no errors');
  });

test('CacheHydrationGate - passes with empty cache (no partitions or message groups)',
  async (t) => {
    const gate = new CacheHydrationGate();
    const cache = createMockCache();

    const result = gate.validate({systemTableCache: cache});

    t.equal(result.success, true, 'Should pass with empty cache');
    t.same(result.errors, [], 'Should have no errors');
  });

// ============================================================================
// CacheHydrationGate Tests - Fails When Partition Leaders Missing
// ============================================================================

test('CacheHydrationGate - fails when partition leader service missing', async (t) => {
  const gate = new CacheHydrationGate();
  const cache = createMockCache({
    partitions: [
      createPartitionRecord('p1'),
      createPartitionRecord('p2'),
    ],
    services: [
      createPartitionLeaderService('p1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
      // p2 has no leader service
    ],
  });

  const result = gate.validate({systemTableCache: cache});

  t.equal(result.success, false, 'Should fail when partition leader missing');
  t.ok(result.errors.length > 0, 'Should have errors');
  t.ok(result.errors.includes('Cache hydration incomplete'),
    'Should include cache hydration incomplete error');
  t.same(result.diagnostics.missingPartitionLeaders, ['p2'],
    'Should report p2 as missing partition leader');
});

test('CacheHydrationGate - fails when multiple partition leaders missing', async (t) => {
  const gate = new CacheHydrationGate();
  const cache = createMockCache({
    partitions: [
      createPartitionRecord('p1'),
      createPartitionRecord('p2'),
      createPartitionRecord('p3'),
    ],
    services: [
      createPartitionLeaderService('p1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
      // p2 and p3 have no leader services
    ],
  });

  const result = gate.validate({systemTableCache: cache});

  t.equal(result.success, false, 'Should fail when multiple partition leaders missing');
  t.same(result.diagnostics.missingPartitionLeaders.sort(), ['p2', 'p3'],
    'Should report all missing partition leaders');
});

test('CacheHydrationGate - fails when partition leader has no address', async (t) => {
  const gate = new CacheHydrationGate();
  const cache = createMockCache({
    partitions: [
      createPartitionRecord('p1'),
      createPartitionRecord('p2'),
    ],
    services: [
      createPartitionLeaderService('p1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
      createPartitionLeaderService('p2', {address: null, nodeId: 'node-2'}), // Missing address
    ],
  });

  const result = gate.validate({systemTableCache: cache});

  t.equal(result.success, false, 'Should fail when partition leader missing address');
  t.same(result.diagnostics.missingPartitionLeaderAddresses, ['p2'],
    'Should report p2 as missing partition leader address');
});

// ============================================================================
// CacheHydrationGate Tests - Fails When Message Group Leaders Missing
// ============================================================================

test('CacheHydrationGate - fails when message group leader service missing', async (t) => {
  const gate = new CacheHydrationGate();
  const cache = createMockCache({
    messageGroups: [
      createMessageGroupRecord('mg1'),
      createMessageGroupRecord('mg2'),
    ],
    services: [
      createMessageGroupLeaderService('mg1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
      // mg2 has no leader service
    ],
  });

  const result = gate.validate({systemTableCache: cache});

  t.equal(result.success, false, 'Should fail when message group leader missing');
  t.ok(result.errors.includes('Cache hydration incomplete'),
    'Should include cache hydration incomplete error');
  t.same(result.diagnostics.missingMessageGroupLeaders, ['mg2'],
    'Should report mg2 as missing message group leader');
});

test('CacheHydrationGate - fails when multiple message group leaders missing', async (t) => {
  const gate = new CacheHydrationGate();
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

  const result = gate.validate({systemTableCache: cache});

  t.equal(result.success, false, 'Should fail when all message group leaders missing');
  t.same(result.diagnostics.missingMessageGroupLeaders.sort(), ['mg1', 'mg2', 'mg3'],
    'Should report all missing message group leaders');
});

test('CacheHydrationGate - fails when message group leader has no address', async (t) => {
  const gate = new CacheHydrationGate();
  const cache = createMockCache({
    messageGroups: [
      createMessageGroupRecord('mg1'),
      createMessageGroupRecord('mg2'),
    ],
    services: [
      createMessageGroupLeaderService('mg1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
      createMessageGroupLeaderService('mg2', {address: null, nodeId: 'node-2'}), // Missing address
    ],
  });

  const result = gate.validate({systemTableCache: cache});

  t.equal(result.success, false, 'Should fail when message group leader missing address');
  t.same(result.diagnostics.missingMessageGroupLeaderAddresses, ['mg2'],
    'Should report mg2 as missing message group leader address');
});

// ============================================================================
// CacheHydrationGate Tests - Returns Diagnostic Details on Failure
// ============================================================================

test('CacheHydrationGate - returns comprehensive diagnostics on mixed failures', async (t) => {
  const gate = new CacheHydrationGate();
  const cache = createMockCache({
    partitions: [
      createPartitionRecord('p1'),
      createPartitionRecord('p2'),
      createPartitionRecord('p3'),
    ],
    messageGroups: [
      createMessageGroupRecord('mg1'),
      createMessageGroupRecord('mg2'),
      createMessageGroupRecord('mg3'),
    ],
    services: [
      createPartitionLeaderService('p1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
      createPartitionLeaderService('p2', {address: null, nodeId: 'node-2'}), // Missing address
      // p3 has no leader service
      createMessageGroupLeaderService('mg1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
      // mg2 has no leader service
      createMessageGroupLeaderService('mg3', {address: null, nodeId: 'node-3'}), // Missing address
    ],
  });

  const result = gate.validate({systemTableCache: cache});

  t.equal(result.success, false, 'Should fail with mixed missing metadata');
  t.ok(result.errors.includes('Cache hydration incomplete'),
    'Should include cache hydration incomplete error');

  // Verify all diagnostic fields are populated correctly
  t.same(result.diagnostics.missingPartitionLeaders, ['p3'],
    'Should report p3 as missing partition leader');
  t.same(result.diagnostics.missingPartitionLeaderAddresses, ['p2'],
    'Should report p2 as missing partition leader address');
  t.same(result.diagnostics.missingMessageGroupLeaders, ['mg2'],
    'Should report mg2 as missing message group leader');
  t.same(result.diagnostics.missingMessageGroupLeaderAddresses, ['mg3'],
    'Should report mg3 as missing message group leader address');
});

test('CacheHydrationGate - diagnostics structure is always present', async (t) => {
  const gate = new CacheHydrationGate();
  const cache = createMockCache({
    partitions: [createPartitionRecord('p1')],
    services: [], // No leader services
  });

  const result = gate.validate({systemTableCache: cache});

  t.ok(result.diagnostics, 'Diagnostics object should exist');
  t.ok(Array.isArray(result.diagnostics.missingPartitionLeaders),
    'missingPartitionLeaders should be an array');
  t.ok(Array.isArray(result.diagnostics.missingMessageGroupLeaders),
    'missingMessageGroupLeaders should be an array');
  t.ok(Array.isArray(result.diagnostics.missingPartitionLeaderAddresses),
    'missingPartitionLeaderAddresses should be an array');
  t.ok(Array.isArray(result.diagnostics.missingMessageGroupLeaderAddresses),
    'missingMessageGroupLeaderAddresses should be an array');
});

test('CacheHydrationGate - diagnostics are empty arrays on success', async (t) => {
  const gate = new CacheHydrationGate();
  const cache = createMockCache({
    partitions: [createPartitionRecord('p1')],
    messageGroups: [createMessageGroupRecord('mg1')],
    services: [
      createPartitionLeaderService('p1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
      createMessageGroupLeaderService('mg1', {address: 'ws://node1:8080', nodeId: 'node-1'}),
    ],
  });

  const result = gate.validate({systemTableCache: cache});

  t.equal(result.success, true, 'Should pass');
  t.same(result.diagnostics.missingPartitionLeaders, [],
    'missingPartitionLeaders should be empty on success');
  t.same(result.diagnostics.missingMessageGroupLeaders, [],
    'missingMessageGroupLeaders should be empty on success');
  t.same(result.diagnostics.missingPartitionLeaderAddresses, [],
    'missingPartitionLeaderAddresses should be empty on success');
  t.same(result.diagnostics.missingMessageGroupLeaderAddresses, [],
    'missingMessageGroupLeaderAddresses should be empty on success');
});

// ============================================================================
// CacheHydrationGate Tests - Edge Cases
// ============================================================================

test('CacheHydrationGate - handles inactive leader services correctly', async (t) => {
  const gate = new CacheHydrationGate();
  const cache = createMockCache({
    partitions: [createPartitionRecord('p1')],
    services: [
      {
        [COLUMN.SERVICE_ID]: 'p1-leader',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: 'p1',
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.STATUS]: SERVICE_STATUS.STOPPED, // Inactive
        [COLUMN.NODE_ID]: 'node-1',
        [COLUMN.ADDRESS]: 'ws://node1:8080',
      },
    ],
  });

  const result = gate.validate({systemTableCache: cache});

  t.equal(result.success, false, 'Should fail when leader is inactive');
  t.same(result.diagnostics.missingPartitionLeaders, ['p1'],
    'Should report p1 as missing (inactive leader not counted)');
});

test('CacheHydrationGate - handles follower services correctly', async (t) => {
  const gate = new CacheHydrationGate();
  const cache = createMockCache({
    partitions: [createPartitionRecord('p1')],
    services: [
      {
        [COLUMN.SERVICE_ID]: 'p1-follower',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: 'p1',
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER, // Not a leader
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.NODE_ID]: 'node-1',
        [COLUMN.ADDRESS]: 'ws://node1:8080',
      },
    ],
  });

  const result = gate.validate({systemTableCache: cache});

  t.equal(result.success, false, 'Should fail when only follower exists');
  t.same(result.diagnostics.missingPartitionLeaders, ['p1'],
    'Should report p1 as missing (follower not counted as leader)');
});

test('CacheHydrationGate - extends PhaseGate base class', async (t) => {
  const gate = new CacheHydrationGate();

  t.ok(typeof gate.validate === 'function', 'Should have validate method');
});

