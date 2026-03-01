/**
 * Unit tests for NodeStorageBudgetService.
 *
 * Requirements: 1.1, 1.3, 1.4, 1.5, 9.1, 9.3, 9.4
 */

import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, NODE_STATE, NUM} from '../../src/constants/index.js';
import {
  STORAGE_BUDGET_SOURCE,
  STORAGE_BUDGET_VALIDATION,
  STORAGE_CAPACITY_ERROR_MSG,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  NodeStorageBudgetService,
} from '../../src/rebalancer/node-storage-budget-service.js';

const TEST_NODE_ID = 'test-node-1';
const TEST_DISK_GB = 100;
const TEST_DISK_BYTES = Math.floor(TEST_DISK_GB * NUM.BYTES_PER_GIB);

function buildNodeRow(overrides = {}) {
  return {
    [COLUMN.NODE_ID]: TEST_NODE_ID,
    [COLUMN.NODE_ADDRESS]: 'ws://localhost:3000',
    [COLUMN.DISK_GB]: TEST_DISK_GB,
    [COLUMN.STATUS]: NODE_STATE.ACTIVE,
    [COLUMN.LAST_HEARTBEAT]: Date.now(),
    [COLUMN.CREATED_AT]: Date.now(),
    ...overrides,
  };
}

function createMockCdc(result = {success: true}) {
  return {upsertSystemTableRow: async () => result};
}

function setup(configOverrides = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize(configOverrides);
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
  return config;
}

function teardown() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createService() {
  return new NodeStorageBudgetService({
    nodeId: TEST_NODE_ID,
    cdcIntegrationService: createMockCdc(),
  });
}

test('resolveBudget - absolute budget from config', async (t) => {
  setup({node: {storageBudgetBytes: 50 * NUM.BYTES_PER_GIB}});
  const service = createService();

  const result = service.resolveBudget(buildNodeRow());
  assert.equal(result.isValid, true);
  assert.equal(result.budgetBytes, 50 * NUM.BYTES_PER_GIB);
  assert.equal(result.source, STORAGE_BUDGET_SOURCE.ABSOLUTE);
  assert.equal(result.error, null);
  assert.equal(result.warning, null);
  teardown();
  t.end();
});

test('resolveBudget - ratio budget from config', async (t) => {
  setup({node: {storageBudgetRatio: 0.5}});
  const service = createService();

  const result = service.resolveBudget(buildNodeRow());
  assert.equal(result.isValid, true);
  assert.equal(result.budgetBytes, Math.floor(TEST_DISK_BYTES * 0.5));
  assert.equal(result.source, STORAGE_BUDGET_SOURCE.RATIO);
  assert.equal(result.error, null);
  teardown();
  t.end();
});

test('resolveBudget - absolute wins when both provided', async (t) => {
  setup({
    node: {
      storageBudgetBytes: 30 * NUM.BYTES_PER_GIB,
      storageBudgetRatio: 0.8,
    },
  });
  const service = createService();

  const result = service.resolveBudget(buildNodeRow());
  assert.equal(result.isValid, true);
  assert.equal(result.budgetBytes, 30 * NUM.BYTES_PER_GIB);
  assert.equal(result.source, STORAGE_BUDGET_SOURCE.ABSOLUTE);
  assert.equal(
    result.warning,
    STORAGE_CAPACITY_ERROR_MSG.BOTH_BUDGET_TYPES_PROVIDED,
  );
  teardown();
  t.end();
});

test('resolveBudget - backfill when no config set', async (t) => {
  setup();
  const service = createService();

  const result = service.resolveBudget(buildNodeRow());
  assert.equal(result.isValid, true);
  assert.equal(result.budgetBytes, TEST_DISK_BYTES);
  assert.equal(result.source, STORAGE_BUDGET_SOURCE.BACKFILL);
  teardown();
  t.end();
});

test('resolveBudget - error when ratio out of range', async (t) => {
  const config = setup();
  config.config.node.storageBudgetRatio = 1.5;
  const service = createService();

  const result = service.resolveBudget(buildNodeRow());
  assert.equal(result.isValid, false);
  assert.equal(result.budgetBytes, null);
  assert.equal(
    result.error,
    STORAGE_CAPACITY_ERROR_MSG.RATIO_OUT_OF_RANGE,
  );
  teardown();
  t.end();
});

test('resolveBudget - error when ratio below minimum', async (t) => {
  const config = setup();
  config.config.node.storageBudgetRatio = 0.001;
  const service = createService();

  const result = service.resolveBudget(buildNodeRow());
  assert.equal(result.isValid, false);
  assert.equal(
    result.error,
    STORAGE_CAPACITY_ERROR_MSG.RATIO_OUT_OF_RANGE,
  );
  teardown();
  t.end();
});

test('resolveBudget - error when budget non-positive', async (t) => {
  const config = setup();
  config.config.node.storageBudgetBytes = 0;
  const service = createService();

  const result = service.resolveBudget(buildNodeRow());
  assert.equal(result.isValid, false);
  assert.equal(
    result.error,
    STORAGE_CAPACITY_ERROR_MSG.BUDGET_NON_POSITIVE,
  );
  teardown();
  t.end();
});

test('resolveBudget - error when budget exceeds disk', async (t) => {
  setup({node: {storageBudgetBytes: TEST_DISK_BYTES + 1}});
  const service = createService();

  const result = service.resolveBudget(buildNodeRow());
  assert.equal(result.isValid, false);
  assert.equal(
    result.error,
    STORAGE_CAPACITY_ERROR_MSG.BUDGET_EXCEEDS_DISK,
  );
  teardown();
  t.end();
});

test('resolveBudget - error when budget below minimum', async (t) => {
  setup({
    node: {
      storageBudgetBytes: STORAGE_BUDGET_VALIDATION.MIN_BUDGET_BYTES - 1,
    },
  });
  const service = createService();

  const nodeRow = buildNodeRow({[COLUMN.DISK_GB]: NUM.BYTES_PER_GIB});
  const result = service.resolveBudget(nodeRow);
  assert.equal(result.isValid, false);
  assert.equal(
    result.error,
    STORAGE_CAPACITY_ERROR_MSG.BUDGET_TOO_SMALL,
  );
  teardown();
  t.end();
});

test('resolveBudget - error when disk unavailable for ratio',
  async (t) => {
    setup({node: {storageBudgetRatio: 0.5}});
    const service = createService();

    const nodeRow = buildNodeRow({[COLUMN.DISK_GB]: null});
    const result = service.resolveBudget(nodeRow);
    assert.equal(result.isValid, false);
    assert.equal(
      result.error,
      STORAGE_CAPACITY_ERROR_MSG.DISK_SIZE_UNAVAILABLE,
    );
    teardown();
    t.end();
  });

test('resolveBudget - error when no config and no disk', async (t) => {
  setup();
  const service = createService();

  const nodeRow = buildNodeRow({[COLUMN.DISK_GB]: 0});
  const result = service.resolveBudget(nodeRow);
  assert.equal(result.isValid, false);
  assert.equal(
    result.error,
    STORAGE_CAPACITY_ERROR_MSG.DISK_SIZE_UNAVAILABLE,
  );
  teardown();
  t.end();
});

test('resolveBudget - throws on null nodeRow', async (t) => {
  setup();
  const service = createService();

  assert.throws(() => service.resolveBudget(null));
  teardown();
  t.end();
});

test('buildBudgetRow - valid budget preserves status', async (t) => {
  setup({node: {storageBudgetBytes: 50 * NUM.BYTES_PER_GIB}});
  const service = createService();

  const nodeRow = buildNodeRow();
  const resolution = service.resolveBudget(nodeRow);
  const row = service.buildBudgetRow(nodeRow, resolution);

  assert.equal(row[COLUMN.STATUS], NODE_STATE.ACTIVE);
  assert.equal(
    row[COLUMN.STORAGE_BUDGET_BYTES],
    50 * NUM.BYTES_PER_GIB,
  );
  assert.equal(
    row[COLUMN.STORAGE_BUDGET_SOURCE],
    STORAGE_BUDGET_SOURCE.ABSOLUTE,
  );
  assert.ok(row[COLUMN.STORAGE_BUDGET_UPDATED_AT] > 0);
  teardown();
  t.end();
});

test('buildBudgetRow - invalid budget sets JOINING status',
  async (t) => {
    const config = setup();
    config.config.node.storageBudgetBytes = -1;
    const service = createService();

    const nodeRow = buildNodeRow();
    const resolution = service.resolveBudget(nodeRow);
    const row = service.buildBudgetRow(nodeRow, resolution);

    assert.equal(row[COLUMN.STATUS], NODE_STATE.JOINING);
    assert.equal(row[COLUMN.STORAGE_BUDGET_BYTES], null);
    assert.equal(row[COLUMN.STORAGE_BUDGET_SOURCE], null);
    teardown();
    t.end();
  });

test('registerNodeBudget - persists valid budget', async (t) => {
  setup({node: {storageBudgetBytes: 50 * NUM.BYTES_PER_GIB}});
  const mockCdc = createMockCdc();
  const service = new NodeStorageBudgetService({
    nodeId: TEST_NODE_ID,
    cdcIntegrationService: mockCdc,
  });
  service.initialize({
    nodeId: TEST_NODE_ID,
    cdcIntegrationService: mockCdc,
  });

  const {result, budgetRow, resolution} =
    await service.registerNodeBudget({nodeRow: buildNodeRow()});

  assert.equal(result.success, true);
  assert.equal(resolution.isValid, true);
  assert.equal(
    budgetRow[COLUMN.STORAGE_BUDGET_BYTES],
    50 * NUM.BYTES_PER_GIB,
  );
  teardown();
  t.end();
});

test('registerNodeBudget - forwards upsert options to CDC writes', async (t) => {
  setup({node: {storageBudgetBytes: 50 * NUM.BYTES_PER_GIB}});
  const upsertCalls = [];
  const mockCdc = {
    upsertSystemTableRow: async (tableName, rowData, options) => {
      upsertCalls.push({tableName, rowData, options});
      return {success: true};
    },
  };
  const service = new NodeStorageBudgetService({
    nodeId: TEST_NODE_ID,
    cdcIntegrationService: mockCdc,
  });
  service.initialize({
    nodeId: TEST_NODE_ID,
    cdcIntegrationService: mockCdc,
  });

  await service.registerNodeBudget({
    nodeRow: buildNodeRow(),
    upsertOptions: {skipCacheWait: true},
  });

  assert.equal(upsertCalls.length, 1);
  assert.deepEqual(upsertCalls[0].options, {skipCacheWait: true});
  teardown();
  t.end();
});

test('registerNodeBudget - throws on upsert failure', async (t) => {
  setup({node: {storageBudgetBytes: 50 * NUM.BYTES_PER_GIB}});
  const mockCdc = createMockCdc({success: false, error: 'write failed'});
  const service = new NodeStorageBudgetService({
    nodeId: TEST_NODE_ID,
    cdcIntegrationService: mockCdc,
  });
  service.initialize({
    nodeId: TEST_NODE_ID,
    cdcIntegrationService: mockCdc,
  });

  await assert.rejects(
    () => service.registerNodeBudget({nodeRow: buildNodeRow()}),
    {message: 'write failed'},
  );
  teardown();
  t.end();
});

test('registerNodeBudget - throws on missing nodeRow', async (t) => {
  setup();
  const mockCdc = createMockCdc();
  const service = new NodeStorageBudgetService({
    nodeId: TEST_NODE_ID,
    cdcIntegrationService: mockCdc,
  });
  service.initialize({
    nodeId: TEST_NODE_ID,
    cdcIntegrationService: mockCdc,
  });

  await assert.rejects(() => service.registerNodeBudget({}));
  teardown();
  t.end();
});

test('initialize - throws on missing nodeId', async (t) => {
  setup();
  const service = new NodeStorageBudgetService({
    cdcIntegrationService: createMockCdc(),
  });

  assert.throws(
    () => service.initialize({cdcIntegrationService: createMockCdc()}),
  );
  teardown();
  t.end();
});

test('initialize - throws on missing cdcIntegrationService',
  async (t) => {
    setup();
    const service = new NodeStorageBudgetService({
      nodeId: TEST_NODE_ID,
    });

    assert.throws(
      () => service.initialize({nodeId: TEST_NODE_ID}),
    );
    teardown();
    t.end();
  });

test('resolveBudget - budget bytes are floored', async (t) => {
  setup({node: {storageBudgetRatio: 0.33}});
  const service = createService();

  const result = service.resolveBudget(buildNodeRow());
  assert.equal(result.isValid, true);
  assert.equal(
    result.budgetBytes,
    Math.floor(TEST_DISK_BYTES * 0.33),
  );
  assert.equal(result.budgetBytes % 1, 0);
  teardown();
  t.end();
});

test('resolveBudget - resolvedAt is a timestamp', async (t) => {
  setup();
  const before = Date.now();
  const service = createService();

  const result = service.resolveBudget(buildNodeRow());
  const after = Date.now();
  assert.ok(result.resolvedAt >= before);
  assert.ok(result.resolvedAt <= after);
  teardown();
  t.end();
});
