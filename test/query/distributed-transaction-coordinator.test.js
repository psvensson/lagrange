import {test} from '../../src/test-helpers/tap.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  DistributedTransactionCoordinator,
  TRANSACTION_STATUS,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  COMMIT_MODE,
  PARTICIPANT_COMMIT_OUTCOME,
  PARTICIPANT_SET_STATE,
  TRANSACTION_MODE,
} from '../../src/constants/index.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {deriveCommandTag} from '../../src/runtime/pgwire-result-mapper.js';
import {PgWireProtocolHandler} from '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_TRANSACTION_STATE,
  PG_BACKEND_MSG,
  PG_PROTOCOL_VERSION,
  PG_FRONTEND_MSG,
} from '../../src/runtime/pgwire-protocol-constants.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

function frozenTransactionDecision(participantCount) {
  return {
    transaction_mode: TRANSACTION_MODE.EXPLICIT,
    participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
    commit_mode: COMMIT_MODE.TWO_PHASE_COMMIT,
    frozen_participant_count: participantCount,
  };
}

const OPEN_TRANSACTION_DECISION = Object.freeze({
  transaction_mode: TRANSACTION_MODE.EXPLICIT,
  participant_set_state: PARTICIPANT_SET_STATE.OPEN,
  commit_mode: COMMIT_MODE.NOT_SELECTED,
  frozen_participant_count: 0,
});

test('DistributedTransactionCoordinator - enlists participants and commits', async (t) => {
  const calls = [];
  const coordinator = new DistributedTransactionCoordinator({
    beginParticipant: async (sessionId, partitionId) => {
      calls.push(`begin:${sessionId}:${partitionId}`);
    },
    commitParticipant: async (sessionId, partitionId) => {
      calls.push(`commit:${sessionId}:${partitionId}`);
    },
    rollbackParticipant: async (sessionId, partitionId) => {
      calls.push(`rollback:${sessionId}:${partitionId}`);
    },
    now: () => 1000,
  });

  const beginResult = await coordinator.begin('s1');
  t.equal(beginResult.success, true);
  t.ok(beginResult.transactionId.startsWith('tx-s1-'));

  const enlistResult = await coordinator.enlistParticipants('s1', ['p1', 'p2']);
  t.equal(enlistResult.success, true);
  t.same(enlistResult.participants.sort(), ['p1', 'p2']);

  const commitResult = await coordinator.commit('s1');
  t.equal(commitResult.success, true);
  t.same(commitResult.participants.sort(), ['p1', 'p2']);
  t.equal(coordinator.hasActiveTransaction('s1'), false);
  t.same(calls, [
    'begin:s1:p1',
    'begin:s1:p2',
    'commit:s1:p1',
    'commit:s1:p2',
  ]);
});

test(
  'DistributedTransactionCoordinator - commit failure surfaces failed participants',
  async (t) => {
    const coordinator = new DistributedTransactionCoordinator({
      beginParticipant: async () => {},
      commitParticipant: async (_sessionId, partitionId) => {
        if (partitionId === 'p2') {
          throw new Error('commit failed');
        }
      },
      rollbackParticipant: async () => {},
    });

    await coordinator.begin('s2');
    await coordinator.enlistParticipants('s2', ['p1', 'p2']);
    const commitResult = await coordinator.commit('s2');

    t.equal(commitResult.success, false);
    t.equal(commitResult.failedParticipants.length, 1);
    t.equal(commitResult.failedParticipants[0].partitionId, 'p2');
  },
);

test('DistributedTransactionCoordinator - rollback clears active transaction', async (t) => {
  const calls = [];
  const coordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async (_sessionId, partitionId) => {
      calls.push(partitionId);
    },
  });

  await coordinator.begin('s3');
  await coordinator.enlistParticipants('s3', ['p1', 'p2']);
  const rollbackResult = await coordinator.rollback('s3');

  t.equal(rollbackResult.success, true);
  t.same(calls.sort(), ['p1', 'p2']);
  t.equal(coordinator.hasActiveTransaction('s3'), false);
});

test('DistributedTransactionCoordinator - rollback failure stays in rollback ' +
  'lane for replay', async (t) => {
  const calls = [];
  let failPartition = 'p2';
  const coordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async (_sessionId, partitionId) => {
      calls.push(partitionId);
      if (partitionId === failPartition) {
        throw new Error('rollback failed');
      }
    },
  });

  await coordinator.begin('s3-retry');
  await coordinator.enlistParticipants('s3-retry', ['p1', 'p2']);

  const firstRollback = await coordinator.rollback('s3-retry');

  t.equal(firstRollback.success, false);
  t.equal(coordinator.hasActiveTransaction('s3-retry'), true);
  t.equal(
    coordinator.getTransaction('s3-retry')?.status,
    TRANSACTION_STATUS.ROLLING_BACK,
    'failed rollback should remain recoverable instead of becoming terminal',
  );

  failPartition = null;
  const secondRollback = await coordinator.rollback('s3-retry');

  t.equal(secondRollback.success, true);
  t.equal(coordinator.hasActiveTransaction('s3-retry'), false);
  t.equal(calls[0], 'p1');
  t.ok(
    calls.slice(1).every((partitionId) => partitionId === 'p2'),
    'replayed rollback should only revisit the unfinished participant',
  );
});

test(
  'DistributedTransactionCoordinator - defers recovery sweep on retryable control-plane persistence failures',
  async (t) => {
    const nowMs = 10_000;
    const coordinator = new DistributedTransactionCoordinator({
      now: () => nowMs,
      loadRecoveryStateForSweep: async () => ({
        transactions: [
          {
            transaction_id: 'tx-recover-1',
            session_id: 'recover-session-1',
            status: TRANSACTION_STATUS.ACTIVE,
            timeout_deadline: nowMs - 1,
            created_at: 1,
            updated_at: 1,
          },
        ],
        participants: [
          {
            participant_id: 'tx-recover-1:p1',
            transaction_id: 'tx-recover-1',
            partition_id: 'p1',
            status: TRANSACTION_STATUS.ACTIVE,
            created_at: 1,
            updated_at: 1,
          },
        ],
        writeOperations: [],
      }),
      beginParticipant: async () => {},
      rollbackParticipant: async () => {},
      persistTransaction: async () => {
        const error = new Error(
          'Distributed operation failed due to participant failures',
        );
        error.errorCode = 'DISTRIBUTED_PARTICIPANT_FAILURE';
        throw error;
      },
    });

    const firstSweep = await coordinator.runRecoverySweep();

    t.equal(firstSweep.swept, 1);
    t.equal(firstSweep.resolved, 0);
    t.equal(firstSweep.failed, 0);
    t.equal(firstSweep.deferred, 1);
    t.equal(firstSweep.results.length, 1);
    t.equal(firstSweep.results[0].deferred, true);
    t.equal(
      coordinator.hasActiveTransaction('recover-session-1'),
      true,
      'retryable recovery failures should remain eligible for a later sweep',
    );

    const secondSweep = await coordinator.runRecoverySweep();

    t.equal(secondSweep.swept, 0);
    t.equal(secondSweep.failed, 0);
    t.equal(secondSweep.deferred, 1);
    t.equal(
      secondSweep.deferredUntilMs > nowMs,
      true,
      'subsequent sweeps should back off while the defer window is active',
    );
  },
);

test('DistributedTransactionCoordinator - supports recovery payloads', async (t) => {
  const coordinator = new DistributedTransactionCoordinator();
  coordinator.recover([
    {
      sessionId: 's4',
      transactionId: 'tx-s4-1',
      status: TRANSACTION_STATUS.PREPARED,
      ...frozenTransactionDecision(1),
      participants: ['p1'],
      writeOperations: [{operationId: 'op-1'}],
      createdAt: 1,
    },
  ]);

  const tx = coordinator.getTransaction('s4');
  t.equal(tx.transactionId, 'tx-s4-1');
  t.equal(tx.status, TRANSACTION_STATUS.PREPARED);
  t.same(tx.participants, ['p1']);
  t.equal(tx.writeOperations.length, 1);
  t.equal(tx.writeOperations[0].operationId, 'op-1');
});

test('DistributedTransactionCoordinator - prepare failure reports stage and participant',
  async (t) => {
    const coordinator = new DistributedTransactionCoordinator({
      beginParticipant: async () => {},
      prepareParticipant: async (_sessionId, partitionId) => {
        if (partitionId === 'p2') {
          throw new Error('prepare failed');
        }
      },
      commitParticipant: async () => {},
      rollbackParticipant: async () => {},
    });

    await coordinator.begin('s5');
    await coordinator.enlistParticipants('s5', ['p1', 'p2']);
    const result = await coordinator.commit('s5');

    t.equal(result.success, false);
    t.equal(result.stage, TRANSACTION_STATUS.PREPARING);
    t.equal(result.failedParticipants.length, 1);
    t.equal(result.failedParticipants[0].partitionId, 'p2');
    t.equal(coordinator.hasActiveTransaction('s5'), false);
  });

test('DistributedTransactionCoordinator - emits persistence callbacks', async (t) => {
  const persistedTransactions = [];
  const persistedParticipants = [];
  const persistedWriteOperations = [];

  const coordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    persistTransaction: async (record) => {
      persistedTransactions.push(record.status);
    },
    persistParticipant: async (record) => {
      persistedParticipants.push({
        partitionId: record.partitionId,
        status: record.status,
      });
    },
    persistWriteOperation: async (record) => {
      persistedWriteOperations.push({
        operationId: record.operationId,
        status: record.status,
      });
    },
  });

  await coordinator.begin('s6');
  await coordinator.enlistParticipants('s6', ['p1']);
  await coordinator.recordWriteOperation('s6', {
    operationId: 'op-1',
    statementType: 'UPDATE',
    partitionIds: ['p1'],
    idempotencyKey: 'idem-op-1',
    payloadHash: 'hash-op-1',
  });
  await coordinator.markWriteOperationResult('s6', 'op-1', {
    success: true,
    retryCount: 1,
  });
  await coordinator.commit('s6');

  t.ok(persistedTransactions.includes(TRANSACTION_STATUS.ACTIVE));
  t.ok(persistedTransactions.includes(TRANSACTION_STATUS.PREPARED));
  t.ok(persistedTransactions.includes(TRANSACTION_STATUS.COMMITTED));
  t.ok(persistedParticipants.some((entry) =>
    entry.partitionId === 'p1' && entry.status === 'COMMITTED'));
  t.ok(persistedWriteOperations.some((entry) =>
    entry.operationId === 'op-1' && entry.status === 'SUCCEEDED'));
});

test('DistributedTransactionCoordinator - recovers from canonical system table rows',
  async (t) => {
    const coordinator = new DistributedTransactionCoordinator();
    coordinator.recoverFromSystemTables({
      transactions: [{
        transaction_id: 'tx-s7-1',
        session_id: 's7',
        status: TRANSACTION_STATUS.PREPARED,
        ...frozenTransactionDecision(1),
        created_at: 1,
        updated_at: 2,
      }],
      participants: [{
        participant_id: 'tx-s7-1:p1',
        transaction_id: 'tx-s7-1',
        partition_id: 'p1',
        status: 'PREPARED',
        created_at: 1,
        updated_at: 2,
      }],
      writeOperations: [{
        operation_id: 'op-2',
        transaction_id: 'tx-s7-1',
        statement_type: 'DELETE',
        status: 'PENDING',
        idempotency_key: 'idem-op-2',
        payload_hash: 'hash-op-2',
        partition_ids: '["p1"]',
        retry_count: 0,
        created_at: 1,
        updated_at: 2,
      }],
    });

    const tx = coordinator.getTransaction('s7');
    t.equal(tx.transactionId, 'tx-s7-1');
    t.same(tx.participants, ['p1']);
    t.equal(tx.writeOperations.length, 1);
    t.same(tx.writeOperations[0].partitionIds, ['p1']);
  });

test('DistributedTransactionCoordinator - uses injected workflow coordinator',
  async (t) => {
    const workflowCoordinator = new DurableWorkflowCoordinator();
    const coordinator = new DistributedTransactionCoordinator({
      workflowCoordinator,
      beginParticipant: async () => {},
      commitParticipant: async () => {},
      rollbackParticipant: async () => {},
      now: () => 1000,
    });

    await coordinator.begin('s8');
    await coordinator.enlistParticipants('s8', ['p1']);

    const workflow = workflowCoordinator.getWorkflowByOwnerKey('s8');
    t.ok(workflow, 'transaction state should be owned by the injected workflow coordinator');
    t.equal(workflow.transactionId, coordinator.getTransaction('s8').transactionId);
    t.ok(
      workflow.participants.has('p1'),
      'participant state should be persisted through the injected workflow coordinator',
    );
  });

test('DistributedTransactionCoordinator - recovery replay resumes commit lane',
  async (t) => {
    const prepareCalls = [];
    const commitCalls = [];
    const persistedStatuses = [];
    const coordinator = new DistributedTransactionCoordinator({
      prepareParticipant: async (sessionId, partitionId) => {
        prepareCalls.push(`${sessionId}:${partitionId}`);
      },
      commitParticipant: async (sessionId, partitionId) => {
        commitCalls.push(`${sessionId}:${partitionId}`);
      },
      persistTransaction: async (record) => {
        persistedStatuses.push(record.status);
      },
    });

    coordinator.recoverFromSystemTables({
      transactions: [{
        transaction_id: 'tx-recover-commit-1',
        session_id: 'recover-commit-1',
        status: TRANSACTION_STATUS.PREPARED,
        ...frozenTransactionDecision(2),
        created_at: 1,
        updated_at: 1,
      }],
      participants: [
        {
          participant_id: 'tx-recover-commit-1:p1',
          transaction_id: 'tx-recover-commit-1',
          partition_id: 'p1',
          status: TRANSACTION_STATUS.ACTIVE,
          created_at: 1,
          updated_at: 1,
        },
        {
          participant_id: 'tx-recover-commit-1:p2',
          transaction_id: 'tx-recover-commit-1',
          partition_id: 'p2',
          status: TRANSACTION_STATUS.PREPARED,
          created_at: 1,
          updated_at: 1,
        },
      ],
    });

    const recovery = await coordinator.resumeRecoveredTransactions();
    t.equal(recovery.totalRecovered, 1);
    t.equal(recovery.resumed, 1);
    t.equal(recovery.failed, 0);
    t.same(prepareCalls, []);
    t.same(commitCalls.sort(), ['recover-commit-1:p1', 'recover-commit-1:p2']);
    t.ok(persistedStatuses.includes(TRANSACTION_STATUS.COMMITTED));
    t.equal(coordinator.hasActiveTransaction('recover-commit-1'), false);
  });

test('DistributedTransactionCoordinator - recovery replay treats ' +
  'idempotent participant commit misses as committed', async (t) => {
  const commitCalls = [];
  const retryDiagnostics = [];
  const coordinator = new DistributedTransactionCoordinator({
    onParticipantRetry: (diagnostic) => {
      retryDiagnostics.push(diagnostic);
    },
    commitParticipant: async (sessionId, partitionId) => {
      commitCalls.push(`${sessionId}:${partitionId}`);
      if (partitionId === 'p1') {
        const error = new Error(QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT);
        error.errorCode = QUERY_ERROR_CODE.NO_TRANSACTION;
        throw error;
      }
    },
  });

  coordinator.recoverFromSystemTables({
    transactions: [{
      transaction_id: 'tx-recover-idempotent-commit-1',
      session_id: 'recover-idempotent-commit-1',
      status: TRANSACTION_STATUS.COMMITTING,
      ...frozenTransactionDecision(2),
      created_at: 1,
      updated_at: 1,
    }],
    participants: [
      {
        participant_id: 'tx-recover-idempotent-commit-1:p1',
        transaction_id: 'tx-recover-idempotent-commit-1',
        partition_id: 'p1',
        status: TRANSACTION_STATUS.COMMITTING,
        created_at: 1,
        updated_at: 1,
      },
      {
        participant_id: 'tx-recover-idempotent-commit-1:p2',
        transaction_id: 'tx-recover-idempotent-commit-1',
        partition_id: 'p2',
        status: TRANSACTION_STATUS.ACTIVE,
        created_at: 1,
        updated_at: 1,
      },
    ],
  });

  const recovery = await coordinator.resumeRecoveredTransactions();

  t.equal(recovery.totalRecovered, 1);
  t.equal(recovery.resumed, 1);
  t.equal(recovery.failed, 0);
  t.equal(retryDiagnostics.length, 0,
    'idempotent commit misses should not be retried');
  t.same(commitCalls.sort(), [
    'recover-idempotent-commit-1:p1',
    'recover-idempotent-commit-1:p2',
  ]);
  t.equal(coordinator.hasActiveTransaction('recover-idempotent-commit-1'), false);
});

test('DistributedTransactionCoordinator - recovery replay only commits pending participants',
  async (t) => {
    const commitCalls = [];
    const coordinator = new DistributedTransactionCoordinator({
      commitParticipant: async (sessionId, partitionId) => {
        commitCalls.push(`${sessionId}:${partitionId}`);
      },
    });

    coordinator.recoverFromSystemTables({
      transactions: [{
        transaction_id: 'tx-recover-commit-2',
        session_id: 'recover-commit-2',
        status: TRANSACTION_STATUS.COMMITTING,
        ...frozenTransactionDecision(2),
        created_at: 1,
        updated_at: 1,
      }],
      participants: [
        {
          participant_id: 'tx-recover-commit-2:p1',
          transaction_id: 'tx-recover-commit-2',
          partition_id: 'p1',
          status: TRANSACTION_STATUS.COMMITTED,
          created_at: 1,
          updated_at: 1,
        },
        {
          participant_id: 'tx-recover-commit-2:p2',
          transaction_id: 'tx-recover-commit-2',
          partition_id: 'p2',
          status: TRANSACTION_STATUS.COMMITTING,
          created_at: 1,
          updated_at: 1,
        },
      ],
    });

    const recovery = await coordinator.resumeRecoveredTransactions();
    t.equal(recovery.totalRecovered, 1);
    t.equal(recovery.resumed, 1);
    t.equal(recovery.failed, 0);
    t.same(commitCalls, ['recover-commit-2:p2']);
    t.equal(coordinator.hasActiveTransaction('recover-commit-2'), false);
  });

test('DistributedTransactionCoordinator - recovery replay rolls back preparing transactions',
  async (t) => {
    const commitCalls = [];
    const rollbackCalls = [];
    const coordinator = new DistributedTransactionCoordinator({
      commitParticipant: async (sessionId, partitionId) => {
        commitCalls.push(`${sessionId}:${partitionId}`);
      },
      rollbackParticipant: async (sessionId, partitionId) => {
        rollbackCalls.push(`${sessionId}:${partitionId}`);
      },
    });

    coordinator.recoverFromSystemTables({
      transactions: [{
        transaction_id: 'tx-recover-preparing-1',
        session_id: 'recover-preparing-1',
        status: TRANSACTION_STATUS.PREPARING,
        ...frozenTransactionDecision(2),
        created_at: 1,
        updated_at: 1,
      }],
      participants: [
        {
          participant_id: 'tx-recover-preparing-1:p1',
          transaction_id: 'tx-recover-preparing-1',
          partition_id: 'p1',
          status: TRANSACTION_STATUS.PREPARING,
          created_at: 1,
          updated_at: 1,
        },
        {
          participant_id: 'tx-recover-preparing-1:p2',
          transaction_id: 'tx-recover-preparing-1',
          partition_id: 'p2',
          status: TRANSACTION_STATUS.ACTIVE,
          created_at: 1,
          updated_at: 1,
        },
      ],
    });

    const recovery = await coordinator.resumeRecoveredTransactions();
    t.equal(recovery.totalRecovered, 1);
    t.equal(recovery.resumed, 1);
    t.equal(recovery.failed, 0);
    t.same(commitCalls, []);
    t.same(rollbackCalls.sort(), ['recover-preparing-1:p1', 'recover-preparing-1:p2']);
    t.equal(coordinator.hasActiveTransaction('recover-preparing-1'), false);
  });

test('DistributedTransactionCoordinator - recovery replay resumes rollback lane',
  async (t) => {
    const rollbackCalls = [];
    const coordinator = new DistributedTransactionCoordinator({
      rollbackParticipant: async (sessionId, partitionId) => {
        rollbackCalls.push(`${sessionId}:${partitionId}`);
      },
    });

    coordinator.recoverFromSystemTables({
      transactions: [{
        transaction_id: 'tx-recover-rollback-1',
        session_id: 'recover-rollback-1',
        status: TRANSACTION_STATUS.ROLLING_BACK,
        ...OPEN_TRANSACTION_DECISION,
        created_at: 1,
        updated_at: 1,
      }],
      participants: [
        {
          participant_id: 'tx-recover-rollback-1:p1',
          transaction_id: 'tx-recover-rollback-1',
          partition_id: 'p1',
          status: TRANSACTION_STATUS.ACTIVE,
          created_at: 1,
          updated_at: 1,
        },
        {
          participant_id: 'tx-recover-rollback-1:p2',
          transaction_id: 'tx-recover-rollback-1',
          partition_id: 'p2',
          status: TRANSACTION_STATUS.ROLLED_BACK,
          created_at: 1,
          updated_at: 1,
        },
      ],
    });

    const recovery = await coordinator.resumeRecoveredTransactions();
    t.equal(recovery.totalRecovered, 1);
    t.equal(recovery.resumed, 1);
    t.equal(recovery.failed, 0);
    t.same(rollbackCalls, ['recover-rollback-1:p1']);
    t.equal(coordinator.hasActiveTransaction('recover-rollback-1'), false);
  });

test('DistributedTransactionCoordinator - freezes before selecting one phase',
  async (t) => {
    const prepareCalls = [];
    const coordinator = new DistributedTransactionCoordinator({
      beginParticipant: async () => {},
      prepareParticipant: async (sessionId, partitionId) => {
        prepareCalls.push(`${sessionId}:${partitionId}`);
      },
      commitParticipant: async () => {},
      resolveParticipantCommitOutcome: async () =>
        PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
    });

    await coordinator.begin('one-phase', {
      commitMode: COMMIT_MODE.TWO_PHASE_COMMIT,
    });
    await coordinator.enlistParticipants('one-phase', ['p1']);
    const result = await coordinator.commit('one-phase');

    t.equal(result.success, true);
    t.equal(result.commitMode, COMMIT_MODE.ONE_PHASE_COMMIT,
      'caller preference must not override coordinator selection');
    t.same(prepareCalls, [], 'one phase must not prepare');
    t.same(result.decisionTrace.map((entry) => entry.event), [
      'PARTICIPANT_SET_FROZEN',
      'COMMIT_MODE_SELECTED',
    ]);
  });

test('DistributedTransactionCoordinator - final second participant selects two phase',
  async (t) => {
    const prepareCalls = [];
    const coordinator = new DistributedTransactionCoordinator({
      beginParticipant: async () => {},
      prepareParticipant: async (_sessionId, partitionId) => {
        prepareCalls.push(partitionId);
      },
      commitParticipant: async () => {},
      resolveParticipantCommitOutcome: async () =>
        PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
    });

    await coordinator.begin('two-phase');
    await coordinator.enlistParticipants('two-phase', ['p1']);
    await coordinator.enlistParticipants('two-phase', ['p2']);
    const result = await coordinator.commit('two-phase');

    t.equal(result.commitMode, COMMIT_MODE.TWO_PHASE_COMMIT);
    t.same(prepareCalls.sort(), ['p1', 'p2']);
  });

test('DistributedTransactionCoordinator - rejects enlistment after freeze',
  async (t) => {
    const participantBegins = [];
    let frozenEnlistResult;
    const coordinator = new DistributedTransactionCoordinator({
      beginParticipant: async (_sessionId, partitionId) => {
        participantBegins.push(partitionId);
      },
      commitParticipant: async () => {},
      persistTransaction: async (record) => {
        if (
          record.participantSetState === PARTICIPANT_SET_STATE.FROZEN &&
          !frozenEnlistResult
        ) {
          frozenEnlistResult = await coordinator.enlistParticipantsOwned(
            'frozen-enlist',
            ['p2'],
          );
        }
      },
    });

    await coordinator.begin('frozen-enlist');
    await coordinator.enlistParticipants('frozen-enlist', ['p1']);
    await coordinator.commit('frozen-enlist');

    t.equal(
      frozenEnlistResult.errorCode,
      QUERY_ERROR_CODE.TRANSACTION_PARTICIPANTS_FROZEN,
    );
    t.same(participantBegins, ['p1']);
  });

test('DistributedTransactionCoordinator - commit queues behind paused enlistment',
  async (t) => {
    let releaseBegin;
    const beginPaused = new Promise((resolve) => {
      releaseBegin = resolve;
    });
    let beginReached;
    const beginReachedPromise = new Promise((resolve) => {
      beginReached = resolve;
    });
    const coordinator = new DistributedTransactionCoordinator({
      beginParticipant: async () => {
        beginReached();
        await beginPaused;
      },
      commitParticipant: async () => {},
    });

    await coordinator.begin('queued-freeze');
    const enlistPromise = coordinator.enlistParticipants(
      'queued-freeze',
      ['p1'],
    );
    await beginReachedPromise;
    const commitPromise = coordinator.commit('queued-freeze');
    t.equal(
      coordinator.getTransaction('queued-freeze').participantSetState,
      PARTICIPANT_SET_STATE.OPEN,
      'commit cannot freeze while participant begin is in flight',
    );
    releaseBegin();
    await enlistPromise;
    const commitResult = await commitPromise;

    t.same(commitResult.participants, ['p1']);
  });

test('DistributedTransactionCoordinator - one phase resolves ambiguous commit outcome',
  async (t) => {
    const buildCoordinator = (outcome) =>
      new DistributedTransactionCoordinator({
        participantRetryMaxRetries: 0,
        beginParticipant: async () => {},
        commitParticipant: async () => {
          const error = new Error(QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT);
          error.errorCode = QUERY_ERROR_CODE.NO_TRANSACTION;
          throw error;
        },
        resolveParticipantCommitOutcome: async () => outcome,
      });

    const committed = buildCoordinator(PARTICIPANT_COMMIT_OUTCOME.COMMITTED);
    await committed.begin('one-phase-ack-lost');
    await committed.enlistParticipants('one-phase-ack-lost', ['p1']);
    t.equal((await committed.commit('one-phase-ack-lost')).success, true,
      'durable committed outcome closes commit-before-ack replay');

    const notCommitted = buildCoordinator(
      PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED,
    );
    await notCommitted.begin('one-phase-restart-before-delivery');
    await notCommitted.enlistParticipants(
      'one-phase-restart-before-delivery',
      ['p1'],
    );
    const notCommittedResult = await notCommitted.commit(
      'one-phase-restart-before-delivery',
    );
    t.equal(notCommittedResult.success, false);
    t.equal(notCommittedResult.deferred, false);

    const unknown = buildCoordinator(PARTICIPANT_COMMIT_OUTCOME.UNKNOWN);
    await unknown.begin('one-phase-unknown');
    await unknown.enlistParticipants('one-phase-unknown', ['p1']);
    const unknownResult = await unknown.commit('one-phase-unknown');
    t.equal(unknownResult.deferred, true);
    t.equal(
      unknown.getTransaction('one-phase-unknown').status,
      TRANSACTION_STATUS.COMMITTING,
    );
  });

test('DistributedTransactionCoordinator - recovery rejects incomplete frozen set',
  async (t) => {
    const coordinator = new DistributedTransactionCoordinator();
    t.throws(() => coordinator.recoverFromSystemTables({
      transactions: [{
        transaction_id: 'tx-incomplete-frozen',
        session_id: 'incomplete-frozen',
        status: TRANSACTION_STATUS.COMMITTING,
        transaction_mode: TRANSACTION_MODE.EXPLICIT,
        participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
        commit_mode: COMMIT_MODE.TWO_PHASE_COMMIT,
        frozen_participant_count: 2,
        created_at: 1,
        updated_at: 1,
      }],
      participants: [{
        transaction_id: 'tx-incomplete-frozen',
        partition_id: 'p1',
        status: TRANSACTION_STATUS.COMMITTING,
      }],
    }), {
      message: QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE,
    });
  });

test('DistributedTransactionCoordinator - recovery rejects multi-participant 1PC',
  async (t) => {
    const coordinator = new DistributedTransactionCoordinator();
    const payload = {
      transactions: [{
        transaction_id: 'tx-invalid-one-phase',
        session_id: 'invalid-one-phase',
        status: TRANSACTION_STATUS.COMMITTING,
        transaction_mode: TRANSACTION_MODE.EXPLICIT,
        participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
        commit_mode: COMMIT_MODE.ONE_PHASE_COMMIT,
        frozen_participant_count: 2,
        created_at: 1,
        updated_at: 1,
      }],
      participants: ['p1', 'p2'].map((partitionId) => ({
        transaction_id: 'tx-invalid-one-phase',
        partition_id: partitionId,
        status: TRANSACTION_STATUS.COMMITTING,
      })),
    };

    t.throws(() => coordinator.recoverFromSystemTables(payload), {
      message: QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE,
    });
    t.equal(coordinator.hasActiveTransaction('invalid-one-phase'), false,
      'invalid recovery must not install a live transaction');
    t.throws(() => coordinator.recoverFromSystemTables(payload), {
      message: QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE,
    });
    t.equal(coordinator.hasActiveTransaction('invalid-one-phase'), false,
      'repeated recovery must reject the same poison state');
  });

test('deriveCommandTag supports affectedRows fallback for INSERT, UPDATE, DELETE', async (t) => {
  t.equal(deriveCommandTag({changes: 5}, 'INSERT INTO t VALUES(1)'), 'INSERT 0 5');
  t.equal(deriveCommandTag({affectedRows: 4}, 'INSERT INTO t VALUES(1)'), 'INSERT 0 4');
  t.equal(deriveCommandTag({changes: 3}, 'UPDATE t SET x=1'), 'UPDATE 3');
  t.equal(deriveCommandTag({affectedRows: 2}, 'UPDATE t SET x=1'), 'UPDATE 2');
  t.equal(deriveCommandTag({changes: 1}, 'DELETE FROM t'), 'DELETE 1');
  t.equal(deriveCommandTag({affectedRows: 6}, 'DELETE FROM t'), 'DELETE 6');
  t.equal(deriveCommandTag({changes: 3, affectedRows: 5}, 'UPDATE t SET x=1'), 'UPDATE 3');
  t.equal(deriveCommandTag({}, 'UPDATE t SET x=1'), 'UPDATE 0');
});

test('DistributedTransactionCoordinator - recoverFromSystemTables does not resurrect in-memory completed transactions', async (t) => {
  const coordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => 1000,
  });

  const beginResult = await coordinator.begin('s-swept');
  t.equal(beginResult.success, true);
  await coordinator.enlistParticipants('s-swept', ['p1']);
  const commitResult = await coordinator.commit('s-swept');
  t.equal(commitResult.success, true);
  t.equal(coordinator.hasActiveTransaction('s-swept'), false);

  coordinator.recoverFromSystemTables({
    transactions: [{
      transaction_id: beginResult.transactionId,
      session_id: 's-swept',
      status: TRANSACTION_STATUS.ACTIVE,
      ...frozenTransactionDecision(1),
      created_at: 1,
      updated_at: 2,
    }],
    participants: [{
      participant_id: `${beginResult.transactionId}:p1`,
      transaction_id: beginResult.transactionId,
      partition_id: 'p1',
      status: 'ACTIVE',
      created_at: 1,
      updated_at: 2,
    }],
  });

  t.equal(coordinator.hasActiveTransaction('s-swept'), false);
  const nextBegin = await coordinator.begin('s-swept');
  t.equal(nextBegin.success, true);
  await coordinator.rollback('s-swept');
});

test('PgWireProtocolHandler - failed BEGIN does not leave session in FAILED state', async (t) => {
  class TestSocket extends EventEmitter {
    constructor() {
      super();
      this.written = [];
    }
    write(buf) {
      this.written.push(Buffer.from(buf));
      return true;
    }
    end() {}
    destroy() {}
    findMessages(type) {
      const all = Buffer.concat(this.written);
      const msgs = [];
      let off = 0;
      while (off < all.length) {
        const msgType = all[off];
        if (off + 5 > all.length) break;
        const len = all.readInt32BE(off + 1);
        const total = 1 + len;
        if (off + total > all.length) break;
        if (msgType === type) {
          msgs.push(all.subarray(off, off + total));
        }
        off += total;
      }
      return msgs;
    }
  }

  const socket = new TestSocket();
  const adapter = {
    authenticate: async (id) => ({sessionId: id, tenantId: 'test'}),
    execute: async () => {
      const err = new Error('begin failed');
      err.sqlState = '40001';
      throw err;
    },
    closeSession: () => {},
  };
  const handler = new PgWireProtocolHandler({
    adapter,
    socket,
    logger: {debug() {}, info() {}, warn() {}, error() {}},
  });
  handler.start();

  const startupPayload = Buffer.concat([
    Buffer.alloc(4),
    Buffer.from('user\0test\0database\0test\0\0'),
  ]);
  startupPayload.writeInt32BE(PG_PROTOCOL_VERSION.CODE, 0);
  const startupBuf = Buffer.alloc(4 + startupPayload.length);
  startupBuf.writeInt32BE(startupBuf.length, 0);
  startupPayload.copy(startupBuf, 4);
  socket.emit('data', startupBuf);
  await new Promise((r) => setImmediate(r));

  socket.written = [];
  const qStr = 'BEGIN\0';
  const qBuf = Buffer.alloc(5 + Buffer.byteLength(qStr));
  qBuf[0] = PG_FRONTEND_MSG.QUERY;
  qBuf.writeInt32BE(4 + Buffer.byteLength(qStr), 1);
  qBuf.write(qStr, 5);
  socket.emit('data', qBuf);
  await new Promise((r) => setImmediate(r));

  const rfq = socket.findMessages(PG_BACKEND_MSG.READY_FOR_QUERY);
  t.ok(rfq.length > 0, 'received ReadyForQuery');
  t.equal(rfq[0][5], PG_TRANSACTION_STATE.IDLE, 'session state is IDLE, not FAILED');
  handler.destroy();
});

test('DistributedTransactionCoordinator - runRecoverySweep does not import non-expired ACTIVE transactions and evicts terminal or superseded', async (t) => {
  let currentTime = 1000;
  let sweepState = {
    transactions: [
      {
        transaction_id: 'tx-remote-active',
        session_id: 'session-remote',
        status: TRANSACTION_STATUS.ACTIVE,
        created_at: 950,
        updated_at: 950,
        timeout_deadline: 2000,
        ...frozenTransactionDecision(1),
      },
    ],
    participants: [
      {
        participant_id: 'tx-remote-active:p1',
        transaction_id: 'tx-remote-active',
        partition_id: 'p1',
        status: 'ACTIVE',
        created_at: 950,
        updated_at: 950,
      },
    ],
  };

  const coordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => currentTime,
    loadRecoveryStateForSweep: async () => sweepState,
  });

  // 1. runRecoverySweep() when now (1000) < timeout_deadline (2000):
  // non-expired ACTIVE transaction must NOT be imported into memory!
  await coordinator.runRecoverySweep();
  t.equal(coordinator.transactions.has('tx-remote-active'), false, 'non-expired active tx not imported');
  t.equal(coordinator.hasActiveTransaction('session-remote'), false, 'session has no active tx');

  // 2. Now let's simulate that an expired transaction was imported in sweep:
  currentTime = 2500;
  await coordinator.runRecoverySweep();
  t.equal(coordinator.transactions.has('tx-remote-active'), true, 'expired tx was imported for sweep');
  t.equal(coordinator.recoveredTransactionIds.has('tx-remote-active'), true, 'tx marked as recovered');

  // 3. Next sweep: the remote node committed the transaction, so DB returns COMMITTED.
  sweepState = {
    transactions: [
      {
        transaction_id: 'tx-remote-active',
        session_id: 'session-remote',
        status: TRANSACTION_STATUS.COMMITTED,
        created_at: 950,
        updated_at: 1050,
        timeout_deadline: 2000,
        ...frozenTransactionDecision(1),
      },
    ],
    participants: [],
  };
  await coordinator.runRecoverySweep();
  t.equal(coordinator.transactions.has('tx-remote-active'), false, 'transitioned committed tx evicted from memory');
  t.equal(coordinator.recoveredTransactionIds.has('tx-remote-active'), false, 'evicted from recoveredTransactionIds');
  t.equal(coordinator.hasActiveTransaction('session-remote'), false, 'session has no active tx');

  // 4. Test eviction when superseded by a newer transaction on the same session:
  currentTime = 3000;
  sweepState = {
    transactions: [
      {
        transaction_id: 'tx-stale',
        session_id: 'session-superseded',
        status: TRANSACTION_STATUS.ACTIVE,
        created_at: 2000,
        updated_at: 2000,
        timeout_deadline: 2500,
        ...frozenTransactionDecision(0),
      },
    ],
    participants: [],
  };
  await coordinator.runRecoverySweep();
  t.equal(coordinator.transactions.has('tx-stale'), true, 'tx-stale imported because expired');

  // Newer transaction on same session:
  sweepState = {
    transactions: [
      {
        transaction_id: 'tx-stale',
        session_id: 'session-superseded',
        status: TRANSACTION_STATUS.ACTIVE,
        created_at: 2000,
        updated_at: 2000,
        timeout_deadline: 2500,
        ...frozenTransactionDecision(0),
      },
      {
        transaction_id: 'tx-newer',
        session_id: 'session-superseded',
        status: TRANSACTION_STATUS.COMMITTED,
        created_at: 2600,
        updated_at: 2700,
        timeout_deadline: 3500,
        ...frozenTransactionDecision(0),
      },
    ],
    participants: [],
  };
  await coordinator.runRecoverySweep();
  t.equal(coordinator.transactions.has('tx-stale'), false, 'stale tx evicted when superseded by newer session tx');
  t.equal(coordinator.recoveredTransactionIds.has('tx-stale'), false, 'tx-stale removed from recoveredTransactionIds');
});

test('PartitionService - rollbackTransaction with stale epoch returns idempotent success without rolling back active transaction', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-epoch-fence-'));
  const dbPath = path.join(dir, 'partition.db');
  t.teardown(() => fs.rmSync(dir, {recursive: true, force: true}));

  const partition = new PartitionService({
    partitionId: 'p-test',
    tableId: 't-test',
    tableName: 't_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-test',
    schema: {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ],
    },
    dbPath,
  });
  await partition.initialize();
  try {
    const sessionId = 'session-fenced';
    const activeEpoch = 200;
    const beginRes = await partition.beginTransaction(sessionId, activeEpoch);
    t.equal(beginRes.success, true);
    t.equal(partition.activeTransactions.has(sessionId), true);

    // Rollback with stale epoch (100 < 200): must return idempotent success without rolling back!
    const staleRollbackRes = await partition.rollbackTransaction(sessionId, 100);
    t.equal(staleRollbackRes.success, true);
    t.equal(staleRollbackRes.rolledBack, true);
    t.equal(staleRollbackRes.idempotent, true);
    t.equal(partition.activeTransactions.has(sessionId), true, 'active transaction remains intact');

    // Rollback with matching epoch (200): rolls back cleanly!
    const matchingRollbackRes = await partition.rollbackTransaction(sessionId, 200);
    t.equal(matchingRollbackRes.success, true);
    t.equal(partition.activeTransactions.has(sessionId), false, 'transaction is now rolled back');
  } finally {
    await partition.shutdown();
  }
});
