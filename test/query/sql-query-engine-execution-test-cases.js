import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  QUERY_ROUTING_REPAIR_REASON,
} from '../../src/query/query-constants.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  assertNoHandlerRepairConverged,
  createStaleOverlayOwnerHandoffFixture,
} from './routing-repair-test-helpers.js';

const SQL_ENGINE_SYSTEM_TABLE_UPDATE_SQL =
  'UPDATE nodes SET status = \'active\' WHERE node_id = \'node-a\'';
const SQL_ENGINE_SYSTEM_TABLE_WRITE_DELIVERY_SOURCE =
  'control-plane:write:nodes:node-a';
const TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_PRIORITY = 'critical';
const TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_TIMEOUT_MS = 15000;
const TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_SESSION_ID = 'session-1';
const TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_PARTITION_ID =
  'replica_operations-p1';
const TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_OPERATION = 'COMMIT';
const TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_SOURCE =
  'query:transaction:replica_operations-p1:session-1:COMMIT';

function registerSqlQueryEngineExecutionTestCases({
  createMockMessageRouter,
  createMockSystemCache,
  mockPartitionData,
}) {
  test('SQLQueryEngine - authoritative system-table selects request bounded ' +
    'local replica fallback before owner RPC', async (t) => {
    const authoritativeReads = [];
    const engine = new SQLQueryEngine({
      systemCache: createMockSystemCache([], [], [], []),
      messageRouter: createMockMessageRouter(),
      authoritativeControlPlaneView: {
        async readRows(tableName, sql, params, options) {
          authoritativeReads.push({tableName, sql, params, options});
          return {
            success: true,
            rows: [{
              log_id: params[0],
            }],
            source: 'local_partition_replica',
          };
        },
      },
    });

    const result = await engine.executeQuery(
      'SELECT log_id FROM logs WHERE log_id = ?',
      ['log-visible-1'],
    );

    t.equal(result.success, true,
      'authoritative system-table reads should succeed');
    t.equal(result.rows.length, 1,
      'authoritative local rows should be returned');
    t.equal(
      authoritativeReads.length,
      1,
      'system-table SELECT should use one authoritative local read',
    );
    t.equal(
      authoritativeReads[0]?.options?.readAuthority
        ?.replicaFallbackConsistency,
      'any_replica',
      'system-table SELECT should allow bounded local replica fallback before owner RPC',
    );
    t.equal(
      authoritativeReads[0]?.options?.readAuthority
        ?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC,
      'bounded primary-key SELECT should confirm an empty local read with the owner',
    );
  });

  test('SQLQueryEngine - query routing repair avoids stale no-handler retry ' +
    'when overlay refresh keeps the same service id', async (t) => {
    const fixture = createStaleOverlayOwnerHandoffFixture({
      sameServiceId: true,
      refreshedAddress: 'new-owner/partition/replica_operations-p1-r1',
      successRows: [{operation_id: 'op-engine-1'}],
    });

    const engine = new SQLQueryEngine({
      systemCache: fixture.systemCache,
      messageRouter: fixture.messageRouter,
      routingMetadataOverlay: fixture.routingMetadataOverlay,
      nodeId: 'local-node',
    });

    const result = await engine.queryExecutor.executeOnPartition(
      fixture.partitionId,
      'SELECT * FROM replica_operations WHERE operation_id = ?',
      ['op-engine-1'],
      true,
    );

    t.equal(result.success, true);
    assertNoHandlerRepairConverged(t, {
      deliveries: fixture.deliveries,
      staleAddress: fixture.staleAddress,
      refreshedAddress: fixture.refreshedAddress,
      overlayRefreshCalls: fixture.overlayRefreshCalls,
      context: 'SQL engine composed overlay repair',
    });
    t.equal(
      fixture.overlayRefreshCalls[0].options.refreshReason,
      QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
      'engine-composed overlay refresh should keep stale-service repair reason',
    );
  });

  test('SQLQueryEngine - routes priority control-plane transaction delivery ' +
    'through recovery eligibility', async (t) => {
    const engine = new SQLQueryEngine({
      systemCache: createMockSystemCache([], [], [], []),
      messageRouter: {
        deliver: async () => ({acknowledged: true, success: true}),
      },
      nodeId: 'local-node',
    });
    const routingCalls = [];
    engine.queryExecutor.executeOnPartition = async (
      partitionId,
      sql,
      params,
      forRead,
      preferLeader,
      preferSameLatencyGroup,
      executionOptions = {},
    ) => {
      routingCalls.push({
        partitionId,
        sql,
        params,
        forRead,
        preferLeader,
        preferSameLatencyGroup,
        deliveryPriority: executionOptions.deliveryPriority,
        deliverySource: executionOptions.deliverySource,
        replacePendingKey: executionOptions.replacePendingKey,
        routingReadinessDimension: executionOptions.routingReadinessDimension,
        timeoutMs: executionOptions.timeoutMs,
      });
      return {success: true};
    };

    await engine.deliverTransactionOperation(
      TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_SESSION_ID,
      TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_PARTITION_ID,
      TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_OPERATION,
    );

    t.equal(routingCalls.length, 1,
      'transaction delivery should perform a single routing lookup');
    t.same(routingCalls[0], {
      partitionId: TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_PARTITION_ID,
      sql: '',
      params: [],
      forRead: false,
      preferLeader: false,
      preferSameLatencyGroup: false,
      deliveryPriority:
        TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_PRIORITY,
      deliverySource: TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_SOURCE,
      replacePendingKey: TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_SOURCE,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      timeoutMs: TEST_PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_TIMEOUT_MS,
    }, 'priority control-plane transaction delivery should use recovery routing');
  });

  test('SQLQueryEngine - keeps user transaction delivery on the default ' +
    'routing dimension', async (t) => {
    const engine = new SQLQueryEngine({
      systemCache: createMockSystemCache([], [], [], []),
      messageRouter: {
        deliver: async () => ({acknowledged: true, success: true}),
      },
      nodeId: 'local-node',
    });
    const routingCalls = [];
    engine.queryExecutor.executeOnPartition = async (
      partitionId,
      sql,
      params,
      forRead,
      preferLeader,
      preferSameLatencyGroup,
      executionOptions = {},
    ) => {
      routingCalls.push({
        partitionId,
        sql,
        params,
        forRead,
        preferLeader,
        preferSameLatencyGroup,
        deliveryPriority: executionOptions.deliveryPriority,
        routingReadinessDimension: executionOptions.routingReadinessDimension,
        timeoutMs: executionOptions.timeoutMs,
      });
      return {success: true};
    };

    await engine.deliverTransactionOperation(
      'session-2',
      'users-p1',
      'COMMIT',
    );

    t.equal(routingCalls.length, 1,
      'user transaction delivery should perform a single routing lookup');
    t.same(routingCalls[0], {
      partitionId: 'users-p1',
      sql: '',
      params: [],
      forRead: false,
      preferLeader: false,
      preferSameLatencyGroup: false,
      deliveryPriority: undefined,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
      timeoutMs: undefined,
    }, 'user transaction delivery should keep the default serve routing');
  });

  test('SQLQueryEngine - defaults system-table recovery selects to replica ' +
    'routing', async (t) => {
    const partitionId = 'logs-p1';
    const cache = createMockSystemCache(
      [
        {
          table_name: TABLES.LOGS,
        },
      ],
      [
        {
          partition_id: partitionId,
          table_name: TABLES.LOGS,
        },
      ],
      [
        {
          service_id: `${partitionId}-r1`,
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: partitionId,
          node_id: 'seed-node',
          raft_role: 'leader',
          address: `seed-node/partition/${partitionId}-r1`,
          status: SERVICE_STATUS.ACTIVE,
        },
      ],
    );
    const engine = new SQLQueryEngine({
      nodeId: 'select-node',
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
      distributedQueryPlanner: {
        planSelect() {
          return {
            tablePlans: new Map([
              [
                TABLES.LOGS,
                {
                  partitions: [partitionId],
                },
              ],
            ]),
            diagnostics: {
              tablePlans: [],
            },
          };
        },
      },
    });
    let capturedExecutionOptions = null;
    engine.queryExecutor = {
      async executeSelect(_ast, _partitionIds, _params, executionOptions = {}) {
        capturedExecutionOptions = executionOptions;
        return {
          success: true,
          rows: [],
          count: 0,
          distributedMetrics: {},
        };
      },
    };

    const result = await engine.executeQuery(
      'SELECT * FROM logs WHERE log_id = \'log-1\'',
    );

    t.equal(result.success, true, 'system-table select should still succeed');
    t.equal(
      capturedExecutionOptions?.preferLeader,
      false,
      'recovery-lane system-table SELECT should prefer any eligible replica',
    );
    t.equal(
      capturedExecutionOptions?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'system-table select should default to the recovery-eligible routing lane',
    );
  });

  test('SQLQueryEngine - system-table selects honor replica-preferred routing',
    async (t) => {
      const partitionId = 'logs-p1';
      const cache = createMockSystemCache(
        [
          {
            table_name: TABLES.LOGS,
          },
        ],
        [
          {
            partition_id: partitionId,
            table_name: TABLES.LOGS,
          },
        ],
        [
          {
            service_id: `${partitionId}-r1`,
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'seed-node',
            raft_role: 'leader',
            address: `seed-node/partition/${partitionId}-r1`,
            status: SERVICE_STATUS.ACTIVE,
          },
        ],
      );
      const engine = new SQLQueryEngine({
        nodeId: 'select-node',
        systemCache: cache,
        messageRouter: createMockMessageRouter(),
        distributedQueryPlanner: {
          planSelect() {
            return {
              tablePlans: new Map([
                [
                  TABLES.LOGS,
                  {
                    partitions: [partitionId],
                  },
                ],
              ]),
              diagnostics: {
                tablePlans: [],
              },
            };
          },
        },
      });
      let capturedExecutionOptions = null;
      engine.queryExecutor = {
        async executeSelect(_ast, _partitionIds, _params, executionOptions = {}) {
          capturedExecutionOptions = executionOptions;
          return {
            success: true,
            rows: [],
            count: 0,
            distributedMetrics: {},
          };
        },
      };

      const result = await engine.executeQuery(
        'SELECT * FROM logs WHERE log_id = \'log-1\'',
        [],
        {preferLeader: false},
      );

      t.equal(result.success, true, 'system-table select should still succeed');
      t.equal(
        capturedExecutionOptions?.preferLeader,
        false,
        'explicit replica-preferred routing should reach query execution',
      );
      t.equal(
        capturedExecutionOptions?.routingReadinessDimension,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        'replica-preferred system-table select should keep recovery routing',
      );
    });

  test('SQLQueryEngine - defaults system-table writes to recovery routing',
    async (t) => {
      const partitionId = 'nodes-p1';
      const cache = createMockSystemCache(
        [
          {
            table_name: TABLES.NODES,
          },
        ],
        [
          {
            partition_id: partitionId,
            table_name: TABLES.NODES,
          },
        ],
        [
          {
            service_id: `${partitionId}-r1`,
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'seed-node',
            raft_role: 'leader',
            address: `seed-node/partition/${partitionId}-r1`,
            status: SERVICE_STATUS.ACTIVE,
          },
        ],
      );
      let capturedExecutionOptions = null;
      const engine = new SQLQueryEngine({
        nodeId: 'write-node',
        systemCache: cache,
        messageRouter: createMockMessageRouter(),
        distributedQueryPlanner: {
          planUpdate() {
            return {
              statementType: 'UPDATE',
              executionPolicy: 'distributed_write',
              tablePlans: new Map([
                [
                  TABLES.NODES,
                  {
                    partitions: [partitionId],
                  },
                ],
              ]),
              diagnostics: {
                tablePlans: [],
              },
            };
          },
        },
        distributedWriteCoordinator: {
          createWritePlan() {
            return {
              operationId: 'system-table-update',
              idempotencyKey: 'system-table-update',
              partitionStatements: new Map([
                [
                  partitionId,
                  {
                    ast: {
                      type: 'UPDATE',
                      table: TABLES.NODES,
                    },
                    role: 'primary',
                    executionOptions: {},
                  },
                ],
              ]),
            };
          },
          async executePlan(_writePlan, _params, executionOptions = {}) {
            capturedExecutionOptions = executionOptions;
            return {
              success: true,
              changes: 1,
            };
          },
        },
      });

      const result = await engine.executeQuery(
        SQL_ENGINE_SYSTEM_TABLE_UPDATE_SQL,
        [],
        {
          deliverySource: SQL_ENGINE_SYSTEM_TABLE_WRITE_DELIVERY_SOURCE,
        },
      );

      t.equal(result.success, true, 'system-table write should still succeed');
      t.equal(
        capturedExecutionOptions?.routingReadinessDimension,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        'system-table write should default to the recovery-eligible routing lane',
      );
      t.equal(
        capturedExecutionOptions?.deliverySource,
        SQL_ENGINE_SYSTEM_TABLE_WRITE_DELIVERY_SOURCE,
        'system-table write delivery source should reach partition delivery',
      );
    });

  test('SQLQueryEngine - transaction delivery repairs stale no-handler owner ' +
    'handoff before retrying control-plane commit', async (t) => {
    const fixture = createStaleOverlayOwnerHandoffFixture({
      sameServiceId: true,
      refreshedAddress: 'new-owner/partition/replica_operations-p1-r1',
    });

    const engine = new SQLQueryEngine({
      systemCache: fixture.systemCache,
      messageRouter: fixture.messageRouter,
      routingMetadataOverlay: fixture.routingMetadataOverlay,
      nodeId: 'local-node',
    });

    await engine.deliverTransactionOperation(
      'session-3',
      fixture.partitionId,
      'COMMIT',
    );

    assertNoHandlerRepairConverged(t, {
      deliveries: fixture.deliveries,
      staleAddress: fixture.staleAddress,
      refreshedAddress: fixture.refreshedAddress,
      overlayRefreshCalls: fixture.overlayRefreshCalls,
      context: 'transaction delivery routing repair',
    });
  });

  test('SQLQueryEngine - executes SELECT query', async (t) => {
    // Set up mock partition data
    mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);
    mockPartitionData.set('p2', [{id: 2, name: 'Bob'}]);

    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [
        {
          partition_id: 'p1',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: 'm',
        },
        {
          partition_id: 'p2',
          table_name: 'users',
          partition_key_start: 'm',
          partition_key_end: null,
        },
      ],
    );

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery('SELECT * FROM users');

    t.equal(result.success, true);
    t.equal(result.rows.length, 2);

    // Clean up
    mockPartitionData.clear();
  });

  test('SQLQueryEngine - reserves critical routing for topology tables and ' +
    'demotes high-volume transaction metadata',
  async (t) => {
    const engine = new SQLQueryEngine({
      systemCache: createMockSystemCache([], [], []),
      messageRouter: createMockMessageRouter(),
    });

    t.equal(
      engine.resolveRoutedDeliveryPriority(TABLES.NODES),
      'critical',
      'topology metadata should stay on the critical lane',
    );
    t.equal(
      engine.resolveRoutedDeliveryPriority(TABLES.SQL_TRANSACTIONS),
      'background',
      'transaction metadata should not consume the reserved control lane',
    );
    t.equal(
      engine.resolveRoutedDeliveryPriority(
        TABLES.SQL_TRANSACTION_PARTICIPANTS,
      ),
      'background',
      'participant metadata should also use the background lane',
    );
  });

  test('SQLQueryEngine - keeps recovery-critical transaction state on the ' +
    'critical lane while leaving write-operation telemetry on background',
  async (t) => {
    const submissions = [];
    const engine = new SQLQueryEngine({
      systemCache: createMockSystemCache([], [], []),
      messageRouter: createMockMessageRouter(),
    });
    engine.getControlPlaneSystemTableGateway = () => ({
      supportsMutationSubmission: () => true,
      submitMutation: async (mutation, options) => {
        submissions.push({mutation, options});
        return {success: true};
      },
    });

    await engine.persistDistributedTransactionRow({
      transactionId: 'tx-1',
      sessionId: 'session-1',
      status: 'ACTIVE',
      transactionEpoch: 1,
      timeoutDeadline: Date.now() + 1000,
      createdAt: 1,
      updatedAt: 2,
    });
    await engine.persistDistributedTransactionParticipantRow({
      participantId: 'participant-1',
      transactionId: 'tx-1',
      partitionId: 'users-p1',
      status: 'PREPARED',
      lastError: null,
      createdAt: 1,
      updatedAt: 2,
    });
    await engine.persistDistributedWriteOperationRow({
      operationId: 'write-op-1',
      transactionId: 'tx-1',
      statementType: 'UPDATE',
      status: 'FAILED',
      idempotencyKey: 'idem-1',
      payloadHash: 'hash-1',
      partitionIds: ['users-p1'],
      retryCount: 1,
      lastError: 'query_timeout',
      createdAt: 1,
      updatedAt: 2,
    });

    t.equal(submissions.length, 3,
      'transaction persistence should submit transaction, participant, and write-operation mutations');
    t.equal(submissions[0].options.deliveryPriority, 'critical',
      'transaction rows should stay on the critical delivery lane');
    t.equal(submissions[1].options.deliveryPriority, 'critical',
      'participant rows should stay on the critical delivery lane');
    t.equal(submissions[2].options.deliveryPriority, 'background',
      'write-operation telemetry should remain on the background delivery lane');
    t.equal(
      submissions[0].options.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.TRANSACTION_CONTROL_MUTATION,
      'transaction rows should carry the shared transaction-control workload class',
    );
    t.equal(
      submissions[1].options.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.TRANSACTION_CONTROL_MUTATION,
      'participant rows should carry the shared transaction-control workload class',
    );
    t.equal(submissions[0].options.skipCacheWait, true,
      'transaction rows should not fail closed on cache visibility lag');
    t.equal(submissions[1].options.skipCacheWait, true,
      'participant rows should not fail closed on cache visibility lag');
    t.equal(submissions[2].options.skipCacheWait, true,
      'write-operation telemetry should also bypass cache visibility lag');
    t.equal(submissions[0].options.mergePolicy, 'replace_pending',
      'transaction rows should coalesce to the latest durable state');
    t.equal(submissions[1].options.mergePolicy, 'replace_pending',
      'participant rows should coalesce to the latest durable state');
    t.equal(submissions[2].options.mergePolicy, 'replace_pending',
      'write-operation telemetry should still coalesce to the latest durable state');
    t.equal(
      submissions[0].options.coalescingKey,
      'sql-transaction:tx-1',
      'transaction persistence should use a stable coalescing key',
    );
    t.equal(
      submissions[1].options.coalescingKey,
      'sql-transaction-participant:participant-1',
      'participant persistence should use a stable coalescing key',
    );
    t.equal(
      submissions[2].options.coalescingKey,
      'sql-write-operation:write-op-1',
      'write-operation persistence should use a stable coalescing key',
    );
  });

  test('SQLQueryEngine - transactional write-operation persistence stays on the ' +
    'critical lane through the coordinator wiring',
  async (t) => {
    const submissions = [];
    const engine = new SQLQueryEngine({
      systemCache: createMockSystemCache([], [], []),
      messageRouter: createMockMessageRouter(),
    });
    engine.getControlPlaneSystemTableGateway = () => ({
      supportsMutationSubmission: () => true,
      submitMutation: async (mutation, options) => {
        submissions.push({mutation, options});
        return {success: true};
      },
    });

    await engine.transactionCoordinator.begin('session-1');
    await engine.transactionCoordinator.recordWriteOperation('session-1', {
      operationId: 'write-op-1',
      statementType: 'UPDATE',
      partitionIds: ['users-p1'],
      idempotencyKey: 'idem-1',
      payloadHash: 'hash-1',
    });
    await engine.transactionCoordinator.markWriteOperationResult(
      'session-1',
      'write-op-1',
      {
        success: true,
        retryCount: 1,
      },
    );

    const writeOperationSubmissions = submissions.filter((entry) => {
      return entry.mutation?.tableName === TABLES.SQL_WRITE_OPERATIONS;
    });

    t.equal(
      writeOperationSubmissions.length,
      2,
      'transactional write-operation persistence should record pending and terminal rows',
    );
    t.ok(
      writeOperationSubmissions.every((entry) =>
        entry.options?.deliveryPriority === 'critical'),
      'transaction-owned write-operation rows should stay on the critical delivery lane',
    );
    t.ok(
      writeOperationSubmissions.every((entry) =>
        entry.options?.workClass === PRESSURE_WORK_CLASS.CRITICAL),
      'transaction-owned write-operation rows should keep critical mutation work class',
    );
  });

  test('SQLQueryEngine - query ingress reuses the shared pressure admission ' +
    'contract', async (t) => {
    const pressureSummary = {
      backpressured: true,
      saturatedNodeCount: 1,
      totalPending: 64,
      maxPendingUtilization: 1,
    };
    const engine = new SQLQueryEngine({
      nodeId: 'pressure-node',
      systemCache: createMockSystemCache([], [], []),
      messageRouter: {
        getOutboundPressureSummary() {
          return pressureSummary;
        },
      },
    });

    const cases = [
      {
        name: 'defer',
        options: {
          workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        },
        expectedError: 'query_admission_deferred',
        expectedAction: 'defer',
        // Derived pacing hint: background base at shallow saturation.
        expectedRetryAfterMs: 100,
      },
    ];

    for (const testCase of cases) {
      const result = await engine.executeQuery(
        'SELECT * FROM users',
        [],
        testCase.options,
      );

      t.equal(result.success, false,
        `${testCase.name}: query admission under pressure should fail closed`);
      t.equal(result.error, testCase.expectedError,
        `${testCase.name}: query ingress should preserve its query-specific admission error`);
      t.equal(result.pressureAction, testCase.expectedAction,
        `${testCase.name}: query ingress should expose the shared pressure action`);
      t.equal(result.pressureReason, 'transport_backpressure',
        `${testCase.name}: query ingress should expose the shared pressure reason`);
      t.equal(result.retryAfterMs, testCase.expectedRetryAfterMs,
        `${testCase.name}: query ingress should preserve retry hints from the shared contract`);
      t.same(result.pressureSummary, {
        sensor: 'transport:outbound',
        capacityPartition: 'query-plane',
        ...pressureSummary,
        totalPendingCritical: 0,
        totalPendingBackground: 0,
        totalPendingCriticalReserveEligible: 0,
        criticalReserveExhausted: false,
        readinessReserveExhausted: false,
      }, `${testCase.name}: query ingress should expose the shared pressure summary shape`);
    }
  });
}

export {
  registerSqlQueryEngineExecutionTestCases,
};
