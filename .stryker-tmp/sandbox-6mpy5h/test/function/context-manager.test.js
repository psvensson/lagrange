/**
 * Tests for ContextManager.
 * Requirements: 34.1, 34.3, 34.17
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {ContextManager, ContextType} from '../../src/function/context-manager.js';

// In-memory store for mock data
function createStore() {
  const data = new Map();
  return {
    set: (key, value) => data.set(key, value),
    get: (key) => data.get(key),
    delete: (key) => data.delete(key),
    values: () => Array.from(data.values()),
    clear: () => data.clear(),
  };
}

// Mock SQL query engine that reads from the store
function createMockSqlEngine(store) {
  return {
    executeQuery: async (sql, params) => {
      const allRows = store.values();
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

// Mock CDC integration service
function createMockCDC(store) {
  return {
    insertSystemTableRow: async (_tableName, row) => {
      store.set(row.context_id, row);
      return {success: true};
    },
    updateSystemTableRow: async (_tableName, where, data) => {
      const existing = store.get(where.context_id);
      if (existing) {
        store.set(where.context_id, {...existing, ...data});
      }
      return {success: true, changes: 1};
    },
    deleteSystemTableRow: async (_tableName, where) => {
      store.delete(where.context_id);
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
  const store = createStore();
  const sqlEngine = createMockSqlEngine(store);
  const cdc = createMockCDC(store);
  const manager = new ContextManager();

  manager.initialize({
    systemTableCache: {},
    cdcIntegrationService: cdc,
    sqlQueryEngine: sqlEngine,
  });

  t.equal(manager.isInitialized(), true, 'Should be initialized');
  t.ok(manager.cdcIntegrationService, 'Should have CDC service');
  t.ok(manager.sqlQueryEngine, 'Should have SQL engine');
});

test('ContextManager - getContext returns null when not found', async (t) => {
  const store = createStore();
  const sqlEngine = createMockSqlEngine(store);
  const manager = new ContextManager({sqlQueryEngine: sqlEngine});

  const result = await manager.getContext(
    ContextType.FUNCTION, 'nonexistent',
  );

  t.equal(result, null, 'Should return null');
});

test('ContextManager - setContext creates new context', async (t) => {
  const store = createStore();
  const sqlEngine = createMockSqlEngine(store);
  const cdc = createMockCDC(store);
  const manager = new ContextManager({
    sqlQueryEngine: sqlEngine,
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
  const stored = await manager.getContext(
    ContextType.FUNCTION, 'test-context',
  );
  t.ok(stored, 'Should be able to retrieve context');
  t.same(stored.data, {key: 'value'}, 'Should have correct data');
  t.equal(stored.ownerId, 'owner-123', 'Should have correct owner');
});

test('ContextManager - setContext updates existing context', async (t) => {
  const store = createStore();
  const sqlEngine = createMockSqlEngine(store);
  const cdc = createMockCDC(store);
  const manager = new ContextManager({
    sqlQueryEngine: sqlEngine,
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

  const stored = await manager.getContext(
    ContextType.SERVICE, 'my-service',
  );
  t.same(stored.data, {count: 2}, 'Should have updated data');
});

test('ContextManager - deleteContext removes context', async (t) => {
  const store = createStore();
  const sqlEngine = createMockSqlEngine(store);
  const cdc = createMockCDC(store);
  const manager = new ContextManager({
    sqlQueryEngine: sqlEngine,
    cdcIntegrationService: cdc,
  });

  // Create context
  await manager.setContext(
    ContextType.USER, 'user-ctx', {name: 'test'},
  );

  // Delete context
  const deleted = await manager.deleteContext(
    ContextType.USER, 'user-ctx',
  );

  t.equal(deleted, true, 'Should return true');

  const stored = await manager.getContext(
    ContextType.USER, 'user-ctx',
  );
  t.equal(stored, null, 'Should not find deleted context');
});

test('ContextManager - deleteContext returns false for nonexistent', async (t) => {
  const store = createStore();
  const sqlEngine = createMockSqlEngine(store);
  const cdc = createMockCDC(store);
  const manager = new ContextManager({
    sqlQueryEngine: sqlEngine,
    cdcIntegrationService: cdc,
  });

  const deleted = await manager.deleteContext(
    ContextType.FUNCTION, 'nonexistent',
  );

  t.equal(deleted, false, 'Should return false');
});

test('ContextManager - getContextsByOwner returns matching', async (t) => {
  const store = createStore();
  const sqlEngine = createMockSqlEngine(store);
  const cdc = createMockCDC(store);
  const manager = new ContextManager({
    sqlQueryEngine: sqlEngine,
    cdcIntegrationService: cdc,
  });

  // Create contexts with same owner
  await manager.setContext(
    ContextType.FUNCTION, 'ctx1', {a: 1}, 'owner-1',
  );
  await manager.setContext(
    ContextType.FUNCTION, 'ctx2', {b: 2}, 'owner-1',
  );
  await manager.setContext(
    ContextType.FUNCTION, 'ctx3', {c: 3}, 'owner-2',
  );

  const contexts = await manager.getContextsByOwner('owner-1');

  t.equal(contexts.length, 2, 'Should return 2 contexts');
  t.ok(
    contexts.some((c) => c.contextName === 'ctx1'),
    'Should include ctx1',
  );
  t.ok(
    contexts.some((c) => c.contextName === 'ctx2'),
    'Should include ctx2',
  );
});

test('ContextManager - getContextsByType returns matching', async (t) => {
  const store = createStore();
  const sqlEngine = createMockSqlEngine(store);
  const cdc = createMockCDC(store);
  const manager = new ContextManager({
    sqlQueryEngine: sqlEngine,
    cdcIntegrationService: cdc,
  });

  // Create contexts of different types
  await manager.setContext(ContextType.FUNCTION, 'func-ctx', {});
  await manager.setContext(ContextType.SERVICE, 'svc-ctx', {});
  await manager.setContext(ContextType.USER, 'user-ctx', {});

  const functionContexts = await manager.getContextsByType(
    ContextType.FUNCTION,
  );
  const serviceContexts = await manager.getContextsByType(
    ContextType.SERVICE,
  );

  t.equal(functionContexts.length, 1, 'Should return 1 function context');
  t.equal(serviceContexts.length, 1, 'Should return 1 service context');
});

test('ContextManager - validates context type', async (t) => {
  const manager = new ContextManager();

  await t.rejects(
    manager.getContext('invalid', 'name'),
    /Invalid context type/,
    'Should throw for invalid type',
  );
});

test('ContextManager - throws when CDC not available', async (t) => {
  const store = createStore();
  const sqlEngine = createMockSqlEngine(store);
  const manager = new ContextManager({sqlQueryEngine: sqlEngine});

  await t.rejects(
    manager.setContext(ContextType.FUNCTION, 'test', {}),
    /CDC integration service not available/,
    'Should throw when CDC not available',
  );
});
