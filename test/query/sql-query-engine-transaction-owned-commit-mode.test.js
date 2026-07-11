import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  DistributedTransactionCoordinator,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  COMMIT_MODE,
  PARTICIPANT_SET_STATE,
  PARTICIPANT_COMMIT_OUTCOME,
} from '../../src/constants/index.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../../src/query/query-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
} from './sql-query-engine-test-support.js';

ConfigurationManager.getInstance().initialize();

function buildEngineHarness(partitionIds) {
  const participantCalls = [];
  const transactionCoordinator = new DistributedTransactionCoordinator({
    beginParticipant: async (sessionId, partitionId) => {
      participantCalls.push(`begin:${sessionId}:${partitionId}`);
    },
    prepareParticipant: async (sessionId, partitionId) => {
      participantCalls.push(`prepare:${sessionId}:${partitionId}`);
    },
    commitParticipant: async (sessionId, partitionId) => {
      participantCalls.push(`commit:${sessionId}:${partitionId}`);
    },
    rollbackParticipant: async (sessionId, partitionId) => {
      participantCalls.push(`rollback:${sessionId}:${partitionId}`);
    },
    resolveParticipantCommitOutcome: async () =>
      PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
  });
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    partitionIds.map((partitionId) => ({
      partition_id: partitionId,
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    })),
  );
  const executePlanCalls = [];
  const distributedWriteCoordinator = {
    createWritePlan() {
      return {
        operationId: `write-${partitionIds.join('-')}`,
        idempotencyKey: `write-${partitionIds.join('-')}`,
        statementType: 'UPDATE',
        partitionStatements: new Map(partitionIds.map((partitionId) => [
          partitionId,
          {
            ast: {type: 'UPDATE', table: 'users'},
            role: 'primary',
            executionOptions: {},
          },
        ])),
      };
    },
    async executePlan(_plan, _params, executionOptions = {}) {
      executePlanCalls.push({...executionOptions});
      return {success: true, affectedRows: 1, rows: [], retryCount: 0};
    },
  };
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    transactionCoordinator,
    distributedWriteCoordinator,
  });
  return {engine, executePlanCalls, participantCalls, transactionCoordinator};
}

const UPDATE_SQL =
  'UPDATE users SET status = \'active\' WHERE id = \'alice\'';

test('transaction-owned mode - one participant autocommits without begin',
  async (t) => {
    const {engine, executePlanCalls, participantCalls} =
      buildEngineHarness(['p1']);

    const result = await engine.executeQuery(UPDATE_SQL, [], {
      commitMode: COMMIT_MODE.TWO_PHASE_COMMIT,
    });

    t.equal(result.success, true);
    t.equal(executePlanCalls.length, 1);
    t.same(participantCalls, [],
      'caller mode is ignored and direct autocommit opens no participant');
  });

test('transaction-owned mode - active explicit write always enlists and uses 1PC',
  async (t) => {
    const {
      engine,
      participantCalls,
      transactionCoordinator,
    } = buildEngineHarness(['p1']);
    await transactionCoordinator.begin('explicit-one');

    const writeResult = await engine.executeQuery(UPDATE_SQL, [], {
      sessionId: 'explicit-one',
      transactionMode: 'AUTOCOMMIT',
    });
    const commitResult = await transactionCoordinator.commit('explicit-one');

    t.equal(writeResult.success, true);
    t.equal(commitResult.commitMode, COMMIT_MODE.ONE_PHASE_COMMIT);
    t.equal(participantCalls.some((call) => call.startsWith('prepare:')), false);
    t.same(participantCalls, [
      'begin:explicit-one:p1',
      'commit:explicit-one:p1',
    ]);
  });

test('transaction-owned mode - post-plan multi participant autocommit uses 2PC',
  async (t) => {
    const {engine, participantCalls} = buildEngineHarness(['p1', 'p2']);

    const result = await engine.executeQuery(UPDATE_SQL);

    t.equal(result.success, true);
    t.equal(result.transaction.commitMode, COMMIT_MODE.TWO_PHASE_COMMIT);
    t.equal(participantCalls.filter((call) => call.startsWith('begin:')).length, 2);
    t.equal(
      participantCalls.filter((call) => call.startsWith('prepare:')).length,
      2,
    );
    t.equal(participantCalls.filter((call) => call.startsWith('commit:')).length, 2);
  });

test('transaction-owned mode - failed freeze persistence blocks participant commit',
  async (t) => {
    let participantCommitCount = 0;
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        if (
          mutation?.row?.participant_set_state ===
            PARTICIPANT_SET_STATE.FROZEN
        ) {
          return {success: false, error: 'freeze persistence rejected'};
        }
        return {success: true};
      },
    };
    const engine = new SQLQueryEngine({
      controlPlaneSystemTableGateway: gateway,
    });
    const coordinator = engine.transactionCoordinator;
    coordinator.beginParticipant = async () => {};
    coordinator.commitParticipant = async () => {
      participantCommitCount += 1;
    };

    await coordinator.begin('persist-fail');
    await coordinator.enlistParticipants('persist-fail', ['p1']);
    await t.rejects(
      coordinator.commit('persist-fail'),
      /freeze persistence rejected/u,
    );
    t.equal(participantCommitCount, 0,
      'participant commit must not run without a durable frozen decision');
    t.equal(
      coordinator.getTransaction('persist-fail').participantSetState,
      PARTICIPANT_SET_STATE.OPEN,
      'failed freeze persistence must restore the open in-memory decision',
    );
  });

test('transaction-owned mode - ambiguous 1PC outcome lookup carries exact epoch',
  async (t) => {
    const engine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
    });
    const outcomeRequests = [];
    engine.deliverTransactionOperation = async (
      sessionId,
      partitionId,
      operation,
      options = {},
    ) => {
      if (operation === QUERY_OPERATION.COMMIT) {
        const error = new Error(QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT);
        error.errorCode = QUERY_ERROR_CODE.NO_TRANSACTION;
        throw error;
      }
      if (operation === QUERY_OPERATION.TRANSACTION_OUTCOME) {
        outcomeRequests.push({sessionId, partitionId, ...options});
        return {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED};
      }
      return {success: true};
    };

    const begin = await engine.transactionCoordinator.begin('epoch-outcome');
    await engine.transactionCoordinator.enlistParticipants(
      'epoch-outcome',
      ['p1'],
    );
    const commit = await engine.transactionCoordinator.commit('epoch-outcome');

    t.equal(commit.success, true);
    t.same(outcomeRequests, [{
      sessionId: 'epoch-outcome',
      partitionId: 'p1',
      transactionEpoch: begin.transactionEpoch,
    }]);
  });
