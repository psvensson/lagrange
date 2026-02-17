/**
 * Property-based tests for CacheHydrationGate leader metadata completeness.
 *
 * Feature: cluster-reliability-improvements
 *
 * Property 4: Cache Hydration Leader Metadata Completeness
 * For any cache hydration verification, the verification SHALL check that
 * leader metadata exists for all partitions and all message groups. The
 * verification SHALL pass only if every partition has a leader service with
 * address and every message group has a leader service with address.
 * **Validates: Requirements 4.2, 4.3**
 *
 * Property 5: Incomplete Cache Hydration Reporting
 * For any incomplete cache hydration state, the verification result SHALL
 * report the specific partitions missing leaders, message groups missing
 * leaders, and any leaders missing addresses.
 * **Validates: Requirements 4.4**
 */

import t from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {CacheHydrationGate} from '../../src/bootstrap/cache-hydration-gate.js';
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
 * @return {Object} Partition record.
 */
function createPartitionRecord(partitionId) {
  return {
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.TABLE_ID]: `table-${partitionId}`,
    [COLUMN.LEADER_NODE_ID]: null,
  };
}

/**
 * Create a message group record.
 * @param {string} groupId - Group ID.
 * @return {Object} Message group record.
 */
function createMessageGroupRecord(groupId) {
  return {
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.LEADER_NODE_ID]: null,
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
 * @return {Object} Mock cache and expected gate result.
 */
function buildCacheFromState(state) {
  const partitionRecords = [];
  const messageGroupRecords = [];
  const serviceRecords = [];

  let allPartitionsHaveLeadersWithAddresses = true;
  let allMessageGroupsHaveLeadersWithAddresses = true;

  // Deduplicate partition IDs
  const seenPartitionIds = new Set();
  for (const p of state.partitions) {
    if (seenPartitionIds.has(p.partitionId)) {
      continue;
    }
    seenPartitionIds.add(p.partitionId);

    partitionRecords.push(createPartitionRecord(p.partitionId));

    if (p.hasLeader) {
      serviceRecords.push(createPartitionLeaderService(p.partitionId, {
        address: p.address,
        nodeId: p.nodeId,
      }));

      // Check for missing address - gate requires address
      if (!p.address) {
        allPartitionsHaveLeadersWithAddresses = false;
      }
    } else {
      allPartitionsHaveLeadersWithAddresses = false;
    }
  }

  // Deduplicate message group IDs
  const seenGroupIds = new Set();
  for (const mg of state.messageGroups) {
    if (seenGroupIds.has(mg.groupId)) {
      continue;
    }
    seenGroupIds.add(mg.groupId);

    messageGroupRecords.push(createMessageGroupRecord(mg.groupId));

    if (mg.hasLeader) {
      serviceRecords.push(createMessageGroupLeaderService(mg.groupId, {
        address: mg.address,
        nodeId: mg.nodeId,
      }));

      // Check for missing address - gate requires address
      if (!mg.address) {
        allMessageGroupsHaveLeadersWithAddresses = false;
      }
    } else {
      allMessageGroupsHaveLeadersWithAddresses = false;
    }
  }

  const cache = createMockCache({
    partitions: partitionRecords,
    messageGroups: messageGroupRecords,
    services: serviceRecords,
  });

  // Gate should pass only if all partitions AND all message groups have
  // leaders with addresses
  const expectedSuccess =
    allPartitionsHaveLeadersWithAddresses &&
    allMessageGroupsHaveLeadersWithAddresses;

  return {
    cache,
    expectedSuccess,
  };
}

// ============================================================================
// Property Tests
// ============================================================================

t.test('CacheHydrationGate Property Tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  t.test('Property 4: Gate passes only when all leaders have addresses', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 4**
     *
     * For any cache hydration verification, the verification SHALL check that
     * leader metadata exists for all partitions and all message groups. The
     * verification SHALL pass only if every partition has a leader service
     * with address and every message group has a leader service with address.
     *
     * **Validates: Requirements 4.2, 4.3**
     */
    const gate = new CacheHydrationGate();

    fc.assert(
      fc.property(
        cacheStateArb,
        (state) => {
          const {cache, expectedSuccess} = buildCacheFromState(state);
          const result = gate.validate({systemTableCache: cache});

          // The gate should pass if and only if all leaders have addresses
          return result.success === expectedSuccess;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Gate passes only when all leaders have addresses');
  });

  t.test('Property 4: Gate checks all partitions for leader metadata', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 4**
     *
     * For any cache state with partitions, the gate SHALL verify that each
     * partition has a leader service with an address.
     *
     * **Validates: Requirements 4.2**
     */
    const gate = new CacheHydrationGate();

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
          const {cache, expectedSuccess} = buildCacheFromState(state);
          const result = gate.validate({systemTableCache: cache});

          // Gate should pass only if all partitions have leaders with addresses
          return result.success === expectedSuccess;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Gate checks all partitions for leader metadata');
  });

  t.test('Property 4: Gate checks all message groups for leader metadata', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 4**
     *
     * For any cache state with message groups, the gate SHALL verify that each
     * message group has a leader service with an address.
     *
     * **Validates: Requirements 4.3**
     */
    const gate = new CacheHydrationGate();

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
          const {cache, expectedSuccess} = buildCacheFromState(state);
          const result = gate.validate({systemTableCache: cache});

          // Gate should pass only if all message groups have leaders with addresses
          return result.success === expectedSuccess;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Gate checks all message groups for leader metadata');
  });

  t.test('Property 4: Gate fails if any partition missing leader', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 4**
     *
     * For any cache state where at least one partition is missing a leader,
     * the gate SHALL fail.
     *
     * **Validates: Requirements 4.2**
     */
    const gate = new CacheHydrationGate();

    // Generate at least one partition without a leader
    const partitionWithoutLeaderArb = fc.record({
      partitionId: partitionIdArb,
      hasLeader: fc.constant(false),
      address: addressArb,
      nodeId: nodeIdArb,
    });

    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(partitionWithLeaderArb, {minLength: 0, maxLength: 3}),
          partitionWithoutLeaderArb,
        ),
        ([otherPartitions, partitionWithoutLeader]) => {
          // Combine partitions, ensuring the one without leader is included
          const allPartitions = [...otherPartitions, partitionWithoutLeader];

          // Deduplicate
          const uniquePartitions = [];
          const seen = new Set();
          for (const p of allPartitions) {
            if (!seen.has(p.partitionId)) {
              seen.add(p.partitionId);
              uniquePartitions.push(p);
            }
          }

          // Ensure we still have the partition without leader
          const hasPartitionWithoutLeader = uniquePartitions.some(
            (p) => p.partitionId === partitionWithoutLeader.partitionId && !p.hasLeader,
          );

          if (!hasPartitionWithoutLeader) {
            // Skip this case - deduplication removed our test partition
            return true;
          }

          const state = {partitions: uniquePartitions, messageGroups: []};
          const {cache} = buildCacheFromState(state);
          const result = gate.validate({systemTableCache: cache});

          // Gate should fail when any partition is missing a leader
          return result.success === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Gate fails if any partition missing leader');
  });

  t.test('Property 4: Gate fails if any message group missing leader', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 4**
     *
     * For any cache state where at least one message group is missing a leader,
     * the gate SHALL fail.
     *
     * **Validates: Requirements 4.3**
     */
    const gate = new CacheHydrationGate();

    // Generate at least one message group without a leader
    const messageGroupWithoutLeaderArb = fc.record({
      groupId: messageGroupIdArb,
      hasLeader: fc.constant(false),
      address: addressArb,
      nodeId: nodeIdArb,
    });

    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(messageGroupWithLeaderArb, {minLength: 0, maxLength: 3}),
          messageGroupWithoutLeaderArb,
        ),
        ([otherGroups, groupWithoutLeader]) => {
          // Combine message groups, ensuring the one without leader is included
          const allGroups = [...otherGroups, groupWithoutLeader];

          // Deduplicate
          const uniqueGroups = [];
          const seen = new Set();
          for (const mg of allGroups) {
            if (!seen.has(mg.groupId)) {
              seen.add(mg.groupId);
              uniqueGroups.push(mg);
            }
          }

          // Ensure we still have the message group without leader
          const hasGroupWithoutLeader = uniqueGroups.some(
            (mg) => mg.groupId === groupWithoutLeader.groupId && !mg.hasLeader,
          );

          if (!hasGroupWithoutLeader) {
            // Skip this case - deduplication removed our test group
            return true;
          }

          const state = {partitions: [], messageGroups: uniqueGroups};
          const {cache} = buildCacheFromState(state);
          const result = gate.validate({systemTableCache: cache});

          // Gate should fail when any message group is missing a leader
          return result.success === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Gate fails if any message group missing leader');
  });

  t.test('Property 4: Gate fails if any leader missing address', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 4**
     *
     * For any cache state where at least one leader is missing an address,
     * the gate SHALL fail.
     *
     * **Validates: Requirements 4.2, 4.3**
     */
    const gate = new CacheHydrationGate();

    // Generate a partition with leader but no address
    const partitionWithLeaderNoAddressArb = fc.record({
      partitionId: partitionIdArb,
      hasLeader: fc.constant(true),
      address: fc.constant(null),
      nodeId: nodeIdArb,
    });

    fc.assert(
      fc.property(
        partitionWithLeaderNoAddressArb,
        (partition) => {
          const state = {partitions: [partition], messageGroups: []};
          const {cache} = buildCacheFromState(state);
          const result = gate.validate({systemTableCache: cache});

          // Gate should fail when leader is missing address
          return result.success === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Gate fails if any leader missing address');
  });

  t.test('Property 4: Gate passes with empty cache', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 4**
     *
     * For an empty cache (no partitions, no message groups), the gate SHALL
     * pass since there are no leaders to verify.
     *
     * **Validates: Requirements 4.2, 4.3**
     */
    const gate = new CacheHydrationGate();
    const cache = createMockCache({
      partitions: [],
      messageGroups: [],
      services: [],
    });

    const result = gate.validate({systemTableCache: cache});

    t.equal(result.success, true, 'Gate should pass with empty cache');
    t.pass('Gate passes with empty cache');
  });

  // ==========================================================================
  // Property 5: Incomplete Cache Hydration Reporting
  // ==========================================================================

  t.test('Property 5: Diagnostics report all missing partition leaders', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 5**
     *
     * For any incomplete cache hydration state where partitions are missing
     * leaders, the verification result SHALL report the specific partitions
     * missing leaders in the diagnostics.
     *
     * **Validates: Requirements 4.4**
     */
    const gate = new CacheHydrationGate();

    // Generate partitions where some have leaders and some don't
    const incompleteCacheStateArb = fc.record({
      partitionsWithLeaders: fc.array(partitionIdArb, {minLength: 0, maxLength: 3}),
      partitionsWithoutLeaders: fc.array(partitionIdArb, {minLength: 1, maxLength: 3}),
    });

    fc.assert(
      fc.property(
        incompleteCacheStateArb,
        (state) => {
          // Deduplicate partition IDs
          const withLeadersSet = new Set(state.partitionsWithLeaders);
          const withoutLeadersSet = new Set(state.partitionsWithoutLeaders);

          // Remove any overlap - partitions without leaders take precedence
          for (const id of withoutLeadersSet) {
            withLeadersSet.delete(id);
          }

          const partitionRecords = [];
          const serviceRecords = [];

          // Add partitions with leaders
          for (const partitionId of withLeadersSet) {
            partitionRecords.push(createPartitionRecord(partitionId));
            serviceRecords.push(createPartitionLeaderService(partitionId, {
              address: 'ws://127.0.0.1:8080',
              nodeId: 'node-1',
            }));
          }

          // Add partitions without leaders
          for (const partitionId of withoutLeadersSet) {
            partitionRecords.push(createPartitionRecord(partitionId));
            // No leader service added
          }

          const cache = createMockCache({
            partitions: partitionRecords,
            messageGroups: [],
            services: serviceRecords,
          });

          const result = gate.validate({systemTableCache: cache});

          // Verify diagnostics report all missing partition leaders
          const reportedMissing = new Set(result.diagnostics.missingPartitionLeaders);
          for (const partitionId of withoutLeadersSet) {
            if (!reportedMissing.has(partitionId)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Diagnostics report all missing partition leaders');
  });

  t.test('Property 5: Diagnostics report all missing message group leaders', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 5**
     *
     * For any incomplete cache hydration state where message groups are missing
     * leaders, the verification result SHALL report the specific message groups
     * missing leaders in the diagnostics.
     *
     * **Validates: Requirements 4.4**
     */
    const gate = new CacheHydrationGate();

    // Generate message groups where some have leaders and some don't
    const incompleteCacheStateArb = fc.record({
      groupsWithLeaders: fc.array(messageGroupIdArb, {minLength: 0, maxLength: 3}),
      groupsWithoutLeaders: fc.array(messageGroupIdArb, {minLength: 1, maxLength: 3}),
    });

    fc.assert(
      fc.property(
        incompleteCacheStateArb,
        (state) => {
          // Deduplicate group IDs
          const withLeadersSet = new Set(state.groupsWithLeaders);
          const withoutLeadersSet = new Set(state.groupsWithoutLeaders);

          // Remove any overlap - groups without leaders take precedence
          for (const id of withoutLeadersSet) {
            withLeadersSet.delete(id);
          }

          const messageGroupRecords = [];
          const serviceRecords = [];

          // Add message groups with leaders
          for (const groupId of withLeadersSet) {
            messageGroupRecords.push(createMessageGroupRecord(groupId));
            serviceRecords.push(createMessageGroupLeaderService(groupId, {
              address: 'ws://127.0.0.1:8080',
              nodeId: 'node-1',
            }));
          }

          // Add message groups without leaders
          for (const groupId of withoutLeadersSet) {
            messageGroupRecords.push(createMessageGroupRecord(groupId));
            // No leader service added
          }

          const cache = createMockCache({
            partitions: [],
            messageGroups: messageGroupRecords,
            services: serviceRecords,
          });

          const result = gate.validate({systemTableCache: cache});

          // Verify diagnostics report all missing message group leaders
          const reportedMissing = new Set(result.diagnostics.missingMessageGroupLeaders);
          for (const groupId of withoutLeadersSet) {
            if (!reportedMissing.has(groupId)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Diagnostics report all missing message group leaders');
  });

  t.test('Property 5: Diagnostics report all partition leaders missing addresses', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 5**
     *
     * For any incomplete cache hydration state where partition leaders exist
     * but are missing addresses, the verification result SHALL report the
     * specific partitions with leaders missing addresses.
     *
     * **Validates: Requirements 4.4**
     */
    const gate = new CacheHydrationGate();

    // Generate partitions where some leaders have addresses and some don't
    const incompleteCacheStateArb = fc.record({
      partitionsWithAddresses: fc.array(partitionIdArb, {minLength: 0, maxLength: 3}),
      partitionsWithoutAddresses: fc.array(partitionIdArb, {minLength: 1, maxLength: 3}),
    });

    fc.assert(
      fc.property(
        incompleteCacheStateArb,
        (state) => {
          // Deduplicate partition IDs
          const withAddressesSet = new Set(state.partitionsWithAddresses);
          const withoutAddressesSet = new Set(state.partitionsWithoutAddresses);

          // Remove any overlap - partitions without addresses take precedence
          for (const id of withoutAddressesSet) {
            withAddressesSet.delete(id);
          }

          const partitionRecords = [];
          const serviceRecords = [];

          // Add partitions with leaders that have addresses
          for (const partitionId of withAddressesSet) {
            partitionRecords.push(createPartitionRecord(partitionId));
            serviceRecords.push(createPartitionLeaderService(partitionId, {
              address: 'ws://127.0.0.1:8080',
              nodeId: 'node-1',
            }));
          }

          // Add partitions with leaders that are missing addresses
          for (const partitionId of withoutAddressesSet) {
            partitionRecords.push(createPartitionRecord(partitionId));
            serviceRecords.push(createPartitionLeaderService(partitionId, {
              address: null,
              nodeId: 'node-1',
            }));
          }

          const cache = createMockCache({
            partitions: partitionRecords,
            messageGroups: [],
            services: serviceRecords,
          });

          const result = gate.validate({systemTableCache: cache});

          // Verify diagnostics report all partition leaders missing addresses
          const reportedMissing = new Set(
            result.diagnostics.missingPartitionLeaderAddresses,
          );
          for (const partitionId of withoutAddressesSet) {
            if (!reportedMissing.has(partitionId)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Diagnostics report all partition leaders missing addresses');
  });

  t.test('Property 5: Diagnostics report all message group leaders missing addresses',
    async (t) => {
      /**
       * **Feature: cluster-reliability-improvements, Property 5**
       *
       * For any incomplete cache hydration state where message group leaders
       * exist but are missing addresses, the verification result SHALL report
       * the specific message groups with leaders missing addresses.
       *
       * **Validates: Requirements 4.4**
       */
      const gate = new CacheHydrationGate();

      // Generate message groups where some leaders have addresses and some don't
      const incompleteCacheStateArb = fc.record({
        groupsWithAddresses: fc.array(messageGroupIdArb, {minLength: 0, maxLength: 3}),
        groupsWithoutAddresses: fc.array(messageGroupIdArb, {minLength: 1, maxLength: 3}),
      });

      fc.assert(
        fc.property(
          incompleteCacheStateArb,
          (state) => {
            // Deduplicate group IDs
            const withAddressesSet = new Set(state.groupsWithAddresses);
            const withoutAddressesSet = new Set(state.groupsWithoutAddresses);

            // Remove any overlap - groups without addresses take precedence
            for (const id of withoutAddressesSet) {
              withAddressesSet.delete(id);
            }

            const messageGroupRecords = [];
            const serviceRecords = [];

            // Add message groups with leaders that have addresses
            for (const groupId of withAddressesSet) {
              messageGroupRecords.push(createMessageGroupRecord(groupId));
              serviceRecords.push(createMessageGroupLeaderService(groupId, {
                address: 'ws://127.0.0.1:8080',
                nodeId: 'node-1',
              }));
            }

            // Add message groups with leaders that are missing addresses
            for (const groupId of withoutAddressesSet) {
              messageGroupRecords.push(createMessageGroupRecord(groupId));
              serviceRecords.push(createMessageGroupLeaderService(groupId, {
                address: null,
                nodeId: 'node-1',
              }));
            }

            const cache = createMockCache({
              partitions: [],
              messageGroups: messageGroupRecords,
              services: serviceRecords,
            });

            const result = gate.validate({systemTableCache: cache});

            // Verify diagnostics report all message group leaders missing addresses
            const reportedMissing = new Set(
              result.diagnostics.missingMessageGroupLeaderAddresses,
            );
            for (const groupId of withoutAddressesSet) {
              if (!reportedMissing.has(groupId)) {
                return false;
              }
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass('Diagnostics report all message group leaders missing addresses');
    });

  t.test('Property 5: Diagnostics report all types of missing items together', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 5**
     *
     * For any incomplete cache hydration state with multiple types of missing
     * items (missing partition leaders, missing message group leaders, leaders
     * missing addresses), the verification result SHALL report ALL missing
     * items in the diagnostics.
     *
     * **Validates: Requirements 4.4**
     */
    const gate = new CacheHydrationGate();

    // Generate a complex incomplete state with all types of missing items
    const complexIncompleteStateArb = fc.record({
      // Partitions with complete leaders
      completePartitions: fc.array(partitionIdArb, {minLength: 0, maxLength: 2}),
      // Partitions missing leaders entirely
      partitionsMissingLeaders: fc.array(partitionIdArb, {minLength: 0, maxLength: 2}),
      // Partitions with leaders missing addresses
      partitionsMissingAddresses: fc.array(partitionIdArb, {minLength: 0, maxLength: 2}),
      // Message groups with complete leaders
      completeMessageGroups: fc.array(messageGroupIdArb, {minLength: 0, maxLength: 2}),
      // Message groups missing leaders entirely
      groupsMissingLeaders: fc.array(messageGroupIdArb, {minLength: 0, maxLength: 2}),
      // Message groups with leaders missing addresses
      groupsMissingAddresses: fc.array(messageGroupIdArb, {minLength: 0, maxLength: 2}),
    }).filter((state) => {
      // Ensure at least one type of missing item exists
      return state.partitionsMissingLeaders.length > 0 ||
        state.partitionsMissingAddresses.length > 0 ||
        state.groupsMissingLeaders.length > 0 ||
        state.groupsMissingAddresses.length > 0;
    });

    fc.assert(
      fc.property(
        complexIncompleteStateArb,
        (state) => {
          // Deduplicate all partition IDs
          const completePartitionsSet = new Set(state.completePartitions);
          const partitionsMissingLeadersSet = new Set(state.partitionsMissingLeaders);
          const partitionsMissingAddressesSet = new Set(state.partitionsMissingAddresses);

          // Remove overlaps - missing leaders > missing addresses > complete
          for (const id of partitionsMissingLeadersSet) {
            completePartitionsSet.delete(id);
            partitionsMissingAddressesSet.delete(id);
          }
          for (const id of partitionsMissingAddressesSet) {
            completePartitionsSet.delete(id);
          }

          // Deduplicate all message group IDs
          const completeGroupsSet = new Set(state.completeMessageGroups);
          const groupsMissingLeadersSet = new Set(state.groupsMissingLeaders);
          const groupsMissingAddressesSet = new Set(state.groupsMissingAddresses);

          // Remove overlaps - missing leaders > missing addresses > complete
          for (const id of groupsMissingLeadersSet) {
            completeGroupsSet.delete(id);
            groupsMissingAddressesSet.delete(id);
          }
          for (const id of groupsMissingAddressesSet) {
            completeGroupsSet.delete(id);
          }

          const partitionRecords = [];
          const messageGroupRecords = [];
          const serviceRecords = [];

          // Add complete partitions
          for (const partitionId of completePartitionsSet) {
            partitionRecords.push(createPartitionRecord(partitionId));
            serviceRecords.push(createPartitionLeaderService(partitionId, {
              address: 'ws://127.0.0.1:8080',
              nodeId: 'node-1',
            }));
          }

          // Add partitions missing leaders
          for (const partitionId of partitionsMissingLeadersSet) {
            partitionRecords.push(createPartitionRecord(partitionId));
            // No leader service
          }

          // Add partitions with leaders missing addresses
          for (const partitionId of partitionsMissingAddressesSet) {
            partitionRecords.push(createPartitionRecord(partitionId));
            serviceRecords.push(createPartitionLeaderService(partitionId, {
              address: null,
              nodeId: 'node-1',
            }));
          }

          // Add complete message groups
          for (const groupId of completeGroupsSet) {
            messageGroupRecords.push(createMessageGroupRecord(groupId));
            serviceRecords.push(createMessageGroupLeaderService(groupId, {
              address: 'ws://127.0.0.1:8080',
              nodeId: 'node-1',
            }));
          }

          // Add message groups missing leaders
          for (const groupId of groupsMissingLeadersSet) {
            messageGroupRecords.push(createMessageGroupRecord(groupId));
            // No leader service
          }

          // Add message groups with leaders missing addresses
          for (const groupId of groupsMissingAddressesSet) {
            messageGroupRecords.push(createMessageGroupRecord(groupId));
            serviceRecords.push(createMessageGroupLeaderService(groupId, {
              address: null,
              nodeId: 'node-1',
            }));
          }

          const cache = createMockCache({
            partitions: partitionRecords,
            messageGroups: messageGroupRecords,
            services: serviceRecords,
          });

          const result = gate.validate({systemTableCache: cache});

          // Verify all missing partition leaders are reported
          const reportedMissingPartitionLeaders = new Set(
            result.diagnostics.missingPartitionLeaders,
          );
          for (const partitionId of partitionsMissingLeadersSet) {
            if (!reportedMissingPartitionLeaders.has(partitionId)) {
              return false;
            }
          }

          // Verify all missing message group leaders are reported
          const reportedMissingGroupLeaders = new Set(
            result.diagnostics.missingMessageGroupLeaders,
          );
          for (const groupId of groupsMissingLeadersSet) {
            if (!reportedMissingGroupLeaders.has(groupId)) {
              return false;
            }
          }

          // Verify all partition leaders missing addresses are reported
          const reportedMissingPartitionAddresses = new Set(
            result.diagnostics.missingPartitionLeaderAddresses,
          );
          for (const partitionId of partitionsMissingAddressesSet) {
            if (!reportedMissingPartitionAddresses.has(partitionId)) {
              return false;
            }
          }

          // Verify all message group leaders missing addresses are reported
          const reportedMissingGroupAddresses = new Set(
            result.diagnostics.missingMessageGroupLeaderAddresses,
          );
          for (const groupId of groupsMissingAddressesSet) {
            if (!reportedMissingGroupAddresses.has(groupId)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Diagnostics report all types of missing items together');
  });
});
