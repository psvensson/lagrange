import {registerReplicaOperationRepositoryTailMoreTests} from './replica-operation-repository-tail-more-test-cases.js';

const OWNER_PERSISTED_TRANSITION_VISIBILITY_RETRYABLE_FAILURE_SOURCE =
  'owner_persisted_transition_authoritative_operation_visibility_retryable_failure';

export function registerReplicaOperationRepositoryTailTests({
  test,
  createTestRepository,
  makeRow,
  TEST_NODE_ID,
  TEST_OPERATION_ID,
  TEST_PARTITION_ID,
  TEST_REPLICA_ID,
  TEST_TARGET_NODE_ID,
  TEST_ENTITY_TYPE,
  TEST_CREATING_STATUS,
  TEST_CACHE_BACKED_VISIBILITY_OPERATION_ID,
  TEST_PENDING_STATUS,
  VISIBILITY_CONFIRMATION_STATE_DEFERRED,
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_VISIBILITY_FAILURE_SOURCE,
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_VISIBILITY_EMPTY_READ_SOURCE,
  OWNER_PERSISTED_TRANSITION_VISIBILITY_EMPTY_READ_SOURCE,
  OWNER_PERSISTED_TRANSITION_VISIBILITY_STALE_READ_SOURCE,
  OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
  ERRORS,
  WORKFLOW_STEP,
  SERVICE_TYPE,
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_WORKLOAD_CLASS,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  PRIORITY_RECOVERY_COMPLETION_REASON,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  OperationType,
  ReplicaOperationRepository,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  TERMINAL_STATUSES,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  READ_MODEL_DIVERGENCE_TYPE,
  SQL_RECONCILIATION_REASON,
  REBALANCE_COORDINATOR_EVENT,
  PARTITION_SERVICE_ERROR_MSG,
  createTestCoordinator,
}) {
  const TEST_REPLICA_OPERATION_WRITE_REPLACE_PENDING_KEY =
    `replica-operation:${TEST_OPERATION_ID}`;

  test('getReplaceTargetReplicaId returns null when same as source', async (t) => {
    const repo = createTestRepository();
    const op = {
      type: OperationType.REPLACE,
      replicaId: 'src-r1',
      sourceReplicaId: 'src-r1',
      stepsHistory: [{sourceReplicaId: 'src-r1'}],
    };
    t.equal(repo.getReplaceTargetReplicaId(op), null);
  });

  test('getReplaceTargetReplicaId returns null when source metadata missing', async (t) => {
    const repo = createTestRepository();
    const op = {
      type: OperationType.REPLACE,
      replicaId: 'tgt-r2',
      stepsHistory: [],
    };
    t.equal(repo.getReplaceTargetReplicaId(op), null);
  });

  test('buildReplicaOperationUpdateData preserves immutable operation context', async (t) => {
    const repo = createTestRepository();
    const operation = {
      operationId: 'op-update-shape',
      type: OperationType.REPLACE,
      partitionId: 'control_plane_publications-p1',
      replicaId: 'control_plane_publications-p1-r4',
      sourceNodeId: 'node-a',
      targetNodeId: 'node-d',
      entityType: SERVICE_TYPE.PARTITION,
      entityId: 'control_plane_publications-p1',
      status: TEST_CREATING_STATUS,
      workflowStep: WORKFLOW_STEP.CREATING,
      updatedAt: 2000,
      completedAt: null,
      errorMessage: null,
      stepsHistory: [
        {
          step: WORKFLOW_STEP.CREATING,
          timestamp: 2000,
        },
      ],
    };

    t.same(
      repo.buildReplicaOperationUpdateData(operation),
      {
        type: OperationType.REPLACE,
        partition_id: 'control_plane_publications-p1',
        source_node_id: 'node-a',
        target_node_id: 'node-d',
        entity_type: SERVICE_TYPE.PARTITION,
        entity_id: 'control_plane_publications-p1',
        status: TEST_CREATING_STATUS,
        workflow_step: WORKFLOW_STEP.CREATING,
        updated_at: 2000,
        completed_at: null,
        error_message: null,
        steps_history: JSON.stringify([
          {
            step: WORKFLOW_STEP.CREATING,
            timestamp: 2000,
          },
        ]),
        replica_id: 'control_plane_publications-p1-r4',
        target_claim_key: null,
      },
      'update payload should preserve immutable context so cache-applied ' +
      'mutations cannot collapse replica_operations rows',
    );
  });

  // ── Cache read methods ──────────────────────────────────────────

  test('getReplicaOperationRowFromCache returns cached row', async (t) => {
    const expectedRow = makeRow();
    const repo = createTestRepository({
      systemTableCache: {
        get(table, key) {
          if (table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS && key === TEST_OPERATION_ID) {
            return expectedRow;
          }
          return null;
        },
        getAll: () => [],
        filter: () => [],
      },
    });

    const result = repo.getReplicaOperationRowFromCache(TEST_OPERATION_ID);
    t.same(result, expectedRow);
  });

  test('getReplicaOperationRowFromCache returns null for missing', async (t) => {
    const repo = createTestRepository();
    const result = repo.getReplicaOperationRowFromCache('nonexistent');
    t.equal(result, null);
  });

  test('filterReplicaOperationRowsFromCache applies predicate', async (t) => {
    const rows = [
      makeRow({operation_id: 'op-1', type: OperationType.ADD}),
      makeRow({operation_id: 'op-2', type: OperationType.REMOVE}),
    ];
    const repo = createTestRepository({
      systemTableCache: {
        get: () => null,
        getAll: () => rows,
        filter(table, predicate) {
          if (table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
            return rows.filter(predicate);
          }
          return [];
        },
      },
    });

    const result = repo.filterReplicaOperationRowsFromCache((row) => row.type === OperationType.ADD);
    t.equal(result.length, 1);
    t.equal(result[0].operation_id, 'op-1');
  });

  test('filterReplicaOperationRowsFromCache returns null without cache', async (t) => {
    const repo = createTestRepository({
      systemTableCache: null,
    });
    // Manually set to null since constructor requires it
    repo.systemTableCache = null;
    const result = repo.filterReplicaOperationRowsFromCache(() => true);
    t.equal(result, null);
  });

  // ── queryOperationById ──────────────────────────────────────────

  test('queryOperationById returns from cache when available', async (t) => {
    const row = makeRow();
    const repo = createTestRepository({
      systemTableCache: {
        get(table, key) {
          if (table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS && key === TEST_OPERATION_ID) {
            return row;
          }
          return null;
        },
        getAll: () => [],
        filter: () => [],
      },
    });

    const op = await repo.queryOperationById(TEST_OPERATION_ID);
    t.equal(op.operationId, TEST_OPERATION_ID);
  });

  test('queryOperationById falls back to SQL when not in cache', async (t) => {
    const row = makeRow();
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({success: true, rows: [row]}),
        executeQuery: async () => ({success: true}),
      },
    });

    const op = await repo.queryOperationById(TEST_OPERATION_ID);
    t.equal(op.operationId, TEST_OPERATION_ID);
  });

  test('queryOperationById returns null for missing operation', async (t) => {
    const repo = createTestRepository();
    const op = await repo.queryOperationById('nonexistent');
    t.equal(op, null);
  });

  // ── persistNewOperation ─────────────────────────────────────────

  test(
    'persistNewOperation uses canonical gateway mutation ingress when ' +
    'available and confirms authoritatively',
    async (t) => {
      const insertedRows = [];
      const authoritativeReads = [];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          cdcIntegrationService: {
            async insertSystemTableRow() {
              return {success: true};
            },
          },
          readRows: async (tableName, sql, params) => {
            authoritativeReads.push({tableName, sql, params});
            return {success: true, rows: [makeRow()]};
          },
          insertSystemTableRow: async (tableName, row, options = {}) => {
            insertedRows.push({tableName, row, options});
            return {success: true, affectedRows: 1};
          },
        },
      });

      const op = repo.rowToOperation(makeRow());
      const result = await repo.persistNewOperation(op);

      t.ok(result, 'should return true on success');
      t.equal(insertedRows.length, 1);
      t.ok(
        insertedRows[0].row.operation_id === TEST_OPERATION_ID,
        'should submit the canonical row shape through the mutation ingress',
      );
      t.equal(
        insertedRows[0]?.options?.skipCacheWait,
        true,
        'canonical mutation ingress should skip cache wait and rely on authoritative confirmation',
      );
      t.equal(
        authoritativeReads.length,
        1,
        'should confirm the write through the authoritative read path',
      );
    },
  );

  test(
    'persistNewOperation emits divergence when projection cache lags ' +
    'a confirmed authoritative row',
    async (t) => {
      const authoritativeReads = [];
      const emittedEvents = [];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async (tableName, sql, params) => {
            authoritativeReads.push({tableName, sql, params});
            return {success: true, rows: [makeRow({updated_at: 200})]};
          },
          executeQuery: async () => ({success: true, changes: 1}),
        },
        emitter: {
          emit(eventName, payload) {
            emittedEvents.push({eventName, payload});
          },
        },
      });

      const op = repo.rowToOperation(makeRow({updated_at: 200}));
      const result = await repo.persistNewOperation(op);

      t.equal(result, true, 'authoritative confirmation should succeed even when projection lags');
      t.equal(
        authoritativeReads.length,
        1,
        'authoritative read should verify the persisted row once',
      );
      t.equal(
        authoritativeReads[0].tableName,
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        'confirmation read should stay scoped to replica_operations',
      );
      t.same(
        authoritativeReads[0].params,
        [TEST_OPERATION_ID],
        'confirmation read should target the persisted operation id',
      );
      t.equal(emittedEvents.length, 1, 'projection lag should emit a divergence event');
      t.equal(emittedEvents[0].eventName, REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE);
      t.equal(emittedEvents[0].payload.divergenceType, READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING);
      t.equal(
        emittedEvents[0].payload.reconciliationReason,
        SQL_RECONCILIATION_REASON.RECOVERY_OPERATION_PERSIST_CONFIRMATION,
      );
    },
  );

  test('persistNewOperation accepts retryable mutation failures when one authoritative proof confirms the row', async (t) => {
    let readCalls = 0;
    const participantFailure = {
      error: 'query_admission_deferred',
      errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
      retryAfterMs: 250,
      deferRetry: true,
      failedTable: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    };
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        cdcIntegrationService: {
          async insertSystemTableRow() {
            return {success: true};
          },
        },
        insertSystemTableRow: async () => ({
          success: false,
          error: 'query_admission_deferred',
          errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
          firstFailedParticipant: participantFailure,
          participantFailures: [participantFailure],
        }),
        readRows: async () => {
          readCalls += 1;
          return {success: true, rows: [makeRow({updated_at: 200})]};
        },
      },
    });

    const op = repo.rowToOperation(makeRow({updated_at: 200}));
    const result = await repo.persistNewOperation(op);

    t.equal(
      result,
      true,
      'a retryable mutation failure should not fail hard once the authoritative row is visible',
    );
    t.equal(
      readCalls,
      1,
      'the repository should attempt one authoritative proof before accepting the recovered write',
    );
  });

  test(
    'persistNewOperation preserves one canonical deferred confirmation ' +
    'outcome when an owner-persisted transition keeps authoritative visibility empty',
    async (t) => {
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => ({success: true, rows: []}),
          executeQuery: async () => ({success: true, changes: 1}),
        },
        authoritativeVisibilityTimeoutMs: 0,
      });

      const op = repo.rowToOperation(makeRow({updated_at: 200}));
      const result = await repo.persistNewOperation(op);
      const outcome = repo.getLastAuthoritativeOperationVisibilityOutcome();

      t.equal(
        result,
        true,
        'a recent owner-persisted insert should defer instead of failing hard on one empty authoritative read boundary',
      );
      t.equal(
        outcome?.confirmationState,
        VISIBILITY_CONFIRMATION_STATE_DEFERRED,
        'the repository should preserve the canonical deferred visibility state',
      );
      t.equal(
        outcome?.reasonCode,
        OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
        'the deferred outcome should identify the owner-persisted transition confirmation reason',
      );
      t.equal(
        outcome?.source,
        OWNER_PERSISTED_TRANSITION_VISIBILITY_EMPTY_READ_SOURCE,
        'the deferred outcome should distinguish the owner-persisted empty-read source',
      );
    },
  );

  test(
    'persistNewOperation preserves one canonical deferred confirmation ' +
    'outcome when an owner-persisted transition hits a retryable authoritative owner read during priority recovery',
    async (t) => {
      let readCalls = 0;
      const repo = createTestRepository({
        authoritativeVisibilityTimeoutMs: 0,
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
          executeQuery: async () => ({success: true, changes: 1}),
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
      });

      const op = repo.rowToOperation(
        makeRow({
          type: OperationType.ADD,
          partition_id: `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`,
          status: 'pending',
          workflow_step: WORKFLOW_STEP.PENDING,
        }),
      );

      const result = await repo.persistNewOperation(op);
      const outcome = repo.getLastAuthoritativeOperationVisibilityOutcome();

      t.equal(
        result,
        true,
        'successful writes should not fail hard when confirmation is canonically deferred',
      );
      t.ok(
        readCalls >= 1,
        'the repository should still attempt the authoritative confirmation read before deferring',
      );
      t.equal(
        outcome?.confirmationState,
        VISIBILITY_CONFIRMATION_STATE_DEFERRED,
        'the repository should preserve one canonical deferred visibility state',
      );
      t.equal(
        outcome?.completionState,
        null,
        'owner-persisted transition confirmation should stay on its canonical deferred state even while priority recovery is active',
      );
      t.equal(
        outcome?.reasonCode,
        OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
        'the deferred outcome should preserve the owner-persisted transition confirmation reason',
      );
      t.equal(
        outcome?.retryAfterMs,
        250,
        'the deferred outcome should preserve bounded retry guidance',
      );
      t.equal(
        outcome?.operationId,
        TEST_OPERATION_ID,
        'the deferred outcome should stay scoped to the persisted operation',
      );
      t.equal(
        outcome?.source,
        OWNER_PERSISTED_TRANSITION_VISIBILITY_RETRYABLE_FAILURE_SOURCE,
        'the deferred outcome should preserve the owner-persisted retryable read-failure source',
      );
    },
  );

  test(
    'persistNewOperation preserves one canonical deferred confirmation ' +
    'outcome when an owner-persisted transition keeps authoritative visibility empty during priority recovery',
    async (t) => {
      const repo = createTestRepository({
        authoritativeVisibilityTimeoutMs: 0,
        controlPlaneSystemTableGateway: {
          readRows: async () => ({success: true, rows: []}),
          executeQuery: async () => ({success: true, changes: 1}),
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
      });

      const op = repo.rowToOperation(
        makeRow({
          type: OperationType.REPLACE,
          partition_id: `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`,
          status: 'pending',
          workflow_step: WORKFLOW_STEP.PENDING,
        }),
      );

      const result = await repo.persistNewOperation(op);
      const outcome = repo.getLastAuthoritativeOperationVisibilityOutcome();

      t.equal(
        result,
        true,
        'empty authoritative visibility under active priority recovery should stay deferred',
      );
      t.equal(
        outcome?.confirmationState,
        VISIBILITY_CONFIRMATION_STATE_DEFERRED,
        'empty visibility should still preserve the canonical deferred state',
      );
      t.equal(
        outcome?.reasonCode,
        OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
        'empty visibility should still preserve the owner-persisted transition confirmation reason',
      );
      t.equal(
        outcome?.source,
        OWNER_PERSISTED_TRANSITION_VISIBILITY_EMPTY_READ_SOURCE,
        'the deferred outcome should distinguish the owner-persisted empty-read confirmation source',
      );
    },
  );

  test(
    'persistNewOperation keeps owner-persisted incomplete operations ' +
    'visible while priority recovery defers later owner reads',
    async (t) => {
      let incompleteReadCalls = 0;
      const repo = createTestRepository({
        authoritativeVisibilityTimeoutMs: 0,
        controlPlaneSystemTableGateway: {
          readRows: async (_tableName, sql) => {
            const normalizedSql = String(sql);
            if (normalizedSql.includes('WHERE operation_id = ?')) {
              return {success: true, rows: []};
            }
            if (
              normalizedSql.includes('source_node_id = ?') &&
            normalizedSql.includes('target_node_id = ?')
            ) {
              incompleteReadCalls += 1;
              return {
                success: false,
                error: 'Distributed operation failed due to participant failures',
                errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
                retryAfterMs: 250,
              };
            }
            return {success: true, rows: []};
          },
          executeQuery: async () => ({success: true, changes: 1}),
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
          getAll: () => [],
          filter: () => [],
        },
      });

      const op = repo.rowToOperation(
        makeRow({
          type: OperationType.ADD,
          partition_id: `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`,
          status: 'pending',
          workflow_step: WORKFLOW_STEP.PENDING,
          updated_at: 200,
        }),
      );

      const persistResult = await repo.persistNewOperation(op);
      const operations = await repo.queryIncompleteOperations({
        visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      const outcome = repo.getLastIncompleteOperationReadOutcome();

      t.equal(
        persistResult,
        true,
        'deferred confirmation should still preserve the owner-persisted operation',
      );
      t.ok(
        incompleteReadCalls >= 1,
        'the repository should still attempt authoritative incomplete-operation reads before deferring',
      );
      t.same(
        operations.map((operation) => operation.operationId),
        [op.operationId],
        'deferred owner reads should fall back to the owner-persisted incomplete operation set',
      );
      t.equal(
        outcome?.fallbackOperationCount,
        1,
        'the deferred outcome should report the persisted fallback operation count',
      );
    },
  );

  test(
    'persistNewOperation retries authoritative confirmation after an ' + 'initial miss',
    async (t) => {
      let readRowsCalls = 0;
      const repo = createTestRepository({
        authoritativeVisibilityTimeoutMs: 10,
        authoritativeVisibilityRetryDelayMs: 0,
        controlPlaneSystemTableGateway: {
          readRows: async () => {
            readRowsCalls += 1;
            if (readRowsCalls === 1) {
              return {success: true, rows: []};
            }
            return {success: true, rows: [makeRow({updated_at: 200})]};
          },
          executeQuery: async () => ({success: true, changes: 1}),
        },
      });

      const op = repo.rowToOperation(makeRow({updated_at: 200}));
      const result = await repo.persistNewOperation(op);

      t.equal(
        result,
        true,
        'bounded authoritative retries should recover visibility after transient lag',
      );
      t.equal(readRowsCalls, 2, 'authoritative confirmation should retry until the row is visible');
    },
  );

  test('persistNewOperation confirmation stays on the local owner path', async (t) => {
    const readRowsCalls = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async (_tableName, _sql, _params, options = {}) => {
          readRowsCalls.push(options);
          return {
            success: true,
            rows: [makeRow({updated_at: 200})],
          };
        },
        executeQuery: async () => ({success: true, changes: 1}),
      },
    });

    const op = repo.rowToOperation(makeRow({updated_at: 200}));
    const result = await repo.persistNewOperation(op);

    t.equal(result, true, 'authoritative confirmation should succeed from the local owner path');
    t.equal(readRowsCalls.length, 1, 'confirmation should issue one authoritative read');
    t.equal(
      readRowsCalls[0]?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      'confirmation should report the canonical local-only read mode',
    );
  });

  test(
    'persistOperationUpdate uses canonical gateway mutation ingress when ' + 'available',
    async (t) => {
      const gatewayMutations = [];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          cdcIntegrationService: {
            async updateSystemTableRow() {
              return {success: true};
            },
          },
          readRows: async () => ({success: true, rows: [makeRow()]}),
          updateSystemTableRow: async (tableName, whereClause, data, options = {}) => {
            gatewayMutations.push({tableName, whereClause, data, options});
            return {success: true, affectedRows: 1};
          },
        },
      });

      const op = repo.rowToOperation(makeRow());
      await repo.persistOperationUpdate(op);

      t.equal(gatewayMutations.length, 1);
      t.equal(gatewayMutations[0].tableName, SYSTEM_TABLE_NAME.REPLICA_OPERATIONS);
      t.same(
        gatewayMutations[0].whereClause,
        {operation_id: TEST_OPERATION_ID},
        'should update the canonical operation row by primary key',
      );
      t.equal(
        gatewayMutations[0].data.workflow_step,
        WORKFLOW_STEP.CREATING,
        'should pass the workflow fields through the canonical mutation ingress',
      );
      t.equal(
        gatewayMutations[0]?.options?.mergePolicy,
        CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
        'should replace older pending writes for the same operation row',
      );
      t.equal(
        gatewayMutations[0]?.options?.skipCacheWait,
        true,
        'canonical mutation ingress should skip cache wait and rely on authoritative confirmation',
      );
      t.equal(
        gatewayMutations[0]?.options?.workloadClass,
        CONTROL_PLANE_WORKLOAD_CLASS.REPLICA_OPERATION_MUTATION,
        'replica_operations mutations should emit the shared mutation workload class',
      );
      t.equal(
        gatewayMutations[0]?.options?.replacePendingKey,
        TEST_REPLICA_OPERATION_WRITE_REPLACE_PENDING_KEY,
        'replica_operations mutations should replace stale queued router writes by operation id',
      );
    },
  );

  test(
    'persistOperationUpdate falls back to raw query mutations for reduced ' + 'gateway stubs',
    async (t) => {
      const executedQueries = [];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => ({success: true, rows: [makeRow()]}),
          executeQuery: async (sql, params, options = {}) => {
            executedQueries.push({sql, params, options});
            return {success: true};
          },
        },
      });

      const op = repo.rowToOperation(makeRow());
      await repo.persistOperationUpdate(op);

      t.equal(executedQueries.length, 1);
      t.ok(
        executedQueries[0].sql.includes('UPDATE'),
        'fallback stubs should continue to use the raw query path',
      );
    },
  );

  test(
    'runReplicaOperationTransitionExclusive keeps priority control-plane ' +
    'transitions off the ordinary transition lane',
    async (t) => {
      const repo = createTestRepository();
      const executionOrder = [];
      let releaseOrdinaryTransition = null;
      const ordinaryTransitionBlocked = new Promise((resolve) => {
        releaseOrdinaryTransition = resolve;
      });

      const ordinaryPromise = repo.runReplicaOperationTransitionExclusive(
        async () => {
          executionOrder.push('ordinary-start');
          await ordinaryTransitionBlocked;
          executionOrder.push('ordinary-end');
          return 'ordinary';
        },
        {
          partitionId: 'user-data-p17',
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      const priorityPromise = repo.runReplicaOperationTransitionExclusive(
        async () => {
          executionOrder.push('priority-start');
          return 'priority';
        },
        {
          partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      t.same(
        executionOrder,
        ['ordinary-start', 'priority-start'],
        'priority control-plane transitions should start before unrelated ordinary transitions finish',
      );

      releaseOrdinaryTransition();

      const [ordinaryResult, priorityResult] = await Promise.all([ordinaryPromise, priorityPromise]);
      t.equal(ordinaryResult, 'ordinary');
      t.equal(priorityResult, 'priority');
    },
  );

  test('persistOperationUpdate forwards the enclosing timeout budget', async (t) => {
    const executedQueries = [];
    const timeoutBudget = {
      configuredBudgetMs: 1000,
      startedAtMs: 1000,
      deadlineMs: 2000,
      operationName: 'transaction',
    };
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({success: true, rows: [makeRow()]}),
        executeQuery: async (_sql, _params, options = {}) => {
          executedQueries.push(options);
          return {success: true};
        },
      },
    });

    const op = repo.rowToOperation(makeRow());
    await repo.persistOperationUpdate(op, {timeoutBudget});

    t.equal(executedQueries.length, 1, 'persistOperationUpdate should issue one mutation');
    t.equal(
      executedQueries[0].timeoutBudget,
      timeoutBudget,
      'persistOperationUpdate should preserve the enclosing timeout budget on the mutation query',
    );
  });


  registerReplicaOperationRepositoryTailMoreTests({
    test,
    createTestRepository,
    makeRow,
    TEST_NODE_ID,
    TEST_OPERATION_ID,
    TEST_PARTITION_ID,
    TEST_REPLICA_ID,
    TEST_TARGET_NODE_ID,
    TEST_ENTITY_TYPE,
    TEST_CREATING_STATUS,
    TEST_CACHE_BACKED_VISIBILITY_OPERATION_ID,
    TEST_PENDING_STATUS,
    VISIBILITY_CONFIRMATION_STATE_DEFERRED,
    PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_VISIBILITY_FAILURE_SOURCE,
    PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_VISIBILITY_EMPTY_READ_SOURCE,
    OWNER_PERSISTED_TRANSITION_VISIBILITY_EMPTY_READ_SOURCE,
    OWNER_PERSISTED_TRANSITION_VISIBILITY_STALE_READ_SOURCE,
    OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
    ERRORS,
    WORKFLOW_STEP,
    SERVICE_TYPE,
    INITIAL_PARTITION_IDS,
    SYSTEM_TABLE_NAME,
    CONTROL_PLANE_PARTICIPATION_KIND,
    CONTROL_PLANE_READINESS_DIMENSION,
    CONTROL_PLANE_READINESS_REASON,
    CONTROL_PLANE_WORKLOAD_CLASS,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    CONTROL_PLANE_MUTATION_MERGE_POLICY,
    PRIORITY_RECOVERY_COMPLETION_REASON,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    OperationType,
    ReplicaOperationRepository,
    REPLICA_OPERATION_SEMANTIC_PHASE,
    TERMINAL_STATUSES,
    INCOMPLETE_OPERATION_OBSERVATION_STATE,
    INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE,
    REPLICA_OPERATION_VISIBILITY_READ_MODE,
    READ_MODEL_DIVERGENCE_TYPE,
    SQL_RECONCILIATION_REASON,
    REBALANCE_COORDINATOR_EVENT,
    PARTITION_SERVICE_ERROR_MSG,
    createTestCoordinator,
  });
}
