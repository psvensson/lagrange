/**
 * Property-based tests for LeaderReadinessGate missing leader detection.
 *
 * Feature: cluster-reliability-improvements
 * Property 6: LeaderReadinessGate Missing Leader Detection
 *
 * For any system cache state with missing or partial leader metadata, the
 * getMissingSystemServiceLeaders function SHALL correctly identify all missing
 * partition leaders, missing message group leaders, and leaders with missing
 * addresses. The function SHALL return empty arrays only when all leaders are
 * present with complete metadata.
 *
 * **Validates: Requirements 5.2, 5.3, 5.4**
 */
// @ts-nocheck


import t from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {getMissingSystemServiceLeaders} from '../../src/cache/leader-readiness-gate.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

// ============================================================================
// Test Setup and Teardown
// ============================================================================

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

// ============================================================================
// Mock Cache Helpers
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
 * @param {Object} [options={}] - Record options.
 * @param {string|null} [options.leaderNodeId=null] - Canonical leader node ID.
 * @return {Object} Partition record.
 */
function createPartitionRecord(partitionId, options = {}) {
  return {
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.TABLE_ID]: `table-${partitionId}`,
    [COLUMN.LEADER_NODE_ID]: options.leaderNodeId ?? null,
  };
}

/**
 * Create a message group record.
 * @param {string} groupId - Group ID.
 * @param {Object} [options={}] - Record options.
 * @param {string|null} [options.leaderNodeId=null] - Canonical leader node ID.
 * @return {Object} Message group record.
 */
function createMessageGroupRecord(groupId, options = {}) {
  return {
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.LEADER_NODE_ID]: options.leaderNodeId ?? null,
  };
}

/**
 * Create a leader service record for a partition.
 * @param {string} partitionId - Partition ID.
 * @param {Object} options - Options for the service.
 * @param {string|null} options.address - Address (null for missing).
 * @param {string|null} options.nodeId - Node ID (null for missing).
 * @return {Object} Service record.
 */
function createPartitionLeaderService(partitionId, options = {}) {
  const hasAddress = options.address !== undefined;
  const hasNodeId = options.nodeId !== undefined;
  return {
    [COLUMN.SERVICE_ID]: `${partitionId}-leader`,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.NODE_ID]: hasNodeId ? options.nodeId : 'node-1',
    [COLUMN.ADDRESS]: hasAddress ? options.address : 'ws://127.0.0.1:8080',
  };
}

/**
 * Create a leader service record for a message group.
 * @param {string} groupId - Group ID.
 * @param {Object} options - Options for the service.
 * @param {string|null} options.address - Address (null for missing).
 * @param {string|null} options.nodeId - Node ID (null for missing).
 * @return {Object} Service record.
 */
function createMessageGroupLeaderService(groupId, options = {}) {
  const hasAddress = options.address !== undefined;
  const hasNodeId = options.nodeId !== undefined;
  return {
    [COLUMN.SERVICE_ID]: `${groupId}-leader`,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.NODE_ID]: hasNodeId ? options.nodeId : 'node-1',
    [COLUMN.ADDRESS]: hasAddress ? options.address : 'ws://127.0.0.1:8080',
  };
}

// ============================================================================
// Arbitraries for Property-Based Testing
// ============================================================================

/**
 * Generate a unique partition ID.
 * @return {fc.Arbitrary<string>} Arbitrary for partition IDs.
 */
const partitionIdArb = fc.string({minLength: 1, maxLength: 10})
  .filter((s) => s.trim().length > 0)
  .map((s) => `p-${s.replace(/[^a-zA-Z0-9]/g, '')}`);

/**
 * Generate a unique message group ID.
 * @return {fc.Arbitrary<string>} Arbitrary for message group IDs.
 */
const messageGroupIdArb = fc.string({minLength: 1, maxLength: 10})
  .filter((s) => s.trim().length > 0)
  .map((s) => `mg-${s.replace(/[^a-zA-Z0-9]/g, '')}`);

/**
 * Generate a valid address or null.
 * @return {fc.Arbitrary<string|null>} Arbitrary for addresses.
 */
const addressArb = fc.oneof(
  fc.constant('ws://127.0.0.1:8080'),
  fc.constant('ws://192.168.1.1:9090'),
  fc.constant(null),
);

/**
 * Generate a valid node ID or null.
 * @return {fc.Arbitrary<string|null>} Arbitrary for node IDs.
 */
const nodeIdArb = fc.oneof(
  fc.constant('node-1'),
  fc.constant('node-2'),
  fc.constant('node-3'),
  fc.constant(null),
);

/**
 * Generate a partition with optional leader service.
 * @return {fc.Arbitrary<Object>} Arbitrary for partition with leader info.
 */
const partitionWithLeaderArb = fc.record({
  partitionId: partitionIdArb,
  hasLeader: fc.boolean(),
  address: addressArb,
  nodeId: nodeIdArb,
});

/**
 * Generate a message group with optional leader service.
 * @return {fc.Arbitrary<Object>} Arbitrary for message group with leader info.
 */
const messageGroupWithLeaderArb = fc.record({
  groupId: messageGroupIdArb,
  hasLeader: fc.boolean(),
  address: addressArb,
  nodeId: nodeIdArb,
});

/**
 * Generate a cache state with varying leader completeness.
 * @return {fc.Arbitrary<Object>} Arbitrary for cache state.
 */
const cacheStateArb = fc.record({
  partitions: fc.array(partitionWithLeaderArb, {minLength: 0, maxLength: 5}),
  messageGroups: fc.array(messageGroupWithLeaderArb, {minLength: 0, maxLength: 5}),
});

/**
 * Build a mock cache from a generated cache state.
 * @param {Object} state - Generated cache state.
 * @return {Object} Mock cache and expected results.
 */
function buildCacheFromState(state) {
  const partitionRecords = [];
  const messageGroupRecords = [];
  const serviceRecords = [];

  const expectedMissingPartitionLeaders = [];
  const expectedMissingMessageGroupLeaders = [];
  const expectedMissingPartitionLeaderAddresses = [];
  const expectedMissingMessageGroupLeaderAddresses = [];
  const expectedMissingPartitionLeaderNodes = [];
  const expectedMissingMessageGroupLeaderNodes = [];

  // Deduplicate partition IDs
  const seenPartitionIds = new Set();
  for (const p of state.partitions) {
    if (seenPartitionIds.has(p.partitionId)) {
      continue;
    }
    seenPartitionIds.add(p.partitionId);

    const leaderNodeId = p.hasLeader ? p.nodeId : null;
    partitionRecords.push(createPartitionRecord(p.partitionId, {leaderNodeId}));

    if (p.hasLeader) {
      serviceRecords.push(createPartitionLeaderService(p.partitionId, {
        address: p.address,
        nodeId: p.nodeId,
      }));
    }

    const hasCanonicalLeader = p.hasLeader && Boolean(p.nodeId);
    if (!hasCanonicalLeader) {
      expectedMissingPartitionLeaders.push(p.partitionId);
      continue;
    }
    if (!p.address) {
      expectedMissingPartitionLeaderAddresses.push(p.partitionId);
    }
  }

  // Deduplicate message group IDs
  const seenGroupIds = new Set();
  for (const mg of state.messageGroups) {
    if (seenGroupIds.has(mg.groupId)) {
      continue;
    }
    seenGroupIds.add(mg.groupId);

    const leaderNodeId = mg.hasLeader ? mg.nodeId : null;
    messageGroupRecords.push(createMessageGroupRecord(mg.groupId, {leaderNodeId}));

    if (mg.hasLeader) {
      serviceRecords.push(createMessageGroupLeaderService(mg.groupId, {
        address: mg.address,
        nodeId: mg.nodeId,
      }));
    }

    const hasCanonicalLeader = mg.hasLeader && Boolean(mg.nodeId);
    if (!hasCanonicalLeader) {
      expectedMissingMessageGroupLeaders.push(mg.groupId);
      continue;
    }
    if (!mg.address) {
      expectedMissingMessageGroupLeaderAddresses.push(mg.groupId);
    }
  }

  const cache = createMockCache({
    partitions: partitionRecords,
    messageGroups: messageGroupRecords,
    services: serviceRecords,
  });

  return {
    cache,
    expected: {
      missingPartitionLeaders: expectedMissingPartitionLeaders,
      missingMessageGroupLeaders: expectedMissingMessageGroupLeaders,
      missingPartitionLeaderAddresses: expectedMissingPartitionLeaderAddresses,
      missingMessageGroupLeaderAddresses: expectedMissingMessageGroupLeaderAddresses,
      missingPartitionLeaderNodes: expectedMissingPartitionLeaderNodes,
      missingMessageGroupLeaderNodes: expectedMissingMessageGroupLeaderNodes,
    },
  };
}

// ============================================================================
// Property Tests
// ============================================================================

t.test('LeaderReadinessGate Property Tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  t.test('Property 6: Missing leader detection correctness', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 6**
     *
     * For any system cache state with missing or partial leader metadata, the
     * getMissingSystemServiceLeaders function SHALL correctly identify all
     * missing partition leaders, missing message group leaders, and leaders
     * with missing addresses.
     *
     * **Validates: Requirements 5.2, 5.3, 5.4**
     */
    fc.assert(
      fc.property(
        cacheStateArb,
        (state) => {
          const {cache, expected} = buildCacheFromState(state);
          const result = getMissingSystemServiceLeaders(cache);

          // Verify missing partition leaders are correctly identified
          const sortedExpectedPartitionLeaders = [...expected.missingPartitionLeaders].sort();
          const sortedResultPartitionLeaders = [...result.missingPartitionLeaders].sort();
          if (JSON.stringify(sortedExpectedPartitionLeaders) !==
              JSON.stringify(sortedResultPartitionLeaders)) {
            return false;
          }

          // Verify missing message group leaders are correctly identified
          const sortedExpectedMsgGroupLeaders = [...expected.missingMessageGroupLeaders].sort();
          const sortedResultMsgGroupLeaders = [...result.missingMessageGroupLeaders].sort();
          if (JSON.stringify(sortedExpectedMsgGroupLeaders) !==
              JSON.stringify(sortedResultMsgGroupLeaders)) {
            return false;
          }

          // Verify missing partition leader addresses are correctly identified
          const sortedExpectedPartitionAddrs =
            [...expected.missingPartitionLeaderAddresses].sort();
          const sortedResultPartitionAddrs =
            [...result.missingPartitionLeaderAddresses].sort();
          if (JSON.stringify(sortedExpectedPartitionAddrs) !==
              JSON.stringify(sortedResultPartitionAddrs)) {
            return false;
          }

          // Verify missing message group leader addresses are correctly identified
          const sortedExpectedMsgGroupAddrs =
            [...expected.missingMessageGroupLeaderAddresses].sort();
          const sortedResultMsgGroupAddrs =
            [...result.missingMessageGroupLeaderAddresses].sort();
          if (JSON.stringify(sortedExpectedMsgGroupAddrs) !==
              JSON.stringify(sortedResultMsgGroupAddrs)) {
            return false;
          }

          // Verify missing partition leader nodes are correctly identified
          const sortedExpectedPartitionNodes =
            [...expected.missingPartitionLeaderNodes].sort();
          const sortedResultPartitionNodes =
            [...result.missingPartitionLeaderNodes].sort();
          if (JSON.stringify(sortedExpectedPartitionNodes) !==
              JSON.stringify(sortedResultPartitionNodes)) {
            return false;
          }

          // Verify missing message group leader nodes are correctly identified
          const sortedExpectedMsgGroupNodes =
            [...expected.missingMessageGroupLeaderNodes].sort();
          const sortedResultMsgGroupNodes =
            [...result.missingMessageGroupLeaderNodes].sort();
          if (JSON.stringify(sortedExpectedMsgGroupNodes) !==
              JSON.stringify(sortedResultMsgGroupNodes)) {
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('getMissingSystemServiceLeaders correctly identifies all missing leaders');
  });

  t.test('Property 6: Empty arrays only when all leaders present with complete metadata',
    async (t) => {
      /**
       * **Feature: cluster-reliability-improvements, Property 6**
       *
       * The function SHALL return empty arrays only when all leaders are present
       * with complete metadata.
       *
       * **Validates: Requirements 5.2, 5.3, 5.4**
       */
      fc.assert(
        fc.property(
          cacheStateArb,
          (state) => {
            const {cache, expected} = buildCacheFromState(state);
            const result = getMissingSystemServiceLeaders(cache);

            // Check if all result arrays are empty
            const allResultArraysEmpty =
            result.missingPartitionLeaders.length === 0 &&
            result.missingMessageGroupLeaders.length === 0 &&
            result.missingPartitionLeaderAddresses.length === 0 &&
            result.missingMessageGroupLeaderAddresses.length === 0 &&
            result.missingPartitionLeaderNodes.length === 0 &&
            result.missingMessageGroupLeaderNodes.length === 0;

            // Check if all expected arrays are empty (all leaders present with complete metadata)
            const allExpectedArraysEmpty =
            expected.missingPartitionLeaders.length === 0 &&
            expected.missingMessageGroupLeaders.length === 0 &&
            expected.missingPartitionLeaderAddresses.length === 0 &&
            expected.missingMessageGroupLeaderAddresses.length === 0 &&
            expected.missingPartitionLeaderNodes.length === 0 &&
            expected.missingMessageGroupLeaderNodes.length === 0;

            // Empty arrays should only occur when all leaders are present with complete metadata
            return allResultArraysEmpty === allExpectedArraysEmpty;
          },
        ),
        {numRuns: 10},
      );

      t.pass('Empty arrays returned only when all leaders present with complete metadata');
    });

  t.test('Property 6: Partition leader detection is exhaustive', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 6**
     *
     * For any partition in the cache without a leader service, that partition
     * SHALL appear in missingPartitionLeaders.
     *
     * **Validates: Requirements 5.2**
     */
    fc.assert(
      fc.property(
        fc.array(partitionWithLeaderArb, {minLength: 1, maxLength: 5}),
        (partitions) => {
          // Deduplicate
          const uniquePartitions = [];
          const seen = new Set();
          for (const p of partitions) {
            if (!seen.has(p.partitionId)) {
              seen.add(p.partitionId);
              uniquePartitions.push(p);
            }
          }

          const state = {partitions: uniquePartitions, messageGroups: []};
          const {cache} = buildCacheFromState(state);
          const result = getMissingSystemServiceLeaders(cache);

          // Every partition without canonical owner-row leader should be missing.
          for (const p of uniquePartitions) {
            const hasCanonicalLeader = p.hasLeader && Boolean(p.nodeId);
            if (!hasCanonicalLeader) {
              if (!result.missingPartitionLeaders.includes(p.partitionId)) {
                return false;
              }
            }
          }

          // Every partition marked missing should lack a canonical leader.
          for (const partitionId of result.missingPartitionLeaders) {
            const partition = uniquePartitions.find((p) => p.partitionId === partitionId);
            if (partition &&
                partition.hasLeader &&
                Boolean(partition.nodeId)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Partition leader detection is exhaustive');
  });

  t.test('Property 6: Message group leader detection is exhaustive', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 6**
     *
     * For any message group in the cache without a leader service, that group
     * SHALL appear in missingMessageGroupLeaders.
     *
     * **Validates: Requirements 5.3**
     */
    fc.assert(
      fc.property(
        fc.array(messageGroupWithLeaderArb, {minLength: 1, maxLength: 5}),
        (messageGroups) => {
          // Deduplicate
          const uniqueGroups = [];
          const seen = new Set();
          for (const mg of messageGroups) {
            if (!seen.has(mg.groupId)) {
              seen.add(mg.groupId);
              uniqueGroups.push(mg);
            }
          }

          const state = {partitions: [], messageGroups: uniqueGroups};
          const {cache} = buildCacheFromState(state);
          const result = getMissingSystemServiceLeaders(cache);

          // Every group without canonical owner-row leader should be missing.
          for (const mg of uniqueGroups) {
            const hasCanonicalLeader = mg.hasLeader && Boolean(mg.nodeId);
            if (!hasCanonicalLeader) {
              if (!result.missingMessageGroupLeaders.includes(mg.groupId)) {
                return false;
              }
            }
          }

          // Every group marked missing should lack a canonical leader.
          for (const groupId of result.missingMessageGroupLeaders) {
            const group = uniqueGroups.find((mg) => mg.groupId === groupId);
            if (group &&
                group.hasLeader &&
                Boolean(group.nodeId)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Message group leader detection is exhaustive');
  });

  t.test('Property 6: Address detection for leaders with missing addresses', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 6**
     *
     * For any leader service with a missing address, that partition/group
     * SHALL appear in the corresponding missingLeaderAddresses array.
     *
     * **Validates: Requirements 5.4**
     */
    fc.assert(
      fc.property(
        cacheStateArb,
        (state) => {
          const {cache} = buildCacheFromState(state);
          const result = getMissingSystemServiceLeaders(cache);

          // Deduplicate partitions for checking
          const seenPartitions = new Set();
          for (const p of state.partitions) {
            if (seenPartitions.has(p.partitionId)) {
              continue;
            }
            seenPartitions.add(p.partitionId);

            const hasCanonicalLeader = p.hasLeader && Boolean(p.nodeId);

            // Canonical leader without address should be listed as missing address.
            if (hasCanonicalLeader && !p.address) {
              if (!result.missingPartitionLeaderAddresses.includes(p.partitionId)) {
                return false;
              }
            }
            if (hasCanonicalLeader && p.address) {
              if (result.missingPartitionLeaderAddresses.includes(p.partitionId)) {
                return false;
              }
            }
          }

          // Deduplicate message groups for checking
          const seenGroups = new Set();
          for (const mg of state.messageGroups) {
            if (seenGroups.has(mg.groupId)) {
              continue;
            }
            seenGroups.add(mg.groupId);

            const hasCanonicalLeader = mg.hasLeader && Boolean(mg.nodeId);

            // Canonical leader without address should be listed as missing address.
            if (hasCanonicalLeader && !mg.address) {
              if (!result.missingMessageGroupLeaderAddresses.includes(mg.groupId)) {
                return false;
              }
            }
            if (hasCanonicalLeader && mg.address) {
              if (result.missingMessageGroupLeaderAddresses.includes(mg.groupId)) {
                return false;
              }
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Address detection correctly identifies leaders with missing addresses');
  });
});
