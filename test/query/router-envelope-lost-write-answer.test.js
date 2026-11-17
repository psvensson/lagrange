// A resolved router failure after submission is still an uncertain write.
// The real query redelivery owner must keep that debt under the original entry.
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {QUERY_RESPONSE_TYPE} from '../../src/query/query-constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {ROUTER_CONNECTION_CLOSED_ERROR_CODE, ROUTER_MESSAGE_TIMEOUT_ERROR_CODE} from
  '../../src/transport/transport-error-codes.js';
import {createMockSystemCache} from './query-executor-test-support.js';
import {resolveFailureSqlState} from '../../src/runtime/pgwire-result-mapper.js';
import {
  PG_BACKEND_MSG,
  PG_ERROR_CODE,
  PG_TRANSACTION_STATE,
} from '../../src/runtime/pgwire-protocol-constants.js';
import {answerFailedStatement} from '../../src/runtime/pgwire-transaction-outcome.js';
import {PgWireSession} from '../../src/runtime/pgwire-session.js';
import {DistributedWriteCoordinator} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {SQLParser} from '../../src/query/sql-parser.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
const PARTITION = 'q6-write';
const ENTRY = 'q6-original-entry';
const BUDGET_MS = 50;
const REDIRECT_ADDRESS = 'other-node/partition/q6-write';

for (const errorCode of [ROUTER_CONNECTION_CLOSED_ERROR_CODE, ROUTER_MESSAGE_TIMEOUT_ERROR_CODE]) {
  for (const redirect of [false, true]) {
    for (const beforeSend of [false, true]) {
      test(`Q6 resolved ${errorCode} preserves submission facts (redirect=${redirect}, beforeSend=${beforeSend})`, async (t) => {
        ConfigurationManager.getInstance().initialize();
        let now = 1000;
        const entries = [];
        const executor = new QueryExecutor({
          controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
          nodeId: 'test-node', systemCache: createMockSystemCache([PARTITION]),
          messageRouter: {
            async deliver(_address, request) {
              entries.push(request.entryId);
              if (redirect && entries.length === 1) {
                return buildDeliveryEnvelope({acknowledged: true}, {
                  redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
                  leaderAddress: REDIRECT_ADDRESS,
                });
              }
              now += BUDGET_MS;
              return buildDeliveryEnvelope({errorCode, error: 'answer lost', deferRetry: true,
                recoverableBeforeSend: beforeSend});
            },
          },
        });
        executor.nowFn = () => now;
        executor.delay = async (ms) => {
          now += ms;
        };
        const result = await executor.executeOnPartition(PARTITION,
          'UPDATE users SET n = n + 1', [], false, true, false,
          {entryId: ENTRY, timeoutMs: BUDGET_MS});
        t.equal(entries.length, redirect ? 2 : 1, 'the transport failure was reached');
        t.same([...new Set(entries)], [ENTRY], 'every delivery carries the same entry');
        if (beforeSend) {
          t.not(result.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
            'a router-proven pre-send refusal creates no uncertain write');
          return;
        }
        t.equal(result.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
          'a lost answer never reports a definitely failed write');
        t.equal(result.entryId, ENTRY, 'the unresolved answer retains its entry identity');
        t.equal(result.spentWait?.lostAnswers, 1, 'the redelivery owner retained the lost answer');
        t.equal(result.errorCode, null,
          'the router code is the cause of the unknown outcome, never its answer');
        t.not(resolveFailureSqlState(result), PG_ERROR_CODE.TRANSACTION_TIMEOUT,
          'an unresolved write is never answered as a definite rollback (25P04)');
      });
    }
  }
}

// The ErrorResponse fields (by field byte) a PG-wire answer wrote.
function errorResponseFields(buffers) {
  const frames = buffers.filter((buffer) =>
    buffer[0] === PG_BACKEND_MSG.ERROR_RESPONSE);
  return frames.map((frame) => {
    const fields = {};
    for (let offset = 5; frame[offset] !== 0;) {
      const end = frame.indexOf(0, offset + 1);
      fields[String.fromCharCode(frame[offset])] =
        frame.subarray(offset + 1, end).toString('utf8');
      offset = end + 1;
    }
    return fields;
  });
}

// The statement's failed engine result as the PG-wire handler receives it.
function wireFailureOf(result) {
  return Object.assign(new Error(result.error), result,
    {statementType: 'UPDATE'});
}

test('a lost-answer autocommit write answers 08007 end to end: the ' +
  'executor\'s unknown outcome survives the write coordinator and the ' +
  'PG-wire answer', async (t) => {
  ConfigurationManager.getInstance().initialize();
  let now = 1000;
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    nodeId: 'test-node', systemCache: createMockSystemCache([PARTITION]),
    messageRouter: {
      async deliver() {
        now += BUDGET_MS;
        return buildDeliveryEnvelope({errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
          error: 'answer lost', deferRetry: true, recoverableBeforeSend: false});
      },
    },
  });
  executor.nowFn = () => now;
  executor.delay = async (ms) => {
    now += ms;
  };
  const coordinator = new DistributedWriteCoordinator({
    partitionResolver: {resolvePartitionForKey: () => PARTITION},
    queryExecutor: executor,
    getTablePartitions: () => [{partition_id: PARTITION,
      partition_key_start: null, partition_key_end: null}],
    getTableInfo: () => ({primaryKey: 'id'}),
  });
  const ast = new SQLParser('UPDATE users SET n = n + 1 WHERE id = 1').parse();
  const plan = coordinator.createWritePlan(ast, [], {partitionIds: [PARTITION]});
  const result = await coordinator.executePlan(plan, [], {timeoutMs: BUDGET_MS});
  t.equal(result.success, false);
  t.equal(result.participantFailures?.[0]?.failureCode,
    PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
    'the coordinator carries the participant\'s typed unknown outcome');

  const autocommitSession = new PgWireSession({sessionId: 'autocommit'});
  const autocommitFrames = [];
  answerFailedStatement({failure: wireFailureOf(result),
    stateBefore: PG_TRANSACTION_STATE.IDLE, session: autocommitSession,
    write: (frame) => autocommitFrames.push(frame)});
  const [autocommit] = errorResponseFields(autocommitFrames);
  t.equal(autocommit?.C, PG_ERROR_CODE.TRANSACTION_RESOLUTION_UNKNOWN,
    'an autocommit write whose outcome is unknown answers 08007');
  t.match(autocommit?.M, /some changes may have been committed/u);
  t.equal(autocommitSession.getTransactionState(), PG_TRANSACTION_STATE.IDLE);

  // Inside a block the statement only fails the block: what it staged never
  // commits, and the ROLLBACK that ends the block discards it.
  const blockSession = new PgWireSession({sessionId: 'block'});
  blockSession.setTransactionState(PG_TRANSACTION_STATE.IN_TRANSACTION);
  const blockFrames = [];
  answerFailedStatement({failure: wireFailureOf(result),
    stateBefore: PG_TRANSACTION_STATE.IN_TRANSACTION, session: blockSession,
    write: (frame) => blockFrames.push(frame)});
  const [inBlock] = errorResponseFields(blockFrames);
  t.not(inBlock?.C, PG_ERROR_CODE.TRANSACTION_RESOLUTION_UNKNOWN);
  t.not(inBlock?.C, PG_ERROR_CODE.TRANSACTION_TIMEOUT);
  t.equal(blockSession.getTransactionState(), PG_TRANSACTION_STATE.FAILED);
  t.equal(blockSession.takeTransactionOutcomeUnknown(), false,
    'the ROLLBACK ending the block carries no outcome-unknown warning');
});
