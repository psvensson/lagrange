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
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
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

function buildAuthoritativeReadOptions(authority = {}, operational = {}) {
  return {
    ...operational,
    readAuthority: buildControlPlaneReadAuthority({
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE
          .OWNER_LOCAL_ONLY,
      ...authority,
    }),
  };
}

function readerForLocalReplicaRows(t, tableName, rows) {
  const partitionId = INITIAL_PARTITION_IDS[tableName];
  const partitions = new Map();
  let reads = 0;
  for (let index = 0; index < rows.length; index += 1) {
    partitions.set(`local-replica-${index}`, {partitionId,
      replicaId: `${partitionId}-r${index}`, initialized: true, isLeader: true,
      async executeLocalQuery() {reads += 1; return {success: true, rows: [rows[index]]};},
    });
  }
  const engine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({nodeId: 'test-node', sqlQueryEngine: engine,
    partitionServicesProvider: () => partitions});
  service.initialize();
  t.teardown(() => service.markShuttingDown());
  return {read: () => service.executeAuthoritativeSystemTableRead(tableName,
    `SELECT * FROM ${tableName}`, [], buildAuthoritativeReadOptions({
      localReadConsistency: 'any_replica',
    })), reads: () => reads, sqlCalls: engine.executedQueries};
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
      {},
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

test('CDCIntegrationService - authoritative cache confirmation uses the requested owner RPC lane',
  async (t) => {
    const operationId = 'op-local-repair';
    const authoritativeRow = {
      operation_id: operationId,
      status: 'creating',
      workflow_step: 'CREATING',
      updated_at: 500,
    };
    // The real cache: the writable owner and its read view.
    const cache = new SystemTableCache();
    let localReads = 0;
    const ownerReads = [];
    const sqlQueryEngine = {
      queryExecutor: {async executeOnPartition(partitionId, sql, params) {
        ownerReads.push({partitionId, sql, params});
        t.equal(params[0], operationId, 'owner read preserves bound parameters');
        return {success: true, rows: [{...authoritativeRow}]};
      }},
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
      systemTableCache: createReadOnlyCache(cache),
      cacheMutationTarget: cache,
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {
          async executeLocalQuery(sql, params) {
            localReads += 1;
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
    );

    t.equal(repaired?.visibilityState, 'visible',
      'should confirm the authoritative row without routed SQL');
    t.equal(repaired?.authoritativeVisibilityConfirmed, true,
      'owner RPC confirmation should preserve the confirmation state');
    t.match(cache.get(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId), authoritativeRow,
      'authoritative confirmation should hydrate the writable cache target');
    t.equal(
      sqlQueryEngine.executedQueries.length,
      0,
      'owner confirmation does not call ordinary routed SQL',
    );
    t.equal(ownerReads.length, 1, 'one authoritative owner read confirms the row');
    t.equal(localReads, 0, 'healthy local rows are not probed by an RPC-required repair');
    t.equal(divergenceEvents.length, 1,
      'owner RPC confirmation should emit a cache-lag divergence');
  });

test('CDCIntegrationService - explicit owner-RPC reads preserve their lane with a local follower present',
  async (t) => {
    const ownerRpcReads = [];
    let localReads = 0;
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
                operation_id: 'op-owner-read',
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
          async executeLocalQuery() {
            localReads += 1;
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
      ['op-owner-read'],
      buildAuthoritativeReadOptions({
        authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        localReadConsistency: 'local_leader',
      }, {
        queryOptions: {timeoutMs: 1234},
      }),
    );

    t.equal(result.source, 'owner_rpc_lane', 'the explicitly selected owner lane supplies the answer');
    t.equal(ownerRpcReads.length, 1, 'should use the owner RPC lane once');
    t.equal(localReads, 0, 'the local follower is not probed');
    t.equal(ownerRpcReads[0]?.options?.timeoutMs, 1234, 'should preserve query options');
    t.equal(
      ownerRpcReads[0]?.options?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'owner RPC read should default to recovery eligibility when callers omit a readiness dimension',
    );
    t.equal(result.localReadHit, false, 'owner RPC read should not mark a local read hit');
    t.equal(result.systemTableDiagnostics?.routedToNode, 'node-sql-leader',
      'owner RPC read should record the routed leader hint');
    t.equal(result.systemTableDiagnostics?.queryTimeoutMs, 1234,
      'owner RPC read should record the query timeout');
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

// The historical fixture weakened local_leader to any_replica on failure.
// One explicit local consistency now refuses that follower until it leads.
test('CDCIntegrationService - local leader reads refuse follower substitution and heal locally',
  async (t) => {
    let localReads = 0;
    let ownerReads = 0;
    let sqlReads = 0;
    const operationId = 'op-local-leader-only';
    const localServices = createLocalSystemTablePartitionServices(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      {isLeader: false, async executeLocalQuery(sql, params) {
        localReads += 1;
        t.same(params, [operationId], 'same local owner preserves query parameters');
        return {success: true, rows: [{operation_id: operationId, workflow_step: 'PENDING'}]};
      }});
    const service = new CDCIntegrationService({nodeId: 'test-node',
      partitionServicesProvider: () => localServices,
      sqlQueryEngine: {
        queryExecutor: {async executeOnPartition() {
          ownerReads += 1;
          return {success: true, rows: [{operation_id: operationId}]};
        }},
        async executeQuery() { sqlReads += 1; return {success: true, rows: []}; },
      }});
    service.initialize();
    const options = buildAuthoritativeReadOptions({localReadConsistency: 'local_leader'});
    const failed = await service.executeAuthoritativeSystemTableRead(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      LOCAL_AUTHORITATIVE_REPLICA_OPERATION_SQL, [operationId], options);
    t.equal(failed.success, false, 'a follower cannot satisfy local leader consistency');
    t.same(failed.rows, []);
    t.equal(localReads, 0, 'the refused follower is never read');
    t.equal(ownerReads, 0);
    t.equal(sqlReads, 0);
    for (const partition of localServices.values()) partition.isLeader = true;
    const recovered = await service.executeAuthoritativeSystemTableRead(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      LOCAL_AUTHORITATIVE_REPLICA_OPERATION_SQL, [operationId], options);
    t.equal(recovered.success, true, 'the same local owner can answer after becoming leader');
    t.equal(recovered.source, 'local_partition_replica');
    t.equal(recovered.localReadHit, true);
    t.same(recovered.rows, [{operation_id: operationId, workflow_step: 'PENDING'}]);
    t.equal(localReads, 1);
    t.equal(ownerReads, 0);
    t.equal(sqlReads, 0);
    t.equal(recovered.systemTableDiagnostics?.leaderNodeId, null,
      'the local answer does not reconstruct a retired routing-snapshot leader hint');
    service.markShuttingDown();
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

test('CDCIntegrationService - projected owner-RPC rows and explicit empty local reads keep their source',
async (t) => {
  let ownerRpcReadCount = 0;
  let localReadCount = 0;
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
        async executeLocalQuery(sql, params) {
          localReadCount += 1;
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
          .OWNER_RPC_REQUIRED,
      localReadConsistency: 'local_leader',
    }, {
      queryOptions: {timeoutMs: 321},
    }),
  );

  t.equal(ownerRpcReadCount, 1,
    'the projected read uses the requested owner directly');
  t.equal(localReadCount, 0, 'an RPC-required read does not probe the empty local replica');
  t.equal(result.success, true,
    'owner confirmation should succeed');
  t.equal(result.source, 'owner_rpc_lane',
    'the RPC source is selected before observing local rows');
  t.equal(result.localReadHit, false,
    'owner-confirmed empty local reads must not report a local hit');
  t.same(result.rows, [
    {ack_id: 'log-a'},
    {ack_id: 'log-b'},
  ], 'owner confirmation should return the authoritative rows');
  t.equal(result.systemTableDiagnostics?.routedToNode, 'node-sql-leader',
    'owner confirmation should record the routed leader');
  const local = await service.executeAuthoritativeSystemTableRead(SYSTEM_TABLE_NAME.LOGS,
    'SELECT log_id AS ack_id FROM logs WHERE log_id IN (?, ?)', ['log-a', 'log-b'],
    buildAuthoritativeReadOptions({localReadConsistency: 'any_replica'}));
  t.equal(local.success, true, 'the explicitly requested local empty set is a valid answer');
  t.same(local.rows, []);
  t.equal(local.source, 'local_partition_replica');
  t.equal(localReadCount, 1);
  t.equal(ownerRpcReadCount, 1, 'an empty local answer never triggers another owner lane');
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

test('CDCIntegrationService - authoritative reads select required owner RPC with ' +
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
              operation_id: 'op-owner-rpc-selected',
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
        async executeLocalQuery() {
          localReadCount += 1;
          return {
            success: true,
            rows: [{
              operation_id: 'op-owner-rpc-selected',
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
    ['op-owner-rpc-selected'],
    buildAuthoritativeReadOptions({
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      localReadConsistency: 'local_leader',
    }),
  );

  t.equal(localReadCount, 0,
    'the owner-RPC contract does not probe the available local replica');
  t.equal(ownerRpcReadCount, 1,
    'owner-rpc selection should query the owner lane even when a local replica is available');
  t.equal(result.source, 'owner_rpc_lane',
    'owner-rpc selection should select the owner lane result');
  t.equal(result.localReadHit, false,
    'owner-rpc selection should not report a local authoritative hit when owner RPC wins');
  t.same(result.rows, [{
    operation_id: 'op-owner-rpc-selected',
    workflow_step: 'OWNER_RPC',
  }], 'owner-rpc selection should return the owner lane rows');
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
        async executeLocalQuery() {
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

  t.equal(localReadCount, 0,
    'strict owner-rpc mode never probes local rows when its owner fails');
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

test('CDCIntegrationService - strict owner-RPC reads succeed on their declared owner lane',
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

test('CDCIntegrationService - owner-RPC reads retain the transport owner refusal and retry hint',
  async (t) => {
    let sqlReads = 0;
    let ownerReads = 0;
    let healed = false;
    const service = new CDCIntegrationService({nodeId: 'test-node',
      sqlQueryEngine: {
        queryExecutor: {async executeOnPartition() {
          ownerReads += 1;
          return healed ? {success: true, rows: [{operation_id: 'op-deferred'}]} :
            {success: false, rows: [], errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
              error: 'query ingress owner not ready', deferRetry: true, retryAfterMs: 321};
        }},
        async executeQuery() {
          sqlReads += 1;
          return {success: true, rows: [{operation_id: 'op-should-not-run'}]};
        },
      }, partitionServicesProvider: () => new Map()});
    service.initialize();
    service.setMessageRouter({getQueryDataPlaneTransportReadiness() {
      return {ready: healed, reason: 'query ingress owner not ready', retryAfterMs: 321};
    }});
    const options = buildAuthoritativeReadOptions({
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    });
    const result = await service.executeAuthoritativeSystemTableRead(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      LOCAL_AUTHORITATIVE_REPLICA_OPERATION_SQL, ['op-deferred'], options);
    t.equal(result.success, false);
    t.equal(result.errorCode, 'ROUTER_QUERY_TRANSPORT_NOT_READY');
    t.equal(result.deferRetry, true);
    t.equal(result.retryAfterMs, 321);
    t.equal(result.error, 'query ingress owner not ready');
    t.equal(result.source, 'owner_rpc_lane', 'the chosen owner retains the typed failure');
    t.equal(ownerReads, 1);
    t.equal(sqlReads, 0, 'transport unavailability does not select ordinary SQL');
    healed = true;
    const recovered = await service.executeAuthoritativeSystemTableRead(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      LOCAL_AUTHORITATIVE_REPLICA_OPERATION_SQL, ['op-deferred'], options);
    t.equal(recovered.success, true);
    t.equal(recovered.source, 'owner_rpc_lane');
    t.same(recovered.rows, [{operation_id: 'op-deferred'}]);
    t.equal(ownerReads, 2);
    t.equal(sqlReads, 0);
    service.markShuttingDown();
  });

test('CDCIntegrationService - heartbeat disagreement refuses until the local replica images agree',
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
    let agree = false;
    let localReads = 0;
    const engine = createMockSqlQueryEngine();
    const partitions = new Map([
        ['nodes-leader', {
          partitionId,
          replicaId: `${partitionId}-r1`,
          initialized: true,
          isLeader: true,
          async executeLocalQuery() {
            localReads += 1;
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
          async executeLocalQuery() {
            localReads += 1;
            return {
              success: true,
              rows: [{...(agree ? olderRow : newerRow)}],
            };
          },
        }],
    ]);
    const service = new CDCIntegrationService({nodeId: 'test-node', sqlQueryEngine: engine,
      partitionServicesProvider: () => partitions});
    service.initialize();
    t.teardown(() => service.markShuttingDown());

    const read = () => service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.NODES,
      'SELECT * FROM nodes WHERE node_id = ?',
      ['node-merge-freshness'],
      buildAuthoritativeReadOptions({
        localReadConsistency: 'any_replica',
      }),
    );

    const refused = await read();
    t.equal(localReads, 2, 'both declared replicas actually answer');
    t.equal(refused.success, false, 'heartbeat and lease values do not order competing images');
    t.equal(refused.error, 'authoritative_row_source_unavailable');
    t.same(refused.rows, []);
    t.equal(refused.rowSetComplete, false);
    agree = true;
    const healed = await read();
    t.equal(healed.success, true, 'the same original owners remain useful after agreement');
    t.equal(healed.source, 'local_partition_replica');
    t.same(healed.rows, [olderRow], 'the agreeing original image is retained without timestamp election');
    t.equal(localReads, 4);
    t.same(engine.executedQueries, [], 'refusal never selects another execution lane');
  });

test('CDCIntegrationService - local read refuses row serialization hooks before replica arbitration',
  async (t) => {
    let serializations = 0;
    const rows = Array.from({length: 128}, (_unused, index) => ({
      node_id: 'node-merge-rank',
      last_heartbeat: 5_000,
      detail: index === 127 ? 'complete' : 'partial',
      toJSON() {
        serializations += 1;
        return {
          node_id: this.node_id,
          last_heartbeat: this.last_heartbeat,
          detail: this.detail,
        };
      },
    }));
    const reader = readerForLocalReplicaRows(t, SYSTEM_TABLE_NAME.NODES, rows);
    const result = await reader.read();
    t.equal(reader.reads(), 1, 'the first actual local answer engages row admission');
    t.equal(serializations, 0, 'caller hooks cannot rank or transform authoritative data');
    t.equal(result.success, false);
    t.equal(result.error, 'authoritative_row_source_unavailable');
    t.same(result.rows, []);
    t.equal(result.rowSetComplete, false);
    t.same(reader.sqlCalls, []);
  });

test('CDCIntegrationService - identical flat replica images retain owned data without global JSON hooks',
  async (t) => {
    const sourceRow = {
      operation_id: 'operation-flat-copy',
      updated_at: 5_000,
      status: 'ACTIVE',
      steps_history: 'x'.repeat(16_384),
      error: null,
    };
    const rows = Array.from({length: 128}, () => ({...sourceRow}));
    const reader = readerForLocalReplicaRows(t, SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, rows);

    const originalStringify = JSON.stringify;
    let serializations = 0;
    JSON.stringify = (...args) => {
      serializations += 1;
      return originalStringify(...args);
    };
    let result;
    try {
      result = await reader.read();
    } finally {
      JSON.stringify = originalStringify;
    }

    t.equal(serializations, 0,
      'captured data never consults a mutable global JSON serializer');
    t.equal(reader.reads(), rows.length, 'all declared replica images are actually read');
    t.equal(result.success, true);
    t.same(result.rows, [sourceRow]);
    t.ok(Object.isFrozen(result.rows));
    t.ok(Object.isFrozen(result.rows[0]));
    rows[0].steps_history = 'caller mutation';
    t.same(result.rows, [sourceRow], 'the coalesced image does not borrow its first producer row');
    t.same(reader.sqlCalls, []);
  });

// The historical read-side overlay repair fabricated service authority from
// connected nodes. Routing recovery now belongs to its existing owner; the read
// retains the failure and a later call can succeed after that owner heals.
test('CDCIntegrationService - partition-not-found does not fabricate an overlay or retry the read',
  async (t) => {
    const tableName = SYSTEM_TABLE_NAME.NODES;
    const expectedPartitionId = INITIAL_PARTITION_IDS[tableName];
    const queryAttempts = [];
    let overlayInstalls = 0;
    let connectedNodeReads = 0;
    let healed = false;
    const service = new CDCIntegrationService({nodeId: 'follower-node',
      partitionServicesProvider: () => new Map(),
      sqlQueryEngine: {
        installRecoveryRoutingOverlayEntry() { overlayInstalls += 1; return true; },
        queryExecutor: {async executeOnPartition(partitionId, sql, params, _forRead,
          _preferLeader, _preferSameLatencyGroup, options) {
          queryAttempts.push({partitionId, sql, params, options});
          return healed ? {success: true, participantNodeId: 'seed-node',
            rows: [{node_id: 'node-recovered', status: 'active'}], count: 1} :
            {success: false, error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
              errorCode: QUERY_ERROR_CODE.PARTITION_NOT_FOUND, rows: []};
        }},
      }});
    service.initialize();
    service.setMessageRouter({getConnectedNodes() {
      connectedNodeReads += 1;
      return ['seed-node', 'peer-node-2'];
    }});
    const options = buildAuthoritativeReadOptions({
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    });
    const failed = await service.executeAuthoritativeSystemTableRead(tableName,
      `SELECT * FROM ${tableName}`, [], options);
    t.equal(failed.success, false);
    t.equal(failed.errorCode, QUERY_ERROR_CODE.PARTITION_NOT_FOUND);
    t.equal(failed.source, 'owner_rpc_lane');
    t.equal(queryAttempts.length, 1, 'one unavailable owner is not retried inside the read');
    t.equal(overlayInstalls, 0, 'the reader cannot fabricate a routing overlay');
    t.equal(connectedNodeReads, 0, 'connected-node presence is not service authority');
    healed = true;
    const recovered = await service.executeAuthoritativeSystemTableRead(tableName,
      `SELECT * FROM ${tableName}`, [], options);
    t.equal(recovered.success, true, 'a later same-owner read succeeds after real availability changes');
    t.same(recovered.rows, [{node_id: 'node-recovered', status: 'active'}]);
    t.equal(recovered.source, 'owner_rpc_lane');
    t.equal(queryAttempts.length, 2);
    for (const read of queryAttempts) {
      t.equal(read.partitionId, expectedPartitionId);
      t.equal(read.options.allowReadinessAuthoritativeRefresh, true,
        'the routing owner retains its existing readiness repair authority');
    }
    t.equal(overlayInstalls, 0);
    t.equal(connectedNodeReads, 0);
    service.markShuttingDown();
  });

test('CDCIntegrationService - authoritative read does not re-seed ' +
  'overlay for non-partition-not-found errors', async (t) => {
  // Other owner failures also cannot engage a read-side overlay writer.
  let installCalls = 0;
  let ownerReads = 0;
  const mockSqlEngine = {
    installRecoveryRoutingOverlayEntry() {
      installCalls++;
      return true;
    },
  };
  mockSqlEngine.queryExecutor = {
    async executeOnPartition() {
      ownerReads += 1;
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
    buildAuthoritativeReadOptions({
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    }),
  );

  t.equal(result.success, false,
    'should return failure for non-table-not-found errors');
  t.equal(ownerReads, 1, 'the actual owner refusal was consumed');
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
