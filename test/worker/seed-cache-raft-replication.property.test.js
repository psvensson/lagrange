/**
 * Property test for SEED_CACHE Raft Replication (Property 23).
 *
 * Feature: worker-process-replica-isolation, Property 23: SEED_CACHE Raft Replication
 *
 * For any SEED_CACHE message accepted by a message group leader, the cache
 * entries SHALL be applied to the leader's SQLiteSystemCache AND replicated
 * to all followers via Raft consensus.
 *
 * **Validates: Requirements 12.4, 12.5**
 *
 * @module test/worker/seed-cache-raft-replication.property.test.js
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  MessageGroupWorkerService,
  CDC_REPLICATION_TYPE,
} from '../../src/worker/message-group-worker-service.js';
import {
  SEED_CACHE_MESSAGE_TYPE,
} from '../../src/worker/worker-constants.js';
import {NUM} from '../../src/constants/index.js';

/**
 * Test constants for SEED_CACHE Raft replication property tests.
 * @type {Readonly<Object>}
 */
const TEST_CONST = Object.freeze({
  /** Valid system table names for testing */
  SYSTEM_TABLES: ['nodes', 'tables', 'partitions', 'replicas', 'message_groups'],
  /** Valid CDC operations for SEED_CACHE (INSERT only during seeding) */
  SEED_OPERATION: 'INSERT',
});

describe('Property 23: SEED_CACHE Raft Replication', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    };
  });

  afterEach(async () => {
    // Cleanup handled within each test
  });

  /**
   * Create a MessageGroupWorkerService for testing with mocked Raft.
   * @param {Object} options - Service options.
   * @param {string} options.nodeId - Node ID.
   * @param {string} options.groupId - Group ID.
   * @param {string} options.replicaId - Replica ID.
   * @param {boolean} [options.isLeader=true] - Whether this replica is leader.
   * @param {boolean} [options.bootstrapPhase=true] - Initial bootstrap phase.
   * @return {Object} Service instance and tracking objects.
   */
  function createServiceWithMockedRaft(options) {
    const service = new MessageGroupWorkerService({
      nodeId: options.nodeId,
      groupId: options.groupId,
      replicaId: options.replicaId,
      logger: mockLogger,
    });

    // Track replicated commands
    const replicatedCommands = [];
    const appliedCacheEvents = [];

    // Initialize the system cache with tracking
    service.systemCache = {
      applyCDCEvent: (tableName, operation, data) => {
        appliedCacheEvents.push({tableName, operation, data});
      },
      get: () => null,
      query: () => [],
      getAll: () => [],
      close: () => {},
      isInitialized: () => true,
    };

    // Mock Raft instance for command tracking
    const mockRaft = {
      term: NUM.ONE,
      command: (commandStr, callback) => {
        const command = JSON.parse(commandStr);
        replicatedCommands.push(command);
        if (callback) {
          callback(null);
        }
        queueMicrotask(() => {
          service.handleCommittedEntry(JSON.stringify(command)).catch(() => {});
        });
        return Promise.resolve();
      },
    };

    // Determine leader status
    const isLeader = options.isLeader !== undefined ?
      options.isLeader : true;

    // Mock RaftGroup with leader status and raft instance
    service.raftGroup = {
      isLeaderReplica: () => isLeader,
      getRole: () => isLeader ? 'leader' : 'follower',
      getLeaderId: () => isLeader ? options.replicaId : null,
      getCurrentTerm: () => NUM.ONE,
      getRaftInstance: () => mockRaft,
      shutdown: async () => {},
    };

    service.initialized = true;
    service.bootstrapPhase = options.bootstrapPhase !== undefined ?
      options.bootstrapPhase : true;

    return {
      service,
      replicatedCommands,
      appliedCacheEvents,
    };
  }

  /**
   * Cleanup service resources.
   * @param {MessageGroupWorkerService} service - Service to cleanup.
   */
  function cleanupService(service) {
    if (service) {
      service.systemCache = null;
      service.raftGroup = null;
      service.initialized = false;
    }
  }

  /**
   * Generate a valid SEED_CACHE entry.
   * @return {fc.Arbitrary} Arbitrary for SEED_CACHE entry.
   */
  function seedCacheEntryArb() {
    return fc.record({
      tableName: fc.constantFrom(...TEST_CONST.SYSTEM_TABLES),
      operation: fc.constant(TEST_CONST.SEED_OPERATION),
      data: fc.record({
        id: fc.uuid(),
        name: fc.string({minLength: 1, maxLength: 50}),
        status: fc.constantFrom('active', 'pending', 'inactive'),
      }),
    });
  }

  it('leader should replicate SEED_CACHE entries via Raft', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 5}),
        async (nodeId, groupId, replicaId, entries) => {
          const {service, replicatedCommands} = createServiceWithMockedRaft({
            nodeId,
            groupId,
            replicaId,
            isLeader: true,
            bootstrapPhase: true,
          });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: true,
            };

            const response = await service.handleMessage(message);

            // Verify SEED_CACHE succeeded
            assert.strictEqual(
              response.success,
              true,
              'SEED_CACHE should succeed for leader',
            );

            // Verify all entries were replicated via Raft
            assert.strictEqual(
              replicatedCommands.length,
              entries.length,
              'All entries should be replicated via Raft',
            );

            // Verify each replicated command has correct structure
            for (let i = 0; i < entries.length; i++) {
              const command = replicatedCommands[i];
              assert.strictEqual(
                command.type,
                CDC_REPLICATION_TYPE,
                `Entry ${i} should have CDC_REPLICATION type`,
              );
              assert.strictEqual(
                command.tableName,
                entries[i].tableName,
                `Entry ${i} tableName should match`,
              );
              assert.strictEqual(
                command.operation,
                entries[i].operation,
                `Entry ${i} operation should match`,
              );
              assert.deepStrictEqual(
                command.data,
                entries[i].data,
                `Entry ${i} data should match`,
              );
            }
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('follower should apply SEED_CACHE entries directly to cache', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 5}),
        async (nodeId, groupId, replicaId, entries) => {
          const {service, replicatedCommands, appliedCacheEvents} =
            createServiceWithMockedRaft({
              nodeId,
              groupId,
              replicaId,
              isLeader: false,
              bootstrapPhase: true,
            });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: true,
            };

            const response = await service.handleMessage(message);

            // Verify SEED_CACHE succeeded
            assert.strictEqual(
              response.success,
              true,
              'SEED_CACHE should succeed for follower',
            );

            // Verify follower did NOT replicate via Raft
            assert.strictEqual(
              replicatedCommands.length,
              NUM.ZERO,
              'Follower should not replicate via Raft',
            );

            // Verify all entries were applied directly to cache
            assert.strictEqual(
              appliedCacheEvents.length,
              entries.length,
              'All entries should be applied directly to cache',
            );

            // Verify each applied event matches the entry
            for (let i = 0; i < entries.length; i++) {
              assert.strictEqual(
                appliedCacheEvents[i].tableName,
                entries[i].tableName,
                `Entry ${i} tableName should match`,
              );
              assert.strictEqual(
                appliedCacheEvents[i].operation,
                entries[i].operation,
                `Entry ${i} operation should match`,
              );
              assert.deepStrictEqual(
                appliedCacheEvents[i].data,
                entries[i].data,
                `Entry ${i} data should match`,
              );
            }
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('replicated commands should have CDC_REPLICATION type for Raft log', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 5}),
        async (nodeId, groupId, replicaId, entries) => {
          const {service, replicatedCommands} = createServiceWithMockedRaft({
            nodeId,
            groupId,
            replicaId,
            isLeader: true,
            bootstrapPhase: true,
          });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: true,
            };

            await service.handleMessage(message);

            // Verify all replicated commands have CDC_REPLICATION type
            for (const command of replicatedCommands) {
              assert.strictEqual(
                command.type,
                CDC_REPLICATION_TYPE,
                'All replicated commands should have CDC_REPLICATION type',
              );
            }
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('leader should report correct entriesApplied count after replication', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 10}),
        async (nodeId, groupId, replicaId, entries) => {
          const {service} = createServiceWithMockedRaft({
            nodeId,
            groupId,
            replicaId,
            isLeader: true,
            bootstrapPhase: true,
          });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: true,
            };

            const response = await service.handleMessage(message);

            // Verify entriesApplied matches entry count
            assert.strictEqual(
              response.entriesApplied,
              entries.length,
              'entriesApplied should match entry count',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('Raft replication failure should stop processing and report error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 2, maxLength: 5}),
        fc.integer({min: 0, max: 4}),
        async (nodeId, groupId, replicaId, entries, failAtIndex) => {
          // Ensure failAtIndex is within bounds
          const actualFailIndex = Math.min(failAtIndex, entries.length - 1);

          const {service, replicatedCommands} = createServiceWithMockedRaft({
            nodeId,
            groupId,
            replicaId,
            isLeader: true,
            bootstrapPhase: true,
          });

          // Override Raft to fail at specific index
          let commandCount = NUM.ZERO;
          const mockRaft =
            service.raftGroup.getRaftInstance();
          mockRaft.command = (commandStr, callback) => {
            const command = JSON.parse(commandStr);
            replicatedCommands.push(command);
            const shouldFail = commandCount === actualFailIndex;
            commandCount++;

            if (shouldFail) {
              if (callback) {
                callback(new Error('Raft replication failed'));
              }
              return undefined;
            }

            if (callback) {
              callback(null);
            }
            queueMicrotask(() => {
              service.handleCommittedEntry(JSON.stringify(command))
                .catch(() => {});
            });
            return Promise.resolve();
          };

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: true,
            };

            const response = await service.handleMessage(message);

            // Verify SEED_CACHE failed
            assert.strictEqual(
              response.success,
              false,
              'SEED_CACHE should fail when Raft replication fails',
            );

            // Verify entriesApplied is the count before failure
            assert.strictEqual(
              response.entriesApplied,
              actualFailIndex,
              'entriesApplied should be count before failure',
            );

            // Verify error message is present
            assert.ok(
              response.error,
              'Error message should be present',
            );
            assert.ok(
              response.error.includes('Failed to apply SEED_CACHE entry'),
              'Error should indicate SEED_CACHE apply failure',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('replicated entries should preserve all data fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.record({
          tableName: fc.constantFrom(...TEST_CONST.SYSTEM_TABLES),
          operation: fc.constant(TEST_CONST.SEED_OPERATION),
          data: fc.record({
            id: fc.uuid(),
            name: fc.string({minLength: 1, maxLength: 50}),
            status: fc.constantFrom('active', 'pending', 'inactive'),
            address: fc.string({minLength: 5, maxLength: 100}),
            port: fc.integer({min: 1024, max: 65535}),
            metadata: fc.record({
              version: fc.integer({min: 1, max: 100}),
              tags: fc.array(fc.string({minLength: 1, maxLength: 20}), {
                minLength: 0,
                maxLength: 5,
              }),
            }),
          }),
        }),
        async (nodeId, groupId, replicaId, entry) => {
          const {service, replicatedCommands} = createServiceWithMockedRaft({
            nodeId,
            groupId,
            replicaId,
            isLeader: true,
            bootstrapPhase: true,
          });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries: [entry],
              bootstrapPhase: true,
            };

            await service.handleMessage(message);

            // Verify replicated command preserves all data fields
            assert.strictEqual(
              replicatedCommands.length,
              NUM.ONE,
              'Should have one replicated command',
            );

            const command = replicatedCommands[NUM.ZERO];
            assert.deepStrictEqual(
              command.data,
              entry.data,
              'Replicated data should preserve all fields',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('leader and follower should process same entries consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 5}),
        async (nodeId, groupId, leaderReplicaId, followerReplicaId, entries) => {
          // Create leader service
          const leaderResult = createServiceWithMockedRaft({
            nodeId,
            groupId,
            replicaId: leaderReplicaId,
            isLeader: true,
            bootstrapPhase: true,
          });

          // Create follower service
          const followerResult = createServiceWithMockedRaft({
            nodeId,
            groupId,
            replicaId: followerReplicaId,
            isLeader: false,
            bootstrapPhase: true,
          });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: true,
            };

            // Process on leader
            const leaderResponse = await leaderResult.service.handleMessage(
              message,
            );

            // Process on follower
            const followerResponse = await followerResult.service.handleMessage(
              message,
            );

            // Both should succeed
            assert.strictEqual(
              leaderResponse.success,
              true,
              'Leader should succeed',
            );
            assert.strictEqual(
              followerResponse.success,
              true,
              'Follower should succeed',
            );

            // Both should report same entriesApplied
            assert.strictEqual(
              leaderResponse.entriesApplied,
              followerResponse.entriesApplied,
              'Both should report same entriesApplied',
            );

            // Leader should replicate, follower should apply directly
            assert.strictEqual(
              leaderResult.replicatedCommands.length,
              entries.length,
              'Leader should replicate all entries',
            );
            assert.strictEqual(
              followerResult.replicatedCommands.length,
              NUM.ZERO,
              'Follower should not replicate',
            );
            assert.strictEqual(
              followerResult.appliedCacheEvents.length,
              entries.length,
              'Follower should apply all entries directly',
            );
          } finally {
            cleanupService(leaderResult.service);
            cleanupService(followerResult.service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('empty entries array should succeed without replication', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const {service, replicatedCommands} = createServiceWithMockedRaft({
            nodeId,
            groupId,
            replicaId,
            isLeader: true,
            bootstrapPhase: true,
          });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries: [],
              bootstrapPhase: true,
            };

            const response = await service.handleMessage(message);

            // Verify success with zero entries
            assert.strictEqual(
              response.success,
              true,
              'Empty entries should succeed',
            );
            assert.strictEqual(
              response.entriesApplied,
              NUM.ZERO,
              'entriesApplied should be zero',
            );
            assert.strictEqual(
              replicatedCommands.length,
              NUM.ZERO,
              'No commands should be replicated',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('replicateCDCEvent should be called for each entry on leader', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 5}),
        async (nodeId, groupId, replicaId, entries) => {
          const replicateCalls = [];

          const {service} = createServiceWithMockedRaft({
            nodeId,
            groupId,
            replicaId,
            isLeader: true,
            bootstrapPhase: true,
          });

          // Track replicateCDCEvent calls
          const originalReplicate = service.replicateCDCEvent.bind(service);
          service.replicateCDCEvent = async (cdcEvent) => {
            replicateCalls.push(cdcEvent);
            return originalReplicate(cdcEvent);
          };

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: true,
            };

            await service.handleMessage(message);

            // Verify replicateCDCEvent was called for each entry
            assert.strictEqual(
              replicateCalls.length,
              entries.length,
              'replicateCDCEvent should be called for each entry',
            );

            // Verify each call has correct parameters
            for (let i = 0; i < entries.length; i++) {
              assert.strictEqual(
                replicateCalls[i].tableName,
                entries[i].tableName,
                `Call ${i} tableName should match`,
              );
              assert.strictEqual(
                replicateCalls[i].operation,
                entries[i].operation,
                `Call ${i} operation should match`,
              );
              assert.deepStrictEqual(
                replicateCalls[i].data,
                entries[i].data,
                `Call ${i} data should match`,
              );
            }
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });
});
