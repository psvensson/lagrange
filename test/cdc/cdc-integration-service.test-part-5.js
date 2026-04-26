/**
 * Tests for CDCIntegrationService.
 * Requirements: 5.6, 5.7, 5.8, 5.9, 5.10
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
} from '../../src/cdc/cdc-integration-service.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
} from '../../src/control-plane/owner-contract-outcome.js';
import {
} from '../../src/control-plane/timeout-budget.js';
import {
} from '../../src/control-plane/read-model-contract.js';

// Initialize configuration and logging for tests
beforeEach(() => {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});


/**
 * Create a mock SQL query engine for testing.
 * @return {Object} Mock SQL query engine.
 */
function createMockSqlQueryEngine() {
  const executedQueries = [];

  const mockSqlEngine = {
    executedQueries,
    async executeQuery(sql, params = [], options = {}) {
      executedQueries.push({sql, params, options});
      return {
        success: true,
        affectedRows: 1,
        rows: [],
      };
    },
  };
  mockSqlEngine.queryExecutor = {
    getPartitionRoutingSnapshot() {
      return {
        canonicalLeaderNodeId: 'node-owner',
        serviceRowCount: 1,
        routableServiceCount: 1,
        deniedByNodeId: {},
      };
    },
    async executeOnPartition(partitionId, sql, params = [], _forRead,
      _preferLeader, _preferSameLatencyGroup, executionOptions = {}) {
      const result = await mockSqlEngine.executeQuery(
        sql,
        params,
        {
          ...executionOptions,
          partitionId,
        },
      );
      return {
        success: result.success !== false,
        rows: Array.isArray(result.rows) ? result.rows : [],
        participantNodeId: 'node-owner',
      };
    },
  };
  return mockSqlEngine;
}

/**
 * Create a deterministic cache probe for CDC cache-wait behavior tests.
 * The first onCacheChange registration synchronously flips record presence
 * and emits a matching table change so waiters resolve immediately.
 * @return {{cache: Object, state: Object}}
 */

/**
 * Create a local partition-service map for authoritative system-table tests.
 * @param {string} tableName
 * @param {Object} handlers
 * @return {Map<string, Object>}
 */

test('CDCIntegrationService - executeSQL switches from bootstrap to normal mode',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    let directCallCount = 0;
    const mockPartitionService = {
      partitionId: 'services-p1',
      initialized: true,
      isLeader: true,
      executeLocalQuery: async (_sql, _params) => {
        directCallCount++;
        return {success: true, affectedRows: 1};
      },
    };

    const mockPartitionServices = new Map();
    mockPartitionServices.set('services-p1', mockPartitionService);

    // Enable bootstrap mode
    service.setBootstrapMode(true, mockPartitionServices);

    // First insert should go direct to partition
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, {
      service_id: 'service-1',
      address: 'node1/service/1',
    });

    t.equal(directCallCount, 1, 'should call direct partition in bootstrap mode');
    t.equal(
      mockSqlEngine.executedQueries.length,
      0,
      'should not call SQL engine in bootstrap mode',
    );

    // Disable bootstrap mode
    service.clearBootstrapMode();

    // Second insert should go through SQL engine
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, {
      service_id: 'service-2',
      address: 'node1/service/2',
    });

    t.equal(
      directCallCount,
      1,
      'should not call direct partition after bootstrap mode disabled',
    );
    t.equal(
      mockSqlEngine.executedQueries.length,
      1,
      'should call SQL engine after bootstrap mode disabled',
    );
    t.end();
  });

test('CDCIntegrationService - executeSQL throws when SQL engine missing in normal mode',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
    });
    service.initialize();

    // No SQL engine set and bootstrap mode disabled
    t.equal(service.bootstrapMode, false, 'bootstrap mode should be disabled');
    t.equal(service.sqlQueryEngine, null, 'SQL engine should be null');

    try {
      await service.insertSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, {
        service_id: 'service-1',
        address: 'node1/service/1',
      });
      t.fail('should throw error when SQL engine missing in normal mode');
    } catch (error) {
      t.ok(
        error.message.includes('sqlQueryEngine not provided'),
        'should throw error about missing SQL engine',
      );
    }

    t.end();
  });

test('CDCIntegrationService - executeSQL single code path based on mode flag',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    const mockPartitionService = {
      partitionId: 'nodes-p1',
      initialized: true,
      isLeader: true,
      executeLocalQuery: async (_sql, _params) => {
        return {success: true, affectedRows: 1};
      },
    };

    const mockPartitionServices = new Map();
    mockPartitionServices.set('nodes-p1', mockPartitionService);

    // Test 1: Bootstrap mode enabled - should use direct path
    service.setBootstrapMode(true, mockPartitionServices);
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
      node_id: 'node-1',
      node_address: 'localhost:8080',
    });
    t.equal(
      mockSqlEngine.executedQueries.length,
      0,
      'should not use SQL engine in bootstrap mode',
    );

    // Test 2: Bootstrap mode disabled - should use SQL engine path
    service.clearBootstrapMode();
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
      node_id: 'node-2',
      node_address: 'localhost:8081',
    });
    t.equal(
      mockSqlEngine.executedQueries.length,
      1,
      'should use SQL engine in normal mode',
    );

    t.end();
  });

test('CDCIntegrationService - transient detection includes leader-transition query failures',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
    });

    t.equal(
      service.isTransientCdcError('Query failed'),
      true,
      'generic query-failed wrapper should be treated as transient for CDC writes',
    );
    t.equal(
      service.isTransientCdcError('Failed to forward write to leader'),
      true,
      'leader-forwarding failures should be retried',
    );
    t.equal(
      service.isTransientCdcError('Message timeout'),
      true,
      'transport timeout during leader handoff should be retried',
    );
    t.equal(
      service.isTransientCdcError(
        'Distributed operation failed due to participant failures',
      ),
      true,
      'distributed participant failures should be retried on system-table writes',
    );
    t.equal(
      service.isTransientCdcError(
        new Error('Transaction already active on this partition'),
      ),
      true,
      'partition transaction contention should be retried on system-table writes',
    );
    t.equal(
      service.isTransientCdcError({
        error: 'query_admission_deferred',
        retryAfterMs: 25,
      }),
      true,
      'retryable pressure admission deferrals should be treated as transient',
    );
    t.equal(
      service.isTransientCdcError('SQL syntax error near FROM'),
      false,
      'non-transient SQL errors should not be retried',
    );
    t.end();
  });

test('CDCIntegrationService retries retryable control-plane write admission ' +
  'failures through the shared SQL-routed path', async (t) => {
  const executedQueries = [];
  let attempt = 0;
  const mockSqlEngine = {
    async executeQuery(sql, params = [], options = {}) {
      attempt += 1;
      executedQueries.push({
        sql,
        params,
        options,
      });
      if (attempt === 1) {
        return {
          success: false,
          error: 'query_admission_deferred',
          retryAfterMs: 10,
          pressureAction: 'defer',
          pressureReason: 'transport_backpressure',
        };
      }
      return {
        success: true,
        affectedRows: 1,
        rows: [],
      };
    },
  };

  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();
  service.waitForCacheUpdate = async () => {};
  service.computeRetryDelayMs = () => 0;

  const result = await service.insertSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    {
      node_id: 'node-1',
      node_address: 'localhost:8080',
      cpu_cores: 4,
      memory_mb: 8192,
      disk_gb: 100,
      status: 'active',
      last_heartbeat: Date.now(),
      created_at: Date.now(),
    },
    {
      skipCacheWait: true,
    },
  );

  t.equal(
    result.success,
    true,
    'retryable control-plane admission deferrals should not fail the write path closed',
  );
  t.equal(
    executedQueries.length,
    2,
    'system-table writes should retry once through the shared SQL-routed path',
  );
  t.equal(
    executedQueries[0]?.options?.deliveryPriority,
    'background',
    'retryable non-critical system-table writes should preserve the shared default routed lane classification',
  );
});

test('CDCIntegrationService preserves explicit delivery source through one ' +
  'routed system-table write', async (t) => {
  const WRITE_DELIVERY_SOURCE = 'control-plane:write:nodes';
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();
  service.waitForCacheUpdate = async () => {};

  const result = await service.insertSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    {
      node_id: 'node-delivery-source',
      node_address: 'localhost:8080',
      cpu_cores: 4,
      memory_mb: 8192,
      disk_gb: 100,
      status: 'active',
      last_heartbeat: Date.now(),
      created_at: Date.now(),
    },
    {
      skipCacheWait: true,
      deliverySource: WRITE_DELIVERY_SOURCE,
    },
  );

  t.equal(result.success, true, 'routed write should still succeed');
  t.equal(
    mockSqlEngine.executedQueries.length,
    1,
    'routed write should execute exactly once',
  );
  t.equal(
    mockSqlEngine.executedQueries[0]?.options?.deliverySource,
    WRITE_DELIVERY_SOURCE,
    'routed write should preserve the owner-supplied delivery source',
  );
});


test('CDCIntegrationService preserves canonical transaction-control routing ' +
  'gap defers instead of retrying them away', async (t) => {
  const executedQueries = [];
  const ROUTING_GAP_REASON_CODE = 'transaction_control_owner_missing';
  const ROUTING_GAP_FAILED_DIMENSION = 'transaction_control_routing_gap';
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    retryMaxAttempts: 3,
    sqlQueryEngine: {
      async executeQuery(sql, params = [], options = {}) {
        executedQueries.push({sql, params, options});
        return {
          success: false,
          error: 'query_admission_deferred',
          outcome: 'deferred',
          completionState: 'deferred',
          reasonCode: ROUTING_GAP_REASON_CODE,
          reasonCodes: [ROUTING_GAP_REASON_CODE],
          failedDimensions: [ROUTING_GAP_FAILED_DIMENSION],
          retryAfterMs: 250,
          deferRetry: true,
        };
      },
    },
  });
  service.initialize();
  service.waitForCacheUpdate = async () => {};
  service.computeRetryDelayMs = () => 0;

  const error = await t.rejects(
    service.insertSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {
        node_id: 'node-1',
        node_address: 'localhost:8080',
        cpu_cores: 4,
        memory_mb: 8192,
        disk_gb: 100,
        status: 'active',
        last_heartbeat: Date.now(),
        created_at: Date.now(),
      },
      {
        skipCacheWait: true,
      },
    ),
    'canonical routing-gap defers should fail closed without an internal retry loop',
  );

  t.equal(executedQueries.length, 1,
    'routing-gap admission defers should be surfaced after the first SQL result');
  t.equal(error?.deferRetry, true,
    'wrapped error should preserve defer semantics for upstream owners');
  t.equal(error?.reasonCode, ROUTING_GAP_REASON_CODE,
    'wrapped error should preserve the canonical routing-gap reason code');
  t.same(error?.failedDimensions, [ROUTING_GAP_FAILED_DIMENSION]);
  t.equal(error?.retryAfterMs, 250,
    'wrapped error should preserve the bounded retry hint');
});

test('CDCIntegrationService surfaces system-table owner handoff participant ' +
  'failures without burning the routed SQL retry ladder', async (t) => {
  const ownerHandoffParticipantAddress =
    'leader-node/partition/sql_transactions-p1-r1';
  const ownerHandoffParticipantError =
    `No handler registered for address ${ownerHandoffParticipantAddress}`;
  const ownerHandoffParticipantFailure = {
    failedTable: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
    participantAddress: ownerHandoffParticipantAddress,
    error: ownerHandoffParticipantError,
  };
  let sqlCalls = 0;
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    retryMaxAttempts: 3,
    sqlQueryEngine: {
      async executeQuery() {
        sqlCalls += 1;
        return {
          success: false,
          errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
          error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
          participantFailures: [ownerHandoffParticipantFailure],
          firstFailedParticipant: ownerHandoffParticipantFailure,
        };
      },
    },
  });
  service.initialize();
  service.waitForCacheUpdate = async () => {};
  service.computeRetryDelayMs = () => 0;

  const error = await t.rejects(
    service.upsertSystemTableRow(
      SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      {
        transaction_id: 'tx-1',
        session_id: 'session-1',
        status: 'syncing',
        created_at: 1,
        updated_at: 1,
      },
      {
        skipCacheWait: true,
      },
    ),
    'owner handoff participant failures should surface immediately to the owner loop',
  );

  t.equal(sqlCalls, 1,
    'system-table owner handoff failures should not consume the full CDC retry ladder');
  t.equal(error?.code, QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
    'wrapped error should preserve the distributed participant failure code');
  t.equal(
    error?.firstFailedParticipant?.error,
    ownerHandoffParticipantError,
    'wrapped error should preserve the owner handoff participant witness',
  );
});
