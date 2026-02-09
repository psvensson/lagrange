/**
 * Property-based test for Context CDC Consistency.
 * **Property 36: Context CDC Consistency**
 * **Validates: Requirements 34.3, 34.17**
 *
 * Property: For any context update via setContext, the change propagates
 * via CDC and is eventually visible in all message group caches.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ContextManager, ContextType} from '../../src/function/context-manager.js';
import {
  SystemTableCache,
  CDC_OPERATIONS,
} from '../../src/cache/system-table-cache.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

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

/**
 * Create a mock CDC integration service that propagates changes to caches.
 * Simulates the CDC flow: write → partition → CDC event → cache update.
 * @param {Array<SystemTableCache>} caches - Array of caches to update.
 * @return {Object} Mock CDC integration service.
 */
function createMockCDCService(caches) {
  return {
    insertSystemTableRow: async (tableName, data) => {
      // Simulate CDC propagation to all caches
      for (const cache of caches) {
        cache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, data);
      }
      return {success: true};
    },
    updateSystemTableRow: async (tableName, where, data) => {
      // Merge where clause with data for cache update
      const updateData = {...where, ...data};
      // Ensure id is set for cache compatibility
      if (where.context_id && !updateData.id) {
        updateData.id = where.context_id;
      }
      for (const cache of caches) {
        cache.applySystemTableChange(tableName, CDC_OPERATIONS.UPDATE, updateData);
      }
      return {success: true, changes: 1};
    },
    deleteSystemTableRow: async (tableName, where) => {
      const deleteData = {id: where.context_id || where.id};
      for (const cache of caches) {
        cache.applySystemTableChange(tableName, CDC_OPERATIONS.DELETE, deleteData);
      }
      return {success: true, changes: 1};
    },
  };
}

/**
 * Create a mock SQL query engine backed by a SystemTableCache.
 * @param {SystemTableCache} cache - Cache to read from.
 * @return {Object} Mock SQL query engine.
 */
function createSqlEngineFromCache(cache) {
  return {
    executeQuery: async (sql, params) => {
      const allRows = cache.getAll('contexts') || [];
      if (sql.includes('WHERE context_type = ?') &&
          sql.includes('AND context_name = ?')) {
        const rows = allRows.filter((r) =>
          r.context_type === params[0] &&
          r.context_name === params[1],
        );
        return {rows};
      }
      if (sql.includes('WHERE owner_id = ?')) {
        const rows = allRows.filter((r) =>
          r.owner_id === params[0],
        );
        return {rows};
      }
      if (sql.includes('WHERE context_type = ?')) {
        const rows = allRows.filter((r) =>
          r.context_type === params[0],
        );
        return {rows};
      }
      return {rows: allRows};
    },
  };
}

/**
 * Arbitrary for valid context types.
 */
const contextTypeArbitrary = fc.constantFrom(
  ContextType.FUNCTION,
  ContextType.SERVICE,
  ContextType.USER,
);

/**
 * Arbitrary for context names.
 */
const contextNameArbitrary = fc.string({minLength: 1, maxLength: 30})
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for context data (JSON-serializable objects).
 */
const contextDataArbitrary = fc.record({
  key: fc.string({minLength: 1, maxLength: 20}),
  value: fc.oneof(
    fc.string({maxLength: 50}),
    fc.integer(),
    fc.boolean(),
  ),
  count: fc.integer({min: 0, max: 1000}),
});

/**
 * Arbitrary for owner IDs.
 */
const ownerIdArbitrary = fc.option(fc.uuid(), {nil: null});

/**
 * Arbitrary for a context operation.
 */
const contextOperationArbitrary = fc.record({
  contextType: contextTypeArbitrary,
  contextName: contextNameArbitrary,
  contextData: contextDataArbitrary,
  ownerId: ownerIdArbitrary,
});

/**
 * Helper to compare context data across caches.
 * @param {Array<SystemTableCache>} caches - Caches to compare.
 * @return {boolean} True if all caches have identical contexts.
 */
function cachesHaveIdenticalContexts(caches) {
  if (caches.length < 2) return true;

  const referenceContexts = caches[0].getAll('contexts');
  referenceContexts.sort((a, b) => a.id.localeCompare(b.id));

  for (let i = 1; i < caches.length; i++) {
    const otherContexts = caches[i].getAll('contexts');
    otherContexts.sort((a, b) => a.id.localeCompare(b.id));

    if (referenceContexts.length !== otherContexts.length) {
      return false;
    }

    for (let j = 0; j < referenceContexts.length; j++) {
      if (JSON.stringify(referenceContexts[j]) !==
          JSON.stringify(otherContexts[j])) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Feature: distributed-database-system
 * Property 36: Context CDC Consistency
 *
 * For any context update via setContext, the change propagates via CDC
 * and is eventually visible in all message group caches.
 */
test('Property 36: setContext propagates via CDC to all caches', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      contextOperationArbitrary,
      fc.integer({min: 2, max: 5}), // Number of message group caches
      async (operation, numCaches) => {
        // Create multiple caches simulating message group replicas
        const caches = [];
        for (let i = 0; i < numCaches; i++) {
          caches.push(new SystemTableCache());
        }

        // Create CDC service that propagates to all caches
        const cdcService = createMockCDCService(caches);

        // Create context manager with first cache for reads
        const contextManager = new ContextManager({
          systemTableCache: caches[0],
          cdcIntegrationService: cdcService,
          sqlQueryEngine: createSqlEngineFromCache(caches[0]),
        });

        // Perform setContext operation
        await contextManager.setContext(
          operation.contextType,
          operation.contextName,
          operation.contextData,
          operation.ownerId,
        );

        // Verify all caches have identical context data
        if (!cachesHaveIdenticalContexts(caches)) {
          return false;
        }

        // Verify the context is visible in all caches
        for (const cache of caches) {
          const contexts = cache.filter('contexts', (c) =>
            c.context_type === operation.contextType &&
            c.context_name === operation.contextName,
          );

          if (contexts.length !== 1) {
            return false;
          }

          const ctx = contexts[0];
          const storedData = JSON.parse(ctx.context_data);

          // Verify data matches
          if (JSON.stringify(storedData) !==
              JSON.stringify(operation.contextData)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('setContext propagates via CDC to all caches');
});

/**
 * Property: Multiple context updates maintain consistency across caches.
 */
test('Property 36: Multiple context updates maintain CDC consistency', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(contextOperationArbitrary, {minLength: 1, maxLength: 10}),
      fc.integer({min: 2, max: 4}),
      async (operations, numCaches) => {
        const caches = [];
        for (let i = 0; i < numCaches; i++) {
          caches.push(new SystemTableCache());
        }

        const cdcService = createMockCDCService(caches);
        const contextManager = new ContextManager({
          systemTableCache: caches[0],
          cdcIntegrationService: cdcService,
          sqlQueryEngine: createSqlEngineFromCache(caches[0]),
        });

        // Apply all operations
        for (const op of operations) {
          await contextManager.setContext(
            op.contextType,
            op.contextName,
            op.contextData,
            op.ownerId,
          );
        }

        // All caches should be identical after all operations
        return cachesHaveIdenticalContexts(caches);
      },
    ),
    {numRuns: 10},
  );

  t.pass('Multiple context updates maintain CDC consistency');
});

/**
 * Property: Context updates (not just creates) propagate via CDC.
 */
test('Property 36: Context updates propagate via CDC', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      contextTypeArbitrary,
      contextNameArbitrary,
      contextDataArbitrary,
      contextDataArbitrary,
      fc.integer({min: 2, max: 4}),
      async (contextType, contextName, initialData, updatedData, numCaches) => {
        const caches = [];
        for (let i = 0; i < numCaches; i++) {
          caches.push(new SystemTableCache());
        }

        const cdcService = createMockCDCService(caches);
        const contextManager = new ContextManager({
          systemTableCache: caches[0],
          cdcIntegrationService: cdcService,
          sqlQueryEngine: createSqlEngineFromCache(caches[0]),
        });

        // Create initial context
        const createResult = await contextManager.setContext(
          contextType,
          contextName,
          initialData,
        );

        if (!createResult.isNew) {
          return false; // Should be new
        }

        // Update the context
        const updateResult = await contextManager.setContext(
          contextType,
          contextName,
          updatedData,
        );

        if (updateResult.isNew) {
          return false; // Should not be new
        }

        // Verify all caches have the updated data
        for (const cache of caches) {
          const contexts = cache.filter('contexts', (c) =>
            c.context_type === contextType &&
            c.context_name === contextName,
          );

          if (contexts.length !== 1) {
            return false;
          }

          const storedData = JSON.parse(contexts[0].context_data);
          if (JSON.stringify(storedData) !== JSON.stringify(updatedData)) {
            return false;
          }
        }

        return cachesHaveIdenticalContexts(caches);
      },
    ),
    {numRuns: 10},
  );

  t.pass('Context updates propagate via CDC');
});

/**
 * Property: Context deletion propagates via CDC to all caches.
 */
test('Property 36: Context deletion propagates via CDC', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      contextOperationArbitrary,
      fc.integer({min: 2, max: 4}),
      async (operation, numCaches) => {
        const caches = [];
        for (let i = 0; i < numCaches; i++) {
          caches.push(new SystemTableCache());
        }

        const cdcService = createMockCDCService(caches);
        const contextManager = new ContextManager({
          systemTableCache: caches[0],
          cdcIntegrationService: cdcService,
          sqlQueryEngine: createSqlEngineFromCache(caches[0]),
        });

        // Create context
        await contextManager.setContext(
          operation.contextType,
          operation.contextName,
          operation.contextData,
          operation.ownerId,
        );

        // Verify context exists in all caches
        for (const cache of caches) {
          const count = cache.filter('contexts', (c) =>
            c.context_type === operation.contextType &&
            c.context_name === operation.contextName,
          ).length;
          if (count !== 1) {
            return false;
          }
        }

        // Delete context
        const deleted = await contextManager.deleteContext(
          operation.contextType,
          operation.contextName,
        );

        if (!deleted) {
          return false;
        }

        // Verify context is removed from all caches
        for (const cache of caches) {
          const count = cache.filter('contexts', (c) =>
            c.context_type === operation.contextType &&
            c.context_name === operation.contextName,
          ).length;
          if (count !== 0) {
            return false;
          }
        }

        return cachesHaveIdenticalContexts(caches);
      },
    ),
    {numRuns: 10},
  );

  t.pass('Context deletion propagates via CDC');
});

/**
 * Property: Context data is retrievable from any cache after CDC propagation.
 */
test('Property 36: Context data retrievable from any cache', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      contextOperationArbitrary,
      fc.integer({min: 2, max: 5}),
      async (operation, numCaches) => {
        const caches = [];
        for (let i = 0; i < numCaches; i++) {
          caches.push(new SystemTableCache());
        }

        const cdcService = createMockCDCService(caches);

        // Create context manager with first cache
        const contextManager = new ContextManager({
          systemTableCache: caches[0],
          cdcIntegrationService: cdcService,
          sqlQueryEngine: createSqlEngineFromCache(caches[0]),
        });

        await contextManager.setContext(
          operation.contextType,
          operation.contextName,
          operation.contextData,
          operation.ownerId,
        );

        // Create context managers for each cache and verify retrieval
        for (let i = 0; i < numCaches; i++) {
          const manager = new ContextManager({
            systemTableCache: caches[i],
            cdcIntegrationService: cdcService,
            sqlQueryEngine: createSqlEngineFromCache(caches[i]),
          });

          const retrieved = await manager.getContext(
            operation.contextType,
            operation.contextName,
          );

          if (!retrieved) {
            return false;
          }

          if (JSON.stringify(retrieved.data) !==
              JSON.stringify(operation.contextData)) {
            return false;
          }

          if (retrieved.ownerId !== operation.ownerId) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Context data retrievable from any cache');
});

