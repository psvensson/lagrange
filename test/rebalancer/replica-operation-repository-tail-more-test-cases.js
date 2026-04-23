export function registerReplicaOperationRepositoryTailMoreTests({
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
const TEST_REPLICA_OPERATION_MUTATION_QUERY_TIMEOUT_MS = 15000;
const OWNER_PERSISTED_TRANSITION_VISIBILITY_RETRYABLE_FAILURE_SOURCE =
  'owner_persisted_transition_authoritative_operation_visibility_retryable_failure';
const TEST_RETRYABLE_CONFIRMATION_ERROR = 'Message timeout';
const TEST_RETRYABLE_CONFIRMATION_RETRY_AFTER_MS = 250;

test('persistOperationUpdate accepts retryable mutation failures when one authoritative proof confirms the updated row', async (t) => {
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
        async updateSystemTableRow() {
          return {success: true};
        },
      },
      updateSystemTableRow: async () => ({
        success: false,
        error: 'query_admission_deferred',
        errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
        firstFailedParticipant: participantFailure,
        participantFailures: [participantFailure],
      }),
      readRows: async () => {
        readCalls += 1;
        return {
          success: true,
          rows: [
            makeRow({
              status: 'active',
              workflow_step: 'ACTIVE',
              updated_at: 200,
            }),
          ],
        };
      },
    },
  });

  const op = repo.rowToOperation(
    makeRow({
      status: 'active',
      workflow_step: 'ACTIVE',
      updated_at: 200,
    }),
  );

  await repo.persistOperationUpdate(op);

  t.equal(
    readCalls,
    1,
    'the repository should attempt one authoritative proof before accepting the recovered update',
  );
});

test(
  'persistOperationUpdate preserves structured retry metadata on ' + 'thrown participant failures',
  async (t) => {
    const participantFailure = {
      error: 'control_plane_pressure_degraded',
      errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
      retryAfterMs: 250,
      deferRetry: true,
      failedTable: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    };
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        executeQuery: async () => ({
          success: false,
          error: 'Query execution failed',
          errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
          firstFailedParticipant: participantFailure,
          participantFailures: [participantFailure],
        }),
      },
    });

    const op = repo.rowToOperation(makeRow());

    try {
      await repo.persistOperationUpdate(op);
      t.fail('persistOperationUpdate should throw the mutation failure');
    } catch (error) {
      t.equal(error.message, 'Query execution failed');
      t.equal(
        error.errorCode,
        'DISTRIBUTED_PARTICIPANT_FAILURE',
        'top-level error code should be preserved on the thrown error',
      );
      t.equal(
        error.retryAfterMs,
        250,
        'nested retry-after hints should survive the repository throw boundary',
      );
      t.equal(
        error.deferRetry,
        true,
        'nested defer markers should survive the repository throw boundary',
      );
      t.equal(
        error.firstFailedParticipant?.errorCode,
        'CONTROL_PLANE_PRESSURE_DEGRADED',
        'first failed participant metadata should remain available to callers',
      );
      t.equal(
        error.participantFailures?.length,
        1,
        'participant failure details should remain available to callers',
      );
    }
  },
);

test(
  'persistOperationUpdate retries deferred canonical mutation ingress ' +
    'failures when the first authoritative proof is still empty',
  async (t) => {
    let updateCalls = 0;
    let readCalls = 0;
    let waitCalls = 0;
    const updatedAt = Date.now() + 1000;
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
          async updateSystemTableRow() {
            return {success: true};
          },
        },
        updateSystemTableRow: async () => {
          updateCalls += 1;
          if (updateCalls === 1) {
            return {
              success: false,
              error: 'query_admission_deferred',
              errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
              firstFailedParticipant: participantFailure,
              participantFailures: [participantFailure],
            };
          }
          return {success: true, changes: 1};
        },
        readRows: async () => {
          readCalls += 1;
          if (readCalls === 1) {
            return {success: true, rows: []};
          }
          return {
            success: true,
            rows: [
              makeRow({
                status: 'active',
                workflow_step: 'ACTIVE',
                updated_at: updatedAt,
              }),
            ],
          };
        },
      },
    });
    repo.waitForOperationPersistRetry = async () => {
      waitCalls += 1;
    };

    const op = repo.rowToOperation(
      makeRow({
        status: 'active',
        workflow_step: 'ACTIVE',
        updated_at: updatedAt,
      }),
    );

    await repo.persistOperationUpdate(op);

    t.equal(
      updateCalls,
      2,
      'canonical update ingress should retry when the first deferred failure cannot yet be proven',
    );
    t.equal(
      waitCalls,
      1,
      'the repository should wait once before retrying the deferred canonical update',
    );
    t.equal(readCalls, 2, 'the repository should re-prove visibility after the retry succeeds');
  },
);

test(
  'persistNewOperation retries deferred canonical mutation ingress ' +
    'failures when the first authoritative proof is still empty',
  async (t) => {
    let insertCalls = 0;
    let readCalls = 0;
    let waitCalls = 0;
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
        insertSystemTableRow: async () => {
          insertCalls += 1;
          if (insertCalls === 1) {
            return {
              success: false,
              error: 'query_admission_deferred',
              errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
              firstFailedParticipant: participantFailure,
              participantFailures: [participantFailure],
            };
          }
          return {success: true, changes: 1};
        },
        readRows: async () => {
          readCalls += 1;
          if (readCalls === 1) {
            return {success: true, rows: []};
          }
          return {
            success: true,
            rows: [makeRow()],
          };
        },
      },
    });
    repo.waitForOperationPersistRetry = async () => {
      waitCalls += 1;
    };

    const op = repo.rowToOperation(makeRow());

    await repo.persistNewOperation(op);

    t.equal(
      insertCalls,
      2,
      'canonical insert ingress should retry when the first deferred failure cannot yet be proven',
    );
    t.equal(
      waitCalls,
      1,
      'the repository should wait once before retrying the deferred canonical insert',
    );
    t.equal(readCalls, 2, 'the repository should re-prove visibility after the retry succeeds');
  },
);

test(
  'buildOperationPersistError marks retryable workflow participant lookup ' +
    'failures for deferred retry',
  async (t) => {
    const repo = createTestRepository({
      random: () => 0,
    });

    const error = repo.buildOperationPersistError({
      success: false,
      error: 'Workflow participant replica_operations-p1 not found',
      errorCode: 'INTERNAL_ERROR',
    });

    t.equal(error.message, 'Workflow participant replica_operations-p1 not found');
    t.equal(
      error.deferRetry,
      true,
      'retryable participant lookup failures should be surfaced as deferred retries',
    );
    t.equal(
      error.retryAfterMs,
      250,
      'repository should surface the bounded retry delay for owner-lane retries',
    );
  },
);

test(
  'persistOperationUpdate fails when authoritative confirmation ' +
    'does not reflect workflow step/status',
  async (t) => {
    const repo = createTestRepository({
      authoritativeVisibilityTimeoutMs: 0,
      controlPlaneSystemTableGateway: {
        readRows: async () => ({
          success: true,
          rows: [
            makeRow({
              status: 'creating',
              workflow_step: 'CREATING',
              updated_at: 999,
            }),
          ],
        }),
        executeQuery: async () => ({success: true, changes: 1}),
      },
    });

    const op = repo.rowToOperation(
      makeRow({
        status: 'active',
        workflow_step: 'ACTIVE',
        updated_at: 200,
      }),
    );

    await t.rejects(
      repo.persistOperationUpdate(op),
      /Authoritative replica operation not confirmed/,
      'step/status mismatches must fail persistence confirmation',
    );
  },
);

test(
  'persistOperationUpdate preserves one canonical deferred confirmation ' +
    'outcome when an owner-persisted transition hits a retryable authoritative confirmation failure',
  async (t) => {
    const repo = createTestRepository({
      authoritativeVisibilityTimeoutMs: 0,
      controlPlaneSystemTableGateway: {
        readRows: async () => ({
          success: false,
          error: TEST_RETRYABLE_CONFIRMATION_ERROR,
          retryAfterMs: TEST_RETRYABLE_CONFIRMATION_RETRY_AFTER_MS,
        }),
        executeQuery: async () => ({success: true, changes: 1}),
      },
    });

    const op = repo.rowToOperation(
      makeRow({
        status: 'active',
        workflow_step: 'ACTIVE',
        updated_at: 200,
      }),
    );

    const result = await repo.persistOperationUpdate(op);
    const outcome = repo.getLastAuthoritativeOperationVisibilityOutcome();

    t.equal(
      result,
      true,
      'a recent owner-persisted transition should defer instead of failing hard on one retryable authoritative confirmation failure',
    );
    t.equal(
      outcome?.confirmationState,
      VISIBILITY_CONFIRMATION_STATE_DEFERRED,
      'the repository should preserve the canonical deferred visibility state for retryable authoritative confirmation failures',
    );
    t.equal(
      outcome?.completionState,
      null,
      'owner-persisted confirmation deferral should not depend on priority-recovery completion state',
    );
    t.equal(
      outcome?.reasonCode,
      OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
      'the deferred outcome should keep the owner-persisted transition confirmation reason on retryable authoritative failures',
    );
    t.equal(
      outcome?.retryAfterMs,
      TEST_RETRYABLE_CONFIRMATION_RETRY_AFTER_MS,
      'the deferred outcome should preserve bounded retry guidance from the retryable authoritative failure',
    );
    t.equal(
      outcome?.operationId,
      TEST_OPERATION_ID,
      'the deferred retryable-failure outcome should stay scoped to the updated operation',
    );
    t.equal(
      outcome?.source,
      OWNER_PERSISTED_TRANSITION_VISIBILITY_RETRYABLE_FAILURE_SOURCE,
      'the deferred outcome should distinguish retryable authoritative failures from empty or stale owner-persisted confirmation reads',
    );
  },
);

test(
  'persistOperationUpdate preserves one canonical deferred confirmation ' +
    'outcome when an owner-persisted transition keeps authoritative visibility empty',
  async (t) => {
    const authoritativeVisibilityRetryDelayMs = 123;
    const repo = createTestRepository({
      authoritativeVisibilityTimeoutMs: 0,
      authoritativeVisibilityRetryDelayMs,
      controlPlaneSystemTableGateway: {
        readRows: async () => ({success: true, rows: []}),
        executeQuery: async () => ({success: true, changes: 1}),
      },
    });

    const op = repo.rowToOperation(
      makeRow({
        status: 'active',
        workflow_step: 'ACTIVE',
        updated_at: 200,
      }),
    );

    const result = await repo.persistOperationUpdate(op);
    const outcome = repo.getLastAuthoritativeOperationVisibilityOutcome();

    t.equal(
      result,
      true,
      'a recent owner-persisted transition should defer instead of failing hard on one empty authoritative read boundary',
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
      outcome?.retryAfterMs,
      authoritativeVisibilityRetryDelayMs,
      'the deferred outcome should preserve the bounded owner visibility retry guidance',
    );
    t.equal(
      outcome?.operationId,
      TEST_OPERATION_ID,
      'the deferred outcome should stay scoped to the updated operation',
    );
    t.equal(
      outcome?.source,
      OWNER_PERSISTED_TRANSITION_VISIBILITY_EMPTY_READ_SOURCE,
      'the deferred outcome should distinguish the owner-persisted empty-read source',
    );
  },
);

test(
  'persistOperationUpdate preserves one canonical deferred confirmation ' +
    'outcome when an owner-persisted transition sees the same row on an older authoritative step',
  async (t) => {
    const authoritativeVisibilityRetryDelayMs = 123;
    const repo = createTestRepository({
      authoritativeVisibilityTimeoutMs: 0,
      authoritativeVisibilityRetryDelayMs,
      controlPlaneSystemTableGateway: {
        readRows: async () => ({
          success: true,
          rows: [
            makeRow({
              status: 'creating',
              workflow_step: 'CREATING',
              updated_at: 150,
            }),
          ],
        }),
        executeQuery: async () => ({success: true, changes: 1}),
      },
    });

    const op = repo.rowToOperation(
      makeRow({
        status: 'active',
        workflow_step: 'ACTIVE',
        updated_at: 200,
      }),
    );

    const result = await repo.persistOperationUpdate(op);
    const outcome = repo.getLastAuthoritativeOperationVisibilityOutcome();

    t.equal(
      result,
      true,
      'an older authoritative row for the same owner-persisted transition should defer instead of failing hard',
    );
    t.equal(
      outcome?.confirmationState,
      VISIBILITY_CONFIRMATION_STATE_DEFERRED,
      'the repository should preserve the canonical deferred visibility state for stale authoritative rows',
    );
    t.equal(
      outcome?.reasonCode,
      OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
      'the deferred outcome should keep the owner-persisted transition confirmation reason',
    );
    t.equal(
      outcome?.retryAfterMs,
      authoritativeVisibilityRetryDelayMs,
      'the deferred outcome should preserve bounded retry guidance for stale authoritative rows',
    );
    t.equal(
      outcome?.operationId,
      TEST_OPERATION_ID,
      'the deferred stale-row outcome should stay scoped to the updated operation',
    );
    t.equal(
      outcome?.source,
      OWNER_PERSISTED_TRANSITION_VISIBILITY_STALE_READ_SOURCE,
      'the deferred outcome should distinguish stale authoritative rows from empty reads',
    );
  },
);

test(
  'persistOperationUpdate still fails when a later authoritative mismatch ' +
    'follows an earlier empty-read deferral candidate',
  async (t) => {
    let readCalls = 0;
    const repo = createTestRepository({
      authoritativeVisibilityTimeoutMs: 10,
      authoritativeVisibilityRetryDelayMs: 0,
      controlPlaneSystemTableGateway: {
        readRows: async () => {
          readCalls += 1;
          if (readCalls === 1) {
            return {success: true, rows: []};
          }
          return {
            success: true,
            rows: [
              makeRow({
                status: 'creating',
                workflow_step: 'CREATING',
                updated_at: 999,
              }),
            ],
          };
        },
        executeQuery: async () => ({success: true, changes: 1}),
      },
    });
    repo.waitForReplicaOperationVisibilityRetry = async () => {};

    const op = repo.rowToOperation(
      makeRow({
        status: 'active',
        workflow_step: 'ACTIVE',
        updated_at: 200,
      }),
    );

    await t.rejects(
      repo.persistOperationUpdate(op),
      /Authoritative replica operation not confirmed/,
      'a mismatched authoritative row must override any earlier empty-read deferral candidate',
    );
    t.equal(
      repo.getLastAuthoritativeOperationVisibilityOutcome(),
      null,
      'mismatch-driven failures should not preserve a deferred visibility outcome',
    );
  },
);

test(
  'persistOperationUpdate retries stale no-handler owner handoff errors ' +
    'and confirms the updated row authoritatively',
  async (t) => {
    let executeCalls = 0;
    let waitCalls = 0;
    const updatedAt = Date.now() + 1000;
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({
          success: true,
          rows: [
            makeRow({
              status: 'active',
              workflow_step: 'ACTIVE',
              updated_at: updatedAt,
            }),
          ],
        }),
        executeQuery: async () => {
          executeCalls += 1;
          if (executeCalls === 1) {
            return {
              success: false,
              error:
                `${ERRORS.NO_HANDLER_FOR_ADDRESS} ` + 'node-1/partition/replica_operations-p1-r1',
            };
          }
          return {success: true, changes: 1};
        },
      },
    });
    repo.waitForOperationPersistRetry = async () => {
      waitCalls += 1;
    };

    const op = repo.rowToOperation(
      makeRow({
        status: 'active',
        workflow_step: 'ACTIVE',
        updated_at: updatedAt,
      }),
    );

    await repo.persistOperationUpdate(op);

    t.equal(
      executeCalls,
      2,
      'persistOperationUpdate should retry one stale no-handler owner handoff failure',
    );
    t.equal(waitCalls, 1, 'persistOperationUpdate should wait once before the retry succeeds');
  },
);

test('executeOperationMutationWithRetry retries no-handler owner handoff errors', async (t) => {
  let attempts = 0;
  let waitCalls = 0;
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      executeQuery: async () => {
        attempts += 1;
        if (attempts === 1) {
          return {
            success: false,
            error:
              `${ERRORS.NO_HANDLER_FOR_ADDRESS} ` + 'node-1/partition/replica_operations-p1-r1',
          };
        }
        return {success: true, changes: 1};
      },
    },
  });
  repo.waitForOperationPersistRetry = async () => {
    waitCalls += 1;
  };

  const result = await repo.executeOperationMutationWithRetry(
    'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
    [Date.now(), TEST_OPERATION_ID],
    {ownerId: TEST_OPERATION_ID},
  );

  t.equal(result.success, true, 'no-handler owner handoff errors should be retried');
  t.equal(attempts, 2, 'repository should retry once after no-handler owner handoff');
  t.equal(waitCalls, 1, 'retry loop should wait exactly once before succeeding');
});

test(
  'executeOperationMutationWithRetry retries workflow participant ' + 'lookup gaps',
  async (t) => {
    let attempts = 0;
    let waitCalls = 0;
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        executeQuery: async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              success: false,
              error: 'Workflow participant replica_operations-p1 not found',
              errorCode: 'INTERNAL_ERROR',
            };
          }
          return {success: true, changes: 1};
        },
      },
    });
    repo.waitForOperationPersistRetry = async () => {
      waitCalls += 1;
    };

    const result = await repo.executeOperationMutationWithRetry(
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
      [Date.now(), TEST_OPERATION_ID],
      {ownerId: TEST_OPERATION_ID},
    );

    t.equal(result.success, true, 'workflow participant lookup gaps should be retried');
    t.equal(attempts, 2, 'repository should retry once after a retryable participant lookup gap');
    t.equal(
      waitCalls,
      1,
      'retry loop should wait exactly once before retrying the participant gap',
    );
  },
);

test('executeOperationMutationWithRetry retries control-plane admission defers', async (t) => {
  let attempts = 0;
  let waitCalls = 0;
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      executeQuery: async () => {
        attempts += 1;
        if (attempts === 1) {
          return {
            success: false,
            error: 'query_admission_deferred',
            reasonCode: 'transport_backpressure',
            retryAfterMs: 250,
            deferRetry: true,
          };
        }
        return {success: true, changes: 1};
      },
    },
  });
  repo.waitForOperationPersistRetry = async () => {
    waitCalls += 1;
  };

  const result = await repo.executeOperationMutationWithRetry(
    'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
    [Date.now(), TEST_OPERATION_ID],
    {ownerId: TEST_OPERATION_ID},
  );

  t.equal(result.success, true, 'retryable control-plane admission defers should be retried');
  t.equal(attempts, 2, 'repository should retry once after a retryable admission defer');
  t.equal(waitCalls, 1, 'retry loop should wait exactly once before retrying the defer');
});

test(
  'executeOperationMutationWithRetry preserves explicit sessions and ' +
    'adds jitter for partition contention',
  async (t) => {
    let attempts = 0;
    const observedSessions = [];
    const observedWaits = [];
    const explicitSessionId = 'explicit-transition-session';
    const repo = createTestRepository({
      random: () => 1,
      controlPlaneSystemTableGateway: {
        executeQuery: async (_sql, _params, options = {}) => {
          attempts += 1;
          observedSessions.push(options.sessionId || null);
          if (attempts === 1) {
            return {
              success: false,
              error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
            };
          }
          return {success: true, changes: 1};
        },
      },
    });
    repo.waitForOperationPersistRetry = async (delayMs) => {
      observedWaits.push(delayMs);
    };

    const result = await repo.executeOperationMutationWithRetry(
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
      [Date.now(), TEST_OPERATION_ID],
      {
        ownerId: TEST_OPERATION_ID,
        sessionId: explicitSessionId,
      },
    );

    t.equal(result.success, true, 'partition contention should still recover on retry');
    t.same(
      observedSessions,
      [explicitSessionId, explicitSessionId],
      'explicit transition sessions must stay stable across contention retries',
    );
    t.equal(observedWaits.length, 1, 'contention should wait once before retrying');
    t.ok(
      observedWaits[0] > 250,
      'partition contention retries should add jitter instead of retrying in lockstep',
    );
  },
);

test(
  'executeOperationMutationWithRetry can suppress generated system-write ' +
    'sessions for direct transition persistence',
  async (t) => {
    const observedHasSessionId = [];
    const observedDisableFlags = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        executeQuery: async (_sql, _params, options = {}) => {
          observedHasSessionId.push(Object.prototype.hasOwnProperty.call(options, 'sessionId'));
          observedDisableFlags.push(options.disableSystemWriteSession === true);
          return {success: true, changes: 1};
        },
      },
    });

    const result = await repo.executeOperationMutationWithRetry(
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
      [Date.now(), TEST_OPERATION_ID],
      {
        ownerId: TEST_OPERATION_ID,
        disableSystemWriteSession: true,
      },
    );

    t.equal(
      result.success,
      true,
      'direct transition persistence should still succeed without a generated session',
    );
    t.same(
      observedHasSessionId,
      [false],
      'direct transition persistence must not add a routed system-write session id',
    );
    t.same(
      observedDisableFlags,
      [true],
      'direct transition persistence must preserve the explicit no-session flag',
    );
  },
);

test(
  'executeOperationMutationWithRetry rotates implicit sessions on ' +
    'partition contention retries',
  async (t) => {
    let attempts = 0;
    const observedSessions = [];
    const repo = createTestRepository({
      random: () => 0,
      controlPlaneSystemTableGateway: {
        executeQuery: async (_sql, _params, options = {}) => {
          attempts += 1;
          observedSessions.push(options.sessionId || null);
          if (attempts === 1) {
            return {
              success: false,
              error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
            };
          }
          return {success: true, changes: 1};
        },
      },
    });
    repo.waitForOperationPersistRetry = async () => {};

    const result = await repo.executeOperationMutationWithRetry(
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
      [Date.now(), TEST_OPERATION_ID],
      {ownerId: TEST_OPERATION_ID},
    );

    t.equal(
      result.success,
      true,
      'repository-generated sessions should still recover after partition contention',
    );
    t.equal(attempts, 2, 'partition contention should trigger one retry');
    t.not(
      observedSessions[0],
      observedSessions[1],
      'implicit owner-mutation retries should rotate the generated session after partition contention',
    );
  },
);

test(
  'persistOperationUpdate rotates implicit sessions on route-shaped ' +
    'canonical mutation retries and preserves the dedicated timeout',
  async (t) => {
    let updateCalls = 0;
    let readCalls = 0;
    const observedSessions = [];
    const observedTimeouts = [];
    const updatedAt = Date.now() + 1000;
    const participantFailure = {
      error: 'Message timeout',
      errorCode: 'ROUTER_MESSAGE_TIMEOUT',
      retryAfterMs: 250,
      deferRetry: true,
      failedTable: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    };
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        cdcIntegrationService: {
          async updateSystemTableRow() {
            return {success: true};
          },
        },
        updateSystemTableRow: async (_tableName, _whereClause, _data, options = {}) => {
          updateCalls += 1;
          observedSessions.push(options.sessionId || null);
          observedTimeouts.push(options.timeoutMs || null);
          if (updateCalls === 1) {
            return {
              success: false,
              error: 'Distributed operation failed due to participant failures',
              errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
              firstFailedParticipant: participantFailure,
              participantFailures: [participantFailure],
            };
          }
          return {success: true, changes: 1};
        },
        readRows: async () => {
          readCalls += 1;
          if (readCalls === 1) {
            return {success: true, rows: []};
          }
          return {
            success: true,
            rows: [
              makeRow({
                status: 'active',
                workflow_step: 'ACTIVE',
                updated_at: updatedAt,
              }),
            ],
          };
        },
      },
    });
    repo.waitForOperationPersistRetry = async () => {};

    const op = repo.rowToOperation(
      makeRow({
        status: 'active',
        workflow_step: 'ACTIVE',
        updated_at: updatedAt,
      }),
    );

    await repo.persistOperationUpdate(op);

    t.equal(updateCalls, 2, 'route-shaped canonical failures should retry once in this proof');
    t.not(
      observedSessions[0],
      observedSessions[1],
      'route-shaped retries should rotate implicit repository sessions',
    );
    t.same(
      observedTimeouts,
      [
        TEST_REPLICA_OPERATION_MUTATION_QUERY_TIMEOUT_MS,
        TEST_REPLICA_OPERATION_MUTATION_QUERY_TIMEOUT_MS,
      ],
      'canonical mutation retries should preserve the dedicated replica_operations timeout',
    );
  },
);

test('executeOperationMutationWithRetry stops at the enclosing timeout budget', async (t) => {
  const originalDateNow = Date.now;
  let nowMs = 1000;
  Date.now = () => nowMs;
  let attempts = 0;
  let waitCalls = 0;
  const observedTimeoutBudgets = [];
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      executeQuery: async (_sql, _params, options = {}) => {
        attempts += 1;
        observedTimeoutBudgets.push(options.timeoutBudget || null);
        nowMs += 450;
        return {
          success: false,
          error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
        };
      },
    },
  });
  repo.waitForOperationPersistRetry = async (delayMs) => {
    waitCalls += 1;
    nowMs += delayMs;
  };

  try {
    const timeoutBudget = {
      configuredBudgetMs: 1000,
      startedAtMs: nowMs,
      deadlineMs: nowMs + 1000,
      operationName: 'transaction',
    };
    const result = await repo.executeOperationMutationWithRetry(
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
      [Date.now(), TEST_OPERATION_ID],
      {
        ownerId: TEST_OPERATION_ID,
        timeoutBudget,
      },
    );

    t.equal(
      result.success,
      false,
      'retryable mutation should still fail when the enclosing budget runs out',
    );
    t.equal(
      result.error,
      PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
      'the original contention boundary should surface instead of a later timeout-shaped miss',
    );
    t.equal(
      attempts,
      2,
      'repository retry loop should stop once the enclosing transition budget is exhausted',
    );
    t.equal(waitCalls, 1, 'repository should only sleep while budget remains');
    t.same(
      observedTimeoutBudgets,
      [timeoutBudget, timeoutBudget],
      'gateway retries should receive the same enclosing timeout budget',
    );
  } finally {
    Date.now = originalDateNow;
  }
});

test('executeOperationMutationWithRetry stops at the local retry timeout', async (t) => {
  const originalDateNow = Date.now;
  let nowMs = 1000;
  Date.now = () => nowMs;
  let attempts = 0;
  let waitCalls = 0;
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      executeQuery: async () => {
        attempts += 1;
        nowMs += 5000;
        return {
          success: false,
          error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
        };
      },
    },
  });
  repo.waitForOperationPersistRetry = async (delayMs) => {
    waitCalls += 1;
    nowMs += delayMs;
  };

  try {
    const result = await repo.executeOperationMutationWithRetry(
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
      [Date.now(), TEST_OPERATION_ID],
      {ownerId: TEST_OPERATION_ID},
    );

    t.equal(
      result.success,
      false,
      'retryable mutation should still fail when the shared local retry window runs out',
    );
    t.equal(
      result.error,
      PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
      'the original contention boundary should be returned after the local retry timeout expires',
    );
    t.equal(
      attempts,
      3,
      'repository retry loop should stop once the shared local retry timeout is exhausted',
    );
    t.equal(
      waitCalls,
      2,
      'repository should only sleep while the shared local retry timeout still has budget remaining',
    );
  } finally {
    Date.now = originalDateNow;
  }
});

// ── Coordinator delegates to repository ─────────────────────────

test('coordinator.rowToOperation delegates to repository', async (t) => {
  const coordinator = createTestCoordinator();
  try {
    const row = makeRow();
    const op = coordinator.rowToOperation(row);

    t.equal(op.operationId, TEST_OPERATION_ID);
    t.equal(op.type, OperationType.ADD);
    t.ok(
      coordinator.repository instanceof ReplicaOperationRepository,
      'coordinator should own a repository instance',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('coordinator.isOperationTerminal delegates to repository', async (t) => {
  const coordinator = createTestCoordinator();
  try {
    t.ok(
      coordinator.isOperationTerminal({
        type: OperationType.ADD,
        workflowStep: WORKFLOW_STEP.ACTIVE,
      }),
    );
    t.notOk(
      coordinator.isOperationTerminal({
        type: OperationType.ADD,
        workflowStep: WORKFLOW_STEP.CREATING,
      }),
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('coordinator.queryOperationById delegates to repository', async (t) => {
  const coordinator = createTestCoordinator();
  try {
    const move = {
      type: OperationType.ADD,
      partitionId: TEST_PARTITION_ID,
      entityType: TEST_ENTITY_TYPE,
      entityId: TEST_PARTITION_ID,
      nodeId: TEST_TARGET_NODE_ID,
      sourceNodeId: TEST_NODE_ID,
    };
    const created = await coordinator.createOperation(move);
    const queried = await coordinator.queryOperationById(created.operationId);

    t.ok(queried, 'should find the created operation');
    t.equal(queried.operationId, created.operationId);
  } finally {
    await coordinator.shutdown();
  }
});

// ── extractMutationChangeCount ──────────────────────────────────

test('extractMutationChangeCount extracts changes field', async (t) => {
  const repo = createTestRepository();
  t.equal(repo.extractMutationChangeCount({changes: 1}), 1);
  t.equal(repo.extractMutationChangeCount({affectedRows: 3}), 3);
  t.equal(repo.extractMutationChangeCount({}), null);
});

// ── getEntityServiceRows ────────────────────────────────────────

test('getEntityServiceRows filters services by entity type', async (t) => {
  const serviceRows = [
    {
      service_id: 'svc-1',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: TEST_PARTITION_ID,
    },
    {
      service_id: 'svc-2',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      group_id: 'mg-1',
    },
  ];
  const repo = createTestRepository({
    systemTableCache: {
      get: () => null,
      getAll: () => serviceRows,
      filter(table, predicate) {
        if (table === SYSTEM_TABLE_NAME.SERVICES) {
          return serviceRows.filter(predicate);
        }
        return [];
      },
    },
  });

  const result = repo.getEntityServiceRows({
    partitionId: TEST_PARTITION_ID,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: TEST_PARTITION_ID,
  });
  t.equal(result.length, 1);
  t.equal(result[0].service_id, 'svc-1');
});

test('resolveOperationOwnerNodeId keeps priority replace ownership on target until semantic settlement',
  async (t) => {
    const repo = createTestRepository();
    const priorityPartitionId = 'control_plane_publications-p1';

    const targetReadyOwner = repo.resolveOperationOwnerNodeId({
      type: OperationType.REPLACE,
      partitionId: priorityPartitionId,
      sourceNodeId: 'source-node',
      targetNodeId: 'target-node',
      status: 'active',
      workflowStep: WORKFLOW_STEP.ACTIVE,
    });
    const settledOwner = repo.resolveOperationOwnerNodeId({
      type: OperationType.REPLACE,
      partitionId: priorityPartitionId,
      sourceNodeId: 'source-node',
      targetNodeId: 'target-node',
      status: 'removed',
      workflowStep: WORKFLOW_STEP.REMOVED,
    });

    t.equal(
      targetReadyOwner,
      'target-node',
      'priority replace ownership should stay on the target during semantic in-flight phases',
    );
    t.equal(
      settledOwner,
      'source-node',
      'settled operations should stop forcing target ownership',
    );
  });

}
