/**
 * SQL Query Engine Tests
 * Tests for the main SQL query processing entry point.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  QUERY_ERROR_CODE,
} from '../../src/query/query-constants.js';
import {
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  PROJECTION_READINESS_CONTRACT_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
} from '../../src/partition/partition-constants.js';
import {
} from '../../src/control-plane/timeout-budget.js';
import {
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';
import {
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
} from '../../src/control-plane/owner-contract-outcome.js';
import {
} from './routing-repair-test-helpers.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

import {
  mockPartitionData,
  createMockMessageRouter,
  createMockSystemCache,
} from './sql-query-engine-test-support.js';


test('SQLQueryEngine - explicit activation gates distributed transaction ' +
  'recovery until the owner enables it',
async (t) => {
  const cache = createMockSystemCache([], []);
  const transactionRows = [{
    transaction_id: 'tx-activation-gate-1',
    session_id: 'activation-gate-session',
    status: 'PREPARING',
    created_at: 1,
    updated_at: 2,
  }];
  const participantRows = [{
    participant_id: 'tx-activation-gate-1:p1',
    transaction_id: 'tx-activation-gate-1',
    partition_id: 'p1',
    status: 'ACTIVE',
    created_at: 1,
    updated_at: 2,
  }];
  const writeOperationRows = [];
  const originalGetAll = cache.getAll.bind(cache);
  cache.getAll = function(type) {
    if (type === TABLES.SQL_TRANSACTIONS) {
      return transactionRows;
    }
    if (type === TABLES.SQL_TRANSACTION_PARTICIPANTS) {
      return participantRows;
    }
    if (type === TABLES.SQL_WRITE_OPERATIONS) {
      return writeOperationRows;
    }
    return originalGetAll(type);
  };

  const capturedRecoverPayloads = [];
  let replayCalls = 0;
  let sweepStarts = 0;
  const transactionCoordinator = {
    transactionsBySession: new Map(),
    recoverFromSystemTables(payload) {
      capturedRecoverPayloads.push(payload);
    },
    async resumeRecoveredTransactions() {
      replayCalls += 1;
      return {
        totalRecovered: 1,
        resumed: 1,
        failed: 0,
        results: [],
      };
    },
    startRecoverySweep() {
      sweepStarts += 1;
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    transactionCoordinator,
    autoStartDistributedTransactionRecovery: false,
  });

  let replay = await engine.waitForDistributedTransactionRecoveryReplay();
  t.equal(capturedRecoverPayloads.length, 0,
    'recovery should stay dormant before owner activation');
  t.equal(replayCalls, 0,
    'replay hook should not run before owner activation');
  t.equal(sweepStarts, 0,
    'periodic recovery sweep should stay dormant before owner activation');
  t.same(
    replay,
    {
      totalRecovered: 0,
      resumed: 0,
      failed: 0,
      results: [],
    },
    'waiting before activation should return the empty replay summary',
  );

  replay = await engine.activateDistributedTransactionRecovery();
  t.equal(capturedRecoverPayloads.length, 1,
    'activation should hydrate recovery state from the latest cache');
  t.equal(capturedRecoverPayloads[0].transactions.length, 1);
  t.equal(capturedRecoverPayloads[0].participants.length, 1);
  t.equal(replayCalls, 1,
    'activation should trigger replay exactly once');
  t.equal(sweepStarts, 1,
    'activation should start the periodic recovery sweep');
  t.equal(replay.totalRecovered, 1);
  t.equal(replay.resumed, 1);
});

test('SQLQueryEngine - failed recovery replay preserves typed poison-row ' +
  'metadata for its startup owner', async (t) => {
  const recoveryError = new Error(
    'Transaction recovery state is incomplete or incompatible',
  );
  recoveryError.errorCode = QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE;
  recoveryError.decisionDimension = 'commit_mode';
  const transactionCoordinator = {
    transactionsBySession: new Map(),
    async resumeRecoveredTransactions() {
      throw recoveryError;
    },
    startRecoverySweep() {},
  };
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
    transactionCoordinator,
    autoStartDistributedTransactionRecovery: false,
  });

  const replay = await engine.activateDistributedTransactionRecovery();

  t.equal(replay.failed, 1, 'the replay summary remains fail-closed');
  t.equal(
    replay.errorCode,
    QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
    'the replay summary preserves the canonical recovery error code',
  );
  t.equal(
    replay.decisionDimension,
    'commit_mode',
    'the replay summary preserves the exact failed decision dimension',
  );
});

test('SQLQueryEngine - EXPLAIN DISTRIBUTED returns canonical plan output',
  async (t) => {
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [
        {
          partition_id: 'p1',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: null,
        },
      ],
    );
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery(
      'EXPLAIN DISTRIBUTED SELECT id FROM users WHERE id = ?',
      ['alice'],
    );

    t.equal(result.success, true);
    t.equal(result.operation, 'EXPLAIN_DISTRIBUTED');
    t.equal(result.rows.length, 1);
    t.ok(result.rows[0].plan_id.startsWith('dqp-'));
    t.same(Object.keys(result.rows[0].diagnostics).sort(), [
      'explain',
      'generatedAt',
      'joinPlan',
      'pushdownDecisions',
      'tableGraph',
      'tablePlans',
    ]);
  });

test('SQLQueryEngine - distributed diagnostics schema is stable for SELECT',
  async (t) => {
    mockPartitionData.set('p1', [{id: 'alice', name: 'Alice'}]);

    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [{
        partition_id: 'p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      }],
    );
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery(
      'SELECT id FROM users WHERE id = ?',
      ['alice'],
    );

    t.equal(result.success, true);
    t.same(Object.keys(result.distributedMetrics).sort(), [
      'executionDurationMs',
      'fanout',
      'mergeDurationMs',
      'planningDurationMs',
    ]);
    t.same(Object.keys(result.distributedDiagnostics).sort(), [
      'explain',
      'generatedAt',
      'joinPlan',
      'pushdownDecisions',
      'tableGraph',
      'tablePlans',
    ]);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - transactional UPDATE forwards sessionId to distributed writes',
  async (t) => {
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [{
        partition_id: 'p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      }],
    );
    const capturedExecutionOptions = [];
    const transactionCoordinator = {
      getTransaction(sessionId) {
        if (sessionId === 'tx-update-1') {
          return {participants: []};
        }
        return null;
      },
      async enlistParticipants() {
        return {success: true};
      },
      async recordWriteOperation() {},
      async markWriteOperationResult() {},
      async executeWriteStatement(_sessionId, _operation, executeWrite) {
        return executeWrite();
      },
    };
    const distributedWriteCoordinator = {
      createWritePlan(_ast, _params, options = {}) {
        const operationId = `write-${options.sessionId || 'missing'}`;
        return {
          operationId,
          idempotencyKey: operationId,
          statementType: 'UPDATE',
          partitionStatements: new Map([
            ['p1', {
              ast: {type: 'UPDATE', table: 'users'},
              role: 'primary',
              executionOptions: {},
            }],
          ]),
        };
      },
      async executePlan(_plan, _params, executionOptions = {}) {
        capturedExecutionOptions.push({...executionOptions});
        return {
          success: true,
          affectedRows: 1,
          rows: [],
          retryCount: 0,
        };
      },
    };

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
      transactionCoordinator,
      distributedWriteCoordinator,
    });

    const result = await engine.executeQuery(
      'UPDATE users SET status = \'active\' WHERE id = \'alice\'',
      [],
      {sessionId: 'tx-update-1'},
    );

    t.equal(result.success, true, 'transactional update should succeed');
    t.equal(
      capturedExecutionOptions[0]?.sessionId,
      'tx-update-1',
      'transactional writes should forward the SQL session id',
    );
  });

test('SQLQueryEngine - system-table UPDATE returns canonical deferred ' +
  'authority-establishment failures for retryable write errors',
async (t) => {
  const expectedReasonCode = 'publication_epoch_pending';
  const expectedFailedDimension = 'publishedConvergencePending';
  const cache = createMockSystemCache(
    [{table_name: TABLES.TABLES, primaryKey: 'table_id'}],
    [],
    [],
  );
  const distributedWriteCoordinator = {
    createWritePlan() {
      return {
        operationId: 'write-system-table-update',
        idempotencyKey: 'write-system-table-update',
        statementType: 'UPDATE',
        partitionStatements: new Map([
          ['tables-p1', {
            ast: {type: 'UPDATE', table: TABLES.TABLES},
            role: 'primary',
            executionOptions: {},
          }],
        ]),
      };
    },
    async executePlan() {
      const error = new Error('Message timeout');
      error.code = 'QUERY_TIMEOUT';
      error.retryAfterMs = 25;
      throw error;
    },
  };
  const distributedQueryPlanner = {
    planUpdate() {
      return {
        planId: 'plan-system-table-update',
        statementType: 'UPDATE',
        executionPolicy: 'distributed_write',
        tablePlans: new Map([
          [TABLES.TABLES, {
            partitions: ['tables-p1'],
          }],
        ]),
        diagnostics: {
          tablePlans: [],
        },
      };
    },
  };
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
              true,
          },
          reasons: [],
          retryAfterMs: 125,
          projectionReadinessContract: {
            state: PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
            ready: false,
            publication: {
              ready: false,
            },
            priorityRecovery: {
              active: false,
            },
            reasonCodes: [expectedReasonCode],
          },
          runtimeAuthority: {
            state: 'establishing',
            authorityAvailable: true,
            ready: false,
            visibility: {
              state: 'pending_publication',
            },
            reasonCodes: [expectedReasonCode],
          },
          priorityControlPlaneRecovery: {
            active: true,
            reasonCodes: [expectedReasonCode],
          },
        };
      },
    },
    distributedQueryPlanner,
    distributedWriteCoordinator,
  });

  const result = await engine.executeQuery(
    'UPDATE tables SET table_name = \'benchmark_events\' ' +
      'WHERE table_id = \'tbl-1\'',
  );

  t.equal(result.success, false, 'retryable system-table write should fail closed');
  t.equal(
    result.error,
    'query_admission_deferred',
    'retryable system-table write should return the canonical defer error',
  );
  t.equal(
    result.errorCode,
    'QUERY_TIMEOUT',
    'canonical deferred result should preserve the original retryable error code',
  );
  t.equal(
    result.outcome,
    'deferred',
    'retryable system-table write should surface the canonical deferred outcome',
  );
  t.equal(
    result.retryAfterMs,
    125,
    'readiness-owned retry hints should dominate the canonical deferred result',
  );
  t.equal(
    result.reasonCode,
    expectedReasonCode,
    'canonical deferred result should preserve the primary authority-establishment reason',
  );
  t.same(
    result.reasonCodes,
    [expectedReasonCode],
    'canonical deferred result should preserve authority-establishment reasons',
  );
  t.same(
    result.failedDimensions,
    [expectedFailedDimension],
    'canonical deferred result should preserve the authority-establishment failed dimension',
  );
  t.equal(
    result.runtimeAuthority?.state,
    'establishing',
    'canonical deferred result should preserve compact runtime authority state',
  );
  t.equal(
    result.details?.cause,
    'Message timeout',
    'canonical deferred result should preserve the underlying retryable cause',
  );
});

test('SQLQueryEngine preserves the underlying retryable failure when transaction-control ' +
  'routing can widen through the shared recovery contract', async (t) => {
  const cache = createMockSystemCache(
    [
      {table_name: TABLES.TABLES},
      {table_name: TABLES.SQL_TRANSACTIONS},
      {table_name: TABLES.SQL_TRANSACTION_PARTICIPANTS},
      {table_name: TABLES.SQL_WRITE_OPERATIONS},
    ],
    [
      {partition_id: 'tables-p1', table_name: TABLES.TABLES, leader_node_id: 'node-a'},
      {partition_id: 'sql_transactions-p1', table_name: TABLES.SQL_TRANSACTIONS, leader_node_id: null},
      {partition_id: 'sql_transaction_participants-p1', table_name: TABLES.SQL_TRANSACTION_PARTICIPANTS, leader_node_id: 'node-b'},
      {partition_id: 'sql_write_operations-p1', table_name: TABLES.SQL_WRITE_OPERATIONS, leader_node_id: 'node-c'},
    ],
    [
      {
        service_id: 'tables-p1-r1',
        service_type: 'partition',
        partition_id: 'tables-p1',
        node_id: 'node-a',
        raft_role: 'leader',
        address: 'node-a/partition/tables-p1-r1',
        status: 'active',
      },
      {
        service_id: 'sql-transactions-p1-r2',
        service_type: 'partition',
        partition_id: 'sql_transactions-p1',
        node_id: 'node-b',
        raft_role: 'follower',
        address: 'node-b/partition/sql_transactions-p1-r2',
        status: 'active',
      },
      {
        service_id: 'sql-transaction-participants-p1-r1',
        service_type: 'partition',
        partition_id: 'sql_transaction_participants-p1',
        node_id: 'node-b',
        raft_role: 'leader',
        address: 'node-b/partition/sql_transaction_participants-p1-r1',
        status: 'active',
      },
    ],
  );
  let executePlanCalls = 0;
  const distributedWriteCoordinator = {
    createWritePlan() {
      return {
        operationId: 'dwrite-owner-gap',
        idempotencyKey: 'dwrite-owner-gap',
        partitionStatements: new Map([
          ['tables-p1', {
            ast: {type: 'UPDATE', table: TABLES.TABLES},
            role: 'primary',
            executionOptions: {},
          }],
        ]),
      };
    },
    async executePlan() {
      executePlanCalls += 1;
      return {
        success: false,
        error: 'Distributed operation failed due to participant failures',
        errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
        retryAfterMs: 25,
        participantFailures: [
          {
            partitionId: 'tables-p1',
            participantNodeId: 'node-a',
            participantAddress: 'node-a/partition/tables-p1-r1',
            error: 'Message timeout',
            retryAfterMs: 25,
            deferRetry: true,
            failedTable: TABLES.SQL_TRANSACTIONS,
          },
        ],
        firstFailedParticipant: {
          partitionId: 'tables-p1',
          participantNodeId: 'node-a',
          participantAddress: 'node-a/partition/tables-p1-r1',
          error: 'Message timeout',
          retryAfterMs: 25,
          deferRetry: true,
          failedTable: TABLES.SQL_TRANSACTIONS,
        },
      };
    },
  };
  const distributedQueryPlanner = {
    planUpdate() {
      return {
        planId: 'plan-owner-gap',
        statementType: 'UPDATE',
        executionPolicy: 'distributed_write',
        tablePlans: new Map([
          [TABLES.TABLES, {
            partitions: ['tables-p1'],
          }],
        ]),
        diagnostics: {
          tablePlans: [],
        },
      };
    },
  };
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    distributedQueryPlanner,
    distributedWriteCoordinator,
  });

  const result = await engine.executeQuery(
    'UPDATE tables SET table_name = \'benchmark_events\' WHERE table_id = \'tbl-1\'',
    [],
    {
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    },
  );

  t.equal(executePlanCalls, 1,
    'the write path should attempt execution once before surfacing the canonical defer');
  t.equal(result.success, false,
    'retryable distributed write failures should still fail');
  t.equal(result.error, 'Distributed operation failed due to participant failures',
    'widenable recovery traffic should preserve the original distributed failure');
  t.equal(result.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE',
    'the shared widening contract should avoid rewriting the failure into a routing-gap defer');
  t.equal(result.retryAfterMs, 25,
    'the original retry hint should survive when mutation readiness does not block the write');
  t.equal(result.firstFailedParticipant?.failedTable, TABLES.SQL_TRANSACTIONS,
    'the participant failure should keep pointing at the unresolved transaction-control table');
  t.notOk(result.reasonCode,
    'no synthetic routing-gap reason should be attached once the shared widening contract applies');
});

test('SQLQueryEngine preserves lower-path retryable failures for critical ' +
  'control-plane mutations while non-critical publication recovery still ' +
  'defers', async (t) => {
  const RETRYABLE_ERROR_MESSAGE = 'Message timeout';
  const RETRYABLE_ERROR_CODE = 'QUERY_TIMEOUT';
  const EXPECTED_REASON_CODE = 'control_plane_publication_pending';
  const EXPECTED_RETRY_AFTER_MS = 175;
  const ROUTING_READINESS_DIMENSION =
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
  const LIFECYCLE_TABLE_NAME = 'benchmark_events';
  const CANONICAL_ROUTING_SNAPSHOT = Object.freeze({
    canonicalLeaderNodeId: 'node-1',
    canonicalLeaderServiceCount: 1,
    serviceRowCount: 1,
    activeAddressedServiceCount: 1,
    routableServiceCount: 1,
    canonicalLeaderIdentityState: 'owner_confirmed',
  });
  const CONTROL_PLANE_READY_DIMENSIONS = Object.freeze({
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: true,
  });
  const engine = new SQLQueryEngine({
    nodeId: 'mutation-readiness-node',
    systemCache: createMockSystemCache([], [], []),
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: CONTROL_PLANE_READY_DIMENSIONS,
          reasons: [],
          retryAfterMs: EXPECTED_RETRY_AFTER_MS,
          projectionReadinessContract: {
            state: PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
            ready: false,
            publication: {
              ready: false,
            },
            priorityRecovery: {
              active: false,
            },
            reasonCodes: [EXPECTED_REASON_CODE],
          },
          runtimeAuthority: {
            state: 'establishing',
            authorityAvailable: true,
            ready: false,
            visibility: {
              state: 'pending_publication',
            },
            reasonCodes: [EXPECTED_REASON_CODE],
          },
          priorityControlPlaneRecovery: {
            active: true,
            reasonCodes: [EXPECTED_REASON_CODE],
          },
        };
      },
    },
  });
  engine.queryExecutor = {
    getPartitionRoutingSnapshot() {
      return CANONICAL_ROUTING_SNAPSHOT;
    },
    resolveCanonicalLeaderGapRecoveryRoutingContract() {
      return {
        recoveryCandidateWidening: false,
      };
    },
  };

  const createRetryableError = () => {
    const error = new Error(RETRYABLE_ERROR_MESSAGE);
    error.code = RETRYABLE_ERROR_CODE;
    error.retryAfterMs = EXPECTED_RETRY_AFTER_MS;
    return error;
  };

  const criticalSystemTableFailure =
    engine.buildRetryableSystemTableMutationFailure(
      TABLES.NODES,
      createRetryableError(),
      {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        routingReadinessDimension: ROUTING_READINESS_DIMENSION,
      },
    );
  t.equal(
    criticalSystemTableFailure,
    null,
    'critical system-table recovery writes should preserve the original lower-path failure',
  );

  const interactiveSystemTableFailure =
    engine.buildRetryableSystemTableMutationFailure(
      TABLES.NODES,
      createRetryableError(),
      {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        routingReadinessDimension: ROUTING_READINESS_DIMENSION,
      },
    );
  t.equal(
    interactiveSystemTableFailure?.success,
    false,
    'non-critical system-table recovery writes should still fail closed',
  );
  t.equal(
    interactiveSystemTableFailure?.error,
    'query_admission_deferred',
    'non-critical system-table recovery writes should still return the canonical defer outcome',
  );
  t.equal(
    interactiveSystemTableFailure?.reasonCode,
    EXPECTED_REASON_CODE,
    'non-critical system-table recovery writes should preserve the publication reason',
  );
  t.equal(
    interactiveSystemTableFailure?.retryAfterMs,
    EXPECTED_RETRY_AFTER_MS,
    'non-critical system-table recovery writes should keep readiness-owned retry hints',
  );

  const criticalLifecycleFailure =
    engine.buildRetryableControlPlaneLifecycleMutationFailure(
      LIFECYCLE_TABLE_NAME,
      createRetryableError(),
      {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        routingReadinessDimension: ROUTING_READINESS_DIMENSION,
      },
    );
  t.equal(
    criticalLifecycleFailure,
    null,
    'critical control-plane lifecycle writes should preserve the original lower-path failure',
  );

  const interactiveLifecycleFailure =
    engine.buildRetryableControlPlaneLifecycleMutationFailure(
      LIFECYCLE_TABLE_NAME,
      createRetryableError(),
      {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        routingReadinessDimension: ROUTING_READINESS_DIMENSION,
      },
    );
  t.equal(
    interactiveLifecycleFailure?.success,
    false,
    'non-critical control-plane lifecycle writes should still fail closed',
  );
  t.equal(
    interactiveLifecycleFailure?.error,
    'query_admission_deferred',
    'non-critical control-plane lifecycle writes should still return the canonical defer outcome',
  );
  t.equal(
    interactiveLifecycleFailure?.reasonCode,
    EXPECTED_REASON_CODE,
    'non-critical control-plane lifecycle writes should preserve the publication reason',
  );
  t.equal(
    interactiveLifecycleFailure?.retryAfterMs,
    EXPECTED_RETRY_AFTER_MS,
    'non-critical control-plane lifecycle writes should keep readiness-owned retry hints',
  );
});

test('SQLQueryEngine preserves lower-path retryable failures for critical ' +
  'control-plane mutations even when transaction-control routing gaps remain',
async (t) => {
  const RETRYABLE_ERROR_MESSAGE = 'Connection to node seed-node-1 closed';
  const RETRYABLE_ERROR_CODE = 'ROUTER_CONNECTION_CLOSED';
  const ROUTING_READINESS_DIMENSION =
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
  const engine = new SQLQueryEngine({
    nodeId: 'routing-gap-node',
    systemCache: createMockSystemCache([], [], []),
    messageRouter: createMockMessageRouter(),
  });

  engine.queryExecutor = {
    getPartitionRoutingSnapshot(partitionId) {
      if (partitionId === 'sql_transactions-p1') {
        return {
          canonicalLeaderIdentityState: 'missing',
          canonicalLeaderNodeId: null,
          canonicalLeaderServiceCount: 0,
          serviceRowCount: 2,
          activeAddressedServiceCount: 2,
        };
      }
      return {
        canonicalLeaderIdentityState: 'owner_confirmed',
        canonicalLeaderNodeId: 'node-a',
        canonicalLeaderServiceCount: 1,
        serviceRowCount: 1,
        activeAddressedServiceCount: 1,
      };
    },
    resolveCanonicalLeaderGapRecoveryRoutingContract() {
      return {
        recoveryCandidateWidening: false,
      };
    },
  };

  const createRetryableError = () => {
    const error = new Error(RETRYABLE_ERROR_MESSAGE);
    error.code = RETRYABLE_ERROR_CODE;
    error.retryAfterMs = 125;
    return error;
  };

  const criticalFailure = engine.buildRetryableSystemTableMutationFailure(
    TABLES.NODES,
    createRetryableError(),
    {
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      routingReadinessDimension: ROUTING_READINESS_DIMENSION,
    },
  );
  t.equal(
    criticalFailure,
    null,
    'critical control-plane mutations should preserve the lower-path failure even while transaction-control routing gaps remain',
  );

  const interactiveFailure = engine.buildRetryableSystemTableMutationFailure(
    TABLES.NODES,
    createRetryableError(),
    {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      routingReadinessDimension: ROUTING_READINESS_DIMENSION,
    },
  );
  t.equal(
    interactiveFailure?.error,
    'query_admission_deferred',
    'interactive control-plane mutations should still collapse the same routing gap into the canonical deferred outcome',
  );
  t.equal(
    interactiveFailure?.reasonCode,
    'transaction_control_owner_missing',
    'interactive control-plane mutations should preserve the owner-gap reason code',
  );
});

test('SQLQueryEngine - remains correct before and after partition split updates',
  async (t) => {
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id', active_partition_version: 1}],
      [{
        partition_id: 'users-p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
        partition_version: 1,
        state: 'NORMAL',
      }],
    );
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    mockPartitionData.set('users-p1', [{id: 'alice'}]);
    const beforeSplit = await engine.executeQuery('SELECT * FROM users');
    t.equal(beforeSplit.success, true);
    t.equal(beforeSplit.rows.length, 1);

    cache.tables = [{
      table_name: 'users',
      primaryKey: 'id',
      active_partition_version: 2,
    }];
    cache.partitions = [
      {
        partition_id: 'users-p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
        partition_version: 1,
        state: 'NORMAL',
      },
      {
        partition_id: 'users-p1a',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: 'm',
        partition_version: 2,
        state: 'NORMAL',
      },
      {
        partition_id: 'users-p1b',
        table_name: 'users',
        partition_key_start: 'm',
        partition_key_end: null,
        partition_version: 2,
        state: 'NORMAL',
      },
    ];
    cache.services = cache.partitions.map((partition) => ({
      service_id: partition.partition_id,
      service_type: 'partition',
      partition_id: partition.partition_id,
      node_id: 'test-node',
      raft_role: 'leader',
      address: `test-node/partition/${partition.partition_id}`,
      status: 'active',
    }));

    mockPartitionData.clear();
    mockPartitionData.set('users-p1a', [{id: 'alice'}]);
    mockPartitionData.set('users-p1b', [{id: 'zack'}]);

    const afterSplit = await engine.executeQuery('SELECT * FROM users');
    t.equal(afterSplit.success, true);
    t.equal(afterSplit.rows.length, 2);
    t.same(afterSplit.partitions.sort(), ['users-p1a', 'users-p1b']);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - hides pending split children until active version flips',
  async (t) => {
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id', active_partition_version: 1}],
      [
        {
          partition_id: 'users-p1',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: null,
          partition_version: 1,
          state: 'NORMAL',
        },
        {
          partition_id: 'users-p1a',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: 'm',
          partition_version: 2,
          state: 'NORMAL',
        },
        {
          partition_id: 'users-p1b',
          table_name: 'users',
          partition_key_start: 'm',
          partition_key_end: null,
          partition_version: 2,
          state: 'NORMAL',
        },
      ],
    );
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    mockPartitionData.set('users-p1', [{id: 'alice'}]);
    mockPartitionData.set('users-p1a', [{id: 'alice'}]);
    mockPartitionData.set('users-p1b', [{id: 'zack'}]);

    const result = await engine.executeQuery('SELECT * FROM users');
    t.equal(result.success, true);
    t.equal(result.rows.length, 1);
    t.same(result.partitions, ['users-p1']);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - successful non-transactional INSERT does not persist ' +
  'write-tracking rows or block the critical path', async (t) => {
  const SLOW_PERSIST_MS = 50;
  const upserts = [];
  let upsertResolvers = [];

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );

  // CDC service that takes SLOW_PERSIST_MS per upsert to simulate real
  // Raft consensus + CDC cache wait overhead on sql_write_operations.
  const cdcIntegrationService = {
    async upsertSystemTableRow(tableName, row) {
      upserts.push({tableName, row, timestamp: Date.now()});
      await new Promise((resolve) => {
        upsertResolvers.push(resolve);
        setTimeout(resolve, SLOW_PERSIST_MS);
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService,
  });

  const startMs = Date.now();
  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );
  const durationMs = Date.now() - startMs;

  t.equal(result.success, true);
  t.equal(result.operation, 'INSERT');

  // If persistence is fire-and-forget, the INSERT should complete well
  // under the combined persistence delay (2 * SLOW_PERSIST_MS = 100ms).
  // Allow generous margin but the key assertion is that we don't wait
  // for both persist calls sequentially.
  const maxAcceptableMs = SLOW_PERSIST_MS;
  t.ok(
    durationMs < maxAcceptableMs,
    `INSERT took ${durationMs}ms, expected < ${maxAcceptableMs}ms ` +
    '(write persistence should not block critical path)',
  );
  t.equal(upserts.length, 0,
    'successful non-transactional INSERT should not persist sql_write_operations rows');

  // Allow fire-and-forget upserts to complete before test cleanup.
  await Promise.resolve();
  for (const resolver of upsertResolvers) {
    resolver();
  }
  upsertResolvers = [];
  await new Promise((resolve) => setTimeout(resolve, SLOW_PERSIST_MS + 10));
});

test('SQLQueryEngine - successful non-transactional UPDATE does not persist ' +
  'write-tracking rows or block the critical path', async (t) => {
  const SLOW_PERSIST_MS = 50;
  const upserts = [];
  let upsertResolvers = [];

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );

  const cdcIntegrationService = {
    async upsertSystemTableRow(tableName, row) {
      upserts.push({tableName, row});
      await new Promise((resolve) => {
        upsertResolvers.push(resolve);
        setTimeout(resolve, SLOW_PERSIST_MS);
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService,
  });

  const startMs = Date.now();
  const result = await engine.executeQuery(
    'UPDATE users SET name = \'Bob\' WHERE id = \'alice\'',
  );
  const durationMs = Date.now() - startMs;

  t.equal(result.success, true);

  const maxAcceptableMs = SLOW_PERSIST_MS;
  t.ok(
    durationMs < maxAcceptableMs,
    `UPDATE took ${durationMs}ms, expected < ${maxAcceptableMs}ms ` +
    '(write persistence should not block critical path)',
  );
  t.equal(upserts.length, 0,
    'successful non-transactional UPDATE should not persist sql_write_operations rows');

  await Promise.resolve();
  for (const resolver of upsertResolvers) {
    resolver();
  }
  upsertResolvers = [];
  await new Promise((resolve) => setTimeout(resolve, SLOW_PERSIST_MS + 10));
});

test('SQLQueryEngine - successful non-transactional DELETE does not persist ' +
  'write-tracking rows or block the critical path', async (t) => {
  const SLOW_PERSIST_MS = 50;
  const upserts = [];
  let upsertResolvers = [];

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );

  const cdcIntegrationService = {
    async upsertSystemTableRow(tableName, row) {
      upserts.push({tableName, row});
      await new Promise((resolve) => {
        upsertResolvers.push(resolve);
        setTimeout(resolve, SLOW_PERSIST_MS);
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService,
  });

  const startMs = Date.now();
  const result = await engine.executeQuery(
    'DELETE FROM users WHERE id = \'alice\'',
  );
  const durationMs = Date.now() - startMs;

  t.equal(result.success, true);

  const maxAcceptableMs = SLOW_PERSIST_MS;
  t.ok(
    durationMs < maxAcceptableMs,
    `DELETE took ${durationMs}ms, expected < ${maxAcceptableMs}ms ` +
    '(write persistence should not block critical path)',
  );
  t.equal(upserts.length, 0,
    'successful non-transactional DELETE should not persist sql_write_operations rows');

  await Promise.resolve();
  for (const resolver of upsertResolvers) {
    resolver();
  }
  upsertResolvers = [];
  await new Promise((resolve) => setTimeout(resolve, SLOW_PERSIST_MS + 10));
});

test('SQLQueryEngine - failed non-transactional INSERT persists one ' +
  'terminal write-tracking row without blocking the caller', async (t) => {
  const SLOW_PERSIST_MS = 50;
  const upserts = [];
  let upsertResolvers = [];

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );

  const cdcIntegrationService = {
    async upsertSystemTableRow(tableName, row) {
      upserts.push({tableName, row, timestamp: Date.now()});
      await new Promise((resolve) => {
        upsertResolvers.push(resolve);
        setTimeout(resolve, SLOW_PERSIST_MS);
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService,
  });
  engine.distributedWriteCoordinator.executePlan = async () => {
    throw new Error('synthetic distributed write failure');
  };

  const startMs = Date.now();
  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );
  const durationMs = Date.now() - startMs;

  t.equal(result.success, false,
    'failed distributed write should surface a failed query result');
  t.match(result.error, /synthetic distributed write failure/,
    'failed query result should preserve the write error');
  t.ok(
    durationMs < SLOW_PERSIST_MS,
    `failed INSERT took ${durationMs}ms, expected < ${SLOW_PERSIST_MS}ms ` +
    '(failure tracking should remain fire-and-forget)',
  );

  await Promise.resolve();
  t.equal(upserts.length, 1,
    'failed non-transactional INSERT should persist one terminal tracking row');
  t.equal(upserts[0].tableName, TABLES.SQL_WRITE_OPERATIONS,
    'failure tracking should target sql_write_operations');
  t.equal(upserts[0].row.status, 'FAILED',
    'terminal tracking row should record failed status');
  t.match(upserts[0].row.last_error, /synthetic distributed write failure/,
    'terminal tracking row should preserve the failure');

  for (const resolver of upsertResolvers) {
    resolver();
  }
  upsertResolvers = [];
  await new Promise((resolve) => setTimeout(resolve, SLOW_PERSIST_MS + 10));
});

test('SQLQueryEngine - retryable control-plane deferred non-transactional ' +
  'INSERT does not persist terminal write-tracking rows', async (t) => {
  const SLOW_PERSIST_MS = 50;
  const upserts = [];
  let upsertResolvers = [];

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );

  const cdcIntegrationService = {
    async upsertSystemTableRow(tableName, row) {
      upserts.push({tableName, row, timestamp: Date.now()});
      await new Promise((resolve) => {
        upsertResolvers.push(resolve);
        setTimeout(resolve, SLOW_PERSIST_MS);
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService,
  });
  engine.distributedWriteCoordinator.executePlan = async () => {
    return {
      success: false,
      error: 'query_admission_deferred',
      retryAfterMs: 25,
      pressureAction: 'defer',
      pressureReason: 'transport_backpressure',
    };
  };

  const startMs = Date.now();
  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );
  const durationMs = Date.now() - startMs;

  t.equal(result.success, false,
    'retryable admission defer should still surface a failed query result');
  t.equal(result.error, 'query_admission_deferred',
    'retryable admission defer should preserve the shared admission error');
  t.ok(
    durationMs < SLOW_PERSIST_MS,
    `deferred INSERT took ${durationMs}ms, expected < ${SLOW_PERSIST_MS}ms ` +
    '(write tracking should remain fire-and-forget)',
  );

  await Promise.resolve();
  t.equal(upserts.length, 0,
    'retryable admission defers must not persist terminal sql_write_operations rows');

  for (const resolver of upsertResolvers) {
    resolver();
  }
  upsertResolvers = [];
  await new Promise((resolve) => setTimeout(resolve, SLOW_PERSIST_MS + 10));
});
