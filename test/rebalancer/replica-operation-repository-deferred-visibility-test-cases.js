export function registerReplicaOperationRepositoryDeferredVisibilityTests({
  test,
  createTestRepository,
  makeRow,
  TEST_NODE_ID,
  TEST_OPERATION_ID,
  TEST_PARTITION_ID,
  TEST_ENTITY_TYPE,
  TEST_CREATING_STATUS,
  TEST_CACHE_BACKED_VISIBILITY_OPERATION_ID,
  TEST_PENDING_STATUS,
  TEST_REPLICA_OPERATION_READ_COALESCING_KEY,
  TEST_REPLICA_OPERATION_READ_DELIVERY_SOURCE,
  OWNER_PERSISTED_TRANSITION_VISIBILITY_EMPTY_READ_SOURCE,
  OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
  WORKFLOW_STEP,
  SYSTEM_TABLE_NAME,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_WORKLOAD_CLASS,
  CONTROL_PLANE_TIMEOUT_DEFAULT,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  OperationType,
  TERMINAL_STATUSES,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
}) {
  test('queryIncompleteOperations logs retryable read failures as warnings', async (t) => {
    const warnings = [];
    const errors = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({
          success: false,
          error: 'Distributed operation failed due to participant failures',
          errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
          retryAfterMs: 250,
        }),
        executeQuery: async () => ({success: true}),
      },
    });
    repo.logger = {
      info() {},
      debug() {},
      warn(...args) {
        warnings.push(args);
      },
      error(...args) {
        errors.push(args);
      },
    };

    const operations = await repo.queryIncompleteOperations();

    t.same(operations, [], 'retryable read failures should fail closed to empty results');
    t.equal(warnings.length, 1, 'retryable read failures should log one warning');
    t.equal(errors.length, 0, 'retryable read failures should not log hard errors');
    t.equal(
      warnings[0][1]?.code,
      'CONTROL_PLANE_PRESSURE_DEGRADED',
      'warning should preserve the typed pressure code',
    );
    t.equal(warnings[0][1]?.retryAfterMs, 250, 'warning should preserve the retry-after hint');
  });

  test('queryIncompleteOperations backs off SQL retries after retryable read failures', async (t) => {
    let readCalls = 0;
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => {
          readCalls += 1;
          return {
            success: false,
            error: 'Distributed operation failed due to participant failures',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
            retryAfterMs: 500,
          };
        },
        executeQuery: async () => ({success: true}),
      },
      systemTableCache: {
        get: () => null,
        getAll: () => [],
        filter: () => [],
      },
    });

    const first = await repo.queryIncompleteOperations();
    const second = await repo.queryIncompleteOperations();

    t.same(first, [], 'first retryable failure should fail closed to empty results');
    t.same(second, [], 'subsequent reads during cooldown should reuse the empty observation');
    t.equal(
      readCalls,
      1,
      'retryable failures should arm a cooldown instead of hammering replica_operations SQL',
    );
  });

  test(
    'queryIncompleteOperations backs off when authoritative row source is ' +
      'temporarily unavailable',
    async (t) => {
      let readCalls = 0;
      const warnings = [];
      const errors = [];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => {
            readCalls += 1;
            return {
              success: false,
              error: 'authoritative_row_source_unavailable',
            };
          },
          executeQuery: async () => ({success: true}),
        },
        systemTableCache: {
          get: () => null,
          getAll: () => [],
          filter: () => [],
        },
      });
      repo.logger = {
        info() {},
        debug() {},
        warn(...args) {
          warnings.push(args);
        },
        error(...args) {
          errors.push(args);
        },
      };

      const first = await repo.queryIncompleteOperations();
      const second = await repo.queryIncompleteOperations();

      t.same(first, [], 'authoritative-source gaps should fail closed to empty results');
      t.same(second, [], 'subsequent reads during cooldown should reuse the empty observation');
      t.equal(
        readCalls,
        1,
        'authoritative-source gaps should arm cooldown instead of hammering routed SQL',
      );
      t.equal(warnings.length, 1, 'authoritative-source gaps should log one warning');
      t.equal(
        errors.length,
        0,
        'authoritative-source gaps should not log hard errors while cooling down',
      );
    },
  );

  test(
    'queryIncompleteOperations reuses the last observed operation set when ' +
      'priority recovery defers the authoritative owner read',
    async (t) => {
      let readCalls = 0;
      const cachedRows = [
        makeRow({
          operation_id: 'op-priority-recovery',
          type: OperationType.REPLACE,
          partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
          workflow_step: WORKFLOW_STEP.ACTIVE,
          status: 'active',
          source_node_id: 'node-2',
          target_node_id: TEST_NODE_ID,
        }),
      ];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => {
            readCalls += 1;
            return {
              success: false,
              error: 'Distributed operation failed due to participant failures',
              errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
              retryAfterMs: 250,
            };
          },
          executeQuery: async () => ({success: true}),
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [
                  {
                    partitionId: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
                    spreadGap: 1,
                  },
                ],
              },
            };
          },
        },
        systemTableCache: {
          get: () => null,
          getAll: () => cachedRows,
          filter: (_table, predicate) => cachedRows.filter(predicate),
        },
      });

      const operations = await repo.queryIncompleteOperations({
        visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      const outcome = repo.getLastIncompleteOperationReadOutcome();

      t.ok(
        readCalls >= 1,
        'the repository should still attempt the authoritative owner read before deferring',
      );
      t.same(
        operations.map((operation) => operation.operationId),
        ['op-priority-recovery'],
        'priority recovery defer should fall back to the last observed incomplete operation set instead of collapsing to empty',
      );
      t.equal(
        outcome?.completionState,
        'operation_visibility_deferred',
        'the repository should preserve the canonical deferred completion state',
      );
      t.equal(
        outcome?.reasonCode,
        'operation_visibility_deferred',
        'the repository should preserve the canonical deferred reason code',
      );
      t.equal(
        outcome?.retryAfterMs,
        250,
        'the repository should preserve the bounded retry delay from the failed owner read',
      );
      t.equal(
        outcome?.cachedOperationCount,
        1,
        'the deferred outcome should report how many cached operations were reused',
      );
      t.equal(
        outcome?.source,
        'priority_recovery_authoritative_operation_failure',
        'the deferred outcome should retain the authoritative-read failure source',
      );
      t.ok(
        Number.isInteger(outcome?.queryDurationMs) && outcome.queryDurationMs >= 0,
        'the deferred outcome should preserve the bounded owner-read duration',
      );
    },
  );

  test(
    'getOperationsByEntityAuthoritativeObservation preserves one ' +
      'canonical deferred outcome on retryable owner-read failure',
    async (t) => {
      let readCalls = 0;
      const cachedRows = [
        makeRow({
          operation_id: 'op-entity-visibility-cached',
          status: 'creating',
          workflow_step: WORKFLOW_STEP.CREATING,
        }),
      ];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => {
            readCalls += 1;
            return {
              success: false,
              error: 'Distributed operation failed due to participant failures',
              errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
              retryAfterMs: 250,
            };
          },
          executeQuery: async () => ({success: true}),
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [
                  {
                    partitionId: `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`,
                    spreadGap: 1,
                  },
                ],
              },
            };
          },
        },
        systemTableCache: {
          get: () => null,
          getAll: () => cachedRows,
          filter: (_table, predicate) => cachedRows.filter(predicate),
        },
      });

      const observation = await repo.getOperationsByEntityAuthoritativeObservation(
        TEST_ENTITY_TYPE,
        TEST_PARTITION_ID,
      );

      t.equal(readCalls, 1, 'the repository should still attempt one authoritative owner read');
      t.equal(
        observation?.state,
        'present',
        'cache-visible in-flight rows should remain usable while authoritative visibility is deferred',
      );
      t.same(
        observation?.operations?.map((operation) => operation.operationId),
        ['op-entity-visibility-cached'],
        'deferred entity visibility should reuse the cache-visible in-flight operation rows',
      );
      t.equal(
        observation?.deferredOutcome?.completionState,
        PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED,
        'entity observation should preserve the canonical deferred completion state',
      );
      t.equal(
        observation?.deferredOutcome?.source,
        'priority_recovery_entity_operation_authoritative_failure',
        'entity observation should retain the authoritative-failure source',
      );
      t.equal(
        observation?.retryAfterMs,
        250,
        'entity observation should preserve bounded retry guidance',
      );
    },
  );

  test(
    'queryIncompleteOperations preserves deferred visibility from cached ' +
      'operations when retryable owner reads are backpressured',
    async (t) => {
      const cachedRows = [
        makeRow({
          operation_id: 'op-cached-pressure',
          type: OperationType.REPLACE,
          partition_id: `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`,
          workflow_step: WORKFLOW_STEP.ACTIVE,
          status: 'active',
          source_node_id: 'node-2',
          target_node_id: TEST_NODE_ID,
        }),
      ];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => ({
            success: false,
            error: 'Distributed operation failed due to participant failures',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
            retryAfterMs: 250,
          }),
          executeQuery: async () => ({success: true}),
        },
        systemTableCache: {
          get: () => null,
          getAll: () => cachedRows,
          filter: (_table, predicate) => cachedRows.filter(predicate),
        },
      });

      const operations = await repo.queryIncompleteOperations({
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      const outcome = repo.getLastIncompleteOperationReadOutcome();

      t.same(
        operations.map((operation) => operation.operationId),
        ['op-cached-pressure'],
        'cached in-flight operations should remain visible under retryable read pressure',
      );
      t.equal(
        outcome?.completionState,
        PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED,
        'retryable pressure with cached operations should preserve canonical deferred visibility',
      );
      t.equal(
        outcome?.cachedOperationCount,
        1,
        'deferred visibility should report the reused cached operation count',
      );
      t.equal(
        outcome?.retryAfterMs,
        250,
        'deferred visibility should retain retry guidance from the read failure',
      );
    },
  );

  test(
    'getOperationsByEntityAuthoritativeObservation preserves deferred ' +
      'emptiness when slow owner reads cannot yet prove the entity is clear',
    async (t) => {
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => ({success: true, rows: []}),
          executeQuery: async () => ({success: true}),
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [
                  {
                    partitionId: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
                    spreadGap: 1,
                  },
                ],
              },
            };
          },
        },
        systemTableCache: {
          get: () => null,
          getAll: () => [],
          filter: () => [],
        },
      });

      const originalNow = Date.now;
      let nowMs = 1_000;
      Date.now = () => {
        nowMs += 1_100;
        return nowMs;
      };
      try {
        const observation = await repo.getOperationsByEntityAuthoritativeObservation(
          TEST_ENTITY_TYPE,
          TEST_PARTITION_ID,
        );

        t.equal(
          observation?.state,
          'deferred',
          'slow empty owner reads under active priority recovery should stay deferred instead of collapsing to empty',
        );
        t.equal(
          observation?.operationCount,
          0,
          'no fallback rows should remain a deferred empty observation, not a false positive',
        );
        t.equal(
          observation?.deferredOutcome?.source,
          'priority_recovery_entity_operation_empty_read',
          'slow empty reads should preserve the empty-read deferred source',
        );
        t.equal(
          observation?.deferredOutcome?.completionState,
          PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED,
          'slow empty reads should preserve the canonical deferred completion state',
        );
      } finally {
        Date.now = originalNow;
      }
    },
  );

  test(
    'getOperationsByEntityAuthoritativeObservation replaces stale ' +
      'authoritative rows with newer locally owned terminal transition witnesses',
    async (t) => {
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => ({
            success: true,
            rows: [
              makeRow({
                type: OperationType.REPLACE,
                status: TEST_CREATING_STATUS,
                workflow_step: WORKFLOW_STEP.CREATING,
                updated_at: 150,
                completed_at: null,
              }),
            ],
          }),
          executeQuery: async () => ({success: true}),
        },
        systemTableCache: {
          get: () => null,
          getAll: () => [],
          filter: () => [],
        },
      });
      repo.recordOwnerPersistedTransitionVisibilityWitness(
        repo.rowToOperation(makeRow({
          type: OperationType.REPLACE,
          status: TERMINAL_STATUSES.FAILED,
          workflow_step: WORKFLOW_STEP.FAILED,
          updated_at: 200,
          completed_at: 200,
        })),
      );

      const observation = await repo.getOperationsByEntityAuthoritativeObservation(
        TEST_ENTITY_TYPE,
        TEST_PARTITION_ID,
      );

      t.equal(
        observation?.state,
        INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
        'entity visibility should keep the newer locally committed transition visible',
      );
      t.same(
        observation?.operations?.map((operation) => operation.workflowStep),
        [WORKFLOW_STEP.FAILED],
        'entity visibility should supersede the stale creating row with the newer failed transition',
      );
      t.same(
        observation?.operations?.map((operation) => operation.status),
        [TERMINAL_STATUSES.FAILED],
        'the superseded entity row should preserve the terminal status',
      );
    },
  );

  test(
    'queryIncompleteOperations uses the local-safe owner-read path when ' +
      'canonical participation defers only on self query transport',
    async (t) => {
      let readCalls = 0;
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => {
            readCalls += 1;
            return {success: true, rows: []};
          },
          executeQuery: async () => ({success: true}),
        },
        systemTableCache: {
          get: () => null,
          getAll: () => [],
          filter: () => [],
        },
        controlPlaneReadinessService: {
          getControlPlaneParticipationSync(nodeId, options = {}) {
            return {
              nodeId,
              participationKind: options.participationKind || null,
              eligible: false,
              decision: 'defer',
              reasonCode: CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
              reasonCodes: [CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY],
              deferRetry: true,
              localExecutionAllowed: true,
              retryAfterMs: 321,
              errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
              error: 'query ingress owner not ready',
            };
          },
        },
      });
      const operations = await repo.queryIncompleteOperations();

      t.same(
        operations,
        [],
        'local-safe execution should still fail closed to empty owner observations when no rows exist',
      );
      t.equal(readCalls, 1, 'owner read should proceed through the local-safe gateway path');
    },
  );

  test(
    'executeReplicaOperationsRead routes authoritative owner reads through ' +
      'control-plane recovery readiness',
    async (t) => {
      const capturedReads = [];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readAuthoritativeRows: async (tableName, sql, params, options) => {
            capturedReads.push({tableName, sql, params, options});
            return {success: true, rows: []};
          },
        },
      });

      const result = await repo.executeReplicaOperationsRead(
        'SELECT * FROM replica_operations WHERE operation_id = ?',
        [TEST_OPERATION_ID],
      );

      t.equal(
        result.success,
        true,
        'authoritative owner read should still succeed when the gateway read succeeds',
      );
      t.equal(capturedReads.length, 1, 'authoritative owner read should perform one gateway read');
      t.equal(
        capturedReads[0]?.options?.routingReadinessDimension,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        'replica_operations owner reads should route on control-plane recovery readiness',
      );
      t.equal(
        capturedReads[0]?.options?.workClass,
        'critical',
        'replica_operations owner reads should stay on the critical pressure lane',
      );
      t.equal(
        capturedReads[0]?.options?.workloadClass,
        CONTROL_PLANE_WORKLOAD_CLASS.AUTHORITATIVE_OPERATION_VISIBILITY,
        'replica_operations owner reads should emit the shared visibility workload class',
      );
      t.equal(
        capturedReads[0]?.options?.deliveryPriority,
        'critical',
        'replica_operations owner reads should use critical delivery priority',
      );
      t.equal(
        capturedReads[0]?.options?.preferLeader,
        false,
        'replica_operations owner reads should prefer replica routing when the leader may be stopped',
      );
      t.equal(
        capturedReads[0]?.options?.coalescingKey,
        TEST_REPLICA_OPERATION_READ_COALESCING_KEY,
        'operation-id owner reads should coalesce by operation id',
      );
      t.equal(
        capturedReads[0]?.options?.deliverySource,
        TEST_REPLICA_OPERATION_READ_DELIVERY_SOURCE,
        'operation-id owner reads should use an operation-scoped delivery source',
      );
      t.equal(
        capturedReads[0]?.options?.timeoutMs,
        CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
        'generic replica_operations owner reads should keep the shared control-plane timeout budget',
      );
      t.equal(
        capturedReads[0]?.options?.allowPressureDefer,
        false,
        'replica_operations owner reads should not defer under transport pressure',
      );
      t.equal(
        capturedReads[0]?.options?.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
        'replica_operations owner reads should report the canonical local-only read mode',
      );
    },
  );

  test(
    'queryAuthoritativeOperationById uses the cache-preferred visibility ' +
      'read contract when strict owner RPC is not required',
    async (t) => {
      const capturedReads = [];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readAuthoritativeRows: async (tableName, sql, params, options) => {
            capturedReads.push({tableName, sql, params, options});
            return {
              success: true,
              rows: [makeRow()],
            };
          },
        },
      });

      const operation = await repo.queryAuthoritativeOperationById(TEST_OPERATION_ID);

      t.equal(
        operation?.operationId,
        TEST_OPERATION_ID,
        'authoritative visibility reads should still return the matched operation',
      );
      t.equal(
        capturedReads.length,
        1,
        'authoritative visibility reads should perform one gateway read',
      );
      t.equal(
        capturedReads[0]?.options?.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
        'authoritative visibility reads should prefer owner RPC with SQL fallback',
      );
    },
  );

  test(
    'queryAuthoritativeOperationById retries retryable authoritative read ' +
      'failures before returning null',
    async (t) => {
      let readCalls = 0;
      const waitCalls = [];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readAuthoritativeRows: async () => {
            readCalls += 1;
            if (readCalls < 3) {
              return {
                success: false,
                error: 'Distributed operation failed due to participant failures',
                retryAfterMs: 25,
              };
            }
            return {
              success: true,
              rows: [makeRow()],
            };
          },
        },
      });
      repo.waitForReplicaOperationReadRetry = async (delayMs) => {
        waitCalls.push(delayMs);
      };

      const operation = await repo.queryAuthoritativeOperationById(TEST_OPERATION_ID);

      t.equal(
        operation?.operationId,
        TEST_OPERATION_ID,
        'authoritative operation reads should recover after bounded retryable failures',
      );
      t.equal(readCalls, 3, 'authoritative operation reads should retry until one read succeeds');
      t.equal(
        waitCalls.length,
        2,
        'authoritative operation reads should wait between retryable failures',
      );
    },
  );

  test(
    'queryAuthoritativeOperationById retries transaction commit visibility ' +
      'gaps before returning null',
    async (t) => {
      let readCalls = 0;
      const waitCalls = [];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readAuthoritativeRows: async () => {
            readCalls += 1;
            if (readCalls === 1) {
              return {
                success: false,
                error: 'No active transaction to commit',
              };
            }
            return {
              success: true,
              rows: [makeRow()],
            };
          },
        },
      });
      repo.waitForReplicaOperationReadRetry = async (delayMs) => {
        waitCalls.push(delayMs);
      };

      const operation = await repo.queryAuthoritativeOperationById(TEST_OPERATION_ID);

      t.equal(
        operation?.operationId,
        TEST_OPERATION_ID,
        'authoritative reads should recover after a bounded transaction commit visibility gap',
      );
      t.equal(
        readCalls,
        2,
        'transaction commit visibility gaps should trigger one authoritative read retry',
      );
      t.equal(
        waitCalls.length,
        1,
        'authoritative read recovery should wait once before retrying the gap',
      );
    },
  );

  test(
    'getOperationByIdVisibilityObservation preserves deferred cache-backed ' +
      'visibility when priority recovery blocks authoritative reads',
    async (t) => {
      let readCalls = 0;
      const cachedRow = makeRow({
        operation_id: TEST_CACHE_BACKED_VISIBILITY_OPERATION_ID,
        status: TEST_PENDING_STATUS,
        workflow_step: WORKFLOW_STEP.PENDING,
      });
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => {
            readCalls += 1;
            return {
              success: false,
              error: 'Distributed operation failed due to participant failures',
              retryAfterMs: 250,
            };
          },
          executeQuery: async () => ({success: true}),
        },
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [
                  {
                    partitionId: `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`,
                    spreadGap: 1,
                  },
                ],
              },
            };
          },
        },
        systemTableCache: {
          get(tableName, key) {
            return tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === cachedRow.operation_id ?
              cachedRow :
              null;
          },
          getAll() {
            return [cachedRow];
          },
          filter(_tableName, predicate) {
            return [cachedRow].filter(predicate);
          },
        },
      });

      const observation = await repo.getOperationByIdVisibilityObservation(cachedRow.operation_id, {
        allowPriorityRecoveryDeferredVisibility: true,
      });

      t.ok(
        readCalls >= 1,
        'single-operation visibility should still attempt an authoritative read before falling back',
      );
      t.equal(
        observation?.state,
        INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
        'deferred authoritative visibility should keep cache-backed operations visible',
      );
      t.equal(
        observation?.operation?.operationId,
        cachedRow.operation_id,
        'single-operation visibility should fall back to the repository-owned query result',
      );
      t.equal(
        observation?.deferredOutcome?.completionState,
        PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED,
        'single-operation visibility should preserve the canonical deferred completion state',
      );
      t.equal(
        observation?.retryAfterMs,
        250,
        'single-operation visibility should preserve bounded retry guidance',
      );
    },
  );

  test(
    'persistNewOperation keeps a deferred owner-persisted transition visible ' +
      'to later single-operation reads when authoritative confirmation stays empty',
    async (t) => {
      const repo = createTestRepository({
        authoritativeVisibilityTimeoutMs: 0,
        authoritativeVisibilityRetryDelayMs: 123,
        controlPlaneSystemTableGateway: {
          readRows: async () => ({success: true, rows: []}),
          executeQuery: async () => ({success: true, changes: 1}),
        },
        systemTableCache: {
          get: () => null,
          getAll: () => [],
          filter: () => [],
        },
      });
      const operation = repo.rowToOperation(makeRow({
        type: OperationType.REPLACE,
        status: TEST_CREATING_STATUS,
        workflow_step: WORKFLOW_STEP.CREATING,
        updated_at: 200,
      }));

      const persisted = await repo.persistNewOperation(operation);
      const visibilityObservation = await repo.getOperationByIdVisibilityObservation(
        operation.operationId,
      );

      t.equal(
        persisted,
        true,
        'deferred authoritative confirmation should not unwind the persisted insert',
      );
      t.equal(
        visibilityObservation?.state,
        INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
        'later single-operation reads should keep the owner-persisted transition visible',
      );
      t.equal(
        visibilityObservation?.operation?.workflowStep,
        WORKFLOW_STEP.CREATING,
        'the fallback visibility should preserve the owner-persisted workflow step',
      );
      t.equal(
        visibilityObservation?.deferredOutcome?.reasonCode,
        OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
        'the later read should preserve the canonical owner-persisted deferred reason',
      );
      t.equal(
        visibilityObservation?.deferredOutcome?.source,
        OWNER_PERSISTED_TRANSITION_VISIBILITY_EMPTY_READ_SOURCE,
        'the later read should preserve the owner-persisted empty-read source',
      );
    },
  );

  test(
    'persistOperationUpdate keeps a deferred owner-persisted transition visible ' +
      'to later entity observations when authoritative rows stay on an older step',
    async (t) => {
      const repo = createTestRepository({
        authoritativeVisibilityTimeoutMs: 0,
        authoritativeVisibilityRetryDelayMs: 123,
        controlPlaneSystemTableGateway: {
          readRows: async () => ({
            success: true,
            rows: [
              makeRow({
                type: OperationType.REPLACE,
                status: TEST_CREATING_STATUS,
                workflow_step: WORKFLOW_STEP.CREATING,
                updated_at: 150,
              }),
            ],
          }),
          executeQuery: async () => ({success: true, changes: 1}),
        },
        systemTableCache: {
          get: () => null,
          getAll: () => [],
          filter: () => [],
        },
      });
      const operation = repo.rowToOperation(makeRow({
        type: OperationType.REPLACE,
        status: 'active',
        workflow_step: WORKFLOW_STEP.ACTIVE,
        updated_at: 200,
      }));

      const persisted = await repo.persistOperationUpdate(operation);
      const observation = await repo.getOperationsByEntityAuthoritativeObservation(
        TEST_ENTITY_TYPE,
        TEST_PARTITION_ID,
      );

      t.equal(
        persisted,
        true,
        'deferred authoritative confirmation should not unwind the persisted update',
      );
      t.equal(
        observation?.state,
        INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
        'later entity observations should keep the owner-persisted transition visible',
      );
      t.same(
        observation?.operations?.map((entry) => entry.workflowStep),
        [WORKFLOW_STEP.ACTIVE],
        'the entity observation should project the newer owner-persisted workflow step',
      );
    },
  );
}
