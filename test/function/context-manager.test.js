/**
 * Tests for ContextManager.
 * Requirements: 34.1, 34.3, 34.17
 */

import {test} from 'tap';
import {ContextManager, ContextType} from '../../src/function/context-manager.js';

// Mock system table cache
function createMockCache() {
  const data = new Map();
  return {
    filter: (tableName, predicate) => {
      if (tableName !== 'contexts') return [];
      return Array.from(data.values()).filter(predicate);
    },
    find: (tableName, predicate) => {
      if (tableName !== 'contexts') return undefined;
      return Array.from(data.values()).find(predicate);
    },
    get: (tableName, key) => {
      if (tableName !== 'contexts') return undefined;
      return data.get(key);
    },
    // For testing - add data directly
    _set: (key, value) => data.set(key, value),
    _clear: () => data.clear(),
  };
}

// Mock CDC integration service
function createMockCDC(cache) {
  return {
    insertSystemTableRow: async (tableName, row) => {
      if (tableName === 'contexts') {
        cache._set(row.context_id, row);
      }
      return {success: true};
    },
    updateSystemTableRow: async (tableName, where, data) => {
      if (tableName === 'contexts') {
        const existing = cache.find('contexts', (c) =>
          c.context_id === where.context_id,
        );
        if (existing) {
          cache._set(where.context_id, {...existing, ...data});
        }
      }
      return {success: true, changes: 1};
    },
    deleteSystemTableRow: async (tableName, where) => {
      if (tableName === 'contexts') {
        const contexts = Array.from(cache.filter('contexts', () => true));
        const toDelete = contexts.find((c) => c.context_id === where.context_id);
        if (toDelete) {
          cache._clear();
          contexts.filter((c) => c.context_id !== where.context_id)
            .forEach((c) => cache._set(c.context_id, c));
        }
      }
      return {success: true, changes: 1};
    },
  };
}

test('ContextManager - constructor', async (t) => {
  const manager = new ContextManager();

  t.equal(manager.isInitialized(), false, 'Should not be initialized');
  t.equal(manager.systemTableCache, null, 'Should have no cache');
  t.equal(manager.cdcIntegrationService, null, 'Should have no CDC service');
});

test('ContextManager - initialize', async (t) => {
  const cache = createMockCache();
  const cdc = createMockCDC(cache);
  const manager = new ContextManager();

  manager.initialize({
    systemTableCache: cache,
    cdcIntegrationService: cdc,
  });

  t.equal(manager.isInitialized(), true, 'Should be initialized');
  t.ok(manager.systemTableCache, 'Should have cache');
  t.ok(manager.cdcIntegrationService, 'Should have CDC service');
});

test('ContextManager - getContext returns null when not found', async (t) => {
  const cache = createMockCache();
  const manager = new ContextManager({systemTableCache: cache});

  const result = manager.getContext(ContextType.FUNCTION, 'nonexistent');

  t.equal(result, null, 'Should return null');
});

test('ContextManager - setContext creates new context', async (t) => {
  const cache = createMockCache();
  const cdc = createMockCDC(cache);
  const manager = new ContextManager({
    systemTableCache: cache,
    cdcIntegrationService: cdc,
  });

  const result = await manager.setContext(
    ContextType.FUNCTION,
    'test-context',
    {key: 'value'},
    'owner-123',
  );

  t.ok(result.contextId, 'Should return context ID');
  t.equal(result.contextType, ContextType.FUNCTION, 'Should return type');
  t.equal(result.contextName, 'test-context', 'Should return name');
  t.equal(result.isNew, true, 'Should indicate new context');

  // Verify context was stored
  const stored = manager.getContext(ContextType.FUNCTION, 'test-context');
  t.ok(stored, 'Should be able to retrieve context');
  t.same(stored.data, {key: 'value'}, 'Should have correct data');
  t.equal(stored.ownerId, 'owner-123', 'Should have correct owner');
});

test('ContextManager - setContext updates existing context', async (t) => {
  const cache = createMockCache();
  const cdc = createMockCDC(cache);
  const manager = new ContextManager({
    systemTableCache: cache,
    cdcIntegrationService: cdc,
  });

  // Create initial context
  await manager.setContext(ContextType.SERVICE, 'my-service', {count: 1});

  // Update context
  const result = await manager.setContext(
    ContextType.SERVICE,
    'my-service',
    {count: 2},
  );

  t.equal(result.isNew, false, 'Should indicate existing context');

  const stored = manager.getContext(ContextType.SERVICE, 'my-service');
  t.same(stored.data, {count: 2}, 'Should have updated data');
});

test('ContextManager - deleteContext removes context', async (t) => {
  const cache = createMockCache();
  const cdc = createMockCDC(cache);
  const manager = new ContextManager({
    systemTableCache: cache,
    cdcIntegrationService: cdc,
  });

  // Create context
  await manager.setContext(ContextType.USER, 'user-ctx', {name: 'test'});

  // Delete context
  const deleted = await manager.deleteContext(ContextType.USER, 'user-ctx');

  t.equal(deleted, true, 'Should return true');

  const stored = manager.getContext(ContextType.USER, 'user-ctx');
  t.equal(stored, null, 'Should not find deleted context');
});

test('ContextManager - deleteContext returns false for nonexistent', async (t) => {
  const cache = createMockCache();
  const cdc = createMockCDC(cache);
  const manager = new ContextManager({
    systemTableCache: cache,
    cdcIntegrationService: cdc,
  });

  const deleted = await manager.deleteContext(ContextType.FUNCTION, 'nonexistent');

  t.equal(deleted, false, 'Should return false');
});

test('ContextManager - getContextsByOwner returns matching contexts', async (t) => {
  const cache = createMockCache();
  const cdc = createMockCDC(cache);
  const manager = new ContextManager({
    systemTableCache: cache,
    cdcIntegrationService: cdc,
  });

  // Create contexts with same owner
  await manager.setContext(ContextType.FUNCTION, 'ctx1', {a: 1}, 'owner-1');
  await manager.setContext(ContextType.FUNCTION, 'ctx2', {b: 2}, 'owner-1');
  await manager.setContext(ContextType.FUNCTION, 'ctx3', {c: 3}, 'owner-2');

  const contexts = manager.getContextsByOwner('owner-1');

  t.equal(contexts.length, 2, 'Should return 2 contexts');
  t.ok(contexts.some((c) => c.contextName === 'ctx1'), 'Should include ctx1');
  t.ok(contexts.some((c) => c.contextName === 'ctx2'), 'Should include ctx2');
});

test('ContextManager - getContextsByType returns matching contexts', async (t) => {
  const cache = createMockCache();
  const cdc = createMockCDC(cache);
  const manager = new ContextManager({
    systemTableCache: cache,
    cdcIntegrationService: cdc,
  });

  // Create contexts of different types
  await manager.setContext(ContextType.FUNCTION, 'func-ctx', {});
  await manager.setContext(ContextType.SERVICE, 'svc-ctx', {});
  await manager.setContext(ContextType.USER, 'user-ctx', {});

  const functionContexts = manager.getContextsByType(ContextType.FUNCTION);
  const serviceContexts = manager.getContextsByType(ContextType.SERVICE);

  t.equal(functionContexts.length, 1, 'Should return 1 function context');
  t.equal(serviceContexts.length, 1, 'Should return 1 service context');
});

test('ContextManager - validates context type', async (t) => {
  const manager = new ContextManager();

  t.throws(
    () => manager.getContext('invalid', 'name'),
    /Invalid context type/,
    'Should throw for invalid type',
  );
});

test('ContextManager - throws when CDC not available', async (t) => {
  const cache = createMockCache();
  const manager = new ContextManager({systemTableCache: cache});

  await t.rejects(
    manager.setContext(ContextType.FUNCTION, 'test', {}),
    /CDC integration service not available/,
    'Should throw when CDC not available',
  );
});
