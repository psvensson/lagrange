/**
 * Regression tests proving that HeartbeatService preserves
 * storage_budget_bytes, storage_budget_source, and
 * storage_budget_updated_at across all heartbeat publication paths.
 *
 * Bug: Under load, the heartbeat upsert fallback (triggered when
 * updateSystemTableRow returns 0 affected rows) could lose budget
 * fields because sendHeartbeat's updateRow did not include them.
 * The reporter path also sent nodeRow without budget fields, so
 * the dispatch service's resolveNodeStateUpdateBudgetFields
 * extracted nothing.
 *
 * Owner path verified: HeartbeatService.sendHeartbeat ->
 *   writeNodeHeartbeat upsert fallback preserves budget from cache;
 *   reporter payload includes budget fields from cache.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  HeartbeatService,
} from '../../src/control-plane/heartbeat-service.js';
import {COLUMN, NUM} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';

const TEST_NODE_ID = 'node-budget-preserve';
const TEST_NODE_ADDRESS = '10.0.0.99:8080';
const TEST_BUDGET_BYTES = 1073741824;
const TEST_BUDGET_SOURCE = 'absolute';
const TEST_BUDGET_UPDATED_AT = 50000;
const TEST_CREATED_AT = 40000;
const TEST_NOW = 60000;

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createCacheWithBudget() {
  return {
    get: (tableName, key) => {
      if (tableName === SYSTEM_TABLE_NAME.NODES &&
          key === TEST_NODE_ID) {
        return {
          node_id: TEST_NODE_ID,
          node_address: TEST_NODE_ADDRESS,
          created_at: TEST_CREATED_AT,
          [COLUMN.STORAGE_BUDGET_BYTES]: TEST_BUDGET_BYTES,
          [COLUMN.STORAGE_BUDGET_SOURCE]: TEST_BUDGET_SOURCE,
          [COLUMN.STORAGE_BUDGET_UPDATED_AT]: TEST_BUDGET_UPDATED_AT,
        };
      }
      return null;
    },
  };
}


test('writeNodeHeartbeat upsert fallback preserves storage budget ' +
  'fields from cache when UPDATE returns zero affected rows',
async (t) => {
  initEnv();

  const upserts = [];
  const service = new HeartbeatService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({
        success: true,
        partitionResult: {affectedRows: NUM.ZERO},
      }),
      upsertSystemTableRow: async (_table, row) => {
        upserts.push(row);
        return {success: true};
      },
    },
    systemTableCache: createCacheWithBudget(),
    now: () => TEST_NOW,
  });

  try {
    await service.sendHeartbeat(null, null);

    const nodeUpsert = upserts.find((r) =>
      r[COLUMN.NODE_ID] === TEST_NODE_ID &&
      r.last_heartbeat === TEST_NOW);
    t.ok(nodeUpsert, 'upsert fallback should fire for nodes row');
    t.equal(
      nodeUpsert[COLUMN.STORAGE_BUDGET_BYTES],
      TEST_BUDGET_BYTES,
      'upsert fallback must preserve storage_budget_bytes from cache',
    );
    t.equal(
      nodeUpsert[COLUMN.STORAGE_BUDGET_SOURCE],
      TEST_BUDGET_SOURCE,
      'upsert fallback must preserve storage_budget_source from cache',
    );
    t.equal(
      nodeUpsert[COLUMN.STORAGE_BUDGET_UPDATED_AT],
      TEST_BUDGET_UPDATED_AT,
      'upsert fallback must preserve storage_budget_updated_at from cache',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('reporter payload includes storage budget fields from cache ' +
  'so dispatch-side resolveNodeStateUpdateBudgetFields can extract them',
async (t) => {
  initEnv();

  let reportedPayload = null;
  const service = new HeartbeatService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    systemTableCache: createCacheWithBudget(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 5000,
    nodeStateReporter: async (payload) => {
      reportedPayload = payload;
      return {
        publicationPath: 'node_state_reporter',
        targetAddress: 'seed-1/message-group/mg-1',
      };
    },
    now: () => TEST_NOW,
  });

  try {
    await service.sendHeartbeat(null, null);

    t.ok(reportedPayload, 'reporter should receive heartbeat payload');
    const nodeRow = reportedPayload.nodeRow;
    t.ok(nodeRow, 'reporter payload should include nodeRow');
    t.equal(
      nodeRow[COLUMN.STORAGE_BUDGET_BYTES],
      TEST_BUDGET_BYTES,
      'reporter nodeRow must include storage_budget_bytes from cache',
    );
    t.equal(
      nodeRow[COLUMN.STORAGE_BUDGET_SOURCE],
      TEST_BUDGET_SOURCE,
      'reporter nodeRow must include storage_budget_source from cache',
    );
    t.equal(
      nodeRow[COLUMN.STORAGE_BUDGET_UPDATED_AT],
      TEST_BUDGET_UPDATED_AT,
      'reporter nodeRow must include storage_budget_updated_at from cache',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('sendHeartbeat updateRow includes budget fields in the partial ' +
  'UPDATE path so CDC events carry budget columns',
async (t) => {
  initEnv();

  let capturedUpdateRow = null;
  const service = new HeartbeatService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    cdcIntegrationService: {
      updateSystemTableRow: async (_table, _where, row) => {
        capturedUpdateRow = row;
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      upsertSystemTableRow: async () => ({success: true}),
    },
    systemTableCache: createCacheWithBudget(),
    now: () => TEST_NOW,
  });

  try {
    await service.sendHeartbeat(null, null);

    t.ok(capturedUpdateRow, 'should issue a node UPDATE');
    t.equal(
      capturedUpdateRow[COLUMN.STORAGE_BUDGET_BYTES],
      TEST_BUDGET_BYTES,
      'partial UPDATE must include storage_budget_bytes',
    );
    t.equal(
      capturedUpdateRow[COLUMN.STORAGE_BUDGET_SOURCE],
      TEST_BUDGET_SOURCE,
      'partial UPDATE must include storage_budget_source',
    );
    t.equal(
      capturedUpdateRow[COLUMN.STORAGE_BUDGET_UPDATED_AT],
      TEST_BUDGET_UPDATED_AT,
      'partial UPDATE must include storage_budget_updated_at',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('sendHeartbeat omits budget fields when cache has no budget ' +
  'to avoid writing null/zero budget over a valid value',
async (t) => {
  initEnv();

  let capturedUpdateRow = null;
  const emptyCache = {
    get: () => null,
  };
  const service = new HeartbeatService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    cdcIntegrationService: {
      updateSystemTableRow: async (_table, _where, row) => {
        capturedUpdateRow = row;
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      upsertSystemTableRow: async () => ({success: true}),
    },
    systemTableCache: emptyCache,
    now: () => TEST_NOW,
  });

  try {
    await service.sendHeartbeat(null, null);

    t.ok(capturedUpdateRow, 'should issue a node UPDATE');
    t.equal(
      capturedUpdateRow[COLUMN.STORAGE_BUDGET_BYTES],
      undefined,
      'should not include budget bytes when cache has no budget',
    );
    t.equal(
      capturedUpdateRow[COLUMN.STORAGE_BUDGET_SOURCE],
      undefined,
      'should not include budget source when cache has no budget',
    );
    t.equal(
      capturedUpdateRow[COLUMN.STORAGE_BUDGET_UPDATED_AT],
      undefined,
      'should not include budget updated_at when cache has no budget',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
