import {registerRebalanceCoordinatorTimeoutCacheVisibilityTailMoreTests} from './rebalance-coordinator-timeout-cache-visibility-tail-more-test-cases.js';

const REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_TIMEOUT_MS = 15_000;
const NON_PRIORITY_DEFERRED_PARTITION_ID = 'customer_orders-p1';
const PRIORITY_RECOVERY_BLOCKED_PARTITION_ID = 'replica_operations-p1';
const TEST_PRIORITY_RECOVERY_SPREAD_GAP = 1;
const TEST_PRESSURE_DEGRADED_ERROR =
  'Distributed operation failed due to participant failures';
const TEST_PRESSURE_DEGRADED_ERROR_CODE =
  'CONTROL_PLANE_PRESSURE_DEGRADED';
const TEST_PRESSURE_DEGRADED_RETRY_AFTER_MS = 250;

export function registerRebalanceCoordinatorTimeoutCacheVisibilityTailTests({
  test,
  RebalanceCoordinator,
  CONTROL_PLANE_TIMEOUT_DEFAULT,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  QUERY_ERROR_MSG,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  ReplicaStatus,
  PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
  EMERGENCY_PRIORITY_PARTITION_ID,
  buildTransactionCoordinator,
  createCoordinator,
}) {
  test('queryIncompleteOperations uses the cache-preferred visibility read ' +
  'contract for replica_operations when the cache is empty',
  async (t) => {
    const authoritativeReadCalls = [];
    const sqlQueryCalls = [];
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
        async waitForCacheUpdate() {},
        async executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options = {},
        ) {
          authoritativeReadCalls.push({
            tableName,
            sql,
            params: [...params],
            options,
          });
          return {
            success: true,
            source: 'local_partition_replica',
            rows: [{
              operation_id: 'op-local-1',
              type: 'ADD',
              partition_id: 'partition-1',
              replica_id: 'partition-1-r2',
              source_node_id: 'node-1',
              target_node_id: 'node-2',
              status: 'pending',
              workflow_step: 'PENDING',
              created_at: 100,
              updated_at: 200,
              completed_at: null,
              error_message: null,
              steps_history: '[]',
            }],
          };
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery(sql, params, options = {}) {
          sqlQueryCalls.push({sql, params, options});
          return {
            success: true,
            rows: [],
          };
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.equal(operations.length, 1, 'owner-local authoritative read should surface the local in-flight operation');
      t.equal(
        operations[0]?.operationId,
        'op-local-1',
        'coordinator should translate the authoritative owner-local row',
      );
      t.equal(sqlQueryCalls.length, 0, 'should not reconstruct owner visibility reads through the SQL query engine');
      t.equal(authoritativeReadCalls.length, 1, 'should use the authoritative visibility read path for owner rows');
      t.equal(
        authoritativeReadCalls[0]?.options?.queryOptions?.timeoutMs,
        REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_TIMEOUT_MS,
        'should preserve the critical recovery timeout on authoritative visibility reads',
      );
      t.equal(
        authoritativeReadCalls[0]?.options?.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
        'replica_operations visibility reads should prefer owner RPC with SQL fallback',
      );
      t.equal(
        authoritativeReadCalls[0]?.options?.allowSqlFallback,
        true,
        'replica_operations visibility reads should allow bounded SQL fallback',
      );
      t.equal(
        authoritativeReadCalls[0]?.options?.allowOwnerRpcFallback,
        true,
        'replica_operations visibility reads should allow owner-RPC fallback',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('storage reservation cleanup reads opt into authoritative SQL fallback',
    async (t) => {
      const gatewayCalls = [];
      const coordinator = createCoordinator({
        nodeId: 'node-1',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        controlPlaneSystemTableGateway: {
          async readRows(tableName, sql, params, options = {}) {
            gatewayCalls.push({
              tableName,
              sql: String(sql),
              params: [...(Array.isArray(params) ? params : [])],
              options,
            });
            if (String(sql).includes('operation_id = ?')) {
              return {
                success: true,
                rows: [{
                  reservation_id: 'res-op-1',
                  operation_id: 'op-1',
                }],
              };
            }
            if (String(sql).includes('expires_at <= ?')) {
              return {
                success: true,
                rows: [{
                  reservation_id: 'res-expired-1',
                  operation_id: 'op-expired-1',
                }],
              };
            }
            return {
              success: true,
              rows: [{
                reservation_id: 'res-orphan-1',
                operation_id: 'op-orphan-1',
              }],
            };
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            throw new Error('raw SQL path should not be used');
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      coordinator.transitionActiveReservationById = async () => ({
        success: true,
        changed: true,
      });
      coordinator.getReservationOperationVisibilityObservation = async () =>
        Object.freeze({
          operation: null,
          deferredOutcome: null,
        });
      try {
        await coordinator.releaseReservationForOperation({
          type: 'ADD',
          operationId: 'op-1',
        });
        await coordinator.reconcileReservations();
        t.equal(
          gatewayCalls.length,
          3,
          'reservation cleanup should query active-by-operation, expired, and active sets',
        );
        for (const call of gatewayCalls) {
          t.equal(
            call.tableName,
            'storage_reservations',
            'reservation cleanup should stay on the storage_reservations system table',
          );
          t.equal(
            call.options.allowSqlFallback,
            true,
            `reservation cleanup should opt into routed authoritative SQL fallback for ${call.sql}`,
          );
          t.equal(
            call.options.timeoutMs,
            CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
            `reservation cleanup should preserve control-plane timeout options on ${call.sql}`,
          );
        }
      } finally {
        await coordinator.shutdown();
      }
    });

  test('queryIncompleteOperations fails closed when local replica_operations ' +
  'owner rows are unavailable',
  async (t) => {
    const authoritativeReadCalls = [];
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
        filter() {
          return [];
        },
      },
      cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
        async waitForCacheUpdate() {},
        async executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options = {},
        ) {
          authoritativeReadCalls.push({
            tableName,
            sql,
            params: [...params],
            options,
          });
          return {
            success: false,
            error: 'authoritative_row_source_unavailable',
            rows: [],
          };
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          throw new Error(
            'gateway should keep routed owner reads inside the authoritative owner path',
          );
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.equal(
        operations.length,
        0,
        'cache-empty owner scans should fail closed instead of reconstructing routed replica_operations rows',
      );
      t.equal(
        authoritativeReadCalls.length,
        1,
        'should execute one authoritative read through the canonical gateway',
      );
      t.equal(
        authoritativeReadCalls[0]?.options?.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
        'canonical replica_operations visibility reads should prefer owner RPC with SQL fallback',
      );
      t.equal(
        authoritativeReadCalls[0]?.options?.allowSqlFallback,
        true,
        'canonical replica_operations visibility reads should allow bounded SQL fallback',
      );
      t.equal(
        authoritativeReadCalls[0]?.options?.allowOwnerRpcFallback,
        true,
        'canonical replica_operations visibility reads should allow owner-rpc fallback',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('queryIncompleteOperations prefers cache observation boundary before routed SQL',
    async (t) => {
      let sqlQueryCalls = 0;
      const cacheRows = [
        {
          operation_id: 'op-cache-local-1',
          type: 'ADD',
          partition_id: 'partition-1',
          replica_id: 'partition-1-r2',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          status: 'creating',
          workflow_step: 'CREATING',
          created_at: 100,
          updated_at: 200,
          completed_at: null,
          error_message: null,
          steps_history: '[]',
          entity_type: 'partition',
          entity_id: 'partition-1',
        },
        {
          operation_id: 'op-cache-remote-1',
          type: 'ADD',
          partition_id: 'partition-2',
          replica_id: 'partition-2-r2',
          source_node_id: 'node-other',
          target_node_id: 'node-3',
          status: 'creating',
          workflow_step: 'CREATING',
          created_at: 50,
          updated_at: 60,
          completed_at: null,
          error_message: null,
          steps_history: '[]',
          entity_type: 'partition',
          entity_id: 'partition-2',
        },
      ];
      const coordinator = createCoordinator({
        nodeId: 'node-1',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter(tableName, predicate) {
            if (tableName !== 'replica_operations') {
              return [];
            }
            return cacheRows.filter(predicate);
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            sqlQueryCalls += 1;
            throw new Error('routed SQL should not run');
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const operations = await coordinator.queryIncompleteOperations();
        t.same(
          operations.map((operation) => operation.operationId),
          ['op-cache-local-1'],
          'cache observation boundary should answer incomplete owner scans',
        );
        t.equal(sqlQueryCalls, 0, 'cache-visible incomplete operations should bypass routed SQL');
      } finally {
        await coordinator.shutdown();
      }
    });

  test(
    'handleRecovery preserves cache-visible local-owner operations when ' +
    'authoritative replica_operations owner rows are unavailable',
    async (t) => {
      let authoritativeReadCalls = 0;
      const recoveryRow = {
        operation_id: 'op-recovery-cache-visible',
        type: 'ADD',
        partition_id: 'partition-recovery-1',
        replica_id: 'partition-recovery-1-r2',
        source_node_id: 'node-recovery-cache',
        target_node_id: 'node-2',
        status: ReplicaStatus.PENDING,
        workflow_step: 'PENDING',
        created_at: 100,
        updated_at: 100,
        completed_at: null,
        error_message: null,
        steps_history: '[]',
        entity_type: 'partition',
        entity_id: 'partition-recovery-1',
      };
      const coordinator = createCoordinator({
        nodeId: 'node-recovery-cache',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          get() {
            return null;
          },
          filter(tableName) {
            if (tableName !== 'replica_operations') {
              return [];
            }
            return [{...recoveryRow}];
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
          async executeAuthoritativeSystemTableRead(tableName, sql) {
            if (tableName === 'replica_operations' &&
              String(sql).includes('SELECT * FROM replica_operations')) {
              authoritativeReadCalls += 1;
            }
            return {
              success: false,
              error: 'authoritative_row_source_unavailable',
              rows: [],
            };
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql, params = []) {
            if (String(sql).startsWith('UPDATE replica_operations SET')) {
              recoveryRow.status = params[0];
              recoveryRow.workflow_step = params[1];
              recoveryRow.updated_at = params[2];
              recoveryRow.completed_at = params[3];
              recoveryRow.error_message = params[4];
              recoveryRow.steps_history = params[5];
              recoveryRow.replica_id = params[6];
              return {
                success: true,
                affectedRows: 1,
              };
            }
            return {
              success: true,
              rows: [],
              affectedRows: 0,
            };
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const result = await coordinator.handleRecovery();
        t.equal(
          result.totalIncomplete,
          1,
          'recovery should preserve the cache-visible local-owner operation set instead of collapsing to empty',
        );
        t.equal(
          result.markedFailed,
          1,
          'recovery should still reconcile the cache-visible pending operation',
        );
        t.ok(
          authoritativeReadCalls >= 1,
          'recovery should still attempt one authoritative owner read before falling back to cached visibility',
        );
        t.equal(
          recoveryRow.status,
          ReplicaStatus.FAILED,
          'recovery should fail the cached pending operation through the normal owner workflow',
        );
        t.equal(
          recoveryRow.workflow_step,
          'FAILED',
          'recovery should advance the cached pending operation to the failed terminal step',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'queryIncompleteOperations attempts one authoritative owner read before degrading to cached visibility',
    async (t) => {
      let sqlQueryCalls = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-2',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter(tableName) {
            if (tableName !== 'replica_operations') {
              return [];
            }
            return [];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  spreadGap: 1,
                }],
              },
            };
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            sqlQueryCalls += 1;
            return {
              success: false,
              error: 'Distributed operation failed due to participant failures',
              errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
              retryAfterMs: 250,
            };
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const operations = await coordinator.queryIncompleteOperations();
        const outcome =
        coordinator.repository.getLastIncompleteOperationReadOutcome();
        t.same(
          operations,
          [],
          'empty cache should remain the bounded fallback after one deferred owner read',
        );
        t.equal(
          sqlQueryCalls,
          1,
          'router degrade should still attempt one authoritative replica_operations read',
        );
        t.equal(
          outcome?.completionState,
          PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
          'router degrade should preserve the canonical deferred owner-read outcome',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'queryIncompleteOperations falls back to routed SQL when cache is empty and router pressure is clear',
    async (t) => {
      let sqlQueryCalls = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-1',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter(tableName) {
            if (tableName !== 'replica_operations') {
              return [];
            }
            return [];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            sqlQueryCalls += 1;
            return {success: true, rows: []};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const operations = await coordinator.queryIncompleteOperations();
        t.same(
          operations,
          [],
          'empty cache with clear pressure should still return no in-flight operations',
        );
        t.equal(
          sqlQueryCalls,
          1,
          'empty cache with clear pressure should fall back to one routed replica_operations scan',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'canStartAddOperation preserves deferred owner-read outcome while router degrades background work',
    async (t) => {
      let replicaOperationReads = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-router-degrade-add',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter() {
            return [];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  spreadGap: 1,
                }],
              },
            };
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (String(sql).includes('FROM replica_operations')) {
              replicaOperationReads += 1;
              return {
                success: false,
                error: 'Distributed operation failed due to participant failures',
                errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
                retryAfterMs: 250,
              };
            }
            return {success: true, rows: [], affectedRows: 0};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const canStart = await coordinator.canStartAddOperation({
          bypassEmptyQueryDelay: true,
        });
        const outcome =
        coordinator.repository.getLastIncompleteOperationReadOutcome();

        t.equal(
          canStart,
          false,
          'degraded router pressure must block add admission through the deferred owner-read contract',
        );
        t.equal(
          replicaOperationReads,
          1,
          'add admission should still attempt one authoritative owner read under degrade pressure',
        );
        t.equal(
          coordinator.workflowOwner.lastEmptyIncompleteOperationQueryAtMs,
          0,
          'degraded owner reads must not start the empty-operation backoff window',
        );
        t.equal(
          outcome?.completionState,
          PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
          'degraded add admission should preserve the canonical deferred outcome',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'canStartAddOperation blocks non-priority deferred owner reads under ' +
    'contained priority pressure',
    async (t) => {
      let replicaOperationReads = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-router-degrade-non-priority-add',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter() {
            return [];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: PRIORITY_RECOVERY_BLOCKED_PARTITION_ID,
                  spreadGap: TEST_PRIORITY_RECOVERY_SPREAD_GAP,
                }],
              },
            };
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (String(sql).includes('FROM replica_operations')) {
              replicaOperationReads += 1;
              return {
                success: false,
                error: TEST_PRESSURE_DEGRADED_ERROR,
                errorCode: TEST_PRESSURE_DEGRADED_ERROR_CODE,
                retryAfterMs: TEST_PRESSURE_DEGRADED_RETRY_AFTER_MS,
              };
            }
            return {success: true, rows: [], affectedRows: 0};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const canStart = await coordinator.canStartAddOperation({
          bypassEmptyQueryDelay: true,
          partitionId: NON_PRIORITY_DEFERRED_PARTITION_ID,
        });
        const outcome =
        coordinator.repository.getLastIncompleteOperationReadOutcome();

        t.equal(
          canStart,
          false,
          'non-priority add admission must not reuse the priority recovery pressure lane',
        );
        t.equal(
          replicaOperationReads,
          1,
          'non-priority add admission should still attempt one owner read before blocking',
        );
        t.equal(
          outcome?.completionState,
          PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
          'non-priority add admission should preserve deferred owner-read diagnostics',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'canStartAddOperation reuses empty cache observation boundary before routed SQL',
    async (t) => {
      let sqlQueryCalls = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-1',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter(tableName) {
            if (tableName !== 'replica_operations') {
              return [];
            }
            return [];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            sqlQueryCalls += 1;
            return {success: true, rows: []};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const canStart = await coordinator.canStartAddOperation();
        t.equal(
          canStart,
          false,
          'empty cache should defer add scheduling until authoritative confirmation is allowed',
        );
        t.equal(
          sqlQueryCalls,
          0,
          'add scheduling admission should not route replica_operations SQL on empty cache',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'canStartAddOperation can re-check authoritative in-flight count when ' +
    'priority recovery budget is saturated in cache',
    async (t) => {
      let sqlQueryCalls = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-2',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter(tableName) {
            if (tableName !== 'replica_operations') {
              return [];
            }
            return [{
              operation_id: 'op-stale-cache',
              type: 'REPLACE',
              partition_id: 'control_plane_publications-p1',
              source_node_id: 'node-1',
              target_node_id: 'node-2',
              replica_id: 'control_plane_publications-p1-r4',
              status: 'syncing',
              workflow_step: 'SYNCING',
              created_at: 1000,
              updated_at: 1001,
              completed_at: null,
              error_message: null,
              steps_history: '[]',
            }];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            sqlQueryCalls += 1;
            return {success: true, rows: []};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      coordinator.config.maxConcurrentAdds = 1;
      try {
        const canStartFromCacheOnly = await coordinator.canStartAddOperation();
        t.equal(
          canStartFromCacheOnly,
          false,
          'cache-saturated add budget should block without an authoritative re-check',
        );
        t.equal(
          sqlQueryCalls,
          0,
          'cache-only budget check should avoid routed SQL reads',
        );

        const canStartWithAuthoritativeConfirmation =
        await coordinator.canStartAddOperation({
          concurrentBudgetReadMode:
            REBALANCER_CONCURRENT_BUDGET_READ_MODE
              .OWNER_RPC_RECHECK_ON_SATURATION,
        });
        t.equal(
          canStartWithAuthoritativeConfirmation,
          true,
          'priority recovery budget checks should allow scheduling when authoritative in-flight count is below limit',
        );
        t.ok(
          sqlQueryCalls > 0,
          'authoritative budget confirmation should query replica_operations',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'canStartAddOperation blocks instead of marking empty when priority ' +
    'recovery defers the authoritative owner read',
    async (t) => {
      let replicaOperationReads = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-priority-recovery-add',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter() {
            return [];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: 'control_plane_publications-p1',
                  spreadGap: 1,
                }],
              },
            };
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (String(sql).includes('FROM replica_operations')) {
              replicaOperationReads += 1;
              return {
                success: false,
                error: 'Distributed operation failed due to participant failures',
                errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
                retryAfterMs: 250,
              };
            }
            return {success: true, rows: [], affectedRows: 0};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const canStart = await coordinator.canStartAddOperation({
          bypassEmptyQueryDelay: true,
        });
        const outcome =
        coordinator.repository.getLastIncompleteOperationReadOutcome();

        t.equal(
          canStart,
          false,
          'deferred owner reads must block add admission instead of treating the lane as empty',
        );
        t.equal(
          replicaOperationReads,
          1,
          'add admission should still attempt one authoritative owner read before deferring',
        );
        t.equal(
          coordinator.workflowOwner.lastEmptyIncompleteOperationQueryAtMs,
          0,
          'deferred owner reads must not start the empty-operation backoff window',
        );
        t.equal(
          outcome?.completionState,
          PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
          'the repository should preserve the canonical deferred completion state',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'canStartPriorityAddOperation keeps emergency publication recovery admitted while the reserved lane contains background pressure',
    async (t) => {
      let replicaOperationReads = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-emergency-priority-add',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter() {
            return [];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: EMERGENCY_PRIORITY_PARTITION_ID,
                  spreadGap: 1,
                }],
              },
            };
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (String(sql).includes('FROM replica_operations')) {
              replicaOperationReads += 1;
              return {
                success: false,
                error: 'Distributed operation failed due to participant failures',
                errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
                retryAfterMs: 250,
              };
            }
            return {success: true, rows: [], affectedRows: 0};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const canStart = await coordinator.canStartPriorityAddOperation({
          bypassEmptyQueryDelay: true,
          partitionId: EMERGENCY_PRIORITY_PARTITION_ID,
        });
        const outcome =
        coordinator.repository.getLastIncompleteOperationReadOutcome();

        t.equal(
          canStart,
          true,
          'emergency publication recovery should stay admitted while only background pressure is being contained',
        );
        t.equal(
          replicaOperationReads,
          1,
          'the emergency lane should still attempt one authoritative owner read',
        );
        t.equal(
          outcome?.completionState,
          PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
          'the deferred owner-read outcome should remain visible for diagnostics even when admission continues',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'checkTimeouts keeps polling when priority recovery defers the ' +
    'authoritative incomplete-operation read',
    async (t) => {
      let replicaOperationReads = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-priority-recovery-timeout',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter() {
            return [];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  spreadGap: 1,
                }],
              },
            };
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (String(sql).includes('FROM replica_operations')) {
              replicaOperationReads += 1;
              return {
                success: false,
                error: 'Distributed operation failed due to participant failures',
                errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
                retryAfterMs: 250,
              };
            }
            return {success: true, rows: [], affectedRows: 0};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      coordinator.workflowOwner.lastEmptyIncompleteOperationQueryAtMs =
      Date.now() -
      coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs -
      1;
      try {
        await coordinator.checkTimeouts();
        t.equal(
          replicaOperationReads,
          1,
          'timeout scanning should still attempt one authoritative owner read before deferring',
        );
        t.equal(
          coordinator.workflowOwner.lastEmptyIncompleteOperationQueryAtMs,
          0,
          'deferred timeout scans must not enter empty-operation backoff',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'canStartRemoveOperation preserves deferred owner-read outcome while router degrades background work',
    async (t) => {
      let replicaOperationReads = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-1',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {},
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  spreadGap: 1,
                }],
              },
            };
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (String(sql).includes('FROM replica_operations')) {
              replicaOperationReads += 1;
              return {
                success: false,
                error: 'Distributed operation failed due to participant failures',
                errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
                retryAfterMs: 250,
              };
            }
            return {success: true, rows: [], affectedRows: 0};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const canStart = await coordinator.canStartRemoveOperation({
          bypassEmptyQueryDelay: true,
        });
        const outcome =
        coordinator.repository.getLastIncompleteOperationReadOutcome();
        t.equal(
          canStart,
          false,
          'degraded router pressure must block remove admission through the deferred owner-read contract',
        );
        t.equal(
          replicaOperationReads,
          1,
          'remove admission should still attempt one authoritative owner read under degrade pressure',
        );
        t.equal(
          coordinator.workflowOwner.lastEmptyIncompleteOperationQueryAtMs,
          0,
          'degraded remove reads must not start the empty-operation backoff window',
        );
        t.equal(
          outcome?.completionState,
          PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
          'degraded remove admission should preserve the canonical deferred outcome',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'canStartRemoveOperation blocks non-priority deferred owner reads under ' +
    'contained priority pressure',
    async (t) => {
      let replicaOperationReads = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-router-degrade-non-priority-remove',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {},
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: PRIORITY_RECOVERY_BLOCKED_PARTITION_ID,
                  spreadGap: TEST_PRIORITY_RECOVERY_SPREAD_GAP,
                }],
              },
            };
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (String(sql).includes('FROM replica_operations')) {
              replicaOperationReads += 1;
              return {
                success: false,
                error: TEST_PRESSURE_DEGRADED_ERROR,
                errorCode: TEST_PRESSURE_DEGRADED_ERROR_CODE,
                retryAfterMs: TEST_PRESSURE_DEGRADED_RETRY_AFTER_MS,
              };
            }
            return {success: true, rows: [], affectedRows: 0};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const canStart = await coordinator.canStartRemoveOperation({
          bypassEmptyQueryDelay: true,
          partitionId: NON_PRIORITY_DEFERRED_PARTITION_ID,
        });
        const outcome =
        coordinator.repository.getLastIncompleteOperationReadOutcome();

        t.equal(
          canStart,
          false,
          'non-priority remove admission must not reuse the priority recovery pressure lane',
        );
        t.equal(
          replicaOperationReads,
          1,
          'non-priority remove admission should still attempt one owner read before blocking',
        );
        t.equal(
          outcome?.completionState,
          PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
          'non-priority remove admission should preserve deferred owner-read diagnostics',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );


  registerRebalanceCoordinatorTimeoutCacheVisibilityTailMoreTests({
    test,
    RebalanceCoordinator,
    CONTROL_PLANE_TIMEOUT_DEFAULT,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    QUERY_ERROR_MSG,
    REBALANCER_CONCURRENT_BUDGET_READ_MODE,
    ReplicaStatus,
    PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
    EMERGENCY_PRIORITY_PARTITION_ID,
    buildTransactionCoordinator,
    createCoordinator,
  });
}
