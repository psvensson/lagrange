/**
 * Dynamic Configuration Service Tests
 * Tests for dynamic configuration management through system table.
 * Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.9, 30.10
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  DynamicConfigService,
  ConfigValueType,
  CONFIG_DEFINITIONS,
} from '../../src/config/dynamic-config-service.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';

/**
 * Create a mock CDC integration service.
 */
function createMockCDCService(options = {}) {
  const insertedRows = [];
  const updatedRows = [];
  const knownPrimaryKeys = new Set(
    Array.isArray(options?.existingPrimaryKeys) ?
      options.existingPrimaryKeys :
      [],
  );

  return {
    insertedRows,
    updatedRows,
    async insertSystemTableRow(tableName, data, options = {}) {
      insertedRows.push({tableName, data, options});
      const primaryKey =
        data?.config_key ||
        data?.node_id ||
        data?.service_id ||
        data?.log_id ||
        null;
      if (primaryKey && options?.ignoreExisting === true &&
          knownPrimaryKeys.has(primaryKey)) {
        return {success: true, affectedRows: 0};
      }
      if (primaryKey) {
        knownPrimaryKeys.add(primaryKey);
      }
      return {success: true, affectedRows: 1};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      updatedRows.push({tableName, whereClause, data});
      return {success: true, changes: 1};
    },
  };
}

/**
 * Create a mock SQL query engine backed by a Map.
 */
function createMockSqlEngine(initialData = {}) {
  const cache = new Map();

  for (const [key, value] of Object.entries(initialData)) {
    cache.set(key, value);
  }

  return {
    cache,
    async executeQuery(sql, params) {
      if (sql.includes('WHERE config_key = ?') && params?.[0]) {
        const row = cache.get(params[0]) || null;
        return {rows: row ? [row] : []};
      }
      if (sql.includes('FROM config') &&
          !sql.includes('WHERE')) {
        return {rows: Array.from(cache.values())};
      }
      return {rows: []};
    },
  };
}

test('DynamicConfigService initialization', async (t) => {
  const service = new DynamicConfigService({
    nodeId: 'test-node',
  });

  t.notOk(service.isInitialized(),
    'should not be initialized before init');

  await service.initialize();

  t.ok(service.isInitialized(),
    'should be initialized after init');
});

test('DynamicConfigService get with default value', async (t) => {
  const mockEngine = createMockSqlEngine();
  const service = new DynamicConfigService({
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  const value = await service.get('logging.level');
  t.equal(value, 'info',
    'should return default value for missing key');
});


test('DynamicConfigService get from SQL engine', async (t) => {
  const mockEngine = createMockSqlEngine({
    'logging.level': {
      config_key: 'logging.level',
      config_value: 'debug',
      value_type: ConfigValueType.STRING,
    },
  });
  const service = new DynamicConfigService({
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  const value = await service.get('logging.level');
  t.equal(value, 'debug', 'should return value from SQL engine');
});

test('DynamicConfigService set value', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const service = new DynamicConfigService({
    cdcIntegrationService: mockCDC,
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  const result = await service.set(
    'logging.level', 'warn', 'test-user',
  );

  t.ok(result.success, 'should succeed');
  t.equal(result.key, 'logging.level', 'should return key');
  t.equal(result.value, 'warn', 'should return value');
  t.equal(mockCDC.insertedRows.length, 1,
    'should insert row');
  t.equal(
    mockCDC.insertedRows[0].data.config_key,
    'logging.level',
    'should insert correct key',
  );
  t.equal(
    mockCDC.insertedRows[0].data.updated_by,
    'test-user',
    'should record who made change',
  );
});

test('DynamicConfigService update existing value', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine({
    'logging.level': {
      config_key: 'logging.level',
      config_value: 'info',
      value_type: ConfigValueType.STRING,
    },
  });
  const service = new DynamicConfigService({
    cdcIntegrationService: mockCDC,
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  const result = await service.set(
    'logging.level', 'error', 'admin',
  );

  t.ok(result.success, 'should succeed');
  t.equal(mockCDC.updatedRows.length, 1,
    'should update row');
  t.equal(
    mockCDC.updatedRows[0].data.updated_by,
    'admin',
    'should record who made change',
  );
});

test('DynamicConfigService validation - invalid log level',
  async (t) => {
    const mockCDC = createMockCDCService();
    const service = new DynamicConfigService({
      cdcIntegrationService: mockCDC,
      nodeId: 'test-node',
    });
    await service.initialize();

    await t.rejects(
      service.set('logging.level', 'invalid-level', 'test'),
      /Invalid log level/,
      'should reject invalid log level',
    );
  });

test('DynamicConfigService validation - wrong type', async (t) => {
  const mockCDC = createMockCDCService();
  const service = new DynamicConfigService({
    cdcIntegrationService: mockCDC,
    nodeId: 'test-node',
  });
  await service.initialize();

  await t.rejects(
    service.set('node.heartbeatIntervalMs', 'not-a-number', 'test'),
    /Expected number/,
    'should reject wrong type',
  );
});

test('DynamicConfigService watchers', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const service = new DynamicConfigService({
    cdcIntegrationService: mockCDC,
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  let watcherCalled = false;
  let receivedNewValue = null;

  const unsubscribe = service.watch(
    'logging.level', (newValue, _oldValue, _key) => {
      watcherCalled = true;
      receivedNewValue = newValue;
    });

  await service.set('logging.level', 'debug', 'test');

  // Simulate CDC event arriving
  await service.handleCDCEvent({
    operation: 'INSERT',
    data: {
      config_key: 'logging.level',
      config_value: 'debug',
      value_type: 'string',
    },
  });

  t.ok(watcherCalled, 'watcher should be called');
  t.equal(receivedNewValue, 'debug',
    'should receive new value');

  // Unsubscribe and verify no more calls
  unsubscribe();
  watcherCalled = false;

  await service.set('logging.level', 'info', 'test');
  await service.handleCDCEvent({
    operation: 'UPDATE',
    data: {
      config_key: 'logging.level',
      config_value: 'info',
      value_type: 'string',
    },
  });
  t.notOk(watcherCalled,
    'watcher should not be called after unsubscribe');
});


test('DynamicConfigService requiresRestart', async (t) => {
  const service = new DynamicConfigService({
    nodeId: 'test-node',
  });
  await service.initialize();

  t.ok(
    service.requiresRestart('node.restApiPort'),
    'restApiPort should require restart',
  );
  t.notOk(
    service.requiresRestart('raft.electionTimeoutMinMs'),
    'raft election timeout should support hot reload',
  );

  t.notOk(
    service.requiresRestart('logging.level'),
    'logging.level should not require restart',
  );
  t.notOk(
    service.requiresRestart('partition.splitThresholdBytes'),
    'split threshold should not require restart',
  );
});

test('DynamicConfigService getRestartRequiredKeys', async (t) => {
  const service = new DynamicConfigService({
    nodeId: 'test-node',
  });
  await service.initialize();

  const restartKeys = service.getRestartRequiredKeys();

  t.ok(Array.isArray(restartKeys), 'should return array');
  t.ok(restartKeys.includes('node.restApiPort'),
    'should include restApiPort');
  t.notOk(
    restartKeys.includes('raft.electionTimeoutMinMs'),
    'should not include raft timeout',
  );
  t.notOk(
    restartKeys.includes('logging.level'),
    'should not include logging.level',
  );
});

test('DynamicConfigService getHotReloadKeys', async (t) => {
  const service = new DynamicConfigService({
    nodeId: 'test-node',
  });
  await service.initialize();

  const hotReloadKeys = service.getHotReloadKeys();

  t.ok(Array.isArray(hotReloadKeys), 'should return array');
  t.ok(hotReloadKeys.includes('logging.level'),
    'should include logging.level');
  t.ok(
    hotReloadKeys.includes('partition.splitThresholdBytes'),
    'should include split threshold',
  );
  t.ok(
    hotReloadKeys.includes('raft.electionTimeoutMinMs'),
    'should include raft timeout',
  );
  t.notOk(
    hotReloadKeys.includes('node.restApiPort'),
    'should not include restApiPort',
  );
});

test('DynamicConfigService value types', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const service = new DynamicConfigService({
    cdcIntegrationService: mockCDC,
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  // Test number type
  await service.set('node.heartbeatIntervalMs', 2000, 'test');
  t.equal(
    mockCDC.insertedRows[0].data.value_type,
    ConfigValueType.NUMBER,
    'should use number type',
  );

  // Test boolean type
  await service.set(
    'queryCoordinator.speculativeExecutionEnabled', false, 'test',
  );
  t.equal(
    mockCDC.insertedRows[1].data.value_type,
    ConfigValueType.BOOLEAN,
    'should use boolean type',
  );

  // Test string type
  await service.set('logging.level', 'debug', 'test');
  t.equal(
    mockCDC.insertedRows[2].data.value_type,
    ConfigValueType.STRING,
    'should use string type',
  );
});

test('DynamicConfigService getMetadata', async (t) => {
  const service = new DynamicConfigService({
    nodeId: 'test-node',
  });
  await service.initialize();

  const metadata = service.getMetadata('logging.level');

  t.ok(metadata, 'should return metadata');
  t.equal(metadata.type, ConfigValueType.STRING,
    'should have correct type');
  t.equal(metadata.requiresRestart, false,
    'should have requiresRestart');
  t.ok(metadata.description, 'should have description');
  t.equal(metadata.defaultValue, 'info',
    'should have default value');

  const unknown = service.getMetadata('unknown.key');
  t.equal(unknown, null,
    'should return null for unknown key');
});

test('DynamicConfigService handleCDCEvent', async (t) => {
  const service = new DynamicConfigService({
    nodeId: 'test-node',
  });
  await service.initialize();

  let watcherCalled = false;
  service.watch('logging.level', () => {
    watcherCalled = true;
  });

  await service.handleCDCEvent({
    operation: 'UPDATE',
    data: {
      config_key: 'logging.level',
      config_value: 'error',
      value_type: ConfigValueType.STRING,
    },
  });

  t.ok(watcherCalled,
    'watcher should be called on CDC event');

  const cachedValue = await service.get('logging.level');
  t.equal(cachedValue, 'error', 'cache should be updated');
});

test('DynamicConfigService handleCDCEvent resolves definition type when value_type is missing',
  async (t) => {
    const service = new DynamicConfigService({
      nodeId: 'test-node',
    });
    await service.initialize();

    let observedValue = null;
    service.watch(CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS, (newValue) => {
      observedValue = newValue;
    });

    await service.handleCDCEvent({
      operation: 'UPDATE',
      data: {
        config_key: CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS,
        config_value: 'false',
      },
    });

    t.equal(
      observedValue,
      false,
      'watcher should receive boolean when CDC payload omits value_type',
    );
    const cachedValue = await service.get(CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS);
    t.equal(cachedValue, false, 'cache should store boolean value');
  });

test('DynamicConfigService getStats', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const service = new DynamicConfigService({
    cdcIntegrationService: mockCDC,
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  await service.get('logging.level');
  await service.set('logging.level', 'debug', 'test');

  const stats = service.getStats();

  t.ok(stats.reads >= 1, 'should track reads');
  t.ok(stats.writes >= 1, 'should track writes');
  t.ok('watcherCount' in stats, 'should have watcher count');
  t.ok('cachedKeys' in stats, 'should have cached keys count');
});

test('CONFIG_DEFINITIONS coverage', async (t) => {
  t.ok(Object.keys(CONFIG_DEFINITIONS).length > 0,
    'should have definitions');

  for (const [key, def] of Object.entries(CONFIG_DEFINITIONS)) {
    t.ok(def.defaultValue !== undefined,
      `${key} should have defaultValue`);
    t.ok(def.type, `${key} should have type`);
    t.ok(typeof def.requiresRestart === 'boolean',
      `${key} should have requiresRestart`);
    t.ok(def.description, `${key} should have description`);
  }
});


test('DynamicConfigService seedConfiguration', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const service = new DynamicConfigService({
    cdcIntegrationService: mockCDC,
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  const result = await service.seedConfiguration('system');

  t.ok(result.seeded.length > 0, 'should seed some keys');
  t.ok(Array.isArray(result.skipped),
    'should return skipped array');

  const definedKeyCount =
    Object.keys(CONFIG_DEFINITIONS).length;
  t.equal(
    result.seeded.length,
    definedKeyCount,
    'should seed all defined keys',
  );

  const firstInsert = mockCDC.insertedRows[0];
  t.ok(firstInsert.data.config_key, 'should have config_key');
  t.ok(firstInsert.data.config_value !== undefined,
    'should have config_value');
  t.ok(firstInsert.data.value_type, 'should have value_type');
  t.ok(firstInsert.data.description, 'should have description');
  t.ok(firstInsert.data.default_value !== undefined,
    'should have default_value');
  t.equal(firstInsert.data.updated_by, 'system',
    'should record updatedBy');
});

test('DynamicConfigService seedConfiguration skips existing',
  async (t) => {
    const mockCDC = createMockCDCService({
      existingPrimaryKeys: ['logging.level'],
    });
    const mockEngine = createMockSqlEngine({
      'logging.level': {
        config_key: 'logging.level',
        config_value: 'debug',
        value_type: ConfigValueType.STRING,
      },
    });
    const service = new DynamicConfigService({
      cdcIntegrationService: mockCDC,
      sqlQueryEngine: mockEngine,
      nodeId: 'test-node',
    });
    await service.initialize();

    const result = await service.seedConfiguration('system');

    t.ok(result.skipped.includes('logging.level'),
      'should skip existing key');
    t.notOk(result.seeded.includes('logging.level'),
      'should not seed existing key');
  });

test('DynamicConfigService seedConfiguration from env vars',
  async (t) => {
    process.env.NODE_HEARTBEAT_INTERVAL_MS = '5000';

    const mockCDC = createMockCDCService();
    const mockEngine = createMockSqlEngine();
    const service = new DynamicConfigService({
      cdcIntegrationService: mockCDC,
      sqlQueryEngine: mockEngine,
      nodeId: 'test-node',
    });
    await service.initialize();

    await service.seedConfiguration('system');

    const heartbeatInsert = mockCDC.insertedRows.find(
      (r) => r.data.config_key === 'node.heartbeatIntervalMs',
    );

    t.ok(heartbeatInsert,
      'should insert heartbeat interval');
    t.equal(
      heartbeatInsert.data.config_value,
      '5000',
      'should use env var value',
    );

    delete process.env.NODE_HEARTBEAT_INTERVAL_MS;
  });

test('DynamicConfigService seedConfiguration bootstrap fast path skips reads',
  async (t) => {
    const mockCDC = createMockCDCService();
    const service = new DynamicConfigService({
      cdcIntegrationService: mockCDC,
      nodeId: 'test-node',
    });
    await service.initialize();

    service.getControlPlaneSystemTableGateway = () => {
      throw new Error('gateway should not be used');
    };

    const result = await service.seedConfiguration('system', {
      skipExistingCheck: true,
      useDirectCdcMutations: true,
    });

    t.equal(
      result.seeded.length,
      Object.keys(CONFIG_DEFINITIONS).length,
      'should seed all definitions without per-key reads',
    );
    t.same(result.skipped, [], 'should not skip keys when table is known empty');
    t.equal(
      mockCDC.insertedRows.length,
      Object.keys(CONFIG_DEFINITIONS).length,
      'should write directly through CDC for each definition',
    );
  });

test('DynamicConfigService seedConfiguration fast path remains idempotent',
  async (t) => {
    const mockCDC = createMockCDCService();
    const service = new DynamicConfigService({
      cdcIntegrationService: mockCDC,
      nodeId: 'test-node',
    });
    await service.initialize();

    await service.seedConfiguration('system', {
      skipExistingCheck: true,
      useDirectCdcMutations: true,
    });
    const secondResult = await service.seedConfiguration('system', {
      skipExistingCheck: true,
      useDirectCdcMutations: true,
    });

    t.equal(
      secondResult.seeded.length,
      0,
      'replayed bootstrap seeding should not insert duplicates',
    );
    t.equal(
      secondResult.skipped.length,
      Object.keys(CONFIG_DEFINITIONS).length,
      'replayed bootstrap seeding should classify existing keys as skipped',
    );
  });


test('DynamicConfigService hot reload notification', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const service = new DynamicConfigService({
    cdcIntegrationService: mockCDC,
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  const changes = [];
  service.watch(
    'partition.splitThresholdBytes',
    (newValue, oldValue, key) => {
      changes.push({newValue, oldValue, key});
    });

  const result = await service.set(
    'partition.splitThresholdBytes',
    20000000000,
    'admin',
  );

  await service.handleCDCEvent({
    operation: 'INSERT',
    data: {
      config_key: 'partition.splitThresholdBytes',
      config_value: '20000000000',
      value_type: 'number',
    },
  });

  t.notOk(result.requiresRestart,
    'should not require restart');
  t.equal(changes.length, 1, 'watcher should be called');
  t.equal(changes[0].newValue, 20000000000,
    'should receive new value');
});

test('DynamicConfigService restart-required notification',
  async (t) => {
    const mockCDC = createMockCDCService();
    const mockEngine = createMockSqlEngine();
    const service = new DynamicConfigService({
      cdcIntegrationService: mockCDC,
      sqlQueryEngine: mockEngine,
      nodeId: 'test-node',
    });
    await service.initialize();

    const changes = [];
    service.watch('node.restApiPort',
      (newValue, oldValue, key) => {
        changes.push({newValue, oldValue, key});
      });

    const result = await service.set(
      'node.restApiPort', 9090, 'admin',
    );

    await service.handleCDCEvent({
      operation: 'INSERT',
      data: {
        config_key: 'node.restApiPort',
        config_value: '9090',
        value_type: 'number',
      },
    });

    t.ok(result.requiresRestart, 'should require restart');
    t.equal(changes.length, 1,
      'watcher should still be called');
    t.equal(changes[0].newValue, 9090,
      'should receive new value');
  });

test('DynamicConfigService multiple watchers', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const service = new DynamicConfigService({
    cdcIntegrationService: mockCDC,
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  let watcher1Called = false;
  let watcher2Called = false;

  service.watch('logging.level', () => {
    watcher1Called = true;
  });
  service.watch('logging.level', () => {
    watcher2Called = true;
  });

  await service.set('logging.level', 'debug', 'test');

  await service.handleCDCEvent({
    operation: 'INSERT',
    data: {
      config_key: 'logging.level',
      config_value: 'debug',
      value_type: 'string',
    },
  });

  t.ok(watcher1Called, 'first watcher should be called');
  t.ok(watcher2Called, 'second watcher should be called');
});

test('DynamicConfigService event emission', async (t) => {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlEngine();
  const service = new DynamicConfigService({
    cdcIntegrationService: mockCDC,
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  let eventReceived = false;
  service.on('change', (event) => {
    eventReceived = true;
    t.equal(event.key, 'logging.level',
      'should have correct key');
    t.equal(event.newValue, 'warn',
      'should have new value');
  });

  service.watch('logging.level', () => {});

  await service.set('logging.level', 'warn', 'test');

  await service.handleCDCEvent({
    operation: 'INSERT',
    data: {
      config_key: 'logging.level',
      config_value: 'warn',
      value_type: 'string',
    },
  });

  t.ok(eventReceived, 'change event should be emitted');
});


test('DynamicConfigService validation - negative number',
  async (t) => {
    const mockCDC = createMockCDCService();
    const service = new DynamicConfigService({
      cdcIntegrationService: mockCDC,
      nodeId: 'test-node',
    });
    await service.initialize();

    await t.rejects(
      service.set('node.heartbeatIntervalMs', -100, 'test'),
      /Value must be non-negative/,
      'should reject negative values',
    );
  });

test('DynamicConfigService validation - boolean type',
  async (t) => {
    const mockCDC = createMockCDCService();
    const service = new DynamicConfigService({
      cdcIntegrationService: mockCDC,
      nodeId: 'test-node',
    });
    await service.initialize();

    await t.rejects(
      service.set(
        'queryCoordinator.speculativeExecutionEnabled',
        'yes', 'test',
      ),
      /Expected boolean/,
      'should reject non-boolean for boolean config',
    );
  });

test('DynamicConfigService auditing - timestamp recorded',
  async (t) => {
    const mockCDC = createMockCDCService();
    const mockEngine = createMockSqlEngine();
    const service = new DynamicConfigService({
      cdcIntegrationService: mockCDC,
      sqlQueryEngine: mockEngine,
      nodeId: 'test-node',
    });
    await service.initialize();

    const beforeTime = Date.now();
    await service.set('logging.level', 'debug', 'admin-user');
    const afterTime = Date.now();

    const insert = mockCDC.insertedRows[0];
    t.ok(insert.data.updated_at >= beforeTime,
      'should have timestamp >= before');
    t.ok(insert.data.updated_at <= afterTime,
      'should have timestamp <= after');
    t.ok(insert.data.created_at >= beforeTime,
      'should have created_at');
  });

test('DynamicConfigService auditing - updatedBy recorded',
  async (t) => {
    const mockCDC = createMockCDCService();
    const mockEngine = createMockSqlEngine();
    const service = new DynamicConfigService({
      cdcIntegrationService: mockCDC,
      sqlQueryEngine: mockEngine,
      nodeId: 'test-node',
    });
    await service.initialize();

    await service.set(
      'logging.level', 'debug', 'operator@example.com',
    );

    const insert = mockCDC.insertedRows[0];
    t.equal(
      insert.data.updated_by,
      'operator@example.com',
      'should record who made the change',
    );
  });

test('DynamicConfigService auditing - update records change',
  async (t) => {
    const mockCDC = createMockCDCService();
    const mockEngine = createMockSqlEngine({
      'logging.level': {
        config_key: 'logging.level',
        config_value: 'info',
        value_type: ConfigValueType.STRING,
      },
    });
    const service = new DynamicConfigService({
      cdcIntegrationService: mockCDC,
      sqlQueryEngine: mockEngine,
      nodeId: 'test-node',
    });
    await service.initialize();

    await service.set(
      'logging.level', 'error', 'security-admin',
    );

    const update = mockCDC.updatedRows[0];
    t.equal(update.data.updated_by, 'security-admin',
      'should record updater');
    t.ok(update.data.updated_at, 'should record update time');
  });

test('DynamicConfigService validateValue method', async (t) => {
  const service = new DynamicConfigService({
    nodeId: 'test-node',
  });
  await service.initialize();

  let result = service.validateValue('logging.level', 'debug');
  t.ok(result.valid, 'should accept valid log level');

  result = service.validateValue('logging.level', 123);
  t.notOk(result.valid,
    'should reject number for string config');
  t.ok(result.error.includes('Expected string'),
    'should have type error');

  result = service.validateValue(
    'node.heartbeatIntervalMs', 2000,
  );
  t.ok(result.valid, 'should accept valid number');

  result = service.validateValue(
    'node.heartbeatIntervalMs', 'fast',
  );
  t.notOk(result.valid,
    'should reject string for number config');

  result = service.validateValue(
    'queryCoordinator.speculativeExecutionEnabled', true,
  );
  t.ok(result.valid, 'should accept valid boolean');

  result = service.validateValue(
    'custom.unknown.key', 'any value',
  );
  t.ok(result.valid, 'should allow unknown keys');
});

test('DynamicConfigService getAll returns defaults', async (t) => {
  const mockEngine = createMockSqlEngine();
  const service = new DynamicConfigService({
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  const all = await service.getAll();

  t.ok('logging.level' in all, 'should have logging.level');
  t.equal(all['logging.level'], 'info',
    'should have default value');
  t.ok('node.heartbeatIntervalMs' in all,
    'should have heartbeat interval');
});

test('DynamicConfigService clearCache', async (t) => {
  const mockEngine = createMockSqlEngine({
    'logging.level': {
      config_key: 'logging.level',
      config_value: 'debug',
      value_type: ConfigValueType.STRING,
    },
  });
  const service = new DynamicConfigService({
    sqlQueryEngine: mockEngine,
    nodeId: 'test-node',
  });
  await service.initialize();

  await service.get('logging.level');

  service.clearCache();

  const stats = service.getStats();
  t.equal(stats.cachedKeys, 0,
    'cache should be empty after clear');
});
