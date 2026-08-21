/**
 * Tests for CDCIntegrationService.
 * Requirements: 5.6, 5.7, 5.8, 5.9, 5.10
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
  CDCOperationType,
} from '../../src/cdc/cdc-integration-service.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
} from '../../src/control-plane/owner-contract-outcome.js';
import {
} from '../../src/control-plane/timeout-budget.js';
import {CDC_EVENT} from '../../src/cdc/cdc-constants.js';
import {
} from '../../src/control-plane/read-model-contract.js';
import {
  createMockSqlQueryEngine,
  createLocalSystemTablePartitionServices,
} from './cdc-integration-service-test-support.js';

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

const LOCAL_AUTHORITATIVE_REPLICA_OPERATION_ID =
  'op-local-authoritative-read';
const LOCAL_AUTHORITATIVE_REPLICA_OPERATION_SQL =
  'SELECT * FROM replica_operations WHERE operation_id = ?';
const LOCAL_AUTHORITATIVE_REPLICA_OPERATION_ROW = Object.freeze({
  operation_id: LOCAL_AUTHORITATIVE_REPLICA_OPERATION_ID,
  workflow_step: 'LOCAL_ONLY_QUERY',
});
const DEFAULT_AUTHORITATIVE_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE
      .OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK,
});

function buildAuthoritativeReadOptions(authority = {}, operational = {}) {
  return {
    ...operational,
    readAuthority: buildControlPlaneReadAuthority({
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE
          .OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK,
      ...authority,
    }),
  };
}

test('CDCIntegrationService - steady-state system table writes skip local followers and use routed SQL',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const localWrites = [];
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.NODES,
        {
          isLeader: false,
          async executeQuery(sql, params) {
            localWrites.push({sql, params});
            return {
              success: true,
              changes: 1,
            };
          },
        },
      ),
    });
    service.initialize();

    await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1'},
      {status: 'ready'},
      {skipCacheWait: true},
    );

    t.equal(
      localWrites.length,
      0,
      'should not execute steady-state writes through a local follower',
    );
    t.equal(
      mockSqlEngine.executedQueries.length,
      1,
      'should fall back to routed SQL when only follower-local replicas are present',
    );
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'fallback routed SQL should stay on control-plane recovery readiness',
    );
  });

test('CDCIntegrationService - authoritative cache confirmation prefers local partition replicas',
  async (t) => {
    const operationId = 'op-local-repair';
    const authoritativeRow = {
      operation_id: operationId,
      status: 'creating',
      workflow_step: 'CREATING',
      updated_at: 500,
    };
    const cacheState = {
      row: null,
    };
    const sqlQueryEngine = {
      executedQueries: [],
      async executeQuery(sql, params = []) {
        this.executedQueries.push({sql, params});
        return {
          success: true,
          rows: [{...authoritativeRow}],
        };
      },
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine,
      systemTableCache: {
        has() {
          return Boolean(cacheState.row);
        },
        get() {
          return cacheState.row;
        },
      },
      cacheMutationTarget: {
        applySystemTableChange(_tableName, _operation, row) {
          cacheState.row = {...row};
        },
      },
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {
          async executeQuery(sql, params) {
            t.equal(
              params[0],
              operationId,
              'local authoritative read should preserve bound parameters',
            );
            return {
              success: true,
              rows: sql.includes('WHERE operation_id = ?') ?
                [{...authoritativeRow}] :
                [],
            };
          },
        },
      ),
    });
    const divergenceEvents = [];
    service.initialize();
    service.on(CDC_EVENT.READ_MODEL_DIVERGENCE, (event) => {
      divergenceEvents.push(event);
    });

    const repaired = await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      operationId,
      true,
      null,
      null,
      {fallbackPhase: 'recovery'},
    );

    t.equal(repaired?.visibilityState, 'visible',
      'should confirm the authoritative row without routed SQL');
    t.equal(repaired?.authoritativeVisibilityConfirmed, true,
      'local authoritative confirmation should preserve the confirmation state');
    t.same(cacheState.row, authoritativeRow,
      'authoritative confirmation should hydrate the writable cache target');
    t.equal(
      sqlQueryEngine.executedQueries.length,
      0,
      'should not use routed SQL when local authoritative replicas are available',
    );
    t.equal(divergenceEvents.length, 1,
      'local authoritative confirmation should emit a cache-lag divergence');
  });

test('CDCIntegrationService - leader-only authoritative reads fall back to the owner RPC lane',
  async (t) => {
    const ownerRpcReads = [];
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: {
        queryExecutor: {
          getPartitionRoutingSnapshot() {
            return {
              canonicalLeaderNodeId: 'node-sql-leader',
              serviceRowCount: 2,
              routableServiceCount: 1,
              deniedByNodeId: {},
            };
          },
          async executeOnPartition(partitionId, sql, params = [], _forRead,
            _preferLeader, _preferSameLatencyGroup, options = {}) {
            ownerRpcReads.push({partitionId, sql, params, options});
            return {
              success: true,
              participantNodeId: 'node-sql-leader',
              rows: [{
                operation_id: 'op-sql-fallback',
                workflow_step: 'PENDING',
              }],
            };
          },
        },
      },
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {
          isLeader: false,
          async executeQuery() {
            return {
              success: true,
              rows: [{
                operation_id: 'op-local-follower',
              }],
            };
          },
        },
      ),
    });
    service.initialize();

    const result = await service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'SELECT * FROM replica_operations WHERE operation_id = ?',
      ['op-sql-fallback'],
      buildAuthoritativeReadOptions({
        localReadConsistency: 'local_leader',
      }, {
        queryOptions: {timeoutMs: 1234},
      }),
    );

    t.equal(result.source, 'owner_rpc_lane', 'should fall back when no local leader is available');
    t.equal(ownerRpcReads.length, 1, 'should use the owner RPC lane once');
    t.equal(ownerRpcReads[0]?.options?.timeoutMs, 1234, 'should preserve query options');
    t.equal(
      ownerRpcReads[0]?.options?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'owner RPC fallback should default to recovery eligibility when callers omit a readiness dimension',
    );
    t.equal(result.localReadHit, false, 'owner RPC fallback should not mark a local read hit');
    t.equal(result.systemTableDiagnostics?.routedToNode, 'node-sql-leader',
      'owner RPC fallback should record the routed leader hint');
    t.equal(result.systemTableDiagnostics?.queryTimeoutMs, 1234,
      'owner RPC fallback should record the query timeout');
  });

test('CDCIntegrationService - owner-RPC authoritative reads preserve critical execution options',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      partitionServicesProvider: () => new Map(),
    });
    service.initialize();

    const result = await service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'SELECT * FROM replica_operations WHERE operation_id = ?',
      ['op-owner-critical'],
      buildAuthoritativeReadOptions({
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        localReadConsistency: 'local_leader',
      }, {
        workClass: 'critical',
        deliveryPriority: 'critical',
        queryOptions: {timeoutMs: 1234},
      }),
    );

    t.equal(result.success, true, 'strict owner-rpc read should still succeed');
    t.equal(result.source, 'owner_rpc_lane', 'strict owner-rpc read should stay on the owner lane');
    t.equal(mockSqlEngine.executedQueries.length, 1, 'owner-rpc path should execute one partition query');
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.partitionId,
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
      'owner-rpc path should target the replica_operations system partition',
    );
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.workClass,
      'critical',
      'owner-rpc path should preserve the critical work class',
    );
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.deliveryPriority,
      'critical',
      'owner-rpc path should preserve the critical delivery priority',
    );
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.timeoutMs,
      1234,
      'owner-rpc path should preserve the bounded query timeout',
    );
    t.equal(
      mockSqlEngine.executedQueries[0]?.options
        ?.allowReadinessAuthoritativeRefresh,
      true,
      'owner-rpc path should keep authoritative routing repair enabled ' +
        'during recovery-owned reads',
    );
  });

test('CDCIntegrationService - leader-only authoritative reads can fall back to local replicas',
  async (t) => {
    const sqlReads = [];
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: {
        queryExecutor: {
          getPartitionRoutingSnapshot() {
            return {
              canonicalLeaderNodeId: 'node-local-leader',
              serviceRowCount: 2,
              routableServiceCount: 1,
              deniedByNodeId: {},
            };
          },
        },
        async executeQuery(sql, params = [], options = {}) {
          sqlReads.push({sql, params, options});
          return {
            success: true,
            rows: [],
          };
        },
      },
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {
          isLeader: false,
          async executeQuery(sql, params) {
            t.equal(
              params[0],
              'op-local-fallback',
              'local replica fallback should preserve query parameters',
            );
            return {
              success: true,
              rows: [{
                operation_id: 'op-local-fallback',
                workflow_step: 'PENDING',
              }],
            };
          },
        },
      ),
    });
    service.initialize();

    const result = await service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'SELECT * FROM replica_operations WHERE operation_id = ?',
      ['op-local-fallback'],
      buildAuthoritativeReadOptions({
        localReadConsistency: 'local_leader',
        replicaFallbackConsistency: 'any_replica',
      }),
    );

    t.equal(
      result.source,
      'local_partition_replica',
      'should use a local follower before routed SQL when replica fallback is allowed',
    );
    t.equal(sqlReads.length, 0, 'should not reach routed SQL fallback');
    t.equal(result.rows.length, 1, 'should return the local replica rows');
    t.equal(result.localReadHit, true, 'local replica read should mark a local read hit');
    t.equal(result.localReplicaFallbackHit, true,
      'local replica fallback should record the fallback path');
    t.equal(result.systemTableDiagnostics?.leaderNodeId, null,
      'local replica fallback should not reconstruct a retired routing-snapshot leader hint');
  });

test('CDCIntegrationService - leader-only authoritative reads honor live leader methods',
  async (t) => {
    let ownerRpcReadCount = 0;
    let sqlFallbackCount = 0;
    const partitionId =
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS];
    const localLeaderService = {
      partitionId,
      replicaId: `${partitionId}-r2`,
      initialized: true,
      isLeader: false,
      role: 'follower',
      isLeaderReplica() {
        return true;
      },
      getRole() {
        return 'leader';
      },
      getLeaderId() {
        return this.replicaId;
      },
      async executeQuery(sql, params) {
        t.equal(
          params[0],
          'op-live-method-leader',
          'live-method leader reads should preserve query parameters',
        );
        return {
          success: true,
          rows: [{
            operation_id: 'op-live-method-leader',
            workflow_step: 'LOCAL_LIVE_METHOD',
          }],
        };
      },
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: {
        queryExecutor: {
          async executeOnPartition() {
            ownerRpcReadCount += 1;
            return {
              success: true,
              participantNodeId: 'node-sql-leader',
              rows: [],
            };
          },
          getPartitionRoutingSnapshot() {
            return {
              canonicalLeaderNodeId: 'node-sql-leader',
              serviceRowCount: 2,
              routableServiceCount: 1,
              deniedByNodeId: {},
            };
          },
        },
        async executeQuery() {
          sqlFallbackCount += 1;
          return {
            success: true,
            rows: [],
          };
        },
      },
      partitionServicesProvider: () => new Map([
        [localLeaderService.replicaId, localLeaderService],
      ]),
    });
    service.initialize();

    const result = await service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'SELECT * FROM replica_operations WHERE operation_id = ?',
      ['op-live-method-leader'],
      buildAuthoritativeReadOptions({
        localReadConsistency: 'local_leader',
      }),
    );

    t.equal(
      result.source,
      'local_partition_replica',
      'live leader methods should satisfy leader-only local authoritative reads',
    );
    t.equal(ownerRpcReadCount, 0,
      'live leader methods should avoid the owner RPC fallback');
    t.equal(sqlFallbackCount, 0,
      'live leader methods should avoid routed SQL fallback');
    t.equal(result.localReadHit, true,
      'live leader methods should count as a local authoritative read');
    t.same(result.rows, [{
      operation_id: 'op-live-method-leader',
      workflow_step: 'LOCAL_LIVE_METHOD',
    }]);
  });

test('CDCIntegrationService - bounded empty local authoritative reads ' +
  'confirm through owner RPC',
async (t) => {
  let ownerRpcReadCount = 0;
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: {
      queryExecutor: {
        async executeOnPartition(partitionId, sql, params = [],
          _forRead, _preferLeader, _preferSameLatencyGroup, options = {}) {
          ownerRpcReadCount += 1;
          t.equal(
            partitionId,
            INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.LOGS],
            'owner confirmation should target the canonical logs partition',
          );
          t.match(sql, /SELECT log_id AS ack_id FROM logs/i,
            'owner confirmation should preserve the original SQL');
          t.same(params, ['log-a', 'log-b'],
            'owner confirmation should preserve query parameters');
          t.equal(options.timeoutMs, 321,
            'owner confirmation should preserve timeout hints');
          return {
            success: true,
            participantNodeId: 'node-sql-leader',
            rows: [
              {ack_id: 'log-a'},
              {ack_id: 'log-b'},
            ],
          };
        },
        getPartitionRoutingSnapshot() {
          return {
            canonicalLeaderNodeId: 'node-sql-leader',
            serviceRowCount: 2,
            routableServiceCount: 1,
            deniedByNodeId: {},
          };
        },
      },
      async executeQuery() {
        return {
          success: true,
          rows: [],
        };
      },
    },
    partitionServicesProvider: () => createLocalSystemTablePartitionServices(
      SYSTEM_TABLE_NAME.LOGS,
      {
        isLeader: false,
        async executeQuery(sql, params) {
          t.match(sql, /SELECT log_id AS ack_id FROM logs/i,
            'local probe should preserve the original SQL');
          t.same(params, ['log-a', 'log-b'],
            'local probe should preserve query parameters');
          return {
            success: true,
            rows: [],
          };
        },
      },
    ),
  });
  service.initialize();

  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.LOGS,
    'SELECT log_id AS ack_id FROM logs WHERE log_id IN (?, ?)',
    ['log-a', 'log-b'],
    buildAuthoritativeReadOptions({
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE
          .OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC,
      localReadConsistency: 'local_leader',
      replicaFallbackConsistency: 'any_replica',
    }, {
      queryOptions: {timeoutMs: 321},
    }),
  );

  t.equal(ownerRpcReadCount, 1,
    'empty local authoritative reads should be confirmed through owner RPC');
  t.equal(result.success, true,
    'owner confirmation should succeed');
  t.equal(result.source, 'owner_rpc_lane',
    'owner confirmation should win when local replicas are empty');
  t.equal(result.localReadHit, false,
    'owner-confirmed empty local reads must not report a local hit');
  t.same(result.rows, [
    {ack_id: 'log-a'},
    {ack_id: 'log-b'},
  ], 'owner confirmation should return the authoritative rows');
  t.equal(result.systemTableDiagnostics?.routedToNode, 'node-sql-leader',
    'owner confirmation should record the routed leader');
});

test('CDCIntegrationService - local authoritative reads prefer the ' +
  'local-only partition executor over routed executeQuery wrappers',
async (t) => {
  let routedWrapperReadCount = 0;
  let ownerRpcReadCount = 0;
  let sqlFallbackCount = 0;
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: {
      queryExecutor: {
        async executeOnPartition() {
          ownerRpcReadCount += 1;
          return {
            success: true,
            participantNodeId: 'node-sql-leader',
            rows: [],
          };
        },
        getPartitionRoutingSnapshot() {
          return {
            canonicalLeaderNodeId: 'node-sql-leader',
            serviceRowCount: 2,
            routableServiceCount: 1,
            deniedByNodeId: {},
          };
        },
      },
      async executeQuery() {
        sqlFallbackCount += 1;
        return {
          success: true,
          rows: [],
        };
      },
    },
    partitionServicesProvider: () => createLocalSystemTablePartitionServices(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      {
        async executeQuery() {
          routedWrapperReadCount += 1;
          return {
            success: true,
            rows: [{
              operation_id: LOCAL_AUTHORITATIVE_REPLICA_OPERATION_ID,
              workflow_step: 'ROUTED_WRAPPER',
            }],
          };
        },
        async executeLocalQuery(sql, params = []) {
          t.equal(
            sql,
            LOCAL_AUTHORITATIVE_REPLICA_OPERATION_SQL,
            'local authoritative reads should preserve the routed SQL text',
          );
          t.same(
            params,
            [LOCAL_AUTHORITATIVE_REPLICA_OPERATION_ID],
            'local authoritative reads should preserve bound parameters',
          );
          return {
            success: true,
            rows: [{...LOCAL_AUTHORITATIVE_REPLICA_OPERATION_ROW}],
          };
        },
      },
    ),
  });
  service.initialize();

  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    LOCAL_AUTHORITATIVE_REPLICA_OPERATION_SQL,
    [LOCAL_AUTHORITATIVE_REPLICA_OPERATION_ID],
    buildAuthoritativeReadOptions({
      localReadConsistency: 'local_leader',
    }),
  );

  t.equal(
    result.source,
    'local_partition_replica',
    'local-only partition executors should satisfy authoritative reads',
  );
  t.equal(
    routedWrapperReadCount,
    0,
    'authoritative local reads must not re-enter routed executeQuery wrappers',
  );
  t.equal(
    ownerRpcReadCount,
    0,
    'local authoritative reads should avoid owner RPC when local rows exist',
  );
  t.equal(
    sqlFallbackCount,
    0,
    'local authoritative reads should avoid SQL fallback when local rows exist',
  );
  t.same(
    result.rows,
    [LOCAL_AUTHORITATIVE_REPLICA_OPERATION_ROW],
    'local authoritative reads should return the local-only executor rows',
  );
});

test('CDCIntegrationService - authoritative reads can prefer owner RPC over ' +
  'available local replicas',
async (t) => {
  let localReadCount = 0;
  let ownerRpcReadCount = 0;
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: {
      queryExecutor: {
        async executeOnPartition() {
          ownerRpcReadCount += 1;
          return {
            success: true,
            participantNodeId: 'node-sql-leader',
            rows: [{
              operation_id: 'op-owner-rpc-preferred',
              workflow_step: 'OWNER_RPC',
            }],
          };
        },
        getPartitionRoutingSnapshot() {
          return {
            canonicalLeaderNodeId: 'node-sql-leader',
            serviceRowCount: 2,
            routableServiceCount: 2,
            deniedByNodeId: {},
          };
        },
      },
      async executeQuery() {
        return {
          success: true,
          rows: [],
        };
      },
    },
    partitionServicesProvider: () => createLocalSystemTablePartitionServices(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      {
        isLeader: true,
        async executeQuery() {
          localReadCount += 1;
          return {
            success: true,
            rows: [{
              operation_id: 'op-owner-rpc-preferred',
              workflow_step: 'LOCAL_REPLICA',
            }],
          };
        },
      },
    ),
  });
  service.initialize();

  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    ['op-owner-rpc-preferred'],
    buildAuthoritativeReadOptions({
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
      localReadConsistency: 'local_leader',
    }),
  );

  t.equal(localReadCount, 1,
    'owner-rpc preference should keep one local read available as a fallback');
  t.equal(ownerRpcReadCount, 1,
    'owner-rpc preference should query the owner lane even when a local replica is available');
  t.equal(result.source, 'owner_rpc_lane',
    'owner-rpc preference should select the owner lane result');
  t.equal(result.localReadHit, false,
    'owner-rpc preference should not report a local authoritative hit when owner RPC wins');
  t.same(result.rows, [{
    operation_id: 'op-owner-rpc-preferred',
    workflow_step: 'OWNER_RPC',
  }], 'owner-rpc preference should return the owner lane rows');
});

test('CDCIntegrationService - strict owner-RPC authoritative reads fail ' +
  'closed instead of falling back to local replicas',
async (t) => {
  let localReadCount = 0;
  let ownerRpcReadCount = 0;
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: {
      queryExecutor: {
        async executeOnPartition() {
          ownerRpcReadCount += 1;
          return {
            success: false,
            error: 'owner-rpc-read-failed',
            rows: [],
          };
        },
        getPartitionRoutingSnapshot() {
          return {
            canonicalLeaderNodeId: 'node-sql-leader',
            serviceRowCount: 2,
            routableServiceCount: 2,
            deniedByNodeId: {},
          };
        },
      },
      async executeQuery() {
        return {
          success: true,
          rows: [],
        };
      },
    },
    partitionServicesProvider: () => createLocalSystemTablePartitionServices(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      {
        isLeader: true,
        async executeQuery() {
          localReadCount += 1;
          return {
            success: true,
            rows: [{
              operation_id: 'op-owner-rpc-required',
              workflow_step: 'LOCAL_REPLICA',
            }],
          };
        },
      },
    ),
  });
  service.initialize();

  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    ['op-owner-rpc-required'],
    buildAuthoritativeReadOptions({
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      localReadConsistency: 'local_leader',
    }),
  );

  t.equal(localReadCount, 1,
    'strict owner-rpc mode may still probe local rows but must not return them');
  t.equal(ownerRpcReadCount, 1,
    'strict owner-rpc mode should still attempt owner-rpc reads');
  t.equal(result.success, false,
    'strict owner-rpc mode should fail when owner-rpc reads fail');
  t.equal(result.source, 'owner_rpc_lane',
    'strict owner-rpc mode should surface owner-rpc failure source');
  t.equal(result.localReadHit, false,
    'strict owner-rpc mode must not report local authoritative hits on failure');
  t.same(
    Array.isArray(result.rows) ? result.rows : [],
    [],
    'strict owner-rpc mode should not return local fallback rows',
  );
});

test('CDCIntegrationService - strict owner-RPC reads still use owner lane ' +
  'when SQL fallback is disabled',
async (t) => {
  let ownerRpcReadCount = 0;
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: {
      queryExecutor: {
        async executeOnPartition() {
          ownerRpcReadCount += 1;
          return {
            success: true,
            rows: [{
              operation_id: 'op-owner-rpc-only',
              workflow_step: 'OWNER_RPC',
            }],
          };
        },
        getPartitionRoutingSnapshot() {
          return {
            canonicalLeaderNodeId: 'node-sql-leader',
            serviceRowCount: 2,
            routableServiceCount: 2,
            deniedByNodeId: {},
          };
        },
      },
      async executeQuery() {
        return {
          success: true,
          rows: [],
        };
      },
    },
    partitionServicesProvider: () => new Map(),
  });
  service.initialize();

  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    ['op-owner-rpc-only'],
    buildAuthoritativeReadOptions({
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    }),
  );

  t.equal(ownerRpcReadCount, 1,
    'strict owner-rpc mode should still attempt the owner lane');
  t.equal(result.success, true,
    'strict owner-rpc mode should succeed through owner lane without SQL fallback');
  t.equal(result.source, 'owner_rpc_lane',
    'strict owner-rpc mode should preserve owner-lane source');
  t.same(result.rows, [{
    operation_id: 'op-owner-rpc-only',
    workflow_step: 'OWNER_RPC',
  }], 'strict owner-rpc mode should return owner-lane rows');
});

test('CDCIntegrationService - authoritative reads defer before owner RPC fallback when local query transport is not ready and fallback is disabled',
  async (t) => {
    let sqlReadCount = 0;
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: {
        async executeQuery() {
          sqlReadCount++;
          return {
            success: true,
            rows: [{operation_id: 'op-should-not-run'}],
          };
        },
      },
      partitionServicesProvider: () => new Map(),
    });
    service.initialize();
    service.setMessageRouter({
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: false,
          reason: 'query ingress owner not ready',
          retryAfterMs: 321,
        };
      },
    });

    const result = await service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'SELECT * FROM replica_operations WHERE operation_id = ?',
      ['op-deferred'],
      buildAuthoritativeReadOptions({
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      }),
    );

    t.equal(result.success, false,
      'authoritative read should fail closed while local query transport is unavailable');
    t.equal(result.errorCode, 'ROUTER_QUERY_TRANSPORT_NOT_READY',
      'authoritative read should preserve the canonical typed transport error');
    t.equal(result.deferRetry, true,
      'authoritative read should preserve typed defer semantics');
    t.equal(result.retryAfterMs, 321,
      'authoritative read should preserve retryAfterMs from the transport owner');
    t.equal(result.error, 'query ingress owner not ready',
      'authoritative read should preserve the owner reason');
    t.equal(result.source, 'query_transport_preflight',
      'authoritative read should report the preflight gate as the source');
    t.equal(sqlReadCount, 0,
      'authoritative read should not fan out through routed SQL when local query transport is not ready');
  });

test('CDCIntegrationService - authoritative merge prefers fresher heartbeat rows',
  async (t) => {
    const partitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES];
    const olderRow = {
      node_id: 'node-merge-freshness',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 16000,
    };
    const newerRow = {
      node_id: 'node-merge-freshness',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 5000,
      ready_lease_expires_at: 20000,
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: createMockSqlQueryEngine(),
      partitionServicesProvider: () => new Map([
        ['nodes-leader', {
          partitionId,
          replicaId: `${partitionId}-r1`,
          initialized: true,
          isLeader: true,
          async executeQuery() {
            return {
              success: true,
              rows: [{...olderRow}],
            };
          },
        }],
        ['nodes-follower', {
          partitionId,
          replicaId: `${partitionId}-r2`,
          initialized: true,
          isLeader: false,
          async executeQuery() {
            return {
              success: true,
              rows: [{...newerRow}],
            };
          },
        }],
      ]),
    });
    service.initialize();

    const result = await service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.NODES,
      'SELECT * FROM nodes WHERE node_id = ?',
      ['node-merge-freshness'],
      buildAuthoritativeReadOptions({
        localReadConsistency: 'any_replica',
      }),
    );

    t.equal(result.success, true, 'authoritative local read should succeed');
    t.equal(result.source, 'local_partition_replica',
      'authoritative read should stay on local replicas');
    t.equal(result.rows.length, 1, 'replica rows should merge by primary key');
    t.same(result.rows[0], newerRow,
      'merged authoritative row should retain freshest heartbeat evidence');
  });

test('CDCIntegrationService - authoritative read re-seeds bootstrap ' +
  'overlay when the owner RPC lane returns partition-not-found (uses ' +
  'installRecoveryRoutingOverlayEntry)', async (t) => {
  // Regression: after seed restart, follower cache is empty and bootstrap
  // overlay was deleted. executeAuthoritativeSystemTableRead must re-seed
  // the overlay via installRecoveryRoutingOverlayEntry using connected
  // nodes from the message router, then retry the query so the circular
  // dependency (empty cache → no partitions → Table not found → repair
  // fails → cache stays empty) is broken.
  const tableName = SYSTEM_TABLE_NAME.NODES;
  const expectedPartitionId = INITIAL_PARTITION_IDS[tableName];
  const queryAttempts = [];
  let installCalls = 0;
  let installedServiceRows = null;

  const mockSqlEngine = {
    installRecoveryRoutingOverlayEntry(partitionId, tbl, serviceRows) {
      installCalls++;
      installedServiceRows = serviceRows;
      t.equal(partitionId, expectedPartitionId,
        'overlay install should use the initial partition ID');
      t.equal(tbl, tableName,
        'overlay install should reference the correct table');
      return true;
    },
  };
  mockSqlEngine.queryExecutor = {
    async executeOnPartition(partitionId, sql, params = [], _forRead,
      _preferLeader, _preferSameLatencyGroup, options = {}) {
      queryAttempts.push({partitionId, sql, params, options});
      if (queryAttempts.length === 1) {
        return {
          success: false,
          error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
          errorCode: QUERY_ERROR_CODE.PARTITION_NOT_FOUND,
        };
      }
      return {
        success: true,
        participantNodeId: 'seed-node',
        rows: [{node_id: 'node-recovered', status: 'active'}],
        count: 1,
      };
    },
    getPartitionRoutingSnapshot() {
      return {
        canonicalLeaderNodeId: 'seed-node',
        serviceRowCount: 2,
        routableServiceCount: 2,
        deniedByNodeId: {},
      };
    },
  };

  const connectedNodeIds = ['seed-node', 'peer-node-2'];
  const mockMessageRouter = {
    getConnectedNodes() {
      return connectedNodeIds;
    },
  };

  const service = new CDCIntegrationService({
    nodeId: 'follower-node',
    sqlQueryEngine: mockSqlEngine,
    partitionServicesProvider: () => new Map(),
  });
  service.initialize();
  service.setMessageRouter(mockMessageRouter);

  const result = await service.executeAuthoritativeSystemTableRead(
    tableName,
    `SELECT * FROM ${tableName}`,
    [],
    {readAuthority: DEFAULT_AUTHORITATIVE_READ_AUTHORITY},
  );

  t.equal(result.success, true,
    'authoritative read should succeed after overlay re-seed');
  t.equal(result.rows.length, 1,
    'should return the rows from the retried query');
  t.equal(result.source, 'owner_rpc_lane',
    'source should report the owner RPC lane after retry');
  t.equal(queryAttempts.length, 2,
    'should attempt the query twice (fail + retry)');
  t.equal(
    queryAttempts[0].options.allowReadinessAuthoritativeRefresh,
    true,
    'owner RPC reads should keep routing-triggered readiness repair enabled',
  );
  t.equal(
    queryAttempts[1].options.allowReadinessAuthoritativeRefresh,
    true,
    'retry should keep readiness repair enabled',
  );
  t.equal(installCalls, 1,
    'should install recovery overlay exactly once');
  t.equal(installedServiceRows.length, connectedNodeIds.length,
    'should create one service row per connected node');
  t.equal(installedServiceRows[0].partition_id, expectedPartitionId,
    'service row should carry the correct partition_id');
  t.equal(installedServiceRows[0].node_id, connectedNodeIds[0],
    'service row node_id should match connected node');
  t.ok(installedServiceRows[0].address.includes(expectedPartitionId),
    'service row address should contain the partition ID');
});

test('CDCIntegrationService - authoritative read does not re-seed ' +
  'overlay for non-partition-not-found errors', async (t) => {
  // Ensure the overlay re-seed path only triggers for TABLE_NOT_FOUND,
  // not for other SQL failures.
  let installCalls = 0;
  const mockSqlEngine = {
    installRecoveryRoutingOverlayEntry() {
      installCalls++;
      return true;
    },
  };
  mockSqlEngine.queryExecutor = {
    async executeOnPartition() {
      return {
        success: false,
        error: 'Connection refused',
        errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
      };
    },
    getPartitionRoutingSnapshot() {
      return {
        canonicalLeaderNodeId: 'some-node',
        serviceRowCount: 1,
        routableServiceCount: 1,
        deniedByNodeId: {},
      };
    },
  };

  const mockMessageRouter = {
    getConnectedNodes() {
      return ['some-node'];
    },
  };

  const service = new CDCIntegrationService({
    nodeId: 'follower-node',
    sqlQueryEngine: mockSqlEngine,
    partitionServicesProvider: () => new Map(),
  });
  service.initialize();
  service.setMessageRouter(mockMessageRouter);

  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.NODES,
    'SELECT * FROM nodes',
    [],
    {readAuthority: DEFAULT_AUTHORITATIVE_READ_AUTHORITY},
  );

  t.equal(result.success, false,
    'should return failure for non-table-not-found errors');
  t.equal(installCalls, 0,
    'should not re-seed overlay for non-table-not-found errors');
});

test('CDCIntegrationService - updateSystemTableRow', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const whereClause = {node_id: 'node-1'};
  const data = {
    status: 'suspected',
    last_heartbeat: Date.now(),
  };

  const result = await service.updateSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    whereClause,
    data,
  );

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.UPDATE, 'should be UPDATE operation');
  t.equal(result.tableName, SYSTEM_TABLE_NAME.NODES, 'should have correct table name');
  t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('UPDATE'),
    'should be UPDATE query',
  );
  t.end();
});
