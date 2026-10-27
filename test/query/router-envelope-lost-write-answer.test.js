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
      });
    }
  }
}
