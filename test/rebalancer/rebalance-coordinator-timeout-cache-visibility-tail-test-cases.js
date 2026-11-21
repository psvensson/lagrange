import {createCoordinatorSqlStore, createMockCdcService, createMockPolicyService} from './test-helpers.js';
import {RESERVATION_STATUS} from '../../src/rebalancer/storage-capacity-constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
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
              entity_type: 'partition',
              entity_id: 'partition-1',
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
          return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {targetReplicaCount: 3, minReplicaCount: 1};
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
        authoritativeReadCalls[0]?.options?.readAuthority
          ?.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
        'replica_operations visibility reads should prefer owner RPC with SQL fallback',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('terminal reservation release uses strict owner reads while reconciliation uses the routed sweep',
    async (t) => {
      const gatewayCalls = [];
      const now = Date.now();
      const operation = {type: 'ADD', operationId: 'op-1', entityType: 'partition',
        entityId: 'partition-1', partitionId: 'partition-1', targetNodeId: 'node-1'};
      const store = createCoordinatorSqlStore({});
      for (const [id, operationId, expiresAt] of [
        ['res-op-1', operation.operationId, now + 60_000],
        ['res-expired-1', 'op-expired-1', now - 60_000],
        ['res-orphan-1', 'op-orphan-1', now + 60_000],
      ]) {
        const insert = store.submitMutation({
          operation: 'insert',
          tableName: 'storage_reservations',
          row: {
            reservation_id: id, operation_id: operationId, entity_type: operation.entityType,
            entity_id: operation.entityId, partition_id: operation.partitionId,
            target_node_id: operation.targetNodeId, status: RESERVATION_STATUS.ACTIVE,
            estimated_bytes: 1, created_at: now, updated_at: now, expires_at: expiresAt,
            released_at: null,
          },
        });
        t.ok(insert.success, `committed reservation fixture ${id}`);
      }
      const coordinator = createCoordinator({
        nodeId: 'node-1',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {get: () => null},
        cdcIntegrationService: createMockCdcService(),
        tablePolicyService: createMockPolicyService(),
        controlPlaneSystemTableGateway: {
          async readAuthoritativeRows(tableName, sql, params, options) {
            gatewayCalls.push({tableName, sql, options});
            return store.execute(sql, params);
          },
          async executeQuery(sql, params) {
            return store.execute(sql, params);
          },
        },
        enableTimeouts: false,
      });
      coordinator.initialize();
      try {
        await coordinator.releaseReservationForOperation(operation);
        await coordinator.reconcileReservations();
        const reservationReads = gatewayCalls.filter((call) =>
          call.tableName === 'storage_reservations');
        t.equal(reservationReads.length, 3,
          'cleanup reads the active operation reservations, expired rows and active sweep');
        t.equal(reservationReads[0]?.options.authoritativeReadMode,
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
          'terminal release observes the exact active tuple through the strict owner');
        for (const call of reservationReads.slice(1)) {
          t.equal(call.options.authoritativeReadMode,
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
            'discovery of sweep candidates uses the routed authority policy');
          t.equal(call.options.timeoutMs, CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
            'reservation sweep retains its read timeout');
        }
        const committed = store.execute('SELECT status FROM storage_reservations ORDER BY reservation_id');
        t.same(committed.rows.map((row) => row.status),
          [RESERVATION_STATUS.EXPIRED, RESERVATION_STATUS.RELEASED, RESERVATION_STATUS.RELEASED],
          'terminal release, expiry and confirmed absence each close their exact reservation');
      } finally {
        await coordinator.shutdown();
        store.suspend();
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
          return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {targetReplicaCount: 3, minReplicaCount: 1};
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
        authoritativeReadCalls[0]?.options?.readAuthority
          ?.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
        'canonical replica_operations visibility reads should prefer owner RPC with SQL fallback',
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
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
    'owner rows are unavailable and settles only after authority recovers',
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
      const store = createCoordinatorSqlStore({
        getAll: (table) => table === 'replica_operations' ? [recoveryRow] : [],
        upsert: (_table, row) => Object.assign(recoveryRow, row),
      });
      let authorityAvailable = false;
      let terminalWrites = 0;
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
        cdcIntegrationService: {refreshAuthoritativeCacheRow: async () => true},
        controlPlaneSystemTableGateway: {
          async readAuthoritativeRows(tableName, sql, params) {
            if (tableName === 'replica_operations') {
              authoritativeReadCalls += 1;
              if (!authorityAvailable) {
                return {success: false, error: 'authoritative_row_source_unavailable'};
              }
            }
            return store.execute(sql, params);
          },
          async executeQuery(sql, params) {
            if (sql.includes('UPDATE replica_operations') && sql.includes('completed_at IS NULL')) {
              terminalWrites += 1;
            }
            return store.execute(sql, params);
          },
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
          },
        },
        enableTimeouts: false,
      });
      let reservationRecoveryCalls = 0;
      const ensureReservationForOperation =
        coordinator.ensureReservationForOperation.bind(coordinator);
      coordinator.ensureReservationForOperation = async (...args) => {
        reservationRecoveryCalls += 1;
        return ensureReservationForOperation(...args);
      };
      coordinator.initialize();
      try {
        t.notOk(coordinator.hasStorageReservationSupport(),
          'the reduced owner has no storage-reservation subsystem');
        const result = await coordinator.handleRecovery();
        t.equal(reservationRecoveryCalls, 0,
          'reservation recovery stays disengaged when its canonical ' +
          'support owner is absent');
        t.equal(
          result.totalIncomplete,
          1,
          'recovery should preserve the cache-visible local-owner operation set instead of collapsing to empty',
        );
        t.equal(result.markedFailed, 0,
          'cached visibility alone cannot write the terminal failure');
        t.ok(authoritativeReadCalls >= 1,
          'recovery still consults the production owner read path');
        t.equal(recoveryRow.status, ReplicaStatus.PENDING,
          'failure cannot settle while operation authority is unavailable');
        t.equal(terminalWrites, 0, 'unavailable authority refused before the guarded SQL write');

        authorityAvailable = true;
        const recovered = await coordinator.handleRecovery();
        t.equal(recovered.markedFailed, 1, 'the normal recovery owner settles after authority returns');
        t.equal(recoveryRow.status, ReplicaStatus.FAILED);
        t.equal(recoveryRow.workflow_step, 'FAILED');
        t.equal(terminalWrites, 1, 'the exact guarded failure commits once');
      } finally {
        await coordinator.shutdown();
        store.suspend();
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
        },
        controlPlaneReadinessService: {
          async getPriorityRecoveryPlanningSnapshotBestEffort() { return this.getPriorityRecoveryPlanningAnswerSync(); },
          getPriorityRecoveryPlanningAnswerSync() {
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
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
        },
        controlPlaneReadinessService: {
          async getPriorityRecoveryPlanningSnapshotBestEffort() { return this.getPriorityRecoveryPlanningAnswerSync(); },
          getPriorityRecoveryPlanningAnswerSync() {
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
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
        },
        controlPlaneReadinessService: {
          async getPriorityRecoveryPlanningSnapshotBestEffort() { return this.getPriorityRecoveryPlanningAnswerSync(); },
          getPriorityRecoveryPlanningAnswerSync() {
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
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
              entity_type: 'partition',
              entity_id: 'control_plane_publications-p1',
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
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
        },
        controlPlaneReadinessService: {
          async getPriorityRecoveryPlanningSnapshotBestEffort() { return this.getPriorityRecoveryPlanningAnswerSync(); },
          getPriorityRecoveryPlanningAnswerSync() {
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
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
        },
        controlPlaneReadinessService: {
          async getPriorityRecoveryPlanningSnapshotBestEffort() { return this.getPriorityRecoveryPlanningAnswerSync(); },
          getPriorityRecoveryPlanningAnswerSync() {
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
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
        },
        controlPlaneReadinessService: {
          async getPriorityRecoveryPlanningSnapshotBestEffort() { return this.getPriorityRecoveryPlanningAnswerSync(); },
          getPriorityRecoveryPlanningAnswerSync() {
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
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
        },
        controlPlaneReadinessService: {
          async getPriorityRecoveryPlanningSnapshotBestEffort() { return this.getPriorityRecoveryPlanningAnswerSync(); },
          getPriorityRecoveryPlanningAnswerSync() {
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
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
        },
        controlPlaneReadinessService: {
          async getPriorityRecoveryPlanningSnapshotBestEffort() { return this.getPriorityRecoveryPlanningAnswerSync(); },
          getPriorityRecoveryPlanningAnswerSync() {
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
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
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
