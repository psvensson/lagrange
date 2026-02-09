/**
 * Property test for SEED_CACHE Bootstrap Restriction (Property 22).
 *
 * Feature: worker-process-replica-isolation, Property 22: SEED_CACHE Bootstrap Restriction
 *
 * For any SEED_CACHE message, the message SHALL only be accepted when the
 * bootstrapPhase flag is true and no partitions exist yet. After partitions
 * are created, SEED_CACHE messages SHALL be rejected.
 *
 * **Validates: Requirements 12.6, 12.7**
 *
 * @module test/worker/seed-cache-bootstrap-restriction.property.test.js
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  MessageGroupWorkerService,
  MESSAGE_GROUP_WORKER_ERROR_MSG,
} from '../../src/worker/message-group-worker-service.js';
import {
  SEED_CACHE_MESSAGE_TYPE,
} from '../../src/worker/worker-constants.js';
import {NUM} from '../../src/constants/index.js';

/**
 * Test constants for SEED_CACHE property tests.
 * @type {Readonly<Object>}
 */
const TEST_CONST = Object.freeze({
  /** Valid system table names for testing */
  SYSTEM_TABLES: ['nodes', 'tables', 'partitions', 'replicas', 'message_groups'],
  /** Valid CDC operations for SEED_CACHE (INSERT only during seeding) */
  SEED_OPERATION: 'INSERT',
});

describe('Property 22: SEED_CACHE Bootstrap Restriction', () => {
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
   * Create a MessageGroupWorkerService for testing.
   * @param {Object} options - Service options.
   * @param {string} options.nodeId - Node ID.
   * @param {string} options.groupId - Group ID.
   * @param {string} options.replicaId - Replica ID.
   * @param {boolean} [options.bootstrapPhase=true] - Initial bootstrap phase.
   * @return {MessageGroupWorkerService} Service instance.
   */
  function createService(options) {
    const service = new MessageGroupWorkerService({
      nodeId: options.nodeId,
      groupId: options.groupId,
      replicaId: options.replicaId,
      logger: mockLogger,
    });

    // Initialize the system cache without full Raft initialization
    service.systemCache = {
      applyCDCEvent: () => {},
      get: () => null,
      query: () => [],
      getAll: () => [],
      close: () => {},
    };
    service.initialized = true;

    // Set bootstrap phase
    if (options.bootstrapPhase !== undefined) {
      service.bootstrapPhase = options.bootstrapPhase;
    }

    return service;
  }

  /**
   * Cleanup service resources.
   * @param {MessageGroupWorkerService} service - Service to cleanup.
   */
  function cleanupService(service) {
    if (service) {
      service.systemCache = null;
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

  it('should accept SEED_CACHE when bootstrapPhase is true', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 5}),
        async (nodeId, groupId, replicaId, entries) => {
          const service = createService({
            nodeId,
            groupId,
            replicaId,
            bootstrapPhase: true,
          });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: true,
            };

            const response = await service.handleMessage(message);

            // Verify response indicates success
            assert.strictEqual(
              response.type,
              SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
              'Response type should be SEED_CACHE_RESPONSE',
            );
            assert.strictEqual(
              response.success,
              true,
              'SEED_CACHE should succeed when bootstrapPhase is true',
            );
            assert.strictEqual(
              response.entriesApplied,
              entries.length,
              'All entries should be applied',
            );
            assert.strictEqual(
              response.error,
              null,
              'No error should be present on success',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should reject SEED_CACHE when service bootstrapPhase is false', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 5}),
        async (nodeId, groupId, replicaId, entries) => {
          const service = createService({
            nodeId,
            groupId,
            replicaId,
            bootstrapPhase: false,
          });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: true,
            };

            const response = await service.handleMessage(message);

            // Verify response indicates rejection
            assert.strictEqual(
              response.type,
              SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
              'Response type should be SEED_CACHE_RESPONSE',
            );
            assert.strictEqual(
              response.success,
              false,
              'SEED_CACHE should be rejected when service bootstrapPhase is false',
            );
            assert.strictEqual(
              response.entriesApplied,
              NUM.ZERO,
              'No entries should be applied when rejected',
            );
            assert.strictEqual(
              response.error,
              MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_NOT_BOOTSTRAP_PHASE,
              'Error should indicate bootstrap phase restriction',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should reject SEED_CACHE when message bootstrapPhase flag is false', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 5}),
        async (nodeId, groupId, replicaId, entries) => {
          const service = createService({
            nodeId,
            groupId,
            replicaId,
            bootstrapPhase: true,
          });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: false,
            };

            const response = await service.handleMessage(message);

            // Verify response indicates rejection
            assert.strictEqual(
              response.type,
              SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
              'Response type should be SEED_CACHE_RESPONSE',
            );
            assert.strictEqual(
              response.success,
              false,
              'SEED_CACHE should be rejected when message bootstrapPhase is false',
            );
            assert.strictEqual(
              response.entriesApplied,
              NUM.ZERO,
              'No entries should be applied when rejected',
            );
            assert.strictEqual(
              response.error,
              MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_NOT_BOOTSTRAP_PHASE,
              'Error should indicate bootstrap phase restriction',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should reject SEED_CACHE after setBootstrapPhase(false) is called', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 3}),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 3}),
        async (nodeId, groupId, replicaId, firstEntries, secondEntries) => {
          const service = createService({
            nodeId,
            groupId,
            replicaId,
            bootstrapPhase: true,
          });

          try {
            // First SEED_CACHE should succeed
            const firstMessage = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries: firstEntries,
              bootstrapPhase: true,
            };

            const firstResponse = await service.handleMessage(firstMessage);
            assert.strictEqual(
              firstResponse.success,
              true,
              'First SEED_CACHE should succeed',
            );

            // Simulate partitions being created (end of bootstrap)
            service.setBootstrapPhase(false);

            // Second SEED_CACHE should be rejected
            const secondMessage = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries: secondEntries,
              bootstrapPhase: true,
            };

            const secondResponse = await service.handleMessage(secondMessage);
            assert.strictEqual(
              secondResponse.success,
              false,
              'SEED_CACHE should be rejected after bootstrap phase ends',
            );
            assert.strictEqual(
              secondResponse.error,
              MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_NOT_BOOTSTRAP_PHASE,
              'Error should indicate bootstrap phase restriction',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should reject SEED_CACHE with missing entries array', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const service = createService({
            nodeId,
            groupId,
            replicaId,
            bootstrapPhase: true,
          });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              bootstrapPhase: true,
              // entries is missing
            };

            const response = await service.handleMessage(message);

            // Verify response indicates rejection
            assert.strictEqual(
              response.type,
              SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
              'Response type should be SEED_CACHE_RESPONSE',
            );
            assert.strictEqual(
              response.success,
              false,
              'SEED_CACHE should be rejected when entries is missing',
            );
            assert.strictEqual(
              response.error,
              MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_MISSING_ENTRIES,
              'Error should indicate missing entries',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should reject SEED_CACHE with non-array entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.record({notAnArray: fc.boolean()}),
          fc.constant(null),
        ),
        async (nodeId, groupId, replicaId, invalidEntries) => {
          const service = createService({
            nodeId,
            groupId,
            replicaId,
            bootstrapPhase: true,
          });

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries: invalidEntries,
              bootstrapPhase: true,
            };

            const response = await service.handleMessage(message);

            // Verify response indicates rejection
            assert.strictEqual(
              response.type,
              SEED_CACHE_MESSAGE_TYPE.SEED_CACHE_RESPONSE,
              'Response type should be SEED_CACHE_RESPONSE',
            );
            assert.strictEqual(
              response.success,
              false,
              'SEED_CACHE should be rejected when entries is not an array',
            );
            assert.strictEqual(
              response.error,
              MESSAGE_GROUP_WORKER_ERROR_MSG.SEED_CACHE_MISSING_ENTRIES,
              'Error should indicate missing/invalid entries',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should track bootstrap phase correctly via isInBootstrapPhase()', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.boolean(),
        async (nodeId, groupId, replicaId, initialPhase) => {
          const service = createService({
            nodeId,
            groupId,
            replicaId,
            bootstrapPhase: initialPhase,
          });

          try {
            // Verify initial phase
            assert.strictEqual(
              service.isInBootstrapPhase(),
              initialPhase,
              'isInBootstrapPhase should return initial phase',
            );

            // Toggle phase
            service.setBootstrapPhase(!initialPhase);

            // Verify toggled phase
            assert.strictEqual(
              service.isInBootstrapPhase(),
              !initialPhase,
              'isInBootstrapPhase should return toggled phase',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should apply entries to cache when SEED_CACHE is accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 5}),
        async (nodeId, groupId, replicaId, entries) => {
          const appliedEvents = [];

          const service = createService({
            nodeId,
            groupId,
            replicaId,
            bootstrapPhase: true,
          });

          // Track applied CDC events
          service.systemCache.applyCDCEvent = (tableName, operation, data) => {
            appliedEvents.push({tableName, operation, data});
          };

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: true,
            };

            const response = await service.handleMessage(message);

            assert.strictEqual(
              response.success,
              true,
              'SEED_CACHE should succeed',
            );

            // Verify all entries were applied to cache
            assert.strictEqual(
              appliedEvents.length,
              entries.length,
              'All entries should be applied to cache',
            );

            // Verify each entry was applied correctly
            for (let i = 0; i < entries.length; i++) {
              assert.strictEqual(
                appliedEvents[i].tableName,
                entries[i].tableName,
                `Entry ${i} tableName should match`,
              );
              assert.strictEqual(
                appliedEvents[i].operation,
                entries[i].operation,
                `Entry ${i} operation should match`,
              );
              assert.deepStrictEqual(
                appliedEvents[i].data,
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

  it('should not apply entries when SEED_CACHE is rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(seedCacheEntryArb(), {minLength: 1, maxLength: 5}),
        async (nodeId, groupId, replicaId, entries) => {
          const appliedEvents = [];

          const service = createService({
            nodeId,
            groupId,
            replicaId,
            bootstrapPhase: false,
          });

          // Track applied CDC events
          service.systemCache.applyCDCEvent = (tableName, operation, data) => {
            appliedEvents.push({tableName, operation, data});
          };

          try {
            const message = {
              type: SEED_CACHE_MESSAGE_TYPE.SEED_CACHE,
              entries,
              bootstrapPhase: true,
            };

            const response = await service.handleMessage(message);

            assert.strictEqual(
              response.success,
              false,
              'SEED_CACHE should be rejected',
            );

            // Verify no entries were applied to cache
            assert.strictEqual(
              appliedEvents.length,
              NUM.ZERO,
              'No entries should be applied when rejected',
            );
          } finally {
            cleanupService(service);
          }
        },
      ),
      {numRuns: 10},
    );
  });
});
