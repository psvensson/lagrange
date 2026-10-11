import {test} from '../../src/test-helpers/tap.js';
import {
  DistributedTransactionCoordinator,
  TRANSACTION_STATUS,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
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
import {buildTransactionDecisionRecord} from
  '../../src/query/distributed/distributed-transaction-decision.js';
import {
  answerParticipantTransactionRequest,
  preparedDigestOf,
} from '../test-helpers/participant-protocol-double.js';

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

const RECOVERY_EPOCH = 7;
const RECOVERY_DEADLINE = 30_000;
const PREPARE_INDEX = 2;
const PREPARE_TERM = 1;

function participantAnswer(operation, partitionId, request = {}) {
  return answerParticipantTransactionRequest({...request, operation}, partitionId);
}

function successfulParticipant(operation, observe = null) {
  return async (sessionId, partitionId, request = {}) => {
    await observe?.(sessionId, partitionId, request);
    return participantAnswer(operation, partitionId, request);
  };
}

function recoveryTransaction(transactionId, sessionId, status, partitionIds,
  fields = {}) {
  return {
    transaction_id: transactionId,
    session_id: sessionId,
    transaction_epoch: RECOVERY_EPOCH,
    timeout_deadline: RECOVERY_DEADLINE,
    status,
    participant_set_text: JSON.stringify(partitionIds.map((partitionId) =>
      [`${transactionId}:${partitionId}`, partitionId])),
    created_at: 1,
    updated_at: 1,
    ...fields,
  };
}

function recoveryParticipant(transactionId, partitionId, status, fields = {}) {
  return {
    participant_id: `${transactionId}:${partitionId}`,
    transaction_id: transactionId,
    partition_id: partitionId,
    status,
    created_at: 1,
    updated_at: 1,
    ...fields,
  };
}

function retainedPrepareEvidence(transactionId, partitionId) {
  return {
    prepared_digest: preparedDigestOf(`${transactionId}:${partitionId}`),
    prepare_index: PREPARE_INDEX,
    prepare_term: PREPARE_TERM,
  };
}

function recordedDecisionFields(transactionId, partitionIds, decision = 'COMMIT') {
  const participants = new Map(partitionIds.map((partitionId) => [partitionId, {
    partitionId,
    preparedDigest: preparedDigestOf(`${transactionId}:${partitionId}`),
  }]));
  const record = buildTransactionDecisionRecord({transactionId, participants}, decision);
  return {
    decision: record.decision,
    decision_text: record.decisionText,
    decision_digest: record.decisionDigest,
  };
}

test('DistributedTransactionCoordinator - enlists participants and commits', async (t) => {
  const calls = [];
  const coordinator = new DistributedTransactionCoordinator({
    beginParticipant: successfulParticipant(QUERY_OPERATION.BEGIN,
      (sessionId, partitionId) => calls.push(`begin:${sessionId}:${partitionId}`)),
    prepareParticipant: successfulParticipant(QUERY_OPERATION.PREPARE,
      (sessionId, partitionId) => calls.push(`prepare:${sessionId}:${partitionId}`)),
    commitParticipant: successfulParticipant(QUERY_OPERATION.COMMIT,
      (sessionId, partitionId) => calls.push(`commit:${sessionId}:${partitionId}`)),
    rollbackParticipant: successfulParticipant(QUERY_OPERATION.ROLLBACK,
      (sessionId, partitionId) => calls.push(`rollback:${sessionId}:${partitionId}`)),
    now: () => 1000,
  });

  const beginResult = await coordinator.begin('s1');
  t.equal(beginResult.success, true);
  t.match(beginResult.transactionId, /^[0-9a-f]{32}$/u);

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
    'prepare:s1:p1',
    'prepare:s1:p2',
    'commit:s1:p1',
    'commit:s1:p2',
  ]);
});

test(
  'DistributedTransactionCoordinator - commit failure surfaces failed participants',
  async (t) => {
    const coordinator = new DistributedTransactionCoordinator({
      beginParticipant: successfulParticipant(QUERY_OPERATION.BEGIN),
      prepareParticipant: successfulParticipant(QUERY_OPERATION.PREPARE),
      commitParticipant: async (_sessionId, partitionId, request) => {
        if (partitionId === 'p2') {
          throw new Error('commit failed');
        }
        return participantAnswer(QUERY_OPERATION.COMMIT, partitionId, request);
      },
      rollbackParticipant: successfulParticipant(QUERY_OPERATION.ROLLBACK),
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
    beginParticipant: successfulParticipant(QUERY_OPERATION.BEGIN),
    prepareParticipant: successfulParticipant(QUERY_OPERATION.PREPARE),
    commitParticipant: successfulParticipant(QUERY_OPERATION.COMMIT),
    rollbackParticipant: successfulParticipant(QUERY_OPERATION.ROLLBACK,
      (_sessionId, partitionId) => calls.push(partitionId)),
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
    beginParticipant: successfulParticipant(QUERY_OPERATION.BEGIN),
    prepareParticipant: successfulParticipant(QUERY_OPERATION.PREPARE),
    commitParticipant: successfulParticipant(QUERY_OPERATION.COMMIT),
    rollbackParticipant: async (_sessionId, partitionId, request) => {
      calls.push(partitionId);
      if (partitionId === failPartition) {
        throw new Error('rollback failed');
      }
      return participantAnswer(QUERY_OPERATION.ROLLBACK, partitionId, request);
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
            transaction_epoch: RECOVERY_EPOCH,
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
      beginParticipant: successfulParticipant(QUERY_OPERATION.BEGIN),
      rollbackParticipant: successfulParticipant(QUERY_OPERATION.ROLLBACK),
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
      transactionEpoch: RECOVERY_EPOCH,
      timeoutDeadline: RECOVERY_DEADLINE,
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
      beginParticipant: successfulParticipant(QUERY_OPERATION.BEGIN),
      prepareParticipant: async (_sessionId, partitionId, request) => {
        if (partitionId === 'p2') {
          throw new Error('prepare failed');
        }
        return participantAnswer(QUERY_OPERATION.PREPARE, partitionId, request);
      },
      commitParticipant: successfulParticipant(QUERY_OPERATION.COMMIT),
      rollbackParticipant: successfulParticipant(QUERY_OPERATION.ROLLBACK),
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
    beginParticipant: successfulParticipant(QUERY_OPERATION.BEGIN),
    prepareParticipant: successfulParticipant(QUERY_OPERATION.PREPARE),
    commitParticipant: successfulParticipant(QUERY_OPERATION.COMMIT),
    rollbackParticipant: successfulParticipant(QUERY_OPERATION.ROLLBACK),
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
    const transactionId = '7'.repeat(32);
    coordinator.recoverFromSystemTables({
      transactions: [recoveryTransaction(
        transactionId, 's7', TRANSACTION_STATUS.PREPARED, ['p1'], {
        ...frozenTransactionDecision(1),
        updated_at: 2,
      })],
      participants: [recoveryParticipant(
        transactionId, 'p1', TRANSACTION_STATUS.PREPARED, {
        ...retainedPrepareEvidence(transactionId, 'p1'),
        updated_at: 2,
      })],
      writeOperations: [{
        operation_id: 'op-2',
        transaction_id: transactionId,
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
      beginParticipant: successfulParticipant(QUERY_OPERATION.BEGIN),
      prepareParticipant: successfulParticipant(QUERY_OPERATION.PREPARE),
      commitParticipant: successfulParticipant(QUERY_OPERATION.COMMIT),
      rollbackParticipant: successfulParticipant(QUERY_OPERATION.ROLLBACK),
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
    const transactionId = '8'.repeat(32);
    const prepareCalls = [];
    const commitCalls = [];
    const persistedStatuses = [];
    const coordinator = new DistributedTransactionCoordinator({
      prepareParticipant: async (sessionId, partitionId, request) => {
        prepareCalls.push(`${sessionId}:${partitionId}`);
        return participantAnswer(QUERY_OPERATION.PREPARE, partitionId, request);
      },
      commitParticipant: async (sessionId, partitionId, request) => {
        commitCalls.push(`${sessionId}:${partitionId}`);
        return participantAnswer(QUERY_OPERATION.COMMIT, partitionId, request);
      },
      persistTransaction: async (record) => {
        persistedStatuses.push(record.status);
      },
    });

    coordinator.recoverFromSystemTables({
      transactions: [recoveryTransaction(
        transactionId, 'recover-commit-1', TRANSACTION_STATUS.PREPARED,
        ['p1', 'p2'], {
        ...frozenTransactionDecision(2),
      })],
      participants: [
        recoveryParticipant(transactionId, 'p1', TRANSACTION_STATUS.ACTIVE),
        recoveryParticipant(transactionId, 'p2', TRANSACTION_STATUS.PREPARED,
          retainedPrepareEvidence(transactionId, 'p2')),
      ],
    });

    const recovery = await coordinator.resumeRecoveredTransactions();
    t.equal(recovery.totalRecovered, 1);
    t.equal(recovery.resumed, 1);
    t.equal(recovery.failed, 0);
    t.same(prepareCalls, ['recover-commit-1:p1']);
    t.same(commitCalls.sort(), ['recover-commit-1:p1', 'recover-commit-1:p2']);
    t.ok(persistedStatuses.includes(TRANSACTION_STATUS.COMMITTED));
    t.equal(coordinator.hasActiveTransaction('recover-commit-1'), false);
  });

test('DistributedTransactionCoordinator - recovery replay treats ' +
  'idempotent participant commit misses as committed', async (t) => {
  const transactionId = '9'.repeat(32);
  const commitCalls = [];
  const retryDiagnostics = [];
  const coordinator = new DistributedTransactionCoordinator({
    onParticipantRetry: (diagnostic) => {
      retryDiagnostics.push(diagnostic);
    },
    commitParticipant: async (sessionId, partitionId, request) => {
      commitCalls.push(`${sessionId}:${partitionId}`);
      if (partitionId === 'p1') {
        const error = new Error(QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT);
        error.errorCode = QUERY_ERROR_CODE.NO_TRANSACTION;
        throw error;
      }
      return participantAnswer(QUERY_OPERATION.COMMIT, partitionId, request);
    },
    resolveParticipantCommitOutcome: async () =>
      PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
  });

  coordinator.recoverFromSystemTables({
    transactions: [recoveryTransaction(
      transactionId, 'recover-idempotent-commit-1',
      TRANSACTION_STATUS.COMMITTING, ['p1', 'p2'], {
      ...frozenTransactionDecision(2),
      ...recordedDecisionFields(transactionId, ['p1', 'p2']),
    })],
    participants: [
      recoveryParticipant(transactionId, 'p1', TRANSACTION_STATUS.COMMITTING,
        retainedPrepareEvidence(transactionId, 'p1')),
      recoveryParticipant(transactionId, 'p2', TRANSACTION_STATUS.ACTIVE,
        retainedPrepareEvidence(transactionId, 'p2')),
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
    const transactionId = 'a'.repeat(32);
    const commitCalls = [];
    const coordinator = new DistributedTransactionCoordinator({
      commitParticipant: async (sessionId, partitionId, request) => {
        commitCalls.push(`${sessionId}:${partitionId}`);
        return participantAnswer(QUERY_OPERATION.COMMIT, partitionId, request);
      },
    });

    coordinator.recoverFromSystemTables({
      transactions: [recoveryTransaction(
        transactionId, 'recover-commit-2', TRANSACTION_STATUS.COMMITTING,
        ['p1', 'p2'], {
        ...frozenTransactionDecision(2),
        ...recordedDecisionFields(transactionId, ['p1', 'p2']),
      })],
      participants: [
        recoveryParticipant(transactionId, 'p1', TRANSACTION_STATUS.COMMITTED,
          retainedPrepareEvidence(transactionId, 'p1')),
        recoveryParticipant(transactionId, 'p2', TRANSACTION_STATUS.COMMITTING,
          retainedPrepareEvidence(transactionId, 'p2')),
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
    const transactionId = 'b'.repeat(32);
    const commitCalls = [];
    const rollbackCalls = [];
    const coordinator = new DistributedTransactionCoordinator({
      commitParticipant: async (sessionId, partitionId, request) => {
        commitCalls.push(`${sessionId}:${partitionId}`);
        return participantAnswer(QUERY_OPERATION.COMMIT, partitionId, request);
      },
      rollbackParticipant: async (sessionId, partitionId, request) => {
        rollbackCalls.push(`${sessionId}:${partitionId}`);
        return participantAnswer(QUERY_OPERATION.ROLLBACK, partitionId, request);
      },
    });

    coordinator.recoverFromSystemTables({
      transactions: [recoveryTransaction(
        transactionId, 'recover-preparing-1', TRANSACTION_STATUS.PREPARING,
        ['p1', 'p2'], frozenTransactionDecision(2),
      )],
      participants: [
        recoveryParticipant(transactionId, 'p1', TRANSACTION_STATUS.PREPARING),
        recoveryParticipant(transactionId, 'p2', TRANSACTION_STATUS.ACTIVE),
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
    const transactionId = 'c'.repeat(32);
    const rollbackCalls = [];
    const coordinator = new DistributedTransactionCoordinator({
      rollbackParticipant: async (sessionId, partitionId, request) => {
        rollbackCalls.push(`${sessionId}:${partitionId}`);
        return participantAnswer(QUERY_OPERATION.ROLLBACK, partitionId, request);
      },
    });

    coordinator.recoverFromSystemTables({
      transactions: [recoveryTransaction(
        transactionId, 'recover-rollback-1', TRANSACTION_STATUS.ROLLING_BACK,
        ['p1', 'p2'], OPEN_TRANSACTION_DECISION,
      )],
      participants: [
        recoveryParticipant(transactionId, 'p1', TRANSACTION_STATUS.ACTIVE),
        recoveryParticipant(transactionId, 'p2', TRANSACTION_STATUS.ROLLED_BACK),
      ],
    });

    const recovery = await coordinator.resumeRecoveredTransactions();
    t.equal(recovery.totalRecovered, 1);
    t.equal(recovery.resumed, 1);
    t.equal(recovery.failed, 0);
    t.same(rollbackCalls, ['recover-rollback-1:p1']);
    t.equal(coordinator.hasActiveTransaction('recover-rollback-1'), false);
  });

test('DistributedTransactionCoordinator - single participant uses prepare-first two phase',
  async (t) => {
    const prepareCalls = [];
    const coordinator = new DistributedTransactionCoordinator({
      beginParticipant: successfulParticipant(QUERY_OPERATION.BEGIN),
      prepareParticipant: async (sessionId, partitionId, request) => {
        prepareCalls.push(`${sessionId}:${partitionId}`);
        return participantAnswer(QUERY_OPERATION.PREPARE, partitionId, request);
      },
      commitParticipant: successfulParticipant(QUERY_OPERATION.COMMIT),
      resolveParticipantCommitOutcome: async () =>
        PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
    });

    await coordinator.begin('one-phase', {
      commitMode: COMMIT_MODE.TWO_PHASE_COMMIT,
    });
    await coordinator.enlistParticipants('one-phase', ['p1']);
    const result = await coordinator.commit('one-phase');

    t.equal(result.success, true);
    t.equal(result.commitMode, COMMIT_MODE.TWO_PHASE_COMMIT,
      'caller preference must not bypass prepare-first selection');
    t.same(prepareCalls, ['one-phase:p1'],
      'a single participant must retain PREPARE evidence before COMMIT');
    t.same(result.decisionTrace.map((entry) => entry.event), [
      'PARTICIPANT_SET_FROZEN',
      'COMMIT_MODE_SELECTED',
    ]);
  });

test('DistributedTransactionCoordinator - final second participant selects two phase',
  async (t) => {
    const prepareCalls = [];
    const coordinator = new DistributedTransactionCoordinator({
      beginParticipant: successfulParticipant(QUERY_OPERATION.BEGIN),
      prepareParticipant: async (_sessionId, partitionId, request) => {
        prepareCalls.push(partitionId);
        return participantAnswer(QUERY_OPERATION.PREPARE, partitionId, request);
      },
      commitParticipant: successfulParticipant(QUERY_OPERATION.COMMIT),
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
      beginParticipant: async (_sessionId, partitionId, request) => {
        participantBegins.push(partitionId);
        return participantAnswer(QUERY_OPERATION.BEGIN, partitionId, request);
      },
      prepareParticipant: successfulParticipant(QUERY_OPERATION.PREPARE),
      commitParticipant: successfulParticipant(QUERY_OPERATION.COMMIT),
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
      beginParticipant: async (_sessionId, partitionId, request) => {
        beginReached();
        await beginPaused;
        return participantAnswer(QUERY_OPERATION.BEGIN, partitionId, request);
      },
      prepareParticipant: successfulParticipant(QUERY_OPERATION.PREPARE),
      commitParticipant: successfulParticipant(QUERY_OPERATION.COMMIT),
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

test('DistributedTransactionCoordinator - prepare-first commit miss stays forward-only',
  async (t) => {
    const buildCoordinator = (outcome, rollbackCalls) =>
      new DistributedTransactionCoordinator({
        participantRetryMaxRetries: 0,
        beginParticipant: successfulParticipant(QUERY_OPERATION.BEGIN),
        prepareParticipant: successfulParticipant(QUERY_OPERATION.PREPARE),
        commitParticipant: async () => {
          const error = new Error(QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT);
          error.errorCode = QUERY_ERROR_CODE.NO_TRANSACTION;
          throw error;
        },
        rollbackParticipant: successfulParticipant(QUERY_OPERATION.ROLLBACK,
          (_sessionId, partitionId) => rollbackCalls.push(partitionId)),
        resolveParticipantCommitOutcome: async () => outcome,
      });

    const committedRollbacks = [];
    const committed = buildCoordinator(
      PARTICIPANT_COMMIT_OUTCOME.COMMITTED, committedRollbacks);
    await committed.begin('one-phase-ack-lost');
    await committed.enlistParticipants('one-phase-ack-lost', ['p1']);
    t.equal((await committed.commit('one-phase-ack-lost')).success, true,
      'durable committed outcome closes commit-before-ack replay');
    t.same(committedRollbacks, []);

    const notCommittedRollbacks = [];
    const notCommitted = buildCoordinator(
      PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED,
      notCommittedRollbacks,
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
    t.equal(notCommittedResult.deferred, true,
      'a durable COMMIT decision remains recovery debt after a missing terminal row');
    t.equal(notCommitted.getTransaction(
      'one-phase-restart-before-delivery').status, TRANSACTION_STATUS.COMMITTING);
    t.same(notCommittedRollbacks, [],
      'a recorded COMMIT is never rewritten as ROLLBACK');

    const unknownRollbacks = [];
    const unknown = buildCoordinator(
      PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, unknownRollbacks);
    await unknown.begin('one-phase-unknown');
    await unknown.enlistParticipants('one-phase-unknown', ['p1']);
    const unknownResult = await unknown.commit('one-phase-unknown');
    t.equal(unknownResult.deferred, true);
    t.equal(
      unknown.getTransaction('one-phase-unknown').status,
      TRANSACTION_STATUS.COMMITTING,
    );
    t.same(unknownRollbacks, []);
  });

test('DistributedTransactionCoordinator - recovery rejects incomplete frozen set',
  async (t) => {
    const coordinator = new DistributedTransactionCoordinator();
    const transactionId = 'd'.repeat(32);
    t.throws(() => coordinator.recoverFromSystemTables({
      transactions: [recoveryTransaction(
        transactionId, 'incomplete-frozen', TRANSACTION_STATUS.COMMITTING,
        ['p1', 'p2'], frozenTransactionDecision(2),
      )],
      participants: [recoveryParticipant(
        transactionId, 'p1', TRANSACTION_STATUS.COMMITTING,
        retainedPrepareEvidence(transactionId, 'p1'),
      )],
    }), {
      message: QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE,
    });
  });

test('DistributedTransactionCoordinator - recovery rejects multi-participant 1PC',
  async (t) => {
    const coordinator = new DistributedTransactionCoordinator();
    const transactionId = 'e'.repeat(32);
    const payload = {
      transactions: [recoveryTransaction(
        transactionId, 'invalid-one-phase', TRANSACTION_STATUS.COMMITTING,
        ['p1', 'p2'], {
          ...frozenTransactionDecision(2),
          commit_mode: COMMIT_MODE.ONE_PHASE_COMMIT,
        },
      )],
      participants: ['p1', 'p2'].map((partitionId) => recoveryParticipant(
        transactionId, partitionId, TRANSACTION_STATUS.COMMITTING,
        retainedPrepareEvidence(transactionId, partitionId),
      )),
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
