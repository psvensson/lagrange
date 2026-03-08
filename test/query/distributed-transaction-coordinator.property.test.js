import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  DistributedTransactionCoordinator,
  TRANSACTION_STATUS,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_ERROR_CODE, QUERY_OPERATION} from '../../src/query/query-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const sessionIdArb = fc.stringMatching(/^[a-z0-9-]{3,24}$/);
const partitionIdArb = fc.stringMatching(/^p-[a-z0-9-]{1,12}$/);

// ---------------------------------------------------------------------------
// Property 9: Epoch monotonicity
// Validates: Requirements 5.1, 7.1
// ---------------------------------------------------------------------------
test(
  'Property 9: transaction epochs are strictly monotonic across begin calls',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(sessionIdArb, {minLength: 2, maxLength: 25}),
        fc.integer({min: 1, max: 1_000_000}),
        async (sessionIds, initialEpoch) => {
          let nextEpoch = initialEpoch;
          const coordinator = new DistributedTransactionCoordinator({
            epochSource: () => {
              nextEpoch += 1;
              return nextEpoch;
            },
          });

          const observedEpochs = [];
          for (const sessionId of sessionIds) {
            const beginResult = await coordinator.begin(sessionId);
            if (!beginResult.success) {
              return false;
            }
            observedEpochs.push(beginResult.transactionEpoch);
          }

          for (let i = 1; i < observedEpochs.length; i++) {
            if (!(observedEpochs[i] > observedEpochs[i - 1])) {
              return false;
            }
          }
          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('transaction epochs remain strictly monotonic');
  },
);

// ---------------------------------------------------------------------------
// Property 2: Decision persistence precedes participant messages
// Validates: Requirements 2.1, 3.1
// ---------------------------------------------------------------------------
test(
  'Property 2: commit/rollback decision persistence happens before participant delivery',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(partitionIdArb, {minLength: 1, maxLength: 5}),
        async (partitionIds) => {
          const events = [];
          const coordinator = new DistributedTransactionCoordinator({
            beginParticipant: async () => {},
            prepareParticipant: async () => {},
            commitParticipant: async (_sessionId, partitionId) => {
              events.push(`commit:${partitionId}`);
            },
            rollbackParticipant: async (_sessionId, partitionId) => {
              events.push(`rollback:${partitionId}`);
            },
            persistTransaction: async (record) => {
              events.push(`persist:${record.status}`);
            },
          });

          await coordinator.begin('property-2-commit');
          await coordinator.enlistParticipants('property-2-commit', partitionIds);
          events.length = 0;
          const commitResult = await coordinator.commit('property-2-commit');
          if (!commitResult.success) {
            return false;
          }

          const commitDecisionIndex = events.indexOf(
            `persist:${TRANSACTION_STATUS.COMMITTING}`,
          );
          const firstCommitDeliveryIndex = events.findIndex((event) =>
            event.startsWith('commit:'),
          );
          if (commitDecisionIndex === -1 ||
            firstCommitDeliveryIndex === -1 ||
            commitDecisionIndex >= firstCommitDeliveryIndex) {
            return false;
          }

          await coordinator.begin('property-2-rollback');
          await coordinator.enlistParticipants('property-2-rollback', partitionIds);
          events.length = 0;
          const rollbackResult = await coordinator.rollback('property-2-rollback');
          if (!rollbackResult.success) {
            return false;
          }

          const rollbackDecisionIndex = events.indexOf(
            `persist:${TRANSACTION_STATUS.ROLLING_BACK}`,
          );
          const firstRollbackDeliveryIndex = events.findIndex((event) =>
            event.startsWith('rollback:'),
          );
          return rollbackDecisionIndex !== -1 &&
            firstRollbackDeliveryIndex !== -1 &&
            rollbackDecisionIndex < firstRollbackDeliveryIndex;
        },
      ),
      {numRuns: 10},
    );

    t.pass('decision persistence always precedes participant message delivery');
  },
);

// ---------------------------------------------------------------------------
// Property 4: Participant retries use bounded exponential backoff
// Validates: Requirements 2.3, 3.3, 4.5
// ---------------------------------------------------------------------------
test(
  'Property 4: participant retries are bounded and delays grow exponentially',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(partitionIdArb, {minLength: 1, maxLength: 4}),
        fc.integer({min: 0, max: 6}),
        fc.constantFrom(QUERY_OPERATION.COMMIT, QUERY_OPERATION.ROLLBACK),
        async (partitionIds, failCount, operationType) => {
          const targetPartitionId = partitionIds[0];
          const baseDelayMs = 5;
          const maxDelayMs = 20;
          const maxRetries = 3;
          const observedDelays = [];
          let attempts = 0;

          const coordinator = new DistributedTransactionCoordinator({
            participantRetryMaxRetries: maxRetries,
            participantRetryBaseDelayMs: baseDelayMs,
            participantRetryMaxDelayMs: maxDelayMs,
            sleep: async (delayMs) => {
              observedDelays.push(delayMs);
            },
            beginParticipant: async () => {},
            prepareParticipant: async () => {},
            commitParticipant: async (_sessionId, partitionId) => {
              if (operationType !== QUERY_OPERATION.COMMIT ||
                partitionId !== targetPartitionId) {
                return;
              }
              attempts += 1;
              if (attempts <= failCount) {
                throw new Error('commit-retry');
              }
            },
            rollbackParticipant: async (_sessionId, partitionId) => {
              if (operationType !== QUERY_OPERATION.ROLLBACK ||
                partitionId !== targetPartitionId) {
                return;
              }
              attempts += 1;
              if (attempts <= failCount) {
                throw new Error('rollback-retry');
              }
            },
          });

          const sessionId = `property-4-${operationType}`;
          await coordinator.begin(sessionId);
          await coordinator.enlistParticipants(sessionId, partitionIds);

          const result = operationType === QUERY_OPERATION.COMMIT ?
            await coordinator.commit(sessionId) :
            await coordinator.rollback(sessionId);
          const shouldSucceed = failCount <= maxRetries;
          if (result.success !== shouldSucceed) {
            return false;
          }

          const expectedRetryCount = shouldSucceed ?
            failCount :
            maxRetries;
          if (observedDelays.length !== expectedRetryCount) {
            return false;
          }
          for (let i = 0; i < observedDelays.length; i++) {
            const expectedDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** i));
            if (observedDelays[i] !== expectedDelay) {
              return false;
            }
          }

          const expectedAttempts = shouldSucceed ?
            failCount + 1 :
            maxRetries + 1;
          return attempts === expectedAttempts;
        },
      ),
      {numRuns: 10},
    );

    t.pass('participant retries follow bounded exponential backoff');
  },
);

// ---------------------------------------------------------------------------
// Property 3: Prepare failure triggers rollback for all participants
// Validates: Requirements 2.5, 6.2
// ---------------------------------------------------------------------------
test(
  'Property 3: prepare failure causes rollback delivery to all enlisted participants',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(partitionIdArb, {minLength: 1, maxLength: 5}),
        async (partitionIds) => {
          const rollbackCalls = [];
          const failingPartitionId = partitionIds[0];
          const sessionId = 'property-3-session';
          const coordinator = new DistributedTransactionCoordinator({
            beginParticipant: async () => {},
            prepareParticipant: async (_session, partitionId) => {
              if (partitionId === failingPartitionId) {
                throw new Error('prepare-failure');
              }
            },
            commitParticipant: async () => {},
            rollbackParticipant: async (_session, partitionId) => {
              rollbackCalls.push(partitionId);
            },
          });

          await coordinator.begin(sessionId);
          await coordinator.enlistParticipants(sessionId, partitionIds);
          const result = await coordinator.commit(sessionId);
          if (result.success !== false) {
            return false;
          }

          const rollbackCallSet = new Set(rollbackCalls);
          for (const partitionId of partitionIds) {
            if (!rollbackCallSet.has(partitionId)) {
              return false;
            }
          }
          return coordinator.getTransaction(sessionId) === null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('prepare failures trigger rollback delivery for all enlisted participants');
  },
);

// ---------------------------------------------------------------------------
// Property 8: Transaction epoch round-trip through persistence
// Validates: Requirements 7.4, 7.5
// ---------------------------------------------------------------------------
test(
  'Property 8: persisted transaction epoch is restored during recovery',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        sessionIdArb,
        fc.integer({min: 1, max: 1_000_000}),
        async (sessionId, initialEpoch) => {
          const persistedTransactions = [];
          let nextEpoch = initialEpoch;
          const sourceCoordinator = new DistributedTransactionCoordinator({
            epochSource: () => {
              nextEpoch += 1;
              return nextEpoch;
            },
            persistTransaction: async (record) => {
              persistedTransactions.push({...record});
            },
          });

          const beginResult = await sourceCoordinator.begin(sessionId);
          if (!beginResult.success) {
            return false;
          }

          const persisted = persistedTransactions[persistedTransactions.length - 1];
          if (!persisted) {
            return false;
          }

          const recoveredCoordinator = new DistributedTransactionCoordinator();
          recoveredCoordinator.recoverFromSystemTables({
            transactions: [
              {
                transaction_id: persisted.transactionId,
                session_id: persisted.sessionId,
                status: persisted.status,
                transaction_epoch: persisted.transactionEpoch,
                timeout_deadline: persisted.timeoutDeadline,
                created_at: persisted.createdAt,
                updated_at: persisted.updatedAt,
              },
            ],
            participants: [],
            writeOperations: [],
          });

          const recovered = recoveredCoordinator.getTransaction(sessionId);
          if (!recovered) {
            return false;
          }

          return beginResult.transactionEpoch === recovered.transactionEpoch;
        },
      ),
      {numRuns: 10},
    );

    t.pass('transaction epoch round-trips through persistence and recovery');
  },
);

// ---------------------------------------------------------------------------
// Property 17: Epoch propagation in begin message
// Validates: Requirements 7.2
// ---------------------------------------------------------------------------
test(
  'Property 17: participant BEGIN delivery payload includes transaction epoch',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        sessionIdArb,
        partitionIdArb,
        fc.integer({min: 1, max: 1_000_000}),
        async (sessionId, partitionId, initialEpoch) => {
          let nextEpoch = initialEpoch;
          const deliveredMessages = [];
          const engine = new SQLQueryEngine({
            systemCache: {
              get: () => null,
              getAll: () => [],
              filter: () => [],
            },
            messageRouter: {
              deliver: async (_address, payload) => {
                deliveredMessages.push(payload);
                return {acknowledged: true, success: true};
              },
            },
            transactionEpochSource: () => {
              nextEpoch += 1;
              return nextEpoch;
            },
          });

          engine.queryExecutor.findPartitionService = () => ({
            address: `node-1/partition/${partitionId}`,
          });

          const beginResult = await engine.transactionCoordinator.begin(sessionId);
          if (!beginResult.success) {
            return false;
          }

          const enlistResult = await engine.transactionCoordinator.enlistParticipants(
            sessionId,
            [partitionId],
          );
          if (!enlistResult.success) {
            return false;
          }

          const beginMessage = deliveredMessages.find((payload) =>
            payload.type === QUERY_OPERATION.TRANSACTION &&
            payload.operation === QUERY_OPERATION.BEGIN,
          );
          if (!beginMessage) {
            return false;
          }

          return beginMessage.transactionEpoch === beginResult.transactionEpoch;
        },
      ),
      {numRuns: 10},
    );

    t.pass('transaction epoch is propagated to participant begin delivery');
  },
);

// ---------------------------------------------------------------------------
// Property 7: Recovery drives transactions to correct terminal state
// Validates: Requirements 4.1, 4.2, 4.3, 4.4
// ---------------------------------------------------------------------------
test(
  'Property 7: recovery replays commit-or-rollback lanes and reaches terminal state',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(
          fc.record({
            sessionId: sessionIdArb,
            status: fc.constantFrom(
              TRANSACTION_STATUS.ACTIVE,
              TRANSACTION_STATUS.PREPARING,
              TRANSACTION_STATUS.PREPARED,
              TRANSACTION_STATUS.COMMITTING,
            ),
            participantCount: fc.integer({min: 1, max: 3}),
          }),
          {
            minLength: 1,
            maxLength: 5,
            selector: (entry) => entry.sessionId,
          },
        ),
        async (recoveredTransactions) => {
          const commitCalls = [];
          const rollbackCalls = [];
          const retryDiagnostics = [];
          const failOnce = new Set();

          const coordinator = new DistributedTransactionCoordinator({
            participantRetryMaxRetries: 2,
            participantRetryBaseDelayMs: 1,
            participantRetryMaxDelayMs: 2,
            sleep: async () => {},
            onParticipantRetry: (diagnostic) => {
              retryDiagnostics.push(diagnostic);
            },
            commitParticipant: async (sessionId, partitionId) => {
              const key = `commit:${sessionId}:${partitionId}`;
              if (failOnce.has(key)) {
                failOnce.delete(key);
                throw new Error('participant-unreachable');
              }
              commitCalls.push(key);
            },
            rollbackParticipant: async (sessionId, partitionId) => {
              const key = `rollback:${sessionId}:${partitionId}`;
              if (failOnce.has(key)) {
                failOnce.delete(key);
                throw new Error('participant-unreachable');
              }
              rollbackCalls.push(key);
            },
          });

          const transactionRows = [];
          const participantRows = [];
          for (const [txIndex, recovered] of recoveredTransactions.entries()) {
            const transactionId = `tx-recovery-property-${txIndex}`;
            transactionRows.push({
              transaction_id: transactionId,
              session_id: recovered.sessionId,
              status: recovered.status,
              created_at: 1,
              updated_at: 1,
            });

            const operationPrefix =
              recovered.status === TRANSACTION_STATUS.PREPARED ||
              recovered.status === TRANSACTION_STATUS.COMMITTING ?
                'commit' :
                'rollback';
            for (let participantIndex = 0;
              participantIndex < recovered.participantCount;
              participantIndex += 1) {
              const partitionId = `p-${txIndex}-${participantIndex}`;
              participantRows.push({
                participant_id: `${transactionId}:${partitionId}`,
                transaction_id: transactionId,
                partition_id: partitionId,
                status: TRANSACTION_STATUS.ACTIVE,
                created_at: 1,
                updated_at: 1,
              });
              if (participantIndex === 0) {
                failOnce.add(`${operationPrefix}:${recovered.sessionId}:${partitionId}`);
              }
            }
          }

          coordinator.recoverFromSystemTables({
            transactions: transactionRows,
            participants: participantRows,
            writeOperations: [],
          });

          const recovery = await coordinator.resumeRecoveredTransactions();
          if (recovery.failed !== 0 || recovery.resumed !== recoveredTransactions.length) {
            return false;
          }

          for (const recovered of recoveredTransactions) {
            if (coordinator.getTransaction(recovered.sessionId) !== null) {
              return false;
            }
          }

          const replayBySessionId = new Map(
            recovery.results.map((entry) => [entry.sessionId, entry]),
          );
          for (const recovered of recoveredTransactions) {
            const replayResult = replayBySessionId.get(recovered.sessionId);
            if (!replayResult) {
              return false;
            }
            if (recovered.status === TRANSACTION_STATUS.PREPARED ||
              recovered.status === TRANSACTION_STATUS.COMMITTING) {
              if (replayResult.replayPath !== QUERY_OPERATION.COMMIT ||
                replayResult.statusAfter !== TRANSACTION_STATUS.COMMITTED) {
                return false;
              }
            } else if (replayResult.replayPath !== QUERY_OPERATION.ROLLBACK ||
              replayResult.statusAfter !== TRANSACTION_STATUS.ROLLED_BACK) {
              return false;
            }
          }

          return retryDiagnostics.length >= recoveredTransactions.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('recovery replay reaches terminal state using the correct lane');
  },
);

// ---------------------------------------------------------------------------
// Property 14: Transaction timeout triggers rollback
// Validates: Requirements 9.1, 9.2
// ---------------------------------------------------------------------------
test(
  'Property 14: timeout budget exhaustion triggers rollback for all enlisted participants',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(partitionIdArb, {minLength: 1, maxLength: 4}),
        fc.integer({min: 1, max: 50}),
        async (partitionIds, transactionBudgetMs) => {
          let nowMs = 1_000;
          const rollbackCalls = [];
          const coordinator = new DistributedTransactionCoordinator({
            now: () => nowMs,
            transactionBudgetMs,
            beginParticipant: async () => {},
            prepareParticipant: async () => {},
            commitParticipant: async () => {},
            rollbackParticipant: async (_sessionId, partitionId) => {
              rollbackCalls.push(partitionId);
            },
          });

          const sessionId = 'property-14-session';
          const beginResult = await coordinator.begin(sessionId);
          if (!beginResult.success) {
            return false;
          }
          const transaction = coordinator.getTransaction(sessionId);
          if (!transaction) {
            return false;
          }
          if (transaction.timeoutDeadline !== 1_000 + transactionBudgetMs) {
            return false;
          }

          const enlistResult = await coordinator.enlistParticipants(
            sessionId,
            partitionIds,
          );
          if (!enlistResult.success) {
            return false;
          }

          nowMs = transaction.timeoutDeadline + 1;
          const commitResult = await coordinator.commit(sessionId);
          if (commitResult.success !== false ||
            commitResult.errorCode !== QUERY_ERROR_CODE.TIMEOUT) {
            return false;
          }

          const rollbackCallSet = new Set(rollbackCalls);
          for (const partitionId of partitionIds) {
            if (!rollbackCallSet.has(partitionId)) {
              return false;
            }
          }
          return coordinator.getTransaction(sessionId) === null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('timeout budget exhaustion aborts transaction and triggers rollback');
  },
);

// ---------------------------------------------------------------------------
// Property 16: Recovery sweep resolves stuck transactions
// Validates: Requirements 9.5
// ---------------------------------------------------------------------------
test(
  'Property 16: recovery sweep resolves timed-out non-terminal transactions',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          TRANSACTION_STATUS.ACTIVE,
          TRANSACTION_STATUS.PREPARING,
          TRANSACTION_STATUS.PREPARED,
          TRANSACTION_STATUS.COMMITTING,
        ),
        fc.uniqueArray(partitionIdArb, {minLength: 1, maxLength: 4}),
        async (status, partitionIds) => {
          const nowMs = 10_000;
          const sessionId = 'property-16-session';
          const transactionId = 'tx-property-16';
          const commitCalls = [];
          const rollbackCalls = [];
          const coordinator = new DistributedTransactionCoordinator({
            now: () => nowMs,
            loadRecoveryStateForSweep: async () => ({
              transactions: [
                {
                  transaction_id: transactionId,
                  session_id: sessionId,
                  status,
                  timeout_deadline: nowMs - 1,
                  created_at: 1,
                  updated_at: 1,
                },
              ],
              participants: partitionIds.map((partitionId) => ({
                participant_id: `${transactionId}:${partitionId}`,
                transaction_id: transactionId,
                partition_id: partitionId,
                status: TRANSACTION_STATUS.ACTIVE,
                created_at: 1,
                updated_at: 1,
              })),
              writeOperations: [],
            }),
            beginParticipant: async () => {},
            prepareParticipant: async () => {},
            commitParticipant: async (_sessionId, partitionId) => {
              commitCalls.push(partitionId);
            },
            rollbackParticipant: async (_sessionId, partitionId) => {
              rollbackCalls.push(partitionId);
            },
          });

          const sweep = await coordinator.runRecoverySweep();
          if (sweep.skipped || sweep.swept !== 1 || sweep.failed !== 0) {
            return false;
          }
          if (coordinator.getTransaction(sessionId) !== null) {
            return false;
          }

          const isCommitLane = status === TRANSACTION_STATUS.PREPARED ||
            status === TRANSACTION_STATUS.COMMITTING;
          if (isCommitLane) {
            const commitCallSet = new Set(commitCalls);
            for (const partitionId of partitionIds) {
              if (!commitCallSet.has(partitionId)) {
                return false;
              }
            }
            return rollbackCalls.length === 0;
          }

          const rollbackCallSet = new Set(rollbackCalls);
          for (const partitionId of partitionIds) {
            if (!rollbackCallSet.has(partitionId)) {
              return false;
            }
          }
          return commitCalls.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('recovery sweep resolves timed-out transactions to terminal state');
  },
);
