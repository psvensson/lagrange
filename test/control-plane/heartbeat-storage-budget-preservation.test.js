/**
 * Regression tests proving that HeartbeatService preserves
 * storage_budget_bytes, storage_budget_source, and
 * storage_budget_updated_at across all heartbeat publication paths.
 *
 * Bug: steady-state heartbeat writers were recreating missing
 * authoritative node rows from partial local knowledge.
 *
 * Owner path verified: HeartbeatService.sendHeartbeat ->
 *   writeNodeHeartbeat updates existing rows only;
 *   reporter payload includes budget fields from cache.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  HeartbeatService as RawHeartbeatService,
} from '../../src/control-plane/heartbeat-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {COLUMN} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {PRESSURE_WORK_CLASS} from
  '../../src/control-plane/pressure-governor.js';

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

function createHeartbeatService(options = {}) {
  const controlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway ||
    new ControlPlaneSystemTableGateway({
      nodeId: options.nodeId || null,
      cdcIntegrationService: options.cdcIntegrationService || null,
      sqlQueryEngine: options.cdcIntegrationService?.sqlQueryEngine || null,
      systemTableCache: options.systemTableCache || null,
      messageRouter: options.messageRouter || null,
    });
  return new RawHeartbeatService({
    ...options,
    controlPlaneSystemTableGateway,
  });
}

function HeartbeatService(options = {}) {
  return createHeartbeatService(options);
}

HeartbeatService.prototype = RawHeartbeatService.prototype;


test('writeNodeHeartbeat fails loudly when the authoritative nodes row is missing',
  async (t) => {
    initEnv();

    const updates = [];
    const upserts = [];
    const service = new HeartbeatService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      cdcIntegrationService: {
        updateSystemTableRow: async (_table, _where, row) => {
          updates.push(row);
          return {
            success: true,
            partitionResult: {affectedRows: 0},
          };
        },
        upsertSystemTableRow: async (_table, row) => {
          upserts.push(row);
          return {success: true};
        },
      },
      systemTableCache: createCacheWithBudget(),
      now: () => TEST_NOW,
    });

    try {
      await t.rejects(
        service.sendHeartbeat(null, null),
        /node row .*missing/i,
        'missing authoritative rows should fail instead of being recreated',
      );
      t.equal(updates.length, 1, 'should still attempt one heartbeat update');
      t.equal(upserts.length, 0, 'steady-state heartbeat should not recreate rows');
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
      reportedPayload.nodeStatePublicationMode,
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
      'initial heartbeat reporter payload should enter freshness-recovery mode',
    );
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

test('sendHeartbeat keeps recovery heartbeat metadata writes on the ' +
  'non-deferrable control-plane contract while endpoint writes stay deferred',
async (t) => {
  initEnv();

  const nodeWrites = [];
  const endpointWrites = [];
  const service = new HeartbeatService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow(tableName, whereClause, row, options) {
        nodeWrites.push({tableName, whereClause, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      async upsertSystemTableRow(tableName, row, options) {
        endpointWrites.push({tableName, row, options});
        return {success: true};
      },
    },
    systemTableCache: createCacheWithBudget(),
    now: () => TEST_NOW,
  });

  try {
    await service.sendHeartbeat(null, null);

    t.equal(nodeWrites.length, 1, 'heartbeat should issue one node update');
    t.equal(
      nodeWrites[0].tableName,
      SYSTEM_TABLE_NAME.NODES,
      'heartbeat should update the nodes table',
    );
    t.same(
      nodeWrites[0].options,
      {
        allowCoalescing: true,
        allowPressureDefer: false,
        coalescingKey: `heartbeat:nodes:${TEST_NODE_ID}`,
        deliveryPriority: 'critical',
        mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
        pressureRetryAfterMs: service.heartbeatIntervalMs,
        queryTimeoutMs: service.resolveHeartbeatWriteQueryTimeoutMs(),
        skipCacheWait: true,
        workloadClass: 'node_state_publication_critical',
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
      },
      'initial node heartbeat writes should use the non-deferrable recovery write contract',
    );

    t.equal(endpointWrites.length, 1, 'heartbeat should issue one endpoint upsert');
    t.equal(
      endpointWrites[0].tableName,
      SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
      'heartbeat should upsert the node endpoint row',
    );
    t.same(
      endpointWrites[0].options,
      {
        allowCoalescing: true,
        allowPressureDefer: true,
        coalescingKey: `heartbeat:endpoint:ep-${TEST_NODE_ID}-ws`,
        deliveryPriority: 'background',
        mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
        pressureRetryAfterMs: service.heartbeatIntervalMs,
        queryTimeoutMs: service.resolveHeartbeatWriteQueryTimeoutMs(),
        skipCacheWait: true,
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      },
      'endpoint upserts should reuse the same coalesced deferred write contract',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('sendHeartbeat does not fail READY publication on retryable endpoint ' +
  'pressure',
async (t) => {
  initEnv();

  const nodeWrites = [];
  const endpointWrites = [];
  const service = new HeartbeatService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow(tableName, whereClause, row, options) {
        nodeWrites.push({tableName, whereClause, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      async upsertSystemTableRow(tableName, row, options) {
        endpointWrites.push({tableName, row, options});
        const error = new Error(
          'Distributed operation failed due to participant failures',
        );
        error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
        error.retryAfterMs = 2250;
        throw error;
      },
    },
    systemTableCache: createCacheWithBudget(),
    now: () => TEST_NOW,
  });

  try {
    await service.sendHeartbeat(null, null);

    t.equal(nodeWrites.length, 1, 'node heartbeat remains strict and succeeds');
    t.equal(
      endpointWrites.length,
      1,
      'endpoint heartbeat upsert is still attempted once',
    );
    t.equal(
      endpointWrites[0].options?.allowPressureDefer,
      true,
      'endpoint heartbeat upsert keeps the pressure-deferred contract',
    );
    t.equal(
      service.lastEndpointUpsertAt,
      TEST_NOW,
      'deferred endpoint pressure still records the refresh attempt',
    );
    t.equal(
      service.lastEndpointUpsertSignature,
      service.buildEndpointUpsertSignature(endpointWrites[0].row),
      'deferred endpoint pressure coalesces repeated refresh attempts',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('sendHeartbeat still fails READY publication on non-retryable endpoint ' +
  'upsert failures',
async (t) => {
  initEnv();

  const nodeWrites = [];
  const endpointWrites = [];
  const service = new HeartbeatService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow(tableName, whereClause, row, options) {
        nodeWrites.push({tableName, whereClause, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      async upsertSystemTableRow(tableName, row, options) {
        endpointWrites.push({tableName, row, options});
        const error = new Error('node endpoint heartbeat validation failed');
        error.code = 'VALIDATION_ERROR';
        throw error;
      },
    },
    systemTableCache: createCacheWithBudget(),
    now: () => TEST_NOW,
  });

  try {
    await t.rejects(
      service.sendHeartbeat(null, null),
      /validation failed/,
      'non-retryable endpoint upsert failures should not be deferred',
    );
    t.equal(nodeWrites.length, 1, 'node heartbeat still succeeds first');
    t.equal(
      endpointWrites.length,
      1,
      'endpoint heartbeat upsert is attempted once before failing',
    );
    t.equal(
      service.lastEndpointUpsertAt,
      null,
      'failed non-retryable endpoint writes should not record refresh success',
    );
    t.equal(
      service.lastEndpointUpsertSignature,
      null,
      'failed non-retryable endpoint writes should not update coalescing state',
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
