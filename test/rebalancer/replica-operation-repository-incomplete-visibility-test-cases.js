export function registerReplicaOperationRepositoryIncompleteVisibilityTests({
  test,
  createTestRepository,
  makeRow,
  TEST_NODE_ID,
  WORKFLOW_STEP,
  SYSTEM_TABLE_NAME,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  OperationType,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
}) {
  test(
    'getIncompleteOperationVisibilityObservation merges cache-visible and ' +
      'authoritative incomplete operations through the repository-owned ' +
      'visibility contract',
    async (t) => {
      let readCalls = 0;
      const cachedRow = makeRow({
        operation_id: 'op-incomplete-cached',
        workflow_step: WORKFLOW_STEP.PENDING,
        updated_at: 100,
      });
      const authoritativeCachedRow = makeRow({
        operation_id: 'op-incomplete-cached',
        workflow_step: WORKFLOW_STEP.SYNCING,
        updated_at: 200,
      });
      const authoritativeNewRow = makeRow({
        operation_id: 'op-incomplete-authoritative',
        replica_id: 'partition-1-r2',
        target_node_id: 'node-3',
        workflow_step: WORKFLOW_STEP.CREATING,
        updated_at: 300,
      });
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => {
            readCalls += 1;
            return {
              success: true,
              rows: [authoritativeCachedRow, authoritativeNewRow],
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

      const observation = await repo.getIncompleteOperationVisibilityObservation({
        cachedOperations: [repo.rowToOperation(cachedRow)],
        visibilitySupplementMode:
          INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE.AUTHORITATIVE_SUPPLEMENT,
      });

      t.equal(
        readCalls,
        1,
        'repository-owned incomplete visibility should still perform one authoritative owner read when cache already sees in-flight work',
      );
      t.equal(
        observation?.state,
        INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
        'repository-owned incomplete visibility should stay present once either visibility source sees in-flight operations',
      );
      t.same(
        observation?.operations.map((operation) => operation.operationId),
        ['op-incomplete-cached', 'op-incomplete-authoritative'],
        'repository-owned incomplete visibility should surface the merged operation cohort',
      );
      t.equal(
        observation?.operations?.[0]?.workflowStep,
        WORKFLOW_STEP.SYNCING,
        'authoritative visibility should win when cache and owner rows describe the same operation',
      );
    },
  );

  test(
    'getIncompleteOperationVisibilityObservation preserves cache-preferred ' +
      'semantics when provided cache-visible work is already present',
    async (t) => {
      let readCalls = 0;
      const cachedRow = makeRow({
        operation_id: 'op-cache-preferred',
        workflow_step: WORKFLOW_STEP.PENDING,
        updated_at: 100,
      });
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readRows: async () => {
            readCalls += 1;
            return {
              success: true,
              rows: [makeRow({operation_id: 'op-authoritative-only'})],
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

      const observation = await repo.getIncompleteOperationVisibilityObservation({
        cachedOperations: [repo.rowToOperation(cachedRow)],
        visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK,
      });

      t.equal(
        readCalls,
        0,
        'cache-preferred incomplete visibility must not add owner-RPC pressure when the cache already sees in-flight work',
      );
      t.equal(
        observation?.state,
        INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
        'cache-preferred incomplete visibility should stay present from the cache-backed observation',
      );
      t.same(
        observation?.operations.map((operation) => operation.operationId),
        ['op-cache-preferred'],
        'cache-preferred incomplete visibility should preserve the cache-backed operation cohort',
      );
    },
  );

  test('queryIncompleteOperations retries retryable authoritative read failures', async (t) => {
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
      systemTableCache: {
        get: () => null,
        getAll: () => [],
        filter: () => [],
      },
    });
    repo.waitForReplicaOperationReadRetry = async (delayMs) => {
      waitCalls.push(delayMs);
    };

    const operations = await repo.queryIncompleteOperations({
      visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
    });

    t.equal(
      operations.length,
      1,
      'authoritative incomplete-operation reads should recover after bounded retry',
    );
    t.equal(
      readCalls,
      3,
      'authoritative incomplete-operation reads should retry until one read succeeds',
    );
    t.equal(
      waitCalls.length,
      2,
      'authoritative incomplete-operation reads should wait between retryable failures',
    );
  });

  test(
    'queryIncompleteOperations uses the cache-preferred visibility read ' +
      'contract when the cache observation is empty',
    async (t) => {
      const capturedReads = [];
      const repo = createTestRepository({
        controlPlaneSystemTableGateway: {
          readAuthoritativeRows: async (tableName, sql, params, options) => {
            capturedReads.push({tableName, sql, params, options});
            return {
              success: true,
              rows: [
                makeRow({
                  type: OperationType.REPLACE,
                  partition_id: 'control_plane_publications-p1',
                  entity_id: 'control_plane_publications-p1',
                  workflow_step: WORKFLOW_STEP.ACTIVE,
                  status: 'active',
                  source_node_id: 'node-a',
                  target_node_id: TEST_NODE_ID,
                }),
              ],
            };
          },
        },
        systemTableCache: {
          get: () => null,
          getAll: () => [],
          filter: () => [],
        },
      });

      const operations = await repo.queryIncompleteOperations();

      t.equal(
        operations.length,
        1,
        'empty cache visibility should still recover the routed authoritative operation',
      );
      t.equal(
        capturedReads.length,
        1,
        'empty cache visibility should issue one authoritative gateway read',
      );
      t.equal(
        capturedReads[0]?.options?.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
        'empty cache visibility should prefer owner RPC with SQL fallback',
      );
    },
  );

  test(
    'buildReplicaOperationReadParticipationFailure evaluates owner reads ' +
      'against control-plane recovery readiness',
    async (t) => {
      const participationCalls = [];
      const repo = createTestRepository({
        controlPlaneReadinessService: {
          getControlPlaneParticipationSync(nodeId, options = {}) {
            participationCalls.push({nodeId, options});
            return {
              nodeId,
              participationKind: options.participationKind || null,
              eligible: true,
              decision: 'ready',
              reasonCode: null,
              reasonCodes: [],
            };
          },
        },
      });

      const participationFailure = repo.buildReplicaOperationReadParticipationFailure();

      t.equal(
        participationFailure,
        null,
        'eligible recovery participation should not synthesize a failure',
      );
      t.equal(participationCalls.length, 1, 'owner-read readiness should be evaluated once');
      t.equal(
        participationCalls[0]?.options?.participationKind,
        CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ,
        'owner-read readiness should preserve the owner-read participation kind',
      );
      t.equal(
        participationCalls[0]?.options?.decisionDimension,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        'owner-read readiness should target control-plane recovery eligibility',
      );
    },
  );

  test(
    'queryIncompleteOperations ignores non-transport participation blocks for ' +
      'owner-local SQL reads',
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
        controlPlaneReadinessService: {
          getControlPlaneParticipationSync(nodeId, options = {}) {
            return {
              nodeId,
              participationKind: options.participationKind || null,
              eligible: false,
              decision: 'blocked',
              reasonCode: CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING,
              reasonCodes: [CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING],
              deferRetry: false,
              retryAfterMs: null,
              errorCode: 'CONTROL_PLANE_PARTICIPATION_BLOCKED',
              error: 'missing node row',
            };
          },
        },
      });

      const operations = await repo.queryIncompleteOperations();

      t.same(
        operations,
        [],
        'owner read should still fail closed to empty results when SQL sees no rows',
      );
      t.equal(
        readCalls,
        1,
        'non-transport readiness blocks should not suppress owner-local SQL reads',
      );
    },
  );
}
